/**
 * Confidence Calculator
 *
 * Calculates and updates confidence scores for trade patterns.
 */

import type { TradePattern } from '../types.js';
import { FINANCE_DEFAULTS } from '../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface ConfidenceFactors {
  sampleSize: number;
  successRate: number;
  recency: number; // Days since last use
  consistency: number; // How consistent are the results
  marketConditionMatch: number; // How well current conditions match pattern
}

export interface ConfidenceResult {
  confidence: number;
  factors: ConfidenceFactors;
  recommendation: 'high' | 'medium' | 'low';
  explanation: string;
}

// =============================================================================
// Calculator
// =============================================================================

export class ConfidenceCalculator {
  private readonly config: {
    minSamples: number;
    maxSamples: number;
    decayDays: number;
    minConfidence: number;
  };

  constructor(config?: Partial<ConfidenceCalculator['config']>) {
    this.config = {
      minSamples: FINANCE_DEFAULTS.MIN_TRADES_FOR_PATTERN,
      maxSamples: 100,
      decayDays: FINANCE_DEFAULTS.PATTERN_DECAY_DAYS,
      minConfidence: FINANCE_DEFAULTS.MIN_PATTERN_CONFIDENCE,
      ...config,
    };
  }

  /**
   * Calculate confidence score for a pattern
   */
  calculate(pattern: TradePattern): ConfidenceResult {
    const factors = this.calculateFactors(pattern);
    const confidence = this.computeConfidence(factors);
    const recommendation = this.getRecommendation(confidence);
    const explanation = this.generateExplanation(factors, confidence);

    return {
      confidence,
      factors,
      recommendation,
      explanation,
    };
  }

  /**
   * Calculate individual confidence factors
   */
  private calculateFactors(pattern: TradePattern): ConfidenceFactors {
    // Sample size factor (0-1)
    // More samples = higher confidence, up to a point
    const sampleSizeFactor = Math.min(
      pattern.sampleSize / this.config.minSamples,
      1
    ) * 0.5 + Math.min(
      pattern.sampleSize / this.config.maxSamples,
      1
    ) * 0.5;

    // Success rate factor (0-1)
    // Higher success rate = higher confidence
    const successRateFactor = pattern.successRate;

    // Recency factor (0-1)
    // More recent usage = higher confidence
    const daysSinceUse = pattern.lastApplied
      ? (Date.now() - pattern.lastApplied) / (24 * 60 * 60 * 1000)
      : this.config.decayDays;
    const recencyFactor = Math.max(
      0,
      1 - daysSinceUse / this.config.decayDays
    );

    // Consistency factor (0-1)
    // Based on how consistent the success rate is
    // If sampleSize is high and successRate is stable, confidence is higher
    const consistencyFactor = pattern.sampleSize >= this.config.minSamples
      ? Math.abs(pattern.successRate - 0.5) * 2 // Favor patterns with clear direction
      : 0.5;

    // Market condition match (placeholder - would need current market data)
    const marketConditionMatch = 0.7; // Default moderate match

    return {
      sampleSize: sampleSizeFactor,
      successRate: successRateFactor,
      recency: recencyFactor,
      consistency: consistencyFactor,
      marketConditionMatch,
    };
  }

  /**
   * Compute overall confidence from factors
   */
  private computeConfidence(factors: ConfidenceFactors): number {
    // Weighted combination of factors
    const weights = {
      sampleSize: 0.20,
      successRate: 0.35,
      recency: 0.20,
      consistency: 0.15,
      marketConditionMatch: 0.10,
    };

    const confidence =
      factors.sampleSize * weights.sampleSize +
      factors.successRate * weights.successRate +
      factors.recency * weights.recency +
      factors.consistency * weights.consistency +
      factors.marketConditionMatch * weights.marketConditionMatch;

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get recommendation level based on confidence
   */
  private getRecommendation(confidence: number): 'high' | 'medium' | 'low' {
    if (confidence >= 0.7) return 'high';
    if (confidence >= 0.4) return 'medium';
    return 'low';
  }

  /**
   * Generate human-readable explanation
   */
  private generateExplanation(factors: ConfidenceFactors, confidence: number): string {
    const parts: string[] = [];

    if (factors.sampleSize < 0.5) {
      parts.push('Limited sample size');
    } else if (factors.sampleSize > 0.8) {
      parts.push('Strong sample size');
    }

    if (factors.successRate < 0.4) {
      parts.push('Low success rate');
    } else if (factors.successRate > 0.6) {
      parts.push('High success rate');
    }

    if (factors.recency < 0.3) {
      parts.push('Pattern not recently used');
    } else if (factors.recency > 0.7) {
      parts.push('Recently validated');
    }

    if (factors.consistency > 0.7) {
      parts.push('Consistent results');
    }

    if (parts.length === 0) {
      return `Confidence: ${(confidence * 100).toFixed(0)}%`;
    }

    return `${parts.join('. ')}. Overall confidence: ${(confidence * 100).toFixed(0)}%`;
  }

  /**
   * Calculate decayed confidence based on time since last use
   */
  calculateDecay(pattern: TradePattern): number {
    if (!pattern.lastApplied) {
      return pattern.confidence * 0.5; // Heavy penalty if never used
    }

    const daysSinceUse = (Date.now() - pattern.lastApplied) / (24 * 60 * 60 * 1000);
    const decayRate = 1 / this.config.decayDays;
    const decayFactor = Math.pow(1 - decayRate, daysSinceUse);

    return pattern.confidence * decayFactor;
  }

  /**
   * Update confidence after pattern usage
   */
  updateAfterUsage(
    currentConfidence: number,
    success: boolean,
    sampleSize: number
  ): number {
    // Bayesian-like update
    const weight = Math.min(1, sampleSize / this.config.maxSamples);
    const update = success ? 0.1 : -0.1;

    // Smaller updates for more established patterns
    const adjustedUpdate = update * (1 - weight * 0.5);

    return Math.max(
      this.config.minConfidence,
      Math.min(1, currentConfidence + adjustedUpdate)
    );
  }

  /**
   * Check if pattern should be pruned
   */
  shouldPrune(pattern: TradePattern): boolean {
    const decayedConfidence = this.calculateDecay(pattern);

    // Prune if confidence is too low
    if (decayedConfidence < this.config.minConfidence) {
      return true;
    }

    // Prune if pattern has poor success rate with enough samples
    if (pattern.sampleSize >= this.config.minSamples && pattern.successRate < 0.3) {
      return true;
    }

    // Prune if not used in a long time
    if (pattern.lastApplied) {
      const daysSinceUse = (Date.now() - pattern.lastApplied) / (24 * 60 * 60 * 1000);
      if (daysSinceUse > this.config.decayDays * 2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Compare two patterns and determine which is more reliable
   */
  compare(patternA: TradePattern, patternB: TradePattern): number {
    const confA = this.calculate(patternA).confidence;
    const confB = this.calculate(patternB).confidence;

    return confA - confB; // Positive if A is better
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createConfidenceCalculator(
  config?: Partial<ConfidenceCalculator['config']>
): ConfidenceCalculator {
  return new ConfidenceCalculator(config);
}
