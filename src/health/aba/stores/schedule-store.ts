/**
 * Schedule Store
 *
 * Storage for RBT schedules, availability, and schedule conflicts.
 */

import type {
  RBTProfile,
  RBTProfileId,
  RBTSchedule,
  ScheduleId,
  AvailabilitySlot,
  ScheduleConflict,
  ScheduleQueryOptions,
  KeyValueStoreAdapter,
} from '../types.js';

// =============================================================================
// Schedule Store Interface
// =============================================================================

export interface ScheduleStore {
  // RBT Profile Operations
  createRBTProfile(profile: Omit<RBTProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<RBTProfile>;
  getRBTProfile(id: RBTProfileId): Promise<RBTProfile | null>;
  updateRBTProfile(id: RBTProfileId, updates: Partial<RBTProfile>): Promise<RBTProfile | null>;
  deleteRBTProfile(id: RBTProfileId): Promise<boolean>;
  listRBTProfiles(userId: string): Promise<RBTProfile[]>;

  // RBT queries
  getActiveRBTs(userId: string): Promise<RBTProfile[]>;
  getRBTsBySkill(userId: string, skill: string): Promise<RBTProfile[]>;
  getRBTsByLocation(userId: string, location: string): Promise<RBTProfile[]>;

  // Schedule Operations
  createSchedule(schedule: Omit<RBTSchedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<RBTSchedule>;
  getSchedule(id: ScheduleId): Promise<RBTSchedule | null>;
  updateSchedule(id: ScheduleId, updates: Partial<RBTSchedule>): Promise<RBTSchedule | null>;
  deleteSchedule(id: ScheduleId): Promise<boolean>;
  listSchedules(userId: string, options?: ScheduleQueryOptions): Promise<RBTSchedule[]>;

  // Schedule queries
  getScheduleByRBT(userId: string, rbtId: RBTProfileId, weekStart: number): Promise<RBTSchedule | null>;
  getSchedulesByWeek(userId: string, weekStart: number): Promise<RBTSchedule[]>;
  getRBTScheduleRange(userId: string, rbtId: RBTProfileId, startDate: number, endDate: number): Promise<RBTSchedule[]>;

  // Availability Operations
  setAvailability(rbtId: RBTProfileId, slots: AvailabilitySlot[]): Promise<void>;
  getAvailability(rbtId: RBTProfileId): Promise<AvailabilitySlot[]>;
  getAvailabilityForDay(rbtId: RBTProfileId, dayOfWeek: number): Promise<AvailabilitySlot[]>;
  getAvailableRBTs(userId: string, date: number, startTime: number, endTime: number): Promise<RBTProfile[]>;

  // Time-off Operations
  addTimeOff(rbtId: RBTProfileId, startDate: number, endDate: number, reason: string): Promise<void>;
  removeTimeOff(rbtId: RBTProfileId, startDate: number): Promise<boolean>;
  getTimeOff(rbtId: RBTProfileId, startDate?: number, endDate?: number): Promise<Array<{
    startDate: number;
    endDate: number;
    reason: string;
  }>>;

  // Conflict Operations
  detectConflicts(schedule: RBTSchedule): Promise<ScheduleConflict[]>;
  getConflicts(userId: string, weekStart?: number): Promise<ScheduleConflict[]>;
  resolveConflict(conflictId: string, resolution: string): Promise<void>;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseScheduleStore implements ScheduleStore {
  constructor(private readonly db: KeyValueStoreAdapter) {}

  // RBT Profile Operations

  async createRBTProfile(
    profile: Omit<RBTProfile, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<RBTProfile> {
    const now = Date.now();
    const newProfile: RBTProfile = {
      ...profile,
      id: crypto.randomUUID() as RBTProfileId,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.set(`rbt-profile:${newProfile.id}`, newProfile);
    await this.addToIndex('rbt-profiles', profile.userId, newProfile.id);

    return newProfile;
  }

  async getRBTProfile(id: RBTProfileId): Promise<RBTProfile | null> {
    return this.db.get<RBTProfile>(`rbt-profile:${id}`);
  }

  async updateRBTProfile(
    id: RBTProfileId,
    updates: Partial<RBTProfile>
  ): Promise<RBTProfile | null> {
    const existing = await this.getRBTProfile(id);
    if (!existing) return null;

    const updated: RBTProfile = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    await this.db.set(`rbt-profile:${id}`, updated);
    return updated;
  }

  async deleteRBTProfile(id: RBTProfileId): Promise<boolean> {
    const profile = await this.getRBTProfile(id);
    if (!profile) return false;

    await this.db.delete(`rbt-profile:${id}`);
    await this.removeFromIndex('rbt-profiles', profile.userId, id);
    await this.db.delete(`rbt-availability:${id}`);

    return true;
  }

  async listRBTProfiles(userId: string): Promise<RBTProfile[]> {
    const profileIds = await this.getIndex('rbt-profiles', userId);
    const profiles: RBTProfile[] = [];

    for (const id of profileIds) {
      const profile = await this.getRBTProfile(id as RBTProfileId);
      if (profile) profiles.push(profile);
    }

    return profiles.sort((a, b) => a.lastName.localeCompare(b.lastName));
  }

  async getActiveRBTs(userId: string): Promise<RBTProfile[]> {
    const profiles = await this.listRBTProfiles(userId);
    return profiles.filter((p) => p.status === 'active');
  }

  async getRBTsBySkill(userId: string, skill: string): Promise<RBTProfile[]> {
    const profiles = await this.listRBTProfiles(userId);
    return profiles.filter((p) => p.skills?.includes(skill));
  }

  async getRBTsByLocation(userId: string, location: string): Promise<RBTProfile[]> {
    const profiles = await this.listRBTProfiles(userId);
    return profiles.filter((p) => p.serviceAreas?.includes(location));
  }

  // Schedule Operations

  async createSchedule(
    schedule: Omit<RBTSchedule, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<RBTSchedule> {
    const now = Date.now();
    const newSchedule: RBTSchedule = {
      ...schedule,
      id: crypto.randomUUID() as ScheduleId,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.set(`schedule:${newSchedule.id}`, newSchedule);
    await this.addToIndex('schedules', schedule.userId, newSchedule.id);
    await this.addToIndex(`schedules:rbt:${schedule.rbtId}`, schedule.userId, newSchedule.id);
    await this.addToIndex(`schedules:week:${schedule.weekStart}`, schedule.userId, newSchedule.id);

    return newSchedule;
  }

  async getSchedule(id: ScheduleId): Promise<RBTSchedule | null> {
    return this.db.get<RBTSchedule>(`schedule:${id}`);
  }

  async updateSchedule(
    id: ScheduleId,
    updates: Partial<RBTSchedule>
  ): Promise<RBTSchedule | null> {
    const existing = await this.getSchedule(id);
    if (!existing) return null;

    const updated: RBTSchedule = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    await this.db.set(`schedule:${id}`, updated);
    return updated;
  }

  async deleteSchedule(id: ScheduleId): Promise<boolean> {
    const schedule = await this.getSchedule(id);
    if (!schedule) return false;

    await this.db.delete(`schedule:${id}`);
    await this.removeFromIndex('schedules', schedule.userId, id);
    await this.removeFromIndex(`schedules:rbt:${schedule.rbtId}`, schedule.userId, id);
    await this.removeFromIndex(`schedules:week:${schedule.weekStart}`, schedule.userId, id);

    return true;
  }

  async listSchedules(userId: string, options?: ScheduleQueryOptions): Promise<RBTSchedule[]> {
    const scheduleIds = await this.getIndex('schedules', userId);
    const schedules: RBTSchedule[] = [];

    for (const id of scheduleIds) {
      const schedule = await this.getSchedule(id as ScheduleId);
      if (schedule && this.matchesQuery(schedule, options)) {
        schedules.push(schedule);
      }
    }

    return schedules.sort((a, b) => a.weekStart - b.weekStart);
  }

  async getScheduleByRBT(
    userId: string,
    rbtId: RBTProfileId,
    weekStart: number
  ): Promise<RBTSchedule | null> {
    const scheduleIds = await this.getIndex(`schedules:rbt:${rbtId}`, userId);

    for (const id of scheduleIds) {
      const schedule = await this.getSchedule(id as ScheduleId);
      if (schedule && schedule.weekStart === weekStart) {
        return schedule;
      }
    }

    return null;
  }

  async getSchedulesByWeek(userId: string, weekStart: number): Promise<RBTSchedule[]> {
    const scheduleIds = await this.getIndex(`schedules:week:${weekStart}`, userId);
    const schedules: RBTSchedule[] = [];

    for (const id of scheduleIds) {
      const schedule = await this.getSchedule(id as ScheduleId);
      if (schedule) schedules.push(schedule);
    }

    return schedules;
  }

  async getRBTScheduleRange(
    userId: string,
    rbtId: RBTProfileId,
    startDate: number,
    endDate: number
  ): Promise<RBTSchedule[]> {
    const scheduleIds = await this.getIndex(`schedules:rbt:${rbtId}`, userId);
    const schedules: RBTSchedule[] = [];

    for (const id of scheduleIds) {
      const schedule = await this.getSchedule(id as ScheduleId);
      if (schedule) {
        const weekEnd = schedule.weekStart + 7 * 24 * 60 * 60 * 1000;
        if (schedule.weekStart <= endDate && weekEnd >= startDate) {
          schedules.push(schedule);
        }
      }
    }

    return schedules.sort((a, b) => a.weekStart - b.weekStart);
  }

  // Availability Operations

  async setAvailability(rbtId: RBTProfileId, slots: AvailabilitySlot[]): Promise<void> {
    await this.db.set(`rbt-availability:${rbtId}`, slots);
  }

  async getAvailability(rbtId: RBTProfileId): Promise<AvailabilitySlot[]> {
    const slots = await this.db.get<AvailabilitySlot[]>(`rbt-availability:${rbtId}`);
    return slots ?? [];
  }

  async getAvailabilityForDay(rbtId: RBTProfileId, dayOfWeek: number): Promise<AvailabilitySlot[]> {
    const slots = await this.getAvailability(rbtId);
    return slots.filter((s) => s.dayOfWeek === dayOfWeek);
  }

  async getAvailableRBTs(
    userId: string,
    date: number,
    startTime: number,
    endTime: number
  ): Promise<RBTProfile[]> {
    const dayOfWeek = new Date(date).getDay();
    const profiles = await this.getActiveRBTs(userId);
    const available: RBTProfile[] = [];

    for (const profile of profiles) {
      // Check time-off
      const timeOff = await this.getTimeOff(profile.id, date, date);
      if (timeOff.length > 0) continue;

      // Check availability
      const slots = await this.getAvailabilityForDay(profile.id, dayOfWeek);
      const isAvailable = slots.some(
        (slot) => slot.startTime <= startTime && slot.endTime >= endTime
      );

      if (isAvailable) {
        available.push(profile);
      }
    }

    return available;
  }

  // Time-off Operations

  async addTimeOff(
    rbtId: RBTProfileId,
    startDate: number,
    endDate: number,
    reason: string
  ): Promise<void> {
    const timeOff = await this.db.get<Array<{ startDate: number; endDate: number; reason: string }>>(
      `rbt-timeoff:${rbtId}`
    ) ?? [];

    timeOff.push({ startDate, endDate, reason });
    await this.db.set(`rbt-timeoff:${rbtId}`, timeOff);
  }

  async removeTimeOff(rbtId: RBTProfileId, startDate: number): Promise<boolean> {
    const timeOff = await this.db.get<Array<{ startDate: number; endDate: number; reason: string }>>(
      `rbt-timeoff:${rbtId}`
    );

    if (!timeOff) return false;

    const newTimeOff = timeOff.filter((t) => t.startDate !== startDate);
    await this.db.set(`rbt-timeoff:${rbtId}`, newTimeOff);

    return newTimeOff.length < timeOff.length;
  }

  async getTimeOff(
    rbtId: RBTProfileId,
    startDate?: number,
    endDate?: number
  ): Promise<Array<{ startDate: number; endDate: number; reason: string }>> {
    const timeOff = await this.db.get<Array<{ startDate: number; endDate: number; reason: string }>>(
      `rbt-timeoff:${rbtId}`
    ) ?? [];

    if (!startDate && !endDate) return timeOff;

    return timeOff.filter((t) => {
      if (startDate && t.endDate < startDate) return false;
      if (endDate && t.startDate > endDate) return false;
      return true;
    });
  }

  // Conflict Operations

  async detectConflicts(schedule: RBTSchedule): Promise<ScheduleConflict[]> {
    const conflicts: ScheduleConflict[] = [];
    const existingSchedules = await this.getRBTScheduleRange(
      schedule.userId,
      schedule.rbtId,
      schedule.weekStart,
      schedule.weekStart + 7 * 24 * 60 * 60 * 1000
    );

    for (const assignment of schedule.assignments) {
      // Check for overlapping assignments in other schedules
      for (const existing of existingSchedules) {
        if (existing.id === schedule.id) continue;

        for (const existingAssignment of existing.assignments) {
          if (
            assignment.dayOfWeek === existingAssignment.dayOfWeek &&
            this.timesOverlap(
              assignment.startTime,
              assignment.endTime,
              existingAssignment.startTime,
              existingAssignment.endTime
            )
          ) {
            conflicts.push({
              id: crypto.randomUUID(),
              type: 'double-booking',
              scheduleId: schedule.id,
              rbtId: schedule.rbtId,
              description: `Double booking on day ${assignment.dayOfWeek}`,
              conflictingAssignments: [assignment, existingAssignment],
              severity: 'error',
              createdAt: Date.now(),
            });
          }
        }
      }
    }

    return conflicts;
  }

  async getConflicts(userId: string, weekStart?: number): Promise<ScheduleConflict[]> {
    const conflictsKey = weekStart
      ? `conflicts:${userId}:${weekStart}`
      : `conflicts:${userId}`;

    return await this.db.get<ScheduleConflict[]>(conflictsKey) ?? [];
  }

  async resolveConflict(conflictId: string, resolution: string): Promise<void> {
    // In a real implementation, this would update the conflict record
    // For now, we just log it
    console.log(`Conflict ${conflictId} resolved: ${resolution}`);
  }

  // Helper methods

  private matchesQuery(schedule: RBTSchedule, options?: ScheduleQueryOptions): boolean {
    if (!options) return true;

    if (options.rbtId && schedule.rbtId !== options.rbtId) return false;
    if (options.weekStart && schedule.weekStart !== options.weekStart) return false;
    if (options.status && schedule.status !== options.status) return false;

    return true;
  }

  private timesOverlap(
    start1: number,
    end1: number,
    start2: number,
    end2: number
  ): boolean {
    return start1 < end2 && end1 > start2;
  }

  private async getIndex(name: string, userId: string): Promise<string[]> {
    const index = await this.db.get<string[]>(`index:${name}:${userId}`);
    return index ?? [];
  }

  private async addToIndex(name: string, userId: string, id: string): Promise<void> {
    const index = await this.getIndex(name, userId);
    if (!index.includes(id)) {
      index.push(id);
      await this.db.set(`index:${name}:${userId}`, index);
    }
  }

  private async removeFromIndex(name: string, userId: string, id: string): Promise<void> {
    const index = await this.getIndex(name, userId);
    const newIndex = index.filter((i) => i !== id);
    await this.db.set(`index:${name}:${userId}`, newIndex);
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryScheduleStore implements ScheduleStore {
  private rbtProfiles = new Map<string, RBTProfile>();
  private schedules = new Map<string, RBTSchedule>();
  private availability = new Map<string, AvailabilitySlot[]>();
  private timeOff = new Map<string, Array<{ startDate: number; endDate: number; reason: string }>>();
  private conflicts = new Map<string, ScheduleConflict[]>();

  async createRBTProfile(
    profile: Omit<RBTProfile, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<RBTProfile> {
    const now = Date.now();
    const newProfile: RBTProfile = {
      ...profile,
      id: crypto.randomUUID() as RBTProfileId,
      createdAt: now,
      updatedAt: now,
    };

    this.rbtProfiles.set(newProfile.id, newProfile);
    return newProfile;
  }

  async getRBTProfile(id: RBTProfileId): Promise<RBTProfile | null> {
    return this.rbtProfiles.get(id) ?? null;
  }

  async updateRBTProfile(
    id: RBTProfileId,
    updates: Partial<RBTProfile>
  ): Promise<RBTProfile | null> {
    const existing = this.rbtProfiles.get(id);
    if (!existing) return null;

    const updated: RBTProfile = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    this.rbtProfiles.set(id, updated);
    return updated;
  }

  async deleteRBTProfile(id: RBTProfileId): Promise<boolean> {
    this.availability.delete(id);
    this.timeOff.delete(id);
    return this.rbtProfiles.delete(id);
  }

  async listRBTProfiles(userId: string): Promise<RBTProfile[]> {
    return Array.from(this.rbtProfiles.values())
      .filter((p) => p.userId === userId)
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
  }

  async getActiveRBTs(userId: string): Promise<RBTProfile[]> {
    return (await this.listRBTProfiles(userId)).filter((p) => p.status === 'active');
  }

  async getRBTsBySkill(userId: string, skill: string): Promise<RBTProfile[]> {
    return (await this.listRBTProfiles(userId)).filter((p) => p.skills?.includes(skill));
  }

  async getRBTsByLocation(userId: string, location: string): Promise<RBTProfile[]> {
    return (await this.listRBTProfiles(userId)).filter((p) => p.serviceAreas?.includes(location));
  }

  async createSchedule(
    schedule: Omit<RBTSchedule, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<RBTSchedule> {
    const now = Date.now();
    const newSchedule: RBTSchedule = {
      ...schedule,
      id: crypto.randomUUID() as ScheduleId,
      createdAt: now,
      updatedAt: now,
    };

    this.schedules.set(newSchedule.id, newSchedule);
    return newSchedule;
  }

  async getSchedule(id: ScheduleId): Promise<RBTSchedule | null> {
    return this.schedules.get(id) ?? null;
  }

  async updateSchedule(
    id: ScheduleId,
    updates: Partial<RBTSchedule>
  ): Promise<RBTSchedule | null> {
    const existing = this.schedules.get(id);
    if (!existing) return null;

    const updated: RBTSchedule = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    this.schedules.set(id, updated);
    return updated;
  }

  async deleteSchedule(id: ScheduleId): Promise<boolean> {
    return this.schedules.delete(id);
  }

  async listSchedules(userId: string, options?: ScheduleQueryOptions): Promise<RBTSchedule[]> {
    return Array.from(this.schedules.values())
      .filter((s) => s.userId === userId)
      .filter((s) => {
        if (options?.rbtId && s.rbtId !== options.rbtId) return false;
        if (options?.weekStart && s.weekStart !== options.weekStart) return false;
        if (options?.status && s.status !== options.status) return false;
        return true;
      })
      .sort((a, b) => a.weekStart - b.weekStart);
  }

  async getScheduleByRBT(
    userId: string,
    rbtId: RBTProfileId,
    weekStart: number
  ): Promise<RBTSchedule | null> {
    return (
      Array.from(this.schedules.values()).find(
        (s) => s.userId === userId && s.rbtId === rbtId && s.weekStart === weekStart
      ) ?? null
    );
  }

  async getSchedulesByWeek(userId: string, weekStart: number): Promise<RBTSchedule[]> {
    return Array.from(this.schedules.values()).filter(
      (s) => s.userId === userId && s.weekStart === weekStart
    );
  }

  async getRBTScheduleRange(
    userId: string,
    rbtId: RBTProfileId,
    startDate: number,
    endDate: number
  ): Promise<RBTSchedule[]> {
    return Array.from(this.schedules.values())
      .filter((s) => {
        if (s.userId !== userId || s.rbtId !== rbtId) return false;
        const weekEnd = s.weekStart + 7 * 24 * 60 * 60 * 1000;
        return s.weekStart <= endDate && weekEnd >= startDate;
      })
      .sort((a, b) => a.weekStart - b.weekStart);
  }

  async setAvailability(rbtId: RBTProfileId, slots: AvailabilitySlot[]): Promise<void> {
    this.availability.set(rbtId, slots);
  }

  async getAvailability(rbtId: RBTProfileId): Promise<AvailabilitySlot[]> {
    return this.availability.get(rbtId) ?? [];
  }

  async getAvailabilityForDay(rbtId: RBTProfileId, dayOfWeek: number): Promise<AvailabilitySlot[]> {
    const slots = this.availability.get(rbtId) ?? [];
    return slots.filter((s) => s.dayOfWeek === dayOfWeek);
  }

  async getAvailableRBTs(
    userId: string,
    date: number,
    startTime: number,
    endTime: number
  ): Promise<RBTProfile[]> {
    const dayOfWeek = new Date(date).getDay();
    const profiles = await this.getActiveRBTs(userId);
    const available: RBTProfile[] = [];

    for (const profile of profiles) {
      const off = await this.getTimeOff(profile.id, date, date);
      if (off.length > 0) continue;

      const slots = await this.getAvailabilityForDay(profile.id, dayOfWeek);
      const isAvailable = slots.some(
        (slot) => slot.startTime <= startTime && slot.endTime >= endTime
      );

      if (isAvailable) available.push(profile);
    }

    return available;
  }

  async addTimeOff(
    rbtId: RBTProfileId,
    startDate: number,
    endDate: number,
    reason: string
  ): Promise<void> {
    const existing = this.timeOff.get(rbtId) ?? [];
    existing.push({ startDate, endDate, reason });
    this.timeOff.set(rbtId, existing);
  }

  async removeTimeOff(rbtId: RBTProfileId, startDate: number): Promise<boolean> {
    const existing = this.timeOff.get(rbtId);
    if (!existing) return false;

    const newTimeOff = existing.filter((t) => t.startDate !== startDate);
    this.timeOff.set(rbtId, newTimeOff);
    return newTimeOff.length < existing.length;
  }

  async getTimeOff(
    rbtId: RBTProfileId,
    startDate?: number,
    endDate?: number
  ): Promise<Array<{ startDate: number; endDate: number; reason: string }>> {
    const existing = this.timeOff.get(rbtId) ?? [];

    if (!startDate && !endDate) return existing;

    return existing.filter((t) => {
      if (startDate && t.endDate < startDate) return false;
      if (endDate && t.startDate > endDate) return false;
      return true;
    });
  }

  async detectConflicts(schedule: RBTSchedule): Promise<ScheduleConflict[]> {
    // Simplified conflict detection
    return [];
  }

  async getConflicts(userId: string, weekStart?: number): Promise<ScheduleConflict[]> {
    return this.conflicts.get(`${userId}:${weekStart ?? 'all'}`) ?? [];
  }

  async resolveConflict(conflictId: string, resolution: string): Promise<void> {
    console.log(`Conflict ${conflictId} resolved: ${resolution}`);
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createScheduleStore(
  type: 'memory' | 'database',
  db?: KeyValueStoreAdapter
): ScheduleStore {
  if (type === 'database') {
    if (!db) throw new Error('Key-value store adapter required for database store');
    return new DatabaseScheduleStore(db);
  }
  return new InMemoryScheduleStore();
}
