/**
 * Enterprise API Endpoint
 *
 * REST API for enterprise features:
 * - Tenant management
 * - User invitations
 * - Subscription management
 * - SSO configuration
 * - Analytics dashboard
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createEnterpriseManager,
  type EnterpriseManager,
  type SubscriptionTier,
} from '../src/enterprise/index.js';

// Global enterprise manager instance
let enterpriseManager: EnterpriseManager | null = null;

function getEnterpriseManager(): EnterpriseManager {
  if (!enterpriseManager) {
    enterpriseManager = createEnterpriseManager('memory', {
      baseUrl: process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000',
      trialPeriodDays: 14,
      // Stripe and SSO configs would come from environment variables in production
    });
  }
  return enterpriseManager;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method, query } = req;
  const resource = query.resource as string | undefined;
  const action = query.action as string | undefined;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse body
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid JSON in request body',
      });
    }
  }

  try {
    const manager = getEnterpriseManager();

    // ==========================================================================
    // Tenant Endpoints
    // ==========================================================================

    // POST /api/enterprise?resource=tenant - Create tenant
    if (method === 'POST' && resource === 'tenant') {
      const { name, slug, ownerEmail, ownerName, tier } = body;

      if (!name || !slug || !ownerEmail || !ownerName) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'name, slug, ownerEmail, and ownerName are required',
        });
      }

      const result = await manager.createTenant(name, slug, ownerEmail, ownerName, {
        tier: tier as SubscriptionTier,
        startTrial: true,
      });

      return res.status(201).json({
        success: true,
        tenant: result.tenant,
        owner: result.owner,
      });
    }

    // GET /api/enterprise?resource=tenant&id=xxx - Get tenant
    if (method === 'GET' && resource === 'tenant') {
      const tenantId = query.id as string;
      const slug = query.slug as string;

      if (tenantId) {
        const tenant = await manager.getTenant(tenantId);
        return res.status(200).json({ success: true, tenant });
      }

      if (slug) {
        const tenant = await manager.getTenantBySlug(slug);
        if (!tenant) {
          return res.status(404).json({
            error: 'Not Found',
            message: `Tenant with slug '${slug}' not found`,
          });
        }
        return res.status(200).json({ success: true, tenant });
      }

      return res.status(400).json({
        error: 'Bad Request',
        message: 'id or slug query parameter is required',
      });
    }

    // ==========================================================================
    // User Endpoints
    // ==========================================================================

    // POST /api/enterprise?resource=user&action=invite - Invite user
    if (method === 'POST' && resource === 'user' && action === 'invite') {
      const { tenantId, email, role } = body;

      if (!tenantId || !email) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'tenantId and email are required',
        });
      }

      const result = await manager.inviteUser(tenantId, email, role || 'member');

      return res.status(201).json({
        success: true,
        user: result.user,
        invitationToken: result.invitationToken,
      });
    }

    // POST /api/enterprise?resource=user&action=accept - Accept invitation
    if (method === 'POST' && resource === 'user' && action === 'accept') {
      const { invitationToken, name } = body;

      if (!invitationToken || !name) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'invitationToken and name are required',
        });
      }

      const user = await manager.acceptInvitation(invitationToken, name);

      return res.status(200).json({
        success: true,
        user,
      });
    }

    // GET /api/enterprise?resource=user&tenantId=xxx - List users
    if (method === 'GET' && resource === 'user') {
      const tenantId = query.tenantId as string;

      if (!tenantId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'tenantId query parameter is required',
        });
      }

      const users = await manager.getUsers(tenantId);

      return res.status(200).json({
        success: true,
        users,
      });
    }

    // ==========================================================================
    // Subscription Endpoints
    // ==========================================================================

    // POST /api/enterprise?resource=subscription - Create subscription
    if (method === 'POST' && resource === 'subscription') {
      const { tenantId, tier, interval } = body;

      if (!tenantId || !tier) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'tenantId and tier are required',
        });
      }

      const subscription = await manager.createSubscription(
        tenantId,
        tier as SubscriptionTier,
        interval || 'monthly'
      );

      return res.status(201).json({
        success: true,
        subscription,
      });
    }

    // PUT /api/enterprise?resource=subscription&action=upgrade - Upgrade subscription
    if (method === 'PUT' && resource === 'subscription' && action === 'upgrade') {
      const { tenantId, tier } = body;

      if (!tenantId || !tier) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'tenantId and tier are required',
        });
      }

      const subscription = await manager.upgradeSubscription(tenantId, tier as SubscriptionTier);

      return res.status(200).json({
        success: true,
        subscription,
      });
    }

    // GET /api/enterprise?resource=subscription&tenantId=xxx - Get subscription
    if (method === 'GET' && resource === 'subscription') {
      const tenantId = query.tenantId as string;

      if (!tenantId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'tenantId query parameter is required',
        });
      }

      const subscription = await manager.getSubscription(tenantId);

      return res.status(200).json({
        success: true,
        subscription,
      });
    }

    // ==========================================================================
    // Analytics Endpoints
    // ==========================================================================

    // GET /api/enterprise?resource=dashboard&tenantId=xxx - Get dashboard summary
    if (method === 'GET' && resource === 'dashboard') {
      const tenantId = query.tenantId as string;

      if (!tenantId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'tenantId query parameter is required',
        });
      }

      const summary = await manager.getDashboardSummary(tenantId);

      return res.status(200).json({
        success: true,
        summary,
      });
    }

    // GET /api/enterprise?resource=analytics&tenantId=xxx - Get analytics
    if (method === 'GET' && resource === 'analytics') {
      const tenantId = query.tenantId as string;
      const timeRange = (query.timeRange as string) || 'month';

      if (!tenantId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'tenantId query parameter is required',
        });
      }

      const analytics = await manager.getAnalytics(
        tenantId,
        timeRange as 'day' | 'week' | 'month' | 'quarter' | 'year'
      );

      return res.status(200).json({
        success: true,
        analytics,
      });
    }

    // ==========================================================================
    // Tier Information
    // ==========================================================================

    // GET /api/enterprise?resource=tiers - Get tier information
    if (method === 'GET' && resource === 'tiers') {
      const { TIER_CONFIGS } = await import('../src/enterprise/constants.js');

      return res.status(200).json({
        success: true,
        tiers: TIER_CONFIGS,
      });
    }

    // ==========================================================================
    // API Info
    // ==========================================================================

    // GET /api/enterprise - API info
    if (method === 'GET' && !resource) {
      return res.status(200).json({
        name: 'SecureAgent Enterprise API',
        version: '1.0.0',
        endpoints: {
          tenant: {
            create: 'POST /api/enterprise?resource=tenant',
            get: 'GET /api/enterprise?resource=tenant&id=<id>',
            getBySlug: 'GET /api/enterprise?resource=tenant&slug=<slug>',
          },
          user: {
            invite: 'POST /api/enterprise?resource=user&action=invite',
            accept: 'POST /api/enterprise?resource=user&action=accept',
            list: 'GET /api/enterprise?resource=user&tenantId=<id>',
          },
          subscription: {
            create: 'POST /api/enterprise?resource=subscription',
            upgrade: 'PUT /api/enterprise?resource=subscription&action=upgrade',
            get: 'GET /api/enterprise?resource=subscription&tenantId=<id>',
          },
          analytics: {
            dashboard: 'GET /api/enterprise?resource=dashboard&tenantId=<id>',
            analytics: 'GET /api/enterprise?resource=analytics&tenantId=<id>',
          },
          tiers: 'GET /api/enterprise?resource=tiers',
        },
      });
    }

    // Unknown resource
    return res.status(400).json({
      error: 'Bad Request',
      message: `Unknown resource: ${resource}`,
      availableResources: ['tenant', 'user', 'subscription', 'dashboard', 'analytics', 'tiers'],
    });

  } catch (error) {
    console.error('Enterprise API error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: (error as Error).message,
    });
  }
}
