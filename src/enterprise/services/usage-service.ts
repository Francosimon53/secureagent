/**
 * Usage Service
 *
 * Usage tracking, metering, and limit enforcement
 */

import type {
  UsageRecord,
  UsageAggregate,
  UsageMetric,
  UsageLimitResult,
  UsageAlert,
} from '../types.js';
import type { UsageStore, UsageQueryOptions } from '../stores/usage-store.js';
import type { TenantStore } from '../stores/tenant-store.js';
import type { SubscriptionStore } from '../stores/subscription-store.js';
import { EnterpriseError } from '../types.js';
import { getTierLimits, ENTERPRISE_DEFAULTS } from '../constants.js';

// =============================================================================
// Service Configuration
// =============================================================================

export interface UsageServiceConfig {
  /** Batch flush interval in ms */
  flushIntervalMs: number;
  /** Batch size for bulk inserts */
  batchSize: number;
  /** Warning threshold percentage */
  warningThreshold: number;
  /** Critical threshold percentage */
  criticalThreshold: number;
  /** Alert callback */
  onAlert?: (alert: UsageAlert) => void;
}

const DEFAULT_CONFIG: UsageServiceConfig = {
  flushIntervalMs: 60000,
  batchSize: 100,
  warningThreshold: ENTERPRISE_DEFAULTS.USAGE_WARNING_THRESHOLD,
  criticalThreshold: ENTERPRISE_DEFAULTS.USAGE_CRITICAL_THRESHOLD,
};

// =============================================================================
// Usage Service
// =============================================================================

export class UsageService {
  private readonly config: UsageServiceConfig;
  private pendingRecords: Map<string, Omit<UsageRecord, 'id'>[]> = new Map();
  private flushTimer?: NodeJS.Timeout;

  constructor(
    private readonly usageStore: UsageStore,
    private readonly tenantStore: TenantStore,
    private readonly subscriptionStore: SubscriptionStore,
    config?: Partial<UsageServiceConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the usage service (enables batching)
   */
  start(): void {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(
      () => this.flushPendingRecords(),
      this.config.flushIntervalMs
    );
  }

  /**
   * Stop the usage service
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    // Flush any remaining records
    await this.flushPendingRecords();
  }

  /**
   * Record a usage event
   */
  async recordUsage(
    tenantId: string,
    metric: UsageMetric,
    value: number = 1,
    userId?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Add to pending batch
    if (!this.pendingRecords.has(tenantId)) {
      this.pendingRecords.set(tenantId, []);
    }

    this.pendingRecords.get(tenantId)!.push({
      tenantId,
      userId,
      metric,
      value,
      metadata,
      timestamp: Date.now(),
    });

    // Flush if batch size reached
    const tenantRecords = this.pendingRecords.get(tenantId)!;
    if (tenantRecords.length >= this.config.batchSize) {
      await this.flushTenantRecords(tenantId);
    }
  }

  /**
   * Record usage immediately (bypass batching)
   */
  async recordUsageImmediate(
    tenantId: string,
    metric: UsageMetric,
    value: number = 1,
    userId?: string,
    metadata?: Record<string, unknown>
  ): Promise<UsageRecord> {
    return this.usageStore.recordUsage({
      tenantId,
      metric,
      value,
      userId,
      metadata,
    });
  }

  /**
   * Increment API call counter and check limits
   */
  async trackAPICall(
    tenantId: string,
    userId?: string,
    endpoint?: string
  ): Promise<{ allowed: boolean; remaining: number }> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const limits = getTierLimits(tenant.tier);

    // Get current usage for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayStart = today.getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const currentUsage = await this.usageStore.getUsageCount(
      tenantId,
      'api_calls',
      dayStart,
      dayEnd
    );

    // Check if limit exceeded
    if (currentUsage >= limits.apiCallsPerDay) {
      return { allowed: false, remaining: 0 };
    }

    // Record the API call
    await this.recordUsage(tenantId, 'api_calls', 1, userId, { endpoint });

    const remaining = limits.apiCallsPerDay - currentUsage - 1;

    // Check thresholds and emit alerts
    const percentage = ((currentUsage + 1) / limits.apiCallsPerDay) * 100;
    await this.checkThresholds(tenantId, 'api_calls', percentage, currentUsage + 1, limits.apiCallsPerDay);

    return { allowed: true, remaining: Math.max(0, remaining) };
  }

  /**
   * Get current usage for a metric
   */
  async getCurrentUsage(
    tenantId: string,
    metric: UsageMetric,
    periodType: 'day' | 'month' = 'day'
  ): Promise<number> {
    const now = new Date();

    let periodStart: number;
    let periodEnd: number;

    if (periodType === 'day') {
      now.setHours(0, 0, 0, 0);
      periodStart = now.getTime();
      periodEnd = periodStart + 24 * 60 * 60 * 1000;
    } else {
      now.setDate(1);
      now.setHours(0, 0, 0, 0);
      periodStart = now.getTime();
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      periodEnd = nextMonth.getTime();
    }

    return this.usageStore.getUsageCount(tenantId, metric, periodStart, periodEnd);
  }

  /**
   * Get all current usage metrics
   */
  async getAllCurrentUsage(tenantId: string): Promise<Map<UsageMetric, number>> {
    const subscription = await this.subscriptionStore.getSubscriptionByTenantId(tenantId);
    const periodStart = subscription?.currentPeriodStart ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
    const periodEnd = subscription?.currentPeriodEnd ?? Date.now();

    return this.usageStore.getCurrentUsage(tenantId, periodStart, periodEnd);
  }

  /**
   * Get usage limit status for all metrics
   */
  async getUsageLimitStatus(tenantId: string): Promise<UsageLimitResult[]> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const limits = getTierLimits(tenant.tier);
    const results: UsageLimitResult[] = [];

    // API calls (daily)
    const apiCallsToday = await this.getCurrentUsage(tenantId, 'api_calls', 'day');
    results.push({
      metric: 'api_calls',
      current: apiCallsToday,
      limit: limits.apiCallsPerDay,
      percentage: (apiCallsToday / limits.apiCallsPerDay) * 100,
      exceeded: apiCallsToday >= limits.apiCallsPerDay,
      remaining: Math.max(0, limits.apiCallsPerDay - apiCallsToday),
    });

    // Storage
    const storageUsed = await this.getCurrentUsage(tenantId, 'storage_bytes', 'month');
    results.push({
      metric: 'storage_bytes',
      current: storageUsed,
      limit: limits.storageLimitBytes,
      percentage: (storageUsed / limits.storageLimitBytes) * 100,
      exceeded: storageUsed >= limits.storageLimitBytes,
      remaining: Math.max(0, limits.storageLimitBytes - storageUsed),
    });

    return results;
  }

  /**
   * Get usage aggregate for a period
   */
  async getUsageAggregate(
    tenantId: string,
    metric: UsageMetric,
    periodStart: number,
    periodEnd: number
  ): Promise<UsageAggregate> {
    return this.usageStore.getUsageAggregate(tenantId, metric, periodStart, periodEnd);
  }

  /**
   * Get usage trend
   */
  async getUsageTrend(
    tenantId: string,
    metric: UsageMetric,
    periodStart: number,
    periodEnd: number,
    granularity: 'hour' | 'day' = 'day'
  ): Promise<Array<{ timestamp: number; value: number }>> {
    return this.usageStore.getUsageTrend(tenantId, metric, periodStart, periodEnd, granularity);
  }

  /**
   * Get usage records
   */
  async getUsageRecords(tenantId: string, options?: UsageQueryOptions): Promise<UsageRecord[]> {
    return this.usageStore.getUsageRecords(tenantId, options);
  }

  /**
   * Check if usage would exceed limits
   */
  async wouldExceedLimit(
    tenantId: string,
    metric: UsageMetric,
    increment: number = 1
  ): Promise<boolean> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const limits = getTierLimits(tenant.tier);
    const current = await this.getCurrentUsage(tenantId, metric, 'day');

    let limit: number;
    switch (metric) {
      case 'api_calls':
        limit = limits.apiCallsPerDay;
        break;
      case 'storage_bytes':
        limit = limits.storageLimitBytes;
        break;
      default:
        return false;
    }

    return current + increment > limit;
  }

  /**
   * Delete old usage records
   */
  async cleanupOldRecords(retentionDays: number): Promise<number> {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    return this.usageStore.deleteOldRecords(cutoff);
  }

  /**
   * Flush pending records for a tenant
   */
  private async flushTenantRecords(tenantId: string): Promise<void> {
    const records = this.pendingRecords.get(tenantId);
    if (!records || records.length === 0) return;

    this.pendingRecords.set(tenantId, []);

    try {
      await this.usageStore.recordUsageBatch(records);
    } catch {
      // Re-add records on failure
      const current = this.pendingRecords.get(tenantId) ?? [];
      this.pendingRecords.set(tenantId, [...records, ...current]);
    }
  }

  /**
   * Flush all pending records
   */
  private async flushPendingRecords(): Promise<void> {
    const tenantIds = Array.from(this.pendingRecords.keys());
    await Promise.all(tenantIds.map(id => this.flushTenantRecords(id)));
  }

  /**
   * Check usage thresholds and emit alerts
   */
  private async checkThresholds(
    tenantId: string,
    metric: UsageMetric,
    percentage: number,
    current: number,
    limit: number
  ): Promise<void> {
    if (!this.config.onAlert) return;

    const createAlert = (severity: 'warning' | 'critical'): UsageAlert => ({
      id: `${tenantId}-${metric}-${severity}-${Date.now()}`,
      metric,
      percentage,
      severity,
      message: `${metric} usage is at ${percentage.toFixed(1)}% (${current}/${limit})`,
      timestamp: Date.now(),
    });

    if (percentage >= this.config.criticalThreshold) {
      this.config.onAlert(createAlert('critical'));
    } else if (percentage >= this.config.warningThreshold) {
      this.config.onAlert(createAlert('warning'));
    }
  }
}

/**
 * Create usage service
 */
export function createUsageService(
  usageStore: UsageStore,
  tenantStore: TenantStore,
  subscriptionStore: SubscriptionStore,
  config?: Partial<UsageServiceConfig>
): UsageService {
  return new UsageService(usageStore, tenantStore, subscriptionStore, config);
}
