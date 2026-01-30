/**
 * Appointment Store
 *
 * Storage for scheduled appointments with support for:
 * - Appointment CRUD operations
 * - Reminder tracking
 * - Confirmation tracking
 * - Both in-memory and database implementations
 */

import type { DatabaseAdapter } from '../../../persistence/index.js';
import type {
  Appointment,
  AppointmentReminder,
  ReminderConfirmation,
  AppointmentQueryOptions,
  AppointmentStatus,
  PatientId,
  RBTId,
  AppointmentId,
} from '../types.js';

// =============================================================================
// Appointment Store Interface
// =============================================================================

export interface AppointmentStore {
  initialize(): Promise<void>;

  // Appointment CRUD
  createAppointment(appointment: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Appointment>;
  getAppointment(id: AppointmentId): Promise<Appointment | null>;
  updateAppointment(id: AppointmentId, updates: Partial<Appointment>): Promise<Appointment | null>;
  deleteAppointment(id: AppointmentId): Promise<boolean>;
  listAppointments(userId: string, options?: AppointmentQueryOptions): Promise<Appointment[]>;
  countAppointments(userId: string, options?: AppointmentQueryOptions): Promise<number>;

  // Status updates
  updateStatus(id: AppointmentId, status: AppointmentStatus, reason?: string): Promise<Appointment | null>;
  checkIn(id: AppointmentId): Promise<Appointment | null>;
  checkOut(id: AppointmentId): Promise<Appointment | null>;

  // Reminder operations
  addReminder(appointmentId: AppointmentId, reminder: Omit<AppointmentReminder, 'id'>): Promise<Appointment | null>;
  updateReminder(appointmentId: AppointmentId, reminderId: string, updates: Partial<AppointmentReminder>): Promise<Appointment | null>;
  getUpcomingReminders(userId: string, beforeTime: number): Promise<Array<{ appointment: Appointment; reminder: AppointmentReminder }>>;

  // Confirmation operations
  recordConfirmation(appointmentId: AppointmentId, confirmation: Omit<ReminderConfirmation, 'id'>): Promise<Appointment | null>;

  // Specialized queries
  getAppointmentsByPatient(userId: string, patientId: PatientId, options?: AppointmentQueryOptions): Promise<Appointment[]>;
  getAppointmentsByRBT(userId: string, rbtId: RBTId, options?: AppointmentQueryOptions): Promise<Appointment[]>;
  getAppointmentsInRange(userId: string, startDate: number, endDate: number): Promise<Appointment[]>;
  getUpcomingAppointments(userId: string, limit?: number): Promise<Appointment[]>;
  getPendingConfirmations(userId: string): Promise<Appointment[]>;
  getNoShowAppointments(userId: string, startDate: number, endDate: number): Promise<Appointment[]>;

  // Conflict detection
  checkConflicts(userId: string, rbtId: RBTId, startTime: number, endTime: number, excludeId?: AppointmentId): Promise<Appointment[]>;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseAppointmentStore implements AppointmentStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS health_appointments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        rbt_id TEXT,
        bcba_id TEXT,
        type TEXT NOT NULL,
        service_code TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        duration_minutes INTEGER NOT NULL,
        location_type TEXT NOT NULL,
        location_address TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled',
        authorization_id TEXT,
        units_to_bill REAL,
        reminders TEXT NOT NULL DEFAULT '[]',
        confirmation TEXT,
        checked_in_at INTEGER,
        checked_out_at INTEGER,
        session_notes TEXT,
        cancellation_reason TEXT,
        no_show_reason TEXT,
        recurring_series_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.query('CREATE INDEX IF NOT EXISTS idx_health_appointments_user ON health_appointments(user_id)');
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_health_appointments_patient ON health_appointments(user_id, patient_id)');
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_health_appointments_rbt ON health_appointments(user_id, rbt_id)');
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_health_appointments_time ON health_appointments(user_id, start_time)');
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_health_appointments_status ON health_appointments(user_id, status)');
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_health_appointments_auth ON health_appointments(authorization_id)');
  }

  async createAppointment(
    appointment: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Appointment> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.query(
      `INSERT INTO health_appointments (
        id, user_id, patient_id, rbt_id, bcba_id, type, service_code,
        start_time, end_time, duration_minutes, location_type, location_address,
        status, authorization_id, units_to_bill, reminders, confirmation,
        checked_in_at, checked_out_at, session_notes, cancellation_reason,
        no_show_reason, recurring_series_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        appointment.userId,
        appointment.patientId,
        appointment.rbtId ?? null,
        appointment.bcbaId ?? null,
        appointment.type,
        appointment.serviceCode,
        appointment.startTime,
        appointment.endTime,
        appointment.durationMinutes,
        appointment.locationType,
        appointment.locationAddress ?? null,
        appointment.status,
        appointment.authorizationId ?? null,
        appointment.unitsToBill ?? null,
        JSON.stringify(appointment.reminders),
        appointment.confirmation ? JSON.stringify(appointment.confirmation) : null,
        appointment.checkedInAt ?? null,
        appointment.checkedOutAt ?? null,
        appointment.sessionNotes ?? null,
        appointment.cancellationReason ?? null,
        appointment.noShowReason ?? null,
        appointment.recurringSeriesId ?? null,
        now,
        now,
      ]
    );

    return { ...appointment, id, createdAt: now, updatedAt: now };
  }

  async getAppointment(id: AppointmentId): Promise<Appointment | null> {
    const result = await this.db.query<AppointmentRow>(
      'SELECT * FROM health_appointments WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async updateAppointment(
    id: AppointmentId,
    updates: Partial<Appointment>
  ): Promise<Appointment | null> {
    const existing = await this.getAppointment(id);
    if (!existing) return null;

    const now = Date.now();
    const fields: string[] = [];
    const values: unknown[] = [];

    const fieldMap: Record<string, string> = {
      patientId: 'patient_id',
      rbtId: 'rbt_id',
      bcbaId: 'bcba_id',
      type: 'type',
      serviceCode: 'service_code',
      startTime: 'start_time',
      endTime: 'end_time',
      durationMinutes: 'duration_minutes',
      locationType: 'location_type',
      locationAddress: 'location_address',
      status: 'status',
      authorizationId: 'authorization_id',
      unitsToBill: 'units_to_bill',
      checkedInAt: 'checked_in_at',
      checkedOutAt: 'checked_out_at',
      sessionNotes: 'session_notes',
      cancellationReason: 'cancellation_reason',
      noShowReason: 'no_show_reason',
      recurringSeriesId: 'recurring_series_id',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if ((updates as Record<string, unknown>)[key] !== undefined) {
        fields.push(`${column} = ?`);
        values.push((updates as Record<string, unknown>)[key] ?? null);
      }
    }

    if (updates.reminders !== undefined) {
      fields.push('reminders = ?');
      values.push(JSON.stringify(updates.reminders));
    }
    if (updates.confirmation !== undefined) {
      fields.push('confirmation = ?');
      values.push(updates.confirmation ? JSON.stringify(updates.confirmation) : null);
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await this.db.query(
      `UPDATE health_appointments SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return this.getAppointment(id);
  }

  async deleteAppointment(id: AppointmentId): Promise<boolean> {
    const result = await this.db.query('DELETE FROM health_appointments WHERE id = ?', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listAppointments(userId: string, options: AppointmentQueryOptions = {}): Promise<Appointment[]> {
    const { conditions, values } = this.buildQuery(userId, options);
    const orderBy = options.orderBy === 'createdAt' ? 'created_at' : 'start_time';
    const orderDir = options.orderDirection ?? 'asc';
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const result = await this.db.query<AppointmentRow>(
      `SELECT * FROM health_appointments WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy} ${orderDir.toUpperCase()} LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async countAppointments(userId: string, options: AppointmentQueryOptions = {}): Promise<number> {
    const { conditions, values } = this.buildQuery(userId, options);

    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM health_appointments WHERE ${conditions.join(' AND ')}`,
      values
    );

    return result.rows[0]?.count ?? 0;
  }

  async updateStatus(
    id: AppointmentId,
    status: AppointmentStatus,
    reason?: string
  ): Promise<Appointment | null> {
    const updates: Partial<Appointment> = { status };

    if (status === 'cancelled' && reason) {
      updates.cancellationReason = reason;
    } else if (status === 'no-show' && reason) {
      updates.noShowReason = reason;
    }

    return this.updateAppointment(id, updates);
  }

  async checkIn(id: AppointmentId): Promise<Appointment | null> {
    return this.updateAppointment(id, {
      status: 'in-progress',
      checkedInAt: Date.now(),
    });
  }

  async checkOut(id: AppointmentId): Promise<Appointment | null> {
    return this.updateAppointment(id, {
      status: 'completed',
      checkedOutAt: Date.now(),
    });
  }

  async addReminder(
    appointmentId: AppointmentId,
    reminder: Omit<AppointmentReminder, 'id'>
  ): Promise<Appointment | null> {
    const appointment = await this.getAppointment(appointmentId);
    if (!appointment) return null;

    const newReminder: AppointmentReminder = {
      ...reminder,
      id: crypto.randomUUID(),
    };

    const reminders = [...appointment.reminders, newReminder];
    return this.updateAppointment(appointmentId, { reminders });
  }

  async updateReminder(
    appointmentId: AppointmentId,
    reminderId: string,
    updates: Partial<AppointmentReminder>
  ): Promise<Appointment | null> {
    const appointment = await this.getAppointment(appointmentId);
    if (!appointment) return null;

    const reminders = appointment.reminders.map((r) =>
      r.id === reminderId ? { ...r, ...updates, id: reminderId } : r
    );

    return this.updateAppointment(appointmentId, { reminders });
  }

  async getUpcomingReminders(
    userId: string,
    beforeTime: number
  ): Promise<Array<{ appointment: Appointment; reminder: AppointmentReminder }>> {
    const result = await this.db.query<AppointmentRow>(
      `SELECT * FROM health_appointments
       WHERE user_id = ? AND status IN ('scheduled', 'confirmed') AND start_time > ?`,
      [userId, Date.now()]
    );

    const upcoming: Array<{ appointment: Appointment; reminder: AppointmentReminder }> = [];

    for (const row of result.rows) {
      const appointment = this.mapRow(row);
      for (const reminder of appointment.reminders) {
        if (reminder.status === 'pending' && reminder.scheduledAt <= beforeTime) {
          upcoming.push({ appointment, reminder });
        }
      }
    }

    return upcoming.sort((a, b) => a.reminder.scheduledAt - b.reminder.scheduledAt);
  }

  async recordConfirmation(
    appointmentId: AppointmentId,
    confirmation: Omit<ReminderConfirmation, 'id'>
  ): Promise<Appointment | null> {
    const newConfirmation: ReminderConfirmation = {
      ...confirmation,
      id: crypto.randomUUID(),
    };

    const updates: Partial<Appointment> = { confirmation: newConfirmation };

    if (confirmation.response === 'confirmed') {
      updates.status = 'confirmed';
    }

    return this.updateAppointment(appointmentId, updates);
  }

  async getAppointmentsByPatient(
    userId: string,
    patientId: PatientId,
    options?: AppointmentQueryOptions
  ): Promise<Appointment[]> {
    return this.listAppointments(userId, { ...options, patientId });
  }

  async getAppointmentsByRBT(
    userId: string,
    rbtId: RBTId,
    options?: AppointmentQueryOptions
  ): Promise<Appointment[]> {
    return this.listAppointments(userId, { ...options, rbtId });
  }

  async getAppointmentsInRange(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<Appointment[]> {
    return this.listAppointments(userId, { startDate, endDate, limit: 1000 });
  }

  async getUpcomingAppointments(userId: string, limit = 20): Promise<Appointment[]> {
    return this.listAppointments(userId, {
      startDate: Date.now(),
      status: ['scheduled', 'confirmed'],
      limit,
      orderBy: 'startTime',
      orderDirection: 'asc',
    });
  }

  async getPendingConfirmations(userId: string): Promise<Appointment[]> {
    const result = await this.db.query<AppointmentRow>(
      `SELECT * FROM health_appointments
       WHERE user_id = ? AND status = 'scheduled' AND confirmation IS NULL AND start_time > ?
       ORDER BY start_time ASC`,
      [userId, Date.now()]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async getNoShowAppointments(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<Appointment[]> {
    return this.listAppointments(userId, {
      startDate,
      endDate,
      status: 'no-show',
    });
  }

  async checkConflicts(
    userId: string,
    rbtId: RBTId,
    startTime: number,
    endTime: number,
    excludeId?: AppointmentId
  ): Promise<Appointment[]> {
    let query = `SELECT * FROM health_appointments
                 WHERE user_id = ? AND rbt_id = ?
                 AND status NOT IN ('cancelled', 'no-show')
                 AND ((start_time < ? AND end_time > ?) OR (start_time >= ? AND start_time < ?))`;
    const params: unknown[] = [userId, rbtId, endTime, startTime, startTime, endTime];

    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }

    const result = await this.db.query<AppointmentRow>(query, params);
    return result.rows.map((row) => this.mapRow(row));
  }

  private buildQuery(
    userId: string,
    options: AppointmentQueryOptions
  ): { conditions: string[]; values: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const values: unknown[] = [userId];

    if (options.patientId) {
      conditions.push('patient_id = ?');
      values.push(options.patientId);
    }
    if (options.rbtId) {
      conditions.push('rbt_id = ?');
      values.push(options.rbtId);
    }
    if (options.status) {
      if (Array.isArray(options.status)) {
        conditions.push(`status IN (${options.status.map(() => '?').join(', ')})`);
        values.push(...options.status);
      } else {
        conditions.push('status = ?');
        values.push(options.status);
      }
    }
    if (options.type) {
      conditions.push('type = ?');
      values.push(options.type);
    }
    if (options.startDate) {
      conditions.push('start_time >= ?');
      values.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push('start_time <= ?');
      values.push(options.endDate);
    }

    return { conditions, values };
  }

  private mapRow(row: AppointmentRow): Appointment {
    return {
      id: row.id,
      userId: row.user_id,
      patientId: row.patient_id,
      rbtId: row.rbt_id ?? undefined,
      bcbaId: row.bcba_id ?? undefined,
      type: row.type as Appointment['type'],
      serviceCode: row.service_code,
      startTime: row.start_time,
      endTime: row.end_time,
      durationMinutes: row.duration_minutes,
      locationType: row.location_type as Appointment['locationType'],
      locationAddress: row.location_address ?? undefined,
      status: row.status as AppointmentStatus,
      authorizationId: row.authorization_id ?? undefined,
      unitsToBill: row.units_to_bill ?? undefined,
      reminders: JSON.parse(row.reminders),
      confirmation: row.confirmation ? JSON.parse(row.confirmation) : undefined,
      checkedInAt: row.checked_in_at ?? undefined,
      checkedOutAt: row.checked_out_at ?? undefined,
      sessionNotes: row.session_notes ?? undefined,
      cancellationReason: row.cancellation_reason ?? undefined,
      noShowReason: row.no_show_reason ?? undefined,
      recurringSeriesId: row.recurring_series_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryAppointmentStore implements AppointmentStore {
  private appointments = new Map<string, Appointment>();

  async initialize(): Promise<void> {}

  async createAppointment(
    appointment: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Appointment> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const newAppointment: Appointment = { ...appointment, id, createdAt: now, updatedAt: now };
    this.appointments.set(id, newAppointment);
    return newAppointment;
  }

  async getAppointment(id: AppointmentId): Promise<Appointment | null> {
    return this.appointments.get(id) ?? null;
  }

  async updateAppointment(
    id: AppointmentId,
    updates: Partial<Appointment>
  ): Promise<Appointment | null> {
    const existing = this.appointments.get(id);
    if (!existing) return null;

    const updated: Appointment = { ...existing, ...updates, id, updatedAt: Date.now() };
    this.appointments.set(id, updated);
    return updated;
  }

  async deleteAppointment(id: AppointmentId): Promise<boolean> {
    return this.appointments.delete(id);
  }

  async listAppointments(userId: string, options: AppointmentQueryOptions = {}): Promise<Appointment[]> {
    let results = Array.from(this.appointments.values()).filter((a) => a.userId === userId);

    if (options.patientId) {
      results = results.filter((a) => a.patientId === options.patientId);
    }
    if (options.rbtId) {
      results = results.filter((a) => a.rbtId === options.rbtId);
    }
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      results = results.filter((a) => statuses.includes(a.status));
    }
    if (options.type) {
      results = results.filter((a) => a.type === options.type);
    }
    if (options.startDate) {
      results = results.filter((a) => a.startTime >= options.startDate!);
    }
    if (options.endDate) {
      results = results.filter((a) => a.startTime <= options.endDate!);
    }

    const orderDir = options.orderDirection === 'desc' ? -1 : 1;
    results.sort((a, b) => {
      if (options.orderBy === 'createdAt') {
        return (a.createdAt - b.createdAt) * orderDir;
      }
      return (a.startTime - b.startTime) * orderDir;
    });

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async countAppointments(userId: string, options: AppointmentQueryOptions = {}): Promise<number> {
    const results = await this.listAppointments(userId, { ...options, limit: Infinity, offset: 0 });
    return results.length;
  }

  async updateStatus(
    id: AppointmentId,
    status: AppointmentStatus,
    reason?: string
  ): Promise<Appointment | null> {
    const updates: Partial<Appointment> = { status };
    if (status === 'cancelled' && reason) updates.cancellationReason = reason;
    else if (status === 'no-show' && reason) updates.noShowReason = reason;
    return this.updateAppointment(id, updates);
  }

  async checkIn(id: AppointmentId): Promise<Appointment | null> {
    return this.updateAppointment(id, { status: 'in-progress', checkedInAt: Date.now() });
  }

  async checkOut(id: AppointmentId): Promise<Appointment | null> {
    return this.updateAppointment(id, { status: 'completed', checkedOutAt: Date.now() });
  }

  async addReminder(
    appointmentId: AppointmentId,
    reminder: Omit<AppointmentReminder, 'id'>
  ): Promise<Appointment | null> {
    const appointment = this.appointments.get(appointmentId);
    if (!appointment) return null;

    const newReminder: AppointmentReminder = { ...reminder, id: crypto.randomUUID() };
    return this.updateAppointment(appointmentId, {
      reminders: [...appointment.reminders, newReminder],
    });
  }

  async updateReminder(
    appointmentId: AppointmentId,
    reminderId: string,
    updates: Partial<AppointmentReminder>
  ): Promise<Appointment | null> {
    const appointment = this.appointments.get(appointmentId);
    if (!appointment) return null;

    const reminders = appointment.reminders.map((r) =>
      r.id === reminderId ? { ...r, ...updates, id: reminderId } : r
    );
    return this.updateAppointment(appointmentId, { reminders });
  }

  async getUpcomingReminders(
    userId: string,
    beforeTime: number
  ): Promise<Array<{ appointment: Appointment; reminder: AppointmentReminder }>> {
    const upcoming: Array<{ appointment: Appointment; reminder: AppointmentReminder }> = [];
    const now = Date.now();

    for (const appointment of this.appointments.values()) {
      if (
        appointment.userId === userId &&
        ['scheduled', 'confirmed'].includes(appointment.status) &&
        appointment.startTime > now
      ) {
        for (const reminder of appointment.reminders) {
          if (reminder.status === 'pending' && reminder.scheduledAt <= beforeTime) {
            upcoming.push({ appointment, reminder });
          }
        }
      }
    }

    return upcoming.sort((a, b) => a.reminder.scheduledAt - b.reminder.scheduledAt);
  }

  async recordConfirmation(
    appointmentId: AppointmentId,
    confirmation: Omit<ReminderConfirmation, 'id'>
  ): Promise<Appointment | null> {
    const newConfirmation: ReminderConfirmation = { ...confirmation, id: crypto.randomUUID() };
    const updates: Partial<Appointment> = { confirmation: newConfirmation };
    if (confirmation.response === 'confirmed') updates.status = 'confirmed';
    return this.updateAppointment(appointmentId, updates);
  }

  async getAppointmentsByPatient(
    userId: string,
    patientId: PatientId,
    options?: AppointmentQueryOptions
  ): Promise<Appointment[]> {
    return this.listAppointments(userId, { ...options, patientId });
  }

  async getAppointmentsByRBT(
    userId: string,
    rbtId: RBTId,
    options?: AppointmentQueryOptions
  ): Promise<Appointment[]> {
    return this.listAppointments(userId, { ...options, rbtId });
  }

  async getAppointmentsInRange(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<Appointment[]> {
    return this.listAppointments(userId, { startDate, endDate, limit: 1000 });
  }

  async getUpcomingAppointments(userId: string, limit = 20): Promise<Appointment[]> {
    return this.listAppointments(userId, {
      startDate: Date.now(),
      status: ['scheduled', 'confirmed'],
      limit,
      orderBy: 'startTime',
      orderDirection: 'asc',
    });
  }

  async getPendingConfirmations(userId: string): Promise<Appointment[]> {
    return Array.from(this.appointments.values())
      .filter(
        (a) =>
          a.userId === userId &&
          a.status === 'scheduled' &&
          !a.confirmation &&
          a.startTime > Date.now()
      )
      .sort((a, b) => a.startTime - b.startTime);
  }

  async getNoShowAppointments(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<Appointment[]> {
    return this.listAppointments(userId, { startDate, endDate, status: 'no-show' });
  }

  async checkConflicts(
    userId: string,
    rbtId: RBTId,
    startTime: number,
    endTime: number,
    excludeId?: AppointmentId
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (a) =>
        a.userId === userId &&
        a.rbtId === rbtId &&
        !['cancelled', 'no-show'].includes(a.status) &&
        a.id !== excludeId &&
        ((a.startTime < endTime && a.endTime > startTime) ||
          (a.startTime >= startTime && a.startTime < endTime))
    );
  }
}

// =============================================================================
// Row Type
// =============================================================================

interface AppointmentRow {
  id: string;
  user_id: string;
  patient_id: string;
  rbt_id: string | null;
  bcba_id: string | null;
  type: string;
  service_code: string;
  start_time: number;
  end_time: number;
  duration_minutes: number;
  location_type: string;
  location_address: string | null;
  status: string;
  authorization_id: string | null;
  units_to_bill: number | null;
  reminders: string;
  confirmation: string | null;
  checked_in_at: number | null;
  checked_out_at: number | null;
  session_notes: string | null;
  cancellation_reason: string | null;
  no_show_reason: string | null;
  recurring_series_id: string | null;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createAppointmentStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): AppointmentStore {
  if (type === 'database') {
    if (!db) {
      throw new Error('Database adapter required for database store');
    }
    return new DatabaseAppointmentStore(db);
  }
  return new InMemoryAppointmentStore();
}
