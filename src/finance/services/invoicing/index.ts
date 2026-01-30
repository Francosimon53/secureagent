/**
 * Invoicing Service
 *
 * Invoice generation from time tracking data.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  Invoice,
  InvoiceLineItem,
  InvoiceClient,
  InvoiceStatus,
  TimeEntry,
  InvoiceSummary,
  Currency,
} from '../../types.js';
import type { InvoicingConfig } from '../../config.js';
import type { InvoiceStore } from '../../stores/invoice-store.js';
import { FINANCE_EVENTS } from '../../constants.js';

// =============================================================================
// Service Interface
// =============================================================================

export interface InvoicingService {
  // Initialization
  initialize(store: InvoiceStore): Promise<void>;

  // Invoice management
  createInvoice(userId: string, client: InvoiceClient, lineItems: Omit<InvoiceLineItem, 'id'>[]): Promise<Invoice>;
  getInvoice(invoiceId: string): Promise<Invoice | null>;
  updateInvoice(invoiceId: string, updates: Partial<Invoice>): Promise<Invoice | null>;
  deleteInvoice(invoiceId: string): Promise<boolean>;
  listInvoices(userId: string, status?: InvoiceStatus[]): Promise<Invoice[]>;

  // Invoice actions
  sendInvoice(invoiceId: string): Promise<boolean>;
  markAsPaid(invoiceId: string, paymentMethod?: string): Promise<boolean>;
  markAsOverdue(invoiceId: string): Promise<boolean>;

  // Time entries
  createTimeEntry(entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<TimeEntry>;
  getTimeEntry(entryId: string): Promise<TimeEntry | null>;
  updateTimeEntry(entryId: string, updates: Partial<TimeEntry>): Promise<TimeEntry | null>;
  deleteTimeEntry(entryId: string): Promise<boolean>;
  listTimeEntries(userId: string, projectId?: string): Promise<TimeEntry[]>;
  getUnbilledTimeEntries(userId: string, projectId?: string): Promise<TimeEntry[]>;

  // Invoice generation from time
  createInvoiceFromTimeEntries(
    userId: string,
    client: InvoiceClient,
    timeEntryIds: string[],
    hourlyRate: number
  ): Promise<Invoice>;

  // Statistics
  getInvoiceSummary(userId: string): Promise<InvoiceSummary>;

  // Events
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

// =============================================================================
// Implementation
// =============================================================================

export class InvoicingServiceImpl extends EventEmitter implements InvoicingService {
  private config: InvoicingConfig;
  private store: InvoiceStore | null = null;

  constructor(config?: Partial<InvoicingConfig>) {
    super();
    this.config = {
      enabled: true,
      defaultCurrency: 'USD',
      defaultTaxRate: 0,
      defaultPaymentTermsDays: 30,
      invoiceNumberPrefix: 'INV-',
      invoiceNumberPadding: 5,
      defaultTemplate: 'standard',
      overdueReminderDays: [1, 7, 14, 30],
      ...config,
    };
  }

  async initialize(store: InvoiceStore): Promise<void> {
    this.store = store;
    await this.store.initialize();
  }

  async createInvoice(
    userId: string,
    client: InvoiceClient,
    lineItems: Omit<InvoiceLineItem, 'id'>[]
  ): Promise<Invoice> {
    this.ensureInitialized();

    // Calculate totals
    const itemsWithIds = lineItems.map(item => ({
      ...item,
      id: randomUUID(),
    }));

    const subtotal = itemsWithIds.reduce((sum, item) => sum + item.amount, 0);
    const taxableAmount = itemsWithIds
      .filter(item => item.taxable)
      .reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = taxableAmount * (this.config.defaultTaxRate / 100);
    const total = subtotal + taxAmount;

    // Generate invoice number
    const invoiceNumber = await this.store!.getNextInvoiceNumber(
      userId,
      this.config.invoiceNumberPrefix
    );

    const now = Date.now();
    const dueDate = now + this.config.defaultPaymentTermsDays * 24 * 60 * 60 * 1000;

    const invoice = await this.store!.createInvoice({
      userId,
      invoiceNumber,
      client,
      lineItems: itemsWithIds,
      subtotal,
      taxRate: this.config.defaultTaxRate,
      taxAmount,
      discountAmount: 0,
      total,
      currency: this.config.defaultCurrency as Currency,
      status: 'draft',
      issueDate: now,
      dueDate,
      template: this.config.defaultTemplate,
    });

    this.emit(FINANCE_EVENTS.INVOICE_CREATED, invoice);

    return invoice;
  }

  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    this.ensureInitialized();
    return this.store!.getInvoice(invoiceId);
  }

  async updateInvoice(
    invoiceId: string,
    updates: Partial<Invoice>
  ): Promise<Invoice | null> {
    this.ensureInitialized();

    // Recalculate totals if line items changed
    if (updates.lineItems) {
      updates.subtotal = updates.lineItems.reduce((sum, item) => sum + item.amount, 0);
      const taxableAmount = updates.lineItems
        .filter(item => item.taxable)
        .reduce((sum, item) => sum + item.amount, 0);
      updates.taxAmount = taxableAmount * ((updates.taxRate ?? this.config.defaultTaxRate) / 100);
      updates.total = updates.subtotal + updates.taxAmount - (updates.discountAmount ?? 0);
    }

    return this.store!.updateInvoice(invoiceId, updates);
  }

  async deleteInvoice(invoiceId: string): Promise<boolean> {
    this.ensureInitialized();

    const invoice = await this.store!.getInvoice(invoiceId);
    const deleted = await this.store!.deleteInvoice(invoiceId);

    if (deleted && invoice) {
      this.emit(FINANCE_EVENTS.INVOICE_CANCELLED, invoice);
    }

    return deleted;
  }

  async listInvoices(userId: string, status?: InvoiceStatus[]): Promise<Invoice[]> {
    this.ensureInitialized();
    return this.store!.listInvoices(userId, { status });
  }

  async sendInvoice(invoiceId: string): Promise<boolean> {
    this.ensureInitialized();

    const invoice = await this.store!.getInvoice(invoiceId);
    if (!invoice || invoice.status !== 'draft') {
      return false;
    }

    const updated = await this.store!.updateInvoiceStatus(invoiceId, 'sent');

    if (updated) {
      this.emit(FINANCE_EVENTS.INVOICE_SENT, { invoiceId });
    }

    return updated;
  }

  async markAsPaid(invoiceId: string, paymentMethod?: string): Promise<boolean> {
    this.ensureInitialized();

    const result = await this.store!.markAsPaid(invoiceId, paymentMethod);

    if (result) {
      const invoice = await this.store!.getInvoice(invoiceId);
      this.emit(FINANCE_EVENTS.INVOICE_PAID, invoice);
    }

    return result;
  }

  async markAsOverdue(invoiceId: string): Promise<boolean> {
    this.ensureInitialized();

    const result = await this.store!.updateInvoiceStatus(invoiceId, 'overdue');

    if (result) {
      const invoice = await this.store!.getInvoice(invoiceId);
      this.emit(FINANCE_EVENTS.INVOICE_OVERDUE, invoice);
    }

    return result;
  }

  async createTimeEntry(
    entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<TimeEntry> {
    this.ensureInitialized();

    const timeEntry = await this.store!.createTimeEntry(entry);

    this.emit(FINANCE_EVENTS.TIME_ENTRY_CREATED, timeEntry);

    return timeEntry;
  }

  async getTimeEntry(entryId: string): Promise<TimeEntry | null> {
    this.ensureInitialized();
    return this.store!.getTimeEntry(entryId);
  }

  async updateTimeEntry(
    entryId: string,
    updates: Partial<TimeEntry>
  ): Promise<TimeEntry | null> {
    this.ensureInitialized();

    const updated = await this.store!.updateTimeEntry(entryId, updates);

    if (updated) {
      this.emit(FINANCE_EVENTS.TIME_ENTRY_UPDATED, updated);
    }

    return updated;
  }

  async deleteTimeEntry(entryId: string): Promise<boolean> {
    this.ensureInitialized();
    return this.store!.deleteTimeEntry(entryId);
  }

  async listTimeEntries(userId: string, projectId?: string): Promise<TimeEntry[]> {
    this.ensureInitialized();
    return this.store!.listTimeEntries(userId, { projectId });
  }

  async getUnbilledTimeEntries(userId: string, projectId?: string): Promise<TimeEntry[]> {
    this.ensureInitialized();
    return this.store!.getUnbilledTimeEntries(userId, projectId);
  }

  async createInvoiceFromTimeEntries(
    userId: string,
    client: InvoiceClient,
    timeEntryIds: string[],
    hourlyRate: number
  ): Promise<Invoice> {
    this.ensureInitialized();

    // Get time entries
    const entries: TimeEntry[] = [];
    for (const entryId of timeEntryIds) {
      const entry = await this.store!.getTimeEntry(entryId);
      if (entry && entry.billable && !entry.billed) {
        entries.push(entry);
      }
    }

    if (entries.length === 0) {
      throw new Error('No billable time entries found');
    }

    // Group by project
    const projectGroups = new Map<string, TimeEntry[]>();
    for (const entry of entries) {
      const projectKey = entry.projectId ?? 'Other';
      const group = projectGroups.get(projectKey) ?? [];
      group.push(entry);
      projectGroups.set(projectKey, group);
    }

    // Create line items
    const lineItems: Omit<InvoiceLineItem, 'id'>[] = [];

    for (const [projectId, projectEntries] of projectGroups) {
      const totalMinutes = projectEntries.reduce((sum, e) => sum + e.durationMinutes, 0);
      const hours = totalMinutes / 60;
      const rate = projectEntries[0].hourlyRate ?? hourlyRate;
      const amount = hours * rate;

      const projectName = projectEntries[0].projectName ?? projectId;

      // Create summary description
      const taskDescriptions = [...new Set(projectEntries.map(e => e.taskDescription))].slice(0, 3);
      const description = `${projectName}: ${taskDescriptions.join(', ')}${taskDescriptions.length < projectEntries.length ? '...' : ''} (${hours.toFixed(1)} hours)`;

      lineItems.push({
        description,
        quantity: hours,
        unitPrice: rate,
        amount,
        taxable: true,
        category: 'Services',
        timeEntryIds: projectEntries.map(e => e.id),
      });
    }

    // Create invoice
    const invoice = await this.createInvoice(userId, client, lineItems);

    // Mark time entries as billed
    await this.store!.markTimeEntriesAsBilled(timeEntryIds, invoice.id);

    return invoice;
  }

  async getInvoiceSummary(userId: string): Promise<InvoiceSummary> {
    this.ensureInitialized();
    return this.store!.getInvoiceSummary(userId);
  }

  private ensureInitialized(): void {
    if (!this.store) {
      throw new Error('Invoicing service not initialized');
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createInvoicingService(config?: Partial<InvoicingConfig>): InvoicingService {
  return new InvoicingServiceImpl(config);
}
