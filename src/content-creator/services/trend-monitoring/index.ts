/**
 * Content Creator Suite - Trend Monitoring Service
 *
 * Main entry point for trend monitoring, aggregation, and alerts.
 */

export {
  TrendAggregatorService,
  createTrendAggregator,
  type TrendProviders,
  type AggregatorConfig,
  type AggregatedTrends,
} from './trend-aggregator.js';

export {
  AlertEngineService,
  createAlertEngine,
  type AlertEngineConfig,
  type AlertMatch,
  type AlertNotificationHandler,
} from './alert-engine.js';

export {
  RelevanceScorerService,
  createRelevanceScorer,
  type RelevanceScore,
  type RelevanceFactor,
  type UserContext,
  type ScorerConfig,
} from './relevance-scorer.js';

import type { TrendStore } from '../../stores/trend-store.js';
import type { ContentStore } from '../../stores/content-store.js';
import type { VoiceProfileStore } from '../../stores/voice-profile-store.js';
import type { TrendMonitoringConfig } from '../../config.js';
import type { TrendItem, TrendAlert, TrendSource } from '../../types.js';

import {
  createTwitterTrendsProvider,
  createRedditProvider,
  createHackerNewsProvider,
} from '../../providers/trends/index.js';

import { createTrendAggregator, type TrendProviders, type AggregatedTrends } from './trend-aggregator.js';
import { createAlertEngine, type AlertNotificationHandler } from './alert-engine.js';
import { createRelevanceScorer, type UserContext, type RelevanceScore } from './relevance-scorer.js';

// =============================================================================
// Trend Monitoring Service (Facade)
// =============================================================================

export interface TrendMonitoringServiceConfig {
  trendMonitoring?: TrendMonitoringConfig;
}

export class TrendMonitoringService {
  public readonly aggregator: ReturnType<typeof createTrendAggregator>;
  public readonly alertEngine: ReturnType<typeof createAlertEngine>;
  public readonly relevanceScorer: ReturnType<typeof createRelevanceScorer>;
  private providers: TrendProviders;

  constructor(
    trendStore: TrendStore,
    contentStore: ContentStore,
    voiceProfileStore: VoiceProfileStore,
    config?: TrendMonitoringServiceConfig
  ) {
    // Initialize providers based on config
    this.providers = this.initializeProviders(config?.trendMonitoring);

    // Initialize aggregator
    this.aggregator = createTrendAggregator(trendStore, this.providers, {
      refreshIntervalMinutes: config?.trendMonitoring?.refreshIntervalMinutes,
      maxTrendsPerSource: config?.trendMonitoring?.maxTrendsPerSource,
      cacheTTLMinutes: config?.trendMonitoring?.caching?.ttlMinutes,
    });

    // Initialize alert engine
    this.alertEngine = createAlertEngine(trendStore, this.aggregator, {
      checkIntervalMinutes: config?.trendMonitoring?.refreshIntervalMinutes,
      minRelevanceScore: config?.trendMonitoring?.alerting?.minRelevanceScore,
    });

    // Initialize relevance scorer
    this.relevanceScorer = createRelevanceScorer(contentStore, voiceProfileStore);
  }

  /**
   * Initialize trend providers based on config
   */
  private initializeProviders(config?: TrendMonitoringConfig): TrendProviders {
    const providers: TrendProviders = {};

    if (!config || config.sources?.twitter?.enabled !== false) {
      providers.twitter = createTwitterTrendsProvider(config?.sources?.twitter);
    }

    if (!config || config.sources?.reddit?.enabled !== false) {
      providers.reddit = createRedditProvider(config?.sources?.reddit);
    }

    if (!config || config.sources?.hackernews?.enabled !== false) {
      providers.hackernews = createHackerNewsProvider(config?.sources?.hackernews);
    }

    return providers;
  }

  // ==========================================================================
  // Trend Fetching
  // ==========================================================================

  /**
   * Fetch trends from all sources
   */
  async fetchTrends(force?: boolean): Promise<AggregatedTrends> {
    return this.aggregator.fetchTrends(force);
  }

  /**
   * Get cached/stored trends
   */
  async getTrends(options?: {
    sources?: TrendSource[];
    category?: string;
    limit?: number;
  }): Promise<AggregatedTrends> {
    return this.aggregator.getTrends(options);
  }

  /**
   * Search trends by keywords
   */
  async searchTrends(keywords: string[]): Promise<TrendItem[]> {
    return this.aggregator.searchTrends(keywords);
  }

  /**
   * Get emerging trends
   */
  async getEmergingTrends(limit?: number): Promise<TrendItem[]> {
    return this.aggregator.getEmergingTrends(limit);
  }

  /**
   * Get cross-platform trends
   */
  async getCrossPlatformTrends(): Promise<TrendItem[]> {
    return this.aggregator.getCrossPlatformTrends();
  }

  // ==========================================================================
  // Alerts
  // ==========================================================================

  /**
   * Create a trend alert
   */
  async createAlert(alert: {
    userId: string;
    name: string;
    keywords: string[];
    sources?: TrendSource[];
    minVolume?: number;
    minVelocity?: number;
    notificationChannels?: ('email' | 'push' | 'webhook')[];
    webhookUrl?: string;
  }): Promise<TrendAlert> {
    return this.alertEngine.createAlert({
      userId: alert.userId,
      name: alert.name,
      keywords: alert.keywords,
      sources: alert.sources ?? ['twitter', 'reddit', 'hackernews'],
      minVolume: alert.minVolume,
      minVelocity: alert.minVelocity,
      notificationChannels: alert.notificationChannels ?? ['push'],
      webhookUrl: alert.webhookUrl,
      enabled: true,
    });
  }

  /**
   * Update an alert
   */
  async updateAlert(alertId: string, updates: Partial<TrendAlert>) {
    return this.alertEngine.updateAlert(alertId, updates);
  }

  /**
   * Delete an alert
   */
  async deleteAlert(alertId: string): Promise<boolean> {
    return this.alertEngine.deleteAlert(alertId);
  }

  /**
   * Get alerts for a user
   */
  async getUserAlerts(userId: string): Promise<TrendAlert[]> {
    return this.alertEngine.getUserAlerts(userId);
  }

  /**
   * Register a notification handler
   */
  onAlert(handler: AlertNotificationHandler): () => void {
    return this.alertEngine.registerNotificationHandler(handler);
  }

  /**
   * Preview what keywords would match
   */
  async previewAlert(keywords: string[], sources?: TrendSource[]) {
    return this.alertEngine.previewAlert(keywords, sources);
  }

  // ==========================================================================
  // Relevance Scoring
  // ==========================================================================

  /**
   * Score a trend's relevance for a user
   */
  async scoreTrendRelevance(
    trend: TrendItem,
    context: UserContext
  ): Promise<RelevanceScore> {
    return this.relevanceScorer.scoreTrend(trend, context);
  }

  /**
   * Get relevant trends for a user
   */
  async getRelevantTrends(
    context: UserContext,
    options?: { minScore?: number; limit?: number }
  ): Promise<{ trend: TrendItem; score: RelevanceScore }[]> {
    const trends = await this.aggregator.fetchTrends();
    const scored = await this.relevanceScorer.scoreTrends(trends.all, context);

    let filtered = scored;
    if (options?.minScore) {
      filtered = filtered.filter(item => item.score.overall >= options.minScore!);
    }
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * Get content suggestions based on trends
   */
  async getContentSuggestions(
    context: UserContext,
    limit?: number
  ): Promise<{
    trend: TrendItem;
    score: RelevanceScore;
    suggestion: string;
  }[]> {
    const trends = await this.aggregator.fetchTrends();
    return this.relevanceScorer.getContentSuggestions(trends.all, context, limit);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start the monitoring service
   */
  start(): void {
    this.alertEngine.start();
  }

  /**
   * Stop the monitoring service
   */
  stop(): void {
    this.alertEngine.stop();
  }

  /**
   * Initialize all providers
   */
  async initialize(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    if (this.providers.twitter) {
      initPromises.push(this.providers.twitter.initialize());
    }
    if (this.providers.reddit) {
      initPromises.push(this.providers.reddit.initialize());
    }
    if (this.providers.hackernews) {
      initPromises.push(this.providers.hackernews.initialize());
    }

    await Promise.all(initPromises);
  }

  /**
   * Clean up expired data
   */
  async cleanup(): Promise<void> {
    await this.aggregator.cleanupExpired();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTrendMonitoringService(
  trendStore: TrendStore,
  contentStore: ContentStore,
  voiceProfileStore: VoiceProfileStore,
  config?: TrendMonitoringServiceConfig
): TrendMonitoringService {
  return new TrendMonitoringService(trendStore, contentStore, voiceProfileStore, config);
}
