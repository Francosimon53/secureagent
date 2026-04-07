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
import {
  addClient,
  listClients,
  findClientsByName,
  getClientByName,
  removeClient,
  detectClientInText,
  buildClientContext,
} from './lib/client-store.js';

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
  voice?: { file_id: string; file_unique_id: string; duration: number; mime_type?: string; file_size?: number };
  audio?: { file_id: string; file_unique_id: string; duration: number; mime_type?: string; file_size?: number; title?: string };
  video_note?: { file_id: string; file_unique_id: string; duration: number; length: number; file_size?: number };
  caption?: string;
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
  // Also clean up stale addclient flows
  addClientFlows.forEach((flow, key) => {
    if (flow.startedAt < oneHourAgo) {
      addClientFlows.delete(key);
    }
  });
}

// =============================================================================
// Client Memory — Conversational Flow State
// =============================================================================

interface AddClientFlow {
  step: 'age' | 'diagnosis' | 'goals' | 'insurance';
  name: string;
  age?: number;
  diagnosis?: string;
  goals?: string;
  startedAt: number;
}

const addClientFlows = new Map<string, AddClientFlow>();

/** Pending removal confirmations keyed by chatId */
const removeConfirmations = new Map<string, string>(); // chatId → client name

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
// Motor Brain Integration (ABA Clinical AI)
// =============================================================================

const MOTOR_BRAIN_URL =
  process.env.MOTOR_BRAIN_URL ?? 'https://abasensei-motor-brain-production.up.railway.app';
const MOTOR_BRAIN_TIMEOUT = Number(process.env.MOTOR_BRAIN_TIMEOUT) || 45000;

/** Strip markdown formatting from LLM output for clean Telegram plain text. */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_{2}(.*?)_{2}/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/`{3}[\s\S]*?`{3}/g, m =>
      m.replace(/^`{3}\w*\n?/, '').replace(/\n?`{3}$/, ''))
    .replace(/`([^`]+)`/g, '$1');
}

/** Detect ABA session type from user input for SOAP note generation. */
function detectSessionType(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(dtt|discrete trial|trials)\b/.test(lower)) return 'DTT';
  if (/\b(net|natural environment|naturalistic)\b/.test(lower)) return 'NET';
  if (/\b(parent|caregiver|training|guardian)\b/.test(lower)) return 'PARENT_TRAINING';
  if (/\b(supervision|supervised|rbt supervision)\b/.test(lower)) return 'SUPERVISION';
  return 'GENERAL';
}

/** Build a SOAP note prompt from session details. */
function buildSoapPrompt(userText: string): string {
  const sessionType = detectSessionType(userText);
  const headers: Record<string, string> = {
    DTT: 'Discrete Trial Training',
    NET: 'Natural Environment Teaching',
    PARENT_TRAINING: 'Caregiver Training',
    SUPERVISION: 'RBT Supervision',
    GENERAL: 'ABA Therapy Session',
  };
  return `You are a clinical documentation assistant for ABA therapy. Generate a SOAP note for a ${headers[sessionType]} session. Structure with S (Subjective), O (Objective), A (Assessment), P (Plan) sections. Use ABA terminology. Use [Client] as placeholder for patient name. Output PLAIN TEXT only - no markdown. Make it insurance-ready: specific, measurable, clinically justified. Session details from the BCBA: ${userText}`;
}

/** Call Motor Brain /consulta endpoint. */
async function callMotorBrain(texto: string): Promise<string> {
  const apiKey = process.env.MOTOR_BRAIN_API_KEY;
  if (!apiKey) {
    throw new Error('MOTOR_BRAIN_API_KEY not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MOTOR_BRAIN_TIMEOUT);

  try {
    const res = await fetch(`${MOTOR_BRAIN_URL}/consulta`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ texto }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Motor Brain API error (${res.status}): ${errorText}`);
    }

    const data = await res.json() as { respuesta: string };
    return data.respuesta;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`Motor Brain request timed out after ${MOTOR_BRAIN_TIMEOUT}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Handle /aba command — route to Motor Brain. */
async function handleAbaCommand(
  chatId: string,
  args: string,
  botToken: string
): Promise<void> {
  if (!args.trim()) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: 'Usage: /aba <your ABA question>\n\nExample: /aba what is manding in ABA?',
    });
    return;
  }

  await telegramRequest(botToken, 'sendChatAction', { chat_id: chatId, action: 'typing' });

  try {
    const raw = await callMotorBrain(args);
    const response = stripMarkdown(raw);
    await telegramRequest(botToken, 'sendMessage', { chat_id: chatId, text: response });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Motor Brain error:', errorMsg);
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `ABA Assistant error: ${errorMsg}\n\nPlease try again or send a regular message for the general assistant.`,
    });
  }
}

/** Handle /nota and /soap commands — generate SOAP note via Motor Brain. */
async function handleNotaCommand(
  chatId: string,
  userId: number,
  args: string,
  botToken: string
): Promise<void> {
  if (!args.trim()) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: 'Usage: /nota <session details>\n\nExample: /nota DTT session with Juan, worked on manding, 15/20 correct trials',
    });
    return;
  }

  await telegramRequest(botToken, 'sendChatAction', { chat_id: chatId, action: 'typing' });

  try {
    // Detect client in text and prepend context
    let enrichedArgs = args;
    try {
      const { client, ambiguous } = await detectClientInText(userId, args);
      if (client) {
        enrichedArgs = buildClientContext(client) + '\n\n' + args;
      } else if (ambiguous && ambiguous.length > 0) {
        const names = ambiguous.map(c => c.name).join(' or ');
        await telegramRequest(botToken, 'sendMessage', {
          chat_id: chatId,
          text: `Multiple clients detected: ${names}. Generating note without client context.`,
        });
      }
    } catch {
      // Client detection failed — proceed without context
    }

    const soapPrompt = buildSoapPrompt(enrichedArgs);
    const raw = await callMotorBrain(soapPrompt);
    const response = stripMarkdown(raw);

    // Split if too long for Telegram
    const maxLength = 4096;
    if (response.length <= maxLength) {
      await telegramRequest(botToken, 'sendMessage', { chat_id: chatId, text: response });
    } else {
      let remaining = response;
      while (remaining.length > 0) {
        await telegramRequest(botToken, 'sendMessage', {
          chat_id: chatId,
          text: remaining.slice(0, maxLength),
        });
        remaining = remaining.slice(maxLength);
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Motor Brain SOAP error:', errorMsg);
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `ABA Assistant error: ${errorMsg}\n\nPlease try again or send a regular message for the general assistant.`,
    });
  }
}

// =============================================================================
// Voice Note Support (Whisper Transcription)
// =============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/** Download a file from Telegram and transcribe it via OpenAI Whisper. */
async function transcribeAudio(botToken: string, fileId: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  // Step 1: Get file path from Telegram
  const fileInfo = await telegramRequest(botToken, 'getFile', { file_id: fileId }) as {
    file_id: string;
    file_path: string;
  };

  // Step 2: Download the file
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;
  const fileResponse = await fetch(fileUrl);
  if (!fileResponse.ok) {
    throw new Error(`Failed to download file from Telegram: ${fileResponse.status}`);
  }
  const fileBuffer = await fileResponse.arrayBuffer();

  // Determine extension from file_path (e.g. "voice/file_123.oga" → "oga")
  const ext = fileInfo.file_path.split('.').pop() || 'ogg';
  const mimeMap: Record<string, string> = {
    oga: 'audio/ogg', ogg: 'audio/ogg', mp3: 'audio/mpeg',
    m4a: 'audio/mp4', wav: 'audio/wav', mp4: 'video/mp4',
  };
  const mimeType = mimeMap[ext] || 'audio/ogg';

  // Step 3: Send to Whisper
  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer], { type: mimeType }), `voice.${ext}`);
  formData.append('model', 'whisper-1');

  const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  });

  if (!whisperResponse.ok) {
    const errText = await whisperResponse.text().catch(() => 'Unknown error');
    throw new Error(`Whisper API error (${whisperResponse.status}): ${errText}`);
  }

  const result = await whisperResponse.json() as { text: string };
  return result.text;
}

/** Detect intent from a voice transcription to route appropriately. */
function detectVoiceCommand(text: string): 'nota' | 'aba' | 'general' {
  const lower = text.toLowerCase().trimStart();
  if (/^(nota|soap|session note|notas de sesi[oó]n)/.test(lower)) return 'nota';
  if (/^(aba|question|pregunta)/.test(lower)) return 'aba';
  // Default: treat voice notes as session dictations (SOAP notes)
  return 'nota';
}

/** Handle a voice/audio/video_note message: transcribe and route to Motor Brain. */
async function handleVoiceMessage(
  chatId: string,
  userId: number,
  fileId: string,
  duration: number,
  botToken: string,
  userName: string,
): Promise<void> {
  // Acknowledge receipt
  await telegramRequest(botToken, 'sendMessage', {
    chat_id: chatId,
    text: '🎙️ Transcribing your voice note...',
  });

  if (duration > 300) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: '⚠️ Long recording detected (>5 min). This may take a moment.',
    });
  }

  try {
    const transcription = await transcribeAudio(botToken, fileId);

    if (!transcription.trim()) {
      await telegramRequest(botToken, 'sendMessage', {
        chat_id: chatId,
        text: 'Could not detect any speech in the voice note. Please try again.',
      });
      return;
    }

    // Show typing while processing
    await telegramRequest(botToken, 'sendChatAction', { chat_id: chatId, action: 'typing' });

    // Detect client in transcription and enrich if it's a nota
    let enrichedTranscription = transcription;
    try {
      const { client } = await detectClientInText(userId, transcription);
      if (client) {
        enrichedTranscription = buildClientContext(client) + '\n\n' + transcription;
      }
    } catch {
      // Client detection failed — proceed without context
    }

    const intent = detectVoiceCommand(transcription);
    let raw: string;

    if (intent === 'nota') {
      const soapPrompt = buildSoapPrompt(enrichedTranscription);
      raw = await callMotorBrain(soapPrompt);
    } else if (intent === 'aba') {
      raw = await callMotorBrain(transcription);
    } else {
      raw = await callMotorBrain(transcription);
    }

    const preview = transcription.length > 100
      ? transcription.slice(0, 100) + '...'
      : transcription;
    const header = `🎙️ Transcribed: "${preview}"\n\n`;
    const response = header + stripMarkdown(raw);

    // Split if too long for Telegram
    const maxLength = 4096;
    if (response.length <= maxLength) {
      await telegramRequest(botToken, 'sendMessage', { chat_id: chatId, text: response });
    } else {
      let remaining = response;
      while (remaining.length > 0) {
        await telegramRequest(botToken, 'sendMessage', {
          chat_id: chatId,
          text: remaining.slice(0, maxLength),
        });
        remaining = remaining.slice(maxLength);
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Voice transcription error:', errorMsg);
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ Voice note error: ${errorMsg}\n\nPlease try again or type your message instead.`,
    });
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

// =============================================================================
// Client Memory Commands
// =============================================================================

/** Handle /addclient command — start conversational flow to add a client. */
async function handleAddClientCommand(
  chatId: string,
  userId: number,
  args: string,
  botToken: string
): Promise<void> {
  const name = args.trim();
  if (!name) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: 'Usage: /addclient <name>\n\nExample: /addclient Maria',
    });
    return;
  }

  // Check if client already exists
  const existing = await getClientByName(userId, name);
  if (existing) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `A client named "${existing.name}" already exists. Use /client ${existing.name} to see details.`,
    });
    return;
  }

  // Start conversational flow
  addClientFlows.set(chatId, { step: 'age', name, startedAt: Date.now() });
  await telegramRequest(botToken, 'sendMessage', {
    chat_id: chatId,
    text: `Adding ${name}. How old is ${name}?`,
  });
}

/** Handle a reply during the /addclient conversational flow. Returns true if handled. */
async function handleAddClientFlow(
  chatId: string,
  userId: number,
  text: string,
  botToken: string
): Promise<boolean> {
  const flow = addClientFlows.get(chatId);
  if (!flow) return false;

  const input = text.trim();

  switch (flow.step) {
    case 'age': {
      const age = parseInt(input, 10);
      if (isNaN(age) || age < 0 || age > 120) {
        await telegramRequest(botToken, 'sendMessage', {
          chat_id: chatId,
          text: 'Please enter a valid age (number).',
        });
        return true;
      }
      flow.age = age;
      flow.step = 'diagnosis';
      await telegramRequest(botToken, 'sendMessage', {
        chat_id: chatId,
        text: 'Diagnosis? (e.g. "ASD Level 2" or type "skip")',
      });
      return true;
    }

    case 'diagnosis': {
      flow.diagnosis = input.toLowerCase() === 'skip' ? undefined : input;
      flow.step = 'goals';
      await telegramRequest(botToken, 'sendMessage', {
        chat_id: chatId,
        text: 'Current treatment goals? (e.g. "manding, tacting, social skills" or type "skip")',
      });
      return true;
    }

    case 'goals': {
      flow.goals = input.toLowerCase() === 'skip' ? undefined : input;
      flow.step = 'insurance';
      await telegramRequest(botToken, 'sendMessage', {
        chat_id: chatId,
        text: 'Insurance provider? (or type "skip")',
      });
      return true;
    }

    case 'insurance': {
      const insurance = input.toLowerCase() === 'skip' ? undefined : input;

      // Save to Supabase
      const client = await addClient(userId, {
        name: flow.name,
        age: flow.age,
        diagnosis: flow.diagnosis,
        current_goals: flow.goals,
        insurance,
      });

      addClientFlows.delete(chatId);

      if (!client) {
        await telegramRequest(botToken, 'sendMessage', {
          chat_id: chatId,
          text: `Failed to save client. Please try again later.`,
        });
        return true;
      }

      // Build confirmation
      const parts = [`${client.name} added!`];
      if (client.age) parts.push(`Age ${client.age}`);
      if (client.diagnosis) parts.push(client.diagnosis);
      if (client.current_goals) parts.push(`Goals: ${client.current_goals}`);
      if (client.insurance) parts.push(client.insurance);

      await telegramRequest(botToken, 'sendMessage', {
        chat_id: chatId,
        text: `✅ ${parts.join('. ')}.`,
      });
      return true;
    }

    default:
      addClientFlows.delete(chatId);
      return false;
  }
}

/** Handle /clients command — list all clients for this BCBA. */
async function handleClientsCommand(
  chatId: string,
  userId: number,
  botToken: string
): Promise<void> {
  const clients = await listClients(userId);

  if (clients.length === 0) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: 'No clients saved yet.\n\nUse /addclient <name> to add one.',
    });
    return;
  }

  let msg = `📋 Your clients (${clients.length}):\n\n`;
  for (const c of clients) {
    const parts = [c.name];
    if (c.age) parts.push(`${c.age}y`);
    if (c.diagnosis) parts.push(c.diagnosis);
    msg += `• ${parts.join(' — ')}\n`;
  }
  msg += '\nUse /client <name> for full details.';

  await telegramRequest(botToken, 'sendMessage', { chat_id: chatId, text: msg });
}

/** Handle /client <name> command — show full details of a specific client. */
async function handleClientDetailCommand(
  chatId: string,
  userId: number,
  args: string,
  botToken: string
): Promise<void> {
  const name = args.trim();
  if (!name) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: 'Usage: /client <name>\n\nExample: /client Maria',
    });
    return;
  }

  const matches = await findClientsByName(userId, name);

  if (matches.length === 0) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `No client found matching "${name}".\n\nUse /clients to see all your clients.`,
    });
    return;
  }

  if (matches.length > 1) {
    const names = matches.map(c => c.name).join(', ');
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `Multiple clients match "${name}": ${names}\n\nPlease be more specific.`,
    });
    return;
  }

  const c = matches[0];
  let msg = `📋 ${c.name}\n\n`;
  if (c.age) msg += `Age: ${c.age}\n`;
  if (c.diagnosis) msg += `Diagnosis: ${c.diagnosis}\n`;
  if (c.current_goals) msg += `Goals: ${c.current_goals}\n`;
  if (c.insurance) msg += `Insurance: ${c.insurance}\n`;
  if (c.hours_authorized) msg += `Hours authorized: ${c.hours_authorized}\n`;
  if (c.notes) msg += `Notes: ${c.notes}\n`;
  msg += `\nAdded: ${new Date(c.created_at).toLocaleDateString()}`;

  await telegramRequest(botToken, 'sendMessage', { chat_id: chatId, text: msg });
}

/** Handle /removeclient <name> command — delete a client after confirmation. */
async function handleRemoveClientCommand(
  chatId: string,
  userId: number,
  args: string,
  botToken: string
): Promise<void> {
  const name = args.trim();
  if (!name) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: 'Usage: /removeclient <name>\n\nExample: /removeclient Maria',
    });
    return;
  }

  const client = await getClientByName(userId, name);
  if (!client) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `No client found named "${name}".\n\nUse /clients to see all your clients.`,
    });
    return;
  }

  removeConfirmations.set(chatId, client.name);
  await telegramRequest(botToken, 'sendMessage', {
    chat_id: chatId,
    text: `Are you sure you want to remove ${client.name}? Reply "yes" to confirm or anything else to cancel.`,
  });
}

/** Handle a pending remove confirmation. Returns true if handled. */
async function handleRemoveConfirmation(
  chatId: string,
  userId: number,
  text: string,
  botToken: string
): Promise<boolean> {
  const pendingName = removeConfirmations.get(chatId);
  if (!pendingName) return false;

  removeConfirmations.delete(chatId);

  if (text.trim().toLowerCase() === 'yes') {
    const success = await removeClient(userId, pendingName);
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: success
        ? `✅ ${pendingName} has been removed.`
        : `Failed to remove ${pendingName}. Please try again.`,
    });
  } else {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: 'Removal cancelled.',
    });
  }
  return true;
}

// =============================================================================
// ARIA Integration State (In-memory for serverless)
// =============================================================================

interface AriaSession {
  email: string;
  connected: boolean;
  lastActivity: number;
}

const ariaSessions = new Map<string, AriaSession>();

/**
 * Handle /aria command - ARIA patient management integration
 * Subcommands:
 *   /aria connect <email> - Connect ARIA account
 *   /aria patients - List recent patients
 *   /aria report <patient> <notes> - Generate report
 */
async function handleAriaCommand(
  chatId: string,
  args: string,
  botToken: string,
  userName: string
): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();

  // Show help if no subcommand
  if (!subcommand) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `🏥 <b>ARIA Integration</b>

Gestiona pacientes y reportes de ARIA desde Telegram.

<b>Comandos:</b>
• <code>/aria connect email@ejemplo.com</code> - Conectar cuenta
• <code>/aria patients</code> - Ver pacientes recientes
• <code>/aria search Nombre</code> - Buscar paciente
• <code>/aria report Nombre notas...</code> - Generar reporte

<b>Lenguaje natural:</b>
También puedes decir cosas como:
• "Genera reporte para Juan García, sesión de hoy"
• "Busca paciente María López"
• "Muéstrame los últimos reportes"`,
      parse_mode: 'HTML',
    });
    return;
  }

  switch (subcommand) {
    case 'connect': {
      const email = parts[1];
      if (!email || !email.includes('@')) {
        await telegramRequest(botToken, 'sendMessage', {
          chat_id: chatId,
          text: `❌ Por favor proporciona un email válido.\n\nUso: <code>/aria connect tu@email.com</code>`,
          parse_mode: 'HTML',
        });
        return;
      }

      // Store connection (in production, would trigger OAuth or password flow)
      ariaSessions.set(chatId, {
        email,
        connected: true,
        lastActivity: Date.now(),
      });

      await telegramRequest(botToken, 'sendMessage', {
        chat_id: chatId,
        text: `✅ <b>ARIA Conectado</b>

Cuenta: <code>${email}</code>

Ahora puedes:
• Buscar pacientes con <code>/aria search</code>
• Generar reportes con <code>/aria report</code>
• O simplemente describir lo que necesitas en lenguaje natural`,
        parse_mode: 'HTML',
      });
      return;
    }

    case 'disconnect': {
      ariaSessions.delete(chatId);
      await telegramRequest(botToken, 'sendMessage', {
        chat_id: chatId,
        text: `✅ Desconectado de ARIA.`,
        parse_mode: 'HTML',
      });
      return;
    }

    case 'patients':
    case 'pacientes': {
      const session = ariaSessions.get(chatId);
      if (!session?.connected) {
        await telegramRequest(botToken, 'sendMessage', {
          chat_id: chatId,
          text: `❌ No estás conectado a ARIA.\n\nUsa <code>/aria connect tu@email.com</code> primero.`,
          parse_mode: 'HTML',
        });
        return;
      }

      // In production, would fetch from ARIA API
      await telegramRequest(botToken, 'sendMessage', {
        chat_id: chatId,
        text: `📋 <b>Pacientes Recientes</b>

Para buscar un paciente específico usa:
<code>/aria search Nombre</code>

O accede al dashboard completo:
🔗 <a href="https://secureagent.vercel.app/dashboard/aria">Ver en Dashboard</a>`,
        parse_mode: 'HTML',
      });
      return;
    }

    case 'search':
    case 'buscar': {
      const session = ariaSessions.get(chatId);
      if (!session?.connected) {
        await telegramRequest(botToken, 'sendMessage', {
          chat_id: chatId,
          text: `❌ No estás conectado a ARIA.\n\nUsa <code>/aria connect tu@email.com</code> primero.`,
          parse_mode: 'HTML',
        });
        return;
      }

      const searchQuery = parts.slice(1).join(' ');
      if (!searchQuery) {
        await telegramRequest(botToken, 'sendMessage', {
          chat_id: chatId,
          text: `❌ Por favor proporciona un nombre para buscar.\n\nUso: <code>/aria search Juan García</code>`,
          parse_mode: 'HTML',
        });
        return;
      }

      await telegramRequest(botToken, 'sendChatAction', {
        chat_id: chatId,
        action: 'typing',
      });

      // In production, would call ARIA API
      await telegramRequest(botToken, 'sendMessage', {
        chat_id: chatId,
        text: `🔍 <b>Buscando: "${searchQuery}"</b>

Esta función requiere conexión completa a ARIA.
Configura las credenciales en el dashboard:
🔗 <a href="https://secureagent.vercel.app/dashboard/aria">Configurar ARIA</a>`,
        parse_mode: 'HTML',
      });
      return;
    }

    case 'report':
    case 'reporte': {
      const session = ariaSessions.get(chatId);
      if (!session?.connected) {
        await telegramRequest(botToken, 'sendMessage', {
          chat_id: chatId,
          text: `❌ No estás conectado a ARIA.\n\nUsa <code>/aria connect tu@email.com</code> primero.`,
          parse_mode: 'HTML',
        });
        return;
      }

      // Parse: /aria report PatientName notes here
      const reportArgs = parts.slice(1).join(' ');
      const notesSeparator = reportArgs.indexOf(',');

      let patientName: string;
      let notes: string;

      if (notesSeparator > 0) {
        patientName = reportArgs.substring(0, notesSeparator).trim();
        notes = reportArgs.substring(notesSeparator + 1).trim();
      } else {
        // Try to extract patient name (first 2-3 words) and rest as notes
        const words = reportArgs.split(/\s+/);
        if (words.length < 3) {
          await telegramRequest(botToken, 'sendMessage', {
            chat_id: chatId,
            text: `❌ Formato incorrecto.

<b>Uso:</b>
<code>/aria report Nombre Paciente, notas de la sesión</code>

<b>Ejemplo:</b>
<code>/aria report Juan García, Sesión de seguimiento. Paciente reporta mejora en síntomas de ansiedad.</code>`,
            parse_mode: 'HTML',
          });
          return;
        }

        // Assume first 2 words are name, rest is notes
        patientName = words.slice(0, 2).join(' ');
        notes = words.slice(2).join(' ');
      }

      await telegramRequest(botToken, 'sendChatAction', {
        chat_id: chatId,
        action: 'typing',
      });

      await telegramRequest(botToken, 'sendMessage', {
        chat_id: chatId,
        text: `✍️ <b>Generando reporte...</b>

📋 Paciente: ${patientName}
📝 Notas: ${notes.substring(0, 100)}${notes.length > 100 ? '...' : ''}

Procesando con IA...`,
        parse_mode: 'HTML',
      });

      // Generate report using AI
      try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          throw new Error('API key not configured');
        }

        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: `Eres un asistente clínico especializado en documentación terapéutica para profesionales de salud mental. Genera reportes profesionales, éticos y bien estructurados en español.

Formato del reporte:
1. Datos de la sesión
2. Motivo de consulta/Seguimiento
3. Observaciones clínicas
4. Intervenciones realizadas
5. Respuesta del paciente
6. Plan de tratamiento
7. Próximos pasos

Mantén un tono profesional y objetivo. Usa terminología clínica apropiada.`,
          messages: [
            {
              role: 'user',
              content: `Genera un reporte de sesión clínica para el siguiente paciente:

Paciente: ${patientName}
Fecha: ${new Date().toLocaleDateString('es-ES')}
Terapeuta: ${userName}

Notas de la sesión:
${notes}

Genera el reporte completo en formato estructurado.`,
            },
          ],
        });

        const textBlock = response.content.find((b) => b.type === 'text');
        const reportContent = textBlock && textBlock.type === 'text' ? textBlock.text : 'Error generando reporte';

        // Send report in chunks if needed
        const maxLength = 4000;
        if (reportContent.length <= maxLength) {
          await telegramRequest(botToken, 'sendMessage', {
            chat_id: chatId,
            text: `📄 <b>Reporte Generado</b>

<b>Paciente:</b> ${patientName}
<b>Fecha:</b> ${new Date().toLocaleDateString('es-ES')}

${reportContent}

---
<i>Revisa y edita el reporte antes de guardarlo en ARIA.</i>
🔗 <a href="https://secureagent.vercel.app/dashboard/aria">Abrir en Dashboard</a>`,
            parse_mode: 'HTML',
          });
        } else {
          // Send header
          await telegramRequest(botToken, 'sendMessage', {
            chat_id: chatId,
            text: `📄 <b>Reporte Generado</b>

<b>Paciente:</b> ${patientName}
<b>Fecha:</b> ${new Date().toLocaleDateString('es-ES')}`,
            parse_mode: 'HTML',
          });

          // Send content in chunks
          let remaining = reportContent;
          while (remaining.length > 0) {
            await telegramRequest(botToken, 'sendMessage', {
              chat_id: chatId,
              text: remaining.slice(0, maxLength),
            });
            remaining = remaining.slice(maxLength);
          }

          // Send footer
          await telegramRequest(botToken, 'sendMessage', {
            chat_id: chatId,
            text: `---
<i>Revisa y edita el reporte antes de guardarlo en ARIA.</i>
🔗 <a href="https://secureagent.vercel.app/dashboard/aria">Abrir en Dashboard</a>`,
            parse_mode: 'HTML',
          });
        }
      } catch (error) {
        console.error('ARIA report generation error:', error);
        await telegramRequest(botToken, 'sendMessage', {
          chat_id: chatId,
          text: `❌ Error generando reporte. Por favor intenta de nuevo.`,
          parse_mode: 'HTML',
        });
      }
      return;
    }

    default:
      await telegramRequest(botToken, 'sendMessage', {
        chat_id: chatId,
        text: `❌ Comando no reconocido: ${subcommand}

Usa <code>/aria</code> para ver los comandos disponibles.`,
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
        { command: 'aba', description: 'Ask the ABA clinical AI assistant' },
        { command: 'nota', description: 'Generate a SOAP session note' },
        { command: 'soap', description: 'Generate a SOAP session note (alias)' },
        { command: 'addclient', description: 'Save a client profile (e.g., /addclient Maria)' },
        { command: 'clients', description: 'List your saved clients' },
        { command: 'client', description: 'View client details (e.g., /client Maria)' },
        { command: 'removeclient', description: 'Remove a client (e.g., /removeclient Maria)' },
        { command: 'schedule', description: 'Schedule a task (e.g., /schedule 9am Check news)' },
        { command: 'tasks', description: 'List your scheduled tasks' },
        { command: 'cancel', description: 'Cancel a scheduled task' },
        { command: 'blog', description: 'Generate a blog post (e.g., /blog generate "AI tips")' },
        { command: 'aria', description: 'ARIA patient management (e.g., /aria report Patient notes)' },
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
      if (!message) {
        return res.status(200).json({ ok: true });
      }

      const chatId = message.chat.id.toString();
      const userName = message.from?.first_name || message.from?.username || 'User';

      const userId = message.from?.id ?? 0;

      // Handle voice/audio/video_note messages
      const voiceFile = message.voice ?? message.audio ?? message.video_note;
      if (voiceFile) {
        await handleVoiceMessage(chatId, userId, voiceFile.file_id, voiceFile.duration, botToken, userName);
        return res.status(200).json({ ok: true });
      }

      if (!message.text) {
        return res.status(200).json({ ok: true });
      }
      const text = message.text;

      // Register/update user for proactive messaging
      registerUser(chatId, {
        username: message.from?.username,
        firstName: message.from?.first_name,
        lastName: message.from?.last_name,
      });

      // Handle conversational flows (addclient, removeclient confirmation)
      if (!text.startsWith('/')) {
        const handledRemove = await handleRemoveConfirmation(chatId, userId, text, botToken);
        if (handledRemove) return res.status(200).json({ ok: true });

        const handledAdd = await handleAddClientFlow(chatId, userId, text, botToken);
        if (handledAdd) return res.status(200).json({ ok: true });
      }

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
• 🧠 <b>ABA clinical questions</b> via Motor Brain
• 📋 <b>SOAP note generation</b> for ABA sessions
• 🎙️ <b>Voice notes</b> — dictate session notes hands-free
• 👤 <b>Client memory</b> — save client profiles for smarter notes
• ⏰ <b>Scheduling tasks</b> to run automatically

<b>ABA Commands:</b>
/aba - Ask the ABA clinical AI
/nota - Generate a SOAP session note
/soap - Same as /nota
🎙️ Voice note → auto-transcribed SOAP note

<b>Client Memory:</b>
/addclient - Save a client profile
/clients - List your clients
/client - View client details

<b>Other Commands:</b>
/schedule - Schedule a task
/tasks - View your scheduled tasks
/cancel - Cancel a scheduled task
/blog - Generate a blog post
/aria - ARIA patient management
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

<b>ABA Clinical Commands:</b>
/aba &lt;question&gt; - Ask the ABA clinical AI
/nota &lt;session details&gt; - Generate a SOAP note
/soap &lt;session details&gt; - Same as /nota
🎙️ Voice note → auto-transcribed SOAP note

<b>Client Memory:</b>
/addclient &lt;name&gt; - Save a client profile
/clients - List your clients
/client &lt;name&gt; - View client details
/removeclient &lt;name&gt; - Remove a client

Mention a client's name in /nota or voice notes and their profile is auto-included in the SOAP note.

<b>General Commands:</b>
/start - Start chatting
/help - Show this message
/schedule - Schedule a task
/tasks - View your scheduled tasks
/cancel - Cancel a scheduled task
/blog - Generate a blog post
/aria - ARIA patient management
/clear - Clear conversation history

<b>Examples:</b>
<code>/addclient Maria</code>
<code>/nota DTT session with Maria, 15/20 correct trials</code>
<code>/aba what is manding in ABA?</code>

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

          case '/aria':
            await handleAriaCommand(chatId, args, botToken, userName);
            return res.status(200).json({ ok: true });

          case '/tasks':
            await handleTasksCommand(chatId, botToken);
            return res.status(200).json({ ok: true });

          case '/cancel':
            await handleCancelCommand(chatId, args, botToken);
            return res.status(200).json({ ok: true });

          case '/nota':
          case '/soap':
            await handleNotaCommand(chatId, userId, args, botToken);
            return res.status(200).json({ ok: true });

          case '/aba':
            await handleAbaCommand(chatId, args, botToken);
            return res.status(200).json({ ok: true });

          case '/addclient':
            await handleAddClientCommand(chatId, userId, args, botToken);
            return res.status(200).json({ ok: true });

          case '/clients':
            await handleClientsCommand(chatId, userId, botToken);
            return res.status(200).json({ ok: true });

          case '/client':
            await handleClientDetailCommand(chatId, userId, args, botToken);
            return res.status(200).json({ ok: true });

          case '/removeclient':
            await handleRemoveClientCommand(chatId, userId, args, botToken);
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
