/**
 * Admin Dashboard Service
 *
 * Dashboard aggregations and admin overview data
 */

import type {
  AdminDashboardSummary,
  UsageAlert,
  UsageMetric,
  SubscriptionTier,
  Tenant,
  EnterpriseUser,
} from '../types.js';
import type { TenantStore } from '../stores/tenant-store.js';
import type { EnterpriseUserStore } from '../stores/user-store.js';
import type { SubscriptionStore } from '../stores/subscription-store.js';
import type { UsageStore } from '../stores/usage-store.js';
import type { EnterpriseAuditLogStore } from '../stores/audit-log-store.js';
import { EnterpriseError } from '../types.js';
import { getTierLimits, ENTERPRISE_DEFAULTS } from '../constants.js';

// =============================================================================
// Admin Dashboard Service
// =============================================================================

export class AdminDashboardService {
  constructor(
    private readonly tenantStore: TenantStore,
    private readonly userStore: EnterpriseUserStore,
    private readonly subscriptionStore: SubscriptionStore,
    private readonly usageStore: UsageStore,
    private readonly auditLogStore: EnterpriseAuditLogStore
  ) {}

  /**
   * Get admin dashboard summary for a tenant
   */
  async getDashboardSummary(tenantId: string): Promise<AdminDashboardSummary> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const subscription = await this.subscriptionStore.getSubscriptionByTenantId(tenantId);
    const limits = getTierLimits(tenant.tier);

    // Get user counts
    const users = await this.userStore.listUsers({ tenantId });
    const activeUsers = users.filter(u => {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      return u.lastLoginAt && u.lastLoginAt >= thirtyDaysAgo;
    });

    // Get current period
    const periodStart = subscription?.currentPeriodStart ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
    const periodEnd = subscription?.currentPeriodEnd ?? Date.now();

    // Get API calls for current period
    const apiCallsThisPeriod = await this.usageStore.getUsageCount(
      tenantId,
      'api_calls',
      periodStart,
      periodEnd
    );

    // Get storage used
    const storageUsed = await this.usageStore.getUsageCount(
      tenantId,
      'storage_bytes',
      0,
      Date.now()
    );

    // Calculate days until renewal
    const daysUntilRenewal = subscription
      ? Math.ceil((subscription.currentPeriodEnd - Date.now()) / (24 * 60 * 60 * 1000))
      : 0;

    // Generate usage alerts
    const usageAlerts = await this.generateUsageAlerts(tenantId);

    return {
      totalUsers: users.length,
      activeUsers: activeUsers.length,
      totalBots: 0, // Would need bot store
      activeBots: 0,
      apiCallsThisPeriod,
      storageUsed,
      storageLimit: limits.storageLimitBytes,
      tier: tenant.tier,
      subscriptionStatus: subscription?.status ?? 'active',
      daysUntilRenewal: Math.max(0, daysUntilRenewal),
      usageAlerts,
    };
  }

  /**
   * Get recent activity for a tenant
   */
  async getRecentActivity(
    tenantId: string,
    limit: number = 20
  ): Promise<Array<{
    id: string;
    type: string;
    action: string;
    userId?: string;
    userName?: string;
    details?: Record<string, unknown>;
    timestamp: number;
  }>> {
    const logs = await this.auditLogStore.queryAuditLogs(tenantId, { limit });
    const users = await this.userStore.listUsers({ tenantId });
    const userMap = new Map(users.map(u => [u.id, u]));

    return logs.map(log => ({
      id: log.id,
      type: log.eventType,
      action: log.action,
      userId: log.userId,
      userName: log.userId ? userMap.get(log.userId)?.name : undefined,
      details: log.details,
      timestamp: log.timestamp,
    }));
  }

  /**
   * Get user overview
   */
  async getUserOverview(tenantId: string): Promise<{
    total: number;
    active: number;
    invited: number;
    suspended: number;
    byRole: Record<string, number>;
    recentLogins: Array<{ userId: string; name: string; email: string; lastLoginAt: number }>;
  }> {
    const users = await this.userStore.listUsers({ tenantId });

    const byStatus = {
      active: 0,
      invited: 0,
      suspended: 0,
    };

    const byRole: Record<string, number> = {};

    for (const user of users) {
      byStatus[user.status as keyof typeof byStatus] = (byStatus[user.status as keyof typeof byStatus] ?? 0) + 1;
      byRole[user.role] = (byRole[user.role] ?? 0) + 1;
    }

    // Get recent logins
    const recentLogins = users
      .filter(u => u.lastLoginAt)
      .sort((a, b) => (b.lastLoginAt ?? 0) - (a.lastLoginAt ?? 0))
      .slice(0, 10)
      .map(u => ({
        userId: u.id,
        name: u.name,
        email: u.email,
        lastLoginAt: u.lastLoginAt!,
      }));

    return {
      total: users.length,
      active: byStatus.active,
      invited: byStatus.invited,
      suspended: byStatus.suspended,
      byRole,
      recentLogins,
    };
  }

  /**
   * Get subscription overview
   */
  async getSubscriptionOverview(tenantId: string): Promise<{
    tier: SubscriptionTier;
    status: string;
    interval: string;
    currentPeriodStart: number;
    currentPeriodEnd: number;
    cancelAtPeriodEnd: boolean;
    trialEndsAt?: number;
    limits: ReturnType<typeof getTierLimits>;
  } | null> {
    const subscription = await this.subscriptionStore.getSubscriptionByTenantId(tenantId);
    if (!subscription) return null;

    return {
      tier: subscription.tier,
      status: subscription.status,
      interval: subscription.interval,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      trialEndsAt: subscription.trialEnd,
      limits: getTierLimits(subscription.tier),
    };
  }

  /**
   * Get usage overview
   */
  async getUsageOverview(tenantId: string): Promise<{
    apiCalls: {
      today: number;
      thisMonth: number;
      limitPerDay: number;
    };
    storage: {
      used: number;
      limit: number;
      percentage: number;
    };
    users: {
      count: number;
      limit: number;
      percentage: number;
    };
  }> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const limits = getTierLimits(tenant.tier);

    // Today's API calls
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayStart = today.getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    // This month's API calls
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [apiCallsToday, apiCallsMonth, storageUsed, userCount] = await Promise.all([
      this.usageStore.getUsageCount(tenantId, 'api_calls', dayStart, dayEnd),
      this.usageStore.getUsageCount(tenantId, 'api_calls', monthStart.getTime(), Date.now()),
      this.usageStore.getUsageCount(tenantId, 'storage_bytes', 0, Date.now()),
      this.userStore.countUsers(tenantId),
    ]);

    return {
      apiCalls: {
        today: apiCallsToday,
        thisMonth: apiCallsMonth,
        limitPerDay: limits.apiCallsPerDay,
      },
      storage: {
        used: storageUsed,
        limit: limits.storageLimitBytes,
        percentage: (storageUsed / limits.storageLimitBytes) * 100,
      },
      users: {
        count: userCount,
        limit: limits.maxUsers,
        percentage: (userCount / limits.maxUsers) * 100,
      },
    };
  }

  /**
   * Get quick stats for dashboard cards
   */
  async getQuickStats(tenantId: string): Promise<{
    users: { value: number; change: number };
    apiCalls: { value: number; change: number };
    storage: { value: number; change: number };
    activeNow: { value: number };
  }> {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const twoDaysAgo = now - 48 * 60 * 60 * 1000;

    // Get current and previous period data
    const [
      currentApiCalls,
      previousApiCalls,
      currentStorage,
      previousStorage,
      users,
    ] = await Promise.all([
      this.usageStore.getUsageCount(tenantId, 'api_calls', dayAgo, now),
      this.usageStore.getUsageCount(tenantId, 'api_calls', twoDaysAgo, dayAgo),
      this.usageStore.getUsageCount(tenantId, 'storage_bytes', 0, now),
      this.usageStore.getUsageCount(tenantId, 'storage_bytes', 0, dayAgo),
      this.userStore.listUsers({ tenantId }),
    ]);

    // Calculate changes
    const apiCallsChange = previousApiCalls > 0
      ? ((currentApiCalls - previousApiCalls) / previousApiCalls) * 100
      : 0;

    const storageChange = previousStorage > 0
      ? ((currentStorage - previousStorage) / previousStorage) * 100
      : 0;

    // Active now (users who logged in within last hour)
    const hourAgo = now - 60 * 60 * 1000;
    const activeNow = users.filter(u => u.lastLoginAt && u.lastLoginAt >= hourAgo).length;

    return {
      users: { value: users.length, change: 0 },
      apiCalls: { value: currentApiCalls, change: apiCallsChange },
      storage: { value: currentStorage, change: storageChange },
      activeNow: { value: activeNow },
    };
  }

  /**
   * Generate usage alerts based on current usage
   */
  private async generateUsageAlerts(tenantId: string): Promise<UsageAlert[]> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) return [];

    const limits = getTierLimits(tenant.tier);
    const alerts: UsageAlert[] = [];
    const now = Date.now();

    // Check API calls
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const apiCallsToday = await this.usageStore.getUsageCount(
      tenantId,
      'api_calls',
      today.getTime(),
      today.getTime() + 24 * 60 * 60 * 1000
    );
    const apiPercentage = (apiCallsToday / limits.apiCallsPerDay) * 100;

    if (apiPercentage >= ENTERPRISE_DEFAULTS.USAGE_CRITICAL_THRESHOLD) {
      alerts.push({
        id: `api-calls-critical-${now}`,
        metric: 'api_calls',
        percentage: apiPercentage,
        severity: 'critical',
        message: `API calls at ${apiPercentage.toFixed(1)}% of daily limit`,
        timestamp: now,
      });
    } else if (apiPercentage >= ENTERPRISE_DEFAULTS.USAGE_WARNING_THRESHOLD) {
      alerts.push({
        id: `api-calls-warning-${now}`,
        metric: 'api_calls',
        percentage: apiPercentage,
        severity: 'warning',
        message: `API calls at ${apiPercentage.toFixed(1)}% of daily limit`,
        timestamp: now,
      });
    }

    // Check storage
    const storageUsed = await this.usageStore.getUsageCount(tenantId, 'storage_bytes', 0, now);
    const storagePercentage = (storageUsed / limits.storageLimitBytes) * 100;

    if (storagePercentage >= ENTERPRISE_DEFAULTS.USAGE_CRITICAL_THRESHOLD) {
      alerts.push({
        id: `storage-critical-${now}`,
        metric: 'storage_bytes',
        percentage: storagePercentage,
        severity: 'critical',
        message: `Storage at ${storagePercentage.toFixed(1)}% of limit`,
        timestamp: now,
      });
    } else if (storagePercentage >= ENTERPRISE_DEFAULTS.USAGE_WARNING_THRESHOLD) {
      alerts.push({
        id: `storage-warning-${now}`,
        metric: 'storage_bytes',
        percentage: storagePercentage,
        severity: 'warning',
        message: `Storage at ${storagePercentage.toFixed(1)}% of limit`,
        timestamp: now,
      });
    }

    // Check users
    const userCount = await this.userStore.countUsers(tenantId);
    const userPercentage = (userCount / limits.maxUsers) * 100;

    if (userPercentage >= ENTERPRISE_DEFAULTS.USAGE_CRITICAL_THRESHOLD) {
      alerts.push({
        id: `users-critical-${now}`,
        metric: 'users',
        percentage: userPercentage,
        severity: 'critical',
        message: `User count at ${userPercentage.toFixed(1)}% of limit`,
        timestamp: now,
      });
    } else if (userPercentage >= ENTERPRISE_DEFAULTS.USAGE_WARNING_THRESHOLD) {
      alerts.push({
        id: `users-warning-${now}`,
        metric: 'users',
        percentage: userPercentage,
        severity: 'warning',
        message: `User count at ${userPercentage.toFixed(1)}% of limit`,
        timestamp: now,
      });
    }

    return alerts;
  }
}

/**
 * Create admin dashboard service
 */
export function createAdminDashboardService(
  tenantStore: TenantStore,
  userStore: EnterpriseUserStore,
  subscriptionStore: SubscriptionStore,
  usageStore: UsageStore,
  auditLogStore: EnterpriseAuditLogStore
): AdminDashboardService {
  return new AdminDashboardService(tenantStore, userStore, subscriptionStore, usageStore, auditLogStore);
}
