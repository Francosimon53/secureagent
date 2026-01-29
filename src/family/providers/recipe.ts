/**
 * Recipe Providers
 *
 * Providers for fetching recipes from external APIs.
 */

import type {
  DietaryInfo,
  NutritionInfo,
  ProviderResult,
  Recipe,
  RecipeCategory,
  RecipeDifficulty,
  RecipeIngredient,
  RecipeProviderConfig,
} from '../types.js';
import { BaseFamilyProvider } from './base.js';

// ============================================================================
// Recipe Provider Types
// ============================================================================

export interface RecipeSearchParams {
  ingredients?: string[];
  query?: string;
  cuisine?: string;
  category?: RecipeCategory;
  maxReadyTime?: number;
  diet?: string;
  intolerances?: string[];
  maxResults?: number;
}

export interface RecipeSearchResult {
  recipes: Recipe[];
  totalResults: number;
}

// ============================================================================
// Abstract Recipe Provider
// ============================================================================

export abstract class RecipeAPIProvider extends BaseFamilyProvider<RecipeProviderConfig> {
  get type(): string {
    return 'recipe';
  }

  abstract get providerName(): 'spoonacular' | 'edamam';

  /**
   * Search for recipes
   */
  abstract searchRecipes(params: RecipeSearchParams): Promise<ProviderResult<RecipeSearchResult>>;

  /**
   * Get a recipe by external ID
   */
  abstract getRecipe(externalId: string): Promise<ProviderResult<Recipe>>;

  /**
   * Search recipes by available ingredients
   */
  abstract searchByIngredients(ingredients: string[], maxMissing?: number): Promise<ProviderResult<RecipeSearchResult>>;

  /**
   * Map external difficulty to internal
   */
  protected mapDifficulty(readyInMinutes?: number): RecipeDifficulty {
    if (!readyInMinutes) return 'medium';
    if (readyInMinutes <= 30) return 'easy';
    if (readyInMinutes <= 60) return 'medium';
    return 'hard';
  }

  /**
   * Map category from meal type
   */
  protected mapCategory(mealTypes?: string[]): RecipeCategory {
    if (!mealTypes || mealTypes.length === 0) return 'dinner';

    const type = mealTypes[0].toLowerCase();
    if (type.includes('breakfast') || type.includes('brunch')) return 'breakfast';
    if (type.includes('lunch')) return 'lunch';
    if (type.includes('dinner') || type.includes('main')) return 'dinner';
    if (type.includes('snack')) return 'snack';
    if (type.includes('dessert')) return 'dessert';

    return 'dinner';
  }
}

// ============================================================================
// Spoonacular Provider
// ============================================================================

interface SpoonacularRecipe {
  id: number;
  title: string;
  summary?: string;
  image?: string;
  sourceUrl?: string;
  readyInMinutes?: number;
  servings?: number;
  cuisines?: string[];
  dishTypes?: string[];
  diets?: string[];
  extendedIngredients?: SpoonacularIngredient[];
  analyzedInstructions?: SpoonacularInstruction[];
  nutrition?: SpoonacularNutrition;
}

interface SpoonacularIngredient {
  name: string;
  amount: number;
  unit: string;
  original?: string;
}

interface SpoonacularInstruction {
  steps: { step: string }[];
}

interface SpoonacularNutrition {
  nutrients: { name: string; amount: number; unit: string }[];
}

interface SpoonacularSearchResponse {
  results: SpoonacularRecipe[];
  totalResults: number;
}

interface SpoonacularByIngredientsResult {
  id: number;
  title: string;
  image?: string;
  usedIngredientCount: number;
  missedIngredientCount: number;
}

export class SpoonacularProvider extends RecipeAPIProvider {
  private readonly baseUrl = 'https://api.spoonacular.com';

  get name(): string {
    return 'spoonacular';
  }

  get providerName(): 'spoonacular' {
    return 'spoonacular';
  }

  async searchRecipes(params: RecipeSearchParams): Promise<ProviderResult<RecipeSearchResult>> {
    this.ensureInitialized();
    this.ensureApiKey();

    const queryParams = new URLSearchParams({
      apiKey: this.apiKey!,
      addRecipeInformation: 'true',
      fillIngredients: 'true',
      number: (params.maxResults || this.config.maxResults || 10).toString(),
    });

    if (params.query) queryParams.set('query', params.query);
    if (params.cuisine) queryParams.set('cuisine', params.cuisine);
    if (params.diet) queryParams.set('diet', params.diet);
    if (params.maxReadyTime) queryParams.set('maxReadyTime', params.maxReadyTime.toString());
    if (params.intolerances?.length) queryParams.set('intolerances', params.intolerances.join(','));
    if (params.category) queryParams.set('type', this.categoryToType(params.category));

    const url = `${this.baseUrl}/recipes/complexSearch?${queryParams}`;
    const result = await this.fetch<SpoonacularSearchResponse>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || 'Failed to search recipes',
      };
    }

    const recipes = result.data.results.map(r => this.mapRecipe(r));

    return {
      success: true,
      data: {
        recipes,
        totalResults: result.data.totalResults,
      },
    };
  }

  async getRecipe(externalId: string): Promise<ProviderResult<Recipe>> {
    this.ensureInitialized();
    this.ensureApiKey();

    const url = `${this.baseUrl}/recipes/${externalId}/information?apiKey=${this.apiKey}&includeNutrition=true`;
    const result = await this.fetch<SpoonacularRecipe>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || 'Failed to get recipe',
      };
    }

    return {
      success: true,
      data: this.mapRecipe(result.data),
    };
  }

  async searchByIngredients(ingredients: string[], maxMissing = 3): Promise<ProviderResult<RecipeSearchResult>> {
    this.ensureInitialized();
    this.ensureApiKey();

    const queryParams = new URLSearchParams({
      apiKey: this.apiKey!,
      ingredients: ingredients.join(','),
      number: (this.config.maxResults || 10).toString(),
      ranking: '2', // Maximize used ingredients
      ignorePantry: 'true',
    });

    const url = `${this.baseUrl}/recipes/findByIngredients?${queryParams}`;
    const result = await this.fetch<SpoonacularByIngredientsResult[]>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || 'Failed to search recipes by ingredients',
      };
    }

    // Filter by max missing and get full recipe info
    const filtered = result.data.filter(r => r.missedIngredientCount <= maxMissing);
    const recipePromises = filtered.slice(0, 10).map(r => this.getRecipe(r.id.toString()));
    const recipeResults = await Promise.all(recipePromises);

    const recipes = recipeResults
      .filter(r => r.success && r.data)
      .map(r => r.data!);

    return {
      success: true,
      data: {
        recipes,
        totalResults: filtered.length,
      },
    };
  }

  private mapRecipe(recipe: SpoonacularRecipe): Recipe {
    const now = Date.now();

    const ingredients: RecipeIngredient[] = (recipe.extendedIngredients || []).map(i => ({
      name: i.name,
      amount: i.amount,
      unit: i.unit,
    }));

    const instructions: string[] = [];
    if (recipe.analyzedInstructions?.[0]?.steps) {
      for (const step of recipe.analyzedInstructions[0].steps) {
        instructions.push(step.step);
      }
    }

    const dietaryInfo: DietaryInfo = {
      vegetarian: recipe.diets?.includes('vegetarian') || false,
      vegan: recipe.diets?.includes('vegan') || false,
      glutenFree: recipe.diets?.includes('gluten free') || false,
      dairyFree: recipe.diets?.includes('dairy free') || false,
      nutFree: false, // Not directly available
      lowCarb: recipe.diets?.includes('low carb') || recipe.diets?.includes('ketogenic') || false,
    };

    let nutritionInfo: NutritionInfo | undefined;
    if (recipe.nutrition?.nutrients) {
      const nutrients = recipe.nutrition.nutrients;
      const findNutrient = (name: string) =>
        nutrients.find(n => n.name.toLowerCase() === name.toLowerCase())?.amount;

      nutritionInfo = {
        calories: findNutrient('Calories'),
        protein: findNutrient('Protein'),
        carbohydrates: findNutrient('Carbohydrates'),
        fat: findNutrient('Fat'),
        fiber: findNutrient('Fiber'),
        sodium: findNutrient('Sodium'),
      };
    }

    // Clean up summary (remove HTML)
    const description = recipe.summary
      ? recipe.summary.replace(/<[^>]*>/g, '').slice(0, 500)
      : undefined;

    return {
      id: `spoonacular-${recipe.id}`,
      name: recipe.title,
      description,
      cuisine: recipe.cuisines?.[0],
      category: this.mapCategory(recipe.dishTypes),
      ingredients,
      instructions: instructions.length > 0 ? instructions : ['Follow source recipe'],
      prepTime: Math.floor((recipe.readyInMinutes || 30) * 0.3),
      cookTime: Math.floor((recipe.readyInMinutes || 30) * 0.7),
      servings: recipe.servings || 4,
      difficulty: this.mapDifficulty(recipe.readyInMinutes),
      dietaryInfo,
      nutritionInfo,
      imageUrl: recipe.image,
      sourceUrl: recipe.sourceUrl,
      timesCooked: 0,
      isFavorite: false,
      tags: [...(recipe.cuisines || []), ...(recipe.diets || [])],
      createdAt: now,
      updatedAt: now,
    };
  }

  private categoryToType(category: RecipeCategory): string {
    switch (category) {
      case 'breakfast': return 'breakfast';
      case 'lunch': return 'lunch';
      case 'dinner': return 'main course';
      case 'snack': return 'snack';
      case 'dessert': return 'dessert';
    }
  }
}

// ============================================================================
// Edamam Provider
// ============================================================================

interface EdamamRecipe {
  uri: string;
  label: string;
  image?: string;
  source?: string;
  url?: string;
  yield?: number;
  ingredientLines?: string[];
  ingredients?: EdamamIngredient[];
  calories?: number;
  totalTime?: number;
  cuisineType?: string[];
  mealType?: string[];
  dishType?: string[];
  healthLabels?: string[];
  totalNutrients?: Record<string, { quantity: number; unit: string }>;
}

interface EdamamIngredient {
  text: string;
  quantity: number;
  measure?: string;
  food: string;
}

interface EdamamSearchResponse {
  hits: { recipe: EdamamRecipe }[];
  count: number;
}

export class EdamamProvider extends RecipeAPIProvider {
  private readonly baseUrl = 'https://api.edamam.com/api/recipes/v2';
  private readonly appId: string | undefined;

  constructor(config: RecipeProviderConfig & { appIdEnvVar?: string }) {
    super(config);
    this.appId = process.env[config.appIdEnvVar || 'EDAMAM_APP_ID'];
  }

  get name(): string {
    return 'edamam';
  }

  get providerName(): 'edamam' {
    return 'edamam';
  }

  async searchRecipes(params: RecipeSearchParams): Promise<ProviderResult<RecipeSearchResult>> {
    this.ensureInitialized();
    this.ensureApiKey();

    if (!this.appId) {
      return {
        success: false,
        error: 'Edamam App ID not configured',
      };
    }

    const queryParams = new URLSearchParams({
      type: 'public',
      app_id: this.appId,
      app_key: this.apiKey!,
    });

    if (params.query) queryParams.set('q', params.query);
    if (params.cuisine) queryParams.set('cuisineType', params.cuisine);
    if (params.category) queryParams.set('mealType', params.category);
    if (params.maxReadyTime) queryParams.set('time', `0-${params.maxReadyTime}`);
    if (params.diet) queryParams.set('health', params.diet);
    if (params.intolerances) {
      for (const intolerance of params.intolerances) {
        queryParams.append('health', `${intolerance}-free`);
      }
    }

    const url = `${this.baseUrl}?${queryParams}`;
    const result = await this.fetch<EdamamSearchResponse>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || 'Failed to search recipes',
      };
    }

    const maxResults = params.maxResults || this.config.maxResults || 10;
    const recipes = result.data.hits.slice(0, maxResults).map(h => this.mapRecipe(h.recipe));

    return {
      success: true,
      data: {
        recipes,
        totalResults: result.data.count,
      },
    };
  }

  async getRecipe(uri: string): Promise<ProviderResult<Recipe>> {
    this.ensureInitialized();
    this.ensureApiKey();

    if (!this.appId) {
      return {
        success: false,
        error: 'Edamam App ID not configured',
      };
    }

    const queryParams = new URLSearchParams({
      type: 'public',
      app_id: this.appId,
      app_key: this.apiKey!,
    });

    const url = `${this.baseUrl}/by-uri?uri=${encodeURIComponent(uri)}&${queryParams}`;
    const result = await this.fetch<EdamamSearchResponse>(url);

    if (!result.success || !result.data?.hits?.[0]) {
      return {
        success: false,
        error: result.error || 'Recipe not found',
      };
    }

    return {
      success: true,
      data: this.mapRecipe(result.data.hits[0].recipe),
    };
  }

  async searchByIngredients(ingredients: string[], _maxMissing = 3): Promise<ProviderResult<RecipeSearchResult>> {
    // Edamam doesn't have a direct "find by ingredients" endpoint
    // Search with ingredients as query
    return this.searchRecipes({
      query: ingredients.join(' '),
    });
  }

  private mapRecipe(recipe: EdamamRecipe): Recipe {
    const now = Date.now();

    // Extract ID from URI
    const idMatch = recipe.uri.match(/recipe_([a-f0-9]+)/);
    const id = idMatch ? `edamam-${idMatch[1]}` : `edamam-${Date.now()}`;

    const ingredients: RecipeIngredient[] = (recipe.ingredients || []).map(i => ({
      name: i.food,
      amount: i.quantity,
      unit: i.measure || 'unit',
    }));

    // Edamam doesn't provide step-by-step instructions
    const instructions = recipe.ingredientLines || ['Follow source recipe'];

    const healthLabels = recipe.healthLabels || [];
    const dietaryInfo: DietaryInfo = {
      vegetarian: healthLabels.includes('Vegetarian'),
      vegan: healthLabels.includes('Vegan'),
      glutenFree: healthLabels.includes('Gluten-Free'),
      dairyFree: healthLabels.includes('Dairy-Free'),
      nutFree: healthLabels.includes('Tree-Nut-Free') && healthLabels.includes('Peanut-Free'),
      lowCarb: healthLabels.includes('Low-Carb') || healthLabels.includes('Keto-Friendly'),
    };

    let nutritionInfo: NutritionInfo | undefined;
    if (recipe.totalNutrients) {
      const n = recipe.totalNutrients;
      nutritionInfo = {
        calories: n.ENERC_KCAL?.quantity,
        protein: n.PROCNT?.quantity,
        carbohydrates: n.CHOCDF?.quantity,
        fat: n.FAT?.quantity,
        fiber: n.FIBTG?.quantity,
        sodium: n.NA?.quantity,
      };
    }

    return {
      id,
      name: recipe.label,
      cuisine: recipe.cuisineType?.[0],
      category: this.mapCategory(recipe.mealType),
      ingredients,
      instructions,
      prepTime: Math.floor((recipe.totalTime || 30) * 0.3),
      cookTime: Math.floor((recipe.totalTime || 30) * 0.7),
      servings: recipe.yield || 4,
      difficulty: this.mapDifficulty(recipe.totalTime),
      dietaryInfo,
      nutritionInfo,
      imageUrl: recipe.image,
      sourceUrl: recipe.url,
      timesCooked: 0,
      isFavorite: false,
      tags: [
        ...(recipe.cuisineType || []),
        ...(recipe.dishType || []),
      ],
      createdAt: now,
      updatedAt: now,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createRecipeProvider(
  type: 'spoonacular' | 'edamam',
  config: RecipeProviderConfig
): RecipeAPIProvider {
  switch (type) {
    case 'spoonacular':
      return new SpoonacularProvider(config);
    case 'edamam':
      return new EdamamProvider(config);
    default:
      throw new Error(`Unknown recipe provider type: ${type}`);
  }
}
