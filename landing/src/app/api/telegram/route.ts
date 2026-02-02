import { NextRequest, NextResponse } from 'next/server';

// Telegram webhook endpoint
// In production, this would handle incoming messages from Telegram

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'telegram',
    configured: !!process.env.TELEGRAM_BOT_TOKEN,
    message: 'Telegram webhook endpoint ready',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Verify webhook is from Telegram (in production, verify secret token)
    if (!body.message && !body.callback_query) {
      return NextResponse.json({ ok: true });
    }

    // Log incoming message (in production, process and respond)
    console.log('[Telegram] Received webhook:', JSON.stringify(body).slice(0, 200));

    // In production, this would:
    // 1. Verify the request is from Telegram
    // 2. Parse the message/callback
    // 3. Process with AI agent
    // 4. Send response back to user

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram] Webhook error:', error);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
