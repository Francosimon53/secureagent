# API Reference

SecureAgent provides a RESTful API for programmatic access.

## Base URL

```
https://secureagent.vercel.app/api
```

## Authentication

All API requests require authentication using an API key.

### Getting Your API Key

1. Go to [/dashboard/settings](/dashboard/settings)
2. Navigate to "API Keys"
3. Click "Generate New Key"
4. Copy and store securely

### Using Your API Key

Include in request headers:

```bash
Authorization: Bearer YOUR_API_KEY
```

Or as query parameter:

```bash
?api_key=YOUR_API_KEY
```

---

## Endpoints

### Chat

#### POST /api/chat

Send a message and get an AI response.

**Request:**
```bash
curl -X POST https://secureagent.vercel.app/api/chat \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the capital of France?",
    "model": "gpt-4o",
    "conversationId": "optional-conversation-id"
  }'
```

**Response:**
```json
{
  "success": true,
  "response": "The capital of France is Paris.",
  "conversationId": "conv_abc123",
  "model": "gpt-4o",
  "usage": {
    "promptTokens": 12,
    "completionTokens": 8,
    "totalTokens": 20
  }
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| message | string | Yes | The user message |
| model | string | No | AI model to use (default: gpt-4o) |
| conversationId | string | No | Continue existing conversation |
| systemPrompt | string | No | Custom system prompt |
| temperature | number | No | Creativity (0-1, default: 0.7) |

---

### Skills

#### GET /api/skills/marketplace

List available marketplace skills.

**Request:**
```bash
curl https://secureagent.vercel.app/api/skills/marketplace \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "items": [
    {
      "id": "pomodoro-timer",
      "displayName": "Pomodoro Timer",
      "description": "25-minute focus sessions",
      "category": "productivity",
      "rating": 4.8,
      "downloads": 4521
    }
  ],
  "total": 20,
  "page": 1,
  "pageSize": 12,
  "totalPages": 2
}
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| query | string | Search term |
| category | string | Filter by category |
| sortBy | string | downloads, rating, recent, name |
| page | number | Page number (default: 1) |
| pageSize | number | Items per page (default: 12) |
| featured | boolean | Only featured skills |

---

#### GET /api/skills/marketplace/:id

Get a specific skill.

```bash
curl https://secureagent.vercel.app/api/skills/marketplace/pomodoro-timer \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

#### POST /api/skills/marketplace/:id/install

Install a skill for the authenticated user.

```bash
curl -X POST https://secureagent.vercel.app/api/skills/marketplace/pomodoro-timer/install \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### Integrations

#### GET /api/integrations

List user's connected integrations.

```bash
curl https://secureagent.vercel.app/api/integrations \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "integrations": [
    {
      "id": "gmail",
      "name": "Gmail",
      "connected": true,
      "connectedAt": "2024-01-15T10:30:00Z",
      "status": "active"
    },
    {
      "id": "calendar",
      "name": "Google Calendar",
      "connected": false
    }
  ]
}
```

---

#### POST /api/integrations/connect

Initiate OAuth flow for an integration.

```bash
curl -X POST https://secureagent.vercel.app/api/integrations/connect \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"integration": "gmail"}'
```

**Response:**
```json
{
  "authUrl": "https://accounts.google.com/oauth/..."
}
```

---

### Voice Calls

#### GET /api/voice/calls

List call history.

```bash
curl https://secureagent.vercel.app/api/voice/calls \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

#### POST /api/voice

Initiate an outbound call.

```bash
curl -X POST https://secureagent.vercel.app/api/voice \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "message": "This is a reminder about your appointment"
  }'
```

---

### Social Media

#### GET /api/social/accounts

List connected social accounts.

```bash
curl https://secureagent.vercel.app/api/social/accounts \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

#### POST /api/social/posts

Create a social media post.

```bash
curl -X POST https://secureagent.vercel.app/api/social/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "twitter",
    "content": "Hello from SecureAgent!",
    "scheduledAt": "2024-01-16T09:00:00Z"
  }'
```

---

### Music

#### GET /api/music

Get current playback status.

```bash
curl https://secureagent.vercel.app/api/music \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

#### POST /api/music/playback

Control playback.

```bash
curl -X POST https://secureagent.vercel.app/api/music/playback \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "play", "query": "jazz music"}'
```

**Actions:** play, pause, next, previous, shuffle, repeat

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "INVALID_API_KEY",
    "message": "The provided API key is invalid",
    "details": {}
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| INVALID_API_KEY | 401 | API key is invalid or expired |
| UNAUTHORIZED | 401 | Not authenticated |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |

---

## Rate Limits

| Plan | Requests/minute | Requests/day |
|------|-----------------|--------------|
| Free | 20 | 1,000 |
| Pro | 100 | 10,000 |
| Enterprise | Unlimited | Unlimited |

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705401600
```

---

## Webhooks

### Setting Up Webhooks

1. Go to [/dashboard/settings](/dashboard/settings)
2. Navigate to "Webhooks"
3. Add your endpoint URL
4. Select events to subscribe to

### Webhook Events

| Event | Description |
|-------|-------------|
| message.received | New message received |
| task.triggered | Scheduled task triggered |
| integration.connected | Integration connected |
| integration.error | Integration error |
| call.completed | Voice call completed |

### Webhook Payload

```json
{
  "event": "message.received",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "messageId": "msg_abc123",
    "content": "Hello",
    "channel": "telegram",
    "userId": "user_xyz"
  }
}
```

### Verifying Webhooks

Verify the signature header:
```
X-SecureAgent-Signature: sha256=...
```

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${hash}` === signature;
}
```

---

## SDKs

### JavaScript/TypeScript

```bash
npm install @secureagent/sdk
```

```typescript
import { SecureAgent } from '@secureagent/sdk';

const agent = new SecureAgent({ apiKey: 'YOUR_API_KEY' });

const response = await agent.chat('What is 2+2?');
console.log(response.message);
```

### Python

```bash
pip install secureagent
```

```python
from secureagent import SecureAgent

agent = SecureAgent(api_key='YOUR_API_KEY')

response = agent.chat('What is 2+2?')
print(response.message)
```

---

## Support

- **Documentation**: [/docs](/docs)
- **API Status**: [status.secureagent.ai](https://status.secureagent.ai)
- **Email**: api-support@secureagent.ai
