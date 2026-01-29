/**
 * Error Capture System
 * Captures and analyzes errors for learning
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  CapturedError,
  ErrorCategory,
} from '../types.js';
import type { LearningStore } from '../stores/learning-store.js';
import { ORCHESTRATION_EVENTS } from '../events.js';

/**
 * Error capture configuration
 */
export interface ErrorCaptureConfig {
  /** Capture all errors */
  captureAll: boolean;
  /** Error categories to capture */
  captureCategories: ErrorCategory[];
  /** Maximum errors to store */
  maxStoredErrors: number;
  /** Error retention in hours */
  retentionHours: number;
  /** Enable pattern detection */
  enablePatternDetection: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CAPTURE_CONFIG: ErrorCaptureConfig = {
  captureAll: true,
  captureCategories: ['timeout', 'api_error', 'validation', 'logic', 'resource', 'unknown'],
  maxStoredErrors: 1000,
  retentionHours: 168, // 7 days
  enablePatternDetection: true,
};

/**
 * Error capture request
 */
export interface CaptureErrorRequest {
  /** Agent ID */
  agentId: string;
  /** Task ID if applicable */
  taskId?: string;
  /** Error object or message */
  error: Error | string;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Override category */
  category?: ErrorCategory;
}

/**
 * Error pattern
 */
export interface ErrorPattern {
  /** Pattern description */
  pattern: string;
  /** Category */
  category: ErrorCategory;
  /** Occurrence count */
  count: number;
  /** First occurrence */
  firstSeen: number;
  /** Last occurrence */
  lastSeen: number;
  /** Example error IDs */
  examples: string[];
}

/**
 * Error capture events
 */
export interface ErrorCaptureEvents {
  'error:captured': (error: CapturedError) => void;
  'error:resolved': (errorId: string, resolution: string) => void;
  'pattern:detected': (pattern: ErrorPattern) => void;
}

/**
 * Captures and tracks errors
 */
export class ErrorCapture extends EventEmitter {
  private config: ErrorCaptureConfig;
  private patternCache: Map<string, ErrorPattern> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private store: LearningStore,
    config?: Partial<ErrorCaptureConfig>
  ) {
    super();
    this.config = { ...DEFAULT_CAPTURE_CONFIG, ...config };
  }

  /**
   * Start error capture (cleanup scheduling)
   */
  start(): void {
    if (this.cleanupInterval) {
      return;
    }

    // Run cleanup every hour
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      60 * 60 * 1000
    );
  }

  /**
   * Stop error capture
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Capture an error
   */
  async capture(request: CaptureErrorRequest): Promise<CapturedError> {
    const error = request.error;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    const category = request.category || this.categorizeError(errorMessage, stack);

    // Check if we should capture this category
    if (!this.config.captureAll && !this.config.captureCategories.includes(category)) {
      throw new Error(`Error category '${category}' is not configured for capture`);
    }

    const captured: CapturedError = {
      id: randomUUID(),
      agentId: request.agentId,
      taskId: request.taskId,
      category,
      message: errorMessage,
      stack,
      context: request.context || {},
      occurredAt: Date.now(),
    };

    await this.store.saveError(captured);

    // Update pattern cache
    if (this.config.enablePatternDetection) {
      await this.updatePatternCache(captured);
    }

    this.emit('error:captured', captured);
    this.emit(ORCHESTRATION_EVENTS.ERROR_CAPTURED, {
      errorId: captured.id,
      agentId: captured.agentId,
      category: captured.category,
      taskId: captured.taskId,
      timestamp: Date.now(),
      source: 'error-capture',
    });

    return captured;
  }

  /**
   * Get error by ID
   */
  async getError(errorId: string): Promise<CapturedError | null> {
    return this.store.getError(errorId);
  }

  /**
   * Get errors by agent
   */
  async getErrorsByAgent(agentId: string): Promise<CapturedError[]> {
    return this.store.getErrorsByAgent(agentId);
  }

  /**
   * Get errors by category
   */
  async getErrorsByCategory(category: ErrorCategory): Promise<CapturedError[]> {
    return this.store.getErrorsByCategory(category);
  }

  /**
   * Get recent errors
   */
  async getRecentErrors(hours: number = 24): Promise<CapturedError[]> {
    return this.store.getRecentErrors(hours);
  }

  /**
   * Get unresolved errors
   */
  async getUnresolvedErrors(): Promise<CapturedError[]> {
    return this.store.getUnresolvedErrors();
  }

  /**
   * Resolve an error
   */
  async resolveError(
    errorId: string,
    resolution: string,
    preventionStrategy?: string
  ): Promise<void> {
    await this.store.resolveError(errorId, resolution, preventionStrategy);

    this.emit('error:resolved', errorId, resolution);
  }

  /**
   * Categorize an error based on its message and stack
   */
  private categorizeError(message: string, stack?: string): ErrorCategory {
    const lowerMessage = message.toLowerCase();
    const lowerStack = stack?.toLowerCase() || '';

    // Timeout errors
    if (
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('timed out') ||
      lowerMessage.includes('deadline exceeded')
    ) {
      return 'timeout';
    }

    // API errors
    if (
      lowerMessage.includes('api') ||
      lowerMessage.includes('fetch') ||
      lowerMessage.includes('request failed') ||
      lowerMessage.includes('network') ||
      lowerMessage.includes('connection') ||
      lowerMessage.includes('http') ||
      /\b(4\d{2}|5\d{2})\b/.test(message)
    ) {
      return 'api_error';
    }

    // Validation errors
    if (
      lowerMessage.includes('validation') ||
      lowerMessage.includes('invalid') ||
      lowerMessage.includes('required') ||
      lowerMessage.includes('must be') ||
      lowerMessage.includes('expected')
    ) {
      return 'validation';
    }

    // Resource errors
    if (
      lowerMessage.includes('memory') ||
      lowerMessage.includes('disk') ||
      lowerMessage.includes('quota') ||
      lowerMessage.includes('limit') ||
      lowerMessage.includes('capacity') ||
      lowerMessage.includes('out of')
    ) {
      return 'resource';
    }

    // Logic errors (often have specific stack traces)
    if (
      lowerMessage.includes('typeerror') ||
      lowerMessage.includes('referenceerror') ||
      lowerMessage.includes('null') ||
      lowerMessage.includes('undefined') ||
      lowerStack.includes('at ') // Has a stack trace suggesting code error
    ) {
      return 'logic';
    }

    return 'unknown';
  }

  /**
   * Update pattern cache with new error
   */
  private async updatePatternCache(error: CapturedError): Promise<void> {
    // Create a simple pattern key based on category and message pattern
    const patternKey = this.createPatternKey(error);

    let pattern = this.patternCache.get(patternKey);

    if (pattern) {
      pattern.count++;
      pattern.lastSeen = error.occurredAt;
      if (pattern.examples.length < 5) {
        pattern.examples.push(error.id);
      }
    } else {
      pattern = {
        pattern: this.extractPattern(error.message),
        category: error.category,
        count: 1,
        firstSeen: error.occurredAt,
        lastSeen: error.occurredAt,
        examples: [error.id],
      };
      this.patternCache.set(patternKey, pattern);
    }

    // Emit pattern detection if count threshold reached
    if (pattern.count === 3) {
      this.emit('pattern:detected', pattern);
    }
  }

  /**
   * Create a pattern key from error
   */
  private createPatternKey(error: CapturedError): string {
    // Normalize the message by removing specific values
    const normalizedMessage = error.message
      .replace(/\b[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, '<UUID>')
      .replace(/\b\d+\b/g, '<NUM>')
      .replace(/["'][^"']+["']/g, '<STR>')
      .slice(0, 100);

    return `${error.category}:${normalizedMessage}`;
  }

  /**
   * Extract a general pattern from error message
   */
  private extractPattern(message: string): string {
    return message
      .replace(/\b[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, '{id}')
      .replace(/\b\d+\b/g, '{n}')
      .replace(/["'][^"']+["']/g, '{str}')
      .trim();
  }

  /**
   * Get detected patterns
   */
  getPatterns(): ErrorPattern[] {
    return Array.from(this.patternCache.values())
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get patterns by category
   */
  getPatternsByCategory(category: ErrorCategory): ErrorPattern[] {
    return this.getPatterns().filter(p => p.category === category);
  }

  /**
   * Get most frequent patterns
   */
  getTopPatterns(limit: number = 10): ErrorPattern[] {
    return this.getPatterns().slice(0, limit);
  }

  /**
   * Get error statistics
   */
  async getStats(): Promise<{
    total: number;
    byCategory: Record<ErrorCategory, number>;
    resolved: number;
    unresolved: number;
    recent: number;
  }> {
    const [recent, unresolved] = await Promise.all([
      this.store.getRecentErrors(24),
      this.store.getUnresolvedErrors(),
    ]);

    const byCategory: Record<ErrorCategory, number> = {
      timeout: 0,
      api_error: 0,
      validation: 0,
      logic: 0,
      resource: 0,
      unknown: 0,
    };

    for (const error of recent) {
      byCategory[error.category]++;
    }

    const resolved = recent.filter(e => e.resolvedAt).length;

    return {
      total: recent.length,
      byCategory,
      resolved,
      unresolved: unresolved.length,
      recent: recent.filter(e => e.occurredAt > Date.now() - 60 * 60 * 1000).length,
    };
  }

  /**
   * Cleanup old errors
   */
  async cleanup(): Promise<number> {
    const retentionMs = this.config.retentionHours * 60 * 60 * 1000;
    return this.store.deleteOldErrors(retentionMs);
  }

  /**
   * Clear pattern cache
   */
  clearPatternCache(): void {
    this.patternCache.clear();
  }
}

/**
 * Create an error capture instance
 */
export function createErrorCapture(
  store: LearningStore,
  config?: Partial<ErrorCaptureConfig>
): ErrorCapture {
  return new ErrorCapture(store, config);
}
