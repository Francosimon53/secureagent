/**
 * Car Rental Comparison Engine
 *
 * Compares car rental prices across multiple providers.
 */

import type {
  CarRentalQuote,
  CarRentalSearchParams,
  CarRentalComparisonResult,
  CarRentalPolicies,
  Location,
} from '../../types.js';
import type { CarRentalProvider, CarRentalResult } from '../../providers/base.js';

export interface ComparisonEngineConfig {
  enabled: boolean;
  cacheResultsMinutes: number;
  maxQuotesPerSearch: number;
  defaultVehicleClasses: string[];
}

export interface ComparisonEngineDeps {
  getProviders: () => CarRentalProvider[];
}

interface CacheEntry {
  result: CarRentalComparisonResult;
  expiresAt: number;
}

/**
 * Engine for comparing car rental quotes across providers
 */
export class ComparisonEngine {
  private readonly config: ComparisonEngineConfig;
  private readonly deps: ComparisonEngineDeps;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(config: ComparisonEngineConfig, deps: ComparisonEngineDeps) {
    this.config = config;
    this.deps = deps;
  }

  /**
   * Search and compare car rental quotes
   */
  async searchAndCompare(params: CarRentalSearchParams): Promise<CarRentalComparisonResult> {
    // Check cache
    const cacheKey = this.getCacheKey(params);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const providers = this.deps.getProviders();
    if (providers.length === 0) {
      return {
        searchParams: params,
        quotes: [],
        fetchedAt: Date.now(),
      };
    }

    // Fetch quotes from all providers in parallel
    const quotePromises = providers.map(async provider => {
      try {
        return await provider.searchRentals(
          params.pickupLocation,
          params.dropoffLocation,
          params.pickupTime,
          params.dropoffTime,
          {
            vehicleClass: params.vehicleClass,
            maxDailyRate: params.maxDailyRate,
          }
        );
      } catch (error) {
        console.error(`Error fetching from provider:`, error);
        return [];
      }
    });

    const resultsArrays = await Promise.all(quotePromises);
    const allResults = resultsArrays.flat();

    // Convert to quotes
    const quotes = this.convertToQuotes(allResults, params);

    // Apply filters
    let filteredQuotes = quotes;
    if (params.maxDailyRate) {
      filteredQuotes = filteredQuotes.filter(q => q.dailyRate <= params.maxDailyRate!);
    }
    if (params.vehicleClass && params.vehicleClass.length > 0) {
      filteredQuotes = filteredQuotes.filter(q => params.vehicleClass!.includes(q.vehicleClass));
    }

    // Sort by total cost
    filteredQuotes.sort((a, b) => a.totalCost - b.totalCost);

    // Limit results
    filteredQuotes = filteredQuotes.slice(0, this.config.maxQuotesPerSearch);

    // Find cheapest and best value
    const cheapestQuote = filteredQuotes[0];
    const bestValueQuote = this.findBestValue(filteredQuotes);

    const result: CarRentalComparisonResult = {
      searchParams: params,
      quotes: filteredQuotes,
      cheapestQuote,
      bestValueQuote,
      fetchedAt: Date.now(),
    };

    // Cache result
    this.cache.set(cacheKey, {
      result,
      expiresAt: Date.now() + (this.config.cacheResultsMinutes * 60 * 1000),
    });

    return result;
  }

  /**
   * Get quotes for a specific vehicle class
   */
  async getQuotesByClass(
    params: CarRentalSearchParams,
    vehicleClass: string
  ): Promise<CarRentalQuote[]> {
    const result = await this.searchAndCompare({
      ...params,
      vehicleClass: [vehicleClass],
    });
    return result.quotes;
  }

  /**
   * Get quotes from a specific provider
   */
  async getQuotesByProvider(
    params: CarRentalSearchParams,
    providerName: string
  ): Promise<CarRentalQuote[]> {
    const result = await this.searchAndCompare({
      ...params,
      providers: [providerName],
    });
    return result.quotes.filter(q => q.provider.toLowerCase() === providerName.toLowerCase());
  }

  /**
   * Get cheapest quote
   */
  async getCheapestQuote(params: CarRentalSearchParams): Promise<CarRentalQuote | null> {
    const result = await this.searchAndCompare(params);
    return result.cheapestQuote ?? null;
  }

  /**
   * Get available vehicle classes for a search
   */
  async getAvailableVehicleClasses(params: CarRentalSearchParams): Promise<string[]> {
    const result = await this.searchAndCompare(params);
    const classes = new Set(result.quotes.map(q => q.vehicleClass));
    return Array.from(classes).sort();
  }

  /**
   * Get price range for a search
   */
  async getPriceRange(params: CarRentalSearchParams): Promise<{
    min: number;
    max: number;
    average: number;
    currency: string;
  } | null> {
    const result = await this.searchAndCompare(params);
    if (result.quotes.length === 0) {
      return null;
    }

    const prices = result.quotes.map(q => q.totalCost);
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
      average: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      currency: result.quotes[0].currency,
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  private convertToQuotes(results: CarRentalResult[], params: CarRentalSearchParams): CarRentalQuote[] {
    return results.map(r => ({
      id: `${r.provider}-${r.vehicleClass}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      provider: r.provider,
      providerUrl: r.bookingUrl,
      vehicleClass: r.vehicleClass,
      vehicleType: r.vehicleType,
      vehicleMake: r.vehicleMake,
      vehicleModel: r.vehicleModel,
      dailyRate: r.dailyRate,
      totalCost: r.totalCost,
      currency: r.currency,
      pickupLocation: this.toLocation(params.pickupLocation),
      dropoffLocation: this.toLocation(params.dropoffLocation ?? params.pickupLocation),
      pickupTime: params.pickupTime,
      dropoffTime: params.dropoffTime,
      insuranceIncluded: r.insuranceIncluded,
      features: r.features,
      policies: this.buildPolicies(r),
      fetchedAt: r.fetchedAt,
      expiresAt: Date.now() + (this.config.cacheResultsMinutes * 60 * 1000),
    }));
  }

  private toLocation(input: Location | string): Location {
    if (typeof input === 'string') {
      return {
        lat: 0,
        lng: 0,
        address: input,
        name: input,
      };
    }
    return input;
  }

  private buildPolicies(result: CarRentalResult): CarRentalPolicies {
    return {
      fuelPolicy: 'full_to_full',
      mileagePolicy: result.mileagePolicy,
      mileageLimit: result.mileageLimit,
      cancellationPolicy: 'Free cancellation up to 24 hours before pickup',
      minimumAge: 21,
    };
  }

  private findBestValue(quotes: CarRentalQuote[]): CarRentalQuote | undefined {
    if (quotes.length === 0) {
      return undefined;
    }

    // Score each quote based on price and features
    let bestScore = -Infinity;
    let bestQuote: CarRentalQuote | undefined;

    for (const quote of quotes) {
      let score = 0;

      // Lower price is better (inverse score)
      const avgPrice = quotes.reduce((a, b) => a + b.totalCost, 0) / quotes.length;
      score += (avgPrice - quote.totalCost) / avgPrice * 50;

      // Features add value
      score += quote.features.length * 5;

      // Insurance included is valuable
      if (quote.insuranceIncluded) {
        score += 20;
      }

      // Unlimited mileage is valuable
      if (quote.policies.mileagePolicy === 'unlimited') {
        score += 15;
      }

      if (score > bestScore) {
        bestScore = score;
        bestQuote = quote;
      }
    }

    return bestQuote;
  }

  private getCacheKey(params: CarRentalSearchParams): string {
    const pickup = typeof params.pickupLocation === 'string'
      ? params.pickupLocation
      : `${params.pickupLocation.lat},${params.pickupLocation.lng}`;

    const dropoff = params.dropoffLocation
      ? (typeof params.dropoffLocation === 'string'
          ? params.dropoffLocation
          : `${params.dropoffLocation.lat},${params.dropoffLocation.lng}`)
      : pickup;

    return `${pickup}-${dropoff}-${params.pickupTime}-${params.dropoffTime}`;
  }
}

/**
 * Create a comparison engine instance
 */
export function createComparisonEngine(
  config: Partial<ComparisonEngineConfig>,
  deps: ComparisonEngineDeps
): ComparisonEngine {
  const fullConfig: ComparisonEngineConfig = {
    enabled: config.enabled ?? true,
    cacheResultsMinutes: config.cacheResultsMinutes ?? 15,
    maxQuotesPerSearch: config.maxQuotesPerSearch ?? 20,
    defaultVehicleClasses: config.defaultVehicleClasses ?? ['economy', 'compact', 'midsize', 'suv'],
  };

  return new ComparisonEngine(fullConfig, deps);
}
