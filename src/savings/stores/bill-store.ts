/**
 * Bill Store
 *
 * Persistence layer for bill tracking and reminders.
 */

import { randomUUID } from 'crypto';
import type {
  Bill,
  BillPayment,
  BillReminder,
  BillQueryOptions,
  BillFrequency,
} from '../types.js';

/**
 * Interface for bill storage
 */
export interface BillStore {
  initialize(): Promise<void>;

  // CRUD operations
  create(bill: Omit<Bill, 'id' | 'createdAt' | 'updatedAt'>): Promise<Bill>;
  get(billId: string): Promise<Bill | null>;
  update(billId: string, updates: Partial<Bill>): Promise<Bill | null>;
  delete(billId: string): Promise<boolean>;

  // Query operations
  list(userId: string, options?: BillQueryOptions): Promise<Bill[]>;
  count(userId: string, options?: BillQueryOptions): Promise<number>;

  // Specialized queries
  getActive(userId: string): Promise<Bill[]>;
  getDueSoon(userId: string, withinDays: number): Promise<Bill[]>;
  getOverdue(userId: string): Promise<Bill[]>;
  getByCategory(userId: string, category: string): Promise<Bill[]>;

  // Payment operations
  recordPayment(billId: string, payment: Omit<BillPayment, 'id'>): Promise<BillPayment | null>;
  getPaymentHistory(billId: string, limit?: number): Promise<BillPayment[]>;

  // Reminder operations
  createReminder(reminder: Omit<BillReminder, 'id'>): Promise<BillReminder>;
  getReminder(reminderId: string): Promise<BillReminder | null>;
  getPendingReminders(userId: string): Promise<BillReminder[]>;
  markReminderSent(reminderId: string): Promise<boolean>;
  deleteReminder(reminderId: string): Promise<boolean>;

  // Due date calculations
  calculateNextDueDate(bill: Bill): number;
  updateNextDueDate(billId: string): Promise<boolean>;

  // Analytics
  getMonthlyTotal(userId: string): Promise<number>;
  getAnnualTotal(userId: string): Promise<number>;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Database-backed bill store
 */
export class DatabaseBillStore implements BillStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Bills table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        payee TEXT NOT NULL,
        payee_url TEXT,
        account_number TEXT,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        frequency TEXT NOT NULL,
        due_day INTEGER NOT NULL,
        reminder_days TEXT DEFAULT '[]',
        autopay INTEGER DEFAULT 0,
        autopay_account_id TEXT,
        category TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        next_due_date INTEGER NOT NULL,
        last_paid_date INTEGER,
        last_paid_amount REAL,
        payment_history TEXT DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_bills_user_active ON bills(user_id, is_active)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_bills_next_due ON bills(user_id, next_due_date)
    `);

    // Bill reminders table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS bill_reminders (
        id TEXT PRIMARY KEY,
        bill_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        bill_name TEXT NOT NULL,
        amount REAL NOT NULL,
        due_date INTEGER NOT NULL,
        days_until_due INTEGER NOT NULL,
        scheduled_for INTEGER NOT NULL,
        sent INTEGER DEFAULT 0,
        sent_at INTEGER,
        channels TEXT DEFAULT '[]'
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_bill_reminders_pending ON bill_reminders(user_id, sent, scheduled_for)
    `);
  }

  async create(bill: Omit<Bill, 'id' | 'createdAt' | 'updatedAt'>): Promise<Bill> {
    const now = Date.now();
    const id = randomUUID();

    const item: Bill = {
      ...bill,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO bills (
        id, user_id, name, payee, payee_url, account_number, amount, currency, frequency,
        due_day, reminder_days, autopay, autopay_account_id, category, is_active,
        next_due_date, last_paid_date, last_paid_amount, payment_history, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.name,
        item.payee,
        item.payeeUrl ?? null,
        item.accountNumber ?? null,
        item.amount,
        item.currency,
        item.frequency,
        item.dueDay,
        JSON.stringify(item.reminderDays),
        item.autopay ? 1 : 0,
        item.autopayAccountId ?? null,
        item.category,
        item.isActive ? 1 : 0,
        item.nextDueDate,
        item.lastPaidDate ?? null,
        item.lastPaidAmount ?? null,
        JSON.stringify(item.paymentHistory),
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async get(billId: string): Promise<Bill | null> {
    const result = await this.db.query<BillRow>(
      'SELECT * FROM bills WHERE id = ?',
      [billId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToBill(result.rows[0]);
  }

  async update(billId: string, updates: Partial<Bill>): Promise<Bill | null> {
    const existing = await this.get(billId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const updated: Bill = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    await this.db.execute(
      `UPDATE bills SET
        name = ?, payee = ?, payee_url = ?, account_number = ?, amount = ?, currency = ?,
        frequency = ?, due_day = ?, reminder_days = ?, autopay = ?, autopay_account_id = ?,
        category = ?, is_active = ?, next_due_date = ?, last_paid_date = ?, last_paid_amount = ?,
        payment_history = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.payee,
        updated.payeeUrl ?? null,
        updated.accountNumber ?? null,
        updated.amount,
        updated.currency,
        updated.frequency,
        updated.dueDay,
        JSON.stringify(updated.reminderDays),
        updated.autopay ? 1 : 0,
        updated.autopayAccountId ?? null,
        updated.category,
        updated.isActive ? 1 : 0,
        updated.nextDueDate,
        updated.lastPaidDate ?? null,
        updated.lastPaidAmount ?? null,
        JSON.stringify(updated.paymentHistory),
        updated.updatedAt,
        billId,
      ]
    );

    return updated;
  }

  async delete(billId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM bills WHERE id = ?',
      [billId]
    );
    return result.changes > 0;
  }

  async list(userId: string, options: BillQueryOptions = {}): Promise<Bill[]> {
    const { sql, params } = this.buildQuerySQL(userId, options);
    const result = await this.db.query<BillRow>(sql, params);
    return result.rows.map(row => this.rowToBill(row));
  }

  async count(userId: string, options: BillQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildQuerySQL(userId, options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async getActive(userId: string): Promise<Bill[]> {
    return this.list(userId, { isActive: true });
  }

  async getDueSoon(userId: string, withinDays: number): Promise<Bill[]> {
    const now = Date.now();
    const futureDate = now + (withinDays * 24 * 60 * 60 * 1000);

    return this.list(userId, { isActive: true, dueBefore: futureDate, dueAfter: now });
  }

  async getOverdue(userId: string): Promise<Bill[]> {
    const now = Date.now();
    return this.list(userId, { isActive: true, dueBefore: now });
  }

  async getByCategory(userId: string, category: string): Promise<Bill[]> {
    return this.list(userId, { category: [category as Bill['category']] });
  }

  async recordPayment(billId: string, payment: Omit<BillPayment, 'id'>): Promise<BillPayment | null> {
    const bill = await this.get(billId);
    if (!bill) {
      return null;
    }

    const newPayment: BillPayment = {
      ...payment,
      id: randomUUID(),
    };

    bill.paymentHistory.push(newPayment);
    bill.lastPaidDate = newPayment.paidAt;
    bill.lastPaidAmount = newPayment.amount;

    // Calculate next due date after payment
    const nextDueDate = this.calculateNextDueDate(bill);

    await this.update(billId, {
      paymentHistory: bill.paymentHistory,
      lastPaidDate: bill.lastPaidDate,
      lastPaidAmount: bill.lastPaidAmount,
      nextDueDate,
    });

    return newPayment;
  }

  async getPaymentHistory(billId: string, limit = 12): Promise<BillPayment[]> {
    const bill = await this.get(billId);
    if (!bill) {
      return [];
    }

    return bill.paymentHistory.slice(-limit).reverse();
  }

  async createReminder(reminder: Omit<BillReminder, 'id'>): Promise<BillReminder> {
    const id = randomUUID();
    const item: BillReminder = { ...reminder, id };

    await this.db.execute(
      `INSERT INTO bill_reminders (
        id, bill_id, user_id, bill_name, amount, due_date, days_until_due,
        scheduled_for, sent, sent_at, channels
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.billId,
        item.userId,
        item.billName,
        item.amount,
        item.dueDate,
        item.daysUntilDue,
        item.scheduledFor,
        item.sent ? 1 : 0,
        item.sentAt ?? null,
        JSON.stringify(item.channels),
      ]
    );

    return item;
  }

  async getReminder(reminderId: string): Promise<BillReminder | null> {
    const result = await this.db.query<ReminderRow>(
      'SELECT * FROM bill_reminders WHERE id = ?',
      [reminderId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToReminder(result.rows[0]);
  }

  async getPendingReminders(userId: string): Promise<BillReminder[]> {
    const now = Date.now();
    const result = await this.db.query<ReminderRow>(
      `SELECT * FROM bill_reminders
       WHERE user_id = ? AND sent = 0 AND scheduled_for <= ?
       ORDER BY scheduled_for ASC`,
      [userId, now]
    );
    return result.rows.map(row => this.rowToReminder(row));
  }

  async markReminderSent(reminderId: string): Promise<boolean> {
    const result = await this.db.execute(
      'UPDATE bill_reminders SET sent = 1, sent_at = ? WHERE id = ?',
      [Date.now(), reminderId]
    );
    return result.changes > 0;
  }

  async deleteReminder(reminderId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM bill_reminders WHERE id = ?',
      [reminderId]
    );
    return result.changes > 0;
  }

  calculateNextDueDate(bill: Bill): number {
    const now = new Date();
    let nextDue = new Date();

    switch (bill.frequency) {
      case 'weekly':
        nextDue.setDate(now.getDate() + ((7 - now.getDay() + bill.dueDay) % 7 || 7));
        break;
      case 'biweekly':
        nextDue.setDate(now.getDate() + ((14 - now.getDay() + bill.dueDay) % 14 || 14));
        break;
      case 'monthly':
        nextDue = new Date(now.getFullYear(), now.getMonth(), bill.dueDay);
        if (nextDue <= now) {
          nextDue.setMonth(nextDue.getMonth() + 1);
        }
        break;
      case 'quarterly':
        nextDue = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, bill.dueDay);
        if (nextDue <= now) {
          nextDue.setMonth(nextDue.getMonth() + 3);
        }
        break;
      case 'semi-annually':
        nextDue = new Date(now.getFullYear(), Math.floor(now.getMonth() / 6) * 6, bill.dueDay);
        if (nextDue <= now) {
          nextDue.setMonth(nextDue.getMonth() + 6);
        }
        break;
      case 'annually':
        nextDue = new Date(now.getFullYear(), 0, bill.dueDay);
        if (nextDue <= now) {
          nextDue.setFullYear(nextDue.getFullYear() + 1);
        }
        break;
    }

    return nextDue.getTime();
  }

  async updateNextDueDate(billId: string): Promise<boolean> {
    const bill = await this.get(billId);
    if (!bill) {
      return false;
    }

    const nextDueDate = this.calculateNextDueDate(bill);
    await this.update(billId, { nextDueDate });
    return true;
  }

  async getMonthlyTotal(userId: string): Promise<number> {
    const bills = await this.getActive(userId);
    return bills.reduce((total, bill) => {
      let monthlyAmount = bill.amount;

      switch (bill.frequency) {
        case 'weekly':
          monthlyAmount = bill.amount * 4.33;
          break;
        case 'biweekly':
          monthlyAmount = bill.amount * 2.17;
          break;
        case 'quarterly':
          monthlyAmount = bill.amount / 3;
          break;
        case 'semi-annually':
          monthlyAmount = bill.amount / 6;
          break;
        case 'annually':
          monthlyAmount = bill.amount / 12;
          break;
      }

      return total + monthlyAmount;
    }, 0);
  }

  async getAnnualTotal(userId: string): Promise<number> {
    const monthlyTotal = await this.getMonthlyTotal(userId);
    return monthlyTotal * 12;
  }

  private buildQuerySQL(
    userId: string,
    options: BillQueryOptions,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (options.isActive !== undefined) {
      conditions.push('is_active = ?');
      params.push(options.isActive ? 1 : 0);
    }

    if (options.category && options.category.length > 0) {
      const placeholders = options.category.map(() => '?').join(',');
      conditions.push(`category IN (${placeholders})`);
      params.push(...options.category);
    }

    if (options.frequency && options.frequency.length > 0) {
      const placeholders = options.frequency.map(() => '?').join(',');
      conditions.push(`frequency IN (${placeholders})`);
      params.push(...options.frequency);
    }

    if (options.dueBefore) {
      conditions.push('next_due_date < ?');
      params.push(options.dueBefore);
    }

    if (options.dueAfter) {
      conditions.push('next_due_date > ?');
      params.push(options.dueAfter);
    }

    const whereClause = conditions.join(' AND ');

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM bills WHERE ${whereClause}`,
        params,
      };
    }

    let sql = `SELECT * FROM bills WHERE ${whereClause} ORDER BY next_due_date ASC`;

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

  private rowToBill(row: BillRow): Bill {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      payee: row.payee,
      payeeUrl: row.payee_url ?? undefined,
      accountNumber: row.account_number ?? undefined,
      amount: row.amount,
      currency: row.currency,
      frequency: row.frequency as BillFrequency,
      dueDay: row.due_day,
      reminderDays: JSON.parse(row.reminder_days),
      autopay: row.autopay === 1,
      autopayAccountId: row.autopay_account_id ?? undefined,
      category: row.category as Bill['category'],
      isActive: row.is_active === 1,
      nextDueDate: row.next_due_date,
      lastPaidDate: row.last_paid_date ?? undefined,
      lastPaidAmount: row.last_paid_amount ?? undefined,
      paymentHistory: JSON.parse(row.payment_history),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToReminder(row: ReminderRow): BillReminder {
    return {
      id: row.id,
      billId: row.bill_id,
      userId: row.user_id,
      billName: row.bill_name,
      amount: row.amount,
      dueDate: row.due_date,
      daysUntilDue: row.days_until_due,
      scheduledFor: row.scheduled_for,
      sent: row.sent === 1,
      sentAt: row.sent_at ?? undefined,
      channels: JSON.parse(row.channels),
    };
  }
}

/**
 * In-memory bill store for testing
 */
export class InMemoryBillStore implements BillStore {
  private bills = new Map<string, Bill>();
  private reminders = new Map<string, BillReminder>();

  async initialize(): Promise<void> {
    // No-op
  }

  async create(bill: Omit<Bill, 'id' | 'createdAt' | 'updatedAt'>): Promise<Bill> {
    const now = Date.now();
    const item: Bill = {
      ...bill,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.bills.set(item.id, item);
    return item;
  }

  async get(billId: string): Promise<Bill | null> {
    return this.bills.get(billId) ?? null;
  }

  async update(billId: string, updates: Partial<Bill>): Promise<Bill | null> {
    const existing = this.bills.get(billId);
    if (!existing) return null;

    const updated: Bill = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    this.bills.set(billId, updated);
    return updated;
  }

  async delete(billId: string): Promise<boolean> {
    return this.bills.delete(billId);
  }

  async list(userId: string, options: BillQueryOptions = {}): Promise<Bill[]> {
    let items = Array.from(this.bills.values()).filter(b => b.userId === userId);

    if (options.isActive !== undefined) {
      items = items.filter(b => b.isActive === options.isActive);
    }

    if (options.category && options.category.length > 0) {
      items = items.filter(b => options.category!.includes(b.category));
    }

    if (options.frequency && options.frequency.length > 0) {
      items = items.filter(b => options.frequency!.includes(b.frequency));
    }

    if (options.dueBefore) {
      items = items.filter(b => b.nextDueDate < options.dueBefore!);
    }

    if (options.dueAfter) {
      items = items.filter(b => b.nextDueDate > options.dueAfter!);
    }

    items.sort((a, b) => a.nextDueDate - b.nextDueDate);

    if (options.offset) {
      items = items.slice(options.offset);
    }

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  async count(userId: string, options: BillQueryOptions = {}): Promise<number> {
    const items = await this.list(userId, { ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async getActive(userId: string): Promise<Bill[]> {
    return this.list(userId, { isActive: true });
  }

  async getDueSoon(userId: string, withinDays: number): Promise<Bill[]> {
    const now = Date.now();
    const futureDate = now + (withinDays * 24 * 60 * 60 * 1000);
    return this.list(userId, { isActive: true, dueBefore: futureDate, dueAfter: now });
  }

  async getOverdue(userId: string): Promise<Bill[]> {
    return this.list(userId, { isActive: true, dueBefore: Date.now() });
  }

  async getByCategory(userId: string, category: string): Promise<Bill[]> {
    return this.list(userId, { category: [category as Bill['category']] });
  }

  async recordPayment(billId: string, payment: Omit<BillPayment, 'id'>): Promise<BillPayment | null> {
    const bill = this.bills.get(billId);
    if (!bill) return null;

    const newPayment: BillPayment = { ...payment, id: randomUUID() };
    bill.paymentHistory.push(newPayment);
    bill.lastPaidDate = newPayment.paidAt;
    bill.lastPaidAmount = newPayment.amount;
    bill.nextDueDate = this.calculateNextDueDate(bill);
    bill.updatedAt = Date.now();
    return newPayment;
  }

  async getPaymentHistory(billId: string, limit = 12): Promise<BillPayment[]> {
    const bill = this.bills.get(billId);
    return bill?.paymentHistory.slice(-limit).reverse() ?? [];
  }

  async createReminder(reminder: Omit<BillReminder, 'id'>): Promise<BillReminder> {
    const item: BillReminder = { ...reminder, id: randomUUID() };
    this.reminders.set(item.id, item);
    return item;
  }

  async getReminder(reminderId: string): Promise<BillReminder | null> {
    return this.reminders.get(reminderId) ?? null;
  }

  async getPendingReminders(userId: string): Promise<BillReminder[]> {
    const now = Date.now();
    return Array.from(this.reminders.values())
      .filter(r => r.userId === userId && !r.sent && r.scheduledFor <= now)
      .sort((a, b) => a.scheduledFor - b.scheduledFor);
  }

  async markReminderSent(reminderId: string): Promise<boolean> {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) return false;
    reminder.sent = true;
    reminder.sentAt = Date.now();
    return true;
  }

  async deleteReminder(reminderId: string): Promise<boolean> {
    return this.reminders.delete(reminderId);
  }

  calculateNextDueDate(bill: Bill): number {
    const now = new Date();
    let nextDue = new Date();

    switch (bill.frequency) {
      case 'weekly':
        nextDue.setDate(now.getDate() + ((7 - now.getDay() + bill.dueDay) % 7 || 7));
        break;
      case 'biweekly':
        nextDue.setDate(now.getDate() + ((14 - now.getDay() + bill.dueDay) % 14 || 14));
        break;
      case 'monthly':
        nextDue = new Date(now.getFullYear(), now.getMonth(), bill.dueDay);
        if (nextDue <= now) nextDue.setMonth(nextDue.getMonth() + 1);
        break;
      case 'quarterly':
        nextDue = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, bill.dueDay);
        if (nextDue <= now) nextDue.setMonth(nextDue.getMonth() + 3);
        break;
      case 'semi-annually':
        nextDue = new Date(now.getFullYear(), Math.floor(now.getMonth() / 6) * 6, bill.dueDay);
        if (nextDue <= now) nextDue.setMonth(nextDue.getMonth() + 6);
        break;
      case 'annually':
        nextDue = new Date(now.getFullYear(), 0, bill.dueDay);
        if (nextDue <= now) nextDue.setFullYear(nextDue.getFullYear() + 1);
        break;
    }

    return nextDue.getTime();
  }

  async updateNextDueDate(billId: string): Promise<boolean> {
    const bill = this.bills.get(billId);
    if (!bill) return false;
    bill.nextDueDate = this.calculateNextDueDate(bill);
    bill.updatedAt = Date.now();
    return true;
  }

  async getMonthlyTotal(userId: string): Promise<number> {
    const bills = await this.getActive(userId);
    return bills.reduce((total, bill) => {
      let monthlyAmount = bill.amount;
      switch (bill.frequency) {
        case 'weekly': monthlyAmount = bill.amount * 4.33; break;
        case 'biweekly': monthlyAmount = bill.amount * 2.17; break;
        case 'quarterly': monthlyAmount = bill.amount / 3; break;
        case 'semi-annually': monthlyAmount = bill.amount / 6; break;
        case 'annually': monthlyAmount = bill.amount / 12; break;
      }
      return total + monthlyAmount;
    }, 0);
  }

  async getAnnualTotal(userId: string): Promise<number> {
    return (await this.getMonthlyTotal(userId)) * 12;
  }
}

// Row types for database
interface BillRow {
  id: string;
  user_id: string;
  name: string;
  payee: string;
  payee_url: string | null;
  account_number: string | null;
  amount: number;
  currency: string;
  frequency: string;
  due_day: number;
  reminder_days: string;
  autopay: number;
  autopay_account_id: string | null;
  category: string;
  is_active: number;
  next_due_date: number;
  last_paid_date: number | null;
  last_paid_amount: number | null;
  payment_history: string;
  created_at: number;
  updated_at: number;
}

interface ReminderRow {
  id: string;
  bill_id: string;
  user_id: string;
  bill_name: string;
  amount: number;
  due_date: number;
  days_until_due: number;
  scheduled_for: number;
  sent: number;
  sent_at: number | null;
  channels: string;
}

/**
 * Factory function to create bill store
 */
export function createBillStore(type: 'memory'): InMemoryBillStore;
export function createBillStore(type: 'database', db: DatabaseAdapter): DatabaseBillStore;
export function createBillStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): BillStore {
  if (type === 'memory') {
    return new InMemoryBillStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseBillStore(db);
}
