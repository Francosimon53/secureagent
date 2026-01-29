/**
 * Subscription Store
 *
 * Persistence layer for subscription tracking and analysis.
 */

import { randomUUID } from 'crypto';
import type {
  Subscription,
  SubscriptionCategory,
  SubscriptionQueryOptions,
  SubscriptionUsage,
} from '../types.js';

/**
 * Interface for subscription storage
 */
export interface SubscriptionStore {
  initialize(): Promise<void>;

  // CRUD operations
  create(subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<Subscription>;
  get(subscriptionId: string): Promise<Subscription | null>;
  update(subscriptionId: string, updates: Partial<Subscription>): Promise<Subscription | null>;
  delete(subscriptionId: string): Promise<boolean>;

  // Query operations
  list(userId: string, options?: SubscriptionQueryOptions): Promise<Subscription[]>;
  count(userId: string, options?: SubscriptionQueryOptions): Promise<number>;

  // Specialized queries
  getActive(userId: string): Promise<Subscription[]>;
  getUnused(userId: string, thresholdDays: number): Promise<Subscription[]>;
  getUpcomingRenewals(userId: string, withinDays: number): Promise<Subscription[]>;
  getByProvider(userId: string, provider: string): Promise<Subscription[]>;

  // Usage tracking
  updateUsage(subscriptionId: string, usage: Partial<SubscriptionUsage>): Promise<boolean>;
  recordUsage(subscriptionId: string): Promise<boolean>;

  // Analytics
  getTotalMonthlySpend(userId: string): Promise<number>;
  getSpendByCategory(userId: string): Promise<Map<SubscriptionCategory, number>>;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Database-backed subscription store
 */
export class DatabaseSubscriptionStore implements SubscriptionStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_url TEXT,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        frequency TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        detected_from TEXT NOT NULL,
        category TEXT NOT NULL,
        start_date INTEGER NOT NULL,
        next_billing_date INTEGER,
        trial_ends_at INTEGER,
        cancelled_at INTEGER,
        usage_metrics TEXT,
        cancellation_steps TEXT,
        cancellation_url TEXT,
        linked_transactions TEXT DEFAULT '[]',
        tags TEXT DEFAULT '[]',
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, status)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user_next_billing ON subscriptions(user_id, next_billing_date)
    `);
  }

  async create(subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<Subscription> {
    const now = Date.now();
    const id = randomUUID();

    const item: Subscription = {
      ...subscription,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO subscriptions (
        id, user_id, name, provider, provider_url, amount, currency, frequency, status,
        detected_from, category, start_date, next_billing_date, trial_ends_at, cancelled_at,
        usage_metrics, cancellation_steps, cancellation_url, linked_transactions, tags, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.name,
        item.provider,
        item.providerUrl ?? null,
        item.amount,
        item.currency,
        item.frequency,
        item.status,
        item.detectedFrom,
        item.category,
        item.startDate,
        item.nextBillingDate ?? null,
        item.trialEndsAt ?? null,
        item.cancelledAt ?? null,
        item.usageMetrics ? JSON.stringify(item.usageMetrics) : null,
        item.cancellationSteps ? JSON.stringify(item.cancellationSteps) : null,
        item.cancellationUrl ?? null,
        JSON.stringify(item.linkedTransactions),
        JSON.stringify(item.tags),
        item.notes ?? null,
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async get(subscriptionId: string): Promise<Subscription | null> {
    const result = await this.db.query<SubscriptionRow>(
      'SELECT * FROM subscriptions WHERE id = ?',
      [subscriptionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToSubscription(result.rows[0]);
  }

  async update(subscriptionId: string, updates: Partial<Subscription>): Promise<Subscription | null> {
    const existing = await this.get(subscriptionId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const updated: Subscription = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    // Handle cancellation timestamp
    if (updates.status === 'cancelled' && !updated.cancelledAt) {
      updated.cancelledAt = now;
    }

    await this.db.execute(
      `UPDATE subscriptions SET
        name = ?, provider = ?, provider_url = ?, amount = ?, currency = ?, frequency = ?,
        status = ?, detected_from = ?, category = ?, start_date = ?, next_billing_date = ?,
        trial_ends_at = ?, cancelled_at = ?, usage_metrics = ?, cancellation_steps = ?,
        cancellation_url = ?, linked_transactions = ?, tags = ?, notes = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.provider,
        updated.providerUrl ?? null,
        updated.amount,
        updated.currency,
        updated.frequency,
        updated.status,
        updated.detectedFrom,
        updated.category,
        updated.startDate,
        updated.nextBillingDate ?? null,
        updated.trialEndsAt ?? null,
        updated.cancelledAt ?? null,
        updated.usageMetrics ? JSON.stringify(updated.usageMetrics) : null,
        updated.cancellationSteps ? JSON.stringify(updated.cancellationSteps) : null,
        updated.cancellationUrl ?? null,
        JSON.stringify(updated.linkedTransactions),
        JSON.stringify(updated.tags),
        updated.notes ?? null,
        updated.updatedAt,
        subscriptionId,
      ]
    );

    return updated;
  }

  async delete(subscriptionId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM subscriptions WHERE id = ?',
      [subscriptionId]
    );
    return result.changes > 0;
  }

  async list(userId: string, options: SubscriptionQueryOptions = {}): Promise<Subscription[]> {
    const { sql, params } = this.buildQuerySQL(userId, options);
    const result = await this.db.query<SubscriptionRow>(sql, params);
    return result.rows.map(row => this.rowToSubscription(row));
  }

  async count(userId: string, options: SubscriptionQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildQuerySQL(userId, options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async getActive(userId: string): Promise<Subscription[]> {
    return this.list(userId, { status: ['active', 'trial'] });
  }

  async getUnused(userId: string, thresholdDays: number): Promise<Subscription[]> {
    const subscriptions = await this.getActive(userId);
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    return subscriptions.filter(sub => {
      if (!sub.usageMetrics) return false;
      if (!sub.usageMetrics.lastUsedAt) return true;
      return (now - sub.usageMetrics.lastUsedAt) > thresholdMs;
    });
  }

  async getUpcomingRenewals(userId: string, withinDays: number): Promise<Subscription[]> {
    const now = Date.now();
    const futureDate = now + (withinDays * 24 * 60 * 60 * 1000);

    const result = await this.db.query<SubscriptionRow>(
      `SELECT * FROM subscriptions
       WHERE user_id = ? AND status IN ('active', 'trial')
       AND next_billing_date IS NOT NULL AND next_billing_date <= ?
       ORDER BY next_billing_date ASC`,
      [userId, futureDate]
    );

    return result.rows.map(row => this.rowToSubscription(row));
  }

  async getByProvider(userId: string, provider: string): Promise<Subscription[]> {
    const result = await this.db.query<SubscriptionRow>(
      'SELECT * FROM subscriptions WHERE user_id = ? AND provider = ?',
      [userId, provider]
    );
    return result.rows.map(row => this.rowToSubscription(row));
  }

  async updateUsage(subscriptionId: string, usage: Partial<SubscriptionUsage>): Promise<boolean> {
    const existing = await this.get(subscriptionId);
    if (!existing) {
      return false;
    }

    const updatedUsage: SubscriptionUsage = {
      ...existing.usageMetrics,
      usagePeriodDays: usage.usagePeriodDays ?? existing.usageMetrics?.usagePeriodDays ?? 30,
      isUnused: usage.isUnused ?? existing.usageMetrics?.isUnused ?? false,
      ...usage,
    };

    await this.update(subscriptionId, { usageMetrics: updatedUsage });
    return true;
  }

  async recordUsage(subscriptionId: string): Promise<boolean> {
    const existing = await this.get(subscriptionId);
    if (!existing) {
      return false;
    }

    const now = Date.now();
    const currentUsage = existing.usageMetrics ?? { usagePeriodDays: 30, isUnused: false };

    await this.updateUsage(subscriptionId, {
      lastUsedAt: now,
      usageCount: (currentUsage.usageCount ?? 0) + 1,
      isUnused: false,
      unusedDays: 0,
    });

    return true;
  }

  async getTotalMonthlySpend(userId: string): Promise<number> {
    const subscriptions = await this.getActive(userId);

    return subscriptions.reduce((total, sub) => {
      let monthlyAmount = sub.amount;

      switch (sub.frequency) {
        case 'weekly':
          monthlyAmount = sub.amount * 4.33;
          break;
        case 'quarterly':
          monthlyAmount = sub.amount / 3;
          break;
        case 'annually':
          monthlyAmount = sub.amount / 12;
          break;
      }

      return total + monthlyAmount;
    }, 0);
  }

  async getSpendByCategory(userId: string): Promise<Map<SubscriptionCategory, number>> {
    const subscriptions = await this.getActive(userId);
    const categorySpend = new Map<SubscriptionCategory, number>();

    for (const sub of subscriptions) {
      let monthlyAmount = sub.amount;

      switch (sub.frequency) {
        case 'weekly':
          monthlyAmount = sub.amount * 4.33;
          break;
        case 'quarterly':
          monthlyAmount = sub.amount / 3;
          break;
        case 'annually':
          monthlyAmount = sub.amount / 12;
          break;
      }

      const current = categorySpend.get(sub.category) ?? 0;
      categorySpend.set(sub.category, current + monthlyAmount);
    }

    return categorySpend;
  }

  private buildQuerySQL(
    userId: string,
    options: SubscriptionQueryOptions,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (options.status && options.status.length > 0) {
      const placeholders = options.status.map(() => '?').join(',');
      conditions.push(`status IN (${placeholders})`);
      params.push(...options.status);
    }

    if (options.category && options.category.length > 0) {
      const placeholders = options.category.map(() => '?').join(',');
      conditions.push(`category IN (${placeholders})`);
      params.push(...options.category);
    }

    if (options.frequency && options.frequency.length > 0) {
      const placeholders = options.frequency.map(() => '?').join(',');
      conditions.push(`frequency IN (${placeholders})`);
      params.push(...options.frequency);
    }

    if (options.source && options.source.length > 0) {
      const placeholders = options.source.map(() => '?').join(',');
      conditions.push(`detected_from IN (${placeholders})`);
      params.push(...options.source);
    }

    const whereClause = conditions.join(' AND ');

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM subscriptions WHERE ${whereClause}`,
        params,
      };
    }

    let orderBy = 'created_at DESC';
    if (options.orderBy) {
      const direction = options.orderDirection === 'asc' ? 'ASC' : 'DESC';
      const column = {
        amount: 'amount',
        nextBillingDate: 'next_billing_date',
        createdAt: 'created_at',
      }[options.orderBy];
      orderBy = `${column} ${direction}`;
    }

    let sql = `SELECT * FROM subscriptions WHERE ${whereClause} ORDER BY ${orderBy}`;

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

  private rowToSubscription(row: SubscriptionRow): Subscription {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      provider: row.provider,
      providerUrl: row.provider_url ?? undefined,
      amount: row.amount,
      currency: row.currency,
      frequency: row.frequency as Subscription['frequency'],
      status: row.status as Subscription['status'],
      detectedFrom: row.detected_from as Subscription['detectedFrom'],
      category: row.category as Subscription['category'],
      startDate: row.start_date,
      nextBillingDate: row.next_billing_date ?? undefined,
      trialEndsAt: row.trial_ends_at ?? undefined,
      cancelledAt: row.cancelled_at ?? undefined,
      usageMetrics: row.usage_metrics ? JSON.parse(row.usage_metrics) : undefined,
      cancellationSteps: row.cancellation_steps ? JSON.parse(row.cancellation_steps) : undefined,
      cancellationUrl: row.cancellation_url ?? undefined,
      linkedTransactions: JSON.parse(row.linked_transactions),
      tags: JSON.parse(row.tags),
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * In-memory subscription store for testing
 */
export class InMemorySubscriptionStore implements SubscriptionStore {
  private subscriptions = new Map<string, Subscription>();

  async initialize(): Promise<void> {
    // No-op
  }

  async create(subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<Subscription> {
    const now = Date.now();
    const item: Subscription = {
      ...subscription,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.subscriptions.set(item.id, item);
    return item;
  }

  async get(subscriptionId: string): Promise<Subscription | null> {
    return this.subscriptions.get(subscriptionId) ?? null;
  }

  async update(subscriptionId: string, updates: Partial<Subscription>): Promise<Subscription | null> {
    const existing = this.subscriptions.get(subscriptionId);
    if (!existing) return null;

    const now = Date.now();
    const updated: Subscription = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    if (updates.status === 'cancelled' && !updated.cancelledAt) {
      updated.cancelledAt = now;
    }

    this.subscriptions.set(subscriptionId, updated);
    return updated;
  }

  async delete(subscriptionId: string): Promise<boolean> {
    return this.subscriptions.delete(subscriptionId);
  }

  async list(userId: string, options: SubscriptionQueryOptions = {}): Promise<Subscription[]> {
    let items = Array.from(this.subscriptions.values()).filter(s => s.userId === userId);

    if (options.status && options.status.length > 0) {
      items = items.filter(s => options.status!.includes(s.status));
    }

    if (options.category && options.category.length > 0) {
      items = items.filter(s => options.category!.includes(s.category));
    }

    if (options.frequency && options.frequency.length > 0) {
      items = items.filter(s => options.frequency!.includes(s.frequency));
    }

    items.sort((a, b) => b.createdAt - a.createdAt);

    if (options.offset) {
      items = items.slice(options.offset);
    }

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  async count(userId: string, options: SubscriptionQueryOptions = {}): Promise<number> {
    const items = await this.list(userId, { ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async getActive(userId: string): Promise<Subscription[]> {
    return this.list(userId, { status: ['active', 'trial'] });
  }

  async getUnused(userId: string, thresholdDays: number): Promise<Subscription[]> {
    const subscriptions = await this.getActive(userId);
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    return subscriptions.filter(sub => {
      if (!sub.usageMetrics) return false;
      if (!sub.usageMetrics.lastUsedAt) return true;
      return (now - sub.usageMetrics.lastUsedAt) > thresholdMs;
    });
  }

  async getUpcomingRenewals(userId: string, withinDays: number): Promise<Subscription[]> {
    const now = Date.now();
    const futureDate = now + (withinDays * 24 * 60 * 60 * 1000);

    return Array.from(this.subscriptions.values())
      .filter(s =>
        s.userId === userId &&
        ['active', 'trial'].includes(s.status) &&
        s.nextBillingDate &&
        s.nextBillingDate <= futureDate
      )
      .sort((a, b) => (a.nextBillingDate ?? 0) - (b.nextBillingDate ?? 0));
  }

  async getByProvider(userId: string, provider: string): Promise<Subscription[]> {
    return Array.from(this.subscriptions.values())
      .filter(s => s.userId === userId && s.provider === provider);
  }

  async updateUsage(subscriptionId: string, usage: Partial<SubscriptionUsage>): Promise<boolean> {
    const existing = this.subscriptions.get(subscriptionId);
    if (!existing) return false;

    const updatedUsage: SubscriptionUsage = {
      ...existing.usageMetrics,
      usagePeriodDays: usage.usagePeriodDays ?? existing.usageMetrics?.usagePeriodDays ?? 30,
      isUnused: usage.isUnused ?? existing.usageMetrics?.isUnused ?? false,
      ...usage,
    };

    await this.update(subscriptionId, { usageMetrics: updatedUsage });
    return true;
  }

  async recordUsage(subscriptionId: string): Promise<boolean> {
    const existing = this.subscriptions.get(subscriptionId);
    if (!existing) return false;

    const currentUsage = existing.usageMetrics ?? { usagePeriodDays: 30, isUnused: false };

    await this.updateUsage(subscriptionId, {
      lastUsedAt: Date.now(),
      usageCount: (currentUsage.usageCount ?? 0) + 1,
      isUnused: false,
      unusedDays: 0,
    });

    return true;
  }

  async getTotalMonthlySpend(userId: string): Promise<number> {
    const subscriptions = await this.getActive(userId);

    return subscriptions.reduce((total, sub) => {
      let monthlyAmount = sub.amount;

      switch (sub.frequency) {
        case 'weekly':
          monthlyAmount = sub.amount * 4.33;
          break;
        case 'quarterly':
          monthlyAmount = sub.amount / 3;
          break;
        case 'annually':
          monthlyAmount = sub.amount / 12;
          break;
      }

      return total + monthlyAmount;
    }, 0);
  }

  async getSpendByCategory(userId: string): Promise<Map<SubscriptionCategory, number>> {
    const subscriptions = await this.getActive(userId);
    const categorySpend = new Map<SubscriptionCategory, number>();

    for (const sub of subscriptions) {
      let monthlyAmount = sub.amount;

      switch (sub.frequency) {
        case 'weekly':
          monthlyAmount = sub.amount * 4.33;
          break;
        case 'quarterly':
          monthlyAmount = sub.amount / 3;
          break;
        case 'annually':
          monthlyAmount = sub.amount / 12;
          break;
      }

      const current = categorySpend.get(sub.category) ?? 0;
      categorySpend.set(sub.category, current + monthlyAmount);
    }

    return categorySpend;
  }
}

// Row type for database
interface SubscriptionRow {
  id: string;
  user_id: string;
  name: string;
  provider: string;
  provider_url: string | null;
  amount: number;
  currency: string;
  frequency: string;
  status: string;
  detected_from: string;
  category: string;
  start_date: number;
  next_billing_date: number | null;
  trial_ends_at: number | null;
  cancelled_at: number | null;
  usage_metrics: string | null;
  cancellation_steps: string | null;
  cancellation_url: string | null;
  linked_transactions: string;
  tags: string;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Factory function to create subscription store
 */
export function createSubscriptionStore(type: 'memory'): InMemorySubscriptionStore;
export function createSubscriptionStore(type: 'database', db: DatabaseAdapter): DatabaseSubscriptionStore;
export function createSubscriptionStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): SubscriptionStore {
  if (type === 'memory') {
    return new InMemorySubscriptionStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseSubscriptionStore(db);
}
