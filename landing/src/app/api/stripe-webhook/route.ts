import { NextRequest, NextResponse } from 'next/server';
import { stripe, WEBHOOK_EVENTS } from '@/lib/stripe';
import Stripe from 'stripe';

// Disable body parsing - we need raw body for signature verification
export const runtime = 'nodejs';

async function getRawBody(request: NextRequest): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();

  if (!reader) {
    throw new Error('No request body');
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  return Buffer.concat(chunks);
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Stripe webhook secret not configured');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  try {
    // Get raw body for signature verification
    const rawBody = await getRawBody(request);
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Handle the event
    console.log(`Received Stripe event: ${event.type}`);

    switch (event.type) {
      case WEBHOOK_EVENTS.CHECKOUT_COMPLETED:
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case WEBHOOK_EVENTS.SUBSCRIPTION_CREATED:
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case WEBHOOK_EVENTS.SUBSCRIPTION_UPDATED:
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case WEBHOOK_EVENTS.SUBSCRIPTION_DELETED:
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case WEBHOOK_EVENTS.INVOICE_PAID:
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case WEBHOOK_EVENTS.INVOICE_PAYMENT_FAILED:
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

// Event Handlers

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log('Checkout completed:', {
    sessionId: session.id,
    customerId: session.customer,
    subscriptionId: session.subscription,
    email: session.customer_email,
    metadata: session.metadata,
  });

  // TODO: Create or update user in your database
  // - Link Stripe customer ID to user
  // - Set subscription status to active
  // - Grant access to features based on plan

  // Example: Store in database
  // await db.users.upsert({
  //   email: session.customer_email,
  //   stripeCustomerId: session.customer,
  //   subscriptionId: session.subscription,
  //   planId: session.metadata?.planId,
  //   status: 'active',
  // });
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const currentPeriodEnd = 'current_period_end' in subscription
    ? (subscription as unknown as { current_period_end: number }).current_period_end
    : null;

  console.log('Subscription created:', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
    planId: subscription.metadata?.planId,
    currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
  });

  // TODO: Update user subscription status in database
  // await db.subscriptions.create({
  //   stripeSubscriptionId: subscription.id,
  //   stripeCustomerId: subscription.customer,
  //   status: subscription.status,
  //   planId: subscription.metadata?.planId,
  //   currentPeriodStart: subscription.current_period_start,
  //   currentPeriodEnd: subscription.current_period_end,
  // });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const currentPeriodEnd = 'current_period_end' in subscription
    ? (subscription as unknown as { current_period_end: number }).current_period_end
    : null;
  const cancelAtPeriodEnd = 'cancel_at_period_end' in subscription
    ? (subscription as unknown as { cancel_at_period_end: boolean }).cancel_at_period_end
    : false;

  console.log('Subscription updated:', {
    subscriptionId: subscription.id,
    status: subscription.status,
    cancelAtPeriodEnd,
    currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
  });

  // TODO: Update subscription in database
  // Handle plan changes, cancellations, renewals
  // await db.subscriptions.update({
  //   where: { stripeSubscriptionId: subscription.id },
  //   data: {
  //     status: subscription.status,
  //     cancelAtPeriodEnd: subscription.cancel_at_period_end,
  //     currentPeriodEnd: subscription.current_period_end,
  //   },
  // });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('Subscription deleted:', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
  });

  // TODO: Revoke access / downgrade to free tier
  // await db.subscriptions.update({
  //   where: { stripeSubscriptionId: subscription.id },
  //   data: {
  //     status: 'canceled',
  //     planId: 'free',
  //   },
  // });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  console.log('Invoice paid:', {
    invoiceId: invoice.id,
    customerId: invoice.customer,
    amountPaid: invoice.amount_paid / 100,
    currency: invoice.currency,
  });

  // TODO: Record payment, send receipt email
  // await db.payments.create({
  //   invoiceId: invoice.id,
  //   customerId: invoice.customer,
  //   amount: invoice.amount_paid,
  //   currency: invoice.currency,
  //   paidAt: new Date(),
  // });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log('Invoice payment failed:', {
    invoiceId: invoice.id,
    customerId: invoice.customer,
    attemptCount: invoice.attempt_count,
  });

  // TODO: Notify user, possibly suspend access after multiple failures
  // await sendEmail({
  //   to: invoice.customer_email,
  //   subject: 'Payment Failed',
  //   template: 'payment-failed',
  // });
}
