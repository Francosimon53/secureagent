/**
 * Enterprise User Store
 *
 * Persistence layer for enterprise users within tenants
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from './index.js';
import type {
  EnterpriseUser,
  EnterpriseUserCreateInput,
  EnterpriseUserUpdateInput,
  EnterpriseRole,
  EnterpriseUserStatus,
  UserInvitation,
} from '../types.js';

// =============================================================================
// User Store Interface
// =============================================================================

/** Query options for listing users */
export interface UserQueryOptions {
  /** Filter by tenant ID */
  tenantId: string;
  /** Filter by role */
  role?: EnterpriseRole;
  /** Filter by status */
  status?: EnterpriseUserStatus;
  /** Search by email or name */
  search?: string;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

export interface EnterpriseUserStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Create a new user */
  createUser(input: EnterpriseUserCreateInput): Promise<EnterpriseUser>;

  /** Get user by ID */
  getUser(userId: string): Promise<EnterpriseUser | null>;

  /** Get user by email within a tenant */
  getUserByEmail(tenantId: string, email: string): Promise<EnterpriseUser | null>;

  /** Get user by SSO subject ID */
  getUserBySSOSubject(tenantId: string, provider: string, subjectId: string): Promise<EnterpriseUser | null>;

  /** Update user */
  updateUser(userId: string, updates: EnterpriseUserUpdateInput): Promise<EnterpriseUser | null>;

  /** Delete user */
  deleteUser(userId: string): Promise<boolean>;

  /** List users */
  listUsers(options: UserQueryOptions): Promise<EnterpriseUser[]>;

  /** Count users */
  countUsers(tenantId: string, options?: Omit<UserQueryOptions, 'tenantId'>): Promise<number>;

  /** Create invitation */
  createInvitation(invitation: Omit<UserInvitation, 'id' | 'createdAt'>): Promise<UserInvitation>;

  /** Get invitation by token */
  getInvitationByToken(token: string): Promise<UserInvitation | null>;

  /** Accept invitation */
  acceptInvitation(token: string): Promise<UserInvitation | null>;

  /** List pending invitations for a tenant */
  listPendingInvitations(tenantId: string): Promise<UserInvitation[]>;

  /** Delete invitation */
  deleteInvitation(invitationId: string): Promise<boolean>;

  /** Update last login */
  updateLastLogin(userId: string): Promise<void>;
}

// =============================================================================
// Database Row Types
// =============================================================================

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  sso_provider: string | null;
  sso_subject_id: string | null;
  mfa_enabled: number;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  last_login_at: number | null;
  invited_at: number | null;
  invitation_accepted_at: number | null;
  created_at: number;
  updated_at: number;
}

interface InvitationRow {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  token: string;
  invited_by: string;
  expires_at: number;
  accepted: number;
  accepted_at: number | null;
  created_at: number;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseEnterpriseUserStore implements EnterpriseUserStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Users table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS enterprise_users (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        status TEXT NOT NULL DEFAULT 'invited',
        sso_provider TEXT,
        sso_subject_id TEXT,
        mfa_enabled INTEGER NOT NULL DEFAULT 0,
        avatar_url TEXT,
        job_title TEXT,
        department TEXT,
        last_login_at INTEGER,
        invited_at INTEGER,
        invitation_accepted_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(tenant_id, email)
      )
    `);

    // Invitations table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS enterprise_invitations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        invited_by TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        accepted INTEGER NOT NULL DEFAULT 0,
        accepted_at INTEGER,
        created_at INTEGER NOT NULL
      )
    `);

    // Create indexes
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_enterprise_users_tenant_id ON enterprise_users(tenant_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_enterprise_users_email ON enterprise_users(tenant_id, email)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_enterprise_users_sso ON enterprise_users(tenant_id, sso_provider, sso_subject_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_enterprise_invitations_token ON enterprise_invitations(token)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_enterprise_invitations_tenant ON enterprise_invitations(tenant_id, accepted)
    `);
  }

  async createUser(input: EnterpriseUserCreateInput): Promise<EnterpriseUser> {
    const now = Date.now();
    const user: EnterpriseUser = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO enterprise_users (
        id, tenant_id, email, name, role, status, sso_provider, sso_subject_id,
        mfa_enabled, avatar_url, job_title, department, last_login_at,
        invited_at, invitation_accepted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.tenantId,
        user.email,
        user.name,
        user.role,
        user.status,
        user.ssoProvider ?? null,
        user.ssoSubjectId ?? null,
        user.mfaEnabled ? 1 : 0,
        user.avatarUrl ?? null,
        user.jobTitle ?? null,
        user.department ?? null,
        user.lastLoginAt ?? null,
        user.invitedAt ?? null,
        user.invitationAcceptedAt ?? null,
        user.createdAt,
        user.updatedAt,
      ]
    );

    return user;
  }

  async getUser(userId: string): Promise<EnterpriseUser | null> {
    const result = await this.db.execute<UserRow>(
      'SELECT * FROM enterprise_users WHERE id = ?',
      [userId]
    );
    return result.length > 0 ? this.rowToUser(result[0]) : null;
  }

  async getUserByEmail(tenantId: string, email: string): Promise<EnterpriseUser | null> {
    const result = await this.db.execute<UserRow>(
      'SELECT * FROM enterprise_users WHERE tenant_id = ? AND email = ?',
      [tenantId, email.toLowerCase()]
    );
    return result.length > 0 ? this.rowToUser(result[0]) : null;
  }

  async getUserBySSOSubject(tenantId: string, provider: string, subjectId: string): Promise<EnterpriseUser | null> {
    const result = await this.db.execute<UserRow>(
      'SELECT * FROM enterprise_users WHERE tenant_id = ? AND sso_provider = ? AND sso_subject_id = ?',
      [tenantId, provider, subjectId]
    );
    return result.length > 0 ? this.rowToUser(result[0]) : null;
  }

  async updateUser(userId: string, updates: EnterpriseUserUpdateInput): Promise<EnterpriseUser | null> {
    const existing = await this.getUser(userId);
    if (!existing) return null;

    const updated: EnterpriseUser = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `UPDATE enterprise_users SET
        email = ?, name = ?, role = ?, status = ?, sso_provider = ?, sso_subject_id = ?,
        mfa_enabled = ?, avatar_url = ?, job_title = ?, department = ?,
        last_login_at = ?, invited_at = ?, invitation_accepted_at = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.email,
        updated.name,
        updated.role,
        updated.status,
        updated.ssoProvider ?? null,
        updated.ssoSubjectId ?? null,
        updated.mfaEnabled ? 1 : 0,
        updated.avatarUrl ?? null,
        updated.jobTitle ?? null,
        updated.department ?? null,
        updated.lastLoginAt ?? null,
        updated.invitedAt ?? null,
        updated.invitationAcceptedAt ?? null,
        updated.updatedAt,
        userId,
      ]
    );

    return updated;
  }

  async deleteUser(userId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM enterprise_users WHERE id = ?',
      [userId]
    );
    return (result as any).changes > 0;
  }

  async listUsers(options: UserQueryOptions): Promise<EnterpriseUser[]> {
    const { sql, params } = this.buildUserQuerySQL(options);
    const result = await this.db.execute<UserRow>(sql, params);
    return result.map(row => this.rowToUser(row));
  }

  async countUsers(tenantId: string, options: Omit<UserQueryOptions, 'tenantId'> = {}): Promise<number> {
    const { sql, params } = this.buildUserQuerySQL({ ...options, tenantId }, true);
    const result = await this.db.execute<{ count: number }>(sql, params);
    return result[0]?.count ?? 0;
  }

  async createInvitation(input: Omit<UserInvitation, 'id' | 'createdAt'>): Promise<UserInvitation> {
    const invitation: UserInvitation = {
      id: randomUUID(),
      ...input,
      createdAt: Date.now(),
    };

    await this.db.execute(
      `INSERT INTO enterprise_invitations (
        id, tenant_id, email, role, token, invited_by, expires_at, accepted, accepted_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invitation.id,
        invitation.tenantId,
        invitation.email.toLowerCase(),
        invitation.role,
        invitation.token,
        invitation.invitedBy,
        invitation.expiresAt,
        invitation.accepted ? 1 : 0,
        invitation.acceptedAt ?? null,
        invitation.createdAt,
      ]
    );

    return invitation;
  }

  async getInvitationByToken(token: string): Promise<UserInvitation | null> {
    const result = await this.db.execute<InvitationRow>(
      'SELECT * FROM enterprise_invitations WHERE token = ?',
      [token]
    );
    return result.length > 0 ? this.rowToInvitation(result[0]) : null;
  }

  async acceptInvitation(token: string): Promise<UserInvitation | null> {
    const invitation = await this.getInvitationByToken(token);
    if (!invitation || invitation.accepted) return null;

    const now = Date.now();
    await this.db.execute(
      'UPDATE enterprise_invitations SET accepted = 1, accepted_at = ? WHERE token = ?',
      [now, token]
    );

    return { ...invitation, accepted: true, acceptedAt: now };
  }

  async listPendingInvitations(tenantId: string): Promise<UserInvitation[]> {
    const result = await this.db.execute<InvitationRow>(
      'SELECT * FROM enterprise_invitations WHERE tenant_id = ? AND accepted = 0 ORDER BY created_at DESC',
      [tenantId]
    );
    return result.map(row => this.rowToInvitation(row));
  }

  async deleteInvitation(invitationId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM enterprise_invitations WHERE id = ?',
      [invitationId]
    );
    return (result as any).changes > 0;
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.db.execute(
      'UPDATE enterprise_users SET last_login_at = ?, updated_at = ? WHERE id = ?',
      [Date.now(), Date.now(), userId]
    );
  }

  private buildUserQuerySQL(options: UserQueryOptions, isCount = false): { sql: string; params: unknown[] } {
    let sql = isCount ? 'SELECT COUNT(*) as count FROM enterprise_users' : 'SELECT * FROM enterprise_users';
    const conditions: string[] = ['tenant_id = ?'];
    const params: unknown[] = [options.tenantId];

    if (options.role) {
      conditions.push('role = ?');
      params.push(options.role);
    }

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options.search) {
      conditions.push('(email LIKE ? OR name LIKE ?)');
      const searchPattern = `%${options.search}%`;
      params.push(searchPattern, searchPattern);
    }

    sql += ' WHERE ' + conditions.join(' AND ');

    if (!isCount) {
      sql += ' ORDER BY created_at DESC';

      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
      }

      if (options.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    return { sql, params };
  }

  private rowToUser(row: UserRow): EnterpriseUser {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      email: row.email,
      name: row.name,
      role: row.role as EnterpriseRole,
      status: row.status as EnterpriseUserStatus,
      ssoProvider: row.sso_provider ?? undefined,
      ssoSubjectId: row.sso_subject_id ?? undefined,
      mfaEnabled: row.mfa_enabled === 1,
      avatarUrl: row.avatar_url ?? undefined,
      jobTitle: row.job_title ?? undefined,
      department: row.department ?? undefined,
      lastLoginAt: row.last_login_at ?? undefined,
      invitedAt: row.invited_at ?? undefined,
      invitationAcceptedAt: row.invitation_accepted_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToInvitation(row: InvitationRow): UserInvitation {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      email: row.email,
      role: row.role as EnterpriseRole,
      token: row.token,
      invitedBy: row.invited_by,
      expiresAt: row.expires_at,
      accepted: row.accepted === 1,
      acceptedAt: row.accepted_at ?? undefined,
      createdAt: row.created_at,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryEnterpriseUserStore implements EnterpriseUserStore {
  private users = new Map<string, EnterpriseUser>();
  private emailIndex = new Map<string, string>(); // "tenantId:email" -> userId
  private ssoIndex = new Map<string, string>(); // "tenantId:provider:subjectId" -> userId
  private invitations = new Map<string, UserInvitation>();
  private tokenIndex = new Map<string, string>(); // token -> invitationId

  async initialize(): Promise<void> {
    // No-op
  }

  async createUser(input: EnterpriseUserCreateInput): Promise<EnterpriseUser> {
    // Check for duplicate email in tenant
    const emailKey = `${input.tenantId}:${input.email.toLowerCase()}`;
    if (this.emailIndex.has(emailKey)) {
      throw new Error(`User with email ${input.email} already exists in tenant ${input.tenantId}`);
    }

    const now = Date.now();
    const user: EnterpriseUser = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(user.id, user);
    this.emailIndex.set(emailKey, user.id);
    if (user.ssoProvider && user.ssoSubjectId) {
      this.ssoIndex.set(`${user.tenantId}:${user.ssoProvider}:${user.ssoSubjectId}`, user.id);
    }

    return { ...user };
  }

  async getUser(userId: string): Promise<EnterpriseUser | null> {
    const user = this.users.get(userId);
    return user ? { ...user } : null;
  }

  async getUserByEmail(tenantId: string, email: string): Promise<EnterpriseUser | null> {
    const userId = this.emailIndex.get(`${tenantId}:${email.toLowerCase()}`);
    if (!userId) return null;
    return this.getUser(userId);
  }

  async getUserBySSOSubject(tenantId: string, provider: string, subjectId: string): Promise<EnterpriseUser | null> {
    const userId = this.ssoIndex.get(`${tenantId}:${provider}:${subjectId}`);
    if (!userId) return null;
    return this.getUser(userId);
  }

  async updateUser(userId: string, updates: EnterpriseUserUpdateInput): Promise<EnterpriseUser | null> {
    const existing = this.users.get(userId);
    if (!existing) return null;

    // Update email index if email changed
    if (updates.email && updates.email !== existing.email) {
      this.emailIndex.delete(`${existing.tenantId}:${existing.email.toLowerCase()}`);
      this.emailIndex.set(`${existing.tenantId}:${updates.email.toLowerCase()}`, userId);
    }

    // Update SSO index
    if (updates.ssoProvider !== undefined || updates.ssoSubjectId !== undefined) {
      if (existing.ssoProvider && existing.ssoSubjectId) {
        this.ssoIndex.delete(`${existing.tenantId}:${existing.ssoProvider}:${existing.ssoSubjectId}`);
      }
      const newProvider = updates.ssoProvider ?? existing.ssoProvider;
      const newSubjectId = updates.ssoSubjectId ?? existing.ssoSubjectId;
      if (newProvider && newSubjectId) {
        this.ssoIndex.set(`${existing.tenantId}:${newProvider}:${newSubjectId}`, userId);
      }
    }

    const updated: EnterpriseUser = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.users.set(userId, updated);
    return { ...updated };
  }

  async deleteUser(userId: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    this.emailIndex.delete(`${user.tenantId}:${user.email.toLowerCase()}`);
    if (user.ssoProvider && user.ssoSubjectId) {
      this.ssoIndex.delete(`${user.tenantId}:${user.ssoProvider}:${user.ssoSubjectId}`);
    }
    this.users.delete(userId);

    return true;
  }

  async listUsers(options: UserQueryOptions): Promise<EnterpriseUser[]> {
    let users = Array.from(this.users.values()).filter(u => u.tenantId === options.tenantId);

    if (options.role) {
      users = users.filter(u => u.role === options.role);
    }
    if (options.status) {
      users = users.filter(u => u.status === options.status);
    }
    if (options.search) {
      const search = options.search.toLowerCase();
      users = users.filter(u =>
        u.email.toLowerCase().includes(search) ||
        u.name.toLowerCase().includes(search)
      );
    }

    users.sort((a, b) => b.createdAt - a.createdAt);

    if (options.offset) {
      users = users.slice(options.offset);
    }
    if (options.limit) {
      users = users.slice(0, options.limit);
    }

    return users.map(u => ({ ...u }));
  }

  async countUsers(tenantId: string, options: Omit<UserQueryOptions, 'tenantId'> = {}): Promise<number> {
    let users = Array.from(this.users.values()).filter(u => u.tenantId === tenantId);

    if (options.role) {
      users = users.filter(u => u.role === options.role);
    }
    if (options.status) {
      users = users.filter(u => u.status === options.status);
    }
    if (options.search) {
      const search = options.search.toLowerCase();
      users = users.filter(u =>
        u.email.toLowerCase().includes(search) ||
        u.name.toLowerCase().includes(search)
      );
    }

    return users.length;
  }

  async createInvitation(input: Omit<UserInvitation, 'id' | 'createdAt'>): Promise<UserInvitation> {
    const invitation: UserInvitation = {
      id: randomUUID(),
      ...input,
      createdAt: Date.now(),
    };

    this.invitations.set(invitation.id, invitation);
    this.tokenIndex.set(invitation.token, invitation.id);

    return { ...invitation };
  }

  async getInvitationByToken(token: string): Promise<UserInvitation | null> {
    const invitationId = this.tokenIndex.get(token);
    if (!invitationId) return null;
    const invitation = this.invitations.get(invitationId);
    return invitation ? { ...invitation } : null;
  }

  async acceptInvitation(token: string): Promise<UserInvitation | null> {
    const invitationId = this.tokenIndex.get(token);
    if (!invitationId) return null;

    const invitation = this.invitations.get(invitationId);
    if (!invitation || invitation.accepted) return null;

    const now = Date.now();
    const updated = { ...invitation, accepted: true, acceptedAt: now };
    this.invitations.set(invitationId, updated);

    return { ...updated };
  }

  async listPendingInvitations(tenantId: string): Promise<UserInvitation[]> {
    return Array.from(this.invitations.values())
      .filter(i => i.tenantId === tenantId && !i.accepted)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(i => ({ ...i }));
  }

  async deleteInvitation(invitationId: string): Promise<boolean> {
    const invitation = this.invitations.get(invitationId);
    if (!invitation) return false;

    this.tokenIndex.delete(invitation.token);
    this.invitations.delete(invitationId);

    return true;
  }

  async updateLastLogin(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.lastLoginAt = Date.now();
      user.updatedAt = Date.now();
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createEnterpriseUserStore(type: 'memory'): InMemoryEnterpriseUserStore;
export function createEnterpriseUserStore(type: 'database', db: DatabaseAdapter): DatabaseEnterpriseUserStore;
export function createEnterpriseUserStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): EnterpriseUserStore {
  if (type === 'memory') {
    return new InMemoryEnterpriseUserStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseEnterpriseUserStore(db);
}
