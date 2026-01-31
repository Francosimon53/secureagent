/**
 * Sandbox Audit Logger
 *
 * Logs all sandbox executions for security auditing and compliance.
 * Critical for tracking code execution in production environments.
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import {
  SandboxAuditLogger,
  SandboxAuditEntry,
  SANDBOX_EVENTS,
} from './types.js';

// =============================================================================
// Audit Logger Configuration
// =============================================================================

export interface AuditLoggerConfig {
  /** Enable database persistence */
  persistToDatabase: boolean;

  /** Database adapter for persistence */
  databaseAdapter?: DatabaseAdapter;

  /** Maximum in-memory entries */
  maxInMemoryEntries: number;

  /** Retention period in milliseconds (default: 90 days) */
  retentionMs: number;

  /** Enable console logging */
  enableConsoleLog: boolean;
}

export interface DatabaseAdapter {
  initialize(): Promise<void>;
  insert(entry: SandboxAuditEntry): Promise<void>;
  query(options: QueryOptions): Promise<SandboxAuditEntry[]>;
  getById(id: string): Promise<SandboxAuditEntry | null>;
  deleteOlderThan(timestampMs: number): Promise<number>;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  userId?: string;
  tenantId?: string;
  startTime?: number;
  endTime?: number;
  success?: boolean;
  language?: string;
}

const DEFAULT_CONFIG: AuditLoggerConfig = {
  persistToDatabase: false,
  maxInMemoryEntries: 10000,
  retentionMs: 90 * 24 * 60 * 60 * 1000, // 90 days
  enableConsoleLog: false,
};

// =============================================================================
// In-Memory Audit Logger
// =============================================================================

export class InMemorySandboxAuditLogger extends EventEmitter implements SandboxAuditLogger {
  private config: AuditLoggerConfig;
  private entries: Map<string, SandboxAuditEntry> = new Map();
  private initialized = false;

  constructor(config?: Partial<AuditLoggerConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.persistToDatabase && this.config.databaseAdapter) {
      await this.config.databaseAdapter.initialize();
    }

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.entries.clear();
    this.initialized = false;
  }

  async log(entry: SandboxAuditEntry): Promise<void> {
    // Ensure entry has an ID
    if (!entry.id) {
      entry.id = randomUUID();
    }

    // Store in memory
    this.entries.set(entry.id, entry);

    // Persist to database if enabled
    if (this.config.persistToDatabase && this.config.databaseAdapter) {
      await this.config.databaseAdapter.insert(entry);
    }

    // Console log if enabled
    if (this.config.enableConsoleLog) {
      this.logToConsole(entry);
    }

    // Emit event
    this.emit(SANDBOX_EVENTS.AUDIT_LOG_WRITTEN, entry);

    // Prune old entries if over limit
    if (this.entries.size > this.config.maxInMemoryEntries) {
      this.pruneOldEntries();
    }
  }

  async query(options: QueryOptions): Promise<SandboxAuditEntry[]> {
    // If database is available, use it for queries
    if (this.config.persistToDatabase && this.config.databaseAdapter) {
      return this.config.databaseAdapter.query(options);
    }

    // Otherwise, query in-memory
    let results = Array.from(this.entries.values());

    // Apply filters
    if (options.userId) {
      results = results.filter((e) => e.userId === options.userId);
    }
    if (options.tenantId) {
      results = results.filter((e) => e.tenantId === options.tenantId);
    }
    if (options.startTime !== undefined) {
      results = results.filter((e) => e.startTime >= options.startTime!);
    }
    if (options.endTime !== undefined) {
      results = results.filter((e) => e.startTime <= options.endTime!);
    }
    if (options.success !== undefined) {
      results = results.filter((e) => e.success === options.success);
    }
    if (options.language) {
      results = results.filter((e) => e.language === options.language);
    }

    // Sort by start time (newest first)
    results.sort((a, b) => b.startTime - a.startTime);

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    return results.slice(offset, offset + limit);
  }

  async getEntry(id: string): Promise<SandboxAuditEntry | null> {
    // Check memory first
    const entry = this.entries.get(id);
    if (entry) return entry;

    // Check database if available
    if (this.config.persistToDatabase && this.config.databaseAdapter) {
      return this.config.databaseAdapter.getById(id);
    }

    return null;
  }

  async cleanup(maxAgeMs: number): Promise<number> {
    const cutoffTime = Date.now() - maxAgeMs;
    let cleaned = 0;

    // Clean memory
    for (const [id, entry] of this.entries) {
      if (entry.startTime < cutoffTime) {
        this.entries.delete(id);
        cleaned++;
      }
    }

    // Clean database if available
    if (this.config.persistToDatabase && this.config.databaseAdapter) {
      cleaned += await this.config.databaseAdapter.deleteOlderThan(cutoffTime);
    }

    return cleaned;
  }

  private pruneOldEntries(): void {
    // Remove oldest 10% of entries
    const entriesToRemove = Math.floor(this.config.maxInMemoryEntries * 0.1);
    const sortedEntries = Array.from(this.entries.entries()).sort(
      (a, b) => a[1].startTime - b[1].startTime
    );

    for (let i = 0; i < entriesToRemove && i < sortedEntries.length; i++) {
      this.entries.delete(sortedEntries[i][0]);
    }
  }

  private logToConsole(entry: SandboxAuditEntry): void {
    const status = entry.success ? 'SUCCESS' : 'FAILED';
    const duration = entry.durationMs ? `${entry.durationMs}ms` : 'N/A';
    const memory = entry.memoryUsedBytes
      ? `${Math.round(entry.memoryUsedBytes / 1024 / 1024)}MB`
      : 'N/A';

    console.log(
      `[SandboxAudit] ${status} | ` +
        `id=${entry.executionId.slice(0, 8)} | ` +
        `lang=${entry.language} | ` +
        `duration=${duration} | ` +
        `memory=${memory} | ` +
        `user=${entry.userId || 'anonymous'}`
    );

    if (entry.error) {
      console.log(`[SandboxAudit] Error: ${entry.error}`);
    }
  }
}

// =============================================================================
// SQLite Database Adapter
// =============================================================================

export class SQLiteAuditAdapter implements DatabaseAdapter {
  private db: any;
  private dbPath: string;
  private initialized = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import for better-sqlite3
      const Database = (await import('better-sqlite3')).default;
      this.db = new Database(this.dbPath);

      // Enable WAL mode for better performance
      this.db.pragma('journal_mode = WAL');

      // Create table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sandbox_audit_log (
          id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL,
          user_id TEXT,
          tenant_id TEXT,
          correlation_id TEXT,
          language TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          code_size_bytes INTEGER NOT NULL,
          container_id TEXT,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration_ms INTEGER,
          exit_code INTEGER,
          success INTEGER NOT NULL,
          timed_out INTEGER NOT NULL,
          oom_killed INTEGER NOT NULL,
          memory_used_bytes INTEGER,
          stdout_size_bytes INTEGER,
          stderr_size_bytes INTEGER,
          error TEXT,
          network_enabled INTEGER NOT NULL,
          resource_limits TEXT NOT NULL,
          client_ip TEXT,
          user_agent TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_sandbox_audit_user ON sandbox_audit_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_sandbox_audit_tenant ON sandbox_audit_log(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_sandbox_audit_time ON sandbox_audit_log(start_time);
        CREATE INDEX IF NOT EXISTS idx_sandbox_audit_execution ON sandbox_audit_log(execution_id);
      `);

      this.initialized = true;
    } catch (err) {
      throw new Error(`Failed to initialize audit database: ${err}`);
    }
  }

  async insert(entry: SandboxAuditEntry): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO sandbox_audit_log (
        id, execution_id, user_id, tenant_id, correlation_id,
        language, code_hash, code_size_bytes, container_id,
        start_time, end_time, duration_ms, exit_code,
        success, timed_out, oom_killed, memory_used_bytes,
        stdout_size_bytes, stderr_size_bytes, error,
        network_enabled, resource_limits, client_ip, user_agent
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    stmt.run(
      entry.id,
      entry.executionId,
      entry.userId || null,
      entry.tenantId || null,
      entry.correlationId || null,
      entry.language,
      entry.codeHash,
      entry.codeSizeBytes,
      entry.containerId || null,
      entry.startTime,
      entry.endTime || null,
      entry.durationMs || null,
      entry.exitCode ?? null,
      entry.success ? 1 : 0,
      entry.timedOut ? 1 : 0,
      entry.oomKilled ? 1 : 0,
      entry.memoryUsedBytes || null,
      entry.stdoutSizeBytes || null,
      entry.stderrSizeBytes || null,
      entry.error || null,
      entry.networkEnabled ? 1 : 0,
      JSON.stringify(entry.resourceLimits),
      entry.clientIp || null,
      entry.userAgent || null
    );
  }

  async query(options: QueryOptions): Promise<SandboxAuditEntry[]> {
    let sql = 'SELECT * FROM sandbox_audit_log WHERE 1=1';
    const params: any[] = [];

    if (options.userId) {
      sql += ' AND user_id = ?';
      params.push(options.userId);
    }
    if (options.tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(options.tenantId);
    }
    if (options.startTime !== undefined) {
      sql += ' AND start_time >= ?';
      params.push(options.startTime);
    }
    if (options.endTime !== undefined) {
      sql += ' AND start_time <= ?';
      params.push(options.endTime);
    }
    if (options.success !== undefined) {
      sql += ' AND success = ?';
      params.push(options.success ? 1 : 0);
    }
    if (options.language) {
      sql += ' AND language = ?';
      params.push(options.language);
    }

    sql += ' ORDER BY start_time DESC';
    sql += ` LIMIT ? OFFSET ?`;
    params.push(options.limit || 100, options.offset || 0);

    const rows = this.db.prepare(sql).all(...params);
    return rows.map(this.rowToEntry);
  }

  async getById(id: string): Promise<SandboxAuditEntry | null> {
    const row = this.db
      .prepare('SELECT * FROM sandbox_audit_log WHERE id = ?')
      .get(id);

    return row ? this.rowToEntry(row) : null;
  }

  async deleteOlderThan(timestampMs: number): Promise<number> {
    const result = this.db
      .prepare('DELETE FROM sandbox_audit_log WHERE start_time < ?')
      .run(timestampMs);

    return result.changes;
  }

  private rowToEntry(row: any): SandboxAuditEntry {
    return {
      id: row.id,
      executionId: row.execution_id,
      userId: row.user_id || undefined,
      tenantId: row.tenant_id || undefined,
      correlationId: row.correlation_id || undefined,
      language: row.language,
      codeHash: row.code_hash,
      codeSizeBytes: row.code_size_bytes,
      containerId: row.container_id || undefined,
      startTime: row.start_time,
      endTime: row.end_time || undefined,
      durationMs: row.duration_ms || undefined,
      exitCode: row.exit_code ?? undefined,
      success: row.success === 1,
      timedOut: row.timed_out === 1,
      oomKilled: row.oom_killed === 1,
      memoryUsedBytes: row.memory_used_bytes || undefined,
      stdoutSizeBytes: row.stdout_size_bytes || undefined,
      stderrSizeBytes: row.stderr_size_bytes || undefined,
      error: row.error || undefined,
      networkEnabled: row.network_enabled === 1,
      resourceLimits: JSON.parse(row.resource_limits),
      clientIp: row.client_ip || undefined,
      userAgent: row.user_agent || undefined,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createAuditLogger(config?: Partial<AuditLoggerConfig>): SandboxAuditLogger {
  return new InMemorySandboxAuditLogger(config);
}

export function createSQLiteAuditAdapter(dbPath: string): DatabaseAdapter {
  return new SQLiteAuditAdapter(dbPath);
}
