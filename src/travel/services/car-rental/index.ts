/**
 * Car Rental Service
 *
 * Manages car rental searches and comparisons.
 */

export {
  ComparisonEngine,
  createComparisonEngine,
  type ComparisonEngineConfig,
  type ComparisonEngineDeps,
} from './comparison-engine.js';

import type {
  CarRentalQuote,
  CarRentalSearchParams,
  CarRentalComparisonResult,
  Location,
} from '../../types.js';
import type { CarRentalProvider } from '../../providers/base.js';
import { ComparisonEngine, createComparisonEngine, type ComparisonEngineConfig } from './comparison-engine.js';

export interface CarRentalServiceConfig extends Partial<ComparisonEngineConfig> {
  enabled?: boolean;
  providers?: string[];
}

export interface CarRentalServiceDeps {
  getProvider: (name: string) => CarRentalProvider | undefined;
  listProviders: () => string[];
}

/**
 * High-level car rental service
 */
export class CarRentalService {
  private readonly engine: ComparisonEngine;
  private readonly deps: CarRentalServiceDeps;
  private readonly config: CarRentalServiceConfig;

  constructor(config: CarRentalServiceConfig, deps: CarRentalServiceDeps) {
    this.config = config;
    this.deps = deps;

    this.engine = createComparisonEngine(config, {
      getProviders: () => {
        const providerNames = config.providers ?? deps.listProviders();
        return providerNames
          .map(name => deps.getProvider(name))
          .filter((p): p is CarRentalProvider => p !== undefined);
      },
    });
  }

  /**
   * Search for car rentals
   */
  async search(params: {
    pickupLocation: Location | string;
    dropoffLocation?: Location | string;
    pickupDate: number;
    dropoffDate: number;
    vehicleClass?: string[];
    maxDailyRate?: number;
  }): Promise<CarRentalComparisonResult> {
    const searchParams: CarRentalSearchParams = {
      pickupLocation: params.pickupLocation,
      dropoffLocation: params.dropoffLocation,
      pickupTime: params.pickupDate,
      dropoffTime: params.dropoffDate,
      vehicleClass: params.vehicleClass,
      maxDailyRate: params.maxDailyRate,
    };

    return this.engine.searchAndCompare(searchParams);
  }

  /**
   * Get the cheapest rental for given criteria
   */
  async getCheapest(params: {
    pickupLocation: Location | string;
    dropoffLocation?: Location | string;
    pickupDate: number;
    dropoffDate: number;
    vehicleClass?: string;
  }): Promise<CarRentalQuote | null> {
    const searchParams: CarRentalSearchParams = {
      pickupLocation: params.pickupLocation,
      dropoffLocation: params.dropoffLocation,
      pickupTime: params.pickupDate,
      dropoffTime: params.dropoffDate,
      vehicleClass: params.vehicleClass ? [params.vehicleClass] : undefined,
    };

    return this.engine.getCheapestQuote(searchParams);
  }

  /**
   * Get quotes for a specific vehicle class
   */
  async getQuotesByVehicleClass(
    pickupLocation: Location | string,
    pickupDate: number,
    dropoffDate: number,
    vehicleClass: string
  ): Promise<CarRentalQuote[]> {
    return this.engine.getQuotesByClass(
      {
        pickupLocation,
        pickupTime: pickupDate,
        dropoffTime: dropoffDate,
      },
      vehicleClass
    );
  }

  /**
   * Get quotes from a specific provider
   */
  async getQuotesByProvider(
    pickupLocation: Location | string,
    pickupDate: number,
    dropoffDate: number,
    providerName: string
  ): Promise<CarRentalQuote[]> {
    return this.engine.getQuotesByProvider(
      {
        pickupLocation,
        pickupTime: pickupDate,
        dropoffTime: dropoffDate,
      },
      providerName
    );
  }

  /**
   * Get available vehicle classes
   */
  async getAvailableVehicleClasses(
    pickupLocation: Location | string,
    pickupDate: number,
    dropoffDate: number
  ): Promise<string[]> {
    return this.engine.getAvailableVehicleClasses({
      pickupLocation,
      pickupTime: pickupDate,
      dropoffTime: dropoffDate,
    });
  }

  /**
   * Get price range for a location and dates
   */
  async getPriceRange(
    pickupLocation: Location | string,
    pickupDate: number,
    dropoffDate: number
  ): Promise<{
    min: number;
    max: number;
    average: number;
    currency: string;
  } | null> {
    return this.engine.getPriceRange({
      pickupLocation,
      pickupTime: pickupDate,
      dropoffTime: dropoffDate,
    });
  }

  /**
   * List available providers
   */
  listAvailableProviders(): string[] {
    return this.config.providers ?? this.deps.listProviders();
  }

  /**
   * Clear the search cache
   */
  clearCache(): void {
    this.engine.clearCache();
  }
}

/**
 * Create a car rental service instance
 */
export function createCarRentalService(
  config: CarRentalServiceConfig,
  deps: CarRentalServiceDeps
): CarRentalService {
  return new CarRentalService(config, deps);
}
