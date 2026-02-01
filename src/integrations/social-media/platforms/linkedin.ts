/**
 * LinkedIn API Integration
 *
 * Post to company pages, share articles
 */

import type {
  PostContent,
  PlatformPost,
  PlatformAnalytics,
  MediaAttachment,
} from '../types.js';
import { SocialMediaError, SOCIAL_ERROR_CODES, PLATFORM_LIMITS } from '../types.js';

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

export interface LinkedInConfig {
  accessToken: string;
  refreshToken?: string;
  organizationId?: string; // For company pages
}

export interface LinkedInProfile {
  id: string;
  localizedFirstName: string;
  localizedLastName: string;
  profilePicture?: {
    displayImage: string;
  };
}

export interface LinkedInOrganization {
  id: string;
  localizedName: string;
  logoV2?: {
    original: string;
  };
}

export interface LinkedInPost {
  id: string;
  author: string;
  lifecycleState: 'PUBLISHED' | 'DRAFT';
  visibility: {
    'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' | 'CONNECTIONS';
  };
  specificContent: {
    'com.linkedin.ugc.ShareContent': {
      shareCommentary: { text: string };
      shareMediaCategory: 'NONE' | 'ARTICLE' | 'IMAGE' | 'VIDEO';
      media?: Array<{
        status: string;
        media: string;
        title?: { text: string };
        description?: { text: string };
      }>;
    };
  };
}

export class LinkedInApi {
  private config: LinkedInConfig;

  constructor(config: LinkedInConfig) {
    this.config = config;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${LINKEDIN_API_BASE}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { message?: string };

      if (response.status === 401) {
        throw new SocialMediaError(
          'LinkedIn authentication failed',
          SOCIAL_ERROR_CODES.AUTH_FAILED,
          'linkedin',
        );
      }

      if (response.status === 429) {
        throw new SocialMediaError(
          'LinkedIn rate limit exceeded',
          SOCIAL_ERROR_CODES.RATE_LIMITED,
          'linkedin',
        );
      }

      throw new SocialMediaError(
        `LinkedIn API error: ${error.message || response.statusText}`,
        SOCIAL_ERROR_CODES.PLATFORM_ERROR,
        'linkedin',
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get authenticated user profile
   */
  async getMe(): Promise<LinkedInProfile> {
    return this.request<LinkedInProfile>('GET', '/me');
  }

  /**
   * Get organization/company page
   */
  async getOrganization(orgId: string): Promise<LinkedInOrganization> {
    return this.request<LinkedInOrganization>('GET', `/organizations/${orgId}`);
  }

  /**
   * Create a post (share)
   */
  async createPost(content: PostContent, asOrganization = false): Promise<PlatformPost> {
    const text = this.formatPostText(content);

    if (text.length > PLATFORM_LIMITS.linkedin.maxTextLength) {
      throw new SocialMediaError(
        `Post exceeds ${PLATFORM_LIMITS.linkedin.maxTextLength} characters`,
        SOCIAL_ERROR_CODES.INVALID_CONTENT,
        'linkedin',
      );
    }

    // Get author URN
    let authorUrn: string;
    if (asOrganization && this.config.organizationId) {
      authorUrn = `urn:li:organization:${this.config.organizationId}`;
    } else {
      const profile = await this.getMe();
      authorUrn = `urn:li:person:${profile.id}`;
    }

    const shareContent: Record<string, unknown> = {
      shareCommentary: { text },
      shareMediaCategory: 'NONE',
    };

    // Handle article/link
    if (content.link) {
      shareContent.shareMediaCategory = 'ARTICLE';
      shareContent.media = [{
        status: 'READY',
        originalUrl: content.link,
        title: content.linkPreview?.title ? { text: content.linkPreview.title } : undefined,
        description: content.linkPreview?.description ? { text: content.linkPreview.description } : undefined,
      }];
    }

    // Handle images
    if (content.media && content.media.length > 0) {
      const mediaAssets = await this.uploadMedia(content.media, authorUrn);
      if (mediaAssets.length > 0) {
        shareContent.shareMediaCategory = 'IMAGE';
        shareContent.media = mediaAssets.map(asset => ({
          status: 'READY',
          media: asset,
          title: content.altText ? { text: content.altText } : undefined,
        }));
      }
    }

    const postBody = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
      specificContent: {
        'com.linkedin.ugc.ShareContent': shareContent,
      },
    };

    const response = await this.request<{ id: string }>('POST', '/ugcPosts', postBody);
    const postId = response.id.replace('urn:li:share:', '');

    return {
      platform: 'linkedin',
      platformPostId: postId,
      url: `https://www.linkedin.com/feed/update/${response.id}`,
      status: 'published',
      publishedAt: Date.now(),
    };
  }

  /**
   * Create article post
   */
  async shareArticle(
    articleUrl: string,
    commentary: string,
    asOrganization = false,
  ): Promise<PlatformPost> {
    return this.createPost({
      text: commentary,
      link: articleUrl,
    }, asOrganization);
  }

  /**
   * Delete a post
   */
  async deletePost(postId: string): Promise<void> {
    await this.request('DELETE', `/ugcPosts/urn:li:share:${postId}`);
  }

  /**
   * Get post analytics
   */
  async getPostAnalytics(postId: string): Promise<PlatformAnalytics> {
    // LinkedIn analytics requires specific permissions and different endpoints
    // This is simplified - full implementation needs organizationalEntityShareStatistics
    try {
      const response = await this.request<{
        elements: Array<{
          totalShareStatistics: {
            impressionCount: number;
            clickCount: number;
            likeCount: number;
            commentCount: number;
            shareCount: number;
            engagement: number;
          };
        }>;
      }>('GET', `/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:share:${postId}`);

      const stats = response.elements[0]?.totalShareStatistics;

      return {
        platform: 'linkedin',
        impressions: stats?.impressionCount || 0,
        reach: 0,
        engagement: stats?.engagement || 0,
        likes: stats?.likeCount || 0,
        comments: stats?.commentCount || 0,
        shares: stats?.shareCount || 0,
        clicks: stats?.clickCount || 0,
        updatedAt: Date.now(),
      };
    } catch {
      // Return empty analytics if not available
      return {
        platform: 'linkedin',
        impressions: 0,
        reach: 0,
        engagement: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        clicks: 0,
        updatedAt: Date.now(),
      };
    }
  }

  /**
   * Upload media to LinkedIn
   */
  private async uploadMedia(media: MediaAttachment[], ownerUrn: string): Promise<string[]> {
    const assets: string[] = [];

    for (const item of media.slice(0, PLATFORM_LIMITS.linkedin.maxImages)) {
      // Register upload
      const registerResponse = await this.request<{
        value: {
          uploadMechanism: {
            'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
              uploadUrl: string;
            };
          };
          asset: string;
        };
      }>('POST', '/assets?action=registerUpload', {
        registerUploadRequest: {
          owner: ownerUrn,
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          serviceRelationships: [{
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent',
          }],
        },
      });

      const uploadUrl = registerResponse.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
      const asset = registerResponse.value.asset;

      // Upload the actual file
      // In production, fetch the media from item.url and upload to uploadUrl
      // This is simplified
      if (item.url) {
        const mediaResponse = await fetch(item.url);
        const mediaBlob = await mediaResponse.blob();

        await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            'Content-Type': item.mimeType || 'image/jpeg',
          },
          body: mediaBlob,
        });

        assets.push(asset);
      }
    }

    return assets;
  }

  /**
   * Format post text with hashtags
   */
  private formatPostText(content: PostContent): string {
    let text = content.text;

    if (content.hashtags && content.hashtags.length > 0) {
      const tags = content.hashtags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ');
      text = `${text}\n\n${tags}`;
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
 * Create LinkedIn API client
 */
export function createLinkedInApi(config: LinkedInConfig): LinkedInApi {
  return new LinkedInApi(config);
}
