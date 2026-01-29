/**
 * Itinerary Service
 *
 * Manages travel itinerary consolidation and generation.
 */

export {
  ItineraryConsolidator,
  createItineraryConsolidator,
  type ConsolidatorConfig,
  type ConsolidatorDeps,
} from './consolidator.js';

import type { TripStore } from '../../stores/trip-store.js';
import type { BookingStore } from '../../stores/booking-store.js';
import type {
  ConsolidatedItinerary,
  ItineraryItem,
  Location,
} from '../../types.js';
import { ItineraryConsolidator, createItineraryConsolidator, type ConsolidatorConfig } from './consolidator.js';

export interface ItineraryServiceConfig extends Partial<ConsolidatorConfig> {
  enabled?: boolean;
  calendarSyncEnabled?: boolean;
}

export interface ItineraryServiceDeps {
  tripStore: TripStore;
  bookingStore: BookingStore;
}

/**
 * High-level itinerary service
 */
export class ItineraryService {
  private readonly consolidator: ItineraryConsolidator;
  private readonly config: ItineraryServiceConfig;

  constructor(config: ItineraryServiceConfig, deps: ItineraryServiceDeps) {
    this.config = config;

    this.consolidator = createItineraryConsolidator(config, {
      tripStore: deps.tripStore,
      bookingStore: deps.bookingStore,
    });
  }

  /**
   * Generate itinerary for a trip
   */
  async generateTripItinerary(
    tripId: string,
    options?: { format?: 'detailed' | 'summary' }
  ): Promise<ConsolidatedItinerary | null> {
    return this.consolidator.generateItinerary(tripId, options);
  }

  /**
   * Generate itinerary for a date range
   */
  async generateDateRangeItinerary(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<ConsolidatedItinerary> {
    return this.consolidator.generateForDateRange(userId, startDate, endDate);
  }

  /**
   * Get today's itinerary
   */
  async getTodayItinerary(userId: string): Promise<ItineraryItem[]> {
    return this.consolidator.getTodayItinerary(userId);
  }

  /**
   * Get upcoming items
   */
  async getUpcomingItems(userId: string, days: number = 7): Promise<ItineraryItem[]> {
    const startDate = Date.now();
    const endDate = startDate + (days * 24 * 60 * 60 * 1000);

    const itinerary = await this.consolidator.generateForDateRange(userId, startDate, endDate);
    return itinerary.items;
  }

  /**
   * Add a custom note to trip itinerary
   */
  createNote(
    title: string,
    description: string,
    time: number,
    location?: Location
  ): ItineraryItem {
    return this.consolidator.createNoteItem(title, description, time, location);
  }

  /**
   * Format itinerary as text
   */
  formatAsText(itinerary: ConsolidatedItinerary): string {
    const lines: string[] = [
      `=== ${itinerary.title} ===`,
      `${new Date(itinerary.startDate).toLocaleDateString()} - ${new Date(itinerary.endDate).toLocaleDateString()}`,
      '',
    ];

    let currentDay = '';

    for (const item of itinerary.items) {
      const itemDate = new Date(item.startTime).toLocaleDateString();

      if (itemDate !== currentDay) {
        currentDay = itemDate;
        lines.push(`--- ${currentDay} ---`);
      }

      const time = new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      lines.push(`${time} - ${item.title}`);

      if (item.description) {
        const descLines = item.description.split('\n').map(l => `  ${l}`);
        lines.push(...descLines);
      }

      if (item.confirmationNumber) {
        lines.push(`  Confirmation: ${item.confirmationNumber}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export itinerary as ICS calendar format
   */
  exportAsICS(itinerary: ConsolidatedItinerary): string {
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SecureAgent//Travel Module//EN',
    ];

    for (const item of itinerary.items) {
      if (item.type === 'gap' || item.type === 'layover') {
        continue; // Skip gap items
      }

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${item.id}@secureagent`);
      lines.push(`DTSTAMP:${this.formatICSDate(Date.now())}`);
      lines.push(`DTSTART:${this.formatICSDate(item.startTime)}`);

      if (item.endTime) {
        lines.push(`DTEND:${this.formatICSDate(item.endTime)}`);
      }

      lines.push(`SUMMARY:${this.escapeICS(item.title)}`);

      if (item.description) {
        lines.push(`DESCRIPTION:${this.escapeICS(item.description)}`);
      }

      if (item.location?.address || item.location?.name) {
        lines.push(`LOCATION:${this.escapeICS(item.location.address ?? item.location.name ?? '')}`);
      }

      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    return lines.join('\r\n');
  }

  private formatICSDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  private escapeICS(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }
}

/**
 * Create an itinerary service instance
 */
export function createItineraryService(
  config: ItineraryServiceConfig,
  deps: ItineraryServiceDeps
): ItineraryService {
  return new ItineraryService(config, deps);
}
