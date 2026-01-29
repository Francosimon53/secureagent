/**
 * Improvement Engine
 * Analyzes patterns and suggests improvements
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  ImprovementSuggestion,
  ImprovementType,
  ImpactLevel,
  LearnedPattern,
  CapturedError,
} from '../types.js';
import type { LearningStore } from '../stores/learning-store.js';
import type { KnowledgeStore } from './knowledge-store.js';
import type { ErrorCapture, ErrorPattern } from './error-capture.js';
import { ORCHESTRATION_EVENTS } from '../events.js';

/**
 * Improvement engine configuration
 */
export interface ImprovementEngineConfig {
  /** Enable automatic improvement suggestions */
  enabled: boolean;
  /** Analysis interval in hours */
  analysisIntervalHours: number;
  /** Minimum error count to suggest improvement */
  minErrorsForSuggestion: number;
  /** Minimum pattern confidence for suggestions */
  minPatternConfidence: number;
  /** Auto-apply low-risk improvements */
  autoApplyLowRisk: boolean;
  /** Require approval for improvements */
  requireApproval: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_ENGINE_CONFIG: ImprovementEngineConfig = {
  enabled: true,
  analysisIntervalHours: 6,
  minErrorsForSuggestion: 3,
  minPatternConfidence: 0.7,
  autoApplyLowRisk: false,
  requireApproval: true,
};

/**
 * Analysis result
 */
export interface AnalysisResult {
  /** Analysis timestamp */
  timestamp: number;
  /** Errors analyzed */
  errorsAnalyzed: number;
  /** Patterns found */
  patternsFound: number;
  /** Suggestions generated */
  suggestionsGenerated: number;
  /** Improvements applied */
  improvementsApplied: number;
}

/**
 * Improvement engine events
 */
export interface ImprovementEngineEvents {
  'analysis:started': () => void;
  'analysis:completed': (result: AnalysisResult) => void;
  'suggestion:created': (suggestion: ImprovementSuggestion) => void;
  'improvement:applied': (suggestion: ImprovementSuggestion) => void;
  'improvement:measured': (suggestionId: string, impact: number) => void;
}

/**
 * Analyzes errors and suggests improvements
 */
export class ImprovementEngine extends EventEmitter {
  private config: ImprovementEngineConfig;
  private analysisInterval: ReturnType<typeof setInterval> | null = null;
  private lastAnalysis: number = 0;

  constructor(
    private learningStore: LearningStore,
    private knowledgeStore: KnowledgeStore,
    private errorCapture: ErrorCapture,
    config?: Partial<ImprovementEngineConfig>
  ) {
    super();
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
  }

  /**
   * Start the improvement engine
   */
  start(): void {
    if (this.analysisInterval || !this.config.enabled) {
      return;
    }

    this.analysisInterval = setInterval(
      () => this.runAnalysis(),
      this.config.analysisIntervalHours * 60 * 60 * 1000
    );

    // Run initial analysis
    this.runAnalysis();
  }

  /**
   * Stop the improvement engine
   */
  stop(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
  }

  /**
   * Run analysis and generate suggestions
   */
  async runAnalysis(): Promise<AnalysisResult> {
    this.emit('analysis:started');

    const result: AnalysisResult = {
      timestamp: Date.now(),
      errorsAnalyzed: 0,
      patternsFound: 0,
      suggestionsGenerated: 0,
      improvementsApplied: 0,
    };

    try {
      // Analyze recent errors
      const errors = await this.errorCapture.getRecentErrors(24);
      result.errorsAnalyzed = errors.length;

      // Get error patterns
      const errorPatterns = this.errorCapture.getTopPatterns(20);
      result.patternsFound = errorPatterns.length;

      // Generate suggestions based on patterns
      const suggestions = await this.generateSuggestions(errorPatterns);
      result.suggestionsGenerated = suggestions.length;

      // Auto-apply if configured
      if (this.config.autoApplyLowRisk && !this.config.requireApproval) {
        const applied = await this.autoApplyImprovements(suggestions);
        result.improvementsApplied = applied;
      }

      this.lastAnalysis = Date.now();
    } catch (error) {
      console.error('Error during improvement analysis:', error);
    }

    this.emit('analysis:completed', result);

    return result;
  }

  /**
   * Generate suggestions from error patterns
   */
  private async generateSuggestions(
    errorPatterns: ErrorPattern[]
  ): Promise<ImprovementSuggestion[]> {
    const suggestions: ImprovementSuggestion[] = [];

    for (const pattern of errorPatterns) {
      // Skip patterns with too few occurrences
      if (pattern.count < this.config.minErrorsForSuggestion) {
        continue;
      }

      const suggestion = await this.createSuggestionFromPattern(pattern);
      if (suggestion) {
        await this.learningStore.saveImprovement(suggestion);
        suggestions.push(suggestion);

        this.emit('suggestion:created', suggestion);
        this.emit(ORCHESTRATION_EVENTS.IMPROVEMENT_SUGGESTED, {
          improvementId: suggestion.id,
          type: suggestion.type,
          expectedImpact: suggestion.expectedImpact,
          timestamp: Date.now(),
          source: 'improvement-engine',
        });
      }
    }

    return suggestions;
  }

  /**
   * Create a suggestion from an error pattern
   */
  private async createSuggestionFromPattern(
    pattern: ErrorPattern
  ): Promise<ImprovementSuggestion | null> {
    // Check if we already have a suggestion for this pattern
    const existing = await this.findExistingSuggestion(pattern);
    if (existing) {
      return null;
    }

    // Determine improvement type and description based on pattern
    const { type, description, impact } = this.analyzePattern(pattern);

    const suggestion: ImprovementSuggestion = {
      id: randomUUID(),
      type,
      description,
      expectedImpact: impact,
      basedOnPatterns: [pattern.pattern],
      implemented: false,
    };

    return suggestion;
  }

  /**
   * Analyze pattern to determine improvement type
   */
  private analyzePattern(pattern: ErrorPattern): {
    type: ImprovementType;
    description: string;
    impact: ImpactLevel;
  } {
    const category = pattern.category;

    switch (category) {
      case 'timeout':
        return {
          type: 'resource_allocation',
          description: `Increase timeout or add retry logic for operations matching: "${pattern.pattern}". Pattern has occurred ${pattern.count} times.`,
          impact: pattern.count > 10 ? 'high' : 'medium',
        };

      case 'api_error':
        return {
          type: 'error_prevention',
          description: `Add circuit breaker or fallback handling for API errors matching: "${pattern.pattern}". Pattern has occurred ${pattern.count} times.`,
          impact: pattern.count > 10 ? 'high' : 'medium',
        };

      case 'validation':
        return {
          type: 'workflow_change',
          description: `Add input validation or sanitization for: "${pattern.pattern}". Pattern has occurred ${pattern.count} times.`,
          impact: 'medium',
        };

      case 'logic':
        return {
          type: 'error_prevention',
          description: `Fix logic error in: "${pattern.pattern}". Pattern has occurred ${pattern.count} times.`,
          impact: pattern.count > 5 ? 'high' : 'medium',
        };

      case 'resource':
        return {
          type: 'resource_allocation',
          description: `Increase resource limits or optimize usage for: "${pattern.pattern}". Pattern has occurred ${pattern.count} times.`,
          impact: 'high',
        };

      default:
        return {
          type: 'error_prevention',
          description: `Investigate and address error pattern: "${pattern.pattern}". Pattern has occurred ${pattern.count} times.`,
          impact: 'low',
        };
    }
  }

  /**
   * Find existing suggestion for a pattern
   */
  private async findExistingSuggestion(
    pattern: ErrorPattern
  ): Promise<ImprovementSuggestion | null> {
    const pending = await this.learningStore.getPendingImprovements();

    return pending.find(s =>
      s.basedOnPatterns.some(p =>
        p.toLowerCase().includes(pattern.pattern.toLowerCase().slice(0, 50))
      )
    ) || null;
  }

  /**
   * Auto-apply low-risk improvements
   */
  private async autoApplyImprovements(
    suggestions: ImprovementSuggestion[]
  ): Promise<number> {
    let applied = 0;

    for (const suggestion of suggestions) {
      // Only auto-apply low impact suggestions
      if (suggestion.expectedImpact === 'low') {
        await this.applyImprovement(suggestion.id);
        applied++;
      }
    }

    return applied;
  }

  /**
   * Get pending improvements
   */
  async getPendingImprovements(): Promise<ImprovementSuggestion[]> {
    return this.learningStore.getPendingImprovements();
  }

  /**
   * Get implemented improvements
   */
  async getImplementedImprovements(): Promise<ImprovementSuggestion[]> {
    return this.learningStore.getImplementedImprovements();
  }

  /**
   * Get improvement by ID
   */
  async getImprovement(improvementId: string): Promise<ImprovementSuggestion | null> {
    return this.learningStore.getImprovement(improvementId);
  }

  /**
   * Apply an improvement
   */
  async applyImprovement(improvementId: string): Promise<boolean> {
    const improvement = await this.learningStore.getImprovement(improvementId);
    if (!improvement || improvement.implemented) {
      return false;
    }

    await this.learningStore.markImplemented(improvementId);

    // Update the improvement object
    improvement.implemented = true;
    improvement.implementedAt = Date.now();

    this.emit('improvement:applied', improvement);
    this.emit(ORCHESTRATION_EVENTS.IMPROVEMENT_APPLIED, {
      improvementId,
      type: improvement.type,
      applied: true,
      timestamp: Date.now(),
      source: 'improvement-engine',
    });

    // Create learned pattern from the improvement
    await this.knowledgeStore.createPattern({
      category: improvement.type,
      pattern: improvement.description,
      solution: `Applied improvement: ${improvement.description}`,
      confidence: 0.6,
    });

    return true;
  }

  /**
   * Reject an improvement suggestion
   */
  async rejectImprovement(improvementId: string): Promise<boolean> {
    return this.learningStore.deleteImprovement(improvementId);
  }

  /**
   * Measure improvement impact
   */
  async measureImpact(
    improvementId: string,
    beforeErrorRate: number,
    afterErrorRate: number
  ): Promise<number> {
    const impact = beforeErrorRate > 0
      ? (beforeErrorRate - afterErrorRate) / beforeErrorRate
      : 0;

    await this.learningStore.markImplemented(improvementId, impact);

    this.emit('improvement:measured', improvementId, impact);
    this.emit(ORCHESTRATION_EVENTS.IMPROVEMENT_MEASURED, {
      improvementId,
      measuredImpact: impact,
      timestamp: Date.now(),
      source: 'improvement-engine',
    });

    return impact;
  }

  /**
   * Create a manual improvement suggestion
   */
  async suggestImprovement(
    type: ImprovementType,
    description: string,
    expectedImpact: ImpactLevel,
    basedOnPatterns: string[] = []
  ): Promise<ImprovementSuggestion> {
    const suggestion: ImprovementSuggestion = {
      id: randomUUID(),
      type,
      description,
      expectedImpact,
      basedOnPatterns,
      implemented: false,
    };

    await this.learningStore.saveImprovement(suggestion);

    this.emit('suggestion:created', suggestion);
    this.emit(ORCHESTRATION_EVENTS.IMPROVEMENT_SUGGESTED, {
      improvementId: suggestion.id,
      type: suggestion.type,
      expectedImpact: suggestion.expectedImpact,
      timestamp: Date.now(),
      source: 'improvement-engine',
    });

    return suggestion;
  }

  /**
   * Get improvement statistics
   */
  async getStats(): Promise<{
    pending: number;
    implemented: number;
    avgImpact: number;
    byType: Record<ImprovementType, number>;
    byImpact: Record<ImpactLevel, number>;
  }> {
    const [pending, implemented] = await Promise.all([
      this.learningStore.getPendingImprovements(),
      this.learningStore.getImplementedImprovements(),
    ]);

    const all = [...pending, ...implemented];

    const byType: Record<ImprovementType, number> = {
      prompt_optimization: 0,
      workflow_change: 0,
      resource_allocation: 0,
      error_prevention: 0,
    };

    const byImpact: Record<ImpactLevel, number> = {
      low: 0,
      medium: 0,
      high: 0,
    };

    let totalImpact = 0;
    let impactCount = 0;

    for (const improvement of all) {
      byType[improvement.type]++;
      byImpact[improvement.expectedImpact]++;

      if (improvement.measuredImpact !== undefined) {
        totalImpact += improvement.measuredImpact;
        impactCount++;
      }
    }

    return {
      pending: pending.length,
      implemented: implemented.length,
      avgImpact: impactCount > 0 ? totalImpact / impactCount : 0,
      byType,
      byImpact,
    };
  }

  /**
   * Get last analysis timestamp
   */
  getLastAnalysisTime(): number {
    return this.lastAnalysis;
  }

  /**
   * Force run analysis
   */
  async forceAnalysis(): Promise<AnalysisResult> {
    return this.runAnalysis();
  }
}

/**
 * Create an improvement engine
 */
export function createImprovementEngine(
  learningStore: LearningStore,
  knowledgeStore: KnowledgeStore,
  errorCapture: ErrorCapture,
  config?: Partial<ImprovementEngineConfig>
): ImprovementEngine {
  return new ImprovementEngine(learningStore, knowledgeStore, errorCapture, config);
}
