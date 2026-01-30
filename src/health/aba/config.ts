/**
 * Healthcare/ABA Module Configuration Schema
 *
 * Zod schemas for validating healthcare ABA configuration including:
 * - HIPAA compliance settings
 * - Appointment reminders
 * - Authorization alerts
 * - Notification providers
 * - Chatbot settings
 * - Payer integrations
 */

import { z } from 'zod';

// =============================================================================
// HIPAA Compliance Configuration
// =============================================================================

export const HIPAAConfigSchema = z.object({
  /** Audit log retention in days (default 6 years = 2190 days) */
  auditLogRetentionDays: z.number().min(365).max(7300).default(2190),
  /** Patient record retention in years */
  patientRecordRetentionYears: z.number().min(1).max(20).default(7),
  /** Require MFA for PHI access */
  requireMFA: z.boolean().default(true),
  /** Session timeout in minutes */
  sessionTimeoutMinutes: z.number().min(5).max(60).default(15),
  /** Allowed IP ranges (CIDR notation) */
  allowedIpRanges: z.array(z.string()).optional(),
  /** Enable PHI access logging */
  logPHIAccess: z.boolean().default(true),
  /** Encrypt data at rest */
  encryptAtRest: z.boolean().default(true),
  /** Minimum password length */
  minPasswordLength: z.number().min(8).max(32).default(12),
  /** Require password complexity */
  requirePasswordComplexity: z.boolean().default(true),
  /** Account lockout threshold */
  accountLockoutThreshold: z.number().min(3).max(10).default(5),
  /** Account lockout duration in minutes */
  accountLockoutDurationMinutes: z.number().min(5).max(60).default(30),
});

export type HIPAAConfig = z.infer<typeof HIPAAConfigSchema>;

// =============================================================================
// Appointment Configuration
// =============================================================================

export const AppointmentConfigSchema = z.object({
  /** Reminder intervals in minutes before appointment */
  reminderIntervals: z.array(z.number()).default([1440, 120]), // 24h, 2h
  /** Default appointment duration in minutes */
  defaultDuration: z.number().min(15).max(480).default(60),
  /** No-show grace period in minutes */
  noShowGracePeriod: z.number().min(5).max(60).default(15),
  /** Allow patient self-scheduling */
  allowSelfScheduling: z.boolean().default(false),
  /** Minimum advance booking in hours */
  minAdvanceBookingHours: z.number().min(0).max(168).default(24),
  /** Maximum advance booking in days */
  maxAdvanceBookingDays: z.number().min(1).max(365).default(90),
  /** Enable waitlist */
  enableWaitlist: z.boolean().default(true),
  /** Auto-confirm appointments with responses */
  autoConfirmOnResponse: z.boolean().default(true),
  /** Cancellation fee in dollars (0 = no fee) */
  cancellationFee: z.number().min(0).max(200).default(50),
  /** Late cancellation window in hours */
  lateCancellationWindowHours: z.number().min(1).max(72).default(24),
});

export type AppointmentConfig = z.infer<typeof AppointmentConfigSchema>;

// =============================================================================
// Authorization Alert Configuration
// =============================================================================

export const AuthorizationConfigSchema = z.object({
  /** Days before expiration to send alerts */
  alertThresholdsDays: z.array(z.number()).default([30, 14, 7]),
  /** Unit percentage thresholds for alerts (0.0-1.0) */
  unitsAlertThresholds: z.array(z.number()).default([0.2, 0.1]),
  /** Auto-send renewal reminder */
  autoRenewalReminder: z.boolean().default(true),
  /** Days before expiration to start renewal process */
  renewalLeadTimeDays: z.number().min(14).max(90).default(45),
  /** Enable automatic unit tracking */
  autoTrackUnits: z.boolean().default(true),
  /** Alert on denied authorization */
  alertOnDenied: z.boolean().default(true),
  /** Default authorization duration in days */
  defaultAuthDurationDays: z.number().min(30).max(365).default(180),
});

export type AuthorizationConfig = z.infer<typeof AuthorizationConfigSchema>;

// =============================================================================
// SMS Notification Configuration
// =============================================================================

export const SMSConfigSchema = z.object({
  /** Enable SMS notifications */
  enabled: z.boolean().default(true),
  /** SMS provider */
  provider: z.enum(['twilio', 'vonage', 'aws-sns']).default('twilio'),
  /** Account SID environment variable */
  accountSidEnvVar: z.string().default('TWILIO_ACCOUNT_SID'),
  /** Auth token environment variable */
  authTokenEnvVar: z.string().default('TWILIO_AUTH_TOKEN'),
  /** From phone number environment variable */
  fromNumberEnvVar: z.string().default('TWILIO_FROM_NUMBER'),
  /** Rate limit per minute */
  rateLimitPerMinute: z.number().min(1).max(100).default(30),
  /** Enable delivery receipts */
  enableDeliveryReceipts: z.boolean().default(true),
});

export type SMSConfig = z.infer<typeof SMSConfigSchema>;

// =============================================================================
// Email Notification Configuration
// =============================================================================

export const EmailConfigSchema = z.object({
  /** Enable email notifications */
  enabled: z.boolean().default(true),
  /** Email provider */
  provider: z.enum(['smtp', 'sendgrid', 'ses', 'mailgun']).default('sendgrid'),
  /** API key environment variable */
  apiKeyEnvVar: z.string().default('SENDGRID_API_KEY'),
  /** From email address */
  fromEmail: z.string().email().optional(),
  /** From name */
  fromName: z.string().optional(),
  /** Reply-to email */
  replyToEmail: z.string().email().optional(),
  /** Rate limit per minute */
  rateLimitPerMinute: z.number().min(1).max(100).default(50),
  /** Enable click tracking */
  enableClickTracking: z.boolean().default(false), // HIPAA consideration
  /** Enable open tracking */
  enableOpenTracking: z.boolean().default(false), // HIPAA consideration
});

export type EmailConfig = z.infer<typeof EmailConfigSchema>;

// =============================================================================
// Voice Notification Configuration
// =============================================================================

export const VoiceConfigSchema = z.object({
  /** Enable voice notifications */
  enabled: z.boolean().default(false),
  /** Voice provider */
  provider: z.enum(['twilio', 'vonage']).default('twilio'),
  /** Account SID environment variable */
  accountSidEnvVar: z.string().default('TWILIO_ACCOUNT_SID'),
  /** Auth token environment variable */
  authTokenEnvVar: z.string().default('TWILIO_AUTH_TOKEN'),
  /** From phone number environment variable */
  fromNumberEnvVar: z.string().default('TWILIO_FROM_NUMBER'),
  /** Voice for text-to-speech */
  voice: z.enum(['alice', 'man', 'woman', 'polly']).default('alice'),
  /** Language for text-to-speech */
  language: z.string().default('en-US'),
  /** Max call duration in seconds */
  maxCallDurationSeconds: z.number().min(30).max(300).default(120),
  /** Rate limit per minute */
  rateLimitPerMinute: z.number().min(1).max(30).default(10),
});

export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;

// =============================================================================
// Notification Configuration (Combined)
// =============================================================================

export const NotificationConfigSchema = z.object({
  /** SMS configuration */
  sms: SMSConfigSchema.optional(),
  /** Email configuration */
  email: EmailConfigSchema.optional(),
  /** Voice configuration */
  voice: VoiceConfigSchema.optional(),
  /** Default notification channel */
  defaultChannel: z.enum(['sms', 'email', 'voice']).default('sms'),
  /** Fallback channels in order of preference */
  fallbackChannels: z.array(z.enum(['sms', 'email', 'voice'])).default(['email']),
  /** Quiet hours start (HH:MM) */
  quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  /** Quiet hours end (HH:MM) */
  quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  /** Respect quiet hours */
  respectQuietHours: z.boolean().default(true),
});

export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;

// =============================================================================
// Chatbot Configuration
// =============================================================================

export const ChatbotConfigSchema = z.object({
  /** Enable parent chatbot */
  enabled: z.boolean().default(true),
  /** Confidence threshold below which to escalate */
  escalationThreshold: z.number().min(0).max(1).default(0.3),
  /** Max response time in milliseconds */
  maxResponseTimeMs: z.number().min(1000).max(30000).default(5000),
  /** Supported languages */
  supportedLanguages: z.array(z.string()).default(['en', 'es']),
  /** Default language */
  defaultLanguage: z.string().default('en'),
  /** Max messages per session */
  maxMessagesPerSession: z.number().min(10).max(200).default(50),
  /** Session timeout in minutes */
  sessionTimeoutMinutes: z.number().min(5).max(120).default(30),
  /** Enable auto-greeting */
  enableAutoGreeting: z.boolean().default(true),
  /** Auto-greeting message */
  autoGreetingMessage: z.string().default('Hello! I\'m here to help answer your questions about ABA therapy services. How can I assist you today?'),
  /** Enable satisfaction survey */
  enableSatisfactionSurvey: z.boolean().default(true),
  /** AI model for response generation (optional) */
  aiModelEnvVar: z.string().optional(),
  /** Use AI for response enhancement */
  useAIEnhancement: z.boolean().default(false),
});

export type ChatbotConfig = z.infer<typeof ChatbotConfigSchema>;

// =============================================================================
// Progress Report Configuration
// =============================================================================

export const ProgressReportConfigSchema = z.object({
  /** Enable automated report generation */
  enabled: z.boolean().default(true),
  /** Default reporting period in days */
  defaultPeriodDays: z.number().min(7).max(180).default(90),
  /** Require supervisor approval */
  requireSupervisorApproval: z.boolean().default(true),
  /** Auto-generate before authorization renewal */
  autoGenerateForRenewal: z.boolean().default(true),
  /** Days before renewal to generate report */
  renewalLeadTimeDays: z.number().min(7).max(60).default(30),
  /** Include graphs in reports */
  includeGraphs: z.boolean().default(true),
  /** Default export format */
  defaultExportFormat: z.enum(['pdf', 'docx', 'html']).default('pdf'),
});

export type ProgressReportConfig = z.infer<typeof ProgressReportConfigSchema>;

// =============================================================================
// Scheduling Configuration
// =============================================================================

export const SchedulingConfigSchema = z.object({
  /** Enable scheduling optimization */
  enabled: z.boolean().default(true),
  /** Consider travel time in scheduling */
  considerTravelTime: z.boolean().default(true),
  /** Default travel time between appointments (minutes) */
  defaultTravelTimeMinutes: z.number().min(0).max(60).default(15),
  /** Max hours per RBT per week */
  maxRBTHoursPerWeek: z.number().min(20).max(60).default(40),
  /** Enable overtime alerts */
  enableOvertimeAlerts: z.boolean().default(true),
  /** Overtime threshold (hours over max) */
  overtimeThresholdHours: z.number().min(1).max(20).default(5),
  /** Auto-detect conflicts */
  autoDetectConflicts: z.boolean().default(true),
  /** Enable schedule optimization suggestions */
  enableOptimizationSuggestions: z.boolean().default(true),
});

export type SchedulingConfig = z.infer<typeof SchedulingConfigSchema>;

// =============================================================================
// Payer Configuration
// =============================================================================

export const PayerConfigSchema = z.object({
  /** Enable payer integration */
  enabled: z.boolean().default(false),
  /** API key environment variable */
  apiKeyEnvVar: z.string().optional(),
  /** API secret environment variable */
  apiSecretEnvVar: z.string().optional(),
  /** Base URL */
  baseUrl: z.string().url().optional(),
  /** Sandbox mode */
  sandbox: z.boolean().default(true),
  /** Rate limit per minute */
  rateLimitPerMinute: z.number().min(1).max(100).default(30),
  /** Timeout in milliseconds */
  timeoutMs: z.number().min(5000).max(60000).default(30000),
});

export type PayerConfig = z.infer<typeof PayerConfigSchema>;

// =============================================================================
// Root Healthcare ABA Configuration
// =============================================================================

export const HealthABAConfigSchema = z.object({
  /** Enable healthcare ABA module */
  enabled: z.boolean().default(true),

  /** HIPAA compliance settings */
  hipaa: HIPAAConfigSchema.default({}),

  /** Appointment settings */
  appointments: AppointmentConfigSchema.default({}),

  /** Authorization alert settings */
  authorization: AuthorizationConfigSchema.default({}),

  /** Notification settings */
  notifications: NotificationConfigSchema.default({}),

  /** Chatbot settings */
  chatbot: ChatbotConfigSchema.default({}),

  /** Progress report settings */
  progressReports: ProgressReportConfigSchema.default({}),

  /** Scheduling settings */
  scheduling: SchedulingConfigSchema.default({}),

  /** Payer integrations */
  payers: z.object({
    availity: PayerConfigSchema.optional(),
    changeHealthcare: PayerConfigSchema.optional(),
  }).default({}),

  /** Store type */
  storeType: z.enum(['memory', 'database']).default('database'),

  /** Event bus enabled */
  eventBusEnabled: z.boolean().default(true),

  /** API domain allowlist */
  allowedApiDomains: z.array(z.string()).default([
    'api.twilio.com',
    'api.sendgrid.com',
    'api.availity.com',
    'api.changehealthcare.com',
  ]),

  /** Clinic information */
  clinic: z.object({
    name: z.string().default('ABA Therapy Center'),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    address: z.string().optional(),
    taxId: z.string().optional(),
    npi: z.string().optional(), // National Provider Identifier
  }).default({}),
});

export type HealthABAConfig = z.infer<typeof HealthABAConfigSchema>;

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_HEALTH_ABA_CONFIG: HealthABAConfig = {
  enabled: true,
  hipaa: {
    auditLogRetentionDays: 2190,
    patientRecordRetentionYears: 7,
    requireMFA: true,
    sessionTimeoutMinutes: 15,
    logPHIAccess: true,
    encryptAtRest: true,
    minPasswordLength: 12,
    requirePasswordComplexity: true,
    accountLockoutThreshold: 5,
    accountLockoutDurationMinutes: 30,
  },
  appointments: {
    reminderIntervals: [1440, 120],
    defaultDuration: 60,
    noShowGracePeriod: 15,
    allowSelfScheduling: false,
    minAdvanceBookingHours: 24,
    maxAdvanceBookingDays: 90,
    enableWaitlist: true,
    autoConfirmOnResponse: true,
    cancellationFee: 50,
    lateCancellationWindowHours: 24,
  },
  authorization: {
    alertThresholdsDays: [30, 14, 7],
    unitsAlertThresholds: [0.2, 0.1],
    autoRenewalReminder: true,
    renewalLeadTimeDays: 45,
    autoTrackUnits: true,
    alertOnDenied: true,
    defaultAuthDurationDays: 180,
  },
  notifications: {
    defaultChannel: 'sms',
    fallbackChannels: ['email'],
    respectQuietHours: true,
  },
  chatbot: {
    enabled: true,
    escalationThreshold: 0.3,
    maxResponseTimeMs: 5000,
    supportedLanguages: ['en', 'es'],
    defaultLanguage: 'en',
    maxMessagesPerSession: 50,
    sessionTimeoutMinutes: 30,
    enableAutoGreeting: true,
    autoGreetingMessage: 'Hello! I\'m here to help answer your questions about ABA therapy services. How can I assist you today?',
    enableSatisfactionSurvey: true,
    useAIEnhancement: false,
  },
  progressReports: {
    enabled: true,
    defaultPeriodDays: 90,
    requireSupervisorApproval: true,
    autoGenerateForRenewal: true,
    renewalLeadTimeDays: 30,
    includeGraphs: true,
    defaultExportFormat: 'pdf',
  },
  scheduling: {
    enabled: true,
    considerTravelTime: true,
    defaultTravelTimeMinutes: 15,
    maxRBTHoursPerWeek: 40,
    enableOvertimeAlerts: true,
    overtimeThresholdHours: 5,
    autoDetectConflicts: true,
    enableOptimizationSuggestions: true,
  },
  payers: {},
  storeType: 'database',
  eventBusEnabled: true,
  allowedApiDomains: [
    'api.twilio.com',
    'api.sendgrid.com',
    'api.availity.com',
    'api.changehealthcare.com',
  ],
  clinic: {
    name: 'ABA Therapy Center',
  },
};

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate healthcare ABA configuration
 */
export function validateHealthABAConfig(config: unknown): HealthABAConfig {
  return HealthABAConfigSchema.parse(config);
}

/**
 * Safe validation that returns errors instead of throwing
 */
export function safeValidateHealthABAConfig(config: unknown): {
  success: boolean;
  data?: HealthABAConfig;
  errors?: Array<{ path: string; message: string }>;
} {
  const result = HealthABAConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    })),
  };
}

/**
 * Merge partial config with defaults
 */
export function mergeWithDefaults(partial: Partial<HealthABAConfig>): HealthABAConfig {
  return {
    ...DEFAULT_HEALTH_ABA_CONFIG,
    ...partial,
    hipaa: partial.hipaa
      ? { ...DEFAULT_HEALTH_ABA_CONFIG.hipaa, ...partial.hipaa }
      : DEFAULT_HEALTH_ABA_CONFIG.hipaa,
    appointments: partial.appointments
      ? { ...DEFAULT_HEALTH_ABA_CONFIG.appointments, ...partial.appointments }
      : DEFAULT_HEALTH_ABA_CONFIG.appointments,
    authorization: partial.authorization
      ? { ...DEFAULT_HEALTH_ABA_CONFIG.authorization, ...partial.authorization }
      : DEFAULT_HEALTH_ABA_CONFIG.authorization,
    notifications: partial.notifications
      ? { ...DEFAULT_HEALTH_ABA_CONFIG.notifications, ...partial.notifications }
      : DEFAULT_HEALTH_ABA_CONFIG.notifications,
    chatbot: partial.chatbot
      ? { ...DEFAULT_HEALTH_ABA_CONFIG.chatbot, ...partial.chatbot }
      : DEFAULT_HEALTH_ABA_CONFIG.chatbot,
    progressReports: partial.progressReports
      ? { ...DEFAULT_HEALTH_ABA_CONFIG.progressReports, ...partial.progressReports }
      : DEFAULT_HEALTH_ABA_CONFIG.progressReports,
    scheduling: partial.scheduling
      ? { ...DEFAULT_HEALTH_ABA_CONFIG.scheduling, ...partial.scheduling }
      : DEFAULT_HEALTH_ABA_CONFIG.scheduling,
    payers: partial.payers
      ? { ...DEFAULT_HEALTH_ABA_CONFIG.payers, ...partial.payers }
      : DEFAULT_HEALTH_ABA_CONFIG.payers,
    clinic: partial.clinic
      ? { ...DEFAULT_HEALTH_ABA_CONFIG.clinic, ...partial.clinic }
      : DEFAULT_HEALTH_ABA_CONFIG.clinic,
  };
}
