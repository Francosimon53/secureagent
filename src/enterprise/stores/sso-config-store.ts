/**
 * SSO Configuration Store
 *
 * Persistence layer for SSO configurations
 */

import type { DatabaseAdapter } from './index.js';
import type {
  SSOConfiguration,
  SSOConfigCreateInput,
  SSOConfigUpdateInput,
  SSOProvider,
  EnterpriseRole,
  GoogleSSOConfig,
  MicrosoftSSOConfig,
  SAMLConfig,
  OIDCConfig,
} from '../types.js';

// =============================================================================
// SSO Config Store Interface
// =============================================================================

export interface SSOConfigStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Create or update SSO configuration */
  upsertSSOConfig(input: SSOConfigCreateInput): Promise<SSOConfiguration>;

  /** Get SSO configuration for a tenant */
  getSSOConfig(tenantId: string): Promise<SSOConfiguration | null>;

  /** Get SSO configuration by custom domain */
  getSSOConfigByDomain(domain: string): Promise<SSOConfiguration | null>;

  /** Update SSO configuration */
  updateSSOConfig(tenantId: string, updates: SSOConfigUpdateInput): Promise<SSOConfiguration | null>;

  /** Delete SSO configuration */
  deleteSSOConfig(tenantId: string): Promise<boolean>;

  /** List all SSO configurations (admin) */
  listSSOConfigs(): Promise<SSOConfiguration[]>;

  /** List enabled SSO configurations */
  listEnabledSSOConfigs(): Promise<SSOConfiguration[]>;
}

// =============================================================================
// Database Row Type
// =============================================================================

interface SSOConfigRow {
  tenant_id: string;
  provider: string;
  enabled: number;
  config: string;
  default_role: string;
  auto_provision: number;
  enforced: number;
  domain_verified: number;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseSSOConfigStore implements SSOConfigStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS sso_configurations (
        tenant_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        config TEXT NOT NULL,
        default_role TEXT NOT NULL DEFAULT 'member',
        auto_provision INTEGER NOT NULL DEFAULT 1,
        enforced INTEGER NOT NULL DEFAULT 0,
        domain_verified INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_sso_configs_provider ON sso_configurations(provider)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_sso_configs_enabled ON sso_configurations(enabled)
    `);
  }

  async upsertSSOConfig(input: SSOConfigCreateInput): Promise<SSOConfiguration> {
    const now = Date.now();
    const existing = await this.getSSOConfig(input.tenantId);

    if (existing) {
      // Update
      const updated: SSOConfiguration = {
        ...input,
        createdAt: existing.createdAt,
        updatedAt: now,
      };

      await this.db.execute(
        `UPDATE sso_configurations SET
          provider = ?, enabled = ?, config = ?, default_role = ?,
          auto_provision = ?, enforced = ?, domain_verified = ?, updated_at = ?
        WHERE tenant_id = ?`,
        [
          updated.provider,
          updated.enabled ? 1 : 0,
          JSON.stringify(updated.config),
          updated.defaultRole,
          updated.autoProvision ? 1 : 0,
          updated.enforced ? 1 : 0,
          updated.domainVerified ? 1 : 0,
          updated.updatedAt,
          input.tenantId,
        ]
      );

      return updated;
    } else {
      // Insert
      const config: SSOConfiguration = {
        ...input,
        createdAt: now,
        updatedAt: now,
      };

      await this.db.execute(
        `INSERT INTO sso_configurations (
          tenant_id, provider, enabled, config, default_role,
          auto_provision, enforced, domain_verified, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          config.tenantId,
          config.provider,
          config.enabled ? 1 : 0,
          JSON.stringify(config.config),
          config.defaultRole,
          config.autoProvision ? 1 : 0,
          config.enforced ? 1 : 0,
          config.domainVerified ? 1 : 0,
          config.createdAt,
          config.updatedAt,
        ]
      );

      return config;
    }
  }

  async getSSOConfig(tenantId: string): Promise<SSOConfiguration | null> {
    const result = await this.db.execute<SSOConfigRow>(
      'SELECT * FROM sso_configurations WHERE tenant_id = ?',
      [tenantId]
    );
    return result.length > 0 ? this.rowToConfig(result[0]) : null;
  }

  async getSSOConfigByDomain(domain: string): Promise<SSOConfiguration | null> {
    // Search through Google hosted domain or Microsoft domain configs
    const result = await this.db.execute<SSOConfigRow>(
      `SELECT * FROM sso_configurations WHERE enabled = 1`,
      []
    );

    for (const row of result) {
      const config = this.rowToConfig(row);
      if (config.provider === 'google') {
        const googleConfig = config.config as GoogleSSOConfig;
        if (googleConfig.hostedDomain === domain) {
          return config;
        }
      } else if (config.provider === 'microsoft') {
        const msConfig = config.config as MicrosoftSSOConfig;
        if (msConfig.domain === domain) {
          return config;
        }
      }
    }

    return null;
  }

  async updateSSOConfig(tenantId: string, updates: SSOConfigUpdateInput): Promise<SSOConfiguration | null> {
    const existing = await this.getSSOConfig(tenantId);
    if (!existing) return null;

    const updated: SSOConfiguration = {
      ...existing,
      ...updates,
      config: updates.config ?? existing.config,
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `UPDATE sso_configurations SET
        provider = ?, enabled = ?, config = ?, default_role = ?,
        auto_provision = ?, enforced = ?, domain_verified = ?, updated_at = ?
      WHERE tenant_id = ?`,
      [
        updated.provider,
        updated.enabled ? 1 : 0,
        JSON.stringify(updated.config),
        updated.defaultRole,
        updated.autoProvision ? 1 : 0,
        updated.enforced ? 1 : 0,
        updated.domainVerified ? 1 : 0,
        updated.updatedAt,
        tenantId,
      ]
    );

    return updated;
  }

  async deleteSSOConfig(tenantId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM sso_configurations WHERE tenant_id = ?',
      [tenantId]
    );
    return (result as any).changes > 0;
  }

  async listSSOConfigs(): Promise<SSOConfiguration[]> {
    const result = await this.db.execute<SSOConfigRow>(
      'SELECT * FROM sso_configurations ORDER BY created_at DESC',
      []
    );
    return result.map(row => this.rowToConfig(row));
  }

  async listEnabledSSOConfigs(): Promise<SSOConfiguration[]> {
    const result = await this.db.execute<SSOConfigRow>(
      'SELECT * FROM sso_configurations WHERE enabled = 1 ORDER BY created_at DESC',
      []
    );
    return result.map(row => this.rowToConfig(row));
  }

  private rowToConfig(row: SSOConfigRow): SSOConfiguration {
    return {
      tenantId: row.tenant_id,
      provider: row.provider as SSOProvider,
      enabled: row.enabled === 1,
      config: JSON.parse(row.config) as GoogleSSOConfig | MicrosoftSSOConfig | SAMLConfig | OIDCConfig,
      defaultRole: row.default_role as EnterpriseRole,
      autoProvision: row.auto_provision === 1,
      enforced: row.enforced === 1,
      domainVerified: row.domain_verified === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemorySSOConfigStore implements SSOConfigStore {
  private configs = new Map<string, SSOConfiguration>();

  async initialize(): Promise<void> {
    // No-op
  }

  async upsertSSOConfig(input: SSOConfigCreateInput): Promise<SSOConfiguration> {
    const now = Date.now();
    const existing = this.configs.get(input.tenantId);

    const config: SSOConfiguration = {
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.configs.set(input.tenantId, config);
    return { ...config };
  }

  async getSSOConfig(tenantId: string): Promise<SSOConfiguration | null> {
    const config = this.configs.get(tenantId);
    return config ? { ...config } : null;
  }

  async getSSOConfigByDomain(domain: string): Promise<SSOConfiguration | null> {
    for (const config of this.configs.values()) {
      if (!config.enabled) continue;

      if (config.provider === 'google') {
        const googleConfig = config.config as GoogleSSOConfig;
        if (googleConfig.hostedDomain === domain) {
          return { ...config };
        }
      } else if (config.provider === 'microsoft') {
        const msConfig = config.config as MicrosoftSSOConfig;
        if (msConfig.domain === domain) {
          return { ...config };
        }
      }
    }

    return null;
  }

  async updateSSOConfig(tenantId: string, updates: SSOConfigUpdateInput): Promise<SSOConfiguration | null> {
    const existing = this.configs.get(tenantId);
    if (!existing) return null;

    const updated: SSOConfiguration = {
      ...existing,
      ...updates,
      config: updates.config ?? existing.config,
      updatedAt: Date.now(),
    };

    this.configs.set(tenantId, updated);
    return { ...updated };
  }

  async deleteSSOConfig(tenantId: string): Promise<boolean> {
    return this.configs.delete(tenantId);
  }

  async listSSOConfigs(): Promise<SSOConfiguration[]> {
    return Array.from(this.configs.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(c => ({ ...c }));
  }

  async listEnabledSSOConfigs(): Promise<SSOConfiguration[]> {
    return Array.from(this.configs.values())
      .filter(c => c.enabled)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(c => ({ ...c }));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createSSOConfigStore(type: 'memory'): InMemorySSOConfigStore;
export function createSSOConfigStore(type: 'database', db: DatabaseAdapter): DatabaseSSOConfigStore;
export function createSSOConfigStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): SSOConfigStore {
  if (type === 'memory') {
    return new InMemorySSOConfigStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseSSOConfigStore(db);
}
