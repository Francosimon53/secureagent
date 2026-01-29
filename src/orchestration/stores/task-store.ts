/**
 * Task Store
 * Manages background tasks and checkpoints
 */

import type {
  BackgroundTask,
  TaskStatus,
  TaskPriority,
  TaskCheckpoint,
  PersonaType,
} from '../types.js';
import type { DatabaseAdapter } from '../../persistence/index.js';

/**
 * Task store interface
 */
export interface TaskStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  // Task operations
  /** Get a task by ID */
  get(id: string): Promise<BackgroundTask | null>;

  /** Get all tasks */
  getAll(): Promise<BackgroundTask[]>;

  /** Get tasks by status */
  getByStatus(status: TaskStatus): Promise<BackgroundTask[]>;

  /** Get tasks by priority */
  getByPriority(priority: TaskPriority): Promise<BackgroundTask[]>;

  /** Get queued tasks ordered by priority */
  getQueuedTasks(limit?: number): Promise<BackgroundTask[]>;

  /** Get tasks assigned to an agent */
  getByAgent(agentId: string): Promise<BackgroundTask[]>;

  /** Get overnight-eligible tasks */
  getOvernightEligible(priorityThreshold: TaskPriority): Promise<BackgroundTask[]>;

  /** Save a task */
  save(task: BackgroundTask): Promise<void>;

  /** Update task status */
  updateStatus(id: string, status: TaskStatus, error?: string, result?: unknown): Promise<void>;

  /** Update task progress */
  updateProgress(id: string, progress: number): Promise<void>;

  /** Assign task to agent */
  assignToAgent(id: string, agentId: string): Promise<void>;

  /** Unassign task from agent */
  unassignFromAgent(id: string): Promise<void>;

  /** Increment retry count */
  incrementRetry(id: string): Promise<void>;

  /** Delete a task */
  delete(id: string): Promise<boolean>;

  /** Count tasks by status */
  countByStatus(status: TaskStatus): Promise<number>;

  /** Get tasks that have timed out */
  getTimedOutTasks(timeoutMs: number): Promise<BackgroundTask[]>;

  // Checkpoint operations
  /** Save a checkpoint */
  saveCheckpoint(checkpoint: TaskCheckpoint): Promise<void>;

  /** Get checkpoint for a task */
  getCheckpoint(taskId: string): Promise<TaskCheckpoint | null>;

  /** Delete checkpoint for a task */
  deleteCheckpoint(taskId: string): Promise<boolean>;

  /** Get all checkpoints */
  getAllCheckpoints(): Promise<TaskCheckpoint[]>;
}

// Priority ordering for sorting
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/**
 * In-memory task store implementation
 */
export class InMemoryTaskStore implements TaskStore {
  private tasks: Map<string, BackgroundTask> = new Map();
  private checkpoints: Map<string, TaskCheckpoint> = new Map();

  async initialize(): Promise<void> {
    // No initialization needed
  }

  async get(id: string): Promise<BackgroundTask | null> {
    return this.tasks.get(id) || null;
  }

  async getAll(): Promise<BackgroundTask[]> {
    return Array.from(this.tasks.values());
  }

  async getByStatus(status: TaskStatus): Promise<BackgroundTask[]> {
    return Array.from(this.tasks.values()).filter(t => t.status === status);
  }

  async getByPriority(priority: TaskPriority): Promise<BackgroundTask[]> {
    return Array.from(this.tasks.values()).filter(t => t.priority === priority);
  }

  async getQueuedTasks(limit?: number): Promise<BackgroundTask[]> {
    const queued = Array.from(this.tasks.values())
      .filter(t => t.status === 'queued')
      .sort((a, b) => {
        // Sort by priority first, then by creation time
        const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.createdAt - b.createdAt;
      });

    return limit ? queued.slice(0, limit) : queued;
  }

  async getByAgent(agentId: string): Promise<BackgroundTask[]> {
    return Array.from(this.tasks.values()).filter(t => t.assignedAgentId === agentId);
  }

  async getOvernightEligible(priorityThreshold: TaskPriority): Promise<BackgroundTask[]> {
    const thresholdOrder = PRIORITY_ORDER[priorityThreshold];
    return Array.from(this.tasks.values()).filter(
      t => t.overnightEligible &&
           t.status === 'queued' &&
           PRIORITY_ORDER[t.priority] <= thresholdOrder
    );
  }

  async save(task: BackgroundTask): Promise<void> {
    this.tasks.set(task.id, { ...task });
  }

  async updateStatus(id: string, status: TaskStatus, error?: string, result?: unknown): Promise<void> {
    const task = this.tasks.get(id);
    if (task) {
      task.status = status;
      task.updatedAt = Date.now();
      if (error !== undefined) task.error = error;
      if (result !== undefined) task.result = result;
      if (status === 'running' && !task.startedAt) {
        task.startedAt = Date.now();
      }
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        task.completedAt = Date.now();
      }
    }
  }

  async updateProgress(id: string, progress: number): Promise<void> {
    const task = this.tasks.get(id);
    if (task) {
      task.progress = Math.min(100, Math.max(0, progress));
      task.updatedAt = Date.now();
    }
  }

  async assignToAgent(id: string, agentId: string): Promise<void> {
    const task = this.tasks.get(id);
    if (task) {
      task.assignedAgentId = agentId;
      task.updatedAt = Date.now();
    }
  }

  async unassignFromAgent(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (task) {
      task.assignedAgentId = undefined;
      task.updatedAt = Date.now();
    }
  }

  async incrementRetry(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (task) {
      task.retryCount++;
      task.updatedAt = Date.now();
    }
  }

  async delete(id: string): Promise<boolean> {
    this.checkpoints.delete(id);
    return this.tasks.delete(id);
  }

  async countByStatus(status: TaskStatus): Promise<number> {
    return Array.from(this.tasks.values()).filter(t => t.status === status).length;
  }

  async getTimedOutTasks(timeoutMs: number): Promise<BackgroundTask[]> {
    const cutoff = Date.now() - timeoutMs;
    return Array.from(this.tasks.values()).filter(
      t => t.status === 'running' && t.startedAt && t.startedAt < cutoff
    );
  }

  // Checkpoint operations
  async saveCheckpoint(checkpoint: TaskCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.taskId, { ...checkpoint });

    // Update task with checkpoint reference
    const task = this.tasks.get(checkpoint.taskId);
    if (task) {
      task.checkpoint = checkpoint;
      task.updatedAt = Date.now();
    }
  }

  async getCheckpoint(taskId: string): Promise<TaskCheckpoint | null> {
    return this.checkpoints.get(taskId) || null;
  }

  async deleteCheckpoint(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.checkpoint = undefined;
    }
    return this.checkpoints.delete(taskId);
  }

  async getAllCheckpoints(): Promise<TaskCheckpoint[]> {
    return Array.from(this.checkpoints.values());
  }
}

/**
 * Database task store implementation
 */
export class DatabaseTaskStore implements TaskStore {
  constructor(private db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS orchestration_tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        assigned_agent_id TEXT,
        required_persona_type TEXT,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        overnight_eligible INTEGER NOT NULL DEFAULT 0,
        estimated_duration_minutes INTEGER,
        started_at INTEGER,
        completed_at INTEGER,
        error TEXT,
        result TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS orchestration_checkpoints (
        task_id TEXT PRIMARY KEY,
        step INTEGER NOT NULL,
        total_steps INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT '{}',
        saved_at INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES orchestration_tasks(id) ON DELETE CASCADE
      )
    `);

    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_orchestration_tasks_status ON orchestration_tasks(status)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_orchestration_tasks_priority ON orchestration_tasks(priority)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_orchestration_tasks_agent ON orchestration_tasks(assigned_agent_id)`).catch(() => {});
  }

  private rowToTask(row: Record<string, unknown>): BackgroundTask {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      assignedAgentId: row.assigned_agent_id as string | undefined,
      requiredPersonaType: row.required_persona_type as PersonaType | undefined,
      priority: row.priority as TaskPriority,
      status: row.status as TaskStatus,
      progress: row.progress as number,
      overnightEligible: Boolean(row.overnight_eligible),
      estimatedDurationMinutes: row.estimated_duration_minutes as number | undefined,
      startedAt: row.started_at as number | undefined,
      completedAt: row.completed_at as number | undefined,
      error: row.error as string | undefined,
      result: row.result ? JSON.parse(row.result as string) : undefined,
      retryCount: row.retry_count as number,
      maxRetries: row.max_retries as number,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      checkpoint: undefined, // Loaded separately
    };
  }

  private rowToCheckpoint(row: Record<string, unknown>): TaskCheckpoint {
    return {
      taskId: row.task_id as string,
      step: row.step as number,
      totalSteps: row.total_steps as number,
      state: JSON.parse(row.state as string),
      savedAt: row.saved_at as number,
    };
  }

  async get(id: string): Promise<BackgroundTask | null> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_tasks WHERE id = ?',
      [id]
    );
    if (!result.rows[0]) return null;

    const task = this.rowToTask(result.rows[0]);
    task.checkpoint = await this.getCheckpoint(id) || undefined;
    return task;
  }

  async getAll(): Promise<BackgroundTask[]> {
    const result = await this.db.query<Record<string, unknown>>('SELECT * FROM orchestration_tasks');
    const tasks = result.rows.map(row => this.rowToTask(row));

    // Load checkpoints
    for (const task of tasks) {
      task.checkpoint = await this.getCheckpoint(task.id) || undefined;
    }

    return tasks;
  }

  async getByStatus(status: TaskStatus): Promise<BackgroundTask[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_tasks WHERE status = ?',
      [status]
    );
    return result.rows.map(row => this.rowToTask(row));
  }

  async getByPriority(priority: TaskPriority): Promise<BackgroundTask[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_tasks WHERE priority = ?',
      [priority]
    );
    return result.rows.map(row => this.rowToTask(row));
  }

  async getQueuedTasks(limit?: number): Promise<BackgroundTask[]> {
    let query = `
      SELECT * FROM orchestration_tasks
      WHERE status = 'queued'
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'normal' THEN 2
          WHEN 'low' THEN 3
        END,
        created_at ASC
    `;

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const result = await this.db.query<Record<string, unknown>>(query);
    return result.rows.map(row => this.rowToTask(row));
  }

  async getByAgent(agentId: string): Promise<BackgroundTask[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_tasks WHERE assigned_agent_id = ?',
      [agentId]
    );
    return result.rows.map(row => this.rowToTask(row));
  }

  async getOvernightEligible(priorityThreshold: TaskPriority): Promise<BackgroundTask[]> {
    const thresholdOrder = PRIORITY_ORDER[priorityThreshold];

    const result = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM orchestration_tasks
       WHERE overnight_eligible = 1
       AND status = 'queued'`
    );

    return result.rows
      .map(row => this.rowToTask(row))
      .filter(t => PRIORITY_ORDER[t.priority] <= thresholdOrder);
  }

  async save(task: BackgroundTask): Promise<void> {
    await this.db.query(
      `INSERT OR REPLACE INTO orchestration_tasks
       (id, name, description, assigned_agent_id, required_persona_type, priority, status, progress,
        overnight_eligible, estimated_duration_minutes, started_at, completed_at, error, result,
        retry_count, max_retries, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.name,
        task.description,
        task.assignedAgentId || null,
        task.requiredPersonaType || null,
        task.priority,
        task.status,
        task.progress,
        task.overnightEligible ? 1 : 0,
        task.estimatedDurationMinutes || null,
        task.startedAt || null,
        task.completedAt || null,
        task.error || null,
        task.result ? JSON.stringify(task.result) : null,
        task.retryCount,
        task.maxRetries,
        task.createdAt,
        task.updatedAt,
      ]
    );

    if (task.checkpoint) {
      await this.saveCheckpoint(task.checkpoint);
    }
  }

  async updateStatus(id: string, status: TaskStatus, error?: string, result?: unknown): Promise<void> {
    const now = Date.now();
    let startedAt = null;
    let completedAt = null;

    if (status === 'running') {
      const task = await this.get(id);
      if (task && !task.startedAt) {
        startedAt = now;
      }
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      completedAt = now;
    }

    await this.db.query(
      `UPDATE orchestration_tasks
       SET status = ?, error = ?, result = ?, updated_at = ?,
           started_at = COALESCE(?, started_at),
           completed_at = COALESCE(?, completed_at)
       WHERE id = ?`,
      [
        status,
        error || null,
        result ? JSON.stringify(result) : null,
        now,
        startedAt,
        completedAt,
        id,
      ]
    );
  }

  async updateProgress(id: string, progress: number): Promise<void> {
    await this.db.query(
      'UPDATE orchestration_tasks SET progress = ?, updated_at = ? WHERE id = ?',
      [Math.min(100, Math.max(0, progress)), Date.now(), id]
    );
  }

  async assignToAgent(id: string, agentId: string): Promise<void> {
    await this.db.query(
      'UPDATE orchestration_tasks SET assigned_agent_id = ?, updated_at = ? WHERE id = ?',
      [agentId, Date.now(), id]
    );
  }

  async unassignFromAgent(id: string): Promise<void> {
    await this.db.query(
      'UPDATE orchestration_tasks SET assigned_agent_id = NULL, updated_at = ? WHERE id = ?',
      [Date.now(), id]
    );
  }

  async incrementRetry(id: string): Promise<void> {
    await this.db.query(
      'UPDATE orchestration_tasks SET retry_count = retry_count + 1, updated_at = ? WHERE id = ?',
      [Date.now(), id]
    );
  }

  async delete(id: string): Promise<boolean> {
    await this.deleteCheckpoint(id);
    const result = await this.db.query(
      'DELETE FROM orchestration_tasks WHERE id = ?',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async countByStatus(status: TaskStatus): Promise<number> {
    const result = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM orchestration_tasks WHERE status = ?',
      [status]
    );
    return result.rows[0]?.count || 0;
  }

  async getTimedOutTasks(timeoutMs: number): Promise<BackgroundTask[]> {
    const cutoff = Date.now() - timeoutMs;
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM orchestration_tasks
       WHERE status = 'running' AND started_at IS NOT NULL AND started_at < ?`,
      [cutoff]
    );
    return result.rows.map(row => this.rowToTask(row));
  }

  // Checkpoint operations
  async saveCheckpoint(checkpoint: TaskCheckpoint): Promise<void> {
    await this.db.query(
      `INSERT OR REPLACE INTO orchestration_checkpoints
       (task_id, step, total_steps, state, saved_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        checkpoint.taskId,
        checkpoint.step,
        checkpoint.totalSteps,
        JSON.stringify(checkpoint.state),
        checkpoint.savedAt,
      ]
    );
  }

  async getCheckpoint(taskId: string): Promise<TaskCheckpoint | null> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_checkpoints WHERE task_id = ?',
      [taskId]
    );
    return result.rows[0] ? this.rowToCheckpoint(result.rows[0]) : null;
  }

  async deleteCheckpoint(taskId: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM orchestration_checkpoints WHERE task_id = ?',
      [taskId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getAllCheckpoints(): Promise<TaskCheckpoint[]> {
    const result = await this.db.query<Record<string, unknown>>('SELECT * FROM orchestration_checkpoints');
    return result.rows.map(row => this.rowToCheckpoint(row));
  }
}

/**
 * Create a task store based on type
 */
export function createTaskStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): TaskStore {
  if (type === 'database') {
    if (!dbAdapter) {
      throw new Error('Database adapter required for database store');
    }
    return new DatabaseTaskStore(dbAdapter);
  }
  return new InMemoryTaskStore();
}
