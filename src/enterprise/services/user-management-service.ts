/**
 * User Management Service
 *
 * Business logic for enterprise user management
 */

import { randomBytes } from 'crypto';
import type {
  EnterpriseUser,
  EnterpriseUserCreateInput,
  EnterpriseUserUpdateInput,
  EnterpriseRole,
  UserInvitation,
  TenantContext,
} from '../types.js';
import type { EnterpriseUserStore, UserQueryOptions } from '../stores/user-store.js';
import type { TenantStore } from '../stores/tenant-store.js';
import { EnterpriseError } from '../types.js';
import { ENTERPRISE_DEFAULTS, canManageRole, getTierLimits, ROLE_HIERARCHY } from '../constants.js';

// =============================================================================
// Service Configuration
// =============================================================================

export interface UserManagementServiceConfig {
  /** Invitation expiration in days */
  invitationExpirationDays: number;
  /** Maximum pending invitations per tenant */
  maxPendingInvitationsPerTenant: number;
  /** Whether to send invitation emails */
  sendInvitationEmails: boolean;
}

const DEFAULT_CONFIG: UserManagementServiceConfig = {
  invitationExpirationDays: ENTERPRISE_DEFAULTS.INVITATION_EXPIRATION_DAYS,
  maxPendingInvitationsPerTenant: 100,
  sendInvitationEmails: true,
};

// =============================================================================
// User Management Service
// =============================================================================

export class UserManagementService {
  private readonly config: UserManagementServiceConfig;

  constructor(
    private readonly userStore: EnterpriseUserStore,
    private readonly tenantStore: TenantStore,
    config?: Partial<UserManagementServiceConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Invite a new user to the tenant
   */
  async inviteUser(
    tenantId: string,
    invitedBy: string,
    email: string,
    role: EnterpriseRole,
    options?: { name?: string }
  ): Promise<UserInvitation> {
    // Verify tenant exists and is active
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }
    if (tenant.status !== 'active') {
      throw new EnterpriseError('TENANT_SUSPENDED', 'Tenant is not active', 403);
    }

    // Check if inviter can invite this role
    const inviter = await this.userStore.getUser(invitedBy);
    if (!inviter || inviter.tenantId !== tenantId) {
      throw new EnterpriseError('USER_NOT_FOUND', 'Inviter not found', 404);
    }

    if (role !== 'member' && !canManageRole(inviter.role, role)) {
      throw new EnterpriseError(
        'FEATURE_NOT_AVAILABLE',
        `Cannot invite user with role ${role}`,
        403
      );
    }

    // Check user limits
    const limits = getTierLimits(tenant.tier);
    const currentUserCount = await this.userStore.countUsers(tenantId);
    if (currentUserCount >= limits.maxUsers) {
      throw new EnterpriseError(
        'USAGE_LIMIT_EXCEEDED',
        `User limit (${limits.maxUsers}) reached for ${tenant.tier} tier`,
        403
      );
    }

    // Check if user already exists
    const existingUser = await this.userStore.getUserByEmail(tenantId, email);
    if (existingUser) {
      throw new EnterpriseError(
        'USER_ALREADY_EXISTS',
        'User with this email already exists in this tenant',
        400
      );
    }

    // Check pending invitation limit
    const pendingInvitations = await this.userStore.listPendingInvitations(tenantId);
    if (pendingInvitations.length >= this.config.maxPendingInvitationsPerTenant) {
      throw new EnterpriseError(
        'USAGE_LIMIT_EXCEEDED',
        'Too many pending invitations',
        400
      );
    }

    // Check if already invited
    const existingInvitation = pendingInvitations.find(
      i => i.email.toLowerCase() === email.toLowerCase()
    );
    if (existingInvitation) {
      throw new EnterpriseError(
        'USER_ALREADY_EXISTS',
        'User has already been invited',
        400
      );
    }

    // Generate invitation token
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + this.config.invitationExpirationDays * 24 * 60 * 60 * 1000;

    // Create invitation
    const invitation = await this.userStore.createInvitation({
      tenantId,
      email: email.toLowerCase(),
      role,
      token,
      invitedBy,
      expiresAt,
      accepted: false,
    });

    // Create user record in invited state
    await this.userStore.createUser({
      tenantId,
      email: email.toLowerCase(),
      name: options?.name ?? email.split('@')[0],
      role,
      status: 'invited',
      mfaEnabled: false,
      invitedAt: Date.now(),
    });

    // TODO: Send invitation email if configured

    return invitation;
  }

  /**
   * Accept an invitation
   */
  async acceptInvitation(
    token: string,
    userInfo: { name: string; avatarUrl?: string }
  ): Promise<EnterpriseUser> {
    const invitation = await this.userStore.getInvitationByToken(token);

    if (!invitation) {
      throw new EnterpriseError('INVITATION_INVALID', 'Invalid invitation token', 400);
    }

    if (invitation.accepted) {
      throw new EnterpriseError('INVITATION_INVALID', 'Invitation has already been accepted', 400);
    }

    if (invitation.expiresAt < Date.now()) {
      throw new EnterpriseError('INVITATION_EXPIRED', 'Invitation has expired', 400);
    }

    // Update invitation
    await this.userStore.acceptInvitation(token);

    // Find and activate user
    const user = await this.userStore.getUserByEmail(invitation.tenantId, invitation.email);
    if (!user) {
      throw new EnterpriseError('USER_NOT_FOUND', 'User record not found', 404);
    }

    const now = Date.now();
    const updated = await this.userStore.updateUser(user.id, {
      name: userInfo.name,
      avatarUrl: userInfo.avatarUrl,
      status: 'active',
      invitationAcceptedAt: now,
      lastLoginAt: now,
    });

    if (!updated) {
      throw new EnterpriseError('USER_NOT_FOUND', 'User not found', 404);
    }

    return updated;
  }

  /**
   * Get user by ID
   */
  async getUser(userId: string): Promise<EnterpriseUser> {
    const user = await this.userStore.getUser(userId);
    if (!user) {
      throw new EnterpriseError('USER_NOT_FOUND', 'User not found', 404);
    }
    return user;
  }

  /**
   * Get user by email within a tenant
   */
  async getUserByEmail(tenantId: string, email: string): Promise<EnterpriseUser | null> {
    return this.userStore.getUserByEmail(tenantId, email);
  }

  /**
   * Update user
   */
  async updateUser(
    userId: string,
    updates: EnterpriseUserUpdateInput,
    updatedBy?: string
  ): Promise<EnterpriseUser> {
    const user = await this.getUser(userId);

    // If updating role, check permissions
    if (updates.role && updates.role !== user.role && updatedBy) {
      const updater = await this.userStore.getUser(updatedBy);
      if (!updater || updater.tenantId !== user.tenantId) {
        throw new EnterpriseError('USER_NOT_FOUND', 'Updater not found', 404);
      }

      if (!canManageRole(updater.role, user.role)) {
        throw new EnterpriseError(
          'FEATURE_NOT_AVAILABLE',
          'Cannot modify this user',
          403
        );
      }

      if (!canManageRole(updater.role, updates.role)) {
        throw new EnterpriseError(
          'FEATURE_NOT_AVAILABLE',
          `Cannot assign role ${updates.role}`,
          403
        );
      }

      // Cannot demote or promote owner except through transferOwnership
      if (user.role === 'owner' || updates.role === 'owner') {
        throw new EnterpriseError(
          'FEATURE_NOT_AVAILABLE',
          'Cannot change owner role directly. Use transfer ownership instead.',
          403
        );
      }
    }

    const updated = await this.userStore.updateUser(userId, updates);
    if (!updated) {
      throw new EnterpriseError('USER_NOT_FOUND', 'User not found', 404);
    }

    return updated;
  }

  /**
   * Change user role
   */
  async changeUserRole(
    userId: string,
    newRole: EnterpriseRole,
    changedBy: string
  ): Promise<EnterpriseUser> {
    return this.updateUser(userId, { role: newRole }, changedBy);
  }

  /**
   * Suspend user
   */
  async suspendUser(userId: string, suspendedBy?: string): Promise<EnterpriseUser> {
    const user = await this.getUser(userId);

    // Cannot suspend owner
    if (user.role === 'owner') {
      throw new EnterpriseError(
        'FEATURE_NOT_AVAILABLE',
        'Cannot suspend the tenant owner',
        403
      );
    }

    if (suspendedBy) {
      const suspender = await this.userStore.getUser(suspendedBy);
      if (!suspender || suspender.tenantId !== user.tenantId) {
        throw new EnterpriseError('USER_NOT_FOUND', 'Suspender not found', 404);
      }

      if (!canManageRole(suspender.role, user.role)) {
        throw new EnterpriseError(
          'FEATURE_NOT_AVAILABLE',
          'Cannot suspend this user',
          403
        );
      }
    }

    const updated = await this.userStore.updateUser(userId, { status: 'suspended' });
    if (!updated) {
      throw new EnterpriseError('USER_NOT_FOUND', 'User not found', 404);
    }

    return updated;
  }

  /**
   * Reactivate suspended user
   */
  async reactivateUser(userId: string): Promise<EnterpriseUser> {
    const user = await this.getUser(userId);

    if (user.status !== 'suspended') {
      return user;
    }

    const updated = await this.userStore.updateUser(userId, { status: 'active' });
    if (!updated) {
      throw new EnterpriseError('USER_NOT_FOUND', 'User not found', 404);
    }

    return updated;
  }

  /**
   * Remove user from tenant
   */
  async removeUser(userId: string, removedBy?: string): Promise<void> {
    const user = await this.getUser(userId);

    // Cannot remove owner
    if (user.role === 'owner') {
      throw new EnterpriseError(
        'FEATURE_NOT_AVAILABLE',
        'Cannot remove the tenant owner. Transfer ownership first.',
        403
      );
    }

    if (removedBy) {
      const remover = await this.userStore.getUser(removedBy);
      if (!remover || remover.tenantId !== user.tenantId) {
        throw new EnterpriseError('USER_NOT_FOUND', 'Remover not found', 404);
      }

      if (!canManageRole(remover.role, user.role)) {
        throw new EnterpriseError(
          'FEATURE_NOT_AVAILABLE',
          'Cannot remove this user',
          403
        );
      }
    }

    await this.userStore.deleteUser(userId);
  }

  /**
   * List users in a tenant
   */
  async listUsers(tenantId: string, options?: Omit<UserQueryOptions, 'tenantId'>): Promise<EnterpriseUser[]> {
    return this.userStore.listUsers({ ...options, tenantId });
  }

  /**
   * Count users in a tenant
   */
  async countUsers(tenantId: string, options?: Omit<UserQueryOptions, 'tenantId'>): Promise<number> {
    return this.userStore.countUsers(tenantId, options);
  }

  /**
   * List pending invitations
   */
  async listPendingInvitations(tenantId: string): Promise<UserInvitation[]> {
    return this.userStore.listPendingInvitations(tenantId);
  }

  /**
   * Resend invitation
   */
  async resendInvitation(invitationId: string): Promise<UserInvitation> {
    const invitations = await this.userStore.listPendingInvitations(''); // Get all to find by ID
    // This is inefficient but works for now - in production you'd have getInvitationById
    const invitation = invitations.find(i => i.id === invitationId);

    if (!invitation) {
      throw new EnterpriseError('INVITATION_INVALID', 'Invitation not found', 404);
    }

    if (invitation.accepted) {
      throw new EnterpriseError('INVITATION_INVALID', 'Invitation has already been accepted', 400);
    }

    // TODO: Send invitation email

    return invitation;
  }

  /**
   * Cancel/revoke invitation
   */
  async cancelInvitation(invitationId: string, tenantId: string): Promise<void> {
    const invitations = await this.userStore.listPendingInvitations(tenantId);
    const invitation = invitations.find(i => i.id === invitationId);

    if (!invitation) {
      throw new EnterpriseError('INVITATION_INVALID', 'Invitation not found', 404);
    }

    // Delete the invitation
    await this.userStore.deleteInvitation(invitationId);

    // Also delete the invited user record
    const user = await this.userStore.getUserByEmail(tenantId, invitation.email);
    if (user && user.status === 'invited') {
      await this.userStore.deleteUser(user.id);
    }
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(userId: string): Promise<void> {
    await this.userStore.updateLastLogin(userId);
  }

  /**
   * Get user permissions based on role
   */
  getUserPermissions(role: EnterpriseRole): string[] {
    const roleIndex = ROLE_HIERARCHY.indexOf(role);
    const permissions: Set<string> = new Set();

    // Accumulate permissions from all roles at and below this level
    for (let i = 0; i <= roleIndex; i++) {
      const r = ROLE_HIERARCHY[i];
      // Import ROLE_PERMISSIONS dynamically to avoid circular deps
      const ROLE_PERMISSIONS: Record<EnterpriseRole, string[]> = {
        member: ['read:dashboard', 'read:bots', 'use:bots'],
        analyst: ['read:dashboard', 'read:bots', 'use:bots', 'read:analytics', 'read:logs'],
        developer: ['read:dashboard', 'read:bots', 'use:bots', 'read:analytics', 'read:logs', 'write:bots', 'read:api-keys', 'write:api-keys'],
        admin: ['read:dashboard', 'read:bots', 'use:bots', 'read:analytics', 'read:logs', 'write:bots', 'read:api-keys', 'write:api-keys', 'read:users', 'write:users', 'read:settings', 'write:settings', 'read:billing'],
        owner: ['read:dashboard', 'read:bots', 'use:bots', 'read:analytics', 'read:logs', 'write:bots', 'read:api-keys', 'write:api-keys', 'read:users', 'write:users', 'read:settings', 'write:settings', 'read:billing', 'write:billing', 'delete:tenant', 'transfer:ownership'],
      };
      for (const p of ROLE_PERMISSIONS[r]) {
        permissions.add(p);
      }
    }

    return Array.from(permissions);
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(role: EnterpriseRole, permission: string): boolean {
    return this.getUserPermissions(role).includes(permission);
  }
}

/**
 * Create user management service
 */
export function createUserManagementService(
  userStore: EnterpriseUserStore,
  tenantStore: TenantStore,
  config?: Partial<UserManagementServiceConfig>
): UserManagementService {
  return new UserManagementService(userStore, tenantStore, config);
}
