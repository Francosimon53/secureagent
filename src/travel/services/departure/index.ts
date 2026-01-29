/**
 * Departure Alert Service
 *
 * Manages traffic-based departure alerts.
 */

export {
  TrafficMonitor,
  createTrafficMonitor,
  type TrafficMonitorConfig,
  type TrafficMonitorDeps,
  type DepartureAlertEvent,
  type LeaveNowEvent,
} from './traffic-monitor.js';

import type { BookingStore } from '../../stores/booking-store.js';
import type {
  DepartureAlert,
  Location,
  BookingType,
  TransportMode,
  TripBooking,
  FlightBooking,
  HotelBooking,
  CarRentalBooking,
  ActivityBooking,
} from '../../types.js';
import type { TrafficProvider } from '../../providers/base.js';
import { TrafficMonitor, createTrafficMonitor, type TrafficMonitorConfig } from './traffic-monitor.js';

export interface DepartureAlertServiceConfig extends Partial<TrafficMonitorConfig> {
  enabled?: boolean;
}

export interface DepartureAlertServiceDeps {
  bookingStore: BookingStore;
  getTrafficProvider: () => TrafficProvider | undefined;
}

/**
 * High-level departure alert service
 */
export class DepartureAlertService {
  private readonly monitor: TrafficMonitor;
  private readonly deps: DepartureAlertServiceDeps;
  private readonly config: DepartureAlertServiceConfig;

  constructor(config: DepartureAlertServiceConfig, deps: DepartureAlertServiceDeps) {
    this.config = config;
    this.deps = deps;

    this.monitor = createTrafficMonitor(config, {
      getTrafficProvider: deps.getTrafficProvider,
    });
  }

  /**
   * Create a departure alert for a booking
   */
  async createAlertForBooking(
    bookingId: string,
    origin: Location,
    options?: {
      bufferMinutes?: number;
      transportMode?: TransportMode;
    }
  ): Promise<DepartureAlert | null> {
    const booking = await this.deps.bookingStore.getBooking(bookingId);
    if (!booking) {
      return null;
    }

    const destination = this.getDestinationFromBooking(booking);
    if (!destination) {
      return null;
    }

    const targetArrivalTime = this.getTargetArrivalTime(booking);

    return this.monitor.createAlert({
      userId: booking.userId,
      bookingId: booking.id,
      bookingType: booking.type,
      origin,
      destination,
      targetArrivalTime,
      bufferMinutes: options?.bufferMinutes,
      transportMode: options?.transportMode,
    });
  }

  /**
   * Create a custom departure alert
   */
  createAlert(params: {
    userId: string;
    bookingId: string;
    bookingType: BookingType;
    origin: Location;
    destination: Location;
    targetArrivalTime: number;
    bufferMinutes?: number;
    transportMode?: TransportMode;
  }): DepartureAlert {
    return this.monitor.createAlert(params);
  }

  /**
   * Get an alert by ID
   */
  getAlert(alertId: string): DepartureAlert | undefined {
    return this.monitor.getAlert(alertId);
  }

  /**
   * Get alerts for a user
   */
  getAlertsForUser(userId: string): DepartureAlert[] {
    return this.monitor.getAlertsForUser(userId);
  }

  /**
   * Get active alerts for a user
   */
  getActiveAlertsForUser(userId: string): DepartureAlert[] {
    return this.monitor.getAlertsForUser(userId).filter(a => a.isActive);
  }

  /**
   * Update an alert
   */
  updateAlert(alertId: string, updates: Partial<Pick<DepartureAlert, 'bufferMinutes' | 'transportMode'>>): DepartureAlert | null {
    return this.monitor.updateAlert(alertId, updates);
  }

  /**
   * Delete an alert
   */
  deleteAlert(alertId: string): boolean {
    return this.monitor.deleteAlert(alertId);
  }

  /**
   * Deactivate an alert
   */
  deactivateAlert(alertId: string): boolean {
    return this.monitor.deactivateAlert(alertId);
  }

  /**
   * Get current traffic status for an alert
   */
  async checkTrafficNow(alertId: string): Promise<{
    departureTime: number;
    travelTime: number;
    trafficConditions: 'light' | 'moderate' | 'heavy' | 'severe';
    message: string;
  } | null> {
    return this.monitor.getRecommendedDeparture(alertId);
  }

  /**
   * Get recommended departure for a booking
   */
  async getRecommendedDepartureForBooking(
    bookingId: string,
    origin: Location,
    transportMode?: TransportMode
  ): Promise<{
    departureTime: number;
    travelTime: number;
    trafficConditions: 'light' | 'moderate' | 'heavy' | 'severe';
    message: string;
  } | null> {
    // Check if alert already exists
    const existingAlerts = this.monitor.getActiveAlerts().filter(a => a.bookingId === bookingId);

    if (existingAlerts.length > 0) {
      return this.monitor.getRecommendedDeparture(existingAlerts[0].id);
    }

    // Create temporary alert
    const alert = await this.createAlertForBooking(bookingId, origin, { transportMode });
    if (!alert) {
      return null;
    }

    const result = await this.monitor.getRecommendedDeparture(alert.id);

    // Clean up temporary alert
    this.monitor.deleteAlert(alert.id);

    return result;
  }

  /**
   * Start the departure alert monitoring
   */
  start(): void {
    if (this.config.enabled !== false) {
      this.monitor.start();
    }
  }

  /**
   * Stop the departure alert monitoring
   */
  stop(): void {
    this.monitor.stop();
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.monitor.isRunning();
  }

  private getDestinationFromBooking(booking: TripBooking): Location | null {
    switch (booking.type) {
      case 'flight': {
        const flight = booking as FlightBooking;
        // Airport location would ideally come from an airport database
        return {
          lat: 0,
          lng: 0,
          name: flight.departureAirport,
          address: `${flight.departureAirport} Airport`,
        };
      }
      case 'hotel': {
        const hotel = booking as HotelBooking;
        return hotel.hotelLocation ?? {
          lat: 0,
          lng: 0,
          address: hotel.hotelAddress,
        };
      }
      case 'car_rental': {
        const rental = booking as CarRentalBooking;
        return rental.pickupLocation;
      }
      case 'activity': {
        const activity = booking as ActivityBooking;
        return activity.location;
      }
      default:
        return null;
    }
  }

  private getTargetArrivalTime(booking: TripBooking): number {
    switch (booking.type) {
      case 'flight': {
        const flight = booking as FlightBooking;
        // For flights, use departure time
        return flight.departureTime;
      }
      case 'hotel': {
        const hotel = booking as HotelBooking;
        return hotel.checkInTime;
      }
      case 'car_rental': {
        const rental = booking as CarRentalBooking;
        return rental.pickupTime;
      }
      case 'activity':
      default:
        return booking.startTime;
    }
  }
}

/**
 * Create a departure alert service instance
 */
export function createDepartureAlertService(
  config: DepartureAlertServiceConfig,
  deps: DepartureAlertServiceDeps
): DepartureAlertService {
  return new DepartureAlertService(config, deps);
}
