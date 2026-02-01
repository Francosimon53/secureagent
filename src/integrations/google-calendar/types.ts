/**
 * Google Calendar Integration - Types
 */

/**
 * Calendar event
 */
export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: EventDateTime;
  end: EventDateTime;
  status: EventStatus;
  htmlLink: string;
  created: string;
  updated: string;
  creator?: EventPerson;
  organizer?: EventPerson;
  attendees?: EventAttendee[];
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: EventDateTime;
  visibility?: EventVisibility;
  transparency?: EventTransparency;
  reminders?: EventReminders;
  conferenceData?: ConferenceData;
  attachments?: EventAttachment[];
  colorId?: string;
}

export interface EventDateTime {
  date?: string; // For all-day events (YYYY-MM-DD)
  dateTime?: string; // For timed events (RFC3339)
  timeZone?: string;
}

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled';
export type EventVisibility = 'default' | 'public' | 'private' | 'confidential';
export type EventTransparency = 'opaque' | 'transparent';

export interface EventPerson {
  id?: string;
  email: string;
  displayName?: string;
  self?: boolean;
}

export interface EventAttendee extends EventPerson {
  organizer?: boolean;
  resource?: boolean;
  optional?: boolean;
  responseStatus?: AttendeeResponseStatus;
  comment?: string;
  additionalGuests?: number;
}

export type AttendeeResponseStatus =
  | 'needsAction'
  | 'declined'
  | 'tentative'
  | 'accepted';

export interface EventReminders {
  useDefault: boolean;
  overrides?: ReminderOverride[];
}

export interface ReminderOverride {
  method: 'email' | 'popup';
  minutes: number;
}

export interface ConferenceData {
  createRequest?: {
    requestId: string;
    conferenceSolutionKey: { type: string };
  };
  entryPoints?: ConferenceEntryPoint[];
  conferenceSolution?: {
    key: { type: string };
    name: string;
    iconUri: string;
  };
  conferenceId?: string;
  signature?: string;
  notes?: string;
}

export interface ConferenceEntryPoint {
  entryPointType: 'video' | 'phone' | 'sip' | 'more';
  uri: string;
  label?: string;
  pin?: string;
  accessCode?: string;
  meetingCode?: string;
  passcode?: string;
  password?: string;
}

export interface EventAttachment {
  fileUrl: string;
  title: string;
  mimeType: string;
  iconLink?: string;
  fileId?: string;
}

/**
 * Calendar object
 */
export interface Calendar {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  timeZone?: string;
  colorId?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  accessRole: CalendarAccessRole;
  primary?: boolean;
}

export type CalendarAccessRole =
  | 'freeBusyReader'
  | 'reader'
  | 'writer'
  | 'owner';

/**
 * Free/busy information
 */
export interface FreeBusyRequest {
  timeMin: string;
  timeMax: string;
  timeZone?: string;
  items: { id: string }[];
}

export interface FreeBusyResponse {
  timeMin: string;
  timeMax: string;
  calendars: Record<
    string,
    {
      busy: { start: string; end: string }[];
      errors?: { domain: string; reason: string }[];
    }
  >;
}

/**
 * Event create/update input
 */
export interface EventInput {
  summary: string;
  description?: string;
  location?: string;
  start: EventDateTime;
  end: EventDateTime;
  attendees?: { email: string; displayName?: string; optional?: boolean }[];
  reminders?: EventReminders;
  visibility?: EventVisibility;
  transparency?: EventTransparency;
  colorId?: string;
  recurrence?: string[];
  conferenceData?: {
    createRequest?: {
      requestId: string;
      conferenceSolutionKey: { type: string };
    };
  };
}

/**
 * Event list options
 */
export interface EventListOptions {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  singleEvents?: boolean;
  orderBy?: 'startTime' | 'updated';
  q?: string;
  pageToken?: string;
  showDeleted?: boolean;
  timeZone?: string;
}

/**
 * Event list response
 */
export interface EventListResponse {
  items: CalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
  summary: string;
  updated: string;
  timeZone: string;
}
