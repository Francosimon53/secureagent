/**
 * Conflict Resolver
 *
 * Detects and resolves scheduling conflicts including:
 * - Double bookings
 * - Overlapping assignments
 * - Travel time conflicts
 * - Authorization limits exceeded
 */

import { EventEmitter } from 'events';
import type { ScheduleStore } from '../../stores/schedule-store.js';
import type { AppointmentStore } from '../../stores/appointment-store.js';
import type { AuthorizationStore } from '../../stores/authorization-store.js';
import type {
  RBTSchedule,
  ScheduleConflict,
  ScheduleAssignment,
  RBTId,
  PatientId,
} from '../../types.js';
import { HEALTH_EVENTS } from '../../constants.js';

// =============================================================================
// Conflict Resolver Options
// =============================================================================

export interface ConflictResolverOptions {
  scheduleStore: ScheduleStore;
  appointmentStore: AppointmentStore;
  authorizationStore: AuthorizationStore;
  defaultTravelTimeMinutes?: number;
}

// =============================================================================
// Conflict Resolution Suggestion
// =============================================================================

export interface ResolutionSuggestion {
  type: 'reassign' | 'reschedule' | 'swap' | 'cancel' | 'split';
  description: string;
  affectedAssignments: string[];
  suggestedChanges: Array<{
    assignmentId?: string;
    action: string;
    details: Record<string, unknown>;
  }>;
  impact: 'low' | 'medium' | 'high';
}

// =============================================================================
// Conflict Resolver
// =============================================================================

export class ConflictResolver extends EventEmitter {
  private readonly scheduleStore: ScheduleStore;
  private readonly appointmentStore: AppointmentStore;
  private readonly authorizationStore: AuthorizationStore;
  private readonly defaultTravelTime: number;

  constructor(options: ConflictResolverOptions) {
    super();
    this.scheduleStore = options.scheduleStore;
    this.appointmentStore = options.appointmentStore;
    this.authorizationStore = options.authorizationStore;
    this.defaultTravelTime = options.defaultTravelTimeMinutes ?? 30;
  }

  /**
   * Detect all conflicts in a schedule
   */
  async detectConflicts(schedule: RBTSchedule): Promise<ScheduleConflict[]> {
    const conflicts: ScheduleConflict[] = [];

    // Check double bookings within the schedule
    const doubleBookings = this.detectDoubleBookings(schedule);
    conflicts.push(...doubleBookings);

    // Check travel time conflicts
    const travelConflicts = this.detectTravelConflicts(schedule);
    conflicts.push(...travelConflicts);

    // Check overlaps with existing appointments
    const appointmentConflicts = await this.detectAppointmentConflicts(schedule);
    conflicts.push(...appointmentConflicts);

    // Check authorization limits
    const authConflicts = await this.detectAuthorizationConflicts(schedule);
    conflicts.push(...authConflicts);

    return conflicts;
  }

  /**
   * Detect double bookings within a schedule
   */
  private detectDoubleBookings(schedule: RBTSchedule): ScheduleConflict[] {
    const conflicts: ScheduleConflict[] = [];
    const assignments = schedule.assignments;

    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        const a1 = assignments[i];
        const a2 = assignments[j];

        if (a1.dayOfWeek !== a2.dayOfWeek) continue;

        if (this.timesOverlap(a1.startTime, a1.endTime, a2.startTime, a2.endTime)) {
          conflicts.push({
            id: crypto.randomUUID(),
            type: 'double-booking',
            scheduleId: schedule.id,
            rbtId: schedule.rbtId,
            description: `Double booking on ${this.getDayName(a1.dayOfWeek)}: ` +
              `${this.formatTime(a1.startTime)}-${this.formatTime(a1.endTime)} overlaps with ` +
              `${this.formatTime(a2.startTime)}-${this.formatTime(a2.endTime)}`,
            conflictingAssignments: [a1, a2],
            severity: 'error',
            createdAt: Date.now(),
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Detect travel time conflicts
   */
  private detectTravelConflicts(schedule: RBTSchedule): ScheduleConflict[] {
    const conflicts: ScheduleConflict[] = [];

    // Group assignments by day
    const byDay = new Map<number, ScheduleAssignment[]>();
    for (const assignment of schedule.assignments) {
      if (!byDay.has(assignment.dayOfWeek)) {
        byDay.set(assignment.dayOfWeek, []);
      }
      byDay.get(assignment.dayOfWeek)!.push(assignment);
    }

    // Check each day for travel conflicts
    for (const [day, dayAssignments] of byDay) {
      // Sort by start time
      const sorted = dayAssignments.sort((a, b) => a.startTime - b.startTime);

      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];

        // Skip if same location
        if (current.location === next.location) continue;

        // Calculate travel time needed
        const travelTime = this.estimateTravelTime(current.location, next.location);
        const timeBetween = next.startTime - current.endTime;

        if (timeBetween < travelTime) {
          conflicts.push({
            id: crypto.randomUUID(),
            type: 'travel-time',
            scheduleId: schedule.id,
            rbtId: schedule.rbtId,
            description: `Insufficient travel time on ${this.getDayName(day)}: ` +
              `${timeBetween} minutes between appointments, ` +
              `${travelTime} minutes needed for travel`,
            conflictingAssignments: [current, next],
            severity: 'warning',
            createdAt: Date.now(),
            metadata: {
              travelTimeNeeded: travelTime,
              timeBetween,
              fromLocation: current.location,
              toLocation: next.location,
            },
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Detect conflicts with existing appointments
   */
  private async detectAppointmentConflicts(
    schedule: RBTSchedule
  ): Promise<ScheduleConflict[]> {
    const conflicts: ScheduleConflict[] = [];

    // Get appointments for the week
    const weekStart = schedule.weekStart;
    const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;

    const appointments = await this.appointmentStore.listAppointments(schedule.userId, {
      rbtId: schedule.rbtId,
      startDate: weekStart,
      endDate: weekEnd,
    });

    // Check each assignment against appointments
    for (const assignment of schedule.assignments) {
      const assignmentDate = this.getDateForDayOfWeek(weekStart, assignment.dayOfWeek);

      for (const apt of appointments) {
        // Skip if different patient (might be intentional overlap)
        if (apt.patientId === assignment.patientId) continue;

        const aptDate = new Date(apt.startTime);
        if (aptDate.getDay() !== assignment.dayOfWeek) continue;

        const aptStartMinutes = aptDate.getHours() * 60 + aptDate.getMinutes();
        const aptEndMinutes = aptStartMinutes + (apt.durationMinutes ?? 60);

        if (
          this.timesOverlap(
            assignment.startTime,
            assignment.endTime,
            aptStartMinutes,
            aptEndMinutes
          )
        ) {
          conflicts.push({
            id: crypto.randomUUID(),
            type: 'appointment-overlap',
            scheduleId: schedule.id,
            rbtId: schedule.rbtId,
            description: `Schedule conflicts with existing appointment on ${this.getDayName(assignment.dayOfWeek)}`,
            conflictingAssignments: [assignment],
            severity: 'error',
            createdAt: Date.now(),
            metadata: {
              appointmentId: apt.id,
              appointmentPatientId: apt.patientId,
            },
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Detect authorization limit conflicts
   */
  private async detectAuthorizationConflicts(
    schedule: RBTSchedule
  ): Promise<ScheduleConflict[]> {
    const conflicts: ScheduleConflict[] = [];

    // Group assignments by patient
    const byPatient = new Map<PatientId, ScheduleAssignment[]>();
    for (const assignment of schedule.assignments) {
      if (!byPatient.has(assignment.patientId)) {
        byPatient.set(assignment.patientId, []);
      }
      byPatient.get(assignment.patientId)!.push(assignment);
    }

    // Check authorization limits for each patient
    for (const [patientId, assignments] of byPatient) {
      // Get first assignment's service code for lookup
      const serviceCode = assignments[0].serviceCode;
      if (!serviceCode) continue;

      const auth = await this.authorizationStore.getAuthorizationForService(
        schedule.userId,
        patientId,
        serviceCode
      );

      if (!auth) {
        conflicts.push({
          id: crypto.randomUUID(),
          type: 'authorization-missing',
          scheduleId: schedule.id,
          rbtId: schedule.rbtId,
          description: `No active authorization found for patient ${patientId}`,
          conflictingAssignments: assignments,
          severity: 'error',
          createdAt: Date.now(),
          metadata: { patientId },
        });
        continue;
      }

      // Calculate total units for the week
      const totalUnits = assignments.reduce((sum, a) => {
        const durationHours = (a.endTime - a.startTime) / 60;
        return sum + Math.ceil(durationHours * 4); // 4 units per hour
      }, 0);

      // Check if this would exceed remaining authorization
      if (totalUnits > auth.remainingUnits) {
        conflicts.push({
          id: crypto.randomUUID(),
          type: 'authorization-exceeded',
          scheduleId: schedule.id,
          rbtId: schedule.rbtId,
          description: `Week's schedule (${totalUnits} units) would exceed authorization balance (${auth.remainingUnits} units)`,
          conflictingAssignments: assignments,
          severity: 'warning',
          createdAt: Date.now(),
          metadata: {
            patientId,
            unitsScheduled: totalUnits,
            unitsRemaining: auth.remainingUnits,
            authorizationId: auth.id,
          },
        });
      }
    }

    return conflicts;
  }

  /**
   * Suggest resolutions for a conflict
   */
  async suggestResolutions(conflict: ScheduleConflict): Promise<ResolutionSuggestion[]> {
    const suggestions: ResolutionSuggestion[] = [];

    switch (conflict.type) {
      case 'double-booking':
        suggestions.push(...this.suggestDoubleBookingResolutions(conflict));
        break;

      case 'travel-time':
        suggestions.push(...this.suggestTravelTimeResolutions(conflict));
        break;

      case 'authorization-exceeded':
        suggestions.push(...this.suggestAuthorizationResolutions(conflict));
        break;

      case 'appointment-overlap':
        suggestions.push(...this.suggestAppointmentOverlapResolutions(conflict));
        break;
    }

    return suggestions;
  }

  /**
   * Suggest resolutions for double bookings
   */
  private suggestDoubleBookingResolutions(
    conflict: ScheduleConflict
  ): ResolutionSuggestion[] {
    const assignments = conflict.conflictingAssignments ?? [];
    if (assignments.length < 2) return [];
    const [a1, a2] = assignments;
    const suggestions: ResolutionSuggestion[] = [];

    // Suggest rescheduling one assignment
    suggestions.push({
      type: 'reschedule',
      description: `Reschedule ${a2.patientId}'s session to a different time`,
      affectedAssignments: [a2.id ?? ''],
      suggestedChanges: [
        {
          assignmentId: a2.id,
          action: 'move',
          details: {
            newStartTime: a1.endTime + 15, // 15 minute buffer
            newEndTime: a1.endTime + 15 + (a2.endTime - a2.startTime),
          },
        },
      ],
      impact: 'medium',
    });

    // Suggest reassigning to different RBT
    suggestions.push({
      type: 'reassign',
      description: `Assign ${a2.patientId}'s session to a different RBT`,
      affectedAssignments: [a2.id ?? ''],
      suggestedChanges: [
        {
          assignmentId: a2.id,
          action: 'reassign',
          details: { findAvailableRbt: true },
        },
      ],
      impact: 'low',
    });

    return suggestions;
  }

  /**
   * Suggest resolutions for travel time conflicts
   */
  private suggestTravelTimeResolutions(
    conflict: ScheduleConflict
  ): ResolutionSuggestion[] {
    const assignments = conflict.conflictingAssignments ?? [];
    if (assignments.length < 2) return [];
    const [a1, a2] = assignments;
    const suggestions: ResolutionSuggestion[] = [];
    const travelTime = (conflict.metadata?.travelTimeNeeded as number) ?? this.defaultTravelTime;

    // Suggest extending break
    suggestions.push({
      type: 'reschedule',
      description: `Move second appointment later to allow for travel time`,
      affectedAssignments: [a2.id ?? ''],
      suggestedChanges: [
        {
          assignmentId: a2.id,
          action: 'move',
          details: {
            newStartTime: a1.endTime + travelTime,
            newEndTime: a1.endTime + travelTime + (a2.endTime - a2.startTime),
          },
        },
      ],
      impact: 'low',
    });

    // Suggest swapping assignment order
    suggestions.push({
      type: 'swap',
      description: `Swap order of appointments (may reduce travel)`,
      affectedAssignments: [a1.id ?? '', a2.id ?? ''],
      suggestedChanges: [
        {
          assignmentId: a1.id,
          action: 'move',
          details: { newStartTime: a2.startTime, newEndTime: a2.endTime },
        },
        {
          assignmentId: a2.id,
          action: 'move',
          details: { newStartTime: a1.startTime, newEndTime: a1.endTime },
        },
      ],
      impact: 'medium',
    });

    return suggestions;
  }

  /**
   * Suggest resolutions for authorization conflicts
   */
  private suggestAuthorizationResolutions(
    conflict: ScheduleConflict
  ): ResolutionSuggestion[] {
    const suggestions: ResolutionSuggestion[] = [];
    const unitsRemaining = conflict.metadata?.unitsRemaining as number;
    const assignments = conflict.conflictingAssignments ?? [];

    // Suggest reducing session duration
    suggestions.push({
      type: 'reschedule',
      description: `Reduce session durations to stay within authorization limit`,
      affectedAssignments: assignments.map((a) => a.id ?? ''),
      suggestedChanges: [
        {
          action: 'reduce-duration',
          details: { maxUnits: unitsRemaining },
        },
      ],
      impact: 'medium',
    });

    // Suggest canceling some sessions
    suggestions.push({
      type: 'cancel',
      description: `Cancel some sessions to stay within authorization limit`,
      affectedAssignments: assignments.slice(1).map((a) => a.id ?? ''),
      suggestedChanges: [
        {
          action: 'cancel',
          details: { reason: 'Insufficient authorization units' },
        },
      ],
      impact: 'high',
    });

    return suggestions;
  }

  /**
   * Suggest resolutions for appointment overlaps
   */
  private suggestAppointmentOverlapResolutions(
    conflict: ScheduleConflict
  ): ResolutionSuggestion[] {
    const suggestions: ResolutionSuggestion[] = [];
    const assignments = conflict.conflictingAssignments ?? [];

    suggestions.push({
      type: 'reschedule',
      description: `Reschedule the new assignment to avoid existing appointment`,
      affectedAssignments: assignments.map((a) => a.id ?? ''),
      suggestedChanges: [
        {
          action: 'find-alternate-time',
          details: {},
        },
      ],
      impact: 'medium',
    });

    return suggestions;
  }

  /**
   * Apply a resolution
   */
  async applyResolution(
    scheduleId: string,
    suggestion: ResolutionSuggestion
  ): Promise<boolean> {
    const schedule = await this.scheduleStore.getSchedule(scheduleId);
    if (!schedule) return false;

    for (const change of suggestion.suggestedChanges) {
      if (change.action === 'move' && change.assignmentId) {
        const assignment = schedule.assignments.find((a) => a.id === change.assignmentId);
        if (assignment && change.details.newStartTime && change.details.newEndTime) {
          assignment.startTime = change.details.newStartTime as number;
          assignment.endTime = change.details.newEndTime as number;
        }
      }
    }

    await this.scheduleStore.updateSchedule(scheduleId, {
      assignments: schedule.assignments,
    });

    this.emit(HEALTH_EVENTS.SCHEDULE_CONFLICT_RESOLVED, {
      scheduleId,
      resolutionType: suggestion.type,
      timestamp: Date.now(),
    });

    return true;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  private timesOverlap(
    start1: number,
    end1: number,
    start2: number,
    end2: number
  ): boolean {
    return start1 < end2 && end1 > start2;
  }

  private estimateTravelTime(from?: string, to?: string): number {
    // In a real implementation, this would use a mapping/directions API
    // For now, return default travel time
    if (!from || !to || from === to) return 0;
    return this.defaultTravelTime;
  }

  private getDayName(dayOfWeek: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek] ?? `Day ${dayOfWeek}`;
  }

  private formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
  }

  private getDateForDayOfWeek(weekStart: number, dayOfWeek: number): number {
    const date = new Date(weekStart);
    const startDay = date.getDay();
    const diff = dayOfWeek - startDay;
    date.setDate(date.getDate() + diff);
    return date.getTime();
  }
}
