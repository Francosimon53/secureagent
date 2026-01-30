/**
 * Availability Manager
 *
 * Manages RBT availability including:
 * - Regular weekly availability
 * - Time-off requests
 * - Availability queries for scheduling
 */

import { EventEmitter } from 'events';
import type { ScheduleStore } from '../../stores/schedule-store.js';
import type {
  RBTProfile,
  RBTId,
  AvailabilitySlot,
  PatientId,
} from '../../types.js';

/** Type alias for RBT profile ID */
type RBTProfileId = RBTId;
import { HEALTH_EVENTS } from '../../constants.js';

// =============================================================================
// Availability Manager Options
// =============================================================================

export interface AvailabilityManagerOptions {
  scheduleStore: ScheduleStore;
}

// =============================================================================
// Availability Block
// =============================================================================

export interface AvailabilityBlock {
  rbtId: RBTProfileId;
  rbtName: string;
  date: number;
  startTime: number; // Minutes from midnight
  endTime: number;
  isAvailable: boolean;
  reason?: string; // If not available
}

// =============================================================================
// Time-Off Request
// =============================================================================

export interface TimeOffRequest {
  id: string;
  rbtId: RBTProfileId;
  startDate: number;
  endDate: number;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  requestedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
}

// =============================================================================
// Availability Manager
// =============================================================================

export class AvailabilityManager extends EventEmitter {
  private readonly scheduleStore: ScheduleStore;
  private readonly timeOffRequests = new Map<string, TimeOffRequest>();

  constructor(options: AvailabilityManagerOptions) {
    super();
    this.scheduleStore = options.scheduleStore;
  }

  // ===========================================================================
  // Regular Availability
  // ===========================================================================

  /**
   * Set RBT's regular weekly availability
   */
  async setAvailability(rbtId: RBTProfileId, slots: AvailabilitySlot[]): Promise<void> {
    // Validate slots
    for (const slot of slots) {
      if (slot.dayOfWeek < 0 || slot.dayOfWeek > 6) {
        throw new Error(`Invalid day of week: ${slot.dayOfWeek}`);
      }
      if (slot.startTime >= slot.endTime) {
        throw new Error('Start time must be before end time');
      }
      if (slot.startTime < 0 || slot.endTime > 1440) {
        throw new Error('Times must be between 0 and 1440 minutes');
      }
    }

    // Merge overlapping slots for the same day
    const mergedSlots = this.mergeOverlappingSlots(slots);

    await this.scheduleStore.setAvailability(rbtId, mergedSlots);

    this.emit(HEALTH_EVENTS.SCHEDULE_AVAILABILITY_UPDATED, {
      rbtId,
      slots: mergedSlots,
      timestamp: Date.now(),
    });
  }

  /**
   * Get RBT's regular availability
   */
  async getAvailability(rbtId: RBTProfileId): Promise<AvailabilitySlot[]> {
    return this.scheduleStore.getAvailability(rbtId);
  }

  /**
   * Get availability for a specific day of week
   */
  async getAvailabilityForDay(
    rbtId: RBTProfileId,
    dayOfWeek: number
  ): Promise<AvailabilitySlot[]> {
    return this.scheduleStore.getAvailabilityForDay(rbtId, dayOfWeek);
  }

  /**
   * Check if RBT is available at a specific time
   */
  async isAvailable(
    rbtId: RBTProfileId,
    date: number,
    startTime: number,
    endTime: number
  ): Promise<boolean> {
    // Check time-off first
    const timeOff = await this.scheduleStore.getTimeOff(rbtId, date, date);
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);

    for (const off of timeOff) {
      if (off.startDate <= dateEnd.getTime() && off.endDate >= dateStart.getTime()) {
        return false;
      }
    }

    // Check regular availability
    const dayOfWeek = new Date(date).getDay();
    const slots = await this.getAvailabilityForDay(rbtId, dayOfWeek);

    return slots.some(
      (slot) => slot.startTime <= startTime && slot.endTime >= endTime
    );
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
    return this.scheduleStore.getAvailableRBTs(userId, date, startTime, endTime);
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
    const rbt = await this.scheduleStore.getRBTProfile(rbtId);
    if (!rbt) return [];

    const blocks: AvailabilityBlock[] = [];
    const availability = await this.getAvailability(rbtId);
    const timeOff = await this.scheduleStore.getTimeOff(rbtId, startDate, endDate);

    // Iterate through each day
    const currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    while (currentDate.getTime() <= end.getTime()) {
      const dayOfWeek = currentDate.getDay();
      const daySlots = availability.filter((s) => s.dayOfWeek === dayOfWeek);
      const dayTimestamp = currentDate.getTime();

      // Check if day is time-off
      const isTimeOff = timeOff.some(
        (off) => off.startDate <= dayTimestamp && off.endDate >= dayTimestamp
      );

      if (isTimeOff) {
        const offReason = timeOff.find(
          (off) => off.startDate <= dayTimestamp && off.endDate >= dayTimestamp
        )?.reason;

        blocks.push({
          rbtId,
          rbtName: `${rbt.firstName} ${rbt.lastName}`,
          date: dayTimestamp,
          startTime: 0,
          endTime: 1440,
          isAvailable: false,
          reason: offReason ?? 'Time off',
        });
      } else if (daySlots.length > 0) {
        for (const slot of daySlots) {
          blocks.push({
            rbtId,
            rbtName: `${rbt.firstName} ${rbt.lastName}`,
            date: dayTimestamp,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isAvailable: true,
          });
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return blocks;
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
    if (startDate >= endDate) {
      throw new Error('Start date must be before end date');
    }

    const request: TimeOffRequest = {
      id: crypto.randomUUID(),
      rbtId,
      startDate,
      endDate,
      reason,
      status: 'pending',
      requestedAt: Date.now(),
    };

    this.timeOffRequests.set(request.id, request);

    this.emit(HEALTH_EVENTS.SCHEDULE_TIME_OFF_REQUESTED, {
      requestId: request.id,
      rbtId,
      startDate,
      endDate,
      timestamp: Date.now(),
    });

    return request;
  }

  /**
   * Approve time-off request
   */
  async approveTimeOff(requestId: string, approvedBy: string): Promise<TimeOffRequest | null> {
    const request = this.timeOffRequests.get(requestId);
    if (!request || request.status !== 'pending') return null;

    request.status = 'approved';
    request.reviewedAt = Date.now();
    request.reviewedBy = approvedBy;

    // Add to schedule store
    await this.scheduleStore.addTimeOff(
      request.rbtId,
      request.startDate,
      request.endDate,
      request.reason
    );

    this.emit(HEALTH_EVENTS.SCHEDULE_TIME_OFF_APPROVED, {
      requestId,
      rbtId: request.rbtId,
      approvedBy,
      timestamp: Date.now(),
    });

    return request;
  }

  /**
   * Deny time-off request
   */
  async denyTimeOff(requestId: string, deniedBy: string): Promise<TimeOffRequest | null> {
    const request = this.timeOffRequests.get(requestId);
    if (!request || request.status !== 'pending') return null;

    request.status = 'denied';
    request.reviewedAt = Date.now();
    request.reviewedBy = deniedBy;

    return request;
  }

  /**
   * Add time-off directly (for immediate approval)
   */
  async addTimeOff(
    rbtId: RBTProfileId,
    startDate: number,
    endDate: number,
    reason: string
  ): Promise<void> {
    await this.scheduleStore.addTimeOff(rbtId, startDate, endDate, reason);

    this.emit(HEALTH_EVENTS.SCHEDULE_TIME_OFF_ADDED, {
      rbtId,
      startDate,
      endDate,
      timestamp: Date.now(),
    });
  }

  /**
   * Remove time-off
   */
  async removeTimeOff(rbtId: RBTProfileId, startDate: number): Promise<boolean> {
    const result = await this.scheduleStore.removeTimeOff(rbtId, startDate);

    if (result) {
      this.emit(HEALTH_EVENTS.SCHEDULE_TIME_OFF_REMOVED, {
        rbtId,
        startDate,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  /**
   * Get time-off entries
   */
  async getTimeOff(
    rbtId: RBTProfileId,
    startDate?: number,
    endDate?: number
  ): Promise<Array<{ startDate: number; endDate: number; reason: string }>> {
    return this.scheduleStore.getTimeOff(rbtId, startDate, endDate);
  }

  /**
   * Get pending time-off requests
   */
  getPendingTimeOffRequests(): TimeOffRequest[] {
    return Array.from(this.timeOffRequests.values())
      .filter((r) => r.status === 'pending')
      .sort((a, b) => a.requestedAt - b.requestedAt);
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Merge overlapping availability slots
   */
  private mergeOverlappingSlots(slots: AvailabilitySlot[]): AvailabilitySlot[] {
    const byDay = new Map<number, AvailabilitySlot[]>();

    // Group by day
    for (const slot of slots) {
      const day = slot.dayOfWeek;
      if (!byDay.has(day)) {
        byDay.set(day, []);
      }
      byDay.get(day)!.push(slot);
    }

    const merged: AvailabilitySlot[] = [];

    // Merge each day's slots
    for (const [dayOfWeek, daySlots] of byDay) {
      // Sort by start time
      const sorted = daySlots.sort((a, b) => a.startTime - b.startTime);

      let current = { ...sorted[0] };

      for (let i = 1; i < sorted.length; i++) {
        const next = sorted[i];

        if (next.startTime <= current.endTime) {
          // Overlapping or adjacent, extend current
          current.endTime = Math.max(current.endTime, next.endTime);
        } else {
          // Gap, save current and start new
          merged.push(current);
          current = { ...next };
        }
      }

      merged.push(current);
    }

    return merged;
  }

  /**
   * Convert time string (HH:MM) to minutes from midnight
   */
  static parseTime(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Convert minutes from midnight to time string (HH:MM)
   */
  static formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
}
