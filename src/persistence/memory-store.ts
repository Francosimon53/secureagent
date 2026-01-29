import { randomUUID } from 'crypto';
import { MemoryEntry } from '../agent/types.js';
import { DatabaseManager, getDatabaseManager } from './database.js';
import { EncryptionService, generateSalt } from './encryption.js';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'MemoryStore' });

// ============================================================================
// Memory Store Types
// ============================================================================

export interface StoredMemory {
  id: string;
  user_id: string;
  conversation_id: string | null;
  key: string;
  content_ciphertext: string;
  content_iv: string;
  content_tag: string;
  metadata_ciphertext: string | null;
  metadata_iv: string | null;
  metadata_tag: string | null;
  type: string;
  importance: number;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
  last_accessed_at: number | null;
  access_count: number;
  summarized: number;
  user_salt: string;
}

export interface MemoryQueryOptions {
  type?: MemoryEntry['type'];
  types?: MemoryEntry['type'][];
  excludeTypes?: MemoryEntry['type'][];
  minImportance?: number;
  maxAge?: number;
  createdAfter?: number;
  createdBefore?: number;
  limit?: number;
  offset?: number;
  orderBy?: 'importance' | 'createdAt' | 'updatedAt' | 'lastAccessedAt';
  orderDir?: 'asc' | 'desc';
  order?: 'asc' | 'desc'; // Alias for orderDir
  includeSummarized?: boolean;
  includeExpired?: boolean;
}

export interface UserKey {
  user_id: string;
  salt: string;
  created_at: number;
  rotated_at: number | null;
}

// ============================================================================
// Memory Store Interface
// ============================================================================

export interface MemoryStore {
  initialize(): Promise<void>;

  // CRUD operations
  store(userId: string, entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry>;
  get(userId: string, memoryId: string): Promise<MemoryEntry | null>;
  getByKey(userId: string, key: string): Promise<MemoryEntry | null>;
  update(userId: string, memoryId: string, updates: Partial<MemoryEntry>): Promise<boolean>;
  delete(userId: string, memoryId: string): Promise<boolean>;
  deleteByKey(userId: string, key: string): Promise<boolean>;

  // Query operations
  search(userId: string, options?: MemoryQueryOptions): Promise<MemoryEntry[]>;
  count(userId: string): Promise<number>;
  getRecent(userId: string, limit?: number): Promise<MemoryEntry[]>;
  getByType(userId: string, type: MemoryEntry['type']): Promise<MemoryEntry[]>;

  // Maintenance
  deleteExpired(): Promise<number>;
  deleteByUser(userId: string): Promise<number>;
  markSummarized(userId: string, memoryIds: string[]): Promise<void>;
  getForSummarization(userId: string, limit?: number): Promise<MemoryEntry[]>;
  vacuum(): Promise<void>;

  // User key management
  getUserSalt(userId: string): Promise<Buffer | null>;
  setUserSalt(userId: string, salt: Buffer): Promise<void>;
}

// ============================================================================
// Database Memory Store
// ============================================================================

export class DatabaseMemoryStore implements MemoryStore {
  private initialized = false;
  private readonly dbManager: DatabaseManager;
  private readonly encryption?: EncryptionService;

  constructor(
    dbManager?: DatabaseManager,
    encryption?: EncryptionService
  ) {
    this.dbManager = dbManager ?? getDatabaseManager();
    this.encryption = encryption;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create tables
    await this.dbManager.query(`
      CREATE TABLE IF NOT EXISTS user_keys (
        user_id TEXT PRIMARY KEY,
        salt TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        rotated_at INTEGER
      )
    `);

    await this.dbManager.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        conversation_id TEXT,
        key TEXT NOT NULL,
        content_ciphertext TEXT NOT NULL,
        content_iv TEXT NOT NULL,
        content_tag TEXT NOT NULL,
        metadata_ciphertext TEXT,
        metadata_iv TEXT,
        metadata_tag TEXT,
        type TEXT NOT NULL CHECK (type IN ('fact', 'preference', 'context', 'summary')),
        importance REAL NOT NULL DEFAULT 0.5,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER,
        last_accessed_at INTEGER,
        access_count INTEGER NOT NULL DEFAULT 0,
        summarized INTEGER NOT NULL DEFAULT 0,
        user_salt TEXT NOT NULL,
        UNIQUE(user_id, key)
      )
    `);

    // Create indexes
    await this.dbManager.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id)
    `);
    await this.dbManager.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_user_type ON memories(user_id, type)
    `);
    await this.dbManager.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_user_importance ON memories(user_id, importance DESC)
    `);
    await this.dbManager.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_expires_at ON memories(expires_at)
    `);
    await this.dbManager.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_summarized ON memories(user_id, summarized)
    `);

    this.initialized = true;
    logger.info('Memory store initialized');
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async store(userId: string, entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry> {
    await this.ensureInitialized();

    const id = randomUUID();
    const now = Date.now();
    const salt = await this.getOrCreateUserSalt(userId);

    // Encrypt content
    const contentStr = typeof entry.value !== 'undefined'
      ? JSON.stringify(entry.value)
      : entry.content;

    let encrypted: { ciphertext: string; iv: string; tag: string };
    if (this.encryption) {
      encrypted = this.encryption.encryptWithSalt(userId, contentStr, salt);
    } else {
      // No encryption - store as base64 (for testing)
      encrypted = {
        ciphertext: Buffer.from(contentStr).toString('base64'),
        iv: '',
        tag: '',
      };
    }

    // Encrypt metadata if present
    let metaEncrypted: { ciphertext: string; iv: string; tag: string } | null = null;
    if (entry.metadata) {
      const metaStr = JSON.stringify(entry.metadata);
      if (this.encryption) {
        metaEncrypted = this.encryption.encryptWithSalt(userId, metaStr, salt);
      } else {
        metaEncrypted = {
          ciphertext: Buffer.from(metaStr).toString('base64'),
          iv: '',
          tag: '',
        };
      }
    }

    await this.dbManager.query(
      `INSERT INTO memories (
        id, user_id, conversation_id, key,
        content_ciphertext, content_iv, content_tag,
        metadata_ciphertext, metadata_iv, metadata_tag,
        type, importance, created_at, updated_at, expires_at,
        last_accessed_at, access_count, summarized, user_salt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET
        content_ciphertext = excluded.content_ciphertext,
        content_iv = excluded.content_iv,
        content_tag = excluded.content_tag,
        metadata_ciphertext = excluded.metadata_ciphertext,
        metadata_iv = excluded.metadata_iv,
        metadata_tag = excluded.metadata_tag,
        type = excluded.type,
        importance = excluded.importance,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at`,
      [
        id,
        userId,
        entry.conversationId ?? null,
        entry.key ?? id,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        metaEncrypted?.ciphertext ?? null,
        metaEncrypted?.iv ?? null,
        metaEncrypted?.tag ?? null,
        entry.type,
        entry.importance,
        now,
        now,
        entry.expiresAt ?? null,
        null,
        0,
        0,
        salt.toString('base64'),
      ]
    );

    const fullEntry: MemoryEntry = {
      id,
      conversationId: entry.conversationId,
      content: entry.content,
      type: entry.type,
      importance: entry.importance,
      createdAt: now,
      expiresAt: entry.expiresAt,
      metadata: entry.metadata,
      key: entry.key ?? id,
      value: entry.value,
    };

    logger.debug({ userId, memoryId: id }, 'Memory stored');
    return fullEntry;
  }

  async get(userId: string, memoryId: string): Promise<MemoryEntry | null> {
    await this.ensureInitialized();

    const result = await this.dbManager.query<StoredMemory>(
      `SELECT * FROM memories WHERE id = ? AND user_id = ?`,
      [memoryId, userId]
    );

    if (result.rows.length === 0) return null;

    // Update access tracking
    await this.dbManager.query(
      `UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?`,
      [Date.now(), memoryId]
    );

    return this.decryptMemory(result.rows[0], userId);
  }

  async getByKey(userId: string, key: string): Promise<MemoryEntry | null> {
    await this.ensureInitialized();

    const result = await this.dbManager.query<StoredMemory>(
      `SELECT * FROM memories WHERE key = ? AND user_id = ?`,
      [key, userId]
    );

    if (result.rows.length === 0) return null;

    // Update access tracking
    await this.dbManager.query(
      `UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?`,
      [Date.now(), result.rows[0].id]
    );

    return this.decryptMemory(result.rows[0], userId);
  }

  async update(userId: string, memoryId: string, updates: Partial<MemoryEntry>): Promise<boolean> {
    await this.ensureInitialized();

    // Build update query
    const setClauses: string[] = ['updated_at = ?'];
    const params: unknown[] = [Date.now()];

    if (updates.importance !== undefined) {
      setClauses.push('importance = ?');
      params.push(updates.importance);
    }

    if (updates.type !== undefined) {
      setClauses.push('type = ?');
      params.push(updates.type);
    }

    if (updates.expiresAt !== undefined) {
      setClauses.push('expires_at = ?');
      params.push(updates.expiresAt);
    }

    if (updates.content !== undefined || updates.value !== undefined) {
      const salt = await this.getUserSalt(userId);
      if (!salt) throw new Error('User salt not found');

      const contentStr = updates.value !== undefined
        ? JSON.stringify(updates.value)
        : updates.content!;

      if (this.encryption) {
        const encrypted = this.encryption.encryptWithSalt(userId, contentStr, salt);
        setClauses.push('content_ciphertext = ?', 'content_iv = ?', 'content_tag = ?');
        params.push(encrypted.ciphertext, encrypted.iv, encrypted.tag);
      } else {
        setClauses.push('content_ciphertext = ?', 'content_iv = ?', 'content_tag = ?');
        params.push(Buffer.from(contentStr).toString('base64'), '', '');
      }
    }

    params.push(memoryId, userId);

    const result = await this.dbManager.query(
      `UPDATE memories SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`,
      params
    );

    return result.rowCount > 0;
  }

  async delete(userId: string, memoryId: string): Promise<boolean> {
    await this.ensureInitialized();

    const result = await this.dbManager.query(
      `DELETE FROM memories WHERE id = ? AND user_id = ?`,
      [memoryId, userId]
    );

    return result.rowCount > 0;
  }

  async deleteByKey(userId: string, key: string): Promise<boolean> {
    await this.ensureInitialized();

    const result = await this.dbManager.query(
      `DELETE FROM memories WHERE key = ? AND user_id = ?`,
      [key, userId]
    );

    return result.rowCount > 0;
  }

  async search(userId: string, options: MemoryQueryOptions = {}): Promise<MemoryEntry[]> {
    await this.ensureInitialized();

    const whereClauses = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (options.type) {
      whereClauses.push('type = ?');
      params.push(options.type);
    }

    if (options.types && options.types.length > 0) {
      const placeholders = options.types.map(() => '?').join(',');
      whereClauses.push(`type IN (${placeholders})`);
      params.push(...options.types);
    }

    if (options.excludeTypes && options.excludeTypes.length > 0) {
      const placeholders = options.excludeTypes.map(() => '?').join(',');
      whereClauses.push(`type NOT IN (${placeholders})`);
      params.push(...options.excludeTypes);
    }

    if (options.minImportance !== undefined) {
      whereClauses.push('importance >= ?');
      params.push(options.minImportance);
    }

    if (options.maxAge !== undefined) {
      whereClauses.push('created_at >= ?');
      params.push(Date.now() - options.maxAge);
    }

    if (options.createdAfter !== undefined) {
      whereClauses.push('created_at >= ?');
      params.push(options.createdAfter);
    }

    if (options.createdBefore !== undefined) {
      whereClauses.push('created_at <= ?');
      params.push(options.createdBefore);
    }

    if (!options.includeSummarized) {
      whereClauses.push('summarized = 0');
    }

    if (!options.includeExpired) {
      whereClauses.push('(expires_at IS NULL OR expires_at > ?)');
      params.push(Date.now());
    }

    const orderCol = {
      importance: 'importance',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      lastAccessedAt: 'last_accessed_at',
    }[options.orderBy ?? 'importance'];

    const orderDir = (options.orderDir ?? options.order)?.toUpperCase() ?? 'DESC';

    let query = `SELECT * FROM memories WHERE ${whereClauses.join(' AND ')} ORDER BY ${orderCol} ${orderDir}`;

    if (options.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options.offset) {
      query += ` OFFSET ?`;
      params.push(options.offset);
    }

    const result = await this.dbManager.query<StoredMemory>(query, params);
    return Promise.all(result.rows.map(row => this.decryptMemory(row, userId)));
  }

  async count(userId: string): Promise<number> {
    await this.ensureInitialized();

    const result = await this.dbManager.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM memories WHERE user_id = ?`,
      [userId]
    );

    return result.rows[0]?.count ?? 0;
  }

  async getRecent(userId: string, limit: number = 10): Promise<MemoryEntry[]> {
    return this.search(userId, {
      orderBy: 'createdAt',
      orderDir: 'desc',
      limit,
    });
  }

  async getByType(userId: string, type: MemoryEntry['type']): Promise<MemoryEntry[]> {
    return this.search(userId, { type });
  }

  async deleteExpired(): Promise<number> {
    await this.ensureInitialized();

    const result = await this.dbManager.query(
      `DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < ?`,
      [Date.now()]
    );

    if (result.rowCount > 0) {
      logger.info({ deleted: result.rowCount }, 'Expired memories deleted');
    }

    return result.rowCount;
  }

  async deleteByUser(userId: string): Promise<number> {
    await this.ensureInitialized();

    const result = await this.dbManager.query(
      `DELETE FROM memories WHERE user_id = ?`,
      [userId]
    );

    // Also delete user key
    await this.dbManager.query(
      `DELETE FROM user_keys WHERE user_id = ?`,
      [userId]
    );

    logger.info({ userId, deleted: result.rowCount }, 'User memories deleted');
    return result.rowCount;
  }

  async markSummarized(userId: string, memoryIds: string[]): Promise<void> {
    await this.ensureInitialized();

    if (memoryIds.length === 0) return;

    const placeholders = memoryIds.map(() => '?').join(',');
    await this.dbManager.query(
      `UPDATE memories SET summarized = 1 WHERE user_id = ? AND id IN (${placeholders})`,
      [userId, ...memoryIds]
    );
  }

  async getForSummarization(userId: string, limit: number = 100): Promise<MemoryEntry[]> {
    return this.search(userId, {
      includeSummarized: false,
      orderBy: 'createdAt',
      orderDir: 'asc',
      limit,
    });
  }

  async vacuum(): Promise<void> {
    await this.ensureInitialized();
    await this.dbManager.query('VACUUM');
    logger.info('Memory store vacuumed');
  }

  async getUserSalt(userId: string): Promise<Buffer | null> {
    await this.ensureInitialized();

    const result = await this.dbManager.query<UserKey>(
      `SELECT salt FROM user_keys WHERE user_id = ?`,
      [userId]
    );

    if (result.rows.length === 0) return null;
    return Buffer.from(result.rows[0].salt, 'base64');
  }

  async setUserSalt(userId: string, salt: Buffer): Promise<void> {
    await this.ensureInitialized();

    await this.dbManager.query(
      `INSERT INTO user_keys (user_id, salt, created_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET salt = excluded.salt, rotated_at = ?`,
      [userId, salt.toString('base64'), Date.now(), Date.now()]
    );
  }

  private async getOrCreateUserSalt(userId: string): Promise<Buffer> {
    let salt = await this.getUserSalt(userId);
    if (!salt) {
      salt = generateSalt();
      await this.setUserSalt(userId, salt);
    }
    return salt;
  }

  private async decryptMemory(stored: StoredMemory, userId: string): Promise<MemoryEntry> {
    const salt = Buffer.from(stored.user_salt, 'base64');

    let content: string;
    let value: unknown;

    if (this.encryption) {
      content = this.encryption.decryptWithSalt(
        userId,
        {
          ciphertext: stored.content_ciphertext,
          iv: stored.content_iv,
          tag: stored.content_tag,
        },
        salt
      );
    } else {
      content = Buffer.from(stored.content_ciphertext, 'base64').toString('utf8');
    }

    // Try to parse as JSON for value
    try {
      value = JSON.parse(content);
    } catch {
      value = content;
    }

    let metadata: Record<string, unknown> | undefined;
    if (stored.metadata_ciphertext) {
      let metaStr: string;
      if (this.encryption) {
        metaStr = this.encryption.decryptWithSalt(
          userId,
          {
            ciphertext: stored.metadata_ciphertext,
            iv: stored.metadata_iv!,
            tag: stored.metadata_tag!,
          },
          salt
        );
      } else {
        metaStr = Buffer.from(stored.metadata_ciphertext, 'base64').toString('utf8');
      }
      metadata = JSON.parse(metaStr);
    }

    return {
      id: stored.id,
      conversationId: stored.conversation_id ?? undefined,
      content,
      type: stored.type as MemoryEntry['type'],
      importance: stored.importance,
      createdAt: stored.created_at,
      expiresAt: stored.expires_at ?? undefined,
      metadata,
      key: stored.key,
      value,
    };
  }
}

// ============================================================================
// In-Memory Store (for testing)
// ============================================================================

export class InMemoryMemoryStore implements MemoryStore {
  private readonly memories = new Map<string, Map<string, MemoryEntry>>();
  private readonly userSalts = new Map<string, Buffer>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  private getUserMemories(userId: string): Map<string, MemoryEntry> {
    let userMems = this.memories.get(userId);
    if (!userMems) {
      userMems = new Map();
      this.memories.set(userId, userMems);
    }
    return userMems;
  }

  async store(userId: string, entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry> {
    const id = randomUUID();
    const now = Date.now();

    const fullEntry: MemoryEntry = {
      id,
      conversationId: entry.conversationId,
      content: entry.content,
      type: entry.type,
      importance: entry.importance,
      createdAt: now,
      expiresAt: entry.expiresAt,
      metadata: entry.metadata,
      key: entry.key ?? id,
      value: entry.value,
    };

    this.getUserMemories(userId).set(fullEntry.key!, fullEntry);
    return fullEntry;
  }

  async get(userId: string, memoryId: string): Promise<MemoryEntry | null> {
    const userMems = this.getUserMemories(userId);
    for (const mem of userMems.values()) {
      if (mem.id === memoryId) return mem;
    }
    return null;
  }

  async getByKey(userId: string, key: string): Promise<MemoryEntry | null> {
    return this.getUserMemories(userId).get(key) ?? null;
  }

  async update(userId: string, memoryId: string, updates: Partial<MemoryEntry>): Promise<boolean> {
    const userMems = this.getUserMemories(userId);
    for (const [key, mem] of userMems) {
      if (mem.id === memoryId) {
        userMems.set(key, { ...mem, ...updates });
        return true;
      }
    }
    return false;
  }

  async delete(userId: string, memoryId: string): Promise<boolean> {
    const userMems = this.getUserMemories(userId);
    for (const [key, mem] of userMems) {
      if (mem.id === memoryId) {
        userMems.delete(key);
        return true;
      }
    }
    return false;
  }

  async deleteByKey(userId: string, key: string): Promise<boolean> {
    return this.getUserMemories(userId).delete(key);
  }

  async search(userId: string, options: MemoryQueryOptions = {}): Promise<MemoryEntry[]> {
    const now = Date.now();
    let entries = Array.from(this.getUserMemories(userId).values());

    if (options.type) {
      entries = entries.filter(e => e.type === options.type);
    }

    if (options.types && options.types.length > 0) {
      entries = entries.filter(e => options.types!.includes(e.type));
    }

    if (options.excludeTypes && options.excludeTypes.length > 0) {
      entries = entries.filter(e => !options.excludeTypes!.includes(e.type));
    }

    if (options.minImportance !== undefined) {
      entries = entries.filter(e => e.importance >= options.minImportance!);
    }

    if (options.createdAfter !== undefined) {
      entries = entries.filter(e => e.createdAt >= options.createdAfter!);
    }

    if (options.createdBefore !== undefined) {
      entries = entries.filter(e => e.createdAt <= options.createdBefore!);
    }

    if (!options.includeExpired) {
      entries = entries.filter(e => !e.expiresAt || e.expiresAt > now);
    }

    // Sort
    const orderDir = options.orderDir ?? options.order;
    entries.sort((a, b) => {
      const aVal = options.orderBy === 'createdAt' ? a.createdAt : a.importance;
      const bVal = options.orderBy === 'createdAt' ? b.createdAt : b.importance;
      return orderDir === 'asc' ? aVal - bVal : bVal - aVal;
    });

    if (options.offset) {
      entries = entries.slice(options.offset);
    }

    if (options.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  async count(userId: string): Promise<number> {
    return this.getUserMemories(userId).size;
  }

  async getRecent(userId: string, limit: number = 10): Promise<MemoryEntry[]> {
    return this.search(userId, { orderBy: 'createdAt', orderDir: 'desc', limit });
  }

  async getByType(userId: string, type: MemoryEntry['type']): Promise<MemoryEntry[]> {
    return this.search(userId, { type });
  }

  async deleteExpired(): Promise<number> {
    const now = Date.now();
    let count = 0;

    for (const userMems of this.memories.values()) {
      for (const [key, mem] of userMems) {
        if (mem.expiresAt && mem.expiresAt < now) {
          userMems.delete(key);
          count++;
        }
      }
    }

    return count;
  }

  async deleteByUser(userId: string): Promise<number> {
    const count = this.getUserMemories(userId).size;
    this.memories.delete(userId);
    this.userSalts.delete(userId);
    return count;
  }

  async markSummarized(_userId: string, _memoryIds: string[]): Promise<void> {
    // No-op for in-memory
  }

  async getForSummarization(userId: string, limit: number = 100): Promise<MemoryEntry[]> {
    return this.search(userId, { limit });
  }

  async vacuum(): Promise<void> {
    // No-op for in-memory
  }

  async getUserSalt(userId: string): Promise<Buffer | null> {
    return this.userSalts.get(userId) ?? null;
  }

  async setUserSalt(userId: string, salt: Buffer): Promise<void> {
    this.userSalts.set(userId, salt);
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a memory store
 */
export function createMemoryStore(
  type: 'memory' | 'database',
  encryption?: EncryptionService,
  dbManager?: DatabaseManager
): MemoryStore {
  if (type === 'memory') {
    return new InMemoryMemoryStore();
  }
  return new DatabaseMemoryStore(dbManager, encryption);
}
