/**
 * Content Creator Suite - Analytics Store
 *
 * Persistence layer for content performance analytics.
 */

import type {
  ContentAnalytics,
  AnalyticsSummary,
  AnalyticsQueryOptions,
  EngagementMetrics,
  HistoricalMetric,
  ContentPlatform,
  ContentType,
  DatabaseAdapter,
} from '../types.js';

// =============================================================================
// Analytics Store Interface
// =============================================================================

export interface AnalyticsStore {
  initialize(): Promise<void>;

  // Analytics records
  create(analytics: Omit<ContentAnalytics, 'id'>): Promise<ContentAnalytics>;
  get(analyticsId: string): Promise<ContentAnalytics | null>;
  getByContentId(contentId: string): Promise<ContentAnalytics | null>;
  update(analyticsId: string, updates: Partial<ContentAnalytics>): Promise<ContentAnalytics | null>;
  delete(analyticsId: string): Promise<boolean>;
  list(options?: AnalyticsQueryOptions): Promise<ContentAnalytics[]>;

  // Metrics updates
  updateMetrics(contentId: string, metrics: EngagementMetrics): Promise<boolean>;
  addHistoricalMetric(contentId: string, metric: HistoricalMetric): Promise<boolean>;

  // Summaries
  getSummary(userId: string, period: 'day' | 'week' | 'month' | 'year'): Promise<AnalyticsSummary>;
  getTopPerforming(userId: string, limit?: number): Promise<ContentAnalytics[]>;

  // Aggregations
  getAverageEngagement(userId: string, platform?: ContentPlatform): Promise<number>;
  getTotalContent(userId: string, options?: AnalyticsQueryOptions): Promise<number>;
}

// =============================================================================
// Database Implementation
// =============================================================================

interface AnalyticsRow {
  id: string;
  content_id: string;
  user_id: string;
  platform: string;
  content_type: string;
  metrics: string;
  historical_metrics: string;
  performance_score: number;
  compared_to_average: number;
  top_performing_time: string | null;
  audience_insights: string | null;
  fetched_at: number;
}

export class DatabaseAnalyticsStore implements AnalyticsStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS content_creator_analytics (
        id TEXT PRIMARY KEY,
        content_id TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        content_type TEXT NOT NULL,
        metrics TEXT NOT NULL,
        historical_metrics TEXT NOT NULL DEFAULT '[]',
        performance_score REAL NOT NULL DEFAULT 0,
        compared_to_average REAL NOT NULL DEFAULT 0,
        top_performing_time TEXT,
        audience_insights TEXT,
        fetched_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_analytics_content
      ON content_creator_analytics(content_id)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_analytics_user_platform
      ON content_creator_analytics(user_id, platform)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_analytics_performance
      ON content_creator_analytics(user_id, performance_score DESC)
    `);
  }

  async create(analytics: Omit<ContentAnalytics, 'id'>): Promise<ContentAnalytics> {
    const id = crypto.randomUUID();

    await this.db.execute(
      `INSERT INTO content_creator_analytics
       (id, content_id, user_id, platform, content_type, metrics, historical_metrics,
        performance_score, compared_to_average, top_performing_time, audience_insights, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        analytics.contentId,
        analytics.userId,
        analytics.platform,
        analytics.contentType,
        JSON.stringify(analytics.metrics),
        JSON.stringify(analytics.historicalMetrics),
        analytics.performanceScore,
        analytics.comparedToAverage,
        analytics.topPerformingTime ?? null,
        analytics.audienceInsights ? JSON.stringify(analytics.audienceInsights) : null,
        analytics.fetchedAt,
      ]
    );

    return { ...analytics, id };
  }

  async get(analyticsId: string): Promise<ContentAnalytics | null> {
    const result = await this.db.query<AnalyticsRow>(
      'SELECT * FROM content_creator_analytics WHERE id = ?',
      [analyticsId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToAnalytics(result.rows[0]);
  }

  async getByContentId(contentId: string): Promise<ContentAnalytics | null> {
    const result = await this.db.query<AnalyticsRow>(
      'SELECT * FROM content_creator_analytics WHERE content_id = ?',
      [contentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToAnalytics(result.rows[0]);
  }

  async update(
    analyticsId: string,
    updates: Partial<ContentAnalytics>
  ): Promise<ContentAnalytics | null> {
    const existing = await this.get(analyticsId);
    if (!existing) {
      return null;
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.metrics !== undefined) {
      setClauses.push('metrics = ?');
      params.push(JSON.stringify(updates.metrics));
    }
    if (updates.historicalMetrics !== undefined) {
      setClauses.push('historical_metrics = ?');
      params.push(JSON.stringify(updates.historicalMetrics));
    }
    if (updates.performanceScore !== undefined) {
      setClauses.push('performance_score = ?');
      params.push(updates.performanceScore);
    }
    if (updates.comparedToAverage !== undefined) {
      setClauses.push('compared_to_average = ?');
      params.push(updates.comparedToAverage);
    }
    if (updates.topPerformingTime !== undefined) {
      setClauses.push('top_performing_time = ?');
      params.push(updates.topPerformingTime);
    }
    if (updates.audienceInsights !== undefined) {
      setClauses.push('audience_insights = ?');
      params.push(JSON.stringify(updates.audienceInsights));
    }
    if (updates.fetchedAt !== undefined) {
      setClauses.push('fetched_at = ?');
      params.push(updates.fetchedAt);
    }

    if (setClauses.length === 0) {
      return existing;
    }

    params.push(analyticsId);

    await this.db.execute(
      `UPDATE content_creator_analytics SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    return this.get(analyticsId);
  }

  async delete(analyticsId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM content_creator_analytics WHERE id = ?',
      [analyticsId]
    );
    return result.changes > 0;
  }

  async list(options?: AnalyticsQueryOptions): Promise<ContentAnalytics[]> {
    const { whereClause, params } = this.buildWhereClause(options);
    const limit = 100;
    const offset = 0;

    const result = await this.db.query<AnalyticsRow>(
      `SELECT * FROM content_creator_analytics ${whereClause}
       ORDER BY fetched_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return result.rows.map(row => this.rowToAnalytics(row));
  }

  async updateMetrics(contentId: string, metrics: EngagementMetrics): Promise<boolean> {
    const analytics = await this.getByContentId(contentId);
    if (!analytics) {
      return false;
    }

    // Calculate performance score
    const performanceScore = this.calculatePerformanceScore(metrics);

    // Get average for comparison
    const averageEngagement = await this.getAverageEngagement(analytics.userId, analytics.platform);
    const comparedToAverage = averageEngagement > 0
      ? metrics.engagementRate / averageEngagement
      : 1;

    await this.update(analytics.id, {
      metrics,
      performanceScore,
      comparedToAverage,
      fetchedAt: Date.now(),
    });

    return true;
  }

  async addHistoricalMetric(contentId: string, metric: HistoricalMetric): Promise<boolean> {
    const analytics = await this.getByContentId(contentId);
    if (!analytics) {
      return false;
    }

    const historicalMetrics = [...analytics.historicalMetrics, metric];

    // Keep only last 100 data points
    if (historicalMetrics.length > 100) {
      historicalMetrics.shift();
    }

    await this.update(analytics.id, { historicalMetrics });
    return true;
  }

  async getSummary(
    userId: string,
    period: 'day' | 'week' | 'month' | 'year'
  ): Promise<AnalyticsSummary> {
    const fromDate = this.getFromDate(period);

    const result = await this.db.query<AnalyticsRow>(
      `SELECT * FROM content_creator_analytics
       WHERE user_id = ? AND fetched_at >= ?`,
      [userId, fromDate]
    );

    const analytics = result.rows.map(row => this.rowToAnalytics(row));

    // Calculate totals
    let totalEngagements = 0;
    let totalEngagementRate = 0;
    const platformBreakdown = new Map<ContentPlatform, { count: number; engagements: number }>();
    const contentTypeBreakdown = new Map<ContentType, { count: number; engagements: number }>();

    for (const a of analytics) {
      const engagements = a.metrics.likes + a.metrics.comments + a.metrics.shares;
      totalEngagements += engagements;
      totalEngagementRate += a.metrics.engagementRate;

      // Platform breakdown
      const platformData = platformBreakdown.get(a.platform) ?? { count: 0, engagements: 0 };
      platformData.count++;
      platformData.engagements += engagements;
      platformBreakdown.set(a.platform, platformData);

      // Content type breakdown
      const typeData = contentTypeBreakdown.get(a.contentType) ?? { count: 0, engagements: 0 };
      typeData.count++;
      typeData.engagements += engagements;
      contentTypeBreakdown.set(a.contentType, typeData);
    }

    // Get top performing content
    const topPerforming = await this.getTopPerforming(userId, 5);

    return {
      userId,
      period,
      totalContent: analytics.length,
      totalEngagements,
      averageEngagementRate: analytics.length > 0 ? totalEngagementRate / analytics.length : 0,
      topPerformingContent: topPerforming.map(a => a.contentId),
      platformBreakdown: Array.from(platformBreakdown.entries()).map(([platform, data]) => ({
        platform,
        ...data,
      })),
      contentTypeBreakdown: Array.from(contentTypeBreakdown.entries()).map(([type, data]) => ({
        type,
        ...data,
      })),
      growthRate: this.calculateGrowthRate(analytics, period),
    };
  }

  async getTopPerforming(userId: string, limit: number = 10): Promise<ContentAnalytics[]> {
    const result = await this.db.query<AnalyticsRow>(
      `SELECT * FROM content_creator_analytics
       WHERE user_id = ?
       ORDER BY performance_score DESC
       LIMIT ?`,
      [userId, limit]
    );

    return result.rows.map(row => this.rowToAnalytics(row));
  }

  async getAverageEngagement(userId: string, platform?: ContentPlatform): Promise<number> {
    const whereClause = platform
      ? 'WHERE user_id = ? AND platform = ?'
      : 'WHERE user_id = ?';
    const params = platform ? [userId, platform] : [userId];

    const result = await this.db.query<{ avg_engagement: number }>(
      `SELECT AVG(json_extract(metrics, '$.engagementRate')) as avg_engagement
       FROM content_creator_analytics ${whereClause}`,
      params
    );

    return result.rows[0]?.avg_engagement ?? 0;
  }

  async getTotalContent(userId: string, options?: AnalyticsQueryOptions): Promise<number> {
    const { whereClause, params } = this.buildWhereClause({ ...options, userId });

    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM content_creator_analytics ${whereClause}`,
      params
    );

    return result.rows[0]?.count ?? 0;
  }

  private buildWhereClause(options?: AnalyticsQueryOptions): {
    whereClause: string;
    params: unknown[];
  } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }
    if (options?.platform) {
      conditions.push('platform = ?');
      params.push(options.platform);
    }
    if (options?.contentType) {
      conditions.push('content_type = ?');
      params.push(options.contentType);
    }
    if (options?.fromDate) {
      conditions.push('fetched_at >= ?');
      params.push(options.fromDate);
    }
    if (options?.toDate) {
      conditions.push('fetched_at <= ?');
      params.push(options.toDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  private rowToAnalytics(row: AnalyticsRow): ContentAnalytics {
    return {
      id: row.id,
      contentId: row.content_id,
      userId: row.user_id,
      platform: row.platform as ContentPlatform,
      contentType: row.content_type as ContentType,
      metrics: JSON.parse(row.metrics) as EngagementMetrics,
      historicalMetrics: JSON.parse(row.historical_metrics) as HistoricalMetric[],
      performanceScore: row.performance_score,
      comparedToAverage: row.compared_to_average,
      topPerformingTime: row.top_performing_time ?? undefined,
      audienceInsights: row.audience_insights ? JSON.parse(row.audience_insights) : undefined,
      fetchedAt: row.fetched_at,
    };
  }

  private calculatePerformanceScore(metrics: EngagementMetrics): number {
    // Weighted score based on engagement types
    const weights = {
      likes: 1,
      comments: 3,
      shares: 5,
      clicks: 2,
      saves: 4,
    };

    const score =
      metrics.likes * weights.likes +
      metrics.comments * weights.comments +
      metrics.shares * weights.shares +
      metrics.clicks * weights.clicks +
      (metrics.saves ?? 0) * weights.saves;

    // Normalize by impressions
    return metrics.impressions > 0 ? (score / metrics.impressions) * 1000 : 0;
  }

  private getFromDate(period: 'day' | 'week' | 'month' | 'year'): number {
    const now = Date.now();
    switch (period) {
      case 'day':
        return now - 24 * 60 * 60 * 1000;
      case 'week':
        return now - 7 * 24 * 60 * 60 * 1000;
      case 'month':
        return now - 30 * 24 * 60 * 60 * 1000;
      case 'year':
        return now - 365 * 24 * 60 * 60 * 1000;
    }
  }

  private calculateGrowthRate(analytics: ContentAnalytics[], period: string): number {
    if (analytics.length < 2) return 0;

    // Split into two halves and compare
    const midpoint = Math.floor(analytics.length / 2);
    const firstHalf = analytics.slice(0, midpoint);
    const secondHalf = analytics.slice(midpoint);

    const firstAvg = firstHalf.reduce((sum, a) => sum + a.metrics.engagementRate, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, a) => sum + a.metrics.engagementRate, 0) / secondHalf.length;

    if (firstAvg === 0) return secondAvg > 0 ? 1 : 0;
    return (secondAvg - firstAvg) / firstAvg;
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryAnalyticsStore implements AnalyticsStore {
  private analytics = new Map<string, ContentAnalytics>();
  private contentIndex = new Map<string, string>(); // contentId -> analyticsId

  async initialize(): Promise<void> {
    // No-op
  }

  async create(analytics: Omit<ContentAnalytics, 'id'>): Promise<ContentAnalytics> {
    const id = crypto.randomUUID();
    const newAnalytics: ContentAnalytics = { ...analytics, id };

    this.analytics.set(id, newAnalytics);
    this.contentIndex.set(analytics.contentId, id);

    return newAnalytics;
  }

  async get(analyticsId: string): Promise<ContentAnalytics | null> {
    return this.analytics.get(analyticsId) ?? null;
  }

  async getByContentId(contentId: string): Promise<ContentAnalytics | null> {
    const analyticsId = this.contentIndex.get(contentId);
    if (!analyticsId) return null;
    return this.analytics.get(analyticsId) ?? null;
  }

  async update(
    analyticsId: string,
    updates: Partial<ContentAnalytics>
  ): Promise<ContentAnalytics | null> {
    const existing = this.analytics.get(analyticsId);
    if (!existing) return null;

    const updated: ContentAnalytics = {
      ...existing,
      ...updates,
      id: existing.id,
      contentId: existing.contentId,
      userId: existing.userId,
    };

    this.analytics.set(analyticsId, updated);
    return updated;
  }

  async delete(analyticsId: string): Promise<boolean> {
    const analytics = this.analytics.get(analyticsId);
    if (analytics) {
      this.contentIndex.delete(analytics.contentId);
    }
    return this.analytics.delete(analyticsId);
  }

  async list(options?: AnalyticsQueryOptions): Promise<ContentAnalytics[]> {
    let items = Array.from(this.analytics.values());

    if (options?.userId) {
      items = items.filter(a => a.userId === options.userId);
    }
    if (options?.platform) {
      items = items.filter(a => a.platform === options.platform);
    }
    if (options?.contentType) {
      items = items.filter(a => a.contentType === options.contentType);
    }
    if (options?.fromDate) {
      items = items.filter(a => a.fetchedAt >= options.fromDate!);
    }
    if (options?.toDate) {
      items = items.filter(a => a.fetchedAt <= options.toDate!);
    }

    return items.sort((a, b) => b.fetchedAt - a.fetchedAt);
  }

  async updateMetrics(contentId: string, metrics: EngagementMetrics): Promise<boolean> {
    const analytics = await this.getByContentId(contentId);
    if (!analytics) return false;

    await this.update(analytics.id, {
      metrics,
      fetchedAt: Date.now(),
    });

    return true;
  }

  async addHistoricalMetric(contentId: string, metric: HistoricalMetric): Promise<boolean> {
    const analytics = await this.getByContentId(contentId);
    if (!analytics) return false;

    const historicalMetrics = [...analytics.historicalMetrics, metric].slice(-100);
    await this.update(analytics.id, { historicalMetrics });

    return true;
  }

  async getSummary(
    userId: string,
    period: 'day' | 'week' | 'month' | 'year'
  ): Promise<AnalyticsSummary> {
    const fromDate = this.getFromDate(period);
    const items = Array.from(this.analytics.values()).filter(
      a => a.userId === userId && a.fetchedAt >= fromDate
    );

    let totalEngagements = 0;
    let totalEngagementRate = 0;
    const platformBreakdown = new Map<ContentPlatform, { count: number; engagements: number }>();
    const contentTypeBreakdown = new Map<ContentType, { count: number; engagements: number }>();

    for (const a of items) {
      const engagements = a.metrics.likes + a.metrics.comments + a.metrics.shares;
      totalEngagements += engagements;
      totalEngagementRate += a.metrics.engagementRate;

      const platformData = platformBreakdown.get(a.platform) ?? { count: 0, engagements: 0 };
      platformData.count++;
      platformData.engagements += engagements;
      platformBreakdown.set(a.platform, platformData);

      const typeData = contentTypeBreakdown.get(a.contentType) ?? { count: 0, engagements: 0 };
      typeData.count++;
      typeData.engagements += engagements;
      contentTypeBreakdown.set(a.contentType, typeData);
    }

    const topPerforming = await this.getTopPerforming(userId, 5);

    return {
      userId,
      period,
      totalContent: items.length,
      totalEngagements,
      averageEngagementRate: items.length > 0 ? totalEngagementRate / items.length : 0,
      topPerformingContent: topPerforming.map(a => a.contentId),
      platformBreakdown: Array.from(platformBreakdown.entries()).map(([platform, data]) => ({
        platform,
        ...data,
      })),
      contentTypeBreakdown: Array.from(contentTypeBreakdown.entries()).map(([type, data]) => ({
        type,
        ...data,
      })),
      growthRate: 0, // Simplified
    };
  }

  async getTopPerforming(userId: string, limit: number = 10): Promise<ContentAnalytics[]> {
    return Array.from(this.analytics.values())
      .filter(a => a.userId === userId)
      .sort((a, b) => b.performanceScore - a.performanceScore)
      .slice(0, limit);
  }

  async getAverageEngagement(userId: string, platform?: ContentPlatform): Promise<number> {
    let items = Array.from(this.analytics.values()).filter(a => a.userId === userId);
    if (platform) {
      items = items.filter(a => a.platform === platform);
    }
    if (items.length === 0) return 0;
    return items.reduce((sum, a) => sum + a.metrics.engagementRate, 0) / items.length;
  }

  async getTotalContent(userId: string, options?: AnalyticsQueryOptions): Promise<number> {
    return (await this.list({ ...options, userId })).length;
  }

  private getFromDate(period: 'day' | 'week' | 'month' | 'year'): number {
    const now = Date.now();
    switch (period) {
      case 'day':
        return now - 24 * 60 * 60 * 1000;
      case 'week':
        return now - 7 * 24 * 60 * 60 * 1000;
      case 'month':
        return now - 30 * 24 * 60 * 60 * 1000;
      case 'year':
        return now - 365 * 24 * 60 * 60 * 1000;
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createAnalyticsStore(
  type: 'database' | 'memory',
  db?: DatabaseAdapter
): AnalyticsStore {
  if (type === 'database' && db) {
    return new DatabaseAnalyticsStore(db);
  }
  return new InMemoryAnalyticsStore();
}
