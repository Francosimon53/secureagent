/**
 * Tenant Store
 *
 * Persistence layer for tenant/organization data
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from './index.js';
import type {
  Tenant,
  TenantCreateInput,
  TenantUpdateInput,
  TenantStatus,
  SubscriptionTier,
} from '../types.js';

// =============================================================================
// Tenant Store Interface
// =============================================================================

/** Query options for listing tenants */
export interface TenantQueryOptions {
  /** Filter by status */
  status?: TenantStatus;
  /** Filter by tier */
  tier?: SubscriptionTier;
  /** Filter by owner ID */
  ownerId?: string;
  /** Search by name or slug */
  search?: string;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

export interface TenantStore {
  /** Initialize the store (create tables, etc.) */
  initialize(): Promise<void>;

  /** Create a new tenant */
  createTenant(input: TenantCreateInput): Promise<Tenant>;

  /** Get tenant by ID */
  getTenant(tenantId: string): Promise<Tenant | null>;

  /** Get tenant by slug */
  getTenantBySlug(slug: string): Promise<Tenant | null>;

  /** Get tenant by Stripe customer ID */
  getTenantByStripeCustomerId(stripeCustomerId: string): Promise<Tenant | null>;

  /** Update tenant */
  updateTenant(tenantId: string, updates: TenantUpdateInput): Promise<Tenant | null>;

  /** Delete tenant */
  deleteTenant(tenantId: string): Promise<boolean>;

  /** List tenants */
  listTenants(options?: TenantQueryOptions): Promise<Tenant[]>;

  /** Count tenants */
  countTenants(options?: TenantQueryOptions): Promise<number>;

  /** Check if slug is available */
  isSlugAvailable(slug: string, excludeTenantId?: string): Promise<boolean>;
}

// =============================================================================
// Database Row Type
// =============================================================================

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  tier: string;
  status: string;
  settings: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: number | null;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseTenantStore implements TenantStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        owner_id TEXT NOT NULL,
        tier TEXT NOT NULL DEFAULT 'free',
        status TEXT NOT NULL DEFAULT 'pending',
        settings TEXT NOT NULL,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        trial_ends_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Create indexes
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tenants_owner_id ON tenants(owner_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer_id ON tenants(stripe_customer_id)
    `);
  }

  async createTenant(input: TenantCreateInput): Promise<Tenant> {
    const now = Date.now();
    const { id: providedId, ...rest } = input;
    const tenant: Tenant = {
      id: providedId ?? randomUUID(),
      ...rest,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO tenants (
        id, name, slug, owner_id, tier, status, settings,
        stripe_customer_id, stripe_subscription_id, trial_ends_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenant.id,
        tenant.name,
        tenant.slug,
        tenant.ownerId,
        tenant.tier,
        tenant.status,
        JSON.stringify(tenant.settings),
        tenant.stripeCustomerId ?? null,
        tenant.stripeSubscriptionId ?? null,
        tenant.trialEndsAt ?? null,
        tenant.createdAt,
        tenant.updatedAt,
      ]
    );

    return tenant;
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    const result = await this.db.execute<TenantRow>(
      'SELECT * FROM tenants WHERE id = ?',
      [tenantId]
    );
    return result.length > 0 ? this.rowToTenant(result[0]) : null;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    const result = await this.db.execute<TenantRow>(
      'SELECT * FROM tenants WHERE slug = ?',
      [slug]
    );
    return result.length > 0 ? this.rowToTenant(result[0]) : null;
  }

  async getTenantByStripeCustomerId(stripeCustomerId: string): Promise<Tenant | null> {
    const result = await this.db.execute<TenantRow>(
      'SELECT * FROM tenants WHERE stripe_customer_id = ?',
      [stripeCustomerId]
    );
    return result.length > 0 ? this.rowToTenant(result[0]) : null;
  }

  async updateTenant(tenantId: string, updates: TenantUpdateInput): Promise<Tenant | null> {
    const existing = await this.getTenant(tenantId);
    if (!existing) return null;

    const now = Date.now();
    const updated: Tenant = {
      ...existing,
      ...updates,
      settings: updates.settings ?? existing.settings,
      updatedAt: now,
    };

    await this.db.execute(
      `UPDATE tenants SET
        name = ?, slug = ?, owner_id = ?, tier = ?, status = ?,
        settings = ?, stripe_customer_id = ?, stripe_subscription_id = ?,
        trial_ends_at = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.slug,
        updated.ownerId,
        updated.tier,
        updated.status,
        JSON.stringify(updated.settings),
        updated.stripeCustomerId ?? null,
        updated.stripeSubscriptionId ?? null,
        updated.trialEndsAt ?? null,
        updated.updatedAt,
        tenantId,
      ]
    );

    return updated;
  }

  async deleteTenant(tenantId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM tenants WHERE id = ?',
      [tenantId]
    );
    return (result as any).changes > 0;
  }

  async listTenants(options: TenantQueryOptions = {}): Promise<Tenant[]> {
    const { sql, params } = this.buildQuerySQL(options);
    const result = await this.db.execute<TenantRow>(sql, params);
    return result.map(row => this.rowToTenant(row));
  }

  async countTenants(options: TenantQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildQuerySQL(options, true);
    const result = await this.db.execute<{ count: number }>(sql, params);
    return result[0]?.count ?? 0;
  }

  async isSlugAvailable(slug: string, excludeTenantId?: string): Promise<boolean> {
    let sql = 'SELECT COUNT(*) as count FROM tenants WHERE slug = ?';
    const params: unknown[] = [slug];

    if (excludeTenantId) {
      sql += ' AND id != ?';
      params.push(excludeTenantId);
    }

    const result = await this.db.execute<{ count: number }>(sql, params);
    return (result[0]?.count ?? 0) === 0;
  }

  private buildQuerySQL(options: TenantQueryOptions, isCount = false): { sql: string; params: unknown[] } {
    let sql = isCount ? 'SELECT COUNT(*) as count FROM tenants' : 'SELECT * FROM tenants';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options.tier) {
      conditions.push('tier = ?');
      params.push(options.tier);
    }

    if (options.ownerId) {
      conditions.push('owner_id = ?');
      params.push(options.ownerId);
    }

    if (options.search) {
      conditions.push('(name LIKE ? OR slug LIKE ?)');
      const searchPattern = `%${options.search}%`;
      params.push(searchPattern, searchPattern);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

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

  private rowToTenant(row: TenantRow): Tenant {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      ownerId: row.owner_id,
      tier: row.tier as SubscriptionTier,
      status: row.status as TenantStatus,
      settings: JSON.parse(row.settings),
      stripeCustomerId: row.stripe_customer_id ?? undefined,
      stripeSubscriptionId: row.stripe_subscription_id ?? undefined,
      trialEndsAt: row.trial_ends_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryTenantStore implements TenantStore {
  private tenants = new Map<string, Tenant>();
  private slugIndex = new Map<string, string>(); // slug -> tenantId
  private stripeCustomerIndex = new Map<string, string>(); // stripeCustomerId -> tenantId

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async createTenant(input: TenantCreateInput): Promise<Tenant> {
    const now = Date.now();
    const { id: providedId, ...rest } = input;
    const tenant: Tenant = {
      id: providedId ?? randomUUID(),
      ...rest,
      createdAt: now,
      updatedAt: now,
    };

    this.tenants.set(tenant.id, tenant);
    this.slugIndex.set(tenant.slug, tenant.id);
    if (tenant.stripeCustomerId) {
      this.stripeCustomerIndex.set(tenant.stripeCustomerId, tenant.id);
    }

    return { ...tenant };
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    const tenant = this.tenants.get(tenantId);
    return tenant ? { ...tenant, settings: { ...tenant.settings } } : null;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    const tenantId = this.slugIndex.get(slug);
    if (!tenantId) return null;
    return this.getTenant(tenantId);
  }

  async getTenantByStripeCustomerId(stripeCustomerId: string): Promise<Tenant | null> {
    const tenantId = this.stripeCustomerIndex.get(stripeCustomerId);
    if (!tenantId) return null;
    return this.getTenant(tenantId);
  }

  async updateTenant(tenantId: string, updates: TenantUpdateInput): Promise<Tenant | null> {
    const existing = this.tenants.get(tenantId);
    if (!existing) return null;

    // Update indexes if slug or stripeCustomerId changed
    if (updates.slug && updates.slug !== existing.slug) {
      this.slugIndex.delete(existing.slug);
      this.slugIndex.set(updates.slug, tenantId);
    }

    if (updates.stripeCustomerId !== undefined) {
      if (existing.stripeCustomerId) {
        this.stripeCustomerIndex.delete(existing.stripeCustomerId);
      }
      if (updates.stripeCustomerId) {
        this.stripeCustomerIndex.set(updates.stripeCustomerId, tenantId);
      }
    }

    const updated: Tenant = {
      ...existing,
      ...updates,
      settings: updates.settings ?? existing.settings,
      updatedAt: Date.now(),
    };

    this.tenants.set(tenantId, updated);
    return { ...updated, settings: { ...updated.settings } };
  }

  async deleteTenant(tenantId: string): Promise<boolean> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;

    this.slugIndex.delete(tenant.slug);
    if (tenant.stripeCustomerId) {
      this.stripeCustomerIndex.delete(tenant.stripeCustomerId);
    }
    this.tenants.delete(tenantId);

    return true;
  }

  async listTenants(options: TenantQueryOptions = {}): Promise<Tenant[]> {
    let tenants = Array.from(this.tenants.values());

    // Apply filters
    if (options.status) {
      tenants = tenants.filter(t => t.status === options.status);
    }
    if (options.tier) {
      tenants = tenants.filter(t => t.tier === options.tier);
    }
    if (options.ownerId) {
      tenants = tenants.filter(t => t.ownerId === options.ownerId);
    }
    if (options.search) {
      const search = options.search.toLowerCase();
      tenants = tenants.filter(t =>
        t.name.toLowerCase().includes(search) ||
        t.slug.toLowerCase().includes(search)
      );
    }

    // Sort by created_at descending
    tenants.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    if (options.offset) {
      tenants = tenants.slice(options.offset);
    }
    if (options.limit) {
      tenants = tenants.slice(0, options.limit);
    }

    return tenants.map(t => ({ ...t, settings: { ...t.settings } }));
  }

  async countTenants(options: TenantQueryOptions = {}): Promise<number> {
    let tenants = Array.from(this.tenants.values());

    if (options.status) {
      tenants = tenants.filter(t => t.status === options.status);
    }
    if (options.tier) {
      tenants = tenants.filter(t => t.tier === options.tier);
    }
    if (options.ownerId) {
      tenants = tenants.filter(t => t.ownerId === options.ownerId);
    }
    if (options.search) {
      const search = options.search.toLowerCase();
      tenants = tenants.filter(t =>
        t.name.toLowerCase().includes(search) ||
        t.slug.toLowerCase().includes(search)
      );
    }

    return tenants.length;
  }

  async isSlugAvailable(slug: string, excludeTenantId?: string): Promise<boolean> {
    const tenantId = this.slugIndex.get(slug);
    if (!tenantId) return true;
    return excludeTenantId ? tenantId === excludeTenantId : false;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTenantStore(type: 'memory'): InMemoryTenantStore;
export function createTenantStore(type: 'database', db: DatabaseAdapter): DatabaseTenantStore;
export function createTenantStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): TenantStore {
  if (type === 'memory') {
    return new InMemoryTenantStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseTenantStore(db);
}
