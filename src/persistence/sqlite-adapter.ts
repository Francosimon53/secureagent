import Database from 'better-sqlite3';
import { DatabaseAdapter, DatabaseConfig, QueryResult, Transaction } from './database.js';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'SQLiteAdapter' });

// ============================================================================
// SQLite Configuration
// ============================================================================

export interface SQLiteConfig extends DatabaseConfig {
  /** Path to SQLite file (use ":memory:" for in-memory) */
  filename?: string;
  /** Milliseconds to wait for lock */
  busyTimeout?: number;
  /** Journal mode */
  journalMode?: 'wal' | 'delete' | 'truncate' | 'memory' | 'off';
  /** Synchronous setting */
  synchronous?: 'off' | 'normal' | 'full' | 'extra';
  /** Cache size in pages (negative = KB) */
  cacheSize?: number;
  /** Enable foreign keys */
  foreignKeys?: boolean;
  /** Enable read-only mode */
  readonly?: boolean;
}

// ============================================================================
// SQLite Transaction
// ============================================================================

class SQLiteTransaction implements Transaction {
  private committed = false;
  private rolledBack = false;

  constructor(
    private readonly db: Database.Database,
    private readonly statementCache: Map<string, Database.Statement>
  ) {
    this.db.exec('BEGIN IMMEDIATE');
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    if (this.committed || this.rolledBack) {
      throw new Error('Transaction already completed');
    }

    const start = Date.now();

    try {
      const stmt = this.getStatement(sql);
      const isSelect = sql.trim().toUpperCase().startsWith('SELECT');

      if (isSelect) {
        const rows = stmt.all(...params) as T[];
        return {
          rows,
          rowCount: rows.length,
          duration: Date.now() - start,
        };
      } else {
        const result = stmt.run(...params);
        return {
          rows: [] as T[],
          rowCount: result.changes,
          duration: Date.now() - start,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`SQLite query failed: ${message}`);
    }
  }

  async commit(): Promise<void> {
    if (this.committed || this.rolledBack) {
      throw new Error('Transaction already completed');
    }
    this.db.exec('COMMIT');
    this.committed = true;
  }

  async rollback(): Promise<void> {
    if (this.committed || this.rolledBack) {
      return;
    }
    this.db.exec('ROLLBACK');
    this.rolledBack = true;
  }

  private getStatement(sql: string): Database.Statement {
    let stmt = this.statementCache.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.statementCache.set(sql, stmt);
    }
    return stmt;
  }
}

// ============================================================================
// SQLite Database Adapter
// ============================================================================

interface SQLiteInternalConfig {
  type: 'sqlite';
  connectionString: string;
  connectionTimeout: number;
  filename: string;
  busyTimeout: number;
  journalMode: 'wal' | 'delete' | 'truncate' | 'memory' | 'off';
  synchronous: 'off' | 'normal' | 'full' | 'extra';
  cacheSize: number;
  foreignKeys: boolean;
  readonly: boolean;
}

export class SQLiteDatabaseAdapter implements DatabaseAdapter {
  private db: Database.Database | null = null;
  private readonly config: SQLiteInternalConfig;
  private readonly statementCache = new Map<string, Database.Statement>();
  private queryCount = 0;
  private errorCount = 0;

  constructor(config: SQLiteConfig) {
    this.config = {
      type: 'sqlite',
      connectionString: config.connectionString ?? '',
      connectionTimeout: config.connectionTimeout ?? 5000,
      filename: config.filename ?? config.connectionString ?? ':memory:',
      busyTimeout: config.busyTimeout ?? 5000,
      journalMode: config.journalMode ?? 'wal',
      synchronous: config.synchronous ?? 'normal',
      cacheSize: config.cacheSize ?? -64000, // 64MB
      foreignKeys: config.foreignKeys ?? true,
      readonly: config.readonly ?? false,
    };
  }

  async connect(): Promise<void> {
    if (this.db) {
      return;
    }

    try {
      this.db = new Database(this.config.filename, {
        readonly: this.config.readonly,
        fileMustExist: false,
      });

      // Configure database
      this.db.pragma(`busy_timeout = ${this.config.busyTimeout}`);
      this.db.pragma(`journal_mode = ${this.config.journalMode}`);
      this.db.pragma(`synchronous = ${this.config.synchronous}`);
      this.db.pragma(`cache_size = ${this.config.cacheSize}`);
      this.db.pragma(`foreign_keys = ${this.config.foreignKeys ? 'ON' : 'OFF'}`);

      logger.info({ filename: this.config.filename }, 'SQLite database connected');
    } catch (error) {
      this.errorCount++;
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, 'Failed to connect to SQLite database');
      throw new Error(`SQLite connection failed: ${message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.db) {
      return;
    }

    // Clear statement cache
    this.statementCache.clear();

    // Close database
    this.db.close();
    this.db = null;

    logger.info('SQLite database disconnected');
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    this.queryCount++;
    const start = Date.now();

    try {
      const stmt = this.getStatement(sql);
      const isSelect = sql.trim().toUpperCase().startsWith('SELECT');

      if (isSelect) {
        const rows = stmt.all(...params) as T[];
        return {
          rows,
          rowCount: rows.length,
          duration: Date.now() - start,
        };
      } else {
        const result = stmt.run(...params);
        return {
          rows: [] as T[],
          rowCount: result.changes,
          duration: Date.now() - start,
        };
      }
    } catch (error) {
      this.errorCount++;
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ sql, error: message }, 'SQLite query failed');
      throw new Error(`SQLite query failed: ${message}`);
    }
  }

  async beginTransaction(): Promise<Transaction> {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    return new SQLiteTransaction(this.db, this.statementCache);
  }

  async execute(sql: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      this.db.exec(sql);
    } catch (error) {
      this.errorCount++;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`SQLite execute failed: ${message}`);
    }
  }

  isConnected(): boolean {
    return this.db !== null && this.db.open;
  }

  getStats(): { connections: number; queries: number; errors: number } {
    return {
      connections: this.db ? 1 : 0,
      queries: this.queryCount,
      errors: this.errorCount,
    };
  }

  private getStatement(sql: string): Database.Statement {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    let stmt = this.statementCache.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.statementCache.set(sql, stmt);
    }
    return stmt;
  }

  /**
   * Get the underlying database for advanced operations
   */
  getDatabase(): Database.Database | null {
    return this.db;
  }

  /**
   * Run VACUUM to reclaim space
   */
  async vacuum(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    this.db.exec('VACUUM');
    logger.info('SQLite database vacuumed');
  }

  /**
   * Checkpoint WAL file
   */
  async checkpoint(mode: 'passive' | 'full' | 'restart' | 'truncate' = 'passive'): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    this.db.pragma(`wal_checkpoint(${mode.toUpperCase()})`);
    logger.info({ mode }, 'SQLite WAL checkpoint completed');
  }

  /**
   * Get database file size
   */
  getFileSize(): number {
    if (!this.db) {
      return 0;
    }
    const result = this.db.pragma('page_count') as Array<{ page_count: number }>;
    const pageSize = (this.db.pragma('page_size') as Array<{ page_size: number }>)[0].page_size;
    return result[0].page_count * pageSize;
  }
}
