import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/social/analytics
 * Get aggregated social media analytics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const period = searchParams.get('period') || '7d'; // 7d, 30d, 90d
    const postId = searchParams.get('postId');

    // If specific post analytics requested
    if (postId) {
      const postAnalytics = {
        postId,
        platform: platform || 'twitter',
        impressions: Math.floor(Math.random() * 10000) + 1000,
        reach: Math.floor(Math.random() * 8000) + 800,
        engagement: Math.floor(Math.random() * 500) + 50,
        likes: Math.floor(Math.random() * 300) + 30,
        comments: Math.floor(Math.random() * 50) + 5,
        shares: Math.floor(Math.random() * 100) + 10,
        clicks: Math.floor(Math.random() * 200) + 20,
        engagementRate: Math.round((Math.random() * 5 + 1) * 100) / 100,
        updatedAt: Date.now(),
      };

      return NextResponse.json({ analytics: postAnalytics });
    }

    // Aggregated analytics
    const periodDays = period === '30d' ? 30 : period === '90d' ? 90 : 7;
    const multiplier = periodDays / 7;

    const analytics = {
      period,
      periodStart: Date.now() - periodDays * 24 * 60 * 60 * 1000,
      periodEnd: Date.now(),

      // Overall metrics
      totalImpressions: Math.floor((Math.random() * 50000 + 10000) * multiplier),
      totalReach: Math.floor((Math.random() * 40000 + 8000) * multiplier),
      totalEngagement: Math.floor((Math.random() * 5000 + 1000) * multiplier),
      totalFollowers: Math.floor(Math.random() * 10000 + 2000),
      newFollowers: Math.floor((Math.random() * 500 + 100) * multiplier),

      // Growth metrics (return as numbers, not strings)
      growthRate: Math.round((Math.random() * 10 + 2) * 100) / 100,
      impressionsGrowth: Math.round((Math.random() * 20 - 5) * 100) / 100,
      engagementGrowth: Math.round((Math.random() * 15 - 3) * 100) / 100,

      // Platform breakdown
      platformBreakdown: {
        twitter: {
          impressions: Math.floor((Math.random() * 15000 + 3000) * multiplier),
          engagement: Math.floor((Math.random() * 1500 + 300) * multiplier),
          followers: Math.floor(Math.random() * 5000 + 1000),
          engagementRate: Math.round((Math.random() * 4 + 1) * 100) / 100,
        },
        linkedin: {
          impressions: Math.floor((Math.random() * 10000 + 2000) * multiplier),
          engagement: Math.floor((Math.random() * 800 + 200) * multiplier),
          followers: Math.floor(Math.random() * 3000 + 500),
          engagementRate: Math.round((Math.random() * 3 + 1) * 100) / 100,
        },
        bluesky: {
          impressions: Math.floor((Math.random() * 5000 + 1000) * multiplier),
          engagement: Math.floor((Math.random() * 500 + 100) * multiplier),
          followers: Math.floor(Math.random() * 1000 + 200),
          engagementRate: Math.round((Math.random() * 5 + 2) * 100) / 100,
        },
        youtube: {
          impressions: Math.floor((Math.random() * 20000 + 5000) * multiplier),
          engagement: Math.floor((Math.random() * 2000 + 500) * multiplier),
          followers: Math.floor(Math.random() * 2000 + 500),
          engagementRate: Math.round((Math.random() * 6 + 2) * 100) / 100,
          videoViews: Math.floor((Math.random() * 10000 + 2000) * multiplier),
        },
        instagram: {
          impressions: Math.floor((Math.random() * 12000 + 3000) * multiplier),
          engagement: Math.floor((Math.random() * 1200 + 300) * multiplier),
          followers: Math.floor(Math.random() * 4000 + 800),
          engagementRate: Math.round((Math.random() * 5 + 2) * 100) / 100,
        },
      },

      // Best performing content
      topPosts: [
        {
          id: 'post_1',
          platform: 'twitter',
          content: 'Excited to announce our new product launch!',
          impressions: Math.floor(Math.random() * 5000 + 2000),
          engagement: Math.floor(Math.random() * 300 + 100),
          engagementRate: Math.round((Math.random() * 8 + 3) * 100) / 100,
        },
        {
          id: 'post_2',
          platform: 'linkedin',
          content: 'Sharing insights from our latest research...',
          impressions: Math.floor(Math.random() * 4000 + 1500),
          engagement: Math.floor(Math.random() * 250 + 80),
          engagementRate: Math.round((Math.random() * 6 + 2) * 100) / 100,
        },
        {
          id: 'post_3',
          platform: 'instagram',
          content: 'Behind the scenes at our office',
          impressions: Math.floor(Math.random() * 3500 + 1200),
          engagement: Math.floor(Math.random() * 200 + 60),
          engagementRate: Math.round((Math.random() * 7 + 3) * 100) / 100,
        },
      ],

      // Best times to post
      bestTimes: {
        twitter: { day: 'Tuesday', hour: '9:00 AM' },
        linkedin: { day: 'Wednesday', hour: '10:00 AM' },
        instagram: { day: 'Thursday', hour: '11:00 AM' },
        youtube: { day: 'Saturday', hour: '2:00 PM' },
        bluesky: { day: 'Monday', hour: '12:00 PM' },
      },

      // Top platform
      topPlatform: 'twitter',

      updatedAt: Date.now(),
    };

    // Filter by platform if specified
    if (platform && analytics.platformBreakdown[platform as keyof typeof analytics.platformBreakdown]) {
      return NextResponse.json({
        analytics: {
          period,
          platform,
          ...analytics.platformBreakdown[platform as keyof typeof analytics.platformBreakdown],
          topPosts: analytics.topPosts.filter(p => p.platform === platform),
          bestTime: analytics.bestTimes[platform as keyof typeof analytics.bestTimes],
          updatedAt: analytics.updatedAt,
        },
      });
    }

    return NextResponse.json(analytics);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
