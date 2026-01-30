/**
 * Budget Manager
 *
 * Manages spending budgets with alerts and hard limits
 */

import { randomUUID } from 'crypto';
import type {
  BudgetConfig,
  BudgetStatus,
  BudgetAlert,
  BudgetPeriod,
} from './types.js';
import { AIGatewayError } from './types.js';
import { AI_GATEWAY_EVENTS, AI_GATEWAY_DEFAULTS, TABLE_NAMES } from './constants.js';

// =============================================================================
// Database Adapter Interface
// =============================================================================

export interface DatabaseAdapter {
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

// =============================================================================
// Budget Store Interface
// =============================================================================

export interface BudgetStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Create a budget */
  create(budget: Omit<BudgetConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<BudgetConfig>;

  /** Get budget by ID */
  get(id: string): Promise<BudgetConfig | null>;

  /** Get budgets for a user */
  getByUserId(userId: string): Promise<BudgetConfig[]>;

  /** Get budgets for a team */
  getByTeamId(teamId: string): Promise<BudgetConfig[]>;

  /** Update budget */
  update(id: string, updates: Partial<BudgetConfig>): Promise<BudgetConfig | null>;

  /** Delete budget */
  delete(id: string): Promise<boolean>;

  /** Get spending for a budget */
  getSpending(budgetId: string, periodStart: number, periodEnd: number): Promise<number>;

  /** Record spending */
  recordSpending(budgetId: string, amountCents: number, timestamp: number): Promise<void>;

  /** Get alerts for a budget */
  getAlerts(budgetId: string): Promise<BudgetAlert[]>;

  /** Record alert */
  recordAlert(alert: BudgetAlert): Promise<void>;
}

// =============================================================================
// Database Budget Store
// =============================================================================

interface BudgetRow {
  id: string;
  user_id: string | null;
  team_id: string | null;
  name: string;
  limit_cents: number;
  period: string;
  alert_thresholds: string;
  hard_limit: number;
  rollover: number;
  created_at: number;
  updated_at: number;
}

interface SpendingRow {
  total_cents: number;
}

interface AlertRow {
  budget_id: string;
  threshold: number;
  triggered_at: number;
  message: string;
}

export class DatabaseBudgetStore implements BudgetStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.BUDGETS} (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        team_id TEXT,
        name TEXT NOT NULL,
        limit_cents INTEGER NOT NULL,
        period TEXT NOT NULL,
        alert_thresholds TEXT NOT NULL,
        hard_limit INTEGER NOT NULL DEFAULT 1,
        rollover INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ai_budget_spending (
        id TEXT PRIMARY KEY,
        budget_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (budget_id) REFERENCES ${TABLE_NAMES.BUDGETS}(id)
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.BUDGET_ALERTS} (
        id TEXT PRIMARY KEY,
        budget_id TEXT NOT NULL,
        threshold REAL NOT NULL,
        triggered_at INTEGER NOT NULL,
        message TEXT NOT NULL,
        FOREIGN KEY (budget_id) REFERENCES ${TABLE_NAMES.BUDGETS}(id)
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_budgets_user ON ${TABLE_NAMES.BUDGETS}(user_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_budgets_team ON ${TABLE_NAMES.BUDGETS}(team_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_spending_budget ON ai_budget_spending(budget_id, timestamp)
    `);
  }

  async create(input: Omit<BudgetConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<BudgetConfig> {
    const now = Date.now();
    const budget: BudgetConfig = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO ${TABLE_NAMES.BUDGETS} (
        id, user_id, team_id, name, limit_cents, period, alert_thresholds,
        hard_limit, rollover, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        budget.id,
        budget.userId ?? null,
        budget.teamId ?? null,
        budget.name,
        budget.limitCents,
        budget.period,
        JSON.stringify(budget.alertThresholds),
        budget.hardLimit ? 1 : 0,
        budget.rollover ? 1 : 0,
        budget.createdAt,
        budget.updatedAt,
      ]
    );

    return budget;
  }

  async get(id: string): Promise<BudgetConfig | null> {
    const result = await this.db.execute<BudgetRow>(
      `SELECT * FROM ${TABLE_NAMES.BUDGETS} WHERE id = ?`,
      [id]
    );
    return result.length > 0 ? this.rowToBudget(result[0]) : null;
  }

  async getByUserId(userId: string): Promise<BudgetConfig[]> {
    const result = await this.db.execute<BudgetRow>(
      `SELECT * FROM ${TABLE_NAMES.BUDGETS} WHERE user_id = ?`,
      [userId]
    );
    return result.map(row => this.rowToBudget(row));
  }

  async getByTeamId(teamId: string): Promise<BudgetConfig[]> {
    const result = await this.db.execute<BudgetRow>(
      `SELECT * FROM ${TABLE_NAMES.BUDGETS} WHERE team_id = ?`,
      [teamId]
    );
    return result.map(row => this.rowToBudget(row));
  }

  async update(id: string, updates: Partial<BudgetConfig>): Promise<BudgetConfig | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, updatedAt: Date.now() };

    await this.db.execute(
      `UPDATE ${TABLE_NAMES.BUDGETS} SET
        name = ?, limit_cents = ?, period = ?, alert_thresholds = ?,
        hard_limit = ?, rollover = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.limitCents,
        updated.period,
        JSON.stringify(updated.alertThresholds),
        updated.hardLimit ? 1 : 0,
        updated.rollover ? 1 : 0,
        updated.updatedAt,
        id,
      ]
    );

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    await this.db.execute(
      `DELETE FROM ai_budget_spending WHERE budget_id = ?`,
      [id]
    );
    await this.db.execute(
      `DELETE FROM ${TABLE_NAMES.BUDGET_ALERTS} WHERE budget_id = ?`,
      [id]
    );
    const result = await this.db.execute(
      `DELETE FROM ${TABLE_NAMES.BUDGETS} WHERE id = ?`,
      [id]
    );
    return (result as unknown as { changes: number }).changes > 0;
  }

  async getSpending(budgetId: string, periodStart: number, periodEnd: number): Promise<number> {
    const result = await this.db.execute<SpendingRow>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total_cents FROM ai_budget_spending
       WHERE budget_id = ? AND timestamp >= ? AND timestamp < ?`,
      [budgetId, periodStart, periodEnd]
    );
    return result[0]?.total_cents ?? 0;
  }

  async recordSpending(budgetId: string, amountCents: number, timestamp: number): Promise<void> {
    await this.db.execute(
      `INSERT INTO ai_budget_spending (id, budget_id, amount_cents, timestamp)
       VALUES (?, ?, ?, ?)`,
      [randomUUID(), budgetId, amountCents, timestamp]
    );
  }

  async getAlerts(budgetId: string): Promise<BudgetAlert[]> {
    const result = await this.db.execute<AlertRow>(
      `SELECT * FROM ${TABLE_NAMES.BUDGET_ALERTS} WHERE budget_id = ? ORDER BY triggered_at DESC`,
      [budgetId]
    );
    return result.map(row => ({
      budgetId: row.budget_id,
      threshold: row.threshold,
      triggeredAt: row.triggered_at,
      message: row.message,
    }));
  }

  async recordAlert(alert: BudgetAlert): Promise<void> {
    await this.db.execute(
      `INSERT INTO ${TABLE_NAMES.BUDGET_ALERTS} (id, budget_id, threshold, triggered_at, message)
       VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), alert.budgetId, alert.threshold, alert.triggeredAt, alert.message]
    );
  }

  private rowToBudget(row: BudgetRow): BudgetConfig {
    return {
      id: row.id,
      userId: row.user_id ?? undefined,
      teamId: row.team_id ?? undefined,
      name: row.name,
      limitCents: row.limit_cents,
      period: row.period as BudgetPeriod,
      alertThresholds: JSON.parse(row.alert_thresholds),
      hardLimit: row.hard_limit === 1,
      rollover: row.rollover === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Budget Store
// =============================================================================

export class InMemoryBudgetStore implements BudgetStore {
  private budgets = new Map<string, BudgetConfig>();
  private spending = new Map<string, Array<{ amount: number; timestamp: number }>>();
  private alerts = new Map<string, BudgetAlert[]>();

  async initialize(): Promise<void> {
    // No-op
  }

  async create(input: Omit<BudgetConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<BudgetConfig> {
    const now = Date.now();
    const budget: BudgetConfig = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.budgets.set(budget.id, budget);
    return { ...budget };
  }

  async get(id: string): Promise<BudgetConfig | null> {
    const budget = this.budgets.get(id);
    return budget ? { ...budget } : null;
  }

  async getByUserId(userId: string): Promise<BudgetConfig[]> {
    return Array.from(this.budgets.values())
      .filter(b => b.userId === userId)
      .map(b => ({ ...b }));
  }

  async getByTeamId(teamId: string): Promise<BudgetConfig[]> {
    return Array.from(this.budgets.values())
      .filter(b => b.teamId === teamId)
      .map(b => ({ ...b }));
  }

  async update(id: string, updates: Partial<BudgetConfig>): Promise<BudgetConfig | null> {
    const existing = this.budgets.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, updatedAt: Date.now() };
    this.budgets.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    this.spending.delete(id);
    this.alerts.delete(id);
    return this.budgets.delete(id);
  }

  async getSpending(budgetId: string, periodStart: number, periodEnd: number): Promise<number> {
    const records = this.spending.get(budgetId) ?? [];
    return records
      .filter(r => r.timestamp >= periodStart && r.timestamp < periodEnd)
      .reduce((sum, r) => sum + r.amount, 0);
  }

  async recordSpending(budgetId: string, amountCents: number, timestamp: number): Promise<void> {
    const records = this.spending.get(budgetId) ?? [];
    records.push({ amount: amountCents, timestamp });
    this.spending.set(budgetId, records);
  }

  async getAlerts(budgetId: string): Promise<BudgetAlert[]> {
    return (this.alerts.get(budgetId) ?? []).map(a => ({ ...a }));
  }

  async recordAlert(alert: BudgetAlert): Promise<void> {
    const alerts = this.alerts.get(alert.budgetId) ?? [];
    alerts.push(alert);
    this.alerts.set(alert.budgetId, alerts);
  }
}

// =============================================================================
// Budget Manager
// =============================================================================

export interface BudgetManagerConfig {
  defaultAlertThresholds: number[];
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: BudgetManagerConfig = {
  defaultAlertThresholds: [...AI_GATEWAY_DEFAULTS.BUDGET_ALERT_THRESHOLDS],
};

export class BudgetManager {
  private readonly config: BudgetManagerConfig;
  private triggeredAlerts = new Map<string, Set<number>>();

  constructor(
    private readonly store: BudgetStore,
    config?: Partial<BudgetManagerConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a budget
   */
  async createBudget(
    name: string,
    limitCents: number,
    period: BudgetPeriod,
    options?: {
      userId?: string;
      teamId?: string;
      alertThresholds?: number[];
      hardLimit?: boolean;
      rollover?: boolean;
    }
  ): Promise<BudgetConfig> {
    return this.store.create({
      name,
      limitCents,
      period,
      userId: options?.userId,
      teamId: options?.teamId,
      alertThresholds: options?.alertThresholds ?? this.config.defaultAlertThresholds,
      hardLimit: options?.hardLimit ?? true,
      rollover: options?.rollover ?? false,
    });
  }

  /**
   * Get budget
   */
  async getBudget(id: string): Promise<BudgetConfig | null> {
    return this.store.get(id);
  }

  /**
   * Get budgets for user
   */
  async getUserBudgets(userId: string): Promise<BudgetConfig[]> {
    return this.store.getByUserId(userId);
  }

  /**
   * Get budgets for team
   */
  async getTeamBudgets(teamId: string): Promise<BudgetConfig[]> {
    return this.store.getByTeamId(teamId);
  }

  /**
   * Update budget
   */
  async updateBudget(id: string, updates: Partial<BudgetConfig>): Promise<BudgetConfig | null> {
    return this.store.update(id, updates);
  }

  /**
   * Delete budget
   */
  async deleteBudget(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  /**
   * Get budget status
   */
  async getStatus(budgetId: string): Promise<BudgetStatus | null> {
    const budget = await this.store.get(budgetId);
    if (!budget) return null;

    const { periodStart, periodEnd } = this.getPeriodBounds(budget.period);
    const spentCents = await this.store.getSpending(budgetId, periodStart, periodEnd);
    const remainingCents = Math.max(0, budget.limitCents - spentCents);
    const percentUsed = (spentCents / budget.limitCents) * 100;
    const alerts = await this.store.getAlerts(budgetId);

    return {
      budgetId,
      spentCents,
      remainingCents,
      percentUsed,
      periodStart,
      periodEnd,
      overLimit: spentCents >= budget.limitCents,
      alerts: alerts.filter(a => a.triggeredAt >= periodStart),
    };
  }

  /**
   * Check if spending is allowed
   */
  async canSpend(budgetId: string, amountCents: number): Promise<boolean> {
    const budget = await this.store.get(budgetId);
    if (!budget) return true; // No budget = no limit

    if (!budget.hardLimit) return true;

    const status = await this.getStatus(budgetId);
    if (!status) return true;

    return status.remainingCents >= amountCents;
  }

  /**
   * Record spending and check limits
   */
  async recordSpending(budgetId: string, amountCents: number): Promise<{ allowed: boolean; status: BudgetStatus }> {
    const budget = await this.store.get(budgetId);
    if (!budget) {
      throw new AIGatewayError('VALIDATION_ERROR', 'Budget not found');
    }

    // Check if allowed
    if (budget.hardLimit) {
      const canSpend = await this.canSpend(budgetId, amountCents);
      if (!canSpend) {
        const status = (await this.getStatus(budgetId))!;
        this.emit(AI_GATEWAY_EVENTS.BUDGET_EXCEEDED, { budgetId, budget, status });
        return { allowed: false, status };
      }
    }

    // Record the spending
    await this.store.recordSpending(budgetId, amountCents, Date.now());

    // Get updated status and check thresholds
    const status = (await this.getStatus(budgetId))!;
    await this.checkAlerts(budget, status);

    return { allowed: true, status };
  }

  /**
   * Check and trigger budget alerts
   */
  private async checkAlerts(budget: BudgetConfig, status: BudgetStatus): Promise<void> {
    const budgetKey = `${budget.id}:${status.periodStart}`;
    const triggered = this.triggeredAlerts.get(budgetKey) ?? new Set();

    for (const threshold of budget.alertThresholds) {
      if (status.percentUsed >= threshold && !triggered.has(threshold)) {
        triggered.add(threshold);
        this.triggeredAlerts.set(budgetKey, triggered);

        const alert: BudgetAlert = {
          budgetId: budget.id,
          threshold,
          triggeredAt: Date.now(),
          message: `Budget "${budget.name}" has reached ${threshold}% (${status.spentCents} / ${budget.limitCents} cents)`,
        };

        await this.store.recordAlert(alert);

        if (threshold >= 100) {
          this.emit(AI_GATEWAY_EVENTS.BUDGET_EXCEEDED, { budget, status, alert });
        } else {
          this.emit(AI_GATEWAY_EVENTS.BUDGET_WARNING, { budget, status, alert });
        }
      }
    }
  }

  /**
   * Reset budget period (for testing or manual reset)
   */
  async resetPeriod(budgetId: string): Promise<void> {
    const budget = await this.store.get(budgetId);
    if (!budget) return;

    const budgetKey = `${budget.id}:${this.getPeriodBounds(budget.period).periodStart}`;
    this.triggeredAlerts.delete(budgetKey);

    this.emit(AI_GATEWAY_EVENTS.BUDGET_RESET, { budgetId });
  }

  /**
   * Get period start and end times
   */
  private getPeriodBounds(period: BudgetPeriod): { periodStart: number; periodEnd: number } {
    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;

    switch (period) {
      case 'hourly':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
        periodEnd = new Date(periodStart.getTime() + 60 * 60 * 1000);
        break;

      case 'daily':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
        break;

      case 'weekly':
        const dayOfWeek = now.getDay();
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
        periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;

      case 'monthly':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;

      case 'total':
        periodStart = new Date(0);
        periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        break;

      default:
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
    }

    return { periodStart: periodStart.getTime(), periodEnd: periodEnd.getTime() };
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createBudgetStore(type: 'memory'): InMemoryBudgetStore;
export function createBudgetStore(type: 'database', db: DatabaseAdapter): DatabaseBudgetStore;
export function createBudgetStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): BudgetStore {
  if (type === 'memory') {
    return new InMemoryBudgetStore();
  }
  if (!db) {
    throw new AIGatewayError('VALIDATION_ERROR', 'Database adapter required for database store');
  }
  return new DatabaseBudgetStore(db);
}

export function createBudgetManager(
  store: BudgetStore,
  config?: Partial<BudgetManagerConfig>
): BudgetManager {
  return new BudgetManager(store, config);
}
