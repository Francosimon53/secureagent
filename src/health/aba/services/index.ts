/**
 * Health ABA Services Index
 *
 * Exports all service modules.
 */

// Appointment Service
export {
  AppointmentService,
  ReminderScheduler,
  ConfirmationTracker,
  NoShowHandler,
} from './appointment/index.js';

// Authorization Service
export {
  AuthorizationService,
  AuthorizationTracker,
  ExpirationMonitor,
  RenewalAssistant,
} from './authorization/index.js';

// Progress Report Service
export {
  ProgressReportService,
  DataAggregator,
  ReportGenerator,
  TemplateManager,
  type AggregatedData,
  type GeneratedReportContent,
  type ReportTemplate,
  type TemplateSection,
  DEFAULT_SECTIONS,
  DEFAULT_STYLING,
} from './progress-report/index.js';

// Parent Chatbot Service
export {
  ParentChatbotService,
  IntentClassifier,
  ResponseGenerator,
  EscalationHandler,
  type Intent,
  type IntentName,
  type GeneratedResponse,
  type EscalationRequest,
  type EscalationReason,
  type StaffRecipient,
  type ChatResponse,
} from './parent-chatbot/index.js';

// Scheduling Service
export {
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
} from './scheduling/index.js';

// Compliance Service
export {
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
} from './compliance/index.js';
