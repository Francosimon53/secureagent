/**
 * Travel Module
 *
 * Provides travel automation features including flight auto-check-in,
 * price monitoring, car rental comparison, itinerary consolidation,
 * and traffic-based departure alerts.
 */

// Types
export * from './types.js';

// Configuration
export {
  TravelConfigSchema,
  CheckInConfigSchema,
  TravelPriceMonitoringConfigSchema,
  CarRentalConfigSchema,
  ItineraryConfigSchema,
  DepartureAlertsConfigSchema,
  validateTravelConfig,
  safeParseTravelConfig,
  getDefaultTravelConfig,
  type TravelConfig,
  type CheckInConfig,
  type TravelPriceMonitoringConfig,
  type CarRentalConfig,
  type ItineraryConfig,
  type DepartureAlertsConfig,
} from './config.js';

// Stores
export {
  type TripStore,
  type DatabaseAdapter,
  DatabaseTripStore,
  InMemoryTripStore,
  createTripStore,
  type BookingStore,
  DatabaseBookingStore,
  InMemoryBookingStore,
  createBookingStore,
  type TravelPriceAlertStore,
  DatabaseTravelPriceAlertStore,
  InMemoryTravelPriceAlertStore,
  createTravelPriceAlertStore,
  type CheckInStore,
  type ScheduledCheckIn,
  DatabaseCheckInStore,
  InMemoryCheckInStore,
  createCheckInStore,
} from './stores/index.js';

// Providers
export {
  BaseTravelProvider,
  TravelProviderRegistry,
  TravelProviderError,
  getTravelProviderRegistry,
  initTravelProviderRegistry,
  type CheckInCapableProvider,
  type PriceAggregatorProvider,
  type TrafficProvider,
  type CarRentalProvider,
  UnitedProvider,
  createUnitedProvider,
  DeltaProvider,
  createDeltaProvider,
  SouthwestProvider,
  createSouthwestProvider,
  GoogleMapsProvider,
  createGoogleMapsProvider,
  GoogleFlightsProvider,
  createGoogleFlightsProvider,
  KayakProvider,
  createKayakProvider,
} from './providers/index.js';

// Services
export {
  CheckInScheduler,
  createCheckInScheduler,
  CheckInService,
  createCheckInService,
} from './services/checkin/index.js';

export {
  AlertEngine,
  createAlertEngine,
  PriceMonitoringService,
  createPriceMonitoringService,
} from './services/price-monitoring/index.js';

export {
  ComparisonEngine,
  createComparisonEngine,
  CarRentalService,
  createCarRentalService,
} from './services/car-rental/index.js';

export {
  ItineraryConsolidator,
  createItineraryConsolidator,
  ItineraryService,
  createItineraryService,
} from './services/itinerary/index.js';

export {
  TrafficMonitor,
  createTrafficMonitor,
  DepartureAlertService,
  createDepartureAlertService,
} from './services/departure/index.js';

// Event constants
export const TRAVEL_EVENTS = {
  // Check-in events
  CHECKIN_AVAILABLE: 'travel.checkin.available',
  CHECKIN_COMPLETED: 'travel.checkin.completed',
  CHECKIN_FAILED: 'travel.checkin.failed',
  // Price events
  PRICE_DROP_DETECTED: 'travel.price.drop-detected',
  PRICE_TARGET_REACHED: 'travel.price.target-reached',
  PRICE_INCREASE_DETECTED: 'travel.price.increase-detected',
  // Booking events
  BOOKING_CREATED: 'travel.booking.created',
  BOOKING_REMINDER: 'travel.booking.reminder',
  BOOKING_CANCELLED: 'travel.booking.cancelled',
  // Departure events
  DEPARTURE_ALERT: 'travel.departure.alert',
  DEPARTURE_LEAVE_NOW: 'travel.departure.leave-now',
  DEPARTURE_TRAFFIC_UPDATE: 'travel.departure.traffic-update',
  // Trip events
  TRIP_CREATED: 'travel.trip.created',
  TRIP_STARTED: 'travel.trip.started',
  TRIP_COMPLETED: 'travel.trip.completed',
  TRIP_CANCELLED: 'travel.trip.cancelled',
} as const;

import type { TravelConfig } from './config.js';
import type { DatabaseAdapter } from './stores/index.js';
import { TravelConfigSchema } from './config.js';
import { createTripStore, type TripStore } from './stores/trip-store.js';
import { createBookingStore, type BookingStore } from './stores/booking-store.js';
import { createTravelPriceAlertStore, type TravelPriceAlertStore } from './stores/price-alert-store.js';
import { createCheckInStore, type CheckInStore } from './stores/checkin-store.js';
import { initTravelProviderRegistry, type TravelProviderRegistry } from './providers/base.js';
import { createUnitedProvider, createDeltaProvider, createSouthwestProvider } from './providers/airlines/index.js';
import { createGoogleMapsProvider } from './providers/traffic/index.js';
import { createGoogleFlightsProvider, createKayakProvider } from './providers/aggregators/index.js';
import { CheckInService, createCheckInService } from './services/checkin/index.js';
import { PriceMonitoringService, createPriceMonitoringService } from './services/price-monitoring/index.js';
import { CarRentalService, createCarRentalService } from './services/car-rental/index.js';
import { ItineraryService, createItineraryService } from './services/itinerary/index.js';
import { DepartureAlertService, createDepartureAlertService } from './services/departure/index.js';

/**
 * Travel Module Manager
 */
export class TravelManager {
  private initialized = false;
  private config: TravelConfig;

  // Stores
  private tripStore!: TripStore;
  private bookingStore!: BookingStore;
  private priceAlertStore!: TravelPriceAlertStore;
  private checkInStore!: CheckInStore;

  // Provider registry
  private providerRegistry!: TravelProviderRegistry;

  // Services
  private checkInService?: CheckInService;
  private priceMonitoringService?: PriceMonitoringService;
  private carRentalService?: CarRentalService;
  private itineraryService?: ItineraryService;
  private departureAlertService?: DepartureAlertService;

  constructor(config?: Partial<TravelConfig>) {
    const result = TravelConfigSchema.safeParse(config ?? {});
    this.config = result.success ? result.data : TravelConfigSchema.parse({});
  }

  /**
   * Initialize the travel manager
   */
  async initialize(dbAdapter?: DatabaseAdapter): Promise<void> {
    if (this.initialized) {
      return;
    }

    const storeType = dbAdapter ? 'database' : 'memory';

    // Initialize stores
    this.tripStore = createTripStore(storeType as 'memory', dbAdapter as never);
    this.bookingStore = createBookingStore(storeType as 'memory', dbAdapter as never);
    this.priceAlertStore = createTravelPriceAlertStore(storeType as 'memory', dbAdapter as never);
    this.checkInStore = createCheckInStore(storeType as 'memory', dbAdapter as never);

    await Promise.all([
      this.tripStore.initialize(),
      this.bookingStore.initialize(),
      this.priceAlertStore.initialize(),
      this.checkInStore.initialize(),
    ]);

    // Initialize provider registry
    this.providerRegistry = initTravelProviderRegistry();
    await this.registerProviders();

    // Initialize services
    this.initializeServices();

    this.initialized = true;
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  private async registerProviders(): Promise<void> {
    // Register airline providers
    if (this.config.checkIn?.enabled !== false) {
      const airlines = this.config.checkIn?.supportedAirlines ?? ['united', 'delta', 'southwest'];

      if (airlines.includes('united')) {
        const united = createUnitedProvider();
        await united.initialize();
        this.providerRegistry.register('airline', 'united', united, true);
      }

      if (airlines.includes('delta')) {
        const delta = createDeltaProvider();
        await delta.initialize();
        this.providerRegistry.register('airline', 'delta', delta);
      }

      if (airlines.includes('southwest')) {
        const southwest = createSouthwestProvider();
        await southwest.initialize();
        this.providerRegistry.register('airline', 'southwest', southwest);
      }
    }

    // Register traffic provider
    if (this.config.departureAlerts?.enabled !== false) {
      try {
        const googleMaps = createGoogleMapsProvider(this.config.trafficApiKeyEnvVar);
        await googleMaps.initialize();
        this.providerRegistry.register('traffic', 'google-maps', googleMaps, true);
      } catch {
        // Traffic provider optional
      }
    }

    // Register price aggregators
    if (this.config.priceMonitoring?.enabled !== false) {
      const googleFlights = createGoogleFlightsProvider();
      await googleFlights.initialize();
      this.providerRegistry.register('aggregator', 'google-flights', googleFlights, true);

      const kayak = createKayakProvider();
      await kayak.initialize();
      this.providerRegistry.register('aggregator', 'kayak', kayak);
    }
  }

  private initializeServices(): void {
    // Check-in service
    if (this.config.checkIn?.enabled !== false) {
      this.checkInService = createCheckInService(
        this.config.checkIn ?? {},
        {
          checkInStore: this.checkInStore,
          bookingStore: this.bookingStore,
          getAirlineProvider: (airline) =>
            this.providerRegistry.get('airline', airline.toLowerCase()) as never,
        }
      );
    }

    // Price monitoring service
    if (this.config.priceMonitoring?.enabled !== false) {
      this.priceMonitoringService = createPriceMonitoringService(
        this.config.priceMonitoring ?? {},
        {
          store: this.priceAlertStore,
          getFlightAggregator: () => this.providerRegistry.get('aggregator', 'google-flights') as never,
          getHotelAggregator: () => this.providerRegistry.get('aggregator', 'kayak') as never,
        }
      );
    }

    // Car rental service
    if (this.config.carRental?.enabled !== false) {
      this.carRentalService = createCarRentalService(
        this.config.carRental ?? {},
        {
          getProvider: (name) => this.providerRegistry.get('car-rental', name) as never,
          listProviders: () => this.providerRegistry.list('car-rental'),
        }
      );
    }

    // Itinerary service
    if (this.config.itinerary?.enabled !== false) {
      this.itineraryService = createItineraryService(
        this.config.itinerary ?? {},
        {
          tripStore: this.tripStore,
          bookingStore: this.bookingStore,
        }
      );
    }

    // Departure alert service
    if (this.config.departureAlerts?.enabled !== false) {
      this.departureAlertService = createDepartureAlertService(
        this.config.departureAlerts ?? {},
        {
          bookingStore: this.bookingStore,
          getTrafficProvider: () => this.providerRegistry.get('traffic', 'google-maps') as never,
        }
      );
    }
  }

  /**
   * Start all services
   */
  start(): void {
    this.ensureInitialized();

    this.checkInService?.start();
    this.priceMonitoringService?.start();
    this.departureAlertService?.start();
  }

  /**
   * Stop all services
   */
  stop(): void {
    this.checkInService?.stop();
    this.priceMonitoringService?.stop();
    this.departureAlertService?.stop();
  }

  /**
   * Shutdown the travel manager
   */
  async shutdown(): Promise<void> {
    this.stop();
    await this.providerRegistry?.shutdownAll();
    this.initialized = false;
  }

  // Service getters
  getTripStore(): TripStore {
    this.ensureInitialized();
    return this.tripStore;
  }

  getBookingStore(): BookingStore {
    this.ensureInitialized();
    return this.bookingStore;
  }

  getCheckInService(): CheckInService {
    this.ensureInitialized();
    if (!this.checkInService) {
      throw new Error('Check-in service not enabled');
    }
    return this.checkInService;
  }

  getPriceMonitoringService(): PriceMonitoringService {
    this.ensureInitialized();
    if (!this.priceMonitoringService) {
      throw new Error('Price monitoring service not enabled');
    }
    return this.priceMonitoringService;
  }

  getCarRentalService(): CarRentalService {
    this.ensureInitialized();
    if (!this.carRentalService) {
      throw new Error('Car rental service not enabled');
    }
    return this.carRentalService;
  }

  getItineraryService(): ItineraryService {
    this.ensureInitialized();
    if (!this.itineraryService) {
      throw new Error('Itinerary service not enabled');
    }
    return this.itineraryService;
  }

  getDepartureAlertService(): DepartureAlertService {
    this.ensureInitialized();
    if (!this.departureAlertService) {
      throw new Error('Departure alert service not enabled');
    }
    return this.departureAlertService;
  }

  getProviderRegistry(): TravelProviderRegistry {
    this.ensureInitialized();
    return this.providerRegistry;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('TravelManager not initialized. Call initialize() first.');
    }
  }
}

// Global singleton
let globalTravelManager: TravelManager | null = null;

/**
 * Initialize the travel module
 */
export async function initTravel(
  config?: Partial<TravelConfig>,
  dbAdapter?: DatabaseAdapter
): Promise<TravelManager> {
  globalTravelManager = new TravelManager(config);
  await globalTravelManager.initialize(dbAdapter);
  return globalTravelManager;
}

/**
 * Get the travel manager
 */
export function getTravelManager(): TravelManager {
  if (!globalTravelManager) {
    throw new Error('TravelManager not initialized. Call initTravel() first.');
  }
  return globalTravelManager;
}

/**
 * Check if travel module is initialized
 */
export function isTravelInitialized(): boolean {
  return globalTravelManager?.isInitialized() ?? false;
}
