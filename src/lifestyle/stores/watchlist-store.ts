/**
 * Watchlist Store
 *
 * Manages entertainment watchlist items and TV show progress.
 */

import { randomUUID } from 'crypto';
import type {
  WatchlistItem,
  TVShowProgress,
  EpisodeInfo,
  MediaType,
  WatchStatus,
  NewEpisodeAlert,
} from '../types.js';

export interface WatchlistStore {
  initialize(): Promise<void>;

  // Watchlist item operations
  addItem(item: Omit<WatchlistItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<WatchlistItem>;
  getItem(id: string): Promise<WatchlistItem | null>;
  getItemByExternalId(userId: string, externalId: string): Promise<WatchlistItem | null>;
  getUserWatchlist(userId: string, filters?: {
    mediaType?: MediaType;
    status?: WatchStatus;
  }): Promise<WatchlistItem[]>;
  updateItem(id: string, updates: Partial<Omit<WatchlistItem, 'id' | 'userId' | 'createdAt'>>): Promise<WatchlistItem | null>;
  deleteItem(id: string): Promise<boolean>;

  // TV show progress operations
  getProgress(watchlistItemId: string): Promise<TVShowProgress | null>;
  updateProgress(watchlistItemId: string, season: number, episode: number): Promise<TVShowProgress>;
  setNextEpisode(watchlistItemId: string, episode: EpisodeInfo | null): Promise<TVShowProgress | null>;
  getShowsWithNewEpisodes(userId: string): Promise<TVShowProgress[]>;
  getShowsNotUpToDate(userId: string): Promise<TVShowProgress[]>;

  // Episode alert operations
  createEpisodeAlert(alert: Omit<NewEpisodeAlert, 'id' | 'createdAt'>): Promise<NewEpisodeAlert>;
  getEpisodeAlert(id: string): Promise<NewEpisodeAlert | null>;
  getPendingAlerts(userId: string): Promise<NewEpisodeAlert[]>;
  getAlertsForShow(watchlistItemId: string): Promise<NewEpisodeAlert[]>;
  markAlertSent(id: string): Promise<NewEpisodeAlert | null>;
  deleteAlert(id: string): Promise<boolean>;

  // Utility
  getItemsNeedingEpisodeCheck(checkIntervalMs: number): Promise<WatchlistItem[]>;
}

export interface WatchlistDatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ lastID: number; changes: number }>;
}

/**
 * Database-backed watchlist store
 */
export class DatabaseWatchlistStore implements WatchlistStore {
  constructor(private readonly db: WatchlistDatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS watchlist_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        media_type TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        poster_url TEXT,
        release_date INTEGER,
        status TEXT NOT NULL DEFAULT 'want_to_watch',
        rating REAL,
        total_seasons INTEGER,
        total_episodes INTEGER,
        last_episode_check INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_id, external_id)
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS tv_show_progress (
        id TEXT PRIMARY KEY,
        watchlist_item_id TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        last_watched_season INTEGER NOT NULL DEFAULT 0,
        last_watched_episode INTEGER NOT NULL DEFAULT 0,
        next_episode_season INTEGER,
        next_episode_number INTEGER,
        next_episode_title TEXT,
        next_episode_air_date INTEGER,
        is_up_to_date INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (watchlist_item_id) REFERENCES watchlist_items(id) ON DELETE CASCADE
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS episode_alerts (
        id TEXT PRIMARY KEY,
        watchlist_item_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        show_title TEXT NOT NULL,
        episode_season INTEGER NOT NULL,
        episode_number INTEGER NOT NULL,
        episode_title TEXT,
        episode_air_date INTEGER,
        alert_type TEXT NOT NULL,
        scheduled_for INTEGER NOT NULL,
        sent_at INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (watchlist_item_id) REFERENCES watchlist_items(id) ON DELETE CASCADE
      )
    `);

    await this.db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist_items(user_id)');
    await this.db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_status ON watchlist_items(user_id, status)');
    await this.db.run('CREATE INDEX IF NOT EXISTS idx_progress_user ON tv_show_progress(user_id)');
    await this.db.run('CREATE INDEX IF NOT EXISTS idx_alerts_user ON episode_alerts(user_id, sent_at)');
  }

  async addItem(item: Omit<WatchlistItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<WatchlistItem> {
    const id = randomUUID();
    const now = Date.now();

    await this.db.run(
      `INSERT INTO watchlist_items (
        id, user_id, media_type, external_id, title, poster_url,
        release_date, status, rating, total_seasons, total_episodes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, item.userId, item.mediaType, item.externalId, item.title,
        item.posterUrl ?? null, item.releaseDate ?? null, item.status,
        item.rating ?? null, item.totalSeasons ?? null, item.totalEpisodes ?? null,
        now, now,
      ]
    );

    // Create progress record for TV shows
    if (item.mediaType === 'tv_show') {
      await this.db.run(
        `INSERT INTO tv_show_progress (
          id, watchlist_item_id, user_id, last_watched_season,
          last_watched_episode, is_up_to_date, updated_at
        ) VALUES (?, ?, ?, 0, 0, 0, ?)`,
        [randomUUID(), id, item.userId, now]
      );
    }

    return { ...item, id, createdAt: now, updatedAt: now };
  }

  async getItem(id: string): Promise<WatchlistItem | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM watchlist_items WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? this.mapRowToItem(rows[0]) : null;
  }

  async getItemByExternalId(userId: string, externalId: string): Promise<WatchlistItem | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM watchlist_items WHERE user_id = ? AND external_id = ?',
      [userId, externalId]
    );
    return rows.length > 0 ? this.mapRowToItem(rows[0]) : null;
  }

  async getUserWatchlist(userId: string, filters?: {
    mediaType?: MediaType;
    status?: WatchStatus;
  }): Promise<WatchlistItem[]> {
    let sql = 'SELECT * FROM watchlist_items WHERE user_id = ?';
    const params: unknown[] = [userId];

    if (filters?.mediaType) {
      sql += ' AND media_type = ?';
      params.push(filters.mediaType);
    }

    if (filters?.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY updated_at DESC';

    const rows = await this.db.query<Record<string, unknown>>(sql, params);
    return rows.map(row => this.mapRowToItem(row));
  }

  async updateItem(id: string, updates: Partial<Omit<WatchlistItem, 'id' | 'userId' | 'createdAt'>>): Promise<WatchlistItem | null> {
    const item = await this.getItem(id);
    if (!item) return null;

    const fields: string[] = ['updated_at = ?'];
    const params: unknown[] = [Date.now()];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      params.push(updates.title);
    }
    if (updates.posterUrl !== undefined) {
      fields.push('poster_url = ?');
      params.push(updates.posterUrl);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      params.push(updates.status);
    }
    if (updates.rating !== undefined) {
      fields.push('rating = ?');
      params.push(updates.rating);
    }
    if (updates.totalSeasons !== undefined) {
      fields.push('total_seasons = ?');
      params.push(updates.totalSeasons);
    }
    if (updates.totalEpisodes !== undefined) {
      fields.push('total_episodes = ?');
      params.push(updates.totalEpisodes);
    }
    if (updates.lastEpisodeCheck !== undefined) {
      fields.push('last_episode_check = ?');
      params.push(updates.lastEpisodeCheck);
    }

    params.push(id);

    await this.db.run(
      `UPDATE watchlist_items SET ${fields.join(', ')} WHERE id = ?`,
      params
    );

    return this.getItem(id);
  }

  async deleteItem(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM watchlist_items WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async getProgress(watchlistItemId: string): Promise<TVShowProgress | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM tv_show_progress WHERE watchlist_item_id = ?',
      [watchlistItemId]
    );
    return rows.length > 0 ? this.mapRowToProgress(rows[0]) : null;
  }

  async updateProgress(watchlistItemId: string, season: number, episode: number): Promise<TVShowProgress> {
    const existing = await this.getProgress(watchlistItemId);
    const now = Date.now();

    if (existing) {
      await this.db.run(
        `UPDATE tv_show_progress SET
          last_watched_season = ?,
          last_watched_episode = ?,
          is_up_to_date = CASE
            WHEN next_episode_season IS NULL THEN 1
            WHEN ? > next_episode_season THEN 1
            WHEN ? = next_episode_season AND ? >= next_episode_number THEN 1
            ELSE 0
          END,
          updated_at = ?
        WHERE watchlist_item_id = ?`,
        [season, episode, season, season, episode, now, watchlistItemId]
      );
    } else {
      const item = await this.getItem(watchlistItemId);
      if (!item) {
        throw new Error(`Watchlist item ${watchlistItemId} not found`);
      }

      await this.db.run(
        `INSERT INTO tv_show_progress (
          id, watchlist_item_id, user_id, last_watched_season,
          last_watched_episode, is_up_to_date, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [randomUUID(), watchlistItemId, item.userId, season, episode, now]
      );
    }

    return (await this.getProgress(watchlistItemId))!;
  }

  async setNextEpisode(watchlistItemId: string, episode: EpisodeInfo | null): Promise<TVShowProgress | null> {
    const progress = await this.getProgress(watchlistItemId);
    if (!progress) return null;

    const now = Date.now();

    if (episode) {
      await this.db.run(
        `UPDATE tv_show_progress SET
          next_episode_season = ?,
          next_episode_number = ?,
          next_episode_title = ?,
          next_episode_air_date = ?,
          is_up_to_date = CASE
            WHEN last_watched_season > ? THEN 1
            WHEN last_watched_season = ? AND last_watched_episode >= ? THEN 1
            ELSE 0
          END,
          updated_at = ?
        WHERE watchlist_item_id = ?`,
        [
          episode.seasonNumber, episode.episodeNumber, episode.title,
          episode.airDate ?? null, episode.seasonNumber, episode.seasonNumber,
          episode.episodeNumber, now, watchlistItemId,
        ]
      );
    } else {
      await this.db.run(
        `UPDATE tv_show_progress SET
          next_episode_season = NULL,
          next_episode_number = NULL,
          next_episode_title = NULL,
          next_episode_air_date = NULL,
          is_up_to_date = 1,
          updated_at = ?
        WHERE watchlist_item_id = ?`,
        [now, watchlistItemId]
      );
    }

    return this.getProgress(watchlistItemId);
  }

  async getShowsWithNewEpisodes(userId: string): Promise<TVShowProgress[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM tv_show_progress
       WHERE user_id = ?
       AND next_episode_air_date IS NOT NULL
       AND next_episode_air_date <= ?
       AND is_up_to_date = 0`,
      [userId, Date.now()]
    );
    return rows.map(row => this.mapRowToProgress(row));
  }

  async getShowsNotUpToDate(userId: string): Promise<TVShowProgress[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM tv_show_progress WHERE user_id = ? AND is_up_to_date = 0',
      [userId]
    );
    return rows.map(row => this.mapRowToProgress(row));
  }

  async createEpisodeAlert(alert: Omit<NewEpisodeAlert, 'id' | 'createdAt'>): Promise<NewEpisodeAlert> {
    const id = randomUUID();
    const now = Date.now();

    await this.db.run(
      `INSERT INTO episode_alerts (
        id, watchlist_item_id, user_id, show_title, episode_season,
        episode_number, episode_title, episode_air_date, alert_type,
        scheduled_for, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, alert.watchlistItemId, alert.userId, alert.showTitle,
        alert.episode.seasonNumber, alert.episode.episodeNumber,
        alert.episode.title ?? null, alert.episode.airDate ?? null,
        alert.alertType, alert.scheduledFor, now,
      ]
    );

    return { ...alert, id, createdAt: now };
  }

  async getEpisodeAlert(id: string): Promise<NewEpisodeAlert | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM episode_alerts WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? this.mapRowToAlert(rows[0]) : null;
  }

  async getPendingAlerts(userId: string): Promise<NewEpisodeAlert[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM episode_alerts
       WHERE user_id = ? AND sent_at IS NULL AND scheduled_for <= ?
       ORDER BY scheduled_for ASC`,
      [userId, Date.now()]
    );
    return rows.map(row => this.mapRowToAlert(row));
  }

  async getAlertsForShow(watchlistItemId: string): Promise<NewEpisodeAlert[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM episode_alerts WHERE watchlist_item_id = ? ORDER BY scheduled_for DESC',
      [watchlistItemId]
    );
    return rows.map(row => this.mapRowToAlert(row));
  }

  async markAlertSent(id: string): Promise<NewEpisodeAlert | null> {
    await this.db.run(
      'UPDATE episode_alerts SET sent_at = ? WHERE id = ?',
      [Date.now(), id]
    );
    return this.getEpisodeAlert(id);
  }

  async deleteAlert(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM episode_alerts WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async getItemsNeedingEpisodeCheck(checkIntervalMs: number): Promise<WatchlistItem[]> {
    const cutoff = Date.now() - checkIntervalMs;
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM watchlist_items
       WHERE media_type = 'tv_show'
       AND status IN ('watching', 'want_to_watch')
       AND (last_episode_check IS NULL OR last_episode_check < ?)`,
      [cutoff]
    );
    return rows.map(row => this.mapRowToItem(row));
  }

  private mapRowToItem(row: Record<string, unknown>): WatchlistItem {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      mediaType: row.media_type as MediaType,
      externalId: row.external_id as string,
      title: row.title as string,
      posterUrl: row.poster_url as string | undefined,
      releaseDate: row.release_date as number | undefined,
      status: row.status as WatchStatus,
      rating: row.rating as number | undefined,
      totalSeasons: row.total_seasons as number | undefined,
      totalEpisodes: row.total_episodes as number | undefined,
      lastEpisodeCheck: row.last_episode_check as number | undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  private mapRowToProgress(row: Record<string, unknown>): TVShowProgress {
    const nextEpisode: EpisodeInfo | undefined = row.next_episode_season
      ? {
          seasonNumber: row.next_episode_season as number,
          episodeNumber: row.next_episode_number as number,
          title: row.next_episode_title as string | undefined,
          airDate: row.next_episode_air_date as number | undefined,
        }
      : undefined;

    return {
      id: row.id as string,
      watchlistItemId: row.watchlist_item_id as string,
      userId: row.user_id as string,
      lastWatchedSeason: row.last_watched_season as number,
      lastWatchedEpisode: row.last_watched_episode as number,
      nextEpisode,
      isUpToDate: Boolean(row.is_up_to_date),
      updatedAt: row.updated_at as number,
    };
  }

  private mapRowToAlert(row: Record<string, unknown>): NewEpisodeAlert {
    return {
      id: row.id as string,
      watchlistItemId: row.watchlist_item_id as string,
      userId: row.user_id as string,
      showTitle: row.show_title as string,
      episode: {
        seasonNumber: row.episode_season as number,
        episodeNumber: row.episode_number as number,
        title: row.episode_title as string | undefined,
        airDate: row.episode_air_date as number | undefined,
      },
      alertType: row.alert_type as 'new_episode' | 'season_premiere' | 'season_finale',
      scheduledFor: row.scheduled_for as number,
      sentAt: row.sent_at as number | undefined,
      createdAt: row.created_at as number,
    };
  }
}

/**
 * In-memory watchlist store for testing
 */
export class InMemoryWatchlistStore implements WatchlistStore {
  private items = new Map<string, WatchlistItem>();
  private progress = new Map<string, TVShowProgress>();
  private alerts = new Map<string, NewEpisodeAlert>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async addItem(item: Omit<WatchlistItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<WatchlistItem> {
    const id = randomUUID();
    const now = Date.now();
    const newItem: WatchlistItem = { ...item, id, createdAt: now, updatedAt: now };
    this.items.set(id, newItem);

    // Create progress record for TV shows
    if (item.mediaType === 'tv_show') {
      const progressId = randomUUID();
      this.progress.set(id, {
        id: progressId,
        watchlistItemId: id,
        userId: item.userId,
        lastWatchedSeason: 0,
        lastWatchedEpisode: 0,
        isUpToDate: false,
        updatedAt: now,
      });
    }

    return newItem;
  }

  async getItem(id: string): Promise<WatchlistItem | null> {
    return this.items.get(id) ?? null;
  }

  async getItemByExternalId(userId: string, externalId: string): Promise<WatchlistItem | null> {
    for (const item of this.items.values()) {
      if (item.userId === userId && item.externalId === externalId) {
        return item;
      }
    }
    return null;
  }

  async getUserWatchlist(userId: string, filters?: {
    mediaType?: MediaType;
    status?: WatchStatus;
  }): Promise<WatchlistItem[]> {
    let result = Array.from(this.items.values()).filter(i => i.userId === userId);

    if (filters?.mediaType) {
      result = result.filter(i => i.mediaType === filters.mediaType);
    }
    if (filters?.status) {
      result = result.filter(i => i.status === filters.status);
    }

    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async updateItem(id: string, updates: Partial<Omit<WatchlistItem, 'id' | 'userId' | 'createdAt'>>): Promise<WatchlistItem | null> {
    const item = this.items.get(id);
    if (!item) return null;

    const updated: WatchlistItem = {
      ...item,
      ...updates,
      updatedAt: Date.now(),
    };
    this.items.set(id, updated);
    return updated;
  }

  async deleteItem(id: string): Promise<boolean> {
    this.progress.delete(id);
    // Delete associated alerts
    for (const [alertId, alert] of this.alerts) {
      if (alert.watchlistItemId === id) {
        this.alerts.delete(alertId);
      }
    }
    return this.items.delete(id);
  }

  async getProgress(watchlistItemId: string): Promise<TVShowProgress | null> {
    return this.progress.get(watchlistItemId) ?? null;
  }

  async updateProgress(watchlistItemId: string, season: number, episode: number): Promise<TVShowProgress> {
    const existing = this.progress.get(watchlistItemId);
    const now = Date.now();

    if (existing) {
      const isUpToDate = !existing.nextEpisode ||
        season > existing.nextEpisode.seasonNumber ||
        (season === existing.nextEpisode.seasonNumber && episode >= existing.nextEpisode.episodeNumber);

      const updated: TVShowProgress = {
        ...existing,
        lastWatchedSeason: season,
        lastWatchedEpisode: episode,
        isUpToDate,
        updatedAt: now,
      };
      this.progress.set(watchlistItemId, updated);
      return updated;
    }

    const item = this.items.get(watchlistItemId);
    if (!item) {
      throw new Error(`Watchlist item ${watchlistItemId} not found`);
    }

    const newProgress: TVShowProgress = {
      id: randomUUID(),
      watchlistItemId,
      userId: item.userId,
      lastWatchedSeason: season,
      lastWatchedEpisode: episode,
      isUpToDate: false,
      updatedAt: now,
    };
    this.progress.set(watchlistItemId, newProgress);
    return newProgress;
  }

  async setNextEpisode(watchlistItemId: string, episode: EpisodeInfo | null): Promise<TVShowProgress | null> {
    const progress = this.progress.get(watchlistItemId);
    if (!progress) return null;

    const isUpToDate = !episode ||
      progress.lastWatchedSeason > episode.seasonNumber ||
      (progress.lastWatchedSeason === episode.seasonNumber && progress.lastWatchedEpisode >= episode.episodeNumber);

    const updated: TVShowProgress = {
      ...progress,
      nextEpisode: episode ?? undefined,
      isUpToDate,
      updatedAt: Date.now(),
    };
    this.progress.set(watchlistItemId, updated);
    return updated;
  }

  async getShowsWithNewEpisodes(userId: string): Promise<TVShowProgress[]> {
    const now = Date.now();
    return Array.from(this.progress.values()).filter(p =>
      p.userId === userId &&
      p.nextEpisode?.airDate &&
      p.nextEpisode.airDate <= now &&
      !p.isUpToDate
    );
  }

  async getShowsNotUpToDate(userId: string): Promise<TVShowProgress[]> {
    return Array.from(this.progress.values()).filter(p =>
      p.userId === userId && !p.isUpToDate
    );
  }

  async createEpisodeAlert(alert: Omit<NewEpisodeAlert, 'id' | 'createdAt'>): Promise<NewEpisodeAlert> {
    const id = randomUUID();
    const now = Date.now();
    const newAlert: NewEpisodeAlert = { ...alert, id, createdAt: now };
    this.alerts.set(id, newAlert);
    return newAlert;
  }

  async getEpisodeAlert(id: string): Promise<NewEpisodeAlert | null> {
    return this.alerts.get(id) ?? null;
  }

  async getPendingAlerts(userId: string): Promise<NewEpisodeAlert[]> {
    const now = Date.now();
    return Array.from(this.alerts.values())
      .filter(a => a.userId === userId && !a.sentAt && a.scheduledFor <= now)
      .sort((a, b) => a.scheduledFor - b.scheduledFor);
  }

  async getAlertsForShow(watchlistItemId: string): Promise<NewEpisodeAlert[]> {
    return Array.from(this.alerts.values())
      .filter(a => a.watchlistItemId === watchlistItemId)
      .sort((a, b) => b.scheduledFor - a.scheduledFor);
  }

  async markAlertSent(id: string): Promise<NewEpisodeAlert | null> {
    const alert = this.alerts.get(id);
    if (!alert) return null;

    const updated: NewEpisodeAlert = { ...alert, sentAt: Date.now() };
    this.alerts.set(id, updated);
    return updated;
  }

  async deleteAlert(id: string): Promise<boolean> {
    return this.alerts.delete(id);
  }

  async getItemsNeedingEpisodeCheck(checkIntervalMs: number): Promise<WatchlistItem[]> {
    const cutoff = Date.now() - checkIntervalMs;
    return Array.from(this.items.values()).filter(i =>
      i.mediaType === 'tv_show' &&
      (i.status === 'watching' || i.status === 'want_to_watch') &&
      (!i.lastEpisodeCheck || i.lastEpisodeCheck < cutoff)
    );
  }
}

/**
 * Create a watchlist store instance
 */
export function createWatchlistStore(
  type: 'memory'
): InMemoryWatchlistStore;
export function createWatchlistStore(
  type: 'database',
  adapter: WatchlistDatabaseAdapter
): DatabaseWatchlistStore;
export function createWatchlistStore(
  type: 'memory' | 'database',
  adapter?: WatchlistDatabaseAdapter
): WatchlistStore {
  if (type === 'database') {
    if (!adapter) {
      throw new Error('Database adapter required for database store');
    }
    return new DatabaseWatchlistStore(adapter);
  }
  return new InMemoryWatchlistStore();
}
