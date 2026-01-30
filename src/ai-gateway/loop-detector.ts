/**
 * Loop Detector
 *
 * Detects conversation loops and repetitive patterns to prevent runaway costs
 */

import type {
  AIMessage,
  LoopDetectionResult,
  LoopPattern,
} from './types.js';
import { AI_GATEWAY_EVENTS, AI_GATEWAY_DEFAULTS } from './constants.js';

// =============================================================================
// Loop Detector
// =============================================================================

export interface LoopDetectorConfig {
  /** Window size for loop detection */
  windowSize: number;
  /** Similarity threshold for exact matches */
  exactMatchThreshold: number;
  /** Similarity threshold for semantic matches */
  semanticMatchThreshold: number;
  /** Maximum consecutive similar messages */
  maxConsecutiveSimilar: number;
  /** Custom patterns to detect */
  customPatterns?: LoopPattern[];
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: LoopDetectorConfig = {
  windowSize: AI_GATEWAY_DEFAULTS.LOOP_DETECTION_WINDOW,
  exactMatchThreshold: 0.99,
  semanticMatchThreshold: AI_GATEWAY_DEFAULTS.LOOP_SIMILARITY_THRESHOLD,
  maxConsecutiveSimilar: 3,
};

export class LoopDetector {
  private readonly config: LoopDetectorConfig;
  private readonly conversationHistory = new Map<string, AIMessage[]>();

  constructor(config?: Partial<LoopDetectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a message sequence indicates a loop
   */
  detect(conversationId: string, messages: AIMessage[]): LoopDetectionResult {
    // Get history for this conversation
    const history = this.conversationHistory.get(conversationId) ?? [];

    // Check for exact match loops
    const exactResult = this.checkExactMatches(history, messages);
    if (exactResult.isLoop) {
      this.emit(AI_GATEWAY_EVENTS.LOOP_DETECTED, { conversationId, result: exactResult });
      return exactResult;
    }

    // Check for semantic similarity loops
    const semanticResult = this.checkSemanticSimilarity(history, messages);
    if (semanticResult.isLoop) {
      this.emit(AI_GATEWAY_EVENTS.LOOP_DETECTED, { conversationId, result: semanticResult });
      return semanticResult;
    }

    // Check for pattern-based loops
    const patternResult = this.checkPatterns(history, messages);
    if (patternResult.isLoop) {
      this.emit(AI_GATEWAY_EVENTS.LOOP_DETECTED, { conversationId, result: patternResult });
      return patternResult;
    }

    // Check for consecutive similar messages
    const consecutiveResult = this.checkConsecutiveSimilar(history, messages);
    if (consecutiveResult.confidence > 0.5) {
      this.emit(AI_GATEWAY_EVENTS.LOOP_WARNING, { conversationId, result: consecutiveResult });
      return consecutiveResult;
    }

    return {
      isLoop: false,
      confidence: 0,
      recommendation: 'continue',
    };
  }

  /**
   * Add messages to history
   */
  addToHistory(conversationId: string, messages: AIMessage[]): void {
    const history = this.conversationHistory.get(conversationId) ?? [];
    history.push(...messages);

    // Keep only the last N messages
    const maxHistory = this.config.windowSize * 2;
    if (history.length > maxHistory) {
      history.splice(0, history.length - maxHistory);
    }

    this.conversationHistory.set(conversationId, history);
  }

  /**
   * Clear history for a conversation
   */
  clearHistory(conversationId: string): void {
    this.conversationHistory.delete(conversationId);
  }

  /**
   * Clear all history
   */
  clearAllHistory(): void {
    this.conversationHistory.clear();
  }

  /**
   * Add a custom pattern
   */
  addPattern(pattern: LoopPattern): void {
    if (!this.config.customPatterns) {
      this.config.customPatterns = [];
    }
    this.config.customPatterns.push(pattern);
  }

  /**
   * Remove a custom pattern
   */
  removePattern(patternId: string): boolean {
    if (!this.config.customPatterns) return false;
    const index = this.config.customPatterns.findIndex(p => p.id === patternId);
    if (index >= 0) {
      this.config.customPatterns.splice(index, 1);
      return true;
    }
    return false;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private checkExactMatches(history: AIMessage[], newMessages: AIMessage[]): LoopDetectionResult {
    const window = this.config.windowSize;
    const matchedIndices: number[] = [];

    for (const newMsg of newMessages) {
      const newContent = this.getMessageContent(newMsg);
      if (!newContent) continue;

      // Check against recent history
      const recentHistory = history.slice(-window);
      for (let i = 0; i < recentHistory.length; i++) {
        const historyContent = this.getMessageContent(recentHistory[i]);
        if (!historyContent) continue;

        const similarity = this.calculateExactSimilarity(newContent, historyContent);
        if (similarity >= this.config.exactMatchThreshold) {
          matchedIndices.push(history.length - window + i);
        }
      }
    }

    if (matchedIndices.length >= 2) {
      return {
        isLoop: true,
        confidence: 0.95,
        loopType: 'exact',
        matchedMessages: matchedIndices,
        recommendation: 'stop',
        message: 'Exact message repetition detected',
      };
    }

    return { isLoop: false, confidence: 0, recommendation: 'continue' };
  }

  private checkSemanticSimilarity(history: AIMessage[], newMessages: AIMessage[]): LoopDetectionResult {
    const window = this.config.windowSize;
    const similarities: number[] = [];
    const matchedIndices: number[] = [];

    for (const newMsg of newMessages) {
      const newContent = this.getMessageContent(newMsg);
      if (!newContent) continue;

      const recentHistory = history.slice(-window);
      for (let i = 0; i < recentHistory.length; i++) {
        if (recentHistory[i].role !== newMsg.role) continue;

        const historyContent = this.getMessageContent(recentHistory[i]);
        if (!historyContent) continue;

        const similarity = this.calculateSemanticSimilarity(newContent, historyContent);
        similarities.push(similarity);

        if (similarity >= this.config.semanticMatchThreshold) {
          matchedIndices.push(history.length - window + i);
        }
      }
    }

    const avgSimilarity = similarities.length > 0
      ? similarities.reduce((a, b) => a + b, 0) / similarities.length
      : 0;

    if (matchedIndices.length >= 2 && avgSimilarity >= this.config.semanticMatchThreshold) {
      return {
        isLoop: true,
        confidence: avgSimilarity,
        loopType: 'semantic',
        matchedMessages: matchedIndices,
        recommendation: 'warn',
        message: 'Similar content pattern detected',
      };
    }

    return { isLoop: false, confidence: avgSimilarity, recommendation: 'continue' };
  }

  private checkPatterns(history: AIMessage[], newMessages: AIMessage[]): LoopDetectionResult {
    const patterns = this.config.customPatterns ?? [];
    if (patterns.length === 0) {
      return { isLoop: false, confidence: 0, recommendation: 'continue' };
    }

    const allContent = [...history, ...newMessages]
      .map(m => this.getMessageContent(m))
      .filter((c): c is string => !!c)
      .join('\n');

    for (const pattern of patterns) {
      let matchCount = 0;

      switch (pattern.type) {
        case 'exact':
          matchCount = (allContent.match(new RegExp(pattern.pattern, 'g')) ?? []).length;
          break;
        case 'regex':
          matchCount = (allContent.match(new RegExp(pattern.pattern, 'gi')) ?? []).length;
          break;
        case 'semantic':
          // Simple word frequency check
          const words = pattern.pattern.toLowerCase().split(/\s+/);
          const contentWords = allContent.toLowerCase().split(/\s+/);
          matchCount = words.filter(w => contentWords.filter(cw => cw === w).length >= 2).length;
          break;
      }

      if (matchCount >= pattern.threshold) {
        return {
          isLoop: true,
          confidence: Math.min(matchCount / pattern.threshold, 1),
          loopType: 'pattern',
          recommendation: pattern.action === 'stop' ? 'stop' : 'warn',
          message: `Pattern detected: ${pattern.pattern}`,
        };
      }
    }

    return { isLoop: false, confidence: 0, recommendation: 'continue' };
  }

  private checkConsecutiveSimilar(history: AIMessage[], newMessages: AIMessage[]): LoopDetectionResult {
    const allMessages = [...history, ...newMessages];
    const assistantMessages = allMessages.filter(m => m.role === 'assistant');

    if (assistantMessages.length < this.config.maxConsecutiveSimilar) {
      return { isLoop: false, confidence: 0, recommendation: 'continue' };
    }

    // Check last N assistant messages
    const recent = assistantMessages.slice(-this.config.maxConsecutiveSimilar);
    const contents = recent.map(m => this.getMessageContent(m)).filter((c): c is string => !!c);

    if (contents.length < 2) {
      return { isLoop: false, confidence: 0, recommendation: 'continue' };
    }

    // Calculate pairwise similarities
    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < contents.length; i++) {
      for (let j = i + 1; j < contents.length; j++) {
        totalSimilarity += this.calculateSemanticSimilarity(contents[i], contents[j]);
        comparisons++;
      }
    }

    const avgSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0;

    if (avgSimilarity >= this.config.semanticMatchThreshold * 0.9) {
      return {
        isLoop: false,
        confidence: avgSimilarity,
        recommendation: 'warn',
        message: 'Responses are becoming repetitive',
      };
    }

    return { isLoop: false, confidence: avgSimilarity, recommendation: 'continue' };
  }

  private getMessageContent(message: AIMessage): string | undefined {
    if (typeof message.content === 'string') {
      return message.content;
    }
    if (Array.isArray(message.content)) {
      return message.content
        .filter(p => p.type === 'text' && p.text)
        .map(p => p.text)
        .join('\n');
    }
    return undefined;
  }

  private calculateExactSimilarity(a: string, b: string): number {
    if (a === b) return 1;

    // Normalize and compare
    const normA = a.toLowerCase().trim();
    const normB = b.toLowerCase().trim();
    if (normA === normB) return 0.99;

    // Levenshtein-based similarity for near-matches
    const maxLen = Math.max(normA.length, normB.length);
    if (maxLen === 0) return 1;

    const distance = this.levenshteinDistance(normA, normB);
    return 1 - distance / maxLen;
  }

  private calculateSemanticSimilarity(a: string, b: string): number {
    // Simple bag-of-words similarity
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    return intersection.size / union.size;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createLoopDetector(config?: Partial<LoopDetectorConfig>): LoopDetector {
  return new LoopDetector(config);
}
