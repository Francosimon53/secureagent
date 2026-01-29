/**
 * Lifestyle Module
 *
 * Provides lifestyle automation features including wine cellar management,
 * entertainment watchlist with episode tracking, and event discovery.
 */

// Types
export * from './types.js';

// Configuration
export {
  LifestyleConfigSchema,
  WineCellarConfigSchema,
  EntertainmentConfigSchema,
  EventDiscoveryConfigSchema,
  validateLifestyleConfig,
  safeParseLifestyleConfig,
  getDefaultLifestyleConfig,
  type LifestyleConfig,
  type WineCellarConfig,
  type EntertainmentConfig,
  type EventDiscoveryConfig,
} from './config.js';

// Stores
export {
  type WineStore,
  DatabaseWineStore,
  InMemoryWineStore,
  createWineStore,
  type WatchlistStore,
  DatabaseWatchlistStore,
  InMemoryWatchlistStore,
  createWatchlistStore,
  type EventStore,
  DatabaseEventStore,
  InMemoryEventStore,
  createEventStore,
  type LifestyleDatabaseAdapter,
} from './stores/index.js';

// Providers
export {
  BaseLifestyleProvider,
  LifestyleProviderRegistry,
  getLifestyleProviderRegistry,
  initLifestyleProviderRegistry,
  type LifestyleProviderType,
  type EntertainmentProvider,
  type WineProvider,
  type EventProvider,
  TMDBProvider,
  createTMDBProvider,
  VivinoProvider,
  createVivinoProvider,
  TicketmasterProvider,
  createTicketmasterProvider,
} from './providers/index.js';

// Services
export {
  WineCellarService,
  createWineCellarService,
  InventoryService,
  createInventoryService,
  PairingEngine,
  createPairingEngine,
} from './services/wine-cellar/index.js';

export {
  EntertainmentService,
  createEntertainmentService,
  WatchlistService,
  createWatchlistService,
  EpisodeTracker,
  createEpisodeTracker,
} from './services/entertainment/index.js';

export {
  EventDiscoveryService,
  createEventDiscoveryService,
  DiscoveryService,
  createDiscoveryService,
} from './services/events/index.js';

// Event constants
export const LIFESTYLE_EVENTS = {
  // Wine events
  WINE_ADDED: 'lifestyle.wine.added',
  WINE_CONSUMED: 'lifestyle.wine.consumed',
  WINE_DRINKING_WINDOW: 'lifestyle.wine.drinking-window',
  WINE_LOW_STOCK: 'lifestyle.wine.low-stock',
  WINE_EXPIRING: 'lifestyle.wine.expiring',
  // Watchlist events
  WATCHLIST_ADDED: 'lifestyle.watchlist.added',
  WATCHLIST_REMOVED: 'lifestyle.watchlist.removed',
  WATCHLIST_STATUS_CHANGED: 'lifestyle.watchlist.status-changed',
  // Episode events
  EPISODE_NEW: 'lifestyle.episode.new',
  EPISODE_REMINDER: 'lifestyle.episode.reminder',
  EPISODE_SEASON_PREMIERE: 'lifestyle.episode.season-premiere',
  EPISODE_SEASON_FINALE: 'lifestyle.episode.season-finale',
  // Event discovery events
  EVENT_DISCOVERED: 'lifestyle.event.discovered',
  EVENT_RECOMMENDATION: 'lifestyle.event.recommendation',
  EVENT_REMINDER: 'lifestyle.event.reminder',
  EVENT_SAVED: 'lifestyle.event.saved',
} as const;

import type { LifestyleConfig } from './config.js';
import type { LifestyleDatabaseAdapter } from './stores/index.js';
import { LifestyleConfigSchema } from './config.js';
import { createWineStore, type WineStore } from './stores/wine-store.js';
import { createWatchlistStore, type WatchlistStore } from './stores/watchlist-store.js';
import { createEventStore, type EventStore } from './stores/event-store.js';
import { initLifestyleProviderRegistry, type LifestyleProviderRegistry } from './providers/base.js';
import { createTMDBProvider } from './providers/entertainment/index.js';
import { createVivinoProvider } from './providers/wine/index.js';
import { createTicketmasterProvider } from './providers/events/index.js';
import { WineCellarService, createWineCellarService } from './services/wine-cellar/index.js';
import { EntertainmentService, createEntertainmentService } from './services/entertainment/index.js';
import { EventDiscoveryService, createEventDiscoveryService } from './services/events/index.js';

/**
 * Lifestyle Module Manager
 */
export class LifestyleManager {
  private initialized = false;
  private config: LifestyleConfig;

  // Stores
  private wineStore!: WineStore;
  private watchlistStore!: WatchlistStore;
  private eventStore!: EventStore;

  // Provider registry
  private providerRegistry!: LifestyleProviderRegistry;

  // Services
  private wineCellarService?: WineCellarService;
  private entertainmentService?: EntertainmentService;
  private eventDiscoveryService?: EventDiscoveryService;

  constructor(config?: Partial<LifestyleConfig>) {
    const result = LifestyleConfigSchema.safeParse(config ?? {});
    this.config = result.success ? result.data : LifestyleConfigSchema.parse({});
  }

  /**
   * Initialize the lifestyle manager
   */
  async initialize(dbAdapter?: LifestyleDatabaseAdapter): Promise<void> {
    if (this.initialized) {
      return;
    }

    const storeType = dbAdapter ? 'database' : 'memory';

    // Initialize stores
    this.wineStore = createWineStore(storeType as 'memory', dbAdapter as never);
    this.watchlistStore = createWatchlistStore(storeType as 'memory', dbAdapter as never);
    this.eventStore = createEventStore(storeType as 'memory', dbAdapter as never);

    await Promise.all([
      this.wineStore.initialize(),
      this.watchlistStore.initialize(),
      this.eventStore.initialize(),
    ]);

    // Initialize provider registry
    this.providerRegistry = initLifestyleProviderRegistry();
    await this.registerProviders();

    // Initialize services
    this.initializeServices();

    this.initialized = true;
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  private async registerProviders(): Promise<void> {
    // Register entertainment provider (TMDB)
    if (this.config.entertainment?.enabled !== false) {
      try {
        const tmdb = createTMDBProvider({
          apiKeyEnvVar: this.config.tmdbApiKeyEnvVar,
        });
        await tmdb.initialize();
        this.providerRegistry.register('entertainment', 'tmdb', tmdb, true);
      } catch {
        console.warn('TMDB provider initialization failed');
      }
    }

    // Register wine provider (Vivino)
    if (this.config.wineCellar?.enabled !== false && this.config.wineCellar?.enablePairingSearch) {
      try {
        const vivino = createVivinoProvider();
        await vivino.initialize();
        this.providerRegistry.register('wine', 'vivino', vivino, true);
      } catch {
        console.warn('Vivino provider initialization failed');
      }
    }

    // Register event provider (Ticketmaster)
    if (this.config.eventDiscovery?.enabled !== false) {
      try {
        const ticketmaster = createTicketmasterProvider({
          apiKeyEnvVar: this.config.ticketmasterApiKeyEnvVar,
        });
        await ticketmaster.initialize();
        this.providerRegistry.register('events', 'ticketmaster', ticketmaster, true);
      } catch {
        console.warn('Ticketmaster provider initialization failed');
      }
    }
  }

  private initializeServices(): void {
    // Wine cellar service
    if (this.config.wineCellar?.enabled !== false) {
      this.wineCellarService = createWineCellarService(
        {
          enabled: this.config.wineCellar?.enabled,
          lowStockThreshold: this.config.wineCellar?.lowStockThreshold,
          drinkingWindowAlertDays: this.config.wineCellar?.drinkingWindowAlertDays,
          enablePairingSearch: this.config.wineCellar?.enablePairingSearch,
        },
        {
          store: this.wineStore,
          getWineProvider: () => this.providerRegistry.get('wine', 'vivino') as never,
        }
      );
    }

    // Entertainment service
    if (this.config.entertainment?.enabled !== false) {
      this.entertainmentService = createEntertainmentService(
        {
          enabled: this.config.entertainment?.enabled,
          autoFetchDetails: true,
          episodeCheckIntervalHours: this.config.entertainment?.episodeCheckIntervalHours,
          releaseAlertDays: this.config.entertainment?.releaseAlertDays,
        },
        {
          store: this.watchlistStore,
          getProvider: () => this.providerRegistry.get('entertainment', 'tmdb') as never,
        }
      );
    }

    // Event discovery service
    if (this.config.eventDiscovery?.enabled !== false) {
      this.eventDiscoveryService = createEventDiscoveryService(
        {
          enabled: this.config.eventDiscovery?.enabled,
          checkIntervalHours: this.config.eventDiscovery?.checkIntervalHours,
          defaultRadiusKm: this.config.eventDiscovery?.defaultRadius,
        },
        {
          store: this.eventStore,
          getProvider: () => this.providerRegistry.get('events', 'ticketmaster') as never,
        }
      );
    }
  }

  /**
   * Start all services
   */
  start(): void {
    this.ensureInitialized();

    this.entertainmentService?.start();
    this.eventDiscoveryService?.start();
  }

  /**
   * Stop all services
   */
  stop(): void {
    this.entertainmentService?.stop();
    this.eventDiscoveryService?.stop();
  }

  /**
   * Shutdown the lifestyle manager
   */
  async shutdown(): Promise<void> {
    this.stop();
    await this.providerRegistry?.shutdownAll();
    this.initialized = false;
  }

  // Service getters
  getWineStore(): WineStore {
    this.ensureInitialized();
    return this.wineStore;
  }

  getWatchlistStore(): WatchlistStore {
    this.ensureInitialized();
    return this.watchlistStore;
  }

  getEventStore(): EventStore {
    this.ensureInitialized();
    return this.eventStore;
  }

  getWineCellarService(): WineCellarService {
    this.ensureInitialized();
    if (!this.wineCellarService) {
      throw new Error('Wine cellar service not enabled');
    }
    return this.wineCellarService;
  }

  getEntertainmentService(): EntertainmentService {
    this.ensureInitialized();
    if (!this.entertainmentService) {
      throw new Error('Entertainment service not enabled');
    }
    return this.entertainmentService;
  }

  getEventDiscoveryService(): EventDiscoveryService {
    this.ensureInitialized();
    if (!this.eventDiscoveryService) {
      throw new Error('Event discovery service not enabled');
    }
    return this.eventDiscoveryService;
  }

  getProviderRegistry(): LifestyleProviderRegistry {
    this.ensureInitialized();
    return this.providerRegistry;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('LifestyleManager not initialized. Call initialize() first.');
    }
  }
}

// Global singleton
let globalLifestyleManager: LifestyleManager | null = null;

/**
 * Initialize the lifestyle module
 */
export async function initLifestyle(
  config?: Partial<LifestyleConfig>,
  dbAdapter?: LifestyleDatabaseAdapter
): Promise<LifestyleManager> {
  globalLifestyleManager = new LifestyleManager(config);
  await globalLifestyleManager.initialize(dbAdapter);
  return globalLifestyleManager;
}

/**
 * Get the lifestyle manager
 */
export function getLifestyleManager(): LifestyleManager {
  if (!globalLifestyleManager) {
    throw new Error('LifestyleManager not initialized. Call initLifestyle() first.');
  }
  return globalLifestyleManager;
}

/**
 * Check if lifestyle module is initialized
 */
export function isLifestyleInitialized(): boolean {
  return globalLifestyleManager?.isInitialized() ?? false;
}
