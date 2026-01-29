import { CircuitBreaker, CircuitBreakerConfig, CircuitOpenError } from './circuit-breaker.js';
import { retryWithResult, RetryConfig, RetryExhaustedError } from './retry.js';
import { Bulkhead, BulkheadConfig, BulkheadFullError } from './bulkhead.js';
import { withFallback, FallbackConfig } from './fallback.js';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'ResiliencePolicy' });

// ============================================================================
// Policy Types
// ============================================================================

/**
 * Combined resilience policy configuration
 */
export interface ResiliencePolicyConfig<T> {
  /** Policy name */
  name: string;
  /** Circuit breaker configuration */
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  /** Retry configuration */
  retry?: Partial<RetryConfig>;
  /** Bulkhead configuration */
  bulkhead?: Partial<BulkheadConfig>;
  /** Fallback value or function */
  fallback?: T | (() => T) | (() => Promise<T>);
  /** Timeout for operation in ms */
  timeout?: number;
  /** Enable/disable each component */
  enabled?: {
    circuitBreaker?: boolean;
    retry?: boolean;
    bulkhead?: boolean;
    fallback?: boolean;
    timeout?: boolean;
  };
}

/**
 * Policy execution result
 */
export interface PolicyResult<T> {
  value: T;
  duration: number;
  attempts: number;
  usedFallback: boolean;
  circuitState?: string;
  bulkheadStats?: {
    activeCalls: number;
    queuedCalls: number;
  };
}

// ============================================================================
// Timeout Error
// ============================================================================

/**
 * Error thrown when operation times out
 */
export class PolicyTimeoutError extends Error {
  readonly policyName: string;
  readonly timeout: number;

  constructor(name: string, timeout: number) {
    super(`Operation timed out after ${timeout}ms in policy '${name}'`);
    this.name = 'PolicyTimeoutError';
    this.policyName = name;
    this.timeout = timeout;
  }
}

// ============================================================================
// Resilience Policy Implementation
// ============================================================================

/**
 * Combined resilience policy
 *
 * Execution order:
 * 1. Timeout wrapper (outermost)
 * 2. Bulkhead (concurrency control)
 * 3. Circuit Breaker (fail fast)
 * 4. Retry (with backoff)
 * 5. Operation execution (innermost)
 * 6. Fallback (on failure)
 */
export class ResiliencePolicy<T> {
  private readonly config: Required<ResiliencePolicyConfig<T>>;
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly bulkhead?: Bulkhead;
  private totalExecutions = 0;
  private successCount = 0;
  private failureCount = 0;

  constructor(config: ResiliencePolicyConfig<T>) {
    this.config = {
      name: config.name,
      circuitBreaker: config.circuitBreaker ?? {},
      retry: config.retry ?? {},
      bulkhead: config.bulkhead ?? {},
      fallback: config.fallback as T | (() => T) | (() => Promise<T>),
      timeout: config.timeout ?? 0,
      enabled: {
        // Only enable circuit breaker/retry if explicitly configured
        circuitBreaker: config.enabled?.circuitBreaker ?? (config.circuitBreaker !== undefined && Object.keys(config.circuitBreaker).length > 0),
        retry: config.enabled?.retry ?? (config.retry !== undefined && Object.keys(config.retry).length > 0),
        bulkhead: config.enabled?.bulkhead ?? (config.bulkhead !== undefined && Object.keys(config.bulkhead).length > 0),
        fallback: config.enabled?.fallback ?? (config.fallback !== undefined),
        timeout: config.enabled?.timeout ?? (config.timeout !== undefined && config.timeout > 0),
      },
    };

    // Initialize components
    if (this.config.enabled.circuitBreaker) {
      this.circuitBreaker = new CircuitBreaker({
        name: `${config.name}-circuit`,
        ...this.config.circuitBreaker,
      });
    }

    if (this.config.enabled.bulkhead) {
      this.bulkhead = new Bulkhead({
        name: `${config.name}-bulkhead`,
        ...this.config.bulkhead,
      });
    }
  }

  /**
   * Execute operation through the policy
   * Returns T directly for test compatibility
   */
  async execute(operation: () => Promise<T>): Promise<T> {
    this.totalExecutions++;

    try {
      const result = await this.executeWithResult(operation);
      this.successCount++;
      return result.value;
    } catch (error) {
      this.failureCount++;
      throw error;
    }
  }

  /**
   * Execute operation through the policy (returns full result)
   */
  async executeWithResult(operation: () => Promise<T>): Promise<PolicyResult<T>> {
    const start = Date.now();
    let attempts = 0;
    let usedFallback = false;

    // Build the execution chain
    let wrappedOperation = operation;

    // Apply timeout (outermost)
    if (this.config.enabled.timeout && this.config.timeout > 0) {
      const timeout = this.config.timeout;
      const name = this.config.name;
      const innerOp = wrappedOperation;
      wrappedOperation = () => this.withTimeout(innerOp, timeout, name);
    }

    // Apply retry
    if (this.config.enabled.retry) {
      const retryConfig = this.config.retry;
      const innerOp = wrappedOperation;
      wrappedOperation = async () => {
        const result = await retryWithResult(innerOp, retryConfig);
        attempts = result.attempts;
        return result.result!;
      };
    }

    // Apply circuit breaker
    if (this.config.enabled.circuitBreaker && this.circuitBreaker) {
      const circuit = this.circuitBreaker;
      const innerOp = wrappedOperation;
      wrappedOperation = () => circuit.execute(innerOp);
    }

    // Apply bulkhead
    if (this.config.enabled.bulkhead && this.bulkhead) {
      const bulk = this.bulkhead;
      const innerOp = wrappedOperation;
      wrappedOperation = () => bulk.execute(innerOp);
    }

    // Execute with optional fallback
    let value: T;

    if (this.config.enabled.fallback && this.config.fallback !== undefined) {
      const result = await withFallback({
        operation: wrappedOperation,
        fallback: this.config.fallback,
        onFallback: () => {
          usedFallback = true;
        },
      });
      value = result.value;
    } else {
      value = await wrappedOperation();
    }

    return {
      value,
      duration: Date.now() - start,
      attempts: attempts || 1,
      usedFallback,
      circuitState: this.circuitBreaker?.getState(),
      bulkheadStats: this.bulkhead ? {
        activeCalls: this.bulkhead.getStats().activeCalls,
        queuedCalls: this.bulkhead.getStats().queuedCalls,
      } : undefined,
    };
  }

  /**
   * Get execution statistics (test-compatible)
   */
  getStats(): { totalExecutions: number; successCount: number; failureCount: number } {
    return {
      totalExecutions: this.totalExecutions,
      successCount: this.successCount,
      failureCount: this.failureCount,
    };
  }

  /**
   * Wrap operation with timeout
   */
  private withTimeout(
    operation: () => Promise<T>,
    timeout: number,
    name: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new PolicyTimeoutError(name, timeout));
      }, timeout);

      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Get policy status
   */
  getStatus(): {
    name: string;
    circuitBreaker?: { state: string; stats: object };
    bulkhead?: { stats: object };
  } {
    return {
      name: this.config.name,
      circuitBreaker: this.circuitBreaker ? {
        state: this.circuitBreaker.getState(),
        stats: this.circuitBreaker.getStats(),
      } : undefined,
      bulkhead: this.bulkhead ? {
        stats: this.bulkhead.getStats(),
      } : undefined,
    };
  }

  /**
   * Reset the policy (circuit breaker)
   */
  reset(): void {
    this.circuitBreaker?.reset();
  }

  /**
   * Get the circuit breaker (if enabled)
   */
  getCircuitBreaker(): CircuitBreaker | undefined {
    return this.circuitBreaker;
  }

  /**
   * Get the bulkhead (if enabled)
   */
  getBulkhead(): Bulkhead | undefined {
    return this.bulkhead;
  }
}

// ============================================================================
// Policy Builder
// ============================================================================

/**
 * Fluent builder for resilience policies
 */
export class PolicyBuilder<T> {
  private config: ResiliencePolicyConfig<T>;

  constructor(name: string) {
    this.config = {
      name,
      enabled: {},
    };
  }

  /**
   * Add circuit breaker
   */
  withCircuitBreaker(config: Partial<CircuitBreakerConfig> = {}): this {
    this.config.circuitBreaker = config;
    this.config.enabled!.circuitBreaker = true;
    return this;
  }

  // Test-compatible alias
  circuitBreaker(config: Partial<CircuitBreakerConfig> = {}): this {
    return this.withCircuitBreaker(config);
  }

  /**
   * Add retry logic
   */
  withRetry(config: Partial<RetryConfig> = {}): this {
    this.config.retry = config;
    this.config.enabled!.retry = true;
    return this;
  }

  // Test-compatible alias
  retry(config: Partial<RetryConfig> = {}): this {
    return this.withRetry(config);
  }

  /**
   * Add bulkhead
   */
  withBulkhead(config: Partial<BulkheadConfig> = {}): this {
    this.config.bulkhead = config;
    this.config.enabled!.bulkhead = true;
    return this;
  }

  // Test-compatible alias
  bulkhead(config: Partial<BulkheadConfig> = {}): this {
    return this.withBulkhead(config);
  }

  /**
   * Add fallback
   */
  withFallback(fallback: T | (() => T) | (() => Promise<T>)): this {
    this.config.fallback = fallback;
    this.config.enabled!.fallback = true;
    return this;
  }

  // Test-compatible alias
  fallback(fallback: T | (() => T) | (() => Promise<T>)): this {
    return this.withFallback(fallback);
  }

  /**
   * Add timeout
   */
  withTimeout(ms: number): this {
    this.config.timeout = ms;
    this.config.enabled!.timeout = true;
    return this;
  }

  // Test-compatible alias
  timeout(ms: number): this {
    return this.withTimeout(ms);
  }

  /**
   * Disable circuit breaker
   */
  noCircuitBreaker(): this {
    this.config.enabled!.circuitBreaker = false;
    return this;
  }

  /**
   * Disable retry
   */
  noRetry(): this {
    this.config.enabled!.retry = false;
    return this;
  }

  /**
   * Build the policy
   */
  build(): ResiliencePolicy<T> {
    return new ResiliencePolicy(this.config);
  }
}

/**
 * Start building a resilience policy
 */
export function policy<T>(name: string): PolicyBuilder<T> {
  return new PolicyBuilder<T>(name);
}

// ============================================================================
// Pre-configured Policies
// ============================================================================

/**
 * Create a standard API call policy
 */
export function apiPolicy<T>(
  name: string,
  fallback?: T | (() => T) | (() => Promise<T>)
): ResiliencePolicy<T> {
  const builder = policy<T>(name)
    .withTimeout(30000)
    .withCircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 30000,
    })
    .withRetry({
      maxAttempts: 3,
      initialDelay: 1000,
      strategy: 'exponential',
    });

  if (fallback !== undefined) {
    builder.withFallback(fallback);
  }

  return builder.build();
}

/**
 * Create a database operation policy
 */
export function databasePolicy<T>(
  name: string,
  fallback?: T | (() => T) | (() => Promise<T>)
): ResiliencePolicy<T> {
  const builder = policy<T>(name)
    .withTimeout(10000)
    .withCircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 60000,
    })
    .withRetry({
      maxAttempts: 2,
      initialDelay: 500,
      strategy: 'fixed',
    })
    .withBulkhead({
      maxConcurrent: 20,
      maxQueueSize: 50,
    });

  if (fallback !== undefined) {
    builder.withFallback(fallback);
  }

  return builder.build();
}

/**
 * Create a critical operation policy (no retry, fail fast)
 */
export function criticalPolicy<T>(
  name: string,
  fallback?: T | (() => T) | (() => Promise<T>)
): ResiliencePolicy<T> {
  const builder = policy<T>(name)
    .withTimeout(5000)
    .withCircuitBreaker({
      failureThreshold: 2,
      resetTimeout: 60000,
    })
    .noRetry();

  if (fallback !== undefined) {
    builder.withFallback(fallback);
  }

  return builder.build();
}

// ============================================================================
// Error Type Guards
// ============================================================================

/**
 * Check if error is a circuit open error
 */
export function isCircuitOpen(error: unknown): error is CircuitOpenError {
  return error instanceof CircuitOpenError;
}

/**
 * Check if error is a retry exhausted error
 */
export function isRetryExhausted(error: unknown): error is RetryExhaustedError {
  return error instanceof RetryExhaustedError;
}

/**
 * Check if error is a bulkhead full error
 */
export function isBulkheadFull(error: unknown): error is BulkheadFullError {
  return error instanceof BulkheadFullError;
}

/**
 * Check if error is a policy timeout
 */
export function isPolicyTimeout(error: unknown): error is PolicyTimeoutError {
  return error instanceof PolicyTimeoutError;
}

/**
 * Check if error is any resilience error
 */
export function isResilienceError(error: unknown): boolean {
  return isCircuitOpen(error) ||
         isRetryExhausted(error) ||
         isBulkheadFull(error) ||
         isPolicyTimeout(error);
}
