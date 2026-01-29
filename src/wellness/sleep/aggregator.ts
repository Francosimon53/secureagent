/**
 * Sleep Data Aggregator
 *
 * Aggregates sleep data from multiple sources into unified sleep records.
 */

import type { SleepStore } from '../stores/sleep-store.js';
import type {
  SleepRecord,
  AggregatedSleepData,
  SleepQualityMetrics,
  WearableSource,
} from '../types.js';

// =============================================================================
// Aggregation Configuration
// =============================================================================

export interface AggregatorConfig {
  preferredSource: WearableSource | 'auto';
  aggregationStrategy: 'prefer_primary' | 'average' | 'highest_quality';
}

const DEFAULT_CONFIG: AggregatorConfig = {
  preferredSource: 'auto',
  aggregationStrategy: 'prefer_primary',
};

// =============================================================================
// Source Priority
// =============================================================================

const SOURCE_PRIORITY: Record<WearableSource, number> = {
  whoop: 1, // Highest priority - most accurate sleep tracking
  garmin: 2,
  apple_health: 3,
  manual: 4,
};

// =============================================================================
// Sleep Data Aggregator
// =============================================================================

export class SleepAggregator {
  private readonly config: AggregatorConfig;

  constructor(
    private readonly store: SleepStore,
    config: Partial<AggregatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get aggregated sleep data for a specific date
   */
  async getAggregatedSleep(userId: string, date: number): Promise<AggregatedSleepData | null> {
    // Get start and end of day
    const dayStart = this.startOfDay(date);
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    // Get all sleep records for the date from all sources
    const records = await this.store.getSleepRecordsByDateRange(userId, dayStart, dayEnd);

    if (records.length === 0) {
      return null;
    }

    return this.aggregateRecords(userId, date, records);
  }

  /**
   * Get aggregated sleep data for a date range
   */
  async getAggregatedSleepRange(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<AggregatedSleepData[]> {
    const results: AggregatedSleepData[] = [];
    let currentDate = this.startOfDay(startDate);

    while (currentDate <= endDate) {
      const aggregated = await this.getAggregatedSleep(userId, currentDate);
      if (aggregated) {
        results.push(aggregated);
      }
      currentDate += 24 * 60 * 60 * 1000;
    }

    return results;
  }

  /**
   * Aggregate multiple sleep records into one
   */
  private aggregateRecords(
    userId: string,
    date: number,
    records: SleepRecord[]
  ): AggregatedSleepData {
    const sources = [...new Set(records.map((r) => r.source))];
    const primarySource = this.selectPrimarySource(records);
    const primaryRecord = records.find((r) => r.source === primarySource) ?? records[0];

    switch (this.config.aggregationStrategy) {
      case 'average':
        return this.aggregateByAverage(userId, date, sources, primarySource, records);
      case 'highest_quality':
        return this.aggregateByHighestQuality(userId, date, sources, records);
      case 'prefer_primary':
      default:
        return this.aggregateByPrimary(userId, date, sources, primarySource, primaryRecord, records);
    }
  }

  /**
   * Aggregate using primary source with fallback data
   */
  private aggregateByPrimary(
    userId: string,
    date: number,
    sources: WearableSource[],
    primarySource: WearableSource,
    primaryRecord: SleepRecord,
    records: SleepRecord[]
  ): AggregatedSleepData {
    // Calculate quality metrics from all sources
    const qualityMetrics = this.calculateQualityMetrics(records);

    return {
      userId,
      date,
      sources,
      primarySource,
      bedtime: primaryRecord.bedtime,
      wakeTime: primaryRecord.wakeTime,
      totalSleepMinutes: primaryRecord.totalSleepMinutes,
      sleepScore: primaryRecord.sleepScore ?? this.calculateSleepScore(primaryRecord, qualityMetrics),
      qualityMetrics,
    };
  }

  /**
   * Aggregate by averaging values from all sources
   */
  private aggregateByAverage(
    userId: string,
    date: number,
    sources: WearableSource[],
    primarySource: WearableSource,
    records: SleepRecord[]
  ): AggregatedSleepData {
    // Average key metrics
    const avgBedtime = this.averageTimestamps(records.map((r) => r.bedtime));
    const avgWakeTime = this.averageTimestamps(records.map((r) => r.wakeTime));
    const avgDuration = this.average(records.map((r) => r.totalSleepMinutes));
    const avgScore = this.average(records.map((r) => r.sleepScore).filter((s): s is number => s !== undefined));

    const qualityMetrics = this.calculateQualityMetrics(records);

    return {
      userId,
      date,
      sources,
      primarySource,
      bedtime: avgBedtime,
      wakeTime: avgWakeTime,
      totalSleepMinutes: Math.round(avgDuration),
      sleepScore: avgScore > 0 ? Math.round(avgScore) : this.calculateSleepScoreFromMetrics(qualityMetrics),
      qualityMetrics,
    };
  }

  /**
   * Aggregate selecting data from highest quality source for each metric
   */
  private aggregateByHighestQuality(
    userId: string,
    date: number,
    sources: WearableSource[],
    records: SleepRecord[]
  ): AggregatedSleepData {
    // Sort records by quality indicators
    const sorted = [...records].sort((a, b) => {
      // Prefer records with more data
      const aCompleteness = this.calculateCompleteness(a);
      const bCompleteness = this.calculateCompleteness(b);
      if (aCompleteness !== bCompleteness) {
        return bCompleteness - aCompleteness;
      }
      // Fall back to source priority
      return SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source];
    });

    const best = sorted[0];
    const primarySource = best.source;
    const qualityMetrics = this.calculateQualityMetrics(records);

    return {
      userId,
      date,
      sources,
      primarySource,
      bedtime: best.bedtime,
      wakeTime: best.wakeTime,
      totalSleepMinutes: best.totalSleepMinutes,
      sleepScore: best.sleepScore ?? this.calculateSleepScore(best, qualityMetrics),
      qualityMetrics,
    };
  }

  /**
   * Select primary source based on configuration
   */
  private selectPrimarySource(records: SleepRecord[]): WearableSource {
    if (this.config.preferredSource !== 'auto') {
      const preferred = records.find((r) => r.source === this.config.preferredSource);
      if (preferred) {
        return this.config.preferredSource;
      }
    }

    // Auto-select based on priority
    const sorted = [...records].sort(
      (a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]
    );
    return sorted[0].source;
  }

  /**
   * Calculate quality metrics from records
   */
  private calculateQualityMetrics(records: SleepRecord[]): SleepQualityMetrics {
    // Efficiency: time asleep / time in bed
    const efficiencies = records
      .map((r) => r.sleepEfficiency)
      .filter((e): e is number => e !== undefined);
    const efficiency = efficiencies.length > 0 ? this.average(efficiencies) : 85;

    // Duration score: based on 7-9 hour target
    const durations = records.map((r) => r.totalSleepMinutes);
    const avgDuration = this.average(durations);
    const durationScore = this.scoreDuration(avgDuration);

    // Depth score: based on deep + REM percentage
    const depthScores: number[] = [];
    for (const r of records) {
      if (r.deepMinutes !== undefined || r.remMinutes !== undefined) {
        const deep = r.deepMinutes ?? 0;
        const rem = r.remMinutes ?? 0;
        const total = r.totalSleepMinutes;
        if (total > 0) {
          const depthPercent = ((deep + rem) / total) * 100;
          depthScores.push(this.scoreDepth(depthPercent));
        }
      }
    }
    const depth = depthScores.length > 0 ? this.average(depthScores) : 70;

    // Consistency: variation in bedtime/wake time (requires multiple days)
    const consistency = 80; // Default, would need history to calculate

    // Overall score
    const overall = Math.round(
      efficiency * 0.25 + durationScore * 0.3 + depth * 0.25 + consistency * 0.2
    );

    return {
      efficiency: Math.round(efficiency),
      consistency: Math.round(consistency),
      duration: Math.round(durationScore),
      depth: Math.round(depth),
      overall,
    };
  }

  /**
   * Calculate sleep score from a single record
   */
  private calculateSleepScore(record: SleepRecord, metrics: SleepQualityMetrics): number {
    if (record.sleepScore !== undefined) {
      return record.sleepScore;
    }
    return this.calculateSleepScoreFromMetrics(metrics);
  }

  /**
   * Calculate sleep score from quality metrics
   */
  private calculateSleepScoreFromMetrics(metrics: SleepQualityMetrics): number {
    return metrics.overall;
  }

  /**
   * Score duration (target: 7-9 hours = 420-540 minutes)
   */
  private scoreDuration(minutes: number): number {
    if (minutes >= 420 && minutes <= 540) {
      return 100;
    }
    if (minutes < 420) {
      // Below target
      return Math.max(0, 100 - ((420 - minutes) / 420) * 100);
    }
    // Above target (slightly less penalty)
    return Math.max(0, 100 - ((minutes - 540) / 180) * 50);
  }

  /**
   * Score depth (target: 25-30% deep+REM)
   */
  private scoreDepth(percent: number): number {
    if (percent >= 25 && percent <= 35) {
      return 100;
    }
    if (percent < 25) {
      return Math.max(0, 100 - ((25 - percent) / 25) * 100);
    }
    return Math.max(50, 100 - ((percent - 35) / 20) * 50);
  }

  /**
   * Calculate record completeness (0-1)
   */
  private calculateCompleteness(record: SleepRecord): number {
    let score = 0;
    const fields = [
      'totalSleepMinutes',
      'remMinutes',
      'deepMinutes',
      'lightMinutes',
      'sleepEfficiency',
      'sleepScore',
      'sleepNeed',
      'disturbances',
    ] as const;

    for (const field of fields) {
      if (record[field] !== undefined) {
        score += 1;
      }
    }

    return score / fields.length;
  }

  /**
   * Average numbers
   */
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Average timestamps (handling midnight crossing)
   */
  private averageTimestamps(timestamps: number[]): number {
    if (timestamps.length === 0) return 0;
    if (timestamps.length === 1) return timestamps[0];

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

    // Use first timestamp as base date
    const baseDate = new Date(timestamps[0]);
    baseDate.setHours(Math.floor(avgHours));
    baseDate.setMinutes(Math.round((avgHours % 1) * 60));
    baseDate.setSeconds(0);
    baseDate.setMilliseconds(0);

    return baseDate.getTime();
  }

  /**
   * Get start of day timestamp
   */
  private startOfDay(timestamp: number): number {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createSleepAggregator(
  store: SleepStore,
  config?: Partial<AggregatorConfig>
): SleepAggregator {
  return new SleepAggregator(store, config);
}
