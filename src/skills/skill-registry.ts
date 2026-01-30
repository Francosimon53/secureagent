/**
 * Skill Registry
 *
 * Manages skill metadata and provides lookup/search functionality.
 * Supports both in-memory and SQLite-backed storage.
 */

import { randomUUID } from 'crypto';
import type {
  Skill,
  SkillMetadata,
  SkillCreateInput,
  SkillUpdateInput,
} from './types.js';
import { SkillError, SKILL_DEFAULTS } from './types.js';

// =============================================================================
// Registry Interface
// =============================================================================

export interface SkillRegistry {
  /** Initialize the registry */
  initialize(): Promise<void>;

  /** Register a new skill */
  register(input: SkillCreateInput, code: string): Promise<SkillMetadata>;

  /** Get skill by ID */
  get(id: string): Promise<SkillMetadata | null>;

  /** Get skill by name */
  getByName(name: string): Promise<SkillMetadata | null>;

  /** List all skills */
  list(options?: { enabled?: boolean; tags?: string[]; limit?: number }): Promise<SkillMetadata[]>;

  /** Update skill metadata */
  update(id: string, updates: SkillUpdateInput): Promise<SkillMetadata | null>;

  /** Delete skill */
  delete(id: string): Promise<boolean>;

  /** Record skill execution */
  recordExecution(id: string, success: boolean): Promise<void>;

  /** Search skills by query */
  search(query: string): Promise<SkillMetadata[]>;
}

// =============================================================================
// Database Adapter Interface
// =============================================================================

export interface DatabaseAdapter {
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

// =============================================================================
// In-Memory Registry
// =============================================================================

export class InMemorySkillRegistry implements SkillRegistry {
  private skills = new Map<string, SkillMetadata>();
  private nameIndex = new Map<string, string>(); // name -> id

  async initialize(): Promise<void> {
    // No-op for in-memory
  }

  async register(input: SkillCreateInput, code: string): Promise<SkillMetadata> {
    // Check for duplicate name
    if (this.nameIndex.has(input.name.toLowerCase())) {
      throw new SkillError('SKILL_EXISTS', `Skill with name '${input.name}' already exists`);
    }

    const now = Date.now();
    const id = randomUUID();

    const metadata: SkillMetadata = {
      id,
      name: input.name,
      description: input.description,
      version: '1.0.0',
      author: input.author ?? 'system',
      parameters: input.parameters ?? [],
      tags: input.tags ?? [],
      enabled: true,
      createdAt: now,
      updatedAt: now,
      executionCount: 0,
    };

    this.skills.set(id, metadata);
    this.nameIndex.set(input.name.toLowerCase(), id);

    return { ...metadata };
  }

  async get(id: string): Promise<SkillMetadata | null> {
    const skill = this.skills.get(id);
    return skill ? { ...skill } : null;
  }

  async getByName(name: string): Promise<SkillMetadata | null> {
    const id = this.nameIndex.get(name.toLowerCase());
    if (!id) return null;
    return this.get(id);
  }

  async list(options?: { enabled?: boolean; tags?: string[]; limit?: number }): Promise<SkillMetadata[]> {
    let skills = Array.from(this.skills.values());

    if (options?.enabled !== undefined) {
      skills = skills.filter(s => s.enabled === options.enabled);
    }

    if (options?.tags && options.tags.length > 0) {
      skills = skills.filter(s => options.tags!.some(tag => s.tags.includes(tag)));
    }

    skills.sort((a, b) => b.updatedAt - a.updatedAt);

    if (options?.limit) {
      skills = skills.slice(0, options.limit);
    }

    return skills.map(s => ({ ...s }));
  }

  async update(id: string, updates: SkillUpdateInput): Promise<SkillMetadata | null> {
    const existing = this.skills.get(id);
    if (!existing) return null;

    // Handle name change
    if (updates.name && updates.name !== existing.name) {
      if (this.nameIndex.has(updates.name.toLowerCase())) {
        throw new SkillError('SKILL_EXISTS', `Skill with name '${updates.name}' already exists`);
      }
      this.nameIndex.delete(existing.name.toLowerCase());
      this.nameIndex.set(updates.name.toLowerCase(), id);
    }

    const updated: SkillMetadata = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.skills.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    const skill = this.skills.get(id);
    if (!skill) return false;

    this.nameIndex.delete(skill.name.toLowerCase());
    return this.skills.delete(id);
  }

  async recordExecution(id: string, success: boolean): Promise<void> {
    const skill = this.skills.get(id);
    if (skill) {
      skill.lastExecutedAt = Date.now();
      skill.executionCount++;
    }
  }

  async search(query: string): Promise<SkillMetadata[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.skills.values())
      .filter(s =>
        s.name.toLowerCase().includes(lowerQuery) ||
        s.description.toLowerCase().includes(lowerQuery) ||
        s.tags.some(t => t.toLowerCase().includes(lowerQuery))
      )
      .map(s => ({ ...s }));
  }
}

// =============================================================================
// SQLite Registry
// =============================================================================

interface SkillRow {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  parameters: string;
  tags: string;
  enabled: number;
  file_path: string | null;
  created_at: number;
  updated_at: number;
  last_executed_at: number | null;
  execution_count: number;
}

export class DatabaseSkillRegistry implements SkillRegistry {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '1.0.0',
        author TEXT NOT NULL DEFAULT 'system',
        parameters TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        enabled INTEGER NOT NULL DEFAULT 1,
        file_path TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_executed_at INTEGER,
        execution_count INTEGER NOT NULL DEFAULT 0
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled)
    `);
  }

  async register(input: SkillCreateInput, code: string): Promise<SkillMetadata> {
    const now = Date.now();
    const id = randomUUID();

    const metadata: SkillMetadata = {
      id,
      name: input.name,
      description: input.description,
      version: '1.0.0',
      author: input.author ?? 'system',
      parameters: input.parameters ?? [],
      tags: input.tags ?? [],
      enabled: true,
      createdAt: now,
      updatedAt: now,
      executionCount: 0,
    };

    try {
      await this.db.execute(
        `INSERT INTO skills (id, name, description, version, author, parameters, tags, enabled, created_at, updated_at, execution_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          metadata.name,
          metadata.description,
          metadata.version,
          metadata.author,
          JSON.stringify(metadata.parameters),
          JSON.stringify(metadata.tags),
          1,
          now,
          now,
          0,
        ]
      );
    } catch (error) {
      if ((error as Error).message.includes('UNIQUE constraint')) {
        throw new SkillError('SKILL_EXISTS', `Skill with name '${input.name}' already exists`);
      }
      throw error;
    }

    return metadata;
  }

  async get(id: string): Promise<SkillMetadata | null> {
    const result = await this.db.execute<SkillRow>(
      'SELECT * FROM skills WHERE id = ?',
      [id]
    );
    return result.length > 0 ? this.rowToMetadata(result[0]) : null;
  }

  async getByName(name: string): Promise<SkillMetadata | null> {
    const result = await this.db.execute<SkillRow>(
      'SELECT * FROM skills WHERE LOWER(name) = LOWER(?)',
      [name]
    );
    return result.length > 0 ? this.rowToMetadata(result[0]) : null;
  }

  async list(options?: { enabled?: boolean; tags?: string[]; limit?: number }): Promise<SkillMetadata[]> {
    let sql = 'SELECT * FROM skills WHERE 1=1';
    const params: unknown[] = [];

    if (options?.enabled !== undefined) {
      sql += ' AND enabled = ?';
      params.push(options.enabled ? 1 : 0);
    }

    sql += ' ORDER BY updated_at DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const result = await this.db.execute<SkillRow>(sql, params);
    let skills = result.map(row => this.rowToMetadata(row));

    // Filter by tags in memory (SQLite JSON support is limited)
    if (options?.tags && options.tags.length > 0) {
      skills = skills.filter(s => options.tags!.some(tag => s.tags.includes(tag)));
    }

    return skills;
  }

  async update(id: string, updates: SkillUpdateInput): Promise<SkillMetadata | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, updatedAt: Date.now() };

    await this.db.execute(
      `UPDATE skills SET
        name = ?, description = ?, parameters = ?, tags = ?, enabled = ?, updated_at = ?
       WHERE id = ?`,
      [
        updated.name,
        updated.description,
        JSON.stringify(updated.parameters),
        JSON.stringify(updated.tags),
        updated.enabled ? 1 : 0,
        updated.updatedAt,
        id,
      ]
    );

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM skills WHERE id = ?',
      [id]
    );
    return (result as unknown as { changes: number }).changes > 0;
  }

  async recordExecution(id: string, success: boolean): Promise<void> {
    await this.db.execute(
      `UPDATE skills SET last_executed_at = ?, execution_count = execution_count + 1 WHERE id = ?`,
      [Date.now(), id]
    );
  }

  async search(query: string): Promise<SkillMetadata[]> {
    const result = await this.db.execute<SkillRow>(
      `SELECT * FROM skills WHERE
        LOWER(name) LIKE LOWER(?) OR
        LOWER(description) LIKE LOWER(?) OR
        LOWER(tags) LIKE LOWER(?)`,
      [`%${query}%`, `%${query}%`, `%${query}%`]
    );
    return result.map(row => this.rowToMetadata(row));
  }

  private rowToMetadata(row: SkillRow): SkillMetadata {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      author: row.author,
      parameters: JSON.parse(row.parameters),
      tags: JSON.parse(row.tags),
      enabled: row.enabled === 1,
      filePath: row.file_path ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastExecutedAt: row.last_executed_at ?? undefined,
      executionCount: row.execution_count,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createSkillRegistry(type: 'memory'): InMemorySkillRegistry;
export function createSkillRegistry(type: 'database', db: DatabaseAdapter): DatabaseSkillRegistry;
export function createSkillRegistry(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): SkillRegistry {
  if (type === 'memory') {
    return new InMemorySkillRegistry();
  }
  if (!db) {
    throw new SkillError('SKILL_VALIDATION_ERROR', 'Database adapter required');
  }
  return new DatabaseSkillRegistry(db);
}
