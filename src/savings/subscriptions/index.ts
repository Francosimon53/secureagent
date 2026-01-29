/**
 * Subscription Analysis Service
 *
 * Analyzes and tracks subscriptions, detects unused ones, and provides recommendations.
 */

import type {
  Subscription,
  SubscriptionUsage,
  SubscriptionCategory,
  SubscriptionFrequency,
  SubscriptionStatus,
  DetectedSubscription,
  SubscriptionAnalysis,
  SubscriptionRecommendation,
  SubscriptionServiceConfig,
} from '../types.js';
import type { SubscriptionStore } from '../stores/index.js';
import type { SavingsConfig } from '../config.js';

export { SubscriptionDetector, type TransactionPattern } from './detector.js';
export { CancellationHelper, type CancellationGuide } from './cancellation-helper.js';

/**
 * Subscription analysis service configuration
 */
export interface SubscriptionAnalysisConfig {
  detectFromTransactions: boolean;
  unusedThresholdDays: number;
  renewalReminderDays: number;
  maxSubscriptionsPerUser: number;
  detectionConfidenceThreshold: number;
}

/**
 * Subscription analysis service
 */
export class SubscriptionAnalysisService {
  private readonly config: SubscriptionAnalysisConfig;

  constructor(
    private readonly subscriptionStore: SubscriptionStore,
    config?: Partial<SubscriptionServiceConfig>
  ) {
    this.config = {
      detectFromTransactions: config?.detectFromTransactions ?? true,
      unusedThresholdDays: config?.unusedThresholdDays ?? 30,
      renewalReminderDays: config?.renewalReminderDays ?? 7,
      maxSubscriptionsPerUser: 100,
      detectionConfidenceThreshold: 0.7,
    };
  }

  // ==========================================================================
  // Subscription CRUD
  // ==========================================================================

  /**
   * Add a subscription manually
   */
  async addSubscription(
    userId: string,
    name: string,
    provider: string,
    amount: number,
    frequency: SubscriptionFrequency,
    category: SubscriptionCategory,
    options?: {
      providerUrl?: string;
      currency?: string;
      startDate?: number;
      nextBillingDate?: number;
      trialEndsAt?: number;
      cancellationUrl?: string;
      cancellationSteps?: string[];
      tags?: string[];
      notes?: string;
    }
  ): Promise<Subscription> {
    return this.subscriptionStore.create({
      userId,
      name,
      provider,
      providerUrl: options?.providerUrl,
      amount,
      currency: options?.currency ?? 'USD',
      frequency,
      status: 'active',
      detectedFrom: 'manual',
      category,
      startDate: options?.startDate ?? Date.now(),
      nextBillingDate: options?.nextBillingDate ?? this.calculateNextBillingDate(frequency),
      trialEndsAt: options?.trialEndsAt,
      cancellationSteps: options?.cancellationSteps,
      cancellationUrl: options?.cancellationUrl,
      linkedTransactions: [],
      tags: options?.tags ?? [],
      notes: options?.notes,
    });
  }

  /**
   * Get a subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    return this.subscriptionStore.get(subscriptionId);
  }

  /**
   * Update a subscription
   */
  async updateSubscription(
    subscriptionId: string,
    updates: Partial<Subscription>
  ): Promise<Subscription | null> {
    return this.subscriptionStore.update(subscriptionId, updates);
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<Subscription | null> {
    return this.subscriptionStore.update(subscriptionId, { status: 'cancelled' });
  }

  /**
   * Pause a subscription
   */
  async pauseSubscription(subscriptionId: string): Promise<Subscription | null> {
    return this.subscriptionStore.update(subscriptionId, { status: 'paused' });
  }

  /**
   * Resume a subscription
   */
  async resumeSubscription(subscriptionId: string): Promise<Subscription | null> {
    return this.subscriptionStore.update(subscriptionId, { status: 'active' });
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(subscriptionId: string): Promise<boolean> {
    return this.subscriptionStore.delete(subscriptionId);
  }

  /**
   * List subscriptions for a user
   */
  async listSubscriptions(
    userId: string,
    options?: {
      status?: SubscriptionStatus[];
      category?: SubscriptionCategory[];
      frequency?: SubscriptionFrequency[];
      limit?: number;
      offset?: number;
    }
  ): Promise<Subscription[]> {
    return this.subscriptionStore.list(userId, options);
  }

  /**
   * Get active subscriptions
   */
  async getActiveSubscriptions(userId: string): Promise<Subscription[]> {
    return this.subscriptionStore.getActive(userId);
  }

  // ==========================================================================
  // Usage Tracking
  // ==========================================================================

  /**
   * Record usage of a subscription
   */
  async recordUsage(subscriptionId: string): Promise<boolean> {
    return this.subscriptionStore.recordUsage(subscriptionId);
  }

  /**
   * Update usage metrics
   */
  async updateUsageMetrics(
    subscriptionId: string,
    metrics: Partial<SubscriptionUsage>
  ): Promise<boolean> {
    return this.subscriptionStore.updateUsage(subscriptionId, metrics);
  }

  /**
   * Get unused subscriptions
   */
  async getUnusedSubscriptions(userId: string): Promise<Subscription[]> {
    return this.subscriptionStore.getUnused(userId, this.config.unusedThresholdDays);
  }

  /**
   * Check and update unused status for all subscriptions
   */
  async checkUnusedStatus(userId: string): Promise<Subscription[]> {
    const active = await this.subscriptionStore.getActive(userId);
    const now = Date.now();
    const thresholdMs = this.config.unusedThresholdDays * 24 * 60 * 60 * 1000;
    const unused: Subscription[] = [];

    for (const sub of active) {
      if (!sub.usageMetrics?.lastUsedAt) {
        // Never used
        const daysSinceStart = (now - sub.startDate) / (24 * 60 * 60 * 1000);
        if (daysSinceStart > this.config.unusedThresholdDays) {
          await this.subscriptionStore.updateUsage(sub.id, {
            isUnused: true,
            unusedDays: Math.floor(daysSinceStart),
          });
          unused.push(sub);
        }
      } else {
        const daysSinceUse = (now - sub.usageMetrics.lastUsedAt) / (24 * 60 * 60 * 1000);
        if (daysSinceUse > this.config.unusedThresholdDays) {
          await this.subscriptionStore.updateUsage(sub.id, {
            isUnused: true,
            unusedDays: Math.floor(daysSinceUse),
          });
          unused.push(sub);
        } else if (sub.usageMetrics.isUnused) {
          // Was unused, now used
          await this.subscriptionStore.updateUsage(sub.id, {
            isUnused: false,
            unusedDays: 0,
          });
        }
      }
    }

    return unused;
  }

  // ==========================================================================
  // Renewals
  // ==========================================================================

  /**
   * Get upcoming renewals
   */
  async getUpcomingRenewals(userId: string): Promise<Subscription[]> {
    return this.subscriptionStore.getUpcomingRenewals(userId, this.config.renewalReminderDays);
  }

  /**
   * Update next billing date after a renewal
   */
  async recordRenewal(subscriptionId: string, newAmount?: number): Promise<Subscription | null> {
    const sub = await this.subscriptionStore.get(subscriptionId);
    if (!sub) {
      return null;
    }

    const nextBillingDate = this.calculateNextBillingDate(sub.frequency, sub.nextBillingDate);

    return this.subscriptionStore.update(subscriptionId, {
      nextBillingDate,
      amount: newAmount ?? sub.amount,
    });
  }

  // ==========================================================================
  // Analysis
  // ==========================================================================

  /**
   * Get comprehensive subscription analysis
   */
  async analyzeSubscriptions(userId: string): Promise<SubscriptionAnalysis> {
    const active = await this.subscriptionStore.getActive(userId);
    const unused = await this.getUnusedSubscriptions(userId);
    const upcoming = await this.getUpcomingRenewals(userId);

    const totalMonthly = await this.subscriptionStore.getTotalMonthlySpend(userId);
    const totalAnnual = totalMonthly * 12;

    const categoryBreakdown = await this.subscriptionStore.getSpendByCategory(userId);

    const recommendations = this.generateRecommendations(active, unused);

    const potentialSavings = recommendations.reduce((sum, r) => sum + r.potentialSavings, 0);

    return {
      totalMonthly,
      totalAnnual,
      unusedSubscriptions: unused,
      upcomingRenewals: upcoming,
      potentialSavings,
      categoryBreakdown,
      recommendations,
    };
  }

  /**
   * Get monthly spend breakdown
   */
  async getMonthlySpend(userId: string): Promise<{
    total: number;
    byCategory: Map<SubscriptionCategory, number>;
    byFrequency: Map<SubscriptionFrequency, number>;
  }> {
    const total = await this.subscriptionStore.getTotalMonthlySpend(userId);
    const byCategory = await this.subscriptionStore.getSpendByCategory(userId);
    const active = await this.subscriptionStore.getActive(userId);

    const byFrequency = new Map<SubscriptionFrequency, number>();
    for (const sub of active) {
      let monthly = sub.amount;
      switch (sub.frequency) {
        case 'weekly': monthly = sub.amount * 4.33; break;
        case 'quarterly': monthly = sub.amount / 3; break;
        case 'annually': monthly = sub.amount / 12; break;
      }

      const current = byFrequency.get(sub.frequency) ?? 0;
      byFrequency.set(sub.frequency, current + monthly);
    }

    return { total, byCategory, byFrequency };
  }

  /**
   * Generate recommendations for subscriptions
   */
  private generateRecommendations(
    active: Subscription[],
    unused: Subscription[]
  ): SubscriptionRecommendation[] {
    const recommendations: SubscriptionRecommendation[] = [];

    // Recommend cancelling unused subscriptions
    for (const sub of unused) {
      const monthlyAmount = this.getMonthlyAmount(sub);
      recommendations.push({
        type: 'cancel',
        subscriptionId: sub.id,
        subscriptionName: sub.name,
        reason: `Not used in the last ${sub.usageMetrics?.unusedDays ?? this.config.unusedThresholdDays} days`,
        potentialSavings: monthlyAmount * 12,
        confidence: 0.8,
      });
    }

    // Look for duplicate categories
    const categoryMap = new Map<SubscriptionCategory, Subscription[]>();
    for (const sub of active) {
      if (!categoryMap.has(sub.category)) {
        categoryMap.set(sub.category, []);
      }
      categoryMap.get(sub.category)!.push(sub);
    }

    // Recommend bundling for multiple streaming services
    const streaming = categoryMap.get('streaming') ?? [];
    if (streaming.length >= 3) {
      const totalMonthly = streaming.reduce((sum, s) => sum + this.getMonthlyAmount(s), 0);
      recommendations.push({
        type: 'bundle',
        subscriptionId: streaming[0].id,
        subscriptionName: 'Streaming Services',
        reason: `You have ${streaming.length} streaming services. Consider rotating or bundling them.`,
        potentialSavings: totalMonthly * 6, // Assume you could save half by rotating
        confidence: 0.6,
      });
    }

    // Sort by potential savings
    recommendations.sort((a, b) => b.potentialSavings - a.potentialSavings);

    return recommendations;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Calculate next billing date based on frequency
   */
  private calculateNextBillingDate(
    frequency: SubscriptionFrequency,
    fromDate?: number
  ): number {
    const date = new Date(fromDate ?? Date.now());

    switch (frequency) {
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() + 3);
        break;
      case 'annually':
        date.setFullYear(date.getFullYear() + 1);
        break;
    }

    return date.getTime();
  }

  /**
   * Get monthly amount for a subscription
   */
  private getMonthlyAmount(subscription: Subscription): number {
    switch (subscription.frequency) {
      case 'weekly':
        return subscription.amount * 4.33;
      case 'monthly':
        return subscription.amount;
      case 'quarterly':
        return subscription.amount / 3;
      case 'annually':
        return subscription.amount / 12;
      default:
        return subscription.amount;
    }
  }

  /**
   * Find similar subscriptions (potential duplicates)
   */
  async findSimilarSubscriptions(userId: string): Promise<Array<{
    subscriptions: Subscription[];
    category: SubscriptionCategory;
    totalMonthly: number;
  }>> {
    const categoryMap = new Map<SubscriptionCategory, Subscription[]>();
    const active = await this.subscriptionStore.getActive(userId);

    for (const sub of active) {
      if (!categoryMap.has(sub.category)) {
        categoryMap.set(sub.category, []);
      }
      categoryMap.get(sub.category)!.push(sub);
    }

    const similar: Array<{
      subscriptions: Subscription[];
      category: SubscriptionCategory;
      totalMonthly: number;
    }> = [];

    for (const [category, subs] of categoryMap) {
      if (subs.length >= 2) {
        const totalMonthly = subs.reduce((sum, s) => sum + this.getMonthlyAmount(s), 0);
        similar.push({
          subscriptions: subs,
          category,
          totalMonthly,
        });
      }
    }

    return similar.sort((a, b) => b.totalMonthly - a.totalMonthly);
  }

  /**
   * Get subscription cost trend over time
   */
  async getCostTrend(
    userId: string,
    months: number
  ): Promise<Array<{ month: string; total: number }>> {
    const active = await this.subscriptionStore.getActive(userId);
    const trend: Array<{ month: string; total: number }> = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;

      let monthTotal = 0;
      for (const sub of active) {
        // Only count if subscription was active during this month
        if (sub.startDate <= monthDate.getTime() && (!sub.cancelledAt || sub.cancelledAt > monthDate.getTime())) {
          monthTotal += this.getMonthlyAmount(sub);
        }
      }

      trend.push({ month: monthKey, total: Math.round(monthTotal * 100) / 100 });
    }

    return trend;
  }
}

/**
 * Factory function to create subscription analysis service
 */
export function createSubscriptionAnalysisService(
  subscriptionStore: SubscriptionStore,
  config?: Partial<SavingsConfig>
): SubscriptionAnalysisService {
  return new SubscriptionAnalysisService(subscriptionStore, config?.subscriptions);
}
