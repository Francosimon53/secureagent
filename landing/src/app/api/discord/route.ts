import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Discord interaction types
const INTERACTION_TYPE = { PING: 1, APPLICATION_COMMAND: 2, MESSAGE_COMPONENT: 3 };
const INTERACTION_RESPONSE_TYPE = { PONG: 1, CHANNEL_MESSAGE: 4, DEFERRED_CHANNEL_MESSAGE: 5 };

// Verify Discord signature
async function verifyDiscordRequest(request: Request): Promise<{ valid: boolean; body: unknown }> {
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  
  if (!signature || !timestamp || !publicKey) {
    return { valid: false, body: null };
  }
  
  const body = await request.text();
  
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      hexToBytes(publicKey),
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    
    const isValid = await crypto.subtle.verify(
      'Ed25519',
      key,
      hexToBytes(signature),
      encoder.encode(timestamp + body)
    );
    
    return { valid: isValid, body: JSON.parse(body) };
  } catch {
    return { valid: false, body: null };
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Simple tool execution
async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === 'calculate') {
    try {
      const expr = (args.expression as string).replace(/\bsqrt\(/g, 'Math.sqrt(').replace(/\bpow\(/g, 'Math.pow(');
      return `Result: ${new Function('Math', `return (${expr})`)(Math)}`;
    } catch { return 'Calculation error'; }
  }
  
  if (name === 'weather') {
    const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.city as string)}&count=1`)).json();
    if (!geo.results?.[0]) return 'City not found';
    const { latitude, longitude, name: city, country } = geo.results[0];
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`)).json();
    return `${city}, ${country}: ${w.current.temperature_2m}°C`;
  }
  
  return 'Unknown tool';
}

export async function POST(request: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!publicKey) {
    return NextResponse.json({ error: 'DISCORD_PUBLIC_KEY not configured' }, { status: 503 });
  }
  
  // Verify signature
  const { valid, body } = await verifyDiscordRequest(request);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  const interaction = body as { type: number; data?: { name: string; options?: Array<{ name: string; value: string }> } };
  
  // Handle PING
  if (interaction.type === INTERACTION_TYPE.PING) {
    return NextResponse.json({ type: INTERACTION_RESPONSE_TYPE.PONG });
  }
  
  // Handle slash commands
  if (interaction.type === INTERACTION_TYPE.APPLICATION_COMMAND && interaction.data) {
    const { name, options } = interaction.data;
    
    if (name === 'ask' && apiKey) {
      const question = options?.find(o => o.name === 'question')?.value || '';
      
      try {
        const anthropic = new Anthropic({ apiKey });
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [{ role: 'user', content: question }],
        });
        
        const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n');
        return NextResponse.json({
          type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
          data: { content: text.substring(0, 2000) },
        });
      } catch {
        return NextResponse.json({
          type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
          data: { content: '❌ Error processing request' },
        });
      }
    }
    
    if (name === 'weather') {
      const city = options?.find(o => o.name === 'city')?.value || 'New York';
      const result = await executeTool('weather', { city });
      return NextResponse.json({
        type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
        data: { content: `🌤️ ${result}` },
      });
    }
    
    if (name === 'calc') {
      const expr = options?.find(o => o.name === 'expression')?.value || '1+1';
      const result = await executeTool('calculate', { expression: expr });
      return NextResponse.json({
        type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
        data: { content: `🔢 ${result}` },
      });
    }
  }
  
  return NextResponse.json({
    type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
    data: { content: 'Unknown command' },
  });
}

export async function GET() {
  const hasKey = !!process.env.DISCORD_PUBLIC_KEY;
  return NextResponse.json({
    status: hasKey ? 'configured' : 'missing DISCORD_PUBLIC_KEY',
    commands: [
      { name: 'ask', description: 'Ask SecureAgent anything', options: [{ name: 'question', type: 3, required: true }] },
      { name: 'weather', description: 'Get weather', options: [{ name: 'city', type: 3, required: true }] },
      { name: 'calc', description: 'Calculate', options: [{ name: 'expression', type: 3, required: true }] },
    ],
  });
}
