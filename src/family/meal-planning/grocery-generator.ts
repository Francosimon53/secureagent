/**
 * Grocery List Generator
 *
 * Generates grocery lists from meal plans with store and aisle sorting.
 */

import { randomUUID } from 'crypto';
import type {
  GroceryItem,
  GroceryList,
  MealPlan,
  PlannedMeal,
  Recipe,
  RecipeIngredient,
  StoreSortedItems,
} from '../types.js';
import type { RecipeStore } from '../stores/recipe-store.js';

// ============================================================================
// Configuration
// ============================================================================

export interface GroceryGeneratorConfig {
  defaultCategories: string[];
  categoryMappings: Record<string, string>;
  aisleMappings: Record<string, Record<string, string>>; // store -> category -> aisle
  defaultStore?: string;
  enablePriceEstimates: boolean;
  priceDatabase?: Record<string, number>; // item name -> estimated price
}

const DEFAULT_CATEGORY_MAPPINGS: Record<string, string> = {
  // Produce
  apple: 'produce', banana: 'produce', orange: 'produce', lettuce: 'produce',
  tomato: 'produce', potato: 'produce', onion: 'produce', carrot: 'produce',
  broccoli: 'produce', spinach: 'produce', cucumber: 'produce', pepper: 'produce',
  garlic: 'produce', ginger: 'produce', lemon: 'produce', lime: 'produce',
  avocado: 'produce', celery: 'produce', mushroom: 'produce',

  // Dairy
  milk: 'dairy', cheese: 'dairy', butter: 'dairy', yogurt: 'dairy',
  cream: 'dairy', 'sour cream': 'dairy', 'cream cheese': 'dairy', egg: 'dairy',

  // Meat
  chicken: 'meat', beef: 'meat', pork: 'meat', turkey: 'meat',
  bacon: 'meat', sausage: 'meat', ham: 'meat', 'ground beef': 'meat',

  // Bakery
  bread: 'bakery', bun: 'bakery', roll: 'bakery', bagel: 'bakery',
  tortilla: 'bakery', croissant: 'bakery', muffin: 'bakery',

  // Frozen
  'ice cream': 'frozen', 'frozen vegetable': 'frozen', 'frozen fruit': 'frozen',
  'frozen pizza': 'frozen', 'frozen dinner': 'frozen',

  // Canned
  'canned tomato': 'canned', 'tomato sauce': 'canned', 'tomato paste': 'canned',
  beans: 'canned', 'canned bean': 'canned', soup: 'canned', broth: 'canned',
  stock: 'canned', 'coconut milk': 'canned',

  // Dry goods
  pasta: 'dry goods', rice: 'dry goods', flour: 'dry goods', sugar: 'dry goods',
  cereal: 'dry goods', oat: 'dry goods', 'olive oil': 'dry goods', oil: 'dry goods',
  vinegar: 'dry goods', 'soy sauce': 'dry goods', spice: 'dry goods',
  salt: 'dry goods', 'black pepper': 'dry goods', 'baking powder': 'dry goods',
  'baking soda': 'dry goods', vanilla: 'dry goods',

  // Beverages
  juice: 'beverages', soda: 'beverages', water: 'beverages', coffee: 'beverages',
  tea: 'beverages', 'almond milk': 'beverages', 'oat milk': 'beverages',

  // Snacks
  chip: 'snacks', cracker: 'snacks', cookie: 'snacks', nut: 'snacks',
  popcorn: 'snacks', pretzel: 'snacks', 'granola bar': 'snacks',

  // Condiments
  ketchup: 'condiments', mustard: 'condiments', mayonnaise: 'condiments',
  'hot sauce': 'condiments', salsa: 'condiments', dressing: 'condiments',
};

// ============================================================================
// Grocery Generator
// ============================================================================

export class GroceryGenerator {
  private readonly config: GroceryGeneratorConfig;
  private readonly recipeStore?: RecipeStore;

  constructor(config?: Partial<GroceryGeneratorConfig>, recipeStore?: RecipeStore) {
    this.config = {
      defaultCategories: config?.defaultCategories || [
        'produce', 'dairy', 'meat', 'bakery', 'frozen',
        'canned', 'dry goods', 'beverages', 'snacks', 'condiments', 'other',
      ],
      categoryMappings: {
        ...DEFAULT_CATEGORY_MAPPINGS,
        ...config?.categoryMappings,
      },
      aisleMappings: config?.aisleMappings || {},
      defaultStore: config?.defaultStore,
      enablePriceEstimates: config?.enablePriceEstimates || false,
      priceDatabase: config?.priceDatabase,
    };
    this.recipeStore = recipeStore;
  }

  /**
   * Generate a grocery list from a meal plan
   */
  async generateFromMealPlan(mealPlan: MealPlan): Promise<GroceryList> {
    const ingredients: Map<string, AggregatedIngredient> = new Map();

    // Collect all meals
    const meals = this.extractMeals(mealPlan);

    // Get ingredients from each meal
    for (const meal of meals) {
      if (meal.recipeId && this.recipeStore) {
        const recipe = await this.recipeStore.getRecipe(meal.recipeId);
        if (recipe) {
          this.aggregateIngredients(ingredients, recipe.ingredients, meal.servings / recipe.servings);
        }
      }
    }

    // Convert to grocery items
    const items = this.convertToGroceryItems(ingredients);

    return {
      id: '', // Will be set by store
      familyGroupId: mealPlan.familyGroupId,
      mealPlanId: mealPlan.id,
      items,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Generate a grocery list from a list of recipes
   */
  async generateFromRecipes(
    familyGroupId: string,
    recipeIds: string[],
    servingsMultiplier = 1
  ): Promise<GroceryList> {
    const ingredients: Map<string, AggregatedIngredient> = new Map();

    if (this.recipeStore) {
      for (const recipeId of recipeIds) {
        const recipe = await this.recipeStore.getRecipe(recipeId);
        if (recipe) {
          this.aggregateIngredients(ingredients, recipe.ingredients, servingsMultiplier);
        }
      }
    }

    const items = this.convertToGroceryItems(ingredients);

    return {
      id: '',
      familyGroupId,
      items,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Add items to an existing grocery list
   */
  addItemsToList(list: GroceryList, newItems: Omit<GroceryItem, 'id'>[]): GroceryList {
    const existingItems = new Map(list.items.map(i => [this.normalizeItemName(i.name), i]));

    for (const newItem of newItems) {
      const normalized = this.normalizeItemName(newItem.name);
      const existing = existingItems.get(normalized);

      if (existing && existing.unit === newItem.unit) {
        // Merge quantities
        existing.quantity += newItem.quantity;
      } else {
        // Add new item
        const item: GroceryItem = {
          ...newItem,
          id: randomUUID(),
        };
        list.items.push(item);
        existingItems.set(normalized, item);
      }
    }

    list.updatedAt = Date.now();
    return list;
  }

  /**
   * Sort grocery list items by store and aisle
   */
  sortByStoreAndAisle(list: GroceryList, stores?: string[]): Record<string, StoreSortedItems> {
    const storesToSort = stores || [this.config.defaultStore || 'Default Store'];
    const result: Record<string, StoreSortedItems> = {};

    for (const storeName of storesToSort) {
      const storeAisles = this.config.aisleMappings[storeName] || {};
      const aisles: Record<string, GroceryItem[]> = {};
      const uncategorized: GroceryItem[] = [];

      for (const item of list.items) {
        const aisle = storeAisles[item.category] || item.aisle;

        if (aisle) {
          if (!aisles[aisle]) {
            aisles[aisle] = [];
          }
          aisles[aisle].push({ ...item, store: storeName, aisle });
        } else {
          uncategorized.push({ ...item, store: storeName });
        }
      }

      // Sort items within each aisle alphabetically
      for (const aisle of Object.keys(aisles)) {
        aisles[aisle].sort((a, b) => a.name.localeCompare(b.name));
      }

      // Calculate estimated total
      let estimatedTotal = 0;
      if (this.config.enablePriceEstimates) {
        for (const item of list.items) {
          estimatedTotal += item.estimatedPrice || 0;
        }
      }

      result[storeName] = {
        storeName,
        aisles,
        uncategorized,
        estimatedTotal,
      };
    }

    return result;
  }

  /**
   * Categorize an item by name
   */
  categorizeItem(itemName: string): string {
    const normalized = itemName.toLowerCase();

    // Check exact matches first
    for (const [keyword, category] of Object.entries(this.config.categoryMappings)) {
      if (normalized === keyword || normalized.includes(keyword)) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Estimate price for an item
   */
  estimatePrice(itemName: string, quantity: number): number | undefined {
    if (!this.config.enablePriceEstimates || !this.config.priceDatabase) {
      return undefined;
    }

    const normalized = this.normalizeItemName(itemName);
    const unitPrice = this.config.priceDatabase[normalized];

    if (unitPrice) {
      return unitPrice * quantity;
    }

    // Try partial matches
    for (const [name, price] of Object.entries(this.config.priceDatabase)) {
      if (normalized.includes(name) || name.includes(normalized)) {
        return price * quantity;
      }
    }

    return undefined;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private extractMeals(mealPlan: MealPlan): PlannedMeal[] {
    const meals: PlannedMeal[] = [];

    for (const dayMeals of Object.values(mealPlan.meals)) {
      if (dayMeals.breakfast) meals.push(dayMeals.breakfast);
      if (dayMeals.lunch) meals.push(dayMeals.lunch);
      if (dayMeals.dinner) meals.push(dayMeals.dinner);
      if (dayMeals.snacks) meals.push(...dayMeals.snacks);
    }

    return meals;
  }

  private aggregateIngredients(
    aggregated: Map<string, AggregatedIngredient>,
    ingredients: RecipeIngredient[],
    multiplier: number
  ): void {
    for (const ingredient of ingredients) {
      if (ingredient.optional) continue;

      const key = this.getIngredientKey(ingredient);
      const existing = aggregated.get(key);

      if (existing) {
        existing.amount += ingredient.amount * multiplier;
      } else {
        aggregated.set(key, {
          name: ingredient.name,
          amount: ingredient.amount * multiplier,
          unit: ingredient.unit,
          notes: ingredient.notes,
        });
      }
    }
  }

  private getIngredientKey(ingredient: RecipeIngredient): string {
    return `${this.normalizeItemName(ingredient.name)}:${ingredient.unit}`;
  }

  private normalizeItemName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private convertToGroceryItems(ingredients: Map<string, AggregatedIngredient>): GroceryItem[] {
    const items: GroceryItem[] = [];

    for (const [, ingredient] of ingredients) {
      const category = this.categorizeItem(ingredient.name);
      const quantity = this.roundQuantity(ingredient.amount);

      items.push({
        id: randomUUID(),
        name: ingredient.name,
        quantity,
        unit: ingredient.unit,
        category,
        estimatedPrice: this.estimatePrice(ingredient.name, quantity),
        isPurchased: false,
      });
    }

    // Sort by category, then by name
    items.sort((a, b) => {
      const categoryCompare = a.category.localeCompare(b.category);
      if (categoryCompare !== 0) return categoryCompare;
      return a.name.localeCompare(b.name);
    });

    return items;
  }

  private roundQuantity(amount: number): number {
    // Round to reasonable increments
    if (amount < 1) {
      return Math.ceil(amount * 4) / 4; // Round up to nearest 0.25
    }
    if (amount < 10) {
      return Math.ceil(amount * 2) / 2; // Round up to nearest 0.5
    }
    return Math.ceil(amount);
  }
}

// ============================================================================
// Helper Types
// ============================================================================

interface AggregatedIngredient {
  name: string;
  amount: number;
  unit: string;
  notes?: string;
}

// ============================================================================
// Factory Function
// ============================================================================

export function createGroceryGenerator(
  config?: Partial<GroceryGeneratorConfig>,
  recipeStore?: RecipeStore
): GroceryGenerator {
  return new GroceryGenerator(config, recipeStore);
}
