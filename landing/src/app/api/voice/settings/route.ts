/**
 * Voice Calls API - Settings
 *
 * GET  /api/voice/settings - Get voice settings
 * POST /api/voice/settings - Update voice settings
 */

import { NextRequest, NextResponse } from 'next/server';

// Settings store
let voiceSettings = {
  greeting: 'Hello, this is SecureAgent speaking. How can I help you?',
  voicemailGreeting: "Hi, I'm not available right now. Please leave a message after the tone and I'll get back to you soon.",
  autoAnswer: false,
  autoAnswerDelay: 5,
  callScreening: false,
  recordAllCalls: false,
  transcribeVoicemails: true,
  defaultVoiceId: '21m00Tcm4TlvDq8ikWAM',
  useVoiceClone: false,
  voiceCloneId: null as string | null,
  speakingRate: 1.0,
};

/**
 * GET /api/voice/settings
 */
export async function GET() {
  return NextResponse.json({ settings: voiceSettings });
}

/**
 * POST /api/voice/settings
 * Update settings
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate and update settings
    voiceSettings = {
      ...voiceSettings,
      ...body,
    };

    return NextResponse.json({
      success: true,
      settings: voiceSettings,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
