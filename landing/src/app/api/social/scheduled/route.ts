import { NextRequest, NextResponse } from 'next/server';

// Shared store reference - in production, use a proper database
// This is a simplified version that returns demo data
const scheduledPosts: Array<{
  id: string;
  content: string;
  platforms: string[];
  scheduledAt: number;
  status: 'scheduled' | 'published' | 'failed';
  media?: { type: string; url: string }[];
}> = [];

/**
 * GET /api/social/scheduled
 * Get all scheduled posts
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const platform = searchParams.get('platform');

    let posts = [...scheduledPosts].filter(p => p.status === 'scheduled');

    // Filter by date range
    if (startDate) {
      const start = new Date(startDate).getTime();
      posts = posts.filter(p => p.scheduledAt >= start);
    }

    if (endDate) {
      const end = new Date(endDate).getTime();
      posts = posts.filter(p => p.scheduledAt <= end);
    }

    // Filter by platform
    if (platform) {
      posts = posts.filter(p => p.platforms.includes(platform));
    }

    // Sort by scheduled time
    posts.sort((a, b) => a.scheduledAt - b.scheduledAt);

    return NextResponse.json({ posts });
  } catch (error) {
    console.error('Error fetching scheduled posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scheduled posts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/social/scheduled
 * Schedule a new post
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, platforms, scheduledAt, media } = body;

    if (!content) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    if (!platforms || platforms.length === 0) {
      return NextResponse.json(
        { error: 'At least one platform is required' },
        { status: 400 }
      );
    }

    if (!scheduledAt) {
      return NextResponse.json(
        { error: 'Scheduled time is required' },
        { status: 400 }
      );
    }

    const scheduledTime = new Date(scheduledAt).getTime();
    if (scheduledTime <= Date.now()) {
      return NextResponse.json(
        { error: 'Scheduled time must be in the future' },
        { status: 400 }
      );
    }

    const post = {
      id: `scheduled_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      content,
      platforms,
      scheduledAt: scheduledTime,
      status: 'scheduled' as const,
      media,
    };

    scheduledPosts.push(post);

    return NextResponse.json({
      success: true,
      post,
    });
  } catch (error) {
    console.error('Error scheduling post:', error);
    return NextResponse.json(
      { error: 'Failed to schedule post' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/social/scheduled
 * Update a scheduled post
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { postId, content, platforms, scheduledAt, media } = body;

    if (!postId) {
      return NextResponse.json(
        { error: 'Post ID is required' },
        { status: 400 }
      );
    }

    const postIndex = scheduledPosts.findIndex(p => p.id === postId);
    if (postIndex === -1) {
      return NextResponse.json(
        { error: 'Scheduled post not found' },
        { status: 404 }
      );
    }

    const post = scheduledPosts[postIndex];

    if (content !== undefined) post.content = content;
    if (platforms !== undefined) post.platforms = platforms;
    if (scheduledAt !== undefined) post.scheduledAt = new Date(scheduledAt).getTime();
    if (media !== undefined) post.media = media;

    scheduledPosts[postIndex] = post;

    return NextResponse.json({
      success: true,
      post,
    });
  } catch (error) {
    console.error('Error updating scheduled post:', error);
    return NextResponse.json(
      { error: 'Failed to update scheduled post' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/social/scheduled
 * Cancel a scheduled post
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { postId } = body;

    if (!postId) {
      return NextResponse.json(
        { error: 'Post ID is required' },
        { status: 400 }
      );
    }

    const postIndex = scheduledPosts.findIndex(p => p.id === postId);
    if (postIndex === -1) {
      return NextResponse.json(
        { error: 'Scheduled post not found' },
        { status: 404 }
      );
    }

    scheduledPosts.splice(postIndex, 1);

    return NextResponse.json({
      success: true,
      message: 'Scheduled post cancelled',
    });
  } catch (error) {
    console.error('Error cancelling scheduled post:', error);
    return NextResponse.json(
      { error: 'Failed to cancel scheduled post' },
      { status: 500 }
    );
  }
}
