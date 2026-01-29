/**
 * Bill Reminder Service
 *
 * Manages bill tracking and payment reminders.
 */

import type {
  Bill,
  BillPayment,
  BillReminder,
  BillFrequency,
  ExpenseCategory,
  BillServiceConfig,
} from '../types.js';
import type { BillStore } from '../stores/index.js';
import type { SavingsConfig } from '../config.js';

export { ReminderScheduler, type ScheduledReminder } from './reminder-scheduler.js';

/**
 * Bill reminder service configuration
 */
export interface BillReminderConfig {
  defaultReminderDays: number[];
  overdueGraceDays: number;
  maxBillsPerUser: number;
  reminderTime: string;
}

/**
 * Bill reminder service
 */
export class BillReminderService {
  private readonly config: BillReminderConfig;

  constructor(
    private readonly billStore: BillStore,
    config?: Partial<BillServiceConfig>
  ) {
    this.config = {
      defaultReminderDays: config?.defaultReminderDays ?? [7, 3, 1],
      overdueGraceDays: config?.overdueGraceDays ?? 3,
      maxBillsPerUser: 100,
      reminderTime: '09:00',
    };
  }

  // ==========================================================================
  // Bill Operations
  // ==========================================================================

  /**
   * Create a new bill
   */
  async createBill(
    userId: string,
    name: string,
    payee: string,
    amount: number,
    frequency: BillFrequency,
    dueDay: number,
    category: ExpenseCategory,
    options?: {
      payeeUrl?: string;
      accountNumber?: string;
      currency?: string;
      reminderDays?: number[];
      autopay?: boolean;
      autopayAccountId?: string;
    }
  ): Promise<Bill> {
    // Validate due day based on frequency
    this.validateDueDay(dueDay, frequency);

    // Check user bill limit
    const existingCount = await this.billStore.count(userId, { isActive: true });
    if (existingCount >= this.config.maxBillsPerUser) {
      throw new Error(`Maximum bills limit reached (${this.config.maxBillsPerUser})`);
    }

    const bill = await this.billStore.create({
      userId,
      name,
      payee,
      payeeUrl: options?.payeeUrl,
      accountNumber: options?.accountNumber,
      amount,
      currency: options?.currency ?? 'USD',
      frequency,
      dueDay,
      reminderDays: options?.reminderDays ?? this.config.defaultReminderDays,
      autopay: options?.autopay ?? false,
      autopayAccountId: options?.autopayAccountId,
      category,
      isActive: true,
      nextDueDate: this.billStore.calculateNextDueDate({
        frequency,
        dueDay,
      } as Bill),
      paymentHistory: [],
    });

    // Schedule initial reminders
    await this.scheduleReminders(bill);

    return bill;
  }

  /**
   * Get a bill by ID
   */
  async getBill(billId: string): Promise<Bill | null> {
    return this.billStore.get(billId);
  }

  /**
   * Update a bill
   */
  async updateBill(billId: string, updates: Partial<Bill>): Promise<Bill | null> {
    if (updates.dueDay !== undefined && updates.frequency) {
      this.validateDueDay(updates.dueDay, updates.frequency);
    }

    const updated = await this.billStore.update(billId, updates);

    // Reschedule reminders if due date changed
    if (updated && (updates.dueDay !== undefined || updates.frequency !== undefined)) {
      await this.billStore.updateNextDueDate(billId);
      await this.scheduleReminders(updated);
    }

    return updated;
  }

  /**
   * Delete a bill
   */
  async deleteBill(billId: string): Promise<boolean> {
    return this.billStore.delete(billId);
  }

  /**
   * Deactivate a bill (soft delete)
   */
  async deactivateBill(billId: string): Promise<Bill | null> {
    return this.billStore.update(billId, { isActive: false });
  }

  /**
   * List bills for a user
   */
  async listBills(
    userId: string,
    options?: {
      isActive?: boolean;
      category?: ExpenseCategory[];
      frequency?: BillFrequency[];
      limit?: number;
      offset?: number;
    }
  ): Promise<Bill[]> {
    return this.billStore.list(userId, options);
  }

  /**
   * Get active bills
   */
  async getActiveBills(userId: string): Promise<Bill[]> {
    return this.billStore.getActive(userId);
  }

  /**
   * Get bills due soon
   */
  async getBillsDueSoon(userId: string, withinDays: number): Promise<Bill[]> {
    return this.billStore.getDueSoon(userId, withinDays);
  }

  /**
   * Get overdue bills
   */
  async getOverdueBills(userId: string): Promise<Bill[]> {
    const overdue = await this.billStore.getOverdue(userId);
    const gracePeriodMs = this.config.overdueGraceDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // Filter out bills within grace period
    return overdue.filter(bill => {
      return (now - bill.nextDueDate) > gracePeriodMs;
    });
  }

  // ==========================================================================
  // Payment Operations
  // ==========================================================================

  /**
   * Record a payment for a bill
   */
  async recordPayment(
    billId: string,
    amount: number,
    options?: {
      paidAt?: number;
      method?: string;
      confirmationNumber?: string;
    }
  ): Promise<BillPayment | null> {
    const bill = await this.billStore.get(billId);
    if (!bill) {
      return null;
    }

    const paidAt = options?.paidAt ?? Date.now();
    const wasLate = paidAt > bill.nextDueDate;
    const gracePeriodMs = this.config.overdueGraceDays * 24 * 60 * 60 * 1000;
    const wasOverdue = (paidAt - bill.nextDueDate) > gracePeriodMs;

    const payment = await this.billStore.recordPayment(billId, {
      amount,
      paidAt,
      method: options?.method,
      confirmationNumber: options?.confirmationNumber,
      wasLate,
      lateFee: wasOverdue ? this.estimateLateFee(bill) : undefined,
    });

    // Schedule reminders for next due date
    if (payment) {
      const updatedBill = await this.billStore.get(billId);
      if (updatedBill) {
        await this.scheduleReminders(updatedBill);
      }
    }

    return payment;
  }

  /**
   * Get payment history for a bill
   */
  async getPaymentHistory(billId: string, limit?: number): Promise<BillPayment[]> {
    return this.billStore.getPaymentHistory(billId, limit);
  }

  /**
   * Check if a bill has been paid this cycle
   */
  async isPaidThisCycle(billId: string): Promise<boolean> {
    const bill = await this.billStore.get(billId);
    if (!bill) {
      return false;
    }

    // If last paid date is after the previous due date, it's paid for this cycle
    if (!bill.lastPaidDate) {
      return false;
    }

    const previousDueDate = this.calculatePreviousDueDate(bill);
    return bill.lastPaidDate >= previousDueDate;
  }

  // ==========================================================================
  // Reminder Operations
  // ==========================================================================

  /**
   * Schedule reminders for a bill
   */
  async scheduleReminders(bill: Bill): Promise<BillReminder[]> {
    const reminders: BillReminder[] = [];
    const reminderDays = bill.reminderDays.length > 0
      ? bill.reminderDays
      : this.config.defaultReminderDays;

    const [hour, minute] = this.config.reminderTime.split(':').map(Number);

    for (const daysBeforeDue of reminderDays) {
      const scheduledFor = new Date(bill.nextDueDate);
      scheduledFor.setDate(scheduledFor.getDate() - daysBeforeDue);
      scheduledFor.setHours(hour, minute, 0, 0);

      // Don't schedule past reminders
      if (scheduledFor.getTime() < Date.now()) {
        continue;
      }

      const reminder = await this.billStore.createReminder({
        billId: bill.id,
        userId: bill.userId,
        billName: bill.name,
        amount: bill.amount,
        dueDate: bill.nextDueDate,
        daysUntilDue: daysBeforeDue,
        scheduledFor: scheduledFor.getTime(),
        sent: false,
        channels: ['email', 'push'],
      });

      reminders.push(reminder);
    }

    return reminders;
  }

  /**
   * Get pending reminders
   */
  async getPendingReminders(userId: string): Promise<BillReminder[]> {
    return this.billStore.getPendingReminders(userId);
  }

  /**
   * Mark a reminder as sent
   */
  async markReminderSent(reminderId: string): Promise<boolean> {
    return this.billStore.markReminderSent(reminderId);
  }

  /**
   * Process pending reminders (to be called by scheduler)
   */
  async processPendingReminders(userId: string): Promise<BillReminder[]> {
    const pending = await this.billStore.getPendingReminders(userId);
    const processed: BillReminder[] = [];

    for (const reminder of pending) {
      // Mark as sent (actual notification would be sent via event)
      await this.billStore.markReminderSent(reminder.id);
      processed.push({ ...reminder, sent: true, sentAt: Date.now() });
    }

    return processed;
  }

  // ==========================================================================
  // Analytics
  // ==========================================================================

  /**
   * Get monthly bill total
   */
  async getMonthlyTotal(userId: string): Promise<number> {
    return this.billStore.getMonthlyTotal(userId);
  }

  /**
   * Get annual bill total
   */
  async getAnnualTotal(userId: string): Promise<number> {
    return this.billStore.getAnnualTotal(userId);
  }

  /**
   * Get bills by category
   */
  async getBillsByCategory(userId: string): Promise<Map<ExpenseCategory, Bill[]>> {
    const bills = await this.billStore.getActive(userId);
    const byCategory = new Map<ExpenseCategory, Bill[]>();

    for (const bill of bills) {
      if (!byCategory.has(bill.category)) {
        byCategory.set(bill.category, []);
      }
      byCategory.get(bill.category)!.push(bill);
    }

    return byCategory;
  }

  /**
   * Get bill payment statistics
   */
  async getPaymentStats(userId: string): Promise<{
    onTimePayments: number;
    latePayments: number;
    onTimePercentage: number;
    totalLateFees: number;
    averagePaymentDelay: number;
  }> {
    const bills = await this.billStore.getActive(userId);
    let onTimePayments = 0;
    let latePayments = 0;
    let totalLateFees = 0;
    let totalDelay = 0;
    let delayCount = 0;

    for (const bill of bills) {
      for (const payment of bill.paymentHistory) {
        if (payment.wasLate) {
          latePayments++;
        } else {
          onTimePayments++;
        }

        if (payment.lateFee) {
          totalLateFees += payment.lateFee;
        }
      }
    }

    const totalPayments = onTimePayments + latePayments;

    return {
      onTimePayments,
      latePayments,
      onTimePercentage: totalPayments > 0 ? (onTimePayments / totalPayments) * 100 : 100,
      totalLateFees,
      averagePaymentDelay: delayCount > 0 ? totalDelay / delayCount : 0,
    };
  }

  /**
   * Get upcoming bills summary
   */
  async getUpcomingSummary(
    userId: string,
    days: number
  ): Promise<{
    bills: Bill[];
    totalAmount: number;
    byCategory: Map<ExpenseCategory, number>;
  }> {
    const bills = await this.billStore.getDueSoon(userId, days);
    let totalAmount = 0;
    const byCategory = new Map<ExpenseCategory, number>();

    for (const bill of bills) {
      totalAmount += bill.amount;
      const categoryTotal = byCategory.get(bill.category) ?? 0;
      byCategory.set(bill.category, categoryTotal + bill.amount);
    }

    return { bills, totalAmount, byCategory };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Validate due day based on frequency
   */
  private validateDueDay(dueDay: number, frequency: BillFrequency): void {
    switch (frequency) {
      case 'weekly':
      case 'biweekly':
        if (dueDay < 1 || dueDay > 7) {
          throw new Error('Due day must be 1-7 for weekly/biweekly bills');
        }
        break;
      case 'monthly':
      case 'quarterly':
      case 'semi-annually':
      case 'annually':
        if (dueDay < 1 || dueDay > 31) {
          throw new Error('Due day must be 1-31 for monthly bills');
        }
        break;
    }
  }

  /**
   * Calculate the previous due date
   */
  private calculatePreviousDueDate(bill: Bill): number {
    const currentDue = new Date(bill.nextDueDate);

    switch (bill.frequency) {
      case 'weekly':
        currentDue.setDate(currentDue.getDate() - 7);
        break;
      case 'biweekly':
        currentDue.setDate(currentDue.getDate() - 14);
        break;
      case 'monthly':
        currentDue.setMonth(currentDue.getMonth() - 1);
        break;
      case 'quarterly':
        currentDue.setMonth(currentDue.getMonth() - 3);
        break;
      case 'semi-annually':
        currentDue.setMonth(currentDue.getMonth() - 6);
        break;
      case 'annually':
        currentDue.setFullYear(currentDue.getFullYear() - 1);
        break;
    }

    return currentDue.getTime();
  }

  /**
   * Estimate late fee for a bill
   */
  private estimateLateFee(bill: Bill): number {
    // Default late fee estimation: 5% of bill amount or $25, whichever is less
    return Math.min(bill.amount * 0.05, 25);
  }

  /**
   * Generate a bill payment reminder message
   */
  generateReminderMessage(bill: Bill, daysUntilDue: number): string {
    if (daysUntilDue === 0) {
      return `Your ${bill.name} bill ($${bill.amount.toFixed(2)}) is due today!`;
    } else if (daysUntilDue === 1) {
      return `Your ${bill.name} bill ($${bill.amount.toFixed(2)}) is due tomorrow.`;
    } else {
      return `Your ${bill.name} bill ($${bill.amount.toFixed(2)}) is due in ${daysUntilDue} days.`;
    }
  }
}

/**
 * Factory function to create bill reminder service
 */
export function createBillReminderService(
  billStore: BillStore,
  config?: Partial<SavingsConfig>
): BillReminderService {
  return new BillReminderService(billStore, config?.bills);
}
