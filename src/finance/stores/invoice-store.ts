/**
 * Invoice Store
 *
 * Persistence layer for invoices and time entries with interface, database, and in-memory implementations.
 */

import { randomUUID } from 'crypto';
import type {
  Invoice,
  InvoiceLineItem,
  InvoiceStatus,
  InvoiceClient,
  TimeEntry,
  InvoiceSummary,
  InvoiceQueryOptions,
  TimeEntryQueryOptions,
  Currency,
} from '../types.js';
import type { DatabaseAdapter } from './trade-store.js';

// =============================================================================
// Invoice Store Interface
// =============================================================================

export interface InvoiceStore {
  initialize(): Promise<void>;

  // Invoice CRUD
  createInvoice(invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>): Promise<Invoice>;
  getInvoice(invoiceId: string): Promise<Invoice | null>;
  getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | null>;
  updateInvoice(invoiceId: string, updates: Partial<Invoice>): Promise<Invoice | null>;
  deleteInvoice(invoiceId: string): Promise<boolean>;
  listInvoices(userId: string, options?: InvoiceQueryOptions): Promise<Invoice[]>;

  // Invoice status
  updateInvoiceStatus(invoiceId: string, status: InvoiceStatus): Promise<boolean>;
  markAsPaid(invoiceId: string, paymentMethod?: string): Promise<boolean>;

  // Line items
  addLineItem(invoiceId: string, item: Omit<InvoiceLineItem, 'id'>): Promise<InvoiceLineItem>;
  updateLineItem(invoiceId: string, itemId: string, updates: Partial<InvoiceLineItem>): Promise<boolean>;
  removeLineItem(invoiceId: string, itemId: string): Promise<boolean>;

  // Time entries
  createTimeEntry(entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<TimeEntry>;
  getTimeEntry(entryId: string): Promise<TimeEntry | null>;
  updateTimeEntry(entryId: string, updates: Partial<TimeEntry>): Promise<TimeEntry | null>;
  deleteTimeEntry(entryId: string): Promise<boolean>;
  listTimeEntries(userId: string, options?: TimeEntryQueryOptions): Promise<TimeEntry[]>;
  getUnbilledTimeEntries(userId: string, projectId?: string): Promise<TimeEntry[]>;
  markTimeEntriesAsBilled(entryIds: string[], invoiceId: string): Promise<void>;

  // Statistics
  getInvoiceSummary(userId: string, dateFrom?: number, dateTo?: number): Promise<InvoiceSummary>;
  getNextInvoiceNumber(userId: string, prefix: string): Promise<string>;
}

// =============================================================================
// Database Row Types
// =============================================================================

interface InvoiceRow {
  id: string;
  user_id: string;
  invoice_number: string;
  client_json: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  currency: string;
  status: string;
  issue_date: number;
  due_date: number;
  paid_date: number | null;
  payment_method: string | null;
  notes: string | null;
  terms: string | null;
  template: string;
  created_at: number;
  updated_at: number;
}

interface LineItemRow {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  taxable: number;
  category: string | null;
  time_entry_ids_json: string | null;
}

interface TimeEntryRow {
  id: string;
  user_id: string;
  project_id: string | null;
  project_name: string | null;
  task_description: string;
  start_time: number;
  end_time: number;
  duration_minutes: number;
  hourly_rate: number | null;
  billable: number;
  billed: number;
  invoice_id: string | null;
  tags_json: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Database Invoice Store
// =============================================================================

export class DatabaseInvoiceStore implements InvoiceStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Invoices table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        invoice_number TEXT NOT NULL UNIQUE,
        client_json TEXT NOT NULL,
        subtotal REAL NOT NULL,
        tax_rate REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        discount_amount REAL DEFAULT 0,
        total REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'draft',
        issue_date INTEGER NOT NULL,
        due_date INTEGER NOT NULL,
        paid_date INTEGER,
        payment_method TEXT,
        notes TEXT,
        terms TEXT,
        template TEXT DEFAULT 'standard',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Line items table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS invoice_line_items (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        description TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        amount REAL NOT NULL,
        taxable INTEGER DEFAULT 1,
        category TEXT,
        time_entry_ids_json TEXT,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `);

    // Time entries table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT,
        project_name TEXT,
        task_description TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        duration_minutes INTEGER NOT NULL,
        hourly_rate REAL,
        billable INTEGER DEFAULT 1,
        billed INTEGER DEFAULT 0,
        invoice_id TEXT,
        tags_json TEXT,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
      )
    `);

    // Create indexes
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(user_id, status)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(user_id, due_date)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON invoice_line_items(invoice_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(user_id, project_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_time_entries_billed ON time_entries(user_id, billed)
    `);
  }

  // Invoice CRUD
  async createInvoice(
    invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Invoice> {
    const now = Date.now();
    const id = randomUUID();

    const item: Invoice = {
      ...invoice,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO invoices (
        id, user_id, invoice_number, client_json, subtotal, tax_rate,
        tax_amount, discount_amount, total, currency, status, issue_date,
        due_date, paid_date, payment_method, notes, terms, template,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.invoiceNumber,
        JSON.stringify(item.client),
        item.subtotal,
        item.taxRate,
        item.taxAmount,
        item.discountAmount,
        item.total,
        item.currency,
        item.status,
        item.issueDate,
        item.dueDate,
        item.paidDate ?? null,
        item.paymentMethod ?? null,
        item.notes ?? null,
        item.terms ?? null,
        item.template,
        item.createdAt,
        item.updatedAt,
      ]
    );

    // Save line items
    for (const lineItem of item.lineItems) {
      await this.addLineItem(item.id, lineItem);
    }

    return item;
  }

  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    const result = await this.db.query<InvoiceRow>(
      'SELECT * FROM invoices WHERE id = ?',
      [invoiceId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const lineItems = await this.getLineItems(invoiceId);
    return this.rowToInvoice(result.rows[0], lineItems);
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | null> {
    const result = await this.db.query<InvoiceRow>(
      'SELECT * FROM invoices WHERE invoice_number = ?',
      [invoiceNumber]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const lineItems = await this.getLineItems(result.rows[0].id);
    return this.rowToInvoice(result.rows[0], lineItems);
  }

  async updateInvoice(
    invoiceId: string,
    updates: Partial<Invoice>
  ): Promise<Invoice | null> {
    const existing = await this.getInvoice(invoiceId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const params: unknown[] = [now];

    if (updates.client !== undefined) {
      setClauses.push('client_json = ?');
      params.push(JSON.stringify(updates.client));
    }
    if (updates.subtotal !== undefined) {
      setClauses.push('subtotal = ?');
      params.push(updates.subtotal);
    }
    if (updates.taxRate !== undefined) {
      setClauses.push('tax_rate = ?');
      params.push(updates.taxRate);
    }
    if (updates.taxAmount !== undefined) {
      setClauses.push('tax_amount = ?');
      params.push(updates.taxAmount);
    }
    if (updates.discountAmount !== undefined) {
      setClauses.push('discount_amount = ?');
      params.push(updates.discountAmount);
    }
    if (updates.total !== undefined) {
      setClauses.push('total = ?');
      params.push(updates.total);
    }
    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      params.push(updates.status);
    }
    if (updates.dueDate !== undefined) {
      setClauses.push('due_date = ?');
      params.push(updates.dueDate);
    }
    if (updates.paidDate !== undefined) {
      setClauses.push('paid_date = ?');
      params.push(updates.paidDate);
    }
    if (updates.paymentMethod !== undefined) {
      setClauses.push('payment_method = ?');
      params.push(updates.paymentMethod);
    }
    if (updates.notes !== undefined) {
      setClauses.push('notes = ?');
      params.push(updates.notes);
    }
    if (updates.terms !== undefined) {
      setClauses.push('terms = ?');
      params.push(updates.terms);
    }
    if (updates.template !== undefined) {
      setClauses.push('template = ?');
      params.push(updates.template);
    }

    params.push(invoiceId);

    await this.db.execute(
      `UPDATE invoices SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    return this.getInvoice(invoiceId);
  }

  async deleteInvoice(invoiceId: string): Promise<boolean> {
    // Unmark time entries before deleting
    await this.db.execute(
      'UPDATE time_entries SET billed = 0, invoice_id = NULL WHERE invoice_id = ?',
      [invoiceId]
    );

    const result = await this.db.execute('DELETE FROM invoices WHERE id = ?', [invoiceId]);
    return result.changes > 0;
  }

  async listInvoices(userId: string, options: InvoiceQueryOptions = {}): Promise<Invoice[]> {
    let sql = 'SELECT * FROM invoices WHERE user_id = ?';
    const params: unknown[] = [userId];

    if (options.status && options.status.length > 0) {
      const placeholders = options.status.map(() => '?').join(',');
      sql += ` AND status IN (${placeholders})`;
      params.push(...options.status);
    }
    if (options.clientName) {
      sql += " AND json_extract(client_json, '$.name') LIKE ?";
      params.push(`%${options.clientName}%`);
    }
    if (options.dateFrom) {
      sql += ' AND issue_date >= ?';
      params.push(options.dateFrom);
    }
    if (options.dateTo) {
      sql += ' AND issue_date <= ?';
      params.push(options.dateTo);
    }
    if (options.minAmount !== undefined) {
      sql += ' AND total >= ?';
      params.push(options.minAmount);
    }
    if (options.maxAmount !== undefined) {
      sql += ' AND total <= ?';
      params.push(options.maxAmount);
    }

    sql += ' ORDER BY issue_date DESC';

    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (options.offset) {
      sql += ` OFFSET ${options.offset}`;
    }

    const result = await this.db.query<InvoiceRow>(sql, params);
    const invoices: Invoice[] = [];

    for (const row of result.rows) {
      const lineItems = await this.getLineItems(row.id);
      invoices.push(this.rowToInvoice(row, lineItems));
    }

    return invoices;
  }

  // Invoice status
  async updateInvoiceStatus(invoiceId: string, status: InvoiceStatus): Promise<boolean> {
    const result = await this.db.execute(
      'UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?',
      [status, Date.now(), invoiceId]
    );
    return result.changes > 0;
  }

  async markAsPaid(invoiceId: string, paymentMethod?: string): Promise<boolean> {
    const result = await this.db.execute(
      'UPDATE invoices SET status = ?, paid_date = ?, payment_method = ?, updated_at = ? WHERE id = ?',
      ['paid', Date.now(), paymentMethod ?? null, Date.now(), invoiceId]
    );
    return result.changes > 0;
  }

  // Line items
  private async getLineItems(invoiceId: string): Promise<InvoiceLineItem[]> {
    const result = await this.db.query<LineItemRow>(
      'SELECT * FROM invoice_line_items WHERE invoice_id = ?',
      [invoiceId]
    );

    return result.rows.map(row => ({
      id: row.id,
      description: row.description,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      amount: row.amount,
      taxable: row.taxable === 1,
      category: row.category ?? undefined,
      timeEntryIds: row.time_entry_ids_json ? JSON.parse(row.time_entry_ids_json) : undefined,
    }));
  }

  async addLineItem(invoiceId: string, item: Omit<InvoiceLineItem, 'id'>): Promise<InvoiceLineItem> {
    const id = randomUUID();
    const lineItem: InvoiceLineItem = { ...item, id };

    await this.db.execute(
      `INSERT INTO invoice_line_items (
        id, invoice_id, description, quantity, unit_price, amount,
        taxable, category, time_entry_ids_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lineItem.id,
        invoiceId,
        lineItem.description,
        lineItem.quantity,
        lineItem.unitPrice,
        lineItem.amount,
        lineItem.taxable ? 1 : 0,
        lineItem.category ?? null,
        lineItem.timeEntryIds ? JSON.stringify(lineItem.timeEntryIds) : null,
      ]
    );

    return lineItem;
  }

  async updateLineItem(
    invoiceId: string,
    itemId: string,
    updates: Partial<InvoiceLineItem>
  ): Promise<boolean> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.description !== undefined) {
      setClauses.push('description = ?');
      params.push(updates.description);
    }
    if (updates.quantity !== undefined) {
      setClauses.push('quantity = ?');
      params.push(updates.quantity);
    }
    if (updates.unitPrice !== undefined) {
      setClauses.push('unit_price = ?');
      params.push(updates.unitPrice);
    }
    if (updates.amount !== undefined) {
      setClauses.push('amount = ?');
      params.push(updates.amount);
    }
    if (updates.taxable !== undefined) {
      setClauses.push('taxable = ?');
      params.push(updates.taxable ? 1 : 0);
    }
    if (updates.category !== undefined) {
      setClauses.push('category = ?');
      params.push(updates.category);
    }

    if (setClauses.length === 0) {
      return false;
    }

    params.push(itemId, invoiceId);

    const result = await this.db.execute(
      `UPDATE invoice_line_items SET ${setClauses.join(', ')} WHERE id = ? AND invoice_id = ?`,
      params
    );

    // Update invoice updated_at
    await this.db.execute('UPDATE invoices SET updated_at = ? WHERE id = ?', [Date.now(), invoiceId]);

    return result.changes > 0;
  }

  async removeLineItem(invoiceId: string, itemId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM invoice_line_items WHERE id = ? AND invoice_id = ?',
      [itemId, invoiceId]
    );

    // Update invoice updated_at
    await this.db.execute('UPDATE invoices SET updated_at = ? WHERE id = ?', [Date.now(), invoiceId]);

    return result.changes > 0;
  }

  // Time entries
  async createTimeEntry(entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<TimeEntry> {
    const now = Date.now();
    const id = randomUUID();

    const item: TimeEntry = {
      ...entry,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO time_entries (
        id, user_id, project_id, project_name, task_description,
        start_time, end_time, duration_minutes, hourly_rate,
        billable, billed, invoice_id, tags_json, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.projectId ?? null,
        item.projectName ?? null,
        item.taskDescription,
        item.startTime,
        item.endTime,
        item.durationMinutes,
        item.hourlyRate ?? null,
        item.billable ? 1 : 0,
        item.billed ? 1 : 0,
        item.invoiceId ?? null,
        item.tags ? JSON.stringify(item.tags) : null,
        item.notes ?? null,
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async getTimeEntry(entryId: string): Promise<TimeEntry | null> {
    const result = await this.db.query<TimeEntryRow>(
      'SELECT * FROM time_entries WHERE id = ?',
      [entryId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToTimeEntry(result.rows[0]);
  }

  async updateTimeEntry(entryId: string, updates: Partial<TimeEntry>): Promise<TimeEntry | null> {
    const existing = await this.getTimeEntry(entryId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const params: unknown[] = [now];

    if (updates.projectId !== undefined) {
      setClauses.push('project_id = ?');
      params.push(updates.projectId);
    }
    if (updates.projectName !== undefined) {
      setClauses.push('project_name = ?');
      params.push(updates.projectName);
    }
    if (updates.taskDescription !== undefined) {
      setClauses.push('task_description = ?');
      params.push(updates.taskDescription);
    }
    if (updates.startTime !== undefined) {
      setClauses.push('start_time = ?');
      params.push(updates.startTime);
    }
    if (updates.endTime !== undefined) {
      setClauses.push('end_time = ?');
      params.push(updates.endTime);
    }
    if (updates.durationMinutes !== undefined) {
      setClauses.push('duration_minutes = ?');
      params.push(updates.durationMinutes);
    }
    if (updates.hourlyRate !== undefined) {
      setClauses.push('hourly_rate = ?');
      params.push(updates.hourlyRate);
    }
    if (updates.billable !== undefined) {
      setClauses.push('billable = ?');
      params.push(updates.billable ? 1 : 0);
    }
    if (updates.billed !== undefined) {
      setClauses.push('billed = ?');
      params.push(updates.billed ? 1 : 0);
    }
    if (updates.invoiceId !== undefined) {
      setClauses.push('invoice_id = ?');
      params.push(updates.invoiceId);
    }
    if (updates.tags !== undefined) {
      setClauses.push('tags_json = ?');
      params.push(JSON.stringify(updates.tags));
    }
    if (updates.notes !== undefined) {
      setClauses.push('notes = ?');
      params.push(updates.notes);
    }

    params.push(entryId);

    await this.db.execute(
      `UPDATE time_entries SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    return this.getTimeEntry(entryId);
  }

  async deleteTimeEntry(entryId: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM time_entries WHERE id = ?', [entryId]);
    return result.changes > 0;
  }

  async listTimeEntries(userId: string, options: TimeEntryQueryOptions = {}): Promise<TimeEntry[]> {
    let sql = 'SELECT * FROM time_entries WHERE user_id = ?';
    const params: unknown[] = [userId];

    if (options.projectId) {
      sql += ' AND project_id = ?';
      params.push(options.projectId);
    }
    if (options.billable !== undefined) {
      sql += ' AND billable = ?';
      params.push(options.billable ? 1 : 0);
    }
    if (options.billed !== undefined) {
      sql += ' AND billed = ?';
      params.push(options.billed ? 1 : 0);
    }
    if (options.dateFrom) {
      sql += ' AND start_time >= ?';
      params.push(options.dateFrom);
    }
    if (options.dateTo) {
      sql += ' AND start_time <= ?';
      params.push(options.dateTo);
    }

    sql += ' ORDER BY start_time DESC';

    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (options.offset) {
      sql += ` OFFSET ${options.offset}`;
    }

    const result = await this.db.query<TimeEntryRow>(sql, params);
    return result.rows.map(row => this.rowToTimeEntry(row));
  }

  async getUnbilledTimeEntries(userId: string, projectId?: string): Promise<TimeEntry[]> {
    let sql = 'SELECT * FROM time_entries WHERE user_id = ? AND billable = 1 AND billed = 0';
    const params: unknown[] = [userId];

    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }

    sql += ' ORDER BY start_time ASC';

    const result = await this.db.query<TimeEntryRow>(sql, params);
    return result.rows.map(row => this.rowToTimeEntry(row));
  }

  async markTimeEntriesAsBilled(entryIds: string[], invoiceId: string): Promise<void> {
    if (entryIds.length === 0) {
      return;
    }

    const placeholders = entryIds.map(() => '?').join(',');
    await this.db.execute(
      `UPDATE time_entries SET billed = 1, invoice_id = ?, updated_at = ? WHERE id IN (${placeholders})`,
      [invoiceId, Date.now(), ...entryIds]
    );
  }

  // Statistics
  async getInvoiceSummary(
    userId: string,
    dateFrom?: number,
    dateTo?: number
  ): Promise<InvoiceSummary> {
    let conditions = 'user_id = ?';
    const params: unknown[] = [userId];

    if (dateFrom) {
      conditions += ' AND issue_date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions += ' AND issue_date <= ?';
      params.push(dateTo);
    }

    const result = await this.db.query<InvoiceRow>(
      `SELECT * FROM invoices WHERE ${conditions}`,
      params
    );

    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let totalOverdue = 0;
    let invoiceCount = 0;
    let paidCount = 0;
    let overdueCount = 0;
    let totalPaymentDays = 0;
    let paymentsWithDays = 0;

    const now = Date.now();

    for (const row of result.rows) {
      invoiceCount++;
      totalInvoiced += row.total;

      if (row.status === 'paid') {
        totalPaid += row.total;
        paidCount++;

        if (row.paid_date && row.issue_date) {
          const paymentDays = Math.floor((row.paid_date - row.issue_date) / (1000 * 60 * 60 * 24));
          totalPaymentDays += paymentDays;
          paymentsWithDays++;
        }
      } else if (row.status === 'overdue' || (row.due_date < now && row.status !== 'cancelled' && row.status !== 'refunded')) {
        totalOverdue += row.total;
        overdueCount++;
        totalOutstanding += row.total;
      } else if (row.status !== 'cancelled' && row.status !== 'refunded' && row.status !== 'draft') {
        totalOutstanding += row.total;
      }
    }

    return {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      totalOverdue,
      invoiceCount,
      paidCount,
      overdueCount,
      averagePaymentDays: paymentsWithDays > 0 ? totalPaymentDays / paymentsWithDays : 0,
    };
  }

  async getNextInvoiceNumber(userId: string, prefix: string): Promise<string> {
    const result = await this.db.query<{ invoice_number: string }>(
      `SELECT invoice_number FROM invoices
       WHERE user_id = ? AND invoice_number LIKE ?
       ORDER BY created_at DESC LIMIT 1`,
      [userId, `${prefix}%`]
    );

    if (result.rows.length === 0) {
      return `${prefix}00001`;
    }

    const lastNumber = result.rows[0].invoice_number;
    const numericPart = lastNumber.replace(prefix, '');
    const nextNumber = parseInt(numericPart, 10) + 1;
    const padding = numericPart.length;

    return `${prefix}${nextNumber.toString().padStart(padding, '0')}`;
  }

  // Helper methods
  private rowToInvoice(row: InvoiceRow, lineItems: InvoiceLineItem[]): Invoice {
    return {
      id: row.id,
      userId: row.user_id,
      invoiceNumber: row.invoice_number,
      client: JSON.parse(row.client_json) as InvoiceClient,
      lineItems,
      subtotal: row.subtotal,
      taxRate: row.tax_rate,
      taxAmount: row.tax_amount,
      discountAmount: row.discount_amount,
      total: row.total,
      currency: row.currency as Currency,
      status: row.status as InvoiceStatus,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      paidDate: row.paid_date ?? undefined,
      paymentMethod: row.payment_method ?? undefined,
      notes: row.notes ?? undefined,
      terms: row.terms ?? undefined,
      template: row.template,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToTimeEntry(row: TimeEntryRow): TimeEntry {
    return {
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id ?? undefined,
      projectName: row.project_name ?? undefined,
      taskDescription: row.task_description,
      startTime: row.start_time,
      endTime: row.end_time,
      durationMinutes: row.duration_minutes,
      hourlyRate: row.hourly_rate ?? undefined,
      billable: row.billable === 1,
      billed: row.billed === 1,
      invoiceId: row.invoice_id ?? undefined,
      tags: row.tags_json ? JSON.parse(row.tags_json) : undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Invoice Store
// =============================================================================

export class InMemoryInvoiceStore implements InvoiceStore {
  private invoices = new Map<string, Invoice>();
  private timeEntries = new Map<string, TimeEntry>();
  private invoiceCounter = new Map<string, number>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async createInvoice(
    invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Invoice> {
    const now = Date.now();
    const item: Invoice = {
      ...invoice,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.invoices.set(item.id, item);
    return item;
  }

  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    return this.invoices.get(invoiceId) ?? null;
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | null> {
    for (const invoice of this.invoices.values()) {
      if (invoice.invoiceNumber === invoiceNumber) {
        return invoice;
      }
    }
    return null;
  }

  async updateInvoice(
    invoiceId: string,
    updates: Partial<Invoice>
  ): Promise<Invoice | null> {
    const existing = this.invoices.get(invoiceId);
    if (!existing) {
      return null;
    }

    const updated: Invoice = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      invoiceNumber: existing.invoiceNumber,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    this.invoices.set(invoiceId, updated);
    return updated;
  }

  async deleteInvoice(invoiceId: string): Promise<boolean> {
    // Unmark time entries
    for (const entry of this.timeEntries.values()) {
      if (entry.invoiceId === invoiceId) {
        entry.billed = false;
        entry.invoiceId = undefined;
      }
    }

    return this.invoices.delete(invoiceId);
  }

  async listInvoices(userId: string, options: InvoiceQueryOptions = {}): Promise<Invoice[]> {
    let result = Array.from(this.invoices.values()).filter(i => i.userId === userId);

    if (options.status && options.status.length > 0) {
      result = result.filter(i => options.status!.includes(i.status));
    }
    if (options.clientName) {
      const lowerName = options.clientName.toLowerCase();
      result = result.filter(i => i.client.name.toLowerCase().includes(lowerName));
    }
    if (options.dateFrom) {
      result = result.filter(i => i.issueDate >= options.dateFrom!);
    }
    if (options.dateTo) {
      result = result.filter(i => i.issueDate <= options.dateTo!);
    }
    if (options.minAmount !== undefined) {
      result = result.filter(i => i.total >= options.minAmount!);
    }
    if (options.maxAmount !== undefined) {
      result = result.filter(i => i.total <= options.maxAmount!);
    }

    result.sort((a, b) => b.issueDate - a.issueDate);

    if (options.offset) {
      result = result.slice(options.offset);
    }
    if (options.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  async updateInvoiceStatus(invoiceId: string, status: InvoiceStatus): Promise<boolean> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      return false;
    }
    invoice.status = status;
    invoice.updatedAt = Date.now();
    return true;
  }

  async markAsPaid(invoiceId: string, paymentMethod?: string): Promise<boolean> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      return false;
    }
    invoice.status = 'paid';
    invoice.paidDate = Date.now();
    invoice.paymentMethod = paymentMethod;
    invoice.updatedAt = Date.now();
    return true;
  }

  async addLineItem(invoiceId: string, item: Omit<InvoiceLineItem, 'id'>): Promise<InvoiceLineItem> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const lineItem: InvoiceLineItem = { ...item, id: randomUUID() };
    invoice.lineItems.push(lineItem);
    invoice.updatedAt = Date.now();
    return lineItem;
  }

  async updateLineItem(
    invoiceId: string,
    itemId: string,
    updates: Partial<InvoiceLineItem>
  ): Promise<boolean> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      return false;
    }

    const item = invoice.lineItems.find(i => i.id === itemId);
    if (!item) {
      return false;
    }

    Object.assign(item, updates);
    invoice.updatedAt = Date.now();
    return true;
  }

  async removeLineItem(invoiceId: string, itemId: string): Promise<boolean> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      return false;
    }

    const index = invoice.lineItems.findIndex(i => i.id === itemId);
    if (index === -1) {
      return false;
    }

    invoice.lineItems.splice(index, 1);
    invoice.updatedAt = Date.now();
    return true;
  }

  async createTimeEntry(entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<TimeEntry> {
    const now = Date.now();
    const item: TimeEntry = {
      ...entry,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.timeEntries.set(item.id, item);
    return item;
  }

  async getTimeEntry(entryId: string): Promise<TimeEntry | null> {
    return this.timeEntries.get(entryId) ?? null;
  }

  async updateTimeEntry(entryId: string, updates: Partial<TimeEntry>): Promise<TimeEntry | null> {
    const existing = this.timeEntries.get(entryId);
    if (!existing) {
      return null;
    }

    const updated: TimeEntry = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    this.timeEntries.set(entryId, updated);
    return updated;
  }

  async deleteTimeEntry(entryId: string): Promise<boolean> {
    return this.timeEntries.delete(entryId);
  }

  async listTimeEntries(userId: string, options: TimeEntryQueryOptions = {}): Promise<TimeEntry[]> {
    let result = Array.from(this.timeEntries.values()).filter(e => e.userId === userId);

    if (options.projectId) {
      result = result.filter(e => e.projectId === options.projectId);
    }
    if (options.billable !== undefined) {
      result = result.filter(e => e.billable === options.billable);
    }
    if (options.billed !== undefined) {
      result = result.filter(e => e.billed === options.billed);
    }
    if (options.dateFrom) {
      result = result.filter(e => e.startTime >= options.dateFrom!);
    }
    if (options.dateTo) {
      result = result.filter(e => e.startTime <= options.dateTo!);
    }

    result.sort((a, b) => b.startTime - a.startTime);

    if (options.offset) {
      result = result.slice(options.offset);
    }
    if (options.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  async getUnbilledTimeEntries(userId: string, projectId?: string): Promise<TimeEntry[]> {
    let result = Array.from(this.timeEntries.values()).filter(
      e => e.userId === userId && e.billable && !e.billed
    );

    if (projectId) {
      result = result.filter(e => e.projectId === projectId);
    }

    return result.sort((a, b) => a.startTime - b.startTime);
  }

  async markTimeEntriesAsBilled(entryIds: string[], invoiceId: string): Promise<void> {
    for (const entryId of entryIds) {
      const entry = this.timeEntries.get(entryId);
      if (entry) {
        entry.billed = true;
        entry.invoiceId = invoiceId;
        entry.updatedAt = Date.now();
      }
    }
  }

  async getInvoiceSummary(
    userId: string,
    dateFrom?: number,
    dateTo?: number
  ): Promise<InvoiceSummary> {
    let invoices = Array.from(this.invoices.values()).filter(i => i.userId === userId);

    if (dateFrom) {
      invoices = invoices.filter(i => i.issueDate >= dateFrom);
    }
    if (dateTo) {
      invoices = invoices.filter(i => i.issueDate <= dateTo);
    }

    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let totalOverdue = 0;
    let invoiceCount = invoices.length;
    let paidCount = 0;
    let overdueCount = 0;
    let totalPaymentDays = 0;
    let paymentsWithDays = 0;

    const now = Date.now();

    for (const invoice of invoices) {
      totalInvoiced += invoice.total;

      if (invoice.status === 'paid') {
        totalPaid += invoice.total;
        paidCount++;

        if (invoice.paidDate) {
          const paymentDays = Math.floor((invoice.paidDate - invoice.issueDate) / (1000 * 60 * 60 * 24));
          totalPaymentDays += paymentDays;
          paymentsWithDays++;
        }
      } else if (invoice.status === 'overdue' || (invoice.dueDate < now && invoice.status !== 'cancelled' && invoice.status !== 'refunded')) {
        totalOverdue += invoice.total;
        overdueCount++;
        totalOutstanding += invoice.total;
      } else if (invoice.status !== 'cancelled' && invoice.status !== 'refunded' && invoice.status !== 'draft') {
        totalOutstanding += invoice.total;
      }
    }

    return {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      totalOverdue,
      invoiceCount,
      paidCount,
      overdueCount,
      averagePaymentDays: paymentsWithDays > 0 ? totalPaymentDays / paymentsWithDays : 0,
    };
  }

  async getNextInvoiceNumber(userId: string, prefix: string): Promise<string> {
    const key = `${userId}:${prefix}`;
    const current = this.invoiceCounter.get(key) ?? 0;
    const next = current + 1;
    this.invoiceCounter.set(key, next);
    return `${prefix}${next.toString().padStart(5, '0')}`;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createInvoiceStore(type: 'memory'): InMemoryInvoiceStore;
export function createInvoiceStore(type: 'database', db: DatabaseAdapter): DatabaseInvoiceStore;
export function createInvoiceStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): InvoiceStore {
  if (type === 'memory') {
    return new InMemoryInvoiceStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseInvoiceStore(db);
}
