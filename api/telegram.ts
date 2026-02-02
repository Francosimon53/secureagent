/**
 * Telegram Webhook API Endpoint
 *
 * Receives webhook updates from Telegram, processes them through the SecureAgent,
 * and sends responses back to the user.
 *
 * Features:
 * - Natural conversation with AI
 * - Scheduled tasks (/schedule, /tasks, /cancel)
 * - Proactive messaging support
 * - Tool use (web requests, timestamps)
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
import {
  registerUser,
  getUser,
  createTask,
  getUserTasks,
  cancelTask,
  parseSchedule,
  formatSchedule,
  getStats,
  type ScheduledTask,
} from './lib/telegram-store.js';

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
  conversations.forEach((state, key) => {
    if (state.lastUpdated < oneHourAgo) {
      conversations.delete(key);
    }
  });
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

/**
 * Send a message to a Telegram chat (exported for cron jobs)
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: { parseMode?: 'HTML' | 'Markdown'; replyTo?: number }
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;

  try {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode ?? 'HTML',
      reply_to_message_id: options?.replyTo,
    });
    return true;
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    return false;
  }
}

// =============================================================================
// Agent Integration
// =============================================================================

const AVAILABLE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'http_request',
    description: 'Make an HTTP request to fetch data from public APIs or websites',
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
  {
    name: 'web_search',
    description: 'Search the web for information',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
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

  if (name === 'web_search') {
    const query = args.query as string;
    // Simple web search via DuckDuckGo instant answer API
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const response = await fetch(searchUrl);
    const data = await response.json() as { AbstractText?: string; RelatedTopics?: Array<{ Text?: string }> };

    let result = data.AbstractText || '';
    if (!result && data.RelatedTopics?.length) {
      result = data.RelatedTopics.slice(0, 3).map(t => t.Text).filter(Boolean).join('\n\n');
    }
    return result || 'No results found';
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

The user can schedule tasks with you using /schedule command. You can proactively complete tasks for them at scheduled times.

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
// Scheduled Task Commands
// =============================================================================

/**
 * Handle /schedule command
 * Format: /schedule <time> <task>
 * Examples:
 *   /schedule 9:00am Busca noticias de AI y envíame resumen
 *   /schedule monday 8am Revisa mi calendario de la semana
 *   /schedule tomorrow 3pm Recuérdame llamar al doctor
 */
async function handleScheduleCommand(
  chatId: string,
  args: string,
  botToken: string
): Promise<void> {
  if (!args.trim()) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `📅 <b>Schedule a Task</b>

<b>Usage:</b> /schedule &lt;time&gt; &lt;task&gt;

<b>Time formats:</b>
• <code>9:00am</code> - Daily at 9 AM
• <code>monday 8am</code> - Every Monday at 8 AM
• <code>tomorrow 3pm</code> - One-time tomorrow at 3 PM

<b>Examples:</b>
• <code>/schedule 9:00am Busca noticias de AI y envíame resumen</code>
• <code>/schedule monday 8am Revisa mi calendario de la semana</code>
• <code>/schedule tomorrow 3pm Recuérdame llamar al doctor</code>`,
      parse_mode: 'HTML',
    });
    return;
  }

  // Parse time and task from args
  // Try to find where the time ends and task begins
  const timePatterns = [
    /^(\d{1,2}:\d{2}\s*(am|pm)?)/i,
    /^(tomorrow\s+\d{1,2}(:\d{2})?\s*(am|pm)?)/i,
    /^((every\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+\d{1,2}(:\d{2})?\s*(am|pm)?)/i,
    /^(\d{1,2}\s*(am|pm))/i,
  ];

  let timeStr = '';
  let taskStr = args;

  for (const pattern of timePatterns) {
    const match = args.match(pattern);
    if (match) {
      timeStr = match[1];
      taskStr = args.slice(match[0].length).trim();
      break;
    }
  }

  if (!timeStr || !taskStr) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: "❌ Couldn't parse your schedule. Please use format:\n<code>/schedule 9:00am Your task here</code>",
      parse_mode: 'HTML',
    });
    return;
  }

  // Parse the schedule
  const schedule = parseSchedule(timeStr);
  if (!schedule) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: "❌ Couldn't understand the time. Try formats like:\n• <code>9:00am</code>\n• <code>monday 8am</code>\n• <code>tomorrow 3pm</code>",
      parse_mode: 'HTML',
    });
    return;
  }

  // Create the task
  const task = createTask(chatId, taskStr, schedule);

  const scheduleDescription = formatSchedule(schedule);
  const nextRun = new Date(task.nextRunAt).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  await telegramRequest(botToken, 'sendMessage', {
    chat_id: chatId,
    text: `✅ <b>Task Scheduled!</b>

📋 <b>Task:</b> ${taskStr}
⏰ <b>Schedule:</b> ${scheduleDescription}
🔜 <b>Next run:</b> ${nextRun}
🆔 <b>ID:</b> <code>${task.id}</code>

I'll execute this task and send you the results automatically.

To view your tasks: /tasks
To cancel: <code>/cancel ${task.id}</code>`,
    parse_mode: 'HTML',
  });
}

/**
 * Handle /tasks command - List user's scheduled tasks
 */
async function handleTasksCommand(
  chatId: string,
  botToken: string
): Promise<void> {
  const tasks = getUserTasks(chatId);

  if (tasks.length === 0) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `📋 <b>Your Scheduled Tasks</b>

No tasks scheduled yet.

To schedule a task:
<code>/schedule 9:00am Your task here</code>`,
      parse_mode: 'HTML',
    });
    return;
  }

  let message = `📋 <b>Your Scheduled Tasks</b>\n\n`;

  for (const task of tasks) {
    const status = task.enabled ? '✅' : '⏸️';
    const schedule = formatSchedule(task.schedule);
    const nextRun = task.enabled && task.nextRunAt
      ? new Date(task.nextRunAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'N/A';

    message += `${status} <b>${task.id}</b>\n`;
    message += `   📝 ${task.task.substring(0, 50)}${task.task.length > 50 ? '...' : ''}\n`;
    message += `   ⏰ ${schedule}\n`;
    message += `   🔜 Next: ${nextRun}\n`;
    if (task.runCount > 0) {
      message += `   📊 Runs: ${task.runCount}\n`;
    }
    message += '\n';
  }

  message += `To cancel a task: <code>/cancel &lt;id&gt;</code>`;

  await telegramRequest(botToken, 'sendMessage', {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
  });
}

/**
 * Handle /blog command - Generate a blog post
 * Format: /blog generate "Topic"
 */
async function handleBlogCommand(
  chatId: string,
  args: string,
  botToken: string
): Promise<void> {
  const trimmedArgs = args.trim();

  if (!trimmedArgs || !trimmedArgs.toLowerCase().startsWith('generate')) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `📝 <b>Blog Commands</b>

<b>Generate a new blog post:</b>
<code>/blog generate "Your topic here"</code>

<b>Examples:</b>
• <code>/blog generate "Getting started with task automation"</code>
• <code>/blog generate "Top 5 productivity tips with AI"</code>
• <code>/blog generate "How to use voice commands"</code>

The generated post will be published to the SecureAgent blog.`,
      parse_mode: 'HTML',
    });
    return;
  }

  // Extract topic from "generate <topic>" or "generate "<topic>""
  const topicMatch = trimmedArgs.match(/generate\s+["']?(.+?)["']?$/i);
  if (!topicMatch || !topicMatch[1]) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ Please provide a topic.\n\nUsage: <code>/blog generate "Your topic here"</code>`,
      parse_mode: 'HTML',
    });
    return;
  }

  const topic = topicMatch[1].trim().replace(/["']$/, '');

  // Send typing indicator
  await telegramRequest(botToken, 'sendChatAction', {
    chat_id: chatId,
    action: 'typing',
  });

  await telegramRequest(botToken, 'sendMessage', {
    chat_id: chatId,
    text: `✍️ Generating blog post about: "${topic}"\n\nThis may take a moment...`,
    parse_mode: 'HTML',
  });

  try {
    // Call the blog generation API
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/blog/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        secret: process.env.CRON_SECRET,
      }),
    });

    const data = await response.json() as {
      success?: boolean;
      post?: { title: string; slug: string; excerpt: string };
      error?: string;
    };

    if (data.success && data.post) {
      await telegramRequest(botToken, 'sendMessage', {
        chat_id: chatId,
        text: `✅ <b>Blog Post Generated!</b>

📰 <b>${data.post.title}</b>

${data.post.excerpt}

🔗 <a href="https://secureagent.vercel.app/blog/${data.post.slug}">Read the full post</a>`,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      });
    } else {
      await telegramRequest(botToken, 'sendMessage', {
        chat_id: chatId,
        text: `❌ Failed to generate blog post: ${data.error || 'Unknown error'}`,
        parse_mode: 'HTML',
      });
    }
  } catch (error) {
    console.error('Blog generation error:', error);
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ Error generating blog post. Please try again later.`,
      parse_mode: 'HTML',
    });
  }
}

/**
 * Handle /cancel command - Cancel a scheduled task
 */
async function handleCancelCommand(
  chatId: string,
  taskId: string,
  botToken: string
): Promise<void> {
  if (!taskId.trim()) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ Please specify a task ID to cancel.\n\nUsage: <code>/cancel &lt;task_id&gt;</code>\n\nUse /tasks to see your task IDs.`,
      parse_mode: 'HTML',
    });
    return;
  }

  const success = cancelTask(taskId.trim(), chatId);

  if (success) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `✅ Task <code>${taskId}</code> has been cancelled.`,
      parse_mode: 'HTML',
    });
  } else {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ Task not found or you don't have permission to cancel it.\n\nUse /tasks to see your task IDs.`,
      parse_mode: 'HTML',
    });
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

    // Get store stats
    const stats = getStats();

    return res.status(200).json({
      name: 'SecureAgent Telegram Bot',
      version: '2.0.0',
      status: {
        botTokenConfigured: hasToken,
        apiKeyConfigured: hasApiKey,
        ready: hasToken && hasApiKey,
        webhookInfo,
        store: stats,
      },
      setup: {
        step1: 'Create a bot with @BotFather on Telegram',
        step2: 'Get the bot token from @BotFather',
        step3: 'Set TELEGRAM_BOT_TOKEN environment variable in Vercel',
        step4: 'Set ANTHROPIC_API_KEY environment variable in Vercel',
        step5: 'Register webhook with Telegram:',
        webhookCommand: `curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://<YOUR_DOMAIN>/api/telegram"`,
      },
      commands: [
        { command: 'start', description: 'Start chatting with SecureAgent' },
        { command: 'help', description: 'Show help message' },
        { command: 'schedule', description: 'Schedule a task (e.g., /schedule 9am Check news)' },
        { command: 'tasks', description: 'List your scheduled tasks' },
        { command: 'cancel', description: 'Cancel a scheduled task' },
        { command: 'blog', description: 'Generate a blog post (e.g., /blog generate "AI tips")' },
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
      // Parse body
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

      // Register/update user for proactive messaging
      registerUser(chatId, {
        username: message.from?.username,
        firstName: message.from?.first_name,
        lastName: message.from?.last_name,
      });

      // Handle commands
      if (text.startsWith('/')) {
        const [command, ...argParts] = text.split(' ');
        const args = argParts.join(' ');
        const cmd = command.toLowerCase().replace('@', '').split('@')[0]; // Remove bot mention

        switch (cmd) {
          case '/start':
            await telegramRequest(botToken, 'sendMessage', {
              chat_id: chatId,
              text: `👋 Hi ${userName}! I'm SecureAgent, your AI assistant.

I can help you with:
• 💬 Answering questions
• 🌐 Fetching data from the web
• ⏰ <b>Scheduling tasks</b> to run automatically

<b>New!</b> Schedule tasks with:
<code>/schedule 9:00am Search for AI news and send summary</code>

<b>Commands:</b>
/schedule - Schedule a task
/tasks - View your scheduled tasks
/cancel - Cancel a scheduled task
/blog - Generate a blog post
/help - Show help
/clear - Clear conversation

Just send me a message to get started!`,
              parse_mode: 'HTML',
            });
            return res.status(200).json({ ok: true });

          case '/help':
            await telegramRequest(botToken, 'sendMessage', {
              chat_id: chatId,
              text: `🤖 <b>SecureAgent Help</b>

<b>Commands:</b>
/start - Start chatting
/help - Show this message
/schedule - Schedule a task
/tasks - View your scheduled tasks
/cancel - Cancel a scheduled task
/blog - Generate a blog post
/clear - Clear conversation history

<b>Scheduling Tasks:</b>
<code>/schedule 9:00am Your task here</code>
<code>/schedule monday 8am Weekly task</code>
<code>/schedule tomorrow 3pm One-time reminder</code>

<b>Features:</b>
• Natural conversation with AI
• Web data fetching
• Automatic task execution
• Proactive notifications

Just type your message and I'll respond!`,
              parse_mode: 'HTML',
            });
            return res.status(200).json({ ok: true });

          case '/schedule':
            await handleScheduleCommand(chatId, args, botToken);
            return res.status(200).json({ ok: true });

          case '/blog':
            await handleBlogCommand(chatId, args, botToken);
            return res.status(200).json({ ok: true });

          case '/tasks':
            await handleTasksCommand(chatId, botToken);
            return res.status(200).json({ ok: true });

          case '/cancel':
            await handleCancelCommand(chatId, args, botToken);
            return res.status(200).json({ ok: true });

          case '/clear':
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
