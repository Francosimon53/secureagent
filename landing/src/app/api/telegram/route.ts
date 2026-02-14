import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Types
interface TelegramMessage {
  message_id: number;
  from?: { id: number; first_name: string; username?: string };
  chat: { id: number; type: string };
  text?: string;
  date: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// Conversation memory
const conversations = new Map<number, Anthropic.MessageParam[]>();

// Same tools as chat API
const TOOLS: Anthropic.Tool[] = [
  { name: 'calculate', description: 'Math calculations', input_schema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } },
  { name: 'get_weather', description: 'Get weather', input_schema: { type: 'object', properties: { city: { type: 'string' }, country: { type: 'string' } }, required: ['city'] } },
  { name: 'convert_currency', description: 'Convert currency', input_schema: { type: 'object', properties: { amount: { type: 'number' }, from: { type: 'string' }, to: { type: 'string' } }, required: ['amount', 'from', 'to'] } },
  { name: 'web_search', description: 'Search Wikipedia', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'http_request', description: 'HTTP request', input_schema: { type: 'object', properties: { url: { type: 'string' }, method: { type: 'string' } }, required: ['url'] } },
  { name: 'get_datetime', description: 'Get date/time', input_schema: { type: 'object', properties: { timezone: { type: 'string' } }, required: [] } },
];

// Tool execution (simplified versions)
async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'calculate') {
    try {
      const expr = (args.expression as string)
        .replace(/\bsqrt\(/g, 'Math.sqrt(')
        .replace(/\bpow\(/g, 'Math.pow(')
        .replace(/\bpi\b/gi, 'Math.PI');
      return { result: new Function('Math', `return (${expr})`)(Math) };
    } catch (e) { return { error: (e as Error).message }; }
  }
  
  if (name === 'get_weather') {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.city as string)}&count=1`;
    const geo = await (await fetch(geoUrl)).json();
    if (!geo.results?.[0]) return { error: 'City not found' };
    const { latitude, longitude, name: cityName, country } = geo.results[0];
    const weather = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`)).json();
    return { location: `${cityName}, ${country}`, temp: `${weather.current.temperature_2m}°C` };
  }
  
  if (name === 'convert_currency') {
    const url = `https://api.frankfurter.app/latest?amount=${args.amount}&from=${(args.from as string).toUpperCase()}&to=${(args.to as string).toUpperCase()}`;
    const data = await (await fetch(url)).json();
    return { amount: args.amount, from: args.from, to: args.to, result: data.rates?.[(args.to as string).toUpperCase()] };
  }
  
  if (name === 'web_search') {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(args.query as string)}&format=json&srlimit=3&origin=*`;
    const data = await (await fetch(url)).json();
    return { results: data.query?.search?.map((r: {title: string; snippet: string}) => ({ title: r.title, snippet: r.snippet.replace(/<[^>]*>/g, '') })) || [] };
  }
  
  if (name === 'http_request') {
    const res = await fetch(args.url as string, { method: (args.method as string) || 'GET' });
    const data = await res.json().catch(() => res.text());
    return { status: res.status, data };
  }
  
  if (name === 'get_datetime') {
    const tz = (args.timezone as string) || 'UTC';
    return { datetime: new Date().toLocaleString('en-US', { timeZone: tz }), timezone: tz };
  }
  
  return { error: `Unknown tool: ${name}` };
}

// Send message to Telegram
async function sendMessage(chatId: number, text: string, token: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!botToken || !apiKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }
  
  const update: TelegramUpdate = await request.json();
  const message = update.message;
  
  if (!message?.text) {
    return NextResponse.json({ ok: true });
  }
  
  const chatId = message.chat.id;
  const userText = message.text;
  
  // Handle /start
  if (userText === '/start') {
    await sendMessage(chatId, '👋 ¡Hola! Soy SecureAgent.\n\nPuedo ayudarte con:\n• Cálculos matemáticos\n• Clima de cualquier ciudad\n• Conversión de monedas\n• Búsqueda de información\n• Y más!\n\nEscríbeme cualquier pregunta.', botToken);
    return NextResponse.json({ ok: true });
  }
  
  try {
    const anthropic = new Anthropic({ apiKey });
    const messages: Anthropic.MessageParam[] = conversations.get(chatId) || [];
    messages.push({ role: 'user', content: userText });
    
    // Limit history
    if (messages.length > 20) messages.splice(0, messages.length - 20);
    
    let response: Anthropic.Message;
    let turns = 0;
    
    while (turns < 5) {
      turns++;
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: 'You are SecureAgent on Telegram. Be concise. Use tools when helpful. Respond in the user\'s language.',
        messages,
        tools: TOOLS,
      });
      
      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (toolUses.length === 0) break;
      
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tool of toolUses) {
        const result = await executeTool(tool.name, tool.input as Record<string, unknown>);
        results.push({ type: 'tool_result', tool_use_id: tool.id, content: JSON.stringify(result) });
      }
      
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: results });
    }
    
    const text = response!.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n');
    messages.push({ role: 'assistant', content: response!.content });
    conversations.set(chatId, messages);
    
    await sendMessage(chatId, text || 'No response', botToken);
    
  } catch (error) {
    console.error('Telegram error:', error);
    await sendMessage(chatId, '❌ Error processing request', botToken);
  }
  
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const hasToken = !!process.env.TELEGRAM_BOT_TOKEN;
  return NextResponse.json({
    status: hasToken ? 'configured' : 'missing TELEGRAM_BOT_TOKEN',
    webhook: 'POST /api/telegram',
    setup: 'Set TELEGRAM_BOT_TOKEN env var, then: curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://secureagent.app/api/telegram"',
  });
}
