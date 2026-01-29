/**
 * Sleep Quality Scorer
 *
 * Calculates comprehensive sleep quality scores from sleep data.
 */

import type { SleepRecord, SleepQualityMetrics, AggregatedSleepData } from '../types.js';

// =============================================================================
// Scoring Configuration
// =============================================================================

export interface ScoringConfig {
  targetSleepMinutes: number;
  targetBedtime: string; // HH:mm
  targetWakeTime: string; // HH:mm
  weights: {
    duration: number;
    efficiency: number;
    timing: number;
    stages: number;
    continuity: number;
  };
}

const DEFAULT_CONFIG: ScoringConfig = {
  targetSleepMinutes: 480, // 8 hours
  targetBedtime: '22:30',
  targetWakeTime: '06:30',
  weights: {
    duration: 0.25,
    efficiency: 0.20,
    timing: 0.15,
    stages: 0.25,
    continuity: 0.15,
  },
};

// =============================================================================
// Detailed Score Breakdown
// =============================================================================

export interface SleepScoreBreakdown {
  overall: number;
  components: {
    duration: {
      score: number;
      actual: number;
      target: number;
      feedback: string;
    };
    efficiency: {
      score: number;
      actual: number;
      target: number;
      feedback: string;
    };
    timing: {
      score: number;
      bedtimeDeviation: number;
      wakeTimeDeviation: number;
      feedback: string;
    };
    stages: {
      score: number;
      deepPercent: number;
      remPercent: number;
      lightPercent: number;
      feedback: string;
    };
    continuity: {
      score: number;
      disturbances: number;
      awakeTime: number;
      feedback: string;
    };
  };
  recommendations: string[];
}

// =============================================================================
// Sleep Quality Scorer
// =============================================================================

export class SleepQualityScorer {
  private readonly config: ScoringConfig;

  constructor(config: Partial<ScoringConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      weights: { ...DEFAULT_CONFIG.weights, ...config.weights },
    };
  }

  /**
   * Calculate comprehensive sleep score with breakdown
   */
  calculateScore(sleep: SleepRecord): SleepScoreBreakdown {
    const duration = this.scoreDuration(sleep);
    const efficiency = this.scoreEfficiency(sleep);
    const timing = this.scoreTiming(sleep);
    const stages = this.scoreStages(sleep);
    const continuity = this.scoreContinuity(sleep);

    // Calculate weighted overall score
    const overall = Math.round(
      duration.score * this.config.weights.duration +
        efficiency.score * this.config.weights.efficiency +
        timing.score * this.config.weights.timing +
        stages.score * this.config.weights.stages +
        continuity.score * this.config.weights.continuity
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      duration,
      efficiency,
      timing,
      stages,
      continuity,
    });

    return {
      overall,
      components: {
        duration,
        efficiency,
        timing,
        stages,
        continuity,
      },
      recommendations,
    };
  }

  /**
   * Calculate simple quality metrics
   */
  calculateMetrics(sleep: SleepRecord): SleepQualityMetrics {
    const breakdown = this.calculateScore(sleep);

    return {
      efficiency: breakdown.components.efficiency.score,
      consistency: breakdown.components.timing.score,
      duration: breakdown.components.duration.score,
      depth: breakdown.components.stages.score,
      overall: breakdown.overall,
    };
  }

  /**
   * Score sleep duration
   */
  private scoreDuration(sleep: SleepRecord): SleepScoreBreakdown['components']['duration'] {
    const actual = sleep.totalSleepMinutes;
    const target = this.config.targetSleepMinutes;

    // Optimal range: target ± 30 minutes
    const deviation = Math.abs(actual - target);
    let score: number;
    let feedback: string;

    if (deviation <= 30) {
      score = 100;
      feedback = 'Excellent sleep duration';
    } else if (actual < target) {
      // Under-sleeping
      score = Math.max(0, 100 - ((target - actual) / target) * 100);
      const deficit = Math.round((target - actual) / 60 * 10) / 10;
      feedback = `${deficit} hours under target`;
    } else {
      // Over-sleeping (slightly less penalty)
      score = Math.max(50, 100 - ((actual - target) / target) * 50);
      const excess = Math.round((actual - target) / 60 * 10) / 10;
      feedback = `${excess} hours over target`;
    }

    return {
      score: Math.round(score),
      actual,
      target,
      feedback,
    };
  }

  /**
   * Score sleep efficiency
   */
  private scoreEfficiency(sleep: SleepRecord): SleepScoreBreakdown['components']['efficiency'] {
    const actual = sleep.sleepEfficiency ?? this.calculateEfficiency(sleep);
    const target = 90; // 90% efficiency is excellent

    let score: number;
    let feedback: string;

    if (actual >= 90) {
      score = 100;
      feedback = 'Excellent sleep efficiency';
    } else if (actual >= 85) {
      score = 90;
      feedback = 'Good sleep efficiency';
    } else if (actual >= 80) {
      score = 75;
      feedback = 'Fair sleep efficiency';
    } else if (actual >= 70) {
      score = 50;
      feedback = 'Below average efficiency';
    } else {
      score = Math.max(0, actual);
      feedback = 'Poor sleep efficiency';
    }

    return {
      score: Math.round(score),
      actual: Math.round(actual),
      target,
      feedback,
    };
  }

  /**
   * Calculate sleep efficiency if not provided
   */
  private calculateEfficiency(sleep: SleepRecord): number {
    const timeInBed = (sleep.wakeTime - sleep.bedtime) / 60000; // minutes
    if (timeInBed <= 0) return 0;
    return (sleep.totalSleepMinutes / timeInBed) * 100;
  }

  /**
   * Score sleep timing (consistency with target bedtime/wake time)
   */
  private scoreTiming(sleep: SleepRecord): SleepScoreBreakdown['components']['timing'] {
    const bedtime = new Date(sleep.bedtime);
    const wakeTime = new Date(sleep.wakeTime);

    const targetBedtime = this.parseTime(this.config.targetBedtime);
    const targetWakeTime = this.parseTime(this.config.targetWakeTime);

    // Calculate deviations in minutes
    const bedtimeDeviation = this.calculateTimeDeviation(
      bedtime.getHours() * 60 + bedtime.getMinutes(),
      targetBedtime
    );
    const wakeTimeDeviation = this.calculateTimeDeviation(
      wakeTime.getHours() * 60 + wakeTime.getMinutes(),
      targetWakeTime
    );

    // Score based on deviation (30 min = no penalty, 2 hours = max penalty)
    const bedtimeScore = Math.max(0, 100 - Math.max(0, bedtimeDeviation - 30) / 1.5);
    const wakeTimeScore = Math.max(0, 100 - Math.max(0, wakeTimeDeviation - 30) / 1.5);

    const score = (bedtimeScore + wakeTimeScore) / 2;

    let feedback: string;
    if (score >= 90) {
      feedback = 'Consistent sleep schedule';
    } else if (score >= 70) {
      feedback = 'Slight timing variation';
    } else if (score >= 50) {
      feedback = 'Inconsistent sleep schedule';
    } else {
      feedback = 'Very inconsistent schedule';
    }

    return {
      score: Math.round(score),
      bedtimeDeviation,
      wakeTimeDeviation,
      feedback,
    };
  }

  /**
   * Score sleep stages (deep and REM)
   */
  private scoreStages(sleep: SleepRecord): SleepScoreBreakdown['components']['stages'] {
    const total = sleep.totalSleepMinutes;
    if (total === 0) {
      return {
        score: 0,
        deepPercent: 0,
        remPercent: 0,
        lightPercent: 0,
        feedback: 'No sleep data',
      };
    }

    const deep = sleep.deepMinutes ?? 0;
    const rem = sleep.remMinutes ?? 0;
    const light = sleep.lightMinutes ?? 0;

    const deepPercent = (deep / total) * 100;
    const remPercent = (rem / total) * 100;
    const lightPercent = (light / total) * 100;

    // Ideal: 15-20% deep, 20-25% REM
    let deepScore: number;
    if (deepPercent >= 15 && deepPercent <= 25) {
      deepScore = 100;
    } else if (deepPercent >= 10) {
      deepScore = 70 + (deepPercent - 10) * 6;
    } else {
      deepScore = deepPercent * 7;
    }

    let remScore: number;
    if (remPercent >= 20 && remPercent <= 30) {
      remScore = 100;
    } else if (remPercent >= 15) {
      remScore = 70 + (remPercent - 15) * 6;
    } else {
      remScore = remPercent * 4.7;
    }

    const score = (deepScore + remScore) / 2;

    let feedback: string;
    if (deep === 0 && rem === 0) {
      feedback = 'Sleep stage data not available';
    } else if (score >= 85) {
      feedback = 'Excellent sleep architecture';
    } else if (score >= 70) {
      feedback = 'Good sleep stages';
    } else if (score >= 50) {
      feedback = 'Below optimal deep/REM sleep';
    } else {
      feedback = 'Poor sleep architecture';
    }

    return {
      score: Math.round(Math.min(100, score)),
      deepPercent: Math.round(deepPercent),
      remPercent: Math.round(remPercent),
      lightPercent: Math.round(lightPercent),
      feedback,
    };
  }

  /**
   * Score sleep continuity (disturbances and awake time)
   */
  private scoreContinuity(sleep: SleepRecord): SleepScoreBreakdown['components']['continuity'] {
    const disturbances = sleep.disturbances ?? 0;
    const awakeTime = sleep.awakeMinutes ?? 0;

    // Score disturbances (0-3 = excellent, 10+ = poor)
    let disturbanceScore: number;
    if (disturbances <= 3) {
      disturbanceScore = 100;
    } else if (disturbances <= 5) {
      disturbanceScore = 85;
    } else if (disturbances <= 8) {
      disturbanceScore = 70;
    } else if (disturbances <= 12) {
      disturbanceScore = 50;
    } else {
      disturbanceScore = Math.max(0, 50 - (disturbances - 12) * 5);
    }

    // Score awake time (0-15 min = excellent, 60+ min = poor)
    let awakeScore: number;
    if (awakeTime <= 15) {
      awakeScore = 100;
    } else if (awakeTime <= 30) {
      awakeScore = 85;
    } else if (awakeTime <= 45) {
      awakeScore = 70;
    } else if (awakeTime <= 60) {
      awakeScore = 55;
    } else {
      awakeScore = Math.max(0, 55 - (awakeTime - 60) / 2);
    }

    const score = (disturbanceScore + awakeScore) / 2;

    let feedback: string;
    if (score >= 90) {
      feedback = 'Excellent sleep continuity';
    } else if (score >= 70) {
      feedback = 'Good sleep continuity';
    } else if (score >= 50) {
      feedback = 'Some sleep fragmentation';
    } else {
      feedback = 'Fragmented sleep';
    }

    return {
      score: Math.round(score),
      disturbances,
      awakeTime,
      feedback,
    };
  }

  /**
   * Parse time string (HH:mm) to minutes from midnight
   */
  private parseTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Calculate time deviation handling midnight crossing
   */
  private calculateTimeDeviation(actual: number, target: number): number {
    let diff = Math.abs(actual - target);
    // Handle midnight crossing
    if (diff > 720) {
      diff = 1440 - diff;
    }
    return diff;
  }

  /**
   * Generate recommendations based on scores
   */
  private generateRecommendations(
    components: SleepScoreBreakdown['components']
  ): string[] {
    const recommendations: string[] = [];

    // Duration recommendations
    if (components.duration.score < 70) {
      if (components.duration.actual < components.duration.target) {
        recommendations.push(
          'Try to go to bed earlier to get more sleep. Aim for at least 7-8 hours.'
        );
      } else {
        recommendations.push(
          'You may be oversleeping. Try setting a consistent wake time and limiting naps.'
        );
      }
    }

    // Efficiency recommendations
    if (components.efficiency.score < 70) {
      recommendations.push(
        'Improve sleep efficiency by only going to bed when truly sleepy and avoiding screens before bed.'
      );
    }

    // Timing recommendations
    if (components.timing.score < 70) {
      recommendations.push(
        'Maintain a consistent sleep schedule, even on weekends. This helps regulate your circadian rhythm.'
      );
    }

    // Stages recommendations
    if (components.stages.score < 70 && components.stages.deepPercent > 0) {
      if (components.stages.deepPercent < 15) {
        recommendations.push(
          'To increase deep sleep, try exercising during the day (not close to bedtime) and avoid alcohol.'
        );
      }
      if (components.stages.remPercent < 20) {
        recommendations.push(
          'To improve REM sleep, maintain consistent sleep duration and avoid sleep deprivation.'
        );
      }
    }

    // Continuity recommendations
    if (components.continuity.score < 70) {
      if (components.continuity.disturbances > 5) {
        recommendations.push(
          'Reduce sleep disturbances by optimizing your sleep environment: dark, quiet, and cool.'
        );
      }
      if (components.continuity.awakeTime > 30) {
        recommendations.push(
          'If you wake during the night, avoid looking at the clock and practice relaxation techniques.'
        );
      }
    }

    // Limit to top 3 recommendations
    return recommendations.slice(0, 3);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createSleepQualityScorer(config?: Partial<ScoringConfig>): SleepQualityScorer {
  return new SleepQualityScorer(config);
}
