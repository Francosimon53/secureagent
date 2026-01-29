/**
 * School Calendar Service
 *
 * Service for managing school calendars, syncing events, and sending notifications.
 */

import type {
  CalendarProvider,
  EventReminder,
  ReminderChannel,
  ScheduledReminder,
  SchoolCalendarSource,
  SchoolEvent,
  SchoolEventQueryOptions,
  SchoolEventType,
} from '../types.js';
import type {
  EventReminderStore,
  SchoolCalendarSourceStore,
  SchoolEventStore,
} from '../stores/school-event-store.js';
import type {
  CalendarSyncOptions,
  ParsedCalendarEvent,
  SchoolCalendarProvider,
} from '../providers/calendar.js';
import {
  NotificationScheduler,
  type NotificationHandler,
  type NotificationSchedulerConfig,
} from './notification-scheduler.js';

// ============================================================================
// Service Configuration
// ============================================================================

export interface SchoolCalendarServiceConfig {
  syncIntervalMinutes: number;
  enableNotifications: boolean;
  notificationScheduler?: Partial<NotificationSchedulerConfig>;
}

// ============================================================================
// School Calendar Service
// ============================================================================

export class SchoolCalendarService {
  private readonly eventStore: SchoolEventStore;
  private readonly sourceStore: SchoolCalendarSourceStore;
  private readonly reminderStore: EventReminderStore;
  private readonly calendarProviders: Map<CalendarProvider, SchoolCalendarProvider>;
  private readonly notificationScheduler: NotificationScheduler;
  private readonly config: SchoolCalendarServiceConfig;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    eventStore: SchoolEventStore,
    sourceStore: SchoolCalendarSourceStore,
    reminderStore: EventReminderStore,
    calendarProviders?: Map<CalendarProvider, SchoolCalendarProvider>,
    config?: Partial<SchoolCalendarServiceConfig>
  ) {
    this.eventStore = eventStore;
    this.sourceStore = sourceStore;
    this.reminderStore = reminderStore;
    this.calendarProviders = calendarProviders || new Map();
    this.config = {
      syncIntervalMinutes: config?.syncIntervalMinutes || 60,
      enableNotifications: config?.enableNotifications ?? true,
      notificationScheduler: config?.notificationScheduler,
    };
    this.notificationScheduler = new NotificationScheduler(
      reminderStore,
      config?.notificationScheduler
    );
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Start the calendar service (sync timer + notifications)
   */
  start(): void {
    // Start notification scheduler
    if (this.config.enableNotifications) {
      this.notificationScheduler.start();
    }

    // Start sync timer
    this.syncInterval = setInterval(
      () => this.syncAllSources(),
      this.config.syncIntervalMinutes * 60 * 1000
    );
  }

  /**
   * Stop the calendar service
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.notificationScheduler.stop();
  }

  // ============================================================================
  // Calendar Source Management
  // ============================================================================

  /**
   * Add a calendar source
   */
  async addCalendarSource(
    source: Omit<SchoolCalendarSource, 'id' | 'createdAt' | 'lastSyncAt'>
  ): Promise<SchoolCalendarSource> {
    const created = await this.sourceStore.createSource({
      ...source,
      syncStatus: 'active',
    });

    // Initial sync
    await this.syncSource(created.id);

    return created;
  }

  /**
   * Get a calendar source
   */
  async getCalendarSource(id: string): Promise<SchoolCalendarSource | null> {
    return this.sourceStore.getSource(id);
  }

  /**
   * Update a calendar source
   */
  async updateCalendarSource(
    id: string,
    updates: Partial<Pick<SchoolCalendarSource, 'name' | 'syncUrl' | 'syncStatus'>>
  ): Promise<SchoolCalendarSource | null> {
    return this.sourceStore.updateSource(id, updates);
  }

  /**
   * Remove a calendar source (and its events)
   */
  async removeCalendarSource(id: string): Promise<boolean> {
    // Delete events from this source
    await this.eventStore.deleteBySource(id);

    // Delete the source
    return this.sourceStore.deleteSource(id);
  }

  /**
   * List calendar sources for a family
   */
  async listCalendarSources(familyGroupId: string): Promise<SchoolCalendarSource[]> {
    return this.sourceStore.listSources(familyGroupId);
  }

  // ============================================================================
  // Calendar Sync
  // ============================================================================

  /**
   * Sync a specific calendar source
   */
  async syncSource(sourceId: string): Promise<SyncResult> {
    const source = await this.sourceStore.getSource(sourceId);
    if (!source) {
      return { success: false, error: 'Source not found' };
    }

    const provider = this.calendarProviders.get(source.provider);
    if (!provider) {
      await this.sourceStore.markSyncError(sourceId, 'Provider not configured');
      return { success: false, error: 'Provider not configured' };
    }

    if (!source.syncUrl && source.provider !== 'manual') {
      await this.sourceStore.markSyncError(sourceId, 'No sync URL configured');
      return { success: false, error: 'No sync URL configured' };
    }

    try {
      // Get events from provider
      const syncOptions: CalendarSyncOptions = {
        startDate: new Date(),
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      };

      const result = await provider.syncEvents(
        sourceId,
        source.syncUrl || '',
        syncOptions
      );

      if (!result.success || !result.data) {
        await this.sourceStore.markSyncError(sourceId, result.error);
        return { success: false, error: result.error };
      }

      // Process synced events
      const stats = await this.processEvents(source, result.data.events);

      // Mark source as synced
      await this.sourceStore.markSynced(sourceId);

      return {
        success: true,
        eventsAdded: stats.added,
        eventsUpdated: stats.updated,
        eventsRemoved: stats.removed,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Sync failed';
      await this.sourceStore.markSyncError(sourceId, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Sync all active sources
   */
  async syncAllSources(): Promise<Map<string, SyncResult>> {
    const sources = await this.sourceStore.getSourcesNeedingSync(
      this.config.syncIntervalMinutes
    );

    const results = new Map<string, SyncResult>();

    for (const source of sources) {
      const result = await this.syncSource(source.id);
      results.set(source.id, result);
    }

    return results;
  }

  // ============================================================================
  // Event Management
  // ============================================================================

  /**
   * Create a manual event
   */
  async createEvent(
    event: Omit<SchoolEvent, 'id' | 'createdAt' | 'updatedAt' | 'reminders'>,
    reminderMinutes?: number[]
  ): Promise<SchoolEvent> {
    const created = await this.eventStore.createEvent({
      ...event,
      reminders: [],
    });

    // Schedule reminders
    if (this.config.enableNotifications) {
      await this.notificationScheduler.scheduleReminders(created, reminderMinutes);
    }

    return created;
  }

  /**
   * Get an event
   */
  async getEvent(id: string): Promise<SchoolEvent | null> {
    return this.eventStore.getEvent(id);
  }

  /**
   * Update an event
   */
  async updateEvent(
    id: string,
    updates: Partial<Omit<SchoolEvent, 'id' | 'createdAt' | 'familyGroupId' | 'sourceId'>>
  ): Promise<SchoolEvent | null> {
    const updated = await this.eventStore.updateEvent(id, updates);

    // Reschedule reminders if start time changed
    if (updated && updates.startTime !== undefined && this.config.enableNotifications) {
      const reminderConfig = this.notificationScheduler.createReminderConfig(updated.eventType);
      await this.notificationScheduler.updateReminders(
        updated,
        reminderConfig.minutesBefore,
        reminderConfig.channels
      );
    }

    return updated;
  }

  /**
   * Delete an event
   */
  async deleteEvent(id: string): Promise<boolean> {
    // Cancel reminders first
    await this.notificationScheduler.cancelReminders(id);

    return this.eventStore.deleteEvent(id);
  }

  /**
   * List events
   */
  async listEvents(options: SchoolEventQueryOptions): Promise<SchoolEvent[]> {
    return this.eventStore.listEvents(options);
  }

  /**
   * Get upcoming events
   */
  async getUpcomingEvents(familyGroupId: string, days = 7): Promise<SchoolEvent[]> {
    return this.eventStore.getUpcomingEvents(familyGroupId, days);
  }

  /**
   * Get events for a specific child
   */
  async getChildEvents(
    childUserId: string,
    options?: Partial<SchoolEventQueryOptions>
  ): Promise<SchoolEvent[]> {
    return this.eventStore.getEventsByChild(childUserId, options as SchoolEventQueryOptions);
  }

  /**
   * Get events by type
   */
  async getEventsByType(
    familyGroupId: string,
    eventType: SchoolEventType
  ): Promise<SchoolEvent[]> {
    return this.eventStore.listEvents({ familyGroupId, eventType });
  }

  // ============================================================================
  // Reminder Management
  // ============================================================================

  /**
   * Set reminders for an event
   */
  async setReminders(
    eventId: string,
    minutesBefore: number[],
    channels?: ReminderChannel[]
  ): Promise<ScheduledReminder[]> {
    const event = await this.eventStore.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    return this.notificationScheduler.updateReminders(event, minutesBefore, channels);
  }

  /**
   * Get reminders for an event
   */
  async getEventReminders(eventId: string): Promise<ScheduledReminder[]> {
    return this.reminderStore.getRemindersForEvent(eventId);
  }

  /**
   * Cancel reminders for an event
   */
  async cancelReminders(eventId: string): Promise<number> {
    return this.notificationScheduler.cancelReminders(eventId);
  }

  // ============================================================================
  // Provider Management
  // ============================================================================

  /**
   * Register a calendar provider
   */
  registerProvider(type: CalendarProvider, provider: SchoolCalendarProvider): void {
    this.calendarProviders.set(type, provider);
  }

  /**
   * Check if a provider is registered
   */
  hasProvider(type: CalendarProvider): boolean {
    return this.calendarProviders.has(type);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async processEvents(
    source: SchoolCalendarSource,
    parsedEvents: ParsedCalendarEvent[]
  ): Promise<EventStats> {
    const stats: EventStats = { added: 0, updated: 0, removed: 0 };

    // Get existing events for this source
    const existingEvents = await this.eventStore.listEvents({
      familyGroupId: source.familyGroupId,
    });
    const existingByExternalId = new Map(
      existingEvents
        .filter(e => e.sourceId === source.id && e.externalId)
        .map(e => [e.externalId!, e])
    );

    const processedExternalIds = new Set<string>();

    for (const parsed of parsedEvents) {
      processedExternalIds.add(parsed.externalId);

      const existing = existingByExternalId.get(parsed.externalId);

      if (existing) {
        // Update if changed
        if (this.hasEventChanged(existing, parsed)) {
          await this.eventStore.updateEvent(existing.id, {
            title: parsed.title,
            description: parsed.description,
            startTime: parsed.startTime,
            endTime: parsed.endTime,
            location: parsed.location,
            isAllDay: parsed.isAllDay,
            eventType: parsed.eventType,
          });
          stats.updated++;
        }
      } else {
        // Create new event
        const event = await this.eventStore.createEvent({
          familyGroupId: source.familyGroupId,
          sourceId: source.id,
          childUserId: source.childUserId,
          externalId: parsed.externalId,
          title: parsed.title,
          description: parsed.description,
          eventType: parsed.eventType,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          location: parsed.location,
          isAllDay: parsed.isAllDay,
          reminders: [],
        });

        // Schedule reminders for new events
        if (this.config.enableNotifications) {
          const reminderConfig = this.notificationScheduler.createReminderConfig(parsed.eventType);
          await this.notificationScheduler.scheduleReminders(
            event,
            reminderConfig.minutesBefore,
            reminderConfig.channels
          );
        }

        stats.added++;
      }
    }

    // Remove events that no longer exist in the source
    for (const [externalId, existing] of existingByExternalId) {
      if (!processedExternalIds.has(externalId)) {
        await this.notificationScheduler.cancelReminders(existing.id);
        await this.eventStore.deleteEvent(existing.id);
        stats.removed++;
      }
    }

    return stats;
  }

  private hasEventChanged(existing: SchoolEvent, parsed: ParsedCalendarEvent): boolean {
    return (
      existing.title !== parsed.title ||
      existing.description !== parsed.description ||
      existing.startTime !== parsed.startTime ||
      existing.endTime !== parsed.endTime ||
      existing.location !== parsed.location ||
      existing.isAllDay !== parsed.isAllDay
    );
  }
}

// ============================================================================
// Types
// ============================================================================

export interface SyncResult {
  success: boolean;
  error?: string;
  eventsAdded?: number;
  eventsUpdated?: number;
  eventsRemoved?: number;
}

interface EventStats {
  added: number;
  updated: number;
  removed: number;
}

// ============================================================================
// Exports
// ============================================================================

export {
  NotificationScheduler,
  type NotificationSchedulerConfig,
  type NotificationHandler,
  type ProcessResult,
  ConsoleNotificationHandler,
  createNotificationScheduler,
} from './notification-scheduler.js';

export function createSchoolCalendarService(
  eventStore: SchoolEventStore,
  sourceStore: SchoolCalendarSourceStore,
  reminderStore: EventReminderStore,
  calendarProviders?: Map<CalendarProvider, SchoolCalendarProvider>,
  config?: Partial<SchoolCalendarServiceConfig>
): SchoolCalendarService {
  return new SchoolCalendarService(
    eventStore,
    sourceStore,
    reminderStore,
    calendarProviders,
    config
  );
}
