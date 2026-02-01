/**
 * Instagram API Integration (Meta Graph API)
 *
 * Post to business accounts, reels, stories
 */

import type {
  PostContent,
  PlatformPost,
  PlatformAnalytics,
  SocialInteraction,
  MediaAttachment,
} from '../types.js';
import { SocialMediaError, SOCIAL_ERROR_CODES, PLATFORM_LIMITS } from '../types.js';

const INSTAGRAM_API_BASE = 'https://graph.facebook.com/v18.0';

export interface InstagramConfig {
  accessToken: string;
  businessAccountId: string;
  pageId?: string; // Connected Facebook page
}

export interface InstagramAccount {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  biography?: string;
  website?: string;
}

export interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS';
  media_url?: string;
  permalink: string;
  thumbnail_url?: string;
  timestamp: string;
  username: string;
  like_count?: number;
  comments_count?: number;
  insights?: InstagramInsights;
}

export interface InstagramInsights {
  impressions: number;
  reach: number;
  engagement: number;
  saved: number;
  video_views?: number;
}

export interface InstagramComment {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  like_count: number;
  replies?: {
    data: InstagramComment[];
  };
}

export class InstagramApi {
  private config: InstagramConfig;

  constructor(config: InstagramConfig) {
    this.config = config;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    useFormData = false,
  ): Promise<T> {
    const url = `${INSTAGRAM_API_BASE}${endpoint}`;
    const separator = endpoint.includes('?') ? '&' : '?';

    const headers: Record<string, string> = {};
    let requestBody: string | undefined;

    if (body && !useFormData) {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }

    const response = await fetch(
      `${url}${separator}access_token=${this.config.accessToken}`,
      {
        method,
        headers,
        body: requestBody,
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string; code?: number } };

      if (response.status === 401 || error.error?.code === 190) {
        throw new SocialMediaError(
          'Instagram authentication failed',
          SOCIAL_ERROR_CODES.AUTH_FAILED,
          'instagram',
        );
      }

      if (response.status === 429 || error.error?.code === 4) {
        throw new SocialMediaError(
          'Instagram rate limit exceeded',
          SOCIAL_ERROR_CODES.RATE_LIMITED,
          'instagram',
        );
      }

      throw new SocialMediaError(
        `Instagram API error: ${error.error?.message || response.statusText}`,
        SOCIAL_ERROR_CODES.PLATFORM_ERROR,
        'instagram',
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get business account details
   */
  async getAccount(): Promise<InstagramAccount> {
    const response = await this.request<InstagramAccount>(
      'GET',
      `/${this.config.businessAccountId}?fields=id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website`,
    );
    return response;
  }

  /**
   * Create a media container (first step of posting)
   */
  private async createMediaContainer(
    imageUrl: string,
    caption: string,
    mediaType: 'IMAGE' | 'REELS' | 'STORIES' = 'IMAGE',
  ): Promise<string> {
    const params: Record<string, string> = {
      caption,
    };

    if (mediaType === 'REELS') {
      params.media_type = 'REELS';
      params.video_url = imageUrl;
    } else if (mediaType === 'STORIES') {
      params.media_type = 'STORIES';
      params.image_url = imageUrl;
    } else {
      params.image_url = imageUrl;
    }

    const queryString = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    const response = await this.request<{ id: string }>(
      'POST',
      `/${this.config.businessAccountId}/media?${queryString}`,
    );

    return response.id;
  }

  /**
   * Create carousel container
   */
  private async createCarouselContainer(
    childrenIds: string[],
    caption: string,
  ): Promise<string> {
    const params = `media_type=CAROUSEL&caption=${encodeURIComponent(caption)}&children=${childrenIds.join(',')}`;

    const response = await this.request<{ id: string }>(
      'POST',
      `/${this.config.businessAccountId}/media?${params}`,
    );

    return response.id;
  }

  /**
   * Create carousel item container (no caption)
   */
  private async createCarouselItemContainer(
    imageUrl: string,
    isVideo = false,
  ): Promise<string> {
    const params = isVideo
      ? `media_type=VIDEO&video_url=${encodeURIComponent(imageUrl)}&is_carousel_item=true`
      : `image_url=${encodeURIComponent(imageUrl)}&is_carousel_item=true`;

    const response = await this.request<{ id: string }>(
      'POST',
      `/${this.config.businessAccountId}/media?${params}`,
    );

    return response.id;
  }

  /**
   * Publish media container
   */
  private async publishMedia(containerId: string): Promise<string> {
    const response = await this.request<{ id: string }>(
      'POST',
      `/${this.config.businessAccountId}/media_publish?creation_id=${containerId}`,
    );

    return response.id;
  }

  /**
   * Check media container status (for video uploads)
   */
  private async checkContainerStatus(containerId: string): Promise<'FINISHED' | 'IN_PROGRESS' | 'ERROR'> {
    const response = await this.request<{ status_code: string }>(
      'GET',
      `/${containerId}?fields=status_code`,
    );

    return response.status_code as 'FINISHED' | 'IN_PROGRESS' | 'ERROR';
  }

  /**
   * Wait for container to be ready
   */
  private async waitForContainer(containerId: string, maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.checkContainerStatus(containerId);

      if (status === 'FINISHED') {
        return;
      }

      if (status === 'ERROR') {
        throw new SocialMediaError(
          'Media processing failed',
          SOCIAL_ERROR_CODES.PLATFORM_ERROR,
          'instagram',
        );
      }

      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new SocialMediaError(
      'Media processing timeout',
      SOCIAL_ERROR_CODES.PLATFORM_ERROR,
      'instagram',
    );
  }

  /**
   * Create a post
   */
  async createPost(content: PostContent): Promise<PlatformPost> {
    const caption = this.formatCaption(content);

    if (caption.length > PLATFORM_LIMITS.instagram.maxTextLength) {
      throw new SocialMediaError(
        `Caption exceeds ${PLATFORM_LIMITS.instagram.maxTextLength} characters`,
        SOCIAL_ERROR_CODES.INVALID_CONTENT,
        'instagram',
      );
    }

    if (!content.media || content.media.length === 0) {
      throw new SocialMediaError(
        'Instagram posts require at least one image or video',
        SOCIAL_ERROR_CODES.INVALID_CONTENT,
        'instagram',
      );
    }

    let containerId: string;

    if (content.media.length === 1) {
      // Single image/video post
      const media = content.media[0];
      const isVideo = media.type === 'video';

      containerId = await this.createMediaContainer(
        media.url,
        caption,
        isVideo ? 'REELS' : 'IMAGE',
      );

      if (isVideo) {
        await this.waitForContainer(containerId);
      }
    } else {
      // Carousel post
      const childrenIds: string[] = [];

      for (const media of content.media.slice(0, PLATFORM_LIMITS.instagram.maxImages)) {
        const isVideo = media.type === 'video';
        const childId = await this.createCarouselItemContainer(media.url, isVideo);

        if (isVideo) {
          await this.waitForContainer(childId);
        }

        childrenIds.push(childId);
      }

      containerId = await this.createCarouselContainer(childrenIds, caption);
    }

    // Publish the container
    const mediaId = await this.publishMedia(containerId);

    // Get permalink
    const mediaDetails = await this.getMedia(mediaId);

    return {
      platform: 'instagram',
      platformPostId: mediaId,
      url: mediaDetails.permalink,
      status: 'published',
      publishedAt: Date.now(),
    };
  }

  /**
   * Create a story
   */
  async createStory(imageUrl: string): Promise<PlatformPost> {
    const containerId = await this.createMediaContainer(imageUrl, '', 'STORIES');
    const mediaId = await this.publishMedia(containerId);

    return {
      platform: 'instagram',
      platformPostId: mediaId,
      url: `https://www.instagram.com/stories/${this.config.businessAccountId}/`,
      status: 'published',
      publishedAt: Date.now(),
    };
  }

  /**
   * Create a reel
   */
  async createReel(videoUrl: string, caption: string): Promise<PlatformPost> {
    const formattedCaption = caption.length > PLATFORM_LIMITS.instagram.maxTextLength
      ? caption.slice(0, PLATFORM_LIMITS.instagram.maxTextLength - 3) + '...'
      : caption;

    const containerId = await this.createMediaContainer(videoUrl, formattedCaption, 'REELS');

    // Wait for video processing
    await this.waitForContainer(containerId);

    const mediaId = await this.publishMedia(containerId);
    const mediaDetails = await this.getMedia(mediaId);

    return {
      platform: 'instagram',
      platformPostId: mediaId,
      url: mediaDetails.permalink,
      status: 'published',
      publishedAt: Date.now(),
    };
  }

  /**
   * Get media details
   */
  async getMedia(mediaId: string): Promise<InstagramMedia> {
    const response = await this.request<InstagramMedia>(
      'GET',
      `/${mediaId}?fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username,like_count,comments_count`,
    );
    return response;
  }

  /**
   * Get recent media
   */
  async getRecentMedia(limit = 25): Promise<InstagramMedia[]> {
    const response = await this.request<{ data: InstagramMedia[] }>(
      'GET',
      `/${this.config.businessAccountId}/media?fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username,like_count,comments_count&limit=${limit}`,
    );
    return response.data || [];
  }

  /**
   * Get comments on a media
   */
  async getComments(mediaId: string): Promise<SocialInteraction[]> {
    const response = await this.request<{ data: InstagramComment[] }>(
      'GET',
      `/${mediaId}/comments?fields=id,text,username,timestamp,like_count`,
    );

    return (response.data || []).map(comment => ({
      id: comment.id,
      platform: 'instagram' as const,
      type: 'comment' as const,
      postId: mediaId,
      platformInteractionId: comment.id,
      authorId: comment.username,
      authorUsername: comment.username,
      content: comment.text,
      createdAt: new Date(comment.timestamp).getTime(),
      replied: false,
    }));
  }

  /**
   * Reply to a comment
   */
  async replyToComment(commentId: string, text: string): Promise<void> {
    await this.request(
      'POST',
      `/${commentId}/replies?message=${encodeURIComponent(text)}`,
    );
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string): Promise<void> {
    await this.request('DELETE', `/${commentId}`);
  }

  /**
   * Hide a comment
   */
  async hideComment(commentId: string, hide = true): Promise<void> {
    await this.request(
      'POST',
      `/${commentId}?hide=${hide}`,
    );
  }

  /**
   * Get media insights
   */
  async getMediaInsights(mediaId: string): Promise<PlatformAnalytics> {
    const media = await this.getMedia(mediaId);

    // Get detailed insights
    try {
      const insights = await this.request<{
        data: Array<{ name: string; values: Array<{ value: number }> }>;
      }>(
        'GET',
        `/${mediaId}/insights?metric=impressions,reach,engagement,saved`,
      );

      const metricsMap = new Map(
        insights.data.map(m => [m.name, m.values[0]?.value || 0]),
      );

      return {
        platform: 'instagram',
        impressions: metricsMap.get('impressions') || 0,
        reach: metricsMap.get('reach') || 0,
        engagement: metricsMap.get('engagement') || 0,
        likes: media.like_count || 0,
        comments: media.comments_count || 0,
        shares: 0, // Not available
        clicks: 0, // Not available for organic posts
        saves: metricsMap.get('saved') || 0,
        updatedAt: Date.now(),
      };
    } catch {
      // Insights may not be available for all media types
      return {
        platform: 'instagram',
        impressions: 0,
        reach: 0,
        engagement: (media.like_count || 0) + (media.comments_count || 0),
        likes: media.like_count || 0,
        comments: media.comments_count || 0,
        shares: 0,
        clicks: 0,
        updatedAt: Date.now(),
      };
    }
  }

  /**
   * Get account insights
   */
  async getAccountInsights(
    period: 'day' | 'week' | 'days_28' = 'days_28',
  ): Promise<Record<string, number>> {
    const response = await this.request<{
      data: Array<{ name: string; values: Array<{ value: number }> }>;
    }>(
      'GET',
      `/${this.config.businessAccountId}/insights?metric=impressions,reach,follower_count,profile_views,website_clicks&period=${period}`,
    );

    const metrics: Record<string, number> = {};
    for (const item of response.data) {
      metrics[item.name] = item.values[0]?.value || 0;
    }

    return metrics;
  }

  /**
   * Search hashtags
   */
  async searchHashtag(hashtag: string): Promise<{ id: string; name: string }> {
    const response = await this.request<{ data: Array<{ id: string }> }>(
      'GET',
      `/ig_hashtag_search?user_id=${this.config.businessAccountId}&q=${encodeURIComponent(hashtag)}`,
    );

    if (!response.data || response.data.length === 0) {
      throw new SocialMediaError(
        'Hashtag not found',
        SOCIAL_ERROR_CODES.PLATFORM_ERROR,
        'instagram',
      );
    }

    return {
      id: response.data[0].id,
      name: hashtag,
    };
  }

  /**
   * Get top posts for a hashtag
   */
  async getHashtagTopMedia(hashtagId: string, limit = 25): Promise<InstagramMedia[]> {
    const response = await this.request<{ data: InstagramMedia[] }>(
      'GET',
      `/${hashtagId}/top_media?user_id=${this.config.businessAccountId}&fields=id,caption,media_type,permalink,like_count,comments_count&limit=${limit}`,
    );
    return response.data || [];
  }

  /**
   * Format caption with hashtags
   */
  private formatCaption(content: PostContent): string {
    let caption = content.text;

    if (content.hashtags && content.hashtags.length > 0) {
      const tags = content.hashtags
        .slice(0, PLATFORM_LIMITS.instagram.maxHashtags)
        .map(t => t.startsWith('#') ? t : `#${t}`)
        .join(' ');

      // Instagram convention: hashtags at the end with line breaks
      if (caption.length + tags.length + 4 <= PLATFORM_LIMITS.instagram.maxTextLength) {
        caption = `${caption}\n\n${tags}`;
      }
    }

    return caption;
  }

  /**
   * Verify credentials
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      await this.getAccount();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create Instagram API client
 */
export function createInstagramApi(config: InstagramConfig): InstagramApi {
  return new InstagramApi(config);
}
