/**
 * Content Creator Suite - Ghost Provider
 *
 * Ghost CMS API integration for blog post publishing and management.
 */

import { BaseContentProvider, ContentProviderError } from '../base.js';
import type { GhostConfigSchema } from '../../config.js';
import type { ContentProviderResult, BlogPost, BlogSEO } from '../../types.js';
import { ERROR_CODES, CONTENT_DEFAULTS } from '../../constants.js';
import { z } from 'zod';
import * as crypto from 'crypto';

// =============================================================================
// Types
// =============================================================================

type GhostConfig = z.infer<typeof GhostConfigSchema>;

interface GhostProviderConfig {
  siteUrl: string;
  adminApiKeyEnvVar: string;
  contentApiKeyEnvVar: string;
  timeout: number;
  rateLimitPerMinute: number;
  defaultAuthor?: string;
  defaultTag?: string;
  defaultStatus: 'draft' | 'published' | 'scheduled';
}

interface GhostPostResponse {
  id: string;
  uuid: string;
  title: string;
  slug: string;
  html: string;
  plaintext?: string;
  feature_image?: string;
  featured: boolean;
  status: 'draft' | 'published' | 'scheduled';
  visibility: 'public' | 'members' | 'paid';
  created_at: string;
  updated_at: string;
  published_at?: string;
  custom_excerpt?: string;
  codeinjection_head?: string;
  codeinjection_foot?: string;
  og_image?: string;
  og_title?: string;
  og_description?: string;
  twitter_image?: string;
  twitter_title?: string;
  twitter_description?: string;
  meta_title?: string;
  meta_description?: string;
  canonical_url?: string;
  authors?: GhostAuthor[];
  tags?: GhostTag[];
  primary_author?: GhostAuthor;
  primary_tag?: GhostTag;
  url: string;
  reading_time?: number;
}

interface GhostAuthor {
  id: string;
  name: string;
  slug: string;
  email?: string;
}

interface GhostTag {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

interface GhostPostsResponse {
  posts: GhostPostResponse[];
  meta?: {
    pagination: {
      page: number;
      limit: number;
      pages: number;
      total: number;
    };
  };
}

export interface GhostPublishOptions {
  status?: 'draft' | 'published' | 'scheduled';
  scheduledAt?: number;
  tags?: string[];
  authors?: string[];
  featuredImage?: string;
  visibility?: 'public' | 'members' | 'paid';
  featured?: boolean;
  canonicalUrl?: string;
}

// =============================================================================
// Ghost Provider
// =============================================================================

export class GhostProvider extends BaseContentProvider<GhostProviderConfig> {
  private adminApiKey: string | undefined;
  private contentApiKey: string | undefined;

  constructor(config: GhostConfig) {
    const providerConfig: GhostProviderConfig = {
      siteUrl: config.siteUrl.replace(/\/$/, ''),
      adminApiKeyEnvVar: config.adminApiKeyEnvVar ?? 'GHOST_ADMIN_API_KEY',
      contentApiKeyEnvVar: config.contentApiKeyEnvVar ?? 'GHOST_CONTENT_API_KEY',
      timeout: config.timeout ?? CONTENT_DEFAULTS.API_TIMEOUT,
      rateLimitPerMinute: 100,
      defaultAuthor: config.defaultAuthor,
      defaultTag: config.defaultTag,
      defaultStatus: config.defaultStatus ?? 'draft',
    };
    super(providerConfig);
  }

  get name(): string {
    return 'ghost';
  }

  get type(): string {
    return 'blog';
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  protected async onInitialize(): Promise<void> {
    this.adminApiKey = process.env[this.config.adminApiKeyEnvVar];
    this.contentApiKey = process.env[this.config.contentApiKeyEnvVar];

    if (!this.adminApiKey) {
      throw new ContentProviderError(
        this.name,
        ERROR_CODES.PROVIDER_AUTH_FAILED,
        `Ghost Admin API key not found: ${this.config.adminApiKeyEnvVar}`
      );
    }
  }

  /**
   * Generate JWT token for Ghost Admin API
   */
  private generateJWT(): string {
    if (!this.adminApiKey) {
      throw new ContentProviderError(
        this.name,
        ERROR_CODES.PROVIDER_AUTH_FAILED,
        'Admin API key not initialized'
      );
    }

    // Ghost Admin API key format: {id}:{secret}
    const [id, secret] = this.adminApiKey.split(':');

    if (!id || !secret) {
      throw new ContentProviderError(
        this.name,
        ERROR_CODES.PROVIDER_AUTH_FAILED,
        'Invalid Ghost Admin API key format (expected {id}:{secret})'
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 5 * 60; // 5 minutes

    const header = {
      alg: 'HS256',
      typ: 'JWT',
      kid: id,
    };

    const payload = {
      iat: now,
      exp,
      aud: '/admin/',
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

    const secretBuffer = Buffer.from(secret, 'hex');
    const signature = crypto
      .createHmac('sha256', secretBuffer)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Ghost ${this.generateJWT()}`,
    };
  }

  private get adminApiUrl(): string {
    return `${this.config.siteUrl}/ghost/api/admin`;
  }

  private get contentApiUrl(): string {
    return `${this.config.siteUrl}/ghost/api/content`;
  }

  // ===========================================================================
  // Post Operations
  // ===========================================================================

  /**
   * Publish a new blog post
   */
  async publishPost(
    post: BlogPost,
    options?: GhostPublishOptions
  ): Promise<ContentProviderResult<{ id: string; url: string; slug: string }>> {
    const postData: Record<string, unknown> = {
      title: post.title,
      html: post.content,
      status: options?.status ?? this.config.defaultStatus,
    };

    if (post.slug) {
      postData.slug = post.slug;
    }

    if (post.excerpt) {
      postData.custom_excerpt = post.excerpt;
    }

    if (options?.scheduledAt && options.status === 'scheduled') {
      postData.published_at = new Date(options.scheduledAt).toISOString();
    }

    if (options?.tags && options.tags.length > 0) {
      postData.tags = options.tags.map(t => ({ name: t }));
    } else if (this.config.defaultTag) {
      postData.tags = [{ name: this.config.defaultTag }];
    }

    if (options?.authors && options.authors.length > 0) {
      postData.authors = options.authors.map(a => ({ email: a }));
    }

    if (options?.featuredImage) {
      postData.feature_image = options.featuredImage;
    } else if (post.coverImageUrl) {
      postData.feature_image = post.coverImageUrl;
    }

    if (options?.visibility) {
      postData.visibility = options.visibility;
    }

    if (options?.featured !== undefined) {
      postData.featured = options.featured;
    }

    // Add SEO metadata
    if (post.seo) {
      this.applySeoToPostData(postData, post.seo);
    }

    if (options?.canonicalUrl) {
      postData.canonical_url = options.canonicalUrl;
    }

    const result = await this.fetchWithRetry<GhostPostsResponse>(
      `${this.adminApiUrl}/posts/`,
      {
        method: 'POST',
        body: JSON.stringify({ posts: [postData] }),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<{ id: string; url: string; slug: string }>;
    }

    const createdPost = result.data.posts[0];

    return {
      success: true,
      data: {
        id: createdPost.id,
        url: createdPost.url,
        slug: createdPost.slug,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Update an existing post
   */
  async updatePost(
    postId: string,
    updates: Partial<BlogPost>,
    options?: Partial<GhostPublishOptions>
  ): Promise<ContentProviderResult<{ id: string; url: string; slug: string }>> {
    // First get the current post to get updated_at
    const currentPost = await this.getPost(postId);
    if (!currentPost.success) {
      return currentPost as ContentProviderResult<{ id: string; url: string; slug: string }>;
    }

    const postData: Record<string, unknown> = {
      updated_at: new Date(currentPost.data.updatedAt).toISOString(),
    };

    if (updates.title !== undefined) postData.title = updates.title;
    if (updates.content !== undefined) postData.html = updates.content;
    if (updates.slug !== undefined) postData.slug = updates.slug;
    if (updates.excerpt !== undefined) postData.custom_excerpt = updates.excerpt;
    if (updates.coverImageUrl !== undefined) postData.feature_image = updates.coverImageUrl;

    if (updates.status !== undefined) {
      const statusMap: Record<string, string> = {
        draft: 'draft',
        published: 'published',
        scheduled: 'scheduled',
        private: 'draft',
      };
      postData.status = statusMap[updates.status] ?? updates.status;
    }

    if (options?.tags) {
      postData.tags = options.tags.map(t => ({ name: t }));
    }

    if (options?.visibility) {
      postData.visibility = options.visibility;
    }

    if (options?.featured !== undefined) {
      postData.featured = options.featured;
    }

    if (updates.seo) {
      this.applySeoToPostData(postData, updates.seo);
    }

    const result = await this.fetchWithRetry<GhostPostsResponse>(
      `${this.adminApiUrl}/posts/${postId}/`,
      {
        method: 'PUT',
        body: JSON.stringify({ posts: [postData] }),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<{ id: string; url: string; slug: string }>;
    }

    const updatedPost = result.data.posts[0];

    return {
      success: true,
      data: {
        id: updatedPost.id,
        url: updatedPost.url,
        slug: updatedPost.slug,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get a post by ID
   */
  async getPost(postId: string): Promise<ContentProviderResult<BlogPost>> {
    const result = await this.fetchWithRetry<GhostPostsResponse>(
      `${this.adminApiUrl}/posts/${postId}/?formats=html`
    );

    if (!result.success) {
      return result as ContentProviderResult<BlogPost>;
    }

    const post = this.responseToPost(result.data.posts[0]);

    return {
      success: true,
      data: post,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get a post by slug
   */
  async getPostBySlug(slug: string): Promise<ContentProviderResult<BlogPost>> {
    const result = await this.fetchWithRetry<GhostPostsResponse>(
      `${this.adminApiUrl}/posts/slug/${slug}/?formats=html`
    );

    if (!result.success) {
      return result as ContentProviderResult<BlogPost>;
    }

    const post = this.responseToPost(result.data.posts[0]);

    return {
      success: true,
      data: post,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get posts with filters
   */
  async getPosts(options?: {
    status?: 'draft' | 'published' | 'scheduled';
    tag?: string;
    author?: string;
    limit?: number;
    page?: number;
    order?: 'published_at desc' | 'published_at asc' | 'created_at desc' | 'created_at asc';
  }): Promise<ContentProviderResult<BlogPost[]>> {
    const params = new URLSearchParams();
    params.set('formats', 'html');

    const filters: string[] = [];
    if (options?.status) {
      filters.push(`status:${options.status}`);
    }
    if (options?.tag) {
      filters.push(`tag:${options.tag}`);
    }
    if (options?.author) {
      filters.push(`author:${options.author}`);
    }

    if (filters.length > 0) {
      params.set('filter', filters.join('+'));
    }

    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.page) params.set('page', String(options.page));
    if (options?.order) params.set('order', options.order);

    const result = await this.fetchWithRetry<GhostPostsResponse>(
      `${this.adminApiUrl}/posts/?${params}`
    );

    if (!result.success) {
      return result as ContentProviderResult<BlogPost[]>;
    }

    const posts = result.data.posts.map(post => this.responseToPost(post));

    return {
      success: true,
      data: posts,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Delete a post
   */
  async deletePost(postId: string): Promise<ContentProviderResult<boolean>> {
    const result = await this.fetchWithRetry<null>(
      `${this.adminApiUrl}/posts/${postId}/`,
      { method: 'DELETE' }
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

  // ===========================================================================
  // Tag Operations
  // ===========================================================================

  /**
   * Get all tags
   */
  async getTags(): Promise<ContentProviderResult<GhostTag[]>> {
    const result = await this.fetchWithRetry<{ tags: GhostTag[] }>(
      `${this.adminApiUrl}/tags/?limit=all`
    );

    if (!result.success) {
      return result as ContentProviderResult<GhostTag[]>;
    }

    return {
      success: true,
      data: result.data.tags,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Create a tag
   */
  async createTag(name: string, description?: string): Promise<ContentProviderResult<GhostTag>> {
    const tagData: Record<string, string> = { name };
    if (description) tagData.description = description;

    const result = await this.fetchWithRetry<{ tags: GhostTag[] }>(
      `${this.adminApiUrl}/tags/`,
      {
        method: 'POST',
        body: JSON.stringify({ tags: [tagData] }),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<GhostTag>;
    }

    return {
      success: true,
      data: result.data.tags[0],
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  // ===========================================================================
  // Author Operations
  // ===========================================================================

  /**
   * Get all authors
   */
  async getAuthors(): Promise<ContentProviderResult<GhostAuthor[]>> {
    const result = await this.fetchWithRetry<{ authors: GhostAuthor[] }>(
      `${this.adminApiUrl}/authors/?limit=all`
    );

    if (!result.success) {
      return result as ContentProviderResult<GhostAuthor[]>;
    }

    return {
      success: true,
      data: result.data.authors,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Convert Ghost response to BlogPost
   */
  private responseToPost(response: GhostPostResponse): BlogPost {
    const seo: BlogSEO = {};

    if (response.meta_title) seo.metaTitle = response.meta_title;
    if (response.meta_description) seo.metaDescription = response.meta_description;
    if (response.canonical_url) seo.canonicalUrl = response.canonical_url;
    if (response.og_title) seo.ogTitle = response.og_title;
    if (response.og_description) seo.ogDescription = response.og_description;
    if (response.og_image) seo.ogImage = response.og_image;

    return {
      id: response.id,
      title: response.title,
      slug: response.slug,
      content: response.html,
      excerpt: response.custom_excerpt,
      coverImageUrl: response.feature_image,
      author: response.primary_author?.name,
      tags: response.tags?.map(t => t.name),
      status: response.status,
      publishedAt: response.published_at ? new Date(response.published_at).getTime() : undefined,
      seo: Object.keys(seo).length > 0 ? seo : undefined,
      platform: 'ghost',
      externalId: response.id,
      createdAt: new Date(response.created_at).getTime(),
      updatedAt: new Date(response.updated_at).getTime(),
    };
  }

  /**
   * Apply SEO settings to post data
   */
  private applySeoToPostData(postData: Record<string, unknown>, seo: BlogSEO): void {
    if (seo.metaTitle) postData.meta_title = seo.metaTitle;
    if (seo.metaDescription) postData.meta_description = seo.metaDescription;
    if (seo.canonicalUrl) postData.canonical_url = seo.canonicalUrl;
    if (seo.ogTitle) postData.og_title = seo.ogTitle;
    if (seo.ogDescription) postData.og_description = seo.ogDescription;
    if (seo.ogImage) postData.og_image = seo.ogImage;
    if (seo.twitterCard) {
      postData.twitter_title = seo.ogTitle ?? seo.metaTitle;
      postData.twitter_description = seo.ogDescription ?? seo.metaDescription;
    }
  }

  /**
   * Get the site URL
   */
  getSiteUrl(): string {
    return this.config.siteUrl;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createGhostProvider(config: GhostConfig): GhostProvider {
  return new GhostProvider(config);
}
