/**
 * Access Controller
 *
 * Role-based access control (RBAC) for HIPAA compliance.
 * Controls access to PHI based on user roles and permissions.
 */

import { EventEmitter } from 'events';
import type { AuditLogger, AuditContext } from './audit-logger.js';
import type { AccessLevel, ResourceType, AuditAction } from '../../types.js';

// Type alias for backward compatibility
type AuditResourceType = ResourceType;
import { ACCESS_LEVELS } from '../../constants.js';
import { HEALTH_EVENTS } from '../../constants.js';

// =============================================================================
// Access Controller Options
// =============================================================================

export interface AccessControllerOptions {
  auditLogger: AuditLogger;
}

// =============================================================================
// Permission Types
// =============================================================================

export interface Permission {
  resource: AuditResourceType | '*';
  actions: AuditAction[] | '*';
  scope?: 'own' | 'assigned' | 'all';
}

export interface AccessRequest {
  context: AuditContext;
  resourceType: AuditResourceType;
  resourceId: string;
  action: AuditAction;
  resourceOwnerId?: string; // For 'own' scope checking
  assignedUserIds?: string[]; // For 'assigned' scope checking
}

export interface AccessResult {
  allowed: boolean;
  reason?: string;
  requiredPermission?: string;
}

// =============================================================================
// Role Definitions
// =============================================================================

const ROLE_PERMISSIONS: Record<AccessLevel, Permission[]> = {
  admin: [
    { resource: '*', actions: '*', scope: 'all' },
  ],
  supervisor: [
    { resource: 'patient', actions: '*', scope: 'all' },
    { resource: 'appointment', actions: '*', scope: 'all' },
    { resource: 'authorization', actions: '*', scope: 'all' },
    { resource: 'progress-report', actions: '*', scope: 'all' },
    { resource: 'schedule', actions: '*', scope: 'all' },
    { resource: 'user', actions: ['read'], scope: 'all' },
    { resource: 'session-data', actions: '*', scope: 'all' },
    { resource: 'audit-log', actions: ['read'], scope: 'all' },
  ],
  rbt: [
    { resource: 'patient', actions: ['read'], scope: 'assigned' },
    { resource: 'appointment', actions: ['read', 'update'], scope: 'assigned' },
    { resource: 'authorization', actions: ['read'], scope: 'assigned' },
    { resource: 'session-data', actions: '*', scope: 'assigned' },
    { resource: 'schedule', actions: ['read'], scope: 'own' },
    { resource: 'user', actions: ['read', 'update'], scope: 'own' },
  ],
  billing: [
    { resource: 'authorization', actions: '*', scope: 'all' },
    { resource: 'patient', actions: ['read'], scope: 'all' },
    { resource: 'appointment', actions: ['read'], scope: 'all' },
    { resource: 'progress-report', actions: ['read'], scope: 'all' },
  ],
  parent: [
    { resource: 'patient', actions: ['read'], scope: 'own' },
    { resource: 'appointment', actions: ['read'], scope: 'own' },
    { resource: 'authorization', actions: ['read'], scope: 'own' },
    { resource: 'progress-report', actions: ['read'], scope: 'own' },
    { resource: 'chat', actions: '*', scope: 'own' },
  ],
  readonly: [
    { resource: 'patient', actions: ['read'], scope: 'all' },
    { resource: 'appointment', actions: ['read'], scope: 'all' },
    { resource: 'authorization', actions: ['read'], scope: 'all' },
    { resource: 'progress-report', actions: ['read'], scope: 'all' },
  ],
};

// =============================================================================
// Access Controller
// =============================================================================

export class AccessController extends EventEmitter {
  private readonly auditLogger: AuditLogger;
  private readonly customPermissions = new Map<string, Permission[]>();

  constructor(options: AccessControllerOptions) {
    super();
    this.auditLogger = options.auditLogger;
  }

  /**
   * Check if a user has access to perform an action
   */
  async checkAccess(request: AccessRequest): Promise<AccessResult> {
    const { context, resourceType, resourceId, action, resourceOwnerId, assignedUserIds } = request;

    // Get permissions for role
    const permissions = this.getPermissions(context.userId, context.userRole);

    // Check each permission
    for (const permission of permissions) {
      if (this.matchesPermission(permission, resourceType, action)) {
        // Check scope
        const scopeAllowed = this.checkScope(
          permission.scope ?? 'all',
          context.userId,
          resourceOwnerId,
          assignedUserIds
        );

        if (scopeAllowed) {
          return { allowed: true };
        }
      }
    }

    // Access denied - log it
    await this.auditLogger.logPermissionDenied(
      context,
      resourceType,
      resourceId,
      action,
      `${resourceType}:${action}`
    );

    this.emit(HEALTH_EVENTS.ACCESS_DENIED, {
      userId: context.userId,
      userRole: context.userRole,
      resourceType,
      resourceId,
      action,
      timestamp: Date.now(),
    });

    return {
      allowed: false,
      reason: 'Insufficient permissions',
      requiredPermission: `${resourceType}:${action}`,
    };
  }

  /**
   * Require access (throws if denied)
   */
  async requireAccess(request: AccessRequest): Promise<void> {
    const result = await this.checkAccess(request);

    if (!result.allowed) {
      throw new AccessDeniedError(
        result.reason ?? 'Access denied',
        result.requiredPermission
      );
    }
  }

  /**
   * Check if user has a specific permission
   */
  hasPermission(
    userId: string,
    userRole: AccessLevel,
    resourceType: AuditResourceType,
    action: AuditAction
  ): boolean {
    const permissions = this.getPermissions(userId, userRole);

    return permissions.some((p) => this.matchesPermission(p, resourceType, action));
  }

  /**
   * Get all permissions for a user
   */
  getPermissions(userId: string, role: AccessLevel): Permission[] {
    const rolePermissions = ROLE_PERMISSIONS[role] ?? [];
    const customPermissions = this.customPermissions.get(userId) ?? [];

    return [...rolePermissions, ...customPermissions];
  }

  /**
   * Add custom permission for a user
   */
  addCustomPermission(userId: string, permission: Permission): void {
    const existing = this.customPermissions.get(userId) ?? [];
    existing.push(permission);
    this.customPermissions.set(userId, existing);
  }

  /**
   * Remove custom permission from a user
   */
  removeCustomPermission(
    userId: string,
    resourceType: AuditResourceType,
    action: AuditAction
  ): void {
    const existing = this.customPermissions.get(userId);
    if (!existing) return;

    const filtered = existing.filter(
      (p) => !this.matchesPermission(p, resourceType, action)
    );
    this.customPermissions.set(userId, filtered);
  }

  /**
   * Clear all custom permissions for a user
   */
  clearCustomPermissions(userId: string): void {
    this.customPermissions.delete(userId);
  }

  /**
   * Get list of resources a user can access
   */
  getAccessibleResources(
    userRole: AccessLevel,
    action: AuditAction
  ): AuditResourceType[] {
    const permissions = ROLE_PERMISSIONS[userRole] ?? [];
    const resources: AuditResourceType[] = [];

    for (const permission of permissions) {
      if (permission.resource === '*') {
        return ['patient', 'appointment', 'authorization', 'progress-report', 'schedule', 'session-data', 'chat', 'audit-log', 'billing', 'user'];
      }

      if (permission.actions === '*' || permission.actions.includes(action)) {
        resources.push(permission.resource);
      }
    }

    return [...new Set(resources)];
  }

  /**
   * Get list of actions a user can perform on a resource
   */
  getAllowedActions(
    userRole: AccessLevel,
    resourceType: AuditResourceType
  ): AuditAction[] {
    const permissions = ROLE_PERMISSIONS[userRole] ?? [];
    const actions: AuditAction[] = [];

    for (const permission of permissions) {
      if (permission.resource === '*' || permission.resource === resourceType) {
        if (permission.actions === '*') {
          return ['create', 'read', 'update', 'delete', 'export', 'share', 'login', 'logout'];
        }
        actions.push(...permission.actions);
      }
    }

    return [...new Set(actions)];
  }

  /**
   * Validate role hierarchy
   */
  canManageRole(managerRole: AccessLevel, targetRole: AccessLevel): boolean {
    const hierarchy: Record<AccessLevel, number> = {
      admin: 5,
      supervisor: 4,
      billing: 3,
      rbt: 2,
      parent: 1,
      readonly: 0,
    };

    return hierarchy[managerRole] > hierarchy[targetRole];
  }

  /**
   * Create an audit context for access checks
   */
  createContext(
    userId: string,
    userRole: AccessLevel,
    options?: Partial<AuditContext>
  ): AuditContext {
    return {
      userId,
      userRole,
      sessionId: options?.sessionId,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      requestId: options?.requestId ?? crypto.randomUUID(),
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Check if a permission matches the requested access
   */
  private matchesPermission(
    permission: Permission,
    resourceType: AuditResourceType,
    action: AuditAction
  ): boolean {
    // Check resource match
    if (permission.resource !== '*' && permission.resource !== resourceType) {
      return false;
    }

    // Check action match
    if (permission.actions !== '*' && !permission.actions.includes(action)) {
      return false;
    }

    return true;
  }

  /**
   * Check if scope allows access
   */
  private checkScope(
    scope: 'own' | 'assigned' | 'all',
    userId: string,
    resourceOwnerId?: string,
    assignedUserIds?: string[]
  ): boolean {
    switch (scope) {
      case 'all':
        return true;

      case 'own':
        return resourceOwnerId === userId;

      case 'assigned':
        return assignedUserIds?.includes(userId) ?? false;

      default:
        return false;
    }
  }
}

// =============================================================================
// Access Denied Error
// =============================================================================

export class AccessDeniedError extends Error {
  constructor(
    message: string,
    public readonly requiredPermission?: string
  ) {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

// =============================================================================
// Access Control Middleware Helper
// =============================================================================

export function createAccessMiddleware(accessController: AccessController) {
  return async function accessMiddleware(
    userId: string,
    userRole: AccessLevel,
    resourceType: AuditResourceType,
    resourceId: string,
    action: AuditAction,
    options?: {
      resourceOwnerId?: string;
      assignedUserIds?: string[];
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    const context = accessController.createContext(userId, userRole, {
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    await accessController.requireAccess({
      context,
      resourceType,
      resourceId,
      action,
      resourceOwnerId: options?.resourceOwnerId,
      assignedUserIds: options?.assignedUserIds,
    });
  };
}
