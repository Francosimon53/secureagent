/**
 * Delta Airlines Provider
 *
 * Check-in provider for Delta Airlines flights.
 * Note: This is a simulated implementation. In production, this would
 * integrate with Delta's actual APIs or use browser automation.
 */

import {
  BaseTravelProvider,
  type CheckInCapableProvider,
  type CheckInOptions,
  type CheckInResult,
  type BoardingPassData,
  type SeatMap,
  type SeatRow,
  type SeatInfo,
  TravelProviderError,
} from '../base.js';
import type { TravelProviderConfig } from '../../types.js';

export interface DeltaConfig extends TravelProviderConfig {
  name: 'delta';
  credentialsEnvVar?: string;
}

/**
 * Delta Airlines check-in provider
 */
export class DeltaProvider
  extends BaseTravelProvider<DeltaConfig>
  implements CheckInCapableProvider
{
  private readonly airlineCode = 'DL';

  constructor(config: DeltaConfig) {
    super(config);
  }

  get name(): string {
    return 'delta';
  }

  get type(): string {
    return 'airline';
  }

  protected requiresApiKey(): boolean {
    return false;
  }

  /**
   * Check if check-in is available for a Delta flight
   */
  async isCheckInAvailable(
    flightNumber: string,
    departureDate: number,
    lastName: string
  ): Promise<boolean> {
    // Delta check-in opens 24 hours before departure
    const now = Date.now();
    const checkInWindow = 24 * 60 * 60 * 1000;
    const checkInOpensAt = departureDate - checkInWindow;
    const cutoffTime = departureDate - (60 * 60 * 1000); // 1 hour before

    return now >= checkInOpensAt && now <= cutoffTime;
  }

  /**
   * Perform check-in for a Delta flight
   */
  async performCheckIn(
    confirmationNumber: string,
    lastName: string,
    options?: CheckInOptions
  ): Promise<CheckInResult> {
    // Validate confirmation number (Delta uses 6 characters)
    if (!confirmationNumber || confirmationNumber.length !== 6) {
      return {
        success: false,
        errorMessage: 'Invalid confirmation number',
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
      await this.simulateDelay(600, 1800);

      // Generate boarding passes
      const boardingPasses: BoardingPassData[] = [
        {
          passengerId: 'PAX001',
          passengerName: `${lastName.toUpperCase()}/TRAVELER`,
          barcodeData: this.generateBarcodeData(confirmationNumber, lastName),
          barcodeType: 'aztec',
          gate: 'A15',
          boardingTime: Date.now() + (2 * 60 * 60 * 1000),
          zone: '2',
          seat: options?.seatPreferences?.window ? '18A' : '18D',
        },
      ];

      return {
        success: true,
        boardingPasses,
        seatAssignments: {
          'PAX001': boardingPasses[0].seat!,
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
   * Get available seats for seat selection
   */
  async getAvailableSeats(
    confirmationNumber: string,
    lastName: string
  ): Promise<SeatMap> {
    await this.simulateDelay(400, 900);

    const rows: SeatRow[] = [];

    // Delta typically has Comfort+ rows 8-19, then Main Cabin
    for (let rowNum = 8; rowNum <= 40; rowNum++) {
      const isComfortPlus = rowNum <= 19;
      const isExitRow = rowNum === 20 || rowNum === 21;
      const seats: SeatInfo[] = [];

      for (const column of ['A', 'B', 'C', 'D', 'E', 'F']) {
        const isWindow = column === 'A' || column === 'F';
        const isAisle = column === 'C' || column === 'D';
        const isMiddle = column === 'B' || column === 'E';

        seats.push({
          seatNumber: `${rowNum}${column}`,
          column,
          isAvailable: Math.random() > 0.35,
          isWindow,
          isAisle,
          isMiddle,
          isExitRow,
          hasPower: true, // Delta has power on most planes
          hasExtraLegroom: isComfortPlus || isExitRow,
          price: isComfortPlus ? 49 : (isExitRow ? 39 : undefined),
        });
      }

      rows.push({ rowNumber: rowNum, seats });
    }

    return {
      cabin: 'economy',
      rows,
    };
  }

  /**
   * Select a seat for a passenger
   */
  async selectSeat(
    confirmationNumber: string,
    passengerId: string,
    seatNumber: string
  ): Promise<boolean> {
    await this.simulateDelay(250, 600);

    const seatMatch = seatNumber.match(/^(\d+)([A-F])$/);
    if (!seatMatch) {
      throw new TravelProviderError(this.name, 'Invalid seat format');
    }

    return Math.random() > 0.08; // 92% success rate
  }

  /**
   * Get SkyMiles number from account
   */
  async getSkyMilesInfo(skyMilesNumber: string): Promise<{
    tier: string;
    miles: number;
    mqm: number;
  } | null> {
    await this.simulateDelay(200, 400);

    // Return simulated data
    return {
      tier: 'Silver Medallion',
      miles: 45000,
      mqm: 35000,
    };
  }

  private generateBarcodeData(confirmationNumber: string, lastName: string): string {
    const data = [
      'M1',
      lastName.toUpperCase().slice(0, 20).padEnd(20),
      confirmationNumber,
      'ATL', // Hub
      'LAX', // Destination
      this.airlineCode,
      '0456',
      '180',
      'Y',
      '018',
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
 * Create a Delta Airlines provider instance
 */
export function createDeltaProvider(): DeltaProvider {
  return new DeltaProvider({
    name: 'delta',
  });
}
