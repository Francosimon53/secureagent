/**
 * Base Travel Provider and Registry
 *
 * Abstract base class for all travel providers and a registry
 * for managing provider instances.
 */

import type { TravelProviderConfig, TravelProviderResult } from '../types.js';

/**
 * Abstract base class for all travel providers
 */
export abstract class BaseTravelProvider<TConfig extends TravelProviderConfig = TravelProviderConfig> {
  protected readonly config: TConfig;
  protected readonly apiKey: string | undefined;
  protected initialized = false;

  constructor(config: TConfig) {
    this.config = config;
    this.apiKey = config.apiKeyEnvVar ? process.env[config.apiKeyEnvVar] : undefined;
  }

  /**
   * Get the provider name
   */
  abstract get name(): string;

  /**
   * Get the provider type
   */
  abstract get type(): string;

  /**
   * Initialize the provider
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.apiKey && this.requiresApiKey()) {
      throw new TravelProviderError(
        this.name,
        `API key not found. Set ${this.config.apiKeyEnvVar} environment variable.`
      );
    }

    await this.onInitialize();
    this.initialized = true;
  }

  /**
   * Check if the provider is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if the provider requires an API key
   */
  protected requiresApiKey(): boolean {
    return !!this.config.apiKeyEnvVar;
  }

  /**
   * Hook for subclass initialization
   */
  protected async onInitialize(): Promise<void> {
    // Override in subclasses if needed
  }

  /**
   * Make an HTTP request with common error handling
   */
  protected async fetch<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<TravelProviderResult<T>> {
    const timeout = this.config.timeout ?? 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      const data = await response.json() as T;
      return {
        success: true,
        data,
        cached: false,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: `Request timed out after ${timeout}ms`,
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        cached: false,
        fetchedAt: Date.now(),
      };
    }
  }

  /**
   * Validate that a URL is in the allowed domains list
   */
  protected isAllowedDomain(url: string, allowedDomains: string[]): boolean {
    try {
      const parsedUrl = new URL(url);
      return allowedDomains.some(domain =>
        parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    this.initialized = false;
  }
}

/**
 * Interface for providers that support flight check-in
 */
export interface CheckInCapableProvider {
  /**
   * Check if check-in is available for a flight
   */
  isCheckInAvailable(
    flightNumber: string,
    departureDate: number,
    lastName: string
  ): Promise<boolean>;

  /**
   * Perform check-in for a flight
   */
  performCheckIn(
    confirmationNumber: string,
    lastName: string,
    options?: CheckInOptions
  ): Promise<CheckInResult>;

  /**
   * Get available seats for selection
   */
  getAvailableSeats(
    confirmationNumber: string,
    lastName: string
  ): Promise<SeatMap>;

  /**
   * Select a seat during check-in
   */
  selectSeat(
    confirmationNumber: string,
    passengerId: string,
    seatNumber: string
  ): Promise<boolean>;
}

export interface CheckInOptions {
  selectSeats?: boolean;
  seatPreferences?: {
    window?: boolean;
    aisle?: boolean;
    front?: boolean;
    exitRow?: boolean;
  };
  passengerIds?: string[];
}

export interface CheckInResult {
  success: boolean;
  boardingPasses?: BoardingPassData[];
  seatAssignments?: Record<string, string>;
  errorMessage?: string;
  errorCode?: string;
}

export interface BoardingPassData {
  passengerId: string;
  passengerName: string;
  barcodeData: string;
  barcodeType: 'pdf417' | 'aztec' | 'qr';
  gate?: string;
  boardingTime?: number;
  zone?: string;
  seat?: string;
}

export interface SeatMap {
  cabin: string;
  rows: SeatRow[];
}

export interface SeatRow {
  rowNumber: number;
  seats: SeatInfo[];
}

export interface SeatInfo {
  seatNumber: string;
  column: string;
  isAvailable: boolean;
  isWindow: boolean;
  isAisle: boolean;
  isMiddle: boolean;
  isExitRow: boolean;
  hasPower: boolean;
  hasExtraLegroom: boolean;
  price?: number;
}

/**
 * Interface for price aggregator providers
 */
export interface PriceAggregatorProvider {
  /**
   * Search for flight prices
   */
  searchFlightPrices(
    origin: string,
    destination: string,
    outboundDate: number,
    returnDate?: number,
    options?: FlightSearchOptions
  ): Promise<FlightPriceResult[]>;

  /**
   * Search for hotel prices
   */
  searchHotelPrices(
    destination: string,
    checkInDate: number,
    checkOutDate: number,
    options?: HotelSearchOptions
  ): Promise<HotelPriceResult[]>;
}

export interface FlightSearchOptions {
  passengers?: number;
  cabinClass?: 'economy' | 'premium_economy' | 'business' | 'first';
  flexibleDates?: boolean;
  maxStops?: number;
  airlines?: string[];
}

export interface FlightPriceResult {
  price: number;
  currency: string;
  airline: string;
  flightNumbers: string[];
  outboundDeparture: number;
  outboundArrival: number;
  returnDeparture?: number;
  returnArrival?: number;
  stops: number;
  duration: number;
  cabinClass: string;
  bookingUrl?: string;
  source: string;
  fetchedAt: number;
}

export interface HotelSearchOptions {
  guests?: number;
  rooms?: number;
  starRating?: number[];
  amenities?: string[];
  maxPrice?: number;
}

export interface HotelPriceResult {
  hotelName: string;
  price: number;
  currency: string;
  pricePerNight: number;
  starRating?: number;
  rating?: number;
  reviewCount?: number;
  address?: string;
  amenities?: string[];
  roomType?: string;
  bookingUrl?: string;
  source: string;
  fetchedAt: number;
}

/**
 * Interface for traffic providers
 */
export interface TrafficProvider {
  /**
   * Get travel time and traffic conditions
   */
  getTravelTime(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    departureTime?: number,
    mode?: 'driving' | 'transit' | 'walking' | 'bicycling'
  ): Promise<TrafficResult>;

  /**
   * Get route with detailed traffic information
   */
  getRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    departureTime?: number,
    mode?: 'driving' | 'transit' | 'walking' | 'bicycling'
  ): Promise<RouteResult>;
}

export interface TrafficResult {
  durationSeconds: number;
  durationInTrafficSeconds: number;
  distanceMeters: number;
  trafficCondition: 'light' | 'moderate' | 'heavy' | 'severe';
  fetchedAt: number;
}

export interface RouteResult extends TrafficResult {
  polyline?: string;
  steps?: RouteStep[];
  warnings?: string[];
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  startLocation: { lat: number; lng: number };
  endLocation: { lat: number; lng: number };
}

/**
 * Interface for car rental providers
 */
export interface CarRentalProvider {
  /**
   * Search for car rental quotes
   */
  searchRentals(
    pickupLocation: string | { lat: number; lng: number },
    dropoffLocation: string | { lat: number; lng: number } | undefined,
    pickupTime: number,
    dropoffTime: number,
    options?: CarRentalSearchOptions
  ): Promise<CarRentalResult[]>;
}

export interface CarRentalSearchOptions {
  vehicleClass?: string[];
  features?: string[];
  maxDailyRate?: number;
}

export interface CarRentalResult {
  provider: string;
  vehicleClass: string;
  vehicleType?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  dailyRate: number;
  totalCost: number;
  currency: string;
  features: string[];
  insuranceIncluded: boolean;
  mileagePolicy: 'unlimited' | 'limited';
  mileageLimit?: number;
  bookingUrl?: string;
  source: string;
  fetchedAt: number;
}

/**
 * Travel provider registry for managing multiple providers
 */
export class TravelProviderRegistry {
  private readonly providers = new Map<string, BaseTravelProvider>();
  private readonly defaultProviders = new Map<string, string>();

  /**
   * Register a provider
   */
  register<T extends BaseTravelProvider>(
    type: string,
    name: string,
    provider: T,
    isDefault = false
  ): void {
    const key = `${type}:${name}`;
    this.providers.set(key, provider);

    if (isDefault || !this.defaultProviders.has(type)) {
      this.defaultProviders.set(type, name);
    }
  }

  /**
   * Get a specific provider
   */
  get<T extends BaseTravelProvider>(type: string, name?: string): T | undefined {
    const providerName = name ?? this.defaultProviders.get(type);
    if (!providerName) {
      return undefined;
    }
    return this.providers.get(`${type}:${providerName}`) as T | undefined;
  }

  /**
   * Get the default provider for a type
   */
  getDefault<T extends BaseTravelProvider>(type: string): T | undefined {
    const name = this.defaultProviders.get(type);
    if (!name) {
      return undefined;
    }
    return this.get<T>(type, name);
  }

  /**
   * Check if a provider is registered
   */
  has(type: string, name?: string): boolean {
    if (name) {
      return this.providers.has(`${type}:${name}`);
    }
    return this.defaultProviders.has(type);
  }

  /**
   * List all providers of a type
   */
  list(type: string): string[] {
    const names: string[] = [];
    for (const key of this.providers.keys()) {
      if (key.startsWith(`${type}:`)) {
        names.push(key.split(':')[1]);
      }
    }
    return names;
  }

  /**
   * List all registered provider types
   */
  listTypes(): string[] {
    return Array.from(this.defaultProviders.keys());
  }

  /**
   * Initialize all registered providers
   */
  async initializeAll(): Promise<void> {
    const initPromises: Promise<void>[] = [];
    for (const provider of this.providers.values()) {
      initPromises.push(provider.initialize());
    }
    await Promise.all(initPromises);
  }

  /**
   * Shutdown all registered providers
   */
  async shutdownAll(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];
    for (const provider of this.providers.values()) {
      shutdownPromises.push(provider.shutdown());
    }
    await Promise.all(shutdownPromises);
  }

  /**
   * Remove a provider
   */
  remove(type: string, name: string): boolean {
    const key = `${type}:${name}`;
    const removed = this.providers.delete(key);

    if (this.defaultProviders.get(type) === name) {
      const remaining = this.list(type);
      if (remaining.length > 0) {
        this.defaultProviders.set(type, remaining[0]);
      } else {
        this.defaultProviders.delete(type);
      }
    }

    return removed;
  }

  /**
   * Clear all providers
   */
  clear(): void {
    this.providers.clear();
    this.defaultProviders.clear();
  }
}

/**
 * Travel provider error class
 */
export class TravelProviderError extends Error {
  constructor(
    public readonly providerName: string,
    message: string,
    public readonly cause?: Error
  ) {
    super(`[${providerName}] ${message}`);
    this.name = 'TravelProviderError';
  }
}

// Global travel provider registry instance
let globalTravelRegistry: TravelProviderRegistry | null = null;

/**
 * Get the global travel provider registry
 */
export function getTravelProviderRegistry(): TravelProviderRegistry {
  if (!globalTravelRegistry) {
    globalTravelRegistry = new TravelProviderRegistry();
  }
  return globalTravelRegistry;
}

/**
 * Initialize the global travel provider registry
 */
export function initTravelProviderRegistry(): TravelProviderRegistry {
  globalTravelRegistry = new TravelProviderRegistry();
  return globalTravelRegistry;
}
