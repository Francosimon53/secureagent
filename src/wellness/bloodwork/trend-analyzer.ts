/**
 * Trend Analyzer
 *
 * Analyzes historical biomarker data to identify trends and generate recommendations.
 */

import type { Biomarker, BiomarkerTrend, TrendDataPoint, BiomarkerStatus } from '../types.js';

// =============================================================================
// Trend Configuration
// =============================================================================

export interface TrendAnalyzerConfig {
  minDataPoints: number;
  trendPeriodDays: number;
  significantChangeThreshold: number;
}

const DEFAULT_CONFIG: TrendAnalyzerConfig = {
  minDataPoints: 2,
  trendPeriodDays: 365,
  significantChangeThreshold: 10, // 10% change is significant
};

// =============================================================================
// Trend Direction Type
// =============================================================================

type TrendDirection = 'improving' | 'stable' | 'declining' | 'unknown';

// =============================================================================
// Biomarker Direction Definitions
// =============================================================================

/**
 * Defines what direction is "improving" for each biomarker
 * true = lower is better, false = higher is better, undefined = neutral
 */
const LOWER_IS_BETTER: Record<string, boolean> = {
  // Lipids
  'total cholesterol': true,
  'ldl cholesterol': true,
  triglycerides: true,
  // HDL is exception - higher is better

  // Metabolic
  glucose: true,
  'fasting glucose': true,
  hba1c: true,

  // Inflammation
  'c-reactive protein': true,
  crp: true,
  'hs-crp': true,
  homocysteine: true,

  // Liver enzymes
  ast: true,
  alt: true,
  'total bilirubin': true,
  ggt: true,

  // Other
  'uric acid': true,
};

const HIGHER_IS_BETTER: Record<string, boolean> = {
  'hdl cholesterol': true,
  hdl: true,
  'vitamin d': true,
  'vitamin b12': true,
  ferritin: true,
  iron: true,
  hemoglobin: true,
  hematocrit: true,
};

// =============================================================================
// Recommendation Templates
// =============================================================================

interface RecommendationTemplate {
  improving: string;
  declining: string;
  stable_good: string;
  stable_bad: string;
}

const RECOMMENDATIONS: Record<string, RecommendationTemplate> = {
  'ldl cholesterol': {
    improving: 'LDL cholesterol is improving. Continue current lifestyle and dietary habits.',
    declining:
      'LDL cholesterol is trending up. Consider reducing saturated fat intake and increasing fiber.',
    stable_good: 'LDL cholesterol remains within healthy range.',
    stable_bad: 'LDL cholesterol remains elevated. Discuss statin therapy with your doctor.',
  },
  'hdl cholesterol': {
    improving: 'HDL cholesterol is improving. Keep up the physical activity.',
    declining: 'HDL cholesterol is declining. Consider increasing aerobic exercise.',
    stable_good: 'HDL cholesterol remains at a healthy level.',
    stable_bad: 'HDL cholesterol remains low. Increase cardio exercise and omega-3 intake.',
  },
  triglycerides: {
    improving: 'Triglycerides are improving. Continue limiting sugars and refined carbs.',
    declining: 'Triglycerides are trending up. Reduce sugar, alcohol, and refined carbohydrates.',
    stable_good: 'Triglycerides remain within healthy range.',
    stable_bad: 'Triglycerides remain elevated. Limit sugar and increase omega-3 fatty acids.',
  },
  hba1c: {
    improving: 'HbA1c is improving. Blood sugar management is on track.',
    declining:
      'HbA1c is trending up. Review carbohydrate intake and consider more frequent glucose monitoring.',
    stable_good: 'HbA1c remains within healthy range. Good metabolic health.',
    stable_bad: 'HbA1c remains elevated. Work with your doctor on glucose management strategies.',
  },
  'vitamin d': {
    improving: 'Vitamin D levels are improving. Continue current supplementation.',
    declining: 'Vitamin D is declining. Consider increasing sun exposure or supplementation.',
    stable_good: 'Vitamin D remains at optimal levels.',
    stable_bad: 'Vitamin D remains low. Consider vitamin D3 supplementation (2000-4000 IU daily).',
  },
  default: {
    improving: 'This biomarker is trending in a positive direction.',
    declining: 'This biomarker is trending in a direction that may warrant attention.',
    stable_good: 'This biomarker remains stable within healthy range.',
    stable_bad: 'This biomarker remains outside the optimal range.',
  },
};

// =============================================================================
// Trend Analyzer Class
// =============================================================================

export class TrendAnalyzer {
  private readonly config: TrendAnalyzerConfig;

  constructor(config: Partial<TrendAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze trends for multiple biomarkers
   */
  analyzeAll(biomarkerHistory: Map<string, Biomarker[]>): BiomarkerTrend[] {
    const trends: BiomarkerTrend[] = [];

    for (const [name, history] of biomarkerHistory) {
      const trend = this.analyze(name, history);
      if (trend) {
        trends.push(trend);
      }
    }

    return trends;
  }

  /**
   * Analyze trend for a single biomarker
   */
  analyze(biomarkerName: string, history: Biomarker[]): BiomarkerTrend | null {
    if (history.length < this.config.minDataPoints) {
      return null;
    }

    // Sort by date ascending
    const sorted = [...history].sort((a, b) => a.testDate - b.testDate);

    // Filter to trend period
    const cutoffDate = Date.now() - this.config.trendPeriodDays * 24 * 60 * 60 * 1000;
    const inPeriod = sorted.filter((b) => b.testDate >= cutoffDate);

    if (inPeriod.length < this.config.minDataPoints) {
      return null;
    }

    // Create data points
    const dataPoints: TrendDataPoint[] = inPeriod.map((b) => ({
      date: b.testDate,
      value: b.value,
      status: b.status,
    }));

    // Calculate trend direction
    const { direction, changePercent } = this.calculateTrend(biomarkerName, dataPoints);

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      biomarkerName,
      direction,
      inPeriod[inPeriod.length - 1]
    );

    return {
      biomarkerName,
      dataPoints,
      direction,
      changePercent,
      recommendation,
    };
  }

  /**
   * Calculate trend direction and change percentage
   */
  private calculateTrend(
    biomarkerName: string,
    dataPoints: TrendDataPoint[]
  ): { direction: TrendDirection; changePercent: number } {
    if (dataPoints.length < 2) {
      return { direction: 'unknown', changePercent: 0 };
    }

    const first = dataPoints[0];
    const last = dataPoints[dataPoints.length - 1];

    // Calculate percentage change
    const changePercent = first.value !== 0 ? ((last.value - first.value) / first.value) * 100 : 0;

    // Determine if change is significant
    const isSignificant = Math.abs(changePercent) >= this.config.significantChangeThreshold;

    if (!isSignificant) {
      return { direction: 'stable', changePercent };
    }

    // Determine direction based on whether increase or decrease is good
    const direction = this.determineDirection(biomarkerName, changePercent);

    return { direction, changePercent };
  }

  /**
   * Determine if trend is improving or declining
   */
  private determineDirection(biomarkerName: string, changePercent: number): TrendDirection {
    const normalizedName = biomarkerName.toLowerCase();

    // Check if lower is better for this biomarker
    for (const [key, _] of Object.entries(LOWER_IS_BETTER)) {
      if (normalizedName.includes(key)) {
        // For "lower is better" biomarkers:
        // - Negative change (decreasing) = improving
        // - Positive change (increasing) = declining
        return changePercent < 0 ? 'improving' : 'declining';
      }
    }

    // Check if higher is better for this biomarker
    for (const [key, _] of Object.entries(HIGHER_IS_BETTER)) {
      if (normalizedName.includes(key)) {
        // For "higher is better" biomarkers:
        // - Positive change (increasing) = improving
        // - Negative change (decreasing) = declining
        return changePercent > 0 ? 'improving' : 'declining';
      }
    }

    // For biomarkers where direction isn't clear, use status
    // If moving toward normal = improving, away = declining
    return 'stable';
  }

  /**
   * Generate recommendation based on trend
   */
  private generateRecommendation(
    biomarkerName: string,
    direction: TrendDirection,
    latestValue: Biomarker
  ): string {
    const normalizedName = biomarkerName.toLowerCase();

    // Find matching recommendation template
    let template: RecommendationTemplate = RECOMMENDATIONS.default;
    for (const [key, rec] of Object.entries(RECOMMENDATIONS)) {
      if (normalizedName.includes(key)) {
        template = rec;
        break;
      }
    }

    const isInNormalRange = latestValue.status === 'normal';

    switch (direction) {
      case 'improving':
        return template.improving;
      case 'declining':
        return template.declining;
      case 'stable':
        return isInNormalRange ? template.stable_good : template.stable_bad;
      default:
        return 'Insufficient data to determine trend. Continue monitoring.';
    }
  }

  /**
   * Calculate linear regression slope
   */
  calculateSlope(dataPoints: TrendDataPoint[]): number {
    if (dataPoints.length < 2) return 0;

    const n = dataPoints.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    // Normalize timestamps to days from first point
    const firstDate = dataPoints[0].date;

    for (const point of dataPoints) {
      const x = (point.date - firstDate) / (24 * 60 * 60 * 1000); // Days
      const y = point.value;

      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  /**
   * Predict future value based on trend
   */
  predictValue(dataPoints: TrendDataPoint[], daysInFuture: number): number | null {
    if (dataPoints.length < 2) return null;

    const slope = this.calculateSlope(dataPoints);
    const lastPoint = dataPoints[dataPoints.length - 1];

    // Calculate days from first point to prediction
    const firstDate = dataPoints[0].date;
    const lastDays = (lastPoint.date - firstDate) / (24 * 60 * 60 * 1000);
    const futureDays = lastDays + daysInFuture;

    // Linear regression: y = mx + b
    // Calculate b using last known point
    const b = lastPoint.value - slope * lastDays;

    return slope * futureDays + b;
  }

  /**
   * Identify biomarkers needing attention
   */
  identifyAlertsNeeded(trends: BiomarkerTrend[]): BiomarkerTrend[] {
    return trends.filter((trend) => {
      // Alert if declining
      if (trend.direction === 'declining') return true;

      // Alert if latest value is abnormal
      const latest = trend.dataPoints[trend.dataPoints.length - 1];
      if (latest && latest.status !== 'normal') return true;

      return false;
    });
  }

  /**
   * Get summary statistics for trends
   */
  getSummary(trends: BiomarkerTrend[]): {
    total: number;
    improving: number;
    stable: number;
    declining: number;
    unknown: number;
    needsAttention: number;
  } {
    const summary = {
      total: trends.length,
      improving: 0,
      stable: 0,
      declining: 0,
      unknown: 0,
      needsAttention: 0,
    };

    for (const trend of trends) {
      summary[trend.direction]++;

      // Count those needing attention
      if (trend.direction === 'declining') {
        summary.needsAttention++;
      } else {
        const latest = trend.dataPoints[trend.dataPoints.length - 1];
        if (latest && latest.status !== 'normal') {
          summary.needsAttention++;
        }
      }
    }

    return summary;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTrendAnalyzer(config?: Partial<TrendAnalyzerConfig>): TrendAnalyzer {
  return new TrendAnalyzer(config);
}
