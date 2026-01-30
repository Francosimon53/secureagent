/**
 * Enterprise Module Constants
 *
 * Event names, tier configurations, error codes, and default values
 */

import type {
  SubscriptionTier,
  TierConfig,
  TierLimits,
  TierFeatures,
  EnterpriseRole,
} from './types.js';

// =============================================================================
// Enterprise Events
// =============================================================================

export const ENTERPRISE_EVENTS = {
  // Tenant Events
  TENANT_CREATED: 'enterprise:tenant:created',
  TENANT_UPDATED: 'enterprise:tenant:updated',
  TENANT_SUSPENDED: 'enterprise:tenant:suspended',
  TENANT_ACTIVATED: 'enterprise:tenant:activated',
  TENANT_DELETED: 'enterprise:tenant:deleted',

  // User Events
  USER_INVITED: 'enterprise:user:invited',
  USER_JOINED: 'enterprise:user:joined',
  USER_UPDATED: 'enterprise:user:updated',
  USER_REMOVED: 'enterprise:user:removed',
  USER_ROLE_CHANGED: 'enterprise:user:role-changed',
  USER_SUSPENDED: 'enterprise:user:suspended',

  // Subscription Events
  SUBSCRIPTION_CREATED: 'enterprise:subscription:created',
  SUBSCRIPTION_UPGRADED: 'enterprise:subscription:upgraded',
  SUBSCRIPTION_DOWNGRADED: 'enterprise:subscription:downgraded',
  SUBSCRIPTION_CANCELED: 'enterprise:subscription:canceled',
  SUBSCRIPTION_RENEWED: 'enterprise:subscription:renewed',
  SUBSCRIPTION_TRIAL_ENDING: 'enterprise:subscription:trial-ending',
  SUBSCRIPTION_TRIAL_ENDED: 'enterprise:subscription:trial-ended',

  // Payment Events
  PAYMENT_SUCCEEDED: 'enterprise:payment:succeeded',
  PAYMENT_FAILED: 'enterprise:payment:failed',
  INVOICE_CREATED: 'enterprise:invoice:created',
  INVOICE_PAID: 'enterprise:invoice:paid',

  // Usage Events
  USAGE_THRESHOLD_WARNING: 'enterprise:usage:threshold-warning',
  USAGE_THRESHOLD_CRITICAL: 'enterprise:usage:threshold-critical',
  USAGE_LIMIT_EXCEEDED: 'enterprise:usage:limit-exceeded',
  RATE_LIMIT_EXCEEDED: 'enterprise:rate-limit:exceeded',

  // SSO Events
  SSO_CONFIGURED: 'enterprise:sso:configured',
  SSO_ENABLED: 'enterprise:sso:enabled',
  SSO_DISABLED: 'enterprise:sso:disabled',
  SSO_LOGIN_SUCCESS: 'enterprise:sso:login-success',
  SSO_LOGIN_FAILED: 'enterprise:sso:login-failed',
  SSO_USER_PROVISIONED: 'enterprise:sso:user-provisioned',

  // API Key Events
  API_KEY_CREATED: 'enterprise:api-key:created',
  API_KEY_REVOKED: 'enterprise:api-key:revoked',
  API_KEY_EXPIRED: 'enterprise:api-key:expired',

  // White Label Events
  WHITE_LABEL_CONFIGURED: 'enterprise:white-label:configured',
  DOMAIN_VERIFIED: 'enterprise:domain:verified',
  DOMAIN_VERIFICATION_FAILED: 'enterprise:domain:verification-failed',

  // Security Events
  MFA_ENABLED: 'enterprise:security:mfa-enabled',
  MFA_DISABLED: 'enterprise:security:mfa-disabled',
  SUSPICIOUS_ACTIVITY: 'enterprise:security:suspicious-activity',

  // Billing Events
  TRIAL_ENDING_SOON: 'enterprise:billing:trial-ending-soon',
  PAYMENT_ACTION_REQUIRED: 'enterprise:billing:payment-action-required',
  INVOICE_UPCOMING: 'enterprise:billing:invoice-upcoming',
  CHECKOUT_COMPLETED: 'enterprise:billing:checkout-completed',

  // Alert Events
  ALERT_ENGINE_STARTED: 'enterprise:alerts:engine-started',
  ALERT_ENGINE_STOPPED: 'enterprise:alerts:engine-stopped',
  ALERT_CREATED: 'enterprise:alerts:created',
  ALERT_ACKNOWLEDGED: 'enterprise:alerts:acknowledged',
  ALERT_RESOLVED: 'enterprise:alerts:resolved',
} as const;

export type EnterpriseEventType = typeof ENTERPRISE_EVENTS[keyof typeof ENTERPRISE_EVENTS];

// =============================================================================
// Tier Configurations
// =============================================================================

/** Limits for free tier */
export const FREE_TIER_LIMITS: TierLimits = {
  maxUsers: 3,
  maxBots: 1,
  apiCallsPerDay: 1000,
  apiCallsPerMinute: 10,
  storageLimitBytes: 100 * 1024 * 1024, // 100 MB
  auditLogRetentionDays: 7,
};

/** Limits for pro tier */
export const PRO_TIER_LIMITS: TierLimits = {
  maxUsers: 10,
  maxBots: 5,
  apiCallsPerDay: 50000,
  apiCallsPerMinute: 100,
  storageLimitBytes: 1024 * 1024 * 1024, // 1 GB
  auditLogRetentionDays: 30,
};

/** Limits for business tier */
export const BUSINESS_TIER_LIMITS: TierLimits = {
  maxUsers: 50,
  maxBots: 20,
  apiCallsPerDay: 500000,
  apiCallsPerMinute: 500,
  storageLimitBytes: 10 * 1024 * 1024 * 1024, // 10 GB
  auditLogRetentionDays: 90,
};

/** Limits for enterprise tier */
export const ENTERPRISE_TIER_LIMITS: TierLimits = {
  maxUsers: Number.MAX_SAFE_INTEGER,
  maxBots: Number.MAX_SAFE_INTEGER,
  apiCallsPerDay: Number.MAX_SAFE_INTEGER,
  apiCallsPerMinute: 2000,
  storageLimitBytes: 100 * 1024 * 1024 * 1024, // 100 GB
  auditLogRetentionDays: 365,
};

/** Features for free tier */
export const FREE_TIER_FEATURES: TierFeatures = {
  sso: false,
  whiteLabel: false,
  customDomain: false,
  auditLogs: false,
  apiKeys: false,
  prioritySupport: false,
  advancedAnalytics: false,
  customIntegrations: false,
  slaGuarantee: false,
};

/** Features for pro tier */
export const PRO_TIER_FEATURES: TierFeatures = {
  sso: false,
  whiteLabel: false,
  customDomain: false,
  auditLogs: true,
  apiKeys: true,
  prioritySupport: false,
  advancedAnalytics: false,
  customIntegrations: false,
  slaGuarantee: false,
};

/** Features for business tier */
export const BUSINESS_TIER_FEATURES: TierFeatures = {
  sso: true,
  whiteLabel: false,
  customDomain: false,
  auditLogs: true,
  apiKeys: true,
  prioritySupport: true,
  advancedAnalytics: true,
  customIntegrations: false,
  slaGuarantee: false,
};

/** Features for enterprise tier */
export const ENTERPRISE_TIER_FEATURES: TierFeatures = {
  sso: true,
  whiteLabel: true,
  customDomain: true,
  auditLogs: true,
  apiKeys: true,
  prioritySupport: true,
  advancedAnalytics: true,
  customIntegrations: true,
  slaGuarantee: true,
};

/** Complete tier configurations */
export const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  free: {
    tier: 'free',
    limits: FREE_TIER_LIMITS,
    features: FREE_TIER_FEATURES,
    priceMonthly: 0,
    priceYearly: 0,
  },
  pro: {
    tier: 'pro',
    limits: PRO_TIER_LIMITS,
    features: PRO_TIER_FEATURES,
    priceMonthly: 4900, // $49
    priceYearly: 47000, // $470 (2 months free)
  },
  business: {
    tier: 'business',
    limits: BUSINESS_TIER_LIMITS,
    features: BUSINESS_TIER_FEATURES,
    priceMonthly: 19900, // $199
    priceYearly: 190000, // $1900 (2 months free)
  },
  enterprise: {
    tier: 'enterprise',
    limits: ENTERPRISE_TIER_LIMITS,
    features: ENTERPRISE_TIER_FEATURES,
    priceMonthly: 0, // Custom pricing
    priceYearly: 0,
  },
};

/**
 * Get tier configuration
 */
export function getTierConfig(tier: SubscriptionTier): TierConfig {
  return TIER_CONFIGS[tier];
}

/**
 * Get tier limits
 */
export function getTierLimits(tier: SubscriptionTier): TierLimits {
  return TIER_CONFIGS[tier].limits;
}

/**
 * Get tier features
 */
export function getTierFeatures(tier: SubscriptionTier): TierFeatures {
  return TIER_CONFIGS[tier].features;
}

/**
 * Check if a feature is available for a tier
 */
export function hasFeature(tier: SubscriptionTier, feature: keyof TierFeatures): boolean {
  return TIER_CONFIGS[tier].features[feature];
}

/**
 * Get the next tier upgrade
 */
export function getNextTier(tier: SubscriptionTier): SubscriptionTier | null {
  const order: SubscriptionTier[] = ['free', 'pro', 'business', 'enterprise'];
  const index = order.indexOf(tier);
  return index < order.length - 1 ? order[index + 1] : null;
}

/**
 * Compare tiers (returns positive if tier1 > tier2)
 */
export function compareTiers(tier1: SubscriptionTier, tier2: SubscriptionTier): number {
  const order: SubscriptionTier[] = ['free', 'pro', 'business', 'enterprise'];
  return order.indexOf(tier1) - order.indexOf(tier2);
}

// =============================================================================
// Role Permissions
// =============================================================================

/** Role hierarchy (higher index = more permissions) */
export const ROLE_HIERARCHY: EnterpriseRole[] = ['member', 'analyst', 'developer', 'admin', 'owner'];

/** Role permissions mapping */
export const ROLE_PERMISSIONS: Record<EnterpriseRole, string[]> = {
  member: [
    'read:dashboard',
    'read:bots',
    'use:bots',
  ],
  analyst: [
    'read:dashboard',
    'read:bots',
    'use:bots',
    'read:analytics',
    'read:logs',
  ],
  developer: [
    'read:dashboard',
    'read:bots',
    'use:bots',
    'read:analytics',
    'read:logs',
    'write:bots',
    'read:api-keys',
    'write:api-keys',
  ],
  admin: [
    'read:dashboard',
    'read:bots',
    'use:bots',
    'read:analytics',
    'read:logs',
    'write:bots',
    'read:api-keys',
    'write:api-keys',
    'read:users',
    'write:users',
    'read:settings',
    'write:settings',
    'read:billing',
  ],
  owner: [
    'read:dashboard',
    'read:bots',
    'use:bots',
    'read:analytics',
    'read:logs',
    'write:bots',
    'read:api-keys',
    'write:api-keys',
    'read:users',
    'write:users',
    'read:settings',
    'write:settings',
    'read:billing',
    'write:billing',
    'delete:tenant',
    'transfer:ownership',
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: EnterpriseRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Check if role1 can manage role2 (higher in hierarchy)
 */
export function canManageRole(role1: EnterpriseRole, role2: EnterpriseRole): boolean {
  return ROLE_HIERARCHY.indexOf(role1) > ROLE_HIERARCHY.indexOf(role2);
}

// =============================================================================
// Default Values
// =============================================================================

export const ENTERPRISE_DEFAULTS = {
  /** Default trial duration in days */
  TRIAL_DURATION_DAYS: 14,

  /** Default invitation expiration in days */
  INVITATION_EXPIRATION_DAYS: 7,

  /** Default API key expiration in days (0 = never) */
  API_KEY_EXPIRATION_DAYS: 0,

  /** Default session timeout in minutes */
  SESSION_TIMEOUT_MINUTES: 60,

  /** Usage warning threshold percentage */
  USAGE_WARNING_THRESHOLD: 80,

  /** Usage critical threshold percentage */
  USAGE_CRITICAL_THRESHOLD: 95,

  /** Default timezone */
  DEFAULT_TIMEZONE: 'UTC',

  /** Default language */
  DEFAULT_LANGUAGE: 'en',

  /** Rate limit block duration in ms */
  RATE_LIMIT_BLOCK_DURATION_MS: 60000,

  /** API key prefix length */
  API_KEY_PREFIX_LENGTH: 8,

  /** Minimum password length */
  MIN_PASSWORD_LENGTH: 12,

  /** Max login attempts before lockout */
  MAX_LOGIN_ATTEMPTS: 5,

  /** Lockout duration in minutes */
  LOCKOUT_DURATION_MINUTES: 15,
} as const;

// =============================================================================
// Error Messages
// =============================================================================

export const ERROR_MESSAGES = {
  TENANT_NOT_FOUND: 'Tenant not found',
  TENANT_SUSPENDED: 'Tenant account is suspended',
  USER_NOT_FOUND: 'User not found',
  USER_ALREADY_EXISTS: 'User with this email already exists',
  INVITATION_EXPIRED: 'Invitation has expired',
  INVITATION_INVALID: 'Invalid invitation token',
  SUBSCRIPTION_REQUIRED: 'Active subscription required',
  FEATURE_NOT_AVAILABLE: 'This feature is not available on your current plan',
  USAGE_LIMIT_EXCEEDED: 'Usage limit exceeded for your plan',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please try again later',
  API_KEY_INVALID: 'Invalid API key',
  API_KEY_EXPIRED: 'API key has expired',
  API_KEY_REVOKED: 'API key has been revoked',
  SSO_CONFIG_INVALID: 'Invalid SSO configuration',
  SSO_AUTH_FAILED: 'SSO authentication failed',
  PAYMENT_REQUIRED: 'Payment required to continue',
  PAYMENT_FAILED: 'Payment failed. Please update your payment method',
  INVALID_TIER: 'Invalid subscription tier',
  DOWNGRADE_NOT_ALLOWED: 'Cannot downgrade while exceeding tier limits',
} as const;

// =============================================================================
// API Endpoints (for Stripe webhooks, SSO callbacks)
// =============================================================================

export const ENTERPRISE_ENDPOINTS = {
  /** Stripe webhook endpoint */
  STRIPE_WEBHOOK: '/api/enterprise/webhooks/stripe',

  /** SSO callback endpoint */
  SSO_CALLBACK: '/api/enterprise/sso/callback',

  /** SAML ACS endpoint */
  SAML_ACS: '/api/enterprise/sso/saml/acs',

  /** SAML metadata endpoint */
  SAML_METADATA: '/api/enterprise/sso/saml/metadata',

  /** Domain verification endpoint */
  DOMAIN_VERIFICATION: '/api/enterprise/domains/verify',
} as const;

// =============================================================================
// Stripe Configuration
// =============================================================================

export const STRIPE_CONFIG = {
  /** Stripe API version */
  API_VERSION: '2023-10-16' as const,

  /** Webhook events to subscribe to */
  WEBHOOK_EVENTS: [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.paid',
    'invoice.payment_failed',
    'customer.created',
    'customer.updated',
    'payment_method.attached',
    'payment_method.detached',
  ] as const,

  /** Subscription status mappings */
  STATUS_MAPPING: {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid: 'unpaid',
    incomplete: 'unpaid',
    incomplete_expired: 'canceled',
  } as const,
} as const;
