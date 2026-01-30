/**
 * Progress Report Store
 *
 * Storage for progress reports and session data used in report generation.
 */

import type {
  ProgressReport,
  ProgressReportId,
  PatientId,
  SessionData,
  SessionDataId,
  ProgressReportQueryOptions,
  SessionDataQueryOptions,
  BehaviorGoal,
  KeyValueStoreAdapter,
} from '../types.js';

// =============================================================================
// Progress Report Store Interface
// =============================================================================

export interface ProgressReportStore {
  // Progress Report Operations
  createReport(
    report: Omit<ProgressReport, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ProgressReport>;
  getReport(id: ProgressReportId): Promise<ProgressReport | null>;
  updateReport(id: ProgressReportId, updates: Partial<ProgressReport>): Promise<ProgressReport | null>;
  deleteReport(id: ProgressReportId): Promise<boolean>;
  listReports(userId: string, options?: ProgressReportQueryOptions): Promise<ProgressReport[]>;

  // Report queries
  getReportsByPatient(userId: string, patientId: PatientId): Promise<ProgressReport[]>;
  getReportsByDateRange(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<ProgressReport[]>;
  getDraftReports(userId: string): Promise<ProgressReport[]>;
  getSubmittedReports(userId: string): Promise<ProgressReport[]>;

  // Report status
  submitReport(id: ProgressReportId, submittedBy: string): Promise<ProgressReport | null>;
  approveReport(id: ProgressReportId, approvedBy: string): Promise<ProgressReport | null>;
  rejectReport(id: ProgressReportId, rejectedBy: string, reason: string): Promise<ProgressReport | null>;

  // Session Data Operations
  createSessionData(data: Omit<SessionData, 'id' | 'createdAt'>): Promise<SessionData>;
  getSessionData(id: SessionDataId): Promise<SessionData | null>;
  updateSessionData(id: SessionDataId, updates: Partial<SessionData>): Promise<SessionData | null>;
  deleteSessionData(id: SessionDataId): Promise<boolean>;
  listSessionData(userId: string, options?: SessionDataQueryOptions): Promise<SessionData[]>;

  // Session data queries
  getSessionDataByPatient(
    userId: string,
    patientId: PatientId,
    startDate?: number,
    endDate?: number
  ): Promise<SessionData[]>;
  getSessionDataForReport(
    userId: string,
    patientId: PatientId,
    startDate: number,
    endDate: number
  ): Promise<SessionData[]>;
  getUnreportedSessionData(userId: string, patientId: PatientId): Promise<SessionData[]>;

  // Goal tracking
  getGoalProgress(
    userId: string,
    patientId: PatientId,
    goalId: string
  ): Promise<Array<{ date: number; value: number }>>;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseProgressReportStore implements ProgressReportStore {
  constructor(private readonly db: KeyValueStoreAdapter) {}

  // Progress Report Operations

  async createReport(
    report: Omit<ProgressReport, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ProgressReport> {
    const now = Date.now();
    const newReport: ProgressReport = {
      ...report,
      id: crypto.randomUUID() as ProgressReportId,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.set(`progress-report:${newReport.id}`, newReport);
    await this.addToIndex('progress-reports', report.userId, newReport.id);
    await this.addToIndex(`progress-reports:patient:${report.patientId}`, report.userId, newReport.id);

    return newReport;
  }

  async getReport(id: ProgressReportId): Promise<ProgressReport | null> {
    return this.db.get<ProgressReport>(`progress-report:${id}`);
  }

  async updateReport(
    id: ProgressReportId,
    updates: Partial<ProgressReport>
  ): Promise<ProgressReport | null> {
    const existing = await this.getReport(id);
    if (!existing) return null;

    const updated: ProgressReport = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    await this.db.set(`progress-report:${id}`, updated);
    return updated;
  }

  async deleteReport(id: ProgressReportId): Promise<boolean> {
    const report = await this.getReport(id);
    if (!report) return false;

    await this.db.delete(`progress-report:${id}`);
    await this.removeFromIndex('progress-reports', report.userId, id);
    await this.removeFromIndex(`progress-reports:patient:${report.patientId}`, report.userId, id);

    return true;
  }

  async listReports(
    userId: string,
    options?: ProgressReportQueryOptions
  ): Promise<ProgressReport[]> {
    const reportIds = await this.getIndex('progress-reports', userId);
    const reports: ProgressReport[] = [];

    for (const id of reportIds) {
      const report = await this.getReport(id as ProgressReportId);
      if (report && this.matchesReportQuery(report, options)) {
        reports.push(report);
      }
    }

    return this.sortReports(reports, options?.orderBy, options?.orderDirection);
  }

  async getReportsByPatient(userId: string, patientId: PatientId): Promise<ProgressReport[]> {
    const reportIds = await this.getIndex(`progress-reports:patient:${patientId}`, userId);
    const reports: ProgressReport[] = [];

    for (const id of reportIds) {
      const report = await this.getReport(id as ProgressReportId);
      if (report) {
        reports.push(report);
      }
    }

    return reports.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getReportsByDateRange(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<ProgressReport[]> {
    return this.listReports(userId, { startDate, endDate });
  }

  async getDraftReports(userId: string): Promise<ProgressReport[]> {
    return this.listReports(userId, { status: 'draft' });
  }

  async getSubmittedReports(userId: string): Promise<ProgressReport[]> {
    return this.listReports(userId, { status: 'submitted' });
  }

  async submitReport(id: ProgressReportId, submittedBy: string): Promise<ProgressReport | null> {
    return this.updateReport(id, {
      status: 'submitted',
      submittedAt: Date.now(),
      submittedBy,
    });
  }

  async approveReport(id: ProgressReportId, approvedBy: string): Promise<ProgressReport | null> {
    return this.updateReport(id, {
      status: 'approved',
      approvedAt: Date.now(),
      approvedBy,
    });
  }

  async rejectReport(
    id: ProgressReportId,
    rejectedBy: string,
    reason: string
  ): Promise<ProgressReport | null> {
    return this.updateReport(id, {
      status: 'rejected',
      rejectedAt: Date.now(),
      rejectedBy,
      rejectionReason: reason,
    });
  }

  // Session Data Operations

  async createSessionData(data: Omit<SessionData, 'id' | 'createdAt'>): Promise<SessionData> {
    const newData: SessionData = {
      ...data,
      id: crypto.randomUUID() as SessionDataId,
      createdAt: Date.now(),
    };

    await this.db.set(`session-data:${newData.id}`, newData);
    await this.addToIndex('session-data', data.userId, newData.id);
    await this.addToIndex(`session-data:patient:${data.patientId}`, data.userId, newData.id);

    return newData;
  }

  async getSessionData(id: SessionDataId): Promise<SessionData | null> {
    return this.db.get<SessionData>(`session-data:${id}`);
  }

  async updateSessionData(
    id: SessionDataId,
    updates: Partial<SessionData>
  ): Promise<SessionData | null> {
    const existing = await this.getSessionData(id);
    if (!existing) return null;

    const updated: SessionData = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
    };

    await this.db.set(`session-data:${id}`, updated);
    return updated;
  }

  async deleteSessionData(id: SessionDataId): Promise<boolean> {
    const data = await this.getSessionData(id);
    if (!data) return false;

    await this.db.delete(`session-data:${id}`);
    await this.removeFromIndex('session-data', data.userId, id);
    await this.removeFromIndex(`session-data:patient:${data.patientId}`, data.userId, id);

    return true;
  }

  async listSessionData(
    userId: string,
    options?: SessionDataQueryOptions
  ): Promise<SessionData[]> {
    const dataIds = await this.getIndex('session-data', userId);
    const sessions: SessionData[] = [];

    for (const id of dataIds) {
      const data = await this.getSessionData(id as SessionDataId);
      if (data && this.matchesSessionQuery(data, options)) {
        sessions.push(data);
      }
    }

    return sessions.sort((a, b) => b.sessionDate - a.sessionDate);
  }

  async getSessionDataByPatient(
    userId: string,
    patientId: PatientId,
    startDate?: number,
    endDate?: number
  ): Promise<SessionData[]> {
    const dataIds = await this.getIndex(`session-data:patient:${patientId}`, userId);
    const sessions: SessionData[] = [];

    for (const id of dataIds) {
      const data = await this.getSessionData(id as SessionDataId);
      if (data) {
        if (startDate && data.sessionDate < startDate) continue;
        if (endDate && data.sessionDate > endDate) continue;
        sessions.push(data);
      }
    }

    return sessions.sort((a, b) => b.sessionDate - a.sessionDate);
  }

  async getSessionDataForReport(
    userId: string,
    patientId: PatientId,
    startDate: number,
    endDate: number
  ): Promise<SessionData[]> {
    return this.getSessionDataByPatient(userId, patientId, startDate, endDate);
  }

  async getUnreportedSessionData(userId: string, patientId: PatientId): Promise<SessionData[]> {
    const sessions = await this.getSessionDataByPatient(userId, patientId);
    return sessions.filter((s) => !s.includedInReportId);
  }

  async getGoalProgress(
    userId: string,
    patientId: PatientId,
    goalId: string
  ): Promise<Array<{ date: number; value: number }>> {
    const sessions = await this.getSessionDataByPatient(userId, patientId);
    const progress: Array<{ date: number; value: number }> = [];

    for (const session of sessions) {
      const goalData = session.goalsWorked?.find((g) => g.goalId === goalId);
      if (goalData) {
        progress.push({
          date: session.sessionDate,
          value: (goalData.correct ?? 0) / Math.max(1, goalData.trials ?? 1),
        });
      }
    }

    return progress.sort((a, b) => a.date - b.date);
  }

  // Helper methods

  private matchesReportQuery(
    report: ProgressReport,
    options?: ProgressReportQueryOptions
  ): boolean {
    if (!options) return true;

    if (options.patientId && report.patientId !== options.patientId) return false;
    if (options.status && report.status !== options.status) return false;
    if (options.startDate && report.periodEnd < options.startDate) return false;
    if (options.endDate && report.periodStart > options.endDate) return false;

    return true;
  }

  private matchesSessionQuery(data: SessionData, options?: SessionDataQueryOptions): boolean {
    if (!options) return true;

    if (options.patientId && data.patientId !== options.patientId) return false;
    if (options.rbtId && data.rbtId !== options.rbtId) return false;
    if (options.startDate && data.sessionDate < options.startDate) return false;
    if (options.endDate && data.sessionDate > options.endDate) return false;
    if (options.serviceCode && data.serviceCode !== options.serviceCode) return false;

    return true;
  }

  private sortReports(
    reports: ProgressReport[],
    orderBy?: ProgressReportQueryOptions['orderBy'],
    orderDirection?: 'asc' | 'desc'
  ): ProgressReport[] {
    const order = orderDirection === 'asc' ? 1 : -1;

    return reports.sort((a, b) => {
      switch (orderBy) {
        case 'periodStart':
          return (a.periodStart - b.periodStart) * order;
        case 'updatedAt':
          return (a.updatedAt - b.updatedAt) * order;
        case 'createdAt':
        default:
          return (a.createdAt - b.createdAt) * order;
      }
    });
  }

  private async getIndex(name: string, userId: string): Promise<string[]> {
    const index = await this.db.get<string[]>(`index:${name}:${userId}`);
    return index ?? [];
  }

  private async addToIndex(name: string, userId: string, id: string): Promise<void> {
    const index = await this.getIndex(name, userId);
    if (!index.includes(id)) {
      index.push(id);
      await this.db.set(`index:${name}:${userId}`, index);
    }
  }

  private async removeFromIndex(name: string, userId: string, id: string): Promise<void> {
    const index = await this.getIndex(name, userId);
    const newIndex = index.filter((i) => i !== id);
    await this.db.set(`index:${name}:${userId}`, newIndex);
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryProgressReportStore implements ProgressReportStore {
  private reports = new Map<string, ProgressReport>();
  private sessionData = new Map<string, SessionData>();

  async createReport(
    report: Omit<ProgressReport, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ProgressReport> {
    const now = Date.now();
    const newReport: ProgressReport = {
      ...report,
      id: crypto.randomUUID() as ProgressReportId,
      createdAt: now,
      updatedAt: now,
    };

    this.reports.set(newReport.id, newReport);
    return newReport;
  }

  async getReport(id: ProgressReportId): Promise<ProgressReport | null> {
    return this.reports.get(id) ?? null;
  }

  async updateReport(
    id: ProgressReportId,
    updates: Partial<ProgressReport>
  ): Promise<ProgressReport | null> {
    const existing = this.reports.get(id);
    if (!existing) return null;

    const updated: ProgressReport = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    this.reports.set(id, updated);
    return updated;
  }

  async deleteReport(id: ProgressReportId): Promise<boolean> {
    return this.reports.delete(id);
  }

  async listReports(
    userId: string,
    options?: ProgressReportQueryOptions
  ): Promise<ProgressReport[]> {
    const reports = Array.from(this.reports.values()).filter(
      (r) => r.userId === userId
    );

    return reports.filter((r) => {
      if (options?.patientId && r.patientId !== options.patientId) return false;
      if (options?.status && r.status !== options.status) return false;
      if (options?.startDate && r.periodEnd < options.startDate) return false;
      if (options?.endDate && r.periodStart > options.endDate) return false;
      return true;
    });
  }

  async getReportsByPatient(userId: string, patientId: PatientId): Promise<ProgressReport[]> {
    return this.listReports(userId, { patientId });
  }

  async getReportsByDateRange(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<ProgressReport[]> {
    return this.listReports(userId, { startDate, endDate });
  }

  async getDraftReports(userId: string): Promise<ProgressReport[]> {
    return this.listReports(userId, { status: 'draft' });
  }

  async getSubmittedReports(userId: string): Promise<ProgressReport[]> {
    return this.listReports(userId, { status: 'submitted' });
  }

  async submitReport(id: ProgressReportId, submittedBy: string): Promise<ProgressReport | null> {
    return this.updateReport(id, {
      status: 'submitted',
      submittedAt: Date.now(),
      submittedBy,
    });
  }

  async approveReport(id: ProgressReportId, approvedBy: string): Promise<ProgressReport | null> {
    return this.updateReport(id, {
      status: 'approved',
      approvedAt: Date.now(),
      approvedBy,
    });
  }

  async rejectReport(
    id: ProgressReportId,
    rejectedBy: string,
    reason: string
  ): Promise<ProgressReport | null> {
    return this.updateReport(id, {
      status: 'rejected',
      rejectedAt: Date.now(),
      rejectedBy,
      rejectionReason: reason,
    });
  }

  async createSessionData(data: Omit<SessionData, 'id' | 'createdAt'>): Promise<SessionData> {
    const newData: SessionData = {
      ...data,
      id: crypto.randomUUID() as SessionDataId,
      createdAt: Date.now(),
    };

    this.sessionData.set(newData.id, newData);
    return newData;
  }

  async getSessionData(id: SessionDataId): Promise<SessionData | null> {
    return this.sessionData.get(id) ?? null;
  }

  async updateSessionData(
    id: SessionDataId,
    updates: Partial<SessionData>
  ): Promise<SessionData | null> {
    const existing = this.sessionData.get(id);
    if (!existing) return null;

    const updated: SessionData = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
    };

    this.sessionData.set(id, updated);
    return updated;
  }

  async deleteSessionData(id: SessionDataId): Promise<boolean> {
    return this.sessionData.delete(id);
  }

  async listSessionData(
    userId: string,
    options?: SessionDataQueryOptions
  ): Promise<SessionData[]> {
    const data = Array.from(this.sessionData.values()).filter(
      (d) => d.userId === userId
    );

    return data.filter((d) => {
      if (options?.patientId && d.patientId !== options.patientId) return false;
      if (options?.rbtId && d.rbtId !== options.rbtId) return false;
      if (options?.startDate && d.sessionDate < options.startDate) return false;
      if (options?.endDate && d.sessionDate > options.endDate) return false;
      if (options?.serviceCode && d.serviceCode !== options.serviceCode) return false;
      return true;
    });
  }

  async getSessionDataByPatient(
    userId: string,
    patientId: PatientId,
    startDate?: number,
    endDate?: number
  ): Promise<SessionData[]> {
    return this.listSessionData(userId, { patientId, startDate, endDate });
  }

  async getSessionDataForReport(
    userId: string,
    patientId: PatientId,
    startDate: number,
    endDate: number
  ): Promise<SessionData[]> {
    return this.getSessionDataByPatient(userId, patientId, startDate, endDate);
  }

  async getUnreportedSessionData(userId: string, patientId: PatientId): Promise<SessionData[]> {
    const sessions = await this.getSessionDataByPatient(userId, patientId);
    return sessions.filter((s) => !s.includedInReportId);
  }

  async getGoalProgress(
    userId: string,
    patientId: PatientId,
    goalId: string
  ): Promise<Array<{ date: number; value: number }>> {
    const sessions = await this.getSessionDataByPatient(userId, patientId);
    const progress: Array<{ date: number; value: number }> = [];

    for (const session of sessions) {
      const goalData = session.goalsWorked?.find((g) => g.goalId === goalId);
      if (goalData) {
        progress.push({
          date: session.sessionDate,
          value: (goalData.correct ?? 0) / Math.max(1, goalData.trials ?? 1),
        });
      }
    }

    return progress.sort((a, b) => a.date - b.date);
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createProgressReportStore(
  type: 'memory' | 'database',
  db?: KeyValueStoreAdapter
): ProgressReportStore {
  if (type === 'database') {
    if (!db) throw new Error('Key-value store adapter required for database store');
    return new DatabaseProgressReportStore(db);
  }
  return new InMemoryProgressReportStore();
}
