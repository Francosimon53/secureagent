/**
 * Sleep Monitoring Service
 *
 * Orchestrates sleep data aggregation, quality scoring, and alerting.
 */

import { EventEmitter } from 'events';
import type { SleepStore } from '../stores/sleep-store.js';
import type {
  SleepRecord,
  SleepAlert,
  AggregatedSleepData,
  SleepQualityMetrics,
  WearableSource,
  WELLNESS_EVENTS,
} from '../types.js';
import {
  SleepAggregator,
  createSleepAggregator,
  type AggregatorConfig,
} from './aggregator.js';
import {
  SleepAlertEngine,
  createSleepAlertEngine,
  type AlertEngineConfig,
  type AlertEvaluationResult,
} from './alert-engine.js';
import {
  SleepQualityScorer,
  createSleepQualityScorer,
  type ScoringConfig,
  type SleepScoreBreakdown,
} from './quality-scorer.js';

// =============================================================================
// Re-exports
// =============================================================================

export {
  SleepAggregator,
  createSleepAggregator,
  type AggregatorConfig,
} from './aggregator.js';
export {
  SleepAlertEngine,
  createSleepAlertEngine,
  type AlertEngineConfig,
  type AlertEvaluationResult,
} from './alert-engine.js';
export {
  SleepQualityScorer,
  createSleepQualityScorer,
  type ScoringConfig,
  type SleepScoreBreakdown,
} from './quality-scorer.js';

// =============================================================================
// Sleep Monitoring Service Configuration
// =============================================================================

export interface SleepMonitoringServiceConfig {
  enabled: boolean;
  aggregator?: Partial<AggregatorConfig>;
  alertEngine?: Partial<AlertEngineConfig>;
  scorer?: Partial<ScoringConfig>;
}

const DEFAULT_CONFIG: SleepMonitoringServiceConfig = {
  enabled: true,
};

// =============================================================================
// Sleep Summary
// =============================================================================

export interface SleepSummary {
  userId: string;
  period: {
    startDate: number;
    endDate: number;
    nights: number;
  };
  averages: {
    duration: number;
    efficiency: number;
    score: number;
    bedtime: string;
    wakeTime: string;
  };
  trends: {
    duration: 'improving' | 'stable' | 'declining';
    efficiency: 'improving' | 'stable' | 'declining';
  };
  sleepDebt: number;
  recommendations: string[];
}

// =============================================================================
// Sleep Monitoring Service
// =============================================================================

export class SleepMonitoringService extends EventEmitter {
  private readonly config: SleepMonitoringServiceConfig;
  private readonly aggregator: SleepAggregator;
  private readonly alertEngine: SleepAlertEngine;
  private readonly scorer: SleepQualityScorer;

  constructor(
    private readonly store: SleepStore,
    config: Partial<SleepMonitoringServiceConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.aggregator = createSleepAggregator(store, config.aggregator);
    this.alertEngine = createSleepAlertEngine(store, config.alertEngine);
    this.scorer = createSleepQualityScorer(config.scorer);

    // Forward alert events
    this.alertEngine.on('alert:triggered', (event) => {
      this.emit('alert:triggered', event);
    });
  }

  /**
   * Process new sleep data
   */
  async processSleepData(sleepRecord: SleepRecord): Promise<{
    qualityMetrics: SleepQualityMetrics;
    scoreBreakdown: SleepScoreBreakdown;
    alerts: AlertEvaluationResult[];
  }> {
    // Calculate quality metrics
    const scoreBreakdown = this.scorer.calculateScore(sleepRecord);
    const qualityMetrics = this.scorer.calculateMetrics(sleepRecord);

    // Evaluate alerts
    const alerts = await this.alertEngine.evaluateAlerts(sleepRecord.userId, sleepRecord);

    // Emit processed event
    this.emit('sleep:processed', {
      userId: sleepRecord.userId,
      sleepRecord,
      qualityMetrics,
      scoreBreakdown,
    });

    return {
      qualityMetrics,
      scoreBreakdown,
      alerts,
    };
  }

  /**
   * Get aggregated sleep for a specific date
   */
  async getAggregatedSleep(userId: string, date: number): Promise<AggregatedSleepData | null> {
    return this.aggregator.getAggregatedSleep(userId, date);
  }

  /**
   * Get aggregated sleep for a date range
   */
  async getAggregatedSleepRange(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<AggregatedSleepData[]> {
    return this.aggregator.getAggregatedSleepRange(userId, startDate, endDate);
  }

  /**
   * Get detailed sleep score breakdown
   */
  async getSleepScoreBreakdown(sleepRecordId: string): Promise<SleepScoreBreakdown | null> {
    const record = await this.store.getSleepRecord(sleepRecordId);
    if (!record) return null;
    return this.scorer.calculateScore(record);
  }

  /**
   * Get sleep summary for a period
   */
  async getSleepSummary(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<SleepSummary> {
    const records = await this.store.listSleepRecords(userId, {
      startDate,
      endDate,
      orderDirection: 'asc',
      limit: 1000,
    });

    const nights = records.length;

    if (nights === 0) {
      return {
        userId,
        period: { startDate, endDate, nights: 0 },
        averages: {
          duration: 0,
          efficiency: 0,
          score: 0,
          bedtime: '--:--',
          wakeTime: '--:--',
        },
        trends: {
          duration: 'stable',
          efficiency: 'stable',
        },
        sleepDebt: 0,
        recommendations: ['No sleep data available for this period'],
      };
    }

    // Calculate averages
    const avgDuration = this.average(records.map((r) => r.totalSleepMinutes));
    const avgEfficiency = this.average(
      records.map((r) => r.sleepEfficiency).filter((e): e is number => e !== undefined)
    );
    const avgScore = this.average(
      records.map((r) => r.sleepScore).filter((s): s is number => s !== undefined)
    );

    const avgBedtime = this.averageTime(records.map((r) => r.bedtime));
    const avgWakeTime = this.averageTime(records.map((r) => r.wakeTime));

    // Calculate trends (compare first half to second half)
    const midPoint = Math.floor(records.length / 2);
    const firstHalf = records.slice(0, midPoint);
    const secondHalf = records.slice(midPoint);

    const durationTrend = this.calculateTrend(
      this.average(firstHalf.map((r) => r.totalSleepMinutes)),
      this.average(secondHalf.map((r) => r.totalSleepMinutes))
    );

    const efficiencyTrend = this.calculateTrend(
      this.average(firstHalf.map((r) => r.sleepEfficiency).filter((e): e is number => e !== undefined)),
      this.average(secondHalf.map((r) => r.sleepEfficiency).filter((e): e is number => e !== undefined))
    );

    // Calculate sleep debt (target - actual) over period
    const targetMinutes = this.scorer['config'].targetSleepMinutes;
    const sleepDebt = records.reduce((debt, r) => {
      return debt + Math.max(0, targetMinutes - r.totalSleepMinutes);
    }, 0);

    // Generate recommendations
    const recommendations: string[] = [];
    if (avgDuration < 420) {
      recommendations.push('Your average sleep duration is below 7 hours. Aim for 7-9 hours nightly.');
    }
    if (avgEfficiency < 85) {
      recommendations.push('Your sleep efficiency could improve. Try limiting screen time before bed.');
    }
    if (sleepDebt > 300) {
      recommendations.push(
        `You have accumulated ${Math.round(sleepDebt / 60)} hours of sleep debt. Consider catching up gradually.`
      );
    }
    if (durationTrend === 'declining') {
      recommendations.push('Your sleep duration is trending down. Prioritize getting more rest.');
    }

    return {
      userId,
      period: { startDate, endDate, nights },
      averages: {
        duration: Math.round(avgDuration),
        efficiency: Math.round(avgEfficiency || 0),
        score: Math.round(avgScore || 0),
        bedtime: avgBedtime,
        wakeTime: avgWakeTime,
      },
      trends: {
        duration: durationTrend,
        efficiency: efficiencyTrend,
      },
      sleepDebt: Math.round(sleepDebt),
      recommendations: recommendations.slice(0, 3),
    };
  }

  /**
   * Get latest sleep record
   */
  async getLatestSleep(userId: string, source?: WearableSource): Promise<SleepRecord | null> {
    return this.store.getLatestSleepRecord(userId, source);
  }

  /**
   * Create a sleep alert
   */
  async createAlert(
    userId: string,
    alertType: SleepAlert['alertType'],
    condition: SleepAlert['condition'],
    threshold: number,
    notificationChannels?: string[]
  ): Promise<SleepAlert> {
    return this.alertEngine.createAlert(userId, alertType, condition, threshold, notificationChannels);
  }

  /**
   * Get user's sleep alerts
   */
  async getAlerts(userId: string, enabled?: boolean): Promise<SleepAlert[]> {
    return this.store.listSleepAlerts(userId, enabled);
  }

  /**
   * Update a sleep alert
   */
  async updateAlert(alertId: string, updates: Partial<SleepAlert>): Promise<SleepAlert | null> {
    return this.store.updateSleepAlert(alertId, updates);
  }

  /**
   * Delete a sleep alert
   */
  async deleteAlert(alertId: string): Promise<boolean> {
    return this.store.deleteSleepAlert(alertId);
  }

  /**
   * Get preset alert configurations
   */
  getPresetAlerts() {
    return this.alertEngine.getPresetAlerts();
  }

  // Helper methods

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private averageTime(timestamps: number[]): string {
    if (timestamps.length === 0) return '--:--';

    // Use circular mean for times
    let sinSum = 0;
    let cosSum = 0;

    for (const ts of timestamps) {
      const date = new Date(ts);
      const hours = date.getHours() + date.getMinutes() / 60;
      const radians = (hours / 24) * 2 * Math.PI;
      sinSum += Math.sin(radians);
      cosSum += Math.cos(radians);
    }

    const avgRadians = Math.atan2(sinSum / timestamps.length, cosSum / timestamps.length);
    const avgHours = ((avgRadians / (2 * Math.PI)) * 24 + 24) % 24;

    const hours = Math.floor(avgHours);
    const minutes = Math.round((avgHours % 1) * 60);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  private calculateTrend(
    first: number,
    second: number
  ): 'improving' | 'stable' | 'declining' {
    if (first === 0 || second === 0) return 'stable';

    const changePercent = ((second - first) / first) * 100;

    if (changePercent > 5) return 'improving';
    if (changePercent < -5) return 'declining';
    return 'stable';
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createSleepMonitoringService(
  store: SleepStore,
  config?: Partial<SleepMonitoringServiceConfig>
): SleepMonitoringService {
  return new SleepMonitoringService(store, config);
}
