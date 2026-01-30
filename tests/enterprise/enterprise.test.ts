/**
 * Enterprise Module Tests
 *
 * Comprehensive tests for enterprise features including:
 * - Multi-tenant architecture
 * - Subscription management
 * - SSO integration
 * - Rate limiting
 * - Usage tracking
 * - White-label configuration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  // Manager
  EnterpriseManager,
  createEnterpriseManager,
  // Types
  type Tenant,
  type EnterpriseUser,
  type Subscription,
  type SubscriptionTier,
  // Constants
  getTierLimits,
  getTierFeatures,
  hasFeature,
  compareTiers,
  canManageRole,
  ENTERPRISE_DEFAULTS,
  // Stores
  createEnterpriseStores,
  // Services
  createTenantService,
  createUserManagementService,
  createLicensingService,
  createRateLimitService,
  // Middleware
  createTenantContextMiddleware,
  createTierGateMiddleware,
} from '../../src/enterprise/index.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    query: {},
    path: '/api/test',
    tenantContext: undefined,
    ...overrides,
  };
}

function createMockResponse() {
  let statusCode = 200;
  let body: unknown = null;

  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      body = data;
    },
    getStatus: () => statusCode,
    getBody: () => body,
    set: (_headers: Record<string, string>) => {},
    setHeader: (_name: string, _value: string) => {},
  };
}

// =============================================================================
// Tier Configuration Tests
// =============================================================================

describe('Enterprise Tier Configuration', () => {
  describe('getTierLimits', () => {
    it('should return correct limits for free tier', () => {
      const limits = getTierLimits('free');
      expect(limits.maxUsers).toBe(3);
      expect(limits.maxBots).toBe(1);
      expect(limits.apiCallsPerDay).toBe(1000);
      expect(limits.apiCallsPerMinute).toBe(10);
    });

    it('should return correct limits for pro tier', () => {
      const limits = getTierLimits('pro');
      expect(limits.maxUsers).toBe(10);
      expect(limits.maxBots).toBe(5);
      expect(limits.apiCallsPerDay).toBe(50000);
    });

    it('should return correct limits for business tier', () => {
      const limits = getTierLimits('business');
      expect(limits.maxUsers).toBe(50);
      expect(limits.maxBots).toBe(20);
      expect(limits.apiCallsPerDay).toBe(500000);
    });

    it('should return unlimited for enterprise tier', () => {
      const limits = getTierLimits('enterprise');
      expect(limits.maxUsers).toBe(Number.MAX_SAFE_INTEGER);
      expect(limits.maxBots).toBe(Number.MAX_SAFE_INTEGER);
      expect(limits.apiCallsPerDay).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('getTierFeatures', () => {
    it('should deny SSO for free and pro tiers', () => {
      expect(getTierFeatures('free').sso).toBe(false);
      expect(getTierFeatures('pro').sso).toBe(false);
    });

    it('should allow SSO for business and enterprise tiers', () => {
      expect(getTierFeatures('business').sso).toBe(true);
      expect(getTierFeatures('enterprise').sso).toBe(true);
    });

    it('should only allow white label for enterprise tier', () => {
      expect(getTierFeatures('free').whiteLabel).toBe(false);
      expect(getTierFeatures('pro').whiteLabel).toBe(false);
      expect(getTierFeatures('business').whiteLabel).toBe(false);
      expect(getTierFeatures('enterprise').whiteLabel).toBe(true);
    });
  });

  describe('hasFeature', () => {
    it('should correctly check feature availability', () => {
      expect(hasFeature('free', 'auditLogs')).toBe(false);
      expect(hasFeature('pro', 'auditLogs')).toBe(true);
      expect(hasFeature('business', 'sso')).toBe(true);
      expect(hasFeature('enterprise', 'whiteLabel')).toBe(true);
    });
  });

  describe('compareTiers', () => {
    it('should correctly compare tier levels', () => {
      expect(compareTiers('pro', 'free')).toBeGreaterThan(0);
      expect(compareTiers('free', 'pro')).toBeLessThan(0);
      expect(compareTiers('business', 'business')).toBe(0);
      expect(compareTiers('enterprise', 'free')).toBeGreaterThan(0);
    });
  });

  describe('canManageRole', () => {
    it('should allow owner to manage all roles', () => {
      expect(canManageRole('owner', 'admin')).toBe(true);
      expect(canManageRole('owner', 'developer')).toBe(true);
      expect(canManageRole('owner', 'member')).toBe(true);
    });

    it('should not allow member to manage any role', () => {
      expect(canManageRole('member', 'admin')).toBe(false);
      expect(canManageRole('member', 'developer')).toBe(false);
      expect(canManageRole('member', 'analyst')).toBe(false);
    });

    it('should not allow self-management', () => {
      expect(canManageRole('admin', 'admin')).toBe(false);
      expect(canManageRole('developer', 'developer')).toBe(false);
    });
  });
});

// =============================================================================
// Store Tests
// =============================================================================

describe('Enterprise Stores', () => {
  describe('In-Memory Stores', () => {
    let stores: ReturnType<typeof createEnterpriseStores>;

    beforeEach(() => {
      stores = createEnterpriseStores('memory');
    });

    describe('TenantStore', () => {
      it('should create and retrieve a tenant', async () => {
        const tenant = await stores.tenant.createTenant({
          name: 'Test Company',
          slug: 'test-company',
          ownerId: 'user-123',
          tier: 'pro',
          status: 'active',
          settings: {},
        });

        expect(tenant.id).toBeDefined();
        expect(tenant.name).toBe('Test Company');
        expect(tenant.slug).toBe('test-company');
        expect(tenant.tier).toBe('pro');

        const retrieved = await stores.tenant.getTenant(tenant.id);
        expect(retrieved).toEqual(tenant);
      });

      it('should find tenant by slug', async () => {
        const tenant = await stores.tenant.createTenant({
          name: 'Test Company',
          slug: 'test-slug',
          ownerId: 'user-123',
          tier: 'free',
          status: 'active',
          settings: {},
        });

        const found = await stores.tenant.getTenantBySlug('test-slug');
        expect(found?.id).toBe(tenant.id);
      });

      it('should update tenant', async () => {
        const tenant = await stores.tenant.createTenant({
          name: 'Original Name',
          slug: 'original',
          ownerId: 'user-123',
          tier: 'free',
          status: 'active',
          settings: {},
        });

        const updated = await stores.tenant.updateTenant(tenant.id, {
          name: 'Updated Name',
          tier: 'pro',
        });

        expect(updated?.name).toBe('Updated Name');
        expect(updated?.tier).toBe('pro');
      });

      it('should list tenants with filters', async () => {
        await stores.tenant.createTenant({
          name: 'Active Pro',
          slug: 'active-pro',
          ownerId: 'user-1',
          tier: 'pro',
          status: 'active',
          settings: {},
        });

        await stores.tenant.createTenant({
          name: 'Suspended Free',
          slug: 'suspended-free',
          ownerId: 'user-2',
          tier: 'free',
          status: 'suspended',
          settings: {},
        });

        const activeOnly = await stores.tenant.listTenants({ status: 'active' });
        expect(activeOnly.length).toBe(1);
        expect(activeOnly[0].name).toBe('Active Pro');

        const proOnly = await stores.tenant.listTenants({ tier: 'pro' });
        expect(proOnly.length).toBe(1);
        expect(proOnly[0].name).toBe('Active Pro');
      });
    });

    describe('EnterpriseUserStore', () => {
      it('should create and retrieve a user', async () => {
        const user = await stores.user.createUser({
          tenantId: 'tenant-123',
          email: 'user@example.com',
          name: 'Test User',
          role: 'developer',
          status: 'active',
          mfaEnabled: false,
        });

        expect(user.id).toBeDefined();
        expect(user.email).toBe('user@example.com');
        expect(user.role).toBe('developer');

        const retrieved = await stores.user.getUser(user.id);
        expect(retrieved).toEqual(user);
      });

      it('should find user by email within tenant', async () => {
        const user = await stores.user.createUser({
          tenantId: 'tenant-123',
          email: 'findme@example.com',
          name: 'Find Me',
          role: 'member',
          status: 'active',
          mfaEnabled: false,
        });

        const found = await stores.user.getUserByEmail('tenant-123', 'findme@example.com');
        expect(found?.id).toBe(user.id);

        // Should not find in different tenant
        const notFound = await stores.user.getUserByEmail('other-tenant', 'findme@example.com');
        expect(notFound).toBeNull();
      });

      it('should count users in tenant', async () => {
        const tenantId = 'count-tenant';

        await stores.user.createUser({
          tenantId,
          email: 'user1@example.com',
          name: 'User 1',
          role: 'member',
          status: 'active',
          mfaEnabled: false,
        });

        await stores.user.createUser({
          tenantId,
          email: 'user2@example.com',
          name: 'User 2',
          role: 'admin',
          status: 'active',
          mfaEnabled: false,
        });

        const count = await stores.user.countUsers(tenantId);
        expect(count).toBe(2);
      });
    });

    describe('SubscriptionStore', () => {
      it('should create and retrieve subscription', async () => {
        const subscription = await stores.subscription.upsertSubscription({
          id: 'sub-123',
          tenantId: 'tenant-123',
          tier: 'pro',
          status: 'active',
          interval: 'monthly',
          currentPeriodStart: Date.now(),
          currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
          cancelAtPeriodEnd: false,
        });

        expect(subscription.id).toBe('sub-123');
        expect(subscription.tier).toBe('pro');

        const byTenant = await stores.subscription.getSubscriptionByTenantId('tenant-123');
        expect(byTenant?.id).toBe('sub-123');
      });

      it('should update subscription', async () => {
        await stores.subscription.upsertSubscription({
          id: 'sub-to-update',
          tenantId: 'tenant-update',
          tier: 'pro',
          status: 'active',
          interval: 'monthly',
          currentPeriodStart: Date.now(),
          currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
          cancelAtPeriodEnd: false,
        });

        const updated = await stores.subscription.updateSubscription('sub-to-update', {
          tier: 'business',
          cancelAtPeriodEnd: true,
        });

        expect(updated?.tier).toBe('business');
        expect(updated?.cancelAtPeriodEnd).toBe(true);
      });
    });

    describe('UsageStore', () => {
      it('should record and aggregate usage', async () => {
        const tenantId = 'usage-tenant';
        const now = Date.now();

        await stores.usage.recordUsage({
          tenantId,
          metric: 'api_calls',
          value: 100,
          timestamp: now,
        });

        await stores.usage.recordUsage({
          tenantId,
          metric: 'api_calls',
          value: 50,
          timestamp: now + 1000,
        });

        const count = await stores.usage.getUsageCount(
          tenantId,
          'api_calls',
          now - 1000,
          now + 10000
        );

        expect(count).toBe(150);
      });

      it('should get usage aggregates', async () => {
        const tenantId = 'agg-tenant';
        const now = Date.now();

        await stores.usage.recordUsage({
          tenantId,
          metric: 'storage_bytes',
          value: 1000,
          timestamp: now,
        });

        await stores.usage.recordUsage({
          tenantId,
          metric: 'storage_bytes',
          value: 2000,
          timestamp: now + 1000,
        });

        const aggregate = await stores.usage.getUsageAggregate(
          tenantId,
          'storage_bytes',
          now - 1000,
          now + 10000
        );

        expect(aggregate.total).toBe(3000);
        expect(aggregate.count).toBe(2);
        expect(aggregate.avg).toBe(1500);
        expect(aggregate.max).toBe(2000);
        expect(aggregate.min).toBe(1000);
      });
    });

    describe('APIKeyStore', () => {
      it('should create and validate API keys', async () => {
        const key = await stores.apiKey.createAPIKey({
          tenantId: 'api-tenant',
          userId: 'user-123',
          name: 'Test Key',
          scopes: ['read:bots', 'write:bots'],
        });

        expect(key.id).toBeDefined();
        expect(key.key).toBeDefined();
        expect(key.keyPrefix.length).toBe(8);

        // Validate by hash
        const validated = await stores.apiKey.getAPIKeyByHash(key.keyHash);
        expect(validated?.id).toBe(key.id);
      });

      it('should list active keys for tenant', async () => {
        const tenantId = 'list-keys-tenant';

        await stores.apiKey.createAPIKey({
          tenantId,
          userId: 'user-1',
          name: 'Key 1',
          scopes: ['read:bots'],
        });

        await stores.apiKey.createAPIKey({
          tenantId,
          userId: 'user-2',
          name: 'Key 2',
          scopes: ['read:bots'],
        });

        const keys = await stores.apiKey.listAPIKeys(tenantId);
        expect(keys.length).toBe(2);
      });

      it('should revoke API keys', async () => {
        const key = await stores.apiKey.createAPIKey({
          tenantId: 'revoke-tenant',
          userId: 'user-123',
          name: 'To Revoke',
          scopes: ['read:bots'],
        });

        const result = await stores.apiKey.revokeAPIKey(key.id);
        expect(result).toBe(true);

        const revoked = await stores.apiKey.getAPIKey(key.id);
        expect(revoked?.revokedAt).toBeDefined();
      });
    });
  });
});

// =============================================================================
// Service Tests
// =============================================================================

describe('Enterprise Services', () => {
  let stores: ReturnType<typeof createEnterpriseStores>;

  beforeEach(() => {
    stores = createEnterpriseStores('memory');
  });

  describe('TenantService', () => {
    it('should create tenant with default settings', async () => {
      const tenantService = createTenantService(
        stores.tenant,
        stores.subscription,
        stores.auditLog,
        { defaultTier: 'free', trialPeriodDays: 14 }
      );

      const tenant = await tenantService.createTenant({
        name: 'New Company',
        slug: 'new-company',
        ownerId: 'user-123',
      });

      expect(tenant.name).toBe('New Company');
      expect(tenant.tier).toBe('free');
      expect(tenant.status).toBe('active');
    });

    it('should validate unique slug', async () => {
      const tenantService = createTenantService(
        stores.tenant,
        stores.subscription,
        stores.auditLog
      );

      await tenantService.createTenant({
        name: 'First',
        slug: 'unique-slug',
        ownerId: 'user-1',
      });

      await expect(
        tenantService.createTenant({
          name: 'Second',
          slug: 'unique-slug',
          ownerId: 'user-2',
        })
      ).rejects.toThrow('already exists');
    });

    it('should suspend and activate tenant', async () => {
      const tenantService = createTenantService(
        stores.tenant,
        stores.subscription,
        stores.auditLog
      );

      const tenant = await tenantService.createTenant({
        name: 'Suspend Test',
        slug: 'suspend-test',
        ownerId: 'user-123',
      });

      const suspended = await tenantService.suspendTenant(tenant.id, 'Non-payment');
      expect(suspended?.status).toBe('suspended');

      const activated = await tenantService.activateTenant(tenant.id);
      expect(activated?.status).toBe('active');
    });
  });

  describe('LicensingService', () => {
    it('should check feature availability', async () => {
      const licensingService = createLicensingService(stores.subscription, stores.tenant);

      // Create a pro tenant with explicit ID
      const tenantId = 'pro-tenant-id';
      await stores.tenant.createTenant({
        id: tenantId,
        name: 'Pro Tenant',
        slug: 'pro-tenant',
        ownerId: 'user-123',
        tier: 'pro',
        status: 'active',
        settings: {},
      });

      await stores.subscription.upsertSubscription({
        id: 'sub-pro',
        tenantId: tenantId,
        tier: 'pro',
        status: 'active',
        interval: 'monthly',
        currentPeriodStart: Date.now(),
        currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
      });

      // Pro tier has audit logs but not SSO
      expect(await licensingService.hasFeature(tenantId, 'auditLogs')).toBe(true);
      expect(await licensingService.hasFeature(tenantId, 'sso')).toBe(false);
    });

    it('should check usage limits', async () => {
      // Use full LicensingService with user store to test canAddUsers
      const licensingService = createLicensingService(
        stores.tenant,
        stores.subscription,
        stores.usage,
        stores.user
      );

      const tenant = await stores.tenant.createTenant({
        name: 'Free Tenant',
        slug: 'free-tenant',
        ownerId: 'user-123',
        tier: 'free',
        status: 'active',
        settings: {},
      });

      // Free tier allows 3 users
      expect(await licensingService.canAddUsers(tenant.id, 1)).toBe(true);
      expect(await licensingService.canAddUsers(tenant.id, 3)).toBe(true);
      expect(await licensingService.canAddUsers(tenant.id, 4)).toBe(false);
    });
  });

  describe('RateLimitService', () => {
    it('should allow requests within limit', async () => {
      const rateLimitService = createRateLimitService(stores.tenant);

      await stores.tenant.createTenant({
        name: 'Rate Test',
        slug: 'rate-test',
        ownerId: 'user-123',
        tier: 'free',
        status: 'active',
        settings: {},
      });

      const tenant = await stores.tenant.getTenantBySlug('rate-test');

      const result = await rateLimitService.checkRateLimit(tenant!.id, 'test-key');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should block when limit exceeded', async () => {
      const rateLimitService = createRateLimitService(stores.tenant);

      await stores.tenant.createTenant({
        name: 'Limit Test',
        slug: 'limit-test',
        ownerId: 'user-123',
        tier: 'free',
        status: 'active',
        settings: {},
      });

      const tenant = await stores.tenant.getTenantBySlug('limit-test');

      // Exhaust the limit (free tier: 10 per minute)
      for (let i = 0; i < 10; i++) {
        await rateLimitService.checkRateLimit(tenant!.id, 'exhaust-key');
      }

      const result = await rateLimitService.checkRateLimit(tenant!.id, 'exhaust-key');
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Middleware Tests
// =============================================================================

describe('Enterprise Middleware', () => {
  let stores: ReturnType<typeof createEnterpriseStores>;

  beforeEach(async () => {
    stores = createEnterpriseStores('memory');

    // Create test tenant
    await stores.tenant.createTenant({
      id: 'test-tenant',
      name: 'Test Tenant',
      slug: 'test',
      ownerId: 'user-123',
      tier: 'business',
      status: 'active',
      settings: {},
    });
  });

  describe('TenantContextMiddleware', () => {
    it('should extract tenant from header', async () => {
      const middleware = createTenantContextMiddleware(stores.tenant, {
        tenantHeader: 'x-tenant-id',
      });

      const req = createMockRequest({
        headers: { 'x-tenant-id': 'test-tenant' },
      });
      const res = createMockResponse();
      let nextCalled = false;

      await middleware.handler()(req as any, res as any, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(req.tenantContext).toBeDefined();
      expect(req.tenantContext?.tenantId).toBe('test-tenant');
      expect(req.tenantContext?.tier).toBe('business');
    });

    it('should return 404 for non-existent tenant', async () => {
      const middleware = createTenantContextMiddleware(stores.tenant, {
        requireTenant: true,
      });

      const req = createMockRequest({
        headers: { 'x-tenant-id': 'non-existent' },
      });
      const res = createMockResponse();

      await middleware.handler()(req as any, res as any, () => {});

      expect(res.getStatus()).toBe(404);
      expect((res.getBody() as any).error).toBe('TENANT_NOT_FOUND');
    });

    it('should return 403 for suspended tenant', async () => {
      await stores.tenant.updateTenant('test-tenant', { status: 'suspended' });

      const middleware = createTenantContextMiddleware(stores.tenant);

      const req = createMockRequest({
        headers: { 'x-tenant-id': 'test-tenant' },
      });
      const res = createMockResponse();

      await middleware.handler()(req as any, res as any, () => {});

      expect(res.getStatus()).toBe(403);
      expect((res.getBody() as any).error).toBe('TENANT_SUSPENDED');
    });
  });

  describe('TierGateMiddleware', () => {
    it('should allow access to features for correct tier', () => {
      const middleware = createTierGateMiddleware();

      const req = createMockRequest({
        tenantContext: {
          tenantId: 'test-tenant',
          tier: 'business' as SubscriptionTier,
          limits: getTierLimits('business'),
          features: getTierFeatures('business'),
          settings: {},
        },
      });
      const res = createMockResponse();
      let nextCalled = false;

      middleware.requireFeature('sso')(req as any, res as any, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
    });

    it('should deny access to features for insufficient tier', () => {
      const middleware = createTierGateMiddleware();

      const req = createMockRequest({
        tenantContext: {
          tenantId: 'test-tenant',
          tier: 'free' as SubscriptionTier,
          limits: getTierLimits('free'),
          features: getTierFeatures('free'),
          settings: {},
        },
      });
      const res = createMockResponse();

      middleware.requireFeature('sso')(req as any, res as any, () => {});

      expect(res.getStatus()).toBe(403);
      expect((res.getBody() as any).error).toBe('FEATURE_NOT_AVAILABLE');
    });

    it('should require minimum tier', () => {
      const middleware = createTierGateMiddleware();

      const req = createMockRequest({
        tenantContext: {
          tenantId: 'test-tenant',
          tier: 'pro' as SubscriptionTier,
          limits: getTierLimits('pro'),
          features: getTierFeatures('pro'),
          settings: {},
        },
      });
      const res = createMockResponse();

      middleware.requireTier('business')(req as any, res as any, () => {});

      expect(res.getStatus()).toBe(403);
      expect((res.getBody() as any).error).toBe('TIER_REQUIRED');
    });
  });
});

// =============================================================================
// EnterpriseManager Integration Tests
// =============================================================================

describe('EnterpriseManager', () => {
  let manager: EnterpriseManager;

  beforeEach(() => {
    manager = createEnterpriseManager('memory', {
      baseUrl: 'http://localhost:3000',
      trialPeriodDays: 14,
    });
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe('Tenant Management', () => {
    it('should create and retrieve tenant', async () => {
      const tenant = await manager.createTenant({
        name: 'Integration Test Co',
        slug: 'integration-test',
        ownerId: 'user-123',
      });

      expect(tenant.id).toBeDefined();
      expect(tenant.name).toBe('Integration Test Co');

      const retrieved = await manager.getTenant(tenant.id);
      expect(retrieved?.slug).toBe('integration-test');

      const bySlug = await manager.getTenantBySlug('integration-test');
      expect(bySlug?.id).toBe(tenant.id);
    });
  });

  describe('User Management', () => {
    it('should invite and accept user', async () => {
      const tenant = await manager.createTenant({
        name: 'User Test Co',
        slug: 'user-test',
        ownerId: 'owner-123',
      });

      const { user, invitationToken } = await manager.inviteUser(
        tenant.id,
        'newuser@example.com',
        'developer'
      );

      expect(user.email).toBe('newuser@example.com');
      expect(user.status).toBe('invited');
      expect(invitationToken).toBeDefined();

      const acceptedUser = await manager.acceptInvitation(invitationToken, 'New User');
      expect(acceptedUser.status).toBe('active');
      expect(acceptedUser.name).toBe('New User');
    });

    it('should list tenant users', async () => {
      const tenant = await manager.createTenant({
        name: 'List Users Co',
        slug: 'list-users',
        ownerId: 'owner-456',
      });

      await manager.inviteUser(tenant.id, 'user1@example.com', 'member');
      await manager.inviteUser(tenant.id, 'user2@example.com', 'developer');

      const users = await manager.getUsers(tenant.id);
      expect(users.length).toBe(2);
    });
  });

  describe('Subscription Management', () => {
    it('should create and upgrade subscription', async () => {
      const tenant = await manager.createTenant({
        name: 'Subscription Co',
        slug: 'subscription-test',
        ownerId: 'owner-789',
      });

      // Tenant creation includes a default subscription, so just get it
      const existingSubscription = await manager.getSubscription(tenant.id);
      expect(existingSubscription).toBeDefined();
      expect(existingSubscription?.status).toBe('active');

      // Upgrade to pro then to business
      const upgraded = await manager.upgradeSubscription(tenant.id, 'pro');
      expect(upgraded.tier).toBe('pro');

      const upgraded2 = await manager.upgradeSubscription(tenant.id, 'business');
      expect(upgraded2.tier).toBe('business');
    });

    it('should get subscription for tenant', async () => {
      const tenant = await manager.createTenant({
        name: 'Get Sub Co',
        slug: 'get-sub',
        ownerId: 'owner-get',
      });

      // Tenant comes with a default free subscription
      // Upgrade it to business
      await manager.upgradeSubscription(tenant.id, 'business');

      const subscription = await manager.getSubscription(tenant.id);
      expect(subscription?.tier).toBe('business');
    });
  });

  describe('Analytics & Dashboard', () => {
    it('should get dashboard summary', async () => {
      const tenant = await manager.createTenant({
        name: 'Dashboard Co',
        slug: 'dashboard-test',
        ownerId: 'owner-dash',
      });

      // Upgrade to pro (tenant already has free subscription)
      await manager.upgradeSubscription(tenant.id, 'pro');
      await manager.inviteUser(tenant.id, 'user@example.com', 'member');

      const summary = await manager.getDashboardSummary(tenant.id);
      expect(summary.totalUsers).toBeGreaterThanOrEqual(1);
      expect(summary.tier).toBe('pro');
    });

    it('should get analytics data', async () => {
      const tenant = await manager.createTenant({
        name: 'Analytics Co',
        slug: 'analytics-test',
        ownerId: 'owner-analytics',
      });

      const analytics = await manager.getAnalytics(tenant.id, 'month');
      expect(analytics.timeRange).toBe('month');
      expect(analytics.apiCalls).toBeDefined();
      expect(analytics.storageUsage).toBeDefined();
    });
  });
});

// =============================================================================
// Edge Cases & Error Handling
// =============================================================================

describe('Enterprise Error Handling', () => {
  let stores: ReturnType<typeof createEnterpriseStores>;

  beforeEach(() => {
    stores = createEnterpriseStores('memory');
  });

  describe('Tenant Operations', () => {
    it('should throw on duplicate slug', async () => {
      const tenantService = createTenantService(
        stores.tenant,
        stores.subscription,
        stores.auditLog
      );

      await tenantService.createTenant({
        name: 'First',
        slug: 'duplicate',
        ownerId: 'user-1',
      });

      await expect(
        tenantService.createTenant({
          name: 'Second',
          slug: 'duplicate',
          ownerId: 'user-2',
        })
      ).rejects.toThrow();
    });

    it('should handle non-existent tenant updates', async () => {
      const result = await stores.tenant.updateTenant('non-existent', { name: 'New Name' });
      expect(result).toBeNull();
    });
  });

  describe('User Operations', () => {
    it('should prevent duplicate email in same tenant', async () => {
      const tenantId = 'dup-email-tenant';

      await stores.user.createUser({
        tenantId,
        email: 'duplicate@example.com',
        name: 'First User',
        role: 'member',
        status: 'active',
        mfaEnabled: false,
      });

      await expect(
        stores.user.createUser({
          tenantId,
          email: 'duplicate@example.com',
          name: 'Second User',
          role: 'member',
          status: 'active',
          mfaEnabled: false,
        })
      ).rejects.toThrow();
    });
  });

  describe('Rate Limiting Edge Cases', () => {
    it('should handle very high traffic', async () => {
      const rateLimitService = createRateLimitService(stores.tenant);

      await stores.tenant.createTenant({
        name: 'High Traffic',
        slug: 'high-traffic',
        ownerId: 'user-123',
        tier: 'enterprise',
        status: 'active',
        settings: {},
      });

      const tenant = await stores.tenant.getTenantBySlug('high-traffic');

      // Enterprise tier has very high limits
      const results = await Promise.all(
        Array.from({ length: 100 }, () =>
          rateLimitService.checkRateLimit(tenant!.id, 'high-traffic-key')
        )
      );

      // All should be allowed for enterprise tier
      expect(results.every(r => r.allowed)).toBe(true);
    });
  });
});
