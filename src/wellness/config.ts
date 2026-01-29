/**
 * Wellness Module Configuration Schemas
 *
 * Zod schemas for validating wellness configuration including:
 * - Blood work PDF parsing settings
 * - WHOOP API configuration
 * - Garmin Connect configuration
 * - Apple Health import settings
 * - Sleep monitoring preferences
 * - Medication reminder settings
 * - Sync orchestration
 */

import { z } from 'zod';

// =============================================================================
// Blood Work Configuration
// =============================================================================

export const BloodworkConfigSchema = z.object({
  enabled: z.boolean().default(true),
  pdfParserLibrary: z.enum(['pdf-parse', 'pdf2json']).default('pdf-parse'),
  maxFileSizeMB: z.number().min(1).max(50).default(10),
  enableTrendAnalysis: z.boolean().default(true),
  trendPeriodDays: z.number().min(30).max(730).default(365),
  abnormalAlertEnabled: z.boolean().default(true),
  criticalAlertEnabled: z.boolean().default(true),
});

export type BloodworkConfig = z.infer<typeof BloodworkConfigSchema>;

// =============================================================================
// WHOOP Configuration
// =============================================================================

export const WhoopConfigSchema = z.object({
  enabled: z.boolean().default(true),
  clientIdEnvVar: z.string().default('WHOOP_CLIENT_ID'),
  clientSecretEnvVar: z.string().default('WHOOP_CLIENT_SECRET'),
  baseUrl: z.string().url().default('https://api.prod.whoop.com'),
  syncIntervalMinutes: z.number().min(15).max(1440).default(60),
  lowRecoveryThreshold: z.number().min(0).max(100).default(33),
  highStrainThreshold: z.number().min(0).max(21).default(18),
  scopes: z.array(z.string()).default([
    'read:recovery',
    'read:cycles',
    'read:sleep',
    'read:workout',
    'read:profile',
    'read:body_measurement',
  ]),
});

export type WhoopConfig = z.infer<typeof WhoopConfigSchema>;

// =============================================================================
// Garmin Configuration
// =============================================================================

export const GarminConfigSchema = z.object({
  enabled: z.boolean().default(true),
  consumerKeyEnvVar: z.string().default('GARMIN_CONSUMER_KEY'),
  consumerSecretEnvVar: z.string().default('GARMIN_CONSUMER_SECRET'),
  baseUrl: z.string().url().default('https://apis.garmin.com'),
  syncIntervalMinutes: z.number().min(15).max(1440).default(60),
  includeGPSData: z.boolean().default(true),
  maxGPSPointsPerActivity: z.number().min(100).max(50000).default(10000),
  activityTypes: z.array(z.string()).default([
    'running',
    'cycling',
    'swimming',
    'walking',
    'hiking',
    'strength_training',
  ]),
});

export type GarminConfig = z.infer<typeof GarminConfigSchema>;

// =============================================================================
// Apple Health Configuration
// =============================================================================

export const AppleHealthConfigSchema = z.object({
  enabled: z.boolean().default(true),
  supportedFormats: z.array(z.enum(['xml', 'csv'])).default(['xml', 'csv']),
  maxImportFileSizeMB: z.number().min(1).max(500).default(100),
  dataTypes: z.array(z.string()).default([
    'HKQuantityTypeIdentifierHeartRate',
    'HKQuantityTypeIdentifierStepCount',
    'HKQuantityTypeIdentifierDistanceWalkingRunning',
    'HKQuantityTypeIdentifierActiveEnergyBurned',
    'HKCategoryTypeIdentifierSleepAnalysis',
    'HKQuantityTypeIdentifierBodyMass',
    'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    'HKQuantityTypeIdentifierRestingHeartRate',
    'HKQuantityTypeIdentifierVO2Max',
  ]),
});

export type AppleHealthConfig = z.infer<typeof AppleHealthConfigSchema>;

// =============================================================================
// Sleep Monitoring Configuration
// =============================================================================

export const SleepMonitoringConfigSchema = z.object({
  enabled: z.boolean().default(true),
  preferredSource: z.enum(['whoop', 'garmin', 'apple_health', 'auto']).default('auto'),
  targetSleepMinutes: z.number().min(240).max(720).default(480), // 8 hours
  targetBedtime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .default('22:30'),
  targetWakeTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .default('06:30'),
  enableAlerts: z.boolean().default(true),
  lateBedtimeThresholdMinutes: z.number().min(15).max(180).default(60),
  lowEfficiencyThreshold: z.number().min(50).max(95).default(80),
  lowScoreThreshold: z.number().min(20).max(90).default(60),
  aggregationStrategy: z.enum(['prefer_primary', 'average', 'highest_quality']).default('prefer_primary'),
});

export type SleepMonitoringConfig = z.infer<typeof SleepMonitoringConfigSchema>;

// =============================================================================
// Medication Configuration
// =============================================================================

export const MedicationConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultReminderMinutesBefore: z.number().min(0).max(60).default(5),
  snoozeIntervalMinutes: z.number().min(5).max(60).default(10),
  maxSnoozeCount: z.number().min(1).max(10).default(3),
  missedWindowMinutes: z.number().min(30).max(360).default(120),
  refillReminderDays: z.number().min(1).max(30).default(7),
  lowAdherenceThreshold: z.number().min(0).max(100).default(80),
  trackInteractions: z.boolean().default(true),
  notificationChannels: z.array(z.string()).default(['push', 'email']),
});

export type MedicationConfig = z.infer<typeof MedicationConfigSchema>;

// =============================================================================
// Sync Configuration
// =============================================================================

export const SyncConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultIntervalMinutes: z.number().min(15).max(1440).default(60),
  retryAttempts: z.number().min(1).max(5).default(3),
  retryDelayMs: z.number().min(1000).max(60000).default(5000),
  concurrentSyncs: z.number().min(1).max(5).default(2),
  syncOnStartup: z.boolean().default(true),
  syncOnNetworkRestore: z.boolean().default(true),
});

export type SyncConfig = z.infer<typeof SyncConfigSchema>;

// =============================================================================
// Root Wellness Configuration
// =============================================================================

export const WellnessConfigSchema = z.object({
  enabled: z.boolean().default(true),
  storeType: z.enum(['memory', 'database']).default('database'),

  // Provider configs
  bloodwork: BloodworkConfigSchema.optional(),
  whoop: WhoopConfigSchema.optional(),
  garmin: GarminConfigSchema.optional(),
  appleHealth: AppleHealthConfigSchema.optional(),

  // Feature configs
  sleepMonitoring: SleepMonitoringConfigSchema.optional(),
  medications: MedicationConfigSchema.optional(),

  // Sync config
  sync: SyncConfigSchema.optional(),
});

export type WellnessConfig = z.infer<typeof WellnessConfigSchema>;

// =============================================================================
// Configuration Defaults
// =============================================================================

export const DEFAULT_WELLNESS_CONFIG: WellnessConfig = {
  enabled: true,
  storeType: 'database',
  bloodwork: {
    enabled: true,
    pdfParserLibrary: 'pdf-parse',
    maxFileSizeMB: 10,
    enableTrendAnalysis: true,
    trendPeriodDays: 365,
    abnormalAlertEnabled: true,
    criticalAlertEnabled: true,
  },
  whoop: {
    enabled: true,
    clientIdEnvVar: 'WHOOP_CLIENT_ID',
    clientSecretEnvVar: 'WHOOP_CLIENT_SECRET',
    baseUrl: 'https://api.prod.whoop.com',
    syncIntervalMinutes: 60,
    lowRecoveryThreshold: 33,
    highStrainThreshold: 18,
    scopes: [
      'read:recovery',
      'read:cycles',
      'read:sleep',
      'read:workout',
      'read:profile',
      'read:body_measurement',
    ],
  },
  garmin: {
    enabled: true,
    consumerKeyEnvVar: 'GARMIN_CONSUMER_KEY',
    consumerSecretEnvVar: 'GARMIN_CONSUMER_SECRET',
    baseUrl: 'https://apis.garmin.com',
    syncIntervalMinutes: 60,
    includeGPSData: true,
    maxGPSPointsPerActivity: 10000,
    activityTypes: ['running', 'cycling', 'swimming', 'walking', 'hiking', 'strength_training'],
  },
  appleHealth: {
    enabled: true,
    supportedFormats: ['xml', 'csv'],
    maxImportFileSizeMB: 100,
    dataTypes: [
      'HKQuantityTypeIdentifierHeartRate',
      'HKQuantityTypeIdentifierStepCount',
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKCategoryTypeIdentifierSleepAnalysis',
      'HKQuantityTypeIdentifierBodyMass',
      'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
      'HKQuantityTypeIdentifierRestingHeartRate',
      'HKQuantityTypeIdentifierVO2Max',
    ],
  },
  sleepMonitoring: {
    enabled: true,
    preferredSource: 'auto',
    targetSleepMinutes: 480,
    targetBedtime: '22:30',
    targetWakeTime: '06:30',
    enableAlerts: true,
    lateBedtimeThresholdMinutes: 60,
    lowEfficiencyThreshold: 80,
    lowScoreThreshold: 60,
    aggregationStrategy: 'prefer_primary',
  },
  medications: {
    enabled: true,
    defaultReminderMinutesBefore: 5,
    snoozeIntervalMinutes: 10,
    maxSnoozeCount: 3,
    missedWindowMinutes: 120,
    refillReminderDays: 7,
    lowAdherenceThreshold: 80,
    trackInteractions: true,
    notificationChannels: ['push', 'email'],
  },
  sync: {
    enabled: true,
    defaultIntervalMinutes: 60,
    retryAttempts: 3,
    retryDelayMs: 5000,
    concurrentSyncs: 2,
    syncOnStartup: true,
    syncOnNetworkRestore: true,
  },
};

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate wellness configuration
 */
export function validateWellnessConfig(config: unknown): WellnessConfig {
  return WellnessConfigSchema.parse(config);
}

/**
 * Safe validation that returns errors instead of throwing
 */
export function safeValidateWellnessConfig(config: unknown): {
  success: boolean;
  data?: WellnessConfig;
  errors?: Array<{ path: string; message: string }>;
} {
  const result = WellnessConfigSchema.safeParse(config);
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
export function mergeWithDefaults(partial: Partial<WellnessConfig>): WellnessConfig {
  return {
    ...DEFAULT_WELLNESS_CONFIG,
    ...partial,
    bloodwork: partial.bloodwork
      ? { ...DEFAULT_WELLNESS_CONFIG.bloodwork, ...partial.bloodwork }
      : DEFAULT_WELLNESS_CONFIG.bloodwork,
    whoop: partial.whoop
      ? { ...DEFAULT_WELLNESS_CONFIG.whoop, ...partial.whoop }
      : DEFAULT_WELLNESS_CONFIG.whoop,
    garmin: partial.garmin
      ? { ...DEFAULT_WELLNESS_CONFIG.garmin, ...partial.garmin }
      : DEFAULT_WELLNESS_CONFIG.garmin,
    appleHealth: partial.appleHealth
      ? { ...DEFAULT_WELLNESS_CONFIG.appleHealth, ...partial.appleHealth }
      : DEFAULT_WELLNESS_CONFIG.appleHealth,
    sleepMonitoring: partial.sleepMonitoring
      ? { ...DEFAULT_WELLNESS_CONFIG.sleepMonitoring, ...partial.sleepMonitoring }
      : DEFAULT_WELLNESS_CONFIG.sleepMonitoring,
    medications: partial.medications
      ? { ...DEFAULT_WELLNESS_CONFIG.medications, ...partial.medications }
      : DEFAULT_WELLNESS_CONFIG.medications,
    sync: partial.sync ? { ...DEFAULT_WELLNESS_CONFIG.sync, ...partial.sync } : DEFAULT_WELLNESS_CONFIG.sync,
  };
}
