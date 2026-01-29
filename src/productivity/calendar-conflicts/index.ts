/**
 * Calendar Conflict Detection Service
 *
 * Detects and manages calendar event conflicts.
 */

import type {
  CalendarEvent,
  CalendarConflict,
  ConflictResolution,
} from '../types.js';
import type { CalendarConflictsConfig } from '../config.js';
import type { CalendarProvider } from '../providers/calendar.js';
import {
  generateResolutionSuggestions,
  prioritizeConflictResolutions,
} from './resolution-suggester.js';

// Re-export resolution suggester
export {
  generateResolutionSuggestions,
  prioritizeConflictResolutions,
};

/**
 * Calendar Conflict Service
 */
export class CalendarConflictService {
  private readonly lookAheadDays: number;
  private readonly minOverlapMinutes: number;
  private readonly autoSuggest: boolean;
  private readonly ignoreAllDayEvents: boolean;

  constructor(
    private readonly calendarProvider: CalendarProvider,
    config?: Partial<CalendarConflictsConfig>
  ) {
    this.lookAheadDays = config?.lookAheadDays ?? 7;
    this.minOverlapMinutes = config?.minOverlapMinutes ?? 5;
    this.autoSuggest = config?.autoSuggest ?? true;
    this.ignoreAllDayEvents = config?.ignoreAllDayEvents ?? true;
  }

  /**
   * Detect all conflicts in the upcoming period
   */
  async detectConflicts(): Promise<CalendarConflict[]> {
    const result = await this.calendarProvider.getUpcomingEvents(this.lookAheadDays);

    if (!result.success || !result.data) {
      return [];
    }

    let events = result.data.filter(e => e.status !== 'cancelled');

    // Optionally ignore all-day events
    if (this.ignoreAllDayEvents) {
      events = events.filter(e => !e.isAllDay);
    }

    return this.findConflicts(events);
  }

  /**
   * Detect conflicts for a specific day
   */
  async detectConflictsForDay(date: Date): Promise<CalendarConflict[]> {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;

    const result = await this.calendarProvider.getEvents(startOfDay, endOfDay);

    if (!result.success || !result.data) {
      return [];
    }

    let events = result.data.filter(e => e.status !== 'cancelled');

    if (this.ignoreAllDayEvents) {
      events = events.filter(e => !e.isAllDay);
    }

    return this.findConflicts(events);
  }

  /**
   * Check if a new event would conflict with existing events
   */
  async checkEventConflicts(
    startTime: number,
    endTime: number,
    excludeEventId?: string
  ): Promise<CalendarConflict[]> {
    // Get events that could potentially overlap
    const buffer = 24 * 60 * 60 * 1000; // 1 day buffer
    const result = await this.calendarProvider.getEvents(
      startTime - buffer,
      endTime + buffer
    );

    if (!result.success || !result.data) {
      return [];
    }

    const events = result.data.filter(
      e => e.status !== 'cancelled' && e.id !== excludeEventId
    );

    // Create a temporary event for checking
    const tempEvent: CalendarEvent = {
      id: 'temp-check',
      calendarId: 'temp',
      title: 'New Event',
      startTime,
      endTime,
      isAllDay: false,
      attendees: [],
      status: 'tentative',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const conflicts: CalendarConflict[] = [];

    for (const event of events) {
      if (this.eventsOverlap(tempEvent, event)) {
        const overlapMinutes = this.calculateOverlapMinutes(tempEvent, event);

        if (overlapMinutes >= this.minOverlapMinutes) {
          conflicts.push(this.createConflict(tempEvent, event, overlapMinutes));
        }
      }
    }

    return conflicts;
  }

  /**
   * Find conflicts among a list of events
   */
  findConflicts(events: CalendarEvent[]): CalendarConflict[] {
    const conflicts: CalendarConflict[] = [];

    // Sort events by start time
    const sorted = [...events].sort((a, b) => a.startTime - b.startTime);

    // Check each pair of events
    for (let i = 0; i < sorted.length - 1; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const e1 = sorted[i];
        const e2 = sorted[j];

        // If e2 starts after e1 ends, no more overlaps possible with e1
        if (e2.startTime >= e1.endTime) {
          break;
        }

        if (this.eventsOverlap(e1, e2)) {
          const overlapMinutes = this.calculateOverlapMinutes(e1, e2);

          if (overlapMinutes >= this.minOverlapMinutes) {
            conflicts.push(this.createConflict(e1, e2, overlapMinutes));
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Get a summary of conflicts
   */
  async getConflictSummary(): Promise<ConflictSummary> {
    const conflicts = await this.detectConflicts();

    const bySeverity = {
      minor: 0,
      moderate: 0,
      severe: 0,
    };

    let totalOverlapMinutes = 0;
    const affectedEvents = new Set<string>();

    for (const conflict of conflicts) {
      bySeverity[conflict.severity]++;
      totalOverlapMinutes += conflict.overlapMinutes;
      affectedEvents.add(conflict.event1.id);
      affectedEvents.add(conflict.event2.id);
    }

    return {
      totalConflicts: conflicts.length,
      bySeverity,
      totalOverlapMinutes,
      affectedEventsCount: affectedEvents.size,
      conflicts,
    };
  }

  /**
   * Get prioritized conflicts with resolutions
   */
  async getPrioritizedConflicts(): Promise<
    Array<{
      conflict: CalendarConflict;
      priority: number;
      bestSuggestion: ConflictResolution | null;
    }>
  > {
    const conflicts = await this.detectConflicts();
    return prioritizeConflictResolutions(conflicts);
  }

  // ==========================================================================
  // Private methods
  // ==========================================================================

  private eventsOverlap(e1: CalendarEvent, e2: CalendarEvent): boolean {
    return e1.startTime < e2.endTime && e2.startTime < e1.endTime;
  }

  private calculateOverlapMinutes(e1: CalendarEvent, e2: CalendarEvent): number {
    const overlapStart = Math.max(e1.startTime, e2.startTime);
    const overlapEnd = Math.min(e1.endTime, e2.endTime);
    return Math.max(0, (overlapEnd - overlapStart) / 60000);
  }

  private createConflict(
    event1: CalendarEvent,
    event2: CalendarEvent,
    overlapMinutes: number
  ): CalendarConflict {
    const severity = this.calculateSeverity(overlapMinutes, event1, event2);

    const suggestions = this.autoSuggest
      ? generateResolutionSuggestions(event1, event2, overlapMinutes)
      : [];

    return {
      event1,
      event2,
      overlapMinutes,
      severity,
      suggestions,
    };
  }

  private calculateSeverity(
    overlapMinutes: number,
    event1: CalendarEvent,
    event2: CalendarEvent
  ): 'minor' | 'moderate' | 'severe' {
    // Calculate what percentage of the shorter event is overlapped
    const duration1 = (event1.endTime - event1.startTime) / 60000;
    const duration2 = (event2.endTime - event2.startTime) / 60000;
    const shorterDuration = Math.min(duration1, duration2);
    const overlapPercentage = (overlapMinutes / shorterDuration) * 100;

    if (overlapPercentage >= 50 || overlapMinutes >= 60) {
      return 'severe';
    }

    if (overlapPercentage >= 25 || overlapMinutes >= 30) {
      return 'moderate';
    }

    return 'minor';
  }
}

/**
 * Conflict summary
 */
export interface ConflictSummary {
  totalConflicts: number;
  bySeverity: {
    minor: number;
    moderate: number;
    severe: number;
  };
  totalOverlapMinutes: number;
  affectedEventsCount: number;
  conflicts: CalendarConflict[];
}

/**
 * Create a calendar conflict service
 */
export function createCalendarConflictService(
  calendarProvider: CalendarProvider,
  config?: Partial<CalendarConflictsConfig>
): CalendarConflictService {
  return new CalendarConflictService(calendarProvider, config);
}
