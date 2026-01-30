/**
 * Enterprise Stores
 *
 * Factory functions and exports for all enterprise stores
 */

/**
 * Query result with additional metadata
 */
export interface QueryResult<T = unknown> {
  rows: T[];
  changes?: number;
}

/**
 * Database adapter interface for enterprise stores
 * Provides methods for running SQL queries
 */
export interface DatabaseAdapter {
  /** Execute a SQL query with optional parameters (returns rows array) */
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Close the database connection */
  close?(): Promise<void>;
}

/**
 * Helper to execute a query and return rows in QueryResult format
 */
export async function executeQuery<T>(
  db: DatabaseAdapter,
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const rows = await db.execute<T>(sql, params);
  return { rows };
}

// Re-export all stores
export {
  TenantStore,
  TenantQueryOptions,
  DatabaseTenantStore,
  InMemoryTenantStore,
  createTenantStore,
} from './tenant-store.js';

export {
  EnterpriseUserStore,
  UserQueryOptions,
  DatabaseEnterpriseUserStore,
  InMemoryEnterpriseUserStore,
  createEnterpriseUserStore,
} from './user-store.js';

export {
  SubscriptionStore,
  DatabaseSubscriptionStore,
  InMemorySubscriptionStore,
  createSubscriptionStore,
} from './subscription-store.js';

export {
  UsageStore,
  UsageQueryOptions,
  RecordUsageInput,
  DatabaseUsageStore,
  InMemoryUsageStore,
  createUsageStore,
} from './usage-store.js';

export {
  EnterpriseAuditLogStore,
  DatabaseEnterpriseAuditLogStore,
  InMemoryEnterpriseAuditLogStore,
  createEnterpriseAuditLogStore,
} from './audit-log-store.js';

export {
  APIKeyStore,
  APIKeyQueryOptions,
  DatabaseAPIKeyStore,
  InMemoryAPIKeyStore,
  createAPIKeyStore,
} from './api-key-store.js';

export {
  SSOConfigStore,
  DatabaseSSOConfigStore,
  InMemorySSOConfigStore,
  createSSOConfigStore,
} from './sso-config-store.js';

export {
  WhiteLabelStore,
  DatabaseWhiteLabelStore,
  InMemoryWhiteLabelStore,
  createWhiteLabelStore,
} from './white-label-store.js';

// =============================================================================
// Store Collection Type
// =============================================================================

import type { TenantStore } from './tenant-store.js';
import type { EnterpriseUserStore } from './user-store.js';
import type { SubscriptionStore } from './subscription-store.js';
import type { UsageStore } from './usage-store.js';
import type { EnterpriseAuditLogStore } from './audit-log-store.js';
import type { APIKeyStore } from './api-key-store.js';
import type { SSOConfigStore } from './sso-config-store.js';
import type { WhiteLabelStore } from './white-label-store.js';

import { createTenantStore } from './tenant-store.js';
import { createEnterpriseUserStore } from './user-store.js';
import { createSubscriptionStore } from './subscription-store.js';
import { createUsageStore } from './usage-store.js';
import { createEnterpriseAuditLogStore } from './audit-log-store.js';
import { createAPIKeyStore } from './api-key-store.js';
import { createSSOConfigStore } from './sso-config-store.js';
import { createWhiteLabelStore } from './white-label-store.js';

/** Collection of all enterprise stores */
export interface EnterpriseStores {
  tenant: TenantStore;
  user: EnterpriseUserStore;
  subscription: SubscriptionStore;
  usage: UsageStore;
  auditLog: EnterpriseAuditLogStore;
  apiKey: APIKeyStore;
  ssoConfig: SSOConfigStore;
  whiteLabel: WhiteLabelStore;
}

/**
 * Create all enterprise stores
 */
export function createEnterpriseStores(type: 'memory'): EnterpriseStores;
export function createEnterpriseStores(type: 'database', db: DatabaseAdapter): EnterpriseStores;
export function createEnterpriseStores(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): EnterpriseStores {
  if (type === 'memory') {
    return {
      tenant: createTenantStore('memory'),
      user: createEnterpriseUserStore('memory'),
      subscription: createSubscriptionStore('memory'),
      usage: createUsageStore('memory'),
      auditLog: createEnterpriseAuditLogStore('memory'),
      apiKey: createAPIKeyStore('memory'),
      ssoConfig: createSSOConfigStore('memory'),
      whiteLabel: createWhiteLabelStore('memory'),
    };
  }

  if (!db) {
    throw new Error('Database adapter required for database stores');
  }

  return {
    tenant: createTenantStore('database', db),
    user: createEnterpriseUserStore('database', db),
    subscription: createSubscriptionStore('database', db),
    usage: createUsageStore('database', db),
    auditLog: createEnterpriseAuditLogStore('database', db),
    apiKey: createAPIKeyStore('database', db),
    ssoConfig: createSSOConfigStore('database', db),
    whiteLabel: createWhiteLabelStore('database', db),
  };
}

/**
 * Initialize all enterprise stores
 */
export async function initializeEnterpriseStores(stores: EnterpriseStores): Promise<void> {
  await Promise.all([
    stores.tenant.initialize(),
    stores.user.initialize(),
    stores.subscription.initialize(),
    stores.usage.initialize(),
    stores.auditLog.initialize(),
    stores.apiKey.initialize(),
    stores.ssoConfig.initialize(),
    stores.whiteLabel.initialize(),
  ]);
}
