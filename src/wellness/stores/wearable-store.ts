/**
 * Wearable Store
 *
 * Storage for recovery and strain data from wearables with support for:
 * - Recovery data (WHOOP, Garmin, Apple Health)
 * - Strain data (daily strain scores, activities)
 * - OAuth token management
 * - Sync status tracking
 * - Both in-memory and database implementations
 */

import type { DatabaseAdapter } from '../../persistence/index.js';
import type {
  RecoveryData,
  StrainData,
  StrainActivity,
  OAuthToken,
  SyncState,
  SyncStatus,
  WearableSource,
  WellnessQueryOptions,
} from '../types.js';

// =============================================================================
// Wearable Store Interface
// =============================================================================

export interface WearableStore {
  initialize(): Promise<void>;

  // Recovery Data Operations
  createRecovery(data: Omit<RecoveryData, 'id' | 'createdAt'>): Promise<RecoveryData>;
  getRecovery(id: string): Promise<RecoveryData | null>;
  getRecoveryByDate(userId: string, source: WearableSource, date: number): Promise<RecoveryData | null>;
  updateRecovery(id: string, updates: Partial<RecoveryData>): Promise<RecoveryData | null>;
  deleteRecovery(id: string): Promise<boolean>;
  listRecovery(userId: string, options?: WellnessQueryOptions): Promise<RecoveryData[]>;
  getLatestRecovery(userId: string, source?: WearableSource): Promise<RecoveryData | null>;

  // Strain Data Operations
  createStrain(data: Omit<StrainData, 'id' | 'createdAt'>): Promise<StrainData>;
  getStrain(id: string): Promise<StrainData | null>;
  getStrainByDate(userId: string, source: WearableSource, date: number): Promise<StrainData | null>;
  updateStrain(id: string, updates: Partial<StrainData>): Promise<StrainData | null>;
  deleteStrain(id: string): Promise<boolean>;
  listStrain(userId: string, options?: WellnessQueryOptions): Promise<StrainData[]>;
  getLatestStrain(userId: string, source?: WearableSource): Promise<StrainData | null>;

  // OAuth Token Operations
  saveToken(token: Omit<OAuthToken, 'id' | 'createdAt' | 'updatedAt'>): Promise<OAuthToken>;
  getToken(userId: string, provider: WearableSource): Promise<OAuthToken | null>;
  updateToken(userId: string, provider: WearableSource, updates: Partial<OAuthToken>): Promise<OAuthToken | null>;
  deleteToken(userId: string, provider: WearableSource): Promise<boolean>;

  // Sync Status Operations
  getSyncState(userId: string, provider: WearableSource): Promise<SyncState | null>;
  updateSyncState(
    userId: string,
    provider: WearableSource,
    updates: Partial<SyncState>
  ): Promise<SyncState>;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseWearableStore implements WearableStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Create recovery_data table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS recovery_data (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source TEXT NOT NULL,
        date INTEGER NOT NULL,
        recovery_score REAL NOT NULL,
        hrv_rmssd REAL,
        resting_heart_rate REAL,
        respiratory_rate REAL,
        skin_temperature REAL,
        spo2 REAL,
        sleep_performance REAL,
        raw_data TEXT,
        synced_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, source, date)
      )
    `);
    await this.db.query(
      'CREATE INDEX IF NOT EXISTS idx_recovery_user_date ON recovery_data(user_id, date)'
    );

    // Create strain_data table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS strain_data (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source TEXT NOT NULL,
        date INTEGER NOT NULL,
        strain_score REAL NOT NULL,
        calories REAL NOT NULL,
        avg_heart_rate REAL,
        max_heart_rate REAL,
        activities TEXT,
        raw_data TEXT,
        synced_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, source, date)
      )
    `);
    await this.db.query(
      'CREATE INDEX IF NOT EXISTS idx_strain_user_date ON strain_data(user_id, date)'
    );

    // Create health_oauth_tokens table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS health_oauth_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        token_type TEXT NOT NULL,
        scope TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_id, provider)
      )
    `);

    // Create health_sync_status table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS health_sync_status (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        last_sync_at INTEGER,
        last_sync_status TEXT,
        last_error TEXT,
        next_sync_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_id, provider)
      )
    `);
  }

  // Recovery Data Operations

  async createRecovery(data: Omit<RecoveryData, 'id' | 'createdAt'>): Promise<RecoveryData> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.query(
      `INSERT INTO recovery_data (
        id, user_id, source, date, recovery_score, hrv_rmssd, resting_heart_rate,
        respiratory_rate, skin_temperature, spo2, sleep_performance, raw_data,
        synced_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, source, date) DO UPDATE SET
        recovery_score = excluded.recovery_score,
        hrv_rmssd = excluded.hrv_rmssd,
        resting_heart_rate = excluded.resting_heart_rate,
        respiratory_rate = excluded.respiratory_rate,
        skin_temperature = excluded.skin_temperature,
        spo2 = excluded.spo2,
        sleep_performance = excluded.sleep_performance,
        raw_data = excluded.raw_data,
        synced_at = excluded.synced_at`,
      [
        id,
        data.userId,
        data.source,
        data.date,
        data.recoveryScore,
        data.hrvRmssd ?? null,
        data.restingHeartRate ?? null,
        data.respiratoryRate ?? null,
        data.skinTemperature ?? null,
        data.spo2 ?? null,
        data.sleepPerformance ?? null,
        data.rawData ? JSON.stringify(data.rawData) : null,
        data.syncedAt,
        now,
      ]
    );

    return { ...data, id, createdAt: now };
  }

  async getRecovery(id: string): Promise<RecoveryData | null> {
    const result = await this.db.query<RecoveryRow>(
      'SELECT * FROM recovery_data WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.mapRecoveryRow(result.rows[0]) : null;
  }

  async getRecoveryByDate(
    userId: string,
    source: WearableSource,
    date: number
  ): Promise<RecoveryData | null> {
    const result = await this.db.query<RecoveryRow>(
      'SELECT * FROM recovery_data WHERE user_id = ? AND source = ? AND date = ?',
      [userId, source, date]
    );
    return result.rows[0] ? this.mapRecoveryRow(result.rows[0]) : null;
  }

  async updateRecovery(id: string, updates: Partial<RecoveryData>): Promise<RecoveryData | null> {
    const existing = await this.getRecovery(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.recoveryScore !== undefined) {
      fields.push('recovery_score = ?');
      values.push(updates.recoveryScore);
    }
    if (updates.hrvRmssd !== undefined) {
      fields.push('hrv_rmssd = ?');
      values.push(updates.hrvRmssd);
    }
    if (updates.restingHeartRate !== undefined) {
      fields.push('resting_heart_rate = ?');
      values.push(updates.restingHeartRate);
    }
    if (updates.respiratoryRate !== undefined) {
      fields.push('respiratory_rate = ?');
      values.push(updates.respiratoryRate);
    }
    if (updates.skinTemperature !== undefined) {
      fields.push('skin_temperature = ?');
      values.push(updates.skinTemperature);
    }
    if (updates.spo2 !== undefined) {
      fields.push('spo2 = ?');
      values.push(updates.spo2);
    }
    if (updates.sleepPerformance !== undefined) {
      fields.push('sleep_performance = ?');
      values.push(updates.sleepPerformance);
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
    await this.db.query(`UPDATE recovery_data SET ${fields.join(', ')} WHERE id = ?`, values);

    return this.getRecovery(id);
  }

  async deleteRecovery(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM recovery_data WHERE id = ?', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listRecovery(userId: string, options: WellnessQueryOptions = {}): Promise<RecoveryData[]> {
    const { conditions, values } = this.buildQuery(userId, options, 'recovery_data');
    const orderDir = options.orderDirection || 'desc';
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const result = await this.db.query<RecoveryRow>(
      `SELECT * FROM recovery_data WHERE ${conditions.join(' AND ')}
       ORDER BY date ${orderDir} LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return result.rows.map(this.mapRecoveryRow);
  }

  async getLatestRecovery(userId: string, source?: WearableSource): Promise<RecoveryData | null> {
    let query = 'SELECT * FROM recovery_data WHERE user_id = ?';
    const params: unknown[] = [userId];

    if (source) {
      query += ' AND source = ?';
      params.push(source);
    }

    query += ' ORDER BY date DESC LIMIT 1';

    const result = await this.db.query<RecoveryRow>(query, params);
    return result.rows[0] ? this.mapRecoveryRow(result.rows[0]) : null;
  }

  // Strain Data Operations

  async createStrain(data: Omit<StrainData, 'id' | 'createdAt'>): Promise<StrainData> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.query(
      `INSERT INTO strain_data (
        id, user_id, source, date, strain_score, calories, avg_heart_rate,
        max_heart_rate, activities, raw_data, synced_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, source, date) DO UPDATE SET
        strain_score = excluded.strain_score,
        calories = excluded.calories,
        avg_heart_rate = excluded.avg_heart_rate,
        max_heart_rate = excluded.max_heart_rate,
        activities = excluded.activities,
        raw_data = excluded.raw_data,
        synced_at = excluded.synced_at`,
      [
        id,
        data.userId,
        data.source,
        data.date,
        data.strainScore,
        data.calories,
        data.avgHeartRate ?? null,
        data.maxHeartRate ?? null,
        JSON.stringify(data.activities),
        data.rawData ? JSON.stringify(data.rawData) : null,
        data.syncedAt,
        now,
      ]
    );

    return { ...data, id, createdAt: now };
  }

  async getStrain(id: string): Promise<StrainData | null> {
    const result = await this.db.query<StrainRow>(
      'SELECT * FROM strain_data WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.mapStrainRow(result.rows[0]) : null;
  }

  async getStrainByDate(
    userId: string,
    source: WearableSource,
    date: number
  ): Promise<StrainData | null> {
    const result = await this.db.query<StrainRow>(
      'SELECT * FROM strain_data WHERE user_id = ? AND source = ? AND date = ?',
      [userId, source, date]
    );
    return result.rows[0] ? this.mapStrainRow(result.rows[0]) : null;
  }

  async updateStrain(id: string, updates: Partial<StrainData>): Promise<StrainData | null> {
    const existing = await this.getStrain(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.strainScore !== undefined) {
      fields.push('strain_score = ?');
      values.push(updates.strainScore);
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
    if (updates.activities !== undefined) {
      fields.push('activities = ?');
      values.push(JSON.stringify(updates.activities));
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
    await this.db.query(`UPDATE strain_data SET ${fields.join(', ')} WHERE id = ?`, values);

    return this.getStrain(id);
  }

  async deleteStrain(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM strain_data WHERE id = ?', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listStrain(userId: string, options: WellnessQueryOptions = {}): Promise<StrainData[]> {
    const { conditions, values } = this.buildQuery(userId, options, 'strain_data');
    const orderDir = options.orderDirection || 'desc';
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const result = await this.db.query<StrainRow>(
      `SELECT * FROM strain_data WHERE ${conditions.join(' AND ')}
       ORDER BY date ${orderDir} LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return result.rows.map(this.mapStrainRow);
  }

  async getLatestStrain(userId: string, source?: WearableSource): Promise<StrainData | null> {
    let query = 'SELECT * FROM strain_data WHERE user_id = ?';
    const params: unknown[] = [userId];

    if (source) {
      query += ' AND source = ?';
      params.push(source);
    }

    query += ' ORDER BY date DESC LIMIT 1';

    const result = await this.db.query<StrainRow>(query, params);
    return result.rows[0] ? this.mapStrainRow(result.rows[0]) : null;
  }

  // OAuth Token Operations

  async saveToken(token: Omit<OAuthToken, 'id' | 'createdAt' | 'updatedAt'>): Promise<OAuthToken> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.query(
      `INSERT INTO health_oauth_tokens (
        id, user_id, provider, access_token, refresh_token, expires_at,
        token_type, scope, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, provider) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        token_type = excluded.token_type,
        scope = excluded.scope,
        updated_at = excluded.updated_at`,
      [
        id,
        token.userId,
        token.provider,
        token.accessToken,
        token.refreshToken,
        token.expiresAt,
        token.tokenType,
        token.scope ?? null,
        now,
        now,
      ]
    );

    return { ...token, id, createdAt: now, updatedAt: now };
  }

  async getToken(userId: string, provider: WearableSource): Promise<OAuthToken | null> {
    const result = await this.db.query<TokenRow>(
      'SELECT * FROM health_oauth_tokens WHERE user_id = ? AND provider = ?',
      [userId, provider]
    );
    return result.rows[0] ? this.mapTokenRow(result.rows[0]) : null;
  }

  async updateToken(
    userId: string,
    provider: WearableSource,
    updates: Partial<OAuthToken>
  ): Promise<OAuthToken | null> {
    const existing = await this.getToken(userId, provider);
    if (!existing) return null;

    const now = Date.now();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.accessToken !== undefined) {
      fields.push('access_token = ?');
      values.push(updates.accessToken);
    }
    if (updates.refreshToken !== undefined) {
      fields.push('refresh_token = ?');
      values.push(updates.refreshToken);
    }
    if (updates.expiresAt !== undefined) {
      fields.push('expires_at = ?');
      values.push(updates.expiresAt);
    }
    if (updates.scope !== undefined) {
      fields.push('scope = ?');
      values.push(updates.scope);
    }

    values.push(userId, provider);
    await this.db.query(
      `UPDATE health_oauth_tokens SET ${fields.join(', ')} WHERE user_id = ? AND provider = ?`,
      values
    );

    return this.getToken(userId, provider);
  }

  async deleteToken(userId: string, provider: WearableSource): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM health_oauth_tokens WHERE user_id = ? AND provider = ?',
      [userId, provider]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Sync Status Operations

  async getSyncState(userId: string, provider: WearableSource): Promise<SyncState | null> {
    const result = await this.db.query<SyncStateRow>(
      'SELECT * FROM health_sync_status WHERE user_id = ? AND provider = ?',
      [userId, provider]
    );
    return result.rows[0] ? this.mapSyncStateRow(result.rows[0]) : null;
  }

  async updateSyncState(
    userId: string,
    provider: WearableSource,
    updates: Partial<SyncState>
  ): Promise<SyncState> {
    const existing = await this.getSyncState(userId, provider);
    const now = Date.now();

    if (!existing) {
      const id = crypto.randomUUID();
      await this.db.query(
        `INSERT INTO health_sync_status (
          id, user_id, provider, last_sync_at, last_sync_status, last_error,
          next_sync_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          userId,
          provider,
          updates.lastSyncAt ?? null,
          updates.lastSyncStatus ?? null,
          updates.lastError ?? null,
          updates.nextSyncAt ?? null,
          now,
          now,
        ]
      );
      return {
        id,
        userId,
        provider,
        lastSyncAt: updates.lastSyncAt,
        lastSyncStatus: updates.lastSyncStatus,
        lastError: updates.lastError,
        nextSyncAt: updates.nextSyncAt,
        createdAt: now,
        updatedAt: now,
      };
    }

    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.lastSyncAt !== undefined) {
      fields.push('last_sync_at = ?');
      values.push(updates.lastSyncAt);
    }
    if (updates.lastSyncStatus !== undefined) {
      fields.push('last_sync_status = ?');
      values.push(updates.lastSyncStatus);
    }
    if (updates.lastError !== undefined) {
      fields.push('last_error = ?');
      values.push(updates.lastError);
    }
    if (updates.nextSyncAt !== undefined) {
      fields.push('next_sync_at = ?');
      values.push(updates.nextSyncAt);
    }

    values.push(userId, provider);
    await this.db.query(
      `UPDATE health_sync_status SET ${fields.join(', ')} WHERE user_id = ? AND provider = ?`,
      values
    );

    return (await this.getSyncState(userId, provider))!;
  }

  // Helper Methods

  private buildQuery(
    userId: string,
    options: WellnessQueryOptions,
    _table: string
  ): { conditions: string[]; values: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const values: unknown[] = [userId];

    if (options.source) {
      conditions.push('source = ?');
      values.push(options.source);
    }
    if (options.startDate) {
      conditions.push('date >= ?');
      values.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push('date <= ?');
      values.push(options.endDate);
    }

    return { conditions, values };
  }

  private mapRecoveryRow(row: RecoveryRow): RecoveryData {
    return {
      id: row.id,
      userId: row.user_id,
      source: row.source as WearableSource,
      date: row.date,
      recoveryScore: row.recovery_score,
      hrvRmssd: row.hrv_rmssd ?? undefined,
      restingHeartRate: row.resting_heart_rate ?? undefined,
      respiratoryRate: row.respiratory_rate ?? undefined,
      skinTemperature: row.skin_temperature ?? undefined,
      spo2: row.spo2 ?? undefined,
      sleepPerformance: row.sleep_performance ?? undefined,
      rawData: row.raw_data ? JSON.parse(row.raw_data) : undefined,
      syncedAt: row.synced_at,
      createdAt: row.created_at,
    };
  }

  private mapStrainRow(row: StrainRow): StrainData {
    return {
      id: row.id,
      userId: row.user_id,
      source: row.source as WearableSource,
      date: row.date,
      strainScore: row.strain_score,
      calories: row.calories,
      avgHeartRate: row.avg_heart_rate ?? undefined,
      maxHeartRate: row.max_heart_rate ?? undefined,
      activities: row.activities ? JSON.parse(row.activities) : [],
      rawData: row.raw_data ? JSON.parse(row.raw_data) : undefined,
      syncedAt: row.synced_at,
      createdAt: row.created_at,
    };
  }

  private mapTokenRow(row: TokenRow): OAuthToken {
    return {
      id: row.id,
      userId: row.user_id,
      provider: row.provider as WearableSource,
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresAt: row.expires_at,
      tokenType: row.token_type,
      scope: row.scope ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapSyncStateRow(row: SyncStateRow): SyncState {
    return {
      id: row.id,
      userId: row.user_id,
      provider: row.provider as WearableSource,
      lastSyncAt: row.last_sync_at ?? undefined,
      lastSyncStatus: row.last_sync_status as SyncStatus | undefined,
      lastError: row.last_error ?? undefined,
      nextSyncAt: row.next_sync_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryWearableStore implements WearableStore {
  private recovery = new Map<string, RecoveryData>();
  private strain = new Map<string, StrainData>();
  private tokens = new Map<string, OAuthToken>();
  private syncStates = new Map<string, SyncState>();

  async initialize(): Promise<void> {
    // No-op
  }

  // Recovery Data Operations

  async createRecovery(data: Omit<RecoveryData, 'id' | 'createdAt'>): Promise<RecoveryData> {
    const key = `${data.userId}:${data.source}:${data.date}`;
    const existing = Array.from(this.recovery.values()).find(
      (r) => r.userId === data.userId && r.source === data.source && r.date === data.date
    );

    const id = existing?.id ?? crypto.randomUUID();
    const now = Date.now();
    const record: RecoveryData = { ...data, id, createdAt: existing?.createdAt ?? now };
    this.recovery.set(id, record);
    return record;
  }

  async getRecovery(id: string): Promise<RecoveryData | null> {
    return this.recovery.get(id) ?? null;
  }

  async getRecoveryByDate(
    userId: string,
    source: WearableSource,
    date: number
  ): Promise<RecoveryData | null> {
    return (
      Array.from(this.recovery.values()).find(
        (r) => r.userId === userId && r.source === source && r.date === date
      ) ?? null
    );
  }

  async updateRecovery(id: string, updates: Partial<RecoveryData>): Promise<RecoveryData | null> {
    const existing = this.recovery.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id };
    this.recovery.set(id, updated);
    return updated;
  }

  async deleteRecovery(id: string): Promise<boolean> {
    return this.recovery.delete(id);
  }

  async listRecovery(userId: string, options: WellnessQueryOptions = {}): Promise<RecoveryData[]> {
    let results = Array.from(this.recovery.values()).filter((r) => r.userId === userId);

    if (options.source) results = results.filter((r) => r.source === options.source);
    if (options.startDate) results = results.filter((r) => r.date >= options.startDate!);
    if (options.endDate) results = results.filter((r) => r.date <= options.endDate!);

    const dir = options.orderDirection === 'asc' ? 1 : -1;
    results.sort((a, b) => (a.date - b.date) * dir);

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async getLatestRecovery(userId: string, source?: WearableSource): Promise<RecoveryData | null> {
    let results = Array.from(this.recovery.values()).filter((r) => r.userId === userId);
    if (source) results = results.filter((r) => r.source === source);
    results.sort((a, b) => b.date - a.date);
    return results[0] ?? null;
  }

  // Strain Data Operations

  async createStrain(data: Omit<StrainData, 'id' | 'createdAt'>): Promise<StrainData> {
    const existing = Array.from(this.strain.values()).find(
      (s) => s.userId === data.userId && s.source === data.source && s.date === data.date
    );

    const id = existing?.id ?? crypto.randomUUID();
    const now = Date.now();
    const record: StrainData = { ...data, id, createdAt: existing?.createdAt ?? now };
    this.strain.set(id, record);
    return record;
  }

  async getStrain(id: string): Promise<StrainData | null> {
    return this.strain.get(id) ?? null;
  }

  async getStrainByDate(
    userId: string,
    source: WearableSource,
    date: number
  ): Promise<StrainData | null> {
    return (
      Array.from(this.strain.values()).find(
        (s) => s.userId === userId && s.source === source && s.date === date
      ) ?? null
    );
  }

  async updateStrain(id: string, updates: Partial<StrainData>): Promise<StrainData | null> {
    const existing = this.strain.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id };
    this.strain.set(id, updated);
    return updated;
  }

  async deleteStrain(id: string): Promise<boolean> {
    return this.strain.delete(id);
  }

  async listStrain(userId: string, options: WellnessQueryOptions = {}): Promise<StrainData[]> {
    let results = Array.from(this.strain.values()).filter((s) => s.userId === userId);

    if (options.source) results = results.filter((s) => s.source === options.source);
    if (options.startDate) results = results.filter((s) => s.date >= options.startDate!);
    if (options.endDate) results = results.filter((s) => s.date <= options.endDate!);

    const dir = options.orderDirection === 'asc' ? 1 : -1;
    results.sort((a, b) => (a.date - b.date) * dir);

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async getLatestStrain(userId: string, source?: WearableSource): Promise<StrainData | null> {
    let results = Array.from(this.strain.values()).filter((s) => s.userId === userId);
    if (source) results = results.filter((s) => s.source === source);
    results.sort((a, b) => b.date - a.date);
    return results[0] ?? null;
  }

  // OAuth Token Operations

  private tokenKey(userId: string, provider: WearableSource): string {
    return `${userId}:${provider}`;
  }

  async saveToken(token: Omit<OAuthToken, 'id' | 'createdAt' | 'updatedAt'>): Promise<OAuthToken> {
    const key = this.tokenKey(token.userId, token.provider);
    const existing = this.tokens.get(key);
    const id = existing?.id ?? crypto.randomUUID();
    const now = Date.now();
    const record: OAuthToken = {
      ...token,
      id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.tokens.set(key, record);
    return record;
  }

  async getToken(userId: string, provider: WearableSource): Promise<OAuthToken | null> {
    return this.tokens.get(this.tokenKey(userId, provider)) ?? null;
  }

  async updateToken(
    userId: string,
    provider: WearableSource,
    updates: Partial<OAuthToken>
  ): Promise<OAuthToken | null> {
    const key = this.tokenKey(userId, provider);
    const existing = this.tokens.get(key);
    if (!existing) return null;
    const updated: OAuthToken = { ...existing, ...updates, updatedAt: Date.now() };
    this.tokens.set(key, updated);
    return updated;
  }

  async deleteToken(userId: string, provider: WearableSource): Promise<boolean> {
    return this.tokens.delete(this.tokenKey(userId, provider));
  }

  // Sync Status Operations

  private syncKey(userId: string, provider: WearableSource): string {
    return `${userId}:${provider}`;
  }

  async getSyncState(userId: string, provider: WearableSource): Promise<SyncState | null> {
    return this.syncStates.get(this.syncKey(userId, provider)) ?? null;
  }

  async updateSyncState(
    userId: string,
    provider: WearableSource,
    updates: Partial<SyncState>
  ): Promise<SyncState> {
    const key = this.syncKey(userId, provider);
    const existing = this.syncStates.get(key);
    const now = Date.now();

    const state: SyncState = {
      id: existing?.id ?? crypto.randomUUID(),
      userId,
      provider,
      lastSyncAt: updates.lastSyncAt ?? existing?.lastSyncAt,
      lastSyncStatus: updates.lastSyncStatus ?? existing?.lastSyncStatus,
      lastError: updates.lastError ?? existing?.lastError,
      nextSyncAt: updates.nextSyncAt ?? existing?.nextSyncAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.syncStates.set(key, state);
    return state;
  }
}

// =============================================================================
// Row Types
// =============================================================================

interface RecoveryRow {
  id: string;
  user_id: string;
  source: string;
  date: number;
  recovery_score: number;
  hrv_rmssd: number | null;
  resting_heart_rate: number | null;
  respiratory_rate: number | null;
  skin_temperature: number | null;
  spo2: number | null;
  sleep_performance: number | null;
  raw_data: string | null;
  synced_at: number;
  created_at: number;
}

interface StrainRow {
  id: string;
  user_id: string;
  source: string;
  date: number;
  strain_score: number;
  calories: number;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  activities: string | null;
  raw_data: string | null;
  synced_at: number;
  created_at: number;
}

interface TokenRow {
  id: string;
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  scope: string | null;
  created_at: number;
  updated_at: number;
}

interface SyncStateRow {
  id: string;
  user_id: string;
  provider: string;
  last_sync_at: number | null;
  last_sync_status: string | null;
  last_error: string | null;
  next_sync_at: number | null;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createWearableStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): WearableStore {
  if (type === 'database') {
    if (!db) {
      throw new Error('Database adapter required for database store');
    }
    return new DatabaseWearableStore(db);
  }
  return new InMemoryWearableStore();
}
