/**
 * Google Calendar Integration - API Wrapper
 */

import type {
  CalendarEvent,
  Calendar,
  EventInput,
  EventListOptions,
  EventListResponse,
  FreeBusyRequest,
  FreeBusyResponse,
} from './types.js';
import { IntegrationError, INTEGRATION_ERROR_CODES } from '../types.js';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * Google Calendar API client configuration
 */
export interface GoogleCalendarApiConfig {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  onTokenRefresh?: (tokens: { accessToken: string; expiresAt: number }) => void;
}

/**
 * Google Calendar API client
 */
export class GoogleCalendarApi {
  private accessToken: string;
  private refreshToken?: string;
  private expiresAt?: number;
  private onTokenRefresh?: (tokens: {
    accessToken: string;
    expiresAt: number;
  }) => void;

  constructor(config: GoogleCalendarApiConfig) {
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.expiresAt = config.expiresAt;
    this.onTokenRefresh = config.onTokenRefresh;
  }

  /**
   * Update access token
   */
  updateAccessToken(accessToken: string, expiresAt?: number): void {
    this.accessToken = accessToken;
    this.expiresAt = expiresAt;
  }

  /**
   * Make authenticated request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    // Build query string
    let url = `${CALENDAR_API_BASE}${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          params.set(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const message =
        (error as { error?: { message?: string } }).error?.message ||
        response.statusText;

      if (response.status === 401) {
        throw new IntegrationError(
          'Google Calendar authentication failed',
          INTEGRATION_ERROR_CODES.AUTHENTICATION_FAILED,
          'google-calendar',
        );
      }

      if (response.status === 403) {
        throw new IntegrationError(
          'Permission denied for Google Calendar',
          INTEGRATION_ERROR_CODES.PERMISSION_DENIED,
          'google-calendar',
        );
      }

      if (response.status === 429) {
        throw new IntegrationError(
          'Google Calendar rate limit exceeded',
          INTEGRATION_ERROR_CODES.RATE_LIMITED,
          'google-calendar',
        );
      }

      throw new IntegrationError(
        `Google Calendar API error: ${message}`,
        INTEGRATION_ERROR_CODES.API_ERROR,
        'google-calendar',
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * List calendars
   */
  async listCalendars(): Promise<Calendar[]> {
    const response = await this.request<{
      items: Array<{
        id: string;
        summary: string;
        description?: string;
        location?: string;
        timeZone?: string;
        colorId?: string;
        backgroundColor?: string;
        foregroundColor?: string;
        accessRole: Calendar['accessRole'];
        primary?: boolean;
      }>;
    }>('GET', '/users/me/calendarList');

    return response.items.map((cal) => ({
      id: cal.id,
      summary: cal.summary,
      description: cal.description,
      location: cal.location,
      timeZone: cal.timeZone,
      colorId: cal.colorId,
      backgroundColor: cal.backgroundColor,
      foregroundColor: cal.foregroundColor,
      accessRole: cal.accessRole,
      primary: cal.primary,
    }));
  }

  /**
   * List events
   */
  async listEvents(options: EventListOptions = {}): Promise<EventListResponse> {
    const calendarId = options.calendarId || 'primary';
    const response = await this.request<{
      items: CalendarEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
      summary: string;
      updated: string;
      timeZone: string;
    }>(
      'GET',
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      undefined,
      {
        timeMin: options.timeMin,
        timeMax: options.timeMax,
        maxResults: options.maxResults,
        singleEvents: options.singleEvents,
        orderBy: options.orderBy,
        q: options.q,
        pageToken: options.pageToken,
        showDeleted: options.showDeleted,
        timeZone: options.timeZone,
      },
    );

    return {
      items: response.items || [],
      nextPageToken: response.nextPageToken,
      nextSyncToken: response.nextSyncToken,
      summary: response.summary,
      updated: response.updated,
      timeZone: response.timeZone,
    };
  }

  /**
   * Get event by ID
   */
  async getEvent(eventId: string, calendarId = 'primary'): Promise<CalendarEvent> {
    return this.request<CalendarEvent>(
      'GET',
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
  }

  /**
   * Create event
   */
  async createEvent(
    event: EventInput,
    calendarId = 'primary',
    options?: {
      conferenceDataVersion?: number;
      sendUpdates?: 'all' | 'externalOnly' | 'none';
    },
  ): Promise<CalendarEvent> {
    return this.request<CalendarEvent>(
      'POST',
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      event,
      {
        conferenceDataVersion: options?.conferenceDataVersion,
        sendUpdates: options?.sendUpdates,
      },
    );
  }

  /**
   * Update event
   */
  async updateEvent(
    eventId: string,
    event: Partial<EventInput>,
    calendarId = 'primary',
    options?: {
      sendUpdates?: 'all' | 'externalOnly' | 'none';
    },
  ): Promise<CalendarEvent> {
    return this.request<CalendarEvent>(
      'PATCH',
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      event,
      {
        sendUpdates: options?.sendUpdates,
      },
    );
  }

  /**
   * Delete event
   */
  async deleteEvent(
    eventId: string,
    calendarId = 'primary',
    options?: {
      sendUpdates?: 'all' | 'externalOnly' | 'none';
    },
  ): Promise<void> {
    await this.request<void>(
      'DELETE',
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      undefined,
      {
        sendUpdates: options?.sendUpdates,
      },
    );
  }

  /**
   * Check free/busy
   */
  async freeBusy(request: FreeBusyRequest): Promise<FreeBusyResponse> {
    return this.request<FreeBusyResponse>('POST', '/freeBusy', request);
  }

  /**
   * Quick add event (natural language)
   */
  async quickAdd(text: string, calendarId = 'primary'): Promise<CalendarEvent> {
    return this.request<CalendarEvent>(
      'POST',
      `/calendars/${encodeURIComponent(calendarId)}/events/quickAdd`,
      undefined,
      { text },
    );
  }

  /**
   * Verify credentials
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      await this.listCalendars();
      return true;
    } catch {
      return false;
    }
  }
}
