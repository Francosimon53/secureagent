/**
 * Biomarker Store
 *
 * Storage for lab reports and biomarkers with support for:
 * - Lab report management
 * - Biomarker CRUD operations
 * - Historical trend queries
 * - Both in-memory and database implementations
 */

import type { DatabaseAdapter } from '../../persistence/index.js';
import type {
  Biomarker,
  LabReport,
  BiomarkerQueryOptions,
  BiomarkerCategory,
  BiomarkerStatus,
  ReferenceRange,
} from '../types.js';

// =============================================================================
// Biomarker Store Interface
// =============================================================================

export interface BiomarkerStore {
  initialize(): Promise<void>;

  // Lab Report Operations
  createLabReport(report: Omit<LabReport, 'id' | 'createdAt' | 'updatedAt'>): Promise<LabReport>;
  getLabReport(id: string): Promise<LabReport | null>;
  updateLabReport(id: string, updates: Partial<LabReport>): Promise<LabReport | null>;
  deleteLabReport(id: string): Promise<boolean>;
  listLabReports(userId: string, options?: { limit?: number; offset?: number }): Promise<LabReport[]>;

  // Biomarker Operations
  createBiomarker(biomarker: Omit<Biomarker, 'id' | 'createdAt' | 'updatedAt'>): Promise<Biomarker>;
  getBiomarker(id: string): Promise<Biomarker | null>;
  updateBiomarker(id: string, updates: Partial<Biomarker>): Promise<Biomarker | null>;
  deleteBiomarker(id: string): Promise<boolean>;
  listBiomarkers(userId: string, options?: BiomarkerQueryOptions): Promise<Biomarker[]>;
  countBiomarkers(userId: string, options?: BiomarkerQueryOptions): Promise<number>;

  // Specialized Queries
  getBiomarkersByLabReport(labReportId: string): Promise<Biomarker[]>;
  getBiomarkerHistory(userId: string, biomarkerName: string, limit?: number): Promise<Biomarker[]>;
  getAbnormalBiomarkers(userId: string): Promise<Biomarker[]>;
  getLatestBiomarkerByName(userId: string, name: string): Promise<Biomarker | null>;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseBiomarkerStore implements BiomarkerStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Create lab_reports table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS lab_reports (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        lab_name TEXT,
        ordering_physician TEXT,
        collection_date INTEGER NOT NULL,
        report_date INTEGER NOT NULL,
        source_file TEXT,
        biomarker_count INTEGER DEFAULT 0,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_lab_reports_user ON lab_reports(user_id)');
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_lab_reports_date ON lab_reports(collection_date)');

    // Create biomarkers table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS biomarkers (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        lab_report_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT,
        category TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL,
        reference_low REAL,
        reference_high REAL,
        optimal_low REAL,
        optimal_high REAL,
        reference_unit TEXT NOT NULL,
        status TEXT NOT NULL,
        test_date INTEGER NOT NULL,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (lab_report_id) REFERENCES lab_reports(id) ON DELETE CASCADE
      )
    `);
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_biomarkers_user ON biomarkers(user_id)');
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_biomarkers_name ON biomarkers(name)');
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_biomarkers_date ON biomarkers(test_date)');
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_biomarkers_report ON biomarkers(lab_report_id)');
  }

  // Lab Report Operations

  async createLabReport(report: Omit<LabReport, 'id' | 'createdAt' | 'updatedAt'>): Promise<LabReport> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.query(
      `INSERT INTO lab_reports (
        id, user_id, lab_name, ordering_physician, collection_date, report_date,
        source_file, biomarker_count, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        report.userId,
        report.labName ?? null,
        report.orderingPhysician ?? null,
        report.collectionDate,
        report.reportDate,
        report.sourceFile ?? null,
        report.biomarkerCount,
        report.notes ?? null,
        now,
        now,
      ]
    );

    return { ...report, id, createdAt: now, updatedAt: now };
  }

  async getLabReport(id: string): Promise<LabReport | null> {
    const result = await this.db.query<LabReportRow>(
      'SELECT * FROM lab_reports WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.mapLabReportRow(result.rows[0]) : null;
  }

  async updateLabReport(id: string, updates: Partial<LabReport>): Promise<LabReport | null> {
    const existing = await this.getLabReport(id);
    if (!existing) return null;

    const now = Date.now();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.labName !== undefined) {
      fields.push('lab_name = ?');
      values.push(updates.labName);
    }
    if (updates.orderingPhysician !== undefined) {
      fields.push('ordering_physician = ?');
      values.push(updates.orderingPhysician);
    }
    if (updates.collectionDate !== undefined) {
      fields.push('collection_date = ?');
      values.push(updates.collectionDate);
    }
    if (updates.reportDate !== undefined) {
      fields.push('report_date = ?');
      values.push(updates.reportDate);
    }
    if (updates.sourceFile !== undefined) {
      fields.push('source_file = ?');
      values.push(updates.sourceFile);
    }
    if (updates.biomarkerCount !== undefined) {
      fields.push('biomarker_count = ?');
      values.push(updates.biomarkerCount);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await this.db.query(`UPDATE lab_reports SET ${fields.join(', ')} WHERE id = ?`, values);

    return this.getLabReport(id);
  }

  async deleteLabReport(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM lab_reports WHERE id = ?', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listLabReports(
    userId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<LabReport[]> {
    const { limit = 100, offset = 0 } = options;
    const result = await this.db.query<LabReportRow>(
      'SELECT * FROM lab_reports WHERE user_id = ? ORDER BY collection_date DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    );
    return result.rows.map(this.mapLabReportRow);
  }

  // Biomarker Operations

  async createBiomarker(biomarker: Omit<Biomarker, 'id' | 'createdAt' | 'updatedAt'>): Promise<Biomarker> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.query(
      `INSERT INTO biomarkers (
        id, user_id, lab_report_id, name, code, category, value, unit,
        reference_low, reference_high, optimal_low, optimal_high, reference_unit,
        status, test_date, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        biomarker.userId,
        biomarker.labReportId,
        biomarker.name,
        biomarker.code ?? null,
        biomarker.category,
        biomarker.value,
        biomarker.unit,
        biomarker.referenceRange.low ?? null,
        biomarker.referenceRange.high ?? null,
        biomarker.referenceRange.optimalLow ?? null,
        biomarker.referenceRange.optimalHigh ?? null,
        biomarker.referenceRange.unit,
        biomarker.status,
        biomarker.testDate,
        biomarker.notes ?? null,
        now,
        now,
      ]
    );

    return { ...biomarker, id, createdAt: now, updatedAt: now };
  }

  async getBiomarker(id: string): Promise<Biomarker | null> {
    const result = await this.db.query<BiomarkerRow>('SELECT * FROM biomarkers WHERE id = ?', [id]);
    return result.rows[0] ? this.mapBiomarkerRow(result.rows[0]) : null;
  }

  async updateBiomarker(id: string, updates: Partial<Biomarker>): Promise<Biomarker | null> {
    const existing = await this.getBiomarker(id);
    if (!existing) return null;

    const now = Date.now();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.code !== undefined) {
      fields.push('code = ?');
      values.push(updates.code);
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      values.push(updates.category);
    }
    if (updates.value !== undefined) {
      fields.push('value = ?');
      values.push(updates.value);
    }
    if (updates.unit !== undefined) {
      fields.push('unit = ?');
      values.push(updates.unit);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.testDate !== undefined) {
      fields.push('test_date = ?');
      values.push(updates.testDate);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }
    if (updates.referenceRange !== undefined) {
      if (updates.referenceRange.low !== undefined) {
        fields.push('reference_low = ?');
        values.push(updates.referenceRange.low);
      }
      if (updates.referenceRange.high !== undefined) {
        fields.push('reference_high = ?');
        values.push(updates.referenceRange.high);
      }
      if (updates.referenceRange.optimalLow !== undefined) {
        fields.push('optimal_low = ?');
        values.push(updates.referenceRange.optimalLow);
      }
      if (updates.referenceRange.optimalHigh !== undefined) {
        fields.push('optimal_high = ?');
        values.push(updates.referenceRange.optimalHigh);
      }
      if (updates.referenceRange.unit !== undefined) {
        fields.push('reference_unit = ?');
        values.push(updates.referenceRange.unit);
      }
    }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await this.db.query(`UPDATE biomarkers SET ${fields.join(', ')} WHERE id = ?`, values);

    return this.getBiomarker(id);
  }

  async deleteBiomarker(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM biomarkers WHERE id = ?', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listBiomarkers(userId: string, options: BiomarkerQueryOptions = {}): Promise<Biomarker[]> {
    const { conditions, values } = this.buildBiomarkerQuery(userId, options);
    const orderBy = options.orderBy || 'test_date';
    const orderDir = options.orderDirection || 'desc';
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const result = await this.db.query<BiomarkerRow>(
      `SELECT * FROM biomarkers WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy} ${orderDir} LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return result.rows.map(this.mapBiomarkerRow);
  }

  async countBiomarkers(userId: string, options: BiomarkerQueryOptions = {}): Promise<number> {
    const { conditions, values } = this.buildBiomarkerQuery(userId, options);

    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM biomarkers WHERE ${conditions.join(' AND ')}`,
      values
    );

    return result.rows[0]?.count ?? 0;
  }

  // Specialized Queries

  async getBiomarkersByLabReport(labReportId: string): Promise<Biomarker[]> {
    const result = await this.db.query<BiomarkerRow>(
      'SELECT * FROM biomarkers WHERE lab_report_id = ? ORDER BY name',
      [labReportId]
    );
    return result.rows.map(this.mapBiomarkerRow);
  }

  async getBiomarkerHistory(userId: string, biomarkerName: string, limit = 20): Promise<Biomarker[]> {
    const result = await this.db.query<BiomarkerRow>(
      `SELECT * FROM biomarkers WHERE user_id = ? AND name = ?
       ORDER BY test_date DESC LIMIT ?`,
      [userId, biomarkerName, limit]
    );
    return result.rows.map(this.mapBiomarkerRow);
  }

  async getAbnormalBiomarkers(userId: string): Promise<Biomarker[]> {
    const result = await this.db.query<BiomarkerRow>(
      `SELECT * FROM biomarkers WHERE user_id = ? AND status != 'normal'
       ORDER BY test_date DESC`,
      [userId]
    );
    return result.rows.map(this.mapBiomarkerRow);
  }

  async getLatestBiomarkerByName(userId: string, name: string): Promise<Biomarker | null> {
    const result = await this.db.query<BiomarkerRow>(
      `SELECT * FROM biomarkers WHERE user_id = ? AND name = ?
       ORDER BY test_date DESC LIMIT 1`,
      [userId, name]
    );
    return result.rows[0] ? this.mapBiomarkerRow(result.rows[0]) : null;
  }

  // Helper Methods

  private buildBiomarkerQuery(
    userId: string,
    options: BiomarkerQueryOptions
  ): { conditions: string[]; values: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const values: unknown[] = [userId];

    if (options.category) {
      conditions.push('category = ?');
      values.push(options.category);
    }
    if (options.status) {
      conditions.push('status = ?');
      values.push(options.status);
    }
    if (options.labReportId) {
      conditions.push('lab_report_id = ?');
      values.push(options.labReportId);
    }
    if (options.name) {
      conditions.push('name = ?');
      values.push(options.name);
    }
    if (options.startDate) {
      conditions.push('test_date >= ?');
      values.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push('test_date <= ?');
      values.push(options.endDate);
    }

    return { conditions, values };
  }

  private mapLabReportRow(row: LabReportRow): LabReport {
    return {
      id: row.id,
      userId: row.user_id,
      labName: row.lab_name ?? undefined,
      orderingPhysician: row.ordering_physician ?? undefined,
      collectionDate: row.collection_date,
      reportDate: row.report_date,
      sourceFile: row.source_file ?? undefined,
      biomarkerCount: row.biomarker_count,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapBiomarkerRow(row: BiomarkerRow): Biomarker {
    return {
      id: row.id,
      userId: row.user_id,
      labReportId: row.lab_report_id,
      name: row.name,
      code: row.code ?? undefined,
      category: row.category as BiomarkerCategory,
      value: row.value,
      unit: row.unit,
      referenceRange: {
        low: row.reference_low ?? undefined,
        high: row.reference_high ?? undefined,
        optimalLow: row.optimal_low ?? undefined,
        optimalHigh: row.optimal_high ?? undefined,
        unit: row.reference_unit,
      },
      status: row.status as BiomarkerStatus,
      testDate: row.test_date,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryBiomarkerStore implements BiomarkerStore {
  private labReports = new Map<string, LabReport>();
  private biomarkers = new Map<string, Biomarker>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  // Lab Report Operations

  async createLabReport(report: Omit<LabReport, 'id' | 'createdAt' | 'updatedAt'>): Promise<LabReport> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const labReport: LabReport = { ...report, id, createdAt: now, updatedAt: now };
    this.labReports.set(id, labReport);
    return labReport;
  }

  async getLabReport(id: string): Promise<LabReport | null> {
    return this.labReports.get(id) ?? null;
  }

  async updateLabReport(id: string, updates: Partial<LabReport>): Promise<LabReport | null> {
    const existing = this.labReports.get(id);
    if (!existing) return null;

    const updated: LabReport = { ...existing, ...updates, id, updatedAt: Date.now() };
    this.labReports.set(id, updated);
    return updated;
  }

  async deleteLabReport(id: string): Promise<boolean> {
    // Also delete associated biomarkers
    for (const [biomarkerId, biomarker] of this.biomarkers) {
      if (biomarker.labReportId === id) {
        this.biomarkers.delete(biomarkerId);
      }
    }
    return this.labReports.delete(id);
  }

  async listLabReports(
    userId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<LabReport[]> {
    const { limit = 100, offset = 0 } = options;
    return Array.from(this.labReports.values())
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.collectionDate - a.collectionDate)
      .slice(offset, offset + limit);
  }

  // Biomarker Operations

  async createBiomarker(biomarker: Omit<Biomarker, 'id' | 'createdAt' | 'updatedAt'>): Promise<Biomarker> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const newBiomarker: Biomarker = { ...biomarker, id, createdAt: now, updatedAt: now };
    this.biomarkers.set(id, newBiomarker);
    return newBiomarker;
  }

  async getBiomarker(id: string): Promise<Biomarker | null> {
    return this.biomarkers.get(id) ?? null;
  }

  async updateBiomarker(id: string, updates: Partial<Biomarker>): Promise<Biomarker | null> {
    const existing = this.biomarkers.get(id);
    if (!existing) return null;

    const updated: Biomarker = {
      ...existing,
      ...updates,
      id,
      referenceRange: updates.referenceRange
        ? { ...existing.referenceRange, ...updates.referenceRange }
        : existing.referenceRange,
      updatedAt: Date.now(),
    };
    this.biomarkers.set(id, updated);
    return updated;
  }

  async deleteBiomarker(id: string): Promise<boolean> {
    return this.biomarkers.delete(id);
  }

  async listBiomarkers(userId: string, options: BiomarkerQueryOptions = {}): Promise<Biomarker[]> {
    let results = Array.from(this.biomarkers.values()).filter((b) => b.userId === userId);

    if (options.category) {
      results = results.filter((b) => b.category === options.category);
    }
    if (options.status) {
      results = results.filter((b) => b.status === options.status);
    }
    if (options.labReportId) {
      results = results.filter((b) => b.labReportId === options.labReportId);
    }
    if (options.name) {
      results = results.filter((b) => b.name === options.name);
    }
    if (options.startDate) {
      results = results.filter((b) => b.testDate >= options.startDate!);
    }
    if (options.endDate) {
      results = results.filter((b) => b.testDate <= options.endDate!);
    }

    const orderDir = options.orderDirection === 'asc' ? 1 : -1;
    results.sort((a, b) => (a.testDate - b.testDate) * orderDir);

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async countBiomarkers(userId: string, options: BiomarkerQueryOptions = {}): Promise<number> {
    const results = await this.listBiomarkers(userId, { ...options, limit: Infinity, offset: 0 });
    return results.length;
  }

  // Specialized Queries

  async getBiomarkersByLabReport(labReportId: string): Promise<Biomarker[]> {
    return Array.from(this.biomarkers.values())
      .filter((b) => b.labReportId === labReportId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getBiomarkerHistory(userId: string, biomarkerName: string, limit = 20): Promise<Biomarker[]> {
    return Array.from(this.biomarkers.values())
      .filter((b) => b.userId === userId && b.name === biomarkerName)
      .sort((a, b) => b.testDate - a.testDate)
      .slice(0, limit);
  }

  async getAbnormalBiomarkers(userId: string): Promise<Biomarker[]> {
    return Array.from(this.biomarkers.values())
      .filter((b) => b.userId === userId && b.status !== 'normal')
      .sort((a, b) => b.testDate - a.testDate);
  }

  async getLatestBiomarkerByName(userId: string, name: string): Promise<Biomarker | null> {
    const history = await this.getBiomarkerHistory(userId, name, 1);
    return history[0] ?? null;
  }
}

// =============================================================================
// Row Types
// =============================================================================

interface LabReportRow {
  id: string;
  user_id: string;
  lab_name: string | null;
  ordering_physician: string | null;
  collection_date: number;
  report_date: number;
  source_file: string | null;
  biomarker_count: number;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

interface BiomarkerRow {
  id: string;
  user_id: string;
  lab_report_id: string;
  name: string;
  code: string | null;
  category: string;
  value: number;
  unit: string;
  reference_low: number | null;
  reference_high: number | null;
  optimal_low: number | null;
  optimal_high: number | null;
  reference_unit: string;
  status: string;
  test_date: number;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createBiomarkerStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): BiomarkerStore {
  if (type === 'database') {
    if (!db) {
      throw new Error('Database adapter required for database store');
    }
    return new DatabaseBiomarkerStore(db);
  }
  return new InMemoryBiomarkerStore();
}
