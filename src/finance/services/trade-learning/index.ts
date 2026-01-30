/**
 * Trade Learning Service
 *
 * Self-learning system for trade pattern recognition and evaluation.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  Trade,
  TradePattern,
  TradeEvaluation,
  PatternMatch,
  TradeLearningStats,
  PatternCondition,
} from '../../types.js';
import type { TradeLearningConfig } from '../../config.js';
import type { PatternStore } from '../../stores/pattern-store.js';
import { FINANCE_EVENTS, FINANCE_DEFAULTS } from '../../constants.js';

// =============================================================================
// Service Interface
// =============================================================================

export interface TradeLearningService {
  // Initialization
  initialize(patternStore: PatternStore): Promise<void>;

  // Pattern management
  createPattern(pattern: Omit<TradePattern, 'id' | 'createdAt'>): Promise<TradePattern>;
  getPattern(patternId: string): Promise<TradePattern | null>;
  searchPatterns(query: string): Promise<TradePattern[]>;
  getConfidentPatterns(minConfidence?: number): Promise<TradePattern[]>;

  // Trade evaluation
  evaluateTrade(trade: Trade): Promise<TradeEvaluation>;
  matchPatterns(trade: Trade): Promise<PatternMatch[]>;

  // Learning
  learnFromTrade(trade: Trade, outcome: 'profitable' | 'unprofitable' | 'neutral'): Promise<void>;
  runLearningCycle(): Promise<{ patternsCreated: number; patternsUpdated: number }>;

  // Statistics
  getStats(): TradeLearningStats;

  // Events
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

// =============================================================================
// Implementation
// =============================================================================

export class TradeLearningServiceImpl extends EventEmitter implements TradeLearningService {
  private config: TradeLearningConfig;
  private store: PatternStore | null = null;
  private stats: TradeLearningStats = {
    totalTradesEvaluated: 0,
    patternsIdentified: 0,
    averageAccuracy: 0,
    topPerformingPatterns: [],
    recentImprovements: [],
    lastLearningCycle: 0,
  };

  constructor(config?: Partial<TradeLearningConfig>) {
    super();
    this.config = {
      enabled: true,
      minTradesForPattern: 10,
      minPatternConfidence: 0.6,
      patternDecayDays: 90,
      maxPatternsStored: 1000,
      evaluateTradesAfterHours: 24,
      useEmbeddings: false,
      embeddingModelEnvVar: 'OPENAI_API_KEY',
      similarityThreshold: 0.8,
      autoLearnFromTrades: true,
      learningCycleHours: 24,
      ...config,
    };
  }

  async initialize(patternStore: PatternStore): Promise<void> {
    this.store = patternStore;
    await this.updateStats();
  }

  async createPattern(
    pattern: Omit<TradePattern, 'id' | 'createdAt'>
  ): Promise<TradePattern> {
    this.ensureInitialized();

    const created = await this.store!.createPattern(pattern);

    this.stats.patternsIdentified++;
    this.emit(FINANCE_EVENTS.PATTERN_LEARNED, created);

    return created;
  }

  async getPattern(patternId: string): Promise<TradePattern | null> {
    this.ensureInitialized();
    return this.store!.getPattern(patternId);
  }

  async searchPatterns(query: string): Promise<TradePattern[]> {
    this.ensureInitialized();
    return this.store!.searchPatterns(query);
  }

  async getConfidentPatterns(minConfidence?: number): Promise<TradePattern[]> {
    this.ensureInitialized();
    return this.store!.getConfidentPatterns(minConfidence ?? this.config.minPatternConfidence);
  }

  async evaluateTrade(trade: Trade): Promise<TradeEvaluation> {
    this.ensureInitialized();

    this.stats.totalTradesEvaluated++;

    // Match against known patterns
    const matches = await this.matchPatterns(trade);

    // Calculate scores
    const entryScore = this.calculateEntryScore(trade, matches);
    const exitScore = this.calculateExitScore(trade);
    const timingScore = this.calculateTimingScore(trade);
    const riskManagementScore = this.calculateRiskManagementScore(trade);
    const overallScore = (entryScore + exitScore + timingScore + riskManagementScore) / 4;

    // Calculate actual return
    const actualReturn = this.calculateReturn(trade);

    // Holding period
    const holdingPeriodHours = trade.filledAt
      ? (trade.filledAt - trade.createdAt) / (1000 * 60 * 60)
      : 0;

    // Generate lessons
    const lessonsLearned = this.generateLessons(trade, matches, overallScore);

    // Suggest new patterns
    const newPatternSuggestions = this.suggestNewPatterns(trade, matches);

    const evaluation: TradeEvaluation = {
      id: randomUUID(),
      tradeId: trade.id,
      trade,
      entryScore,
      exitScore,
      timingScore,
      riskManagementScore,
      overallScore,
      actualReturn,
      holdingPeriodHours,
      lessonsLearned,
      matchedPatterns: matches.map(m => m.patternId),
      newPatternSuggestions,
      evaluatedAt: Date.now(),
    };

    // Store evaluation
    await this.store!.saveEvaluation(evaluation);

    // Update pattern usage
    for (const match of matches) {
      const success = actualReturn > 0;
      await this.store!.recordPatternUsage(match.patternId, success);
    }

    this.emit(FINANCE_EVENTS.TRADE_EVALUATED, evaluation);

    return evaluation;
  }

  async matchPatterns(trade: Trade): Promise<PatternMatch[]> {
    this.ensureInitialized();

    const allPatterns = await this.store!.getConfidentPatterns(0.3);
    const matches: PatternMatch[] = [];

    for (const pattern of allPatterns) {
      const matchResult = this.evaluatePatternMatch(trade, pattern);
      if (matchResult.matchScore >= this.config.similarityThreshold) {
        matches.push(matchResult);
      }
    }

    // Sort by match score
    matches.sort((a, b) => b.matchScore - a.matchScore);

    if (matches.length > 0) {
      this.emit(FINANCE_EVENTS.PATTERN_MATCHED, { trade, matches });
    }

    return matches.slice(0, 5); // Return top 5 matches
  }

  async learnFromTrade(
    trade: Trade,
    outcome: 'profitable' | 'unprofitable' | 'neutral'
  ): Promise<void> {
    if (!this.config.autoLearnFromTrades) {
      return;
    }

    this.ensureInitialized();

    // Extract conditions from trade
    const conditions = this.extractConditions(trade);

    // Look for similar patterns
    const existingPatterns = await this.store!.listPatterns({
      category: 'entry',
      minConfidence: 0.3,
    });

    let foundSimilar = false;

    for (const pattern of existingPatterns) {
      if (this.areConditionsSimilar(conditions, pattern.conditions)) {
        // Update existing pattern
        const newSampleSize = pattern.sampleSize + 1;
        const newSuccessRate = outcome === 'profitable'
          ? (pattern.successRate * pattern.sampleSize + 1) / newSampleSize
          : outcome === 'unprofitable'
            ? (pattern.successRate * pattern.sampleSize) / newSampleSize
            : pattern.successRate;

        await this.store!.updatePattern(pattern.id, {
          sampleSize: newSampleSize,
          successRate: newSuccessRate,
          outcome: this.determineOutcome(newSuccessRate),
          lastUpdated: Date.now(),
        });

        foundSimilar = true;
        break;
      }
    }

    if (!foundSimilar && conditions.length > 0) {
      // Create new pattern if we have enough similar trades
      const similarTrades = await this.countSimilarTrades(conditions);

      if (similarTrades >= this.config.minTradesForPattern) {
        await this.createPattern({
          name: `Auto-learned pattern ${Date.now()}`,
          category: 'entry',
          conditions,
          outcome,
          successRate: outcome === 'profitable' ? 1 : outcome === 'unprofitable' ? 0 : 0.5,
          sampleSize: 1,
          averageReturn: this.calculateReturn(trade),
          averageHoldingPeriod: trade.filledAt
            ? (trade.filledAt - trade.createdAt) / (1000 * 60 * 60)
            : 0,
          confidence: 0.5,
          examples: [JSON.stringify({ trade: trade.id, outcome })],
          lastUpdated: Date.now(),
        });
      }
    }
  }

  async runLearningCycle(): Promise<{ patternsCreated: number; patternsUpdated: number }> {
    this.ensureInitialized();

    let patternsCreated = 0;
    const patternsUpdated = 0;

    // Prune old patterns
    const pruned = await this.store!.pruneOldPatterns(
      this.config.minPatternConfidence,
      this.config.patternDecayDays
    );

    // Get recent evaluations
    const recentEvaluations = await this.store!.getRecentEvaluations(100);

    // Analyze for new patterns
    const patternCandidates = this.analyzeForPatterns(recentEvaluations);

    for (const candidate of patternCandidates) {
      if (candidate.sampleSize >= this.config.minTradesForPattern) {
        await this.createPattern(candidate);
        patternsCreated++;
      }
    }

    // Update stats
    this.stats.lastLearningCycle = Date.now();
    this.stats.recentImprovements.push(
      `Cycle completed: ${patternsCreated} patterns created, ${pruned} pruned`
    );

    if (this.stats.recentImprovements.length > 10) {
      this.stats.recentImprovements = this.stats.recentImprovements.slice(-10);
    }

    this.emit(FINANCE_EVENTS.LEARNING_CYCLE_COMPLETE, {
      patternsCreated,
      patternsUpdated,
      patternsPruned: pruned,
    });

    return { patternsCreated, patternsUpdated };
  }

  getStats(): TradeLearningStats {
    return { ...this.stats };
  }

  private ensureInitialized(): void {
    if (!this.store) {
      throw new Error('Trade learning service not initialized');
    }
  }

  private async updateStats(): Promise<void> {
    if (!this.store) return;

    const patternCount = await this.store.getPatternCount();
    this.stats.patternsIdentified = patternCount;

    const confidentPatterns = await this.store.getConfidentPatterns(0.7);
    this.stats.topPerformingPatterns = confidentPatterns.slice(0, 5).map(p => ({
      patternId: p.id,
      name: p.name,
      successRate: p.successRate,
    }));
  }

  private evaluatePatternMatch(trade: Trade, pattern: TradePattern): PatternMatch {
    const matchedConditions: PatternCondition[] = [];
    let totalWeight = 0;
    let matchedWeight = 0;

    for (const condition of pattern.conditions) {
      totalWeight += condition.weight;

      if (this.conditionMatches(trade, condition)) {
        matchedConditions.push(condition);
        matchedWeight += condition.weight;
      }
    }

    const matchScore = totalWeight > 0 ? matchedWeight / totalWeight : 0;

    return {
      patternId: pattern.id,
      pattern,
      matchScore,
      matchedConditions,
      recommendation: pattern.successRate > 0.6 ? 'follow' : pattern.successRate < 0.4 ? 'avoid' : 'neutral',
      confidence: matchScore * pattern.confidence,
    };
  }

  private conditionMatches(trade: Trade, condition: PatternCondition): boolean {
    // Simplified condition matching - would be more sophisticated in production
    return true; // Placeholder
  }

  private calculateEntryScore(trade: Trade, matches: PatternMatch[]): number {
    if (matches.length === 0) return 50;

    const avgMatch = matches.reduce((sum, m) => sum + m.matchScore, 0) / matches.length;
    const avgSuccess = matches.reduce((sum, m) => sum + m.pattern.successRate, 0) / matches.length;

    return (avgMatch * 50 + avgSuccess * 50);
  }

  private calculateExitScore(trade: Trade): number {
    if (!trade.takeProfitPrice || !trade.stopLossPrice) return 50;

    // Score based on risk/reward and actual execution
    const riskReward = Math.abs(trade.takeProfitPrice - (trade.price ?? 0)) /
                      Math.abs((trade.price ?? 0) - trade.stopLossPrice);

    return Math.min(100, riskReward * 30 + 40);
  }

  private calculateTimingScore(trade: Trade): number {
    // Would analyze market conditions at entry time
    return 50; // Placeholder
  }

  private calculateRiskManagementScore(trade: Trade): number {
    let score = 50;

    if (trade.stopLossPrice) score += 20;
    if (trade.takeProfitPrice) score += 15;

    // Penalize for no risk management
    if (!trade.stopLossPrice && !trade.takeProfitPrice) score -= 20;

    return Math.max(0, Math.min(100, score));
  }

  private calculateReturn(trade: Trade): number {
    if (!trade.averageFilledPrice || !trade.price || trade.filledQuantity === 0) {
      return 0;
    }

    const costBasis = trade.price * trade.quantity;
    const currentValue = trade.averageFilledPrice * trade.filledQuantity;

    return trade.side === 'buy'
      ? ((currentValue - costBasis) / costBasis) * 100
      : ((costBasis - currentValue) / costBasis) * 100;
  }

  private generateLessons(
    trade: Trade,
    matches: PatternMatch[],
    overallScore: number
  ): string[] {
    const lessons: string[] = [];

    if (!trade.stopLossPrice) {
      lessons.push('Consider setting a stop-loss to limit downside risk');
    }

    if (overallScore < 50) {
      lessons.push('Trade execution could be improved');
    }

    if (matches.length > 0 && matches[0].pattern.successRate < 0.4) {
      lessons.push(`Pattern "${matches[0].pattern.name}" has low success rate`);
    }

    return lessons;
  }

  private suggestNewPatterns(trade: Trade, matches: PatternMatch[]): string[] {
    const suggestions: string[] = [];

    if (matches.length === 0) {
      suggestions.push('This trade represents a new pattern not yet captured');
    }

    return suggestions;
  }

  private extractConditions(trade: Trade): PatternCondition[] {
    const conditions: PatternCondition[] = [];

    // Extract basic conditions from trade
    conditions.push({
      type: 'price',
      operator: trade.side === 'buy' ? 'lt' : 'gt',
      field: 'entry_price',
      value: trade.price ?? 0,
      weight: 1,
    });

    return conditions;
  }

  private areConditionsSimilar(a: PatternCondition[], b: PatternCondition[]): boolean {
    if (a.length !== b.length) return false;

    for (const condA of a) {
      const hasMatch = b.some(condB =>
        condA.type === condB.type &&
        condA.field === condB.field &&
        condA.operator === condB.operator
      );
      if (!hasMatch) return false;
    }

    return true;
  }

  private async countSimilarTrades(conditions: PatternCondition[]): Promise<number> {
    // Would count trades matching these conditions
    return 0; // Placeholder
  }

  private determineOutcome(successRate: number): 'profitable' | 'unprofitable' | 'neutral' {
    if (successRate >= 0.6) return 'profitable';
    if (successRate <= 0.4) return 'unprofitable';
    return 'neutral';
  }

  private analyzeForPatterns(
    evaluations: TradeEvaluation[]
  ): Array<Omit<TradePattern, 'id' | 'createdAt'>> {
    // Would analyze evaluations to find recurring patterns
    return []; // Placeholder
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTradeLearningService(
  config?: Partial<TradeLearningConfig>
): TradeLearningService {
  return new TradeLearningServiceImpl(config);
}
