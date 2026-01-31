import { NextRequest, NextResponse } from 'next/server';
import { stripe, getPriceId, PlanId, BillingInterval } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planId, interval = 'monthly', quantity = 1, email, successUrl, cancelUrl } = body as {
      planId: PlanId;
      interval?: BillingInterval;
      quantity?: number;
      email?: string;
      successUrl?: string;
      cancelUrl?: string;
    };

    // Validate plan
    if (!planId) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      );
    }

    // Get the price ID for this plan
    let priceId: string;
    try {
      priceId = getPriceId(planId, interval);
    } catch {
      return NextResponse.json(
        { error: `Invalid plan or interval: ${planId}/${interval}` },
        { status: 400 }
      );
    }

    if (!priceId) {
      return NextResponse.json(
        { error: `Price not configured for plan: ${planId}. Please set up Stripe prices first.` },
        { status: 500 }
      );
    }

    // Determine URLs
    const origin = request.headers.get('origin') || 'http://localhost:3000';
    const finalSuccessUrl = successUrl || `${origin}/dashboard/settings?session_id={CHECKOUT_SESSION_ID}&success=true`;
    const finalCancelUrl = cancelUrl || `${origin}/pricing?canceled=true`;

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: quantity,
        },
      ],
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
      metadata: {
        planId,
        interval,
      },
      subscription_data: {
        metadata: {
          planId,
          interval,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      ...(email ? { customer_email: email } : {}),
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Stripe checkout error:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

// GET - Return public key for client-side
export async function GET() {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return NextResponse.json(
      { error: 'Stripe publishable key not configured' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    publishableKey,
  });
}
