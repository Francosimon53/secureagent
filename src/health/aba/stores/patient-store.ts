/**
 * Patient Store
 *
 * Storage for patient records with support for:
 * - Patient CRUD operations
 * - Contact management
 * - Insurance information
 * - Both in-memory and database implementations
 */

import type { DatabaseAdapter } from '../../../persistence/index.js';
import type { Patient, PatientContact, InsuranceInfo, PatientQueryOptions, Timestamp } from '../types.js';

// =============================================================================
// Patient Store Interface
// =============================================================================

export interface PatientStore {
  initialize(): Promise<void>;

  // Patient CRUD
  createPatient(patient: Omit<Patient, 'id' | 'createdAt' | 'updatedAt'>): Promise<Patient>;
  getPatient(id: string): Promise<Patient | null>;
  getPatientByMRN(userId: string, mrn: string): Promise<Patient | null>;
  updatePatient(id: string, updates: Partial<Patient>): Promise<Patient | null>;
  deletePatient(id: string): Promise<boolean>;
  listPatients(userId: string, options?: PatientQueryOptions): Promise<Patient[]>;
  countPatients(userId: string, options?: PatientQueryOptions): Promise<number>;

  // Contact operations
  addContact(patientId: string, contact: Omit<PatientContact, 'id'>): Promise<Patient | null>;
  updateContact(patientId: string, contactId: string, updates: Partial<PatientContact>): Promise<Patient | null>;
  removeContact(patientId: string, contactId: string): Promise<Patient | null>;
  getPrimaryContact(patientId: string): Promise<PatientContact | null>;

  // Insurance operations
  addInsurance(patientId: string, insurance: InsuranceInfo): Promise<Patient | null>;
  updateInsurance(patientId: string, payerId: string, updates: Partial<InsuranceInfo>): Promise<Patient | null>;
  removeInsurance(patientId: string, payerId: string): Promise<Patient | null>;
  getPrimaryInsurance(patientId: string): Promise<InsuranceInfo | null>;

  // Specialized queries
  getPatientsByBCBA(userId: string, bcbaId: string): Promise<Patient[]>;
  getPatientsByStatus(userId: string, status: Patient['status']): Promise<Patient[]>;
  searchPatients(userId: string, searchTerm: string): Promise<Patient[]>;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabasePatientStore implements PatientStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Create patients table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS health_patients (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        date_of_birth INTEGER NOT NULL,
        gender TEXT NOT NULL,
        mrn TEXT,
        diagnosis_codes TEXT NOT NULL DEFAULT '[]',
        primary_diagnosis TEXT,
        address TEXT,
        contacts TEXT NOT NULL DEFAULT '[]',
        insurance TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        treatment_start_date INTEGER,
        assigned_bcba TEXT,
        notes TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.query('CREATE INDEX IF NOT EXISTS idx_health_patients_user ON health_patients(user_id)');
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_health_patients_mrn ON health_patients(user_id, mrn)');
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_health_patients_status ON health_patients(user_id, status)');
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_health_patients_bcba ON health_patients(user_id, assigned_bcba)');
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_health_patients_name ON health_patients(user_id, last_name, first_name)');
  }

  async createPatient(patient: Omit<Patient, 'id' | 'createdAt' | 'updatedAt'>): Promise<Patient> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.query(
      `INSERT INTO health_patients (
        id, user_id, first_name, last_name, date_of_birth, gender, mrn,
        diagnosis_codes, primary_diagnosis, address, contacts, insurance,
        status, treatment_start_date, assigned_bcba, notes, metadata,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        patient.userId,
        patient.firstName,
        patient.lastName,
        patient.dateOfBirth,
        patient.gender,
        patient.mrn ?? null,
        JSON.stringify(patient.diagnosisCodes),
        patient.primaryDiagnosis ?? null,
        patient.address ? JSON.stringify(patient.address) : null,
        JSON.stringify(patient.contacts),
        JSON.stringify(patient.insurance),
        patient.status,
        patient.treatmentStartDate ?? null,
        patient.assignedBCBA ?? null,
        patient.notes ?? null,
        patient.metadata ? JSON.stringify(patient.metadata) : null,
        now,
        now,
      ]
    );

    return { ...patient, id, createdAt: now, updatedAt: now };
  }

  async getPatient(id: string): Promise<Patient | null> {
    const result = await this.db.query<PatientRow>(
      'SELECT * FROM health_patients WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.mapPatientRow(result.rows[0]) : null;
  }

  async getPatientByMRN(userId: string, mrn: string): Promise<Patient | null> {
    const result = await this.db.query<PatientRow>(
      'SELECT * FROM health_patients WHERE user_id = ? AND mrn = ?',
      [userId, mrn]
    );
    return result.rows[0] ? this.mapPatientRow(result.rows[0]) : null;
  }

  async updatePatient(id: string, updates: Partial<Patient>): Promise<Patient | null> {
    const existing = await this.getPatient(id);
    if (!existing) return null;

    const now = Date.now();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.firstName !== undefined) {
      fields.push('first_name = ?');
      values.push(updates.firstName);
    }
    if (updates.lastName !== undefined) {
      fields.push('last_name = ?');
      values.push(updates.lastName);
    }
    if (updates.dateOfBirth !== undefined) {
      fields.push('date_of_birth = ?');
      values.push(updates.dateOfBirth);
    }
    if (updates.gender !== undefined) {
      fields.push('gender = ?');
      values.push(updates.gender);
    }
    if (updates.mrn !== undefined) {
      fields.push('mrn = ?');
      values.push(updates.mrn);
    }
    if (updates.diagnosisCodes !== undefined) {
      fields.push('diagnosis_codes = ?');
      values.push(JSON.stringify(updates.diagnosisCodes));
    }
    if (updates.primaryDiagnosis !== undefined) {
      fields.push('primary_diagnosis = ?');
      values.push(updates.primaryDiagnosis);
    }
    if (updates.address !== undefined) {
      fields.push('address = ?');
      values.push(updates.address ? JSON.stringify(updates.address) : null);
    }
    if (updates.contacts !== undefined) {
      fields.push('contacts = ?');
      values.push(JSON.stringify(updates.contacts));
    }
    if (updates.insurance !== undefined) {
      fields.push('insurance = ?');
      values.push(JSON.stringify(updates.insurance));
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.treatmentStartDate !== undefined) {
      fields.push('treatment_start_date = ?');
      values.push(updates.treatmentStartDate);
    }
    if (updates.assignedBCBA !== undefined) {
      fields.push('assigned_bcba = ?');
      values.push(updates.assignedBCBA);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await this.db.query(
      `UPDATE health_patients SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return this.getPatient(id);
  }

  async deletePatient(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM health_patients WHERE id = ?', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listPatients(userId: string, options: PatientQueryOptions = {}): Promise<Patient[]> {
    const { conditions, values } = this.buildQuery(userId, options);
    const orderBy = this.mapOrderBy(options.orderBy ?? 'lastName');
    const orderDir = options.orderDirection ?? 'asc';
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const result = await this.db.query<PatientRow>(
      `SELECT * FROM health_patients WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy} ${orderDir.toUpperCase()} LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return result.rows.map((row) => this.mapPatientRow(row));
  }

  async countPatients(userId: string, options: PatientQueryOptions = {}): Promise<number> {
    const { conditions, values } = this.buildQuery(userId, options);

    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM health_patients WHERE ${conditions.join(' AND ')}`,
      values
    );

    return result.rows[0]?.count ?? 0;
  }

  async addContact(patientId: string, contact: Omit<PatientContact, 'id'>): Promise<Patient | null> {
    const patient = await this.getPatient(patientId);
    if (!patient) return null;

    const newContact: PatientContact = {
      ...contact,
      id: crypto.randomUUID(),
    };

    const contacts = [...patient.contacts, newContact];
    return this.updatePatient(patientId, { contacts });
  }

  async updateContact(
    patientId: string,
    contactId: string,
    updates: Partial<PatientContact>
  ): Promise<Patient | null> {
    const patient = await this.getPatient(patientId);
    if (!patient) return null;

    const contacts = patient.contacts.map((c) =>
      c.id === contactId ? { ...c, ...updates, id: contactId } : c
    );

    return this.updatePatient(patientId, { contacts });
  }

  async removeContact(patientId: string, contactId: string): Promise<Patient | null> {
    const patient = await this.getPatient(patientId);
    if (!patient) return null;

    const contacts = patient.contacts.filter((c) => c.id !== contactId);
    return this.updatePatient(patientId, { contacts });
  }

  async getPrimaryContact(patientId: string): Promise<PatientContact | null> {
    const patient = await this.getPatient(patientId);
    if (!patient) return null;

    return patient.contacts.find((c) => c.isPrimary) ?? patient.contacts[0] ?? null;
  }

  async addInsurance(patientId: string, insurance: InsuranceInfo): Promise<Patient | null> {
    const patient = await this.getPatient(patientId);
    if (!patient) return null;

    const insuranceList = [...patient.insurance, insurance];
    return this.updatePatient(patientId, { insurance: insuranceList });
  }

  async updateInsurance(
    patientId: string,
    payerId: string,
    updates: Partial<InsuranceInfo>
  ): Promise<Patient | null> {
    const patient = await this.getPatient(patientId);
    if (!patient) return null;

    const insurance = patient.insurance.map((i) =>
      i.payerId === payerId ? { ...i, ...updates, payerId } : i
    );

    return this.updatePatient(patientId, { insurance });
  }

  async removeInsurance(patientId: string, payerId: string): Promise<Patient | null> {
    const patient = await this.getPatient(patientId);
    if (!patient) return null;

    const insurance = patient.insurance.filter((i) => i.payerId !== payerId);
    return this.updatePatient(patientId, { insurance });
  }

  async getPrimaryInsurance(patientId: string): Promise<InsuranceInfo | null> {
    const patient = await this.getPatient(patientId);
    if (!patient) return null;

    return patient.insurance.find((i) => i.isPrimary) ?? patient.insurance[0] ?? null;
  }

  async getPatientsByBCBA(userId: string, bcbaId: string): Promise<Patient[]> {
    const result = await this.db.query<PatientRow>(
      'SELECT * FROM health_patients WHERE user_id = ? AND assigned_bcba = ? ORDER BY last_name, first_name',
      [userId, bcbaId]
    );
    return result.rows.map((row) => this.mapPatientRow(row));
  }

  async getPatientsByStatus(userId: string, status: Patient['status']): Promise<Patient[]> {
    const result = await this.db.query<PatientRow>(
      'SELECT * FROM health_patients WHERE user_id = ? AND status = ? ORDER BY last_name, first_name',
      [userId, status]
    );
    return result.rows.map((row) => this.mapPatientRow(row));
  }

  async searchPatients(userId: string, searchTerm: string): Promise<Patient[]> {
    const term = `%${searchTerm}%`;
    const result = await this.db.query<PatientRow>(
      `SELECT * FROM health_patients
       WHERE user_id = ? AND (
         first_name LIKE ? OR
         last_name LIKE ? OR
         mrn LIKE ? OR
         first_name || ' ' || last_name LIKE ?
       )
       ORDER BY last_name, first_name LIMIT 50`,
      [userId, term, term, term, term]
    );
    return result.rows.map((row) => this.mapPatientRow(row));
  }

  private buildQuery(
    userId: string,
    options: PatientQueryOptions
  ): { conditions: string[]; values: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const values: unknown[] = [userId];

    if (options.status) {
      conditions.push('status = ?');
      values.push(options.status);
    }
    if (options.assignedBCBA) {
      conditions.push('assigned_bcba = ?');
      values.push(options.assignedBCBA);
    }
    if (options.searchTerm) {
      const term = `%${options.searchTerm}%`;
      conditions.push('(first_name LIKE ? OR last_name LIKE ? OR mrn LIKE ?)');
      values.push(term, term, term);
    }

    return { conditions, values };
  }

  private mapOrderBy(orderBy: string): string {
    switch (orderBy) {
      case 'lastName':
        return 'last_name';
      case 'createdAt':
        return 'created_at';
      case 'treatmentStartDate':
        return 'treatment_start_date';
      default:
        return 'last_name';
    }
  }

  private mapPatientRow(row: PatientRow): Patient {
    return {
      id: row.id,
      userId: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      dateOfBirth: row.date_of_birth,
      gender: row.gender as Patient['gender'],
      mrn: row.mrn ?? undefined,
      diagnosisCodes: JSON.parse(row.diagnosis_codes),
      primaryDiagnosis: row.primary_diagnosis ?? undefined,
      address: row.address ? JSON.parse(row.address) : undefined,
      contacts: JSON.parse(row.contacts),
      insurance: JSON.parse(row.insurance),
      status: row.status as Patient['status'],
      treatmentStartDate: row.treatment_start_date ?? undefined,
      assignedBCBA: row.assigned_bcba ?? undefined,
      notes: row.notes ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryPatientStore implements PatientStore {
  private patients = new Map<string, Patient>();

  async initialize(): Promise<void> {}

  async createPatient(patient: Omit<Patient, 'id' | 'createdAt' | 'updatedAt'>): Promise<Patient> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const newPatient: Patient = { ...patient, id, createdAt: now, updatedAt: now };
    this.patients.set(id, newPatient);
    return newPatient;
  }

  async getPatient(id: string): Promise<Patient | null> {
    return this.patients.get(id) ?? null;
  }

  async getPatientByMRN(userId: string, mrn: string): Promise<Patient | null> {
    for (const patient of this.patients.values()) {
      if (patient.userId === userId && patient.mrn === mrn) {
        return patient;
      }
    }
    return null;
  }

  async updatePatient(id: string, updates: Partial<Patient>): Promise<Patient | null> {
    const existing = this.patients.get(id);
    if (!existing) return null;

    const updated: Patient = { ...existing, ...updates, id, updatedAt: Date.now() };
    this.patients.set(id, updated);
    return updated;
  }

  async deletePatient(id: string): Promise<boolean> {
    return this.patients.delete(id);
  }

  async listPatients(userId: string, options: PatientQueryOptions = {}): Promise<Patient[]> {
    let results = Array.from(this.patients.values()).filter((p) => p.userId === userId);

    if (options.status) {
      results = results.filter((p) => p.status === options.status);
    }
    if (options.assignedBCBA) {
      results = results.filter((p) => p.assignedBCBA === options.assignedBCBA);
    }
    if (options.searchTerm) {
      const term = options.searchTerm.toLowerCase();
      results = results.filter(
        (p) =>
          p.firstName.toLowerCase().includes(term) ||
          p.lastName.toLowerCase().includes(term) ||
          p.mrn?.toLowerCase().includes(term)
      );
    }

    const orderDir = options.orderDirection === 'desc' ? -1 : 1;
    results.sort((a, b) => {
      switch (options.orderBy) {
        case 'createdAt':
          return (a.createdAt - b.createdAt) * orderDir;
        case 'treatmentStartDate':
          return ((a.treatmentStartDate ?? 0) - (b.treatmentStartDate ?? 0)) * orderDir;
        default:
          return a.lastName.localeCompare(b.lastName) * orderDir;
      }
    });

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async countPatients(userId: string, options: PatientQueryOptions = {}): Promise<number> {
    const results = await this.listPatients(userId, { ...options, limit: Infinity, offset: 0 });
    return results.length;
  }

  async addContact(patientId: string, contact: Omit<PatientContact, 'id'>): Promise<Patient | null> {
    const patient = this.patients.get(patientId);
    if (!patient) return null;

    const newContact: PatientContact = { ...contact, id: crypto.randomUUID() };
    const updated = { ...patient, contacts: [...patient.contacts, newContact], updatedAt: Date.now() };
    this.patients.set(patientId, updated);
    return updated;
  }

  async updateContact(
    patientId: string,
    contactId: string,
    updates: Partial<PatientContact>
  ): Promise<Patient | null> {
    const patient = this.patients.get(patientId);
    if (!patient) return null;

    const contacts = patient.contacts.map((c) =>
      c.id === contactId ? { ...c, ...updates, id: contactId } : c
    );
    const updated = { ...patient, contacts, updatedAt: Date.now() };
    this.patients.set(patientId, updated);
    return updated;
  }

  async removeContact(patientId: string, contactId: string): Promise<Patient | null> {
    const patient = this.patients.get(patientId);
    if (!patient) return null;

    const contacts = patient.contacts.filter((c) => c.id !== contactId);
    const updated = { ...patient, contacts, updatedAt: Date.now() };
    this.patients.set(patientId, updated);
    return updated;
  }

  async getPrimaryContact(patientId: string): Promise<PatientContact | null> {
    const patient = this.patients.get(patientId);
    if (!patient) return null;
    return patient.contacts.find((c) => c.isPrimary) ?? patient.contacts[0] ?? null;
  }

  async addInsurance(patientId: string, insurance: InsuranceInfo): Promise<Patient | null> {
    const patient = this.patients.get(patientId);
    if (!patient) return null;

    const updated = { ...patient, insurance: [...patient.insurance, insurance], updatedAt: Date.now() };
    this.patients.set(patientId, updated);
    return updated;
  }

  async updateInsurance(
    patientId: string,
    payerId: string,
    updates: Partial<InsuranceInfo>
  ): Promise<Patient | null> {
    const patient = this.patients.get(patientId);
    if (!patient) return null;

    const insurance = patient.insurance.map((i) =>
      i.payerId === payerId ? { ...i, ...updates, payerId } : i
    );
    const updated = { ...patient, insurance, updatedAt: Date.now() };
    this.patients.set(patientId, updated);
    return updated;
  }

  async removeInsurance(patientId: string, payerId: string): Promise<Patient | null> {
    const patient = this.patients.get(patientId);
    if (!patient) return null;

    const insurance = patient.insurance.filter((i) => i.payerId !== payerId);
    const updated = { ...patient, insurance, updatedAt: Date.now() };
    this.patients.set(patientId, updated);
    return updated;
  }

  async getPrimaryInsurance(patientId: string): Promise<InsuranceInfo | null> {
    const patient = this.patients.get(patientId);
    if (!patient) return null;
    return patient.insurance.find((i) => i.isPrimary) ?? patient.insurance[0] ?? null;
  }

  async getPatientsByBCBA(userId: string, bcbaId: string): Promise<Patient[]> {
    return Array.from(this.patients.values())
      .filter((p) => p.userId === userId && p.assignedBCBA === bcbaId)
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
  }

  async getPatientsByStatus(userId: string, status: Patient['status']): Promise<Patient[]> {
    return Array.from(this.patients.values())
      .filter((p) => p.userId === userId && p.status === status)
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
  }

  async searchPatients(userId: string, searchTerm: string): Promise<Patient[]> {
    const term = searchTerm.toLowerCase();
    return Array.from(this.patients.values())
      .filter(
        (p) =>
          p.userId === userId &&
          (p.firstName.toLowerCase().includes(term) ||
            p.lastName.toLowerCase().includes(term) ||
            p.mrn?.toLowerCase().includes(term) ||
            `${p.firstName} ${p.lastName}`.toLowerCase().includes(term))
      )
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
      .slice(0, 50);
  }
}

// =============================================================================
// Row Type
// =============================================================================

interface PatientRow {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: number;
  gender: string;
  mrn: string | null;
  diagnosis_codes: string;
  primary_diagnosis: string | null;
  address: string | null;
  contacts: string;
  insurance: string;
  status: string;
  treatment_start_date: number | null;
  assigned_bcba: string | null;
  notes: string | null;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPatientStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): PatientStore {
  if (type === 'database') {
    if (!db) {
      throw new Error('Database adapter required for database store');
    }
    return new DatabasePatientStore(db);
  }
  return new InMemoryPatientStore();
}
