/**
 * Content Creator Suite - Content Store
 *
 * Persistence layer for generated content with database and in-memory implementations.
 */

import type {
  GeneratedContent,
  ContentQueryOptions,
  ContentStatus,
  ContentType,
  ContentPlatform,
  ContentMetadata,
  DatabaseAdapter,
} from '../types.js';

// =============================================================================
// Content Store Interface
// =============================================================================

export interface ContentStore {
  initialize(): Promise<void>;
  create(content: Omit<GeneratedContent, 'id' | 'createdAt' | 'updatedAt'>): Promise<GeneratedContent>;
  get(contentId: string): Promise<GeneratedContent | null>;
  update(contentId: string, updates: Partial<GeneratedContent>): Promise<GeneratedContent | null>;
  delete(contentId: string): Promise<boolean>;
  list(options?: ContentQueryOptions): Promise<GeneratedContent[]>;
  count(options?: ContentQueryOptions): Promise<number>;
  bulkUpdateStatus(contentIds: string[], status: ContentStatus): Promise<number>;
  bulkDelete(contentIds: string[]): Promise<number>;
  getByPlatform(platform: ContentPlatform, options?: ContentQueryOptions): Promise<GeneratedContent[]>;
  getScheduled(beforeTimestamp?: number): Promise<GeneratedContent[]>;
  getByVoiceProfile(voiceProfileId: string, options?: ContentQueryOptions): Promise<GeneratedContent[]>;
}

// =============================================================================
// Database Implementation
// =============================================================================

interface ContentRow {
  id: string;
  user_id: string;
  type: string;
  platform: string;
  status: string;
  title: string | null;
  content: string;
  metadata: string;
  voice_profile_id: string | null;
  scheduled_at: number | null;
  published_at: number | null;
  created_at: number;
  updated_at: number;
}

export class DatabaseContentStore implements ContentStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS content_creator_content (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        platform TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        title TEXT,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        voice_profile_id TEXT,
        scheduled_at INTEGER,
        published_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_content_user_status
      ON content_creator_content(user_id, status)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_content_platform
      ON content_creator_content(platform)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_content_scheduled
      ON content_creator_content(scheduled_at)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_content_voice_profile
      ON content_creator_content(voice_profile_id)
    `);
  }

  async create(
    content: Omit<GeneratedContent, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<GeneratedContent> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.execute(
      `INSERT INTO content_creator_content
       (id, user_id, type, platform, status, title, content, metadata,
        voice_profile_id, scheduled_at, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        content.userId,
        content.type,
        content.platform,
        content.status,
        content.title ?? null,
        content.content,
        JSON.stringify(content.metadata),
        content.voiceProfileId ?? null,
        content.scheduledAt ?? null,
        content.publishedAt ?? null,
        now,
        now,
      ]
    );

    return {
      ...content,
      id,
      createdAt: now,
      updatedAt: now,
    };
  }

  async get(contentId: string): Promise<GeneratedContent | null> {
    const result = await this.db.query<ContentRow>(
      'SELECT * FROM content_creator_content WHERE id = ?',
      [contentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToContent(result.rows[0]);
  }

  async update(
    contentId: string,
    updates: Partial<GeneratedContent>
  ): Promise<GeneratedContent | null> {
    const existing = await this.get(contentId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const params: unknown[] = [now];

    if (updates.type !== undefined) {
      setClauses.push('type = ?');
      params.push(updates.type);
    }
    if (updates.platform !== undefined) {
      setClauses.push('platform = ?');
      params.push(updates.platform);
    }
    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      params.push(updates.status);
    }
    if (updates.title !== undefined) {
      setClauses.push('title = ?');
      params.push(updates.title);
    }
    if (updates.content !== undefined) {
      setClauses.push('content = ?');
      params.push(updates.content);
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?');
      params.push(JSON.stringify(updates.metadata));
    }
    if (updates.voiceProfileId !== undefined) {
      setClauses.push('voice_profile_id = ?');
      params.push(updates.voiceProfileId);
    }
    if (updates.scheduledAt !== undefined) {
      setClauses.push('scheduled_at = ?');
      params.push(updates.scheduledAt);
    }
    if (updates.publishedAt !== undefined) {
      setClauses.push('published_at = ?');
      params.push(updates.publishedAt);
    }

    params.push(contentId);

    await this.db.execute(
      `UPDATE content_creator_content SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    return this.get(contentId);
  }

  async delete(contentId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM content_creator_content WHERE id = ?',
      [contentId]
    );
    return result.changes > 0;
  }

  async list(options?: ContentQueryOptions): Promise<GeneratedContent[]> {
    const { whereClause, params } = this.buildWhereClause(options);
    const orderBy = this.buildOrderBy(options);
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const result = await this.db.query<ContentRow>(
      `SELECT * FROM content_creator_content ${whereClause} ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return result.rows.map(row => this.rowToContent(row));
  }

  async count(options?: ContentQueryOptions): Promise<number> {
    const { whereClause, params } = this.buildWhereClause(options);

    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM content_creator_content ${whereClause}`,
      params
    );

    return result.rows[0]?.count ?? 0;
  }

  async bulkUpdateStatus(contentIds: string[], status: ContentStatus): Promise<number> {
    if (contentIds.length === 0) {
      return 0;
    }

    const now = Date.now();
    const placeholders = contentIds.map(() => '?').join(',');

    const result = await this.db.execute(
      `UPDATE content_creator_content SET status = ?, updated_at = ? WHERE id IN (${placeholders})`,
      [status, now, ...contentIds]
    );

    return result.changes;
  }

  async bulkDelete(contentIds: string[]): Promise<number> {
    if (contentIds.length === 0) {
      return 0;
    }

    const placeholders = contentIds.map(() => '?').join(',');

    const result = await this.db.execute(
      `DELETE FROM content_creator_content WHERE id IN (${placeholders})`,
      contentIds
    );

    return result.changes;
  }

  async getByPlatform(
    platform: ContentPlatform,
    options?: ContentQueryOptions
  ): Promise<GeneratedContent[]> {
    return this.list({ ...options, platform });
  }

  async getScheduled(beforeTimestamp?: number): Promise<GeneratedContent[]> {
    const timestamp = beforeTimestamp ?? Date.now();

    const result = await this.db.query<ContentRow>(
      `SELECT * FROM content_creator_content
       WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?
       ORDER BY scheduled_at ASC`,
      [timestamp]
    );

    return result.rows.map(row => this.rowToContent(row));
  }

  async getByVoiceProfile(
    voiceProfileId: string,
    options?: ContentQueryOptions
  ): Promise<GeneratedContent[]> {
    const { whereClause, params } = this.buildWhereClause(options);
    const additionalWhere = whereClause ? ' AND voice_profile_id = ?' : 'WHERE voice_profile_id = ?';
    const orderBy = this.buildOrderBy(options);
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const result = await this.db.query<ContentRow>(
      `SELECT * FROM content_creator_content ${whereClause}${additionalWhere} ${orderBy} LIMIT ? OFFSET ?`,
      [...params, voiceProfileId, limit, offset]
    );

    return result.rows.map(row => this.rowToContent(row));
  }

  private buildWhereClause(options?: ContentQueryOptions): {
    whereClause: string;
    params: unknown[];
  } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }
    if (options?.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }
    if (options?.platform) {
      conditions.push('platform = ?');
      params.push(options.platform);
    }
    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options?.fromDate) {
      conditions.push('created_at >= ?');
      params.push(options.fromDate);
    }
    if (options?.toDate) {
      conditions.push('created_at <= ?');
      params.push(options.toDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  private buildOrderBy(options?: ContentQueryOptions): string {
    const sortBy = options?.sortBy ?? 'createdAt';
    const sortOrder = options?.sortOrder ?? 'desc';

    const columnMap: Record<string, string> = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      publishedAt: 'published_at',
    };

    const column = columnMap[sortBy] ?? 'created_at';
    return `ORDER BY ${column} ${sortOrder.toUpperCase()}`;
  }

  private rowToContent(row: ContentRow): GeneratedContent {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type as ContentType,
      platform: row.platform as ContentPlatform,
      status: row.status as ContentStatus,
      title: row.title ?? undefined,
      content: row.content,
      metadata: JSON.parse(row.metadata) as ContentMetadata,
      voiceProfileId: row.voice_profile_id ?? undefined,
      scheduledAt: row.scheduled_at ?? undefined,
      publishedAt: row.published_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryContentStore implements ContentStore {
  private content = new Map<string, GeneratedContent>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async create(
    content: Omit<GeneratedContent, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<GeneratedContent> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const newContent: GeneratedContent = {
      ...content,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.content.set(id, newContent);
    return newContent;
  }

  async get(contentId: string): Promise<GeneratedContent | null> {
    return this.content.get(contentId) ?? null;
  }

  async update(
    contentId: string,
    updates: Partial<GeneratedContent>
  ): Promise<GeneratedContent | null> {
    const existing = this.content.get(contentId);
    if (!existing) {
      return null;
    }

    const updated: GeneratedContent = {
      ...existing,
      ...updates,
      id: existing.id, // Prevent ID changes
      createdAt: existing.createdAt, // Prevent createdAt changes
      updatedAt: Date.now(),
    };

    this.content.set(contentId, updated);
    return updated;
  }

  async delete(contentId: string): Promise<boolean> {
    return this.content.delete(contentId);
  }

  async list(options?: ContentQueryOptions): Promise<GeneratedContent[]> {
    let items = Array.from(this.content.values());

    // Apply filters
    if (options?.userId) {
      items = items.filter(c => c.userId === options.userId);
    }
    if (options?.type) {
      items = items.filter(c => c.type === options.type);
    }
    if (options?.platform) {
      items = items.filter(c => c.platform === options.platform);
    }
    if (options?.status) {
      items = items.filter(c => c.status === options.status);
    }
    if (options?.fromDate) {
      items = items.filter(c => c.createdAt >= options.fromDate!);
    }
    if (options?.toDate) {
      items = items.filter(c => c.createdAt <= options.toDate!);
    }

    // Apply sorting
    const sortBy = options?.sortBy ?? 'createdAt';
    const sortOrder = options?.sortOrder ?? 'desc';
    items.sort((a, b) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return items.slice(offset, offset + limit);
  }

  async count(options?: ContentQueryOptions): Promise<number> {
    const items = await this.list({ ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async bulkUpdateStatus(contentIds: string[], status: ContentStatus): Promise<number> {
    let updated = 0;
    const now = Date.now();

    for (const id of contentIds) {
      const content = this.content.get(id);
      if (content) {
        this.content.set(id, { ...content, status, updatedAt: now });
        updated++;
      }
    }

    return updated;
  }

  async bulkDelete(contentIds: string[]): Promise<number> {
    let deleted = 0;

    for (const id of contentIds) {
      if (this.content.delete(id)) {
        deleted++;
      }
    }

    return deleted;
  }

  async getByPlatform(
    platform: ContentPlatform,
    options?: ContentQueryOptions
  ): Promise<GeneratedContent[]> {
    return this.list({ ...options, platform });
  }

  async getScheduled(beforeTimestamp?: number): Promise<GeneratedContent[]> {
    const timestamp = beforeTimestamp ?? Date.now();

    return Array.from(this.content.values())
      .filter(
        c =>
          c.status === 'scheduled' &&
          c.scheduledAt !== undefined &&
          c.scheduledAt <= timestamp
      )
      .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));
  }

  async getByVoiceProfile(
    voiceProfileId: string,
    options?: ContentQueryOptions
  ): Promise<GeneratedContent[]> {
    const items = await this.list(options);
    return items.filter(c => c.voiceProfileId === voiceProfileId);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createContentStore(
  type: 'database' | 'memory',
  db?: DatabaseAdapter
): ContentStore {
  if (type === 'database' && db) {
    return new DatabaseContentStore(db);
  }
  return new InMemoryContentStore();
}
