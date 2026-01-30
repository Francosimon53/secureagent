/**
 * API Key Store
 *
 * Persistence layer for API key management
 */

import { randomUUID, randomBytes, createHash } from 'crypto';
import type { DatabaseAdapter } from './index.js';
import type { APIKey, APIKeyCreateInput, APIKeyWithSecret, APIKeyScope, APIKeyRateLimit } from '../types.js';

// =============================================================================
// API Key Store Interface
// =============================================================================

export interface APIKeyQueryOptions {
  /** Filter by user ID */
  userId?: string;
  /** Include revoked keys */
  includeRevoked?: boolean;
  /** Include expired keys */
  includeExpired?: boolean;
  /** Limit */
  limit?: number;
  /** Offset */
  offset?: number;
}

export interface APIKeyStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Create a new API key (returns key with secret) */
  createAPIKey(input: APIKeyCreateInput): Promise<APIKeyWithSecret>;

  /** Get API key by ID */
  getAPIKey(keyId: string): Promise<APIKey | null>;

  /** Get API key by hash (for authentication) */
  getAPIKeyByHash(keyHash: string): Promise<APIKey | null>;

  /** List API keys for a tenant */
  listAPIKeys(tenantId: string, options?: APIKeyQueryOptions): Promise<APIKey[]>;

  /** Count API keys for a tenant */
  countAPIKeys(tenantId: string, options?: APIKeyQueryOptions): Promise<number>;

  /** Revoke an API key */
  revokeAPIKey(keyId: string): Promise<boolean>;

  /** Update last used timestamp */
  updateLastUsed(keyId: string): Promise<void>;

  /** Delete an API key */
  deleteAPIKey(keyId: string): Promise<boolean>;

  /** Verify API key and return if valid */
  verifyAPIKey(rawKey: string): Promise<APIKey | null>;
}

// =============================================================================
// Database Row Type
// =============================================================================

interface APIKeyRow {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string;
  rate_limit: string | null;
  expires_at: number | null;
  last_used_at: number | null;
  created_at: number;
  revoked_at: number | null;
}

// =============================================================================
// Helpers
// =============================================================================

function generateAPIKey(prefix: string, length: number): string {
  const randomPart = randomBytes(length).toString('base64url');
  return `${prefix}${randomPart}`;
}

function hashAPIKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

function getKeyPrefix(rawKey: string, prefixLength: number): string {
  return rawKey.substring(0, prefixLength);
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseAPIKeyStore implements APIKeyStore {
  private keyPrefix: string;
  private keyLength: number;
  private prefixLength: number;

  constructor(
    private readonly db: DatabaseAdapter,
    options?: { keyPrefix?: string; keyLength?: number; prefixLength?: number }
  ) {
    this.keyPrefix = options?.keyPrefix ?? 'sk_';
    this.keyLength = options?.keyLength ?? 48;
    this.prefixLength = options?.prefixLength ?? 8;
  }

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        key_hash TEXT UNIQUE NOT NULL,
        scopes TEXT NOT NULL,
        rate_limit TEXT,
        expires_at INTEGER,
        last_used_at INTEGER,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(tenant_id, user_id)
    `);
  }

  async createAPIKey(input: APIKeyCreateInput): Promise<APIKeyWithSecret> {
    const rawKey = generateAPIKey(this.keyPrefix, this.keyLength);
    const keyHash = hashAPIKey(rawKey);
    const keyPrefix = getKeyPrefix(rawKey, this.prefixLength);
    const now = Date.now();

    const apiKey: APIKey = {
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      name: input.name,
      keyPrefix,
      keyHash,
      scopes: input.scopes,
      rateLimit: input.rateLimit,
      expiresAt: input.expiresAt,
      createdAt: now,
    };

    await this.db.execute(
      `INSERT INTO api_keys (
        id, tenant_id, user_id, name, key_prefix, key_hash, scopes,
        rate_limit, expires_at, last_used_at, created_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        apiKey.id,
        apiKey.tenantId,
        apiKey.userId,
        apiKey.name,
        apiKey.keyPrefix,
        apiKey.keyHash,
        JSON.stringify(apiKey.scopes),
        apiKey.rateLimit ? JSON.stringify(apiKey.rateLimit) : null,
        apiKey.expiresAt ?? null,
        null,
        apiKey.createdAt,
        null,
      ]
    );

    return { ...apiKey, rawKey, key: rawKey };
  }

  async getAPIKey(keyId: string): Promise<APIKey | null> {
    const result = await this.db.execute<APIKeyRow>(
      'SELECT * FROM api_keys WHERE id = ?',
      [keyId]
    );
    return result.length > 0 ? this.rowToAPIKey(result[0]) : null;
  }

  async getAPIKeyByHash(keyHash: string): Promise<APIKey | null> {
    const result = await this.db.execute<APIKeyRow>(
      'SELECT * FROM api_keys WHERE key_hash = ?',
      [keyHash]
    );
    return result.length > 0 ? this.rowToAPIKey(result[0]) : null;
  }

  async listAPIKeys(tenantId: string, options: APIKeyQueryOptions = {}): Promise<APIKey[]> {
    const { sql, params } = this.buildQuerySQL(tenantId, options);
    const result = await this.db.execute<APIKeyRow>(sql, params);
    return result.map(row => this.rowToAPIKey(row));
  }

  async countAPIKeys(tenantId: string, options: APIKeyQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildQuerySQL(tenantId, options, true);
    const result = await this.db.execute<{ count: number }>(sql, params);
    return result[0]?.count ?? 0;
  }

  async revokeAPIKey(keyId: string): Promise<boolean> {
    const existing = await this.getAPIKey(keyId);
    if (!existing || existing.revokedAt) return false;

    const now = Date.now();
    await this.db.execute(
      'UPDATE api_keys SET revoked_at = ? WHERE id = ?',
      [now, keyId]
    );

    return true;
  }

  async updateLastUsed(keyId: string): Promise<void> {
    await this.db.execute(
      'UPDATE api_keys SET last_used_at = ? WHERE id = ?',
      [Date.now(), keyId]
    );
  }

  async deleteAPIKey(keyId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM api_keys WHERE id = ?',
      [keyId]
    );
    return (result as any).changes > 0;
  }

  async verifyAPIKey(rawKey: string): Promise<APIKey | null> {
    const keyHash = hashAPIKey(rawKey);
    const apiKey = await this.getAPIKeyByHash(keyHash);

    if (!apiKey) return null;
    if (apiKey.revokedAt) return null;
    if (apiKey.expiresAt && apiKey.expiresAt < Date.now()) return null;

    // Update last used asynchronously
    this.updateLastUsed(apiKey.id).catch(() => {});

    return apiKey;
  }

  private buildQuerySQL(
    tenantId: string,
    options: APIKeyQueryOptions,
    isCount = false
  ): { sql: string; params: unknown[] } {
    let sql = isCount ? 'SELECT COUNT(*) as count FROM api_keys' : 'SELECT * FROM api_keys';
    const conditions: string[] = ['tenant_id = ?'];
    const params: unknown[] = [tenantId];

    if (options.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }

    if (!options.includeRevoked) {
      conditions.push('revoked_at IS NULL');
    }

    if (!options.includeExpired) {
      conditions.push('(expires_at IS NULL OR expires_at > ?)');
      params.push(Date.now());
    }

    sql += ' WHERE ' + conditions.join(' AND ');

    if (!isCount) {
      sql += ' ORDER BY created_at DESC';

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

  private rowToAPIKey(row: APIKeyRow): APIKey {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      name: row.name,
      keyPrefix: row.key_prefix,
      keyHash: row.key_hash,
      scopes: JSON.parse(row.scopes) as APIKeyScope[],
      rateLimit: row.rate_limit ? (JSON.parse(row.rate_limit) as APIKeyRateLimit) : undefined,
      expiresAt: row.expires_at ?? undefined,
      lastUsedAt: row.last_used_at ?? undefined,
      createdAt: row.created_at,
      revokedAt: row.revoked_at ?? undefined,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryAPIKeyStore implements APIKeyStore {
  private apiKeys = new Map<string, APIKey>();
  private hashIndex = new Map<string, string>(); // keyHash -> keyId
  private keyPrefix: string;
  private keyLength: number;
  private prefixLength: number;

  constructor(options?: { keyPrefix?: string; keyLength?: number; prefixLength?: number }) {
    this.keyPrefix = options?.keyPrefix ?? 'sk_';
    this.keyLength = options?.keyLength ?? 48;
    this.prefixLength = options?.prefixLength ?? 8;
  }

  async initialize(): Promise<void> {
    // No-op
  }

  async createAPIKey(input: APIKeyCreateInput): Promise<APIKeyWithSecret> {
    const rawKey = generateAPIKey(this.keyPrefix, this.keyLength);
    const keyHash = hashAPIKey(rawKey);
    const keyPrefix = getKeyPrefix(rawKey, this.prefixLength);
    const now = Date.now();

    const apiKey: APIKey = {
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      name: input.name,
      keyPrefix,
      keyHash,
      scopes: input.scopes,
      rateLimit: input.rateLimit,
      expiresAt: input.expiresAt,
      createdAt: now,
    };

    this.apiKeys.set(apiKey.id, apiKey);
    this.hashIndex.set(keyHash, apiKey.id);

    return { ...apiKey, rawKey, key: rawKey };
  }

  async getAPIKey(keyId: string): Promise<APIKey | null> {
    const apiKey = this.apiKeys.get(keyId);
    return apiKey ? { ...apiKey } : null;
  }

  async getAPIKeyByHash(keyHash: string): Promise<APIKey | null> {
    const keyId = this.hashIndex.get(keyHash);
    if (!keyId) return null;
    return this.getAPIKey(keyId);
  }

  async listAPIKeys(tenantId: string, options: APIKeyQueryOptions = {}): Promise<APIKey[]> {
    const now = Date.now();
    let keys = Array.from(this.apiKeys.values()).filter(k => k.tenantId === tenantId);

    if (options.userId) {
      keys = keys.filter(k => k.userId === options.userId);
    }

    if (!options.includeRevoked) {
      keys = keys.filter(k => !k.revokedAt);
    }

    if (!options.includeExpired) {
      keys = keys.filter(k => !k.expiresAt || k.expiresAt > now);
    }

    keys.sort((a, b) => b.createdAt - a.createdAt);

    if (options.offset) {
      keys = keys.slice(options.offset);
    }
    if (options.limit) {
      keys = keys.slice(0, options.limit);
    }

    return keys.map(k => ({ ...k }));
  }

  async countAPIKeys(tenantId: string, options: APIKeyQueryOptions = {}): Promise<number> {
    const now = Date.now();
    let keys = Array.from(this.apiKeys.values()).filter(k => k.tenantId === tenantId);

    if (options.userId) {
      keys = keys.filter(k => k.userId === options.userId);
    }

    if (!options.includeRevoked) {
      keys = keys.filter(k => !k.revokedAt);
    }

    if (!options.includeExpired) {
      keys = keys.filter(k => !k.expiresAt || k.expiresAt > now);
    }

    return keys.length;
  }

  async revokeAPIKey(keyId: string): Promise<boolean> {
    const existing = this.apiKeys.get(keyId);
    if (!existing || existing.revokedAt) return false;

    const updated = { ...existing, revokedAt: Date.now() };
    this.apiKeys.set(keyId, updated);

    return true;
  }

  async updateLastUsed(keyId: string): Promise<void> {
    const existing = this.apiKeys.get(keyId);
    if (existing) {
      existing.lastUsedAt = Date.now();
    }
  }

  async deleteAPIKey(keyId: string): Promise<boolean> {
    const apiKey = this.apiKeys.get(keyId);
    if (!apiKey) return false;

    this.hashIndex.delete(apiKey.keyHash);
    this.apiKeys.delete(keyId);

    return true;
  }

  async verifyAPIKey(rawKey: string): Promise<APIKey | null> {
    const keyHash = hashAPIKey(rawKey);
    const apiKey = await this.getAPIKeyByHash(keyHash);

    if (!apiKey) return null;
    if (apiKey.revokedAt) return null;
    if (apiKey.expiresAt && apiKey.expiresAt < Date.now()) return null;

    // Update last used
    await this.updateLastUsed(apiKey.id);

    return apiKey;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createAPIKeyStore(type: 'memory', options?: { keyPrefix?: string; keyLength?: number; prefixLength?: number }): InMemoryAPIKeyStore;
export function createAPIKeyStore(type: 'database', db: DatabaseAdapter, options?: { keyPrefix?: string; keyLength?: number; prefixLength?: number }): DatabaseAPIKeyStore;
export function createAPIKeyStore(
  type: 'memory' | 'database',
  dbOrOptions?: DatabaseAdapter | { keyPrefix?: string; keyLength?: number; prefixLength?: number },
  options?: { keyPrefix?: string; keyLength?: number; prefixLength?: number }
): APIKeyStore {
  if (type === 'memory') {
    return new InMemoryAPIKeyStore(dbOrOptions as { keyPrefix?: string; keyLength?: number; prefixLength?: number });
  }
  if (!dbOrOptions || !('execute' in dbOrOptions)) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseAPIKeyStore(dbOrOptions as DatabaseAdapter, options);
}
