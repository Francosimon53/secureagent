/**
 * Wine Cellar Service
 *
 * High-level service for wine cellar management.
 */

export {
  InventoryService,
  createInventoryService,
  type InventoryServiceConfig,
  type InventoryServiceDeps,
  type InventoryStats,
  type InventoryAddResult,
} from './inventory-service.js';

export {
  PairingEngine,
  createPairingEngine,
  type PairingEngineConfig,
  type PairingEngineDeps,
  type WinePairingSuggestion,
  type FoodPairingSuggestion,
} from './pairing-engine.js';

import type { Wine, WineInventory, WineConsumption, WineType } from '../../types.js';
import type { WineStore } from '../../stores/wine-store.js';
import type { WineProvider } from '../../providers/base.js';
import {
  InventoryService,
  createInventoryService,
  type InventoryStats,
  type InventoryAddResult,
} from './inventory-service.js';
import {
  PairingEngine,
  createPairingEngine,
  type WinePairingSuggestion,
  type FoodPairingSuggestion,
} from './pairing-engine.js';

export interface WineCellarServiceConfig {
  enabled?: boolean;
  lowStockThreshold?: number;
  drinkingWindowAlertDays?: number;
  enablePairingSearch?: boolean;
}

export interface WineCellarServiceDeps {
  store: WineStore;
  getWineProvider?: () => WineProvider | undefined;
}

/**
 * High-level wine cellar service
 */
export class WineCellarService {
  private readonly inventory: InventoryService;
  private readonly pairing: PairingEngine;
  private readonly config: WineCellarServiceConfig;

  constructor(config: WineCellarServiceConfig, deps: WineCellarServiceDeps) {
    this.config = config;

    this.inventory = createInventoryService(
      {
        lowStockThreshold: config.lowStockThreshold,
        drinkingWindowAlertDays: config.drinkingWindowAlertDays,
      },
      { store: deps.store }
    );

    this.pairing = createPairingEngine(
      {
        enableExternalSearch: config.enablePairingSearch,
      },
      {
        store: deps.store,
        getWineProvider: deps.getWineProvider,
      }
    );
  }

  // === Inventory Operations ===

  /**
   * Add wine to the cellar
   */
  async addWine(
    wineData: Omit<Wine, 'id' | 'createdAt' | 'updatedAt'>,
    inventoryData: {
      quantity: number;
      location?: string;
      purchaseDate?: number;
      purchasePrice?: number;
      drinkingWindowStart?: number;
      drinkingWindowEnd?: number;
      notes?: string;
    }
  ): Promise<InventoryAddResult> {
    return this.inventory.addWine(wineData, inventoryData);
  }

  /**
   * Remove bottles from inventory
   */
  async removeBottles(
    inventoryId: string,
    quantity: number,
    options?: {
      reason?: 'consumed' | 'gifted' | 'broken' | 'other';
      rating?: number;
      notes?: string;
      occasion?: string;
    }
  ): Promise<{ success: boolean; remainingQuantity: number; consumption?: WineConsumption }> {
    return this.inventory.removeBottles(inventoryId, quantity, options);
  }

  /**
   * Move bottles to a different location
   */
  async moveBottles(
    inventoryId: string,
    quantity: number,
    newLocation: string
  ): Promise<{ sourceInventory: WineInventory; targetInventory: WineInventory } | null> {
    return this.inventory.moveBottles(inventoryId, quantity, newLocation);
  }

  /**
   * Get inventory statistics
   */
  async getStats(userId: string): Promise<InventoryStats> {
    return this.inventory.getStats(userId);
  }

  /**
   * Get wines ready to drink
   */
  async getReadyToDrink(userId: string): Promise<Array<{ wine: Wine; inventory: WineInventory[] }>> {
    return this.inventory.getReadyToDrink(userId);
  }

  /**
   * Get wines expiring soon
   */
  async getExpiringSoon(userId: string): Promise<Array<{ wine: Wine; inventory: WineInventory; daysRemaining: number }>> {
    return this.inventory.getExpiringSoon(userId);
  }

  /**
   * Get low stock wines
   */
  async getLowStock(userId: string): Promise<Array<{ wine: Wine; totalQuantity: number }>> {
    return this.inventory.getLowStock(userId);
  }

  /**
   * Get consumption history
   */
  async getConsumptionHistory(
    userId: string,
    options?: {
      startDate?: number;
      endDate?: number;
      wineId?: string;
      limit?: number;
    }
  ): Promise<WineConsumption[]> {
    return this.inventory.getConsumptionHistory(userId, options);
  }

  /**
   * Search inventory
   */
  async searchInventory(
    userId: string,
    filters: {
      query?: string;
      type?: WineType;
      country?: string;
      region?: string;
      minRating?: number;
      location?: string;
      inDrinkingWindow?: boolean;
    }
  ): Promise<Array<{ wine: Wine; inventory: WineInventory[] }>> {
    return this.inventory.searchInventory(userId, filters);
  }

  /**
   * Get all storage locations
   */
  async getLocations(userId: string): Promise<string[]> {
    return this.inventory.getLocations(userId);
  }

  // === Pairing Operations ===

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
    return this.pairing.suggestWinesForFood(userId, food);
  }

  /**
   * Get food suggestions for a wine
   */
  async suggestFoodsForWine(wineId: string): Promise<FoodPairingSuggestion[]> {
    return this.pairing.suggestFoodsForWine(wineId);
  }

  /**
   * Get food suggestions for a wine type
   */
  getFoodSuggestionsForType(type: WineType): FoodPairingSuggestion[] {
    return this.pairing.getFoodSuggestionsForType(type);
  }

  /**
   * Evaluate a wine and food pairing
   */
  async evaluatePairing(
    wineId: string,
    food: string
  ): Promise<{
    isGoodPairing: boolean;
    confidence: number;
    explanation: string;
  }> {
    return this.pairing.evaluatePairing(wineId, food);
  }

  /**
   * Get pairing suggestions for a multi-course meal
   */
  async suggestForMeal(
    userId: string,
    courses: string[]
  ): Promise<Array<{
    course: string;
    suggestions: WinePairingSuggestion[];
    recommendedWine?: Wine;
  }>> {
    return this.pairing.suggestForMeal(userId, courses);
  }

  // === Service Accessors ===

  getInventoryService(): InventoryService {
    return this.inventory;
  }

  getPairingEngine(): PairingEngine {
    return this.pairing;
  }
}

/**
 * Create a wine cellar service instance
 */
export function createWineCellarService(
  config: WineCellarServiceConfig,
  deps: WineCellarServiceDeps
): WineCellarService {
  return new WineCellarService(config, deps);
}
