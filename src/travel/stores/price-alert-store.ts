/**
 * Travel Price Alert Store
 *
 * Persistence layer for travel price alerts.
 */

import { randomUUID } from 'crypto';
import type {
  TravelPriceAlert,
  TravelPriceAlertType,
  TravelPricePoint,
  PriceAlertQueryOptions,
} from '../types.js';

/**
 * Interface for travel price alert storage
 */
export interface TravelPriceAlertStore {
  initialize(): Promise<void>;

  // Alert CRUD
  createAlert(alert: Omit<TravelPriceAlert, 'id' | 'createdAt' | 'updatedAt'>): Promise<TravelPriceAlert>;
  getAlert(alertId: string): Promise<TravelPriceAlert | null>;
  updateAlert(alertId: string, updates: Partial<TravelPriceAlert>): Promise<TravelPriceAlert | null>;
  deleteAlert(alertId: string): Promise<boolean>;
  listAlerts(userId: string, options?: PriceAlertQueryOptions): Promise<TravelPriceAlert[]>;
  countAlerts(userId: string, options?: PriceAlertQueryOptions): Promise<number>;

  // Price management
  addPricePoint(alertId: string, pricePoint: TravelPricePoint): Promise<TravelPriceAlert | null>;
  updateCurrentPrice(alertId: string, price: number, source?: string): Promise<TravelPriceAlert | null>;
  getAlertsToCheck(type?: TravelPriceAlertType, limit?: number): Promise<TravelPriceAlert[]>;

  // Alert state management
  activateAlert(alertId: string): Promise<TravelPriceAlert | null>;
  deactivateAlert(alertId: string): Promise<TravelPriceAlert | null>;
  markAlertTriggered(alertId: string): Promise<TravelPriceAlert | null>;
  getTriggeredAlerts(userId: string): Promise<TravelPriceAlert[]>;
  getActiveAlertsByDestination(userId: string, destination: string): Promise<TravelPriceAlert[]>;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Database-backed travel price alert store
 */
export class DatabaseTravelPriceAlertStore implements TravelPriceAlertStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS travel_price_alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        origin TEXT,
        destination TEXT NOT NULL,
        outbound_date INTEGER NOT NULL,
        return_date INTEGER,
        target_price REAL NOT NULL,
        current_price REAL,
        lowest_price REAL,
        lowest_price_date INTEGER,
        price_history TEXT DEFAULT '[]',
        is_active INTEGER DEFAULT 1,
        notification_channels TEXT DEFAULT '[]',
        last_checked_at INTEGER,
        triggered_at INTEGER,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_travel_price_alerts_user ON travel_price_alerts(user_id, is_active)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_travel_price_alerts_type ON travel_price_alerts(type, is_active)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_travel_price_alerts_destination ON travel_price_alerts(user_id, destination)
    `);
  }

  async createAlert(alert: Omit<TravelPriceAlert, 'id' | 'createdAt' | 'updatedAt'>): Promise<TravelPriceAlert> {
    const now = Date.now();
    const id = randomUUID();

    const item: TravelPriceAlert = {
      ...alert,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO travel_price_alerts (
        id, user_id, type, origin, destination, outbound_date, return_date,
        target_price, current_price, lowest_price, lowest_price_date,
        price_history, is_active, notification_channels, last_checked_at,
        triggered_at, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.type,
        item.origin ?? null,
        item.destination,
        item.outboundDate,
        item.returnDate ?? null,
        item.targetPrice,
        item.currentPrice ?? null,
        item.lowestPrice ?? null,
        item.lowestPriceDate ?? null,
        JSON.stringify(item.priceHistory),
        item.isActive ? 1 : 0,
        JSON.stringify(item.notificationChannels),
        item.lastCheckedAt ?? null,
        item.triggeredAt ?? null,
        item.metadata ? JSON.stringify(item.metadata) : null,
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async getAlert(alertId: string): Promise<TravelPriceAlert | null> {
    const result = await this.db.query<AlertRow>(
      'SELECT * FROM travel_price_alerts WHERE id = ?',
      [alertId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToAlert(result.rows[0]);
  }

  async updateAlert(alertId: string, updates: Partial<TravelPriceAlert>): Promise<TravelPriceAlert | null> {
    const existing = await this.getAlert(alertId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const updated: TravelPriceAlert = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    await this.db.execute(
      `UPDATE travel_price_alerts SET
        type = ?, origin = ?, destination = ?, outbound_date = ?, return_date = ?,
        target_price = ?, current_price = ?, lowest_price = ?, lowest_price_date = ?,
        price_history = ?, is_active = ?, notification_channels = ?, last_checked_at = ?,
        triggered_at = ?, metadata = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.type,
        updated.origin ?? null,
        updated.destination,
        updated.outboundDate,
        updated.returnDate ?? null,
        updated.targetPrice,
        updated.currentPrice ?? null,
        updated.lowestPrice ?? null,
        updated.lowestPriceDate ?? null,
        JSON.stringify(updated.priceHistory),
        updated.isActive ? 1 : 0,
        JSON.stringify(updated.notificationChannels),
        updated.lastCheckedAt ?? null,
        updated.triggeredAt ?? null,
        updated.metadata ? JSON.stringify(updated.metadata) : null,
        updated.updatedAt,
        alertId,
      ]
    );

    return updated;
  }

  async deleteAlert(alertId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM travel_price_alerts WHERE id = ?',
      [alertId]
    );
    return result.changes > 0;
  }

  async listAlerts(userId: string, options: PriceAlertQueryOptions = {}): Promise<TravelPriceAlert[]> {
    const { sql, params } = this.buildAlertQuerySQL(userId, options);
    const result = await this.db.query<AlertRow>(sql, params);
    return result.rows.map(row => this.rowToAlert(row));
  }

  async countAlerts(userId: string, options: PriceAlertQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildAlertQuerySQL(userId, options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async addPricePoint(alertId: string, pricePoint: TravelPricePoint): Promise<TravelPriceAlert | null> {
    const alert = await this.getAlert(alertId);
    if (!alert) {
      return null;
    }

    alert.priceHistory.push(pricePoint);

    const updates: Partial<TravelPriceAlert> = {
      priceHistory: alert.priceHistory,
      currentPrice: pricePoint.price,
      lastCheckedAt: pricePoint.timestamp,
    };

    if (!alert.lowestPrice || pricePoint.price < alert.lowestPrice) {
      updates.lowestPrice = pricePoint.price;
      updates.lowestPriceDate = pricePoint.timestamp;
    }

    return this.updateAlert(alertId, updates);
  }

  async updateCurrentPrice(alertId: string, price: number, source?: string): Promise<TravelPriceAlert | null> {
    const pricePoint: TravelPricePoint = {
      price,
      timestamp: Date.now(),
      source,
    };
    return this.addPricePoint(alertId, pricePoint);
  }

  async getAlertsToCheck(type?: TravelPriceAlertType, limit = 100): Promise<TravelPriceAlert[]> {
    let sql = `SELECT * FROM travel_price_alerts WHERE is_active = 1 AND triggered_at IS NULL`;
    const params: unknown[] = [];

    if (type) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY last_checked_at ASC NULLS FIRST LIMIT ?`;
    params.push(limit);

    const result = await this.db.query<AlertRow>(sql, params);
    return result.rows.map(row => this.rowToAlert(row));
  }

  async activateAlert(alertId: string): Promise<TravelPriceAlert | null> {
    return this.updateAlert(alertId, { isActive: true });
  }

  async deactivateAlert(alertId: string): Promise<TravelPriceAlert | null> {
    return this.updateAlert(alertId, { isActive: false });
  }

  async markAlertTriggered(alertId: string): Promise<TravelPriceAlert | null> {
    return this.updateAlert(alertId, { triggeredAt: Date.now(), isActive: false });
  }

  async getTriggeredAlerts(userId: string): Promise<TravelPriceAlert[]> {
    const result = await this.db.query<AlertRow>(
      'SELECT * FROM travel_price_alerts WHERE user_id = ? AND triggered_at IS NOT NULL ORDER BY triggered_at DESC',
      [userId]
    );
    return result.rows.map(row => this.rowToAlert(row));
  }

  async getActiveAlertsByDestination(userId: string, destination: string): Promise<TravelPriceAlert[]> {
    const result = await this.db.query<AlertRow>(
      'SELECT * FROM travel_price_alerts WHERE user_id = ? AND destination LIKE ? AND is_active = 1',
      [userId, `%${destination}%`]
    );
    return result.rows.map(row => this.rowToAlert(row));
  }

  private buildAlertQuerySQL(
    userId: string,
    options: PriceAlertQueryOptions,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (options.type && options.type.length > 0) {
      const placeholders = options.type.map(() => '?').join(',');
      conditions.push(`type IN (${placeholders})`);
      params.push(...options.type);
    }

    if (options.isActive !== undefined) {
      conditions.push('is_active = ?');
      params.push(options.isActive ? 1 : 0);
    }

    if (options.destination) {
      conditions.push('destination LIKE ?');
      params.push(`%${options.destination}%`);
    }

    const whereClause = conditions.join(' AND ');

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM travel_price_alerts WHERE ${whereClause}`,
        params,
      };
    }

    let sql = `SELECT * FROM travel_price_alerts WHERE ${whereClause} ORDER BY created_at DESC`;

    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    return { sql, params };
  }

  private rowToAlert(row: AlertRow): TravelPriceAlert {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type as TravelPriceAlertType,
      origin: row.origin ?? undefined,
      destination: row.destination,
      outboundDate: row.outbound_date,
      returnDate: row.return_date ?? undefined,
      targetPrice: row.target_price,
      currentPrice: row.current_price ?? undefined,
      lowestPrice: row.lowest_price ?? undefined,
      lowestPriceDate: row.lowest_price_date ?? undefined,
      priceHistory: JSON.parse(row.price_history),
      isActive: row.is_active === 1,
      notificationChannels: JSON.parse(row.notification_channels),
      lastCheckedAt: row.last_checked_at ?? undefined,
      triggeredAt: row.triggered_at ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * In-memory travel price alert store for testing
 */
export class InMemoryTravelPriceAlertStore implements TravelPriceAlertStore {
  private alerts = new Map<string, TravelPriceAlert>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async createAlert(alert: Omit<TravelPriceAlert, 'id' | 'createdAt' | 'updatedAt'>): Promise<TravelPriceAlert> {
    const now = Date.now();
    const item: TravelPriceAlert = {
      ...alert,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.alerts.set(item.id, item);
    return item;
  }

  async getAlert(alertId: string): Promise<TravelPriceAlert | null> {
    return this.alerts.get(alertId) ?? null;
  }

  async updateAlert(alertId: string, updates: Partial<TravelPriceAlert>): Promise<TravelPriceAlert | null> {
    const existing = this.alerts.get(alertId);
    if (!existing) return null;

    const updated: TravelPriceAlert = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    this.alerts.set(alertId, updated);
    return updated;
  }

  async deleteAlert(alertId: string): Promise<boolean> {
    return this.alerts.delete(alertId);
  }

  async listAlerts(userId: string, options: PriceAlertQueryOptions = {}): Promise<TravelPriceAlert[]> {
    let items = Array.from(this.alerts.values()).filter(a => a.userId === userId);

    if (options.type && options.type.length > 0) {
      items = items.filter(a => options.type!.includes(a.type));
    }

    if (options.isActive !== undefined) {
      items = items.filter(a => a.isActive === options.isActive);
    }

    if (options.destination) {
      const dest = options.destination.toLowerCase();
      items = items.filter(a => a.destination.toLowerCase().includes(dest));
    }

    items.sort((a, b) => b.createdAt - a.createdAt);

    if (options.offset) {
      items = items.slice(options.offset);
    }

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  async countAlerts(userId: string, options: PriceAlertQueryOptions = {}): Promise<number> {
    const items = await this.listAlerts(userId, { ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async addPricePoint(alertId: string, pricePoint: TravelPricePoint): Promise<TravelPriceAlert | null> {
    const alert = this.alerts.get(alertId);
    if (!alert) return null;

    alert.priceHistory.push(pricePoint);
    alert.currentPrice = pricePoint.price;
    alert.lastCheckedAt = pricePoint.timestamp;

    if (!alert.lowestPrice || pricePoint.price < alert.lowestPrice) {
      alert.lowestPrice = pricePoint.price;
      alert.lowestPriceDate = pricePoint.timestamp;
    }

    alert.updatedAt = Date.now();
    return alert;
  }

  async updateCurrentPrice(alertId: string, price: number, source?: string): Promise<TravelPriceAlert | null> {
    return this.addPricePoint(alertId, { price, timestamp: Date.now(), source });
  }

  async getAlertsToCheck(type?: TravelPriceAlertType, limit = 100): Promise<TravelPriceAlert[]> {
    let items = Array.from(this.alerts.values())
      .filter(a => a.isActive && !a.triggeredAt);

    if (type) {
      items = items.filter(a => a.type === type);
    }

    items.sort((a, b) => (a.lastCheckedAt ?? 0) - (b.lastCheckedAt ?? 0));

    return items.slice(0, limit);
  }

  async activateAlert(alertId: string): Promise<TravelPriceAlert | null> {
    return this.updateAlert(alertId, { isActive: true });
  }

  async deactivateAlert(alertId: string): Promise<TravelPriceAlert | null> {
    return this.updateAlert(alertId, { isActive: false });
  }

  async markAlertTriggered(alertId: string): Promise<TravelPriceAlert | null> {
    return this.updateAlert(alertId, { triggeredAt: Date.now(), isActive: false });
  }

  async getTriggeredAlerts(userId: string): Promise<TravelPriceAlert[]> {
    return Array.from(this.alerts.values())
      .filter(a => a.userId === userId && a.triggeredAt)
      .sort((a, b) => (b.triggeredAt ?? 0) - (a.triggeredAt ?? 0));
  }

  async getActiveAlertsByDestination(userId: string, destination: string): Promise<TravelPriceAlert[]> {
    const dest = destination.toLowerCase();
    return Array.from(this.alerts.values())
      .filter(a => a.userId === userId && a.isActive && a.destination.toLowerCase().includes(dest));
  }
}

// Row type for database
interface AlertRow {
  id: string;
  user_id: string;
  type: string;
  origin: string | null;
  destination: string;
  outbound_date: number;
  return_date: number | null;
  target_price: number;
  current_price: number | null;
  lowest_price: number | null;
  lowest_price_date: number | null;
  price_history: string;
  is_active: number;
  notification_channels: string;
  last_checked_at: number | null;
  triggered_at: number | null;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Factory function to create travel price alert store
 */
export function createTravelPriceAlertStore(type: 'memory'): InMemoryTravelPriceAlertStore;
export function createTravelPriceAlertStore(type: 'database', db: DatabaseAdapter): DatabaseTravelPriceAlertStore;
export function createTravelPriceAlertStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): TravelPriceAlertStore {
  if (type === 'memory') {
    return new InMemoryTravelPriceAlertStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseTravelPriceAlertStore(db);
}
