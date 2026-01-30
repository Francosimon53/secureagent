/**
 * Rate Limit Middleware
 *
 * Per-tenant rate limiting based on subscription tier
 */

import type { TenantContext, SubscriptionTier } from '../types.js';
import type { RateLimitService } from '../services/rate-limit-service.js';
import { getTierLimits } from '../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface RateLimitMiddlewareConfig {
  /** Service for rate limit checking */
  rateLimitService: RateLimitService;
  /** Key extractor for identifying clients */
  keyExtractor?: (req: RequestLike) => string;
  /** Skip rate limiting for certain paths */
  skipPaths?: string[];
  /** Custom headers for rate limit info */
  headers?: {
    limit?: string;
    remaining?: string;
    reset?: string;
    retryAfter?: string;
  };
  /** Allow bypassing for testing */
  bypassForTesting?: boolean;
}

export interface RequestLike {
  tenantContext?: TenantContext;
  ip?: string;
  path?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  user?: {
    id?: string;
    [key: string]: unknown;
  };
}

export interface ResponseLike {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
  set: (headers: Record<string, string>) => ResponseLike;
  setHeader: (name: string, value: string) => void;
}

export type NextFunction = (error?: Error) => void;

// =============================================================================
// Rate Limit Middleware
// =============================================================================

export class RateLimitMiddleware {
  private readonly config: RateLimitMiddlewareConfig;
  private readonly defaultHeaders = {
    limit: 'X-RateLimit-Limit',
    remaining: 'X-RateLimit-Remaining',
    reset: 'X-RateLimit-Reset',
    retryAfter: 'Retry-After',
  };

  constructor(config: RateLimitMiddlewareConfig) {
    this.config = {
      ...config,
      headers: { ...this.defaultHeaders, ...config.headers },
    };
  }

  /**
   * Express-style middleware handler
   */
  handler() {
    return async (
      req: RequestLike,
      res: ResponseLike,
      next: NextFunction
    ): Promise<void> => {
      // Skip if bypass is enabled
      if (this.config.bypassForTesting) {
        return next();
      }

      // Skip for excluded paths
      const path = req.path ?? req.url ?? '';
      if (this.shouldSkip(path)) {
        return next();
      }

      // Get tenant context
      const context = req.tenantContext;
      if (!context) {
        // No tenant context - apply default limits
        return next();
      }

      try {
        const key = this.extractKey(req, context);
        const result = await this.config.rateLimitService.checkRateLimit(
          context.tenantId,
          key
        );

        // Set rate limit headers
        this.setRateLimitHeaders(res, result);

        if (!result.allowed) {
          res.status(429).json({
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            retryAfter: result.retryAfter,
            limit: result.limit,
            resetAt: result.resetAt,
          });
          return;
        }

        next();
      } catch (error) {
        // On rate limit service error, allow the request but log the error
        console.error('Rate limit check failed:', error);
        next();
      }
    };
  }

  /**
   * Create middleware for specific rate limit key
   */
  forKey(keyPrefix: string) {
    return async (
      req: RequestLike,
      res: ResponseLike,
      next: NextFunction
    ): Promise<void> => {
      if (this.config.bypassForTesting) {
        return next();
      }

      const context = req.tenantContext;
      if (!context) {
        return next();
      }

      try {
        const key = `${keyPrefix}:${this.extractKey(req, context)}`;
        const result = await this.config.rateLimitService.checkRateLimit(
          context.tenantId,
          key
        );

        this.setRateLimitHeaders(res, result);

        if (!result.allowed) {
          res.status(429).json({
            error: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded for ${keyPrefix}`,
            retryAfter: result.retryAfter,
          });
          return;
        }

        next();
      } catch (error) {
        console.error('Rate limit check failed:', error);
        next();
      }
    };
  }

  /**
   * Create middleware for per-minute limits
   */
  perMinute(limit?: number) {
    return async (
      req: RequestLike,
      res: ResponseLike,
      next: NextFunction
    ): Promise<void> => {
      if (this.config.bypassForTesting) {
        return next();
      }

      const context = req.tenantContext;
      if (!context) {
        return next();
      }

      try {
        const key = this.extractKey(req, context);
        const tierLimits = getTierLimits(context.tier);
        const effectiveLimit = limit ?? tierLimits.apiCallsPerMinute;

        const result = await this.config.rateLimitService.checkRateLimit(
          context.tenantId,
          `minute:${key}`,
          { maxRequests: effectiveLimit, windowMs: 60000 }
        );

        this.setRateLimitHeaders(res, result);

        if (!result.allowed) {
          res.status(429).json({
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Per-minute rate limit exceeded',
            retryAfter: result.retryAfter,
          });
          return;
        }

        next();
      } catch (error) {
        console.error('Rate limit check failed:', error);
        next();
      }
    };
  }

  /**
   * Create middleware for per-day limits
   */
  perDay(limit?: number) {
    return async (
      req: RequestLike,
      res: ResponseLike,
      next: NextFunction
    ): Promise<void> => {
      if (this.config.bypassForTesting) {
        return next();
      }

      const context = req.tenantContext;
      if (!context) {
        return next();
      }

      try {
        const key = this.extractKey(req, context);
        const tierLimits = getTierLimits(context.tier);
        const effectiveLimit = limit ?? tierLimits.apiCallsPerDay;

        // For unlimited (-1), skip the check
        if (effectiveLimit === -1) {
          return next();
        }

        const result = await this.config.rateLimitService.checkRateLimit(
          context.tenantId,
          `day:${key}`,
          { maxRequests: effectiveLimit, windowMs: 24 * 60 * 60 * 1000 }
        );

        this.setRateLimitHeaders(res, result);

        if (!result.allowed) {
          res.status(429).json({
            error: 'DAILY_LIMIT_EXCEEDED',
            message: 'Daily API call limit exceeded',
            retryAfter: result.retryAfter,
            resetAt: result.resetAt,
          });
          return;
        }

        next();
      } catch (error) {
        console.error('Rate limit check failed:', error);
        next();
      }
    };
  }

  /**
   * Extract rate limit key from request
   */
  private extractKey(req: RequestLike, context: TenantContext): string {
    if (this.config.keyExtractor) {
      return this.config.keyExtractor(req);
    }

    // Default: tenant + user ID or IP
    const userId = req.user?.id;
    const ip = req.ip ?? 'unknown';

    return userId ? `${context.tenantId}:user:${userId}` : `${context.tenantId}:ip:${ip}`;
  }

  /**
   * Set rate limit headers on response
   */
  private setRateLimitHeaders(
    res: ResponseLike,
    result: {
      limit: number;
      remaining: number;
      resetAt: number;
      retryAfter?: number;
    }
  ): void {
    const headers = this.config.headers!;

    const headerValues: Record<string, string> = {
      [headers.limit!]: String(result.limit),
      [headers.remaining!]: String(result.remaining),
      [headers.reset!]: String(Math.ceil(result.resetAt / 1000)),
    };

    if (result.retryAfter !== undefined) {
      headerValues[headers.retryAfter!] = String(Math.ceil(result.retryAfter / 1000));
    }

    // Use set() if available (Express), otherwise setHeader
    if (typeof res.set === 'function') {
      res.set(headerValues);
    } else if (typeof res.setHeader === 'function') {
      for (const [key, value] of Object.entries(headerValues)) {
        res.setHeader(key, value);
      }
    }
  }

  /**
   * Check if path should skip rate limiting
   */
  private shouldSkip(path: string): boolean {
    if (!this.config.skipPaths) return false;

    return this.config.skipPaths.some(skip => {
      if (skip.endsWith('*')) {
        return path.startsWith(skip.slice(0, -1));
      }
      return path === skip;
    });
  }
}

/**
 * Create rate limit middleware
 */
export function createRateLimitMiddleware(
  config: RateLimitMiddlewareConfig
): RateLimitMiddleware {
  return new RateLimitMiddleware(config);
}

// =============================================================================
// Convenience Factories
// =============================================================================

/**
 * Create middleware with default configuration
 */
export function createDefaultRateLimitMiddleware(
  rateLimitService: RateLimitService,
  options?: Partial<Omit<RateLimitMiddlewareConfig, 'rateLimitService'>>
): RateLimitMiddleware {
  return new RateLimitMiddleware({
    rateLimitService,
    skipPaths: ['/health', '/api/health', '/api/v1/health', '/favicon.ico'],
    ...options,
  });
}
