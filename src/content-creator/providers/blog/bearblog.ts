/**
 * Content Creator Suite - Bear Blog Provider
 *
 * Bear Blog API integration for minimalist blog publishing.
 */

import { BaseContentProvider, ContentProviderError } from '../base.js';
import type { BearBlogConfigSchema } from '../../config.js';
import type { ContentProviderResult, BlogPost, BlogSEO } from '../../types.js';
import { ERROR_CODES, CONTENT_DEFAULTS } from '../../constants.js';
import { z } from 'zod';

// =============================================================================
// Types
// =============================================================================

type BearBlogConfig = z.infer<typeof BearBlogConfigSchema>;

interface BearBlogProviderConfig {
  siteUrl: string;
  apiKeyEnvVar: string;
  timeout: number;
  rateLimitPerMinute: number;
  defaultStatus: 'draft' | 'published';
}

interface BearBlogPostResponse {
  uid: string;
  title: string;
  slug: string;
  content: string;
  published_date?: string;
  created_date: string;
  is_page: boolean;
  make_discoverable: boolean;
  show_in_feed: boolean;
  canonical_url?: string;
  meta_description?: string;
  meta_image?: string;
  tags?: string[];
  url: string;
}

interface BearBlogPostsResponse {
  posts: BearBlogPostResponse[];
  next_cursor?: string;
}

export interface BearBlogPublishOptions {
  isPublished?: boolean;
  isPage?: boolean;
  makeDiscoverable?: boolean;
  showInFeed?: boolean;
  tags?: string[];
  canonicalUrl?: string;
  metaDescription?: string;
  metaImage?: string;
}

// =============================================================================
// Bear Blog Provider
// =============================================================================

export class BearBlogProvider extends BaseContentProvider<BearBlogProviderConfig> {
  private bearApiKey: string | undefined;

  constructor(config: BearBlogConfig) {
    const providerConfig: BearBlogProviderConfig = {
      siteUrl: config.siteUrl.replace(/\/$/, ''),
      apiKeyEnvVar: config.apiKeyEnvVar ?? 'BEARBLOG_API_KEY',
      timeout: config.timeout ?? CONTENT_DEFAULTS.API_TIMEOUT,
      rateLimitPerMinute: 60,
      defaultStatus: config.defaultStatus ?? 'draft',
    };
    super(providerConfig);
  }

  get name(): string {
    return 'bearblog';
  }

  get type(): string {
    return 'blog';
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  protected async onInitialize(): Promise<void> {
    this.bearApiKey = process.env[this.config.apiKeyEnvVar];

    if (!this.bearApiKey) {
      throw new ContentProviderError(
        this.name,
        ERROR_CODES.PROVIDER_AUTH_FAILED,
        `Bear Blog API key not found: ${this.config.apiKeyEnvVar}`
      );
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.bearApiKey}`,
    };
  }

  private get apiUrl(): string {
    return `${this.config.siteUrl}/api`;
  }

  // ===========================================================================
  // Post Operations
  // ===========================================================================

  /**
   * Publish a new blog post
   */
  async publishPost(
    post: BlogPost,
    options?: BearBlogPublishOptions
  ): Promise<ContentProviderResult<{ uid: string; url: string; slug: string }>> {
    const postData: Record<string, unknown> = {
      title: post.title,
      content: post.content,
      is_page: options?.isPage ?? false,
      make_discoverable: options?.makeDiscoverable ?? true,
      show_in_feed: options?.showInFeed ?? true,
    };

    // Handle publish status
    const isPublished = options?.isPublished ?? (this.config.defaultStatus === 'published');
    if (isPublished) {
      postData.published_date = new Date().toISOString();
    }

    if (post.slug) {
      postData.slug = post.slug;
    }

    if (options?.tags && options.tags.length > 0) {
      postData.tags = options.tags;
    } else if (post.tags && post.tags.length > 0) {
      postData.tags = post.tags;
    }

    // SEO metadata
    if (post.seo?.canonicalUrl || options?.canonicalUrl) {
      postData.canonical_url = options?.canonicalUrl ?? post.seo?.canonicalUrl;
    }

    if (post.seo?.metaDescription || options?.metaDescription) {
      postData.meta_description = options?.metaDescription ?? post.seo?.metaDescription;
    }

    if (post.seo?.ogImage || options?.metaImage) {
      postData.meta_image = options?.metaImage ?? post.seo?.ogImage;
    }

    const result = await this.fetchWithRetry<BearBlogPostResponse>(
      `${this.apiUrl}/posts/`,
      {
        method: 'POST',
        body: JSON.stringify(postData),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<{ uid: string; url: string; slug: string }>;
    }

    return {
      success: true,
      data: {
        uid: result.data.uid,
        url: result.data.url,
        slug: result.data.slug,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Update an existing post
   */
  async updatePost(
    postUid: string,
    updates: Partial<BlogPost>,
    options?: Partial<BearBlogPublishOptions>
  ): Promise<ContentProviderResult<{ uid: string; url: string; slug: string }>> {
    const postData: Record<string, unknown> = {};

    if (updates.title !== undefined) postData.title = updates.title;
    if (updates.content !== undefined) postData.content = updates.content;
    if (updates.slug !== undefined) postData.slug = updates.slug;

    if (options?.isPublished !== undefined) {
      if (options.isPublished) {
        postData.published_date = new Date().toISOString();
      } else {
        postData.published_date = null;
      }
    }

    if (options?.isPage !== undefined) postData.is_page = options.isPage;
    if (options?.makeDiscoverable !== undefined) postData.make_discoverable = options.makeDiscoverable;
    if (options?.showInFeed !== undefined) postData.show_in_feed = options.showInFeed;

    if (options?.tags || updates.tags) {
      postData.tags = options?.tags ?? updates.tags;
    }

    if (options?.canonicalUrl !== undefined || updates.seo?.canonicalUrl) {
      postData.canonical_url = options?.canonicalUrl ?? updates.seo?.canonicalUrl;
    }

    if (options?.metaDescription !== undefined || updates.seo?.metaDescription) {
      postData.meta_description = options?.metaDescription ?? updates.seo?.metaDescription;
    }

    if (options?.metaImage !== undefined || updates.seo?.ogImage) {
      postData.meta_image = options?.metaImage ?? updates.seo?.ogImage;
    }

    const result = await this.fetchWithRetry<BearBlogPostResponse>(
      `${this.apiUrl}/posts/${postUid}/`,
      {
        method: 'PATCH',
        body: JSON.stringify(postData),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<{ uid: string; url: string; slug: string }>;
    }

    return {
      success: true,
      data: {
        uid: result.data.uid,
        url: result.data.url,
        slug: result.data.slug,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get a post by UID
   */
  async getPost(postUid: string): Promise<ContentProviderResult<BlogPost>> {
    const result = await this.fetchWithRetry<BearBlogPostResponse>(
      `${this.apiUrl}/posts/${postUid}/`
    );

    if (!result.success) {
      return result as ContentProviderResult<BlogPost>;
    }

    const post = this.responseToPost(result.data);

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
    const result = await this.fetchWithRetry<BearBlogPostResponse>(
      `${this.apiUrl}/posts/slug/${slug}/`
    );

    if (!result.success) {
      return result as ContentProviderResult<BlogPost>;
    }

    const post = this.responseToPost(result.data);

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
    isPublished?: boolean;
    isPage?: boolean;
    tag?: string;
    limit?: number;
    cursor?: string;
  }): Promise<ContentProviderResult<{ posts: BlogPost[]; nextCursor?: string }>> {
    const params = new URLSearchParams();

    if (options?.isPublished !== undefined) {
      params.set('is_published', String(options.isPublished));
    }
    if (options?.isPage !== undefined) {
      params.set('is_page', String(options.isPage));
    }
    if (options?.tag) {
      params.set('tag', options.tag);
    }
    if (options?.limit) {
      params.set('limit', String(options.limit));
    }
    if (options?.cursor) {
      params.set('cursor', options.cursor);
    }

    const result = await this.fetchWithRetry<BearBlogPostsResponse>(
      `${this.apiUrl}/posts/?${params}`
    );

    if (!result.success) {
      return result as ContentProviderResult<{ posts: BlogPost[]; nextCursor?: string }>;
    }

    const posts = result.data.posts.map(post => this.responseToPost(post));

    return {
      success: true,
      data: {
        posts,
        nextCursor: result.data.next_cursor,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Delete a post
   */
  async deletePost(postUid: string): Promise<ContentProviderResult<boolean>> {
    const result = await this.fetchWithRetry<null>(
      `${this.apiUrl}/posts/${postUid}/`,
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

  /**
   * Publish a draft (set published_date)
   */
  async publishDraft(postUid: string): Promise<ContentProviderResult<{ uid: string; url: string; slug: string }>> {
    return this.updatePost(postUid, {}, { isPublished: true });
  }

  /**
   * Unpublish a post (remove published_date)
   */
  async unpublishPost(postUid: string): Promise<ContentProviderResult<{ uid: string; url: string; slug: string }>> {
    return this.updatePost(postUid, {}, { isPublished: false });
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Convert Bear Blog response to BlogPost
   */
  private responseToPost(response: BearBlogPostResponse): BlogPost {
    const seo: BlogSEO = {};

    if (response.meta_description) seo.metaDescription = response.meta_description;
    if (response.canonical_url) seo.canonicalUrl = response.canonical_url;
    if (response.meta_image) seo.ogImage = response.meta_image;

    const isPublished = !!response.published_date;

    return {
      id: response.uid,
      title: response.title,
      slug: response.slug,
      content: response.content,
      tags: response.tags,
      status: isPublished ? 'published' : 'draft',
      publishedAt: response.published_date
        ? new Date(response.published_date).getTime()
        : undefined,
      seo: Object.keys(seo).length > 0 ? seo : undefined,
      platform: 'bearblog',
      externalId: response.uid,
      createdAt: new Date(response.created_date).getTime(),
      updatedAt: new Date(response.created_date).getTime(), // Bear Blog doesn't expose updated_date
    };
  }

  /**
   * Generate a slug from a title
   */
  generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, CONTENT_DEFAULTS.BLOG_SLUG_MAX_LENGTH);
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

export function createBearBlogProvider(config: BearBlogConfig): BearBlogProvider {
  return new BearBlogProvider(config);
}
