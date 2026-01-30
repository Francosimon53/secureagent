/**
 * Scheduling Service
 *
 * Unified service for RBT schedule coordination including:
 * - RBT profile management
 * - Availability management
 * - Schedule creation and optimization
 * - Conflict detection and resolution
 */

import { EventEmitter } from 'events';
import type { ScheduleStore } from '../../stores/schedule-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type { AppointmentStore } from '../../stores/appointment-store.js';
import type { AuthorizationStore } from '../../stores/authorization-store.js';
import type {
  RBTProfile,
  RBTProfileId,
  RBTSchedule,
  ScheduleId,
  ScheduleAssignment,
  AvailabilitySlot,
  ScheduleConflict,
  ScheduleQueryOptions,
} from '../../types.js';
import { HEALTH_EVENTS } from '../../constants.js';
import { AvailabilityManager, type AvailabilityBlock, type TimeOffRequest } from './availability-manager.js';
import { ConflictResolver, type ResolutionSuggestion } from './conflict-resolver.js';
import {
  OptimizationEngine,
  type OptimizationRequest,
  type OptimizationResult,
} from './optimization-engine.js';

// =============================================================================
// Scheduling Service Options
// =============================================================================

export interface SchedulingServiceOptions {
  scheduleStore: ScheduleStore;
  patientStore: PatientStore;
  appointmentStore: AppointmentStore;
  authorizationStore: AuthorizationStore;
  defaultTravelTimeMinutes?: number;
}

// =============================================================================
// Scheduling Service
// =============================================================================

export class SchedulingService extends EventEmitter {
  private readonly scheduleStore: ScheduleStore;
  private readonly patientStore: PatientStore;
  private readonly availabilityManager: AvailabilityManager;
  private readonly conflictResolver: ConflictResolver;
  private readonly optimizationEngine: OptimizationEngine;

  constructor(options: SchedulingServiceOptions) {
    super();

    this.scheduleStore = options.scheduleStore;
    this.patientStore = options.patientStore;

    // Initialize sub-services
    this.availabilityManager = new AvailabilityManager({
      scheduleStore: options.scheduleStore,
    });

    this.conflictResolver = new ConflictResolver({
      scheduleStore: options.scheduleStore,
      appointmentStore: options.appointmentStore,
      authorizationStore: options.authorizationStore,
      defaultTravelTimeMinutes: options.defaultTravelTimeMinutes,
    });

    this.optimizationEngine = new OptimizationEngine({
      scheduleStore: options.scheduleStore,
      patientStore: options.patientStore,
      authorizationStore: options.authorizationStore,
      availabilityManager: this.availabilityManager,
      conflictResolver: this.conflictResolver,
    });

    // Forward events
    this.availabilityManager.on(HEALTH_EVENTS.SCHEDULE_AVAILABILITY_UPDATED, (data) =>
      this.emit(HEALTH_EVENTS.SCHEDULE_AVAILABILITY_UPDATED, data)
    );
    this.conflictResolver.on(HEALTH_EVENTS.SCHEDULE_CONFLICT_RESOLVED, (data) =>
      this.emit(HEALTH_EVENTS.SCHEDULE_CONFLICT_RESOLVED, data)
    );
    this.optimizationEngine.on(HEALTH_EVENTS.SCHEDULE_OPTIMIZED, (data) =>
      this.emit(HEALTH_EVENTS.SCHEDULE_OPTIMIZED, data)
    );
  }

  // ===========================================================================
  // RBT Profile Management
  // ===========================================================================

  /**
   * Create an RBT profile
   */
  async createRBTProfile(
    profile: Omit<RBTProfile, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<RBTProfile> {
    const newProfile = await this.scheduleStore.createRBTProfile(profile);

    this.emit(HEALTH_EVENTS.RBT_PROFILE_CREATED, {
      rbtId: newProfile.id,
      timestamp: Date.now(),
    });

    return newProfile;
  }

  /**
   * Get RBT profile by ID
   */
  async getRBTProfile(id: RBTProfileId): Promise<RBTProfile | null> {
    return this.scheduleStore.getRBTProfile(id);
  }

  /**
   * Update RBT profile
   */
  async updateRBTProfile(
    id: RBTProfileId,
    updates: Partial<RBTProfile>
  ): Promise<RBTProfile | null> {
    return this.scheduleStore.updateRBTProfile(id, updates);
  }

  /**
   * Delete RBT profile
   */
  async deleteRBTProfile(id: RBTProfileId): Promise<boolean> {
    return this.scheduleStore.deleteRBTProfile(id);
  }

  /**
   * List RBT profiles
   */
  async listRBTProfiles(userId: string): Promise<RBTProfile[]> {
    return this.scheduleStore.listRBTProfiles(userId);
  }

  /**
   * Get active RBTs
   */
  async getActiveRBTs(userId: string): Promise<RBTProfile[]> {
    return this.scheduleStore.getActiveRBTs(userId);
  }

  /**
   * Get RBTs by skill
   */
  async getRBTsBySkill(userId: string, skill: string): Promise<RBTProfile[]> {
    return this.scheduleStore.getRBTsBySkill(userId, skill);
  }

  /**
   * Get RBTs by location
   */
  async getRBTsByLocation(userId: string, location: string): Promise<RBTProfile[]> {
    return this.scheduleStore.getRBTsByLocation(userId, location);
  }

  // ===========================================================================
  // Availability Management
  // ===========================================================================

  /**
   * Set RBT availability
   */
  async setAvailability(rbtId: RBTProfileId, slots: AvailabilitySlot[]): Promise<void> {
    return this.availabilityManager.setAvailability(rbtId, slots);
  }

  /**
   * Get RBT availability
   */
  async getAvailability(rbtId: RBTProfileId): Promise<AvailabilitySlot[]> {
    return this.availabilityManager.getAvailability(rbtId);
  }

  /**
   * Get availability blocks for a date range
   */
  async getAvailabilityBlocks(
    userId: string,
    rbtId: RBTProfileId,
    startDate: number,
    endDate: number
  ): Promise<AvailabilityBlock[]> {
    return this.availabilityManager.getAvailabilityBlocks(userId, rbtId, startDate, endDate);
  }

  /**
   * Check if RBT is available
   */
  async isAvailable(
    rbtId: RBTProfileId,
    date: number,
    startTime: number,
    endTime: number
  ): Promise<boolean> {
    return this.availabilityManager.isAvailable(rbtId, date, startTime, endTime);
  }

  /**
   * Get available RBTs for a time slot
   */
  async getAvailableRBTs(
    userId: string,
    date: number,
    startTime: number,
    endTime: number
  ): Promise<RBTProfile[]> {
    return this.availabilityManager.getAvailableRBTs(userId, date, startTime, endTime);
  }

  // ===========================================================================
  // Time-Off Management
  // ===========================================================================

  /**
   * Request time off
   */
  async requestTimeOff(
    rbtId: RBTProfileId,
    startDate: number,
    endDate: number,
    reason: string
  ): Promise<TimeOffRequest> {
    return this.availabilityManager.requestTimeOff(rbtId, startDate, endDate, reason);
  }

  /**
   * Approve time-off request
   */
  async approveTimeOff(requestId: string, approvedBy: string): Promise<TimeOffRequest | null> {
    return this.availabilityManager.approveTimeOff(requestId, approvedBy);
  }

  /**
   * Deny time-off request
   */
  async denyTimeOff(requestId: string, deniedBy: string): Promise<TimeOffRequest | null> {
    return this.availabilityManager.denyTimeOff(requestId, deniedBy);
  }

  /**
   * Add time-off directly
   */
  async addTimeOff(
    rbtId: RBTProfileId,
    startDate: number,
    endDate: number,
    reason: string
  ): Promise<void> {
    return this.availabilityManager.addTimeOff(rbtId, startDate, endDate, reason);
  }

  /**
   * Get pending time-off requests
   */
  getPendingTimeOffRequests(): TimeOffRequest[] {
    return this.availabilityManager.getPendingTimeOffRequests();
  }

  // ===========================================================================
  // Schedule Management
  // ===========================================================================

  /**
   * Create a schedule
   */
  async createSchedule(
    schedule: Omit<RBTSchedule, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<RBTSchedule> {
    const newSchedule = await this.scheduleStore.createSchedule(schedule);

    this.emit(HEALTH_EVENTS.SCHEDULE_CREATED, {
      scheduleId: newSchedule.id,
      rbtId: newSchedule.rbtId,
      weekStart: newSchedule.weekStart,
      timestamp: Date.now(),
    });

    return newSchedule;
  }

  /**
   * Get schedule by ID
   */
  async getSchedule(id: ScheduleId): Promise<RBTSchedule | null> {
    return this.scheduleStore.getSchedule(id);
  }

  /**
   * Update schedule
   */
  async updateSchedule(
    id: ScheduleId,
    updates: Partial<RBTSchedule>
  ): Promise<RBTSchedule | null> {
    const updated = await this.scheduleStore.updateSchedule(id, updates);

    if (updated) {
      this.emit(HEALTH_EVENTS.SCHEDULE_UPDATED, {
        scheduleId: id,
        updates: Object.keys(updates),
        timestamp: Date.now(),
      });
    }

    return updated;
  }

  /**
   * Delete schedule
   */
  async deleteSchedule(id: ScheduleId): Promise<boolean> {
    return this.scheduleStore.deleteSchedule(id);
  }

  /**
   * List schedules
   */
  async listSchedules(userId: string, options?: ScheduleQueryOptions): Promise<RBTSchedule[]> {
    return this.scheduleStore.listSchedules(userId, options);
  }

  /**
   * Get schedule for a specific RBT and week
   */
  async getScheduleByRBT(
    userId: string,
    rbtId: RBTProfileId,
    weekStart: number
  ): Promise<RBTSchedule | null> {
    return this.scheduleStore.getScheduleByRBT(userId, rbtId, weekStart);
  }

  /**
   * Get all schedules for a week
   */
  async getSchedulesByWeek(userId: string, weekStart: number): Promise<RBTSchedule[]> {
    return this.scheduleStore.getSchedulesByWeek(userId, weekStart);
  }

  /**
   * Add assignment to schedule
   */
  async addAssignment(
    scheduleId: ScheduleId,
    assignment: Omit<ScheduleAssignment, 'id'>
  ): Promise<RBTSchedule | null> {
    const schedule = await this.scheduleStore.getSchedule(scheduleId);
    if (!schedule) return null;

    const newAssignment: ScheduleAssignment = {
      ...assignment,
      id: crypto.randomUUID(),
    };

    schedule.assignments.push(newAssignment);
    return this.scheduleStore.updateSchedule(scheduleId, {
      assignments: schedule.assignments,
    });
  }

  /**
   * Remove assignment from schedule
   */
  async removeAssignment(
    scheduleId: ScheduleId,
    assignmentId: string
  ): Promise<RBTSchedule | null> {
    const schedule = await this.scheduleStore.getSchedule(scheduleId);
    if (!schedule) return null;

    schedule.assignments = schedule.assignments.filter((a) => a.id !== assignmentId);
    return this.scheduleStore.updateSchedule(scheduleId, {
      assignments: schedule.assignments,
    });
  }

  /**
   * Publish schedule (finalize)
   */
  async publishSchedule(scheduleId: ScheduleId): Promise<RBTSchedule | null> {
    const schedule = await this.scheduleStore.getSchedule(scheduleId);
    if (!schedule) return null;

    // Check for conflicts before publishing
    const conflicts = await this.conflictResolver.detectConflicts(schedule);
    const errorConflicts = conflicts.filter((c) => c.severity === 'error');

    if (errorConflicts.length > 0) {
      throw new Error(
        `Cannot publish schedule with ${errorConflicts.length} error(s): ` +
          errorConflicts.map((c) => c.description).join('; ')
      );
    }

    const updated = await this.scheduleStore.updateSchedule(scheduleId, {
      status: 'published',
    });

    if (updated) {
      this.emit(HEALTH_EVENTS.SCHEDULE_PUBLISHED, {
        scheduleId,
        rbtId: schedule.rbtId,
        timestamp: Date.now(),
      });
    }

    return updated;
  }

  // ===========================================================================
  // Conflict Management
  // ===========================================================================

  /**
   * Detect conflicts in a schedule
   */
  async detectConflicts(schedule: RBTSchedule): Promise<ScheduleConflict[]> {
    return this.conflictResolver.detectConflicts(schedule);
  }

  /**
   * Suggest resolutions for a conflict
   */
  async suggestResolutions(conflict: ScheduleConflict): Promise<ResolutionSuggestion[]> {
    return this.conflictResolver.suggestResolutions(conflict);
  }

  /**
   * Apply a resolution
   */
  async applyResolution(
    scheduleId: string,
    suggestion: ResolutionSuggestion
  ): Promise<boolean> {
    return this.conflictResolver.applyResolution(scheduleId, suggestion);
  }

  // ===========================================================================
  // Optimization
  // ===========================================================================

  /**
   * Optimize schedules for a week
   */
  async optimizeSchedules(request: OptimizationRequest): Promise<OptimizationResult> {
    return this.optimizationEngine.optimize(request);
  }

  /**
   * Save optimized schedules
   */
  async saveOptimizedSchedules(
    result: OptimizationResult,
    replace = false
  ): Promise<RBTSchedule[]> {
    const saved: RBTSchedule[] = [];

    for (const schedule of result.schedules) {
      if (replace) {
        // Delete existing schedule for this RBT/week
        const existing = await this.scheduleStore.getScheduleByRBT(
          schedule.userId,
          schedule.rbtId,
          schedule.weekStart
        );
        if (existing) {
          await this.scheduleStore.deleteSchedule(existing.id);
        }
      }

      const created = await this.scheduleStore.createSchedule({
        userId: schedule.userId,
        rbtId: schedule.rbtId,
        weekStart: schedule.weekStart,
        weekEnd: schedule.weekEnd,
        appointments: schedule.appointments ?? [],
        assignments: schedule.assignments,
        scheduledHours: schedule.scheduledHours ?? 0,
        availableHours: schedule.availableHours ?? 0,
        utilizationPercent: schedule.utilizationPercent ?? 0,
        conflicts: schedule.conflicts ?? [],
        status: 'draft',
        lastModified: Date.now(),
      });

      saved.push(created);
    }

    return saved;
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Get scheduling statistics
   */
  async getSchedulingStats(userId: string, weekStart: number): Promise<{
    totalRBTs: number;
    scheduledRBTs: number;
    totalAssignments: number;
    totalHours: number;
    conflictCount: number;
    utilizationPercent: number;
  }> {
    const rbts = await this.scheduleStore.getActiveRBTs(userId);
    const schedules = await this.scheduleStore.getSchedulesByWeek(userId, weekStart);

    let totalAssignments = 0;
    let totalMinutes = 0;
    let conflictCount = 0;

    for (const schedule of schedules) {
      totalAssignments += schedule.assignments.length;

      for (const assignment of schedule.assignments) {
        totalMinutes += assignment.endTime - assignment.startTime;
      }

      const conflicts = await this.conflictResolver.detectConflicts(schedule);
      conflictCount += conflicts.length;
    }

    const totalHours = totalMinutes / 60;
    const maxPossibleHours = rbts.length * 40; // 40 hours per week per RBT
    const utilizationPercent = maxPossibleHours > 0 ? (totalHours / maxPossibleHours) * 100 : 0;

    return {
      totalRBTs: rbts.length,
      scheduledRBTs: schedules.length,
      totalAssignments,
      totalHours,
      conflictCount,
      utilizationPercent,
    };
  }

  /**
   * Get week start date (Sunday) for a given date
   */
  static getWeekStart(date: Date | number): number {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
}

// Re-export sub-components
export { AvailabilityManager, type AvailabilityBlock, type TimeOffRequest } from './availability-manager.js';
export { ConflictResolver, type ResolutionSuggestion } from './conflict-resolver.js';
export {
  OptimizationEngine,
  type OptimizationRequest,
  type OptimizationResult,
  type OptimizationMetrics,
} from './optimization-engine.js';
