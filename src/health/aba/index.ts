/**
 * Health ABA Module
 *
 * Comprehensive healthcare/ABA (Applied Behavior Analysis) module with:
 * - Patient appointment reminders with confirmation tracking
 * - Insurance authorization tracking with expiration alerts
 * - Automated progress report generation
 * - Parent FAQ chatbot for common questions
 * - RBT (Registered Behavior Technician) schedule coordination
 * - HIPAA-compliant audit logging
 * - Insurance payer integration templates
 */

import { EventEmitter } from 'events';
import type { DatabaseAdapter } from '../../persistence/index.js';
import type { KeyValueStoreAdapter } from './types.js';

// Stores
import {
  createPatientStore,
  createAppointmentStore,
  createAuthorizationStore,
  createHealthAuditStore,
  createProgressReportStore,
  createFAQStore,
  createScheduleStore,
  type PatientStore,
  type AppointmentStore,
  type AuthorizationStore,
  type HealthAuditStore,
  type ProgressReportStore,
  type FAQStore,
  type ScheduleStore,
} from './stores/index.js';

// Services
import { AppointmentService } from './services/appointment/index.js';
import { AuthorizationService } from './services/authorization/index.js';
import { ProgressReportService } from './services/progress-report/index.js';
import { ParentChatbotService, type StaffRecipient } from './services/parent-chatbot/index.js';
import { SchedulingService } from './services/scheduling/index.js';
import { ComplianceService } from './services/compliance/index.js';

// Monitoring
import { AlertEngine } from './monitoring/alert-engine.js';

// Config
import type { HealthABAConfig, NotificationConfig } from './config.js';
import { HEALTH_EVENTS } from './constants.js';

// Providers
import type { NotificationProvider } from './providers/notification/types.js';

// =============================================================================
// Health ABA Manager Options
// =============================================================================

export interface HealthABAManagerOptions {
  config: HealthABAConfig;
  /** SQL database adapter for patient, appointment, authorization, and audit stores */
  db?: DatabaseAdapter;
  /** Key-value store adapter for FAQ, progress report, and schedule stores */
  kvStore?: KeyValueStoreAdapter;
  smsProvider?: NotificationProvider;
  emailProvider?: NotificationProvider;
  voiceProvider?: NotificationProvider;
  staffRecipients?: StaffRecipient[];
  clinicInfo?: {
    name: string;
    phone: string;
    email: string;
    address?: string;
    billingPhone?: string;
    billingEmail?: string;
    businessHours: string;
    npi?: string;
    logoUrl?: string;
  };
}

// =============================================================================
// Health ABA Manager
// =============================================================================

export class HealthABAManager extends EventEmitter {
  private readonly config: HealthABAConfig;
  private readonly storeType: 'memory' | 'database';

  // Stores
  public readonly patientStore: PatientStore;
  public readonly appointmentStore: AppointmentStore;
  public readonly authorizationStore: AuthorizationStore;
  public readonly auditStore: HealthAuditStore;
  public readonly progressReportStore: ProgressReportStore;
  public readonly faqStore: FAQStore;
  public readonly scheduleStore: ScheduleStore;

  // Services
  public readonly appointments: AppointmentService;
  public readonly authorizations: AuthorizationService;
  public readonly progressReports: ProgressReportService;
  public readonly chatbot: ParentChatbotService;
  public readonly scheduling: SchedulingService;
  public readonly compliance: ComplianceService;

  // Monitoring
  public readonly alerts: AlertEngine;

  constructor(options: HealthABAManagerOptions) {
    super();

    this.config = options.config;
    this.storeType = options.config.storeType;

    // Initialize SQL-based stores
    this.patientStore = createPatientStore(this.storeType, options.db);
    this.appointmentStore = createAppointmentStore(this.storeType, options.db);
    this.authorizationStore = createAuthorizationStore(this.storeType, options.db);
    this.auditStore = createHealthAuditStore(this.storeType, options.db);

    // Initialize key-value based stores
    this.progressReportStore = createProgressReportStore(this.storeType, options.kvStore);
    this.faqStore = createFAQStore(this.storeType, options.kvStore);
    this.scheduleStore = createScheduleStore(this.storeType, options.kvStore);

    // Initialize notification config
    const notificationConfig: NotificationConfig = options.config.notifications;

    // Initialize alert engine
    this.alerts = new AlertEngine({
      appointmentStore: this.appointmentStore,
      authorizationStore: this.authorizationStore,
      patientStore: this.patientStore,
      authorizationConfig: options.config.authorization,
    });

    // Initialize compliance service
    this.compliance = new ComplianceService({
      auditStore: this.auditStore,
      patientStore: this.patientStore,
      appointmentStore: this.appointmentStore,
      authorizationStore: this.authorizationStore,
      progressReportStore: this.progressReportStore,
      faqStore: this.faqStore,
      scheduleStore: this.scheduleStore,
      config: options.config.hipaa,
    });

    // Initialize appointment service
    this.appointments = new AppointmentService({
      appointmentStore: this.appointmentStore,
      patientStore: this.patientStore,
      authorizationStore: this.authorizationStore,
      auditStore: this.auditStore,
      smsProvider: options.smsProvider,
      emailProvider: options.emailProvider,
      voiceProvider: options.voiceProvider,
      appointmentConfig: options.config.appointments,
      notificationConfig,
      userId: 'system', // Would be per-request in real app
    });

    // Initialize authorization service (using first user context - would be per-request in real app)
    this.authorizations = new AuthorizationService({
      authorizationStore: this.authorizationStore,
      patientStore: this.patientStore,
      auditStore: this.auditStore,
      smsProvider: options.smsProvider,
      emailProvider: options.emailProvider,
      authorizationConfig: options.config.authorization,
      notificationConfig,
      userId: 'system', // Would be per-request in real app
    });

    // Initialize progress report service
    this.progressReports = new ProgressReportService({
      progressReportStore: this.progressReportStore,
      patientStore: this.patientStore,
      authorizationStore: this.authorizationStore,
      clinicInfo: options.clinicInfo,
    });

    // Initialize parent chatbot service
    this.chatbot = new ParentChatbotService({
      faqStore: this.faqStore,
      patientStore: this.patientStore,
      appointmentStore: this.appointmentStore,
      authorizationStore: this.authorizationStore,
      smsProvider: options.smsProvider,
      emailProvider: options.emailProvider,
      config: options.config.chatbot,
      clinicInfo: options.clinicInfo ?? {
        name: 'ABA Therapy Center',
        phone: '(555) 123-4567',
        email: 'info@abatherapy.example.com',
        businessHours: 'Monday-Friday 8am-6pm',
      },
      staffRecipients: options.staffRecipients ?? [],
    });

    // Initialize scheduling service
    this.scheduling = new SchedulingService({
      scheduleStore: this.scheduleStore,
      patientStore: this.patientStore,
      appointmentStore: this.appointmentStore,
      authorizationStore: this.authorizationStore,
      defaultTravelTimeMinutes: options.config.scheduling?.defaultTravelTimeMinutes,
    });

    // Forward events from all services
    this.forwardEvents();
  }

  /**
   * Forward events from sub-services to manager
   */
  private forwardEvents(): void {
    // Forward appointment events
    for (const event of Object.values(HEALTH_EVENTS)) {
      this.appointments.on(event, (data) => this.emit(event, data));
      this.authorizations.on(event, (data) => this.emit(event, data));
      this.progressReports.on(event, (data) => this.emit(event, data));
      this.chatbot.on(event, (data) => this.emit(event, data));
      this.scheduling.on(event, (data) => this.emit(event, data));
      this.compliance.on(event, (data) => this.emit(event, data));
    }
  }

  /**
   * Run scheduled tasks (call periodically, e.g., via cron)
   */
  async runScheduledTasks(userId: string): Promise<{
    reminders: number;
    expirationAlerts: number;
    lowUnitAlerts: number;
    expiredUpdated: number;
    alerts: number;
  }> {
    // Send appointment reminders
    const reminders = await this.appointments.sendPendingReminders();

    // Check authorization expirations
    const expirationAlerts = await this.authorizations.checkExpirations();

    // Check low unit authorizations
    const lowUnitAlerts = await this.authorizations.checkLowUnits();

    // Update expired authorizations
    const expiredUpdated = await this.authorizations.updateExpiredAuthorizations();

    // Run alert checks
    const alertResults = await this.alerts.runAlertChecks(userId);

    return {
      reminders,
      expirationAlerts,
      lowUnitAlerts,
      expiredUpdated,
      alerts: alertResults.length,
    };
  }

  /**
   * Get dashboard summary for a user
   */
  async getDashboardSummary(userId: string): Promise<{
    appointments: {
      todayCount: number;
      upcomingCount: number;
      unconfirmedCount: number;
    };
    authorizations: {
      activeCount: number;
      expiringCount: number;
      lowUnitsCount: number;
    };
    scheduling: {
      activeRbts: number;
      scheduledSessions: number;
      conflictCount: number;
    };
    alerts: {
      critical: number;
      warning: number;
      info: number;
    };
    compliance: {
      score: number;
      recentFailures: number;
    };
  }> {
    const now = Date.now();
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Appointments
    const todayAppointments = await this.appointmentStore.listAppointments(userId, {
      startDate: now,
      endDate: todayEnd.getTime(),
    });
    const upcomingAppointments = await this.appointmentStore.listAppointments(userId, {
      startDate: now,
      endDate: now + 7 * 24 * 60 * 60 * 1000,
    });
    const pendingConfirmations = await this.appointmentStore.getPendingConfirmations(userId);

    // Authorizations
    const activeAuths = await this.authorizationStore.getActiveAuthorizations(userId);
    const expiringAuths = await this.authorizationStore.getExpiringAuthorizations(userId, 30);
    const lowUnitsAuths = await this.authorizationStore.getLowUnitAuthorizations(userId, 0.2);

    // Scheduling
    const weekStart = SchedulingService.getWeekStart(now);
    const schedulingStats = await this.scheduling.getSchedulingStats(userId, weekStart);

    // Alerts
    const alertSummary = await this.alerts.getAlertSummary(userId);

    // Compliance
    const complianceStatus = await this.compliance.getComplianceStatus(userId);

    return {
      appointments: {
        todayCount: todayAppointments.length,
        upcomingCount: upcomingAppointments.length,
        unconfirmedCount: pendingConfirmations.length,
      },
      authorizations: {
        activeCount: activeAuths.length,
        expiringCount: expiringAuths.length,
        lowUnitsCount: lowUnitsAuths.length,
      },
      scheduling: {
        activeRbts: schedulingStats.totalRBTs,
        scheduledSessions: schedulingStats.totalAssignments,
        conflictCount: schedulingStats.conflictCount,
      },
      alerts: {
        critical: alertSummary.critical,
        warning: alertSummary.warning,
        info: alertSummary.info,
      },
      compliance: {
        score: complianceStatus.overallScore,
        recentFailures: complianceStatus.auditLogging.failureCount,
      },
    };
  }
}

// =============================================================================
// Exports
// =============================================================================

// Types - export everything from types
export * from './types.js';

// Config
export * from './config.js';

// Constants
export * from './constants.js';

// Stores
export * from './stores/index.js';

// Providers
export * from './providers/index.js';

// Services - explicitly re-export to avoid conflicts with types.js
export {
  AppointmentService,
  ReminderScheduler,
  ConfirmationTracker,
  NoShowHandler,
  AuthorizationService,
  AuthorizationTracker,
  ExpirationMonitor,
  RenewalAssistant,
  ProgressReportService,
  DataAggregator,
  ReportGenerator,
  TemplateManager,
  type AggregatedData,
  type GeneratedReportContent,
  // Note: ReportTemplate is also exported from types.js, use types.js version
  type TemplateSection,
  DEFAULT_SECTIONS,
  DEFAULT_STYLING,
  ParentChatbotService,
  IntentClassifier,
  ResponseGenerator,
  EscalationHandler,
  // Note: Intent is also exported from types.js, use types.js version as canonical
  type IntentName,
  type GeneratedResponse,
  type EscalationRequest,
  type EscalationReason,
  type StaffRecipient,
  type ChatResponse,
  SchedulingService,
  AvailabilityManager,
  ConflictResolver,
  OptimizationEngine,
  type AvailabilityBlock,
  type TimeOffRequest,
  type ResolutionSuggestion,
  type OptimizationRequest,
  type OptimizationResult,
  type OptimizationMetrics,
  ComplianceService,
  AuditLogger,
  AccessController,
  DataRetentionManager,
  AccessDeniedError,
  createAccessMiddleware,
  type AuditContext,
  type AccessRequest,
  type AccessResult,
  type Permission,
  type RetentionPolicy,
  type RetentionJob,
} from './services/index.js';

// Monitoring
export * from './monitoring/index.js';
