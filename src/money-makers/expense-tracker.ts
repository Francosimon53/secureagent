/**
 * Expense Tracker
 *
 * Smart expense management with natural language input, categorization, and budgets
 */

import type {
  Expense,
  ExpenseCategory,
  ExpenseSplit,
  RecurringExpense,
  Budget,
  ExpenseSummary,
  Money,
  DateRange,
  OCRProvider,
} from './types.js';
import {
  MONEY_MAKERS_EVENTS,
  EXPENSE_CATEGORY_KEYWORDS,
  EXPENSE_CATEGORY_ICONS,
  categorizeExpense,
  formatMoney,
  redactPII,
} from './constants.js';

// =============================================================================
// Expense Tracker Config
// =============================================================================

export interface ExpenseTrackerConfig {
  /** OCR provider for receipt scanning */
  ocrProvider?: OCRProvider;
  /** Default currency */
  defaultCurrency: Money['currency'];
  /** Auto-detect recurring expenses */
  autoDetectRecurring: boolean;
  /** Recurring detection threshold (number of similar expenses) */
  recurringThreshold: number;
  /** Budget warning threshold (percentage of budget used) */
  budgetWarningThreshold: number;
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: ExpenseTrackerConfig = {
  defaultCurrency: 'USD',
  autoDetectRecurring: true,
  recurringThreshold: 3,
  budgetWarningThreshold: 80,
};

// =============================================================================
// Expense Tracker
// =============================================================================

export class ExpenseTracker {
  private readonly config: ExpenseTrackerConfig;
  private expenses = new Map<string, Expense>();
  private recurringExpenses = new Map<string, RecurringExpense>();
  private budgets = new Map<string, Budget>();

  constructor(config?: Partial<ExpenseTrackerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Expense Logging
  // ==========================================================================

  /**
   * Log an expense from natural language
   */
  log(userId: string, text: string): Expense {
    const parsed = this.parseExpenseText(text);
    return this.createExpense({
      userId,
      ...parsed,
    });
  }

  /**
   * Create an expense
   */
  createExpense(params: {
    userId: string;
    amount: Money;
    description: string;
    category?: ExpenseCategory;
    merchant?: string;
    date?: number;
    paymentMethod?: string;
    tags?: string[];
    notes?: string;
  }): Expense {
    const id = this.generateId('exp');
    const now = Date.now();

    // Auto-categorize if not provided
    const category = params.category ?? categorizeExpense(params.description);

    const expense: Expense = {
      id,
      userId: params.userId,
      amount: params.amount,
      category,
      description: params.description,
      merchant: params.merchant,
      date: params.date ?? now,
      paymentMethod: params.paymentMethod,
      tags: params.tags ?? [],
      isRecurring: false,
      createdAt: now,
      updatedAt: now,
    };

    if (params.notes) {
      expense.notes = params.notes;
    }

    this.expenses.set(id, expense);

    this.emit(MONEY_MAKERS_EVENTS.EXPENSE_LOGGED, {
      expenseId: id,
      amount: expense.amount,
      category: expense.category,
    });

    // Check budget
    this.checkBudgetImpact(expense);

    // Check for recurring patterns
    if (this.config.autoDetectRecurring) {
      this.detectRecurringPattern(expense);
    }

    return expense;
  }

  /**
   * Log expense from receipt image
   */
  async logFromReceipt(userId: string, imagePath: string): Promise<Expense | null> {
    if (!this.config.ocrProvider) {
      throw new Error('OCR provider not configured');
    }

    const extracted = await this.config.ocrProvider.extractReceipt(imagePath);

    if (!extracted.total) {
      return null;
    }

    const expense = this.createExpense({
      userId,
      amount: extracted.total,
      description: extracted.merchant ?? 'Receipt expense',
      merchant: extracted.merchant,
      date: extracted.date,
    });

    // Store receipt reference
    expense.receiptId = imagePath;
    expense.updatedAt = Date.now();

    return expense;
  }

  /**
   * Get expense by ID
   */
  getExpense(expenseId: string): Expense {
    const expense = this.expenses.get(expenseId);
    if (!expense) {
      throw new Error(`Expense not found: ${expenseId}`);
    }
    return expense;
  }

  /**
   * Update an expense
   */
  updateExpense(
    expenseId: string,
    updates: Partial<Pick<
      Expense,
      'amount' | 'category' | 'description' | 'merchant' | 'date' |
      'paymentMethod' | 'tags' | 'notes'
    >>
  ): Expense {
    const expense = this.getExpense(expenseId);

    Object.assign(expense, updates);
    expense.updatedAt = Date.now();

    return expense;
  }

  /**
   * Delete an expense
   */
  deleteExpense(expenseId: string): void {
    this.expenses.delete(expenseId);
  }

  /**
   * Get expenses for a user
   */
  getUserExpenses(
    userId: string,
    options?: {
      category?: ExpenseCategory;
      dateRange?: DateRange;
      merchant?: string;
      minAmount?: number;
      maxAmount?: number;
      tags?: string[];
    }
  ): Expense[] {
    let expenses = Array.from(this.expenses.values()).filter(e => e.userId === userId);

    if (options?.category) {
      expenses = expenses.filter(e => e.category === options.category);
    }

    if (options?.dateRange) {
      expenses = expenses.filter(
        e => e.date >= options.dateRange!.start && e.date <= options.dateRange!.end
      );
    }

    if (options?.merchant) {
      const merchantLower = options.merchant.toLowerCase();
      expenses = expenses.filter(e => e.merchant?.toLowerCase().includes(merchantLower));
    }

    if (options?.minAmount !== undefined) {
      expenses = expenses.filter(e => e.amount.amount >= options.minAmount!);
    }

    if (options?.maxAmount !== undefined) {
      expenses = expenses.filter(e => e.amount.amount <= options.maxAmount!);
    }

    if (options?.tags?.length) {
      expenses = expenses.filter(e => options.tags!.some(t => e.tags.includes(t)));
    }

    return expenses.sort((a, b) => b.date - a.date);
  }

  // ==========================================================================
  // Split Expenses
  // ==========================================================================

  /**
   * Split an expense with others
   */
  splitExpense(
    expenseId: string,
    splits: Array<{ userId: string; name: string; amount: Money }>
  ): void {
    const expense = this.getExpense(expenseId);

    expense.splitWith = splits.map(s => ({
      ...s,
      settled: false,
    }));

    expense.updatedAt = Date.now();
  }

  /**
   * Mark a split as settled
   */
  settleSplit(expenseId: string, userId: string): void {
    const expense = this.getExpense(expenseId);

    const split = expense.splitWith?.find(s => s.userId === userId);
    if (split) {
      split.settled = true;
      split.settledAt = Date.now();
    }

    expense.updatedAt = Date.now();
  }

  /**
   * Get unsettled splits for a user
   */
  getUnsettledSplits(userId: string): Array<{ expense: Expense; owedBy: ExpenseSplit[] }> {
    const results: Array<{ expense: Expense; owedBy: ExpenseSplit[] }> = [];

    for (const expense of this.expenses.values()) {
      if (expense.userId === userId && expense.splitWith) {
        const unsettled = expense.splitWith.filter(s => !s.settled);
        if (unsettled.length > 0) {
          results.push({ expense, owedBy: unsettled });
        }
      }
    }

    return results;
  }

  /**
   * Get what a user owes to others
   */
  getOwedToOthers(userId: string): Array<{ expense: Expense; owedTo: string; amount: Money }> {
    const results: Array<{ expense: Expense; owedTo: string; amount: Money }> = [];

    for (const expense of this.expenses.values()) {
      if (expense.userId !== userId && expense.splitWith) {
        const myShare = expense.splitWith.find(s => s.userId === userId);
        if (myShare && !myShare.settled) {
          results.push({
            expense,
            owedTo: expense.userId,
            amount: myShare.amount,
          });
        }
      }
    }

    return results;
  }

  // ==========================================================================
  // Budget Management
  // ==========================================================================

  /**
   * Create a budget
   */
  createBudget(params: {
    userId: string;
    name: string;
    period: Budget['period'];
    totalLimit: Money;
    categoryLimits?: Array<{ category: ExpenseCategory; limit: Money }>;
    startDate?: number;
  }): Budget {
    const id = this.generateId('budget');
    const now = Date.now();

    const startDate = params.startDate ?? this.getPeriodStart(now, params.period);
    const endDate = this.getPeriodEnd(startDate, params.period);

    const categories = (params.categoryLimits ?? []).map(cl => ({
      category: cl.category,
      limit: cl.limit,
      spent: { amount: 0, currency: cl.limit.currency },
    }));

    const budget: Budget = {
      id,
      userId: params.userId,
      name: params.name,
      period: params.period,
      categories,
      totalLimit: params.totalLimit,
      totalSpent: { amount: 0, currency: params.totalLimit.currency },
      startDate,
      endDate,
      createdAt: now,
    };

    this.budgets.set(id, budget);

    // Calculate current spending
    this.recalculateBudgetSpending(budget);

    return budget;
  }

  /**
   * Get budget by ID
   */
  getBudget(budgetId: string): Budget {
    const budget = this.budgets.get(budgetId);
    if (!budget) {
      throw new Error(`Budget not found: ${budgetId}`);
    }
    return budget;
  }

  /**
   * Get active budgets for a user
   */
  getActiveBudgets(userId: string): Budget[] {
    const now = Date.now();
    return Array.from(this.budgets.values()).filter(
      b => b.userId === userId && b.startDate <= now && b.endDate >= now
    );
  }

  /**
   * Get budget status
   */
  getBudgetStatus(budgetId: string): {
    budget: Budget;
    percentUsed: number;
    remaining: Money;
    daysRemaining: number;
    dailyBudget: Money;
    isOverBudget: boolean;
    byCategory: Array<{
      category: ExpenseCategory;
      percentUsed: number;
      remaining: Money;
    }>;
  } {
    const budget = this.getBudget(budgetId);
    this.recalculateBudgetSpending(budget);

    const percentUsed = Math.round((budget.totalSpent.amount / budget.totalLimit.amount) * 100);
    const remaining: Money = {
      amount: Math.max(0, budget.totalLimit.amount - budget.totalSpent.amount),
      currency: budget.totalLimit.currency,
    };

    const daysRemaining = Math.max(0, Math.ceil((budget.endDate - Date.now()) / (24 * 60 * 60 * 1000)));
    const dailyBudget: Money = {
      amount: daysRemaining > 0 ? Math.round(remaining.amount / daysRemaining) : 0,
      currency: budget.totalLimit.currency,
    };

    const byCategory = budget.categories.map(cat => ({
      category: cat.category,
      percentUsed: Math.round((cat.spent.amount / cat.limit.amount) * 100),
      remaining: {
        amount: Math.max(0, cat.limit.amount - cat.spent.amount),
        currency: cat.limit.currency,
      },
    }));

    return {
      budget,
      percentUsed,
      remaining,
      daysRemaining,
      dailyBudget,
      isOverBudget: budget.totalSpent.amount > budget.totalLimit.amount,
      byCategory,
    };
  }

  // ==========================================================================
  // Recurring Expenses
  // ==========================================================================

  /**
   * Mark an expense as recurring
   */
  markAsRecurring(
    expenseId: string,
    frequency: RecurringExpense['frequency']
  ): RecurringExpense {
    const expense = this.getExpense(expenseId);

    const recurring: RecurringExpense = {
      id: this.generateId('rec'),
      userId: expense.userId,
      description: expense.description,
      amount: expense.amount,
      category: expense.category,
      merchant: expense.merchant,
      frequency,
      nextOccurrence: this.calculateNextOccurrence(expense.date, frequency),
      isActive: true,
      createdAt: Date.now(),
    };

    expense.isRecurring = true;
    expense.recurringId = recurring.id;

    this.recurringExpenses.set(recurring.id, recurring);

    return recurring;
  }

  /**
   * Get recurring expenses for a user
   */
  getRecurringExpenses(userId: string): RecurringExpense[] {
    return Array.from(this.recurringExpenses.values()).filter(
      r => r.userId === userId && r.isActive
    );
  }

  /**
   * Get total monthly recurring
   */
  getMonthlyRecurringTotal(userId: string): Money {
    const recurring = this.getRecurringExpenses(userId);
    let total = 0;
    let currency: Money['currency'] = this.config.defaultCurrency;

    for (const r of recurring) {
      const monthly = this.toMonthlyAmount(r.amount.amount, r.frequency);
      total += monthly;
      currency = r.amount.currency;
    }

    return { amount: Math.round(total), currency };
  }

  // ==========================================================================
  // Summary & Reporting
  // ==========================================================================

  /**
   * Get expense summary
   */
  getSummary(
    userId: string,
    dateRange: DateRange
  ): ExpenseSummary {
    const expenses = this.getUserExpenses(userId, { dateRange });

    // Calculate totals
    let totalSpent = 0;
    let currency: Money['currency'] = this.config.defaultCurrency;
    const byCategory: Partial<Record<ExpenseCategory, Money>> = {};
    const merchantTotals = new Map<string, number>();

    for (const expense of expenses) {
      totalSpent += expense.amount.amount;
      currency = expense.amount.currency;

      // By category
      const current = byCategory[expense.category]?.amount ?? 0;
      byCategory[expense.category] = {
        amount: current + expense.amount.amount,
        currency,
      };

      // By merchant
      if (expense.merchant) {
        const currentMerchant = merchantTotals.get(expense.merchant) ?? 0;
        merchantTotals.set(expense.merchant, currentMerchant + expense.amount.amount);
      }
    }

    // Top merchants
    const topMerchants = Array.from(merchantTotals.entries())
      .map(([merchant, total]) => ({ merchant, total: { amount: total, currency } }))
      .sort((a, b) => b.total.amount - a.total.amount)
      .slice(0, 10);

    // Average per day
    const days = Math.max(1, Math.ceil((dateRange.end - dateRange.start) / (24 * 60 * 60 * 1000)));
    const averagePerDay: Money = {
      amount: Math.round(totalSpent / days),
      currency,
    };

    // Compare to previous period
    const periodLength = dateRange.end - dateRange.start;
    const previousRange: DateRange = {
      start: dateRange.start - periodLength,
      end: dateRange.start,
    };

    const previousExpenses = this.getUserExpenses(userId, { dateRange: previousRange });
    const previousTotal = previousExpenses.reduce((sum, e) => sum + e.amount.amount, 0);

    let percentageChange = 0;
    let trend: 'up' | 'down' | 'stable' = 'stable';

    if (previousTotal > 0) {
      percentageChange = Math.round(((totalSpent - previousTotal) / previousTotal) * 100);
      if (percentageChange > 5) {
        trend = 'up';
      } else if (percentageChange < -5) {
        trend = 'down';
      }
    }

    return {
      period: dateRange,
      totalSpent: { amount: totalSpent, currency },
      byCategory: byCategory as Record<ExpenseCategory, Money>,
      topMerchants,
      averagePerDay,
      comparedToPrevious: { percentageChange, trend },
    };
  }

  /**
   * Export expenses for tax purposes
   */
  exportForTax(
    userId: string,
    year: number,
    categories?: ExpenseCategory[]
  ): {
    year: number;
    expenses: Expense[];
    totalByCategory: Record<ExpenseCategory, Money>;
    grandTotal: Money;
  } {
    const startDate = new Date(year, 0, 1).getTime();
    const endDate = new Date(year + 1, 0, 1).getTime() - 1;

    let expenses = this.getUserExpenses(userId, {
      dateRange: { start: startDate, end: endDate },
    });

    if (categories?.length) {
      expenses = expenses.filter(e => categories.includes(e.category));
    }

    const totalByCategory: Record<ExpenseCategory, Money> = {} as Record<ExpenseCategory, Money>;
    let grandTotal = 0;
    let currency: Money['currency'] = this.config.defaultCurrency;

    for (const expense of expenses) {
      const current = totalByCategory[expense.category]?.amount ?? 0;
      totalByCategory[expense.category] = {
        amount: current + expense.amount.amount,
        currency: expense.amount.currency,
      };
      grandTotal += expense.amount.amount;
      currency = expense.amount.currency;
    }

    return {
      year,
      expenses,
      totalByCategory,
      grandTotal: { amount: grandTotal, currency },
    };
  }

  /**
   * Get category icon
   */
  getCategoryIcon(category: ExpenseCategory): string {
    return EXPENSE_CATEGORY_ICONS[category] ?? '📋';
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private parseExpenseText(text: string): {
    amount: Money;
    description: string;
    merchant?: string;
    category?: ExpenseCategory;
  } {
    // Parse patterns like:
    // "spent $47.50 at Costco for groceries"
    // "$100 on gas"
    // "paid 25.00 for lunch"

    const amountMatch = text.match(/\$?([\d,]+\.?\d*)/);
    const amount = amountMatch
      ? parseFloat(amountMatch[1].replace(',', ''))
      : 0;

    // Extract merchant (after "at" or "from")
    const merchantMatch = text.match(/(?:at|from)\s+([A-Za-z0-9\s]+?)(?:\s+for|\s+on|$)/i);
    const merchant = merchantMatch ? merchantMatch[1].trim() : undefined;

    // Extract purpose (after "for" or "on")
    const purposeMatch = text.match(/(?:for|on)\s+(.+?)(?:\s+at|$)/i);
    const description = purposeMatch ? purposeMatch[1].trim() : text;

    // Auto-categorize
    const category = categorizeExpense(merchant ?? description);

    return {
      amount: { amount, currency: this.config.defaultCurrency },
      description,
      merchant,
      category: category !== 'other' ? category : undefined,
    };
  }

  private checkBudgetImpact(expense: Expense): void {
    const budgets = this.getActiveBudgets(expense.userId);

    for (const budget of budgets) {
      this.recalculateBudgetSpending(budget);

      const percentUsed = (budget.totalSpent.amount / budget.totalLimit.amount) * 100;

      if (percentUsed >= 100) {
        this.emit(MONEY_MAKERS_EVENTS.BUDGET_EXCEEDED, {
          budgetId: budget.id,
          budgetName: budget.name,
          spent: budget.totalSpent,
          limit: budget.totalLimit,
        });
      } else if (percentUsed >= this.config.budgetWarningThreshold) {
        this.emit(MONEY_MAKERS_EVENTS.BUDGET_WARNING, {
          budgetId: budget.id,
          budgetName: budget.name,
          percentUsed,
        });
      }
    }
  }

  private recalculateBudgetSpending(budget: Budget): void {
    const expenses = this.getUserExpenses(budget.userId, {
      dateRange: { start: budget.startDate, end: budget.endDate },
    });

    let totalSpent = 0;

    // Reset category spending
    for (const cat of budget.categories) {
      cat.spent.amount = 0;
    }

    for (const expense of expenses) {
      totalSpent += expense.amount.amount;

      const catBudget = budget.categories.find(c => c.category === expense.category);
      if (catBudget) {
        catBudget.spent.amount += expense.amount.amount;
      }
    }

    budget.totalSpent.amount = totalSpent;
  }

  private detectRecurringPattern(expense: Expense): void {
    // Find similar expenses
    const similar = Array.from(this.expenses.values()).filter(
      e =>
        e.userId === expense.userId &&
        e.id !== expense.id &&
        e.merchant === expense.merchant &&
        Math.abs(e.amount.amount - expense.amount.amount) < expense.amount.amount * 0.1
    );

    if (similar.length >= this.config.recurringThreshold - 1) {
      this.emit(MONEY_MAKERS_EVENTS.RECURRING_EXPENSE_DETECTED, {
        expenseId: expense.id,
        merchant: expense.merchant,
        amount: expense.amount,
        occurrences: similar.length + 1,
      });
    }
  }

  private getPeriodStart(date: number, period: Budget['period']): number {
    const d = new Date(date);

    switch (period) {
      case 'weekly':
        d.setDate(d.getDate() - d.getDay());
        break;
      case 'monthly':
        d.setDate(1);
        break;
      case 'yearly':
        d.setMonth(0, 1);
        break;
    }

    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  private getPeriodEnd(startDate: number, period: Budget['period']): number {
    const d = new Date(startDate);

    switch (period) {
      case 'weekly':
        d.setDate(d.getDate() + 7);
        break;
      case 'monthly':
        d.setMonth(d.getMonth() + 1);
        break;
      case 'yearly':
        d.setFullYear(d.getFullYear() + 1);
        break;
    }

    return d.getTime() - 1;
  }

  private calculateNextOccurrence(
    lastDate: number,
    frequency: RecurringExpense['frequency']
  ): number {
    const d = new Date(lastDate);

    switch (frequency) {
      case 'daily':
        d.setDate(d.getDate() + 1);
        break;
      case 'weekly':
        d.setDate(d.getDate() + 7);
        break;
      case 'biweekly':
        d.setDate(d.getDate() + 14);
        break;
      case 'monthly':
        d.setMonth(d.getMonth() + 1);
        break;
      case 'quarterly':
        d.setMonth(d.getMonth() + 3);
        break;
      case 'yearly':
        d.setFullYear(d.getFullYear() + 1);
        break;
    }

    return d.getTime();
  }

  private toMonthlyAmount(
    amount: number,
    frequency: RecurringExpense['frequency']
  ): number {
    switch (frequency) {
      case 'daily':
        return amount * 30;
      case 'weekly':
        return amount * 4.33;
      case 'biweekly':
        return amount * 2.17;
      case 'monthly':
        return amount;
      case 'quarterly':
        return amount / 3;
      case 'yearly':
        return amount / 12;
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private emit(event: string, data: unknown): void {
    const safeData = typeof data === 'object' && data !== null
      ? JSON.parse(redactPII(JSON.stringify(data)))
      : data;
    this.config.onEvent?.(event, safeData);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createExpenseTracker(
  config?: Partial<ExpenseTrackerConfig>
): ExpenseTracker {
  return new ExpenseTracker(config);
}
