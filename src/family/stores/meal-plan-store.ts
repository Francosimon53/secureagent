/**
 * Meal Plan Store
 *
 * Persistence layer for meal plans and grocery lists.
 */

import { randomUUID } from 'crypto';
import type {
  DatabaseAdapter,
  DayMeals,
  GroceryItem,
  GroceryList,
  GroceryListQueryOptions,
  GroceryListStatus,
  MealPlan,
  MealPlanQueryOptions,
  PlannedMeal,
  StoreSortedItems,
} from '../types.js';

// ============================================================================
// Meal Plan Store Interface
// ============================================================================

export interface MealPlanStore {
  initialize(): Promise<void>;

  // Meal Plan CRUD
  createMealPlan(plan: Omit<MealPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealPlan>;
  getMealPlan(id: string): Promise<MealPlan | null>;
  updateMealPlan(id: string, updates: Partial<Omit<MealPlan, 'id' | 'createdAt'>>): Promise<MealPlan | null>;
  deleteMealPlan(id: string): Promise<boolean>;

  // Query
  listMealPlans(options: MealPlanQueryOptions): Promise<MealPlan[]>;
  getMealPlanByWeek(familyGroupId: string, weekStartDate: number): Promise<MealPlan | null>;
  getCurrentMealPlan(familyGroupId: string): Promise<MealPlan | null>;

  // Meal Management
  setMeal(planId: string, date: number, mealType: keyof DayMeals, meal: DayMeals[keyof DayMeals]): Promise<MealPlan | null>;
  removeMeal(planId: string, date: number, mealType: keyof DayMeals): Promise<MealPlan | null>;
}

// ============================================================================
// Grocery List Store Interface
// ============================================================================

export interface GroceryListStore {
  initialize(): Promise<void>;

  // CRUD
  createGroceryList(list: Omit<GroceryList, 'id' | 'createdAt' | 'updatedAt'>): Promise<GroceryList>;
  getGroceryList(id: string): Promise<GroceryList | null>;
  updateGroceryList(id: string, updates: Partial<Omit<GroceryList, 'id' | 'createdAt'>>): Promise<GroceryList | null>;
  deleteGroceryList(id: string): Promise<boolean>;

  // Query
  listGroceryLists(options: GroceryListQueryOptions): Promise<GroceryList[]>;
  getActiveList(familyGroupId: string): Promise<GroceryList | null>;
  getListByMealPlan(mealPlanId: string): Promise<GroceryList | null>;

  // Item Management
  addItem(listId: string, item: Omit<GroceryItem, 'id'>): Promise<GroceryList | null>;
  updateItem(listId: string, itemId: string, updates: Partial<GroceryItem>): Promise<GroceryList | null>;
  removeItem(listId: string, itemId: string): Promise<GroceryList | null>;
  markItemPurchased(listId: string, itemId: string, purchasedBy: string): Promise<GroceryList | null>;
  bulkMarkPurchased(listId: string, itemIds: string[], purchasedBy: string): Promise<GroceryList | null>;

  // Status
  updateStatus(listId: string, status: GroceryListStatus): Promise<GroceryList | null>;
  setStoreSortedItems(listId: string, sorted: Record<string, StoreSortedItems>): Promise<GroceryList | null>;
}

// ============================================================================
// Database Row Types
// ============================================================================

interface MealPlanRow {
  id: string;
  family_group_id: string;
  created_by: string;
  week_start_date: number;
  meals: string;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

interface GroceryListRow {
  id: string;
  family_group_id: string;
  meal_plan_id: string | null;
  items: string;
  store_sorted_items: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

// ============================================================================
// Database Meal Plan Store
// ============================================================================

export class DatabaseMealPlanStore implements MealPlanStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS meal_plans (
        id TEXT PRIMARY KEY,
        family_group_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        week_start_date INTEGER NOT NULL,
        meals TEXT NOT NULL,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_meal_plans_family ON meal_plans(family_group_id, week_start_date)
    `);
  }

  async createMealPlan(plan: Omit<MealPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealPlan> {
    const now = Date.now();
    const id = randomUUID();

    const newPlan: MealPlan = {
      ...plan,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO meal_plans (id, family_group_id, created_by, week_start_date, meals, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newPlan.id,
        newPlan.familyGroupId,
        newPlan.createdBy,
        newPlan.weekStartDate,
        JSON.stringify(newPlan.meals),
        newPlan.notes ?? null,
        newPlan.createdAt,
        newPlan.updatedAt,
      ]
    );

    return newPlan;
  }

  async getMealPlan(id: string): Promise<MealPlan | null> {
    const { rows } = await this.db.query<MealPlanRow>(
      'SELECT * FROM meal_plans WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.rowToMealPlan(rows[0]);
  }

  async updateMealPlan(id: string, updates: Partial<Omit<MealPlan, 'id' | 'createdAt'>>): Promise<MealPlan | null> {
    const existing = await this.getMealPlan(id);
    if (!existing) return null;

    const updated: MealPlan = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `UPDATE meal_plans SET meals = ?, notes = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(updated.meals), updated.notes ?? null, updated.updatedAt, id]
    );

    return updated;
  }

  async deleteMealPlan(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM meal_plans WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async listMealPlans(options: MealPlanQueryOptions): Promise<MealPlan[]> {
    let sql = 'SELECT * FROM meal_plans WHERE family_group_id = ?';
    const params: unknown[] = [options.familyGroupId];

    if (options.startDate !== undefined) {
      sql += ' AND week_start_date >= ?';
      params.push(options.startDate);
    }

    if (options.endDate !== undefined) {
      sql += ' AND week_start_date <= ?';
      params.push(options.endDate);
    }

    const orderBy = options.orderBy || 'week_start_date';
    const orderDir = options.orderDirection || 'desc';
    sql += ` ORDER BY ${orderBy} ${orderDir}`;

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const { rows } = await this.db.query<MealPlanRow>(sql, params);
    return rows.map(row => this.rowToMealPlan(row));
  }

  async getMealPlanByWeek(familyGroupId: string, weekStartDate: number): Promise<MealPlan | null> {
    const { rows } = await this.db.query<MealPlanRow>(
      'SELECT * FROM meal_plans WHERE family_group_id = ? AND week_start_date = ?',
      [familyGroupId, weekStartDate]
    );

    if (rows.length === 0) return null;
    return this.rowToMealPlan(rows[0]);
  }

  async getCurrentMealPlan(familyGroupId: string): Promise<MealPlan | null> {
    const now = Date.now();
    const weekStart = this.getWeekStart(now);

    return this.getMealPlanByWeek(familyGroupId, weekStart);
  }

  async setMeal(planId: string, date: number, mealType: keyof DayMeals, meal: DayMeals[keyof DayMeals]): Promise<MealPlan | null> {
    const plan = await this.getMealPlan(planId);
    if (!plan) return null;

    const dateKey = date.toString();
    if (!plan.meals[date]) {
      plan.meals[date] = {};
    }

    if (mealType === 'snacks' && meal) {
      const currentSnacks = plan.meals[date].snacks || [];
      plan.meals[date].snacks = [...currentSnacks, meal as PlannedMeal];
    } else {
      (plan.meals[date] as Record<string, unknown>)[mealType] = meal;
    }

    return this.updateMealPlan(planId, { meals: plan.meals });
  }

  async removeMeal(planId: string, date: number, mealType: keyof DayMeals): Promise<MealPlan | null> {
    const plan = await this.getMealPlan(planId);
    if (!plan || !plan.meals[date]) return plan;

    delete (plan.meals[date] as Record<string, unknown>)[mealType];

    return this.updateMealPlan(planId, { meals: plan.meals });
  }

  private rowToMealPlan(row: MealPlanRow): MealPlan {
    return {
      id: row.id,
      familyGroupId: row.family_group_id,
      createdBy: row.created_by,
      weekStartDate: row.week_start_date,
      meals: JSON.parse(row.meals) as Record<number, DayMeals>,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private getWeekStart(timestamp: number): number {
    const date = new Date(timestamp);
    const day = date.getDay();
    const diff = date.getDate() - day;
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }
}

// ============================================================================
// Database Grocery List Store
// ============================================================================

export class DatabaseGroceryListStore implements GroceryListStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS grocery_lists (
        id TEXT PRIMARY KEY,
        family_group_id TEXT NOT NULL,
        meal_plan_id TEXT,
        items TEXT NOT NULL,
        store_sorted_items TEXT,
        status TEXT DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_grocery_lists_family ON grocery_lists(family_group_id, status)
    `);
  }

  async createGroceryList(list: Omit<GroceryList, 'id' | 'createdAt' | 'updatedAt'>): Promise<GroceryList> {
    const now = Date.now();
    const id = randomUUID();

    const newList: GroceryList = {
      ...list,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO grocery_lists (id, family_group_id, meal_plan_id, items, store_sorted_items, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newList.id,
        newList.familyGroupId,
        newList.mealPlanId ?? null,
        JSON.stringify(newList.items),
        newList.storeSortedItems ? JSON.stringify(newList.storeSortedItems) : null,
        newList.status,
        newList.createdAt,
        newList.updatedAt,
      ]
    );

    return newList;
  }

  async getGroceryList(id: string): Promise<GroceryList | null> {
    const { rows } = await this.db.query<GroceryListRow>(
      'SELECT * FROM grocery_lists WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.rowToGroceryList(rows[0]);
  }

  async updateGroceryList(id: string, updates: Partial<Omit<GroceryList, 'id' | 'createdAt'>>): Promise<GroceryList | null> {
    const existing = await this.getGroceryList(id);
    if (!existing) return null;

    const updated: GroceryList = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `UPDATE grocery_lists SET items = ?, store_sorted_items = ?, status = ?, updated_at = ? WHERE id = ?`,
      [
        JSON.stringify(updated.items),
        updated.storeSortedItems ? JSON.stringify(updated.storeSortedItems) : null,
        updated.status,
        updated.updatedAt,
        id,
      ]
    );

    return updated;
  }

  async deleteGroceryList(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM grocery_lists WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async listGroceryLists(options: GroceryListQueryOptions): Promise<GroceryList[]> {
    let sql = 'SELECT * FROM grocery_lists WHERE family_group_id = ?';
    const params: unknown[] = [options.familyGroupId];

    if (options.status) {
      sql += ' AND status = ?';
      params.push(options.status);
    }

    if (options.mealPlanId) {
      sql += ' AND meal_plan_id = ?';
      params.push(options.mealPlanId);
    }

    const orderDir = options.orderDirection || 'desc';
    sql += ` ORDER BY created_at ${orderDir}`;

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const { rows } = await this.db.query<GroceryListRow>(sql, params);
    return rows.map(row => this.rowToGroceryList(row));
  }

  async getActiveList(familyGroupId: string): Promise<GroceryList | null> {
    const { rows } = await this.db.query<GroceryListRow>(
      'SELECT * FROM grocery_lists WHERE family_group_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
      [familyGroupId, 'active']
    );

    if (rows.length === 0) return null;
    return this.rowToGroceryList(rows[0]);
  }

  async getListByMealPlan(mealPlanId: string): Promise<GroceryList | null> {
    const { rows } = await this.db.query<GroceryListRow>(
      'SELECT * FROM grocery_lists WHERE meal_plan_id = ? ORDER BY created_at DESC LIMIT 1',
      [mealPlanId]
    );

    if (rows.length === 0) return null;
    return this.rowToGroceryList(rows[0]);
  }

  async addItem(listId: string, item: Omit<GroceryItem, 'id'>): Promise<GroceryList | null> {
    const list = await this.getGroceryList(listId);
    if (!list) return null;

    const newItem: GroceryItem = {
      ...item,
      id: randomUUID(),
    };

    list.items.push(newItem);
    return this.updateGroceryList(listId, { items: list.items });
  }

  async updateItem(listId: string, itemId: string, updates: Partial<GroceryItem>): Promise<GroceryList | null> {
    const list = await this.getGroceryList(listId);
    if (!list) return null;

    const itemIndex = list.items.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return null;

    list.items[itemIndex] = {
      ...list.items[itemIndex],
      ...updates,
    };

    return this.updateGroceryList(listId, { items: list.items });
  }

  async removeItem(listId: string, itemId: string): Promise<GroceryList | null> {
    const list = await this.getGroceryList(listId);
    if (!list) return null;

    list.items = list.items.filter(i => i.id !== itemId);
    return this.updateGroceryList(listId, { items: list.items });
  }

  async markItemPurchased(listId: string, itemId: string, purchasedBy: string): Promise<GroceryList | null> {
    return this.updateItem(listId, itemId, { isPurchased: true, purchasedBy });
  }

  async bulkMarkPurchased(listId: string, itemIds: string[], purchasedBy: string): Promise<GroceryList | null> {
    const list = await this.getGroceryList(listId);
    if (!list) return null;

    const idSet = new Set(itemIds);
    list.items = list.items.map(item => {
      if (idSet.has(item.id)) {
        return { ...item, isPurchased: true, purchasedBy };
      }
      return item;
    });

    return this.updateGroceryList(listId, { items: list.items });
  }

  async updateStatus(listId: string, status: GroceryListStatus): Promise<GroceryList | null> {
    return this.updateGroceryList(listId, { status });
  }

  async setStoreSortedItems(listId: string, sorted: Record<string, StoreSortedItems>): Promise<GroceryList | null> {
    return this.updateGroceryList(listId, { storeSortedItems: sorted });
  }

  private rowToGroceryList(row: GroceryListRow): GroceryList {
    return {
      id: row.id,
      familyGroupId: row.family_group_id,
      mealPlanId: row.meal_plan_id ?? undefined,
      items: JSON.parse(row.items) as GroceryItem[],
      storeSortedItems: row.store_sorted_items
        ? (JSON.parse(row.store_sorted_items) as Record<string, StoreSortedItems>)
        : undefined,
      status: row.status as GroceryListStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ============================================================================
// In-Memory Implementations
// ============================================================================

export class InMemoryMealPlanStore implements MealPlanStore {
  private plans = new Map<string, MealPlan>();

  async initialize(): Promise<void> {}

  async createMealPlan(plan: Omit<MealPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealPlan> {
    const now = Date.now();
    const id = randomUUID();

    const newPlan: MealPlan = {
      ...plan,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.plans.set(id, newPlan);
    return newPlan;
  }

  async getMealPlan(id: string): Promise<MealPlan | null> {
    return this.plans.get(id) ?? null;
  }

  async updateMealPlan(id: string, updates: Partial<Omit<MealPlan, 'id' | 'createdAt'>>): Promise<MealPlan | null> {
    const existing = this.plans.get(id);
    if (!existing) return null;

    const updated: MealPlan = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.plans.set(id, updated);
    return updated;
  }

  async deleteMealPlan(id: string): Promise<boolean> {
    return this.plans.delete(id);
  }

  async listMealPlans(options: MealPlanQueryOptions): Promise<MealPlan[]> {
    let plans = Array.from(this.plans.values())
      .filter(p => p.familyGroupId === options.familyGroupId);

    if (options.startDate !== undefined) {
      plans = plans.filter(p => p.weekStartDate >= options.startDate!);
    }

    if (options.endDate !== undefined) {
      plans = plans.filter(p => p.weekStartDate <= options.endDate!);
    }

    const orderDir = options.orderDirection || 'desc';
    plans.sort((a, b) => orderDir === 'desc' ? b.weekStartDate - a.weekStartDate : a.weekStartDate - b.weekStartDate);

    if (options.offset) {
      plans = plans.slice(options.offset);
    }
    if (options.limit) {
      plans = plans.slice(0, options.limit);
    }

    return plans;
  }

  async getMealPlanByWeek(familyGroupId: string, weekStartDate: number): Promise<MealPlan | null> {
    return Array.from(this.plans.values()).find(
      p => p.familyGroupId === familyGroupId && p.weekStartDate === weekStartDate
    ) ?? null;
  }

  async getCurrentMealPlan(familyGroupId: string): Promise<MealPlan | null> {
    const now = Date.now();
    const weekStart = this.getWeekStart(now);
    return this.getMealPlanByWeek(familyGroupId, weekStart);
  }

  async setMeal(planId: string, date: number, mealType: keyof DayMeals, meal: DayMeals[keyof DayMeals]): Promise<MealPlan | null> {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    if (!plan.meals[date]) {
      plan.meals[date] = {};
    }

    if (mealType === 'snacks' && meal) {
      const currentSnacks = plan.meals[date].snacks || [];
      plan.meals[date].snacks = [...currentSnacks, meal as PlannedMeal];
    } else {
      (plan.meals[date] as Record<string, unknown>)[mealType] = meal;
    }

    plan.updatedAt = Date.now();
    return plan;
  }

  async removeMeal(planId: string, date: number, mealType: keyof DayMeals): Promise<MealPlan | null> {
    const plan = this.plans.get(planId);
    if (!plan || !plan.meals[date]) return plan ?? null;

    delete (plan.meals[date] as Record<string, unknown>)[mealType];
    plan.updatedAt = Date.now();

    return plan;
  }

  private getWeekStart(timestamp: number): number {
    const date = new Date(timestamp);
    const day = date.getDay();
    const diff = date.getDate() - day;
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }
}

export class InMemoryGroceryListStore implements GroceryListStore {
  private lists = new Map<string, GroceryList>();

  async initialize(): Promise<void> {}

  async createGroceryList(list: Omit<GroceryList, 'id' | 'createdAt' | 'updatedAt'>): Promise<GroceryList> {
    const now = Date.now();
    const id = randomUUID();

    const newList: GroceryList = {
      ...list,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.lists.set(id, newList);
    return newList;
  }

  async getGroceryList(id: string): Promise<GroceryList | null> {
    return this.lists.get(id) ?? null;
  }

  async updateGroceryList(id: string, updates: Partial<Omit<GroceryList, 'id' | 'createdAt'>>): Promise<GroceryList | null> {
    const existing = this.lists.get(id);
    if (!existing) return null;

    const updated: GroceryList = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.lists.set(id, updated);
    return updated;
  }

  async deleteGroceryList(id: string): Promise<boolean> {
    return this.lists.delete(id);
  }

  async listGroceryLists(options: GroceryListQueryOptions): Promise<GroceryList[]> {
    let lists = Array.from(this.lists.values())
      .filter(l => l.familyGroupId === options.familyGroupId);

    if (options.status) {
      lists = lists.filter(l => l.status === options.status);
    }

    if (options.mealPlanId) {
      lists = lists.filter(l => l.mealPlanId === options.mealPlanId);
    }

    const orderDir = options.orderDirection || 'desc';
    lists.sort((a, b) => orderDir === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);

    if (options.offset) {
      lists = lists.slice(options.offset);
    }
    if (options.limit) {
      lists = lists.slice(0, options.limit);
    }

    return lists;
  }

  async getActiveList(familyGroupId: string): Promise<GroceryList | null> {
    const lists = Array.from(this.lists.values())
      .filter(l => l.familyGroupId === familyGroupId && l.status === 'active')
      .sort((a, b) => b.createdAt - a.createdAt);

    return lists[0] ?? null;
  }

  async getListByMealPlan(mealPlanId: string): Promise<GroceryList | null> {
    const lists = Array.from(this.lists.values())
      .filter(l => l.mealPlanId === mealPlanId)
      .sort((a, b) => b.createdAt - a.createdAt);

    return lists[0] ?? null;
  }

  async addItem(listId: string, item: Omit<GroceryItem, 'id'>): Promise<GroceryList | null> {
    const list = this.lists.get(listId);
    if (!list) return null;

    const newItem: GroceryItem = {
      ...item,
      id: randomUUID(),
    };

    list.items.push(newItem);
    list.updatedAt = Date.now();
    return list;
  }

  async updateItem(listId: string, itemId: string, updates: Partial<GroceryItem>): Promise<GroceryList | null> {
    const list = this.lists.get(listId);
    if (!list) return null;

    const itemIndex = list.items.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return null;

    list.items[itemIndex] = {
      ...list.items[itemIndex],
      ...updates,
    };
    list.updatedAt = Date.now();

    return list;
  }

  async removeItem(listId: string, itemId: string): Promise<GroceryList | null> {
    const list = this.lists.get(listId);
    if (!list) return null;

    list.items = list.items.filter(i => i.id !== itemId);
    list.updatedAt = Date.now();
    return list;
  }

  async markItemPurchased(listId: string, itemId: string, purchasedBy: string): Promise<GroceryList | null> {
    return this.updateItem(listId, itemId, { isPurchased: true, purchasedBy });
  }

  async bulkMarkPurchased(listId: string, itemIds: string[], purchasedBy: string): Promise<GroceryList | null> {
    const list = this.lists.get(listId);
    if (!list) return null;

    const idSet = new Set(itemIds);
    list.items = list.items.map(item => {
      if (idSet.has(item.id)) {
        return { ...item, isPurchased: true, purchasedBy };
      }
      return item;
    });

    list.updatedAt = Date.now();
    return list;
  }

  async updateStatus(listId: string, status: GroceryListStatus): Promise<GroceryList | null> {
    return this.updateGroceryList(listId, { status });
  }

  async setStoreSortedItems(listId: string, sorted: Record<string, StoreSortedItems>): Promise<GroceryList | null> {
    return this.updateGroceryList(listId, { storeSortedItems: sorted });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createMealPlanStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): MealPlanStore {
  if (type === 'database' && dbAdapter) {
    return new DatabaseMealPlanStore(dbAdapter);
  }
  return new InMemoryMealPlanStore();
}

export function createGroceryListStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): GroceryListStore {
  if (type === 'database' && dbAdapter) {
    return new DatabaseGroceryListStore(dbAdapter);
  }
  return new InMemoryGroceryListStore();
}
