/**
 * Family Features Module
 *
 * Comprehensive family management module including:
 * - Family group management
 * - Weekly meal planning with grocery lists
 * - School calendar sync with notifications
 * - Family projects with research summaries
 * - Cross-user memory sharing
 * - Kid-friendly games generator
 * - Recipe suggestions
 */

import type {
  CalendarProvider,
  DatabaseAdapter,
  FamilyGroup,
  FamilyGroupSettings,
  FamilyMember,
} from './types.js';
import { FamilyConfigSchema, getDefaultFamilyConfig, type FamilyConfig } from './config.js';

// Stores
import {
  createFamilyGroupStore,
  createMealPlanStore,
  createGroceryListStore,
  createRecipeStore,
  createAvailableIngredientStore,
  createSchoolEventStore,
  createSchoolCalendarSourceStore,
  createEventReminderStore,
  createProjectStore,
  createWeeklySummaryStore,
  createSharedMemoryStore,
  createMemorySharingSettingsStore,
  createMemoryConsentStore,
  createGamesStore,
  type FamilyGroupStore,
  type MealPlanStore,
  type GroceryListStore,
  type RecipeStore,
  type AvailableIngredientStore,
  type SchoolEventStore,
  type SchoolCalendarSourceStore,
  type EventReminderStore,
  type ProjectStore,
  type WeeklySummaryStore,
  type SharedMemoryStore,
  type MemorySharingSettingsStore,
  type MemoryConsentStore,
  type GamesStore,
} from './stores/index.js';

// Providers
import {
  initFamilyProviderRegistry,
  resetFamilyProviderRegistry,
  createCalendarProvider,
  createRecipeProvider,
  createGamesProvider,
  type SchoolCalendarProvider,
  type RecipeAPIProvider,
  type GamesGenerationProvider,
} from './providers/index.js';

// Services
import {
  MealPlanningService,
  createMealPlanningService,
} from './meal-planning/index.js';
import {
  RecipeSuggestionService,
  createRecipeSuggestionService,
} from './recipes/index.js';
import {
  SchoolCalendarService,
  createSchoolCalendarService,
} from './school-calendar/index.js';
import {
  FamilyProjectService,
  createFamilyProjectService,
} from './projects/index.js';
import {
  SharedMemoryService,
  createSharedMemoryService,
  type KeyManager,
} from './shared-memories/index.js';
import {
  GamesGeneratorService,
  createGamesGeneratorService,
} from './games/index.js';

// ============================================================================
// Family Manager
// ============================================================================

export class FamilyManager {
  private initialized = false;
  private config: FamilyConfig;

  // Stores
  private familyGroupStore!: FamilyGroupStore;
  private mealPlanStore!: MealPlanStore;
  private groceryListStore!: GroceryListStore;
  private recipeStore!: RecipeStore;
  private ingredientStore!: AvailableIngredientStore;
  private schoolEventStore!: SchoolEventStore;
  private calendarSourceStore!: SchoolCalendarSourceStore;
  private eventReminderStore!: EventReminderStore;
  private projectStore!: ProjectStore;
  private weeklySummaryStore!: WeeklySummaryStore;
  private sharedMemoryStore!: SharedMemoryStore;
  private memorySharingSettingsStore!: MemorySharingSettingsStore;
  private memoryConsentStore!: MemoryConsentStore;
  private gamesStore!: GamesStore;

  // Services
  private mealPlanningService?: MealPlanningService;
  private recipeSuggestionService?: RecipeSuggestionService;
  private schoolCalendarService?: SchoolCalendarService;
  private familyProjectService?: FamilyProjectService;
  private sharedMemoryService?: SharedMemoryService;
  private gamesGeneratorService?: GamesGeneratorService;

  // Providers
  private calendarProviders = new Map<CalendarProvider, SchoolCalendarProvider>();
  private recipeProvider?: RecipeAPIProvider;
  private gamesProvider?: GamesGenerationProvider;

  constructor(config?: Partial<FamilyConfig>) {
    const result = FamilyConfigSchema.safeParse(config ?? {});
    if (!result.success) {
      throw new Error(`Invalid family config: ${result.error.message}`);
    }
    this.config = result.data;
  }

  /**
   * Initialize the family module
   */
  async initialize(
    dbAdapter?: DatabaseAdapter,
    keyManager?: KeyManager
  ): Promise<void> {
    if (this.initialized) return;

    const storeType = this.config.storeType;

    // Initialize stores
    this.familyGroupStore = createFamilyGroupStore(storeType, dbAdapter);
    this.mealPlanStore = createMealPlanStore(storeType, dbAdapter);
    this.groceryListStore = createGroceryListStore(storeType, dbAdapter);
    this.recipeStore = createRecipeStore(storeType, dbAdapter);
    this.ingredientStore = createAvailableIngredientStore(storeType, dbAdapter);
    this.schoolEventStore = createSchoolEventStore(storeType, dbAdapter);
    this.calendarSourceStore = createSchoolCalendarSourceStore(storeType, dbAdapter);
    this.eventReminderStore = createEventReminderStore(storeType, dbAdapter);
    this.projectStore = createProjectStore(storeType, dbAdapter);
    this.weeklySummaryStore = createWeeklySummaryStore(storeType, dbAdapter);
    this.sharedMemoryStore = createSharedMemoryStore(storeType, dbAdapter);
    this.memorySharingSettingsStore = createMemorySharingSettingsStore(storeType, dbAdapter);
    this.memoryConsentStore = createMemoryConsentStore(storeType, dbAdapter);
    this.gamesStore = createGamesStore(storeType, dbAdapter);

    // Initialize all stores
    await Promise.all([
      this.familyGroupStore.initialize(),
      this.mealPlanStore.initialize(),
      this.groceryListStore.initialize(),
      this.recipeStore.initialize(),
      this.ingredientStore.initialize(),
      this.schoolEventStore.initialize(),
      this.calendarSourceStore.initialize(),
      this.eventReminderStore.initialize(),
      this.projectStore.initialize(),
      this.weeklySummaryStore.initialize(),
      this.sharedMemoryStore.initialize(),
      this.memorySharingSettingsStore.initialize(),
      this.memoryConsentStore.initialize(),
      this.gamesStore.initialize(),
    ]);

    // Initialize provider registry
    initFamilyProviderRegistry();

    // Initialize providers
    await this.initializeProviders();

    // Initialize services
    this.initializeServices(keyManager);

    this.initialized = true;
  }

  /**
   * Shutdown the family module
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    // Stop services
    this.schoolCalendarService?.stop();

    // Reset provider registry
    resetFamilyProviderRegistry();

    this.initialized = false;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // Family Group Management
  // ============================================================================

  /**
   * Create a new family group
   */
  async createFamilyGroup(
    name: string,
    createdBy: string,
    settings?: Partial<FamilyGroupSettings>
  ): Promise<FamilyGroup> {
    this.ensureInitialized();

    const defaultSettings: FamilyGroupSettings = {
      timezone: 'UTC',
      defaultReminderMinutes: [60, 1440],
      mealPlanStartDay: 'sunday',
      shareMemoriesEnabled: true,
      kidSafeMode: true,
      ...this.config.defaultGroupSettings,
      ...settings,
    };

    return this.familyGroupStore.createGroup({
      name,
      createdBy,
      members: [
        {
          userId: createdBy,
          role: 'admin',
          joinedAt: Date.now(),
        },
      ],
      settings: defaultSettings,
    });
  }

  /**
   * Get a family group
   */
  async getFamilyGroup(id: string): Promise<FamilyGroup | null> {
    this.ensureInitialized();
    return this.familyGroupStore.getGroup(id);
  }

  /**
   * Update a family group
   */
  async updateFamilyGroup(
    id: string,
    updates: Partial<Pick<FamilyGroup, 'name' | 'settings'>>
  ): Promise<FamilyGroup | null> {
    this.ensureInitialized();
    return this.familyGroupStore.updateGroup(id, updates);
  }

  /**
   * Delete a family group
   */
  async deleteFamilyGroup(id: string): Promise<boolean> {
    this.ensureInitialized();
    return this.familyGroupStore.deleteGroup(id);
  }

  /**
   * Get family groups for a user
   */
  async getUserFamilyGroups(userId: string): Promise<FamilyGroup[]> {
    this.ensureInitialized();
    return this.familyGroupStore.getGroupsByUser(userId);
  }

  /**
   * Add a member to a family group
   */
  async addFamilyMember(
    groupId: string,
    member: Omit<FamilyMember, 'joinedAt'>
  ): Promise<FamilyGroup | null> {
    this.ensureInitialized();
    return this.familyGroupStore.addMember(groupId, member);
  }

  /**
   * Remove a member from a family group
   */
  async removeFamilyMember(groupId: string, userId: string): Promise<FamilyGroup | null> {
    this.ensureInitialized();
    return this.familyGroupStore.removeMember(groupId, userId);
  }

  // ============================================================================
  // Service Getters
  // ============================================================================

  /**
   * Get the meal planning service
   */
  getMealPlanningService(): MealPlanningService {
    this.ensureInitialized();
    if (!this.mealPlanningService) {
      throw new Error('Meal planning service not initialized');
    }
    return this.mealPlanningService;
  }

  /**
   * Get the recipe suggestion service
   */
  getRecipeSuggestionService(): RecipeSuggestionService {
    this.ensureInitialized();
    if (!this.recipeSuggestionService) {
      throw new Error('Recipe suggestion service not initialized');
    }
    return this.recipeSuggestionService;
  }

  /**
   * Get the school calendar service
   */
  getSchoolCalendarService(): SchoolCalendarService {
    this.ensureInitialized();
    if (!this.schoolCalendarService) {
      throw new Error('School calendar service not initialized');
    }
    return this.schoolCalendarService;
  }

  /**
   * Get the family project service
   */
  getFamilyProjectService(): FamilyProjectService {
    this.ensureInitialized();
    if (!this.familyProjectService) {
      throw new Error('Family project service not initialized');
    }
    return this.familyProjectService;
  }

  /**
   * Get the shared memory service
   */
  getSharedMemoryService(): SharedMemoryService {
    this.ensureInitialized();
    if (!this.sharedMemoryService) {
      throw new Error('Shared memory service not initialized');
    }
    return this.sharedMemoryService;
  }

  /**
   * Get the games generator service
   */
  getGamesGeneratorService(): GamesGeneratorService {
    this.ensureInitialized();
    if (!this.gamesGeneratorService) {
      throw new Error('Games generator service not initialized');
    }
    return this.gamesGeneratorService;
  }

  // ============================================================================
  // Store Getters
  // ============================================================================

  getFamilyGroupStore(): FamilyGroupStore {
    this.ensureInitialized();
    return this.familyGroupStore;
  }

  getMealPlanStore(): MealPlanStore {
    this.ensureInitialized();
    return this.mealPlanStore;
  }

  getGroceryListStore(): GroceryListStore {
    this.ensureInitialized();
    return this.groceryListStore;
  }

  getRecipeStore(): RecipeStore {
    this.ensureInitialized();
    return this.recipeStore;
  }

  getIngredientStore(): AvailableIngredientStore {
    this.ensureInitialized();
    return this.ingredientStore;
  }

  getSchoolEventStore(): SchoolEventStore {
    this.ensureInitialized();
    return this.schoolEventStore;
  }

  getProjectStore(): ProjectStore {
    this.ensureInitialized();
    return this.projectStore;
  }

  getGamesStore(): GamesStore {
    this.ensureInitialized();
    return this.gamesStore;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async initializeProviders(): Promise<void> {
    // Initialize calendar providers
    if (this.config.schoolCalendar?.enabled !== false) {
      const syncInterval = this.config.schoolCalendar?.syncIntervalMinutes ?? 60;
      const googleApiKeyEnvVar = this.config.schoolCalendar?.googleCalendarApiKeyEnvVar ?? 'GOOGLE_CALENDAR_API_KEY';

      // iCal provider (always available)
      const icalProvider = createCalendarProvider('ical', {
        enabled: true,
        provider: 'ical',
        syncIntervalMinutes: syncInterval,
      });
      await icalProvider.initialize();
      this.calendarProviders.set('ical', icalProvider);

      // Google provider (if API key configured)
      if (process.env[googleApiKeyEnvVar]) {
        const googleProvider = createCalendarProvider('google', {
          enabled: true,
          provider: 'google',
          syncIntervalMinutes: syncInterval,
          apiKeyEnvVar: googleApiKeyEnvVar,
        });
        await googleProvider.initialize();
        this.calendarProviders.set('google', googleProvider);
      }

      // Manual provider
      const manualProvider = createCalendarProvider('manual', {
        enabled: true,
        provider: 'manual',
        syncIntervalMinutes: 0,
      });
      await manualProvider.initialize();
      this.calendarProviders.set('manual', manualProvider);
    }

    // Initialize recipe provider
    if (this.config.recipes?.enabled !== false && this.config.recipes?.provider !== 'local') {
      const provider = this.config.recipes?.provider ?? 'spoonacular';
      const apiKeyEnvVar = this.config.recipes?.apiKeyEnvVar ?? 'RECIPE_API_KEY';

      if (process.env[apiKeyEnvVar]) {
        this.recipeProvider = createRecipeProvider(provider as 'spoonacular' | 'edamam', {
          enabled: true,
          provider,
          maxResults: this.config.recipes?.maxSuggestions ?? 10,
          apiKeyEnvVar,
        });
        await this.recipeProvider.initialize();
      }
    }

    // Initialize games provider
    if (this.config.games?.enabled !== false) {
      const aiKeyEnvVar = this.config.games?.aiProviderApiKeyEnvVar ?? 'OPENAI_API_KEY';

      if (process.env[aiKeyEnvVar]) {
        this.gamesProvider = createGamesProvider({
          enabled: true,
          model: this.config.games?.aiModel ?? 'gpt-4o-mini',
          maxTokens: this.config.games?.maxTokens ?? 2000,
          apiKeyEnvVar: aiKeyEnvVar,
          kidSafePrompts: this.config.games?.kidSafePrompts ?? true,
        });
        await this.gamesProvider.initialize();
      }
    }
  }

  private initializeServices(keyManager?: KeyManager): void {
    // Meal planning service
    if (this.config.mealPlanning?.enabled !== false) {
      this.mealPlanningService = createMealPlanningService(
        this.mealPlanStore,
        this.groceryListStore,
        this.familyGroupStore,
        this.recipeStore,
        {
          defaultServings: this.config.mealPlanning?.defaultServings,
          weekStartDay: this.config.defaultGroupSettings?.mealPlanStartDay,
        }
      );
    }

    // Recipe suggestion service
    if (this.config.recipes?.enabled !== false) {
      this.recipeSuggestionService = createRecipeSuggestionService(
        this.recipeStore,
        this.ingredientStore,
        this.recipeProvider,
        {
          maxSuggestions: this.config.recipes?.maxSuggestions,
          prioritizeFavorites: this.config.recipes?.prioritizeFavorites,
          considerExpiringIngredients: this.config.recipes?.considerExpiringIngredients,
          expirationWarningDays: this.config.recipes?.expirationWarningDays,
        }
      );
    }

    // School calendar service
    if (this.config.schoolCalendar?.enabled !== false) {
      this.schoolCalendarService = createSchoolCalendarService(
        this.schoolEventStore,
        this.calendarSourceStore,
        this.eventReminderStore,
        this.calendarProviders,
        {
          syncIntervalMinutes: this.config.schoolCalendar?.syncIntervalMinutes,
          enableNotifications: this.config.schoolCalendar?.enableNotifications,
        }
      );
    }

    // Family project service
    if (this.config.projects?.enabled !== false) {
      this.familyProjectService = createFamilyProjectService(
        this.projectStore,
        this.weeklySummaryStore,
        {
          maxTopicsPerProject: this.config.projects?.maxTopicsPerProject,
          maxNotesPerTopic: this.config.projects?.maxNotesPerTopic,
          enableWeeklySummaries: this.config.projects?.enableWeeklySummaries,
        }
      );
    }

    // Shared memory service
    if (this.config.sharedMemories?.enabled !== false) {
      this.sharedMemoryService = createSharedMemoryService(
        this.sharedMemoryStore,
        this.memorySharingSettingsStore,
        this.memoryConsentStore,
        this.familyGroupStore,
        keyManager,
        {
          encryptionEnabled: this.config.sharedMemories?.encryptionEnabled,
          maxMemoriesPerUser: this.config.sharedMemories?.maxMemoriesPerUser,
          defaultExpirationDays: this.config.sharedMemories?.defaultExpirationDays,
        }
      );
    }

    // Games generator service
    if (this.config.games?.enabled !== false) {
      this.gamesGeneratorService = createGamesGeneratorService(
        this.gamesStore,
        this.familyGroupStore,
        this.gamesProvider,
        {
          maxGamesPerDay: this.config.games?.maxGamesPerDay,
          defaultAgeRange: this.config.games?.defaultAgeRange,
          kidSafeMode: this.config.games?.kidSafePrompts,
        }
      );
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('FamilyManager not initialized. Call initialize() first.');
    }
  }
}

// ============================================================================
// Global Singleton
// ============================================================================

let globalFamilyManager: FamilyManager | null = null;

export async function initFamily(
  config?: Partial<FamilyConfig>,
  dbAdapter?: DatabaseAdapter,
  keyManager?: KeyManager
): Promise<FamilyManager> {
  globalFamilyManager = new FamilyManager(config);
  await globalFamilyManager.initialize(dbAdapter, keyManager);
  return globalFamilyManager;
}

export function getFamilyManager(): FamilyManager {
  if (!globalFamilyManager) {
    throw new Error('FamilyManager not initialized. Call initFamily() first.');
  }
  return globalFamilyManager;
}

export function isFamilyInitialized(): boolean {
  return globalFamilyManager?.isInitialized() ?? false;
}

// ============================================================================
// Exports
// ============================================================================

// Types
export * from './types.js';

// Config
export {
  FamilyConfigSchema,
  FamilyGroupSettingsSchema,
  MealPlanningConfigSchema,
  SchoolCalendarConfigSchema,
  FamilyProjectsConfigSchema,
  SharedMemoriesConfigSchema,
  GamesGeneratorConfigSchema,
  RecipeSuggestionsConfigSchema,
  validateFamilyConfig,
  safeParseFamilyConfig,
  getDefaultFamilyConfig,
  type FamilyConfig,
} from './config.js';

// Stores
export * from './stores/index.js';

// Providers
export * from './providers/index.js';

// Services
export {
  MealPlanningService,
  createMealPlanningService,
  GroceryGenerator,
  createGroceryGenerator,
} from './meal-planning/index.js';

export {
  RecipeSuggestionService,
  createRecipeSuggestionService,
  IngredientMatcher,
  createIngredientMatcher,
} from './recipes/index.js';

export {
  SchoolCalendarService,
  createSchoolCalendarService,
  NotificationScheduler,
  createNotificationScheduler,
} from './school-calendar/index.js';

export {
  FamilyProjectService,
  createFamilyProjectService,
  ResearchSummarizer,
  createResearchSummarizer,
} from './projects/index.js';

export {
  SharedMemoryService,
  createSharedMemoryService,
  ConsentManager,
  createConsentManager,
  type KeyManager,
  InMemoryKeyManager,
} from './shared-memories/index.js';

export {
  GamesGeneratorService,
  createGamesGeneratorService,
} from './games/index.js';
