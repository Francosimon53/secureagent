import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'Fallback' });

// ============================================================================
// Fallback Types
// ============================================================================

/**
 * Fallback configuration
 */
export interface FallbackConfig<T> {
  /** Primary operation */
  operation: () => Promise<T>;
  /** Fallback operation or value */
  fallback: T | (() => T) | (() => Promise<T>);
  /** When to use fallback */
  fallbackWhen?: (error: unknown) => boolean;
  /** Callback when fallback is used */
  onFallback?: (error: unknown) => void;
}

/**
 * Fallback result
 */
export interface FallbackResult<T> {
  value: T;
  usedFallback: boolean;
  originalError?: unknown;
  duration: number;
}

// ============================================================================
// Fallback Implementation
// ============================================================================

/**
 * Execute with fallback support
 * Supports two signatures:
 * 1. withFallback(config: FallbackConfig<T>) - original
 * 2. withFallback(primary, fallback) - test-compatible
 */
export async function withFallback<T>(
  primaryOrConfig: (() => Promise<T>) | FallbackConfig<T>,
  fallbackArg?: T | ((error: unknown) => T) | ((error: unknown) => Promise<T>)
): Promise<T | FallbackResult<T>> {
  // Test-compatible signature: withFallback(primary, fallback)
  if (typeof primaryOrConfig === 'function' && fallbackArg !== undefined) {
    const primary = primaryOrConfig as () => Promise<T>;
    const fallback = fallbackArg;

    try {
      return await primary();
    } catch (error) {
      // If fallback is a function, call it with the error
      if (typeof fallback === 'function') {
        return (fallback as (error: unknown) => T | Promise<T>)(error);
      }
      // Otherwise return the static fallback value
      return fallback as T;
    }
  }

  // Original signature: withFallback(config)
  const config = primaryOrConfig as FallbackConfig<T>;
  const start = Date.now();
  const fallbackWhen = config.fallbackWhen ?? (() => true);

  try {
    const value = await config.operation();
    return {
      value,
      usedFallback: false,
      duration: Date.now() - start,
    };
  } catch (error) {
    if (!fallbackWhen(error)) {
      throw error;
    }

    logger.debug({ error: error instanceof Error ? error.message : String(error) }, 'Using fallback');

    config.onFallback?.(error);

    const fallbackValue = await resolveFallback(config.fallback);

    return {
      value: fallbackValue,
      usedFallback: true,
      originalError: error,
      duration: Date.now() - start,
    };
  }
}

/**
 * Resolve fallback value (handles static values, sync functions, and async functions)
 */
async function resolveFallback<T>(
  fallback: T | (() => T) | (() => Promise<T>)
): Promise<T> {
  if (typeof fallback === 'function') {
    return (fallback as () => T | Promise<T>)();
  }
  return fallback;
}

// ============================================================================
// Fallback Chains
// ============================================================================

/**
 * Fallback chain - try multiple operations in order
 */
export class FallbackChain<T> {
  private readonly operations: Array<{
    name: string;
    fn: () => Promise<T>;
    condition?: (error: unknown) => boolean;
  }> = [];
  private finalFallback?: T;

  /**
   * Add an operation to the chain
   * Supports two signatures:
   * 1. add(name, fn, condition?) - original
   * 2. add(fn) - test-compatible
   */
  add(
    nameOrFn: string | (() => Promise<T>),
    fn?: () => Promise<T>,
    condition?: (error: unknown) => boolean
  ): this {
    if (typeof nameOrFn === 'function') {
      // Test-compatible signature: add(fn)
      this.operations.push({
        name: `operation-${this.operations.length}`,
        fn: nameOrFn,
      });
    } else {
      // Original signature: add(name, fn, condition?)
      this.operations.push({ name: nameOrFn, fn: fn!, condition });
    }
    return this;
  }

  /**
   * Add a static fallback value
   */
  addStatic(name: string, value: T): this {
    this.operations.push({
      name,
      fn: async () => value,
    });
    return this;
  }

  /**
   * Set a final fallback value (test-compatible)
   */
  finally(value: T): this {
    this.finalFallback = value;
    return this;
  }

  /**
   * Execute the chain
   * Returns T directly for test compatibility
   */
  async execute(): Promise<T> {
    const attemptedOperations: string[] = [];
    const errors = new Map<string, unknown>();
    let lastError: unknown;

    for (const op of this.operations) {
      attemptedOperations.push(op.name);

      try {
        const value = await op.fn();
        return value;
      } catch (error) {
        lastError = error;
        errors.set(op.name, error);

        // Check if we should continue to next fallback
        if (op.condition && !op.condition(error)) {
          throw error;
        }

        logger.debug({
          operation: op.name,
          error: error instanceof Error ? error.message : String(error),
        }, 'Operation failed, trying next fallback');
      }
    }

    // Check for final fallback
    if (this.finalFallback !== undefined) {
      return this.finalFallback;
    }

    throw lastError ?? new Error('All operations in fallback chain failed');
  }
}

// ============================================================================
// Cache Fallback
// ============================================================================

/**
 * Simple in-memory cache for fallback values
 */
export class FallbackCache<T> {
  private readonly cache = new Map<string, { value: T; timestamp: number }>();
  private readonly ttl: number;
  private readonly staleWhileRevalidate: boolean;

  constructor(options?: number | { ttl?: number; staleWhileRevalidate?: boolean }) {
    if (typeof options === 'number') {
      this.ttl = options;
      this.staleWhileRevalidate = false;
    } else {
      this.ttl = options?.ttl ?? 60000;
      this.staleWhileRevalidate = options?.staleWhileRevalidate ?? false;
    }
  }

  /**
   * Get cached value if available and not expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.ttl && !this.staleWhileRevalidate) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Get cached value even if stale
   */
  getStale(key: string): T | undefined {
    const entry = this.cache.get(key);
    return entry?.value;
  }

  /**
   * Set cached value
   */
  set(key: string, value: T): void {
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  /**
   * Delete cached value
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear cached values (supports key or all)
   */
  clear(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get or fetch with cache (test-compatible)
   */
  async getOrFetch(key: string, operation: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const value = await operation();
      this.set(key, value);
      return value;
    } catch (error) {
      // If staleWhileRevalidate, try to return stale value
      if (this.staleWhileRevalidate) {
        const stale = this.getStale(key);
        if (stale !== undefined) {
          return stale;
        }
      }
      throw error;
    }
  }

  /**
   * Execute with cache fallback
   */
  async executeWithCache<R extends T>(
    key: string,
    operation: () => Promise<R>,
    options: {
      updateOnSuccess?: boolean;
      useCacheOnError?: boolean;
    } = {}
  ): Promise<{ value: R | T; fromCache: boolean }> {
    const { updateOnSuccess = true, useCacheOnError = true } = options;

    try {
      const value = await operation();

      if (updateOnSuccess) {
        this.set(key, value);
      }

      return { value, fromCache: false };
    } catch (error) {
      if (useCacheOnError) {
        const cached = this.getStale(key);
        if (cached !== undefined) {
          logger.debug({ key }, 'Using cached fallback value');
          return { value: cached, fromCache: true };
        }
      }
      throw error;
    }
  }
}

// ============================================================================
// Graceful Degradation
// ============================================================================

/**
 * Configuration for graceful degradation levels
 */
export interface DegradationLevel<T> {
  name: string;
  operation: () => Promise<T>;
  capabilities: string[];
}

/**
 * Degradation level names (test-compatible)
 */
export type DegradationLevelName = 'normal' | 'degraded' | 'minimal' | 'offline';

/**
 * Graceful degradation handler
 *
 * Automatically degrades to lower service levels when errors occur
 */
export class GracefulDegradation<T = unknown> {
  private readonly levels: DegradationLevel<T>[] = [];
  private currentLevelIndex = 0;
  private failureCount = 0;
  private successCount = 0;
  private readonly thresholds: { degraded: number; minimal: number; offline: number };
  private readonly recoveryThreshold: number;
  private readonly failureThreshold: number;
  private readonly recoveryTime: number;
  private lastDegradation = 0;

  constructor(options: {
    failureThreshold?: number;
    recoveryTimeMs?: number;
    thresholds?: { degraded: number; minimal: number; offline: number };
    recoveryThreshold?: number;
  } = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.recoveryTime = options.recoveryTimeMs ?? 30000;
    this.thresholds = options.thresholds ?? { degraded: 3, minimal: 5, offline: 10 };
    this.recoveryThreshold = options.recoveryThreshold ?? 3;
  }

  /**
   * Get current degradation level (test-compatible)
   */
  getLevel(): DegradationLevelName {
    if (this.failureCount >= this.thresholds.offline) return 'offline';
    if (this.failureCount >= this.thresholds.minimal) return 'minimal';
    if (this.failureCount >= this.thresholds.degraded) return 'degraded';
    return 'normal';
  }

  /**
   * Record a failure (test-compatible)
   */
  recordFailure(): void {
    this.failureCount++;
    this.successCount = 0;
  }

  /**
   * Record a success (test-compatible)
   */
  recordSuccess(): void {
    this.successCount++;
    if (this.successCount >= this.recoveryThreshold) {
      // Reset failure count to recover
      this.failureCount = Math.max(0, this.failureCount - this.thresholds.degraded);
      this.successCount = 0;
    }
  }

  /**
   * Add a degradation level (in order of preference)
   */
  addLevel(level: DegradationLevel<T>): this {
    this.levels.push(level);
    return this;
  }

  /**
   * Execute operation based on degradation level
   * Supports two signatures:
   * 1. execute() - use registered levels (original)
   * 2. execute(handlers) - use handler map (test-compatible)
   */
  async execute(handlers?: {
    normal?: () => Promise<T>;
    degraded?: () => Promise<T>;
    minimal?: () => Promise<T>;
    offline?: () => Promise<T>;
  }): Promise<T | { value: T; level: string; capabilities: string[]; degraded: boolean }> {
    // Test-compatible signature: execute(handlers)
    if (handlers) {
      const level = this.getLevel();
      const handler = handlers[level];
      if (!handler) {
        throw new Error(`No handler for degradation level: ${level}`);
      }
      return handler();
    }

    // Original signature: execute() - use registered levels
    // Try to recover if enough time has passed
    this.attemptRecovery();

    // Try from current level down
    for (let i = this.currentLevelIndex; i < this.levels.length; i++) {
      const level = this.levels[i];

      try {
        const value = await level.operation();

        // Success - reset failure count
        this.failureCount = 0;

        return {
          value,
          level: level.name,
          capabilities: level.capabilities,
          degraded: i > 0,
        };
      } catch (error) {
        this.failureCount++;

        if (this.failureCount >= this.failureThreshold && i < this.levels.length - 1) {
          this.degrade();
        }

        // Try next level
        continue;
      }
    }

    throw new Error('All degradation levels exhausted');
  }

  /**
   * Degrade to next level
   */
  private degrade(): void {
    if (this.currentLevelIndex < this.levels.length - 1) {
      this.currentLevelIndex++;
      this.failureCount = 0;
      this.lastDegradation = Date.now();

      logger.warn({
        level: this.levels[this.currentLevelIndex].name,
        capabilities: this.levels[this.currentLevelIndex].capabilities,
      }, 'Service degraded to lower level');
    }
  }

  /**
   * Attempt to recover to higher level
   */
  private attemptRecovery(): void {
    if (this.currentLevelIndex > 0 &&
        Date.now() - this.lastDegradation > this.recoveryTime) {
      this.currentLevelIndex--;
      this.failureCount = 0;

      logger.info({
        level: this.levels[this.currentLevelIndex].name,
      }, 'Attempting recovery to higher service level');
    }
  }

  /**
   * Get current service level
   */
  getCurrentLevel(): { name: string; capabilities: string[] } {
    const level = this.levels[this.currentLevelIndex];
    return {
      name: level.name,
      capabilities: level.capabilities,
    };
  }

  /**
   * Force recovery to highest level
   */
  recover(): void {
    this.currentLevelIndex = 0;
    this.failureCount = 0;
    this.lastDegradation = 0;
  }
}

// ============================================================================
// Default Fallback Predicates
// ============================================================================

/**
 * Fallback on any error
 */
export function fallbackOnAny(): boolean {
  return true;
}

/**
 * Fallback on specific error types
 */
export function fallbackOnErrorType(...types: Array<new (...args: never[]) => Error>): (error: unknown) => boolean {
  return (error: unknown) => types.some(type => error instanceof type);
}

/**
 * Fallback on specific error messages
 */
export function fallbackOnMessage(...patterns: RegExp[]): (error: unknown) => boolean {
  return (error: unknown) => {
    if (error instanceof Error) {
      return patterns.some(pattern => pattern.test(error.message));
    }
    return false;
  };
}

/**
 * Don't fallback on specific errors (inverse)
 */
export function dontFallbackOn(predicate: (error: unknown) => boolean): (error: unknown) => boolean {
  return (error: unknown) => !predicate(error);
}
