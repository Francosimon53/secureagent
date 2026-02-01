import { NextRequest, NextResponse } from 'next/server';

// Reference to shared store - in production, use database
// Import from pending route in a real implementation
const pendingReplies = new Map<string, {
  id: string;
  platform: string;
  interactionId: string;
  postId?: string;
  authorUsername: string;
  authorDisplayName?: string;
  authorAvatar?: string;
  content: string;
  suggestedReply: string;
  editedReply?: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  createdAt: number;
  status: 'pending' | 'approved' | 'rejected' | 'sent';
  approvedAt?: number;
  sentAt?: number;
}>();

/**
 * POST /api/social/replies/approve
 * Approve a pending reply (optionally with edits)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { replyId, editedText } = body;

    if (!replyId) {
      return NextResponse.json(
        { error: 'Reply ID is required' },
        { status: 400 }
      );
    }

    const reply = pendingReplies.get(replyId);
    if (!reply) {
      return NextResponse.json(
        { error: 'Reply not found' },
        { status: 404 }
      );
    }

    if (reply.status !== 'pending') {
      return NextResponse.json(
        { error: `Reply is already ${reply.status}` },
        { status: 400 }
      );
    }

    // Update the reply
    reply.status = 'approved';
    reply.approvedAt = Date.now();
    if (editedText) {
      reply.editedReply = editedText;
    }

    pendingReplies.set(replyId, reply);

    // In production, this would trigger sending the reply via the platform API
    // For now, simulate sending
    setTimeout(() => {
      const r = pendingReplies.get(replyId);
      if (r && r.status === 'approved') {
        r.status = 'sent';
        r.sentAt = Date.now();
        pendingReplies.set(replyId, r);
      }
    }, 1000);

    return NextResponse.json({
      success: true,
      message: 'Reply approved and queued for sending',
      reply: {
        id: reply.id,
        status: reply.status,
        replyText: reply.editedReply || reply.suggestedReply,
        approvedAt: reply.approvedAt,
      },
    });
  } catch (error) {
    console.error('Error approving reply:', error);
    return NextResponse.json(
      { error: 'Failed to approve reply' },
      { status: 500 }
    );
  }
}
