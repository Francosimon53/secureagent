/**
 * Voice Calls API - Twilio Webhooks
 *
 * POST /api/voice/incoming - Handle incoming calls
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/voice/incoming
 * Twilio webhook for incoming calls
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const event = {
      CallSid: formData.get('CallSid') as string,
      From: formData.get('From') as string,
      To: formData.get('To') as string,
      CallStatus: formData.get('CallStatus') as string,
      Direction: formData.get('Direction') as string,
    };

    console.log('Incoming call webhook:', event);

    // Default response - answer with AI
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Hello, this is SecureAgent. How can I help you today?</Say>
  <Gather input="speech" action="/api/voice/speech" method="POST" speechTimeout="3" language="en-US">
  </Gather>
  <Say voice="Polly.Amy">I didn't catch that. Let me take a message for you.</Say>
  <Record maxLength="120" action="/api/voice/voicemail" transcribe="true" />
</Response>`;

    return new NextResponse(twiml, {
      headers: {
        'Content-Type': 'application/xml',
      },
    });
  } catch (error) {
    console.error('Incoming call error:', error);

    // Return error TwiML
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">I'm sorry, there was an error processing your call. Please try again later.</Say>
  <Hangup />
</Response>`;

    return new NextResponse(errorTwiml, {
      headers: {
        'Content-Type': 'application/xml',
      },
    });
  }
}
