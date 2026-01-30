/**
 * Content Creator Suite - Blog Publishing Service
 *
 * Main entry point for blog publishing, draft management, and scheduling.
 */

export {
  BlogPublisherService,
  createBlogPublisher,
  type PublishOptions,
  type PublishResult,
  type ScheduledPost,
  type PublisherConfig,
} from './publisher.js';

export {
  DraftManagerService,
  createDraftManager,
  type Draft,
  type DraftVersion,
  type DraftSummary,
  type DraftManagerConfig,
  type VersionDiff,
} from './draft-manager.js';

import type { ContentStore } from '../../stores/content-store.js';
import type { BlogProviderRegistry } from '../../providers/blog/index.js';
import type { BlogPublishingConfig } from '../../config.js';
import type { BlogPost, ContentPlatform } from '../../types.js';

import { createBlogPublisher, type PublisherConfig, type PublishResult, type ScheduledPost } from './publisher.js';
import { createDraftManager, type DraftManagerConfig, type Draft, type DraftSummary } from './draft-manager.js';

// =============================================================================
// Blog Publishing Service (Facade)
// =============================================================================

export interface BlogPublishingServiceConfig {
  blogPublishing?: BlogPublishingConfig;
  publisher?: PublisherConfig;
  draftManager?: DraftManagerConfig;
}

export class BlogPublishingService {
  public readonly publisher: ReturnType<typeof createBlogPublisher>;
  public readonly draftManager: ReturnType<typeof createDraftManager>;

  constructor(
    contentStore: ContentStore,
    providers: BlogProviderRegistry,
    config?: BlogPublishingServiceConfig
  ) {
    // Initialize publisher
    this.publisher = createBlogPublisher(contentStore, providers, {
      defaultPlatform: config?.blogPublishing?.defaultPlatform,
      enableCrossPosting: config?.blogPublishing?.crossPost,
      ...config?.publisher,
    });

    // Initialize draft manager
    this.draftManager = createDraftManager(contentStore, config?.draftManager);
  }

  // ===========================================================================
  // Unified Publishing Interface
  // ===========================================================================

  /**
   * Create a new draft
   */
  async createDraft(
    userId: string,
    platform: ContentPlatform,
    initialContent?: Partial<BlogPost>
  ): Promise<Draft> {
    return this.draftManager.createDraft(userId, platform, initialContent);
  }

  /**
   * Get user's drafts
   */
  getUserDrafts(userId: string, platform?: ContentPlatform): DraftSummary[] {
    return this.draftManager.getUserDrafts(userId, platform);
  }

  /**
   * Get a specific draft
   */
  getDraft(draftId: string): Draft | undefined {
    return this.draftManager.getDraft(draftId);
  }

  /**
   * Update a draft
   */
  async updateDraft(
    draftId: string,
    updates: Partial<Pick<Draft, 'title' | 'content' | 'excerpt' | 'slug' | 'tags' | 'categories' | 'coverImageUrl' | 'seoMetaTitle' | 'seoMetaDescription' | 'seoFocusKeyword' | 'status'>>,
    createVersion?: boolean
  ): Promise<Draft | undefined> {
    return this.draftManager.updateDraft(draftId, updates, createVersion);
  }

  /**
   * Delete a draft
   */
  deleteDraft(draftId: string): boolean {
    return this.draftManager.deleteDraft(draftId);
  }

  /**
   * Publish a draft
   */
  async publishDraft(
    userId: string,
    draftId: string,
    options: {
      platform?: 'wordpress' | 'ghost' | 'bearblog';
      status?: 'draft' | 'published' | 'scheduled';
      scheduledAt?: number;
      crossPost?: boolean;
      crossPostPlatforms?: ('wordpress' | 'ghost' | 'bearblog')[];
    }
  ): Promise<PublishResult> {
    const draft = this.draftManager.getDraft(draftId);
    if (!draft) {
      return {
        success: false,
        platform: options.platform ?? 'wordpress',
        error: 'Draft not found',
      };
    }

    const blogPost = this.draftManager.draftToBlogPost(draft);
    const platform = options.platform ?? (draft.platform as 'wordpress' | 'ghost' | 'bearblog');

    const result = await this.publisher.publish(userId, blogPost, {
      platform,
      status: options.status ?? 'published',
      scheduledAt: options.scheduledAt,
      tags: draft.tags,
      categories: draft.categories,
      featuredImage: draft.coverImageUrl,
      crossPost: options.crossPost,
      crossPostPlatforms: options.crossPostPlatforms,
    });

    if (result.success) {
      // Optionally delete the draft after successful publishing
      // this.draftManager.deleteDraft(draftId);
    }

    return result;
  }

  /**
   * Publish a blog post directly (without draft)
   */
  async publishPost(
    userId: string,
    blogPost: BlogPost,
    options: {
      platform: 'wordpress' | 'ghost' | 'bearblog';
      status?: 'draft' | 'published' | 'scheduled';
      scheduledAt?: number;
      crossPost?: boolean;
      crossPostPlatforms?: ('wordpress' | 'ghost' | 'bearblog')[];
    }
  ): Promise<PublishResult> {
    return this.publisher.publish(userId, blogPost, {
      ...options,
      tags: blogPost.tags,
      categories: blogPost.categories,
      featuredImage: blogPost.coverImageUrl,
    });
  }

  /**
   * Schedule a post
   */
  async schedulePost(
    userId: string,
    blogPost: BlogPost,
    scheduledAt: number,
    platform: 'wordpress' | 'ghost' | 'bearblog'
  ): Promise<ScheduledPost> {
    return this.publisher.schedulePost(userId, blogPost, {
      platform,
      status: 'scheduled',
      scheduledAt,
    });
  }

  /**
   * Cancel a scheduled post
   */
  cancelScheduledPost(scheduledPostId: string): boolean {
    return this.publisher.cancelScheduledPost(scheduledPostId);
  }

  /**
   * Get scheduled posts
   */
  getScheduledPosts(): ScheduledPost[] {
    return this.publisher.getScheduledPosts();
  }

  // ===========================================================================
  // Version Management
  // ===========================================================================

  /**
   * Get version history for a draft
   */
  getVersionHistory(draftId: string) {
    return this.draftManager.getVersionHistory(draftId);
  }

  /**
   * Restore a specific version
   */
  restoreVersion(draftId: string, versionIndex: number) {
    return this.draftManager.restoreVersion(draftId, versionIndex);
  }

  /**
   * Compare two versions
   */
  compareVersions(draftId: string, versionIndex1: number, versionIndex2: number) {
    return this.draftManager.compareVersions(draftId, versionIndex1, versionIndex2);
  }

  // ===========================================================================
  // Auto-Save
  // ===========================================================================

  /**
   * Start auto-save for a draft
   */
  startAutoSave(draftId: string, onSave?: (draft: Draft) => void): void {
    this.draftManager.startAutoSave(draftId, onSave);
  }

  /**
   * Stop auto-save for a draft
   */
  stopAutoSave(draftId: string): void {
    this.draftManager.stopAutoSave(draftId);
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Start the publishing scheduler
   */
  startScheduler(checkIntervalMs?: number): void {
    this.publisher.startScheduler(checkIntervalMs);
  }

  /**
   * Stop the publishing scheduler
   */
  stopScheduler(): void {
    this.publisher.stopScheduler();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.publisher.stopScheduler();
    this.draftManager.stopAllAutoSaves();
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Register event handler
   */
  onEvent(handler: (event: string, data: unknown) => void): () => void {
    const unsubPublisher = this.publisher.onEvent(handler);
    const unsubDraftManager = this.draftManager.onEvent(handler);

    return () => {
      unsubPublisher();
      unsubDraftManager();
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createBlogPublishingService(
  contentStore: ContentStore,
  providers: BlogProviderRegistry,
  config?: BlogPublishingServiceConfig
): BlogPublishingService {
  return new BlogPublishingService(contentStore, providers, config);
}
