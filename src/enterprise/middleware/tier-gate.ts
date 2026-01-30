/**
 * Tier Gate Middleware
 *
 * Feature gating based on subscription tier
 */

import type { TenantContext, SubscriptionTier, TierFeature, TierFeatures } from '../types.js';
import { hasFeature, getTierFeatures, getTierLimits } from '../constants.js';
import { EnterpriseError } from '../types.js';

/**
 * Get array of enabled feature keys from TierFeatures object
 */
function getEnabledFeatures(features: TierFeatures): TierFeature[] {
  return (Object.keys(features) as TierFeature[]).filter(key => features[key]);
}

// =============================================================================
// Types
// =============================================================================

export interface TierGateConfig {
  /** Error handler for tier gate failures */
  onDenied?: (req: RequestLike, feature: TierFeature, context: TenantContext) => void;
  /** Allow bypassing tier gates (for testing) */
  bypassForTesting?: boolean;
}

export interface RequestLike {
  tenantContext?: TenantContext;
  path?: string;
  url?: string;
  [key: string]: unknown;
}

export interface ResponseLike {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
}

export type NextFunction = (error?: Error) => void;

// =============================================================================
// Tier Gate Middleware
// =============================================================================

export class TierGateMiddleware {
  private readonly config: TierGateConfig;

  constructor(config?: TierGateConfig) {
    this.config = config ?? {};
  }

  /**
   * Create middleware that requires a specific feature
   */
  requireFeature(feature: TierFeature) {
    return (req: RequestLike, res: ResponseLike, next: NextFunction): void => {
      if (this.config.bypassForTesting) {
        return next();
      }

      const context = req.tenantContext;
      if (!context) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
        return;
      }

      if (!hasFeature(context.tier, feature)) {
        this.config.onDenied?.(req, feature, context);

        res.status(403).json({
          error: 'FEATURE_NOT_AVAILABLE',
          message: `The "${feature}" feature is not available on your current plan`,
          currentTier: context.tier,
          requiredFeature: feature,
          upgradePath: this.getUpgradePath(context.tier, feature),
        });
        return;
      }

      next();
    };
  }

  /**
   * Create middleware that requires a minimum tier
   */
  requireTier(minimumTier: SubscriptionTier) {
    const tierOrder: SubscriptionTier[] = ['free', 'pro', 'business', 'enterprise'];

    return (req: RequestLike, res: ResponseLike, next: NextFunction): void => {
      if (this.config.bypassForTesting) {
        return next();
      }

      const context = req.tenantContext;
      if (!context) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
        return;
      }

      const currentTierIndex = tierOrder.indexOf(context.tier);
      const requiredTierIndex = tierOrder.indexOf(minimumTier);

      if (currentTierIndex < requiredTierIndex) {
        res.status(403).json({
          error: 'TIER_REQUIRED',
          message: `This feature requires at least the "${minimumTier}" plan`,
          currentTier: context.tier,
          requiredTier: minimumTier,
        });
        return;
      }

      next();
    };
  }

  /**
   * Create middleware that checks a specific limit
   */
  checkLimit(
    limitType: 'users' | 'bots' | 'apiCallsPerDay' | 'apiCallsPerMinute' | 'storage',
    getCurrentValue: (req: RequestLike) => Promise<number> | number
  ) {
    return async (req: RequestLike, res: ResponseLike, next: NextFunction): Promise<void> => {
      if (this.config.bypassForTesting) {
        return next();
      }

      const context = req.tenantContext;
      if (!context) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
        return;
      }

      try {
        const currentValue = await getCurrentValue(req);
        const limit = this.getLimitValue(context.limits, limitType);

        if (limit !== -1 && currentValue >= limit) {
          res.status(403).json({
            error: 'LIMIT_EXCEEDED',
            message: `You have reached your ${limitType} limit`,
            currentUsage: currentValue,
            limit,
            currentTier: context.tier,
          });
          return;
        }

        next();
      } catch (error) {
        next(error instanceof Error ? error : new Error(String(error)));
      }
    };
  }

  /**
   * Get limit value from limits object
   */
  private getLimitValue(
    limits: ReturnType<typeof getTierLimits>,
    limitType: string
  ): number {
    switch (limitType) {
      case 'users':
        return limits.maxUsers;
      case 'bots':
        return limits.maxBots;
      case 'apiCallsPerDay':
        return limits.apiCallsPerDay;
      case 'apiCallsPerMinute':
        return limits.apiCallsPerMinute;
      case 'storage':
        return limits.storageLimitBytes;
      default:
        return -1;
    }
  }

  /**
   * Get upgrade path for a feature
   */
  private getUpgradePath(
    currentTier: SubscriptionTier,
    feature: TierFeature
  ): { recommendedTier: SubscriptionTier; features: TierFeature[] } | null {
    const tiers: SubscriptionTier[] = ['pro', 'business', 'enterprise'];
    const tierOrder = ['free', 'pro', 'business', 'enterprise'];
    const currentIndex = tierOrder.indexOf(currentTier);

    for (const tier of tiers) {
      const tierIndex = tierOrder.indexOf(tier);
      if (tierIndex > currentIndex && hasFeature(tier, feature)) {
        return {
          recommendedTier: tier,
          features: getEnabledFeatures(getTierFeatures(tier)),
        };
      }
    }

    return null;
  }
}

/**
 * Create tier gate middleware
 */
export function createTierGateMiddleware(config?: TierGateConfig): TierGateMiddleware {
  return new TierGateMiddleware(config);
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Check if request has access to a feature
 */
export function canAccessFeature(
  req: RequestLike,
  feature: TierFeature
): boolean {
  const context = req.tenantContext;
  if (!context) return false;
  return hasFeature(context.tier, feature);
}

/**
 * Require feature access (throws if not available)
 */
export function requireFeatureAccess(
  req: RequestLike,
  feature: TierFeature
): void {
  if (!canAccessFeature(req, feature)) {
    throw new EnterpriseError(
      'FEATURE_NOT_AVAILABLE',
      `The "${feature}" feature is not available on your current plan`,
      403
    );
  }
}

/**
 * Get available features for request
 */
export function getAvailableFeatures(req: RequestLike): TierFeature[] {
  const context = req.tenantContext;
  if (!context) return [];
  return getEnabledFeatures(getTierFeatures(context.tier));
}

/**
 * Decorator for class methods to require a feature
 */
export function RequireFeature(feature: TierFeature) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = function (this: unknown, ...args: unknown[]) {
      // Assume first argument is request-like object
      const req = args[0] as RequestLike | undefined;
      if (req && 'tenantContext' in req) {
        requireFeatureAccess(req, feature);
      }
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
