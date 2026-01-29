/**
 * Meal Planning Service
 *
 * Service for managing meal plans and grocery lists.
 */

import { randomUUID } from 'crypto';
import type {
  DayMeals,
  FamilyGroup,
  GroceryList,
  MealPlan,
  MealPlanQueryOptions,
  MealType,
  PlannedMeal,
  StoreSortedItems,
} from '../types.js';
import type { FamilyGroupStore } from '../stores/family-group-store.js';
import type { GroceryListStore, MealPlanStore } from '../stores/meal-plan-store.js';
import type { RecipeStore } from '../stores/recipe-store.js';
import { GroceryGenerator, type GroceryGeneratorConfig } from './grocery-generator.js';

// ============================================================================
// Service Configuration
// ============================================================================

export interface MealPlanningServiceConfig {
  defaultServings: number;
  weekStartDay: 'sunday' | 'monday';
  groceryGenerator?: Partial<GroceryGeneratorConfig>;
}

// ============================================================================
// Meal Planning Service
// ============================================================================

export class MealPlanningService {
  private readonly mealPlanStore: MealPlanStore;
  private readonly groceryListStore: GroceryListStore;
  private readonly familyGroupStore: FamilyGroupStore;
  private readonly recipeStore?: RecipeStore;
  private readonly groceryGenerator: GroceryGenerator;
  private readonly config: MealPlanningServiceConfig;

  constructor(
    mealPlanStore: MealPlanStore,
    groceryListStore: GroceryListStore,
    familyGroupStore: FamilyGroupStore,
    recipeStore?: RecipeStore,
    config?: Partial<MealPlanningServiceConfig>
  ) {
    this.mealPlanStore = mealPlanStore;
    this.groceryListStore = groceryListStore;
    this.familyGroupStore = familyGroupStore;
    this.recipeStore = recipeStore;
    this.config = {
      defaultServings: config?.defaultServings || 4,
      weekStartDay: config?.weekStartDay || 'sunday',
      groceryGenerator: config?.groceryGenerator,
    };
    this.groceryGenerator = new GroceryGenerator(config?.groceryGenerator, recipeStore);
  }

  // ============================================================================
  // Meal Plan Management
  // ============================================================================

  /**
   * Create a new meal plan for a week
   */
  async createMealPlan(
    familyGroupId: string,
    createdBy: string,
    weekStartDate?: Date
  ): Promise<MealPlan> {
    const weekStart = weekStartDate || this.getWeekStart(new Date());

    return this.mealPlanStore.createMealPlan({
      familyGroupId,
      createdBy,
      weekStartDate: weekStart.getTime(),
      meals: {},
    });
  }

  /**
   * Get meal plan for a specific week
   */
  async getMealPlan(id: string): Promise<MealPlan | null> {
    return this.mealPlanStore.getMealPlan(id);
  }

  /**
   * Get meal plan by week
   */
  async getMealPlanByWeek(familyGroupId: string, weekStartDate: Date): Promise<MealPlan | null> {
    const weekStart = this.getWeekStart(weekStartDate);
    return this.mealPlanStore.getMealPlanByWeek(familyGroupId, weekStart.getTime());
  }

  /**
   * Get current week's meal plan, creating if it doesn't exist
   */
  async getCurrentMealPlan(familyGroupId: string, createdBy: string): Promise<MealPlan> {
    const existing = await this.mealPlanStore.getCurrentMealPlan(familyGroupId);
    if (existing) return existing;

    return this.createMealPlan(familyGroupId, createdBy);
  }

  /**
   * List meal plans for a family
   */
  async listMealPlans(options: MealPlanQueryOptions): Promise<MealPlan[]> {
    return this.mealPlanStore.listMealPlans(options);
  }

  /**
   * Update a meal plan
   */
  async updateMealPlan(
    id: string,
    updates: Partial<Pick<MealPlan, 'meals' | 'notes'>>
  ): Promise<MealPlan | null> {
    return this.mealPlanStore.updateMealPlan(id, updates);
  }

  /**
   * Delete a meal plan
   */
  async deleteMealPlan(id: string): Promise<boolean> {
    return this.mealPlanStore.deleteMealPlan(id);
  }

  // ============================================================================
  // Meal Management
  // ============================================================================

  /**
   * Add a meal to a specific day in the plan
   */
  async addMeal(
    planId: string,
    date: Date,
    mealType: MealType,
    meal: Omit<PlannedMeal, 'id'>
  ): Promise<MealPlan | null> {
    const plan = await this.mealPlanStore.getMealPlan(planId);
    if (!plan) return null;

    const dateKey = this.getDateKey(date);
    const plannedMeal: PlannedMeal = {
      ...meal,
      id: randomUUID(),
    };

    // Convert 'snack' to 'snacks' for store compatibility
    const storeMealType = mealType === 'snack' ? 'snacks' : mealType as keyof DayMeals;
    return this.mealPlanStore.setMeal(planId, dateKey, storeMealType, plannedMeal);
  }

  /**
   * Update a meal
   */
  async updateMeal(
    planId: string,
    date: Date,
    mealType: MealType,
    updates: Partial<PlannedMeal>
  ): Promise<MealPlan | null> {
    const plan = await this.mealPlanStore.getMealPlan(planId);
    if (!plan) return null;

    const dateKey = this.getDateKey(date);
    const dayMeals = plan.meals[dateKey];

    if (!dayMeals) return plan;

    const currentMeal = mealType === 'snack'
      ? dayMeals.snacks?.[0]
      : dayMeals[mealType as keyof Omit<DayMeals, 'snacks'>];

    if (!currentMeal) return plan;

    const updatedMeal: PlannedMeal = {
      ...currentMeal,
      ...updates,
    };

    // Convert 'snack' to 'snacks' for store compatibility
    const storeMealType = mealType === 'snack' ? 'snacks' : mealType as keyof DayMeals;
    return this.mealPlanStore.setMeal(planId, dateKey, storeMealType, updatedMeal);
  }

  /**
   * Remove a meal from the plan
   */
  async removeMeal(planId: string, date: Date, mealType: MealType): Promise<MealPlan | null> {
    const dateKey = this.getDateKey(date);
    // Convert 'snack' to 'snacks' for store compatibility
    const storeMealType = mealType === 'snack' ? 'snacks' : mealType as keyof DayMeals;
    return this.mealPlanStore.removeMeal(planId, dateKey, storeMealType);
  }

  /**
   * Copy a meal to another day
   */
  async copyMeal(
    planId: string,
    fromDate: Date,
    fromMealType: MealType,
    toDate: Date,
    toMealType: MealType
  ): Promise<MealPlan | null> {
    const plan = await this.mealPlanStore.getMealPlan(planId);
    if (!plan) return null;

    const fromDateKey = this.getDateKey(fromDate);
    const dayMeals = plan.meals[fromDateKey];

    if (!dayMeals) return plan;

    const sourceMeal = fromMealType === 'snack'
      ? dayMeals.snacks?.[0]
      : dayMeals[fromMealType as keyof Omit<DayMeals, 'snacks'>];

    if (!sourceMeal) return plan;

    return this.addMeal(planId, toDate, toMealType, {
      name: sourceMeal.name,
      recipeId: sourceMeal.recipeId,
      servings: sourceMeal.servings,
      assignedTo: sourceMeal.assignedTo,
      notes: sourceMeal.notes,
    });
  }

  // ============================================================================
  // Grocery List Management
  // ============================================================================

  /**
   * Generate a grocery list from a meal plan
   */
  async generateGroceryList(planId: string): Promise<GroceryList> {
    const plan = await this.mealPlanStore.getMealPlan(planId);
    if (!plan) {
      throw new Error(`Meal plan not found: ${planId}`);
    }

    const groceryList = await this.groceryGenerator.generateFromMealPlan(plan);
    return this.groceryListStore.createGroceryList(groceryList);
  }

  /**
   * Get active grocery list for a family
   */
  async getActiveGroceryList(familyGroupId: string): Promise<GroceryList | null> {
    return this.groceryListStore.getActiveList(familyGroupId);
  }

  /**
   * Get grocery list by ID
   */
  async getGroceryList(id: string): Promise<GroceryList | null> {
    return this.groceryListStore.getGroceryList(id);
  }

  /**
   * Sort grocery list by store and aisle
   */
  async sortGroceryList(listId: string, stores?: string[]): Promise<GroceryList | null> {
    const list = await this.groceryListStore.getGroceryList(listId);
    if (!list) return null;

    const sorted = this.groceryGenerator.sortByStoreAndAisle(list, stores);
    return this.groceryListStore.setStoreSortedItems(listId, sorted);
  }

  /**
   * Add item to grocery list
   */
  async addGroceryItem(
    listId: string,
    item: { name: string; quantity: number; unit: string; category?: string }
  ): Promise<GroceryList | null> {
    const category = item.category || this.groceryGenerator.categorizeItem(item.name);

    return this.groceryListStore.addItem(listId, {
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category,
      isPurchased: false,
    });
  }

  /**
   * Mark item as purchased
   */
  async markItemPurchased(
    listId: string,
    itemId: string,
    purchasedBy: string
  ): Promise<GroceryList | null> {
    return this.groceryListStore.markItemPurchased(listId, itemId, purchasedBy);
  }

  /**
   * Mark multiple items as purchased
   */
  async markItemsPurchased(
    listId: string,
    itemIds: string[],
    purchasedBy: string
  ): Promise<GroceryList | null> {
    return this.groceryListStore.bulkMarkPurchased(listId, itemIds, purchasedBy);
  }

  /**
   * Remove item from grocery list
   */
  async removeGroceryItem(listId: string, itemId: string): Promise<GroceryList | null> {
    return this.groceryListStore.removeItem(listId, itemId);
  }

  /**
   * Complete grocery list
   */
  async completeGroceryList(listId: string): Promise<GroceryList | null> {
    return this.groceryListStore.updateStatus(listId, 'completed');
  }

  /**
   * Archive grocery list
   */
  async archiveGroceryList(listId: string): Promise<GroceryList | null> {
    return this.groceryListStore.updateStatus(listId, 'archived');
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private getWeekStart(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const targetDay = this.config.weekStartDay === 'monday' ? 1 : 0;
    const diff = day >= targetDay ? day - targetDay : 7 - (targetDay - day);

    result.setDate(result.getDate() - diff);
    result.setHours(0, 0, 0, 0);

    return result;
  }

  private getDateKey(date: Date): number {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized.getTime();
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  GroceryGenerator,
  type GroceryGeneratorConfig,
  createGroceryGenerator,
} from './grocery-generator.js';

export function createMealPlanningService(
  mealPlanStore: MealPlanStore,
  groceryListStore: GroceryListStore,
  familyGroupStore: FamilyGroupStore,
  recipeStore?: RecipeStore,
  config?: Partial<MealPlanningServiceConfig>
): MealPlanningService {
  return new MealPlanningService(
    mealPlanStore,
    groceryListStore,
    familyGroupStore,
    recipeStore,
    config
  );
}
