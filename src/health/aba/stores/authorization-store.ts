/**
 * Authorization Store
 *
 * Storage for insurance authorizations with support for:
 * - Authorization CRUD operations
 * - Unit tracking
 * - Expiration monitoring
 * - Alert management
 * - Both in-memory and database implementations
 */

import type { DatabaseAdapter } from '../../../persistence/index.js';
import type {
  Authorization,
  AuthorizationAlert,
  AuthorizationQueryOptions,
  AuthorizationStatus,
  PatientId,
  AuthorizationId,
} from '../types.js';

// =============================================================================
// Authorization Store Interface
// =============================================================================

export interface AuthorizationStore {
  initialize(): Promise<void>;

  // Authorization CRUD
  createAuthorization(
    authorization: Omit<Authorization, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Authorization>;
  getAuthorization(id: AuthorizationId): Promise<Authorization | null>;
  getAuthorizationByNumber(userId: string, authNumber: string): Promise<Authorization | null>;
  updateAuthorization(
    id: AuthorizationId,
    updates: Partial<Authorization>
  ): Promise<Authorization | null>;
  deleteAuthorization(id: AuthorizationId): Promise<boolean>;
  listAuthorizations(userId: string, options?: AuthorizationQueryOptions): Promise<Authorization[]>;
  countAuthorizations(userId: string, options?: AuthorizationQueryOptions): Promise<number>;

  // Unit tracking
  useUnits(id: AuthorizationId, units: number): Promise<Authorization | null>;
  refundUnits(id: AuthorizationId, units: number): Promise<Authorization | null>;
  getUnitsRemaining(id: AuthorizationId): Promise<number | null>;

  // Status updates
  updateStatus(id: AuthorizationId, status: AuthorizationStatus): Promise<Authorization | null>;
  requestRenewal(id: AuthorizationId): Promise<Authorization | null>;

  // Alert operations
  addAlert(authorizationId: AuthorizationId, alert: Omit<AuthorizationAlert, 'id'>): Promise<Authorization | null>;
  acknowledgeAlert(authorizationId: AuthorizationId, alertId: string, userId: string): Promise<Authorization | null>;
  getUnacknowledgedAlerts(userId: string): Promise<Array<{ authorization: Authorization; alert: AuthorizationAlert }>>;

  // Specialized queries
  getAuthorizationsByPatient(userId: string, patientId: PatientId): Promise<Authorization[]>;
  getActiveAuthorizations(userId: string, patientId?: PatientId): Promise<Authorization[]>;
  getExpiringAuthorizations(userId: string, withinDays: number): Promise<Authorization[]>;
  getLowUnitAuthorizations(userId: string, thresholdPercent: number): Promise<Authorization[]>;
  getAuthorizationForService(
    userId: string,
    patientId: PatientId,
    serviceCode: string
  ): Promise<Authorization | null>;

  // Bulk operations
  updateExpiredAuthorizations(userId: string): Promise<number>;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseAuthorizationStore implements AuthorizationStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS health_authorizations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        payer_id TEXT NOT NULL,
        payer_name TEXT NOT NULL,
        authorization_number TEXT NOT NULL,
        service_code TEXT NOT NULL,
        service_description TEXT NOT NULL,
        total_units REAL NOT NULL,
        used_units REAL NOT NULL DEFAULT 0,
        remaining_units REAL NOT NULL,
        unit_type TEXT NOT NULL,
        start_date INTEGER NOT NULL,
        end_date INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        frequency_limit TEXT,
        renewal_requested INTEGER NOT NULL DEFAULT 0,
        renewal_request_date INTEGER,
        alerts TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        documents TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.query(
      'CREATE INDEX IF NOT EXISTS idx_health_auths_user ON health_authorizations(user_id)'
    );
    await this.db.query(
      'CREATE INDEX IF NOT EXISTS idx_health_auths_patient ON health_authorizations(user_id, patient_id)'
    );
    await this.db.query(
      'CREATE INDEX IF NOT EXISTS idx_health_auths_number ON health_authorizations(user_id, authorization_number)'
    );
    await this.db.query(
      'CREATE INDEX IF NOT EXISTS idx_health_auths_status ON health_authorizations(user_id, status)'
    );
    await this.db.query(
      'CREATE INDEX IF NOT EXISTS idx_health_auths_end_date ON health_authorizations(user_id, end_date)'
    );
    await this.db.query(
      'CREATE INDEX IF NOT EXISTS idx_health_auths_service ON health_authorizations(user_id, patient_id, service_code)'
    );
  }

  async createAuthorization(
    authorization: Omit<Authorization, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Authorization> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.query(
      `INSERT INTO health_authorizations (
        id, user_id, patient_id, payer_id, payer_name, authorization_number,
        service_code, service_description, total_units, used_units, remaining_units,
        unit_type, start_date, end_date, status, frequency_limit, renewal_requested,
        renewal_request_date, alerts, notes, documents, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        authorization.userId,
        authorization.patientId,
        authorization.payerId,
        authorization.payerName,
        authorization.authorizationNumber,
        authorization.serviceCode,
        authorization.serviceDescription,
        authorization.totalUnits,
        authorization.usedUnits,
        authorization.remainingUnits,
        authorization.unitType,
        authorization.startDate,
        authorization.endDate,
        authorization.status,
        authorization.frequencyLimit ? JSON.stringify(authorization.frequencyLimit) : null,
        authorization.renewalRequested ? 1 : 0,
        authorization.renewalRequestDate ?? null,
        JSON.stringify(authorization.alerts),
        authorization.notes ?? null,
        authorization.documents ? JSON.stringify(authorization.documents) : null,
        now,
        now,
      ]
    );

    return { ...authorization, id, createdAt: now, updatedAt: now };
  }

  async getAuthorization(id: AuthorizationId): Promise<Authorization | null> {
    const result = await this.db.query<AuthorizationRow>(
      'SELECT * FROM health_authorizations WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async getAuthorizationByNumber(userId: string, authNumber: string): Promise<Authorization | null> {
    const result = await this.db.query<AuthorizationRow>(
      'SELECT * FROM health_authorizations WHERE user_id = ? AND authorization_number = ?',
      [userId, authNumber]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async updateAuthorization(
    id: AuthorizationId,
    updates: Partial<Authorization>
  ): Promise<Authorization | null> {
    const existing = await this.getAuthorization(id);
    if (!existing) return null;

    const now = Date.now();
    const fields: string[] = [];
    const values: unknown[] = [];

    const fieldMap: Record<string, string> = {
      patientId: 'patient_id',
      payerId: 'payer_id',
      payerName: 'payer_name',
      authorizationNumber: 'authorization_number',
      serviceCode: 'service_code',
      serviceDescription: 'service_description',
      totalUnits: 'total_units',
      usedUnits: 'used_units',
      remainingUnits: 'remaining_units',
      unitType: 'unit_type',
      startDate: 'start_date',
      endDate: 'end_date',
      status: 'status',
      notes: 'notes',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if ((updates as Record<string, unknown>)[key] !== undefined) {
        fields.push(`${column} = ?`);
        values.push((updates as Record<string, unknown>)[key] ?? null);
      }
    }

    if (updates.frequencyLimit !== undefined) {
      fields.push('frequency_limit = ?');
      values.push(updates.frequencyLimit ? JSON.stringify(updates.frequencyLimit) : null);
    }
    if (updates.renewalRequested !== undefined) {
      fields.push('renewal_requested = ?');
      values.push(updates.renewalRequested ? 1 : 0);
    }
    if (updates.renewalRequestDate !== undefined) {
      fields.push('renewal_request_date = ?');
      values.push(updates.renewalRequestDate);
    }
    if (updates.alerts !== undefined) {
      fields.push('alerts = ?');
      values.push(JSON.stringify(updates.alerts));
    }
    if (updates.documents !== undefined) {
      fields.push('documents = ?');
      values.push(updates.documents ? JSON.stringify(updates.documents) : null);
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await this.db.query(
      `UPDATE health_authorizations SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return this.getAuthorization(id);
  }

  async deleteAuthorization(id: AuthorizationId): Promise<boolean> {
    const result = await this.db.query('DELETE FROM health_authorizations WHERE id = ?', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listAuthorizations(
    userId: string,
    options: AuthorizationQueryOptions = {}
  ): Promise<Authorization[]> {
    const { conditions, values } = this.buildQuery(userId, options);
    const orderBy = this.mapOrderBy(options.orderBy ?? 'endDate');
    const orderDir = options.orderDirection ?? 'asc';
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const result = await this.db.query<AuthorizationRow>(
      `SELECT * FROM health_authorizations WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy} ${orderDir.toUpperCase()} LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async countAuthorizations(
    userId: string,
    options: AuthorizationQueryOptions = {}
  ): Promise<number> {
    const { conditions, values } = this.buildQuery(userId, options);

    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM health_authorizations WHERE ${conditions.join(' AND ')}`,
      values
    );

    return result.rows[0]?.count ?? 0;
  }

  async useUnits(id: AuthorizationId, units: number): Promise<Authorization | null> {
    const auth = await this.getAuthorization(id);
    if (!auth) return null;

    const newUsed = auth.usedUnits + units;
    const newRemaining = auth.totalUnits - newUsed;

    return this.updateAuthorization(id, {
      usedUnits: newUsed,
      remainingUnits: newRemaining,
    });
  }

  async refundUnits(id: AuthorizationId, units: number): Promise<Authorization | null> {
    const auth = await this.getAuthorization(id);
    if (!auth) return null;

    const newUsed = Math.max(0, auth.usedUnits - units);
    const newRemaining = auth.totalUnits - newUsed;

    return this.updateAuthorization(id, {
      usedUnits: newUsed,
      remainingUnits: newRemaining,
    });
  }

  async getUnitsRemaining(id: AuthorizationId): Promise<number | null> {
    const auth = await this.getAuthorization(id);
    return auth?.remainingUnits ?? null;
  }

  async updateStatus(
    id: AuthorizationId,
    status: AuthorizationStatus
  ): Promise<Authorization | null> {
    return this.updateAuthorization(id, { status });
  }

  async requestRenewal(id: AuthorizationId): Promise<Authorization | null> {
    return this.updateAuthorization(id, {
      renewalRequested: true,
      renewalRequestDate: Date.now(),
    });
  }

  async addAlert(
    authorizationId: AuthorizationId,
    alert: Omit<AuthorizationAlert, 'id'>
  ): Promise<Authorization | null> {
    const auth = await this.getAuthorization(authorizationId);
    if (!auth) return null;

    const newAlert: AuthorizationAlert = {
      ...alert,
      id: crypto.randomUUID(),
    };

    const alerts = [...auth.alerts, newAlert];
    return this.updateAuthorization(authorizationId, { alerts });
  }

  async acknowledgeAlert(
    authorizationId: AuthorizationId,
    alertId: string,
    acknowledgedBy: string
  ): Promise<Authorization | null> {
    const auth = await this.getAuthorization(authorizationId);
    if (!auth) return null;

    const now = Date.now();
    const alerts = auth.alerts.map((a) =>
      a.id === alertId ? { ...a, acknowledgedAt: now, acknowledgedBy } : a
    );

    return this.updateAuthorization(authorizationId, { alerts });
  }

  async getUnacknowledgedAlerts(
    userId: string
  ): Promise<Array<{ authorization: Authorization; alert: AuthorizationAlert }>> {
    const result = await this.db.query<AuthorizationRow>(
      `SELECT * FROM health_authorizations
       WHERE user_id = ? AND status IN ('approved', 'expiring-soon')`,
      [userId]
    );

    const unacknowledged: Array<{ authorization: Authorization; alert: AuthorizationAlert }> = [];

    for (const row of result.rows) {
      const auth = this.mapRow(row);
      for (const alert of auth.alerts) {
        if (!alert.acknowledgedAt) {
          unacknowledged.push({ authorization: auth, alert });
        }
      }
    }

    return unacknowledged.sort((a, b) => b.alert.createdAt - a.alert.createdAt);
  }

  async getAuthorizationsByPatient(userId: string, patientId: PatientId): Promise<Authorization[]> {
    return this.listAuthorizations(userId, { patientId });
  }

  async getActiveAuthorizations(userId: string, patientId?: PatientId): Promise<Authorization[]> {
    const now = Date.now();
    const result = await this.db.query<AuthorizationRow>(
      `SELECT * FROM health_authorizations
       WHERE user_id = ?
       ${patientId ? 'AND patient_id = ?' : ''}
       AND status IN ('approved', 'expiring-soon')
       AND start_date <= ? AND end_date >= ?
       AND remaining_units > 0
       ORDER BY end_date ASC`,
      patientId ? [userId, patientId, now, now] : [userId, now, now]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async getExpiringAuthorizations(userId: string, withinDays: number): Promise<Authorization[]> {
    const now = Date.now();
    const futureDate = now + withinDays * 24 * 60 * 60 * 1000;

    const result = await this.db.query<AuthorizationRow>(
      `SELECT * FROM health_authorizations
       WHERE user_id = ? AND status IN ('approved', 'expiring-soon')
       AND end_date >= ? AND end_date <= ?
       ORDER BY end_date ASC`,
      [userId, now, futureDate]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async getLowUnitAuthorizations(userId: string, thresholdPercent: number): Promise<Authorization[]> {
    const result = await this.db.query<AuthorizationRow>(
      `SELECT * FROM health_authorizations
       WHERE user_id = ? AND status IN ('approved', 'expiring-soon')
       AND (remaining_units * 1.0 / total_units) <= ?
       ORDER BY remaining_units ASC`,
      [userId, thresholdPercent]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async getAuthorizationForService(
    userId: string,
    patientId: PatientId,
    serviceCode: string
  ): Promise<Authorization | null> {
    const now = Date.now();
    const result = await this.db.query<AuthorizationRow>(
      `SELECT * FROM health_authorizations
       WHERE user_id = ? AND patient_id = ? AND service_code = ?
       AND status IN ('approved', 'expiring-soon')
       AND start_date <= ? AND end_date >= ?
       AND remaining_units > 0
       ORDER BY end_date ASC LIMIT 1`,
      [userId, patientId, serviceCode, now, now]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async updateExpiredAuthorizations(userId: string): Promise<number> {
    const now = Date.now();
    const result = await this.db.query(
      `UPDATE health_authorizations
       SET status = 'expired', updated_at = ?
       WHERE user_id = ? AND status IN ('approved', 'expiring-soon') AND end_date < ?`,
      [now, userId, now]
    );

    return result.rowCount ?? 0;
  }

  private buildQuery(
    userId: string,
    options: AuthorizationQueryOptions
  ): { conditions: string[]; values: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const values: unknown[] = [userId];

    if (options.patientId) {
      conditions.push('patient_id = ?');
      values.push(options.patientId);
    }
    if (options.payerId) {
      conditions.push('payer_id = ?');
      values.push(options.payerId);
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
    if (options.serviceCode) {
      conditions.push('service_code = ?');
      values.push(options.serviceCode);
    }
    if (options.expiringWithinDays) {
      const now = Date.now();
      const futureDate = now + options.expiringWithinDays * 24 * 60 * 60 * 1000;
      conditions.push('end_date >= ? AND end_date <= ?');
      values.push(now, futureDate);
    }
    if (options.lowUnitsThreshold !== undefined) {
      conditions.push('(remaining_units * 1.0 / total_units) <= ?');
      values.push(options.lowUnitsThreshold);
    }

    return { conditions, values };
  }

  private mapOrderBy(orderBy: string): string {
    switch (orderBy) {
      case 'endDate':
        return 'end_date';
      case 'createdAt':
        return 'created_at';
      case 'remainingUnits':
        return 'remaining_units';
      default:
        return 'end_date';
    }
  }

  private mapRow(row: AuthorizationRow): Authorization {
    return {
      id: row.id,
      userId: row.user_id,
      patientId: row.patient_id,
      payerId: row.payer_id,
      payerName: row.payer_name,
      authorizationNumber: row.authorization_number,
      serviceCode: row.service_code,
      serviceDescription: row.service_description,
      totalUnits: row.total_units,
      usedUnits: row.used_units,
      remainingUnits: row.remaining_units,
      unitType: row.unit_type as Authorization['unitType'],
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status as AuthorizationStatus,
      frequencyLimit: row.frequency_limit ? JSON.parse(row.frequency_limit) : undefined,
      renewalRequested: row.renewal_requested === 1,
      renewalRequestDate: row.renewal_request_date ?? undefined,
      alerts: JSON.parse(row.alerts),
      notes: row.notes ?? undefined,
      documents: row.documents ? JSON.parse(row.documents) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryAuthorizationStore implements AuthorizationStore {
  private authorizations = new Map<string, Authorization>();

  async initialize(): Promise<void> {}

  async createAuthorization(
    authorization: Omit<Authorization, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Authorization> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const newAuth: Authorization = { ...authorization, id, createdAt: now, updatedAt: now };
    this.authorizations.set(id, newAuth);
    return newAuth;
  }

  async getAuthorization(id: AuthorizationId): Promise<Authorization | null> {
    return this.authorizations.get(id) ?? null;
  }

  async getAuthorizationByNumber(userId: string, authNumber: string): Promise<Authorization | null> {
    for (const auth of this.authorizations.values()) {
      if (auth.userId === userId && auth.authorizationNumber === authNumber) {
        return auth;
      }
    }
    return null;
  }

  async updateAuthorization(
    id: AuthorizationId,
    updates: Partial<Authorization>
  ): Promise<Authorization | null> {
    const existing = this.authorizations.get(id);
    if (!existing) return null;

    const updated: Authorization = { ...existing, ...updates, id, updatedAt: Date.now() };
    this.authorizations.set(id, updated);
    return updated;
  }

  async deleteAuthorization(id: AuthorizationId): Promise<boolean> {
    return this.authorizations.delete(id);
  }

  async listAuthorizations(
    userId: string,
    options: AuthorizationQueryOptions = {}
  ): Promise<Authorization[]> {
    let results = Array.from(this.authorizations.values()).filter((a) => a.userId === userId);

    if (options.patientId) {
      results = results.filter((a) => a.patientId === options.patientId);
    }
    if (options.payerId) {
      results = results.filter((a) => a.payerId === options.payerId);
    }
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      results = results.filter((a) => statuses.includes(a.status));
    }
    if (options.serviceCode) {
      results = results.filter((a) => a.serviceCode === options.serviceCode);
    }
    if (options.expiringWithinDays) {
      const now = Date.now();
      const futureDate = now + options.expiringWithinDays * 24 * 60 * 60 * 1000;
      results = results.filter((a) => a.endDate >= now && a.endDate <= futureDate);
    }
    if (options.lowUnitsThreshold !== undefined) {
      results = results.filter(
        (a) => a.remainingUnits / a.totalUnits <= options.lowUnitsThreshold!
      );
    }

    const orderDir = options.orderDirection === 'desc' ? -1 : 1;
    results.sort((a, b) => {
      switch (options.orderBy) {
        case 'createdAt':
          return (a.createdAt - b.createdAt) * orderDir;
        case 'remainingUnits':
          return (a.remainingUnits - b.remainingUnits) * orderDir;
        default:
          return (a.endDate - b.endDate) * orderDir;
      }
    });

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async countAuthorizations(
    userId: string,
    options: AuthorizationQueryOptions = {}
  ): Promise<number> {
    const results = await this.listAuthorizations(userId, { ...options, limit: Infinity, offset: 0 });
    return results.length;
  }

  async useUnits(id: AuthorizationId, units: number): Promise<Authorization | null> {
    const auth = this.authorizations.get(id);
    if (!auth) return null;

    const newUsed = auth.usedUnits + units;
    const newRemaining = auth.totalUnits - newUsed;

    return this.updateAuthorization(id, { usedUnits: newUsed, remainingUnits: newRemaining });
  }

  async refundUnits(id: AuthorizationId, units: number): Promise<Authorization | null> {
    const auth = this.authorizations.get(id);
    if (!auth) return null;

    const newUsed = Math.max(0, auth.usedUnits - units);
    const newRemaining = auth.totalUnits - newUsed;

    return this.updateAuthorization(id, { usedUnits: newUsed, remainingUnits: newRemaining });
  }

  async getUnitsRemaining(id: AuthorizationId): Promise<number | null> {
    const auth = this.authorizations.get(id);
    return auth?.remainingUnits ?? null;
  }

  async updateStatus(
    id: AuthorizationId,
    status: AuthorizationStatus
  ): Promise<Authorization | null> {
    return this.updateAuthorization(id, { status });
  }

  async requestRenewal(id: AuthorizationId): Promise<Authorization | null> {
    return this.updateAuthorization(id, { renewalRequested: true, renewalRequestDate: Date.now() });
  }

  async addAlert(
    authorizationId: AuthorizationId,
    alert: Omit<AuthorizationAlert, 'id'>
  ): Promise<Authorization | null> {
    const auth = this.authorizations.get(authorizationId);
    if (!auth) return null;

    const newAlert: AuthorizationAlert = { ...alert, id: crypto.randomUUID() };
    return this.updateAuthorization(authorizationId, { alerts: [...auth.alerts, newAlert] });
  }

  async acknowledgeAlert(
    authorizationId: AuthorizationId,
    alertId: string,
    acknowledgedBy: string
  ): Promise<Authorization | null> {
    const auth = this.authorizations.get(authorizationId);
    if (!auth) return null;

    const now = Date.now();
    const alerts = auth.alerts.map((a) =>
      a.id === alertId ? { ...a, acknowledgedAt: now, acknowledgedBy } : a
    );

    return this.updateAuthorization(authorizationId, { alerts });
  }

  async getUnacknowledgedAlerts(
    userId: string
  ): Promise<Array<{ authorization: Authorization; alert: AuthorizationAlert }>> {
    const unacknowledged: Array<{ authorization: Authorization; alert: AuthorizationAlert }> = [];

    for (const auth of this.authorizations.values()) {
      if (auth.userId === userId && ['approved', 'expiring-soon'].includes(auth.status)) {
        for (const alert of auth.alerts) {
          if (!alert.acknowledgedAt) {
            unacknowledged.push({ authorization: auth, alert });
          }
        }
      }
    }

    return unacknowledged.sort((a, b) => b.alert.createdAt - a.alert.createdAt);
  }

  async getAuthorizationsByPatient(userId: string, patientId: PatientId): Promise<Authorization[]> {
    return this.listAuthorizations(userId, { patientId });
  }

  async getActiveAuthorizations(userId: string, patientId?: PatientId): Promise<Authorization[]> {
    const now = Date.now();
    return Array.from(this.authorizations.values())
      .filter(
        (a) =>
          a.userId === userId &&
          (!patientId || a.patientId === patientId) &&
          ['approved', 'expiring-soon'].includes(a.status) &&
          a.startDate <= now &&
          a.endDate >= now &&
          a.remainingUnits > 0
      )
      .sort((a, b) => a.endDate - b.endDate);
  }

  async getExpiringAuthorizations(userId: string, withinDays: number): Promise<Authorization[]> {
    const now = Date.now();
    const futureDate = now + withinDays * 24 * 60 * 60 * 1000;

    return Array.from(this.authorizations.values())
      .filter(
        (a) =>
          a.userId === userId &&
          ['approved', 'expiring-soon'].includes(a.status) &&
          a.endDate >= now &&
          a.endDate <= futureDate
      )
      .sort((a, b) => a.endDate - b.endDate);
  }

  async getLowUnitAuthorizations(userId: string, thresholdPercent: number): Promise<Authorization[]> {
    return Array.from(this.authorizations.values())
      .filter(
        (a) =>
          a.userId === userId &&
          ['approved', 'expiring-soon'].includes(a.status) &&
          a.remainingUnits / a.totalUnits <= thresholdPercent
      )
      .sort((a, b) => a.remainingUnits - b.remainingUnits);
  }

  async getAuthorizationForService(
    userId: string,
    patientId: PatientId,
    serviceCode: string
  ): Promise<Authorization | null> {
    const now = Date.now();
    const auths = Array.from(this.authorizations.values())
      .filter(
        (a) =>
          a.userId === userId &&
          a.patientId === patientId &&
          a.serviceCode === serviceCode &&
          ['approved', 'expiring-soon'].includes(a.status) &&
          a.startDate <= now &&
          a.endDate >= now &&
          a.remainingUnits > 0
      )
      .sort((a, b) => a.endDate - b.endDate);

    return auths[0] ?? null;
  }

  async updateExpiredAuthorizations(userId: string): Promise<number> {
    const now = Date.now();
    let count = 0;

    for (const [id, auth] of this.authorizations) {
      if (
        auth.userId === userId &&
        ['approved', 'expiring-soon'].includes(auth.status) &&
        auth.endDate < now
      ) {
        this.authorizations.set(id, { ...auth, status: 'expired', updatedAt: now });
        count++;
      }
    }

    return count;
  }
}

// =============================================================================
// Row Type
// =============================================================================

interface AuthorizationRow {
  id: string;
  user_id: string;
  patient_id: string;
  payer_id: string;
  payer_name: string;
  authorization_number: string;
  service_code: string;
  service_description: string;
  total_units: number;
  used_units: number;
  remaining_units: number;
  unit_type: string;
  start_date: number;
  end_date: number;
  status: string;
  frequency_limit: string | null;
  renewal_requested: number;
  renewal_request_date: number | null;
  alerts: string;
  notes: string | null;
  documents: string | null;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createAuthorizationStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): AuthorizationStore {
  if (type === 'database') {
    if (!db) {
      throw new Error('Database adapter required for database store');
    }
    return new DatabaseAuthorizationStore(db);
  }
  return new InMemoryAuthorizationStore();
}
