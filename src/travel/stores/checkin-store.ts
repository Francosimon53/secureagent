/**
 * Check-In Store
 *
 * Persistence layer for flight check-in tracking.
 */

import { randomUUID } from 'crypto';
import type {
  FlightBooking,
  CheckInStatus,
  CheckInAttempt,
  BoardingPass,
  CheckInQueryOptions,
} from '../types.js';

/**
 * Scheduled check-in record
 */
export interface ScheduledCheckIn {
  id: string;
  bookingId: string;
  userId: string;
  airline: string;
  flightNumber: string;
  scheduledAt: number;
  checkInOpensAt: number;
  departureTime: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  attempts: CheckInAttempt[];
  lastAttemptAt?: number;
  completedAt?: number;
  boardingPasses?: BoardingPass[];
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Interface for check-in storage
 */
export interface CheckInStore {
  initialize(): Promise<void>;

  // Scheduled check-in CRUD
  scheduleCheckIn(checkIn: Omit<ScheduledCheckIn, 'id' | 'createdAt' | 'updatedAt'>): Promise<ScheduledCheckIn>;
  getScheduledCheckIn(checkInId: string): Promise<ScheduledCheckIn | null>;
  getScheduledCheckInByBooking(bookingId: string): Promise<ScheduledCheckIn | null>;
  updateScheduledCheckIn(checkInId: string, updates: Partial<ScheduledCheckIn>): Promise<ScheduledCheckIn | null>;
  deleteScheduledCheckIn(checkInId: string): Promise<boolean>;
  listScheduledCheckIns(userId: string, options?: CheckInQueryOptions): Promise<ScheduledCheckIn[]>;

  // Check-in execution
  getCheckInsToProcess(beforeTime: number): Promise<ScheduledCheckIn[]>;
  markCheckInStarted(checkInId: string): Promise<ScheduledCheckIn | null>;
  markCheckInCompleted(checkInId: string, boardingPasses: BoardingPass[]): Promise<ScheduledCheckIn | null>;
  markCheckInFailed(checkInId: string, errorMessage: string): Promise<ScheduledCheckIn | null>;
  cancelCheckIn(checkInId: string): Promise<ScheduledCheckIn | null>;

  // Attempt tracking
  addCheckInAttempt(checkInId: string, attempt: CheckInAttempt): Promise<ScheduledCheckIn | null>;
  getCheckInAttempts(checkInId: string): Promise<CheckInAttempt[]>;

  // Boarding pass management
  saveBoardingPass(boardingPass: BoardingPass): Promise<BoardingPass>;
  getBoardingPass(passId: string): Promise<BoardingPass | null>;
  getBoardingPassesByBooking(bookingId: string): Promise<BoardingPass[]>;
  getBoardingPassesByCheckIn(checkInId: string): Promise<BoardingPass[]>;

  // Queries
  getUpcomingCheckIns(userId: string, withinHours?: number): Promise<ScheduledCheckIn[]>;
  getCheckInsByAirline(userId: string, airline: string): Promise<ScheduledCheckIn[]>;
  getCompletedCheckIns(userId: string, limit?: number): Promise<ScheduledCheckIn[]>;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Database-backed check-in store
 */
export class DatabaseCheckInStore implements CheckInStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS scheduled_checkins (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        airline TEXT NOT NULL,
        flight_number TEXT NOT NULL,
        scheduled_at INTEGER NOT NULL,
        checkin_opens_at INTEGER NOT NULL,
        departure_time INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled',
        attempts TEXT DEFAULT '[]',
        last_attempt_at INTEGER,
        completed_at INTEGER,
        boarding_passes TEXT,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_checkins_user ON scheduled_checkins(user_id, status)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_checkins_scheduled ON scheduled_checkins(status, scheduled_at)
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS boarding_passes (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        passenger_id TEXT NOT NULL,
        barcode_data TEXT NOT NULL,
        barcode_type TEXT NOT NULL,
        image_url TEXT,
        pdf_url TEXT,
        gate TEXT,
        boarding_time INTEGER,
        zone TEXT,
        issued_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_boarding_passes_booking ON boarding_passes(booking_id)
    `);
  }

  async scheduleCheckIn(checkIn: Omit<ScheduledCheckIn, 'id' | 'createdAt' | 'updatedAt'>): Promise<ScheduledCheckIn> {
    const now = Date.now();
    const id = randomUUID();

    const item: ScheduledCheckIn = {
      ...checkIn,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO scheduled_checkins (
        id, booking_id, user_id, airline, flight_number, scheduled_at,
        checkin_opens_at, departure_time, status, attempts, last_attempt_at,
        completed_at, boarding_passes, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.bookingId,
        item.userId,
        item.airline,
        item.flightNumber,
        item.scheduledAt,
        item.checkInOpensAt,
        item.departureTime,
        item.status,
        JSON.stringify(item.attempts),
        item.lastAttemptAt ?? null,
        item.completedAt ?? null,
        item.boardingPasses ? JSON.stringify(item.boardingPasses) : null,
        item.errorMessage ?? null,
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async getScheduledCheckIn(checkInId: string): Promise<ScheduledCheckIn | null> {
    const result = await this.db.query<CheckInRow>(
      'SELECT * FROM scheduled_checkins WHERE id = ?',
      [checkInId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToCheckIn(result.rows[0]);
  }

  async getScheduledCheckInByBooking(bookingId: string): Promise<ScheduledCheckIn | null> {
    const result = await this.db.query<CheckInRow>(
      'SELECT * FROM scheduled_checkins WHERE booking_id = ?',
      [bookingId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToCheckIn(result.rows[0]);
  }

  async updateScheduledCheckIn(checkInId: string, updates: Partial<ScheduledCheckIn>): Promise<ScheduledCheckIn | null> {
    const existing = await this.getScheduledCheckIn(checkInId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const updated: ScheduledCheckIn = {
      ...existing,
      ...updates,
      id: existing.id,
      bookingId: existing.bookingId,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    await this.db.execute(
      `UPDATE scheduled_checkins SET
        airline = ?, flight_number = ?, scheduled_at = ?, checkin_opens_at = ?,
        departure_time = ?, status = ?, attempts = ?, last_attempt_at = ?,
        completed_at = ?, boarding_passes = ?, error_message = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.airline,
        updated.flightNumber,
        updated.scheduledAt,
        updated.checkInOpensAt,
        updated.departureTime,
        updated.status,
        JSON.stringify(updated.attempts),
        updated.lastAttemptAt ?? null,
        updated.completedAt ?? null,
        updated.boardingPasses ? JSON.stringify(updated.boardingPasses) : null,
        updated.errorMessage ?? null,
        updated.updatedAt,
        checkInId,
      ]
    );

    return updated;
  }

  async deleteScheduledCheckIn(checkInId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM scheduled_checkins WHERE id = ?',
      [checkInId]
    );
    return result.changes > 0;
  }

  async listScheduledCheckIns(userId: string, options: CheckInQueryOptions = {}): Promise<ScheduledCheckIn[]> {
    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (options.status && options.status.length > 0) {
      const placeholders = options.status.map(() => '?').join(',');
      conditions.push(`status IN (${placeholders})`);
      params.push(...options.status.map(s => this.checkInStatusToDbStatus(s)));
    }

    if (options.airline) {
      conditions.push('airline = ?');
      params.push(options.airline);
    }

    if (options.dateFrom) {
      conditions.push('departure_time >= ?');
      params.push(options.dateFrom);
    }

    if (options.dateTo) {
      conditions.push('departure_time <= ?');
      params.push(options.dateTo);
    }

    let sql = `SELECT * FROM scheduled_checkins WHERE ${conditions.join(' AND ')} ORDER BY scheduled_at ASC`;

    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    const result = await this.db.query<CheckInRow>(sql, params);
    return result.rows.map(row => this.rowToCheckIn(row));
  }

  async getCheckInsToProcess(beforeTime: number): Promise<ScheduledCheckIn[]> {
    const result = await this.db.query<CheckInRow>(
      `SELECT * FROM scheduled_checkins WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at ASC`,
      [beforeTime]
    );
    return result.rows.map(row => this.rowToCheckIn(row));
  }

  async markCheckInStarted(checkInId: string): Promise<ScheduledCheckIn | null> {
    return this.updateScheduledCheckIn(checkInId, { status: 'in_progress', lastAttemptAt: Date.now() });
  }

  async markCheckInCompleted(checkInId: string, boardingPasses: BoardingPass[]): Promise<ScheduledCheckIn | null> {
    return this.updateScheduledCheckIn(checkInId, {
      status: 'completed',
      completedAt: Date.now(),
      boardingPasses,
    });
  }

  async markCheckInFailed(checkInId: string, errorMessage: string): Promise<ScheduledCheckIn | null> {
    return this.updateScheduledCheckIn(checkInId, { status: 'failed', errorMessage });
  }

  async cancelCheckIn(checkInId: string): Promise<ScheduledCheckIn | null> {
    return this.updateScheduledCheckIn(checkInId, { status: 'cancelled' });
  }

  async addCheckInAttempt(checkInId: string, attempt: CheckInAttempt): Promise<ScheduledCheckIn | null> {
    const checkIn = await this.getScheduledCheckIn(checkInId);
    if (!checkIn) {
      return null;
    }

    checkIn.attempts.push(attempt);
    return this.updateScheduledCheckIn(checkInId, {
      attempts: checkIn.attempts,
      lastAttemptAt: attempt.attemptedAt,
    });
  }

  async getCheckInAttempts(checkInId: string): Promise<CheckInAttempt[]> {
    const checkIn = await this.getScheduledCheckIn(checkInId);
    return checkIn?.attempts ?? [];
  }

  async saveBoardingPass(boardingPass: BoardingPass): Promise<BoardingPass> {
    await this.db.execute(
      `INSERT OR REPLACE INTO boarding_passes (
        id, booking_id, passenger_id, barcode_data, barcode_type,
        image_url, pdf_url, gate, boarding_time, zone, issued_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        boardingPass.id,
        boardingPass.bookingId,
        boardingPass.passengerId,
        boardingPass.barcodeData,
        boardingPass.barcodeType,
        boardingPass.imageUrl ?? null,
        boardingPass.pdfUrl ?? null,
        boardingPass.gate ?? null,
        boardingPass.boardingTime ?? null,
        boardingPass.zone ?? null,
        boardingPass.issuedAt,
      ]
    );
    return boardingPass;
  }

  async getBoardingPass(passId: string): Promise<BoardingPass | null> {
    const result = await this.db.query<BoardingPassRow>(
      'SELECT * FROM boarding_passes WHERE id = ?',
      [passId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToBoardingPass(result.rows[0]);
  }

  async getBoardingPassesByBooking(bookingId: string): Promise<BoardingPass[]> {
    const result = await this.db.query<BoardingPassRow>(
      'SELECT * FROM boarding_passes WHERE booking_id = ?',
      [bookingId]
    );
    return result.rows.map(row => this.rowToBoardingPass(row));
  }

  async getBoardingPassesByCheckIn(checkInId: string): Promise<BoardingPass[]> {
    const checkIn = await this.getScheduledCheckIn(checkInId);
    return checkIn?.boardingPasses ?? [];
  }

  async getUpcomingCheckIns(userId: string, withinHours = 24): Promise<ScheduledCheckIn[]> {
    const now = Date.now();
    const futureTime = now + (withinHours * 60 * 60 * 1000);

    const result = await this.db.query<CheckInRow>(
      `SELECT * FROM scheduled_checkins WHERE user_id = ? AND status = 'scheduled'
       AND scheduled_at >= ? AND scheduled_at <= ? ORDER BY scheduled_at ASC`,
      [userId, now, futureTime]
    );
    return result.rows.map(row => this.rowToCheckIn(row));
  }

  async getCheckInsByAirline(userId: string, airline: string): Promise<ScheduledCheckIn[]> {
    const result = await this.db.query<CheckInRow>(
      'SELECT * FROM scheduled_checkins WHERE user_id = ? AND airline = ? ORDER BY scheduled_at DESC',
      [userId, airline]
    );
    return result.rows.map(row => this.rowToCheckIn(row));
  }

  async getCompletedCheckIns(userId: string, limit = 10): Promise<ScheduledCheckIn[]> {
    const result = await this.db.query<CheckInRow>(
      `SELECT * FROM scheduled_checkins WHERE user_id = ? AND status = 'completed'
       ORDER BY completed_at DESC LIMIT ?`,
      [userId, limit]
    );
    return result.rows.map(row => this.rowToCheckIn(row));
  }

  private checkInStatusToDbStatus(status: CheckInStatus): string {
    const mapping: Record<CheckInStatus, string> = {
      'not_available': 'scheduled',
      'available': 'scheduled',
      'pending': 'in_progress',
      'completed': 'completed',
      'failed': 'failed',
    };
    return mapping[status] ?? 'scheduled';
  }

  private rowToCheckIn(row: CheckInRow): ScheduledCheckIn {
    return {
      id: row.id,
      bookingId: row.booking_id,
      userId: row.user_id,
      airline: row.airline,
      flightNumber: row.flight_number,
      scheduledAt: row.scheduled_at,
      checkInOpensAt: row.checkin_opens_at,
      departureTime: row.departure_time,
      status: row.status as ScheduledCheckIn['status'],
      attempts: JSON.parse(row.attempts),
      lastAttemptAt: row.last_attempt_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      boardingPasses: row.boarding_passes ? JSON.parse(row.boarding_passes) : undefined,
      errorMessage: row.error_message ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToBoardingPass(row: BoardingPassRow): BoardingPass {
    return {
      id: row.id,
      bookingId: row.booking_id,
      passengerId: row.passenger_id,
      barcodeData: row.barcode_data,
      barcodeType: row.barcode_type as BoardingPass['barcodeType'],
      imageUrl: row.image_url ?? undefined,
      pdfUrl: row.pdf_url ?? undefined,
      gate: row.gate ?? undefined,
      boardingTime: row.boarding_time ?? undefined,
      zone: row.zone ?? undefined,
      issuedAt: row.issued_at,
    };
  }
}

/**
 * In-memory check-in store for testing
 */
export class InMemoryCheckInStore implements CheckInStore {
  private checkIns = new Map<string, ScheduledCheckIn>();
  private boardingPasses = new Map<string, BoardingPass>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async scheduleCheckIn(checkIn: Omit<ScheduledCheckIn, 'id' | 'createdAt' | 'updatedAt'>): Promise<ScheduledCheckIn> {
    const now = Date.now();
    const item: ScheduledCheckIn = {
      ...checkIn,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.checkIns.set(item.id, item);
    return item;
  }

  async getScheduledCheckIn(checkInId: string): Promise<ScheduledCheckIn | null> {
    return this.checkIns.get(checkInId) ?? null;
  }

  async getScheduledCheckInByBooking(bookingId: string): Promise<ScheduledCheckIn | null> {
    return Array.from(this.checkIns.values()).find(c => c.bookingId === bookingId) ?? null;
  }

  async updateScheduledCheckIn(checkInId: string, updates: Partial<ScheduledCheckIn>): Promise<ScheduledCheckIn | null> {
    const existing = this.checkIns.get(checkInId);
    if (!existing) return null;

    const updated: ScheduledCheckIn = {
      ...existing,
      ...updates,
      id: existing.id,
      bookingId: existing.bookingId,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    this.checkIns.set(checkInId, updated);
    return updated;
  }

  async deleteScheduledCheckIn(checkInId: string): Promise<boolean> {
    return this.checkIns.delete(checkInId);
  }

  async listScheduledCheckIns(userId: string, options: CheckInQueryOptions = {}): Promise<ScheduledCheckIn[]> {
    let items = Array.from(this.checkIns.values()).filter(c => c.userId === userId);

    if (options.airline) {
      items = items.filter(c => c.airline === options.airline);
    }

    if (options.dateFrom) {
      items = items.filter(c => c.departureTime >= options.dateFrom!);
    }

    if (options.dateTo) {
      items = items.filter(c => c.departureTime <= options.dateTo!);
    }

    items.sort((a, b) => a.scheduledAt - b.scheduledAt);

    if (options.offset) {
      items = items.slice(options.offset);
    }

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  async getCheckInsToProcess(beforeTime: number): Promise<ScheduledCheckIn[]> {
    return Array.from(this.checkIns.values())
      .filter(c => c.status === 'scheduled' && c.scheduledAt <= beforeTime)
      .sort((a, b) => a.scheduledAt - b.scheduledAt);
  }

  async markCheckInStarted(checkInId: string): Promise<ScheduledCheckIn | null> {
    return this.updateScheduledCheckIn(checkInId, { status: 'in_progress', lastAttemptAt: Date.now() });
  }

  async markCheckInCompleted(checkInId: string, boardingPasses: BoardingPass[]): Promise<ScheduledCheckIn | null> {
    return this.updateScheduledCheckIn(checkInId, {
      status: 'completed',
      completedAt: Date.now(),
      boardingPasses,
    });
  }

  async markCheckInFailed(checkInId: string, errorMessage: string): Promise<ScheduledCheckIn | null> {
    return this.updateScheduledCheckIn(checkInId, { status: 'failed', errorMessage });
  }

  async cancelCheckIn(checkInId: string): Promise<ScheduledCheckIn | null> {
    return this.updateScheduledCheckIn(checkInId, { status: 'cancelled' });
  }

  async addCheckInAttempt(checkInId: string, attempt: CheckInAttempt): Promise<ScheduledCheckIn | null> {
    const checkIn = this.checkIns.get(checkInId);
    if (!checkIn) return null;

    checkIn.attempts.push(attempt);
    checkIn.lastAttemptAt = attempt.attemptedAt;
    checkIn.updatedAt = Date.now();
    return checkIn;
  }

  async getCheckInAttempts(checkInId: string): Promise<CheckInAttempt[]> {
    return this.checkIns.get(checkInId)?.attempts ?? [];
  }

  async saveBoardingPass(boardingPass: BoardingPass): Promise<BoardingPass> {
    this.boardingPasses.set(boardingPass.id, boardingPass);
    return boardingPass;
  }

  async getBoardingPass(passId: string): Promise<BoardingPass | null> {
    return this.boardingPasses.get(passId) ?? null;
  }

  async getBoardingPassesByBooking(bookingId: string): Promise<BoardingPass[]> {
    return Array.from(this.boardingPasses.values()).filter(p => p.bookingId === bookingId);
  }

  async getBoardingPassesByCheckIn(checkInId: string): Promise<BoardingPass[]> {
    const checkIn = this.checkIns.get(checkInId);
    return checkIn?.boardingPasses ?? [];
  }

  async getUpcomingCheckIns(userId: string, withinHours = 24): Promise<ScheduledCheckIn[]> {
    const now = Date.now();
    const futureTime = now + (withinHours * 60 * 60 * 1000);

    return Array.from(this.checkIns.values())
      .filter(c =>
        c.userId === userId &&
        c.status === 'scheduled' &&
        c.scheduledAt >= now &&
        c.scheduledAt <= futureTime
      )
      .sort((a, b) => a.scheduledAt - b.scheduledAt);
  }

  async getCheckInsByAirline(userId: string, airline: string): Promise<ScheduledCheckIn[]> {
    return Array.from(this.checkIns.values())
      .filter(c => c.userId === userId && c.airline === airline)
      .sort((a, b) => b.scheduledAt - a.scheduledAt);
  }

  async getCompletedCheckIns(userId: string, limit = 10): Promise<ScheduledCheckIn[]> {
    return Array.from(this.checkIns.values())
      .filter(c => c.userId === userId && c.status === 'completed')
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .slice(0, limit);
  }
}

// Row types for database
interface CheckInRow {
  id: string;
  booking_id: string;
  user_id: string;
  airline: string;
  flight_number: string;
  scheduled_at: number;
  checkin_opens_at: number;
  departure_time: number;
  status: string;
  attempts: string;
  last_attempt_at: number | null;
  completed_at: number | null;
  boarding_passes: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

interface BoardingPassRow {
  id: string;
  booking_id: string;
  passenger_id: string;
  barcode_data: string;
  barcode_type: string;
  image_url: string | null;
  pdf_url: string | null;
  gate: string | null;
  boarding_time: number | null;
  zone: string | null;
  issued_at: number;
}

/**
 * Factory function to create check-in store
 */
export function createCheckInStore(type: 'memory'): InMemoryCheckInStore;
export function createCheckInStore(type: 'database', db: DatabaseAdapter): DatabaseCheckInStore;
export function createCheckInStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): CheckInStore {
  if (type === 'memory') {
    return new InMemoryCheckInStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseCheckInStore(db);
}
