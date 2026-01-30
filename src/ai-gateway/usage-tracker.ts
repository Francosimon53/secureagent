/**
 * Usage Tracker
 *
 * Records and analyzes AI API usage for reporting and optimization
 */

import { randomUUID } from 'crypto';
import type {
  UsageRecord,
  UsageSummary,
  ProviderUsageSummary,
  ModelUsageSummary,
  AIProvider,
  AIResponse,
} from './types.js';
import { AIGatewayError } from './types.js';
import { AI_GATEWAY_EVENTS, TABLE_NAMES } from './constants.js';

// =============================================================================
// Database Adapter Interface
// =============================================================================

export interface DatabaseAdapter {
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

// =============================================================================
// Usage Store Interface
// =============================================================================

export interface UsageQueryOptions {
  userId?: string;
  teamId?: string;
  provider?: AIProvider;
  model?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

export interface UsageStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Record usage */
  record(record: Omit<UsageRecord, 'id'>): Promise<UsageRecord>;

  /** Get usage records */
  getRecords(options: UsageQueryOptions): Promise<UsageRecord[]>;

  /** Get usage summary */
  getSummary(options: UsageQueryOptions): Promise<UsageSummary>;

  /** Get total cost */
  getTotalCost(options: UsageQueryOptions): Promise<number>;

  /** Get total tokens */
  getTotalTokens(options: UsageQueryOptions): Promise<number>;

  /** Delete old records */
  deleteOldRecords(olderThan: number): Promise<number>;
}

// =============================================================================
// Database Usage Store
// =============================================================================

interface UsageRow {
  id: string;
  user_id: string | null;
  team_id: string | null;
  request_id: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_cents: number;
  latency_ms: number;
  success: number;
  cached: number;
  metadata: string | null;
  timestamp: number;
}

export class DatabaseUsageStore implements UsageStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.USAGE_RECORDS} (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        team_id TEXT,
        request_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        cost_cents REAL NOT NULL,
        latency_ms INTEGER NOT NULL,
        success INTEGER NOT NULL,
        cached INTEGER NOT NULL DEFAULT 0,
        metadata TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_usage_user ON ${TABLE_NAMES.USAGE_RECORDS}(user_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_usage_team ON ${TABLE_NAMES.USAGE_RECORDS}(team_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON ${TABLE_NAMES.USAGE_RECORDS}(timestamp)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_usage_provider ON ${TABLE_NAMES.USAGE_RECORDS}(provider)
    `);
  }

  async record(input: Omit<UsageRecord, 'id'>): Promise<UsageRecord> {
    const record: UsageRecord = {
      ...input,
      id: randomUUID(),
    };

    await this.db.execute(
      `INSERT INTO ${TABLE_NAMES.USAGE_RECORDS} (
        id, user_id, team_id, request_id, provider, model,
        prompt_tokens, completion_tokens, total_tokens, cost_cents,
        latency_ms, success, cached, metadata, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.userId ?? null,
        record.teamId ?? null,
        record.requestId,
        record.provider,
        record.model,
        record.promptTokens,
        record.completionTokens,
        record.totalTokens,
        record.costCents,
        record.latencyMs,
        record.success ? 1 : 0,
        record.cached ? 1 : 0,
        record.metadata ? JSON.stringify(record.metadata) : null,
        record.timestamp,
      ]
    );

    return record;
  }

  async getRecords(options: UsageQueryOptions): Promise<UsageRecord[]> {
    const { sql, params } = this.buildQuery(options);
    const result = await this.db.execute<UsageRow>(sql, params);
    return result.map(row => this.rowToRecord(row));
  }

  async getSummary(options: UsageQueryOptions): Promise<UsageSummary> {
    const { conditions, params } = this.buildConditions(options);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get overall stats
    const statsResult = await this.db.execute<{
      total_requests: number;
      successful_requests: number;
      total_tokens: number;
      total_cost: number;
      avg_latency: number;
    }>(
      `SELECT
        COUNT(*) as total_requests,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_requests,
        SUM(total_tokens) as total_tokens,
        SUM(cost_cents) as total_cost,
        AVG(latency_ms) as avg_latency
      FROM ${TABLE_NAMES.USAGE_RECORDS} ${whereClause}`,
      params
    );

    // Get by provider stats
    const providerResult = await this.db.execute<{
      provider: string;
      requests: number;
      tokens: number;
      cost: number;
      avg_latency: number;
      error_rate: number;
    }>(
      `SELECT
        provider,
        COUNT(*) as requests,
        SUM(total_tokens) as tokens,
        SUM(cost_cents) as cost,
        AVG(latency_ms) as avg_latency,
        AVG(CASE WHEN success = 0 THEN 1.0 ELSE 0.0 END) as error_rate
      FROM ${TABLE_NAMES.USAGE_RECORDS} ${whereClause}
      GROUP BY provider`,
      params
    );

    // Get by model stats
    const modelResult = await this.db.execute<{
      provider: string;
      model: string;
      requests: number;
      tokens: number;
      cost: number;
      avg_latency: number;
    }>(
      `SELECT
        provider,
        model,
        COUNT(*) as requests,
        SUM(total_tokens) as tokens,
        SUM(cost_cents) as cost,
        AVG(latency_ms) as avg_latency
      FROM ${TABLE_NAMES.USAGE_RECORDS} ${whereClause}
      GROUP BY provider, model`,
      params
    );

    const stats = statsResult[0];
    const { periodStart, periodEnd } = this.getPeriodFromOptions(options);

    const byProvider: Record<AIProvider, ProviderUsageSummary> = {} as Record<AIProvider, ProviderUsageSummary>;
    for (const row of providerResult) {
      byProvider[row.provider as AIProvider] = {
        requests: row.requests,
        tokens: row.tokens,
        costCents: row.cost,
        averageLatencyMs: row.avg_latency,
        errorRate: row.error_rate,
      };
    }

    const byModel: Record<string, ModelUsageSummary> = {};
    for (const row of modelResult) {
      byModel[row.model] = {
        provider: row.provider as AIProvider,
        requests: row.requests,
        tokens: row.tokens,
        costCents: row.cost,
        averageLatencyMs: row.avg_latency,
      };
    }

    return {
      periodStart,
      periodEnd,
      totalRequests: stats.total_requests,
      successfulRequests: stats.successful_requests,
      failedRequests: stats.total_requests - stats.successful_requests,
      totalTokens: stats.total_tokens,
      totalCostCents: stats.total_cost,
      averageLatencyMs: stats.avg_latency,
      byProvider,
      byModel,
    };
  }

  async getTotalCost(options: UsageQueryOptions): Promise<number> {
    const { conditions, params } = this.buildConditions(options);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.db.execute<{ total: number }>(
      `SELECT COALESCE(SUM(cost_cents), 0) as total FROM ${TABLE_NAMES.USAGE_RECORDS} ${whereClause}`,
      params
    );

    return result[0]?.total ?? 0;
  }

  async getTotalTokens(options: UsageQueryOptions): Promise<number> {
    const { conditions, params } = this.buildConditions(options);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.db.execute<{ total: number }>(
      `SELECT COALESCE(SUM(total_tokens), 0) as total FROM ${TABLE_NAMES.USAGE_RECORDS} ${whereClause}`,
      params
    );

    return result[0]?.total ?? 0;
  }

  async deleteOldRecords(olderThan: number): Promise<number> {
    const result = await this.db.execute(
      `DELETE FROM ${TABLE_NAMES.USAGE_RECORDS} WHERE timestamp < ?`,
      [olderThan]
    );
    return (result as unknown as { changes: number }).changes;
  }

  private buildQuery(options: UsageQueryOptions): { sql: string; params: unknown[] } {
    const { conditions, params } = this.buildConditions(options);

    let sql = `SELECT * FROM ${TABLE_NAMES.USAGE_RECORDS}`;
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY timestamp DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    return { sql, params };
  }

  private buildConditions(options: UsageQueryOptions): { conditions: string[]; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }
    if (options.teamId) {
      conditions.push('team_id = ?');
      params.push(options.teamId);
    }
    if (options.provider) {
      conditions.push('provider = ?');
      params.push(options.provider);
    }
    if (options.model) {
      conditions.push('model = ?');
      params.push(options.model);
    }
    if (options.startTime) {
      conditions.push('timestamp >= ?');
      params.push(options.startTime);
    }
    if (options.endTime) {
      conditions.push('timestamp < ?');
      params.push(options.endTime);
    }

    return { conditions, params };
  }

  private getPeriodFromOptions(options: UsageQueryOptions): { periodStart: number; periodEnd: number } {
    return {
      periodStart: options.startTime ?? 0,
      periodEnd: options.endTime ?? Date.now(),
    };
  }

  private rowToRecord(row: UsageRow): UsageRecord {
    return {
      id: row.id,
      userId: row.user_id ?? undefined,
      teamId: row.team_id ?? undefined,
      requestId: row.request_id,
      provider: row.provider as AIProvider,
      model: row.model,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      totalTokens: row.total_tokens,
      costCents: row.cost_cents,
      latencyMs: row.latency_ms,
      success: row.success === 1,
      cached: row.cached === 1,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: row.timestamp,
    };
  }
}

// =============================================================================
// In-Memory Usage Store
// =============================================================================

export class InMemoryUsageStore implements UsageStore {
  private records: UsageRecord[] = [];

  async initialize(): Promise<void> {
    // No-op
  }

  async record(input: Omit<UsageRecord, 'id'>): Promise<UsageRecord> {
    const record: UsageRecord = {
      ...input,
      id: randomUUID(),
    };
    this.records.push(record);
    return { ...record };
  }

  async getRecords(options: UsageQueryOptions): Promise<UsageRecord[]> {
    let filtered = this.filterRecords(options);
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    if (options.offset) {
      filtered = filtered.slice(options.offset);
    }
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered.map(r => ({ ...r }));
  }

  async getSummary(options: UsageQueryOptions): Promise<UsageSummary> {
    const records = this.filterRecords(options);

    const byProvider: Record<AIProvider, ProviderUsageSummary> = {} as Record<AIProvider, ProviderUsageSummary>;
    const byModel: Record<string, ModelUsageSummary> = {};

    let totalLatency = 0;
    let successCount = 0;

    for (const record of records) {
      totalLatency += record.latencyMs;
      if (record.success) successCount++;

      // By provider
      if (!byProvider[record.provider]) {
        byProvider[record.provider] = {
          requests: 0,
          tokens: 0,
          costCents: 0,
          averageLatencyMs: 0,
          errorRate: 0,
        };
      }
      byProvider[record.provider].requests++;
      byProvider[record.provider].tokens += record.totalTokens;
      byProvider[record.provider].costCents += record.costCents;
      byProvider[record.provider].averageLatencyMs += record.latencyMs;

      // By model
      if (!byModel[record.model]) {
        byModel[record.model] = {
          provider: record.provider,
          requests: 0,
          tokens: 0,
          costCents: 0,
          averageLatencyMs: 0,
        };
      }
      byModel[record.model].requests++;
      byModel[record.model].tokens += record.totalTokens;
      byModel[record.model].costCents += record.costCents;
      byModel[record.model].averageLatencyMs += record.latencyMs;
    }

    // Calculate averages
    for (const provider of Object.keys(byProvider) as AIProvider[]) {
      const p = byProvider[provider];
      p.averageLatencyMs = p.requests > 0 ? p.averageLatencyMs / p.requests : 0;
      const failedCount = records.filter(r => r.provider === provider && !r.success).length;
      p.errorRate = p.requests > 0 ? failedCount / p.requests : 0;
    }

    for (const model of Object.keys(byModel)) {
      const m = byModel[model];
      m.averageLatencyMs = m.requests > 0 ? m.averageLatencyMs / m.requests : 0;
    }

    return {
      periodStart: options.startTime ?? 0,
      periodEnd: options.endTime ?? Date.now(),
      totalRequests: records.length,
      successfulRequests: successCount,
      failedRequests: records.length - successCount,
      totalTokens: records.reduce((sum, r) => sum + r.totalTokens, 0),
      totalCostCents: records.reduce((sum, r) => sum + r.costCents, 0),
      averageLatencyMs: records.length > 0 ? totalLatency / records.length : 0,
      byProvider,
      byModel,
    };
  }

  async getTotalCost(options: UsageQueryOptions): Promise<number> {
    return this.filterRecords(options).reduce((sum, r) => sum + r.costCents, 0);
  }

  async getTotalTokens(options: UsageQueryOptions): Promise<number> {
    return this.filterRecords(options).reduce((sum, r) => sum + r.totalTokens, 0);
  }

  async deleteOldRecords(olderThan: number): Promise<number> {
    const before = this.records.length;
    this.records = this.records.filter(r => r.timestamp >= olderThan);
    return before - this.records.length;
  }

  private filterRecords(options: UsageQueryOptions): UsageRecord[] {
    return this.records.filter(r => {
      if (options.userId && r.userId !== options.userId) return false;
      if (options.teamId && r.teamId !== options.teamId) return false;
      if (options.provider && r.provider !== options.provider) return false;
      if (options.model && r.model !== options.model) return false;
      if (options.startTime && r.timestamp < options.startTime) return false;
      if (options.endTime && r.timestamp >= options.endTime) return false;
      return true;
    });
  }
}

// =============================================================================
// Usage Tracker
// =============================================================================

export interface UsageTrackerConfig {
  onEvent?: (event: string, data: unknown) => void;
}

export class UsageTracker {
  constructor(
    private readonly store: UsageStore,
    private readonly config: UsageTrackerConfig = {}
  ) {}

  /**
   * Record usage from a response
   */
  async recordResponse(
    response: AIResponse,
    options?: {
      userId?: string;
      teamId?: string;
      costCents: number;
    }
  ): Promise<UsageRecord> {
    const record = await this.store.record({
      userId: options?.userId,
      teamId: options?.teamId,
      requestId: response.id,
      provider: response.provider,
      model: response.model,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
      costCents: options?.costCents ?? 0,
      latencyMs: response.latencyMs,
      success: response.finishReason !== 'error',
      cached: response.cached,
      metadata: response.metadata,
      timestamp: Date.now(),
    });

    this.emit(AI_GATEWAY_EVENTS.USAGE_RECORDED, { record });
    return record;
  }

  /**
   * Record usage manually
   */
  async record(record: Omit<UsageRecord, 'id'>): Promise<UsageRecord> {
    const created = await this.store.record(record);
    this.emit(AI_GATEWAY_EVENTS.USAGE_RECORDED, { record: created });
    return created;
  }

  /**
   * Get usage records
   */
  async getRecords(options?: UsageQueryOptions): Promise<UsageRecord[]> {
    return this.store.getRecords(options ?? {});
  }

  /**
   * Get usage summary
   */
  async getSummary(options?: UsageQueryOptions): Promise<UsageSummary> {
    const summary = await this.store.getSummary(options ?? {});
    this.emit(AI_GATEWAY_EVENTS.USAGE_SUMMARY, { summary });
    return summary;
  }

  /**
   * Get usage for a specific period
   */
  async getUsageForPeriod(
    period: 'hour' | 'day' | 'week' | 'month',
    options?: { userId?: string; teamId?: string }
  ): Promise<UsageSummary> {
    const now = Date.now();
    const periodMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    };

    return this.store.getSummary({
      userId: options?.userId,
      teamId: options?.teamId,
      startTime: now - periodMs[period],
      endTime: now,
    });
  }

  /**
   * Get total cost
   */
  async getTotalCost(options?: UsageQueryOptions): Promise<number> {
    return this.store.getTotalCost(options ?? {});
  }

  /**
   * Get total tokens
   */
  async getTotalTokens(options?: UsageQueryOptions): Promise<number> {
    return this.store.getTotalTokens(options ?? {});
  }

  /**
   * Cleanup old records
   */
  async cleanup(retentionDays: number): Promise<number> {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    return this.store.deleteOldRecords(cutoff);
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Functions
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
    throw new AIGatewayError('VALIDATION_ERROR', 'Database adapter required for database store');
  }
  return new DatabaseUsageStore(db);
}

export function createUsageTracker(
  store: UsageStore,
  config?: UsageTrackerConfig
): UsageTracker {
  return new UsageTracker(store, config);
}
