import type {
  Permission,
  Role,
  UserIdentity,
  SessionContext,
  AuthorizationContext,
  AuthorizationResult,
} from '../types.js';
import { AuthorizationError, InsufficientPermissionsError } from '../types.js';
import { PermissionEvaluator, type EvaluationContext } from './permission-evaluator.js';
import { getLogger, getAuditLogger } from '../../observability/logger.js';

// ============================================================================
// Authorization Service - RBAC with ABAC Conditions
// ============================================================================

/**
 * Configuration for the authorization service
 */
export interface AuthorizationServiceConfig {
  /** Enable strict mode - deny if no matching rule found (default: true) */
  strictMode?: boolean;
  /** Cache role hierarchy for performance */
  cacheEnabled?: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
  /** Maximum role inheritance depth to prevent cycles */
  maxInheritanceDepth?: number;
}

/**
 * Role definition with full configuration
 */
export interface RoleDefinition extends Role {
  /** Role description */
  description?: string;
  /** Whether this is a system role (cannot be modified) */
  system?: boolean;
  /** Priority for conflict resolution (higher wins) */
  priority?: number;
  /** Constraints on role assignment */
  constraints?: {
    requireMfa?: boolean;
    maxRiskScore?: number;
    allowedIpRanges?: string[];
  };
}

/**
 * Authorization check options
 */
export interface AuthorizationOptions {
  /** Resource attributes for condition evaluation */
  resourceAttributes?: Record<string, unknown>;
  /** Additional context for evaluation */
  additionalContext?: Record<string, unknown>;
  /** Skip audit logging */
  skipAudit?: boolean;
}

/**
 * Authorization Service
 *
 * Implements Role-Based Access Control (RBAC) with Attribute-Based Access Control (ABAC) conditions.
 * Features:
 * - Hierarchical role inheritance
 * - Fine-grained permissions with conditions
 * - Deny-by-default security model
 * - Comprehensive audit logging
 */
export class AuthorizationService {
  private readonly config: Required<AuthorizationServiceConfig>;
  private readonly roles = new Map<string, RoleDefinition>();
  private readonly permissionEvaluator: PermissionEvaluator;
  private readonly logger = getLogger().child({ module: 'AuthorizationService' });
  private readonly auditLogger = getAuditLogger();

  // Cache for resolved role hierarchies
  private readonly roleHierarchyCache = new Map<string, Set<string>>();
  private cacheLastCleared = Date.now();

  constructor(config: AuthorizationServiceConfig = {}) {
    this.config = {
      strictMode: config.strictMode ?? true,
      cacheEnabled: config.cacheEnabled ?? true,
      cacheTtlMs: config.cacheTtlMs ?? 300000, // 5 minutes
      maxInheritanceDepth: config.maxInheritanceDepth ?? 10,
    };

    this.permissionEvaluator = new PermissionEvaluator();
    this.registerBuiltInRoles();
  }

  /**
   * Register built-in system roles
   */
  private registerBuiltInRoles(): void {
    // Super admin - full access
    this.registerRole({
      name: 'super_admin',
      description: 'Full system access',
      system: true,
      priority: 1000,
      permissions: [
        { resource: '*', action: 'create' },
        { resource: '*', action: 'read' },
        { resource: '*', action: 'update' },
        { resource: '*', action: 'delete' },
        { resource: '*', action: 'execute' },
      ],
      constraints: {
        requireMfa: true,
      },
    });

    // Admin - high-level access with some restrictions
    this.registerRole({
      name: 'admin',
      description: 'Administrative access',
      system: true,
      priority: 900,
      inherits: ['operator'],
      permissions: [
        { resource: 'user', action: 'create' },
        { resource: 'user', action: 'update' },
        { resource: 'user', action: 'delete' },
        { resource: 'role', action: 'read' },
        { resource: 'role', action: 'update' },
        { resource: 'audit', action: 'read' },
        { resource: 'config', action: 'read' },
        { resource: 'config', action: 'update' },
      ],
      constraints: {
        requireMfa: true,
        maxRiskScore: 50,
      },
    });

    // Operator - can execute tools and manage sessions
    this.registerRole({
      name: 'operator',
      description: 'Operational access for tool execution',
      system: true,
      priority: 500,
      inherits: ['user'],
      permissions: [
        { resource: 'tool', action: 'execute' },
        { resource: 'tool', action: 'read' },
        { resource: 'sandbox', action: 'execute' },
        { resource: 'channel', action: 'read' },
        { resource: 'channel', action: 'execute' },
        { resource: 'session', action: 'read' },
        { resource: 'session', action: 'delete', conditions: { 'resource.ownerId': { $eq: '$currentUserId' } } },
      ],
    });

    // User - basic access
    this.registerRole({
      name: 'user',
      description: 'Basic user access',
      system: true,
      priority: 100,
      permissions: [
        { resource: 'profile', action: 'read', conditions: { 'resource.ownerId': { $eq: '$currentUserId' } } },
        { resource: 'profile', action: 'update', conditions: { 'resource.ownerId': { $eq: '$currentUserId' } } },
        { resource: 'message', action: 'create' },
        { resource: 'message', action: 'read', conditions: { 'resource.ownerId': { $eq: '$currentUserId' } } },
      ],
    });

    // Read-only - can only view
    this.registerRole({
      name: 'readonly',
      description: 'Read-only access',
      system: true,
      priority: 50,
      permissions: [
        { resource: 'profile', action: 'read', conditions: { 'resource.ownerId': { $eq: '$currentUserId' } } },
      ],
    });

    // Guest - minimal access
    this.registerRole({
      name: 'guest',
      description: 'Guest access',
      system: true,
      priority: 10,
      permissions: [],
    });
  }

  /**
   * Register a new role
   */
  registerRole(role: RoleDefinition): void {
    // Validate role
    if (!role.name || role.name.trim() === '') {
      throw new Error('Role name is required');
    }

    // Check for existing system role
    const existing = this.roles.get(role.name);
    if (existing?.system && !role.system) {
      throw new Error(`Cannot override system role: ${role.name}`);
    }

    // Validate inheritance
    if (role.inherits) {
      for (const parentRole of role.inherits) {
        if (!this.roles.has(parentRole) && parentRole !== role.name) {
          this.logger.warn({ role: role.name, parent: parentRole }, 'Parent role not found');
        }
        if (parentRole === role.name) {
          throw new Error(`Role cannot inherit from itself: ${role.name}`);
        }
      }
    }

    this.roles.set(role.name, role);
    this.clearCache();

    this.logger.info({ role: role.name, system: role.system }, 'Role registered');
  }

  /**
   * Unregister a role
   */
  unregisterRole(roleName: string): boolean {
    const role = this.roles.get(roleName);
    if (!role) return false;

    if (role.system) {
      throw new Error(`Cannot unregister system role: ${roleName}`);
    }

    this.roles.delete(roleName);
    this.clearCache();
    return true;
  }

  /**
   * Get a role by name
   */
  getRole(roleName: string): RoleDefinition | undefined {
    return this.roles.get(roleName);
  }

  /**
   * Get all roles
   */
  getAllRoles(): RoleDefinition[] {
    return Array.from(this.roles.values());
  }

  /**
   * Check if a user is authorized for an action on a resource
   */
  async authorize(
    context: AuthorizationContext,
    session?: SessionContext,
    options: AuthorizationOptions = {}
  ): Promise<AuthorizationResult> {
    const startTime = Date.now();

    try {
      // Get all effective permissions for the user's roles
      const effectivePermissions = this.getEffectivePermissions(context.identity.roles);

      // Check role constraints
      const constraintResult = this.checkRoleConstraints(context.identity, session);
      if (!constraintResult.allowed) {
        return this.createDeniedResult(context, constraintResult.reason!, startTime, options);
      }

      // Find matching permission
      const matchResult = await this.findMatchingPermission(
        effectivePermissions,
        context,
        session,
        options
      );

      if (matchResult.found) {
        return this.createAllowedResult(context, matchResult.permission!, startTime, options);
      }

      // Strict mode: deny if no matching permission
      if (this.config.strictMode) {
        return this.createDeniedResult(
          context,
          `No permission found for ${context.action} on ${context.resource}`,
          startTime,
          options
        );
      }

      // Non-strict mode: allow by default (not recommended)
      return this.createAllowedResult(context, undefined, startTime, options);

    } catch (error) {
      this.logger.error({ error, context }, 'Authorization check failed');
      return this.createDeniedResult(
        context,
        error instanceof Error ? error.message : 'Authorization check failed',
        startTime,
        options
      );
    }
  }

  /**
   * Check if user is authorized, throwing on denial
   */
  async authorizeOrThrow(
    context: AuthorizationContext,
    session?: SessionContext,
    options: AuthorizationOptions = {}
  ): Promise<void> {
    const result = await this.authorize(context, session, options);

    if (!result.allowed) {
      throw new AuthorizationError(
        result.reason ?? 'Access denied',
        context.resource,
        context.action
      );
    }
  }

  /**
   * Check if user has a specific permission (simplified check)
   */
  hasPermission(
    identity: UserIdentity,
    resource: string,
    action: Permission['action']
  ): boolean {
    const permissions = this.getEffectivePermissions(identity.roles);

    for (const permission of permissions) {
      if (this.matchesResource(permission.resource, resource) &&
          permission.action === action &&
          !permission.conditions) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all effective permissions for a set of roles (including inherited)
   */
  getEffectivePermissions(roleNames: string[]): Permission[] {
    const permissions: Permission[] = [];
    const processedRoles = new Set<string>();

    const collectPermissions = (roleName: string, depth: number): void => {
      if (depth > this.config.maxInheritanceDepth) {
        this.logger.warn({ role: roleName }, 'Max role inheritance depth exceeded');
        return;
      }

      if (processedRoles.has(roleName)) return;
      processedRoles.add(roleName);

      const role = this.roles.get(roleName);
      if (!role) return;

      // Add role's own permissions
      permissions.push(...role.permissions);

      // Process inherited roles
      if (role.inherits) {
        for (const parentRole of role.inherits) {
          collectPermissions(parentRole, depth + 1);
        }
      }
    };

    for (const roleName of roleNames) {
      collectPermissions(roleName, 0);
    }

    return permissions;
  }

  /**
   * Get all roles a user effectively has (including inherited)
   */
  getEffectiveRoles(roleNames: string[]): Set<string> {
    // Check cache
    const cacheKey = roleNames.sort().join(',');
    if (this.config.cacheEnabled) {
      this.checkCacheExpiry();
      const cached = this.roleHierarchyCache.get(cacheKey);
      if (cached) return cached;
    }

    const effectiveRoles = new Set<string>();

    const collectRoles = (roleName: string, depth: number): void => {
      if (depth > this.config.maxInheritanceDepth) return;
      if (effectiveRoles.has(roleName)) return;

      effectiveRoles.add(roleName);

      const role = this.roles.get(roleName);
      if (role?.inherits) {
        for (const parentRole of role.inherits) {
          collectRoles(parentRole, depth + 1);
        }
      }
    };

    for (const roleName of roleNames) {
      collectRoles(roleName, 0);
    }

    // Cache result
    if (this.config.cacheEnabled) {
      this.roleHierarchyCache.set(cacheKey, effectiveRoles);
    }

    return effectiveRoles;
  }

  /**
   * Check role constraints (MFA, risk score, IP)
   */
  private checkRoleConstraints(
    identity: UserIdentity,
    session?: SessionContext
  ): { allowed: boolean; reason?: string } {
    for (const roleName of identity.roles) {
      const role = this.roles.get(roleName);
      if (!role?.constraints) continue;

      const constraints = role.constraints;

      // Check MFA requirement
      if (constraints.requireMfa && !identity.mfaVerified) {
        return { allowed: false, reason: `Role ${roleName} requires MFA` };
      }

      // Check risk score
      if (constraints.maxRiskScore !== undefined && session) {
        if (session.riskScore > constraints.maxRiskScore) {
          return {
            allowed: false,
            reason: `Session risk score ${session.riskScore} exceeds maximum ${constraints.maxRiskScore} for role ${roleName}`,
          };
        }
      }

      // Check IP ranges (if configured)
      if (constraints.allowedIpRanges && session) {
        const ipAllowed = constraints.allowedIpRanges.some(range =>
          this.ipMatchesRange(session.ipAddress, range)
        );
        if (!ipAllowed) {
          return { allowed: false, reason: `IP ${session.ipAddress} not allowed for role ${roleName}` };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Find a matching permission for the request
   */
  private async findMatchingPermission(
    permissions: Permission[],
    context: AuthorizationContext,
    session?: SessionContext,
    options: AuthorizationOptions = {}
  ): Promise<{ found: boolean; permission?: Permission }> {
    // Build evaluation context
    const evalContext: EvaluationContext = {
      identity: context.identity,
      session,
      resource: {
        type: context.resource,
        id: context.attributes?.id as string,
        ownerId: context.attributes?.ownerId as string,
        attributes: { ...context.attributes, ...options.resourceAttributes },
      },
      environment: {
        timestamp: Date.now(),
        ipAddress: session?.ipAddress,
        userAgent: session?.userAgent,
        riskScore: session?.riskScore,
      },
      request: options.additionalContext,
    };

    // Check each permission
    for (const permission of permissions) {
      // Check resource match
      if (!this.matchesResource(permission.resource, context.resource)) {
        continue;
      }

      // Check action match
      if (permission.action !== context.action) {
        continue;
      }

      // Evaluate conditions if present
      if (permission.conditions) {
        const evalResult = this.permissionEvaluator.evaluatePermission(permission, evalContext);
        if (!evalResult.allowed) {
          continue;
        }
      }

      return { found: true, permission };
    }

    return { found: false };
  }

  /**
   * Check if a permission resource matches the requested resource
   */
  private matchesResource(permissionResource: string, requestedResource: string): boolean {
    // Wildcard match
    if (permissionResource === '*') return true;

    // Exact match
    if (permissionResource === requestedResource) return true;

    // Prefix wildcard (e.g., "user:*" matches "user:123")
    if (permissionResource.endsWith(':*')) {
      const prefix = permissionResource.slice(0, -1);
      return requestedResource.startsWith(prefix);
    }

    // Glob pattern (e.g., "tool:file_*" matches "tool:file_read")
    if (permissionResource.includes('*')) {
      const pattern = permissionResource
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(requestedResource);
    }

    return false;
  }

  /**
   * Check if IP matches a CIDR range or exact match
   */
  private ipMatchesRange(ip: string, range: string): boolean {
    // Exact match
    if (ip === range) return true;

    // CIDR notation (simplified - production should use proper CIDR library)
    if (range.includes('/')) {
      const [rangeIp, bits] = range.split('/');
      const maskBits = parseInt(bits, 10);

      // Only support /24 and /16 for simplicity
      const ipParts = ip.split('.').map(p => parseInt(p, 10));
      const rangeParts = rangeIp.split('.').map(p => parseInt(p, 10));

      if (maskBits === 24) {
        return ipParts[0] === rangeParts[0] &&
               ipParts[1] === rangeParts[1] &&
               ipParts[2] === rangeParts[2];
      }
      if (maskBits === 16) {
        return ipParts[0] === rangeParts[0] &&
               ipParts[1] === rangeParts[1];
      }
    }

    return false;
  }

  /**
   * Create an allowed result with audit logging
   */
  private createAllowedResult(
    context: AuthorizationContext,
    permission: Permission | undefined,
    startTime: number,
    options: AuthorizationOptions
  ): AuthorizationResult {
    if (!options.skipAudit) {
      this.auditLogger.log({
        eventId: crypto.randomUUID(),
        timestamp: Date.now(),
        eventType: 'authorization',
        severity: 'info',
        actor: {
          userId: context.identity.userId,
        },
        resource: {
          type: context.resource,
          id: context.attributes?.id as string,
        },
        action: context.action,
        outcome: 'success',
        details: {
          roles: context.identity.roles,
          matchedPermission: permission,
          durationMs: Date.now() - startTime,
        },
      });
    }

    return {
      allowed: true,
      matchedPermission: permission,
    };
  }

  /**
   * Create a denied result with audit logging
   */
  private createDeniedResult(
    context: AuthorizationContext,
    reason: string,
    startTime: number,
    options: AuthorizationOptions
  ): AuthorizationResult {
    if (!options.skipAudit) {
      this.auditLogger.log({
        eventId: crypto.randomUUID(),
        timestamp: Date.now(),
        eventType: 'authorization',
        severity: 'warn',
        actor: {
          userId: context.identity.userId,
        },
        resource: {
          type: context.resource,
          id: context.attributes?.id as string,
        },
        action: context.action,
        outcome: 'blocked',
        details: {
          roles: context.identity.roles,
          reason,
          durationMs: Date.now() - startTime,
        },
      });
    }

    return {
      allowed: false,
      reason,
    };
  }

  /**
   * Clear role hierarchy cache
   */
  private clearCache(): void {
    this.roleHierarchyCache.clear();
    this.cacheLastCleared = Date.now();
  }

  /**
   * Check if cache has expired
   */
  private checkCacheExpiry(): void {
    if (Date.now() - this.cacheLastCleared > this.config.cacheTtlMs) {
      this.clearCache();
    }
  }
}

// ============================================================================
// Authorization Middleware Helper
// ============================================================================

/**
 * Create an authorization check function for specific resource/action
 */
export function createAuthorizationCheck(
  service: AuthorizationService,
  resource: string,
  action: Permission['action']
): (identity: UserIdentity, session?: SessionContext, attributes?: Record<string, unknown>) => Promise<void> {
  return async (identity, session, attributes) => {
    await service.authorizeOrThrow(
      {
        identity,
        resource,
        action,
        attributes,
      },
      session
    );
  };
}

/**
 * Create tool execution authorization check
 */
export function createToolAuthorizationCheck(
  service: AuthorizationService,
  toolName: string
): (identity: UserIdentity, session?: SessionContext) => Promise<void> {
  return async (identity, session) => {
    await service.authorizeOrThrow(
      {
        identity,
        resource: `tool:${toolName}`,
        action: 'execute',
      },
      session
    );
  };
}
