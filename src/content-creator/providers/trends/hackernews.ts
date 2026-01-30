/**
 * Content Creator Suite - HackerNews Trends Provider
 *
 * Fetches trending stories from Hacker News.
 */

import { BaseContentProvider } from '../base.js';
import type { ContentProviderResult, TrendItem } from '../../types.js';
import { API_ENDPOINTS, CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

interface HackerNewsConfig {
  minScore: number;
  categories: ('top' | 'new' | 'best' | 'ask' | 'show')[];
  timeout: number;
  rateLimitPerMinute: number;
}

interface HackerNewsItem {
  id: number;
  deleted?: boolean;
  type: 'job' | 'story' | 'comment' | 'poll' | 'pollopt';
  by?: string;
  time: number;
  text?: string;
  dead?: boolean;
  parent?: number;
  poll?: number;
  kids?: number[];
  url?: string;
  score?: number;
  title?: string;
  parts?: number[];
  descendants?: number;
}

// =============================================================================
// HackerNews Provider
// =============================================================================

type HackerNewsSourceConfig = {
  enabled?: boolean;
  minScore?: number;
  categories?: ('top' | 'new' | 'best' | 'ask' | 'show')[];
};

export class HackerNewsProvider extends BaseContentProvider<HackerNewsConfig> {
  constructor(config?: HackerNewsSourceConfig) {
    const providerConfig: HackerNewsConfig = {
      minScore: config?.minScore ?? 50,
      categories: config?.categories ?? ['top', 'best'],
      timeout: CONTENT_DEFAULTS.API_TIMEOUT,
      rateLimitPerMinute: 100, // HN API is quite permissive
    };
    super(providerConfig);
  }

  get name(): string {
    return 'hackernews';
  }

  get type(): string {
    return 'trends';
  }

  protected requiresApiKey(): boolean {
    return false; // HN API doesn't require authentication
  }

  /**
   * Get trending stories
   */
  async getTrends(options?: {
    category?: 'top' | 'new' | 'best' | 'ask' | 'show';
    limit?: number;
    minScore?: number;
  }): Promise<ContentProviderResult<TrendItem[]>> {
    const categories = options?.category ? [options.category] : this.config.categories;
    const limit = options?.limit ?? 30;
    const minScore = options?.minScore ?? this.config.minScore;

    const allTrends: TrendItem[] = [];
    const now = Date.now();
    const expiresAt = now + CONTENT_DEFAULTS.TREND_CACHE_TTL * 60 * 1000;

    for (const category of categories) {
      const stories = await this.getCategoryStories(category, limit);
      if (stories.success) {
        const filteredStories = stories.data.filter(s => (s.score ?? 0) >= minScore);
        allTrends.push(
          ...filteredStories.map((story, index) =>
            this.storyToTrend(story, category, index, expiresAt)
          )
        );
      }
    }

    // Sort by velocity (engagement rate)
    allTrends.sort((a, b) => b.velocity - a.velocity);

    // Remove duplicates (same story might appear in multiple categories)
    const seen = new Set<number>();
    const uniqueTrends = allTrends.filter(trend => {
      const id = parseInt(trend.id, 10);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    return {
      success: true,
      data: uniqueTrends,
      cached: false,
      fetchedAt: now,
    };
  }

  /**
   * Get story IDs for a category
   */
  private async getCategoryStoryIds(
    category: 'top' | 'new' | 'best' | 'ask' | 'show'
  ): Promise<ContentProviderResult<number[]>> {
    const endpoints: Record<string, string> = {
      top: API_ENDPOINTS.hackernews.topStories,
      new: API_ENDPOINTS.hackernews.newStories,
      best: API_ENDPOINTS.hackernews.bestStories,
      ask: API_ENDPOINTS.hackernews.askStories,
      show: API_ENDPOINTS.hackernews.showStories,
    };

    const url = `${API_ENDPOINTS.hackernews.base}${endpoints[category]}`;
    return this.fetchWithRetry<number[]>(url);
  }

  /**
   * Get a single story item
   */
  private async getItem(id: number): Promise<ContentProviderResult<HackerNewsItem>> {
    const url = `${API_ENDPOINTS.hackernews.base}${API_ENDPOINTS.hackernews.item}/${id}.json`;
    return this.fetchWithRetry<HackerNewsItem>(url);
  }

  /**
   * Get stories for a category
   */
  private async getCategoryStories(
    category: 'top' | 'new' | 'best' | 'ask' | 'show',
    limit: number
  ): Promise<ContentProviderResult<HackerNewsItem[]>> {
    const idsResult = await this.getCategoryStoryIds(category);

    if (!idsResult.success) {
      return idsResult as ContentProviderResult<HackerNewsItem[]>;
    }

    // Get first N story IDs
    const storyIds = idsResult.data.slice(0, limit);

    // Fetch stories in parallel (batch of 10 to avoid overwhelming the API)
    const stories: HackerNewsItem[] = [];
    const batchSize = 10;

    for (let i = 0; i < storyIds.length; i += batchSize) {
      const batch = storyIds.slice(i, i + batchSize);
      const batchPromises = batch.map(id => this.getItem(id));
      const results = await Promise.all(batchPromises);

      for (const result of results) {
        if (result.success && result.data && !result.data.deleted && !result.data.dead) {
          stories.push(result.data);
        }
      }
    }

    return {
      success: true,
      data: stories,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Search for stories matching keywords
   */
  async searchTrends(keywords: string[]): Promise<ContentProviderResult<TrendItem[]>> {
    // HN doesn't have a native search API, so we filter from top stories
    const allStories = await this.getTrends({ limit: 100 });

    if (!allStories.success) {
      return allStories;
    }

    const keywordsLower = keywords.map(k => k.toLowerCase());

    const matchingTrends = allStories.data.filter(trend => {
      const title = trend.title.toLowerCase();
      const description = (trend.description ?? '').toLowerCase();
      return keywordsLower.some(
        keyword => title.includes(keyword) || description.includes(keyword)
      );
    });

    return {
      success: true,
      data: matchingTrends,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get a specific story by ID
   */
  async getStory(id: number): Promise<ContentProviderResult<TrendItem>> {
    const result = await this.getItem(id);

    if (!result.success) {
      return result as ContentProviderResult<TrendItem>;
    }

    const story = result.data;
    if (!story || story.deleted || story.dead) {
      return {
        success: false,
        error: 'Story not found or deleted',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const expiresAt = Date.now() + CONTENT_DEFAULTS.TREND_CACHE_TTL * 60 * 1000;
    const trend = this.storyToTrend(story, 'top', 0, expiresAt);

    return {
      success: true,
      data: trend,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Convert a HN story to a TrendItem
   */
  private storyToTrend(
    story: HackerNewsItem,
    category: string,
    index: number,
    expiresAt: number
  ): TrendItem {
    const score = story.score ?? 0;
    const comments = story.descendants ?? 0;
    const ageHours = (Date.now() - story.time * 1000) / (1000 * 60 * 60);

    // HN's ranking algorithm values fresh content with high engagement
    // Velocity = engagement rate adjusted for time
    const engagementRate = (score + comments * 2) / Math.max(ageHours, 0.5);
    const velocity = Math.min(100, Math.log10(Math.max(engagementRate, 1)) * 20);

    // Determine category based on type and prefix
    let itemCategory = category;
    if (story.title?.toLowerCase().startsWith('ask hn:')) {
      itemCategory = 'ask';
    } else if (story.title?.toLowerCase().startsWith('show hn:')) {
      itemCategory = 'show';
    } else if (story.type === 'job') {
      itemCategory = 'jobs';
    }

    return {
      id: String(story.id),
      source: 'hackernews',
      title: story.title ?? 'Untitled',
      description: story.text?.substring(0, 300),
      url: story.url ?? `https://news.ycombinator.com/item?id=${story.id}`,
      volume: score,
      velocity,
      category: itemCategory,
      rank: index + 1,
      fetchedAt: Date.now(),
      expiresAt,
    };
  }

  /**
   * Get available categories
   */
  getCategories(): string[] {
    return ['top', 'new', 'best', 'ask', 'show'];
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createHackerNewsProvider(
  config?: HackerNewsSourceConfig
): HackerNewsProvider {
  return new HackerNewsProvider(config);
}
