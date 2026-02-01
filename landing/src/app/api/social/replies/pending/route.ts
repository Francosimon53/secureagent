import { NextRequest, NextResponse } from 'next/server';

// In-memory store for demo - replace with database in production
export const pendingReplies = new Map<string, {
  id: string;
  platform: string;
  interactionId: string;
  postId?: string;
  authorUsername: string;
  authorDisplayName?: string;
  authorAvatar?: string;
  content: string;
  suggestedReply: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  createdAt: number;
  status: 'pending' | 'approved' | 'rejected' | 'sent';
}>();

/**
 * GET /api/social/replies/pending
 * Get all pending auto-replies awaiting approval
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const limit = parseInt(searchParams.get('limit') || '50');

    let replies = Array.from(pendingReplies.values())
      .filter(r => r.status === 'pending');

    // Filter by platform
    if (platform) {
      replies = replies.filter(r => r.platform === platform);
    }

    // Sort by creation time (newest first)
    replies.sort((a, b) => b.createdAt - a.createdAt);

    // Limit results
    replies = replies.slice(0, limit);

    return NextResponse.json({ replies });
  } catch (error) {
    console.error('Error fetching pending replies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pending replies' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/social/replies/pending
 * Add a new pending reply (usually from interaction processing)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      platform,
      interactionId,
      postId,
      authorUsername,
      authorDisplayName,
      authorAvatar,
      content,
      suggestedReply,
      sentiment,
      confidence,
    } = body;

    if (!platform || !interactionId || !content || !suggestedReply) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const reply = {
      id: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      platform,
      interactionId,
      postId,
      authorUsername: authorUsername || 'unknown',
      authorDisplayName,
      authorAvatar,
      content,
      suggestedReply,
      sentiment: sentiment || 'neutral',
      confidence: confidence || 0.7,
      createdAt: Date.now(),
      status: 'pending' as const,
    };

    pendingReplies.set(reply.id, reply);

    return NextResponse.json({
      success: true,
      reply,
    });
  } catch (error) {
    console.error('Error adding pending reply:', error);
    return NextResponse.json(
      { error: 'Failed to add pending reply' },
      { status: 500 }
    );
  }
}
