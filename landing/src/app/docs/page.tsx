import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation - SecureAgent',
  description: 'Learn how to use SecureAgent, connect integrations, and build with our API.',
};

const docSections = [
  {
    title: 'Getting Started',
    description: 'Quick start guide to get up and running in minutes',
    href: '/docs/getting-started',
    icon: '🚀',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    title: 'Features Guide',
    description: 'Explore all features including AI chat, scheduling, and skills',
    href: '/docs/features',
    icon: '✨',
    color: 'from-purple-500 to-pink-500',
  },
  {
    title: 'Telegram Commands',
    description: 'Complete reference for all bot commands',
    href: '/docs/telegram-commands',
    icon: '💬',
    color: 'from-green-500 to-emerald-500',
  },
  {
    title: 'Integrations',
    description: 'Connect Gmail, Calendar, Notion, and 20+ services',
    href: '/docs/integrations',
    icon: '🔗',
    color: 'from-orange-500 to-amber-500',
  },
  {
    title: 'API Reference',
    description: 'Build with our RESTful API and webhooks',
    href: '/docs/api-reference',
    icon: '⚡',
    color: 'from-red-500 to-rose-500',
  },
  {
    title: 'FAQ',
    description: 'Common questions and troubleshooting',
    href: '/docs/faq',
    icon: '❓',
    color: 'from-indigo-500 to-violet-500',
  },
];

const quickLinks = [
  { title: 'Start with Telegram', href: '/docs/getting-started#quick-start-2-minutes', icon: '📱' },
  { title: 'Connect Gmail', href: '/docs/integrations#gmail', icon: '📧' },
  { title: 'Schedule Tasks', href: '/docs/telegram-commands#schedule', icon: '⏰' },
  { title: 'Browse Skills', href: '/dashboard/marketplace', icon: '🏪' },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white sm:text-5xl">
              Documentation
            </h1>
            <p className="mt-4 text-xl text-gray-400 max-w-2xl mx-auto">
              Everything you need to get started with SecureAgent
            </p>
          </div>

          {/* Search */}
          <div className="mt-8 max-w-xl mx-auto">
            <div className="relative">
              <input
                type="text"
                placeholder="Search documentation..."
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-5 py-4 pl-12 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Quick Links */}
        <div className="mb-12">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Quick Links
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 p-4 bg-gray-900 rounded-lg border border-gray-800 hover:border-gray-700 hover:bg-gray-800 transition-all"
              >
                <span className="text-2xl">{link.icon}</span>
                <span className="text-white font-medium">{link.title}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Documentation Sections */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {docSections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group relative bg-gray-900 rounded-xl border border-gray-800 p-6 hover:border-gray-700 transition-all overflow-hidden"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${section.color} opacity-0 group-hover:opacity-5 transition-opacity`} />
              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{section.icon}</span>
                  <h3 className="text-xl font-semibold text-white group-hover:text-blue-400 transition-colors">
                    {section.title}
                  </h3>
                </div>
                <p className="text-gray-400">{section.description}</p>
                <div className="mt-4 flex items-center text-blue-400 text-sm font-medium">
                  Read more
                  <svg className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Help Section */}
        <div className="mt-16 bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-2xl p-8 border border-blue-800/50">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Need more help?</h2>
              <p className="text-gray-300 mt-2">
                Can&apos;t find what you&apos;re looking for? Our support team is here to help.
              </p>
            </div>
            <div className="flex gap-4">
              <a
                href="mailto:support@secureagent.ai"
                className="px-6 py-3 bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors"
              >
                Contact Support
              </a>
              <span
                className="px-6 py-3 bg-gray-800 text-gray-400 rounded-lg font-medium border border-gray-700 cursor-not-allowed flex items-center gap-2"
                title="Discord community coming soon"
              >
                Join Discord <span className="text-amber-400 text-xs">(Coming Soon)</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
