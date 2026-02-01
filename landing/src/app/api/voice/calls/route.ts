/**
 * Voice Calls API - Call History
 *
 * GET /api/voice/calls - Get call history
 */

import { NextRequest, NextResponse } from 'next/server';

// Mock call history for demo
const mockCalls = [
  {
    id: 'call_1',
    direction: 'outbound',
    status: 'completed',
    from: '+15551234567',
    to: '+14155551234',
    startTime: Date.now() - 3600000, // 1 hour ago
    duration: 180,
    aiHandled: true,
    transcription: 'Made a restaurant reservation for 2 at 7pm on Friday.',
    contactName: 'La Piazza Restaurant',
  },
  {
    id: 'call_2',
    direction: 'inbound',
    status: 'completed',
    from: '+14085551234',
    to: '+15551234567',
    startTime: Date.now() - 7200000, // 2 hours ago
    duration: 45,
    aiHandled: true,
    transcription: 'Caller asked about appointment availability. Scheduled for next Tuesday at 2pm.',
    contactName: 'Dr. Smith Office',
  },
  {
    id: 'call_3',
    direction: 'inbound',
    status: 'completed',
    from: '+16505551234',
    to: '+15551234567',
    startTime: Date.now() - 86400000, // 1 day ago
    duration: 30,
    aiHandled: false,
    voicemailUrl: 'https://example.com/voicemail.mp3',
    voicemailTranscription: 'Hi, this is John from the bank. Please call us back regarding your account.',
    contactName: 'Unknown',
  },
  {
    id: 'call_4',
    direction: 'outbound',
    status: 'no-answer',
    from: '+15551234567',
    to: '+14155559876',
    startTime: Date.now() - 90000000, // ~1 day ago
    duration: 0,
    aiHandled: false,
    contactName: 'Mom',
  },
  {
    id: 'call_5',
    direction: 'outbound',
    status: 'completed',
    from: '+15551234567',
    to: '+14155559876',
    startTime: Date.now() - 172800000, // 2 days ago
    duration: 600,
    aiHandled: true,
    transcription: 'Called to wish happy birthday. Had a nice 10 minute conversation.',
    contactName: 'Mom',
  },
];

/**
 * GET /api/voice/calls
 * Get call history
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const direction = searchParams.get('direction');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const aiOnly = searchParams.get('aiOnly') === 'true';

  let calls = [...mockCalls];

  // Filter by direction
  if (direction && direction !== 'all') {
    calls = calls.filter((c) => c.direction === direction);
  }

  // Filter by AI handled
  if (aiOnly) {
    calls = calls.filter((c) => c.aiHandled);
  }

  // Sort by most recent
  calls.sort((a, b) => b.startTime - a.startTime);

  // Limit
  calls = calls.slice(0, limit);

  return NextResponse.json({
    calls,
    total: mockCalls.length,
  });
}
