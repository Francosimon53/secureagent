import Link from "next/link";

// Feature data
const features = [
  {
    icon: "🔐",
    title: "Security First",
    description: "OWASP Top 10 compliance, Zero Trust architecture, and sandboxed execution with gVisor support.",
  },
  {
    icon: "🤖",
    title: "Multi-Channel",
    description: "Connect via Discord, Slack, WhatsApp, Telegram, and custom REST APIs - all from one codebase.",
  },
  {
    icon: "💰",
    title: "Cost Control",
    description: "Built-in AI budget limits, smart routing between models, and real-time usage analytics.",
  },
  {
    icon: "🏥",
    title: "Industry Verticals",
    description: "Pre-built modules for Healthcare/ABA, Legal, Finance, and more with compliance baked in.",
  },
];

// Pricing tiers
const pricing = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    description: "For personal projects",
    features: ["1 channel", "100 messages/day", "Community support", "Basic analytics"],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/mo",
    description: "For growing teams",
    features: ["All channels", "Unlimited messages", "Priority support", "Advanced analytics", "API access"],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Business",
    price: "$99",
    period: "/mo",
    description: "For scaling businesses",
    features: ["Everything in Pro", "$50 AI credits included", "Custom integrations", "Team management", "99.9% SLA"],
    cta: "Start Free Trial",
    highlighted: false,
  },
  {
    name: "Enterprise",
    price: "$299",
    period: "/mo",
    description: "For large organizations",
    features: ["Everything in Business", "SSO/SAML", "Dedicated support", "Custom SLA", "White-label option", "On-premise available"],
    cta: "Contact Sales",
    highlighted: false,
  },
];

// Tech stats
const techStats = [
  { value: "1,078", label: "Tests Passing" },
  { value: "150+", label: "Modules" },
  { value: "100%", label: "TypeScript" },
  { value: "40+", label: "Enterprise Features" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-lg border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🛡️</span>
              <span className="text-xl font-bold text-white">SecureAgent</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-400 hover:text-white transition-colors">Features</a>
              <a href="#pricing" className="text-gray-400 hover:text-white transition-colors">Pricing</a>
              <a href="#tech" className="text-gray-400 hover:text-white transition-colors">Tech Stack</a>
              <a
                href="https://github.com/Francosimon53/secureagent"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                GitHub
              </a>
            </div>
            <a
              href="https://github.com/Francosimon53/secureagent"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
            >
              Get Started
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/10 border border-blue-500/20 rounded-full text-blue-400 text-sm mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Now with Claude & OpenAI Integration
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            <span className="text-white">Secure</span>
            <span className="bg-gradient-to-r from-blue-500 to-cyan-400 bg-clip-text text-transparent">Agent</span>
          </h1>

          <p className="text-xl sm:text-2xl text-gray-400 max-w-3xl mx-auto mb-8">
            Enterprise-Grade AI Assistant with{" "}
            <span className="text-white font-semibold">OWASP Top 10 Compliance</span>
          </p>

          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-12">
            Build secure, multi-channel AI assistants with built-in cost control,
            compliance features, and support for Discord, Slack, WhatsApp, and more.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://github.com/Francosimon53/secureagent"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold text-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-blue-500/25"
            >
              Get Started
            </a>
            <a
              href="https://secureagent.vercel.app/api/health"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl font-semibold text-lg transition-all hover:scale-105"
            >
              View Demo
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Built for Enterprise Security
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Every feature designed with security, compliance, and scalability in mind.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="p-6 bg-gray-900/50 border border-gray-800 rounded-2xl hover:border-gray-700 transition-all hover:-translate-y-1"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-900/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Start free, scale as you grow. No hidden fees.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pricing.map((tier, index) => (
              <div
                key={index}
                className={`p-6 rounded-2xl transition-all ${
                  tier.highlighted
                    ? "bg-gradient-to-b from-blue-600/20 to-blue-600/5 border-2 border-blue-500 scale-105"
                    : "bg-gray-900/50 border border-gray-800 hover:border-gray-700"
                }`}
              >
                {tier.highlighted && (
                  <div className="text-blue-400 text-sm font-semibold mb-2">Most Popular</div>
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
                <button
                  className={`w-full py-3 rounded-lg font-semibold transition-all ${
                    tier.highlighted
                      ? "bg-blue-600 hover:bg-blue-500 text-white"
                      : "bg-gray-800 hover:bg-gray-700 text-white border border-gray-700"
                  }`}
                >
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack Section */}
      <section id="tech" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Battle-Tested Technology
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Built with modern tools and rigorous testing standards.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {techStats.map((stat, index) => (
              <div key={index} className="text-center p-6 bg-gray-900/30 rounded-2xl border border-gray-800">
                <div className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-blue-500 to-cyan-400 bg-clip-text text-transparent mb-2">
                  {stat.value}
                </div>
                <div className="text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-12 p-8 bg-gray-900/30 rounded-2xl border border-gray-800">
            <div className="flex flex-wrap justify-center gap-4">
              {["TypeScript", "Node.js 20+", "Vitest", "Zod", "Pino", "SQLite", "Claude API", "OpenAI API"].map((tech, index) => (
                <span
                  key={index}
                  className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 text-sm"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to Build Secure AI Assistants?
          </h2>
          <p className="text-lg text-gray-400 mb-8">
            Get started in minutes with our comprehensive documentation and examples.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://github.com/Francosimon53/secureagent"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold text-lg transition-all hover:scale-105"
            >
              View on GitHub
            </a>
            <a
              href="https://secureagent.vercel.app/api"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl font-semibold text-lg transition-all hover:scale-105"
            >
              API Documentation
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">🛡️</span>
                <span className="text-xl font-bold text-white">SecureAgent</span>
              </div>
              <p className="text-gray-500 text-sm">
                Enterprise-grade AI assistant framework with security at its core.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#tech" className="hover:text-white transition-colors">Tech Stack</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Resources</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="https://github.com/Francosimon53/secureagent" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a></li>
                <li><a href="https://secureagent.vercel.app/api" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">API Docs</a></li>
                <li><a href="https://github.com/Francosimon53/secureagent/issues" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Support</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Contact</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="https://github.com/Francosimon53/secureagent/issues" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Report Issue</a></li>
                <li><a href="https://github.com/Francosimon53/secureagent/discussions" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Discussions</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4">
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
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
