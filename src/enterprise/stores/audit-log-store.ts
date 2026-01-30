/**
 * Enterprise Audit Log Store
 *
 * Persistence layer for enterprise audit logs
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from './index.js';
import type { EnterpriseAuditLog, EnterpriseAuditEventType, AuditLogQueryOptions } from '../types.js';

// =============================================================================
// Audit Log Store Interface
// =============================================================================

export interface EnterpriseAuditLogStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Create an audit log entry */
  createAuditLog(log: Omit<EnterpriseAuditLog, 'id'>): Promise<EnterpriseAuditLog>;

  /** Get audit log by ID */
  getAuditLog(logId: string): Promise<EnterpriseAuditLog | null>;

  /** Query audit logs */
  queryAuditLogs(tenantId: string, options?: AuditLogQueryOptions): Promise<EnterpriseAuditLog[]>;

  /** Count audit logs */
  countAuditLogs(tenantId: string, options?: AuditLogQueryOptions): Promise<number>;

  /** Delete old audit logs (for retention policy) */
  deleteOldLogs(olderThan: number): Promise<number>;

  /** Get audit log statistics */
  getAuditStats(
    tenantId: string,
    periodStart: number,
    periodEnd: number
  ): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByUser: Record<string, number>;
  }>;
}

// =============================================================================
// Database Row Type
// =============================================================================

interface AuditLogRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  action: string;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  timestamp: number;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseEnterpriseAuditLogStore implements EnterpriseAuditLogStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS enterprise_audit_log (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT,
        event_type TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_time
      ON enterprise_audit_log(tenant_id, timestamp DESC)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_event_type
      ON enterprise_audit_log(tenant_id, event_type)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_user
      ON enterprise_audit_log(tenant_id, user_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
      ON enterprise_audit_log(timestamp)
    `);
  }

  async createAuditLog(log: Omit<EnterpriseAuditLog, 'id'>): Promise<EnterpriseAuditLog> {
    const entry: EnterpriseAuditLog = {
      id: randomUUID(),
      ...log,
    };

    await this.db.execute(
      `INSERT INTO enterprise_audit_log (
        id, tenant_id, user_id, event_type, resource_type, resource_id,
        action, details, ip_address, user_agent, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.tenantId,
        entry.userId ?? null,
        entry.eventType,
        entry.resourceType ?? null,
        entry.resourceId ?? null,
        entry.action,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
        entry.timestamp,
      ]
    );

    return entry;
  }

  async getAuditLog(logId: string): Promise<EnterpriseAuditLog | null> {
    const result = await this.db.execute<AuditLogRow>(
      'SELECT * FROM enterprise_audit_log WHERE id = ?',
      [logId]
    );
    return result.length > 0 ? this.rowToLog(result[0]) : null;
  }

  async queryAuditLogs(tenantId: string, options: AuditLogQueryOptions = {}): Promise<EnterpriseAuditLog[]> {
    const { sql, params } = this.buildQuerySQL(tenantId, options);
    const result = await this.db.execute<AuditLogRow>(sql, params);
    return result.map(row => this.rowToLog(row));
  }

  async countAuditLogs(tenantId: string, options: AuditLogQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildQuerySQL(tenantId, options, true);
    const result = await this.db.execute<{ count: number }>(sql, params);
    return result[0]?.count ?? 0;
  }

  async deleteOldLogs(olderThan: number): Promise<number> {
    const result = await this.db.execute(
      'DELETE FROM enterprise_audit_log WHERE timestamp < ?',
      [olderThan]
    );
    return (result as any).changes;
  }

  async getAuditStats(
    tenantId: string,
    periodStart: number,
    periodEnd: number
  ): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByUser: Record<string, number>;
  }> {
    // Total events
    const totalResult = await this.db.execute<{ count: number }>(
      `SELECT COUNT(*) as count FROM enterprise_audit_log
       WHERE tenant_id = ? AND timestamp >= ? AND timestamp <= ?`,
      [tenantId, periodStart, periodEnd]
    );

    // Events by type
    const typeResult = await this.db.execute<{ event_type: string; count: number }>(
      `SELECT event_type, COUNT(*) as count FROM enterprise_audit_log
       WHERE tenant_id = ? AND timestamp >= ? AND timestamp <= ?
       GROUP BY event_type`,
      [tenantId, periodStart, periodEnd]
    );

    // Events by user
    const userResult = await this.db.execute<{ user_id: string | null; count: number }>(
      `SELECT user_id, COUNT(*) as count FROM enterprise_audit_log
       WHERE tenant_id = ? AND timestamp >= ? AND timestamp <= ? AND user_id IS NOT NULL
       GROUP BY user_id`,
      [tenantId, periodStart, periodEnd]
    );

    const eventsByType: Record<string, number> = {};
    for (const row of typeResult) {
      eventsByType[row.event_type] = row.count;
    }

    const eventsByUser: Record<string, number> = {};
    for (const row of userResult) {
      if (row.user_id) {
        eventsByUser[row.user_id] = row.count;
      }
    }

    return {
      totalEvents: totalResult[0]?.count ?? 0,
      eventsByType,
      eventsByUser,
    };
  }

  private buildQuerySQL(
    tenantId: string,
    options: AuditLogQueryOptions,
    isCount = false
  ): { sql: string; params: unknown[] } {
    let sql = isCount
      ? 'SELECT COUNT(*) as count FROM enterprise_audit_log'
      : 'SELECT * FROM enterprise_audit_log';

    const conditions: string[] = ['tenant_id = ?'];
    const params: unknown[] = [tenantId];

    if (options.eventType) {
      conditions.push('event_type = ?');
      params.push(options.eventType);
    }
    if (options.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }
    if (options.resourceType) {
      conditions.push('resource_type = ?');
      params.push(options.resourceType);
    }
    if (options.resourceId) {
      conditions.push('resource_id = ?');
      params.push(options.resourceId);
    }
    if (options.fromTimestamp) {
      conditions.push('timestamp >= ?');
      params.push(options.fromTimestamp);
    }
    if (options.toTimestamp) {
      conditions.push('timestamp <= ?');
      params.push(options.toTimestamp);
    }

    sql += ' WHERE ' + conditions.join(' AND ');

    if (!isCount) {
      sql += ' ORDER BY timestamp DESC';

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

  private rowToLog(row: AuditLogRow): EnterpriseAuditLog {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id ?? undefined,
      eventType: row.event_type as EnterpriseAuditEventType,
      resourceType: row.resource_type ?? undefined,
      resourceId: row.resource_id ?? undefined,
      action: row.action,
      details: row.details ? JSON.parse(row.details) : undefined,
      ipAddress: row.ip_address ?? undefined,
      userAgent: row.user_agent ?? undefined,
      timestamp: row.timestamp,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryEnterpriseAuditLogStore implements EnterpriseAuditLogStore {
  private logs = new Map<string, EnterpriseAuditLog>();

  async initialize(): Promise<void> {
    // No-op
  }

  async createAuditLog(log: Omit<EnterpriseAuditLog, 'id'>): Promise<EnterpriseAuditLog> {
    const entry: EnterpriseAuditLog = {
      id: randomUUID(),
      ...log,
    };
    this.logs.set(entry.id, entry);
    return { ...entry };
  }

  async getAuditLog(logId: string): Promise<EnterpriseAuditLog | null> {
    const log = this.logs.get(logId);
    return log ? { ...log } : null;
  }

  async queryAuditLogs(tenantId: string, options: AuditLogQueryOptions = {}): Promise<EnterpriseAuditLog[]> {
    let logs = Array.from(this.logs.values()).filter(l => l.tenantId === tenantId);

    if (options.eventType) {
      logs = logs.filter(l => l.eventType === options.eventType);
    }
    if (options.userId) {
      logs = logs.filter(l => l.userId === options.userId);
    }
    if (options.resourceType) {
      logs = logs.filter(l => l.resourceType === options.resourceType);
    }
    if (options.resourceId) {
      logs = logs.filter(l => l.resourceId === options.resourceId);
    }
    if (options.fromTimestamp) {
      logs = logs.filter(l => l.timestamp >= options.fromTimestamp!);
    }
    if (options.toTimestamp) {
      logs = logs.filter(l => l.timestamp <= options.toTimestamp!);
    }

    logs.sort((a, b) => b.timestamp - a.timestamp);

    if (options.offset) {
      logs = logs.slice(options.offset);
    }
    if (options.limit) {
      logs = logs.slice(0, options.limit);
    }

    return logs.map(l => ({ ...l }));
  }

  async countAuditLogs(tenantId: string, options: AuditLogQueryOptions = {}): Promise<number> {
    let logs = Array.from(this.logs.values()).filter(l => l.tenantId === tenantId);

    if (options.eventType) {
      logs = logs.filter(l => l.eventType === options.eventType);
    }
    if (options.userId) {
      logs = logs.filter(l => l.userId === options.userId);
    }
    if (options.resourceType) {
      logs = logs.filter(l => l.resourceType === options.resourceType);
    }
    if (options.resourceId) {
      logs = logs.filter(l => l.resourceId === options.resourceId);
    }
    if (options.fromTimestamp) {
      logs = logs.filter(l => l.timestamp >= options.fromTimestamp!);
    }
    if (options.toTimestamp) {
      logs = logs.filter(l => l.timestamp <= options.toTimestamp!);
    }

    return logs.length;
  }

  async deleteOldLogs(olderThan: number): Promise<number> {
    let deleted = 0;
    for (const [id, log] of this.logs) {
      if (log.timestamp < olderThan) {
        this.logs.delete(id);
        deleted++;
      }
    }
    return deleted;
  }

  async getAuditStats(
    tenantId: string,
    periodStart: number,
    periodEnd: number
  ): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByUser: Record<string, number>;
  }> {
    const logs = Array.from(this.logs.values()).filter(
      l => l.tenantId === tenantId && l.timestamp >= periodStart && l.timestamp <= periodEnd
    );

    const eventsByType: Record<string, number> = {};
    const eventsByUser: Record<string, number> = {};

    for (const log of logs) {
      eventsByType[log.eventType] = (eventsByType[log.eventType] ?? 0) + 1;
      if (log.userId) {
        eventsByUser[log.userId] = (eventsByUser[log.userId] ?? 0) + 1;
      }
    }

    return {
      totalEvents: logs.length,
      eventsByType,
      eventsByUser,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createEnterpriseAuditLogStore(type: 'memory'): InMemoryEnterpriseAuditLogStore;
export function createEnterpriseAuditLogStore(type: 'database', db: DatabaseAdapter): DatabaseEnterpriseAuditLogStore;
export function createEnterpriseAuditLogStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): EnterpriseAuditLogStore {
  if (type === 'memory') {
    return new InMemoryEnterpriseAuditLogStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseEnterpriseAuditLogStore(db);
}
