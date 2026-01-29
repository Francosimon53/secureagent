/**
 * Deployment Store
 *
 * Persistence for deployments including status tracking and rollback history.
 */

import { randomUUID } from 'crypto';
import type {
  Deployment,
  DeploymentStatus,
  DeploymentEnvironment,
  DeploymentQueryOptions,
  PipelineProvider,
} from '../types.js';

/**
 * Database adapter interface (for dependency injection)
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Interface for deployment storage
 */
export interface DeploymentStore {
  initialize(): Promise<void>;

  // CRUD operations
  create(deployment: Omit<Deployment, 'id'>): Promise<Deployment>;
  get(deploymentId: string): Promise<Deployment | null>;
  update(deploymentId: string, updates: Partial<Deployment>): Promise<Deployment | null>;
  delete(deploymentId: string): Promise<boolean>;

  // Query operations
  list(options?: DeploymentQueryOptions): Promise<Deployment[]>;
  count(options?: DeploymentQueryOptions): Promise<number>;
  listByUser(userId: string, options?: DeploymentQueryOptions): Promise<Deployment[]>;
  listByRepository(repository: string, options?: DeploymentQueryOptions): Promise<Deployment[]>;

  // Status operations
  updateStatus(deploymentId: string, status: DeploymentStatus, logs?: string): Promise<boolean>;
  setApproval(deploymentId: string, approvedBy: string): Promise<boolean>;

  // Rollback support
  getLastSuccessful(repository: string, environment: DeploymentEnvironment): Promise<Deployment | null>;
  getPreviousDeployment(deploymentId: string): Promise<Deployment | null>;

  // Cleanup
  deleteOlderThan(timestamp: number): Promise<number>;
}

/**
 * Database-backed deployment store
 */
export class DatabaseDeploymentStore implements DeploymentStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        repository TEXT NOT NULL,
        branch TEXT NOT NULL,
        commit_sha TEXT NOT NULL,
        environment TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        pipeline_provider TEXT NOT NULL,
        pipeline_url TEXT,
        deployment_url TEXT,
        logs TEXT,
        previous_deployment_id TEXT,
        rollback_available INTEGER DEFAULT 0,
        approved_by TEXT,
        approved_at INTEGER,
        triggered_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_deployments_user ON deployments(user_id)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_deployments_repo_env ON deployments(repository, environment)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status)
    `);
  }

  async create(deployment: Omit<Deployment, 'id'>): Promise<Deployment> {
    const id = randomUUID();

    const item: Deployment = {
      ...deployment,
      id,
    };

    await this.db.execute(
      `INSERT INTO deployments (
        id, user_id, repository, branch, commit_sha, environment, status,
        pipeline_provider, pipeline_url, deployment_url, logs, previous_deployment_id,
        rollback_available, approved_by, approved_at, triggered_at, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.repository,
        item.branch,
        item.commit,
        item.environment,
        item.status,
        item.pipelineProvider,
        item.pipelineUrl ?? null,
        item.deploymentUrl ?? null,
        item.logs ?? null,
        item.previousDeploymentId ?? null,
        item.rollbackAvailable ? 1 : 0,
        item.approvedBy ?? null,
        item.approvedAt ?? null,
        item.triggeredAt,
        item.startedAt ?? null,
        item.completedAt ?? null,
      ]
    );

    return item;
  }

  async get(deploymentId: string): Promise<Deployment | null> {
    const result = await this.db.query<DeploymentRow>(
      'SELECT * FROM deployments WHERE id = ?',
      [deploymentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToDeployment(result.rows[0]);
  }

  async update(deploymentId: string, updates: Partial<Deployment>): Promise<Deployment | null> {
    const existing = await this.get(deploymentId);
    if (!existing) {
      return null;
    }

    const updated: Deployment = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      triggeredAt: existing.triggeredAt,
    };

    await this.db.execute(
      `UPDATE deployments SET
        repository = ?, branch = ?, commit_sha = ?, environment = ?, status = ?,
        pipeline_provider = ?, pipeline_url = ?, deployment_url = ?, logs = ?,
        previous_deployment_id = ?, rollback_available = ?, approved_by = ?,
        approved_at = ?, started_at = ?, completed_at = ?
      WHERE id = ?`,
      [
        updated.repository,
        updated.branch,
        updated.commit,
        updated.environment,
        updated.status,
        updated.pipelineProvider,
        updated.pipelineUrl ?? null,
        updated.deploymentUrl ?? null,
        updated.logs ?? null,
        updated.previousDeploymentId ?? null,
        updated.rollbackAvailable ? 1 : 0,
        updated.approvedBy ?? null,
        updated.approvedAt ?? null,
        updated.startedAt ?? null,
        updated.completedAt ?? null,
        deploymentId,
      ]
    );

    return updated;
  }

  async delete(deploymentId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM deployments WHERE id = ?',
      [deploymentId]
    );
    return result.changes > 0;
  }

  async list(options: DeploymentQueryOptions = {}): Promise<Deployment[]> {
    const { sql, params } = this.buildQuerySQL(options);
    const result = await this.db.query<DeploymentRow>(sql, params);
    return result.rows.map(row => this.rowToDeployment(row));
  }

  async count(options: DeploymentQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildQuerySQL(options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async listByUser(userId: string, options: DeploymentQueryOptions = {}): Promise<Deployment[]> {
    return this.list({ ...options, userId });
  }

  async listByRepository(repository: string, options: DeploymentQueryOptions = {}): Promise<Deployment[]> {
    return this.list({ ...options, repository });
  }

  async updateStatus(deploymentId: string, status: DeploymentStatus, logs?: string): Promise<boolean> {
    const now = Date.now();
    const updates: Record<string, unknown> = { status };

    if (status === 'in-progress') {
      updates.started_at = now;
    } else if (['succeeded', 'failed', 'rolled-back', 'cancelled'].includes(status)) {
      updates.completed_at = now;
      if (status === 'succeeded') {
        updates.rollback_available = 1;
      }
    }

    if (logs) {
      updates.logs = logs;
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const result = await this.db.execute(
      `UPDATE deployments SET ${setClauses} WHERE id = ?`,
      [...Object.values(updates), deploymentId]
    );

    return result.changes > 0;
  }

  async setApproval(deploymentId: string, approvedBy: string): Promise<boolean> {
    const now = Date.now();
    const result = await this.db.execute(
      'UPDATE deployments SET approved_by = ?, approved_at = ? WHERE id = ?',
      [approvedBy, now, deploymentId]
    );
    return result.changes > 0;
  }

  async getLastSuccessful(repository: string, environment: DeploymentEnvironment): Promise<Deployment | null> {
    const result = await this.db.query<DeploymentRow>(
      `SELECT * FROM deployments
       WHERE repository = ? AND environment = ? AND status = 'succeeded'
       ORDER BY completed_at DESC LIMIT 1`,
      [repository, environment]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToDeployment(result.rows[0]);
  }

  async getPreviousDeployment(deploymentId: string): Promise<Deployment | null> {
    const current = await this.get(deploymentId);
    if (!current?.previousDeploymentId) {
      return null;
    }
    return this.get(current.previousDeploymentId);
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    const result = await this.db.execute(
      'DELETE FROM deployments WHERE triggered_at < ?',
      [timestamp]
    );
    return result.changes;
  }

  private buildQuerySQL(
    options: DeploymentQueryOptions,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }

    if (options.repository) {
      conditions.push('repository = ?');
      params.push(options.repository);
    }

    if (options.environment) {
      conditions.push('environment = ?');
      params.push(options.environment);
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
        sql: `SELECT COUNT(*) as count FROM deployments ${whereClause}`,
        params,
      };
    }

    const orderBy = options.orderBy ?? 'triggeredAt';
    const orderColumn = {
      triggeredAt: 'triggered_at',
      completedAt: 'completed_at',
    }[orderBy];
    const direction = options.orderDirection === 'asc' ? 'ASC' : 'DESC';

    let sql = `SELECT * FROM deployments ${whereClause} ORDER BY ${orderColumn} ${direction}`;

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

  private rowToDeployment(row: DeploymentRow): Deployment {
    return {
      id: row.id,
      userId: row.user_id,
      repository: row.repository,
      branch: row.branch,
      commit: row.commit_sha,
      environment: row.environment as DeploymentEnvironment,
      status: row.status as DeploymentStatus,
      pipelineProvider: row.pipeline_provider as PipelineProvider,
      pipelineUrl: row.pipeline_url ?? undefined,
      deploymentUrl: row.deployment_url ?? undefined,
      logs: row.logs ?? undefined,
      previousDeploymentId: row.previous_deployment_id ?? undefined,
      rollbackAvailable: row.rollback_available === 1,
      approvedBy: row.approved_by ?? undefined,
      approvedAt: row.approved_at ?? undefined,
      triggeredAt: row.triggered_at,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
    };
  }
}

/**
 * In-memory deployment store for testing
 */
export class InMemoryDeploymentStore implements DeploymentStore {
  private deployments = new Map<string, Deployment>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async create(deployment: Omit<Deployment, 'id'>): Promise<Deployment> {
    const item: Deployment = {
      ...deployment,
      id: randomUUID(),
    };
    this.deployments.set(item.id, item);
    return item;
  }

  async get(deploymentId: string): Promise<Deployment | null> {
    return this.deployments.get(deploymentId) ?? null;
  }

  async update(deploymentId: string, updates: Partial<Deployment>): Promise<Deployment | null> {
    const existing = this.deployments.get(deploymentId);
    if (!existing) return null;

    const updated: Deployment = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      triggeredAt: existing.triggeredAt,
    };

    this.deployments.set(deploymentId, updated);
    return updated;
  }

  async delete(deploymentId: string): Promise<boolean> {
    return this.deployments.delete(deploymentId);
  }

  async list(options: DeploymentQueryOptions = {}): Promise<Deployment[]> {
    let items = Array.from(this.deployments.values());

    if (options.userId) {
      items = items.filter(d => d.userId === options.userId);
    }

    if (options.repository) {
      items = items.filter(d => d.repository === options.repository);
    }

    if (options.environment) {
      items = items.filter(d => d.environment === options.environment);
    }

    if (options.status && options.status.length > 0) {
      items = items.filter(d => options.status!.includes(d.status));
    }

    // Sort
    const orderBy = options.orderBy ?? 'triggeredAt';
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

  async count(options: DeploymentQueryOptions = {}): Promise<number> {
    const items = await this.list({ ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async listByUser(userId: string, options: DeploymentQueryOptions = {}): Promise<Deployment[]> {
    return this.list({ ...options, userId });
  }

  async listByRepository(repository: string, options: DeploymentQueryOptions = {}): Promise<Deployment[]> {
    return this.list({ ...options, repository });
  }

  async updateStatus(deploymentId: string, status: DeploymentStatus, logs?: string): Promise<boolean> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return false;

    const now = Date.now();
    deployment.status = status;

    if (status === 'in-progress') {
      deployment.startedAt = now;
    } else if (['succeeded', 'failed', 'rolled-back', 'cancelled'].includes(status)) {
      deployment.completedAt = now;
      if (status === 'succeeded') {
        deployment.rollbackAvailable = true;
      }
    }

    if (logs) {
      deployment.logs = logs;
    }

    return true;
  }

  async setApproval(deploymentId: string, approvedBy: string): Promise<boolean> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return false;

    deployment.approvedBy = approvedBy;
    deployment.approvedAt = Date.now();

    return true;
  }

  async getLastSuccessful(repository: string, environment: DeploymentEnvironment): Promise<Deployment | null> {
    const items = Array.from(this.deployments.values())
      .filter(d => d.repository === repository && d.environment === environment && d.status === 'succeeded')
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

    return items[0] ?? null;
  }

  async getPreviousDeployment(deploymentId: string): Promise<Deployment | null> {
    const current = this.deployments.get(deploymentId);
    if (!current?.previousDeploymentId) {
      return null;
    }
    return this.deployments.get(current.previousDeploymentId) ?? null;
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    let count = 0;
    for (const [id, deployment] of this.deployments) {
      if (deployment.triggeredAt < timestamp) {
        this.deployments.delete(id);
        count++;
      }
    }
    return count;
  }
}

// =============================================================================
// Row Types
// =============================================================================

interface DeploymentRow {
  id: string;
  user_id: string;
  repository: string;
  branch: string;
  commit_sha: string;
  environment: string;
  status: string;
  pipeline_provider: string;
  pipeline_url: string | null;
  deployment_url: string | null;
  logs: string | null;
  previous_deployment_id: string | null;
  rollback_available: number;
  approved_by: string | null;
  approved_at: number | null;
  triggered_at: number;
  started_at: number | null;
  completed_at: number | null;
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createDeploymentStore(type: 'memory'): InMemoryDeploymentStore;
export function createDeploymentStore(type: 'database', db: DatabaseAdapter): DatabaseDeploymentStore;
export function createDeploymentStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): DeploymentStore {
  if (type === 'memory') {
    return new InMemoryDeploymentStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseDeploymentStore(db);
}
