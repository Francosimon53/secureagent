/**
 * Skill Rating API Route
 *
 * POST /api/skills/marketplace/:id/rate - Rate a skill (1-5 stars)
 * GET /api/skills/marketplace/:id/rate - Get skill ratings
 */

import { NextRequest, NextResponse } from 'next/server';

// In-memory ratings store (replace with database in production)
interface Rating {
  userId: string;
  rating: number;
  review?: string;
  createdAt: number;
}

const ratings: Map<string, Rating[]> = new Map();

// Demo skill IDs
const validSkillIds = [
  'skill_1', 'skill_2', 'skill_3', 'skill_4',
  'skill_5', 'skill_6', 'skill_7', 'skill_8',
];

/**
 * POST /api/skills/marketplace/:id/rate
 * Rate a skill
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: skillId } = await params;
    const body = await request.json();
    const { userId, rating, review } = body;

    // Validate input
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 },
      );
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Rating must be a number between 1 and 5' },
        { status: 400 },
      );
    }

    // Check if skill exists
    if (!validSkillIds.includes(skillId) && !skillId.startsWith('skill_')) {
      return NextResponse.json(
        { error: 'Skill not found' },
        { status: 404 },
      );
    }

    // Get or create skill ratings
    if (!ratings.has(skillId)) {
      ratings.set(skillId, []);
    }
    const skillRatings = ratings.get(skillId)!;

    // Check for existing rating from this user
    const existingIndex = skillRatings.findIndex((r) => r.userId === userId);
    const now = Date.now();

    if (existingIndex >= 0) {
      // Update existing rating
      skillRatings[existingIndex] = {
        userId,
        rating,
        review: review || skillRatings[existingIndex].review,
        createdAt: now,
      };
    } else {
      // Add new rating
      skillRatings.push({
        userId,
        rating,
        review,
        createdAt: now,
      });
    }

    // Calculate new average
    const averageRating =
      skillRatings.reduce((sum, r) => sum + r.rating, 0) / skillRatings.length;

    return NextResponse.json({
      success: true,
      message: existingIndex >= 0 ? 'Rating updated' : 'Rating submitted',
      averageRating: Math.round(averageRating * 10) / 10,
      ratingCount: skillRatings.length,
    });
  } catch (error) {
    console.error('Rate skill error:', error);
    return NextResponse.json(
      { error: 'Failed to rate skill' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/skills/marketplace/:id/rate
 * Get skill ratings and reviews
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: skillId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const skillRatings = ratings.get(skillId) || [];

    // Calculate stats
    const averageRating =
      skillRatings.length > 0
        ? skillRatings.reduce((sum, r) => sum + r.rating, 0) / skillRatings.length
        : 0;

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of skillRatings) {
      distribution[r.rating as 1 | 2 | 3 | 4 | 5]++;
    }

    // Get recent reviews (with review text)
    const reviews = skillRatings
      .filter((r) => r.review)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((r) => ({
        rating: r.rating,
        review: r.review,
        createdAt: r.createdAt,
      }));

    return NextResponse.json({
      averageRating: Math.round(averageRating * 10) / 10,
      ratingCount: skillRatings.length,
      distribution,
      reviews,
    });
  } catch (error) {
    console.error('Get ratings error:', error);
    return NextResponse.json(
      { error: 'Failed to get ratings' },
      { status: 500 },
    );
  }
}
