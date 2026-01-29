/**
 * Garmin Connect Provider
 *
 * Integration with Garmin Connect API for activities and health data.
 * Uses OAuth 1.0a for authentication.
 */

import {
  OAuth1WellnessProvider,
  type OAuth1ProviderConfig,
  type ProviderResult,
  type OAuth1TokenResponse,
  type SyncCapableProvider,
} from './base.js';
import type {
  WearableSource,
  RecoveryData,
  StrainData,
  SleepRecord,
  Activity,
  GPSPoint,
  ActivityLap,
  HeartRateZone,
  SyncResult,
  ActivityType,
} from '../types.js';

// =============================================================================
// Garmin Configuration
// =============================================================================

export interface GarminConfig extends OAuth1ProviderConfig {
  syncIntervalMinutes: number;
  includeGPSData: boolean;
  maxGPSPointsPerActivity: number;
  activityTypes: string[];
}

const DEFAULT_GARMIN_CONFIG: GarminConfig = {
  enabled: true,
  consumerKeyEnvVar: 'GARMIN_CONSUMER_KEY',
  consumerSecretEnvVar: 'GARMIN_CONSUMER_SECRET',
  baseUrl: 'https://apis.garmin.com',
  syncIntervalMinutes: 60,
  includeGPSData: true,
  maxGPSPointsPerActivity: 10000,
  activityTypes: ['running', 'cycling', 'swimming', 'walking', 'hiking', 'strength_training'],
};

// =============================================================================
// Garmin API Response Types
// =============================================================================

interface GarminActivity {
  activityId: number;
  activityName: string;
  activityType: {
    typeId: number;
    typeKey: string;
    parentTypeId: number;
  };
  startTimeGMT: string;
  startTimeLocal: string;
  duration: number; // seconds
  distance?: number; // meters
  calories?: number;
  averageHR?: number;
  maxHR?: number;
  averageSpeed?: number; // m/s
  maxSpeed?: number;
  elevationGain?: number;
  elevationLoss?: number;
  steps?: number;
  poolLength?: number;
  unitId?: number;
  deviceId?: number;
  locationName?: string;
}

interface GarminActivityDetails {
  activityId: number;
  measurementCount: number;
  metricsCount: number;
  geoPolylineDTO?: {
    startPoint: {
      lat: number;
      lon: number;
      altitude: number;
      time: number;
    };
    endPoint: {
      lat: number;
      lon: number;
      altitude: number;
      time: number;
    };
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    polyline: Array<{
      lat: number;
      lon: number;
      altitude?: number;
      time?: number;
    }>;
  };
  heartRateZones?: Array<{
    zoneNumber: number;
    zoneLowBoundary: number;
    zoneHighBoundary: number;
    secsInZone: number;
  }>;
  laps?: Array<{
    lapIndex: number;
    startTime: string;
    duration: number;
    distance?: number;
    averageHR?: number;
    maxHR?: number;
    averageSpeed?: number;
    calories?: number;
  }>;
}

interface GarminSleepData {
  dailySleepDTO: {
    id: number;
    userProfilePK: number;
    calendarDate: string;
    sleepTimeSeconds: number;
    napTimeSeconds: number;
    confirmedSleepSeconds: number;
    unmeasurableSleepSeconds?: number;
    deepSleepSeconds: number;
    lightSleepSeconds: number;
    remSleepSeconds: number;
    awakeSleepSeconds: number;
    deviceRemCapable: boolean;
    avgSleepStress?: number;
    restingHeartRate?: number;
    sleepScores?: {
      totalScore: number;
      qualityScore: number;
      durationScore: number;
      recoveryScore: number;
      restfulnessScore: number;
    };
  };
  sleepMovement?: Array<{
    startGMT: string;
    endGMT: string;
    activityLevel: number;
  }>;
}

interface GarminDailySummary {
  userProfilePK: number;
  calendarDate: string;
  totalSteps?: number;
  totalDistanceMeters?: number;
  activeKilocalories?: number;
  bmrKilocalories?: number;
  restingHeartRate?: number;
  minHeartRate?: number;
  maxHeartRate?: number;
  averageStressLevel?: number;
  maxStressLevel?: number;
  stressDuration?: number;
  restStressDuration?: number;
  activityStressDuration?: number;
  lowStressDuration?: number;
  mediumStressDuration?: number;
  highStressDuration?: number;
  bodyBatteryChargedValue?: number;
  bodyBatteryDrainedValue?: number;
  bodyBatteryHighestValue?: number;
  bodyBatteryLowestValue?: number;
}

// =============================================================================
// Garmin Provider Implementation
// =============================================================================

export class GarminProvider
  extends OAuth1WellnessProvider<GarminConfig>
  implements SyncCapableProvider
{
  constructor(config: Partial<GarminConfig> = {}) {
    super({ ...DEFAULT_GARMIN_CONFIG, ...config });
  }

  get name(): WearableSource {
    return 'garmin';
  }

  get displayName(): string {
    return 'Garmin Connect';
  }

  /**
   * Get request token for OAuth 1.0a flow
   */
  async getRequestToken(callbackUrl: string): Promise<ProviderResult<OAuth1TokenResponse>> {
    try {
      const authHeader = this.generateOAuthHeader('POST', `${this.config.baseUrl}/oauth/request_token`, {
        oauth_callback: callbackUrl,
      });

      const response = await fetch(`${this.config.baseUrl}/oauth/request_token`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to get request token: ${response.status}`,
        };
      }

      const text = await response.text();
      const params = new URLSearchParams(text);

      return {
        success: true,
        data: {
          oauthToken: params.get('oauth_token') ?? '',
          oauthTokenSecret: params.get('oauth_token_secret') ?? '',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get authorization URL with request token
   */
  getAuthorizationUrl(oauthToken: string): string {
    return `${this.config.baseUrl}/oauth/authorize?oauth_token=${oauthToken}`;
  }

  /**
   * Exchange verifier for access token
   */
  async exchangeVerifier(
    oauthToken: string,
    oauthTokenSecret: string,
    oauthVerifier: string
  ): Promise<ProviderResult<OAuth1TokenResponse>> {
    try {
      this.setTokens(oauthToken, oauthTokenSecret);

      const authHeader = this.generateOAuthHeader('POST', `${this.config.baseUrl}/oauth/access_token`, {
        oauth_verifier: oauthVerifier,
      });

      const response = await fetch(`${this.config.baseUrl}/oauth/access_token`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to exchange verifier: ${response.status}`,
        };
      }

      const text = await response.text();
      const params = new URLSearchParams(text);

      return {
        success: true,
        data: {
          oauthToken: params.get('oauth_token') ?? '',
          oauthTokenSecret: params.get('oauth_token_secret') ?? '',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Sync recovery data (body battery + stress)
   */
  async syncRecovery(userId: string, since?: number): Promise<SyncResult> {
    const syncedAt = Date.now();
    let recordsCreated = 0;
    let recordsUpdated = 0;

    try {
      const startDate = since
        ? new Date(since).toISOString().split('T')[0]
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];

      const result = await this.authenticatedFetch<GarminDailySummary[]>(
        `${this.config.baseUrl}/wellness-api/rest/dailies?calendarDate=${startDate}&endDate=${endDate}`
      );

      if (!result.success || !result.data) {
        return {
          provider: 'garmin',
          success: false,
          recordsCreated: 0,
          recordsUpdated: 0,
          error: result.error,
          syncedAt,
        };
      }

      for (const summary of result.data) {
        // Calculate recovery score from body battery and stress
        const recoveryScore = this.calculateRecoveryScore(summary);

        const recoveryData: Omit<RecoveryData, 'id' | 'createdAt'> = {
          userId,
          source: 'garmin',
          date: new Date(summary.calendarDate).getTime(),
          recoveryScore,
          restingHeartRate: summary.restingHeartRate,
          rawData: summary as unknown as Record<string, unknown>,
          syncedAt,
        };

        this.emit('recovery:data', { userId, data: recoveryData });
        recordsCreated++;
      }

      return {
        provider: 'garmin',
        success: true,
        recordsCreated,
        recordsUpdated,
        syncedAt,
      };
    } catch (error) {
      return {
        provider: 'garmin',
        success: false,
        recordsCreated,
        recordsUpdated,
        error: error instanceof Error ? error.message : String(error),
        syncedAt,
      };
    }
  }

  /**
   * Sync strain data (daily activity summary)
   */
  async syncStrain(userId: string, since?: number): Promise<SyncResult> {
    const syncedAt = Date.now();
    let recordsCreated = 0;
    let recordsUpdated = 0;

    try {
      const startDate = since
        ? new Date(since).toISOString().split('T')[0]
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];

      const result = await this.authenticatedFetch<GarminDailySummary[]>(
        `${this.config.baseUrl}/wellness-api/rest/dailies?calendarDate=${startDate}&endDate=${endDate}`
      );

      if (!result.success || !result.data) {
        return {
          provider: 'garmin',
          success: false,
          recordsCreated: 0,
          recordsUpdated: 0,
          error: result.error,
          syncedAt,
        };
      }

      for (const summary of result.data) {
        // Calculate strain from stress and activity
        const strainScore = this.calculateStrainScore(summary);

        const strainData: Omit<StrainData, 'id' | 'createdAt'> = {
          userId,
          source: 'garmin',
          date: new Date(summary.calendarDate).getTime(),
          strainScore,
          calories: (summary.activeKilocalories ?? 0) + (summary.bmrKilocalories ?? 0),
          maxHeartRate: summary.maxHeartRate,
          activities: [],
          rawData: summary as unknown as Record<string, unknown>,
          syncedAt,
        };

        this.emit('strain:data', { userId, data: strainData });
        recordsCreated++;
      }

      return {
        provider: 'garmin',
        success: true,
        recordsCreated,
        recordsUpdated,
        syncedAt,
      };
    } catch (error) {
      return {
        provider: 'garmin',
        success: false,
        recordsCreated,
        recordsUpdated,
        error: error instanceof Error ? error.message : String(error),
        syncedAt,
      };
    }
  }

  /**
   * Sync sleep data
   */
  async syncSleep(userId: string, since?: number): Promise<SyncResult> {
    const syncedAt = Date.now();
    let recordsCreated = 0;
    let recordsUpdated = 0;

    try {
      const startDate = since
        ? new Date(since).toISOString().split('T')[0]
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];

      const result = await this.authenticatedFetch<GarminSleepData[]>(
        `${this.config.baseUrl}/wellness-api/rest/sleep?calendarDate=${startDate}&endDate=${endDate}`
      );

      if (!result.success || !result.data) {
        return {
          provider: 'garmin',
          success: false,
          recordsCreated: 0,
          recordsUpdated: 0,
          error: result.error,
          syncedAt,
        };
      }

      for (const sleepData of result.data) {
        const sleep = sleepData.dailySleepDTO;

        const sleepRecord: Omit<SleepRecord, 'id' | 'createdAt'> = {
          userId,
          source: 'garmin',
          date: new Date(sleep.calendarDate).getTime(),
          bedtime: new Date(sleep.calendarDate).getTime(), // Approximate
          wakeTime:
            new Date(sleep.calendarDate).getTime() + sleep.sleepTimeSeconds * 1000,
          totalSleepMinutes: Math.round(sleep.confirmedSleepSeconds / 60),
          remMinutes: Math.round(sleep.remSleepSeconds / 60),
          deepMinutes: Math.round(sleep.deepSleepSeconds / 60),
          lightMinutes: Math.round(sleep.lightSleepSeconds / 60),
          awakeMinutes: Math.round(sleep.awakeSleepSeconds / 60),
          sleepScore: sleep.sleepScores?.totalScore,
          rawData: sleepData as unknown as Record<string, unknown>,
          syncedAt,
        };

        this.emit('sleep:data', { userId, data: sleepRecord });
        recordsCreated++;
      }

      return {
        provider: 'garmin',
        success: true,
        recordsCreated,
        recordsUpdated,
        syncedAt,
      };
    } catch (error) {
      return {
        provider: 'garmin',
        success: false,
        recordsCreated,
        recordsUpdated,
        error: error instanceof Error ? error.message : String(error),
        syncedAt,
      };
    }
  }

  /**
   * Sync activities
   */
  async syncActivities(userId: string, since?: number): Promise<SyncResult> {
    const syncedAt = Date.now();
    let recordsCreated = 0;
    let recordsUpdated = 0;

    try {
      const startDate = since ?? Date.now() - 7 * 24 * 60 * 60 * 1000;

      const result = await this.authenticatedFetch<GarminActivity[]>(
        `${this.config.baseUrl}/activity-service/activity-api/activities?start=${startDate}&limit=50`
      );

      if (!result.success || !result.data) {
        return {
          provider: 'garmin',
          success: false,
          recordsCreated: 0,
          recordsUpdated: 0,
          error: result.error,
          syncedAt,
        };
      }

      for (const garminActivity of result.data) {
        // Get activity details for GPS and laps
        let details: GarminActivityDetails | undefined;
        if (this.config.includeGPSData) {
          const detailsResult = await this.authenticatedFetch<GarminActivityDetails>(
            `${this.config.baseUrl}/activity-service/activity-api/activities/${garminActivity.activityId}/details`
          );
          if (detailsResult.success && detailsResult.data) {
            details = detailsResult.data;
          }
        }

        const activity: Omit<Activity, 'id' | 'createdAt'> = {
          userId,
          source: 'garmin',
          externalId: garminActivity.activityId.toString(),
          activityType: this.mapActivityType(garminActivity.activityType.typeKey),
          name: garminActivity.activityName,
          startTime: new Date(garminActivity.startTimeGMT).getTime(),
          endTime:
            new Date(garminActivity.startTimeGMT).getTime() +
            garminActivity.duration * 1000,
          durationMinutes: Math.round(garminActivity.duration / 60),
          distance: garminActivity.distance,
          distanceUnit: 'm',
          calories: garminActivity.calories,
          avgHeartRate: garminActivity.averageHR,
          maxHeartRate: garminActivity.maxHR,
          avgPace: garminActivity.averageSpeed
            ? 1000 / garminActivity.averageSpeed / 60
            : undefined, // min/km
          elevationGain: garminActivity.elevationGain,
          steps: garminActivity.steps,
          gpsTrack: this.parseGPSTrack(details),
          laps: this.parseLaps(details),
          zones: this.parseZones(details),
          rawData: garminActivity as unknown as Record<string, unknown>,
          syncedAt,
        };

        this.emit('activity:data', { userId, data: activity });
        recordsCreated++;
      }

      return {
        provider: 'garmin',
        success: true,
        recordsCreated,
        recordsUpdated,
        syncedAt,
      };
    } catch (error) {
      return {
        provider: 'garmin',
        success: false,
        recordsCreated,
        recordsUpdated,
        error: error instanceof Error ? error.message : String(error),
        syncedAt,
      };
    }
  }

  /**
   * Full sync
   */
  async syncAll(userId: string, since?: number): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    results.push(await this.syncRecovery(userId, since));
    results.push(await this.syncStrain(userId, since));
    results.push(await this.syncSleep(userId, since));
    results.push(await this.syncActivities(userId, since));

    return results;
  }

  /**
   * Calculate recovery score from Garmin data
   */
  private calculateRecoveryScore(summary: GarminDailySummary): number {
    // Use body battery as primary indicator
    if (summary.bodyBatteryHighestValue !== undefined) {
      return summary.bodyBatteryHighestValue;
    }

    // Fallback: Calculate from stress levels
    if (summary.averageStressLevel !== undefined) {
      // Lower stress = higher recovery
      return Math.max(0, 100 - summary.averageStressLevel);
    }

    return 50; // Default
  }

  /**
   * Calculate strain score from Garmin data
   */
  private calculateStrainScore(summary: GarminDailySummary): number {
    // Calculate strain on 0-21 scale (WHOOP-compatible)
    let strain = 0;

    // Factor in active calories
    if (summary.activeKilocalories) {
      strain += Math.min(summary.activeKilocalories / 200, 7);
    }

    // Factor in stress duration
    if (summary.activityStressDuration) {
      strain += Math.min(summary.activityStressDuration / 3600, 7);
    }

    // Factor in high stress duration
    if (summary.highStressDuration) {
      strain += Math.min(summary.highStressDuration / 1800, 7);
    }

    return Math.min(strain, 21);
  }

  /**
   * Map Garmin activity type to standard ActivityType
   */
  private mapActivityType(typeKey: string): ActivityType {
    const typeMap: Record<string, ActivityType> = {
      running: 'running',
      cycling: 'cycling',
      swimming: 'swimming',
      walking: 'walking',
      hiking: 'hiking',
      strength_training: 'strength_training',
      yoga: 'yoga',
      rowing: 'rowing',
      elliptical: 'elliptical',
      indoor_cycling: 'cycling',
      trail_running: 'running',
      open_water_swimming: 'swimming',
      pool_swimming: 'swimming',
      treadmill_running: 'running',
    };

    return typeMap[typeKey.toLowerCase()] ?? 'other';
  }

  /**
   * Parse GPS track from activity details
   */
  private parseGPSTrack(details?: GarminActivityDetails): GPSPoint[] | undefined {
    if (!details?.geoPolylineDTO?.polyline) {
      return undefined;
    }

    const maxPoints = this.config.maxGPSPointsPerActivity;
    const polyline = details.geoPolylineDTO.polyline;

    // Downsample if too many points
    const step = Math.ceil(polyline.length / maxPoints);

    return polyline
      .filter((_, i) => i % step === 0)
      .map((point) => ({
        lat: point.lat,
        lng: point.lon,
        elevation: point.altitude,
        timestamp: point.time ?? 0,
      }));
  }

  /**
   * Parse laps from activity details
   */
  private parseLaps(details?: GarminActivityDetails): ActivityLap[] | undefined {
    if (!details?.laps) {
      return undefined;
    }

    return details.laps.map((lap) => ({
      lapNumber: lap.lapIndex,
      startTime: new Date(lap.startTime).getTime(),
      endTime: new Date(lap.startTime).getTime() + lap.duration * 1000,
      distance: lap.distance,
      duration: lap.duration,
      avgHeartRate: lap.averageHR,
      maxHeartRate: lap.maxHR,
      avgPace: lap.averageSpeed ? 1000 / lap.averageSpeed / 60 : undefined,
      calories: lap.calories,
    }));
  }

  /**
   * Parse heart rate zones from activity details
   */
  private parseZones(details?: GarminActivityDetails): HeartRateZone[] | undefined {
    if (!details?.heartRateZones) {
      return undefined;
    }

    const totalSeconds = details.heartRateZones.reduce((sum, z) => sum + z.secsInZone, 0);

    return details.heartRateZones.map((zone) => ({
      zone: zone.zoneNumber,
      name: `Zone ${zone.zoneNumber}`,
      minHr: zone.zoneLowBoundary,
      maxHr: zone.zoneHighBoundary,
      durationSeconds: zone.secsInZone,
      percentage: totalSeconds > 0 ? (zone.secsInZone / totalSeconds) * 100 : 0,
    }));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createGarminProvider(config?: Partial<GarminConfig>): GarminProvider {
  return new GarminProvider(config);
}
