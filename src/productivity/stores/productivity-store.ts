/**
 * Productivity Store
 *
 * SQLite persistence for todos and productivity configurations.
 */

import { randomUUID } from 'crypto';
import type {
  TodoItem,
  TodoQueryOptions,
  ProductivityConfigRecord,
  TaskScore,
} from '../types.js';

/**
 * Interface for todo storage
 */
export interface TodoStore {
  initialize(): Promise<void>;

  // CRUD operations
  create(todo: Omit<TodoItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<TodoItem>;
  get(todoId: string): Promise<TodoItem | null>;
  update(todoId: string, updates: Partial<TodoItem>): Promise<TodoItem | null>;
  delete(todoId: string): Promise<boolean>;

  // Query operations
  list(userId: string, options?: TodoQueryOptions): Promise<TodoItem[]>;
  count(userId: string, options?: TodoQueryOptions): Promise<number>;

  // Bulk operations
  bulkUpdateStatus(todoIds: string[], status: TodoItem['status']): Promise<number>;
  bulkDelete(todoIds: string[]): Promise<number>;

  // Score operations
  updateScore(todoId: string, score: TaskScore): Promise<boolean>;
}

/**
 * Interface for productivity config storage
 */
export interface ProductivityConfigStore {
  initialize(): Promise<void>;

  // CRUD operations
  get(userId: string, type: string): Promise<ProductivityConfigRecord | null>;
  set(userId: string, type: string, config: Record<string, unknown>): Promise<ProductivityConfigRecord>;
  delete(userId: string, type: string): Promise<boolean>;

  // List operations
  listByUser(userId: string): Promise<ProductivityConfigRecord[]>;
  listByType(type: string): Promise<ProductivityConfigRecord[]>;
}

/**
 * Database adapter interface (for dependency injection)
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Database-backed todo store
 */
export class DatabaseTodoStore implements TodoStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'medium',
        due_date INTEGER,
        start_date INTEGER,
        completed_at INTEGER,
        context TEXT DEFAULT 'both',
        tags TEXT DEFAULT '[]',
        source_type TEXT,
        source_id TEXT,
        parent_id TEXT,
        subtasks TEXT DEFAULT '[]',
        recurrence TEXT,
        score_data TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_todos_user_status ON todos(user_id, status)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_todos_user_due ON todos(user_id, due_date)
    `);
  }

  async create(todo: Omit<TodoItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<TodoItem> {
    const now = Date.now();
    const id = randomUUID();

    const item: TodoItem = {
      ...todo,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO todos (
        id, user_id, title, description, status, priority, due_date, start_date,
        completed_at, context, tags, source_type, source_id, parent_id, subtasks,
        recurrence, score_data, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.title,
        item.description ?? null,
        item.status,
        item.priority,
        item.dueDate ?? null,
        item.startDate ?? null,
        item.completedAt ?? null,
        item.context,
        JSON.stringify(item.tags),
        item.sourceType ?? null,
        item.sourceId ?? null,
        item.parentId ?? null,
        JSON.stringify(item.subtasks ?? []),
        item.recurrence ? JSON.stringify(item.recurrence) : null,
        item.score ? JSON.stringify(item.score) : null,
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async get(todoId: string): Promise<TodoItem | null> {
    const result = await this.db.query<TodoRow>(
      'SELECT * FROM todos WHERE id = ?',
      [todoId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToTodo(result.rows[0]);
  }

  async update(todoId: string, updates: Partial<TodoItem>): Promise<TodoItem | null> {
    const existing = await this.get(todoId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const updated: TodoItem = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    // Handle completedAt for status changes
    if (updates.status === 'completed' && !updated.completedAt) {
      updated.completedAt = now;
    }

    await this.db.execute(
      `UPDATE todos SET
        title = ?, description = ?, status = ?, priority = ?, due_date = ?,
        start_date = ?, completed_at = ?, context = ?, tags = ?, source_type = ?,
        source_id = ?, parent_id = ?, subtasks = ?, recurrence = ?, score_data = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        updated.title,
        updated.description ?? null,
        updated.status,
        updated.priority,
        updated.dueDate ?? null,
        updated.startDate ?? null,
        updated.completedAt ?? null,
        updated.context,
        JSON.stringify(updated.tags),
        updated.sourceType ?? null,
        updated.sourceId ?? null,
        updated.parentId ?? null,
        JSON.stringify(updated.subtasks ?? []),
        updated.recurrence ? JSON.stringify(updated.recurrence) : null,
        updated.score ? JSON.stringify(updated.score) : null,
        updated.updatedAt,
        todoId,
      ]
    );

    return updated;
  }

  async delete(todoId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM todos WHERE id = ?',
      [todoId]
    );
    return result.changes > 0;
  }

  async list(userId: string, options: TodoQueryOptions = {}): Promise<TodoItem[]> {
    const { sql, params } = this.buildQuerySQL(userId, options);
    const result = await this.db.query<TodoRow>(sql, params);
    return result.rows.map(row => this.rowToTodo(row));
  }

  async count(userId: string, options: TodoQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildQuerySQL(userId, options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async bulkUpdateStatus(todoIds: string[], status: TodoItem['status']): Promise<number> {
    if (todoIds.length === 0) return 0;

    const now = Date.now();
    const completedAt = status === 'completed' ? now : null;
    const placeholders = todoIds.map(() => '?').join(',');

    const result = await this.db.execute(
      `UPDATE todos SET status = ?, completed_at = COALESCE(completed_at, ?), updated_at = ? WHERE id IN (${placeholders})`,
      [status, completedAt, now, ...todoIds]
    );

    return result.changes;
  }

  async bulkDelete(todoIds: string[]): Promise<number> {
    if (todoIds.length === 0) return 0;

    const placeholders = todoIds.map(() => '?').join(',');
    const result = await this.db.execute(
      `DELETE FROM todos WHERE id IN (${placeholders})`,
      todoIds
    );

    return result.changes;
  }

  async updateScore(todoId: string, score: TaskScore): Promise<boolean> {
    const now = Date.now();
    const result = await this.db.execute(
      'UPDATE todos SET score_data = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(score), now, todoId]
    );
    return result.changes > 0;
  }

  private buildQuerySQL(
    userId: string,
    options: TodoQueryOptions,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (options.status && options.status.length > 0) {
      const placeholders = options.status.map(() => '?').join(',');
      conditions.push(`status IN (${placeholders})`);
      params.push(...options.status);
    }

    if (options.priority && options.priority.length > 0) {
      const placeholders = options.priority.map(() => '?').join(',');
      conditions.push(`priority IN (${placeholders})`);
      params.push(...options.priority);
    }

    if (options.context) {
      conditions.push('(context = ? OR context = ?)');
      params.push(options.context, 'both');
    }

    if (options.dueBefore) {
      conditions.push('due_date < ?');
      params.push(options.dueBefore);
    }

    if (options.dueAfter) {
      conditions.push('due_date > ?');
      params.push(options.dueAfter);
    }

    if (options.sourceType) {
      conditions.push('source_type = ?');
      params.push(options.sourceType);
    }

    const whereClause = conditions.join(' AND ');

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM todos WHERE ${whereClause}`,
        params,
      };
    }

    // Build ORDER BY
    let orderBy = 'created_at DESC';
    if (options.orderBy) {
      const direction = options.orderDirection === 'asc' ? 'ASC' : 'DESC';
      const column = {
        dueDate: 'due_date',
        priority: 'priority',
        score: 'score_data',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      }[options.orderBy];
      orderBy = `${column} ${direction}`;
    }

    let sql = `SELECT * FROM todos WHERE ${whereClause} ORDER BY ${orderBy}`;

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

  private rowToTodo(row: TodoRow): TodoItem {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status as TodoItem['status'],
      priority: row.priority as TodoItem['priority'],
      dueDate: row.due_date ?? undefined,
      startDate: row.start_date ?? undefined,
      completedAt: row.completed_at ?? undefined,
      context: row.context as TodoItem['context'],
      tags: JSON.parse(row.tags),
      score: row.score_data ? JSON.parse(row.score_data) : undefined,
      sourceType: row.source_type as TodoItem['sourceType'] ?? undefined,
      sourceId: row.source_id ?? undefined,
      parentId: row.parent_id ?? undefined,
      subtasks: JSON.parse(row.subtasks),
      recurrence: row.recurrence ? JSON.parse(row.recurrence) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * Database-backed productivity config store
 */
export class DatabaseProductivityConfigStore implements ProductivityConfigStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS productivity_configs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        config TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_id, type)
      )
    `);
  }

  async get(userId: string, type: string): Promise<ProductivityConfigRecord | null> {
    const result = await this.db.query<ProductivityConfigRow>(
      'SELECT * FROM productivity_configs WHERE user_id = ? AND type = ?',
      [userId, type]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToConfig(result.rows[0]);
  }

  async set(
    userId: string,
    type: string,
    config: Record<string, unknown>
  ): Promise<ProductivityConfigRecord> {
    const now = Date.now();
    const existing = await this.get(userId, type);

    if (existing) {
      await this.db.execute(
        'UPDATE productivity_configs SET config = ?, updated_at = ? WHERE user_id = ? AND type = ?',
        [JSON.stringify(config), now, userId, type]
      );

      return {
        ...existing,
        config,
        updatedAt: now,
      };
    }

    const id = randomUUID();
    const record: ProductivityConfigRecord = {
      id,
      userId,
      type,
      config,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO productivity_configs (id, user_id, type, config, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, type, JSON.stringify(config), 1, now, now]
    );

    return record;
  }

  async delete(userId: string, type: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM productivity_configs WHERE user_id = ? AND type = ?',
      [userId, type]
    );
    return result.changes > 0;
  }

  async listByUser(userId: string): Promise<ProductivityConfigRecord[]> {
    const result = await this.db.query<ProductivityConfigRow>(
      'SELECT * FROM productivity_configs WHERE user_id = ?',
      [userId]
    );
    return result.rows.map(row => this.rowToConfig(row));
  }

  async listByType(type: string): Promise<ProductivityConfigRecord[]> {
    const result = await this.db.query<ProductivityConfigRow>(
      'SELECT * FROM productivity_configs WHERE type = ?',
      [type]
    );
    return result.rows.map(row => this.rowToConfig(row));
  }

  private rowToConfig(row: ProductivityConfigRow): ProductivityConfigRecord {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      config: JSON.parse(row.config),
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * In-memory todo store for testing
 */
export class InMemoryTodoStore implements TodoStore {
  private todos = new Map<string, TodoItem>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async create(todo: Omit<TodoItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<TodoItem> {
    const now = Date.now();
    const item: TodoItem = {
      ...todo,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.todos.set(item.id, item);
    return item;
  }

  async get(todoId: string): Promise<TodoItem | null> {
    return this.todos.get(todoId) ?? null;
  }

  async update(todoId: string, updates: Partial<TodoItem>): Promise<TodoItem | null> {
    const existing = this.todos.get(todoId);
    if (!existing) return null;

    const now = Date.now();
    const updated: TodoItem = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    if (updates.status === 'completed' && !updated.completedAt) {
      updated.completedAt = now;
    }

    this.todos.set(todoId, updated);
    return updated;
  }

  async delete(todoId: string): Promise<boolean> {
    return this.todos.delete(todoId);
  }

  async list(userId: string, options: TodoQueryOptions = {}): Promise<TodoItem[]> {
    let items = Array.from(this.todos.values()).filter(t => t.userId === userId);

    if (options.status && options.status.length > 0) {
      items = items.filter(t => options.status!.includes(t.status));
    }

    if (options.priority && options.priority.length > 0) {
      items = items.filter(t => options.priority!.includes(t.priority));
    }

    if (options.context) {
      items = items.filter(t => t.context === options.context || t.context === 'both');
    }

    if (options.dueBefore) {
      items = items.filter(t => t.dueDate && t.dueDate < options.dueBefore!);
    }

    if (options.dueAfter) {
      items = items.filter(t => t.dueDate && t.dueDate > options.dueAfter!);
    }

    // Sort
    items.sort((a, b) => {
      if (options.orderBy === 'dueDate') {
        return (a.dueDate ?? 0) - (b.dueDate ?? 0);
      }
      if (options.orderBy === 'score') {
        return (b.score?.total ?? 0) - (a.score?.total ?? 0);
      }
      return b.createdAt - a.createdAt;
    });

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

  async count(userId: string, options: TodoQueryOptions = {}): Promise<number> {
    const items = await this.list(userId, { ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async bulkUpdateStatus(todoIds: string[], status: TodoItem['status']): Promise<number> {
    let count = 0;
    for (const id of todoIds) {
      if (await this.update(id, { status })) {
        count++;
      }
    }
    return count;
  }

  async bulkDelete(todoIds: string[]): Promise<number> {
    let count = 0;
    for (const id of todoIds) {
      if (this.todos.delete(id)) {
        count++;
      }
    }
    return count;
  }

  async updateScore(todoId: string, score: TaskScore): Promise<boolean> {
    const existing = this.todos.get(todoId);
    if (!existing) return false;
    existing.score = score;
    existing.updatedAt = Date.now();
    return true;
  }
}

/**
 * In-memory productivity config store for testing
 */
export class InMemoryProductivityConfigStore implements ProductivityConfigStore {
  private configs = new Map<string, ProductivityConfigRecord>();

  private key(userId: string, type: string): string {
    return `${userId}:${type}`;
  }

  async initialize(): Promise<void> {
    // No-op
  }

  async get(userId: string, type: string): Promise<ProductivityConfigRecord | null> {
    return this.configs.get(this.key(userId, type)) ?? null;
  }

  async set(
    userId: string,
    type: string,
    config: Record<string, unknown>
  ): Promise<ProductivityConfigRecord> {
    const now = Date.now();
    const existing = this.configs.get(this.key(userId, type));

    const record: ProductivityConfigRecord = existing
      ? { ...existing, config, updatedAt: now }
      : {
          id: randomUUID(),
          userId,
          type,
          config,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        };

    this.configs.set(this.key(userId, type), record);
    return record;
  }

  async delete(userId: string, type: string): Promise<boolean> {
    return this.configs.delete(this.key(userId, type));
  }

  async listByUser(userId: string): Promise<ProductivityConfigRecord[]> {
    return Array.from(this.configs.values()).filter(c => c.userId === userId);
  }

  async listByType(type: string): Promise<ProductivityConfigRecord[]> {
    return Array.from(this.configs.values()).filter(c => c.type === type);
  }
}

// =============================================================================
// Row Types
// =============================================================================

interface TodoRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: number | null;
  start_date: number | null;
  completed_at: number | null;
  context: string;
  tags: string;
  source_type: string | null;
  source_id: string | null;
  parent_id: string | null;
  subtasks: string;
  recurrence: string | null;
  score_data: string | null;
  created_at: number;
  updated_at: number;
}

interface ProductivityConfigRow {
  id: string;
  user_id: string;
  type: string;
  config: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

/**
 * Factory function to create stores
 */
export function createTodoStore(type: 'memory'): InMemoryTodoStore;
export function createTodoStore(type: 'database', db: DatabaseAdapter): DatabaseTodoStore;
export function createTodoStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): TodoStore {
  if (type === 'memory') {
    return new InMemoryTodoStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseTodoStore(db);
}

export function createProductivityConfigStore(type: 'memory'): InMemoryProductivityConfigStore;
export function createProductivityConfigStore(type: 'database', db: DatabaseAdapter): DatabaseProductivityConfigStore;
export function createProductivityConfigStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): ProductivityConfigStore {
  if (type === 'memory') {
    return new InMemoryProductivityConfigStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseProductivityConfigStore(db);
}
