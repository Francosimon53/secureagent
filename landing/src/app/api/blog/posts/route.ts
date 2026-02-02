import { NextRequest, NextResponse } from 'next/server';
import {
  getAllPosts,
  getCategories,
  getTags,
  getFeaturedPosts,
  searchPosts,
  getBlogStats,
} from '@/lib/blog-store';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Return categories only
  if (searchParams.get('categories') === 'true') {
    return NextResponse.json({ categories: getCategories() });
  }

  // Return tags only
  if (searchParams.get('tags') === 'true') {
    return NextResponse.json({ tags: getTags() });
  }

  // Return stats only
  if (searchParams.get('stats') === 'true') {
    return NextResponse.json({ stats: getBlogStats() });
  }

  // Return featured posts only
  if (searchParams.get('featured') === 'true') {
    const limit = parseInt(searchParams.get('limit') || '3');
    return NextResponse.json({ posts: getFeaturedPosts(limit) });
  }

  // Search posts
  const query = searchParams.get('q') || searchParams.get('search');
  if (query) {
    const results = searchPosts(query);
    return NextResponse.json({ posts: results, total: results.length });
  }

  // Get all posts with filters
  const category = searchParams.get('category') || undefined;
  const tag = searchParams.get('tag') || undefined;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
  const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined;

  const posts = getAllPosts({ category, tag, limit, offset });

  return NextResponse.json({
    posts,
    total: posts.length,
    categories: getCategories(),
    tags: getTags(),
  });
}
