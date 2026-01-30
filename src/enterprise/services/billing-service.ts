/**
 * Billing Service
 *
 * Subscription management and Stripe integration
 */

import type {
  Subscription,
  SubscriptionTier,
  SubscriptionStatus,
  BillingInterval,
  Invoice,
  PaymentMethod,
  Tenant,
} from '../types.js';
import type { SubscriptionStore } from '../stores/subscription-store.js';
import type { TenantStore } from '../stores/tenant-store.js';
import type { EnterpriseAuditLogStore } from '../stores/audit-log-store.js';
import { EnterpriseError } from '../types.js';
import { getTierConfig, compareTiers, TIER_CONFIGS } from '../constants.js';

// =============================================================================
// Service Configuration
// =============================================================================

export interface BillingServiceConfig {
  /** Whether Stripe is enabled */
  stripeEnabled: boolean;
  /** Stripe price IDs */
  stripePriceIds?: {
    proMonthly?: string;
    proYearly?: string;
    businessMonthly?: string;
    businessYearly?: string;
  };
}

const DEFAULT_CONFIG: BillingServiceConfig = {
  stripeEnabled: false,
};

// =============================================================================
// Stripe Client Interface (for dependency injection)
// =============================================================================

export interface StripeClient {
  createCustomer(email: string, name: string, metadata?: Record<string, string>): Promise<string>;
  createSubscription(customerId: string, priceId: string): Promise<{
    subscriptionId: string;
    status: string;
    currentPeriodStart: number;
    currentPeriodEnd: number;
  }>;
  cancelSubscription(subscriptionId: string, atPeriodEnd?: boolean): Promise<void>;
  updateSubscription(subscriptionId: string, newPriceId: string): Promise<{
    status: string;
    currentPeriodStart: number;
    currentPeriodEnd: number;
  }>;
  getInvoices(customerId: string): Promise<Invoice[]>;
  getPaymentMethods(customerId: string): Promise<PaymentMethod[]>;
  createCheckoutSession(customerId: string, priceId: string, returnUrl: string): Promise<string>;
  createBillingPortalSession(customerId: string, returnUrl: string): Promise<string>;
}

// =============================================================================
// Billing Service
// =============================================================================

export class BillingService {
  private readonly config: BillingServiceConfig;

  constructor(
    private readonly subscriptionStore: SubscriptionStore,
    private readonly tenantStore: TenantStore,
    private readonly auditLogStore: EnterpriseAuditLogStore,
    private readonly stripeClient?: StripeClient,
    config?: Partial<BillingServiceConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get subscription for a tenant
   */
  async getSubscription(tenantId: string): Promise<Subscription | null> {
    return this.subscriptionStore.getSubscriptionByTenantId(tenantId);
  }

  /**
   * Create a new subscription (for new paid customers)
   */
  async createSubscription(
    tenantId: string,
    tier: SubscriptionTier,
    interval: BillingInterval = 'monthly'
  ): Promise<Subscription> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    // Check if subscription already exists
    const existing = await this.subscriptionStore.getSubscriptionByTenantId(tenantId);
    if (existing) {
      throw new EnterpriseError(
        'SUBSCRIPTION_REQUIRED',
        'Subscription already exists. Use upgrade/downgrade instead.',
        400
      );
    }

    const now = Date.now();
    const periodEnd = interval === 'monthly'
      ? now + 30 * 24 * 60 * 60 * 1000
      : now + 365 * 24 * 60 * 60 * 1000;

    // If Stripe is enabled and not free tier, create Stripe subscription
    let stripeSubscriptionId: string | undefined;
    let stripePriceId: string | undefined;

    if (this.config.stripeEnabled && this.stripeClient && tier !== 'free') {
      const priceId = this.getPriceId(tier, interval);
      if (priceId) {
        // Ensure customer exists
        let customerId = tenant.stripeCustomerId;
        if (!customerId) {
          customerId = await this.stripeClient.createCustomer(
            `tenant_${tenantId}@secureagent.io`, // Placeholder email
            tenant.name,
            { tenantId }
          );
          await this.tenantStore.updateTenant(tenantId, { stripeCustomerId: customerId });
        }

        const stripeResult = await this.stripeClient.createSubscription(customerId, priceId);
        stripeSubscriptionId = stripeResult.subscriptionId;
        stripePriceId = priceId;
      }
    }

    const subscription = await this.subscriptionStore.createSubscription({
      tenantId,
      tier,
      status: 'active',
      interval,
      stripeSubscriptionId,
      stripePriceId,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    });

    // Update tenant tier
    await this.tenantStore.updateTenant(tenantId, {
      tier,
      stripeSubscriptionId,
    });

    // Audit log
    await this.auditLogStore.createAuditLog({
      tenantId,
      eventType: 'subscription.created',
      action: 'create',
      resourceType: 'subscription',
      resourceId: subscription.id,
      details: { tier, interval },
      timestamp: now,
    });

    return subscription;
  }

  /**
   * Upgrade subscription to a higher tier
   */
  async upgradeSubscription(
    tenantId: string,
    newTier: SubscriptionTier,
    userId?: string
  ): Promise<Subscription> {
    const subscription = await this.getSubscription(tenantId);
    if (!subscription) {
      // Create new subscription if none exists
      return this.createSubscription(tenantId, newTier);
    }

    // Validate upgrade
    if (compareTiers(newTier, subscription.tier) <= 0) {
      throw new EnterpriseError(
        'INVALID_TIER',
        'New tier must be higher than current tier',
        400
      );
    }

    const now = Date.now();

    // Update Stripe subscription if applicable
    if (this.config.stripeEnabled && this.stripeClient && subscription.stripeSubscriptionId) {
      const priceId = this.getPriceId(newTier, subscription.interval);
      if (priceId) {
        await this.stripeClient.updateSubscription(subscription.stripeSubscriptionId, priceId);
      }
    }

    // Update local subscription
    const updated = await this.subscriptionStore.updateSubscription(subscription.id, {
      tier: newTier,
      stripePriceId: this.getPriceId(newTier, subscription.interval),
    });

    // Update tenant tier
    await this.tenantStore.updateTenant(tenantId, { tier: newTier });

    // Audit log
    await this.auditLogStore.createAuditLog({
      tenantId,
      userId,
      eventType: 'subscription.upgraded',
      action: 'upgrade',
      resourceType: 'subscription',
      resourceId: subscription.id,
      details: { previousTier: subscription.tier, newTier },
      timestamp: now,
    });

    return updated!;
  }

  /**
   * Downgrade subscription to a lower tier
   */
  async downgradeSubscription(
    tenantId: string,
    newTier: SubscriptionTier,
    userId?: string
  ): Promise<Subscription> {
    const subscription = await this.getSubscription(tenantId);
    if (!subscription) {
      throw new EnterpriseError('SUBSCRIPTION_REQUIRED', 'No subscription found', 404);
    }

    // Validate downgrade
    if (compareTiers(newTier, subscription.tier) >= 0) {
      throw new EnterpriseError(
        'INVALID_TIER',
        'New tier must be lower than current tier',
        400
      );
    }

    // Downgrade happens at end of current period
    const updated = await this.subscriptionStore.updateSubscription(subscription.id, {
      cancelAtPeriodEnd: true,
    });

    // Audit log
    await this.auditLogStore.createAuditLog({
      tenantId,
      userId,
      eventType: 'subscription.downgraded',
      action: 'downgrade',
      resourceType: 'subscription',
      resourceId: subscription.id,
      details: { previousTier: subscription.tier, newTier, effectiveAt: subscription.currentPeriodEnd },
      timestamp: Date.now(),
    });

    return updated!;
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    tenantId: string,
    immediately: boolean = false,
    userId?: string
  ): Promise<Subscription> {
    const subscription = await this.getSubscription(tenantId);
    if (!subscription) {
      throw new EnterpriseError('SUBSCRIPTION_REQUIRED', 'No subscription found', 404);
    }

    const now = Date.now();

    // Cancel in Stripe if applicable
    if (this.config.stripeEnabled && this.stripeClient && subscription.stripeSubscriptionId) {
      await this.stripeClient.cancelSubscription(subscription.stripeSubscriptionId, !immediately);
    }

    // Update local subscription
    const updates: Partial<Subscription> = {
      cancelAtPeriodEnd: !immediately,
      canceledAt: now,
    };

    if (immediately) {
      updates.status = 'canceled';
    }

    const updated = await this.subscriptionStore.updateSubscription(subscription.id, updates);

    // If immediate, downgrade tenant to free
    if (immediately) {
      await this.tenantStore.updateTenant(tenantId, { tier: 'free' });
    }

    // Audit log
    await this.auditLogStore.createAuditLog({
      tenantId,
      userId,
      eventType: 'subscription.canceled',
      action: 'cancel',
      resourceType: 'subscription',
      resourceId: subscription.id,
      details: { immediately, effectiveAt: immediately ? now : subscription.currentPeriodEnd },
      timestamp: now,
    });

    return updated!;
  }

  /**
   * Reactivate a canceled subscription
   */
  async reactivateSubscription(tenantId: string, userId?: string): Promise<Subscription> {
    const subscription = await this.getSubscription(tenantId);
    if (!subscription) {
      throw new EnterpriseError('SUBSCRIPTION_REQUIRED', 'No subscription found', 404);
    }

    if (!subscription.cancelAtPeriodEnd && subscription.status !== 'canceled') {
      return subscription; // Already active
    }

    const updated = await this.subscriptionStore.updateSubscription(subscription.id, {
      cancelAtPeriodEnd: false,
      canceledAt: undefined,
      status: 'active',
    });

    // Audit log
    await this.auditLogStore.createAuditLog({
      tenantId,
      userId,
      eventType: 'subscription.renewed',
      action: 'reactivate',
      resourceType: 'subscription',
      resourceId: subscription.id,
      timestamp: Date.now(),
    });

    return updated!;
  }

  /**
   * Get invoices for a tenant
   */
  async getInvoices(tenantId: string): Promise<Invoice[]> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    if (this.config.stripeEnabled && this.stripeClient && tenant.stripeCustomerId) {
      return this.stripeClient.getInvoices(tenant.stripeCustomerId);
    }

    return [];
  }

  /**
   * Get payment methods for a tenant
   */
  async getPaymentMethods(tenantId: string): Promise<PaymentMethod[]> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    if (this.config.stripeEnabled && this.stripeClient && tenant.stripeCustomerId) {
      return this.stripeClient.getPaymentMethods(tenant.stripeCustomerId);
    }

    return [];
  }

  /**
   * Create a checkout session for new subscription
   */
  async createCheckoutSession(
    tenantId: string,
    tier: SubscriptionTier,
    interval: BillingInterval,
    returnUrl: string
  ): Promise<string> {
    if (!this.config.stripeEnabled || !this.stripeClient) {
      throw new EnterpriseError(
        'PAYMENT_FAILED',
        'Stripe is not configured',
        500
      );
    }

    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const priceId = this.getPriceId(tier, interval);
    if (!priceId) {
      throw new EnterpriseError(
        'INVALID_TIER',
        `No price configured for ${tier} ${interval}`,
        400
      );
    }

    // Ensure customer exists
    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      customerId = await this.stripeClient.createCustomer(
        `tenant_${tenantId}@secureagent.io`,
        tenant.name,
        { tenantId }
      );
      await this.tenantStore.updateTenant(tenantId, { stripeCustomerId: customerId });
    }

    return this.stripeClient.createCheckoutSession(customerId, priceId, returnUrl);
  }

  /**
   * Create a billing portal session for managing subscription
   */
  async createBillingPortalSession(tenantId: string, returnUrl: string): Promise<string> {
    if (!this.config.stripeEnabled || !this.stripeClient) {
      throw new EnterpriseError(
        'PAYMENT_FAILED',
        'Stripe is not configured',
        500
      );
    }

    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant?.stripeCustomerId) {
      throw new EnterpriseError(
        'PAYMENT_REQUIRED',
        'No billing account found',
        400
      );
    }

    return this.stripeClient.createBillingPortalSession(tenant.stripeCustomerId, returnUrl);
  }

  /**
   * Process subscription renewal
   */
  async processRenewal(subscriptionId: string): Promise<Subscription> {
    const subscription = await this.subscriptionStore.getSubscription(subscriptionId);
    if (!subscription) {
      throw new EnterpriseError('SUBSCRIPTION_REQUIRED', 'Subscription not found', 404);
    }

    // Calculate new period
    const now = Date.now();
    const periodLength = subscription.interval === 'monthly'
      ? 30 * 24 * 60 * 60 * 1000
      : 365 * 24 * 60 * 60 * 1000;

    const updated = await this.subscriptionStore.updateSubscription(subscriptionId, {
      currentPeriodStart: now,
      currentPeriodEnd: now + periodLength,
      status: 'active',
    });

    // Audit log
    await this.auditLogStore.createAuditLog({
      tenantId: subscription.tenantId,
      eventType: 'subscription.renewed',
      action: 'renew',
      resourceType: 'subscription',
      resourceId: subscriptionId,
      timestamp: now,
    });

    return updated!;
  }

  /**
   * Handle payment failure
   */
  async handlePaymentFailure(tenantId: string): Promise<void> {
    const subscription = await this.getSubscription(tenantId);
    if (!subscription) return;

    await this.subscriptionStore.updateSubscription(subscription.id, {
      status: 'past_due',
    });

    // Audit log
    await this.auditLogStore.createAuditLog({
      tenantId,
      eventType: 'payment.failed',
      action: 'payment_failed',
      resourceType: 'subscription',
      resourceId: subscription.id,
      timestamp: Date.now(),
    });
  }

  /**
   * Get price ID for a tier and interval
   */
  private getPriceId(tier: SubscriptionTier, interval: BillingInterval): string | undefined {
    if (!this.config.stripePriceIds) return undefined;

    const key = `${tier}${interval.charAt(0).toUpperCase() + interval.slice(1)}` as keyof typeof this.config.stripePriceIds;
    return this.config.stripePriceIds[key];
  }

  /**
   * Get pricing information for all tiers
   */
  getPricing(): Array<{
    tier: SubscriptionTier;
    monthlyPrice: number;
    yearlyPrice: number;
    features: string[];
  }> {
    return (['free', 'pro', 'business', 'enterprise'] as SubscriptionTier[]).map(tier => {
      const config = getTierConfig(tier);
      const features: string[] = [];

      if (config.features.sso) features.push('SSO Authentication');
      if (config.features.whiteLabel) features.push('White-label branding');
      if (config.features.customDomain) features.push('Custom domain');
      if (config.features.auditLogs) features.push('Audit logs');
      if (config.features.apiKeys) features.push('API key management');
      if (config.features.prioritySupport) features.push('Priority support');
      if (config.features.advancedAnalytics) features.push('Advanced analytics');
      if (config.features.slaGuarantee) features.push('SLA guarantee');

      features.push(`Up to ${config.limits.maxUsers === Number.MAX_SAFE_INTEGER ? 'unlimited' : config.limits.maxUsers} users`);
      features.push(`${config.limits.apiCallsPerDay === Number.MAX_SAFE_INTEGER ? 'Unlimited' : config.limits.apiCallsPerDay.toLocaleString()} API calls/day`);

      return {
        tier,
        monthlyPrice: config.priceMonthly,
        yearlyPrice: config.priceYearly,
        features,
      };
    });
  }
}

/**
 * Create billing service
 */
export function createBillingService(
  subscriptionStore: SubscriptionStore,
  tenantStore: TenantStore,
  auditLogStore: EnterpriseAuditLogStore,
  stripeClient?: StripeClient,
  config?: Partial<BillingServiceConfig>
): BillingService {
  return new BillingService(subscriptionStore, tenantStore, auditLogStore, stripeClient, config);
}
