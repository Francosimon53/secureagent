/**
 * Travel Module Tests
 *
 * Unit and integration tests for the travel module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  // Manager
  TravelManager,
  initTravel,
  getTravelManager,
  isTravelInitialized,

  // Config
  TravelConfigSchema,
  validateTravelConfig,
  safeParseTravelConfig,
  getDefaultTravelConfig,

  // Stores
  createTripStore,
  createBookingStore,
  createTravelPriceAlertStore,
  createCheckInStore,

  // Services
  createCheckInScheduler,
  createTrafficMonitor,
  createComparisonEngine,
  createItineraryConsolidator,

  // Providers
  initTravelProviderRegistry,
  createUnitedProvider,
  createDeltaProvider,
  createSouthwestProvider,
  createGoogleFlightsProvider,

  // Types
  type TripStore,
  type BookingStore,
  type TravelPriceAlertStore,
  type CheckInStore,
  type Trip,
  type FlightBooking,
  type TravelPriceAlert,
} from '../../src/travel/index.js';

// =============================================================================
// Configuration Tests
// =============================================================================

describe('Travel Configuration', () => {
  it('should parse valid configuration', () => {
    const config = validateTravelConfig({
      enabled: true,
      storeType: 'memory',
    });

    expect(config.enabled).toBe(true);
    expect(config.storeType).toBe('memory');
  });

  it('should apply default values', () => {
    const config = getDefaultTravelConfig();

    expect(config.enabled).toBe(true);
    expect(config.storeType).toBe('database');
    // Feature configs are optional by default
    expect(config.checkIn).toBeUndefined();

    // When explicitly provided, they get defaults
    const configWithCheckIn = validateTravelConfig({ checkIn: {} });
    expect(configWithCheckIn.checkIn?.autoCheckInEnabled).toBe(true);
    expect(configWithCheckIn.checkIn?.checkInAdvanceMinutes).toBe(1);
  });

  it('should validate with safeParse', () => {
    const result = safeParseTravelConfig({
      enabled: true,
      checkIn: {
        maxRetries: 5,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.checkIn?.maxRetries).toBe(5);
    }
  });

  it('should reject invalid configuration', () => {
    const result = safeParseTravelConfig({
      enabled: 'invalid', // Should be boolean
    });

    expect(result.success).toBe(false);
  });

  it('should validate nested feature configs', () => {
    const result = TravelConfigSchema.safeParse({
      priceMonitoring: {
        flightCheckIntervalMinutes: 120,
        maxAlertsPerUser: 30,
      },
      departureAlerts: {
        checkIntervalMinutes: 10,
        startMonitoringHoursBefore: 6,
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.priceMonitoring?.flightCheckIntervalMinutes).toBe(120);
    expect(result.data?.departureAlerts?.checkIntervalMinutes).toBe(10);
  });
});

// =============================================================================
// Trip Store Tests
// =============================================================================

describe('TripStore', () => {
  let store: TripStore;

  beforeEach(async () => {
    store = createTripStore('memory');
    await store.initialize();
  });

  it('should create a trip', async () => {
    const trip = await store.createTrip({
      userId: 'user-1',
      name: 'Summer Vacation',
      destination: 'Paris, France',
      startDate: Date.now() + 86400000 * 30,
      endDate: Date.now() + 86400000 * 37,
      status: 'planning',
    });

    expect(trip.id).toBeDefined();
    expect(trip.name).toBe('Summer Vacation');
    expect(trip.destination).toBe('Paris, France');
    expect(trip.status).toBe('planning');
  });

  it('should get a trip by ID', async () => {
    const created = await store.createTrip({
      userId: 'user-1',
      name: 'Business Trip',
      destination: 'New York',
      startDate: Date.now(),
      endDate: Date.now() + 86400000,
      status: 'booked',
    });

    const retrieved = await store.getTrip(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(created.id);
    expect(retrieved?.name).toBe('Business Trip');
  });

  it('should update a trip', async () => {
    const trip = await store.createTrip({
      userId: 'user-1',
      name: 'Original',
      destination: 'London',
      startDate: Date.now(),
      endDate: Date.now() + 86400000,
      status: 'planning',
    });

    const updated = await store.updateTrip(trip.id, {
      name: 'Updated Trip',
      status: 'booked',
    });

    expect(updated?.name).toBe('Updated Trip');
    expect(updated?.status).toBe('booked');
  });

  it('should get trips by user', async () => {
    await store.createTrip({
      userId: 'user-1',
      name: 'Trip 1',
      destination: 'Paris',
      startDate: Date.now(),
      endDate: Date.now() + 86400000,
      status: 'planning',
    });

    await store.createTrip({
      userId: 'user-1',
      name: 'Trip 2',
      destination: 'Rome',
      startDate: Date.now() + 86400000 * 30,
      endDate: Date.now() + 86400000 * 37,
      status: 'booked',
    });

    await store.createTrip({
      userId: 'user-2',
      name: 'Trip 3',
      destination: 'Berlin',
      startDate: Date.now(),
      endDate: Date.now() + 86400000,
      status: 'planning',
    });

    const user1Trips = await store.listTrips('user-1');
    expect(user1Trips).toHaveLength(2);

    const user2Trips = await store.listTrips('user-2');
    expect(user2Trips).toHaveLength(1);
  });

  it('should get upcoming trips', async () => {
    const now = Date.now();

    await store.createTrip({
      userId: 'user-1',
      name: 'Past Trip',
      destination: 'Past',
      startDate: now - 86400000 * 10,
      endDate: now - 86400000 * 5,
      status: 'completed',
    });

    await store.createTrip({
      userId: 'user-1',
      name: 'Future Trip',
      destination: 'Future',
      startDate: now + 86400000 * 10,
      endDate: now + 86400000 * 15,
      status: 'booked',
    });

    const upcoming = await store.getUpcomingTrips('user-1');
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].name).toBe('Future Trip');
  });

  it('should delete a trip', async () => {
    const trip = await store.createTrip({
      userId: 'user-1',
      name: 'To Delete',
      destination: 'Nowhere',
      startDate: Date.now(),
      endDate: Date.now() + 86400000,
      status: 'planning',
    });

    const deleted = await store.deleteTrip(trip.id);
    expect(deleted).toBe(true);

    const retrieved = await store.getTrip(trip.id);
    expect(retrieved).toBeNull();
  });
});

// =============================================================================
// Booking Store Tests
// =============================================================================

describe('BookingStore', () => {
  let store: BookingStore;

  beforeEach(async () => {
    store = createBookingStore('memory');
    await store.initialize();
  });

  it('should create a flight booking', async () => {
    const booking = await store.createBooking({
      tripId: 'trip-1',
      userId: 'user-1',
      type: 'flight',
      status: 'confirmed',
      confirmationNumber: 'ABC123',
      provider: 'United',
      startTime: Date.now() + 86400000,
      endTime: Date.now() + 86400000 + 18000000,
      airline: 'United',
      flightNumber: 'UA123',
      departureAirport: 'SFO',
      arrivalAirport: 'JFK',
      departureTime: Date.now() + 86400000,
      arrivalTime: Date.now() + 86400000 + 18000000,
      checkInOpensAt: Date.now() + 86400000 - 86400000,
      checkInStatus: 'not_available',
    } as FlightBooking);

    expect(booking.id).toBeDefined();
    expect(booking.type).toBe('flight');
    expect((booking as FlightBooking).flightNumber).toBe('UA123');
  });

  it('should get bookings by trip', async () => {
    await store.createBooking({
      tripId: 'trip-1',
      userId: 'user-1',
      type: 'flight',
      status: 'confirmed',
      confirmationNumber: 'ABC123',
      provider: 'United',
      startTime: Date.now(),
      endTime: Date.now() + 18000000,
      airline: 'United',
      flightNumber: 'UA123',
      departureAirport: 'SFO',
      arrivalAirport: 'JFK',
      departureTime: Date.now(),
      arrivalTime: Date.now() + 18000000,
      checkInOpensAt: Date.now() - 86400000,
      checkInStatus: 'not_available',
    } as FlightBooking);

    await store.createBooking({
      tripId: 'trip-1',
      userId: 'user-1',
      type: 'hotel',
      status: 'confirmed',
      confirmationNumber: 'HTL456',
      provider: 'Marriott',
      startTime: Date.now(),
      endTime: Date.now() + 86400000 * 3,
      hotelName: 'Marriott Times Square',
      hotelAddress: '123 Broadway, NY',
      checkInTime: Date.now(),
      checkOutTime: Date.now() + 86400000 * 3,
      roomType: 'King',
    });

    const bookings = await store.getBookingsByTrip('trip-1');
    expect(bookings).toHaveLength(2);
  });

  it('should get flight bookings by user', async () => {
    await store.createBooking({
      tripId: 'trip-1',
      userId: 'user-1',
      type: 'flight',
      status: 'confirmed',
      confirmationNumber: 'ABC123',
      provider: 'United',
      startTime: Date.now(),
      endTime: Date.now() + 18000000,
      airline: 'United',
      flightNumber: 'UA123',
      departureAirport: 'SFO',
      arrivalAirport: 'JFK',
      departureTime: Date.now(),
      arrivalTime: Date.now() + 18000000,
      checkInOpensAt: Date.now() - 86400000,
      checkInStatus: 'not_available',
    } as FlightBooking);

    const flights = await store.getFlightBookings('user-1');
    expect(flights).toHaveLength(1);
    expect(flights[0].type).toBe('flight');
  });

  it('should update booking status', async () => {
    const booking = await store.createBooking({
      tripId: 'trip-1',
      userId: 'user-1',
      type: 'flight',
      status: 'pending',
      confirmationNumber: 'ABC123',
      provider: 'Delta',
      startTime: Date.now(),
      endTime: Date.now() + 18000000,
      airline: 'Delta',
      flightNumber: 'DL456',
      departureAirport: 'LAX',
      arrivalAirport: 'ORD',
      departureTime: Date.now(),
      arrivalTime: Date.now() + 18000000,
      checkInOpensAt: Date.now() - 86400000,
      checkInStatus: 'not_available',
    } as FlightBooking);

    const updated = await store.updateBooking(booking.id, {
      status: 'confirmed',
    });

    expect(updated?.status).toBe('confirmed');
  });

  it('should delete a booking', async () => {
    const booking = await store.createBooking({
      tripId: 'trip-1',
      userId: 'user-1',
      type: 'activity',
      status: 'confirmed',
      confirmationNumber: 'ACT789',
      provider: 'GetYourGuide',
      startTime: Date.now(),
      endTime: Date.now() + 10800000,
      activityName: 'City Tour',
      location: { lat: 40.7128, lng: -74.006, name: 'NYC' },
    });

    const deleted = await store.deleteBooking(booking.id);
    expect(deleted).toBe(true);

    const retrieved = await store.getBooking(booking.id);
    expect(retrieved).toBeNull();
  });
});

// =============================================================================
// Price Alert Store Tests
// =============================================================================

describe('TravelPriceAlertStore', () => {
  let store: TravelPriceAlertStore;

  beforeEach(async () => {
    store = createTravelPriceAlertStore('memory');
    await store.initialize();
  });

  it('should create a price alert', async () => {
    const alert = await store.createAlert({
      userId: 'user-1',
      type: 'flight',
      origin: 'SFO',
      destination: 'JFK',
      outboundDate: Date.now() + 86400000 * 30,
      targetPrice: 300,
      isActive: true,
    });

    expect(alert.id).toBeDefined();
    expect(alert.type).toBe('flight');
    expect(alert.targetPrice).toBe(300);
  });

  it('should get active alerts for user', async () => {
    await store.createAlert({
      userId: 'user-1',
      type: 'flight',
      origin: 'SFO',
      destination: 'LAX',
      outboundDate: Date.now() + 86400000 * 30,
      targetPrice: 100,
      isActive: true,
    });

    await store.createAlert({
      userId: 'user-1',
      type: 'hotel',
      destination: 'New York',
      outboundDate: Date.now() + 86400000 * 30,
      targetPrice: 200,
      isActive: false,
    });

    const activeAlerts = await store.listAlerts('user-1', { isActive: true });
    expect(activeAlerts).toHaveLength(1);
    expect(activeAlerts[0].type).toBe('flight');
  });

  it('should update price and history', async () => {
    const alert = await store.createAlert({
      userId: 'user-1',
      type: 'flight',
      origin: 'SFO',
      destination: 'JFK',
      outboundDate: Date.now() + 86400000 * 30,
      targetPrice: 300,
      isActive: true,
      priceHistory: [],
    });

    const updated = await store.updateCurrentPrice(alert.id, 280);

    expect(updated?.currentPrice).toBe(280);
    expect(updated?.lowestPrice).toBe(280);
    expect(updated?.priceHistory).toHaveLength(1);
    expect(updated?.priceHistory[0].price).toBe(280);
  });

  it('should track lowest price', async () => {
    const alert = await store.createAlert({
      userId: 'user-1',
      type: 'flight',
      origin: 'SFO',
      destination: 'JFK',
      outboundDate: Date.now() + 86400000 * 30,
      targetPrice: 300,
      isActive: true,
      priceHistory: [],
    });

    await store.updateCurrentPrice(alert.id, 350);
    await store.updateCurrentPrice(alert.id, 280);
    await store.updateCurrentPrice(alert.id, 320);

    const updated = await store.getAlert(alert.id);
    expect(updated?.lowestPrice).toBe(280);
    expect(updated?.currentPrice).toBe(320);
    expect(updated?.priceHistory).toHaveLength(3);
  });

  it('should deactivate alert', async () => {
    const alert = await store.createAlert({
      userId: 'user-1',
      type: 'flight',
      origin: 'SFO',
      destination: 'JFK',
      outboundDate: Date.now() + 86400000 * 30,
      targetPrice: 300,
      isActive: true,
    });

    const updated = await store.updateAlert(alert.id, { isActive: false });
    expect(updated?.isActive).toBe(false);
  });
});

// =============================================================================
// Check-In Store Tests
// =============================================================================

describe('CheckInStore', () => {
  let store: CheckInStore;

  beforeEach(async () => {
    store = createCheckInStore('memory');
    await store.initialize();
  });

  it('should schedule a check-in', async () => {
    const checkIn = await store.scheduleCheckIn({
      bookingId: 'booking-1',
      userId: 'user-1',
      airline: 'united',
      flightNumber: 'UA123',
      departureTime: Date.now() + 86400000,
      checkInOpensAt: Date.now(),
      scheduledAt: Date.now() + 60000,
      status: 'scheduled',
      attempts: [],
    });

    expect(checkIn.id).toBeDefined();
    expect(checkIn.status).toBe('scheduled');
    expect(checkIn.airline).toBe('united');
  });

  it('should get check-ins to process', async () => {
    const now = Date.now();

    await store.scheduleCheckIn({
      bookingId: 'booking-1',
      userId: 'user-1',
      airline: 'united',
      flightNumber: 'UA123',
      departureTime: now + 86400000,
      checkInOpensAt: now - 60000,
      scheduledAt: now - 30000, // Past due
      status: 'scheduled',
      attempts: [],
    });

    await store.scheduleCheckIn({
      bookingId: 'booking-2',
      userId: 'user-1',
      airline: 'delta',
      flightNumber: 'DL456',
      departureTime: now + 86400000 * 2,
      checkInOpensAt: now + 86400000,
      scheduledAt: now + 86400000, // Future
      status: 'scheduled',
      attempts: [],
    });

    const pending = await store.getCheckInsToProcess(now);
    expect(pending).toHaveLength(1);
    expect(pending[0].flightNumber).toBe('UA123');
  });

  it('should update check-in status', async () => {
    const checkIn = await store.scheduleCheckIn({
      bookingId: 'booking-1',
      userId: 'user-1',
      airline: 'united',
      flightNumber: 'UA123',
      departureTime: Date.now() + 86400000,
      checkInOpensAt: Date.now(),
      scheduledAt: Date.now(),
      status: 'scheduled',
      attempts: [],
    });

    const updated = await store.markCheckInCompleted(checkIn.id, []);

    expect(updated?.status).toBe('completed');
    expect(updated?.completedAt).toBeDefined();
  });

  it('should track check-in attempts', async () => {
    const checkIn = await store.scheduleCheckIn({
      bookingId: 'booking-1',
      userId: 'user-1',
      airline: 'united',
      flightNumber: 'UA123',
      departureTime: Date.now() + 86400000,
      checkInOpensAt: Date.now(),
      scheduledAt: Date.now(),
      status: 'scheduled',
      attempts: [],
    });

    await store.addCheckInAttempt(checkIn.id, {
      attemptedAt: Date.now(),
      success: false,
      errorMessage: 'First attempt failed',
    });
    await store.addCheckInAttempt(checkIn.id, {
      attemptedAt: Date.now(),
      success: true,
    });

    const attempts = await store.getCheckInAttempts(checkIn.id);
    expect(attempts).toHaveLength(2);
    expect(attempts[0].success).toBe(false);
    expect(attempts[1].success).toBe(true);
  });
});

// =============================================================================
// Check-In Scheduler Tests
// =============================================================================

describe('CheckInScheduler', () => {
  it('should create scheduler with config', () => {
    const store = createCheckInStore('memory');
    const scheduler = createCheckInScheduler(
      {
        autoCheckInEnabled: true,
        checkInAdvanceMinutes: 1,
        maxRetries: 3,
      },
      {
        store,
        getAirlineProvider: () => undefined,
      }
    );

    expect(scheduler).toBeDefined();
  });

  it('should schedule check-in for flight', async () => {
    const store = createCheckInStore('memory');
    await store.initialize();

    const scheduler = createCheckInScheduler(
      {
        autoCheckInEnabled: true,
        checkInAdvanceMinutes: 1,
        maxRetries: 3,
      },
      {
        store,
        getAirlineProvider: () => undefined,
      }
    );

    const booking: FlightBooking = {
      id: 'booking-1',
      tripId: 'trip-1',
      userId: 'user-1',
      type: 'flight',
      status: 'confirmed',
      confirmationNumber: 'ABC123',
      provider: 'United',
      startTime: Date.now() + 86400000,
      endTime: Date.now() + 86400000 + 18000000,
      airline: 'United',
      flightNumber: 'UA123',
      departureAirport: 'SFO',
      arrivalAirport: 'JFK',
      departureTime: Date.now() + 86400000,
      arrivalTime: Date.now() + 86400000 + 18000000,
      checkInOpensAt: Date.now(),
      checkInStatus: 'available',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const scheduled = await scheduler.scheduleCheckIn(booking);

    expect(scheduled).not.toBeNull();
    expect(scheduled?.bookingId).toBe('booking-1');
    expect(scheduled?.status).toBe('scheduled');
  });
});

// =============================================================================
// Traffic Monitor Tests
// =============================================================================

describe('TrafficMonitor', () => {
  it('should create departure alert', () => {
    const monitor = createTrafficMonitor(
      {
        enabled: true,
        checkIntervalMinutes: 15,
      },
      {
        getTrafficProvider: () => undefined,
      }
    );

    const alert = monitor.createAlert({
      userId: 'user-1',
      bookingId: 'booking-1',
      bookingType: 'flight',
      origin: { lat: 37.7749, lng: -122.4194, name: 'Home' },
      destination: { lat: 37.6213, lng: -122.379, name: 'SFO Airport' },
      targetArrivalTime: Date.now() + 7200000,
      bufferMinutes: 120,
      transportMode: 'driving',
    });

    expect(alert.id).toBeDefined();
    expect(alert.userId).toBe('user-1');
    expect(alert.bufferMinutes).toBe(120);
    expect(alert.isActive).toBe(true);
  });

  it('should get alerts for user', () => {
    const monitor = createTrafficMonitor(
      { enabled: true, checkIntervalMinutes: 15 },
      { getTrafficProvider: () => undefined }
    );

    monitor.createAlert({
      userId: 'user-1',
      bookingId: 'booking-1',
      bookingType: 'flight',
      origin: { lat: 37.7749, lng: -122.4194 },
      destination: { lat: 37.6213, lng: -122.379 },
      targetArrivalTime: Date.now() + 7200000,
    });

    monitor.createAlert({
      userId: 'user-2',
      bookingId: 'booking-2',
      bookingType: 'flight',
      origin: { lat: 40.7128, lng: -74.006 },
      destination: { lat: 40.6413, lng: -73.7781 },
      targetArrivalTime: Date.now() + 7200000,
    });

    const user1Alerts = monitor.getAlertsForUser('user-1');
    expect(user1Alerts).toHaveLength(1);
  });

  it('should deactivate alert', () => {
    const monitor = createTrafficMonitor(
      { enabled: true, checkIntervalMinutes: 15 },
      { getTrafficProvider: () => undefined }
    );

    const alert = monitor.createAlert({
      userId: 'user-1',
      bookingId: 'booking-1',
      bookingType: 'flight',
      origin: { lat: 37.7749, lng: -122.4194 },
      destination: { lat: 37.6213, lng: -122.379 },
      targetArrivalTime: Date.now() + 7200000,
    });

    const deactivated = monitor.deactivateAlert(alert.id);
    expect(deactivated).toBe(true);

    const updated = monitor.getAlert(alert.id);
    expect(updated?.isActive).toBe(false);
  });
});

// =============================================================================
// Car Rental Comparison Engine Tests
// =============================================================================

describe('ComparisonEngine', () => {
  it('should create comparison engine', () => {
    const engine = createComparisonEngine(
      { maxResults: 10, sortBy: 'price' },
      { getProvider: () => undefined, listProviders: () => [] }
    );

    expect(engine).toBeDefined();
  });
});

// =============================================================================
// Itinerary Consolidator Tests
// =============================================================================

describe('ItineraryConsolidator', () => {
  let tripStore: TripStore;
  let bookingStore: BookingStore;

  beforeEach(async () => {
    tripStore = createTripStore('memory');
    bookingStore = createBookingStore('memory');
    await tripStore.initialize();
    await bookingStore.initialize();
  });

  it('should create itinerary consolidator', () => {
    const consolidator = createItineraryConsolidator(
      {},
      { tripStore, bookingStore }
    );

    expect(consolidator).toBeDefined();
  });

  it('should generate itinerary for trip', async () => {
    const trip = await tripStore.createTrip({
      userId: 'user-1',
      name: 'Test Trip',
      destination: 'Paris',
      startDate: Date.now(),
      endDate: Date.now() + 86400000 * 5,
      status: 'booked',
    });

    await bookingStore.createBooking({
      tripId: trip.id,
      userId: 'user-1',
      type: 'flight',
      status: 'confirmed',
      confirmationNumber: 'ABC123',
      provider: 'Air France',
      startTime: Date.now(),
      endTime: Date.now() + 36000000,
      airline: 'Air France',
      flightNumber: 'AF123',
      departureAirport: 'SFO',
      arrivalAirport: 'CDG',
      departureTime: Date.now(),
      arrivalTime: Date.now() + 36000000,
      checkInOpensAt: Date.now() - 86400000,
      checkInStatus: 'not_available',
    } as FlightBooking);

    const consolidator = createItineraryConsolidator(
      {},
      { tripStore, bookingStore }
    );

    const itinerary = await consolidator.generateItinerary(trip.id);

    expect(itinerary).not.toBeNull();
    expect(itinerary?.tripId).toBe(trip.id);
    expect(itinerary?.items.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Provider Registry Tests
// =============================================================================

describe('TravelProviderRegistry', () => {
  it('should register and retrieve providers', async () => {
    const registry = initTravelProviderRegistry();

    const unitedProvider = createUnitedProvider();
    await unitedProvider.initialize();

    registry.register('airline', 'united', unitedProvider, true);

    const retrieved = registry.get('airline', 'united');
    expect(retrieved).toBe(unitedProvider);

    const defaultProvider = registry.get('airline');
    expect(defaultProvider).toBe(unitedProvider);
  });

  it('should list providers by type', async () => {
    const registry = initTravelProviderRegistry();

    const unitedProvider = createUnitedProvider();
    const deltaProvider = createDeltaProvider();
    const southwestProvider = createSouthwestProvider();

    await unitedProvider.initialize();
    await deltaProvider.initialize();
    await southwestProvider.initialize();

    registry.register('airline', 'united', unitedProvider);
    registry.register('airline', 'delta', deltaProvider);
    registry.register('airline', 'southwest', southwestProvider);

    const airlines = registry.list('airline');
    expect(airlines).toHaveLength(3);
    expect(airlines).toContain('united');
    expect(airlines).toContain('delta');
    expect(airlines).toContain('southwest');
  });

  it('should unregister providers', async () => {
    const registry = initTravelProviderRegistry();

    const provider = createGoogleFlightsProvider();
    await provider.initialize();

    registry.register('aggregator', 'google-flights', provider);
    expect(registry.has('aggregator', 'google-flights')).toBe(true);

    registry.remove('aggregator', 'google-flights');
    expect(registry.has('aggregator', 'google-flights')).toBe(false);
  });
});

// =============================================================================
// Travel Manager Tests
// =============================================================================

describe('TravelManager', () => {
  let manager: TravelManager;

  beforeEach(async () => {
    manager = new TravelManager({
      enabled: true,
      storeType: 'memory',
    });
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  it('should initialize correctly', () => {
    expect(manager.isInitialized()).toBe(true);
  });

  it('should provide access to stores', () => {
    expect(manager.getTripStore()).toBeDefined();
    expect(manager.getBookingStore()).toBeDefined();
  });

  it('should provide access to services', () => {
    expect(manager.getCheckInService()).toBeDefined();
    expect(manager.getPriceMonitoringService()).toBeDefined();
    expect(manager.getCarRentalService()).toBeDefined();
    expect(manager.getItineraryService()).toBeDefined();
    expect(manager.getDepartureAlertService()).toBeDefined();
  });

  it('should provide access to provider registry', () => {
    expect(manager.getProviderRegistry()).toBeDefined();
  });

  it('should start and stop services', () => {
    manager.start();
    // Services should be running
    manager.stop();
    // Services should be stopped
    expect(manager.isInitialized()).toBe(true);
  });
});

// =============================================================================
// Global Singleton Tests
// =============================================================================

describe('Travel Global Singleton', () => {
  afterEach(async () => {
    if (isTravelInitialized()) {
      const manager = getTravelManager();
      await manager.shutdown();
    }
  });

  it('should initialize global singleton', async () => {
    const manager = await initTravel({
      enabled: true,
      storeType: 'memory',
    });

    expect(manager).toBeDefined();
    expect(isTravelInitialized()).toBe(true);

    const retrieved = getTravelManager();
    expect(retrieved).toBe(manager);
  });

  it('should report initialization status correctly', async () => {
    // Test initialization flow - the global singleton test
    const wasInitialized = isTravelInitialized();

    if (!wasInitialized) {
      // If not initialized, this test can verify the throw behavior
      // by creating a fresh manager without using the global singleton
      const manager = new TravelManager({ enabled: true, storeType: 'memory' });
      expect(manager.isInitialized()).toBe(false);

      await manager.initialize();
      expect(manager.isInitialized()).toBe(true);

      await manager.shutdown();
      expect(manager.isInitialized()).toBe(false);
    } else {
      // Already initialized from previous test - verify state
      expect(isTravelInitialized()).toBe(true);
    }
  });
});
