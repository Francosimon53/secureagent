/**
 * WHOOP Provider
 *
 * Integration with WHOOP v2 API for recovery, strain, and sleep data.
 * Uses OAuth 2.0 for authentication.
 */

import {
  OAuthWellnessProvider,
  type OAuthProviderConfig,
  type ProviderResult,
  type TokenResponse,
  type SyncCapableProvider,
} from './base.js';
import type {
  WearableSource,
  RecoveryData,
  StrainData,
  SleepRecord,
  Activity,
  StrainActivity,
  SyncResult,
} from '../types.js';

// =============================================================================
// WHOOP Configuration
// =============================================================================

export interface WhoopConfig extends OAuthProviderConfig {
  syncIntervalMinutes: number;
  lowRecoveryThreshold: number;
  highStrainThreshold: number;
  scopes: string[];
}

const DEFAULT_WHOOP_CONFIG: WhoopConfig = {
  enabled: true,
  clientIdEnvVar: 'WHOOP_CLIENT_ID',
  clientSecretEnvVar: 'WHOOP_CLIENT_SECRET',
  baseUrl: 'https://api.prod.whoop.com',
  syncIntervalMinutes: 60,
  lowRecoveryThreshold: 33,
  highStrainThreshold: 18,
  scopes: [
    'read:recovery',
    'read:cycles',
    'read:sleep',
    'read:workout',
    'read:profile',
    'read:body_measurement',
  ],
};

// =============================================================================
// WHOOP API Response Types
// =============================================================================

interface WhoopCycle {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  score_state: string;
  score?: {
    strain: number;
    kilojoule: number;
    average_heart_rate: number;
    max_heart_rate: number;
  };
}

interface WhoopRecovery {
  cycle_id: number;
  sleep_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: string;
  score?: {
    user_calibrating: boolean;
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  };
}

interface WhoopSleep {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: string;
  score?: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_no_data_time_milli: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
      sleep_cycle_count: number;
      disturbance_count: number;
    };
    sleep_needed: {
      baseline_milli: number;
      need_from_sleep_debt_milli: number;
      need_from_recent_strain_milli: number;
      need_from_recent_nap_milli: number;
    };
    respiratory_rate?: number;
    sleep_performance_percentage: number;
    sleep_consistency_percentage?: number;
    sleep_efficiency_percentage: number;
  };
}

interface WhoopWorkout {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_id: number;
  score_state: string;
  score?: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    percent_recorded: number;
    distance_meter?: number;
    altitude_gain_meter?: number;
    altitude_change_meter?: number;
    zone_duration: {
      zone_zero_milli: number;
      zone_one_milli: number;
      zone_two_milli: number;
      zone_three_milli: number;
      zone_four_milli: number;
      zone_five_milli: number;
    };
  };
}

interface WhoopPaginatedResponse<T> {
  records: T[];
  next_token?: string;
}

// =============================================================================
// WHOOP Provider Implementation
// =============================================================================

export class WhoopProvider
  extends OAuthWellnessProvider<WhoopConfig>
  implements SyncCapableProvider
{
  constructor(config: Partial<WhoopConfig> = {}) {
    super({ ...DEFAULT_WHOOP_CONFIG, ...config });
  }

  get name(): WearableSource {
    return 'whoop';
  }

  get displayName(): string {
    return 'WHOOP';
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthorizationUrl(redirectUri: string, state: string): string {
    const clientId = this.getClientId();
    const scopes = this.config.scopes.join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      state,
    });

    return `${this.config.baseUrl}/oauth/oauth2/auth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string, redirectUri: string): Promise<ProviderResult<TokenResponse>> {
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const result = await this.fetch<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
      scope: string;
    }>(`${this.config.baseUrl}/oauth/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        accessToken: result.data.access_token,
        refreshToken: result.data.refresh_token,
        expiresIn: result.data.expires_in,
        tokenType: result.data.token_type,
        scope: result.data.scope,
      },
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<ProviderResult<TokenResponse>> {
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const result = await this.fetch<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
      scope: string;
    }>(`${this.config.baseUrl}/oauth/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        accessToken: result.data.access_token,
        refreshToken: result.data.refresh_token,
        expiresIn: result.data.expires_in,
        tokenType: result.data.token_type,
        scope: result.data.scope,
      },
    };
  }

  /**
   * Sync recovery data
   */
  async syncRecovery(userId: string, since?: number): Promise<SyncResult> {
    const syncedAt = Date.now();
    let recordsCreated = 0;
    let recordsUpdated = 0;

    try {
      const params = new URLSearchParams({ limit: '25' });
      if (since) {
        params.set('start', new Date(since).toISOString());
      }

      const result = await this.authenticatedFetch<WhoopPaginatedResponse<WhoopRecovery>>(
        `${this.config.baseUrl}/developer/v1/recovery?${params.toString()}`
      );

      if (!result.success || !result.data) {
        return {
          provider: 'whoop',
          success: false,
          recordsCreated: 0,
          recordsUpdated: 0,
          error: result.error,
          syncedAt,
        };
      }

      // Emit recovery data for processing
      for (const recovery of result.data.records) {
        if (!recovery.score) continue;

        const recoveryData: Omit<RecoveryData, 'id' | 'createdAt'> = {
          userId,
          source: 'whoop',
          date: this.parseDate(recovery.created_at),
          recoveryScore: recovery.score.recovery_score,
          hrvRmssd: recovery.score.hrv_rmssd_milli / 1000, // Convert to ms
          restingHeartRate: recovery.score.resting_heart_rate,
          spo2: recovery.score.spo2_percentage,
          skinTemperature: recovery.score.skin_temp_celsius,
          rawData: recovery as unknown as Record<string, unknown>,
          syncedAt,
        };

        this.emit('recovery:data', { userId, data: recoveryData });
        recordsCreated++;

        // Check for low recovery alert
        if (recovery.score.recovery_score <= this.config.lowRecoveryThreshold) {
          this.emit('recovery:low', {
            userId,
            recoveryScore: recovery.score.recovery_score,
            threshold: this.config.lowRecoveryThreshold,
          });
        }
      }

      return {
        provider: 'whoop',
        success: true,
        recordsCreated,
        recordsUpdated,
        syncedAt,
      };
    } catch (error) {
      return {
        provider: 'whoop',
        success: false,
        recordsCreated,
        recordsUpdated,
        error: error instanceof Error ? error.message : String(error),
        syncedAt,
      };
    }
  }

  /**
   * Sync strain data
   */
  async syncStrain(userId: string, since?: number): Promise<SyncResult> {
    const syncedAt = Date.now();
    let recordsCreated = 0;
    let recordsUpdated = 0;

    try {
      const params = new URLSearchParams({ limit: '25' });
      if (since) {
        params.set('start', new Date(since).toISOString());
      }

      const result = await this.authenticatedFetch<WhoopPaginatedResponse<WhoopCycle>>(
        `${this.config.baseUrl}/developer/v1/cycle?${params.toString()}`
      );

      if (!result.success || !result.data) {
        return {
          provider: 'whoop',
          success: false,
          recordsCreated: 0,
          recordsUpdated: 0,
          error: result.error,
          syncedAt,
        };
      }

      for (const cycle of result.data.records) {
        if (!cycle.score) continue;

        const strainData: Omit<StrainData, 'id' | 'createdAt'> = {
          userId,
          source: 'whoop',
          date: this.parseDate(cycle.start),
          strainScore: cycle.score.strain,
          calories: cycle.score.kilojoule * 0.239006, // Convert kJ to kcal
          avgHeartRate: cycle.score.average_heart_rate,
          maxHeartRate: cycle.score.max_heart_rate,
          activities: [],
          rawData: cycle as unknown as Record<string, unknown>,
          syncedAt,
        };

        this.emit('strain:data', { userId, data: strainData });
        recordsCreated++;

        // Check for high strain alert
        if (cycle.score.strain >= this.config.highStrainThreshold) {
          this.emit('strain:high', {
            userId,
            strainScore: cycle.score.strain,
            threshold: this.config.highStrainThreshold,
          });
        }
      }

      return {
        provider: 'whoop',
        success: true,
        recordsCreated,
        recordsUpdated,
        syncedAt,
      };
    } catch (error) {
      return {
        provider: 'whoop',
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
      const params = new URLSearchParams({ limit: '25' });
      if (since) {
        params.set('start', new Date(since).toISOString());
      }

      const result = await this.authenticatedFetch<WhoopPaginatedResponse<WhoopSleep>>(
        `${this.config.baseUrl}/developer/v1/activity/sleep?${params.toString()}`
      );

      if (!result.success || !result.data) {
        return {
          provider: 'whoop',
          success: false,
          recordsCreated: 0,
          recordsUpdated: 0,
          error: result.error,
          syncedAt,
        };
      }

      for (const sleep of result.data.records) {
        if (!sleep.score || sleep.nap) continue; // Skip naps

        const sleepRecord: Omit<SleepRecord, 'id' | 'createdAt'> = {
          userId,
          source: 'whoop',
          date: this.parseDate(sleep.start),
          bedtime: this.parseDate(sleep.start),
          wakeTime: this.parseDate(sleep.end),
          totalSleepMinutes: Math.round(
            (sleep.score.stage_summary.total_in_bed_time_milli -
              sleep.score.stage_summary.total_awake_time_milli) /
              60000
          ),
          remMinutes: Math.round(sleep.score.stage_summary.total_rem_sleep_time_milli / 60000),
          deepMinutes: Math.round(
            sleep.score.stage_summary.total_slow_wave_sleep_time_milli / 60000
          ),
          lightMinutes: Math.round(
            sleep.score.stage_summary.total_light_sleep_time_milli / 60000
          ),
          awakeMinutes: Math.round(sleep.score.stage_summary.total_awake_time_milli / 60000),
          sleepEfficiency: sleep.score.sleep_efficiency_percentage,
          sleepScore: sleep.score.sleep_performance_percentage,
          sleepNeed: Math.round(
            (sleep.score.sleep_needed.baseline_milli +
              sleep.score.sleep_needed.need_from_sleep_debt_milli +
              sleep.score.sleep_needed.need_from_recent_strain_milli) /
              60000
          ),
          disturbances: sleep.score.stage_summary.disturbance_count,
          respiratoryRate: sleep.score.respiratory_rate,
          rawData: sleep as unknown as Record<string, unknown>,
          syncedAt,
        };

        this.emit('sleep:data', { userId, data: sleepRecord });
        recordsCreated++;
      }

      return {
        provider: 'whoop',
        success: true,
        recordsCreated,
        recordsUpdated,
        syncedAt,
      };
    } catch (error) {
      return {
        provider: 'whoop',
        success: false,
        recordsCreated,
        recordsUpdated,
        error: error instanceof Error ? error.message : String(error),
        syncedAt,
      };
    }
  }

  /**
   * Sync activities (workouts)
   */
  async syncActivities(userId: string, since?: number): Promise<SyncResult> {
    const syncedAt = Date.now();
    let recordsCreated = 0;
    let recordsUpdated = 0;

    try {
      const params = new URLSearchParams({ limit: '25' });
      if (since) {
        params.set('start', new Date(since).toISOString());
      }

      const result = await this.authenticatedFetch<WhoopPaginatedResponse<WhoopWorkout>>(
        `${this.config.baseUrl}/developer/v1/activity/workout?${params.toString()}`
      );

      if (!result.success || !result.data) {
        return {
          provider: 'whoop',
          success: false,
          recordsCreated: 0,
          recordsUpdated: 0,
          error: result.error,
          syncedAt,
        };
      }

      for (const workout of result.data.records) {
        if (!workout.score) continue;

        const activity: Omit<Activity, 'id' | 'createdAt'> = {
          userId,
          source: 'whoop',
          externalId: workout.id.toString(),
          activityType: this.mapSportId(workout.sport_id),
          name: this.getSportName(workout.sport_id),
          startTime: this.parseDate(workout.start),
          endTime: this.parseDate(workout.end),
          durationMinutes: Math.round(
            (this.parseDate(workout.end) - this.parseDate(workout.start)) / 60000
          ),
          distance: workout.score.distance_meter,
          distanceUnit: 'm',
          calories: workout.score.kilojoule * 0.239006,
          avgHeartRate: workout.score.average_heart_rate,
          maxHeartRate: workout.score.max_heart_rate,
          elevationGain: workout.score.altitude_gain_meter,
          zones: this.parseZones(workout.score.zone_duration),
          rawData: workout as unknown as Record<string, unknown>,
          syncedAt,
        };

        this.emit('activity:data', { userId, data: activity });
        recordsCreated++;
      }

      return {
        provider: 'whoop',
        success: true,
        recordsCreated,
        recordsUpdated,
        syncedAt,
      };
    } catch (error) {
      return {
        provider: 'whoop',
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
   * Parse ISO date string to timestamp
   */
  private parseDate(dateStr: string): number {
    return new Date(dateStr).getTime();
  }

  /**
   * Map WHOOP sport ID to ActivityType
   */
  private mapSportId(sportId: number): Activity['activityType'] {
    const sportMap: Record<number, Activity['activityType']> = {
      0: 'running',
      1: 'cycling',
      33: 'swimming',
      43: 'walking',
      52: 'hiking',
      48: 'strength_training',
      63: 'yoga',
      71: 'crossfit',
      27: 'rowing',
      16: 'elliptical',
    };
    return sportMap[sportId] ?? 'other';
  }

  /**
   * Get sport name from ID
   */
  private getSportName(sportId: number): string {
    const sportNames: Record<number, string> = {
      0: 'Running',
      1: 'Cycling',
      33: 'Swimming',
      43: 'Walking',
      52: 'Hiking',
      48: 'Functional Fitness',
      63: 'Yoga',
      71: 'CrossFit',
      27: 'Rowing',
      16: 'Elliptical',
    };
    return sportNames[sportId] ?? 'Workout';
  }

  /**
   * Parse zone durations to HeartRateZone array
   */
  private parseZones(
    zones: NonNullable<WhoopWorkout['score']>['zone_duration']
  ): Activity['zones'] {
    return [
      {
        zone: 0,
        name: 'Rest',
        minHr: 0,
        maxHr: 0,
        durationSeconds: Math.round(zones.zone_zero_milli / 1000),
        percentage: 0,
      },
      {
        zone: 1,
        name: 'Light',
        minHr: 0,
        maxHr: 0,
        durationSeconds: Math.round(zones.zone_one_milli / 1000),
        percentage: 0,
      },
      {
        zone: 2,
        name: 'Moderate',
        minHr: 0,
        maxHr: 0,
        durationSeconds: Math.round(zones.zone_two_milli / 1000),
        percentage: 0,
      },
      {
        zone: 3,
        name: 'Hard',
        minHr: 0,
        maxHr: 0,
        durationSeconds: Math.round(zones.zone_three_milli / 1000),
        percentage: 0,
      },
      {
        zone: 4,
        name: 'Very Hard',
        minHr: 0,
        maxHr: 0,
        durationSeconds: Math.round(zones.zone_four_milli / 1000),
        percentage: 0,
      },
      {
        zone: 5,
        name: 'Max',
        minHr: 0,
        maxHr: 0,
        durationSeconds: Math.round(zones.zone_five_milli / 1000),
        percentage: 0,
      },
    ];
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createWhoopProvider(config?: Partial<WhoopConfig>): WhoopProvider {
  return new WhoopProvider(config);
}
