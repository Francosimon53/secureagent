/**
 * Entertainment Service
 *
 * High-level service for entertainment watchlist and episode tracking.
 */

export {
  WatchlistService,
  createWatchlistService,
  type WatchlistServiceConfig,
  type WatchlistServiceDeps,
  type AddToWatchlistResult,
} from './watchlist-service.js';

export {
  EpisodeTracker,
  createEpisodeTracker,
  type EpisodeTrackerConfig,
  type EpisodeTrackerDeps,
  type NewEpisodeEvent,
} from './episode-tracker.js';

import type {
  WatchlistItem,
  TVShowProgress,
  NewEpisodeAlert,
  MediaType,
  WatchStatus,
  EpisodeInfo,
} from '../../types.js';
import type { WatchlistStore } from '../../stores/watchlist-store.js';
import type { EntertainmentProvider, MovieDetails, TVShowDetails } from '../../providers/base.js';
import {
  WatchlistService,
  createWatchlistService,
  type AddToWatchlistResult,
} from './watchlist-service.js';
import {
  EpisodeTracker,
  createEpisodeTracker,
  type NewEpisodeEvent,
} from './episode-tracker.js';

export interface EntertainmentServiceConfig {
  enabled?: boolean;
  autoFetchDetails?: boolean;
  episodeCheckIntervalHours?: number;
  releaseAlertDays?: number;
}

export interface EntertainmentServiceDeps {
  store: WatchlistStore;
  getProvider?: () => EntertainmentProvider | undefined;
  onNewEpisode?: (event: NewEpisodeEvent) => void;
}

/**
 * High-level entertainment service
 */
export class EntertainmentService {
  private readonly watchlist: WatchlistService;
  private readonly episodeTracker: EpisodeTracker;
  private readonly config: EntertainmentServiceConfig;

  constructor(config: EntertainmentServiceConfig, deps: EntertainmentServiceDeps) {
    this.config = config;

    this.watchlist = createWatchlistService(
      { autoFetchDetails: config.autoFetchDetails },
      {
        store: deps.store,
        getProvider: deps.getProvider,
      }
    );

    this.episodeTracker = createEpisodeTracker(
      {
        checkIntervalMs: (config.episodeCheckIntervalHours ?? 6) * 60 * 60 * 1000,
        alertAdvanceDays: config.releaseAlertDays ?? 7,
      },
      {
        store: deps.store,
        getProvider: deps.getProvider,
        onNewEpisode: deps.onNewEpisode,
      }
    );
  }

  // === Watchlist Operations ===

  /**
   * Add to watchlist
   */
  async addToWatchlist(
    userId: string,
    externalId: string,
    mediaType: MediaType,
    title?: string
  ): Promise<AddToWatchlistResult> {
    return this.watchlist.addToWatchlist(userId, externalId, mediaType, title);
  }

  /**
   * Search and add to watchlist
   */
  async searchAndAdd(
    userId: string,
    query: string,
    mediaType: MediaType
  ): Promise<AddToWatchlistResult | null> {
    return this.watchlist.searchAndAdd(userId, query, mediaType);
  }

  /**
   * Get watchlist item
   */
  async getItem(id: string): Promise<WatchlistItem | null> {
    return this.watchlist.getItem(id);
  }

  /**
   * Get user's watchlist
   */
  async getWatchlist(
    userId: string,
    filters?: {
      mediaType?: MediaType;
      status?: WatchStatus;
    }
  ): Promise<WatchlistItem[]> {
    return this.watchlist.getWatchlist(userId, filters);
  }

  /**
   * Update item status
   */
  async updateStatus(itemId: string, status: WatchStatus): Promise<WatchlistItem | null> {
    return this.watchlist.updateStatus(itemId, status);
  }

  /**
   * Rate an item
   */
  async rateItem(itemId: string, rating: number): Promise<WatchlistItem | null> {
    return this.watchlist.rateItem(itemId, rating);
  }

  /**
   * Remove from watchlist
   */
  async removeFromWatchlist(itemId: string): Promise<boolean> {
    return this.watchlist.removeFromWatchlist(itemId);
  }

  // === TV Show Progress ===

  /**
   * Get TV show progress
   */
  async getTVShowProgress(watchlistItemId: string): Promise<TVShowProgress | null> {
    return this.watchlist.getTVShowProgress(watchlistItemId);
  }

  /**
   * Update TV show progress
   */
  async updateTVShowProgress(
    watchlistItemId: string,
    season: number,
    episode: number
  ): Promise<TVShowProgress> {
    return this.watchlist.updateTVShowProgress(watchlistItemId, season, episode);
  }

  /**
   * Mark watched episode
   */
  async markEpisodeWatched(watchlistItemId: string): Promise<TVShowProgress | null> {
    const progress = await this.watchlist.getTVShowProgress(watchlistItemId);
    if (!progress?.nextEpisode) {
      return null;
    }

    return this.watchlist.updateTVShowProgress(
      watchlistItemId,
      progress.nextEpisode.seasonNumber,
      progress.nextEpisode.episodeNumber
    );
  }

  /**
   * Get shows with new episodes
   */
  async getShowsWithNewEpisodes(userId: string): Promise<Array<{
    item: WatchlistItem;
    progress: TVShowProgress;
  }>> {
    return this.watchlist.getShowsWithNewEpisodes(userId);
  }

  /**
   * Get shows user is behind on
   */
  async getShowsBehind(userId: string): Promise<Array<{
    item: WatchlistItem;
    progress: TVShowProgress;
    episodesBehind: number;
  }>> {
    return this.watchlist.getShowsBehind(userId);
  }

  /**
   * Mark show as complete
   */
  async markShowComplete(watchlistItemId: string): Promise<WatchlistItem | null> {
    return this.watchlist.markShowComplete(watchlistItemId);
  }

  // === Episode Tracking ===

  /**
   * Get upcoming episodes
   */
  async getUpcomingEpisodes(userId: string, days?: number): Promise<Array<{
    item: WatchlistItem;
    progress: TVShowProgress;
    nextEpisode: EpisodeInfo;
    daysUntilAir: number;
  }>> {
    return this.episodeTracker.getUpcomingEpisodes(userId, days);
  }

  /**
   * Get unwatched recent episodes
   */
  async getUnwatchedRecentEpisodes(userId: string, days?: number): Promise<Array<{
    item: WatchlistItem;
    progress: TVShowProgress;
    episode: EpisodeInfo;
    daysSinceAir: number;
  }>> {
    return this.episodeTracker.getUnwatchedRecentEpisodes(userId, days);
  }

  /**
   * Get pending episode alerts
   */
  async getPendingAlerts(userId: string): Promise<NewEpisodeAlert[]> {
    return this.episodeTracker.getPendingAlerts(userId);
  }

  /**
   * Process pending alerts
   */
  async processPendingAlerts(userId: string): Promise<NewEpisodeAlert[]> {
    return this.episodeTracker.processPendingAlerts(userId);
  }

  /**
   * Manually check a show for new episodes
   */
  async checkShowForNewEpisodes(watchlistItemId: string): Promise<{
    hasNewEpisode: boolean;
    nextEpisode?: EpisodeInfo;
  }> {
    const item = await this.watchlist.getItem(watchlistItemId);
    if (!item) {
      return { hasNewEpisode: false };
    }
    return this.episodeTracker.checkShowForNewEpisodes(item);
  }

  // === Discovery ===

  /**
   * Get trending content
   */
  async getTrending(mediaType: 'movie' | 'tv_show'): Promise<Array<{
    externalId: string;
    title: string;
    posterUrl?: string;
    rating?: number;
  }>> {
    return this.watchlist.getTrending(mediaType);
  }

  /**
   * Search for content
   */
  async search(
    query: string,
    mediaType: 'movie' | 'tv_show'
  ): Promise<Array<{
    externalId: string;
    title: string;
    posterUrl?: string;
    releaseDate?: number;
    rating?: number;
  }>> {
    return this.watchlist.search(query, mediaType);
  }

  /**
   * Get content details
   */
  async getDetails(
    externalId: string,
    mediaType: 'movie' | 'tv_show'
  ): Promise<MovieDetails | TVShowDetails | null> {
    return this.watchlist.getDetails(externalId, mediaType);
  }

  // === Service Control ===

  /**
   * Start the episode tracker
   */
  start(): void {
    if (this.config.enabled !== false) {
      this.episodeTracker.start();
    }
  }

  /**
   * Stop the episode tracker
   */
  stop(): void {
    this.episodeTracker.stop();
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.episodeTracker.isRunning();
  }

  // === Service Accessors ===

  getWatchlistService(): WatchlistService {
    return this.watchlist;
  }

  getEpisodeTracker(): EpisodeTracker {
    return this.episodeTracker;
  }
}

/**
 * Create an entertainment service instance
 */
export function createEntertainmentService(
  config: EntertainmentServiceConfig,
  deps: EntertainmentServiceDeps
): EntertainmentService {
  return new EntertainmentService(config, deps);
}
