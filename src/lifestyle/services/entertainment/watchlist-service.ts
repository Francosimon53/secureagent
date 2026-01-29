/**
 * Watchlist Service
 *
 * Manages entertainment watchlist operations.
 */

import type {
  WatchlistItem,
  TVShowProgress,
  MediaType,
  WatchStatus,
} from '../../types.js';
import type { WatchlistStore } from '../../stores/watchlist-store.js';
import type { EntertainmentProvider, MovieDetails, TVShowDetails } from '../../providers/base.js';

export interface WatchlistServiceConfig {
  autoFetchDetails: boolean;
}

export interface WatchlistServiceDeps {
  store: WatchlistStore;
  getProvider?: () => EntertainmentProvider | undefined;
}

export interface AddToWatchlistResult {
  item: WatchlistItem;
  isNew: boolean;
  details?: MovieDetails | TVShowDetails;
}

/**
 * Watchlist management service
 */
export class WatchlistService {
  private readonly config: WatchlistServiceConfig;
  private readonly deps: WatchlistServiceDeps;

  constructor(config: WatchlistServiceConfig, deps: WatchlistServiceDeps) {
    this.config = config;
    this.deps = deps;
  }

  /**
   * Add an item to the watchlist
   */
  async addToWatchlist(
    userId: string,
    externalId: string,
    mediaType: MediaType,
    title?: string
  ): Promise<AddToWatchlistResult> {
    // Check if already exists
    const existing = await this.deps.store.getItemByExternalId(userId, externalId);
    if (existing) {
      return { item: existing, isNew: false };
    }

    let details: MovieDetails | TVShowDetails | undefined;
    let itemTitle = title ?? 'Unknown Title';
    let posterUrl: string | undefined;
    let releaseDate: number | undefined;
    let totalSeasons: number | undefined;
    let totalEpisodes: number | undefined;

    // Fetch details from provider
    if (this.config.autoFetchDetails) {
      const provider = this.deps.getProvider?.();
      if (provider) {
        try {
          if (mediaType === 'movie' || mediaType === 'documentary') {
            details = await provider.getMovieDetails(externalId) ?? undefined;
            if (details) {
              itemTitle = details.title;
              posterUrl = details.posterUrl;
              releaseDate = details.releaseDate;
            }
          } else if (mediaType === 'tv_show') {
            details = await provider.getTVShowDetails(externalId) ?? undefined;
            if (details) {
              itemTitle = (details as TVShowDetails).title;
              posterUrl = details.posterUrl;
              releaseDate = (details as TVShowDetails).firstAirDate;
              totalSeasons = (details as TVShowDetails).totalSeasons;
              totalEpisodes = (details as TVShowDetails).totalEpisodes;
            }
          }
        } catch (error) {
          console.error('Failed to fetch media details:', error);
        }
      }
    }

    const item = await this.deps.store.addItem({
      userId,
      mediaType,
      externalId,
      title: itemTitle,
      posterUrl,
      releaseDate,
      status: 'want_to_watch',
      totalSeasons,
      totalEpisodes,
    });

    return { item, isNew: true, details };
  }

  /**
   * Search and add to watchlist
   */
  async searchAndAdd(
    userId: string,
    query: string,
    mediaType: MediaType
  ): Promise<AddToWatchlistResult | null> {
    const provider = this.deps.getProvider?.();
    if (!provider) {
      return null;
    }

    try {
      let results: Array<{ externalId: string; title: string }>;

      if (mediaType === 'movie' || mediaType === 'documentary') {
        results = await provider.searchMovies(query);
      } else {
        results = await provider.searchTVShows(query);
      }

      if (results.length === 0) {
        return null;
      }

      // Add the first (best) match
      return this.addToWatchlist(userId, results[0].externalId, mediaType, results[0].title);
    } catch (error) {
      console.error('Search failed:', error);
      return null;
    }
  }

  /**
   * Get a watchlist item
   */
  async getItem(id: string): Promise<WatchlistItem | null> {
    return this.deps.store.getItem(id);
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
    return this.deps.store.getUserWatchlist(userId, filters);
  }

  /**
   * Update watchlist item status
   */
  async updateStatus(itemId: string, status: WatchStatus): Promise<WatchlistItem | null> {
    return this.deps.store.updateItem(itemId, { status });
  }

  /**
   * Rate an item
   */
  async rateItem(itemId: string, rating: number): Promise<WatchlistItem | null> {
    // Validate rating (1-10 scale)
    const normalizedRating = Math.max(1, Math.min(10, rating));
    return this.deps.store.updateItem(itemId, { rating: normalizedRating });
  }

  /**
   * Remove from watchlist
   */
  async removeFromWatchlist(itemId: string): Promise<boolean> {
    return this.deps.store.deleteItem(itemId);
  }

  /**
   * Get TV show progress
   */
  async getTVShowProgress(watchlistItemId: string): Promise<TVShowProgress | null> {
    return this.deps.store.getProgress(watchlistItemId);
  }

  /**
   * Update TV show progress
   */
  async updateTVShowProgress(
    watchlistItemId: string,
    season: number,
    episode: number
  ): Promise<TVShowProgress> {
    // Update progress
    const progress = await this.deps.store.updateProgress(watchlistItemId, season, episode);

    // Update item status to "watching" if it was "want_to_watch"
    const item = await this.deps.store.getItem(watchlistItemId);
    if (item && item.status === 'want_to_watch') {
      await this.deps.store.updateItem(watchlistItemId, { status: 'watching' });
    }

    return progress;
  }

  /**
   * Get shows with unwatched episodes
   */
  async getShowsWithNewEpisodes(userId: string): Promise<Array<{
    item: WatchlistItem;
    progress: TVShowProgress;
  }>> {
    const progressList = await this.deps.store.getShowsWithNewEpisodes(userId);
    const results: Array<{ item: WatchlistItem; progress: TVShowProgress }> = [];

    for (const progress of progressList) {
      const item = await this.deps.store.getItem(progress.watchlistItemId);
      if (item) {
        results.push({ item, progress });
      }
    }

    return results;
  }

  /**
   * Get shows the user is behind on
   */
  async getShowsBehind(userId: string): Promise<Array<{
    item: WatchlistItem;
    progress: TVShowProgress;
    episodesBehind: number;
  }>> {
    const progressList = await this.deps.store.getShowsNotUpToDate(userId);
    const results: Array<{ item: WatchlistItem; progress: TVShowProgress; episodesBehind: number }> = [];

    for (const progress of progressList) {
      const item = await this.deps.store.getItem(progress.watchlistItemId);
      if (item && item.totalEpisodes) {
        // Calculate episodes behind (simplified - would need episode counting in reality)
        const watchedEpisodes = progress.lastWatchedSeason > 0
          ? (progress.lastWatchedSeason - 1) * 10 + progress.lastWatchedEpisode
          : 0;
        const episodesBehind = Math.max(0, item.totalEpisodes - watchedEpisodes);

        if (episodesBehind > 0) {
          results.push({ item, progress, episodesBehind });
        }
      }
    }

    return results.sort((a, b) => b.episodesBehind - a.episodesBehind);
  }

  /**
   * Mark show as complete
   */
  async markShowComplete(watchlistItemId: string): Promise<WatchlistItem | null> {
    const item = await this.deps.store.getItem(watchlistItemId);
    if (!item || item.mediaType !== 'tv_show') {
      return null;
    }

    // Update progress to last episode
    if (item.totalSeasons && item.totalEpisodes) {
      await this.deps.store.updateProgress(
        watchlistItemId,
        item.totalSeasons,
        Math.ceil(item.totalEpisodes / item.totalSeasons)
      );
    }

    // Set next episode to null (finished)
    await this.deps.store.setNextEpisode(watchlistItemId, null);

    // Update status
    return this.deps.store.updateItem(watchlistItemId, { status: 'watched' });
  }

  /**
   * Get trending content
   */
  async getTrending(mediaType: 'movie' | 'tv_show'): Promise<Array<{
    externalId: string;
    title: string;
    posterUrl?: string;
    rating?: number;
  }>> {
    const provider = this.deps.getProvider?.();
    if (!provider) {
      return [];
    }

    try {
      if (mediaType === 'movie') {
        return await provider.getTrendingMovies();
      } else {
        return await provider.getTrendingTVShows();
      }
    } catch (error) {
      console.error('Failed to fetch trending:', error);
      return [];
    }
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
    const provider = this.deps.getProvider?.();
    if (!provider) {
      return [];
    }

    try {
      if (mediaType === 'movie') {
        return await provider.searchMovies(query);
      } else {
        return await provider.searchTVShows(query);
      }
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  /**
   * Get detailed information about a movie or show
   */
  async getDetails(
    externalId: string,
    mediaType: 'movie' | 'tv_show'
  ): Promise<MovieDetails | TVShowDetails | null> {
    const provider = this.deps.getProvider?.();
    if (!provider) {
      return null;
    }

    try {
      if (mediaType === 'movie') {
        return await provider.getMovieDetails(externalId);
      } else {
        return await provider.getTVShowDetails(externalId);
      }
    } catch (error) {
      console.error('Failed to fetch details:', error);
      return null;
    }
  }
}

/**
 * Create a watchlist service instance
 */
export function createWatchlistService(
  config: Partial<WatchlistServiceConfig>,
  deps: WatchlistServiceDeps
): WatchlistService {
  const fullConfig: WatchlistServiceConfig = {
    autoFetchDetails: config.autoFetchDetails ?? true,
  };

  return new WatchlistService(fullConfig, deps);
}
