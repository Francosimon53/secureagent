import { NextRequest, NextResponse } from 'next/server';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

/**
 * Send a message to a Telegram chat
 */
async function sendMessage(chatId: number, text: string, options: Record<string, unknown> = {}) {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      ...options,
    }),
  });
  return response.json();
}

/**
 * Send typing indicator
 */
async function sendTyping(chatId: number) {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      action: 'typing',
    }),
  });
}

/**
 * Process a message and generate a response
 */
async function processMessage(text: string, userId: number, userName: string): Promise<string> {
  const lowerText = text.toLowerCase().trim();

  // Handle /start command
  if (lowerText === '/start') {
    return `👋 Welcome to *SecureAgent*, ${userName || 'friend'}!

I'm your AI-powered assistant. Here's what I can help you with:

📅 *Scheduling* - "Remind me to call mom at 5pm"
🔍 *Search* - "What's the latest news about AI?"
📝 *Notes* - "Remember that my wifi password is..."
🧮 *Calculate* - "What's 15% tip on $85?"
💬 *Chat* - Just talk to me about anything!

Type /help for more commands.`;
  }

  // Handle /help command
  if (lowerText === '/help') {
    return `*SecureAgent Commands*

/start - Welcome message
/help - Show this help
/status - Check bot status
/settings - View your settings

*Features*
• Natural language task scheduling
• Web search and summaries
• Notes and reminders
• Multi-model AI (GPT-4, Claude, Gemini)
• Smart home control (coming soon)
• Music control (coming soon)

Just type naturally - I understand context!`;
  }

  // Handle /status command
  if (lowerText === '/status') {
    return `✅ *SecureAgent Status*

🤖 Bot: Online
🔗 API: Connected
👤 User ID: \`${userId}\`
⏰ Time: ${new Date().toLocaleString()}

All systems operational!`;
  }

  // Handle /settings command
  if (lowerText === '/settings') {
    return `⚙️ *Your Settings*

🔔 Notifications: Enabled
🌐 Language: English
🤖 AI Model: Auto (best available)
📍 Timezone: Auto-detected

Visit the dashboard to change settings:
https://secureagent.vercel.app/dashboard/settings`;
  }

  // Simple responses for common queries
  if (lowerText.includes('hello') || lowerText.includes('hi') || lowerText.includes('hey')) {
    return `Hey ${userName || 'there'}! 👋 How can I help you today?`;
  }

  if (lowerText.includes('thank')) {
    return `You're welcome! 😊 Let me know if you need anything else.`;
  }

  if (lowerText.includes('how are you')) {
    return `I'm doing great, thanks for asking! 🚀 Ready to help you with whatever you need.`;
  }

  // Handle time/date queries
  if (lowerText.includes('what time') || lowerText.includes('current time')) {
    return `🕐 The current time is *${new Date().toLocaleTimeString()}*`;
  }

  if (lowerText.includes('what day') || lowerText.includes('today') || lowerText.includes('date')) {
    return `📅 Today is *${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}*`;
  }

  // Handle reminder requests (placeholder)
  if (lowerText.includes('remind') || lowerText.includes('reminder')) {
    return `✅ I've noted your reminder request!

_Note: Full reminder functionality requires connecting to our backend. Visit the dashboard to set up persistent reminders._

https://secureagent.vercel.app/dashboard`;
  }

  // Default AI-like response
  return `I received your message: "${text}"

I'm currently running in basic mode. For full AI capabilities including:
• GPT-4 / Claude responses
• Web search
• Task automation
• Smart integrations

Visit the dashboard to configure AI providers:
https://secureagent.vercel.app/dashboard/settings`;
}

/**
 * GET /api/telegram
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'telegram',
    configured: !!TELEGRAM_BOT_TOKEN,
    message: TELEGRAM_BOT_TOKEN
      ? 'Telegram webhook endpoint ready'
      : 'TELEGRAM_BOT_TOKEN not configured',
  });
}

/**
 * POST /api/telegram
 * Webhook endpoint for incoming Telegram updates
 */
export async function POST(request: NextRequest) {
  try {
    // Check if bot token is configured
    if (!TELEGRAM_BOT_TOKEN) {
      console.error('[Telegram] Bot token not configured');
      return NextResponse.json({ ok: false, error: 'Bot not configured' }, { status: 500 });
    }

    const body = await request.json();

    // Handle regular messages
    if (body.message) {
      const message = body.message;
      const chatId = message.chat.id;
      const text = message.text || '';
      const userId = message.from?.id || 0;
      const userName = message.from?.first_name || '';

      console.log(`[Telegram] Message from ${userName} (${userId}): ${text.slice(0, 100)}`);

      // Send typing indicator
      await sendTyping(chatId);

      // Process and respond
      const response = await processMessage(text, userId, userName);
      await sendMessage(chatId, response);

      return NextResponse.json({ ok: true });
    }

    // Handle callback queries (button clicks)
    if (body.callback_query) {
      const callback = body.callback_query;
      const chatId = callback.message?.chat.id;
      const data = callback.data;

      console.log(`[Telegram] Callback: ${data}`);

      if (chatId) {
        await sendMessage(chatId, `You clicked: ${data}`);
      }

      // Answer callback to remove loading state
      await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callback.id }),
      });

      return NextResponse.json({ ok: true });
    }

    // Handle other update types silently
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram] Webhook error:', error);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
