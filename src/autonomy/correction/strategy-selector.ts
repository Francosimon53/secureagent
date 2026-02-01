/**
 * Strategy Selector
 * Selects appropriate correction strategies based on failure patterns
 */

import { EventEmitter } from 'events';
import type {
  CorrectionStrategy,
  FailureCategory,
  TrackedFailure,
  LearnedPattern,
  PlanStep,
} from '../types.js';
import { CORRECTION_STRATEGIES } from '../constants.js';
import type { FailureTracker } from './failure-tracker.js';

/**
 * Strategy selection result
 */
export interface StrategySelection {
  /** Selected strategy */
  strategy: CorrectionStrategy;
  /** Confidence in the selection (0-1) */
  confidence: number;
  /** Reasoning for the selection */
  reasoning: string;
  /** Alternative strategies to try if this fails */
  alternatives: CorrectionStrategy[];
  /** Suggested parameters for the strategy */
  parameters?: Record<string, unknown>;
}

/**
 * Strategy selector configuration
 */
export interface StrategySelectorConfig {
  /** Failure tracker */
  failureTracker?: FailureTracker;
  /** Minimum confidence to select a strategy */
  minConfidence?: number;
  /** Learned patterns to apply */
  learnedPatterns?: LearnedPattern[];
}

/**
 * Strategy Selector
 * Intelligently selects correction strategies based on context
 */
export class StrategySelector extends EventEmitter {
  private readonly failureTracker?: FailureTracker;
  private readonly minConfidence: number;
  private readonly learnedPatterns: LearnedPattern[];

  constructor(config?: StrategySelectorConfig) {
    super();
    this.failureTracker = config?.failureTracker;
    this.minConfidence = config?.minConfidence ?? 0.5;
    this.learnedPatterns = config?.learnedPatterns ?? [];
  }

  /**
   * Select a correction strategy
   */
  select(
    failure: TrackedFailure,
    step: PlanStep,
    context?: {
      previousStrategies?: CorrectionStrategy[];
      sessionFailures?: TrackedFailure[];
    }
  ): StrategySelection {
    const category = failure.category;
    const retryCount = step.retryCount;
    const maxRetries = step.maxRetries;
    const previousStrategies = context?.previousStrategies ?? [];

    // Check learned patterns first
    const patternMatch = this.matchPattern(failure, step);
    if (patternMatch) {
      return patternMatch;
    }

    // Get applicable strategies for this category
    const applicableStrategies = this.getApplicableStrategies(category);

    // Filter out already-tried strategies
    const availableStrategies = applicableStrategies.filter(
      s => !previousStrategies.includes(s)
    );

    if (availableStrategies.length === 0) {
      // No strategies left - abort or use fallback
      return {
        strategy: 'abort_execution',
        confidence: 0.9,
        reasoning: 'All correction strategies exhausted',
        alternatives: [],
      };
    }

    // Select best strategy based on context
    const selection = this.rankStrategies(
      availableStrategies,
      failure,
      step,
      context
    );

    // Apply retry count considerations
    if (retryCount >= maxRetries && selection.strategy === 'retry_with_backoff') {
      // Can't retry anymore - pick alternative
      if (selection.alternatives.length > 0) {
        return {
          strategy: selection.alternatives[0],
          confidence: selection.confidence * 0.8,
          reasoning: `${selection.reasoning}. Max retries reached, using alternative.`,
          alternatives: selection.alternatives.slice(1),
          parameters: selection.parameters,
        };
      }
    }

    return selection;
  }

  /**
   * Add a learned pattern
   */
  addPattern(pattern: LearnedPattern): void {
    // Check for existing pattern
    const existing = this.learnedPatterns.find(
      p => p.appliesTo === pattern.appliesTo && p.type === pattern.type
    );

    if (existing) {
      // Update existing pattern
      existing.confidence = (existing.confidence + pattern.confidence) / 2;
      existing.occurrences += pattern.occurrences;
      existing.lastSeen = pattern.lastSeen;
    } else {
      this.learnedPatterns.push(pattern);
    }
  }

  /**
   * Get learned patterns
   */
  getPatterns(): LearnedPattern[] {
    return [...this.learnedPatterns];
  }

  /**
   * Clear learned patterns
   */
  clearPatterns(): void {
    this.learnedPatterns.length = 0;
  }

  /**
   * Match failure against learned patterns
   */
  private matchPattern(
    failure: TrackedFailure,
    step: PlanStep
  ): StrategySelection | null {
    // Sort patterns by confidence
    const sortedPatterns = [...this.learnedPatterns]
      .filter(p => p.confidence >= this.minConfidence)
      .sort((a, b) => b.confidence - a.confidence);

    for (const pattern of sortedPatterns) {
      // Check if pattern applies
      if (pattern.appliesTo === failure.toolName ||
          pattern.appliesTo === step.toolName ||
          pattern.appliesTo === failure.category) {

        // Parse recommendation as strategy
        const strategy = this.parseRecommendation(pattern.recommendation);
        if (strategy) {
          return {
            strategy,
            confidence: pattern.confidence,
            reasoning: `Learned pattern: ${pattern.description}`,
            alternatives: this.getAlternatives(strategy, failure.category),
          };
        }
      }
    }

    return null;
  }

  /**
   * Get applicable strategies for a failure category
   */
  private getApplicableStrategies(category: FailureCategory): CorrectionStrategy[] {
    const strategies: CorrectionStrategy[] = [];

    for (const [strategyName, info] of Object.entries(CORRECTION_STRATEGIES)) {
      if (info.applicableCategories.includes(category)) {
        strategies.push(strategyName as CorrectionStrategy);
      }
    }

    // Always include these as fallbacks
    if (!strategies.includes('skip_step')) {
      strategies.push('skip_step');
    }
    if (!strategies.includes('abort_execution')) {
      strategies.push('abort_execution');
    }

    return strategies;
  }

  /**
   * Rank strategies by suitability
   */
  private rankStrategies(
    strategies: CorrectionStrategy[],
    failure: TrackedFailure,
    step: PlanStep,
    context?: {
      previousStrategies?: CorrectionStrategy[];
      sessionFailures?: TrackedFailure[];
    }
  ): StrategySelection {
    const scored: Array<{
      strategy: CorrectionStrategy;
      score: number;
      reasoning: string;
    }> = [];

    for (const strategy of strategies) {
      const { score, reasoning } = this.scoreStrategy(
        strategy,
        failure,
        step,
        context
      );
      scored.push({ strategy, score, reasoning });
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    const alternatives = scored.slice(1).map(s => s.strategy);

    return {
      strategy: best.strategy,
      confidence: Math.min(best.score, 1),
      reasoning: best.reasoning,
      alternatives,
      parameters: this.getStrategyParameters(best.strategy, failure, step),
    };
  }

  /**
   * Score a strategy for the given context
   */
  private scoreStrategy(
    strategy: CorrectionStrategy,
    failure: TrackedFailure,
    step: PlanStep,
    context?: {
      previousStrategies?: CorrectionStrategy[];
      sessionFailures?: TrackedFailure[];
    }
  ): { score: number; reasoning: string } {
    let score = 0.5; // Base score
    let reasoning = CORRECTION_STRATEGIES[strategy].description;

    // Category match bonus
    const info = CORRECTION_STRATEGIES[strategy];
    if (info.applicableCategories.includes(failure.category)) {
      score += 0.2;
      reasoning = `${info.description} (matches ${failure.category})`;
    }

    // Retry considerations
    if (strategy === 'retry_with_backoff') {
      if (step.retryCount === 0) {
        score += 0.3; // First retry is often effective
        reasoning += '. First retry attempt.';
      } else {
        score -= 0.1 * step.retryCount; // Diminishing returns
      }

      // Check for transient errors
      if (['timeout', 'rate_limit', 'network_error'].includes(failure.category)) {
        score += 0.2;
        reasoning += ' Transient error likely to resolve.';
      }
    }

    // Parameter variation for validation errors
    if (strategy === 'parameter_variation' && failure.category === 'validation_error') {
      score += 0.2;
      reasoning += ' Validation error can be fixed with different parameters.';
    }

    // Alternative tool when tool-specific error
    if (strategy === 'alternative_tool' && failure.toolName) {
      score += 0.15;
      reasoning += ` Tool ${failure.toolName} failed, alternative may work.`;
    }

    // Skip for permission issues
    if (strategy === 'skip_step' && failure.category === 'permission_denied') {
      score += 0.2;
      reasoning += ' Step may not be critical, skipping is reasonable.';
    }

    // Historical context from session
    if (context?.sessionFailures) {
      const sameToolFailures = context.sessionFailures.filter(
        f => f.toolName === failure.toolName
      ).length;

      if (sameToolFailures > 2 && strategy === 'alternative_tool') {
        score += 0.2;
        reasoning += ' Multiple failures with this tool.';
      }

      if (sameToolFailures > 3 && strategy === 'skip_step') {
        score += 0.1;
        reasoning += ' Repeated failures suggest skipping.';
      }
    }

    // Penalize abort unless necessary
    if (strategy === 'abort_execution') {
      score -= 0.3;
      reasoning += ' Last resort option.';
    }

    return { score: Math.max(0, Math.min(1, score)), reasoning };
  }

  /**
   * Get strategy-specific parameters
   */
  private getStrategyParameters(
    strategy: CorrectionStrategy,
    failure: TrackedFailure,
    step: PlanStep
  ): Record<string, unknown> | undefined {
    switch (strategy) {
      case 'retry_with_backoff':
        const baseDelay = 1000;
        const multiplier = 2;
        const delay = baseDelay * Math.pow(multiplier, step.retryCount);
        return {
          delay: Math.min(delay, 30000),
          maxRetries: step.maxRetries,
          currentRetry: step.retryCount + 1,
        };

      case 'parameter_variation':
        // Suggest parameter modifications based on error
        return {
          modifyHint: this.extractParameterHint(failure.error),
        };

      case 'decompose_step':
        return {
          originalDescription: step.description,
          suggestedSubsteps: 2,
        };

      default:
        return undefined;
    }
  }

  /**
   * Get alternative strategies
   */
  private getAlternatives(
    selected: CorrectionStrategy,
    category: FailureCategory
  ): CorrectionStrategy[] {
    const applicable = this.getApplicableStrategies(category);
    return applicable.filter(s => s !== selected);
  }

  /**
   * Parse a recommendation string to strategy
   */
  private parseRecommendation(recommendation: string): CorrectionStrategy | null {
    const lower = recommendation.toLowerCase();

    if (lower.includes('retry') || lower.includes('backoff')) {
      return 'retry_with_backoff';
    }
    if (lower.includes('parameter') || lower.includes('variation')) {
      return 'parameter_variation';
    }
    if (lower.includes('alternative') || lower.includes('different tool')) {
      return 'alternative_tool';
    }
    if (lower.includes('decompose') || lower.includes('break down')) {
      return 'decompose_step';
    }
    if (lower.includes('skip')) {
      return 'skip_step';
    }
    if (lower.includes('abort') || lower.includes('stop')) {
      return 'abort_execution';
    }

    return null;
  }

  /**
   * Extract parameter modification hint from error
   */
  private extractParameterHint(error: string): string {
    const lower = error.toLowerCase();

    if (lower.includes('required')) {
      const match = error.match(/['"]?(\w+)['"]?\s+(is\s+)?required/i);
      return match ? `Add missing parameter: ${match[1]}` : 'Add missing required parameter';
    }

    if (lower.includes('invalid')) {
      const match = error.match(/invalid\s+['"]?(\w+)['"]?/i);
      return match ? `Fix invalid value for: ${match[1]}` : 'Fix invalid parameter value';
    }

    if (lower.includes('too long') || lower.includes('too large')) {
      return 'Reduce parameter length/size';
    }

    if (lower.includes('format')) {
      return 'Check parameter format';
    }

    return 'Review and modify parameters';
  }
}

/**
 * Create a strategy selector
 */
export function createStrategySelector(config?: StrategySelectorConfig): StrategySelector {
  return new StrategySelector(config);
}
