/**
 * Content Creator Suite - Twitter Trends Provider
 *
 * Fetches trending topics from Twitter/X.
 */

import { BaseContentProvider } from '../base.js';
import type { ContentProviderResult, TrendItem } from '../../types.js';
import { API_ENDPOINTS, CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

interface TwitterTrendsConfig {
  apiKeyEnvVar: string;
  timeout: number;
  rateLimitPerMinute: number;
  location?: string;
}

interface TwitterTrendResponse {
  trends: {
    name: string;
    url: string;
    promoted_content: boolean | null;
    query: string;
    tweet_volume: number | null;
  }[];
  as_of: string;
  created_at: string;
  locations: {
    name: string;
    woeid: number;
  }[];
}

// =============================================================================
// Twitter Trends Provider
// =============================================================================

type TwitterSourceConfig = {
  enabled?: boolean;
  apiKeyEnvVar?: string;
  location?: string;
};

export class TwitterTrendsProvider extends BaseContentProvider<TwitterTrendsConfig> {
  // WOEID (Where On Earth ID) for common locations
  private static readonly WOEIDS: Record<string, number> = {
    worldwide: 1,
    us: 23424977,
    uk: 23424975,
    canada: 23424775,
    australia: 23424748,
    india: 23424848,
    japan: 23424856,
    germany: 23424829,
    france: 23424819,
    brazil: 23424768,
  };

  constructor(config?: TwitterSourceConfig) {
    const providerConfig: TwitterTrendsConfig = {
      apiKeyEnvVar: config?.apiKeyEnvVar ?? 'TWITTER_BEARER_TOKEN',
      timeout: CONTENT_DEFAULTS.API_TIMEOUT,
      rateLimitPerMinute: 15, // Twitter trends API is limited
      location: config?.location,
    };
    super(providerConfig);
  }

  get name(): string {
    return 'twitter-trends';
  }

  get type(): string {
    return 'trends';
  }

  /**
   * Get trending topics
   */
  async getTrends(location?: string): Promise<ContentProviderResult<TrendItem[]>> {
    const woeid = this.getWoeid(location ?? this.config.location ?? 'worldwide');

    const result = await this.fetchWithRetry<TwitterTrendResponse[]>(
      `${API_ENDPOINTS.twitter.base}${API_ENDPOINTS.twitter.trends}/${woeid}.json`
    );

    if (!result.success) {
      return result as ContentProviderResult<TrendItem[]>;
    }

    const trendData = result.data[0];
    if (!trendData) {
      return {
        success: false,
        error: 'No trend data returned',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const now = Date.now();
    const expiresAt = now + CONTENT_DEFAULTS.TREND_CACHE_TTL * 60 * 1000;

    const trends: TrendItem[] = trendData.trends
      .filter(t => !t.promoted_content)
      .map((trend, index) => ({
        id: crypto.randomUUID(),
        source: 'twitter' as const,
        title: trend.name,
        url: trend.url,
        volume: trend.tweet_volume ?? undefined,
        velocity: this.calculateVelocity(trend.tweet_volume, index),
        rank: index + 1,
        fetchedAt: now,
        expiresAt,
      }));

    return {
      success: true,
      data: trends,
      cached: false,
      fetchedAt: now,
    };
  }

  /**
   * Search for trends matching keywords
   */
  async searchTrends(keywords: string[]): Promise<ContentProviderResult<TrendItem[]>> {
    const trendsResult = await this.getTrends();

    if (!trendsResult.success) {
      return trendsResult;
    }

    const keywordsLower = keywords.map(k => k.toLowerCase());

    const matchingTrends = trendsResult.data.filter(trend => {
      const titleLower = trend.title.toLowerCase();
      return keywordsLower.some(keyword => titleLower.includes(keyword));
    });

    return {
      success: true,
      data: matchingTrends,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get WOEID for a location
   */
  private getWoeid(location: string): number {
    const normalized = location.toLowerCase().replace(/\s+/g, '');
    return TwitterTrendsProvider.WOEIDS[normalized] ?? TwitterTrendsProvider.WOEIDS.worldwide;
  }

  /**
   * Calculate trend velocity (rate of growth)
   */
  private calculateVelocity(volume: number | null, rank: number): number {
    // Higher ranked trends with high volume have higher velocity
    if (volume === null) {
      // Estimate based on rank
      return Math.max(0, 100 - rank * 2);
    }

    // Normalize volume to a velocity score
    const baseVelocity = Math.log10(Math.max(volume, 1)) * 10;
    const rankBonus = Math.max(0, (50 - rank) / 50) * 20;

    return Math.min(100, baseVelocity + rankBonus);
  }

  /**
   * Get available locations
   */
  getAvailableLocations(): string[] {
    return Object.keys(TwitterTrendsProvider.WOEIDS);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTwitterTrendsProvider(
  config?: TwitterSourceConfig
): TwitterTrendsProvider {
  return new TwitterTrendsProvider(config);
}
