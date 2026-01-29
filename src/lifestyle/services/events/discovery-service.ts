/**
 * Event Discovery Service
 *
 * Discovers events based on user preferences.
 */

import type {
  DiscoveredEvent,
  UserEventPreference,
  SavedEvent,
  EventCategory,
} from '../../types.js';
import type { EventStore } from '../../stores/event-store.js';
import type { EventProvider, EventSearchParams, EventSearchResult } from '../../providers/base.js';

export interface DiscoveryServiceConfig {
  checkIntervalMs: number;
  defaultRadiusKm: number;
  maxEventsPerSearch: number;
  cleanupExpiredAfterDays: number;
}

export interface DiscoveryServiceDeps {
  store: EventStore;
  getProvider?: () => EventProvider | undefined;
  onEventDiscovered?: (event: EventDiscoveredEvent) => void;
  onRecommendation?: (event: RecommendationEvent) => void;
}

export interface EventDiscoveredEvent {
  userId: string;
  event: DiscoveredEvent;
  matchedPreference: UserEventPreference;
}

export interface RecommendationEvent {
  userId: string;
  events: DiscoveredEvent[];
  preference: UserEventPreference;
}

/**
 * Event discovery service
 */
export class DiscoveryService {
  private readonly config: DiscoveryServiceConfig;
  private readonly deps: DiscoveryServiceDeps;
  private discoveryInterval: NodeJS.Timeout | null = null;

  constructor(config: DiscoveryServiceConfig, deps: DiscoveryServiceDeps) {
    this.config = config;
    this.deps = deps;
  }

  /**
   * Start the discovery service
   */
  start(): void {
    if (this.discoveryInterval) {
      return;
    }

    this.discoveryInterval = setInterval(
      () => this.runDiscovery().catch(console.error),
      this.config.checkIntervalMs
    );

    // Run immediately
    this.runDiscovery().catch(console.error);
  }

  /**
   * Stop the discovery service
   */
  stop(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.discoveryInterval !== null;
  }

  /**
   * Run discovery for all active preferences
   */
  private async runDiscovery(): Promise<void> {
    // Clean up expired events first
    const cleanupCutoff = Date.now() - (this.config.cleanupExpiredAfterDays * 24 * 60 * 60 * 1000);
    await this.deps.store.deleteExpiredEvents(cleanupCutoff);

    // This would iterate through all users' preferences in production
    // For now, discovery is triggered per-user via discoverEventsForUser
  }

  /**
   * Create a user event preference
   */
  async createPreference(
    userId: string,
    preference: Omit<UserEventPreference, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): Promise<UserEventPreference> {
    return this.deps.store.savePreference({
      userId,
      ...preference,
    });
  }

  /**
   * Get user's preferences
   */
  async getUserPreferences(userId: string): Promise<UserEventPreference[]> {
    return this.deps.store.getUserPreferences(userId);
  }

  /**
   * Update a preference
   */
  async updatePreference(
    preferenceId: string,
    updates: Partial<Omit<UserEventPreference, 'id' | 'userId' | 'createdAt'>>
  ): Promise<UserEventPreference | null> {
    return this.deps.store.updatePreference(preferenceId, updates);
  }

  /**
   * Delete a preference
   */
  async deletePreference(preferenceId: string): Promise<boolean> {
    return this.deps.store.deletePreference(preferenceId);
  }

  /**
   * Discover events for a user based on their preferences
   */
  async discoverEventsForUser(userId: string): Promise<DiscoveredEvent[]> {
    const provider = this.deps.getProvider?.();
    if (!provider) {
      return [];
    }

    const preferences = await this.deps.store.getUserPreferences(userId);
    const activePrefs = preferences.filter(p => p.isActive !== false);

    if (activePrefs.length === 0) {
      return [];
    }

    const discoveredEvents: DiscoveredEvent[] = [];
    const seenEventIds = new Set<string>();

    for (const pref of activePrefs) {
      try {
        const results = await this.searchEventsForPreference(pref, provider);

        for (const result of results) {
          if (seenEventIds.has(result.externalId)) {
            continue;
          }
          seenEventIds.add(result.externalId);

          // Save to store
          const event = await this.deps.store.saveDiscoveredEvent({
            id: undefined as unknown as string,
            externalId: result.externalId,
            provider: provider.name,
            name: result.name,
            category: result.category as EventCategory,
            venue: result.venue,
            startTime: result.startTime,
            endTime: result.endTime,
            priceRange: result.priceRange,
            artists: result.artists,
            imageUrl: result.imageUrl,
            ticketUrl: result.ticketUrl,
            isSoldOut: result.isSoldOut,
          });

          discoveredEvents.push(event);

          // Emit event if notification is enabled
          if (pref.notifyOnMatch && this.deps.onEventDiscovered) {
            this.deps.onEventDiscovered({
              userId,
              event,
              matchedPreference: pref,
            });
          }
        }

        // Emit recommendation event
        if (results.length > 0 && this.deps.onRecommendation) {
          const events = await Promise.all(
            results.slice(0, 5).map(r =>
              this.deps.store.getDiscoveredEventByExternalId(provider.name, r.externalId)
            )
          );

          this.deps.onRecommendation({
            userId,
            events: events.filter((e): e is DiscoveredEvent => e !== null),
            preference: pref,
          });
        }
      } catch (error) {
        console.error(`Error discovering events for preference ${pref.id}:`, error);
      }
    }

    return discoveredEvents;
  }

  /**
   * Search events matching a preference
   */
  private async searchEventsForPreference(
    pref: UserEventPreference,
    provider: EventProvider
  ): Promise<EventSearchResult[]> {
    const searchParams: EventSearchParams = {
      location: {
        lat: pref.location.lat,
        lng: pref.location.lng,
        radiusKm: pref.location.radiusKm ?? this.config.defaultRadiusKm,
      },
      startDate: Date.now(),
      endDate: Date.now() + (30 * 24 * 60 * 60 * 1000), // Next 30 days
      limit: this.config.maxEventsPerSearch,
    };

    if (pref.categories && pref.categories.length > 0) {
      searchParams.categories = pref.categories;
    }

    if (pref.maxPrice !== undefined) {
      searchParams.maxPrice = pref.maxPrice;
    }

    return provider.searchEvents(searchParams);
  }

  /**
   * Search for events
   */
  async searchEvents(params: {
    query?: string;
    categories?: EventCategory[];
    location?: { lat: number; lng: number; radiusKm?: number };
    startDate?: number;
    endDate?: number;
    maxPrice?: number;
    artist?: string;
  }): Promise<DiscoveredEvent[]> {
    const provider = this.deps.getProvider?.();
    if (!provider) {
      // Fall back to stored events
      return this.deps.store.searchEvents({
        categories: params.categories,
        location: params.location ? {
          lat: params.location.lat,
          lng: params.location.lng,
          radiusKm: params.location.radiusKm ?? this.config.defaultRadiusKm,
        } : undefined,
        startTimeAfter: params.startDate,
        startTimeBefore: params.endDate,
        maxPrice: params.maxPrice,
        artist: params.artist,
      });
    }

    // Search via provider
    const results = await provider.searchEvents({
      query: params.query,
      categories: params.categories,
      location: params.location ? {
        lat: params.location.lat,
        lng: params.location.lng,
        radiusKm: params.location.radiusKm ?? this.config.defaultRadiusKm,
      } : undefined,
      startDate: params.startDate,
      endDate: params.endDate,
      maxPrice: params.maxPrice,
      limit: this.config.maxEventsPerSearch,
    });

    // Save results to store
    const events: DiscoveredEvent[] = [];
    for (const result of results) {
      const event = await this.deps.store.saveDiscoveredEvent({
        id: undefined as unknown as string,
        externalId: result.externalId,
        provider: provider.name,
        name: result.name,
        category: result.category as EventCategory,
        venue: result.venue,
        startTime: result.startTime,
        endTime: result.endTime,
        priceRange: result.priceRange,
        artists: result.artists,
        imageUrl: result.imageUrl,
        ticketUrl: result.ticketUrl,
        isSoldOut: result.isSoldOut,
      });
      events.push(event);
    }

    return events;
  }

  /**
   * Get event details
   */
  async getEvent(eventId: string): Promise<DiscoveredEvent | null> {
    return this.deps.store.getDiscoveredEvent(eventId);
  }

  /**
   * Get events matching user preferences
   */
  async getRecommendations(userId: string): Promise<DiscoveredEvent[]> {
    return this.deps.store.getEventsMatchingPreferences(userId);
  }

  /**
   * Save an event for a user
   */
  async saveEvent(userId: string, eventId: string, notes?: string): Promise<SavedEvent> {
    return this.deps.store.saveEventForUser(userId, eventId, notes);
  }

  /**
   * Get user's saved events
   */
  async getSavedEvents(userId: string): Promise<SavedEvent[]> {
    return this.deps.store.getUserSavedEvents(userId);
  }

  /**
   * Unsave an event
   */
  async unsaveEvent(userId: string, eventId: string): Promise<boolean> {
    return this.deps.store.unsaveEvent(userId, eventId);
  }

  /**
   * Check if event is saved
   */
  async isEventSaved(userId: string, eventId: string): Promise<boolean> {
    return this.deps.store.isEventSaved(userId, eventId);
  }

  /**
   * Get saved events with full event details
   */
  async getSavedEventsWithDetails(userId: string): Promise<Array<{
    saved: SavedEvent;
    event: DiscoveredEvent;
  }>> {
    const savedEvents = await this.deps.store.getUserSavedEvents(userId);
    const results: Array<{ saved: SavedEvent; event: DiscoveredEvent }> = [];

    for (const saved of savedEvents) {
      const event = await this.deps.store.getDiscoveredEvent(saved.eventId);
      if (event) {
        results.push({ saved, event });
      }
    }

    return results.sort((a, b) => a.event.startTime - b.event.startTime);
  }

  /**
   * Get upcoming saved events
   */
  async getUpcomingSavedEvents(userId: string, days: number = 30): Promise<Array<{
    saved: SavedEvent;
    event: DiscoveredEvent;
    daysUntil: number;
  }>> {
    const eventsWithDetails = await this.getSavedEventsWithDetails(userId);
    const now = Date.now();
    const cutoff = now + (days * 24 * 60 * 60 * 1000);
    const msPerDay = 24 * 60 * 60 * 1000;

    return eventsWithDetails
      .filter(e => e.event.startTime >= now && e.event.startTime <= cutoff)
      .map(e => ({
        ...e,
        daysUntil: Math.ceil((e.event.startTime - now) / msPerDay),
      }))
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }

  /**
   * Search for artists (if provider supports it)
   */
  async searchArtists(query: string): Promise<Array<{
    externalId: string;
    name: string;
    genres?: string[];
    imageUrl?: string;
    upcomingEventCount?: number;
  }>> {
    const provider = this.deps.getProvider?.();
    if (!provider?.searchArtists) {
      return [];
    }

    try {
      return await provider.searchArtists(query);
    } catch (error) {
      console.error('Artist search failed:', error);
      return [];
    }
  }

  /**
   * Get events for an artist
   */
  async getArtistEvents(artistId: string): Promise<DiscoveredEvent[]> {
    const provider = this.deps.getProvider?.();
    if (!provider?.getArtistEvents) {
      return [];
    }

    try {
      const results = await provider.getArtistEvents(artistId);

      // Save results to store
      const events: DiscoveredEvent[] = [];
      for (const result of results) {
        const event = await this.deps.store.saveDiscoveredEvent({
          id: undefined as unknown as string,
          externalId: result.externalId,
          provider: provider.name,
          name: result.name,
          category: result.category as EventCategory,
          venue: result.venue,
          startTime: result.startTime,
          endTime: result.endTime,
          priceRange: result.priceRange,
          artists: result.artists,
          imageUrl: result.imageUrl,
          ticketUrl: result.ticketUrl,
          isSoldOut: result.isSoldOut,
        });
        events.push(event);
      }

      return events;
    } catch (error) {
      console.error('Artist events fetch failed:', error);
      return [];
    }
  }
}

/**
 * Create a discovery service instance
 */
export function createDiscoveryService(
  config: Partial<DiscoveryServiceConfig>,
  deps: DiscoveryServiceDeps
): DiscoveryService {
  const fullConfig: DiscoveryServiceConfig = {
    checkIntervalMs: config.checkIntervalMs ?? 12 * 60 * 60 * 1000, // 12 hours
    defaultRadiusKm: config.defaultRadiusKm ?? 50,
    maxEventsPerSearch: config.maxEventsPerSearch ?? 50,
    cleanupExpiredAfterDays: config.cleanupExpiredAfterDays ?? 7,
  };

  return new DiscoveryService(fullConfig, deps);
}
