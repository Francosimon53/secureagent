# SecureAgent Onboarding Email Sequence

## Email 1: Day 1 (Sent immediately after signup)
*See welcome.md*

---

## Email 2: Day 2 - First Automation

### Subject Lines
A: Did you try this yet? Your first automation awaits
B: The #1 automation our users set up first
C: 2 minutes to your first scheduled task

### Preheader
Most users start with a morning briefing. Here's how.

---

Hi {{firstName}},

Yesterday you joined SecureAgent. Today, let's set up your first **scheduled automation**.

### The Most Popular First Automation: Morning Briefing

Here's what it does:
- Every morning at your chosen time
- SecureAgent checks the news, weather, and your calendar
- Sends you a summary via Telegram/Discord/Slack

**Set it up in 3 clicks:**

1. Go to [Dashboard → Scheduler](https://secureagent.vercel.app/dashboard/scheduler)
2. Click "New Task"
3. Enter: "Every day at 8am, give me a briefing with weather, top news, and my calendar for today"

That's it. Tomorrow morning, you'll wake up to a personalized briefing.

[Create Morning Briefing →](https://secureagent.vercel.app/dashboard/scheduler)

---

### Other Quick Wins

Once you've set up your morning briefing, try these:

| Automation | Command |
|------------|---------|
| Price monitor | "Check Amazon daily for iPhone price drops under $800" |
| Weekly recap | "Every Friday at 5pm, summarize my week's activity" |
| Social monitor | "Daily, check Twitter for mentions of my brand" |

---

### Stuck?

Reply to this email and I'll personally help you set things up.

Best,
The SecureAgent Team

---

## Email 3: Day 4 - Browser Automation

### Subject Lines
A: The feature that makes SecureAgent different
B: Let your AI browse the web for you
C: "Go to this website and..." - how browser automation works

### Preheader
Most AI assistants can't do this. SecureAgent can.

---

Hi {{firstName}},

Most AI assistants can only chat. SecureAgent can actually **browse the web for you**.

### Browser Automation: What It Means

Instead of:
1. You: "How do I find trending topics on Hacker News?"
2. AI: "Go to news.ycombinator.com and look at..."
3. You: *opens browser, navigates, reads, comes back*

With SecureAgent:
1. You: "Go to Hacker News and tell me the top 5 stories"
2. SecureAgent: *browses, extracts, summarizes*
3. You: *gets the answer directly*

### Try It Now

Open your connected channel (Telegram/Discord/Slack) and try:

```
"Browse to Reddit r/technology and summarize the top 3 posts"

"Go to weather.com and get the 5-day forecast for San Francisco"

"Check Product Hunt for today's top 3 products"

"Go to my company website and check if it's loading correctly"
```

### Pro Tip: Screenshots

Add "and take a screenshot" to any browse command:

```
"Go to competitor.com and take a screenshot of their pricing page"
```

[Try Browser Automation →](https://secureagent.vercel.app/dashboard)

---

### Your Stats

| This week | |
|-----------|--|
| Messages sent | {{messagesThisWeek}} |
| Automations created | {{automationsCreated}} |
| Websites browsed | {{sitesBrowsed}} |

---

Keep exploring!

The SecureAgent Team

---

## Email 4: Day 7 - Multi-Channel & Upgrade

### Subject Lines
A: One AI, everywhere you are
B: Your weekly SecureAgent recap (+ a special offer)
C: You've been using SecureAgent for a week!

### Preheader
Connect all your channels. Get the same AI everywhere.

---

Hi {{firstName}},

You've been with us for a week! Here's your recap:

### Your Week in Numbers

| Stat | Value |
|------|-------|
| Messages | {{totalMessages}} |
| Automations running | {{activeAutomations}} |
| Websites browsed | {{totalBrowses}} |
| Time saved (est.) | {{timeSaved}} |

---

### Are You Using All Your Channels?

SecureAgent works across multiple platforms. Your conversations sync everywhere.

**Currently connected:**
{{#each connectedChannels}}
- ✅ {{this}}
{{/each}}

**Not yet connected:**
{{#each notConnectedChannels}}
- ⬜ {{this}} - [Connect](https://secureagent.vercel.app/dashboard/integrations)
{{/each}}

Why connect multiple channels?
- Start a conversation on your phone (Telegram)
- Continue on your computer (Web/Slack)
- Get notifications where you are

[Connect More Channels →](https://secureagent.vercel.app/dashboard/integrations)

---

### Running Low on Messages?

You've used **{{messagesUsed}}** of your **{{messageLimit}}** messages this month.

{{#if approachingLimit}}
**Upgrade to get more:**

| Plan | Messages | Price |
|------|----------|-------|
| Starter | 300/mo | $19/mo |
| Pro | 1,000/mo | $49/mo |

**Still have your launch code?** Use **PRODUCTHUNT50** for 50% off your first 3 months.

[Upgrade Now →](https://secureagent.vercel.app/dashboard/settings)
{{/if}}

---

### What's Next?

Now that you know the basics, here are advanced features to explore:

1. **Smart Home Control** - Connect your devices
2. **Voice Calls** - Talk to your AI by phone
3. **Custom Tools** - Build your own integrations
4. **Team Workspaces** - Share with your team

[Explore Features →](https://secureagent.vercel.app/features)

---

Thanks for being an early user. We're building this for you.

Reply anytime with feedback or questions!

The SecureAgent Team

---

## Sequence Triggers

| Email | Trigger | Delay |
|-------|---------|-------|
| Welcome | Signup | Immediate |
| First Automation | Signup | +24 hours |
| Browser Automation | Signup | +4 days |
| Multi-Channel & Upgrade | Signup | +7 days |

## Conditions

- Skip "First Automation" if user has already created a scheduled task
- Skip "Browser Automation" if user has already used browser features
- Only show upgrade CTA if user has used >50% of their message limit
