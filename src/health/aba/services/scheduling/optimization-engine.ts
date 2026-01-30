/**
 * Optimization Engine
 *
 * Optimizes RBT schedules for:
 * - Minimizing travel time
 * - Maximizing utilization
 * - Balancing workload
 * - Meeting patient preferences
 */

import { EventEmitter } from 'events';
import type { ScheduleStore } from '../../stores/schedule-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type { AuthorizationStore } from '../../stores/authorization-store.js';
import type {
  RBTSchedule,
  RBTProfile,
  RBTProfileId,
  ScheduleAssignment,
  PatientId,
  Patient,
} from '../../types.js';
import type { AvailabilityManager } from './availability-manager.js';
import type { ConflictResolver } from './conflict-resolver.js';
import { HEALTH_EVENTS } from '../../constants.js';

// =============================================================================
// Optimization Engine Options
// =============================================================================

export interface OptimizationEngineOptions {
  scheduleStore: ScheduleStore;
  patientStore: PatientStore;
  authorizationStore: AuthorizationStore;
  availabilityManager: AvailabilityManager;
  conflictResolver: ConflictResolver;
}

// =============================================================================
// Optimization Request
// =============================================================================

export interface OptimizationRequest {
  userId: string;
  weekStart: number;
  constraints?: OptimizationConstraints;
  priorities?: OptimizationPriorities;
}

export interface OptimizationConstraints {
  maxHoursPerDay?: number;
  maxHoursPerWeek?: number;
  minBreakMinutes?: number;
  preferredLocations?: string[];
  excludeRBTs?: RBTProfileId[];
  patientPreferences?: Map<PatientId, PatientSchedulePreference>;
}

export interface PatientSchedulePreference {
  preferredRbts?: RBTProfileId[];
  preferredDays?: number[];
  preferredTimeStart?: number;
  preferredTimeEnd?: number;
  sessionsPerWeek: number;
  sessionDurationMinutes: number;
}

export interface OptimizationPriorities {
  minimizeTravelTime?: number; // 0-1 weight
  maximizeUtilization?: number;
  balanceWorkload?: number;
  respectPreferences?: number;
}

// =============================================================================
// Optimization Result
// =============================================================================

export interface OptimizationResult {
  success: boolean;
  schedules: RBTSchedule[];
  metrics: OptimizationMetrics;
  unassignedPatients: PatientId[];
  warnings: string[];
}

export interface OptimizationMetrics {
  totalSessions: number;
  totalHours: number;
  averageTravelTime: number;
  utilizationPercent: number;
  preferencesMetPercent: number;
  workloadVariance: number;
}

// =============================================================================
// Optimization Engine
// =============================================================================

export class OptimizationEngine extends EventEmitter {
  private readonly scheduleStore: ScheduleStore;
  private readonly patientStore: PatientStore;
  private readonly authorizationStore: AuthorizationStore;
  private readonly availabilityManager: AvailabilityManager;
  private readonly conflictResolver: ConflictResolver;

  constructor(options: OptimizationEngineOptions) {
    super();
    this.scheduleStore = options.scheduleStore;
    this.patientStore = options.patientStore;
    this.authorizationStore = options.authorizationStore;
    this.availabilityManager = options.availabilityManager;
    this.conflictResolver = options.conflictResolver;
  }

  /**
   * Optimize schedules for a week
   */
  async optimize(request: OptimizationRequest): Promise<OptimizationResult> {
    const { userId, weekStart, constraints, priorities } = request;

    // Get active RBTs
    let rbts = await this.scheduleStore.getActiveRBTs(userId);
    if (constraints?.excludeRBTs) {
      rbts = rbts.filter((r) => !constraints.excludeRBTs?.includes(r.id));
    }

    // Get patients needing scheduling
    const patients = await this.getPatientsNeedingScheduling(userId, weekStart);

    // Build patient preferences map
    const patientPrefs = constraints?.patientPreferences ?? new Map();
    for (const patient of patients) {
      if (!patientPrefs.has(patient.id)) {
        patientPrefs.set(patient.id, await this.getDefaultPreferences(userId, patient));
      }
    }

    // Initialize empty schedules for each RBT
    const schedules = new Map<RBTProfileId, RBTSchedule>();
    const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
    for (const rbt of rbts) {
      schedules.set(rbt.id, {
        id: crypto.randomUUID(),
        userId,
        rbtId: rbt.id,
        weekStart,
        weekEnd,
        appointments: [],
        assignments: [],
        scheduledHours: 0,
        availableHours: rbt.maxHoursPerWeek,
        utilizationPercent: 0,
        conflicts: [],
        status: 'draft',
        lastModified: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    // Sort patients by priority (those with preferred RBTs first)
    const sortedPatients = this.sortPatientsByPriority(patients, patientPrefs);

    // Assign patients to RBTs
    const unassignedPatients: PatientId[] = [];
    const warnings: string[] = [];

    for (const patient of sortedPatients) {
      const prefs = patientPrefs.get(patient.id)!;
      const assigned = await this.assignPatient(
        patient,
        prefs,
        rbts,
        schedules,
        weekStart,
        constraints,
        priorities
      );

      if (!assigned) {
        unassignedPatients.push(patient.id);
        warnings.push(`Could not fully schedule patient ${patient.firstName} ${patient.lastName}`);
      }
    }

    // Optimize travel routes
    if (priorities?.minimizeTravelTime) {
      this.optimizeTravelRoutes(schedules, priorities.minimizeTravelTime);
    }

    // Balance workload
    if (priorities?.balanceWorkload) {
      this.balanceWorkload(schedules, rbts, priorities.balanceWorkload);
    }

    // Validate all schedules
    for (const [rbtId, schedule] of schedules) {
      const conflicts = await this.conflictResolver.detectConflicts(schedule);
      if (conflicts.length > 0) {
        for (const conflict of conflicts) {
          warnings.push(`${conflict.type}: ${conflict.description}`);
        }
      }
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(schedules, rbts, patientPrefs);

    const result: OptimizationResult = {
      success: unassignedPatients.length === 0,
      schedules: Array.from(schedules.values()),
      metrics,
      unassignedPatients,
      warnings,
    };

    this.emit(HEALTH_EVENTS.SCHEDULE_OPTIMIZED, {
      userId,
      weekStart,
      success: result.success,
      metrics,
      timestamp: Date.now(),
    });

    return result;
  }

  /**
   * Get patients who need scheduling
   */
  private async getPatientsNeedingScheduling(
    userId: string,
    weekStart: number
  ): Promise<Patient[]> {
    // Get patients with active authorizations
    const authorizations = await this.authorizationStore.getActiveAuthorizations(userId);
    const patientIds = [...new Set(authorizations.map((a) => a.patientId))];

    const patients: Patient[] = [];
    for (const patientId of patientIds) {
      const patient = await this.patientStore.getPatient(patientId);
      if (patient && patient.status === 'active') {
        patients.push(patient);
      }
    }

    return patients;
  }

  /**
   * Get default preferences for a patient
   */
  private async getDefaultPreferences(
    userId: string,
    patient: Patient
  ): Promise<PatientSchedulePreference> {
    // Look up patient's treatment hours from authorization
    const auth = await this.authorizationStore.getActiveAuthorizations(userId, patient.id);
    const primaryAuth = auth[0];

    // Calculate sessions per week based on authorization
    let sessionsPerWeek = 3; // Default
    const sessionDurationMinutes = 120; // Default 2 hours

    if (primaryAuth) {
      // Estimate based on total units and authorization period
      const periodDays = (primaryAuth.endDate - primaryAuth.startDate) / (24 * 60 * 60 * 1000);
      const weeksRemaining = Math.max(1, periodDays / 7);
      const unitsPerWeek = primaryAuth.totalUnits / weeksRemaining;
      // Assuming 4 units per hour
      const hoursPerWeek = unitsPerWeek / 4;
      sessionsPerWeek = Math.round(hoursPerWeek / 2); // 2 hour sessions
    }

    return {
      preferredRbts: patient.assignedRbt ? [patient.assignedRbt as RBTProfileId] : undefined,
      preferredDays: [1, 2, 3, 4, 5], // Weekdays by default
      preferredTimeStart: 9 * 60, // 9 AM
      preferredTimeEnd: 17 * 60, // 5 PM
      sessionsPerWeek,
      sessionDurationMinutes,
    };
  }

  /**
   * Sort patients by scheduling priority
   */
  private sortPatientsByPriority(
    patients: Patient[],
    preferences: Map<PatientId, PatientSchedulePreference>
  ): Patient[] {
    return patients.sort((a, b) => {
      const prefsA = preferences.get(a.id);
      const prefsB = preferences.get(b.id);

      // Patients with preferred RBTs go first (more constrained)
      if (prefsA?.preferredRbts?.length && !prefsB?.preferredRbts?.length) return -1;
      if (!prefsA?.preferredRbts?.length && prefsB?.preferredRbts?.length) return 1;

      // Then by number of sessions needed (more sessions = higher priority)
      const sessionsA = prefsA?.sessionsPerWeek ?? 0;
      const sessionsB = prefsB?.sessionsPerWeek ?? 0;
      return sessionsB - sessionsA;
    });
  }

  /**
   * Assign a patient to RBT schedules
   */
  private async assignPatient(
    patient: Patient,
    prefs: PatientSchedulePreference,
    rbts: RBTProfile[],
    schedules: Map<RBTProfileId, RBTSchedule>,
    weekStart: number,
    constraints?: OptimizationConstraints,
    priorities?: OptimizationPriorities
  ): Promise<boolean> {
    let sessionsAssigned = 0;
    const sessionsNeeded = prefs.sessionsPerWeek;

    // Get available days
    const availableDays = prefs.preferredDays ?? [1, 2, 3, 4, 5];

    // Get preferred RBTs or all RBTs
    let candidateRbts = prefs.preferredRbts
      ? rbts.filter((r) => prefs.preferredRbts?.includes(r.id))
      : rbts;

    // If no preferred RBTs available, try all
    if (candidateRbts.length === 0) {
      candidateRbts = rbts;
    }

    // Try to schedule sessions
    for (const dayOfWeek of availableDays) {
      if (sessionsAssigned >= sessionsNeeded) break;

      for (const rbt of candidateRbts) {
        if (sessionsAssigned >= sessionsNeeded) break;

        const schedule = schedules.get(rbt.id)!;
        const date = this.getDateForDayOfWeek(weekStart, dayOfWeek);

        // Check RBT availability
        const isAvailable = await this.availabilityManager.isAvailable(
          rbt.id,
          date,
          prefs.preferredTimeStart ?? 9 * 60,
          (prefs.preferredTimeStart ?? 9 * 60) + prefs.sessionDurationMinutes
        );

        if (!isAvailable) continue;

        // Check if slot is free in schedule
        const slotFree = this.isSlotFree(
          schedule,
          dayOfWeek,
          prefs.preferredTimeStart ?? 9 * 60,
          prefs.sessionDurationMinutes
        );

        if (!slotFree) continue;

        // Check workload constraints
        if (constraints?.maxHoursPerDay) {
          const dayHours = this.getDayHours(schedule, dayOfWeek);
          if (dayHours + prefs.sessionDurationMinutes / 60 > constraints.maxHoursPerDay) {
            continue;
          }
        }

        // Add assignment
        const assignment: ScheduleAssignment = {
          id: crypto.randomUUID(),
          patientId: patient.id,
          dayOfWeek: dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6,
          startTime: prefs.preferredTimeStart ?? 9 * 60,
          endTime: (prefs.preferredTimeStart ?? 9 * 60) + prefs.sessionDurationMinutes,
          serviceCode: '97153', // Default ABA service code
          location: patient.address?.city,
        };

        schedule.assignments.push(assignment);
        sessionsAssigned++;
      }
    }

    return sessionsAssigned >= sessionsNeeded;
  }

  /**
   * Check if a time slot is free in a schedule
   */
  private isSlotFree(
    schedule: RBTSchedule,
    dayOfWeek: number,
    startTime: number,
    duration: number
  ): boolean {
    const endTime = startTime + duration;

    for (const assignment of schedule.assignments) {
      if (assignment.dayOfWeek !== dayOfWeek) continue;

      // Check for overlap
      if (startTime < assignment.endTime && endTime > assignment.startTime) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get total hours scheduled for a day
   */
  private getDayHours(schedule: RBTSchedule, dayOfWeek: number): number {
    let totalMinutes = 0;

    for (const assignment of schedule.assignments) {
      if (assignment.dayOfWeek === dayOfWeek) {
        totalMinutes += assignment.endTime - assignment.startTime;
      }
    }

    return totalMinutes / 60;
  }

  /**
   * Optimize travel routes within each schedule
   */
  private optimizeTravelRoutes(
    schedules: Map<RBTProfileId, RBTSchedule>,
    weight: number
  ): void {
    for (const schedule of schedules.values()) {
      // Group by day
      const byDay = new Map<number, ScheduleAssignment[]>();
      for (const assignment of schedule.assignments) {
        if (!byDay.has(assignment.dayOfWeek)) {
          byDay.set(assignment.dayOfWeek, []);
        }
        byDay.get(assignment.dayOfWeek)!.push(assignment);
      }

      // Optimize each day's route
      for (const [day, assignments] of byDay) {
        if (assignments.length < 2) continue;

        // Simple nearest-neighbor optimization
        const optimized = this.nearestNeighborRoute(assignments);

        // Reorder assignments in schedule
        let currentTime = Math.min(...assignments.map((a) => a.startTime));
        for (const assignment of optimized) {
          const duration = assignment.endTime - assignment.startTime;
          assignment.startTime = currentTime;
          assignment.endTime = currentTime + duration;
          currentTime = assignment.endTime + 15; // 15 min buffer
        }
      }
    }
  }

  /**
   * Nearest-neighbor route optimization
   */
  private nearestNeighborRoute(assignments: ScheduleAssignment[]): ScheduleAssignment[] {
    if (assignments.length <= 1) return assignments;

    const optimized: ScheduleAssignment[] = [];
    const remaining = [...assignments];

    // Start with earliest assignment
    remaining.sort((a, b) => a.startTime - b.startTime);
    let current = remaining.shift()!;
    optimized.push(current);

    while (remaining.length > 0) {
      // Find nearest location
      let nearestIdx = 0;
      let nearestDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const dist = this.estimateDistance(current.location, remaining[i].location);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }

      current = remaining.splice(nearestIdx, 1)[0];
      optimized.push(current);
    }

    return optimized;
  }

  /**
   * Estimate distance between locations
   */
  private estimateDistance(from?: string, to?: string): number {
    if (!from || !to || from === to) return 0;
    // Simplified - in reality would use geocoding/mapping
    return 1;
  }

  /**
   * Balance workload across RBTs
   */
  private balanceWorkload(
    schedules: Map<RBTProfileId, RBTSchedule>,
    rbts: RBTProfile[],
    weight: number
  ): void {
    // Calculate current hours per RBT
    const hoursPerRbt = new Map<RBTProfileId, number>();
    for (const [rbtId, schedule] of schedules) {
      let totalMinutes = 0;
      for (const assignment of schedule.assignments) {
        totalMinutes += assignment.endTime - assignment.startTime;
      }
      hoursPerRbt.set(rbtId, totalMinutes / 60);
    }

    // Calculate target hours
    const totalHours = Array.from(hoursPerRbt.values()).reduce((a, b) => a + b, 0);
    const targetHours = totalHours / rbts.length;

    // Try to move assignments from overloaded to underloaded RBTs
    // (Simplified implementation - full version would use more sophisticated balancing)
    const sortedRbts = Array.from(hoursPerRbt.entries()).sort((a, b) => b[1] - a[1]);

    for (const [overloadedId, hours] of sortedRbts) {
      if (hours <= targetHours * 1.1) break; // Within 10% of target

      const overloadedSchedule = schedules.get(overloadedId)!;
      const excessHours = hours - targetHours;

      // Find underloaded RBT
      for (const [underloadedId, underHours] of sortedRbts.slice().reverse()) {
        if (underHours >= targetHours * 0.9) continue;
        if (overloadedId === underloadedId) continue;

        // Try to move one assignment
        const underloadedSchedule = schedules.get(underloadedId)!;

        for (let i = overloadedSchedule.assignments.length - 1; i >= 0; i--) {
          const assignment = overloadedSchedule.assignments[i];
          const duration = (assignment.endTime - assignment.startTime) / 60;

          // Check if underloaded RBT has availability
          const slotFree = this.isSlotFree(
            underloadedSchedule,
            assignment.dayOfWeek,
            assignment.startTime,
            assignment.endTime - assignment.startTime
          );

          if (slotFree) {
            // Move assignment
            overloadedSchedule.assignments.splice(i, 1);
            underloadedSchedule.assignments.push(assignment);

            // Update hours
            hoursPerRbt.set(overloadedId, (hoursPerRbt.get(overloadedId) ?? 0) - duration);
            hoursPerRbt.set(underloadedId, (hoursPerRbt.get(underloadedId) ?? 0) + duration);

            break;
          }
        }
      }
    }
  }

  /**
   * Calculate optimization metrics
   */
  private calculateMetrics(
    schedules: Map<RBTProfileId, RBTSchedule>,
    rbts: RBTProfile[],
    preferences: Map<PatientId, PatientSchedulePreference>
  ): OptimizationMetrics {
    let totalSessions = 0;
    let totalMinutes = 0;
    const totalTravelTime = 0;
    let preferencesMetCount = 0;
    let preferencesTotalCount = 0;
    const hoursPerRbt: number[] = [];

    for (const [rbtId, schedule] of schedules) {
      let rbtMinutes = 0;

      for (const assignment of schedule.assignments) {
        totalSessions++;
        const duration = assignment.endTime - assignment.startTime;
        totalMinutes += duration;
        rbtMinutes += duration;

        // Check if preference met
        const prefs = preferences.get(assignment.patientId);
        if (prefs) {
          preferencesTotalCount++;
          if (prefs.preferredRbts?.includes(rbtId)) {
            preferencesMetCount++;
          }
        }
      }

      hoursPerRbt.push(rbtMinutes / 60);
    }

    const totalHours = totalMinutes / 60;
    const maxPossibleHours = rbts.length * 40; // Assuming 40 hour weeks
    const utilizationPercent = (totalHours / maxPossibleHours) * 100;

    const avgHours = totalHours / rbts.length;
    const workloadVariance =
      hoursPerRbt.reduce((sum, h) => sum + Math.pow(h - avgHours, 2), 0) / rbts.length;

    return {
      totalSessions,
      totalHours,
      averageTravelTime: totalTravelTime / Math.max(1, totalSessions),
      utilizationPercent,
      preferencesMetPercent:
        preferencesTotalCount > 0 ? (preferencesMetCount / preferencesTotalCount) * 100 : 100,
      workloadVariance,
    };
  }

  private getDateForDayOfWeek(weekStart: number, dayOfWeek: number): number {
    const date = new Date(weekStart);
    const startDay = date.getDay();
    const diff = dayOfWeek - startDay;
    date.setDate(date.getDate() + diff);
    return date.getTime();
  }
}
