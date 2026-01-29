/**
 * Games Generator Service
 *
 * Service for generating and managing kid-friendly games.
 */

import type {
  AgeRange,
  GameDifficulty,
  GameDuration,
  GameGenerationRequest,
  GamePlayRecord,
  GameQueryOptions,
  GameType,
  GeneratedGame,
} from '../types.js';
import type { GamesStore } from '../stores/games-store.js';
import type { FamilyGroupStore } from '../stores/family-group-store.js';
import { GamesGenerationProvider, GameTemplates } from '../providers/games.js';

// ============================================================================
// Service Configuration
// ============================================================================

export interface GamesGeneratorServiceConfig {
  maxGamesPerDay: number;
  defaultAgeRange: AgeRange;
  enableAIGeneration: boolean;
  useFallbackTemplates: boolean;
  kidSafeMode: boolean;
}

// ============================================================================
// Games Generator Service
// ============================================================================

export class GamesGeneratorService {
  private readonly gamesStore: GamesStore;
  private readonly familyGroupStore: FamilyGroupStore;
  private readonly gamesProvider?: GamesGenerationProvider;
  private readonly config: GamesGeneratorServiceConfig;

  constructor(
    gamesStore: GamesStore,
    familyGroupStore: FamilyGroupStore,
    gamesProvider?: GamesGenerationProvider,
    config?: Partial<GamesGeneratorServiceConfig>
  ) {
    this.gamesStore = gamesStore;
    this.familyGroupStore = familyGroupStore;
    this.gamesProvider = gamesProvider;
    this.config = {
      maxGamesPerDay: config?.maxGamesPerDay || 10,
      defaultAgeRange: config?.defaultAgeRange || { min: 5, max: 12 },
      enableAIGeneration: config?.enableAIGeneration ?? true,
      useFallbackTemplates: config?.useFallbackTemplates ?? true,
      kidSafeMode: config?.kidSafeMode ?? true,
    };
  }

  // ============================================================================
  // Game Generation
  // ============================================================================

  /**
   * Generate a new game
   */
  async generateGame(request: GameGenerationRequest): Promise<GeneratedGame> {
    // Check daily limit
    const todayCount = await this.gamesStore.countGamesCreatedToday(request.familyGroupId);
    if (todayCount >= this.config.maxGamesPerDay) {
      throw new Error(`Daily game generation limit (${this.config.maxGamesPerDay}) reached`);
    }

    // Validate age range against family members if specified
    if (request.createdFor?.length) {
      await this.validateAgeRangeForMembers(
        request.familyGroupId,
        request.createdFor,
        request.ageRange
      );
    }

    let game: GeneratedGame;

    // Try AI generation first
    if (this.config.enableAIGeneration && this.gamesProvider) {
      const result = await this.gamesProvider.generateGame({
        ...request,
        educational: request.educational ?? true,
      });

      if (result.success && result.data) {
        game = result.data;
      } else if (this.config.useFallbackTemplates) {
        // Fall back to templates
        game = this.createFromTemplate(request);
      } else {
        throw new Error(`Failed to generate game: ${result.error}`);
      }
    } else if (this.config.useFallbackTemplates) {
      // Use templates directly
      game = this.createFromTemplate(request);
    } else {
      throw new Error('No game generation method available');
    }

    // Save to store
    return this.gamesStore.createGame(game);
  }

  /**
   * Generate a quick game with minimal options
   */
  async quickGenerate(
    familyGroupId: string,
    createdBy: string,
    gameType?: GameType
  ): Promise<GeneratedGame> {
    const type = gameType || this.getRandomGameType();

    return this.generateGame({
      familyGroupId,
      createdBy,
      gameType: type,
      ageRange: this.config.defaultAgeRange,
      duration: 'quick',
      difficulty: 'easy',
      educational: true,
    });
  }

  /**
   * Suggest a game based on family members' ages
   */
  async suggestGame(familyGroupId: string, createdBy: string): Promise<GeneratedGame> {
    const group = await this.familyGroupStore.getGroup(familyGroupId);
    if (!group) {
      throw new Error('Family group not found');
    }

    // Find children in the group
    const children = group.members.filter(m => m.role === 'child' && m.birthDate);

    // Calculate age range
    let ageRange: AgeRange;
    if (children.length > 0) {
      const ages = children.map(c => this.calculateAge(c.birthDate!));
      ageRange = {
        min: Math.min(...ages),
        max: Math.max(...ages),
      };
    } else {
      ageRange = this.config.defaultAgeRange;
    }

    // Select appropriate game type
    const gameType = this.selectGameTypeForAge(ageRange);
    const difficulty = this.selectDifficultyForAge(ageRange);

    return this.generateGame({
      familyGroupId,
      createdBy,
      gameType,
      ageRange,
      duration: 'medium',
      difficulty,
      educational: true,
      createdFor: children.map(c => c.userId),
    });
  }

  // ============================================================================
  // Game Management
  // ============================================================================

  /**
   * Get a game by ID
   */
  async getGame(id: string): Promise<GeneratedGame | null> {
    return this.gamesStore.getGame(id);
  }

  /**
   * List games for a family
   */
  async listGames(options: GameQueryOptions): Promise<GeneratedGame[]> {
    return this.gamesStore.listGames(options);
  }

  /**
   * Get recent games
   */
  async getRecentGames(familyGroupId: string, limit?: number): Promise<GeneratedGame[]> {
    return this.gamesStore.getRecentGames(familyGroupId, limit);
  }

  /**
   * Get games by type
   */
  async getGamesByType(familyGroupId: string, gameType: GameType): Promise<GeneratedGame[]> {
    return this.gamesStore.getGamesByType(familyGroupId, gameType);
  }

  /**
   * Get games suitable for an age range
   */
  async getGamesForAge(familyGroupId: string, ageRange: AgeRange): Promise<GeneratedGame[]> {
    return this.gamesStore.getGamesForAgeRange(familyGroupId, ageRange);
  }

  /**
   * Get highly rated games
   */
  async getFavoriteGames(familyGroupId: string, minRating?: number): Promise<GeneratedGame[]> {
    return this.gamesStore.getFavoriteGames(familyGroupId, minRating);
  }

  /**
   * Delete a game
   */
  async deleteGame(id: string): Promise<boolean> {
    return this.gamesStore.deleteGame(id);
  }

  // ============================================================================
  // Game Play Tracking
  // ============================================================================

  /**
   * Record a game play session
   */
  async recordPlay(
    gameId: string,
    players: string[],
    score?: number,
    duration?: number
  ): Promise<GeneratedGame | null> {
    const record: GamePlayRecord = {
      playedAt: Date.now(),
      players,
      score,
      duration,
    };

    return this.gamesStore.recordPlay(gameId, record);
  }

  /**
   * Rate a game
   */
  async rateGame(gameId: string, rating: number): Promise<GeneratedGame | null> {
    return this.gamesStore.updateRating(gameId, rating);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get game statistics for a family
   */
  async getStatistics(familyGroupId: string): Promise<GameStatistics> {
    const allGames = await this.gamesStore.listGames({ familyGroupId });

    const totalGames = allGames.length;
    const totalPlays = allGames.reduce((sum, g) => sum + (g.played?.length || 0), 0);

    // Count by type
    const byType: Record<GameType, number> = {
      trivia: 0,
      word_game: 0,
      math_game: 0,
      puzzle: 0,
      story_prompt: 0,
      scavenger_hunt: 0,
      riddles: 0,
    };

    for (const game of allGames) {
      byType[game.gameType]++;
    }

    // Find favorites
    const favorites = allGames
      .filter(g => g.rating !== undefined && g.rating >= 4)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 5);

    // Find most played
    const mostPlayed = allGames
      .filter(g => g.played && g.played.length > 0)
      .sort((a, b) => (b.played?.length || 0) - (a.played?.length || 0))
      .slice(0, 5);

    const averageRating = allGames.reduce((sum, g) => sum + (g.rating || 0), 0) /
      (allGames.filter(g => g.rating !== undefined).length || 1);

    return {
      totalGames,
      totalPlays,
      gamesByType: byType,
      favoriteGames: favorites,
      mostPlayedGames: mostPlayed,
      averageRating: Math.round(averageRating * 10) / 10,
      gamesCreatedToday: await this.gamesStore.countGamesCreatedToday(familyGroupId),
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private createFromTemplate(request: GameGenerationRequest): GeneratedGame {
    const now = Date.now();
    let content = GameTemplates.getTriviaTemplate(request.topics);

    switch (request.gameType) {
      case 'riddles':
        content = GameTemplates.getRiddlesTemplate();
        break;
      case 'word_game':
        content = GameTemplates.getWordGameTemplate();
        break;
      case 'scavenger_hunt':
        content = GameTemplates.getScavengerHuntTemplate();
        break;
    }

    return {
      id: '', // Will be set by store
      familyGroupId: request.familyGroupId,
      createdBy: request.createdBy,
      createdFor: request.createdFor,
      gameType: request.gameType,
      title: this.generateTitle(request.gameType),
      description: `A fun ${request.gameType.replace('_', ' ')} for the whole family!`,
      ageRange: request.ageRange,
      duration: request.duration,
      content,
      difficulty: request.difficulty,
      educational: request.educational ?? true,
      topics: request.topics,
      createdAt: now,
    };
  }

  private generateTitle(gameType: GameType): string {
    const titles: Record<GameType, string[]> = {
      trivia: ['Family Trivia Time', 'Brain Teaser Challenge', 'Knowledge Quest'],
      word_game: ['Word Wizard', 'Letter Fun', 'Vocabulary Adventure'],
      math_game: ['Math Masters', 'Number Ninjas', 'Calculation Challenge'],
      puzzle: ['Puzzle Paradise', 'Brain Benders', 'Mystery Solver'],
      story_prompt: ['Story Starters', 'Imagination Station', 'Creative Tales'],
      scavenger_hunt: ['Treasure Hunt', 'Discovery Quest', 'Find the Fun'],
      riddles: ['Riddle Me This', 'Mystery Riddles', 'Brain Twisters'],
    };

    const options = titles[gameType];
    return options[Math.floor(Math.random() * options.length)];
  }

  private getRandomGameType(): GameType {
    const types: GameType[] = [
      'trivia', 'word_game', 'math_game', 'puzzle',
      'story_prompt', 'scavenger_hunt', 'riddles',
    ];
    return types[Math.floor(Math.random() * types.length)];
  }

  private selectGameTypeForAge(ageRange: AgeRange): GameType {
    const avgAge = (ageRange.min + ageRange.max) / 2;

    if (avgAge < 6) {
      return ['scavenger_hunt', 'story_prompt', 'word_game'][Math.floor(Math.random() * 3)] as GameType;
    } else if (avgAge < 10) {
      return ['trivia', 'riddles', 'math_game', 'puzzle'][Math.floor(Math.random() * 4)] as GameType;
    } else {
      return ['trivia', 'puzzle', 'word_game', 'riddles'][Math.floor(Math.random() * 4)] as GameType;
    }
  }

  private selectDifficultyForAge(ageRange: AgeRange): GameDifficulty {
    const avgAge = (ageRange.min + ageRange.max) / 2;

    if (avgAge < 7) return 'easy';
    if (avgAge < 11) return 'medium';
    return 'hard';
  }

  private calculateAge(birthDate: number): number {
    const now = new Date();
    const birth = new Date(birthDate);
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  }

  private async validateAgeRangeForMembers(
    familyGroupId: string,
    memberIds: string[],
    ageRange: AgeRange
  ): Promise<void> {
    const group = await this.familyGroupStore.getGroup(familyGroupId);
    if (!group) return;

    for (const memberId of memberIds) {
      const member = group.members.find(m => m.userId === memberId);
      if (member?.birthDate) {
        const age = this.calculateAge(member.birthDate);
        if (age < ageRange.min || age > ageRange.max) {
          // Adjust warning but don't block
          console.warn(
            `Game may not be suitable for member ${memberId} (age ${age}) ` +
            `with target age range ${ageRange.min}-${ageRange.max}`
          );
        }
      }
    }
  }
}

// ============================================================================
// Types
// ============================================================================

export interface GameStatistics {
  totalGames: number;
  totalPlays: number;
  gamesByType: Record<GameType, number>;
  favoriteGames: GeneratedGame[];
  mostPlayedGames: GeneratedGame[];
  averageRating: number;
  gamesCreatedToday: number;
}

// ============================================================================
// Factory Function
// ============================================================================

export function createGamesGeneratorService(
  gamesStore: GamesStore,
  familyGroupStore: FamilyGroupStore,
  gamesProvider?: GamesGenerationProvider,
  config?: Partial<GamesGeneratorServiceConfig>
): GamesGeneratorService {
  return new GamesGeneratorService(gamesStore, familyGroupStore, gamesProvider, config);
}
