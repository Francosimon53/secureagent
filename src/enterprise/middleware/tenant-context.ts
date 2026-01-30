/**
 * Tenant Context Middleware
 *
 * Extracts and validates tenant context for multi-tenant isolation
 */

import type { TenantStore } from '../stores/tenant-store.js';
import type { Tenant, TenantContext, SubscriptionTier } from '../types.js';
import { getTierLimits, getTierFeatures } from '../constants.js';
import { EnterpriseError } from '../types.js';

// =============================================================================
// Types
// =============================================================================

export interface TenantContextConfig {
  /** Header name for tenant ID */
  tenantHeader?: string;
  /** Query parameter name for tenant ID */
  tenantQueryParam?: string;
  /** Allow extraction from subdomain */
  allowSubdomain?: boolean;
  /** Base domain for subdomain extraction */
  baseDomain?: string;
  /** Allow extraction from API key */
  allowApiKey?: boolean;
  /** Allow extraction from JWT claims */
  allowJwtClaims?: boolean;
  /** JWT claim name for tenant ID */
  jwtTenantClaim?: string;
  /** Require tenant for all requests */
  requireTenant?: boolean;
  /** Paths that don't require tenant */
  excludePaths?: string[];
}

export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  hostname?: string;
  path?: string;
  url?: string;
  user?: {
    tenantId?: string;
    [key: string]: unknown;
  };
  apiKey?: {
    tenantId?: string;
    [key: string]: unknown;
  };
}

export interface ResponseLike {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
}

export type NextFunction = (error?: Error) => void;

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: TenantContextConfig = {
  tenantHeader: 'x-tenant-id',
  tenantQueryParam: 'tenantId',
  allowSubdomain: true,
  baseDomain: undefined,
  allowApiKey: true,
  allowJwtClaims: true,
  jwtTenantClaim: 'tenantId',
  requireTenant: false,
  excludePaths: ['/health', '/api/health', '/api/v1/health'],
};

// =============================================================================
// Tenant Context Middleware
// =============================================================================

export class TenantContextMiddleware {
  private readonly config: TenantContextConfig;
  private readonly tenantStore: TenantStore;
  private readonly tenantCache = new Map<string, { tenant: Tenant; timestamp: number }>();
  private readonly cacheTtlMs = 60000; // 1 minute cache

  constructor(tenantStore: TenantStore, config?: Partial<TenantContextConfig>) {
    this.tenantStore = tenantStore;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Express-style middleware handler
   */
  handler() {
    return async (
      req: RequestLike & { tenantContext?: TenantContext },
      res: ResponseLike,
      next: NextFunction
    ): Promise<void> => {
      try {
        // Check if path is excluded
        const path = req.path ?? req.url ?? '';
        if (this.isExcludedPath(path)) {
          return next();
        }

        // Extract tenant ID
        const tenantId = this.extractTenantId(req);

        if (!tenantId) {
          if (this.config.requireTenant) {
            res.status(400).json({
              error: 'TENANT_REQUIRED',
              message: 'Tenant ID is required',
            });
            return;
          }
          return next();
        }

        // Get tenant
        const tenant = await this.getTenant(tenantId);
        if (!tenant) {
          res.status(404).json({
            error: 'TENANT_NOT_FOUND',
            message: 'Tenant not found',
          });
          return;
        }

        // Check if tenant is active
        if (tenant.status === 'suspended') {
          res.status(403).json({
            error: 'TENANT_SUSPENDED',
            message: 'Tenant account is suspended',
          });
          return;
        }

        // Build tenant context
        req.tenantContext = this.buildContext(tenant);

        next();
      } catch (error) {
        next(error instanceof Error ? error : new Error(String(error)));
      }
    };
  }

  /**
   * Extract tenant context directly (non-middleware usage)
   */
  async extractContext(req: RequestLike): Promise<TenantContext | null> {
    const tenantId = this.extractTenantId(req);
    if (!tenantId) return null;

    const tenant = await this.getTenant(tenantId);
    if (!tenant || tenant.status === 'suspended') return null;

    return this.buildContext(tenant);
  }

  /**
   * Extract tenant ID from request
   */
  extractTenantId(req: RequestLike): string | null {
    // 1. From JWT claims (highest priority)
    if (this.config.allowJwtClaims && req.user) {
      const claim = this.config.jwtTenantClaim ?? 'tenantId';
      const tenantId = req.user[claim] as string | undefined;
      if (tenantId) return tenantId;
    }

    // 2. From API key
    if (this.config.allowApiKey && req.apiKey?.tenantId) {
      return req.apiKey.tenantId;
    }

    // 3. From header
    if (this.config.tenantHeader) {
      const header = req.headers[this.config.tenantHeader.toLowerCase()];
      if (header) {
        return Array.isArray(header) ? header[0] : header;
      }
    }

    // 4. From query parameter
    if (this.config.tenantQueryParam && req.query) {
      const param = req.query[this.config.tenantQueryParam];
      if (param) {
        return Array.isArray(param) ? param[0] : param;
      }
    }

    // 5. From subdomain
    if (this.config.allowSubdomain && this.config.baseDomain && req.hostname) {
      const subdomain = this.extractSubdomain(req.hostname, this.config.baseDomain);
      if (subdomain) return subdomain;
    }

    return null;
  }

  /**
   * Build tenant context from tenant
   */
  buildContext(tenant: Tenant): TenantContext {
    return {
      tenantId: tenant.id,
      slug: tenant.slug,
      tier: tenant.tier,
      limits: getTierLimits(tenant.tier),
      features: getTierFeatures(tenant.tier),
      settings: tenant.settings,
    };
  }

  /**
   * Get tenant with caching
   */
  private async getTenant(tenantId: string): Promise<Tenant | null> {
    const cached = this.tenantCache.get(tenantId);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.tenant;
    }

    const tenant = await this.tenantStore.getTenant(tenantId);
    if (tenant) {
      this.tenantCache.set(tenantId, { tenant, timestamp: Date.now() });
    }

    return tenant;
  }

  /**
   * Extract subdomain from hostname
   */
  private extractSubdomain(hostname: string, baseDomain: string): string | null {
    if (!hostname.endsWith(baseDomain)) {
      return null;
    }

    const subdomain = hostname.slice(0, -(baseDomain.length + 1)); // +1 for the dot
    if (!subdomain || subdomain === 'www' || subdomain === 'api') {
      return null;
    }

    return subdomain;
  }

  /**
   * Check if path is excluded
   */
  private isExcludedPath(path: string): boolean {
    if (!this.config.excludePaths) return false;

    return this.config.excludePaths.some(excluded => {
      if (excluded.endsWith('*')) {
        return path.startsWith(excluded.slice(0, -1));
      }
      return path === excluded;
    });
  }

  /**
   * Clear tenant cache
   */
  clearCache(tenantId?: string): void {
    if (tenantId) {
      this.tenantCache.delete(tenantId);
    } else {
      this.tenantCache.clear();
    }
  }
}

/**
 * Create tenant context middleware
 */
export function createTenantContextMiddleware(
  tenantStore: TenantStore,
  config?: Partial<TenantContextConfig>
): TenantContextMiddleware {
  return new TenantContextMiddleware(tenantStore, config);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Require tenant context decorator/guard
 */
export function requireTenantContext(
  req: RequestLike & { tenantContext?: TenantContext }
): TenantContext {
  if (!req.tenantContext) {
    throw new EnterpriseError('TENANT_REQUIRED', 'Tenant context is required', 400);
  }
  return req.tenantContext;
}

/**
 * Get tenant context or null
 */
export function getTenantContext(
  req: RequestLike & { tenantContext?: TenantContext }
): TenantContext | null {
  return req.tenantContext ?? null;
}
