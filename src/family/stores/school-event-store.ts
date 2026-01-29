/**
 * School Event Store
 *
 * Persistence layer for school calendar events and reminders.
 */

import { randomUUID } from 'crypto';
import type {
  CalendarProvider,
  DatabaseAdapter,
  EventReminder,
  ReminderChannel,
  ScheduledReminder,
  SchoolCalendarSource,
  SchoolEvent,
  SchoolEventQueryOptions,
  SchoolEventType,
  SyncStatus,
} from '../types.js';

// ============================================================================
// School Event Store Interface
// ============================================================================

export interface SchoolEventStore {
  initialize(): Promise<void>;

  // Event CRUD
  createEvent(event: Omit<SchoolEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<SchoolEvent>;
  getEvent(id: string): Promise<SchoolEvent | null>;
  updateEvent(id: string, updates: Partial<Omit<SchoolEvent, 'id' | 'createdAt'>>): Promise<SchoolEvent | null>;
  deleteEvent(id: string): Promise<boolean>;

  // Query
  listEvents(options: SchoolEventQueryOptions): Promise<SchoolEvent[]>;
  getUpcomingEvents(familyGroupId: string, days: number): Promise<SchoolEvent[]>;
  getEventsByChild(childUserId: string, options?: SchoolEventQueryOptions): Promise<SchoolEvent[]>;
  getEventByExternalId(sourceId: string, externalId: string): Promise<SchoolEvent | null>;

  // Bulk operations
  bulkCreate(events: Omit<SchoolEvent, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<SchoolEvent[]>;
  bulkDelete(eventIds: string[]): Promise<number>;
  deleteBySource(sourceId: string): Promise<number>;
}

// ============================================================================
// Calendar Source Store Interface
// ============================================================================

export interface SchoolCalendarSourceStore {
  initialize(): Promise<void>;

  // CRUD
  createSource(source: Omit<SchoolCalendarSource, 'id' | 'createdAt'>): Promise<SchoolCalendarSource>;
  getSource(id: string): Promise<SchoolCalendarSource | null>;
  updateSource(id: string, updates: Partial<Omit<SchoolCalendarSource, 'id' | 'createdAt'>>): Promise<SchoolCalendarSource | null>;
  deleteSource(id: string): Promise<boolean>;

  // Query
  listSources(familyGroupId: string): Promise<SchoolCalendarSource[]>;
  getSourcesByChild(childUserId: string): Promise<SchoolCalendarSource[]>;
  getSourcesNeedingSync(maxAgeMinutes: number): Promise<SchoolCalendarSource[]>;

  // Sync status
  markSynced(id: string): Promise<SchoolCalendarSource | null>;
  markSyncError(id: string, error?: string): Promise<SchoolCalendarSource | null>;
}

// ============================================================================
// Event Reminder Store Interface
// ============================================================================

export interface EventReminderStore {
  initialize(): Promise<void>;

  // CRUD
  createReminder(reminder: Omit<ScheduledReminder, 'id' | 'createdAt'>): Promise<ScheduledReminder>;
  getReminder(id: string): Promise<ScheduledReminder | null>;
  deleteReminder(id: string): Promise<boolean>;

  // Query
  getRemindersForEvent(eventId: string): Promise<ScheduledReminder[]>;
  getPendingReminders(beforeTimestamp: number): Promise<ScheduledReminder[]>;

  // Status
  markSent(id: string): Promise<ScheduledReminder | null>;
  bulkMarkSent(ids: string[]): Promise<number>;
  deleteByEvent(eventId: string): Promise<number>;
}

// ============================================================================
// Database Row Types
// ============================================================================

interface SchoolEventRow {
  id: string;
  family_group_id: string;
  source_id: string;
  child_user_id: string | null;
  external_id: string | null;
  title: string;
  description: string | null;
  event_type: string;
  start_time: number;
  end_time: number;
  location: string | null;
  is_all_day: number;
  reminders: string;
  created_at: number;
  updated_at: number;
}

interface CalendarSourceRow {
  id: string;
  family_group_id: string;
  child_user_id: string | null;
  name: string;
  provider: string;
  sync_url: string | null;
  credentials: string | null;
  last_sync_at: number | null;
  sync_status: string;
  created_at: number;
}

interface ReminderRow {
  id: string;
  event_id: string;
  family_group_id: string;
  minutes_before: number;
  channels: string;
  scheduled_for: number;
  sent: number;
  sent_at: number | null;
  created_at: number;
}

// ============================================================================
// Database School Event Store
// ============================================================================

export class DatabaseSchoolEventStore implements SchoolEventStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS school_events (
        id TEXT PRIMARY KEY,
        family_group_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        child_user_id TEXT,
        external_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        event_type TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        location TEXT,
        is_all_day INTEGER DEFAULT 0,
        reminders TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_school_events_family ON school_events(family_group_id, start_time)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_school_events_child ON school_events(child_user_id, start_time)
    `);
  }

  async createEvent(event: Omit<SchoolEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<SchoolEvent> {
    const now = Date.now();
    const id = randomUUID();

    const newEvent: SchoolEvent = {
      ...event,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO school_events (
        id, family_group_id, source_id, child_user_id, external_id, title, description,
        event_type, start_time, end_time, location, is_all_day, reminders, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newEvent.id,
        newEvent.familyGroupId,
        newEvent.sourceId,
        newEvent.childUserId ?? null,
        newEvent.externalId ?? null,
        newEvent.title,
        newEvent.description ?? null,
        newEvent.eventType,
        newEvent.startTime,
        newEvent.endTime,
        newEvent.location ?? null,
        newEvent.isAllDay ? 1 : 0,
        JSON.stringify(newEvent.reminders),
        newEvent.createdAt,
        newEvent.updatedAt,
      ]
    );

    return newEvent;
  }

  async getEvent(id: string): Promise<SchoolEvent | null> {
    const { rows } = await this.db.query<SchoolEventRow>(
      'SELECT * FROM school_events WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.rowToEvent(rows[0]);
  }

  async updateEvent(id: string, updates: Partial<Omit<SchoolEvent, 'id' | 'createdAt'>>): Promise<SchoolEvent | null> {
    const existing = await this.getEvent(id);
    if (!existing) return null;

    const updated: SchoolEvent = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `UPDATE school_events SET
        title = ?, description = ?, event_type = ?, start_time = ?, end_time = ?,
        location = ?, is_all_day = ?, reminders = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.title,
        updated.description ?? null,
        updated.eventType,
        updated.startTime,
        updated.endTime,
        updated.location ?? null,
        updated.isAllDay ? 1 : 0,
        JSON.stringify(updated.reminders),
        updated.updatedAt,
        id,
      ]
    );

    return updated;
  }

  async deleteEvent(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM school_events WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async listEvents(options: SchoolEventQueryOptions): Promise<SchoolEvent[]> {
    let sql = 'SELECT * FROM school_events WHERE family_group_id = ?';
    const params: unknown[] = [options.familyGroupId];

    if (options.childUserId) {
      sql += ' AND child_user_id = ?';
      params.push(options.childUserId);
    }

    if (options.startTime !== undefined) {
      sql += ' AND start_time >= ?';
      params.push(options.startTime);
    }

    if (options.endTime !== undefined) {
      sql += ' AND start_time <= ?';
      params.push(options.endTime);
    }

    if (options.eventType) {
      sql += ' AND event_type = ?';
      params.push(options.eventType);
    }

    const orderDir = options.orderDirection || 'asc';
    sql += ` ORDER BY start_time ${orderDir}`;

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const { rows } = await this.db.query<SchoolEventRow>(sql, params);
    return rows.map(row => this.rowToEvent(row));
  }

  async getUpcomingEvents(familyGroupId: string, days: number): Promise<SchoolEvent[]> {
    const now = Date.now();
    const endTime = now + days * 24 * 60 * 60 * 1000;

    return this.listEvents({
      familyGroupId,
      startTime: now,
      endTime,
    });
  }

  async getEventsByChild(childUserId: string, options?: SchoolEventQueryOptions): Promise<SchoolEvent[]> {
    const { rows } = await this.db.query<SchoolEventRow>(
      'SELECT family_group_id FROM school_events WHERE child_user_id = ? LIMIT 1',
      [childUserId]
    );

    if (rows.length === 0) return [];

    return this.listEvents({
      ...options,
      familyGroupId: rows[0].family_group_id,
      childUserId,
    });
  }

  async getEventByExternalId(sourceId: string, externalId: string): Promise<SchoolEvent | null> {
    const { rows } = await this.db.query<SchoolEventRow>(
      'SELECT * FROM school_events WHERE source_id = ? AND external_id = ?',
      [sourceId, externalId]
    );

    if (rows.length === 0) return null;
    return this.rowToEvent(rows[0]);
  }

  async bulkCreate(events: Omit<SchoolEvent, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<SchoolEvent[]> {
    const results: SchoolEvent[] = [];

    for (const event of events) {
      const created = await this.createEvent(event);
      results.push(created);
    }

    return results;
  }

  async bulkDelete(eventIds: string[]): Promise<number> {
    if (eventIds.length === 0) return 0;

    const placeholders = eventIds.map(() => '?').join(',');
    const result = await this.db.execute(
      `DELETE FROM school_events WHERE id IN (${placeholders})`,
      eventIds
    );

    return result.changes;
  }

  async deleteBySource(sourceId: string): Promise<number> {
    const result = await this.db.execute(
      'DELETE FROM school_events WHERE source_id = ?',
      [sourceId]
    );

    return result.changes;
  }

  private rowToEvent(row: SchoolEventRow): SchoolEvent {
    return {
      id: row.id,
      familyGroupId: row.family_group_id,
      sourceId: row.source_id,
      childUserId: row.child_user_id ?? undefined,
      externalId: row.external_id ?? undefined,
      title: row.title,
      description: row.description ?? undefined,
      eventType: row.event_type as SchoolEventType,
      startTime: row.start_time,
      endTime: row.end_time,
      location: row.location ?? undefined,
      isAllDay: row.is_all_day === 1,
      reminders: JSON.parse(row.reminders) as EventReminder[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ============================================================================
// Database Calendar Source Store
// ============================================================================

export class DatabaseSchoolCalendarSourceStore implements SchoolCalendarSourceStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS school_calendar_sources (
        id TEXT PRIMARY KEY,
        family_group_id TEXT NOT NULL,
        child_user_id TEXT,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        sync_url TEXT,
        credentials TEXT,
        last_sync_at INTEGER,
        sync_status TEXT DEFAULT 'active',
        created_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_calendar_sources_family ON school_calendar_sources(family_group_id)
    `);
  }

  async createSource(source: Omit<SchoolCalendarSource, 'id' | 'createdAt'>): Promise<SchoolCalendarSource> {
    const now = Date.now();
    const id = randomUUID();

    const newSource: SchoolCalendarSource = {
      ...source,
      id,
      createdAt: now,
    };

    await this.db.execute(
      `INSERT INTO school_calendar_sources (
        id, family_group_id, child_user_id, name, provider, sync_url, credentials, last_sync_at, sync_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newSource.id,
        newSource.familyGroupId,
        newSource.childUserId ?? null,
        newSource.name,
        newSource.provider,
        newSource.syncUrl ?? null,
        newSource.credentials ?? null,
        newSource.lastSyncAt ?? null,
        newSource.syncStatus,
        newSource.createdAt,
      ]
    );

    return newSource;
  }

  async getSource(id: string): Promise<SchoolCalendarSource | null> {
    const { rows } = await this.db.query<CalendarSourceRow>(
      'SELECT * FROM school_calendar_sources WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.rowToSource(rows[0]);
  }

  async updateSource(id: string, updates: Partial<Omit<SchoolCalendarSource, 'id' | 'createdAt'>>): Promise<SchoolCalendarSource | null> {
    const existing = await this.getSource(id);
    if (!existing) return null;

    const updated: SchoolCalendarSource = {
      ...existing,
      ...updates,
    };

    await this.db.execute(
      `UPDATE school_calendar_sources SET
        name = ?, provider = ?, sync_url = ?, credentials = ?, last_sync_at = ?, sync_status = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.provider,
        updated.syncUrl ?? null,
        updated.credentials ?? null,
        updated.lastSyncAt ?? null,
        updated.syncStatus,
        id,
      ]
    );

    return updated;
  }

  async deleteSource(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM school_calendar_sources WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async listSources(familyGroupId: string): Promise<SchoolCalendarSource[]> {
    const { rows } = await this.db.query<CalendarSourceRow>(
      'SELECT * FROM school_calendar_sources WHERE family_group_id = ? ORDER BY name',
      [familyGroupId]
    );

    return rows.map(row => this.rowToSource(row));
  }

  async getSourcesByChild(childUserId: string): Promise<SchoolCalendarSource[]> {
    const { rows } = await this.db.query<CalendarSourceRow>(
      'SELECT * FROM school_calendar_sources WHERE child_user_id = ? ORDER BY name',
      [childUserId]
    );

    return rows.map(row => this.rowToSource(row));
  }

  async getSourcesNeedingSync(maxAgeMinutes: number): Promise<SchoolCalendarSource[]> {
    const threshold = Date.now() - maxAgeMinutes * 60 * 1000;

    const { rows } = await this.db.query<CalendarSourceRow>(
      `SELECT * FROM school_calendar_sources
       WHERE sync_status = 'active' AND (last_sync_at IS NULL OR last_sync_at < ?)`,
      [threshold]
    );

    return rows.map(row => this.rowToSource(row));
  }

  async markSynced(id: string): Promise<SchoolCalendarSource | null> {
    return this.updateSource(id, {
      lastSyncAt: Date.now(),
      syncStatus: 'active',
    });
  }

  async markSyncError(id: string, _error?: string): Promise<SchoolCalendarSource | null> {
    return this.updateSource(id, {
      syncStatus: 'error',
    });
  }

  private rowToSource(row: CalendarSourceRow): SchoolCalendarSource {
    return {
      id: row.id,
      familyGroupId: row.family_group_id,
      childUserId: row.child_user_id ?? undefined,
      name: row.name,
      provider: row.provider as CalendarProvider,
      syncUrl: row.sync_url ?? undefined,
      credentials: row.credentials ?? undefined,
      lastSyncAt: row.last_sync_at ?? undefined,
      syncStatus: row.sync_status as SyncStatus,
      createdAt: row.created_at,
    };
  }
}

// ============================================================================
// Database Event Reminder Store
// ============================================================================

export class DatabaseEventReminderStore implements EventReminderStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS event_reminders (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        family_group_id TEXT NOT NULL,
        minutes_before INTEGER NOT NULL,
        channels TEXT NOT NULL,
        scheduled_for INTEGER NOT NULL,
        sent INTEGER DEFAULT 0,
        sent_at INTEGER,
        created_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON event_reminders(scheduled_for, sent)
    `);
  }

  async createReminder(reminder: Omit<ScheduledReminder, 'id' | 'createdAt'>): Promise<ScheduledReminder> {
    const now = Date.now();
    const id = randomUUID();

    const newReminder: ScheduledReminder = {
      ...reminder,
      id,
      createdAt: now,
    };

    await this.db.execute(
      `INSERT INTO event_reminders (
        id, event_id, family_group_id, minutes_before, channels, scheduled_for, sent, sent_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newReminder.id,
        newReminder.eventId,
        newReminder.familyGroupId,
        newReminder.minutesBefore,
        JSON.stringify(newReminder.channels),
        newReminder.scheduledFor,
        newReminder.sent ? 1 : 0,
        newReminder.sentAt ?? null,
        newReminder.createdAt,
      ]
    );

    return newReminder;
  }

  async getReminder(id: string): Promise<ScheduledReminder | null> {
    const { rows } = await this.db.query<ReminderRow>(
      'SELECT * FROM event_reminders WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.rowToReminder(rows[0]);
  }

  async deleteReminder(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM event_reminders WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async getRemindersForEvent(eventId: string): Promise<ScheduledReminder[]> {
    const { rows } = await this.db.query<ReminderRow>(
      'SELECT * FROM event_reminders WHERE event_id = ? ORDER BY scheduled_for',
      [eventId]
    );

    return rows.map(row => this.rowToReminder(row));
  }

  async getPendingReminders(beforeTimestamp: number): Promise<ScheduledReminder[]> {
    const { rows } = await this.db.query<ReminderRow>(
      'SELECT * FROM event_reminders WHERE sent = 0 AND scheduled_for <= ? ORDER BY scheduled_for',
      [beforeTimestamp]
    );

    return rows.map(row => this.rowToReminder(row));
  }

  async markSent(id: string): Promise<ScheduledReminder | null> {
    const existing = await this.getReminder(id);
    if (!existing) return null;

    const now = Date.now();

    await this.db.execute(
      'UPDATE event_reminders SET sent = 1, sent_at = ? WHERE id = ?',
      [now, id]
    );

    return {
      ...existing,
      sent: true,
      sentAt: now,
    };
  }

  async bulkMarkSent(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const now = Date.now();
    const placeholders = ids.map(() => '?').join(',');

    const result = await this.db.execute(
      `UPDATE event_reminders SET sent = 1, sent_at = ? WHERE id IN (${placeholders})`,
      [now, ...ids]
    );

    return result.changes;
  }

  async deleteByEvent(eventId: string): Promise<number> {
    const result = await this.db.execute(
      'DELETE FROM event_reminders WHERE event_id = ?',
      [eventId]
    );

    return result.changes;
  }

  private rowToReminder(row: ReminderRow): ScheduledReminder {
    return {
      id: row.id,
      eventId: row.event_id,
      familyGroupId: row.family_group_id,
      minutesBefore: row.minutes_before,
      channels: JSON.parse(row.channels) as ReminderChannel[],
      scheduledFor: row.scheduled_for,
      sent: row.sent === 1,
      sentAt: row.sent_at ?? undefined,
      createdAt: row.created_at,
    };
  }
}

// ============================================================================
// In-Memory Implementations
// ============================================================================

export class InMemorySchoolEventStore implements SchoolEventStore {
  private events = new Map<string, SchoolEvent>();

  async initialize(): Promise<void> {}

  async createEvent(event: Omit<SchoolEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<SchoolEvent> {
    const now = Date.now();
    const id = randomUUID();

    const newEvent: SchoolEvent = {
      ...event,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.events.set(id, newEvent);
    return newEvent;
  }

  async getEvent(id: string): Promise<SchoolEvent | null> {
    return this.events.get(id) ?? null;
  }

  async updateEvent(id: string, updates: Partial<Omit<SchoolEvent, 'id' | 'createdAt'>>): Promise<SchoolEvent | null> {
    const existing = this.events.get(id);
    if (!existing) return null;

    const updated: SchoolEvent = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.events.set(id, updated);
    return updated;
  }

  async deleteEvent(id: string): Promise<boolean> {
    return this.events.delete(id);
  }

  async listEvents(options: SchoolEventQueryOptions): Promise<SchoolEvent[]> {
    let events = Array.from(this.events.values())
      .filter(e => e.familyGroupId === options.familyGroupId);

    if (options.childUserId) {
      events = events.filter(e => e.childUserId === options.childUserId);
    }

    if (options.startTime !== undefined) {
      events = events.filter(e => e.startTime >= options.startTime!);
    }

    if (options.endTime !== undefined) {
      events = events.filter(e => e.startTime <= options.endTime!);
    }

    if (options.eventType) {
      events = events.filter(e => e.eventType === options.eventType);
    }

    const orderDir = options.orderDirection || 'asc';
    events.sort((a, b) => orderDir === 'asc' ? a.startTime - b.startTime : b.startTime - a.startTime);

    if (options.offset) {
      events = events.slice(options.offset);
    }
    if (options.limit) {
      events = events.slice(0, options.limit);
    }

    return events;
  }

  async getUpcomingEvents(familyGroupId: string, days: number): Promise<SchoolEvent[]> {
    const now = Date.now();
    const endTime = now + days * 24 * 60 * 60 * 1000;

    return this.listEvents({
      familyGroupId,
      startTime: now,
      endTime,
    });
  }

  async getEventsByChild(childUserId: string, options?: SchoolEventQueryOptions): Promise<SchoolEvent[]> {
    const events = Array.from(this.events.values()).filter(e => e.childUserId === childUserId);
    if (events.length === 0) return [];

    return this.listEvents({
      ...options,
      familyGroupId: events[0].familyGroupId,
      childUserId,
    });
  }

  async getEventByExternalId(sourceId: string, externalId: string): Promise<SchoolEvent | null> {
    return Array.from(this.events.values()).find(
      e => e.sourceId === sourceId && e.externalId === externalId
    ) ?? null;
  }

  async bulkCreate(events: Omit<SchoolEvent, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<SchoolEvent[]> {
    const results: SchoolEvent[] = [];
    for (const event of events) {
      results.push(await this.createEvent(event));
    }
    return results;
  }

  async bulkDelete(eventIds: string[]): Promise<number> {
    let count = 0;
    for (const id of eventIds) {
      if (this.events.delete(id)) count++;
    }
    return count;
  }

  async deleteBySource(sourceId: string): Promise<number> {
    const toDelete = Array.from(this.events.values())
      .filter(e => e.sourceId === sourceId)
      .map(e => e.id);

    return this.bulkDelete(toDelete);
  }
}

export class InMemorySchoolCalendarSourceStore implements SchoolCalendarSourceStore {
  private sources = new Map<string, SchoolCalendarSource>();

  async initialize(): Promise<void> {}

  async createSource(source: Omit<SchoolCalendarSource, 'id' | 'createdAt'>): Promise<SchoolCalendarSource> {
    const now = Date.now();
    const id = randomUUID();

    const newSource: SchoolCalendarSource = {
      ...source,
      id,
      createdAt: now,
    };

    this.sources.set(id, newSource);
    return newSource;
  }

  async getSource(id: string): Promise<SchoolCalendarSource | null> {
    return this.sources.get(id) ?? null;
  }

  async updateSource(id: string, updates: Partial<Omit<SchoolCalendarSource, 'id' | 'createdAt'>>): Promise<SchoolCalendarSource | null> {
    const existing = this.sources.get(id);
    if (!existing) return null;

    const updated: SchoolCalendarSource = {
      ...existing,
      ...updates,
    };

    this.sources.set(id, updated);
    return updated;
  }

  async deleteSource(id: string): Promise<boolean> {
    return this.sources.delete(id);
  }

  async listSources(familyGroupId: string): Promise<SchoolCalendarSource[]> {
    return Array.from(this.sources.values())
      .filter(s => s.familyGroupId === familyGroupId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSourcesByChild(childUserId: string): Promise<SchoolCalendarSource[]> {
    return Array.from(this.sources.values())
      .filter(s => s.childUserId === childUserId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSourcesNeedingSync(maxAgeMinutes: number): Promise<SchoolCalendarSource[]> {
    const threshold = Date.now() - maxAgeMinutes * 60 * 1000;

    return Array.from(this.sources.values()).filter(
      s => s.syncStatus === 'active' && (!s.lastSyncAt || s.lastSyncAt < threshold)
    );
  }

  async markSynced(id: string): Promise<SchoolCalendarSource | null> {
    return this.updateSource(id, {
      lastSyncAt: Date.now(),
      syncStatus: 'active',
    });
  }

  async markSyncError(id: string, _error?: string): Promise<SchoolCalendarSource | null> {
    return this.updateSource(id, {
      syncStatus: 'error',
    });
  }
}

export class InMemoryEventReminderStore implements EventReminderStore {
  private reminders = new Map<string, ScheduledReminder>();

  async initialize(): Promise<void> {}

  async createReminder(reminder: Omit<ScheduledReminder, 'id' | 'createdAt'>): Promise<ScheduledReminder> {
    const now = Date.now();
    const id = randomUUID();

    const newReminder: ScheduledReminder = {
      ...reminder,
      id,
      createdAt: now,
    };

    this.reminders.set(id, newReminder);
    return newReminder;
  }

  async getReminder(id: string): Promise<ScheduledReminder | null> {
    return this.reminders.get(id) ?? null;
  }

  async deleteReminder(id: string): Promise<boolean> {
    return this.reminders.delete(id);
  }

  async getRemindersForEvent(eventId: string): Promise<ScheduledReminder[]> {
    return Array.from(this.reminders.values())
      .filter(r => r.eventId === eventId)
      .sort((a, b) => a.scheduledFor - b.scheduledFor);
  }

  async getPendingReminders(beforeTimestamp: number): Promise<ScheduledReminder[]> {
    return Array.from(this.reminders.values())
      .filter(r => !r.sent && r.scheduledFor <= beforeTimestamp)
      .sort((a, b) => a.scheduledFor - b.scheduledFor);
  }

  async markSent(id: string): Promise<ScheduledReminder | null> {
    const reminder = this.reminders.get(id);
    if (!reminder) return null;

    const updated: ScheduledReminder = {
      ...reminder,
      sent: true,
      sentAt: Date.now(),
    };

    this.reminders.set(id, updated);
    return updated;
  }

  async bulkMarkSent(ids: string[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      if (await this.markSent(id)) count++;
    }
    return count;
  }

  async deleteByEvent(eventId: string): Promise<number> {
    const toDelete = Array.from(this.reminders.values())
      .filter(r => r.eventId === eventId)
      .map(r => r.id);

    let count = 0;
    for (const id of toDelete) {
      if (this.reminders.delete(id)) count++;
    }
    return count;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createSchoolEventStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): SchoolEventStore {
  if (type === 'database' && dbAdapter) {
    return new DatabaseSchoolEventStore(dbAdapter);
  }
  return new InMemorySchoolEventStore();
}

export function createSchoolCalendarSourceStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): SchoolCalendarSourceStore {
  if (type === 'database' && dbAdapter) {
    return new DatabaseSchoolCalendarSourceStore(dbAdapter);
  }
  return new InMemorySchoolCalendarSourceStore();
}

export function createEventReminderStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): EventReminderStore {
  if (type === 'database' && dbAdapter) {
    return new DatabaseEventReminderStore(dbAdapter);
  }
  return new InMemoryEventReminderStore();
}
