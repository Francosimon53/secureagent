/**
 * Rate Limit Service
 *
 * Per-tier rate limiting for API requests
 */

import type {
  SubscriptionTier,
  RateLimitCheckResult,
  RateLimitConfig,
  RateLimitWindow,
} from '../types.js';
import type { TenantStore } from '../stores/tenant-store.js';
import { EnterpriseError } from '../types.js';
import { getTierLimits, ENTERPRISE_DEFAULTS } from '../constants.js';

// =============================================================================
// Service Configuration
// =============================================================================

export interface RateLimitServiceConfig {
  /** Default block duration in ms */
  defaultBlockDurationMs: number;
  /** Redis URL for distributed rate limiting (optional) */
  redisUrl?: string;
  /** Key prefix */
  keyPrefix: string;
}

const DEFAULT_CONFIG: RateLimitServiceConfig = {
  defaultBlockDurationMs: ENTERPRISE_DEFAULTS.RATE_LIMIT_BLOCK_DURATION_MS,
  keyPrefix: 'enterprise:ratelimit:',
};

// =============================================================================
// Rate Limit Entry
// =============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
  blockedUntil?: number;
}

// =============================================================================
// Rate Limit Service
// =============================================================================

export class RateLimitService {
  private readonly config: RateLimitServiceConfig;
  private readonly entries = new Map<string, RateLimitEntry>();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly tenantStore: TenantStore,
    config?: Partial<RateLimitServiceConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the rate limit service (enables cleanup)
   */
  start(): void {
    if (this.cleanupTimer) return;

    // Cleanup old entries every minute
    this.cleanupTimer = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Stop the rate limit service
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Check rate limit for a tenant
   */
  async checkRateLimit(
    tenantId: string,
    key: string = 'default',
    configOverride?: { maxRequests?: number; windowMs?: number }
  ): Promise<RateLimitCheckResult> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const limits = getTierLimits(tenant.tier);

    // Determine window type from windowMs override
    let window: RateLimitWindow = 'minute';
    if (configOverride?.windowMs) {
      if (configOverride.windowMs >= 24 * 60 * 60 * 1000) {
        window = 'day';
      } else if (configOverride.windowMs >= 60 * 60 * 1000) {
        window = 'hour';
      } else if (configOverride.windowMs >= 60 * 1000) {
        window = 'minute';
      } else {
        window = 'second';
      }
    }

    const rateConfig: RateLimitConfig = {
      window,
      maxRequests: configOverride?.maxRequests ?? limits.apiCallsPerMinute,
      blockDurationMs: this.config.defaultBlockDurationMs,
    };

    return this.checkLimit(`${tenantId}:${key}`, rateConfig);
  }

  /**
   * Check rate limit with custom configuration
   */
  checkLimit(key: string, config: RateLimitConfig): RateLimitCheckResult {
    const fullKey = `${this.config.keyPrefix}${key}`;
    const now = Date.now();
    const windowMs = this.getWindowMs(config.window);

    let entry = this.entries.get(fullKey);

    // Check if currently blocked
    if (entry?.blockedUntil && entry.blockedUntil > now) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.blockedUntil,
        retryAfter: entry.blockedUntil - now,
        current: entry.count,
        limit: config.maxRequests,
      };
    }

    // Initialize or reset window
    if (!entry || now - entry.windowStart >= windowMs) {
      entry = {
        count: 0,
        windowStart: now,
      };
    }

    // Check if limit exceeded
    if (entry.count >= config.maxRequests) {
      // Apply block if configured
      if (config.blockDurationMs) {
        entry.blockedUntil = now + config.blockDurationMs;
      }

      this.entries.set(fullKey, entry);

      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.windowStart + windowMs,
        retryAfter: config.blockDurationMs ?? (entry.windowStart + windowMs - now),
        current: entry.count,
        limit: config.maxRequests,
      };
    }

    // Increment counter
    entry.count++;
    this.entries.set(fullKey, entry);

    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: entry.windowStart + windowMs,
      current: entry.count,
      limit: config.maxRequests,
    };
  }

  /**
   * Increment rate limit counter without checking
   */
  increment(key: string, window: RateLimitWindow = 'minute'): void {
    const fullKey = `${this.config.keyPrefix}${key}`;
    const now = Date.now();
    const windowMs = this.getWindowMs(window);

    let entry = this.entries.get(fullKey);

    if (!entry || now - entry.windowStart >= windowMs) {
      entry = {
        count: 1,
        windowStart: now,
      };
    } else {
      entry.count++;
    }

    this.entries.set(fullKey, entry);
  }

  /**
   * Get current rate limit status
   */
  getStatus(key: string, config: RateLimitConfig): RateLimitCheckResult {
    const fullKey = `${this.config.keyPrefix}${key}`;
    const now = Date.now();
    const windowMs = this.getWindowMs(config.window);

    const entry = this.entries.get(fullKey);

    // Check if currently blocked
    if (entry?.blockedUntil && entry.blockedUntil > now) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.blockedUntil,
        retryAfter: entry.blockedUntil - now,
        current: entry.count,
        limit: config.maxRequests,
      };
    }

    if (!entry || now - entry.windowStart >= windowMs) {
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: now + windowMs,
        current: 0,
        limit: config.maxRequests,
      };
    }

    return {
      allowed: entry.count < config.maxRequests,
      remaining: Math.max(0, config.maxRequests - entry.count),
      resetAt: entry.windowStart + windowMs,
      current: entry.count,
      limit: config.maxRequests,
    };
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    const fullKey = `${this.config.keyPrefix}${key}`;
    this.entries.delete(fullKey);
  }

  /**
   * Reset all rate limits for a tenant
   */
  resetTenant(tenantId: string): void {
    const prefix = `${this.config.keyPrefix}${tenantId}:`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Get rate limit configuration for a tier
   */
  getTierRateLimits(tier: SubscriptionTier): {
    perMinute: number;
    perDay: number;
  } {
    const limits = getTierLimits(tier);
    return {
      perMinute: limits.apiCallsPerMinute,
      perDay: limits.apiCallsPerDay,
    };
  }

  /**
   * Check rate limit with automatic tier detection
   */
  async checkTenantRateLimit(
    tenantId: string,
    userId?: string,
    endpoint?: string
  ): Promise<RateLimitCheckResult> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    if (tenant.status !== 'active') {
      throw new EnterpriseError('TENANT_SUSPENDED', 'Tenant is suspended', 403);
    }

    const limits = getTierLimits(tenant.tier);

    // Create a unique key based on tenant, optionally user and endpoint
    let key = tenantId;
    if (userId) key += `:user:${userId}`;
    if (endpoint) key += `:endpoint:${endpoint}`;

    return this.checkLimit(key, {
      window: 'minute',
      maxRequests: limits.apiCallsPerMinute,
      blockDurationMs: this.config.defaultBlockDurationMs,
    });
  }

  /**
   * Apply rate limit result to response headers
   */
  getResponseHeaders(result: RateLimitCheckResult): Record<string, string> {
    const headers: Record<string, string> = {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString(),
    };

    if (!result.allowed && result.retryAfter) {
      headers['Retry-After'] = Math.ceil(result.retryAfter / 1000).toString();
    }

    return headers;
  }

  /**
   * Get window duration in milliseconds
   */
  private getWindowMs(window: RateLimitWindow): number {
    switch (window) {
      case 'second':
        return 1000;
      case 'minute':
        return 60 * 1000;
      case 'hour':
        return 60 * 60 * 1000;
      case 'day':
        return 24 * 60 * 60 * 1000;
      default:
        return 60 * 1000;
    }
  }

  /**
   * Cleanup old entries
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [key, entry] of this.entries) {
      // Remove entries that are old and not blocked
      if (now - entry.windowStart > maxAge && (!entry.blockedUntil || entry.blockedUntil < now)) {
        this.entries.delete(key);
      }
    }
  }
}

/**
 * Create rate limit service
 */
export function createRateLimitService(
  tenantStore: TenantStore,
  config?: Partial<RateLimitServiceConfig>
): RateLimitService {
  return new RateLimitService(tenantStore, config);
}
