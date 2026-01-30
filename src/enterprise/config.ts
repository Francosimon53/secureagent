/**
 * Enterprise Module Configuration
 *
 * Zod schemas for enterprise configuration validation
 */

import { z } from 'zod';

// =============================================================================
// Stripe Configuration Schema
// =============================================================================

export const StripeConfigSchema = z.object({
  /** Whether Stripe integration is enabled */
  enabled: z.boolean().default(false),

  /** Stripe secret key environment variable */
  secretKeyEnvVar: z.string().default('STRIPE_SECRET_KEY'),

  /** Stripe publishable key environment variable */
  publishableKeyEnvVar: z.string().default('STRIPE_PUBLISHABLE_KEY'),

  /** Stripe webhook secret environment variable */
  webhookSecretEnvVar: z.string().default('STRIPE_WEBHOOK_SECRET'),

  /** Price IDs for each tier (monthly) */
  priceIds: z.object({
    proMonthly: z.string().optional(),
    proYearly: z.string().optional(),
    businessMonthly: z.string().optional(),
    businessYearly: z.string().optional(),
  }).default({}),

  /** Whether to use test mode */
  testMode: z.boolean().default(true),
});

// =============================================================================
// SSO Configuration Schema
// =============================================================================

export const SSOConfigSchema = z.object({
  /** Whether SSO is enabled globally */
  enabled: z.boolean().default(true),

  /** Allowed SSO providers */
  allowedProviders: z.array(z.enum(['google', 'microsoft', 'saml', 'oidc'])).default(['google', 'microsoft']),

  /** Google OAuth configuration */
  google: z.object({
    enabled: z.boolean().default(false),
    clientIdEnvVar: z.string().default('GOOGLE_CLIENT_ID'),
    clientSecretEnvVar: z.string().default('GOOGLE_CLIENT_SECRET'),
  }).optional(),

  /** Microsoft Entra ID configuration */
  microsoft: z.object({
    enabled: z.boolean().default(false),
    clientIdEnvVar: z.string().default('MICROSOFT_CLIENT_ID'),
    clientSecretEnvVar: z.string().default('MICROSOFT_CLIENT_SECRET'),
    tenantIdEnvVar: z.string().default('MICROSOFT_TENANT_ID'),
  }).optional(),

  /** SAML configuration */
  saml: z.object({
    enabled: z.boolean().default(false),
    /** Service provider entity ID */
    spEntityId: z.string().optional(),
    /** Private key for signing (env var) */
    privateKeyEnvVar: z.string().default('SAML_PRIVATE_KEY'),
    /** Certificate for signing (env var) */
    certificateEnvVar: z.string().default('SAML_CERTIFICATE'),
  }).optional(),

  /** Session duration for SSO sessions (minutes) */
  sessionDurationMinutes: z.number().min(5).max(1440).default(60),

  /** Whether to auto-provision users on first SSO login */
  defaultAutoProvision: z.boolean().default(true),

  /** Default role for auto-provisioned users */
  defaultRole: z.enum(['owner', 'admin', 'developer', 'analyst', 'member']).default('member'),
});

// =============================================================================
// Rate Limiting Configuration Schema
// =============================================================================

export const RateLimitConfigSchema = z.object({
  /** Whether rate limiting is enabled */
  enabled: z.boolean().default(true),

  /** Rate limit window in milliseconds */
  windowMs: z.number().min(1000).max(3600000).default(60000),

  /** Default max requests per window */
  defaultMaxRequests: z.number().min(1).max(10000).default(100),

  /** Block duration when limit exceeded (ms) */
  blockDurationMs: z.number().min(1000).max(3600000).default(60000),

  /** Whether to use Redis for distributed rate limiting */
  useRedis: z.boolean().default(false),

  /** Redis URL environment variable */
  redisUrlEnvVar: z.string().default('REDIS_URL'),

  /** Key prefix for rate limit entries */
  keyPrefix: z.string().default('enterprise:ratelimit:'),
});

// =============================================================================
// Usage Tracking Configuration Schema
// =============================================================================

export const UsageTrackingConfigSchema = z.object({
  /** Whether usage tracking is enabled */
  enabled: z.boolean().default(true),

  /** Flush interval for usage records (ms) */
  flushIntervalMs: z.number().min(1000).max(300000).default(60000),

  /** Batch size for usage record inserts */
  batchSize: z.number().min(1).max(1000).default(100),

  /** Usage warning threshold percentage */
  warningThreshold: z.number().min(50).max(100).default(80),

  /** Usage critical threshold percentage */
  criticalThreshold: z.number().min(50).max(100).default(95),

  /** Whether to send alerts on threshold breach */
  alertOnThreshold: z.boolean().default(true),

  /** Retention period for usage records (days) */
  retentionDays: z.number().min(7).max(365).default(90),
});

// =============================================================================
// White Label Configuration Schema
// =============================================================================

export const WhiteLabelConfigSchema = z.object({
  /** Whether white-label features are enabled */
  enabled: z.boolean().default(true),

  /** Whether custom domains are supported */
  customDomainsEnabled: z.boolean().default(true),

  /** Domain verification method */
  verificationMethod: z.enum(['dns_txt', 'dns_cname', 'file']).default('dns_txt'),

  /** Default branding */
  defaultBranding: z.object({
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#2563eb'),
    accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3b82f6'),
    fontFamily: z.string().default('Inter, system-ui, sans-serif'),
  }).default({}),

  /** Cloudflare configuration for custom domains */
  cloudflare: z.object({
    enabled: z.boolean().default(false),
    apiTokenEnvVar: z.string().default('CLOUDFLARE_API_TOKEN'),
    zoneIdEnvVar: z.string().default('CLOUDFLARE_ZONE_ID'),
  }).optional(),
});

// =============================================================================
// Audit Log Configuration Schema
// =============================================================================

export const AuditLogConfigSchema = z.object({
  /** Whether audit logging is enabled */
  enabled: z.boolean().default(true),

  /** Default retention period (days) */
  defaultRetentionDays: z.number().min(7).max(2190).default(90),

  /** Whether to log API key usage */
  logApiKeyUsage: z.boolean().default(true),

  /** Whether to log SSO events */
  logSsoEvents: z.boolean().default(true),

  /** Whether to include IP addresses in logs */
  includeIpAddress: z.boolean().default(true),

  /** Whether to include user agent in logs */
  includeUserAgent: z.boolean().default(true),

  /** Events to exclude from logging */
  excludeEvents: z.array(z.string()).default([]),
});

// =============================================================================
// Trial Configuration Schema
// =============================================================================

export const TrialConfigSchema = z.object({
  /** Whether trials are enabled */
  enabled: z.boolean().default(true),

  /** Trial duration in days */
  durationDays: z.number().min(1).max(90).default(14),

  /** Tier to trial (usually pro or business) */
  trialTier: z.enum(['pro', 'business']).default('pro'),

  /** Whether credit card is required for trial */
  requireCreditCard: z.boolean().default(false),

  /** Days before trial end to send reminder */
  reminderDays: z.array(z.number()).default([7, 3, 1]),

  /** What happens after trial ends */
  postTrialBehavior: z.enum(['downgrade', 'suspend', 'grace_period']).default('downgrade'),

  /** Grace period days if postTrialBehavior is grace_period */
  gracePeriodDays: z.number().min(0).max(30).default(3),
});

// =============================================================================
// Invitation Configuration Schema
// =============================================================================

export const InvitationConfigSchema = z.object({
  /** Invitation expiration in days */
  expirationDays: z.number().min(1).max(30).default(7),

  /** Maximum pending invitations per tenant */
  maxPendingPerTenant: z.number().min(1).max(1000).default(100),

  /** Whether to send invitation emails */
  sendEmails: z.boolean().default(true),

  /** Email template ID for invitations */
  emailTemplateId: z.string().optional(),

  /** Whether admins can resend invitations */
  allowResend: z.boolean().default(true),
});

// =============================================================================
// API Key Configuration Schema
// =============================================================================

export const APIKeyConfigSchema = z.object({
  /** Whether API keys are enabled */
  enabled: z.boolean().default(true),

  /** Default expiration in days (0 = never) */
  defaultExpirationDays: z.number().min(0).max(365).default(0),

  /** Maximum API keys per user */
  maxKeysPerUser: z.number().min(1).max(100).default(10),

  /** Maximum API keys per tenant */
  maxKeysPerTenant: z.number().min(1).max(1000).default(100),

  /** Key prefix */
  keyPrefix: z.string().default('sk_'),

  /** Key length (excluding prefix) */
  keyLength: z.number().min(32).max(64).default(48),

  /** Hash algorithm for key storage */
  hashAlgorithm: z.enum(['sha256', 'sha512', 'argon2']).default('sha256'),
});

// =============================================================================
// Main Enterprise Configuration Schema
// =============================================================================

export const EnterpriseConfigSchema = z.object({
  /** Whether enterprise features are enabled */
  enabled: z.boolean().default(true),

  /** Store type for enterprise data */
  storeType: z.enum(['memory', 'database']).default('database'),

  /** Default tier for new tenants */
  defaultTier: z.enum(['free', 'pro', 'business', 'enterprise']).default('free'),

  /** Maximum tenants (for self-hosted) */
  maxTenants: z.number().min(1).default(Number.MAX_SAFE_INTEGER),

  /** Stripe billing configuration */
  stripe: StripeConfigSchema.optional(),

  /** SSO configuration */
  sso: SSOConfigSchema.optional(),

  /** Rate limiting configuration */
  rateLimit: RateLimitConfigSchema.optional(),

  /** Usage tracking configuration */
  usageTracking: UsageTrackingConfigSchema.optional(),

  /** White-label configuration */
  whiteLabel: WhiteLabelConfigSchema.optional(),

  /** Audit log configuration */
  auditLog: AuditLogConfigSchema.optional(),

  /** Trial configuration */
  trial: TrialConfigSchema.optional(),

  /** Invitation configuration */
  invitation: InvitationConfigSchema.optional(),

  /** API key configuration */
  apiKey: APIKeyConfigSchema.optional(),

  /** Base URL for the application */
  baseUrl: z.string().url().optional(),

  /** Support email address */
  supportEmail: z.string().email().optional(),

  /** Whether multi-tenancy is enabled */
  multiTenancy: z.boolean().default(true),

  /** Encryption key environment variable for sensitive data */
  encryptionKeyEnvVar: z.string().default('ENTERPRISE_ENCRYPTION_KEY'),
});

// =============================================================================
// Type Exports
// =============================================================================

export type EnterpriseConfig = z.infer<typeof EnterpriseConfigSchema>;
export type StripeConfig = z.infer<typeof StripeConfigSchema>;
export type SSOConfig = z.infer<typeof SSOConfigSchema>;
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
export type UsageTrackingConfig = z.infer<typeof UsageTrackingConfigSchema>;
export type WhiteLabelModuleConfig = z.infer<typeof WhiteLabelConfigSchema>;
export type AuditLogConfig = z.infer<typeof AuditLogConfigSchema>;
export type TrialConfig = z.infer<typeof TrialConfigSchema>;
export type InvitationConfig = z.infer<typeof InvitationConfigSchema>;
export type APIKeyConfig = z.infer<typeof APIKeyConfigSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate enterprise configuration
 */
export function validateEnterpriseConfig(config: unknown): EnterpriseConfig {
  const result = EnterpriseConfigSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Invalid enterprise configuration: ${errors.join(', ')}`);
  }
  return result.data;
}

/**
 * Safe parse enterprise configuration
 */
export function safeParseEnterpriseConfig(config: unknown): {
  success: true;
  data: EnterpriseConfig;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = EnterpriseConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Get default enterprise configuration
 */
export function getDefaultEnterpriseConfig(): EnterpriseConfig {
  return EnterpriseConfigSchema.parse({});
}

/**
 * Merge configuration with defaults
 */
export function mergeWithDefaults(config: Partial<EnterpriseConfig>): EnterpriseConfig {
  return EnterpriseConfigSchema.parse(config);
}
