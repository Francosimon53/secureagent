/**
 * Slack Bot API Endpoint
 *
 * Receives events from Slack (messages, mentions) and processes them through SecureAgent.
 * Uses Slack's Events API (HTTP-based, perfect for serverless).
 *
 * Setup:
 * 1. Create a Slack app at https://api.slack.com/apps
 * 2. Enable Event Subscriptions and set Request URL
 * 3. Subscribe to bot events: message.channels, message.im, app_mention
 * 4. Install app to workspace and get Bot Token
 * 5. Set environment variables:
 *    - SLACK_BOT_TOKEN: Bot User OAuth Token (xoxb-...)
 *    - SLACK_SIGNING_SECRET: Signing Secret for request verification
 *
 * Endpoints:
 * - POST /api/slack - Receive Slack events
 * - GET /api/slack - Setup instructions
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createHmac, timingSafeEqual } from 'crypto';

// =============================================================================
// Slack Types
// =============================================================================

interface SlackUser {
  id: string;
  username?: string;
  name?: string;
  real_name?: string;
}

interface SlackMessage {
  type: string;
  subtype?: string;
  text: string;
  user: string;
  channel: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
}

interface SlackEvent {
  type: string;
  user?: string;
  channel?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
  event_ts?: string;
}

interface SlackEventPayload {
  token: string;
  team_id: string;
  api_app_id: string;
  event: SlackEvent;
  type: string;
  event_id: string;
  event_time: number;
  challenge?: string;
}

interface SlackUrlVerification {
  type: 'url_verification';
  token: string;
  challenge: string;
}

// =============================================================================
// Signature Verification
// =============================================================================

function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  // Check timestamp to prevent replay attacks (5 minutes)
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp) < fiveMinutesAgo) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = 'v0=' + createHmac('sha256', signingSecret)
    .update(sigBasestring)
    .digest('hex');

  try {
    return timingSafeEqual(
      Buffer.from(mySignature, 'utf8'),
      Buffer.from(signature, 'utf8')
    );
  } catch {
    return false;
  }
}

// =============================================================================
// Slack API Helper
// =============================================================================

async function slackRequest(
  method: string,
  botToken: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data = await response.json() as { ok: boolean; error?: string };

  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  return data;
}

async function sendSlackMessage(
  botToken: string,
  channel: string,
  text: string,
  threadTs?: string
): Promise<void> {
  await slackRequest('chat.postMessage', botToken, {
    channel,
    text,
    thread_ts: threadTs,
  });
}

async function getUserInfo(
  botToken: string,
  userId: string
): Promise<SlackUser | null> {
  try {
    const response = await slackRequest('users.info', botToken, { user: userId }) as {
      ok: boolean;
      user?: SlackUser;
    };
    return response.user || null;
  } catch {
    return null;
  }
}

// =============================================================================
// Conversation Memory
// =============================================================================

interface ConversationState {
  messages: Anthropic.MessageParam[];
  lastUpdated: number;
}

const conversations = new Map<string, ConversationState>();

function cleanupConversations(): void {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [key, state] of conversations.entries()) {
    if (state.lastUpdated < oneHourAgo) {
      conversations.delete(key);
    }
  }
}

// =============================================================================
// Agent Integration
// =============================================================================

const AVAILABLE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'http_request',
    description: 'Make an HTTP request to fetch data from public APIs',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to request' },
        method: { type: 'string', enum: ['GET', 'POST'], description: 'HTTP method' },
      },
      required: ['url'],
    },
  },
  {
    name: 'get_timestamp',
    description: 'Get current date and time',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'http_request') {
    const url = args.url as string;
    const method = (args.method as string) || 'GET';

    const blockedPatterns = [
      /^https?:\/\/localhost/i,
      /^https?:\/\/127\./,
      /^https?:\/\/10\./,
      /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^https?:\/\/192\.168\./,
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(url)) {
        throw new Error('Access blocked for security reasons');
      }
    }

    const response = await fetch(url, { method });
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return await response.json();
    }
    return await response.text();
  }

  if (name === 'get_timestamp') {
    return new Date().toISOString();
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function processWithAgent(
  userMessage: string,
  conversationId: string,
  userName: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return "I'm sorry, but I'm not properly configured. Please ask the administrator to set up the ANTHROPIC_API_KEY.";
  }

  const client = new Anthropic({ apiKey });

  let conversation = conversations.get(conversationId);
  if (!conversation) {
    conversation = { messages: [], lastUpdated: Date.now() };
    conversations.set(conversationId, conversation);
  }

  conversation.messages.push({ role: 'user', content: userMessage });
  conversation.lastUpdated = Date.now();

  if (Math.random() < 0.1) {
    cleanupConversations();
  }

  if (conversation.messages.length > 20) {
    conversation.messages = conversation.messages.slice(-20);
  }

  try {
    let response: Anthropic.Message;
    let turns = 0;
    const maxTurns = 3;

    while (turns < maxTurns) {
      turns++;

      response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: `You are SecureAgent, a helpful AI assistant available on Slack. You're chatting with ${userName}.

Be concise since this is a chat interface - keep responses under 300 words unless detailed explanation is needed.
You can use tools to fetch data from the internet when helpful.
Be friendly and helpful. Use emojis sparingly but appropriately.
Slack supports markdown-like formatting: *bold*, _italic_, \`code\`, \`\`\`code blocks\`\`\`.

Current time: ${new Date().toISOString()}`,
        messages: conversation.messages,
        tools: AVAILABLE_TOOLS,
      });

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) {
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        try {
          const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        } catch (error) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: (error as Error).message }),
            is_error: true,
          });
        }
      }

      conversation.messages.push({ role: 'assistant', content: response.content });
      conversation.messages.push({ role: 'user', content: toolResults });
    }

    const textBlocks = response!.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    const responseText = textBlocks.map(b => b.text).join('\n');

    conversation.messages.push({ role: 'assistant', content: response!.content });

    return responseText || "I processed your request but don't have anything to say.";
  } catch (error) {
    console.error('Agent error:', error);
    return "I encountered an error processing your message. Please try again.";
  }
}

// =============================================================================
// Event Handler
// =============================================================================

// Track processed events to prevent duplicates
const processedEvents = new Set<string>();

function cleanupProcessedEvents(): void {
  // Keep only last 1000 events
  if (processedEvents.size > 1000) {
    const eventsArray = Array.from(processedEvents);
    processedEvents.clear();
    eventsArray.slice(-500).forEach(e => processedEvents.add(e));
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  const botToken = process.env.SLACK_BOT_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  // GET - Setup instructions
  if (method === 'GET') {
    return res.status(200).json({
      name: 'SecureAgent Slack Bot',
      version: '1.0.0',
      status: {
        botTokenConfigured: !!botToken,
        signingSecretConfigured: !!signingSecret,
        apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
        ready: !!botToken && !!signingSecret && !!process.env.ANTHROPIC_API_KEY,
      },
      setup: {
        step1: 'Go to https://api.slack.com/apps and click "Create New App"',
        step2: 'Choose "From scratch" and name it "SecureAgent"',
        step3: 'In "Basic Information", copy the Signing Secret',
        step4: 'Go to "OAuth & Permissions" and add Bot Token Scopes:',
        scopes: [
          'app_mentions:read',
          'channels:history',
          'channels:read',
          'chat:write',
          'im:history',
          'im:read',
          'im:write',
          'users:read',
        ],
        step5: 'Install the app to your workspace and copy the Bot User OAuth Token (xoxb-...)',
        step6: 'Set environment variables in Vercel:',
        envVars: [
          'SLACK_BOT_TOKEN - Bot User OAuth Token (xoxb-...)',
          'SLACK_SIGNING_SECRET - Signing Secret from Basic Information',
          'ANTHROPIC_API_KEY - Your Anthropic API key',
        ],
        step7: 'Go to "Event Subscriptions" and enable events',
        step8: 'Set Request URL to:',
        requestUrl: 'https://your-domain.vercel.app/api/slack',
        step9: 'Subscribe to bot events:',
        botEvents: [
          'app_mention - When someone @mentions the bot',
          'message.im - Direct messages to the bot',
          'message.channels - Messages in channels (optional)',
        ],
        step10: 'Reinstall the app if prompted',
      },
      usage: [
        '@SecureAgent <message> - Mention the bot in a channel',
        'DM the bot directly - Send a direct message',
        'help - Show help information',
        'clear - Clear conversation history',
      ],
    });
  }

  // POST - Handle Slack events
  if (method === 'POST') {
    // Get raw body for signature verification
    let rawBody: string;
    let payload: SlackEventPayload | SlackUrlVerification;

    try {
      if (typeof req.body === 'string') {
        rawBody = req.body;
        payload = JSON.parse(rawBody);
      } else if (req.body && typeof req.body === 'object') {
        rawBody = JSON.stringify(req.body);
        payload = req.body as SlackEventPayload | SlackUrlVerification;
      } else {
        return res.status(400).json({ error: 'Invalid request body' });
      }
    } catch {
      return res.status(400).json({ error: 'Failed to parse request body' });
    }

    // Handle URL verification challenge (required for Slack setup)
    if (payload.type === 'url_verification') {
      console.log('Slack URL verification received');
      return res.status(200).json({ challenge: (payload as SlackUrlVerification).challenge });
    }

    // Verify signature for all other requests
    if (signingSecret) {
      const signature = req.headers['x-slack-signature'] as string;
      const timestamp = req.headers['x-slack-request-timestamp'] as string;

      if (!signature || !timestamp) {
        return res.status(401).json({ error: 'Missing signature headers' });
      }

      const isValid = verifySlackSignature(signingSecret, signature, timestamp, rawBody);
      if (!isValid) {
        console.error('Invalid Slack signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Handle event callbacks
    if (payload.type === 'event_callback') {
      const eventPayload = payload as SlackEventPayload;
      const event = eventPayload.event;

      // Ignore bot messages to prevent loops
      if (event.bot_id) {
        return res.status(200).json({ ok: true });
      }

      // Deduplicate events (Slack may retry)
      const eventKey = `${eventPayload.event_id}:${event.ts}`;
      if (processedEvents.has(eventKey)) {
        return res.status(200).json({ ok: true });
      }
      processedEvents.add(eventKey);
      cleanupProcessedEvents();

      // Respond immediately to avoid Slack timeout
      res.status(200).json({ ok: true });

      // Process asynchronously
      if (!botToken) {
        console.error('SLACK_BOT_TOKEN not configured');
        return;
      }

      try {
        // Handle app_mention and message events
        if ((event.type === 'app_mention' || event.type === 'message') && event.text && event.channel) {
          const userId = event.user;
          const channel = event.channel;
          const threadTs = event.thread_ts || event.ts;

          // Get user info
          let userName = 'User';
          if (userId) {
            const userInfo = await getUserInfo(botToken, userId);
            userName = userInfo?.real_name || userInfo?.name || userInfo?.username || 'User';
          }

          // Clean up the message (remove bot mention)
          let text = event.text;
          text = text.replace(/<@[A-Z0-9]+>/g, '').trim();

          // Handle commands
          const lowerText = text.toLowerCase();

          if (lowerText === 'help') {
            await sendSlackMessage(
              botToken,
              channel,
              '*SecureAgent Help*\n\n' +
              '*Usage:*\n' +
              '• `@SecureAgent <message>` - Ask me anything\n' +
              '• DM me directly for private conversations\n' +
              '• `help` - Show this message\n' +
              '• `clear` - Clear conversation history\n\n' +
              '*Features:*\n' +
              '• Natural conversation with AI\n' +
              '• Web data fetching\n' +
              '• Persistent conversation memory',
              threadTs
            );
            return;
          }

          if (lowerText === 'clear') {
            const conversationId = `slack:${userId}:${channel}`;
            conversations.delete(conversationId);
            await sendSlackMessage(
              botToken,
              channel,
              ':wastebasket: Conversation history cleared. Start fresh!',
              threadTs
            );
            return;
          }

          // Process with agent
          if (text) {
            const conversationId = `slack:${userId}:${channel}`;
            const response = await processWithAgent(text, conversationId, userName);
            await sendSlackMessage(botToken, channel, response, threadTs);
          }
        }
      } catch (error) {
        console.error('Error processing Slack event:', error);
      }

      return;
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
