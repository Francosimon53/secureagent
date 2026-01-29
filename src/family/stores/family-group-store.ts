/**
 * Family Group Store
 *
 * Persistence layer for family groups and members.
 */

import { randomUUID } from 'crypto';
import type {
  DatabaseAdapter,
  FamilyGroup,
  FamilyGroupQueryOptions,
  FamilyGroupSettings,
  FamilyMember,
  FamilyMemberRole,
} from '../types.js';

// ============================================================================
// Store Interface
// ============================================================================

export interface FamilyGroupStore {
  initialize(): Promise<void>;

  // Family Group CRUD
  createGroup(group: Omit<FamilyGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<FamilyGroup>;
  getGroup(id: string): Promise<FamilyGroup | null>;
  updateGroup(id: string, updates: Partial<Omit<FamilyGroup, 'id' | 'createdAt'>>): Promise<FamilyGroup | null>;
  deleteGroup(id: string): Promise<boolean>;

  // Query
  listGroups(options?: FamilyGroupQueryOptions): Promise<FamilyGroup[]>;
  getGroupsByUser(userId: string): Promise<FamilyGroup[]>;
  countGroups(userId: string): Promise<number>;

  // Member Management
  addMember(groupId: string, member: Omit<FamilyMember, 'joinedAt'>): Promise<FamilyGroup | null>;
  updateMember(groupId: string, userId: string, updates: Partial<FamilyMember>): Promise<FamilyGroup | null>;
  removeMember(groupId: string, userId: string): Promise<FamilyGroup | null>;
  getMemberRole(groupId: string, userId: string): Promise<FamilyMemberRole | null>;

  // Settings
  updateSettings(groupId: string, settings: Partial<FamilyGroupSettings>): Promise<FamilyGroup | null>;
}

// ============================================================================
// Database Implementation
// ============================================================================

interface FamilyGroupRow {
  id: string;
  name: string;
  created_by: string;
  members: string;
  settings: string;
  created_at: number;
  updated_at: number;
}

export class DatabaseFamilyGroupStore implements FamilyGroupStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS family_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_by TEXT NOT NULL,
        members TEXT NOT NULL,
        settings TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_family_groups_created_by ON family_groups(created_by)
    `);
  }

  async createGroup(group: Omit<FamilyGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<FamilyGroup> {
    const now = Date.now();
    const id = randomUUID();

    const newGroup: FamilyGroup = {
      ...group,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO family_groups (id, name, created_by, members, settings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        newGroup.id,
        newGroup.name,
        newGroup.createdBy,
        JSON.stringify(newGroup.members),
        JSON.stringify(newGroup.settings),
        newGroup.createdAt,
        newGroup.updatedAt,
      ]
    );

    return newGroup;
  }

  async getGroup(id: string): Promise<FamilyGroup | null> {
    const { rows } = await this.db.query<FamilyGroupRow>(
      'SELECT * FROM family_groups WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.rowToGroup(rows[0]);
  }

  async updateGroup(id: string, updates: Partial<Omit<FamilyGroup, 'id' | 'createdAt'>>): Promise<FamilyGroup | null> {
    const existing = await this.getGroup(id);
    if (!existing) return null;

    const updated: FamilyGroup = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `UPDATE family_groups SET name = ?, members = ?, settings = ?, updated_at = ? WHERE id = ?`,
      [
        updated.name,
        JSON.stringify(updated.members),
        JSON.stringify(updated.settings),
        updated.updatedAt,
        id,
      ]
    );

    return updated;
  }

  async deleteGroup(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM family_groups WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async listGroups(options?: FamilyGroupQueryOptions): Promise<FamilyGroup[]> {
    let sql = 'SELECT * FROM family_groups';
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (options?.userId) {
      // Search for userId in members JSON array
      conditions.push('(members LIKE ? OR created_by = ?)');
      params.push(`%"userId":"${options.userId}"%`, options.userId);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const orderBy = options?.orderBy || 'created_at';
    const orderDir = options?.orderDirection || 'desc';
    sql += ` ORDER BY ${orderBy} ${orderDir}`;

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const { rows } = await this.db.query<FamilyGroupRow>(sql, params);
    return rows.map(row => this.rowToGroup(row));
  }

  async getGroupsByUser(userId: string): Promise<FamilyGroup[]> {
    return this.listGroups({ userId });
  }

  async countGroups(userId: string): Promise<number> {
    const { rows } = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM family_groups
       WHERE members LIKE ? OR created_by = ?`,
      [`%"userId":"${userId}"%`, userId]
    );
    return rows[0]?.count ?? 0;
  }

  async addMember(groupId: string, member: Omit<FamilyMember, 'joinedAt'>): Promise<FamilyGroup | null> {
    const group = await this.getGroup(groupId);
    if (!group) return null;

    // Check if member already exists
    if (group.members.some(m => m.userId === member.userId)) {
      return group;
    }

    const newMember: FamilyMember = {
      ...member,
      joinedAt: Date.now(),
    };

    group.members.push(newMember);
    return this.updateGroup(groupId, { members: group.members });
  }

  async updateMember(groupId: string, userId: string, updates: Partial<FamilyMember>): Promise<FamilyGroup | null> {
    const group = await this.getGroup(groupId);
    if (!group) return null;

    const memberIndex = group.members.findIndex(m => m.userId === userId);
    if (memberIndex === -1) return null;

    group.members[memberIndex] = {
      ...group.members[memberIndex],
      ...updates,
    };

    return this.updateGroup(groupId, { members: group.members });
  }

  async removeMember(groupId: string, userId: string): Promise<FamilyGroup | null> {
    const group = await this.getGroup(groupId);
    if (!group) return null;

    const memberIndex = group.members.findIndex(m => m.userId === userId);
    if (memberIndex === -1) return group;

    group.members.splice(memberIndex, 1);
    return this.updateGroup(groupId, { members: group.members });
  }

  async getMemberRole(groupId: string, userId: string): Promise<FamilyMemberRole | null> {
    const group = await this.getGroup(groupId);
    if (!group) return null;

    const member = group.members.find(m => m.userId === userId);
    return member?.role ?? null;
  }

  async updateSettings(groupId: string, settings: Partial<FamilyGroupSettings>): Promise<FamilyGroup | null> {
    const group = await this.getGroup(groupId);
    if (!group) return null;

    const updatedSettings: FamilyGroupSettings = {
      ...group.settings,
      ...settings,
    };

    return this.updateGroup(groupId, { settings: updatedSettings });
  }

  private rowToGroup(row: FamilyGroupRow): FamilyGroup {
    return {
      id: row.id,
      name: row.name,
      createdBy: row.created_by,
      members: JSON.parse(row.members) as FamilyMember[],
      settings: JSON.parse(row.settings) as FamilyGroupSettings,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ============================================================================
// In-Memory Implementation
// ============================================================================

export class InMemoryFamilyGroupStore implements FamilyGroupStore {
  private groups = new Map<string, FamilyGroup>();

  async initialize(): Promise<void> {
    // No initialization needed for in-memory store
  }

  async createGroup(group: Omit<FamilyGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<FamilyGroup> {
    const now = Date.now();
    const id = randomUUID();

    const newGroup: FamilyGroup = {
      ...group,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.groups.set(id, newGroup);
    return newGroup;
  }

  async getGroup(id: string): Promise<FamilyGroup | null> {
    return this.groups.get(id) ?? null;
  }

  async updateGroup(id: string, updates: Partial<Omit<FamilyGroup, 'id' | 'createdAt'>>): Promise<FamilyGroup | null> {
    const existing = this.groups.get(id);
    if (!existing) return null;

    const updated: FamilyGroup = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.groups.set(id, updated);
    return updated;
  }

  async deleteGroup(id: string): Promise<boolean> {
    return this.groups.delete(id);
  }

  async listGroups(options?: FamilyGroupQueryOptions): Promise<FamilyGroup[]> {
    let groups = Array.from(this.groups.values());

    if (options?.userId) {
      groups = groups.filter(g =>
        g.createdBy === options.userId ||
        g.members.some(m => m.userId === options.userId)
      );
    }

    if (options?.role) {
      groups = groups.filter(g =>
        g.members.some(m => m.userId === options.userId && m.role === options.role)
      );
    }

    // Sort
    const orderBy = options?.orderBy || 'createdAt';
    const orderDir = options?.orderDirection || 'desc';
    groups.sort((a, b) => {
      const aVal = a[orderBy as keyof FamilyGroup] as number;
      const bVal = b[orderBy as keyof FamilyGroup] as number;
      return orderDir === 'desc' ? bVal - aVal : aVal - bVal;
    });

    // Pagination
    if (options?.offset) {
      groups = groups.slice(options.offset);
    }
    if (options?.limit) {
      groups = groups.slice(0, options.limit);
    }

    return groups;
  }

  async getGroupsByUser(userId: string): Promise<FamilyGroup[]> {
    return this.listGroups({ userId });
  }

  async countGroups(userId: string): Promise<number> {
    const groups = await this.getGroupsByUser(userId);
    return groups.length;
  }

  async addMember(groupId: string, member: Omit<FamilyMember, 'joinedAt'>): Promise<FamilyGroup | null> {
    const group = this.groups.get(groupId);
    if (!group) return null;

    if (group.members.some(m => m.userId === member.userId)) {
      return group;
    }

    const newMember: FamilyMember = {
      ...member,
      joinedAt: Date.now(),
    };

    group.members.push(newMember);
    group.updatedAt = Date.now();
    return group;
  }

  async updateMember(groupId: string, userId: string, updates: Partial<FamilyMember>): Promise<FamilyGroup | null> {
    const group = this.groups.get(groupId);
    if (!group) return null;

    const memberIndex = group.members.findIndex(m => m.userId === userId);
    if (memberIndex === -1) return null;

    group.members[memberIndex] = {
      ...group.members[memberIndex],
      ...updates,
    };
    group.updatedAt = Date.now();

    return group;
  }

  async removeMember(groupId: string, userId: string): Promise<FamilyGroup | null> {
    const group = this.groups.get(groupId);
    if (!group) return null;

    const memberIndex = group.members.findIndex(m => m.userId === userId);
    if (memberIndex === -1) return group;

    group.members.splice(memberIndex, 1);
    group.updatedAt = Date.now();

    return group;
  }

  async getMemberRole(groupId: string, userId: string): Promise<FamilyMemberRole | null> {
    const group = this.groups.get(groupId);
    if (!group) return null;

    const member = group.members.find(m => m.userId === userId);
    return member?.role ?? null;
  }

  async updateSettings(groupId: string, settings: Partial<FamilyGroupSettings>): Promise<FamilyGroup | null> {
    const group = this.groups.get(groupId);
    if (!group) return null;

    group.settings = {
      ...group.settings,
      ...settings,
    };
    group.updatedAt = Date.now();

    return group;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createFamilyGroupStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): FamilyGroupStore {
  if (type === 'database' && dbAdapter) {
    return new DatabaseFamilyGroupStore(dbAdapter);
  }
  return new InMemoryFamilyGroupStore();
}
