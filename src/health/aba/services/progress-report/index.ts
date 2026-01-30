/**
 * Progress Report Service
 *
 * Unified service for automated progress report generation including:
 * - Data aggregation from session records
 * - Report template management
 * - PDF/HTML generation
 * - Submission and approval workflow
 */

import { EventEmitter } from 'events';
import type { ProgressReportStore } from '../../stores/progress-report-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type { AuthorizationStore } from '../../stores/authorization-store.js';
import type {
  ProgressReport,
  ProgressReportId,
  PatientId,
  SessionData,
  SessionDataId,
  ProgressReportQueryOptions,
  SessionDataQueryOptions,
} from '../../types.js';
import { DataAggregator, type AggregatedData } from './data-aggregator.js';
import { ReportGenerator, type GeneratedReportContent } from './report-generator.js';
import { TemplateManager, type ReportTemplate } from './template-manager.js';
import { HEALTH_EVENTS } from '../../constants.js';

// =============================================================================
// Progress Report Service Options
// =============================================================================

export interface ProgressReportServiceOptions {
  progressReportStore: ProgressReportStore;
  patientStore: PatientStore;
  authorizationStore: AuthorizationStore;
  clinicInfo?: {
    name: string;
    address?: string;
    phone?: string;
    npi?: string;
    logoUrl?: string;
  };
}

// =============================================================================
// Progress Report Service
// =============================================================================

export class ProgressReportService extends EventEmitter {
  private readonly progressReportStore: ProgressReportStore;
  private readonly patientStore: PatientStore;
  private readonly authorizationStore: AuthorizationStore;

  private readonly dataAggregator: DataAggregator;
  private readonly reportGenerator: ReportGenerator;
  private readonly templateManager: TemplateManager;

  constructor(options: ProgressReportServiceOptions) {
    super();

    this.progressReportStore = options.progressReportStore;
    this.patientStore = options.patientStore;
    this.authorizationStore = options.authorizationStore;

    // Initialize sub-services
    this.templateManager = new TemplateManager({
      defaultClinicInfo: options.clinicInfo,
    });

    this.dataAggregator = new DataAggregator({
      progressReportStore: options.progressReportStore,
      patientStore: options.patientStore,
    });

    this.reportGenerator = new ReportGenerator({
      progressReportStore: options.progressReportStore,
      patientStore: options.patientStore,
      authorizationStore: options.authorizationStore,
      dataAggregator: this.dataAggregator,
      templateManager: this.templateManager,
    });

    // Forward events
    this.reportGenerator.on(HEALTH_EVENTS.PROGRESS_REPORT_GENERATED, (data) =>
      this.emit(HEALTH_EVENTS.PROGRESS_REPORT_GENERATED, data)
    );
  }

  // ===========================================================================
  // Report Generation
  // ===========================================================================

  /**
   * Generate a new progress report
   */
  async generateReport(
    userId: string,
    patientId: PatientId,
    periodStart: number,
    periodEnd: number,
    templateId?: string
  ): Promise<ProgressReport> {
    return this.reportGenerator.generateReport(
      userId,
      patientId,
      periodStart,
      periodEnd,
      templateId
    );
  }

  /**
   * Regenerate report content (preserves report record)
   */
  async regenerateContent(reportId: ProgressReportId): Promise<ProgressReport | null> {
    return this.reportGenerator.regenerateContent(reportId);
  }

  /**
   * Preview aggregated data before generating report
   */
  async previewReportData(
    userId: string,
    patientId: PatientId,
    periodStart: number,
    periodEnd: number
  ): Promise<AggregatedData> {
    return this.dataAggregator.aggregateSessionData(
      userId,
      patientId,
      periodStart,
      periodEnd
    );
  }

  // ===========================================================================
  // Report CRUD
  // ===========================================================================

  /**
   * Get report by ID
   */
  async getReport(id: ProgressReportId): Promise<ProgressReport | null> {
    return this.progressReportStore.getReport(id);
  }

  /**
   * Update report
   */
  async updateReport(
    id: ProgressReportId,
    updates: Partial<ProgressReport>
  ): Promise<ProgressReport | null> {
    return this.progressReportStore.updateReport(id, updates);
  }

  /**
   * Delete report
   */
  async deleteReport(id: ProgressReportId): Promise<boolean> {
    return this.progressReportStore.deleteReport(id);
  }

  /**
   * List reports
   */
  async listReports(
    userId: string,
    options?: ProgressReportQueryOptions
  ): Promise<ProgressReport[]> {
    return this.progressReportStore.listReports(userId, options);
  }

  /**
   * Get reports for a patient
   */
  async getPatientReports(userId: string, patientId: PatientId): Promise<ProgressReport[]> {
    return this.progressReportStore.getReportsByPatient(userId, patientId);
  }

  /**
   * Get draft reports
   */
  async getDraftReports(userId: string): Promise<ProgressReport[]> {
    return this.progressReportStore.getDraftReports(userId);
  }

  // ===========================================================================
  // Report Workflow
  // ===========================================================================

  /**
   * Submit report for review
   */
  async submitReport(id: ProgressReportId, submittedBy: string): Promise<ProgressReport | null> {
    const report = await this.progressReportStore.submitReport(id, submittedBy);

    if (report) {
      this.emit(HEALTH_EVENTS.PROGRESS_REPORT_SUBMITTED, {
        reportId: id,
        patientId: report.patientId,
        submittedBy,
        timestamp: Date.now(),
      });
    }

    return report;
  }

  /**
   * Approve report
   */
  async approveReport(id: ProgressReportId, approvedBy: string): Promise<ProgressReport | null> {
    const report = await this.progressReportStore.approveReport(id, approvedBy);

    if (report) {
      this.emit(HEALTH_EVENTS.PROGRESS_REPORT_APPROVED, {
        reportId: id,
        patientId: report.patientId,
        approvedBy,
        timestamp: Date.now(),
      });
    }

    return report;
  }

  /**
   * Reject report
   */
  async rejectReport(
    id: ProgressReportId,
    rejectedBy: string,
    reason: string
  ): Promise<ProgressReport | null> {
    return this.progressReportStore.rejectReport(id, rejectedBy, reason);
  }

  // ===========================================================================
  // Session Data
  // ===========================================================================

  /**
   * Record session data
   */
  async recordSessionData(
    data: Omit<SessionData, 'id' | 'createdAt'>
  ): Promise<SessionData> {
    const sessionData = await this.progressReportStore.createSessionData(data);

    this.emit(HEALTH_EVENTS.SESSION_DATA_RECORDED, {
      sessionDataId: sessionData.id,
      patientId: sessionData.patientId,
      timestamp: Date.now(),
    });

    return sessionData;
  }

  /**
   * Get session data by ID
   */
  async getSessionData(id: SessionDataId): Promise<SessionData | null> {
    return this.progressReportStore.getSessionData(id);
  }

  /**
   * Update session data
   */
  async updateSessionData(
    id: SessionDataId,
    updates: Partial<SessionData>
  ): Promise<SessionData | null> {
    return this.progressReportStore.updateSessionData(id, updates);
  }

  /**
   * List session data
   */
  async listSessionData(
    userId: string,
    options?: SessionDataQueryOptions
  ): Promise<SessionData[]> {
    return this.progressReportStore.listSessionData(userId, options);
  }

  /**
   * Get session data for a patient
   */
  async getPatientSessionData(
    userId: string,
    patientId: PatientId,
    startDate?: number,
    endDate?: number
  ): Promise<SessionData[]> {
    return this.progressReportStore.getSessionDataByPatient(
      userId,
      patientId,
      startDate,
      endDate
    );
  }

  /**
   * Get unreported session data
   */
  async getUnreportedSessionData(userId: string, patientId: PatientId): Promise<SessionData[]> {
    return this.progressReportStore.getUnreportedSessionData(userId, patientId);
  }

  /**
   * Get goal progress history
   */
  async getGoalProgress(
    userId: string,
    patientId: PatientId,
    goalId: string
  ): Promise<Array<{ date: number; value: number }>> {
    return this.progressReportStore.getGoalProgress(userId, patientId, goalId);
  }

  // ===========================================================================
  // Template Management
  // ===========================================================================

  /**
   * Create a template
   */
  async createTemplate(
    userId: string,
    template: Omit<ReportTemplate, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): Promise<ReportTemplate> {
    return this.templateManager.createTemplate(userId, template);
  }

  /**
   * Get template by ID
   */
  async getTemplate(id: string): Promise<ReportTemplate | null> {
    return this.templateManager.getTemplate(id);
  }

  /**
   * Update template
   */
  async updateTemplate(
    id: string,
    updates: Partial<ReportTemplate>
  ): Promise<ReportTemplate | null> {
    return this.templateManager.updateTemplate(id, updates);
  }

  /**
   * Delete template
   */
  async deleteTemplate(id: string): Promise<boolean> {
    return this.templateManager.deleteTemplate(id);
  }

  /**
   * List templates
   */
  async listTemplates(userId: string): Promise<ReportTemplate[]> {
    return this.templateManager.listTemplates(userId);
  }

  /**
   * Get default template
   */
  async getDefaultTemplate(userId: string): Promise<ReportTemplate> {
    return this.templateManager.getDefaultTemplate(userId);
  }

  /**
   * Validate template
   */
  validateTemplate(template: ReportTemplate): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    return this.templateManager.validateTemplate(template);
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Get patients needing progress reports
   */
  async getPatientsNeedingReports(
    userId: string,
    reportingIntervalDays = 90
  ): Promise<Array<{ patientId: PatientId; lastReportDate?: number; daysSinceReport: number }>> {
    // Get all patients with active authorizations
    const authorizations = await this.authorizationStore.getActiveAuthorizations(userId);
    const patientIds = [...new Set(authorizations.map((a) => a.patientId))];

    const results: Array<{
      patientId: PatientId;
      lastReportDate?: number;
      daysSinceReport: number;
    }> = [];

    for (const patientId of patientIds) {
      const reports = await this.progressReportStore.getReportsByPatient(userId, patientId);
      const lastReport = reports[0]; // Reports sorted by date desc

      const lastReportDate = lastReport?.periodEnd;
      const daysSinceReport = lastReportDate
        ? Math.floor((Date.now() - lastReportDate) / (24 * 60 * 60 * 1000))
        : Infinity;

      if (daysSinceReport >= reportingIntervalDays) {
        results.push({
          patientId,
          lastReportDate,
          daysSinceReport: daysSinceReport === Infinity ? reportingIntervalDays : daysSinceReport,
        });
      }
    }

    return results.sort((a, b) => b.daysSinceReport - a.daysSinceReport);
  }

  /**
   * Get report statistics
   */
  async getReportStatistics(userId: string): Promise<{
    totalReports: number;
    draftReports: number;
    submittedReports: number;
    approvedReports: number;
    reportsByMonth: Array<{ month: string; count: number }>;
  }> {
    const reports = await this.progressReportStore.listReports(userId);

    const draftReports = reports.filter((r) => r.status === 'draft').length;
    const submittedReports = reports.filter((r) => r.status === 'submitted').length;
    const approvedReports = reports.filter((r) => r.status === 'approved').length;

    // Group by month
    const monthCounts = new Map<string, number>();
    for (const report of reports) {
      const date = new Date(report.createdAt);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
    }

    const reportsByMonth = Array.from(monthCounts.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalReports: reports.length,
      draftReports,
      submittedReports,
      approvedReports,
      reportsByMonth,
    };
  }
}

// Re-export sub-components
export { DataAggregator, type AggregatedData } from './data-aggregator.js';
export { ReportGenerator, type GeneratedReportContent } from './report-generator.js';
export {
  TemplateManager,
  type ReportTemplate,
  type TemplateSection,
  DEFAULT_SECTIONS,
  DEFAULT_STYLING,
} from './template-manager.js';
