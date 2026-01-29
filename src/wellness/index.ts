/**
 * Wellness Module
 *
 * Comprehensive health and wellness tracking including:
 * - Blood work PDF extraction and biomarker trend analysis
 * - WHOOP API integration for recovery/strain/sleep
 * - Garmin Connect integration for activities with GPS
 * - Apple Health import from exported files
 * - Sleep monitoring with configurable alerts
 * - Medication reminders with adherence tracking
 */

import { EventEmitter } from 'events';
import type { z } from 'zod';
import type { WellnessConfigSchema } from './config.js';

// Store imports
import type { BiomarkerStore } from './stores/biomarker-store.js';
import type { WearableStore } from './stores/wearable-store.js';
import type { SleepStore } from './stores/sleep-store.js';
import type { ActivityStore } from './stores/activity-store.js';
import type { MedicationStore } from './stores/medication-store.js';

// Service imports
import {
  BloodworkService,
  createBloodworkService,
  type BloodworkServiceConfig,
} from './bloodwork/index.js';
import {
  SleepMonitoringService,
  createSleepMonitoringService,
  type SleepMonitoringServiceConfig,
} from './sleep/index.js';
import {
  MedicationService,
  createMedicationService,
  type MedicationServiceConfig,
} from './medications/index.js';
import {
  WearableSyncService,
  createWearableSyncService,
  type WearableSyncServiceConfig,
} from './sync/index.js';

// Provider imports
import { WellnessProviderRegistry } from './providers/base.js';
import { WhoopProvider, createWhoopProvider } from './providers/whoop.js';
import { GarminProvider, createGarminProvider } from './providers/garmin.js';
import { AppleHealthProvider, createAppleHealthProvider } from './providers/apple-health.js';

// Type imports
import type {
  WearableSource,
  Biomarker,
  LabReport,
  BiomarkerTrend,
  RecoveryData,
  StrainData,
  SleepRecord,
  Activity,
  Medication,
  MedicationDose,
  SleepAlert,
  WELLNESS_EVENTS,
} from './types.js';

// =============================================================================
// Re-exports
// =============================================================================

// Types - explicit exports to avoid conflicts with config
export {
  // Biomarker types
  type BiomarkerCategory,
  type BiomarkerStatus,
  type ReferenceRange,
  type Biomarker,
  type LabReport,
  type TrendDataPoint,
  type BiomarkerTrend,
  type ExtractedBiomarker,
  type PDFExtractionResult,
  // Wearable types
  type WearableSource,
  type RecoveryData,
  type StrainData,
  type StrainActivity,
  type SleepRecord,
  type SleepQualityMetrics,
  type HeartRateDataPoint,
  // Activity types
  type ActivityType,
  type Activity,
  type GPSPoint,
  type ActivityLap,
  type HeartRateZone,
  // Sleep types
  type SleepAlert,
  type SleepAlertType,
  type SleepAlertCondition,
  type AggregatedSleepData,
  // Medication types
  type MedicationFrequency,
  type DoseStatus,
  type Medication,
  type MedicationInstructions,
  type RefillInfo,
  type MedicationDose,
  type MedicationReminder,
  type MedicationAdherence,
  // OAuth and sync types
  type OAuthToken,
  type SyncState,
  type SyncStatus,
  // Provider types (from types.ts)
  type ProviderConfig,
  // Events
  WELLNESS_EVENTS,
} from './types.js';

// Config - Zod schemas and config types
export {
  // Schemas
  BloodworkConfigSchema,
  WhoopConfigSchema,
  GarminConfigSchema,
  AppleHealthConfigSchema,
  SleepMonitoringConfigSchema,
  MedicationConfigSchema,
  SyncConfigSchema,
  WellnessConfigSchema,
  // Config types (use different names to avoid conflict with provider types)
  type BloodworkConfig,
  type WhoopConfig as WhoopModuleConfig,
  type GarminConfig as GarminModuleConfig,
  type AppleHealthConfig as AppleHealthModuleConfig,
  type SleepMonitoringConfig,
  type MedicationConfig,
  type SyncConfig,
  type WellnessConfig as WellnessModuleConfig,
  // Defaults and helpers
  DEFAULT_WELLNESS_CONFIG,
  validateWellnessConfig,
  safeValidateWellnessConfig,
  mergeWithDefaults,
} from './config.js';

// Stores
export {
  type BiomarkerStore,
  createBiomarkerStore,
  DatabaseBiomarkerStore,
  InMemoryBiomarkerStore,
} from './stores/biomarker-store.js';
export {
  type WearableStore,
  createWearableStore,
  DatabaseWearableStore,
  InMemoryWearableStore,
} from './stores/wearable-store.js';
export {
  type SleepStore,
  createSleepStore,
  DatabaseSleepStore,
  InMemorySleepStore,
} from './stores/sleep-store.js';
export {
  type ActivityStore,
  createActivityStore,
  DatabaseActivityStore,
  InMemoryActivityStore,
} from './stores/activity-store.js';
export {
  type MedicationStore,
  createMedicationStore,
  DatabaseMedicationStore,
  InMemoryMedicationStore,
} from './stores/medication-store.js';

// Providers
export {
  BaseWellnessProvider,
  OAuthWellnessProvider,
  OAuth1WellnessProvider,
  WellnessProviderRegistry,
  type SyncCapableProvider,
} from './providers/base.js';
export { WhoopProvider, createWhoopProvider } from './providers/whoop.js';
export { GarminProvider, createGarminProvider } from './providers/garmin.js';
export { AppleHealthProvider, createAppleHealthProvider } from './providers/apple-health.js';

// Bloodwork
export {
  BloodworkService,
  createBloodworkService,
  type BloodworkServiceConfig,
} from './bloodwork/index.js';
export { PDFExtractor, createPDFExtractor, type PDFExtractorConfig } from './bloodwork/pdf-extractor.js';
export { BiomarkerParser, createBiomarkerParser } from './bloodwork/biomarker-parser.js';
export { TrendAnalyzer, createTrendAnalyzer, type TrendAnalyzerConfig } from './bloodwork/trend-analyzer.js';

// Sleep
export {
  SleepMonitoringService,
  createSleepMonitoringService,
  type SleepMonitoringServiceConfig,
  type SleepSummary,
} from './sleep/index.js';
export { SleepAggregator, createSleepAggregator, type AggregatorConfig } from './sleep/aggregator.js';
export { SleepAlertEngine, createSleepAlertEngine, type AlertEngineConfig, type AlertEvaluationResult } from './sleep/alert-engine.js';
export { SleepQualityScorer, createSleepQualityScorer, type ScoringConfig, type SleepScoreBreakdown } from './sleep/quality-scorer.js';

// Medications
export {
  MedicationService,
  createMedicationService,
  type MedicationServiceConfig,
  type MedicationSummary,
} from './medications/index.js';
export { ReminderScheduler, createReminderScheduler, type SchedulerConfig, type ScheduledReminder } from './medications/reminder-scheduler.js';
export { AdherenceTracker, createAdherenceTracker, type AdherenceTrackerConfig, type AdherenceStats, type OverallAdherenceReport } from './medications/adherence-tracker.js';
export { RefillCalculator, createRefillCalculator, type RefillCalculatorConfig, type RefillStatus } from './medications/refill-calculator.js';

// Sync
export {
  WearableSyncService,
  createWearableSyncService,
  type WearableSyncServiceConfig,
  type ProviderConnectionStatus,
} from './sync/index.js';
export { SyncScheduler, createSyncScheduler, type SyncSchedulerConfig, type SyncResult } from './sync/sync-scheduler.js';

// =============================================================================
// Wellness Manager Configuration
// =============================================================================

// Re-export WellnessConfig without alias for internal use
import type { WellnessConfig } from './config.js';
export type { WellnessConfig };

export interface WellnessManagerConfig {
  bloodwork?: Partial<BloodworkServiceConfig>;
  sleep?: Partial<SleepMonitoringServiceConfig>;
  medications?: Partial<MedicationServiceConfig>;
  sync?: Partial<WearableSyncServiceConfig>;
  providers?: {
    whoop?: {
      clientId: string;
      clientSecret: string;
    };
    garmin?: {
      consumerKey: string;
      consumerSecret: string;
    };
    appleHealth?: {
      enabled?: boolean;
    };
  };
}

// =============================================================================
// Wellness Manager Stores
// =============================================================================

export interface WellnessStores {
  biomarker: BiomarkerStore;
  wearable: WearableStore;
  sleep: SleepStore;
  activity: ActivityStore;
  medication: MedicationStore;
}

// =============================================================================
// Wellness Manager
// =============================================================================

export class WellnessManager extends EventEmitter {
  private static instance: WellnessManager | null = null;

  public readonly bloodwork: BloodworkService;
  public readonly sleep: SleepMonitoringService;
  public readonly medications: MedicationService;
  public readonly sync: WearableSyncService;

  private readonly stores: WellnessStores;
  private readonly registry: WellnessProviderRegistry;

  private constructor(stores: WellnessStores, config: WellnessManagerConfig = {}) {
    super();

    this.stores = stores;
    this.registry = WellnessProviderRegistry.getInstance();

    // Initialize services
    this.bloodwork = createBloodworkService(stores.biomarker, config.bloodwork);
    this.sleep = createSleepMonitoringService(stores.sleep, config.sleep);
    this.medications = createMedicationService(stores.medication, config.medications);
    this.sync = createWearableSyncService(
      stores.wearable,
      stores.sleep,
      stores.activity,
      config.sync
    );

    // Register providers
    this.registerProviders(config.providers);

    // Setup event forwarding
    this.setupEventForwarding();
  }

  /**
   * Get or create the singleton instance
   */
  static getInstance(stores?: WellnessStores, config?: WellnessManagerConfig): WellnessManager {
    if (!WellnessManager.instance) {
      if (!stores) {
        throw new Error('Stores must be provided when creating WellnessManager for the first time');
      }
      WellnessManager.instance = new WellnessManager(stores, config);
    }
    return WellnessManager.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    if (WellnessManager.instance) {
      WellnessManager.instance.shutdown();
      WellnessManager.instance = null;
    }
  }

  /**
   * Register wellness providers
   */
  private registerProviders(config?: WellnessManagerConfig['providers']): void {
    // Register WHOOP provider
    if (config?.whoop) {
      // Set environment variables if provided directly
      if (config.whoop.clientId) {
        process.env.WHOOP_CLIENT_ID = config.whoop.clientId;
      }
      if (config.whoop.clientSecret) {
        process.env.WHOOP_CLIENT_SECRET = config.whoop.clientSecret;
      }
      const whoopProvider = createWhoopProvider();
      this.registry.register(whoopProvider);
    }

    // Register Garmin provider
    if (config?.garmin) {
      // Set environment variables if provided directly
      if (config.garmin.consumerKey) {
        process.env.GARMIN_CONSUMER_KEY = config.garmin.consumerKey;
      }
      if (config.garmin.consumerSecret) {
        process.env.GARMIN_CONSUMER_SECRET = config.garmin.consumerSecret;
      }
      const garminProvider = createGarminProvider();
      this.registry.register(garminProvider);
    }

    // Register Apple Health provider (always available for imports)
    if (config?.appleHealth?.enabled !== false) {
      const appleHealthProvider = createAppleHealthProvider();
      this.registry.register(appleHealthProvider);
    }
  }

  /**
   * Forward events from services
   */
  private setupEventForwarding(): void {
    // Bloodwork events
    this.bloodwork.on('lab-report:imported', (event) => {
      this.emit('lab-report:imported', event);
    });
    this.bloodwork.on('biomarker:abnormal', (event) => {
      this.emit('biomarker:abnormal', event);
    });
    this.bloodwork.on('biomarker:trend-alert', (event) => {
      this.emit('biomarker:trend-alert', event);
    });

    // Sleep events
    this.sleep.on('sleep:processed', (event) => {
      this.emit('sleep:processed', event);
    });
    this.sleep.on('alert:triggered', (event) => {
      this.emit('sleep:alert-triggered', event);
    });

    // Medication events
    this.medications.on('reminder', (event) => {
      this.emit('medication:reminder', event);
    });
    this.medications.on('dose:taken', (event) => {
      this.emit('medication:taken', event);
    });
    this.medications.on('dose:skipped', (event) => {
      this.emit('medication:skipped', event);
    });
    this.medications.on('dose:missed', (event) => {
      this.emit('medication:missed', event);
    });
    this.medications.on('refill:needed', (event) => {
      this.emit('medication:refill-needed', event);
    });
    this.medications.on('refill:critical', (event) => {
      this.emit('medication:refill-critical', event);
    });
    this.medications.on('adherence:low', (event) => {
      this.emit('medication:adherence-low', event);
    });

    // Sync events
    this.sync.on('sync:started', (event) => {
      this.emit('sync:started', event);
    });
    this.sync.on('sync:completed', (event) => {
      this.emit('sync:completed', event);
    });
    this.sync.on('sync:failed', (event) => {
      this.emit('sync:failed', event);
    });
    this.sync.on('provider:connected', (event) => {
      this.emit('provider:connected', event);
    });
    this.sync.on('provider:disconnected', (event) => {
      this.emit('provider:disconnected', event);
    });
  }

  // ===========================================================================
  // Convenience Methods
  // ===========================================================================

  /**
   * Initialize wellness tracking for a user
   */
  async initializeUser(userId: string): Promise<void> {
    await this.sync.initialize(userId);
    await this.medications.initialize(userId);
  }

  /**
   * Get a comprehensive wellness summary for a user
   */
  async getWellnessSummary(userId: string): Promise<{
    medications: Awaited<ReturnType<MedicationService['getSummary']>>;
    sleep: Awaited<ReturnType<SleepMonitoringService['getSleepSummary']>>;
    recovery: RecoveryData | null;
    strain: StrainData | null;
    recentActivities: Activity[];
    providerStatus: Awaited<ReturnType<WearableSyncService['getConnectionStatuses']>>;
  }> {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const [
      medicationSummary,
      sleepSummary,
      recovery,
      strain,
      recentActivities,
      providerStatus,
    ] = await Promise.all([
      this.medications.getSummary(userId),
      this.sleep.getSleepSummary(userId, weekAgo, now),
      this.stores.wearable.getLatestRecovery(userId),
      this.stores.wearable.getLatestStrain(userId),
      this.stores.activity.listActivities(userId, {
        startDate: weekAgo,
        endDate: now,
        limit: 10,
      }),
      this.sync.getConnectionStatuses(userId),
    ]);

    return {
      medications: medicationSummary,
      sleep: sleepSummary,
      recovery,
      strain,
      recentActivities,
      providerStatus,
    };
  }

  /**
   * Get today's health data
   */
  async getTodayData(userId: string): Promise<{
    recovery: RecoveryData | null;
    strain: StrainData | null;
    sleep: SleepRecord | null;
    activities: Activity[];
    medicationsDue: MedicationDose[];
  }> {
    const now = Date.now();
    const todayStart = new Date(now).setHours(0, 0, 0, 0);
    const todayEnd = new Date(now).setHours(23, 59, 59, 999);

    const [recovery, strain, sleep, activities, medicationsDue] = await Promise.all([
      this.stores.wearable.getLatestRecovery(userId),
      this.stores.wearable.getLatestStrain(userId),
      this.stores.sleep.getLatestSleepRecord(userId),
      this.stores.activity.listActivities(userId, {
        startDate: todayStart,
        endDate: todayEnd,
      }),
      this.medications.getPendingDoses(userId),
    ]);

    return {
      recovery,
      strain,
      sleep,
      activities,
      medicationsDue,
    };
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): WearableSource[] {
    return this.registry.listProviders();
  }

  /**
   * Get the underlying stores
   */
  getStores(): WellnessStores {
    return this.stores;
  }

  /**
   * Shutdown the wellness manager
   */
  shutdown(): void {
    this.sync.shutdown();
    this.medications.shutdown();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createWellnessManager(
  stores: WellnessStores,
  config?: WellnessManagerConfig
): WellnessManager {
  return WellnessManager.getInstance(stores, config);
}
