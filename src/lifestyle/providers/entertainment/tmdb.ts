/**
 * TMDB Provider
 *
 * The Movie Database API integration for movie and TV show information.
 */

import {
  BaseLifestyleProvider,
  type EntertainmentProvider,
  type MovieSearchResult,
  type MovieDetails,
  type TVShowSearchResult,
  type TVShowDetails,
  type SeasonDetails,
  type EpisodeDetails,
  type CastMember,
} from '../base.js';

export interface TMDBProviderConfig {
  apiKeyEnvVar?: string;
  baseUrl?: string;
  imageBaseUrl?: string;
  language?: string;
}

/**
 * TMDB provider implementation
 */
export class TMDBProvider extends BaseLifestyleProvider implements EntertainmentProvider {
  readonly name = 'tmdb';
  readonly type = 'entertainment' as const;

  private apiKey: string | null = null;
  private readonly baseUrl: string;
  private readonly imageBaseUrl: string;
  private readonly language: string;

  constructor(private readonly config: TMDBProviderConfig = {}) {
    super();
    this.baseUrl = config.baseUrl ?? 'https://api.themoviedb.org/3';
    this.imageBaseUrl = config.imageBaseUrl ?? 'https://image.tmdb.org/t/p';
    this.language = config.language ?? 'en-US';
  }

  async initialize(): Promise<void> {
    const envVar = this.config.apiKeyEnvVar ?? 'TMDB_API_KEY';
    this.apiKey = process.env[envVar] ?? null;

    if (!this.apiKey) {
      console.warn(`TMDB API key not found in ${envVar}`);
    }

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  async searchMovies(query: string): Promise<MovieSearchResult[]> {
    const data = await this.request<TMDBSearchResult>('/search/movie', {
      query,
      language: this.language,
    });

    return data.results.map(m => this.mapToMovieResult(m));
  }

  async getMovieDetails(externalId: string): Promise<MovieDetails | null> {
    try {
      const data = await this.request<TMDBMovieDetails>(`/movie/${externalId}`, {
        language: this.language,
        append_to_response: 'credits',
      });

      return this.mapToMovieDetails(data);
    } catch {
      return null;
    }
  }

  async searchTVShows(query: string): Promise<TVShowSearchResult[]> {
    const data = await this.request<TMDBSearchResult>('/search/tv', {
      query,
      language: this.language,
    });

    return data.results.map(s => this.mapToTVShowResult(s));
  }

  async getTVShowDetails(externalId: string): Promise<TVShowDetails | null> {
    try {
      const data = await this.request<TMDBTVShowDetails>(`/tv/${externalId}`, {
        language: this.language,
        append_to_response: 'credits',
      });

      return this.mapToTVShowDetails(data);
    } catch {
      return null;
    }
  }

  async getSeasonDetails(showId: string, seasonNumber: number): Promise<SeasonDetails | null> {
    try {
      const data = await this.request<TMDBSeasonDetails>(`/tv/${showId}/season/${seasonNumber}`, {
        language: this.language,
      });

      return this.mapToSeasonDetails(data);
    } catch {
      return null;
    }
  }

  async getNextEpisode(
    showId: string,
    afterSeason: number,
    afterEpisode: number
  ): Promise<EpisodeDetails | null> {
    // First try the same season
    const season = await this.getSeasonDetails(showId, afterSeason);
    if (season) {
      const nextInSeason = season.episodes.find(
        e => e.seasonNumber === afterSeason && e.episodeNumber === afterEpisode + 1
      );
      if (nextInSeason) {
        return nextInSeason;
      }
    }

    // Try next season
    const nextSeason = await this.getSeasonDetails(showId, afterSeason + 1);
    if (nextSeason && nextSeason.episodes.length > 0) {
      return nextSeason.episodes[0];
    }

    // Check show details for next episode
    const show = await this.getTVShowDetails(showId);
    if (show?.nextEpisodeAirDate) {
      // Show has a scheduled next episode but we couldn't fetch details
      // This happens when the season isn't fully available yet
      return {
        seasonNumber: afterSeason + 1,
        episodeNumber: 1,
        airDate: show.nextEpisodeAirDate,
      };
    }

    return null;
  }

  async getTrendingMovies(): Promise<MovieSearchResult[]> {
    const data = await this.request<TMDBSearchResult>('/trending/movie/week', {
      language: this.language,
    });

    return data.results.map(m => this.mapToMovieResult(m));
  }

  async getTrendingTVShows(): Promise<TVShowSearchResult[]> {
    const data = await this.request<TMDBSearchResult>('/trending/tv/week', {
      language: this.language,
    });

    return data.results.map(s => this.mapToTVShowResult(s));
  }

  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    if (!this.apiKey) {
      throw new Error('TMDB API key not configured');
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set('api_key', this.apiKey);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private mapToMovieResult(data: TMDBMovie): MovieSearchResult {
    return {
      externalId: String(data.id),
      title: data.title,
      releaseDate: data.release_date ? new Date(data.release_date).getTime() : undefined,
      posterUrl: data.poster_path ? `${this.imageBaseUrl}/w342${data.poster_path}` : undefined,
      overview: data.overview,
      rating: data.vote_average,
    };
  }

  private mapToMovieDetails(data: TMDBMovieDetails): MovieDetails {
    return {
      ...this.mapToMovieResult(data),
      runtime: data.runtime,
      genres: data.genres?.map(g => g.name),
      backdropUrl: data.backdrop_path ? `${this.imageBaseUrl}/w1280${data.backdrop_path}` : undefined,
      cast: data.credits?.cast?.slice(0, 10).map(c => ({
        name: c.name,
        character: c.character,
        profileUrl: c.profile_path ? `${this.imageBaseUrl}/w185${c.profile_path}` : undefined,
      })),
      director: data.credits?.crew?.find(c => c.job === 'Director')?.name,
    };
  }

  private mapToTVShowResult(data: TMDBTVShow): TVShowSearchResult {
    return {
      externalId: String(data.id),
      title: data.name,
      firstAirDate: data.first_air_date ? new Date(data.first_air_date).getTime() : undefined,
      posterUrl: data.poster_path ? `${this.imageBaseUrl}/w342${data.poster_path}` : undefined,
      overview: data.overview,
      rating: data.vote_average,
    };
  }

  private mapToTVShowDetails(data: TMDBTVShowDetails): TVShowDetails {
    let status: TVShowDetails['status'];
    switch (data.status) {
      case 'Returning Series':
        status = 'returning';
        break;
      case 'Ended':
        status = 'ended';
        break;
      case 'Canceled':
        status = 'canceled';
        break;
      case 'In Production':
        status = 'in_production';
        break;
    }

    return {
      ...this.mapToTVShowResult(data),
      totalSeasons: data.number_of_seasons,
      totalEpisodes: data.number_of_episodes,
      status,
      genres: data.genres?.map(g => g.name),
      backdropUrl: data.backdrop_path ? `${this.imageBaseUrl}/w1280${data.backdrop_path}` : undefined,
      cast: data.credits?.cast?.slice(0, 10).map(c => ({
        name: c.name,
        character: c.character,
        profileUrl: c.profile_path ? `${this.imageBaseUrl}/w185${c.profile_path}` : undefined,
      })),
      nextEpisodeAirDate: data.next_episode_to_air?.air_date
        ? new Date(data.next_episode_to_air.air_date).getTime()
        : undefined,
    };
  }

  private mapToSeasonDetails(data: TMDBSeasonDetails): SeasonDetails {
    return {
      seasonNumber: data.season_number,
      episodeCount: data.episodes?.length ?? 0,
      airDate: data.air_date ? new Date(data.air_date).getTime() : undefined,
      overview: data.overview,
      posterUrl: data.poster_path ? `${this.imageBaseUrl}/w342${data.poster_path}` : undefined,
      episodes: (data.episodes ?? []).map(e => ({
        seasonNumber: e.season_number,
        episodeNumber: e.episode_number,
        title: e.name,
        airDate: e.air_date ? new Date(e.air_date).getTime() : undefined,
        overview: e.overview,
        runtime: e.runtime,
        stillUrl: e.still_path ? `${this.imageBaseUrl}/w300${e.still_path}` : undefined,
      })),
    };
  }
}

// TMDB API response types
interface TMDBSearchResult {
  page: number;
  results: Array<TMDBMovie | TMDBTVShow>;
  total_results: number;
  total_pages: number;
}

interface TMDBMovie {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  vote_average?: number;
}

interface TMDBMovieDetails extends TMDBMovie {
  runtime?: number;
  genres?: Array<{ id: number; name: string }>;
  credits?: {
    cast?: Array<TMDBCastMember>;
    crew?: Array<{ name: string; job: string }>;
  };
}

interface TMDBTVShow {
  id: number;
  name: string;
  first_air_date?: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  vote_average?: number;
}

interface TMDBTVShowDetails extends TMDBTVShow {
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  genres?: Array<{ id: number; name: string }>;
  credits?: {
    cast?: Array<TMDBCastMember>;
  };
  next_episode_to_air?: {
    air_date?: string;
    episode_number?: number;
    season_number?: number;
  };
}

interface TMDBSeasonDetails {
  season_number: number;
  air_date?: string;
  overview?: string;
  poster_path?: string;
  episodes?: Array<{
    season_number: number;
    episode_number: number;
    name?: string;
    air_date?: string;
    overview?: string;
    runtime?: number;
    still_path?: string;
  }>;
}

interface TMDBCastMember {
  name: string;
  character?: string;
  profile_path?: string;
}

/**
 * Create a TMDB provider instance
 */
export function createTMDBProvider(config?: TMDBProviderConfig): TMDBProvider {
  return new TMDBProvider(config);
}
