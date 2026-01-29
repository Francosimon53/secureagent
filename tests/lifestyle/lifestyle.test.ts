/**
 * Lifestyle Module Tests
 *
 * Unit and integration tests for the lifestyle module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  // Manager
  LifestyleManager,
  initLifestyle,
  getLifestyleManager,
  isLifestyleInitialized,

  // Config
  LifestyleConfigSchema,
  validateLifestyleConfig,
  safeParseLifestyleConfig,
  getDefaultLifestyleConfig,

  // Stores
  createWineStore,
  createWatchlistStore,
  createEventStore,

  // Services
  createWineCellarService,
  createInventoryService,
  createPairingEngine,
  createWatchlistService,
  createEpisodeTracker,
  createDiscoveryService,

  // Providers
  initLifestyleProviderRegistry,
  createTMDBProvider,
  createVivinoProvider,

  // Types
  type WineStore,
  type WatchlistStore,
  type EventStore,
} from '../../src/lifestyle/index.js';

// =============================================================================
// Configuration Tests
// =============================================================================

describe('Lifestyle Configuration', () => {
  it('should parse valid configuration', () => {
    const config = validateLifestyleConfig({
      enabled: true,
      storeType: 'memory',
    });

    expect(config.enabled).toBe(true);
    expect(config.storeType).toBe('memory');
  });

  it('should apply default values', () => {
    const config = getDefaultLifestyleConfig();

    expect(config.enabled).toBe(true);
    expect(config.storeType).toBe('database');
    // Feature configs are optional by default
    expect(config.wineCellar).toBeUndefined();

    // When explicitly provided, they get defaults
    const configWithWine = validateLifestyleConfig({ wineCellar: {} });
    expect(configWithWine.wineCellar?.enabled).toBe(true);
    expect(configWithWine.wineCellar?.lowStockThreshold).toBe(2);
  });

  it('should validate with safeParse', () => {
    const result = safeParseLifestyleConfig({
      enabled: true,
      entertainment: {
        episodeCheckIntervalHours: 12,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entertainment?.episodeCheckIntervalHours).toBe(12);
    }
  });

  it('should reject invalid configuration', () => {
    const result = safeParseLifestyleConfig({
      enabled: 'invalid', // Should be boolean
    });

    expect(result.success).toBe(false);
  });

  it('should validate nested feature configs', () => {
    const result = LifestyleConfigSchema.safeParse({
      wineCellar: {
        lowStockThreshold: 3,
        drinkingWindowAlertDays: 60,
      },
      eventDiscovery: {
        checkIntervalHours: 24,
        defaultRadius: 100,
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.wineCellar?.lowStockThreshold).toBe(3);
    expect(result.data?.eventDiscovery?.checkIntervalHours).toBe(24);
  });
});

// =============================================================================
// Wine Store Tests
// =============================================================================

describe('WineStore', () => {
  let store: WineStore;

  beforeEach(async () => {
    store = createWineStore('memory');
    await store.initialize();
  });

  it('should create a wine entry', async () => {
    const wine = await store.createWine({
      userId: 'user-1',
      name: 'Chateau Margaux',
      producer: 'Chateau Margaux',
      vintage: 2015,
      type: 'red',
      region: 'Bordeaux',
      country: 'France',
    });

    expect(wine.id).toBeDefined();
    expect(wine.name).toBe('Chateau Margaux');
    expect(wine.vintage).toBe(2015);
    expect(wine.type).toBe('red');
  });

  it('should get a wine by ID', async () => {
    const created = await store.createWine({
      userId: 'user-1',
      name: 'Opus One',
      producer: 'Opus One',
      vintage: 2018,
      type: 'red',
      region: 'Napa Valley',
      country: 'USA',
    });

    const retrieved = await store.getWine(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(created.id);
    expect(retrieved?.name).toBe('Opus One');
  });

  it('should update a wine entry', async () => {
    const wine = await store.createWine({
      userId: 'user-1',
      name: 'Original Wine',
      producer: 'Producer',
      vintage: 2020,
      type: 'white',
      region: 'Burgundy',
      country: 'France',
    });

    const updated = await store.updateWine(wine.id, {
      name: 'Updated Wine',
      rating: 92,
    });

    expect(updated?.name).toBe('Updated Wine');
    expect(updated?.rating).toBe(92);
  });

  it('should list wines by user', async () => {
    await store.createWine({
      userId: 'user-1',
      name: 'Wine 1',
      producer: 'Producer 1',
      vintage: 2019,
      type: 'red',
      region: 'Region 1',
      country: 'France',
    });

    await store.createWine({
      userId: 'user-1',
      name: 'Wine 2',
      producer: 'Producer 2',
      vintage: 2020,
      type: 'white',
      region: 'Region 2',
      country: 'Italy',
    });

    await store.createWine({
      userId: 'user-2',
      name: 'Wine 3',
      producer: 'Producer 3',
      vintage: 2021,
      type: 'rose',
      region: 'Region 3',
      country: 'Spain',
    });

    const user1Wines = await store.listWines('user-1');
    expect(user1Wines).toHaveLength(2);

    const user2Wines = await store.listWines('user-2');
    expect(user2Wines).toHaveLength(1);
  });

  it('should filter wines by type', async () => {
    await store.createWine({
      userId: 'user-1',
      name: 'Red Wine',
      producer: 'Producer',
      vintage: 2019,
      type: 'red',
      region: 'Region',
      country: 'France',
    });

    await store.createWine({
      userId: 'user-1',
      name: 'White Wine',
      producer: 'Producer',
      vintage: 2020,
      type: 'white',
      region: 'Region',
      country: 'France',
    });

    const redWines = await store.listWines('user-1', { type: ['red'] });
    expect(redWines).toHaveLength(1);
    expect(redWines[0].type).toBe('red');
  });

  it('should add wine to inventory', async () => {
    const wine = await store.createWine({
      userId: 'user-1',
      name: 'Cellar Wine',
      producer: 'Producer',
      vintage: 2018,
      type: 'red',
      region: 'Region',
      country: 'France',
    });

    const inventory = await store.addToInventory({
      wineId: wine.id,
      userId: 'user-1',
      quantity: 6,
      location: 'Rack A',
      status: 'in_cellar',
    });

    expect(inventory.id).toBeDefined();
    expect(inventory.quantity).toBe(6);
    expect(inventory.location).toBe('Rack A');
  });

  it('should update inventory item', async () => {
    const wine = await store.createWine({
      userId: 'user-1',
      name: 'Inventory Wine',
      producer: 'Producer',
      vintage: 2019,
      type: 'red',
      region: 'Region',
      country: 'France',
    });

    const inventory = await store.addToInventory({
      wineId: wine.id,
      userId: 'user-1',
      quantity: 12,
      status: 'in_cellar',
    });

    const updated = await store.updateInventoryItem(inventory.id, { quantity: 10 });
    expect(updated?.quantity).toBe(10);
  });
});

// =============================================================================
// Watchlist Store Tests
// =============================================================================

describe('WatchlistStore', () => {
  let store: WatchlistStore;

  beforeEach(async () => {
    store = createWatchlistStore('memory');
    await store.initialize();
  });

  it('should add item to watchlist', async () => {
    const item = await store.addItem({
      userId: 'user-1',
      mediaType: 'movie',
      externalId: 'tmdb-12345',
      title: 'Inception',
      status: 'want_to_watch',
      addedAt: Date.now(),
    });

    expect(item.id).toBeDefined();
    expect(item.title).toBe('Inception');
    expect(item.mediaType).toBe('movie');
    expect(item.status).toBe('want_to_watch');
  });

  it('should get watchlist item by ID', async () => {
    const created = await store.addItem({
      userId: 'user-1',
      mediaType: 'tv_show',
      externalId: 'tmdb-67890',
      title: 'Breaking Bad',
      status: 'watching',
      addedAt: Date.now(),
    });

    const retrieved = await store.getItem(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe('Breaking Bad');
  });

  it('should update watchlist item status', async () => {
    const item = await store.addItem({
      userId: 'user-1',
      mediaType: 'movie',
      externalId: 'tmdb-11111',
      title: 'The Matrix',
      status: 'want_to_watch',
      addedAt: Date.now(),
    });

    const updated = await store.updateItem(item.id, { status: 'watched' });
    expect(updated?.status).toBe('watched');
  });

  it('should get user watchlist', async () => {
    await store.addItem({
      userId: 'user-1',
      mediaType: 'movie',
      externalId: 'tmdb-1',
      title: 'Movie 1',
      status: 'want_to_watch',
      addedAt: Date.now(),
    });

    await store.addItem({
      userId: 'user-1',
      mediaType: 'tv_show',
      externalId: 'tmdb-2',
      title: 'Show 1',
      status: 'watching',
      addedAt: Date.now(),
    });

    await store.addItem({
      userId: 'user-2',
      mediaType: 'movie',
      externalId: 'tmdb-3',
      title: 'Movie 2',
      status: 'watched',
      addedAt: Date.now(),
    });

    const user1Items = await store.getUserWatchlist('user-1');
    expect(user1Items).toHaveLength(2);

    const user2Items = await store.getUserWatchlist('user-2');
    expect(user2Items).toHaveLength(1);
  });

  it('should filter by media type', async () => {
    await store.addItem({
      userId: 'user-1',
      mediaType: 'movie',
      externalId: 'tmdb-1',
      title: 'Movie',
      status: 'want_to_watch',
      addedAt: Date.now(),
    });

    await store.addItem({
      userId: 'user-1',
      mediaType: 'tv_show',
      externalId: 'tmdb-2',
      title: 'TV Show',
      status: 'watching',
      addedAt: Date.now(),
    });

    const movies = await store.getUserWatchlist('user-1', { mediaType: 'movie' });
    expect(movies).toHaveLength(1);
    expect(movies[0].mediaType).toBe('movie');
  });

  it('should filter by status', async () => {
    await store.addItem({
      userId: 'user-1',
      mediaType: 'movie',
      externalId: 'tmdb-1',
      title: 'Want to Watch',
      status: 'want_to_watch',
      addedAt: Date.now(),
    });

    await store.addItem({
      userId: 'user-1',
      mediaType: 'movie',
      externalId: 'tmdb-2',
      title: 'Watching',
      status: 'watching',
      addedAt: Date.now(),
    });

    const watching = await store.getUserWatchlist('user-1', { status: 'watching' });
    expect(watching).toHaveLength(1);
    expect(watching[0].title).toBe('Watching');
  });

  it('should track TV show progress', async () => {
    const item = await store.addItem({
      userId: 'user-1',
      mediaType: 'tv_show',
      externalId: 'tmdb-12345',
      title: 'Test Show',
      status: 'watching',
      addedAt: Date.now(),
    });

    const progress = await store.updateProgress(item.id, 2, 5);

    expect(progress).toBeDefined();
    expect(progress.lastWatchedSeason).toBe(2);
    expect(progress.lastWatchedEpisode).toBe(5);
  });
});

// =============================================================================
// Event Store Tests
// =============================================================================

describe('EventStore', () => {
  let store: EventStore;

  beforeEach(async () => {
    store = createEventStore('memory');
    await store.initialize();
  });

  it('should save discovered event', async () => {
    const event = await store.saveDiscoveredEvent({
      externalId: 'tm-123456',
      provider: 'ticketmaster',
      name: 'Rock Concert',
      category: 'concert',
      venue: {
        name: 'Madison Square Garden',
        address: '4 Pennsylvania Plaza',
        city: 'New York',
        country: 'USA',
        location: { lat: 40.7505, lng: -73.9934 },
      },
      startTime: Date.now() + 86400000 * 30,
      isSoldOut: false,
      isOnSale: true,
      fetchedAt: Date.now(),
    });

    expect(event.id).toBeDefined();
    expect(event.name).toBe('Rock Concert');
    expect(event.category).toBe('concert');
  });

  it('should get event by ID', async () => {
    const created = await store.saveDiscoveredEvent({
      externalId: 'tm-789',
      provider: 'ticketmaster',
      name: 'Sports Game',
      category: 'sports',
      venue: {
        name: 'Stadium',
        address: '123 Main St',
        city: 'Los Angeles',
        country: 'USA',
        location: { lat: 34.0522, lng: -118.2437 },
      },
      startTime: Date.now() + 86400000,
      isSoldOut: false,
      isOnSale: true,
      fetchedAt: Date.now(),
    });

    const retrieved = await store.getDiscoveredEvent(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('Sports Game');
  });

  it('should create user event preference', async () => {
    const preference = await store.savePreference({
      userId: 'user-1',
      categories: ['concert', 'theater'],
      location: { lat: 40.7128, lng: -74.006, radius: 50 },
      maxPrice: 200,
      notifyOnMatch: true,
      isActive: true,
    });

    expect(preference.id).toBeDefined();
    expect(preference.categories).toContain('concert');
    expect(preference.notifyOnMatch).toBe(true);
  });

  it('should save event for user', async () => {
    const event = await store.saveDiscoveredEvent({
      externalId: 'tm-111',
      provider: 'ticketmaster',
      name: 'Comedy Show',
      category: 'comedy',
      venue: {
        name: 'Comedy Club',
        address: '456 Laugh St',
        city: 'Chicago',
        country: 'USA',
        location: { lat: 41.8781, lng: -87.6298 },
      },
      startTime: Date.now() + 86400000 * 7,
      isSoldOut: false,
      isOnSale: true,
      fetchedAt: Date.now(),
    });

    const saved = await store.saveEventForUser('user-1', event.id, 'Looking forward to this!');

    expect(saved.id).toBeDefined();
    expect(saved.userId).toBe('user-1');
    expect(saved.eventId).toBe(event.id);
  });

  it('should get user saved events', async () => {
    const event1 = await store.saveDiscoveredEvent({
      externalId: 'tm-1',
      provider: 'ticketmaster',
      name: 'Event 1',
      category: 'concert',
      venue: {
        name: 'Venue 1',
        address: 'Address 1',
        city: 'City 1',
        country: 'USA',
        location: { lat: 40.0, lng: -74.0 },
      },
      startTime: Date.now() + 86400000,
      isSoldOut: false,
      isOnSale: true,
      fetchedAt: Date.now(),
    });

    const event2 = await store.saveDiscoveredEvent({
      externalId: 'tm-2',
      provider: 'ticketmaster',
      name: 'Event 2',
      category: 'sports',
      venue: {
        name: 'Venue 2',
        address: 'Address 2',
        city: 'City 2',
        country: 'USA',
        location: { lat: 41.0, lng: -75.0 },
      },
      startTime: Date.now() + 86400000 * 2,
      isSoldOut: false,
      isOnSale: true,
      fetchedAt: Date.now(),
    });

    await store.saveEventForUser('user-1', event1.id);
    await store.saveEventForUser('user-1', event2.id);

    const savedEvents = await store.getUserSavedEvents('user-1');
    expect(savedEvents).toHaveLength(2);
  });
});

// =============================================================================
// Inventory Service Tests
// =============================================================================

describe('InventoryService', () => {
  let wineStore: WineStore;

  beforeEach(async () => {
    wineStore = createWineStore('memory');
    await wineStore.initialize();
  });

  it('should create inventory service', () => {
    const service = createInventoryService(
      { lowStockThreshold: 3 },
      { store: wineStore }
    );

    expect(service).toBeDefined();
  });

  it('should get inventory stats', async () => {
    const service = createInventoryService(
      { lowStockThreshold: 2 },
      { store: wineStore }
    );

    // Create wine and inventory
    const wine = await wineStore.createWine({
      userId: 'user-1',
      name: 'Test Wine',
      producer: 'Producer',
      vintage: 2020,
      type: 'red',
      region: 'Region',
      country: 'France',
    });

    await wineStore.addToInventory({
      wineId: wine.id,
      userId: 'user-1',
      quantity: 6,
      status: 'in_cellar',
    });

    const stats = await service.getStats('user-1');
    expect(stats.totalBottles).toBe(6);
    expect(stats.byType.red).toBe(6);
  });
});

// =============================================================================
// Pairing Engine Tests
// =============================================================================

describe('PairingEngine', () => {
  let wineStore: WineStore;

  beforeEach(async () => {
    wineStore = createWineStore('memory');
    await wineStore.initialize();
  });

  it('should create pairing engine', () => {
    const engine = createPairingEngine(
      { enableExternalSearch: false, minConfidence: 0.5 },
      { store: wineStore }
    );

    expect(engine).toBeDefined();
  });

  it('should suggest wines for food', async () => {
    const engine = createPairingEngine(
      { enableExternalSearch: false, minConfidence: 0.5 },
      { store: wineStore }
    );

    const result = await engine.suggestWinesForFood('user-1', 'steak');
    expect(result).toBeDefined();
    expect(result.suggestions.length).toBeGreaterThan(0);
    // Steak typically pairs with red wine
    expect(result.suggestions.some(s => s.wineType === 'red')).toBe(true);
  });
});

// =============================================================================
// Watchlist Service Tests
// =============================================================================

describe('WatchlistService', () => {
  let watchlistStore: WatchlistStore;

  beforeEach(async () => {
    watchlistStore = createWatchlistStore('memory');
    await watchlistStore.initialize();
  });

  it('should create watchlist service', () => {
    const service = createWatchlistService(
      { autoFetchDetails: false },
      { store: watchlistStore, getProvider: () => undefined }
    );

    expect(service).toBeDefined();
  });

  it('should add to watchlist', async () => {
    const service = createWatchlistService(
      { autoFetchDetails: false },
      { store: watchlistStore, getProvider: () => undefined }
    );

    const result = await service.addToWatchlist('user-1', 'tmdb-555', 'movie', 'Test Movie');

    expect(result).toBeDefined();
    expect(result?.item.title).toBe('Test Movie');
  });

  it('should update watch status', async () => {
    const service = createWatchlistService(
      { autoFetchDetails: false },
      { store: watchlistStore, getProvider: () => undefined }
    );

    const result = await service.addToWatchlist('user-1', 'tmdb-666', 'movie', 'Status Test');

    const updated = await service.updateStatus(result!.item.id, 'watched');
    expect(updated?.status).toBe('watched');
  });
});

// =============================================================================
// Episode Tracker Tests
// =============================================================================

describe('EpisodeTracker', () => {
  let watchlistStore: WatchlistStore;

  beforeEach(async () => {
    watchlistStore = createWatchlistStore('memory');
    await watchlistStore.initialize();
  });

  it('should create episode tracker', () => {
    const tracker = createEpisodeTracker(
      { checkIntervalHours: 6, releaseAlertDays: 7 },
      { store: watchlistStore, getProvider: () => undefined }
    );

    expect(tracker).toBeDefined();
  });
});

// =============================================================================
// Discovery Service Tests
// =============================================================================

describe('DiscoveryService', () => {
  let eventStore: EventStore;

  beforeEach(async () => {
    eventStore = createEventStore('memory');
    await eventStore.initialize();
  });

  it('should create discovery service', () => {
    const service = createDiscoveryService(
      { checkIntervalHours: 12, defaultRadiusKm: 50 },
      { store: eventStore, getProvider: () => undefined }
    );

    expect(service).toBeDefined();
  });

  it('should get user preferences', async () => {
    const service = createDiscoveryService(
      { checkIntervalHours: 12, defaultRadiusKm: 50 },
      { store: eventStore, getProvider: () => undefined }
    );

    await eventStore.savePreference({
      userId: 'user-1',
      categories: ['concert'],
      location: { lat: 40.0, lng: -74.0, radius: 50 },
      notifyOnMatch: true,
      isActive: true,
    });

    const prefs = await service.getUserPreferences('user-1');
    expect(prefs).toBeDefined();
    expect(prefs.length).toBe(1);
    expect(prefs[0].categories).toContain('concert');
  });
});

// =============================================================================
// Provider Registry Tests
// =============================================================================

describe('LifestyleProviderRegistry', () => {
  it('should register and retrieve providers', async () => {
    const registry = initLifestyleProviderRegistry();

    const tmdbProvider = createTMDBProvider();
    await tmdbProvider.initialize();

    registry.register('entertainment', 'tmdb', tmdbProvider, true);

    const retrieved = registry.get('entertainment', 'tmdb');
    expect(retrieved).toBe(tmdbProvider);

    const defaultProvider = registry.get('entertainment');
    expect(defaultProvider).toBe(tmdbProvider);
  });

  it('should list providers by type', async () => {
    const registry = initLifestyleProviderRegistry();

    const tmdbProvider = createTMDBProvider();
    await tmdbProvider.initialize();

    registry.register('entertainment', 'tmdb', tmdbProvider);

    const entertainmentProviders = registry.list('entertainment');
    expect(entertainmentProviders).toContain('tmdb');
  });

  it('should unregister providers', async () => {
    const registry = initLifestyleProviderRegistry();

    const vivinoProvider = createVivinoProvider();
    await vivinoProvider.initialize();

    registry.register('wine', 'vivino', vivinoProvider);
    expect(registry.has('wine', 'vivino')).toBe(true);

    registry.unregister('wine', 'vivino');
    expect(registry.has('wine', 'vivino')).toBe(false);
  });
});

// =============================================================================
// Lifestyle Manager Tests
// =============================================================================

describe('LifestyleManager', () => {
  let manager: LifestyleManager;

  beforeEach(async () => {
    manager = new LifestyleManager({
      enabled: true,
      storeType: 'memory',
    });
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  it('should initialize correctly', () => {
    expect(manager.isInitialized()).toBe(true);
  });

  it('should provide access to stores', () => {
    expect(manager.getWineStore()).toBeDefined();
    expect(manager.getWatchlistStore()).toBeDefined();
    expect(manager.getEventStore()).toBeDefined();
  });

  it('should provide access to services when enabled', () => {
    expect(manager.getWineCellarService()).toBeDefined();
    expect(manager.getEntertainmentService()).toBeDefined();
    expect(manager.getEventDiscoveryService()).toBeDefined();
  });

  it('should provide access to provider registry', () => {
    expect(manager.getProviderRegistry()).toBeDefined();
  });

  it('should start and stop services', () => {
    manager.start();
    // Services should be running
    manager.stop();
    // Services should be stopped
    expect(manager.isInitialized()).toBe(true);
  });
});

// =============================================================================
// Global Singleton Tests
// =============================================================================

describe('Lifestyle Global Singleton', () => {
  afterEach(async () => {
    if (isLifestyleInitialized()) {
      const manager = getLifestyleManager();
      await manager.shutdown();
    }
  });

  it('should initialize global singleton', async () => {
    const manager = await initLifestyle({
      enabled: true,
      storeType: 'memory',
    });

    expect(manager).toBeDefined();
    expect(isLifestyleInitialized()).toBe(true);

    const retrieved = getLifestyleManager();
    expect(retrieved).toBe(manager);
  });

  it('should report initialization status correctly', async () => {
    const wasInitialized = isLifestyleInitialized();

    if (!wasInitialized) {
      // If not initialized, test the flow
      const manager = new LifestyleManager({ enabled: true, storeType: 'memory' });
      expect(manager.isInitialized()).toBe(false);

      await manager.initialize();
      expect(manager.isInitialized()).toBe(true);

      await manager.shutdown();
      expect(manager.isInitialized()).toBe(false);
    } else {
      // Already initialized from previous test
      expect(isLifestyleInitialized()).toBe(true);
    }
  });
});
