/**
 * Booking Store
 *
 * Persistence layer for travel bookings (flights, hotels, car rentals, activities).
 */

import { randomUUID } from 'crypto';
import type {
  TripBooking,
  FlightBooking,
  HotelBooking,
  CarRentalBooking,
  ActivityBooking,
  BookingType,
  BookingStatus,
  BookingQueryOptions,
} from '../types.js';

/**
 * Interface for booking storage
 */
export interface BookingStore {
  initialize(): Promise<void>;

  // Booking CRUD
  createBooking<T extends TripBooking>(booking: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  getBooking<T extends TripBooking>(bookingId: string): Promise<T | null>;
  updateBooking<T extends TripBooking>(bookingId: string, updates: Partial<T>): Promise<T | null>;
  deleteBooking(bookingId: string): Promise<boolean>;
  listBookings(userId: string, options?: BookingQueryOptions): Promise<TripBooking[]>;
  countBookings(userId: string, options?: BookingQueryOptions): Promise<number>;

  // Type-specific queries
  getFlightBookings(userId: string, options?: BookingQueryOptions): Promise<FlightBooking[]>;
  getHotelBookings(userId: string, options?: BookingQueryOptions): Promise<HotelBooking[]>;
  getCarRentalBookings(userId: string, options?: BookingQueryOptions): Promise<CarRentalBooking[]>;
  getActivityBookings(userId: string, options?: BookingQueryOptions): Promise<ActivityBooking[]>;

  // Status management
  updateBookingStatus(bookingId: string, status: BookingStatus): Promise<TripBooking | null>;
  getUpcomingBookings(userId: string, type?: BookingType, withinDays?: number): Promise<TripBooking[]>;
  getBookingsByTrip(tripId: string): Promise<TripBooking[]>;
  getBookingByConfirmation(userId: string, confirmationNumber: string): Promise<TripBooking | null>;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Database-backed booking store
 */
export class DatabaseBookingStore implements BookingStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS travel_bookings (
        id TEXT PRIMARY KEY,
        trip_id TEXT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        confirmation_number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        provider TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        cost REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        notes TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_bookings_user_type ON travel_bookings(user_id, type)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_bookings_trip ON travel_bookings(trip_id)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_bookings_user_status ON travel_bookings(user_id, status)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_bookings_confirmation ON travel_bookings(user_id, confirmation_number)
    `);
  }

  async createBooking<T extends TripBooking>(booking: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const now = Date.now();
    const id = randomUUID();

    const item = {
      ...booking,
      id,
      createdAt: now,
      updatedAt: now,
    } as T;

    const metadata = this.extractMetadata(item);

    await this.db.execute(
      `INSERT INTO travel_bookings (
        id, trip_id, user_id, type, confirmation_number, status, provider,
        start_time, end_time, cost, currency, notes, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.tripId,
        item.userId,
        item.type,
        item.confirmationNumber,
        item.status,
        item.provider,
        item.startTime,
        item.endTime ?? null,
        item.cost,
        item.currency,
        item.notes ?? null,
        JSON.stringify(metadata),
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async getBooking<T extends TripBooking>(bookingId: string): Promise<T | null> {
    const result = await this.db.query<BookingRow>(
      'SELECT * FROM travel_bookings WHERE id = ?',
      [bookingId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToBooking(result.rows[0]) as T;
  }

  async updateBooking<T extends TripBooking>(bookingId: string, updates: Partial<T>): Promise<T | null> {
    const existing = await this.getBooking<T>(bookingId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const updated = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      type: existing.type,
      createdAt: existing.createdAt,
      updatedAt: now,
    } as T;

    const metadata = this.extractMetadata(updated);

    await this.db.execute(
      `UPDATE travel_bookings SET
        trip_id = ?, confirmation_number = ?, status = ?, provider = ?,
        start_time = ?, end_time = ?, cost = ?, currency = ?, notes = ?,
        metadata = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.tripId,
        updated.confirmationNumber,
        updated.status,
        updated.provider,
        updated.startTime,
        updated.endTime ?? null,
        updated.cost,
        updated.currency,
        updated.notes ?? null,
        JSON.stringify(metadata),
        updated.updatedAt,
        bookingId,
      ]
    );

    return updated;
  }

  async deleteBooking(bookingId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM travel_bookings WHERE id = ?',
      [bookingId]
    );
    return result.changes > 0;
  }

  async listBookings(userId: string, options: BookingQueryOptions = {}): Promise<TripBooking[]> {
    const { sql, params } = this.buildBookingQuerySQL(userId, options);
    const result = await this.db.query<BookingRow>(sql, params);
    return result.rows.map(row => this.rowToBooking(row));
  }

  async countBookings(userId: string, options: BookingQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildBookingQuerySQL(userId, options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async getFlightBookings(userId: string, options: BookingQueryOptions = {}): Promise<FlightBooking[]> {
    const bookings = await this.listBookings(userId, { ...options, type: ['flight'] });
    return bookings as FlightBooking[];
  }

  async getHotelBookings(userId: string, options: BookingQueryOptions = {}): Promise<HotelBooking[]> {
    const bookings = await this.listBookings(userId, { ...options, type: ['hotel'] });
    return bookings as HotelBooking[];
  }

  async getCarRentalBookings(userId: string, options: BookingQueryOptions = {}): Promise<CarRentalBooking[]> {
    const bookings = await this.listBookings(userId, { ...options, type: ['car_rental'] });
    return bookings as CarRentalBooking[];
  }

  async getActivityBookings(userId: string, options: BookingQueryOptions = {}): Promise<ActivityBooking[]> {
    const bookings = await this.listBookings(userId, { ...options, type: ['activity'] });
    return bookings as ActivityBooking[];
  }

  async updateBookingStatus(bookingId: string, status: BookingStatus): Promise<TripBooking | null> {
    return this.updateBooking(bookingId, { status } as Partial<TripBooking>);
  }

  async getUpcomingBookings(userId: string, type?: BookingType, withinDays = 30): Promise<TripBooking[]> {
    const now = Date.now();
    const futureDate = now + (withinDays * 24 * 60 * 60 * 1000);

    let sql = `SELECT * FROM travel_bookings WHERE user_id = ?
               AND status IN ('pending', 'confirmed')
               AND start_time >= ? AND start_time <= ?`;
    const params: unknown[] = [userId, now, futureDate];

    if (type) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY start_time ASC`;

    const result = await this.db.query<BookingRow>(sql, params);
    return result.rows.map(row => this.rowToBooking(row));
  }

  async getBookingsByTrip(tripId: string): Promise<TripBooking[]> {
    const result = await this.db.query<BookingRow>(
      'SELECT * FROM travel_bookings WHERE trip_id = ? ORDER BY start_time ASC',
      [tripId]
    );
    return result.rows.map(row => this.rowToBooking(row));
  }

  async getBookingByConfirmation(userId: string, confirmationNumber: string): Promise<TripBooking | null> {
    const result = await this.db.query<BookingRow>(
      'SELECT * FROM travel_bookings WHERE user_id = ? AND confirmation_number = ?',
      [userId, confirmationNumber]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToBooking(result.rows[0]);
  }

  private buildBookingQuerySQL(
    userId: string,
    options: BookingQueryOptions,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (options.tripId) {
      conditions.push('trip_id = ?');
      params.push(options.tripId);
    }

    if (options.type && options.type.length > 0) {
      const placeholders = options.type.map(() => '?').join(',');
      conditions.push(`type IN (${placeholders})`);
      params.push(...options.type);
    }

    if (options.status && options.status.length > 0) {
      const placeholders = options.status.map(() => '?').join(',');
      conditions.push(`status IN (${placeholders})`);
      params.push(...options.status);
    }

    if (options.dateFrom) {
      conditions.push('start_time >= ?');
      params.push(options.dateFrom);
    }

    if (options.dateTo) {
      conditions.push('start_time <= ?');
      params.push(options.dateTo);
    }

    const whereClause = conditions.join(' AND ');

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM travel_bookings WHERE ${whereClause}`,
        params,
      };
    }

    let orderBy = 'start_time DESC';
    if (options.orderBy) {
      const direction = options.orderDirection === 'asc' ? 'ASC' : 'DESC';
      const column = {
        startTime: 'start_time',
        createdAt: 'created_at',
      }[options.orderBy];
      orderBy = `${column} ${direction}`;
    }

    let sql = `SELECT * FROM travel_bookings WHERE ${whereClause} ORDER BY ${orderBy}`;

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

  private extractMetadata(booking: TripBooking): Record<string, unknown> {
    const base = ['id', 'tripId', 'userId', 'type', 'confirmationNumber', 'status',
      'provider', 'startTime', 'endTime', 'cost', 'currency', 'notes', 'metadata',
      'createdAt', 'updatedAt'];
    const metadata: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(booking)) {
      if (!base.includes(key)) {
        metadata[key] = value;
      }
    }

    return metadata;
  }

  private rowToBooking(row: BookingRow): TripBooking {
    const metadata = row.metadata ? JSON.parse(row.metadata) : {};

    const base: TripBooking = {
      id: row.id,
      tripId: row.trip_id,
      userId: row.user_id,
      type: row.type as BookingType,
      confirmationNumber: row.confirmation_number,
      status: row.status as BookingStatus,
      provider: row.provider,
      startTime: row.start_time,
      endTime: row.end_time ?? undefined,
      cost: row.cost,
      currency: row.currency,
      notes: row.notes ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return { ...base, ...metadata };
  }
}

/**
 * In-memory booking store for testing
 */
export class InMemoryBookingStore implements BookingStore {
  private bookings = new Map<string, TripBooking>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async createBooking<T extends TripBooking>(booking: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const now = Date.now();
    const item = {
      ...booking,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as T;
    this.bookings.set(item.id, item);
    return item;
  }

  async getBooking<T extends TripBooking>(bookingId: string): Promise<T | null> {
    return (this.bookings.get(bookingId) as T) ?? null;
  }

  async updateBooking<T extends TripBooking>(bookingId: string, updates: Partial<T>): Promise<T | null> {
    const existing = this.bookings.get(bookingId);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      type: existing.type,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    } as T;
    this.bookings.set(bookingId, updated);
    return updated;
  }

  async deleteBooking(bookingId: string): Promise<boolean> {
    return this.bookings.delete(bookingId);
  }

  async listBookings(userId: string, options: BookingQueryOptions = {}): Promise<TripBooking[]> {
    let items = Array.from(this.bookings.values()).filter(b => b.userId === userId);

    if (options.tripId) {
      items = items.filter(b => b.tripId === options.tripId);
    }

    if (options.type && options.type.length > 0) {
      items = items.filter(b => options.type!.includes(b.type));
    }

    if (options.status && options.status.length > 0) {
      items = items.filter(b => options.status!.includes(b.status));
    }

    if (options.dateFrom) {
      items = items.filter(b => b.startTime >= options.dateFrom!);
    }

    if (options.dateTo) {
      items = items.filter(b => b.startTime <= options.dateTo!);
    }

    items.sort((a, b) => b.startTime - a.startTime);

    if (options.offset) {
      items = items.slice(options.offset);
    }

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  async countBookings(userId: string, options: BookingQueryOptions = {}): Promise<number> {
    const items = await this.listBookings(userId, { ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async getFlightBookings(userId: string, options: BookingQueryOptions = {}): Promise<FlightBooking[]> {
    const bookings = await this.listBookings(userId, { ...options, type: ['flight'] });
    return bookings as FlightBooking[];
  }

  async getHotelBookings(userId: string, options: BookingQueryOptions = {}): Promise<HotelBooking[]> {
    const bookings = await this.listBookings(userId, { ...options, type: ['hotel'] });
    return bookings as HotelBooking[];
  }

  async getCarRentalBookings(userId: string, options: BookingQueryOptions = {}): Promise<CarRentalBooking[]> {
    const bookings = await this.listBookings(userId, { ...options, type: ['car_rental'] });
    return bookings as CarRentalBooking[];
  }

  async getActivityBookings(userId: string, options: BookingQueryOptions = {}): Promise<ActivityBooking[]> {
    const bookings = await this.listBookings(userId, { ...options, type: ['activity'] });
    return bookings as ActivityBooking[];
  }

  async updateBookingStatus(bookingId: string, status: BookingStatus): Promise<TripBooking | null> {
    return this.updateBooking(bookingId, { status } as Partial<TripBooking>);
  }

  async getUpcomingBookings(userId: string, type?: BookingType, withinDays = 30): Promise<TripBooking[]> {
    const now = Date.now();
    const futureDate = now + (withinDays * 24 * 60 * 60 * 1000);

    return Array.from(this.bookings.values())
      .filter(b =>
        b.userId === userId &&
        (b.status === 'pending' || b.status === 'confirmed') &&
        b.startTime >= now &&
        b.startTime <= futureDate &&
        (!type || b.type === type)
      )
      .sort((a, b) => a.startTime - b.startTime);
  }

  async getBookingsByTrip(tripId: string): Promise<TripBooking[]> {
    return Array.from(this.bookings.values())
      .filter(b => b.tripId === tripId)
      .sort((a, b) => a.startTime - b.startTime);
  }

  async getBookingByConfirmation(userId: string, confirmationNumber: string): Promise<TripBooking | null> {
    return Array.from(this.bookings.values())
      .find(b => b.userId === userId && b.confirmationNumber === confirmationNumber) ?? null;
  }
}

// Row type for database
interface BookingRow {
  id: string;
  trip_id: string;
  user_id: string;
  type: string;
  confirmation_number: string;
  status: string;
  provider: string;
  start_time: number;
  end_time: number | null;
  cost: number;
  currency: string;
  notes: string | null;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Factory function to create booking store
 */
export function createBookingStore(type: 'memory'): InMemoryBookingStore;
export function createBookingStore(type: 'database', db: DatabaseAdapter): DatabaseBookingStore;
export function createBookingStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): BookingStore {
  if (type === 'memory') {
    return new InMemoryBookingStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseBookingStore(db);
}
