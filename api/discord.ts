/**
 * Discord Bot API Endpoint
 *
 * Receives interactions from Discord (slash commands) and processes them through SecureAgent.
 * Uses Discord's Interactions Endpoint (HTTP-based, perfect for serverless).
 *
 * Setup:
 * 1. Create a Discord application at https://discord.com/developers/applications
 * 2. Create a bot user and get the token
 * 3. Set environment variables:
 *    - DISCORD_BOT_TOKEN: Your bot token
 *    - DISCORD_APPLICATION_ID: Your application ID
 *    - DISCORD_PUBLIC_KEY: Your application's public key (for verification)
 * 4. Set Interactions Endpoint URL in Discord Developer Portal to:
 *    https://your-domain.vercel.app/api/discord
 * 5. Register slash commands using the provided setup endpoint
 *
 * Endpoints:
 * - POST /api/discord - Receive Discord interactions
 * - GET /api/discord - Setup instructions
 * - POST /api/discord?action=register - Register slash commands
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// Discord Types
// =============================================================================

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string;
  avatar?: string;
}

interface DiscordMember {
  user: DiscordUser;
  nick?: string;
  roles: string[];
}

interface DiscordInteractionData {
  id: string;
  name: string;
  type: number;
  options?: Array<{
    name: string;
    type: number;
    value: string | number | boolean;
  }>;
}

interface DiscordInteraction {
  id: string;
  application_id: string;
  type: number; // 1 = PING, 2 = APPLICATION_COMMAND, 3 = MESSAGE_COMPONENT
  data?: DiscordInteractionData;
  guild_id?: string;
  channel_id?: string;
  member?: DiscordMember;
  user?: DiscordUser;
  token: string;
  version: number;
}

// Interaction Types
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

// Interaction Response Types
const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
} as const;

// =============================================================================
// Signature Verification
// =============================================================================

async function verifyDiscordSignature(
  signature: string,
  timestamp: string,
  body: string,
  publicKey: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(timestamp + body);

    // Convert hex public key to Uint8Array
    const keyData = new Uint8Array(
      publicKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
    );

    // Convert hex signature to Uint8Array
    const signatureData = new Uint8Array(
      signature.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
    );

    // Import the public key
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify']
    );

    // Verify the signature
    return await crypto.subtle.verify('Ed25519', key, signatureData, data);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// =============================================================================
// Discord API Helper
// =============================================================================

async function discordRequest(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    botToken?: string;
  } = {}
): Promise<unknown> {
  const url = `https://discord.com/api/v10${endpoint}`;
  const { method = 'GET', body, botToken } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (botToken) {
    headers['Authorization'] = `Bot ${botToken}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Discord API error: ${response.status} ${JSON.stringify(error)}`);
  }

  return response.json();
}

async function sendFollowupMessage(
  applicationId: string,
  interactionToken: string,
  content: string
): Promise<void> {
  await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }
  );
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
        system: `You are SecureAgent, a helpful AI assistant available on Discord. You're chatting with ${userName}.

Be concise since this is a chat interface - keep responses under 300 words unless detailed explanation is needed.
You can use tools to fetch data from the internet when helpful.
Be friendly and helpful. Use emojis sparingly but appropriately.
Discord has a 2000 character limit per message, so keep responses within that limit.

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

    // Truncate if over Discord's limit
    if (responseText.length > 2000) {
      return responseText.slice(0, 1997) + '...';
    }

    return responseText || "I processed your request but don't have anything to say.";
  } catch (error) {
    console.error('Agent error:', error);
    return "I encountered an error processing your message. Please try again.";
  }
}

// =============================================================================
// Slash Command Registration
// =============================================================================

async function registerCommands(applicationId: string, botToken: string): Promise<unknown> {
  const commands = [
    {
      name: 'ask',
      description: 'Ask SecureAgent a question',
      options: [
        {
          name: 'question',
          description: 'Your question for the AI',
          type: 3, // STRING
          required: true,
        },
      ],
    },
    {
      name: 'help',
      description: 'Show help information about SecureAgent',
    },
    {
      name: 'clear',
      description: 'Clear your conversation history with SecureAgent',
    },
  ];

  return await discordRequest(`/applications/${applicationId}/commands`, {
    method: 'PUT',
    body: commands,
    botToken,
  });
}

// =============================================================================
// Webhook Handler
// =============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method, query } = req;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  // GET - Setup instructions or command registration
  if (method === 'GET') {
    // Register commands
    if (query.action === 'register' && botToken && applicationId) {
      try {
        const result = await registerCommands(applicationId, botToken);
        return res.status(200).json({
          success: true,
          message: 'Slash commands registered successfully',
          commands: result,
        });
      } catch (error) {
        return res.status(500).json({
          error: 'Failed to register commands',
          message: (error as Error).message,
        });
      }
    }

    // Setup instructions
    return res.status(200).json({
      name: 'SecureAgent Discord Bot',
      version: '1.0.0',
      status: {
        botTokenConfigured: !!botToken,
        applicationIdConfigured: !!applicationId,
        publicKeyConfigured: !!publicKey,
        apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
        ready: !!botToken && !!applicationId && !!publicKey && !!process.env.ANTHROPIC_API_KEY,
      },
      setup: {
        step1: 'Go to https://discord.com/developers/applications',
        step2: 'Click "New Application" and give it a name (e.g., "SecureAgent")',
        step3: 'In General Information, copy the APPLICATION ID and PUBLIC KEY',
        step4: 'Go to "Bot" section and click "Reset Token" to get your bot token',
        step5: 'Set environment variables in Vercel:',
        envVars: [
          'DISCORD_BOT_TOKEN - Your bot token',
          'DISCORD_APPLICATION_ID - Your application ID',
          'DISCORD_PUBLIC_KEY - Your public key',
          'ANTHROPIC_API_KEY - Your Anthropic API key',
        ],
        step6: 'In "General Information", set Interactions Endpoint URL to:',
        interactionsUrl: 'https://your-domain.vercel.app/api/discord',
        step7: 'Go to "OAuth2" > "URL Generator", select "bot" and "applications.commands" scopes',
        step8: 'Select permissions: Send Messages, Use Slash Commands',
        step9: 'Copy the generated URL and open it to add the bot to your server',
        step10: 'Register slash commands by visiting:',
        registerUrl: 'https://your-domain.vercel.app/api/discord?action=register',
      },
      commands: [
        '/ask <question> - Ask SecureAgent a question',
        '/help - Show help information',
        '/clear - Clear conversation history',
      ],
    });
  }

  // POST - Handle Discord interactions
  if (method === 'POST') {
    if (!publicKey) {
      console.error('DISCORD_PUBLIC_KEY not configured');
      return res.status(401).json({ error: 'Bot not configured' });
    }

    // Get raw body for signature verification
    let rawBody: string;
    let interaction: DiscordInteraction;

    try {
      if (typeof req.body === 'string') {
        rawBody = req.body;
        interaction = JSON.parse(rawBody);
      } else if (req.body && typeof req.body === 'object') {
        rawBody = JSON.stringify(req.body);
        interaction = req.body as DiscordInteraction;
      } else {
        return res.status(400).json({ error: 'Invalid request body' });
      }
    } catch {
      return res.status(400).json({ error: 'Failed to parse request body' });
    }

    // Verify signature
    const signature = req.headers['x-signature-ed25519'] as string;
    const timestamp = req.headers['x-signature-timestamp'] as string;

    if (!signature || !timestamp) {
      return res.status(401).json({ error: 'Missing signature headers' });
    }

    const isValid = await verifyDiscordSignature(signature, timestamp, rawBody, publicKey);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Handle PING (required for Discord verification)
    if (interaction.type === InteractionType.PING) {
      return res.status(200).json({ type: InteractionResponseType.PONG });
    }

    // Handle Application Commands (slash commands)
    if (interaction.type === InteractionType.APPLICATION_COMMAND && interaction.data) {
      const { name, options } = interaction.data;
      const user = interaction.member?.user || interaction.user;
      const userName = user?.global_name || user?.username || 'User';
      const conversationId = `discord:${user?.id || 'unknown'}`;

      if (name === 'help') {
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `**SecureAgent Help**\n\n**Commands:**\n• \`/ask <question>\` - Ask me anything\n• \`/help\` - Show this message\n• \`/clear\` - Clear conversation history\n\n**Features:**\n• Natural conversation with AI\n• Web data fetching\n• Persistent conversation memory\n\nJust use \`/ask\` followed by your question!`,
          },
        });
      }

      if (name === 'clear') {
        conversations.delete(conversationId);
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '🗑️ Conversation history cleared. Start fresh!',
          },
        });
      }

      if (name === 'ask') {
        const question = options?.find(o => o.name === 'question')?.value as string;

        if (!question) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Please provide a question!',
            },
          });
        }

        // Defer the response (AI might take time)
        res.status(200).json({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        });

        // Process with agent and send followup
        try {
          const response = await processWithAgent(question, conversationId, userName);
          await sendFollowupMessage(applicationId!, interaction.token, response);
        } catch (error) {
          console.error('Error processing Discord command:', error);
          await sendFollowupMessage(
            applicationId!,
            interaction.token,
            'Sorry, I encountered an error processing your request.'
          );
        }

        return;
      }
    }

    return res.status(200).json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Unknown command. Try `/help` for available commands.',
      },
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
