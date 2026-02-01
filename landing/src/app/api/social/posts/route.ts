import { NextRequest, NextResponse } from 'next/server';

// In-memory store for demo - replace with database in production
const posts = new Map<string, {
  id: string;
  content: {
    text: string;
    media?: { type: string; url: string }[];
    hashtags?: string[];
    link?: string;
  };
  platforms: string[];
  scheduledAt?: number;
  publishedAt?: number;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  platformPosts?: Array<{
    platform: string;
    platformPostId: string;
    url?: string;
    status: string;
  }>;
  createdAt: number;
}>();

/**
 * GET /api/social/posts
 * List all posts (with optional filters)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const platform = searchParams.get('platform');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let allPosts = Array.from(posts.values());

    // Filter by status
    if (status) {
      allPosts = allPosts.filter(p => p.status === status);
    }

    // Filter by platform
    if (platform) {
      allPosts = allPosts.filter(p => p.platforms.includes(platform));
    }

    // Sort by scheduled/created date
    allPosts.sort((a, b) => {
      const dateA = a.scheduledAt || a.createdAt;
      const dateB = b.scheduledAt || b.createdAt;
      return dateA - dateB;
    });

    // Paginate
    const paginated = allPosts.slice(offset, offset + limit);

    return NextResponse.json({
      posts: paginated,
      total: allPosts.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/social/posts
 * Create a new post (immediate or scheduled)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, platforms, scheduledAt } = body;

    if (!content?.text) {
      return NextResponse.json(
        { error: 'Post content is required' },
        { status: 400 }
      );
    }

    if (!platforms || platforms.length === 0) {
      return NextResponse.json(
        { error: 'At least one platform is required' },
        { status: 400 }
      );
    }

    const postId = `post_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();

    const post = {
      id: postId,
      content: {
        text: content.text,
        media: content.media,
        hashtags: content.hashtags,
        link: content.link,
      },
      platforms,
      scheduledAt: scheduledAt ? new Date(scheduledAt).getTime() : undefined,
      status: scheduledAt ? 'scheduled' as const : 'published' as const,
      createdAt: now,
      publishedAt: scheduledAt ? undefined : now,
      platformPosts: scheduledAt ? undefined : platforms.map((platform: string) => ({
        platform,
        platformPostId: `${platform}_${Date.now()}`,
        url: getPlatformUrl(platform, `${platform}_${Date.now()}`),
        status: 'published',
      })),
    };

    posts.set(postId, post);

    return NextResponse.json({
      success: true,
      post: {
        id: post.id,
        status: post.status,
        scheduledAt: post.scheduledAt,
        publishedAt: post.publishedAt,
        platformPosts: post.platformPosts,
      },
    });
  } catch (error) {
    console.error('Error creating post:', error);
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/social/posts
 * Delete or cancel a post
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

    const post = posts.get(postId);
    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    posts.delete(postId);

    return NextResponse.json({
      success: true,
      message: post.status === 'scheduled' ? 'Scheduled post cancelled' : 'Post deleted',
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    return NextResponse.json(
      { error: 'Failed to delete post' },
      { status: 500 }
    );
  }
}

function getPlatformUrl(platform: string, postId: string): string {
  switch (platform) {
    case 'twitter':
      return `https://twitter.com/i/status/${postId}`;
    case 'linkedin':
      return `https://www.linkedin.com/feed/update/${postId}`;
    case 'bluesky':
      return `https://bsky.app/profile/user.bsky.social/post/${postId}`;
    case 'youtube':
      return `https://www.youtube.com/watch?v=${postId}`;
    case 'instagram':
      return `https://www.instagram.com/p/${postId}`;
    default:
      return '';
  }
}
