import { NextRequest, NextResponse } from 'next/server';

// Reference to shared store - in production, use database
const pendingReplies = new Map<string, {
  id: string;
  platform: string;
  interactionId: string;
  status: 'pending' | 'approved' | 'rejected' | 'sent';
  rejectedAt?: number;
  rejectionReason?: string;
}>();

/**
 * POST /api/social/replies/reject
 * Reject a pending reply
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { replyId, reason } = body;

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
    reply.status = 'rejected';
    reply.rejectedAt = Date.now();
    if (reason) {
      reply.rejectionReason = reason;
    }

    pendingReplies.set(replyId, reply);

    return NextResponse.json({
      success: true,
      message: 'Reply rejected',
      reply: {
        id: reply.id,
        status: reply.status,
        rejectedAt: reply.rejectedAt,
      },
    });
  } catch (error) {
    console.error('Error rejecting reply:', error);
    return NextResponse.json(
      { error: 'Failed to reject reply' },
      { status: 500 }
    );
  }
}
