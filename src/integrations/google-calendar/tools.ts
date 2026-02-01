/**
 * Google Calendar Integration - Tool Definitions
 */

import type { ToolDefinition } from '../types.js';
import type { GoogleCalendarApi } from './api.js';
import type { EventInput, EventDateTime } from './types.js';

/**
 * Create Google Calendar tools
 */
export function createGoogleCalendarTools(
  api: GoogleCalendarApi,
): ToolDefinition[] {
  return [
    createListEventsTool(api),
    createGetEventTool(api),
    createCreateEventTool(api),
    createUpdateEventTool(api),
    createDeleteEventTool(api),
    createCheckAvailabilityTool(api),
  ];
}

/**
 * List upcoming events
 */
function createListEventsTool(api: GoogleCalendarApi): ToolDefinition {
  return {
    name: 'calendar_list_events',
    description:
      'List upcoming calendar events. Can filter by date range and search query.',
    parameters: [
      {
        name: 'calendarId',
        type: 'string',
        description: 'Calendar ID (default: "primary")',
        required: false,
        default: 'primary',
      },
      {
        name: 'timeMin',
        type: 'string',
        description: 'Start of time range (ISO 8601 format)',
        required: false,
      },
      {
        name: 'timeMax',
        type: 'string',
        description: 'End of time range (ISO 8601 format)',
        required: false,
      },
      {
        name: 'maxResults',
        type: 'number',
        description: 'Maximum number of events to return',
        required: false,
        default: 10,
      },
      {
        name: 'query',
        type: 'string',
        description: 'Search query to filter events',
        required: false,
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        // Default to showing events from now
        const timeMin =
          (params.timeMin as string) || new Date().toISOString();

        const response = await api.listEvents({
          calendarId: params.calendarId as string,
          timeMin,
          timeMax: params.timeMax as string | undefined,
          maxResults: (params.maxResults as number) || 10,
          q: params.query as string | undefined,
          singleEvents: true,
          orderBy: 'startTime',
        });

        return {
          success: true,
          data: {
            events: response.items.map((event) => ({
              id: event.id,
              summary: event.summary,
              description: event.description,
              location: event.location,
              start: event.start,
              end: event.end,
              status: event.status,
              htmlLink: event.htmlLink,
              attendees: event.attendees?.map((a) => ({
                email: a.email,
                displayName: a.displayName,
                responseStatus: a.responseStatus,
              })),
            })),
            nextPageToken: response.nextPageToken,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to list events',
        };
      }
    },
  };
}

/**
 * Get event details
 */
function createGetEventTool(api: GoogleCalendarApi): ToolDefinition {
  return {
    name: 'calendar_get_event',
    description: 'Get detailed information about a specific calendar event.',
    parameters: [
      {
        name: 'eventId',
        type: 'string',
        description: 'The ID of the event',
        required: true,
      },
      {
        name: 'calendarId',
        type: 'string',
        description: 'Calendar ID (default: "primary")',
        required: false,
        default: 'primary',
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        const event = await api.getEvent(
          params.eventId as string,
          params.calendarId as string,
        );

        return {
          success: true,
          data: event,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get event',
        };
      }
    },
  };
}

/**
 * Create a new event
 */
function createCreateEventTool(api: GoogleCalendarApi): ToolDefinition {
  return {
    name: 'calendar_create_event',
    description:
      'Create a new calendar event. Supports setting time, location, attendees, and more.',
    parameters: [
      {
        name: 'summary',
        type: 'string',
        description: 'Event title',
        required: true,
      },
      {
        name: 'start',
        type: 'string',
        description: 'Start time (ISO 8601) or date (YYYY-MM-DD for all-day)',
        required: true,
      },
      {
        name: 'end',
        type: 'string',
        description: 'End time (ISO 8601) or date (YYYY-MM-DD for all-day)',
        required: true,
      },
      {
        name: 'description',
        type: 'string',
        description: 'Event description',
        required: false,
      },
      {
        name: 'location',
        type: 'string',
        description: 'Event location',
        required: false,
      },
      {
        name: 'attendees',
        type: 'array',
        description: 'Array of attendee email addresses',
        required: false,
      },
      {
        name: 'calendarId',
        type: 'string',
        description: 'Calendar ID (default: "primary")',
        required: false,
        default: 'primary',
      },
      {
        name: 'sendUpdates',
        type: 'string',
        description: 'Send updates to attendees: "all", "externalOnly", "none"',
        required: false,
        enum: ['all', 'externalOnly', 'none'],
      },
    ],
    riskLevel: 'medium',
    execute: async (params) => {
      try {
        const startStr = params.start as string;
        const endStr = params.end as string;

        // Determine if all-day event (date only, no time component)
        const isAllDay = !startStr.includes('T');

        const start: EventDateTime = isAllDay
          ? { date: startStr }
          : { dateTime: startStr };

        const end: EventDateTime = isAllDay
          ? { date: endStr }
          : { dateTime: endStr };

        const eventInput: EventInput = {
          summary: params.summary as string,
          description: params.description as string | undefined,
          location: params.location as string | undefined,
          start,
          end,
          attendees: (params.attendees as string[] | undefined)?.map(
            (email) => ({ email }),
          ),
        };

        const event = await api.createEvent(
          eventInput,
          params.calendarId as string,
          {
            sendUpdates: params.sendUpdates as 'all' | 'externalOnly' | 'none',
          },
        );

        return {
          success: true,
          data: {
            id: event.id,
            summary: event.summary,
            start: event.start,
            end: event.end,
            htmlLink: event.htmlLink,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to create event',
        };
      }
    },
  };
}

/**
 * Update an event
 */
function createUpdateEventTool(api: GoogleCalendarApi): ToolDefinition {
  return {
    name: 'calendar_update_event',
    description: 'Update an existing calendar event.',
    parameters: [
      {
        name: 'eventId',
        type: 'string',
        description: 'The ID of the event to update',
        required: true,
      },
      {
        name: 'summary',
        type: 'string',
        description: 'New event title',
        required: false,
      },
      {
        name: 'start',
        type: 'string',
        description: 'New start time (ISO 8601)',
        required: false,
      },
      {
        name: 'end',
        type: 'string',
        description: 'New end time (ISO 8601)',
        required: false,
      },
      {
        name: 'description',
        type: 'string',
        description: 'New description',
        required: false,
      },
      {
        name: 'location',
        type: 'string',
        description: 'New location',
        required: false,
      },
      {
        name: 'calendarId',
        type: 'string',
        description: 'Calendar ID (default: "primary")',
        required: false,
        default: 'primary',
      },
      {
        name: 'sendUpdates',
        type: 'string',
        description: 'Send updates to attendees: "all", "externalOnly", "none"',
        required: false,
        enum: ['all', 'externalOnly', 'none'],
      },
    ],
    riskLevel: 'medium',
    execute: async (params) => {
      try {
        const updates: Partial<EventInput> = {};

        if (params.summary) updates.summary = params.summary as string;
        if (params.description)
          updates.description = params.description as string;
        if (params.location) updates.location = params.location as string;

        if (params.start) {
          const startStr = params.start as string;
          updates.start = startStr.includes('T')
            ? { dateTime: startStr }
            : { date: startStr };
        }

        if (params.end) {
          const endStr = params.end as string;
          updates.end = endStr.includes('T')
            ? { dateTime: endStr }
            : { date: endStr };
        }

        const event = await api.updateEvent(
          params.eventId as string,
          updates,
          params.calendarId as string,
          {
            sendUpdates: params.sendUpdates as 'all' | 'externalOnly' | 'none',
          },
        );

        return {
          success: true,
          data: {
            id: event.id,
            summary: event.summary,
            start: event.start,
            end: event.end,
            htmlLink: event.htmlLink,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to update event',
        };
      }
    },
  };
}

/**
 * Delete an event
 */
function createDeleteEventTool(api: GoogleCalendarApi): ToolDefinition {
  return {
    name: 'calendar_delete_event',
    description: 'Delete a calendar event.',
    parameters: [
      {
        name: 'eventId',
        type: 'string',
        description: 'The ID of the event to delete',
        required: true,
      },
      {
        name: 'calendarId',
        type: 'string',
        description: 'Calendar ID (default: "primary")',
        required: false,
        default: 'primary',
      },
      {
        name: 'sendUpdates',
        type: 'string',
        description: 'Send cancellation to attendees: "all", "externalOnly", "none"',
        required: false,
        enum: ['all', 'externalOnly', 'none'],
      },
    ],
    riskLevel: 'high',
    execute: async (params) => {
      try {
        await api.deleteEvent(
          params.eventId as string,
          params.calendarId as string,
          {
            sendUpdates: params.sendUpdates as 'all' | 'externalOnly' | 'none',
          },
        );

        return {
          success: true,
          data: { deleted: true, eventId: params.eventId },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to delete event',
        };
      }
    },
  };
}

/**
 * Check availability (free/busy)
 */
function createCheckAvailabilityTool(api: GoogleCalendarApi): ToolDefinition {
  return {
    name: 'calendar_check_availability',
    description:
      'Check free/busy times for one or more calendars within a time range.',
    parameters: [
      {
        name: 'timeMin',
        type: 'string',
        description: 'Start of time range (ISO 8601)',
        required: true,
      },
      {
        name: 'timeMax',
        type: 'string',
        description: 'End of time range (ISO 8601)',
        required: true,
      },
      {
        name: 'calendarIds',
        type: 'array',
        description: 'Array of calendar IDs to check (default: ["primary"])',
        required: false,
      },
      {
        name: 'timeZone',
        type: 'string',
        description: 'Time zone for the query',
        required: false,
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        const calendarIds =
          (params.calendarIds as string[]) || ['primary'];

        const response = await api.freeBusy({
          timeMin: params.timeMin as string,
          timeMax: params.timeMax as string,
          timeZone: params.timeZone as string | undefined,
          items: calendarIds.map((id) => ({ id })),
        });

        // Transform response to be more readable
        const availability: Record<string, { busy: { start: string; end: string }[] }> = {};
        for (const [calId, data] of Object.entries(response.calendars)) {
          availability[calId] = {
            busy: data.busy,
          };
        }

        return {
          success: true,
          data: {
            timeMin: response.timeMin,
            timeMax: response.timeMax,
            availability,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to check availability',
        };
      }
    },
  };
}
