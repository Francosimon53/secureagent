/**
 * Content Creator Suite - Reddit Trends Provider
 *
 * Fetches trending topics from Reddit subreddits.
 */

import { BaseContentProvider } from '../base.js';
import type { ContentProviderResult, TrendItem } from '../../types.js';
import { CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

interface RedditConfig {
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  subreddits: string[];
  timeout: number;
  rateLimitPerMinute: number;
}

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    url: string;
    permalink: string;
    subreddit: string;
    score: number;
    upvote_ratio: number;
    num_comments: number;
    created_utc: number;
    author: string;
    is_self: boolean;
    link_flair_text?: string;
  };
}

interface RedditListingResponse {
  data: {
    children: RedditPost[];
    after?: string;
  };
}

// =============================================================================
// Reddit Provider
// =============================================================================

type RedditSourceConfig = {
  enabled?: boolean;
  clientIdEnvVar?: string;
  clientSecretEnvVar?: string;
  subreddits?: string[];
};

export class RedditProvider extends BaseContentProvider<RedditConfig> {
  private accessToken: string | undefined;
  private tokenExpiresAt: number = 0;

  constructor(config?: RedditSourceConfig) {
    const providerConfig: RedditConfig = {
      clientIdEnvVar: config?.clientIdEnvVar ?? 'REDDIT_CLIENT_ID',
      clientSecretEnvVar: config?.clientSecretEnvVar ?? 'REDDIT_CLIENT_SECRET',
      subreddits: config?.subreddits ?? ['technology', 'programming', 'news'],
      timeout: CONTENT_DEFAULTS.API_TIMEOUT,
      rateLimitPerMinute: 60,
    };
    super(providerConfig);
  }

  get name(): string {
    return 'reddit';
  }

  get type(): string {
    return 'trends';
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  protected async onInitialize(): Promise<void> {
    await this.refreshAccessToken();
  }

  /**
   * Refresh OAuth access token
   */
  private async refreshAccessToken(): Promise<void> {
    const clientId = process.env[this.config.clientIdEnvVar];
    const clientSecret = process.env[this.config.clientSecretEnvVar];

    if (!clientId || !clientSecret) {
      // Fall back to no-auth public API
      return;
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    try {
      const response = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'ContentCreatorSuite/1.0',
        },
        body: 'grant_type=client_credentials',
      });

      if (response.ok) {
        const data = await response.json() as { access_token: string; expires_in: number };
        this.accessToken = data.access_token;
        this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
      }
    } catch {
      // Continue without auth
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'ContentCreatorSuite/1.0',
    };

    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    return headers;
  }

  /**
   * Get trending posts from configured subreddits
   */
  async getTrends(options?: {
    subreddits?: string[];
    sort?: 'hot' | 'top' | 'new';
    timeframe?: 'hour' | 'day' | 'week' | 'month' | 'year';
    limit?: number;
  }): Promise<ContentProviderResult<TrendItem[]>> {
    const subreddits = options?.subreddits ?? this.config.subreddits;
    const sort = options?.sort ?? 'hot';
    const limit = options?.limit ?? 10;

    // Refresh token if needed
    if (this.accessToken && Date.now() >= this.tokenExpiresAt) {
      await this.refreshAccessToken();
    }

    const allTrends: TrendItem[] = [];
    const now = Date.now();
    const expiresAt = now + CONTENT_DEFAULTS.TREND_CACHE_TTL * 60 * 1000;

    for (const subreddit of subreddits) {
      const posts = await this.getSubredditPosts(subreddit, sort, limit, options?.timeframe);
      if (posts.success) {
        allTrends.push(
          ...posts.data.map((post, index) => this.postToTrend(post, index, expiresAt))
        );
      }
    }

    // Sort by velocity (engagement rate)
    allTrends.sort((a, b) => b.velocity - a.velocity);

    return {
      success: true,
      data: allTrends,
      cached: false,
      fetchedAt: now,
    };
  }

  /**
   * Get posts from a subreddit
   */
  private async getSubredditPosts(
    subreddit: string,
    sort: 'hot' | 'top' | 'new',
    limit: number,
    timeframe?: string
  ): Promise<ContentProviderResult<RedditPost['data'][]>> {
    const baseUrl = this.accessToken
      ? 'https://oauth.reddit.com'
      : 'https://www.reddit.com';

    let url = `${baseUrl}/r/${subreddit}/${sort}.json?limit=${limit}`;
    if (sort === 'top' && timeframe) {
      url += `&t=${timeframe}`;
    }

    const result = await this.fetchWithRetry<RedditListingResponse>(url);

    if (!result.success) {
      return result as ContentProviderResult<RedditPost['data'][]>;
    }

    const posts = result.data.data.children.map(child => child.data);

    return {
      success: true,
      data: posts,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Search Reddit for trending topics matching keywords
   */
  async searchTrends(keywords: string[]): Promise<ContentProviderResult<TrendItem[]>> {
    const query = keywords.join(' OR ');
    const baseUrl = this.accessToken
      ? 'https://oauth.reddit.com'
      : 'https://www.reddit.com';

    const url = `${baseUrl}/search.json?q=${encodeURIComponent(query)}&sort=hot&limit=25`;

    const result = await this.fetchWithRetry<RedditListingResponse>(url);

    if (!result.success) {
      return result as ContentProviderResult<TrendItem[]>;
    }

    const now = Date.now();
    const expiresAt = now + CONTENT_DEFAULTS.TREND_CACHE_TTL * 60 * 1000;

    const trends = result.data.data.children.map((child, index) =>
      this.postToTrend(child.data, index, expiresAt)
    );

    return {
      success: true,
      data: trends,
      cached: false,
      fetchedAt: now,
    };
  }

  /**
   * Get trends from a specific subreddit
   */
  async getSubredditTrends(
    subreddit: string,
    options?: { sort?: 'hot' | 'top' | 'new'; limit?: number }
  ): Promise<ContentProviderResult<TrendItem[]>> {
    return this.getTrends({
      subreddits: [subreddit],
      sort: options?.sort,
      limit: options?.limit,
    });
  }

  /**
   * Convert a Reddit post to a TrendItem
   */
  private postToTrend(
    post: RedditPost['data'],
    index: number,
    expiresAt: number
  ): TrendItem {
    // Calculate velocity based on score, comments, and age
    const ageHours = (Date.now() - post.created_utc * 1000) / (1000 * 60 * 60);
    const engagementRate = (post.score + post.num_comments * 2) / Math.max(ageHours, 1);
    const velocity = Math.min(100, Math.log10(Math.max(engagementRate, 1)) * 25);

    // Determine sentiment from upvote ratio
    let sentiment: TrendItem['sentiment'];
    if (post.upvote_ratio >= 0.8) sentiment = 'positive';
    else if (post.upvote_ratio >= 0.6) sentiment = 'neutral';
    else if (post.upvote_ratio >= 0.4) sentiment = 'mixed';
    else sentiment = 'negative';

    return {
      id: post.id,
      source: 'reddit',
      title: post.title,
      description: post.selftext?.substring(0, 300) || undefined,
      url: `https://reddit.com${post.permalink}`,
      volume: post.score,
      velocity,
      sentiment,
      category: post.subreddit,
      rank: index + 1,
      relatedTopics: post.link_flair_text ? [post.link_flair_text] : undefined,
      fetchedAt: Date.now(),
      expiresAt,
    };
  }

  /**
   * Get configured subreddits
   */
  getConfiguredSubreddits(): string[] {
    return this.config.subreddits;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createRedditProvider(
  config?: RedditSourceConfig
): RedditProvider {
  return new RedditProvider(config);
}
