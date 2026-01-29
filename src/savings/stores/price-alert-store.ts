/**
 * Price Alert Store
 *
 * Persistence layer for price monitoring alerts and history.
 */

import { randomUUID } from 'crypto';
import type {
  PriceAlert,
  PricePoint,
  PriceAlertQueryOptions,
} from '../types.js';

/**
 * Interface for price alert storage
 */
export interface PriceAlertStore {
  initialize(): Promise<void>;

  // CRUD operations
  create(alert: Omit<PriceAlert, 'id' | 'createdAt' | 'updatedAt'>): Promise<PriceAlert>;
  get(alertId: string): Promise<PriceAlert | null>;
  update(alertId: string, updates: Partial<PriceAlert>): Promise<PriceAlert | null>;
  delete(alertId: string): Promise<boolean>;

  // Query operations
  list(userId: string, options?: PriceAlertQueryOptions): Promise<PriceAlert[]>;
  count(userId: string, options?: PriceAlertQueryOptions): Promise<number>;

  // Specialized queries
  getActive(userId: string): Promise<PriceAlert[]>;
  getTriggered(userId: string): Promise<PriceAlert[]>;
  getByUrl(userId: string, productUrl: string): Promise<PriceAlert | null>;
  getByRetailer(userId: string, retailer: string): Promise<PriceAlert[]>;

  // Price history operations
  addPricePoint(alertId: string, point: PricePoint): Promise<boolean>;
  getPriceHistory(alertId: string, limit?: number): Promise<PricePoint[]>;
  getLowestPrice(alertId: string): Promise<number | null>;

  // Batch operations for monitoring
  getAlertsToCheck(batchSize: number): Promise<PriceAlert[]>;
  updatePrices(updates: Array<{ alertId: string; price: number; inStock: boolean }>): Promise<number>;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Database-backed price alert store
 */
export class DatabasePriceAlertStore implements PriceAlertStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS price_alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        product_url TEXT NOT NULL,
        product_name TEXT NOT NULL,
        product_image TEXT,
        retailer TEXT NOT NULL,
        target_price REAL NOT NULL,
        current_price REAL,
        original_price REAL NOT NULL,
        alert_type TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        price_history TEXT DEFAULT '[]',
        notification_channels TEXT DEFAULT '[]',
        last_checked_at INTEGER,
        triggered_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_price_alerts_user_active ON price_alerts(user_id, is_active)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_price_alerts_last_checked ON price_alerts(is_active, last_checked_at)
    `);

    await this.db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_price_alerts_user_url ON price_alerts(user_id, product_url)
    `);
  }

  async create(alert: Omit<PriceAlert, 'id' | 'createdAt' | 'updatedAt'>): Promise<PriceAlert> {
    const now = Date.now();
    const id = randomUUID();

    const item: PriceAlert = {
      ...alert,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO price_alerts (
        id, user_id, product_url, product_name, product_image, retailer, target_price,
        current_price, original_price, alert_type, is_active, price_history,
        notification_channels, last_checked_at, triggered_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.productUrl,
        item.productName,
        item.productImage ?? null,
        item.retailer,
        item.targetPrice,
        item.currentPrice,
        item.originalPrice,
        item.alertType,
        item.isActive ? 1 : 0,
        JSON.stringify(item.priceHistory),
        JSON.stringify(item.notificationChannels),
        item.lastCheckedAt ?? null,
        item.triggeredAt ?? null,
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async get(alertId: string): Promise<PriceAlert | null> {
    const result = await this.db.query<PriceAlertRow>(
      'SELECT * FROM price_alerts WHERE id = ?',
      [alertId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToAlert(result.rows[0]);
  }

  async update(alertId: string, updates: Partial<PriceAlert>): Promise<PriceAlert | null> {
    const existing = await this.get(alertId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const updated: PriceAlert = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    await this.db.execute(
      `UPDATE price_alerts SET
        product_url = ?, product_name = ?, product_image = ?, retailer = ?, target_price = ?,
        current_price = ?, original_price = ?, alert_type = ?, is_active = ?, price_history = ?,
        notification_channels = ?, last_checked_at = ?, triggered_at = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.productUrl,
        updated.productName,
        updated.productImage ?? null,
        updated.retailer,
        updated.targetPrice,
        updated.currentPrice,
        updated.originalPrice,
        updated.alertType,
        updated.isActive ? 1 : 0,
        JSON.stringify(updated.priceHistory),
        JSON.stringify(updated.notificationChannels),
        updated.lastCheckedAt ?? null,
        updated.triggeredAt ?? null,
        updated.updatedAt,
        alertId,
      ]
    );

    return updated;
  }

  async delete(alertId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM price_alerts WHERE id = ?',
      [alertId]
    );
    return result.changes > 0;
  }

  async list(userId: string, options: PriceAlertQueryOptions = {}): Promise<PriceAlert[]> {
    const { sql, params } = this.buildQuerySQL(userId, options);
    const result = await this.db.query<PriceAlertRow>(sql, params);
    return result.rows.map(row => this.rowToAlert(row));
  }

  async count(userId: string, options: PriceAlertQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildQuerySQL(userId, options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async getActive(userId: string): Promise<PriceAlert[]> {
    return this.list(userId, { isActive: true });
  }

  async getTriggered(userId: string): Promise<PriceAlert[]> {
    const result = await this.db.query<PriceAlertRow>(
      'SELECT * FROM price_alerts WHERE user_id = ? AND triggered_at IS NOT NULL ORDER BY triggered_at DESC',
      [userId]
    );
    return result.rows.map(row => this.rowToAlert(row));
  }

  async getByUrl(userId: string, productUrl: string): Promise<PriceAlert | null> {
    const result = await this.db.query<PriceAlertRow>(
      'SELECT * FROM price_alerts WHERE user_id = ? AND product_url = ?',
      [userId, productUrl]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToAlert(result.rows[0]);
  }

  async getByRetailer(userId: string, retailer: string): Promise<PriceAlert[]> {
    const result = await this.db.query<PriceAlertRow>(
      'SELECT * FROM price_alerts WHERE user_id = ? AND retailer = ? ORDER BY created_at DESC',
      [userId, retailer]
    );
    return result.rows.map(row => this.rowToAlert(row));
  }

  async addPricePoint(alertId: string, point: PricePoint): Promise<boolean> {
    const alert = await this.get(alertId);
    if (!alert) {
      return false;
    }

    alert.priceHistory.push(point);

    // Trim history if too long (keep last 1000 points)
    if (alert.priceHistory.length > 1000) {
      alert.priceHistory = alert.priceHistory.slice(-1000);
    }

    await this.update(alertId, {
      priceHistory: alert.priceHistory,
      currentPrice: point.price,
      lastCheckedAt: point.timestamp,
    });

    return true;
  }

  async getPriceHistory(alertId: string, limit = 100): Promise<PricePoint[]> {
    const alert = await this.get(alertId);
    if (!alert) {
      return [];
    }

    return alert.priceHistory.slice(-limit);
  }

  async getLowestPrice(alertId: string): Promise<number | null> {
    const alert = await this.get(alertId);
    if (!alert || alert.priceHistory.length === 0) {
      return null;
    }

    return Math.min(...alert.priceHistory.map(p => p.price));
  }

  async getAlertsToCheck(batchSize: number): Promise<PriceAlert[]> {
    const result = await this.db.query<PriceAlertRow>(
      `SELECT * FROM price_alerts
       WHERE is_active = 1
       ORDER BY last_checked_at ASC NULLS FIRST
       LIMIT ?`,
      [batchSize]
    );
    return result.rows.map(row => this.rowToAlert(row));
  }

  async updatePrices(updates: Array<{ alertId: string; price: number; inStock: boolean }>): Promise<number> {
    const now = Date.now();
    let updated = 0;

    for (const update of updates) {
      const alert = await this.get(update.alertId);
      if (!alert) continue;

      // Add price point
      alert.priceHistory.push({
        price: update.price,
        timestamp: now,
        inStock: update.inStock,
      });

      // Check if alert should trigger
      let triggered = false;
      if (alert.alertType === 'below' && update.price <= alert.targetPrice) {
        triggered = true;
      } else if (alert.alertType === 'drop-percent') {
        const dropPercent = ((alert.originalPrice - update.price) / alert.originalPrice) * 100;
        if (dropPercent >= alert.targetPrice) {
          triggered = true;
        }
      } else if (alert.alertType === 'all-time-low') {
        const lowestPrice = Math.min(...alert.priceHistory.map(p => p.price));
        if (update.price <= lowestPrice) {
          triggered = true;
        }
      } else if (alert.alertType === 'back-in-stock' && update.inStock) {
        const wasOutOfStock = alert.priceHistory.length > 1 &&
          !alert.priceHistory[alert.priceHistory.length - 2]?.inStock;
        if (wasOutOfStock) {
          triggered = true;
        }
      }

      await this.update(update.alertId, {
        currentPrice: update.price,
        priceHistory: alert.priceHistory.slice(-1000),
        lastCheckedAt: now,
        triggeredAt: triggered ? now : alert.triggeredAt,
      });

      updated++;
    }

    return updated;
  }

  private buildQuerySQL(
    userId: string,
    options: PriceAlertQueryOptions,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (options.isActive !== undefined) {
      conditions.push('is_active = ?');
      params.push(options.isActive ? 1 : 0);
    }

    if (options.alertType && options.alertType.length > 0) {
      const placeholders = options.alertType.map(() => '?').join(',');
      conditions.push(`alert_type IN (${placeholders})`);
      params.push(...options.alertType);
    }

    if (options.retailer) {
      conditions.push('retailer = ?');
      params.push(options.retailer);
    }

    const whereClause = conditions.join(' AND ');

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM price_alerts WHERE ${whereClause}`,
        params,
      };
    }

    let sql = `SELECT * FROM price_alerts WHERE ${whereClause} ORDER BY created_at DESC`;

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

  private rowToAlert(row: PriceAlertRow): PriceAlert {
    return {
      id: row.id,
      userId: row.user_id,
      productUrl: row.product_url,
      productName: row.product_name,
      productImage: row.product_image ?? undefined,
      retailer: row.retailer,
      targetPrice: row.target_price,
      currentPrice: row.current_price,
      originalPrice: row.original_price,
      alertType: row.alert_type as PriceAlert['alertType'],
      isActive: row.is_active === 1,
      priceHistory: JSON.parse(row.price_history),
      notificationChannels: JSON.parse(row.notification_channels),
      lastCheckedAt: row.last_checked_at ?? undefined,
      triggeredAt: row.triggered_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * In-memory price alert store for testing
 */
export class InMemoryPriceAlertStore implements PriceAlertStore {
  private alerts = new Map<string, PriceAlert>();

  async initialize(): Promise<void> {
    // No-op
  }

  async create(alert: Omit<PriceAlert, 'id' | 'createdAt' | 'updatedAt'>): Promise<PriceAlert> {
    const now = Date.now();
    const item: PriceAlert = {
      ...alert,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.alerts.set(item.id, item);
    return item;
  }

  async get(alertId: string): Promise<PriceAlert | null> {
    return this.alerts.get(alertId) ?? null;
  }

  async update(alertId: string, updates: Partial<PriceAlert>): Promise<PriceAlert | null> {
    const existing = this.alerts.get(alertId);
    if (!existing) return null;

    const updated: PriceAlert = {
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

  async delete(alertId: string): Promise<boolean> {
    return this.alerts.delete(alertId);
  }

  async list(userId: string, options: PriceAlertQueryOptions = {}): Promise<PriceAlert[]> {
    let items = Array.from(this.alerts.values()).filter(a => a.userId === userId);

    if (options.isActive !== undefined) {
      items = items.filter(a => a.isActive === options.isActive);
    }

    if (options.alertType && options.alertType.length > 0) {
      items = items.filter(a => options.alertType!.includes(a.alertType));
    }

    if (options.retailer) {
      items = items.filter(a => a.retailer === options.retailer);
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

  async count(userId: string, options: PriceAlertQueryOptions = {}): Promise<number> {
    const items = await this.list(userId, { ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async getActive(userId: string): Promise<PriceAlert[]> {
    return this.list(userId, { isActive: true });
  }

  async getTriggered(userId: string): Promise<PriceAlert[]> {
    return Array.from(this.alerts.values())
      .filter(a => a.userId === userId && a.triggeredAt)
      .sort((a, b) => (b.triggeredAt ?? 0) - (a.triggeredAt ?? 0));
  }

  async getByUrl(userId: string, productUrl: string): Promise<PriceAlert | null> {
    return Array.from(this.alerts.values())
      .find(a => a.userId === userId && a.productUrl === productUrl) ?? null;
  }

  async getByRetailer(userId: string, retailer: string): Promise<PriceAlert[]> {
    return Array.from(this.alerts.values())
      .filter(a => a.userId === userId && a.retailer === retailer)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async addPricePoint(alertId: string, point: PricePoint): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.priceHistory.push(point);
    if (alert.priceHistory.length > 1000) {
      alert.priceHistory = alert.priceHistory.slice(-1000);
    }
    alert.currentPrice = point.price;
    alert.lastCheckedAt = point.timestamp;
    alert.updatedAt = Date.now();
    return true;
  }

  async getPriceHistory(alertId: string, limit = 100): Promise<PricePoint[]> {
    const alert = this.alerts.get(alertId);
    return alert?.priceHistory.slice(-limit) ?? [];
  }

  async getLowestPrice(alertId: string): Promise<number | null> {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.priceHistory.length === 0) return null;
    return Math.min(...alert.priceHistory.map(p => p.price));
  }

  async getAlertsToCheck(batchSize: number): Promise<PriceAlert[]> {
    return Array.from(this.alerts.values())
      .filter(a => a.isActive)
      .sort((a, b) => (a.lastCheckedAt ?? 0) - (b.lastCheckedAt ?? 0))
      .slice(0, batchSize);
  }

  async updatePrices(updates: Array<{ alertId: string; price: number; inStock: boolean }>): Promise<number> {
    const now = Date.now();
    let updated = 0;

    for (const update of updates) {
      const alert = this.alerts.get(update.alertId);
      if (!alert) continue;

      alert.priceHistory.push({
        price: update.price,
        timestamp: now,
        inStock: update.inStock,
      });

      if (alert.priceHistory.length > 1000) {
        alert.priceHistory = alert.priceHistory.slice(-1000);
      }

      // Check triggers
      let triggered = false;
      if (alert.alertType === 'below' && update.price <= alert.targetPrice) {
        triggered = true;
      } else if (alert.alertType === 'drop-percent') {
        const dropPercent = ((alert.originalPrice - update.price) / alert.originalPrice) * 100;
        if (dropPercent >= alert.targetPrice) triggered = true;
      } else if (alert.alertType === 'all-time-low') {
        const lowestPrice = Math.min(...alert.priceHistory.map(p => p.price));
        if (update.price <= lowestPrice) triggered = true;
      }

      alert.currentPrice = update.price;
      alert.lastCheckedAt = now;
      if (triggered) alert.triggeredAt = now;
      alert.updatedAt = now;

      updated++;
    }

    return updated;
  }
}

// Row type for database
interface PriceAlertRow {
  id: string;
  user_id: string;
  product_url: string;
  product_name: string;
  product_image: string | null;
  retailer: string;
  target_price: number;
  current_price: number;
  original_price: number;
  alert_type: string;
  is_active: number;
  price_history: string;
  notification_channels: string;
  last_checked_at: number | null;
  triggered_at: number | null;
  created_at: number;
  updated_at: number;
}

/**
 * Factory function to create price alert store
 */
export function createPriceAlertStore(type: 'memory'): InMemoryPriceAlertStore;
export function createPriceAlertStore(type: 'database', db: DatabaseAdapter): DatabasePriceAlertStore;
export function createPriceAlertStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): PriceAlertStore {
  if (type === 'memory') {
    return new InMemoryPriceAlertStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabasePriceAlertStore(db);
}
