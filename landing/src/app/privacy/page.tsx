import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy - SecureAgent',
  description: 'Privacy Policy for SecureAgent AI Assistant',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-white hover:text-gray-300 transition-colors">
            <span className="text-2xl">🛡️</span>
            <span className="font-bold">SecureAgent</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-gray-400 mb-8">Last updated: February 1, 2025</p>

        <div className="prose prose-invert max-w-none space-y-8">
          {/* Introduction */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Introduction</h2>
            <p className="text-gray-300 leading-relaxed">
              SecureAgent (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy.
              This Privacy Policy explains how we collect, use, and safeguard your information when you use
              our AI assistant services, including the SecureAgent Chrome Extension and web application.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              By using SecureAgent, you agree to the collection and use of information in accordance with this policy.
            </p>
          </section>

          {/* Data Collection */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Information We Collect</h2>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">Data Stored Locally</h3>
            <p className="text-gray-300 leading-relaxed">
              The following information is stored locally on your device and never transmitted to our servers:
            </p>
            <ul className="list-disc list-inside text-gray-300 mt-2 space-y-2">
              <li><strong>API Keys:</strong> Your API keys for AI services (Anthropic, OpenAI, etc.) are stored securely in your browser&apos;s local storage.</li>
              <li><strong>User Preferences:</strong> Settings such as preferred language, theme, and feature toggles.</li>
              <li><strong>Conversation History:</strong> Chat history is stored locally and can be deleted at any time.</li>
            </ul>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">Data Processed for AI Features</h3>
            <p className="text-gray-300 leading-relaxed">
              When you use AI features, the following data may be temporarily processed:
            </p>
            <ul className="list-disc list-inside text-gray-300 mt-2 space-y-2">
              <li><strong>Selected Text:</strong> Text you highlight on web pages for summarization, translation, or explanation.</li>
              <li><strong>Page Content:</strong> When using the &quot;Summarize Page&quot; feature, the page&apos;s text content is processed.</li>
              <li><strong>Chat Messages:</strong> Messages you send to the AI assistant for processing.</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              This data is sent directly to the AI provider (based on your configuration) and is not stored on our servers.
            </p>
          </section>

          {/* How We Use Data */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">How We Use Your Information</h2>
            <p className="text-gray-300 leading-relaxed">
              We use the collected information solely to provide and improve our AI assistant services:
            </p>
            <ul className="list-disc list-inside text-gray-300 mt-2 space-y-2">
              <li>To process your AI requests (chat, summarization, translation, etc.)</li>
              <li>To personalize your experience based on your preferences</li>
              <li>To improve our services and develop new features</li>
            </ul>
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mt-4">
              <p className="text-green-400 font-medium">
                🔒 We do NOT sell, rent, or share your personal data with third parties for marketing purposes.
              </p>
            </div>
          </section>

          {/* Third Party Services */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Third-Party Services</h2>
            <p className="text-gray-300 leading-relaxed">
              SecureAgent integrates with the following third-party AI providers to deliver its services:
            </p>

            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-2">Anthropic (Claude)</h4>
                <p className="text-gray-400 text-sm">
                  AI processing for chat and text analysis.
                </p>
                <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer"
                   className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block">
                  View Anthropic Privacy Policy →
                </a>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-2">OpenAI (GPT)</h4>
                <p className="text-gray-400 text-sm">
                  AI processing for chat and text analysis.
                </p>
                <a href="https://openai.com/privacy" target="_blank" rel="noopener noreferrer"
                   className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block">
                  View OpenAI Privacy Policy →
                </a>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-2">Google (Gemini)</h4>
                <p className="text-gray-400 text-sm">
                  AI processing for chat and text analysis.
                </p>
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer"
                   className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block">
                  View Google Privacy Policy →
                </a>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-2">Ollama (Local)</h4>
                <p className="text-gray-400 text-sm">
                  Local AI processing - data never leaves your machine.
                </p>
                <span className="text-green-400 text-sm mt-2 inline-block">
                  🔒 Complete Privacy
                </span>
              </div>
            </div>

            <p className="text-gray-300 leading-relaxed mt-4">
              When using cloud AI providers, your data is subject to their respective privacy policies.
              For complete privacy, we recommend using Ollama for local AI processing.
            </p>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Data Retention</h2>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li><strong>Local Data:</strong> Stored indefinitely on your device until you delete it.</li>
              <li><strong>AI Requests:</strong> Not stored on our servers. Data is processed in real-time and discarded.</li>
              <li><strong>Analytics:</strong> We may collect anonymous usage statistics to improve our services. This data cannot be used to identify you.</li>
            </ul>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">How to Delete Your Data</h3>
            <p className="text-gray-300 leading-relaxed">
              You can delete all locally stored data at any time:
            </p>
            <ul className="list-disc list-inside text-gray-300 mt-2 space-y-2">
              <li><strong>Chrome Extension:</strong> Go to Settings → &quot;Clear All Data&quot;</li>
              <li><strong>Browser Storage:</strong> Clear your browser&apos;s local storage for our domain</li>
              <li><strong>Uninstall:</strong> Removing the extension automatically deletes all associated data</li>
            </ul>
          </section>

          {/* Security */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Data Security</h2>
            <p className="text-gray-300 leading-relaxed">
              We implement industry-standard security measures to protect your information:
            </p>
            <ul className="list-disc list-inside text-gray-300 mt-2 space-y-2">
              <li>All API communications use HTTPS encryption</li>
              <li>API keys are stored securely in browser storage, never transmitted to our servers</li>
              <li>We follow OWASP security guidelines</li>
              <li>Regular security audits and updates</li>
            </ul>
          </section>

          {/* Children's Privacy */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Children&apos;s Privacy</h2>
            <p className="text-gray-300 leading-relaxed">
              SecureAgent is not intended for use by children under 13 years of age. We do not knowingly
              collect personal information from children under 13. If you are a parent or guardian and
              believe your child has provided us with personal information, please contact us.
            </p>
          </section>

          {/* Changes to Policy */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Changes to This Policy</h2>
            <p className="text-gray-300 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by
              posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.
              You are advised to review this Privacy Policy periodically for any changes.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Contact Us</h2>
            <p className="text-gray-300 leading-relaxed">
              If you have any questions about this Privacy Policy, please contact us:
            </p>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mt-4">
              <p className="text-gray-300">
                <strong className="text-white">Email:</strong> privacy@secureagent.ai
              </p>
              <p className="text-gray-300 mt-2">
                <strong className="text-white">GitHub:</strong>{' '}
                <a href="https://github.com/Francosimon53/secureagent" target="_blank" rel="noopener noreferrer"
                   className="text-blue-400 hover:text-blue-300">
                  github.com/Francosimon53/secureagent
                </a>
              </p>
            </div>
          </section>

          {/* Summary */}
          <section className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6 mt-8">
            <h2 className="text-xl font-semibold text-white mb-4">Privacy Summary</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="text-white font-medium">Your data stays local</p>
                  <p className="text-gray-400 text-sm">API keys and preferences stored on your device</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="text-white font-medium">No data selling</p>
                  <p className="text-gray-400 text-sm">We never sell or share your data</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="text-white font-medium">You control your data</p>
                  <p className="text-gray-400 text-sm">Delete anytime from settings</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="text-white font-medium">Local AI option</p>
                  <p className="text-gray-400 text-sm">Use Ollama for complete privacy</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Back to Home */}
        <div className="mt-12 pt-8 border-t border-gray-800">
          <Link href="/" className="text-blue-400 hover:text-blue-300 transition-colors">
            ← Back to Home
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12">
        <div className="max-w-4xl mx-auto px-6 py-6 text-center text-gray-500 text-sm">
          © 2025 SecureAgent. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
