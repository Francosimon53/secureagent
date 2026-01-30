/**
 * Subscription Store
 *
 * Persistence layer for subscription data
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from './index.js';
import type {
  Subscription,
  SubscriptionCreateInput,
  SubscriptionUpdateInput,
  SubscriptionStatus,
  SubscriptionTier,
} from '../types.js';

// =============================================================================
// Subscription Store Interface
// =============================================================================

/** Upsert subscription input (includes optional id) */
export type SubscriptionUpsertInput = Partial<Subscription> & {
  tenantId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  /** Stripe customer ID (for webhook handling) */
  stripeCustomerId?: string;
};

export interface SubscriptionStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Create a new subscription */
  createSubscription(input: SubscriptionCreateInput): Promise<Subscription>;

  /** Create or update subscription (upsert by stripeSubscriptionId or tenantId) */
  upsertSubscription(input: SubscriptionUpsertInput): Promise<Subscription>;

  /** Get subscription by ID */
  getSubscription(subscriptionId: string): Promise<Subscription | null>;

  /** Get subscription by tenant ID */
  getSubscriptionByTenantId(tenantId: string): Promise<Subscription | null>;

  /** Get subscription by Stripe subscription ID */
  getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | null>;

  /** Update subscription */
  updateSubscription(subscriptionId: string, updates: SubscriptionUpdateInput): Promise<Subscription | null>;

  /** Delete subscription */
  deleteSubscription(subscriptionId: string): Promise<boolean>;

  /** List subscriptions by status */
  listSubscriptionsByStatus(status: SubscriptionStatus): Promise<Subscription[]>;

  /** List subscriptions expiring soon (for renewal reminders) */
  listSubscriptionsExpiringSoon(withinDays: number): Promise<Subscription[]>;

  /** List subscriptions with active trials ending soon */
  listTrialsEndingSoon(withinDays: number): Promise<Subscription[]>;
}

// =============================================================================
// Database Row Type
// =============================================================================

interface SubscriptionRow {
  id: string;
  tenant_id: string;
  tier: string;
  status: string;
  interval: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: number;
  canceled_at: number | null;
  trial_start: number | null;
  trial_end: number | null;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseSubscriptionStore implements SubscriptionStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT UNIQUE NOT NULL,
        tier TEXT NOT NULL DEFAULT 'free',
        status TEXT NOT NULL DEFAULT 'active',
        interval TEXT NOT NULL DEFAULT 'monthly',
        stripe_subscription_id TEXT,
        stripe_price_id TEXT,
        current_period_start INTEGER NOT NULL,
        current_period_end INTEGER NOT NULL,
        cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
        canceled_at INTEGER,
        trial_start INTEGER,
        trial_end INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON subscriptions(tenant_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)
    `);
  }

  async createSubscription(input: SubscriptionCreateInput): Promise<Subscription> {
    const now = Date.now();
    const subscription: Subscription = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO subscriptions (
        id, tenant_id, tier, status, interval, stripe_subscription_id, stripe_price_id,
        current_period_start, current_period_end, cancel_at_period_end,
        canceled_at, trial_start, trial_end, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        subscription.id,
        subscription.tenantId,
        subscription.tier,
        subscription.status,
        subscription.interval,
        subscription.stripeSubscriptionId ?? null,
        subscription.stripePriceId ?? null,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
        subscription.cancelAtPeriodEnd ? 1 : 0,
        subscription.canceledAt ?? null,
        subscription.trialStart ?? null,
        subscription.trialEnd ?? null,
        subscription.createdAt,
        subscription.updatedAt,
      ]
    );

    return subscription;
  }

  async upsertSubscription(input: SubscriptionUpsertInput): Promise<Subscription> {
    // First, check if we can find an existing subscription by id, stripeSubscriptionId or tenantId
    let existing: Subscription | null = null;

    if (input.id) {
      existing = await this.getSubscription(input.id);
    }

    if (!existing && input.stripeSubscriptionId) {
      existing = await this.getSubscriptionByStripeId(input.stripeSubscriptionId);
    }

    if (!existing && input.tenantId) {
      existing = await this.getSubscriptionByTenantId(input.tenantId);
    }

    if (existing) {
      // Update existing subscription
      const updated = await this.updateSubscription(existing.id, {
        tier: input.tier,
        status: input.status,
        interval: input.interval,
        stripeSubscriptionId: input.stripeSubscriptionId,
        stripePriceId: input.stripePriceId,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        canceledAt: input.canceledAt,
        trialStart: input.trialStart,
        trialEnd: input.trialEnd,
      });
      return updated!;
    }

    // Create new subscription with provided id or generate one
    const now = Date.now();
    const subscription: Subscription = {
      id: input.id ?? randomUUID(),
      tenantId: input.tenantId,
      tier: input.tier,
      status: input.status,
      interval: input.interval ?? 'monthly',
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripePriceId: input.stripePriceId,
      currentPeriodStart: input.currentPeriodStart ?? now,
      currentPeriodEnd: input.currentPeriodEnd ?? now + 30 * 24 * 60 * 60 * 1000,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      canceledAt: input.canceledAt,
      trialStart: input.trialStart,
      trialEnd: input.trialEnd,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO subscriptions (
        id, tenant_id, tier, status, interval, stripe_subscription_id, stripe_price_id,
        current_period_start, current_period_end, cancel_at_period_end,
        canceled_at, trial_start, trial_end, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        subscription.id,
        subscription.tenantId,
        subscription.tier,
        subscription.status,
        subscription.interval,
        subscription.stripeSubscriptionId ?? null,
        subscription.stripePriceId ?? null,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
        subscription.cancelAtPeriodEnd ? 1 : 0,
        subscription.canceledAt ?? null,
        subscription.trialStart ?? null,
        subscription.trialEnd ?? null,
        subscription.createdAt,
        subscription.updatedAt,
      ]
    );

    return subscription;
  }

  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    const result = await this.db.execute<SubscriptionRow>(
      'SELECT * FROM subscriptions WHERE id = ?',
      [subscriptionId]
    );
    return result.length > 0 ? this.rowToSubscription(result[0]) : null;
  }

  async getSubscriptionByTenantId(tenantId: string): Promise<Subscription | null> {
    const result = await this.db.execute<SubscriptionRow>(
      'SELECT * FROM subscriptions WHERE tenant_id = ?',
      [tenantId]
    );
    return result.length > 0 ? this.rowToSubscription(result[0]) : null;
  }

  async getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | null> {
    const result = await this.db.execute<SubscriptionRow>(
      'SELECT * FROM subscriptions WHERE stripe_subscription_id = ?',
      [stripeSubscriptionId]
    );
    return result.length > 0 ? this.rowToSubscription(result[0]) : null;
  }

  async updateSubscription(subscriptionId: string, updates: SubscriptionUpdateInput): Promise<Subscription | null> {
    const existing = await this.getSubscription(subscriptionId);
    if (!existing) return null;

    const updated: Subscription = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `UPDATE subscriptions SET
        tier = ?, status = ?, interval = ?, stripe_subscription_id = ?, stripe_price_id = ?,
        current_period_start = ?, current_period_end = ?, cancel_at_period_end = ?,
        canceled_at = ?, trial_start = ?, trial_end = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.tier,
        updated.status,
        updated.interval,
        updated.stripeSubscriptionId ?? null,
        updated.stripePriceId ?? null,
        updated.currentPeriodStart,
        updated.currentPeriodEnd,
        updated.cancelAtPeriodEnd ? 1 : 0,
        updated.canceledAt ?? null,
        updated.trialStart ?? null,
        updated.trialEnd ?? null,
        updated.updatedAt,
        subscriptionId,
      ]
    );

    return updated;
  }

  async deleteSubscription(subscriptionId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM subscriptions WHERE id = ?',
      [subscriptionId]
    );
    return (result as any).changes > 0;
  }

  async listSubscriptionsByStatus(status: SubscriptionStatus): Promise<Subscription[]> {
    const result = await this.db.execute<SubscriptionRow>(
      'SELECT * FROM subscriptions WHERE status = ? ORDER BY created_at DESC',
      [status]
    );
    return result.map(row => this.rowToSubscription(row));
  }

  async listSubscriptionsExpiringSoon(withinDays: number): Promise<Subscription[]> {
    const futureTimestamp = Date.now() + withinDays * 24 * 60 * 60 * 1000;
    const result = await this.db.execute<SubscriptionRow>(
      `SELECT * FROM subscriptions
       WHERE status = 'active'
       AND current_period_end <= ?
       AND cancel_at_period_end = 0
       ORDER BY current_period_end ASC`,
      [futureTimestamp]
    );
    return result.map(row => this.rowToSubscription(row));
  }

  async listTrialsEndingSoon(withinDays: number): Promise<Subscription[]> {
    const futureTimestamp = Date.now() + withinDays * 24 * 60 * 60 * 1000;
    const result = await this.db.execute<SubscriptionRow>(
      `SELECT * FROM subscriptions
       WHERE status = 'trialing'
       AND trial_end IS NOT NULL
       AND trial_end <= ?
       ORDER BY trial_end ASC`,
      [futureTimestamp]
    );
    return result.map(row => this.rowToSubscription(row));
  }

  private rowToSubscription(row: SubscriptionRow): Subscription {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      tier: row.tier as SubscriptionTier,
      status: row.status as SubscriptionStatus,
      interval: row.interval as 'monthly' | 'yearly',
      stripeSubscriptionId: row.stripe_subscription_id ?? undefined,
      stripePriceId: row.stripe_price_id ?? undefined,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end === 1,
      canceledAt: row.canceled_at ?? undefined,
      trialStart: row.trial_start ?? undefined,
      trialEnd: row.trial_end ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemorySubscriptionStore implements SubscriptionStore {
  private subscriptions = new Map<string, Subscription>();
  private tenantIndex = new Map<string, string>(); // tenantId -> subscriptionId
  private stripeIndex = new Map<string, string>(); // stripeSubscriptionId -> subscriptionId

  async initialize(): Promise<void> {
    // No-op
  }

  async createSubscription(input: SubscriptionCreateInput): Promise<Subscription> {
    const now = Date.now();
    const subscription: Subscription = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    this.subscriptions.set(subscription.id, subscription);
    this.tenantIndex.set(subscription.tenantId, subscription.id);
    if (subscription.stripeSubscriptionId) {
      this.stripeIndex.set(subscription.stripeSubscriptionId, subscription.id);
    }

    return { ...subscription };
  }

  async upsertSubscription(input: SubscriptionUpsertInput): Promise<Subscription> {
    // First, check if we can find an existing subscription by id, stripeSubscriptionId or tenantId
    let existing: Subscription | null = null;

    if (input.id) {
      existing = await this.getSubscription(input.id);
    }

    if (!existing && input.stripeSubscriptionId) {
      existing = await this.getSubscriptionByStripeId(input.stripeSubscriptionId);
    }

    if (!existing && input.tenantId) {
      existing = await this.getSubscriptionByTenantId(input.tenantId);
    }

    if (existing) {
      // Update existing subscription
      const updated = await this.updateSubscription(existing.id, {
        tier: input.tier,
        status: input.status,
        interval: input.interval,
        stripeSubscriptionId: input.stripeSubscriptionId,
        stripePriceId: input.stripePriceId,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        canceledAt: input.canceledAt,
        trialStart: input.trialStart,
        trialEnd: input.trialEnd,
      });
      return updated!;
    }

    // Create new subscription with provided id or generate one
    const now = Date.now();
    const subscription: Subscription = {
      id: input.id ?? randomUUID(),
      tenantId: input.tenantId,
      tier: input.tier,
      status: input.status,
      interval: input.interval ?? 'monthly',
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripePriceId: input.stripePriceId,
      currentPeriodStart: input.currentPeriodStart ?? now,
      currentPeriodEnd: input.currentPeriodEnd ?? now + 30 * 24 * 60 * 60 * 1000,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      canceledAt: input.canceledAt,
      trialStart: input.trialStart,
      trialEnd: input.trialEnd,
      createdAt: now,
      updatedAt: now,
    };

    this.subscriptions.set(subscription.id, subscription);
    this.tenantIndex.set(subscription.tenantId, subscription.id);
    if (subscription.stripeSubscriptionId) {
      this.stripeIndex.set(subscription.stripeSubscriptionId, subscription.id);
    }

    return { ...subscription };
  }

  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    const subscription = this.subscriptions.get(subscriptionId);
    return subscription ? { ...subscription } : null;
  }

  async getSubscriptionByTenantId(tenantId: string): Promise<Subscription | null> {
    const subscriptionId = this.tenantIndex.get(tenantId);
    if (!subscriptionId) return null;
    return this.getSubscription(subscriptionId);
  }

  async getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | null> {
    const subscriptionId = this.stripeIndex.get(stripeSubscriptionId);
    if (!subscriptionId) return null;
    return this.getSubscription(subscriptionId);
  }

  async updateSubscription(subscriptionId: string, updates: SubscriptionUpdateInput): Promise<Subscription | null> {
    const existing = this.subscriptions.get(subscriptionId);
    if (!existing) return null;

    // Update stripe index if changed
    if (updates.stripeSubscriptionId !== undefined) {
      if (existing.stripeSubscriptionId) {
        this.stripeIndex.delete(existing.stripeSubscriptionId);
      }
      if (updates.stripeSubscriptionId) {
        this.stripeIndex.set(updates.stripeSubscriptionId, subscriptionId);
      }
    }

    const updated: Subscription = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.subscriptions.set(subscriptionId, updated);
    return { ...updated };
  }

  async deleteSubscription(subscriptionId: string): Promise<boolean> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return false;

    this.tenantIndex.delete(subscription.tenantId);
    if (subscription.stripeSubscriptionId) {
      this.stripeIndex.delete(subscription.stripeSubscriptionId);
    }
    this.subscriptions.delete(subscriptionId);

    return true;
  }

  async listSubscriptionsByStatus(status: SubscriptionStatus): Promise<Subscription[]> {
    return Array.from(this.subscriptions.values())
      .filter(s => s.status === status)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(s => ({ ...s }));
  }

  async listSubscriptionsExpiringSoon(withinDays: number): Promise<Subscription[]> {
    const futureTimestamp = Date.now() + withinDays * 24 * 60 * 60 * 1000;
    return Array.from(this.subscriptions.values())
      .filter(s =>
        s.status === 'active' &&
        s.currentPeriodEnd <= futureTimestamp &&
        !s.cancelAtPeriodEnd
      )
      .sort((a, b) => a.currentPeriodEnd - b.currentPeriodEnd)
      .map(s => ({ ...s }));
  }

  async listTrialsEndingSoon(withinDays: number): Promise<Subscription[]> {
    const futureTimestamp = Date.now() + withinDays * 24 * 60 * 60 * 1000;
    return Array.from(this.subscriptions.values())
      .filter(s =>
        s.status === 'trialing' &&
        s.trialEnd !== undefined &&
        s.trialEnd <= futureTimestamp
      )
      .sort((a, b) => (a.trialEnd ?? 0) - (b.trialEnd ?? 0))
      .map(s => ({ ...s }));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

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
