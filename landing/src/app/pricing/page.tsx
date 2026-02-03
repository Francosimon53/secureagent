'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type BillingPeriod = 'monthly' | 'yearly';
type PlanId = 'free' | 'starter' | 'pro' | 'power' | 'unlimited' | 'team' | 'business' | 'enterprise';

interface PricingTier {
  name: string;
  planId: PlanId;
  description: string;
  monthlyPrice: number | string;
  yearlyPrice: number | string;
  features: string[];
  limits: {
    messages: string;
    voice: string;
    browser: string;
    channels: string;
  };
  cta: string;
  href: string;
  highlighted: boolean;
  badge?: string;
  isPerSeat?: boolean;
}

const individualPlans: PricingTier[] = [
  {
    name: 'Free',
    planId: 'free',
    description: 'Try SecureAgent risk-free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      'Basic AI models',
      'Web chat access',
      'Community support',
    ],
    limits: {
      messages: '5/day',
      voice: 'None',
      browser: 'None',
      channels: '1 channel',
    },
    cta: 'Get Started',
    href: '/dashboard/chat',
    highlighted: false,
  },
  {
    name: 'Starter',
    planId: 'starter',
    description: 'For casual users',
    monthlyPrice: 19,
    yearlyPrice: 190,
    features: [
      'All AI models',
      'Everything in Free',
      'Voice responses',
      'Email support',
    ],
    limits: {
      messages: '500/day',
      voice: '50 responses',
      browser: 'None',
      channels: '2 channels',
    },
    cta: 'Subscribe',
    href: '/dashboard/admin',
    highlighted: false,
  },
  {
    name: 'Pro',
    planId: 'pro',
    description: 'For power users',
    monthlyPrice: 49,
    yearlyPrice: 490,
    features: [
      'Everything in Starter',
      'Priority support',
      'All 7 channels',
      'Webhook integrations',
    ],
    limits: {
      messages: '2,000/day',
      voice: '200 responses',
      browser: '25 tasks',
      channels: 'All channels',
    },
    cta: 'Subscribe',
    href: '/dashboard/admin',
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    name: 'Power',
    planId: 'power',
    description: 'For heavy users',
    monthlyPrice: 99,
    yearlyPrice: 990,
    features: [
      'Everything in Pro',
      'API access',
      'Priority processing',
      'Advanced analytics',
    ],
    limits: {
      messages: '5,000/day',
      voice: '500 responses',
      browser: '100 tasks',
      channels: 'All channels',
    },
    cta: 'Subscribe',
    href: '/dashboard/admin',
    highlighted: false,
  },
  {
    name: 'Unlimited',
    planId: 'unlimited',
    description: 'For teams & agencies',
    monthlyPrice: 199,
    yearlyPrice: 1990,
    features: [
      'Everything in Power',
      'Unlimited messages',
      'Dedicated support',
      'Custom integrations',
      'Phone support',
    ],
    limits: {
      messages: 'Unlimited',
      voice: 'Unlimited',
      browser: 'Unlimited',
      channels: 'All channels',
    },
    cta: 'Subscribe',
    href: '/dashboard/admin',
    highlighted: false,
  },
];

const teamPlans: PricingTier[] = [
  {
    name: 'Team',
    planId: 'team',
    description: 'For small businesses',
    monthlyPrice: 39,
    yearlyPrice: 390,
    features: [
      '3+ users required',
      'Shared channel management',
      'Team analytics dashboard',
      'Centralized billing',
      'Admin controls',
    ],
    limits: {
      messages: '500/user/month',
      voice: '50/user',
      browser: '15/user',
      channels: 'All channels',
    },
    cta: 'Subscribe',
    href: '/dashboard/admin',
    highlighted: false,
    isPerSeat: true,
  },
  {
    name: 'Business',
    planId: 'business',
    description: 'For growing companies',
    monthlyPrice: 79,
    yearlyPrice: 790,
    features: [
      '5+ users required',
      'Everything in Team',
      'SSO (Google, Microsoft)',
      'Audit logs',
      'Custom integrations',
      '99.9% SLA',
    ],
    limits: {
      messages: '3,000/user/month',
      voice: 'Shared pool',
      browser: 'Shared pool',
      channels: 'All channels',
    },
    cta: 'Contact Sales',
    href: 'mailto:support@secureagent.ai?subject=Business%20Plan%20Inquiry',
    highlighted: true,
    badge: 'Best Value',
    isPerSeat: true,
  },
  {
    name: 'Enterprise',
    planId: 'enterprise',
    description: 'For large organizations',
    monthlyPrice: 'Custom',
    yearlyPrice: 'Custom',
    features: [
      'Unlimited users',
      'Everything in Business',
      'White-label option',
      'Custom domain',
      'SAML SSO',
      'Dedicated support',
      'On-premise available',
    ],
    limits: {
      messages: 'Unlimited',
      voice: 'Unlimited',
      browser: 'Unlimited',
      channels: 'All + custom',
    },
    cta: 'Contact Sales',
    href: 'mailto:support@secureagent.ai?subject=Enterprise%20Inquiry',
    highlighted: false,
  },
];

const addons = [
  { name: '+500 messages', price: '$5', description: 'One-time message pack' },
  { name: '+100 voice responses', price: '$10', description: 'ElevenLabs TTS credits' },
  { name: '+50 browser tasks', price: '$15', description: 'Puppeteer automation' },
  { name: 'Additional channel', price: '$5/mo', description: 'Add more channels' },
];

const faqs = [
  {
    q: 'What counts as a message?',
    a: 'A message is one user input + one AI response. System prompts and context don\'t count against your limit.',
  },
  {
    q: 'Can I switch plans anytime?',
    a: 'Yes! Upgrade anytime and we\'ll prorate your billing. Downgrade at the end of your billing cycle.',
  },
  {
    q: 'What happens if I exceed my limits?',
    a: 'You\'ll get a warning at 80% usage. At 100%, you can purchase add-ons or upgrade your plan.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes! All paid plans include a 14-day free trial. No credit card required to start.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit cards, PayPal, and wire transfers for Enterprise plans.',
  },
  {
    q: 'Can I get a refund?',
    a: 'Yes, we offer a 30-day money-back guarantee for all paid plans.',
  },
];

const comparison = [
  { feature: 'Web Chat', free: true, starter: true, pro: true, power: true, unlimited: true },
  { feature: 'Multi-Agent Routing', free: true, starter: true, pro: true, power: true, unlimited: true },
  { feature: 'Canvas Workspace', free: true, starter: true, pro: true, power: true, unlimited: true },
  { feature: 'Voice Wake ("Hey SecureAgent")', free: true, starter: true, pro: true, power: true, unlimited: true },
  { feature: 'ElevenLabs Voice Responses', free: false, starter: true, pro: true, power: true, unlimited: true },
  { feature: 'Browser Automation', free: false, starter: false, pro: true, power: true, unlimited: true },
  { feature: 'Telegram Bot', free: false, starter: true, pro: true, power: true, unlimited: true },
  { feature: 'Discord Bot', free: false, starter: true, pro: true, power: true, unlimited: true },
  { feature: 'Slack Bot', free: false, starter: false, pro: true, power: true, unlimited: true },
  { feature: 'WhatsApp Bot', free: false, starter: false, pro: true, power: true, unlimited: true },
  { feature: 'Teams Bot', free: false, starter: false, pro: true, power: true, unlimited: true },
  { feature: 'Google Chat Bot', free: false, starter: false, pro: true, power: true, unlimited: true },
  { feature: 'API Access', free: false, starter: false, pro: true, power: true, unlimited: true },
  { feature: 'Webhooks', free: false, starter: false, pro: true, power: true, unlimited: true },
  { feature: 'Priority Processing', free: false, starter: false, pro: false, power: true, unlimited: true },
  { feature: 'Analytics Dashboard', free: false, starter: false, pro: true, power: true, unlimited: true },
];

// Inner component that uses useSearchParams
function PricingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [showComparison, setShowComparison] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for canceled checkout
  const canceled = searchParams.get('canceled');

  const formatPrice = (price: number | string) => {
    if (typeof price === 'string') return price;
    if (price === 0) return '$0';
    return `$${price}`;
  };

  const getPrice = (tier: PricingTier) => {
    const price = billingPeriod === 'monthly' ? tier.monthlyPrice : tier.yearlyPrice;
    return formatPrice(price);
  };

  const handleCheckout = async (tier: PricingTier, quantity: number = 1) => {
    // Free plan - just redirect to dashboard
    if (tier.planId === 'free') {
      router.push('/dashboard/chat');
      return;
    }

    // Enterprise - redirect to contact
    if (tier.planId === 'enterprise') {
      window.location.href = tier.href;
      return;
    }

    setLoadingPlan(tier.planId);
    setError(null);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId: tier.planId,
          interval: billingPeriod,
          quantity: quantity,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
      setLoadingPlan(null);
    }
  };

  // Render button for a tier
  const renderButton = (tier: PricingTier, variant: 'individual' | 'team') => {
    const isLoading = loadingPlan === tier.planId;
    const isPaid = tier.planId !== 'free' && tier.planId !== 'enterprise';
    const isMailto = tier.href.startsWith('mailto:');

    const baseClasses = `block w-full py-3 rounded-xl font-semibold text-center transition-all disabled:opacity-50 disabled:cursor-not-allowed`;
    const highlightedClasses = variant === 'individual'
      ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white'
      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white';
    const normalClasses = 'bg-white/5 hover:bg-white/10 text-white border border-white/10';

    if (isMailto) {
      return (
        <a
          href={tier.href}
          className={`${baseClasses} ${tier.highlighted ? highlightedClasses : normalClasses}`}
        >
          {tier.cta}
        </a>
      );
    }

    if (isPaid) {
      return (
        <button
          onClick={() => handleCheckout(tier, tier.isPerSeat ? (tier.planId === 'team' ? 3 : 5) : 1)}
          disabled={isLoading}
          className={`${baseClasses} ${tier.highlighted ? highlightedClasses : normalClasses}`}
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing...
            </span>
          ) : (
            tier.cta
          )}
        </button>
      );
    }

    return (
      <Link
        href={tier.href}
        className={`${baseClasses} ${tier.highlighted ? highlightedClasses : normalClasses}`}
      >
        {tier.cta}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-[120px]" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-lg font-bold">
                S
              </div>
              <span className="text-xl font-bold">SecureAgent</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/" className="text-gray-400 hover:text-white text-sm">Home</Link>
              <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm">Dashboard</Link>
              <Link
                href="/dashboard/chat"
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg font-medium text-sm"
              >
                Try Free
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-4xl sm:text-5xl font-bold mb-6">
              Simple, Transparent Pricing
            </h1>
            <p className="text-xl text-gray-400 mb-8">
              Start free, scale as you grow. No hidden fees, cancel anytime.
            </p>

            {/* Error/Status Messages */}
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}
            {canceled && (
              <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-400 text-sm">
                Checkout was canceled. Feel free to try again when you&apos;re ready.
              </div>
            )}

            {/* Billing Toggle */}
            <div className="inline-flex items-center gap-4 p-1 bg-white/5 rounded-xl">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-6 py-2 rounded-lg font-medium transition-all ${
                  billingPeriod === 'monthly'
                    ? 'bg-white text-gray-900'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod('yearly')}
                className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  billingPeriod === 'yearly'
                    ? 'bg-white text-gray-900'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Yearly
                <span className="text-xs px-2 py-0.5 bg-green-500 text-white rounded-full">
                  Save 17%
                </span>
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Individual Plans */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Individual Plans</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {individualPlans.map((tier, index) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`relative p-6 rounded-2xl transition-all ${
                  tier.highlighted
                    ? 'bg-gradient-to-b from-blue-600/20 to-transparent border-2 border-blue-500 scale-105 z-10'
                    : 'bg-white/5 border border-white/10 hover:border-white/20'
                }`}
              >
                {tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full text-xs font-semibold whitespace-nowrap">
                    {tier.badge}
                  </div>
                )}

                <h3 className="text-xl font-semibold text-white">{tier.name}</h3>
                <p className="text-gray-500 text-sm mt-1 mb-4">{tier.description}</p>

                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">{getPrice(tier)}</span>
                  {typeof tier.monthlyPrice === 'number' && tier.monthlyPrice > 0 && (
                    <span className="text-gray-400">/{billingPeriod === 'monthly' ? 'mo' : 'yr'}</span>
                  )}
                </div>

                {/* Limits */}
                <div className="mb-6 p-3 bg-white/5 rounded-lg space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Messages</span>
                    <span className="text-white font-medium">{tier.limits.messages}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Voice</span>
                    <span className="text-white font-medium">{tier.limits.voice}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Browser</span>
                    <span className="text-white font-medium">{tier.limits.browser}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Channels</span>
                    <span className="text-white font-medium">{tier.limits.channels}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6">
                  {tier.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center gap-2 text-gray-300 text-sm">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                {renderButton(tier, 'individual')}
              </motion.div>
            ))}
          </div>
          <p className="text-center text-gray-500 text-sm mt-4">
            * Fair use policy applies. Unlimited plans are subject to reasonable usage limits.
          </p>
        </div>
      </section>

      {/* Team/Business Plans */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Team & Business Plans</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {teamPlans.map((tier, index) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`relative p-6 rounded-2xl transition-all ${
                  tier.highlighted
                    ? 'bg-gradient-to-b from-purple-600/20 to-transparent border-2 border-purple-500'
                    : 'bg-white/5 border border-white/10 hover:border-white/20'
                }`}
              >
                {tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full text-xs font-semibold whitespace-nowrap">
                    {tier.badge}
                  </div>
                )}

                <h3 className="text-xl font-semibold text-white">{tier.name}</h3>
                <p className="text-gray-500 text-sm mt-1 mb-4">{tier.description}</p>

                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">{getPrice(tier)}</span>
                  {typeof tier.monthlyPrice === 'number' && (
                    <span className="text-gray-400">/user/{billingPeriod === 'monthly' ? 'mo' : 'yr'}</span>
                  )}
                </div>

                <ul className="space-y-3 mb-6">
                  {tier.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center gap-2 text-gray-300 text-sm">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                {renderButton(tier, 'team')}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Add-ons */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Usage Add-ons</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {addons.map((addon) => (
              <div
                key={addon.name}
                className="p-4 bg-white/5 border border-white/10 rounded-xl hover:border-white/20 transition-all"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-medium text-white">{addon.name}</h3>
                  <span className="text-green-400 font-semibold">{addon.price}</span>
                </div>
                <p className="text-gray-500 text-sm">{addon.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-4">Feature Comparison</h2>
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              {showComparison ? 'Hide comparison' : 'Show full comparison'}
            </button>
          </div>

          {showComparison && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
            >
              <div className="grid grid-cols-6 gap-4 p-4 bg-white/5 border-b border-white/10 text-sm font-medium">
                <div className="text-gray-400">Feature</div>
                <div className="text-center text-gray-400">Free</div>
                <div className="text-center text-gray-400">Starter</div>
                <div className="text-center text-white">Pro</div>
                <div className="text-center text-gray-400">Power</div>
                <div className="text-center text-gray-400">Unlimited</div>
              </div>
              {comparison.map((row, index) => (
                <div
                  key={row.feature}
                  className={`grid grid-cols-6 gap-4 p-4 text-sm ${
                    index !== comparison.length - 1 ? 'border-b border-white/5' : ''
                  }`}
                >
                  <div className="text-gray-300">{row.feature}</div>
                  {[row.free, row.starter, row.pro, row.power, row.unlimited].map((value, i) => (
                    <div key={i} className="text-center">
                      {value ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20 text-green-400">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-500/20 text-gray-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </motion.div>
          )}
        </div>
      </section>

      {/* FAQs */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-6 bg-white/5 border border-white/10 rounded-xl"
              >
                <h3 className="font-semibold text-white mb-2">{faq.q}</h3>
                <p className="text-gray-400 text-sm">{faq.a}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="p-12 rounded-3xl bg-gradient-to-br from-blue-600/20 via-cyan-600/10 to-transparent border border-white/10">
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-lg text-gray-400 mb-8">
              Start with our free plan. No credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/dashboard/chat"
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-xl font-semibold text-lg transition-all hover:scale-105"
              >
                Start Free
              </Link>
              <a
                href="mailto:support@secureagent.ai?subject=Sales%20Inquiry"
                className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-lg transition-all"
              >
                Talk to Sales
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-gray-500 text-sm">
            &copy; {new Date().getFullYear()} SecureAgent. All rights reserved.
          </p>
          <div className="flex gap-6 text-gray-400 text-sm">
            <Link href="/" className="hover:text-white">Home</Link>
            <Link href="/dashboard" className="hover:text-white">Dashboard</Link>
            <Link href="/docs" className="hover:text-white">Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Wrap with Suspense for useSearchParams
export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    }>
      <PricingPageContent />
    </Suspense>
  );
}
