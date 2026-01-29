/**
 * Apple Health Provider
 *
 * Import health data from Apple Health exported XML/CSV files.
 * Apple Health doesn't have a cloud API, so this parses exported data.
 */

import { BaseWellnessProvider, type ProviderConfig, type ProviderResult } from './base.js';
import type {
  WearableSource,
  RecoveryData,
  SleepRecord,
  Activity,
  HeartRateDataPoint,
  ActivityType,
} from '../types.js';

// =============================================================================
// Apple Health Configuration
// =============================================================================

export interface AppleHealthConfig extends ProviderConfig {
  supportedFormats: Array<'xml' | 'csv'>;
  maxImportFileSizeMB: number;
  dataTypes: string[];
}

const DEFAULT_APPLE_HEALTH_CONFIG: AppleHealthConfig = {
  enabled: true,
  supportedFormats: ['xml', 'csv'],
  maxImportFileSizeMB: 100,
  dataTypes: [
    'HKQuantityTypeIdentifierHeartRate',
    'HKQuantityTypeIdentifierStepCount',
    'HKQuantityTypeIdentifierDistanceWalkingRunning',
    'HKQuantityTypeIdentifierActiveEnergyBurned',
    'HKCategoryTypeIdentifierSleepAnalysis',
    'HKQuantityTypeIdentifierBodyMass',
    'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    'HKQuantityTypeIdentifierRestingHeartRate',
    'HKQuantityTypeIdentifierVO2Max',
  ],
};

// =============================================================================
// Apple Health Data Types
// =============================================================================

interface AppleHealthRecord {
  type: string;
  sourceName: string;
  sourceVersion?: string;
  unit?: string;
  creationDate: string;
  startDate: string;
  endDate: string;
  value: string | number;
  metadata?: Record<string, string>;
}

interface AppleHealthWorkout {
  workoutActivityType: string;
  duration: number;
  durationUnit: string;
  totalDistance?: number;
  totalDistanceUnit?: string;
  totalEnergyBurned?: number;
  totalEnergyBurnedUnit?: string;
  sourceName: string;
  sourceVersion?: string;
  creationDate: string;
  startDate: string;
  endDate: string;
}

interface AppleHealthSleep {
  startDate: string;
  endDate: string;
  value: 'HKCategoryValueSleepAnalysisAsleep' | 'HKCategoryValueSleepAnalysisInBed' | 'HKCategoryValueSleepAnalysisAwake';
  sourceName: string;
}

// =============================================================================
// Import Result Types
// =============================================================================

export interface AppleHealthImportResult {
  success: boolean;
  recordsImported: number;
  sleepRecords: number;
  activityRecords: number;
  heartRateRecords: number;
  stepRecords: number;
  errors: string[];
}

// =============================================================================
// Apple Health Provider Implementation
// =============================================================================

export class AppleHealthProvider extends BaseWellnessProvider<AppleHealthConfig> {
  constructor(config: Partial<AppleHealthConfig> = {}) {
    super({ ...DEFAULT_APPLE_HEALTH_CONFIG, ...config });
  }

  get name(): WearableSource {
    return 'apple_health';
  }

  get displayName(): string {
    return 'Apple Health';
  }

  /**
   * Import data from Apple Health XML export
   */
  async importXML(userId: string, xmlContent: string): Promise<AppleHealthImportResult> {
    const result: AppleHealthImportResult = {
      success: false,
      recordsImported: 0,
      sleepRecords: 0,
      activityRecords: 0,
      heartRateRecords: 0,
      stepRecords: 0,
      errors: [],
    };

    try {
      // Parse XML
      const records = this.parseXML(xmlContent);
      const workouts = this.parseWorkouts(xmlContent);
      const sleepData = this.parseSleepData(xmlContent);

      // Process records by type
      for (const record of records) {
        try {
          this.processRecord(userId, record, result);
        } catch (error) {
          result.errors.push(
            `Failed to process record: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Process workouts
      for (const workout of workouts) {
        try {
          this.processWorkout(userId, workout);
          result.activityRecords++;
          result.recordsImported++;
        } catch (error) {
          result.errors.push(
            `Failed to process workout: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Process sleep
      const sleepRecords = this.aggregateSleepData(userId, sleepData);
      for (const sleep of sleepRecords) {
        this.emit('sleep:data', { userId, data: sleep });
        result.sleepRecords++;
        result.recordsImported++;
      }

      result.success = result.recordsImported > 0 || result.errors.length === 0;
      return result;
    } catch (error) {
      result.errors.push(
        `Failed to parse XML: ${error instanceof Error ? error.message : String(error)}`
      );
      return result;
    }
  }

  /**
   * Import data from CSV export
   */
  async importCSV(
    userId: string,
    csvContent: string,
    dataType: string
  ): Promise<AppleHealthImportResult> {
    const result: AppleHealthImportResult = {
      success: false,
      recordsImported: 0,
      sleepRecords: 0,
      activityRecords: 0,
      heartRateRecords: 0,
      stepRecords: 0,
      errors: [],
    };

    try {
      const lines = csvContent.split('\n');
      if (lines.length < 2) {
        result.errors.push('CSV file is empty or has no data');
        return result;
      }

      // Parse header
      const header = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));

      // Parse rows
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const values = this.parseCSVLine(line);
          const record: AppleHealthRecord = {
            type: dataType,
            sourceName: this.getCSVValue(header, values, 'sourceName') ?? 'Apple Health',
            unit: this.getCSVValue(header, values, 'unit') ?? '',
            creationDate: this.getCSVValue(header, values, 'creationDate') ?? '',
            startDate: this.getCSVValue(header, values, 'startDate') ?? '',
            endDate: this.getCSVValue(header, values, 'endDate') ?? '',
            value: this.getCSVValue(header, values, 'value') ?? '0',
          };

          this.processRecord(userId, record, result);
        } catch (error) {
          result.errors.push(
            `Failed to parse line ${i}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      result.success = result.recordsImported > 0;
      return result;
    } catch (error) {
      result.errors.push(
        `Failed to parse CSV: ${error instanceof Error ? error.message : String(error)}`
      );
      return result;
    }
  }

  /**
   * Parse XML content to extract records
   */
  private parseXML(xmlContent: string): AppleHealthRecord[] {
    const records: AppleHealthRecord[] = [];

    // Simple regex-based XML parsing for Record elements
    const recordPattern =
      /<Record\s+type="([^"]+)"[^>]*sourceName="([^"]+)"[^>]*unit="([^"]*)"[^>]*creationDate="([^"]+)"[^>]*startDate="([^"]+)"[^>]*endDate="([^"]+)"[^>]*value="([^"]+)"[^>]*\/?>/g;

    let match;
    while ((match = recordPattern.exec(xmlContent)) !== null) {
      records.push({
        type: match[1],
        sourceName: match[2],
        unit: match[3],
        creationDate: match[4],
        startDate: match[5],
        endDate: match[6],
        value: match[7],
      });
    }

    return records;
  }

  /**
   * Parse XML content to extract workouts
   */
  private parseWorkouts(xmlContent: string): AppleHealthWorkout[] {
    const workouts: AppleHealthWorkout[] = [];

    // Simple regex-based XML parsing for Workout elements
    const workoutPattern =
      /<Workout\s+workoutActivityType="([^"]+)"[^>]*duration="([^"]+)"[^>]*durationUnit="([^"]+)"[^>]*(?:totalDistance="([^"]+)"[^>]*)?(?:totalDistanceUnit="([^"]+)"[^>]*)?(?:totalEnergyBurned="([^"]+)"[^>]*)?(?:totalEnergyBurnedUnit="([^"]+)"[^>]*)?sourceName="([^"]+)"[^>]*creationDate="([^"]+)"[^>]*startDate="([^"]+)"[^>]*endDate="([^"]+)"[^>]*\/?>/g;

    let match;
    while ((match = workoutPattern.exec(xmlContent)) !== null) {
      workouts.push({
        workoutActivityType: match[1],
        duration: parseFloat(match[2]),
        durationUnit: match[3],
        totalDistance: match[4] ? parseFloat(match[4]) : undefined,
        totalDistanceUnit: match[5],
        totalEnergyBurned: match[6] ? parseFloat(match[6]) : undefined,
        totalEnergyBurnedUnit: match[7],
        sourceName: match[8],
        creationDate: match[9],
        startDate: match[10],
        endDate: match[11],
      });
    }

    return workouts;
  }

  /**
   * Parse XML content to extract sleep data
   */
  private parseSleepData(xmlContent: string): AppleHealthSleep[] {
    const sleepData: AppleHealthSleep[] = [];

    // Parse sleep analysis records
    const sleepPattern =
      /<Record\s+type="HKCategoryTypeIdentifierSleepAnalysis"[^>]*sourceName="([^"]+)"[^>]*startDate="([^"]+)"[^>]*endDate="([^"]+)"[^>]*value="([^"]+)"[^>]*\/?>/g;

    let match;
    while ((match = sleepPattern.exec(xmlContent)) !== null) {
      sleepData.push({
        sourceName: match[1],
        startDate: match[2],
        endDate: match[3],
        value: match[4] as AppleHealthSleep['value'],
      });
    }

    return sleepData;
  }

  /**
   * Process a single Apple Health record
   */
  private processRecord(
    userId: string,
    record: AppleHealthRecord,
    result: AppleHealthImportResult
  ): void {
    switch (record.type) {
      case 'HKQuantityTypeIdentifierHeartRate':
        this.processHeartRate(userId, record);
        result.heartRateRecords++;
        result.recordsImported++;
        break;

      case 'HKQuantityTypeIdentifierStepCount':
        this.processSteps(userId, record);
        result.stepRecords++;
        result.recordsImported++;
        break;

      case 'HKQuantityTypeIdentifierRestingHeartRate':
      case 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN':
        this.processRecoveryMetric(userId, record);
        result.recordsImported++;
        break;

      case 'HKQuantityTypeIdentifierActiveEnergyBurned':
      case 'HKQuantityTypeIdentifierDistanceWalkingRunning':
        // These are often aggregated into activities
        result.recordsImported++;
        break;
    }
  }

  /**
   * Process heart rate record
   */
  private processHeartRate(userId: string, record: AppleHealthRecord): void {
    const heartRateData: HeartRateDataPoint = {
      timestamp: new Date(record.startDate).getTime(),
      value: typeof record.value === 'number' ? record.value : parseFloat(record.value),
    };

    this.emit('heartrate:data', { userId, data: heartRateData });
  }

  /**
   * Process steps record
   */
  private processSteps(userId: string, record: AppleHealthRecord): void {
    this.emit('steps:data', {
      userId,
      data: {
        date: new Date(record.startDate).getTime(),
        steps: typeof record.value === 'number' ? record.value : parseInt(record.value, 10),
        source: 'apple_health',
      },
    });
  }

  /**
   * Process recovery metric (HRV, resting HR)
   */
  private processRecoveryMetric(userId: string, record: AppleHealthRecord): void {
    const value = typeof record.value === 'number' ? record.value : parseFloat(record.value);
    const date = new Date(record.startDate).getTime();

    if (record.type === 'HKQuantityTypeIdentifierRestingHeartRate') {
      this.emit('resting-hr:data', { userId, date, value });
    } else if (record.type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN') {
      this.emit('hrv:data', { userId, date, value });
    }
  }

  /**
   * Process workout into Activity
   */
  private processWorkout(userId: string, workout: AppleHealthWorkout): void {
    const activity: Omit<Activity, 'id' | 'createdAt'> = {
      userId,
      source: 'apple_health',
      externalId: `${workout.startDate}-${workout.workoutActivityType}`,
      activityType: this.mapWorkoutType(workout.workoutActivityType),
      name: this.formatWorkoutName(workout.workoutActivityType),
      startTime: new Date(workout.startDate).getTime(),
      endTime: new Date(workout.endDate).getTime(),
      durationMinutes: Math.round(workout.duration / 60),
      distance: workout.totalDistance,
      distanceUnit: this.mapDistanceUnit(workout.totalDistanceUnit),
      calories: workout.totalEnergyBurned,
      rawData: workout as unknown as Record<string, unknown>,
      syncedAt: Date.now(),
    };

    this.emit('activity:data', { userId, data: activity });
  }

  /**
   * Aggregate sleep data into sleep records
   */
  private aggregateSleepData(
    userId: string,
    sleepData: AppleHealthSleep[]
  ): Omit<SleepRecord, 'id' | 'createdAt'>[] {
    // Group by date
    const byDate = new Map<string, AppleHealthSleep[]>();

    for (const sleep of sleepData) {
      const date = new Date(sleep.startDate).toDateString();
      const existing = byDate.get(date) ?? [];
      existing.push(sleep);
      byDate.set(date, existing);
    }

    const records: Omit<SleepRecord, 'id' | 'createdAt'>[] = [];

    for (const [_date, entries] of byDate) {
      // Sort by start time
      entries.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

      const first = entries[0];
      const last = entries[entries.length - 1];

      // Calculate sleep stages
      let asleepMinutes = 0;
      let inBedMinutes = 0;
      let awakeMinutes = 0;

      for (const entry of entries) {
        const duration =
          (new Date(entry.endDate).getTime() - new Date(entry.startDate).getTime()) / 60000;

        switch (entry.value) {
          case 'HKCategoryValueSleepAnalysisAsleep':
            asleepMinutes += duration;
            break;
          case 'HKCategoryValueSleepAnalysisInBed':
            inBedMinutes += duration;
            break;
          case 'HKCategoryValueSleepAnalysisAwake':
            awakeMinutes += duration;
            break;
        }
      }

      const totalMinutes = asleepMinutes + inBedMinutes;
      if (totalMinutes < 30) continue; // Skip very short entries

      records.push({
        userId,
        source: 'apple_health',
        date: new Date(first.startDate).getTime(),
        bedtime: new Date(first.startDate).getTime(),
        wakeTime: new Date(last.endDate).getTime(),
        totalSleepMinutes: Math.round(asleepMinutes),
        awakeMinutes: Math.round(awakeMinutes),
        sleepEfficiency:
          totalMinutes > 0 ? Math.round((asleepMinutes / (totalMinutes + awakeMinutes)) * 100) : 0,
        rawData: { entries: entries.length },
        syncedAt: Date.now(),
      });
    }

    return records;
  }

  /**
   * Map Apple Health workout type to ActivityType
   */
  private mapWorkoutType(workoutType: string): ActivityType {
    const typeMap: Record<string, ActivityType> = {
      HKWorkoutActivityTypeRunning: 'running',
      HKWorkoutActivityTypeCycling: 'cycling',
      HKWorkoutActivityTypeSwimming: 'swimming',
      HKWorkoutActivityTypeWalking: 'walking',
      HKWorkoutActivityTypeHiking: 'hiking',
      HKWorkoutActivityTypeYoga: 'yoga',
      HKWorkoutActivityTypeFunctionalStrengthTraining: 'strength_training',
      HKWorkoutActivityTypeTraditionalStrengthTraining: 'strength_training',
      HKWorkoutActivityTypeRowing: 'rowing',
      HKWorkoutActivityTypeElliptical: 'elliptical',
      HKWorkoutActivityTypeCrossTraining: 'crossfit',
    };

    return typeMap[workoutType] ?? 'other';
  }

  /**
   * Format workout name from type
   */
  private formatWorkoutName(workoutType: string): string {
    // Convert HKWorkoutActivityTypeRunning -> Running
    return workoutType
      .replace('HKWorkoutActivityType', '')
      .replace(/([A-Z])/g, ' $1')
      .trim();
  }

  /**
   * Map distance unit
   */
  private mapDistanceUnit(unit?: string): 'km' | 'mi' | 'm' | undefined {
    if (!unit) return undefined;

    switch (unit.toLowerCase()) {
      case 'km':
        return 'km';
      case 'mi':
        return 'mi';
      case 'm':
        return 'm';
      default:
        return 'm';
    }
  }

  /**
   * Parse a CSV line handling quoted values
   */
  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  /**
   * Get value from CSV by header name
   */
  private getCSVValue(header: string[], values: string[], fieldName: string): string | undefined {
    const index = header.findIndex((h) => h.toLowerCase() === fieldName.toLowerCase());
    return index >= 0 ? values[index] : undefined;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createAppleHealthProvider(config?: Partial<AppleHealthConfig>): AppleHealthProvider {
  return new AppleHealthProvider(config);
}
