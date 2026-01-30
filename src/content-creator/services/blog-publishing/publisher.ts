/**
 * Content Creator Suite - Blog Publisher Service
 *
 * Handles blog post publishing workflow including scheduling and cross-posting.
 */

import type {
  BlogPost,
  ContentPlatform,
  ContentProviderResult,
  GeneratedContent,
} from '../../types.js';
import type { ContentStore } from '../../stores/content-store.js';
import type {
  BlogProviderRegistry,
  UnifiedPublishResult,
} from '../../providers/blog/index.js';
import { CONTENT_EVENTS, CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface PublishOptions {
  platform: 'wordpress' | 'ghost' | 'bearblog';
  status?: 'draft' | 'published' | 'scheduled';
  scheduledAt?: number;
  categories?: string[];
  tags?: string[];
  featuredImage?: string;
  crossPost?: boolean;
  crossPostPlatforms?: ('wordpress' | 'ghost' | 'bearblog')[];
}

export interface PublishResult {
  success: boolean;
  platform: ContentPlatform;
  postId?: string;
  url?: string;
  slug?: string;
  error?: string;
  crossPostResults?: Map<ContentPlatform, PublishResult>;
}

export interface ScheduledPost {
  id: string;
  blogPost: BlogPost;
  options: PublishOptions;
  scheduledAt: number;
  status: 'pending' | 'publishing' | 'published' | 'failed';
  error?: string;
  createdAt: number;
}

export interface PublisherConfig {
  defaultPlatform?: 'wordpress' | 'ghost' | 'bearblog';
  enableCrossPosting?: boolean;
  crossPostDelay?: number; // milliseconds between cross-posts
  retryAttempts?: number;
  retryDelay?: number;
}

// =============================================================================
// Blog Publisher Service
// =============================================================================

export class BlogPublisherService {
  private readonly config: Required<PublisherConfig>;
  private scheduledPosts = new Map<string, ScheduledPost>();
  private schedulerInterval: NodeJS.Timeout | null = null;
  private eventHandlers: ((event: string, data: unknown) => void)[] = [];

  constructor(
    private readonly contentStore: ContentStore,
    private readonly providers: BlogProviderRegistry,
    config?: PublisherConfig
  ) {
    this.config = {
      defaultPlatform: config?.defaultPlatform ?? 'wordpress',
      enableCrossPosting: config?.enableCrossPosting ?? false,
      crossPostDelay: config?.crossPostDelay ?? 2000,
      retryAttempts: config?.retryAttempts ?? 3,
      retryDelay: config?.retryDelay ?? 5000,
    };
  }

  // ===========================================================================
  // Publishing Operations
  // ===========================================================================

  /**
   * Publish a blog post
   */
  async publish(
    userId: string,
    blogPost: BlogPost,
    options: PublishOptions
  ): Promise<PublishResult> {
    const platform = options.platform ?? this.config.defaultPlatform;
    const provider = this.providers[platform];

    if (!provider || !provider.isInitialized()) {
      return {
        success: false,
        platform,
        error: `Provider ${platform} is not available or not initialized`,
      };
    }

    // Validate post
    const validation = this.validatePost(blogPost);
    if (!validation.valid) {
      return {
        success: false,
        platform,
        error: validation.error,
      };
    }

    // Prepare publish options based on platform
    const publishOptions = this.preparePublishOptions(options);

    let result: ContentProviderResult<{ id: string | number; url: string; slug: string }> | undefined;

    try {
      const rawResult = await provider.publishPost(blogPost, publishOptions);
      // Normalize the result to handle different id types from different providers
      if (rawResult.success) {
        // Handle different providers that may have 'id' or 'uid' as the identifier
        const data = rawResult.data as { id?: string | number; uid?: string; url: string; slug: string };
        const normalizedId = String(data.id ?? data.uid ?? '');
        result = {
          ...rawResult,
          data: {
            id: normalizedId,
            url: data.url,
            slug: data.slug,
          },
        };
      } else {
        result = rawResult;
      }
    } catch (error) {
      return {
        success: false,
        platform,
        error: error instanceof Error ? error.message : 'Unknown error during publishing',
      };
    }

    if (!result || !result.success) {
      this.emit(CONTENT_EVENTS.BLOG_POST_FAILED, {
        userId,
        platform,
        error: result.error,
      });

      return {
        success: false,
        platform,
        error: result.error,
      };
    }

    // Store the published content
    const generatedContent = await this.contentStore.create({
      userId,
      type: 'blog_post',
      platform,
      status: options.status === 'scheduled' ? 'scheduled' : 'published',
      title: blogPost.title,
      content: blogPost.content,
      metadata: {
        wordCount: this.countWords(blogPost.content),
        characterCount: blogPost.content.length,
        readingTimeMinutes: this.estimateReadingTime(blogPost.content),
        hashtags: blogPost.tags,
        externalLinks: this.extractLinks(blogPost.content),
        seoScore: blogPost.seo ? this.calculateBasicSeoScore(blogPost) : undefined,
      },
      scheduledAt: options.scheduledAt,
      publishedAt: options.status !== 'scheduled' ? Date.now() : undefined,
    });

    const publishResult: PublishResult = {
      success: true,
      platform,
      postId: String(result.data.id),
      url: result.data.url,
      slug: result.data.slug,
    };

    // Emit success event
    this.emit(CONTENT_EVENTS.BLOG_POST_PUBLISHED, {
      userId,
      contentId: generatedContent.id,
      platform,
      postId: result.data.id,
      url: result.data.url,
    });

    // Handle cross-posting if enabled
    if (options.crossPost && options.crossPostPlatforms && options.crossPostPlatforms.length > 0) {
      publishResult.crossPostResults = await this.crossPost(
        userId,
        blogPost,
        options,
        platform
      );
    }

    return publishResult;
  }

  /**
   * Cross-post to multiple platforms
   */
  private async crossPost(
    userId: string,
    blogPost: BlogPost,
    options: PublishOptions,
    excludePlatform: ContentPlatform
  ): Promise<Map<ContentPlatform, PublishResult>> {
    const results = new Map<ContentPlatform, PublishResult>();
    const platforms = options.crossPostPlatforms?.filter(p => p !== excludePlatform) ?? [];

    for (const platform of platforms) {
      // Add delay between cross-posts
      await this.sleep(this.config.crossPostDelay);

      const result = await this.publish(userId, blogPost, {
        ...options,
        platform,
        crossPost: false, // Prevent infinite recursion
      });

      results.set(platform, result);
    }

    return results;
  }

  /**
   * Schedule a post for future publishing
   */
  async schedulePost(
    userId: string,
    blogPost: BlogPost,
    options: PublishOptions
  ): Promise<ScheduledPost> {
    if (!options.scheduledAt || options.scheduledAt <= Date.now()) {
      throw new Error('scheduledAt must be a future timestamp');
    }

    const scheduledPost: ScheduledPost = {
      id: crypto.randomUUID(),
      blogPost,
      options: { ...options, status: 'scheduled' },
      scheduledAt: options.scheduledAt,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.scheduledPosts.set(scheduledPost.id, scheduledPost);

    // Store as draft with scheduled status
    await this.contentStore.create({
      userId,
      type: 'blog_post',
      platform: options.platform,
      status: 'scheduled',
      title: blogPost.title,
      content: blogPost.content,
      metadata: {
        wordCount: this.countWords(blogPost.content),
        characterCount: blogPost.content.length,
        readingTimeMinutes: this.estimateReadingTime(blogPost.content),
        hashtags: blogPost.tags,
      },
      scheduledAt: options.scheduledAt,
    });

    this.emit(CONTENT_EVENTS.BLOG_POST_SCHEDULED, {
      userId,
      scheduledPostId: scheduledPost.id,
      scheduledAt: options.scheduledAt,
      platform: options.platform,
    });

    return scheduledPost;
  }

  /**
   * Cancel a scheduled post
   */
  cancelScheduledPost(scheduledPostId: string): boolean {
    const post = this.scheduledPosts.get(scheduledPostId);
    if (!post || post.status !== 'pending') {
      return false;
    }

    this.scheduledPosts.delete(scheduledPostId);
    return true;
  }

  /**
   * Get all scheduled posts
   */
  getScheduledPosts(): ScheduledPost[] {
    return Array.from(this.scheduledPosts.values()).sort(
      (a, b) => a.scheduledAt - b.scheduledAt
    );
  }

  /**
   * Get scheduled posts for a specific platform
   */
  getScheduledPostsByPlatform(platform: ContentPlatform): ScheduledPost[] {
    return this.getScheduledPosts().filter(p => p.options.platform === platform);
  }

  // ===========================================================================
  // Scheduler
  // ===========================================================================

  /**
   * Start the scheduler
   */
  startScheduler(checkIntervalMs: number = 60000): void {
    if (this.schedulerInterval) {
      return;
    }

    this.schedulerInterval = setInterval(() => {
      this.processScheduledPosts();
    }, checkIntervalMs);

    // Run immediately
    this.processScheduledPosts();
  }

  /**
   * Stop the scheduler
   */
  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }

  /**
   * Process scheduled posts
   */
  private async processScheduledPosts(): Promise<void> {
    const now = Date.now();
    const duePosts = Array.from(this.scheduledPosts.values()).filter(
      p => p.status === 'pending' && p.scheduledAt <= now
    );

    for (const scheduledPost of duePosts) {
      scheduledPost.status = 'publishing';

      try {
        // We need userId but don't have it stored - use a placeholder
        // In production, you'd store userId with the scheduled post
        const result = await this.publish(
          'scheduled-user',
          scheduledPost.blogPost,
          { ...scheduledPost.options, status: 'published' }
        );

        if (result.success) {
          scheduledPost.status = 'published';
          this.scheduledPosts.delete(scheduledPost.id);
        } else {
          scheduledPost.status = 'failed';
          scheduledPost.error = result.error;
        }
      } catch (error) {
        scheduledPost.status = 'failed';
        scheduledPost.error = error instanceof Error ? error.message : 'Unknown error';
      }
    }
  }

  // ===========================================================================
  // Validation & Utilities
  // ===========================================================================

  /**
   * Validate a blog post
   */
  private validatePost(post: BlogPost): { valid: boolean; error?: string } {
    if (!post.title || post.title.trim().length === 0) {
      return { valid: false, error: 'Post title is required' };
    }

    if (!post.content || post.content.trim().length === 0) {
      return { valid: false, error: 'Post content is required' };
    }

    const wordCount = this.countWords(post.content);
    if (wordCount < CONTENT_DEFAULTS.BLOG_MIN_WORD_COUNT) {
      return {
        valid: false,
        error: `Post must have at least ${CONTENT_DEFAULTS.BLOG_MIN_WORD_COUNT} words (current: ${wordCount})`,
      };
    }

    return { valid: true };
  }

  /**
   * Prepare platform-specific publish options
   */
  private preparePublishOptions(options: PublishOptions): Record<string, unknown> {
    const platformOptions: Record<string, unknown> = {};

    if (options.status === 'scheduled' && options.scheduledAt) {
      platformOptions.status = options.platform === 'ghost' ? 'scheduled' : 'future';
      platformOptions.scheduledAt = options.scheduledAt;
    } else if (options.status === 'published') {
      platformOptions.status = options.platform === 'ghost' ? 'published' : 'publish';
    } else {
      platformOptions.status = 'draft';
    }

    if (options.tags) {
      platformOptions.tags = options.tags;
    }

    if (options.featuredImage) {
      platformOptions.featuredImage = options.featuredImage;
    }

    return platformOptions;
  }

  /**
   * Count words in content
   */
  private countWords(content: string): number {
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.split(' ').filter(w => w.length > 0).length;
  }

  /**
   * Estimate reading time in minutes
   */
  private estimateReadingTime(content: string): number {
    const words = this.countWords(content);
    return Math.ceil(words / 200); // Average reading speed
  }

  /**
   * Extract links from content
   */
  private extractLinks(content: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
    const matches = content.match(urlRegex);
    return matches ? [...new Set(matches)] : [];
  }

  /**
   * Calculate basic SEO score
   */
  private calculateBasicSeoScore(post: BlogPost): number {
    let score = 0;
    const maxScore = 100;

    // Title present and reasonable length
    if (post.title && post.title.length >= 30 && post.title.length <= 60) {
      score += 20;
    } else if (post.title) {
      score += 10;
    }

    // Meta description
    if (post.seo?.metaDescription) {
      const descLength = post.seo.metaDescription.length;
      if (descLength >= 120 && descLength <= 160) {
        score += 20;
      } else if (descLength > 0) {
        score += 10;
      }
    }

    // Excerpt
    if (post.excerpt && post.excerpt.length > 0) {
      score += 10;
    }

    // Tags present
    if (post.tags && post.tags.length > 0) {
      score += 10;
    }

    // Content length
    const wordCount = this.countWords(post.content);
    if (wordCount >= 1000) {
      score += 20;
    } else if (wordCount >= 500) {
      score += 15;
    } else if (wordCount >= 300) {
      score += 10;
    }

    // Focus keyword
    if (post.seo?.focusKeyword) {
      score += 10;
    }

    // Canonical URL
    if (post.seo?.canonicalUrl) {
      score += 10;
    }

    return Math.min(score, maxScore);
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Register an event handler
   */
  onEvent(handler: (event: string, data: unknown) => void): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Emit an event
   */
  private emit(event: string, data: unknown): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event, data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createBlogPublisher(
  contentStore: ContentStore,
  providers: BlogProviderRegistry,
  config?: PublisherConfig
): BlogPublisherService {
  return new BlogPublisherService(contentStore, providers, config);
}
