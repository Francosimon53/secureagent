/**
 * Adherence Tracker
 *
 * Tracks medication adherence and calculates compliance metrics.
 */

import { EventEmitter } from 'events';
import type { MedicationStore } from '../stores/medication-store.js';
import type {
  Medication,
  MedicationDose,
  MedicationAdherence,
  DoseStatus,
} from '../types.js';

// =============================================================================
// Adherence Configuration
// =============================================================================

export interface AdherenceTrackerConfig {
  lowAdherenceThreshold: number;
  delayedWindowMinutes: number;
}

const DEFAULT_CONFIG: AdherenceTrackerConfig = {
  lowAdherenceThreshold: 80,
  delayedWindowMinutes: 30,
};

// =============================================================================
// Adherence Stats
// =============================================================================

export interface AdherenceStats {
  medicationId: string;
  medicationName: string;
  period: {
    startDate: number;
    endDate: number;
  };
  totalScheduled: number;
  taken: number;
  skipped: number;
  delayed: number;
  missed: number;
  adherenceRate: number;
  streak: {
    current: number;
    longest: number;
  };
  averageDelayMinutes: number;
  commonSkipReasons: Array<{ reason: string; count: number }>;
}

export interface OverallAdherenceReport {
  userId: string;
  period: {
    startDate: number;
    endDate: number;
  };
  overallAdherence: number;
  byMedication: AdherenceStats[];
  trends: {
    direction: 'improving' | 'stable' | 'declining';
    weeklyAdherence: number[];
  };
  insights: string[];
}

// =============================================================================
// Adherence Tracker
// =============================================================================

export class AdherenceTracker extends EventEmitter {
  private readonly config: AdherenceTrackerConfig;

  constructor(
    private readonly store: MedicationStore,
    config: Partial<AdherenceTrackerConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record a dose as taken
   */
  async recordDoseTaken(
    doseId: string,
    takenAt?: number,
    notes?: string
  ): Promise<MedicationDose | null> {
    const dose = await this.store.getDose(doseId);
    if (!dose) return null;

    const actualTakenAt = takenAt ?? Date.now();
    const delayMinutes = (actualTakenAt - dose.scheduledFor) / 60000;

    // Determine if delayed
    const status: DoseStatus =
      delayMinutes > this.config.delayedWindowMinutes ? 'delayed' : 'taken';

    const updated = await this.store.updateDose(doseId, {
      status,
      takenAt: actualTakenAt,
      notes,
    });

    if (updated) {
      this.emit('dose:taken', {
        dose: updated,
        delayMinutes,
      });

      // Check adherence
      await this.checkAdherenceAlert(dose.userId, dose.medicationId);
    }

    return updated;
  }

  /**
   * Record a dose as skipped
   */
  async recordDoseSkipped(
    doseId: string,
    reason?: string,
    notes?: string
  ): Promise<MedicationDose | null> {
    const dose = await this.store.getDose(doseId);
    if (!dose) return null;

    const updated = await this.store.updateDose(doseId, {
      status: 'skipped',
      skippedReason: reason,
      notes,
    });

    if (updated) {
      this.emit('dose:skipped', {
        dose: updated,
        reason,
      });

      // Check adherence
      await this.checkAdherenceAlert(dose.userId, dose.medicationId);
    }

    return updated;
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
    const medication = await this.store.getMedication(medicationId);
    const adherence = await this.store.calculateAdherence(
      userId,
      medicationId,
      'daily', // Using daily period for detailed tracking
      startDate,
      endDate
    );

    // Get doses for additional stats
    const doses = await this.store.listDoses(userId, {
      medicationId,
      startDate,
      endDate,
      limit: 1000,
    });

    // Calculate streak
    const streak = this.calculateStreak(doses);

    // Calculate average delay
    const delayedDoses = doses.filter((d) => d.status === 'delayed' && d.takenAt);
    const avgDelay =
      delayedDoses.length > 0
        ? delayedDoses.reduce((sum, d) => sum + (d.takenAt! - d.scheduledFor) / 60000, 0) /
          delayedDoses.length
        : 0;

    // Get skip reasons
    const skipReasons = this.aggregateSkipReasons(doses);

    return {
      medicationId,
      medicationName: medication?.name ?? 'Unknown',
      period: { startDate, endDate },
      totalScheduled: adherence.totalScheduled,
      taken: adherence.taken,
      skipped: adherence.skipped,
      delayed: adherence.delayed,
      missed: adherence.missed,
      adherenceRate: adherence.adherenceRate,
      streak,
      averageDelayMinutes: Math.round(avgDelay),
      commonSkipReasons: skipReasons,
    };
  }

  /**
   * Get overall adherence report for a user
   */
  async getOverallAdherenceReport(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<OverallAdherenceReport> {
    const medications = await this.store.getActiveMedications(userId);
    const byMedication: AdherenceStats[] = [];

    for (const medication of medications) {
      const stats = await this.getMedicationAdherence(
        userId,
        medication.id,
        startDate,
        endDate
      );
      byMedication.push(stats);
    }

    // Calculate overall adherence
    const overallAdherence = await this.store.getOverallAdherence(userId, startDate, endDate);

    // Calculate weekly adherence for trends
    const weeklyAdherence = await this.calculateWeeklyAdherence(userId, startDate, endDate);

    // Determine trend direction
    const direction = this.calculateTrendDirection(weeklyAdherence);

    // Generate insights
    const insights = this.generateInsights(byMedication, overallAdherence, direction);

    return {
      userId,
      period: { startDate, endDate },
      overallAdherence: Math.round(overallAdherence * 10) / 10,
      byMedication,
      trends: {
        direction,
        weeklyAdherence,
      },
      insights,
    };
  }

  /**
   * Check if adherence is below threshold and emit alert
   */
  private async checkAdherenceAlert(userId: string, medicationId: string): Promise<void> {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const adherence = await this.store.calculateAdherence(
      userId,
      medicationId,
      'weekly',
      weekAgo,
      now
    );

    if (adherence.adherenceRate < this.config.lowAdherenceThreshold) {
      this.emit('adherence:low', {
        userId,
        medicationId,
        adherence,
        threshold: this.config.lowAdherenceThreshold,
      });
    }
  }

  /**
   * Calculate current and longest streak
   */
  private calculateStreak(doses: MedicationDose[]): { current: number; longest: number } {
    if (doses.length === 0) {
      return { current: 0, longest: 0 };
    }

    // Sort by scheduled time
    const sorted = [...doses].sort((a, b) => b.scheduledFor - a.scheduledFor);

    let current = 0;
    let longest = 0;
    let tempStreak = 0;

    for (const dose of sorted) {
      if (dose.status === 'taken' || dose.status === 'delayed') {
        tempStreak++;
        longest = Math.max(longest, tempStreak);
      } else {
        if (tempStreak > 0 && current === 0) {
          // This was the current streak that just broke
          // But only if we haven't counted current yet
        }
        tempStreak = 0;
      }
    }

    // Current streak is from most recent dose
    current = 0;
    for (const dose of sorted) {
      if (dose.status === 'taken' || dose.status === 'delayed') {
        current++;
      } else {
        break;
      }
    }

    return { current, longest };
  }

  /**
   * Aggregate skip reasons
   */
  private aggregateSkipReasons(
    doses: MedicationDose[]
  ): Array<{ reason: string; count: number }> {
    const reasons = new Map<string, number>();

    for (const dose of doses) {
      if (dose.status === 'skipped' && dose.skippedReason) {
        const count = reasons.get(dose.skippedReason) ?? 0;
        reasons.set(dose.skippedReason, count + 1);
      }
    }

    return Array.from(reasons.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  /**
   * Calculate weekly adherence values
   */
  private async calculateWeeklyAdherence(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<number[]> {
    const weeklyAdherence: number[] = [];
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    let weekStart = startDate;
    while (weekStart < endDate) {
      const weekEnd = Math.min(weekStart + weekMs, endDate);
      const adherence = await this.store.getOverallAdherence(userId, weekStart, weekEnd);
      weeklyAdherence.push(Math.round(adherence * 10) / 10);
      weekStart = weekEnd;
    }

    return weeklyAdherence;
  }

  /**
   * Calculate trend direction from weekly adherence
   */
  private calculateTrendDirection(
    weeklyAdherence: number[]
  ): 'improving' | 'stable' | 'declining' {
    if (weeklyAdherence.length < 2) {
      return 'stable';
    }

    const firstHalf = weeklyAdherence.slice(0, Math.floor(weeklyAdherence.length / 2));
    const secondHalf = weeklyAdherence.slice(Math.floor(weeklyAdherence.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = secondAvg - firstAvg;

    if (change > 5) return 'improving';
    if (change < -5) return 'declining';
    return 'stable';
  }

  /**
   * Generate insights based on adherence data
   */
  private generateInsights(
    byMedication: AdherenceStats[],
    overallAdherence: number,
    trend: 'improving' | 'stable' | 'declining'
  ): string[] {
    const insights: string[] = [];

    // Overall adherence insight
    if (overallAdherence >= 90) {
      insights.push('Excellent medication adherence! Keep up the great work.');
    } else if (overallAdherence >= 80) {
      insights.push('Good medication adherence. Small improvements can make a big difference.');
    } else if (overallAdherence >= 70) {
      insights.push('Medication adherence could improve. Consider setting additional reminders.');
    } else {
      insights.push(
        'Medication adherence is below recommended levels. Please discuss with your healthcare provider.'
      );
    }

    // Trend insight
    if (trend === 'improving') {
      insights.push('Your adherence is improving over time.');
    } else if (trend === 'declining') {
      insights.push('Your adherence has been declining. Try to identify and address barriers.');
    }

    // Medication-specific insights
    const lowAdherence = byMedication.filter(
      (m) => m.adherenceRate < this.config.lowAdherenceThreshold
    );
    if (lowAdherence.length > 0) {
      const names = lowAdherence.map((m) => m.medicationName).join(', ');
      insights.push(`Focus on improving adherence for: ${names}`);
    }

    // Skip reason insights
    const allSkipReasons = byMedication.flatMap((m) => m.commonSkipReasons);
    if (allSkipReasons.length > 0) {
      const topReason = allSkipReasons.sort((a, b) => b.count - a.count)[0];
      insights.push(`Most common reason for skipping: "${topReason.reason}"`);
    }

    // Streak insights
    const longestStreak = Math.max(...byMedication.map((m) => m.streak.longest));
    if (longestStreak >= 7) {
      insights.push(`Your longest streak was ${longestStreak} doses in a row!`);
    }

    return insights.slice(0, 5);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createAdherenceTracker(
  store: MedicationStore,
  config?: Partial<AdherenceTrackerConfig>
): AdherenceTracker {
  return new AdherenceTracker(store, config);
}
