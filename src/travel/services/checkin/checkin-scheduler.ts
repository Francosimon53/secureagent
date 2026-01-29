/**
 * Check-In Scheduler
 *
 * Schedules and manages automatic flight check-ins.
 */

import { randomUUID } from 'crypto';
import type { CheckInStore, ScheduledCheckIn } from '../../stores/checkin-store.js';
import type {
  FlightBooking,
  CheckInAttempt,
  BoardingPass,
  SeatCategory,
} from '../../types.js';
import type {
  CheckInCapableProvider,
  CheckInOptions,
  CheckInResult,
} from '../../providers/base.js';

export interface CheckInSchedulerConfig {
  enabled: boolean;
  autoCheckInEnabled: boolean;
  checkInAdvanceMinutes: number;
  maxRetries: number;
  retryDelayMs: number;
  preferredSeatCategories: SeatCategory[];
}

export interface CheckInSchedulerDeps {
  store: CheckInStore;
  getAirlineProvider: (airline: string) => CheckInCapableProvider | undefined;
  onCheckInComplete?: (result: CheckInCompleteEvent) => void;
  onCheckInFailed?: (result: CheckInFailedEvent) => void;
}

export interface CheckInCompleteEvent {
  checkInId: string;
  bookingId: string;
  userId: string;
  airline: string;
  flightNumber: string;
  boardingPasses: BoardingPass[];
  seatAssignments: Record<string, string>;
}

export interface CheckInFailedEvent {
  checkInId: string;
  bookingId: string;
  userId: string;
  airline: string;
  flightNumber: string;
  errorMessage: string;
  attempts: number;
}

/**
 * Manages automatic flight check-ins
 */
export class CheckInScheduler {
  private readonly config: CheckInSchedulerConfig;
  private readonly deps: CheckInSchedulerDeps;
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(config: CheckInSchedulerConfig, deps: CheckInSchedulerDeps) {
    this.config = config;
    this.deps = deps;
  }

  /**
   * Schedule check-in for a flight booking
   */
  async scheduleCheckIn(booking: FlightBooking): Promise<ScheduledCheckIn> {
    // Calculate when to attempt check-in
    const checkInOpensAt = booking.checkInOpensAt;
    const scheduledAt = checkInOpensAt + (this.config.checkInAdvanceMinutes * 60 * 1000);

    // Ensure we don't schedule in the past
    const now = Date.now();
    const effectiveScheduledAt = Math.max(scheduledAt, now + 1000);

    const checkIn = await this.deps.store.scheduleCheckIn({
      bookingId: booking.id,
      userId: booking.userId,
      airline: booking.airline.toLowerCase(),
      flightNumber: booking.flightNumber,
      scheduledAt: effectiveScheduledAt,
      checkInOpensAt,
      departureTime: booking.departureTime,
      status: 'scheduled',
      attempts: [],
    });

    return checkIn;
  }

  /**
   * Cancel a scheduled check-in
   */
  async cancelCheckIn(checkInId: string): Promise<boolean> {
    const checkIn = await this.deps.store.cancelCheckIn(checkInId);
    return checkIn !== null;
  }

  /**
   * Process pending check-ins
   */
  async processPendingCheckIns(): Promise<void> {
    if (this.isProcessing || !this.config.enabled || !this.config.autoCheckInEnabled) {
      return;
    }

    this.isProcessing = true;

    try {
      const now = Date.now();
      const pendingCheckIns = await this.deps.store.getCheckInsToProcess(now);

      for (const checkIn of pendingCheckIns) {
        await this.processCheckIn(checkIn);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single check-in
   */
  private async processCheckIn(checkIn: ScheduledCheckIn): Promise<void> {
    const provider = this.deps.getAirlineProvider(checkIn.airline);

    if (!provider) {
      await this.deps.store.markCheckInFailed(
        checkIn.id,
        `No provider available for airline: ${checkIn.airline}`
      );
      this.emitFailedEvent(checkIn, `No provider available for airline: ${checkIn.airline}`);
      return;
    }

    // Mark as in progress
    await this.deps.store.markCheckInStarted(checkIn.id);

    // Build check-in options based on preferences
    const checkInOptions: CheckInOptions = {
      selectSeats: true,
      seatPreferences: {
        window: this.config.preferredSeatCategories.includes('window'),
        aisle: this.config.preferredSeatCategories.includes('aisle'),
        front: this.config.preferredSeatCategories.includes('front'),
        exitRow: this.config.preferredSeatCategories.includes('exit_row'),
      },
    };

    let lastError: string | undefined;
    let result: CheckInResult | undefined;

    // Attempt check-in with retries
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      const attemptRecord: CheckInAttempt = {
        id: randomUUID(),
        bookingId: checkIn.bookingId,
        status: 'pending',
        attemptedAt: Date.now(),
        retryCount: attempt,
      };

      try {
        // Extract confirmation number from booking ID (in real impl, would be stored)
        const confirmationNumber = checkIn.bookingId.slice(0, 6).toUpperCase();
        const lastName = 'PASSENGER'; // Would be retrieved from booking

        result = await provider.performCheckIn(confirmationNumber, lastName, checkInOptions);

        if (result.success && result.boardingPasses) {
          attemptRecord.status = 'success';
          attemptRecord.completedAt = Date.now();
          attemptRecord.boardingPassIds = result.boardingPasses.map(bp => bp.passengerId);
          attemptRecord.seatAssignments = result.seatAssignments;

          await this.deps.store.addCheckInAttempt(checkIn.id, attemptRecord);

          // Convert boarding pass data to BoardingPass type
          const boardingPasses: BoardingPass[] = result.boardingPasses.map(bp => ({
            id: randomUUID(),
            bookingId: checkIn.bookingId,
            passengerId: bp.passengerId,
            barcodeData: bp.barcodeData,
            barcodeType: bp.barcodeType,
            gate: bp.gate,
            boardingTime: bp.boardingTime,
            zone: bp.zone,
            issuedAt: Date.now(),
          }));

          // Mark as completed
          await this.deps.store.markCheckInCompleted(checkIn.id, boardingPasses);

          // Emit success event
          this.emitCompleteEvent(checkIn, boardingPasses, result.seatAssignments ?? {});
          return;
        }

        lastError = result.errorMessage ?? 'Check-in failed';
        attemptRecord.status = 'failed';
        attemptRecord.errorMessage = lastError;
        await this.deps.store.addCheckInAttempt(checkIn.id, attemptRecord);

      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        attemptRecord.status = 'failed';
        attemptRecord.errorMessage = lastError;
        await this.deps.store.addCheckInAttempt(checkIn.id, attemptRecord);
      }

      // Wait before retry
      if (attempt < this.config.maxRetries - 1) {
        await this.delay(this.config.retryDelayMs);
      }
    }

    // All attempts failed
    await this.deps.store.markCheckInFailed(checkIn.id, lastError ?? 'Max retries exceeded');
    this.emitFailedEvent(checkIn, lastError ?? 'Max retries exceeded');
  }

  /**
   * Start the scheduler processing loop
   */
  start(intervalMs: number = 30000): void {
    if (this.processingInterval) {
      return;
    }

    this.processingInterval = setInterval(() => {
      this.processPendingCheckIns().catch(console.error);
    }, intervalMs);

    // Also process immediately
    this.processPendingCheckIns().catch(console.error);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.processingInterval !== null;
  }

  /**
   * Get upcoming check-ins for a user
   */
  async getUpcomingCheckIns(userId: string, withinHours: number = 24): Promise<ScheduledCheckIn[]> {
    return this.deps.store.getUpcomingCheckIns(userId, withinHours);
  }

  /**
   * Get check-in by booking ID
   */
  async getCheckInByBooking(bookingId: string): Promise<ScheduledCheckIn | null> {
    return this.deps.store.getScheduledCheckInByBooking(bookingId);
  }

  /**
   * Manually trigger check-in for a booking
   */
  async triggerCheckIn(checkInId: string): Promise<CheckInResult> {
    const checkIn = await this.deps.store.getScheduledCheckIn(checkInId);
    if (!checkIn) {
      return {
        success: false,
        errorMessage: 'Check-in not found',
        errorCode: 'NOT_FOUND',
      };
    }

    if (checkIn.status === 'completed') {
      return {
        success: true,
        boardingPasses: checkIn.boardingPasses?.map(bp => ({
          passengerId: bp.passengerId,
          passengerName: '',
          barcodeData: bp.barcodeData,
          barcodeType: bp.barcodeType,
          gate: bp.gate,
          boardingTime: bp.boardingTime,
          zone: bp.zone,
        })),
      };
    }

    // Process immediately
    await this.processCheckIn(checkIn);

    // Return updated status
    const updatedCheckIn = await this.deps.store.getScheduledCheckIn(checkInId);
    if (updatedCheckIn?.status === 'completed') {
      return {
        success: true,
        boardingPasses: updatedCheckIn.boardingPasses?.map(bp => ({
          passengerId: bp.passengerId,
          passengerName: '',
          barcodeData: bp.barcodeData,
          barcodeType: bp.barcodeType,
          gate: bp.gate,
          boardingTime: bp.boardingTime,
          zone: bp.zone,
        })),
      };
    }

    return {
      success: false,
      errorMessage: updatedCheckIn?.errorMessage ?? 'Check-in failed',
    };
  }

  private emitCompleteEvent(
    checkIn: ScheduledCheckIn,
    boardingPasses: BoardingPass[],
    seatAssignments: Record<string, string>
  ): void {
    if (this.deps.onCheckInComplete) {
      this.deps.onCheckInComplete({
        checkInId: checkIn.id,
        bookingId: checkIn.bookingId,
        userId: checkIn.userId,
        airline: checkIn.airline,
        flightNumber: checkIn.flightNumber,
        boardingPasses,
        seatAssignments,
      });
    }
  }

  private emitFailedEvent(checkIn: ScheduledCheckIn, errorMessage: string): void {
    if (this.deps.onCheckInFailed) {
      this.deps.onCheckInFailed({
        checkInId: checkIn.id,
        bookingId: checkIn.bookingId,
        userId: checkIn.userId,
        airline: checkIn.airline,
        flightNumber: checkIn.flightNumber,
        errorMessage,
        attempts: checkIn.attempts.length,
      });
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a check-in scheduler instance
 */
export function createCheckInScheduler(
  config: Partial<CheckInSchedulerConfig>,
  deps: CheckInSchedulerDeps
): CheckInScheduler {
  const fullConfig: CheckInSchedulerConfig = {
    enabled: config.enabled ?? true,
    autoCheckInEnabled: config.autoCheckInEnabled ?? true,
    checkInAdvanceMinutes: config.checkInAdvanceMinutes ?? 1,
    maxRetries: config.maxRetries ?? 3,
    retryDelayMs: config.retryDelayMs ?? 5000,
    preferredSeatCategories: config.preferredSeatCategories ?? ['aisle'],
  };

  return new CheckInScheduler(fullConfig, deps);
}
