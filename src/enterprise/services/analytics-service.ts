/**
 * Analytics Service
 *
 * Usage metrics, reporting, and business intelligence
 */

import type {
  AnalyticsTimeRange,
  AnalyticsSeries,
  DashboardAnalytics,
  UsageMetric,
} from '../types.js';
import type { UsageStore } from '../stores/usage-store.js';
import type { EnterpriseUserStore } from '../stores/user-store.js';
import type { SubscriptionStore } from '../stores/subscription-store.js';
import type { EnterpriseAuditLogStore } from '../stores/audit-log-store.js';
import { EnterpriseError } from '../types.js';

// =============================================================================
// Analytics Service
// =============================================================================

export class AnalyticsService {
  constructor(
    private readonly usageStore: UsageStore,
    private readonly userStore: EnterpriseUserStore,
    private readonly subscriptionStore: SubscriptionStore,
    private readonly auditLogStore: EnterpriseAuditLogStore
  ) {}

  /**
   * Get dashboard analytics for a tenant
   */
  async getDashboardAnalytics(
    tenantId: string,
    timeRange: AnalyticsTimeRange = 'month'
  ): Promise<DashboardAnalytics> {
    const { periodStart, periodEnd, previousStart, previousEnd } = this.getTimeRangeBounds(timeRange);

    // Get usage data
    const [
      currentApiCalls,
      previousApiCalls,
      currentStorage,
      previousStorage,
      apiCallsTrend,
      storageTrend,
    ] = await Promise.all([
      this.usageStore.getUsageAggregate(tenantId, 'api_calls', periodStart, periodEnd),
      this.usageStore.getUsageAggregate(tenantId, 'api_calls', previousStart, previousEnd),
      this.usageStore.getUsageAggregate(tenantId, 'storage_bytes', periodStart, periodEnd),
      this.usageStore.getUsageAggregate(tenantId, 'storage_bytes', previousStart, previousEnd),
      this.usageStore.getUsageTrend(tenantId, 'api_calls', periodStart, periodEnd, 'day'),
      this.usageStore.getUsageTrend(tenantId, 'storage_bytes', periodStart, periodEnd, 'day'),
    ]);

    // Get active users
    const users = await this.userStore.listUsers({ tenantId });
    const activeUsers = users.filter(u => {
      return u.lastLoginAt && u.lastLoginAt >= periodStart;
    });

    // Calculate change percentages
    const apiCallsChange = previousApiCalls.total > 0
      ? ((currentApiCalls.total - previousApiCalls.total) / previousApiCalls.total) * 100
      : 0;

    const storageChange = previousStorage.total > 0
      ? ((currentStorage.total - previousStorage.total) / previousStorage.total) * 100
      : 0;

    return {
      timeRange,
      periodStart,
      periodEnd,
      activeUsers: {
        name: 'Active Users',
        data: [], // Would need user activity tracking to populate this
        total: activeUsers.length,
        changePercent: 0, // Would need previous period data
      },
      apiCalls: {
        name: 'API Calls',
        data: apiCallsTrend.map(point => ({
          timestamp: point.timestamp,
          value: point.value,
        })),
        total: currentApiCalls.total,
        changePercent: apiCallsChange,
      },
      storageUsage: {
        name: 'Storage Usage',
        data: storageTrend.map(point => ({
          timestamp: point.timestamp,
          value: point.value,
        })),
        total: currentStorage.total,
        changePercent: storageChange,
      },
      errorRate: {
        name: 'Error Rate',
        data: [], // Would need error tracking
        total: 0,
        changePercent: 0,
      },
      responseTime: {
        name: 'Avg Response Time',
        data: [], // Would need response time tracking
        total: 0,
        changePercent: 0,
      },
    };
  }

  /**
   * Get usage series for a specific metric
   */
  async getUsageSeries(
    tenantId: string,
    metric: UsageMetric,
    timeRange: AnalyticsTimeRange = 'month',
    granularity: 'hour' | 'day' = 'day'
  ): Promise<AnalyticsSeries> {
    const { periodStart, periodEnd, previousStart, previousEnd } = this.getTimeRangeBounds(timeRange);

    const [currentData, previousAggregate] = await Promise.all([
      this.usageStore.getUsageTrend(tenantId, metric, periodStart, periodEnd, granularity),
      this.usageStore.getUsageAggregate(tenantId, metric, previousStart, previousEnd),
    ]);

    const currentTotal = currentData.reduce((sum, point) => sum + point.value, 0);
    const changePercent = previousAggregate.total > 0
      ? ((currentTotal - previousAggregate.total) / previousAggregate.total) * 100
      : 0;

    return {
      name: metric,
      data: currentData.map(point => ({
        timestamp: point.timestamp,
        value: point.value,
      })),
      total: currentTotal,
      changePercent,
    };
  }

  /**
   * Get user activity analytics
   */
  async getUserActivityAnalytics(
    tenantId: string,
    timeRange: AnalyticsTimeRange = 'month'
  ): Promise<{
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    usersByRole: Record<string, number>;
    usersByStatus: Record<string, number>;
    mostActiveUsers: Array<{ userId: string; name: string; activityCount: number }>;
  }> {
    const { periodStart, periodEnd } = this.getTimeRangeBounds(timeRange);

    const users = await this.userStore.listUsers({ tenantId });

    const activeUsers = users.filter(u => u.lastLoginAt && u.lastLoginAt >= periodStart);
    const newUsers = users.filter(u => u.createdAt >= periodStart);

    const usersByRole: Record<string, number> = {};
    const usersByStatus: Record<string, number> = {};

    for (const user of users) {
      usersByRole[user.role] = (usersByRole[user.role] ?? 0) + 1;
      usersByStatus[user.status] = (usersByStatus[user.status] ?? 0) + 1;
    }

    // Get audit log data for activity counts
    const auditStats = await this.auditLogStore.getAuditStats(tenantId, periodStart, periodEnd);

    const mostActiveUsers = Object.entries(auditStats.eventsByUser)
      .map(([userId, count]) => {
        const user = users.find(u => u.id === userId);
        return {
          userId,
          name: user?.name ?? 'Unknown',
          activityCount: count,
        };
      })
      .sort((a, b) => b.activityCount - a.activityCount)
      .slice(0, 10);

    return {
      totalUsers: users.length,
      activeUsers: activeUsers.length,
      newUsers: newUsers.length,
      usersByRole,
      usersByStatus,
      mostActiveUsers,
    };
  }

  /**
   * Get audit log analytics
   */
  async getAuditLogAnalytics(
    tenantId: string,
    timeRange: AnalyticsTimeRange = 'month'
  ): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByDay: Array<{ timestamp: number; count: number }>;
    topUsers: Array<{ userId: string; eventCount: number }>;
  }> {
    const { periodStart, periodEnd } = this.getTimeRangeBounds(timeRange);

    const stats = await this.auditLogStore.getAuditStats(tenantId, periodStart, periodEnd);

    // Get events by day
    const logs = await this.auditLogStore.queryAuditLogs(tenantId, {
      fromTimestamp: periodStart,
      toTimestamp: periodEnd,
      limit: 10000,
    });

    const eventsByDay = new Map<number, number>();
    for (const log of logs) {
      const dayStart = new Date(log.timestamp);
      dayStart.setHours(0, 0, 0, 0);
      const day = dayStart.getTime();
      eventsByDay.set(day, (eventsByDay.get(day) ?? 0) + 1);
    }

    const topUsers = Object.entries(stats.eventsByUser)
      .map(([userId, count]) => ({ userId, eventCount: count }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);

    return {
      totalEvents: stats.totalEvents,
      eventsByType: stats.eventsByType,
      eventsByDay: Array.from(eventsByDay.entries())
        .map(([timestamp, count]) => ({ timestamp, count }))
        .sort((a, b) => a.timestamp - b.timestamp),
      topUsers,
    };
  }

  /**
   * Get subscription analytics (for admin/platform level)
   */
  async getSubscriptionAnalytics(): Promise<{
    totalSubscriptions: number;
    subscriptionsByStatus: Record<string, number>;
    subscriptionsByTier: Record<string, number>;
    mrr: number;
    arr: number;
    activeTrials: number;
  }> {
    const [active, trialing, pastDue, canceled] = await Promise.all([
      this.subscriptionStore.listSubscriptionsByStatus('active'),
      this.subscriptionStore.listSubscriptionsByStatus('trialing'),
      this.subscriptionStore.listSubscriptionsByStatus('past_due'),
      this.subscriptionStore.listSubscriptionsByStatus('canceled'),
    ]);

    const allSubscriptions = [...active, ...trialing, ...pastDue, ...canceled];

    const subscriptionsByStatus: Record<string, number> = {
      active: active.length,
      trialing: trialing.length,
      past_due: pastDue.length,
      canceled: canceled.length,
    };

    const subscriptionsByTier: Record<string, number> = {};
    for (const sub of allSubscriptions) {
      subscriptionsByTier[sub.tier] = (subscriptionsByTier[sub.tier] ?? 0) + 1;
    }

    // Calculate MRR (simplified - would need actual pricing data)
    const tierPrices: Record<string, number> = {
      free: 0,
      pro: 4900,
      business: 19900,
      enterprise: 49900, // Placeholder
    };

    let mrr = 0;
    for (const sub of active) {
      if (sub.interval === 'monthly') {
        mrr += tierPrices[sub.tier] ?? 0;
      } else {
        mrr += Math.round((tierPrices[sub.tier] ?? 0) * 0.83); // Yearly discount
      }
    }

    return {
      totalSubscriptions: allSubscriptions.length,
      subscriptionsByStatus,
      subscriptionsByTier,
      mrr,
      arr: mrr * 12,
      activeTrials: trialing.length,
    };
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(
    tenantId: string,
    metrics: UsageMetric[],
    timeRange: AnalyticsTimeRange,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const { periodStart, periodEnd } = this.getTimeRangeBounds(timeRange);

    const data: Record<string, unknown>[] = [];

    for (const metric of metrics) {
      const trend = await this.usageStore.getUsageTrend(tenantId, metric, periodStart, periodEnd, 'day');
      for (const point of trend) {
        data.push({
          timestamp: new Date(point.timestamp).toISOString(),
          metric,
          value: point.value,
        });
      }
    }

    if (format === 'csv') {
      const headers = ['timestamp', 'metric', 'value'];
      const rows = data.map(row =>
        headers.map(h => String(row[h] ?? '')).join(',')
      );
      return [headers.join(','), ...rows].join('\n');
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Get time range bounds
   */
  private getTimeRangeBounds(timeRange: AnalyticsTimeRange): {
    periodStart: number;
    periodEnd: number;
    previousStart: number;
    previousEnd: number;
  } {
    const now = new Date();
    const periodEnd = now.getTime();
    let periodStart: number;
    let duration: number;

    switch (timeRange) {
      case 'day':
        now.setHours(0, 0, 0, 0);
        periodStart = now.getTime();
        duration = 24 * 60 * 60 * 1000;
        break;
      case 'week':
        now.setDate(now.getDate() - 7);
        periodStart = now.getTime();
        duration = 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        now.setMonth(now.getMonth() - 1);
        periodStart = now.getTime();
        duration = 30 * 24 * 60 * 60 * 1000;
        break;
      case 'quarter':
        now.setMonth(now.getMonth() - 3);
        periodStart = now.getTime();
        duration = 90 * 24 * 60 * 60 * 1000;
        break;
      case 'year':
        now.setFullYear(now.getFullYear() - 1);
        periodStart = now.getTime();
        duration = 365 * 24 * 60 * 60 * 1000;
        break;
      default:
        now.setMonth(now.getMonth() - 1);
        periodStart = now.getTime();
        duration = 30 * 24 * 60 * 60 * 1000;
    }

    return {
      periodStart,
      periodEnd,
      previousStart: periodStart - duration,
      previousEnd: periodStart,
    };
  }
}

/**
 * Create analytics service
 */
export function createAnalyticsService(
  usageStore: UsageStore,
  userStore: EnterpriseUserStore,
  subscriptionStore: SubscriptionStore,
  auditLogStore: EnterpriseAuditLogStore
): AnalyticsService {
  return new AnalyticsService(usageStore, userStore, subscriptionStore, auditLogStore);
}
