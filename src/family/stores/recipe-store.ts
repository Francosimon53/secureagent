/**
 * Recipe Store
 *
 * Persistence layer for recipes and available ingredients (pantry).
 */

import { randomUUID } from 'crypto';
import type {
  AvailableIngredient,
  DatabaseAdapter,
  DietaryInfo,
  IngredientQueryOptions,
  NutritionInfo,
  Recipe,
  RecipeCategory,
  RecipeDifficulty,
  RecipeIngredient,
  RecipeQueryOptions,
} from '../types.js';

// ============================================================================
// Recipe Store Interface
// ============================================================================

export interface RecipeStore {
  initialize(): Promise<void>;

  // CRUD
  createRecipe(recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>): Promise<Recipe>;
  getRecipe(id: string): Promise<Recipe | null>;
  updateRecipe(id: string, updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>): Promise<Recipe | null>;
  deleteRecipe(id: string): Promise<boolean>;

  // Query
  listRecipes(options?: RecipeQueryOptions): Promise<Recipe[]>;
  searchRecipes(searchTerm: string, options?: RecipeQueryOptions): Promise<Recipe[]>;
  getFavorites(familyGroupId: string): Promise<Recipe[]>;
  getByCategory(category: RecipeCategory, options?: RecipeQueryOptions): Promise<Recipe[]>;

  // Recipe actions
  markCooked(id: string): Promise<Recipe | null>;
  toggleFavorite(id: string): Promise<Recipe | null>;
  updateRating(id: string, rating: number): Promise<Recipe | null>;
}

// ============================================================================
// Available Ingredient Store Interface
// ============================================================================

export interface AvailableIngredientStore {
  initialize(): Promise<void>;

  // CRUD
  addIngredient(ingredient: Omit<AvailableIngredient, 'id' | 'createdAt' | 'updatedAt'>): Promise<AvailableIngredient>;
  getIngredient(id: string): Promise<AvailableIngredient | null>;
  updateIngredient(id: string, updates: Partial<Omit<AvailableIngredient, 'id' | 'createdAt'>>): Promise<AvailableIngredient | null>;
  removeIngredient(id: string): Promise<boolean>;

  // Query
  listIngredients(options: IngredientQueryOptions): Promise<AvailableIngredient[]>;
  getExpiringIngredients(familyGroupId: string, withinDays: number): Promise<AvailableIngredient[]>;
  searchIngredients(familyGroupId: string, searchTerm: string): Promise<AvailableIngredient[]>;

  // Bulk operations
  bulkAdd(ingredients: Omit<AvailableIngredient, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<AvailableIngredient[]>;
  bulkRemove(ids: string[]): Promise<number>;
  clearExpired(familyGroupId: string): Promise<number>;
}

// ============================================================================
// Database Row Types
// ============================================================================

interface RecipeRow {
  id: string;
  family_group_id: string | null;
  added_by: string | null;
  name: string;
  description: string | null;
  cuisine: string | null;
  category: string;
  ingredients: string;
  instructions: string;
  prep_time: number;
  cook_time: number;
  servings: number;
  difficulty: string;
  dietary_info: string;
  nutrition_info: string | null;
  image_url: string | null;
  source_url: string | null;
  rating: number | null;
  times_cooked: number;
  last_cooked_at: number | null;
  is_favorite: number;
  tags: string | null;
  created_at: number;
  updated_at: number;
}

interface IngredientRow {
  id: string;
  family_group_id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  expires_at: number | null;
  added_by: string;
  created_at: number;
  updated_at: number;
}

// ============================================================================
// Database Recipe Store
// ============================================================================

export class DatabaseRecipeStore implements RecipeStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY,
        family_group_id TEXT,
        added_by TEXT,
        name TEXT NOT NULL,
        description TEXT,
        cuisine TEXT,
        category TEXT NOT NULL,
        ingredients TEXT NOT NULL,
        instructions TEXT NOT NULL,
        prep_time INTEGER NOT NULL,
        cook_time INTEGER NOT NULL,
        servings INTEGER NOT NULL,
        difficulty TEXT NOT NULL,
        dietary_info TEXT NOT NULL,
        nutrition_info TEXT,
        image_url TEXT,
        source_url TEXT,
        rating REAL,
        times_cooked INTEGER DEFAULT 0,
        last_cooked_at INTEGER,
        is_favorite INTEGER DEFAULT 0,
        tags TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_recipes_family ON recipes(family_group_id)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category)
    `);
  }

  async createRecipe(recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>): Promise<Recipe> {
    const now = Date.now();
    const id = randomUUID();

    const newRecipe: Recipe = {
      ...recipe,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO recipes (
        id, family_group_id, added_by, name, description, cuisine, category,
        ingredients, instructions, prep_time, cook_time, servings, difficulty,
        dietary_info, nutrition_info, image_url, source_url, rating, times_cooked,
        last_cooked_at, is_favorite, tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newRecipe.id,
        newRecipe.familyGroupId ?? null,
        newRecipe.addedBy ?? null,
        newRecipe.name,
        newRecipe.description ?? null,
        newRecipe.cuisine ?? null,
        newRecipe.category,
        JSON.stringify(newRecipe.ingredients),
        JSON.stringify(newRecipe.instructions),
        newRecipe.prepTime,
        newRecipe.cookTime,
        newRecipe.servings,
        newRecipe.difficulty,
        JSON.stringify(newRecipe.dietaryInfo),
        newRecipe.nutritionInfo ? JSON.stringify(newRecipe.nutritionInfo) : null,
        newRecipe.imageUrl ?? null,
        newRecipe.sourceUrl ?? null,
        newRecipe.rating ?? null,
        newRecipe.timesCooked,
        newRecipe.lastCookedAt ?? null,
        newRecipe.isFavorite ? 1 : 0,
        newRecipe.tags ? JSON.stringify(newRecipe.tags) : null,
        newRecipe.createdAt,
        newRecipe.updatedAt,
      ]
    );

    return newRecipe;
  }

  async getRecipe(id: string): Promise<Recipe | null> {
    const { rows } = await this.db.query<RecipeRow>(
      'SELECT * FROM recipes WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.rowToRecipe(rows[0]);
  }

  async updateRecipe(id: string, updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>): Promise<Recipe | null> {
    const existing = await this.getRecipe(id);
    if (!existing) return null;

    const updated: Recipe = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `UPDATE recipes SET
        name = ?, description = ?, cuisine = ?, category = ?, ingredients = ?,
        instructions = ?, prep_time = ?, cook_time = ?, servings = ?, difficulty = ?,
        dietary_info = ?, nutrition_info = ?, image_url = ?, source_url = ?, rating = ?,
        times_cooked = ?, last_cooked_at = ?, is_favorite = ?, tags = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.description ?? null,
        updated.cuisine ?? null,
        updated.category,
        JSON.stringify(updated.ingredients),
        JSON.stringify(updated.instructions),
        updated.prepTime,
        updated.cookTime,
        updated.servings,
        updated.difficulty,
        JSON.stringify(updated.dietaryInfo),
        updated.nutritionInfo ? JSON.stringify(updated.nutritionInfo) : null,
        updated.imageUrl ?? null,
        updated.sourceUrl ?? null,
        updated.rating ?? null,
        updated.timesCooked,
        updated.lastCookedAt ?? null,
        updated.isFavorite ? 1 : 0,
        updated.tags ? JSON.stringify(updated.tags) : null,
        updated.updatedAt,
        id,
      ]
    );

    return updated;
  }

  async deleteRecipe(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM recipes WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async listRecipes(options?: RecipeQueryOptions): Promise<Recipe[]> {
    let sql = 'SELECT * FROM recipes WHERE 1=1';
    const params: unknown[] = [];

    if (options?.familyGroupId) {
      sql += ' AND (family_group_id = ? OR family_group_id IS NULL)';
      params.push(options.familyGroupId);
    }

    if (options?.category) {
      sql += ' AND category = ?';
      params.push(options.category);
    }

    if (options?.difficulty) {
      sql += ' AND difficulty = ?';
      params.push(options.difficulty);
    }

    if (options?.isFavorite !== undefined) {
      sql += ' AND is_favorite = ?';
      params.push(options.isFavorite ? 1 : 0);
    }

    const orderDir = options?.orderDirection || 'desc';
    sql += ` ORDER BY created_at ${orderDir}`;

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const { rows } = await this.db.query<RecipeRow>(sql, params);
    return rows.map(row => this.rowToRecipe(row));
  }

  async searchRecipes(searchTerm: string, options?: RecipeQueryOptions): Promise<Recipe[]> {
    const term = `%${searchTerm.toLowerCase()}%`;
    let sql = `SELECT * FROM recipes WHERE (
      LOWER(name) LIKE ? OR
      LOWER(description) LIKE ? OR
      LOWER(cuisine) LIKE ? OR
      LOWER(tags) LIKE ?
    )`;
    const params: unknown[] = [term, term, term, term];

    if (options?.familyGroupId) {
      sql += ' AND (family_group_id = ? OR family_group_id IS NULL)';
      params.push(options.familyGroupId);
    }

    if (options?.category) {
      sql += ' AND category = ?';
      params.push(options.category);
    }

    const orderDir = options?.orderDirection || 'desc';
    sql += ` ORDER BY created_at ${orderDir}`;

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const { rows } = await this.db.query<RecipeRow>(sql, params);
    return rows.map(row => this.rowToRecipe(row));
  }

  async getFavorites(familyGroupId: string): Promise<Recipe[]> {
    const { rows } = await this.db.query<RecipeRow>(
      `SELECT * FROM recipes WHERE is_favorite = 1 AND (family_group_id = ? OR family_group_id IS NULL) ORDER BY name`,
      [familyGroupId]
    );
    return rows.map(row => this.rowToRecipe(row));
  }

  async getByCategory(category: RecipeCategory, options?: RecipeQueryOptions): Promise<Recipe[]> {
    return this.listRecipes({ ...options, category });
  }

  async markCooked(id: string): Promise<Recipe | null> {
    const recipe = await this.getRecipe(id);
    if (!recipe) return null;

    return this.updateRecipe(id, {
      timesCooked: recipe.timesCooked + 1,
      lastCookedAt: Date.now(),
    });
  }

  async toggleFavorite(id: string): Promise<Recipe | null> {
    const recipe = await this.getRecipe(id);
    if (!recipe) return null;

    return this.updateRecipe(id, { isFavorite: !recipe.isFavorite });
  }

  async updateRating(id: string, rating: number): Promise<Recipe | null> {
    return this.updateRecipe(id, { rating: Math.max(0, Math.min(5, rating)) });
  }

  private rowToRecipe(row: RecipeRow): Recipe {
    return {
      id: row.id,
      familyGroupId: row.family_group_id ?? undefined,
      addedBy: row.added_by ?? undefined,
      name: row.name,
      description: row.description ?? undefined,
      cuisine: row.cuisine ?? undefined,
      category: row.category as RecipeCategory,
      ingredients: JSON.parse(row.ingredients) as RecipeIngredient[],
      instructions: JSON.parse(row.instructions) as string[],
      prepTime: row.prep_time,
      cookTime: row.cook_time,
      servings: row.servings,
      difficulty: row.difficulty as RecipeDifficulty,
      dietaryInfo: JSON.parse(row.dietary_info) as DietaryInfo,
      nutritionInfo: row.nutrition_info ? (JSON.parse(row.nutrition_info) as NutritionInfo) : undefined,
      imageUrl: row.image_url ?? undefined,
      sourceUrl: row.source_url ?? undefined,
      rating: row.rating ?? undefined,
      timesCooked: row.times_cooked,
      lastCookedAt: row.last_cooked_at ?? undefined,
      isFavorite: row.is_favorite === 1,
      tags: row.tags ? (JSON.parse(row.tags) as string[]) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ============================================================================
// Database Available Ingredient Store
// ============================================================================

export class DatabaseAvailableIngredientStore implements AvailableIngredientStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS available_ingredients (
        id TEXT PRIMARY KEY,
        family_group_id TEXT NOT NULL,
        name TEXT NOT NULL,
        amount REAL,
        unit TEXT,
        expires_at INTEGER,
        added_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_ingredients_family ON available_ingredients(family_group_id)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_ingredients_expires ON available_ingredients(expires_at)
    `);
  }

  async addIngredient(ingredient: Omit<AvailableIngredient, 'id' | 'createdAt' | 'updatedAt'>): Promise<AvailableIngredient> {
    const now = Date.now();
    const id = randomUUID();

    const newIngredient: AvailableIngredient = {
      ...ingredient,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO available_ingredients (id, family_group_id, name, amount, unit, expires_at, added_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newIngredient.id,
        newIngredient.familyGroupId,
        newIngredient.name,
        newIngredient.amount ?? null,
        newIngredient.unit ?? null,
        newIngredient.expiresAt ?? null,
        newIngredient.addedBy,
        newIngredient.createdAt,
        newIngredient.updatedAt,
      ]
    );

    return newIngredient;
  }

  async getIngredient(id: string): Promise<AvailableIngredient | null> {
    const { rows } = await this.db.query<IngredientRow>(
      'SELECT * FROM available_ingredients WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.rowToIngredient(rows[0]);
  }

  async updateIngredient(id: string, updates: Partial<Omit<AvailableIngredient, 'id' | 'createdAt'>>): Promise<AvailableIngredient | null> {
    const existing = await this.getIngredient(id);
    if (!existing) return null;

    const updated: AvailableIngredient = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `UPDATE available_ingredients SET name = ?, amount = ?, unit = ?, expires_at = ?, updated_at = ? WHERE id = ?`,
      [
        updated.name,
        updated.amount ?? null,
        updated.unit ?? null,
        updated.expiresAt ?? null,
        updated.updatedAt,
        id,
      ]
    );

    return updated;
  }

  async removeIngredient(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM available_ingredients WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async listIngredients(options: IngredientQueryOptions): Promise<AvailableIngredient[]> {
    let sql = 'SELECT * FROM available_ingredients WHERE family_group_id = ?';
    const params: unknown[] = [options.familyGroupId];

    if (options.expiringBefore !== undefined) {
      sql += ' AND expires_at IS NOT NULL AND expires_at <= ?';
      params.push(options.expiringBefore);
    }

    sql += ' ORDER BY name';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const { rows } = await this.db.query<IngredientRow>(sql, params);
    return rows.map(row => this.rowToIngredient(row));
  }

  async getExpiringIngredients(familyGroupId: string, withinDays: number): Promise<AvailableIngredient[]> {
    const expiresBeforeTimestamp = Date.now() + withinDays * 24 * 60 * 60 * 1000;

    const { rows } = await this.db.query<IngredientRow>(
      `SELECT * FROM available_ingredients
       WHERE family_group_id = ? AND expires_at IS NOT NULL AND expires_at <= ?
       ORDER BY expires_at`,
      [familyGroupId, expiresBeforeTimestamp]
    );

    return rows.map(row => this.rowToIngredient(row));
  }

  async searchIngredients(familyGroupId: string, searchTerm: string): Promise<AvailableIngredient[]> {
    const term = `%${searchTerm.toLowerCase()}%`;

    const { rows } = await this.db.query<IngredientRow>(
      `SELECT * FROM available_ingredients WHERE family_group_id = ? AND LOWER(name) LIKE ? ORDER BY name`,
      [familyGroupId, term]
    );

    return rows.map(row => this.rowToIngredient(row));
  }

  async bulkAdd(ingredients: Omit<AvailableIngredient, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<AvailableIngredient[]> {
    const results: AvailableIngredient[] = [];

    for (const ingredient of ingredients) {
      const added = await this.addIngredient(ingredient);
      results.push(added);
    }

    return results;
  }

  async bulkRemove(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(',');
    const result = await this.db.execute(
      `DELETE FROM available_ingredients WHERE id IN (${placeholders})`,
      ids
    );

    return result.changes;
  }

  async clearExpired(familyGroupId: string): Promise<number> {
    const now = Date.now();

    const result = await this.db.execute(
      `DELETE FROM available_ingredients WHERE family_group_id = ? AND expires_at IS NOT NULL AND expires_at < ?`,
      [familyGroupId, now]
    );

    return result.changes;
  }

  private rowToIngredient(row: IngredientRow): AvailableIngredient {
    return {
      id: row.id,
      familyGroupId: row.family_group_id,
      name: row.name,
      amount: row.amount ?? undefined,
      unit: row.unit ?? undefined,
      expiresAt: row.expires_at ?? undefined,
      addedBy: row.added_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ============================================================================
// In-Memory Implementations
// ============================================================================

export class InMemoryRecipeStore implements RecipeStore {
  private recipes = new Map<string, Recipe>();

  async initialize(): Promise<void> {}

  async createRecipe(recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>): Promise<Recipe> {
    const now = Date.now();
    const id = randomUUID();

    const newRecipe: Recipe = {
      ...recipe,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.recipes.set(id, newRecipe);
    return newRecipe;
  }

  async getRecipe(id: string): Promise<Recipe | null> {
    return this.recipes.get(id) ?? null;
  }

  async updateRecipe(id: string, updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>): Promise<Recipe | null> {
    const existing = this.recipes.get(id);
    if (!existing) return null;

    const updated: Recipe = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.recipes.set(id, updated);
    return updated;
  }

  async deleteRecipe(id: string): Promise<boolean> {
    return this.recipes.delete(id);
  }

  async listRecipes(options?: RecipeQueryOptions): Promise<Recipe[]> {
    let recipes = Array.from(this.recipes.values());

    if (options?.familyGroupId) {
      recipes = recipes.filter(r => !r.familyGroupId || r.familyGroupId === options.familyGroupId);
    }

    if (options?.category) {
      recipes = recipes.filter(r => r.category === options.category);
    }

    if (options?.difficulty) {
      recipes = recipes.filter(r => r.difficulty === options.difficulty);
    }

    if (options?.isFavorite !== undefined) {
      recipes = recipes.filter(r => r.isFavorite === options.isFavorite);
    }

    const orderDir = options?.orderDirection || 'desc';
    recipes.sort((a, b) => orderDir === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);

    if (options?.offset) {
      recipes = recipes.slice(options.offset);
    }
    if (options?.limit) {
      recipes = recipes.slice(0, options.limit);
    }

    return recipes;
  }

  async searchRecipes(searchTerm: string, options?: RecipeQueryOptions): Promise<Recipe[]> {
    const term = searchTerm.toLowerCase();
    let recipes = Array.from(this.recipes.values()).filter(r =>
      r.name.toLowerCase().includes(term) ||
      r.description?.toLowerCase().includes(term) ||
      r.cuisine?.toLowerCase().includes(term) ||
      r.tags?.some(t => t.toLowerCase().includes(term))
    );

    if (options?.familyGroupId) {
      recipes = recipes.filter(r => !r.familyGroupId || r.familyGroupId === options.familyGroupId);
    }

    if (options?.category) {
      recipes = recipes.filter(r => r.category === options.category);
    }

    if (options?.limit) {
      recipes = recipes.slice(0, options.limit);
    }

    return recipes;
  }

  async getFavorites(familyGroupId: string): Promise<Recipe[]> {
    return Array.from(this.recipes.values())
      .filter(r => r.isFavorite && (!r.familyGroupId || r.familyGroupId === familyGroupId))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getByCategory(category: RecipeCategory, options?: RecipeQueryOptions): Promise<Recipe[]> {
    return this.listRecipes({ ...options, category });
  }

  async markCooked(id: string): Promise<Recipe | null> {
    const recipe = this.recipes.get(id);
    if (!recipe) return null;

    return this.updateRecipe(id, {
      timesCooked: recipe.timesCooked + 1,
      lastCookedAt: Date.now(),
    });
  }

  async toggleFavorite(id: string): Promise<Recipe | null> {
    const recipe = this.recipes.get(id);
    if (!recipe) return null;

    return this.updateRecipe(id, { isFavorite: !recipe.isFavorite });
  }

  async updateRating(id: string, rating: number): Promise<Recipe | null> {
    return this.updateRecipe(id, { rating: Math.max(0, Math.min(5, rating)) });
  }
}

export class InMemoryAvailableIngredientStore implements AvailableIngredientStore {
  private ingredients = new Map<string, AvailableIngredient>();

  async initialize(): Promise<void> {}

  async addIngredient(ingredient: Omit<AvailableIngredient, 'id' | 'createdAt' | 'updatedAt'>): Promise<AvailableIngredient> {
    const now = Date.now();
    const id = randomUUID();

    const newIngredient: AvailableIngredient = {
      ...ingredient,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.ingredients.set(id, newIngredient);
    return newIngredient;
  }

  async getIngredient(id: string): Promise<AvailableIngredient | null> {
    return this.ingredients.get(id) ?? null;
  }

  async updateIngredient(id: string, updates: Partial<Omit<AvailableIngredient, 'id' | 'createdAt'>>): Promise<AvailableIngredient | null> {
    const existing = this.ingredients.get(id);
    if (!existing) return null;

    const updated: AvailableIngredient = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.ingredients.set(id, updated);
    return updated;
  }

  async removeIngredient(id: string): Promise<boolean> {
    return this.ingredients.delete(id);
  }

  async listIngredients(options: IngredientQueryOptions): Promise<AvailableIngredient[]> {
    let ingredients = Array.from(this.ingredients.values())
      .filter(i => i.familyGroupId === options.familyGroupId);

    if (options.expiringBefore !== undefined) {
      ingredients = ingredients.filter(i => i.expiresAt && i.expiresAt <= options.expiringBefore!);
    }

    ingredients.sort((a, b) => a.name.localeCompare(b.name));

    if (options.offset) {
      ingredients = ingredients.slice(options.offset);
    }
    if (options.limit) {
      ingredients = ingredients.slice(0, options.limit);
    }

    return ingredients;
  }

  async getExpiringIngredients(familyGroupId: string, withinDays: number): Promise<AvailableIngredient[]> {
    const expiresBeforeTimestamp = Date.now() + withinDays * 24 * 60 * 60 * 1000;

    return Array.from(this.ingredients.values())
      .filter(i =>
        i.familyGroupId === familyGroupId &&
        i.expiresAt !== undefined &&
        i.expiresAt <= expiresBeforeTimestamp
      )
      .sort((a, b) => (a.expiresAt || 0) - (b.expiresAt || 0));
  }

  async searchIngredients(familyGroupId: string, searchTerm: string): Promise<AvailableIngredient[]> {
    const term = searchTerm.toLowerCase();

    return Array.from(this.ingredients.values())
      .filter(i =>
        i.familyGroupId === familyGroupId &&
        i.name.toLowerCase().includes(term)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async bulkAdd(ingredients: Omit<AvailableIngredient, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<AvailableIngredient[]> {
    const results: AvailableIngredient[] = [];

    for (const ingredient of ingredients) {
      const added = await this.addIngredient(ingredient);
      results.push(added);
    }

    return results;
  }

  async bulkRemove(ids: string[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      if (this.ingredients.delete(id)) {
        count++;
      }
    }
    return count;
  }

  async clearExpired(familyGroupId: string): Promise<number> {
    const now = Date.now();
    let count = 0;

    for (const [id, ingredient] of this.ingredients) {
      if (
        ingredient.familyGroupId === familyGroupId &&
        ingredient.expiresAt !== undefined &&
        ingredient.expiresAt < now
      ) {
        this.ingredients.delete(id);
        count++;
      }
    }

    return count;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createRecipeStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): RecipeStore {
  if (type === 'database' && dbAdapter) {
    return new DatabaseRecipeStore(dbAdapter);
  }
  return new InMemoryRecipeStore();
}

export function createAvailableIngredientStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): AvailableIngredientStore {
  if (type === 'database' && dbAdapter) {
    return new DatabaseAvailableIngredientStore(dbAdapter);
  }
  return new InMemoryAvailableIngredientStore();
}
