/**
 * Productivity Module
 *
 * Comprehensive productivity suite with morning briefs, inbox zero automation,
 * email-to-todo pipeline, calendar conflict detection, task scoring, and weekly reviews.
 */

// =============================================================================
// Types
// =============================================================================

export * from './types.js';

// =============================================================================
// Configuration
// =============================================================================

export {
  // Schemas
  ProductivityConfigSchema,
  WeatherConfigSchema,
  CalendarConfigSchema,
  EmailConfigSchema,
  NewsConfigSchema,
  TaskScoringConfigSchema,
  TaskScoringWeightsSchema,
  MorningBriefConfigSchema,
  InboxZeroConfigSchema,
  EmailToTodoConfigSchema,
  CalendarConflictsConfigSchema,
  WeeklyReviewConfigSchema,

  // Types
  type ProductivityConfig,
  type WeatherConfig,
  type CalendarConfig,
  type EmailConfig,
  type NewsConfig,
  type TaskScoringConfig,
  type TaskScoringWeightsConfig,
  type MorningBriefConfig,
  type InboxZeroConfig,
  type EmailToTodoConfig,
  type CalendarConflictsConfig,
  type WeeklyReviewConfig,
} from './config.js';

// =============================================================================
// Providers
// =============================================================================

export {
  // Base
  BaseProvider,
  ProviderRegistry,
  ProviderError,
  getProviderRegistry,
  initProviderRegistry,

  // Weather
  WeatherProvider,
  OpenWeatherMapProvider,
  WeatherAPIProvider,
  createWeatherProvider,

  // Calendar
  CalendarProvider,
  GoogleCalendarProvider,
  OutlookCalendarProvider,
  createCalendarProvider,

  // Email
  EmailProvider,
  GmailProvider,
  OutlookMailProvider,
  createEmailProvider,
  type EmailQueryOptions,

  // News
  NewsProvider,
  NewsAPIProvider,
  RSSProvider,
  createNewsProvider,
  type NewsQueryOptions,
} from './providers/index.js';

// =============================================================================
// Stores
// =============================================================================

export {
  // Todo Store
  type TodoStore,
  type ProductivityConfigStore,
  type DatabaseAdapter,
  DatabaseTodoStore,
  DatabaseProductivityConfigStore,
  InMemoryTodoStore,
  InMemoryProductivityConfigStore,
  createTodoStore,
  createProductivityConfigStore,
} from './stores/productivity-store.js';

export {
  // Cache Store
  type CacheStore,
  type CacheStats,
  DatabaseCacheStore,
  InMemoryCacheStore,
  createCacheStore,
} from './stores/cache-store.js';

// =============================================================================
// Task Scoring
// =============================================================================

export {
  TaskScoringService,
  createTaskScoringService,

  // Eisenhower
  classifyTask,
  groupByQuadrant,
  generateEisenhowerSummary,
  type EisenhowerClassification,
  type EisenhowerSummary,
  type EisenhowerQuadrant,
} from './task-scoring/index.js';

// =============================================================================
// Calendar Conflicts
// =============================================================================

export {
  CalendarConflictService,
  createCalendarConflictService,
  type ConflictSummary,

  // Resolution suggestions
  generateResolutionSuggestions,
  prioritizeConflictResolutions,
} from './calendar-conflicts/index.js';

// =============================================================================
// Inbox Zero
// =============================================================================

export {
  InboxZeroService,
  createInboxZeroService,
  type ProcessedEmail,
  type EmailFlags,
  type InboxZeroStats,
  type InboxZeroRecommendation,

  // Categorization
  categorizeEmail,
  categorizeEmails,
  suggestActions,
  getCategoryDistribution,
  getArchiveCandidates,
  getUnsubscribeCandidates,

  // Priority scoring
  scoreEmailPriority,
  scoreEmails,
  getHighPriorityEmails,
  isVIPSender,
  type PriorityScore,
  type PriorityScorerConfig,
} from './inbox-zero/index.js';

// =============================================================================
// Email to Todo
// =============================================================================

export {
  EmailToTodoService,
  createEmailToTodoService,
  type EmailTaskCandidate,
  type TaskCreationResult,
  type AutoProcessResult,
  type EmailToTodoSummary,

  // Task extraction
  extractTasksFromEmail,
  isLikelyActionable,
  calculateActionabilityScore,
} from './email-to-todo/index.js';

// =============================================================================
// Morning Brief
// =============================================================================

export {
  MorningBriefService,
  createMorningBriefService,
  type MorningBriefProviders,

  // Formatting
  formatMorningBrief,
  type OutputFormat,
} from './morning-brief/index.js';

// =============================================================================
// Weekly Review
// =============================================================================

export {
  WeeklyReviewService,
  createWeeklyReviewService,
  type WeeklyReviewProviders,

  // Report generation
  generateReport,
  generateInsights,
  generateSuggestions,
  type ReportFormat,
} from './weekly-review/index.js';

// =============================================================================
// Productivity Manager
// =============================================================================

import type { ProductivityConfig } from './config.js';
import { ProductivityConfigSchema } from './config.js';
import type { TodoStore, ProductivityConfigStore, DatabaseAdapter } from './stores/productivity-store.js';
import { createTodoStore, createProductivityConfigStore } from './stores/productivity-store.js';
import type { CacheStore } from './stores/cache-store.js';
import { createCacheStore } from './stores/cache-store.js';
import { ProviderRegistry, initProviderRegistry } from './providers/base.js';
import { createWeatherProvider } from './providers/weather.js';
import { createCalendarProvider } from './providers/calendar.js';
import { createEmailProvider } from './providers/email.js';
import { createNewsProvider } from './providers/news.js';
import { TaskScoringService } from './task-scoring/index.js';
import { CalendarConflictService } from './calendar-conflicts/index.js';
import { InboxZeroService } from './inbox-zero/index.js';
import { EmailToTodoService } from './email-to-todo/index.js';
import { MorningBriefService } from './morning-brief/index.js';
import { WeeklyReviewService } from './weekly-review/index.js';

/**
 * Central productivity manager
 */
export class ProductivityManager {
  private initialized = false;
  private config: ProductivityConfig;

  // Stores
  private todoStore!: TodoStore;
  private configStore!: ProductivityConfigStore;
  private cacheStore!: CacheStore;

  // Registry
  private providerRegistry!: ProviderRegistry;

  // Services
  private taskScoringService?: TaskScoringService;
  private calendarConflictService?: CalendarConflictService;
  private inboxZeroService?: InboxZeroService;
  private emailToTodoService?: EmailToTodoService;
  private morningBriefService?: MorningBriefService;
  private weeklyReviewService?: WeeklyReviewService;

  constructor(config?: Partial<ProductivityConfig>) {
    const result = ProductivityConfigSchema.safeParse(config ?? {});
    if (!result.success) {
      throw new Error(`Invalid productivity config: ${result.error.message}`);
    }
    this.config = result.data;
  }

  /**
   * Initialize the productivity manager
   */
  async initialize(dbAdapter?: DatabaseAdapter): Promise<void> {
    if (this.initialized) {
      return;
    }

    const storeType = this.config.storeType;

    // Initialize stores
    if (storeType === 'database' && dbAdapter) {
      this.todoStore = createTodoStore('database', dbAdapter);
      this.configStore = createProductivityConfigStore('database', dbAdapter);
      this.cacheStore = createCacheStore('database', dbAdapter);
    } else {
      this.todoStore = createTodoStore('memory');
      this.configStore = createProductivityConfigStore('memory');
      this.cacheStore = createCacheStore('memory');
    }

    await this.todoStore.initialize();
    await this.configStore.initialize();
    await this.cacheStore.initialize();

    // Initialize provider registry
    this.providerRegistry = initProviderRegistry();

    // Register providers based on config
    await this.registerProviders();

    // Initialize services
    this.initializeServices();

    this.initialized = true;
  }

  /**
   * Register providers based on configuration
   */
  private async registerProviders(): Promise<void> {
    const { weather, calendar, email, news } = this.config;

    if (weather) {
      const provider = createWeatherProvider(weather.provider, weather);
      await provider.initialize();
      this.providerRegistry.register('weather', weather.provider, provider, true);
    }

    if (calendar) {
      const provider = createCalendarProvider(calendar.provider, calendar);
      await provider.initialize();
      this.providerRegistry.register('calendar', calendar.provider, provider, true);
    }

    if (email) {
      const provider = createEmailProvider(email.provider, email);
      await provider.initialize();
      this.providerRegistry.register('email', email.provider, provider, true);
    }

    if (news) {
      const provider = createNewsProvider(news.provider, news);
      await provider.initialize();
      this.providerRegistry.register('news', news.provider, provider, true);
    }
  }

  /**
   * Initialize services
   */
  private initializeServices(): void {
    // Task scoring
    if (this.config.taskScoring?.enabled !== false) {
      this.taskScoringService = new TaskScoringService(
        this.todoStore,
        this.config.taskScoring
      );
    }

    // Calendar conflicts
    const calendarProvider = this.providerRegistry.getDefault('calendar');
    if (calendarProvider && this.config.calendarConflicts?.enabled !== false) {
      this.calendarConflictService = new CalendarConflictService(
        calendarProvider as any,
        this.config.calendarConflicts
      );
    }

    // Inbox zero
    const emailProvider = this.providerRegistry.getDefault('email');
    if (emailProvider && this.config.inboxZero?.enabled !== false) {
      this.inboxZeroService = new InboxZeroService(
        emailProvider as any,
        this.config.inboxZero
      );
    }

    // Email to todo
    if (emailProvider && this.config.emailToTodo?.enabled !== false) {
      this.emailToTodoService = new EmailToTodoService(
        emailProvider as any,
        this.todoStore,
        this.config.emailToTodo
      );
    }

    // Morning brief
    if (this.config.morningBrief?.enabled !== false) {
      this.morningBriefService = new MorningBriefService(
        {
          weather: this.providerRegistry.getDefault('weather') as any,
          calendar: calendarProvider as any,
          email: emailProvider as any,
          news: this.providerRegistry.getDefault('news') as any,
          todoStore: this.todoStore,
        },
        this.config.morningBrief
      );
    }

    // Weekly review
    if (this.config.weeklyReview?.enabled !== false) {
      this.weeklyReviewService = new WeeklyReviewService(
        {
          calendar: calendarProvider as any,
          email: emailProvider as any,
          todoStore: this.todoStore,
        },
        this.config.weeklyReview
      );
    }
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get todo store
   */
  getTodoStore(): TodoStore {
    this.ensureInitialized();
    return this.todoStore;
  }

  /**
   * Get config store
   */
  getConfigStore(): ProductivityConfigStore {
    this.ensureInitialized();
    return this.configStore;
  }

  /**
   * Get cache store
   */
  getCacheStore(): CacheStore {
    this.ensureInitialized();
    return this.cacheStore;
  }

  /**
   * Get provider registry
   */
  getProviderRegistry(): ProviderRegistry {
    this.ensureInitialized();
    return this.providerRegistry;
  }

  /**
   * Get task scoring service
   */
  getTaskScoringService(): TaskScoringService | undefined {
    this.ensureInitialized();
    return this.taskScoringService;
  }

  /**
   * Get calendar conflict service
   */
  getCalendarConflictService(): CalendarConflictService | undefined {
    this.ensureInitialized();
    return this.calendarConflictService;
  }

  /**
   * Get inbox zero service
   */
  getInboxZeroService(): InboxZeroService | undefined {
    this.ensureInitialized();
    return this.inboxZeroService;
  }

  /**
   * Get email to todo service
   */
  getEmailToTodoService(): EmailToTodoService | undefined {
    this.ensureInitialized();
    return this.emailToTodoService;
  }

  /**
   * Get morning brief service
   */
  getMorningBriefService(): MorningBriefService | undefined {
    this.ensureInitialized();
    return this.morningBriefService;
  }

  /**
   * Get weekly review service
   */
  getWeeklyReviewService(): WeeklyReviewService | undefined {
    this.ensureInitialized();
    return this.weeklyReviewService;
  }

  /**
   * Shutdown the manager
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    await this.providerRegistry.shutdownAll();
    this.initialized = false;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ProductivityManager not initialized. Call initialize() first.');
    }
  }
}

// =============================================================================
// Global Singleton
// =============================================================================

let globalProductivityManager: ProductivityManager | null = null;

/**
 * Initialize the global productivity manager
 */
export async function initProductivity(
  config?: Partial<ProductivityConfig>,
  dbAdapter?: DatabaseAdapter
): Promise<ProductivityManager> {
  globalProductivityManager = new ProductivityManager(config);
  await globalProductivityManager.initialize(dbAdapter);
  return globalProductivityManager;
}

/**
 * Get the global productivity manager
 */
export function getProductivityManager(): ProductivityManager {
  if (!globalProductivityManager) {
    throw new Error('ProductivityManager not initialized. Call initProductivity() first.');
  }
  return globalProductivityManager;
}

/**
 * Check if productivity manager is initialized
 */
export function isProductivityInitialized(): boolean {
  return globalProductivityManager !== null && globalProductivityManager.isInitialized();
}
