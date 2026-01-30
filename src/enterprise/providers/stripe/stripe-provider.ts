/**
 * Stripe Provider
 *
 * Stripe API integration for subscription billing
 */

import type { EventEmitter } from 'events';
import { BaseEnterpriseProvider, type BaseProviderConfig } from '../base.js';
import type {
  SubscriptionTier,
  SubscriptionInterval,
  Subscription,
} from '../../types.js';

// =============================================================================
// Stripe Types
// =============================================================================

export interface StripeCustomer {
  id: string;
  email: string;
  name?: string;
  metadata: Record<string, string>;
  created: number;
  defaultPaymentMethod?: string;
}

export interface StripeSubscription {
  id: string;
  customerId: string;
  status: 'active' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'unpaid';
  priceId: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  canceledAt?: number;
  trialStart?: number;
  trialEnd?: number;
  metadata: Record<string, string>;
}

export interface StripePrice {
  id: string;
  productId: string;
  currency: string;
  unitAmount: number;
  interval: 'month' | 'year';
  active: boolean;
  metadata: Record<string, string>;
}

export interface StripeInvoice {
  id: string;
  customerId: string;
  subscriptionId?: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  amountDue: number;
  amountPaid: number;
  currency: string;
  created: number;
  periodStart: number;
  periodEnd: number;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
}

export interface StripePaymentMethod {
  id: string;
  type: 'card' | 'bank_account';
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  billingDetails: {
    name?: string;
    email?: string;
  };
}

export interface StripeUsageRecord {
  id: string;
  subscriptionItemId: string;
  quantity: number;
  timestamp: number;
  action: 'increment' | 'set';
}

// =============================================================================
// Provider Configuration
// =============================================================================

export interface StripeProviderConfig extends BaseProviderConfig {
  /** Stripe secret key */
  secretKey: string;
  /** Stripe publishable key (for client-side) */
  publishableKey?: string;
  /** Webhook signing secret */
  webhookSecret?: string;
  /** API version */
  apiVersion?: string;
  /** Price IDs for each tier */
  priceIds: {
    pro: { monthly: string; yearly: string };
    business: { monthly: string; yearly: string };
    enterprise?: { monthly?: string; yearly?: string };
  };
  /** Trial period in days */
  trialPeriodDays?: number;
}

// =============================================================================
// Stripe Client Interface
// =============================================================================

/**
 * Stripe client interface for dependency injection
 * This allows using the actual Stripe SDK or a mock implementation
 */
export interface StripeClient {
  customers: {
    create(params: {
      email: string;
      name?: string;
      metadata?: Record<string, string>;
    }): Promise<StripeCustomer>;
    retrieve(id: string): Promise<StripeCustomer>;
    update(id: string, params: {
      email?: string;
      name?: string;
      metadata?: Record<string, string>;
    }): Promise<StripeCustomer>;
    del(id: string): Promise<{ id: string; deleted: boolean }>;
  };
  subscriptions: {
    create(params: {
      customer: string;
      items: Array<{ price: string }>;
      trial_period_days?: number;
      metadata?: Record<string, string>;
      payment_behavior?: 'default_incomplete' | 'error_if_incomplete' | 'allow_incomplete';
    }): Promise<StripeSubscription>;
    retrieve(id: string): Promise<StripeSubscription>;
    update(id: string, params: {
      items?: Array<{ price: string }>;
      proration_behavior?: 'create_prorations' | 'none' | 'always_invoice';
      cancel_at_period_end?: boolean;
      metadata?: Record<string, string>;
    }): Promise<StripeSubscription>;
    cancel(id: string): Promise<StripeSubscription>;
    list(params: { customer: string; limit?: number }): Promise<{
      data: StripeSubscription[];
      has_more: boolean;
    }>;
  };
  prices: {
    retrieve(id: string): Promise<StripePrice>;
    list(params?: { product?: string; active?: boolean; limit?: number }): Promise<{
      data: StripePrice[];
      has_more: boolean;
    }>;
  };
  invoices: {
    retrieve(id: string): Promise<StripeInvoice>;
    list(params: { customer: string; limit?: number }): Promise<{
      data: StripeInvoice[];
      has_more: boolean;
    }>;
    upcoming(params: { customer: string; subscription?: string }): Promise<StripeInvoice>;
    pay(id: string): Promise<StripeInvoice>;
  };
  paymentMethods: {
    retrieve(id: string): Promise<StripePaymentMethod>;
    list(params: { customer: string; type: string }): Promise<{
      data: StripePaymentMethod[];
      has_more: boolean;
    }>;
    attach(id: string, params: { customer: string }): Promise<StripePaymentMethod>;
    detach(id: string): Promise<StripePaymentMethod>;
  };
  subscriptionItems: {
    createUsageRecord(id: string, params: {
      quantity: number;
      timestamp?: number;
      action?: 'increment' | 'set';
    }): Promise<StripeUsageRecord>;
  };
  billingPortal: {
    sessions: {
      create(params: {
        customer: string;
        return_url: string;
      }): Promise<{ id: string; url: string }>;
    };
  };
  checkout: {
    sessions: {
      create(params: {
        customer?: string;
        customer_email?: string;
        mode: 'subscription' | 'payment' | 'setup';
        line_items: Array<{ price: string; quantity: number }>;
        success_url: string;
        cancel_url: string;
        subscription_data?: {
          trial_period_days?: number;
          metadata?: Record<string, string>;
        };
        metadata?: Record<string, string>;
      }): Promise<{ id: string; url: string }>;
    };
  };
  webhooks: {
    constructEvent(
      payload: string | Buffer,
      signature: string,
      secret: string
    ): { type: string; data: { object: unknown } };
  };
}

// =============================================================================
// Stripe Provider
// =============================================================================

export class StripeProvider extends BaseEnterpriseProvider<StripeProviderConfig> {
  private client: StripeClient | null = null;

  constructor(
    config: StripeProviderConfig,
    eventEmitter?: EventEmitter,
    client?: StripeClient
  ) {
    super(config, eventEmitter);
    if (client) {
      this.client = client;
    }
  }

  /**
   * Set the Stripe client (for dependency injection)
   */
  setClient(client: StripeClient): void {
    this.client = client;
  }

  /**
   * Get the Stripe client
   */
  getClient(): StripeClient {
    if (!this.client) {
      throw new Error('Stripe client not initialized');
    }
    return this.client;
  }

  // =============================================================================
  // Customer Operations
  // =============================================================================

  /**
   * Create a Stripe customer
   */
  async createCustomer(params: {
    email: string;
    name?: string;
    tenantId: string;
    metadata?: Record<string, string>;
  }): Promise<StripeCustomer> {
    return this.withRetry(async () => {
      const customer = await this.getClient().customers.create({
        email: params.email,
        name: params.name,
        metadata: {
          tenant_id: params.tenantId,
          ...params.metadata,
        },
      });

      this.emit('stripe:customer:created', {
        customerId: customer.id,
        tenantId: params.tenantId,
      });

      return customer;
    }, 'createCustomer');
  }

  /**
   * Get a Stripe customer
   */
  async getCustomer(customerId: string): Promise<StripeCustomer> {
    return this.withRetry(async () => {
      return this.getClient().customers.retrieve(customerId);
    }, 'getCustomer');
  }

  /**
   * Update a Stripe customer
   */
  async updateCustomer(
    customerId: string,
    params: {
      email?: string;
      name?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<StripeCustomer> {
    return this.withRetry(async () => {
      return this.getClient().customers.update(customerId, params);
    }, 'updateCustomer');
  }

  /**
   * Delete a Stripe customer
   */
  async deleteCustomer(customerId: string): Promise<void> {
    return this.withRetry(async () => {
      await this.getClient().customers.del(customerId);
      this.emit('stripe:customer:deleted', { customerId });
    }, 'deleteCustomer');
  }

  // =============================================================================
  // Subscription Operations
  // =============================================================================

  /**
   * Create a subscription
   */
  async createSubscription(params: {
    customerId: string;
    tier: SubscriptionTier;
    interval: SubscriptionInterval;
    tenantId: string;
    withTrial?: boolean;
  }): Promise<StripeSubscription> {
    if (params.tier === 'free') {
      throw new Error('Cannot create Stripe subscription for free tier');
    }

    const priceId = this.getPriceId(params.tier, params.interval);

    return this.withRetry(async () => {
      const subscription = await this.getClient().subscriptions.create({
        customer: params.customerId,
        items: [{ price: priceId }],
        trial_period_days: params.withTrial ? this.config.trialPeriodDays : undefined,
        metadata: {
          tenant_id: params.tenantId,
          tier: params.tier,
        },
        payment_behavior: 'default_incomplete',
      });

      this.emit('stripe:subscription:created', {
        subscriptionId: subscription.id,
        customerId: params.customerId,
        tenantId: params.tenantId,
        tier: params.tier,
      });

      return subscription;
    }, 'createSubscription');
  }

  /**
   * Get a subscription
   */
  async getSubscription(subscriptionId: string): Promise<StripeSubscription> {
    return this.withRetry(async () => {
      return this.getClient().subscriptions.retrieve(subscriptionId);
    }, 'getSubscription');
  }

  /**
   * Update a subscription (change tier)
   */
  async updateSubscription(
    subscriptionId: string,
    params: {
      tier?: SubscriptionTier;
      interval?: SubscriptionInterval;
      cancelAtPeriodEnd?: boolean;
    }
  ): Promise<StripeSubscription> {
    const updateParams: Parameters<StripeClient['subscriptions']['update']>[1] = {};

    if (params.tier && params.interval && params.tier !== 'free') {
      const priceId = this.getPriceId(params.tier, params.interval);
      updateParams.items = [{ price: priceId }];
      updateParams.proration_behavior = 'create_prorations';
      updateParams.metadata = { tier: params.tier };
    }

    if (params.cancelAtPeriodEnd !== undefined) {
      updateParams.cancel_at_period_end = params.cancelAtPeriodEnd;
    }

    return this.withRetry(async () => {
      const subscription = await this.getClient().subscriptions.update(
        subscriptionId,
        updateParams
      );

      this.emit('stripe:subscription:updated', {
        subscriptionId,
        tier: params.tier,
      });

      return subscription;
    }, 'updateSubscription');
  }

  /**
   * Cancel a subscription immediately
   */
  async cancelSubscription(subscriptionId: string): Promise<StripeSubscription> {
    return this.withRetry(async () => {
      const subscription = await this.getClient().subscriptions.cancel(subscriptionId);

      this.emit('stripe:subscription:canceled', { subscriptionId });

      return subscription;
    }, 'cancelSubscription');
  }

  /**
   * List customer subscriptions
   */
  async listSubscriptions(customerId: string): Promise<StripeSubscription[]> {
    return this.withRetry(async () => {
      const result = await this.getClient().subscriptions.list({
        customer: customerId,
        limit: 100,
      });
      return result.data;
    }, 'listSubscriptions');
  }

  // =============================================================================
  // Invoice Operations
  // =============================================================================

  /**
   * Get an invoice
   */
  async getInvoice(invoiceId: string): Promise<StripeInvoice> {
    return this.withRetry(async () => {
      return this.getClient().invoices.retrieve(invoiceId);
    }, 'getInvoice');
  }

  /**
   * List customer invoices
   */
  async listInvoices(customerId: string, limit: number = 10): Promise<StripeInvoice[]> {
    return this.withRetry(async () => {
      const result = await this.getClient().invoices.list({
        customer: customerId,
        limit,
      });
      return result.data;
    }, 'listInvoices');
  }

  /**
   * Get upcoming invoice
   */
  async getUpcomingInvoice(
    customerId: string,
    subscriptionId?: string
  ): Promise<StripeInvoice> {
    return this.withRetry(async () => {
      return this.getClient().invoices.upcoming({
        customer: customerId,
        subscription: subscriptionId,
      });
    }, 'getUpcomingInvoice');
  }

  /**
   * Pay an invoice
   */
  async payInvoice(invoiceId: string): Promise<StripeInvoice> {
    return this.withRetry(async () => {
      const invoice = await this.getClient().invoices.pay(invoiceId);

      this.emit('stripe:invoice:paid', {
        invoiceId,
        customerId: invoice.customerId,
        amount: invoice.amountPaid,
      });

      return invoice;
    }, 'payInvoice');
  }

  // =============================================================================
  // Payment Method Operations
  // =============================================================================

  /**
   * List customer payment methods
   */
  async listPaymentMethods(customerId: string): Promise<StripePaymentMethod[]> {
    return this.withRetry(async () => {
      const result = await this.getClient().paymentMethods.list({
        customer: customerId,
        type: 'card',
      });
      return result.data;
    }, 'listPaymentMethods');
  }

  /**
   * Attach a payment method to a customer
   */
  async attachPaymentMethod(
    paymentMethodId: string,
    customerId: string
  ): Promise<StripePaymentMethod> {
    return this.withRetry(async () => {
      return this.getClient().paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
    }, 'attachPaymentMethod');
  }

  /**
   * Detach a payment method
   */
  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    return this.withRetry(async () => {
      await this.getClient().paymentMethods.detach(paymentMethodId);
    }, 'detachPaymentMethod');
  }

  // =============================================================================
  // Usage-Based Billing
  // =============================================================================

  /**
   * Report usage for metered billing
   */
  async reportUsage(
    subscriptionItemId: string,
    quantity: number,
    timestamp?: number
  ): Promise<StripeUsageRecord> {
    return this.withRetry(async () => {
      return this.getClient().subscriptionItems.createUsageRecord(
        subscriptionItemId,
        {
          quantity,
          timestamp: timestamp ?? Math.floor(Date.now() / 1000),
          action: 'increment',
        }
      );
    }, 'reportUsage');
  }

  // =============================================================================
  // Checkout & Portal
  // =============================================================================

  /**
   * Create a checkout session
   */
  async createCheckoutSession(params: {
    customerId?: string;
    customerEmail?: string;
    tier: SubscriptionTier;
    interval: SubscriptionInterval;
    tenantId: string;
    successUrl: string;
    cancelUrl: string;
    withTrial?: boolean;
  }): Promise<{ sessionId: string; url: string }> {
    if (params.tier === 'free') {
      throw new Error('Cannot create checkout session for free tier');
    }

    const priceId = this.getPriceId(params.tier, params.interval);

    return this.withRetry(async () => {
      const session = await this.getClient().checkout.sessions.create({
        customer: params.customerId,
        customer_email: params.customerEmail,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        subscription_data: {
          trial_period_days: params.withTrial ? this.config.trialPeriodDays : undefined,
          metadata: {
            tenant_id: params.tenantId,
            tier: params.tier,
          },
        },
        metadata: {
          tenant_id: params.tenantId,
        },
      });

      return { sessionId: session.id, url: session.url };
    }, 'createCheckoutSession');
  }

  /**
   * Create a billing portal session
   */
  async createPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<{ url: string }> {
    return this.withRetry(async () => {
      const session = await this.getClient().billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return { url: session.url };
    }, 'createPortalSession');
  }

  // =============================================================================
  // Webhook Verification
  // =============================================================================

  /**
   * Verify and parse a webhook event
   */
  verifyWebhookEvent(
    payload: string | Buffer,
    signature: string
  ): { type: string; data: unknown } {
    if (!this.config.webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    const event = this.getClient().webhooks.constructEvent(
      payload,
      signature,
      this.config.webhookSecret
    );

    return {
      type: event.type,
      data: event.data.object,
    };
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  /**
   * Get price ID for tier and interval
   */
  private getPriceId(tier: SubscriptionTier, interval: SubscriptionInterval): string {
    if (tier === 'free') {
      throw new Error('Free tier has no price');
    }

    const tierPrices = this.config.priceIds[tier];
    if (!tierPrices) {
      throw new Error(`Price not configured for tier: ${tier}`);
    }

    const priceId = tierPrices[interval];
    if (!priceId) {
      throw new Error(`Price not configured for ${tier}/${interval}`);
    }

    return priceId;
  }

  /**
   * Map Stripe subscription status to internal status
   */
  mapSubscriptionStatus(
    stripeStatus: StripeSubscription['status']
  ): Subscription['status'] {
    switch (stripeStatus) {
      case 'active':
        return 'active';
      case 'trialing':
        return 'trialing';
      case 'past_due':
        return 'past_due';
      case 'canceled':
        return 'canceled';
      case 'unpaid':
      case 'incomplete':
      case 'incomplete_expired':
        return 'unpaid';
      default:
        return 'active';
    }
  }

  // =============================================================================
  // Provider Lifecycle
  // =============================================================================

  protected async doInitialize(): Promise<void> {
    if (!this.client) {
      throw new Error('Stripe client must be set before initialization');
    }

    // Verify API key by fetching prices
    await this.getClient().prices.list({ limit: 1 });
  }

  protected async doShutdown(): Promise<void> {
    // No cleanup needed for Stripe
  }

  protected async doHealthCheck(): Promise<Record<string, unknown>> {
    // Simple health check - list prices
    const prices = await this.getClient().prices.list({ limit: 1 });
    return {
      connected: true,
      pricesAvailable: prices.data.length > 0,
    };
  }
}

/**
 * Create Stripe provider
 */
export function createStripeProvider(
  config: StripeProviderConfig,
  eventEmitter?: EventEmitter,
  client?: StripeClient
): StripeProvider {
  return new StripeProvider(config, eventEmitter, client);
}
