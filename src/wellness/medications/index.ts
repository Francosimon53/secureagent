/**
 * Medication Service
 *
 * Orchestrates medication management, reminders, adherence tracking, and refills.
 */

import { EventEmitter } from 'events';
import type { MedicationStore } from '../stores/medication-store.js';
import type {
  Medication,
  MedicationDose,
  MedicationAdherence,
  RefillInfo,
  MedicationReminder,
  MedicationFrequency,
} from '../types.js';
import {
  ReminderScheduler,
  createReminderScheduler,
  type SchedulerConfig,
  type ScheduledReminder,
} from './reminder-scheduler.js';
import {
  AdherenceTracker,
  createAdherenceTracker,
  type AdherenceTrackerConfig,
  type AdherenceStats,
  type OverallAdherenceReport,
} from './adherence-tracker.js';
import {
  RefillCalculator,
  createRefillCalculator,
  type RefillCalculatorConfig,
  type RefillStatus,
} from './refill-calculator.js';

// =============================================================================
// Re-exports
// =============================================================================

export {
  ReminderScheduler,
  createReminderScheduler,
  type SchedulerConfig,
  type ScheduledReminder,
} from './reminder-scheduler.js';
export {
  AdherenceTracker,
  createAdherenceTracker,
  type AdherenceTrackerConfig,
  type AdherenceStats,
  type OverallAdherenceReport,
} from './adherence-tracker.js';
export {
  RefillCalculator,
  createRefillCalculator,
  type RefillCalculatorConfig,
  type RefillStatus,
} from './refill-calculator.js';

// =============================================================================
// Medication Service Configuration
// =============================================================================

export interface MedicationServiceConfig {
  enabled: boolean;
  scheduler?: Partial<SchedulerConfig>;
  adherence?: Partial<AdherenceTrackerConfig>;
  refill?: Partial<RefillCalculatorConfig>;
}

const DEFAULT_CONFIG: MedicationServiceConfig = {
  enabled: true,
};

// =============================================================================
// Medication Summary
// =============================================================================

export interface MedicationSummary {
  userId: string;
  activeMedications: number;
  todayScheduled: number;
  todayTaken: number;
  todayMissed: number;
  weeklyAdherence: number;
  upcomingReminders: ScheduledReminder[];
  needingRefill: RefillStatus[];
}

// =============================================================================
// Medication Service
// =============================================================================

export class MedicationService extends EventEmitter {
  private readonly config: MedicationServiceConfig;
  private readonly scheduler: ReminderScheduler;
  private readonly adherenceTracker: AdherenceTracker;
  private readonly refillCalculator: RefillCalculator;

  constructor(
    private readonly store: MedicationStore,
    config: Partial<MedicationServiceConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scheduler = createReminderScheduler(store, config.scheduler);
    this.adherenceTracker = createAdherenceTracker(store, config.adherence);
    this.refillCalculator = createRefillCalculator(store, config.refill);

    // Forward events
    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    // Scheduler events
    this.scheduler.on('reminder:trigger', (event) => {
      this.emit('reminder', event);
    });
    this.scheduler.on('reminder:snoozed', (event) => {
      this.emit('reminder:snoozed', event);
    });
    this.scheduler.on('dose:missed', (event) => {
      this.emit('dose:missed', event);
    });

    // Adherence events
    this.adherenceTracker.on('dose:taken', (event) => {
      this.emit('dose:taken', event);
      // Update refill quantity
      this.refillCalculator.recordDoseTaken(event.dose.medicationId);
    });
    this.adherenceTracker.on('dose:skipped', (event) => {
      this.emit('dose:skipped', event);
    });
    this.adherenceTracker.on('adherence:low', (event) => {
      this.emit('adherence:low', event);
    });

    // Refill events
    this.refillCalculator.on('refill:needed', (event) => {
      this.emit('refill:needed', event);
    });
    this.refillCalculator.on('refill:critical', (event) => {
      this.emit('refill:critical', event);
    });
    this.refillCalculator.on('refill:recorded', (event) => {
      this.emit('refill:recorded', event);
    });
    this.refillCalculator.on('refill:prescription-low', (event) => {
      this.emit('refill:prescription-low', event);
    });
  }

  /**
   * Add a new medication
   */
  async addMedication(
    medication: Omit<Medication, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Medication> {
    const created = await this.store.createMedication(medication);

    // Generate scheduled doses and reminders
    if (medication.isActive && medication.frequency !== 'as_needed') {
      const now = Date.now();
      const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
      await this.scheduler.generateScheduledDoses(created, now, weekAhead);
    }

    this.emit('medication:added', { medication: created });
    return created;
  }

  /**
   * Update a medication
   */
  async updateMedication(
    medicationId: string,
    updates: Partial<Medication>
  ): Promise<Medication | null> {
    const updated = await this.store.updateMedication(medicationId, updates);
    if (updated) {
      this.emit('medication:updated', { medication: updated });
    }
    return updated;
  }

  /**
   * Deactivate a medication
   */
  async deactivateMedication(medicationId: string): Promise<Medication | null> {
    return this.updateMedication(medicationId, {
      isActive: false,
      endDate: Date.now(),
    });
  }

  /**
   * Delete a medication
   */
  async deleteMedication(medicationId: string): Promise<boolean> {
    const result = await this.store.deleteMedication(medicationId);
    if (result) {
      this.emit('medication:deleted', { medicationId });
    }
    return result;
  }

  /**
   * Get medication by ID
   */
  async getMedication(medicationId: string): Promise<Medication | null> {
    return this.store.getMedication(medicationId);
  }

  /**
   * Get active medications for a user
   */
  async getActiveMedications(userId: string): Promise<Medication[]> {
    return this.store.getActiveMedications(userId);
  }

  /**
   * Record dose as taken
   */
  async recordDoseTaken(
    doseId: string,
    takenAt?: number,
    notes?: string
  ): Promise<MedicationDose | null> {
    const dose = await this.adherenceTracker.recordDoseTaken(doseId, takenAt, notes);
    if (dose) {
      this.scheduler.cancelReminder(doseId);
    }
    return dose;
  }

  /**
   * Record dose as skipped
   */
  async recordDoseSkipped(
    doseId: string,
    reason?: string,
    notes?: string
  ): Promise<MedicationDose | null> {
    const dose = await this.adherenceTracker.recordDoseSkipped(doseId, reason, notes);
    if (dose) {
      this.scheduler.cancelReminder(doseId);
    }
    return dose;
  }

  /**
   * Snooze a reminder
   */
  snoozeReminder(doseId: string): boolean {
    return this.scheduler.snoozeReminder(doseId);
  }

  /**
   * Get upcoming reminders
   */
  async getUpcomingReminders(userId: string, hours?: number): Promise<ScheduledReminder[]> {
    return this.scheduler.getUpcomingReminders(userId, hours);
  }

  /**
   * Get pending doses
   */
  async getPendingDoses(userId: string): Promise<MedicationDose[]> {
    return this.store.getPendingDoses(userId);
  }

  /**
   * Get adherence stats for a medication
   */
  async getMedicationAdherence(
    userId: string,
    medicationId: string,
    startDate: number,
    endDate: number
  ): Promise<AdherenceStats> {
    return this.adherenceTracker.getMedicationAdherence(
      userId,
      medicationId,
      startDate,
      endDate
    );
  }

  /**
   * Get overall adherence report
   */
  async getAdherenceReport(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<OverallAdherenceReport> {
    return this.adherenceTracker.getOverallAdherenceReport(userId, startDate, endDate);
  }

  /**
   * Get refill status for all medications
   */
  async getRefillStatuses(userId: string): Promise<RefillStatus[]> {
    return this.refillCalculator.getAllRefillStatuses(userId);
  }

  /**
   * Get medications needing refill
   */
  async getMedicationsNeedingRefill(userId: string): Promise<RefillStatus[]> {
    return this.refillCalculator.getMedicationsNeedingRefill(userId);
  }

  /**
   * Record a refill
   */
  async recordRefill(
    medicationId: string,
    quantity: number,
    refillDate?: number
  ): Promise<Medication | null> {
    return this.refillCalculator.recordRefill(medicationId, quantity, refillDate);
  }

  /**
   * Set up refill tracking for a medication
   */
  async setupRefillTracking(
    medicationId: string,
    refillInfo: RefillInfo
  ): Promise<Medication | null> {
    return this.refillCalculator.setupRefillTracking(medicationId, refillInfo);
  }

  /**
   * Get medication summary
   */
  async getSummary(userId: string): Promise<MedicationSummary> {
    const medications = await this.store.getActiveMedications(userId);
    const now = Date.now();
    const todayStart = new Date(now).setHours(0, 0, 0, 0);
    const todayEnd = new Date(now).setHours(23, 59, 59, 999);
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Get today's doses
    const todayDoses = await this.store.getScheduledDoses(userId, todayStart, todayEnd);
    const todayTaken = todayDoses.filter(
      (d) => d.status === 'taken' || d.status === 'delayed'
    ).length;
    const todayMissed = todayDoses.filter((d) => d.status === 'missed').length;

    // Get weekly adherence
    const weeklyAdherence = await this.store.getOverallAdherence(userId, weekAgo, now);

    // Get upcoming reminders
    const upcomingReminders = await this.scheduler.getUpcomingReminders(userId, 24);

    // Get medications needing refill
    const needingRefill = await this.refillCalculator.getMedicationsNeedingRefill(userId);

    return {
      userId,
      activeMedications: medications.length,
      todayScheduled: todayDoses.length,
      todayTaken,
      todayMissed,
      weeklyAdherence: Math.round(weeklyAdherence * 10) / 10,
      upcomingReminders: upcomingReminders.slice(0, 5),
      needingRefill,
    };
  }

  /**
   * Initialize service for a user
   */
  async initialize(userId: string): Promise<void> {
    await this.scheduler.initializeReminders(userId);

    // Check for missed doses
    await this.scheduler.checkMissedDoses(userId);

    // Check refills
    await this.refillCalculator.checkAllRefills(userId);
  }

  /**
   * Shutdown service
   */
  shutdown(): void {
    this.scheduler.clearAllReminders();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createMedicationService(
  store: MedicationStore,
  config?: Partial<MedicationServiceConfig>
): MedicationService {
  return new MedicationService(store, config);
}
