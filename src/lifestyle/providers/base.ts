/**
 * Base Lifestyle Provider
 *
 * Abstract base class and registry for lifestyle providers.
 */

export type LifestyleProviderType = 'entertainment' | 'wine' | 'events';

/**
 * Base provider interface
 */
export abstract class BaseLifestyleProvider {
  abstract readonly name: string;
  abstract readonly type: LifestyleProviderType;

  protected initialized = false;

  abstract initialize(): Promise<void>;

  isInitialized(): boolean {
    return this.initialized;
  }

  abstract shutdown(): Promise<void>;
}

/**
 * Entertainment provider interface (TMDB, TVMaze, etc.)
 */
export interface EntertainmentProvider {
  readonly name: string;
  readonly type: 'entertainment';

  // Movie operations
  searchMovies(query: string): Promise<MovieSearchResult[]>;
  getMovieDetails(externalId: string): Promise<MovieDetails | null>;

  // TV show operations
  searchTVShows(query: string): Promise<TVShowSearchResult[]>;
  getTVShowDetails(externalId: string): Promise<TVShowDetails | null>;
  getSeasonDetails(showId: string, seasonNumber: number): Promise<SeasonDetails | null>;
  getNextEpisode(showId: string, afterSeason: number, afterEpisode: number): Promise<EpisodeDetails | null>;

  // Trending/popular
  getTrendingMovies(): Promise<MovieSearchResult[]>;
  getTrendingTVShows(): Promise<TVShowSearchResult[]>;
}

export interface MovieSearchResult {
  externalId: string;
  title: string;
  releaseDate?: number;
  posterUrl?: string;
  overview?: string;
  rating?: number;
}

export interface MovieDetails extends MovieSearchResult {
  runtime?: number;
  genres?: string[];
  backdropUrl?: string;
  cast?: CastMember[];
  director?: string;
}

export interface TVShowSearchResult {
  externalId: string;
  title: string;
  firstAirDate?: number;
  posterUrl?: string;
  overview?: string;
  rating?: number;
}

export interface TVShowDetails extends TVShowSearchResult {
  totalSeasons?: number;
  totalEpisodes?: number;
  status?: 'returning' | 'ended' | 'canceled' | 'in_production';
  genres?: string[];
  backdropUrl?: string;
  cast?: CastMember[];
  nextEpisodeAirDate?: number;
}

export interface SeasonDetails {
  seasonNumber: number;
  episodeCount: number;
  airDate?: number;
  overview?: string;
  posterUrl?: string;
  episodes: EpisodeDetails[];
}

export interface EpisodeDetails {
  seasonNumber: number;
  episodeNumber: number;
  title?: string;
  airDate?: number;
  overview?: string;
  runtime?: number;
  stillUrl?: string;
}

export interface CastMember {
  name: string;
  character?: string;
  profileUrl?: string;
}

/**
 * Wine provider interface (Vivino, Wine.com, etc.)
 */
export interface WineProvider {
  readonly name: string;
  readonly type: 'wine';

  // Wine search and lookup
  searchWines(query: string): Promise<WineSearchResult[]>;
  getWineDetails(externalId: string): Promise<WineDetails | null>;
  searchByBarcode(barcode: string): Promise<WineSearchResult | null>;

  // Food pairing
  getPairingsForFood(food: string): Promise<WinePairingResult>;
  getPairingsForWine(wineId: string): Promise<FoodPairingResult>;
}

export interface WineSearchResult {
  externalId: string;
  name: string;
  producer: string;
  vintage?: number;
  wineType: 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified';
  region?: string;
  country?: string;
  grapes?: string[];
  rating?: number;
  ratingCount?: number;
  price?: number;
  currency?: string;
  imageUrl?: string;
}

export interface WineDetails extends WineSearchResult {
  description?: string;
  alcoholContent?: number;
  servingTemp?: { min: number; max: number };
  decantTime?: number;
  drinkingWindow?: { start: number; end: number };
  foodPairings?: string[];
  flavorProfile?: {
    body?: 'light' | 'medium' | 'full';
    tannins?: 'low' | 'medium' | 'high';
    acidity?: 'low' | 'medium' | 'high';
    sweetness?: 'dry' | 'off-dry' | 'sweet';
  };
}

export interface WinePairingResult {
  food: string;
  recommendedWineTypes: Array<{
    type: string;
    confidence: number;
    description: string;
  }>;
  specificWines?: WineSearchResult[];
}

export interface FoodPairingResult {
  wine: string;
  recommendedFoods: Array<{
    food: string;
    category: string;
    confidence: number;
  }>;
}

/**
 * Event provider interface (Ticketmaster, Eventbrite, etc.)
 */
export interface EventProvider {
  readonly name: string;
  readonly type: 'events';

  // Event search
  searchEvents(params: EventSearchParams): Promise<EventSearchResult[]>;
  getEventDetails(externalId: string): Promise<EventDetails | null>;

  // Artist/venue search
  searchArtists?(query: string): Promise<ArtistResult[]>;
  searchVenues?(query: string, location?: { lat: number; lng: number }): Promise<VenueResult[]>;
  getArtistEvents?(artistId: string): Promise<EventSearchResult[]>;
}

export interface EventSearchParams {
  query?: string;
  categories?: string[];
  location?: { lat: number; lng: number; radiusKm: number };
  startDate?: number;
  endDate?: number;
  maxPrice?: number;
  artistId?: string;
  venueId?: string;
  limit?: number;
}

export interface EventSearchResult {
  externalId: string;
  name: string;
  category: string;
  venue: {
    name: string;
    address?: string;
    city?: string;
    location?: { lat: number; lng: number };
  };
  startTime: number;
  endTime?: number;
  priceRange?: { min: number; max: number; currency: string };
  artists?: string[];
  imageUrl?: string;
  ticketUrl?: string;
  isSoldOut: boolean;
}

export interface EventDetails extends EventSearchResult {
  description?: string;
  ageRestriction?: string;
  ticketTypes?: Array<{
    name: string;
    price: number;
    currency: string;
    available: boolean;
  }>;
  seatMap?: string;
  lineup?: Array<{
    name: string;
    headliner: boolean;
    setTime?: number;
  }>;
}

export interface ArtistResult {
  externalId: string;
  name: string;
  genres?: string[];
  imageUrl?: string;
  upcomingEventCount?: number;
}

export interface VenueResult {
  externalId: string;
  name: string;
  address?: string;
  city?: string;
  location?: { lat: number; lng: number };
  capacity?: number;
  imageUrl?: string;
}

/**
 * Provider registry for managing lifestyle providers
 */
export class LifestyleProviderRegistry {
  private providers = new Map<string, Map<string, BaseLifestyleProvider>>();

  constructor() {
    // Initialize maps for each provider type
    this.providers.set('entertainment', new Map());
    this.providers.set('wine', new Map());
    this.providers.set('events', new Map());
  }

  /**
   * Register a provider
   */
  register<T extends BaseLifestyleProvider>(
    type: LifestyleProviderType,
    name: string,
    provider: T,
    setAsDefault = false
  ): void {
    const typeMap = this.providers.get(type);
    if (!typeMap) {
      throw new Error(`Unknown provider type: ${type}`);
    }

    typeMap.set(name, provider);

    if (setAsDefault || typeMap.size === 1) {
      typeMap.set('default', provider);
    }
  }

  /**
   * Get a provider by type and name
   */
  get<T extends BaseLifestyleProvider>(
    type: LifestyleProviderType,
    name: string = 'default'
  ): T | undefined {
    return this.providers.get(type)?.get(name) as T | undefined;
  }

  /**
   * Get the default provider for a type
   */
  getDefault<T extends BaseLifestyleProvider>(type: LifestyleProviderType): T | undefined {
    return this.get<T>(type, 'default');
  }

  /**
   * List all providers of a type
   */
  list(type: LifestyleProviderType): string[] {
    const typeMap = this.providers.get(type);
    if (!typeMap) return [];

    return Array.from(typeMap.keys()).filter(k => k !== 'default');
  }

  /**
   * Check if a provider exists
   */
  has(type: LifestyleProviderType, name: string): boolean {
    return this.providers.get(type)?.has(name) ?? false;
  }

  /**
   * Unregister a provider
   */
  unregister(type: LifestyleProviderType, name: string): boolean {
    const typeMap = this.providers.get(type);
    if (!typeMap) return false;

    const provider = typeMap.get(name);
    const deleted = typeMap.delete(name);

    // If this was the default, set a new default
    if (deleted && typeMap.get('default') === provider) {
      typeMap.delete('default');
      const remaining = Array.from(typeMap.keys()).filter(k => k !== 'default');
      if (remaining.length > 0) {
        typeMap.set('default', typeMap.get(remaining[0])!);
      }
    }

    return deleted;
  }

  /**
   * Shutdown all providers
   */
  async shutdownAll(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];

    for (const typeMap of this.providers.values()) {
      const seen = new Set<BaseLifestyleProvider>();
      for (const [name, provider] of typeMap) {
        if (name !== 'default' && !seen.has(provider)) {
          seen.add(provider);
          shutdownPromises.push(provider.shutdown());
        }
      }
    }

    await Promise.all(shutdownPromises);
  }
}

// Global registry instance
let globalRegistry: LifestyleProviderRegistry | null = null;

/**
 * Initialize the global lifestyle provider registry
 */
export function initLifestyleProviderRegistry(): LifestyleProviderRegistry {
  globalRegistry = new LifestyleProviderRegistry();
  return globalRegistry;
}

/**
 * Get the global lifestyle provider registry
 */
export function getLifestyleProviderRegistry(): LifestyleProviderRegistry {
  if (!globalRegistry) {
    throw new Error('Lifestyle provider registry not initialized');
  }
  return globalRegistry;
}
