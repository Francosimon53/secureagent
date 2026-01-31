/**
 * Telegram Webhook API Endpoint
 *
 * Receives webhook updates from Telegram, processes them through the SecureAgent,
 * and sends responses back to the user.
 *
 * Setup:
 * 1. Get a bot token from @BotFather on Telegram
 * 2. Set TELEGRAM_BOT_TOKEN environment variable
 * 3. Set webhook: curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-domain.vercel.app/api/telegram"
 *
 * Endpoints:
 * - POST /api/telegram - Receive webhook updates from Telegram
 * - GET /api/telegram - Setup instructions and webhook status
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// Telegram Types
// =============================================================================

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  date: number;
  chat: TelegramChat;
  text?: string;
  reply_to_message?: TelegramMessage;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

// =============================================================================
// Conversation Memory (In-memory for serverless)
// =============================================================================

interface ConversationState {
  messages: Anthropic.MessageParam[];
  lastUpdated: number;
}

const conversations = new Map<string, ConversationState>();

// Clean up old conversations (older than 1 hour)
function cleanupConversations(): void {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [key, state] of conversations.entries()) {
    if (state.lastUpdated < oneHourAgo) {
      conversations.delete(key);
    }
  }
}

// =============================================================================
// Telegram API Helper
// =============================================================================

async function telegramRequest(
  botToken: string,
  method: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await response.json() as { ok: boolean; result?: unknown; description?: string };

  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description}`);
  }

  return data.result;
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

    // Security: Block localhost and internal IPs
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
  chatId: string,
  userName: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return "I'm sorry, but I'm not properly configured. Please ask the administrator to set up the ANTHROPIC_API_KEY.";
  }

  const client = new Anthropic({ apiKey });

  // Get or create conversation
  let conversation = conversations.get(chatId);
  if (!conversation) {
    conversation = { messages: [], lastUpdated: Date.now() };
    conversations.set(chatId, conversation);
  }

  conversation.messages.push({ role: 'user', content: userMessage });
  conversation.lastUpdated = Date.now();

  // Clean up old conversations periodically
  if (Math.random() < 0.1) {
    cleanupConversations();
  }

  // Keep only last 20 messages for context
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
        system: `You are SecureAgent, a helpful AI assistant available on Telegram. You're chatting with ${userName}.

Be concise since this is a chat interface - keep responses under 300 words unless detailed explanation is needed.
You can use tools to fetch data from the internet when helpful.
Be friendly and helpful. Use emojis sparingly but appropriately.

Current time: ${new Date().toISOString()}`,
        messages: conversation.messages,
        tools: AVAILABLE_TOOLS,
      });

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) {
        break;
      }

      // Execute tools
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

      // Add to conversation
      conversation.messages.push({ role: 'assistant', content: response.content });
      conversation.messages.push({ role: 'user', content: toolResults });
    }

    // Extract text response
    const textBlocks = response!.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    const responseText = textBlocks.map(b => b.text).join('\n');

    // Add final response to conversation
    conversation.messages.push({ role: 'assistant', content: response!.content });

    return responseText || "I processed your request but don't have anything to say.";
  } catch (error) {
    console.error('Agent error:', error);
    return "I encountered an error processing your message. Please try again.";
  }
}

// =============================================================================
// Webhook Handler
// =============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;

  // GET - Return setup instructions
  if (method === 'GET') {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const hasToken = !!botToken;
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

    // Get webhook info if token is set
    let webhookInfo = null;
    if (botToken) {
      try {
        webhookInfo = await telegramRequest(botToken, 'getWebhookInfo');
      } catch {
        // Ignore errors
      }
    }

    return res.status(200).json({
      name: 'SecureAgent Telegram Bot',
      version: '1.0.0',
      status: {
        botTokenConfigured: hasToken,
        apiKeyConfigured: hasApiKey,
        ready: hasToken && hasApiKey,
        webhookInfo,
      },
      setup: {
        step1: 'Create a bot with @BotFather on Telegram',
        step2: 'Get the bot token from @BotFather',
        step3: 'Set TELEGRAM_BOT_TOKEN environment variable in Vercel',
        step4: 'Set ANTHROPIC_API_KEY environment variable in Vercel',
        step5: 'Register webhook with Telegram:',
        webhookCommand: `curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://<YOUR_DOMAIN>/api/telegram"`,
      },
      botFatherCommands: [
        '/newbot - Create a new bot',
        '/mybots - Manage your existing bots',
        '/setdescription - Set bot description',
        '/setabouttext - Set bot "About" text',
        '/setcommands - Set bot commands',
      ],
      suggestedCommands: [
        { command: 'start', description: 'Start chatting with SecureAgent' },
        { command: 'help', description: 'Show help message' },
        { command: 'clear', description: 'Clear conversation history' },
      ],
    });
  }

  // POST - Handle webhook update
  if (method === 'POST') {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN not configured');
      return res.status(200).json({ ok: true }); // Always return 200 to Telegram
    }

    try {
      // Parse body - wrap in try-catch for Vercel dev server compatibility
      let update: TelegramUpdate;
      try {
        const rawBody = req.body;
        if (typeof rawBody === 'string') {
          update = JSON.parse(rawBody);
        } else if (rawBody && typeof rawBody === 'object') {
          update = rawBody as TelegramUpdate;
        } else {
          return res.status(200).json({ ok: true });
        }
      } catch {
        console.error('Failed to parse request body');
        return res.status(200).json({ ok: true });
      }

      // Process message
      const message = update.message ?? update.edited_message;
      if (!message || !message.text) {
        return res.status(200).json({ ok: true });
      }

      const chatId = message.chat.id.toString();
      const userName = message.from?.first_name || message.from?.username || 'User';
      const text = message.text;

      // Handle commands
      if (text.startsWith('/')) {
        const command = text.split(' ')[0].toLowerCase();

        if (command === '/start') {
          await telegramRequest(botToken, 'sendMessage', {
            chat_id: chatId,
            text: `👋 Hi ${userName}! I'm SecureAgent, your AI assistant.\n\nI can help you with:\n• Answering questions\n• Fetching data from the web\n• Having conversations\n\nJust send me a message to get started!`,
            parse_mode: 'HTML',
          });
          return res.status(200).json({ ok: true });
        }

        if (command === '/help') {
          await telegramRequest(botToken, 'sendMessage', {
            chat_id: chatId,
            text: `🤖 <b>SecureAgent Help</b>\n\n<b>Commands:</b>\n/start - Start chatting\n/help - Show this message\n/clear - Clear conversation history\n\n<b>Features:</b>\n• Natural conversation with AI\n• Web data fetching\n• Persistent conversation memory\n\nJust type your message and I'll respond!`,
            parse_mode: 'HTML',
          });
          return res.status(200).json({ ok: true });
        }

        if (command === '/clear') {
          conversations.delete(chatId);
          await telegramRequest(botToken, 'sendMessage', {
            chat_id: chatId,
            text: '🗑️ Conversation history cleared. Start fresh!',
          });
          return res.status(200).json({ ok: true });
        }
      }

      // Send typing indicator
      await telegramRequest(botToken, 'sendChatAction', {
        chat_id: chatId,
        action: 'typing',
      });

      // Process with agent
      const response = await processWithAgent(text, chatId, userName);

      // Send response (split if too long)
      const maxLength = 4096;
      if (response.length <= maxLength) {
        await telegramRequest(botToken, 'sendMessage', {
          chat_id: chatId,
          text: response,
          reply_to_message_id: message.message_id,
        });
      } else {
        // Split into chunks
        const chunks: string[] = [];
        let remaining = response;
        while (remaining.length > 0) {
          chunks.push(remaining.slice(0, maxLength));
          remaining = remaining.slice(maxLength);
        }

        for (const chunk of chunks) {
          await telegramRequest(botToken, 'sendMessage', {
            chat_id: chatId,
            text: chunk,
          });
        }
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Telegram webhook error:', error);
      return res.status(200).json({ ok: true }); // Always return 200 to Telegram
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
