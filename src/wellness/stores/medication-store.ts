/**
 * Medication Store
 *
 * Storage for medications and doses with support for:
 * - Medication management
 * - Dose tracking
 * - Adherence calculation
 * - Both in-memory and database implementations
 */

import type { DatabaseAdapter } from '../../persistence/index.js';
import type {
  Medication,
  MedicationDose,
  MedicationAdherence,
  MedicationFrequency,
  DoseStatus,
  MedicationInstructions,
  RefillInfo,
  MedicationReminder,
  MedicationQueryOptions,
  DoseQueryOptions,
} from '../types.js';

// =============================================================================
// Medication Store Interface
// =============================================================================

export interface MedicationStore {
  initialize(): Promise<void>;

  // Medication Operations
  createMedication(medication: Omit<Medication, 'id' | 'createdAt' | 'updatedAt'>): Promise<Medication>;
  getMedication(id: string): Promise<Medication | null>;
  updateMedication(id: string, updates: Partial<Medication>): Promise<Medication | null>;
  deleteMedication(id: string): Promise<boolean>;
  listMedications(userId: string, options?: MedicationQueryOptions): Promise<Medication[]>;
  getActiveMedications(userId: string): Promise<Medication[]>;

  // Dose Operations
  createDose(dose: Omit<MedicationDose, 'id' | 'createdAt' | 'updatedAt'>): Promise<MedicationDose>;
  getDose(id: string): Promise<MedicationDose | null>;
  updateDose(id: string, updates: Partial<MedicationDose>): Promise<MedicationDose | null>;
  deleteDose(id: string): Promise<boolean>;
  listDoses(userId: string, options?: DoseQueryOptions): Promise<MedicationDose[]>;
  getScheduledDoses(userId: string, startTime: number, endTime: number): Promise<MedicationDose[]>;
  getPendingDoses(userId: string): Promise<MedicationDose[]>;

  // Adherence Operations
  calculateAdherence(
    userId: string,
    medicationId: string,
    period: 'daily' | 'weekly' | 'monthly',
    startDate: number,
    endDate: number
  ): Promise<MedicationAdherence>;
  getOverallAdherence(userId: string, startDate: number, endDate: number): Promise<number>;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseMedicationStore implements MedicationStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Create medications table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS medications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        generic_name TEXT,
        dosage REAL NOT NULL,
        dosage_unit TEXT NOT NULL,
        frequency TEXT NOT NULL,
        instructions TEXT,
        prescribed_by TEXT,
        pharmacy TEXT,
        refill_info TEXT,
        start_date INTEGER NOT NULL,
        end_date INTEGER,
        is_active INTEGER DEFAULT 1,
        reminders TEXT,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_medications_user ON medications(user_id)');
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_medications_active ON medications(is_active)');

    // Create medication_doses table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS medication_doses (
        id TEXT PRIMARY KEY,
        medication_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        scheduled_for INTEGER NOT NULL,
        status TEXT NOT NULL,
        taken_at INTEGER,
        skipped_reason TEXT,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
      )
    `);
    await this.db.query(
      'CREATE INDEX IF NOT EXISTS idx_doses_user_date ON medication_doses(user_id, scheduled_for)'
    );
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_doses_status ON medication_doses(status)');
    await this.db.query(
      'CREATE INDEX IF NOT EXISTS idx_doses_medication ON medication_doses(medication_id)'
    );
  }

  // Medication Operations

  async createMedication(
    medication: Omit<Medication, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Medication> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.query(
      `INSERT INTO medications (
        id, user_id, name, generic_name, dosage, dosage_unit, frequency,
        instructions, prescribed_by, pharmacy, refill_info, start_date,
        end_date, is_active, reminders, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        medication.userId,
        medication.name,
        medication.genericName ?? null,
        medication.dosage,
        medication.dosageUnit,
        medication.frequency,
        medication.instructions ? JSON.stringify(medication.instructions) : null,
        medication.prescribedBy ?? null,
        medication.pharmacy ?? null,
        medication.refillInfo ? JSON.stringify(medication.refillInfo) : null,
        medication.startDate,
        medication.endDate ?? null,
        medication.isActive ? 1 : 0,
        JSON.stringify(medication.reminders),
        medication.notes ?? null,
        now,
        now,
      ]
    );

    return { ...medication, id, createdAt: now, updatedAt: now };
  }

  async getMedication(id: string): Promise<Medication | null> {
    const result = await this.db.query<MedicationRow>(
      'SELECT * FROM medications WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.mapMedicationRow(result.rows[0]) : null;
  }

  async updateMedication(id: string, updates: Partial<Medication>): Promise<Medication | null> {
    const existing = await this.getMedication(id);
    if (!existing) return null;

    const now = Date.now();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.genericName !== undefined) {
      fields.push('generic_name = ?');
      values.push(updates.genericName);
    }
    if (updates.dosage !== undefined) {
      fields.push('dosage = ?');
      values.push(updates.dosage);
    }
    if (updates.dosageUnit !== undefined) {
      fields.push('dosage_unit = ?');
      values.push(updates.dosageUnit);
    }
    if (updates.frequency !== undefined) {
      fields.push('frequency = ?');
      values.push(updates.frequency);
    }
    if (updates.instructions !== undefined) {
      fields.push('instructions = ?');
      values.push(JSON.stringify(updates.instructions));
    }
    if (updates.prescribedBy !== undefined) {
      fields.push('prescribed_by = ?');
      values.push(updates.prescribedBy);
    }
    if (updates.pharmacy !== undefined) {
      fields.push('pharmacy = ?');
      values.push(updates.pharmacy);
    }
    if (updates.refillInfo !== undefined) {
      fields.push('refill_info = ?');
      values.push(JSON.stringify(updates.refillInfo));
    }
    if (updates.startDate !== undefined) {
      fields.push('start_date = ?');
      values.push(updates.startDate);
    }
    if (updates.endDate !== undefined) {
      fields.push('end_date = ?');
      values.push(updates.endDate);
    }
    if (updates.isActive !== undefined) {
      fields.push('is_active = ?');
      values.push(updates.isActive ? 1 : 0);
    }
    if (updates.reminders !== undefined) {
      fields.push('reminders = ?');
      values.push(JSON.stringify(updates.reminders));
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }

    values.push(id);
    await this.db.query(`UPDATE medications SET ${fields.join(', ')} WHERE id = ?`, values);

    return this.getMedication(id);
  }

  async deleteMedication(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM medications WHERE id = ?', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listMedications(userId: string, options: MedicationQueryOptions = {}): Promise<Medication[]> {
    const conditions: string[] = ['user_id = ?'];
    const values: unknown[] = [userId];

    if (options.isActive !== undefined) {
      conditions.push('is_active = ?');
      values.push(options.isActive ? 1 : 0);
    }
    if (options.frequency) {
      conditions.push('frequency = ?');
      values.push(options.frequency);
    }

    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const result = await this.db.query<MedicationRow>(
      `SELECT * FROM medications WHERE ${conditions.join(' AND ')}
       ORDER BY name ASC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return result.rows.map(this.mapMedicationRow);
  }

  async getActiveMedications(userId: string): Promise<Medication[]> {
    return this.listMedications(userId, { isActive: true });
  }

  // Dose Operations

  async createDose(dose: Omit<MedicationDose, 'id' | 'createdAt' | 'updatedAt'>): Promise<MedicationDose> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.query(
      `INSERT INTO medication_doses (
        id, medication_id, user_id, scheduled_for, status, taken_at,
        skipped_reason, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dose.medicationId,
        dose.userId,
        dose.scheduledFor,
        dose.status,
        dose.takenAt ?? null,
        dose.skippedReason ?? null,
        dose.notes ?? null,
        now,
        now,
      ]
    );

    return { ...dose, id, createdAt: now, updatedAt: now };
  }

  async getDose(id: string): Promise<MedicationDose | null> {
    const result = await this.db.query<DoseRow>(
      'SELECT * FROM medication_doses WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.mapDoseRow(result.rows[0]) : null;
  }

  async updateDose(id: string, updates: Partial<MedicationDose>): Promise<MedicationDose | null> {
    const existing = await this.getDose(id);
    if (!existing) return null;

    const now = Date.now();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.takenAt !== undefined) {
      fields.push('taken_at = ?');
      values.push(updates.takenAt);
    }
    if (updates.skippedReason !== undefined) {
      fields.push('skipped_reason = ?');
      values.push(updates.skippedReason);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }

    values.push(id);
    await this.db.query(`UPDATE medication_doses SET ${fields.join(', ')} WHERE id = ?`, values);

    return this.getDose(id);
  }

  async deleteDose(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM medication_doses WHERE id = ?', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listDoses(userId: string, options: DoseQueryOptions = {}): Promise<MedicationDose[]> {
    const conditions: string[] = ['user_id = ?'];
    const values: unknown[] = [userId];

    if (options.medicationId) {
      conditions.push('medication_id = ?');
      values.push(options.medicationId);
    }
    if (options.status) {
      conditions.push('status = ?');
      values.push(options.status);
    }
    if (options.startDate) {
      conditions.push('scheduled_for >= ?');
      values.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push('scheduled_for <= ?');
      values.push(options.endDate);
    }

    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const result = await this.db.query<DoseRow>(
      `SELECT * FROM medication_doses WHERE ${conditions.join(' AND ')}
       ORDER BY scheduled_for ASC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return result.rows.map(this.mapDoseRow);
  }

  async getScheduledDoses(userId: string, startTime: number, endTime: number): Promise<MedicationDose[]> {
    return this.listDoses(userId, { startDate: startTime, endDate: endTime, limit: 1000 });
  }

  async getPendingDoses(userId: string): Promise<MedicationDose[]> {
    const now = Date.now();
    const result = await this.db.query<DoseRow>(
      `SELECT * FROM medication_doses
       WHERE user_id = ? AND status = 'scheduled' AND scheduled_for <= ?
       ORDER BY scheduled_for ASC`,
      [userId, now]
    );
    return result.rows.map(this.mapDoseRow);
  }

  // Adherence Operations

  async calculateAdherence(
    userId: string,
    medicationId: string,
    period: 'daily' | 'weekly' | 'monthly',
    startDate: number,
    endDate: number
  ): Promise<MedicationAdherence> {
    const result = await this.db.query<{
      status: string;
      count: number;
    }>(
      `SELECT status, COUNT(*) as count FROM medication_doses
       WHERE user_id = ? AND medication_id = ? AND scheduled_for >= ? AND scheduled_for <= ?
       GROUP BY status`,
      [userId, medicationId, startDate, endDate]
    );

    let taken = 0;
    let skipped = 0;
    let delayed = 0;
    let missed = 0;
    let total = 0;

    for (const row of result.rows) {
      total += row.count;
      switch (row.status) {
        case 'taken':
          taken = row.count;
          break;
        case 'skipped':
          skipped = row.count;
          break;
        case 'delayed':
          delayed = row.count;
          break;
        case 'missed':
          missed = row.count;
          break;
      }
    }

    const adherenceRate = total > 0 ? (taken / total) * 100 : 100;

    return {
      medicationId,
      userId,
      period,
      startDate,
      endDate,
      totalScheduled: total,
      taken,
      skipped,
      delayed,
      missed,
      adherenceRate,
    };
  }

  async getOverallAdherence(userId: string, startDate: number, endDate: number): Promise<number> {
    const result = await this.db.query<{
      total: number;
      taken: number;
    }>(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken
       FROM medication_doses
       WHERE user_id = ? AND scheduled_for >= ? AND scheduled_for <= ?`,
      [userId, startDate, endDate]
    );

    const { total, taken } = result.rows[0] ?? { total: 0, taken: 0 };
    return total > 0 ? (taken / total) * 100 : 100;
  }

  // Helper Methods

  private mapMedicationRow(row: MedicationRow): Medication {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      genericName: row.generic_name ?? undefined,
      dosage: row.dosage,
      dosageUnit: row.dosage_unit,
      frequency: row.frequency as MedicationFrequency,
      instructions: row.instructions ? JSON.parse(row.instructions) : undefined,
      prescribedBy: row.prescribed_by ?? undefined,
      pharmacy: row.pharmacy ?? undefined,
      refillInfo: row.refill_info ? JSON.parse(row.refill_info) : undefined,
      startDate: row.start_date,
      endDate: row.end_date ?? undefined,
      isActive: row.is_active === 1,
      reminders: row.reminders ? JSON.parse(row.reminders) : [],
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapDoseRow(row: DoseRow): MedicationDose {
    return {
      id: row.id,
      medicationId: row.medication_id,
      userId: row.user_id,
      scheduledFor: row.scheduled_for,
      status: row.status as DoseStatus,
      takenAt: row.taken_at ?? undefined,
      skippedReason: row.skipped_reason ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryMedicationStore implements MedicationStore {
  private medications = new Map<string, Medication>();
  private doses = new Map<string, MedicationDose>();

  async initialize(): Promise<void> {
    // No-op
  }

  // Medication Operations

  async createMedication(
    medication: Omit<Medication, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Medication> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const newMedication: Medication = { ...medication, id, createdAt: now, updatedAt: now };
    this.medications.set(id, newMedication);
    return newMedication;
  }

  async getMedication(id: string): Promise<Medication | null> {
    return this.medications.get(id) ?? null;
  }

  async updateMedication(id: string, updates: Partial<Medication>): Promise<Medication | null> {
    const existing = this.medications.get(id);
    if (!existing) return null;
    const updated: Medication = { ...existing, ...updates, id, updatedAt: Date.now() };
    this.medications.set(id, updated);
    return updated;
  }

  async deleteMedication(id: string): Promise<boolean> {
    // Also delete associated doses
    for (const [doseId, dose] of this.doses) {
      if (dose.medicationId === id) {
        this.doses.delete(doseId);
      }
    }
    return this.medications.delete(id);
  }

  async listMedications(userId: string, options: MedicationQueryOptions = {}): Promise<Medication[]> {
    let results = Array.from(this.medications.values()).filter((m) => m.userId === userId);

    if (options.isActive !== undefined) {
      results = results.filter((m) => m.isActive === options.isActive);
    }
    if (options.frequency) {
      results = results.filter((m) => m.frequency === options.frequency);
    }

    results.sort((a, b) => a.name.localeCompare(b.name));

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async getActiveMedications(userId: string): Promise<Medication[]> {
    return this.listMedications(userId, { isActive: true });
  }

  // Dose Operations

  async createDose(dose: Omit<MedicationDose, 'id' | 'createdAt' | 'updatedAt'>): Promise<MedicationDose> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const newDose: MedicationDose = { ...dose, id, createdAt: now, updatedAt: now };
    this.doses.set(id, newDose);
    return newDose;
  }

  async getDose(id: string): Promise<MedicationDose | null> {
    return this.doses.get(id) ?? null;
  }

  async updateDose(id: string, updates: Partial<MedicationDose>): Promise<MedicationDose | null> {
    const existing = this.doses.get(id);
    if (!existing) return null;
    const updated: MedicationDose = { ...existing, ...updates, id, updatedAt: Date.now() };
    this.doses.set(id, updated);
    return updated;
  }

  async deleteDose(id: string): Promise<boolean> {
    return this.doses.delete(id);
  }

  async listDoses(userId: string, options: DoseQueryOptions = {}): Promise<MedicationDose[]> {
    let results = Array.from(this.doses.values()).filter((d) => d.userId === userId);

    if (options.medicationId) results = results.filter((d) => d.medicationId === options.medicationId);
    if (options.status) results = results.filter((d) => d.status === options.status);
    if (options.startDate) results = results.filter((d) => d.scheduledFor >= options.startDate!);
    if (options.endDate) results = results.filter((d) => d.scheduledFor <= options.endDate!);

    results.sort((a, b) => a.scheduledFor - b.scheduledFor);

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async getScheduledDoses(userId: string, startTime: number, endTime: number): Promise<MedicationDose[]> {
    return this.listDoses(userId, { startDate: startTime, endDate: endTime, limit: 1000 });
  }

  async getPendingDoses(userId: string): Promise<MedicationDose[]> {
    const now = Date.now();
    return Array.from(this.doses.values())
      .filter((d) => d.userId === userId && d.status === 'scheduled' && d.scheduledFor <= now)
      .sort((a, b) => a.scheduledFor - b.scheduledFor);
  }

  // Adherence Operations

  async calculateAdherence(
    userId: string,
    medicationId: string,
    period: 'daily' | 'weekly' | 'monthly',
    startDate: number,
    endDate: number
  ): Promise<MedicationAdherence> {
    const doses = Array.from(this.doses.values()).filter(
      (d) =>
        d.userId === userId &&
        d.medicationId === medicationId &&
        d.scheduledFor >= startDate &&
        d.scheduledFor <= endDate
    );

    const taken = doses.filter((d) => d.status === 'taken').length;
    const skipped = doses.filter((d) => d.status === 'skipped').length;
    const delayed = doses.filter((d) => d.status === 'delayed').length;
    const missed = doses.filter((d) => d.status === 'missed').length;
    const total = doses.length;

    const adherenceRate = total > 0 ? (taken / total) * 100 : 100;

    return {
      medicationId,
      userId,
      period,
      startDate,
      endDate,
      totalScheduled: total,
      taken,
      skipped,
      delayed,
      missed,
      adherenceRate,
    };
  }

  async getOverallAdherence(userId: string, startDate: number, endDate: number): Promise<number> {
    const doses = Array.from(this.doses.values()).filter(
      (d) => d.userId === userId && d.scheduledFor >= startDate && d.scheduledFor <= endDate
    );

    const taken = doses.filter((d) => d.status === 'taken').length;
    const total = doses.length;

    return total > 0 ? (taken / total) * 100 : 100;
  }
}

// =============================================================================
// Row Types
// =============================================================================

interface MedicationRow {
  id: string;
  user_id: string;
  name: string;
  generic_name: string | null;
  dosage: number;
  dosage_unit: string;
  frequency: string;
  instructions: string | null;
  prescribed_by: string | null;
  pharmacy: string | null;
  refill_info: string | null;
  start_date: number;
  end_date: number | null;
  is_active: number;
  reminders: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

interface DoseRow {
  id: string;
  medication_id: string;
  user_id: string;
  scheduled_for: number;
  status: string;
  taken_at: number | null;
  skipped_reason: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createMedicationStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): MedicationStore {
  if (type === 'database') {
    if (!db) {
      throw new Error('Database adapter required for database store');
    }
    return new DatabaseMedicationStore(db);
  }
  return new InMemoryMedicationStore();
}
