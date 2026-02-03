import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Initialize Gemini AI
const genAI = GOOGLE_AI_API_KEY ? new GoogleGenerativeAI(GOOGLE_AI_API_KEY) : null;

// In-memory storage for scheduled messages (in production, use a database)
const scheduledMessages: Map<string, NodeJS.Timeout> = new Map();

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
 * Parse relative time string to milliseconds
 * Supports: 30s, 2m, 5min, 1h, 2hr, 1d
 */
function parseRelativeTime(timeStr: string): number | null {
  const match = timeStr.match(/^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (unit.startsWith('s')) return value * 1000;
  if (unit.startsWith('m')) return value * 60 * 1000;
  if (unit.startsWith('h')) return value * 60 * 60 * 1000;
  if (unit.startsWith('d')) return value * 24 * 60 * 60 * 1000;

  return null;
}

/**
 * Format milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)} segundos`;
  if (ms < 3600000) return `${Math.round(ms / 60000)} minutos`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)} horas`;
  return `${Math.round(ms / 86400000)} días`;
}

/**
 * Schedule a message
 */
function scheduleMessage(chatId: number, delayMs: number, message: string): string {
  const id = `${chatId}-${Date.now()}`;

  const timeout = setTimeout(async () => {
    await sendMessage(chatId, `⏰ *Recordatorio:*\n${message}`);
    scheduledMessages.delete(id);
  }, delayMs);

  scheduledMessages.set(id, timeout);
  return id;
}

/**
 * Generate AI response using Gemini
 */
async function generateAIResponse(text: string, userName: string): Promise<string> {
  if (!genAI) {
    return `Lo siento, el servicio de IA no está configurado. Por favor contacta al administrador.`;
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const systemPrompt = `Eres SecureAgent, un asistente de IA amigable y útil.
Responde de forma concisa y natural en el mismo idioma que el usuario.
Tu personalidad es amigable, profesional y un poco divertida.
Puedes ayudar con:
- Programar recordatorios (usando /schedule)
- Responder preguntas generales
- Dar información útil
- Contar chistes y entretener
- Ayudar con tareas del día a día

El usuario se llama ${userName || 'amigo'}.
Mantén las respuestas cortas (máximo 2-3 párrafos) a menos que se pida más detalle.`;

    const result = await model.generateContent([
      { text: systemPrompt },
      { text: `Usuario: ${text}` }
    ]);

    const response = result.response.text();
    return response || 'Lo siento, no pude generar una respuesta.';
  } catch (error) {
    console.error('[Telegram] AI error:', error);
    return `Lo siento, hubo un error al procesar tu mensaje. Por favor intenta de nuevo.`;
  }
}

/**
 * Process a message and generate a response
 */
async function processMessage(text: string, userId: number, userName: string, chatId: number): Promise<string> {
  const lowerText = text.toLowerCase().trim();

  // Handle /start command
  if (lowerText === '/start') {
    return `👋 ¡Hola ${userName || 'amigo'}! Soy *SecureAgent*, tu asistente de IA.

Puedo ayudarte con:
📅 *Recordatorios* - \`/schedule 5m Revisar el horno\`
🔍 *Preguntas* - Pregúntame lo que quieras
💬 *Chat* - ¡Conversemos!

Escribe /help para ver todos los comandos.`;
  }

  // Handle /help command
  if (lowerText === '/help') {
    return `*Comandos de SecureAgent*

/start - Mensaje de bienvenida
/help - Mostrar esta ayuda
/status - Estado del bot
/schedule <tiempo> <mensaje> - Programar recordatorio

*Ejemplos de /schedule:*
• \`/schedule 2m Revisar el café\`
• \`/schedule 30s Prueba rápida\`
• \`/schedule 1h Llamar a mamá\`

*Tiempos soportados:*
• \`30s\` - 30 segundos
• \`5m\` o \`5min\` - 5 minutos
• \`1h\` o \`1hr\` - 1 hora
• \`1d\` - 1 día

¡También puedes escribirme naturalmente y responderé con IA! 🤖`;
  }

  // Handle /status command
  if (lowerText === '/status') {
    const aiStatus = genAI ? '✅ Conectado (Gemini 1.5 Flash)' : '❌ No configurado';
    return `✅ *Estado de SecureAgent*

🤖 Bot: En línea
🧠 IA: ${aiStatus}
👤 Usuario: \`${userId}\`
⏰ Hora: ${new Date().toLocaleString('es-ES')}
📋 Recordatorios activos: ${scheduledMessages.size}

¡Todo funcionando! 🚀`;
  }

  // Handle /schedule command
  if (lowerText.startsWith('/schedule')) {
    const args = text.slice(9).trim();
    const spaceIndex = args.indexOf(' ');

    if (spaceIndex === -1) {
      return `❌ Formato: \`/schedule <tiempo> <mensaje>\`

*Ejemplos:*
• \`/schedule 2m Revisar el horno\`
• \`/schedule 30s Prueba\`
• \`/schedule 1h Llamar al doctor\``;
    }

    const timeStr = args.slice(0, spaceIndex);
    const message = args.slice(spaceIndex + 1).trim();

    if (!message) {
      return `❌ Debes incluir un mensaje para el recordatorio.`;
    }

    const delayMs = parseRelativeTime(timeStr);
    if (!delayMs) {
      return `❌ Tiempo no válido: \`${timeStr}\`

*Formatos válidos:*
• \`30s\` - segundos
• \`5m\` o \`5min\` - minutos
• \`1h\` o \`1hr\` - horas
• \`1d\` - días`;
    }

    // Limit to 24 hours for in-memory storage
    if (delayMs > 24 * 60 * 60 * 1000) {
      return `❌ El tiempo máximo es 24 horas (1d).`;
    }

    scheduleMessage(chatId, delayMs, message);
    const durationStr = formatDuration(delayMs);

    return `✅ *Recordatorio programado*

📝 ${message}
⏰ En ${durationStr}

Te avisaré cuando sea el momento. 🔔`;
  }

  // For all other messages, use AI
  return await generateAIResponse(text, userName);
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
    ai: !!GOOGLE_AI_API_KEY ? 'gemini-1.5-flash' : 'not configured',
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
      const response = await processMessage(text, userId, userName, chatId);
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
        await sendMessage(chatId, `Seleccionaste: ${data}`);
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
