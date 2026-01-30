/**
 * Lifestyle Module Types
 *
 * Core type definitions for the lifestyle module including
 * wine cellar management, entertainment tracking, and event discovery.
 */

// =============================================================================
// Common Types
// =============================================================================

export interface LifestyleProviderConfig {
  name: string;
  apiKeyEnvVar?: string;
  baseUrl?: string;
  timeout?: number;
  retryCount?: number;
}

export interface LifestyleProviderResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  cached: boolean;
  fetchedAt: number;
}

// =============================================================================
// Wine Types
// =============================================================================

export type WineType = 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified';
export type WineStyle = 'light' | 'medium' | 'full' | 'sweet' | 'dry' | 'off_dry';

export interface Wine {
  id: string;
  userId: string;
  name: string;
  producer: string;
  vintage: number;
  type: WineType;
  style?: WineStyle;
  region: string;
  country: string;
  appellation?: string;
  grape?: string[];
  rating?: number;
  communityRating?: number;
  price?: number;
  currency?: string;
  barcode?: string;
  externalId?: string;
  imageUrl?: string;
  description?: string;
  tastingNotes?: WineTastingNotes;
  createdAt: number;
  updatedAt: number;
}

export interface WineTastingNotes {
  nose?: string[];
  palate?: string[];
  finish?: string;
  pairings?: string[];
  personalNotes?: string;
}

export interface WineInventory {
  id: string;
  wineId: string;
  userId: string;
  quantity: number;
  location?: string;
  bin?: string;
  purchaseDate?: number;
  purchasePrice?: number;
  drinkingWindowStart?: number;
  drinkingWindowEnd?: number;
  peakYear?: number;
  status?: WineInventoryStatus;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type WineInventoryStatus = 'in_cellar' | 'consumed' | 'gifted' | 'sold' | 'lost';

export interface WineConsumption {
  id: string;
  inventoryId: string;
  wineId: string;
  userId: string;
  quantity: number;
  consumedAt: number;
  occasion?: string;
  rating?: number;
  notes?: string;
  pairedWith?: string[];
}

export interface FoodPairing {
  food: string;
  category: FoodCategory;
  confidence: number;
  wineTypes: WineType[];
  wineStyles?: WineStyle[];
  specificWines?: string[];
  notes?: string;
}

export type FoodCategory =
  | 'meat'
  | 'poultry'
  | 'seafood'
  | 'vegetarian'
  | 'vegan'
  | 'cheese'
  | 'dessert'
  | 'appetizer'
  | 'pasta'
  | 'asian'
  | 'mexican'
  | 'mediterranean';

export interface PairingSearchResult {
  query: string;
  food: string;
  category: FoodCategory;
  recommendedWineTypes: WineType[];
  recommendedStyles?: WineStyle[];
  fromInventory: Wine[];
  suggestions: WinePairingSuggestion[];
  searchedAt: number;
}

export interface WinePairingSuggestion {
  wineType: WineType;
  style?: WineStyle;
  regions?: string[];
  grapes?: string[];
  examples?: string[];
  explanation: string;
  confidence: number;
}

export interface WineAlert {
  id: string;
  userId: string;
  type: WineAlertType;
  wineId?: string;
  inventoryId?: string;
  message: string;
  scheduledFor: number;
  sent: boolean;
  sentAt?: number;
  channels: string[];
}

export type WineAlertType = 'drinking_window' | 'low_stock' | 'peak_year' | 'expiring';

// =============================================================================
// Entertainment Types
// =============================================================================

export type MediaType = 'movie' | 'tv_show' | 'documentary';
export type WatchStatus = 'want_to_watch' | 'watching' | 'watched' | 'dropped' | 'on_hold';

export interface WatchlistItem {
  id: string;
  userId: string;
  mediaType: MediaType;
  externalId: string;
  title: string;
  originalTitle?: string;
  posterUrl?: string;
  backdropUrl?: string;
  releaseDate?: number;
  status: WatchStatus;
  rating?: number;
  userRating?: number;
  overview?: string;
  genres?: string[];
  runtime?: number;
  totalSeasons?: number;
  totalEpisodes?: number;
  network?: string;
  streamingPlatforms?: string[];
  addedAt?: number;
  watchedAt?: number;
  notes?: string;
  priority?: number;
  tags?: string[];
  lastEpisodeCheck?: number;
  createdAt: number;
  updatedAt: number;
}

export interface TVShowProgress {
  id: string;
  watchlistItemId: string;
  userId: string;
  showTitle?: string;
  currentSeason?: number;
  currentEpisode?: number;
  lastWatchedSeason: number;
  lastWatchedEpisode: number;
  lastWatchedAt?: number;
  nextEpisode?: EpisodeInfo;
  isUpToDate: boolean;
  totalWatchedEpisodes?: number;
  percentComplete?: number;
  createdAt?: number;
  updatedAt: number;
}

export interface EpisodeInfo {
  seasonNumber: number;
  episodeNumber: number;
  title?: string;
  overview?: string;
  runtime?: number;
  airDate?: number;
  stillUrl?: string;
  rating?: number;
}

export interface SeasonInfo {
  seasonNumber: number;
  name: string;
  overview?: string;
  episodeCount: number;
  airDate?: number;
  posterUrl?: string;
  episodes?: EpisodeInfo[];
}

export interface NewEpisodeAlert {
  id: string;
  userId: string;
  watchlistItemId: string;
  showTitle: string;
  episode: EpisodeInfo;
  alertType: EpisodeAlertType;
  scheduledFor: number;
  sent?: boolean;
  sentAt?: number;
  channels?: string[];
  createdAt?: number;
}

export type EpisodeAlertType = 'new_episode' | 'season_premiere' | 'season_finale' | 'series_finale';

export interface MediaSearchResult {
  externalId: string;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  posterUrl?: string;
  releaseDate?: number;
  rating?: number;
  overview?: string;
  genres?: string[];
  popularity?: number;
}

// =============================================================================
// Event Discovery Types
// =============================================================================

export type EventCategory =
  | 'concert'
  | 'sports'
  | 'theater'
  | 'comedy'
  | 'festival'
  | 'exhibition'
  | 'conference'
  | 'workshop'
  | 'food_drink'
  | 'other';

export interface DiscoveredEvent {
  id: string;
  externalId: string;
  provider: string;
  name: string;
  description?: string;
  category: EventCategory;
  subcategory?: string;
  venue: Venue;
  startTime: number;
  endTime?: number;
  timezone?: string;
  priceRange?: PriceRange;
  ticketUrl?: string;
  imageUrl?: string;
  artists?: string[];
  performers?: Performer[];
  ageRestriction?: string;
  isSoldOut: boolean;
  isOnSale?: boolean;
  onSaleDate?: number;
  tags?: string[];
  fetchedAt?: number;
  discoveredAt?: number;
}

export interface Venue {
  id?: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  location?: {
    lat: number;
    lng: number;
  };
  capacity?: number;
  venueUrl?: string;
}

export interface Performer {
  id?: string;
  name: string;
  type: 'artist' | 'team' | 'band' | 'speaker' | 'comedian' | 'other';
  imageUrl?: string;
  genres?: string[];
}

export interface PriceRange {
  min: number;
  max: number;
  currency: string;
}

export interface UserEventPreference {
  id: string;
  userId: string;
  name?: string;
  categories?: EventCategory[];
  genres?: string[];
  artists?: string[];
  performers?: string[];
  venues?: string[];
  location: {
    lat: number;
    lng: number;
    radiusKm: number;
  };
  maxPrice?: number;
  currency?: string;
  preferredDays?: number[];
  preferredTimes?: {
    start: string;
    end: string;
  };
  excludeCategories?: EventCategory[];
  notifyOnMatch: boolean;
  notificationChannels?: string[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface EventRecommendation {
  id: string;
  userId: string;
  event: DiscoveredEvent;
  matchScore: number;
  matchReasons: string[];
  preferencesMatched: string[];
  recommendedAt: number;
  userAction?: 'saved' | 'dismissed' | 'purchased' | 'interested';
  actionAt?: number;
}

export interface SavedEvent {
  id: string;
  userId: string;
  eventId: string;
  event?: DiscoveredEvent;
  status?: SavedEventStatus;
  notes?: string;
  reminderSet?: boolean;
  reminderTime?: number;
  savedAt: number;
  updatedAt?: number;
}

export type SavedEventStatus = 'interested' | 'going' | 'maybe' | 'not_going' | 'attended';

export interface EventAlert {
  id: string;
  userId: string;
  eventId: string;
  type: EventAlertType;
  message: string;
  scheduledFor: number;
  sent: boolean;
  sentAt?: number;
  channels: string[];
}

export type EventAlertType = 'new_match' | 'reminder' | 'price_drop' | 'almost_sold_out' | 'on_sale';

// =============================================================================
// Event Types (Module Events)
// =============================================================================

export interface LifestyleEvent {
  type: LifestyleEventType;
  userId: string;
  timestamp: number;
  data: unknown;
}

export type LifestyleEventType =
  // Wine events
  | 'lifestyle.wine.added'
  | 'lifestyle.wine.consumed'
  | 'lifestyle.wine.drinking-window'
  | 'lifestyle.wine.low-stock'
  | 'lifestyle.wine.peak-year'
  // Watchlist events
  | 'lifestyle.watchlist.added'
  | 'lifestyle.watchlist.removed'
  | 'lifestyle.watchlist.status-changed'
  // Episode events
  | 'lifestyle.episode.new'
  | 'lifestyle.episode.reminder'
  | 'lifestyle.episode.season-premiere'
  | 'lifestyle.episode.season-finale'
  // Event discovery events
  | 'lifestyle.event.discovered'
  | 'lifestyle.event.recommendation'
  | 'lifestyle.event.reminder'
  | 'lifestyle.event.on-sale';

// =============================================================================
// Query Options Types
// =============================================================================

export interface WineQueryOptions {
  type?: WineType[];
  country?: string;
  region?: string;
  vintageFrom?: number;
  vintageTo?: number;
  minRating?: number;
  grape?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'name' | 'vintage' | 'rating' | 'createdAt';
  orderDirection?: 'asc' | 'desc';
}

export interface WineInventoryQueryOptions {
  status?: WineInventoryStatus[];
  location?: string;
  inDrinkingWindow?: boolean;
  expiringWithinDays?: number;
  limit?: number;
  offset?: number;
}

export interface WatchlistQueryOptions {
  mediaType?: MediaType[];
  status?: WatchStatus[];
  genres?: string[];
  minRating?: number;
  hasUnwatchedEpisodes?: boolean;
  limit?: number;
  offset?: number;
  orderBy?: 'addedAt' | 'rating' | 'releaseDate' | 'title' | 'priority';
  orderDirection?: 'asc' | 'desc';
}

export interface EventQueryOptions {
  category?: EventCategory[];
  dateFrom?: number;
  dateTo?: number;
  location?: {
    lat: number;
    lng: number;
    radiusKm: number;
  };
  maxPrice?: number;
  isSoldOut?: boolean;
  performers?: string[];
  limit?: number;
  offset?: number;
  orderBy?: 'startTime' | 'relevance' | 'price';
  orderDirection?: 'asc' | 'desc';
}

// =============================================================================
// Service Config Types
// =============================================================================

export interface LifestyleServiceConfig {
  enabled?: boolean;
}

export interface WineCellarServiceConfig extends LifestyleServiceConfig {
  lowStockThreshold?: number;
  drinkingWindowAlertDays?: number;
  enablePairingSearch?: boolean;
}

export interface EntertainmentServiceConfig extends LifestyleServiceConfig {
  provider?: 'tmdb' | 'tvmaze';
  episodeCheckIntervalHours?: number;
  releaseAlertDays?: number;
}

export interface EventDiscoveryServiceConfig extends LifestyleServiceConfig {
  providers?: ('ticketmaster' | 'eventbrite' | 'songkick')[];
  checkIntervalHours?: number;
  defaultRadius?: number;
  maxEventsPerSearch?: number;
}
