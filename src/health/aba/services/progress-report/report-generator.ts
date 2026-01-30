/**
 * Report Generator
 *
 * Generates progress reports from aggregated data using templates.
 * Supports multiple output formats (PDF, HTML, JSON).
 */

import { EventEmitter } from 'events';
import type { ProgressReportStore } from '../../stores/progress-report-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type { AuthorizationStore } from '../../stores/authorization-store.js';
import type {
  ProgressReport,
  ProgressReportId,
  PatientId,
  Patient,
  Authorization,
} from '../../types.js';
import type { DataAggregator, AggregatedData } from './data-aggregator.js';
import type { TemplateManager, ReportTemplate, TemplateSection } from './template-manager.js';
import { HEALTH_EVENTS } from '../../constants.js';

// =============================================================================
// Report Generator Options
// =============================================================================

export interface ReportGeneratorOptions {
  progressReportStore: ProgressReportStore;
  patientStore: PatientStore;
  authorizationStore: AuthorizationStore;
  dataAggregator: DataAggregator;
  templateManager: TemplateManager;
}

// =============================================================================
// Generated Report Content
// =============================================================================

export interface GeneratedReportContent {
  html: string;
  text: string;
  sections: RenderedSection[];
  metadata: ReportMetadata;
}

export interface RenderedSection {
  id: string;
  name: string;
  type: string;
  content: string;
  data?: unknown;
}

export interface ReportMetadata {
  generatedAt: number;
  templateId: string;
  templateName: string;
  patientId: PatientId;
  patientName: string;
  periodStart: number;
  periodEnd: number;
  totalPages?: number;
}

// =============================================================================
// Report Generator
// =============================================================================

export class ReportGenerator extends EventEmitter {
  private readonly progressReportStore: ProgressReportStore;
  private readonly patientStore: PatientStore;
  private readonly authorizationStore: AuthorizationStore;
  private readonly dataAggregator: DataAggregator;
  private readonly templateManager: TemplateManager;

  constructor(options: ReportGeneratorOptions) {
    super();
    this.progressReportStore = options.progressReportStore;
    this.patientStore = options.patientStore;
    this.authorizationStore = options.authorizationStore;
    this.dataAggregator = options.dataAggregator;
    this.templateManager = options.templateManager;
  }

  /**
   * Generate a progress report
   */
  async generateReport(
    userId: string,
    patientId: PatientId,
    periodStart: number,
    periodEnd: number,
    templateId?: string
  ): Promise<ProgressReport> {
    // Get patient
    const patient = await this.patientStore.getPatient(patientId);
    if (!patient) {
      throw new Error(`Patient not found: ${patientId}`);
    }

    // Get template
    const template = templateId
      ? await this.templateManager.getTemplate(templateId)
      : await this.templateManager.getDefaultTemplate(userId);

    if (!template) {
      throw new Error('Template not found');
    }

    // Aggregate data
    const aggregatedData = await this.dataAggregator.aggregateSessionData(
      userId,
      patientId,
      periodStart,
      periodEnd
    );

    // Get authorization
    const authorizations = await this.authorizationStore.getActiveAuthorizations(
      userId,
      patientId
    );
    const authorization = authorizations[0];

    // Generate content
    const content = await this.generateContent(
      patient,
      aggregatedData,
      authorization,
      template
    );

    // Calculate patient age
    const birthDate = new Date(patient.dateOfBirth);
    const today = new Date();
    const ageYears = today.getFullYear() - birthDate.getFullYear();
    const ageMonths = today.getMonth() - birthDate.getMonth();
    const age = ageMonths < 0 || (ageMonths === 0 && today.getDate() < birthDate.getDate())
      ? `${ageYears - 1} years`
      : `${ageYears} years`;

    // Create report record
    const report = await this.progressReportStore.createReport({
      userId,
      patientId,
      type: 'progress',
      periodStart,
      periodEnd,
      templateId: template.id,
      title: `Progress Report - ${patient.firstName} ${patient.lastName}`,
      authorId: userId,
      authorName: 'System Generated',
      authorCredentials: '',
      status: 'draft',
      demographics: {
        name: `${patient.firstName} ${patient.lastName}`,
        dob: patient.dateOfBirth,
        age,
        diagnosis: patient.diagnosisCodes || [],
      },
      goals: aggregatedData.goalProgress.map((gp) => ({
        id: gp.goalId,
        name: gp.goalName,
        domain: gp.domain,
        type: 'acquisition',
        baselineValue: gp.baselineValue,
        targetValue: gp.targetValue,
        currentValue: gp.currentValue,
        status: (gp.status === 'mastered' ? 'mastered' : 'active') as 'active' | 'mastered',
      })),
      sessionSummary: {
        totalSessions: aggregatedData.totalSessions,
        totalHours: aggregatedData.totalHours,
        attendanceRate: aggregatedData.attendanceSummary.attendanceRate,
        sessionTypes: aggregatedData.sessionTypes,
      },
      aggregatedData: {
        goalProgress: aggregatedData.goalProgress.map((gp) => ({
          goalId: gp.goalId,
          goalName: gp.goalName,
          startValue: gp.baselineValue,
          endValue: gp.currentValue,
          changePercent: gp.progressPercent,
          trend: gp.trend as 'improving' | 'stable' | 'declining',
        })),
      },
      clinicalImpressions: '',
      recommendations: this.generateRecommendations(aggregatedData, patient),
      generatedAt: Date.now(),
      content: content.html,
      metadata: content.metadata as unknown as Record<string, unknown>,
    });

    // Mark session data as included in this report
    const sessions = await this.progressReportStore.getSessionDataForReport(
      userId,
      patientId,
      periodStart,
      periodEnd
    );

    for (const session of sessions) {
      await this.progressReportStore.updateSessionData(session.id, {
        includedInReportId: report.id,
      });
    }

    this.emit(HEALTH_EVENTS.PROGRESS_REPORT_GENERATED, {
      reportId: report.id,
      patientId,
      timestamp: Date.now(),
    });

    return report;
  }

  /**
   * Regenerate report content
   */
  async regenerateContent(reportId: ProgressReportId): Promise<ProgressReport | null> {
    const report = await this.progressReportStore.getReport(reportId);
    if (!report) return null;

    const patient = await this.patientStore.getPatient(report.patientId);
    if (!patient) return null;

    const template = report.templateId
      ? await this.templateManager.getTemplate(report.templateId)
      : await this.templateManager.getDefaultTemplate(report.userId);
    if (!template) return null;

    const aggregatedData = await this.dataAggregator.aggregateSessionData(
      report.userId,
      report.patientId,
      report.periodStart,
      report.periodEnd
    );

    const authorizations = await this.authorizationStore.getActiveAuthorizations(
      report.userId,
      report.patientId
    );

    const content = await this.generateContent(
      patient,
      aggregatedData,
      authorizations[0],
      template
    );

    return this.progressReportStore.updateReport(reportId, {
      content: content.html,
      metadata: content.metadata as unknown as Record<string, unknown>,
    });
  }

  /**
   * Generate report content from data and template
   */
  private async generateContent(
    patient: Patient,
    data: AggregatedData,
    authorization: Authorization | undefined,
    template: ReportTemplate
  ): Promise<GeneratedReportContent> {
    const sections: RenderedSection[] = [];
    const sortedSections = [...template.sections].sort((a, b) => a.order - b.order);

    for (const section of sortedSections) {
      // Check conditional display
      if (section.conditionalDisplay && !this.evaluateCondition(section.conditionalDisplay, data)) {
        continue;
      }

      const rendered = this.renderSection(section, patient, data, authorization, template);
      sections.push(rendered);
    }

    const html = this.assembleHTML(sections, template, patient, data);
    const text = this.assembleText(sections);

    return {
      html,
      text,
      sections,
      metadata: {
        generatedAt: Date.now(),
        templateId: template.id,
        templateName: template.name,
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
      },
    };
  }

  /**
   * Render a single section
   */
  private renderSection(
    section: TemplateSection,
    patient: Patient,
    data: AggregatedData,
    authorization: Authorization | undefined,
    template: ReportTemplate
  ): RenderedSection {
    let content = '';
    let sectionData: unknown;

    switch (section.type) {
      case 'patient-info':
        content = this.renderPatientInfo(patient);
        sectionData = patient;
        break;

      case 'diagnosis':
        content = this.renderDiagnosis(patient);
        sectionData = patient.diagnosisCodes;
        break;

      case 'authorization':
        content = this.renderAuthorization(authorization);
        sectionData = authorization;
        break;

      case 'treatment-summary':
        content = this.renderTreatmentSummary(data);
        sectionData = data;
        break;

      case 'goals-progress':
        content = this.renderGoalsProgress(data);
        sectionData = data.goalProgress;
        break;

      case 'behavior-data':
        content = this.renderBehaviorData(data);
        sectionData = data.behaviorSummary;
        break;

      case 'skill-acquisition':
        content = this.renderSkillAcquisition(data);
        sectionData = data.skillAcquisitionSummary;
        break;

      case 'attendance':
        content = this.renderAttendance(data);
        sectionData = data.attendanceSummary;
        break;

      case 'recommendations':
        content = this.renderRecommendations(data, patient);
        break;

      case 'signature':
        content = this.renderSignature(template);
        break;

      case 'custom-text':
        content = section.content ?? '';
        break;

      default:
        content = `<!-- Section type ${section.type} not implemented -->`;
    }

    return {
      id: section.id,
      name: section.name,
      type: section.type,
      content,
      data: sectionData,
    };
  }

  /**
   * Render patient information section
   */
  private renderPatientInfo(patient: Patient): string {
    const primaryInsurance = patient.insurance?.[0];
    return `
      <div class="section patient-info">
        <h2>Patient Information</h2>
        <table class="info-table">
          <tr><td><strong>Name:</strong></td><td>${patient.firstName} ${patient.lastName}</td></tr>
          <tr><td><strong>Date of Birth:</strong></td><td>${new Date(patient.dateOfBirth).toLocaleDateString()}</td></tr>
          <tr><td><strong>Patient ID:</strong></td><td>${patient.id}</td></tr>
          ${primaryInsurance ? `<tr><td><strong>Insurance:</strong></td><td>${primaryInsurance.payerName}</td></tr>` : ''}
          ${primaryInsurance?.memberId ? `<tr><td><strong>Member ID:</strong></td><td>${primaryInsurance.memberId}</td></tr>` : ''}
        </table>
      </div>
    `;
  }

  /**
   * Render diagnosis section
   */
  private renderDiagnosis(patient: Patient): string {
    if (!patient.diagnosisCodes || patient.diagnosisCodes.length === 0) {
      return '<div class="section diagnosis"><h2>Diagnosis</h2><p>No diagnosis on file.</p></div>';
    }

    const diagnosisRows = patient.diagnosisCodes
      .map((code) => `<tr><td>${code}</td><td>${patient.primaryDiagnosis ?? ''}</td></tr>`)
      .join('');

    return `
      <div class="section diagnosis">
        <h2>Diagnosis</h2>
        <table class="data-table">
          <thead><tr><th>Code</th><th>Description</th></tr></thead>
          <tbody>${diagnosisRows}</tbody>
        </table>
      </div>
    `;
  }

  /**
   * Render authorization section
   */
  private renderAuthorization(authorization?: Authorization): string {
    if (!authorization) {
      return '<div class="section authorization"><h2>Authorization</h2><p>No active authorization.</p></div>';
    }

    return `
      <div class="section authorization">
        <h2>Authorization Information</h2>
        <table class="info-table">
          <tr><td><strong>Authorization #:</strong></td><td>${authorization.authorizationNumber}</td></tr>
          <tr><td><strong>Service:</strong></td><td>${authorization.serviceDescription}</td></tr>
          <tr><td><strong>Period:</strong></td><td>${new Date(authorization.startDate).toLocaleDateString()} - ${new Date(authorization.endDate).toLocaleDateString()}</td></tr>
          <tr><td><strong>Total Units:</strong></td><td>${authorization.totalUnits}</td></tr>
          <tr><td><strong>Units Used:</strong></td><td>${authorization.usedUnits}</td></tr>
          <tr><td><strong>Units Remaining:</strong></td><td>${authorization.remainingUnits}</td></tr>
        </table>
      </div>
    `;
  }

  /**
   * Render treatment summary section
   */
  private renderTreatmentSummary(data: AggregatedData): string {
    return `
      <div class="section treatment-summary">
        <h2>Treatment Summary</h2>
        <p>During the reporting period (${new Date(data.periodStart).toLocaleDateString()} - ${new Date(data.periodEnd).toLocaleDateString()}),
        the patient received <strong>${data.totalSessions}</strong> sessions totaling <strong>${data.totalHours}</strong> hours of ABA therapy services.</p>

        <h3>Session Distribution</h3>
        <table class="data-table">
          <thead><tr><th>Session Type</th><th>Count</th></tr></thead>
          <tbody>
            ${Object.entries(data.sessionTypes)
              .map(([type, count]) => `<tr><td>${type}</td><td>${count}</td></tr>`)
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Render goals and progress section
   */
  private renderGoalsProgress(data: AggregatedData): string {
    if (data.goalProgress.length === 0) {
      return '<div class="section goals-progress"><h2>Goals & Progress</h2><p>No goals tracked during this period.</p></div>';
    }

    const goalRows = data.goalProgress
      .map(
        (g) => `
        <tr>
          <td>${g.goalName}</td>
          <td>${g.domain ?? 'General'}</td>
          <td>${g.baselineValue.toFixed(1)}%</td>
          <td>${g.currentValue.toFixed(1)}%</td>
          <td>${g.targetValue.toFixed(1)}%</td>
          <td>${g.progressPercent.toFixed(0)}%</td>
          <td><span class="trend-${g.trend}">${g.trend}</span></td>
          <td><span class="status-${g.status}">${g.status}</span></td>
        </tr>
      `
      )
      .join('');

    return `
      <div class="section goals-progress">
        <h2>Goals & Progress</h2>
        <table class="data-table">
          <thead>
            <tr>
              <th>Goal</th>
              <th>Domain</th>
              <th>Baseline</th>
              <th>Current</th>
              <th>Target</th>
              <th>Progress</th>
              <th>Trend</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${goalRows}</tbody>
        </table>
      </div>
    `;
  }

  /**
   * Render behavior data section
   */
  private renderBehaviorData(data: AggregatedData): string {
    const { targetBehaviors, replacementBehaviors } = data.behaviorSummary;

    if (targetBehaviors.length === 0 && replacementBehaviors.length === 0) {
      return '<div class="section behavior-data"><h2>Behavior Data</h2><p>No behavior data recorded.</p></div>';
    }

    let content = '<div class="section behavior-data"><h2>Behavior Data</h2>';

    if (targetBehaviors.length > 0) {
      content += `
        <h3>Target Behaviors (Reduction)</h3>
        <table class="data-table">
          <thead><tr><th>Behavior</th><th>Baseline</th><th>Current</th><th>Change</th><th>Trend</th></tr></thead>
          <tbody>
            ${targetBehaviors
              .map(
                (b) => `
              <tr>
                <td>${b.name}</td>
                <td>${b.baselineRate.toFixed(1)}</td>
                <td>${b.currentRate.toFixed(1)}</td>
                <td class="${b.changePercent < 0 ? 'positive' : 'negative'}">${b.changePercent.toFixed(1)}%</td>
                <td><span class="trend-${b.trend}">${b.trend}</span></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    }

    if (replacementBehaviors.length > 0) {
      content += `
        <h3>Replacement Behaviors (Acquisition)</h3>
        <table class="data-table">
          <thead><tr><th>Behavior</th><th>Acquisition Rate</th><th>Trend</th></tr></thead>
          <tbody>
            ${replacementBehaviors
              .map(
                (b) => `
              <tr>
                <td>${b.name}</td>
                <td>${b.acquisitionRate.toFixed(1)}%</td>
                <td><span class="trend-${b.trend}">${b.trend}</span></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    }

    content += '</div>';
    return content;
  }

  /**
   * Render skill acquisition section
   */
  private renderSkillAcquisition(data: AggregatedData): string {
    const summary = data.skillAcquisitionSummary;

    return `
      <div class="section skill-acquisition">
        <h2>Skill Acquisition Summary</h2>
        <table class="info-table">
          <tr><td><strong>Total Goals:</strong></td><td>${summary.totalGoals}</td></tr>
          <tr><td><strong>Mastered:</strong></td><td>${summary.masteredGoals}</td></tr>
          <tr><td><strong>In Progress:</strong></td><td>${summary.inProgressGoals}</td></tr>
          <tr><td><strong>Not Started:</strong></td><td>${summary.notStartedGoals}</td></tr>
          <tr><td><strong>Average Progress:</strong></td><td>${summary.averageProgress.toFixed(1)}%</td></tr>
        </table>

        <h3>Progress by Domain</h3>
        <table class="data-table">
          <thead><tr><th>Domain</th><th>Total</th><th>Mastered</th><th>Avg Progress</th></tr></thead>
          <tbody>
            ${Object.entries(summary.skillsByDomain)
              .map(
                ([domain, stats]) => `
              <tr>
                <td>${domain}</td>
                <td>${stats.total}</td>
                <td>${stats.mastered}</td>
                <td>${stats.averageProgress.toFixed(1)}%</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Render attendance section
   */
  private renderAttendance(data: AggregatedData): string {
    const attendance = data.attendanceSummary;

    return `
      <div class="section attendance">
        <h2>Attendance Summary</h2>
        <table class="info-table">
          <tr><td><strong>Scheduled Sessions:</strong></td><td>${attendance.scheduledSessions}</td></tr>
          <tr><td><strong>Completed:</strong></td><td>${attendance.completedSessions}</td></tr>
          <tr><td><strong>Cancelled:</strong></td><td>${attendance.cancelledSessions}</td></tr>
          <tr><td><strong>No-Shows:</strong></td><td>${attendance.noShowSessions}</td></tr>
          <tr><td><strong>Attendance Rate:</strong></td><td>${attendance.attendanceRate.toFixed(1)}%</td></tr>
        </table>

        ${
          Object.keys(attendance.cancellationReasons).length > 0
            ? `
          <h3>Cancellation Reasons</h3>
          <table class="data-table">
            <thead><tr><th>Reason</th><th>Count</th></tr></thead>
            <tbody>
              ${Object.entries(attendance.cancellationReasons)
                .map(([reason, count]) => `<tr><td>${reason}</td><td>${count}</td></tr>`)
                .join('')}
            </tbody>
          </table>
        `
            : ''
        }
      </div>
    `;
  }

  /**
   * Render recommendations section
   */
  private renderRecommendations(data: AggregatedData, patient: Patient): string {
    const recommendations = this.generateRecommendations(data, patient);

    return `
      <div class="section recommendations">
        <h2>Recommendations</h2>
        <ul>
          ${recommendations.map((r) => `<li>${r}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  /**
   * Render signature section
   */
  private renderSignature(template: ReportTemplate): string {
    const labels = template.footerConfig.signatureLabels ?? [
      'BCBA Signature',
      'Date',
      'Parent/Guardian Signature',
      'Date',
    ];

    const lines = labels
      .map(
        (label) => `
      <div class="signature-line">
        <div class="line"></div>
        <div class="label">${label}</div>
      </div>
    `
      )
      .join('');

    return `
      <div class="section signature">
        <h2>Signatures</h2>
        <div class="signature-grid">
          ${lines}
        </div>
      </div>
    `;
  }

  /**
   * Assemble HTML document
   */
  private assembleHTML(
    sections: RenderedSection[],
    template: ReportTemplate,
    patient: Patient,
    data: AggregatedData
  ): string {
    const { styling, headerConfig, footerConfig } = template;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Progress Report - ${patient.firstName} ${patient.lastName}</title>
  <style>
    body {
      font-family: ${styling.fontFamily};
      font-size: ${styling.fontSize}pt;
      line-height: ${styling.lineHeight};
      color: #333;
      margin: ${styling.margins.top}pt ${styling.margins.right}pt ${styling.margins.bottom}pt ${styling.margins.left}pt;
    }
    h1, h2, h3 { color: ${styling.primaryColor}; }
    h1 { font-size: ${styling.headerFontSize + 4}pt; }
    h2 { font-size: ${styling.headerFontSize}pt; border-bottom: 2px solid ${styling.primaryColor}; padding-bottom: 5pt; }
    h3 { font-size: ${styling.headerFontSize - 2}pt; color: ${styling.secondaryColor}; }
    .header { text-align: center; margin-bottom: 20pt; }
    .header .clinic-name { font-size: ${styling.headerFontSize + 2}pt; font-weight: bold; }
    .header .report-title { font-size: ${styling.headerFontSize}pt; margin-top: 10pt; }
    .section { margin-bottom: 20pt; page-break-inside: avoid; }
    .info-table { border-collapse: collapse; width: 100%; }
    .info-table td { padding: 5pt; vertical-align: top; }
    .info-table td:first-child { width: 200pt; }
    .data-table { border-collapse: collapse; width: 100%; margin-top: 10pt; }
    .data-table th, .data-table td { border: 1pt solid #ccc; padding: 8pt; text-align: left; }
    .data-table th { background: ${styling.primaryColor}; color: white; }
    .data-table tr:nth-child(even) { background: #f8f8f8; }
    .trend-increasing { color: #22c55e; }
    .trend-decreasing { color: #ef4444; }
    .trend-stable { color: #f59e0b; }
    .status-mastered { color: #22c55e; font-weight: bold; }
    .status-approaching-mastery { color: #3b82f6; }
    .status-in-progress { color: #f59e0b; }
    .status-not-started { color: #6b7280; }
    .positive { color: #22c55e; }
    .negative { color: #ef4444; }
    .signature-grid { display: flex; flex-wrap: wrap; gap: 30pt; margin-top: 40pt; }
    .signature-line { width: 200pt; }
    .signature-line .line { border-bottom: 1pt solid #333; height: 30pt; }
    .signature-line .label { font-size: 9pt; color: #666; margin-top: 5pt; }
    .footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 9pt; color: #666; }
    @media print {
      .footer { position: fixed; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    ${headerConfig.includeLogo && headerConfig.logoUrl ? `<img src="${headerConfig.logoUrl}" alt="Logo" style="max-height: 60pt;">` : ''}
    <div class="clinic-name">${headerConfig.clinicName}</div>
    ${headerConfig.clinicAddress ? `<div>${headerConfig.clinicAddress}</div>` : ''}
    ${headerConfig.clinicPhone ? `<div>${headerConfig.clinicPhone}</div>` : ''}
    <div class="report-title">Progress Report</div>
    ${headerConfig.includeReportDate ? `<div>Generated: ${new Date().toLocaleDateString()}</div>` : ''}
    ${headerConfig.includePeriod ? `<div>Reporting Period: ${new Date(data.periodStart).toLocaleDateString()} - ${new Date(data.periodEnd).toLocaleDateString()}</div>` : ''}
  </div>

  ${sections.map((s) => s.content).join('\n')}

  ${
    footerConfig.includeDisclaimer
      ? `
    <div class="footer">
      <p>${footerConfig.disclaimerText ?? 'Confidential patient information.'}</p>
    </div>
  `
      : ''
  }
</body>
</html>
    `.trim();
  }

  /**
   * Assemble plain text version
   */
  private assembleText(sections: RenderedSection[]): string {
    return sections
      .map((s) => {
        // Strip HTML tags for text version
        const text = s.content
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        return `${s.name}\n${'='.repeat(s.name.length)}\n${text}\n`;
      })
      .join('\n\n');
  }

  /**
   * Generate recommendations based on data
   */
  private generateRecommendations(data: AggregatedData, patient: Patient): string[] {
    const recommendations: string[] = [];

    // Attendance recommendations
    if (data.attendanceSummary.attendanceRate < 80) {
      recommendations.push(
        'Consider addressing attendance barriers to improve treatment outcomes. ' +
          `Current attendance rate is ${data.attendanceSummary.attendanceRate.toFixed(0)}%.`
      );
    }

    // Goal progress recommendations
    const stagnantGoals = data.goalProgress.filter(
      (g) => g.trend === 'stable' && g.progressPercent < 50
    );
    if (stagnantGoals.length > 0) {
      recommendations.push(
        `Review treatment strategies for ${stagnantGoals.length} goal(s) showing limited progress: ` +
          stagnantGoals.map((g) => g.goalName).join(', ')
      );
    }

    const masteredGoals = data.goalProgress.filter((g) => g.status === 'mastered');
    if (masteredGoals.length > 0) {
      recommendations.push(
        `Consider introducing new goals to replace ${masteredGoals.length} mastered goal(s).`
      );
    }

    // Behavior recommendations
    const increasingTargetBehaviors = data.behaviorSummary.targetBehaviors.filter(
      (b) => b.trend === 'increasing'
    );
    if (increasingTargetBehaviors.length > 0) {
      recommendations.push(
        'Target behaviors showing an increasing trend require intervention review: ' +
          increasingTargetBehaviors.map((b) => b.name).join(', ')
      );
    }

    // Default recommendation
    if (recommendations.length === 0) {
      recommendations.push(
        'Continue current treatment plan. Patient is making progress toward treatment goals.'
      );
    }

    recommendations.push('Recommend continued ABA therapy services as medically necessary.');

    return recommendations;
  }

  /**
   * Evaluate conditional display
   */
  private evaluateCondition(
    condition: TemplateSection['conditionalDisplay'],
    data: AggregatedData
  ): boolean {
    if (!condition) return true;

    const value = this.getNestedValue(data, condition.field);

    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'notEquals':
        return value !== condition.value;
      case 'greaterThan':
        return typeof value === 'number' && value > (condition.value as number);
      case 'lessThan':
        return typeof value === 'number' && value < (condition.value as number);
      case 'contains':
        return typeof value === 'string' && value.includes(condition.value as string);
      case 'exists':
        return value !== undefined && value !== null;
      default:
        return true;
    }
  }

  /**
   * Get nested object value by path
   */
  private getNestedValue(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}
