/**
 * United Airlines Provider
 *
 * Check-in provider for United Airlines flights.
 * Note: This is a simulated implementation. In production, this would
 * integrate with United's actual APIs or use browser automation.
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

export interface UnitedConfig extends TravelProviderConfig {
  name: 'united';
  credentialsEnvVar?: string;
}

/**
 * United Airlines check-in provider
 */
export class UnitedProvider
  extends BaseTravelProvider<UnitedConfig>
  implements CheckInCapableProvider
{
  private readonly airlineCode = 'UA';

  constructor(config: UnitedConfig) {
    super(config);
  }

  get name(): string {
    return 'united';
  }

  get type(): string {
    return 'airline';
  }

  protected requiresApiKey(): boolean {
    return false;
  }

  /**
   * Check if check-in is available for a flight
   */
  async isCheckInAvailable(
    flightNumber: string,
    departureDate: number,
    lastName: string
  ): Promise<boolean> {
    // Check-in typically opens 24 hours before departure
    const now = Date.now();
    const checkInWindow = 24 * 60 * 60 * 1000; // 24 hours in ms
    const checkInOpensAt = departureDate - checkInWindow;

    // Check-in is available from 24 hours to 45 minutes before departure
    const cutoffTime = departureDate - (45 * 60 * 1000);

    return now >= checkInOpensAt && now <= cutoffTime;
  }

  /**
   * Perform check-in for a United flight
   */
  async performCheckIn(
    confirmationNumber: string,
    lastName: string,
    options?: CheckInOptions
  ): Promise<CheckInResult> {
    // Validate inputs
    if (!confirmationNumber || confirmationNumber.length !== 6) {
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
      // In production, this would make actual API calls or use browser automation
      // For now, simulate a successful check-in

      // Simulate network delay
      await this.simulateDelay(500, 1500);

      // Generate boarding pass data
      const boardingPasses: BoardingPassData[] = [
        {
          passengerId: 'PAX001',
          passengerName: `${lastName.toUpperCase()}/PRIMARY`,
          barcodeData: this.generateBarcodeData(confirmationNumber, lastName),
          barcodeType: 'pdf417',
          gate: 'B12',
          boardingTime: Date.now() + (2 * 60 * 60 * 1000), // 2 hours from now
          zone: '3',
          seat: options?.seatPreferences?.aisle ? '12C' : '12A',
        },
      ];

      const seatAssignments: Record<string, string> = {
        'PAX001': boardingPasses[0].seat!,
      };

      return {
        success: true,
        boardingPasses,
        seatAssignments,
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
   * Get available seats for a United flight
   */
  async getAvailableSeats(
    confirmationNumber: string,
    lastName: string
  ): Promise<SeatMap> {
    await this.simulateDelay(300, 800);

    // Generate a simulated seat map
    const rows: SeatRow[] = [];

    for (let rowNum = 6; rowNum <= 35; rowNum++) {
      const isExitRow = rowNum === 15 || rowNum === 16;
      const seats: SeatInfo[] = [];

      for (const column of ['A', 'B', 'C', 'D', 'E', 'F']) {
        const isWindow = column === 'A' || column === 'F';
        const isAisle = column === 'C' || column === 'D';
        const isMiddle = column === 'B' || column === 'E';

        seats.push({
          seatNumber: `${rowNum}${column}`,
          column,
          isAvailable: Math.random() > 0.4, // 60% available
          isWindow,
          isAisle,
          isMiddle,
          isExitRow,
          hasPower: rowNum >= 8,
          hasExtraLegroom: isExitRow || rowNum <= 8,
          price: isExitRow ? 45 : (rowNum <= 8 ? 25 : undefined),
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
   * Select a specific seat for a passenger
   */
  async selectSeat(
    confirmationNumber: string,
    passengerId: string,
    seatNumber: string
  ): Promise<boolean> {
    await this.simulateDelay(200, 500);

    // Validate seat format
    const seatMatch = seatNumber.match(/^(\d+)([A-F])$/);
    if (!seatMatch) {
      throw new TravelProviderError(this.name, 'Invalid seat number format');
    }

    // Simulate seat selection (90% success rate)
    return Math.random() > 0.1;
  }

  /**
   * Get boarding pass in various formats
   */
  async getBoardingPassUrl(
    confirmationNumber: string,
    passengerId: string,
    format: 'pdf' | 'pkpass' | 'image' = 'pdf'
  ): Promise<string> {
    await this.simulateDelay(100, 300);

    // Return a simulated URL
    const baseUrl = 'https://mobile.united.com/boarding-pass';
    return `${baseUrl}/${confirmationNumber}/${passengerId}?format=${format}`;
  }

  private generateBarcodeData(confirmationNumber: string, lastName: string): string {
    // Generate PDF417 barcode data following IATA standards
    const data = [
      'M1', // Format code
      lastName.toUpperCase().slice(0, 20).padEnd(20), // Passenger name
      confirmationNumber, // PNR
      'SFO', // Origin
      'ORD', // Destination
      this.airlineCode, // Airline
      '0123', // Flight number
      '365', // Julian date
      'Y', // Cabin class
      '012', // Seat
      '0001', // Sequence
      '1', // Passenger status
    ].join('');

    return Buffer.from(data).toString('base64');
  }

  private async simulateDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

/**
 * Create a United Airlines provider instance
 */
export function createUnitedProvider(): UnitedProvider {
  return new UnitedProvider({
    name: 'united',
  });
}
