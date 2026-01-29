/**
 * Calendar Providers
 *
 * Providers for syncing school calendars from various sources.
 */

import type {
  CalendarProvider,
  CalendarProviderConfig,
  EventReminder,
  ProviderResult,
  SchoolEvent,
  SchoolEventType,
} from '../types.js';
import { BaseFamilyProvider } from './base.js';

// ============================================================================
// Calendar Provider Types
// ============================================================================

export interface CalendarSyncResult {
  events: ParsedCalendarEvent[];
  syncedAt: number;
  sourceId: string;
}

export interface ParsedCalendarEvent {
  externalId: string;
  title: string;
  description?: string;
  startTime: number;
  endTime: number;
  location?: string;
  isAllDay: boolean;
  eventType: SchoolEventType;
}

// ============================================================================
// Abstract Calendar Provider
// ============================================================================

export abstract class SchoolCalendarProvider extends BaseFamilyProvider<CalendarProviderConfig> {
  abstract get providerType(): CalendarProvider;

  get type(): string {
    return 'calendar';
  }

  /**
   * Sync events from the calendar source
   */
  abstract syncEvents(
    sourceId: string,
    syncUrl: string,
    options?: CalendarSyncOptions
  ): Promise<ProviderResult<CalendarSyncResult>>;

  /**
   * Detect event type from title/description
   */
  protected detectEventType(title: string, description?: string): SchoolEventType {
    const text = `${title} ${description || ''}`.toLowerCase();

    if (/exam|test|quiz|assessment/i.test(text)) return 'exam';
    if (/holiday|break|vacation|no school/i.test(text)) return 'holiday';
    if (/meeting|conference|pta|parent/i.test(text)) return 'meeting';
    if (/deadline|due|submit/i.test(text)) return 'deadline';
    if (/class|lesson|period/i.test(text)) return 'class';
    if (/club|sport|game|practice|activity/i.test(text)) return 'activity';

    return 'other';
  }
}

export interface CalendarSyncOptions {
  startDate?: Date;
  endDate?: Date;
  maxEvents?: number;
}

// ============================================================================
// iCal Provider
// ============================================================================

interface ICalEvent {
  uid: string;
  summary: string;
  description?: string;
  dtstart: Date;
  dtend: Date;
  location?: string;
  allDay?: boolean;
}

export class ICalProvider extends SchoolCalendarProvider {
  get name(): string {
    return 'ical';
  }

  get providerType(): CalendarProvider {
    return 'ical';
  }

  async syncEvents(
    sourceId: string,
    syncUrl: string,
    options?: CalendarSyncOptions
  ): Promise<ProviderResult<CalendarSyncResult>> {
    this.ensureInitialized();

    try {
      const response = await fetch(syncUrl);
      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch iCal: HTTP ${response.status}`,
        };
      }

      const icalText = await response.text();
      const events = this.parseICal(icalText);

      // Filter by date range if specified
      let filteredEvents = events;
      if (options?.startDate) {
        filteredEvents = filteredEvents.filter(e => e.dtstart >= options.startDate!);
      }
      if (options?.endDate) {
        filteredEvents = filteredEvents.filter(e => e.dtstart <= options.endDate!);
      }

      // Limit events if specified
      if (options?.maxEvents && filteredEvents.length > options.maxEvents) {
        filteredEvents = filteredEvents.slice(0, options.maxEvents);
      }

      const parsedEvents: ParsedCalendarEvent[] = filteredEvents.map(event => ({
        externalId: event.uid,
        title: event.summary,
        description: event.description,
        startTime: event.dtstart.getTime(),
        endTime: event.dtend.getTime(),
        location: event.location,
        isAllDay: event.allDay || false,
        eventType: this.detectEventType(event.summary, event.description),
      }));

      return {
        success: true,
        data: {
          events: parsedEvents,
          syncedAt: Date.now(),
          sourceId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync iCal',
      };
    }
  }

  private parseICal(icalText: string): ICalEvent[] {
    const events: ICalEvent[] = [];
    const lines = icalText.split(/\r?\n/);

    let currentEvent: Partial<ICalEvent> | null = null;
    let currentKey = '';
    let currentValue = '';

    for (const line of lines) {
      // Handle line continuations
      if (line.startsWith(' ') || line.startsWith('\t')) {
        currentValue += line.slice(1);
        continue;
      }

      // Process previous key-value pair
      if (currentKey && currentEvent) {
        this.setEventProperty(currentEvent, currentKey, currentValue);
      }

      // Parse new line
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const keyPart = line.slice(0, colonIndex);
      currentValue = line.slice(colonIndex + 1);

      // Handle key with parameters (e.g., DTSTART;VALUE=DATE:20230101)
      const [key] = keyPart.split(';');
      currentKey = key;

      // Check for event boundaries
      if (key === 'BEGIN' && currentValue === 'VEVENT') {
        currentEvent = {};
        currentKey = '';
      } else if (key === 'END' && currentValue === 'VEVENT' && currentEvent) {
        if (currentEvent.uid && currentEvent.summary && currentEvent.dtstart) {
          // Set default end time if not specified
          if (!currentEvent.dtend) {
            currentEvent.dtend = new Date(currentEvent.dtstart.getTime() + 3600000); // 1 hour
          }

          // Detect all-day events
          if (keyPart.includes('VALUE=DATE')) {
            currentEvent.allDay = true;
          }

          events.push(currentEvent as ICalEvent);
        }
        currentEvent = null;
        currentKey = '';
      }
    }

    return events;
  }

  private setEventProperty(event: Partial<ICalEvent>, key: string, value: string): void {
    switch (key) {
      case 'UID':
        event.uid = value;
        break;
      case 'SUMMARY':
        event.summary = this.unescapeICalValue(value);
        break;
      case 'DESCRIPTION':
        event.description = this.unescapeICalValue(value);
        break;
      case 'LOCATION':
        event.location = this.unescapeICalValue(value);
        break;
      case 'DTSTART':
        event.dtstart = this.parseICalDate(value);
        if (value.length === 8) event.allDay = true;
        break;
      case 'DTEND':
        event.dtend = this.parseICalDate(value);
        break;
    }
  }

  private parseICalDate(value: string): Date {
    // Format: YYYYMMDD or YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
    const cleaned = value.replace(/[^0-9TZ]/g, '');

    if (cleaned.length === 8) {
      // Date only (all-day event)
      const year = parseInt(cleaned.slice(0, 4), 10);
      const month = parseInt(cleaned.slice(4, 6), 10) - 1;
      const day = parseInt(cleaned.slice(6, 8), 10);
      return new Date(year, month, day);
    }

    // Date with time
    const year = parseInt(cleaned.slice(0, 4), 10);
    const month = parseInt(cleaned.slice(4, 6), 10) - 1;
    const day = parseInt(cleaned.slice(6, 8), 10);
    const hour = parseInt(cleaned.slice(9, 11), 10) || 0;
    const minute = parseInt(cleaned.slice(11, 13), 10) || 0;
    const second = parseInt(cleaned.slice(13, 15), 10) || 0;

    if (cleaned.endsWith('Z')) {
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }

    return new Date(year, month, day, hour, minute, second);
  }

  private unescapeICalValue(value: string): string {
    return value
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }
}

// ============================================================================
// Google Calendar Provider
// ============================================================================

interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
}

interface GoogleCalendarResponse {
  items: GoogleCalendarEvent[];
}

export class GoogleCalendarProvider extends SchoolCalendarProvider {
  get name(): string {
    return 'google';
  }

  get providerType(): CalendarProvider {
    return 'google';
  }

  async syncEvents(
    sourceId: string,
    calendarId: string,
    options?: CalendarSyncOptions
  ): Promise<ProviderResult<CalendarSyncResult>> {
    this.ensureInitialized();
    this.ensureApiKey();

    try {
      const params = new URLSearchParams({
        key: this.apiKey!,
        singleEvents: 'true',
        orderBy: 'startTime',
      });

      if (options?.startDate) {
        params.set('timeMin', options.startDate.toISOString());
      } else {
        // Default to events from now
        params.set('timeMin', new Date().toISOString());
      }

      if (options?.endDate) {
        params.set('timeMax', options.endDate.toISOString());
      }

      if (options?.maxEvents) {
        params.set('maxResults', options.maxEvents.toString());
      }

      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
      const result = await this.fetch<GoogleCalendarResponse>(url);

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || 'Failed to fetch Google Calendar events',
        };
      }

      const parsedEvents: ParsedCalendarEvent[] = result.data.items.map(event => {
        const isAllDay = !event.start.dateTime;
        const startTime = event.start.dateTime
          ? new Date(event.start.dateTime).getTime()
          : new Date(event.start.date!).getTime();
        const endTime = event.end.dateTime
          ? new Date(event.end.dateTime).getTime()
          : new Date(event.end.date!).getTime();

        return {
          externalId: event.id,
          title: event.summary,
          description: event.description,
          startTime,
          endTime,
          location: event.location,
          isAllDay,
          eventType: this.detectEventType(event.summary, event.description),
        };
      });

      return {
        success: true,
        data: {
          events: parsedEvents,
          syncedAt: Date.now(),
          sourceId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync Google Calendar',
      };
    }
  }
}

// ============================================================================
// Manual Calendar Provider
// ============================================================================

export class ManualCalendarProvider extends SchoolCalendarProvider {
  get name(): string {
    return 'manual';
  }

  get providerType(): CalendarProvider {
    return 'manual';
  }

  async syncEvents(
    sourceId: string,
    _syncUrl: string,
    _options?: CalendarSyncOptions
  ): Promise<ProviderResult<CalendarSyncResult>> {
    // Manual provider doesn't sync - events are added directly
    return {
      success: true,
      data: {
        events: [],
        syncedAt: Date.now(),
        sourceId,
      },
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCalendarProvider(
  type: CalendarProvider,
  config: CalendarProviderConfig
): SchoolCalendarProvider {
  switch (type) {
    case 'ical':
      return new ICalProvider(config);
    case 'google':
      return new GoogleCalendarProvider(config);
    case 'manual':
      return new ManualCalendarProvider(config);
    case 'outlook':
      // Outlook uses iCal format for public calendars
      return new ICalProvider(config);
    default:
      throw new Error(`Unknown calendar provider type: ${type}`);
  }
}
