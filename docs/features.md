# Features Guide

SecureAgent comes packed with powerful features to boost your productivity. Here's everything you can do.

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

```
/models                    # List available models
/model gpt-4              # Switch to GPT-4
/model claude-3-opus      # Switch to Claude 3 Opus
```

### Model Comparison

Use the Compare feature to test the same prompt across multiple models:

1. Go to [/dashboard/compare](/dashboard/compare)
2. Enter your prompt
3. Select 2-4 models
4. Compare responses side-by-side

## Scheduled Tasks

Automate your reminders and recurring tasks.

### Schedule a Task

```
/schedule <time> <task description>
```

**Examples:**
```
/schedule 9am Check emails
/schedule tomorrow 2pm Call the dentist
/schedule friday 5pm Submit weekly report
/schedule every monday 9am Team standup reminder
```

### Time Formats Supported

- **Relative**: `in 5 minutes`, `in 2 hours`, `tomorrow`
- **Absolute**: `9am`, `14:30`, `5pm`
- **Dates**: `monday`, `next friday`, `jan 15`
- **Recurring**: `every day`, `every monday`, `every month`

### Manage Tasks

```
/tasks                     # View all scheduled tasks
/cancel <task-id>          # Cancel a specific task
/pause <task-id>           # Pause a recurring task
/resume <task-id>          # Resume a paused task
```

## Integrations

Connect SecureAgent to your favorite tools.

### Productivity
- **Gmail** - Read, send, and manage emails
- **Google Calendar** - View and create events
- **Notion** - Access and update pages
- **Trello** - Manage boards and cards
- **Obsidian** - Search and create notes

### Communication
- **Slack** - Send messages and manage channels
- **Discord** - Bot integration for servers
- **WhatsApp** - Business API integration

### Smart Home
- **HomeKit** - Control Apple smart home devices
- **Google Home** - Voice and device control
- **Alexa** - Amazon Echo integration
- **Philips Hue** - Smart lighting control

### Social Media
- **Twitter/X** - Post and schedule tweets
- **LinkedIn** - Share updates
- **Instagram** - Post management
- **Facebook** - Page management

## Skills Marketplace

Extend SecureAgent with community-created skills.

### Browse Skills

Visit [/dashboard/marketplace](/dashboard/marketplace) to explore:

- **Productivity** - Pomodoro timer, habit tracker, expense manager
- **Communication** - Email summarizer, translation helper
- **Research** - Web researcher, fact checker, news digest
- **Data & Analysis** - CSV analyzer, chart generator
- **Personal** - Recipe finder, workout planner, travel planner

### Install a Skill

1. Find a skill you want
2. Click **Install**
3. Use it immediately in chat

### Popular Skills

| Skill | Description | Rating |
|-------|-------------|--------|
| Pomodoro Timer | 25-min focus sessions | ⭐ 4.8 |
| Web Researcher | Deep research with citations | ⭐ 4.8 |
| Recipe Finder | Find recipes by ingredients | ⭐ 4.7 |
| Habit Tracker | Build habits with streaks | ⭐ 4.7 |

## Voice Calls (Beta)

Make and receive AI-powered phone calls.

### Features
- Inbound call handling with AI
- Outbound calls for reminders
- Call transcription
- Custom voice personas

### Setup
1. Go to [/dashboard/voice-calls](/dashboard/voice-calls)
2. Add your phone number
3. Configure call handling rules

## Music Control

Control your music across services.

### Supported Services
- Spotify
- Apple Music
- Sonos speakers
- System audio

### Commands
```
"Play some jazz"
"Pause the music"
"Skip this song"
"Set volume to 50%"
"Play in the living room"
```

## ARIA Health Assistant

AI-powered health and wellness support.

### Features
- Health report analysis
- Medication reminders
- Symptom tracking
- Wellness tips

### Privacy
All health data is encrypted and never shared. HIPAA-compliant processing.

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
