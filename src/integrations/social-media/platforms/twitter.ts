/**
 * Twitter/X API Integration
 *
 * Post tweets, reply to mentions, schedule threads
 */

import type {
  SocialAccount,
  PostContent,
  PlatformPost,
  PlatformAnalytics,
  SocialInteraction,
  MediaAttachment,
} from '../types.js';
import { SocialMediaError, SOCIAL_ERROR_CODES, PLATFORM_LIMITS } from '../types.js';

const TWITTER_API_BASE = 'https://api.twitter.com/2';

export interface TwitterConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  bearerToken?: string;
}

export interface TwitterUser {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
  verified?: boolean;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
  };
}

export interface TwitterTweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  conversation_id?: string;
  in_reply_to_user_id?: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    impression_count?: number;
  };
  attachments?: {
    media_keys?: string[];
  };
}

export class TwitterApi {
  private config: TwitterConfig;

  constructor(config: TwitterConfig) {
    this.config = config;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    useBearer = true,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (useBearer && this.config.bearerToken) {
      headers['Authorization'] = `Bearer ${this.config.bearerToken}`;
    } else {
      // OAuth 1.0a would be needed here for user context
      // This is simplified - in production use oauth-1.0a library
      headers['Authorization'] = `Bearer ${this.config.bearerToken || this.config.accessToken}`;
    }

    const response = await fetch(`${TWITTER_API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { detail?: string; title?: string };

      if (response.status === 401) {
        throw new SocialMediaError(
          'Twitter authentication failed',
          SOCIAL_ERROR_CODES.AUTH_FAILED,
          'twitter',
        );
      }

      if (response.status === 429) {
        throw new SocialMediaError(
          'Twitter rate limit exceeded',
          SOCIAL_ERROR_CODES.RATE_LIMITED,
          'twitter',
        );
      }

      throw new SocialMediaError(
        `Twitter API error: ${error.detail || error.title || response.statusText}`,
        SOCIAL_ERROR_CODES.PLATFORM_ERROR,
        'twitter',
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get authenticated user
   */
  async getMe(): Promise<TwitterUser> {
    const response = await this.request<{ data: TwitterUser }>(
      'GET',
      '/users/me?user.fields=profile_image_url,public_metrics,verified',
    );
    return response.data;
  }

  /**
   * Post a tweet
   */
  async postTweet(content: PostContent): Promise<PlatformPost> {
    const text = this.formatTweetText(content);

    if (text.length > PLATFORM_LIMITS.twitter.maxTextLength) {
      throw new SocialMediaError(
        `Tweet exceeds ${PLATFORM_LIMITS.twitter.maxTextLength} characters`,
        SOCIAL_ERROR_CODES.INVALID_CONTENT,
        'twitter',
      );
    }

    const tweetData: Record<string, unknown> = { text };

    // Handle media
    if (content.media && content.media.length > 0) {
      const mediaIds = await this.uploadMedia(content.media);
      if (mediaIds.length > 0) {
        tweetData.media = { media_ids: mediaIds };
      }
    }

    const response = await this.request<{ data: TwitterTweet }>('POST', '/tweets', tweetData);

    return {
      platform: 'twitter',
      platformPostId: response.data.id,
      url: `https://twitter.com/i/status/${response.data.id}`,
      status: 'published',
      publishedAt: Date.now(),
    };
  }

  /**
   * Post a thread (multiple tweets)
   */
  async postThread(content: PostContent): Promise<PlatformPost[]> {
    const posts: PlatformPost[] = [];
    let replyToId: string | undefined;

    const items = content.thread || [{ text: content.text, media: content.media, order: 0 }];

    for (const item of items.sort((a, b) => a.order - b.order)) {
      const tweetData: Record<string, unknown> = {
        text: item.text,
      };

      if (replyToId) {
        tweetData.reply = { in_reply_to_tweet_id: replyToId };
      }

      if (item.media && item.media.length > 0) {
        const mediaIds = await this.uploadMedia(item.media);
        if (mediaIds.length > 0) {
          tweetData.media = { media_ids: mediaIds };
        }
      }

      const response = await this.request<{ data: TwitterTweet }>('POST', '/tweets', tweetData);

      posts.push({
        platform: 'twitter',
        platformPostId: response.data.id,
        url: `https://twitter.com/i/status/${response.data.id}`,
        status: 'published',
        publishedAt: Date.now(),
      });

      replyToId = response.data.id;
    }

    return posts;
  }

  /**
   * Reply to a tweet
   */
  async replyToTweet(tweetId: string, text: string): Promise<PlatformPost> {
    const response = await this.request<{ data: TwitterTweet }>('POST', '/tweets', {
      text,
      reply: { in_reply_to_tweet_id: tweetId },
    });

    return {
      platform: 'twitter',
      platformPostId: response.data.id,
      url: `https://twitter.com/i/status/${response.data.id}`,
      status: 'published',
      publishedAt: Date.now(),
    };
  }

  /**
   * Delete a tweet
   */
  async deleteTweet(tweetId: string): Promise<void> {
    await this.request('DELETE', `/tweets/${tweetId}`);
  }

  /**
   * Get tweet by ID
   */
  async getTweet(tweetId: string): Promise<TwitterTweet> {
    const response = await this.request<{ data: TwitterTweet }>(
      'GET',
      `/tweets/${tweetId}?tweet.fields=public_metrics,created_at,author_id`,
    );
    return response.data;
  }

  /**
   * Get mentions
   */
  async getMentions(userId: string, sinceId?: string): Promise<SocialInteraction[]> {
    let endpoint = `/users/${userId}/mentions?tweet.fields=created_at,author_id&expansions=author_id&user.fields=username,name,profile_image_url`;
    if (sinceId) {
      endpoint += `&since_id=${sinceId}`;
    }

    const response = await this.request<{
      data?: TwitterTweet[];
      includes?: { users?: TwitterUser[] };
    }>('GET', endpoint);

    if (!response.data) return [];

    const users = new Map(response.includes?.users?.map(u => [u.id, u]) || []);

    return response.data.map(tweet => {
      const author = users.get(tweet.author_id || '');
      return {
        id: tweet.id,
        platform: 'twitter' as const,
        type: 'mention' as const,
        platformInteractionId: tweet.id,
        authorId: tweet.author_id || '',
        authorUsername: author?.username || '',
        authorDisplayName: author?.name,
        authorAvatarUrl: author?.profile_image_url,
        content: tweet.text,
        createdAt: tweet.created_at ? new Date(tweet.created_at).getTime() : Date.now(),
        replied: false,
      };
    });
  }

  /**
   * Get tweet analytics
   */
  async getTweetAnalytics(tweetId: string): Promise<PlatformAnalytics> {
    const tweet = await this.getTweet(tweetId);
    const metrics = tweet.public_metrics;

    return {
      platform: 'twitter',
      impressions: metrics?.impression_count || 0,
      reach: 0, // Not available in basic API
      engagement: (metrics?.like_count || 0) + (metrics?.retweet_count || 0) + (metrics?.reply_count || 0),
      likes: metrics?.like_count || 0,
      comments: metrics?.reply_count || 0,
      shares: metrics?.retweet_count || 0,
      clicks: 0, // Requires analytics API
      updatedAt: Date.now(),
    };
  }

  /**
   * Upload media to Twitter
   */
  private async uploadMedia(media: MediaAttachment[]): Promise<string[]> {
    // Twitter media upload uses v1.1 API with multipart/form-data
    // This is simplified - in production implement full media upload flow
    const mediaIds: string[] = [];

    for (const item of media.slice(0, PLATFORM_LIMITS.twitter.maxImages)) {
      // In production, upload to https://upload.twitter.com/1.1/media/upload.json
      // For now, assume media URLs are already hosted
      if (item.id) {
        mediaIds.push(item.id);
      }
    }

    return mediaIds;
  }

  /**
   * Format tweet text with hashtags
   */
  private formatTweetText(content: PostContent): string {
    let text = content.text;

    if (content.hashtags && content.hashtags.length > 0) {
      const tags = content.hashtags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ');
      if (text.length + tags.length + 1 <= PLATFORM_LIMITS.twitter.maxTextLength) {
        text = `${text} ${tags}`;
      }
    }

    if (content.link && text.length + content.link.length + 1 <= PLATFORM_LIMITS.twitter.maxTextLength) {
      text = `${text} ${content.link}`;
    }

    return text;
  }

  /**
   * Verify credentials
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      await this.getMe();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create Twitter API client
 */
export function createTwitterApi(config: TwitterConfig): TwitterApi {
  return new TwitterApi(config);
}
