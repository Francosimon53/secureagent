# Integrations Guide

Connect SecureAgent to your favorite apps and services.

## Overview

SecureAgent integrates with 20+ services across categories:

| Category | Services |
|----------|----------|
| **Email** | Gmail, Outlook |
| **Calendar** | Google Calendar, Outlook Calendar |
| **Notes** | Notion, Obsidian |
| **Tasks** | Trello, Asana, Todoist |
| **Social** | Twitter, LinkedIn, Instagram |
| **Smart Home** | HomeKit, Google Home, Alexa |
| **Music** | Spotify, Apple Music, Sonos |
| **Communication** | Slack, Discord, WhatsApp |

## Connecting an Integration

### Via Dashboard

1. Go to [secureagent.vercel.app/dashboard/integrations](https://secureagent.vercel.app/dashboard/integrations)
2. Find the service you want to connect
3. Click **Connect**
4. Follow the authorization flow
5. Grant the requested permissions

### Via Telegram

```
/connect gmail
/connect calendar
/connect notion
```

---

## Email Integrations

### Gmail

**Permissions Required:**
- Read emails
- Send emails
- Manage labels

**Setup:**
1. Click Connect on Gmail
2. Sign in with Google
3. Allow SecureAgent access

**What You Can Do:**
```
Check my unread emails
Send an email to john@example.com saying "Meeting confirmed"
Search emails from last week about "project update"
Summarize my inbox
Star the last email from Sarah
Archive emails older than 30 days
```

**Privacy:** We only access emails when you ask. No emails are stored.

---

### Outlook

**Setup:**
1. Click Connect on Outlook
2. Sign in with Microsoft account
3. Approve permissions

**What You Can Do:**
- Same capabilities as Gmail
- Works with personal and work accounts

---

## Calendar Integrations

### Google Calendar

**Permissions Required:**
- View events
- Create events
- Modify events

**Setup:**
1. Connect Google Calendar
2. Authorize with your Google account
3. Select calendars to sync

**What You Can Do:**
```
What's on my calendar today?
Schedule a meeting with John tomorrow at 2pm
Move my 3pm meeting to 4pm
Cancel the team sync on Friday
Show my free time slots next week
Add "Dentist" to my calendar on Jan 15 at 10am
```

---

### Outlook Calendar

Works the same as Google Calendar with Microsoft accounts.

---

## Note-Taking Integrations

### Notion

**Permissions Required:**
- Read pages
- Create pages
- Update pages

**Setup:**
1. Connect Notion
2. Log in to your Notion workspace
3. Select pages/databases to share

**What You Can Do:**
```
Create a new page called "Meeting Notes"
Search my Notion for "project roadmap"
Add a task to my Tasks database
Update the status of "Website redesign" to "In Progress"
What's in my Reading List?
```

---

### Obsidian

**Requirements:**
- Obsidian app installed
- Obsidian Sync or local vault access

**Setup:**
1. Install the SecureAgent Obsidian plugin
2. Configure vault location
3. Connect from dashboard

**What You Can Do:**
```
Create a new note called "Daily Journal"
Search my vault for "machine learning"
Link this note to [[Projects]]
Add a tag #important to today's note
```

---

## Task Management

### Trello

**Permissions Required:**
- Read boards
- Create/modify cards
- Manage lists

**Setup:**
1. Connect Trello
2. Authorize with Trello account
3. Select boards to access

**What You Can Do:**
```
Show my Trello boards
Add a card "Fix login bug" to the Backlog list
Move "Homepage redesign" to Done
What cards are assigned to me?
Add a due date to "Review PR"
```

---

### Asana / Todoist

Similar setup process. Manage projects, tasks, and assignments.

---

## Social Media

### Twitter/X

**Setup:**
1. Connect Twitter from Social Media dashboard
2. Authorize the app
3. Select permissions (post, read, etc.)

**What You Can Do:**
```
Post a tweet: "Just launched our new feature!"
Schedule a tweet for tomorrow at 9am
Show my recent mentions
What's trending?
```

---

### LinkedIn

**What You Can Do:**
```
Post an update about [topic]
Schedule a post for Monday morning
Share an article with commentary
```

---

### Instagram

**Requirements:** Business or Creator account

**What You Can Do:**
```
Post an image with caption
Schedule a post
Reply to recent comments
Check engagement stats
```

---

## Smart Home

### Apple HomeKit

**Requirements:**
- Apple Home app configured
- Devices added to HomeKit

**What You Can Do:**
```
Turn off the living room lights
Set the thermostat to 72 degrees
Lock the front door
Is the garage door closed?
Turn on "Good Morning" scene
```

---

### Google Home

**Setup:**
1. Connect Google Home
2. Link your Google account
3. Select home and devices

**What You Can Do:**
- Same capabilities as HomeKit
- Control Nest devices
- Manage routines

---

### Alexa

**Setup:**
1. Connect Amazon account
2. Enable SecureAgent skill
3. Link devices

**What You Can Do:**
- Control Alexa-compatible devices
- Run routines
- Check device status

---

### Philips Hue

**Direct Integration:**
1. Connect Hue Bridge
2. Press button when prompted
3. Name your rooms

**What You Can Do:**
```
Turn the bedroom lights to 50%
Set living room to warm white
Activate "Movie Time" scene
Turn off all lights
```

---

## Music Services

### Spotify

**Setup:**
1. Connect Spotify account
2. Authorize playback control
3. Select default device

**What You Can Do:**
```
Play some jazz
Skip this song
Add this to my library
Play my Discover Weekly
Set volume to 60%
```

---

### Sonos

**Setup:**
1. Discover Sonos speakers on network
2. Name rooms
3. Set default speaker

**What You Can Do:**
```
Play music in the kitchen
Group all speakers
Set living room volume to 40%
What's playing?
```

---

## Managing Integrations

### View Connected Services
```
/integrations
```

### Disconnect a Service
```
/disconnect gmail
```

### Refresh Permissions
```
/reconnect calendar
```

### Check Status

Visit [/dashboard/integrations](/dashboard/integrations) to see:
- Connection status
- Last sync time
- Permission levels
- Usage statistics

---

## Troubleshooting

### "Integration not responding"
1. Check if the service is online
2. Try disconnecting and reconnecting
3. Verify your account permissions

### "Permission denied"
1. Reconnect the integration
2. Ensure you granted all required permissions
3. Check if your account has access

### "Sync out of date"
1. Manually refresh: `/sync <service>`
2. Check last sync time in dashboard
3. Reconnect if issues persist

---

## Security & Privacy

- **OAuth 2.0**: We never see your passwords
- **Minimal permissions**: We request only what's needed
- **Encrypted tokens**: Stored with AES-256 encryption
- **Revoke anytime**: Disconnect from dashboard or service settings
- **Audit logs**: See all integration activity
