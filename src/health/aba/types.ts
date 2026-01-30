/**
 * Healthcare/ABA Module Type Definitions
 *
 * Comprehensive type definitions for Applied Behavior Analysis (ABA) healthcare
 * module including patients, appointments, authorizations, progress reports,
 * scheduling, chatbot, and HIPAA compliance.
 */

// =============================================================================
// Common Types
// =============================================================================

/** Unique identifiers */
export type PatientId = string;
export type AppointmentId = string;
export type AuthorizationId = string;
export type RBTId = string;
export type ReportId = string;
export type SessionId = string;
export type ChatSessionId = string;

/** Type aliases for compatibility */
export type ProgressReportId = ReportId;
export type SessionDataId = SessionId;
export type RBTProfileId = RBTId;
export type ScheduleId = string;
export type FAQEntryId = string;

/** Timestamps in milliseconds since epoch */
export type Timestamp = number;

// =============================================================================
// Storage Types
// =============================================================================

/**
 * Key-value store adapter interface for ABA stores
 * This provides a simple interface for storing and retrieving data by key
 */
export interface KeyValueStoreAdapter {
  /** Get a value by key */
  get<T>(key: string): Promise<T | null>;
  /** Set a value by key */
  set<T>(key: string, value: T): Promise<void>;
  /** Delete a value by key */
  delete(key: string): Promise<boolean>;
  /** Check if a key exists */
  has(key: string): Promise<boolean>;
  /** Get all keys matching a prefix */
  keys(prefix?: string): Promise<string[]>;
}

// =============================================================================
// Patient Types
// =============================================================================

/**
 * Contact preference for notifications
 */
export type ContactPreference = 'sms' | 'email' | 'voice' | 'all';

/**
 * Patient contact (parent/guardian/caregiver)
 */
export interface PatientContact {
  /** Contact ID */
  id: string;
  /** Relationship to patient */
  relationship: 'parent' | 'guardian' | 'caregiver' | 'self' | 'other';
  /** First name */
  firstName: string;
  /** Last name */
  lastName: string;
  /** Primary phone number */
  phone: string;
  /** Email address */
  email?: string;
  /** Preferred contact method */
  preferredContact: ContactPreference;
  /** Is primary contact */
  isPrimary: boolean;
  /** Preferred language */
  language: string;
  /** Can receive PHI */
  canReceivePHI: boolean;
  /** HIPAA authorization on file */
  hipaaAuthOnFile: boolean;
}

/**
 * Insurance information for a patient
 */
export interface InsuranceInfo {
  /** Payer ID */
  payerId: string;
  /** Payer name */
  payerName: string;
  /** Member/subscriber ID */
  memberId: string;
  /** Group number */
  groupNumber?: string;
  /** Plan name */
  planName?: string;
  /** Subscriber relationship */
  subscriberRelationship: 'self' | 'spouse' | 'child' | 'other';
  /** Subscriber name (if different from patient) */
  subscriberName?: string;
  /** Subscriber date of birth */
  subscriberDOB?: Timestamp;
  /** Policy effective date */
  effectiveDate: Timestamp;
  /** Policy termination date */
  terminationDate?: Timestamp;
  /** Is primary insurance */
  isPrimary: boolean;
  /** Co-pay amount */
  copay?: number;
  /** Co-insurance percentage */
  coinsurance?: number;
  /** Prior authorization required */
  priorAuthRequired: boolean;
}

/**
 * Patient record
 */
export interface Patient {
  /** Patient ID */
  id: PatientId;
  /** User ID (for multi-tenancy) */
  userId: string;
  /** First name */
  firstName: string;
  /** Last name */
  lastName: string;
  /** Date of birth */
  dateOfBirth: Timestamp;
  /** Gender */
  gender: 'male' | 'female' | 'other' | 'unknown';
  /** Medical record number */
  mrn?: string;
  /** Diagnosis codes (ICD-10) */
  diagnosisCodes: string[];
  /** Primary diagnosis description */
  primaryDiagnosis?: string;
  /** Address */
  address?: {
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  /** Contacts (parents/guardians) */
  contacts: PatientContact[];
  /** Insurance information */
  insurance: InsuranceInfo[];
  /** Patient status */
  status: 'active' | 'inactive' | 'discharged' | 'on-hold';
  /** Treatment start date */
  treatmentStartDate?: Timestamp;
  /** Assigned BCBA (supervisor) */
  assignedBCBA?: string;
  /** Assigned RBT (therapist) */
  assignedRbt?: RBTId;
  /** Notes */
  notes?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Created timestamp */
  createdAt: Timestamp;
  /** Updated timestamp */
  updatedAt: Timestamp;
}

// =============================================================================
// Appointment Types
// =============================================================================

/**
 * Appointment status
 */
export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in-progress'
  | 'completed'
  | 'no-show'
  | 'cancelled'
  | 'rescheduled';

/**
 * Appointment type
 */
export type AppointmentType =
  | 'assessment'
  | 'treatment'
  | 'supervision'
  | 'parent-training'
  | 'team-meeting'
  | 'telehealth'
  | 'make-up';

/**
 * Location type
 */
export type LocationType = 'home' | 'clinic' | 'school' | 'community' | 'telehealth';

/**
 * Appointment reminder record
 */
export interface AppointmentReminder {
  /** Reminder ID */
  id: string;
  /** Appointment ID */
  appointmentId: AppointmentId;
  /** Channel used */
  channel: 'sms' | 'email' | 'voice';
  /** Scheduled send time */
  scheduledAt: Timestamp;
  /** Actual sent time */
  sentAt?: Timestamp;
  /** Delivery status */
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  /** Error message if failed */
  error?: string;
  /** Message content (redacted for HIPAA) */
  messageTemplate: string;
}

/**
 * Reminder confirmation response
 */
export interface ReminderConfirmation {
  /** Confirmation ID */
  id: string;
  /** Appointment ID */
  appointmentId: AppointmentId;
  /** Reminder ID that prompted this */
  reminderId: string;
  /** Response type */
  response: 'confirmed' | 'reschedule-requested' | 'cancelled';
  /** Response method */
  responseMethod: 'sms-reply' | 'email-link' | 'voice-keypress' | 'manual';
  /** Received timestamp */
  receivedAt: Timestamp;
  /** Raw response content */
  rawResponse?: string;
  /** Notes */
  notes?: string;
}

/**
 * Scheduled appointment
 */
export interface Appointment {
  /** Appointment ID */
  id: AppointmentId;
  /** User ID (for multi-tenancy) */
  userId: string;
  /** Patient ID */
  patientId: PatientId;
  /** Assigned RBT ID */
  rbtId?: RBTId;
  /** Supervising BCBA ID */
  bcbaId?: string;
  /** Appointment type */
  type: AppointmentType;
  /** Service code (CPT) */
  serviceCode: string;
  /** Start time */
  startTime: Timestamp;
  /** End time */
  endTime: Timestamp;
  /** Duration in minutes */
  durationMinutes: number;
  /** Location type */
  locationType: LocationType;
  /** Location address (if applicable) */
  locationAddress?: string;
  /** Status */
  status: AppointmentStatus;
  /** Authorization ID being used */
  authorizationId?: AuthorizationId;
  /** Units to bill */
  unitsToBill?: number;
  /** Reminders sent */
  reminders: AppointmentReminder[];
  /** Confirmation received */
  confirmation?: ReminderConfirmation;
  /** Check-in time */
  checkedInAt?: Timestamp;
  /** Check-out time */
  checkedOutAt?: Timestamp;
  /** Session notes */
  sessionNotes?: string;
  /** Cancellation reason */
  cancellationReason?: string;
  /** No-show reason */
  noShowReason?: string;
  /** Recurring appointment ID (if part of series) */
  recurringSeriesId?: string;
  /** Created timestamp */
  createdAt: Timestamp;
  /** Updated timestamp */
  updatedAt: Timestamp;
}

// =============================================================================
// Authorization Types
// =============================================================================

/**
 * Authorization status
 */
export type AuthorizationStatus =
  | 'pending'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'expiring-soon';

/**
 * Service code definition (CPT/HCPCS)
 */
export interface ServiceCode {
  /** CPT/HCPCS code */
  code: string;
  /** Service name */
  name: string;
  /** Unit definition */
  unitType: 'per-15-min' | 'per-hour' | 'per-session' | 'per-day';
  /** Minutes per unit (if time-based) */
  minutesPerUnit?: number;
  /** Description */
  description: string;
  /** Requires supervision */
  requiresSupervision: boolean;
  /** Modifier codes */
  modifiers?: string[];
}

/**
 * Authorization alert
 */
export interface AuthorizationAlert {
  /** Alert ID */
  id: string;
  /** Authorization ID */
  authorizationId: AuthorizationId;
  /** Alert type */
  type: 'expiring' | 'low-units' | 'expired' | 'denied';
  /** Severity */
  severity: 'info' | 'warning' | 'critical';
  /** Alert message */
  message: string;
  /** Days until expiration (for expiring alerts) */
  daysUntilExpiration?: number;
  /** Percentage of units remaining (for low-units alerts) */
  unitsRemainingPercent?: number;
  /** Created timestamp */
  createdAt: Timestamp;
  /** Acknowledged timestamp */
  acknowledgedAt?: Timestamp;
  /** Acknowledged by */
  acknowledgedBy?: string;
}

/**
 * Insurance authorization
 */
export interface Authorization {
  /** Authorization ID */
  id: AuthorizationId;
  /** User ID (for multi-tenancy) */
  userId: string;
  /** Patient ID */
  patientId: PatientId;
  /** Payer ID */
  payerId: string;
  /** Payer name */
  payerName: string;
  /** Authorization number from payer */
  authorizationNumber: string;
  /** Service code authorized */
  serviceCode: string;
  /** Service description */
  serviceDescription: string;
  /** Total units authorized */
  totalUnits: number;
  /** Units used */
  usedUnits: number;
  /** Units remaining */
  remainingUnits: number;
  /** Unit type */
  unitType: 'per-15-min' | 'per-hour' | 'per-session';
  /** Start date */
  startDate: Timestamp;
  /** End date */
  endDate: Timestamp;
  /** Status */
  status: AuthorizationStatus;
  /** Frequency limit (e.g., max units per week) */
  frequencyLimit?: {
    maxUnits: number;
    period: 'day' | 'week' | 'month';
  };
  /** Renewal requested */
  renewalRequested: boolean;
  /** Renewal request date */
  renewalRequestDate?: Timestamp;
  /** Alerts */
  alerts: AuthorizationAlert[];
  /** Notes */
  notes?: string;
  /** Attached documents */
  documents?: Array<{
    id: string;
    name: string;
    type: string;
    uploadedAt: Timestamp;
  }>;
  /** Created timestamp */
  createdAt: Timestamp;
  /** Updated timestamp */
  updatedAt: Timestamp;
}

// =============================================================================
// Progress Report Types
// =============================================================================

/**
 * Goal status
 */
export type GoalStatus = 'not-started' | 'in-progress' | 'mastered' | 'on-hold' | 'discontinued';

/**
 * Behavior goal in treatment plan
 */
export interface BehaviorGoal {
  /** Goal ID */
  id: string;
  /** Goal name/title */
  name: string;
  /** Goal description */
  description: string;
  /** Domain */
  domain: 'communication' | 'social' | 'daily-living' | 'behavior-reduction' | 'academic' | 'motor' | 'play';
  /** Baseline measure */
  baseline: {
    value: number;
    unit: string;
    date: Timestamp;
  };
  /** Target criteria */
  target: {
    value: number;
    unit: string;
    criteria: string; // e.g., "80% accuracy across 3 consecutive sessions"
  };
  /** Current progress */
  current: {
    value: number;
    unit: string;
    date: Timestamp;
  };
  /** Progress percentage */
  progressPercent: number;
  /** Status */
  status: GoalStatus;
  /** Teaching procedures */
  teachingProcedures?: string[];
  /** Data collection method */
  dataCollectionMethod: 'frequency' | 'duration' | 'latency' | 'percentage' | 'trial-by-trial' | 'interval';
  /** Short-term objectives */
  shortTermObjectives?: Array<{
    id: string;
    description: string;
    targetDate: Timestamp;
    status: GoalStatus;
  }>;
}

/**
 * Session data for aggregation
 */
export interface SessionData {
  /** Session ID */
  id: SessionId;
  /** User ID */
  userId: string;
  /** Patient ID */
  patientId: PatientId;
  /** Appointment ID */
  appointmentId?: AppointmentId;
  /** Session date */
  sessionDate: Timestamp;
  /** Session start time */
  startTime: Timestamp;
  /** Session end time */
  endTime: Timestamp;
  /** Duration in minutes */
  durationMinutes: number;
  /** Service code */
  serviceCode: string;
  /** RBT ID */
  rbtId: RBTId;
  /** Goals worked on */
  goalsWorked: Array<{
    goalId: string;
    trials?: number;
    correct?: number;
    prompted?: number;
    independent?: number;
    percentage?: number;
    duration?: number;
    frequency?: number;
    notes?: string;
  }>;
  /** Problem behaviors */
  problemBehaviors?: Array<{
    behaviorName: string;
    frequency: number;
    duration?: number;
    intensity?: 'mild' | 'moderate' | 'severe';
    antecedent?: string;
    consequence?: string;
  }>;
  /** Overall session notes */
  notes: string;
  /** Parent/caregiver present */
  caregiverPresent: boolean;
  /** Caregiver involvement level */
  caregiverInvolvement?: 'observed' | 'participated' | 'trained';
  /** Reinforcers used */
  reinforcersUsed?: string[];
  /** Environmental factors */
  environmentalFactors?: string;
  /** Session quality rating */
  qualityRating?: 1 | 2 | 3 | 4 | 5;
  /** ID of the report this session is included in */
  includedInReportId?: ReportId;
  /** Created timestamp */
  createdAt: Timestamp;
  /** Updated timestamp */
  updatedAt: Timestamp;
}

/**
 * Report template
 */
export interface ReportTemplate {
  /** Template ID */
  id: string;
  /** Template name */
  name: string;
  /** Template type */
  type: 'progress' | 'assessment' | 'discharge' | 'treatment-plan';
  /** Sections to include */
  sections: Array<{
    id: string;
    name: string;
    required: boolean;
    order: number;
  }>;
  /** Default content/prompts */
  defaultContent?: Record<string, string>;
  /** Is default template */
  isDefault: boolean;
  /** Created timestamp */
  createdAt: Timestamp;
}

/**
 * Simplified goal summary for reports
 */
export interface ReportGoalSummary {
  /** Goal ID */
  id: string;
  /** Goal name */
  name: string;
  /** Goal domain */
  domain?: string;
  /** Goal type */
  type?: string;
  /** Baseline value */
  baselineValue?: number;
  /** Target value */
  targetValue?: number;
  /** Current value */
  currentValue?: number;
  /** Goal status */
  status: 'active' | 'mastered' | 'discontinued' | 'on-hold' | GoalStatus;
}

/**
 * Generated progress report
 */
export interface ProgressReport {
  /** Report ID */
  id: ReportId;
  /** User ID */
  userId: string;
  /** Patient ID */
  patientId: PatientId;
  /** Report type */
  type: 'progress' | 'assessment' | 'discharge' | 'treatment-plan';
  /** Template used */
  templateId?: string;
  /** Reporting period start */
  periodStart: Timestamp;
  /** Reporting period end */
  periodEnd: Timestamp;
  /** Report title */
  title: string;
  /** Author ID */
  authorId: string;
  /** Author name */
  authorName: string;
  /** Author credentials */
  authorCredentials: string;
  /** Status */
  status: 'draft' | 'submitted' | 'pending-review' | 'approved' | 'rejected' | 'final';
  /** Submitted timestamp */
  submittedAt?: Timestamp;
  /** Submitted by user ID */
  submittedBy?: string;
  /** Approved timestamp */
  approvedAt?: Timestamp;
  /** Approved by user ID */
  approvedBy?: string;
  /** Rejected timestamp */
  rejectedAt?: Timestamp;
  /** Rejected by user ID */
  rejectedBy?: string;
  /** Rejection reason */
  rejectionReason?: string;
  /** Patient demographics summary */
  demographics: {
    name: string;
    dob: Timestamp;
    age: string;
    diagnosis: string[];
  };
  /** Goals summary */
  goals: BehaviorGoal[] | ReportGoalSummary[];
  /** Session summary */
  sessionSummary: {
    totalSessions: number;
    totalHours: number;
    attendanceRate: number;
    sessionsPerWeek?: number;
    sessionTypes?: Record<string, number>;
  };
  /** Aggregated data */
  aggregatedData: {
    goalProgress: Array<{
      goalId: string;
      goalName: string;
      startValue: number;
      endValue: number;
      changePercent: number;
      trend: 'improving' | 'stable' | 'declining';
    }>;
    behaviorSummary?: Array<{
      behaviorName: string;
      startFrequency: number;
      endFrequency: number;
      changePercent: number;
      trend: 'improving' | 'stable' | 'worsening';
    }>;
  };
  /** Clinical impressions */
  clinicalImpressions: string;
  /** Recommendations */
  recommendations: string[];
  /** Treatment plan changes */
  treatmentPlanChanges?: string;
  /** Next reporting period goals */
  nextPeriodGoals?: string[];
  /** Signatures */
  signatures?: Array<{
    signerId: string;
    signerName: string;
    signerCredentials: string;
    signedAt: Timestamp;
  }>;
  /** Generated timestamp */
  generatedAt: Timestamp;
  /** Finalized timestamp */
  finalizedAt?: Timestamp;
  /** Generated HTML content */
  content?: string;
  /** Report metadata */
  metadata?: Record<string, unknown>;
  /** Created timestamp */
  createdAt: Timestamp;
  /** Updated timestamp */
  updatedAt: Timestamp;
}

// =============================================================================
// Scheduling Types
// =============================================================================

/**
 * RBT certification status
 */
export type CertificationStatus = 'active' | 'pending' | 'expired' | 'suspended';

/**
 * RBT staff profile
 */
export interface RBTProfile {
  /** RBT ID */
  id: RBTId;
  /** User ID */
  userId: string;
  /** First name */
  firstName: string;
  /** Last name */
  lastName: string;
  /** Email */
  email: string;
  /** Phone */
  phone: string;
  /** RBT certification number */
  certificationNumber?: string;
  /** Certification status */
  certificationStatus: CertificationStatus;
  /** Certification expiration */
  certificationExpiration?: Timestamp;
  /** Supervising BCBA ID */
  supervisorId?: string;
  /** Employment status */
  status: 'active' | 'inactive' | 'on-leave';
  /** Hire date */
  hireDate: Timestamp;
  /** Hourly rate */
  hourlyRate?: number;
  /** Skills/specializations */
  skills?: string[];
  /** Preferred age groups */
  preferredAgeGroups?: Array<'toddler' | 'child' | 'adolescent' | 'adult'>;
  /** Languages spoken */
  languages: string[];
  /** Max hours per week */
  maxHoursPerWeek: number;
  /** Home location (for travel optimization) */
  homeLocation?: {
    lat: number;
    lng: number;
    address: string;
  };
  /** Travel radius in miles */
  travelRadiusMiles?: number;
  /** Service areas (cities/zones this RBT can work in) */
  serviceAreas?: string[];
  /** Notes */
  notes?: string;
  /** Created timestamp */
  createdAt: Timestamp;
  /** Updated timestamp */
  updatedAt: Timestamp;
}

/**
 * Availability slot
 */
export interface AvailabilitySlot {
  /** Slot ID */
  id: string;
  /** RBT ID */
  rbtId: RBTId;
  /** Day of week (0 = Sunday) */
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Start time (minutes from midnight, 0-1440) */
  startTime: number;
  /** End time (minutes from midnight, 0-1440) */
  endTime: number;
  /** Location preferences */
  locationPreferences?: LocationType[];
  /** Recurring or specific date */
  isRecurring: boolean;
  /** Specific date (if not recurring) */
  specificDate?: Timestamp;
  /** Effective start date (for recurring) */
  effectiveFrom?: Timestamp;
  /** Effective end date (for recurring) */
  effectiveUntil?: Timestamp;
}

/**
 * Schedule conflict
 */
export interface ScheduleConflict {
  /** Conflict ID */
  id: string;
  /** Schedule ID that this conflict belongs to */
  scheduleId?: string;
  /** RBT ID */
  rbtId?: RBTId;
  /** Type of conflict */
  type: 'double-booking' | 'travel-time' | 'overtime' | 'certification-gap' | 'patient-preference' | 'appointment-overlap' | 'authorization-missing' | 'authorization-exceeded';
  /** Severity */
  severity: 'error' | 'warning';
  /** Description */
  description: string;
  /** Affected appointment IDs */
  affectedAppointments?: AppointmentId[];
  /** Affected RBT IDs */
  affectedRBTs?: RBTId[];
  /** Conflicting assignments (for scheduling conflicts) */
  conflictingAssignments?: ScheduleAssignment[];
  /** Suggested resolution */
  suggestedResolution?: string;
  /** Detected timestamp */
  detectedAt?: Timestamp;
  /** Created timestamp */
  createdAt?: Timestamp;
  /** Resolved */
  resolved?: boolean;
  /** Resolved timestamp */
  resolvedAt?: Timestamp;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * RBT weekly schedule
 */
export interface RBTSchedule {
  /** Schedule ID */
  id: string;
  /** User ID */
  userId: string;
  /** RBT ID */
  rbtId: RBTId;
  /** Week start date (Monday) */
  weekStart: Timestamp;
  /** Week end date (Sunday) */
  weekEnd: Timestamp;
  /** Assigned appointments */
  appointments: AppointmentId[];
  /** Schedule assignments */
  assignments: ScheduleAssignment[];
  /** Total scheduled hours */
  scheduledHours: number;
  /** Total available hours */
  availableHours: number;
  /** Utilization percentage */
  utilizationPercent: number;
  /** Conflicts detected */
  conflicts: ScheduleConflict[];
  /** Travel estimates */
  travelEstimates?: {
    totalMiles: number;
    totalMinutes: number;
  };
  /** Status */
  status: 'draft' | 'published' | 'modified';
  /** Published timestamp */
  publishedAt?: Timestamp;
  /** Last modified */
  lastModified: Timestamp;
  /** Created timestamp */
  createdAt: Timestamp;
  /** Updated timestamp */
  updatedAt: Timestamp;
}

// =============================================================================
// Chatbot Types
// =============================================================================

/**
 * FAQ entry category
 */
export type FAQCategory =
  | 'insurance'
  | 'scheduling'
  | 'treatment'
  | 'billing'
  | 'general'
  | 'emergency'
  | 'policies';

/**
 * FAQ knowledge base entry
 */
export interface FAQEntry {
  /** FAQ ID */
  id: string;
  /** User ID (for custom FAQs) */
  userId?: string;
  /** Category */
  category: FAQCategory;
  /** Question variations (for matching) */
  questions: string[];
  /** Answer */
  answer: string;
  /** Keywords for matching */
  keywords: string[];
  /** Is system FAQ (not user-customizable) */
  isSystem: boolean;
  /** Language */
  language: string;
  /** Priority (higher = preferred) */
  priority: number;
  /** Related FAQ IDs */
  relatedFAQs?: string[];
  /** Times matched */
  matchCount: number;
  /** Helpful votes */
  helpfulCount: number;
  /** Not helpful votes */
  notHelpfulCount: number;
  /** Active */
  active: boolean;
  /** Created timestamp */
  createdAt: Timestamp;
  /** Updated timestamp */
  updatedAt: Timestamp;
}

/**
 * Classified intent from user message
 */
export interface Intent {
  /** Intent name */
  name: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Extracted entities */
  entities?: Record<string, string | number>;
  /** Requires escalation */
  requiresEscalation: boolean;
  /** Escalation reason */
  escalationReason?: string;
}

/**
 * Chat message
 */
export interface ChatMessage {
  /** Message ID */
  id: string;
  /** Session ID */
  sessionId: ChatSessionId;
  /** Role */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
  /** Classified intent (for user messages) */
  intent?: Intent;
  /** Matched FAQ ID (for assistant messages) */
  matchedFAQId?: string;
  /** Confidence in response */
  confidence?: number;
  /** Was escalated */
  escalated: boolean;
  /** Escalation details */
  escalationDetails?: {
    reason: string;
    assignedTo?: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    resolvedAt?: Timestamp;
  };
  /** Timestamp */
  timestamp: Timestamp;
  /** Feedback received */
  feedback?: {
    helpful: boolean;
    comment?: string;
    feedbackAt: Timestamp;
  };
}

/**
 * Parent chat session
 */
export interface ChatSession {
  /** Session ID */
  id: ChatSessionId;
  /** User ID */
  userId: string;
  /** Patient ID (optional context) */
  patientId?: PatientId;
  /** Contact ID */
  contactId?: string;
  /** Contact name */
  contactName: string;
  /** Contact method */
  contactMethod: 'web' | 'sms' | 'email';
  /** Language */
  language: string;
  /** Messages */
  messages: ChatMessage[];
  /** Session started */
  startedAt: Timestamp;
  /** Last activity */
  lastActivityAt: Timestamp;
  /** Session ended */
  endedAt?: Timestamp;
  /** Status */
  status: 'active' | 'waiting' | 'escalated' | 'resolved' | 'closed';
  /** Satisfaction rating */
  satisfactionRating?: 1 | 2 | 3 | 4 | 5;
  /** Resolution status */
  resolutionStatus?: 'resolved' | 'unresolved' | 'escalated';
  /** Tags */
  tags?: string[];
}

// =============================================================================
// HIPAA Compliance Types
// =============================================================================

/**
 * Audit action types
 */
export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'export'
  | 'share'
  | 'print'
  | 'login'
  | 'logout'
  | 'access-denied';

/**
 * Access level / role
 */
export type AccessLevel = 'admin' | 'supervisor' | 'rbt' | 'billing' | 'parent' | 'readonly';

/**
 * Resource types for access control
 */
export type ResourceType =
  | 'patient'
  | 'appointment'
  | 'authorization'
  | 'progress-report'
  | 'session-data'
  | 'schedule'
  | 'chat'
  | 'audit-log'
  | 'billing'
  | 'user';

/**
 * HIPAA audit log entry
 */
export interface HealthAuditLog {
  /** Event ID */
  id: string;
  /** Timestamp */
  timestamp: Timestamp;
  /** Actor information */
  actor: {
    userId: string;
    userName?: string;
    role: AccessLevel;
    sessionId?: string;
    ipAddressHash: string; // Hashed for privacy
  };
  /** Action performed */
  action: AuditAction;
  /** Resource accessed */
  resource: {
    type: ResourceType;
    id: string;
    patientId?: PatientId; // For patient-related resources
    description?: string;
  };
  /** Access method */
  accessMethod: 'api' | 'ui' | 'export' | 'report' | 'system';
  /** Outcome */
  outcome: 'success' | 'failure' | 'denied';
  /** Reason for denial (if denied) */
  denialReason?: string;
  /** PHI accessed */
  phiAccessed: boolean;
  /** Fields accessed (for granular logging) */
  fieldsAccessed?: string[];
  /** Changes made (for updates) */
  changes?: {
    field: string;
    oldValue?: unknown;
    newValue?: unknown;
  }[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Data retention policy
 */
export interface DataRetentionPolicy {
  /** Policy ID */
  id: string;
  /** Resource type */
  resourceType: ResourceType;
  /** Retention period in days */
  retentionDays: number;
  /** Can be extended */
  canExtend: boolean;
  /** Deletion method */
  deletionMethod: 'hard-delete' | 'anonymize' | 'archive';
  /** Legal hold override */
  legalHoldApplies: boolean;
  /** Description */
  description: string;
}

/**
 * Access control rule
 */
export interface AccessControlRule {
  /** Rule ID */
  id: string;
  /** Role */
  role: AccessLevel;
  /** Resource type */
  resourceType: ResourceType;
  /** Allowed actions */
  allowedActions: AuditAction[];
  /** Scope restriction */
  scope: 'all' | 'own' | 'assigned' | 'none';
  /** Field restrictions */
  fieldRestrictions?: string[];
  /** Conditions */
  conditions?: Record<string, unknown>;
}

// =============================================================================
// Insurance Payer Types
// =============================================================================

/**
 * Payer type
 */
export type PayerType = 'commercial' | 'medicaid' | 'medicare' | 'tricare' | 'self-pay';

/**
 * Payer template for integration
 */
export interface PayerTemplate {
  /** Payer ID */
  payerId: string;
  /** Payer name */
  payerName: string;
  /** Payer type */
  payerType: PayerType;
  /** Clearinghouse to use */
  clearinghouse: 'availity' | 'change-healthcare' | 'direct';
  /** Electronic payer ID */
  electronicPayerId?: string;
  /** Supported transactions */
  supportedTransactions: Array<'270' | '271' | '276' | '277' | '278' | '837'>;
  /** Auth request format */
  authRequestFormat?: {
    endpoint?: string;
    method: 'fax' | 'portal' | 'edi' | 'phone';
    requiredFields: string[];
    attachmentTypes?: string[];
  };
  /** Claim submission format */
  claimFormat?: {
    version: '5010' | '4010';
    placeOfService: string[];
    modifierRequirements?: Record<string, string[]>;
  };
  /** Contact information */
  contactInfo: {
    providerServices?: string;
    authPhone?: string;
    claimsAddress?: string;
    portalUrl?: string;
  };
  /** Notes */
  notes?: string;
  /** Active */
  active: boolean;
}

/**
 * Authorization request to payer
 */
export interface AuthorizationRequest {
  /** Request ID */
  id: string;
  /** Patient ID */
  patientId: PatientId;
  /** Payer ID */
  payerId: string;
  /** Service codes requested */
  serviceCodes: Array<{
    code: string;
    units: number;
    unitType: string;
    frequency?: string;
  }>;
  /** Diagnosis codes */
  diagnosisCodes: string[];
  /** Requested start date */
  requestedStartDate: Timestamp;
  /** Requested end date */
  requestedEndDate: Timestamp;
  /** Clinical justification */
  clinicalJustification: string;
  /** Attachments */
  attachments?: Array<{
    type: 'treatment-plan' | 'assessment' | 'progress-report' | 'other';
    documentId: string;
  }>;
  /** Submission method */
  submissionMethod: 'portal' | 'fax' | 'edi' | 'phone';
  /** Submitted timestamp */
  submittedAt?: Timestamp;
  /** Status */
  status: 'draft' | 'submitted' | 'pending' | 'approved' | 'denied' | 'partial';
  /** Reference number */
  referenceNumber?: string;
  /** Created timestamp */
  createdAt: Timestamp;
}

/**
 * Authorization response from payer
 */
export interface AuthorizationResponse {
  /** Response ID */
  id: string;
  /** Request ID */
  requestId: string;
  /** Authorization number (if approved) */
  authorizationNumber?: string;
  /** Status */
  status: 'approved' | 'denied' | 'partial' | 'pending';
  /** Approved services */
  approvedServices?: Array<{
    code: string;
    approvedUnits: number;
    requestedUnits: number;
    startDate: Timestamp;
    endDate: Timestamp;
    frequency?: string;
  }>;
  /** Denial reason (if denied) */
  denialReason?: string;
  /** Denial code */
  denialCode?: string;
  /** Appeal deadline */
  appealDeadline?: Timestamp;
  /** Notes */
  notes?: string;
  /** Received timestamp */
  receivedAt: Timestamp;
}

/**
 * Claim submission
 */
export interface ClaimSubmission {
  /** Claim ID */
  id: string;
  /** Patient ID */
  patientId: PatientId;
  /** Authorization ID */
  authorizationId: AuthorizationId;
  /** Payer ID */
  payerId: string;
  /** Date of service */
  dateOfService: Timestamp;
  /** Service lines */
  serviceLines: Array<{
    lineNumber: number;
    serviceCode: string;
    modifiers?: string[];
    units: number;
    charges: number;
    placeOfService: string;
    renderingProviderId: string;
  }>;
  /** Total charges */
  totalCharges: number;
  /** Submission method */
  submissionMethod: 'edi' | 'paper' | 'portal';
  /** Submitted timestamp */
  submittedAt?: Timestamp;
  /** Claim status */
  status: 'draft' | 'submitted' | 'accepted' | 'rejected' | 'paid' | 'denied';
  /** Payer claim number */
  payerClaimNumber?: string;
  /** Payment amount */
  paymentAmount?: number;
  /** Adjustment codes */
  adjustmentCodes?: Array<{
    code: string;
    reason: string;
    amount: number;
  }>;
  /** Created timestamp */
  createdAt: Timestamp;
  /** Updated timestamp */
  updatedAt: Timestamp;
}

// =============================================================================
// Query Options Types
// =============================================================================

/**
 * Patient query options
 */
export interface PatientQueryOptions {
  status?: Patient['status'];
  assignedBCBA?: string;
  searchTerm?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'lastName' | 'createdAt' | 'treatmentStartDate';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Appointment query options
 */
export interface AppointmentQueryOptions {
  patientId?: PatientId;
  rbtId?: RBTId;
  status?: AppointmentStatus | AppointmentStatus[];
  type?: AppointmentType;
  startDate?: Timestamp;
  endDate?: Timestamp;
  limit?: number;
  offset?: number;
  orderBy?: 'startTime' | 'createdAt';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Authorization query options
 */
export interface AuthorizationQueryOptions {
  patientId?: PatientId;
  payerId?: string;
  status?: AuthorizationStatus | AuthorizationStatus[];
  serviceCode?: string;
  expiringWithinDays?: number;
  lowUnitsThreshold?: number;
  limit?: number;
  offset?: number;
  orderBy?: 'endDate' | 'createdAt' | 'remainingUnits';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Session data query options
 */
export interface SessionDataQueryOptions {
  patientId?: PatientId;
  rbtId?: RBTId;
  startDate?: Timestamp;
  endDate?: Timestamp;
  serviceCode?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'sessionDate' | 'createdAt';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Audit log query options
 */
export interface HealthAuditQueryOptions {
  actorId?: string;
  action?: AuditAction | AuditAction[];
  resourceType?: ResourceType;
  patientId?: PatientId;
  outcome?: 'success' | 'failure' | 'denied';
  startTime?: Timestamp;
  endTime?: Timestamp;
  phiOnly?: boolean;
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Progress report query options
 */
export interface ProgressReportQueryOptions {
  patientId?: PatientId;
  status?: ProgressReport['status'];
  type?: ProgressReport['type'];
  startDate?: Timestamp;
  endDate?: Timestamp;
  limit?: number;
  offset?: number;
  orderBy?: 'periodStart' | 'createdAt' | 'updatedAt';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Schedule assignment for RBT scheduling
 */
export interface ScheduleAssignment {
  /** Assignment ID */
  id?: string;
  /** Patient ID */
  patientId: PatientId;
  /** Day of week (0 = Sunday) */
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Start time (minutes from midnight) */
  startTime: number;
  /** End time (minutes from midnight) */
  endTime: number;
  /** Location */
  location?: string;
  /** Service code */
  serviceCode?: string;
  /** Notes */
  notes?: string;
}

/**
 * Schedule query options
 */
export interface ScheduleQueryOptions {
  rbtId?: RBTId;
  patientId?: PatientId;
  weekStart?: Timestamp;
  weekEnd?: Timestamp;
  status?: RBTSchedule['status'];
  limit?: number;
  offset?: number;
  orderBy?: 'weekStart' | 'lastModified';
  orderDirection?: 'asc' | 'desc';
}

/**
 * FAQ query options
 */
export interface FAQQueryOptions {
  category?: FAQCategory;
  language?: string;
  active?: boolean;
  searchTerm?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'priority' | 'matchCount' | 'createdAt';
  orderDirection?: 'asc' | 'desc';
}
