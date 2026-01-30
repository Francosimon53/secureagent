/**
 * Content Creator Suite - Alert Engine
 *
 * Monitors trends for keyword matches and triggers alerts.
 */

import type {
  TrendItem,
  TrendAlert,
  TrendAlertNotification,
  TrendSource,
} from '../../types.js';
import type { TrendStore } from '../../stores/trend-store.js';
import type { TrendAggregatorService } from './trend-aggregator.js';
import { CONTENT_EVENTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface AlertEngineConfig {
  checkIntervalMinutes: number;
  minRelevanceScore: number;
  deduplicationWindowMinutes: number;
}

export interface AlertMatch {
  alert: TrendAlert;
  trend: TrendItem;
  matchedKeywords: string[];
  relevanceScore: number;
}

export interface AlertNotificationHandler {
  (notification: TrendAlertNotification, alert: TrendAlert): Promise<void>;
}

// =============================================================================
// Alert Engine Service
// =============================================================================

export class AlertEngineService {
  private checkInterval: NodeJS.Timeout | null = null;
  private notificationHandlers: AlertNotificationHandler[] = [];
  private eventHandlers = new Map<string, Set<(data: unknown) => void>>();
  private recentNotifications = new Map<string, number>(); // alertId:trendTitle -> timestamp

  constructor(
    private readonly store: TrendStore,
    private readonly aggregator: TrendAggregatorService,
    private readonly config: AlertEngineConfig
  ) {}

  /**
   * Start the alert engine
   */
  start(): void {
    if (this.checkInterval) {
      return;
    }

    // Run immediately
    this.checkAlerts();

    // Then run on interval
    this.checkInterval = setInterval(
      () => this.checkAlerts(),
      this.config.checkIntervalMinutes * 60 * 1000
    );
  }

  /**
   * Stop the alert engine
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Register a notification handler
   */
  registerNotificationHandler(handler: AlertNotificationHandler): () => void {
    this.notificationHandlers.push(handler);
    return () => {
      const index = this.notificationHandlers.indexOf(handler);
      if (index >= 0) {
        this.notificationHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Create a new alert
   */
  async createAlert(alert: Omit<TrendAlert, 'id' | 'createdAt'>): Promise<TrendAlert> {
    const created = await this.store.createAlert(alert);

    this.emit(CONTENT_EVENTS.TREND_ALERT_CREATED, {
      alertId: created.id,
      name: created.name,
      keywords: created.keywords,
    });

    return created;
  }

  /**
   * Update an alert
   */
  async updateAlert(
    alertId: string,
    updates: Partial<TrendAlert>
  ): Promise<TrendAlert | null> {
    return this.store.updateAlert(alertId, updates);
  }

  /**
   * Delete an alert
   */
  async deleteAlert(alertId: string): Promise<boolean> {
    return this.store.deleteAlert(alertId);
  }

  /**
   * Get alerts for a user
   */
  async getUserAlerts(userId: string): Promise<TrendAlert[]> {
    return this.store.getAlertsByUser(userId);
  }

  /**
   * Get notifications for an alert
   */
  async getAlertNotifications(
    alertId: string,
    limit?: number
  ): Promise<TrendAlertNotification[]> {
    return this.store.getNotifications(alertId, limit);
  }

  /**
   * Acknowledge a notification
   */
  async acknowledgeNotification(notificationId: string): Promise<boolean> {
    return this.store.acknowledgeNotification(notificationId);
  }

  /**
   * Check all active alerts against current trends
   */
  async checkAlerts(): Promise<AlertMatch[]> {
    const activeAlerts = await this.store.getActiveAlerts();
    if (activeAlerts.length === 0) {
      return [];
    }

    // Get current trends
    const trends = await this.aggregator.fetchTrends();
    const allMatches: AlertMatch[] = [];

    for (const alert of activeAlerts) {
      const matches = this.findMatches(alert, trends.all);

      for (const match of matches) {
        // Check if this is a duplicate notification
        if (this.isDuplicateNotification(alert, match.trend)) {
          continue;
        }

        allMatches.push(match);

        // Save notification
        const notification = await this.store.saveNotification({
          alertId: alert.id,
          trend: match.trend,
          matchedKeywords: match.matchedKeywords,
          relevanceScore: match.relevanceScore,
          sentAt: Date.now(),
          acknowledged: false,
        });

        // Mark as sent
        this.markNotificationSent(alert, match.trend);

        // Update alert last triggered
        await this.store.updateAlert(alert.id, {
          lastTriggeredAt: Date.now(),
        });

        // Emit event
        this.emit(CONTENT_EVENTS.TREND_ALERT_TRIGGERED, {
          alertId: alert.id,
          alertName: alert.name,
          trendTitle: match.trend.title,
          matchedKeywords: match.matchedKeywords,
          relevanceScore: match.relevanceScore,
        });

        // Call notification handlers
        await this.notifyHandlers(notification, alert);
      }
    }

    // Cleanup old notification records
    this.cleanupNotificationRecords();

    return allMatches;
  }

  /**
   * Manually check a single alert
   */
  async checkSingleAlert(alertId: string): Promise<AlertMatch[]> {
    const alert = await this.store.getAlert(alertId);
    if (!alert || !alert.enabled) {
      return [];
    }

    const trends = await this.aggregator.fetchTrends();
    return this.findMatches(alert, trends.all);
  }

  /**
   * Preview what an alert would match
   */
  async previewAlert(
    keywords: string[],
    sources?: TrendSource[]
  ): Promise<AlertMatch[]> {
    const trends = await this.aggregator.getTrends({ sources });

    const mockAlert: TrendAlert = {
      id: 'preview',
      userId: 'preview',
      name: 'Preview',
      keywords,
      sources: sources ?? ['twitter', 'reddit', 'hackernews'],
      notificationChannels: [],
      enabled: true,
      createdAt: Date.now(),
    };

    return this.findMatches(mockAlert, trends.all);
  }

  /**
   * Find trends that match an alert's criteria
   */
  private findMatches(alert: TrendAlert, trends: TrendItem[]): AlertMatch[] {
    const matches: AlertMatch[] = [];
    const keywordsLower = alert.keywords.map(k => k.toLowerCase());

    for (const trend of trends) {
      // Filter by source
      if (alert.sources.length > 0 && !alert.sources.includes(trend.source)) {
        continue;
      }

      // Filter by minimum volume
      if (alert.minVolume !== undefined && (trend.volume ?? 0) < alert.minVolume) {
        continue;
      }

      // Filter by minimum velocity
      if (alert.minVelocity !== undefined && trend.velocity < alert.minVelocity) {
        continue;
      }

      // Check keyword matches
      const title = trend.title.toLowerCase();
      const description = (trend.description ?? '').toLowerCase();
      const content = `${title} ${description}`;

      const matchedKeywords = keywordsLower.filter(keyword => content.includes(keyword));

      if (matchedKeywords.length === 0) {
        continue;
      }

      // Calculate relevance score
      const relevanceScore = this.calculateRelevanceScore(
        trend,
        matchedKeywords,
        alert.keywords.length
      );

      if (relevanceScore < this.config.minRelevanceScore) {
        continue;
      }

      matches.push({
        alert,
        trend,
        matchedKeywords,
        relevanceScore,
      });
    }

    // Sort by relevance
    return matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Calculate relevance score for a match
   */
  private calculateRelevanceScore(
    trend: TrendItem,
    matchedKeywords: string[],
    totalKeywords: number
  ): number {
    // Factors:
    // - Percentage of keywords matched
    // - Trend velocity (normalized)
    // - Trend volume (normalized)
    // - Title match vs description match

    const keywordRatio = matchedKeywords.length / totalKeywords;

    // Velocity score (0-1)
    const velocityScore = Math.min(trend.velocity / 100, 1);

    // Volume score (0-1, log scale)
    const volumeScore = trend.volume
      ? Math.min(Math.log10(trend.volume) / 6, 1) // 6 = log10(1,000,000)
      : 0.3;

    // Title match bonus
    const titleLower = trend.title.toLowerCase();
    const titleMatches = matchedKeywords.filter(k => titleLower.includes(k)).length;
    const titleBonus = titleMatches > 0 ? 0.2 : 0;

    // Calculate final score
    const score =
      keywordRatio * 0.4 + // 40% weight on keyword match
      velocityScore * 0.25 + // 25% weight on velocity
      volumeScore * 0.15 + // 15% weight on volume
      titleBonus; // 20% bonus for title match

    return Math.min(score, 1);
  }

  /**
   * Check if we already sent a notification for this alert+trend combination
   */
  private isDuplicateNotification(alert: TrendAlert, trend: TrendItem): boolean {
    const key = `${alert.id}:${this.normalizeTrendTitle(trend.title)}`;
    const lastSent = this.recentNotifications.get(key);

    if (!lastSent) {
      return false;
    }

    const windowMs = this.config.deduplicationWindowMinutes * 60 * 1000;
    return Date.now() - lastSent < windowMs;
  }

  /**
   * Mark that we sent a notification
   */
  private markNotificationSent(alert: TrendAlert, trend: TrendItem): void {
    const key = `${alert.id}:${this.normalizeTrendTitle(trend.title)}`;
    this.recentNotifications.set(key, Date.now());
  }

  /**
   * Clean up old notification records
   */
  private cleanupNotificationRecords(): void {
    const cutoff = Date.now() - this.config.deduplicationWindowMinutes * 60 * 1000 * 2;

    for (const [key, timestamp] of this.recentNotifications) {
      if (timestamp < cutoff) {
        this.recentNotifications.delete(key);
      }
    }
  }

  /**
   * Normalize trend title for deduplication
   */
  private normalizeTrendTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50);
  }

  /**
   * Call all notification handlers
   */
  private async notifyHandlers(
    notification: TrendAlertNotification,
    alert: TrendAlert
  ): Promise<void> {
    for (const handler of this.notificationHandlers) {
      try {
        await handler(notification, alert);
      } catch (error) {
        console.error('Error in notification handler:', error);
      }
    }
  }

  /**
   * Subscribe to events
   */
  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Emit an event
   */
  private emit(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createAlertEngine(
  store: TrendStore,
  aggregator: TrendAggregatorService,
  config?: Partial<AlertEngineConfig>
): AlertEngineService {
  const defaultConfig: AlertEngineConfig = {
    checkIntervalMinutes: 30,
    minRelevanceScore: 0.5,
    deduplicationWindowMinutes: 60 * 4, // 4 hours
    ...config,
  };

  return new AlertEngineService(store, aggregator, defaultConfig);
}
