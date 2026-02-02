# Telegram Commands

Complete reference for all SecureAgent Telegram commands.

## Basic Commands

### /start
Initialize the bot and get a welcome message.

```
/start
```

**Response:** Welcome message with quick start guide.

---

### /help
Display all available commands and usage tips.

```
/help
/help schedule    # Get help for specific command
```

---

### /models
List all available AI models.

```
/models
```

**Response:**
```
Available Models:
━━━━━━━━━━━━━━━━━━━━
OpenAI:
  • gpt-4o (default)
  • gpt-4-turbo
  • gpt-3.5-turbo

Anthropic:
  • claude-3-opus
  • claude-3-sonnet
  • claude-3-haiku

Use /model <name> to switch
```

---

### /model
Switch to a different AI model.

```
/model gpt-4
/model claude-3-opus
/model gemini-pro
```

---

## Scheduling Commands

### /schedule
Schedule a task or reminder.

**Syntax:**
```
/schedule <time> <task description>
```

**Examples:**
```
/schedule 9am Check emails
/schedule in 30 minutes Call John
/schedule tomorrow 2pm Doctor appointment
/schedule friday 5pm Submit report
/schedule every monday 9am Weekly standup
/schedule every day 8am Take medication
```

**Time Formats:**
| Format | Example |
|--------|---------|
| Absolute time | `9am`, `14:30`, `5:00pm` |
| Relative time | `in 5 minutes`, `in 2 hours` |
| Day reference | `today`, `tomorrow`, `monday` |
| Date | `jan 15`, `2024-01-15` |
| Recurring | `every day`, `every monday`, `every month` |

---

### /tasks
View all your scheduled tasks.

```
/tasks
/tasks today      # Show today's tasks only
/tasks week       # Show this week's tasks
```

**Response:**
```
📋 Your Scheduled Tasks
━━━━━━━━━━━━━━━━━━━━━━━━

#1 - Check emails
   ⏰ Today at 9:00 AM
   🔄 One-time

#2 - Weekly standup
   ⏰ Every Monday at 9:00 AM
   🔄 Recurring

#3 - Submit report
   ⏰ Friday at 5:00 PM
   🔄 One-time
```

---

### /cancel
Cancel a scheduled task.

```
/cancel 1         # Cancel task #1
/cancel all       # Cancel all tasks
```

---

### /pause
Pause a recurring task.

```
/pause 2          # Pause task #2
```

---

### /resume
Resume a paused task.

```
/resume 2         # Resume task #2
```

---

## Integration Commands

### /connect
Connect a new integration.

```
/connect gmail
/connect calendar
/connect notion
```

---

### /disconnect
Disconnect an integration.

```
/disconnect gmail
```

---

### /integrations
List all connected integrations.

```
/integrations
```

---

## Settings Commands

### /settings
View and modify your settings.

```
/settings
/settings model gpt-4
/settings timezone America/New_York
/settings language en
```

---

### /privacy
View privacy settings and data options.

```
/privacy
/privacy export   # Export your data
/privacy delete   # Delete your data
```

---

## Natural Language Examples

You don't always need commands. Just type naturally:

### Productivity
```
Remind me to call mom at 5pm
What's on my schedule tomorrow?
Add a meeting with Sarah on Friday at 2pm
Create a to-do list for my project
```

### Email (with Gmail connected)
```
Check my unread emails
Send an email to john@example.com about the meeting
Summarize emails from this week
Reply to the last email from Sarah
```

### Calendar (with Calendar connected)
```
What meetings do I have today?
Schedule a dentist appointment for next Tuesday at 10am
Move my 2pm meeting to 3pm
Cancel tomorrow's team sync
```

### Research
```
What are the latest news about AI?
Compare Tesla Model 3 vs BMW i4
Explain blockchain in simple terms
What's the weather in Tokyo?
```

### Writing
```
Write a professional email declining a meeting
Help me draft a blog post about productivity
Proofread this: [paste text]
Translate "Hello, how are you?" to Spanish
```

### Analysis
```
Analyze this data: [paste CSV]
Create a summary of this document
What are the key points in this article?
```

## Command Shortcuts

| Shortcut | Full Command |
|----------|--------------|
| `/s` | `/schedule` |
| `/t` | `/tasks` |
| `/c` | `/cancel` |
| `/m` | `/models` |
| `/h` | `/help` |

## Tips

1. **Use natural language** - You don't need commands for most things
2. **Be specific** - "Remind me at 5pm" is better than "remind me later"
3. **Combine requests** - "Check my emails and summarize the important ones"
4. **Attach files** - Send images, PDFs, or documents for analysis
5. **Use context** - Follow up on previous messages naturally
