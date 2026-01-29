// Circuit Breaker
export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitOpenError,
  CircuitTimeoutError,
  getCircuitBreakerRegistry,
  createCircuitBreaker,
  type CircuitState,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,
  type CircuitBreakerEvents,
} from './circuit-breaker.js';

// Retry
export {
  retry,
  withRetry,
  retryable,
  RetryBuilder,
  RetryExhaustedError,
  RetryAbortedError,
  // Predicates
  retryOnAnyError,
  retryOnNetworkError,
  retryOnHttpStatus,
  retryOnTransientError,
  type RetryStrategy,
  type RetryConfig,
  type RetryResult,
  type RetryAttempt,
} from './retry.js';

// Bulkhead
export {
  Bulkhead,
  BulkheadRegistry,
  Semaphore,
  BulkheadFullError,
  BulkheadTimeoutError,
  getBulkheadRegistry,
  createBulkhead,
  type BulkheadConfig,
  type BulkheadStats,
} from './bulkhead.js';

// Fallback
export {
  withFallback,
  FallbackChain,
  FallbackCache,
  GracefulDegradation,
  // Predicates
  fallbackOnAny,
  fallbackOnErrorType,
  fallbackOnMessage,
  dontFallbackOn,
  type FallbackConfig,
  type FallbackResult,
  type DegradationLevel,
} from './fallback.js';

// Combined Policy
export {
  ResiliencePolicy,
  PolicyBuilder,
  PolicyTimeoutError,
  policy,
  // Pre-configured policies
  apiPolicy,
  databasePolicy,
  criticalPolicy,
  // Type guards
  isCircuitOpen,
  isRetryExhausted,
  isBulkheadFull,
  isPolicyTimeout,
  isResilienceError,
  type ResiliencePolicyConfig,
  type PolicyResult,
} from './policy.js';
