/**
 * Session Learner
 * Learns patterns within a session for improved correction
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  LearnedPattern,
  TrackedFailure,
  CorrectionStrategy,
} from '../types.js';
import { AUTONOMY_EVENTS } from '../constants.js';
import type { FailureTracker } from './failure-tracker.js';

/**
 * Learning event
 */
export interface LearningEvent {
  /** Event type */
  type: 'failure' | 'success' | 'correction_applied' | 'correction_succeeded' | 'correction_failed';
  /** Tool name */
  toolName?: string;
  /** Strategy applied */
  strategy?: CorrectionStrategy;
  /** Error message */
  error?: string;
  /** Arguments that caused the issue */
  arguments?: Record<string, unknown>;
  /** Timestamp */
  timestamp: number;
}

/**
 * Session learner configuration
 */
export interface SessionLearnerConfig {
  /** Failure tracker */
  failureTracker?: FailureTracker;
  /** Minimum occurrences to form a pattern */
  minOccurrences?: number;
  /** Minimum confidence for a pattern */
  minConfidence?: number;
  /** Maximum patterns to track */
  maxPatterns?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<Omit<SessionLearnerConfig, 'failureTracker'>> = {
  minOccurrences: 2,
  minConfidence: 0.6,
  maxPatterns: 100,
};

/**
 * Session Learner
 * Learns patterns from execution events within a session
 */
export class SessionLearner extends EventEmitter {
  private readonly config: typeof DEFAULT_CONFIG;
  private readonly failureTracker?: FailureTracker;
  private readonly events: LearningEvent[] = [];
  private readonly patterns: Map<string, LearnedPattern> = new Map();
  private readonly correctionResults: Map<string, { succeeded: number; failed: number }> = new Map();

  constructor(config?: SessionLearnerConfig) {
    super();
    this.config = {
      minOccurrences: config?.minOccurrences ?? DEFAULT_CONFIG.minOccurrences,
      minConfidence: config?.minConfidence ?? DEFAULT_CONFIG.minConfidence,
      maxPatterns: config?.maxPatterns ?? DEFAULT_CONFIG.maxPatterns,
    };
    this.failureTracker = config?.failureTracker;
  }

  /**
   * Record a learning event
   */
  record(event: Omit<LearningEvent, 'timestamp'>): void {
    const fullEvent: LearningEvent = {
      ...event,
      timestamp: Date.now(),
    };

    this.events.push(fullEvent);

    // Update patterns based on event
    switch (event.type) {
      case 'failure':
        this.learnFromFailure(fullEvent);
        break;
      case 'correction_succeeded':
        this.learnFromSuccess(fullEvent);
        break;
      case 'correction_failed':
        this.learnFromFailedCorrection(fullEvent);
        break;
    }

    // Prune old events
    this.pruneEvents();
  }

  /**
   * Record a failure
   */
  recordFailure(
    toolName: string | undefined,
    error: string,
    args?: Record<string, unknown>
  ): void {
    this.record({
      type: 'failure',
      toolName,
      error,
      arguments: args,
    });
  }

  /**
   * Record a successful correction
   */
  recordCorrectionSuccess(
    toolName: string | undefined,
    strategy: CorrectionStrategy
  ): void {
    // Update correction tracking
    const key = `${toolName ?? 'unknown'}:${strategy}`;
    const stats = this.correctionResults.get(key) ?? { succeeded: 0, failed: 0 };
    stats.succeeded++;
    this.correctionResults.set(key, stats);

    this.record({
      type: 'correction_succeeded',
      toolName,
      strategy,
    });
  }

  /**
   * Record a failed correction
   */
  recordCorrectionFailure(
    toolName: string | undefined,
    strategy: CorrectionStrategy,
    error?: string
  ): void {
    // Update correction tracking
    const key = `${toolName ?? 'unknown'}:${strategy}`;
    const stats = this.correctionResults.get(key) ?? { succeeded: 0, failed: 0 };
    stats.failed++;
    this.correctionResults.set(key, stats);

    this.record({
      type: 'correction_failed',
      toolName,
      strategy,
      error,
    });
  }

  /**
   * Get learned patterns
   */
  getPatterns(): LearnedPattern[] {
    return Array.from(this.patterns.values())
      .filter(p => p.confidence >= this.config.minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get pattern for a specific tool/category
   */
  getPatternFor(appliesTo: string): LearnedPattern | undefined {
    for (const pattern of this.patterns.values()) {
      if (pattern.appliesTo === appliesTo && pattern.confidence >= this.config.minConfidence) {
        return pattern;
      }
    }
    return undefined;
  }

  /**
   * Get recommended strategy for a tool
   */
  getRecommendedStrategy(toolName: string): CorrectionStrategy | undefined {
    // Find the most successful strategy for this tool
    let bestStrategy: CorrectionStrategy | undefined;
    let bestSuccessRate = 0;

    for (const [key, stats] of this.correctionResults) {
      if (key.startsWith(`${toolName}:`)) {
        const strategy = key.split(':')[1] as CorrectionStrategy;
        const total = stats.succeeded + stats.failed;
        if (total >= this.config.minOccurrences) {
          const successRate = stats.succeeded / total;
          if (successRate > bestSuccessRate) {
            bestSuccessRate = successRate;
            bestStrategy = strategy;
          }
        }
      }
    }

    return bestSuccessRate >= this.config.minConfidence ? bestStrategy : undefined;
  }

  /**
   * Get correction statistics for a tool
   */
  getCorrectionStats(toolName: string): Record<CorrectionStrategy, { succeeded: number; failed: number; successRate: number }> {
    const result: Record<string, { succeeded: number; failed: number; successRate: number }> = {};

    for (const [key, stats] of this.correctionResults) {
      if (key.startsWith(`${toolName}:`)) {
        const strategy = key.split(':')[1];
        const total = stats.succeeded + stats.failed;
        result[strategy] = {
          ...stats,
          successRate: total > 0 ? stats.succeeded / total : 0,
        };
      }
    }

    return result as Record<CorrectionStrategy, { succeeded: number; failed: number; successRate: number }>;
  }

  /**
   * Get session summary
   */
  getSummary(): {
    totalEvents: number;
    failures: number;
    correctionsApplied: number;
    correctionSuccessRate: number;
    patternsLearned: number;
    topPatterns: LearnedPattern[];
  } {
    const failures = this.events.filter(e => e.type === 'failure').length;
    const correctionSuccesses = this.events.filter(e => e.type === 'correction_succeeded').length;
    const correctionFailures = this.events.filter(e => e.type === 'correction_failed').length;
    const totalCorrections = correctionSuccesses + correctionFailures;

    return {
      totalEvents: this.events.length,
      failures,
      correctionsApplied: totalCorrections,
      correctionSuccessRate: totalCorrections > 0 ? correctionSuccesses / totalCorrections : 0,
      patternsLearned: this.patterns.size,
      topPatterns: this.getPatterns().slice(0, 5),
    };
  }

  /**
   * Clear learned data
   */
  clear(): void {
    this.events.length = 0;
    this.patterns.clear();
    this.correctionResults.clear();
  }

  /**
   * Learn from a failure event
   */
  private learnFromFailure(event: LearningEvent): void {
    if (!event.toolName) return;

    // Look for patterns in failures
    const toolFailures = this.events.filter(
      e => e.type === 'failure' && e.toolName === event.toolName
    );

    if (toolFailures.length >= this.config.minOccurrences) {
      // Check for similar errors
      const similarErrors = toolFailures.filter(e => {
        if (!e.error || !event.error) return false;
        return this.errorsSimilar(e.error, event.error);
      });

      if (similarErrors.length >= this.config.minOccurrences) {
        this.createOrUpdatePattern(
          event.toolName,
          'failure_pattern',
          `Tool ${event.toolName} consistently fails with similar errors`,
          this.suggestRecommendation(event),
          similarErrors.length
        );
      }
    }
  }

  /**
   * Learn from a successful correction
   */
  private learnFromSuccess(event: LearningEvent): void {
    if (!event.toolName || !event.strategy) return;

    // Update success pattern
    const key = `${event.toolName}:success:${event.strategy}`;
    const existing = this.patterns.get(key);

    if (existing) {
      existing.occurrences++;
      existing.lastSeen = event.timestamp;
      existing.confidence = Math.min(0.95, existing.confidence + 0.05);
    } else {
      this.createPattern(
        key,
        event.toolName,
        'success_pattern',
        `${event.strategy} works for ${event.toolName}`,
        `Use ${event.strategy} for ${event.toolName} failures`,
        1
      );
    }
  }

  /**
   * Learn from a failed correction
   */
  private learnFromFailedCorrection(event: LearningEvent): void {
    if (!event.toolName || !event.strategy) return;

    // Reduce confidence in this strategy for this tool
    const key = `${event.toolName}:success:${event.strategy}`;
    const existing = this.patterns.get(key);

    if (existing) {
      existing.confidence = Math.max(0.1, existing.confidence - 0.1);
      existing.occurrences++;
      existing.lastSeen = event.timestamp;
    }
  }

  /**
   * Create or update a pattern
   */
  private createOrUpdatePattern(
    appliesTo: string,
    type: LearnedPattern['type'],
    description: string,
    recommendation: string,
    occurrences: number
  ): void {
    const key = `${appliesTo}:${type}`;
    const existing = this.patterns.get(key);

    if (existing) {
      existing.occurrences = occurrences;
      existing.lastSeen = Date.now();
      existing.confidence = Math.min(0.95, 0.5 + (occurrences / 10) * 0.45);
    } else {
      this.createPattern(key, appliesTo, type, description, recommendation, occurrences);
    }
  }

  /**
   * Create a new pattern
   */
  private createPattern(
    key: string,
    appliesTo: string,
    type: LearnedPattern['type'],
    description: string,
    recommendation: string,
    occurrences: number
  ): void {
    // Enforce limit
    if (this.patterns.size >= this.config.maxPatterns) {
      // Remove least confident pattern
      let minConfidence = 1;
      let minKey = '';
      for (const [k, p] of this.patterns) {
        if (p.confidence < minConfidence) {
          minConfidence = p.confidence;
          minKey = k;
        }
      }
      if (minKey) {
        this.patterns.delete(minKey);
      }
    }

    const pattern: LearnedPattern = {
      id: randomUUID(),
      type,
      appliesTo,
      description,
      recommendation,
      confidence: 0.5 + (occurrences / 10) * 0.45,
      occurrences,
      lastSeen: Date.now(),
      createdAt: Date.now(),
    };

    this.patterns.set(key, pattern);

    this.emit(AUTONOMY_EVENTS.PATTERN_LEARNED, {
      patternId: pattern.id,
      appliesTo,
      type,
      confidence: pattern.confidence,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if two errors are similar
   */
  private errorsSimilar(error1: string, error2: string): boolean {
    const normalize = (s: string) =>
      s.toLowerCase()
        .replace(/[0-9]+/g, 'N')
        .replace(/['"]/g, '')
        .trim();

    const n1 = normalize(error1);
    const n2 = normalize(error2);

    // Exact match after normalization
    if (n1 === n2) return true;

    // Check for significant overlap
    const words1 = new Set(n1.split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(n2.split(/\s+/).filter(w => w.length > 3));

    let common = 0;
    for (const word of words1) {
      if (words2.has(word)) common++;
    }

    const total = words1.size + words2.size;
    return total > 0 && (common * 2) / total > 0.5;
  }

  /**
   * Suggest a recommendation based on event
   */
  private suggestRecommendation(event: LearningEvent): string {
    const error = event.error?.toLowerCase() ?? '';

    if (error.includes('timeout')) {
      return 'Use retry_with_backoff with longer delays';
    }
    if (error.includes('rate limit')) {
      return 'Use retry_with_backoff with significant delay';
    }
    if (error.includes('invalid') || error.includes('validation')) {
      return 'Use parameter_variation to fix input';
    }
    if (error.includes('not found')) {
      return 'Consider skipping or using alternative_tool';
    }
    if (error.includes('permission')) {
      return 'Consider skip_step for this tool';
    }

    return 'Consider alternative_tool or decompose_step';
  }

  /**
   * Prune old events to prevent memory growth
   */
  private pruneEvents(): void {
    const maxEvents = 1000;
    if (this.events.length > maxEvents) {
      this.events.splice(0, this.events.length - maxEvents);
    }
  }
}

/**
 * Create a session learner
 */
export function createSessionLearner(config?: SessionLearnerConfig): SessionLearner {
  return new SessionLearner(config);
}
