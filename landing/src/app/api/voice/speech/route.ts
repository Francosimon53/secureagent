/**
 * Voice Calls API - Speech Processing
 *
 * POST /api/voice/speech - Handle speech recognition results
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/voice/speech
 * Handle speech recognition from Twilio Gather
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const callSid = formData.get('CallSid') as string;
    const speechResult = formData.get('SpeechResult') as string;
    const confidence = formData.get('Confidence') as string;

    console.log('Speech result:', { callSid, speechResult, confidence });

    // Process with AI (simplified)
    const response = generateAIResponse(speechResult);

    // Generate TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${escapeXml(response.text)}</Say>
  ${response.endCall
    ? '<Hangup />'
    : `<Gather input="speech" action="/api/voice/speech" method="POST" speechTimeout="3" language="en-US"></Gather>
       <Say voice="Polly.Amy">Are you still there?</Say>
       <Redirect>/api/voice/speech</Redirect>`
  }
</Response>`;

    return new NextResponse(twiml, {
      headers: {
        'Content-Type': 'application/xml',
      },
    });
  } catch (error) {
    console.error('Speech processing error:', error);

    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">I'm sorry, I had trouble understanding. Could you repeat that?</Say>
  <Gather input="speech" action="/api/voice/speech" method="POST" speechTimeout="3" language="en-US"></Gather>
</Response>`;

    return new NextResponse(errorTwiml, {
      headers: {
        'Content-Type': 'application/xml',
      },
    });
  }
}

/**
 * Simple AI response generation
 */
function generateAIResponse(userSpeech: string): { text: string; endCall: boolean } {
  const speech = userSpeech?.toLowerCase() || '';

  // Goodbye detection
  if (speech.match(/(goodbye|bye|thank you|that's all|no thanks)/)) {
    return {
      text: 'Thank you for calling. Have a great day! Goodbye.',
      endCall: true,
    };
  }

  // Appointment scheduling
  if (speech.includes('appointment') || speech.includes('schedule')) {
    return {
      text: "I'd be happy to help schedule an appointment. What date and time works best for you?",
      endCall: false,
    };
  }

  // Leave message
  if (speech.includes('message') || speech.includes('tell them')) {
    return {
      text: "I'll make sure to pass along your message. Is there anything else I can help you with?",
      endCall: false,
    };
  }

  // Default response
  return {
    text: 'I understand. How else can I assist you today?',
    endCall: false,
  };
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
