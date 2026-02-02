# Frequently Asked Questions

## General

### What is SecureAgent?

SecureAgent is an enterprise-grade AI assistant that works across multiple channels (Telegram, Discord, Slack, WhatsApp) and integrates with your favorite tools (Gmail, Calendar, Notion, and more).

### Is SecureAgent free?

Yes! SecureAgent offers a free tier with:
- 100 messages/day
- Access to GPT-3.5 and Claude 3 Haiku
- 3 integrations
- Basic scheduling

Pro plans start at $10/month for unlimited messages and premium models.

### Which AI models are available?

SecureAgent supports 25+ models including:
- **OpenAI**: GPT-4o, GPT-4 Turbo, GPT-3.5
- **Anthropic**: Claude 3 Opus, Sonnet, Haiku
- **Google**: Gemini Pro, Gemini Ultra
- **Meta**: Llama 3 70B, 8B
- **Local**: Ollama (self-hosted)

### Can I use my own API keys?

Yes! In Settings, you can add your own OpenAI, Anthropic, or other API keys to use your own quota.

---

## Getting Started

### How do I start using SecureAgent?

1. Open Telegram and search for **@SecureAgentBot**
2. Send `/start`
3. Start chatting!

That's it! No signup required for basic usage.

### How do I connect integrations?

1. Visit [secureagent.vercel.app/dashboard/integrations](https://secureagent.vercel.app/dashboard/integrations)
2. Click "Connect" on the service you want
3. Follow the authorization steps
4. Start using natural language commands

### What commands are available?

See our full [Telegram Commands](/docs/telegram-commands) guide. Key commands:
- `/help` - Get help
- `/schedule` - Schedule a task
- `/tasks` - View tasks
- `/models` - List AI models

---

## Features

### How does scheduling work?

Use natural language to schedule tasks:
```
/schedule tomorrow 9am Remind me to call John
/schedule every monday 10am Weekly team sync
```

Or just say:
```
Remind me to submit the report at 5pm
```

### Can SecureAgent read my emails?

Only if you connect Gmail and explicitly ask. For example:
- "Check my unread emails"
- "Summarize emails from Sarah"

We never read emails without your command, and nothing is stored.

### How do I install skills?

1. Go to [/dashboard/marketplace](/dashboard/marketplace)
2. Browse or search for skills
3. Click "Install" on any skill
4. Use it immediately in chat

### Can I create my own skills?

Yes! Visit [/dashboard/marketplace/submit](/dashboard/marketplace/submit) to submit your own skill. Skills are reviewed before publishing.

---

## Privacy & Security

### Is my data secure?

Absolutely. SecureAgent is built with enterprise-grade security:
- **OWASP Top 10** compliant
- **Zero Trust** architecture
- **End-to-end encryption** for sensitive data
- **SOC 2 Type II** certified (Pro plans)

### Do you store my conversations?

By default, conversations are stored to maintain context. You can:
- Disable storage in Settings
- Delete conversations anytime
- Export your data
- Auto-delete after 30 days

### Is my data used for training?

**Never.** Your data is never used to train AI models. We use the APIs directly without any data sharing.

### Who can see my data?

Only you. Our team cannot access your conversations or integration data. Audit logs track all system access.

### How do I delete my data?

1. Go to Settings > Privacy
2. Click "Export Data" to download everything
3. Click "Delete All Data" to remove permanently

Or send `/privacy delete` in Telegram.

---

## Integrations

### Why isn't my integration syncing?

Try these steps:
1. Check if the service is online
2. Disconnect and reconnect the integration
3. Verify your account permissions haven't changed
4. Check for service-specific limits (e.g., Gmail quota)

### What permissions do integrations need?

We request minimal permissions:
- **Gmail**: Read/send emails, manage labels
- **Calendar**: View/create events
- **Notion**: Read/write pages
- **Trello**: Access boards and cards

You can revoke permissions anytime from the service's settings.

### Can I use multiple accounts?

Yes! You can connect multiple Gmail accounts, calendars, etc. Specify which one when asking:
- "Check emails on my work account"
- "Add to my personal calendar"

---

## Billing

### How does billing work?

- **Free**: No credit card required, 100 messages/day
- **Pro** ($10/mo): Unlimited messages, premium models, priority support
- **Enterprise**: Custom pricing, dedicated support, SLA

### Can I cancel anytime?

Yes! Cancel from Settings > Subscription. You'll keep access until the end of your billing period.

### Do you offer refunds?

Yes, within 14 days of purchase if you're not satisfied. Contact support@secureagent.ai.

### Is there a team plan?

Enterprise plans include team features:
- Shared integrations
- Admin dashboard
- Usage analytics
- Role-based access

Contact sales@secureagent.ai for pricing.

---

## Troubleshooting

### The bot isn't responding

1. Check if you're sending messages in the right chat
2. Try sending `/start` again
3. Check [status.secureagent.ai](https://status.secureagent.ai) for outages
4. Wait a few minutes and try again

### "Model unavailable" error

Some models have rate limits or may be temporarily unavailable. Try:
1. Switch to a different model: `/model gpt-3.5-turbo`
2. Wait a few minutes
3. Check if you've exceeded your daily limit

### Integration shows "disconnected"

1. Go to Dashboard > Integrations
2. Click "Reconnect" on the affected integration
3. Re-authorize if prompted
4. Check if your password changed

### Scheduled task didn't trigger

1. Check the task is still active: `/tasks`
2. Verify the time and timezone: `/settings timezone`
3. Check for errors in task history
4. Recreate the task if needed

### Slow response times

1. Try a faster model (GPT-3.5 vs GPT-4)
2. Shorten your prompt
3. Check your internet connection
4. Avoid peak hours (9am-5pm US time)

---

## Contact & Support

### How do I get help?

- **Documentation**: [/docs](/docs)
- **Email**: support@secureagent.ai
- **Discord**: [Join our community](https://discord.gg/secureagent)
- **Twitter**: [@SecureAgentAI](https://twitter.com/SecureAgentAI)

### How do I report a bug?

1. Email bugs@secureagent.ai with:
   - What you expected
   - What happened
   - Steps to reproduce
   - Screenshots if helpful

### How do I request a feature?

1. Email features@secureagent.ai
2. Vote on existing requests at [feedback.secureagent.ai](https://feedback.secureagent.ai)
3. Post in our Discord #feature-requests channel

### Is there an API?

Yes! See our [API Reference](/docs/api-reference) for full documentation.
