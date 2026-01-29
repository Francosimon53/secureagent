/**
 * Agent Job Store
 *
 * Persistence for agent jobs including status tracking and results.
 */

import { randomUUID } from 'crypto';
import type {
  AgentJob,
  AgentJobStatus,
  AgentJobResult,
  AgentJobQueryOptions,
  AgentType,
} from '../types.js';

/**
 * Database adapter interface (for dependency injection)
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Interface for agent job storage
 */
export interface AgentJobStore {
  initialize(): Promise<void>;

  // CRUD operations
  create(job: Omit<AgentJob, 'id' | 'createdAt'>): Promise<AgentJob>;
  get(jobId: string): Promise<AgentJob | null>;
  update(jobId: string, updates: Partial<AgentJob>): Promise<AgentJob | null>;
  delete(jobId: string): Promise<boolean>;

  // Query operations
  list(options?: AgentJobQueryOptions): Promise<AgentJob[]>;
  count(options?: AgentJobQueryOptions): Promise<number>;
  listByUser(userId: string, options?: AgentJobQueryOptions): Promise<AgentJob[]>;

  // Status operations
  updateStatus(jobId: string, status: AgentJobStatus, error?: string): Promise<boolean>;
  updateProgress(jobId: string, progress: number, message?: string): Promise<boolean>;
  setResult(jobId: string, result: AgentJobResult): Promise<boolean>;

  // Cleanup
  deleteOlderThan(timestamp: number): Promise<number>;
}

/**
 * Database-backed agent job store
 */
export class DatabaseAgentJobStore implements AgentJobStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS agent_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        progress_message TEXT,
        result TEXT,
        error TEXT,
        working_directory TEXT,
        timeout INTEGER,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_agent_jobs_user_status ON agent_jobs(user_id, status)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_agent_jobs_created ON agent_jobs(created_at)
    `);
  }

  async create(job: Omit<AgentJob, 'id' | 'createdAt'>): Promise<AgentJob> {
    const now = Date.now();
    const id = randomUUID();

    const item: AgentJob = {
      ...job,
      id,
      createdAt: now,
    };

    await this.db.execute(
      `INSERT INTO agent_jobs (
        id, user_id, agent_type, prompt, status, progress, progress_message,
        result, error, working_directory, timeout, created_at, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.agentType,
        item.prompt,
        item.status,
        item.progress,
        item.progressMessage ?? null,
        item.result ? JSON.stringify(item.result) : null,
        item.error ?? null,
        item.workingDirectory ?? null,
        item.timeout ?? null,
        item.createdAt,
        item.startedAt ?? null,
        item.completedAt ?? null,
      ]
    );

    return item;
  }

  async get(jobId: string): Promise<AgentJob | null> {
    const result = await this.db.query<AgentJobRow>(
      'SELECT * FROM agent_jobs WHERE id = ?',
      [jobId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToJob(result.rows[0]);
  }

  async update(jobId: string, updates: Partial<AgentJob>): Promise<AgentJob | null> {
    const existing = await this.get(jobId);
    if (!existing) {
      return null;
    }

    const updated: AgentJob = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
    };

    await this.db.execute(
      `UPDATE agent_jobs SET
        agent_type = ?, prompt = ?, status = ?, progress = ?, progress_message = ?,
        result = ?, error = ?, working_directory = ?, timeout = ?,
        started_at = ?, completed_at = ?
      WHERE id = ?`,
      [
        updated.agentType,
        updated.prompt,
        updated.status,
        updated.progress,
        updated.progressMessage ?? null,
        updated.result ? JSON.stringify(updated.result) : null,
        updated.error ?? null,
        updated.workingDirectory ?? null,
        updated.timeout ?? null,
        updated.startedAt ?? null,
        updated.completedAt ?? null,
        jobId,
      ]
    );

    return updated;
  }

  async delete(jobId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM agent_jobs WHERE id = ?',
      [jobId]
    );
    return result.changes > 0;
  }

  async list(options: AgentJobQueryOptions = {}): Promise<AgentJob[]> {
    const { sql, params } = this.buildQuerySQL(options);
    const result = await this.db.query<AgentJobRow>(sql, params);
    return result.rows.map(row => this.rowToJob(row));
  }

  async count(options: AgentJobQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildQuerySQL(options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async listByUser(userId: string, options: AgentJobQueryOptions = {}): Promise<AgentJob[]> {
    return this.list({ ...options, userId });
  }

  async updateStatus(jobId: string, status: AgentJobStatus, error?: string): Promise<boolean> {
    const now = Date.now();
    const updates: Record<string, unknown> = { status };

    if (status === 'running') {
      updates.started_at = now;
    } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      updates.completed_at = now;
    }

    if (error) {
      updates.error = error;
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const result = await this.db.execute(
      `UPDATE agent_jobs SET ${setClauses} WHERE id = ?`,
      [...Object.values(updates), jobId]
    );

    return result.changes > 0;
  }

  async updateProgress(jobId: string, progress: number, message?: string): Promise<boolean> {
    const result = await this.db.execute(
      'UPDATE agent_jobs SET progress = ?, progress_message = ? WHERE id = ?',
      [Math.min(100, Math.max(0, progress)), message ?? null, jobId]
    );
    return result.changes > 0;
  }

  async setResult(jobId: string, result: AgentJobResult): Promise<boolean> {
    const now = Date.now();
    const status: AgentJobStatus = result.success ? 'completed' : 'failed';

    const dbResult = await this.db.execute(
      'UPDATE agent_jobs SET status = ?, result = ?, progress = 100, completed_at = ? WHERE id = ?',
      [status, JSON.stringify(result), now, jobId]
    );

    return dbResult.changes > 0;
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    const result = await this.db.execute(
      'DELETE FROM agent_jobs WHERE created_at < ?',
      [timestamp]
    );
    return result.changes;
  }

  private buildQuerySQL(
    options: AgentJobQueryOptions,
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

    if (options.agentType) {
      conditions.push('agent_type = ?');
      params.push(options.agentType);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM agent_jobs ${whereClause}`,
        params,
      };
    }

    const orderBy = options.orderBy ?? 'createdAt';
    const orderColumn = {
      createdAt: 'created_at',
      startedAt: 'started_at',
      completedAt: 'completed_at',
    }[orderBy];
    const direction = options.orderDirection === 'asc' ? 'ASC' : 'DESC';

    let sql = `SELECT * FROM agent_jobs ${whereClause} ORDER BY ${orderColumn} ${direction}`;

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

  private rowToJob(row: AgentJobRow): AgentJob {
    return {
      id: row.id,
      userId: row.user_id,
      agentType: row.agent_type as AgentType,
      prompt: row.prompt,
      status: row.status as AgentJobStatus,
      progress: row.progress,
      progressMessage: row.progress_message ?? undefined,
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error ?? undefined,
      workingDirectory: row.working_directory ?? undefined,
      timeout: row.timeout ?? undefined,
      createdAt: row.created_at,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
    };
  }
}

/**
 * In-memory agent job store for testing
 */
export class InMemoryAgentJobStore implements AgentJobStore {
  private jobs = new Map<string, AgentJob>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async create(job: Omit<AgentJob, 'id' | 'createdAt'>): Promise<AgentJob> {
    const now = Date.now();
    const item: AgentJob = {
      ...job,
      id: randomUUID(),
      createdAt: now,
    };
    this.jobs.set(item.id, item);
    return item;
  }

  async get(jobId: string): Promise<AgentJob | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async update(jobId: string, updates: Partial<AgentJob>): Promise<AgentJob | null> {
    const existing = this.jobs.get(jobId);
    if (!existing) return null;

    const updated: AgentJob = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
    };

    this.jobs.set(jobId, updated);
    return updated;
  }

  async delete(jobId: string): Promise<boolean> {
    return this.jobs.delete(jobId);
  }

  async list(options: AgentJobQueryOptions = {}): Promise<AgentJob[]> {
    let items = Array.from(this.jobs.values());

    if (options.userId) {
      items = items.filter(j => j.userId === options.userId);
    }

    if (options.status && options.status.length > 0) {
      items = items.filter(j => options.status!.includes(j.status));
    }

    if (options.agentType) {
      items = items.filter(j => j.agentType === options.agentType);
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

  async count(options: AgentJobQueryOptions = {}): Promise<number> {
    const items = await this.list({ ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async listByUser(userId: string, options: AgentJobQueryOptions = {}): Promise<AgentJob[]> {
    return this.list({ ...options, userId });
  }

  async updateStatus(jobId: string, status: AgentJobStatus, error?: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    const now = Date.now();
    job.status = status;

    if (status === 'running') {
      job.startedAt = now;
    } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      job.completedAt = now;
    }

    if (error) {
      job.error = error;
    }

    return true;
  }

  async updateProgress(jobId: string, progress: number, message?: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.progress = Math.min(100, Math.max(0, progress));
    if (message !== undefined) {
      job.progressMessage = message;
    }

    return true;
  }

  async setResult(jobId: string, result: AgentJobResult): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.result = result;
    job.status = result.success ? 'completed' : 'failed';
    job.progress = 100;
    job.completedAt = Date.now();

    return true;
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    let count = 0;
    for (const [id, job] of this.jobs) {
      if (job.createdAt < timestamp) {
        this.jobs.delete(id);
        count++;
      }
    }
    return count;
  }
}

// =============================================================================
// Row Types
// =============================================================================

interface AgentJobRow {
  id: string;
  user_id: string;
  agent_type: string;
  prompt: string;
  status: string;
  progress: number;
  progress_message: string | null;
  result: string | null;
  error: string | null;
  working_directory: string | null;
  timeout: number | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createAgentJobStore(type: 'memory'): InMemoryAgentJobStore;
export function createAgentJobStore(type: 'database', db: DatabaseAdapter): DatabaseAgentJobStore;
export function createAgentJobStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): AgentJobStore {
  if (type === 'memory') {
    return new InMemoryAgentJobStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseAgentJobStore(db);
}
