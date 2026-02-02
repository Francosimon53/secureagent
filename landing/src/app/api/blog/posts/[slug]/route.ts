import { NextRequest, NextResponse } from 'next/server';
import { getPostBySlug, getRelatedPosts } from '@/lib/blog-store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return NextResponse.json(
      { error: 'Post not found' },
      { status: 404 }
    );
  }

  const relatedPosts = getRelatedPosts(slug, 3);

  return NextResponse.json({
    post,
    relatedPosts,
  });
}
