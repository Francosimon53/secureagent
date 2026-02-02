import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';

// Documentation content
const docs: Record<string, { title: string; description: string; content: string }> = {
  'getting-started': {
    title: 'Getting Started',
    description: 'Quick start guide to get up and running with SecureAgent in minutes',
    content: `
# Getting Started with SecureAgent

Welcome to SecureAgent - your enterprise-grade AI assistant with multi-channel support, advanced integrations, and a powerful skills marketplace.

## What is SecureAgent?

SecureAgent is an AI-powered assistant that:

- **Works everywhere** - Telegram, Discord, Slack, WhatsApp, and web
- **Connects to your tools** - Gmail, Calendar, Notion, Trello, and more
- **Automates your workflow** - Schedule tasks, manage reminders, process data
- **Stays secure** - OWASP Top 10 compliant with zero-trust architecture
- **Learns your preferences** - Personalized responses and recommendations

## Quick Start (2 Minutes)

### Step 1: Open Telegram

Search for **@SecureAgentBot** or click: [t.me/SecureAgentBot](https://t.me/SecureAgentBot)

### Step 2: Start the Bot

Send \`/start\` to begin. You'll receive a welcome message with available commands.

### Step 3: Ask Anything

Just type your question or request:

\`\`\`
What's the weather like in New York?
\`\`\`

\`\`\`
Summarize this article: [paste URL]
\`\`\`

\`\`\`
Help me write an email to my boss about taking vacation next week
\`\`\`

That's it! You're now using SecureAgent.

## Connect Your First Integration

### Gmail Integration

1. Go to [Dashboard > Integrations](/dashboard/integrations)
2. Click **Connect** next to Gmail
3. Sign in with your Google account
4. Grant the requested permissions

Now you can ask SecureAgent:
- "Check my unread emails"
- "Send an email to john@example.com"
- "Summarize emails from this week"

### Calendar Integration

1. Connect Google Calendar from the integrations page
2. Ask: "What's on my calendar today?"
3. Schedule events: "Add a meeting with Sarah tomorrow at 2pm"

## Your First Commands

Try these commands in Telegram:

| Command | Description |
|---------|-------------|
| \`/help\` | See all available commands |
| \`/models\` | List available AI models |
| \`/schedule 9am remind me to call mom\` | Schedule a reminder |
| \`/tasks\` | View your scheduled tasks |

## Natural Language Examples

SecureAgent understands natural language. Just type:

**Productivity:**
- "Remind me to submit the report at 5pm"
- "What meetings do I have this week?"
- "Create a to-do list for my project"

**Research:**
- "What are the latest trends in AI?"
- "Compare iPhone 15 vs Samsung S24"
- "Explain quantum computing simply"

**Writing:**
- "Write a professional email declining a meeting"
- "Help me draft a blog post about remote work"
- "Proofread this paragraph: [text]"

## Next Steps

- **Explore Features**: Read the [Features Guide](/docs/features)
- **Learn Commands**: See all [Telegram Commands](/docs/telegram-commands)
- **Connect Tools**: Set up [Integrations](/docs/integrations)
- **Install Skills**: Browse the [Marketplace](/dashboard/marketplace)

## Need Help?

- **FAQ**: Common questions answered at [/docs/faq](/docs/faq)
- **Support**: Contact us at support@secureagent.ai
- **Community**: Join our Discord server
    `,
  },
  'features': {
    title: 'Features Guide',
    description: 'Explore all SecureAgent features including AI chat, scheduling, integrations, and skills',
    content: `
# Features Guide

SecureAgent comes packed with powerful features to boost your productivity.

## Chat with AI

### 25+ AI Models

Choose from the best AI models available:

| Provider | Models |
|----------|--------|
| **OpenAI** | GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo |
| **Anthropic** | Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku |
| **Google** | Gemini Pro, Gemini Ultra |
| **Meta** | Llama 3 70B, Llama 3 8B |
| **Mistral** | Mistral Large, Mistral Medium |
| **Local** | Ollama models (self-hosted) |

### Switch Models

\`\`\`
/models                    # List available models
/model gpt-4              # Switch to GPT-4
/model claude-3-opus      # Switch to Claude 3 Opus
\`\`\`

### Model Comparison

Use the Compare feature to test the same prompt across multiple models:

1. Go to [/dashboard/compare](/dashboard/compare)
2. Enter your prompt
3. Select 2-4 models
4. Compare responses side-by-side

## Scheduled Tasks

Automate your reminders and recurring tasks.

### Schedule a Task

\`\`\`
/schedule <time> <task description>
\`\`\`

**Examples:**
\`\`\`
/schedule 9am Check emails
/schedule tomorrow 2pm Call the dentist
/schedule friday 5pm Submit weekly report
/schedule every monday 9am Team standup reminder
\`\`\`

### Time Formats Supported

- **Relative**: \`in 5 minutes\`, \`in 2 hours\`, \`tomorrow\`
- **Absolute**: \`9am\`, \`14:30\`, \`5pm\`
- **Dates**: \`monday\`, \`next friday\`, \`jan 15\`
- **Recurring**: \`every day\`, \`every monday\`, \`every month\`

### Manage Tasks

\`\`\`
/tasks                     # View all scheduled tasks
/cancel <task-id>          # Cancel a specific task
/pause <task-id>           # Pause a recurring task
/resume <task-id>          # Resume a paused task
\`\`\`

## Integrations

Connect SecureAgent to your favorite tools:

### Productivity
- **Gmail** - Read, send, and manage emails
- **Google Calendar** - View and create events
- **Notion** - Access and update pages
- **Trello** - Manage boards and cards

### Smart Home
- **HomeKit** - Control Apple smart home devices
- **Google Home** - Voice and device control
- **Alexa** - Amazon Echo integration
- **Philips Hue** - Smart lighting control

### Social Media
- **Twitter/X** - Post and schedule tweets
- **LinkedIn** - Share updates
- **Instagram** - Post management

## Skills Marketplace

Extend SecureAgent with community-created skills.

### Browse Skills

Visit [/dashboard/marketplace](/dashboard/marketplace) to explore:

- **Productivity** - Pomodoro timer, habit tracker, expense manager
- **Communication** - Email summarizer, translation helper
- **Research** - Web researcher, fact checker, news digest
- **Data & Analysis** - CSV analyzer, chart generator
- **Personal** - Recipe finder, workout planner, travel planner

### Popular Skills

| Skill | Description | Rating |
|-------|-------------|--------|
| Pomodoro Timer | 25-min focus sessions | ⭐ 4.8 |
| Web Researcher | Deep research with citations | ⭐ 4.8 |
| Recipe Finder | Find recipes by ingredients | ⭐ 4.7 |
| Habit Tracker | Build habits with streaks | ⭐ 4.7 |

## Security Features

### Enterprise-Grade Security
- **OWASP Top 10** compliance
- **Zero Trust** architecture
- **End-to-end encryption** for sensitive data
- **Audit logs** for all actions
- **Role-based access control**

### Data Privacy
- Your data is never used for training
- Delete your data anytime
- Export your data on request
- GDPR and CCPA compliant
    `,
  },
  'telegram-commands': {
    title: 'Telegram Commands',
    description: 'Complete reference for all SecureAgent Telegram bot commands',
    content: `
# Telegram Commands

Complete reference for all SecureAgent Telegram commands.

## Basic Commands

### /start
Initialize the bot and get a welcome message.

\`\`\`
/start
\`\`\`

### /help
Display all available commands and usage tips.

\`\`\`
/help
/help schedule    # Get help for specific command
\`\`\`

### /models
List all available AI models.

\`\`\`
/models
\`\`\`

### /model
Switch to a different AI model.

\`\`\`
/model gpt-4
/model claude-3-opus
/model gemini-pro
\`\`\`

## Scheduling Commands

### /schedule
Schedule a task or reminder.

**Syntax:**
\`\`\`
/schedule <time> <task description>
\`\`\`

**Examples:**
\`\`\`
/schedule 9am Check emails
/schedule in 30 minutes Call John
/schedule tomorrow 2pm Doctor appointment
/schedule friday 5pm Submit report
/schedule every monday 9am Weekly standup
/schedule every day 8am Take medication
\`\`\`

**Time Formats:**
| Format | Example |
|--------|---------|
| Absolute time | \`9am\`, \`14:30\`, \`5:00pm\` |
| Relative time | \`in 5 minutes\`, \`in 2 hours\` |
| Day reference | \`today\`, \`tomorrow\`, \`monday\` |
| Date | \`jan 15\`, \`2024-01-15\` |
| Recurring | \`every day\`, \`every monday\` |

### /tasks
View all your scheduled tasks.

\`\`\`
/tasks
/tasks today      # Show today's tasks only
/tasks week       # Show this week's tasks
\`\`\`

### /cancel
Cancel a scheduled task.

\`\`\`
/cancel 1         # Cancel task #1
/cancel all       # Cancel all tasks
\`\`\`

## Integration Commands

### /connect
Connect a new integration.

\`\`\`
/connect gmail
/connect calendar
/connect notion
\`\`\`

### /disconnect
Disconnect an integration.

\`\`\`
/disconnect gmail
\`\`\`

### /integrations
List all connected integrations.

\`\`\`
/integrations
\`\`\`

## Settings Commands

### /settings
View and modify your settings.

\`\`\`
/settings
/settings model gpt-4
/settings timezone America/New_York
\`\`\`

### /privacy
View privacy settings and data options.

\`\`\`
/privacy
/privacy export   # Export your data
/privacy delete   # Delete your data
\`\`\`

## Natural Language Examples

You don't always need commands. Just type naturally:

### Productivity
\`\`\`
Remind me to call mom at 5pm
What's on my schedule tomorrow?
Add a meeting with Sarah on Friday at 2pm
\`\`\`

### Email (with Gmail connected)
\`\`\`
Check my unread emails
Send an email to john@example.com about the meeting
Summarize emails from this week
\`\`\`

### Research
\`\`\`
What are the latest news about AI?
Compare Tesla Model 3 vs BMW i4
Explain blockchain in simple terms
\`\`\`

### Writing
\`\`\`
Write a professional email declining a meeting
Help me draft a blog post about productivity
Translate "Hello, how are you?" to Spanish
\`\`\`

## Command Shortcuts

| Shortcut | Full Command |
|----------|--------------|
| \`/s\` | \`/schedule\` |
| \`/t\` | \`/tasks\` |
| \`/c\` | \`/cancel\` |
| \`/m\` | \`/models\` |
| \`/h\` | \`/help\` |
    `,
  },
  'integrations': {
    title: 'Integrations Guide',
    description: 'Connect SecureAgent to Gmail, Calendar, Notion, and 20+ other services',
    content: `
# Integrations Guide

Connect SecureAgent to your favorite apps and services.

## Overview

SecureAgent integrates with 20+ services:

| Category | Services |
|----------|----------|
| **Email** | Gmail, Outlook |
| **Calendar** | Google Calendar, Outlook Calendar |
| **Notes** | Notion, Obsidian |
| **Tasks** | Trello, Asana, Todoist |
| **Social** | Twitter, LinkedIn, Instagram |
| **Smart Home** | HomeKit, Google Home, Alexa |
| **Music** | Spotify, Apple Music, Sonos |

## Connecting an Integration

### Via Dashboard

1. Go to [Dashboard > Integrations](/dashboard/integrations)
2. Find the service you want to connect
3. Click **Connect**
4. Follow the authorization flow
5. Grant the requested permissions

### Via Telegram

\`\`\`
/connect gmail
/connect calendar
/connect notion
\`\`\`

## Gmail

**What You Can Do:**
\`\`\`
Check my unread emails
Send an email to john@example.com saying "Meeting confirmed"
Search emails from last week about "project update"
Summarize my inbox
\`\`\`

**Privacy:** We only access emails when you ask. Nothing is stored.

## Google Calendar

**What You Can Do:**
\`\`\`
What's on my calendar today?
Schedule a meeting with John tomorrow at 2pm
Move my 3pm meeting to 4pm
Cancel the team sync on Friday
Show my free time slots next week
\`\`\`

## Notion

**What You Can Do:**
\`\`\`
Create a new page called "Meeting Notes"
Search my Notion for "project roadmap"
Add a task to my Tasks database
Update the status of "Website redesign" to "In Progress"
\`\`\`

## Trello

**What You Can Do:**
\`\`\`
Show my Trello boards
Add a card "Fix login bug" to the Backlog list
Move "Homepage redesign" to Done
What cards are assigned to me?
\`\`\`

## Smart Home

### Apple HomeKit

\`\`\`
Turn off the living room lights
Set the thermostat to 72 degrees
Lock the front door
Is the garage door closed?
\`\`\`

### Philips Hue

\`\`\`
Turn the bedroom lights to 50%
Set living room to warm white
Activate "Movie Time" scene
\`\`\`

## Music Services

### Spotify

\`\`\`
Play some jazz
Skip this song
Add this to my library
Play my Discover Weekly
\`\`\`

### Sonos

\`\`\`
Play music in the kitchen
Group all speakers
Set living room volume to 40%
\`\`\`

## Managing Integrations

### View Connected Services
\`\`\`
/integrations
\`\`\`

### Disconnect a Service
\`\`\`
/disconnect gmail
\`\`\`

## Security & Privacy

- **OAuth 2.0**: We never see your passwords
- **Minimal permissions**: We request only what's needed
- **Encrypted tokens**: Stored with AES-256 encryption
- **Revoke anytime**: Disconnect from dashboard or service settings
    `,
  },
  'api-reference': {
    title: 'API Reference',
    description: 'Build with the SecureAgent RESTful API, webhooks, and SDKs',
    content: `
# API Reference

SecureAgent provides a RESTful API for programmatic access.

## Base URL

\`\`\`
https://secureagent.vercel.app/api
\`\`\`

## Authentication

Include your API key in request headers:

\`\`\`bash
Authorization: Bearer YOUR_API_KEY
\`\`\`

### Getting Your API Key

1. Go to [/dashboard/settings](/dashboard/settings)
2. Navigate to "API Keys"
3. Click "Generate New Key"

## Endpoints

### POST /api/chat

Send a message and get an AI response.

\`\`\`bash
curl -X POST https://secureagent.vercel.app/api/chat \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "What is the capital of France?",
    "model": "gpt-4o"
  }'
\`\`\`

**Response:**
\`\`\`json
{
  "success": true,
  "response": "The capital of France is Paris.",
  "model": "gpt-4o",
  "usage": {
    "promptTokens": 12,
    "completionTokens": 8,
    "totalTokens": 20
  }
}
\`\`\`

### GET /api/skills/marketplace

List available marketplace skills.

\`\`\`bash
curl https://secureagent.vercel.app/api/skills/marketplace \\
  -H "Authorization: Bearer YOUR_API_KEY"
\`\`\`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| query | string | Search term |
| category | string | Filter by category |
| sortBy | string | downloads, rating, recent, name |
| page | number | Page number |
| pageSize | number | Items per page |

### GET /api/integrations

List user's connected integrations.

\`\`\`bash
curl https://secureagent.vercel.app/api/integrations \\
  -H "Authorization: Bearer YOUR_API_KEY"
\`\`\`

## Error Handling

\`\`\`json
{
  "success": false,
  "error": {
    "code": "INVALID_API_KEY",
    "message": "The provided API key is invalid"
  }
}
\`\`\`

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| INVALID_API_KEY | 401 | API key is invalid |
| UNAUTHORIZED | 401 | Not authenticated |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| RATE_LIMITED | 429 | Too many requests |

## Rate Limits

| Plan | Requests/minute | Requests/day |
|------|-----------------|--------------|
| Free | 20 | 1,000 |
| Pro | 100 | 10,000 |
| Enterprise | Unlimited | Unlimited |

## SDKs

### JavaScript/TypeScript

\`\`\`bash
npm install @secureagent/sdk
\`\`\`

\`\`\`typescript
import { SecureAgent } from '@secureagent/sdk';

const agent = new SecureAgent({ apiKey: 'YOUR_API_KEY' });
const response = await agent.chat('What is 2+2?');
\`\`\`

### Python

\`\`\`bash
pip install secureagent
\`\`\`

\`\`\`python
from secureagent import SecureAgent

agent = SecureAgent(api_key='YOUR_API_KEY')
response = agent.chat('What is 2+2?')
\`\`\`
    `,
  },
  'faq': {
    title: 'FAQ',
    description: 'Frequently asked questions about SecureAgent',
    content: `
# Frequently Asked Questions

## General

### What is SecureAgent?

SecureAgent is an enterprise-grade AI assistant that works across multiple channels (Telegram, Discord, Slack, WhatsApp) and integrates with your favorite tools (Gmail, Calendar, Notion, and more).

### Is SecureAgent free?

Yes! SecureAgent offers a free tier with:
- 5 messages/day
- Basic AI models
- Web chat access
- Community support

Paid plans start at $19/month (Starter) with 500 messages/day and all AI models.

### Which AI models are available?

SecureAgent supports 25+ models including:
- **OpenAI**: GPT-4o, GPT-4 Turbo, GPT-3.5
- **Anthropic**: Claude 3 Opus, Sonnet, Haiku
- **Google**: Gemini Pro, Gemini Ultra
- **Meta**: Llama 3 70B, 8B
- **Local**: Ollama (self-hosted)

## Getting Started

### How do I start using SecureAgent?

1. Open Telegram and search for **@SecureAgentBot**
2. Send \`/start\`
3. Start chatting!

That's it! No signup required for basic usage.

### How do I connect integrations?

1. Visit [Dashboard > Integrations](/dashboard/integrations)
2. Click "Connect" on the service you want
3. Follow the authorization steps

## Privacy & Security

### Is my data secure?

Absolutely. SecureAgent is built with enterprise-grade security:
- **OWASP Top 10** compliant
- **Zero Trust** architecture
- **End-to-end encryption** for sensitive data

### Do you store my conversations?

By default, conversations are stored to maintain context. You can:
- Disable storage in Settings
- Delete conversations anytime
- Export your data
- Auto-delete after 30 days

### Is my data used for training?

**Never.** Your data is never used to train AI models.

## Troubleshooting

### The bot isn't responding

1. Check if you're sending messages in the right chat
2. Try sending \`/start\` again
3. Check [status.secureagent.ai](https://status.secureagent.ai) for outages

### Integration shows "disconnected"

1. Go to Dashboard > Integrations
2. Click "Reconnect" on the affected integration
3. Re-authorize if prompted

### Slow response times

1. Try a faster model (GPT-3.5 vs GPT-4)
2. Shorten your prompt
3. Check your internet connection

## Billing

### How does billing work?

- **Free** ($0): 5 messages/day, basic models
- **Starter** ($19/mo): 500 messages/day, all models
- **Pro** ($49/mo): 2,000 messages/day, priority support
- **Power** ($99/mo): 5,000 messages/day, API access
- **Unlimited** ($199/mo): Unlimited messages, dedicated support

### Can I cancel anytime?

Yes! Cancel from Settings > Subscription.

## Contact & Support

- **Email**: support@secureagent.ai
- **Discord**: [Join our community](https://discord.gg/secureagent)
- **Twitter**: [@SecureAgentAI](https://twitter.com/SecureAgentAI)
    `,
  },
};

const sidebarLinks = [
  { title: 'Getting Started', href: '/docs/getting-started', icon: '🚀' },
  { title: 'Features Guide', href: '/docs/features', icon: '✨' },
  { title: 'Telegram Commands', href: '/docs/telegram-commands', icon: '💬' },
  { title: 'Integrations', href: '/docs/integrations', icon: '🔗' },
  { title: 'API Reference', href: '/docs/api-reference', icon: '⚡' },
  { title: 'FAQ', href: '/docs/faq', icon: '❓' },
];

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = docs[slug];
  
  if (!doc) {
    return { title: 'Not Found - SecureAgent Docs' };
  }

  return {
    title: `${doc.title} - SecureAgent Docs`,
    description: doc.description,
  };
}

export async function generateStaticParams() {
  return Object.keys(docs).map((slug) => ({ slug }));
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const doc = docs[slug];

  if (!doc) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="hidden lg:block w-64 bg-gray-900 border-r border-gray-800 fixed h-full overflow-y-auto">
        <div className="p-6">
          <Link href="/docs" className="flex items-center gap-2 text-white font-bold text-lg mb-8">
            <span>📚</span>
            <span>Documentation</span>
          </Link>
          <nav className="space-y-1">
            {sidebarLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                  link.href === `/docs/${slug}`
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span>{link.icon}</span>
                <span className="font-medium">{link.title}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-gray-800">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64">
        {/* Mobile header */}
        <div className="lg:hidden bg-gray-900 border-b border-gray-800 p-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <Link href="/docs" className="flex items-center gap-2 text-white font-bold">
              <span>📚</span>
              <span>Docs</span>
            </Link>
            <Link href="/" className="text-gray-400 hover:text-white">
              Home
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-12">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-8">
            <Link href="/docs" className="hover:text-white">Docs</Link>
            <span>/</span>
            <span className="text-white">{doc.title}</span>
          </div>

          {/* Content */}
          <article className="prose prose-invert prose-lg max-w-none">
            <div 
              className="markdown-content"
              dangerouslySetInnerHTML={{ 
                __html: renderMarkdown(doc.content) 
              }} 
            />
          </article>

          {/* Navigation */}
          <div className="mt-16 pt-8 border-t border-gray-800">
            <div className="flex justify-between">
              {getPrevNext(slug).prev && (
                <Link
                  href={getPrevNext(slug).prev!.href}
                  className="flex items-center gap-2 text-gray-400 hover:text-white"
                >
                  <span>←</span>
                  <span>{getPrevNext(slug).prev!.title}</span>
                </Link>
              )}
              {getPrevNext(slug).next && (
                <Link
                  href={getPrevNext(slug).next!.href}
                  className="flex items-center gap-2 text-gray-400 hover:text-white ml-auto"
                >
                  <span>{getPrevNext(slug).next!.title}</span>
                  <span>→</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function getPrevNext(currentSlug: string) {
  const slugs = Object.keys(docs);
  const currentIndex = slugs.indexOf(currentSlug);
  
  return {
    prev: currentIndex > 0 
      ? { title: docs[slugs[currentIndex - 1]].title, href: `/docs/${slugs[currentIndex - 1]}` }
      : null,
    next: currentIndex < slugs.length - 1 
      ? { title: docs[slugs[currentIndex + 1]].title, href: `/docs/${slugs[currentIndex + 1]}` }
      : null,
  };
}

function renderMarkdown(content: string): string {
  // Simple markdown rendering
  return content
    // Headers
    .replace(/^### (.*$)/gim, '<h3 class="text-xl font-semibold text-white mt-8 mb-4">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold text-white mt-12 mb-6">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold text-white mb-8">$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-gray-800 rounded-lg p-4 overflow-x-auto my-4"><code class="text-sm text-gray-300">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-blue-400 px-2 py-0.5 rounded text-sm">$1</code>')
    // Tables
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      if (cells.every(c => c.trim().match(/^[-:]+$/))) {
        return ''; // Skip separator row
      }
      const isHeader = match.includes('**');
      const tag = isHeader ? 'th' : 'td';
      const cellClass = isHeader 
        ? 'px-4 py-2 text-left text-gray-300 font-semibold bg-gray-800' 
        : 'px-4 py-2 text-gray-400 border-t border-gray-700';
      return `<tr>${cells.map(c => `<${tag} class="${cellClass}">${c.trim()}</${tag}>`).join('')}</tr>`;
    })
    // Wrap tables
    .replace(/(<tr>.*<\/tr>\n?)+/g, '<table class="w-full my-4 border border-gray-700 rounded-lg overflow-hidden">$&</table>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-400 hover:text-blue-300 underline">$1</a>')
    // Lists
    .replace(/^- (.*$)/gim, '<li class="text-gray-300 ml-4">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, '<ul class="list-disc list-inside my-4 space-y-2">$&</ul>')
    // Numbered lists
    .replace(/^\d+\. (.*$)/gim, '<li class="text-gray-300 ml-4">$1</li>')
    // Paragraphs
    .replace(/^(?!<[hupltoc])(.*$)/gim, (match) => {
      if (match.trim() === '') return '';
      if (match.startsWith('<')) return match;
      return `<p class="text-gray-300 my-4">${match}</p>`;
    })
    // Clean up empty paragraphs
    .replace(/<p class="text-gray-300 my-4"><\/p>/g, '');
}
