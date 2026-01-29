/**
 * Negotiation Store
 *
 * Persistence layer for negotiation sessions, templates, and history.
 */

import { randomUUID } from 'crypto';
import type {
  NegotiationSession,
  NegotiationEmail,
  CounterOffer,
  NegotiationTemplate,
  VendorInfo,
  NegotiationQueryOptions,
  NegotiationStatus,
} from '../types.js';

/**
 * Interface for negotiation storage
 */
export interface NegotiationStore {
  initialize(): Promise<void>;

  // Session CRUD
  createSession(session: Omit<NegotiationSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<NegotiationSession>;
  getSession(sessionId: string): Promise<NegotiationSession | null>;
  updateSession(sessionId: string, updates: Partial<NegotiationSession>): Promise<NegotiationSession | null>;
  deleteSession(sessionId: string): Promise<boolean>;

  // Query operations
  listSessions(userId: string, options?: NegotiationQueryOptions): Promise<NegotiationSession[]>;
  countSessions(userId: string, options?: NegotiationQueryOptions): Promise<number>;

  // Specialized queries
  getByStatus(userId: string, statuses: NegotiationStatus[]): Promise<NegotiationSession[]>;
  getActiveNegotiations(userId: string): Promise<NegotiationSession[]>;
  getByVendor(userId: string, vendorName: string): Promise<NegotiationSession[]>;
  getSuccessful(userId: string): Promise<NegotiationSession[]>;

  // Email operations
  addEmail(sessionId: string, email: Omit<NegotiationEmail, 'id'>): Promise<NegotiationEmail | null>;
  getEmails(sessionId: string): Promise<NegotiationEmail[]>;
  updateEmail(sessionId: string, emailId: string, updates: Partial<NegotiationEmail>): Promise<boolean>;

  // Counter offer operations
  addCounterOffer(sessionId: string, offer: Omit<CounterOffer, 'id'>): Promise<CounterOffer | null>;
  getCounterOffers(sessionId: string): Promise<CounterOffer[]>;
  updateCounterOffer(sessionId: string, offerId: string, updates: Partial<CounterOffer>): Promise<boolean>;

  // Template operations
  createTemplate(template: Omit<NegotiationTemplate, 'id'>): Promise<NegotiationTemplate>;
  getTemplate(templateId: string): Promise<NegotiationTemplate | null>;
  listTemplates(options?: { type?: string; vendorCategory?: string }): Promise<NegotiationTemplate[]>;
  updateTemplate(templateId: string, updates: Partial<NegotiationTemplate>): Promise<NegotiationTemplate | null>;
  deleteTemplate(templateId: string): Promise<boolean>;

  // Analytics
  getAverageSavings(userId: string): Promise<number>;
  getSuccessRate(userId: string): Promise<number>;
  getTotalSavings(userId: string): Promise<number>;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Database-backed negotiation store
 */
export class DatabaseNegotiationStore implements NegotiationStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Negotiations table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS negotiations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        vendor_data TEXT NOT NULL,
        target_amount REAL NOT NULL,
        current_amount REAL NOT NULL,
        status TEXT DEFAULT 'draft',
        emails TEXT DEFAULT '[]',
        counter_offers TEXT DEFAULT '[]',
        notes TEXT,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_negotiations_user_status ON negotiations(user_id, status)
    `);

    // Templates table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS negotiation_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        vendor_category TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        variables TEXT DEFAULT '[]',
        success_rate REAL
      )
    `);
  }

  async createSession(session: Omit<NegotiationSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<NegotiationSession> {
    const now = Date.now();
    const id = randomUUID();

    const item: NegotiationSession = {
      ...session,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO negotiations (
        id, user_id, type, vendor_data, target_amount, current_amount, status,
        emails, counter_offers, notes, started_at, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.type,
        JSON.stringify(item.vendor),
        item.targetAmount,
        item.currentAmount,
        item.status,
        JSON.stringify(item.emails),
        JSON.stringify(item.counterOffers),
        item.notes ?? null,
        item.startedAt,
        item.completedAt ?? null,
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async getSession(sessionId: string): Promise<NegotiationSession | null> {
    const result = await this.db.query<NegotiationRow>(
      'SELECT * FROM negotiations WHERE id = ?',
      [sessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToSession(result.rows[0]);
  }

  async updateSession(sessionId: string, updates: Partial<NegotiationSession>): Promise<NegotiationSession | null> {
    const existing = await this.getSession(sessionId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const updated: NegotiationSession = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    // Handle completion timestamp
    if (updates.status === 'accepted' || updates.status === 'rejected') {
      if (!updated.completedAt) {
        updated.completedAt = now;
      }
    }

    await this.db.execute(
      `UPDATE negotiations SET
        type = ?, vendor_data = ?, target_amount = ?, current_amount = ?, status = ?,
        emails = ?, counter_offers = ?, notes = ?, started_at = ?, completed_at = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        updated.type,
        JSON.stringify(updated.vendor),
        updated.targetAmount,
        updated.currentAmount,
        updated.status,
        JSON.stringify(updated.emails),
        JSON.stringify(updated.counterOffers),
        updated.notes ?? null,
        updated.startedAt,
        updated.completedAt ?? null,
        updated.updatedAt,
        sessionId,
      ]
    );

    return updated;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM negotiations WHERE id = ?',
      [sessionId]
    );
    return result.changes > 0;
  }

  async listSessions(userId: string, options: NegotiationQueryOptions = {}): Promise<NegotiationSession[]> {
    const { sql, params } = this.buildQuerySQL(userId, options);
    const result = await this.db.query<NegotiationRow>(sql, params);
    return result.rows.map(row => this.rowToSession(row));
  }

  async countSessions(userId: string, options: NegotiationQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildQuerySQL(userId, options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async getByStatus(userId: string, statuses: NegotiationStatus[]): Promise<NegotiationSession[]> {
    return this.listSessions(userId, { status: statuses });
  }

  async getActiveNegotiations(userId: string): Promise<NegotiationSession[]> {
    return this.listSessions(userId, {
      status: ['pending', 'awaiting_response', 'counter_received'],
    });
  }

  async getByVendor(userId: string, vendorName: string): Promise<NegotiationSession[]> {
    const result = await this.db.query<NegotiationRow>(
      `SELECT * FROM negotiations WHERE user_id = ? AND vendor_data LIKE ? ORDER BY created_at DESC`,
      [userId, `%"name":"${vendorName}"%`]
    );
    return result.rows.map(row => this.rowToSession(row));
  }

  async getSuccessful(userId: string): Promise<NegotiationSession[]> {
    return this.listSessions(userId, { status: ['accepted'] });
  }

  async addEmail(sessionId: string, email: Omit<NegotiationEmail, 'id'>): Promise<NegotiationEmail | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const newEmail: NegotiationEmail = {
      ...email,
      id: randomUUID(),
    };

    session.emails.push(newEmail);
    await this.updateSession(sessionId, { emails: session.emails });
    return newEmail;
  }

  async getEmails(sessionId: string): Promise<NegotiationEmail[]> {
    const session = await this.getSession(sessionId);
    return session?.emails ?? [];
  }

  async updateEmail(sessionId: string, emailId: string, updates: Partial<NegotiationEmail>): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return false;
    }

    const emailIndex = session.emails.findIndex(e => e.id === emailId);
    if (emailIndex === -1) {
      return false;
    }

    session.emails[emailIndex] = { ...session.emails[emailIndex], ...updates };
    await this.updateSession(sessionId, { emails: session.emails });
    return true;
  }

  async addCounterOffer(sessionId: string, offer: Omit<CounterOffer, 'id'>): Promise<CounterOffer | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const newOffer: CounterOffer = {
      ...offer,
      id: randomUUID(),
    };

    session.counterOffers.push(newOffer);
    await this.updateSession(sessionId, { counterOffers: session.counterOffers });
    return newOffer;
  }

  async getCounterOffers(sessionId: string): Promise<CounterOffer[]> {
    const session = await this.getSession(sessionId);
    return session?.counterOffers ?? [];
  }

  async updateCounterOffer(sessionId: string, offerId: string, updates: Partial<CounterOffer>): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return false;
    }

    const offerIndex = session.counterOffers.findIndex(o => o.id === offerId);
    if (offerIndex === -1) {
      return false;
    }

    session.counterOffers[offerIndex] = { ...session.counterOffers[offerIndex], ...updates };
    await this.updateSession(sessionId, { counterOffers: session.counterOffers });
    return true;
  }

  async createTemplate(template: Omit<NegotiationTemplate, 'id'>): Promise<NegotiationTemplate> {
    const id = randomUUID();
    const item: NegotiationTemplate = { ...template, id };

    await this.db.execute(
      `INSERT INTO negotiation_templates (
        id, name, type, vendor_category, subject, body, variables, success_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.name,
        item.type,
        item.vendorCategory,
        item.subject,
        item.body,
        JSON.stringify(item.variables),
        item.successRate ?? null,
      ]
    );

    return item;
  }

  async getTemplate(templateId: string): Promise<NegotiationTemplate | null> {
    const result = await this.db.query<TemplateRow>(
      'SELECT * FROM negotiation_templates WHERE id = ?',
      [templateId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToTemplate(result.rows[0]);
  }

  async listTemplates(options: { type?: string; vendorCategory?: string } = {}): Promise<NegotiationTemplate[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }

    if (options.vendorCategory) {
      conditions.push('vendor_category = ?');
      params.push(options.vendorCategory);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.db.query<TemplateRow>(
      `SELECT * FROM negotiation_templates ${whereClause} ORDER BY success_rate DESC NULLS LAST`,
      params
    );

    return result.rows.map(row => this.rowToTemplate(row));
  }

  async updateTemplate(templateId: string, updates: Partial<NegotiationTemplate>): Promise<NegotiationTemplate | null> {
    const existing = await this.getTemplate(templateId);
    if (!existing) {
      return null;
    }

    const updated: NegotiationTemplate = {
      ...existing,
      ...updates,
      id: existing.id,
    };

    await this.db.execute(
      `UPDATE negotiation_templates SET
        name = ?, type = ?, vendor_category = ?, subject = ?, body = ?,
        variables = ?, success_rate = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.type,
        updated.vendorCategory,
        updated.subject,
        updated.body,
        JSON.stringify(updated.variables),
        updated.successRate ?? null,
        templateId,
      ]
    );

    return updated;
  }

  async deleteTemplate(templateId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM negotiation_templates WHERE id = ?',
      [templateId]
    );
    return result.changes > 0;
  }

  async getAverageSavings(userId: string): Promise<number> {
    const successful = await this.getSuccessful(userId);
    if (successful.length === 0) {
      return 0;
    }

    const totalSavings = successful.reduce((sum, s) => {
      return sum + (s.currentAmount - s.targetAmount);
    }, 0);

    return totalSavings / successful.length;
  }

  async getSuccessRate(userId: string): Promise<number> {
    const result = await this.db.query<{ total: number; successful: number }>(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as successful
      FROM negotiations
      WHERE user_id = ? AND status IN ('accepted', 'rejected')`,
      [userId]
    );

    const row = result.rows[0];
    if (!row || row.total === 0) {
      return 0;
    }

    return (row.successful / row.total) * 100;
  }

  async getTotalSavings(userId: string): Promise<number> {
    const successful = await this.getSuccessful(userId);
    return successful.reduce((sum, s) => {
      return sum + Math.max(0, s.currentAmount - s.targetAmount);
    }, 0);
  }

  private buildQuerySQL(
    userId: string,
    options: NegotiationQueryOptions,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (options.status && options.status.length > 0) {
      const placeholders = options.status.map(() => '?').join(',');
      conditions.push(`status IN (${placeholders})`);
      params.push(...options.status);
    }

    if (options.type && options.type.length > 0) {
      const placeholders = options.type.map(() => '?').join(',');
      conditions.push(`type IN (${placeholders})`);
      params.push(...options.type);
    }

    const whereClause = conditions.join(' AND ');

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM negotiations WHERE ${whereClause}`,
        params,
      };
    }

    let orderBy = 'created_at DESC';
    if (options.orderBy) {
      const direction = options.orderDirection === 'asc' ? 'ASC' : 'DESC';
      const column = {
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        startedAt: 'started_at',
      }[options.orderBy];
      orderBy = `${column} ${direction}`;
    }

    let sql = `SELECT * FROM negotiations WHERE ${whereClause} ORDER BY ${orderBy}`;

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

  private rowToSession(row: NegotiationRow): NegotiationSession {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type as NegotiationSession['type'],
      vendor: JSON.parse(row.vendor_data) as VendorInfo,
      targetAmount: row.target_amount,
      currentAmount: row.current_amount,
      status: row.status as NegotiationStatus,
      emails: JSON.parse(row.emails),
      counterOffers: JSON.parse(row.counter_offers),
      notes: row.notes ?? undefined,
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToTemplate(row: TemplateRow): NegotiationTemplate {
    return {
      id: row.id,
      name: row.name,
      type: row.type as NegotiationTemplate['type'],
      vendorCategory: row.vendor_category as NegotiationTemplate['vendorCategory'],
      subject: row.subject,
      body: row.body,
      variables: JSON.parse(row.variables),
      successRate: row.success_rate ?? undefined,
    };
  }
}

/**
 * In-memory negotiation store for testing
 */
export class InMemoryNegotiationStore implements NegotiationStore {
  private sessions = new Map<string, NegotiationSession>();
  private templates = new Map<string, NegotiationTemplate>();

  async initialize(): Promise<void> {
    // No-op
  }

  async createSession(session: Omit<NegotiationSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<NegotiationSession> {
    const now = Date.now();
    const item: NegotiationSession = {
      ...session,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(item.id, item);
    return item;
  }

  async getSession(sessionId: string): Promise<NegotiationSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async updateSession(sessionId: string, updates: Partial<NegotiationSession>): Promise<NegotiationSession | null> {
    const existing = this.sessions.get(sessionId);
    if (!existing) return null;

    const now = Date.now();
    const updated: NegotiationSession = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    if ((updates.status === 'accepted' || updates.status === 'rejected') && !updated.completedAt) {
      updated.completedAt = now;
    }

    this.sessions.set(sessionId, updated);
    return updated;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async listSessions(userId: string, options: NegotiationQueryOptions = {}): Promise<NegotiationSession[]> {
    let items = Array.from(this.sessions.values()).filter(s => s.userId === userId);

    if (options.status && options.status.length > 0) {
      items = items.filter(s => options.status!.includes(s.status));
    }

    if (options.type && options.type.length > 0) {
      items = items.filter(s => options.type!.includes(s.type));
    }

    items.sort((a, b) => b.createdAt - a.createdAt);

    if (options.offset) {
      items = items.slice(options.offset);
    }

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  async countSessions(userId: string, options: NegotiationQueryOptions = {}): Promise<number> {
    const items = await this.listSessions(userId, { ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async getByStatus(userId: string, statuses: NegotiationStatus[]): Promise<NegotiationSession[]> {
    return this.listSessions(userId, { status: statuses });
  }

  async getActiveNegotiations(userId: string): Promise<NegotiationSession[]> {
    return this.listSessions(userId, { status: ['pending', 'awaiting_response', 'counter_received'] });
  }

  async getByVendor(userId: string, vendorName: string): Promise<NegotiationSession[]> {
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId && s.vendor.name === vendorName)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getSuccessful(userId: string): Promise<NegotiationSession[]> {
    return this.listSessions(userId, { status: ['accepted'] });
  }

  async addEmail(sessionId: string, email: Omit<NegotiationEmail, 'id'>): Promise<NegotiationEmail | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const newEmail: NegotiationEmail = { ...email, id: randomUUID() };
    session.emails.push(newEmail);
    session.updatedAt = Date.now();
    return newEmail;
  }

  async getEmails(sessionId: string): Promise<NegotiationEmail[]> {
    return this.sessions.get(sessionId)?.emails ?? [];
  }

  async updateEmail(sessionId: string, emailId: string, updates: Partial<NegotiationEmail>): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const emailIndex = session.emails.findIndex(e => e.id === emailId);
    if (emailIndex === -1) return false;

    session.emails[emailIndex] = { ...session.emails[emailIndex], ...updates };
    session.updatedAt = Date.now();
    return true;
  }

  async addCounterOffer(sessionId: string, offer: Omit<CounterOffer, 'id'>): Promise<CounterOffer | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const newOffer: CounterOffer = { ...offer, id: randomUUID() };
    session.counterOffers.push(newOffer);
    session.updatedAt = Date.now();
    return newOffer;
  }

  async getCounterOffers(sessionId: string): Promise<CounterOffer[]> {
    return this.sessions.get(sessionId)?.counterOffers ?? [];
  }

  async updateCounterOffer(sessionId: string, offerId: string, updates: Partial<CounterOffer>): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const offerIndex = session.counterOffers.findIndex(o => o.id === offerId);
    if (offerIndex === -1) return false;

    session.counterOffers[offerIndex] = { ...session.counterOffers[offerIndex], ...updates };
    session.updatedAt = Date.now();
    return true;
  }

  async createTemplate(template: Omit<NegotiationTemplate, 'id'>): Promise<NegotiationTemplate> {
    const item: NegotiationTemplate = { ...template, id: randomUUID() };
    this.templates.set(item.id, item);
    return item;
  }

  async getTemplate(templateId: string): Promise<NegotiationTemplate | null> {
    return this.templates.get(templateId) ?? null;
  }

  async listTemplates(options: { type?: string; vendorCategory?: string } = {}): Promise<NegotiationTemplate[]> {
    let items = Array.from(this.templates.values());

    if (options.type) {
      items = items.filter(t => t.type === options.type);
    }

    if (options.vendorCategory) {
      items = items.filter(t => t.vendorCategory === options.vendorCategory);
    }

    return items.sort((a, b) => (b.successRate ?? 0) - (a.successRate ?? 0));
  }

  async updateTemplate(templateId: string, updates: Partial<NegotiationTemplate>): Promise<NegotiationTemplate | null> {
    const existing = this.templates.get(templateId);
    if (!existing) return null;

    const updated: NegotiationTemplate = { ...existing, ...updates, id: existing.id };
    this.templates.set(templateId, updated);
    return updated;
  }

  async deleteTemplate(templateId: string): Promise<boolean> {
    return this.templates.delete(templateId);
  }

  async getAverageSavings(userId: string): Promise<number> {
    const successful = await this.getSuccessful(userId);
    if (successful.length === 0) return 0;

    const totalSavings = successful.reduce((sum, s) => sum + (s.currentAmount - s.targetAmount), 0);
    return totalSavings / successful.length;
  }

  async getSuccessRate(userId: string): Promise<number> {
    const completed = Array.from(this.sessions.values())
      .filter(s => s.userId === userId && (s.status === 'accepted' || s.status === 'rejected'));

    if (completed.length === 0) return 0;

    const successful = completed.filter(s => s.status === 'accepted').length;
    return (successful / completed.length) * 100;
  }

  async getTotalSavings(userId: string): Promise<number> {
    const successful = await this.getSuccessful(userId);
    return successful.reduce((sum, s) => sum + Math.max(0, s.currentAmount - s.targetAmount), 0);
  }
}

// Row types for database
interface NegotiationRow {
  id: string;
  user_id: string;
  type: string;
  vendor_data: string;
  target_amount: number;
  current_amount: number;
  status: string;
  emails: string;
  counter_offers: string;
  notes: string | null;
  started_at: number;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

interface TemplateRow {
  id: string;
  name: string;
  type: string;
  vendor_category: string;
  subject: string;
  body: string;
  variables: string;
  success_rate: number | null;
}

/**
 * Factory function to create negotiation store
 */
export function createNegotiationStore(type: 'memory'): InMemoryNegotiationStore;
export function createNegotiationStore(type: 'database', db: DatabaseAdapter): DatabaseNegotiationStore;
export function createNegotiationStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): NegotiationStore {
  if (type === 'memory') {
    return new InMemoryNegotiationStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseNegotiationStore(db);
}
