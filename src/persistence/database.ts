import { EventEmitter } from 'events';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'Database' });

// ============================================================================
// Database Abstraction Layer
// ============================================================================

/**
 * Database connection configuration
 */
export interface DatabaseConfig {
  /** Database type */
  type: 'memory' | 'sqlite' | 'postgresql';
  /** Connection string (for sqlite: file path, for postgresql: connection URL) */
  connectionString?: string;
  /** Connection pool size (postgresql only) */
  poolSize?: number;
  /** Enable query logging */
  logging?: boolean;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Enable SSL (postgresql only) */
  ssl?: boolean;
}

/**
 * Query result
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  duration: number;
}

/**
 * Transaction interface
 */
export interface Transaction {
  /** Execute a query within this transaction */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Commit the transaction */
  commit(): Promise<void>;
  /** Rollback the transaction */
  rollback(): Promise<void>;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter {
  /** Connect to the database */
  connect(): Promise<void>;
  /** Disconnect from the database */
  disconnect(): Promise<void>;
  /** Execute a query */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Begin a transaction */
  beginTransaction(): Promise<Transaction>;
  /** Check if connected */
  isConnected(): boolean;
  /** Get connection stats */
  getStats(): { connections: number; queries: number; errors: number };
}

// ============================================================================
// In-Memory Database Adapter
// ============================================================================

interface MemoryTable {
  columns: string[];
  rows: Map<string, Record<string, unknown>>;
  autoIncrement: number;
}

/**
 * In-memory database adapter for testing and development
 */
export class MemoryDatabaseAdapter implements DatabaseAdapter {
  private connected = false;
  private readonly tables = new Map<string, MemoryTable>();
  private queryCount = 0;
  private errorCount = 0;

  async connect(): Promise<void> {
    this.connected = true;
    logger.info('Memory database connected');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.tables.clear();
    logger.info('Memory database disconnected');
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const start = Date.now();
    this.queryCount++;

    try {
      const result = this.executeSQL<T>(sql, params ?? []);
      return {
        ...result,
        duration: Date.now() - start,
      };
    } catch (error) {
      this.errorCount++;
      throw error;
    }
  }

  async beginTransaction(): Promise<Transaction> {
    // In-memory transactions are simplified (no real isolation)
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    let committed = false;
    let rolledBack = false;

    return {
      query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> => {
        if (committed || rolledBack) {
          throw new Error('Transaction already ended');
        }
        queries.push({ sql, params: params ?? [] });
        return this.query<T>(sql, params);
      },
      commit: async () => {
        committed = true;
      },
      rollback: async () => {
        rolledBack = true;
        // In a real implementation, we'd undo the changes
      },
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  getStats(): { connections: number; queries: number; errors: number } {
    return {
      connections: this.connected ? 1 : 0,
      queries: this.queryCount,
      errors: this.errorCount,
    };
  }

  private executeSQL<T>(sql: string, params: unknown[]): { rows: T[]; rowCount: number } {
    const normalizedSQL = sql.trim().toUpperCase();

    if (normalizedSQL.startsWith('CREATE TABLE')) {
      return this.executeCreateTable(sql) as { rows: T[]; rowCount: number };
    }
    if (normalizedSQL.startsWith('INSERT')) {
      return this.executeInsert<T>(sql, params);
    }
    if (normalizedSQL.startsWith('SELECT')) {
      return this.executeSelect<T>(sql, params);
    }
    if (normalizedSQL.startsWith('UPDATE')) {
      return this.executeUpdate<T>(sql, params);
    }
    if (normalizedSQL.startsWith('DELETE')) {
      return this.executeDelete<T>(sql, params);
    }
    if (normalizedSQL.startsWith('DROP TABLE')) {
      return this.executeDropTable(sql) as { rows: T[]; rowCount: number };
    }

    throw new Error(`Unsupported SQL: ${sql.slice(0, 50)}`);
  }

  private executeCreateTable(sql: string): { rows: never[]; rowCount: number } {
    const match = sql.match(/CREATE TABLE(?: IF NOT EXISTS)?\s+(\w+)/i);
    if (!match) throw new Error('Invalid CREATE TABLE syntax');

    const tableName = match[1].toLowerCase();
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, {
        columns: [],
        rows: new Map(),
        autoIncrement: 1,
      });
    }

    return { rows: [], rowCount: 0 };
  }

  private executeDropTable(sql: string): { rows: never[]; rowCount: number } {
    const match = sql.match(/DROP TABLE(?: IF EXISTS)?\s+(\w+)/i);
    if (!match) throw new Error('Invalid DROP TABLE syntax');

    const tableName = match[1].toLowerCase();
    this.tables.delete(tableName);

    return { rows: [], rowCount: 0 };
  }

  private executeInsert<T>(sql: string, params: unknown[]): { rows: T[]; rowCount: number } {
    const match = sql.match(/INSERT INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (!match) throw new Error('Invalid INSERT syntax');

    const tableName = match[1].toLowerCase();
    const columns = match[2].split(',').map(c => c.trim().toLowerCase());

    const table = this.tables.get(tableName);
    if (!table) {
      // Auto-create table
      this.tables.set(tableName, {
        columns,
        rows: new Map(),
        autoIncrement: 1,
      });
    }

    const targetTable = this.tables.get(tableName)!;
    const row: Record<string, unknown> = {};

    columns.forEach((col, i) => {
      const value = params[i];
      row[col] = value;
    });

    // Generate ID if not provided
    if (!row['id']) {
      row['id'] = `${targetTable.autoIncrement++}`;
    }

    targetTable.rows.set(String(row['id']), row);

    return { rows: [row as T], rowCount: 1 };
  }

  private executeSelect<T>(sql: string, params: unknown[]): { rows: T[]; rowCount: number } {
    const match = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?(?:\s+OFFSET\s+(\d+))?$/i);
    if (!match) throw new Error('Invalid SELECT syntax');

    const columns = match[1].trim();
    const tableName = match[2].toLowerCase();
    const whereClause = match[3];
    const orderBy = match[4];
    const limit = match[5] ? parseInt(match[5], 10) : undefined;
    const offset = match[6] ? parseInt(match[6], 10) : 0;

    const table = this.tables.get(tableName);
    if (!table) {
      return { rows: [], rowCount: 0 };
    }

    let rows = Array.from(table.rows.values());

    // Apply WHERE clause (simplified)
    if (whereClause) {
      rows = this.applyWhere(rows, whereClause, params);
    }

    // Apply ORDER BY (simplified)
    if (orderBy) {
      const [col, dir] = orderBy.split(/\s+/);
      const direction = dir?.toUpperCase() === 'DESC' ? -1 : 1;
      rows.sort((a, b) => {
        const aVal = a[col.toLowerCase()] as string | number | null;
        const bVal = b[col.toLowerCase()] as string | number | null;
        if (aVal === null || aVal === undefined) return 1 * direction;
        if (bVal === null || bVal === undefined) return -1 * direction;
        if (aVal < bVal) return -1 * direction;
        if (aVal > bVal) return 1 * direction;
        return 0;
      });
    }

    // Apply LIMIT and OFFSET
    if (offset > 0 || limit !== undefined) {
      rows = rows.slice(offset, limit !== undefined ? offset + limit : undefined);
    }

    // Select columns
    if (columns !== '*') {
      const selectedCols = columns.split(',').map(c => c.trim().toLowerCase());
      rows = rows.map(row => {
        const selected: Record<string, unknown> = {};
        for (const col of selectedCols) {
          selected[col] = row[col];
        }
        return selected;
      });
    }

    return { rows: rows as T[], rowCount: rows.length };
  }

  private executeUpdate<T>(sql: string, params: unknown[]): { rows: T[]; rowCount: number } {
    const match = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i);
    if (!match) throw new Error('Invalid UPDATE syntax');

    const tableName = match[1].toLowerCase();
    const setClause = match[2];
    const whereClause = match[3];

    const table = this.tables.get(tableName);
    if (!table) {
      return { rows: [], rowCount: 0 };
    }

    let rows = Array.from(table.rows.values());

    // Apply WHERE clause
    if (whereClause) {
      rows = this.applyWhere(rows, whereClause, params);
    }

    // Parse SET clause
    const setParts = setClause.split(',').map(s => s.trim());
    const updates: Record<string, unknown> = {};
    let paramIndex = 0;

    for (const part of setParts) {
      const [col, value] = part.split('=').map(s => s.trim());
      if (value === '?' || value.startsWith('$')) {
        updates[col.toLowerCase()] = params[paramIndex++];
      } else {
        updates[col.toLowerCase()] = value.replace(/['"]/g, '');
      }
    }

    // Update rows
    for (const row of rows) {
      const id = String(row['id']);
      const existing = table.rows.get(id);
      if (existing) {
        Object.assign(existing, updates);
      }
    }

    return { rows: rows as T[], rowCount: rows.length };
  }

  private executeDelete<T>(sql: string, params: unknown[]): { rows: T[]; rowCount: number } {
    const match = sql.match(/DELETE FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
    if (!match) throw new Error('Invalid DELETE syntax');

    const tableName = match[1].toLowerCase();
    const whereClause = match[2];

    const table = this.tables.get(tableName);
    if (!table) {
      return { rows: [], rowCount: 0 };
    }

    let rows = Array.from(table.rows.values());

    // Apply WHERE clause
    if (whereClause) {
      rows = this.applyWhere(rows, whereClause, params);
    }

    // Delete rows
    for (const row of rows) {
      table.rows.delete(String(row['id']));
    }

    return { rows: rows as T[], rowCount: rows.length };
  }

  private applyWhere(rows: Record<string, unknown>[], whereClause: string, params: unknown[]): Record<string, unknown>[] {
    // Simplified WHERE parsing (handles = and AND only)
    const conditions = whereClause.split(/\s+AND\s+/i);
    let paramIndex = 0;

    return rows.filter(row => {
      return conditions.every(condition => {
        const match = condition.match(/(\w+)\s*(=|>|<|>=|<=|!=|<>)\s*(\?|\$\d+|'[^']*'|"[^"]*"|\d+)/i);
        if (!match) return true;

        const [, col, op, rawValue] = match;
        let value: unknown;

        if (rawValue === '?' || rawValue.startsWith('$')) {
          value = params[paramIndex++];
        } else if (rawValue.startsWith("'") || rawValue.startsWith('"')) {
          value = rawValue.slice(1, -1);
        } else {
          value = parseFloat(rawValue);
        }

        const rowValue = row[col.toLowerCase()];

        switch (op) {
          case '=': return rowValue === value;
          case '!=':
          case '<>': return rowValue !== value;
          case '>': return (rowValue as number) > (value as number);
          case '<': return (rowValue as number) < (value as number);
          case '>=': return (rowValue as number) >= (value as number);
          case '<=': return (rowValue as number) <= (value as number);
          default: return true;
        }
      });
    });
  }
}

// ============================================================================
// Database Manager
// ============================================================================

/**
 * Database manager - singleton for managing database connections
 */
export class DatabaseManager extends EventEmitter {
  private static instance: DatabaseManager | null = null;
  private adapter: DatabaseAdapter | null = null;
  private config: DatabaseConfig | null = null;

  private constructor() {
    super();
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Initialize database connection
   */
  async initialize(config: DatabaseConfig): Promise<void> {
    if (this.adapter?.isConnected()) {
      await this.disconnect();
    }

    this.config = config;

    switch (config.type) {
      case 'memory':
        this.adapter = new MemoryDatabaseAdapter();
        break;
      case 'sqlite':
        // SQLite adapter would be implemented separately
        this.adapter = new MemoryDatabaseAdapter(); // Fallback for now
        logger.warn('SQLite adapter not implemented, using memory adapter');
        break;
      case 'postgresql':
        // PostgreSQL adapter would be implemented separately
        this.adapter = new MemoryDatabaseAdapter(); // Fallback for now
        logger.warn('PostgreSQL adapter not implemented, using memory adapter');
        break;
      default:
        throw new Error(`Unsupported database type: ${config.type}`);
    }

    await this.adapter.connect();
    this.emit('connected');

    logger.info({ type: config.type }, 'Database initialized');
  }

  /**
   * Get the database adapter
   */
  getAdapter(): DatabaseAdapter {
    if (!this.adapter) {
      throw new Error('Database not initialized');
    }
    return this.adapter;
  }

  /**
   * Execute a query
   */
  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    return this.getAdapter().query<T>(sql, params);
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(): Promise<Transaction> {
    return this.getAdapter().beginTransaction();
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
      this.adapter = null;
      this.emit('disconnected');
    }
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.adapter?.isConnected() ?? false;
  }

  /**
   * Get connection stats
   */
  getStats(): { connections: number; queries: number; errors: number } | null {
    return this.adapter?.getStats() ?? null;
  }

  /**
   * Get current configuration
   */
  getConfig(): DatabaseConfig | null {
    return this.config;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get the database manager instance
 */
export function getDatabase(): DatabaseManager {
  return DatabaseManager.getInstance();
}

/**
 * Initialize database with configuration
 */
export async function initDatabase(config: DatabaseConfig): Promise<DatabaseManager> {
  const db = getDatabase();
  await db.initialize(config);
  return db;
}
