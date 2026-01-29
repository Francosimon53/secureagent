/**
 * Expense Tracking Service
 *
 * Manages expenses, splits, and settlements between friends.
 */

import type {
  Expense,
  ExpenseSplit,
  SplitGroup,
  GroupMember,
  Settlement,
  GroupBalance,
  ExpenseCategory,
  SplitType,
  ExpenseServiceConfig,
} from '../types.js';
import type { ExpenseStore } from '../stores/index.js';
import type { SavingsConfig } from '../config.js';

export { SplitCalculator, type SplitResult } from './split-calculator.js';
export { SettlementTracker, type SettlementSummary } from './settlement-tracker.js';

/**
 * Expense tracking configuration
 */
export interface ExpenseTrackingConfig {
  defaultCurrency: string;
  splitRequestProvider: 'email' | 'venmo' | 'paypal' | 'manual';
  autoReminderDays: number[];
  maxSplitMembers: number;
  roundingPrecision: number;
}

/**
 * Expense tracking service
 */
export class ExpenseTrackingService {
  private readonly config: ExpenseTrackingConfig;

  constructor(
    private readonly expenseStore: ExpenseStore,
    config?: Partial<ExpenseServiceConfig>
  ) {
    this.config = {
      defaultCurrency: config?.defaultCurrency ?? 'USD',
      splitRequestProvider: config?.splitRequestProvider ?? 'email',
      autoReminderDays: config?.autoReminderDays ?? [3, 7, 14],
      maxSplitMembers: 20,
      roundingPrecision: 2,
    };
  }

  // ==========================================================================
  // Expense Operations
  // ==========================================================================

  /**
   * Create a new expense
   */
  async createExpense(
    userId: string,
    amount: number,
    category: ExpenseCategory,
    description: string,
    options?: {
      currency?: string;
      subcategory?: string;
      merchant?: string;
      expenseDate?: number;
      paymentMethod?: string;
      receiptUrl?: string;
      tags?: string[];
      isRecurring?: boolean;
      recurringId?: string;
    }
  ): Promise<Expense> {
    return this.expenseStore.createExpense({
      userId,
      amount,
      currency: options?.currency ?? this.config.defaultCurrency,
      category,
      subcategory: options?.subcategory,
      description,
      merchant: options?.merchant,
      expenseDate: options?.expenseDate ?? Date.now(),
      paymentMethod: options?.paymentMethod,
      receiptUrl: options?.receiptUrl,
      tags: options?.tags ?? [],
      isRecurring: options?.isRecurring ?? false,
      recurringId: options?.recurringId,
    });
  }

  /**
   * Get an expense by ID
   */
  async getExpense(expenseId: string): Promise<Expense | null> {
    return this.expenseStore.getExpense(expenseId);
  }

  /**
   * Update an expense
   */
  async updateExpense(expenseId: string, updates: Partial<Expense>): Promise<Expense | null> {
    return this.expenseStore.updateExpense(expenseId, updates);
  }

  /**
   * Delete an expense
   */
  async deleteExpense(expenseId: string): Promise<boolean> {
    return this.expenseStore.deleteExpense(expenseId);
  }

  /**
   * List expenses for a user
   */
  async listExpenses(
    userId: string,
    options?: {
      category?: ExpenseCategory[];
      dateFrom?: number;
      dateTo?: number;
      minAmount?: number;
      maxAmount?: number;
      limit?: number;
      offset?: number;
    }
  ): Promise<Expense[]> {
    return this.expenseStore.listExpenses(userId, options);
  }

  /**
   * Get expense statistics for a period
   */
  async getExpenseStats(
    userId: string,
    dateFrom: number,
    dateTo: number
  ): Promise<{
    total: number;
    count: number;
    byCategory: Map<ExpenseCategory, number>;
    averagePerDay: number;
    largestExpense: Expense | null;
  }> {
    const expenses = await this.expenseStore.listExpenses(userId, { dateFrom, dateTo });

    const byCategory = new Map<ExpenseCategory, number>();
    let total = 0;
    let largestExpense: Expense | null = null;

    for (const expense of expenses) {
      total += expense.amount;
      const categoryTotal = byCategory.get(expense.category) ?? 0;
      byCategory.set(expense.category, categoryTotal + expense.amount);

      if (!largestExpense || expense.amount > largestExpense.amount) {
        largestExpense = expense;
      }
    }

    const days = Math.max(1, (dateTo - dateFrom) / (24 * 60 * 60 * 1000));

    return {
      total,
      count: expenses.length,
      byCategory,
      averagePerDay: total / days,
      largestExpense,
    };
  }

  // ==========================================================================
  // Split Operations
  // ==========================================================================

  /**
   * Add splits to an expense
   */
  async addSplits(
    expenseId: string,
    members: Array<{ name: string; email?: string; phone?: string }>,
    splitType: SplitType = 'equal',
    customAmounts?: Map<string, number>
  ): Promise<ExpenseSplit[]> {
    const expense = await this.expenseStore.getExpense(expenseId);
    if (!expense) {
      throw new Error('Expense not found');
    }

    if (members.length > this.config.maxSplitMembers) {
      throw new Error(`Maximum ${this.config.maxSplitMembers} split members allowed`);
    }

    const splits: ExpenseSplit[] = [];
    const totalMembers = members.length + 1; // Include the expense owner

    for (const member of members) {
      let amount: number;

      switch (splitType) {
        case 'equal':
          amount = expense.amount / totalMembers;
          break;
        case 'exact':
          amount = customAmounts?.get(member.name) ?? 0;
          break;
        case 'percentage':
          const percentage = customAmounts?.get(member.name) ?? (100 / totalMembers);
          amount = (expense.amount * percentage) / 100;
          break;
        case 'shares':
          const totalShares = Array.from(customAmounts?.values() ?? []).reduce((a, b) => a + b, 0) + 1;
          const memberShares = customAmounts?.get(member.name) ?? 1;
          amount = (expense.amount * memberShares) / totalShares;
          break;
        default:
          amount = expense.amount / totalMembers;
      }

      // Round to precision
      amount = this.roundAmount(amount);

      splits.push({
        id: crypto.randomUUID(),
        odId: crypto.randomUUID(),
        odName: member.name,
        odEmail: member.email,
        odPhone: member.phone,
        amount,
        status: 'pending',
        reminderCount: 0,
      });
    }

    await this.expenseStore.updateExpense(expenseId, { splits });
    return splits;
  }

  /**
   * Request payment for a split
   */
  async requestSplitPayment(expenseId: string, splitId: string): Promise<boolean> {
    const expense = await this.expenseStore.getExpense(expenseId);
    if (!expense?.splits) {
      return false;
    }

    const split = expense.splits.find(s => s.id === splitId);
    if (!split) {
      return false;
    }

    return this.expenseStore.updateSplit(expenseId, splitId, {
      status: 'requested',
      requestedAt: Date.now(),
    });
  }

  /**
   * Mark a split as paid
   */
  async markSplitPaid(
    expenseId: string,
    splitId: string,
    options?: { paymentMethod?: string; paymentReference?: string }
  ): Promise<boolean> {
    return this.expenseStore.updateSplit(expenseId, splitId, {
      status: 'paid',
      paidAt: Date.now(),
      paymentMethod: options?.paymentMethod,
      paymentReference: options?.paymentReference,
    });
  }

  /**
   * Forgive a split (mark as not owed)
   */
  async forgiveSplit(expenseId: string, splitId: string): Promise<boolean> {
    return this.expenseStore.updateSplit(expenseId, splitId, {
      status: 'forgiven',
    });
  }

  /**
   * Get all pending splits for a user
   */
  async getPendingSplits(userId: string): Promise<Array<{ expense: Expense; split: ExpenseSplit }>> {
    return this.expenseStore.getPendingSplits(userId);
  }

  /**
   * Send a reminder for a split
   */
  async sendSplitReminder(expenseId: string, splitId: string): Promise<boolean> {
    const expense = await this.expenseStore.getExpense(expenseId);
    if (!expense?.splits) {
      return false;
    }

    const split = expense.splits.find(s => s.id === splitId);
    if (!split || split.status === 'paid' || split.status === 'forgiven') {
      return false;
    }

    return this.expenseStore.updateSplit(expenseId, splitId, {
      status: 'reminded',
      reminderCount: split.reminderCount + 1,
      lastReminderAt: Date.now(),
    });
  }

  // ==========================================================================
  // Group Operations
  // ==========================================================================

  /**
   * Create a split group
   */
  async createGroup(
    userId: string,
    name: string,
    members: Array<{ name: string; email?: string; phone?: string; defaultShare?: number }>,
    options?: {
      description?: string;
      defaultSplitType?: SplitType;
    }
  ): Promise<SplitGroup> {
    const groupMembers: GroupMember[] = members.map(m => ({
      id: crypto.randomUUID(),
      name: m.name,
      email: m.email,
      phone: m.phone,
      defaultShare: m.defaultShare,
      isActive: true,
      joinedAt: Date.now(),
    }));

    return this.expenseStore.createGroup({
      userId,
      name,
      description: options?.description,
      members: groupMembers,
      expenses: [],
      defaultSplitType: options?.defaultSplitType ?? 'equal',
      isActive: true,
    });
  }

  /**
   * Get a group by ID
   */
  async getGroup(groupId: string): Promise<SplitGroup | null> {
    return this.expenseStore.getGroup(groupId);
  }

  /**
   * Update a group
   */
  async updateGroup(groupId: string, updates: Partial<SplitGroup>): Promise<SplitGroup | null> {
    return this.expenseStore.updateGroup(groupId, updates);
  }

  /**
   * Delete a group
   */
  async deleteGroup(groupId: string): Promise<boolean> {
    return this.expenseStore.deleteGroup(groupId);
  }

  /**
   * List groups for a user
   */
  async listGroups(userId: string): Promise<SplitGroup[]> {
    return this.expenseStore.listGroups(userId);
  }

  /**
   * Add a member to a group
   */
  async addGroupMember(
    groupId: string,
    member: { name: string; email?: string; phone?: string; defaultShare?: number }
  ): Promise<GroupMember | null> {
    return this.expenseStore.addGroupMember(groupId, {
      name: member.name,
      email: member.email,
      phone: member.phone,
      defaultShare: member.defaultShare,
      isActive: true,
    });
  }

  /**
   * Remove a member from a group
   */
  async removeGroupMember(groupId: string, memberId: string): Promise<boolean> {
    return this.expenseStore.removeGroupMember(groupId, memberId);
  }

  /**
   * Add an expense to a group
   */
  async addExpenseToGroup(groupId: string, expenseId: string): Promise<boolean> {
    const group = await this.expenseStore.getGroup(groupId);
    if (!group) {
      return false;
    }

    if (!group.expenses.includes(expenseId)) {
      group.expenses.push(expenseId);
      await this.expenseStore.updateGroup(groupId, { expenses: group.expenses });
    }

    return true;
  }

  /**
   * Get balances for all members in a group
   */
  async getGroupBalances(groupId: string): Promise<GroupBalance[]> {
    return this.expenseStore.calculateGroupBalances(groupId);
  }

  /**
   * Calculate optimal settlements for a group
   */
  async calculateOptimalSettlements(groupId: string): Promise<Settlement[]> {
    return this.expenseStore.calculateOptimalSettlements(groupId);
  }

  // ==========================================================================
  // Settlement Operations
  // ==========================================================================

  /**
   * Create a settlement
   */
  async createSettlement(
    groupId: string | undefined,
    fromUserId: string,
    fromName: string,
    toUserId: string,
    toName: string,
    amount: number,
    currency?: string
  ): Promise<Settlement> {
    return this.expenseStore.createSettlement({
      groupId,
      fromUserId,
      fromName,
      toUserId,
      toName,
      amount: this.roundAmount(amount),
      currency: currency ?? this.config.defaultCurrency,
      status: 'pending',
    });
  }

  /**
   * Mark a settlement as completed
   */
  async completeSettlement(
    settlementId: string,
    options?: { method?: string; reference?: string }
  ): Promise<Settlement | null> {
    return this.expenseStore.updateSettlement(settlementId, {
      status: 'completed',
      method: options?.method,
      reference: options?.reference,
    });
  }

  /**
   * Cancel a settlement
   */
  async cancelSettlement(settlementId: string): Promise<Settlement | null> {
    return this.expenseStore.updateSettlement(settlementId, { status: 'cancelled' });
  }

  /**
   * Get pending settlements for a user
   */
  async getPendingSettlements(userId: string): Promise<Settlement[]> {
    return this.expenseStore.getPendingSettlements(userId);
  }

  /**
   * Get settlements for a group
   */
  async getGroupSettlements(groupId: string): Promise<Settlement[]> {
    return this.expenseStore.listSettlements(groupId);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Round amount to configured precision
   */
  private roundAmount(amount: number): number {
    const factor = Math.pow(10, this.config.roundingPrecision);
    return Math.round(amount * factor) / factor;
  }

  /**
   * Calculate how much each person owes for equal split
   */
  calculateEqualSplit(totalAmount: number, numberOfPeople: number): number {
    return this.roundAmount(totalAmount / numberOfPeople);
  }

  /**
   * Calculate percentage-based split
   */
  calculatePercentageSplit(
    totalAmount: number,
    percentages: Map<string, number>
  ): Map<string, number> {
    const result = new Map<string, number>();

    for (const [person, percentage] of percentages) {
      result.set(person, this.roundAmount((totalAmount * percentage) / 100));
    }

    return result;
  }

  /**
   * Get who owes whom summary
   */
  async getWhoOwesWhom(userId: string): Promise<{
    youOwe: Array<{ name: string; amount: number }>;
    owedToYou: Array<{ name: string; amount: number }>;
    netBalance: number;
  }> {
    const pendingSplits = await this.getPendingSplits(userId);
    const youOwe: Map<string, number> = new Map();
    const owedToYou: Map<string, number> = new Map();

    for (const { expense, split } of pendingSplits) {
      if (expense.userId === userId) {
        // This is your expense, others owe you
        const current = owedToYou.get(split.odName) ?? 0;
        owedToYou.set(split.odName, current + split.amount);
      } else {
        // You owe on this expense
        const current = youOwe.get(expense.userId) ?? 0;
        youOwe.set(expense.userId, current + split.amount);
      }
    }

    const youOweArray = Array.from(youOwe.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    const owedToYouArray = Array.from(owedToYou.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    const totalOwed = owedToYouArray.reduce((sum, item) => sum + item.amount, 0);
    const totalOwing = youOweArray.reduce((sum, item) => sum + item.amount, 0);

    return {
      youOwe: youOweArray,
      owedToYou: owedToYouArray,
      netBalance: totalOwed - totalOwing,
    };
  }
}

/**
 * Factory function to create expense tracking service
 */
export function createExpenseTrackingService(
  expenseStore: ExpenseStore,
  config?: Partial<SavingsConfig>
): ExpenseTrackingService {
  return new ExpenseTrackingService(expenseStore, config?.expenses);
}
