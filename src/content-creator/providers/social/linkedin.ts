/**
 * Content Creator Suite - LinkedIn Provider
 *
 * LinkedIn API integration for posts, articles, and engagement automation.
 */

import { BaseContentProvider, ContentProviderError } from '../base.js';
import type { LinkedInConfig } from '../../config.js';
import type {
  ContentProviderResult,
  LinkedInPost,
  LinkedInArticle,
  LinkedInMessage,
  LinkedInEngagementAction,
  EngagementMetrics,
} from '../../types.js';
import { API_ENDPOINTS, ERROR_CODES, CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

interface LinkedInProviderConfig {
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  accessTokenEnvVar: string;
  timeout: number;
  rateLimitPerMinute: number;
  maxRetries: number;
}

interface LinkedInUser {
  id: string;
  firstName: string;
  lastName: string;
  profilePicture?: string;
}

interface LinkedInPostResponse {
  id: string;
  activity: string;
  created: { time: number };
}

interface LinkedInShareResponse {
  id: string;
  activity: string;
}

export interface PostedLinkedInPost {
  id: string;
  activityUrn: string;
  createdAt: number;
}

// =============================================================================
// LinkedIn Provider
// =============================================================================

export class LinkedInProvider extends BaseContentProvider<LinkedInProviderConfig> {
  private accessToken: string | undefined;
  private userId: string | undefined;

  constructor(config: LinkedInConfig) {
    const providerConfig: LinkedInProviderConfig = {
      clientIdEnvVar: config.apiKeyEnvVar ?? 'LINKEDIN_CLIENT_ID',
      clientSecretEnvVar: config.apiSecretEnvVar ?? 'LINKEDIN_CLIENT_SECRET',
      accessTokenEnvVar: config.accessTokenEnvVar ?? 'LINKEDIN_ACCESS_TOKEN',
      timeout: config.timeout ?? CONTENT_DEFAULTS.API_TIMEOUT,
      rateLimitPerMinute: config.rateLimitPerMinute ?? CONTENT_DEFAULTS.LINKEDIN_RATE_LIMIT,
      maxRetries: config.maxRetries ?? 3,
    };
    super(providerConfig);
  }

  get name(): string {
    return 'linkedin';
  }

  get type(): string {
    return 'social';
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  protected async onInitialize(): Promise<void> {
    this.accessToken = process.env[this.config.accessTokenEnvVar];

    if (!this.accessToken) {
      throw new ContentProviderError(
        this.name,
        ERROR_CODES.PROVIDER_AUTH_FAILED,
        `Access token not found: ${this.config.accessTokenEnvVar}`
      );
    }

    // Fetch user ID on initialization
    const meResult = await this.getMe();
    if (meResult.success) {
      this.userId = meResult.data.id;
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    };
  }

  /**
   * Get authenticated user info
   */
  async getMe(): Promise<ContentProviderResult<LinkedInUser>> {
    const result = await this.fetchWithRetry<{
      id: string;
      localizedFirstName: string;
      localizedLastName: string;
      profilePicture?: { displayImage: string };
    }>(`${API_ENDPOINTS.linkedin.base}${API_ENDPOINTS.linkedin.me}`);

    if (!result.success) {
      return result as ContentProviderResult<LinkedInUser>;
    }

    return {
      success: true,
      data: {
        id: result.data.id,
        firstName: result.data.localizedFirstName,
        lastName: result.data.localizedLastName,
        profilePicture: result.data.profilePicture?.displayImage,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Create a text post
   */
  async createPost(post: LinkedInPost): Promise<ContentProviderResult<PostedLinkedInPost>> {
    if (!this.userId) {
      return {
        success: false,
        error: 'User ID not available. Please reinitialize the provider.',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const visibility = post.visibility === 'connections'
      ? 'CONNECTIONS'
      : post.visibility === 'logged_in'
      ? 'LOGGED_IN'
      : 'PUBLIC';

    const body = {
      author: `urn:li:person:${this.userId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: post.content,
          },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': visibility,
      },
    };

    const result = await this.fetchWithRetry<LinkedInPostResponse>(
      `${API_ENDPOINTS.linkedin.base}${API_ENDPOINTS.linkedin.posts}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<PostedLinkedInPost>;
    }

    return {
      success: true,
      data: {
        id: result.data.id,
        activityUrn: result.data.activity,
        createdAt: result.data.created?.time ?? Date.now(),
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Create a post with an article/link
   */
  async createPostWithArticle(
    post: LinkedInPost,
    articleUrl: string,
    articleTitle: string,
    articleDescription?: string
  ): Promise<ContentProviderResult<PostedLinkedInPost>> {
    if (!this.userId) {
      return {
        success: false,
        error: 'User ID not available. Please reinitialize the provider.',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const body = {
      author: `urn:li:person:${this.userId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: post.content,
          },
          shareMediaCategory: 'ARTICLE',
          media: [
            {
              status: 'READY',
              originalUrl: articleUrl,
              title: {
                text: articleTitle,
              },
              description: articleDescription
                ? { text: articleDescription }
                : undefined,
            },
          ],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    const result = await this.fetchWithRetry<LinkedInPostResponse>(
      `${API_ENDPOINTS.linkedin.base}${API_ENDPOINTS.linkedin.posts}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<PostedLinkedInPost>;
    }

    return {
      success: true,
      data: {
        id: result.data.id,
        activityUrn: result.data.activity,
        createdAt: result.data.created?.time ?? Date.now(),
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Create a poll post
   */
  async createPoll(
    question: string,
    options: string[],
    durationDays: number = 7
  ): Promise<ContentProviderResult<PostedLinkedInPost>> {
    if (!this.userId) {
      return {
        success: false,
        error: 'User ID not available. Please reinitialize the provider.',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    if (options.length < 2 || options.length > 4) {
      return {
        success: false,
        error: 'Polls must have between 2 and 4 options',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    // Note: LinkedIn Poll API has limited availability
    // This is a placeholder for when the API becomes more accessible
    return {
      success: false,
      error: 'Poll creation requires special API access. Please use the LinkedIn website.',
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Delete a post
   */
  async deletePost(postUrn: string): Promise<ContentProviderResult<boolean>> {
    const result = await this.fetchWithRetry<void>(
      `${API_ENDPOINTS.linkedin.base}${API_ENDPOINTS.linkedin.posts}/${encodeURIComponent(postUrn)}`,
      {
        method: 'DELETE',
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<boolean>;
    }

    return {
      success: true,
      data: true,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Like a post
   */
  async likePost(postUrn: string): Promise<ContentProviderResult<boolean>> {
    if (!this.userId) {
      return {
        success: false,
        error: 'User ID not available',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const body = {
      actor: `urn:li:person:${this.userId}`,
      object: postUrn,
    };

    const result = await this.fetchWithRetry<void>(
      `${API_ENDPOINTS.linkedin.base}/socialActions/${encodeURIComponent(postUrn)}/likes`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<boolean>;
    }

    return {
      success: true,
      data: true,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Comment on a post
   */
  async commentOnPost(
    postUrn: string,
    comment: string
  ): Promise<ContentProviderResult<{ commentUrn: string }>> {
    if (!this.userId) {
      return {
        success: false,
        error: 'User ID not available',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const body = {
      actor: `urn:li:person:${this.userId}`,
      object: postUrn,
      message: {
        text: comment,
      },
    };

    const result = await this.fetchWithRetry<{ id: string }>(
      `${API_ENDPOINTS.linkedin.base}/socialActions/${encodeURIComponent(postUrn)}/comments`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<{ commentUrn: string }>;
    }

    return {
      success: true,
      data: { commentUrn: result.data.id },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Share a post (repost)
   */
  async sharePost(
    postUrn: string,
    commentary?: string
  ): Promise<ContentProviderResult<PostedLinkedInPost>> {
    if (!this.userId) {
      return {
        success: false,
        error: 'User ID not available',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const body = {
      author: `urn:li:person:${this.userId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: commentary ? { text: commentary } : undefined,
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
      resharedShare: postUrn,
    };

    const result = await this.fetchWithRetry<LinkedInShareResponse>(
      `${API_ENDPOINTS.linkedin.base}${API_ENDPOINTS.linkedin.shares}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<PostedLinkedInPost>;
    }

    return {
      success: true,
      data: {
        id: result.data.id,
        activityUrn: result.data.activity,
        createdAt: Date.now(),
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get post metrics
   */
  async getPostMetrics(postUrn: string): Promise<ContentProviderResult<EngagementMetrics>> {
    const result = await this.fetchWithRetry<{
      likesSummary?: { totalLikes: number };
      commentsSummary?: { totalFirstLevelComments: number };
      shareStatistics?: { shareCount: number };
    }>(
      `${API_ENDPOINTS.linkedin.base}/socialActions/${encodeURIComponent(postUrn)}`
    );

    if (!result.success) {
      return result as ContentProviderResult<EngagementMetrics>;
    }

    const likes = result.data.likesSummary?.totalLikes ?? 0;
    const comments = result.data.commentsSummary?.totalFirstLevelComments ?? 0;
    const shares = result.data.shareStatistics?.shareCount ?? 0;
    const totalEngagements = likes + comments + shares;

    // Estimate impressions (LinkedIn doesn't provide this via standard API)
    const estimatedImpressions = totalEngagements * 20;

    return {
      success: true,
      data: {
        likes,
        comments,
        shares,
        impressions: estimatedImpressions,
        clicks: 0, // Not available
        engagementRate: totalEngagements / Math.max(estimatedImpressions, 1),
        fetchedAt: Date.now(),
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Send a connection request
   */
  async sendConnectionRequest(
    profileId: string,
    message?: string
  ): Promise<ContentProviderResult<boolean>> {
    // Note: Connection API has limited availability
    // Most apps need special permission for this
    return {
      success: false,
      error: 'Connection requests require special API access',
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get user's connections count
   */
  async getConnectionsCount(): Promise<ContentProviderResult<number>> {
    // This endpoint requires special permissions
    return {
      success: false,
      error: 'Connections count requires special API access',
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Perform an engagement action
   */
  async performEngagementAction(
    action: LinkedInEngagementAction,
    targetUrn: string,
    content?: string
  ): Promise<ContentProviderResult<boolean>> {
    switch (action) {
      case 'like':
        return this.likePost(targetUrn);
      case 'comment':
        if (!content) {
          return {
            success: false,
            error: 'Comment content is required',
            cached: false,
            fetchedAt: Date.now(),
          };
        }
        const commentResult = await this.commentOnPost(targetUrn, content);
        if (commentResult.success) {
          return {
            success: true,
            data: true,
            cached: false,
            fetchedAt: Date.now(),
          };
        }
        return {
          success: false,
          error: commentResult.error,
          cached: false,
          fetchedAt: Date.now(),
        };
      case 'share':
        const shareResult = await this.sharePost(targetUrn, content);
        if (shareResult.success) {
          return {
            success: true,
            data: true,
            cached: false,
            fetchedAt: Date.now(),
          };
        }
        return {
          success: false,
          error: shareResult.error,
          cached: false,
          fetchedAt: Date.now(),
        };
      case 'connect':
        return this.sendConnectionRequest(targetUrn, content);
      case 'message':
        return {
          success: false,
          error: 'Direct messaging requires special API access',
          cached: false,
          fetchedAt: Date.now(),
        };
      default:
        return {
          success: false,
          error: `Unknown action: ${action}`,
          cached: false,
          fetchedAt: Date.now(),
        };
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createLinkedInProvider(config: LinkedInConfig): LinkedInProvider {
  return new LinkedInProvider(config);
}
