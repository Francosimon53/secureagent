/**
 * Sleep Store
 *
 * Storage for sleep records and alerts with support for:
 * - Sleep record management
 * - Sleep alert configuration
 * - Multi-source sleep data
 * - Both in-memory and database implementations
 */

import type { DatabaseAdapter } from '../../persistence/index.js';
import type {
  SleepRecord,
  SleepAlert,
  SleepAlertType,
  SleepAlertCondition,
  WearableSource,
  HeartRateDataPoint,
  WellnessQueryOptions,
} from '../types.js';

// =============================================================================
// Sleep Store Interface
// =============================================================================

export interface SleepStore {
  initialize(): Promise<void>;

  // Sleep Record Operations
  createSleepRecord(record: Omit<SleepRecord, 'id' | 'createdAt'>): Promise<SleepRecord>;
  getSleepRecord(id: string): Promise<SleepRecord | null>;
  getSleepRecordByDate(userId: string, source: WearableSource, date: number): Promise<SleepRecord | null>;
  updateSleepRecord(id: string, updates: Partial<SleepRecord>): Promise<SleepRecord | null>;
  deleteSleepRecord(id: string): Promise<boolean>;
  listSleepRecords(userId: string, options?: WellnessQueryOptions): Promise<SleepRecord[]>;
  getLatestSleepRecord(userId: string, source?: WearableSource): Promise<SleepRecord | null>;
  getSleepRecordsByDateRange(
    userId: string,
    startDate: number,
    endDate: number,
    source?: WearableSource
  ): Promise<SleepRecord[]>;

  // Sleep Alert Operations
  createSleepAlert(alert: Omit<SleepAlert, 'id' | 'createdAt' | 'updatedAt'>): Promise<SleepAlert>;
  getSleepAlert(id: string): Promise<SleepAlert | null>;
  updateSleepAlert(id: string, updates: Partial<SleepAlert>): Promise<SleepAlert | null>;
  deleteSleepAlert(id: string): Promise<boolean>;
  listSleepAlerts(userId: string, enabled?: boolean): Promise<SleepAlert[]>;
  getEnabledAlerts(userId: string): Promise<SleepAlert[]>;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseSleepStore implements SleepStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Create sleep_records table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS sleep_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source TEXT NOT NULL,
        date INTEGER NOT NULL,
        bedtime INTEGER NOT NULL,
        wake_time INTEGER NOT NULL,
        total_sleep_minutes INTEGER NOT NULL,
        rem_minutes INTEGER,
        deep_minutes INTEGER,
        light_minutes INTEGER,
        awake_minutes INTEGER,
        sleep_efficiency REAL,
        sleep_score REAL,
        sleep_need INTEGER,
        sleep_debt INTEGER,
        disturbances INTEGER,
        latency_minutes INTEGER,
        heart_rate_data TEXT,
        raw_data TEXT,
        synced_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, source, date)
      )
    `);
    await this.db.query(
      'CREATE INDEX IF NOT EXISTS idx_sleep_user_date ON sleep_records(user_id, date)'
    );

    // Create sleep_alerts table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS sleep_alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        condition TEXT NOT NULL,
        threshold REAL NOT NULL,
        enabled INTEGER DEFAULT 1,
        notification_channels TEXT NOT NULL,
        last_triggered_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_sleep_alerts_user ON sleep_alerts(user_id)');
  }

  // Sleep Record Operations

  async createSleepRecord(record: Omit<SleepRecord, 'id' | 'createdAt'>): Promise<SleepRecord> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.query(
      `INSERT INTO sleep_records (
        id, user_id, source, date, bedtime, wake_time, total_sleep_minutes,
        rem_minutes, deep_minutes, light_minutes, awake_minutes, sleep_efficiency,
        sleep_score, sleep_need, sleep_debt, disturbances, latency_minutes,
        heart_rate_data, raw_data, synced_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, source, date) DO UPDATE SET
        bedtime = excluded.bedtime,
        wake_time = excluded.wake_time,
        total_sleep_minutes = excluded.total_sleep_minutes,
        rem_minutes = excluded.rem_minutes,
        deep_minutes = excluded.deep_minutes,
        light_minutes = excluded.light_minutes,
        awake_minutes = excluded.awake_minutes,
        sleep_efficiency = excluded.sleep_efficiency,
        sleep_score = excluded.sleep_score,
        sleep_need = excluded.sleep_need,
        sleep_debt = excluded.sleep_debt,
        disturbances = excluded.disturbances,
        latency_minutes = excluded.latency_minutes,
        heart_rate_data = excluded.heart_rate_data,
        raw_data = excluded.raw_data,
        synced_at = excluded.synced_at`,
      [
        id,
        record.userId,
        record.source,
        record.date,
        record.bedtime,
        record.wakeTime,
        record.totalSleepMinutes,
        record.remMinutes ?? null,
        record.deepMinutes ?? null,
        record.lightMinutes ?? null,
        record.awakeMinutes ?? null,
        record.sleepEfficiency ?? null,
        record.sleepScore ?? null,
        record.sleepNeed ?? null,
        record.sleepDebt ?? null,
        record.disturbances ?? null,
        record.latencyMinutes ?? null,
        record.heartRateData ? JSON.stringify(record.heartRateData) : null,
        record.rawData ? JSON.stringify(record.rawData) : null,
        record.syncedAt,
        now,
      ]
    );

    return { ...record, id, createdAt: now };
  }

  async getSleepRecord(id: string): Promise<SleepRecord | null> {
    const result = await this.db.query<SleepRecordRow>(
      'SELECT * FROM sleep_records WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.mapSleepRecordRow(result.rows[0]) : null;
  }

  async getSleepRecordByDate(
    userId: string,
    source: WearableSource,
    date: number
  ): Promise<SleepRecord | null> {
    const result = await this.db.query<SleepRecordRow>(
      'SELECT * FROM sleep_records WHERE user_id = ? AND source = ? AND date = ?',
      [userId, source, date]
    );
    return result.rows[0] ? this.mapSleepRecordRow(result.rows[0]) : null;
  }

  async updateSleepRecord(id: string, updates: Partial<SleepRecord>): Promise<SleepRecord | null> {
    const existing = await this.getSleepRecord(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.bedtime !== undefined) {
      fields.push('bedtime = ?');
      values.push(updates.bedtime);
    }
    if (updates.wakeTime !== undefined) {
      fields.push('wake_time = ?');
      values.push(updates.wakeTime);
    }
    if (updates.totalSleepMinutes !== undefined) {
      fields.push('total_sleep_minutes = ?');
      values.push(updates.totalSleepMinutes);
    }
    if (updates.remMinutes !== undefined) {
      fields.push('rem_minutes = ?');
      values.push(updates.remMinutes);
    }
    if (updates.deepMinutes !== undefined) {
      fields.push('deep_minutes = ?');
      values.push(updates.deepMinutes);
    }
    if (updates.lightMinutes !== undefined) {
      fields.push('light_minutes = ?');
      values.push(updates.lightMinutes);
    }
    if (updates.awakeMinutes !== undefined) {
      fields.push('awake_minutes = ?');
      values.push(updates.awakeMinutes);
    }
    if (updates.sleepEfficiency !== undefined) {
      fields.push('sleep_efficiency = ?');
      values.push(updates.sleepEfficiency);
    }
    if (updates.sleepScore !== undefined) {
      fields.push('sleep_score = ?');
      values.push(updates.sleepScore);
    }
    if (updates.sleepNeed !== undefined) {
      fields.push('sleep_need = ?');
      values.push(updates.sleepNeed);
    }
    if (updates.sleepDebt !== undefined) {
      fields.push('sleep_debt = ?');
      values.push(updates.sleepDebt);
    }
    if (updates.disturbances !== undefined) {
      fields.push('disturbances = ?');
      values.push(updates.disturbances);
    }
    if (updates.latencyMinutes !== undefined) {
      fields.push('latency_minutes = ?');
      values.push(updates.latencyMinutes);
    }
    if (updates.heartRateData !== undefined) {
      fields.push('heart_rate_data = ?');
      values.push(JSON.stringify(updates.heartRateData));
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
    await this.db.query(`UPDATE sleep_records SET ${fields.join(', ')} WHERE id = ?`, values);

    return this.getSleepRecord(id);
  }

  async deleteSleepRecord(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM sleep_records WHERE id = ?', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listSleepRecords(userId: string, options: WellnessQueryOptions = {}): Promise<SleepRecord[]> {
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

    const orderDir = options.orderDirection || 'desc';
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const result = await this.db.query<SleepRecordRow>(
      `SELECT * FROM sleep_records WHERE ${conditions.join(' AND ')}
       ORDER BY date ${orderDir} LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return result.rows.map(this.mapSleepRecordRow);
  }

  async getLatestSleepRecord(userId: string, source?: WearableSource): Promise<SleepRecord | null> {
    let query = 'SELECT * FROM sleep_records WHERE user_id = ?';
    const params: unknown[] = [userId];

    if (source) {
      query += ' AND source = ?';
      params.push(source);
    }

    query += ' ORDER BY date DESC LIMIT 1';

    const result = await this.db.query<SleepRecordRow>(query, params);
    return result.rows[0] ? this.mapSleepRecordRow(result.rows[0]) : null;
  }

  async getSleepRecordsByDateRange(
    userId: string,
    startDate: number,
    endDate: number,
    source?: WearableSource
  ): Promise<SleepRecord[]> {
    let query = 'SELECT * FROM sleep_records WHERE user_id = ? AND date >= ? AND date <= ?';
    const params: unknown[] = [userId, startDate, endDate];

    if (source) {
      query += ' AND source = ?';
      params.push(source);
    }

    query += ' ORDER BY date ASC';

    const result = await this.db.query<SleepRecordRow>(query, params);
    return result.rows.map(this.mapSleepRecordRow);
  }

  // Sleep Alert Operations

  async createSleepAlert(
    alert: Omit<SleepAlert, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<SleepAlert> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.query(
      `INSERT INTO sleep_alerts (
        id, user_id, alert_type, condition, threshold, enabled,
        notification_channels, last_triggered_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        alert.userId,
        alert.alertType,
        alert.condition,
        alert.threshold,
        alert.enabled ? 1 : 0,
        JSON.stringify(alert.notificationChannels),
        alert.lastTriggeredAt ?? null,
        now,
        now,
      ]
    );

    return { ...alert, id, createdAt: now, updatedAt: now };
  }

  async getSleepAlert(id: string): Promise<SleepAlert | null> {
    const result = await this.db.query<SleepAlertRow>(
      'SELECT * FROM sleep_alerts WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.mapSleepAlertRow(result.rows[0]) : null;
  }

  async updateSleepAlert(id: string, updates: Partial<SleepAlert>): Promise<SleepAlert | null> {
    const existing = await this.getSleepAlert(id);
    if (!existing) return null;

    const now = Date.now();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.alertType !== undefined) {
      fields.push('alert_type = ?');
      values.push(updates.alertType);
    }
    if (updates.condition !== undefined) {
      fields.push('condition = ?');
      values.push(updates.condition);
    }
    if (updates.threshold !== undefined) {
      fields.push('threshold = ?');
      values.push(updates.threshold);
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }
    if (updates.notificationChannels !== undefined) {
      fields.push('notification_channels = ?');
      values.push(JSON.stringify(updates.notificationChannels));
    }
    if (updates.lastTriggeredAt !== undefined) {
      fields.push('last_triggered_at = ?');
      values.push(updates.lastTriggeredAt);
    }

    values.push(id);
    await this.db.query(`UPDATE sleep_alerts SET ${fields.join(', ')} WHERE id = ?`, values);

    return this.getSleepAlert(id);
  }

  async deleteSleepAlert(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM sleep_alerts WHERE id = ?', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listSleepAlerts(userId: string, enabled?: boolean): Promise<SleepAlert[]> {
    let query = 'SELECT * FROM sleep_alerts WHERE user_id = ?';
    const params: unknown[] = [userId];

    if (enabled !== undefined) {
      query += ' AND enabled = ?';
      params.push(enabled ? 1 : 0);
    }

    query += ' ORDER BY created_at ASC';

    const result = await this.db.query<SleepAlertRow>(query, params);
    return result.rows.map(this.mapSleepAlertRow);
  }

  async getEnabledAlerts(userId: string): Promise<SleepAlert[]> {
    return this.listSleepAlerts(userId, true);
  }

  // Helper Methods

  private mapSleepRecordRow(row: SleepRecordRow): SleepRecord {
    return {
      id: row.id,
      userId: row.user_id,
      source: row.source as WearableSource,
      date: row.date,
      bedtime: row.bedtime,
      wakeTime: row.wake_time,
      totalSleepMinutes: row.total_sleep_minutes,
      remMinutes: row.rem_minutes ?? undefined,
      deepMinutes: row.deep_minutes ?? undefined,
      lightMinutes: row.light_minutes ?? undefined,
      awakeMinutes: row.awake_minutes ?? undefined,
      sleepEfficiency: row.sleep_efficiency ?? undefined,
      sleepScore: row.sleep_score ?? undefined,
      sleepNeed: row.sleep_need ?? undefined,
      sleepDebt: row.sleep_debt ?? undefined,
      disturbances: row.disturbances ?? undefined,
      latencyMinutes: row.latency_minutes ?? undefined,
      heartRateData: row.heart_rate_data ? JSON.parse(row.heart_rate_data) : undefined,
      rawData: row.raw_data ? JSON.parse(row.raw_data) : undefined,
      syncedAt: row.synced_at,
      createdAt: row.created_at,
    };
  }

  private mapSleepAlertRow(row: SleepAlertRow): SleepAlert {
    return {
      id: row.id,
      userId: row.user_id,
      alertType: row.alert_type as SleepAlertType,
      condition: row.condition as SleepAlertCondition,
      threshold: row.threshold,
      enabled: row.enabled === 1,
      notificationChannels: JSON.parse(row.notification_channels),
      lastTriggeredAt: row.last_triggered_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemorySleepStore implements SleepStore {
  private sleepRecords = new Map<string, SleepRecord>();
  private sleepAlerts = new Map<string, SleepAlert>();

  async initialize(): Promise<void> {
    // No-op
  }

  // Sleep Record Operations

  async createSleepRecord(record: Omit<SleepRecord, 'id' | 'createdAt'>): Promise<SleepRecord> {
    const existing = Array.from(this.sleepRecords.values()).find(
      (r) => r.userId === record.userId && r.source === record.source && r.date === record.date
    );

    const id = existing?.id ?? crypto.randomUUID();
    const now = Date.now();
    const newRecord: SleepRecord = { ...record, id, createdAt: existing?.createdAt ?? now };
    this.sleepRecords.set(id, newRecord);
    return newRecord;
  }

  async getSleepRecord(id: string): Promise<SleepRecord | null> {
    return this.sleepRecords.get(id) ?? null;
  }

  async getSleepRecordByDate(
    userId: string,
    source: WearableSource,
    date: number
  ): Promise<SleepRecord | null> {
    return (
      Array.from(this.sleepRecords.values()).find(
        (r) => r.userId === userId && r.source === source && r.date === date
      ) ?? null
    );
  }

  async updateSleepRecord(id: string, updates: Partial<SleepRecord>): Promise<SleepRecord | null> {
    const existing = this.sleepRecords.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id };
    this.sleepRecords.set(id, updated);
    return updated;
  }

  async deleteSleepRecord(id: string): Promise<boolean> {
    return this.sleepRecords.delete(id);
  }

  async listSleepRecords(userId: string, options: WellnessQueryOptions = {}): Promise<SleepRecord[]> {
    let results = Array.from(this.sleepRecords.values()).filter((r) => r.userId === userId);

    if (options.source) results = results.filter((r) => r.source === options.source);
    if (options.startDate) results = results.filter((r) => r.date >= options.startDate!);
    if (options.endDate) results = results.filter((r) => r.date <= options.endDate!);

    const dir = options.orderDirection === 'asc' ? 1 : -1;
    results.sort((a, b) => (a.date - b.date) * dir);

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async getLatestSleepRecord(userId: string, source?: WearableSource): Promise<SleepRecord | null> {
    let results = Array.from(this.sleepRecords.values()).filter((r) => r.userId === userId);
    if (source) results = results.filter((r) => r.source === source);
    results.sort((a, b) => b.date - a.date);
    return results[0] ?? null;
  }

  async getSleepRecordsByDateRange(
    userId: string,
    startDate: number,
    endDate: number,
    source?: WearableSource
  ): Promise<SleepRecord[]> {
    let results = Array.from(this.sleepRecords.values()).filter(
      (r) => r.userId === userId && r.date >= startDate && r.date <= endDate
    );
    if (source) results = results.filter((r) => r.source === source);
    results.sort((a, b) => a.date - b.date);
    return results;
  }

  // Sleep Alert Operations

  async createSleepAlert(
    alert: Omit<SleepAlert, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<SleepAlert> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const newAlert: SleepAlert = { ...alert, id, createdAt: now, updatedAt: now };
    this.sleepAlerts.set(id, newAlert);
    return newAlert;
  }

  async getSleepAlert(id: string): Promise<SleepAlert | null> {
    return this.sleepAlerts.get(id) ?? null;
  }

  async updateSleepAlert(id: string, updates: Partial<SleepAlert>): Promise<SleepAlert | null> {
    const existing = this.sleepAlerts.get(id);
    if (!existing) return null;
    const updated: SleepAlert = { ...existing, ...updates, id, updatedAt: Date.now() };
    this.sleepAlerts.set(id, updated);
    return updated;
  }

  async deleteSleepAlert(id: string): Promise<boolean> {
    return this.sleepAlerts.delete(id);
  }

  async listSleepAlerts(userId: string, enabled?: boolean): Promise<SleepAlert[]> {
    let results = Array.from(this.sleepAlerts.values()).filter((a) => a.userId === userId);
    if (enabled !== undefined) results = results.filter((a) => a.enabled === enabled);
    results.sort((a, b) => a.createdAt - b.createdAt);
    return results;
  }

  async getEnabledAlerts(userId: string): Promise<SleepAlert[]> {
    return this.listSleepAlerts(userId, true);
  }
}

// =============================================================================
// Row Types
// =============================================================================

interface SleepRecordRow {
  id: string;
  user_id: string;
  source: string;
  date: number;
  bedtime: number;
  wake_time: number;
  total_sleep_minutes: number;
  rem_minutes: number | null;
  deep_minutes: number | null;
  light_minutes: number | null;
  awake_minutes: number | null;
  sleep_efficiency: number | null;
  sleep_score: number | null;
  sleep_need: number | null;
  sleep_debt: number | null;
  disturbances: number | null;
  latency_minutes: number | null;
  heart_rate_data: string | null;
  raw_data: string | null;
  synced_at: number;
  created_at: number;
}

interface SleepAlertRow {
  id: string;
  user_id: string;
  alert_type: string;
  condition: string;
  threshold: number;
  enabled: number;
  notification_channels: string;
  last_triggered_at: number | null;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createSleepStore(type: 'memory' | 'database', db?: DatabaseAdapter): SleepStore {
  if (type === 'database') {
    if (!db) {
      throw new Error('Database adapter required for database store');
    }
    return new DatabaseSleepStore(db);
  }
  return new InMemorySleepStore();
}
