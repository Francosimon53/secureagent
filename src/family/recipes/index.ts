/**
 * Recipe Suggestion Service
 *
 * Service for suggesting recipes based on available ingredients and preferences.
 */

import type {
  AvailableIngredient,
  DietaryInfo,
  Recipe,
  RecipeCategory,
  RecipeQueryOptions,
  RecipeSuggestion,
} from '../types.js';
import type { AvailableIngredientStore, RecipeStore } from '../stores/recipe-store.js';
import type { RecipeAPIProvider, RecipeSearchParams } from '../providers/recipe.js';
import { IngredientMatcher, type IngredientMatcherConfig, type MatchOptions } from './ingredient-matcher.js';

// ============================================================================
// Service Configuration
// ============================================================================

export interface RecipeSuggestionServiceConfig {
  maxSuggestions: number;
  prioritizeFavorites: boolean;
  considerExpiringIngredients: boolean;
  expirationWarningDays: number;
  ingredientMatcher?: Partial<IngredientMatcherConfig>;
}

// ============================================================================
// Recipe Suggestion Service
// ============================================================================

export class RecipeSuggestionService {
  private readonly recipeStore: RecipeStore;
  private readonly ingredientStore: AvailableIngredientStore;
  private readonly recipeProvider?: RecipeAPIProvider;
  private readonly ingredientMatcher: IngredientMatcher;
  private readonly config: RecipeSuggestionServiceConfig;

  constructor(
    recipeStore: RecipeStore,
    ingredientStore: AvailableIngredientStore,
    recipeProvider?: RecipeAPIProvider,
    config?: Partial<RecipeSuggestionServiceConfig>
  ) {
    this.recipeStore = recipeStore;
    this.ingredientStore = ingredientStore;
    this.recipeProvider = recipeProvider;
    this.config = {
      maxSuggestions: config?.maxSuggestions || 10,
      prioritizeFavorites: config?.prioritizeFavorites ?? true,
      considerExpiringIngredients: config?.considerExpiringIngredients ?? true,
      expirationWarningDays: config?.expirationWarningDays || 3,
      ingredientMatcher: config?.ingredientMatcher,
    };
    this.ingredientMatcher = new IngredientMatcher({
      ...config?.ingredientMatcher,
      prioritizeExpiring: this.config.considerExpiringIngredients,
      expirationBoostDays: this.config.expirationWarningDays,
    });
  }

  // ============================================================================
  // Recipe Suggestions
  // ============================================================================

  /**
   * Get recipe suggestions based on available ingredients
   */
  async suggestRecipes(
    familyGroupId: string,
    options?: SuggestionOptions
  ): Promise<RecipeSuggestion[]> {
    // Get available ingredients
    const ingredients = await this.ingredientStore.listIngredients({ familyGroupId });

    if (ingredients.length === 0) {
      return [];
    }

    // Get local recipes
    const recipes = await this.recipeStore.listRecipes({
      familyGroupId,
      category: options?.category,
      difficulty: options?.difficulty,
    });

    // Match against available ingredients
    const matchOptions: MatchOptions = {
      maxResults: this.config.maxSuggestions,
      dietaryRequirements: options?.dietaryRequirements,
      maxTotalTime: options?.maxTotalTime,
    };

    let suggestions = this.ingredientMatcher.matchRecipes(recipes, ingredients, matchOptions);

    // Prioritize favorites if enabled
    if (this.config.prioritizeFavorites) {
      suggestions = this.prioritizeFavorites(suggestions);
    }

    // Search external provider if not enough local matches
    if (suggestions.length < this.config.maxSuggestions && this.recipeProvider) {
      const externalSuggestions = await this.searchExternalRecipes(ingredients, options);
      suggestions = [...suggestions, ...externalSuggestions];
    }

    return suggestions.slice(0, this.config.maxSuggestions);
  }

  /**
   * Suggest recipes using specific ingredients (use-up mode)
   */
  async suggestUsingIngredients(
    familyGroupId: string,
    ingredientNames: string[],
    options?: SuggestionOptions
  ): Promise<RecipeSuggestion[]> {
    // Get all available ingredients
    const allIngredients = await this.ingredientStore.listIngredients({ familyGroupId });

    // Filter to only the specified ingredients (and always-available pantry items)
    const targetIngredients = allIngredients.filter(i =>
      ingredientNames.some(name =>
        this.ingredientMatcher.similarity(
          this.ingredientMatcher.normalizeIngredientName(i.name),
          this.ingredientMatcher.normalizeIngredientName(name)
        ) > 0.7
      )
    );

    if (targetIngredients.length === 0) {
      return [];
    }

    // Get local recipes
    const recipes = await this.recipeStore.listRecipes({
      familyGroupId,
      category: options?.category,
    });

    // Match with higher threshold for specified ingredients
    const matcher = new IngredientMatcher({
      ...this.config.ingredientMatcher,
      minMatchScore: 0.5, // Higher threshold for specific ingredient matching
    });

    return matcher.matchRecipes(recipes, targetIngredients, {
      maxResults: this.config.maxSuggestions,
      dietaryRequirements: options?.dietaryRequirements,
    });
  }

  /**
   * Suggest recipes for expiring ingredients
   */
  async suggestForExpiring(
    familyGroupId: string,
    daysUntilExpiration?: number
  ): Promise<RecipeSuggestion[]> {
    const days = daysUntilExpiration ?? this.config.expirationWarningDays;

    // Get expiring ingredients
    const expiringIngredients = await this.ingredientStore.getExpiringIngredients(
      familyGroupId,
      days
    );

    if (expiringIngredients.length === 0) {
      return [];
    }

    // Get all ingredients for matching
    const allIngredients = await this.ingredientStore.listIngredients({ familyGroupId });

    // Get recipes
    const recipes = await this.recipeStore.listRecipes({ familyGroupId });

    // Create matcher that heavily prioritizes expiring ingredients
    const matcher = new IngredientMatcher({
      ...this.config.ingredientMatcher,
      prioritizeExpiring: true,
      expirationBoostDays: days,
      expirationBoostAmount: 0.2, // Higher boost for expiring ingredients
    });

    return matcher.matchRecipes(recipes, allIngredients, {
      maxResults: this.config.maxSuggestions,
    });
  }

  // ============================================================================
  // Recipe Management
  // ============================================================================

  /**
   * Add a recipe to the family's collection
   */
  async addRecipe(recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>): Promise<Recipe> {
    return this.recipeStore.createRecipe(recipe);
  }

  /**
   * Get a recipe by ID
   */
  async getRecipe(id: string): Promise<Recipe | null> {
    return this.recipeStore.getRecipe(id);
  }

  /**
   * Update a recipe
   */
  async updateRecipe(id: string, updates: Partial<Recipe>): Promise<Recipe | null> {
    return this.recipeStore.updateRecipe(id, updates);
  }

  /**
   * Delete a recipe
   */
  async deleteRecipe(id: string): Promise<boolean> {
    return this.recipeStore.deleteRecipe(id);
  }

  /**
   * Search recipes
   */
  async searchRecipes(
    searchTerm: string,
    options?: RecipeQueryOptions
  ): Promise<Recipe[]> {
    return this.recipeStore.searchRecipes(searchTerm, options);
  }

  /**
   * Get favorite recipes
   */
  async getFavorites(familyGroupId: string): Promise<Recipe[]> {
    return this.recipeStore.getFavorites(familyGroupId);
  }

  /**
   * Toggle recipe favorite status
   */
  async toggleFavorite(id: string): Promise<Recipe | null> {
    return this.recipeStore.toggleFavorite(id);
  }

  /**
   * Mark recipe as cooked
   */
  async markCooked(id: string): Promise<Recipe | null> {
    return this.recipeStore.markCooked(id);
  }

  /**
   * Update recipe rating
   */
  async rateRecipe(id: string, rating: number): Promise<Recipe | null> {
    return this.recipeStore.updateRating(id, rating);
  }

  // ============================================================================
  // Pantry/Ingredient Management
  // ============================================================================

  /**
   * Add ingredient to pantry
   */
  async addIngredient(
    ingredient: Omit<AvailableIngredient, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AvailableIngredient> {
    return this.ingredientStore.addIngredient(ingredient);
  }

  /**
   * Update ingredient
   */
  async updateIngredient(
    id: string,
    updates: Partial<AvailableIngredient>
  ): Promise<AvailableIngredient | null> {
    return this.ingredientStore.updateIngredient(id, updates);
  }

  /**
   * Remove ingredient from pantry
   */
  async removeIngredient(id: string): Promise<boolean> {
    return this.ingredientStore.removeIngredient(id);
  }

  /**
   * Get all pantry ingredients
   */
  async listIngredients(familyGroupId: string): Promise<AvailableIngredient[]> {
    return this.ingredientStore.listIngredients({ familyGroupId });
  }

  /**
   * Get expiring ingredients
   */
  async getExpiringIngredients(
    familyGroupId: string,
    days?: number
  ): Promise<AvailableIngredient[]> {
    return this.ingredientStore.getExpiringIngredients(
      familyGroupId,
      days ?? this.config.expirationWarningDays
    );
  }

  /**
   * Clear expired ingredients
   */
  async clearExpiredIngredients(familyGroupId: string): Promise<number> {
    return this.ingredientStore.clearExpired(familyGroupId);
  }

  /**
   * Bulk add ingredients
   */
  async bulkAddIngredients(
    ingredients: Omit<AvailableIngredient, 'id' | 'createdAt' | 'updatedAt'>[]
  ): Promise<AvailableIngredient[]> {
    return this.ingredientStore.bulkAdd(ingredients);
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Get substitution suggestions for a missing ingredient
   */
  getSubstitutions(ingredientName: string): string[] {
    return this.ingredientMatcher.suggestSubstitutions(ingredientName);
  }

  private prioritizeFavorites(suggestions: RecipeSuggestion[]): RecipeSuggestion[] {
    // Boost score for favorite recipes
    const boosted = suggestions.map(s => ({
      ...s,
      matchScore: s.recipe.isFavorite ? Math.min(1, s.matchScore + 0.15) : s.matchScore,
    }));

    // Re-sort by boosted score
    return boosted.sort((a, b) => b.matchScore - a.matchScore);
  }

  private async searchExternalRecipes(
    ingredients: AvailableIngredient[],
    options?: SuggestionOptions
  ): Promise<RecipeSuggestion[]> {
    if (!this.recipeProvider) return [];

    try {
      const ingredientNames = ingredients.map(i => i.name);
      const result = await this.recipeProvider.searchByIngredients(
        ingredientNames,
        3 // Max missing ingredients
      );

      if (!result.success || !result.data) return [];

      // Convert to suggestions
      return result.data.recipes.map(recipe => {
        const availableNames = new Set(
          ingredients.map(i => this.ingredientMatcher.normalizeIngredientName(i.name))
        );
        const match = this.ingredientMatcher.calculateMatch(recipe, availableNames);

        return {
          recipe,
          matchScore: match.score,
          matchedIngredients: match.matched,
          missingIngredients: match.missing,
        };
      });
    } catch (error) {
      console.error('Failed to search external recipes:', error);
      return [];
    }
  }
}

// ============================================================================
// Types
// ============================================================================

export interface SuggestionOptions {
  category?: RecipeCategory;
  difficulty?: Recipe['difficulty'];
  dietaryRequirements?: Partial<DietaryInfo>;
  maxTotalTime?: number;
}

// ============================================================================
// Exports
// ============================================================================

export {
  IngredientMatcher,
  type IngredientMatcherConfig,
  type MatchOptions,
  createIngredientMatcher,
} from './ingredient-matcher.js';

export function createRecipeSuggestionService(
  recipeStore: RecipeStore,
  ingredientStore: AvailableIngredientStore,
  recipeProvider?: RecipeAPIProvider,
  config?: Partial<RecipeSuggestionServiceConfig>
): RecipeSuggestionService {
  return new RecipeSuggestionService(recipeStore, ingredientStore, recipeProvider, config);
}
