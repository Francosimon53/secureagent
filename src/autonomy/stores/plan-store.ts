/**
 * Plan Store
 * Persists plans and their execution history
 */

import { EventEmitter } from 'events';
import type {
  Plan,
  PlanStep,
  PlanStatus,
  StepStatus,
  StepResult,
} from '../types.js';

/**
 * Plan store interface
 */
export interface PlanStore {
  // Plan operations
  savePlan(plan: Plan): Promise<void>;
  getPlan(planId: string): Promise<Plan | null>;
  updatePlanStatus(planId: string, status: PlanStatus): Promise<void>;
  deletePlan(planId: string): Promise<boolean>;
  listPlans(options?: {
    goalId?: string;
    status?: PlanStatus;
    limit?: number;
    offset?: number;
  }): Promise<Plan[]>;
  countPlans(options?: { goalId?: string; status?: PlanStatus }): Promise<number>;

  // Step operations
  updateStepStatus(planId: string, stepId: string, status: StepStatus): Promise<void>;
  updateStepResult(planId: string, stepId: string, result: unknown): Promise<void>;

  // Query operations
  getPlansByGoal(goalId: string): Promise<Plan[]>;
  getActivePlans(): Promise<Plan[]>;

  // Cleanup
  cleanupOldPlans(olderThanMs: number): Promise<number>;
}

/**
 * In-memory plan store
 */
export class InMemoryPlanStore extends EventEmitter implements PlanStore {
  private plans: Map<string, Plan> = new Map();

  async savePlan(plan: Plan): Promise<void> {
    this.plans.set(plan.id, this.clonePlan(plan));
  }

  async getPlan(planId: string): Promise<Plan | null> {
    const plan = this.plans.get(planId);
    return plan ? this.clonePlan(plan) : null;
  }

  async updatePlanStatus(planId: string, status: PlanStatus): Promise<void> {
    const plan = this.plans.get(planId);
    if (plan) {
      plan.status = status;
      if (['completed', 'failed', 'cancelled'].includes(status)) {
        plan.completedAt = Date.now();
      }
    }
  }

  async deletePlan(planId: string): Promise<boolean> {
    return this.plans.delete(planId);
  }

  async listPlans(options?: {
    goalId?: string;
    status?: PlanStatus;
    limit?: number;
    offset?: number;
  }): Promise<Plan[]> {
    let plans = Array.from(this.plans.values());

    // Filter by goalId
    if (options?.goalId) {
      plans = plans.filter(p => p.goalId === options.goalId);
    }

    // Filter by status
    if (options?.status) {
      plans = plans.filter(p => p.status === options.status);
    }

    // Sort by creation time (newest first)
    plans.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? plans.length;

    return plans.slice(offset, offset + limit).map(p => this.clonePlan(p));
  }

  async countPlans(options?: { goalId?: string; status?: PlanStatus }): Promise<number> {
    let count = 0;
    for (const plan of this.plans.values()) {
      if (options?.goalId && plan.goalId !== options.goalId) continue;
      if (options?.status && plan.status !== options.status) continue;
      count++;
    }
    return count;
  }

  async updateStepStatus(planId: string, stepId: string, status: StepStatus): Promise<void> {
    const plan = this.plans.get(planId);
    if (plan) {
      const step = plan.steps.find(s => s.id === stepId);
      if (step) {
        step.status = status;
        if (['completed', 'failed', 'skipped'].includes(status)) {
          step.completedAt = Date.now();
        } else if (status === 'executing') {
          step.startedAt = Date.now();
        }
      }
    }
  }

  async updateStepResult(planId: string, stepId: string, result: unknown): Promise<void> {
    const plan = this.plans.get(planId);
    if (plan) {
      const step = plan.steps.find(s => s.id === stepId);
      if (step) {
        step.result = result as StepResult | undefined;
      }
    }
  }

  async getPlansByGoal(goalId: string): Promise<Plan[]> {
    return this.listPlans({ goalId });
  }

  async getActivePlans(): Promise<Plan[]> {
    const active: Plan[] = [];
    for (const plan of this.plans.values()) {
      if (['pending', 'executing', 'paused'].includes(plan.status)) {
        active.push(this.clonePlan(plan));
      }
    }
    return active;
  }

  async cleanupOldPlans(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let count = 0;

    for (const [id, plan] of this.plans) {
      const planTime = plan.completedAt ?? plan.createdAt;
      if (planTime < cutoff && ['completed', 'failed', 'cancelled'].includes(plan.status)) {
        this.plans.delete(id);
        count++;
      }
    }

    return count;
  }

  // Helper methods
  clear(): void {
    this.plans.clear();
  }

  getPlanCount(): number {
    return this.plans.size;
  }

  private clonePlan(plan: Plan): Plan {
    return {
      ...plan,
      steps: plan.steps.map(s => ({ ...s })),
    };
  }
}

/**
 * Database plan store
 */
export class DatabasePlanStore extends EventEmitter implements PlanStore {
  private readonly tableName: string;
  private readonly stepsTableName: string;
  private db?: {
    run: (sql: string, params?: unknown[]) => Promise<void>;
    get: <T>(sql: string, params?: unknown[]) => Promise<T | undefined>;
    all: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  };

  constructor(db?: unknown, options?: { tableName?: string; stepsTableName?: string }) {
    super();
    this.tableName = options?.tableName ?? 'autonomy_plans';
    this.stepsTableName = options?.stepsTableName ?? 'autonomy_plan_steps';
    this.db = db as typeof this.db;
  }

  async initialize(): Promise<void> {
    if (!this.db) return;

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL,
        status TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        current_step_index INTEGER NOT NULL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_goal_id ON ${this.tableName}(goal_id)
    `);

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_status ON ${this.tableName}(status)
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.stepsTableName} (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        step_order INTEGER NOT NULL,
        status TEXT NOT NULL,
        data TEXT NOT NULL,
        result TEXT,
        started_at INTEGER,
        completed_at INTEGER,
        FOREIGN KEY (plan_id) REFERENCES ${this.tableName}(id) ON DELETE CASCADE
      )
    `);

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_${this.stepsTableName}_plan_id ON ${this.stepsTableName}(plan_id)
    `);
  }

  async savePlan(plan: Plan): Promise<void> {
    if (!this.db) return;

    await this.db.run(`
      INSERT OR REPLACE INTO ${this.tableName}
      (id, goal_id, status, version, current_step_index, total_cost, data, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      plan.id,
      plan.goalId,
      plan.status,
      plan.version,
      plan.currentStepIndex,
      plan.totalCost ?? 0,
      JSON.stringify(plan),
      plan.createdAt,
      plan.completedAt,
    ]);

    // Save steps separately for better querying
    for (const step of plan.steps) {
      await this.db.run(`
        INSERT OR REPLACE INTO ${this.stepsTableName}
        (id, plan_id, step_order, status, data, result, started_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        step.id,
        plan.id,
        step.order,
        step.status,
        JSON.stringify(step),
        step.result ? JSON.stringify(step.result) : null,
        step.startedAt,
        step.completedAt,
      ]);
    }
  }

  async getPlan(planId: string): Promise<Plan | null> {
    if (!this.db) return null;

    const row = await this.db.get<{ data: string }>(
      `SELECT data FROM ${this.tableName} WHERE id = ?`,
      [planId]
    );

    return row ? JSON.parse(row.data) : null;
  }

  async updatePlanStatus(planId: string, status: PlanStatus): Promise<void> {
    if (!this.db) return;

    const now = Date.now();
    const completedAt = ['completed', 'failed', 'cancelled'].includes(status) ? now : null;

    // Get current plan to update the data
    const plan = await this.getPlan(planId);
    if (plan) {
      plan.status = status;
      if (completedAt) plan.completedAt = completedAt;

      await this.db.run(`
        UPDATE ${this.tableName}
        SET status = ?, completed_at = ?, data = ?, updated_at = ?
        WHERE id = ?
      `, [status, completedAt, JSON.stringify(plan), now, planId]);
    }
  }

  async deletePlan(planId: string): Promise<boolean> {
    if (!this.db) return false;

    await this.db.run(
      `DELETE FROM ${this.stepsTableName} WHERE plan_id = ?`,
      [planId]
    );

    await this.db.run(
      `DELETE FROM ${this.tableName} WHERE id = ?`,
      [planId]
    );

    return true;
  }

  async listPlans(options?: {
    goalId?: string;
    status?: PlanStatus;
    limit?: number;
    offset?: number;
  }): Promise<Plan[]> {
    if (!this.db) return [];

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.goalId) {
      conditions.push('goal_id = ?');
      params.push(options.goalId);
    }

    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const rows = await this.db.all<{ data: string }>(
      `SELECT data FROM ${this.tableName} ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return rows.map(row => JSON.parse(row.data));
  }

  async countPlans(options?: { goalId?: string; status?: PlanStatus }): Promise<number> {
    if (!this.db) return 0;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.goalId) {
      conditions.push('goal_id = ?');
      params.push(options.goalId);
    }

    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const row = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`,
      params
    );

    return row?.count ?? 0;
  }

  async updateStepStatus(planId: string, stepId: string, status: StepStatus): Promise<void> {
    if (!this.db) return;

    const now = Date.now();
    const startedAt = status === 'executing' ? now : undefined;
    const completedAt = ['completed', 'failed', 'skipped'].includes(status) ? now : undefined;

    // Update step in steps table
    const updates: string[] = ['status = ?'];
    const params: unknown[] = [status];

    if (startedAt !== undefined) {
      updates.push('started_at = ?');
      params.push(startedAt);
    }

    if (completedAt !== undefined) {
      updates.push('completed_at = ?');
      params.push(completedAt);
    }

    params.push(stepId);

    await this.db.run(
      `UPDATE ${this.stepsTableName} SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // Update full plan data
    const plan = await this.getPlan(planId);
    if (plan) {
      const step = plan.steps.find(s => s.id === stepId);
      if (step) {
        step.status = status;
        if (startedAt) step.startedAt = startedAt;
        if (completedAt) step.completedAt = completedAt;
      }
      await this.db.run(
        `UPDATE ${this.tableName} SET data = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(plan), now, planId]
      );
    }
  }

  async updateStepResult(planId: string, stepId: string, result: unknown): Promise<void> {
    if (!this.db) return;

    const now = Date.now();

    // Update step in steps table
    await this.db.run(
      `UPDATE ${this.stepsTableName} SET result = ? WHERE id = ?`,
      [JSON.stringify(result), stepId]
    );

    // Update full plan data
    const plan = await this.getPlan(planId);
    if (plan) {
      const step = plan.steps.find(s => s.id === stepId);
      if (step) {
        step.result = result as StepResult | undefined;
      }
      await this.db.run(
        `UPDATE ${this.tableName} SET data = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(plan), now, planId]
      );
    }
  }

  async getPlansByGoal(goalId: string): Promise<Plan[]> {
    return this.listPlans({ goalId });
  }

  async getActivePlans(): Promise<Plan[]> {
    if (!this.db) return [];

    const rows = await this.db.all<{ data: string }>(
      `SELECT data FROM ${this.tableName}
       WHERE status IN ('pending', 'executing', 'paused')
       ORDER BY created_at DESC`
    );

    return rows.map(row => JSON.parse(row.data));
  }

  async cleanupOldPlans(olderThanMs: number): Promise<number> {
    if (!this.db) return 0;

    const cutoff = Date.now() - olderThanMs;

    // Get IDs to delete
    const rows = await this.db.all<{ id: string }>(
      `SELECT id FROM ${this.tableName}
       WHERE COALESCE(completed_at, created_at) < ?
       AND status IN ('completed', 'failed', 'cancelled')`,
      [cutoff]
    );

    const ids = rows.map(r => r.id);

    if (ids.length > 0) {
      // Delete steps
      await this.db.run(
        `DELETE FROM ${this.stepsTableName}
         WHERE plan_id IN (${ids.map(() => '?').join(',')})`,
        ids
      );

      // Delete plans
      await this.db.run(
        `DELETE FROM ${this.tableName}
         WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
    }

    return ids.length;
  }
}

/**
 * Create a plan store
 */
export function createPlanStore(
  type: 'memory' | 'database' = 'memory',
  db?: unknown,
  options?: { tableName?: string; stepsTableName?: string }
): PlanStore {
  if (type === 'database') {
    return new DatabasePlanStore(db, options);
  }
  return new InMemoryPlanStore();
}
