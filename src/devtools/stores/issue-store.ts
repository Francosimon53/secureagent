/**
 * Issue Store
 *
 * Persistence for created GitHub issues and detected bugs.
 */

import { randomUUID } from 'crypto';
import type {
  GitHubIssue,
  DetectedBug,
  BugSeverity,
  BugSource,
  BugStatus,
  AutoFixResult,
  CreatedIssueQueryOptions,
  DetectedBugQueryOptions,
} from '../types.js';

/**
 * Database adapter interface (for dependency injection)
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Interface for created issue storage
 */
export interface CreatedIssueStore {
  initialize(): Promise<void>;

  // CRUD operations
  create(issue: Omit<GitHubIssue, 'id'>): Promise<GitHubIssue>;
  get(issueId: string): Promise<GitHubIssue | null>;
  getByNumber(owner: string, repository: string, number: number): Promise<GitHubIssue | null>;
  update(issueId: string, updates: Partial<GitHubIssue>): Promise<GitHubIssue | null>;
  delete(issueId: string): Promise<boolean>;

  // Query operations
  list(options?: CreatedIssueQueryOptions): Promise<GitHubIssue[]>;
  count(options?: CreatedIssueQueryOptions): Promise<number>;
  listByRepository(owner: string, repository: string): Promise<GitHubIssue[]>;

  // Cleanup
  deleteOlderThan(timestamp: number): Promise<number>;
}

/**
 * Interface for detected bug storage
 */
export interface DetectedBugStore {
  initialize(): Promise<void>;

  // CRUD operations
  create(bug: Omit<DetectedBug, 'id' | 'createdAt' | 'updatedAt'>): Promise<DetectedBug>;
  get(bugId: string): Promise<DetectedBug | null>;
  update(bugId: string, updates: Partial<DetectedBug>): Promise<DetectedBug | null>;
  delete(bugId: string): Promise<boolean>;

  // Query operations
  list(options?: DetectedBugQueryOptions): Promise<DetectedBug[]>;
  count(options?: DetectedBugQueryOptions): Promise<number>;
  listByUser(userId: string, options?: DetectedBugQueryOptions): Promise<DetectedBug[]>;

  // Status operations
  updateStatus(bugId: string, status: BugStatus): Promise<boolean>;
  setAutoFixResult(bugId: string, result: AutoFixResult): Promise<boolean>;
  linkToIssue(bugId: string, issueId: string): Promise<boolean>;
  linkToPR(bugId: string, prNumber: number): Promise<boolean>;

  // Cleanup
  deleteOlderThan(timestamp: number): Promise<number>;
}

/**
 * Database-backed created issue store
 */
export class DatabaseCreatedIssueStore implements CreatedIssueStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS created_issues (
        id TEXT PRIMARY KEY,
        issue_number INTEGER,
        repository TEXT NOT NULL,
        owner TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        labels TEXT DEFAULT '[]',
        assignees TEXT DEFAULT '[]',
        milestone TEXT,
        state TEXT DEFAULT 'open',
        url TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_issues_repo ON created_issues(owner, repository)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_issues_number ON created_issues(owner, repository, issue_number)
    `);
  }

  async create(issue: Omit<GitHubIssue, 'id'>): Promise<GitHubIssue> {
    const id = randomUUID();

    const item: GitHubIssue = {
      ...issue,
      id,
    };

    await this.db.execute(
      `INSERT INTO created_issues (
        id, issue_number, repository, owner, title, body, labels, assignees,
        milestone, state, url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.number ?? null,
        item.repository,
        item.owner,
        item.title,
        item.body,
        JSON.stringify(item.labels),
        JSON.stringify(item.assignees),
        item.milestone ?? null,
        item.state ?? 'open',
        item.url ?? null,
        item.createdAt,
        item.updatedAt ?? null,
      ]
    );

    return item;
  }

  async get(issueId: string): Promise<GitHubIssue | null> {
    const result = await this.db.query<IssueRow>(
      'SELECT * FROM created_issues WHERE id = ?',
      [issueId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToIssue(result.rows[0]);
  }

  async getByNumber(owner: string, repository: string, number: number): Promise<GitHubIssue | null> {
    const result = await this.db.query<IssueRow>(
      'SELECT * FROM created_issues WHERE owner = ? AND repository = ? AND issue_number = ?',
      [owner, repository, number]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToIssue(result.rows[0]);
  }

  async update(issueId: string, updates: Partial<GitHubIssue>): Promise<GitHubIssue | null> {
    const existing = await this.get(issueId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const updated: GitHubIssue = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    await this.db.execute(
      `UPDATE created_issues SET
        issue_number = ?, repository = ?, owner = ?, title = ?, body = ?,
        labels = ?, assignees = ?, milestone = ?, state = ?, url = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.number ?? null,
        updated.repository,
        updated.owner,
        updated.title,
        updated.body,
        JSON.stringify(updated.labels),
        JSON.stringify(updated.assignees),
        updated.milestone ?? null,
        updated.state ?? 'open',
        updated.url ?? null,
        updated.updatedAt,
        issueId,
      ]
    );

    return updated;
  }

  async delete(issueId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM created_issues WHERE id = ?',
      [issueId]
    );
    return result.changes > 0;
  }

  async list(options: CreatedIssueQueryOptions = {}): Promise<GitHubIssue[]> {
    const { sql, params } = this.buildQuerySQL(options);
    const result = await this.db.query<IssueRow>(sql, params);
    return result.rows.map(row => this.rowToIssue(row));
  }

  async count(options: CreatedIssueQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildQuerySQL(options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async listByRepository(owner: string, repository: string): Promise<GitHubIssue[]> {
    return this.list({ owner, repository });
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    const result = await this.db.execute(
      'DELETE FROM created_issues WHERE created_at < ?',
      [timestamp]
    );
    return result.changes;
  }

  private buildQuerySQL(
    options: CreatedIssueQueryOptions,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.owner) {
      conditions.push('owner = ?');
      params.push(options.owner);
    }

    if (options.repository) {
      conditions.push('repository = ?');
      params.push(options.repository);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM created_issues ${whereClause}`,
        params,
      };
    }

    const direction = options.orderDirection === 'asc' ? 'ASC' : 'DESC';
    let sql = `SELECT * FROM created_issues ${whereClause} ORDER BY created_at ${direction}`;

    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    return { sql, params };
  }

  private rowToIssue(row: IssueRow): GitHubIssue {
    return {
      id: row.id,
      number: row.issue_number ?? undefined,
      repository: row.repository,
      owner: row.owner,
      title: row.title,
      body: row.body,
      labels: JSON.parse(row.labels),
      assignees: JSON.parse(row.assignees),
      milestone: row.milestone ?? undefined,
      state: row.state as 'open' | 'closed' | undefined,
      url: row.url ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
    };
  }
}

/**
 * Database-backed detected bug store
 */
export class DatabaseDetectedBugStore implements DetectedBugStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS detected_bugs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT DEFAULT 'detected',
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        stack_trace TEXT,
        affected_files TEXT,
        suggested_fix TEXT,
        auto_fix_attempted INTEGER DEFAULT 0,
        auto_fix_result TEXT,
        related_issue_id TEXT,
        related_pr_number INTEGER,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_bugs_user ON detected_bugs(user_id)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_bugs_severity ON detected_bugs(severity)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_bugs_status ON detected_bugs(status)
    `);
  }

  async create(bug: Omit<DetectedBug, 'id' | 'createdAt' | 'updatedAt'>): Promise<DetectedBug> {
    const now = Date.now();
    const id = randomUUID();

    const item: DetectedBug = {
      ...bug,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO detected_bugs (
        id, user_id, source, severity, status, title, description, stack_trace,
        affected_files, suggested_fix, auto_fix_attempted, auto_fix_result,
        related_issue_id, related_pr_number, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.source,
        item.severity,
        item.status,
        item.title,
        item.description,
        item.stackTrace ?? null,
        item.affectedFiles ? JSON.stringify(item.affectedFiles) : null,
        item.suggestedFix ?? null,
        item.autoFixAttempted ? 1 : 0,
        item.autoFixResult ? JSON.stringify(item.autoFixResult) : null,
        item.relatedIssueId ?? null,
        item.relatedPRNumber ?? null,
        item.metadata ? JSON.stringify(item.metadata) : null,
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async get(bugId: string): Promise<DetectedBug | null> {
    const result = await this.db.query<BugRow>(
      'SELECT * FROM detected_bugs WHERE id = ?',
      [bugId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToBug(result.rows[0]);
  }

  async update(bugId: string, updates: Partial<DetectedBug>): Promise<DetectedBug | null> {
    const existing = await this.get(bugId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const updated: DetectedBug = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    await this.db.execute(
      `UPDATE detected_bugs SET
        source = ?, severity = ?, status = ?, title = ?, description = ?,
        stack_trace = ?, affected_files = ?, suggested_fix = ?, auto_fix_attempted = ?,
        auto_fix_result = ?, related_issue_id = ?, related_pr_number = ?, metadata = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        updated.source,
        updated.severity,
        updated.status,
        updated.title,
        updated.description,
        updated.stackTrace ?? null,
        updated.affectedFiles ? JSON.stringify(updated.affectedFiles) : null,
        updated.suggestedFix ?? null,
        updated.autoFixAttempted ? 1 : 0,
        updated.autoFixResult ? JSON.stringify(updated.autoFixResult) : null,
        updated.relatedIssueId ?? null,
        updated.relatedPRNumber ?? null,
        updated.metadata ? JSON.stringify(updated.metadata) : null,
        updated.updatedAt,
        bugId,
      ]
    );

    return updated;
  }

  async delete(bugId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM detected_bugs WHERE id = ?',
      [bugId]
    );
    return result.changes > 0;
  }

  async list(options: DetectedBugQueryOptions = {}): Promise<DetectedBug[]> {
    const { sql, params } = this.buildQuerySQL(options);
    const result = await this.db.query<BugRow>(sql, params);
    return result.rows.map(row => this.rowToBug(row));
  }

  async count(options: DetectedBugQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildQuerySQL(options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async listByUser(userId: string, options: DetectedBugQueryOptions = {}): Promise<DetectedBug[]> {
    return this.list({ ...options, userId });
  }

  async updateStatus(bugId: string, status: BugStatus): Promise<boolean> {
    const now = Date.now();
    const result = await this.db.execute(
      'UPDATE detected_bugs SET status = ?, updated_at = ? WHERE id = ?',
      [status, now, bugId]
    );
    return result.changes > 0;
  }

  async setAutoFixResult(bugId: string, result: AutoFixResult): Promise<boolean> {
    const now = Date.now();
    const dbResult = await this.db.execute(
      'UPDATE detected_bugs SET auto_fix_attempted = 1, auto_fix_result = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(result), now, bugId]
    );
    return dbResult.changes > 0;
  }

  async linkToIssue(bugId: string, issueId: string): Promise<boolean> {
    const now = Date.now();
    const result = await this.db.execute(
      'UPDATE detected_bugs SET related_issue_id = ?, updated_at = ? WHERE id = ?',
      [issueId, now, bugId]
    );
    return result.changes > 0;
  }

  async linkToPR(bugId: string, prNumber: number): Promise<boolean> {
    const now = Date.now();
    const result = await this.db.execute(
      'UPDATE detected_bugs SET related_pr_number = ?, updated_at = ? WHERE id = ?',
      [prNumber, now, bugId]
    );
    return result.changes > 0;
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    const result = await this.db.execute(
      'DELETE FROM detected_bugs WHERE created_at < ?',
      [timestamp]
    );
    return result.changes;
  }

  private buildQuerySQL(
    options: DetectedBugQueryOptions,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }

    if (options.source && options.source.length > 0) {
      const placeholders = options.source.map(() => '?').join(',');
      conditions.push(`source IN (${placeholders})`);
      params.push(...options.source);
    }

    if (options.severity && options.severity.length > 0) {
      const placeholders = options.severity.map(() => '?').join(',');
      conditions.push(`severity IN (${placeholders})`);
      params.push(...options.severity);
    }

    if (options.status && options.status.length > 0) {
      const placeholders = options.status.map(() => '?').join(',');
      conditions.push(`status IN (${placeholders})`);
      params.push(...options.status);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM detected_bugs ${whereClause}`,
        params,
      };
    }

    const orderBy = options.orderBy ?? 'createdAt';
    const orderColumn = orderBy === 'severity' ? 'severity' : 'created_at';
    const direction = options.orderDirection === 'asc' ? 'ASC' : 'DESC';

    let sql = `SELECT * FROM detected_bugs ${whereClause} ORDER BY ${orderColumn} ${direction}`;

    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    return { sql, params };
  }

  private rowToBug(row: BugRow): DetectedBug {
    return {
      id: row.id,
      userId: row.user_id,
      source: row.source as BugSource,
      severity: row.severity as BugSeverity,
      status: row.status as BugStatus,
      title: row.title,
      description: row.description,
      stackTrace: row.stack_trace ?? undefined,
      affectedFiles: row.affected_files ? JSON.parse(row.affected_files) : undefined,
      suggestedFix: row.suggested_fix ?? undefined,
      autoFixAttempted: row.auto_fix_attempted === 1,
      autoFixResult: row.auto_fix_result ? JSON.parse(row.auto_fix_result) : undefined,
      relatedIssueId: row.related_issue_id ?? undefined,
      relatedPRNumber: row.related_pr_number ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * In-memory created issue store for testing
 */
export class InMemoryCreatedIssueStore implements CreatedIssueStore {
  private issues = new Map<string, GitHubIssue>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async create(issue: Omit<GitHubIssue, 'id'>): Promise<GitHubIssue> {
    const item: GitHubIssue = {
      ...issue,
      id: randomUUID(),
    };
    this.issues.set(item.id, item);
    return item;
  }

  async get(issueId: string): Promise<GitHubIssue | null> {
    return this.issues.get(issueId) ?? null;
  }

  async getByNumber(owner: string, repository: string, number: number): Promise<GitHubIssue | null> {
    for (const issue of this.issues.values()) {
      if (issue.owner === owner && issue.repository === repository && issue.number === number) {
        return issue;
      }
    }
    return null;
  }

  async update(issueId: string, updates: Partial<GitHubIssue>): Promise<GitHubIssue | null> {
    const existing = this.issues.get(issueId);
    if (!existing) return null;

    const updated: GitHubIssue = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    this.issues.set(issueId, updated);
    return updated;
  }

  async delete(issueId: string): Promise<boolean> {
    return this.issues.delete(issueId);
  }

  async list(options: CreatedIssueQueryOptions = {}): Promise<GitHubIssue[]> {
    let items = Array.from(this.issues.values());

    if (options.owner) {
      items = items.filter(i => i.owner === options.owner);
    }

    if (options.repository) {
      items = items.filter(i => i.repository === options.repository);
    }

    // Sort
    items.sort((a, b) => b.createdAt - a.createdAt);

    if (options.orderDirection === 'asc') {
      items.reverse();
    }

    if (options.offset) {
      items = items.slice(options.offset);
    }

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  async count(options: CreatedIssueQueryOptions = {}): Promise<number> {
    const items = await this.list({ ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async listByRepository(owner: string, repository: string): Promise<GitHubIssue[]> {
    return this.list({ owner, repository });
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    let count = 0;
    for (const [id, issue] of this.issues) {
      if (issue.createdAt < timestamp) {
        this.issues.delete(id);
        count++;
      }
    }
    return count;
  }
}

/**
 * In-memory detected bug store for testing
 */
export class InMemoryDetectedBugStore implements DetectedBugStore {
  private bugs = new Map<string, DetectedBug>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async create(bug: Omit<DetectedBug, 'id' | 'createdAt' | 'updatedAt'>): Promise<DetectedBug> {
    const now = Date.now();
    const item: DetectedBug = {
      ...bug,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.bugs.set(item.id, item);
    return item;
  }

  async get(bugId: string): Promise<DetectedBug | null> {
    return this.bugs.get(bugId) ?? null;
  }

  async update(bugId: string, updates: Partial<DetectedBug>): Promise<DetectedBug | null> {
    const existing = this.bugs.get(bugId);
    if (!existing) return null;

    const updated: DetectedBug = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    this.bugs.set(bugId, updated);
    return updated;
  }

  async delete(bugId: string): Promise<boolean> {
    return this.bugs.delete(bugId);
  }

  async list(options: DetectedBugQueryOptions = {}): Promise<DetectedBug[]> {
    let items = Array.from(this.bugs.values());

    if (options.userId) {
      items = items.filter(b => b.userId === options.userId);
    }

    if (options.source && options.source.length > 0) {
      items = items.filter(b => options.source!.includes(b.source));
    }

    if (options.severity && options.severity.length > 0) {
      items = items.filter(b => options.severity!.includes(b.severity));
    }

    if (options.status && options.status.length > 0) {
      items = items.filter(b => options.status!.includes(b.status));
    }

    // Sort
    items.sort((a, b) => b.createdAt - a.createdAt);

    if (options.orderDirection === 'asc') {
      items.reverse();
    }

    if (options.offset) {
      items = items.slice(options.offset);
    }

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  async count(options: DetectedBugQueryOptions = {}): Promise<number> {
    const items = await this.list({ ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async listByUser(userId: string, options: DetectedBugQueryOptions = {}): Promise<DetectedBug[]> {
    return this.list({ ...options, userId });
  }

  async updateStatus(bugId: string, status: BugStatus): Promise<boolean> {
    const bug = this.bugs.get(bugId);
    if (!bug) return false;

    bug.status = status;
    bug.updatedAt = Date.now();

    return true;
  }

  async setAutoFixResult(bugId: string, result: AutoFixResult): Promise<boolean> {
    const bug = this.bugs.get(bugId);
    if (!bug) return false;

    bug.autoFixAttempted = true;
    bug.autoFixResult = result;
    bug.updatedAt = Date.now();

    return true;
  }

  async linkToIssue(bugId: string, issueId: string): Promise<boolean> {
    const bug = this.bugs.get(bugId);
    if (!bug) return false;

    bug.relatedIssueId = issueId;
    bug.updatedAt = Date.now();

    return true;
  }

  async linkToPR(bugId: string, prNumber: number): Promise<boolean> {
    const bug = this.bugs.get(bugId);
    if (!bug) return false;

    bug.relatedPRNumber = prNumber;
    bug.updatedAt = Date.now();

    return true;
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    let count = 0;
    for (const [id, bug] of this.bugs) {
      if (bug.createdAt < timestamp) {
        this.bugs.delete(id);
        count++;
      }
    }
    return count;
  }
}

// =============================================================================
// Row Types
// =============================================================================

interface IssueRow {
  id: string;
  issue_number: number | null;
  repository: string;
  owner: string;
  title: string;
  body: string;
  labels: string;
  assignees: string;
  milestone: string | null;
  state: string | null;
  url: string | null;
  created_at: number;
  updated_at: number | null;
}

interface BugRow {
  id: string;
  user_id: string;
  source: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  stack_trace: string | null;
  affected_files: string | null;
  suggested_fix: string | null;
  auto_fix_attempted: number;
  auto_fix_result: string | null;
  related_issue_id: string | null;
  related_pr_number: number | null;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createCreatedIssueStore(type: 'memory'): InMemoryCreatedIssueStore;
export function createCreatedIssueStore(type: 'database', db: DatabaseAdapter): DatabaseCreatedIssueStore;
export function createCreatedIssueStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): CreatedIssueStore {
  if (type === 'memory') {
    return new InMemoryCreatedIssueStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseCreatedIssueStore(db);
}

export function createDetectedBugStore(type: 'memory'): InMemoryDetectedBugStore;
export function createDetectedBugStore(type: 'database', db: DatabaseAdapter): DatabaseDetectedBugStore;
export function createDetectedBugStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): DetectedBugStore {
  if (type === 'memory') {
    return new InMemoryDetectedBugStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseDetectedBugStore(db);
}
