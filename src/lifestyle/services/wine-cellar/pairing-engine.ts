/**
 * Wine Pairing Engine
 *
 * Provides food and wine pairing recommendations.
 */

import type { Wine, WineType, FoodPairing } from '../../types.js';
import type { WineStore } from '../../stores/wine-store.js';
import type { WineProvider, WinePairingResult, FoodPairingResult } from '../../providers/base.js';

export interface PairingEngineConfig {
  enableExternalSearch: boolean;
  minConfidence: number;
}

export interface PairingEngineDeps {
  store: WineStore;
  getWineProvider?: () => WineProvider | undefined;
}

export interface WinePairingSuggestion {
  wineType: WineType;
  confidence: number;
  description: string;
  matchingWinesInCellar?: Wine[];
}

export interface FoodPairingSuggestion {
  food: string;
  category: string;
  confidence: number;
}

// Built-in pairing knowledge base
const WINE_TYPE_PAIRINGS: Record<string, WineType[]> = {
  // Meats
  'steak': ['red'],
  'beef': ['red'],
  'lamb': ['red'],
  'pork': ['red', 'white', 'rose'],
  'veal': ['red', 'white'],
  'venison': ['red'],
  'duck': ['red', 'white'],

  // Poultry
  'chicken': ['white', 'red', 'rose'],
  'turkey': ['white', 'red', 'rose'],

  // Seafood
  'salmon': ['white', 'red', 'rose'],
  'tuna': ['red', 'white', 'rose'],
  'lobster': ['white', 'sparkling'],
  'crab': ['white', 'sparkling'],
  'shrimp': ['white', 'rose', 'sparkling'],
  'oysters': ['white', 'sparkling'],
  'fish': ['white', 'rose'],
  'scallops': ['white', 'sparkling'],

  // Vegetarian
  'pasta': ['red', 'white'],
  'risotto': ['white', 'red'],
  'mushrooms': ['red', 'white'],
  'salad': ['white', 'rose'],
  'vegetables': ['white', 'rose'],

  // Cheese
  'cheese': ['red', 'white', 'fortified', 'dessert'],
  'brie': ['white', 'sparkling'],
  'cheddar': ['red'],
  'goat cheese': ['white', 'rose'],
  'blue cheese': ['dessert', 'fortified'],
  'parmesan': ['red'],

  // Desserts
  'chocolate': ['dessert', 'fortified', 'red'],
  'fruit': ['dessert', 'sparkling', 'rose'],
  'cake': ['dessert', 'sparkling'],
  'ice cream': ['dessert'],

  // Cuisines
  'italian': ['red', 'white'],
  'french': ['red', 'white', 'sparkling'],
  'asian': ['white', 'rose'],
  'thai': ['white', 'rose'],
  'indian': ['white', 'rose'],
  'mexican': ['white', 'rose', 'red'],
  'mediterranean': ['white', 'rose', 'red'],
  'japanese': ['white', 'sparkling'],
  'sushi': ['white', 'sparkling'],
};

const WINE_TYPE_DESCRIPTIONS: Record<WineType, Record<string, string>> = {
  red: {
    default: 'Rich and full-bodied, complements hearty dishes',
    steak: 'Bold tannins cut through the fat and enhance the meat',
    lamb: 'Earthy notes complement gamey flavors',
    pasta: 'Acidity balances tomato-based sauces',
    cheese: 'Tannins pair beautifully with aged cheeses',
  },
  white: {
    default: 'Crisp and refreshing, perfect for lighter fare',
    chicken: 'Buttery Chardonnay or crisp Sauvignon Blanc work beautifully',
    seafood: 'Citrus notes enhance the delicate flavors',
    salad: 'Light and refreshing pairing',
    asian: 'Off-dry whites complement spicy dishes',
  },
  rose: {
    default: 'Versatile and food-friendly',
    seafood: 'Light enough for fish, flavorful enough for grilled options',
    mediterranean: 'Classic pairing with Southern French cuisine',
    salad: 'Refreshing complement to light dishes',
    asian: 'Bridges the gap between white and red',
  },
  sparkling: {
    default: 'Bubbles cleanse the palate between bites',
    oysters: 'Classic combination - minerals meet brine',
    lobster: 'Celebratory and complementary',
    sushi: 'Clean and refreshing pairing',
    fried: 'Bubbles cut through richness',
  },
  dessert: {
    default: 'Sweet wines for sweet endings',
    chocolate: 'Rich and indulgent pairing',
    fruit: 'Complements natural fruit sweetness',
    'blue cheese': 'Sweet and salty contrast',
    cake: 'Match sweetness levels for harmony',
  },
  fortified: {
    default: 'Complex wines for rich flavors',
    cheese: 'Port and Stilton is a classic',
    chocolate: 'Rich and decadent combination',
    nuts: 'Sherry and almonds pair beautifully',
    'blue cheese': 'Sweet Port with salty blue cheese',
  },
};

/**
 * Wine pairing engine
 */
export class PairingEngine {
  private readonly config: PairingEngineConfig;
  private readonly deps: PairingEngineDeps;

  constructor(config: PairingEngineConfig, deps: PairingEngineDeps) {
    this.config = config;
    this.deps = deps;
  }

  /**
   * Get wine suggestions for a food
   */
  async suggestWinesForFood(
    userId: string,
    food: string
  ): Promise<{
    suggestions: WinePairingSuggestion[];
    fromCellar: Array<{ wine: Wine; matchScore: number }>;
  }> {
    const normalizedFood = food.toLowerCase().trim();
    const suggestions: WinePairingSuggestion[] = [];

    // Find matching food categories
    const matchedTypes = new Map<WineType, { confidence: number; food: string }>();

    for (const [foodKey, wineTypes] of Object.entries(WINE_TYPE_PAIRINGS)) {
      if (normalizedFood.includes(foodKey) || foodKey.includes(normalizedFood)) {
        const confidence = normalizedFood === foodKey ? 1.0 :
          normalizedFood.includes(foodKey) ? 0.9 : 0.8;

        for (let i = 0; i < wineTypes.length; i++) {
          const type = wineTypes[i];
          const typeConfidence = confidence * (1 - i * 0.1); // Decrease confidence for later options

          if (!matchedTypes.has(type) || matchedTypes.get(type)!.confidence < typeConfidence) {
            matchedTypes.set(type, { confidence: typeConfidence, food: foodKey });
          }
        }
      }
    }

    // If no matches found, try external provider
    if (matchedTypes.size === 0 && this.config.enableExternalSearch) {
      const provider = this.deps.getWineProvider?.();
      if (provider) {
        try {
          const externalResult = await provider.getPairingsForFood(food);
          for (const rec of externalResult.recommendedWineTypes) {
            const wineType = this.normalizeWineType(rec.type);
            if (wineType) {
              matchedTypes.set(wineType, { confidence: rec.confidence, food: normalizedFood });
            }
          }
        } catch (error) {
          console.error('External pairing lookup failed:', error);
        }
      }
    }

    // Build suggestions
    for (const [type, match] of matchedTypes) {
      if (match.confidence >= this.config.minConfidence) {
        const description = WINE_TYPE_DESCRIPTIONS[type][match.food] ??
          WINE_TYPE_DESCRIPTIONS[type]['default'];

        // Find matching wines in cellar
        const cellarWines = await this.deps.store.searchWines(userId, { type });
        const matchingWines = cellarWines.filter(w => {
          // Check if wine has inventory
          return true; // Would need to check inventory store
        });

        suggestions.push({
          wineType: type,
          confidence: match.confidence,
          description,
          matchingWinesInCellar: matchingWines.slice(0, 3),
        });
      }
    }

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);

    // Get specific wine matches from cellar
    const cellarMatches: Array<{ wine: Wine; matchScore: number }> = [];
    const allWines = await this.deps.store.getUserWines(userId);

    for (const wine of allWines) {
      const typeMatch = matchedTypes.get(wine.type);
      if (typeMatch) {
        cellarMatches.push({
          wine,
          matchScore: typeMatch.confidence * (wine.rating ? wine.rating / 5 : 0.7),
        });
      }
    }

    cellarMatches.sort((a, b) => b.matchScore - a.matchScore);

    return {
      suggestions,
      fromCellar: cellarMatches.slice(0, 5),
    };
  }

  /**
   * Get food suggestions for a wine
   */
  async suggestFoodsForWine(wineId: string): Promise<FoodPairingSuggestion[]> {
    const wine = await this.deps.store.getWine(wineId);
    if (!wine) {
      return [];
    }

    return this.getFoodSuggestionsForType(wine.type);
  }

  /**
   * Get food suggestions for a wine type
   */
  getFoodSuggestionsForType(type: WineType): FoodPairingSuggestion[] {
    const suggestions: FoodPairingSuggestion[] = [];

    for (const [food, types] of Object.entries(WINE_TYPE_PAIRINGS)) {
      const typeIndex = types.indexOf(type);
      if (typeIndex !== -1) {
        const confidence = 1.0 - typeIndex * 0.15;
        const category = this.categorizeFood(food);

        suggestions.push({
          food: this.formatFoodName(food),
          category,
          confidence,
        });
      }
    }

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);

    return suggestions.slice(0, 10);
  }

  /**
   * Check if a wine and food pair well
   */
  async evaluatePairing(
    wineId: string,
    food: string
  ): Promise<{
    isGoodPairing: boolean;
    confidence: number;
    explanation: string;
  }> {
    const wine = await this.deps.store.getWine(wineId);
    if (!wine) {
      return {
        isGoodPairing: false,
        confidence: 0,
        explanation: 'Wine not found',
      };
    }

    const normalizedFood = food.toLowerCase().trim();

    // Check direct matches
    for (const [foodKey, types] of Object.entries(WINE_TYPE_PAIRINGS)) {
      if (normalizedFood.includes(foodKey) || foodKey.includes(normalizedFood)) {
        const typeIndex = types.indexOf(wine.type);
        if (typeIndex !== -1) {
          const confidence = 1.0 - typeIndex * 0.15;
          const description = WINE_TYPE_DESCRIPTIONS[wine.type][foodKey] ??
            WINE_TYPE_DESCRIPTIONS[wine.type]['default'];

          return {
            isGoodPairing: confidence >= this.config.minConfidence,
            confidence,
            explanation: `${wine.name} (${wine.type}) ${confidence >= 0.8 ? 'pairs excellently' :
              confidence >= 0.6 ? 'pairs well' : 'can work'} with ${food}. ${description}`,
          };
        }
      }
    }

    // No match found
    return {
      isGoodPairing: false,
      confidence: 0.3,
      explanation: `${wine.name} (${wine.type}) may not be the ideal choice for ${food}, ` +
        `but personal taste varies. Consider trying a different style.`,
    };
  }

  /**
   * Get pairing suggestions for a meal
   */
  async suggestForMeal(
    userId: string,
    courses: string[]
  ): Promise<Array<{
    course: string;
    suggestions: WinePairingSuggestion[];
    recommendedWine?: Wine;
  }>> {
    const results: Array<{
      course: string;
      suggestions: WinePairingSuggestion[];
      recommendedWine?: Wine;
    }> = [];

    for (const course of courses) {
      const { suggestions, fromCellar } = await this.suggestWinesForFood(userId, course);

      results.push({
        course,
        suggestions,
        recommendedWine: fromCellar[0]?.wine,
      });
    }

    return results;
  }

  private normalizeWineType(type: string): WineType | null {
    const normalized = type.toLowerCase();

    if (normalized.includes('red') || normalized.includes('cabernet') ||
        normalized.includes('merlot') || normalized.includes('pinot noir')) {
      return 'red';
    }
    if (normalized.includes('white') || normalized.includes('chardonnay') ||
        normalized.includes('sauvignon blanc') || normalized.includes('riesling')) {
      return 'white';
    }
    if (normalized.includes('rose') || normalized.includes('rosé')) {
      return 'rose';
    }
    if (normalized.includes('sparkling') || normalized.includes('champagne') ||
        normalized.includes('prosecco') || normalized.includes('cava')) {
      return 'sparkling';
    }
    if (normalized.includes('dessert') || normalized.includes('sweet') ||
        normalized.includes('sauternes') || normalized.includes('ice wine')) {
      return 'dessert';
    }
    if (normalized.includes('fortified') || normalized.includes('port') ||
        normalized.includes('sherry') || normalized.includes('madeira')) {
      return 'fortified';
    }

    return null;
  }

  private categorizeFood(food: string): string {
    const categories: Record<string, string[]> = {
      meat: ['steak', 'beef', 'lamb', 'pork', 'veal', 'venison'],
      poultry: ['chicken', 'turkey', 'duck'],
      seafood: ['salmon', 'tuna', 'lobster', 'crab', 'shrimp', 'oysters', 'fish', 'scallops'],
      vegetarian: ['pasta', 'risotto', 'mushrooms', 'salad', 'vegetables'],
      cheese: ['cheese', 'brie', 'cheddar', 'goat cheese', 'blue cheese', 'parmesan'],
      dessert: ['chocolate', 'fruit', 'cake', 'ice cream'],
      cuisine: ['italian', 'french', 'asian', 'thai', 'indian', 'mexican', 'mediterranean', 'japanese', 'sushi'],
    };

    for (const [category, foods] of Object.entries(categories)) {
      if (foods.includes(food.toLowerCase())) {
        return category;
      }
    }

    return 'other';
  }

  private formatFoodName(food: string): string {
    return food.charAt(0).toUpperCase() + food.slice(1);
  }
}

/**
 * Create a pairing engine instance
 */
export function createPairingEngine(
  config: Partial<PairingEngineConfig>,
  deps: PairingEngineDeps
): PairingEngine {
  const fullConfig: PairingEngineConfig = {
    enableExternalSearch: config.enableExternalSearch ?? true,
    minConfidence: config.minConfidence ?? 0.5,
  };

  return new PairingEngine(fullConfig, deps);
}
