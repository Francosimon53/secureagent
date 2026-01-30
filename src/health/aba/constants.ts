/**
 * Healthcare/ABA Module Constants
 *
 * Event names, defaults, error codes, CPT codes, and other constants
 * for the ABA healthcare module.
 */

// =============================================================================
// Event Names
// =============================================================================

export const HEALTH_EVENTS = {
  // Patient events
  PATIENT_CREATED: 'health:patient:created',
  PATIENT_UPDATED: 'health:patient:updated',
  PATIENT_STATUS_CHANGED: 'health:patient:status-changed',
  PATIENT_DISCHARGED: 'health:patient:discharged',

  // Appointment events
  APPOINTMENT_SCHEDULED: 'health:appointment:scheduled',
  APPOINTMENT_CONFIRMED: 'health:appointment:confirmed',
  APPOINTMENT_STARTED: 'health:appointment:started',
  APPOINTMENT_COMPLETED: 'health:appointment:completed',
  APPOINTMENT_CANCELLED: 'health:appointment:cancelled',
  APPOINTMENT_NO_SHOW: 'health:appointment:no-show',
  APPOINTMENT_RESCHEDULED: 'health:appointment:rescheduled',

  // Reminder events
  REMINDER_SCHEDULED: 'health:reminder:scheduled',
  REMINDER_SENT: 'health:reminder:sent',
  REMINDER_DELIVERED: 'health:reminder:delivered',
  REMINDER_FAILED: 'health:reminder:failed',
  CONFIRMATION_RECEIVED: 'health:confirmation:received',

  // Authorization events
  AUTHORIZATION_CREATED: 'health:authorization:created',
  AUTHORIZATION_UPDATED: 'health:authorization:updated',
  AUTHORIZATION_APPROVED: 'health:authorization:approved',
  AUTHORIZATION_DENIED: 'health:authorization:denied',
  AUTHORIZATION_EXPIRING: 'health:authorization:expiring',
  AUTHORIZATION_EXPIRED: 'health:authorization:expired',
  AUTHORIZATION_LOW_UNITS: 'health:authorization:low-units',
  AUTHORIZATION_RENEWAL_REQUESTED: 'health:authorization:renewal-requested',

  // Progress report events
  REPORT_GENERATED: 'health:report:generated',
  REPORT_SUBMITTED: 'health:report:submitted',
  REPORT_APPROVED: 'health:report:approved',
  REPORT_FINALIZED: 'health:report:finalized',
  PROGRESS_REPORT_GENERATED: 'health:progress-report:generated',
  PROGRESS_REPORT_SUBMITTED: 'health:progress-report:submitted',
  PROGRESS_REPORT_APPROVED: 'health:progress-report:approved',

  // Session events
  SESSION_LOGGED: 'health:session:logged',
  SESSION_UPDATED: 'health:session:updated',
  SESSION_DATA_RECORDED: 'health:session-data:recorded',

  // Scheduling events
  SCHEDULE_PUBLISHED: 'health:schedule:published',
  SCHEDULE_CONFLICT_DETECTED: 'health:schedule:conflict-detected',
  SCHEDULE_CONFLICT_RESOLVED: 'health:schedule:conflict-resolved',
  RBT_AVAILABILITY_UPDATED: 'health:rbt:availability-updated',
  SCHEDULE_AVAILABILITY_UPDATED: 'health:schedule:availability-updated',
  SCHEDULE_TIME_OFF_REQUESTED: 'health:schedule:time-off-requested',
  SCHEDULE_TIME_OFF_APPROVED: 'health:schedule:time-off-approved',
  SCHEDULE_TIME_OFF_ADDED: 'health:schedule:time-off-added',
  SCHEDULE_TIME_OFF_REMOVED: 'health:schedule:time-off-removed',
  SCHEDULE_OPTIMIZED: 'health:schedule:optimized',
  SCHEDULE_CREATED: 'health:schedule:created',
  SCHEDULE_UPDATED: 'health:schedule:updated',
  RBT_PROFILE_CREATED: 'health:rbt-profile:created',

  // Chatbot events
  CHAT_SESSION_STARTED: 'health:chat:session-started',
  CHAT_MESSAGE_RECEIVED: 'health:chat:message-received',
  CHAT_RESPONSE_SENT: 'health:chat:response-sent',
  CHAT_ESCALATED: 'health:chat:escalated',
  CHAT_SESSION_ENDED: 'health:chat:session-ended',

  // Compliance events
  AUDIT_LOG_CREATED: 'health:audit:log-created',
  AUDIT_LOGGED: 'health:audit:logged',
  AUDIT_FAILURE_LOGGED: 'health:audit:failure-logged',
  ACCESS_DENIED: 'health:access:denied',
  PHI_ACCESSED: 'health:phi:accessed',
  DATA_EXPORTED: 'health:data:exported',

  // Data retention events
  RETENTION_POLICY_UPDATED: 'health:retention:policy-updated',
  RETENTION_HOLD_PLACED: 'health:retention:hold-placed',
  RETENTION_HOLD_RELEASED: 'health:retention:hold-released',
  RETENTION_JOB_COMPLETED: 'health:retention:job-completed',

  // Insurance/billing events
  CLAIM_SUBMITTED: 'health:claim:submitted',
  CLAIM_ACCEPTED: 'health:claim:accepted',
  CLAIM_REJECTED: 'health:claim:rejected',
  CLAIM_PAID: 'health:claim:paid',
  AUTH_REQUEST_SUBMITTED: 'health:auth-request:submitted',
  AUTH_RESPONSE_RECEIVED: 'health:auth-response:received',

  // Provider events
  PROVIDER_CONNECTED: 'health:provider:connected',
  PROVIDER_DISCONNECTED: 'health:provider:disconnected',
  PROVIDER_ERROR: 'health:provider:error',
} as const;

export type HealthEventType = (typeof HEALTH_EVENTS)[keyof typeof HEALTH_EVENTS];

// =============================================================================
// Error Codes
// =============================================================================

export const HEALTH_ERROR_CODES = {
  // General errors
  NOT_INITIALIZED: 'HEALTH_NOT_INITIALIZED',
  INVALID_CONFIG: 'HEALTH_INVALID_CONFIG',
  NOT_FOUND: 'HEALTH_NOT_FOUND',
  ALREADY_EXISTS: 'HEALTH_ALREADY_EXISTS',
  VALIDATION_FAILED: 'HEALTH_VALIDATION_FAILED',

  // Patient errors
  PATIENT_NOT_FOUND: 'HEALTH_PATIENT_NOT_FOUND',
  PATIENT_INACTIVE: 'HEALTH_PATIENT_INACTIVE',
  PATIENT_NO_INSURANCE: 'HEALTH_PATIENT_NO_INSURANCE',
  PATIENT_NO_CONTACT: 'HEALTH_PATIENT_NO_CONTACT',

  // Appointment errors
  APPOINTMENT_NOT_FOUND: 'HEALTH_APPOINTMENT_NOT_FOUND',
  APPOINTMENT_CONFLICT: 'HEALTH_APPOINTMENT_CONFLICT',
  APPOINTMENT_PAST: 'HEALTH_APPOINTMENT_PAST',
  APPOINTMENT_CANCELLED: 'HEALTH_APPOINTMENT_CANCELLED',
  APPOINTMENT_NO_AUTH: 'HEALTH_APPOINTMENT_NO_AUTH',

  // Authorization errors
  AUTHORIZATION_NOT_FOUND: 'HEALTH_AUTHORIZATION_NOT_FOUND',
  AUTHORIZATION_EXPIRED: 'HEALTH_AUTHORIZATION_EXPIRED',
  AUTHORIZATION_NO_UNITS: 'HEALTH_AUTHORIZATION_NO_UNITS',
  AUTHORIZATION_INVALID_SERVICE: 'HEALTH_AUTHORIZATION_INVALID_SERVICE',

  // Notification errors
  NOTIFICATION_FAILED: 'HEALTH_NOTIFICATION_FAILED',
  NOTIFICATION_INVALID_CHANNEL: 'HEALTH_NOTIFICATION_INVALID_CHANNEL',
  NOTIFICATION_NO_RECIPIENT: 'HEALTH_NOTIFICATION_NO_RECIPIENT',

  // Scheduling errors
  RBT_NOT_FOUND: 'HEALTH_RBT_NOT_FOUND',
  RBT_NOT_AVAILABLE: 'HEALTH_RBT_NOT_AVAILABLE',
  RBT_OVERTIME: 'HEALTH_RBT_OVERTIME',
  SCHEDULE_CONFLICT: 'HEALTH_SCHEDULE_CONFLICT',

  // Chatbot errors
  CHAT_SESSION_NOT_FOUND: 'HEALTH_CHAT_SESSION_NOT_FOUND',
  CHAT_SESSION_CLOSED: 'HEALTH_CHAT_SESSION_CLOSED',
  INTENT_NOT_RECOGNIZED: 'HEALTH_INTENT_NOT_RECOGNIZED',
  FAQ_NOT_FOUND: 'HEALTH_FAQ_NOT_FOUND',

  // Compliance errors
  ACCESS_DENIED: 'HEALTH_ACCESS_DENIED',
  INSUFFICIENT_PERMISSIONS: 'HEALTH_INSUFFICIENT_PERMISSIONS',
  PHI_ACCESS_LOGGED: 'HEALTH_PHI_ACCESS_LOGGED',
  AUDIT_REQUIRED: 'HEALTH_AUDIT_REQUIRED',
  DATA_RETENTION_VIOLATION: 'HEALTH_DATA_RETENTION_VIOLATION',

  // Insurance/payer errors
  PAYER_NOT_FOUND: 'HEALTH_PAYER_NOT_FOUND',
  PAYER_NOT_SUPPORTED: 'HEALTH_PAYER_NOT_SUPPORTED',
  CLAIM_INVALID: 'HEALTH_CLAIM_INVALID',
  AUTH_REQUEST_FAILED: 'HEALTH_AUTH_REQUEST_FAILED',

  // Provider errors
  PROVIDER_ERROR: 'HEALTH_PROVIDER_ERROR',
  PROVIDER_AUTH_FAILED: 'HEALTH_PROVIDER_AUTH_FAILED',
  PROVIDER_RATE_LIMITED: 'HEALTH_PROVIDER_RATE_LIMITED',
  PROVIDER_TIMEOUT: 'HEALTH_PROVIDER_TIMEOUT',
  DOMAIN_NOT_ALLOWED: 'HEALTH_DOMAIN_NOT_ALLOWED',
} as const;

export type HealthErrorCode = (typeof HEALTH_ERROR_CODES)[keyof typeof HEALTH_ERROR_CODES];

// =============================================================================
// ABA Service Codes (CPT/HCPCS)
// =============================================================================

export const ABA_SERVICE_CODES = {
  '97151': {
    code: '97151',
    name: 'Behavior Identification Assessment',
    unitType: 'per-15-min' as const,
    minutesPerUnit: 15,
    description: 'Behavior identification assessment by physician or QHP, administered by technician',
    requiresSupervision: true,
    modifiers: ['HM', 'HN', 'HO'],
  },
  '97152': {
    code: '97152',
    name: 'Behavior Identification Supporting Assessment',
    unitType: 'per-15-min' as const,
    minutesPerUnit: 15,
    description: 'Behavior identification supporting assessment administered by technician under supervision',
    requiresSupervision: true,
    modifiers: ['HM', 'HN'],
  },
  '97153': {
    code: '97153',
    name: 'Adaptive Behavior Treatment by Protocol',
    unitType: 'per-15-min' as const,
    minutesPerUnit: 15,
    description: 'Adaptive behavior treatment by protocol, administered by technician under supervision',
    requiresSupervision: true,
    modifiers: ['HM', 'HN'],
  },
  '97154': {
    code: '97154',
    name: 'Group Adaptive Behavior Treatment',
    unitType: 'per-15-min' as const,
    minutesPerUnit: 15,
    description: 'Group adaptive behavior treatment with protocol modification, administered by technician',
    requiresSupervision: true,
    modifiers: ['HM', 'HN'],
  },
  '97155': {
    code: '97155',
    name: 'Adaptive Behavior Treatment with Protocol Modification',
    unitType: 'per-15-min' as const,
    minutesPerUnit: 15,
    description: 'Adaptive behavior treatment with protocol modification by QHP',
    requiresSupervision: false,
    modifiers: ['HM', 'HO'],
  },
  '97156': {
    code: '97156',
    name: 'Family Adaptive Behavior Treatment Guidance',
    unitType: 'per-15-min' as const,
    minutesPerUnit: 15,
    description: 'Family adaptive behavior treatment guidance by QHP',
    requiresSupervision: false,
    modifiers: ['HM', 'HO'],
  },
  '97157': {
    code: '97157',
    name: 'Multiple-Family Group Adaptive Behavior Treatment Guidance',
    unitType: 'per-15-min' as const,
    minutesPerUnit: 15,
    description: 'Multiple-family group adaptive behavior treatment guidance by QHP',
    requiresSupervision: false,
    modifiers: ['HM', 'HO'],
  },
  '97158': {
    code: '97158',
    name: 'Group Adaptive Behavior Treatment with Protocol Modification',
    unitType: 'per-15-min' as const,
    minutesPerUnit: 15,
    description: 'Group adaptive behavior treatment with protocol modification by QHP',
    requiresSupervision: false,
    modifiers: ['HM', 'HO'],
  },
  '0373T': {
    code: '0373T',
    name: 'Adaptive Behavior Treatment with Exposure',
    unitType: 'per-15-min' as const,
    minutesPerUnit: 15,
    description: 'Adaptive behavior treatment with exposure (code may be category III)',
    requiresSupervision: false,
    modifiers: ['HM', 'HO'],
  },
} as const;

export type ABAServiceCode = keyof typeof ABA_SERVICE_CODES;

// =============================================================================
// Defaults
// =============================================================================

export const HEALTH_DEFAULTS = {
  // Appointment reminders
  REMINDER_INTERVALS_MINUTES: [1440, 120], // 24 hours, 2 hours
  DEFAULT_APPOINTMENT_DURATION: 60, // minutes
  NO_SHOW_GRACE_PERIOD: 15, // minutes

  // Authorization alerts
  EXPIRING_THRESHOLD_30_DAYS: 30,
  EXPIRING_THRESHOLD_14_DAYS: 14,
  EXPIRING_THRESHOLD_7_DAYS: 7,
  UNITS_REMAINING_20_PERCENT: 0.2,
  UNITS_REMAINING_10_PERCENT: 0.1,

  // HIPAA compliance
  AUDIT_LOG_RETENTION_DAYS: 2190, // 6 years
  PATIENT_RECORD_RETENTION_YEARS: 7,
  PROGRESS_REPORT_RETENTION_YEARS: 7,
  CHAT_TRANSCRIPT_RETENTION_YEARS: 3,
  SESSION_TIMEOUT_MINUTES: 15,

  // Chatbot
  ESCALATION_CONFIDENCE_THRESHOLD: 0.3,
  MAX_RESPONSE_TIME_MS: 5000,
  SUPPORTED_LANGUAGES: ['en', 'es'],

  // Scheduling
  MAX_RBT_HOURS_PER_WEEK: 40,
  MIN_TRAVEL_TIME_MINUTES: 15,
  DEFAULT_TRAVEL_RADIUS_MILES: 25,

  // Provider
  RATE_LIMIT_PER_MINUTE: 60,
  API_TIMEOUT_MS: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
  RETRY_MULTIPLIER: 2,
  RETRY_MAX_DELAY_MS: 10000,
} as const;

// =============================================================================
// Access Control Matrix
// =============================================================================

export const ACCESS_LEVELS = {
  admin: ['*'],
  supervisor: [
    'patients:*',
    'appointments:*',
    'authorizations:*',
    'reports:*',
    'schedules:*',
    'sessions:*',
    'chat:read',
    'billing:read',
  ],
  rbt: [
    'patients:read',
    'appointments:read',
    'appointments:update',
    'sessions:*',
    'schedules:read',
  ],
  billing: [
    'patients:read',
    'authorizations:*',
    'billing:*',
    'reports:read',
  ],
  parent: [
    'patients:read:own',
    'appointments:read:own',
    'reports:read:own',
    'chat:*',
  ],
  readonly: [
    'patients:read',
    'appointments:read',
    'authorizations:read',
    'reports:read',
  ],
} as const;

// =============================================================================
// Payer Configuration
// =============================================================================

export const DEFAULT_PAYERS = {
  BCBS: {
    payerId: 'BCBS',
    payerName: 'Blue Cross Blue Shield',
    payerType: 'commercial' as const,
    clearinghouse: 'availity' as const,
  },
  AETNA: {
    payerId: 'AETNA',
    payerName: 'Aetna',
    payerType: 'commercial' as const,
    clearinghouse: 'availity' as const,
  },
  CIGNA: {
    payerId: 'CIGNA',
    payerName: 'Cigna',
    payerType: 'commercial' as const,
    clearinghouse: 'change-healthcare' as const,
  },
  UHC: {
    payerId: 'UHC',
    payerName: 'UnitedHealthcare',
    payerType: 'commercial' as const,
    clearinghouse: 'change-healthcare' as const,
  },
  MEDICAID: {
    payerId: 'MEDICAID',
    payerName: 'Medicaid',
    payerType: 'medicaid' as const,
    clearinghouse: 'direct' as const,
  },
} as const;

// =============================================================================
// Notification Templates
// =============================================================================

export const NOTIFICATION_TEMPLATES = {
  APPOINTMENT_REMINDER_24H: {
    id: 'appointment-reminder-24h',
    name: '24 Hour Appointment Reminder',
    sms: 'Reminder: {{patientFirstName}} has an appointment tomorrow at {{appointmentTime}} with {{rbtName}}. Reply CONFIRM to confirm or RESCHEDULE to request a new time.',
    email: {
      subject: 'Appointment Reminder for {{patientFirstName}} - Tomorrow',
      body: `
Dear {{contactName}},

This is a reminder that {{patientFirstName}} has an appointment scheduled for tomorrow:

Date: {{appointmentDate}}
Time: {{appointmentTime}}
Provider: {{rbtName}}
Location: {{location}}

Please click the link below to confirm your appointment:
{{confirmationLink}}

If you need to reschedule, please call us at {{clinicPhone}} or reply to this email.

Best regards,
{{clinicName}}
      `.trim(),
    },
  },
  APPOINTMENT_REMINDER_2H: {
    id: 'appointment-reminder-2h',
    name: '2 Hour Appointment Reminder',
    sms: 'Reminder: {{patientFirstName}}\'s appointment is in 2 hours at {{appointmentTime}}. Location: {{location}}',
    email: {
      subject: 'Appointment Reminder - {{patientFirstName}} in 2 Hours',
      body: `
Dear {{contactName}},

This is a reminder that {{patientFirstName}}'s appointment is coming up in 2 hours:

Time: {{appointmentTime}}
Provider: {{rbtName}}
Location: {{location}}

See you soon!

{{clinicName}}
      `.trim(),
    },
  },
  AUTHORIZATION_EXPIRING_30: {
    id: 'auth-expiring-30',
    name: 'Authorization Expiring in 30 Days',
    sms: 'Alert: {{patientFirstName}}\'s insurance authorization expires in 30 days on {{expirationDate}}. Please contact us to initiate renewal.',
    email: {
      subject: 'Authorization Expiring Soon - {{patientFirstName}}',
      body: `
Dear {{contactName}},

This is to inform you that {{patientFirstName}}'s insurance authorization for ABA therapy will expire in 30 days on {{expirationDate}}.

Current Authorization Details:
- Authorization #: {{authNumber}}
- Units Remaining: {{unitsRemaining}}
- Service: {{serviceName}}

To ensure uninterrupted services, we will begin the renewal process. Please ensure all required documentation is up to date.

If you have any questions, please contact us at {{clinicPhone}}.

Best regards,
{{clinicName}}
      `.trim(),
    },
  },
  AUTHORIZATION_LOW_UNITS: {
    id: 'auth-low-units',
    name: 'Authorization Low Units Alert',
    sms: 'Alert: {{patientFirstName}} has only {{unitsRemaining}} units ({{percentRemaining}}%) remaining on authorization. Contact us to discuss renewal.',
    email: {
      subject: 'Low Authorization Units - {{patientFirstName}}',
      body: `
Dear {{contactName}},

This is to inform you that {{patientFirstName}}'s authorization is running low on units.

Current Status:
- Units Remaining: {{unitsRemaining}} of {{totalUnits}} ({{percentRemaining}}%)
- Authorization #: {{authNumber}}
- Expires: {{expirationDate}}

We recommend requesting additional units or renewal soon to avoid service interruption.

Please contact us at {{clinicPhone}} if you have any questions.

Best regards,
{{clinicName}}
      `.trim(),
    },
  },
  NO_SHOW_NOTIFICATION: {
    id: 'no-show',
    name: 'No Show Notification',
    sms: '{{patientFirstName}} was marked as a no-show for today\'s appointment at {{appointmentTime}}. Please call {{clinicPhone}} to reschedule.',
    email: {
      subject: 'Missed Appointment - {{patientFirstName}}',
      body: `
Dear {{contactName}},

We noticed that {{patientFirstName}} did not attend the scheduled appointment today:

Date: {{appointmentDate}}
Time: {{appointmentTime}}
Provider: {{rbtName}}

Consistent attendance is important for treatment progress. Please contact us at {{clinicPhone}} to reschedule.

If there was an emergency or extenuating circumstances, please let us know.

Best regards,
{{clinicName}}
      `.trim(),
    },
  },
} as const;

// =============================================================================
// FAQ Categories and Default Entries
// =============================================================================

export const DEFAULT_FAQ_ENTRIES = [
  {
    category: 'scheduling' as const,
    questions: [
      'How do I reschedule an appointment?',
      'Can I change my appointment time?',
      'How to reschedule',
    ],
    answer: 'You can reschedule an appointment by replying to your confirmation text with "RESCHEDULE", calling our office at the number on your confirmation, or using the patient portal. Please provide at least 24 hours notice when possible to avoid cancellation fees.',
    keywords: ['reschedule', 'change', 'appointment', 'time', 'cancel'],
    priority: 100,
  },
  {
    category: 'scheduling' as const,
    questions: [
      'What is the cancellation policy?',
      'Do you charge for cancellations?',
      'Cancel appointment fee',
    ],
    answer: 'We require 24 hours notice for cancellations. Late cancellations (less than 24 hours) or no-shows may result in a fee of up to $50. Please contact us as soon as possible if you need to cancel.',
    keywords: ['cancel', 'cancellation', 'fee', 'policy', 'no-show'],
    priority: 95,
  },
  {
    category: 'insurance' as const,
    questions: [
      'What insurance do you accept?',
      'Do you take my insurance?',
      'Insurance coverage',
    ],
    answer: 'We accept most major insurance plans including Blue Cross Blue Shield, Aetna, Cigna, UnitedHealthcare, and many Medicaid plans. Please contact our billing department with your insurance information for verification.',
    keywords: ['insurance', 'accept', 'coverage', 'plan', 'BCBS', 'Aetna', 'Cigna', 'UHC', 'Medicaid'],
    priority: 90,
  },
  {
    category: 'insurance' as const,
    questions: [
      'What is an authorization?',
      'Why do I need prior authorization?',
      'Insurance authorization explained',
    ],
    answer: 'An authorization is approval from your insurance company for ABA therapy services. Most insurance plans require prior authorization before they will cover treatment. We handle the authorization process, but it typically takes 1-2 weeks to receive approval.',
    keywords: ['authorization', 'prior auth', 'approval', 'insurance', 'coverage'],
    priority: 85,
  },
  {
    category: 'treatment' as const,
    questions: [
      'What is ABA therapy?',
      'How does ABA work?',
      'Explain ABA treatment',
    ],
    answer: 'ABA (Applied Behavior Analysis) is an evidence-based therapy that uses positive reinforcement to increase helpful behaviors and decrease challenging ones. Treatment is individualized based on assessment results and focuses on communication, social skills, daily living, and behavior management.',
    keywords: ['ABA', 'therapy', 'treatment', 'behavior', 'analysis'],
    priority: 100,
  },
  {
    category: 'treatment' as const,
    questions: [
      'How long are ABA sessions?',
      'What is the session duration?',
      'How many hours of ABA?',
    ],
    answer: 'ABA session length varies based on your child\'s treatment plan, typically ranging from 2-6 hours per session. Most children receive 20-40 hours of therapy per week. Your BCBA will recommend the appropriate intensity based on assessment results and treatment goals.',
    keywords: ['hours', 'session', 'duration', 'length', 'time', 'weekly'],
    priority: 80,
  },
  {
    category: 'treatment' as const,
    questions: [
      'Who is my child\'s therapist?',
      'What is an RBT?',
      'Who provides ABA therapy?',
    ],
    answer: 'Your child\'s primary therapist is a Registered Behavior Technician (RBT). RBTs are trained professionals who implement the treatment plan under the supervision of a Board Certified Behavior Analyst (BCBA). The BCBA oversees the program, conducts assessments, and makes treatment recommendations.',
    keywords: ['RBT', 'BCBA', 'therapist', 'provider', 'technician', 'analyst'],
    priority: 75,
  },
  {
    category: 'billing' as const,
    questions: [
      'How much does ABA therapy cost?',
      'What are the fees?',
      'ABA therapy price',
    ],
    answer: 'ABA therapy costs vary depending on insurance coverage and treatment hours. Most families pay only their insurance copay or coinsurance. For those without insurance, we can discuss self-pay rates and payment plans. Contact our billing department for specific cost information.',
    keywords: ['cost', 'fee', 'price', 'payment', 'copay', 'self-pay'],
    priority: 70,
  },
  {
    category: 'general' as const,
    questions: [
      'What should I bring to appointments?',
      'How to prepare for sessions?',
      'Appointment preparation',
    ],
    answer: 'Please ensure your child is well-rested and has eaten before sessions. Bring any preferred snacks or toys that can be used as reinforcers. Dress your child in comfortable clothes appropriate for active play. Also bring any communication devices or comfort items they use regularly.',
    keywords: ['bring', 'prepare', 'preparation', 'appointment', 'session'],
    priority: 65,
  },
  {
    category: 'emergency' as const,
    questions: [
      'What if my child is sick?',
      'Sick day policy',
      'Can\'t attend due to illness',
    ],
    answer: 'If your child is sick, please do not bring them to session to prevent spreading illness. Contact us as soon as possible to cancel. Sick cancellations with reasonable notice do not incur fees. If your child shows symptoms during a session, we will contact you for pickup.',
    keywords: ['sick', 'illness', 'health', 'fever', 'contagious'],
    priority: 100,
  },
  {
    category: 'policies' as const,
    questions: [
      'What are your privacy policies?',
      'How is my information protected?',
      'HIPAA and privacy',
    ],
    answer: 'We take your privacy seriously and comply with all HIPAA regulations. Your child\'s information is only shared with authorized providers and insurance companies as needed for treatment and billing. You can request a copy of our full privacy policy at any time.',
    keywords: ['privacy', 'HIPAA', 'confidential', 'information', 'protect', 'security'],
    priority: 60,
  },
] as const;

// =============================================================================
// Diagnosis Codes (Common Autism Spectrum)
// =============================================================================

export const AUTISM_DIAGNOSIS_CODES = {
  'F84.0': 'Autistic disorder',
  'F84.2': 'Rett syndrome',
  'F84.3': 'Other childhood disintegrative disorder',
  'F84.5': 'Asperger syndrome',
  'F84.8': 'Other pervasive developmental disorders',
  'F84.9': 'Pervasive developmental disorder, unspecified',
} as const;

// =============================================================================
// Place of Service Codes
// =============================================================================

export const PLACE_OF_SERVICE_CODES = {
  '02': 'Telehealth',
  '03': 'School',
  '11': 'Office',
  '12': 'Home',
  '99': 'Other',
} as const;

// =============================================================================
// Modifier Codes
// =============================================================================

export const MODIFIER_CODES = {
  HM: 'Less than bachelor\'s degree level (RBT)',
  HN: 'Bachelor\'s degree level',
  HO: 'Master\'s degree level (BCBA)',
  HP: 'Doctoral level',
  GT: 'Via interactive audio and video telecommunications systems (telehealth)',
  '95': 'Synchronous telemedicine service',
  '59': 'Distinct procedural service',
  XE: 'Separate encounter',
  XS: 'Separate structure',
  XP: 'Separate practitioner',
  XU: 'Unusual non-overlapping service',
} as const;
