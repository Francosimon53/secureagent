/**
 * Test Fix Session Store
 *
 * Persistence for test-fix loop sessions including test results and applied fixes.
 */

import { randomUUID } from 'crypto';
import type {
  TestFixSession,
  TestFixStatus,
  TestRunResult,
  AppliedFix,
  TestFixSessionQueryOptions,
} from '../types.js';

/**
 * Database adapter interface (for dependency injection)
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Interface for test fix session storage
 */
export interface TestFixSessionStore {
  initialize(): Promise<void>;

  // CRUD operations
  create(session: Omit<TestFixSession, 'id' | 'createdAt'>): Promise<TestFixSession>;
  get(sessionId: string): Promise<TestFixSession | null>;
  update(sessionId: string, updates: Partial<TestFixSession>): Promise<TestFixSession | null>;
  delete(sessionId: string): Promise<boolean>;

  // Query operations
  list(options?: TestFixSessionQueryOptions): Promise<TestFixSession[]>;
  count(options?: TestFixSessionQueryOptions): Promise<number>;
  listByUser(userId: string, options?: TestFixSessionQueryOptions): Promise<TestFixSession[]>;

  // Session operations
  updateStatus(sessionId: string, status: TestFixStatus): Promise<boolean>;
  incrementIteration(sessionId: string): Promise<boolean>;
  addTestResult(sessionId: string, result: TestRunResult): Promise<boolean>;
  addAppliedFix(sessionId: string, fix: AppliedFix): Promise<boolean>;

  // Cleanup
  deleteOlderThan(timestamp: number): Promise<number>;
}

/**
 * Database-backed test fix session store
 */
export class DatabaseTestFixSessionStore implements TestFixSessionStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS test_fix_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        test_command TEXT NOT NULL,
        max_iterations INTEGER NOT NULL,
        current_iteration INTEGER DEFAULT 0,
        status TEXT DEFAULT 'running',
        test_results TEXT DEFAULT '[]',
        fixes_applied TEXT DEFAULT '[]',
        working_directory TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_test_sessions_user ON test_fix_sessions(user_id)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_test_sessions_status ON test_fix_sessions(status)
    `);
  }

  async create(session: Omit<TestFixSession, 'id' | 'createdAt'>): Promise<TestFixSession> {
    const now = Date.now();
    const id = randomUUID();

    const item: TestFixSession = {
      ...session,
      id,
      createdAt: now,
    };

    await this.db.execute(
      `INSERT INTO test_fix_sessions (
        id, user_id, test_command, max_iterations, current_iteration, status,
        test_results, fixes_applied, working_directory, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.testCommand,
        item.maxIterations,
        item.currentIteration,
        item.status,
        JSON.stringify(item.testResults),
        JSON.stringify(item.fixesApplied),
        item.workingDirectory ?? null,
        item.createdAt,
        item.completedAt ?? null,
      ]
    );

    return item;
  }

  async get(sessionId: string): Promise<TestFixSession | null> {
    const result = await this.db.query<TestFixSessionRow>(
      'SELECT * FROM test_fix_sessions WHERE id = ?',
      [sessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToSession(result.rows[0]);
  }

  async update(sessionId: string, updates: Partial<TestFixSession>): Promise<TestFixSession | null> {
    const existing = await this.get(sessionId);
    if (!existing) {
      return null;
    }

    const updated: TestFixSession = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
    };

    await this.db.execute(
      `UPDATE test_fix_sessions SET
        test_command = ?, max_iterations = ?, current_iteration = ?, status = ?,
        test_results = ?, fixes_applied = ?, working_directory = ?, completed_at = ?
      WHERE id = ?`,
      [
        updated.testCommand,
        updated.maxIterations,
        updated.currentIteration,
        updated.status,
        JSON.stringify(updated.testResults),
        JSON.stringify(updated.fixesApplied),
        updated.workingDirectory ?? null,
        updated.completedAt ?? null,
        sessionId,
      ]
    );

    return updated;
  }

  async delete(sessionId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM test_fix_sessions WHERE id = ?',
      [sessionId]
    );
    return result.changes > 0;
  }

  async list(options: TestFixSessionQueryOptions = {}): Promise<TestFixSession[]> {
    const { sql, params } = this.buildQuerySQL(options);
    const result = await this.db.query<TestFixSessionRow>(sql, params);
    return result.rows.map(row => this.rowToSession(row));
  }

  async count(options: TestFixSessionQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildQuerySQL(options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async listByUser(userId: string, options: TestFixSessionQueryOptions = {}): Promise<TestFixSession[]> {
    return this.list({ ...options, userId });
  }

  async updateStatus(sessionId: string, status: TestFixStatus): Promise<boolean> {
    const now = Date.now();
    const completedAt = ['succeeded', 'failed', 'max-iterations', 'cancelled'].includes(status) ? now : null;

    const result = await this.db.execute(
      'UPDATE test_fix_sessions SET status = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ?',
      [status, completedAt, sessionId]
    );

    return result.changes > 0;
  }

  async incrementIteration(sessionId: string): Promise<boolean> {
    const result = await this.db.execute(
      'UPDATE test_fix_sessions SET current_iteration = current_iteration + 1 WHERE id = ?',
      [sessionId]
    );
    return result.changes > 0;
  }

  async addTestResult(sessionId: string, testResult: TestRunResult): Promise<boolean> {
    const session = await this.get(sessionId);
    if (!session) return false;

    const testResults = [...session.testResults, testResult];

    const result = await this.db.execute(
      'UPDATE test_fix_sessions SET test_results = ? WHERE id = ?',
      [JSON.stringify(testResults), sessionId]
    );

    return result.changes > 0;
  }

  async addAppliedFix(sessionId: string, fix: AppliedFix): Promise<boolean> {
    const session = await this.get(sessionId);
    if (!session) return false;

    const fixesApplied = [...session.fixesApplied, fix];

    const result = await this.db.execute(
      'UPDATE test_fix_sessions SET fixes_applied = ? WHERE id = ?',
      [JSON.stringify(fixesApplied), sessionId]
    );

    return result.changes > 0;
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    const result = await this.db.execute(
      'DELETE FROM test_fix_sessions WHERE created_at < ?',
      [timestamp]
    );
    return result.changes;
  }

  private buildQuerySQL(
    options: TestFixSessionQueryOptions,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }

    if (options.status && options.status.length > 0) {
      const placeholders = options.status.map(() => '?').join(',');
      conditions.push(`status IN (${placeholders})`);
      params.push(...options.status);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM test_fix_sessions ${whereClause}`,
        params,
      };
    }

    const orderBy = options.orderBy ?? 'createdAt';
    const orderColumn = orderBy === 'completedAt' ? 'completed_at' : 'created_at';
    const direction = options.orderDirection === 'asc' ? 'ASC' : 'DESC';

    let sql = `SELECT * FROM test_fix_sessions ${whereClause} ORDER BY ${orderColumn} ${direction}`;

    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    return { sql, params };
  }

  private rowToSession(row: TestFixSessionRow): TestFixSession {
    return {
      id: row.id,
      userId: row.user_id,
      testCommand: row.test_command,
      maxIterations: row.max_iterations,
      currentIteration: row.current_iteration,
      status: row.status as TestFixStatus,
      testResults: JSON.parse(row.test_results),
      fixesApplied: JSON.parse(row.fixes_applied),
      workingDirectory: row.working_directory ?? undefined,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? undefined,
    };
  }
}

/**
 * In-memory test fix session store for testing
 */
export class InMemoryTestFixSessionStore implements TestFixSessionStore {
  private sessions = new Map<string, TestFixSession>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async create(session: Omit<TestFixSession, 'id' | 'createdAt'>): Promise<TestFixSession> {
    const now = Date.now();
    const item: TestFixSession = {
      ...session,
      id: randomUUID(),
      createdAt: now,
    };
    this.sessions.set(item.id, item);
    return item;
  }

  async get(sessionId: string): Promise<TestFixSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async update(sessionId: string, updates: Partial<TestFixSession>): Promise<TestFixSession | null> {
    const existing = this.sessions.get(sessionId);
    if (!existing) return null;

    const updated: TestFixSession = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
    };

    this.sessions.set(sessionId, updated);
    return updated;
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async list(options: TestFixSessionQueryOptions = {}): Promise<TestFixSession[]> {
    let items = Array.from(this.sessions.values());

    if (options.userId) {
      items = items.filter(s => s.userId === options.userId);
    }

    if (options.status && options.status.length > 0) {
      items = items.filter(s => options.status!.includes(s.status));
    }

    // Sort
    const orderBy = options.orderBy ?? 'createdAt';
    items.sort((a, b) => {
      const aVal = a[orderBy] ?? 0;
      const bVal = b[orderBy] ?? 0;
      return (bVal as number) - (aVal as number);
    });

    if (options.orderDirection === 'asc') {
      items.reverse();
    }

    if (options.offset) {
      items = items.slice(options.offset);
    }

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  async count(options: TestFixSessionQueryOptions = {}): Promise<number> {
    const items = await this.list({ ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async listByUser(userId: string, options: TestFixSessionQueryOptions = {}): Promise<TestFixSession[]> {
    return this.list({ ...options, userId });
  }

  async updateStatus(sessionId: string, status: TestFixStatus): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = status;
    if (['succeeded', 'failed', 'max-iterations', 'cancelled'].includes(status)) {
      session.completedAt = Date.now();
    }

    return true;
  }

  async incrementIteration(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.currentIteration++;
    return true;
  }

  async addTestResult(sessionId: string, result: TestRunResult): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.testResults.push(result);
    return true;
  }

  async addAppliedFix(sessionId: string, fix: AppliedFix): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.fixesApplied.push(fix);
    return true;
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (session.createdAt < timestamp) {
        this.sessions.delete(id);
        count++;
      }
    }
    return count;
  }
}

// =============================================================================
// Row Types
// =============================================================================

interface TestFixSessionRow {
  id: string;
  user_id: string;
  test_command: string;
  max_iterations: number;
  current_iteration: number;
  status: string;
  test_results: string;
  fixes_applied: string;
  working_directory: string | null;
  created_at: number;
  completed_at: number | null;
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createTestFixSessionStore(type: 'memory'): InMemoryTestFixSessionStore;
export function createTestFixSessionStore(type: 'database', db: DatabaseAdapter): DatabaseTestFixSessionStore;
export function createTestFixSessionStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): TestFixSessionStore {
  if (type === 'memory') {
    return new InMemoryTestFixSessionStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseTestFixSessionStore(db);
}
