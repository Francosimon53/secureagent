/**
 * Content Creator Suite - Trend Aggregator
 *
 * Aggregates trends from multiple sources into unified insights.
 */

import type {
  TrendItem,
  TrendSource,
  TrendAggregation,
  ContentProviderResult,
} from '../../types.js';
import type { TrendStore } from '../../stores/trend-store.js';
import type { TwitterTrendsProvider } from '../../providers/trends/twitter-trends.js';
import type { RedditProvider } from '../../providers/trends/reddit.js';
import type { HackerNewsProvider } from '../../providers/trends/hackernews.js';
import { CONTENT_EVENTS, CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface TrendProviders {
  twitter?: TwitterTrendsProvider;
  reddit?: RedditProvider;
  hackernews?: HackerNewsProvider;
}

export interface AggregatorConfig {
  refreshIntervalMinutes: number;
  maxTrendsPerSource: number;
  cacheTTLMinutes: number;
}

export interface AggregatedTrends {
  all: TrendItem[];
  bySource: Record<TrendSource, TrendItem[]>;
  byCategory: Record<string, TrendItem[]>;
  topTrending: TrendItem[];
  emerging: TrendItem[];
  crossPlatform: TrendItem[];
}

// =============================================================================
// Trend Aggregator Service
// =============================================================================

export class TrendAggregatorService {
  private lastFetchTime = 0;
  private cachedTrends: TrendItem[] = [];
  private eventHandlers = new Map<string, Set<(data: unknown) => void>>();

  constructor(
    private readonly store: TrendStore,
    private readonly providers: TrendProviders,
    private readonly config: AggregatorConfig
  ) {}

  /**
   * Fetch and aggregate trends from all sources
   */
  async fetchTrends(force: boolean = false): Promise<AggregatedTrends> {
    const now = Date.now();
    const cacheExpiry = this.lastFetchTime + this.config.cacheTTLMinutes * 60 * 1000;

    // Return cached data if still valid
    if (!force && now < cacheExpiry && this.cachedTrends.length > 0) {
      return this.aggregateTrends(this.cachedTrends);
    }

    const allTrends: TrendItem[] = [];

    // Fetch from each provider in parallel
    const fetchPromises: Promise<ContentProviderResult<TrendItem[]>>[] = [];

    if (this.providers.twitter) {
      fetchPromises.push(
        this.providers.twitter.getTrends().catch(err => ({
          success: false as const,
          error: err.message,
          cached: false,
          fetchedAt: Date.now(),
        }))
      );
    }

    if (this.providers.reddit) {
      fetchPromises.push(
        this.providers.reddit.getTrends({ limit: this.config.maxTrendsPerSource }).catch(err => ({
          success: false as const,
          error: err.message,
          cached: false,
          fetchedAt: Date.now(),
        }))
      );
    }

    if (this.providers.hackernews) {
      fetchPromises.push(
        this.providers.hackernews.getTrends({ limit: this.config.maxTrendsPerSource }).catch(err => ({
          success: false as const,
          error: err.message,
          cached: false,
          fetchedAt: Date.now(),
        }))
      );
    }

    const results = await Promise.all(fetchPromises);

    for (const result of results) {
      if (result.success) {
        allTrends.push(...result.data);
      }
    }

    // Save to store
    if (allTrends.length > 0) {
      await this.store.saveTrends(allTrends);
    }

    // Update cache
    this.cachedTrends = allTrends;
    this.lastFetchTime = now;

    this.emit(CONTENT_EVENTS.TRENDS_FETCHED, {
      totalTrends: allTrends.length,
      sources: Object.keys(this.providers).filter(k => this.providers[k as keyof TrendProviders]),
    });

    return this.aggregateTrends(allTrends);
  }

  /**
   * Get trends from cache or store
   */
  async getTrends(options?: {
    sources?: TrendSource[];
    category?: string;
    limit?: number;
  }): Promise<AggregatedTrends> {
    // Check cache first
    if (this.cachedTrends.length > 0) {
      let filtered = [...this.cachedTrends];

      if (options?.sources) {
        filtered = filtered.filter(t => options.sources!.includes(t.source));
      }
      if (options?.category) {
        filtered = filtered.filter(t => t.category === options.category);
      }
      if (options?.limit) {
        filtered = filtered.slice(0, options.limit);
      }

      return this.aggregateTrends(filtered);
    }

    // Fall back to store
    const storedTrends = await this.store.getTrends({
      sources: options?.sources,
      category: options?.category,
      limit: options?.limit ?? 100,
    });

    return this.aggregateTrends(storedTrends);
  }

  /**
   * Search trends by keywords
   */
  async searchTrends(keywords: string[]): Promise<TrendItem[]> {
    // First check cache
    const cachedResults = this.searchInCache(keywords);

    // Also search each provider
    const searchPromises: Promise<ContentProviderResult<TrendItem[]>>[] = [];

    if (this.providers.twitter) {
      searchPromises.push(this.providers.twitter.searchTrends(keywords));
    }
    if (this.providers.reddit) {
      searchPromises.push(this.providers.reddit.searchTrends(keywords));
    }
    if (this.providers.hackernews) {
      searchPromises.push(this.providers.hackernews.searchTrends(keywords));
    }

    const results = await Promise.all(searchPromises);

    const allResults = [...cachedResults];
    for (const result of results) {
      if (result.success) {
        allResults.push(...result.data);
      }
    }

    // Deduplicate by title similarity
    return this.deduplicateTrends(allResults);
  }

  /**
   * Get trending topics within a specific category
   */
  async getCategoryTrends(category: string, limit: number = 20): Promise<TrendItem[]> {
    const allTrends = await this.getTrends();
    return allTrends.byCategory[category]?.slice(0, limit) ?? [];
  }

  /**
   * Get cross-platform trends (topics appearing on multiple platforms)
   */
  async getCrossPlatformTrends(): Promise<TrendItem[]> {
    const allTrends = await this.getTrends();
    return allTrends.crossPlatform;
  }

  /**
   * Get emerging trends (high velocity, recent)
   */
  async getEmergingTrends(limit: number = 10): Promise<TrendItem[]> {
    const allTrends = await this.getTrends();
    return allTrends.emerging.slice(0, limit);
  }

  /**
   * Generate a trend aggregation report
   */
  async generateAggregation(
    userId: string,
    period: 'hourly' | 'daily' | 'weekly'
  ): Promise<TrendAggregation> {
    const trends = await this.fetchTrends(true);

    // Calculate top categories
    const categoryCount = new Map<string, number>();
    for (const trend of trends.all) {
      if (trend.category) {
        categoryCount.set(trend.category, (categoryCount.get(trend.category) ?? 0) + 1);
      }
    }

    const topCategories = Array.from(categoryCount.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Identify emerging topics (high velocity, fresh)
    const emergingTopics = trends.emerging
      .slice(0, 10)
      .map(t => t.title);

    const aggregation = await this.store.saveAggregation({
      userId,
      period,
      sources: Object.keys(this.providers).filter(
        k => this.providers[k as keyof TrendProviders]
      ) as TrendSource[],
      trends: trends.topTrending.slice(0, 50),
      topCategories,
      emergingTopics,
      generatedAt: Date.now(),
    });

    return aggregation;
  }

  /**
   * Aggregate trends into structured categories
   */
  private aggregateTrends(trends: TrendItem[]): AggregatedTrends {
    const bySource: Record<TrendSource, TrendItem[]> = {
      twitter: [],
      reddit: [],
      hackernews: [],
      google: [],
      youtube: [],
    };

    const byCategory: Record<string, TrendItem[]> = {};

    // Categorize trends
    for (const trend of trends) {
      bySource[trend.source].push(trend);

      if (trend.category) {
        if (!byCategory[trend.category]) {
          byCategory[trend.category] = [];
        }
        byCategory[trend.category].push(trend);
      }
    }

    // Sort each category by velocity
    for (const source of Object.keys(bySource) as TrendSource[]) {
      bySource[source].sort((a, b) => b.velocity - a.velocity);
    }
    for (const category of Object.keys(byCategory)) {
      byCategory[category].sort((a, b) => b.velocity - a.velocity);
    }

    // Find cross-platform trends
    const crossPlatform = this.findCrossPlatformTrends(trends);

    // Find emerging trends (high velocity, recent fetch time)
    const emerging = [...trends]
      .filter(t => t.velocity >= 50)
      .sort((a, b) => b.velocity - a.velocity)
      .slice(0, 20);

    // Top trending overall
    const topTrending = [...trends]
      .sort((a, b) => b.velocity - a.velocity)
      .slice(0, 50);

    return {
      all: trends,
      bySource,
      byCategory,
      topTrending,
      emerging,
      crossPlatform,
    };
  }

  /**
   * Find trends appearing on multiple platforms
   */
  private findCrossPlatformTrends(trends: TrendItem[]): TrendItem[] {
    const titleMap = new Map<string, TrendItem[]>();

    for (const trend of trends) {
      const normalizedTitle = this.normalizeTitle(trend.title);

      // Check for similar titles
      let matched = false;
      for (const [existingTitle, group] of titleMap) {
        if (this.titlesAreSimilar(normalizedTitle, existingTitle)) {
          group.push(trend);
          matched = true;
          break;
        }
      }

      if (!matched) {
        titleMap.set(normalizedTitle, [trend]);
      }
    }

    // Return trends that appear on multiple platforms
    const crossPlatform: TrendItem[] = [];
    for (const group of titleMap.values()) {
      const uniqueSources = new Set(group.map(t => t.source));
      if (uniqueSources.size > 1) {
        // Use the one with highest velocity
        const best = group.reduce((a, b) => (a.velocity > b.velocity ? a : b));
        crossPlatform.push({
          ...best,
          relatedTopics: [...(best.relatedTopics ?? []), ...Array.from(uniqueSources)],
        });
      }
    }

    return crossPlatform.sort((a, b) => b.velocity - a.velocity);
  }

  /**
   * Normalize a title for comparison
   */
  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if two titles are similar
   */
  private titlesAreSimilar(title1: string, title2: string): boolean {
    // Simple word overlap check
    const words1 = new Set(title1.split(' '));
    const words2 = new Set(title2.split(' '));

    const intersection = [...words1].filter(w => words2.has(w));
    const union = new Set([...words1, ...words2]);

    const similarity = intersection.length / union.size;
    return similarity >= 0.5;
  }

  /**
   * Search for keywords in cache
   */
  private searchInCache(keywords: string[]): TrendItem[] {
    const keywordsLower = keywords.map(k => k.toLowerCase());

    return this.cachedTrends.filter(trend => {
      const title = trend.title.toLowerCase();
      const description = (trend.description ?? '').toLowerCase();
      return keywordsLower.some(
        keyword => title.includes(keyword) || description.includes(keyword)
      );
    });
  }

  /**
   * Deduplicate trends by title similarity
   */
  private deduplicateTrends(trends: TrendItem[]): TrendItem[] {
    const seen = new Map<string, TrendItem>();

    for (const trend of trends) {
      const normalizedTitle = this.normalizeTitle(trend.title);

      let isDuplicate = false;
      for (const [existingTitle, existingTrend] of seen) {
        if (this.titlesAreSimilar(normalizedTitle, existingTitle)) {
          // Keep the one with higher velocity
          if (trend.velocity > existingTrend.velocity) {
            seen.delete(existingTitle);
            seen.set(normalizedTitle, trend);
          }
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        seen.set(normalizedTitle, trend);
      }
    }

    return Array.from(seen.values()).sort((a, b) => b.velocity - a.velocity);
  }

  /**
   * Clean up expired trends
   */
  async cleanupExpired(): Promise<number> {
    const deleted = await this.store.deleteExpiredTrends();

    // Also clean cache
    const now = Date.now();
    this.cachedTrends = this.cachedTrends.filter(t => t.expiresAt > now);

    return deleted;
  }

  /**
   * Subscribe to events
   */
  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Emit an event
   */
  private emit(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTrendAggregator(
  store: TrendStore,
  providers: TrendProviders,
  config?: Partial<AggregatorConfig>
): TrendAggregatorService {
  const defaultConfig: AggregatorConfig = {
    refreshIntervalMinutes: CONTENT_DEFAULTS.TREND_CACHE_TTL,
    maxTrendsPerSource: 25,
    cacheTTLMinutes: CONTENT_DEFAULTS.TREND_CACHE_TTL,
    ...config,
  };

  return new TrendAggregatorService(store, providers, defaultConfig);
}
