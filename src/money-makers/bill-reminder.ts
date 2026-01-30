/**
 * Bill Reminder
 *
 * Never miss a payment with smart reminders and tracking
 */

import type {
  Bill,
  BillPayment,
  BillReminder,
  BillCalendar,
  BillFrequency,
  BillStatus,
  Money,
  ExpenseCategory,
  AlertChannel,
  NotificationProvider,
} from './types.js';
import {
  MONEY_MAKERS_EVENTS,
  DEFAULT_REMINDER_DAYS,
  BILL_FREQUENCY_DAYS,
  calculateLateFee,
  formatMoney,
  getNextBillingDate,
} from './constants.js';

// =============================================================================
// Bill Reminder Config
// =============================================================================

export interface BillReminderConfig {
  /** Notification provider */
  notificationProvider?: NotificationProvider;
  /** Default reminder days before due date */
  defaultReminderDays: number[];
  /** Default alert channels */
  defaultAlertChannels: AlertChannel[];
  /** Auto-pay recommendation threshold (days) */
  autoPayRecommendThreshold: number;
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: BillReminderConfig = {
  defaultReminderDays: DEFAULT_REMINDER_DAYS,
  defaultAlertChannels: ['push'],
  autoPayRecommendThreshold: 3,
};

// =============================================================================
// Bill Reminder Manager
// =============================================================================

export class BillReminderManager {
  private readonly config: BillReminderConfig;
  private bills = new Map<string, Bill>();
  private payments = new Map<string, BillPayment>();
  private reminders = new Map<string, BillReminder>();
  private reminderTimers = new Map<string, NodeJS.Timeout>();

  constructor(config?: Partial<BillReminderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Bill Management
  // ==========================================================================

  /**
   * Add a new bill
   */
  addBill(params: {
    userId: string;
    name: string;
    payee: string;
    amount: Money;
    dueDate: number;
    frequency: BillFrequency;
    category?: ExpenseCategory;
    autoPay?: boolean;
    accountNumber?: string;
    website?: string;
    notes?: string;
    reminderDays?: number[];
  }): Bill {
    const id = this.generateId('bill');
    const now = Date.now();

    const bill: Bill = {
      id,
      userId: params.userId,
      name: params.name,
      payee: params.payee,
      amount: params.amount,
      dueDate: params.dueDate,
      frequency: params.frequency,
      category: params.category ?? 'other',
      autoPay: params.autoPay ?? false,
      accountNumber: params.accountNumber,
      website: params.website,
      notes: params.notes,
      reminderDays: params.reminderDays ?? this.config.defaultReminderDays,
      status: this.calculateBillStatus(params.dueDate),
      createdAt: now,
      updatedAt: now,
    };

    this.bills.set(id, bill);
    this.scheduleReminders(bill);

    this.emit(MONEY_MAKERS_EVENTS.BILL_CREATED, {
      billId: id,
      name: bill.name,
      amount: bill.amount,
      dueDate: bill.dueDate,
    });

    return bill;
  }

  /**
   * Get bill by ID
   */
  getBill(billId: string): Bill {
    const bill = this.bills.get(billId);
    if (!bill) {
      throw new Error(`Bill not found: ${billId}`);
    }
    // Update status
    bill.status = this.calculateBillStatus(bill.dueDate);
    return bill;
  }

  /**
   * Update bill
   */
  updateBill(
    billId: string,
    updates: Partial<Pick<
      Bill,
      'name' | 'payee' | 'amount' | 'dueDate' | 'frequency' | 'category' |
      'autoPay' | 'accountNumber' | 'website' | 'notes' | 'reminderDays'
    >>
  ): Bill {
    const bill = this.getBill(billId);

    Object.assign(bill, updates);
    bill.updatedAt = Date.now();

    // Reschedule reminders if due date changed
    if (updates.dueDate !== undefined || updates.reminderDays !== undefined) {
      this.clearReminders(billId);
      this.scheduleReminders(bill);
    }

    return bill;
  }

  /**
   * Delete bill
   */
  deleteBill(billId: string): void {
    this.clearReminders(billId);
    this.bills.delete(billId);
  }

  /**
   * Get user's bills
   */
  getUserBills(userId: string, status?: BillStatus): Bill[] {
    return Array.from(this.bills.values())
      .filter(b => b.userId === userId && (!status || b.status === status))
      .map(b => {
        b.status = this.calculateBillStatus(b.dueDate);
        return b;
      })
      .sort((a, b) => a.dueDate - b.dueDate);
  }

  /**
   * Get upcoming bills
   */
  getUpcomingBills(userId: string, daysAhead: number = 30): Bill[] {
    const cutoff = Date.now() + daysAhead * 24 * 60 * 60 * 1000;
    return this.getUserBills(userId).filter(
      b => b.dueDate <= cutoff && b.status !== 'paid' && b.status !== 'cancelled'
    );
  }

  /**
   * Get overdue bills
   */
  getOverdueBills(userId: string): Bill[] {
    return this.getUserBills(userId, 'overdue');
  }

  // ==========================================================================
  // Payment Tracking
  // ==========================================================================

  /**
   * Record a bill payment
   */
  recordPayment(
    billId: string,
    params: {
      amount: Money;
      paidDate?: number;
      confirmationNumber?: string;
      paymentMethod?: string;
      notes?: string;
    }
  ): BillPayment {
    const bill = this.getBill(billId);
    const paymentId = this.generateId('pay');
    const paidDate = params.paidDate ?? Date.now();

    const payment: BillPayment = {
      id: paymentId,
      billId,
      userId: bill.userId,
      amount: params.amount,
      paidDate,
      confirmationNumber: params.confirmationNumber,
      paymentMethod: params.paymentMethod,
      notes: params.notes,
    };

    this.payments.set(paymentId, payment);

    // Update bill
    bill.status = 'paid';
    bill.lastPaidDate = paidDate;
    bill.lastPaidAmount = params.amount;
    bill.updatedAt = Date.now();

    // Clear reminders
    this.clearReminders(billId);

    // Schedule next occurrence for recurring bills
    if (bill.frequency !== 'one_time') {
      bill.dueDate = getNextBillingDate(bill.dueDate, bill.frequency);
      bill.status = this.calculateBillStatus(bill.dueDate);
      this.scheduleReminders(bill);
    }

    this.emit(MONEY_MAKERS_EVENTS.BILL_PAID, {
      billId,
      paymentId,
      amount: params.amount,
    });

    return payment;
  }

  /**
   * Get payment history for a bill
   */
  getPaymentHistory(billId: string): BillPayment[] {
    return Array.from(this.payments.values())
      .filter(p => p.billId === billId)
      .sort((a, b) => b.paidDate - a.paidDate);
  }

  /**
   * Get all payments for a user in a date range
   */
  getUserPayments(
    userId: string,
    startDate: number,
    endDate: number
  ): BillPayment[] {
    return Array.from(this.payments.values())
      .filter(p => p.userId === userId && p.paidDate >= startDate && p.paidDate <= endDate)
      .sort((a, b) => b.paidDate - a.paidDate);
  }

  // ==========================================================================
  // Late Fees & Calculations
  // ==========================================================================

  /**
   * Calculate potential late fee
   */
  calculateLateFee(billId: string): Money {
    const bill = this.getBill(billId);
    const now = Date.now();

    if (bill.status !== 'overdue' || bill.dueDate >= now) {
      return { amount: 0, currency: bill.amount.currency };
    }

    const daysLate = Math.floor((now - bill.dueDate) / (24 * 60 * 60 * 1000));
    const lateFee = calculateLateFee(bill.amount.amount, daysLate, bill.category);

    return { amount: lateFee, currency: bill.amount.currency };
  }

  /**
   * Get total due soon
   */
  getTotalDueSoon(userId: string, daysAhead: number = 7): Money {
    const upcoming = this.getUpcomingBills(userId, daysAhead);
    let total = 0;
    let currency: Money['currency'] = 'USD';

    for (const bill of upcoming) {
      total += bill.amount.amount;
      currency = bill.amount.currency;
    }

    return { amount: total, currency };
  }

  /**
   * Get monthly total
   */
  getMonthlyTotal(userId: string): Money {
    const bills = this.getUserBills(userId).filter(
      b => b.status !== 'paid' && b.status !== 'cancelled'
    );

    let monthlyTotal = 0;
    let currency: Money['currency'] = 'USD';

    for (const bill of bills) {
      monthlyTotal += this.toMonthlyAmount(bill.amount.amount, bill.frequency);
      currency = bill.amount.currency;
    }

    return { amount: Math.round(monthlyTotal), currency };
  }

  // ==========================================================================
  // Auto-Pay Recommendations
  // ==========================================================================

  /**
   * Get bills recommended for auto-pay
   */
  getAutoPayRecommendations(userId: string): Bill[] {
    return this.getUserBills(userId).filter(b => {
      if (b.autoPay || b.frequency === 'one_time') return false;

      // Recommend auto-pay for bills consistently paid on time
      const payments = this.getPaymentHistory(b.id);
      if (payments.length < 2) return true; // New bills

      // Check if usually paid within threshold days
      const onTimeCount = payments.filter(p => {
        const bill = this.bills.get(p.billId);
        if (!bill) return false;
        const expectedDue = p.paidDate - (p.paidDate % BILL_FREQUENCY_DAYS[b.frequency]) * 24 * 60 * 60 * 1000;
        return p.paidDate <= expectedDue + this.config.autoPayRecommendThreshold * 24 * 60 * 60 * 1000;
      }).length;

      return onTimeCount / payments.length < 0.8; // Less than 80% on-time
    });
  }

  /**
   * Enable auto-pay for a bill
   */
  enableAutoPay(billId: string, autoPayDate?: number): void {
    const bill = this.getBill(billId);
    bill.autoPay = true;
    bill.autoPayDate = autoPayDate;
    bill.updatedAt = Date.now();
  }

  /**
   * Disable auto-pay for a bill
   */
  disableAutoPay(billId: string): void {
    const bill = this.getBill(billId);
    bill.autoPay = false;
    bill.autoPayDate = undefined;
    bill.updatedAt = Date.now();
  }

  // ==========================================================================
  // Calendar View
  // ==========================================================================

  /**
   * Get bill calendar for a month
   */
  getBillCalendar(userId: string, year: number, month: number): BillCalendar {
    const startDate = new Date(year, month, 1).getTime();
    const endDate = new Date(year, month + 1, 0, 23, 59, 59).getTime();

    const bills = this.getUserBills(userId)
      .filter(b => b.dueDate >= startDate && b.dueDate <= endDate);

    let totalDue = 0;
    let paidCount = 0;
    let upcomingCount = 0;
    const currency = bills[0]?.amount.currency ?? 'USD';

    const billEntries = bills.map(bill => {
      totalDue += bill.amount.amount;

      if (bill.status === 'paid') {
        paidCount++;
      } else {
        upcomingCount++;
      }

      return {
        bill,
        dueDate: bill.dueDate,
        status: bill.status,
        amount: bill.amount,
      };
    });

    return {
      month,
      year,
      bills: billEntries.sort((a, b) => a.dueDate - b.dueDate),
      totalDue: { amount: totalDue, currency },
      paidCount,
      upcomingCount,
    };
  }

  /**
   * Get annual bill summary
   */
  getAnnualSummary(userId: string, year: number): {
    totalPaid: Money;
    totalDue: Money;
    byMonth: Array<{ month: number; total: Money }>;
    byCategory: Record<ExpenseCategory, Money>;
  } {
    const startDate = new Date(year, 0, 1).getTime();
    const endDate = new Date(year + 1, 0, 1).getTime() - 1;

    const payments = this.getUserPayments(userId, startDate, endDate);
    let totalPaid = 0;
    let currency: Money['currency'] = 'USD';

    const byMonth: Money[] = Array(12).fill(null).map(() => ({ amount: 0, currency: 'USD' as Money['currency'] }));
    const byCategory: Partial<Record<ExpenseCategory, Money>> = {};

    for (const payment of payments) {
      totalPaid += payment.amount.amount;
      currency = payment.amount.currency;

      const month = new Date(payment.paidDate).getMonth();
      byMonth[month].amount += payment.amount.amount;
      byMonth[month].currency = currency;

      const bill = this.bills.get(payment.billId);
      if (bill) {
        const current = byCategory[bill.category]?.amount ?? 0;
        byCategory[bill.category] = { amount: current + payment.amount.amount, currency };
      }
    }

    // Calculate total due for rest of year
    const upcomingBills = this.getUserBills(userId).filter(
      b => b.dueDate <= endDate && b.dueDate >= Date.now() && b.status !== 'paid'
    );

    let totalDue = 0;
    for (const bill of upcomingBills) {
      totalDue += bill.amount.amount;
    }

    return {
      totalPaid: { amount: totalPaid, currency },
      totalDue: { amount: totalDue, currency },
      byMonth: byMonth.map((total, month) => ({ month, total })),
      byCategory: byCategory as Record<ExpenseCategory, Money>,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private calculateBillStatus(dueDate: number): BillStatus {
    const now = Date.now();
    const daysUntilDue = Math.floor((dueDate - now) / (24 * 60 * 60 * 1000));

    if (daysUntilDue < 0) return 'overdue';
    if (daysUntilDue === 0) return 'due_today';
    if (daysUntilDue <= 3) return 'due_soon';
    return 'upcoming';
  }

  private scheduleReminders(bill: Bill): void {
    for (const daysBeforeDue of bill.reminderDays) {
      const reminderTime = bill.dueDate - daysBeforeDue * 24 * 60 * 60 * 1000;
      const now = Date.now();

      if (reminderTime > now) {
        const reminder: BillReminder = {
          id: this.generateId('rem'),
          billId: bill.id,
          userId: bill.userId,
          daysUntilDue: daysBeforeDue,
          scheduledFor: reminderTime,
          sent: false,
          channel: this.config.defaultAlertChannels[0] ?? 'push',
        };

        this.reminders.set(reminder.id, reminder);

        const timer = setTimeout(
          () => this.triggerReminder(reminder.id),
          reminderTime - now
        );

        this.reminderTimers.set(reminder.id, timer);
      }
    }
  }

  private clearReminders(billId: string): void {
    for (const [reminderId, reminder] of this.reminders.entries()) {
      if (reminder.billId === billId) {
        const timer = this.reminderTimers.get(reminderId);
        if (timer) {
          clearTimeout(timer);
          this.reminderTimers.delete(reminderId);
        }
        this.reminders.delete(reminderId);
      }
    }
  }

  private async triggerReminder(reminderId: string): Promise<void> {
    const reminder = this.reminders.get(reminderId);
    if (!reminder || reminder.sent) return;

    const bill = this.bills.get(reminder.billId);
    if (!bill || bill.status === 'paid') return;

    reminder.sent = true;
    reminder.sentAt = Date.now();

    // Determine event type
    let event: string;
    if (reminder.daysUntilDue === 0) {
      event = MONEY_MAKERS_EVENTS.BILL_DUE_TODAY;
    } else if (reminder.daysUntilDue <= 3) {
      event = MONEY_MAKERS_EVENTS.BILL_DUE_SOON;
    } else {
      event = MONEY_MAKERS_EVENTS.BILL_REMINDER_SENT;
    }

    this.emit(event, {
      billId: bill.id,
      billName: bill.name,
      amount: bill.amount,
      dueDate: bill.dueDate,
      daysUntilDue: reminder.daysUntilDue,
    });

    // Send notification
    if (this.config.notificationProvider) {
      const title = this.getReminderTitle(reminder.daysUntilDue);
      const body = `${bill.name}: ${formatMoney(bill.amount.amount, bill.amount.currency)} due ${
        reminder.daysUntilDue === 0
          ? 'today'
          : `in ${reminder.daysUntilDue} day${reminder.daysUntilDue > 1 ? 's' : ''}`
      }`;

      for (const channel of this.config.defaultAlertChannels) {
        await this.config.notificationProvider.send(bill.userId, channel, title, body);
      }
    }
  }

  private getReminderTitle(daysUntilDue: number): string {
    if (daysUntilDue === 0) return 'Bill Due Today!';
    if (daysUntilDue === 1) return 'Bill Due Tomorrow';
    if (daysUntilDue <= 3) return 'Bill Due Soon';
    return 'Upcoming Bill Reminder';
  }

  private toMonthlyAmount(amount: number, frequency: BillFrequency): number {
    switch (frequency) {
      case 'one_time':
        return 0;
      case 'weekly':
        return amount * 4.33;
      case 'biweekly':
        return amount * 2.17;
      case 'monthly':
        return amount;
      case 'quarterly':
        return amount / 3;
      case 'semi_annual':
        return amount / 6;
      case 'annual':
        return amount / 12;
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createBillReminderManager(
  config?: Partial<BillReminderConfig>
): BillReminderManager {
  return new BillReminderManager(config);
}
