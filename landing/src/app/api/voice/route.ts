/**
 * Voice Calls API - Main Routes
 *
 * GET  /api/voice - Get voice settings and status
 * POST /api/voice/call - Make an outbound call
 * POST /api/voice/sms - Send SMS
 */

import { NextRequest, NextResponse } from 'next/server';

// In-memory store for demo purposes
const callHistory: Array<{
  id: string;
  direction: 'inbound' | 'outbound';
  status: string;
  from: string;
  to: string;
  startTime: number;
  duration?: number;
  aiHandled: boolean;
  transcription?: string;
}> = [];

const messageHistory: Array<{
  id: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  body: string;
  timestamp: number;
}> = [];

const voiceSettings = {
  defaultVoiceId: '21m00Tcm4TlvDq8ikWAM',
  useVoiceClone: false,
  voiceCloneId: null,
  speakingRate: 1.0,
  greeting: 'Hello, this is SecureAgent speaking. How can I help you?',
  voicemailGreeting: "Hi, I'm not available right now. Please leave a message after the tone.",
  callScreening: false,
  autoAnswer: false,
  autoAnswerDelay: 5,
  recordAllCalls: false,
  transcribeVoicemails: true,
};

/**
 * GET /api/voice
 * Get voice settings and status
 */
export async function GET() {
  return NextResponse.json({
    settings: voiceSettings,
    stats: {
      totalCalls: callHistory.length,
      inboundCalls: callHistory.filter((c) => c.direction === 'inbound').length,
      outboundCalls: callHistory.filter((c) => c.direction === 'outbound').length,
      aiHandledCalls: callHistory.filter((c) => c.aiHandled).length,
      totalMessages: messageHistory.length,
    },
    configured: true, // Would check Twilio config in production
  });
}

/**
 * POST /api/voice/call
 * Make an outbound call
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, task, useAI, context } = body;

    if (!to) {
      return NextResponse.json(
        { error: 'Phone number required' },
        { status: 400 }
      );
    }

    // Create call record
    const call = {
      id: `call_${Date.now()}`,
      direction: 'outbound' as const,
      status: 'queued',
      from: '+15551234567', // Would be from Twilio config
      to,
      startTime: Date.now(),
      aiHandled: useAI || !!task,
      task,
      context,
    };

    callHistory.push(call);

    // In production, this would call Twilio
    // For demo, we'll simulate the call
    setTimeout(() => {
      const idx = callHistory.findIndex((c) => c.id === call.id);
      if (idx !== -1) {
        callHistory[idx].status = 'completed';
        callHistory[idx].duration = 45;
        if (task) {
          callHistory[idx].transcription = `AI handled: ${task}`;
        }
      }
    }, 2000);

    return NextResponse.json({
      success: true,
      call: {
        id: call.id,
        status: call.status,
        to: call.to,
        aiHandled: call.aiHandled,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
