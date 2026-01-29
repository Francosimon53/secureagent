/**
 * Notification Scheduler
 *
 * Schedules and manages event reminders for school calendar events.
 */

import { randomUUID } from 'crypto';
import type {
  EventReminder,
  ReminderChannel,
  ScheduledReminder,
  SchoolEvent,
} from '../types.js';
import type { EventReminderStore } from '../stores/school-event-store.js';

// ============================================================================
// Configuration
// ============================================================================

export interface NotificationSchedulerConfig {
  defaultReminderMinutes: number[];
  defaultChannels: ReminderChannel[];
  checkIntervalMs: number;
  notificationHandler?: NotificationHandler;
}

export interface NotificationHandler {
  send(reminder: ScheduledReminder, event: SchoolEvent): Promise<boolean>;
}

// ============================================================================
// Notification Scheduler
// ============================================================================

export class NotificationScheduler {
  private readonly reminderStore: EventReminderStore;
  private readonly config: NotificationSchedulerConfig;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(
    reminderStore: EventReminderStore,
    config?: Partial<NotificationSchedulerConfig>
  ) {
    this.reminderStore = reminderStore;
    this.config = {
      defaultReminderMinutes: config?.defaultReminderMinutes || [60, 1440], // 1 hour, 1 day
      defaultChannels: config?.defaultChannels || ['push'],
      checkIntervalMs: config?.checkIntervalMs || 60000, // Check every minute
      notificationHandler: config?.notificationHandler,
    };
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.checkInterval = setInterval(
      () => this.processPendingReminders(),
      this.config.checkIntervalMs
    );

    // Run immediately on start
    this.processPendingReminders();
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Schedule reminders for an event
   */
  async scheduleReminders(
    event: SchoolEvent,
    reminderMinutes?: number[],
    channels?: ReminderChannel[]
  ): Promise<ScheduledReminder[]> {
    const minutes = reminderMinutes || this.config.defaultReminderMinutes;
    const reminderChannels = channels || this.config.defaultChannels;

    const reminders: ScheduledReminder[] = [];

    for (const minutesBefore of minutes) {
      const scheduledFor = event.startTime - minutesBefore * 60 * 1000;

      // Don't schedule reminders in the past
      if (scheduledFor <= Date.now()) continue;

      const reminder = await this.reminderStore.createReminder({
        eventId: event.id,
        familyGroupId: event.familyGroupId,
        minutesBefore,
        channels: reminderChannels,
        scheduledFor,
        sent: false,
      });

      reminders.push(reminder);
    }

    return reminders;
  }

  /**
   * Update reminders for an event
   */
  async updateReminders(
    event: SchoolEvent,
    newReminderMinutes: number[],
    channels?: ReminderChannel[]
  ): Promise<ScheduledReminder[]> {
    // Delete existing reminders
    await this.reminderStore.deleteByEvent(event.id);

    // Schedule new reminders
    return this.scheduleReminders(event, newReminderMinutes, channels);
  }

  /**
   * Cancel reminders for an event
   */
  async cancelReminders(eventId: string): Promise<number> {
    return this.reminderStore.deleteByEvent(eventId);
  }

  /**
   * Get upcoming reminders
   */
  async getUpcomingReminders(
    familyGroupId: string,
    withinMinutes: number
  ): Promise<ScheduledReminder[]> {
    const threshold = Date.now() + withinMinutes * 60 * 1000;
    const all = await this.reminderStore.getPendingReminders(threshold);
    return all.filter(r => r.familyGroupId === familyGroupId);
  }

  /**
   * Process pending reminders (called by scheduler)
   */
  async processPendingReminders(): Promise<ProcessResult> {
    const now = Date.now();
    const pending = await this.reminderStore.getPendingReminders(now);

    const result: ProcessResult = {
      processed: 0,
      sent: 0,
      failed: 0,
    };

    for (const reminder of pending) {
      result.processed++;

      try {
        if (this.config.notificationHandler) {
          // Get event details for the notification
          // Note: This would need the event store to be passed in for real implementation
          const mockEvent: SchoolEvent = {
            id: reminder.eventId,
            familyGroupId: reminder.familyGroupId,
            sourceId: '',
            title: 'Event Reminder',
            eventType: 'other',
            startTime: reminder.scheduledFor + reminder.minutesBefore * 60 * 1000,
            endTime: reminder.scheduledFor + reminder.minutesBefore * 60 * 1000 + 3600000,
            isAllDay: false,
            reminders: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          const sent = await this.config.notificationHandler.send(reminder, mockEvent);
          if (sent) {
            await this.reminderStore.markSent(reminder.id);
            result.sent++;
          } else {
            result.failed++;
          }
        } else {
          // No handler, just mark as sent
          await this.reminderStore.markSent(reminder.id);
          result.sent++;
        }
      } catch (error) {
        console.error(`Failed to process reminder ${reminder.id}:`, error);
        result.failed++;
      }
    }

    return result;
  }

  /**
   * Create reminder configuration from event
   */
  createReminderConfig(
    eventType: SchoolEvent['eventType']
  ): { minutesBefore: number[]; channels: ReminderChannel[] } {
    // Different reminder settings based on event type
    switch (eventType) {
      case 'exam':
        return {
          minutesBefore: [60, 1440, 10080], // 1 hour, 1 day, 1 week
          channels: ['push', 'email'],
        };
      case 'deadline':
        return {
          minutesBefore: [60, 1440, 4320], // 1 hour, 1 day, 3 days
          channels: ['push', 'email'],
        };
      case 'meeting':
        return {
          minutesBefore: [30, 1440], // 30 min, 1 day
          channels: ['push'],
        };
      case 'activity':
        return {
          minutesBefore: [60, 1440], // 1 hour, 1 day
          channels: ['push'],
        };
      default:
        return {
          minutesBefore: this.config.defaultReminderMinutes,
          channels: this.config.defaultChannels,
        };
    }
  }
}

// ============================================================================
// Types
// ============================================================================

export interface ProcessResult {
  processed: number;
  sent: number;
  failed: number;
}

// ============================================================================
// Console Notification Handler (for testing/debugging)
// ============================================================================

export class ConsoleNotificationHandler implements NotificationHandler {
  async send(reminder: ScheduledReminder, event: SchoolEvent): Promise<boolean> {
    console.log(
      `[REMINDER] Event: ${event.title} | ` +
      `Starts: ${new Date(event.startTime).toISOString()} | ` +
      `Channels: ${reminder.channels.join(', ')}`
    );
    return true;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createNotificationScheduler(
  reminderStore: EventReminderStore,
  config?: Partial<NotificationSchedulerConfig>
): NotificationScheduler {
  return new NotificationScheduler(reminderStore, config);
}
