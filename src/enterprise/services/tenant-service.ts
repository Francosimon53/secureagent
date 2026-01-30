/**
 * Tenant Service
 *
 * Business logic for tenant/organization management
 */

import type {
  Tenant,
  TenantCreateInput,
  TenantUpdateInput,
  TenantStatus,
  TenantSettings,
  SubscriptionTier,
  EnterpriseUser,
} from '../types.js';
import type { TenantStore, TenantQueryOptions } from '../stores/tenant-store.js';
import type { EnterpriseUserStore } from '../stores/user-store.js';
import type { SubscriptionStore } from '../stores/subscription-store.js';
import type { EnterpriseAuditLogStore } from '../stores/audit-log-store.js';
import { EnterpriseError } from '../types.js';
import { ENTERPRISE_DEFAULTS, getTierLimits } from '../constants.js';

// =============================================================================
// Service Configuration
// =============================================================================

export interface TenantServiceConfig {
  /** Default trial duration in days */
  trialDurationDays: number;
  /** Alternative name: trialPeriodDays */
  trialPeriodDays?: number;
  /** Default tier for new tenants */
  defaultTier: SubscriptionTier;
  /** Whether trials are enabled */
  trialsEnabled: boolean;
  /** Maximum tenants allowed */
  maxTenants: number;
}

const DEFAULT_CONFIG: TenantServiceConfig = {
  trialDurationDays: ENTERPRISE_DEFAULTS.TRIAL_DURATION_DAYS,
  defaultTier: 'free',
  trialsEnabled: true,
  maxTenants: Number.MAX_SAFE_INTEGER,
};

/** Input for simplified createTenant API */
export interface SimpleTenantCreateInput {
  name: string;
  slug: string;
  ownerId: string;
  tier?: SubscriptionTier;
  startTrial?: boolean;
  settings?: Partial<TenantSettings>;
}

// =============================================================================
// Tenant Service
// =============================================================================

export class TenantService {
  private readonly config: TenantServiceConfig;
  private readonly userStore?: EnterpriseUserStore;

  constructor(
    private readonly tenantStore: TenantStore,
    private readonly subscriptionStore: SubscriptionStore,
    private readonly auditLogStore?: EnterpriseAuditLogStore,
    config?: Partial<TenantServiceConfig>,
    userStore?: EnterpriseUserStore
  ) {
    this.userStore = userStore;
    // Support both trialDurationDays and trialPeriodDays
    const trialDays = config?.trialPeriodDays ?? config?.trialDurationDays ?? DEFAULT_CONFIG.trialDurationDays;
    this.config = { ...DEFAULT_CONFIG, ...config, trialDurationDays: trialDays };
  }

  /**
   * Create a new tenant (simplified API - accepts object)
   */
  async createTenant(input: SimpleTenantCreateInput): Promise<Tenant>;
  /**
   * Create a new tenant with owner (full API - positional params)
   */
  async createTenant(
    name: string,
    slug: string,
    ownerEmail: string,
    ownerName: string,
    options?: {
      tier?: SubscriptionTier;
      startTrial?: boolean;
      settings?: Partial<TenantSettings>;
    }
  ): Promise<{ tenant: Tenant; owner: EnterpriseUser }>;
  async createTenant(
    nameOrInput: string | SimpleTenantCreateInput,
    slug?: string,
    ownerEmail?: string,
    ownerName?: string,
    options?: {
      tier?: SubscriptionTier;
      startTrial?: boolean;
      settings?: Partial<TenantSettings>;
    }
  ): Promise<Tenant | { tenant: Tenant; owner: EnterpriseUser }> {
    // Handle simplified object input
    if (typeof nameOrInput === 'object') {
      const input = nameOrInput;
      return this.createTenantSimple(input);
    }

    // Handle full API with positional params
    const name = nameOrInput;
    return this.createTenantWithOwner(name, slug!, ownerEmail!, ownerName!, options);
  }

  /**
   * Simplified tenant creation (no owner user creation)
   */
  private async createTenantSimple(input: SimpleTenantCreateInput): Promise<Tenant> {
    // Check tenant limit
    const currentCount = await this.tenantStore.countTenants({});
    if (currentCount >= this.config.maxTenants) {
      throw new EnterpriseError(
        'TENANT_NOT_FOUND',
        'Maximum tenant limit reached',
        403
      );
    }

    // Check slug availability
    if (!(await this.tenantStore.isSlugAvailable(input.slug))) {
      throw new EnterpriseError(
        'TENANT_NOT_FOUND',
        'Slug already exists',
        400
      );
    }

    // Validate slug format
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(input.slug)) {
      throw new EnterpriseError(
        'TENANT_NOT_FOUND',
        'Invalid slug format. Use lowercase letters, numbers, and hyphens only',
        400
      );
    }

    const now = Date.now();
    const tier = input.tier ?? this.config.defaultTier;

    const tenantInput: TenantCreateInput = {
      name: input.name,
      slug: input.slug,
      ownerId: input.ownerId,
      tier,
      status: 'active',
      settings: {
        timezone: input.settings?.timezone ?? ENTERPRISE_DEFAULTS.DEFAULT_TIMEZONE,
        language: input.settings?.language ?? ENTERPRISE_DEFAULTS.DEFAULT_LANGUAGE,
        enforceMFA: input.settings?.enforceMFA ?? false,
        allowedIPRanges: input.settings?.allowedIPRanges,
        sessionTimeoutMinutes: input.settings?.sessionTimeoutMinutes ?? ENTERPRISE_DEFAULTS.SESSION_TIMEOUT_MINUTES,
        dataResidency: input.settings?.dataResidency,
      },
    };

    const tenant = await this.tenantStore.createTenant(tenantInput);

    // Create initial subscription record
    await this.subscriptionStore.createSubscription({
      tenantId: tenant.id,
      tier: tenant.tier,
      status: 'active',
      interval: 'monthly',
      currentPeriodStart: now,
      currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
      cancelAtPeriodEnd: false,
    });

    return tenant;
  }

  /**
   * Full tenant creation with owner user
   */
  private async createTenantWithOwner(
    name: string,
    slug: string,
    ownerEmail: string,
    ownerName: string,
    options?: {
      tier?: SubscriptionTier;
      startTrial?: boolean;
      settings?: Partial<TenantSettings>;
    }
  ): Promise<{ tenant: Tenant; owner: EnterpriseUser }> {
    if (!this.userStore) {
      throw new EnterpriseError(
        'TENANT_NOT_FOUND',
        'User store not configured for owner creation',
        500
      );
    }

    // Check tenant limit
    const currentCount = await this.tenantStore.countTenants({});
    if (currentCount >= this.config.maxTenants) {
      throw new EnterpriseError(
        'TENANT_NOT_FOUND',
        'Maximum tenant limit reached',
        403
      );
    }

    // Check slug availability
    if (!(await this.tenantStore.isSlugAvailable(slug))) {
      throw new EnterpriseError(
        'TENANT_NOT_FOUND',
        'Slug is already taken',
        400
      );
    }

    // Validate slug format
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
      throw new EnterpriseError(
        'TENANT_NOT_FOUND',
        'Invalid slug format. Use lowercase letters, numbers, and hyphens only',
        400
      );
    }

    const now = Date.now();
    const tier = options?.tier ?? this.config.defaultTier;
    const startTrial = options?.startTrial ?? (this.config.trialsEnabled && tier === 'free');

    // Create tenant
    const tenantInput: TenantCreateInput = {
      name,
      slug,
      ownerId: '', // Will be updated after owner is created
      tier: startTrial ? 'pro' : tier, // Trial users get Pro tier
      status: 'active',
      settings: {
        timezone: options?.settings?.timezone ?? ENTERPRISE_DEFAULTS.DEFAULT_TIMEZONE,
        language: options?.settings?.language ?? ENTERPRISE_DEFAULTS.DEFAULT_LANGUAGE,
        enforceMFA: options?.settings?.enforceMFA ?? false,
        allowedIPRanges: options?.settings?.allowedIPRanges,
        sessionTimeoutMinutes: options?.settings?.sessionTimeoutMinutes ?? ENTERPRISE_DEFAULTS.SESSION_TIMEOUT_MINUTES,
        dataResidency: options?.settings?.dataResidency,
      },
      trialEndsAt: startTrial
        ? now + this.config.trialDurationDays * 24 * 60 * 60 * 1000
        : undefined,
    };

    const tenant = await this.tenantStore.createTenant(tenantInput);

    // Create owner user
    const owner = await this.userStore.createUser({
      tenantId: tenant.id,
      email: ownerEmail.toLowerCase(),
      name: ownerName,
      role: 'owner',
      status: 'active',
      mfaEnabled: false,
    });

    // Update tenant with owner ID
    await this.tenantStore.updateTenant(tenant.id, { ownerId: owner.id });
    tenant.ownerId = owner.id;

    // Create initial subscription record
    const periodStart = now;
    const periodEnd = startTrial
      ? tenant.trialEndsAt!
      : now + 30 * 24 * 60 * 60 * 1000; // 30 days

    await this.subscriptionStore.createSubscription({
      tenantId: tenant.id,
      tier: tenant.tier,
      status: startTrial ? 'trialing' : 'active',
      interval: 'monthly',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      trialStart: startTrial ? periodStart : undefined,
      trialEnd: startTrial ? periodEnd : undefined,
    });

    return { tenant, owner };
  }

  /**
   * Get tenant by ID
   */
  async getTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }
    return tenant;
  }

  /**
   * Get tenant by slug
   */
  async getTenantBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.tenantStore.getTenantBySlug(slug);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }
    return tenant;
  }

  /**
   * Update tenant
   */
  async updateTenant(tenantId: string, updates: TenantUpdateInput): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);

    // Validate slug if changing
    if (updates.slug && updates.slug !== tenant.slug) {
      if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(updates.slug)) {
        throw new EnterpriseError(
          'TENANT_NOT_FOUND',
          'Invalid slug format',
          400
        );
      }
      if (!(await this.tenantStore.isSlugAvailable(updates.slug, tenantId))) {
        throw new EnterpriseError(
          'TENANT_NOT_FOUND',
          'Slug is already taken',
          400
        );
      }
    }

    const updated = await this.tenantStore.updateTenant(tenantId, updates);
    if (!updated) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    return updated;
  }

  /**
   * Suspend tenant
   */
  async suspendTenant(tenantId: string, reason?: string): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);

    if (tenant.status === 'suspended') {
      return tenant;
    }

    const updated = await this.tenantStore.updateTenant(tenantId, {
      status: 'suspended',
    });

    if (!updated) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    return updated;
  }

  /**
   * Activate/reactivate tenant
   */
  async activateTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);

    if (tenant.status === 'active') {
      return tenant;
    }

    const updated = await this.tenantStore.updateTenant(tenantId, {
      status: 'active',
    });

    if (!updated) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    return updated;
  }

  /**
   * Delete tenant (soft delete - marks as deleted)
   */
  async deleteTenant(tenantId: string): Promise<void> {
    const tenant = await this.getTenant(tenantId);

    await this.tenantStore.updateTenant(tenantId, {
      status: 'deleted',
    });
  }

  /**
   * Hard delete tenant and all associated data
   */
  async hardDeleteTenant(tenantId: string): Promise<void> {
    await this.getTenant(tenantId);

    // Delete all users (if user store available)
    if (this.userStore) {
      const users = await this.userStore.listUsers({ tenantId });
      for (const user of users) {
        await this.userStore.deleteUser(user.id);
      }
    }

    // Delete subscription
    const subscription = await this.subscriptionStore.getSubscriptionByTenantId(tenantId);
    if (subscription) {
      await this.subscriptionStore.deleteSubscription(subscription.id);
    }

    // Delete tenant
    await this.tenantStore.deleteTenant(tenantId);
  }

  /**
   * List tenants
   */
  async listTenants(options?: TenantQueryOptions): Promise<Tenant[]> {
    return this.tenantStore.listTenants(options);
  }

  /**
   * Count tenants
   */
  async countTenants(options?: TenantQueryOptions): Promise<number> {
    return this.tenantStore.countTenants(options);
  }

  /**
   * Transfer ownership to another user
   */
  async transferOwnership(tenantId: string, newOwnerId: string): Promise<Tenant> {
    if (!this.userStore) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'User store not configured', 500);
    }

    const tenant = await this.getTenant(tenantId);
    const newOwner = await this.userStore.getUser(newOwnerId);

    if (!newOwner) {
      throw new EnterpriseError('USER_NOT_FOUND', 'New owner not found', 404);
    }

    if (newOwner.tenantId !== tenantId) {
      throw new EnterpriseError(
        'USER_NOT_FOUND',
        'New owner must be a member of the tenant',
        400
      );
    }

    // Demote old owner to admin
    if (tenant.ownerId !== newOwnerId) {
      await this.userStore.updateUser(tenant.ownerId, { role: 'admin' });
    }

    // Promote new owner
    await this.userStore.updateUser(newOwnerId, { role: 'owner' });

    // Update tenant
    const updated = await this.tenantStore.updateTenant(tenantId, {
      ownerId: newOwnerId,
    });

    if (!updated) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    return updated;
  }

  /**
   * Check if tenant can add more users
   */
  async canAddUsers(tenantId: string, count: number = 1): Promise<boolean> {
    const tenant = await this.getTenant(tenantId);
    const limits = getTierLimits(tenant.tier);
    // If no user store, assume check passes
    if (!this.userStore) {
      return true;
    }
    const currentUsers = await this.userStore.countUsers(tenantId);

    return currentUsers + count <= limits.maxUsers;
  }

  /**
   * Get tenant statistics
   */
  async getTenantStats(tenantId: string): Promise<{
    userCount: number;
    activeUserCount: number;
    tier: SubscriptionTier;
    status: TenantStatus;
    limits: ReturnType<typeof getTierLimits>;
  }> {
    const tenant = await this.getTenant(tenantId);
    let userCount = 0;
    let activeUserCount = 0;

    if (this.userStore) {
      const users = await this.userStore.listUsers({ tenantId });
      userCount = users.length;
      activeUserCount = users.filter(u => u.status === 'active').length;
    }

    return {
      userCount,
      activeUserCount,
      tier: tenant.tier,
      status: tenant.status,
      limits: getTierLimits(tenant.tier),
    };
  }

  /**
   * Update tenant settings
   */
  async updateSettings(tenantId: string, settings: Partial<TenantSettings>): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);

    const updatedSettings: TenantSettings = {
      ...tenant.settings,
      ...settings,
    };

    const updated = await this.tenantStore.updateTenant(tenantId, {
      settings: updatedSettings,
    });

    if (!updated) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    return updated;
  }
}

/**
 * Create tenant service
 *
 * Accepts either:
 * - (tenantStore, subscriptionStore, auditLogStore, config) - simplified API
 * - (tenantStore, userStore, subscriptionStore, config) - full API with user creation
 */
export function createTenantService(
  tenantStore: TenantStore,
  storeOrSubscription: SubscriptionStore | EnterpriseUserStore,
  storeOrAuditLog?: EnterpriseAuditLogStore | SubscriptionStore,
  config?: Partial<TenantServiceConfig>,
  userStore?: EnterpriseUserStore
): TenantService {
  // Detect which API is being used by checking if second param has createSubscription method
  if ('createSubscription' in storeOrSubscription) {
    // Simplified API: (tenantStore, subscriptionStore, auditLogStore, config)
    return new TenantService(
      tenantStore,
      storeOrSubscription as SubscriptionStore,
      storeOrAuditLog as EnterpriseAuditLogStore | undefined,
      config
    );
  } else {
    // Full API: (tenantStore, userStore, subscriptionStore, config)
    return new TenantService(
      tenantStore,
      storeOrAuditLog as SubscriptionStore,
      undefined, // no audit log in this API
      config,
      storeOrSubscription as EnterpriseUserStore
    );
  }
}
