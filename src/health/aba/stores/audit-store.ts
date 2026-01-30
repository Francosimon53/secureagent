/**
 * Health Audit Store
 *
 * HIPAA-compliant audit logging for all PHI access and operations.
 * Supports both in-memory and database implementations with:
 * - Comprehensive PHI access logging
 * - Query capabilities for compliance reporting
 * - Retention policy enforcement
 * - Batch operations for performance
 */

import type { DatabaseAdapter } from '../../../persistence/index.js';
import type {
  HealthAuditLog,
  HealthAuditQueryOptions,
  AuditAction,
  AccessLevel,
  ResourceType,
  PatientId,
} from '../types.js';

// =============================================================================
// Audit Query Result
// =============================================================================

export interface HealthAuditQueryResult {
  logs: HealthAuditLog[];
  total: number;
  hasMore: boolean;
}

// =============================================================================
// Audit Statistics
// =============================================================================

export interface HealthAuditStats {
  totalLogs: number;
  logsByAction: Record<string, number>;
  logsByResourceType: Record<string, number>;
  logsByOutcome: Record<string, number>;
  logsByRole: Record<string, number>;
  phiAccessCount: number;
  deniedAccessCount: number;
  topUsers: Array<{ userId: string; count: number }>;
  topPatients: Array<{ patientId: string; count: number }>;
  logsPerDay: Array<{ date: string; count: number }>;
}

// =============================================================================
// Health Audit Store Interface
// =============================================================================

export interface HealthAuditStore {
  initialize(): Promise<void>;

  // Log operations
  log(entry: Omit<HealthAuditLog, 'id' | 'timestamp'>): Promise<HealthAuditLog>;
  logBatch(entries: Array<Omit<HealthAuditLog, 'id' | 'timestamp'>>): Promise<HealthAuditLog[]>;
  get(id: string): Promise<HealthAuditLog | null>;

  // Query operations
  query(options: HealthAuditQueryOptions): Promise<HealthAuditQueryResult>;
  count(options: HealthAuditQueryOptions): Promise<number>;
  getStats(options?: HealthAuditQueryOptions): Promise<HealthAuditStats>;

  // Export operations
  export(options: HealthAuditQueryOptions): Promise<HealthAuditLog[]>;
  exportForPatient(patientId: PatientId, startTime?: number, endTime?: number): Promise<HealthAuditLog[]>;

  // Retention operations
  deleteOlderThan(timestamp: number): Promise<number>;
  getRetentionStats(): Promise<{
    totalLogs: number;
    oldestLog: number | null;
    newestLog: number | null;
  }>;

  // Specialized queries
  getPatientAccessHistory(patientId: PatientId, limit?: number): Promise<HealthAuditLog[]>;
  getUserActivityLog(userId: string, limit?: number): Promise<HealthAuditLog[]>;
  getDeniedAccessAttempts(startTime?: number, endTime?: number): Promise<HealthAuditLog[]>;
  getPHIAccessLogs(startTime?: number, endTime?: number): Promise<HealthAuditLog[]>;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseHealthAuditStore implements HealthAuditStore {
  private readonly tableName: string;
  private batchBuffer: Array<Omit<HealthAuditLog, 'id' | 'timestamp'>> = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly batchSize: number;
  private readonly batchFlushIntervalMs: number;

  constructor(
    private readonly db: DatabaseAdapter,
    options: {
      tableName?: string;
      batchSize?: number;
      batchFlushIntervalMs?: number;
    } = {}
  ) {
    this.tableName = options.tableName ?? 'health_audit_logs';
    this.batchSize = options.batchSize ?? 100;
    this.batchFlushIntervalMs = options.batchFlushIntervalMs ?? 5000;
  }

  async initialize(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        actor_user_id TEXT NOT NULL,
        actor_user_name TEXT,
        actor_role TEXT NOT NULL,
        actor_session_id TEXT,
        actor_ip_hash TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        resource_patient_id TEXT,
        resource_description TEXT,
        access_method TEXT NOT NULL,
        outcome TEXT NOT NULL,
        denial_reason TEXT,
        phi_accessed INTEGER NOT NULL DEFAULT 0,
        fields_accessed TEXT,
        changes TEXT,
        metadata TEXT
      )
    `);

    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_${this.tableName}_timestamp ON ${this.tableName}(timestamp)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_${this.tableName}_actor ON ${this.tableName}(actor_user_id)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_${this.tableName}_resource ON ${this.tableName}(resource_type, resource_id)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_${this.tableName}_patient ON ${this.tableName}(resource_patient_id)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_${this.tableName}_action ON ${this.tableName}(action)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_${this.tableName}_outcome ON ${this.tableName}(outcome)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_${this.tableName}_phi ON ${this.tableName}(phi_accessed)`);

    // Start batch flush interval
    if (this.batchFlushIntervalMs > 0) {
      this.batchTimeout = setInterval(() => this.flushBatch(), this.batchFlushIntervalMs);
    }
  }

  async log(entry: Omit<HealthAuditLog, 'id' | 'timestamp'>): Promise<HealthAuditLog> {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const auditLog: HealthAuditLog = { ...entry, id, timestamp };

    await this.db.query(
      `INSERT INTO ${this.tableName} (
        id, timestamp, actor_user_id, actor_user_name, actor_role, actor_session_id,
        actor_ip_hash, action, resource_type, resource_id, resource_patient_id,
        resource_description, access_method, outcome, denial_reason, phi_accessed,
        fields_accessed, changes, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        timestamp,
        entry.actor.userId,
        entry.actor.userName ?? null,
        entry.actor.role,
        entry.actor.sessionId ?? null,
        entry.actor.ipAddressHash,
        entry.action,
        entry.resource.type,
        entry.resource.id,
        entry.resource.patientId ?? null,
        entry.resource.description ?? null,
        entry.accessMethod,
        entry.outcome,
        entry.denialReason ?? null,
        entry.phiAccessed ? 1 : 0,
        entry.fieldsAccessed ? JSON.stringify(entry.fieldsAccessed) : null,
        entry.changes ? JSON.stringify(entry.changes) : null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ]
    );

    return auditLog;
  }

  async logBatch(entries: Array<Omit<HealthAuditLog, 'id' | 'timestamp'>>): Promise<HealthAuditLog[]> {
    this.batchBuffer.push(...entries);

    if (this.batchBuffer.length >= this.batchSize) {
      return this.flushBatch();
    }

    // Return placeholder logs with generated IDs
    const now = Date.now();
    return entries.map((e) => ({ ...e, id: crypto.randomUUID(), timestamp: now }));
  }

  private async flushBatch(): Promise<HealthAuditLog[]> {
    if (this.batchBuffer.length === 0) return [];

    const entries = this.batchBuffer.splice(0, this.batchBuffer.length);
    const logs: HealthAuditLog[] = [];
    const now = Date.now();

    const tx = await this.db.beginTransaction();
    try {
      for (const entry of entries) {
        const id = crypto.randomUUID();
        await tx.query(
          `INSERT INTO ${this.tableName} (
            id, timestamp, actor_user_id, actor_user_name, actor_role, actor_session_id,
            actor_ip_hash, action, resource_type, resource_id, resource_patient_id,
            resource_description, access_method, outcome, denial_reason, phi_accessed,
            fields_accessed, changes, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            now,
            entry.actor.userId,
            entry.actor.userName ?? null,
            entry.actor.role,
            entry.actor.sessionId ?? null,
            entry.actor.ipAddressHash,
            entry.action,
            entry.resource.type,
            entry.resource.id,
            entry.resource.patientId ?? null,
            entry.resource.description ?? null,
            entry.accessMethod,
            entry.outcome,
            entry.denialReason ?? null,
            entry.phiAccessed ? 1 : 0,
            entry.fieldsAccessed ? JSON.stringify(entry.fieldsAccessed) : null,
            entry.changes ? JSON.stringify(entry.changes) : null,
            entry.metadata ? JSON.stringify(entry.metadata) : null,
          ]
        );
        logs.push({ ...entry, id, timestamp: now });
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }

    return logs;
  }

  async get(id: string): Promise<HealthAuditLog | null> {
    const result = await this.db.query<AuditLogRow>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async query(options: HealthAuditQueryOptions): Promise<HealthAuditQueryResult> {
    const { conditions, values } = this.buildQuery(options);
    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderDir = options.orderDirection ?? 'desc';
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const countResult = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereSQL}`,
      values
    );
    const total = countResult.rows[0]?.count ?? 0;

    const result = await this.db.query<AuditLogRow>(
      `SELECT * FROM ${this.tableName} ${whereSQL}
       ORDER BY timestamp ${orderDir.toUpperCase()} LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return {
      logs: result.rows.map((row) => this.mapRow(row)),
      total,
      hasMore: offset + result.rows.length < total,
    };
  }

  async count(options: HealthAuditQueryOptions): Promise<number> {
    const { conditions, values } = this.buildQuery(options);
    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereSQL}`,
      values
    );

    return result.rows[0]?.count ?? 0;
  }

  async getStats(options: HealthAuditQueryOptions = {}): Promise<HealthAuditStats> {
    const { conditions, values } = this.buildQuery(options);
    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const allLogs = await this.db.query<AuditLogRow>(
      `SELECT * FROM ${this.tableName} ${whereSQL}`,
      values
    );

    const logsByAction: Record<string, number> = {};
    const logsByResourceType: Record<string, number> = {};
    const logsByOutcome: Record<string, number> = {};
    const logsByRole: Record<string, number> = {};
    const userCounts: Record<string, number> = {};
    const patientCounts: Record<string, number> = {};
    const dayCounts: Record<string, number> = {};
    let phiAccessCount = 0;
    let deniedAccessCount = 0;

    for (const row of allLogs.rows) {
      logsByAction[row.action] = (logsByAction[row.action] ?? 0) + 1;
      logsByResourceType[row.resource_type] = (logsByResourceType[row.resource_type] ?? 0) + 1;
      logsByOutcome[row.outcome] = (logsByOutcome[row.outcome] ?? 0) + 1;
      logsByRole[row.actor_role] = (logsByRole[row.actor_role] ?? 0) + 1;
      userCounts[row.actor_user_id] = (userCounts[row.actor_user_id] ?? 0) + 1;

      if (row.resource_patient_id) {
        patientCounts[row.resource_patient_id] = (patientCounts[row.resource_patient_id] ?? 0) + 1;
      }

      const date = new Date(row.timestamp).toISOString().split('T')[0];
      dayCounts[date] = (dayCounts[date] ?? 0) + 1;

      if (row.phi_accessed === 1) phiAccessCount++;
      if (row.outcome === 'denied') deniedAccessCount++;
    }

    return {
      totalLogs: allLogs.rows.length,
      logsByAction,
      logsByResourceType,
      logsByOutcome,
      logsByRole,
      phiAccessCount,
      deniedAccessCount,
      topUsers: Object.entries(userCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([userId, count]) => ({ userId, count })),
      topPatients: Object.entries(patientCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([patientId, count]) => ({ patientId, count })),
      logsPerDay: Object.entries(dayCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-30)
        .map(([date, count]) => ({ date, count })),
    };
  }

  async export(options: HealthAuditQueryOptions): Promise<HealthAuditLog[]> {
    const result = await this.query({ ...options, limit: 100000 });
    return result.logs;
  }

  async exportForPatient(
    patientId: PatientId,
    startTime?: number,
    endTime?: number
  ): Promise<HealthAuditLog[]> {
    return this.export({
      patientId,
      startTime,
      endTime,
      limit: 100000,
    });
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE timestamp < ?`,
      [timestamp]
    );
    return result.rowCount ?? 0;
  }

  async getRetentionStats(): Promise<{
    totalLogs: number;
    oldestLog: number | null;
    newestLog: number | null;
  }> {
    const countResult = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName}`
    );
    const rangeResult = await this.db.query<{ oldest: number | null; newest: number | null }>(
      `SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM ${this.tableName}`
    );

    return {
      totalLogs: countResult.rows[0]?.count ?? 0,
      oldestLog: rangeResult.rows[0]?.oldest ?? null,
      newestLog: rangeResult.rows[0]?.newest ?? null,
    };
  }

  async getPatientAccessHistory(patientId: PatientId, limit = 100): Promise<HealthAuditLog[]> {
    const result = await this.db.query<AuditLogRow>(
      `SELECT * FROM ${this.tableName}
       WHERE resource_patient_id = ?
       ORDER BY timestamp DESC LIMIT ?`,
      [patientId, limit]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async getUserActivityLog(userId: string, limit = 100): Promise<HealthAuditLog[]> {
    const result = await this.db.query<AuditLogRow>(
      `SELECT * FROM ${this.tableName}
       WHERE actor_user_id = ?
       ORDER BY timestamp DESC LIMIT ?`,
      [userId, limit]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async getDeniedAccessAttempts(startTime?: number, endTime?: number): Promise<HealthAuditLog[]> {
    let query = `SELECT * FROM ${this.tableName} WHERE outcome = 'denied'`;
    const values: unknown[] = [];

    if (startTime) {
      query += ' AND timestamp >= ?';
      values.push(startTime);
    }
    if (endTime) {
      query += ' AND timestamp <= ?';
      values.push(endTime);
    }

    query += ' ORDER BY timestamp DESC';

    const result = await this.db.query<AuditLogRow>(query, values);
    return result.rows.map((row) => this.mapRow(row));
  }

  async getPHIAccessLogs(startTime?: number, endTime?: number): Promise<HealthAuditLog[]> {
    let query = `SELECT * FROM ${this.tableName} WHERE phi_accessed = 1`;
    const values: unknown[] = [];

    if (startTime) {
      query += ' AND timestamp >= ?';
      values.push(startTime);
    }
    if (endTime) {
      query += ' AND timestamp <= ?';
      values.push(endTime);
    }

    query += ' ORDER BY timestamp DESC';

    const result = await this.db.query<AuditLogRow>(query, values);
    return result.rows.map((row) => this.mapRow(row));
  }

  async shutdown(): Promise<void> {
    if (this.batchTimeout) {
      clearInterval(this.batchTimeout);
      this.batchTimeout = null;
    }
    await this.flushBatch();
  }

  private buildQuery(options: HealthAuditQueryOptions): {
    conditions: string[];
    values: unknown[];
  } {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (options.actorId) {
      conditions.push('actor_user_id = ?');
      values.push(options.actorId);
    }
    if (options.action) {
      if (Array.isArray(options.action)) {
        conditions.push(`action IN (${options.action.map(() => '?').join(', ')})`);
        values.push(...options.action);
      } else {
        conditions.push('action = ?');
        values.push(options.action);
      }
    }
    if (options.resourceType) {
      conditions.push('resource_type = ?');
      values.push(options.resourceType);
    }
    if (options.patientId) {
      conditions.push('resource_patient_id = ?');
      values.push(options.patientId);
    }
    if (options.outcome) {
      conditions.push('outcome = ?');
      values.push(options.outcome);
    }
    if (options.startTime) {
      conditions.push('timestamp >= ?');
      values.push(options.startTime);
    }
    if (options.endTime) {
      conditions.push('timestamp <= ?');
      values.push(options.endTime);
    }
    if (options.phiOnly) {
      conditions.push('phi_accessed = 1');
    }

    return { conditions, values };
  }

  private mapRow(row: AuditLogRow): HealthAuditLog {
    return {
      id: row.id,
      timestamp: row.timestamp,
      actor: {
        userId: row.actor_user_id,
        userName: row.actor_user_name ?? undefined,
        role: row.actor_role as AccessLevel,
        sessionId: row.actor_session_id ?? undefined,
        ipAddressHash: row.actor_ip_hash,
      },
      action: row.action as AuditAction,
      resource: {
        type: row.resource_type as ResourceType,
        id: row.resource_id,
        patientId: row.resource_patient_id ?? undefined,
        description: row.resource_description ?? undefined,
      },
      accessMethod: row.access_method as HealthAuditLog['accessMethod'],
      outcome: row.outcome as HealthAuditLog['outcome'],
      denialReason: row.denial_reason ?? undefined,
      phiAccessed: row.phi_accessed === 1,
      fieldsAccessed: row.fields_accessed ? JSON.parse(row.fields_accessed) : undefined,
      changes: row.changes ? JSON.parse(row.changes) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryHealthAuditStore implements HealthAuditStore {
  private logs = new Map<string, HealthAuditLog>();
  private readonly maxLogs: number;

  constructor(maxLogs = 100000) {
    this.maxLogs = maxLogs;
  }

  async initialize(): Promise<void> {}

  async log(entry: Omit<HealthAuditLog, 'id' | 'timestamp'>): Promise<HealthAuditLog> {
    // Evict oldest if at capacity
    if (this.logs.size >= this.maxLogs) {
      const oldest = Array.from(this.logs.values()).sort(
        (a, b) => a.timestamp - b.timestamp
      )[0];
      if (oldest) {
        this.logs.delete(oldest.id);
      }
    }

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const auditLog: HealthAuditLog = { ...entry, id, timestamp };
    this.logs.set(id, auditLog);
    return auditLog;
  }

  async logBatch(
    entries: Array<Omit<HealthAuditLog, 'id' | 'timestamp'>>
  ): Promise<HealthAuditLog[]> {
    const logs: HealthAuditLog[] = [];
    for (const entry of entries) {
      logs.push(await this.log(entry));
    }
    return logs;
  }

  async get(id: string): Promise<HealthAuditLog | null> {
    return this.logs.get(id) ?? null;
  }

  async query(options: HealthAuditQueryOptions): Promise<HealthAuditQueryResult> {
    let results = this.applyFilters(Array.from(this.logs.values()), options);

    const orderDir = options.orderDirection === 'asc' ? 1 : -1;
    results.sort((a, b) => (a.timestamp - b.timestamp) * orderDir);

    const total = results.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    results = results.slice(offset, offset + limit);

    return {
      logs: results,
      total,
      hasMore: offset + results.length < total,
    };
  }

  async count(options: HealthAuditQueryOptions): Promise<number> {
    const results = this.applyFilters(Array.from(this.logs.values()), options);
    return results.length;
  }

  async getStats(options: HealthAuditQueryOptions = {}): Promise<HealthAuditStats> {
    const logs = this.applyFilters(Array.from(this.logs.values()), options);

    const logsByAction: Record<string, number> = {};
    const logsByResourceType: Record<string, number> = {};
    const logsByOutcome: Record<string, number> = {};
    const logsByRole: Record<string, number> = {};
    const userCounts: Record<string, number> = {};
    const patientCounts: Record<string, number> = {};
    const dayCounts: Record<string, number> = {};
    let phiAccessCount = 0;
    let deniedAccessCount = 0;

    for (const log of logs) {
      logsByAction[log.action] = (logsByAction[log.action] ?? 0) + 1;
      logsByResourceType[log.resource.type] = (logsByResourceType[log.resource.type] ?? 0) + 1;
      logsByOutcome[log.outcome] = (logsByOutcome[log.outcome] ?? 0) + 1;
      logsByRole[log.actor.role] = (logsByRole[log.actor.role] ?? 0) + 1;
      userCounts[log.actor.userId] = (userCounts[log.actor.userId] ?? 0) + 1;

      if (log.resource.patientId) {
        patientCounts[log.resource.patientId] = (patientCounts[log.resource.patientId] ?? 0) + 1;
      }

      const date = new Date(log.timestamp).toISOString().split('T')[0];
      dayCounts[date] = (dayCounts[date] ?? 0) + 1;

      if (log.phiAccessed) phiAccessCount++;
      if (log.outcome === 'denied') deniedAccessCount++;
    }

    return {
      totalLogs: logs.length,
      logsByAction,
      logsByResourceType,
      logsByOutcome,
      logsByRole,
      phiAccessCount,
      deniedAccessCount,
      topUsers: Object.entries(userCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([userId, count]) => ({ userId, count })),
      topPatients: Object.entries(patientCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([patientId, count]) => ({ patientId, count })),
      logsPerDay: Object.entries(dayCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-30)
        .map(([date, count]) => ({ date, count })),
    };
  }

  async export(options: HealthAuditQueryOptions): Promise<HealthAuditLog[]> {
    const result = await this.query({ ...options, limit: 100000 });
    return result.logs;
  }

  async exportForPatient(
    patientId: PatientId,
    startTime?: number,
    endTime?: number
  ): Promise<HealthAuditLog[]> {
    return this.export({ patientId, startTime, endTime, limit: 100000 });
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    let count = 0;
    for (const [id, log] of this.logs) {
      if (log.timestamp < timestamp) {
        this.logs.delete(id);
        count++;
      }
    }
    return count;
  }

  async getRetentionStats(): Promise<{
    totalLogs: number;
    oldestLog: number | null;
    newestLog: number | null;
  }> {
    const logs = Array.from(this.logs.values());
    if (logs.length === 0) {
      return { totalLogs: 0, oldestLog: null, newestLog: null };
    }

    logs.sort((a, b) => a.timestamp - b.timestamp);
    return {
      totalLogs: logs.length,
      oldestLog: logs[0].timestamp,
      newestLog: logs[logs.length - 1].timestamp,
    };
  }

  async getPatientAccessHistory(patientId: PatientId, limit = 100): Promise<HealthAuditLog[]> {
    return Array.from(this.logs.values())
      .filter((l) => l.resource.patientId === patientId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  async getUserActivityLog(userId: string, limit = 100): Promise<HealthAuditLog[]> {
    return Array.from(this.logs.values())
      .filter((l) => l.actor.userId === userId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  async getDeniedAccessAttempts(startTime?: number, endTime?: number): Promise<HealthAuditLog[]> {
    return Array.from(this.logs.values())
      .filter(
        (l) =>
          l.outcome === 'denied' &&
          (!startTime || l.timestamp >= startTime) &&
          (!endTime || l.timestamp <= endTime)
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  async getPHIAccessLogs(startTime?: number, endTime?: number): Promise<HealthAuditLog[]> {
    return Array.from(this.logs.values())
      .filter(
        (l) =>
          l.phiAccessed &&
          (!startTime || l.timestamp >= startTime) &&
          (!endTime || l.timestamp <= endTime)
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  clear(): void {
    this.logs.clear();
  }

  private applyFilters(
    logs: HealthAuditLog[],
    options: HealthAuditQueryOptions
  ): HealthAuditLog[] {
    return logs.filter((log) => {
      if (options.actorId && log.actor.userId !== options.actorId) return false;
      if (options.action) {
        const actions = Array.isArray(options.action) ? options.action : [options.action];
        if (!actions.includes(log.action)) return false;
      }
      if (options.resourceType && log.resource.type !== options.resourceType) return false;
      if (options.patientId && log.resource.patientId !== options.patientId) return false;
      if (options.outcome && log.outcome !== options.outcome) return false;
      if (options.startTime && log.timestamp < options.startTime) return false;
      if (options.endTime && log.timestamp > options.endTime) return false;
      if (options.phiOnly && !log.phiAccessed) return false;
      return true;
    });
  }
}

// =============================================================================
// Row Type
// =============================================================================

interface AuditLogRow {
  id: string;
  timestamp: number;
  actor_user_id: string;
  actor_user_name: string | null;
  actor_role: string;
  actor_session_id: string | null;
  actor_ip_hash: string;
  action: string;
  resource_type: string;
  resource_id: string;
  resource_patient_id: string | null;
  resource_description: string | null;
  access_method: string;
  outcome: string;
  denial_reason: string | null;
  phi_accessed: number;
  fields_accessed: string | null;
  changes: string | null;
  metadata: string | null;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createHealthAuditStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter,
  options?: { tableName?: string; batchSize?: number; batchFlushIntervalMs?: number }
): HealthAuditStore {
  if (type === 'database') {
    if (!db) {
      throw new Error('Database adapter required for database store');
    }
    return new DatabaseHealthAuditStore(db, options);
  }
  return new InMemoryHealthAuditStore();
}
