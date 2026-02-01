/**
 * YouTube API Integration
 *
 * Upload videos, manage comments, get analytics
 */

import type {
  PostContent,
  PlatformPost,
  PlatformAnalytics,
  SocialInteraction,
} from '../types.js';
import { SocialMediaError, SOCIAL_ERROR_CODES } from '../types.js';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';

export interface YouTubeConfig {
  accessToken: string;
  refreshToken?: string;
  channelId?: string;
}

export interface YouTubeChannel {
  id: string;
  snippet: {
    title: string;
    description: string;
    customUrl?: string;
    thumbnails: {
      default: { url: string };
      medium: { url: string };
      high: { url: string };
    };
  };
  statistics: {
    viewCount: string;
    subscriberCount: string;
    videoCount: string;
  };
}

export interface YouTubeVideo {
  id: string;
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: Record<string, { url: string; width: number; height: number }>;
    tags?: string[];
    categoryId: string;
  };
  status: {
    uploadStatus: string;
    privacyStatus: 'private' | 'public' | 'unlisted';
    publishAt?: string;
  };
  statistics?: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
}

export interface YouTubeComment {
  id: string;
  snippet: {
    videoId: string;
    textDisplay: string;
    textOriginal: string;
    authorDisplayName: string;
    authorProfileImageUrl: string;
    authorChannelId: { value: string };
    publishedAt: string;
    updatedAt: string;
    likeCount: number;
  };
}

export class YouTubeApi {
  private config: YouTubeConfig;

  constructor(config: YouTubeConfig) {
    this.config = config;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    baseUrl = YOUTUBE_API_BASE,
  ): Promise<T> {
    const url = `${baseUrl}${endpoint}`;
    const separator = endpoint.includes('?') ? '&' : '?';

    const response = await fetch(`${url}${separator}key=`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };

      if (response.status === 401) {
        throw new SocialMediaError(
          'YouTube authentication failed',
          SOCIAL_ERROR_CODES.AUTH_FAILED,
          'youtube',
        );
      }

      if (response.status === 429 || response.status === 403) {
        throw new SocialMediaError(
          'YouTube quota exceeded',
          SOCIAL_ERROR_CODES.RATE_LIMITED,
          'youtube',
        );
      }

      throw new SocialMediaError(
        `YouTube API error: ${error.error?.message || response.statusText}`,
        SOCIAL_ERROR_CODES.PLATFORM_ERROR,
        'youtube',
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get authenticated channel
   */
  async getMyChannel(): Promise<YouTubeChannel> {
    const response = await this.request<{ items: YouTubeChannel[] }>(
      'GET',
      '/channels?part=snippet,statistics&mine=true',
    );

    if (!response.items || response.items.length === 0) {
      throw new SocialMediaError(
        'No YouTube channel found',
        SOCIAL_ERROR_CODES.AUTH_FAILED,
        'youtube',
      );
    }

    return response.items[0];
  }

  /**
   * Upload a video
   */
  async uploadVideo(
    videoFile: Blob,
    metadata: {
      title: string;
      description: string;
      tags?: string[];
      categoryId?: string;
      privacyStatus?: 'private' | 'public' | 'unlisted';
      publishAt?: Date;
    },
  ): Promise<PlatformPost> {
    // Step 1: Initialize resumable upload
    const initResponse = await fetch(
      `${YOUTUBE_UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': videoFile.type,
          'X-Upload-Content-Length': String(videoFile.size),
        },
        body: JSON.stringify({
          snippet: {
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags,
            categoryId: metadata.categoryId || '22', // People & Blogs
          },
          status: {
            privacyStatus: metadata.privacyStatus || 'private',
            publishAt: metadata.publishAt?.toISOString(),
          },
        }),
      },
    );

    if (!initResponse.ok) {
      throw new SocialMediaError(
        'Failed to initialize video upload',
        SOCIAL_ERROR_CODES.PLATFORM_ERROR,
        'youtube',
      );
    }

    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) {
      throw new SocialMediaError(
        'No upload URL returned',
        SOCIAL_ERROR_CODES.PLATFORM_ERROR,
        'youtube',
      );
    }

    // Step 2: Upload the video file
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': videoFile.type,
        'Content-Length': String(videoFile.size),
      },
      body: videoFile,
    });

    if (!uploadResponse.ok) {
      throw new SocialMediaError(
        'Failed to upload video',
        SOCIAL_ERROR_CODES.PLATFORM_ERROR,
        'youtube',
      );
    }

    const video = await uploadResponse.json() as YouTubeVideo;

    return {
      platform: 'youtube',
      platformPostId: video.id,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      status: video.status.uploadStatus === 'processed' ? 'published' : 'scheduled',
      publishedAt: Date.now(),
    };
  }

  /**
   * Update video metadata
   */
  async updateVideo(
    videoId: string,
    metadata: {
      title?: string;
      description?: string;
      tags?: string[];
      categoryId?: string;
      privacyStatus?: 'private' | 'public' | 'unlisted';
    },
  ): Promise<YouTubeVideo> {
    // First get current video data
    const current = await this.getVideo(videoId);

    const response = await this.request<YouTubeVideo>(
      'PUT',
      '/videos?part=snippet,status',
      {
        id: videoId,
        snippet: {
          title: metadata.title || current.snippet.title,
          description: metadata.description || current.snippet.description,
          tags: metadata.tags || current.snippet.tags,
          categoryId: metadata.categoryId || current.snippet.categoryId,
        },
        status: {
          privacyStatus: metadata.privacyStatus || current.status.privacyStatus,
        },
      },
    );

    return response;
  }

  /**
   * Delete a video
   */
  async deleteVideo(videoId: string): Promise<void> {
    await this.request('DELETE', `/videos?id=${videoId}`);
  }

  /**
   * Get video details
   */
  async getVideo(videoId: string): Promise<YouTubeVideo> {
    const response = await this.request<{ items: YouTubeVideo[] }>(
      'GET',
      `/videos?part=snippet,status,statistics&id=${videoId}`,
    );

    if (!response.items || response.items.length === 0) {
      throw new SocialMediaError(
        'Video not found',
        SOCIAL_ERROR_CODES.PLATFORM_ERROR,
        'youtube',
      );
    }

    return response.items[0];
  }

  /**
   * Get video comments
   */
  async getVideoComments(videoId: string, maxResults = 50): Promise<SocialInteraction[]> {
    const response = await this.request<{
      items: Array<{
        id: string;
        snippet: {
          topLevelComment: YouTubeComment;
        };
      }>;
    }>(
      'GET',
      `/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxResults}&order=time`,
    );

    return (response.items || []).map(item => {
      const comment = item.snippet.topLevelComment.snippet;
      return {
        id: item.id,
        platform: 'youtube' as const,
        type: 'comment' as const,
        postId: videoId,
        platformInteractionId: item.id,
        authorId: comment.authorChannelId.value,
        authorUsername: comment.authorDisplayName,
        authorDisplayName: comment.authorDisplayName,
        authorAvatarUrl: comment.authorProfileImageUrl,
        content: comment.textOriginal,
        createdAt: new Date(comment.publishedAt).getTime(),
        replied: false,
      };
    });
  }

  /**
   * Reply to a comment
   */
  async replyToComment(parentId: string, text: string): Promise<void> {
    await this.request('POST', '/comments?part=snippet', {
      snippet: {
        parentId,
        textOriginal: text,
      },
    });
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string): Promise<void> {
    await this.request('DELETE', `/comments?id=${commentId}`);
  }

  /**
   * Get video analytics
   */
  async getVideoAnalytics(videoId: string): Promise<PlatformAnalytics> {
    const video = await this.getVideo(videoId);
    const stats = video.statistics;

    return {
      platform: 'youtube',
      impressions: 0, // Requires YouTube Analytics API
      reach: 0,
      engagement:
        parseInt(stats?.likeCount || '0') +
        parseInt(stats?.commentCount || '0'),
      likes: parseInt(stats?.likeCount || '0'),
      comments: parseInt(stats?.commentCount || '0'),
      shares: 0,
      clicks: 0,
      videoViews: parseInt(stats?.viewCount || '0'),
      updatedAt: Date.now(),
    };
  }

  /**
   * Create a post (Community post - requires channel with feature enabled)
   */
  async createPost(content: PostContent): Promise<PlatformPost> {
    // YouTube Community posts require specific channel features
    // This is a simplified placeholder
    throw new SocialMediaError(
      'YouTube Community posts require channel eligibility',
      SOCIAL_ERROR_CODES.PLATFORM_ERROR,
      'youtube',
    );
  }

  /**
   * Verify credentials
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      await this.getMyChannel();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create YouTube API client
 */
export function createYouTubeApi(config: YouTubeConfig): YouTubeApi {
  return new YouTubeApi(config);
}
