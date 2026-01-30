/**
 * Twitter Sentiment Provider
 *
 * Analyzes sentiment from Twitter/X posts for market signals.
 */

import { BaseFinanceProvider, type FinanceProviderConfig } from '../base.js';
import type { SocialPost, SentimentSourceScore, Asset, FinanceProviderResult } from '../../types.js';
import { FINANCE_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface TwitterSentimentConfig extends FinanceProviderConfig {
  bearerTokenEnvVar?: string;
  trackedAccounts?: string[];
  trackedHashtags?: string[];
  minFollowers?: number;
}

interface TwitterTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
}

interface TwitterUser {
  id: string;
  username: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
  };
}

interface TwitterSearchResponse {
  data?: TwitterTweet[];
  includes?: {
    users?: TwitterUser[];
  };
  meta?: {
    result_count: number;
    next_token?: string;
  };
}

// =============================================================================
// Provider Implementation
// =============================================================================

export class TwitterSentimentProvider extends BaseFinanceProvider<TwitterSentimentConfig> {
  private readonly bearerToken: string | undefined;
  private readonly baseUrl = 'https://api.twitter.com/2';

  constructor(config: TwitterSentimentConfig, allowedDomains?: string[]) {
    super(config, allowedDomains ?? ['api.twitter.com']);
    this.bearerToken = config.bearerTokenEnvVar
      ? process.env[config.bearerTokenEnvVar]
      : undefined;
  }

  get name(): string {
    return 'twitter-sentiment';
  }

  get type(): string {
    return 'sentiment';
  }

  protected requiresApiKey(): boolean {
    return false; // Uses bearer token instead
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.bearerToken ?? ''}`,
    };
  }

  /**
   * Search for tweets mentioning an asset
   */
  async searchTweets(
    asset: Asset,
    limit: number = 100
  ): Promise<FinanceProviderResult<SocialPost[]>> {
    this.ensureInitialized();

    const query = this.buildQuery(asset);
    const url = `${this.baseUrl}/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${Math.min(limit, 100)}&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=public_metrics`;

    const result = await this.fetch<TwitterSearchResponse>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const userMap = new Map<string, TwitterUser>();
    if (result.data.includes?.users) {
      for (const user of result.data.includes.users) {
        userMap.set(user.id, user);
      }
    }

    const minFollowers = this.config.minFollowers ?? FINANCE_DEFAULTS.INFLUENCER_MIN_FOLLOWERS;
    const posts: SocialPost[] = [];

    for (const tweet of result.data.data ?? []) {
      const author = userMap.get(tweet.author_id);
      const followers = author?.public_metrics?.followers_count ?? 0;

      // Analyze sentiment of tweet text
      const sentiment = this.analyzeSentiment(tweet.text);

      posts.push({
        id: tweet.id,
        source: 'twitter',
        author: author?.username ?? tweet.author_id,
        authorFollowers: followers,
        content: tweet.text,
        sentiment,
        engagement: {
          likes: tweet.public_metrics?.like_count ?? 0,
          shares: tweet.public_metrics?.retweet_count ?? 0,
          comments: tweet.public_metrics?.reply_count ?? 0,
        },
        isInfluencer: followers >= minFollowers,
        publishedAt: new Date(tweet.created_at).getTime(),
        analyzedAt: Date.now(),
      });
    }

    return {
      success: true,
      data: posts,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get aggregated sentiment score for an asset
   */
  async getSentimentScore(asset: Asset): Promise<FinanceProviderResult<SentimentSourceScore>> {
    const postsResult = await this.searchTweets(asset, 100);

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
          source: 'twitter',
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
      // Weight by engagement and followers
      const engagementScore = Math.log10(
        1 + post.engagement.likes + post.engagement.shares * 2 + post.engagement.comments
      );
      const followerWeight = post.isInfluencer ? 2 : 1;
      const weight = (1 + engagementScore) * followerWeight;

      weightedSum += post.sentiment * weight;
      totalWeight += weight;
    }

    const averageScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Calculate confidence based on sample size and agreement
    const sampleConfidence = Math.min(posts.length / 50, 1);
    const sentimentVariance = this.calculateVariance(posts.map(p => p.sentiment));
    const agreementConfidence = Math.max(0, 1 - sentimentVariance);
    const confidence = (sampleConfidence * 0.4 + agreementConfidence * 0.6);

    // Determine trend direction
    const recentPosts = posts.slice(0, Math.floor(posts.length / 2));
    const olderPosts = posts.slice(Math.floor(posts.length / 2));
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

    // Get significant posts (high engagement or strong sentiment)
    const significantPosts = posts
      .filter(p => Math.abs(p.sentiment) > 0.5 || p.isInfluencer)
      .sort((a, b) => b.engagement.likes - a.engagement.likes)
      .slice(0, 5);

    return {
      success: true,
      data: {
        source: 'twitter',
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
   * Build Twitter search query for an asset
   */
  private buildQuery(asset: Asset): string {
    const terms = [asset];

    // Add common variations
    const variations: Record<string, string[]> = {
      BTC: ['Bitcoin', '#BTC', '$BTC'],
      ETH: ['Ethereum', '#ETH', '$ETH'],
      SOL: ['Solana', '#SOL', '$SOL'],
      XRP: ['Ripple', '#XRP', '$XRP'],
      ADA: ['Cardano', '#ADA', '$ADA'],
      DOGE: ['Dogecoin', '#DOGE', '$DOGE'],
    };

    if (variations[asset]) {
      terms.push(...variations[asset]);
    } else {
      terms.push(`#${asset}`, `$${asset}`);
    }

    // Add tracked hashtags
    if (this.config.trackedHashtags) {
      for (const tag of this.config.trackedHashtags) {
        terms.push(tag.startsWith('#') ? tag : `#${tag}`);
      }
    }

    // Exclude retweets and replies for cleaner data
    return `(${terms.join(' OR ')}) -is:retweet -is:reply lang:en`;
  }

  /**
   * Simple sentiment analysis based on keywords
   * In production, this would use a proper NLP model
   */
  private analyzeSentiment(text: string): number {
    const lowerText = text.toLowerCase();

    const bullishWords = [
      'bullish', 'moon', 'pump', 'buy', 'long', 'hodl', 'hold',
      'breakout', 'rally', 'surge', 'soar', 'gain', 'profit',
      'ath', 'new high', 'all time high', 'green', 'up', 'rising',
      'strong', 'growth', 'accumulate', 'dip buy', 'buying the dip',
      '🚀', '📈', '💎', '🔥', '💰', '🐂',
    ];

    const bearishWords = [
      'bearish', 'dump', 'crash', 'sell', 'short', 'drop',
      'plunge', 'tank', 'decline', 'loss', 'fall', 'down',
      'red', 'weak', 'fear', 'panic', 'correction', 'bubble',
      'scam', 'rug', 'dead', 'rekt', 'liquidated',
      '📉', '🐻', '💀', '😱',
    ];

    let bullishCount = 0;
    let bearishCount = 0;

    for (const word of bullishWords) {
      if (lowerText.includes(word)) {
        bullishCount++;
      }
    }

    for (const word of bearishWords) {
      if (lowerText.includes(word)) {
        bearishCount++;
      }
    }

    const total = bullishCount + bearishCount;
    if (total === 0) {
      return 0; // Neutral
    }

    // Return value between -1 and 1
    return (bullishCount - bearishCount) / total;
  }

  /**
   * Calculate variance of an array of numbers
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTwitterSentimentProvider(
  config: TwitterSentimentConfig,
  allowedDomains?: string[]
): TwitterSentimentProvider {
  return new TwitterSentimentProvider(config, allowedDomains);
}
