/**
 * Memory Store
 *
 * SQLite-backed persistent memory with AES-256-GCM encryption,
 * per-user/session isolation, and vector embedding support
 */

import { randomUUID, createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto';
import type {
  Memory,
  MemoryCreateInput,
  MemoryUpdateInput,
  MemorySearchResult,
  MemorySearchOptions,
  MemoryType,
  MemoryPriority,
  EncryptedData,
} from './types.js';
import { MemoryError } from './types.js';
import {
  MEMORY_DEFAULTS,
  ENCRYPTION_CONFIG,
  PRIORITY_WEIGHTS,
  TABLE_NAMES,
} from './constants.js';

// =============================================================================
// Database Adapter Interface
// =============================================================================

export interface DatabaseAdapter {
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

// =============================================================================
// Memory Store Interface
// =============================================================================

export interface MemoryQueryOptions {
  userId?: string;
  sessionId?: string;
  type?: MemoryType;
  priority?: MemoryPriority;
  includeExpired?: boolean;
  limit?: number;
  offset?: number;
}

export interface MemoryStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Store a new memory */
  store(input: MemoryCreateInput): Promise<Memory>;

  /** Retrieve a memory by ID */
  retrieve(id: string, userId: string): Promise<Memory | null>;

  /** Retrieve a memory by key */
  retrieveByKey(userId: string, key: string, sessionId?: string): Promise<Memory | null>;

  /** Search memories using vector similarity */
  search(
    userId: string,
    embedding: number[],
    options?: MemorySearchOptions
  ): Promise<MemorySearchResult[]>;

  /** Update a memory */
  update(id: string, userId: string, updates: MemoryUpdateInput): Promise<Memory | null>;

  /** Delete/forget a memory */
  forget(id: string, userId: string): Promise<boolean>;

  /** Delete all memories for a user */
  forgetAll(userId: string, sessionId?: string): Promise<number>;

  /** List memories */
  list(options: MemoryQueryOptions): Promise<Memory[]>;

  /** Count memories */
  count(options: MemoryQueryOptions): Promise<number>;

  /** Clean up expired memories */
  cleanup(): Promise<number>;

  /** Apply decay to memory scores */
  applyDecay(): Promise<number>;
}

// =============================================================================
// Encryption Utilities
// =============================================================================

export class MemoryEncryption {
  private readonly masterKey: Buffer;

  constructor(masterKeyOrPassword: string | Buffer) {
    if (Buffer.isBuffer(masterKeyOrPassword)) {
      this.masterKey = masterKeyOrPassword;
    } else {
      // Derive key from password
      const salt = Buffer.from('memory-store-salt', 'utf-8');
      this.masterKey = pbkdf2Sync(
        masterKeyOrPassword,
        salt,
        ENCRYPTION_CONFIG.iterations ?? 100000,
        32,
        'sha256'
      );
    }
  }

  encrypt(plaintext: string): EncryptedData {
    const salt = randomBytes(ENCRYPTION_CONFIG.saltLength);
    const iv = randomBytes(ENCRYPTION_CONFIG.ivLength);

    // Derive unique key for this encryption
    const key = pbkdf2Sync(
      this.masterKey,
      salt,
      ENCRYPTION_CONFIG.iterations ?? 100000,
      32,
      'sha256'
    );

    const cipher = createCipheriv(ENCRYPTION_CONFIG.algorithm, key, iv, {
      authTagLength: ENCRYPTION_CONFIG.tagLength,
    });

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    const tag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      salt: salt.toString('base64'),
      algorithm: ENCRYPTION_CONFIG.algorithm,
    };
  }

  decrypt(encrypted: EncryptedData): string {
    const salt = Buffer.from(encrypted.salt, 'base64');
    const iv = Buffer.from(encrypted.iv, 'base64');
    const tag = Buffer.from(encrypted.tag, 'base64');

    const key = pbkdf2Sync(
      this.masterKey,
      salt,
      ENCRYPTION_CONFIG.iterations ?? 100000,
      32,
      'sha256'
    );

    const decipher = createDecipheriv(ENCRYPTION_CONFIG.algorithm, key, iv, {
      authTagLength: ENCRYPTION_CONFIG.tagLength,
    });

    decipher.setAuthTag(tag);

    let plaintext = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }
}

// =============================================================================
// Vector Similarity
// =============================================================================

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// =============================================================================
// Database Row Type
// =============================================================================

interface MemoryRow {
  id: string;
  user_id: string;
  session_id: string | null;
  type: string;
  key: string;
  value_encrypted: string;
  metadata_encrypted: string | null;
  embedding: string | null;
  priority: string;
  retention: string;
  ttl_ms: number | null;
  decay_rate: number | null;
  score: number;
  access_count: number;
  last_accessed_at: number;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
}

// =============================================================================
// Database Memory Store
// =============================================================================

export class DatabaseMemoryStore implements MemoryStore {
  private encryption: MemoryEncryption;

  constructor(
    private readonly db: DatabaseAdapter,
    encryptionKey: string | Buffer
  ) {
    this.encryption = new MemoryEncryption(encryptionKey);
  }

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.MEMORIES} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT,
        type TEXT NOT NULL,
        key TEXT NOT NULL,
        value_encrypted TEXT NOT NULL,
        metadata_encrypted TEXT,
        embedding TEXT,
        priority TEXT NOT NULL DEFAULT 'normal',
        retention TEXT NOT NULL DEFAULT 'permanent',
        ttl_ms INTEGER,
        decay_rate REAL,
        score REAL NOT NULL DEFAULT 1.0,
        access_count INTEGER NOT NULL DEFAULT 0,
        last_accessed_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER,
        UNIQUE(user_id, key, session_id)
      )
    `);

    // Create indexes
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_memories_user_id ON ${TABLE_NAMES.MEMORIES}(user_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_memories_session_id ON ${TABLE_NAMES.MEMORIES}(session_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_memories_type ON ${TABLE_NAMES.MEMORIES}(type)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_memories_key ON ${TABLE_NAMES.MEMORIES}(key)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_memories_expires_at ON ${TABLE_NAMES.MEMORIES}(expires_at)
    `);
  }

  async store(input: MemoryCreateInput): Promise<Memory> {
    const now = Date.now();
    const id = randomUUID();

    const priority = input.priority ?? MEMORY_DEFAULTS.DEFAULT_PRIORITY;
    const retention = input.retention ?? MEMORY_DEFAULTS.DEFAULT_RETENTION;

    // Calculate expiration
    let expiresAt: number | undefined;
    if (retention === 'ttl' && input.ttlMs) {
      expiresAt = now + input.ttlMs;
    } else if (retention === 'session') {
      expiresAt = now + MEMORY_DEFAULTS.SESSION_MEMORY_TTL_MS;
    }

    // Encrypt value and metadata
    const valueEncrypted = this.encryption.encrypt(input.value);
    const metadataEncrypted = input.metadata
      ? this.encryption.encrypt(JSON.stringify(input.metadata))
      : null;

    const memory: Memory = {
      id,
      userId: input.userId,
      sessionId: input.sessionId,
      type: input.type,
      key: input.key,
      value: input.value,
      metadata: input.metadata,
      embedding: input.embedding,
      priority,
      retention,
      ttlMs: input.ttlMs,
      decayRate: input.decayRate ?? MEMORY_DEFAULTS.DEFAULT_DECAY_RATE,
      score: PRIORITY_WEIGHTS[priority],
      accessCount: 0,
      lastAccessedAt: now,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    await this.db.execute(
      `INSERT INTO ${TABLE_NAMES.MEMORIES} (
        id, user_id, session_id, type, key, value_encrypted,
        metadata_encrypted, embedding, priority, retention, ttl_ms,
        decay_rate, score, access_count, last_accessed_at,
        created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        memory.id,
        memory.userId,
        memory.sessionId ?? null,
        memory.type,
        memory.key,
        JSON.stringify(valueEncrypted),
        metadataEncrypted ? JSON.stringify(metadataEncrypted) : null,
        memory.embedding ? JSON.stringify(memory.embedding) : null,
        memory.priority,
        memory.retention,
        memory.ttlMs ?? null,
        memory.decayRate ?? null,
        memory.score,
        memory.accessCount,
        memory.lastAccessedAt,
        memory.createdAt,
        memory.updatedAt,
        memory.expiresAt ?? null,
      ]
    );

    return memory;
  }

  async retrieve(id: string, userId: string): Promise<Memory | null> {
    const now = Date.now();
    const result = await this.db.execute<MemoryRow>(
      `SELECT * FROM ${TABLE_NAMES.MEMORIES} WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (result.length === 0) return null;

    const memory = this.rowToMemory(result[0]);

    // Check expiration
    if (memory.expiresAt && memory.expiresAt < now) {
      return null;
    }

    // Update access stats
    await this.db.execute(
      `UPDATE ${TABLE_NAMES.MEMORIES}
       SET access_count = access_count + 1, last_accessed_at = ?
       WHERE id = ?`,
      [now, id]
    );

    return memory;
  }

  async retrieveByKey(userId: string, key: string, sessionId?: string): Promise<Memory | null> {
    const now = Date.now();
    let sql = `SELECT * FROM ${TABLE_NAMES.MEMORIES} WHERE user_id = ? AND key = ?`;
    const params: unknown[] = [userId, key];

    if (sessionId !== undefined) {
      sql += ' AND session_id = ?';
      params.push(sessionId);
    }

    const result = await this.db.execute<MemoryRow>(sql, params);

    if (result.length === 0) return null;

    const memory = this.rowToMemory(result[0]);

    // Check expiration
    if (memory.expiresAt && memory.expiresAt < now) {
      return null;
    }

    // Update access stats
    await this.db.execute(
      `UPDATE ${TABLE_NAMES.MEMORIES}
       SET access_count = access_count + 1, last_accessed_at = ?
       WHERE id = ?`,
      [now, memory.id]
    );

    return memory;
  }

  async search(
    userId: string,
    embedding: number[],
    options: MemorySearchOptions = {}
  ): Promise<MemorySearchResult[]> {
    const now = Date.now();
    let sql = `SELECT * FROM ${TABLE_NAMES.MEMORIES} WHERE user_id = ? AND embedding IS NOT NULL`;
    const params: unknown[] = [userId];

    if (options.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }

    if (!options.includeExpired) {
      sql += ' AND (expires_at IS NULL OR expires_at > ?)';
      params.push(now);
    }

    const result = await this.db.execute<MemoryRow>(sql, params);
    const memories = result.map(row => this.rowToMemory(row));

    // Calculate similarity scores
    const results: MemorySearchResult[] = [];
    const minSimilarity = options.minSimilarity ?? MEMORY_DEFAULTS.MIN_SIMILARITY_THRESHOLD;

    for (const memory of memories) {
      if (!memory.embedding) continue;

      const similarity = cosineSimilarity(embedding, memory.embedding);
      if (similarity < minSimilarity) continue;

      // Calculate relevance based on similarity, score, and recency
      const recencyBoost = 1 / (1 + (now - memory.lastAccessedAt) / (24 * 60 * 60 * 1000));
      const relevance = similarity * 0.6 + (memory.score / 10) * 0.3 + recencyBoost * 0.1;

      if (options.minRelevance && relevance < options.minRelevance) continue;

      results.push({ memory, similarity, relevance });
    }

    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);

    // Apply limit
    const limit = options.limit ?? MEMORY_DEFAULTS.DEFAULT_SEARCH_LIMIT;
    return results.slice(0, limit);
  }

  async update(id: string, userId: string, updates: MemoryUpdateInput): Promise<Memory | null> {
    const existing = await this.retrieve(id, userId);
    if (!existing) return null;

    const now = Date.now();
    const updated: Memory = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    // Recalculate expiration if retention changed
    if (updates.retention === 'ttl' && updates.ttlMs) {
      updated.expiresAt = now + updates.ttlMs;
    } else if (updates.retention === 'session') {
      updated.expiresAt = now + MEMORY_DEFAULTS.SESSION_MEMORY_TTL_MS;
    } else if (updates.retention === 'permanent') {
      updated.expiresAt = undefined;
    }

    // Encrypt updated values
    const valueEncrypted = this.encryption.encrypt(updated.value);
    const metadataEncrypted = updated.metadata
      ? this.encryption.encrypt(JSON.stringify(updated.metadata))
      : null;

    await this.db.execute(
      `UPDATE ${TABLE_NAMES.MEMORIES} SET
        value_encrypted = ?, metadata_encrypted = ?, embedding = ?,
        priority = ?, retention = ?, ttl_ms = ?, decay_rate = ?,
        updated_at = ?, expires_at = ?
      WHERE id = ? AND user_id = ?`,
      [
        JSON.stringify(valueEncrypted),
        metadataEncrypted ? JSON.stringify(metadataEncrypted) : null,
        updated.embedding ? JSON.stringify(updated.embedding) : null,
        updated.priority,
        updated.retention,
        updated.ttlMs ?? null,
        updated.decayRate ?? null,
        updated.updatedAt,
        updated.expiresAt ?? null,
        id,
        userId,
      ]
    );

    return updated;
  }

  async forget(id: string, userId: string): Promise<boolean> {
    const result = await this.db.execute(
      `DELETE FROM ${TABLE_NAMES.MEMORIES} WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    return (result as unknown as { changes: number }).changes > 0;
  }

  async forgetAll(userId: string, sessionId?: string): Promise<number> {
    let sql = `DELETE FROM ${TABLE_NAMES.MEMORIES} WHERE user_id = ?`;
    const params: unknown[] = [userId];

    if (sessionId !== undefined) {
      sql += ' AND session_id = ?';
      params.push(sessionId);
    }

    const result = await this.db.execute(sql, params);
    return (result as unknown as { changes: number }).changes;
  }

  async list(options: MemoryQueryOptions): Promise<Memory[]> {
    const { sql, params } = this.buildQuerySQL(options);
    const result = await this.db.execute<MemoryRow>(sql, params);
    return result.map(row => this.rowToMemory(row));
  }

  async count(options: MemoryQueryOptions): Promise<number> {
    const { sql, params } = this.buildQuerySQL(options, true);
    const result = await this.db.execute<{ count: number }>(sql, params);
    return result[0]?.count ?? 0;
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    const result = await this.db.execute(
      `DELETE FROM ${TABLE_NAMES.MEMORIES} WHERE expires_at IS NOT NULL AND expires_at < ?`,
      [now]
    );
    return (result as unknown as { changes: number }).changes;
  }

  async applyDecay(): Promise<number> {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    // Apply decay to memories with decay rate
    const result = await this.db.execute(
      `UPDATE ${TABLE_NAMES.MEMORIES}
       SET score = score * (1 - COALESCE(decay_rate, 0) * (? - last_accessed_at) / ?)
       WHERE retention = 'decay' AND decay_rate > 0`,
      [now, dayMs]
    );

    // Delete memories with score below threshold
    await this.db.execute(
      `DELETE FROM ${TABLE_NAMES.MEMORIES} WHERE retention = 'decay' AND score < 0.1`
    );

    return (result as unknown as { changes: number }).changes;
  }

  private buildQuerySQL(options: MemoryQueryOptions, isCount = false): { sql: string; params: unknown[] } {
    const now = Date.now();
    let sql = isCount
      ? `SELECT COUNT(*) as count FROM ${TABLE_NAMES.MEMORIES}`
      : `SELECT * FROM ${TABLE_NAMES.MEMORIES}`;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }

    if (options.sessionId !== undefined) {
      conditions.push('session_id = ?');
      params.push(options.sessionId);
    }

    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }

    if (options.priority) {
      conditions.push('priority = ?');
      params.push(options.priority);
    }

    if (!options.includeExpired) {
      conditions.push('(expires_at IS NULL OR expires_at > ?)');
      params.push(now);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    if (!isCount) {
      sql += ' ORDER BY score DESC, last_accessed_at DESC';

      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
      }

      if (options.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    return { sql, params };
  }

  private rowToMemory(row: MemoryRow): Memory {
    const valueEncrypted: EncryptedData = JSON.parse(row.value_encrypted);
    const value = this.encryption.decrypt(valueEncrypted);

    let metadata: Record<string, unknown> | undefined;
    if (row.metadata_encrypted) {
      const metadataEncrypted: EncryptedData = JSON.parse(row.metadata_encrypted);
      metadata = JSON.parse(this.encryption.decrypt(metadataEncrypted));
    }

    return {
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id ?? undefined,
      type: row.type as MemoryType,
      key: row.key,
      value,
      metadata,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      priority: row.priority as MemoryPriority,
      retention: row.retention as Memory['retention'],
      ttlMs: row.ttl_ms ?? undefined,
      decayRate: row.decay_rate ?? undefined,
      score: row.score,
      accessCount: row.access_count,
      lastAccessedAt: row.last_accessed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at ?? undefined,
    };
  }
}

// =============================================================================
// In-Memory Store (for testing)
// =============================================================================

export class InMemoryMemoryStore implements MemoryStore {
  private memories = new Map<string, Memory>();
  private keyIndex = new Map<string, string>(); // "userId:key:sessionId" -> memoryId
  private encryption: MemoryEncryption;

  constructor(encryptionKey: string | Buffer = 'test-key') {
    this.encryption = new MemoryEncryption(encryptionKey);
  }

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async store(input: MemoryCreateInput): Promise<Memory> {
    const now = Date.now();
    const id = randomUUID();

    const priority = input.priority ?? MEMORY_DEFAULTS.DEFAULT_PRIORITY;
    const retention = input.retention ?? MEMORY_DEFAULTS.DEFAULT_RETENTION;

    let expiresAt: number | undefined;
    if (retention === 'ttl' && input.ttlMs) {
      expiresAt = now + input.ttlMs;
    } else if (retention === 'session') {
      expiresAt = now + MEMORY_DEFAULTS.SESSION_MEMORY_TTL_MS;
    }

    const memory: Memory = {
      id,
      userId: input.userId,
      sessionId: input.sessionId,
      type: input.type,
      key: input.key,
      value: input.value,
      metadata: input.metadata,
      embedding: input.embedding,
      priority,
      retention,
      ttlMs: input.ttlMs,
      decayRate: input.decayRate ?? MEMORY_DEFAULTS.DEFAULT_DECAY_RATE,
      score: PRIORITY_WEIGHTS[priority],
      accessCount: 0,
      lastAccessedAt: now,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    this.memories.set(id, memory);
    this.keyIndex.set(this.makeKeyIndex(input.userId, input.key, input.sessionId), id);

    return { ...memory };
  }

  async retrieve(id: string, userId: string): Promise<Memory | null> {
    const memory = this.memories.get(id);
    if (!memory || memory.userId !== userId) return null;

    const now = Date.now();
    if (memory.expiresAt && memory.expiresAt < now) return null;

    memory.accessCount++;
    memory.lastAccessedAt = now;

    return { ...memory };
  }

  async retrieveByKey(userId: string, key: string, sessionId?: string): Promise<Memory | null> {
    const id = this.keyIndex.get(this.makeKeyIndex(userId, key, sessionId));
    if (!id) return null;
    return this.retrieve(id, userId);
  }

  async search(
    userId: string,
    embedding: number[],
    options: MemorySearchOptions = {}
  ): Promise<MemorySearchResult[]> {
    const now = Date.now();
    const results: MemorySearchResult[] = [];
    const minSimilarity = options.minSimilarity ?? MEMORY_DEFAULTS.MIN_SIMILARITY_THRESHOLD;

    for (const memory of this.memories.values()) {
      if (memory.userId !== userId) continue;
      if (!memory.embedding) continue;
      if (options.type && memory.type !== options.type) continue;
      if (!options.includeExpired && memory.expiresAt && memory.expiresAt < now) continue;

      const similarity = cosineSimilarity(embedding, memory.embedding);
      if (similarity < minSimilarity) continue;

      const recencyBoost = 1 / (1 + (now - memory.lastAccessedAt) / (24 * 60 * 60 * 1000));
      const relevance = similarity * 0.6 + (memory.score / 10) * 0.3 + recencyBoost * 0.1;

      if (options.minRelevance && relevance < options.minRelevance) continue;

      results.push({ memory: { ...memory }, similarity, relevance });
    }

    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, options.limit ?? MEMORY_DEFAULTS.DEFAULT_SEARCH_LIMIT);
  }

  async update(id: string, userId: string, updates: MemoryUpdateInput): Promise<Memory | null> {
    const memory = this.memories.get(id);
    if (!memory || memory.userId !== userId) return null;

    const now = Date.now();
    Object.assign(memory, updates, { updatedAt: now });

    if (updates.retention === 'ttl' && updates.ttlMs) {
      memory.expiresAt = now + updates.ttlMs;
    } else if (updates.retention === 'session') {
      memory.expiresAt = now + MEMORY_DEFAULTS.SESSION_MEMORY_TTL_MS;
    } else if (updates.retention === 'permanent') {
      memory.expiresAt = undefined;
    }

    return { ...memory };
  }

  async forget(id: string, userId: string): Promise<boolean> {
    const memory = this.memories.get(id);
    if (!memory || memory.userId !== userId) return false;

    this.keyIndex.delete(this.makeKeyIndex(memory.userId, memory.key, memory.sessionId));
    this.memories.delete(id);
    return true;
  }

  async forgetAll(userId: string, sessionId?: string): Promise<number> {
    let count = 0;
    for (const [id, memory] of this.memories) {
      if (memory.userId !== userId) continue;
      if (sessionId !== undefined && memory.sessionId !== sessionId) continue;

      this.keyIndex.delete(this.makeKeyIndex(memory.userId, memory.key, memory.sessionId));
      this.memories.delete(id);
      count++;
    }
    return count;
  }

  async list(options: MemoryQueryOptions): Promise<Memory[]> {
    const now = Date.now();
    let memories = Array.from(this.memories.values());

    if (options.userId) {
      memories = memories.filter(m => m.userId === options.userId);
    }
    if (options.sessionId !== undefined) {
      memories = memories.filter(m => m.sessionId === options.sessionId);
    }
    if (options.type) {
      memories = memories.filter(m => m.type === options.type);
    }
    if (options.priority) {
      memories = memories.filter(m => m.priority === options.priority);
    }
    if (!options.includeExpired) {
      memories = memories.filter(m => !m.expiresAt || m.expiresAt > now);
    }

    memories.sort((a, b) => b.score - a.score || b.lastAccessedAt - a.lastAccessedAt);

    if (options.offset) {
      memories = memories.slice(options.offset);
    }
    if (options.limit) {
      memories = memories.slice(0, options.limit);
    }

    return memories.map(m => ({ ...m }));
  }

  async count(options: MemoryQueryOptions): Promise<number> {
    return (await this.list({ ...options, limit: undefined, offset: undefined })).length;
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [id, memory] of this.memories) {
      if (memory.expiresAt && memory.expiresAt < now) {
        this.keyIndex.delete(this.makeKeyIndex(memory.userId, memory.key, memory.sessionId));
        this.memories.delete(id);
        count++;
      }
    }
    return count;
  }

  async applyDecay(): Promise<number> {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    let count = 0;

    for (const [id, memory] of this.memories) {
      if (memory.retention !== 'decay' || !memory.decayRate) continue;

      const daysSinceAccess = (now - memory.lastAccessedAt) / dayMs;
      memory.score *= 1 - memory.decayRate * daysSinceAccess;
      count++;

      if (memory.score < 0.1) {
        this.keyIndex.delete(this.makeKeyIndex(memory.userId, memory.key, memory.sessionId));
        this.memories.delete(id);
      }
    }

    return count;
  }

  private makeKeyIndex(userId: string, key: string, sessionId?: string): string {
    return `${userId}:${key}:${sessionId ?? ''}`;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createMemoryStore(type: 'memory', encryptionKey?: string | Buffer): InMemoryMemoryStore;
export function createMemoryStore(type: 'database', db: DatabaseAdapter, encryptionKey: string | Buffer): DatabaseMemoryStore;
export function createMemoryStore(
  type: 'memory' | 'database',
  dbOrKey?: DatabaseAdapter | string | Buffer,
  encryptionKey?: string | Buffer
): MemoryStore {
  if (type === 'memory') {
    return new InMemoryMemoryStore(dbOrKey as string | Buffer);
  }
  if (!dbOrKey || typeof dbOrKey === 'string' || Buffer.isBuffer(dbOrKey)) {
    throw new MemoryError('VALIDATION_ERROR', 'Database adapter required for database store');
  }
  if (!encryptionKey) {
    throw new MemoryError('VALIDATION_ERROR', 'Encryption key required for database store');
  }
  return new DatabaseMemoryStore(dbOrKey, encryptionKey);
}
