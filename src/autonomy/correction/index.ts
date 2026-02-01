/**
 * Correction Module
 * Self-correction and learning capabilities
 */

export {
  FailureTracker,
  createFailureTracker,
  type FailureTrackerConfig,
  type FailureStats,
} from './failure-tracker.js';

export {
  StrategySelector,
  createStrategySelector,
  type StrategySelectorConfig,
  type StrategySelection,
} from './strategy-selector.js';

export {
  SessionLearner,
  createSessionLearner,
  type SessionLearnerConfig,
  type LearningEvent,
} from './session-learner.js';

// Re-export correction engine (composite)
import { EventEmitter } from 'events';
import { FailureTracker, createFailureTracker, type FailureTrackerConfig } from './failure-tracker.js';
import { StrategySelector, createStrategySelector, type StrategySelectorConfig } from './strategy-selector.js';
import { SessionLearner, createSessionLearner, type SessionLearnerConfig } from './session-learner.js';
import type {
  TrackedFailure,
  CorrectionStrategy,
  LearnedPattern,
  PlanStep,
} from '../types.js';
import type { StrategySelection } from './strategy-selector.js';

/**
 * Correction engine configuration
 */
export interface CorrectionEngineConfig {
  /** Failure tracker config */
  failureTracker?: FailureTrackerConfig;
  /** Strategy selector config */
  strategySelector?: Omit<StrategySelectorConfig, 'failureTracker'>;
  /** Session learner config */
  sessionLearner?: Omit<SessionLearnerConfig, 'failureTracker'>;
  /** Enable session learning */
  enableLearning?: boolean;
}

/**
 * Correction Engine
 * Composite engine that combines failure tracking, strategy selection, and learning
 */
export class CorrectionEngine extends EventEmitter {
  public readonly failureTracker: FailureTracker;
  public readonly strategySelector: StrategySelector;
  public readonly sessionLearner: SessionLearner;
  private readonly enableLearning: boolean;

  constructor(config?: CorrectionEngineConfig) {
    super();

    this.enableLearning = config?.enableLearning ?? true;

    // Create failure tracker
    this.failureTracker = createFailureTracker(config?.failureTracker);

    // Create strategy selector with failure tracker
    this.strategySelector = createStrategySelector({
      ...config?.strategySelector,
      failureTracker: this.failureTracker,
    });

    // Create session learner with failure tracker
    this.sessionLearner = createSessionLearner({
      ...config?.sessionLearner,
      failureTracker: this.failureTracker,
    });
  }

  /**
   * Track a failure and get correction strategy
   */
  handleFailure(
    failure: Omit<TrackedFailure, 'id' | 'timestamp'>,
    step: PlanStep,
    sessionId?: string,
    previousStrategies?: CorrectionStrategy[]
  ): {
    failure: TrackedFailure;
    selection: StrategySelection;
  } {
    // Track the failure
    const tracked = this.failureTracker.track(failure, sessionId);

    // Learn from failure
    if (this.enableLearning) {
      this.sessionLearner.recordFailure(
        failure.toolName,
        failure.error,
        failure.arguments
      );
    }

    // Select correction strategy
    const sessionFailures = sessionId
      ? this.failureTracker.getBySession(sessionId)
      : undefined;

    const selection = this.strategySelector.select(tracked, step, {
      previousStrategies,
      sessionFailures,
    });

    // Update failure with selected strategy
    tracked.strategyAttempted = selection.strategy;

    return { failure: tracked, selection };
  }

  /**
   * Record correction result
   */
  recordCorrectionResult(
    failureId: string,
    succeeded: boolean,
    strategy: CorrectionStrategy,
    toolName?: string
  ): void {
    // Update failure tracker
    this.failureTracker.recordCorrectionResult(failureId, succeeded);

    // Learn from result
    if (this.enableLearning) {
      if (succeeded) {
        this.sessionLearner.recordCorrectionSuccess(toolName, strategy);
      } else {
        this.sessionLearner.recordCorrectionFailure(toolName, strategy);
      }
    }
  }

  /**
   * Get learned patterns
   */
  getLearnedPatterns(): LearnedPattern[] {
    return this.sessionLearner.getPatterns();
  }

  /**
   * Get recommended strategy for a tool
   */
  getRecommendedStrategy(toolName: string): CorrectionStrategy | undefined {
    return this.sessionLearner.getRecommendedStrategy(toolName);
  }

  /**
   * Get correction statistics
   */
  getStats(): {
    failures: ReturnType<FailureTracker['getStats']>;
    learning: ReturnType<SessionLearner['getSummary']>;
  } {
    return {
      failures: this.failureTracker.getStats(),
      learning: this.sessionLearner.getSummary(),
    };
  }

  /**
   * Clear session data
   */
  clearSession(sessionId: string): void {
    this.failureTracker.clearSession(sessionId);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.failureTracker.clear();
    this.sessionLearner.clear();
    this.strategySelector.clearPatterns();
  }

  /**
   * Destroy the engine
   */
  destroy(): void {
    this.failureTracker.destroy();
  }
}

/**
 * Create a correction engine
 */
export function createCorrectionEngine(config?: CorrectionEngineConfig): CorrectionEngine {
  return new CorrectionEngine(config);
}
