/**
 * Failure Tracker
 * Tracks failures and patterns for self-correction
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  TrackedFailure,
  FailureCategory,
  CorrectionStrategy,
} from '../types.js';
import { AUTONOMY_EVENTS } from '../constants.js';

/**
 * Failure statistics
 */
export interface FailureStats {
  /** Total failures tracked */
  totalFailures: number;
  /** Failures by category */
  byCategory: Record<FailureCategory, number>;
  /** Failures by tool */
  byTool: Record<string, number>;
  /** Correction success rate */
  correctionSuccessRate: number;
  /** Most common failure category */
  mostCommonCategory?: FailureCategory;
  /** Most problematic tool */
  mostProblematicTool?: string;
}

/**
 * Failure tracker configuration
 */
export interface FailureTrackerConfig {
  /** Maximum failures to track per session */
  maxFailures?: number;
  /** Failure retention duration in ms */
  retentionMs?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<FailureTrackerConfig> = {
  maxFailures: 1000,
  retentionMs: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Failure Tracker
 * Tracks execution failures for analysis and learning
 */
export class FailureTracker extends EventEmitter {
  private readonly config: Required<FailureTrackerConfig>;
  private readonly failures: Map<string, TrackedFailure> = new Map();
  private readonly failuresBySession: Map<string, string[]> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config?: FailureTrackerConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start cleanup interval
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      60 * 60 * 1000 // Every hour
    );
  }

  /**
   * Track a failure
   */
  track(
    failure: Omit<TrackedFailure, 'id' | 'timestamp'>,
    sessionId?: string
  ): TrackedFailure {
    const tracked: TrackedFailure = {
      ...failure,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    // Enforce limit
    if (this.failures.size >= this.config.maxFailures) {
      // Remove oldest failure
      const oldest = this.getOldest();
      if (oldest) {
        this.failures.delete(oldest.id);
      }
    }

    this.failures.set(tracked.id, tracked);

    // Track by session
    if (sessionId) {
      const sessionFailures = this.failuresBySession.get(sessionId) ?? [];
      sessionFailures.push(tracked.id);
      this.failuresBySession.set(sessionId, sessionFailures);
    }

    this.emit('failure:tracked', tracked);

    return tracked;
  }

  /**
   * Record correction result
   */
  recordCorrectionResult(failureId: string, succeeded: boolean): void {
    const failure = this.failures.get(failureId);
    if (failure) {
      failure.correctionSucceeded = succeeded;
    }
  }

  /**
   * Get failure by ID
   */
  get(failureId: string): TrackedFailure | undefined {
    return this.failures.get(failureId);
  }

  /**
   * Get failures for a session
   */
  getBySession(sessionId: string): TrackedFailure[] {
    const failureIds = this.failuresBySession.get(sessionId) ?? [];
    return failureIds
      .map(id => this.failures.get(id))
      .filter((f): f is TrackedFailure => f !== undefined);
  }

  /**
   * Get failures for a step
   */
  getByStep(stepId: string): TrackedFailure[] {
    return Array.from(this.failures.values())
      .filter(f => f.stepId === stepId);
  }

  /**
   * Get failures for a tool
   */
  getByTool(toolName: string): TrackedFailure[] {
    return Array.from(this.failures.values())
      .filter(f => f.toolName === toolName);
  }

  /**
   * Get failures by category
   */
  getByCategory(category: FailureCategory): TrackedFailure[] {
    return Array.from(this.failures.values())
      .filter(f => f.category === category);
  }

  /**
   * Get recent failures
   */
  getRecent(limit: number = 10): TrackedFailure[] {
    return Array.from(this.failures.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get failure statistics
   */
  getStats(): FailureStats {
    const failures = Array.from(this.failures.values());

    const byCategory: Record<FailureCategory, number> = {
      validation_error: 0,
      permission_denied: 0,
      resource_not_found: 0,
      timeout: 0,
      rate_limit: 0,
      network_error: 0,
      tool_error: 0,
      unknown: 0,
    };

    const byTool: Record<string, number> = {};

    let correctionAttempts = 0;
    let correctionSuccesses = 0;

    for (const failure of failures) {
      byCategory[failure.category]++;

      if (failure.toolName) {
        byTool[failure.toolName] = (byTool[failure.toolName] ?? 0) + 1;
      }

      if (failure.strategyAttempted) {
        correctionAttempts++;
        if (failure.correctionSucceeded) {
          correctionSuccesses++;
        }
      }
    }

    // Find most common category
    let mostCommonCategory: FailureCategory | undefined;
    let maxCategoryCount = 0;
    for (const [cat, count] of Object.entries(byCategory)) {
      if (count > maxCategoryCount) {
        maxCategoryCount = count;
        mostCommonCategory = cat as FailureCategory;
      }
    }

    // Find most problematic tool
    let mostProblematicTool: string | undefined;
    let maxToolCount = 0;
    for (const [tool, count] of Object.entries(byTool)) {
      if (count > maxToolCount) {
        maxToolCount = count;
        mostProblematicTool = tool;
      }
    }

    return {
      totalFailures: failures.length,
      byCategory,
      byTool,
      correctionSuccessRate: correctionAttempts > 0
        ? correctionSuccesses / correctionAttempts
        : 0,
      mostCommonCategory: maxCategoryCount > 0 ? mostCommonCategory : undefined,
      mostProblematicTool: maxToolCount > 0 ? mostProblematicTool : undefined,
    };
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): FailureStats {
    const failures = this.getBySession(sessionId);

    const byCategory: Record<FailureCategory, number> = {
      validation_error: 0,
      permission_denied: 0,
      resource_not_found: 0,
      timeout: 0,
      rate_limit: 0,
      network_error: 0,
      tool_error: 0,
      unknown: 0,
    };

    const byTool: Record<string, number> = {};

    let correctionAttempts = 0;
    let correctionSuccesses = 0;

    for (const failure of failures) {
      byCategory[failure.category]++;

      if (failure.toolName) {
        byTool[failure.toolName] = (byTool[failure.toolName] ?? 0) + 1;
      }

      if (failure.strategyAttempted) {
        correctionAttempts++;
        if (failure.correctionSucceeded) {
          correctionSuccesses++;
        }
      }
    }

    return {
      totalFailures: failures.length,
      byCategory,
      byTool,
      correctionSuccessRate: correctionAttempts > 0
        ? correctionSuccesses / correctionAttempts
        : 0,
    };
  }

  /**
   * Check if a tool has repeated failures
   */
  hasRepeatedFailures(
    toolName: string,
    threshold: number = 3,
    windowMs: number = 60000
  ): boolean {
    const now = Date.now();
    const recentFailures = this.getByTool(toolName)
      .filter(f => now - f.timestamp < windowMs);
    return recentFailures.length >= threshold;
  }

  /**
   * Check if a category has repeated failures
   */
  hasCategorySpike(
    category: FailureCategory,
    threshold: number = 5,
    windowMs: number = 60000
  ): boolean {
    const now = Date.now();
    const recentFailures = this.getByCategory(category)
      .filter(f => now - f.timestamp < windowMs);
    return recentFailures.length >= threshold;
  }

  /**
   * Clear failures for a session
   */
  clearSession(sessionId: string): void {
    const failureIds = this.failuresBySession.get(sessionId) ?? [];
    for (const id of failureIds) {
      this.failures.delete(id);
    }
    this.failuresBySession.delete(sessionId);
  }

  /**
   * Clear all failures
   */
  clear(): void {
    this.failures.clear();
    this.failuresBySession.clear();
  }

  /**
   * Destroy the tracker
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.clear();
  }

  /**
   * Get oldest failure
   */
  private getOldest(): TrackedFailure | undefined {
    let oldest: TrackedFailure | undefined;
    for (const failure of this.failures.values()) {
      if (!oldest || failure.timestamp < oldest.timestamp) {
        oldest = failure;
      }
    }
    return oldest;
  }

  /**
   * Cleanup old failures
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.config.retentionMs;

    for (const [id, failure] of this.failures) {
      if (failure.timestamp < cutoff) {
        this.failures.delete(id);

        // Also remove from session tracking
        for (const [sessionId, failureIds] of this.failuresBySession) {
          const index = failureIds.indexOf(id);
          if (index !== -1) {
            failureIds.splice(index, 1);
            if (failureIds.length === 0) {
              this.failuresBySession.delete(sessionId);
            }
          }
        }
      }
    }
  }
}

/**
 * Create a failure tracker
 */
export function createFailureTracker(config?: FailureTrackerConfig): FailureTracker {
  return new FailureTracker(config);
}
