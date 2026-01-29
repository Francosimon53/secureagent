/**
 * Games Store
 *
 * Persistence layer for generated kid-friendly games.
 */

import { randomUUID } from 'crypto';
import type {
  AgeRange,
  DatabaseAdapter,
  GameContent,
  GameDifficulty,
  GameDuration,
  GamePlayRecord,
  GameQueryOptions,
  GameType,
  GeneratedGame,
} from '../types.js';

// ============================================================================
// Games Store Interface
// ============================================================================

export interface GamesStore {
  initialize(): Promise<void>;

  // CRUD
  createGame(game: Omit<GeneratedGame, 'id' | 'createdAt'>): Promise<GeneratedGame>;
  getGame(id: string): Promise<GeneratedGame | null>;
  updateGame(id: string, updates: Partial<Omit<GeneratedGame, 'id' | 'createdAt'>>): Promise<GeneratedGame | null>;
  deleteGame(id: string): Promise<boolean>;

  // Query
  listGames(options: GameQueryOptions): Promise<GeneratedGame[]>;
  getGamesByType(familyGroupId: string, gameType: GameType): Promise<GeneratedGame[]>;
  getGamesForAgeRange(familyGroupId: string, ageRange: AgeRange): Promise<GeneratedGame[]>;
  getRecentGames(familyGroupId: string, limit?: number): Promise<GeneratedGame[]>;
  getFavoriteGames(familyGroupId: string, minRating?: number): Promise<GeneratedGame[]>;

  // Play tracking
  recordPlay(gameId: string, record: GamePlayRecord): Promise<GeneratedGame | null>;
  updateRating(gameId: string, rating: number): Promise<GeneratedGame | null>;

  // Stats
  countGamesCreatedToday(familyGroupId: string): Promise<number>;
  countGamesCreatedByUser(familyGroupId: string, userId: string): Promise<number>;
}

// ============================================================================
// Database Row Type
// ============================================================================

interface GameRow {
  id: string;
  family_group_id: string;
  created_by: string;
  created_for: string | null;
  game_type: string;
  title: string;
  description: string | null;
  age_range_min: number;
  age_range_max: number;
  duration: string;
  content: string;
  difficulty: string;
  educational: number;
  topics: string | null;
  played: string | null;
  rating: number | null;
  created_at: number;
}

// ============================================================================
// Database Games Store
// ============================================================================

export class DatabaseGamesStore implements GamesStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS generated_games (
        id TEXT PRIMARY KEY,
        family_group_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_for TEXT,
        game_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        age_range_min INTEGER NOT NULL,
        age_range_max INTEGER NOT NULL,
        duration TEXT NOT NULL,
        content TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        educational INTEGER DEFAULT 0,
        topics TEXT,
        played TEXT,
        rating REAL,
        created_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_games_family ON generated_games(family_group_id)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_games_type ON generated_games(game_type, age_range_min, age_range_max)
    `);
  }

  async createGame(game: Omit<GeneratedGame, 'id' | 'createdAt'>): Promise<GeneratedGame> {
    const now = Date.now();
    const id = randomUUID();

    const newGame: GeneratedGame = {
      ...game,
      id,
      createdAt: now,
    };

    await this.db.execute(
      `INSERT INTO generated_games (
        id, family_group_id, created_by, created_for, game_type, title, description,
        age_range_min, age_range_max, duration, content, difficulty, educational,
        topics, played, rating, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newGame.id,
        newGame.familyGroupId,
        newGame.createdBy,
        newGame.createdFor ? JSON.stringify(newGame.createdFor) : null,
        newGame.gameType,
        newGame.title,
        newGame.description ?? null,
        newGame.ageRange.min,
        newGame.ageRange.max,
        newGame.duration,
        JSON.stringify(newGame.content),
        newGame.difficulty,
        newGame.educational ? 1 : 0,
        newGame.topics ? JSON.stringify(newGame.topics) : null,
        newGame.played ? JSON.stringify(newGame.played) : null,
        newGame.rating ?? null,
        newGame.createdAt,
      ]
    );

    return newGame;
  }

  async getGame(id: string): Promise<GeneratedGame | null> {
    const { rows } = await this.db.query<GameRow>(
      'SELECT * FROM generated_games WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.rowToGame(rows[0]);
  }

  async updateGame(id: string, updates: Partial<Omit<GeneratedGame, 'id' | 'createdAt'>>): Promise<GeneratedGame | null> {
    const existing = await this.getGame(id);
    if (!existing) return null;

    const updated: GeneratedGame = {
      ...existing,
      ...updates,
    };

    await this.db.execute(
      `UPDATE generated_games SET
        title = ?, description = ?, content = ?, difficulty = ?, educational = ?,
        topics = ?, played = ?, rating = ?
      WHERE id = ?`,
      [
        updated.title,
        updated.description ?? null,
        JSON.stringify(updated.content),
        updated.difficulty,
        updated.educational ? 1 : 0,
        updated.topics ? JSON.stringify(updated.topics) : null,
        updated.played ? JSON.stringify(updated.played) : null,
        updated.rating ?? null,
        id,
      ]
    );

    return updated;
  }

  async deleteGame(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM generated_games WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async listGames(options: GameQueryOptions): Promise<GeneratedGame[]> {
    let sql = 'SELECT * FROM generated_games WHERE family_group_id = ?';
    const params: unknown[] = [options.familyGroupId];

    if (options.gameType) {
      sql += ' AND game_type = ?';
      params.push(options.gameType);
    }

    if (options.ageMin !== undefined) {
      sql += ' AND age_range_max >= ?';
      params.push(options.ageMin);
    }

    if (options.ageMax !== undefined) {
      sql += ' AND age_range_min <= ?';
      params.push(options.ageMax);
    }

    if (options.difficulty) {
      sql += ' AND difficulty = ?';
      params.push(options.difficulty);
    }

    const orderDir = options.orderDirection || 'desc';
    sql += ` ORDER BY created_at ${orderDir}`;

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const { rows } = await this.db.query<GameRow>(sql, params);
    return rows.map(row => this.rowToGame(row));
  }

  async getGamesByType(familyGroupId: string, gameType: GameType): Promise<GeneratedGame[]> {
    return this.listGames({ familyGroupId, gameType });
  }

  async getGamesForAgeRange(familyGroupId: string, ageRange: AgeRange): Promise<GeneratedGame[]> {
    return this.listGames({
      familyGroupId,
      ageMin: ageRange.min,
      ageMax: ageRange.max,
    });
  }

  async getRecentGames(familyGroupId: string, limit = 10): Promise<GeneratedGame[]> {
    return this.listGames({ familyGroupId, limit });
  }

  async getFavoriteGames(familyGroupId: string, minRating = 4): Promise<GeneratedGame[]> {
    const { rows } = await this.db.query<GameRow>(
      `SELECT * FROM generated_games
       WHERE family_group_id = ? AND rating >= ?
       ORDER BY rating DESC, created_at DESC`,
      [familyGroupId, minRating]
    );

    return rows.map(row => this.rowToGame(row));
  }

  async recordPlay(gameId: string, record: GamePlayRecord): Promise<GeneratedGame | null> {
    const game = await this.getGame(gameId);
    if (!game) return null;

    const played = game.played || [];
    played.push(record);

    return this.updateGame(gameId, { played });
  }

  async updateRating(gameId: string, rating: number): Promise<GeneratedGame | null> {
    const clampedRating = Math.max(0, Math.min(5, rating));
    return this.updateGame(gameId, { rating: clampedRating });
  }

  async countGamesCreatedToday(familyGroupId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { rows } = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM generated_games
       WHERE family_group_id = ? AND created_at >= ?`,
      [familyGroupId, startOfDay.getTime()]
    );

    return rows[0]?.count ?? 0;
  }

  async countGamesCreatedByUser(familyGroupId: string, userId: string): Promise<number> {
    const { rows } = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM generated_games
       WHERE family_group_id = ? AND created_by = ?`,
      [familyGroupId, userId]
    );

    return rows[0]?.count ?? 0;
  }

  private rowToGame(row: GameRow): GeneratedGame {
    return {
      id: row.id,
      familyGroupId: row.family_group_id,
      createdBy: row.created_by,
      createdFor: row.created_for ? (JSON.parse(row.created_for) as string[]) : undefined,
      gameType: row.game_type as GameType,
      title: row.title,
      description: row.description ?? undefined,
      ageRange: {
        min: row.age_range_min,
        max: row.age_range_max,
      },
      duration: row.duration as GameDuration,
      content: JSON.parse(row.content) as GameContent,
      difficulty: row.difficulty as GameDifficulty,
      educational: row.educational === 1,
      topics: row.topics ? (JSON.parse(row.topics) as string[]) : undefined,
      played: row.played ? (JSON.parse(row.played) as GamePlayRecord[]) : undefined,
      rating: row.rating ?? undefined,
      createdAt: row.created_at,
    };
  }
}

// ============================================================================
// In-Memory Implementation
// ============================================================================

export class InMemoryGamesStore implements GamesStore {
  private games = new Map<string, GeneratedGame>();

  async initialize(): Promise<void> {}

  async createGame(game: Omit<GeneratedGame, 'id' | 'createdAt'>): Promise<GeneratedGame> {
    const now = Date.now();
    const id = randomUUID();

    const newGame: GeneratedGame = {
      ...game,
      id,
      createdAt: now,
    };

    this.games.set(id, newGame);
    return newGame;
  }

  async getGame(id: string): Promise<GeneratedGame | null> {
    return this.games.get(id) ?? null;
  }

  async updateGame(id: string, updates: Partial<Omit<GeneratedGame, 'id' | 'createdAt'>>): Promise<GeneratedGame | null> {
    const existing = this.games.get(id);
    if (!existing) return null;

    const updated: GeneratedGame = {
      ...existing,
      ...updates,
    };

    this.games.set(id, updated);
    return updated;
  }

  async deleteGame(id: string): Promise<boolean> {
    return this.games.delete(id);
  }

  async listGames(options: GameQueryOptions): Promise<GeneratedGame[]> {
    let games = Array.from(this.games.values())
      .filter(g => g.familyGroupId === options.familyGroupId);

    if (options.gameType) {
      games = games.filter(g => g.gameType === options.gameType);
    }

    if (options.ageMin !== undefined) {
      games = games.filter(g => g.ageRange.max >= options.ageMin!);
    }

    if (options.ageMax !== undefined) {
      games = games.filter(g => g.ageRange.min <= options.ageMax!);
    }

    if (options.difficulty) {
      games = games.filter(g => g.difficulty === options.difficulty);
    }

    const orderDir = options.orderDirection || 'desc';
    games.sort((a, b) => orderDir === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);

    if (options.offset) {
      games = games.slice(options.offset);
    }
    if (options.limit) {
      games = games.slice(0, options.limit);
    }

    return games;
  }

  async getGamesByType(familyGroupId: string, gameType: GameType): Promise<GeneratedGame[]> {
    return this.listGames({ familyGroupId, gameType });
  }

  async getGamesForAgeRange(familyGroupId: string, ageRange: AgeRange): Promise<GeneratedGame[]> {
    return this.listGames({
      familyGroupId,
      ageMin: ageRange.min,
      ageMax: ageRange.max,
    });
  }

  async getRecentGames(familyGroupId: string, limit = 10): Promise<GeneratedGame[]> {
    return this.listGames({ familyGroupId, limit });
  }

  async getFavoriteGames(familyGroupId: string, minRating = 4): Promise<GeneratedGame[]> {
    return Array.from(this.games.values())
      .filter(g => g.familyGroupId === familyGroupId && g.rating !== undefined && g.rating >= minRating)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.createdAt - a.createdAt);
  }

  async recordPlay(gameId: string, record: GamePlayRecord): Promise<GeneratedGame | null> {
    const game = this.games.get(gameId);
    if (!game) return null;

    const played = game.played || [];
    played.push(record);
    game.played = played;

    return game;
  }

  async updateRating(gameId: string, rating: number): Promise<GeneratedGame | null> {
    const game = this.games.get(gameId);
    if (!game) return null;

    game.rating = Math.max(0, Math.min(5, rating));
    return game;
  }

  async countGamesCreatedToday(familyGroupId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    return Array.from(this.games.values()).filter(
      g => g.familyGroupId === familyGroupId && g.createdAt >= startOfDay.getTime()
    ).length;
  }

  async countGamesCreatedByUser(familyGroupId: string, userId: string): Promise<number> {
    return Array.from(this.games.values()).filter(
      g => g.familyGroupId === familyGroupId && g.createdBy === userId
    ).length;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createGamesStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): GamesStore {
  if (type === 'database' && dbAdapter) {
    return new DatabaseGamesStore(dbAdapter);
  }
  return new InMemoryGamesStore();
}
