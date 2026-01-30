/**
 * News Sentiment Provider
 *
 * Analyzes sentiment from news articles for market signals.
 */

import { BaseFinanceProvider, type FinanceProviderConfig } from '../base.js';
import type { SocialPost, SentimentSourceScore, Asset, FinanceProviderResult } from '../../types.js';

// =============================================================================
// Types
// =============================================================================

export interface NewsSentimentConfig extends FinanceProviderConfig {
  sources?: string[];
  excludeSources?: string[];
  languages?: string[];
}

interface NewsArticle {
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  publishedAt: string;
  content: string | null;
}

interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsArticle[];
}

// =============================================================================
// Provider Implementation
// =============================================================================

export class NewsSentimentProvider extends BaseFinanceProvider<NewsSentimentConfig> {
  private readonly baseUrl = 'https://newsapi.org/v2';

  constructor(config: NewsSentimentConfig, allowedDomains?: string[]) {
    super(config, allowedDomains ?? ['newsapi.org']);
  }

  get name(): string {
    return 'news-sentiment';
  }

  get type(): string {
    return 'sentiment';
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'X-Api-Key': this.apiKey ?? '',
    };
  }

  /**
   * Search for news articles about an asset
   */
  async searchNews(
    asset: Asset,
    limit: number = 100
  ): Promise<FinanceProviderResult<SocialPost[]>> {
    this.ensureInitialized();

    const query = this.buildQuery(asset);
    const languages = (this.config.languages ?? ['en']).join(',');

    let url = `${this.baseUrl}/everything?q=${encodeURIComponent(query)}&language=${languages}&sortBy=publishedAt&pageSize=${Math.min(limit, 100)}`;

    if (this.config.sources?.length) {
      url += `&sources=${this.config.sources.join(',')}`;
    }

    const result = await this.fetch<NewsAPIResponse>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    if (result.data.status !== 'ok') {
      return {
        success: false,
        error: 'News API returned error status',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const excludeSources = new Set(this.config.excludeSources ?? []);
    const posts: SocialPost[] = [];

    for (const article of result.data.articles) {
      if (article.source.id && excludeSources.has(article.source.id)) {
        continue;
      }

      const content = [article.title, article.description, article.content]
        .filter(Boolean)
        .join(' ');

      const sentiment = this.analyzeSentiment(content);

      // News sources are generally treated as influential
      const isInfluencer = this.isMainstreamSource(article.source.name);

      posts.push({
        id: article.url,
        source: 'news',
        author: article.source.name,
        content: article.title + (article.description ? `\n${article.description}` : ''),
        sentiment,
        engagement: {
          likes: 0, // News doesn't have likes
          shares: 0,
          comments: 0,
        },
        isInfluencer,
        publishedAt: new Date(article.publishedAt).getTime(),
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
    const postsResult = await this.searchNews(asset, 100);

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
          source: 'news',
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
    // Weight mainstream sources higher
    let totalWeight = 0;
    let weightedSum = 0;

    for (const post of posts) {
      const weight = post.isInfluencer ? 2 : 1;
      weightedSum += post.sentiment * weight;
      totalWeight += weight;
    }

    const averageScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Calculate confidence
    const sampleConfidence = Math.min(posts.length / 20, 1);
    const sentimentVariance = this.calculateVariance(posts.map(p => p.sentiment));
    const agreementConfidence = Math.max(0, 1 - sentimentVariance);
    const confidence = sampleConfidence * 0.4 + agreementConfidence * 0.6;

    // Determine trend direction
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

    // Get significant posts (from mainstream sources or strong sentiment)
    const significantPosts = posts
      .filter(p => Math.abs(p.sentiment) > 0.5 || p.isInfluencer)
      .slice(0, 5);

    return {
      success: true,
      data: {
        source: 'news',
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
      SOL: ['Solana'],
      XRP: ['Ripple', 'XRP'],
      DOGE: ['Dogecoin'],
    };

    const terms = variations[asset] ?? [asset];
    // Add crypto/cryptocurrency context
    return `(${terms.join(' OR ')}) AND (crypto OR cryptocurrency OR blockchain OR digital currency)`;
  }

  /**
   * Check if source is a mainstream publication
   */
  private isMainstreamSource(sourceName: string): boolean {
    const mainstreamSources = [
      'reuters', 'bloomberg', 'cnbc', 'wsj', 'wall street journal',
      'financial times', 'ft', 'forbes', 'fortune', 'bbc',
      'cnn', 'nytimes', 'new york times', 'washington post',
      'coindesk', 'cointelegraph', 'the block', 'decrypt',
    ];

    const lowerName = sourceName.toLowerCase();
    return mainstreamSources.some(source => lowerName.includes(source));
  }

  /**
   * Sentiment analysis for news articles
   */
  private analyzeSentiment(text: string): number {
    const lowerText = text.toLowerCase();

    const bullishWords = [
      'surge', 'soar', 'rally', 'gain', 'rise', 'jump',
      'breakthrough', 'bullish', 'optimistic', 'positive',
      'adoption', 'institutional', 'growth', 'milestone',
      'approval', 'etf', 'mainstream', 'record high',
      'investment', 'backing', 'support',
    ];

    const bearishWords = [
      'crash', 'plunge', 'tumble', 'drop', 'fall', 'decline',
      'bearish', 'pessimistic', 'negative', 'concern', 'worry',
      'ban', 'regulation', 'crackdown', 'investigation',
      'hack', 'breach', 'fraud', 'scam', 'collapse',
      'lawsuit', 'sec', 'warning', 'risk',
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

export function createNewsSentimentProvider(
  config: NewsSentimentConfig,
  allowedDomains?: string[]
): NewsSentimentProvider {
  return new NewsSentimentProvider(config, allowedDomains);
}
