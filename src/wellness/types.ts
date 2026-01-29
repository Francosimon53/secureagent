/**
 * Wellness Module Type Definitions
 *
 * Comprehensive types for personal health tracking including:
 * - Blood work and biomarkers
 * - Wearable data (WHOOP, Garmin, Apple Health)
 * - Sleep tracking and alerts
 * - Activity and exercise data
 * - Medication management
 */

// =============================================================================
// Biomarker / Blood Work Types
// =============================================================================

export type BiomarkerCategory =
  | 'lipid_panel'
  | 'metabolic_panel'
  | 'cbc'
  | 'thyroid'
  | 'vitamin'
  | 'hormone'
  | 'liver'
  | 'kidney'
  | 'inflammation'
  | 'other';

export type BiomarkerStatus =
  | 'normal'
  | 'low'
  | 'high'
  | 'critical_low'
  | 'critical_high';

export interface ReferenceRange {
  low?: number;
  high?: number;
  optimalLow?: number;
  optimalHigh?: number;
  unit: string;
}

export interface Biomarker {
  id: string;
  userId: string;
  name: string;
  code?: string; // LOINC code
  category: BiomarkerCategory;
  value: number;
  unit: string;
  referenceRange: ReferenceRange;
  status: BiomarkerStatus;
  labReportId: string;
  testDate: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface LabReport {
  id: string;
  userId: string;
  labName?: string;
  orderingPhysician?: string;
  collectionDate: number;
  reportDate: number;
  sourceFile?: string;
  biomarkerCount: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TrendDataPoint {
  date: number;
  value: number;
  status: BiomarkerStatus;
}

export interface BiomarkerTrend {
  biomarkerName: string;
  dataPoints: TrendDataPoint[];
  direction: 'improving' | 'stable' | 'declining' | 'unknown';
  changePercent?: number;
  recommendation?: string;
}

export interface ExtractedBiomarker {
  name: string;
  value: number;
  unit: string;
  referenceRange?: Partial<ReferenceRange>;
  code?: string;
  category?: BiomarkerCategory;
}

export interface PDFExtractionResult {
  labName?: string;
  orderingPhysician?: string;
  collectionDate?: number;
  reportDate?: number;
  biomarkers: ExtractedBiomarker[];
  rawText: string;
  confidence: number;
}

// =============================================================================
// Wearable / Recovery / Strain Types
// =============================================================================

export type WearableSource = 'whoop' | 'garmin' | 'apple_health' | 'manual';

export interface StrainActivity {
  id: string;
  activityType: string;
  startTime: number;
  endTime: number;
  strain: number;
  calories: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
}

export interface RecoveryData {
  id: string;
  userId: string;
  source: WearableSource;
  date: number;
  recoveryScore: number; // 0-100
  hrvRmssd?: number;
  restingHeartRate?: number;
  respiratoryRate?: number;
  skinTemperature?: number;
  spo2?: number;
  sleepPerformance?: number;
  rawData?: Record<string, unknown>;
  syncedAt: number;
  createdAt: number;
}

export interface StrainData {
  id: string;
  userId: string;
  source: WearableSource;
  date: number;
  strainScore: number; // WHOOP: 0-21
  calories: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  activities: StrainActivity[];
  rawData?: Record<string, unknown>;
  syncedAt: number;
  createdAt: number;
}

// =============================================================================
// Sleep Types
// =============================================================================

export interface HeartRateDataPoint {
  timestamp: number;
  value: number;
}

export interface SleepRecord {
  id: string;
  userId: string;
  source: WearableSource;
  date: number;
  bedtime: number;
  wakeTime: number;
  totalSleepMinutes: number;
  remMinutes?: number;
  deepMinutes?: number;
  lightMinutes?: number;
  awakeMinutes?: number;
  sleepEfficiency?: number;
  sleepScore?: number;
  sleepNeed?: number;
  sleepDebt?: number;
  disturbances?: number;
  latencyMinutes?: number;
  respiratoryRate?: number;
  heartRateData?: HeartRateDataPoint[];
  rawData?: Record<string, unknown>;
  syncedAt: number;
  createdAt: number;
}

export type SleepAlertType =
  | 'bedtime_late'
  | 'wake_early'
  | 'sleep_duration_low'
  | 'sleep_efficiency_low'
  | 'sleep_score_low';

export type SleepAlertCondition = 'less_than' | 'greater_than' | 'equals';

export interface SleepAlert {
  id: string;
  userId: string;
  alertType: SleepAlertType;
  condition: SleepAlertCondition;
  threshold: number;
  enabled: boolean;
  notificationChannels: string[];
  lastTriggeredAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SleepQualityMetrics {
  efficiency: number;
  consistency: number;
  duration: number;
  depth: number;
  overall: number;
}

export interface AggregatedSleepData {
  userId: string;
  date: number;
  sources: WearableSource[];
  primarySource: WearableSource;
  bedtime: number;
  wakeTime: number;
  totalSleepMinutes: number;
  sleepScore: number;
  qualityMetrics: SleepQualityMetrics;
}

// =============================================================================
// Activity / Exercise Types
// =============================================================================

export type ActivityType =
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'walking'
  | 'hiking'
  | 'strength_training'
  | 'yoga'
  | 'crossfit'
  | 'rowing'
  | 'elliptical'
  | 'other';

export interface GPSPoint {
  lat: number;
  lng: number;
  elevation?: number;
  timestamp: number;
  heartRate?: number;
}

export interface ActivityLap {
  lapNumber: number;
  startTime: number;
  endTime: number;
  distance?: number;
  duration: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgPace?: number;
  calories?: number;
}

export interface HeartRateZone {
  zone: number;
  name: string;
  minHr: number;
  maxHr: number;
  durationSeconds: number;
  percentage: number;
}

export interface Activity {
  id: string;
  userId: string;
  source: WearableSource;
  externalId?: string;
  activityType: ActivityType;
  name: string;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  distance?: number;
  distanceUnit?: 'km' | 'mi' | 'm';
  calories?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgPace?: number;
  elevationGain?: number;
  steps?: number;
  gpsTrack?: GPSPoint[];
  laps?: ActivityLap[];
  zones?: HeartRateZone[];
  rawData?: Record<string, unknown>;
  syncedAt: number;
  createdAt: number;
}

// =============================================================================
// Medication Types
// =============================================================================

export type MedicationFrequency =
  | 'once_daily'
  | 'twice_daily'
  | 'three_times_daily'
  | 'four_times_daily'
  | 'every_other_day'
  | 'weekly'
  | 'as_needed'
  | 'custom';

export type DoseStatus = 'scheduled' | 'taken' | 'skipped' | 'delayed' | 'missed';

export interface MedicationInstructions {
  withFood?: boolean;
  withoutFood?: boolean;
  withWater?: boolean;
  avoidAlcohol?: boolean;
  timingConstraints?: string[];
  interactions?: string[];
  sideEffects?: string[];
}

export interface RefillInfo {
  currentQuantity: number;
  totalQuantity: number;
  pillsPerDose: number;
  refillsRemaining?: number;
  lastRefillDate?: number;
  nextRefillDate?: number;
  autoRefillEnabled: boolean;
  pharmacyPhone?: string;
}

export interface MedicationReminder {
  id: string;
  time: string; // HH:mm format
  daysOfWeek?: number[]; // 0-6, Sunday-Saturday
  enabled: boolean;
}

export interface Medication {
  id: string;
  userId: string;
  name: string;
  genericName?: string;
  dosage: number;
  dosageUnit: string;
  frequency: MedicationFrequency;
  instructions?: MedicationInstructions;
  prescribedBy?: string;
  pharmacy?: string;
  refillInfo?: RefillInfo;
  startDate: number;
  endDate?: number;
  isActive: boolean;
  reminders: MedicationReminder[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MedicationDose {
  id: string;
  medicationId: string;
  userId: string;
  scheduledFor: number;
  status: DoseStatus;
  takenAt?: number;
  skippedReason?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MedicationAdherence {
  medicationId: string;
  userId: string;
  period: 'daily' | 'weekly' | 'monthly';
  startDate: number;
  endDate: number;
  totalScheduled: number;
  taken: number;
  skipped: number;
  delayed: number;
  missed: number;
  adherenceRate: number;
}

// =============================================================================
// OAuth & Sync Types
// =============================================================================

export interface OAuthToken {
  id: string;
  userId: string;
  provider: WearableSource;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  scope?: string;
  createdAt: number;
  updatedAt: number;
}

export type SyncStatus = 'pending' | 'syncing' | 'success' | 'failed';

export interface SyncState {
  id: string;
  userId: string;
  provider: WearableSource;
  lastSyncAt?: number;
  lastSyncStatus?: SyncStatus;
  lastError?: string;
  nextSyncAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SyncResult {
  provider: WearableSource;
  success: boolean;
  recordsCreated: number;
  recordsUpdated: number;
  error?: string;
  syncedAt: number;
}

// =============================================================================
// Query Options
// =============================================================================

export interface WellnessQueryOptions {
  startDate?: number;
  endDate?: number;
  source?: WearableSource;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export interface BiomarkerQueryOptions extends WellnessQueryOptions {
  category?: BiomarkerCategory;
  status?: BiomarkerStatus;
  labReportId?: string;
  name?: string;
}

export interface ActivityQueryOptions extends WellnessQueryOptions {
  activityType?: ActivityType;
  minDuration?: number;
  maxDuration?: number;
  hasGPS?: boolean;
}

export interface MedicationQueryOptions {
  isActive?: boolean;
  frequency?: MedicationFrequency;
  limit?: number;
  offset?: number;
}

export interface DoseQueryOptions {
  medicationId?: string;
  status?: DoseStatus;
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Event Constants
// =============================================================================

export const WELLNESS_EVENTS = {
  // Blood work
  LAB_REPORT_IMPORTED: 'wellness.lab.imported',
  BIOMARKER_ABNORMAL: 'wellness.biomarker.abnormal',
  BIOMARKER_TREND_ALERT: 'wellness.biomarker.trend-alert',

  // WHOOP / Wearable
  RECOVERY_SYNCED: 'wellness.recovery.synced',
  RECOVERY_LOW: 'wellness.recovery.low',
  STRAIN_SYNCED: 'wellness.strain.synced',
  STRAIN_HIGH: 'wellness.strain.high',

  // Sleep
  SLEEP_SYNCED: 'wellness.sleep.synced',
  SLEEP_ALERT_TRIGGERED: 'wellness.sleep.alert-triggered',
  BEDTIME_LATE: 'wellness.sleep.bedtime-late',

  // Activity
  ACTIVITY_SYNCED: 'wellness.activity.synced',
  WORKOUT_COMPLETED: 'wellness.activity.workout-completed',

  // Medication
  MEDICATION_REMINDER: 'wellness.medication.reminder',
  MEDICATION_TAKEN: 'wellness.medication.taken',
  MEDICATION_SKIPPED: 'wellness.medication.skipped',
  MEDICATION_MISSED: 'wellness.medication.missed',
  REFILL_REMINDER: 'wellness.medication.refill-reminder',
  ADHERENCE_LOW: 'wellness.medication.adherence-low',

  // Sync
  SYNC_STARTED: 'wellness.sync.started',
  SYNC_COMPLETED: 'wellness.sync.completed',
  SYNC_FAILED: 'wellness.sync.failed',
} as const;

export type WellnessEventType = (typeof WELLNESS_EVENTS)[keyof typeof WELLNESS_EVENTS];

// =============================================================================
// Event Payloads
// =============================================================================

export interface LabReportImportedEvent {
  type: typeof WELLNESS_EVENTS.LAB_REPORT_IMPORTED;
  userId: string;
  labReportId: string;
  biomarkerCount: number;
  timestamp: number;
}

export interface BiomarkerAbnormalEvent {
  type: typeof WELLNESS_EVENTS.BIOMARKER_ABNORMAL;
  userId: string;
  biomarker: Biomarker;
  timestamp: number;
}

export interface RecoverySyncedEvent {
  type: typeof WELLNESS_EVENTS.RECOVERY_SYNCED;
  userId: string;
  source: WearableSource;
  recoveryScore: number;
  date: number;
  timestamp: number;
}

export interface RecoveryLowEvent {
  type: typeof WELLNESS_EVENTS.RECOVERY_LOW;
  userId: string;
  recoveryScore: number;
  threshold: number;
  date: number;
  timestamp: number;
}

export interface SleepAlertTriggeredEvent {
  type: typeof WELLNESS_EVENTS.SLEEP_ALERT_TRIGGERED;
  userId: string;
  alert: SleepAlert;
  sleepRecord: SleepRecord;
  timestamp: number;
}

export interface MedicationReminderEvent {
  type: typeof WELLNESS_EVENTS.MEDICATION_REMINDER;
  userId: string;
  medication: Medication;
  dose: MedicationDose;
  timestamp: number;
}

export interface RefillReminderEvent {
  type: typeof WELLNESS_EVENTS.REFILL_REMINDER;
  userId: string;
  medication: Medication;
  daysRemaining: number;
  timestamp: number;
}

export interface AdherenceLowEvent {
  type: typeof WELLNESS_EVENTS.ADHERENCE_LOW;
  userId: string;
  adherence: MedicationAdherence;
  threshold: number;
  timestamp: number;
}

export interface SyncCompletedEvent {
  type: typeof WELLNESS_EVENTS.SYNC_COMPLETED;
  userId: string;
  results: SyncResult[];
  timestamp: number;
}

export interface SyncFailedEvent {
  type: typeof WELLNESS_EVENTS.SYNC_FAILED;
  userId: string;
  provider: WearableSource;
  error: string;
  timestamp: number;
}

export type WellnessEvent =
  | LabReportImportedEvent
  | BiomarkerAbnormalEvent
  | RecoverySyncedEvent
  | RecoveryLowEvent
  | SleepAlertTriggeredEvent
  | MedicationReminderEvent
  | RefillReminderEvent
  | AdherenceLowEvent
  | SyncCompletedEvent
  | SyncFailedEvent;

// =============================================================================
// Provider Types
// =============================================================================

export interface ProviderConfig {
  enabled: boolean;
  apiKeyEnvVar?: string;
}

export interface WhoopConfig extends ProviderConfig {
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  baseUrl: string;
  syncIntervalMinutes: number;
  lowRecoveryThreshold: number;
}

export interface GarminConfig extends ProviderConfig {
  consumerKeyEnvVar: string;
  consumerSecretEnvVar: string;
  syncIntervalMinutes: number;
  includeGPSData: boolean;
}

export interface AppleHealthConfig extends ProviderConfig {
  supportedFormats: Array<'xml' | 'csv'>;
  maxImportFileSizeMB: number;
}

// =============================================================================
// Summary Types
// =============================================================================

export interface WellnessSummary {
  userId: string;
  generatedAt: number;
  recovery?: {
    latestScore: number;
    weeklyAverage: number;
    trend: 'up' | 'down' | 'stable';
  };
  sleep?: {
    lastNightHours: number;
    weeklyAverage: number;
    sleepDebt: number;
    trend: 'up' | 'down' | 'stable';
  };
  activity?: {
    weeklyWorkouts: number;
    weeklyActiveMinutes: number;
    streak: number;
  };
  medications?: {
    activeMedications: number;
    todayScheduled: number;
    todayTaken: number;
    weeklyAdherence: number;
  };
  bloodwork?: {
    lastTestDate?: number;
    abnormalCount: number;
    criticalCount: number;
  };
}
