/**
 * Ingredient Matcher
 *
 * Algorithm for matching available ingredients against recipes.
 */

import type {
  AvailableIngredient,
  DietaryInfo,
  Recipe,
  RecipeIngredient,
  RecipeSuggestion,
} from '../types.js';

// ============================================================================
// Configuration
// ============================================================================

export interface IngredientMatcherConfig {
  minMatchScore: number; // Minimum percentage of ingredients that must match (0-1)
  prioritizeExpiring: boolean;
  expirationBoostDays: number; // Boost score for ingredients expiring within this many days
  expirationBoostAmount: number; // Score boost for expiring ingredients
  similarityThreshold: number; // Threshold for fuzzy name matching (0-1)
}

const DEFAULT_CONFIG: IngredientMatcherConfig = {
  minMatchScore: 0.3,
  prioritizeExpiring: true,
  expirationBoostDays: 3,
  expirationBoostAmount: 0.1,
  similarityThreshold: 0.7,
};

// ============================================================================
// Ingredient Matcher
// ============================================================================

export class IngredientMatcher {
  private readonly config: IngredientMatcherConfig;

  constructor(config?: Partial<IngredientMatcherConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Find recipes that can be made with available ingredients
   */
  matchRecipes(
    recipes: Recipe[],
    availableIngredients: AvailableIngredient[],
    options?: MatchOptions
  ): RecipeSuggestion[] {
    const availableNames = new Set(
      availableIngredients.map(i => this.normalizeIngredientName(i.name))
    );

    const expiringNames = this.config.prioritizeExpiring
      ? this.getExpiringIngredients(availableIngredients)
      : new Set<string>();

    const suggestions: RecipeSuggestion[] = [];

    for (const recipe of recipes) {
      // Check dietary requirements
      if (options?.dietaryRequirements) {
        if (!this.meetsDietaryRequirements(recipe.dietaryInfo, options.dietaryRequirements)) {
          continue;
        }
      }

      // Check time constraints
      if (options?.maxTotalTime) {
        const totalTime = recipe.prepTime + recipe.cookTime;
        if (totalTime > options.maxTotalTime) {
          continue;
        }
      }

      // Calculate match
      const match = this.calculateMatch(recipe, availableNames, expiringNames);

      if (match.score >= this.config.minMatchScore) {
        suggestions.push({
          recipe,
          matchScore: match.score,
          matchedIngredients: match.matched,
          missingIngredients: match.missing,
        });
      }
    }

    // Sort by match score (descending)
    suggestions.sort((a, b) => b.matchScore - a.matchScore);

    // Limit results
    if (options?.maxResults) {
      return suggestions.slice(0, options.maxResults);
    }

    return suggestions;
  }

  /**
   * Calculate match score for a single recipe
   */
  calculateMatch(
    recipe: Recipe,
    availableNames: Set<string>,
    expiringNames?: Set<string>
  ): MatchResult {
    const requiredIngredients = recipe.ingredients.filter(i => !i.optional);
    const matched: string[] = [];
    const missing: string[] = [];

    for (const ingredient of requiredIngredients) {
      const normalizedName = this.normalizeIngredientName(ingredient.name);

      if (this.hasIngredient(normalizedName, availableNames)) {
        matched.push(ingredient.name);
      } else {
        missing.push(ingredient.name);
      }
    }

    // Base score is percentage of ingredients matched
    let score = matched.length / requiredIngredients.length;

    // Boost score for using expiring ingredients
    if (expiringNames && expiringNames.size > 0) {
      const expiringUsed = matched.filter(name =>
        expiringNames.has(this.normalizeIngredientName(name))
      ).length;

      if (expiringUsed > 0) {
        score += this.config.expirationBoostAmount * expiringUsed;
      }
    }

    // Cap score at 1
    score = Math.min(1, score);

    return { score, matched, missing };
  }

  /**
   * Check if an ingredient is available (with fuzzy matching)
   */
  hasIngredient(normalized: string, availableNames: Set<string>): boolean {
    // Exact match
    if (availableNames.has(normalized)) {
      return true;
    }

    // Check if any available ingredient contains this one
    for (const available of availableNames) {
      if (available.includes(normalized) || normalized.includes(available)) {
        return true;
      }

      // Fuzzy match using Levenshtein distance
      if (this.similarity(normalized, available) >= this.config.similarityThreshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * Normalize ingredient name for comparison
   */
  normalizeIngredientName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      // Remove common modifiers
      .replace(/^(fresh|dried|chopped|minced|sliced|diced|frozen|canned)\s+/, '')
      .replace(/\s+(fresh|dried|chopped|minced|sliced|diced|frozen|canned)$/, '');
  }

  /**
   * Calculate string similarity (Levenshtein-based)
   */
  similarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix: number[][] = [];

    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const maxLen = Math.max(a.length, b.length);
    return 1 - matrix[a.length][b.length] / maxLen;
  }

  /**
   * Get ingredients expiring soon
   */
  getExpiringIngredients(ingredients: AvailableIngredient[]): Set<string> {
    const now = Date.now();
    const threshold = now + this.config.expirationBoostDays * 24 * 60 * 60 * 1000;

    const expiring = ingredients
      .filter(i => i.expiresAt && i.expiresAt <= threshold)
      .map(i => this.normalizeIngredientName(i.name));

    return new Set(expiring);
  }

  /**
   * Check if recipe meets dietary requirements
   */
  meetsDietaryRequirements(
    recipeDietaryInfo: DietaryInfo,
    requirements: Partial<DietaryInfo>
  ): boolean {
    if (requirements.vegetarian && !recipeDietaryInfo.vegetarian) return false;
    if (requirements.vegan && !recipeDietaryInfo.vegan) return false;
    if (requirements.glutenFree && !recipeDietaryInfo.glutenFree) return false;
    if (requirements.dairyFree && !recipeDietaryInfo.dairyFree) return false;
    if (requirements.nutFree && !recipeDietaryInfo.nutFree) return false;
    if (requirements.lowCarb && !recipeDietaryInfo.lowCarb) return false;

    // Check allergies
    if (requirements.allergies?.length) {
      for (const allergy of requirements.allergies) {
        if (!recipeDietaryInfo.allergies?.includes(allergy)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Suggest substitutions for missing ingredients
   */
  suggestSubstitutions(missingIngredient: string): string[] {
    const normalized = this.normalizeIngredientName(missingIngredient);

    const substitutions: Record<string, string[]> = {
      'butter': ['margarine', 'coconut oil', 'olive oil'],
      'milk': ['almond milk', 'oat milk', 'soy milk', 'coconut milk'],
      'egg': ['flax egg', 'chia egg', 'banana', 'applesauce'],
      'cream': ['coconut cream', 'cashew cream'],
      'sour cream': ['greek yogurt', 'coconut yogurt'],
      'chicken broth': ['vegetable broth', 'water with bouillon'],
      'beef broth': ['mushroom broth', 'vegetable broth'],
      'white wine': ['chicken broth', 'apple cider vinegar', 'lemon juice'],
      'red wine': ['beef broth', 'grape juice', 'balsamic vinegar'],
      'lemon juice': ['lime juice', 'vinegar'],
      'lime juice': ['lemon juice'],
      'honey': ['maple syrup', 'agave', 'sugar'],
      'maple syrup': ['honey', 'agave'],
      'brown sugar': ['white sugar with molasses', 'coconut sugar'],
      'all purpose flour': ['whole wheat flour', 'almond flour'],
      'breadcrumbs': ['crushed crackers', 'oats', 'panko'],
      'parmesan': ['pecorino romano', 'nutritional yeast'],
      'mozzarella': ['provolone', 'monterey jack'],
      'cheddar': ['gouda', 'colby jack'],
    };

    return substitutions[normalized] || [];
  }
}

// ============================================================================
// Types
// ============================================================================

export interface MatchOptions {
  maxResults?: number;
  dietaryRequirements?: Partial<DietaryInfo>;
  maxTotalTime?: number;
}

interface MatchResult {
  score: number;
  matched: string[];
  missing: string[];
}

// ============================================================================
// Factory Function
// ============================================================================

export function createIngredientMatcher(
  config?: Partial<IngredientMatcherConfig>
): IngredientMatcher {
  return new IngredientMatcher(config);
}
