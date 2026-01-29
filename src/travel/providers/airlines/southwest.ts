/**
 * Southwest Airlines Provider
 *
 * Check-in provider for Southwest Airlines flights.
 * Note: This is a simulated implementation. In production, this would
 * integrate with Southwest's actual APIs or use browser automation.
 */

import {
  BaseTravelProvider,
  type CheckInCapableProvider,
  type CheckInOptions,
  type CheckInResult,
  type BoardingPassData,
  type SeatMap,
  TravelProviderError,
} from '../base.js';
import type { TravelProviderConfig } from '../../types.js';

export interface SouthwestConfig extends TravelProviderConfig {
  name: 'southwest';
  credentialsEnvVar?: string;
}

/**
 * Southwest Airlines check-in provider
 *
 * Southwest has unique check-in characteristics:
 * - No assigned seats - boarding position determines seat choice
 * - Boarding groups A, B, C with positions 1-60
 * - Check-in opens exactly 24 hours before departure
 * - Earlier check-in = better boarding position
 */
export class SouthwestProvider
  extends BaseTravelProvider<SouthwestConfig>
  implements CheckInCapableProvider
{
  private readonly airlineCode = 'WN';

  constructor(config: SouthwestConfig) {
    super(config);
  }

  get name(): string {
    return 'southwest';
  }

  get type(): string {
    return 'airline';
  }

  protected requiresApiKey(): boolean {
    return false;
  }

  /**
   * Check if check-in is available
   * Southwest check-in opens exactly at T-24 hours
   */
  async isCheckInAvailable(
    flightNumber: string,
    departureDate: number,
    lastName: string
  ): Promise<boolean> {
    const now = Date.now();
    const checkInWindow = 24 * 60 * 60 * 1000;
    const checkInOpensAt = departureDate - checkInWindow;
    const cutoffTime = departureDate - (10 * 60 * 1000); // 10 min before

    return now >= checkInOpensAt && now <= cutoffTime;
  }

  /**
   * Perform check-in for Southwest
   *
   * Southwest uses open seating, so check-in assigns a boarding position
   * instead of a specific seat. Earlier check-in = better position.
   */
  async performCheckIn(
    confirmationNumber: string,
    lastName: string,
    options?: CheckInOptions
  ): Promise<CheckInResult> {
    // Southwest uses 6-character alphanumeric confirmation codes
    if (!confirmationNumber || !/^[A-Z0-9]{6}$/.test(confirmationNumber.toUpperCase())) {
      return {
        success: false,
        errorMessage: 'Invalid confirmation number format',
        errorCode: 'INVALID_CONFIRMATION',
      };
    }

    if (!lastName || lastName.length < 2) {
      return {
        success: false,
        errorMessage: 'Invalid last name',
        errorCode: 'INVALID_LASTNAME',
      };
    }

    try {
      await this.simulateDelay(400, 1200);

      // Calculate boarding position based on "when" check-in occurred
      // Earlier = better position
      const now = Date.now();
      const position = this.calculateBoardingPosition(now);

      const boardingPasses: BoardingPassData[] = [
        {
          passengerId: 'PAX001',
          passengerName: `${lastName.toUpperCase()}/PASSENGER`,
          barcodeData: this.generateBarcodeData(confirmationNumber, lastName, position),
          barcodeType: 'qr',
          gate: 'C24',
          boardingTime: Date.now() + (2 * 60 * 60 * 1000),
          zone: position.group, // A, B, or C
          seat: `${position.group}${position.number}`, // Boarding position, not seat
        },
      ];

      return {
        success: true,
        boardingPasses,
        seatAssignments: {
          'PAX001': `${position.group}${position.number}`,
        },
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Check-in failed',
        errorCode: 'CHECKIN_ERROR',
      };
    }
  }

  /**
   * Southwest doesn't have assigned seats, but we can return empty seat map
   * explaining the open seating policy
   */
  async getAvailableSeats(
    confirmationNumber: string,
    lastName: string
  ): Promise<SeatMap> {
    // Southwest has open seating - no specific seat selection
    return {
      cabin: 'open_seating',
      rows: [], // No rows since seats aren't assigned
    };
  }

  /**
   * Seat selection not available on Southwest
   */
  async selectSeat(
    confirmationNumber: string,
    passengerId: string,
    seatNumber: string
  ): Promise<boolean> {
    throw new TravelProviderError(
      this.name,
      'Southwest Airlines uses open seating. Seats cannot be pre-selected.'
    );
  }

  /**
   * Get EarlyBird Check-In status
   */
  async getEarlyBirdStatus(confirmationNumber: string): Promise<{
    purchased: boolean;
    position?: { group: string; number: number };
  }> {
    await this.simulateDelay(150, 350);

    // Simulate - 30% have EarlyBird
    const hasBird = Math.random() > 0.7;

    if (hasBird) {
      return {
        purchased: true,
        position: {
          group: 'A',
          number: Math.floor(Math.random() * 25) + 1, // A1-A25
        },
      };
    }

    return { purchased: false };
  }

  /**
   * Get Rapid Rewards information
   */
  async getRapidRewardsInfo(rapidRewardsNumber: string): Promise<{
    tier: string;
    points: number;
    companionPassStatus: boolean;
  } | null> {
    await this.simulateDelay(200, 400);

    return {
      tier: 'A-List',
      points: 75000,
      companionPassStatus: false,
    };
  }

  /**
   * Calculate boarding position based on check-in timing
   */
  private calculateBoardingPosition(checkInTime: number): { group: string; number: number } {
    // Simulate: earlier check-in = better position
    // This is a simplified model

    // Random position weighted toward the check-in time
    const randomFactor = Math.random();

    if (randomFactor < 0.15) {
      // Top 15% get group A
      return {
        group: 'A',
        number: Math.floor(Math.random() * 60) + 1,
      };
    } else if (randomFactor < 0.55) {
      // Next 40% get group B
      return {
        group: 'B',
        number: Math.floor(Math.random() * 60) + 1,
      };
    } else {
      // Remaining get group C
      return {
        group: 'C',
        number: Math.floor(Math.random() * 60) + 1,
      };
    }
  }

  private generateBarcodeData(
    confirmationNumber: string,
    lastName: string,
    position: { group: string; number: number }
  ): string {
    const data = [
      'M1',
      lastName.toUpperCase().slice(0, 20).padEnd(20),
      confirmationNumber.toUpperCase(),
      'DAL', // Southwest hub
      'PHX',
      this.airlineCode,
      '0789',
      '270',
      position.group,
      String(position.number).padStart(3, '0'),
      '0001',
      '1',
    ].join('');

    return Buffer.from(data).toString('base64');
  }

  private async simulateDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

/**
 * Create a Southwest Airlines provider instance
 */
export function createSouthwestProvider(): SouthwestProvider {
  return new SouthwestProvider({
    name: 'southwest',
  });
}
