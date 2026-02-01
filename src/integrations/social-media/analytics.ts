/**
 * Social Media Analytics Aggregation
 *
 * Aggregate analytics across platforms
 */

import type {
  SocialPlatform,
  PostAnalytics,
  PlatformAnalytics,
  CampaignAnalytics,
  Campaign,
} from './types.js';

export interface AnalyticsTimeRange {
  start: number;
  end: number;
}

export interface AggregatedAnalytics {
  totalImpressions: number;
  totalReach: number;
  totalEngagement: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalClicks: number;
  totalSaves: number;
  totalVideoViews: number;
  avgEngagementRate: number;
  platformBreakdown: Partial<Record<SocialPlatform, PlatformAnalytics>>;
  topPosts: Array<{
    postId: string;
    platform: SocialPlatform;
    engagement: number;
    impressions: number;
  }>;
  timeRange: AnalyticsTimeRange;
  updatedAt: number;
}

export interface GrowthMetrics {
  period: 'day' | 'week' | 'month';
  impressionsGrowth: number;
  engagementGrowth: number;
  followersGrowth: number;
  previousPeriod: PostAnalytics;
  currentPeriod: PostAnalytics;
}

export interface PostPerformance {
  postId: string;
  platform: SocialPlatform;
  publishedAt: number;
  analytics: PlatformAnalytics;
  engagementRate: number;
  performanceScore: number; // 0-100
  comparison: 'above_average' | 'average' | 'below_average';
}

export class AnalyticsService {
  private platformAnalytics: Map<string, PlatformAnalytics> = new Map();
  private postAnalytics: Map<string, PostPerformance> = new Map();
  private averages: Map<SocialPlatform, { engagement: number; impressions: number }> = new Map();

  /**
   * Store platform analytics for a post
   */
  storeAnalytics(postId: string, platform: SocialPlatform, analytics: PlatformAnalytics): void {
    const key = `${platform}:${postId}`;
    this.platformAnalytics.set(key, analytics);

    // Update running averages
    this.updateAverages(platform, analytics);
  }

  /**
   * Get analytics for a specific post
   */
  getPostAnalytics(postId: string, platform: SocialPlatform): PlatformAnalytics | undefined {
    return this.platformAnalytics.get(`${platform}:${postId}`);
  }

  /**
   * Aggregate analytics across all platforms
   */
  aggregateAnalytics(
    postIds: Array<{ postId: string; platform: SocialPlatform }>,
    timeRange?: AnalyticsTimeRange,
  ): AggregatedAnalytics {
    const aggregated: AggregatedAnalytics = {
      totalImpressions: 0,
      totalReach: 0,
      totalEngagement: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      totalClicks: 0,
      totalSaves: 0,
      totalVideoViews: 0,
      avgEngagementRate: 0,
      platformBreakdown: {},
      topPosts: [],
      timeRange: timeRange || { start: 0, end: Date.now() },
      updatedAt: Date.now(),
    };

    const platformTotals: Partial<Record<SocialPlatform, PlatformAnalytics>> = {};

    for (const { postId, platform } of postIds) {
      const analytics = this.getPostAnalytics(postId, platform);
      if (!analytics) continue;

      // Aggregate totals
      aggregated.totalImpressions += analytics.impressions;
      aggregated.totalReach += analytics.reach;
      aggregated.totalEngagement += analytics.engagement;
      aggregated.totalLikes += analytics.likes;
      aggregated.totalComments += analytics.comments;
      aggregated.totalShares += analytics.shares;
      aggregated.totalClicks += analytics.clicks;
      aggregated.totalSaves += analytics.saves || 0;
      aggregated.totalVideoViews += analytics.videoViews || 0;

      // Platform breakdown
      if (!platformTotals[platform]) {
        platformTotals[platform] = {
          platform,
          impressions: 0,
          reach: 0,
          engagement: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          clicks: 0,
          updatedAt: Date.now(),
        };
      }

      const platformTotal = platformTotals[platform]!;
      platformTotal.impressions += analytics.impressions;
      platformTotal.reach += analytics.reach;
      platformTotal.engagement += analytics.engagement;
      platformTotal.likes += analytics.likes;
      platformTotal.comments += analytics.comments;
      platformTotal.shares += analytics.shares;
      platformTotal.clicks += analytics.clicks;

      // Track top posts
      aggregated.topPosts.push({
        postId,
        platform,
        engagement: analytics.engagement,
        impressions: analytics.impressions,
      });
    }

    // Calculate average engagement rate
    if (aggregated.totalImpressions > 0) {
      aggregated.avgEngagementRate = (aggregated.totalEngagement / aggregated.totalImpressions) * 100;
    }

    // Sort and limit top posts
    aggregated.topPosts.sort((a, b) => b.engagement - a.engagement);
    aggregated.topPosts = aggregated.topPosts.slice(0, 10);

    aggregated.platformBreakdown = platformTotals;

    return aggregated;
  }

  /**
   * Calculate campaign analytics
   */
  calculateCampaignAnalytics(campaign: Campaign): CampaignAnalytics {
    const posts = campaign.postIds.map(id => ({ postId: id, platform: campaign.platforms[0] }));
    const aggregated = this.aggregateAnalytics(posts);

    return {
      totalPosts: campaign.postIds.length,
      totalImpressions: aggregated.totalImpressions,
      totalEngagement: aggregated.totalEngagement,
      totalClicks: aggregated.totalClicks,
      avgEngagementRate: aggregated.avgEngagementRate,
      topPerformingPost: aggregated.topPosts[0]?.postId,
      platformBreakdown: aggregated.platformBreakdown as Record<SocialPlatform, PostAnalytics>,
    };
  }

  /**
   * Get post performance analysis
   */
  analyzePostPerformance(
    postId: string,
    platform: SocialPlatform,
    publishedAt: number,
  ): PostPerformance | null {
    const analytics = this.getPostAnalytics(postId, platform);
    if (!analytics) return null;

    const averages = this.averages.get(platform);
    const avgEngagement = averages?.engagement || 100;
    const avgImpressions = averages?.impressions || 1000;

    // Calculate engagement rate
    const engagementRate = analytics.impressions > 0
      ? (analytics.engagement / analytics.impressions) * 100
      : 0;

    // Calculate performance score (0-100)
    const engagementRatio = analytics.engagement / avgEngagement;
    const impressionRatio = analytics.impressions / avgImpressions;
    const performanceScore = Math.min(100, Math.round((engagementRatio + impressionRatio) * 25));

    // Compare to average
    let comparison: 'above_average' | 'average' | 'below_average' = 'average';
    if (performanceScore > 60) comparison = 'above_average';
    if (performanceScore < 40) comparison = 'below_average';

    const performance: PostPerformance = {
      postId,
      platform,
      publishedAt,
      analytics,
      engagementRate,
      performanceScore,
      comparison,
    };

    this.postAnalytics.set(`${platform}:${postId}`, performance);
    return performance;
  }

  /**
   * Get growth metrics
   */
  calculateGrowthMetrics(
    currentPeriodPosts: Array<{ postId: string; platform: SocialPlatform }>,
    previousPeriodPosts: Array<{ postId: string; platform: SocialPlatform }>,
    period: 'day' | 'week' | 'month',
  ): GrowthMetrics {
    const current = this.aggregateAnalytics(currentPeriodPosts);
    const previous = this.aggregateAnalytics(previousPeriodPosts);

    const calculateGrowth = (curr: number, prev: number): number => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    return {
      period,
      impressionsGrowth: calculateGrowth(current.totalImpressions, previous.totalImpressions),
      engagementGrowth: calculateGrowth(current.totalEngagement, previous.totalEngagement),
      followersGrowth: 0, // Would need follower data
      previousPeriod: {
        impressions: previous.totalImpressions,
        reach: previous.totalReach,
        engagement: previous.totalEngagement,
        likes: previous.totalLikes,
        comments: previous.totalComments,
        shares: previous.totalShares,
        clicks: previous.totalClicks,
        updatedAt: previous.updatedAt,
      },
      currentPeriod: {
        impressions: current.totalImpressions,
        reach: current.totalReach,
        engagement: current.totalEngagement,
        likes: current.totalLikes,
        comments: current.totalComments,
        shares: current.totalShares,
        clicks: current.totalClicks,
        updatedAt: current.updatedAt,
      },
    };
  }

  /**
   * Get best performing content types
   */
  getBestPerformingTypes(): Array<{
    contentType: string;
    avgEngagement: number;
    count: number;
  }> {
    // Group by content characteristics
    const byType: Map<string, { totalEngagement: number; count: number }> = new Map();

    for (const [key, analytics] of this.platformAnalytics) {
      // Determine content type based on analytics
      let type = 'text';
      if (analytics.videoViews && analytics.videoViews > 0) {
        type = 'video';
      } else if (analytics.saves && analytics.saves > 0) {
        type = 'image'; // Instagram typically has saves for images
      }

      const current = byType.get(type) || { totalEngagement: 0, count: 0 };
      current.totalEngagement += analytics.engagement;
      current.count += 1;
      byType.set(type, current);
    }

    return Array.from(byType.entries())
      .map(([contentType, data]) => ({
        contentType,
        avgEngagement: data.count > 0 ? data.totalEngagement / data.count : 0,
        count: data.count,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);
  }

  /**
   * Get platform comparison
   */
  getPlatformComparison(): Array<{
    platform: SocialPlatform;
    totalPosts: number;
    avgEngagement: number;
    avgImpressions: number;
    engagementRate: number;
  }> {
    const platformStats: Map<SocialPlatform, {
      posts: number;
      totalEngagement: number;
      totalImpressions: number;
    }> = new Map();

    for (const [key, analytics] of this.platformAnalytics) {
      const platform = analytics.platform;
      const current = platformStats.get(platform) || {
        posts: 0,
        totalEngagement: 0,
        totalImpressions: 0,
      };

      current.posts += 1;
      current.totalEngagement += analytics.engagement;
      current.totalImpressions += analytics.impressions;
      platformStats.set(platform, current);
    }

    return Array.from(platformStats.entries())
      .map(([platform, stats]) => ({
        platform,
        totalPosts: stats.posts,
        avgEngagement: stats.posts > 0 ? stats.totalEngagement / stats.posts : 0,
        avgImpressions: stats.posts > 0 ? stats.totalImpressions / stats.posts : 0,
        engagementRate: stats.totalImpressions > 0
          ? (stats.totalEngagement / stats.totalImpressions) * 100
          : 0,
      }))
      .sort((a, b) => b.engagementRate - a.engagementRate);
  }

  /**
   * Update running averages for a platform
   */
  private updateAverages(platform: SocialPlatform, analytics: PlatformAnalytics): void {
    const current = this.averages.get(platform);
    if (!current) {
      this.averages.set(platform, {
        engagement: analytics.engagement,
        impressions: analytics.impressions,
      });
      return;
    }

    // Simple moving average
    const alpha = 0.1; // Weight for new data
    this.averages.set(platform, {
      engagement: current.engagement * (1 - alpha) + analytics.engagement * alpha,
      impressions: current.impressions * (1 - alpha) + analytics.impressions * alpha,
    });
  }

  /**
   * Export analytics to CSV format
   */
  exportToCSV(
    postIds: Array<{ postId: string; platform: SocialPlatform }>,
  ): string {
    const headers = [
      'Post ID',
      'Platform',
      'Impressions',
      'Reach',
      'Engagement',
      'Likes',
      'Comments',
      'Shares',
      'Clicks',
      'Engagement Rate',
    ];

    const rows = postIds
      .map(({ postId, platform }) => {
        const analytics = this.getPostAnalytics(postId, platform);
        if (!analytics) return null;

        const engagementRate = analytics.impressions > 0
          ? ((analytics.engagement / analytics.impressions) * 100).toFixed(2)
          : '0';

        return [
          postId,
          platform,
          analytics.impressions,
          analytics.reach,
          analytics.engagement,
          analytics.likes,
          analytics.comments,
          analytics.shares,
          analytics.clicks,
          engagementRate,
        ].join(',');
      })
      .filter(Boolean);

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Clear old analytics data
   */
  clearOldData(maxAgeMs: number = 90 * 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleared = 0;

    for (const [key, analytics] of this.platformAnalytics) {
      if (analytics.updatedAt < cutoff) {
        this.platformAnalytics.delete(key);
        cleared++;
      }
    }

    return cleared;
  }
}

/**
 * Create analytics service instance
 */
export function createAnalyticsService(): AnalyticsService {
  return new AnalyticsService();
}
