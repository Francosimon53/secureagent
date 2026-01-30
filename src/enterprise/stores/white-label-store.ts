/**
 * White Label Store
 *
 * Persistence layer for white-label branding configurations
 */

import type { DatabaseAdapter } from './index.js';
import type {
  WhiteLabelConfig,
  WhiteLabelCreateInput,
  WhiteLabelUpdateInput,
  BrandingConfig,
} from '../types.js';

// =============================================================================
// White Label Store Interface
// =============================================================================

export interface WhiteLabelStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Create or update white-label configuration */
  upsertWhiteLabelConfig(input: WhiteLabelCreateInput): Promise<WhiteLabelConfig>;

  /** Get white-label configuration for a tenant */
  getWhiteLabelConfig(tenantId: string): Promise<WhiteLabelConfig | null>;

  /** Get white-label configuration by custom domain */
  getWhiteLabelConfigByDomain(domain: string): Promise<WhiteLabelConfig | null>;

  /** Update white-label configuration */
  updateWhiteLabelConfig(tenantId: string, updates: WhiteLabelUpdateInput): Promise<WhiteLabelConfig | null>;

  /** Delete white-label configuration */
  deleteWhiteLabelConfig(tenantId: string): Promise<boolean>;

  /** List all white-label configurations (admin) */
  listWhiteLabelConfigs(): Promise<WhiteLabelConfig[]>;

  /** List configurations pending domain verification */
  listPendingDomainVerifications(): Promise<WhiteLabelConfig[]>;

  /** Mark domain as verified */
  verifyDomain(tenantId: string): Promise<WhiteLabelConfig | null>;
}

// =============================================================================
// Database Row Type
// =============================================================================

interface WhiteLabelRow {
  tenant_id: string;
  enabled: number;
  branding: string;
  custom_domain: string | null;
  domain_verified: number;
  ssl_status: string | null;
  email_from_name: string | null;
  email_from_address: string | null;
  support_email: string | null;
  terms_url: string | null;
  privacy_url: string | null;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseWhiteLabelStore implements WhiteLabelStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS white_label_configs (
        tenant_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        branding TEXT NOT NULL,
        custom_domain TEXT,
        domain_verified INTEGER NOT NULL DEFAULT 0,
        ssl_status TEXT,
        email_from_name TEXT,
        email_from_address TEXT,
        support_email TEXT,
        terms_url TEXT,
        privacy_url TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_white_label_domain ON white_label_configs(custom_domain)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_white_label_verified ON white_label_configs(domain_verified)
    `);
  }

  async upsertWhiteLabelConfig(input: WhiteLabelCreateInput): Promise<WhiteLabelConfig> {
    const now = Date.now();
    const existing = await this.getWhiteLabelConfig(input.tenantId);

    if (existing) {
      // Update
      const updated: WhiteLabelConfig = {
        ...input,
        domainVerified: existing.domainVerified,
        sslStatus: existing.sslStatus,
        createdAt: existing.createdAt,
        updatedAt: now,
      };

      await this.db.execute(
        `UPDATE white_label_configs SET
          enabled = ?, branding = ?, custom_domain = ?, email_from_name = ?,
          email_from_address = ?, support_email = ?, terms_url = ?, privacy_url = ?, updated_at = ?
        WHERE tenant_id = ?`,
        [
          updated.enabled ? 1 : 0,
          JSON.stringify(updated.branding),
          updated.customDomain ?? null,
          updated.emailFromName ?? null,
          updated.emailFromAddress ?? null,
          updated.supportEmail ?? null,
          updated.termsUrl ?? null,
          updated.privacyUrl ?? null,
          updated.updatedAt,
          input.tenantId,
        ]
      );

      return updated;
    } else {
      // Insert
      const config: WhiteLabelConfig = {
        ...input,
        domainVerified: false,
        createdAt: now,
        updatedAt: now,
      };

      await this.db.execute(
        `INSERT INTO white_label_configs (
          tenant_id, enabled, branding, custom_domain, domain_verified, ssl_status,
          email_from_name, email_from_address, support_email, terms_url, privacy_url,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          config.tenantId,
          config.enabled ? 1 : 0,
          JSON.stringify(config.branding),
          config.customDomain ?? null,
          0,
          null,
          config.emailFromName ?? null,
          config.emailFromAddress ?? null,
          config.supportEmail ?? null,
          config.termsUrl ?? null,
          config.privacyUrl ?? null,
          config.createdAt,
          config.updatedAt,
        ]
      );

      return config;
    }
  }

  async getWhiteLabelConfig(tenantId: string): Promise<WhiteLabelConfig | null> {
    const result = await this.db.execute<WhiteLabelRow>(
      'SELECT * FROM white_label_configs WHERE tenant_id = ?',
      [tenantId]
    );
    return result.length > 0 ? this.rowToConfig(result[0]) : null;
  }

  async getWhiteLabelConfigByDomain(domain: string): Promise<WhiteLabelConfig | null> {
    const result = await this.db.execute<WhiteLabelRow>(
      'SELECT * FROM white_label_configs WHERE custom_domain = ? AND domain_verified = 1 AND enabled = 1',
      [domain]
    );
    return result.length > 0 ? this.rowToConfig(result[0]) : null;
  }

  async updateWhiteLabelConfig(tenantId: string, updates: WhiteLabelUpdateInput): Promise<WhiteLabelConfig | null> {
    const existing = await this.getWhiteLabelConfig(tenantId);
    if (!existing) return null;

    const updated: WhiteLabelConfig = {
      ...existing,
      ...updates,
      branding: updates.branding ?? existing.branding,
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `UPDATE white_label_configs SET
        enabled = ?, branding = ?, custom_domain = ?, domain_verified = ?, ssl_status = ?,
        email_from_name = ?, email_from_address = ?, support_email = ?, terms_url = ?, privacy_url = ?, updated_at = ?
      WHERE tenant_id = ?`,
      [
        updated.enabled ? 1 : 0,
        JSON.stringify(updated.branding),
        updated.customDomain ?? null,
        updated.domainVerified ? 1 : 0,
        updated.sslStatus ?? null,
        updated.emailFromName ?? null,
        updated.emailFromAddress ?? null,
        updated.supportEmail ?? null,
        updated.termsUrl ?? null,
        updated.privacyUrl ?? null,
        updated.updatedAt,
        tenantId,
      ]
    );

    return updated;
  }

  async deleteWhiteLabelConfig(tenantId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM white_label_configs WHERE tenant_id = ?',
      [tenantId]
    );
    return (result as any).changes > 0;
  }

  async listWhiteLabelConfigs(): Promise<WhiteLabelConfig[]> {
    const result = await this.db.execute<WhiteLabelRow>(
      'SELECT * FROM white_label_configs ORDER BY created_at DESC',
      []
    );
    return result.map(row => this.rowToConfig(row));
  }

  async listPendingDomainVerifications(): Promise<WhiteLabelConfig[]> {
    const result = await this.db.execute<WhiteLabelRow>(
      'SELECT * FROM white_label_configs WHERE custom_domain IS NOT NULL AND domain_verified = 0',
      []
    );
    return result.map(row => this.rowToConfig(row));
  }

  async verifyDomain(tenantId: string): Promise<WhiteLabelConfig | null> {
    const existing = await this.getWhiteLabelConfig(tenantId);
    if (!existing || !existing.customDomain) return null;

    const now = Date.now();
    await this.db.execute(
      'UPDATE white_label_configs SET domain_verified = 1, ssl_status = ?, updated_at = ? WHERE tenant_id = ?',
      ['active', now, tenantId]
    );

    return { ...existing, domainVerified: true, sslStatus: 'active', updatedAt: now };
  }

  private rowToConfig(row: WhiteLabelRow): WhiteLabelConfig {
    return {
      tenantId: row.tenant_id,
      enabled: row.enabled === 1,
      branding: JSON.parse(row.branding) as BrandingConfig,
      customDomain: row.custom_domain ?? undefined,
      domainVerified: row.domain_verified === 1,
      sslStatus: row.ssl_status as 'pending' | 'active' | 'failed' | undefined,
      emailFromName: row.email_from_name ?? undefined,
      emailFromAddress: row.email_from_address ?? undefined,
      supportEmail: row.support_email ?? undefined,
      termsUrl: row.terms_url ?? undefined,
      privacyUrl: row.privacy_url ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryWhiteLabelStore implements WhiteLabelStore {
  private configs = new Map<string, WhiteLabelConfig>();
  private domainIndex = new Map<string, string>(); // domain -> tenantId

  async initialize(): Promise<void> {
    // No-op
  }

  async upsertWhiteLabelConfig(input: WhiteLabelCreateInput): Promise<WhiteLabelConfig> {
    const now = Date.now();
    const existing = this.configs.get(input.tenantId);

    const config: WhiteLabelConfig = {
      ...input,
      domainVerified: existing?.domainVerified ?? false,
      sslStatus: existing?.sslStatus,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    // Update domain index
    if (existing?.customDomain) {
      this.domainIndex.delete(existing.customDomain);
    }
    if (config.customDomain) {
      this.domainIndex.set(config.customDomain, config.tenantId);
    }

    this.configs.set(input.tenantId, config);
    return { ...config };
  }

  async getWhiteLabelConfig(tenantId: string): Promise<WhiteLabelConfig | null> {
    const config = this.configs.get(tenantId);
    return config ? { ...config } : null;
  }

  async getWhiteLabelConfigByDomain(domain: string): Promise<WhiteLabelConfig | null> {
    const tenantId = this.domainIndex.get(domain);
    if (!tenantId) return null;

    const config = this.configs.get(tenantId);
    if (!config || !config.enabled || !config.domainVerified) return null;

    return { ...config };
  }

  async updateWhiteLabelConfig(tenantId: string, updates: WhiteLabelUpdateInput): Promise<WhiteLabelConfig | null> {
    const existing = this.configs.get(tenantId);
    if (!existing) return null;

    // Update domain index
    if (updates.customDomain !== undefined && updates.customDomain !== existing.customDomain) {
      if (existing.customDomain) {
        this.domainIndex.delete(existing.customDomain);
      }
      if (updates.customDomain) {
        this.domainIndex.set(updates.customDomain, tenantId);
      }
    }

    const updated: WhiteLabelConfig = {
      ...existing,
      ...updates,
      branding: updates.branding ?? existing.branding,
      updatedAt: Date.now(),
    };

    this.configs.set(tenantId, updated);
    return { ...updated };
  }

  async deleteWhiteLabelConfig(tenantId: string): Promise<boolean> {
    const config = this.configs.get(tenantId);
    if (!config) return false;

    if (config.customDomain) {
      this.domainIndex.delete(config.customDomain);
    }
    this.configs.delete(tenantId);

    return true;
  }

  async listWhiteLabelConfigs(): Promise<WhiteLabelConfig[]> {
    return Array.from(this.configs.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(c => ({ ...c }));
  }

  async listPendingDomainVerifications(): Promise<WhiteLabelConfig[]> {
    return Array.from(this.configs.values())
      .filter(c => c.customDomain && !c.domainVerified)
      .map(c => ({ ...c }));
  }

  async verifyDomain(tenantId: string): Promise<WhiteLabelConfig | null> {
    const existing = this.configs.get(tenantId);
    if (!existing || !existing.customDomain) return null;

    const updated: WhiteLabelConfig = {
      ...existing,
      domainVerified: true,
      sslStatus: 'active',
      updatedAt: Date.now(),
    };

    this.configs.set(tenantId, updated);
    return { ...updated };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createWhiteLabelStore(type: 'memory'): InMemoryWhiteLabelStore;
export function createWhiteLabelStore(type: 'database', db: DatabaseAdapter): DatabaseWhiteLabelStore;
export function createWhiteLabelStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): WhiteLabelStore {
  if (type === 'memory') {
    return new InMemoryWhiteLabelStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseWhiteLabelStore(db);
}
