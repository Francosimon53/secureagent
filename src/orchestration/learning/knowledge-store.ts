/**
 * Knowledge Store
 * Stores and manages learned patterns and knowledge
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  LearnedPattern,
  ErrorCategory,
} from '../types.js';
import type { LearningStore } from '../stores/learning-store.js';
import { ORCHESTRATION_EVENTS } from '../events.js';

/**
 * Knowledge store configuration
 */
export interface KnowledgeStoreConfig {
  /** Minimum confidence to retain pattern */
  minConfidence: number;
  /** Maximum patterns to store */
  maxPatterns: number;
  /** Pattern decay rate per day (0-1) */
  decayRate: number;
  /** Enable automatic pruning */
  autoPrune: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_KNOWLEDGE_CONFIG: KnowledgeStoreConfig = {
  minConfidence: 0.5,
  maxPatterns: 500,
  decayRate: 0.01,
  autoPrune: true,
};

/**
 * Pattern creation request
 */
export interface CreatePatternRequest {
  /** Pattern category */
  category: string;
  /** Pattern description */
  pattern: string;
  /** Solution/resolution */
  solution: string;
  /** Initial confidence (0-1) */
  confidence?: number;
}

/**
 * Pattern search options
 */
export interface PatternSearchOptions {
  /** Category filter */
  category?: string;
  /** Minimum confidence */
  minConfidence?: number;
  /** Maximum results */
  limit?: number;
  /** Sort by */
  sortBy?: 'confidence' | 'usage' | 'recent';
}

/**
 * Knowledge store events
 */
export interface KnowledgeStoreEvents {
  'pattern:created': (pattern: LearnedPattern) => void;
  'pattern:updated': (pattern: LearnedPattern) => void;
  'pattern:deleted': (patternId: string) => void;
  'pattern:used': (pattern: LearnedPattern, success: boolean) => void;
}

/**
 * Manages learned patterns and knowledge
 */
export class KnowledgeStore extends EventEmitter {
  private config: KnowledgeStoreConfig;
  private pruneInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private store: LearningStore,
    config?: Partial<KnowledgeStoreConfig>
  ) {
    super();
    this.config = { ...DEFAULT_KNOWLEDGE_CONFIG, ...config };
  }

  /**
   * Start the knowledge store
   */
  start(): void {
    if (this.pruneInterval || !this.config.autoPrune) {
      return;
    }

    // Run pruning daily
    this.pruneInterval = setInterval(
      () => this.prune(),
      24 * 60 * 60 * 1000
    );
  }

  /**
   * Stop the knowledge store
   */
  stop(): void {
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
      this.pruneInterval = null;
    }
  }

  /**
   * Create a new pattern
   */
  async createPattern(request: CreatePatternRequest): Promise<LearnedPattern> {
    const pattern: LearnedPattern = {
      id: randomUUID(),
      category: request.category,
      pattern: request.pattern,
      solution: request.solution,
      confidence: request.confidence ?? 0.5,
      successCount: 0,
      failureCount: 0,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    await this.store.savePattern(pattern);

    this.emit('pattern:created', pattern);
    this.emit(ORCHESTRATION_EVENTS.PATTERN_LEARNED, {
      patternId: pattern.id,
      category: pattern.category,
      confidence: pattern.confidence,
      timestamp: Date.now(),
      source: 'knowledge-store',
    });

    return pattern;
  }

  /**
   * Get a pattern by ID
   */
  async getPattern(patternId: string): Promise<LearnedPattern | null> {
    return this.store.getPattern(patternId);
  }

  /**
   * Search for patterns
   */
  async searchPatterns(options: PatternSearchOptions = {}): Promise<LearnedPattern[]> {
    let patterns: LearnedPattern[];

    if (options.category) {
      patterns = await this.store.getPatternsByCategory(options.category);
    } else if (options.minConfidence !== undefined) {
      patterns = await this.store.getConfidentPatterns(options.minConfidence);
    } else {
      patterns = await this.store.getAllPatterns();
    }

    // Apply additional filters
    if (options.minConfidence !== undefined && !options.category) {
      patterns = patterns.filter(p => p.confidence >= options.minConfidence!);
    }

    // Sort
    switch (options.sortBy) {
      case 'confidence':
        patterns.sort((a, b) => b.confidence - a.confidence);
        break;
      case 'usage':
        patterns.sort((a, b) => (b.successCount + b.failureCount) - (a.successCount + a.failureCount));
        break;
      case 'recent':
        patterns.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
        break;
      default:
        patterns.sort((a, b) => b.confidence - a.confidence);
    }

    // Limit
    if (options.limit) {
      patterns = patterns.slice(0, options.limit);
    }

    return patterns;
  }

  /**
   * Find patterns matching a description
   */
  async findMatchingPatterns(
    description: string,
    category?: string
  ): Promise<LearnedPattern[]> {
    const patterns = category
      ? await this.store.getPatternsByCategory(category)
      : await this.store.getAllPatterns();

    // Simple keyword matching
    const descLower = description.toLowerCase();
    const keywords = descLower.split(/\s+/).filter(w => w.length > 2);

    return patterns
      .filter(p => {
        const patternLower = p.pattern.toLowerCase();
        return keywords.some(k => patternLower.includes(k));
      })
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Record pattern usage
   */
  async recordUsage(patternId: string, success: boolean): Promise<void> {
    const pattern = await this.store.getPattern(patternId);
    if (!pattern) {
      return;
    }

    await this.store.updatePatternStats(patternId, success);

    // Reload to get updated stats
    const updated = await this.store.getPattern(patternId);
    if (updated) {
      this.emit('pattern:used', updated, success);
      this.emit(ORCHESTRATION_EVENTS.PATTERN_UPDATED, {
        patternId,
        confidence: updated.confidence,
        successCount: updated.successCount,
        failureCount: updated.failureCount,
        timestamp: Date.now(),
        source: 'knowledge-store',
      });
    }
  }

  /**
   * Update pattern confidence directly
   */
  async updateConfidence(patternId: string, confidence: number): Promise<void> {
    await this.store.updatePatternConfidence(patternId, confidence);

    const pattern = await this.store.getPattern(patternId);
    if (pattern) {
      this.emit('pattern:updated', pattern);
    }
  }

  /**
   * Delete a pattern
   */
  async deletePattern(patternId: string): Promise<boolean> {
    const deleted = await this.store.deletePattern(patternId);

    if (deleted) {
      this.emit('pattern:deleted', patternId);
    }

    return deleted;
  }

  /**
   * Get best solution for a problem
   */
  async getBestSolution(
    problemDescription: string,
    category?: string
  ): Promise<{ pattern: LearnedPattern; solution: string } | null> {
    const patterns = await this.findMatchingPatterns(problemDescription, category);

    // Get the highest confidence pattern
    const best = patterns.find(p => p.confidence >= this.config.minConfidence);

    if (best) {
      return { pattern: best, solution: best.solution };
    }

    return null;
  }

  /**
   * Get patterns by category
   */
  async getPatternsByCategory(category: string): Promise<LearnedPattern[]> {
    return this.store.getPatternsByCategory(category);
  }

  /**
   * Get all categories
   */
  async getCategories(): Promise<string[]> {
    const patterns = await this.store.getAllPatterns();
    const categories = new Set(patterns.map(p => p.category));
    return Array.from(categories);
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalPatterns: number;
    avgConfidence: number;
    byCategory: Record<string, number>;
    highConfidence: number;
    lowConfidence: number;
  }> {
    const patterns = await this.store.getAllPatterns();

    const byCategory: Record<string, number> = {};
    let totalConfidence = 0;
    let highConfidence = 0;
    let lowConfidence = 0;

    for (const pattern of patterns) {
      byCategory[pattern.category] = (byCategory[pattern.category] || 0) + 1;
      totalConfidence += pattern.confidence;

      if (pattern.confidence >= 0.8) {
        highConfidence++;
      } else if (pattern.confidence < 0.5) {
        lowConfidence++;
      }
    }

    return {
      totalPatterns: patterns.length,
      avgConfidence: patterns.length > 0 ? totalConfidence / patterns.length : 0,
      byCategory,
      highConfidence,
      lowConfidence,
    };
  }

  /**
   * Prune low-confidence patterns
   */
  async prune(): Promise<number> {
    const patterns = await this.store.getAllPatterns();
    let pruned = 0;

    // Apply decay to old patterns
    for (const pattern of patterns) {
      const daysSinceUse = (Date.now() - pattern.lastUsedAt) / (24 * 60 * 60 * 1000);
      const decayedConfidence = pattern.confidence * Math.pow(1 - this.config.decayRate, daysSinceUse);

      if (decayedConfidence < this.config.minConfidence) {
        await this.store.deletePattern(pattern.id);
        pruned++;
      } else if (decayedConfidence !== pattern.confidence) {
        await this.store.updatePatternConfidence(pattern.id, decayedConfidence);
      }
    }

    // Check if we're over the limit
    const remaining = await this.store.getAllPatterns();
    if (remaining.length > this.config.maxPatterns) {
      // Remove lowest confidence patterns
      const sorted = remaining.sort((a, b) => a.confidence - b.confidence);
      const toRemove = sorted.slice(0, remaining.length - this.config.maxPatterns);

      for (const pattern of toRemove) {
        await this.store.deletePattern(pattern.id);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Import patterns
   */
  async importPatterns(patterns: CreatePatternRequest[]): Promise<number> {
    let imported = 0;

    for (const pattern of patterns) {
      try {
        await this.createPattern(pattern);
        imported++;
      } catch {
        // Skip duplicates or invalid patterns
      }
    }

    return imported;
  }

  /**
   * Export patterns
   */
  async exportPatterns(options?: {
    minConfidence?: number;
    categories?: string[];
  }): Promise<LearnedPattern[]> {
    let patterns = await this.store.getAllPatterns();

    if (options?.minConfidence !== undefined) {
      patterns = patterns.filter(p => p.confidence >= options.minConfidence!);
    }

    if (options?.categories?.length) {
      patterns = patterns.filter(p => options.categories!.includes(p.category));
    }

    return patterns;
  }
}

/**
 * Create a knowledge store
 */
export function createKnowledgeStore(
  store: LearningStore,
  config?: Partial<KnowledgeStoreConfig>
): KnowledgeStore {
  return new KnowledgeStore(store, config);
}
