/**
 * Conflict Resolution Suggester
 *
 * Generates suggestions for resolving calendar conflicts.
 */

import type {
  CalendarEvent,
  CalendarConflict,
  ConflictResolution,
} from '../types.js';

/**
 * Resolution strategy weights
 */
interface StrategyWeights {
  preferShorterEvents: boolean;
  preferFewerAttendees: boolean;
  preserveRecurring: boolean;
  preserveExternal: boolean;
}

const DEFAULT_WEIGHTS: StrategyWeights = {
  preferShorterEvents: true,
  preferFewerAttendees: true,
  preserveRecurring: true,
  preserveExternal: false,
};

/**
 * Generate resolution suggestions for a conflict
 */
export function generateResolutionSuggestions(
  event1: CalendarEvent,
  event2: CalendarEvent,
  overlapMinutes: number,
  weights: Partial<StrategyWeights> = {}
): ConflictResolution[] {
  const config = { ...DEFAULT_WEIGHTS, ...weights };
  const suggestions: ConflictResolution[] = [];

  // Determine which event is more flexible
  const flexibility1 = calculateFlexibility(event1, config);
  const flexibility2 = calculateFlexibility(event2, config);
  const moreFlexible = flexibility1 >= flexibility2 ? 'event1' : 'event2';
  const lessFlexible = moreFlexible === 'event1' ? 'event2' : 'event1';

  // 1. Reschedule the more flexible event
  const rescheduleTime = findRescheduleTime(event1, event2, moreFlexible);
  if (rescheduleTime) {
    suggestions.push({
      type: 'reschedule',
      targetEvent: moreFlexible,
      description: `Move "${moreFlexible === 'event1' ? event1.title : event2.title}" to ${formatTime(rescheduleTime.start)}`,
      suggestedTime: rescheduleTime,
      confidence: 0.8,
    });
  }

  // 2. Shorten one of the events if overlap is minor
  if (overlapMinutes <= 30) {
    const shortenEvent = moreFlexible;
    const eventToShorten = shortenEvent === 'event1' ? event1 : event2;
    const duration = (eventToShorten.endTime - eventToShorten.startTime) / 60000;

    if (duration > overlapMinutes + 15) {
      suggestions.push({
        type: 'shorten',
        targetEvent: shortenEvent,
        description: `Shorten "${eventToShorten.title}" by ${overlapMinutes} minutes`,
        confidence: 0.7,
      });
    }
  }

  // 3. Suggest declining the more flexible event
  if (flexibility1 > 0.6 || flexibility2 > 0.6) {
    suggestions.push({
      type: 'decline',
      targetEvent: moreFlexible,
      description: `Decline "${moreFlexible === 'event1' ? event1.title : event2.title}"`,
      confidence: 0.5,
    });
  }

  // 4. Suggest making attendance optional
  const eventWithMoreAttendees = event1.attendees.length >= event2.attendees.length ? 'event1' : 'event2';
  if (eventWithMoreAttendees !== lessFlexible) {
    suggestions.push({
      type: 'make_optional',
      targetEvent: lessFlexible,
      description: `Mark attendance as optional for "${lessFlexible === 'event1' ? event1.title : event2.title}"`,
      confidence: 0.4,
    });
  }

  // 5. Suggest finding an alternative time for both
  suggestions.push({
    type: 'find_alternative',
    targetEvent: 'both',
    description: 'Find a new time that works for both meetings',
    confidence: 0.6,
  });

  // Sort by confidence
  suggestions.sort((a, b) => b.confidence - a.confidence);

  return suggestions;
}

/**
 * Calculate how flexible an event is for rescheduling
 * Higher = more flexible
 */
function calculateFlexibility(
  event: CalendarEvent,
  config: StrategyWeights
): number {
  let flexibility = 0.5;

  // Tentative events are more flexible
  if (event.status === 'tentative') {
    flexibility += 0.2;
  }

  // Events with fewer attendees are more flexible
  if (config.preferFewerAttendees) {
    const attendeeCount = event.attendees.length;
    if (attendeeCount <= 2) {
      flexibility += 0.15;
    } else if (attendeeCount <= 5) {
      flexibility += 0.05;
    } else {
      flexibility -= 0.1;
    }
  }

  // Shorter events are more flexible
  if (config.preferShorterEvents) {
    const durationMinutes = (event.endTime - event.startTime) / 60000;
    if (durationMinutes <= 30) {
      flexibility += 0.1;
    } else if (durationMinutes >= 120) {
      flexibility -= 0.1;
    }
  }

  // Recurring events may be less flexible
  if (config.preserveRecurring && event.recurrence) {
    flexibility -= 0.2;
  }

  // All-day events are typically less flexible
  if (event.isAllDay) {
    flexibility -= 0.3;
  }

  // Events where user is organizer are more flexible (user can change)
  const isOrganizer = event.organizer?.isOrganizer ?? false;
  if (isOrganizer) {
    flexibility += 0.1;
  }

  return Math.max(0, Math.min(1, flexibility));
}

/**
 * Find a potential reschedule time
 */
function findRescheduleTime(
  event1: CalendarEvent,
  event2: CalendarEvent,
  eventToMove: 'event1' | 'event2'
): { start: number; end: number } | null {
  const eventToReschedule = eventToMove === 'event1' ? event1 : event2;
  const otherEvent = eventToMove === 'event1' ? event2 : event1;
  const duration = eventToReschedule.endTime - eventToReschedule.startTime;

  // Try moving to after the other event
  const afterEnd = otherEvent.endTime;
  const proposedStart = afterEnd + 15 * 60000; // 15 min buffer
  const proposedEnd = proposedStart + duration;

  // Check if the proposed time is still on the same day
  const originalDate = new Date(eventToReschedule.startTime);
  const proposedDate = new Date(proposedStart);

  if (
    originalDate.getDate() === proposedDate.getDate() &&
    proposedDate.getHours() < 18 // Before 6 PM
  ) {
    return { start: proposedStart, end: proposedEnd };
  }

  // Try moving to before the other event
  const beforeStart = otherEvent.startTime;
  const altProposedEnd = beforeStart - 15 * 60000;
  const altProposedStart = altProposedEnd - duration;

  const altProposedDate = new Date(altProposedStart);
  if (
    originalDate.getDate() === altProposedDate.getDate() &&
    altProposedDate.getHours() >= 8 // After 8 AM
  ) {
    return { start: altProposedStart, end: altProposedEnd };
  }

  return null;
}

/**
 * Format timestamp to readable time
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Analyze a list of conflicts and prioritize resolutions
 */
export function prioritizeConflictResolutions(
  conflicts: CalendarConflict[]
): Array<{ conflict: CalendarConflict; priority: number; bestSuggestion: ConflictResolution | null }> {
  return conflicts
    .map(conflict => ({
      conflict,
      priority: calculateConflictPriority(conflict),
      bestSuggestion: conflict.suggestions[0] ?? null,
    }))
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Calculate priority of resolving a conflict
 */
function calculateConflictPriority(conflict: CalendarConflict): number {
  let priority = 0;

  // Severity weight
  const severityWeights = {
    severe: 1.0,
    moderate: 0.6,
    minor: 0.3,
  };
  priority += severityWeights[conflict.severity];

  // Sooner events are higher priority
  const now = Date.now();
  const soonestStart = Math.min(conflict.event1.startTime, conflict.event2.startTime);
  const hoursUntil = (soonestStart - now) / (1000 * 60 * 60);

  if (hoursUntil <= 24) {
    priority += 0.5;
  } else if (hoursUntil <= 72) {
    priority += 0.3;
  } else if (hoursUntil <= 168) {
    priority += 0.1;
  }

  // More attendees = higher priority to resolve
  const totalAttendees = conflict.event1.attendees.length + conflict.event2.attendees.length;
  priority += Math.min(totalAttendees * 0.05, 0.3);

  return Math.min(priority, 2.0);
}
