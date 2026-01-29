/**
 * Event Store
 *
 * Manages discovered events and user preferences.
 */

import { randomUUID } from 'crypto';
import type {
  DiscoveredEvent,
  UserEventPreference,
  SavedEvent,
  EventCategory,
  Venue,
} from '../types.js';

export interface EventStore {
  initialize(): Promise<void>;

  // Discovered events
  saveDiscoveredEvent(event: Omit<DiscoveredEvent, 'discoveredAt'>): Promise<DiscoveredEvent>;
  getDiscoveredEvent(id: string): Promise<DiscoveredEvent | null>;
  getDiscoveredEventByExternalId(provider: string, externalId: string): Promise<DiscoveredEvent | null>;
  searchEvents(filters: {
    userId?: string;
    categories?: EventCategory[];
    location?: { lat: number; lng: number; radiusKm: number };
    startTimeAfter?: number;
    startTimeBefore?: number;
    maxPrice?: number;
    artist?: string;
  }): Promise<DiscoveredEvent[]>;
  updateEvent(id: string, updates: Partial<DiscoveredEvent>): Promise<DiscoveredEvent | null>;
  deleteExpiredEvents(beforeTime: number): Promise<number>;

  // User preferences
  savePreference(pref: Omit<UserEventPreference, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserEventPreference>;
  getPreference(id: string): Promise<UserEventPreference | null>;
  getUserPreferences(userId: string): Promise<UserEventPreference[]>;
  updatePreference(id: string, updates: Partial<Omit<UserEventPreference, 'id' | 'userId' | 'createdAt'>>): Promise<UserEventPreference | null>;
  deletePreference(id: string): Promise<boolean>;

  // Saved/bookmarked events
  saveEventForUser(userId: string, eventId: string, notes?: string): Promise<SavedEvent>;
  getSavedEvent(id: string): Promise<SavedEvent | null>;
  getUserSavedEvents(userId: string): Promise<SavedEvent[]>;
  unsaveEvent(userId: string, eventId: string): Promise<boolean>;
  isEventSaved(userId: string, eventId: string): Promise<boolean>;

  // Recommendations
  getEventsMatchingPreferences(userId: string): Promise<DiscoveredEvent[]>;
}

export interface EventDatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ lastID: number; changes: number }>;
}

/**
 * Database-backed event store
 */
export class DatabaseEventStore implements EventStore {
  constructor(private readonly db: EventDatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS discovered_events (
        id TEXT PRIMARY KEY,
        external_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        venue_name TEXT,
        venue_address TEXT,
        venue_city TEXT,
        venue_lat REAL,
        venue_lng REAL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        price_min REAL,
        price_max REAL,
        currency TEXT DEFAULT 'USD',
        artists TEXT,
        image_url TEXT,
        ticket_url TEXT,
        is_sold_out INTEGER NOT NULL DEFAULT 0,
        discovered_at INTEGER NOT NULL,
        UNIQUE(provider, external_id)
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS user_event_preferences (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT,
        categories TEXT,
        genres TEXT,
        artists TEXT,
        location_lat REAL NOT NULL,
        location_lng REAL NOT NULL,
        location_radius REAL NOT NULL DEFAULT 50,
        max_price REAL,
        notify_on_match INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS saved_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        notes TEXT,
        saved_at INTEGER NOT NULL,
        UNIQUE(user_id, event_id),
        FOREIGN KEY (event_id) REFERENCES discovered_events(id) ON DELETE CASCADE
      )
    `);

    await this.db.run('CREATE INDEX IF NOT EXISTS idx_events_start ON discovered_events(start_time)');
    await this.db.run('CREATE INDEX IF NOT EXISTS idx_events_category ON discovered_events(category)');
    await this.db.run('CREATE INDEX IF NOT EXISTS idx_prefs_user ON user_event_preferences(user_id)');
    await this.db.run('CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_events(user_id)');
  }

  async saveDiscoveredEvent(event: Omit<DiscoveredEvent, 'discoveredAt'>): Promise<DiscoveredEvent> {
    const now = Date.now();

    // Check if event already exists
    const existing = await this.getDiscoveredEventByExternalId(event.provider, event.externalId);
    if (existing) {
      // Update existing event
      await this.updateEvent(existing.id, event);
      return { ...existing, ...event };
    }

    const id = event.id || randomUUID();

    await this.db.run(
      `INSERT INTO discovered_events (
        id, external_id, provider, name, category,
        venue_name, venue_address, venue_city, venue_lat, venue_lng,
        start_time, end_time, price_min, price_max, currency,
        artists, image_url, ticket_url, is_sold_out, discovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, event.externalId, event.provider, event.name, event.category,
        event.venue.name, event.venue.address, event.venue.city,
        event.venue.location?.lat ?? null, event.venue.location?.lng ?? null,
        event.startTime, event.endTime ?? null,
        event.priceRange?.min ?? null, event.priceRange?.max ?? null,
        event.priceRange?.currency ?? 'USD',
        event.artists ? JSON.stringify(event.artists) : null,
        event.imageUrl ?? null, event.ticketUrl ?? null,
        event.isSoldOut ? 1 : 0, now,
      ]
    );

    return { ...event, id, discoveredAt: now };
  }

  async getDiscoveredEvent(id: string): Promise<DiscoveredEvent | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM discovered_events WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? this.mapRowToEvent(rows[0]) : null;
  }

  async getDiscoveredEventByExternalId(provider: string, externalId: string): Promise<DiscoveredEvent | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM discovered_events WHERE provider = ? AND external_id = ?',
      [provider, externalId]
    );
    return rows.length > 0 ? this.mapRowToEvent(rows[0]) : null;
  }

  async searchEvents(filters: {
    userId?: string;
    categories?: EventCategory[];
    location?: { lat: number; lng: number; radiusKm: number };
    startTimeAfter?: number;
    startTimeBefore?: number;
    maxPrice?: number;
    artist?: string;
  }): Promise<DiscoveredEvent[]> {
    let sql = 'SELECT * FROM discovered_events WHERE 1=1';
    const params: unknown[] = [];

    if (filters.categories && filters.categories.length > 0) {
      sql += ` AND category IN (${filters.categories.map(() => '?').join(', ')})`;
      params.push(...filters.categories);
    }

    if (filters.startTimeAfter) {
      sql += ' AND start_time >= ?';
      params.push(filters.startTimeAfter);
    }

    if (filters.startTimeBefore) {
      sql += ' AND start_time <= ?';
      params.push(filters.startTimeBefore);
    }

    if (filters.maxPrice !== undefined) {
      sql += ' AND (price_min IS NULL OR price_min <= ?)';
      params.push(filters.maxPrice);
    }

    if (filters.artist) {
      sql += ' AND artists LIKE ?';
      params.push(`%${filters.artist}%`);
    }

    sql += ' ORDER BY start_time ASC';

    let rows = await this.db.query<Record<string, unknown>>(sql, params);

    // Filter by location in memory (SQLite doesn't have good geo support)
    if (filters.location) {
      const { lat, lng, radiusKm } = filters.location;
      rows = rows.filter(row => {
        const eventLat = row.venue_lat as number | null;
        const eventLng = row.venue_lng as number | null;
        if (eventLat === null || eventLng === null) return false;
        return this.haversineDistance(lat, lng, eventLat, eventLng) <= radiusKm;
      });
    }

    return rows.map(row => this.mapRowToEvent(row));
  }

  async updateEvent(id: string, updates: Partial<DiscoveredEvent>): Promise<DiscoveredEvent | null> {
    const event = await this.getDiscoveredEvent(id);
    if (!event) return null;

    const fields: string[] = [];
    const params: unknown[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      params.push(updates.category);
    }
    if (updates.venue !== undefined) {
      fields.push('venue_name = ?', 'venue_address = ?', 'venue_city = ?');
      params.push(updates.venue.name, updates.venue.address, updates.venue.city);
      if (updates.venue.location) {
        fields.push('venue_lat = ?', 'venue_lng = ?');
        params.push(updates.venue.location.lat, updates.venue.location.lng);
      }
    }
    if (updates.startTime !== undefined) {
      fields.push('start_time = ?');
      params.push(updates.startTime);
    }
    if (updates.priceRange !== undefined) {
      fields.push('price_min = ?', 'price_max = ?', 'currency = ?');
      params.push(updates.priceRange.min, updates.priceRange.max, updates.priceRange.currency);
    }
    if (updates.artists !== undefined) {
      fields.push('artists = ?');
      params.push(JSON.stringify(updates.artists));
    }
    if (updates.isSoldOut !== undefined) {
      fields.push('is_sold_out = ?');
      params.push(updates.isSoldOut ? 1 : 0);
    }

    if (fields.length === 0) return event;

    params.push(id);

    await this.db.run(
      `UPDATE discovered_events SET ${fields.join(', ')} WHERE id = ?`,
      params
    );

    return this.getDiscoveredEvent(id);
  }

  async deleteExpiredEvents(beforeTime: number): Promise<number> {
    const result = await this.db.run(
      'DELETE FROM discovered_events WHERE start_time < ?',
      [beforeTime]
    );
    return result.changes;
  }

  async savePreference(pref: Omit<UserEventPreference, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserEventPreference> {
    const id = randomUUID();
    const now = Date.now();

    await this.db.run(
      `INSERT INTO user_event_preferences (
        id, user_id, name, categories, genres, artists,
        location_lat, location_lng, location_radius,
        max_price, notify_on_match, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, pref.userId, pref.name ?? null,
        pref.categories ? JSON.stringify(pref.categories) : null,
        pref.genres ? JSON.stringify(pref.genres) : null,
        pref.artists ? JSON.stringify(pref.artists) : null,
        pref.location.lat, pref.location.lng, pref.location.radiusKm,
        pref.maxPrice ?? null, pref.notifyOnMatch ? 1 : 0,
        pref.isActive !== false ? 1 : 0, now, now,
      ]
    );

    return { ...pref, id, createdAt: now, updatedAt: now };
  }

  async getPreference(id: string): Promise<UserEventPreference | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM user_event_preferences WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? this.mapRowToPreference(rows[0]) : null;
  }

  async getUserPreferences(userId: string): Promise<UserEventPreference[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM user_event_preferences WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows.map(row => this.mapRowToPreference(row));
  }

  async updatePreference(id: string, updates: Partial<Omit<UserEventPreference, 'id' | 'userId' | 'createdAt'>>): Promise<UserEventPreference | null> {
    const pref = await this.getPreference(id);
    if (!pref) return null;

    const fields: string[] = ['updated_at = ?'];
    const params: unknown[] = [Date.now()];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }
    if (updates.categories !== undefined) {
      fields.push('categories = ?');
      params.push(JSON.stringify(updates.categories));
    }
    if (updates.genres !== undefined) {
      fields.push('genres = ?');
      params.push(JSON.stringify(updates.genres));
    }
    if (updates.artists !== undefined) {
      fields.push('artists = ?');
      params.push(JSON.stringify(updates.artists));
    }
    if (updates.location !== undefined) {
      fields.push('location_lat = ?', 'location_lng = ?', 'location_radius = ?');
      params.push(updates.location.lat, updates.location.lng, updates.location.radiusKm);
    }
    if (updates.maxPrice !== undefined) {
      fields.push('max_price = ?');
      params.push(updates.maxPrice);
    }
    if (updates.notifyOnMatch !== undefined) {
      fields.push('notify_on_match = ?');
      params.push(updates.notifyOnMatch ? 1 : 0);
    }
    if (updates.isActive !== undefined) {
      fields.push('is_active = ?');
      params.push(updates.isActive ? 1 : 0);
    }

    params.push(id);

    await this.db.run(
      `UPDATE user_event_preferences SET ${fields.join(', ')} WHERE id = ?`,
      params
    );

    return this.getPreference(id);
  }

  async deletePreference(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM user_event_preferences WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async saveEventForUser(userId: string, eventId: string, notes?: string): Promise<SavedEvent> {
    const id = randomUUID();
    const now = Date.now();

    await this.db.run(
      `INSERT OR REPLACE INTO saved_events (id, user_id, event_id, notes, saved_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, userId, eventId, notes ?? null, now]
    );

    return { id, userId, eventId, notes, savedAt: now };
  }

  async getSavedEvent(id: string): Promise<SavedEvent | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM saved_events WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? this.mapRowToSavedEvent(rows[0]) : null;
  }

  async getUserSavedEvents(userId: string): Promise<SavedEvent[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM saved_events WHERE user_id = ? ORDER BY saved_at DESC',
      [userId]
    );
    return rows.map(row => this.mapRowToSavedEvent(row));
  }

  async unsaveEvent(userId: string, eventId: string): Promise<boolean> {
    const result = await this.db.run(
      'DELETE FROM saved_events WHERE user_id = ? AND event_id = ?',
      [userId, eventId]
    );
    return result.changes > 0;
  }

  async isEventSaved(userId: string, eventId: string): Promise<boolean> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT 1 FROM saved_events WHERE user_id = ? AND event_id = ? LIMIT 1',
      [userId, eventId]
    );
    return rows.length > 0;
  }

  async getEventsMatchingPreferences(userId: string): Promise<DiscoveredEvent[]> {
    const prefs = await this.getUserPreferences(userId);
    const activePrefs = prefs.filter(p => p.isActive !== false);

    if (activePrefs.length === 0) return [];

    const matchedEvents = new Map<string, DiscoveredEvent>();
    const now = Date.now();

    for (const pref of activePrefs) {
      const events = await this.searchEvents({
        categories: pref.categories,
        location: {
          lat: pref.location.lat,
          lng: pref.location.lng,
          radiusKm: pref.location.radiusKm,
        },
        startTimeAfter: now,
        maxPrice: pref.maxPrice,
      });

      for (const event of events) {
        // Additional filtering for artists
        if (pref.artists && pref.artists.length > 0 && event.artists) {
          const eventArtists = event.artists.map(a => a.toLowerCase());
          const prefArtists = pref.artists.map(a => a.toLowerCase());
          const hasMatch = prefArtists.some(pa => eventArtists.some(ea => ea.includes(pa)));
          if (!hasMatch) continue;
        }

        matchedEvents.set(event.id, event);
      }
    }

    return Array.from(matchedEvents.values()).sort((a, b) => a.startTime - b.startTime);
  }

  private mapRowToEvent(row: Record<string, unknown>): DiscoveredEvent {
    const venue: Venue = {
      name: row.venue_name as string,
      address: row.venue_address as string | undefined,
      city: row.venue_city as string | undefined,
    };

    if (row.venue_lat !== null && row.venue_lng !== null) {
      venue.location = {
        lat: row.venue_lat as number,
        lng: row.venue_lng as number,
      };
    }

    return {
      id: row.id as string,
      externalId: row.external_id as string,
      provider: row.provider as string,
      name: row.name as string,
      category: row.category as EventCategory,
      venue,
      startTime: row.start_time as number,
      endTime: row.end_time as number | undefined,
      priceRange: row.price_min !== null
        ? {
            min: row.price_min as number,
            max: row.price_max as number,
            currency: row.currency as string,
          }
        : undefined,
      artists: row.artists ? JSON.parse(row.artists as string) : undefined,
      imageUrl: row.image_url as string | undefined,
      ticketUrl: row.ticket_url as string | undefined,
      isSoldOut: Boolean(row.is_sold_out),
      discoveredAt: row.discovered_at as number,
    };
  }

  private mapRowToPreference(row: Record<string, unknown>): UserEventPreference {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      name: row.name as string | undefined,
      categories: row.categories ? JSON.parse(row.categories as string) : undefined,
      genres: row.genres ? JSON.parse(row.genres as string) : undefined,
      artists: row.artists ? JSON.parse(row.artists as string) : undefined,
      location: {
        lat: row.location_lat as number,
        lng: row.location_lng as number,
        radiusKm: row.location_radius as number,
      },
      maxPrice: row.max_price as number | undefined,
      notifyOnMatch: Boolean(row.notify_on_match),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  private mapRowToSavedEvent(row: Record<string, unknown>): SavedEvent {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      eventId: row.event_id as string,
      notes: row.notes as string | undefined,
      savedAt: row.saved_at as number,
    };
  }

  private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

/**
 * In-memory event store for testing
 */
export class InMemoryEventStore implements EventStore {
  private events = new Map<string, DiscoveredEvent>();
  private preferences = new Map<string, UserEventPreference>();
  private savedEvents = new Map<string, SavedEvent>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async saveDiscoveredEvent(event: Omit<DiscoveredEvent, 'discoveredAt'>): Promise<DiscoveredEvent> {
    const existing = await this.getDiscoveredEventByExternalId(event.provider, event.externalId);
    if (existing) {
      const updated = { ...existing, ...event };
      this.events.set(existing.id, updated);
      return updated;
    }

    const id = event.id || randomUUID();
    const now = Date.now();
    const newEvent: DiscoveredEvent = { ...event, id, discoveredAt: now };
    this.events.set(id, newEvent);
    return newEvent;
  }

  async getDiscoveredEvent(id: string): Promise<DiscoveredEvent | null> {
    return this.events.get(id) ?? null;
  }

  async getDiscoveredEventByExternalId(provider: string, externalId: string): Promise<DiscoveredEvent | null> {
    for (const event of this.events.values()) {
      if (event.provider === provider && event.externalId === externalId) {
        return event;
      }
    }
    return null;
  }

  async searchEvents(filters: {
    userId?: string;
    categories?: EventCategory[];
    location?: { lat: number; lng: number; radiusKm: number };
    startTimeAfter?: number;
    startTimeBefore?: number;
    maxPrice?: number;
    artist?: string;
  }): Promise<DiscoveredEvent[]> {
    let result = Array.from(this.events.values());

    if (filters.categories && filters.categories.length > 0) {
      result = result.filter(e => filters.categories!.includes(e.category));
    }

    if (filters.startTimeAfter) {
      result = result.filter(e => e.startTime >= filters.startTimeAfter!);
    }

    if (filters.startTimeBefore) {
      result = result.filter(e => e.startTime <= filters.startTimeBefore!);
    }

    if (filters.maxPrice !== undefined) {
      result = result.filter(e => !e.priceRange || e.priceRange.min <= filters.maxPrice!);
    }

    if (filters.artist) {
      const artistLower = filters.artist.toLowerCase();
      result = result.filter(e =>
        e.artists?.some(a => a.toLowerCase().includes(artistLower))
      );
    }

    if (filters.location) {
      const { lat, lng, radiusKm } = filters.location;
      result = result.filter(e => {
        if (!e.venue.location) return false;
        return this.haversineDistance(lat, lng, e.venue.location.lat, e.venue.location.lng) <= radiusKm;
      });
    }

    return result.sort((a, b) => a.startTime - b.startTime);
  }

  async updateEvent(id: string, updates: Partial<DiscoveredEvent>): Promise<DiscoveredEvent | null> {
    const event = this.events.get(id);
    if (!event) return null;

    const updated: DiscoveredEvent = { ...event, ...updates };
    this.events.set(id, updated);
    return updated;
  }

  async deleteExpiredEvents(beforeTime: number): Promise<number> {
    let deleted = 0;
    for (const [id, event] of this.events) {
      if (event.startTime < beforeTime) {
        this.events.delete(id);
        deleted++;
      }
    }
    return deleted;
  }

  async savePreference(pref: Omit<UserEventPreference, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserEventPreference> {
    const id = randomUUID();
    const now = Date.now();
    const newPref: UserEventPreference = { ...pref, id, createdAt: now, updatedAt: now };
    this.preferences.set(id, newPref);
    return newPref;
  }

  async getPreference(id: string): Promise<UserEventPreference | null> {
    return this.preferences.get(id) ?? null;
  }

  async getUserPreferences(userId: string): Promise<UserEventPreference[]> {
    return Array.from(this.preferences.values())
      .filter(p => p.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async updatePreference(id: string, updates: Partial<Omit<UserEventPreference, 'id' | 'userId' | 'createdAt'>>): Promise<UserEventPreference | null> {
    const pref = this.preferences.get(id);
    if (!pref) return null;

    const updated: UserEventPreference = { ...pref, ...updates, updatedAt: Date.now() };
    this.preferences.set(id, updated);
    return updated;
  }

  async deletePreference(id: string): Promise<boolean> {
    return this.preferences.delete(id);
  }

  async saveEventForUser(userId: string, eventId: string, notes?: string): Promise<SavedEvent> {
    // Check if already saved
    for (const saved of this.savedEvents.values()) {
      if (saved.userId === userId && saved.eventId === eventId) {
        const updated: SavedEvent = { ...saved, notes };
        this.savedEvents.set(saved.id, updated);
        return updated;
      }
    }

    const id = randomUUID();
    const saved: SavedEvent = { id, userId, eventId, notes, savedAt: Date.now() };
    this.savedEvents.set(id, saved);
    return saved;
  }

  async getSavedEvent(id: string): Promise<SavedEvent | null> {
    return this.savedEvents.get(id) ?? null;
  }

  async getUserSavedEvents(userId: string): Promise<SavedEvent[]> {
    return Array.from(this.savedEvents.values())
      .filter(s => s.userId === userId)
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  async unsaveEvent(userId: string, eventId: string): Promise<boolean> {
    for (const [id, saved] of this.savedEvents) {
      if (saved.userId === userId && saved.eventId === eventId) {
        this.savedEvents.delete(id);
        return true;
      }
    }
    return false;
  }

  async isEventSaved(userId: string, eventId: string): Promise<boolean> {
    for (const saved of this.savedEvents.values()) {
      if (saved.userId === userId && saved.eventId === eventId) {
        return true;
      }
    }
    return false;
  }

  async getEventsMatchingPreferences(userId: string): Promise<DiscoveredEvent[]> {
    const prefs = await this.getUserPreferences(userId);
    const activePrefs = prefs.filter(p => p.isActive !== false);

    if (activePrefs.length === 0) return [];

    const matchedEvents = new Map<string, DiscoveredEvent>();
    const now = Date.now();

    for (const pref of activePrefs) {
      const events = await this.searchEvents({
        categories: pref.categories,
        location: {
          lat: pref.location.lat,
          lng: pref.location.lng,
          radiusKm: pref.location.radiusKm,
        },
        startTimeAfter: now,
        maxPrice: pref.maxPrice,
      });

      for (const event of events) {
        if (pref.artists && pref.artists.length > 0 && event.artists) {
          const eventArtists = event.artists.map(a => a.toLowerCase());
          const prefArtists = pref.artists.map(a => a.toLowerCase());
          const hasMatch = prefArtists.some(pa => eventArtists.some(ea => ea.includes(pa)));
          if (!hasMatch) continue;
        }

        matchedEvents.set(event.id, event);
      }
    }

    return Array.from(matchedEvents.values()).sort((a, b) => a.startTime - b.startTime);
  }

  private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

/**
 * Create an event store instance
 */
export function createEventStore(
  type: 'memory'
): InMemoryEventStore;
export function createEventStore(
  type: 'database',
  adapter: EventDatabaseAdapter
): DatabaseEventStore;
export function createEventStore(
  type: 'memory' | 'database',
  adapter?: EventDatabaseAdapter
): EventStore {
  if (type === 'database') {
    if (!adapter) {
      throw new Error('Database adapter required for database store');
    }
    return new DatabaseEventStore(adapter);
  }
  return new InMemoryEventStore();
}
