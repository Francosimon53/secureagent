/**
 * Lifestyle Providers
 *
 * Re-exports all lifestyle provider implementations.
 */

export {
  BaseLifestyleProvider,
  LifestyleProviderRegistry,
  initLifestyleProviderRegistry,
  getLifestyleProviderRegistry,
  type LifestyleProviderType,
  type EntertainmentProvider,
  type WineProvider,
  type EventProvider,
  type MovieSearchResult,
  type MovieDetails,
  type TVShowSearchResult,
  type TVShowDetails,
  type SeasonDetails,
  type EpisodeDetails,
  type CastMember,
  type WineSearchResult,
  type WineDetails,
  type WinePairingResult,
  type FoodPairingResult,
  type EventSearchParams,
  type EventSearchResult,
  type EventDetails,
  type ArtistResult,
  type VenueResult,
} from './base.js';

export {
  TMDBProvider,
  createTMDBProvider,
  type TMDBProviderConfig,
} from './entertainment/index.js';

export {
  VivinoProvider,
  createVivinoProvider,
  type VivinoProviderConfig,
} from './wine/index.js';

export {
  TicketmasterProvider,
  createTicketmasterProvider,
  type TicketmasterProviderConfig,
} from './events/index.js';
