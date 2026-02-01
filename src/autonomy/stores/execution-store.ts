/**
 * Execution Store
 * Persists execution sessions and checkpoints
 */

import { EventEmitter } from 'events';
import type {
  ExecutionSession,
  ExecutionCheckpoint,
  ExecutionStatus,
} from '../types.js';

/**
 * Execution store interface
 */
export interface ExecutionStore {
  // Session operations
  saveSession(session: ExecutionSession): Promise<void>;
  getSession(sessionId: string): Promise<ExecutionSession | null>;
  updateSessionStatus(sessionId: string, status: ExecutionStatus): Promise<void>;
  deleteSession(sessionId: string): Promise<boolean>;
  listSessions(options?: {
    status?: ExecutionStatus;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<ExecutionSession[]>;
  countSessions(options?: { status?: ExecutionStatus; userId?: string }): Promise<number>;

  // Checkpoint operations
  saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void>;
  getCheckpoint(sessionId: string): Promise<ExecutionCheckpoint | null>;
  deleteCheckpoint(sessionId: string): Promise<boolean>;

  // Cleanup
  cleanupOldSessions(olderThanMs: number): Promise<number>;
  cleanupOldCheckpoints(olderThanMs: number): Promise<number>;
}

/**
 * In-memory execution store
 */
export class InMemoryExecutionStore extends EventEmitter implements ExecutionStore {
  private sessions: Map<string, ExecutionSession> = new Map();
  private checkpoints: Map<string, ExecutionCheckpoint> = new Map();

  async saveSession(session: ExecutionSession): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async getSession(sessionId: string): Promise<ExecutionSession | null> {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  async updateSessionStatus(sessionId: string, status: ExecutionStatus): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.lastActivityAt = Date.now();
      if (['completed', 'failed', 'cancelled'].includes(status)) {
        session.completedAt = Date.now();
      }
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const deleted = this.sessions.delete(sessionId);
    this.checkpoints.delete(sessionId);
    return deleted;
  }

  async listSessions(options?: {
    status?: ExecutionStatus;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<ExecutionSession[]> {
    let sessions = Array.from(this.sessions.values());

    // Filter by status
    if (options?.status) {
      sessions = sessions.filter(s => s.status === options.status);
    }

    // Filter by userId
    if (options?.userId) {
      sessions = sessions.filter(s => s.userId === options.userId);
    }

    // Sort by creation time (newest first)
    sessions.sort((a, b) => b.startedAt - a.startedAt);

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? sessions.length;

    return sessions.slice(offset, offset + limit).map(s => ({ ...s }));
  }

  async countSessions(options?: { status?: ExecutionStatus; userId?: string }): Promise<number> {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (options?.status && session.status !== options.status) continue;
      if (options?.userId && session.userId !== options.userId) continue;
      count++;
    }
    return count;
  }

  async saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.sessionId, { ...checkpoint });
  }

  async getCheckpoint(sessionId: string): Promise<ExecutionCheckpoint | null> {
    const checkpoint = this.checkpoints.get(sessionId);
    return checkpoint ? { ...checkpoint } : null;
  }

  async deleteCheckpoint(sessionId: string): Promise<boolean> {
    return this.checkpoints.delete(sessionId);
  }

  async cleanupOldSessions(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let count = 0;

    for (const [id, session] of this.sessions) {
      const sessionTime = session.completedAt ?? session.lastActivityAt;
      if (sessionTime < cutoff) {
        this.sessions.delete(id);
        this.checkpoints.delete(id);
        count++;
      }
    }

    return count;
  }

  async cleanupOldCheckpoints(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let count = 0;

    for (const [id, checkpoint] of this.checkpoints) {
      if (checkpoint.savedAt < cutoff) {
        this.checkpoints.delete(id);
        count++;
      }
    }

    return count;
  }

  // Helper methods
  clear(): void {
    this.sessions.clear();
    this.checkpoints.clear();
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  getCheckpointCount(): number {
    return this.checkpoints.size;
  }
}

/**
 * Database execution store
 * Uses the existing database adapter pattern from the codebase
 */
export class DatabaseExecutionStore extends EventEmitter implements ExecutionStore {
  private readonly tableName: string;
  private readonly checkpointTableName: string;
  private db?: { run: (sql: string, params?: unknown[]) => Promise<void>; get: <T>(sql: string, params?: unknown[]) => Promise<T | undefined>; all: <T>(sql: string, params?: unknown[]) => Promise<T[]> };

  constructor(db?: unknown, options?: { tableName?: string; checkpointTableName?: string }) {
    super();
    this.tableName = options?.tableName ?? 'autonomy_executions';
    this.checkpointTableName = options?.checkpointTableName ?? 'autonomy_checkpoints';
    this.db = db as typeof this.db;
  }

  async initialize(): Promise<void> {
    if (!this.db) return;

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL,
        status TEXT NOT NULL,
        user_id TEXT,
        data TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        last_activity_at INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_status ON ${this.tableName}(status)
    `);

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_user_id ON ${this.tableName}(user_id)
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.checkpointTableName} (
        session_id TEXT PRIMARY KEY,
        step_index INTEGER NOT NULL,
        total_steps INTEGER NOT NULL,
        state TEXT NOT NULL,
        saved_at INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);
  }

  async saveSession(session: ExecutionSession): Promise<void> {
    if (!this.db) return;

    await this.db.run(`
      INSERT OR REPLACE INTO ${this.tableName}
      (id, goal_id, status, user_id, data, started_at, completed_at, last_activity_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      session.id,
      session.goal.id,
      session.status,
      session.userId,
      JSON.stringify(session),
      session.startedAt,
      session.completedAt,
      session.lastActivityAt,
    ]);
  }

  async getSession(sessionId: string): Promise<ExecutionSession | null> {
    if (!this.db) return null;

    const row = await this.db.get<{ data: string }>(
      `SELECT data FROM ${this.tableName} WHERE id = ?`,
      [sessionId]
    );

    return row ? JSON.parse(row.data) : null;
  }

  async updateSessionStatus(sessionId: string, status: ExecutionStatus): Promise<void> {
    if (!this.db) return;

    const now = Date.now();
    const completedAt = ['completed', 'failed', 'cancelled'].includes(status) ? now : null;

    // Get current session to update the data
    const session = await this.getSession(sessionId);
    if (session) {
      session.status = status;
      session.lastActivityAt = now;
      if (completedAt) session.completedAt = completedAt;

      await this.db.run(`
        UPDATE ${this.tableName}
        SET status = ?, last_activity_at = ?, completed_at = ?, data = ?
        WHERE id = ?
      `, [status, now, completedAt, JSON.stringify(session), sessionId]);
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    if (!this.db) return false;

    await this.db.run(
      `DELETE FROM ${this.tableName} WHERE id = ?`,
      [sessionId]
    );

    await this.db.run(
      `DELETE FROM ${this.checkpointTableName} WHERE session_id = ?`,
      [sessionId]
    );

    return true;
  }

  async listSessions(options?: {
    status?: ExecutionStatus;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<ExecutionSession[]> {
    if (!this.db) return [];

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options?.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const rows = await this.db.all<{ data: string }>(
      `SELECT data FROM ${this.tableName} ${whereClause}
       ORDER BY started_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return rows.map(row => JSON.parse(row.data));
  }

  async countSessions(options?: { status?: ExecutionStatus; userId?: string }): Promise<number> {
    if (!this.db) return 0;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options?.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const row = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`,
      params
    );

    return row?.count ?? 0;
  }

  async saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void> {
    if (!this.db) return;

    await this.db.run(`
      INSERT OR REPLACE INTO ${this.checkpointTableName}
      (session_id, step_index, total_steps, state, saved_at)
      VALUES (?, ?, ?, ?, ?)
    `, [
      checkpoint.sessionId,
      checkpoint.stepIndex,
      checkpoint.totalSteps,
      JSON.stringify(checkpoint.state),
      checkpoint.savedAt,
    ]);
  }

  async getCheckpoint(sessionId: string): Promise<ExecutionCheckpoint | null> {
    if (!this.db) return null;

    const row = await this.db.get<{
      session_id: string;
      step_index: number;
      total_steps: number;
      state: string;
      saved_at: number;
    }>(
      `SELECT * FROM ${this.checkpointTableName} WHERE session_id = ?`,
      [sessionId]
    );

    if (!row) return null;

    return {
      sessionId: row.session_id,
      stepIndex: row.step_index,
      totalSteps: row.total_steps,
      state: JSON.parse(row.state),
      savedAt: row.saved_at,
    };
  }

  async deleteCheckpoint(sessionId: string): Promise<boolean> {
    if (!this.db) return false;

    await this.db.run(
      `DELETE FROM ${this.checkpointTableName} WHERE session_id = ?`,
      [sessionId]
    );

    return true;
  }

  async cleanupOldSessions(olderThanMs: number): Promise<number> {
    if (!this.db) return 0;

    const cutoff = Date.now() - olderThanMs;

    // Get IDs to delete (for checkpoint cleanup)
    const rows = await this.db.all<{ id: string }>(
      `SELECT id FROM ${this.tableName}
       WHERE COALESCE(completed_at, last_activity_at) < ?`,
      [cutoff]
    );

    const ids = rows.map(r => r.id);

    if (ids.length > 0) {
      // Delete checkpoints
      await this.db.run(
        `DELETE FROM ${this.checkpointTableName}
         WHERE session_id IN (${ids.map(() => '?').join(',')})`,
        ids
      );

      // Delete sessions
      await this.db.run(
        `DELETE FROM ${this.tableName}
         WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
    }

    return ids.length;
  }

  async cleanupOldCheckpoints(olderThanMs: number): Promise<number> {
    if (!this.db) return 0;

    const cutoff = Date.now() - olderThanMs;

    const result = await this.db.run(
      `DELETE FROM ${this.checkpointTableName} WHERE saved_at < ?`,
      [cutoff]
    );

    return 0; // SQLite doesn't easily return affected rows, would need changes
  }
}

/**
 * Create an execution store
 */
export function createExecutionStore(
  type: 'memory' | 'database' = 'memory',
  db?: unknown,
  options?: { tableName?: string; checkpointTableName?: string }
): ExecutionStore {
  if (type === 'database') {
    return new DatabaseExecutionStore(db, options);
  }
  return new InMemoryExecutionStore();
}
