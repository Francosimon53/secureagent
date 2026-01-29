/**
 * Medication Reminder Scheduler
 *
 * Schedules and manages medication reminders based on medication schedules.
 */

import { EventEmitter } from 'events';
import type { MedicationStore } from '../stores/medication-store.js';
import type {
  Medication,
  MedicationDose,
  MedicationReminder,
  MedicationFrequency,
} from '../types.js';

// =============================================================================
// Scheduler Configuration
// =============================================================================

export interface SchedulerConfig {
  defaultReminderMinutesBefore: number;
  snoozeIntervalMinutes: number;
  maxSnoozeCount: number;
  missedWindowMinutes: number;
  lookAheadDays: number;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  defaultReminderMinutesBefore: 5,
  snoozeIntervalMinutes: 10,
  maxSnoozeCount: 3,
  missedWindowMinutes: 120,
  lookAheadDays: 7,
};

// =============================================================================
// Scheduled Reminder
// =============================================================================

export interface ScheduledReminder {
  medication: Medication;
  dose: MedicationDose;
  reminderTime: number;
  doseTime: number;
  snoozeCount: number;
}

// =============================================================================
// Reminder Scheduler
// =============================================================================

export class ReminderScheduler extends EventEmitter {
  private readonly config: SchedulerConfig;
  private scheduledReminders = new Map<string, ScheduledReminder>();
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly store: MedicationStore,
    config: Partial<SchedulerConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate scheduled doses for a medication
   */
  async generateScheduledDoses(
    medication: Medication,
    startDate: number,
    endDate: number
  ): Promise<MedicationDose[]> {
    const doses: MedicationDose[] = [];
    const scheduleTimes = this.getScheduleTimes(medication);

    let currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
    const end = new Date(endDate);

    while (currentDate <= end) {
      // Check if medication is active on this date
      if (currentDate.getTime() >= medication.startDate) {
        if (medication.endDate && currentDate.getTime() > medication.endDate) {
          break;
        }

        // Check day of week for weekly/custom frequencies
        if (this.shouldScheduleOnDay(medication, currentDate)) {
          for (const time of scheduleTimes) {
            const [hours, minutes] = time.split(':').map(Number);
            const doseTime = new Date(currentDate);
            doseTime.setHours(hours, minutes, 0, 0);

            if (doseTime.getTime() >= startDate && doseTime.getTime() <= endDate) {
              const dose = await this.store.createDose({
                medicationId: medication.id,
                userId: medication.userId,
                scheduledFor: doseTime.getTime(),
                status: 'scheduled',
              });
              doses.push(dose);
            }
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return doses;
  }

  /**
   * Get schedule times based on medication frequency and reminders
   */
  private getScheduleTimes(medication: Medication): string[] {
    // If reminders are configured, use those times
    if (medication.reminders.length > 0) {
      return medication.reminders.filter((r) => r.enabled).map((r) => r.time);
    }

    // Otherwise, generate default times based on frequency
    switch (medication.frequency) {
      case 'once_daily':
        return ['08:00'];
      case 'twice_daily':
        return ['08:00', '20:00'];
      case 'three_times_daily':
        return ['08:00', '14:00', '20:00'];
      case 'four_times_daily':
        return ['08:00', '12:00', '16:00', '20:00'];
      case 'weekly':
        return ['08:00'];
      case 'every_other_day':
        return ['08:00'];
      case 'as_needed':
        return []; // No scheduled doses
      case 'custom':
        return medication.reminders.filter((r) => r.enabled).map((r) => r.time);
      default:
        return ['08:00'];
    }
  }

  /**
   * Check if medication should be scheduled on a specific day
   */
  private shouldScheduleOnDay(medication: Medication, date: Date): boolean {
    const dayOfWeek = date.getDay();

    switch (medication.frequency) {
      case 'weekly':
        // Check if any reminder is configured for this day
        return medication.reminders.some((r) => r.daysOfWeek?.includes(dayOfWeek));

      case 'every_other_day':
        // Calculate days since start date
        const daysSinceStart = Math.floor(
          (date.getTime() - medication.startDate) / (24 * 60 * 60 * 1000)
        );
        return daysSinceStart % 2 === 0;

      case 'custom':
        // Check reminder days of week
        return medication.reminders.some(
          (r) => r.enabled && (!r.daysOfWeek || r.daysOfWeek.includes(dayOfWeek))
        );

      default:
        return true;
    }
  }

  /**
   * Schedule reminder for a dose
   */
  scheduleReminder(medication: Medication, dose: MedicationDose): void {
    const reminderTime =
      dose.scheduledFor - this.config.defaultReminderMinutesBefore * 60 * 1000;

    // Don't schedule if reminder time is in the past
    if (reminderTime <= Date.now()) {
      return;
    }

    const reminder: ScheduledReminder = {
      medication,
      dose,
      reminderTime,
      doseTime: dose.scheduledFor,
      snoozeCount: 0,
    };

    this.scheduledReminders.set(dose.id, reminder);

    // Set timer
    const delay = reminderTime - Date.now();
    const timer = setTimeout(() => {
      this.triggerReminder(dose.id);
    }, delay);

    this.timers.set(dose.id, timer);
  }

  /**
   * Trigger a reminder
   */
  private triggerReminder(doseId: string): void {
    const reminder = this.scheduledReminders.get(doseId);
    if (!reminder) return;

    this.emit('reminder:trigger', {
      medication: reminder.medication,
      dose: reminder.dose,
      snoozeCount: reminder.snoozeCount,
    });
  }

  /**
   * Snooze a reminder
   */
  snoozeReminder(doseId: string): boolean {
    const reminder = this.scheduledReminders.get(doseId);
    if (!reminder) return false;

    if (reminder.snoozeCount >= this.config.maxSnoozeCount) {
      this.emit('reminder:max-snooze', {
        medication: reminder.medication,
        dose: reminder.dose,
      });
      return false;
    }

    // Cancel existing timer
    const existingTimer = this.timers.get(doseId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Update reminder
    reminder.snoozeCount++;
    reminder.reminderTime = Date.now() + this.config.snoozeIntervalMinutes * 60 * 1000;
    this.scheduledReminders.set(doseId, reminder);

    // Set new timer
    const timer = setTimeout(() => {
      this.triggerReminder(doseId);
    }, this.config.snoozeIntervalMinutes * 60 * 1000);

    this.timers.set(doseId, timer);

    this.emit('reminder:snoozed', {
      medication: reminder.medication,
      dose: reminder.dose,
      snoozeCount: reminder.snoozeCount,
      nextReminderTime: reminder.reminderTime,
    });

    return true;
  }

  /**
   * Cancel a scheduled reminder
   */
  cancelReminder(doseId: string): void {
    const timer = this.timers.get(doseId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(doseId);
    }
    this.scheduledReminders.delete(doseId);
  }

  /**
   * Get upcoming reminders for a user
   */
  async getUpcomingReminders(
    userId: string,
    hours: number = 24
  ): Promise<ScheduledReminder[]> {
    const endTime = Date.now() + hours * 60 * 60 * 1000;
    const doses = await this.store.getScheduledDoses(userId, Date.now(), endTime);
    const medications = await this.store.getActiveMedications(userId);
    const medicationMap = new Map(medications.map((m) => [m.id, m]));

    return doses
      .filter((dose) => dose.status === 'scheduled')
      .map((dose) => {
        const medication = medicationMap.get(dose.medicationId);
        if (!medication) return null;

        const existing = this.scheduledReminders.get(dose.id);
        if (existing) return existing;

        return {
          medication,
          dose,
          reminderTime:
            dose.scheduledFor - this.config.defaultReminderMinutesBefore * 60 * 1000,
          doseTime: dose.scheduledFor,
          snoozeCount: 0,
        };
      })
      .filter((r): r is ScheduledReminder => r !== null)
      .sort((a, b) => a.reminderTime - b.reminderTime);
  }

  /**
   * Check for missed doses and update their status
   */
  async checkMissedDoses(userId: string): Promise<MedicationDose[]> {
    const missedCutoff = Date.now() - this.config.missedWindowMinutes * 60 * 1000;
    const pendingDoses = await this.store.getPendingDoses(userId);

    const missedDoses: MedicationDose[] = [];

    for (const dose of pendingDoses) {
      if (dose.scheduledFor < missedCutoff) {
        const updated = await this.store.updateDose(dose.id, {
          status: 'missed',
        });
        if (updated) {
          missedDoses.push(updated);
          this.cancelReminder(dose.id);

          this.emit('dose:missed', {
            dose: updated,
          });
        }
      }
    }

    return missedDoses;
  }

  /**
   * Clear all scheduled reminders
   */
  clearAllReminders(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.scheduledReminders.clear();
  }

  /**
   * Initialize reminders for a user
   */
  async initializeReminders(userId: string): Promise<void> {
    const medications = await this.store.getActiveMedications(userId);

    for (const medication of medications) {
      const now = Date.now();
      const endTime = now + this.config.lookAheadDays * 24 * 60 * 60 * 1000;

      // Generate doses if needed
      const existingDoses = await this.store.getScheduledDoses(userId, now, endTime);
      const existingForMed = existingDoses.filter((d) => d.medicationId === medication.id);

      if (existingForMed.length === 0) {
        const doses = await this.generateScheduledDoses(medication, now, endTime);
        for (const dose of doses) {
          this.scheduleReminder(medication, dose);
        }
      } else {
        for (const dose of existingForMed) {
          if (dose.status === 'scheduled') {
            this.scheduleReminder(medication, dose);
          }
        }
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createReminderScheduler(
  store: MedicationStore,
  config?: Partial<SchedulerConfig>
): ReminderScheduler {
  return new ReminderScheduler(store, config);
}
