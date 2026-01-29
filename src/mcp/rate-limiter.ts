import { randomBytes } from 'crypto';
import { getLogger, getAuditLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'MCPRateLimiter' });
const auditLogger = getAuditLogger();

// ============================================================================
// Rate Limiter Types
// ============================================================================

/**
 * Rate limit configuration for a specific resource
 */
export interface RateLimitRule {
  /** Maximum requests allowed */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Optional burst allowance (temporary spike above limit) */
  burstAllowance?: number;
  /** Optional cooldown period after hitting limit (ms) */
  cooldownMs?: number;
}

/**
 * Rate limit configuration
 */
export interface MCPRateLimiterConfig {
  /** Global rate limit (applies to all requests) */
  global?: RateLimitRule;
  /** Per-client rate limits */
  perClient?: RateLimitRule;
  /** Per-tool rate limits */
  perTool?: RateLimitRule;
  /** Custom rate limits for specific tools */
  toolLimits?: Record<string, RateLimitRule>;
  /** Custom rate limits for specific clients */
  clientLimits?: Record<string, RateLimitRule>;
  /** Custom rate limits for specific scopes */
  scopeLimits?: Record<string, RateLimitRule>;
  /** Enable sliding window (more accurate but more memory) */
  useSlidingWindow?: boolean;
  /** Cleanup interval for stale buckets (ms) */
  cleanupIntervalMs?: number;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** When the limit resets (Unix timestamp ms) */
  resetAt: number;
  /** Retry after (seconds) - only set if not allowed */
  retryAfter?: number;
  /** Which limit was hit */
  limitType?: 'global' | 'client' | 'tool' | 'scope';
  /** The specific limit that was exceeded */
  limitKey?: string;
}

/**
 * Token bucket state
 */
interface TokenBucket {
  tokens: number;
  lastRefill: number;
  requests: number[]; // Timestamps for sliding window
}

// ============================================================================
// MCP Rate Limiter
// ============================================================================

/**
 * Rate limiter for MCP requests
 *
 * Implements token bucket algorithm with optional sliding window.
 * Supports per-client, per-tool, and per-scope rate limiting.
 */
export class MCPRateLimiter {
  private readonly config: Required<MCPRateLimiterConfig>;
  private readonly globalBucket: TokenBucket;
  private readonly clientBuckets = new Map<string, TokenBucket>();
  private readonly toolBuckets = new Map<string, TokenBucket>();
  private readonly scopeBuckets = new Map<string, TokenBucket>();
  private readonly cooldowns = new Map<string, number>(); // key -> cooldown end time
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: MCPRateLimiterConfig = {}) {
    this.config = {
      global: config.global ?? { maxRequests: 1000, windowMs: 60000 },
      perClient: config.perClient ?? { maxRequests: 100, windowMs: 60000 },
      perTool: config.perTool ?? { maxRequests: 50, windowMs: 60000 },
      toolLimits: config.toolLimits ?? {},
      clientLimits: config.clientLimits ?? {},
      scopeLimits: config.scopeLimits ?? {},
      useSlidingWindow: config.useSlidingWindow ?? false,
      cleanupIntervalMs: config.cleanupIntervalMs ?? 60000,
    };

    this.globalBucket = this.createBucket(this.config.global);

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), this.config.cleanupIntervalMs);
  }

  /**
   * Check if a request is allowed
   */
  check(params: {
    clientId: string;
    toolName?: string;
    scopes?: string[];
    userId?: string;
  }): RateLimitResult {
    const now = Date.now();

    // Check cooldowns first
    const cooldownKey = `client:${params.clientId}`;
    const cooldownEnd = this.cooldowns.get(cooldownKey);
    if (cooldownEnd && now < cooldownEnd) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: cooldownEnd,
        retryAfter: Math.ceil((cooldownEnd - now) / 1000),
        limitType: 'client',
        limitKey: params.clientId,
      };
    }

    // Check global limit
    const globalResult = this.checkBucket(this.globalBucket, this.config.global, now);
    if (!globalResult.allowed) {
      this.logRateLimitHit('global', 'global', params);
      return { ...globalResult, limitType: 'global', limitKey: 'global' };
    }

    // Check client-specific limit
    const clientRule = this.config.clientLimits[params.clientId] ?? this.config.perClient;
    const clientBucket = this.getOrCreateBucket(this.clientBuckets, params.clientId, clientRule);
    const clientResult = this.checkBucket(clientBucket, clientRule, now);
    if (!clientResult.allowed) {
      this.logRateLimitHit('client', params.clientId, params);
      this.applyCooldown(cooldownKey, clientRule.cooldownMs);
      return { ...clientResult, limitType: 'client', limitKey: params.clientId };
    }

    // Check tool-specific limit if tool is specified
    if (params.toolName) {
      const toolRule = this.config.toolLimits[params.toolName] ?? this.config.perTool;
      const toolKey = `${params.clientId}:${params.toolName}`;
      const toolBucket = this.getOrCreateBucket(this.toolBuckets, toolKey, toolRule);
      const toolResult = this.checkBucket(toolBucket, toolRule, now);
      if (!toolResult.allowed) {
        this.logRateLimitHit('tool', params.toolName, params);
        return { ...toolResult, limitType: 'tool', limitKey: params.toolName };
      }
    }

    // Check scope-specific limits
    if (params.scopes) {
      for (const scope of params.scopes) {
        const scopeRule = this.config.scopeLimits[scope];
        if (scopeRule) {
          const scopeKey = `${params.clientId}:${scope}`;
          const scopeBucket = this.getOrCreateBucket(this.scopeBuckets, scopeKey, scopeRule);
          const scopeResult = this.checkBucket(scopeBucket, scopeRule, now);
          if (!scopeResult.allowed) {
            this.logRateLimitHit('scope', scope, params);
            return { ...scopeResult, limitType: 'scope', limitKey: scope };
          }
        }
      }
    }

    // All checks passed - consume tokens
    this.consumeToken(this.globalBucket, this.config.global, now);
    this.consumeToken(clientBucket, clientRule, now);

    if (params.toolName) {
      const toolKey = `${params.clientId}:${params.toolName}`;
      const toolBucket = this.toolBuckets.get(toolKey);
      const toolRule = this.config.toolLimits[params.toolName] ?? this.config.perTool;
      if (toolBucket) {
        this.consumeToken(toolBucket, toolRule, now);
      }
    }

    // Return the most restrictive remaining count
    const remaining = Math.min(
      globalResult.remaining - 1,
      clientResult.remaining - 1
    );

    return {
      allowed: true,
      remaining: Math.max(0, remaining),
      resetAt: Math.min(globalResult.resetAt, clientResult.resetAt),
    };
  }

  /**
   * Record a successful request (for tracking purposes)
   */
  record(params: {
    clientId: string;
    toolName?: string;
    durationMs?: number;
  }): void {
    // Already recorded in check() via consumeToken
    // This method can be used for additional tracking
    logger.debug(
      { clientId: params.clientId, tool: params.toolName, duration: params.durationMs },
      'Request recorded'
    );
  }

  /**
   * Get current rate limit status for a client
   */
  getStatus(clientId: string): {
    global: { remaining: number; resetAt: number };
    client: { remaining: number; resetAt: number };
    tools: Record<string, { remaining: number; resetAt: number }>;
  } {
    const now = Date.now();

    // Global status
    const globalStatus = this.getBucketStatus(this.globalBucket, this.config.global, now);

    // Client status
    const clientRule = this.config.clientLimits[clientId] ?? this.config.perClient;
    const clientBucket = this.clientBuckets.get(clientId);
    const clientStatus = clientBucket
      ? this.getBucketStatus(clientBucket, clientRule, now)
      : { remaining: clientRule.maxRequests, resetAt: now + clientRule.windowMs };

    // Tool statuses
    const tools: Record<string, { remaining: number; resetAt: number }> = {};
    for (const [key, bucket] of this.toolBuckets) {
      if (key.startsWith(`${clientId}:`)) {
        const toolName = key.slice(clientId.length + 1);
        const toolRule = this.config.toolLimits[toolName] ?? this.config.perTool;
        tools[toolName] = this.getBucketStatus(bucket, toolRule, now);
      }
    }

    return { global: globalStatus, client: clientStatus, tools };
  }

  /**
   * Reset rate limits for a client
   */
  reset(clientId: string): void {
    this.clientBuckets.delete(clientId);

    // Remove all tool buckets for this client
    for (const key of this.toolBuckets.keys()) {
      if (key.startsWith(`${clientId}:`)) {
        this.toolBuckets.delete(key);
      }
    }

    // Remove all scope buckets for this client
    for (const key of this.scopeBuckets.keys()) {
      if (key.startsWith(`${clientId}:`)) {
        this.scopeBuckets.delete(key);
      }
    }

    // Remove cooldowns
    this.cooldowns.delete(`client:${clientId}`);

    logger.info({ clientId }, 'Rate limits reset for client');
  }

  /**
   * Configure a custom limit for a specific tool
   */
  setToolLimit(toolName: string, rule: RateLimitRule): void {
    this.config.toolLimits[toolName] = rule;
  }

  /**
   * Configure a custom limit for a specific client
   */
  setClientLimit(clientId: string, rule: RateLimitRule): void {
    this.config.clientLimits[clientId] = rule;
  }

  /**
   * Configure a custom limit for a specific scope
   */
  setScopeLimit(scope: string, rule: RateLimitRule): void {
    this.config.scopeLimits[scope] = rule;
  }

  /**
   * Shutdown the rate limiter
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clientBuckets.clear();
    this.toolBuckets.clear();
    this.scopeBuckets.clear();
    this.cooldowns.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private createBucket(rule: RateLimitRule): TokenBucket {
    return {
      tokens: rule.maxRequests + (rule.burstAllowance ?? 0),
      lastRefill: Date.now(),
      requests: [],
    };
  }

  private getOrCreateBucket(
    buckets: Map<string, TokenBucket>,
    key: string,
    rule: RateLimitRule
  ): TokenBucket {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = this.createBucket(rule);
      buckets.set(key, bucket);
    }
    return bucket;
  }

  private checkBucket(
    bucket: TokenBucket,
    rule: RateLimitRule,
    now: number
  ): RateLimitResult {
    if (this.config.useSlidingWindow) {
      return this.checkSlidingWindow(bucket, rule, now);
    }
    return this.checkTokenBucket(bucket, rule, now);
  }

  private checkTokenBucket(
    bucket: TokenBucket,
    rule: RateLimitRule,
    now: number
  ): RateLimitResult {
    // Refill tokens based on time elapsed
    const elapsed = now - bucket.lastRefill;
    const refillRate = rule.maxRequests / rule.windowMs;
    const tokensToAdd = elapsed * refillRate;
    const maxTokens = rule.maxRequests + (rule.burstAllowance ?? 0);

    bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    const allowed = bucket.tokens >= 1;
    const remaining = Math.floor(bucket.tokens);
    const resetAt = now + rule.windowMs;

    return {
      allowed,
      remaining: Math.max(0, remaining - 1), // Account for this request
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil((1 - bucket.tokens) / refillRate / 1000),
    };
  }

  private checkSlidingWindow(
    bucket: TokenBucket,
    rule: RateLimitRule,
    now: number
  ): RateLimitResult {
    // Remove expired requests
    const windowStart = now - rule.windowMs;
    bucket.requests = bucket.requests.filter(ts => ts > windowStart);

    const count = bucket.requests.length;
    const maxRequests = rule.maxRequests + (rule.burstAllowance ?? 0);
    const allowed = count < maxRequests;
    const remaining = maxRequests - count;
    const resetAt = bucket.requests.length > 0
      ? bucket.requests[0] + rule.windowMs
      : now + rule.windowMs;

    return {
      allowed,
      remaining: Math.max(0, remaining - 1),
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil((resetAt - now) / 1000),
    };
  }

  private consumeToken(bucket: TokenBucket, rule: RateLimitRule, now: number): void {
    if (this.config.useSlidingWindow) {
      bucket.requests.push(now);
    } else {
      bucket.tokens = Math.max(0, bucket.tokens - 1);
    }
  }

  private getBucketStatus(
    bucket: TokenBucket,
    rule: RateLimitRule,
    now: number
  ): { remaining: number; resetAt: number } {
    const result = this.checkBucket(bucket, rule, now);
    return {
      remaining: result.remaining,
      resetAt: result.resetAt,
    };
  }

  private applyCooldown(key: string, cooldownMs?: number): void {
    if (cooldownMs && cooldownMs > 0) {
      this.cooldowns.set(key, Date.now() + cooldownMs);
    }
  }

  private logRateLimitHit(
    type: string,
    key: string,
    params: { clientId: string; toolName?: string; userId?: string }
  ): void {
    logger.warn(
      { limitType: type, limitKey: key, clientId: params.clientId, tool: params.toolName },
      'Rate limit exceeded'
    );

    auditLogger.log({
      eventId: randomBytes(16).toString('hex'),
      timestamp: Date.now(),
      eventType: 'rate_limit',
      severity: 'warn',
      actor: { userId: params.userId },
      resource: { type: 'mcp', name: key },
      action: 'rate_limit_exceeded',
      outcome: 'blocked',
      details: { limitType: type, clientId: params.clientId, tool: params.toolName },
    });
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    // Cleanup stale client buckets
    for (const [key, bucket] of this.clientBuckets) {
      const rule = this.config.clientLimits[key] ?? this.config.perClient;
      if (now - bucket.lastRefill > rule.windowMs * 2) {
        this.clientBuckets.delete(key);
        cleaned++;
      }
    }

    // Cleanup stale tool buckets
    for (const [key, bucket] of this.toolBuckets) {
      const toolName = key.split(':')[1];
      const rule = this.config.toolLimits[toolName] ?? this.config.perTool;
      if (now - bucket.lastRefill > rule.windowMs * 2) {
        this.toolBuckets.delete(key);
        cleaned++;
      }
    }

    // Cleanup stale scope buckets
    for (const [key, bucket] of this.scopeBuckets) {
      const scope = key.split(':')[1];
      const rule = this.config.scopeLimits[scope];
      if (rule && now - bucket.lastRefill > rule.windowMs * 2) {
        this.scopeBuckets.delete(key);
        cleaned++;
      }
    }

    // Cleanup expired cooldowns
    for (const [key, endTime] of this.cooldowns) {
      if (now > endTime) {
        this.cooldowns.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug({ cleaned }, 'Rate limiter cleanup completed');
    }
  }
}

// ============================================================================
// Rate Limit Headers Helper
// ============================================================================

/**
 * Generate rate limit headers for HTTP responses
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
  };

  if (!result.allowed && result.retryAfter !== undefined) {
    headers['Retry-After'] = String(result.retryAfter);
  }

  if (result.limitType) {
    headers['X-RateLimit-Limit-Type'] = result.limitType;
  }

  return headers;
}

// ============================================================================
// Preconfigured Rate Limiters
// ============================================================================

/**
 * Create a rate limiter with conservative limits (for production)
 */
export function createProductionRateLimiter(): MCPRateLimiter {
  return new MCPRateLimiter({
    global: { maxRequests: 10000, windowMs: 60000 },
    perClient: { maxRequests: 100, windowMs: 60000, cooldownMs: 60000 },
    perTool: { maxRequests: 30, windowMs: 60000 },
    toolLimits: {
      // High-risk tools have stricter limits
      shell_exec: { maxRequests: 10, windowMs: 60000, cooldownMs: 300000 },
      shell_script: { maxRequests: 5, windowMs: 60000, cooldownMs: 300000 },
      file_write: { maxRequests: 20, windowMs: 60000 },
      file_delete: { maxRequests: 10, windowMs: 60000, cooldownMs: 60000 },
      http_request: { maxRequests: 50, windowMs: 60000 },
    },
    scopeLimits: {
      admin: { maxRequests: 50, windowMs: 60000 },
      'tools:execute': { maxRequests: 100, windowMs: 60000 },
    },
    useSlidingWindow: true,
  });
}

/**
 * Create a rate limiter with relaxed limits (for development)
 */
export function createDevelopmentRateLimiter(): MCPRateLimiter {
  return new MCPRateLimiter({
    global: { maxRequests: 100000, windowMs: 60000 },
    perClient: { maxRequests: 1000, windowMs: 60000 },
    perTool: { maxRequests: 100, windowMs: 60000 },
    useSlidingWindow: false,
  });
}
