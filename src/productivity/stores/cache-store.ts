/**
 * Cache Store
 *
 * API response caching with TTL support.
 */

import type { CacheEntry } from '../types.js';
import type { DatabaseAdapter } from './productivity-store.js';

/**
 * Interface for cache storage
 */
export interface CacheStore {
  initialize(): Promise<void>;

  /**
   * Get a cached value
   */
  get<T>(key: string): Promise<CacheEntry<T> | null>;

  /**
   * Set a cached value with TTL
   */
  set<T>(key: string, provider: string, data: T, ttlSeconds: number): Promise<void>;

  /**
   * Delete a cached value
   */
  delete(key: string): Promise<boolean>;

  /**
   * Clear all cached values for a provider
   */
  clearByProvider(provider: string): Promise<number>;

  /**
   * Clear expired entries
   */
  clearExpired(): Promise<number>;

  /**
   * Get cache statistics
   */
  getStats(): Promise<CacheStats>;
}

export interface CacheStats {
  totalEntries: number;
  expiredEntries: number;
  byProvider: Record<string, number>;
  oldestEntry: number | null;
  newestEntry: number | null;
}

/**
 * Database-backed cache store
 */
export class DatabaseCacheStore implements CacheStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS api_cache (
        cache_key TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        data TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_cache_provider ON api_cache(provider)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_cache_expires ON api_cache(expires_at)
    `);
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const now = Date.now();
    const result = await this.db.query<CacheRow>(
      'SELECT * FROM api_cache WHERE cache_key = ? AND expires_at > ?',
      [key, now]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      cacheKey: row.cache_key,
      provider: row.provider,
      data: JSON.parse(row.data) as T,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  async set<T>(key: string, provider: string, data: T, ttlSeconds: number): Promise<void> {
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;

    await this.db.execute(
      `INSERT OR REPLACE INTO api_cache (cache_key, provider, data, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [key, provider, JSON.stringify(data), expiresAt, now]
    );
  }

  async delete(key: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM api_cache WHERE cache_key = ?',
      [key]
    );
    return result.changes > 0;
  }

  async clearByProvider(provider: string): Promise<number> {
    const result = await this.db.execute(
      'DELETE FROM api_cache WHERE provider = ?',
      [provider]
    );
    return result.changes;
  }

  async clearExpired(): Promise<number> {
    const now = Date.now();
    const result = await this.db.execute(
      'DELETE FROM api_cache WHERE expires_at <= ?',
      [now]
    );
    return result.changes;
  }

  async getStats(): Promise<CacheStats> {
    const now = Date.now();

    const totalResult = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM api_cache'
    );

    const expiredResult = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM api_cache WHERE expires_at <= ?',
      [now]
    );

    const providerResult = await this.db.query<{ provider: string; count: number }>(
      'SELECT provider, COUNT(*) as count FROM api_cache GROUP BY provider'
    );

    const timesResult = await this.db.query<{ oldest: number; newest: number }>(
      'SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM api_cache'
    );

    const byProvider: Record<string, number> = {};
    for (const row of providerResult.rows) {
      byProvider[row.provider] = row.count;
    }

    return {
      totalEntries: totalResult.rows[0]?.count ?? 0,
      expiredEntries: expiredResult.rows[0]?.count ?? 0,
      byProvider,
      oldestEntry: timesResult.rows[0]?.oldest ?? null,
      newestEntry: timesResult.rows[0]?.newest ?? null,
    };
  }
}

/**
 * In-memory cache store for testing
 */
export class InMemoryCacheStore implements CacheStore {
  private cache = new Map<string, CacheEntry>();

  async initialize(): Promise<void> {
    // No-op
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry as CacheEntry<T>;
  }

  async set<T>(key: string, provider: string, data: T, ttlSeconds: number): Promise<void> {
    const now = Date.now();
    this.cache.set(key, {
      cacheKey: key,
      provider,
      data,
      expiresAt: now + ttlSeconds * 1000,
      createdAt: now,
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async clearByProvider(provider: string): Promise<number> {
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (entry.provider === provider) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  async clearExpired(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  async getStats(): Promise<CacheStats> {
    const now = Date.now();
    const byProvider: Record<string, number> = {};
    let expiredCount = 0;
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const entry of this.cache.values()) {
      if (entry.expiresAt <= now) {
        expiredCount++;
      }

      byProvider[entry.provider] = (byProvider[entry.provider] ?? 0) + 1;

      if (oldest === null || entry.createdAt < oldest) {
        oldest = entry.createdAt;
      }
      if (newest === null || entry.createdAt > newest) {
        newest = entry.createdAt;
      }
    }

    return {
      totalEntries: this.cache.size,
      expiredEntries: expiredCount,
      byProvider,
      oldestEntry: oldest,
      newestEntry: newest,
    };
  }
}

// =============================================================================
// Row Types
// =============================================================================

interface CacheRow {
  cache_key: string;
  provider: string;
  data: string;
  expires_at: number;
  created_at: number;
}

/**
 * Factory function to create cache stores
 */
export function createCacheStore(type: 'memory'): InMemoryCacheStore;
export function createCacheStore(type: 'database', db: DatabaseAdapter): DatabaseCacheStore;
export function createCacheStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): CacheStore {
  if (type === 'memory') {
    return new InMemoryCacheStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseCacheStore(db);
}
