/**
 * Expense Store
 *
 * Persistence layer for expenses, splits, and groups.
 */

import { randomUUID } from 'crypto';
import type {
  Expense,
  ExpenseSplit,
  SplitGroup,
  GroupMember,
  Settlement,
  GroupBalance,
  ExpenseQueryOptions,
} from '../types.js';

/**
 * Interface for expense storage
 */
export interface ExpenseStore {
  initialize(): Promise<void>;

  // Expense CRUD
  createExpense(expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>): Promise<Expense>;
  getExpense(expenseId: string): Promise<Expense | null>;
  updateExpense(expenseId: string, updates: Partial<Expense>): Promise<Expense | null>;
  deleteExpense(expenseId: string): Promise<boolean>;
  listExpenses(userId: string, options?: ExpenseQueryOptions): Promise<Expense[]>;
  countExpenses(userId: string, options?: ExpenseQueryOptions): Promise<number>;

  // Split operations
  updateSplit(expenseId: string, splitId: string, updates: Partial<ExpenseSplit>): Promise<boolean>;
  getPendingSplits(userId: string): Promise<Array<{ expense: Expense; split: ExpenseSplit }>>;

  // Group operations
  createGroup(group: Omit<SplitGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<SplitGroup>;
  getGroup(groupId: string): Promise<SplitGroup | null>;
  updateGroup(groupId: string, updates: Partial<SplitGroup>): Promise<SplitGroup | null>;
  deleteGroup(groupId: string): Promise<boolean>;
  listGroups(userId: string): Promise<SplitGroup[]>;
  addGroupMember(groupId: string, member: Omit<GroupMember, 'id' | 'joinedAt'>): Promise<GroupMember | null>;
  removeGroupMember(groupId: string, memberId: string): Promise<boolean>;

  // Settlement operations
  createSettlement(settlement: Omit<Settlement, 'id' | 'createdAt'>): Promise<Settlement>;
  getSettlement(settlementId: string): Promise<Settlement | null>;
  updateSettlement(settlementId: string, updates: Partial<Settlement>): Promise<Settlement | null>;
  listSettlements(groupId: string): Promise<Settlement[]>;
  getPendingSettlements(userId: string): Promise<Settlement[]>;

  // Balance calculations
  calculateGroupBalances(groupId: string): Promise<GroupBalance[]>;
  calculateOptimalSettlements(groupId: string): Promise<Settlement[]>;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Database-backed expense store
 */
export class DatabaseExpenseStore implements ExpenseStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Expenses table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        category TEXT NOT NULL,
        subcategory TEXT,
        description TEXT NOT NULL,
        merchant TEXT,
        expense_date INTEGER NOT NULL,
        payment_method TEXT,
        receipt_url TEXT,
        splits TEXT,
        tags TEXT DEFAULT '[]',
        is_recurring INTEGER DEFAULT 0,
        recurring_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, expense_date)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_expenses_user_category ON expenses(user_id, category)
    `);

    // Split groups table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS split_groups (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        members TEXT NOT NULL,
        expenses TEXT DEFAULT '[]',
        default_split_type TEXT DEFAULT 'equal',
        is_active INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_split_groups_user ON split_groups(user_id)
    `);

    // Settlements table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS settlements (
        id TEXT PRIMARY KEY,
        group_id TEXT,
        from_user_id TEXT NOT NULL,
        from_name TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        to_name TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'pending',
        method TEXT,
        reference TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id)
    `);
  }

  async createExpense(expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>): Promise<Expense> {
    const now = Date.now();
    const id = randomUUID();

    const item: Expense = {
      ...expense,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO expenses (
        id, user_id, amount, currency, category, subcategory, description, merchant,
        expense_date, payment_method, receipt_url, splits, tags, is_recurring, recurring_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.amount,
        item.currency,
        item.category,
        item.subcategory ?? null,
        item.description,
        item.merchant ?? null,
        item.expenseDate,
        item.paymentMethod ?? null,
        item.receiptUrl ?? null,
        item.splits ? JSON.stringify(item.splits) : null,
        JSON.stringify(item.tags),
        item.isRecurring ? 1 : 0,
        item.recurringId ?? null,
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async getExpense(expenseId: string): Promise<Expense | null> {
    const result = await this.db.query<ExpenseRow>(
      'SELECT * FROM expenses WHERE id = ?',
      [expenseId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToExpense(result.rows[0]);
  }

  async updateExpense(expenseId: string, updates: Partial<Expense>): Promise<Expense | null> {
    const existing = await this.getExpense(expenseId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const updated: Expense = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    await this.db.execute(
      `UPDATE expenses SET
        amount = ?, currency = ?, category = ?, subcategory = ?, description = ?,
        merchant = ?, expense_date = ?, payment_method = ?, receipt_url = ?, splits = ?,
        tags = ?, is_recurring = ?, recurring_id = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.amount,
        updated.currency,
        updated.category,
        updated.subcategory ?? null,
        updated.description,
        updated.merchant ?? null,
        updated.expenseDate,
        updated.paymentMethod ?? null,
        updated.receiptUrl ?? null,
        updated.splits ? JSON.stringify(updated.splits) : null,
        JSON.stringify(updated.tags),
        updated.isRecurring ? 1 : 0,
        updated.recurringId ?? null,
        updated.updatedAt,
        expenseId,
      ]
    );

    return updated;
  }

  async deleteExpense(expenseId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM expenses WHERE id = ?',
      [expenseId]
    );
    return result.changes > 0;
  }

  async listExpenses(userId: string, options: ExpenseQueryOptions = {}): Promise<Expense[]> {
    const { sql, params } = this.buildExpenseQuerySQL(userId, options);
    const result = await this.db.query<ExpenseRow>(sql, params);
    return result.rows.map(row => this.rowToExpense(row));
  }

  async countExpenses(userId: string, options: ExpenseQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildExpenseQuerySQL(userId, options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async updateSplit(expenseId: string, splitId: string, updates: Partial<ExpenseSplit>): Promise<boolean> {
    const expense = await this.getExpense(expenseId);
    if (!expense || !expense.splits) {
      return false;
    }

    const splitIndex = expense.splits.findIndex(s => s.id === splitId);
    if (splitIndex === -1) {
      return false;
    }

    expense.splits[splitIndex] = { ...expense.splits[splitIndex], ...updates };
    await this.updateExpense(expenseId, { splits: expense.splits });
    return true;
  }

  async getPendingSplits(userId: string): Promise<Array<{ expense: Expense; split: ExpenseSplit }>> {
    const expenses = await this.listExpenses(userId, { hasSplits: true });
    const results: Array<{ expense: Expense; split: ExpenseSplit }> = [];

    for (const expense of expenses) {
      if (expense.splits) {
        for (const split of expense.splits) {
          if (split.status === 'pending' || split.status === 'requested' || split.status === 'reminded') {
            results.push({ expense, split });
          }
        }
      }
    }

    return results;
  }

  async createGroup(group: Omit<SplitGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<SplitGroup> {
    const now = Date.now();
    const id = randomUUID();

    const item: SplitGroup = {
      ...group,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO split_groups (
        id, user_id, name, description, members, expenses, default_split_type, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.name,
        item.description ?? null,
        JSON.stringify(item.members),
        JSON.stringify(item.expenses),
        item.defaultSplitType,
        item.isActive ? 1 : 0,
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async getGroup(groupId: string): Promise<SplitGroup | null> {
    const result = await this.db.query<GroupRow>(
      'SELECT * FROM split_groups WHERE id = ?',
      [groupId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToGroup(result.rows[0]);
  }

  async updateGroup(groupId: string, updates: Partial<SplitGroup>): Promise<SplitGroup | null> {
    const existing = await this.getGroup(groupId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const updated: SplitGroup = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    await this.db.execute(
      `UPDATE split_groups SET
        name = ?, description = ?, members = ?, expenses = ?, default_split_type = ?,
        is_active = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.description ?? null,
        JSON.stringify(updated.members),
        JSON.stringify(updated.expenses),
        updated.defaultSplitType,
        updated.isActive ? 1 : 0,
        updated.updatedAt,
        groupId,
      ]
    );

    return updated;
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM split_groups WHERE id = ?',
      [groupId]
    );
    return result.changes > 0;
  }

  async listGroups(userId: string): Promise<SplitGroup[]> {
    const result = await this.db.query<GroupRow>(
      'SELECT * FROM split_groups WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return result.rows.map(row => this.rowToGroup(row));
  }

  async addGroupMember(groupId: string, member: Omit<GroupMember, 'id' | 'joinedAt'>): Promise<GroupMember | null> {
    const group = await this.getGroup(groupId);
    if (!group) {
      return null;
    }

    const newMember: GroupMember = {
      ...member,
      id: randomUUID(),
      joinedAt: Date.now(),
    };

    group.members.push(newMember);
    await this.updateGroup(groupId, { members: group.members });
    return newMember;
  }

  async removeGroupMember(groupId: string, memberId: string): Promise<boolean> {
    const group = await this.getGroup(groupId);
    if (!group) {
      return false;
    }

    const initialLength = group.members.length;
    group.members = group.members.filter(m => m.id !== memberId);

    if (group.members.length === initialLength) {
      return false;
    }

    await this.updateGroup(groupId, { members: group.members });
    return true;
  }

  async createSettlement(settlement: Omit<Settlement, 'id' | 'createdAt'>): Promise<Settlement> {
    const now = Date.now();
    const id = randomUUID();

    const item: Settlement = {
      ...settlement,
      id,
      createdAt: now,
    };

    await this.db.execute(
      `INSERT INTO settlements (
        id, group_id, from_user_id, from_name, to_user_id, to_name, amount, currency,
        status, method, reference, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.groupId ?? null,
        item.fromUserId,
        item.fromName,
        item.toUserId,
        item.toName,
        item.amount,
        item.currency,
        item.status,
        item.method ?? null,
        item.reference ?? null,
        item.createdAt,
        item.completedAt ?? null,
      ]
    );

    return item;
  }

  async getSettlement(settlementId: string): Promise<Settlement | null> {
    const result = await this.db.query<SettlementRow>(
      'SELECT * FROM settlements WHERE id = ?',
      [settlementId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToSettlement(result.rows[0]);
  }

  async updateSettlement(settlementId: string, updates: Partial<Settlement>): Promise<Settlement | null> {
    const existing = await this.getSettlement(settlementId);
    if (!existing) {
      return null;
    }

    const updated: Settlement = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
    };

    if (updates.status === 'completed' && !updated.completedAt) {
      updated.completedAt = Date.now();
    }

    await this.db.execute(
      `UPDATE settlements SET
        status = ?, method = ?, reference = ?, completed_at = ?
      WHERE id = ?`,
      [
        updated.status,
        updated.method ?? null,
        updated.reference ?? null,
        updated.completedAt ?? null,
        settlementId,
      ]
    );

    return updated;
  }

  async listSettlements(groupId: string): Promise<Settlement[]> {
    const result = await this.db.query<SettlementRow>(
      'SELECT * FROM settlements WHERE group_id = ? ORDER BY created_at DESC',
      [groupId]
    );
    return result.rows.map(row => this.rowToSettlement(row));
  }

  async getPendingSettlements(userId: string): Promise<Settlement[]> {
    const result = await this.db.query<SettlementRow>(
      `SELECT * FROM settlements WHERE (from_user_id = ? OR to_user_id = ?) AND status = 'pending' ORDER BY created_at DESC`,
      [userId, userId]
    );
    return result.rows.map(row => this.rowToSettlement(row));
  }

  async calculateGroupBalances(groupId: string): Promise<GroupBalance[]> {
    const group = await this.getGroup(groupId);
    if (!group) {
      return [];
    }

    const balances = new Map<string, GroupBalance>();

    // Initialize balances for all members
    for (const member of group.members) {
      balances.set(member.id, {
        userId: member.id,
        userName: member.name,
        balance: 0,
        owes: new Map(),
        owedBy: new Map(),
      });
    }

    // Process all expenses in the group
    for (const expenseId of group.expenses) {
      const expense = await this.getExpense(expenseId);
      if (!expense || !expense.splits) continue;

      for (const split of expense.splits) {
        if (split.status !== 'paid') {
          // Update the debtor's balance (they owe money)
          const debtorBalance = balances.get(split.odId);
          if (debtorBalance) {
            debtorBalance.balance -= split.amount;
            const currentOwes = debtorBalance.owes.get(expense.userId) ?? 0;
            debtorBalance.owes.set(expense.userId, currentOwes + split.amount);
          }

          // Update the creditor's balance (they are owed money)
          const creditorBalance = balances.get(expense.userId);
          if (creditorBalance) {
            creditorBalance.balance += split.amount;
            const currentOwedBy = creditorBalance.owedBy.get(split.odId) ?? 0;
            creditorBalance.owedBy.set(split.odId, currentOwedBy + split.amount);
          }
        }
      }
    }

    return Array.from(balances.values());
  }

  async calculateOptimalSettlements(groupId: string): Promise<Settlement[]> {
    const balances = await this.calculateGroupBalances(groupId);

    // Separate into debtors (negative balance) and creditors (positive balance)
    const debtors: Array<{ userId: string; userName: string; amount: number }> = [];
    const creditors: Array<{ userId: string; userName: string; amount: number }> = [];

    for (const balance of balances) {
      if (balance.balance < 0) {
        debtors.push({
          userId: balance.userId,
          userName: balance.userName,
          amount: Math.abs(balance.balance),
        });
      } else if (balance.balance > 0) {
        creditors.push({
          userId: balance.userId,
          userName: balance.userName,
          amount: balance.balance,
        });
      }
    }

    // Sort by amount descending for greedy algorithm
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlements: Settlement[] = [];

    // Greedy algorithm to minimize number of transactions
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];

      const amount = Math.min(debtor.amount, creditor.amount);

      if (amount > 0.01) { // Avoid tiny settlements
        settlements.push({
          id: randomUUID(),
          groupId,
          fromUserId: debtor.userId,
          fromName: debtor.userName,
          toUserId: creditor.userId,
          toName: creditor.userName,
          amount: Math.round(amount * 100) / 100,
          currency: 'USD',
          status: 'pending',
          createdAt: Date.now(),
        });
      }

      debtor.amount -= amount;
      creditor.amount -= amount;

      if (debtor.amount < 0.01) i++;
      if (creditor.amount < 0.01) j++;
    }

    return settlements;
  }

  private buildExpenseQuerySQL(
    userId: string,
    options: ExpenseQueryOptions,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (options.category && options.category.length > 0) {
      const placeholders = options.category.map(() => '?').join(',');
      conditions.push(`category IN (${placeholders})`);
      params.push(...options.category);
    }

    if (options.dateFrom) {
      conditions.push('expense_date >= ?');
      params.push(options.dateFrom);
    }

    if (options.dateTo) {
      conditions.push('expense_date <= ?');
      params.push(options.dateTo);
    }

    if (options.minAmount !== undefined) {
      conditions.push('amount >= ?');
      params.push(options.minAmount);
    }

    if (options.maxAmount !== undefined) {
      conditions.push('amount <= ?');
      params.push(options.maxAmount);
    }

    if (options.hasSplits !== undefined) {
      if (options.hasSplits) {
        conditions.push('splits IS NOT NULL');
      } else {
        conditions.push('splits IS NULL');
      }
    }

    const whereClause = conditions.join(' AND ');

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM expenses WHERE ${whereClause}`,
        params,
      };
    }

    let orderBy = 'expense_date DESC';
    if (options.orderBy) {
      const direction = options.orderDirection === 'asc' ? 'ASC' : 'DESC';
      const column = {
        expenseDate: 'expense_date',
        amount: 'amount',
        createdAt: 'created_at',
      }[options.orderBy];
      orderBy = `${column} ${direction}`;
    }

    let sql = `SELECT * FROM expenses WHERE ${whereClause} ORDER BY ${orderBy}`;

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

  private rowToExpense(row: ExpenseRow): Expense {
    return {
      id: row.id,
      userId: row.user_id,
      amount: row.amount,
      currency: row.currency,
      category: row.category as Expense['category'],
      subcategory: row.subcategory ?? undefined,
      description: row.description,
      merchant: row.merchant ?? undefined,
      expenseDate: row.expense_date,
      paymentMethod: row.payment_method ?? undefined,
      receiptUrl: row.receipt_url ?? undefined,
      splits: row.splits ? JSON.parse(row.splits) : undefined,
      tags: JSON.parse(row.tags),
      isRecurring: row.is_recurring === 1,
      recurringId: row.recurring_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToGroup(row: GroupRow): SplitGroup {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description ?? undefined,
      members: JSON.parse(row.members),
      expenses: JSON.parse(row.expenses),
      defaultSplitType: row.default_split_type as SplitGroup['defaultSplitType'],
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToSettlement(row: SettlementRow): Settlement {
    return {
      id: row.id,
      groupId: row.group_id ?? undefined,
      fromUserId: row.from_user_id,
      fromName: row.from_name,
      toUserId: row.to_user_id,
      toName: row.to_name,
      amount: row.amount,
      currency: row.currency,
      status: row.status as Settlement['status'],
      method: row.method ?? undefined,
      reference: row.reference ?? undefined,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? undefined,
    };
  }
}

/**
 * In-memory expense store for testing
 */
export class InMemoryExpenseStore implements ExpenseStore {
  private expenses = new Map<string, Expense>();
  private groups = new Map<string, SplitGroup>();
  private settlements = new Map<string, Settlement>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async createExpense(expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>): Promise<Expense> {
    const now = Date.now();
    const item: Expense = {
      ...expense,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.expenses.set(item.id, item);
    return item;
  }

  async getExpense(expenseId: string): Promise<Expense | null> {
    return this.expenses.get(expenseId) ?? null;
  }

  async updateExpense(expenseId: string, updates: Partial<Expense>): Promise<Expense | null> {
    const existing = this.expenses.get(expenseId);
    if (!existing) return null;

    const updated: Expense = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    this.expenses.set(expenseId, updated);
    return updated;
  }

  async deleteExpense(expenseId: string): Promise<boolean> {
    return this.expenses.delete(expenseId);
  }

  async listExpenses(userId: string, options: ExpenseQueryOptions = {}): Promise<Expense[]> {
    let items = Array.from(this.expenses.values()).filter(e => e.userId === userId);

    if (options.category && options.category.length > 0) {
      items = items.filter(e => options.category!.includes(e.category));
    }

    if (options.dateFrom) {
      items = items.filter(e => e.expenseDate >= options.dateFrom!);
    }

    if (options.dateTo) {
      items = items.filter(e => e.expenseDate <= options.dateTo!);
    }

    if (options.hasSplits !== undefined) {
      items = items.filter(e => options.hasSplits ? !!e.splits : !e.splits);
    }

    items.sort((a, b) => b.expenseDate - a.expenseDate);

    if (options.offset) {
      items = items.slice(options.offset);
    }

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  async countExpenses(userId: string, options: ExpenseQueryOptions = {}): Promise<number> {
    const items = await this.listExpenses(userId, { ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async updateSplit(expenseId: string, splitId: string, updates: Partial<ExpenseSplit>): Promise<boolean> {
    const expense = this.expenses.get(expenseId);
    if (!expense || !expense.splits) return false;

    const splitIndex = expense.splits.findIndex(s => s.id === splitId);
    if (splitIndex === -1) return false;

    expense.splits[splitIndex] = { ...expense.splits[splitIndex], ...updates };
    expense.updatedAt = Date.now();
    return true;
  }

  async getPendingSplits(userId: string): Promise<Array<{ expense: Expense; split: ExpenseSplit }>> {
    const expenses = await this.listExpenses(userId, { hasSplits: true });
    const results: Array<{ expense: Expense; split: ExpenseSplit }> = [];

    for (const expense of expenses) {
      if (expense.splits) {
        for (const split of expense.splits) {
          if (split.status === 'pending' || split.status === 'requested' || split.status === 'reminded') {
            results.push({ expense, split });
          }
        }
      }
    }

    return results;
  }

  async createGroup(group: Omit<SplitGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<SplitGroup> {
    const now = Date.now();
    const item: SplitGroup = {
      ...group,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.groups.set(item.id, item);
    return item;
  }

  async getGroup(groupId: string): Promise<SplitGroup | null> {
    return this.groups.get(groupId) ?? null;
  }

  async updateGroup(groupId: string, updates: Partial<SplitGroup>): Promise<SplitGroup | null> {
    const existing = this.groups.get(groupId);
    if (!existing) return null;

    const updated: SplitGroup = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    this.groups.set(groupId, updated);
    return updated;
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    return this.groups.delete(groupId);
  }

  async listGroups(userId: string): Promise<SplitGroup[]> {
    return Array.from(this.groups.values())
      .filter(g => g.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async addGroupMember(groupId: string, member: Omit<GroupMember, 'id' | 'joinedAt'>): Promise<GroupMember | null> {
    const group = this.groups.get(groupId);
    if (!group) return null;

    const newMember: GroupMember = {
      ...member,
      id: randomUUID(),
      joinedAt: Date.now(),
    };

    group.members.push(newMember);
    group.updatedAt = Date.now();
    return newMember;
  }

  async removeGroupMember(groupId: string, memberId: string): Promise<boolean> {
    const group = this.groups.get(groupId);
    if (!group) return false;

    const initialLength = group.members.length;
    group.members = group.members.filter(m => m.id !== memberId);
    group.updatedAt = Date.now();
    return group.members.length < initialLength;
  }

  async createSettlement(settlement: Omit<Settlement, 'id' | 'createdAt'>): Promise<Settlement> {
    const item: Settlement = {
      ...settlement,
      id: randomUUID(),
      createdAt: Date.now(),
    };
    this.settlements.set(item.id, item);
    return item;
  }

  async getSettlement(settlementId: string): Promise<Settlement | null> {
    return this.settlements.get(settlementId) ?? null;
  }

  async updateSettlement(settlementId: string, updates: Partial<Settlement>): Promise<Settlement | null> {
    const existing = this.settlements.get(settlementId);
    if (!existing) return null;

    const updated: Settlement = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
    };

    if (updates.status === 'completed' && !updated.completedAt) {
      updated.completedAt = Date.now();
    }

    this.settlements.set(settlementId, updated);
    return updated;
  }

  async listSettlements(groupId: string): Promise<Settlement[]> {
    return Array.from(this.settlements.values())
      .filter(s => s.groupId === groupId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getPendingSettlements(userId: string): Promise<Settlement[]> {
    return Array.from(this.settlements.values())
      .filter(s => (s.fromUserId === userId || s.toUserId === userId) && s.status === 'pending')
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async calculateGroupBalances(groupId: string): Promise<GroupBalance[]> {
    const group = this.groups.get(groupId);
    if (!group) return [];

    const balances = new Map<string, GroupBalance>();

    for (const member of group.members) {
      balances.set(member.id, {
        userId: member.id,
        userName: member.name,
        balance: 0,
        owes: new Map(),
        owedBy: new Map(),
      });
    }

    for (const expenseId of group.expenses) {
      const expense = this.expenses.get(expenseId);
      if (!expense || !expense.splits) continue;

      for (const split of expense.splits) {
        if (split.status !== 'paid') {
          const debtorBalance = balances.get(split.odId);
          if (debtorBalance) {
            debtorBalance.balance -= split.amount;
            const currentOwes = debtorBalance.owes.get(expense.userId) ?? 0;
            debtorBalance.owes.set(expense.userId, currentOwes + split.amount);
          }

          const creditorBalance = balances.get(expense.userId);
          if (creditorBalance) {
            creditorBalance.balance += split.amount;
            const currentOwedBy = creditorBalance.owedBy.get(split.odId) ?? 0;
            creditorBalance.owedBy.set(split.odId, currentOwedBy + split.amount);
          }
        }
      }
    }

    return Array.from(balances.values());
  }

  async calculateOptimalSettlements(groupId: string): Promise<Settlement[]> {
    const balances = await this.calculateGroupBalances(groupId);
    const debtors: Array<{ userId: string; userName: string; amount: number }> = [];
    const creditors: Array<{ userId: string; userName: string; amount: number }> = [];

    for (const balance of balances) {
      if (balance.balance < 0) {
        debtors.push({ userId: balance.userId, userName: balance.userName, amount: Math.abs(balance.balance) });
      } else if (balance.balance > 0) {
        creditors.push({ userId: balance.userId, userName: balance.userName, amount: balance.balance });
      }
    }

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlements: Settlement[] = [];
    let i = 0, j = 0;

    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(debtors[i].amount, creditors[j].amount);

      if (amount > 0.01) {
        settlements.push({
          id: randomUUID(),
          groupId,
          fromUserId: debtors[i].userId,
          fromName: debtors[i].userName,
          toUserId: creditors[j].userId,
          toName: creditors[j].userName,
          amount: Math.round(amount * 100) / 100,
          currency: 'USD',
          status: 'pending',
          createdAt: Date.now(),
        });
      }

      debtors[i].amount -= amount;
      creditors[j].amount -= amount;

      if (debtors[i].amount < 0.01) i++;
      if (creditors[j].amount < 0.01) j++;
    }

    return settlements;
  }
}

// Row types for database
interface ExpenseRow {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  category: string;
  subcategory: string | null;
  description: string;
  merchant: string | null;
  expense_date: number;
  payment_method: string | null;
  receipt_url: string | null;
  splits: string | null;
  tags: string;
  is_recurring: number;
  recurring_id: string | null;
  created_at: number;
  updated_at: number;
}

interface GroupRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  members: string;
  expenses: string;
  default_split_type: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

interface SettlementRow {
  id: string;
  group_id: string | null;
  from_user_id: string;
  from_name: string;
  to_user_id: string;
  to_name: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  reference: string | null;
  created_at: number;
  completed_at: number | null;
}

/**
 * Factory function to create expense store
 */
export function createExpenseStore(type: 'memory'): InMemoryExpenseStore;
export function createExpenseStore(type: 'database', db: DatabaseAdapter): DatabaseExpenseStore;
export function createExpenseStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): ExpenseStore {
  if (type === 'memory') {
    return new InMemoryExpenseStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseExpenseStore(db);
}
