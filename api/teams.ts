import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import * as crypto from 'crypto';

// =============================================================================
// Types for Microsoft Bot Framework
// =============================================================================

interface Activity {
  type: string;
  id: string;
  timestamp: string;
  localTimestamp?: string;
  localTimezone?: string;
  serviceUrl: string;
  channelId: string;
  from: ChannelAccount;
  conversation: ConversationAccount;
  recipient: ChannelAccount;
  text?: string;
  textFormat?: string;
  attachments?: Attachment[];
  entities?: Entity[];
  channelData?: TeamsChannelData;
  action?: string;
  replyToId?: string;
  value?: unknown;
  name?: string;
  relatesTo?: ConversationReference;
  membersAdded?: ChannelAccount[];
  membersRemoved?: ChannelAccount[];
}

interface ChannelAccount {
  id: string;
  name?: string;
  aadObjectId?: string;
  role?: string;
}

interface ConversationAccount {
  id: string;
  name?: string;
  conversationType?: string;
  isGroup?: boolean;
  tenantId?: string;
}

interface Attachment {
  contentType: string;
  contentUrl?: string;
  content?: unknown;
  name?: string;
  thumbnailUrl?: string;
}

interface Entity {
  type: string;
  mentioned?: ChannelAccount;
  text?: string;
}

interface TeamsChannelData {
  tenant?: { id: string };
  team?: { id: string; name?: string };
  channel?: { id: string; name?: string };
  meeting?: { id: string };
  eventType?: string;
}

interface ConversationReference {
  activityId?: string;
  user?: ChannelAccount;
  bot?: ChannelAccount;
  conversation?: ConversationAccount;
  channelId?: string;
  serviceUrl?: string;
}

interface AdaptiveCard {
  type: 'AdaptiveCard';
  version: string;
  body: AdaptiveCardElement[];
  actions?: AdaptiveCardAction[];
  $schema?: string;
}

interface AdaptiveCardElement {
  type: string;
  text?: string;
  size?: string;
  weight?: string;
  color?: string;
  wrap?: boolean;
  spacing?: string;
  items?: AdaptiveCardElement[];
  columns?: AdaptiveCardColumn[];
  facts?: { title: string; value: string }[];
  style?: string;
  url?: string;
  altText?: string;
  width?: string;
  separator?: boolean;
}

interface AdaptiveCardColumn {
  type: 'Column';
  width: string;
  items: AdaptiveCardElement[];
}

interface AdaptiveCardAction {
  type: string;
  title: string;
  url?: string;
  data?: unknown;
}

interface BotResponse {
  type: string;
  text?: string;
  attachments?: Attachment[];
  suggestedActions?: {
    actions: { type: string; title: string; value: string }[];
  };
}

// =============================================================================
// Configuration
// =============================================================================

const MICROSOFT_APP_ID = process.env.MICROSOFT_APP_ID || '';
const MICROSOFT_APP_PASSWORD = process.env.MICROSOFT_APP_PASSWORD || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// Token cache for Bot Framework authentication
interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

// Conversation memory (in production, use a database)
const conversationMemory = new Map<string, { role: string; content: string }[]>();
const MAX_MEMORY_LENGTH = 20;
const MEMORY_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes

// Cleanup old conversations periodically
setInterval(() => {
  const now = Date.now();
  for (const [key] of conversationMemory) {
    // Simple cleanup - remove if not accessed (would need timestamps in production)
    if (conversationMemory.size > 1000) {
      conversationMemory.delete(key);
    }
  }
}, MEMORY_CLEANUP_INTERVAL);

// =============================================================================
// Bot Framework Authentication
// =============================================================================

async function getAccessToken(): Promise<string> {
  // Check cache
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) {
    return tokenCache.token;
  }

  const tokenEndpoint = 'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token';

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: MICROSOFT_APP_ID,
    client_secret: MICROSOFT_APP_PASSWORD,
    scope: 'https://api.botframework.com/.default',
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };

  return data.access_token;
}

async function verifyBotFrameworkToken(authHeader: string): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  // In production, you should validate the JWT token properly
  // This includes verifying the signature, issuer, audience, and expiration
  // For now, we do a basic check that a token is present

  const token = authHeader.substring(7);
  if (!token || token.length < 100) {
    return false;
  }

  // Basic JWT structure validation
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  try {
    // Decode and verify basic claims
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

    // Check issuer (should be from Microsoft)
    const validIssuers = [
      'https://api.botframework.com',
      'https://sts.windows.net/',
      'https://login.microsoftonline.com/',
    ];

    const issuerValid = validIssuers.some(issuer =>
      payload.iss && payload.iss.startsWith(issuer)
    );

    // Check audience (should be our app ID)
    const audienceValid = payload.aud === MICROSOFT_APP_ID ||
      payload.aud === `https://api.botframework.com`;

    // Check expiration
    const notExpired = payload.exp && payload.exp > Date.now() / 1000;

    return issuerValid && (audienceValid || !MICROSOFT_APP_ID) && notExpired;
  } catch {
    return false;
  }
}

// =============================================================================
// Send Response to Teams
// =============================================================================

async function sendToTeams(
  serviceUrl: string,
  conversationId: string,
  response: BotResponse,
  replyToId?: string
): Promise<void> {
  const token = await getAccessToken();

  const url = replyToId
    ? `${serviceUrl}v3/conversations/${conversationId}/activities/${replyToId}`
    : `${serviceUrl}v3/conversations/${conversationId}/activities`;

  const activityResponse = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(response),
  });

  if (!activityResponse.ok) {
    const error = await activityResponse.text();
    console.error('Failed to send message to Teams:', error);
    throw new Error(`Failed to send message: ${activityResponse.status}`);
  }
}

// =============================================================================
// Adaptive Card Helpers
// =============================================================================

function createWelcomeCard(): AdaptiveCard {
  return {
    type: 'AdaptiveCard',
    version: '1.4',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    body: [
      {
        type: 'Container',
        style: 'emphasis',
        items: [
          {
            type: 'ColumnSet',
            columns: [
              {
                type: 'Column',
                width: 'auto',
                items: [
                  {
                    type: 'Image',
                    url: 'https://raw.githubusercontent.com/Francosimon53/secureagent/main/assets/logo.png',
                    width: '60px',
                    altText: 'SecureAgent Logo',
                  },
                ],
              },
              {
                type: 'Column',
                width: 'stretch',
                items: [
                  {
                    type: 'TextBlock',
                    text: 'Welcome to SecureAgent!',
                    size: 'Large',
                    weight: 'Bolder',
                    color: 'Accent',
                  },
                  {
                    type: 'TextBlock',
                    text: 'Your AI assistant powered by Claude',
                    spacing: 'None',
                    wrap: true,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'Container',
        items: [
          {
            type: 'TextBlock',
            text: "I'm here to help you with:",
            weight: 'Bolder',
            spacing: 'Medium',
          },
          {
            type: 'FactSet',
            facts: [
              { title: '💬', value: 'Answering questions and providing information' },
              { title: '🔍', value: 'Searching and summarizing content' },
              { title: '📊', value: 'Analyzing data and generating insights' },
              { title: '🛠️', value: 'Helping with tasks and workflows' },
            ],
          },
        ],
      },
    ],
    actions: [
      {
        type: 'Action.Submit',
        title: 'Get Help',
        data: { action: 'help' },
      },
      {
        type: 'Action.OpenUrl',
        title: 'View Dashboard',
        url: 'https://secureagent.vercel.app/dashboard',
      },
    ],
  };
}

function createHelpCard(): AdaptiveCard {
  return {
    type: 'AdaptiveCard',
    version: '1.4',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    body: [
      {
        type: 'TextBlock',
        text: 'SecureAgent Commands',
        size: 'Large',
        weight: 'Bolder',
        color: 'Accent',
      },
      {
        type: 'TextBlock',
        text: 'Here are some things you can do:',
        wrap: true,
        spacing: 'Small',
      },
      {
        type: 'Container',
        items: [
          {
            type: 'FactSet',
            facts: [
              { title: 'help', value: 'Show this help message' },
              { title: 'clear', value: 'Clear conversation history' },
              { title: 'status', value: 'Check bot status' },
              { title: '@mention', value: 'Mention me in a channel to chat' },
            ],
          },
        ],
      },
      {
        type: 'TextBlock',
        text: 'Tips',
        weight: 'Bolder',
        spacing: 'Medium',
      },
      {
        type: 'TextBlock',
        text: '• In channels, @mention me to get my attention\n• In direct messages, just type your question\n• I remember our conversation context\n• Ask me anything - I\'m here to help!',
        wrap: true,
      },
    ],
    actions: [
      {
        type: 'Action.Submit',
        title: 'Clear History',
        data: { action: 'clear' },
      },
      {
        type: 'Action.Submit',
        title: 'Check Status',
        data: { action: 'status' },
      },
    ],
  };
}

function createStatusCard(): AdaptiveCard {
  return {
    type: 'AdaptiveCard',
    version: '1.4',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    body: [
      {
        type: 'TextBlock',
        text: 'SecureAgent Status',
        size: 'Large',
        weight: 'Bolder',
        color: 'Accent',
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'Status', value: '✅ Online' },
          { title: 'AI Model', value: 'Claude (Anthropic)' },
          { title: 'API', value: ANTHROPIC_API_KEY ? '✅ Connected' : '❌ Not configured' },
          { title: 'Bot Framework', value: MICROSOFT_APP_ID ? '✅ Configured' : '⚠️ Development mode' },
          { title: 'Version', value: '1.0.0' },
        ],
      },
    ],
  };
}

function createErrorCard(error: string): AdaptiveCard {
  return {
    type: 'AdaptiveCard',
    version: '1.4',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    body: [
      {
        type: 'TextBlock',
        text: '⚠️ Error',
        size: 'Medium',
        weight: 'Bolder',
        color: 'Attention',
      },
      {
        type: 'TextBlock',
        text: error,
        wrap: true,
      },
    ],
    actions: [
      {
        type: 'Action.Submit',
        title: 'Try Again',
        data: { action: 'retry' },
      },
    ],
  };
}

// =============================================================================
// Claude AI Integration
// =============================================================================

const SYSTEM_PROMPT = `You are SecureAgent, an AI assistant integrated with Microsoft Teams. You help users with questions, tasks, and provide information.

Guidelines:
- Be helpful, concise, and professional
- Format responses for Teams (supports Markdown)
- Keep responses focused and relevant
- If you don't know something, say so
- Use bullet points and formatting for clarity
- Respect user privacy and data security

You have access to these tools:
- http_request: Make HTTP requests to fetch data
- json_parse: Parse and extract data from JSON
- get_current_time: Get current date and time

When users ask for web data or information, use the http_request tool to fetch it.`;

const tools: Anthropic.Tool[] = [
  {
    name: 'http_request',
    description: 'Make an HTTP request to fetch data from a URL',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The URL to fetch' },
        method: { type: 'string', enum: ['GET', 'POST'], description: 'HTTP method' },
        headers: { type: 'object', description: 'Request headers' },
        body: { type: 'string', description: 'Request body for POST requests' },
      },
      required: ['url'],
    },
  },
  {
    name: 'json_parse',
    description: 'Parse JSON string and extract specific fields',
    input_schema: {
      type: 'object' as const,
      properties: {
        json_string: { type: 'string', description: 'JSON string to parse' },
        extract_path: { type: 'string', description: 'Dot notation path to extract (e.g., "data.items")' },
      },
      required: ['json_string'],
    },
  },
  {
    name: 'get_current_time',
    description: 'Get the current date and time',
    input_schema: {
      type: 'object' as const,
      properties: {
        timezone: { type: 'string', description: 'Timezone (e.g., "America/New_York")' },
      },
    },
  },
];

async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case 'http_request': {
        const url = input.url as string;
        const method = (input.method as string) || 'GET';
        const headers = (input.headers as Record<string, string>) || {};
        const body = input.body as string | undefined;

        const response = await fetch(url, {
          method,
          headers: {
            'User-Agent': 'SecureAgent-Teams/1.0',
            ...headers,
          },
          body: method === 'POST' ? body : undefined,
        });

        const text = await response.text();
        return text.substring(0, 10000); // Limit response size
      }

      case 'json_parse': {
        const jsonString = input.json_string as string;
        const extractPath = input.extract_path as string | undefined;

        const parsed = JSON.parse(jsonString);

        if (extractPath) {
          const parts = extractPath.split('.');
          let result = parsed;
          for (const part of parts) {
            result = result?.[part];
          }
          return JSON.stringify(result, null, 2);
        }

        return JSON.stringify(parsed, null, 2);
      }

      case 'get_current_time': {
        const timezone = (input.timezone as string) || 'UTC';
        const now = new Date();
        return now.toLocaleString('en-US', { timeZone: timezone });
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (error) {
    return `Tool error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

async function getAIResponse(
  conversationId: string,
  userMessage: string,
  userName: string
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    return "I'm not fully configured yet. Please set up the ANTHROPIC_API_KEY environment variable.";
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Get conversation history
  let history = conversationMemory.get(conversationId) || [];

  // Add user message to history
  history.push({ role: 'user', content: `[${userName}]: ${userMessage}` });

  // Trim history if too long
  if (history.length > MAX_MEMORY_LENGTH) {
    history = history.slice(-MAX_MEMORY_LENGTH);
  }

  try {
    let response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools,
      messages: history.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    // Handle tool use
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      // Continue conversation with tool results
      response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools,
        messages: [
          ...history.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ],
      });
    }

    // Extract text response
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    const assistantMessage = textBlock?.text || "I couldn't generate a response.";

    // Save to memory
    history.push({ role: 'assistant', content: assistantMessage });
    conversationMemory.set(conversationId, history);

    return assistantMessage;
  } catch (error) {
    console.error('AI error:', error);
    return `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// =============================================================================
// Activity Handlers
// =============================================================================

async function handleMessage(activity: Activity): Promise<BotResponse> {
  const text = activity.text?.trim() || '';
  const conversationId = activity.conversation.id;
  const userName = activity.from.name || 'User';

  // Remove bot mention from text if present
  let cleanText = text;
  if (activity.entities) {
    for (const entity of activity.entities) {
      if (entity.type === 'mention' && entity.text) {
        cleanText = cleanText.replace(entity.text, '').trim();
      }
    }
  }

  // Handle commands
  const lowerText = cleanText.toLowerCase();

  if (lowerText === 'help' || lowerText === '/help') {
    return {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: createHelpCard(),
        },
      ],
    };
  }

  if (lowerText === 'clear' || lowerText === '/clear') {
    conversationMemory.delete(conversationId);
    return {
      type: 'message',
      text: '🗑️ Conversation history cleared. Starting fresh!',
    };
  }

  if (lowerText === 'status' || lowerText === '/status') {
    return {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: createStatusCard(),
        },
      ],
    };
  }

  // Get AI response for regular messages
  if (cleanText) {
    const aiResponse = await getAIResponse(conversationId, cleanText, userName);
    return {
      type: 'message',
      text: aiResponse,
    };
  }

  return {
    type: 'message',
    text: "I didn't catch that. Type **help** to see what I can do.",
  };
}

async function handleConversationUpdate(activity: Activity): Promise<BotResponse | null> {
  // Bot was added to conversation
  if (activity.membersAdded) {
    const botAdded = activity.membersAdded.some(
      member => member.id === activity.recipient.id
    );

    if (botAdded) {
      return {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: createWelcomeCard(),
          },
        ],
      };
    }
  }

  // Bot was removed - clean up
  if (activity.membersRemoved) {
    const botRemoved = activity.membersRemoved.some(
      member => member.id === activity.recipient.id
    );

    if (botRemoved) {
      conversationMemory.delete(activity.conversation.id);
    }
  }

  return null;
}

async function handleInvoke(activity: Activity): Promise<{ status: number; body?: unknown }> {
  // Handle adaptive card actions
  if (activity.name === 'adaptiveCard/action' || activity.value) {
    const action = (activity.value as { action?: string })?.action;

    if (action === 'help') {
      return {
        status: 200,
        body: {
          statusCode: 200,
          type: 'application/vnd.microsoft.card.adaptive',
          value: createHelpCard(),
        },
      };
    }

    if (action === 'clear') {
      conversationMemory.delete(activity.conversation.id);
      return {
        status: 200,
        body: {
          statusCode: 200,
          type: 'application/vnd.microsoft.activity.message',
          value: '🗑️ Conversation history cleared!',
        },
      };
    }

    if (action === 'status') {
      return {
        status: 200,
        body: {
          statusCode: 200,
          type: 'application/vnd.microsoft.card.adaptive',
          value: createStatusCard(),
        },
      };
    }

    if (action === 'retry') {
      return {
        status: 200,
        body: {
          statusCode: 200,
          type: 'application/vnd.microsoft.activity.message',
          value: 'Please try sending your message again.',
        },
      };
    }
  }

  return { status: 200 };
}

// =============================================================================
// Main Handler
// =============================================================================

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Handle GET requests - return bot info
  if (req.method === 'GET') {
    res.status(200).json({
      name: 'SecureAgent Teams Bot',
      version: '1.0.0',
      status: {
        appIdConfigured: !!MICROSOFT_APP_ID,
        appPasswordConfigured: !!MICROSOFT_APP_PASSWORD,
        apiKeyConfigured: !!ANTHROPIC_API_KEY,
        ready: !!ANTHROPIC_API_KEY,
      },
      setup: {
        step1: 'Go to https://dev.botframework.com/',
        step2: 'Create a new bot or use Azure Bot Service',
        step3: 'Get the Microsoft App ID and Password',
        step4: 'Configure the messaging endpoint',
        endpoint: 'https://your-domain.vercel.app/api/teams',
        step5: 'Set environment variables in Vercel:',
        envVars: [
          'MICROSOFT_APP_ID - Your bot\'s App ID',
          'MICROSOFT_APP_PASSWORD - Your bot\'s App Password',
          'ANTHROPIC_API_KEY - Your Anthropic API key',
        ],
        step6: 'Add bot to Teams via App Studio or manifest',
      },
      features: [
        'Direct messages',
        'Channel conversations (with @mention)',
        'Adaptive Cards',
        'Conversation memory',
        'AI-powered responses via Claude',
        'Tool execution (HTTP requests, JSON parsing, time)',
      ],
      commands: [
        { command: 'help', description: 'Show help message' },
        { command: 'clear', description: 'Clear conversation history' },
        { command: 'status', description: 'Check bot status' },
      ],
    });
    return;
  }

  // Only allow POST for bot messages
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Verify Bot Framework authentication (optional in development)
    const authHeader = req.headers.authorization as string;
    if (MICROSOFT_APP_ID && MICROSOFT_APP_PASSWORD) {
      const isValid = await verifyBotFrameworkToken(authHeader);
      if (!isValid) {
        console.warn('Invalid or missing Bot Framework token');
        // In production, you might want to reject invalid tokens
        // res.status(401).json({ error: 'Unauthorized' });
        // return;
      }
    }

    const activity: Activity = req.body;

    if (!activity || !activity.type) {
      res.status(400).json({ error: 'Invalid activity' });
      return;
    }

    console.log(`Teams activity: ${activity.type} from ${activity.from?.name || 'unknown'}`);

    let response: BotResponse | null = null;
    let invokeResponse: { status: number; body?: unknown } | null = null;

    switch (activity.type) {
      case 'message':
        response = await handleMessage(activity);
        break;

      case 'conversationUpdate':
        response = await handleConversationUpdate(activity);
        break;

      case 'invoke':
        invokeResponse = await handleInvoke(activity);
        break;

      case 'messageReaction':
        // Handle reactions if needed
        break;

      default:
        console.log(`Unhandled activity type: ${activity.type}`);
    }

    // Handle invoke response differently
    if (invokeResponse) {
      res.status(invokeResponse.status).json(invokeResponse.body || {});
      return;
    }

    // Send response for message/conversationUpdate
    if (response && activity.serviceUrl) {
      await sendToTeams(
        activity.serviceUrl,
        activity.conversation.id,
        response,
        activity.id
      );
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({});
  } catch (error) {
    console.error('Teams bot error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
