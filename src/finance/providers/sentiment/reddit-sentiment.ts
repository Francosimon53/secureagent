/**
 * Reddit Sentiment Provider
 *
 * Analyzes sentiment from Reddit posts and comments for market signals.
 */

import { BaseFinanceProvider, type FinanceProviderConfig } from '../base.js';
import type { SocialPost, SentimentSourceScore, Asset, FinanceProviderResult } from '../../types.js';

// =============================================================================
// Types
// =============================================================================

export interface RedditSentimentConfig extends FinanceProviderConfig {
  clientIdEnvVar?: string;
  clientSecretEnvVar?: string;
  subreddits?: string[];
  minUpvotes?: number;
}

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  created_utc: number;
  upvote_ratio: number;
  permalink: string;
}

interface RedditComment {
  id: string;
  body: string;
  author: string;
  score: number;
  created_utc: number;
}

interface RedditSearchResponse {
  data: {
    children: Array<{ data: RedditPost }>;
    after?: string;
  };
}

interface RedditAccessToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// =============================================================================
// Provider Implementation
// =============================================================================

export class RedditSentimentProvider extends BaseFinanceProvider<RedditSentimentConfig> {
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly baseUrl = 'https://oauth.reddit.com';
  private readonly authUrl = 'https://www.reddit.com/api/v1/access_token';
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(config: RedditSentimentConfig, allowedDomains?: string[]) {
    super(config, allowedDomains ?? ['oauth.reddit.com', 'www.reddit.com']);
    this.clientId = config.clientIdEnvVar ? process.env[config.clientIdEnvVar] : undefined;
    this.clientSecret = config.clientSecretEnvVar
      ? process.env[config.clientSecretEnvVar]
      : undefined;
  }

  get name(): string {
    return 'reddit-sentiment';
  }

  get type(): string {
    return 'sentiment';
  }

  protected requiresApiKey(): boolean {
    return false; // Uses OAuth
  }

  /**
   * Authenticate with Reddit API
   */
  private async authenticate(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiry - 60000) {
      return; // Token still valid
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Reddit client credentials not configured');
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(this.authUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SecureAgent/1.0',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new Error(`Reddit auth failed: ${response.status}`);
    }

    const data = (await response.json()) as RedditAccessToken;
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000;
  }

  /**
   * Make authenticated request to Reddit
   */
  private async redditFetch<T>(path: string): Promise<FinanceProviderResult<T>> {
    await this.authenticate();

    return this.fetch<T>(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'User-Agent': 'SecureAgent/1.0',
      },
    });
  }

  /**
   * Search Reddit for posts about an asset
   */
  async searchPosts(
    asset: Asset,
    limit: number = 100
  ): Promise<FinanceProviderResult<SocialPost[]>> {
    this.ensureInitialized();

    const subreddits = this.config.subreddits ?? ['cryptocurrency', 'bitcoin', 'ethereum'];
    const allPosts: SocialPost[] = [];

    for (const subreddit of subreddits) {
      const query = this.buildQuery(asset);
      const path = `/r/${subreddit}/search?q=${encodeURIComponent(query)}&sort=hot&limit=${Math.min(limit, 100)}&restrict_sr=on&t=day`;

      const result = await this.redditFetch<RedditSearchResponse>(path);

      if (!result.success || !result.data) {
        continue; // Skip failed subreddits
      }

      const minUpvotes = this.config.minUpvotes ?? 10;

      for (const child of result.data.data.children) {
        const post = child.data;

        if (post.score < minUpvotes) {
          continue;
        }

        const sentiment = this.analyzeSentiment(post.title + ' ' + post.selftext);

        allPosts.push({
          id: post.id,
          source: 'reddit',
          author: post.author,
          content: post.title + (post.selftext ? `\n${post.selftext}` : ''),
          sentiment,
          engagement: {
            likes: post.score,
            shares: 0,
            comments: post.num_comments,
          },
          isInfluencer: post.score > 1000, // High karma posts
          publishedAt: post.created_utc * 1000,
          analyzedAt: Date.now(),
        });
      }
    }

    return {
      success: true,
      data: allPosts,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get aggregated sentiment score for an asset
   */
  async getSentimentScore(asset: Asset): Promise<FinanceProviderResult<SentimentSourceScore>> {
    const postsResult = await this.searchPosts(asset, 100);

    if (!postsResult.success || !postsResult.data) {
      return {
        success: false,
        error: postsResult.error,
        errorCode: postsResult.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const posts = postsResult.data;

    if (posts.length === 0) {
      return {
        success: true,
        data: {
          source: 'reddit',
          score: 0,
          confidence: 0,
          sampleSize: 0,
          trendDirection: 'stable',
          significantPosts: [],
        },
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    // Calculate weighted average sentiment
    let totalWeight = 0;
    let weightedSum = 0;

    for (const post of posts) {
      // Weight by score and comments
      const weight = Math.log10(1 + post.engagement.likes + post.engagement.comments * 2);
      weightedSum += post.sentiment * weight;
      totalWeight += weight;
    }

    const averageScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Calculate confidence
    const sampleConfidence = Math.min(posts.length / 30, 1);
    const sentimentVariance = this.calculateVariance(posts.map(p => p.sentiment));
    const agreementConfidence = Math.max(0, 1 - sentimentVariance);
    const confidence = sampleConfidence * 0.4 + agreementConfidence * 0.6;

    // Determine trend
    const sortedPosts = [...posts].sort((a, b) => b.publishedAt - a.publishedAt);
    const recentPosts = sortedPosts.slice(0, Math.floor(sortedPosts.length / 2));
    const olderPosts = sortedPosts.slice(Math.floor(sortedPosts.length / 2));

    const recentAvg = recentPosts.length > 0
      ? recentPosts.reduce((sum, p) => sum + p.sentiment, 0) / recentPosts.length
      : 0;
    const olderAvg = olderPosts.length > 0
      ? olderPosts.reduce((sum, p) => sum + p.sentiment, 0) / olderPosts.length
      : 0;

    let trendDirection: 'improving' | 'stable' | 'declining' = 'stable';
    if (recentAvg > olderAvg + 0.1) {
      trendDirection = 'improving';
    } else if (recentAvg < olderAvg - 0.1) {
      trendDirection = 'declining';
    }

    // Get significant posts
    const significantPosts = posts
      .filter(p => Math.abs(p.sentiment) > 0.5 || p.engagement.likes > 500)
      .sort((a, b) => b.engagement.likes - a.engagement.likes)
      .slice(0, 5);

    return {
      success: true,
      data: {
        source: 'reddit',
        score: averageScore,
        confidence,
        sampleSize: posts.length,
        trendDirection,
        significantPosts,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Build search query for an asset
   */
  private buildQuery(asset: Asset): string {
    const variations: Record<string, string[]> = {
      BTC: ['Bitcoin', 'BTC'],
      ETH: ['Ethereum', 'ETH'],
      SOL: ['Solana', 'SOL'],
      XRP: ['Ripple', 'XRP'],
      ADA: ['Cardano', 'ADA'],
      DOGE: ['Dogecoin', 'DOGE'],
    };

    const terms = variations[asset] ?? [asset];
    return terms.join(' OR ');
  }

  /**
   * Simple sentiment analysis
   */
  private analyzeSentiment(text: string): number {
    const lowerText = text.toLowerCase();

    const bullishWords = [
      'bullish', 'moon', 'pump', 'buy', 'long', 'hodl',
      'breakout', 'rally', 'surge', 'gain', 'profit',
      'undervalued', 'accumulate', 'opportunity', 'growth',
      'adoption', 'mainstream', 'institutional',
    ];

    const bearishWords = [
      'bearish', 'dump', 'crash', 'sell', 'short',
      'plunge', 'tank', 'decline', 'loss', 'fall',
      'overvalued', 'bubble', 'scam', 'ponzi', 'dead',
      'regulation', 'ban', 'crackdown',
    ];

    let bullishCount = 0;
    let bearishCount = 0;

    for (const word of bullishWords) {
      if (lowerText.includes(word)) bullishCount++;
    }

    for (const word of bearishWords) {
      if (lowerText.includes(word)) bearishCount++;
    }

    const total = bullishCount + bearishCount;
    if (total === 0) return 0;

    return (bullishCount - bearishCount) / total;
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createRedditSentimentProvider(
  config: RedditSentimentConfig,
  allowedDomains?: string[]
): RedditSentimentProvider {
  return new RedditSentimentProvider(config, allowedDomains);
}
