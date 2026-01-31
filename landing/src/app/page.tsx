'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState } from 'react';

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 }
};

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

// Channel data
const channels = [
  { name: 'Telegram', icon: '✈️', status: 'active', users: '2.1K', color: 'from-blue-400 to-blue-600' },
  { name: 'Discord', icon: '🎮', status: 'active', users: '1.8K', color: 'from-indigo-400 to-indigo-600' },
  { name: 'Slack', icon: '💼', status: 'active', users: '956', color: 'from-green-400 to-green-600' },
  { name: 'Web Chat', icon: '💬', status: 'active', users: '3.2K', color: 'from-cyan-400 to-cyan-600' },
];

// Features data
const features = [
  {
    icon: '🤖',
    title: 'Multi-Model Support',
    description: 'Choose from OpenAI, Anthropic, Google, Meta Llama, DeepSeek, and 100+ models via OpenRouter. Switch models per agent or conversation.',
    gradient: 'from-violet-500 to-purple-500',
  },
  {
    icon: '🌐',
    title: 'Browser Automation',
    description: 'Navigate websites, fill forms, extract data, and take screenshots. Your AI can browse the web just like you do.',
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    icon: '🔐',
    title: 'Enterprise Security',
    description: 'OWASP Top 10 compliance, Zero Trust architecture, input sanitization, and sandboxed execution.',
    gradient: 'from-green-500 to-emerald-500',
  },
  {
    icon: '🧠',
    title: 'Memory & Context',
    description: 'Persistent conversations across sessions. Your AI remembers context and learns from interactions.',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    icon: '💰',
    title: 'Cost Control',
    description: 'Real-time cost estimation, budget limits, usage tracking, and intelligent model routing to optimize spend.',
    gradient: 'from-amber-500 to-orange-500',
  },
  {
    icon: '⚡',
    title: 'Real-time Tools',
    description: 'HTTP requests, JSON processing, data transformation, and 20+ built-in tools ready to use.',
    gradient: 'from-orange-500 to-red-500',
  },
];

// Comparison data - AI Agent Platforms
const comparison = [
  { feature: 'Multi-model support (GPT, Claude, Gemini, Llama)', secureAgent: true, openclaw: false, autogpt: true, langchain: true },
  { feature: 'Multi-channel (Telegram, Discord, Slack, Teams)', secureAgent: true, openclaw: true, autogpt: false, langchain: false },
  { feature: 'Enterprise security (OWASP, Zero Trust)', secureAgent: true, openclaw: false, autogpt: false, langchain: false },
  { feature: 'Browser automation', secureAgent: true, openclaw: true, autogpt: true, langchain: true },
  { feature: 'Voice activation', secureAgent: true, openclaw: false, autogpt: false, langchain: false },
  { feature: 'Self-hosted option', secureAgent: true, openclaw: true, autogpt: true, langchain: true },
  { feature: 'No-code setup', secureAgent: true, openclaw: true, autogpt: false, langchain: false },
  { feature: 'Multi-agent routing', secureAgent: true, openclaw: false, autogpt: true, langchain: true },
  { feature: 'Built-in billing/subscriptions', secureAgent: true, openclaw: false, autogpt: false, langchain: false },
  { feature: 'Cost estimation & budgets', secureAgent: true, openclaw: false, autogpt: false, langchain: false },
  { feature: 'Production ready', secureAgent: true, openclaw: true, autogpt: false, langchain: false },
];

// Pricing data - aligned with dedicated pricing page
const pricing = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    description: 'Try SecureAgent risk-free',
    features: [
      '30 messages/month',
      'Web chat access',
      'Multi-agent routing',
      'Canvas workspace',
      'Community support',
    ],
    cta: 'Get Started',
    href: '/dashboard/chat',
    highlighted: false,
  },
  {
    name: 'Starter',
    price: '$19',
    period: '/month',
    description: 'For casual users',
    features: [
      '300 messages/month',
      '25 voice responses',
      '2 channels',
      'Email support',
    ],
    cta: 'Start Free Trial',
    href: '/dashboard/admin',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    description: 'For power users',
    features: [
      '1,000 messages/month',
      '100 voice responses',
      '25 browser tasks',
      'All 7 channels',
      'API access',
    ],
    cta: 'Start Free Trial',
    href: '/dashboard/admin',
    highlighted: true,
  },
  {
    name: 'Unlimited',
    price: '$199',
    period: '/month',
    description: 'For teams & agencies',
    features: [
      '10,000 messages/month',
      '500 voice responses',
      '150 browser tasks',
      'Dedicated support',
      'Custom integrations',
    ],
    cta: 'Start Free Trial',
    href: '/dashboard/admin',
    highlighted: false,
  },
];

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* Gradient background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-cyan-500/10 rounded-full blur-[120px]" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-lg font-bold">
                S
              </div>
              <span className="text-xl font-bold">SecureAgent</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-400 hover:text-white transition-colors text-sm">Features</a>
              <a href="#channels" className="text-gray-400 hover:text-white transition-colors text-sm">Channels</a>
              <Link href="/pricing" className="text-gray-400 hover:text-white transition-colors text-sm">Pricing</Link>
              <Link href="/docs" className="text-gray-400 hover:text-white transition-colors text-sm">API Docs</Link>
              <a
                href="https://github.com/Francosimon53/secureagent"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors text-sm"
              >
                GitHub
              </a>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="hidden sm:inline-flex px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/chat"
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-lg font-medium text-sm transition-all hover:shadow-lg hover:shadow-blue-500/25"
              >
                Try Now
              </Link>

              {/* Mobile menu button */}
              <button
                className="md:hidden p-2 text-gray-400 hover:text-white"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-white/5">
              <div className="flex flex-col gap-4">
                <a href="#features" className="text-gray-400 hover:text-white transition-colors">Features</a>
                <a href="#channels" className="text-gray-400 hover:text-white transition-colors">Channels</a>
                <Link href="/pricing" className="text-gray-400 hover:text-white transition-colors">Pricing</Link>
                <Link href="/docs" className="text-gray-400 hover:text-white transition-colors">API Docs</Link>
                <a href="https://github.com/Francosimon53/secureagent" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">GitHub</a>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="text-center"
            initial="initial"
            animate="animate"
            variants={stagger}
          >
            {/* Badge */}
            <motion.div
              variants={fadeInUp}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-gray-300">4 Channels Active</span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-400">8K+ messages today</span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={fadeInUp}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6"
            >
              <span className="text-white">Your AI Assistant That</span>
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                Actually Does Things
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              variants={fadeInUp}
              className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10"
            >
              Enterprise-grade security. Multi-channel support. Browser automation.
              <br className="hidden sm:block" />
              <span className="text-gray-300">One AI that works everywhere you do.</span>
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              variants={fadeInUp}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link
                href="/dashboard/chat"
                className="group px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-xl font-semibold text-lg transition-all hover:shadow-xl hover:shadow-blue-500/25 hover:scale-105 flex items-center justify-center gap-2"
              >
                Try Web Chat
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <a
                href="https://github.com/Francosimon53/secureagent"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl font-semibold text-lg transition-all hover:scale-105 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                View Documentation
              </a>
            </motion.div>
          </motion.div>

          {/* Demo Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-20 relative"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent z-10 pointer-events-none" />
            <div className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden shadow-2xl">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border-b border-white/10">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-4 py-1 bg-white/5 rounded-lg text-sm text-gray-400">
                    secureagent.vercel.app/dashboard/chat
                  </div>
                </div>
              </div>

              {/* Chat preview */}
              <div className="p-6 space-y-4 min-h-[300px]">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-sm font-bold">U</div>
                  <div className="flex-1 bg-white/5 rounded-2xl rounded-tl-none px-4 py-3 max-w-md">
                    <p className="text-gray-300">Go to Hacker News and tell me the top 3 stories</p>
                  </div>
                </div>

                <div className="flex gap-3 justify-end">
                  <div className="flex-1 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/20 rounded-2xl rounded-tr-none px-4 py-3 max-w-lg">
                    <p className="text-gray-200 text-sm mb-2">Here are the top 3 stories on Hacker News:</p>
                    <ol className="text-gray-300 text-sm space-y-1 list-decimal list-inside">
                      <li>Antirender: remove glossy shine on architectural renderings</li>
                      <li>How to geolocate IPs in your CLI using latency</li>
                      <li>NASA&apos;s WB-57 crash lands at Houston</li>
                    </ol>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-sm">🤖</div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded">browser_navigate</span>
                  <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded">browser_query</span>
                  <span>executed in 2.3s</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Active Channels Section */}
      <section id="channels" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              One AI, Every Channel
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Deploy once, connect everywhere. Your AI assistant works across all major platforms.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {channels.map((channel, index) => (
              <motion.div
                key={channel.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="group relative p-6 bg-white/5 border border-white/10 rounded-2xl hover:border-white/20 transition-all hover:-translate-y-1"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${channel.color} opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity`} />
                <div className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-3xl">{channel.icon}</span>
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      {channel.status}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-1">{channel.name}</h3>
                  <p className="text-gray-400 text-sm">{channel.users} active users</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Powerful Features, Built-in
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Everything you need to build secure, capable AI assistants.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="group p-8 bg-white/5 border border-white/10 rounded-2xl hover:border-white/20 transition-all"
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} mb-6`}>
                  <span className="text-2xl">{feature.icon}</span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Why SecureAgent?
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              See how we compare to other AI agent platforms.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden overflow-x-auto"
          >
            <div className="grid grid-cols-5 gap-2 sm:gap-4 p-4 bg-white/5 border-b border-white/10 text-xs sm:text-sm font-medium min-w-[600px]">
              <div className="text-gray-400">Feature</div>
              <div className="text-center text-white">SecureAgent</div>
              <div className="text-center text-gray-400">OpenClaw</div>
              <div className="text-center text-gray-400">AutoGPT</div>
              <div className="text-center text-gray-400">LangChain</div>
            </div>
            {comparison.map((row, index) => (
              <div key={row.feature} className={`grid grid-cols-5 gap-2 sm:gap-4 p-4 text-xs sm:text-sm min-w-[600px] ${index !== comparison.length - 1 ? 'border-b border-white/5' : ''}`}>
                <div className="text-gray-300">{row.feature}</div>
                <div className="text-center">
                  {row.secureAgent ? (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20 text-green-400">✓</span>
                  ) : (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500/20 text-red-400">✗</span>
                  )}
                </div>
                <div className="text-center">
                  {row.openclaw ? (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20 text-green-400">✓</span>
                  ) : (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500/20 text-red-400">✗</span>
                  )}
                </div>
                <div className="text-center">
                  {row.autogpt ? (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20 text-green-400">✓</span>
                  ) : (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500/20 text-red-400">✗</span>
                  )}
                </div>
                <div className="text-center">
                  {row.langchain ? (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20 text-green-400">✓</span>
                  ) : (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500/20 text-red-400">✗</span>
                  )}
                </div>
              </div>
            ))}
          </motion.div>

          {/* Legend */}
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs text-gray-500">
            <span><strong className="text-blue-400">SecureAgent:</strong> Enterprise-ready, secure</span>
            <span><strong className="text-gray-400">OpenClaw:</strong> Most channels</span>
            <span><strong className="text-gray-400">AutoGPT:</strong> Autonomous agents</span>
            <span><strong className="text-gray-400">LangChain:</strong> Developer flexibility</span>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Start free, scale as you grow. No hidden fees.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pricing.map((tier, index) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`relative p-6 rounded-2xl transition-all ${
                  tier.highlighted
                    ? 'bg-gradient-to-b from-blue-600/20 to-transparent border-2 border-blue-500 scale-105'
                    : 'bg-white/5 border border-white/10 hover:border-white/20'
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full text-xs font-semibold">
                    Most Popular
                  </div>
                )}
                <h3 className="text-xl font-semibold text-white">{tier.name}</h3>
                <div className="mt-4 mb-2">
                  <span className="text-4xl font-bold text-white">{tier.price}</span>
                  <span className="text-gray-400">{tier.period}</span>
                </div>
                <p className="text-gray-500 text-sm mb-6">{tier.description}</p>
                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center gap-2 text-gray-300 text-sm">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                {tier.href.startsWith('mailto:') ? (
                  <a
                    href={tier.href}
                    className={`block w-full py-3 rounded-xl font-semibold text-center transition-all ${
                      tier.highlighted
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white'
                        : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                    }`}
                  >
                    {tier.cta}
                  </a>
                ) : (
                  <Link
                    href={tier.href}
                    className={`block w-full py-3 rounded-xl font-semibold text-center transition-all ${
                      tier.highlighted
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white'
                        : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                    }`}
                  >
                    {tier.cta}
                  </Link>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto text-center"
        >
          <div className="relative p-12 rounded-3xl bg-gradient-to-br from-blue-600/20 via-cyan-600/10 to-transparent border border-white/10 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.1),transparent_50%)]" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Ready to Get Started?
              </h2>
              <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto">
                Deploy your own AI assistant in minutes. No credit card required for the free tier.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/dashboard/chat"
                  className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-xl font-semibold text-lg transition-all hover:shadow-xl hover:shadow-blue-500/25 hover:scale-105"
                >
                  Try Web Chat Free
                </Link>
                <a
                  href="https://t.me/Secure_Agent_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-lg transition-all hover:scale-105"
                >
                  Try on Telegram
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <Link href="/" className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-lg font-bold">
                  S
                </div>
                <span className="text-xl font-bold">SecureAgent</span>
              </Link>
              <p className="text-gray-500 text-sm">
                Enterprise-grade AI assistant with security at its core.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#channels" className="hover:text-white transition-colors">Channels</a></li>
                <li><Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Resources</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="https://github.com/Francosimon53/secureagent" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a></li>
                <li><Link href="/docs" className="hover:text-white transition-colors">API Docs</Link></li>
                <li><a href="https://github.com/Francosimon53/secureagent/issues" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Support</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Connect</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="https://t.me/Secure_Agent_bot" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Telegram Bot</a></li>
                <li><a href="https://github.com/Francosimon53/secureagent/issues" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Community</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">
              &copy; {new Date().getFullYear()} SecureAgent. MIT License.
            </p>
            <div className="flex gap-4">
              <a
                href="https://github.com/Francosimon53/secureagent"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
              </a>
              <a
                href="https://t.me/Secure_Agent_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
