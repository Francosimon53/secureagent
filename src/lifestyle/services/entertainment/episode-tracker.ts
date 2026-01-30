/**
 * Episode Tracker
 *
 * Monitors TV shows for new episodes and manages alerts.
 */

import { randomUUID } from 'crypto';
import type {
  WatchlistItem,
  TVShowProgress,
  NewEpisodeAlert,
  EpisodeInfo,
} from '../../types.js';
import type { WatchlistStore } from '../../stores/watchlist-store.js';
import type { EntertainmentProvider, EpisodeDetails } from '../../providers/base.js';

export interface EpisodeTrackerConfig {
  checkIntervalMs: number;
  alertAdvanceDays: number;
  maxAlertsPerShow: number;
}

export interface EpisodeTrackerDeps {
  store: WatchlistStore;
  getProvider?: () => EntertainmentProvider | undefined;
  onNewEpisode?: (event: NewEpisodeEvent) => void;
}

export interface NewEpisodeEvent {
  userId: string;
  watchlistItemId: string;
  showTitle: string;
  episode: EpisodeInfo;
  alertType: 'new_episode' | 'season_premiere' | 'season_finale';
}

/**
 * Episode tracker for TV shows
 */
export class EpisodeTracker {
  private readonly config: EpisodeTrackerConfig;
  private readonly deps: EpisodeTrackerDeps;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(config: EpisodeTrackerConfig, deps: EpisodeTrackerDeps) {
    this.config = config;
    this.deps = deps;
  }

  /**
   * Start the episode tracker
   */
  start(): void {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(
      () => this.checkForNewEpisodes().catch(console.error),
      this.config.checkIntervalMs
    );

    // Run immediately
    this.checkForNewEpisodes().catch(console.error);
  }

  /**
   * Stop the episode tracker
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Check if tracker is running
   */
  isRunning(): boolean {
    return this.checkInterval !== null;
  }

  /**
   * Check all tracked shows for new episodes
   */
  async checkForNewEpisodes(): Promise<void> {
    const provider = this.deps.getProvider?.();
    if (!provider) {
      return;
    }

    // Get items that need checking
    const items = await this.deps.store.getItemsNeedingEpisodeCheck(this.config.checkIntervalMs);

    for (const item of items) {
      try {
        await this.checkShowForNewEpisodes(item, provider);
      } catch (error) {
        console.error(`Error checking show ${item.title}:`, error);
      }
    }
  }

  /**
   * Check a specific show for new episodes
   */
  async checkShowForNewEpisodes(
    item: WatchlistItem,
    provider?: EntertainmentProvider
  ): Promise<{
    hasNewEpisode: boolean;
    nextEpisode?: EpisodeInfo;
    alertCreated?: NewEpisodeAlert;
  }> {
    provider = provider ?? this.deps.getProvider?.();
    if (!provider) {
      return { hasNewEpisode: false };
    }

    // Get current progress
    const progress = await this.deps.store.getProgress(item.id);

    // Get show details to find next episode
    const showDetails = await provider.getTVShowDetails(item.externalId);
    if (!showDetails) {
      return { hasNewEpisode: false };
    }

    // Update item with latest info
    await this.deps.store.updateItem(item.id, {
      totalSeasons: showDetails.totalSeasons,
      totalEpisodes: showDetails.totalEpisodes,
      lastEpisodeCheck: Date.now(),
    });

    // Find next episode after current progress
    const lastSeason = progress?.lastWatchedSeason ?? 0;
    const lastEpisode = progress?.lastWatchedEpisode ?? 0;

    const nextEpisodeDetails = await provider.getNextEpisode(
      item.externalId,
      lastSeason,
      lastEpisode
    );

    if (!nextEpisodeDetails) {
      // No more episodes - show might be complete
      await this.deps.store.setNextEpisode(item.id, null);
      return { hasNewEpisode: false };
    }

    const nextEpisode: EpisodeInfo = {
      seasonNumber: nextEpisodeDetails.seasonNumber,
      episodeNumber: nextEpisodeDetails.episodeNumber,
      title: nextEpisodeDetails.title,
      airDate: nextEpisodeDetails.airDate,
    };

    // Update next episode in store
    await this.deps.store.setNextEpisode(item.id, nextEpisode);

    // Check if this is a new episode (aired or upcoming)
    const now = Date.now();
    const hasNewEpisode = nextEpisode.airDate ? nextEpisode.airDate <= now : false;

    // Create alert if episode is upcoming within alert window
    let alertCreated: NewEpisodeAlert | undefined;
    if (nextEpisode.airDate) {
      const alertWindow = now + (this.config.alertAdvanceDays * 24 * 60 * 60 * 1000);

      if (nextEpisode.airDate <= alertWindow) {
        alertCreated = await this.createAlertForEpisode(item, nextEpisode);
      }
    }

    // Emit event if new episode is available
    if (hasNewEpisode && this.deps.onNewEpisode) {
      this.deps.onNewEpisode({
        userId: item.userId,
        watchlistItemId: item.id,
        showTitle: item.title,
        episode: nextEpisode,
        alertType: this.determineAlertType(nextEpisode, showDetails.totalEpisodes),
      });
    }

    return { hasNewEpisode, nextEpisode, alertCreated };
  }

  /**
   * Create an alert for an upcoming episode
   */
  private async createAlertForEpisode(
    item: WatchlistItem,
    episode: EpisodeInfo
  ): Promise<NewEpisodeAlert | undefined> {
    if (!episode.airDate) {
      return undefined;
    }

    // Check if alert already exists for this episode
    const existingAlerts = await this.deps.store.getAlertsForShow(item.id);
    const alertExists = existingAlerts.some(
      a => a.episode.seasonNumber === episode.seasonNumber &&
           a.episode.episodeNumber === episode.episodeNumber
    );

    if (alertExists) {
      return undefined;
    }

    // Check alert limit
    const pendingAlerts = existingAlerts.filter(a => !a.sentAt);
    if (pendingAlerts.length >= this.config.maxAlertsPerShow) {
      return undefined;
    }

    const alertType = this.determineAlertType(episode, item.totalEpisodes);

    return this.deps.store.createEpisodeAlert({
      watchlistItemId: item.id,
      userId: item.userId,
      showTitle: item.title,
      episode,
      alertType,
      scheduledFor: episode.airDate,
    });
  }

  /**
   * Determine the type of alert for an episode
   */
  private determineAlertType(
    episode: EpisodeInfo,
    totalEpisodes?: number
  ): 'new_episode' | 'season_premiere' | 'season_finale' {
    if (episode.episodeNumber === 1) {
      return 'season_premiere';
    }

    // This is a simplification - in reality we'd need to know the season episode count
    if (totalEpisodes && episode.episodeNumber >= Math.floor(totalEpisodes / 10)) {
      // Last episode of the season (rough heuristic)
      return 'season_finale';
    }

    return 'new_episode';
  }

  /**
   * Get pending alerts for a user
   */
  async getPendingAlerts(userId: string): Promise<NewEpisodeAlert[]> {
    return this.deps.store.getPendingAlerts(userId);
  }

  /**
   * Mark an alert as sent
   */
  async markAlertSent(alertId: string): Promise<NewEpisodeAlert | null> {
    return this.deps.store.markAlertSent(alertId);
  }

  /**
   * Process and send pending alerts
   */
  async processPendingAlerts(userId: string): Promise<NewEpisodeAlert[]> {
    const alerts = await this.getPendingAlerts(userId);
    const processedAlerts: NewEpisodeAlert[] = [];

    for (const alert of alerts) {
      // Emit event
      if (this.deps.onNewEpisode) {
        this.deps.onNewEpisode({
          userId: alert.userId,
          watchlistItemId: alert.watchlistItemId,
          showTitle: alert.showTitle,
          episode: alert.episode,
          alertType: alert.alertType as 'new_episode' | 'season_premiere' | 'season_finale',
        });
      }

      // Mark as sent
      const updated = await this.markAlertSent(alert.id);
      if (updated) {
        processedAlerts.push(updated);
      }
    }

    return processedAlerts;
  }

  /**
   * Get upcoming episodes for a user
   */
  async getUpcomingEpisodes(userId: string, days: number = 7): Promise<Array<{
    item: WatchlistItem;
    progress: TVShowProgress;
    nextEpisode: EpisodeInfo;
    daysUntilAir: number;
  }>> {
    const watchlist = await this.deps.store.getUserWatchlist(userId, {
      mediaType: 'tv_show',
      status: 'watching',
    });

    const results: Array<{
      item: WatchlistItem;
      progress: TVShowProgress;
      nextEpisode: EpisodeInfo;
      daysUntilAir: number;
    }> = [];

    const now = Date.now();
    const cutoff = now + (days * 24 * 60 * 60 * 1000);
    const msPerDay = 24 * 60 * 60 * 1000;

    for (const item of watchlist) {
      const progress = await this.deps.store.getProgress(item.id);
      if (progress?.nextEpisode?.airDate) {
        const airDate = progress.nextEpisode.airDate;
        if (airDate >= now && airDate <= cutoff) {
          const daysUntilAir = Math.ceil((airDate - now) / msPerDay);
          results.push({
            item,
            progress,
            nextEpisode: progress.nextEpisode,
            daysUntilAir,
          });
        }
      }
    }

    return results.sort((a, b) => a.daysUntilAir - b.daysUntilAir);
  }

  /**
   * Get recently aired episodes that haven't been watched
   */
  async getUnwatchedRecentEpisodes(userId: string, days: number = 7): Promise<Array<{
    item: WatchlistItem;
    progress: TVShowProgress;
    episode: EpisodeInfo;
    daysSinceAir: number;
  }>> {
    const progressList = await this.deps.store.getShowsWithNewEpisodes(userId);
    const results: Array<{
      item: WatchlistItem;
      progress: TVShowProgress;
      episode: EpisodeInfo;
      daysSinceAir: number;
    }> = [];

    const now = Date.now();
    const cutoff = now - (days * 24 * 60 * 60 * 1000);
    const msPerDay = 24 * 60 * 60 * 1000;

    for (const progress of progressList) {
      if (progress.nextEpisode?.airDate) {
        const airDate = progress.nextEpisode.airDate;
        if (airDate >= cutoff && airDate <= now) {
          const item = await this.deps.store.getItem(progress.watchlistItemId);
          if (item) {
            const daysSinceAir = Math.floor((now - airDate) / msPerDay);
            results.push({
              item,
              progress,
              episode: progress.nextEpisode,
              daysSinceAir,
            });
          }
        }
      }
    }

    return results.sort((a, b) => a.daysSinceAir - b.daysSinceAir);
  }
}

/**
 * Create an episode tracker instance
 */
export function createEpisodeTracker(
  config: Partial<EpisodeTrackerConfig>,
  deps: EpisodeTrackerDeps
): EpisodeTracker {
  const fullConfig: EpisodeTrackerConfig = {
    checkIntervalMs: config.checkIntervalMs ?? 6 * 60 * 60 * 1000, // 6 hours
    alertAdvanceDays: config.alertAdvanceDays ?? 7,
    maxAlertsPerShow: config.maxAlertsPerShow ?? 5,
  };

  return new EpisodeTracker(fullConfig, deps);
}
