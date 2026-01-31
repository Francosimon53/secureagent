#!/usr/bin/env npx tsx
/**
 * Discord Bot with @Mention Support
 *
 * This bot connects to Discord's Gateway (WebSocket) to receive messages.
 * It responds to:
 * - @mentions in any channel
 * - Direct messages
 * - Slash commands (if registered)
 *
 * Setup:
 * 1. Set environment variables:
 *    - DISCORD_BOT_TOKEN: Your bot token
 *    - ANTHROPIC_API_KEY: Your Anthropic API key
 *
 * 2. Enable Message Content Intent in Discord Developer Portal:
 *    - Go to your app > Bot > Privileged Gateway Intents
 *    - Enable "MESSAGE CONTENT INTENT"
 *
 * 3. Run the bot:
 *    npx tsx scripts/discord-bot.ts
 *
 * Deployment options:
 * - Run locally: npx tsx scripts/discord-bot.ts
 * - PM2: pm2 start scripts/discord-bot.ts --interpreter="npx tsx"
 * - Docker: See Dockerfile.discord
 * - Railway/Render/Fly.io: Deploy as a worker process
 */

import { Client, GatewayIntentBits, Message, Partials } from 'discord.js';
import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// Configuration
// =============================================================================

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!DISCORD_TOKEN) {
  console.error('Error: DISCORD_BOT_TOKEN environment variable is required');
  process.exit(1);
}

if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is required');
  process.exit(1);
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

// Cleanup every 10 minutes
setInterval(cleanupConversations, 10 * 60 * 1000);

// =============================================================================
// Agent Integration
// =============================================================================

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

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
  let conversation = conversations.get(conversationId);
  if (!conversation) {
    conversation = { messages: [], lastUpdated: Date.now() };
    conversations.set(conversationId, conversation);
  }

  conversation.messages.push({ role: 'user', content: userMessage });
  conversation.lastUpdated = Date.now();

  // Keep only last 20 messages
  if (conversation.messages.length > 20) {
    conversation.messages = conversation.messages.slice(-20);
  }

  try {
    let response: Anthropic.Message;
    let turns = 0;
    const maxTurns = 3;

    while (turns < maxTurns) {
      turns++;

      response = await anthropic.messages.create({
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
// Discord Client
// =============================================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once('ready', () => {
  console.log('━'.repeat(50));
  console.log(`Discord Bot Online!`);
  console.log(`Logged in as: ${client.user?.tag}`);
  console.log(`Bot ID: ${client.user?.id}`);
  console.log(`Servers: ${client.guilds.cache.size}`);
  console.log('━'.repeat(50));
  console.log('Listening for:');
  console.log('  • @mentions in channels');
  console.log('  • Direct messages');
  console.log('━'.repeat(50));
});

client.on('messageCreate', async (message: Message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check if bot was mentioned or if it's a DM
  const isMentioned = message.mentions.has(client.user!);
  const isDM = !message.guild;

  if (!isMentioned && !isDM) return;

  // Get the message content (remove mention if present)
  let content = message.content;
  if (isMentioned) {
    content = content.replace(/<@!?\d+>/g, '').trim();
  }

  // Handle empty messages
  if (!content) {
    await message.reply("Hi! I'm SecureAgent. How can I help you? Just @mention me with your question!");
    return;
  }

  // Handle commands
  const lowerContent = content.toLowerCase();

  if (lowerContent === 'help') {
    await message.reply(
      '**SecureAgent Help**\n\n' +
      '**Usage:**\n' +
      '• `@SecureAgent <message>` - Ask me anything\n' +
      '• DM me directly for private conversations\n' +
      '• `help` - Show this message\n' +
      '• `clear` - Clear conversation history\n\n' +
      '**Features:**\n' +
      '• Natural conversation with AI\n' +
      '• Web data fetching\n' +
      '• Persistent conversation memory'
    );
    return;
  }

  if (lowerContent === 'clear') {
    const conversationId = `discord:${message.author.id}`;
    conversations.delete(conversationId);
    await message.reply('🗑️ Conversation history cleared. Start fresh!');
    return;
  }

  // Show typing indicator
  await message.channel.sendTyping();

  // Process with agent
  const userName = message.author.displayName || message.author.username;
  const conversationId = `discord:${message.author.id}`;

  try {
    const response = await processWithAgent(content, conversationId, userName);

    // Split long responses
    if (response.length > 2000) {
      const chunks: string[] = [];
      let remaining = response;
      while (remaining.length > 0) {
        chunks.push(remaining.slice(0, 2000));
        remaining = remaining.slice(2000);
      }
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } else {
      await message.reply(response);
    }
  } catch (error) {
    console.error('Error processing message:', error);
    await message.reply('Sorry, I encountered an error processing your message.');
  }
});

// Error handling
client.on('error', (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  client.destroy();
  process.exit(0);
});

// Start the bot
console.log('Starting Discord bot...');
client.login(DISCORD_TOKEN);
