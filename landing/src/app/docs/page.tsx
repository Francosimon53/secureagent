'use client';

import Link from 'next/link';
import { useState } from 'react';

// Documentation sections
const sections = [
  { id: 'overview', title: 'Overview' },
  { id: 'authentication', title: 'Authentication' },
  { id: 'rate-limits', title: 'Rate Limits' },
  { id: 'chat-api', title: 'Chat API' },
  { id: 'agent-api', title: 'Agent API' },
  { id: 'tools', title: 'Available Tools' },
  { id: 'stripe-api', title: 'Billing API' },
  { id: 'webhooks', title: 'Webhooks' },
  { id: 'channels', title: 'Channel Integrations' },
  { id: 'errors', title: 'Error Handling' },
  { id: 'sdks', title: 'SDKs & Libraries' },
];

// Code block component
function CodeBlock({
  language,
  code,
  title
}: {
  language: string;
  code: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-lg overflow-hidden bg-[#1a1a2e] border border-white/10">
      {title && (
        <div className="px-4 py-2 bg-white/5 border-b border-white/10 flex justify-between items-center">
          <span className="text-xs text-gray-400 font-mono">{title}</span>
          <span className="text-xs text-gray-500">{language}</span>
        </div>
      )}
      <pre className="p-4 overflow-x-auto text-sm">
        <code className="text-gray-300 font-mono whitespace-pre">{code}</code>
      </pre>
      <button
        onClick={copyToClipboard}
        className="absolute top-2 right-2 px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors opacity-0 group-hover:opacity-100"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

// Endpoint component
function Endpoint({
  method,
  path,
  description,
  children,
}: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  children: React.ReactNode;
}) {
  const methodColors = {
    GET: 'bg-green-500/20 text-green-400 border-green-500/30',
    POST: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    PUT: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden mb-6">
      <div className="p-4 bg-white/5 border-b border-white/10">
        <div className="flex items-center gap-3 mb-2">
          <span className={`px-2 py-1 text-xs font-bold rounded border ${methodColors[method]}`}>
            {method}
          </span>
          <code className="text-white font-mono">{path}</code>
        </div>
        <p className="text-gray-400 text-sm">{description}</p>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}

// Parameter table component
function ParamTable({
  params,
}: {
  params: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left py-2 px-3 text-gray-400 font-medium">Parameter</th>
            <th className="text-left py-2 px-3 text-gray-400 font-medium">Type</th>
            <th className="text-left py-2 px-3 text-gray-400 font-medium">Required</th>
            <th className="text-left py-2 px-3 text-gray-400 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((param) => (
            <tr key={param.name} className="border-b border-white/5">
              <td className="py-2 px-3">
                <code className="text-cyan-400">{param.name}</code>
              </td>
              <td className="py-2 px-3">
                <code className="text-purple-400">{param.type}</code>
              </td>
              <td className="py-2 px-3">
                {param.required ? (
                  <span className="text-red-400">Required</span>
                ) : (
                  <span className="text-gray-500">Optional</span>
                )}
              </td>
              <td className="py-2 px-3 text-gray-400">{param.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview');

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-lg font-bold">
                S
              </div>
              <span className="text-xl font-bold">SecureAgent</span>
              <span className="text-gray-500 text-sm ml-2">API Docs</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/" className="text-gray-400 hover:text-white text-sm">Home</Link>
              <Link href="/pricing" className="text-gray-400 hover:text-white text-sm">Pricing</Link>
              <Link
                href="/dashboard/chat"
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg font-medium text-sm"
              >
                Try It
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex pt-16">
        {/* Sidebar */}
        <aside className="fixed left-0 top-16 bottom-0 w-64 bg-[#0a0a0f] border-r border-white/5 overflow-y-auto p-4 hidden lg:block">
          <div className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeSection === section.id
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {section.title}
              </button>
            ))}
          </div>

          <div className="mt-8 p-4 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 rounded-xl border border-blue-500/20">
            <h4 className="font-semibold text-white mb-2">Need Help?</h4>
            <p className="text-gray-400 text-xs mb-3">
              Contact our support team or join the community.
            </p>
            <a
              href="mailto:support@secureagent.dev"
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              support@secureagent.dev
            </a>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 lg:ml-64 p-8 max-w-4xl">
          {/* Overview */}
          <section id="overview" className="mb-16">
            <h1 className="text-4xl font-bold mb-4">SecureAgent API</h1>
            <p className="text-xl text-gray-400 mb-8">
              Build powerful AI-powered applications with enterprise-grade security.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="text-2xl mb-2">🔒</div>
                <h3 className="font-semibold text-white mb-1">Enterprise Security</h3>
                <p className="text-gray-400 text-sm">OWASP Top 10 compliant with Zero Trust architecture</p>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="text-2xl mb-2">⚡</div>
                <h3 className="font-semibold text-white mb-1">Low Latency</h3>
                <p className="text-gray-400 text-sm">Global edge deployment for fast response times</p>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="text-2xl mb-2">🛠️</div>
                <h3 className="font-semibold text-white mb-1">20+ Tools</h3>
                <p className="text-gray-400 text-sm">Browser automation, HTTP, JSON processing, and more</p>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="text-2xl mb-2">📡</div>
                <h3 className="font-semibold text-white mb-1">Multi-Channel</h3>
                <p className="text-gray-400 text-sm">Deploy to Telegram, Discord, Slack, Teams, and more</p>
              </div>
            </div>

            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <h4 className="font-semibold text-blue-400 mb-2">Base URL</h4>
              <code className="text-white font-mono">https://api.secureagent.dev/v1</code>
              <p className="text-gray-400 text-sm mt-2">
                All API requests should be made to this base URL. HTTPS is required.
              </p>
            </div>
          </section>

          {/* Authentication */}
          <section id="authentication" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Authentication</h2>
            <p className="text-gray-400 mb-6">
              SecureAgent uses API keys to authenticate requests. You can manage your API keys in the{' '}
              <Link href="/dashboard/settings" className="text-blue-400 hover:underline">
                dashboard settings
              </Link>.
            </p>

            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Using API Keys</h3>
              <p className="text-gray-400 mb-4">
                Include your API key in the <code className="text-cyan-400">Authorization</code> header:
              </p>
              <CodeBlock
                language="bash"
                title="cURL Example"
                code={`curl https://api.secureagent.dev/v1/chat \\
  -H "Authorization: Bearer sk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello, SecureAgent!"}'`}
              />
            </div>

            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
              <h4 className="font-semibold text-yellow-400 mb-2">🔐 Keep your API key secure</h4>
              <ul className="text-gray-400 text-sm space-y-1">
                <li>• Never expose your API key in client-side code</li>
                <li>• Use environment variables in production</li>
                <li>• Rotate keys regularly</li>
                <li>• Set IP restrictions in dashboard</li>
              </ul>
            </div>
          </section>

          {/* Rate Limits */}
          <section id="rate-limits" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Rate Limits</h2>
            <p className="text-gray-400 mb-6">
              Rate limits vary by subscription tier. Exceeding limits returns a 429 status code.
            </p>

            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-gray-400">Plan</th>
                    <th className="text-left py-3 px-4 text-gray-400">Requests/min</th>
                    <th className="text-left py-3 px-4 text-gray-400">Messages/month</th>
                    <th className="text-left py-3 px-4 text-gray-400">Price</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="py-3 px-4 text-white">Free</td>
                    <td className="py-3 px-4 text-gray-300">10</td>
                    <td className="py-3 px-4 text-gray-300">30</td>
                    <td className="py-3 px-4 text-gray-300">$0</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 px-4 text-white">Starter</td>
                    <td className="py-3 px-4 text-gray-300">30</td>
                    <td className="py-3 px-4 text-gray-300">300</td>
                    <td className="py-3 px-4 text-gray-300">$19/mo</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 px-4 text-white">Pro</td>
                    <td className="py-3 px-4 text-gray-300">60</td>
                    <td className="py-3 px-4 text-gray-300">1,000</td>
                    <td className="py-3 px-4 text-gray-300">$49/mo</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 px-4 text-white">Power</td>
                    <td className="py-3 px-4 text-gray-300">120</td>
                    <td className="py-3 px-4 text-gray-300">3,000</td>
                    <td className="py-3 px-4 text-gray-300">$99/mo</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 px-4 text-white">Unlimited</td>
                    <td className="py-3 px-4 text-gray-300">300</td>
                    <td className="py-3 px-4 text-gray-300">10,000</td>
                    <td className="py-3 px-4 text-gray-300">$199/mo</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <CodeBlock
              language="json"
              title="Rate Limit Headers"
              code={`{
  "X-RateLimit-Limit": "60",
  "X-RateLimit-Remaining": "58",
  "X-RateLimit-Reset": "1640995200"
}`}
            />
          </section>

          {/* Chat API */}
          <section id="chat-api" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Chat API</h2>
            <p className="text-gray-400 mb-6">
              Send messages and receive AI-powered responses. Supports conversation history and streaming.
            </p>

            <Endpoint
              method="POST"
              path="/api/chat"
              description="Send a message to the AI assistant and receive a response."
            >
              <h4 className="font-semibold text-white mb-3">Request Body</h4>
              <ParamTable
                params={[
                  { name: 'message', type: 'string', required: true, description: 'The user message to send' },
                  { name: 'conversationId', type: 'string', required: false, description: 'ID to maintain conversation context' },
                  { name: 'agent', type: 'string', required: false, description: 'Agent type: general, code, research, creative' },
                  { name: 'stream', type: 'boolean', required: false, description: 'Enable streaming responses' },
                ]}
              />

              <h4 className="font-semibold text-white mb-3 mt-6">Example Request</h4>
              <CodeBlock
                language="javascript"
                title="Node.js"
                code={`const response = await fetch('https://api.secureagent.dev/v1/chat', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer sk_live_your_api_key',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: 'Explain quantum computing in simple terms',
    agent: 'general',
  }),
});

const data = await response.json();
console.log(data.response);`}
              />

              <h4 className="font-semibold text-white mb-3 mt-6">Example Response</h4>
              <CodeBlock
                language="json"
                code={`{
  "id": "msg_abc123",
  "response": "Quantum computing uses quantum bits (qubits) that can exist in multiple states simultaneously...",
  "agent": {
    "id": "general",
    "name": "General Assistant",
    "emoji": "🤖"
  },
  "usage": {
    "input_tokens": 12,
    "output_tokens": 156
  },
  "conversationId": "conv_xyz789"
}`}
              />
            </Endpoint>
          </section>

          {/* Agent API */}
          <section id="agent-api" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Agent API</h2>
            <p className="text-gray-400 mb-6">
              Execute complex tasks with AI agents that can use tools like browser automation, HTTP requests, and more.
            </p>

            <Endpoint
              method="POST"
              path="/api/agent"
              description="Execute a task with an AI agent that has access to tools."
            >
              <h4 className="font-semibold text-white mb-3">Request Body</h4>
              <ParamTable
                params={[
                  { name: 'message', type: 'string', required: true, description: 'The task for the agent to execute' },
                  { name: 'tools', type: 'string[]', required: false, description: 'Specific tools to enable (default: all)' },
                  { name: 'maxSteps', type: 'number', required: false, description: 'Maximum tool execution steps (default: 10)' },
                  { name: 'timeout', type: 'number', required: false, description: 'Timeout in milliseconds (default: 60000)' },
                ]}
              />

              <h4 className="font-semibold text-white mb-3 mt-6">Example Request</h4>
              <CodeBlock
                language="python"
                title="Python"
                code={`import requests

response = requests.post(
    'https://api.secureagent.dev/v1/agent',
    headers={
        'Authorization': 'Bearer sk_live_your_api_key',
        'Content-Type': 'application/json',
    },
    json={
        'message': 'Go to Hacker News and summarize the top 3 stories',
        'tools': ['browser_navigate', 'browser_query'],
        'maxSteps': 5,
    }
)

data = response.json()
print(data['response'])`}
              />

              <h4 className="font-semibold text-white mb-3 mt-6">Example Response</h4>
              <CodeBlock
                language="json"
                code={`{
  "id": "agent_def456",
  "response": "Here are the top 3 stories on Hacker News:\\n\\n1. **Antirender** - A tool to remove glossy shine...\\n2. **IP Geolocation via Latency** - How to geolocate...\\n3. **NASA WB-57 Crash** - NASA's research aircraft...",
  "toolCalls": [
    {
      "tool": "browser_navigate",
      "input": { "url": "https://news.ycombinator.com" },
      "output": { "success": true }
    },
    {
      "tool": "browser_query",
      "input": { "selector": ".titleline" },
      "output": { "results": [...] }
    }
  ],
  "usage": {
    "input_tokens": 45,
    "output_tokens": 312,
    "tool_calls": 2
  }
}`}
              />
            </Endpoint>

            <Endpoint
              method="GET"
              path="/api/agent?action=tools"
              description="List all available tools and their descriptions."
            >
              <h4 className="font-semibold text-white mb-3">Example Response</h4>
              <CodeBlock
                language="json"
                code={`{
  "tools": [
    {
      "name": "browser_navigate",
      "description": "Navigate to a URL in the browser",
      "parameters": {
        "url": { "type": "string", "required": true }
      }
    },
    {
      "name": "browser_screenshot",
      "description": "Take a screenshot of the current page",
      "parameters": {}
    },
    {
      "name": "http_request",
      "description": "Make an HTTP request",
      "parameters": {
        "url": { "type": "string", "required": true },
        "method": { "type": "string", "default": "GET" }
      }
    }
  ]
}`}
              />
            </Endpoint>
          </section>

          {/* Available Tools */}
          <section id="tools" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Available Tools</h2>
            <p className="text-gray-400 mb-6">
              SecureAgent provides 20+ built-in tools for AI agents. Here are the most commonly used:
            </p>

            <div className="grid gap-4">
              {[
                { name: 'browser_navigate', desc: 'Navigate to any URL', category: 'Browser' },
                { name: 'browser_click', desc: 'Click elements on the page', category: 'Browser' },
                { name: 'browser_type', desc: 'Type text into form fields', category: 'Browser' },
                { name: 'browser_query', desc: 'Query DOM elements with CSS selectors', category: 'Browser' },
                { name: 'browser_screenshot', desc: 'Capture screenshots', category: 'Browser' },
                { name: 'http_request', desc: 'Make HTTP requests to any URL', category: 'HTTP' },
                { name: 'json_parse', desc: 'Parse and extract data from JSON', category: 'Data' },
                { name: 'json_stringify', desc: 'Convert data to JSON string', category: 'Data' },
                { name: 'text_extract', desc: 'Extract text from HTML content', category: 'Data' },
                { name: 'memory_store', desc: 'Store data in conversation memory', category: 'Memory' },
                { name: 'memory_retrieve', desc: 'Retrieve stored data', category: 'Memory' },
              ].map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10"
                >
                  <div>
                    <code className="text-cyan-400 font-mono">{tool.name}</code>
                    <p className="text-gray-400 text-sm mt-1">{tool.desc}</p>
                  </div>
                  <span className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded">
                    {tool.category}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Stripe/Billing API */}
          <section id="stripe-api" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Billing API</h2>
            <p className="text-gray-400 mb-6">
              Manage subscriptions and billing with our Stripe-powered billing API.
            </p>

            <Endpoint
              method="POST"
              path="/api/stripe/checkout"
              description="Create a Stripe Checkout session for subscription."
            >
              <h4 className="font-semibold text-white mb-3">Request Body</h4>
              <ParamTable
                params={[
                  { name: 'planId', type: 'string', required: true, description: 'Plan: starter, pro, power, unlimited, team, business' },
                  { name: 'interval', type: 'string', required: false, description: 'Billing interval: monthly or yearly (default: monthly)' },
                  { name: 'quantity', type: 'number', required: false, description: 'Number of seats (for team plans)' },
                  { name: 'email', type: 'string', required: false, description: 'Pre-fill customer email' },
                ]}
              />

              <h4 className="font-semibold text-white mb-3 mt-6">Example Request</h4>
              <CodeBlock
                language="bash"
                title="cURL"
                code={`curl -X POST https://landing-xi-pied.vercel.app/api/stripe/checkout \\
  -H "Content-Type: application/json" \\
  -d '{
    "planId": "pro",
    "interval": "monthly"
  }'`}
              />

              <h4 className="font-semibold text-white mb-3 mt-6">Example Response</h4>
              <CodeBlock
                language="json"
                code={`{
  "sessionId": "cs_live_abc123...",
  "url": "https://checkout.stripe.com/c/pay/cs_live_abc123..."
}`}
              />
            </Endpoint>

            <Endpoint
              method="POST"
              path="/api/stripe/portal"
              description="Create a customer portal session for managing subscriptions."
            >
              <h4 className="font-semibold text-white mb-3">Request Body</h4>
              <ParamTable
                params={[
                  { name: 'customerId', type: 'string', required: true, description: 'Stripe customer ID' },
                  { name: 'returnUrl', type: 'string', required: false, description: 'URL to redirect after portal' },
                ]}
              />

              <h4 className="font-semibold text-white mb-3 mt-6">Example Response</h4>
              <CodeBlock
                language="json"
                code={`{
  "url": "https://billing.stripe.com/session/..."
}`}
              />
            </Endpoint>
          </section>

          {/* Webhooks */}
          <section id="webhooks" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Webhooks</h2>
            <p className="text-gray-400 mb-6">
              Receive real-time notifications for subscription events.
            </p>

            <Endpoint
              method="POST"
              path="/api/stripe-webhook"
              description="Stripe webhook endpoint for subscription lifecycle events."
            >
              <h4 className="font-semibold text-white mb-3">Supported Events</h4>
              <div className="space-y-2">
                {[
                  { event: 'checkout.session.completed', desc: 'Customer completed checkout' },
                  { event: 'customer.subscription.created', desc: 'New subscription created' },
                  { event: 'customer.subscription.updated', desc: 'Subscription plan changed' },
                  { event: 'customer.subscription.deleted', desc: 'Subscription canceled' },
                  { event: 'invoice.paid', desc: 'Invoice successfully paid' },
                  { event: 'invoice.payment_failed', desc: 'Payment attempt failed' },
                ].map((item) => (
                  <div key={item.event} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                    <code className="text-green-400 text-sm">{item.event}</code>
                    <span className="text-gray-400 text-sm">{item.desc}</span>
                  </div>
                ))}
              </div>
            </Endpoint>
          </section>

          {/* Channel Integrations */}
          <section id="channels" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Channel Integrations</h2>
            <p className="text-gray-400 mb-6">
              SecureAgent supports multiple messaging platforms via webhook endpoints.
            </p>

            <div className="grid gap-4">
              {[
                { name: 'Telegram', endpoint: '/api/telegram', icon: '✈️', status: 'Available' },
                { name: 'Discord', endpoint: '/api/discord', icon: '🎮', status: 'Available' },
                { name: 'Slack', endpoint: '/api/slack', icon: '💼', status: 'Available' },
                { name: 'Microsoft Teams', endpoint: '/api/teams', icon: '👥', status: 'Available' },
                { name: 'Google Chat', endpoint: '/api/google-chat', icon: '💬', status: 'Available' },
                { name: 'WhatsApp', endpoint: '/api/whatsapp', icon: '📱', status: 'Coming Soon' },
              ].map((channel) => (
                <div
                  key={channel.name}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{channel.icon}</span>
                    <div>
                      <h4 className="font-semibold text-white">{channel.name}</h4>
                      <code className="text-gray-400 text-sm">{channel.endpoint}</code>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      channel.status === 'Available'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}
                  >
                    {channel.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10">
              <h4 className="font-semibold text-white mb-2">Setting Up Webhooks</h4>
              <p className="text-gray-400 text-sm mb-3">
                Each platform requires webhook configuration in their developer portal:
              </p>
              <ol className="text-gray-400 text-sm space-y-2 list-decimal list-inside">
                <li>Create a bot/app in the platform&apos;s developer portal</li>
                <li>Set the webhook URL to your SecureAgent endpoint</li>
                <li>Configure the bot token in your environment variables</li>
                <li>Enable the required permissions/scopes</li>
              </ol>
            </div>
          </section>

          {/* Error Handling */}
          <section id="errors" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Error Handling</h2>
            <p className="text-gray-400 mb-6">
              SecureAgent uses conventional HTTP response codes and returns errors in a consistent JSON format.
            </p>

            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-gray-400">Code</th>
                    <th className="text-left py-3 px-4 text-gray-400">Meaning</th>
                    <th className="text-left py-3 px-4 text-gray-400">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { code: 200, meaning: 'OK', desc: 'Request succeeded' },
                    { code: 400, meaning: 'Bad Request', desc: 'Invalid request parameters' },
                    { code: 401, meaning: 'Unauthorized', desc: 'Invalid or missing API key' },
                    { code: 403, meaning: 'Forbidden', desc: 'Insufficient permissions' },
                    { code: 404, meaning: 'Not Found', desc: 'Resource not found' },
                    { code: 429, meaning: 'Too Many Requests', desc: 'Rate limit exceeded' },
                    { code: 500, meaning: 'Server Error', desc: 'Internal server error' },
                  ].map((error) => (
                    <tr key={error.code} className="border-b border-white/5">
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-mono ${
                            error.code < 300
                              ? 'bg-green-500/20 text-green-400'
                              : error.code < 500
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {error.code}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-white">{error.meaning}</td>
                      <td className="py-3 px-4 text-gray-400">{error.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <CodeBlock
              language="json"
              title="Error Response Format"
              code={`{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "You have exceeded your rate limit of 60 requests per minute.",
    "retry_after": 45
  }
}`}
            />
          </section>

          {/* SDKs */}
          <section id="sdks" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">SDKs & Libraries</h2>
            <p className="text-gray-400 mb-6">
              Official and community SDKs for popular programming languages.
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { lang: 'JavaScript/TypeScript', pkg: '@secureagent/sdk', status: 'Official' },
                { lang: 'Python', pkg: 'secureagent-python', status: 'Official' },
                { lang: 'Go', pkg: 'github.com/secureagent/go-sdk', status: 'Community' },
                { lang: 'Ruby', pkg: 'secureagent-ruby', status: 'Community' },
              ].map((sdk) => (
                <div
                  key={sdk.lang}
                  className="p-4 bg-white/5 rounded-lg border border-white/10"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-white">{sdk.lang}</h4>
                    <span
                      className={`px-2 py-1 text-xs rounded ${
                        sdk.status === 'Official'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      {sdk.status}
                    </span>
                  </div>
                  <code className="text-gray-400 text-sm">{sdk.pkg}</code>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-3">Quick Start (JavaScript)</h3>
              <CodeBlock
                language="bash"
                title="Installation"
                code={`npm install @secureagent/sdk`}
              />
              <div className="mt-4">
                <CodeBlock
                  language="javascript"
                  title="Usage"
                  code={`import SecureAgent from '@secureagent/sdk';

const agent = new SecureAgent({
  apiKey: process.env.SECUREAGENT_API_KEY,
});

// Simple chat
const response = await agent.chat('Hello!');
console.log(response.message);

// Agent with tools
const result = await agent.agent({
  message: 'Search for the latest AI news',
  tools: ['browser_navigate', 'browser_query'],
});
console.log(result.response);`}
                />
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="mt-16 pt-8 border-t border-white/10">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-gray-500 text-sm">
                &copy; {new Date().getFullYear()} SecureAgent. All rights reserved.
              </p>
              <div className="flex gap-6 text-gray-400 text-sm">
                <Link href="/" className="hover:text-white">Home</Link>
                <Link href="/pricing" className="hover:text-white">Pricing</Link>
                <a
                  href="https://github.com/Francosimon53/secureagent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white"
                >
                  GitHub
                </a>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
