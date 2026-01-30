/**
 * Enterprise Module
 *
 * Comprehensive enterprise features for SecureAgent including:
 * - Multi-tenant architecture with data isolation
 * - Tiered subscription management (free/pro/business/enterprise)
 * - Stripe billing integration with usage-based billing
 * - SSO with Google, Microsoft, and SAML providers
 * - White-label branding and custom domains
 * - Usage analytics and rate limiting
 * - Admin dashboard services
 */

import type { EventEmitter } from 'events';
import type {
  Tenant,
  EnterpriseUser,
  Subscription,
  SubscriptionTier,
  SubscriptionInterval,
  SSOConfiguration,
  UserInvitation,
} from './types.js';

// Re-export types (selectively to avoid conflicts)
export {
  // Subscription & Licensing Types
  SubscriptionTier,
  SubscriptionStatus,
  BillingInterval,
  SubscriptionInterval,
  TierFeature,
  TierLimits,
  TierFeatures,
  TierConfig,
  // Tenant Types
  TenantStatus,
  TenantSettings,
  Tenant,
  TenantCreateInput,
  TenantUpdateInput,
  // User Types
  EnterpriseRole,
  EnterpriseUserStatus,
  EnterpriseUser,
  EnterpriseUserCreateInput,
  EnterpriseUserUpdateInput,
  UserInvitation,
  // Subscription Types
  Subscription,
  SubscriptionCreateInput,
  SubscriptionUpdateInput,
  // Usage Types
  UsageMetric,
  UsageRecord,
  UsageAggregate,
  UsageLimitResult,
  // API Key Types
  APIKeyScope,
  APIKeyRateLimit,
  APIKey,
  APIKeyCreateInput,
  APIKeyWithSecret,
  // SSO Types
  SSOProvider,
  GoogleSSOConfig,
  MicrosoftSSOConfig,
  SAMLConfig,
  OIDCConfig,
  SSOConfiguration,
  SSOConfigCreateInput,
  SSOConfigUpdateInput,
  SSOAuthResult,
  // White Label Types
  BrandingConfig,
  WhiteLabelConfig,
  WhiteLabelCreateInput,
  WhiteLabelUpdateInput,
  // Audit Log Types
  EnterpriseAuditEventType,
  EnterpriseAuditLog,
  AuditLogQueryOptions,
  // Rate Limiting Types - use explicit RateLimitConfig export to avoid conflict
  RateLimitWindow,
  RateLimitCheckResult,
  // Analytics Types
  AnalyticsTimeRange,
  AnalyticsDataPoint,
  AnalyticsSeries,
  DashboardAnalytics,
  AdminDashboardSummary,
  UsageAlert,
  // Billing Types
  InvoiceStatus,
  InvoiceLineItem,
  Invoice,
  PaymentMethod,
  // Context Types
  TenantContext,
  // Webhook Types
  StripeWebhookEventType,
  WebhookHandlerResult,
  // Error Types
  EnterpriseErrorCode,
  EnterpriseError,
  isEnterpriseError,
} from './types.js';
// Export RateLimitConfig with an alias to avoid conflict
export { RateLimitConfig as EnterpriseRateLimitConfig } from './types.js';
export * from './constants.js';
export * from './config.js';

// Re-export stores (excluding types that conflict)
export {
  TenantStore,
  TenantQueryOptions,
  DatabaseTenantStore,
  InMemoryTenantStore,
  createTenantStore,
  EnterpriseUserStore,
  UserQueryOptions,
  DatabaseEnterpriseUserStore,
  InMemoryEnterpriseUserStore,
  createEnterpriseUserStore,
  SubscriptionStore,
  DatabaseSubscriptionStore,
  InMemorySubscriptionStore,
  createSubscriptionStore,
  UsageStore,
  UsageQueryOptions,
  DatabaseUsageStore,
  InMemoryUsageStore,
  createUsageStore,
  EnterpriseAuditLogStore,
  DatabaseEnterpriseAuditLogStore,
  InMemoryEnterpriseAuditLogStore,
  createEnterpriseAuditLogStore,
  APIKeyStore,
  APIKeyQueryOptions,
  DatabaseAPIKeyStore,
  InMemoryAPIKeyStore,
  createAPIKeyStore,
  SSOConfigStore,
  DatabaseSSOConfigStore,
  InMemorySSOConfigStore,
  createSSOConfigStore,
  WhiteLabelStore,
  DatabaseWhiteLabelStore,
  InMemoryWhiteLabelStore,
  createWhiteLabelStore,
  EnterpriseStores,
  createEnterpriseStores,
  initializeEnterpriseStores,
  DatabaseAdapter,
} from './stores/index.js';

// Re-export services (excluding types that conflict)
export {
  TenantService,
  TenantServiceConfig,
  createTenantService,
  UserManagementService,
  UserManagementServiceConfig,
  createUserManagementService,
  LicensingService,
  createLicensingService,
  BillingService,
  BillingServiceConfig,
  createBillingService,
  UsageService,
  UsageServiceConfig,
  createUsageService,
  RateLimitService,
  RateLimitServiceConfig,
  createRateLimitService,
  AnalyticsService,
  createAnalyticsService,
  AdminDashboardService,
  createAdminDashboardService,
  WhiteLabelService,
  WhiteLabelServiceConfig,
  createWhiteLabelService,
  SSOService,
  SSOServiceConfig,
  SSOProviderInterface,
  createSSOService,
} from './services/index.js';

// Re-export StripeClient from services (the authoritative source)
export type { StripeClient } from './services/billing-service.js';

// Re-export providers (excluding types that conflict)
export {
  BaseEnterpriseProvider,
  BaseProviderConfig,
  ProviderStatus,
  ProviderHealth,
  ProviderFactory,
  createStripeProvider,
  createStripeWebhookHandler,
  StripeProvider,
  StripeProviderConfig,
  StripeWebhookHandler,
  WebhookHandlerConfig,
  BaseSSOProvider,
  BaseSSOProviderConfig,
  SSOUserInfo,
  SSOTokens,
  SSOAuthState,
  createGoogleSSOProvider,
  GoogleSSOProvider,
  GoogleSSOProviderConfig,
  createMicrosoftSSOProvider,
  MicrosoftSSOProvider,
  MicrosoftSSOProviderConfig,
  createSAMLSSOProvider,
  SAMLSSOProvider,
  SAMLProviderConfig,
  SAMLAssertion,
  SAMLAuthnRequest,
} from './providers/index.js';

// Re-export middleware
export * from './middleware/index.js';

// Re-export monitoring
export * from './monitoring/index.js';

// =============================================================================
// Enterprise Manager Configuration
// =============================================================================

export interface EnterpriseManagerConfig {
  /** Base URL for callbacks and webhooks */
  baseUrl: string;
  /** Event emitter for enterprise events */
  eventEmitter?: EventEmitter;
  /** Stripe configuration */
  stripe?: {
    secretKey: string;
    publishableKey?: string;
    webhookSecret?: string;
    priceIds: {
      pro: { monthly: string; yearly: string };
      business: { monthly: string; yearly: string };
      enterprise?: { monthly?: string; yearly?: string };
    };
  };
  /** SSO configuration */
  sso?: {
    google?: {
      clientId: string;
      clientSecret: string;
    };
    microsoft?: {
      clientId: string;
      clientSecret: string;
      tenantId: string;
    };
  };
  /** Default trial period in days */
  trialPeriodDays?: number;
}

// =============================================================================
// Enterprise Manager
// =============================================================================

import {
  createEnterpriseStores,
  type EnterpriseStores,
  type DatabaseAdapter,
} from './stores/index.js';

import {
  createTenantService,
  createUserManagementService,
  createLicensingService,
  createBillingService,
  createUsageService,
  createRateLimitService,
  createAnalyticsService,
  createAdminDashboardService,
  createWhiteLabelService,
  createSSOService,
  type TenantService,
  type UserManagementService,
  type LicensingService,
  type BillingService,
  type UsageService,
  type RateLimitService,
  type AnalyticsService,
  type AdminDashboardService,
  type WhiteLabelService,
  type SSOService,
  type StripeClient,
} from './services/index.js';

import {
  createStripeProvider,
  createStripeWebhookHandler,
  createGoogleSSOProvider,
  createMicrosoftSSOProvider,
  type StripeProvider,
  type StripeWebhookHandler,
  type GoogleSSOProvider,
  type MicrosoftSSOProvider,
  type StripeClient as ProviderStripeClient,
} from './providers/index.js';

import {
  createTenantContextMiddleware,
  createTierGateMiddleware,
  createRateLimitMiddleware,
  type TenantContextMiddleware,
  type TierGateMiddleware,
  type RateLimitMiddleware,
} from './middleware/index.js';

import {
  createAlertEngine,
  type AlertEngine,
} from './monitoring/index.js';

/**
 * EnterpriseManager - Main orchestrator for enterprise features
 *
 * Provides a unified interface to all enterprise functionality including
 * tenant management, subscriptions, SSO, billing, and analytics.
 */
export class EnterpriseManager {
  private readonly config: EnterpriseManagerConfig;
  private readonly eventEmitter?: EventEmitter;

  // Stores
  public readonly stores: EnterpriseStores;

  // Services
  public readonly tenantService: TenantService;
  public readonly userManagementService: UserManagementService;
  public readonly licensingService: LicensingService;
  public readonly billingService: BillingService;
  public readonly usageService: UsageService;
  public readonly rateLimitService: RateLimitService;
  public readonly analyticsService: AnalyticsService;
  public readonly adminDashboardService: AdminDashboardService;
  public readonly whiteLabelService: WhiteLabelService;
  public readonly ssoService: SSOService;

  // Providers
  public readonly stripeProvider?: StripeProvider;
  public readonly stripeWebhookHandler?: StripeWebhookHandler;
  public readonly googleSSOProvider?: GoogleSSOProvider;
  public readonly microsoftSSOProvider?: MicrosoftSSOProvider;

  // Middleware
  public readonly tenantContextMiddleware: TenantContextMiddleware;
  public readonly tierGateMiddleware: TierGateMiddleware;
  public readonly rateLimitMiddleware: RateLimitMiddleware;

  // Monitoring
  public readonly alertEngine: AlertEngine;

  constructor(
    storesOrDb: EnterpriseStores | DatabaseAdapter | 'memory',
    config: EnterpriseManagerConfig
  ) {
    this.config = config;
    this.eventEmitter = config.eventEmitter;

    // Initialize stores
    if (typeof storesOrDb === 'string' && storesOrDb === 'memory') {
      this.stores = createEnterpriseStores('memory');
    } else if ('tenant' in storesOrDb && 'user' in storesOrDb) {
      this.stores = storesOrDb as EnterpriseStores;
    } else {
      this.stores = createEnterpriseStores('database', storesOrDb as DatabaseAdapter);
    }

    // Initialize licensing service first (needed by other services)
    this.licensingService = createLicensingService(
      this.stores.tenant,
      this.stores.subscription,
      this.stores.usage,
      this.stores.user
    );

    // Initialize tenant service
    this.tenantService = createTenantService(
      this.stores.tenant,
      this.stores.user,
      this.stores.subscription,
      {
        trialDurationDays: config.trialPeriodDays ?? 14,
        defaultTier: 'free',
        trialsEnabled: true,
        maxTenants: Number.MAX_SAFE_INTEGER,
      }
    );

    // Initialize user management service
    this.userManagementService = createUserManagementService(
      this.stores.user,
      this.stores.tenant,
      {
        invitationExpirationDays: 7,
        maxPendingInvitationsPerTenant: 100,
        sendInvitationEmails: true,
      }
    );

    // Initialize usage service
    this.usageService = createUsageService(
      this.stores.usage,
      this.stores.tenant,
      this.stores.subscription,
      {
        flushIntervalMs: 60000,
        batchSize: 100,
        warningThreshold: 80,
        criticalThreshold: 95,
      }
    );

    // Initialize rate limit service
    this.rateLimitService = createRateLimitService(
      this.stores.tenant,
      {
        defaultBlockDurationMs: 60000,
        keyPrefix: 'enterprise:ratelimit:',
      }
    );

    // Initialize analytics service
    this.analyticsService = createAnalyticsService(
      this.stores.usage,
      this.stores.user,
      this.stores.subscription,
      this.stores.auditLog
    );

    // Initialize admin dashboard service
    this.adminDashboardService = createAdminDashboardService(
      this.stores.tenant,
      this.stores.user,
      this.stores.subscription,
      this.stores.usage,
      this.stores.auditLog
    );

    // Initialize white-label service
    this.whiteLabelService = createWhiteLabelService(
      this.stores.whiteLabel,
      this.stores.tenant,
      this.licensingService
    );

    // Initialize SSO service
    this.ssoService = createSSOService(
      this.stores.ssoConfig,
      this.stores.user,
      this.stores.tenant,
      this.licensingService,
      {
        baseUrl: config.baseUrl,
        defaultRole: 'member',
        defaultAutoProvision: true,
        sessionDurationMinutes: 60,
      }
    );

    // Initialize billing service (with optional Stripe integration)
    this.billingService = createBillingService(
      this.stores.subscription,
      this.stores.tenant,
      this.stores.auditLog,
      undefined, // stripeClient - set later via setStripeClient
      {
        stripeEnabled: !!config.stripe,
        stripePriceIds: config.stripe
          ? {
              proMonthly: config.stripe.priceIds.pro.monthly,
              proYearly: config.stripe.priceIds.pro.yearly,
              businessMonthly: config.stripe.priceIds.business.monthly,
              businessYearly: config.stripe.priceIds.business.yearly,
            }
          : undefined,
      }
    );

    // Initialize Stripe provider if configured
    if (config.stripe) {
      this.stripeProvider = createStripeProvider(
        {
          name: 'stripe',
          enabled: true,
          secretKey: config.stripe.secretKey,
          publishableKey: config.stripe.publishableKey,
          webhookSecret: config.stripe.webhookSecret,
          priceIds: config.stripe.priceIds,
          trialPeriodDays: config.trialPeriodDays,
        },
        this.eventEmitter
      );

      // Create webhook handler
      this.stripeWebhookHandler = createStripeWebhookHandler({
        stripeProvider: this.stripeProvider,
        subscriptionStore: this.stores.subscription,
        tenantStore: this.stores.tenant,
        auditLogStore: this.stores.auditLog,
        eventEmitter: this.eventEmitter,
      });
    }

    // Initialize SSO providers if configured
    if (config.sso?.google) {
      this.googleSSOProvider = createGoogleSSOProvider(
        {
          name: 'google-sso',
          enabled: true,
          providerType: 'google',
          clientId: config.sso.google.clientId,
          clientSecret: config.sso.google.clientSecret,
          redirectUri: `${config.baseUrl}/api/enterprise/sso/callback/google`,
        },
        this.eventEmitter
      );
      this.ssoService.registerProvider('google', this.googleSSOProvider);
    }

    if (config.sso?.microsoft) {
      this.microsoftSSOProvider = createMicrosoftSSOProvider(
        {
          name: 'microsoft-sso',
          enabled: true,
          providerType: 'microsoft',
          clientId: config.sso.microsoft.clientId,
          clientSecret: config.sso.microsoft.clientSecret,
          tenantId: config.sso.microsoft.tenantId,
          redirectUri: `${config.baseUrl}/api/enterprise/sso/callback/microsoft`,
        },
        this.eventEmitter
      );
      this.ssoService.registerProvider('microsoft', this.microsoftSSOProvider);
    }

    // Initialize middleware
    this.tenantContextMiddleware = createTenantContextMiddleware(
      this.stores.tenant,
      {
        requireTenant: false,
        allowSubdomain: true,
        baseDomain: new URL(config.baseUrl).hostname,
      }
    );

    this.tierGateMiddleware = createTierGateMiddleware();

    this.rateLimitMiddleware = createRateLimitMiddleware({
      rateLimitService: this.rateLimitService,
      skipPaths: ['/health', '/api/health'],
    });

    // Initialize monitoring
    this.alertEngine = createAlertEngine(
      this.stores.usage,
      this.stores.tenant,
      this.stores.subscription,
      { eventEmitter: this.eventEmitter }
    );
  }

  // =============================================================================
  // Tenant Operations
  // =============================================================================

  /**
   * Create a new tenant (organization) - simplified API
   */
  async createTenant(input: {
    name: string;
    slug: string;
    ownerId: string;
    tier?: SubscriptionTier;
  }): Promise<Tenant>;
  /**
   * Create a new tenant (organization) with owner - full API
   */
  async createTenant(
    name: string,
    slug: string,
    ownerEmail: string,
    ownerName: string,
    options?: {
      tier?: SubscriptionTier;
      startTrial?: boolean;
    }
  ): Promise<{ tenant: Tenant; owner: EnterpriseUser }>;
  async createTenant(
    nameOrInput: string | { name: string; slug: string; ownerId: string; tier?: SubscriptionTier },
    slug?: string,
    ownerEmail?: string,
    ownerName?: string,
    options?: {
      tier?: SubscriptionTier;
      startTrial?: boolean;
    }
  ): Promise<Tenant | { tenant: Tenant; owner: EnterpriseUser }> {
    if (typeof nameOrInput === 'object') {
      return this.tenantService.createTenant(nameOrInput);
    }
    return this.tenantService.createTenant(nameOrInput, slug!, ownerEmail!, ownerName!, options);
  }

  /**
   * Get a tenant by ID
   */
  async getTenant(tenantId: string): Promise<Tenant> {
    return this.tenantService.getTenant(tenantId);
  }

  /**
   * Get a tenant by slug
   */
  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    return this.tenantService.getTenantBySlug(slug);
  }

  // =============================================================================
  // Subscription Operations
  // =============================================================================

  /**
   * Create a subscription for a tenant
   */
  async createSubscription(
    tenantId: string,
    tier: SubscriptionTier,
    interval: SubscriptionInterval = 'monthly'
  ): Promise<Subscription> {
    return this.billingService.createSubscription(tenantId, tier, interval);
  }

  /**
   * Upgrade a subscription
   */
  async upgradeSubscription(
    tenantId: string,
    newTier: SubscriptionTier
  ): Promise<Subscription> {
    return this.billingService.upgradeSubscription(tenantId, newTier);
  }

  /**
   * Get subscription for a tenant
   */
  async getSubscription(tenantId: string): Promise<Subscription | null> {
    return this.stores.subscription.getSubscriptionByTenantId(tenantId);
  }

  // =============================================================================
  // User Operations
  // =============================================================================

  /**
   * Invite a user to a tenant
   * @param tenantId - The tenant ID
   * @param email - The email to invite
   * @param role - The role to assign (optional, defaults to 'member')
   * @returns Object with user and invitationToken
   */
  async inviteUser(
    tenantId: string,
    email: string,
    role: 'member' | 'analyst' | 'developer' | 'admin' = 'member'
  ): Promise<{ user: EnterpriseUser; invitationToken: string }> {
    // Create user with invited status
    const user = await this.stores.user.createUser({
      tenantId,
      email: email.toLowerCase(),
      name: '',
      role,
      status: 'invited',
      mfaEnabled: false,
    });

    // Create invitation token
    const invitation = await this.stores.user.createInvitation({
      tenantId,
      email: email.toLowerCase(),
      role,
      token: `inv_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      invitedBy: 'system',
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      accepted: false,
    });

    return { user, invitationToken: invitation.token };
  }

  /**
   * Accept an invitation
   * @param invitationToken - The invitation token
   * @param name - The user's name
   */
  async acceptInvitation(
    invitationToken: string,
    name: string
  ): Promise<EnterpriseUser> {
    // Accept the invitation
    const invitation = await this.stores.user.acceptInvitation(invitationToken);
    if (!invitation) {
      throw new Error('Invalid or already accepted invitation');
    }

    // Find the user by email in that tenant and update them
    const user = await this.stores.user.getUserByEmail(invitation.tenantId, invitation.email);
    if (!user) {
      throw new Error('User not found for invitation');
    }

    const updatedUser = await this.stores.user.updateUser(user.id, {
      name,
      status: 'active',
      invitationAcceptedAt: Date.now(),
    });

    return updatedUser!;
  }

  /**
   * Get users for a tenant
   */
  async getUsers(tenantId: string): Promise<EnterpriseUser[]> {
    return this.stores.user.listUsers({ tenantId });
  }

  // =============================================================================
  // SSO Operations
  // =============================================================================

  /**
   * Configure SSO for a tenant
   */
  async configureSso(
    tenantId: string,
    provider: 'google' | 'microsoft' | 'saml',
    config: Record<string, unknown>
  ): Promise<SSOConfiguration> {
    return this.ssoService.configureSSOConfig(tenantId, provider, config as any);
  }

  /**
   * Get SSO authorization URL
   */
  async getSsoAuthUrl(tenantId: string, state: string): Promise<string> {
    return this.ssoService.getAuthorizationUrl(tenantId, state);
  }

  // =============================================================================
  // Analytics & Dashboard
  // =============================================================================

  /**
   * Get admin dashboard summary
   */
  async getDashboardSummary(tenantId: string) {
    return this.adminDashboardService.getDashboardSummary(tenantId);
  }

  /**
   * Get usage analytics
   */
  async getAnalytics(
    tenantId: string,
    timeRange: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'month'
  ) {
    return this.analyticsService.getDashboardAnalytics(tenantId, timeRange);
  }

  // =============================================================================
  // Lifecycle
  // =============================================================================

  /**
   * Initialize all providers
   */
  async initialize(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    if (this.stripeProvider) {
      initPromises.push(this.stripeProvider.initialize());
    }
    if (this.googleSSOProvider) {
      initPromises.push(this.googleSSOProvider.initialize());
    }
    if (this.microsoftSSOProvider) {
      initPromises.push(this.microsoftSSOProvider.initialize());
    }

    await Promise.all(initPromises);

    // Start alert engine
    this.alertEngine.start();
  }

  /**
   * Shutdown all providers
   */
  async shutdown(): Promise<void> {
    this.alertEngine.stop();

    const shutdownPromises: Promise<void>[] = [];

    if (this.stripeProvider) {
      shutdownPromises.push(this.stripeProvider.shutdown());
    }
    if (this.googleSSOProvider) {
      shutdownPromises.push(this.googleSSOProvider.shutdown());
    }
    if (this.microsoftSSOProvider) {
      shutdownPromises.push(this.microsoftSSOProvider.shutdown());
    }

    await Promise.all(shutdownPromises);
  }

  /**
   * Set the Stripe client (for dependency injection)
   */
  setStripeClient(client: ProviderStripeClient): void {
    if (this.stripeProvider) {
      this.stripeProvider.setClient(client);
    }
  }
}

/**
 * Create an enterprise manager instance
 */
export function createEnterpriseManager(
  storesOrDb: EnterpriseStores | DatabaseAdapter | 'memory',
  config: EnterpriseManagerConfig
): EnterpriseManager {
  return new EnterpriseManager(storesOrDb, config);
}
