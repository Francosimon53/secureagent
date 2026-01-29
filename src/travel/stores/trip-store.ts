/**
 * Trip Store
 *
 * Persistence layer for trips.
 */

import { randomUUID } from 'crypto';
import type {
  Trip,
  TripBooking,
  TripStatus,
  TripQueryOptions,
} from '../types.js';

/**
 * Interface for trip storage
 */
export interface TripStore {
  initialize(): Promise<void>;

  // Trip CRUD
  createTrip(trip: Omit<Trip, 'id' | 'createdAt' | 'updatedAt'>): Promise<Trip>;
  getTrip(tripId: string): Promise<Trip | null>;
  updateTrip(tripId: string, updates: Partial<Trip>): Promise<Trip | null>;
  deleteTrip(tripId: string): Promise<boolean>;
  listTrips(userId: string, options?: TripQueryOptions): Promise<Trip[]>;
  countTrips(userId: string, options?: TripQueryOptions): Promise<number>;

  // Trip status
  updateTripStatus(tripId: string, status: TripStatus): Promise<Trip | null>;
  getActiveTrips(userId: string): Promise<Trip[]>;
  getUpcomingTrips(userId: string, withinDays?: number): Promise<Trip[]>;

  // Booking management within trips
  addBookingToTrip(tripId: string, booking: TripBooking): Promise<Trip | null>;
  removeBookingFromTrip(tripId: string, bookingId: string): Promise<Trip | null>;
  updateTripSpend(tripId: string): Promise<Trip | null>;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Database-backed trip store
 */
export class DatabaseTripStore implements TripStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        destination TEXT NOT NULL,
        start_date INTEGER NOT NULL,
        end_date INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'planning',
        bookings TEXT DEFAULT '[]',
        budget REAL,
        actual_spend REAL,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_trips_user_status ON trips(user_id, status)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_trips_user_dates ON trips(user_id, start_date, end_date)
    `);
  }

  async createTrip(trip: Omit<Trip, 'id' | 'createdAt' | 'updatedAt'>): Promise<Trip> {
    const now = Date.now();
    const id = randomUUID();

    const item: Trip = {
      ...trip,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO trips (
        id, user_id, name, destination, start_date, end_date, status,
        bookings, budget, actual_spend, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.name,
        item.destination,
        item.startDate,
        item.endDate,
        item.status,
        JSON.stringify(item.bookings),
        item.budget ?? null,
        item.actualSpend ?? null,
        item.notes ?? null,
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async getTrip(tripId: string): Promise<Trip | null> {
    const result = await this.db.query<TripRow>(
      'SELECT * FROM trips WHERE id = ?',
      [tripId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToTrip(result.rows[0]);
  }

  async updateTrip(tripId: string, updates: Partial<Trip>): Promise<Trip | null> {
    const existing = await this.getTrip(tripId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const updated: Trip = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    await this.db.execute(
      `UPDATE trips SET
        name = ?, destination = ?, start_date = ?, end_date = ?, status = ?,
        bookings = ?, budget = ?, actual_spend = ?, notes = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.destination,
        updated.startDate,
        updated.endDate,
        updated.status,
        JSON.stringify(updated.bookings),
        updated.budget ?? null,
        updated.actualSpend ?? null,
        updated.notes ?? null,
        updated.updatedAt,
        tripId,
      ]
    );

    return updated;
  }

  async deleteTrip(tripId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM trips WHERE id = ?',
      [tripId]
    );
    return result.changes > 0;
  }

  async listTrips(userId: string, options: TripQueryOptions = {}): Promise<Trip[]> {
    const { sql, params } = this.buildTripQuerySQL(userId, options);
    const result = await this.db.query<TripRow>(sql, params);
    return result.rows.map(row => this.rowToTrip(row));
  }

  async countTrips(userId: string, options: TripQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildTripQuerySQL(userId, options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async updateTripStatus(tripId: string, status: TripStatus): Promise<Trip | null> {
    return this.updateTrip(tripId, { status });
  }

  async getActiveTrips(userId: string): Promise<Trip[]> {
    return this.listTrips(userId, { status: ['in_progress'] });
  }

  async getUpcomingTrips(userId: string, withinDays = 30): Promise<Trip[]> {
    const now = Date.now();
    const futureDate = now + (withinDays * 24 * 60 * 60 * 1000);

    const result = await this.db.query<TripRow>(
      `SELECT * FROM trips WHERE user_id = ? AND status IN ('planning', 'booked')
       AND start_date >= ? AND start_date <= ? ORDER BY start_date ASC`,
      [userId, now, futureDate]
    );

    return result.rows.map(row => this.rowToTrip(row));
  }

  async addBookingToTrip(tripId: string, booking: TripBooking): Promise<Trip | null> {
    const trip = await this.getTrip(tripId);
    if (!trip) {
      return null;
    }

    trip.bookings.push(booking);
    return this.updateTrip(tripId, { bookings: trip.bookings });
  }

  async removeBookingFromTrip(tripId: string, bookingId: string): Promise<Trip | null> {
    const trip = await this.getTrip(tripId);
    if (!trip) {
      return null;
    }

    trip.bookings = trip.bookings.filter(b => b.id !== bookingId);
    return this.updateTrip(tripId, { bookings: trip.bookings });
  }

  async updateTripSpend(tripId: string): Promise<Trip | null> {
    const trip = await this.getTrip(tripId);
    if (!trip) {
      return null;
    }

    const actualSpend = trip.bookings.reduce((sum, b) => sum + b.cost, 0);
    return this.updateTrip(tripId, { actualSpend });
  }

  private buildTripQuerySQL(
    userId: string,
    options: TripQueryOptions,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (options.status && options.status.length > 0) {
      const placeholders = options.status.map(() => '?').join(',');
      conditions.push(`status IN (${placeholders})`);
      params.push(...options.status);
    }

    if (options.dateFrom) {
      conditions.push('start_date >= ?');
      params.push(options.dateFrom);
    }

    if (options.dateTo) {
      conditions.push('end_date <= ?');
      params.push(options.dateTo);
    }

    if (options.destination) {
      conditions.push('destination LIKE ?');
      params.push(`%${options.destination}%`);
    }

    const whereClause = conditions.join(' AND ');

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM trips WHERE ${whereClause}`,
        params,
      };
    }

    let orderBy = 'start_date DESC';
    if (options.orderBy) {
      const direction = options.orderDirection === 'asc' ? 'ASC' : 'DESC';
      const column = {
        startDate: 'start_date',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      }[options.orderBy];
      orderBy = `${column} ${direction}`;
    }

    let sql = `SELECT * FROM trips WHERE ${whereClause} ORDER BY ${orderBy}`;

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

  private rowToTrip(row: TripRow): Trip {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      destination: row.destination,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status as TripStatus,
      bookings: JSON.parse(row.bookings),
      budget: row.budget ?? undefined,
      actualSpend: row.actual_spend ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * In-memory trip store for testing
 */
export class InMemoryTripStore implements TripStore {
  private trips = new Map<string, Trip>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async createTrip(trip: Omit<Trip, 'id' | 'createdAt' | 'updatedAt'>): Promise<Trip> {
    const now = Date.now();
    const item: Trip = {
      ...trip,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.trips.set(item.id, item);
    return item;
  }

  async getTrip(tripId: string): Promise<Trip | null> {
    return this.trips.get(tripId) ?? null;
  }

  async updateTrip(tripId: string, updates: Partial<Trip>): Promise<Trip | null> {
    const existing = this.trips.get(tripId);
    if (!existing) return null;

    const updated: Trip = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    this.trips.set(tripId, updated);
    return updated;
  }

  async deleteTrip(tripId: string): Promise<boolean> {
    return this.trips.delete(tripId);
  }

  async listTrips(userId: string, options: TripQueryOptions = {}): Promise<Trip[]> {
    let items = Array.from(this.trips.values()).filter(t => t.userId === userId);

    if (options.status && options.status.length > 0) {
      items = items.filter(t => options.status!.includes(t.status));
    }

    if (options.dateFrom) {
      items = items.filter(t => t.startDate >= options.dateFrom!);
    }

    if (options.dateTo) {
      items = items.filter(t => t.endDate <= options.dateTo!);
    }

    if (options.destination) {
      const dest = options.destination.toLowerCase();
      items = items.filter(t => t.destination.toLowerCase().includes(dest));
    }

    items.sort((a, b) => b.startDate - a.startDate);

    if (options.offset) {
      items = items.slice(options.offset);
    }

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  async countTrips(userId: string, options: TripQueryOptions = {}): Promise<number> {
    const items = await this.listTrips(userId, { ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async updateTripStatus(tripId: string, status: TripStatus): Promise<Trip | null> {
    return this.updateTrip(tripId, { status });
  }

  async getActiveTrips(userId: string): Promise<Trip[]> {
    return this.listTrips(userId, { status: ['in_progress'] });
  }

  async getUpcomingTrips(userId: string, withinDays = 30): Promise<Trip[]> {
    const now = Date.now();
    const futureDate = now + (withinDays * 24 * 60 * 60 * 1000);

    return Array.from(this.trips.values())
      .filter(t =>
        t.userId === userId &&
        (t.status === 'planning' || t.status === 'booked') &&
        t.startDate >= now &&
        t.startDate <= futureDate
      )
      .sort((a, b) => a.startDate - b.startDate);
  }

  async addBookingToTrip(tripId: string, booking: TripBooking): Promise<Trip | null> {
    const trip = this.trips.get(tripId);
    if (!trip) return null;

    trip.bookings.push(booking);
    trip.updatedAt = Date.now();
    return trip;
  }

  async removeBookingFromTrip(tripId: string, bookingId: string): Promise<Trip | null> {
    const trip = this.trips.get(tripId);
    if (!trip) return null;

    trip.bookings = trip.bookings.filter(b => b.id !== bookingId);
    trip.updatedAt = Date.now();
    return trip;
  }

  async updateTripSpend(tripId: string): Promise<Trip | null> {
    const trip = this.trips.get(tripId);
    if (!trip) return null;

    trip.actualSpend = trip.bookings.reduce((sum, b) => sum + b.cost, 0);
    trip.updatedAt = Date.now();
    return trip;
  }
}

// Row type for database
interface TripRow {
  id: string;
  user_id: string;
  name: string;
  destination: string;
  start_date: number;
  end_date: number;
  status: string;
  bookings: string;
  budget: number | null;
  actual_spend: number | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Factory function to create trip store
 */
export function createTripStore(type: 'memory'): InMemoryTripStore;
export function createTripStore(type: 'database', db: DatabaseAdapter): DatabaseTripStore;
export function createTripStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): TripStore {
  if (type === 'memory') {
    return new InMemoryTripStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseTripStore(db);
}
