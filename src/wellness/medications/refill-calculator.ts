/**
 * Refill Calculator
 *
 * Calculates refill needs and sends reminders for medications running low.
 */

import { EventEmitter } from 'events';
import type { MedicationStore } from '../stores/medication-store.js';
import type { Medication, RefillInfo, MedicationFrequency } from '../types.js';

// =============================================================================
// Refill Configuration
// =============================================================================

export interface RefillCalculatorConfig {
  reminderDaysBeforeEmpty: number;
  criticalDaysBeforeEmpty: number;
}

const DEFAULT_CONFIG: RefillCalculatorConfig = {
  reminderDaysBeforeEmpty: 7,
  criticalDaysBeforeEmpty: 3,
};

// =============================================================================
// Refill Status
// =============================================================================

export interface RefillStatus {
  medication: Medication;
  currentQuantity: number;
  daysRemaining: number;
  estimatedEmptyDate: number;
  needsRefill: boolean;
  isCritical: boolean;
  nextRefillDate?: number;
  message: string;
}

// =============================================================================
// Refill Calculator
// =============================================================================

export class RefillCalculator extends EventEmitter {
  private readonly config: RefillCalculatorConfig;

  constructor(
    private readonly store: MedicationStore,
    config: Partial<RefillCalculatorConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate refill status for a medication
   */
  calculateRefillStatus(medication: Medication): RefillStatus {
    const refillInfo = medication.refillInfo;

    if (!refillInfo) {
      return {
        medication,
        currentQuantity: 0,
        daysRemaining: Infinity,
        estimatedEmptyDate: 0,
        needsRefill: false,
        isCritical: false,
        message: 'No refill information available',
      };
    }

    const { currentQuantity, pillsPerDose } = refillInfo;
    const dosesPerDay = this.getDosesPerDay(medication.frequency);

    if (dosesPerDay === 0) {
      return {
        medication,
        currentQuantity,
        daysRemaining: Infinity,
        estimatedEmptyDate: 0,
        needsRefill: false,
        isCritical: false,
        message: 'As-needed medication - monitor manually',
      };
    }

    const pillsPerDay = dosesPerDay * pillsPerDose;
    const daysRemaining = pillsPerDay > 0 ? Math.floor(currentQuantity / pillsPerDay) : Infinity;
    const estimatedEmptyDate = Date.now() + daysRemaining * 24 * 60 * 60 * 1000;

    const needsRefill = daysRemaining <= this.config.reminderDaysBeforeEmpty;
    const isCritical = daysRemaining <= this.config.criticalDaysBeforeEmpty;

    let message: string;
    if (daysRemaining === 0) {
      message = 'Out of medication - refill immediately';
    } else if (isCritical) {
      message = `Critical: Only ${daysRemaining} days of supply remaining`;
    } else if (needsRefill) {
      message = `Refill soon: ${daysRemaining} days of supply remaining`;
    } else {
      message = `${daysRemaining} days of supply remaining`;
    }

    return {
      medication,
      currentQuantity,
      daysRemaining,
      estimatedEmptyDate,
      needsRefill,
      isCritical,
      nextRefillDate: refillInfo.nextRefillDate,
      message,
    };
  }

  /**
   * Get all medications needing refill
   */
  async getMedicationsNeedingRefill(userId: string): Promise<RefillStatus[]> {
    const medications = await this.store.getActiveMedications(userId);
    const statuses: RefillStatus[] = [];

    for (const medication of medications) {
      const status = this.calculateRefillStatus(medication);
      if (status.needsRefill) {
        statuses.push(status);
      }
    }

    // Sort by days remaining (most urgent first)
    return statuses.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  /**
   * Get all refill statuses for a user
   */
  async getAllRefillStatuses(userId: string): Promise<RefillStatus[]> {
    const medications = await this.store.getActiveMedications(userId);
    return medications
      .filter((m) => m.refillInfo)
      .map((m) => this.calculateRefillStatus(m))
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  /**
   * Update medication quantity after taking a dose
   */
  async recordDoseTaken(medicationId: string): Promise<Medication | null> {
    const medication = await this.store.getMedication(medicationId);
    if (!medication?.refillInfo) return null;

    const newQuantity = Math.max(
      0,
      medication.refillInfo.currentQuantity - medication.refillInfo.pillsPerDose
    );

    const updatedMedication = await this.store.updateMedication(medicationId, {
      refillInfo: {
        ...medication.refillInfo,
        currentQuantity: newQuantity,
      },
    });

    if (updatedMedication) {
      const status = this.calculateRefillStatus(updatedMedication);

      if (status.needsRefill) {
        this.emit('refill:needed', {
          medication: updatedMedication,
          status,
        });
      }

      if (status.isCritical) {
        this.emit('refill:critical', {
          medication: updatedMedication,
          status,
        });
      }
    }

    return updatedMedication;
  }

  /**
   * Record a refill
   */
  async recordRefill(
    medicationId: string,
    quantity: number,
    refillDate?: number
  ): Promise<Medication | null> {
    const medication = await this.store.getMedication(medicationId);
    if (!medication?.refillInfo) return null;

    const newQuantity = medication.refillInfo.currentQuantity + quantity;
    const refillsRemaining =
      medication.refillInfo.refillsRemaining !== undefined
        ? Math.max(0, medication.refillInfo.refillsRemaining - 1)
        : undefined;

    const updatedMedication = await this.store.updateMedication(medicationId, {
      refillInfo: {
        ...medication.refillInfo,
        currentQuantity: newQuantity,
        refillsRemaining,
        lastRefillDate: refillDate ?? Date.now(),
        nextRefillDate: this.calculateNextRefillDate(medication, newQuantity),
      },
    });

    if (updatedMedication) {
      this.emit('refill:recorded', {
        medication: updatedMedication,
        quantity,
        newTotal: newQuantity,
      });

      // Check if running low on refills
      if (refillsRemaining !== undefined && refillsRemaining <= 1) {
        this.emit('refill:prescription-low', {
          medication: updatedMedication,
          refillsRemaining,
        });
      }
    }

    return updatedMedication;
  }

  /**
   * Set up refill information for a medication
   */
  async setupRefillTracking(
    medicationId: string,
    refillInfo: RefillInfo
  ): Promise<Medication | null> {
    return this.store.updateMedication(medicationId, { refillInfo });
  }

  /**
   * Check all medications and emit refill reminders
   */
  async checkAllRefills(userId: string): Promise<RefillStatus[]> {
    const needingRefill = await this.getMedicationsNeedingRefill(userId);

    for (const status of needingRefill) {
      if (status.isCritical) {
        this.emit('refill:critical', {
          medication: status.medication,
          status,
        });
      } else {
        this.emit('refill:needed', {
          medication: status.medication,
          status,
        });
      }
    }

    return needingRefill;
  }

  /**
   * Get number of doses per day based on frequency
   */
  private getDosesPerDay(frequency: MedicationFrequency): number {
    switch (frequency) {
      case 'once_daily':
        return 1;
      case 'twice_daily':
        return 2;
      case 'three_times_daily':
        return 3;
      case 'four_times_daily':
        return 4;
      case 'every_other_day':
        return 0.5;
      case 'weekly':
        return 1 / 7;
      case 'as_needed':
        return 0; // Cannot calculate for as-needed
      case 'custom':
        return 1; // Default to 1 for custom
      default:
        return 1;
    }
  }

  /**
   * Calculate next refill date based on current quantity
   */
  private calculateNextRefillDate(medication: Medication, currentQuantity: number): number {
    if (!medication.refillInfo) return 0;

    const dosesPerDay = this.getDosesPerDay(medication.frequency);
    if (dosesPerDay === 0) return 0;

    const pillsPerDay = dosesPerDay * medication.refillInfo.pillsPerDose;
    const daysRemaining = Math.floor(currentQuantity / pillsPerDay);
    const refillBeforeDays = this.config.reminderDaysBeforeEmpty;

    return Date.now() + (daysRemaining - refillBeforeDays) * 24 * 60 * 60 * 1000;
  }

  /**
   * Get pharmacy contact for a medication
   */
  async getPharmacyInfo(
    medicationId: string
  ): Promise<{ pharmacy?: string; phone?: string } | null> {
    const medication = await this.store.getMedication(medicationId);
    if (!medication) return null;

    return {
      pharmacy: medication.pharmacy,
      phone: medication.refillInfo?.pharmacyPhone,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createRefillCalculator(
  store: MedicationStore,
  config?: Partial<RefillCalculatorConfig>
): RefillCalculator {
  return new RefillCalculator(store, config);
}
