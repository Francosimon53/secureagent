import { NextResponse } from 'next/server';

export async function GET() {
  const status = {
    name: 'SecureAgent',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    
    ai: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
    },
    
    channels: {
      web: true, // Always available
      telegram: !!process.env.TELEGRAM_BOT_TOKEN,
      discord: !!process.env.DISCORD_PUBLIC_KEY,
    },
    
    tools: [
      'calculate',
      'get_weather',
      'convert_currency',
      'web_search',
      'http_request',
      'run_code',
      'get_datetime',
      'analyze_text',
      'parse_url',
      'generate_qr',
      'json_parse',
      'base64_encode',
      'base64_decode',
      'compute_hash',
      'generate_uuid',
      'get_timestamp',
    ],
    
    endpoints: {
      chat: '/api/chat',
      telegram: '/api/telegram',
      discord: '/api/discord',
      status: '/api/status',
    },
    
    documentation: 'https://secureagent.app/docs',
  };
  
  return NextResponse.json(status);
}
