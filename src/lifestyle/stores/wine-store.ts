/**
 * Wine Store
 *
 * Persistence layer for wines and wine inventory.
 */

import { randomUUID } from 'crypto';
import type {
  Wine,
  WineInventory,
  WineConsumption,
  WineType,
  WineInventoryStatus,
  WineQueryOptions,
  WineInventoryQueryOptions,
} from '../types.js';

/**
 * Interface for wine storage
 */
export interface WineStore {
  initialize(): Promise<void>;

  // Wine CRUD
  createWine(wine: Omit<Wine, 'id' | 'createdAt' | 'updatedAt'>): Promise<Wine>;
  getWine(wineId: string): Promise<Wine | null>;
  updateWine(wineId: string, updates: Partial<Wine>): Promise<Wine | null>;
  deleteWine(wineId: string): Promise<boolean>;
  listWines(userId: string, options?: WineQueryOptions): Promise<Wine[]>;
  countWines(userId: string, options?: WineQueryOptions): Promise<number>;
  searchWines(userId: string, query: string): Promise<Wine[]>;

  // Inventory CRUD
  addToInventory(inventory: Omit<WineInventory, 'id' | 'createdAt' | 'updatedAt'>): Promise<WineInventory>;
  getInventoryItem(inventoryId: string): Promise<WineInventory | null>;
  updateInventoryItem(inventoryId: string, updates: Partial<WineInventory>): Promise<WineInventory | null>;
  deleteInventoryItem(inventoryId: string): Promise<boolean>;
  listInventory(userId: string, options?: WineInventoryQueryOptions): Promise<WineInventory[]>;
  getInventoryByWine(wineId: string): Promise<WineInventory[]>;
  getTotalQuantity(userId: string, wineId?: string): Promise<number>;

  // Consumption tracking
  recordConsumption(consumption: Omit<WineConsumption, 'id'>): Promise<WineConsumption>;
  getConsumptionHistory(userId: string, limit?: number): Promise<WineConsumption[]>;
  getConsumptionByWine(wineId: string): Promise<WineConsumption[]>;

  // Specialty queries
  getWinesInDrinkingWindow(userId: string): Promise<Array<{ wine: Wine; inventory: WineInventory }>>;
  getWinesExpiringSoon(userId: string, days: number): Promise<Array<{ wine: Wine; inventory: WineInventory }>>;
  getLowStockWines(userId: string, threshold: number): Promise<Wine[]>;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Database-backed wine store
 */
export class DatabaseWineStore implements WineStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Wines table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS wines (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        producer TEXT NOT NULL,
        vintage INTEGER NOT NULL,
        type TEXT NOT NULL,
        style TEXT,
        region TEXT NOT NULL,
        country TEXT NOT NULL,
        appellation TEXT,
        grape TEXT,
        rating REAL,
        community_rating REAL,
        price REAL,
        currency TEXT DEFAULT 'USD',
        barcode TEXT,
        external_id TEXT,
        image_url TEXT,
        description TEXT,
        tasting_notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_wines_user ON wines(user_id)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_wines_type ON wines(user_id, type)
    `);

    // Wine inventory table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS wine_inventory (
        id TEXT PRIMARY KEY,
        wine_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        location TEXT,
        bin TEXT,
        purchase_date INTEGER,
        purchase_price REAL,
        drinking_window_start INTEGER,
        drinking_window_end INTEGER,
        peak_year INTEGER,
        status TEXT DEFAULT 'in_cellar',
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_wine_inventory_user ON wine_inventory(user_id)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_wine_inventory_wine ON wine_inventory(wine_id)
    `);

    // Wine consumption table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS wine_consumption (
        id TEXT PRIMARY KEY,
        inventory_id TEXT NOT NULL,
        wine_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        consumed_at INTEGER NOT NULL,
        occasion TEXT,
        rating REAL,
        notes TEXT,
        paired_with TEXT
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_wine_consumption_user ON wine_consumption(user_id)
    `);
  }

  async createWine(wine: Omit<Wine, 'id' | 'createdAt' | 'updatedAt'>): Promise<Wine> {
    const now = Date.now();
    const id = randomUUID();

    const item: Wine = {
      ...wine,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO wines (
        id, user_id, name, producer, vintage, type, style, region, country,
        appellation, grape, rating, community_rating, price, currency, barcode,
        external_id, image_url, description, tasting_notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.name,
        item.producer,
        item.vintage,
        item.type,
        item.style ?? null,
        item.region,
        item.country,
        item.appellation ?? null,
        item.grape ? JSON.stringify(item.grape) : null,
        item.rating ?? null,
        item.communityRating ?? null,
        item.price ?? null,
        item.currency ?? 'USD',
        item.barcode ?? null,
        item.externalId ?? null,
        item.imageUrl ?? null,
        item.description ?? null,
        item.tastingNotes ? JSON.stringify(item.tastingNotes) : null,
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async getWine(wineId: string): Promise<Wine | null> {
    const result = await this.db.query<WineRow>(
      'SELECT * FROM wines WHERE id = ?',
      [wineId]
    );
    return result.rows.length > 0 ? this.rowToWine(result.rows[0]) : null;
  }

  async updateWine(wineId: string, updates: Partial<Wine>): Promise<Wine | null> {
    const existing = await this.getWine(wineId);
    if (!existing) return null;

    const updated: Wine = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `UPDATE wines SET
        name = ?, producer = ?, vintage = ?, type = ?, style = ?, region = ?,
        country = ?, appellation = ?, grape = ?, rating = ?, community_rating = ?,
        price = ?, currency = ?, barcode = ?, external_id = ?, image_url = ?,
        description = ?, tasting_notes = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.producer,
        updated.vintage,
        updated.type,
        updated.style ?? null,
        updated.region,
        updated.country,
        updated.appellation ?? null,
        updated.grape ? JSON.stringify(updated.grape) : null,
        updated.rating ?? null,
        updated.communityRating ?? null,
        updated.price ?? null,
        updated.currency ?? 'USD',
        updated.barcode ?? null,
        updated.externalId ?? null,
        updated.imageUrl ?? null,
        updated.description ?? null,
        updated.tastingNotes ? JSON.stringify(updated.tastingNotes) : null,
        updated.updatedAt,
        wineId,
      ]
    );

    return updated;
  }

  async deleteWine(wineId: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM wines WHERE id = ?', [wineId]);
    return result.changes > 0;
  }

  async listWines(userId: string, options: WineQueryOptions = {}): Promise<Wine[]> {
    const { sql, params } = this.buildWineQuerySQL(userId, options);
    const result = await this.db.query<WineRow>(sql, params);
    return result.rows.map(row => this.rowToWine(row));
  }

  async countWines(userId: string, options: WineQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildWineQuerySQL(userId, options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async searchWines(userId: string, query: string): Promise<Wine[]> {
    const result = await this.db.query<WineRow>(
      `SELECT * FROM wines WHERE user_id = ? AND (
        name LIKE ? OR producer LIKE ? OR region LIKE ? OR country LIKE ?
      ) ORDER BY name ASC LIMIT 50`,
      [userId, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]
    );
    return result.rows.map(row => this.rowToWine(row));
  }

  async addToInventory(inventory: Omit<WineInventory, 'id' | 'createdAt' | 'updatedAt'>): Promise<WineInventory> {
    const now = Date.now();
    const id = randomUUID();

    const item: WineInventory = {
      ...inventory,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO wine_inventory (
        id, wine_id, user_id, quantity, location, bin, purchase_date, purchase_price,
        drinking_window_start, drinking_window_end, peak_year, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.wineId,
        item.userId,
        item.quantity,
        item.location ?? null,
        item.bin ?? null,
        item.purchaseDate ?? null,
        item.purchasePrice ?? null,
        item.drinkingWindowStart ?? null,
        item.drinkingWindowEnd ?? null,
        item.peakYear ?? null,
        item.status,
        item.notes ?? null,
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async getInventoryItem(inventoryId: string): Promise<WineInventory | null> {
    const result = await this.db.query<InventoryRow>(
      'SELECT * FROM wine_inventory WHERE id = ?',
      [inventoryId]
    );
    return result.rows.length > 0 ? this.rowToInventory(result.rows[0]) : null;
  }

  async updateInventoryItem(inventoryId: string, updates: Partial<WineInventory>): Promise<WineInventory | null> {
    const existing = await this.getInventoryItem(inventoryId);
    if (!existing) return null;

    const updated: WineInventory = {
      ...existing,
      ...updates,
      id: existing.id,
      wineId: existing.wineId,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `UPDATE wine_inventory SET
        quantity = ?, location = ?, bin = ?, purchase_date = ?, purchase_price = ?,
        drinking_window_start = ?, drinking_window_end = ?, peak_year = ?, status = ?,
        notes = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.quantity,
        updated.location ?? null,
        updated.bin ?? null,
        updated.purchaseDate ?? null,
        updated.purchasePrice ?? null,
        updated.drinkingWindowStart ?? null,
        updated.drinkingWindowEnd ?? null,
        updated.peakYear ?? null,
        updated.status,
        updated.notes ?? null,
        updated.updatedAt,
        inventoryId,
      ]
    );

    return updated;
  }

  async deleteInventoryItem(inventoryId: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM wine_inventory WHERE id = ?', [inventoryId]);
    return result.changes > 0;
  }

  async listInventory(userId: string, options: WineInventoryQueryOptions = {}): Promise<WineInventory[]> {
    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (options.status && options.status.length > 0) {
      const placeholders = options.status.map(() => '?').join(',');
      conditions.push(`status IN (${placeholders})`);
      params.push(...options.status);
    }

    if (options.location) {
      conditions.push('location = ?');
      params.push(options.location);
    }

    let sql = `SELECT * FROM wine_inventory WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;

    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    const result = await this.db.query<InventoryRow>(sql, params);
    return result.rows.map(row => this.rowToInventory(row));
  }

  async getInventoryByWine(wineId: string): Promise<WineInventory[]> {
    const result = await this.db.query<InventoryRow>(
      'SELECT * FROM wine_inventory WHERE wine_id = ? ORDER BY created_at DESC',
      [wineId]
    );
    return result.rows.map(row => this.rowToInventory(row));
  }

  async getTotalQuantity(userId: string, wineId?: string): Promise<number> {
    let sql = `SELECT SUM(quantity) as total FROM wine_inventory WHERE user_id = ? AND status = 'in_cellar'`;
    const params: unknown[] = [userId];

    if (wineId) {
      sql += ` AND wine_id = ?`;
      params.push(wineId);
    }

    const result = await this.db.query<{ total: number | null }>(sql, params);
    return result.rows[0]?.total ?? 0;
  }

  async recordConsumption(consumption: Omit<WineConsumption, 'id'>): Promise<WineConsumption> {
    const id = randomUUID();
    const item: WineConsumption = { ...consumption, id };

    await this.db.execute(
      `INSERT INTO wine_consumption (
        id, inventory_id, wine_id, user_id, quantity, consumed_at, occasion, rating, notes, paired_with
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.inventoryId,
        item.wineId,
        item.userId,
        item.quantity,
        item.consumedAt,
        item.occasion ?? null,
        item.rating ?? null,
        item.notes ?? null,
        item.pairedWith ? JSON.stringify(item.pairedWith) : null,
      ]
    );

    return item;
  }

  async getConsumptionHistory(userId: string, limit = 50): Promise<WineConsumption[]> {
    const result = await this.db.query<ConsumptionRow>(
      'SELECT * FROM wine_consumption WHERE user_id = ? ORDER BY consumed_at DESC LIMIT ?',
      [userId, limit]
    );
    return result.rows.map(row => this.rowToConsumption(row));
  }

  async getConsumptionByWine(wineId: string): Promise<WineConsumption[]> {
    const result = await this.db.query<ConsumptionRow>(
      'SELECT * FROM wine_consumption WHERE wine_id = ? ORDER BY consumed_at DESC',
      [wineId]
    );
    return result.rows.map(row => this.rowToConsumption(row));
  }

  async getWinesInDrinkingWindow(userId: string): Promise<Array<{ wine: Wine; inventory: WineInventory }>> {
    const now = Date.now();
    const result = await this.db.query<InventoryRow & WineRow>(
      `SELECT i.*, w.* FROM wine_inventory i
       JOIN wines w ON i.wine_id = w.id
       WHERE i.user_id = ? AND i.status = 'in_cellar'
       AND i.drinking_window_start <= ? AND i.drinking_window_end >= ?`,
      [userId, now, now]
    );

    return result.rows.map(row => ({
      wine: this.rowToWine(row),
      inventory: this.rowToInventory(row),
    }));
  }

  async getWinesExpiringSoon(userId: string, days: number): Promise<Array<{ wine: Wine; inventory: WineInventory }>> {
    const now = Date.now();
    const future = now + (days * 24 * 60 * 60 * 1000);

    const result = await this.db.query<InventoryRow & WineRow>(
      `SELECT i.*, w.* FROM wine_inventory i
       JOIN wines w ON i.wine_id = w.id
       WHERE i.user_id = ? AND i.status = 'in_cellar'
       AND i.drinking_window_end IS NOT NULL
       AND i.drinking_window_end >= ? AND i.drinking_window_end <= ?`,
      [userId, now, future]
    );

    return result.rows.map(row => ({
      wine: this.rowToWine(row),
      inventory: this.rowToInventory(row),
    }));
  }

  async getLowStockWines(userId: string, threshold: number): Promise<Wine[]> {
    const result = await this.db.query<WineRow>(
      `SELECT w.* FROM wines w
       WHERE w.user_id = ? AND (
         SELECT COALESCE(SUM(i.quantity), 0) FROM wine_inventory i
         WHERE i.wine_id = w.id AND i.status = 'in_cellar'
       ) <= ?`,
      [userId, threshold]
    );
    return result.rows.map(row => this.rowToWine(row));
  }

  private buildWineQuerySQL(userId: string, options: WineQueryOptions, countOnly = false): { sql: string; params: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (options.type && options.type.length > 0) {
      const placeholders = options.type.map(() => '?').join(',');
      conditions.push(`type IN (${placeholders})`);
      params.push(...options.type);
    }

    if (options.country) {
      conditions.push('country = ?');
      params.push(options.country);
    }

    if (options.region) {
      conditions.push('region = ?');
      params.push(options.region);
    }

    if (options.vintageFrom) {
      conditions.push('vintage >= ?');
      params.push(options.vintageFrom);
    }

    if (options.vintageTo) {
      conditions.push('vintage <= ?');
      params.push(options.vintageTo);
    }

    if (options.minRating) {
      conditions.push('rating >= ?');
      params.push(options.minRating);
    }

    const whereClause = conditions.join(' AND ');

    if (countOnly) {
      return { sql: `SELECT COUNT(*) as count FROM wines WHERE ${whereClause}`, params };
    }

    let orderBy = 'name ASC';
    if (options.orderBy) {
      const direction = options.orderDirection === 'desc' ? 'DESC' : 'ASC';
      const column = { name: 'name', vintage: 'vintage', rating: 'rating', createdAt: 'created_at' }[options.orderBy];
      orderBy = `${column} ${direction}`;
    }

    let sql = `SELECT * FROM wines WHERE ${whereClause} ORDER BY ${orderBy}`;

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

  private rowToWine(row: WineRow): Wine {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      producer: row.producer,
      vintage: row.vintage,
      type: row.type as WineType,
      style: row.style as Wine['style'],
      region: row.region,
      country: row.country,
      appellation: row.appellation ?? undefined,
      grape: row.grape ? JSON.parse(row.grape) : undefined,
      rating: row.rating ?? undefined,
      communityRating: row.community_rating ?? undefined,
      price: row.price ?? undefined,
      currency: row.currency ?? undefined,
      barcode: row.barcode ?? undefined,
      externalId: row.external_id ?? undefined,
      imageUrl: row.image_url ?? undefined,
      description: row.description ?? undefined,
      tastingNotes: row.tasting_notes ? JSON.parse(row.tasting_notes) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToInventory(row: InventoryRow): WineInventory {
    return {
      id: row.id,
      wineId: row.wine_id,
      userId: row.user_id,
      quantity: row.quantity,
      location: row.location ?? undefined,
      bin: row.bin ?? undefined,
      purchaseDate: row.purchase_date ?? undefined,
      purchasePrice: row.purchase_price ?? undefined,
      drinkingWindowStart: row.drinking_window_start ?? undefined,
      drinkingWindowEnd: row.drinking_window_end ?? undefined,
      peakYear: row.peak_year ?? undefined,
      status: row.status as WineInventoryStatus,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToConsumption(row: ConsumptionRow): WineConsumption {
    return {
      id: row.id,
      inventoryId: row.inventory_id,
      wineId: row.wine_id,
      userId: row.user_id,
      quantity: row.quantity,
      consumedAt: row.consumed_at,
      occasion: row.occasion ?? undefined,
      rating: row.rating ?? undefined,
      notes: row.notes ?? undefined,
      pairedWith: row.paired_with ? JSON.parse(row.paired_with) : undefined,
    };
  }
}

/**
 * In-memory wine store for testing
 */
export class InMemoryWineStore implements WineStore {
  private wines = new Map<string, Wine>();
  private inventory = new Map<string, WineInventory>();
  private consumption = new Map<string, WineConsumption>();

  async initialize(): Promise<void> {}

  async createWine(wine: Omit<Wine, 'id' | 'createdAt' | 'updatedAt'>): Promise<Wine> {
    const now = Date.now();
    const item: Wine = { ...wine, id: randomUUID(), createdAt: now, updatedAt: now };
    this.wines.set(item.id, item);
    return item;
  }

  async getWine(wineId: string): Promise<Wine | null> {
    return this.wines.get(wineId) ?? null;
  }

  async updateWine(wineId: string, updates: Partial<Wine>): Promise<Wine | null> {
    const existing = this.wines.get(wineId);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id: existing.id, userId: existing.userId, createdAt: existing.createdAt, updatedAt: Date.now() };
    this.wines.set(wineId, updated);
    return updated;
  }

  async deleteWine(wineId: string): Promise<boolean> {
    return this.wines.delete(wineId);
  }

  async listWines(userId: string, options: WineQueryOptions = {}): Promise<Wine[]> {
    let items = Array.from(this.wines.values()).filter(w => w.userId === userId);
    if (options.type?.length) items = items.filter(w => options.type!.includes(w.type));
    if (options.country) items = items.filter(w => w.country === options.country);
    items.sort((a, b) => a.name.localeCompare(b.name));
    if (options.offset) items = items.slice(options.offset);
    if (options.limit) items = items.slice(0, options.limit);
    return items;
  }

  async countWines(userId: string, options: WineQueryOptions = {}): Promise<number> {
    return (await this.listWines(userId, { ...options, limit: undefined, offset: undefined })).length;
  }

  async searchWines(userId: string, query: string): Promise<Wine[]> {
    const q = query.toLowerCase();
    return Array.from(this.wines.values()).filter(w =>
      w.userId === userId && (w.name.toLowerCase().includes(q) || w.producer.toLowerCase().includes(q))
    );
  }

  async addToInventory(inventory: Omit<WineInventory, 'id' | 'createdAt' | 'updatedAt'>): Promise<WineInventory> {
    const now = Date.now();
    const item: WineInventory = { ...inventory, id: randomUUID(), createdAt: now, updatedAt: now };
    this.inventory.set(item.id, item);
    return item;
  }

  async getInventoryItem(inventoryId: string): Promise<WineInventory | null> {
    return this.inventory.get(inventoryId) ?? null;
  }

  async updateInventoryItem(inventoryId: string, updates: Partial<WineInventory>): Promise<WineInventory | null> {
    const existing = this.inventory.get(inventoryId);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id: existing.id, wineId: existing.wineId, userId: existing.userId, createdAt: existing.createdAt, updatedAt: Date.now() };
    this.inventory.set(inventoryId, updated);
    return updated;
  }

  async deleteInventoryItem(inventoryId: string): Promise<boolean> {
    return this.inventory.delete(inventoryId);
  }

  async listInventory(userId: string, options: WineInventoryQueryOptions = {}): Promise<WineInventory[]> {
    let items = Array.from(this.inventory.values()).filter(i => i.userId === userId);
    if (options.status?.length) items = items.filter(i => options.status!.includes(i.status));
    if (options.location) items = items.filter(i => i.location === options.location);
    if (options.offset) items = items.slice(options.offset);
    if (options.limit) items = items.slice(0, options.limit);
    return items;
  }

  async getInventoryByWine(wineId: string): Promise<WineInventory[]> {
    return Array.from(this.inventory.values()).filter(i => i.wineId === wineId);
  }

  async getTotalQuantity(userId: string, wineId?: string): Promise<number> {
    return Array.from(this.inventory.values())
      .filter(i => i.userId === userId && i.status === 'in_cellar' && (!wineId || i.wineId === wineId))
      .reduce((sum, i) => sum + i.quantity, 0);
  }

  async recordConsumption(consumption: Omit<WineConsumption, 'id'>): Promise<WineConsumption> {
    const item: WineConsumption = { ...consumption, id: randomUUID() };
    this.consumption.set(item.id, item);
    return item;
  }

  async getConsumptionHistory(userId: string, limit = 50): Promise<WineConsumption[]> {
    return Array.from(this.consumption.values())
      .filter(c => c.userId === userId)
      .sort((a, b) => b.consumedAt - a.consumedAt)
      .slice(0, limit);
  }

  async getConsumptionByWine(wineId: string): Promise<WineConsumption[]> {
    return Array.from(this.consumption.values()).filter(c => c.wineId === wineId);
  }

  async getWinesInDrinkingWindow(userId: string): Promise<Array<{ wine: Wine; inventory: WineInventory }>> {
    const now = Date.now();
    const results: Array<{ wine: Wine; inventory: WineInventory }> = [];
    for (const inv of this.inventory.values()) {
      if (inv.userId === userId && inv.status === 'in_cellar' &&
          inv.drinkingWindowStart && inv.drinkingWindowEnd &&
          inv.drinkingWindowStart <= now && inv.drinkingWindowEnd >= now) {
        const wine = this.wines.get(inv.wineId);
        if (wine) results.push({ wine, inventory: inv });
      }
    }
    return results;
  }

  async getWinesExpiringSoon(userId: string, days: number): Promise<Array<{ wine: Wine; inventory: WineInventory }>> {
    const now = Date.now();
    const future = now + (days * 24 * 60 * 60 * 1000);
    const results: Array<{ wine: Wine; inventory: WineInventory }> = [];
    for (const inv of this.inventory.values()) {
      if (inv.userId === userId && inv.status === 'in_cellar' &&
          inv.drinkingWindowEnd && inv.drinkingWindowEnd >= now && inv.drinkingWindowEnd <= future) {
        const wine = this.wines.get(inv.wineId);
        if (wine) results.push({ wine, inventory: inv });
      }
    }
    return results;
  }

  async getLowStockWines(userId: string, threshold: number): Promise<Wine[]> {
    const results: Wine[] = [];
    for (const wine of this.wines.values()) {
      if (wine.userId === userId) {
        const qty = await this.getTotalQuantity(userId, wine.id);
        if (qty <= threshold) results.push(wine);
      }
    }
    return results;
  }
}

// Row types
interface WineRow {
  id: string;
  user_id: string;
  name: string;
  producer: string;
  vintage: number;
  type: string;
  style: string | null;
  region: string;
  country: string;
  appellation: string | null;
  grape: string | null;
  rating: number | null;
  community_rating: number | null;
  price: number | null;
  currency: string | null;
  barcode: string | null;
  external_id: string | null;
  image_url: string | null;
  description: string | null;
  tasting_notes: string | null;
  created_at: number;
  updated_at: number;
}

interface InventoryRow {
  id: string;
  wine_id: string;
  user_id: string;
  quantity: number;
  location: string | null;
  bin: string | null;
  purchase_date: number | null;
  purchase_price: number | null;
  drinking_window_start: number | null;
  drinking_window_end: number | null;
  peak_year: number | null;
  status: string;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

interface ConsumptionRow {
  id: string;
  inventory_id: string;
  wine_id: string;
  user_id: string;
  quantity: number;
  consumed_at: number;
  occasion: string | null;
  rating: number | null;
  notes: string | null;
  paired_with: string | null;
}

/**
 * Factory function to create wine store
 */
export function createWineStore(type: 'memory'): InMemoryWineStore;
export function createWineStore(type: 'database', db: DatabaseAdapter): DatabaseWineStore;
export function createWineStore(type: 'memory' | 'database', db?: DatabaseAdapter): WineStore {
  if (type === 'memory') {
    return new InMemoryWineStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseWineStore(db);
}
