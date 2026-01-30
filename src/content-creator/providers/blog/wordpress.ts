/**
 * Content Creator Suite - WordPress Provider
 *
 * WordPress REST API integration for blog post publishing and management.
 */

import { BaseContentProvider, ContentProviderError } from '../base.js';
import type { WordPressConfigSchema } from '../../config.js';
import type { ContentProviderResult, BlogPost, BlogSEO } from '../../types.js';
import { ERROR_CODES, CONTENT_DEFAULTS } from '../../constants.js';
import { z } from 'zod';

// =============================================================================
// Types
// =============================================================================

type WordPressConfig = z.infer<typeof WordPressConfigSchema>;

interface WordPressProviderConfig {
  siteUrl: string;
  usernameEnvVar: string;
  applicationPasswordEnvVar: string;
  timeout: number;
  rateLimitPerMinute: number;
  defaultAuthor?: string;
  defaultCategory?: string;
  defaultStatus: 'draft' | 'publish' | 'pending' | 'private';
}

interface WordPressPostResponse {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: string;
  type: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  author: number;
  featured_media: number;
  categories: number[];
  tags: number[];
  meta: Record<string, unknown>;
}

interface WordPressCategory {
  id: number;
  name: string;
  slug: string;
}

interface WordPressTag {
  id: number;
  name: string;
  slug: string;
}

interface WordPressMedia {
  id: number;
  source_url: string;
  alt_text: string;
}

export interface WordPressPublishOptions {
  status?: 'draft' | 'publish' | 'pending' | 'private' | 'future';
  scheduledAt?: number;
  categoryIds?: number[];
  tagIds?: number[];
  featuredMediaId?: number;
  author?: number;
  meta?: Record<string, unknown>;
}

// =============================================================================
// WordPress Provider
// =============================================================================

export class WordPressProvider extends BaseContentProvider<WordPressProviderConfig> {
  private username: string | undefined;
  private applicationPassword: string | undefined;

  constructor(config: WordPressConfig) {
    const providerConfig: WordPressProviderConfig = {
      siteUrl: config.siteUrl.replace(/\/$/, ''), // Remove trailing slash
      usernameEnvVar: config.usernameEnvVar ?? 'WORDPRESS_USERNAME',
      applicationPasswordEnvVar: config.applicationPasswordEnvVar ?? 'WORDPRESS_APP_PASSWORD',
      timeout: config.timeout ?? CONTENT_DEFAULTS.API_TIMEOUT,
      rateLimitPerMinute: 60,
      defaultAuthor: config.defaultAuthor,
      defaultCategory: config.defaultCategory,
      defaultStatus: config.defaultStatus ?? 'draft',
    };
    super(providerConfig);
  }

  get name(): string {
    return 'wordpress';
  }

  get type(): string {
    return 'blog';
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  protected async onInitialize(): Promise<void> {
    this.username = process.env[this.config.usernameEnvVar];
    this.applicationPassword = process.env[this.config.applicationPasswordEnvVar];

    if (!this.username || !this.applicationPassword) {
      throw new ContentProviderError(
        this.name,
        ERROR_CODES.PROVIDER_AUTH_FAILED,
        `WordPress credentials not found: ${this.config.usernameEnvVar} and/or ${this.config.applicationPasswordEnvVar}`
      );
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    if (!this.username || !this.applicationPassword) {
      return {};
    }
    const credentials = Buffer.from(`${this.username}:${this.applicationPassword}`).toString('base64');
    return {
      Authorization: `Basic ${credentials}`,
    };
  }

  private get apiUrl(): string {
    return `${this.config.siteUrl}/wp-json/wp/v2`;
  }

  // ===========================================================================
  // Post Operations
  // ===========================================================================

  /**
   * Publish a new blog post
   */
  async publishPost(
    post: BlogPost,
    options?: WordPressPublishOptions
  ): Promise<ContentProviderResult<{ id: number; url: string; slug: string }>> {
    const body: Record<string, unknown> = {
      title: post.title,
      content: post.content,
      excerpt: post.excerpt,
      status: options?.status ?? this.config.defaultStatus,
    };

    if (post.slug) {
      body.slug = post.slug;
    }

    if (options?.scheduledAt && options.status === 'future') {
      body.date = new Date(options.scheduledAt).toISOString();
    }

    if (options?.categoryIds && options.categoryIds.length > 0) {
      body.categories = options.categoryIds;
    }

    if (options?.tagIds && options.tagIds.length > 0) {
      body.tags = options.tagIds;
    }

    if (options?.featuredMediaId) {
      body.featured_media = options.featuredMediaId;
    }

    if (options?.author) {
      body.author = options.author;
    }

    // Add SEO metadata if available
    if (post.seo) {
      body.meta = {
        ...options?.meta,
        ...this.buildSeoMeta(post.seo),
      };
    }

    const result = await this.fetchWithRetry<WordPressPostResponse>(
      `${this.apiUrl}/posts`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<{ id: number; url: string; slug: string }>;
    }

    return {
      success: true,
      data: {
        id: result.data.id,
        url: result.data.link,
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
    postId: number,
    updates: Partial<BlogPost>,
    options?: Partial<WordPressPublishOptions>
  ): Promise<ContentProviderResult<{ id: number; url: string; slug: string }>> {
    const body: Record<string, unknown> = {};

    if (updates.title !== undefined) body.title = updates.title;
    if (updates.content !== undefined) body.content = updates.content;
    if (updates.excerpt !== undefined) body.excerpt = updates.excerpt;
    if (updates.slug !== undefined) body.slug = updates.slug;
    if (updates.status !== undefined) {
      const statusMap: Record<string, string> = {
        draft: 'draft',
        published: 'publish',
        scheduled: 'future',
        private: 'private',
      };
      body.status = statusMap[updates.status] ?? updates.status;
    }

    if (options?.categoryIds) body.categories = options.categoryIds;
    if (options?.tagIds) body.tags = options.tagIds;
    if (options?.featuredMediaId) body.featured_media = options.featuredMediaId;

    if (updates.seo) {
      body.meta = this.buildSeoMeta(updates.seo);
    }

    const result = await this.fetchWithRetry<WordPressPostResponse>(
      `${this.apiUrl}/posts/${postId}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<{ id: number; url: string; slug: string }>;
    }

    return {
      success: true,
      data: {
        id: result.data.id,
        url: result.data.link,
        slug: result.data.slug,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get a post by ID
   */
  async getPost(postId: number): Promise<ContentProviderResult<BlogPost>> {
    const result = await this.fetchWithRetry<WordPressPostResponse>(
      `${this.apiUrl}/posts/${postId}`
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
    status?: string;
    category?: number;
    tag?: number;
    search?: string;
    author?: number;
    perPage?: number;
    page?: number;
    orderBy?: 'date' | 'title' | 'slug';
    order?: 'asc' | 'desc';
  }): Promise<ContentProviderResult<BlogPost[]>> {
    const params = new URLSearchParams();

    if (options?.status) params.set('status', options.status);
    if (options?.category) params.set('categories', String(options.category));
    if (options?.tag) params.set('tags', String(options.tag));
    if (options?.search) params.set('search', options.search);
    if (options?.author) params.set('author', String(options.author));
    if (options?.perPage) params.set('per_page', String(options.perPage));
    if (options?.page) params.set('page', String(options.page));
    if (options?.orderBy) params.set('orderby', options.orderBy);
    if (options?.order) params.set('order', options.order);

    const result = await this.fetchWithRetry<WordPressPostResponse[]>(
      `${this.apiUrl}/posts?${params}`
    );

    if (!result.success) {
      return result as ContentProviderResult<BlogPost[]>;
    }

    const posts = result.data.map(post => this.responseToPost(post));

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
  async deletePost(postId: number, force?: boolean): Promise<ContentProviderResult<boolean>> {
    const params = force ? '?force=true' : '';

    const result = await this.fetchWithRetry<{ deleted: boolean }>(
      `${this.apiUrl}/posts/${postId}${params}`,
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
  // Category and Tag Operations
  // ===========================================================================

  /**
   * Get all categories
   */
  async getCategories(): Promise<ContentProviderResult<WordPressCategory[]>> {
    const result = await this.fetchWithRetry<WordPressCategory[]>(
      `${this.apiUrl}/categories?per_page=100`
    );

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Create a category
   */
  async createCategory(name: string, slug?: string): Promise<ContentProviderResult<WordPressCategory>> {
    const body: Record<string, string> = { name };
    if (slug) body.slug = slug;

    const result = await this.fetchWithRetry<WordPressCategory>(
      `${this.apiUrl}/categories`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    return result;
  }

  /**
   * Get all tags
   */
  async getTags(): Promise<ContentProviderResult<WordPressTag[]>> {
    const result = await this.fetchWithRetry<WordPressTag[]>(
      `${this.apiUrl}/tags?per_page=100`
    );

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Create a tag
   */
  async createTag(name: string, slug?: string): Promise<ContentProviderResult<WordPressTag>> {
    const body: Record<string, string> = { name };
    if (slug) body.slug = slug;

    const result = await this.fetchWithRetry<WordPressTag>(
      `${this.apiUrl}/tags`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    return result;
  }

  /**
   * Find or create category by name
   */
  async findOrCreateCategory(name: string): Promise<ContentProviderResult<number>> {
    const categories = await this.getCategories();

    if (!categories.success) {
      return categories as ContentProviderResult<number>;
    }

    const existing = categories.data.find(
      c => c.name.toLowerCase() === name.toLowerCase()
    );

    if (existing) {
      return {
        success: true,
        data: existing.id,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const created = await this.createCategory(name);

    if (!created.success) {
      return created as ContentProviderResult<number>;
    }

    return {
      success: true,
      data: created.data.id,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Find or create tags by names
   */
  async findOrCreateTags(names: string[]): Promise<ContentProviderResult<number[]>> {
    const tags = await this.getTags();

    if (!tags.success) {
      return tags as ContentProviderResult<number[]>;
    }

    const tagIds: number[] = [];

    for (const name of names) {
      const existing = tags.data.find(
        t => t.name.toLowerCase() === name.toLowerCase()
      );

      if (existing) {
        tagIds.push(existing.id);
      } else {
        const created = await this.createTag(name);
        if (created.success) {
          tagIds.push(created.data.id);
        }
      }
    }

    return {
      success: true,
      data: tagIds,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  // ===========================================================================
  // Media Operations
  // ===========================================================================

  /**
   * Get media item
   */
  async getMedia(mediaId: number): Promise<ContentProviderResult<WordPressMedia>> {
    return this.fetchWithRetry<WordPressMedia>(`${this.apiUrl}/media/${mediaId}`);
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Convert WordPress response to BlogPost
   */
  private responseToPost(response: WordPressPostResponse): BlogPost {
    const statusMap: Record<string, BlogPost['status']> = {
      draft: 'draft',
      publish: 'published',
      future: 'scheduled',
      private: 'private',
      pending: 'draft',
    };

    return {
      id: String(response.id),
      title: response.title.rendered,
      slug: response.slug,
      content: response.content.rendered,
      excerpt: response.excerpt.rendered,
      status: statusMap[response.status] ?? 'draft',
      platform: 'wordpress',
      externalId: String(response.id),
      createdAt: new Date(response.date).getTime(),
      updatedAt: new Date(response.modified).getTime(),
    };
  }

  /**
   * Build SEO metadata for WordPress
   */
  private buildSeoMeta(seo: BlogSEO): Record<string, unknown> {
    // This assumes Yoast SEO or similar plugin is installed
    const meta: Record<string, unknown> = {};

    if (seo.metaTitle) meta['_yoast_wpseo_title'] = seo.metaTitle;
    if (seo.metaDescription) meta['_yoast_wpseo_metadesc'] = seo.metaDescription;
    if (seo.focusKeyword) meta['_yoast_wpseo_focuskw'] = seo.focusKeyword;
    if (seo.canonicalUrl) meta['_yoast_wpseo_canonical'] = seo.canonicalUrl;

    return meta;
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

export function createWordPressProvider(config: WordPressConfig): WordPressProvider {
  return new WordPressProvider(config);
}
