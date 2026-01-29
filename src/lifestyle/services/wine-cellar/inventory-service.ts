/**
 * Wine Inventory Service
 *
 * Manages wine cellar inventory operations.
 */

import { randomUUID } from 'crypto';
import type {
  Wine,
  WineInventory,
  WineConsumption,
  WineType,
} from '../../types.js';
import type { WineStore } from '../../stores/wine-store.js';

export interface InventoryServiceConfig {
  lowStockThreshold: number;
  drinkingWindowAlertDays: number;
}

export interface InventoryServiceDeps {
  store: WineStore;
}

export interface InventoryStats {
  totalBottles: number;
  totalValue: number;
  byType: Record<WineType, number>;
  byCountry: Record<string, number>;
  averageRating: number;
  inDrinkingWindow: number;
  expiringSoon: number;
  lowStock: number;
}

export interface InventoryAddResult {
  wine: Wine;
  inventory: WineInventory;
  isNewWine: boolean;
}

/**
 * Wine inventory management service
 */
export class InventoryService {
  private readonly config: InventoryServiceConfig;
  private readonly deps: InventoryServiceDeps;

  constructor(config: InventoryServiceConfig, deps: InventoryServiceDeps) {
    this.config = config;
    this.deps = deps;
  }

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
    // Check if wine already exists
    const existingWines = await this.deps.store.searchWines(wineData.userId, {
      name: wineData.name,
      producer: wineData.producer,
      vintage: wineData.vintage,
    });

    let wine: Wine;
    let isNewWine = false;

    if (existingWines.length > 0) {
      // Use existing wine, optionally update fields
      wine = existingWines[0];
      if (wineData.rating && wineData.rating !== wine.rating) {
        wine = (await this.deps.store.updateWine(wine.id, { rating: wineData.rating }))!;
      }
    } else {
      // Create new wine entry
      wine = await this.deps.store.addWine(wineData);
      isNewWine = true;
    }

    // Add inventory
    const inventory = await this.deps.store.addInventory({
      wineId: wine.id,
      userId: wineData.userId,
      ...inventoryData,
    });

    return { wine, inventory, isNewWine };
  }

  /**
   * Remove bottles from inventory (consume or remove)
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
    const inventory = await this.deps.store.getInventory(inventoryId);
    if (!inventory) {
      return { success: false, remainingQuantity: 0 };
    }

    if (inventory.quantity < quantity) {
      return { success: false, remainingQuantity: inventory.quantity };
    }

    // Update inventory
    const newQuantity = inventory.quantity - quantity;
    await this.deps.store.updateInventory(inventoryId, { quantity: newQuantity });

    // Record consumption if it was consumed
    let consumption: WineConsumption | undefined;
    if (options?.reason === 'consumed' || !options?.reason) {
      consumption = await this.deps.store.recordConsumption({
        inventoryId,
        wineId: inventory.wineId,
        userId: inventory.userId,
        quantity,
        consumedAt: Date.now(),
        rating: options?.rating,
        notes: options?.notes,
        occasion: options?.occasion,
      });
    }

    // Delete inventory if empty
    if (newQuantity === 0) {
      await this.deps.store.deleteInventory(inventoryId);
    }

    return { success: true, remainingQuantity: newQuantity, consumption };
  }

  /**
   * Move bottles to a different location
   */
  async moveBottles(
    inventoryId: string,
    quantity: number,
    newLocation: string
  ): Promise<{ sourceInventory: WineInventory; targetInventory: WineInventory } | null> {
    const sourceInventory = await this.deps.store.getInventory(inventoryId);
    if (!sourceInventory || sourceInventory.quantity < quantity) {
      return null;
    }

    // Check if target location already has this wine
    const existingInventories = await this.deps.store.getInventoryByWine(sourceInventory.wineId);
    const targetInventory = existingInventories.find(i => i.location === newLocation && i.id !== inventoryId);

    let updatedTarget: WineInventory;

    if (targetInventory) {
      // Add to existing inventory at target location
      updatedTarget = (await this.deps.store.updateInventory(targetInventory.id, {
        quantity: targetInventory.quantity + quantity,
      }))!;
    } else {
      // Create new inventory at target location
      updatedTarget = await this.deps.store.addInventory({
        wineId: sourceInventory.wineId,
        userId: sourceInventory.userId,
        quantity,
        location: newLocation,
        purchaseDate: sourceInventory.purchaseDate,
        purchasePrice: sourceInventory.purchasePrice,
        drinkingWindowStart: sourceInventory.drinkingWindowStart,
        drinkingWindowEnd: sourceInventory.drinkingWindowEnd,
      });
    }

    // Update source inventory
    const newSourceQuantity = sourceInventory.quantity - quantity;
    let updatedSource: WineInventory;

    if (newSourceQuantity === 0) {
      await this.deps.store.deleteInventory(inventoryId);
      updatedSource = { ...sourceInventory, quantity: 0 };
    } else {
      updatedSource = (await this.deps.store.updateInventory(inventoryId, {
        quantity: newSourceQuantity,
      }))!;
    }

    return { sourceInventory: updatedSource, targetInventory: updatedTarget };
  }

  /**
   * Get inventory statistics for a user
   */
  async getStats(userId: string): Promise<InventoryStats> {
    const wines = await this.deps.store.getUserWines(userId);
    const now = Date.now();
    const alertCutoff = now + (this.config.drinkingWindowAlertDays * 24 * 60 * 60 * 1000);

    const stats: InventoryStats = {
      totalBottles: 0,
      totalValue: 0,
      byType: {
        red: 0,
        white: 0,
        rose: 0,
        sparkling: 0,
        dessert: 0,
        fortified: 0,
      },
      byCountry: {},
      averageRating: 0,
      inDrinkingWindow: 0,
      expiringSoon: 0,
      lowStock: 0,
    };

    let ratingSum = 0;
    let ratingCount = 0;

    for (const wine of wines) {
      const inventories = await this.deps.store.getInventoryByWine(wine.id);
      const totalQuantity = inventories.reduce((sum, i) => sum + i.quantity, 0);

      stats.totalBottles += totalQuantity;
      stats.byType[wine.type] += totalQuantity;

      if (wine.country) {
        stats.byCountry[wine.country] = (stats.byCountry[wine.country] ?? 0) + totalQuantity;
      }

      if (wine.rating) {
        ratingSum += wine.rating * totalQuantity;
        ratingCount += totalQuantity;
      }

      // Check drinking windows
      for (const inv of inventories) {
        if (inv.purchasePrice) {
          stats.totalValue += inv.purchasePrice * inv.quantity;
        }

        if (inv.drinkingWindowStart && inv.drinkingWindowEnd) {
          if (now >= inv.drinkingWindowStart && now <= inv.drinkingWindowEnd) {
            stats.inDrinkingWindow += inv.quantity;
          }
          if (inv.drinkingWindowEnd <= alertCutoff && inv.drinkingWindowEnd > now) {
            stats.expiringSoon += inv.quantity;
          }
        }

        if (inv.quantity > 0 && inv.quantity <= this.config.lowStockThreshold) {
          stats.lowStock++;
        }
      }
    }

    stats.averageRating = ratingCount > 0 ? ratingSum / ratingCount : 0;

    return stats;
  }

  /**
   * Get wines ready to drink
   */
  async getReadyToDrink(userId: string): Promise<Array<{ wine: Wine; inventory: WineInventory[] }>> {
    const wines = await this.deps.store.getWinesInDrinkingWindow(userId);
    const result: Array<{ wine: Wine; inventory: WineInventory[] }> = [];

    for (const wine of wines) {
      const inventories = await this.deps.store.getInventoryByWine(wine.id);
      const activeInventories = inventories.filter(i => i.quantity > 0);
      if (activeInventories.length > 0) {
        result.push({ wine, inventory: activeInventories });
      }
    }

    return result;
  }

  /**
   * Get wines expiring soon
   */
  async getExpiringSoon(userId: string): Promise<Array<{ wine: Wine; inventory: WineInventory; daysRemaining: number }>> {
    const wines = await this.deps.store.getWinesExpiringSoon(userId, this.config.drinkingWindowAlertDays);
    const result: Array<{ wine: Wine; inventory: WineInventory; daysRemaining: number }> = [];
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;

    for (const wine of wines) {
      const inventories = await this.deps.store.getInventoryByWine(wine.id);

      for (const inv of inventories) {
        if (inv.quantity > 0 && inv.drinkingWindowEnd) {
          const daysRemaining = Math.ceil((inv.drinkingWindowEnd - now) / msPerDay);
          if (daysRemaining > 0 && daysRemaining <= this.config.drinkingWindowAlertDays) {
            result.push({ wine, inventory: inv, daysRemaining });
          }
        }
      }
    }

    return result.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  /**
   * Get low stock wines
   */
  async getLowStock(userId: string): Promise<Array<{ wine: Wine; totalQuantity: number }>> {
    const wines = await this.deps.store.getLowStockWines(userId, this.config.lowStockThreshold);
    const result: Array<{ wine: Wine; totalQuantity: number }> = [];

    for (const wine of wines) {
      const inventories = await this.deps.store.getInventoryByWine(wine.id);
      const totalQuantity = inventories.reduce((sum, i) => sum + i.quantity, 0);
      if (totalQuantity > 0 && totalQuantity <= this.config.lowStockThreshold) {
        result.push({ wine, totalQuantity });
      }
    }

    return result;
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
    return this.deps.store.getConsumptionHistory(userId, options);
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
    const wines = await this.deps.store.searchWines(userId, {
      name: filters.query,
      type: filters.type,
      country: filters.country,
      region: filters.region,
      minRating: filters.minRating,
    });

    const result: Array<{ wine: Wine; inventory: WineInventory[] }> = [];
    const now = Date.now();

    for (const wine of wines) {
      let inventories = await this.deps.store.getInventoryByWine(wine.id);
      inventories = inventories.filter(i => i.quantity > 0);

      if (filters.location) {
        inventories = inventories.filter(i => i.location === filters.location);
      }

      if (filters.inDrinkingWindow) {
        inventories = inventories.filter(i =>
          i.drinkingWindowStart && i.drinkingWindowEnd &&
          now >= i.drinkingWindowStart && now <= i.drinkingWindowEnd
        );
      }

      if (inventories.length > 0) {
        result.push({ wine, inventory: inventories });
      }
    }

    return result;
  }

  /**
   * Get all unique storage locations
   */
  async getLocations(userId: string): Promise<string[]> {
    const wines = await this.deps.store.getUserWines(userId);
    const locations = new Set<string>();

    for (const wine of wines) {
      const inventories = await this.deps.store.getInventoryByWine(wine.id);
      for (const inv of inventories) {
        if (inv.location && inv.quantity > 0) {
          locations.add(inv.location);
        }
      }
    }

    return Array.from(locations).sort();
  }
}

/**
 * Create an inventory service instance
 */
export function createInventoryService(
  config: Partial<InventoryServiceConfig>,
  deps: InventoryServiceDeps
): InventoryService {
  const fullConfig: InventoryServiceConfig = {
    lowStockThreshold: config.lowStockThreshold ?? 2,
    drinkingWindowAlertDays: config.drinkingWindowAlertDays ?? 30,
  };

  return new InventoryService(fullConfig, deps);
}
