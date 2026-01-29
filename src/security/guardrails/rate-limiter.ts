// Token bucket rate limiter with sliding window

export interface RateLimiterConfig {
  maxTokens: number;         // Maximum tokens in bucket
  refillRate: number;        // Tokens added per interval
  refillIntervalMs: number;  // Interval for refill
  burstMultiplier?: number;  // Allow burst up to this multiple of maxTokens
}

export interface RateLimitResult {
  allowed: boolean;
  remainingTokens: number;
  resetInMs: number;
  retryAfterMs?: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
  blocked: boolean;
  blockedUntil: number;
}

// Test-compatible simplified config
export interface SimpleRateLimiterConfig {
  windowMs: number;
  maxRequests: number;
}

export class RateLimiter {
  private readonly config: Required<RateLimiterConfig>;
  private readonly buckets = new Map<string, Bucket>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: RateLimiterConfig | SimpleRateLimiterConfig) {
    // Support both full config and simplified test config
    if ('windowMs' in config) {
      // Test-compatible config
      this.config = {
        maxTokens: config.maxRequests,
        refillRate: config.maxRequests,
        refillIntervalMs: config.windowMs,
        burstMultiplier: 1,
      };
    } else {
      this.config = {
        maxTokens: config.maxTokens,
        refillRate: config.refillRate,
        refillIntervalMs: config.refillIntervalMs,
        burstMultiplier: config.burstMultiplier ?? 1.5,
      };
    }

    // Periodic cleanup of stale buckets
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  // Test-compatible method
  async checkLimit(key: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const result = this.consume(key);
    return {
      allowed: result.allowed,
      retryAfter: result.retryAfterMs,
    };
  }

  consume(key: string, tokens: number = 1): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.config.maxTokens,
        lastRefill: now,
        blocked: false,
        blockedUntil: 0,
      };
      this.buckets.set(key, bucket);
    }

    // Check if blocked
    if (bucket.blocked && now < bucket.blockedUntil) {
      return {
        allowed: false,
        remainingTokens: 0,
        resetInMs: bucket.blockedUntil - now,
        retryAfterMs: bucket.blockedUntil - now,
      };
    } else if (bucket.blocked) {
      // Unblock
      bucket.blocked = false;
      bucket.tokens = this.config.maxTokens;
    }

    // Refill tokens
    this.refill(bucket, now);

    // Check if request can be fulfilled
    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return {
        allowed: true,
        remainingTokens: Math.floor(bucket.tokens),
        resetInMs: this.config.refillIntervalMs,
      };
    }

    // Not enough tokens
    const tokensNeeded = tokens - bucket.tokens;
    const intervalsNeeded = Math.ceil(tokensNeeded / this.config.refillRate);
    const retryAfterMs = intervalsNeeded * this.config.refillIntervalMs;

    return {
      allowed: false,
      remainingTokens: Math.floor(bucket.tokens),
      resetInMs: this.config.refillIntervalMs,
      retryAfterMs,
    };
  }

  // Block a key for a duration
  block(key: string, durationMs: number): void {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: 0,
        lastRefill: now,
        blocked: true,
        blockedUntil: now + durationMs,
      };
      this.buckets.set(key, bucket);
    } else {
      bucket.blocked = true;
      bucket.blockedUntil = now + durationMs;
      bucket.tokens = 0;
    }
  }

  // Check status without consuming
  check(key: string): RateLimitResult {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket) {
      return {
        allowed: true,
        remainingTokens: this.config.maxTokens,
        resetInMs: 0,
      };
    }

    if (bucket.blocked && now < bucket.blockedUntil) {
      return {
        allowed: false,
        remainingTokens: 0,
        resetInMs: bucket.blockedUntil - now,
        retryAfterMs: bucket.blockedUntil - now,
      };
    }

    // Simulate refill
    const elapsed = now - bucket.lastRefill;
    const intervalsElapsed = Math.floor(elapsed / this.config.refillIntervalMs);
    const tokensToAdd = intervalsElapsed * this.config.refillRate;
    const projectedTokens = Math.min(
      bucket.tokens + tokensToAdd,
      this.config.maxTokens * this.config.burstMultiplier
    );

    return {
      allowed: projectedTokens >= 1,
      remainingTokens: Math.floor(projectedTokens),
      resetInMs: this.config.refillIntervalMs,
    };
  }

  // Reset a specific key
  reset(key: string): void {
    this.buckets.delete(key);
  }

  private refill(bucket: Bucket, now: number): void {
    const elapsed = now - bucket.lastRefill;
    const intervalsElapsed = Math.floor(elapsed / this.config.refillIntervalMs);

    if (intervalsElapsed > 0) {
      const tokensToAdd = intervalsElapsed * this.config.refillRate;
      bucket.tokens = Math.min(
        bucket.tokens + tokensToAdd,
        this.config.maxTokens * this.config.burstMultiplier
      );
      bucket.lastRefill = now;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes

    for (const [key, bucket] of this.buckets) {
      if (
        now - bucket.lastRefill > staleThreshold &&
        bucket.tokens >= this.config.maxTokens &&
        !bucket.blocked
      ) {
        this.buckets.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.buckets.clear();
  }

  // Metrics
  getStats(): {
    totalBuckets: number;
    blockedBuckets: number;
  } {
    let blockedCount = 0;
    const now = Date.now();

    for (const bucket of this.buckets.values()) {
      if (bucket.blocked && now < bucket.blockedUntil) {
        blockedCount++;
      }
    }

    return {
      totalBuckets: this.buckets.size,
      blockedBuckets: blockedCount,
    };
  }
}

// Sliding window counter for more accurate rate limiting
export class SlidingWindowRateLimiter {
  private readonly windowSizeMs: number;
  private readonly maxRequests: number;
  private readonly windows = new Map<string, number[]>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: { windowSizeMs?: number; windowMs?: number; maxRequests: number }) {
    // Support both windowSizeMs and windowMs (test-compatible)
    this.windowSizeMs = config.windowSizeMs ?? config.windowMs ?? 1000;
    this.maxRequests = config.maxRequests;

    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  // Test-compatible method
  async checkLimit(key: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const result = this.consume(key);
    return {
      allowed: result.allowed,
      retryAfter: result.retryAfterMs,
    };
  }

  consume(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowSizeMs;

    let timestamps = this.windows.get(key) ?? [];

    // Remove old timestamps
    timestamps = timestamps.filter(t => t > windowStart);

    if (timestamps.length >= this.maxRequests) {
      // Calculate when the oldest timestamp will expire
      const oldestInWindow = timestamps[0];
      const retryAfterMs = oldestInWindow - windowStart;

      this.windows.set(key, timestamps);

      return {
        allowed: false,
        remainingTokens: 0,
        resetInMs: retryAfterMs,
        retryAfterMs,
      };
    }

    // Add current timestamp
    timestamps.push(now);
    this.windows.set(key, timestamps);

    return {
      allowed: true,
      remainingTokens: this.maxRequests - timestamps.length,
      resetInMs: this.windowSizeMs,
    };
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowSizeMs;
    const timestamps = this.windows.get(key) ?? [];
    const validTimestamps = timestamps.filter(t => t > windowStart);

    return {
      allowed: validTimestamps.length < this.maxRequests,
      remainingTokens: Math.max(0, this.maxRequests - validTimestamps.length),
      resetInMs: this.windowSizeMs,
    };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowSizeMs;

    for (const [key, timestamps] of this.windows) {
      const validTimestamps = timestamps.filter(t => t > windowStart);
      if (validTimestamps.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, validTimestamps);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.windows.clear();
  }
}

// Test-compatible tier config
export interface TieredRateLimiterConfig {
  tiers: Record<string, { windowMs: number; maxRequests: number }>;
  defaultTier: string;
}

// Multi-tier rate limiter (e.g., per-minute and per-hour)
export class TieredRateLimiter {
  private readonly limiters: Map<string, SlidingWindowRateLimiter>;
  private readonly defaultTier: string;

  constructor(
    config: TieredRateLimiterConfig | Array<{
      name: string;
      windowSizeMs: number;
      maxRequests: number;
    }>
  ) {
    this.limiters = new Map();

    if (Array.isArray(config)) {
      // Original array format
      this.defaultTier = config[0]?.name ?? 'default';
      for (const tier of config) {
        this.limiters.set(tier.name, new SlidingWindowRateLimiter({
          windowSizeMs: tier.windowSizeMs,
          maxRequests: tier.maxRequests,
        }));
      }
    } else {
      // Test-compatible object format
      this.defaultTier = config.defaultTier;
      for (const [tierName, tierConfig] of Object.entries(config.tiers)) {
        this.limiters.set(tierName, new SlidingWindowRateLimiter({
          windowMs: tierConfig.windowMs,
          maxRequests: tierConfig.maxRequests,
        }));
      }
    }
  }

  // Test-compatible method
  async checkLimit(key: string, tier?: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const tierName = tier ?? this.defaultTier;
    const limiter = this.limiters.get(tierName);

    if (!limiter) {
      // Unknown tier, use default
      const defaultLimiter = this.limiters.get(this.defaultTier);
      if (defaultLimiter) {
        return defaultLimiter.checkLimit(key);
      }
      return { allowed: true };
    }

    return limiter.checkLimit(key);
  }

  consume(key: string): RateLimitResult & { failedTier?: string } {
    // Check all tiers, must pass all
    for (const [tierName, limiter] of this.limiters) {
      const result = limiter.consume(key);
      if (!result.allowed) {
        return { ...result, failedTier: tierName };
      }
    }

    // Get minimum remaining from all tiers
    let minRemaining = Infinity;
    let maxResetMs = 0;

    for (const limiter of this.limiters.values()) {
      const status = limiter.check(key);
      minRemaining = Math.min(minRemaining, status.remainingTokens);
      maxResetMs = Math.max(maxResetMs, status.resetInMs);
    }

    return {
      allowed: true,
      remainingTokens: minRemaining === Infinity ? 0 : minRemaining,
      resetInMs: maxResetMs,
    };
  }

  check(key: string): RateLimitResult & { failedTier?: string } {
    for (const [tierName, limiter] of this.limiters) {
      const result = limiter.check(key);
      if (!result.allowed) {
        return { ...result, failedTier: tierName };
      }
    }

    let minRemaining = Infinity;
    let maxResetMs = 0;

    for (const limiter of this.limiters.values()) {
      const status = limiter.check(key);
      minRemaining = Math.min(minRemaining, status.remainingTokens);
      maxResetMs = Math.max(maxResetMs, status.resetInMs);
    }

    return {
      allowed: true,
      remainingTokens: minRemaining === Infinity ? 0 : minRemaining,
      resetInMs: maxResetMs,
    };
  }

  reset(key: string): void {
    for (const limiter of this.limiters.values()) {
      limiter.reset(key);
    }
  }

  destroy(): void {
    for (const limiter of this.limiters.values()) {
      limiter.destroy();
    }
  }
}
