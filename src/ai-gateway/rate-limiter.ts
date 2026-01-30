/**
 * Rate Limiter
 *
 * Per-tier rate limiting for AI API requests
 */

import type {
  RateLimitConfig,
  RateLimitStatus,
  RateLimitTier,
} from './types.js';
import { AIGatewayError } from './types.js';
import { AI_GATEWAY_EVENTS, RATE_LIMIT_CONFIGS } from './constants.js';

// =============================================================================
// Rate Limit Bucket
// =============================================================================

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface UserRateLimits {
  tier: RateLimitTier;
  requests: {
    minute: RateLimitBucket;
    hour: RateLimitBucket;
    day: RateLimitBucket;
  };
  tokens: {
    minute: RateLimitBucket;
    day: RateLimitBucket;
  };
  concurrent: number;
}

// =============================================================================
// Rate Limiter
// =============================================================================

export interface RateLimiterConfig {
  /** Warning threshold (percentage) */
  warningThreshold: number;
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  warningThreshold: 80,
};

export class RateLimiter {
  private readonly config: RateLimiterConfig;
  private readonly limits = new Map<string, UserRateLimits>();
  private readonly customConfigs = new Map<string, RateLimitConfig>();

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set tier for a user
   */
  setTier(userId: string, tier: RateLimitTier): void {
    const limits = this.getOrCreateLimits(userId);
    limits.tier = tier;
  }

  /**
   * Set custom config for a user
   */
  setCustomConfig(userId: string, config: RateLimitConfig): void {
    this.customConfigs.set(userId, config);
    const limits = this.getOrCreateLimits(userId);
    limits.tier = config.tier;
  }

  /**
   * Check if request is allowed
   */
  checkRequest(userId: string, estimatedTokens: number = 0): RateLimitStatus {
    const limits = this.getOrCreateLimits(userId);
    const config = this.getConfig(userId, limits.tier);
    const now = Date.now();

    // Reset expired buckets
    this.resetExpiredBuckets(limits, now);

    // Calculate remaining
    const status: RateLimitStatus = {
      tier: limits.tier,
      requestsRemaining: {
        minute: config.requestsPerMinute - limits.requests.minute.count,
        hour: config.requestsPerHour - limits.requests.hour.count,
        day: config.requestsPerDay - limits.requests.day.count,
      },
      tokensRemaining: {
        minute: config.tokensPerMinute - limits.tokens.minute.count,
        day: config.tokensPerDay - limits.tokens.day.count,
      },
      resetTimes: {
        minute: limits.requests.minute.resetAt,
        hour: limits.requests.hour.resetAt,
        day: limits.requests.day.resetAt,
      },
      isLimited: false,
    };

    // Check limits
    if (status.requestsRemaining.minute <= 0) {
      status.isLimited = true;
      status.retryAfter = limits.requests.minute.resetAt - now;
    } else if (status.requestsRemaining.hour <= 0) {
      status.isLimited = true;
      status.retryAfter = limits.requests.hour.resetAt - now;
    } else if (status.requestsRemaining.day <= 0) {
      status.isLimited = true;
      status.retryAfter = limits.requests.day.resetAt - now;
    } else if (estimatedTokens > 0) {
      if (status.tokensRemaining.minute < estimatedTokens) {
        status.isLimited = true;
        status.retryAfter = limits.tokens.minute.resetAt - now;
      } else if (status.tokensRemaining.day < estimatedTokens) {
        status.isLimited = true;
        status.retryAfter = limits.tokens.day.resetAt - now;
      }
    }

    // Check concurrent limit
    if (limits.concurrent >= config.concurrentRequests) {
      status.isLimited = true;
      status.retryAfter = 1000; // Retry after 1 second
    }

    // Emit warning if near limit
    const minPercentRemaining = Math.min(
      (status.requestsRemaining.minute / config.requestsPerMinute) * 100,
      (status.requestsRemaining.hour / config.requestsPerHour) * 100,
      (status.requestsRemaining.day / config.requestsPerDay) * 100
    );

    if (minPercentRemaining <= (100 - this.config.warningThreshold)) {
      this.emit(AI_GATEWAY_EVENTS.RATE_LIMIT_WARNING, { userId, status, percentRemaining: minPercentRemaining });
    }

    if (status.isLimited) {
      this.emit(AI_GATEWAY_EVENTS.RATE_LIMITED, { userId, status });
    }

    return status;
  }

  /**
   * Consume a request
   */
  consumeRequest(userId: string, tokens: number = 0): void {
    const limits = this.getOrCreateLimits(userId);
    const now = Date.now();

    // Reset expired buckets
    this.resetExpiredBuckets(limits, now);

    // Increment counters
    limits.requests.minute.count++;
    limits.requests.hour.count++;
    limits.requests.day.count++;

    if (tokens > 0) {
      limits.tokens.minute.count += tokens;
      limits.tokens.day.count += tokens;
    }

    limits.concurrent++;
  }

  /**
   * Release a concurrent slot
   */
  releaseRequest(userId: string): void {
    const limits = this.limits.get(userId);
    if (limits && limits.concurrent > 0) {
      limits.concurrent--;
    }
  }

  /**
   * Record token usage (for streaming responses where tokens aren't known upfront)
   */
  recordTokens(userId: string, tokens: number): void {
    const limits = this.getOrCreateLimits(userId);
    const now = Date.now();

    this.resetExpiredBuckets(limits, now);

    limits.tokens.minute.count += tokens;
    limits.tokens.day.count += tokens;
  }

  /**
   * Get current status
   */
  getStatus(userId: string): RateLimitStatus {
    const limits = this.getOrCreateLimits(userId);
    const config = this.getConfig(userId, limits.tier);
    const now = Date.now();

    this.resetExpiredBuckets(limits, now);

    return {
      tier: limits.tier,
      requestsRemaining: {
        minute: Math.max(0, config.requestsPerMinute - limits.requests.minute.count),
        hour: Math.max(0, config.requestsPerHour - limits.requests.hour.count),
        day: Math.max(0, config.requestsPerDay - limits.requests.day.count),
      },
      tokensRemaining: {
        minute: Math.max(0, config.tokensPerMinute - limits.tokens.minute.count),
        day: Math.max(0, config.tokensPerDay - limits.tokens.day.count),
      },
      resetTimes: {
        minute: limits.requests.minute.resetAt,
        hour: limits.requests.hour.resetAt,
        day: limits.requests.day.resetAt,
      },
      isLimited: false,
    };
  }

  /**
   * Reset limits for a user
   */
  resetLimits(userId: string): void {
    this.limits.delete(userId);
  }

  /**
   * Get all users
   */
  getTrackedUsers(): string[] {
    return Array.from(this.limits.keys());
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private getOrCreateLimits(userId: string): UserRateLimits {
    let limits = this.limits.get(userId);

    if (!limits) {
      const now = Date.now();
      limits = {
        tier: 'standard',
        requests: {
          minute: { count: 0, resetAt: now + 60000 },
          hour: { count: 0, resetAt: now + 3600000 },
          day: { count: 0, resetAt: this.getEndOfDay() },
        },
        tokens: {
          minute: { count: 0, resetAt: now + 60000 },
          day: { count: 0, resetAt: this.getEndOfDay() },
        },
        concurrent: 0,
      };
      this.limits.set(userId, limits);
    }

    return limits;
  }

  private getConfig(userId: string, tier: RateLimitTier): RateLimitConfig {
    return this.customConfigs.get(userId) ?? RATE_LIMIT_CONFIGS[tier];
  }

  private resetExpiredBuckets(limits: UserRateLimits, now: number): void {
    // Minute buckets
    if (now >= limits.requests.minute.resetAt) {
      limits.requests.minute = { count: 0, resetAt: now + 60000 };
    }
    if (now >= limits.tokens.minute.resetAt) {
      limits.tokens.minute = { count: 0, resetAt: now + 60000 };
    }

    // Hour bucket
    if (now >= limits.requests.hour.resetAt) {
      limits.requests.hour = { count: 0, resetAt: now + 3600000 };
    }

    // Day buckets
    const endOfDay = this.getEndOfDay();
    if (now >= limits.requests.day.resetAt) {
      limits.requests.day = { count: 0, resetAt: endOfDay };
    }
    if (now >= limits.tokens.day.resetAt) {
      limits.tokens.day = { count: 0, resetAt: endOfDay };
    }
  }

  private getEndOfDay(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Rate Limit Middleware Helper
// =============================================================================

export interface RateLimitMiddlewareResult {
  allowed: boolean;
  status: RateLimitStatus;
  error?: AIGatewayError;
}

/**
 * Check rate limit and throw if exceeded
 */
export function checkRateLimit(
  limiter: RateLimiter,
  userId: string,
  estimatedTokens?: number
): RateLimitMiddlewareResult {
  const status = limiter.checkRequest(userId, estimatedTokens);

  if (status.isLimited) {
    return {
      allowed: false,
      status,
      error: new AIGatewayError(
        'RATE_LIMITED',
        'Rate limit exceeded',
        429,
        status.retryAfter
      ),
    };
  }

  return { allowed: true, status };
}

/**
 * Wrap an async function with rate limiting
 */
export function withRateLimit<T>(
  limiter: RateLimiter,
  userId: string,
  fn: () => Promise<T>,
  estimatedTokens?: number
): Promise<T> {
  const result = checkRateLimit(limiter, userId, estimatedTokens);

  if (!result.allowed) {
    return Promise.reject(result.error);
  }

  limiter.consumeRequest(userId, estimatedTokens);

  return fn().finally(() => {
    limiter.releaseRequest(userId);
  });
}

// =============================================================================
// Factory Function
// =============================================================================

export function createRateLimiter(config?: Partial<RateLimiterConfig>): RateLimiter {
  return new RateLimiter(config);
}
