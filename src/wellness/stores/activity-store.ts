/**
 * Activity Store
 *
 * Storage for activities and exercises with support for:
 * - Activity CRUD operations
 * - GPS track storage
 * - Heart rate zones
 * - Lap data
 * - Both in-memory and database implementations
 */

import type { DatabaseAdapter } from '../../persistence/index.js';
import type {
  Activity,
  ActivityType,
  GPSPoint,
  ActivityLap,
  HeartRateZone,
  WearableSource,
  ActivityQueryOptions,
} from '../types.js';

// =============================================================================
// Activity Store Interface
// =============================================================================

export interface ActivityStore {
  initialize(): Promise<void>;

  // Activity Operations
  createActivity(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity>;
  getActivity(id: string): Promise<Activity | null>;
  getActivityByExternalId(userId: string, source: WearableSource, externalId: string): Promise<Activity | null>;
  updateActivity(id: string, updates: Partial<Activity>): Promise<Activity | null>;
  deleteActivity(id: string): Promise<boolean>;
  listActivities(userId: string, options?: ActivityQueryOptions): Promise<Activity[]>;
  countActivities(userId: string, options?: ActivityQueryOptions): Promise<number>;

  // Specialized Queries
  getLatestActivity(userId: string, activityType?: ActivityType): Promise<Activity | null>;
  getActivitiesByDateRange(
    userId: string,
    startDate: number,
    endDate: number,
    options?: ActivityQueryOptions
  ): Promise<Activity[]>;
  getActivitiesWithGPS(userId: string, limit?: number): Promise<Activity[]>;
  getActivityStats(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<{
    totalActivities: number;
    totalDurationMinutes: number;
    totalCalories: number;
    totalDistance: number;
    byType: Record<ActivityType, number>;
  }>;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseActivityStore implements ActivityStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source TEXT NOT NULL,
        external_id TEXT,
        activity_type TEXT NOT NULL,
        name TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        duration_minutes INTEGER NOT NULL,
        distance REAL,
        distance_unit TEXT,
        calories REAL,
        avg_heart_rate REAL,
        max_heart_rate REAL,
        avg_pace REAL,
        elevation_gain REAL,
        steps INTEGER,
        gps_track TEXT,
        laps TEXT,
        zones TEXT,
        raw_data TEXT,
        synced_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, source, external_id)
      )
    `);
    await this.db.query(
      'CREATE INDEX IF NOT EXISTS idx_activities_user_date ON activities(user_id, start_time)'
    );
    await this.db.query(
      'CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(activity_type)'
    );
  }

  async createActivity(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity> {
    const id = crypto.randomUUID();
    const now = Date.now();

    // Check for existing by external ID
    if (activity.externalId) {
      const existing = await this.getActivityByExternalId(
        activity.userId,
        activity.source,
        activity.externalId
      );
      if (existing) {
        // Update existing
        const updated = await this.updateActivity(existing.id, activity);
        return updated!;
      }
    }

    await this.db.query(
      `INSERT INTO activities (
        id, user_id, source, external_id, activity_type, name, start_time, end_time,
        duration_minutes, distance, distance_unit, calories, avg_heart_rate, max_heart_rate,
        avg_pace, elevation_gain, steps, gps_track, laps, zones, raw_data, synced_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        activity.userId,
        activity.source,
        activity.externalId ?? null,
        activity.activityType,
        activity.name,
        activity.startTime,
        activity.endTime,
        activity.durationMinutes,
        activity.distance ?? null,
        activity.distanceUnit ?? null,
        activity.calories ?? null,
        activity.avgHeartRate ?? null,
        activity.maxHeartRate ?? null,
        activity.avgPace ?? null,
        activity.elevationGain ?? null,
        activity.steps ?? null,
        activity.gpsTrack ? JSON.stringify(activity.gpsTrack) : null,
        activity.laps ? JSON.stringify(activity.laps) : null,
        activity.zones ? JSON.stringify(activity.zones) : null,
        activity.rawData ? JSON.stringify(activity.rawData) : null,
        activity.syncedAt,
        now,
      ]
    );

    return { ...activity, id, createdAt: now };
  }

  async getActivity(id: string): Promise<Activity | null> {
    const result = await this.db.query<ActivityRow>('SELECT * FROM activities WHERE id = ?', [id]);
    return result.rows[0] ? this.mapActivityRow(result.rows[0]) : null;
  }

  async getActivityByExternalId(
    userId: string,
    source: WearableSource,
    externalId: string
  ): Promise<Activity | null> {
    const result = await this.db.query<ActivityRow>(
      'SELECT * FROM activities WHERE user_id = ? AND source = ? AND external_id = ?',
      [userId, source, externalId]
    );
    return result.rows[0] ? this.mapActivityRow(result.rows[0]) : null;
  }

  async updateActivity(id: string, updates: Partial<Activity>): Promise<Activity | null> {
    const existing = await this.getActivity(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.activityType !== undefined) {
      fields.push('activity_type = ?');
      values.push(updates.activityType);
    }
    if (updates.startTime !== undefined) {
      fields.push('start_time = ?');
      values.push(updates.startTime);
    }
    if (updates.endTime !== undefined) {
      fields.push('end_time = ?');
      values.push(updates.endTime);
    }
    if (updates.durationMinutes !== undefined) {
      fields.push('duration_minutes = ?');
      values.push(updates.durationMinutes);
    }
    if (updates.distance !== undefined) {
      fields.push('distance = ?');
      values.push(updates.distance);
    }
    if (updates.distanceUnit !== undefined) {
      fields.push('distance_unit = ?');
      values.push(updates.distanceUnit);
    }
    if (updates.calories !== undefined) {
      fields.push('calories = ?');
      values.push(updates.calories);
    }
    if (updates.avgHeartRate !== undefined) {
      fields.push('avg_heart_rate = ?');
      values.push(updates.avgHeartRate);
    }
    if (updates.maxHeartRate !== undefined) {
      fields.push('max_heart_rate = ?');
      values.push(updates.maxHeartRate);
    }
    if (updates.avgPace !== undefined) {
      fields.push('avg_pace = ?');
      values.push(updates.avgPace);
    }
    if (updates.elevationGain !== undefined) {
      fields.push('elevation_gain = ?');
      values.push(updates.elevationGain);
    }
    if (updates.steps !== undefined) {
      fields.push('steps = ?');
      values.push(updates.steps);
    }
    if (updates.gpsTrack !== undefined) {
      fields.push('gps_track = ?');
      values.push(JSON.stringify(updates.gpsTrack));
    }
    if (updates.laps !== undefined) {
      fields.push('laps = ?');
      values.push(JSON.stringify(updates.laps));
    }
    if (updates.zones !== undefined) {
      fields.push('zones = ?');
      values.push(JSON.stringify(updates.zones));
    }
    if (updates.rawData !== undefined) {
      fields.push('raw_data = ?');
      values.push(JSON.stringify(updates.rawData));
    }
    if (updates.syncedAt !== undefined) {
      fields.push('synced_at = ?');
      values.push(updates.syncedAt);
    }

    if (fields.length === 0) return existing;

    values.push(id);
    await this.db.query(`UPDATE activities SET ${fields.join(', ')} WHERE id = ?`, values);

    return this.getActivity(id);
  }

  async deleteActivity(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM activities WHERE id = ?', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listActivities(userId: string, options: ActivityQueryOptions = {}): Promise<Activity[]> {
    const { conditions, values } = this.buildQuery(userId, options);
    const orderDir = options.orderDirection || 'desc';
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const result = await this.db.query<ActivityRow>(
      `SELECT * FROM activities WHERE ${conditions.join(' AND ')}
       ORDER BY start_time ${orderDir} LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return result.rows.map(this.mapActivityRow);
  }

  async countActivities(userId: string, options: ActivityQueryOptions = {}): Promise<number> {
    const { conditions, values } = this.buildQuery(userId, options);

    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM activities WHERE ${conditions.join(' AND ')}`,
      values
    );

    return result.rows[0]?.count ?? 0;
  }

  async getLatestActivity(userId: string, activityType?: ActivityType): Promise<Activity | null> {
    let query = 'SELECT * FROM activities WHERE user_id = ?';
    const params: unknown[] = [userId];

    if (activityType) {
      query += ' AND activity_type = ?';
      params.push(activityType);
    }

    query += ' ORDER BY start_time DESC LIMIT 1';

    const result = await this.db.query<ActivityRow>(query, params);
    return result.rows[0] ? this.mapActivityRow(result.rows[0]) : null;
  }

  async getActivitiesByDateRange(
    userId: string,
    startDate: number,
    endDate: number,
    options: ActivityQueryOptions = {}
  ): Promise<Activity[]> {
    return this.listActivities(userId, { ...options, startDate, endDate });
  }

  async getActivitiesWithGPS(userId: string, limit = 50): Promise<Activity[]> {
    const result = await this.db.query<ActivityRow>(
      `SELECT * FROM activities WHERE user_id = ? AND gps_track IS NOT NULL
       ORDER BY start_time DESC LIMIT ?`,
      [userId, limit]
    );
    return result.rows.map(this.mapActivityRow);
  }

  async getActivityStats(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<{
    totalActivities: number;
    totalDurationMinutes: number;
    totalCalories: number;
    totalDistance: number;
    byType: Record<ActivityType, number>;
  }> {
    const result = await this.db.query<{
      count: number;
      total_duration: number;
      total_calories: number;
      total_distance: number;
    }>(
      `SELECT
        COUNT(*) as count,
        SUM(duration_minutes) as total_duration,
        SUM(COALESCE(calories, 0)) as total_calories,
        SUM(COALESCE(distance, 0)) as total_distance
       FROM activities
       WHERE user_id = ? AND start_time >= ? AND start_time <= ?`,
      [userId, startDate, endDate]
    );

    const typeResult = await this.db.query<{ activity_type: string; count: number }>(
      `SELECT activity_type, COUNT(*) as count FROM activities
       WHERE user_id = ? AND start_time >= ? AND start_time <= ?
       GROUP BY activity_type`,
      [userId, startDate, endDate]
    );

    const byType: Record<string, number> = {};
    for (const row of typeResult.rows) {
      byType[row.activity_type] = row.count;
    }

    const stats = result.rows[0];
    return {
      totalActivities: stats?.count ?? 0,
      totalDurationMinutes: stats?.total_duration ?? 0,
      totalCalories: stats?.total_calories ?? 0,
      totalDistance: stats?.total_distance ?? 0,
      byType: byType as Record<ActivityType, number>,
    };
  }

  // Helper Methods

  private buildQuery(
    userId: string,
    options: ActivityQueryOptions
  ): { conditions: string[]; values: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const values: unknown[] = [userId];

    if (options.source) {
      conditions.push('source = ?');
      values.push(options.source);
    }
    if (options.activityType) {
      conditions.push('activity_type = ?');
      values.push(options.activityType);
    }
    if (options.startDate) {
      conditions.push('start_time >= ?');
      values.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push('start_time <= ?');
      values.push(options.endDate);
    }
    if (options.minDuration) {
      conditions.push('duration_minutes >= ?');
      values.push(options.minDuration);
    }
    if (options.maxDuration) {
      conditions.push('duration_minutes <= ?');
      values.push(options.maxDuration);
    }
    if (options.hasGPS) {
      conditions.push('gps_track IS NOT NULL');
    }

    return { conditions, values };
  }

  private mapActivityRow(row: ActivityRow): Activity {
    return {
      id: row.id,
      userId: row.user_id,
      source: row.source as WearableSource,
      externalId: row.external_id ?? undefined,
      activityType: row.activity_type as ActivityType,
      name: row.name,
      startTime: row.start_time,
      endTime: row.end_time,
      durationMinutes: row.duration_minutes,
      distance: row.distance ?? undefined,
      distanceUnit: row.distance_unit as Activity['distanceUnit'],
      calories: row.calories ?? undefined,
      avgHeartRate: row.avg_heart_rate ?? undefined,
      maxHeartRate: row.max_heart_rate ?? undefined,
      avgPace: row.avg_pace ?? undefined,
      elevationGain: row.elevation_gain ?? undefined,
      steps: row.steps ?? undefined,
      gpsTrack: row.gps_track ? JSON.parse(row.gps_track) : undefined,
      laps: row.laps ? JSON.parse(row.laps) : undefined,
      zones: row.zones ? JSON.parse(row.zones) : undefined,
      rawData: row.raw_data ? JSON.parse(row.raw_data) : undefined,
      syncedAt: row.synced_at,
      createdAt: row.created_at,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryActivityStore implements ActivityStore {
  private activities = new Map<string, Activity>();

  async initialize(): Promise<void> {
    // No-op
  }

  async createActivity(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity> {
    if (activity.externalId) {
      const existing = await this.getActivityByExternalId(
        activity.userId,
        activity.source,
        activity.externalId
      );
      if (existing) {
        const updated = await this.updateActivity(existing.id, activity);
        return updated!;
      }
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const newActivity: Activity = { ...activity, id, createdAt: now };
    this.activities.set(id, newActivity);
    return newActivity;
  }

  async getActivity(id: string): Promise<Activity | null> {
    return this.activities.get(id) ?? null;
  }

  async getActivityByExternalId(
    userId: string,
    source: WearableSource,
    externalId: string
  ): Promise<Activity | null> {
    return (
      Array.from(this.activities.values()).find(
        (a) => a.userId === userId && a.source === source && a.externalId === externalId
      ) ?? null
    );
  }

  async updateActivity(id: string, updates: Partial<Activity>): Promise<Activity | null> {
    const existing = this.activities.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id };
    this.activities.set(id, updated);
    return updated;
  }

  async deleteActivity(id: string): Promise<boolean> {
    return this.activities.delete(id);
  }

  async listActivities(userId: string, options: ActivityQueryOptions = {}): Promise<Activity[]> {
    let results = Array.from(this.activities.values()).filter((a) => a.userId === userId);

    if (options.source) results = results.filter((a) => a.source === options.source);
    if (options.activityType) results = results.filter((a) => a.activityType === options.activityType);
    if (options.startDate) results = results.filter((a) => a.startTime >= options.startDate!);
    if (options.endDate) results = results.filter((a) => a.startTime <= options.endDate!);
    if (options.minDuration) results = results.filter((a) => a.durationMinutes >= options.minDuration!);
    if (options.maxDuration) results = results.filter((a) => a.durationMinutes <= options.maxDuration!);
    if (options.hasGPS) results = results.filter((a) => a.gpsTrack && a.gpsTrack.length > 0);

    const dir = options.orderDirection === 'asc' ? 1 : -1;
    results.sort((a, b) => (a.startTime - b.startTime) * dir);

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async countActivities(userId: string, options: ActivityQueryOptions = {}): Promise<number> {
    const results = await this.listActivities(userId, { ...options, limit: Infinity, offset: 0 });
    return results.length;
  }

  async getLatestActivity(userId: string, activityType?: ActivityType): Promise<Activity | null> {
    let results = Array.from(this.activities.values()).filter((a) => a.userId === userId);
    if (activityType) results = results.filter((a) => a.activityType === activityType);
    results.sort((a, b) => b.startTime - a.startTime);
    return results[0] ?? null;
  }

  async getActivitiesByDateRange(
    userId: string,
    startDate: number,
    endDate: number,
    options: ActivityQueryOptions = {}
  ): Promise<Activity[]> {
    return this.listActivities(userId, { ...options, startDate, endDate });
  }

  async getActivitiesWithGPS(userId: string, limit = 50): Promise<Activity[]> {
    return this.listActivities(userId, { hasGPS: true, limit });
  }

  async getActivityStats(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<{
    totalActivities: number;
    totalDurationMinutes: number;
    totalCalories: number;
    totalDistance: number;
    byType: Record<ActivityType, number>;
  }> {
    const activities = await this.listActivities(userId, {
      startDate,
      endDate,
      limit: Infinity,
      offset: 0,
    });

    const byType: Record<string, number> = {};
    let totalDuration = 0;
    let totalCalories = 0;
    let totalDistance = 0;

    for (const a of activities) {
      totalDuration += a.durationMinutes;
      totalCalories += a.calories ?? 0;
      totalDistance += a.distance ?? 0;
      byType[a.activityType] = (byType[a.activityType] ?? 0) + 1;
    }

    return {
      totalActivities: activities.length,
      totalDurationMinutes: totalDuration,
      totalCalories,
      totalDistance,
      byType: byType as Record<ActivityType, number>,
    };
  }
}

// =============================================================================
// Row Types
// =============================================================================

interface ActivityRow {
  id: string;
  user_id: string;
  source: string;
  external_id: string | null;
  activity_type: string;
  name: string;
  start_time: number;
  end_time: number;
  duration_minutes: number;
  distance: number | null;
  distance_unit: string | null;
  calories: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  avg_pace: number | null;
  elevation_gain: number | null;
  steps: number | null;
  gps_track: string | null;
  laps: string | null;
  zones: string | null;
  raw_data: string | null;
  synced_at: number;
  created_at: number;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createActivityStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): ActivityStore {
  if (type === 'database') {
    if (!db) {
      throw new Error('Database adapter required for database store');
    }
    return new DatabaseActivityStore(db);
  }
  return new InMemoryActivityStore();
}
