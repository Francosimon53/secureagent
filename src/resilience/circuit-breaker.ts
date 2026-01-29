import { EventEmitter } from 'events';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'CircuitBreaker' });

// ============================================================================
// Circuit Breaker Types
// ============================================================================

/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Name for identification */
  name?: string;
  /** Number of failures before opening circuit */
  failureThreshold?: number;
  /** Number of successes in half-open before closing */
  successThreshold?: number;
  /** Time in ms before attempting recovery */
  resetTimeout?: number;
  /** Time window in ms for counting failures */
  failureWindow?: number;
  /** Optional timeout for operations in ms */
  operationTimeout?: number;
  /** Custom failure predicate */
  isFailure?: (error: unknown) => boolean;
  /** Enable half-open state */
  enableHalfOpen?: boolean;
  /** Maximum concurrent requests in half-open state */
  halfOpenMaxConcurrent?: number;
  /** Test-compatible alias for successThreshold */
  halfOpenMaxAttempts?: number;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  lastStateChange: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

/**
 * Circuit breaker events
 */
export interface CircuitBreakerEvents {
  stateChange: (state: CircuitState, previousState: CircuitState) => void;
  success: () => void;
  failure: (error: unknown) => void;
  timeout: () => void;
  rejected: () => void;
  reset: () => void;
}

// ============================================================================
// Circuit Breaker Error
// ============================================================================

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  readonly circuitName: string;
  readonly resetTime: number;

  constructor(name: string, resetTime: number) {
    super(`Circuit breaker '${name}' is open`);
    this.name = 'CircuitOpenError';
    this.circuitName = name;
    this.resetTime = resetTime;
  }
}

/**
 * Error thrown when operation times out
 */
export class CircuitTimeoutError extends Error {
  readonly circuitName: string;
  readonly timeout: number;

  constructor(name: string, timeout: number) {
    super(`Operation timed out after ${timeout}ms in circuit '${name}'`);
    this.name = 'CircuitTimeoutError';
    this.circuitName = name;
    this.timeout = timeout;
  }
}

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

/**
 * Circuit breaker for fault tolerance
 *
 * States:
 * - Closed: Normal operation, requests pass through
 * - Open: Circuit is tripped, requests are rejected immediately
 * - Half-Open: Testing if service recovered, limited requests allowed
 */
export class CircuitBreaker extends EventEmitter {
  private readonly config: Required<CircuitBreakerConfig>;
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private successes: number = 0;
  private totalRequests: number = 0;
  private consecutiveFailures: number = 0;
  private consecutiveSuccesses: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private lastStateChange: number = Date.now();
  private openTime: number = 0;
  private halfOpenConcurrent: number = 0;
  private readonly failureTimestamps: number[] = [];

  constructor(config: CircuitBreakerConfig) {
    super();
    this.config = {
      name: config.name ?? 'default',
      failureThreshold: config.failureThreshold ?? 5,
      // Support halfOpenMaxAttempts as alias for successThreshold
      successThreshold: config.halfOpenMaxAttempts ?? config.successThreshold ?? 3,
      resetTimeout: config.resetTimeout ?? 30000,
      failureWindow: config.failureWindow ?? 60000,
      operationTimeout: config.operationTimeout ?? 0,
      isFailure: config.isFailure ?? (() => true),
      enableHalfOpen: config.enableHalfOpen ?? true,
      halfOpenMaxConcurrent: config.halfOpenMaxConcurrent ?? 1,
    };
  }

  /**
   * Execute an operation through the circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit should transition from open to half-open
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('half-open');
      } else {
        this.emit('rejected');
        throw new CircuitOpenError(this.config.name, this.openTime + this.config.resetTimeout);
      }
    }

    // Check half-open concurrency limit
    if (this.state === 'half-open') {
      if (this.halfOpenConcurrent >= this.config.halfOpenMaxConcurrent) {
        this.emit('rejected');
        throw new CircuitOpenError(this.config.name, this.openTime + this.config.resetTimeout);
      }
      this.halfOpenConcurrent++;
    }

    try {
      const result = await this.executeWithTimeout(operation);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    } finally {
      if (this.state === 'half-open') {
        this.halfOpenConcurrent--;
      }
    }
  }

  /**
   * Execute operation with optional timeout
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    if (this.config.operationTimeout <= 0) {
      return operation();
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.emit('timeout');
        reject(new CircuitTimeoutError(this.config.name, this.config.operationTimeout));
      }, this.config.operationTimeout);

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
   * Handle successful operation
   */
  private onSuccess(): void {
    this.successes++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = Date.now();
    this.emit('success');

    if (this.state === 'half-open') {
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo('closed');
      }
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: unknown): void {
    // Check if this error counts as a failure
    if (!this.config.isFailure(error)) {
      return;
    }

    const now = Date.now();
    this.failures++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = now;
    this.emit('failure', error);

    // Track failure timestamp for windowed counting
    this.failureTimestamps.push(now);
    this.cleanupFailureTimestamps();

    if (this.state === 'half-open') {
      // Any failure in half-open goes back to open
      this.transitionTo('open');
    } else if (this.state === 'closed') {
      // Check if we've exceeded failure threshold within window
      if (this.getWindowedFailures() >= this.config.failureThreshold) {
        this.transitionTo('open');
      }
    }
  }

  /**
   * Get number of failures within the failure window
   */
  private getWindowedFailures(): number {
    this.cleanupFailureTimestamps();
    return this.failureTimestamps.length;
  }

  /**
   * Remove old failure timestamps outside the window
   */
  private cleanupFailureTimestamps(): void {
    const cutoff = Date.now() - this.config.failureWindow;
    while (this.failureTimestamps.length > 0 && this.failureTimestamps[0] < cutoff) {
      this.failureTimestamps.shift();
    }
  }

  /**
   * Check if enough time has passed to attempt reset
   */
  private shouldAttemptReset(): boolean {
    return this.config.enableHalfOpen && Date.now() >= this.openTime + this.config.resetTimeout;
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    if (previousState === newState) return;

    this.state = newState;
    this.lastStateChange = Date.now();

    if (newState === 'open') {
      this.openTime = Date.now();
    } else if (newState === 'closed') {
      this.consecutiveSuccesses = 0;
      this.consecutiveFailures = 0;
      this.failureTimestamps.length = 0;
    } else if (newState === 'half-open') {
      this.consecutiveSuccesses = 0;
      this.halfOpenConcurrent = 0;
    }

    logger.info({
      circuit: this.config.name,
      previousState,
      newState,
    }, 'Circuit breaker state changed');

    this.emit('stateChange', newState, previousState);
  }

  /**
   * Force reset the circuit to closed state
   */
  reset(): void {
    this.transitionTo('closed');
    this.failures = 0;
    this.successes = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.failureTimestamps.length = 0;
    this.emit('reset');
  }

  /**
   * Force open the circuit
   */
  trip(): void {
    this.transitionTo('open');
  }

  /**
   * Get current state
   * Automatically transitions from open to half-open if reset timeout has passed
   */
  getState(): CircuitState {
    // Check if we should transition from open to half-open
    if (this.state === 'open' && this.shouldAttemptReset()) {
      this.transitionTo('half-open');
    }
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats(): CircuitBreakerStats & { successCount: number; failureCount: number } {
    return {
      name: this.config.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      lastStateChange: this.lastStateChange,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      // Test-compatible aliases
      successCount: this.successes,
      failureCount: this.failures,
    };
  }

  /**
   * Check if circuit allows requests
   */
  isAllowing(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') return this.shouldAttemptReset();
    if (this.state === 'half-open') {
      return this.halfOpenConcurrent < this.config.halfOpenMaxConcurrent;
    }
    return false;
  }
}

// ============================================================================
// Circuit Breaker Registry
// ============================================================================

/**
 * Registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly defaultConfig: Partial<CircuitBreakerConfig>;

  constructor(defaultConfig: Partial<CircuitBreakerConfig> = {}) {
    this.defaultConfig = defaultConfig;
  }

  /**
   * Get or create a circuit breaker
   */
  getOrCreate(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker({
        ...this.defaultConfig,
        ...config,
        name,
      });
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  /**
   * Get a circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Remove a circuit breaker
   */
  remove(name: string): boolean {
    return this.breakers.delete(name);
  }

  /**
   * Get all circuit breaker statistics
   */
  getAllStats(): CircuitBreakerStats[] {
    return Array.from(this.breakers.values()).map(b => b.getStats());
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Get circuit breakers by state
   */
  getByState(state: CircuitState): CircuitBreaker[] {
    return Array.from(this.breakers.values()).filter(b => b.getState() === state);
  }

  /**
   * List all registered circuit breaker names (test-compatible)
   */
  list(): string[] {
    return Array.from(this.breakers.keys());
  }

  /**
   * Get stats for all circuit breakers as a record (test-compatible)
   */
  getStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalRegistry: CircuitBreakerRegistry | null = null;

/**
 * Get the global circuit breaker registry
 */
export function getCircuitBreakerRegistry(): CircuitBreakerRegistry {
  if (!globalRegistry) {
    globalRegistry = new CircuitBreakerRegistry();
  }
  return globalRegistry;
}

/**
 * Create a circuit breaker with default registry
 */
export function createCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  return getCircuitBreakerRegistry().getOrCreate(name, config);
}
