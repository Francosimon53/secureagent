/**
 * Licensing Service
 *
 * Feature gating and tier-based access control
 */

import type {
  SubscriptionTier,
  TierLimits,
  TierFeatures,
  TierConfig,
  Tenant,
  UsageLimitResult,
  UsageMetric,
} from '../types.js';
import type { TenantStore } from '../stores/tenant-store.js';
import type { SubscriptionStore } from '../stores/subscription-store.js';
import type { UsageStore } from '../stores/usage-store.js';
import type { EnterpriseUserStore } from '../stores/user-store.js';
import { EnterpriseError } from '../types.js';
import {
  TIER_CONFIGS,
  getTierConfig,
  getTierLimits,
  getTierFeatures,
  hasFeature,
  compareTiers,
  getNextTier,
} from '../constants.js';

// =============================================================================
// Licensing Service
// =============================================================================

export class LicensingService {
  constructor(
    private readonly tenantStore: TenantStore,
    private readonly subscriptionStore: SubscriptionStore,
    private readonly usageStore?: UsageStore,
    private readonly userStore?: EnterpriseUserStore
  ) {}

  /**
   * Get the current tier configuration for a tenant
   */
  async getTenantTierConfig(tenantId: string): Promise<TierConfig> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    return getTierConfig(tenant.tier);
  }

  /**
   * Get tier limits for a tenant
   */
  async getTenantLimits(tenantId: string): Promise<TierLimits> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    return getTierLimits(tenant.tier);
  }

  /**
   * Get tier features for a tenant
   */
  async getTenantFeatures(tenantId: string): Promise<TierFeatures> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    return getTierFeatures(tenant.tier);
  }

  /**
   * Check if a specific feature is available for a tenant
   */
  async hasFeature(tenantId: string, feature: keyof TierFeatures): Promise<boolean> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    // Check if tenant is active
    if (tenant.status !== 'active') {
      return false;
    }

    // Check subscription status
    const subscription = await this.subscriptionStore.getSubscriptionByTenantId(tenantId);
    if (!subscription || (subscription.status !== 'active' && subscription.status !== 'trialing')) {
      return false;
    }

    return hasFeature(tenant.tier, feature);
  }

  /**
   * Require a feature, throwing if not available
   */
  async requireFeature(tenantId: string, feature: keyof TierFeatures): Promise<void> {
    const available = await this.hasFeature(tenantId, feature);
    if (!available) {
      const tenant = await this.tenantStore.getTenant(tenantId);
      throw new EnterpriseError(
        'FEATURE_NOT_AVAILABLE',
        `Feature "${feature}" is not available on the ${tenant?.tier ?? 'current'} plan`,
        403,
        { feature, currentTier: tenant?.tier }
      );
    }
  }

  /**
   * Check if additional users can be added to tenant
   */
  async canAddUsers(tenantId: string, count: number = 1): Promise<boolean> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const limits = getTierLimits(tenant.tier);
    // If we don't have a user store, assume check passes
    if (!this.userStore) {
      return true;
    }
    const currentUsers = await this.userStore.countUsers(tenantId);
    return currentUsers + count <= limits.maxUsers;
  }

  /**
   * Check current usage against limits
   */
  async checkUsageLimits(tenantId: string): Promise<Map<UsageMetric, UsageLimitResult>> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const limits = getTierLimits(tenant.tier);
    const results = new Map<UsageMetric, UsageLimitResult>();

    // Get current period for subscription
    const subscription = await this.subscriptionStore.getSubscriptionByTenantId(tenantId);
    const periodStart = subscription?.currentPeriodStart ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
    const periodEnd = subscription?.currentPeriodEnd ?? Date.now();

    // Check API calls per day (if usage store available)
    if (this.usageStore) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dayStart = today.getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;

      const apiCallsToday = await this.usageStore.getUsageCount(tenantId, 'api_calls', dayStart, dayEnd);
      results.set('api_calls', {
        metric: 'api_calls',
        current: apiCallsToday,
        limit: limits.apiCallsPerDay,
        percentage: (apiCallsToday / limits.apiCallsPerDay) * 100,
        exceeded: apiCallsToday >= limits.apiCallsPerDay,
        remaining: Math.max(0, limits.apiCallsPerDay - apiCallsToday),
      });
    }

    // Check users (if user store available)
    if (this.userStore) {
      const userCount = await this.userStore.countUsers(tenantId);
      results.set('users', {
        metric: 'users',
        current: userCount,
        limit: limits.maxUsers,
        percentage: (userCount / limits.maxUsers) * 100,
        exceeded: userCount >= limits.maxUsers,
        remaining: Math.max(0, limits.maxUsers - userCount),
      });
    }

    // Check storage (if usage store available)
    if (this.usageStore) {
      const storageUsed = await this.usageStore.getUsageCount(tenantId, 'storage_bytes', 0, Date.now());
      results.set('storage_bytes', {
        metric: 'storage_bytes',
        current: storageUsed,
        limit: limits.storageLimitBytes,
        percentage: (storageUsed / limits.storageLimitBytes) * 100,
        exceeded: storageUsed >= limits.storageLimitBytes,
        remaining: Math.max(0, limits.storageLimitBytes - storageUsed),
      });
    }

    return results;
  }

  /**
   * Check if a specific limit would be exceeded
   */
  async wouldExceedLimit(
    tenantId: string,
    metric: 'users' | 'bots' | 'api_calls',
    increment: number = 1
  ): Promise<{ exceeded: boolean; current: number; limit: number }> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const limits = getTierLimits(tenant.tier);

    let current: number;
    let limit: number;

    switch (metric) {
      case 'users':
        current = this.userStore ? await this.userStore.countUsers(tenantId) : 0;
        limit = limits.maxUsers;
        break;
      case 'bots':
        // For bots, we'd need a bot store - using a placeholder
        current = 0; // await this.botStore.countBots(tenantId);
        limit = limits.maxBots;
        break;
      case 'api_calls':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        current = this.usageStore ? await this.usageStore.getUsageCount(
          tenantId,
          'api_calls',
          today.getTime(),
          today.getTime() + 24 * 60 * 60 * 1000
        ) : 0;
        limit = limits.apiCallsPerDay;
        break;
      default:
        throw new EnterpriseError('INVALID_TIER', `Unknown metric: ${metric}`, 400);
    }

    return {
      exceeded: current + increment > limit,
      current,
      limit,
    };
  }

  /**
   * Require that a limit is not exceeded
   */
  async requireWithinLimits(
    tenantId: string,
    metric: 'users' | 'bots' | 'api_calls',
    increment: number = 1
  ): Promise<void> {
    const result = await this.wouldExceedLimit(tenantId, metric, increment);
    if (result.exceeded) {
      throw new EnterpriseError(
        'USAGE_LIMIT_EXCEEDED',
        `${metric} limit (${result.limit}) would be exceeded`,
        403,
        { metric, current: result.current, limit: result.limit }
      );
    }
  }

  /**
   * Get upgrade recommendation based on current usage
   */
  async getUpgradeRecommendation(tenantId: string): Promise<{
    shouldUpgrade: boolean;
    reason?: string;
    recommendedTier?: SubscriptionTier;
    savingsEstimate?: number;
  }> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const limits = await this.checkUsageLimits(tenantId);
    const features = getTierFeatures(tenant.tier);
    const nextTier = getNextTier(tenant.tier);

    if (!nextTier) {
      return { shouldUpgrade: false };
    }

    // Check if approaching limits (> 80%)
    const nearLimits: string[] = [];
    for (const [metric, result] of limits) {
      if (result.percentage > 80) {
        nearLimits.push(metric);
      }
    }

    if (nearLimits.length > 0) {
      return {
        shouldUpgrade: true,
        reason: `Approaching limits for: ${nearLimits.join(', ')}`,
        recommendedTier: nextTier,
      };
    }

    return { shouldUpgrade: false };
  }

  /**
   * Check if downgrade is allowed (current usage fits in lower tier)
   */
  async canDowngrade(tenantId: string, targetTier: SubscriptionTier): Promise<{
    allowed: boolean;
    blockers: string[];
  }> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    if (compareTiers(targetTier, tenant.tier) >= 0) {
      return { allowed: true, blockers: [] };
    }

    const targetLimits = getTierLimits(targetTier);
    const targetFeatures = getTierFeatures(targetTier);
    const blockers: string[] = [];

    // Check user count (if user store available)
    if (this.userStore) {
      const userCount = await this.userStore.countUsers(tenantId);
      if (userCount > targetLimits.maxUsers) {
        blockers.push(`Current user count (${userCount}) exceeds ${targetTier} limit (${targetLimits.maxUsers})`);
      }
    }

    // Check features in use
    if (!targetFeatures.sso) {
      // Check if SSO is configured
      // Would need SSO config store access
    }

    if (!targetFeatures.whiteLabel) {
      // Check if white-label is configured
      // Would need white-label store access
    }

    return {
      allowed: blockers.length === 0,
      blockers,
    };
  }

  /**
   * Get all tier configurations for comparison
   */
  getAllTierConfigs(): Record<SubscriptionTier, TierConfig> {
    return TIER_CONFIGS;
  }

  /**
   * Compare two tiers
   */
  compareTiers(tier1: SubscriptionTier, tier2: SubscriptionTier): number {
    return compareTiers(tier1, tier2);
  }

  /**
   * Check if subscription is in good standing
   */
  async isSubscriptionActive(tenantId: string): Promise<boolean> {
    const subscription = await this.subscriptionStore.getSubscriptionByTenantId(tenantId);
    if (!subscription) {
      return false;
    }

    return subscription.status === 'active' || subscription.status === 'trialing';
  }

  /**
   * Check if in trial period
   */
  async isInTrial(tenantId: string): Promise<boolean> {
    const subscription = await this.subscriptionStore.getSubscriptionByTenantId(tenantId);
    return subscription?.status === 'trialing';
  }

  /**
   * Get trial end date
   */
  async getTrialEndDate(tenantId: string): Promise<number | null> {
    const subscription = await this.subscriptionStore.getSubscriptionByTenantId(tenantId);
    return subscription?.trialEnd ?? null;
  }
}

/**
 * Create licensing service
 *
 * Accepts either:
 * - (subscriptionStore, tenantStore) - simplified API
 * - (tenantStore, subscriptionStore, usageStore, userStore) - full API
 */
export function createLicensingService(
  storeA: TenantStore | SubscriptionStore,
  storeB: SubscriptionStore | TenantStore,
  usageStore?: UsageStore,
  userStore?: EnterpriseUserStore
): LicensingService {
  // Detect which API is being used by checking if first param has getTenant method
  if ('getTenant' in storeA) {
    // Full API: (tenantStore, subscriptionStore, usageStore, userStore)
    return new LicensingService(
      storeA as TenantStore,
      storeB as SubscriptionStore,
      usageStore,
      userStore
    );
  } else {
    // Simplified API: (subscriptionStore, tenantStore)
    return new LicensingService(
      storeB as TenantStore,
      storeA as SubscriptionStore,
      undefined,
      undefined
    );
  }
}
