/**
 * Content Creator Suite - Draft Manager Service
 *
 * Manages blog post drafts with auto-save, versioning, and collaboration features.
 */

import type { BlogPost, ContentPlatform, GeneratedContent } from '../../types.js';
import type { ContentStore } from '../../stores/content-store.js';
import { CONTENT_EVENTS, CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface Draft {
  id: string;
  userId: string;
  title: string;
  content: string;
  excerpt?: string;
  slug?: string;
  tags?: string[];
  categories?: string[];
  coverImageUrl?: string;
  platform: ContentPlatform;
  seoMetaTitle?: string;
  seoMetaDescription?: string;
  seoFocusKeyword?: string;
  versions: DraftVersion[];
  currentVersionIndex: number;
  status: 'editing' | 'review' | 'ready';
  wordCount: number;
  characterCount: number;
  lastEditedAt: number;
  autoSavedAt?: number;
  createdAt: number;
}

export interface DraftVersion {
  id: string;
  title: string;
  content: string;
  excerpt?: string;
  wordCount: number;
  characterCount: number;
  createdAt: number;
  message?: string;
}

export interface DraftSummary {
  id: string;
  title: string;
  platform: ContentPlatform;
  status: Draft['status'];
  wordCount: number;
  lastEditedAt: number;
  versionCount: number;
}

export interface DraftManagerConfig {
  maxVersions?: number;
  autoSaveIntervalMs?: number;
  minVersionInterval?: number; // Minimum time between versions
}

// =============================================================================
// Draft Manager Service
// =============================================================================

export class DraftManagerService {
  private readonly config: Required<DraftManagerConfig>;
  private drafts = new Map<string, Draft>();
  private autoSaveIntervals = new Map<string, NodeJS.Timeout>();
  private eventHandlers: ((event: string, data: unknown) => void)[] = [];

  constructor(
    private readonly contentStore: ContentStore,
    config?: DraftManagerConfig
  ) {
    this.config = {
      maxVersions: config?.maxVersions ?? 50,
      autoSaveIntervalMs: config?.autoSaveIntervalMs ?? 30000, // 30 seconds
      minVersionInterval: config?.minVersionInterval ?? 60000, // 1 minute
    };
  }

  // ===========================================================================
  // Draft CRUD Operations
  // ===========================================================================

  /**
   * Create a new draft
   */
  async createDraft(
    userId: string,
    platform: ContentPlatform,
    initialContent?: Partial<BlogPost>
  ): Promise<Draft> {
    const now = Date.now();
    const content = initialContent?.content ?? '';

    const initialVersion: DraftVersion = {
      id: crypto.randomUUID(),
      title: initialContent?.title ?? 'Untitled Draft',
      content,
      excerpt: initialContent?.excerpt,
      wordCount: this.countWords(content),
      characterCount: content.length,
      createdAt: now,
      message: 'Initial draft',
    };

    const draft: Draft = {
      id: crypto.randomUUID(),
      userId,
      title: initialVersion.title,
      content: initialVersion.content,
      excerpt: initialVersion.excerpt,
      slug: initialContent?.slug,
      tags: initialContent?.tags,
      categories: initialContent?.categories,
      coverImageUrl: initialContent?.coverImageUrl,
      platform,
      seoMetaTitle: initialContent?.seo?.metaTitle,
      seoMetaDescription: initialContent?.seo?.metaDescription,
      seoFocusKeyword: initialContent?.seo?.focusKeyword,
      versions: [initialVersion],
      currentVersionIndex: 0,
      status: 'editing',
      wordCount: initialVersion.wordCount,
      characterCount: initialVersion.characterCount,
      lastEditedAt: now,
      createdAt: now,
    };

    this.drafts.set(draft.id, draft);

    // Also store in content store as draft
    await this.contentStore.create({
      userId,
      type: 'blog_post',
      platform,
      status: 'draft',
      title: draft.title,
      content: draft.content,
      metadata: {
        wordCount: draft.wordCount,
        characterCount: draft.characterCount,
        readingTimeMinutes: Math.ceil(draft.wordCount / 200),
      },
    });

    this.emit(CONTENT_EVENTS.BLOG_DRAFT_SAVED, {
      userId,
      draftId: draft.id,
      platform,
    });

    return draft;
  }

  /**
   * Get a draft by ID
   */
  getDraft(draftId: string): Draft | undefined {
    return this.drafts.get(draftId);
  }

  /**
   * Get all drafts for a user
   */
  getUserDrafts(userId: string, platform?: ContentPlatform): DraftSummary[] {
    const drafts = Array.from(this.drafts.values()).filter(
      d => d.userId === userId && (!platform || d.platform === platform)
    );

    return drafts
      .map(d => ({
        id: d.id,
        title: d.title,
        platform: d.platform,
        status: d.status,
        wordCount: d.wordCount,
        lastEditedAt: d.lastEditedAt,
        versionCount: d.versions.length,
      }))
      .sort((a, b) => b.lastEditedAt - a.lastEditedAt);
  }

  /**
   * Update a draft
   */
  async updateDraft(
    draftId: string,
    updates: Partial<Pick<Draft, 'title' | 'content' | 'excerpt' | 'slug' | 'tags' | 'categories' | 'coverImageUrl' | 'seoMetaTitle' | 'seoMetaDescription' | 'seoFocusKeyword' | 'status'>>,
    createVersion?: boolean
  ): Promise<Draft | undefined> {
    const draft = this.drafts.get(draftId);
    if (!draft) {
      return undefined;
    }

    const now = Date.now();
    const contentChanged = updates.content !== undefined && updates.content !== draft.content;
    const titleChanged = updates.title !== undefined && updates.title !== draft.title;

    // Update draft fields
    if (updates.title !== undefined) draft.title = updates.title;
    if (updates.content !== undefined) {
      draft.content = updates.content;
      draft.wordCount = this.countWords(updates.content);
      draft.characterCount = updates.content.length;
    }
    if (updates.excerpt !== undefined) draft.excerpt = updates.excerpt;
    if (updates.slug !== undefined) draft.slug = updates.slug;
    if (updates.tags !== undefined) draft.tags = updates.tags;
    if (updates.categories !== undefined) draft.categories = updates.categories;
    if (updates.coverImageUrl !== undefined) draft.coverImageUrl = updates.coverImageUrl;
    if (updates.seoMetaTitle !== undefined) draft.seoMetaTitle = updates.seoMetaTitle;
    if (updates.seoMetaDescription !== undefined) draft.seoMetaDescription = updates.seoMetaDescription;
    if (updates.seoFocusKeyword !== undefined) draft.seoFocusKeyword = updates.seoFocusKeyword;
    if (updates.status !== undefined) draft.status = updates.status;

    draft.lastEditedAt = now;

    // Create a new version if requested and content has changed significantly
    const shouldCreateVersion = createVersion ||
      (contentChanged && this.shouldAutoVersion(draft));

    if (shouldCreateVersion && (contentChanged || titleChanged)) {
      this.createVersion(draft);
    }

    this.emit(CONTENT_EVENTS.BLOG_DRAFT_SAVED, {
      draftId: draft.id,
      userId: draft.userId,
      versionCreated: shouldCreateVersion,
    });

    return draft;
  }

  /**
   * Delete a draft
   */
  deleteDraft(draftId: string): boolean {
    const draft = this.drafts.get(draftId);
    if (!draft) {
      return false;
    }

    // Stop auto-save if running
    this.stopAutoSave(draftId);

    this.drafts.delete(draftId);
    return true;
  }

  // ===========================================================================
  // Version Management
  // ===========================================================================

  /**
   * Create a new version of the draft
   */
  createVersion(draft: Draft, message?: string): DraftVersion {
    const version: DraftVersion = {
      id: crypto.randomUUID(),
      title: draft.title,
      content: draft.content,
      excerpt: draft.excerpt,
      wordCount: draft.wordCount,
      characterCount: draft.characterCount,
      createdAt: Date.now(),
      message,
    };

    draft.versions.push(version);
    draft.currentVersionIndex = draft.versions.length - 1;

    // Trim old versions if exceeding max
    if (draft.versions.length > this.config.maxVersions) {
      draft.versions.shift();
      draft.currentVersionIndex = draft.versions.length - 1;
    }

    return version;
  }

  /**
   * Restore a specific version
   */
  restoreVersion(draftId: string, versionIndex: number): Draft | undefined {
    const draft = this.drafts.get(draftId);
    if (!draft || versionIndex < 0 || versionIndex >= draft.versions.length) {
      return undefined;
    }

    const version = draft.versions[versionIndex];

    // Create a new version with current state before restoring
    this.createVersion(draft, 'Auto-saved before restore');

    // Restore
    draft.title = version.title;
    draft.content = version.content;
    draft.excerpt = version.excerpt;
    draft.wordCount = version.wordCount;
    draft.characterCount = version.characterCount;
    draft.currentVersionIndex = draft.versions.length - 1;
    draft.lastEditedAt = Date.now();

    return draft;
  }

  /**
   * Get version history for a draft
   */
  getVersionHistory(draftId: string): DraftVersion[] {
    const draft = this.drafts.get(draftId);
    return draft?.versions ?? [];
  }

  /**
   * Compare two versions
   */
  compareVersions(
    draftId: string,
    versionIndex1: number,
    versionIndex2: number
  ): { version1: DraftVersion; version2: DraftVersion; diff: VersionDiff } | undefined {
    const draft = this.drafts.get(draftId);
    if (!draft) return undefined;

    const version1 = draft.versions[versionIndex1];
    const version2 = draft.versions[versionIndex2];

    if (!version1 || !version2) return undefined;

    return {
      version1,
      version2,
      diff: {
        titleChanged: version1.title !== version2.title,
        wordCountDiff: version2.wordCount - version1.wordCount,
        characterCountDiff: version2.characterCount - version1.characterCount,
        timeDiff: version2.createdAt - version1.createdAt,
      },
    };
  }

  /**
   * Check if should auto-create a version
   */
  private shouldAutoVersion(draft: Draft): boolean {
    if (draft.versions.length === 0) return true;

    const lastVersion = draft.versions[draft.versions.length - 1];
    const timeSinceLastVersion = Date.now() - lastVersion.createdAt;

    return timeSinceLastVersion >= this.config.minVersionInterval;
  }

  // ===========================================================================
  // Auto-Save
  // ===========================================================================

  /**
   * Start auto-save for a draft
   */
  startAutoSave(draftId: string, onSave?: (draft: Draft) => void): void {
    if (this.autoSaveIntervals.has(draftId)) {
      return;
    }

    const interval = setInterval(async () => {
      const draft = this.drafts.get(draftId);
      if (!draft) {
        this.stopAutoSave(draftId);
        return;
      }

      // Check if content changed since last auto-save
      if (draft.autoSavedAt && draft.lastEditedAt <= draft.autoSavedAt) {
        return;
      }

      draft.autoSavedAt = Date.now();

      // Update content store
      try {
        await this.contentStore.update(draft.id, {
          content: draft.content,
          title: draft.title,
          metadata: {
            wordCount: draft.wordCount,
            characterCount: draft.characterCount,
            readingTimeMinutes: Math.ceil(draft.wordCount / 200),
          },
        });

        onSave?.(draft);
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, this.config.autoSaveIntervalMs);

    this.autoSaveIntervals.set(draftId, interval);
  }

  /**
   * Stop auto-save for a draft
   */
  stopAutoSave(draftId: string): void {
    const interval = this.autoSaveIntervals.get(draftId);
    if (interval) {
      clearInterval(interval);
      this.autoSaveIntervals.delete(draftId);
    }
  }

  /**
   * Stop all auto-saves
   */
  stopAllAutoSaves(): void {
    for (const draftId of this.autoSaveIntervals.keys()) {
      this.stopAutoSave(draftId);
    }
  }

  // ===========================================================================
  // Conversion
  // ===========================================================================

  /**
   * Convert draft to BlogPost
   */
  draftToBlogPost(draft: Draft): BlogPost {
    return {
      title: draft.title,
      content: draft.content,
      excerpt: draft.excerpt,
      slug: draft.slug,
      tags: draft.tags,
      categories: draft.categories,
      coverImageUrl: draft.coverImageUrl,
      status: draft.status === 'ready' ? 'draft' : 'draft',
      platform: draft.platform,
      seo: {
        metaTitle: draft.seoMetaTitle,
        metaDescription: draft.seoMetaDescription,
        focusKeyword: draft.seoFocusKeyword,
      },
      createdAt: draft.createdAt,
      updatedAt: draft.lastEditedAt,
    };
  }

  /**
   * Create draft from existing content
   */
  async createDraftFromContent(
    userId: string,
    content: GeneratedContent
  ): Promise<Draft> {
    return this.createDraft(userId, content.platform, {
      title: content.title ?? 'Untitled',
      content: content.content,
    });
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Count words in content
   */
  private countWords(content: string): number {
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.split(' ').filter(w => w.length > 0).length;
  }

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
}

// =============================================================================
// Types
// =============================================================================

export interface VersionDiff {
  titleChanged: boolean;
  wordCountDiff: number;
  characterCountDiff: number;
  timeDiff: number;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createDraftManager(
  contentStore: ContentStore,
  config?: DraftManagerConfig
): DraftManagerService {
  return new DraftManagerService(contentStore, config);
}
