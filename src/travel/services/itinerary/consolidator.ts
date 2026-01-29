/**
 * Itinerary Consolidator
 *
 * Consolidates bookings into a unified travel itinerary.
 */

import { randomUUID } from 'crypto';
import type { TripStore } from '../../stores/trip-store.js';
import type { BookingStore } from '../../stores/booking-store.js';
import type {
  Trip,
  TripBooking,
  FlightBooking,
  HotelBooking,
  CarRentalBooking,
  ActivityBooking,
  ConsolidatedItinerary,
  ItineraryItem,
  ItineraryReminder,
  Location,
} from '../../types.js';

export interface ConsolidatorConfig {
  enabled: boolean;
  defaultReminderMinutes: number[];
  includeLayovers: boolean;
  autoGenerateReminders: boolean;
}

export interface ConsolidatorDeps {
  tripStore: TripStore;
  bookingStore: BookingStore;
}

/**
 * Consolidates bookings into travel itineraries
 */
export class ItineraryConsolidator {
  private readonly config: ConsolidatorConfig;
  private readonly deps: ConsolidatorDeps;

  constructor(config: ConsolidatorConfig, deps: ConsolidatorDeps) {
    this.config = config;
    this.deps = deps;
  }

  /**
   * Generate a consolidated itinerary for a trip
   */
  async generateItinerary(
    tripId: string,
    options?: { format?: 'detailed' | 'summary' }
  ): Promise<ConsolidatedItinerary | null> {
    const trip = await this.deps.tripStore.getTrip(tripId);
    if (!trip) {
      return null;
    }

    const bookings = await this.deps.bookingStore.getBookingsByTrip(tripId);
    const items = await this.createItineraryItems(trip, bookings, options?.format ?? 'detailed');

    return {
      id: randomUUID(),
      tripId,
      userId: trip.userId,
      title: trip.name,
      startDate: trip.startDate,
      endDate: trip.endDate,
      items,
      generatedAt: Date.now(),
      format: options?.format ?? 'detailed',
    };
  }

  /**
   * Generate itinerary for a specific date range
   */
  async generateForDateRange(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<ConsolidatedItinerary> {
    const bookings = await this.deps.bookingStore.listBookings(userId, {
      dateFrom: startDate,
      dateTo: endDate,
      orderBy: 'startTime',
      orderDirection: 'asc',
    });

    const items = await this.createItineraryItems(null, bookings, 'detailed');

    return {
      id: randomUUID(),
      tripId: '',
      userId,
      title: `Travel Itinerary ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`,
      startDate,
      endDate,
      items,
      generatedAt: Date.now(),
      format: 'detailed',
    };
  }

  /**
   * Get today's itinerary items for a user
   */
  async getTodayItinerary(userId: string): Promise<ItineraryItem[]> {
    const now = Date.now();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const bookings = await this.deps.bookingStore.listBookings(userId, {
      dateFrom: startOfDay.getTime(),
      dateTo: endOfDay.getTime(),
      orderBy: 'startTime',
      orderDirection: 'asc',
    });

    return this.createItineraryItems(null, bookings, 'detailed');
  }

  /**
   * Add a note to an itinerary
   */
  createNoteItem(
    title: string,
    description: string,
    time: number,
    location?: Location
  ): ItineraryItem {
    return {
      id: randomUUID(),
      type: 'note',
      title,
      description,
      startTime: time,
      location,
    };
  }

  /**
   * Calculate gap between two items
   */
  calculateGap(item1: ItineraryItem, item2: ItineraryItem): number | null {
    if (!item1.endTime) {
      return null;
    }
    return item2.startTime - item1.endTime;
  }

  private async createItineraryItems(
    trip: Trip | null,
    bookings: TripBooking[],
    format: 'detailed' | 'summary'
  ): Promise<ItineraryItem[]> {
    const items: ItineraryItem[] = [];

    // Sort bookings by start time
    const sortedBookings = [...bookings].sort((a, b) => a.startTime - b.startTime);

    for (let i = 0; i < sortedBookings.length; i++) {
      const booking = sortedBookings[i];
      const item = this.bookingToItem(booking, format);
      items.push(item);

      // Add layover/gap items if configured
      if (this.config.includeLayovers && i < sortedBookings.length - 1) {
        const nextBooking = sortedBookings[i + 1];
        const gap = nextBooking.startTime - (booking.endTime ?? booking.startTime);

        // If gap is more than 30 minutes and less than 24 hours, add a gap item
        const thirtyMinutes = 30 * 60 * 1000;
        const twentyFourHours = 24 * 60 * 60 * 1000;

        if (gap > thirtyMinutes && gap < twentyFourHours) {
          items.push(this.createGapItem(booking, nextBooking, gap));
        }
      }
    }

    // Add reminders if configured
    if (this.config.autoGenerateReminders) {
      for (const item of items) {
        item.reminders = this.generateReminders(item);
      }
    }

    return items;
  }

  private bookingToItem(booking: TripBooking, format: 'detailed' | 'summary'): ItineraryItem {
    const baseItem: ItineraryItem = {
      id: randomUUID(),
      bookingId: booking.id,
      type: booking.type,
      title: this.getBookingTitle(booking),
      startTime: booking.startTime,
      endTime: booking.endTime,
      confirmationNumber: booking.confirmationNumber,
    };

    if (format === 'summary') {
      return baseItem;
    }

    // Add detailed information based on booking type
    switch (booking.type) {
      case 'flight':
        return this.flightToItem(booking as FlightBooking, baseItem);
      case 'hotel':
        return this.hotelToItem(booking as HotelBooking, baseItem);
      case 'car_rental':
        return this.carRentalToItem(booking as CarRentalBooking, baseItem);
      case 'activity':
        return this.activityToItem(booking as ActivityBooking, baseItem);
      default:
        return baseItem;
    }
  }

  private flightToItem(booking: FlightBooking, baseItem: ItineraryItem): ItineraryItem {
    return {
      ...baseItem,
      title: `${booking.airline} ${booking.flightNumber}: ${booking.departureAirport} → ${booking.arrivalAirport}`,
      description: this.formatFlightDescription(booking),
      location: {
        lat: 0,
        lng: 0,
        name: booking.departureAirport,
      },
    };
  }

  private hotelToItem(booking: HotelBooking, baseItem: ItineraryItem): ItineraryItem {
    return {
      ...baseItem,
      title: `Check-in: ${booking.hotelName}`,
      description: this.formatHotelDescription(booking),
      location: booking.hotelLocation ?? {
        lat: 0,
        lng: 0,
        address: booking.hotelAddress,
      },
    };
  }

  private carRentalToItem(booking: CarRentalBooking, baseItem: ItineraryItem): ItineraryItem {
    return {
      ...baseItem,
      title: `Car Pickup: ${booking.rentalCompany}`,
      description: this.formatCarRentalDescription(booking),
      location: booking.pickupLocation,
    };
  }

  private activityToItem(booking: ActivityBooking, baseItem: ItineraryItem): ItineraryItem {
    return {
      ...baseItem,
      title: booking.activityName,
      description: `${booking.activityType}\n${booking.participants} participant(s)`,
      location: booking.location,
    };
  }

  private createGapItem(before: TripBooking, after: TripBooking, gapMs: number): ItineraryItem {
    const hours = Math.floor(gapMs / (60 * 60 * 1000));
    const minutes = Math.floor((gapMs % (60 * 60 * 1000)) / (60 * 1000));

    let gapType: 'layover' | 'gap' = 'gap';
    let title = 'Free Time';

    // If both are flights, it's a layover
    if (before.type === 'flight' && after.type === 'flight') {
      gapType = 'layover';
      const afterFlight = after as FlightBooking;
      title = `Layover in ${afterFlight.departureAirport}`;
    }

    return {
      id: randomUUID(),
      type: gapType,
      title,
      description: hours > 0 ? `${hours}h ${minutes}m` : `${minutes} minutes`,
      startTime: before.endTime ?? before.startTime,
      endTime: after.startTime,
    };
  }

  private generateReminders(item: ItineraryItem): ItineraryReminder[] {
    return this.config.defaultReminderMinutes.map(minutes => ({
      id: randomUUID(),
      itemId: item.id,
      minutesBefore: minutes,
      channels: ['push'],
      scheduledFor: item.startTime - (minutes * 60 * 1000),
      sent: false,
    }));
  }

  private getBookingTitle(booking: TripBooking): string {
    switch (booking.type) {
      case 'flight':
        const flight = booking as FlightBooking;
        return `${flight.airline} ${flight.flightNumber}`;
      case 'hotel':
        const hotel = booking as HotelBooking;
        return hotel.hotelName;
      case 'car_rental':
        const car = booking as CarRentalBooking;
        return `${car.rentalCompany} - ${car.vehicleClass}`;
      case 'activity':
        const activity = booking as ActivityBooking;
        return activity.activityName;
      default:
        return `${booking.type} - ${booking.confirmationNumber}`;
    }
  }

  private formatFlightDescription(booking: FlightBooking): string {
    const lines = [
      `Flight: ${booking.airline} ${booking.flightNumber}`,
      `From: ${booking.departureAirport}`,
      `To: ${booking.arrivalAirport}`,
      `Departure: ${new Date(booking.departureTime).toLocaleString()}`,
      `Arrival: ${new Date(booking.arrivalTime).toLocaleString()}`,
    ];

    if (booking.seatAssignment) {
      lines.push(`Seat: ${booking.seatAssignment}`);
    }

    return lines.join('\n');
  }

  private formatHotelDescription(booking: HotelBooking): string {
    const lines = [
      booking.hotelName,
      booking.hotelAddress,
      `Room: ${booking.roomType}`,
      `Check-in: ${new Date(booking.checkInTime).toLocaleString()}`,
      `Check-out: ${new Date(booking.checkOutTime).toLocaleString()}`,
    ];

    return lines.join('\n');
  }

  private formatCarRentalDescription(booking: CarRentalBooking): string {
    const lines = [
      `${booking.rentalCompany}`,
      `Vehicle: ${booking.vehicleClass}`,
      `Pickup: ${new Date(booking.pickupTime).toLocaleString()}`,
      `Return: ${new Date(booking.dropoffTime).toLocaleString()}`,
    ];

    return lines.join('\n');
  }
}

/**
 * Create an itinerary consolidator instance
 */
export function createItineraryConsolidator(
  config: Partial<ConsolidatorConfig>,
  deps: ConsolidatorDeps
): ItineraryConsolidator {
  const fullConfig: ConsolidatorConfig = {
    enabled: config.enabled ?? true,
    defaultReminderMinutes: config.defaultReminderMinutes ?? [1440, 60, 15],
    includeLayovers: config.includeLayovers ?? true,
    autoGenerateReminders: config.autoGenerateReminders ?? true,
  };

  return new ItineraryConsolidator(fullConfig, deps);
}
