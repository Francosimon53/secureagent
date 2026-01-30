/**
 * Enterprise Module Types
 *
 * Type definitions for multi-tenant enterprise features including:
 * - Subscription tiers and licensing
 * - Tenant/organization management
 * - Enterprise users and roles
 * - SSO configurations
 * - White-label branding
 * - Usage tracking and billing
 */

// =============================================================================
// Subscription & Licensing Types
// =============================================================================

/** Subscription tier levels */
export type SubscriptionTier = 'free' | 'pro' | 'business' | 'enterprise';

/** Subscription status */
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';

/** Billing interval */
export type BillingInterval = 'monthly' | 'yearly';

/** Subscription interval (alias for BillingInterval) */
export type SubscriptionInterval = BillingInterval;

/** Feature key type for tier gating */
export type TierFeature = keyof TierFeatures;

/** Feature limits per subscription tier */
export interface TierLimits {
  /** Maximum number of users */
  maxUsers: number;
  /** Maximum number of bots */
  maxBots: number;
  /** Maximum API calls per day */
  apiCallsPerDay: number;
  /** Maximum API calls per minute */
  apiCallsPerMinute: number;
  /** Storage limit in bytes */
  storageLimitBytes: number;
  /** Maximum audit log retention in days */
  auditLogRetentionDays: number;
}

/** Features enabled per subscription tier */
export interface TierFeatures {
  /** SSO authentication enabled */
  sso: boolean;
  /** White-label branding enabled */
  whiteLabel: boolean;
  /** Custom domain support */
  customDomain: boolean;
  /** Audit log access */
  auditLogs: boolean;
  /** API key management */
  apiKeys: boolean;
  /** Priority support */
  prioritySupport: boolean;
  /** Advanced analytics */
  advancedAnalytics: boolean;
  /** Custom integrations */
  customIntegrations: boolean;
  /** SLA guarantee */
  slaGuarantee: boolean;
}

/** Complete tier configuration */
export interface TierConfig {
  tier: SubscriptionTier;
  limits: TierLimits;
  features: TierFeatures;
  /** Price in cents per month */
  priceMonthly: number;
  /** Price in cents per year */
  priceYearly: number;
  /** Stripe price ID for monthly billing */
  stripePriceIdMonthly?: string;
  /** Stripe price ID for yearly billing */
  stripePriceIdYearly?: string;
}

// =============================================================================
// Tenant Types
// =============================================================================

/** Tenant (organization) status */
export type TenantStatus = 'active' | 'suspended' | 'pending' | 'deleted';

/** Tenant settings */
export interface TenantSettings {
  /** Default timezone */
  timezone: string;
  /** Default language */
  language: string;
  /** Whether to enforce MFA for all users */
  enforceMFA: boolean;
  /** Allowed IP ranges (CIDR notation) */
  allowedIPRanges?: string[];
  /** Custom session timeout in minutes */
  sessionTimeoutMinutes?: number;
  /** Data residency region */
  dataResidency?: string;
}

/** Tenant (organization) entity */
export interface Tenant {
  /** Unique tenant identifier */
  id: string;
  /** Display name */
  name: string;
  /** URL-safe identifier for subdomains */
  slug: string;
  /** ID of the tenant owner */
  ownerId: string;
  /** Current subscription tier */
  tier: SubscriptionTier;
  /** Tenant status */
  status: TenantStatus;
  /** Tenant-specific settings */
  settings: TenantSettings;
  /** Stripe customer ID */
  stripeCustomerId?: string;
  /** Stripe subscription ID */
  stripeSubscriptionId?: string;
  /** Trial end timestamp (ms) */
  trialEndsAt?: number;
  /** Created timestamp (ms) */
  createdAt: number;
  /** Updated timestamp (ms) */
  updatedAt: number;
}

/** Tenant creation input */
export type TenantCreateInput = Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'> & {
  /** Optional ID (generated if not provided) */
  id?: string;
};

/** Tenant update input */
export type TenantUpdateInput = Partial<Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>>;

// =============================================================================
// Enterprise User Types
// =============================================================================

/** Enterprise user role within a tenant */
export type EnterpriseRole = 'owner' | 'admin' | 'developer' | 'analyst' | 'member';

/** Enterprise user status */
export type EnterpriseUserStatus = 'active' | 'invited' | 'suspended' | 'deleted';

/** Enterprise user entity */
export interface EnterpriseUser {
  /** Unique user identifier */
  id: string;
  /** Tenant ID this user belongs to */
  tenantId: string;
  /** Email address */
  email: string;
  /** Display name */
  name: string;
  /** Role within the tenant */
  role: EnterpriseRole;
  /** User status */
  status: EnterpriseUserStatus;
  /** SSO provider used for authentication */
  ssoProvider?: string;
  /** SSO subject identifier */
  ssoSubjectId?: string;
  /** Whether MFA is enabled */
  mfaEnabled: boolean;
  /** Avatar URL */
  avatarUrl?: string;
  /** Job title */
  jobTitle?: string;
  /** Department */
  department?: string;
  /** Last login timestamp (ms) */
  lastLoginAt?: number;
  /** Invitation sent timestamp (ms) */
  invitedAt?: number;
  /** Invitation accepted timestamp (ms) */
  invitationAcceptedAt?: number;
  /** Created timestamp (ms) */
  createdAt: number;
  /** Updated timestamp (ms) */
  updatedAt: number;
}

/** User creation input */
export type EnterpriseUserCreateInput = Omit<EnterpriseUser, 'id' | 'createdAt' | 'updatedAt'>;

/** User update input */
export type EnterpriseUserUpdateInput = Partial<Omit<EnterpriseUser, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>;

/** User invitation */
export interface UserInvitation {
  /** Unique invitation identifier */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Email to invite */
  email: string;
  /** Assigned role */
  role: EnterpriseRole;
  /** Invitation token */
  token: string;
  /** Invited by user ID */
  invitedBy: string;
  /** Expires timestamp (ms) */
  expiresAt: number;
  /** Whether invitation has been accepted */
  accepted: boolean;
  /** Accepted timestamp (ms) */
  acceptedAt?: number;
  /** Created timestamp (ms) */
  createdAt: number;
}

// =============================================================================
// Subscription Types
// =============================================================================

/** Subscription entity */
export interface Subscription {
  /** Unique subscription identifier */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Current tier */
  tier: SubscriptionTier;
  /** Subscription status */
  status: SubscriptionStatus;
  /** Billing interval */
  interval: BillingInterval;
  /** Stripe subscription ID */
  stripeSubscriptionId?: string;
  /** Stripe price ID */
  stripePriceId?: string;
  /** Current period start (ms) */
  currentPeriodStart: number;
  /** Current period end (ms) */
  currentPeriodEnd: number;
  /** Whether subscription cancels at period end */
  cancelAtPeriodEnd: boolean;
  /** Canceled timestamp (ms) */
  canceledAt?: number;
  /** Trial start timestamp (ms) */
  trialStart?: number;
  /** Trial end timestamp (ms) */
  trialEnd?: number;
  /** Created timestamp (ms) */
  createdAt: number;
  /** Updated timestamp (ms) */
  updatedAt: number;
}

/** Subscription creation input */
export type SubscriptionCreateInput = Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>;

/** Subscription update input */
export type SubscriptionUpdateInput = Partial<Omit<Subscription, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>;

// =============================================================================
// Usage Tracking Types
// =============================================================================

/** Usage metric type */
export type UsageMetric =
  | 'api_calls'
  | 'storage_bytes'
  | 'users'
  | 'bots'
  | 'messages'
  | 'tokens_used'
  | 'bandwidth_bytes';

/** Usage record */
export interface UsageRecord {
  /** Unique record identifier */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** User ID (optional, for user-specific metrics) */
  userId?: string;
  /** Metric type */
  metric: UsageMetric;
  /** Metric value */
  value: number;
  /** Timestamp (ms) */
  timestamp: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/** Aggregated usage data */
export interface UsageAggregate {
  /** Tenant ID */
  tenantId: string;
  /** Metric type */
  metric: UsageMetric;
  /** Total value */
  total: number;
  /** Period start (ms) */
  periodStart: number;
  /** Period end (ms) */
  periodEnd: number;
  /** Count of records */
  count: number;
  /** Average value */
  avg: number;
  /** Maximum value */
  max: number;
  /** Minimum value */
  min: number;
}

/** Usage limit check result */
export interface UsageLimitResult {
  /** Metric being checked */
  metric: UsageMetric;
  /** Current usage */
  current: number;
  /** Limit for the tier */
  limit: number;
  /** Usage percentage (0-100) */
  percentage: number;
  /** Whether limit is exceeded */
  exceeded: boolean;
  /** Remaining quota */
  remaining: number;
}

// =============================================================================
// API Key Types
// =============================================================================

/** API key scope */
export type APIKeyScope =
  | 'read'
  | 'write'
  | 'admin'
  | 'bots:read'
  | 'bots:write'
  | 'users:read'
  | 'users:write'
  | 'analytics:read';

/** API key rate limit configuration */
export interface APIKeyRateLimit {
  /** Requests per minute */
  requestsPerMinute: number;
  /** Requests per day */
  requestsPerDay: number;
}

/** API key entity */
export interface APIKey {
  /** Unique key identifier */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** User ID who created the key */
  userId: string;
  /** Key name/description */
  name: string;
  /** Key prefix for display (first 8 chars) */
  keyPrefix: string;
  /** Hashed key value */
  keyHash: string;
  /** Granted scopes */
  scopes: APIKeyScope[];
  /** Rate limit overrides */
  rateLimit?: APIKeyRateLimit;
  /** Expiration timestamp (ms) */
  expiresAt?: number;
  /** Last used timestamp (ms) */
  lastUsedAt?: number;
  /** Created timestamp (ms) */
  createdAt: number;
  /** Revoked timestamp (ms) */
  revokedAt?: number;
}

/** API key creation input */
export type APIKeyCreateInput = Omit<APIKey, 'id' | 'keyPrefix' | 'keyHash' | 'createdAt' | 'lastUsedAt' | 'revokedAt'> & {
  /** Raw key value (only provided during creation) */
  rawKey?: string;
};

/** API key with raw value (returned only on creation) */
export interface APIKeyWithSecret extends APIKey {
  /** Raw key value (only returned on creation) */
  rawKey: string;
  /** Alias for rawKey (for backwards compatibility) */
  key: string;
}

// =============================================================================
// SSO Configuration Types
// =============================================================================

/** SSO provider type */
export type SSOProvider = 'google' | 'microsoft' | 'saml' | 'oidc';

/** Google SSO configuration */
export interface GoogleSSOConfig {
  /** Google OAuth client ID */
  clientId: string;
  /** Google OAuth client secret (encrypted) */
  clientSecret: string;
  /** Hosted domain restriction */
  hostedDomain?: string;
}

/** Microsoft SSO configuration */
export interface MicrosoftSSOConfig {
  /** Microsoft Entra ID tenant ID */
  tenantId: string;
  /** Application (client) ID */
  clientId: string;
  /** Client secret (encrypted) */
  clientSecret: string;
  /** Domain restriction */
  domain?: string;
}

/** SAML SSO configuration */
export interface SAMLConfig {
  /** Identity Provider Entity ID */
  idpEntityId: string;
  /** SSO URL */
  ssoUrl: string;
  /** Single Logout URL */
  sloUrl?: string;
  /** X.509 certificate for signature verification */
  certificate: string;
  /** Attribute mapping for user properties */
  attributeMapping: {
    email: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    groups?: string;
  };
  /** Signature algorithm */
  signatureAlgorithm?: 'sha256' | 'sha512';
  /** Whether to sign authentication requests */
  signRequests?: boolean;
}

/** OIDC configuration */
export interface OIDCConfig {
  /** Issuer URL */
  issuer: string;
  /** Client ID */
  clientId: string;
  /** Client secret (encrypted) */
  clientSecret: string;
  /** Authorization endpoint */
  authorizationEndpoint?: string;
  /** Token endpoint */
  tokenEndpoint?: string;
  /** User info endpoint */
  userInfoEndpoint?: string;
  /** Scopes to request */
  scopes?: string[];
}

/** SSO configuration entity */
export interface SSOConfiguration {
  /** Tenant ID (primary key) */
  tenantId: string;
  /** SSO provider type */
  provider: SSOProvider;
  /** Whether SSO is enabled */
  enabled: boolean;
  /** Provider-specific configuration */
  config: GoogleSSOConfig | MicrosoftSSOConfig | SAMLConfig | OIDCConfig;
  /** Default role for auto-provisioned users */
  defaultRole: EnterpriseRole;
  /** Whether to auto-provision users on first login */
  autoProvision: boolean;
  /** Whether SSO is required (no password login) */
  enforced: boolean;
  /** Domain verification status */
  domainVerified: boolean;
  /** Created timestamp (ms) */
  createdAt: number;
  /** Updated timestamp (ms) */
  updatedAt: number;
}

/** SSO configuration creation input */
export type SSOConfigCreateInput = Omit<SSOConfiguration, 'createdAt' | 'updatedAt'>;

/** SSO configuration update input */
export type SSOConfigUpdateInput = Partial<Omit<SSOConfiguration, 'tenantId' | 'createdAt' | 'updatedAt'>>;

/** SSO authentication result */
export interface SSOAuthResult {
  /** Whether authentication was successful */
  success: boolean;
  /** Authenticated user */
  user?: EnterpriseUser;
  /** Whether user was just provisioned */
  provisioned?: boolean;
  /** Error message if failed */
  error?: string;
  /** Error code */
  errorCode?: string;
}

// =============================================================================
// White Label Types
// =============================================================================

/** Branding configuration */
export interface BrandingConfig {
  /** Logo URL */
  logoUrl?: string;
  /** Favicon URL */
  faviconUrl?: string;
  /** Primary color (hex) */
  primaryColor: string;
  /** Accent color (hex) */
  accentColor: string;
  /** Background color (hex) */
  backgroundColor?: string;
  /** Text color (hex) */
  textColor?: string;
  /** Font family */
  fontFamily?: string;
  /** Custom CSS */
  customCss?: string;
}

/** White label configuration */
export interface WhiteLabelConfig {
  /** Tenant ID (primary key) */
  tenantId: string;
  /** Whether white-label is enabled */
  enabled: boolean;
  /** Branding configuration */
  branding: BrandingConfig;
  /** Custom domain */
  customDomain?: string;
  /** Custom domain verification status */
  domainVerified: boolean;
  /** SSL certificate status */
  sslStatus?: 'pending' | 'active' | 'failed';
  /** Email from name */
  emailFromName?: string;
  /** Email from address */
  emailFromAddress?: string;
  /** Support email */
  supportEmail?: string;
  /** Terms of service URL */
  termsUrl?: string;
  /** Privacy policy URL */
  privacyUrl?: string;
  /** Created timestamp (ms) */
  createdAt: number;
  /** Updated timestamp (ms) */
  updatedAt: number;
}

/** White label configuration creation input */
export type WhiteLabelCreateInput = Omit<WhiteLabelConfig, 'createdAt' | 'updatedAt' | 'domainVerified' | 'sslStatus'>;

/** White label configuration update input */
export type WhiteLabelUpdateInput = Partial<Omit<WhiteLabelConfig, 'tenantId' | 'createdAt' | 'updatedAt'>>;

// =============================================================================
// Audit Log Types
// =============================================================================

/** Enterprise audit event type */
export type EnterpriseAuditEventType =
  | 'tenant.created'
  | 'tenant.updated'
  | 'tenant.suspended'
  | 'tenant.deleted'
  | 'user.invited'
  | 'user.joined'
  | 'user.updated'
  | 'user.removed'
  | 'user.role_changed'
  | 'user.suspended'
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.upgraded'
  | 'subscription.downgraded'
  | 'subscription.canceled'
  | 'subscription.renewed'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'sso.configured'
  | 'sso.login'
  | 'sso.logout'
  | 'api_key.created'
  | 'api_key.revoked'
  | 'api_key.used'
  | 'settings.updated'
  | 'white_label.configured'
  | 'domain.verified'
  | 'security.mfa_enabled'
  | 'security.mfa_disabled';

/** Enterprise audit log entry */
export interface EnterpriseAuditLog {
  /** Unique log entry identifier */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** User ID who performed the action */
  userId?: string;
  /** Event type */
  eventType: EnterpriseAuditEventType;
  /** Resource type affected */
  resourceType?: string;
  /** Resource ID affected */
  resourceId?: string;
  /** Action performed */
  action: string;
  /** Event details */
  details?: Record<string, unknown>;
  /** IP address */
  ipAddress?: string;
  /** User agent */
  userAgent?: string;
  /** Timestamp (ms) */
  timestamp: number;
}

/** Audit log query options */
export interface AuditLogQueryOptions {
  /** Filter by event type */
  eventType?: EnterpriseAuditEventType;
  /** Filter by user ID */
  userId?: string;
  /** Filter by resource type */
  resourceType?: string;
  /** Filter by resource ID */
  resourceId?: string;
  /** Start timestamp */
  fromTimestamp?: number;
  /** End timestamp */
  toTimestamp?: number;
  /** Limit */
  limit?: number;
  /** Offset */
  offset?: number;
}

// =============================================================================
// Rate Limiting Types
// =============================================================================

/** Rate limit window type */
export type RateLimitWindow = 'second' | 'minute' | 'hour' | 'day';

/** Rate limit configuration */
export interface RateLimitConfig {
  /** Window type */
  window: RateLimitWindow;
  /** Maximum requests in window */
  maxRequests: number;
  /** Block duration in ms when limit exceeded */
  blockDurationMs?: number;
}

/** Rate limit result */
export interface RateLimitCheckResult {
  /** Whether request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Window reset timestamp (ms) */
  resetAt: number;
  /** Retry after (ms) if blocked */
  retryAfter?: number;
  /** Current request count */
  current: number;
  /** Limit */
  limit: number;
}

// =============================================================================
// Analytics Types
// =============================================================================

/** Analytics time range */
export type AnalyticsTimeRange = 'day' | 'week' | 'month' | 'quarter' | 'year';

/** Analytics data point */
export interface AnalyticsDataPoint {
  /** Timestamp (ms) */
  timestamp: number;
  /** Value */
  value: number;
  /** Label */
  label?: string;
}

/** Analytics series */
export interface AnalyticsSeries {
  /** Series name */
  name: string;
  /** Data points */
  data: AnalyticsDataPoint[];
  /** Total */
  total: number;
  /** Change percentage from previous period */
  changePercent?: number;
}

/** Dashboard analytics */
export interface DashboardAnalytics {
  /** Time range */
  timeRange: AnalyticsTimeRange;
  /** Period start (ms) */
  periodStart: number;
  /** Period end (ms) */
  periodEnd: number;
  /** Active users */
  activeUsers: AnalyticsSeries;
  /** API calls */
  apiCalls: AnalyticsSeries;
  /** Storage usage */
  storageUsage: AnalyticsSeries;
  /** Error rate */
  errorRate: AnalyticsSeries;
  /** Response time (avg ms) */
  responseTime: AnalyticsSeries;
}

/** Admin dashboard summary */
export interface AdminDashboardSummary {
  /** Total users */
  totalUsers: number;
  /** Active users (last 30 days) */
  activeUsers: number;
  /** Total bots */
  totalBots: number;
  /** Active bots */
  activeBots: number;
  /** API calls this period */
  apiCallsThisPeriod: number;
  /** Storage used (bytes) */
  storageUsed: number;
  /** Storage limit (bytes) */
  storageLimit: number;
  /** Current tier */
  tier: SubscriptionTier;
  /** Subscription status */
  subscriptionStatus: SubscriptionStatus;
  /** Days until renewal */
  daysUntilRenewal: number;
  /** Usage alerts */
  usageAlerts: UsageAlert[];
}

/** Usage alert */
export interface UsageAlert {
  /** Alert ID */
  id: string;
  /** Metric type */
  metric: UsageMetric;
  /** Current usage percentage */
  percentage: number;
  /** Severity */
  severity: 'warning' | 'critical';
  /** Message */
  message: string;
  /** Timestamp (ms) */
  timestamp: number;
}

// =============================================================================
// Billing Types
// =============================================================================

/** Invoice status */
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

/** Invoice line item */
export interface InvoiceLineItem {
  /** Description */
  description: string;
  /** Quantity */
  quantity: number;
  /** Unit price in cents */
  unitPriceCents: number;
  /** Total in cents */
  totalCents: number;
}

/** Invoice */
export interface Invoice {
  /** Stripe invoice ID */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Invoice number */
  number: string;
  /** Status */
  status: InvoiceStatus;
  /** Amount due in cents */
  amountDueCents: number;
  /** Amount paid in cents */
  amountPaidCents: number;
  /** Currency */
  currency: string;
  /** Line items */
  lineItems: InvoiceLineItem[];
  /** Due date (ms) */
  dueDate?: number;
  /** Paid date (ms) */
  paidDate?: number;
  /** Invoice URL */
  invoiceUrl?: string;
  /** PDF URL */
  pdfUrl?: string;
  /** Period start (ms) */
  periodStart: number;
  /** Period end (ms) */
  periodEnd: number;
  /** Created timestamp (ms) */
  createdAt: number;
}

/** Payment method */
export interface PaymentMethod {
  /** Payment method ID */
  id: string;
  /** Type (card, bank_account, etc.) */
  type: string;
  /** Card brand (if card) */
  brand?: string;
  /** Last 4 digits */
  last4: string;
  /** Expiration month */
  expMonth?: number;
  /** Expiration year */
  expYear?: number;
  /** Whether this is the default */
  isDefault: boolean;
}

// =============================================================================
// Tenant Context Types
// =============================================================================

/** Tenant context for request processing */
export interface TenantContext {
  /** Tenant ID */
  tenantId: string;
  /** Tenant slug */
  slug: string;
  /** Subscription tier */
  tier: SubscriptionTier;
  /** Tier limits */
  limits: TierLimits;
  /** Tier features */
  features: TierFeatures;
  /** Current user */
  user?: EnterpriseUser;
  /** Tenant settings */
  settings: TenantSettings;
}

// =============================================================================
// Stripe Webhook Types
// =============================================================================

/** Stripe webhook event types we handle */
export type StripeWebhookEventType =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'customer.created'
  | 'customer.updated'
  | 'payment_method.attached'
  | 'payment_method.detached';

/** Stripe webhook handler result */
export interface WebhookHandlerResult {
  /** Whether webhook was handled successfully */
  success: boolean;
  /** Event type processed */
  eventType: string;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Error Types
// =============================================================================

/** Enterprise error codes */
export type EnterpriseErrorCode =
  | 'TENANT_NOT_FOUND'
  | 'TENANT_SUSPENDED'
  | 'TENANT_REQUIRED'
  | 'USER_NOT_FOUND'
  | 'USER_ALREADY_EXISTS'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_INVALID'
  | 'SUBSCRIPTION_REQUIRED'
  | 'FEATURE_NOT_AVAILABLE'
  | 'USAGE_LIMIT_EXCEEDED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'API_KEY_INVALID'
  | 'API_KEY_EXPIRED'
  | 'API_KEY_REVOKED'
  | 'SSO_CONFIG_INVALID'
  | 'SSO_AUTH_FAILED'
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_FAILED'
  | 'INVALID_TIER'
  | 'DOWNGRADE_NOT_ALLOWED';

/** Enterprise error */
export class EnterpriseError extends Error {
  readonly code: EnterpriseErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;
  readonly timestamp: number;

  constructor(
    code: EnterpriseErrorCode,
    message: string,
    httpStatus: number = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'EnterpriseError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    this.timestamp = Date.now();
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

/** Type guard for EnterpriseError */
export function isEnterpriseError(error: unknown): error is EnterpriseError {
  return error instanceof EnterpriseError;
}
