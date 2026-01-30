/**
 * Content Creator Suite - Trend Store
 *
 * Persistence layer for trend data caching and alerts.
 */

import type {
  TrendItem,
  TrendAlert,
  TrendAlertNotification,
  TrendAggregation,
  TrendSource,
  TrendQueryOptions,
  DatabaseAdapter,
} from '../types.js';

// =============================================================================
// Trend Store Interface
// =============================================================================

export interface TrendStore {
  initialize(): Promise<void>;

  // Trend items
  saveTrends(trends: TrendItem[]): Promise<void>;
  getTrends(options?: TrendQueryOptions): Promise<TrendItem[]>;
  getTrendById(trendId: string): Promise<TrendItem | null>;
  deleteTrend(trendId: string): Promise<boolean>;
  deleteExpiredTrends(): Promise<number>;

  // Alerts
  createAlert(alert: Omit<TrendAlert, 'id' | 'createdAt'>): Promise<TrendAlert>;
  getAlert(alertId: string): Promise<TrendAlert | null>;
  updateAlert(alertId: string, updates: Partial<TrendAlert>): Promise<TrendAlert | null>;
  deleteAlert(alertId: string): Promise<boolean>;
  getAlertsByUser(userId: string): Promise<TrendAlert[]>;
  getActiveAlerts(): Promise<TrendAlert[]>;

  // Notifications
  saveNotification(notification: Omit<TrendAlertNotification, 'id'>): Promise<TrendAlertNotification>;
  getNotifications(alertId: string, limit?: number): Promise<TrendAlertNotification[]>;
  acknowledgeNotification(notificationId: string): Promise<boolean>;

  // Aggregations
  saveAggregation(aggregation: Omit<TrendAggregation, 'id'>): Promise<TrendAggregation>;
  getAggregation(aggregationId: string): Promise<TrendAggregation | null>;
  getLatestAggregation(userId: string, period: string): Promise<TrendAggregation | null>;
}

// =============================================================================
// Database Implementation
// =============================================================================

interface TrendRow {
  id: string;
  source: string;
  title: string;
  description: string | null;
  url: string | null;
  volume: number | null;
  velocity: number;
  sentiment: string | null;
  related_topics: string | null;
  category: string | null;
  rank: number | null;
  fetched_at: number;
  expires_at: number;
}

interface AlertRow {
  id: string;
  user_id: string;
  name: string;
  keywords: string;
  sources: string;
  min_volume: number | null;
  min_velocity: number | null;
  notification_channels: string;
  webhook_url: string | null;
  enabled: number;
  last_triggered_at: number | null;
  created_at: number;
}

interface NotificationRow {
  id: string;
  alert_id: string;
  trend: string;
  matched_keywords: string;
  relevance_score: number;
  sent_at: number;
  acknowledged: number;
}

interface AggregationRow {
  id: string;
  user_id: string;
  period: string;
  sources: string;
  trends: string;
  top_categories: string;
  emerging_topics: string;
  generated_at: number;
}

export class DatabaseTrendStore implements TrendStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Trends table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS content_creator_trends (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        url TEXT,
        volume INTEGER,
        velocity REAL NOT NULL,
        sentiment TEXT,
        related_topics TEXT,
        category TEXT,
        rank INTEGER,
        fetched_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_trends_source
      ON content_creator_trends(source)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_trends_expires
      ON content_creator_trends(expires_at)
    `);

    // Alerts table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS content_creator_trend_alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        keywords TEXT NOT NULL,
        sources TEXT NOT NULL,
        min_volume INTEGER,
        min_velocity REAL,
        notification_channels TEXT NOT NULL,
        webhook_url TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_triggered_at INTEGER,
        created_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_alerts_user
      ON content_creator_trend_alerts(user_id)
    `);

    // Notifications table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS content_creator_trend_notifications (
        id TEXT PRIMARY KEY,
        alert_id TEXT NOT NULL,
        trend TEXT NOT NULL,
        matched_keywords TEXT NOT NULL,
        relevance_score REAL NOT NULL,
        sent_at INTEGER NOT NULL,
        acknowledged INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (alert_id) REFERENCES content_creator_trend_alerts(id) ON DELETE CASCADE
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notifications_alert
      ON content_creator_trend_notifications(alert_id)
    `);

    // Aggregations table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS content_creator_trend_aggregations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        period TEXT NOT NULL,
        sources TEXT NOT NULL,
        trends TEXT NOT NULL,
        top_categories TEXT NOT NULL,
        emerging_topics TEXT NOT NULL,
        generated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_aggregations_user_period
      ON content_creator_trend_aggregations(user_id, period)
    `);
  }

  // ==========================================================================
  // Trend Items
  // ==========================================================================

  async saveTrends(trends: TrendItem[]): Promise<void> {
    for (const trend of trends) {
      await this.db.execute(
        `INSERT OR REPLACE INTO content_creator_trends
         (id, source, title, description, url, volume, velocity, sentiment,
          related_topics, category, rank, fetched_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          trend.id,
          trend.source,
          trend.title,
          trend.description ?? null,
          trend.url ?? null,
          trend.volume ?? null,
          trend.velocity,
          trend.sentiment ?? null,
          trend.relatedTopics ? JSON.stringify(trend.relatedTopics) : null,
          trend.category ?? null,
          trend.rank ?? null,
          trend.fetchedAt,
          trend.expiresAt,
        ]
      );
    }
  }

  async getTrends(options?: TrendQueryOptions): Promise<TrendItem[]> {
    const conditions: string[] = ['expires_at > ?'];
    const params: unknown[] = [Date.now()];

    if (options?.sources && options.sources.length > 0) {
      const placeholders = options.sources.map(() => '?').join(',');
      conditions.push(`source IN (${placeholders})`);
      params.push(...options.sources);
    }
    if (options?.minVolume !== undefined) {
      conditions.push('volume >= ?');
      params.push(options.minVolume);
    }
    if (options?.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const result = await this.db.query<TrendRow>(
      `SELECT * FROM content_creator_trends ${whereClause}
       ORDER BY velocity DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return result.rows.map(row => this.rowToTrend(row));
  }

  async getTrendById(trendId: string): Promise<TrendItem | null> {
    const result = await this.db.query<TrendRow>(
      'SELECT * FROM content_creator_trends WHERE id = ?',
      [trendId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToTrend(result.rows[0]);
  }

  async deleteTrend(trendId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM content_creator_trends WHERE id = ?',
      [trendId]
    );
    return result.changes > 0;
  }

  async deleteExpiredTrends(): Promise<number> {
    const result = await this.db.execute(
      'DELETE FROM content_creator_trends WHERE expires_at <= ?',
      [Date.now()]
    );
    return result.changes;
  }

  // ==========================================================================
  // Alerts
  // ==========================================================================

  async createAlert(alert: Omit<TrendAlert, 'id' | 'createdAt'>): Promise<TrendAlert> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.execute(
      `INSERT INTO content_creator_trend_alerts
       (id, user_id, name, keywords, sources, min_volume, min_velocity,
        notification_channels, webhook_url, enabled, last_triggered_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        alert.userId,
        alert.name,
        JSON.stringify(alert.keywords),
        JSON.stringify(alert.sources),
        alert.minVolume ?? null,
        alert.minVelocity ?? null,
        JSON.stringify(alert.notificationChannels),
        alert.webhookUrl ?? null,
        alert.enabled ? 1 : 0,
        alert.lastTriggeredAt ?? null,
        now,
      ]
    );

    return { ...alert, id, createdAt: now };
  }

  async getAlert(alertId: string): Promise<TrendAlert | null> {
    const result = await this.db.query<AlertRow>(
      'SELECT * FROM content_creator_trend_alerts WHERE id = ?',
      [alertId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToAlert(result.rows[0]);
  }

  async updateAlert(
    alertId: string,
    updates: Partial<TrendAlert>
  ): Promise<TrendAlert | null> {
    const existing = await this.getAlert(alertId);
    if (!existing) {
      return null;
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      params.push(updates.name);
    }
    if (updates.keywords !== undefined) {
      setClauses.push('keywords = ?');
      params.push(JSON.stringify(updates.keywords));
    }
    if (updates.sources !== undefined) {
      setClauses.push('sources = ?');
      params.push(JSON.stringify(updates.sources));
    }
    if (updates.minVolume !== undefined) {
      setClauses.push('min_volume = ?');
      params.push(updates.minVolume);
    }
    if (updates.minVelocity !== undefined) {
      setClauses.push('min_velocity = ?');
      params.push(updates.minVelocity);
    }
    if (updates.notificationChannels !== undefined) {
      setClauses.push('notification_channels = ?');
      params.push(JSON.stringify(updates.notificationChannels));
    }
    if (updates.webhookUrl !== undefined) {
      setClauses.push('webhook_url = ?');
      params.push(updates.webhookUrl);
    }
    if (updates.enabled !== undefined) {
      setClauses.push('enabled = ?');
      params.push(updates.enabled ? 1 : 0);
    }
    if (updates.lastTriggeredAt !== undefined) {
      setClauses.push('last_triggered_at = ?');
      params.push(updates.lastTriggeredAt);
    }

    if (setClauses.length === 0) {
      return existing;
    }

    params.push(alertId);

    await this.db.execute(
      `UPDATE content_creator_trend_alerts SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    return this.getAlert(alertId);
  }

  async deleteAlert(alertId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM content_creator_trend_alerts WHERE id = ?',
      [alertId]
    );
    return result.changes > 0;
  }

  async getAlertsByUser(userId: string): Promise<TrendAlert[]> {
    const result = await this.db.query<AlertRow>(
      'SELECT * FROM content_creator_trend_alerts WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    return result.rows.map(row => this.rowToAlert(row));
  }

  async getActiveAlerts(): Promise<TrendAlert[]> {
    const result = await this.db.query<AlertRow>(
      'SELECT * FROM content_creator_trend_alerts WHERE enabled = 1'
    );

    return result.rows.map(row => this.rowToAlert(row));
  }

  // ==========================================================================
  // Notifications
  // ==========================================================================

  async saveNotification(
    notification: Omit<TrendAlertNotification, 'id'>
  ): Promise<TrendAlertNotification> {
    const id = crypto.randomUUID();

    await this.db.execute(
      `INSERT INTO content_creator_trend_notifications
       (id, alert_id, trend, matched_keywords, relevance_score, sent_at, acknowledged)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        notification.alertId,
        JSON.stringify(notification.trend),
        JSON.stringify(notification.matchedKeywords),
        notification.relevanceScore,
        notification.sentAt,
        notification.acknowledged ? 1 : 0,
      ]
    );

    return { ...notification, id };
  }

  async getNotifications(alertId: string, limit?: number): Promise<TrendAlertNotification[]> {
    const result = await this.db.query<NotificationRow>(
      `SELECT * FROM content_creator_trend_notifications
       WHERE alert_id = ?
       ORDER BY sent_at DESC
       ${limit ? `LIMIT ${limit}` : ''}`,
      [alertId]
    );

    return result.rows.map(row => this.rowToNotification(row));
  }

  async acknowledgeNotification(notificationId: string): Promise<boolean> {
    const result = await this.db.execute(
      'UPDATE content_creator_trend_notifications SET acknowledged = 1 WHERE id = ?',
      [notificationId]
    );
    return result.changes > 0;
  }

  // ==========================================================================
  // Aggregations
  // ==========================================================================

  async saveAggregation(
    aggregation: Omit<TrendAggregation, 'id'>
  ): Promise<TrendAggregation> {
    const id = crypto.randomUUID();

    await this.db.execute(
      `INSERT INTO content_creator_trend_aggregations
       (id, user_id, period, sources, trends, top_categories, emerging_topics, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        aggregation.userId,
        aggregation.period,
        JSON.stringify(aggregation.sources),
        JSON.stringify(aggregation.trends),
        JSON.stringify(aggregation.topCategories),
        JSON.stringify(aggregation.emergingTopics),
        aggregation.generatedAt,
      ]
    );

    return { ...aggregation, id };
  }

  async getAggregation(aggregationId: string): Promise<TrendAggregation | null> {
    const result = await this.db.query<AggregationRow>(
      'SELECT * FROM content_creator_trend_aggregations WHERE id = ?',
      [aggregationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToAggregation(result.rows[0]);
  }

  async getLatestAggregation(
    userId: string,
    period: string
  ): Promise<TrendAggregation | null> {
    const result = await this.db.query<AggregationRow>(
      `SELECT * FROM content_creator_trend_aggregations
       WHERE user_id = ? AND period = ?
       ORDER BY generated_at DESC
       LIMIT 1`,
      [userId, period]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToAggregation(result.rows[0]);
  }

  // ==========================================================================
  // Row Converters
  // ==========================================================================

  private rowToTrend(row: TrendRow): TrendItem {
    return {
      id: row.id,
      source: row.source as TrendSource,
      title: row.title,
      description: row.description ?? undefined,
      url: row.url ?? undefined,
      volume: row.volume ?? undefined,
      velocity: row.velocity,
      sentiment: row.sentiment as TrendItem['sentiment'],
      relatedTopics: row.related_topics ? JSON.parse(row.related_topics) : undefined,
      category: row.category ?? undefined,
      rank: row.rank ?? undefined,
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
    };
  }

  private rowToAlert(row: AlertRow): TrendAlert {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      keywords: JSON.parse(row.keywords),
      sources: JSON.parse(row.sources),
      minVolume: row.min_volume ?? undefined,
      minVelocity: row.min_velocity ?? undefined,
      notificationChannels: JSON.parse(row.notification_channels),
      webhookUrl: row.webhook_url ?? undefined,
      enabled: row.enabled === 1,
      lastTriggeredAt: row.last_triggered_at ?? undefined,
      createdAt: row.created_at,
    };
  }

  private rowToNotification(row: NotificationRow): TrendAlertNotification {
    return {
      id: row.id,
      alertId: row.alert_id,
      trend: JSON.parse(row.trend),
      matchedKeywords: JSON.parse(row.matched_keywords),
      relevanceScore: row.relevance_score,
      sentAt: row.sent_at,
      acknowledged: row.acknowledged === 1,
    };
  }

  private rowToAggregation(row: AggregationRow): TrendAggregation {
    return {
      id: row.id,
      userId: row.user_id,
      period: row.period as TrendAggregation['period'],
      sources: JSON.parse(row.sources),
      trends: JSON.parse(row.trends),
      topCategories: JSON.parse(row.top_categories),
      emergingTopics: JSON.parse(row.emerging_topics),
      generatedAt: row.generated_at,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryTrendStore implements TrendStore {
  private trends = new Map<string, TrendItem>();
  private alerts = new Map<string, TrendAlert>();
  private notifications = new Map<string, TrendAlertNotification>();
  private aggregations = new Map<string, TrendAggregation>();

  async initialize(): Promise<void> {}

  async saveTrends(trends: TrendItem[]): Promise<void> {
    for (const trend of trends) {
      this.trends.set(trend.id, trend);
    }
  }

  async getTrends(options?: TrendQueryOptions): Promise<TrendItem[]> {
    const now = Date.now();
    let items = Array.from(this.trends.values()).filter(t => t.expiresAt > now);

    if (options?.sources && options.sources.length > 0) {
      items = items.filter(t => options.sources!.includes(t.source));
    }
    if (options?.minVolume !== undefined) {
      items = items.filter(t => (t.volume ?? 0) >= options.minVolume!);
    }
    if (options?.category) {
      items = items.filter(t => t.category === options.category);
    }

    items.sort((a, b) => b.velocity - a.velocity);

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return items.slice(offset, offset + limit);
  }

  async getTrendById(trendId: string): Promise<TrendItem | null> {
    return this.trends.get(trendId) ?? null;
  }

  async deleteTrend(trendId: string): Promise<boolean> {
    return this.trends.delete(trendId);
  }

  async deleteExpiredTrends(): Promise<number> {
    const now = Date.now();
    let deleted = 0;
    for (const [id, trend] of this.trends) {
      if (trend.expiresAt <= now) {
        this.trends.delete(id);
        deleted++;
      }
    }
    return deleted;
  }

  async createAlert(alert: Omit<TrendAlert, 'id' | 'createdAt'>): Promise<TrendAlert> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const newAlert: TrendAlert = { ...alert, id, createdAt: now };
    this.alerts.set(id, newAlert);
    return newAlert;
  }

  async getAlert(alertId: string): Promise<TrendAlert | null> {
    return this.alerts.get(alertId) ?? null;
  }

  async updateAlert(alertId: string, updates: Partial<TrendAlert>): Promise<TrendAlert | null> {
    const existing = this.alerts.get(alertId);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id: existing.id };
    this.alerts.set(alertId, updated);
    return updated;
  }

  async deleteAlert(alertId: string): Promise<boolean> {
    return this.alerts.delete(alertId);
  }

  async getAlertsByUser(userId: string): Promise<TrendAlert[]> {
    return Array.from(this.alerts.values())
      .filter(a => a.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getActiveAlerts(): Promise<TrendAlert[]> {
    return Array.from(this.alerts.values()).filter(a => a.enabled);
  }

  async saveNotification(
    notification: Omit<TrendAlertNotification, 'id'>
  ): Promise<TrendAlertNotification> {
    const id = crypto.randomUUID();
    const newNotification: TrendAlertNotification = { ...notification, id };
    this.notifications.set(id, newNotification);
    return newNotification;
  }

  async getNotifications(alertId: string, limit?: number): Promise<TrendAlertNotification[]> {
    let items = Array.from(this.notifications.values())
      .filter(n => n.alertId === alertId)
      .sort((a, b) => b.sentAt - a.sentAt);

    if (limit) {
      items = items.slice(0, limit);
    }
    return items;
  }

  async acknowledgeNotification(notificationId: string): Promise<boolean> {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;
    notification.acknowledged = true;
    return true;
  }

  async saveAggregation(aggregation: Omit<TrendAggregation, 'id'>): Promise<TrendAggregation> {
    const id = crypto.randomUUID();
    const newAggregation: TrendAggregation = { ...aggregation, id };
    this.aggregations.set(id, newAggregation);
    return newAggregation;
  }

  async getAggregation(aggregationId: string): Promise<TrendAggregation | null> {
    return this.aggregations.get(aggregationId) ?? null;
  }

  async getLatestAggregation(userId: string, period: string): Promise<TrendAggregation | null> {
    const userAggregations = Array.from(this.aggregations.values())
      .filter(a => a.userId === userId && a.period === period)
      .sort((a, b) => b.generatedAt - a.generatedAt);

    return userAggregations[0] ?? null;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTrendStore(
  type: 'database' | 'memory',
  db?: DatabaseAdapter
): TrendStore {
  if (type === 'database' && db) {
    return new DatabaseTrendStore(db);
  }
  return new InMemoryTrendStore();
}
