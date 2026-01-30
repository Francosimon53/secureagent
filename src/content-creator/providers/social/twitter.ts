/**
 * Content Creator Suite - Twitter Provider
 *
 * Twitter/X API v2 integration for posting tweets, threads, and fetching analytics.
 */

import { BaseContentProvider, ContentProviderError } from '../base.js';
import type { TwitterConfig } from '../../config.js';
import type { ContentProviderResult, Tweet, Thread, EngagementMetrics } from '../../types.js';
import { API_ENDPOINTS, ERROR_CODES, CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

interface TwitterProviderConfig {
  apiKeyEnvVar: string;
  apiSecretEnvVar: string;
  accessTokenEnvVar: string;
  accessTokenSecretEnvVar: string;
  bearerTokenEnvVar: string;
  timeout: number;
  rateLimitPerMinute: number;
  maxRetries: number;
}

interface TwitterUser {
  id: string;
  name: string;
  username: string;
}

interface TwitterTweetResponse {
  data: {
    id: string;
    text: string;
    created_at?: string;
    public_metrics?: {
      retweet_count: number;
      reply_count: number;
      like_count: number;
      quote_count: number;
      impression_count?: number;
    };
  };
}

interface TwitterPostResponse {
  data: {
    id: string;
    text: string;
  };
}

export interface PostedTweet {
  id: string;
  text: string;
  createdAt: string;
}

// =============================================================================
// Twitter Provider
// =============================================================================

export class TwitterProvider extends BaseContentProvider<TwitterProviderConfig> {
  private bearerToken: string | undefined;
  private accessToken: string | undefined;
  private accessTokenSecret: string | undefined;
  private twitterApiKey: string | undefined;
  private twitterApiSecret: string | undefined;

  constructor(config: TwitterConfig) {
    const providerConfig: TwitterProviderConfig = {
      apiKeyEnvVar: config.apiKeyEnvVar ?? 'TWITTER_API_KEY',
      apiSecretEnvVar: config.apiSecretEnvVar ?? 'TWITTER_API_SECRET',
      accessTokenEnvVar: config.accessTokenEnvVar ?? 'TWITTER_ACCESS_TOKEN',
      accessTokenSecretEnvVar: config.accessTokenSecretEnvVar ?? 'TWITTER_ACCESS_TOKEN_SECRET',
      bearerTokenEnvVar: config.bearerTokenEnvVar ?? 'TWITTER_BEARER_TOKEN',
      timeout: config.timeout ?? CONTENT_DEFAULTS.API_TIMEOUT,
      rateLimitPerMinute: config.rateLimitPerMinute ?? CONTENT_DEFAULTS.TWITTER_RATE_LIMIT,
      maxRetries: config.maxRetries ?? 3,
    };
    super(providerConfig);
  }

  get name(): string {
    return 'twitter';
  }

  get type(): string {
    return 'social';
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  protected async onInitialize(): Promise<void> {
    this.bearerToken = process.env[this.config.bearerTokenEnvVar];
    this.accessToken = process.env[this.config.accessTokenEnvVar];
    this.accessTokenSecret = process.env[this.config.accessTokenSecretEnvVar];
    this.twitterApiKey = process.env[this.config.apiKeyEnvVar];
    this.twitterApiSecret = process.env[this.config.apiSecretEnvVar];

    if (!this.bearerToken) {
      throw new ContentProviderError(
        this.name,
        ERROR_CODES.PROVIDER_AUTH_FAILED,
        `Bearer token not found: ${this.config.bearerTokenEnvVar}`
      );
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.bearerToken}`,
    };
  }

  /**
   * Post a single tweet
   */
  async postTweet(tweet: Tweet): Promise<ContentProviderResult<PostedTweet>> {
    const body: Record<string, unknown> = {
      text: tweet.content,
    };

    if (tweet.replyToId) {
      body.reply = { in_reply_to_tweet_id: tweet.replyToId };
    }

    if (tweet.quoteTweetId) {
      body.quote_tweet_id = tweet.quoteTweetId;
    }

    if (tweet.mediaUrls && tweet.mediaUrls.length > 0) {
      // Note: Media upload requires separate endpoint
      // This would need to be implemented with media upload first
    }

    const result = await this.fetchWithRetry<TwitterPostResponse>(
      `${API_ENDPOINTS.twitter.base}${API_ENDPOINTS.twitter.tweets}`,
      {
        method: 'POST',
        headers: this.getOAuth1Headers('POST', `${API_ENDPOINTS.twitter.base}${API_ENDPOINTS.twitter.tweets}`),
        body: JSON.stringify(body),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<PostedTweet>;
    }

    return {
      success: true,
      data: {
        id: result.data.data.id,
        text: result.data.data.text,
        createdAt: new Date().toISOString(),
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Post a thread (multiple tweets)
   */
  async postThread(thread: Thread): Promise<ContentProviderResult<PostedTweet[]>> {
    const postedTweets: PostedTweet[] = [];
    let replyToId: string | undefined;

    for (const tweet of thread.tweets) {
      const tweetToPost: Tweet = {
        ...tweet,
        replyToId,
      };

      const result = await this.postTweet(tweetToPost);

      if (!result.success) {
        return {
          success: false,
          error: `Failed to post tweet ${postedTweets.length + 1}: ${result.error}`,
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      postedTweets.push(result.data);
      replyToId = result.data.id;

      // Small delay between tweets to avoid rate limiting
      if (thread.tweets.indexOf(tweet) < thread.tweets.length - 1) {
        await this.sleep(1000);
      }
    }

    return {
      success: true,
      data: postedTweets,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get tweet by ID
   */
  async getTweet(tweetId: string): Promise<ContentProviderResult<TwitterTweetResponse['data']>> {
    const result = await this.fetchWithRetry<TwitterTweetResponse>(
      `${API_ENDPOINTS.twitter.base}${API_ENDPOINTS.twitter.tweets}/${tweetId}?tweet.fields=created_at,public_metrics`
    );

    if (!result.success) {
      return result as ContentProviderResult<TwitterTweetResponse['data']>;
    }

    return {
      success: true,
      data: result.data.data,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get engagement metrics for a tweet
   */
  async getTweetMetrics(tweetId: string): Promise<ContentProviderResult<EngagementMetrics>> {
    const result = await this.getTweet(tweetId);

    if (!result.success) {
      return result as ContentProviderResult<EngagementMetrics>;
    }

    const metrics = result.data.public_metrics;

    if (!metrics) {
      return {
        success: false,
        error: 'No metrics available for this tweet',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const totalEngagements = metrics.like_count + metrics.retweet_count + metrics.reply_count + metrics.quote_count;
    const impressions = metrics.impression_count ?? totalEngagements * 10; // Estimate if not available

    return {
      success: true,
      data: {
        likes: metrics.like_count,
        comments: metrics.reply_count,
        shares: metrics.retweet_count + metrics.quote_count,
        impressions,
        clicks: 0, // Not available via standard API
        engagementRate: totalEngagements / Math.max(impressions, 1),
        fetchedAt: Date.now(),
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get authenticated user info
   */
  async getMe(): Promise<ContentProviderResult<TwitterUser>> {
    const result = await this.fetchWithRetry<{ data: TwitterUser }>(
      `${API_ENDPOINTS.twitter.base}${API_ENDPOINTS.twitter.users}/me`
    );

    if (!result.success) {
      return result as ContentProviderResult<TwitterUser>;
    }

    return {
      success: true,
      data: result.data.data,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Delete a tweet
   */
  async deleteTweet(tweetId: string): Promise<ContentProviderResult<boolean>> {
    const result = await this.fetchWithRetry<{ data: { deleted: boolean } }>(
      `${API_ENDPOINTS.twitter.base}${API_ENDPOINTS.twitter.tweets}/${tweetId}`,
      {
        method: 'DELETE',
        headers: this.getOAuth1Headers('DELETE', `${API_ENDPOINTS.twitter.base}${API_ENDPOINTS.twitter.tweets}/${tweetId}`),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<boolean>;
    }

    return {
      success: true,
      data: result.data.data.deleted,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Search tweets
   */
  async searchTweets(
    query: string,
    options?: { maxResults?: number; startTime?: string; endTime?: string }
  ): Promise<ContentProviderResult<TwitterTweetResponse['data'][]>> {
    const params = new URLSearchParams({
      query,
      max_results: String(options?.maxResults ?? 10),
      'tweet.fields': 'created_at,public_metrics',
    });

    if (options?.startTime) {
      params.set('start_time', options.startTime);
    }
    if (options?.endTime) {
      params.set('end_time', options.endTime);
    }

    const result = await this.fetchWithRetry<{ data: TwitterTweetResponse['data'][] }>(
      `${API_ENDPOINTS.twitter.base}${API_ENDPOINTS.twitter.tweets}/search/recent?${params}`
    );

    if (!result.success) {
      return result as ContentProviderResult<TwitterTweetResponse['data'][]>;
    }

    return {
      success: true,
      data: result.data.data ?? [],
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get OAuth 1.0a headers for write operations
   * Note: This is a simplified version - real implementation needs proper OAuth signing
   */
  private getOAuth1Headers(method: string, url: string): Record<string, string> {
    // For production, implement proper OAuth 1.0a signing
    // This requires the oauth-1.0a library or similar
    return {
      Authorization: `Bearer ${this.bearerToken}`,
      'Content-Type': 'application/json',
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTwitterProvider(config: TwitterConfig): TwitterProvider {
  return new TwitterProvider(config);
}
