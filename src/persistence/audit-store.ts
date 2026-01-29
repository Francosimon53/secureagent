import { getDatabase, type DatabaseManager } from './database.js';
import type { AuditEvent, AuditEventType } from '../security/types.js';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'AuditStore' });

// ============================================================================
// Audit Store Types
// ============================================================================

/**
 * Audit query filters
 */
export interface AuditQueryFilters {
  /** Filter by event type */
  eventType?: AuditEventType | AuditEventType[];
  /** Filter by severity */
  severity?: 'info' | 'warn' | 'error' | 'critical' | Array<'info' | 'warn' | 'error' | 'critical'>;
  /** Filter by user ID */
  userId?: string;
  /** Filter by resource type */
  resourceType?: string;
  /** Filter by action */
  action?: string;
  /** Filter by outcome */
  outcome?: 'success' | 'failure' | 'blocked';
  /** Start timestamp (inclusive) */
  startTime?: number;
  /** End timestamp (inclusive) */
  endTime?: number;
  /** Search in details (JSON contains) */
  detailsContain?: Record<string, unknown>;
  /** Filter by risk indicators */
  hasRiskIndicators?: boolean;
}

/**
 * Audit query options
 */
export interface AuditQueryOptions {
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort order */
  orderBy?: 'timestamp' | 'severity';
  /** Sort direction */
  orderDir?: 'asc' | 'desc';
}

/**
 * Audit query result
 */
export interface AuditQueryResult {
  events: AuditEvent[];
  total: number;
  hasMore: boolean;
}

/**
 * Audit statistics
 */
export interface AuditStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  eventsByOutcome: Record<string, number>;
  eventsPerDay: Array<{ date: string; count: number }>;
  topUsers: Array<{ userId: string; count: number }>;
  topActions: Array<{ action: string; count: number }>;
  riskIndicatorCounts: Record<string, number>;
}

// ============================================================================
// Audit Store Interface
// ============================================================================

/**
 * Audit store interface
 */
export interface AuditStore {
  /** Initialize the store */
  initialize(): Promise<void>;
  /** Store an audit event */
  store(event: AuditEvent): Promise<void>;
  /** Store multiple events in batch */
  storeBatch(events: AuditEvent[]): Promise<void>;
  /** Query audit events */
  query(filters: AuditQueryFilters, options?: AuditQueryOptions): Promise<AuditQueryResult>;
  /** Get a single event by ID */
  get(eventId: string): Promise<AuditEvent | null>;
  /** Get audit statistics */
  getStats(filters?: AuditQueryFilters): Promise<AuditStats>;
  /** Delete old audit events */
  deleteOlderThan(timestamp: number): Promise<number>;
  /** Export events to JSON */
  export(filters: AuditQueryFilters): Promise<AuditEvent[]>;
  /** Count events matching filters */
  count(filters: AuditQueryFilters): Promise<number>;
}

// ============================================================================
// Database Audit Store
// ============================================================================

/**
 * Database-backed audit store
 */
export class DatabaseAuditStore implements AuditStore {
  private readonly db: DatabaseManager;
  private readonly tableName: string;
  private initialized = false;
  private readonly batchBuffer: AuditEvent[] = [];
  private readonly batchSize: number;
  private batchTimeout: NodeJS.Timeout | null = null;

  constructor(options: {
    tableName?: string;
    batchSize?: number;
    batchFlushIntervalMs?: number;
  } = {}) {
    this.db = getDatabase();
    this.tableName = options.tableName ?? 'audit_events';
    this.batchSize = options.batchSize ?? 100;

    // Set up batch flush interval
    if (options.batchFlushIntervalMs) {
      this.batchTimeout = setInterval(
        () => this.flushBatch(),
        options.batchFlushIntervalMs
      );
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        event_id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        actor_user_id TEXT,
        actor_session_id TEXT,
        actor_ip_address TEXT,
        actor_user_agent TEXT,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        resource_name TEXT,
        action TEXT NOT NULL,
        outcome TEXT NOT NULL,
        details TEXT,
        risk_indicators TEXT
      )
    `);

    // Create indexes
    await this.createIndexes();

    this.initialized = true;
    logger.info({ tableName: this.tableName }, 'Audit store initialized');
  }

  private async createIndexes(): Promise<void> {
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_timestamp ON ${this.tableName}(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_event_type ON ${this.tableName}(event_type)`,
      `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_severity ON ${this.tableName}(severity)`,
      `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_user ON ${this.tableName}(actor_user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_resource ON ${this.tableName}(resource_type)`,
      `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_action ON ${this.tableName}(action)`,
      `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_outcome ON ${this.tableName}(outcome)`,
    ];

    for (const sql of indexes) {
      await this.db.query(sql).catch(() => {});
    }
  }

  async store(event: AuditEvent): Promise<void> {
    await this.ensureInitialized();

    await this.db.query(
      `INSERT INTO ${this.tableName}
       (event_id, timestamp, event_type, severity,
        actor_user_id, actor_session_id, actor_ip_address, actor_user_agent,
        resource_type, resource_id, resource_name,
        action, outcome, details, risk_indicators)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.eventId,
        event.timestamp,
        event.eventType,
        event.severity,
        event.actor.userId ?? null,
        event.actor.sessionId ?? null,
        event.actor.ipAddress ?? null,
        event.actor.userAgent ?? null,
        event.resource.type,
        event.resource.id ?? null,
        event.resource.name ?? null,
        event.action,
        event.outcome,
        event.details ? JSON.stringify(event.details) : null,
        event.riskIndicators ? JSON.stringify(event.riskIndicators) : null,
      ]
    );
  }

  async storeBatch(events: AuditEvent[]): Promise<void> {
    await this.ensureInitialized();

    // Add to buffer
    this.batchBuffer.push(...events);

    // Flush if buffer is full
    if (this.batchBuffer.length >= this.batchSize) {
      await this.flushBatch();
    }
  }

  private async flushBatch(): Promise<void> {
    if (this.batchBuffer.length === 0) return;

    const events = this.batchBuffer.splice(0, this.batchBuffer.length);

    const tx = await this.db.beginTransaction();
    try {
      for (const event of events) {
        await tx.query(
          `INSERT INTO ${this.tableName}
           (event_id, timestamp, event_type, severity,
            actor_user_id, actor_session_id, actor_ip_address, actor_user_agent,
            resource_type, resource_id, resource_name,
            action, outcome, details, risk_indicators)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            event.eventId,
            event.timestamp,
            event.eventType,
            event.severity,
            event.actor.userId ?? null,
            event.actor.sessionId ?? null,
            event.actor.ipAddress ?? null,
            event.actor.userAgent ?? null,
            event.resource.type,
            event.resource.id ?? null,
            event.resource.name ?? null,
            event.action,
            event.outcome,
            event.details ? JSON.stringify(event.details) : null,
            event.riskIndicators ? JSON.stringify(event.riskIndicators) : null,
          ]
        );
      }
      await tx.commit();
      logger.debug({ count: events.length }, 'Audit batch flushed');
    } catch (error) {
      await tx.rollback();
      logger.error({ error, count: events.length }, 'Failed to flush audit batch');
      throw error;
    }
  }

  async query(
    filters: AuditQueryFilters,
    options: AuditQueryOptions = {}
  ): Promise<AuditQueryResult> {
    await this.ensureInitialized();

    const { whereClauses, params } = this.buildWhereClause(filters);
    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const orderBy = options.orderBy ?? 'timestamp';
    const orderDir = options.orderDir ?? 'desc';
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    // Get total count
    const countResult = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereSQL}`,
      params
    );
    const total = countResult.rows[0]?.count ?? 0;

    // Get events
    const result = await this.db.query<AuditEventRow>(
      `SELECT * FROM ${this.tableName} ${whereSQL}
       ORDER BY ${orderBy} ${orderDir.toUpperCase()}
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return {
      events: result.rows.map(row => this.rowToEvent(row)),
      total,
      hasMore: offset + result.rows.length < total,
    };
  }

  async get(eventId: string): Promise<AuditEvent | null> {
    await this.ensureInitialized();

    const result = await this.db.query<AuditEventRow>(
      `SELECT * FROM ${this.tableName} WHERE event_id = ?`,
      [eventId]
    );

    if (result.rows.length === 0) return null;

    return this.rowToEvent(result.rows[0]);
  }

  async getStats(filters: AuditQueryFilters = {}): Promise<AuditStats> {
    await this.ensureInitialized();

    const { whereClauses, params } = this.buildWhereClause(filters);
    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total count
    const totalResult = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereSQL}`,
      params
    );
    const totalEvents = totalResult.rows[0]?.count ?? 0;

    // For in-memory DB, we need to compute stats from all events
    const allEvents = await this.db.query<AuditEventRow>(
      `SELECT * FROM ${this.tableName} ${whereSQL}`,
      params
    );

    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};
    const eventsByOutcome: Record<string, number> = {};
    const userCounts: Record<string, number> = {};
    const actionCounts: Record<string, number> = {};
    const dayCounts: Record<string, number> = {};
    const riskIndicatorCounts: Record<string, number> = {};

    for (const row of allEvents.rows) {
      // By type
      eventsByType[row.event_type] = (eventsByType[row.event_type] ?? 0) + 1;

      // By severity
      eventsBySeverity[row.severity] = (eventsBySeverity[row.severity] ?? 0) + 1;

      // By outcome
      eventsByOutcome[row.outcome] = (eventsByOutcome[row.outcome] ?? 0) + 1;

      // By user
      if (row.actor_user_id) {
        userCounts[row.actor_user_id] = (userCounts[row.actor_user_id] ?? 0) + 1;
      }

      // By action
      actionCounts[row.action] = (actionCounts[row.action] ?? 0) + 1;

      // By day
      const date = new Date(row.timestamp).toISOString().split('T')[0];
      dayCounts[date] = (dayCounts[date] ?? 0) + 1;

      // Risk indicators
      if (row.risk_indicators) {
        const indicators = JSON.parse(row.risk_indicators) as string[];
        for (const indicator of indicators) {
          riskIndicatorCounts[indicator] = (riskIndicatorCounts[indicator] ?? 0) + 1;
        }
      }
    }

    // Sort and limit top users
    const topUsers = Object.entries(userCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, count }));

    // Sort and limit top actions
    const topActions = Object.entries(actionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([action, count]) => ({ action, count }));

    // Sort days
    const eventsPerDay = Object.entries(dayCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30) // Last 30 days
      .map(([date, count]) => ({ date, count }));

    return {
      totalEvents,
      eventsByType,
      eventsBySeverity,
      eventsByOutcome,
      eventsPerDay,
      topUsers,
      topActions,
      riskIndicatorCounts,
    };
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    await this.ensureInitialized();

    const result = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE timestamp < ?`,
      [timestamp]
    );

    if (result.rowCount > 0) {
      logger.info({ count: result.rowCount, olderThan: new Date(timestamp).toISOString() }, 'Old audit events deleted');
    }

    return result.rowCount;
  }

  async export(filters: AuditQueryFilters): Promise<AuditEvent[]> {
    const result = await this.query(filters, { limit: 100000 });
    return result.events;
  }

  async count(filters: AuditQueryFilters): Promise<number> {
    await this.ensureInitialized();

    const { whereClauses, params } = this.buildWhereClause(filters);
    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereSQL}`,
      params
    );

    return result.rows[0]?.count ?? 0;
  }

  /**
   * Shutdown the store (flush pending batches)
   */
  async shutdown(): Promise<void> {
    if (this.batchTimeout) {
      clearInterval(this.batchTimeout);
      this.batchTimeout = null;
    }

    await this.flushBatch();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private buildWhereClause(filters: AuditQueryFilters): {
    whereClauses: string[];
    params: unknown[];
  } {
    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (filters.eventType) {
      if (Array.isArray(filters.eventType)) {
        whereClauses.push(`event_type IN (${filters.eventType.map(() => '?').join(', ')})`);
        params.push(...filters.eventType);
      } else {
        whereClauses.push('event_type = ?');
        params.push(filters.eventType);
      }
    }

    if (filters.severity) {
      if (Array.isArray(filters.severity)) {
        whereClauses.push(`severity IN (${filters.severity.map(() => '?').join(', ')})`);
        params.push(...filters.severity);
      } else {
        whereClauses.push('severity = ?');
        params.push(filters.severity);
      }
    }

    if (filters.userId) {
      whereClauses.push('actor_user_id = ?');
      params.push(filters.userId);
    }

    if (filters.resourceType) {
      whereClauses.push('resource_type = ?');
      params.push(filters.resourceType);
    }

    if (filters.action) {
      whereClauses.push('action = ?');
      params.push(filters.action);
    }

    if (filters.outcome) {
      whereClauses.push('outcome = ?');
      params.push(filters.outcome);
    }

    if (filters.startTime !== undefined) {
      whereClauses.push('timestamp >= ?');
      params.push(filters.startTime);
    }

    if (filters.endTime !== undefined) {
      whereClauses.push('timestamp <= ?');
      params.push(filters.endTime);
    }

    if (filters.hasRiskIndicators) {
      whereClauses.push('risk_indicators IS NOT NULL');
    }

    return { whereClauses, params };
  }

  private rowToEvent(row: AuditEventRow): AuditEvent {
    return {
      eventId: row.event_id,
      timestamp: row.timestamp,
      eventType: row.event_type as AuditEventType,
      severity: row.severity as 'info' | 'warn' | 'error' | 'critical',
      actor: {
        userId: row.actor_user_id ?? undefined,
        sessionId: row.actor_session_id ?? undefined,
        ipAddress: row.actor_ip_address ?? undefined,
        userAgent: row.actor_user_agent ?? undefined,
      },
      resource: {
        type: row.resource_type,
        id: row.resource_id ?? undefined,
        name: row.resource_name ?? undefined,
      },
      action: row.action,
      outcome: row.outcome as 'success' | 'failure' | 'blocked',
      details: row.details ? JSON.parse(row.details) : undefined,
      riskIndicators: row.risk_indicators ? JSON.parse(row.risk_indicators) : undefined,
    };
  }
}

// Database row type
interface AuditEventRow {
  event_id: string;
  timestamp: number;
  event_type: string;
  severity: string;
  actor_user_id: string | null;
  actor_session_id: string | null;
  actor_ip_address: string | null;
  actor_user_agent: string | null;
  resource_type: string;
  resource_id: string | null;
  resource_name: string | null;
  action: string;
  outcome: string;
  details: string | null;
  risk_indicators: string | null;
}

// ============================================================================
// In-Memory Audit Store
// ============================================================================

/**
 * In-memory audit store for testing
 */
export class MemoryAuditStore implements AuditStore {
  private readonly events = new Map<string, AuditEvent>();
  private readonly maxEvents: number;

  constructor(maxEvents: number = 10000) {
    this.maxEvents = maxEvents;
  }

  async initialize(): Promise<void> {}

  async store(event: AuditEvent): Promise<void> {
    // Evict oldest if at capacity
    if (this.events.size >= this.maxEvents) {
      const oldest = Array.from(this.events.values())
        .sort((a, b) => a.timestamp - b.timestamp)[0];
      if (oldest) {
        this.events.delete(oldest.eventId);
      }
    }

    this.events.set(event.eventId, { ...event });
  }

  async storeBatch(events: AuditEvent[]): Promise<void> {
    for (const event of events) {
      await this.store(event);
    }
  }

  async query(
    filters: AuditQueryFilters,
    options: AuditQueryOptions = {}
  ): Promise<AuditQueryResult> {
    let events = Array.from(this.events.values());

    // Apply filters
    events = this.applyFilters(events, filters);

    // Sort
    const orderBy = options.orderBy ?? 'timestamp';
    const orderDir = options.orderDir ?? 'desc';
    events.sort((a, b) => {
      const aVal = orderBy === 'timestamp' ? a.timestamp : a.severity;
      const bVal = orderBy === 'timestamp' ? b.timestamp : b.severity;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return orderDir === 'desc' ? -cmp : cmp;
    });

    const total = events.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;

    events = events.slice(offset, offset + limit);

    return {
      events,
      total,
      hasMore: offset + events.length < total,
    };
  }

  async get(eventId: string): Promise<AuditEvent | null> {
    const event = this.events.get(eventId);
    return event ? { ...event } : null;
  }

  async getStats(filters: AuditQueryFilters = {}): Promise<AuditStats> {
    let events = Array.from(this.events.values());
    events = this.applyFilters(events, filters);

    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};
    const eventsByOutcome: Record<string, number> = {};
    const userCounts: Record<string, number> = {};
    const actionCounts: Record<string, number> = {};
    const dayCounts: Record<string, number> = {};
    const riskIndicatorCounts: Record<string, number> = {};

    for (const event of events) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] ?? 0) + 1;
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] ?? 0) + 1;
      eventsByOutcome[event.outcome] = (eventsByOutcome[event.outcome] ?? 0) + 1;

      if (event.actor.userId) {
        userCounts[event.actor.userId] = (userCounts[event.actor.userId] ?? 0) + 1;
      }

      actionCounts[event.action] = (actionCounts[event.action] ?? 0) + 1;

      const date = new Date(event.timestamp).toISOString().split('T')[0];
      dayCounts[date] = (dayCounts[date] ?? 0) + 1;

      if (event.riskIndicators) {
        for (const indicator of event.riskIndicators) {
          riskIndicatorCounts[indicator] = (riskIndicatorCounts[indicator] ?? 0) + 1;
        }
      }
    }

    return {
      totalEvents: events.length,
      eventsByType,
      eventsBySeverity,
      eventsByOutcome,
      eventsPerDay: Object.entries(dayCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, count]) => ({ date, count })),
      topUsers: Object.entries(userCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([userId, count]) => ({ userId, count })),
      topActions: Object.entries(actionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([action, count]) => ({ action, count })),
      riskIndicatorCounts,
    };
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    let count = 0;
    for (const [id, event] of this.events) {
      if (event.timestamp < timestamp) {
        this.events.delete(id);
        count++;
      }
    }
    return count;
  }

  async export(filters: AuditQueryFilters): Promise<AuditEvent[]> {
    const result = await this.query(filters, { limit: 100000 });
    return result.events;
  }

  async count(filters: AuditQueryFilters): Promise<number> {
    const events = this.applyFilters(Array.from(this.events.values()), filters);
    return events.length;
  }

  /** Clear all events (for testing) */
  clear(): void {
    this.events.clear();
  }

  private applyFilters(events: AuditEvent[], filters: AuditQueryFilters): AuditEvent[] {
    return events.filter(event => {
      if (filters.eventType) {
        const types = Array.isArray(filters.eventType) ? filters.eventType : [filters.eventType];
        if (!types.includes(event.eventType)) return false;
      }

      if (filters.severity) {
        const severities = Array.isArray(filters.severity) ? filters.severity : [filters.severity];
        if (!severities.includes(event.severity)) return false;
      }

      if (filters.userId && event.actor.userId !== filters.userId) return false;
      if (filters.resourceType && event.resource.type !== filters.resourceType) return false;
      if (filters.action && event.action !== filters.action) return false;
      if (filters.outcome && event.outcome !== filters.outcome) return false;
      if (filters.startTime !== undefined && event.timestamp < filters.startTime) return false;
      if (filters.endTime !== undefined && event.timestamp > filters.endTime) return false;
      if (filters.hasRiskIndicators && (!event.riskIndicators || event.riskIndicators.length === 0)) return false;

      return true;
    });
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an audit store based on type
 */
export function createAuditStore(type: 'memory' | 'database' = 'database'): AuditStore {
  switch (type) {
    case 'memory':
      return new MemoryAuditStore();
    case 'database':
      return new DatabaseAuditStore();
    default:
      throw new Error(`Unknown audit store type: ${type}`);
  }
}
