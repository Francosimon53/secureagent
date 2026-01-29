/**
 * Check-In Service
 *
 * Manages flight check-in scheduling and execution.
 */

export {
  CheckInScheduler,
  createCheckInScheduler,
  type CheckInSchedulerConfig,
  type CheckInSchedulerDeps,
  type CheckInCompleteEvent,
  type CheckInFailedEvent,
} from './checkin-scheduler.js';

import type { CheckInStore, ScheduledCheckIn } from '../../stores/checkin-store.js';
import type { BookingStore } from '../../stores/booking-store.js';
import type { FlightBooking, BoardingPass } from '../../types.js';
import type { CheckInCapableProvider } from '../../providers/base.js';
import { CheckInScheduler, createCheckInScheduler, type CheckInSchedulerConfig } from './checkin-scheduler.js';

export interface CheckInServiceConfig extends Partial<CheckInSchedulerConfig> {
  enabled?: boolean;
}

export interface CheckInServiceDeps {
  checkInStore: CheckInStore;
  bookingStore: BookingStore;
  getAirlineProvider: (airline: string) => CheckInCapableProvider | undefined;
}

/**
 * High-level check-in service
 */
export class CheckInService {
  private readonly scheduler: CheckInScheduler;
  private readonly deps: CheckInServiceDeps;
  private readonly config: CheckInServiceConfig;

  constructor(config: CheckInServiceConfig, deps: CheckInServiceDeps) {
    this.config = config;
    this.deps = deps;

    this.scheduler = createCheckInScheduler(config, {
      store: deps.checkInStore,
      getAirlineProvider: deps.getAirlineProvider,
      onCheckInComplete: this.handleCheckInComplete.bind(this),
      onCheckInFailed: this.handleCheckInFailed.bind(this),
    });
  }

  /**
   * Schedule check-in for a flight booking
   */
  async scheduleCheckIn(bookingId: string): Promise<ScheduledCheckIn | null> {
    const booking = await this.deps.bookingStore.getBooking<FlightBooking>(bookingId);
    if (!booking || booking.type !== 'flight') {
      return null;
    }

    // Check if already scheduled
    const existing = await this.scheduler.getCheckInByBooking(bookingId);
    if (existing) {
      return existing;
    }

    return this.scheduler.scheduleCheckIn(booking);
  }

  /**
   * Cancel a scheduled check-in
   */
  async cancelCheckIn(bookingId: string): Promise<boolean> {
    const checkIn = await this.scheduler.getCheckInByBooking(bookingId);
    if (!checkIn) {
      return false;
    }

    return this.scheduler.cancelCheckIn(checkIn.id);
  }

  /**
   * Manually trigger check-in for a booking
   */
  async triggerCheckIn(bookingId: string): Promise<{
    success: boolean;
    boardingPasses?: BoardingPass[];
    errorMessage?: string;
  }> {
    const checkIn = await this.scheduler.getCheckInByBooking(bookingId);
    if (!checkIn) {
      // Schedule and immediately process
      const booking = await this.deps.bookingStore.getBooking<FlightBooking>(bookingId);
      if (!booking || booking.type !== 'flight') {
        return { success: false, errorMessage: 'Booking not found or not a flight' };
      }

      const scheduled = await this.scheduler.scheduleCheckIn(booking);
      const result = await this.scheduler.triggerCheckIn(scheduled.id);

      return {
        success: result.success,
        boardingPasses: result.boardingPasses?.map(bp => ({
          id: bp.passengerId,
          bookingId,
          passengerId: bp.passengerId,
          barcodeData: bp.barcodeData,
          barcodeType: bp.barcodeType,
          gate: bp.gate,
          boardingTime: bp.boardingTime,
          zone: bp.zone,
          issuedAt: Date.now(),
        })),
        errorMessage: result.errorMessage,
      };
    }

    const result = await this.scheduler.triggerCheckIn(checkIn.id);
    return {
      success: result.success,
      boardingPasses: result.boardingPasses?.map(bp => ({
        id: bp.passengerId,
        bookingId,
        passengerId: bp.passengerId,
        barcodeData: bp.barcodeData,
        barcodeType: bp.barcodeType,
        gate: bp.gate,
        boardingTime: bp.boardingTime,
        zone: bp.zone,
        issuedAt: Date.now(),
      })),
      errorMessage: result.errorMessage,
    };
  }

  /**
   * Get check-in status for a booking
   */
  async getCheckInStatus(bookingId: string): Promise<ScheduledCheckIn | null> {
    return this.scheduler.getCheckInByBooking(bookingId);
  }

  /**
   * Get upcoming check-ins for a user
   */
  async getUpcomingCheckIns(userId: string, withinHours: number = 48): Promise<ScheduledCheckIn[]> {
    return this.scheduler.getUpcomingCheckIns(userId, withinHours);
  }

  /**
   * Get boarding passes for a booking
   */
  async getBoardingPasses(bookingId: string): Promise<BoardingPass[]> {
    return this.deps.checkInStore.getBoardingPassesByBooking(bookingId);
  }

  /**
   * Start the check-in scheduler
   */
  start(): void {
    if (this.config.enabled !== false) {
      this.scheduler.start();
    }
  }

  /**
   * Stop the check-in scheduler
   */
  stop(): void {
    this.scheduler.stop();
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.scheduler.isRunning();
  }

  private async handleCheckInComplete(event: {
    checkInId: string;
    bookingId: string;
    boardingPasses: BoardingPass[];
    seatAssignments: Record<string, string>;
  }): Promise<void> {
    // Update booking status
    await this.deps.bookingStore.updateBookingStatus(event.bookingId, 'checked_in');

    // Save boarding passes
    for (const pass of event.boardingPasses) {
      await this.deps.checkInStore.saveBoardingPass(pass);
    }
  }

  private async handleCheckInFailed(event: {
    checkInId: string;
    bookingId: string;
    errorMessage: string;
  }): Promise<void> {
    // Log the failure - in a real system, would emit an event
    console.error(`Check-in failed for booking ${event.bookingId}: ${event.errorMessage}`);
  }
}

/**
 * Create a check-in service instance
 */
export function createCheckInService(
  config: CheckInServiceConfig,
  deps: CheckInServiceDeps
): CheckInService {
  return new CheckInService(config, deps);
}
