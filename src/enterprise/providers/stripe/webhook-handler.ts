/**
 * Stripe Webhook Handler
 *
 * Process Stripe webhook events for subscription lifecycle management
 */

import type { EventEmitter } from 'events';
import type {
  StripeProvider,
  StripeSubscription,
  StripeInvoice,
  StripeCustomer,
} from './stripe-provider.js';
import type { SubscriptionStore } from '../../stores/subscription-store.js';
import type { TenantStore } from '../../stores/tenant-store.js';
import type { EnterpriseAuditLogStore } from '../../stores/audit-log-store.js';
import type { SubscriptionTier } from '../../types.js';
import { ENTERPRISE_EVENTS } from '../../constants.js';

// =============================================================================
// Webhook Event Types
// =============================================================================

export type StripeWebhookEventType =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'customer.subscription.trial_will_end'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'invoice.payment_action_required'
  | 'invoice.upcoming'
  | 'customer.created'
  | 'customer.updated'
  | 'customer.deleted'
  | 'payment_method.attached'
  | 'payment_method.detached'
  | 'checkout.session.completed';

export interface WebhookHandlerResult {
  success: boolean;
  eventType: string;
  message?: string;
  error?: string;
}

// =============================================================================
// Webhook Handler Configuration
// =============================================================================

export interface WebhookHandlerConfig {
  /** Stripe provider instance */
  stripeProvider: StripeProvider;
  /** Subscription store */
  subscriptionStore: SubscriptionStore;
  /** Tenant store */
  tenantStore: TenantStore;
  /** Audit log store */
  auditLogStore: EnterpriseAuditLogStore;
  /** Event emitter */
  eventEmitter?: EventEmitter;
}

// =============================================================================
// Webhook Handler
// =============================================================================

export class StripeWebhookHandler {
  private readonly stripe: StripeProvider;
  private readonly subscriptionStore: SubscriptionStore;
  private readonly tenantStore: TenantStore;
  private readonly auditLogStore: EnterpriseAuditLogStore;
  private readonly eventEmitter?: EventEmitter;

  constructor(config: WebhookHandlerConfig) {
    this.stripe = config.stripeProvider;
    this.subscriptionStore = config.subscriptionStore;
    this.tenantStore = config.tenantStore;
    this.auditLogStore = config.auditLogStore;
    this.eventEmitter = config.eventEmitter;
  }

  /**
   * Handle incoming webhook
   */
  async handleWebhook(
    payload: string | Buffer,
    signature: string
  ): Promise<WebhookHandlerResult> {
    let event: { type: string; data: unknown };

    try {
      event = this.stripe.verifyWebhookEvent(payload, signature);
    } catch (error) {
      return {
        success: false,
        eventType: 'unknown',
        error: 'Webhook signature verification failed',
      };
    }

    try {
      const result = await this.processEvent(event.type, event.data);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        eventType: event.type,
        error: errorMessage,
      };
    }
  }

  /**
   * Process a webhook event
   */
  private async processEvent(
    eventType: string,
    data: unknown
  ): Promise<WebhookHandlerResult> {
    switch (eventType) {
      case 'customer.subscription.created':
        return this.handleSubscriptionCreated(data as StripeSubscription);

      case 'customer.subscription.updated':
        return this.handleSubscriptionUpdated(data as StripeSubscription);

      case 'customer.subscription.deleted':
        return this.handleSubscriptionDeleted(data as StripeSubscription);

      case 'customer.subscription.trial_will_end':
        return this.handleTrialWillEnd(data as StripeSubscription);

      case 'invoice.paid':
        return this.handleInvoicePaid(data as StripeInvoice);

      case 'invoice.payment_failed':
        return this.handleInvoicePaymentFailed(data as StripeInvoice);

      case 'invoice.payment_action_required':
        return this.handlePaymentActionRequired(data as StripeInvoice);

      case 'invoice.upcoming':
        return this.handleInvoiceUpcoming(data as StripeInvoice);

      case 'checkout.session.completed':
        return this.handleCheckoutCompleted(data as {
          id: string;
          customer: string;
          subscription: string;
          metadata: Record<string, string>;
        });

      default:
        return {
          success: true,
          eventType,
          message: `Unhandled event type: ${eventType}`,
        };
    }
  }

  // =============================================================================
  // Subscription Event Handlers
  // =============================================================================

  private async handleSubscriptionCreated(
    subscription: StripeSubscription
  ): Promise<WebhookHandlerResult> {
    const tenantId = subscription.metadata?.tenant_id;
    if (!tenantId) {
      return {
        success: false,
        eventType: 'customer.subscription.created',
        error: 'Missing tenant_id in subscription metadata',
      };
    }

    const tier = (subscription.metadata?.tier as SubscriptionTier) ?? 'pro';

    await this.subscriptionStore.upsertSubscription({
      id: subscription.id,
      tenantId,
      tier,
      status: this.stripe.mapSubscriptionStatus(subscription.status),
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.priceId,
      stripeCustomerId: subscription.customerId,
      interval: 'monthly', // Would need to lookup price to determine
      currentPeriodStart: subscription.currentPeriodStart * 1000,
      currentPeriodEnd: subscription.currentPeriodEnd * 1000,
      trialStart: subscription.trialStart ? subscription.trialStart * 1000 : undefined,
      trialEnd: subscription.trialEnd ? subscription.trialEnd * 1000 : undefined,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    });

    // Update tenant tier
    await this.tenantStore.updateTenant(tenantId, { tier });

    // Audit log
    await this.auditLogStore.createAuditLog({
      tenantId,
      eventType: 'subscription.created',
      action: 'create',
      resourceType: 'subscription',
      resourceId: subscription.id,
      details: {
        tier,
        status: subscription.status,
        stripeSubscriptionId: subscription.id,
      },
      timestamp: Date.now(),
    });

    this.emit(ENTERPRISE_EVENTS.SUBSCRIPTION_CREATED, {
      tenantId,
      subscriptionId: subscription.id,
      tier,
    });

    return {
      success: true,
      eventType: 'customer.subscription.created',
      message: `Subscription created for tenant ${tenantId}`,
    };
  }

  private async handleSubscriptionUpdated(
    subscription: StripeSubscription
  ): Promise<WebhookHandlerResult> {
    const existingSub = await this.subscriptionStore.getSubscriptionByStripeId(
      subscription.id
    );

    if (!existingSub) {
      return {
        success: false,
        eventType: 'customer.subscription.updated',
        error: 'Subscription not found',
      };
    }

    const oldTier = existingSub.tier;
    const newTier = (subscription.metadata?.tier as SubscriptionTier) ?? existingSub.tier;

    await this.subscriptionStore.updateSubscription(existingSub.id, {
      tier: newTier,
      status: this.stripe.mapSubscriptionStatus(subscription.status),
      stripePriceId: subscription.priceId,
      currentPeriodStart: subscription.currentPeriodStart * 1000,
      currentPeriodEnd: subscription.currentPeriodEnd * 1000,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: subscription.canceledAt ? subscription.canceledAt * 1000 : undefined,
    });

    // Update tenant tier if changed
    if (newTier !== oldTier) {
      await this.tenantStore.updateTenant(existingSub.tenantId, { tier: newTier });

      this.emit(
        newTier > oldTier
          ? ENTERPRISE_EVENTS.SUBSCRIPTION_UPGRADED
          : ENTERPRISE_EVENTS.SUBSCRIPTION_DOWNGRADED,
        {
          tenantId: existingSub.tenantId,
          subscriptionId: subscription.id,
          oldTier,
          newTier,
        }
      );
    }

    // Audit log
    await this.auditLogStore.createAuditLog({
      tenantId: existingSub.tenantId,
      eventType: 'subscription.updated',
      action: 'update',
      resourceType: 'subscription',
      resourceId: subscription.id,
      details: {
        oldTier,
        newTier,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      timestamp: Date.now(),
    });

    return {
      success: true,
      eventType: 'customer.subscription.updated',
      message: `Subscription updated for tenant ${existingSub.tenantId}`,
    };
  }

  private async handleSubscriptionDeleted(
    subscription: StripeSubscription
  ): Promise<WebhookHandlerResult> {
    const existingSub = await this.subscriptionStore.getSubscriptionByStripeId(
      subscription.id
    );

    if (!existingSub) {
      return {
        success: false,
        eventType: 'customer.subscription.deleted',
        error: 'Subscription not found',
      };
    }

    await this.subscriptionStore.updateSubscription(existingSub.id, {
      status: 'canceled',
      canceledAt: Date.now(),
    });

    // Downgrade tenant to free tier
    await this.tenantStore.updateTenant(existingSub.tenantId, { tier: 'free' });

    // Audit log
    await this.auditLogStore.createAuditLog({
      tenantId: existingSub.tenantId,
      eventType: 'subscription.canceled',
      action: 'delete',
      resourceType: 'subscription',
      resourceId: subscription.id,
      details: {
        previousTier: existingSub.tier,
      },
      timestamp: Date.now(),
    });

    this.emit(ENTERPRISE_EVENTS.SUBSCRIPTION_CANCELED, {
      tenantId: existingSub.tenantId,
      subscriptionId: subscription.id,
    });

    return {
      success: true,
      eventType: 'customer.subscription.deleted',
      message: `Subscription canceled for tenant ${existingSub.tenantId}`,
    };
  }

  private async handleTrialWillEnd(
    subscription: StripeSubscription
  ): Promise<WebhookHandlerResult> {
    const tenantId = subscription.metadata?.tenant_id;
    if (!tenantId) {
      return {
        success: true,
        eventType: 'customer.subscription.trial_will_end',
        message: 'No tenant_id in metadata, skipping',
      };
    }

    this.emit(ENTERPRISE_EVENTS.TRIAL_ENDING_SOON, {
      tenantId,
      subscriptionId: subscription.id,
      trialEnd: subscription.trialEnd,
    });

    return {
      success: true,
      eventType: 'customer.subscription.trial_will_end',
      message: `Trial ending soon for tenant ${tenantId}`,
    };
  }

  // =============================================================================
  // Invoice Event Handlers
  // =============================================================================

  private async handleInvoicePaid(invoice: StripeInvoice): Promise<WebhookHandlerResult> {
    if (!invoice.subscriptionId) {
      return {
        success: true,
        eventType: 'invoice.paid',
        message: 'No subscription associated, skipping',
      };
    }

    const subscription = await this.subscriptionStore.getSubscriptionByStripeId(
      invoice.subscriptionId
    );

    if (!subscription) {
      return {
        success: false,
        eventType: 'invoice.paid',
        error: 'Subscription not found',
      };
    }

    // Update subscription status to active if it was past_due
    if (subscription.status === 'past_due') {
      await this.subscriptionStore.updateSubscription(subscription.id, {
        status: 'active',
      });
    }

    // Audit log
    await this.auditLogStore.createAuditLog({
      tenantId: subscription.tenantId,
      eventType: 'invoice.paid',
      action: 'payment',
      resourceType: 'invoice',
      resourceId: invoice.id,
      details: {
        amount: invoice.amountPaid,
        currency: invoice.currency,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
      },
      timestamp: Date.now(),
    });

    this.emit(ENTERPRISE_EVENTS.INVOICE_PAID, {
      tenantId: subscription.tenantId,
      invoiceId: invoice.id,
      amount: invoice.amountPaid,
    });

    return {
      success: true,
      eventType: 'invoice.paid',
      message: `Invoice paid for tenant ${subscription.tenantId}`,
    };
  }

  private async handleInvoicePaymentFailed(
    invoice: StripeInvoice
  ): Promise<WebhookHandlerResult> {
    if (!invoice.subscriptionId) {
      return {
        success: true,
        eventType: 'invoice.payment_failed',
        message: 'No subscription associated, skipping',
      };
    }

    const subscription = await this.subscriptionStore.getSubscriptionByStripeId(
      invoice.subscriptionId
    );

    if (!subscription) {
      return {
        success: false,
        eventType: 'invoice.payment_failed',
        error: 'Subscription not found',
      };
    }

    // Update subscription status to past_due
    await this.subscriptionStore.updateSubscription(subscription.id, {
      status: 'past_due',
    });

    // Audit log
    await this.auditLogStore.createAuditLog({
      tenantId: subscription.tenantId,
      eventType: 'invoice.payment_failed',
      action: 'payment_failed',
      resourceType: 'invoice',
      resourceId: invoice.id,
      details: {
        amountDue: invoice.amountDue,
        currency: invoice.currency,
      },
      timestamp: Date.now(),
    });

    this.emit(ENTERPRISE_EVENTS.PAYMENT_FAILED, {
      tenantId: subscription.tenantId,
      invoiceId: invoice.id,
      amount: invoice.amountDue,
    });

    return {
      success: true,
      eventType: 'invoice.payment_failed',
      message: `Payment failed for tenant ${subscription.tenantId}`,
    };
  }

  private async handlePaymentActionRequired(
    invoice: StripeInvoice
  ): Promise<WebhookHandlerResult> {
    if (!invoice.subscriptionId) {
      return {
        success: true,
        eventType: 'invoice.payment_action_required',
        message: 'No subscription associated, skipping',
      };
    }

    const subscription = await this.subscriptionStore.getSubscriptionByStripeId(
      invoice.subscriptionId
    );

    if (subscription) {
      this.emit(ENTERPRISE_EVENTS.PAYMENT_ACTION_REQUIRED, {
        tenantId: subscription.tenantId,
        invoiceId: invoice.id,
        hostedInvoiceUrl: invoice.hostedInvoiceUrl,
      });
    }

    return {
      success: true,
      eventType: 'invoice.payment_action_required',
      message: 'Payment action required notification sent',
    };
  }

  private async handleInvoiceUpcoming(
    invoice: StripeInvoice
  ): Promise<WebhookHandlerResult> {
    if (!invoice.subscriptionId) {
      return {
        success: true,
        eventType: 'invoice.upcoming',
        message: 'No subscription associated, skipping',
      };
    }

    const subscription = await this.subscriptionStore.getSubscriptionByStripeId(
      invoice.subscriptionId
    );

    if (subscription) {
      this.emit(ENTERPRISE_EVENTS.INVOICE_UPCOMING, {
        tenantId: subscription.tenantId,
        amount: invoice.amountDue,
        dueDate: invoice.periodEnd,
      });
    }

    return {
      success: true,
      eventType: 'invoice.upcoming',
      message: 'Upcoming invoice notification sent',
    };
  }

  // =============================================================================
  // Checkout Event Handlers
  // =============================================================================

  private async handleCheckoutCompleted(data: {
    id: string;
    customer: string;
    subscription: string;
    metadata: Record<string, string>;
  }): Promise<WebhookHandlerResult> {
    const tenantId = data.metadata?.tenant_id;
    if (!tenantId) {
      return {
        success: false,
        eventType: 'checkout.session.completed',
        error: 'Missing tenant_id in session metadata',
      };
    }

    // Update tenant with Stripe customer and subscription IDs
    await this.tenantStore.updateTenant(tenantId, {
      stripeCustomerId: data.customer,
      stripeSubscriptionId: data.subscription,
    });

    this.emit(ENTERPRISE_EVENTS.CHECKOUT_COMPLETED, {
      tenantId,
      customerId: data.customer,
      subscriptionId: data.subscription,
    });

    return {
      success: true,
      eventType: 'checkout.session.completed',
      message: `Checkout completed for tenant ${tenantId}`,
    };
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  private emit(event: string, data: Record<string, unknown>): void {
    this.eventEmitter?.emit(event, data);
  }
}

/**
 * Create Stripe webhook handler
 */
export function createStripeWebhookHandler(
  config: WebhookHandlerConfig
): StripeWebhookHandler {
  return new StripeWebhookHandler(config);
}
