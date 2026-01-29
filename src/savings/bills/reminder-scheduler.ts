/**
 * Reminder Scheduler
 *
 * Schedules and manages bill payment reminders.
 */

import type { Bill, BillReminder, BillFrequency } from '../types.js';

/**
 * Scheduled reminder with additional metadata
 */
export interface ScheduledReminder extends BillReminder {
  priority: 'low' | 'medium' | 'high' | 'urgent';
  message: string;
  actionUrl?: string;
}

/**
 * Reminder schedule options
 */
export interface ScheduleOptions {
  reminderDays: number[];
  reminderTime: string; // HH:MM format
  timezone?: string;
  skipWeekends?: boolean;
  excludeDates?: number[]; // Timestamps of dates to skip
}

/**
 * Reminder scheduler class
 */
export class ReminderScheduler {
  private defaultOptions: ScheduleOptions = {
    reminderDays: [7, 3, 1, 0], // 7 days, 3 days, 1 day, and day of
    reminderTime: '09:00',
    skipWeekends: false,
  };

  constructor(options?: Partial<ScheduleOptions>) {
    if (options) {
      this.defaultOptions = { ...this.defaultOptions, ...options };
    }
  }

  /**
   * Generate reminder schedule for a bill
   */
  generateSchedule(bill: Bill, options?: Partial<ScheduleOptions>): ScheduledReminder[] {
    const opts = { ...this.defaultOptions, ...options };
    const reminders: ScheduledReminder[] = [];
    const [hour, minute] = opts.reminderTime.split(':').map(Number);

    for (const daysBeforeDue of opts.reminderDays) {
      const scheduledFor = new Date(bill.nextDueDate);
      scheduledFor.setDate(scheduledFor.getDate() - daysBeforeDue);
      scheduledFor.setHours(hour, minute, 0, 0);

      // Skip if date is in the past
      if (scheduledFor.getTime() < Date.now()) {
        continue;
      }

      // Skip weekends if configured
      if (opts.skipWeekends) {
        const day = scheduledFor.getDay();
        if (day === 0) scheduledFor.setDate(scheduledFor.getDate() - 2); // Sunday -> Friday
        if (day === 6) scheduledFor.setDate(scheduledFor.getDate() - 1); // Saturday -> Friday
      }

      // Skip excluded dates
      if (opts.excludeDates?.includes(scheduledFor.getTime())) {
        continue;
      }

      const priority = this.calculatePriority(daysBeforeDue, bill.amount);
      const message = this.generateMessage(bill, daysBeforeDue);

      reminders.push({
        id: crypto.randomUUID(),
        billId: bill.id,
        userId: bill.userId,
        billName: bill.name,
        amount: bill.amount,
        dueDate: bill.nextDueDate,
        daysUntilDue: daysBeforeDue,
        scheduledFor: scheduledFor.getTime(),
        sent: false,
        channels: ['email', 'push'],
        priority,
        message,
        actionUrl: bill.payeeUrl,
      });
    }

    // Sort by scheduled time
    reminders.sort((a, b) => a.scheduledFor - b.scheduledFor);

    return reminders;
  }

  /**
   * Get next reminder for a bill
   */
  getNextReminder(bill: Bill, existingReminders: BillReminder[]): ScheduledReminder | null {
    const unsentReminders = existingReminders
      .filter(r => !r.sent && r.scheduledFor > Date.now())
      .sort((a, b) => a.scheduledFor - b.scheduledFor);

    if (unsentReminders.length > 0) {
      const reminder = unsentReminders[0];
      return {
        ...reminder,
        priority: this.calculatePriority(reminder.daysUntilDue, bill.amount),
        message: this.generateMessage(bill, reminder.daysUntilDue),
        actionUrl: bill.payeeUrl,
      };
    }

    return null;
  }

  /**
   * Calculate reminder priority
   */
  private calculatePriority(daysUntilDue: number, amount: number): 'low' | 'medium' | 'high' | 'urgent' {
    // Urgency based on time
    if (daysUntilDue <= 0) {
      return 'urgent';
    }
    if (daysUntilDue <= 1) {
      return 'high';
    }
    if (daysUntilDue <= 3) {
      return 'medium';
    }

    // Boost priority for large bills
    if (amount >= 500 && daysUntilDue <= 7) {
      return 'high';
    }
    if (amount >= 200 && daysUntilDue <= 5) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Generate reminder message
   */
  private generateMessage(bill: Bill, daysUntilDue: number): string {
    const amount = `$${bill.amount.toFixed(2)}`;
    const autopayNote = bill.autopay ? ' (autopay enabled)' : '';

    if (daysUntilDue < 0) {
      return `Your ${bill.name} bill (${amount}) is OVERDUE by ${Math.abs(daysUntilDue)} days!`;
    }
    if (daysUntilDue === 0) {
      return `Your ${bill.name} bill (${amount}) is due TODAY!${autopayNote}`;
    }
    if (daysUntilDue === 1) {
      return `Your ${bill.name} bill (${amount}) is due tomorrow${autopayNote}`;
    }
    return `Your ${bill.name} bill (${amount}) is due in ${daysUntilDue} days${autopayNote}`;
  }

  /**
   * Get all upcoming reminders for multiple bills
   */
  getUpcomingReminders(
    bills: Bill[],
    existingReminders: BillReminder[],
    days: number = 7
  ): ScheduledReminder[] {
    const cutoff = Date.now() + (days * 24 * 60 * 60 * 1000);
    const allReminders: ScheduledReminder[] = [];

    for (const bill of bills) {
      const billReminders = existingReminders
        .filter(r => r.billId === bill.id && !r.sent && r.scheduledFor <= cutoff);

      for (const reminder of billReminders) {
        allReminders.push({
          ...reminder,
          priority: this.calculatePriority(reminder.daysUntilDue, bill.amount),
          message: this.generateMessage(bill, reminder.daysUntilDue),
          actionUrl: bill.payeeUrl,
        });
      }
    }

    // Sort by scheduled time, then priority
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    allReminders.sort((a, b) => {
      const timeDiff = a.scheduledFor - b.scheduledFor;
      if (timeDiff !== 0) return timeDiff;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return allReminders;
  }

  /**
   * Calculate optimal reminder times based on payment history
   */
  suggestReminderDays(bill: Bill): number[] {
    // Analyze payment history to find patterns
    const payments = bill.paymentHistory;

    if (payments.length < 3) {
      // Not enough history, use defaults
      return this.defaultOptions.reminderDays;
    }

    // Calculate average days before due date that payments were made
    const daysBeforePayments: number[] = [];
    const msPerDay = 24 * 60 * 60 * 1000;

    for (const payment of payments) {
      // Approximate the due date for this payment
      const estimatedDue = this.estimateDueDateForPayment(bill, payment.paidAt);
      const daysBeforeDue = Math.round((estimatedDue - payment.paidAt) / msPerDay);

      if (daysBeforeDue >= 0 && daysBeforeDue <= 30) {
        daysBeforePayments.push(daysBeforeDue);
      }
    }

    if (daysBeforePayments.length === 0) {
      return this.defaultOptions.reminderDays;
    }

    // Find the average payment timing
    const avgDaysBefore = Math.round(
      daysBeforePayments.reduce((a, b) => a + b, 0) / daysBeforePayments.length
    );

    // Create reminders: one week before typical, at typical time, and last minute
    const suggested = [
      Math.min(14, avgDaysBefore + 7),
      Math.max(1, avgDaysBefore),
      1,
      0,
    ].filter((v, i, a) => a.indexOf(v) === i) // Remove duplicates
      .sort((a, b) => b - a); // Sort descending

    return suggested;
  }

  /**
   * Estimate what the due date was for a historical payment
   */
  private estimateDueDateForPayment(bill: Bill, paymentDate: number): number {
    // Work backwards from current due date
    let dueDate = bill.nextDueDate;
    const msPerDay = 24 * 60 * 60 * 1000;

    while (dueDate > paymentDate) {
      switch (bill.frequency) {
        case 'weekly':
          dueDate -= 7 * msPerDay;
          break;
        case 'biweekly':
          dueDate -= 14 * msPerDay;
          break;
        case 'monthly':
          dueDate -= 30 * msPerDay;
          break;
        case 'quarterly':
          dueDate -= 90 * msPerDay;
          break;
        case 'semi-annually':
          dueDate -= 180 * msPerDay;
          break;
        case 'annually':
          dueDate -= 365 * msPerDay;
          break;
      }
    }

    return dueDate;
  }

  /**
   * Group reminders by day
   */
  groupByDay(reminders: ScheduledReminder[]): Map<string, ScheduledReminder[]> {
    const grouped = new Map<string, ScheduledReminder[]>();

    for (const reminder of reminders) {
      const date = new Date(reminder.scheduledFor);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(reminder);
    }

    return grouped;
  }

  /**
   * Create a consolidated daily digest of reminders
   */
  createDailyDigest(reminders: ScheduledReminder[]): {
    urgent: ScheduledReminder[];
    dueToday: ScheduledReminder[];
    dueSoon: ScheduledReminder[];
    upcoming: ScheduledReminder[];
    totalAmount: number;
  } {
    const urgent: ScheduledReminder[] = [];
    const dueToday: ScheduledReminder[] = [];
    const dueSoon: ScheduledReminder[] = [];
    const upcoming: ScheduledReminder[] = [];
    let totalAmount = 0;

    for (const reminder of reminders) {
      totalAmount += reminder.amount;

      if (reminder.daysUntilDue < 0) {
        urgent.push(reminder);
      } else if (reminder.daysUntilDue === 0) {
        dueToday.push(reminder);
      } else if (reminder.daysUntilDue <= 3) {
        dueSoon.push(reminder);
      } else {
        upcoming.push(reminder);
      }
    }

    return {
      urgent,
      dueToday,
      dueSoon,
      upcoming,
      totalAmount,
    };
  }

  /**
   * Check if a reminder should be snoozed
   */
  shouldSnooze(reminder: ScheduledReminder, bill: Bill): boolean {
    // Don't snooze if already paid this cycle
    if (bill.lastPaidDate && bill.lastPaidDate > (bill.nextDueDate - 30 * 24 * 60 * 60 * 1000)) {
      return true;
    }

    // Don't snooze if autopay is enabled and it's not urgent
    if (bill.autopay && reminder.priority !== 'urgent') {
      return true;
    }

    return false;
  }
}
