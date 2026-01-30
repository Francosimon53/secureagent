import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'Retry' });

// ============================================================================
// Retry Types
// ============================================================================

/**
 * Retry strategy types
 */
export type RetryStrategy = 'fixed' | 'linear' | 'exponential' | 'fibonacci' | 'custom';

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts?: number;
  /** Initial delay in ms */
  initialDelay?: number;
  /** Maximum delay in ms */
  maxDelay?: number;
  /** Retry strategy */
  strategy?: RetryStrategy;
  /** Multiplier for exponential backoff */
  multiplier?: number;
  /** Test-compatible alias for multiplier */
  backoffMultiplier?: number;
  /** Add jitter to delays */
  jitter?: boolean;
  /** Jitter factor (0-1) */
  jitterFactor?: number;
  /** Custom delay function */
  delayFunction?: (attempt: number, error: unknown) => number;
  /** Predicate to determine if error is retryable */
  retryIf?: (error: unknown, attempt: number) => boolean;
  /** Callback before each retry - supports both object and positional arg styles */
  onRetry?: ((info: { error: unknown; attempt: number; delay?: number }) => void) | ((error: unknown, attempt: number, delay: number) => void);
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Timeout for each attempt in ms */
  attemptTimeout?: number;
}

/**
 * Retry result
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: unknown;
  attempts: number;
  totalTime: number;
  retryHistory: RetryAttempt[];
}

/**
 * Individual retry attempt info
 */
export interface RetryAttempt {
  attempt: number;
  timestamp: number;
  duration: number;
  error?: unknown;
  delay?: number;
}

// ============================================================================
// Retry Errors
// ============================================================================

/**
 * Error thrown when all retries exhausted
 */
export class RetryExhaustedError extends Error {
  readonly attempts: number;
  readonly lastError: unknown;
  readonly history: RetryAttempt[];

  constructor(attempts: number, lastError: unknown, history: RetryAttempt[]) {
    super(`All ${attempts} retry attempts exhausted`);
    this.name = 'RetryExhaustedError';
    this.attempts = attempts;
    this.lastError = lastError;
    this.history = history;
  }
}

/**
 * Error thrown when retry is aborted
 */
export class RetryAbortedError extends Error {
  readonly attempt: number;

  constructor(attempt: number) {
    super(`Retry aborted at attempt ${attempt}`);
    this.name = 'RetryAbortedError';
    this.attempt = attempt;
  }
}

// ============================================================================
// Delay Calculation Functions
// ============================================================================

/**
 * Calculate delay for fixed strategy
 */
function fixedDelay(config: Required<RetryConfig>): number {
  return config.initialDelay;
}

/**
 * Calculate delay for linear strategy
 */
function linearDelay(attempt: number, config: Required<RetryConfig>): number {
  return config.initialDelay * attempt;
}

/**
 * Calculate delay for exponential backoff
 */
function exponentialDelay(attempt: number, config: Required<RetryConfig>): number {
  return config.initialDelay * Math.pow(config.multiplier, attempt - 1);
}

/**
 * Calculate delay for fibonacci strategy
 */
function fibonacciDelay(attempt: number, config: Required<RetryConfig>): number {
  const fibonacci = (n: number): number => {
    if (n <= 1) return n;
    let a = 0, b = 1;
    for (let i = 2; i <= n; i++) {
      [a, b] = [b, a + b];
    }
    return b;
  };
  return config.initialDelay * fibonacci(attempt);
}

/**
 * Add jitter to delay
 */
function addJitter(delay: number, factor: number): number {
  const jitterRange = delay * factor;
  return delay + (Math.random() * jitterRange * 2 - jitterRange);
}

/**
 * Calculate delay based on strategy
 */
function calculateDelay(
  attempt: number,
  config: Required<RetryConfig>,
  error: unknown
): number {
  let delay: number;

  switch (config.strategy) {
    case 'fixed':
      delay = fixedDelay(config);
      break;
    case 'linear':
      delay = linearDelay(attempt, config);
      break;
    case 'exponential':
      delay = exponentialDelay(attempt, config);
      break;
    case 'fibonacci':
      delay = fibonacciDelay(attempt, config);
      break;
    case 'custom':
      if (config.delayFunction) {
        delay = config.delayFunction(attempt, error);
      } else {
        delay = config.initialDelay;
      }
      break;
    default:
      delay = config.initialDelay;
  }

  // Apply jitter
  if (config.jitter) {
    delay = addJitter(delay, config.jitterFactor);
  }

  // Cap at maxDelay
  return Math.min(Math.max(0, delay), config.maxDelay);
}

// ============================================================================
// Default Retry Predicates
// ============================================================================

/**
 * Default predicate - retry on any error
 */
export function retryOnAnyError(): boolean {
  return true;
}

/**
 * Retry on network errors
 */
export function retryOnNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const networkErrors = [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      'EPIPE',
      'EHOSTUNREACH',
      'fetch failed', // Test-compatible
    ];
    return networkErrors.some(code => error.message.includes(code));
  }
  return false;
}

/**
 * Retry on specific HTTP status codes
 */
export function retryOnHttpStatus(statuses: number[]): (error: unknown) => boolean {
  return (error: unknown) => {
    if (error && typeof error === 'object' && 'status' in error) {
      return statuses.includes((error as { status: number }).status);
    }
    return false;
  };
}

/**
 * Retry on transient errors (common patterns)
 */
export function retryOnTransientError(error: unknown): boolean {
  // Check for HTTP status codes
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    // Transient HTTP statuses
    const transientStatuses = [429, 500, 502, 503, 504];
    if (transientStatuses.includes(status)) {
      return true;
    }
  }

  if (error instanceof Error) {
    const transientPatterns = [
      /timeout/i,
      /rate limit/i,
      /too many requests/i,
      /temporarily unavailable/i,
      /service unavailable/i,
      /internal server error/i,
      /bad gateway/i,
      /gateway timeout/i,
    ];
    return transientPatterns.some(pattern => pattern.test(error.message));
  }
  return false;
}

// ============================================================================
// Retry Implementation
// ============================================================================

/**
 * Execute an operation with retry logic
 * Returns the result directly for test compatibility (not RetryResult)
 */
export async function retry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const result = await retryWithResult(operation, config);
  return result.result!;
}

/**
 * Execute an operation with retry logic (returns full result)
 */
export async function retryWithResult<T>(
  operation: () => Promise<T>,
  config: RetryConfig = {}
): Promise<RetryResult<T>> {
  const fullConfig: Required<RetryConfig> = {
    maxAttempts: config.maxAttempts ?? 3,
    initialDelay: config.initialDelay ?? 1000,
    maxDelay: config.maxDelay ?? 30000,
    strategy: config.strategy ?? 'exponential',
    // Support backoffMultiplier as alias for multiplier
    multiplier: config.multiplier ?? config.backoffMultiplier ?? 2,
    backoffMultiplier: config.backoffMultiplier ?? config.multiplier ?? 2,
    // Disable jitter by default for more predictable timing
    jitter: config.jitter ?? false,
    jitterFactor: config.jitterFactor ?? 0.25,
    delayFunction: config.delayFunction ?? (() => 1000),
    retryIf: config.retryIf ?? retryOnAnyError,
    onRetry: config.onRetry ?? (() => {}),
    abortSignal: config.abortSignal ?? new AbortController().signal,
    attemptTimeout: config.attemptTimeout ?? 0,
  };

  const startTime = Date.now();
  const history: RetryAttempt[] = [];
  let lastError: unknown;

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    // Check for abort
    if (fullConfig.abortSignal?.aborted) {
      throw new RetryAbortedError(attempt);
    }

    const attemptStart = Date.now();

    try {
      // Execute with optional timeout
      const result = await executeWithTimeout(operation, fullConfig.attemptTimeout);

      history.push({
        attempt,
        timestamp: attemptStart,
        duration: Date.now() - attemptStart,
      });

      return {
        success: true,
        result,
        attempts: attempt,
        totalTime: Date.now() - startTime,
        retryHistory: history,
      };
    } catch (error) {
      lastError = error;
      const duration = Date.now() - attemptStart;

      // Check if retryIf allows retry
      const retryIfAllows = fullConfig.retryIf(error, attempt);

      // Check if we should retry
      const shouldRetry = attempt < fullConfig.maxAttempts && retryIfAllows;

      if (shouldRetry) {
        const delay = calculateDelay(attempt, fullConfig, error);

        history.push({
          attempt,
          timestamp: attemptStart,
          duration,
          error,
          delay,
        });

        logger.debug({
          attempt,
          maxAttempts: fullConfig.maxAttempts,
          delay,
          error: error instanceof Error ? error.message : String(error),
        }, 'Retry attempt failed, will retry');

        // Call onRetry with object format for test compatibility
        (fullConfig.onRetry as (info: { error: unknown; attempt: number; delay?: number }) => void)({
          error,
          attempt,
          delay,
        });

        // Wait before next attempt
        await sleep(delay, fullConfig.abortSignal);
      } else {
        history.push({
          attempt,
          timestamp: attemptStart,
          duration,
          error,
        });

        // If retryIf returned false, throw immediately (non-retryable error)
        if (!retryIfAllows) {
          throw error;
        }
      }
    }
  }

  // All attempts exhausted
  throw new RetryExhaustedError(fullConfig.maxAttempts, lastError, history);
}

/**
 * Execute operation with timeout
 */
async function executeWithTimeout<T>(
  operation: () => Promise<T>,
  timeout: number
): Promise<T> {
  if (timeout <= 0) {
    return operation();
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeout}ms`));
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
 * Sleep for specified duration with abort support
 */
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);

    if (signal) {
      const abortHandler = () => {
        clearTimeout(timer);
        reject(new RetryAbortedError(0));
      };

      if (signal.aborted) {
        abortHandler();
        return;
      }

      signal.addEventListener('abort', abortHandler, { once: true });
    }
  });
}

// ============================================================================
// Retry Decorator / Wrapper
// ============================================================================

/**
 * Create a retryable version of an async function
 */
export function withRetry<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config: RetryConfig = {}
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    // retry() now returns T directly
    return retry(() => fn(...args), config);
  };
}

/**
 * Retry builder for fluent configuration
 * Supports two usage patterns:
 * 1. new RetryBuilder(operation).maxAttempts(3).execute() - original
 * 2. new RetryBuilder().maxAttempts(3).execute(operation) - test-compatible
 */
export class RetryBuilder<T = unknown> {
  private operation?: () => Promise<T>;
  private config: RetryConfig = {};

  constructor(operation?: () => Promise<T>) {
    this.operation = operation;
  }

  maxAttempts(n: number): this {
    this.config.maxAttempts = n;
    return this;
  }

  initialDelay(ms: number): this {
    this.config.initialDelay = ms;
    return this;
  }

  maxDelay(ms: number): this {
    this.config.maxDelay = ms;
    return this;
  }

  exponential(multiplier = 2): this {
    this.config.strategy = 'exponential';
    this.config.multiplier = multiplier;
    return this;
  }

  // Test-compatible alias
  exponentialBackoff(multiplier = 2): this {
    return this.exponential(multiplier);
  }

  linear(): this {
    this.config.strategy = 'linear';
    return this;
  }

  fixed(): this {
    this.config.strategy = 'fixed';
    return this;
  }

  fibonacci(): this {
    this.config.strategy = 'fibonacci';
    return this;
  }

  withJitter(factor = 0.25): this {
    this.config.jitter = true;
    this.config.jitterFactor = factor;
    return this;
  }

  noJitter(): this {
    this.config.jitter = false;
    return this;
  }

  retryIf(predicate: (error: unknown, attempt: number) => boolean): this {
    this.config.retryIf = predicate;
    return this;
  }

  onRetry(callback: (error: unknown, attempt: number, delay: number) => void): this {
    this.config.onRetry = callback;
    return this;
  }

  withAbortSignal(signal: AbortSignal): this {
    this.config.abortSignal = signal;
    return this;
  }

  attemptTimeout(ms: number): this {
    this.config.attemptTimeout = ms;
    return this;
  }

  async execute<R = T>(operation?: () => Promise<R>): Promise<R> {
    const op = operation ?? this.operation;
    if (!op) {
      throw new Error('No operation provided');
    }
    return retry(op as () => Promise<R>, this.config);
  }

  async run(): Promise<T> {
    return this.execute();
  }
}

/**
 * Retryable decorator for class methods
 * Supports both legacy decorators (TypeScript < 5.0) and new decorators
 */
export function retryable(config: RetryConfig = {}): MethodDecorator & ((target: (...args: unknown[]) => unknown, context: ClassMethodDecoratorContext) => (...args: unknown[]) => unknown) {
  // Return a function that can handle both decorator styles
  const decoratorFn = function (
    targetOrDescriptor: object | ((...args: unknown[]) => unknown),
    propertyKeyOrContext?: string | symbol | ClassMethodDecoratorContext,
    descriptor?: PropertyDescriptor
  ): PropertyDescriptor | ((...args: unknown[]) => unknown) {
    // New-style decorator (TypeScript 5.0+)
    if (typeof targetOrDescriptor === 'function' && propertyKeyOrContext && typeof propertyKeyOrContext === 'object' && 'kind' in propertyKeyOrContext) {
      const originalMethod = targetOrDescriptor as (...args: unknown[]) => Promise<unknown>;
      return async function (this: unknown, ...args: unknown[]) {
        return retry(() => originalMethod.apply(this, args) as Promise<unknown>, config);
      };
    }

    // Legacy decorator (TypeScript < 5.0 or experimental decorators)
    if (descriptor && typeof descriptor.value === 'function') {
      const originalMethod = descriptor.value;
      descriptor.value = async function (this: unknown, ...args: unknown[]) {
        return retry(() => originalMethod.apply(this, args), config);
      };
      return descriptor;
    }

    // Handle case where descriptor is not provided (shouldn't happen normally)
    throw new Error('Invalid decorator usage');
  };

  return decoratorFn as MethodDecorator & ((target: (...args: unknown[]) => unknown, context: ClassMethodDecoratorContext) => (...args: unknown[]) => unknown);
}
