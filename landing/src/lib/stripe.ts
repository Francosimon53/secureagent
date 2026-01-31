import Stripe from 'stripe';

// Lazy initialization of Stripe client to avoid build-time errors
let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    stripeInstance = new Stripe(secretKey, {
      apiVersion: '2026-01-28.clover',
      typescript: true,
    });
  }
  return stripeInstance;
}

// For backwards compatibility - will throw at runtime if key not set
export const stripe = {
  get checkout() {
    return getStripe().checkout;
  },
  get billingPortal() {
    return getStripe().billingPortal;
  },
  get webhooks() {
    return getStripe().webhooks;
  },
};

// Price IDs - these should be created in Stripe Dashboard and added to env vars
// Format: price_XXXXXX from Stripe Dashboard
export const STRIPE_PRICES = {
  // Individual Plans
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || '',
    yearly: process.env.STRIPE_PRICE_STARTER_YEARLY || '',
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY || '',
  },
  power: {
    monthly: process.env.STRIPE_PRICE_POWER_MONTHLY || '',
    yearly: process.env.STRIPE_PRICE_POWER_YEARLY || '',
  },
  unlimited: {
    monthly: process.env.STRIPE_PRICE_UNLIMITED_MONTHLY || '',
    yearly: process.env.STRIPE_PRICE_UNLIMITED_YEARLY || '',
  },
  // Team Plans (per-seat)
  team: {
    monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY || '',
    yearly: process.env.STRIPE_PRICE_TEAM_YEARLY || '',
  },
  business: {
    monthly: process.env.STRIPE_PRICE_BUSINESS_MONTHLY || '',
    yearly: process.env.STRIPE_PRICE_BUSINESS_YEARLY || '',
  },
} as const;

// Plan metadata for display and limits
export const PLAN_LIMITS = {
  free: {
    messages: 30,
    voice: 0,
    browser: 0,
    channels: 1,
  },
  starter: {
    messages: 300,
    voice: 25,
    browser: 0,
    channels: 2,
  },
  pro: {
    messages: 1000,
    voice: 100,
    browser: 25,
    channels: 7,
  },
  power: {
    messages: 3000,
    voice: 250,
    browser: 75,
    channels: 7,
  },
  unlimited: {
    messages: 10000,
    voice: 500,
    browser: 150,
    channels: 7,
  },
  team: {
    messagesPerUser: 500,
    voicePerUser: 50,
    browserPerUser: 15,
    channels: 7,
  },
  business: {
    messagesPerUser: 3000,
    voicePool: 'shared',
    browserPool: 'shared',
    channels: 7,
  },
} as const;

export type PlanId = keyof typeof STRIPE_PRICES;
export type BillingInterval = 'monthly' | 'yearly';

// Helper to get price ID
export function getPriceId(planId: PlanId, interval: BillingInterval): string {
  const plan = STRIPE_PRICES[planId];
  if (!plan) {
    throw new Error(`Unknown plan: ${planId}`);
  }
  const priceId = plan[interval];
  if (!priceId) {
    throw new Error(`No ${interval} price configured for plan: ${planId}`);
  }
  return priceId;
}

// Webhook event types we handle
export const WEBHOOK_EVENTS = {
  CHECKOUT_COMPLETED: 'checkout.session.completed',
  SUBSCRIPTION_CREATED: 'customer.subscription.created',
  SUBSCRIPTION_UPDATED: 'customer.subscription.updated',
  SUBSCRIPTION_DELETED: 'customer.subscription.deleted',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_PAYMENT_FAILED: 'invoice.payment_failed',
} as const;
