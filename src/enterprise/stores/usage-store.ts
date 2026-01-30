/**
 * Usage Store
 *
 * Persistence layer for usage tracking and metering
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from './index.js';
import type { UsageRecord, UsageAggregate, UsageMetric } from '../types.js';

// =============================================================================
// Usage Store Interface
// =============================================================================

export interface UsageQueryOptions {
  /** Filter by metric type */
  metric?: UsageMetric;
  /** Filter by user ID */
  userId?: string;
  /** Start timestamp */
  fromTimestamp?: number;
  /** End timestamp */
  toTimestamp?: number;
  /** Limit */
  limit?: number;
  /** Offset */
  offset?: number;
}

/** Input for recording usage */
export interface RecordUsageInput {
  tenantId: string;
  metric: UsageMetric;
  value: number;
  userId?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

export interface UsageStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Record a single usage event */
  recordUsage(input: RecordUsageInput): Promise<UsageRecord>;

  /** Record multiple usage events in batch */
  recordUsageBatch(records: Omit<UsageRecord, 'id'>[]): Promise<void>;

  /** Get usage records for a tenant */
  getUsageRecords(tenantId: string, options?: UsageQueryOptions): Promise<UsageRecord[]>;

  /** Get aggregated usage for a metric */
  getUsageAggregate(
    tenantId: string,
    metric: UsageMetric,
    periodStart: number,
    periodEnd: number
  ): Promise<UsageAggregate>;

  /** Get current usage for all metrics in a period */
  getCurrentUsage(tenantId: string, periodStart: number, periodEnd: number): Promise<Map<UsageMetric, number>>;

  /** Get usage count for a specific metric in a time window */
  getUsageCount(
    tenantId: string,
    metric: UsageMetric,
    windowStart: number,
    windowEnd: number
  ): Promise<number>;

  /** Delete old usage records */
  deleteOldRecords(olderThan: number): Promise<number>;

  /** Get usage trend (hourly/daily breakdown) */
  getUsageTrend(
    tenantId: string,
    metric: UsageMetric,
    periodStart: number,
    periodEnd: number,
    granularity: 'hour' | 'day'
  ): Promise<Array<{ timestamp: number; value: number }>>;
}

// =============================================================================
// Database Row Type
// =============================================================================

interface UsageRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  metric: string;
  value: number;
  timestamp: number;
  metadata: string | null;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseUsageStore implements UsageStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT,
        metric TEXT NOT NULL,
        value REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_usage_tenant_metric_time
      ON usage_records(tenant_id, metric, timestamp)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records(timestamp)
    `);
  }

  async recordUsage(input: RecordUsageInput): Promise<UsageRecord> {
    const record: UsageRecord = {
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      metric: input.metric,
      value: input.value,
      timestamp: input.timestamp ?? Date.now(),
      metadata: input.metadata,
    };

    await this.db.execute(
      `INSERT INTO usage_records (id, tenant_id, user_id, metric, value, timestamp, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.tenantId,
        record.userId ?? null,
        record.metric,
        record.value,
        record.timestamp,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );

    return record;
  }

  async recordUsageBatch(records: Omit<UsageRecord, 'id'>[]): Promise<void> {
    const now = Date.now();
    for (const record of records) {
      await this.db.execute(
        `INSERT INTO usage_records (id, tenant_id, user_id, metric, value, timestamp, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          record.tenantId,
          record.userId ?? null,
          record.metric,
          record.value,
          now,
          record.metadata ? JSON.stringify(record.metadata) : null,
        ]
      );
    }
  }

  async getUsageRecords(tenantId: string, options: UsageQueryOptions = {}): Promise<UsageRecord[]> {
    const conditions: string[] = ['tenant_id = ?'];
    const params: unknown[] = [tenantId];

    if (options.metric) {
      conditions.push('metric = ?');
      params.push(options.metric);
    }
    if (options.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }
    if (options.fromTimestamp) {
      conditions.push('timestamp >= ?');
      params.push(options.fromTimestamp);
    }
    if (options.toTimestamp) {
      conditions.push('timestamp <= ?');
      params.push(options.toTimestamp);
    }

    let sql = `SELECT * FROM usage_records WHERE ${conditions.join(' AND ')} ORDER BY timestamp DESC`;

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const result = await this.db.execute<UsageRow>(sql, params);
    return result.map(row => this.rowToRecord(row));
  }

  async getUsageAggregate(
    tenantId: string,
    metric: UsageMetric,
    periodStart: number,
    periodEnd: number
  ): Promise<UsageAggregate> {
    const result = await this.db.execute<{ total: number; count: number; avg: number; max: number; min: number }>(
      `SELECT COALESCE(SUM(value), 0) as total, COUNT(*) as count,
              COALESCE(AVG(value), 0) as avg, COALESCE(MAX(value), 0) as max, COALESCE(MIN(value), 0) as min
       FROM usage_records
       WHERE tenant_id = ? AND metric = ? AND timestamp >= ? AND timestamp <= ?`,
      [tenantId, metric, periodStart, periodEnd]
    );

    return {
      tenantId,
      metric,
      total: result[0]?.total ?? 0,
      periodStart,
      periodEnd,
      count: result[0]?.count ?? 0,
      avg: result[0]?.avg ?? 0,
      max: result[0]?.max ?? 0,
      min: result[0]?.min ?? 0,
    };
  }

  async getCurrentUsage(tenantId: string, periodStart: number, periodEnd: number): Promise<Map<UsageMetric, number>> {
    const result = await this.db.execute<{ metric: string; total: number }>(
      `SELECT metric, COALESCE(SUM(value), 0) as total
       FROM usage_records
       WHERE tenant_id = ? AND timestamp >= ? AND timestamp <= ?
       GROUP BY metric`,
      [tenantId, periodStart, periodEnd]
    );

    const usage = new Map<UsageMetric, number>();
    for (const row of result) {
      usage.set(row.metric as UsageMetric, row.total);
    }
    return usage;
  }

  async getUsageCount(
    tenantId: string,
    metric: UsageMetric,
    windowStart: number,
    windowEnd: number
  ): Promise<number> {
    const result = await this.db.execute<{ total: number }>(
      `SELECT COALESCE(SUM(value), 0) as total
       FROM usage_records
       WHERE tenant_id = ? AND metric = ? AND timestamp >= ? AND timestamp <= ?`,
      [tenantId, metric, windowStart, windowEnd]
    );
    return result[0]?.total ?? 0;
  }

  async deleteOldRecords(olderThan: number): Promise<number> {
    const result = await this.db.execute(
      'DELETE FROM usage_records WHERE timestamp < ?',
      [olderThan]
    );
    return (result as any).changes;
  }

  async getUsageTrend(
    tenantId: string,
    metric: UsageMetric,
    periodStart: number,
    periodEnd: number,
    granularity: 'hour' | 'day'
  ): Promise<Array<{ timestamp: number; value: number }>> {
    // Group by hour or day
    const divisor = granularity === 'hour' ? 3600000 : 86400000;

    const result = await this.db.execute<{ bucket: number; total: number }>(
      `SELECT (timestamp / ?) * ? as bucket, COALESCE(SUM(value), 0) as total
       FROM usage_records
       WHERE tenant_id = ? AND metric = ? AND timestamp >= ? AND timestamp <= ?
       GROUP BY bucket
       ORDER BY bucket ASC`,
      [divisor, divisor, tenantId, metric, periodStart, periodEnd]
    );

    return result.map(row => ({
      timestamp: row.bucket,
      value: row.total,
    }));
  }

  private rowToRecord(row: UsageRow): UsageRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id ?? undefined,
      metric: row.metric as UsageMetric,
      value: row.value,
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryUsageStore implements UsageStore {
  private records = new Map<string, UsageRecord>();

  async initialize(): Promise<void> {
    // No-op
  }

  async recordUsage(input: RecordUsageInput): Promise<UsageRecord> {
    const record: UsageRecord = {
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      metric: input.metric,
      value: input.value,
      timestamp: input.timestamp ?? Date.now(),
      metadata: input.metadata,
    };

    this.records.set(record.id, record);
    return { ...record };
  }

  async recordUsageBatch(records: Omit<UsageRecord, 'id'>[]): Promise<void> {
    for (const record of records) {
      const fullRecord: UsageRecord = {
        id: randomUUID(),
        tenantId: record.tenantId,
        userId: record.userId,
        metric: record.metric,
        value: record.value,
        timestamp: record.timestamp ?? Date.now(),
        metadata: record.metadata,
      };
      this.records.set(fullRecord.id, fullRecord);
    }
  }

  async getUsageRecords(tenantId: string, options: UsageQueryOptions = {}): Promise<UsageRecord[]> {
    let records = Array.from(this.records.values()).filter(r => r.tenantId === tenantId);

    if (options.metric) {
      records = records.filter(r => r.metric === options.metric);
    }
    if (options.userId) {
      records = records.filter(r => r.userId === options.userId);
    }
    if (options.fromTimestamp) {
      records = records.filter(r => r.timestamp >= options.fromTimestamp!);
    }
    if (options.toTimestamp) {
      records = records.filter(r => r.timestamp <= options.toTimestamp!);
    }

    records.sort((a, b) => b.timestamp - a.timestamp);

    if (options.offset) {
      records = records.slice(options.offset);
    }
    if (options.limit) {
      records = records.slice(0, options.limit);
    }

    return records.map(r => ({ ...r }));
  }

  async getUsageAggregate(
    tenantId: string,
    metric: UsageMetric,
    periodStart: number,
    periodEnd: number
  ): Promise<UsageAggregate> {
    const records = Array.from(this.records.values()).filter(
      r =>
        r.tenantId === tenantId &&
        r.metric === metric &&
        r.timestamp >= periodStart &&
        r.timestamp <= periodEnd
    );

    const total = records.reduce((sum, r) => sum + r.value, 0);
    const count = records.length;
    const values = records.map(r => r.value);

    return {
      tenantId,
      metric,
      total,
      periodStart,
      periodEnd,
      count,
      avg: count > 0 ? total / count : 0,
      max: count > 0 ? Math.max(...values) : 0,
      min: count > 0 ? Math.min(...values) : 0,
    };
  }

  async getCurrentUsage(tenantId: string, periodStart: number, periodEnd: number): Promise<Map<UsageMetric, number>> {
    const records = Array.from(this.records.values()).filter(
      r =>
        r.tenantId === tenantId &&
        r.timestamp >= periodStart &&
        r.timestamp <= periodEnd
    );

    const usage = new Map<UsageMetric, number>();
    for (const record of records) {
      const current = usage.get(record.metric) ?? 0;
      usage.set(record.metric, current + record.value);
    }
    return usage;
  }

  async getUsageCount(
    tenantId: string,
    metric: UsageMetric,
    windowStart: number,
    windowEnd: number
  ): Promise<number> {
    const records = Array.from(this.records.values()).filter(
      r =>
        r.tenantId === tenantId &&
        r.metric === metric &&
        r.timestamp >= windowStart &&
        r.timestamp <= windowEnd
    );
    return records.reduce((sum, r) => sum + r.value, 0);
  }

  async deleteOldRecords(olderThan: number): Promise<number> {
    let deleted = 0;
    for (const [id, record] of this.records) {
      if (record.timestamp < olderThan) {
        this.records.delete(id);
        deleted++;
      }
    }
    return deleted;
  }

  async getUsageTrend(
    tenantId: string,
    metric: UsageMetric,
    periodStart: number,
    periodEnd: number,
    granularity: 'hour' | 'day'
  ): Promise<Array<{ timestamp: number; value: number }>> {
    const records = Array.from(this.records.values()).filter(
      r =>
        r.tenantId === tenantId &&
        r.metric === metric &&
        r.timestamp >= periodStart &&
        r.timestamp <= periodEnd
    );

    const divisor = granularity === 'hour' ? 3600000 : 86400000;
    const buckets = new Map<number, number>();

    for (const record of records) {
      const bucket = Math.floor(record.timestamp / divisor) * divisor;
      const current = buckets.get(bucket) ?? 0;
      buckets.set(bucket, current + record.value);
    }

    return Array.from(buckets.entries())
      .map(([timestamp, value]) => ({ timestamp, value }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createUsageStore(type: 'memory'): InMemoryUsageStore;
export function createUsageStore(type: 'database', db: DatabaseAdapter): DatabaseUsageStore;
export function createUsageStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): UsageStore {
  if (type === 'memory') {
    return new InMemoryUsageStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseUsageStore(db);
}
