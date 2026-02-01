/**
 * Bluesky API Integration
 *
 * Post, reply, repost using AT Protocol
 */

import type {
  PostContent,
  PlatformPost,
  PlatformAnalytics,
  SocialInteraction,
  MediaAttachment,
} from '../types.js';
import { SocialMediaError, SOCIAL_ERROR_CODES, PLATFORM_LIMITS } from '../types.js';

const BSKY_API_BASE = 'https://bsky.social/xrpc';

export interface BlueskyConfig {
  identifier: string; // handle or DID
  password?: string; // App password
  accessJwt?: string;
  refreshJwt?: string;
  did?: string;
}

export interface BlueskyProfile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  followersCount: number;
  followsCount: number;
  postsCount: number;
}

export interface BlueskyPost {
  uri: string;
  cid: string;
  author: BlueskyProfile;
  record: {
    text: string;
    createdAt: string;
    embed?: unknown;
    reply?: {
      root: { uri: string; cid: string };
      parent: { uri: string; cid: string };
    };
    facets?: Array<{
      index: { byteStart: number; byteEnd: number };
      features: Array<{ $type: string; uri?: string; tag?: string }>;
    }>;
  };
  replyCount: number;
  repostCount: number;
  likeCount: number;
  indexedAt: string;
}

export interface BlueskySession {
  accessJwt: string;
  refreshJwt: string;
  did: string;
  handle: string;
}

export class BlueskyApi {
  private config: BlueskyConfig;
  private accessJwt?: string;
  private did?: string;

  constructor(config: BlueskyConfig) {
    this.config = config;
    this.accessJwt = config.accessJwt;
    this.did = config.did;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    requireAuth = true,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (requireAuth && this.accessJwt) {
      headers['Authorization'] = `Bearer ${this.accessJwt}`;
    }

    const response = await fetch(`${BSKY_API_BASE}/${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: string; message?: string };

      if (response.status === 401) {
        throw new SocialMediaError(
          'Bluesky authentication failed',
          SOCIAL_ERROR_CODES.AUTH_FAILED,
          'bluesky',
        );
      }

      if (response.status === 429) {
        throw new SocialMediaError(
          'Bluesky rate limit exceeded',
          SOCIAL_ERROR_CODES.RATE_LIMITED,
          'bluesky',
        );
      }

      throw new SocialMediaError(
        `Bluesky API error: ${error.message || error.error || response.statusText}`,
        SOCIAL_ERROR_CODES.PLATFORM_ERROR,
        'bluesky',
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Create session (login)
   */
  async createSession(): Promise<BlueskySession> {
    if (!this.config.password) {
      throw new SocialMediaError(
        'Password required for Bluesky login',
        SOCIAL_ERROR_CODES.AUTH_FAILED,
        'bluesky',
      );
    }

    const session = await this.request<BlueskySession>(
      'POST',
      'com.atproto.server.createSession',
      {
        identifier: this.config.identifier,
        password: this.config.password,
      },
      false,
    );

    this.accessJwt = session.accessJwt;
    this.did = session.did;

    return session;
  }

  /**
   * Refresh session
   */
  async refreshSession(): Promise<BlueskySession> {
    if (!this.config.refreshJwt) {
      throw new SocialMediaError(
        'Refresh token required',
        SOCIAL_ERROR_CODES.AUTH_FAILED,
        'bluesky',
      );
    }

    const response = await fetch(`${BSKY_API_BASE}/com.atproto.server.refreshSession`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.refreshJwt}`,
      },
    });

    if (!response.ok) {
      throw new SocialMediaError(
        'Failed to refresh Bluesky session',
        SOCIAL_ERROR_CODES.AUTH_FAILED,
        'bluesky',
      );
    }

    const session = await response.json() as BlueskySession;
    this.accessJwt = session.accessJwt;
    this.did = session.did;

    return session;
  }

  /**
   * Get profile
   */
  async getProfile(actor?: string): Promise<BlueskyProfile> {
    const response = await this.request<BlueskyProfile>(
      'GET',
      `app.bsky.actor.getProfile?actor=${actor || this.did || this.config.identifier}`,
    );
    return response;
  }

  /**
   * Create a post
   */
  async createPost(content: PostContent): Promise<PlatformPost> {
    if (!this.did) {
      await this.createSession();
    }

    const text = this.formatPostText(content);

    if (text.length > PLATFORM_LIMITS.bluesky.maxTextLength) {
      throw new SocialMediaError(
        `Post exceeds ${PLATFORM_LIMITS.bluesky.maxTextLength} characters`,
        SOCIAL_ERROR_CODES.INVALID_CONTENT,
        'bluesky',
      );
    }

    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: new Date().toISOString(),
    };

    // Parse facets (mentions, links, hashtags)
    const facets = this.parseFacets(text, content);
    if (facets.length > 0) {
      record.facets = facets;
    }

    // Handle images
    if (content.media && content.media.length > 0) {
      const images = await this.uploadImages(content.media);
      if (images.length > 0) {
        record.embed = {
          $type: 'app.bsky.embed.images',
          images: images.map((img, i) => ({
            image: img,
            alt: content.media![i].altText || '',
          })),
        };
      }
    }

    // Handle link embed
    if (content.link && !record.embed) {
      record.embed = {
        $type: 'app.bsky.embed.external',
        external: {
          uri: content.link,
          title: content.linkPreview?.title || content.link,
          description: content.linkPreview?.description || '',
        },
      };
    }

    const response = await this.request<{ uri: string; cid: string }>(
      'POST',
      'com.atproto.repo.createRecord',
      {
        repo: this.did,
        collection: 'app.bsky.feed.post',
        record,
      },
    );

    // Extract rkey from URI
    const rkey = response.uri.split('/').pop();

    return {
      platform: 'bluesky',
      platformPostId: response.uri,
      url: `https://bsky.app/profile/${this.config.identifier}/post/${rkey}`,
      status: 'published',
      publishedAt: Date.now(),
    };
  }

  /**
   * Reply to a post
   */
  async replyToPost(parentUri: string, parentCid: string, text: string): Promise<PlatformPost> {
    if (!this.did) {
      await this.createSession();
    }

    // Get root post for thread
    const parentPost = await this.getPost(parentUri);
    const rootUri = parentPost.record.reply?.root.uri || parentUri;
    const rootCid = parentPost.record.reply?.root.cid || parentCid;

    const record = {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: new Date().toISOString(),
      reply: {
        root: { uri: rootUri, cid: rootCid },
        parent: { uri: parentUri, cid: parentCid },
      },
    };

    const response = await this.request<{ uri: string; cid: string }>(
      'POST',
      'com.atproto.repo.createRecord',
      {
        repo: this.did,
        collection: 'app.bsky.feed.post',
        record,
      },
    );

    const rkey = response.uri.split('/').pop();

    return {
      platform: 'bluesky',
      platformPostId: response.uri,
      url: `https://bsky.app/profile/${this.config.identifier}/post/${rkey}`,
      status: 'published',
      publishedAt: Date.now(),
    };
  }

  /**
   * Repost
   */
  async repost(uri: string, cid: string): Promise<void> {
    if (!this.did) {
      await this.createSession();
    }

    await this.request('POST', 'com.atproto.repo.createRecord', {
      repo: this.did,
      collection: 'app.bsky.feed.repost',
      record: {
        subject: { uri, cid },
        createdAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Like a post
   */
  async like(uri: string, cid: string): Promise<void> {
    if (!this.did) {
      await this.createSession();
    }

    await this.request('POST', 'com.atproto.repo.createRecord', {
      repo: this.did,
      collection: 'app.bsky.feed.like',
      record: {
        subject: { uri, cid },
        createdAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Delete a post
   */
  async deletePost(uri: string): Promise<void> {
    const rkey = uri.split('/').pop();

    await this.request('POST', 'com.atproto.repo.deleteRecord', {
      repo: this.did,
      collection: 'app.bsky.feed.post',
      rkey,
    });
  }

  /**
   * Get a post
   */
  async getPost(uri: string): Promise<BlueskyPost> {
    const response = await this.request<{ posts: BlueskyPost[] }>(
      'GET',
      `app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`,
    );
    return response.posts[0];
  }

  /**
   * Get notifications (mentions, replies, etc.)
   */
  async getNotifications(limit = 50): Promise<SocialInteraction[]> {
    const response = await this.request<{
      notifications: Array<{
        uri: string;
        cid: string;
        author: BlueskyProfile;
        reason: 'mention' | 'reply' | 'repost' | 'like' | 'follow';
        record?: { text?: string };
        indexedAt: string;
        isRead: boolean;
      }>;
    }>('GET', `app.bsky.notification.listNotifications?limit=${limit}`);

    return response.notifications
      .filter(n => ['mention', 'reply'].includes(n.reason))
      .map(n => ({
        id: n.uri,
        platform: 'bluesky' as const,
        type: n.reason as 'mention' | 'reply',
        platformInteractionId: n.uri,
        authorId: n.author.did,
        authorUsername: n.author.handle,
        authorDisplayName: n.author.displayName,
        authorAvatarUrl: n.author.avatar,
        content: n.record?.text || '',
        createdAt: new Date(n.indexedAt).getTime(),
        replied: false,
      }));
  }

  /**
   * Get post analytics
   */
  async getPostAnalytics(uri: string): Promise<PlatformAnalytics> {
    const post = await this.getPost(uri);

    return {
      platform: 'bluesky',
      impressions: 0, // Not available in Bluesky API
      reach: 0,
      engagement: post.likeCount + post.repostCount + post.replyCount,
      likes: post.likeCount,
      comments: post.replyCount,
      shares: post.repostCount,
      clicks: 0,
      updatedAt: Date.now(),
    };
  }

  /**
   * Upload images
   */
  private async uploadImages(media: MediaAttachment[]): Promise<Array<{ $type: string; ref: { $link: string }; mimeType: string; size: number }>> {
    const blobs: Array<{ $type: string; ref: { $link: string }; mimeType: string; size: number }> = [];

    for (const item of media.slice(0, PLATFORM_LIMITS.bluesky.maxImages)) {
      if (item.type !== 'image') continue;

      // Fetch image
      const imageResponse = await fetch(item.url);
      const imageBlob = await imageResponse.blob();

      // Upload to Bluesky
      const uploadResponse = await fetch(`${BSKY_API_BASE}/com.atproto.repo.uploadBlob`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessJwt}`,
          'Content-Type': item.mimeType || 'image/jpeg',
        },
        body: imageBlob,
      });

      if (uploadResponse.ok) {
        const data = await uploadResponse.json() as { blob: { $type: string; ref: { $link: string }; mimeType: string; size: number } };
        blobs.push(data.blob);
      }
    }

    return blobs;
  }

  /**
   * Format post text
   */
  private formatPostText(content: PostContent): string {
    let text = content.text;

    if (content.hashtags && content.hashtags.length > 0) {
      const tags = content.hashtags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ');
      if (text.length + tags.length + 1 <= PLATFORM_LIMITS.bluesky.maxTextLength) {
        text = `${text} ${tags}`;
      }
    }

    return text;
  }

  /**
   * Parse facets (rich text features)
   */
  private parseFacets(text: string, content: PostContent): Array<{
    index: { byteStart: number; byteEnd: number };
    features: Array<{ $type: string; uri?: string; tag?: string; did?: string }>;
  }> {
    const facets: Array<{
      index: { byteStart: number; byteEnd: number };
      features: Array<{ $type: string; uri?: string; tag?: string; did?: string }>;
    }> = [];

    // Find URLs
    const urlRegex = /https?:\/\/[^\s]+/g;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      const byteStart = Buffer.byteLength(text.slice(0, match.index));
      const byteEnd = byteStart + Buffer.byteLength(match[0]);
      facets.push({
        index: { byteStart, byteEnd },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: match[0] }],
      });
    }

    // Find hashtags
    const hashtagRegex = /#[a-zA-Z0-9_]+/g;
    while ((match = hashtagRegex.exec(text)) !== null) {
      const byteStart = Buffer.byteLength(text.slice(0, match.index));
      const byteEnd = byteStart + Buffer.byteLength(match[0]);
      facets.push({
        index: { byteStart, byteEnd },
        features: [{ $type: 'app.bsky.richtext.facet#tag', tag: match[0].slice(1) }],
      });
    }

    // Find mentions
    const mentionRegex = /@[a-zA-Z0-9._-]+/g;
    while ((match = mentionRegex.exec(text)) !== null) {
      const byteStart = Buffer.byteLength(text.slice(0, match.index));
      const byteEnd = byteStart + Buffer.byteLength(match[0]);
      facets.push({
        index: { byteStart, byteEnd },
        features: [{ $type: 'app.bsky.richtext.facet#mention', did: match[0].slice(1) }],
      });
    }

    return facets;
  }

  /**
   * Verify credentials
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      if (!this.accessJwt) {
        await this.createSession();
      }
      await this.getProfile();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create Bluesky API client
 */
export function createBlueskyApi(config: BlueskyConfig): BlueskyApi {
  return new BlueskyApi(config);
}
