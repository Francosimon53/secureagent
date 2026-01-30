/**
 * Calendar Manager
 *
 * Calendar management with conflict detection and focus time blocking
 */

import type {
  CalendarEvent,
  CalendarFilter,
  CalendarProvider,
  CalendarDay,
  WeekOverview,
  EventConflict,
} from './types.js';
import { DailyDriverError } from './types.js';
import {
  DAILY_DRIVER_EVENTS,
  CALENDAR_DEFAULTS,
  TIME_CONSTANTS,
  getStartOfDay,
  getEndOfDay,
  getStartOfWeek,
  getEndOfWeek,
  formatDuration,
} from './constants.js';

// =============================================================================
// Calendar Manager Config
// =============================================================================

export interface CalendarManagerConfig {
  /** Calendar provider */
  provider?: CalendarProvider;
  /** Primary calendar ID */
  primaryCalendarId: string;
  /** Working hours start (0-23) */
  workStartHour: number;
  /** Working hours end (0-23) */
  workEndHour: number;
  /** Minimum focus block in minutes */
  minFocusBlockMinutes: number;
  /** Buffer between meetings in minutes */
  meetingBufferMinutes: number;
  /** Default event duration in minutes */
  defaultEventDuration: number;
  /** Timezone */
  timezone: string;
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: CalendarManagerConfig = {
  primaryCalendarId: 'primary',
  workStartHour: CALENDAR_DEFAULTS.WORK_START_HOUR,
  workEndHour: CALENDAR_DEFAULTS.WORK_END_HOUR,
  minFocusBlockMinutes: CALENDAR_DEFAULTS.MIN_FOCUS_BLOCK_MINUTES,
  meetingBufferMinutes: CALENDAR_DEFAULTS.MEETING_BUFFER_MINUTES,
  defaultEventDuration: 30,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

// =============================================================================
// Calendar Manager
// =============================================================================

export class CalendarManager {
  private readonly config: CalendarManagerConfig;
  private provider: CalendarProvider | null = null;

  constructor(config?: Partial<CalendarManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.provider = this.config.provider ?? null;
  }

  /**
   * Set the calendar provider
   */
  setProvider(provider: CalendarProvider): void {
    this.provider = provider;
  }

  /**
   * Get events for a day
   */
  async getEventsForDay(date?: number): Promise<CalendarEvent[]> {
    this.ensureProvider();

    const dayStart = getStartOfDay(date);
    const dayEnd = getEndOfDay(date);

    return this.provider!.listEvents({
      startAfter: dayStart,
      startBefore: dayEnd,
      excludeCancelled: true,
    });
  }

  /**
   * Get events for a date range
   */
  async getEventsForRange(startDate: number, endDate: number): Promise<CalendarEvent[]> {
    this.ensureProvider();

    return this.provider!.listEvents({
      startAfter: startDate,
      startBefore: endDate,
      excludeCancelled: true,
    });
  }

  /**
   * Get day overview
   */
  async getDayOverview(date?: number): Promise<CalendarDay> {
    const events = await this.getEventsForDay(date);
    const dayStart = getStartOfDay(date);

    const busyTime = this.calculateBusyTime(events);
    const workingMinutes = (this.config.workEndHour - this.config.workStartHour) * 60;
    const freeTime = Math.max(0, workingMinutes - busyTime);
    const focusTime = this.calculateFocusTime(events, date);

    return {
      date: dayStart,
      events,
      busyTime,
      freeTime,
      focusTime,
    };
  }

  /**
   * Get week overview
   */
  async getWeekOverview(weekStart?: number): Promise<WeekOverview> {
    const start = getStartOfWeek(weekStart);
    const end = getEndOfWeek(weekStart);

    const events = await this.getEventsForRange(start, end);
    const days: CalendarDay[] = [];

    // Build day-by-day overview
    for (let i = 0; i < 7; i++) {
      const dayDate = start + i * TIME_CONSTANTS.DAY_MS;
      const dayEvents = events.filter(e => {
        const eventDay = getStartOfDay(e.start);
        return eventDay === getStartOfDay(dayDate);
      });

      const busyTime = this.calculateBusyTime(dayEvents);
      const workingMinutes = (this.config.workEndHour - this.config.workStartHour) * 60;

      days.push({
        date: dayDate,
        events: dayEvents,
        busyTime,
        freeTime: Math.max(0, workingMinutes - busyTime),
        focusTime: this.calculateFocusTime(dayEvents, dayDate),
      });
    }

    const totalMeetingTime = events
      .filter(e => !e.isAllDay)
      .reduce((sum, e) => sum + (e.end - e.start), 0) / TIME_CONSTANTS.MINUTE_MS;

    const focusTimeAvailable = days.reduce((sum, d) => sum + d.focusTime, 0);
    const conflicts = this.detectConflicts(events);

    return {
      weekStart: start,
      weekEnd: end,
      days,
      totalMeetings: events.filter(e => !e.isAllDay).length,
      totalMeetingTime,
      focusTimeAvailable,
      conflicts,
    };
  }

  /**
   * Find next available time slot
   */
  async findNextAvailableSlot(
    durationMinutes: number,
    options?: {
      afterDate?: number;
      beforeDate?: number;
      preferMorning?: boolean;
    }
  ): Promise<{ start: number; end: number } | null> {
    const afterDate = options?.afterDate ?? Date.now();
    const beforeDate = options?.beforeDate ?? afterDate + 7 * TIME_CONSTANTS.DAY_MS;

    const events = await this.getEventsForRange(afterDate, beforeDate);

    // Group by day
    let currentDate = getStartOfDay(afterDate);

    while (currentDate < beforeDate) {
      const dayEvents = events
        .filter(e => getStartOfDay(e.start) === currentDate && !e.isAllDay)
        .sort((a, b) => a.start - b.start);

      // Working hours for this day
      const workStart = currentDate + this.config.workStartHour * TIME_CONSTANTS.HOUR_MS;
      const workEnd = currentDate + this.config.workEndHour * TIME_CONSTANTS.HOUR_MS;

      // Find gaps in schedule
      let searchStart = Math.max(afterDate, workStart);

      for (const event of dayEvents) {
        if (event.start - searchStart >= durationMinutes * TIME_CONSTANTS.MINUTE_MS) {
          return {
            start: searchStart,
            end: searchStart + durationMinutes * TIME_CONSTANTS.MINUTE_MS,
          };
        }
        searchStart = Math.max(searchStart, event.end + this.config.meetingBufferMinutes * TIME_CONSTANTS.MINUTE_MS);
      }

      // Check after last event
      if (workEnd - searchStart >= durationMinutes * TIME_CONSTANTS.MINUTE_MS) {
        return {
          start: searchStart,
          end: searchStart + durationMinutes * TIME_CONSTANTS.MINUTE_MS,
        };
      }

      currentDate += TIME_CONSTANTS.DAY_MS;
    }

    return null;
  }

  /**
   * Find focus time blocks
   */
  async findFocusBlocks(
    date?: number,
    minMinutes?: number
  ): Promise<Array<{ start: number; end: number; duration: number }>> {
    const events = await this.getEventsForDay(date);
    const dayStart = getStartOfDay(date);

    const workStart = dayStart + this.config.workStartHour * TIME_CONSTANTS.HOUR_MS;
    const workEnd = dayStart + this.config.workEndHour * TIME_CONSTANTS.HOUR_MS;

    const minDuration = (minMinutes ?? this.config.minFocusBlockMinutes) * TIME_CONSTANTS.MINUTE_MS;
    const sortedEvents = events
      .filter(e => !e.isAllDay && e.start < workEnd && e.end > workStart)
      .sort((a, b) => a.start - b.start);

    const blocks: Array<{ start: number; end: number; duration: number }> = [];
    let searchStart = workStart;

    for (const event of sortedEvents) {
      const gapStart = Math.max(searchStart, workStart);
      const gapEnd = Math.min(event.start, workEnd);

      if (gapEnd - gapStart >= minDuration) {
        blocks.push({
          start: gapStart,
          end: gapEnd,
          duration: (gapEnd - gapStart) / TIME_CONSTANTS.MINUTE_MS,
        });
      }

      searchStart = event.end + this.config.meetingBufferMinutes * TIME_CONSTANTS.MINUTE_MS;
    }

    // Check after last event
    if (workEnd - searchStart >= minDuration) {
      blocks.push({
        start: searchStart,
        end: workEnd,
        duration: (workEnd - searchStart) / TIME_CONSTANTS.MINUTE_MS,
      });
    }

    return blocks;
  }

  /**
   * Detect scheduling conflicts
   */
  detectConflicts(events: CalendarEvent[]): EventConflict[] {
    const conflicts: EventConflict[] = [];
    const sorted = events
      .filter(e => !e.isAllDay)
      .sort((a, b) => a.start - b.start);

    for (let i = 0; i < sorted.length - 1; i++) {
      const event1 = sorted[i];
      const event2 = sorted[i + 1];

      // Check for overlap
      if (event1.end > event2.start) {
        conflicts.push({
          event1Id: event1.id,
          event2Id: event2.id,
          overlapStart: event2.start,
          overlapEnd: Math.min(event1.end, event2.end),
          severity: 'overlap',
        });
      }
      // Check for back-to-back (no buffer)
      else if (event2.start - event1.end < this.config.meetingBufferMinutes * TIME_CONSTANTS.MINUTE_MS) {
        conflicts.push({
          event1Id: event1.id,
          event2Id: event2.id,
          overlapStart: event1.end,
          overlapEnd: event2.start,
          severity: 'back_to_back',
        });
      }
    }

    if (conflicts.length > 0) {
      this.emit(DAILY_DRIVER_EVENTS.CONFLICT_DETECTED, { conflicts });
    }

    return conflicts;
  }

  /**
   * Get upcoming events
   */
  async getUpcomingEvents(hours: number = 24): Promise<CalendarEvent[]> {
    this.ensureProvider();

    const now = Date.now();
    const end = now + hours * TIME_CONSTANTS.HOUR_MS;

    const events = await this.provider!.listEvents({
      startAfter: now,
      startBefore: end,
      excludeCancelled: true,
    });

    return events.sort((a, b) => a.start - b.start);
  }

  /**
   * Get next event
   */
  async getNextEvent(): Promise<CalendarEvent | null> {
    const events = await this.getUpcomingEvents(48);
    return events[0] ?? null;
  }

  /**
   * Create a new event
   */
  async createEvent(
    title: string,
    start: number,
    end: number,
    options?: {
      description?: string;
      location?: string;
      attendees?: string[];
      calendarId?: string;
    }
  ): Promise<CalendarEvent> {
    this.ensureProvider();

    const calendarId = options?.calendarId ?? this.config.primaryCalendarId;

    return this.provider!.createEvent(calendarId, {
      title,
      start,
      end,
      isAllDay: false,
      status: 'confirmed',
      visibility: 'default',
      organizer: { email: '' }, // Will be set by provider
      attendees: (options?.attendees ?? []).map(email => ({
        email,
        responseStatus: 'needsAction',
      })),
      description: options?.description,
      location: options?.location,
    });
  }

  /**
   * Block focus time
   */
  async blockFocusTime(
    title: string,
    durationMinutes: number,
    options?: {
      date?: number;
      preferMorning?: boolean;
    }
  ): Promise<CalendarEvent | null> {
    const slot = await this.findNextAvailableSlot(durationMinutes, {
      afterDate: options?.date ?? Date.now(),
      preferMorning: options?.preferMorning,
    });

    if (!slot) {
      return null;
    }

    return this.createEvent(title, slot.start, slot.end, {
      description: 'Focus time block - Do not schedule',
    });
  }

  /**
   * Get calendar summary for a period
   */
  async getCalendarSummary(startDate: number, endDate: number): Promise<{
    totalEvents: number;
    totalMeetingHours: number;
    busiestDay: { date: number; eventCount: number };
    conflicts: number;
    focusHoursAvailable: number;
  }> {
    const events = await this.getEventsForRange(startDate, endDate);
    const conflicts = this.detectConflicts(events);

    const totalMeetingMs = events
      .filter(e => !e.isAllDay)
      .reduce((sum, e) => sum + (e.end - e.start), 0);

    // Find busiest day
    const dayMap = new Map<number, number>();
    for (const event of events) {
      const day = getStartOfDay(event.start);
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }

    let busiestDay = { date: startDate, eventCount: 0 };
    for (const [date, count] of dayMap) {
      if (count > busiestDay.eventCount) {
        busiestDay = { date, eventCount: count };
      }
    }

    // Calculate focus hours
    const days = Math.ceil((endDate - startDate) / TIME_CONSTANTS.DAY_MS);
    const workingHoursPerDay = this.config.workEndHour - this.config.workStartHour;
    const totalWorkingHours = days * workingHoursPerDay;
    const focusHoursAvailable = totalWorkingHours - totalMeetingMs / TIME_CONSTANTS.HOUR_MS;

    return {
      totalEvents: events.length,
      totalMeetingHours: Math.round(totalMeetingMs / TIME_CONSTANTS.HOUR_MS * 10) / 10,
      busiestDay,
      conflicts: conflicts.length,
      focusHoursAvailable: Math.round(focusHoursAvailable * 10) / 10,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private ensureProvider(): void {
    if (!this.provider) {
      throw new DailyDriverError(
        'CONFIGURATION_ERROR',
        'Calendar provider not configured'
      );
    }
  }

  private calculateBusyTime(events: CalendarEvent[]): number {
    return events
      .filter(e => !e.isAllDay)
      .reduce((sum, e) => sum + (e.end - e.start), 0) / TIME_CONSTANTS.MINUTE_MS;
  }

  private calculateFocusTime(events: CalendarEvent[], date?: number): number {
    const blocks = this.findFocusBlocksSync(events, date);
    return blocks.reduce((sum, b) => sum + b.duration, 0);
  }

  private findFocusBlocksSync(
    events: CalendarEvent[],
    date?: number
  ): Array<{ start: number; end: number; duration: number }> {
    const dayStart = getStartOfDay(date);
    const workStart = dayStart + this.config.workStartHour * TIME_CONSTANTS.HOUR_MS;
    const workEnd = dayStart + this.config.workEndHour * TIME_CONSTANTS.HOUR_MS;

    const minDuration = this.config.minFocusBlockMinutes * TIME_CONSTANTS.MINUTE_MS;
    const sortedEvents = events
      .filter(e => !e.isAllDay && e.start < workEnd && e.end > workStart)
      .sort((a, b) => a.start - b.start);

    const blocks: Array<{ start: number; end: number; duration: number }> = [];
    let searchStart = workStart;

    for (const event of sortedEvents) {
      const gapEnd = Math.min(event.start, workEnd);
      if (gapEnd - searchStart >= minDuration) {
        blocks.push({
          start: searchStart,
          end: gapEnd,
          duration: (gapEnd - searchStart) / TIME_CONSTANTS.MINUTE_MS,
        });
      }
      searchStart = event.end + this.config.meetingBufferMinutes * TIME_CONSTANTS.MINUTE_MS;
    }

    if (workEnd - searchStart >= minDuration) {
      blocks.push({
        start: searchStart,
        end: workEnd,
        duration: (workEnd - searchStart) / TIME_CONSTANTS.MINUTE_MS,
      });
    }

    return blocks;
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createCalendarManager(config?: Partial<CalendarManagerConfig>): CalendarManager {
  return new CalendarManager(config);
}
