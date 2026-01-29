/**
 * Calendar Providers
 *
 * Implementations for Google Calendar and Outlook Calendar providers.
 */

import { BaseProvider, ProviderError } from './base.js';
import type {
  CalendarEvent,
  CalendarAttendee,
  ProviderResult,
  CalendarProviderType,
} from '../types.js';
import type { CalendarConfig } from '../config.js';

/**
 * Abstract calendar provider interface
 */
export abstract class CalendarProvider extends BaseProvider<CalendarConfig & { name: string; apiKeyEnvVar: string }> {
  abstract get type(): 'calendar';
  abstract get providerType(): CalendarProviderType;

  /**
   * Get events within a time range
   */
  abstract getEvents(startTime: number, endTime: number): Promise<ProviderResult<CalendarEvent[]>>;

  /**
   * Get a single event by ID
   */
  abstract getEvent(eventId: string): Promise<ProviderResult<CalendarEvent | null>>;

  /**
   * Get upcoming events for the next N days
   */
  abstract getUpcomingEvents(days?: number): Promise<ProviderResult<CalendarEvent[]>>;

  /**
   * Get today's events
   */
  abstract getTodayEvents(): Promise<ProviderResult<CalendarEvent[]>>;
}

/**
 * Google Calendar provider
 */
export class GoogleCalendarProvider extends CalendarProvider {
  private readonly baseUrl = 'https://www.googleapis.com/calendar/v3';
  private accessToken: string | undefined;

  get name(): string {
    return 'google';
  }

  get type(): 'calendar' {
    return 'calendar';
  }

  get providerType(): CalendarProviderType {
    return 'google';
  }

  protected override requiresApiKey(): boolean {
    return false; // Uses OAuth credentials instead
  }

  protected override async onInitialize(): Promise<void> {
    // Parse credentials from environment
    const credentialsJson = process.env[this.config.credentialsEnvVar];
    if (credentialsJson) {
      try {
        const credentials = JSON.parse(credentialsJson);
        this.accessToken = credentials.access_token;
      } catch {
        throw new ProviderError(this.name, 'Invalid credentials JSON format');
      }
    }
  }

  async getEvents(startTime: number, endTime: number): Promise<ProviderResult<CalendarEvent[]>> {
    if (!this.accessToken) {
      return {
        success: false,
        error: 'Not authenticated. Please provide valid OAuth credentials.',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const timeMin = new Date(startTime).toISOString();
    const timeMax = new Date(endTime).toISOString();
    const url = `${this.baseUrl}/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;

    const result = await this.fetch<GoogleCalendarEventsResponse>(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to fetch calendar events',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const events = result.data.items.map(item => this.mapGoogleEvent(item));

    return {
      success: true,
      data: events,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async getEvent(eventId: string): Promise<ProviderResult<CalendarEvent | null>> {
    if (!this.accessToken) {
      return {
        success: false,
        error: 'Not authenticated',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const url = `${this.baseUrl}/calendars/primary/events/${eventId}`;

    const result = await this.fetch<GoogleCalendarEventItem>(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to fetch event',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    return {
      success: true,
      data: this.mapGoogleEvent(result.data),
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async getUpcomingEvents(days = 7): Promise<ProviderResult<CalendarEvent[]>> {
    const now = Date.now();
    const endTime = now + days * 24 * 60 * 60 * 1000;
    return this.getEvents(now, endTime);
  }

  async getTodayEvents(): Promise<ProviderResult<CalendarEvent[]>> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;
    return this.getEvents(startOfDay, endOfDay);
  }

  private mapGoogleEvent(item: GoogleCalendarEventItem): CalendarEvent {
    const startTime = item.start.dateTime
      ? new Date(item.start.dateTime).getTime()
      : new Date(item.start.date!).getTime();
    const endTime = item.end.dateTime
      ? new Date(item.end.dateTime).getTime()
      : new Date(item.end.date!).getTime();

    const attendees: CalendarAttendee[] = (item.attendees ?? []).map(a => ({
      email: a.email,
      name: a.displayName,
      status: this.mapAttendeeStatus(a.responseStatus),
      isOptional: a.optional ?? false,
      isOrganizer: a.organizer ?? false,
    }));

    const organizer: CalendarAttendee | undefined = item.organizer
      ? {
          email: item.organizer.email,
          name: item.organizer.displayName,
          status: 'accepted',
          isOrganizer: true,
        }
      : undefined;

    return {
      id: item.id,
      calendarId: 'primary',
      title: item.summary ?? 'Untitled Event',
      description: item.description,
      location: item.location,
      startTime,
      endTime,
      isAllDay: !item.start.dateTime,
      attendees,
      organizer,
      status: this.mapEventStatus(item.status),
      recurrence: item.recurrence?.join(' '),
      conferenceLink: item.hangoutLink ?? item.conferenceData?.entryPoints?.[0]?.uri,
      createdAt: item.created ? new Date(item.created).getTime() : Date.now(),
      updatedAt: item.updated ? new Date(item.updated).getTime() : Date.now(),
    };
  }

  private mapAttendeeStatus(status?: string): CalendarAttendee['status'] {
    switch (status) {
      case 'accepted':
        return 'accepted';
      case 'declined':
        return 'declined';
      case 'tentative':
        return 'tentative';
      default:
        return 'needsAction';
    }
  }

  private mapEventStatus(status?: string): CalendarEvent['status'] {
    switch (status) {
      case 'confirmed':
        return 'confirmed';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'tentative';
    }
  }
}

/**
 * Outlook Calendar provider
 */
export class OutlookCalendarProvider extends CalendarProvider {
  private readonly baseUrl = 'https://graph.microsoft.com/v1.0';
  private accessToken: string | undefined;

  get name(): string {
    return 'outlook';
  }

  get type(): 'calendar' {
    return 'calendar';
  }

  get providerType(): CalendarProviderType {
    return 'outlook';
  }

  protected override requiresApiKey(): boolean {
    return false;
  }

  protected override async onInitialize(): Promise<void> {
    const credentialsJson = process.env[this.config.credentialsEnvVar];
    if (credentialsJson) {
      try {
        const credentials = JSON.parse(credentialsJson);
        this.accessToken = credentials.access_token;
      } catch {
        throw new ProviderError(this.name, 'Invalid credentials JSON format');
      }
    }
  }

  async getEvents(startTime: number, endTime: number): Promise<ProviderResult<CalendarEvent[]>> {
    if (!this.accessToken) {
      return {
        success: false,
        error: 'Not authenticated',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const startDateTime = new Date(startTime).toISOString();
    const endDateTime = new Date(endTime).toISOString();
    const url = `${this.baseUrl}/me/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}&$orderby=start/dateTime`;

    const result = await this.fetch<OutlookCalendarEventsResponse>(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to fetch calendar events',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const events = result.data.value.map(item => this.mapOutlookEvent(item));

    return {
      success: true,
      data: events,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async getEvent(eventId: string): Promise<ProviderResult<CalendarEvent | null>> {
    if (!this.accessToken) {
      return {
        success: false,
        error: 'Not authenticated',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const url = `${this.baseUrl}/me/events/${eventId}`;

    const result = await this.fetch<OutlookCalendarEventItem>(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to fetch event',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    return {
      success: true,
      data: this.mapOutlookEvent(result.data),
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async getUpcomingEvents(days = 7): Promise<ProviderResult<CalendarEvent[]>> {
    const now = Date.now();
    const endTime = now + days * 24 * 60 * 60 * 1000;
    return this.getEvents(now, endTime);
  }

  async getTodayEvents(): Promise<ProviderResult<CalendarEvent[]>> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;
    return this.getEvents(startOfDay, endOfDay);
  }

  private mapOutlookEvent(item: OutlookCalendarEventItem): CalendarEvent {
    const startTime = new Date(item.start.dateTime + 'Z').getTime();
    const endTime = new Date(item.end.dateTime + 'Z').getTime();

    const attendees: CalendarAttendee[] = (item.attendees ?? []).map(a => ({
      email: a.emailAddress.address,
      name: a.emailAddress.name,
      status: this.mapAttendeeStatus(a.status?.response),
      isOptional: a.type === 'optional',
    }));

    const organizer: CalendarAttendee | undefined = item.organizer
      ? {
          email: item.organizer.emailAddress.address,
          name: item.organizer.emailAddress.name,
          status: 'accepted',
          isOrganizer: true,
        }
      : undefined;

    return {
      id: item.id,
      calendarId: item.calendar?.id ?? 'primary',
      title: item.subject ?? 'Untitled Event',
      description: item.bodyPreview,
      location: item.location?.displayName,
      startTime,
      endTime,
      isAllDay: item.isAllDay ?? false,
      attendees,
      organizer,
      status: this.mapEventStatus(item.showAs),
      conferenceLink: item.onlineMeeting?.joinUrl,
      createdAt: item.createdDateTime ? new Date(item.createdDateTime).getTime() : Date.now(),
      updatedAt: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime).getTime() : Date.now(),
    };
  }

  private mapAttendeeStatus(response?: string): CalendarAttendee['status'] {
    switch (response) {
      case 'accepted':
        return 'accepted';
      case 'declined':
        return 'declined';
      case 'tentativelyAccepted':
        return 'tentative';
      default:
        return 'needsAction';
    }
  }

  private mapEventStatus(showAs?: string): CalendarEvent['status'] {
    switch (showAs) {
      case 'free':
      case 'busy':
        return 'confirmed';
      case 'tentative':
        return 'tentative';
      default:
        return 'tentative';
    }
  }
}

// =============================================================================
// API Response Types
// =============================================================================

interface GoogleCalendarEventsResponse {
  items: GoogleCalendarEventItem[];
}

interface GoogleCalendarEventItem {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
    optional?: boolean;
    organizer?: boolean;
  }>;
  organizer?: {
    email: string;
    displayName?: string;
  };
  recurrence?: string[];
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{
      uri?: string;
    }>;
  };
  created?: string;
  updated?: string;
}

interface OutlookCalendarEventsResponse {
  value: OutlookCalendarEventItem[];
}

interface OutlookCalendarEventItem {
  id: string;
  subject?: string;
  bodyPreview?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  isAllDay?: boolean;
  showAs?: string;
  location?: {
    displayName?: string;
  };
  attendees?: Array<{
    emailAddress: {
      name?: string;
      address: string;
    };
    type?: string;
    status?: {
      response?: string;
    };
  }>;
  organizer?: {
    emailAddress: {
      name?: string;
      address: string;
    };
  };
  onlineMeeting?: {
    joinUrl?: string;
  };
  calendar?: {
    id?: string;
  };
  createdDateTime?: string;
  lastModifiedDateTime?: string;
}

/**
 * Create a calendar provider based on type
 */
export function createCalendarProvider(
  type: CalendarProviderType,
  config: CalendarConfig
): CalendarProvider {
  const providerConfig = {
    ...config,
    name: type,
    apiKeyEnvVar: config.credentialsEnvVar,
  };

  switch (type) {
    case 'google':
      return new GoogleCalendarProvider(providerConfig);
    case 'outlook':
      return new OutlookCalendarProvider(providerConfig);
    default:
      throw new ProviderError('calendar', `Unknown calendar provider type: ${type}`);
  }
}
