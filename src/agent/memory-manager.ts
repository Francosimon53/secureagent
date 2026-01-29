import { randomUUID } from 'crypto';
import { MemoryEntry } from './types.js';
import { MemoryStore, MemoryQueryOptions, createMemoryStore } from '../persistence/memory-store.js';
import { EncryptionService, getEncryptionService, isEncryptionInitialized } from '../persistence/encryption.js';
import { getDatabaseManager, isDatabaseInitialized } from '../persistence/database.js';
import { getLogger } from '../observability/logger.js';
import { EventBus, getEventBus } from '../events/index.js';

const logger = getLogger().child({ module: 'MemoryManager' });

// ============================================================================
// Memory Manager Types
// ============================================================================

export interface MemoryManagerConfig {
  /** Maximum memories per user */
  maxMemoriesPerUser?: number;
  /** Default memory expiration in ms (0 = never) */
  defaultExpirationMs?: number;
  /** Enable automatic summarization */
  enableSummarization?: boolean;
  /** Summarization threshold (trigger when memories exceed this) */
  summarizationThreshold?: number;
  /** Custom summarizer function */
  summarizer?: (memories: MemoryEntry[]) => Promise<string>;
  /** Store type */
  storeType?: 'memory' | 'database';
}

export interface RememberOptions {
  /** Memory type */
  type?: MemoryEntry['type'];
  /** Importance score (0-1) */
  importance?: number;
  /** Expiration time in ms from now */
  expiresIn?: number;
  /** Absolute expiration timestamp */
  expiresAt?: number;
  /** Session/conversation ID for session-scoped memory */
  sessionId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface RecallOptions {
  /** Filter by type */
  type?: MemoryEntry['type'];
  /** Minimum importance */
  minImportance?: number;
  /** Maximum results */
  limit?: number;
  /** Include expired memories */
  includeExpired?: boolean;
  /** Session/conversation ID for session-scoped recall */
  sessionId?: string;
  /** Get only user-level memories (exclude session-scoped) */
  userLevelOnly?: boolean;
}

export interface ContextOptions {
  /** Maximum memories to include */
  limit?: number;
  /** Filter by types */
  types?: MemoryEntry['type'][];
  /** Minimum importance threshold */
  minImportance?: number;
  /** Time range (ms from now) */
  timeRange?: number;
  /** Format as string */
  format?: 'entries' | 'text';
  /** Session/conversation ID for session-scoped context */
  sessionId?: string;
  /** Include both user-level and session memories */
  includeUserLevel?: boolean;
}

export interface EncryptedExport {
  version: string;
  userId: string;
  exportedAt: number;
  encryptedData: string;
  iv: string;
  tag: string;
  salt: string;
}

// ============================================================================
// Memory Manager Implementation
// ============================================================================

/**
 * High-level memory management API
 * Provides remember/recall/forget operations with encryption and persistence
 */
export class MemoryManager {
  private readonly config: Required<MemoryManagerConfig>;
  private store: MemoryStore | null = null;
  private encryption: EncryptionService | null = null;
  private eventBus: EventBus | null = null;
  private initialized = false;

  constructor(config: MemoryManagerConfig = {}) {
    this.config = {
      maxMemoriesPerUser: config.maxMemoriesPerUser ?? 1000,
      defaultExpirationMs: config.defaultExpirationMs ?? 0,
      enableSummarization: config.enableSummarization ?? true,
      summarizationThreshold: config.summarizationThreshold ?? 100,
      summarizer: config.summarizer ?? this.defaultSummarizer.bind(this),
      storeType: config.storeType ?? 'database',
    };
  }

  /**
   * Initialize the memory manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Get encryption service if available
      if (isEncryptionInitialized()) {
        this.encryption = getEncryptionService();
      }

      // Get database manager if using database store
      const dbManager = this.config.storeType === 'database' && isDatabaseInitialized()
        ? getDatabaseManager()
        : undefined;

      // Create memory store
      this.store = createMemoryStore(
        this.config.storeType,
        this.encryption ?? undefined,
        dbManager
      );

      await this.store.initialize();

      // Get event bus
      this.eventBus = getEventBus();

      this.initialized = true;
      logger.info({ storeType: this.config.storeType }, 'Memory manager initialized');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, 'Failed to initialize memory manager');
      throw new Error(`Memory manager initialization failed: ${message}`);
    }
  }

  /**
   * Store a memory for a user
   */
  async remember(
    userId: string,
    key: string,
    value: unknown,
    options: RememberOptions = {}
  ): Promise<string> {
    this.ensureInitialized();

    const now = Date.now();
    const content = typeof value === 'string' ? value : JSON.stringify(value);

    // Calculate expiration
    let expiresAt: number | undefined;
    if (options.expiresAt) {
      expiresAt = options.expiresAt;
    } else if (options.expiresIn) {
      expiresAt = now + options.expiresIn;
    } else if (this.config.defaultExpirationMs > 0) {
      expiresAt = now + this.config.defaultExpirationMs;
    }

    // Check if memory with this key already exists (in same session if specified)
    const existing = await this.store!.getByKey(userId, key, options.sessionId);

    if (existing) {
      // Update existing memory
      await this.store!.update(userId, existing.id, {
        content,
        value,
        type: options.type ?? existing.type,
        importance: options.importance ?? existing.importance,
        expiresAt,
        metadata: { ...existing.metadata, ...options.metadata },
      });

      this.emitEvent('memory.updated', { userId, memoryId: existing.id, key, sessionId: options.sessionId });
      logger.debug({ userId, key, memoryId: existing.id, sessionId: options.sessionId }, 'Memory updated');

      return existing.id;
    }

    // Check memory limit
    const memories = await this.store!.search(userId, { limit: this.config.maxMemoriesPerUser + 1 });
    if (memories.length >= this.config.maxMemoriesPerUser) {
      // Check if summarization should be triggered
      if (this.config.enableSummarization && memories.length >= this.config.summarizationThreshold) {
        await this.summarize(userId);
      } else {
        // Remove oldest low-importance memory
        const toRemove = memories
          .filter(m => m.type !== 'summary')
          .sort((a, b) => (a.importance - b.importance) || (a.createdAt - b.createdAt))[0];

        if (toRemove) {
          await this.store!.delete(userId, toRemove.id);
          logger.debug({ userId, removedId: toRemove.id }, 'Removed old memory to make room');
        }
      }
    }

    // Store new memory
    const entry = await this.store!.store(userId, {
      key,
      content,
      value,
      conversationId: options.sessionId,
      type: options.type ?? 'fact',
      importance: options.importance ?? 0.5,
      expiresAt,
      metadata: options.metadata,
    });

    this.emitEvent('memory.created', { userId, memoryId: entry.id, key, sessionId: options.sessionId });
    logger.debug({ userId, key, memoryId: entry.id, sessionId: options.sessionId }, 'Memory stored');

    return entry.id;
  }

  /**
   * Recall a specific memory by key
   * @param sessionId - If provided, looks for session-scoped memory; otherwise looks for user-level
   */
  async recall(userId: string, key: string, sessionId?: string): Promise<unknown | null> {
    this.ensureInitialized();

    const entry = await this.store!.getByKey(userId, key, sessionId);

    if (!entry) {
      return null;
    }

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      await this.store!.delete(userId, entry.id);
      return null;
    }

    this.emitEvent('memory.recalled', { userId, memoryId: entry.id, key, sessionId });

    // Return parsed value if available
    return entry.value ?? entry.content;
  }

  /**
   * Get a memory entry by ID
   */
  async get(userId: string, memoryId: string): Promise<MemoryEntry | null> {
    this.ensureInitialized();
    return this.store!.get(userId, memoryId);
  }

  /**
   * Forget (delete) a memory by key
   * @param sessionId - If provided, deletes session-scoped memory; otherwise deletes user-level
   */
  async forget(userId: string, key: string, sessionId?: string): Promise<boolean> {
    this.ensureInitialized();

    const entry = await this.store!.getByKey(userId, key, sessionId);

    if (!entry) {
      return false;
    }

    const deleted = await this.store!.delete(userId, entry.id);

    if (deleted) {
      this.emitEvent('memory.forgotten', { userId, memoryId: entry.id, key, sessionId });
      logger.debug({ userId, key, sessionId }, 'Memory forgotten');
    }

    return deleted;
  }

  /**
   * Forget all memories for a user
   */
  async forgetAll(userId: string): Promise<number> {
    this.ensureInitialized();

    const memories = await this.store!.search(userId, {});
    let count = 0;

    for (const memory of memories) {
      if (await this.store!.delete(userId, memory.id)) {
        count++;
      }
    }

    this.emitEvent('memory.cleared', { userId, count });
    logger.info({ userId, count }, 'All memories cleared');

    return count;
  }

  /**
   * Forget all memories for a session
   */
  async forgetSession(userId: string, sessionId: string): Promise<number> {
    this.ensureInitialized();

    const count = await this.store!.deleteBySession(userId, sessionId);

    this.emitEvent('memory.session_cleared', { userId, sessionId, count });
    logger.info({ userId, sessionId, count }, 'Session memories cleared');

    return count;
  }

  /**
   * Get all memories for a session
   */
  async getSessionMemories(userId: string, sessionId: string): Promise<MemoryEntry[]> {
    this.ensureInitialized();
    return this.store!.getSessionMemories(userId, sessionId);
  }

  /**
   * Search memories with filters
   */
  async search(userId: string, options: RecallOptions = {}): Promise<MemoryEntry[]> {
    this.ensureInitialized();

    const queryOptions: MemoryQueryOptions = {
      type: options.type,
      minImportance: options.minImportance,
      limit: options.limit,
      includeExpired: options.includeExpired,
      sessionId: options.sessionId,
      userLevelOnly: options.userLevelOnly,
    };

    return this.store!.search(userId, queryOptions);
  }

  /**
   * Get context for a user (accumulated memories for conversation)
   * Combines user-level and session-specific memories
   */
  async getContext(userId: string, options: ContextOptions = {}): Promise<MemoryEntry[] | string> {
    this.ensureInitialized();

    const queryOptions: MemoryQueryOptions = {
      types: options.types,
      minImportance: options.minImportance,
      limit: options.limit ?? 50,
      orderBy: 'importance',
      order: 'desc',
    };

    // Add time filter if specified
    if (options.timeRange) {
      queryOptions.createdAfter = Date.now() - options.timeRange;
    }

    // Handle session-specific context
    if (options.sessionId) {
      if (options.includeUserLevel) {
        // Get both user-level and session memories, merge and sort
        const [userMemories, sessionMemories] = await Promise.all([
          this.store!.search(userId, { ...queryOptions, userLevelOnly: true }),
          this.store!.search(userId, { ...queryOptions, sessionId: options.sessionId }),
        ]);
        const merged = [...userMemories, ...sessionMemories]
          .sort((a, b) => b.importance - a.importance)
          .slice(0, options.limit ?? 50);

        if (options.format === 'text') {
          return this.formatMemoriesAsText(merged);
        }
        return merged;
      }
      queryOptions.sessionId = options.sessionId;
    }

    const memories = await this.store!.search(userId, queryOptions);

    if (options.format === 'text') {
      return this.formatMemoriesAsText(memories);
    }

    return memories;
  }

  /**
   * Summarize user memories
   */
  async summarize(userId: string): Promise<MemoryEntry> {
    this.ensureInitialized();

    // Get all non-summary memories
    const memories = await this.store!.search(userId, {
      excludeTypes: ['summary'],
      orderBy: 'createdAt',
      order: 'asc',
    });

    if (memories.length === 0) {
      throw new Error('No memories to summarize');
    }

    // Generate summary
    const summaryContent = await this.config.summarizer(memories);

    // Store summary
    const summary = await this.store!.store(userId, {
      key: `summary:${Date.now()}`,
      content: summaryContent,
      type: 'summary',
      importance: 1.0,
      metadata: {
        summarizedCount: memories.length,
        summarizedAt: Date.now(),
      },
    });

    // Delete summarized memories (keep recent ones)
    const toDelete = memories.slice(0, -10); // Keep last 10
    for (const memory of toDelete) {
      await this.store!.delete(userId, memory.id);
    }

    this.emitEvent('memory.summarized', {
      userId,
      summaryId: summary.id,
      summarizedCount: toDelete.length,
    });

    logger.info({ userId, summarizedCount: toDelete.length }, 'Memories summarized');

    return summary;
  }

  /**
   * Export all user data (GDPR compliance)
   */
  async exportUserData(userId: string): Promise<EncryptedExport> {
    this.ensureInitialized();

    const memories = await this.store!.search(userId, { includeExpired: true });
    const data = JSON.stringify({
      memories,
      exportedAt: Date.now(),
    });

    // Encrypt the export if encryption is available
    if (this.encryption) {
      const encrypted = this.encryption.encryptForUser(userId, data);
      return {
        version: '1.0',
        userId,
        exportedAt: Date.now(),
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        salt: encrypted.salt,
      };
    }

    // Return base64 encoded if no encryption
    return {
      version: '1.0',
      userId,
      exportedAt: Date.now(),
      encryptedData: Buffer.from(data).toString('base64'),
      iv: '',
      tag: '',
      salt: '',
    };
  }

  /**
   * Import user data from export
   */
  async importUserData(userId: string, exportData: EncryptedExport): Promise<number> {
    this.ensureInitialized();

    let data: string;

    if (exportData.iv && exportData.tag && this.encryption) {
      // Decrypt the export
      data = this.encryption.decryptForUser(userId, {
        ciphertext: exportData.encryptedData,
        iv: exportData.iv,
        tag: exportData.tag,
        salt: exportData.salt,
      });
    } else {
      // Decode base64
      data = Buffer.from(exportData.encryptedData, 'base64').toString('utf8');
    }

    const parsed = JSON.parse(data);
    let imported = 0;

    for (const memory of parsed.memories) {
      await this.store!.store(userId, {
        key: memory.key,
        content: memory.content,
        value: memory.value,
        type: memory.type,
        importance: memory.importance,
        expiresAt: memory.expiresAt,
        metadata: memory.metadata,
      });
      imported++;
    }

    logger.info({ userId, imported }, 'User data imported');

    return imported;
  }

  /**
   * Delete expired memories
   */
  async cleanupExpired(): Promise<number> {
    this.ensureInitialized();
    const deleted = await this.store!.deleteExpired();

    if (deleted > 0) {
      logger.info({ deleted }, 'Expired memories cleaned up');
    }

    return deleted;
  }

  /**
   * Get memory statistics for a user
   */
  async getStats(userId: string): Promise<{
    total: number;
    byType: Record<string, number>;
    averageImportance: number;
    oldestMemory: number | null;
    newestMemory: number | null;
  }> {
    this.ensureInitialized();

    const memories = await this.store!.search(userId, {});

    const byType: Record<string, number> = {};
    let totalImportance = 0;
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const memory of memories) {
      byType[memory.type] = (byType[memory.type] ?? 0) + 1;
      totalImportance += memory.importance;

      if (oldest === null || memory.createdAt < oldest) {
        oldest = memory.createdAt;
      }
      if (newest === null || memory.createdAt > newest) {
        newest = memory.createdAt;
      }
    }

    return {
      total: memories.length,
      byType,
      averageImportance: memories.length > 0 ? totalImportance / memories.length : 0,
      oldestMemory: oldest,
      newestMemory: newest,
    };
  }

  /**
   * Check if memory manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the underlying store (for advanced operations)
   */
  getStore(): MemoryStore | null {
    return this.store;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.store) {
      throw new Error('Memory manager not initialized. Call initialize() first.');
    }
  }

  private emitEvent(topic: string, data: Record<string, unknown>): void {
    if (this.eventBus) {
      this.eventBus.publish(topic, data).catch((err: unknown) => {
        logger.warn({ error: err, topic }, 'Failed to emit memory event');
      });
    }
  }

  private formatMemoriesAsText(memories: MemoryEntry[]): string {
    if (memories.length === 0) {
      return '';
    }

    const lines: string[] = [];

    // Group by type
    const byType = new Map<string, MemoryEntry[]>();
    for (const memory of memories) {
      const list = byType.get(memory.type) ?? [];
      list.push(memory);
      byType.set(memory.type, list);
    }

    // Format each type
    for (const [type, entries] of byType) {
      lines.push(`## ${type.charAt(0).toUpperCase() + type.slice(1)}s:`);
      for (const entry of entries) {
        lines.push(`- ${entry.key}: ${entry.content}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private async defaultSummarizer(memories: MemoryEntry[]): Promise<string> {
    // Simple summarizer - in production, this would use an LLM
    const facts = memories.filter(m => m.type === 'fact');
    const preferences = memories.filter(m => m.type === 'preference');
    const contexts = memories.filter(m => m.type === 'context');

    const lines: string[] = ['Memory Summary:'];

    if (facts.length > 0) {
      lines.push(`\nFacts (${facts.length}):`);
      facts.slice(0, 10).forEach(f => lines.push(`- ${f.key}: ${f.content}`));
      if (facts.length > 10) {
        lines.push(`... and ${facts.length - 10} more facts`);
      }
    }

    if (preferences.length > 0) {
      lines.push(`\nPreferences (${preferences.length}):`);
      preferences.slice(0, 5).forEach(p => lines.push(`- ${p.key}: ${p.content}`));
      if (preferences.length > 5) {
        lines.push(`... and ${preferences.length - 5} more preferences`);
      }
    }

    if (contexts.length > 0) {
      lines.push(`\nContext items: ${contexts.length}`);
    }

    return lines.join('\n');
  }
}

// ============================================================================
// Factory and Global Instance
// ============================================================================

let globalMemoryManager: MemoryManager | null = null;

/**
 * Initialize the global memory manager
 */
export async function initMemoryManager(
  config?: MemoryManagerConfig
): Promise<MemoryManager> {
  globalMemoryManager = new MemoryManager(config);
  await globalMemoryManager.initialize();
  return globalMemoryManager;
}

/**
 * Get the global memory manager
 */
export function getMemoryManager(): MemoryManager {
  if (!globalMemoryManager) {
    throw new Error('Memory manager not initialized. Call initMemoryManager() first.');
  }
  return globalMemoryManager;
}

/**
 * Check if memory manager is initialized
 */
export function isMemoryManagerInitialized(): boolean {
  return globalMemoryManager !== null && globalMemoryManager.isInitialized();
}
