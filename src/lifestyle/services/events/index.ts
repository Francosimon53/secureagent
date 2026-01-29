/**
 * Event Discovery Service
 *
 * High-level service for event discovery and management.
 */

export {
  DiscoveryService,
  createDiscoveryService,
  type DiscoveryServiceConfig,
  type DiscoveryServiceDeps,
  type EventDiscoveredEvent,
  type RecommendationEvent,
} from './discovery-service.js';

import type {
  DiscoveredEvent,
  UserEventPreference,
  SavedEvent,
  EventCategory,
} from '../../types.js';
import type { EventStore } from '../../stores/event-store.js';
import type { EventProvider } from '../../providers/base.js';
import {
  DiscoveryService,
  createDiscoveryService,
  type EventDiscoveredEvent,
  type RecommendationEvent,
} from './discovery-service.js';

export interface EventDiscoveryServiceConfig {
  enabled?: boolean;
  checkIntervalHours?: number;
  defaultRadiusKm?: number;
}

export interface EventDiscoveryServiceDeps {
  store: EventStore;
  getProvider?: () => EventProvider | undefined;
  onEventDiscovered?: (event: EventDiscoveredEvent) => void;
  onRecommendation?: (event: RecommendationEvent) => void;
}

/**
 * High-level event discovery service
 */
export class EventDiscoveryService {
  private readonly discovery: DiscoveryService;
  private readonly config: EventDiscoveryServiceConfig;

  constructor(config: EventDiscoveryServiceConfig, deps: EventDiscoveryServiceDeps) {
    this.config = config;

    this.discovery = createDiscoveryService(
      {
        checkIntervalMs: (config.checkIntervalHours ?? 12) * 60 * 60 * 1000,
        defaultRadiusKm: config.defaultRadiusKm ?? 50,
      },
      {
        store: deps.store,
        getProvider: deps.getProvider,
        onEventDiscovered: deps.onEventDiscovered,
        onRecommendation: deps.onRecommendation,
      }
    );
  }

  // === Preferences ===

  /**
   * Create a preference
   */
  async createPreference(
    userId: string,
    preference: {
      name?: string;
      categories?: EventCategory[];
      genres?: string[];
      artists?: string[];
      location: { lat: number; lng: number; radiusKm?: number };
      maxPrice?: number;
      notifyOnMatch?: boolean;
    }
  ): Promise<UserEventPreference> {
    return this.discovery.createPreference(userId, {
      name: preference.name,
      categories: preference.categories,
      genres: preference.genres,
      artists: preference.artists,
      location: {
        lat: preference.location.lat,
        lng: preference.location.lng,
        radiusKm: preference.location.radiusKm ?? this.config.defaultRadiusKm ?? 50,
      },
      maxPrice: preference.maxPrice,
      notifyOnMatch: preference.notifyOnMatch ?? true,
      isActive: true,
    });
  }

  /**
   * Get user's preferences
   */
  async getPreferences(userId: string): Promise<UserEventPreference[]> {
    return this.discovery.getUserPreferences(userId);
  }

  /**
   * Update a preference
   */
  async updatePreference(
    preferenceId: string,
    updates: Partial<Omit<UserEventPreference, 'id' | 'userId' | 'createdAt'>>
  ): Promise<UserEventPreference | null> {
    return this.discovery.updatePreference(preferenceId, updates);
  }

  /**
   * Delete a preference
   */
  async deletePreference(preferenceId: string): Promise<boolean> {
    return this.discovery.deletePreference(preferenceId);
  }

  // === Discovery ===

  /**
   * Discover events for a user
   */
  async discoverEvents(userId: string): Promise<DiscoveredEvent[]> {
    return this.discovery.discoverEventsForUser(userId);
  }

  /**
   * Search events
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
    return this.discovery.searchEvents(params);
  }

  /**
   * Get event details
   */
  async getEvent(eventId: string): Promise<DiscoveredEvent | null> {
    return this.discovery.getEvent(eventId);
  }

  /**
   * Get event recommendations
   */
  async getRecommendations(userId: string): Promise<DiscoveredEvent[]> {
    return this.discovery.getRecommendations(userId);
  }

  // === Saved Events ===

  /**
   * Save an event
   */
  async saveEvent(userId: string, eventId: string, notes?: string): Promise<SavedEvent> {
    return this.discovery.saveEvent(userId, eventId, notes);
  }

  /**
   * Get saved events
   */
  async getSavedEvents(userId: string): Promise<SavedEvent[]> {
    return this.discovery.getSavedEvents(userId);
  }

  /**
   * Get saved events with details
   */
  async getSavedEventsWithDetails(userId: string): Promise<Array<{
    saved: SavedEvent;
    event: DiscoveredEvent;
  }>> {
    return this.discovery.getSavedEventsWithDetails(userId);
  }

  /**
   * Get upcoming saved events
   */
  async getUpcomingSavedEvents(userId: string, days?: number): Promise<Array<{
    saved: SavedEvent;
    event: DiscoveredEvent;
    daysUntil: number;
  }>> {
    return this.discovery.getUpcomingSavedEvents(userId, days);
  }

  /**
   * Unsave an event
   */
  async unsaveEvent(userId: string, eventId: string): Promise<boolean> {
    return this.discovery.unsaveEvent(userId, eventId);
  }

  /**
   * Check if event is saved
   */
  async isEventSaved(userId: string, eventId: string): Promise<boolean> {
    return this.discovery.isEventSaved(userId, eventId);
  }

  // === Artist/Venue Search ===

  /**
   * Search artists
   */
  async searchArtists(query: string): Promise<Array<{
    externalId: string;
    name: string;
    genres?: string[];
    imageUrl?: string;
    upcomingEventCount?: number;
  }>> {
    return this.discovery.searchArtists(query);
  }

  /**
   * Get artist events
   */
  async getArtistEvents(artistId: string): Promise<DiscoveredEvent[]> {
    return this.discovery.getArtistEvents(artistId);
  }

  // === Service Control ===

  /**
   * Start the discovery service
   */
  start(): void {
    if (this.config.enabled !== false) {
      this.discovery.start();
    }
  }

  /**
   * Stop the discovery service
   */
  stop(): void {
    this.discovery.stop();
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.discovery.isRunning();
  }

  // === Service Accessor ===

  getDiscoveryService(): DiscoveryService {
    return this.discovery;
  }
}

/**
 * Create an event discovery service instance
 */
export function createEventDiscoveryService(
  config: EventDiscoveryServiceConfig,
  deps: EventDiscoveryServiceDeps
): EventDiscoveryService {
  return new EventDiscoveryService(config, deps);
}
