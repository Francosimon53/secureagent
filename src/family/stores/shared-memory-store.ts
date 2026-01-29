/**
 * Shared Memory Store
 *
 * Persistence layer for cross-user memory sharing within families.
 */

import { randomUUID } from 'crypto';
import type {
  ConsentScope,
  DatabaseAdapter,
  EncryptedContent,
  MemoryShareConsent,
  MemorySharingSettings,
  SharedMemory,
  SharedMemoryQueryOptions,
  SharedMemoryType,
  SharedMemoryWithEncryption,
} from '../types.js';

// ============================================================================
// Shared Memory Store Interface
// ============================================================================

export interface SharedMemoryStore {
  initialize(): Promise<void>;

  // CRUD
  createMemory(memory: Omit<SharedMemoryWithEncryption, 'id' | 'createdAt' | 'updatedAt'>): Promise<SharedMemoryWithEncryption>;
  getMemory(id: string): Promise<SharedMemoryWithEncryption | null>;
  updateMemory(id: string, updates: Partial<Omit<SharedMemoryWithEncryption, 'id' | 'createdAt'>>): Promise<SharedMemoryWithEncryption | null>;
  deleteMemory(id: string): Promise<boolean>;

  // Query
  listMemories(options: SharedMemoryQueryOptions): Promise<SharedMemoryWithEncryption[]>;
  getMemoriesSharedWithUser(userId: string, familyGroupId: string): Promise<SharedMemoryWithEncryption[]>;
  getMemoriesByOriginalUser(originalUserId: string, familyGroupId: string): Promise<SharedMemoryWithEncryption[]>;
  getByOriginalMemoryId(originalMemoryId: string): Promise<SharedMemoryWithEncryption | null>;

  // Sharing
  addSharedWith(id: string, userId: string): Promise<SharedMemoryWithEncryption | null>;
  removeSharedWith(id: string, userId: string): Promise<SharedMemoryWithEncryption | null>;

  // Cleanup
  deleteExpired(): Promise<number>;
  deleteByOriginalUser(originalUserId: string): Promise<number>;
}

// ============================================================================
// Memory Sharing Settings Store Interface
// ============================================================================

export interface MemorySharingSettingsStore {
  initialize(): Promise<void>;

  // CRUD
  createSettings(settings: Omit<MemorySharingSettings, 'createdAt' | 'updatedAt'>): Promise<MemorySharingSettings>;
  getSettings(userId: string, familyGroupId: string): Promise<MemorySharingSettings | null>;
  updateSettings(userId: string, familyGroupId: string, updates: Partial<Omit<MemorySharingSettings, 'userId' | 'familyGroupId' | 'createdAt'>>): Promise<MemorySharingSettings | null>;
  deleteSettings(userId: string, familyGroupId: string): Promise<boolean>;

  // Query
  listSettingsByFamily(familyGroupId: string): Promise<MemorySharingSettings[]>;
  listSettingsByUser(userId: string): Promise<MemorySharingSettings[]>;
}

// ============================================================================
// Memory Consent Store Interface
// ============================================================================

export interface MemoryConsentStore {
  initialize(): Promise<void>;

  // CRUD
  grantConsent(consent: Omit<MemoryShareConsent, 'grantedAt'>): Promise<MemoryShareConsent>;
  getConsent(fromUserId: string, toUserId: string, familyGroupId: string): Promise<MemoryShareConsent | null>;
  revokeConsent(fromUserId: string, toUserId: string, familyGroupId: string): Promise<boolean>;

  // Query
  listConsentsFrom(fromUserId: string, familyGroupId: string): Promise<MemoryShareConsent[]>;
  listConsentsTo(toUserId: string, familyGroupId: string): Promise<MemoryShareConsent[]>;
  hasConsent(fromUserId: string, toUserId: string, familyGroupId: string, category?: string): Promise<boolean>;

  // Cleanup
  deleteExpired(): Promise<number>;
}

// ============================================================================
// Database Row Types
// ============================================================================

interface SharedMemoryRow {
  id: string;
  family_group_id: string;
  original_memory_id: string;
  original_user_id: string;
  shared_with: string;
  content_ciphertext: string;
  content_iv: string;
  content_tag: string;
  type: string;
  category: string | null;
  importance: number;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
}

interface SettingsRow {
  user_id: string;
  family_group_id: string;
  auto_share_categories: string | null;
  require_approval: number;
  share_with_children: number;
  encryption_key_id: string;
  created_at: number;
  updated_at: number;
}

interface ConsentRow {
  from_user_id: string;
  to_user_id: string;
  family_group_id: string;
  scope: string;
  categories: string | null;
  granted_at: number;
  expires_at: number | null;
}

// ============================================================================
// Database Shared Memory Store
// ============================================================================

export class DatabaseSharedMemoryStore implements SharedMemoryStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS shared_memories (
        id TEXT PRIMARY KEY,
        family_group_id TEXT NOT NULL,
        original_memory_id TEXT NOT NULL,
        original_user_id TEXT NOT NULL,
        shared_with TEXT NOT NULL,
        content_ciphertext TEXT NOT NULL,
        content_iv TEXT NOT NULL,
        content_tag TEXT NOT NULL,
        type TEXT NOT NULL,
        category TEXT,
        importance REAL DEFAULT 0.5,
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_shared_memories_family ON shared_memories(family_group_id)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_shared_memories_original ON shared_memories(original_user_id, original_memory_id)
    `);
  }

  async createMemory(memory: Omit<SharedMemoryWithEncryption, 'id' | 'createdAt' | 'updatedAt'>): Promise<SharedMemoryWithEncryption> {
    const now = Date.now();
    const id = randomUUID();

    const newMemory: SharedMemoryWithEncryption = {
      ...memory,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO shared_memories (
        id, family_group_id, original_memory_id, original_user_id, shared_with,
        content_ciphertext, content_iv, content_tag, type, category, importance,
        expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newMemory.id,
        newMemory.familyGroupId,
        newMemory.originalMemoryId,
        newMemory.originalUserId,
        JSON.stringify(newMemory.sharedWith),
        newMemory.contentCiphertext,
        newMemory.contentIv,
        newMemory.contentTag,
        newMemory.type,
        newMemory.category ?? null,
        newMemory.importance,
        newMemory.expiresAt ?? null,
        newMemory.createdAt,
        newMemory.updatedAt,
      ]
    );

    return newMemory;
  }

  async getMemory(id: string): Promise<SharedMemoryWithEncryption | null> {
    const { rows } = await this.db.query<SharedMemoryRow>(
      'SELECT * FROM shared_memories WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.rowToMemory(rows[0]);
  }

  async updateMemory(id: string, updates: Partial<Omit<SharedMemoryWithEncryption, 'id' | 'createdAt'>>): Promise<SharedMemoryWithEncryption | null> {
    const existing = await this.getMemory(id);
    if (!existing) return null;

    const updated: SharedMemoryWithEncryption = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `UPDATE shared_memories SET
        shared_with = ?, content_ciphertext = ?, content_iv = ?, content_tag = ?,
        type = ?, category = ?, importance = ?, expires_at = ?, updated_at = ?
      WHERE id = ?`,
      [
        JSON.stringify(updated.sharedWith),
        updated.contentCiphertext,
        updated.contentIv,
        updated.contentTag,
        updated.type,
        updated.category ?? null,
        updated.importance,
        updated.expiresAt ?? null,
        updated.updatedAt,
        id,
      ]
    );

    return updated;
  }

  async deleteMemory(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM shared_memories WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async listMemories(options: SharedMemoryQueryOptions): Promise<SharedMemoryWithEncryption[]> {
    let sql = 'SELECT * FROM shared_memories WHERE family_group_id = ?';
    const params: unknown[] = [options.familyGroupId];

    if (options.userId) {
      sql += ' AND (original_user_id = ? OR shared_with LIKE ?)';
      params.push(options.userId, `%"${options.userId}"%`);
    }

    if (options.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }

    if (options.category) {
      sql += ' AND category = ?';
      params.push(options.category);
    }

    sql += ' ORDER BY importance DESC, created_at DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const { rows } = await this.db.query<SharedMemoryRow>(sql, params);
    return rows.map(row => this.rowToMemory(row));
  }

  async getMemoriesSharedWithUser(userId: string, familyGroupId: string): Promise<SharedMemoryWithEncryption[]> {
    const { rows } = await this.db.query<SharedMemoryRow>(
      `SELECT * FROM shared_memories WHERE family_group_id = ? AND shared_with LIKE ? ORDER BY importance DESC`,
      [familyGroupId, `%"${userId}"%`]
    );

    return rows.map(row => this.rowToMemory(row));
  }

  async getMemoriesByOriginalUser(originalUserId: string, familyGroupId: string): Promise<SharedMemoryWithEncryption[]> {
    const { rows } = await this.db.query<SharedMemoryRow>(
      `SELECT * FROM shared_memories WHERE family_group_id = ? AND original_user_id = ? ORDER BY created_at DESC`,
      [familyGroupId, originalUserId]
    );

    return rows.map(row => this.rowToMemory(row));
  }

  async getByOriginalMemoryId(originalMemoryId: string): Promise<SharedMemoryWithEncryption | null> {
    const { rows } = await this.db.query<SharedMemoryRow>(
      'SELECT * FROM shared_memories WHERE original_memory_id = ?',
      [originalMemoryId]
    );

    if (rows.length === 0) return null;
    return this.rowToMemory(rows[0]);
  }

  async addSharedWith(id: string, userId: string): Promise<SharedMemoryWithEncryption | null> {
    const memory = await this.getMemory(id);
    if (!memory) return null;

    if (!memory.sharedWith.includes(userId)) {
      memory.sharedWith.push(userId);
      return this.updateMemory(id, { sharedWith: memory.sharedWith });
    }

    return memory;
  }

  async removeSharedWith(id: string, userId: string): Promise<SharedMemoryWithEncryption | null> {
    const memory = await this.getMemory(id);
    if (!memory) return null;

    memory.sharedWith = memory.sharedWith.filter(u => u !== userId);
    return this.updateMemory(id, { sharedWith: memory.sharedWith });
  }

  async deleteExpired(): Promise<number> {
    const now = Date.now();
    const result = await this.db.execute(
      'DELETE FROM shared_memories WHERE expires_at IS NOT NULL AND expires_at < ?',
      [now]
    );
    return result.changes;
  }

  async deleteByOriginalUser(originalUserId: string): Promise<number> {
    const result = await this.db.execute(
      'DELETE FROM shared_memories WHERE original_user_id = ?',
      [originalUserId]
    );
    return result.changes;
  }

  private rowToMemory(row: SharedMemoryRow): SharedMemoryWithEncryption {
    return {
      id: row.id,
      familyGroupId: row.family_group_id,
      originalMemoryId: row.original_memory_id,
      originalUserId: row.original_user_id,
      sharedWith: JSON.parse(row.shared_with) as string[],
      contentCiphertext: row.content_ciphertext,
      contentIv: row.content_iv,
      contentTag: row.content_tag,
      type: row.type as SharedMemoryType,
      category: row.category ?? undefined,
      importance: row.importance,
      expiresAt: row.expires_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ============================================================================
// Database Memory Sharing Settings Store
// ============================================================================

export class DatabaseMemorySharingSettingsStore implements MemorySharingSettingsStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS memory_sharing_settings (
        user_id TEXT NOT NULL,
        family_group_id TEXT NOT NULL,
        auto_share_categories TEXT,
        require_approval INTEGER DEFAULT 1,
        share_with_children INTEGER DEFAULT 0,
        encryption_key_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, family_group_id)
      )
    `);
  }

  async createSettings(settings: Omit<MemorySharingSettings, 'createdAt' | 'updatedAt'>): Promise<MemorySharingSettings> {
    const now = Date.now();

    const newSettings: MemorySharingSettings = {
      ...settings,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO memory_sharing_settings (
        user_id, family_group_id, auto_share_categories, require_approval,
        share_with_children, encryption_key_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newSettings.userId,
        newSettings.familyGroupId,
        newSettings.autoShareCategories ? JSON.stringify(newSettings.autoShareCategories) : null,
        newSettings.requireApproval ? 1 : 0,
        newSettings.shareWithChildren ? 1 : 0,
        newSettings.encryptionKeyId,
        newSettings.createdAt,
        newSettings.updatedAt,
      ]
    );

    return newSettings;
  }

  async getSettings(userId: string, familyGroupId: string): Promise<MemorySharingSettings | null> {
    const { rows } = await this.db.query<SettingsRow>(
      'SELECT * FROM memory_sharing_settings WHERE user_id = ? AND family_group_id = ?',
      [userId, familyGroupId]
    );

    if (rows.length === 0) return null;
    return this.rowToSettings(rows[0]);
  }

  async updateSettings(userId: string, familyGroupId: string, updates: Partial<Omit<MemorySharingSettings, 'userId' | 'familyGroupId' | 'createdAt'>>): Promise<MemorySharingSettings | null> {
    const existing = await this.getSettings(userId, familyGroupId);
    if (!existing) return null;

    const updated: MemorySharingSettings = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `UPDATE memory_sharing_settings SET
        auto_share_categories = ?, require_approval = ?, share_with_children = ?,
        encryption_key_id = ?, updated_at = ?
      WHERE user_id = ? AND family_group_id = ?`,
      [
        updated.autoShareCategories ? JSON.stringify(updated.autoShareCategories) : null,
        updated.requireApproval ? 1 : 0,
        updated.shareWithChildren ? 1 : 0,
        updated.encryptionKeyId,
        updated.updatedAt,
        userId,
        familyGroupId,
      ]
    );

    return updated;
  }

  async deleteSettings(userId: string, familyGroupId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM memory_sharing_settings WHERE user_id = ? AND family_group_id = ?',
      [userId, familyGroupId]
    );
    return result.changes > 0;
  }

  async listSettingsByFamily(familyGroupId: string): Promise<MemorySharingSettings[]> {
    const { rows } = await this.db.query<SettingsRow>(
      'SELECT * FROM memory_sharing_settings WHERE family_group_id = ?',
      [familyGroupId]
    );
    return rows.map(row => this.rowToSettings(row));
  }

  async listSettingsByUser(userId: string): Promise<MemorySharingSettings[]> {
    const { rows } = await this.db.query<SettingsRow>(
      'SELECT * FROM memory_sharing_settings WHERE user_id = ?',
      [userId]
    );
    return rows.map(row => this.rowToSettings(row));
  }

  private rowToSettings(row: SettingsRow): MemorySharingSettings {
    return {
      userId: row.user_id,
      familyGroupId: row.family_group_id,
      autoShareCategories: row.auto_share_categories
        ? (JSON.parse(row.auto_share_categories) as string[])
        : undefined,
      requireApproval: row.require_approval === 1,
      shareWithChildren: row.share_with_children === 1,
      encryptionKeyId: row.encryption_key_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ============================================================================
// Database Memory Consent Store
// ============================================================================

export class DatabaseMemoryConsentStore implements MemoryConsentStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS memory_share_consents (
        from_user_id TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        family_group_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        categories TEXT,
        granted_at INTEGER NOT NULL,
        expires_at INTEGER,
        PRIMARY KEY (from_user_id, to_user_id, family_group_id)
      )
    `);
  }

  async grantConsent(consent: Omit<MemoryShareConsent, 'grantedAt'>): Promise<MemoryShareConsent> {
    const now = Date.now();

    const newConsent: MemoryShareConsent = {
      ...consent,
      grantedAt: now,
    };

    await this.db.execute(
      `INSERT OR REPLACE INTO memory_share_consents (
        from_user_id, to_user_id, family_group_id, scope, categories, granted_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        newConsent.fromUserId,
        newConsent.toUserId,
        newConsent.familyGroupId,
        newConsent.scope,
        newConsent.categories ? JSON.stringify(newConsent.categories) : null,
        newConsent.grantedAt,
        newConsent.expiresAt ?? null,
      ]
    );

    return newConsent;
  }

  async getConsent(fromUserId: string, toUserId: string, familyGroupId: string): Promise<MemoryShareConsent | null> {
    const { rows } = await this.db.query<ConsentRow>(
      `SELECT * FROM memory_share_consents
       WHERE from_user_id = ? AND to_user_id = ? AND family_group_id = ?`,
      [fromUserId, toUserId, familyGroupId]
    );

    if (rows.length === 0) return null;
    return this.rowToConsent(rows[0]);
  }

  async revokeConsent(fromUserId: string, toUserId: string, familyGroupId: string): Promise<boolean> {
    const result = await this.db.execute(
      `DELETE FROM memory_share_consents
       WHERE from_user_id = ? AND to_user_id = ? AND family_group_id = ?`,
      [fromUserId, toUserId, familyGroupId]
    );
    return result.changes > 0;
  }

  async listConsentsFrom(fromUserId: string, familyGroupId: string): Promise<MemoryShareConsent[]> {
    const { rows } = await this.db.query<ConsentRow>(
      `SELECT * FROM memory_share_consents WHERE from_user_id = ? AND family_group_id = ?`,
      [fromUserId, familyGroupId]
    );
    return rows.map(row => this.rowToConsent(row));
  }

  async listConsentsTo(toUserId: string, familyGroupId: string): Promise<MemoryShareConsent[]> {
    const { rows } = await this.db.query<ConsentRow>(
      `SELECT * FROM memory_share_consents WHERE to_user_id = ? AND family_group_id = ?`,
      [toUserId, familyGroupId]
    );
    return rows.map(row => this.rowToConsent(row));
  }

  async hasConsent(fromUserId: string, toUserId: string, familyGroupId: string, category?: string): Promise<boolean> {
    const consent = await this.getConsent(fromUserId, toUserId, familyGroupId);
    if (!consent) return false;

    // Check if expired
    if (consent.expiresAt && consent.expiresAt < Date.now()) return false;

    // Check scope
    if (consent.scope === 'all') return true;
    if (consent.scope === 'category' && category && consent.categories?.includes(category)) return true;

    return false;
  }

  async deleteExpired(): Promise<number> {
    const now = Date.now();
    const result = await this.db.execute(
      'DELETE FROM memory_share_consents WHERE expires_at IS NOT NULL AND expires_at < ?',
      [now]
    );
    return result.changes;
  }

  private rowToConsent(row: ConsentRow): MemoryShareConsent {
    return {
      fromUserId: row.from_user_id,
      toUserId: row.to_user_id,
      familyGroupId: row.family_group_id,
      scope: row.scope as ConsentScope,
      categories: row.categories ? (JSON.parse(row.categories) as string[]) : undefined,
      grantedAt: row.granted_at,
      expiresAt: row.expires_at ?? undefined,
    };
  }
}

// ============================================================================
// In-Memory Implementations
// ============================================================================

export class InMemorySharedMemoryStore implements SharedMemoryStore {
  private memories = new Map<string, SharedMemoryWithEncryption>();

  async initialize(): Promise<void> {}

  async createMemory(memory: Omit<SharedMemoryWithEncryption, 'id' | 'createdAt' | 'updatedAt'>): Promise<SharedMemoryWithEncryption> {
    const now = Date.now();
    const id = randomUUID();

    const newMemory: SharedMemoryWithEncryption = {
      ...memory,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.memories.set(id, newMemory);
    return newMemory;
  }

  async getMemory(id: string): Promise<SharedMemoryWithEncryption | null> {
    return this.memories.get(id) ?? null;
  }

  async updateMemory(id: string, updates: Partial<Omit<SharedMemoryWithEncryption, 'id' | 'createdAt'>>): Promise<SharedMemoryWithEncryption | null> {
    const existing = this.memories.get(id);
    if (!existing) return null;

    const updated: SharedMemoryWithEncryption = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.memories.set(id, updated);
    return updated;
  }

  async deleteMemory(id: string): Promise<boolean> {
    return this.memories.delete(id);
  }

  async listMemories(options: SharedMemoryQueryOptions): Promise<SharedMemoryWithEncryption[]> {
    let memories = Array.from(this.memories.values())
      .filter(m => m.familyGroupId === options.familyGroupId);

    if (options.userId) {
      memories = memories.filter(m =>
        m.originalUserId === options.userId || m.sharedWith.includes(options.userId!)
      );
    }

    if (options.type) {
      memories = memories.filter(m => m.type === options.type);
    }

    if (options.category) {
      memories = memories.filter(m => m.category === options.category);
    }

    memories.sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt);

    if (options.offset) {
      memories = memories.slice(options.offset);
    }
    if (options.limit) {
      memories = memories.slice(0, options.limit);
    }

    return memories;
  }

  async getMemoriesSharedWithUser(userId: string, familyGroupId: string): Promise<SharedMemoryWithEncryption[]> {
    return Array.from(this.memories.values())
      .filter(m => m.familyGroupId === familyGroupId && m.sharedWith.includes(userId))
      .sort((a, b) => b.importance - a.importance);
  }

  async getMemoriesByOriginalUser(originalUserId: string, familyGroupId: string): Promise<SharedMemoryWithEncryption[]> {
    return Array.from(this.memories.values())
      .filter(m => m.familyGroupId === familyGroupId && m.originalUserId === originalUserId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getByOriginalMemoryId(originalMemoryId: string): Promise<SharedMemoryWithEncryption | null> {
    return Array.from(this.memories.values()).find(m => m.originalMemoryId === originalMemoryId) ?? null;
  }

  async addSharedWith(id: string, userId: string): Promise<SharedMemoryWithEncryption | null> {
    const memory = this.memories.get(id);
    if (!memory) return null;

    if (!memory.sharedWith.includes(userId)) {
      memory.sharedWith.push(userId);
      memory.updatedAt = Date.now();
    }

    return memory;
  }

  async removeSharedWith(id: string, userId: string): Promise<SharedMemoryWithEncryption | null> {
    const memory = this.memories.get(id);
    if (!memory) return null;

    memory.sharedWith = memory.sharedWith.filter(u => u !== userId);
    memory.updatedAt = Date.now();

    return memory;
  }

  async deleteExpired(): Promise<number> {
    const now = Date.now();
    let count = 0;

    for (const [id, memory] of this.memories) {
      if (memory.expiresAt && memory.expiresAt < now) {
        this.memories.delete(id);
        count++;
      }
    }

    return count;
  }

  async deleteByOriginalUser(originalUserId: string): Promise<number> {
    let count = 0;

    for (const [id, memory] of this.memories) {
      if (memory.originalUserId === originalUserId) {
        this.memories.delete(id);
        count++;
      }
    }

    return count;
  }
}

export class InMemoryMemorySharingSettingsStore implements MemorySharingSettingsStore {
  private settings = new Map<string, MemorySharingSettings>();

  private getKey(userId: string, familyGroupId: string): string {
    return `${userId}:${familyGroupId}`;
  }

  async initialize(): Promise<void> {}

  async createSettings(settings: Omit<MemorySharingSettings, 'createdAt' | 'updatedAt'>): Promise<MemorySharingSettings> {
    const now = Date.now();

    const newSettings: MemorySharingSettings = {
      ...settings,
      createdAt: now,
      updatedAt: now,
    };

    this.settings.set(this.getKey(settings.userId, settings.familyGroupId), newSettings);
    return newSettings;
  }

  async getSettings(userId: string, familyGroupId: string): Promise<MemorySharingSettings | null> {
    return this.settings.get(this.getKey(userId, familyGroupId)) ?? null;
  }

  async updateSettings(userId: string, familyGroupId: string, updates: Partial<Omit<MemorySharingSettings, 'userId' | 'familyGroupId' | 'createdAt'>>): Promise<MemorySharingSettings | null> {
    const key = this.getKey(userId, familyGroupId);
    const existing = this.settings.get(key);
    if (!existing) return null;

    const updated: MemorySharingSettings = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.settings.set(key, updated);
    return updated;
  }

  async deleteSettings(userId: string, familyGroupId: string): Promise<boolean> {
    return this.settings.delete(this.getKey(userId, familyGroupId));
  }

  async listSettingsByFamily(familyGroupId: string): Promise<MemorySharingSettings[]> {
    return Array.from(this.settings.values()).filter(s => s.familyGroupId === familyGroupId);
  }

  async listSettingsByUser(userId: string): Promise<MemorySharingSettings[]> {
    return Array.from(this.settings.values()).filter(s => s.userId === userId);
  }
}

export class InMemoryMemoryConsentStore implements MemoryConsentStore {
  private consents = new Map<string, MemoryShareConsent>();

  private getKey(fromUserId: string, toUserId: string, familyGroupId: string): string {
    return `${fromUserId}:${toUserId}:${familyGroupId}`;
  }

  async initialize(): Promise<void> {}

  async grantConsent(consent: Omit<MemoryShareConsent, 'grantedAt'>): Promise<MemoryShareConsent> {
    const newConsent: MemoryShareConsent = {
      ...consent,
      grantedAt: Date.now(),
    };

    this.consents.set(
      this.getKey(consent.fromUserId, consent.toUserId, consent.familyGroupId),
      newConsent
    );

    return newConsent;
  }

  async getConsent(fromUserId: string, toUserId: string, familyGroupId: string): Promise<MemoryShareConsent | null> {
    return this.consents.get(this.getKey(fromUserId, toUserId, familyGroupId)) ?? null;
  }

  async revokeConsent(fromUserId: string, toUserId: string, familyGroupId: string): Promise<boolean> {
    return this.consents.delete(this.getKey(fromUserId, toUserId, familyGroupId));
  }

  async listConsentsFrom(fromUserId: string, familyGroupId: string): Promise<MemoryShareConsent[]> {
    return Array.from(this.consents.values()).filter(
      c => c.fromUserId === fromUserId && c.familyGroupId === familyGroupId
    );
  }

  async listConsentsTo(toUserId: string, familyGroupId: string): Promise<MemoryShareConsent[]> {
    return Array.from(this.consents.values()).filter(
      c => c.toUserId === toUserId && c.familyGroupId === familyGroupId
    );
  }

  async hasConsent(fromUserId: string, toUserId: string, familyGroupId: string, category?: string): Promise<boolean> {
    const consent = await this.getConsent(fromUserId, toUserId, familyGroupId);
    if (!consent) return false;

    if (consent.expiresAt && consent.expiresAt < Date.now()) return false;

    if (consent.scope === 'all') return true;
    if (consent.scope === 'category' && category && consent.categories?.includes(category)) return true;

    return false;
  }

  async deleteExpired(): Promise<number> {
    const now = Date.now();
    let count = 0;

    for (const [key, consent] of this.consents) {
      if (consent.expiresAt && consent.expiresAt < now) {
        this.consents.delete(key);
        count++;
      }
    }

    return count;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createSharedMemoryStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): SharedMemoryStore {
  if (type === 'database' && dbAdapter) {
    return new DatabaseSharedMemoryStore(dbAdapter);
  }
  return new InMemorySharedMemoryStore();
}

export function createMemorySharingSettingsStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): MemorySharingSettingsStore {
  if (type === 'database' && dbAdapter) {
    return new DatabaseMemorySharingSettingsStore(dbAdapter);
  }
  return new InMemoryMemorySharingSettingsStore();
}

export function createMemoryConsentStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): MemoryConsentStore {
  if (type === 'database' && dbAdapter) {
    return new DatabaseMemoryConsentStore(dbAdapter);
  }
  return new InMemoryMemoryConsentStore();
}
