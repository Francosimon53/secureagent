/**
 * Music Control Integration - Apple Music
 *
 * Apple Music integration using MusicKit JS and Apple Music API
 */

import type { AppleMusicConfig } from './config.js';
import type {
  Track,
  Album,
  Artist,
  Playlist,
  PlaybackContext,
  SearchResults,
  AppleMusicTokens,
  PlaybackState,
  RepeatMode,
} from './types.js';
import { MusicError, MUSIC_ERROR_CODES } from './types.js';

const APPLE_MUSIC_API_BASE = 'https://api.music.apple.com/v1';

/**
 * Apple Music Integration
 *
 * Note: Full playback control requires MusicKit JS in a browser context.
 * This integration provides API access for search, library, and playlist management.
 * System-level playback control on macOS can be achieved via the audio-control module.
 */
export class AppleMusicIntegration {
  private config: AppleMusicConfig;
  private developerToken?: string;
  private userToken?: string;

  constructor(config: AppleMusicConfig) {
    this.config = config;
    this.developerToken = config.developerToken;
    this.userToken = config.userToken;
  }

  /**
   * Check if connected with valid tokens
   */
  isConnected(): boolean {
    return !!this.developerToken;
  }

  /**
   * Check if user is authenticated
   */
  isUserAuthenticated(): boolean {
    return !!this.developerToken && !!this.userToken;
  }

  /**
   * Set tokens
   */
  setTokens(tokens: AppleMusicTokens): void {
    this.developerToken = tokens.developerToken;
    this.userToken = tokens.userToken;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    requireUserToken = false,
  ): Promise<T> {
    if (!this.developerToken) {
      throw new MusicError(
        'Developer token not configured',
        MUSIC_ERROR_CODES.NOT_CONNECTED,
        'apple_music',
      );
    }

    if (requireUserToken && !this.userToken) {
      throw new MusicError(
        'User authentication required',
        MUSIC_ERROR_CODES.AUTH_EXPIRED,
        'apple_music',
      );
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.developerToken}`,
      'Content-Type': 'application/json',
    };

    if (this.userToken) {
      headers['Music-User-Token'] = this.userToken;
    }

    const response = await fetch(`${APPLE_MUSIC_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      throw new MusicError(
        'Authentication expired',
        MUSIC_ERROR_CODES.AUTH_EXPIRED,
        'apple_music',
      );
    }

    if (response.status === 429) {
      throw new MusicError(
        'Rate limited by Apple Music',
        MUSIC_ERROR_CODES.RATE_LIMITED,
        'apple_music',
      );
    }

    if (!response.ok) {
      const error = await response.text();
      throw new MusicError(
        `Apple Music API error: ${error}`,
        MUSIC_ERROR_CODES.API_ERROR,
        'apple_music',
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  // ==================== Catalog Search ====================

  /**
   * Search Apple Music catalog
   */
  async search(
    query: string,
    types: ('songs' | 'albums' | 'artists' | 'playlists')[] = [
      'songs',
      'albums',
      'artists',
      'playlists',
    ],
    limit = 20,
  ): Promise<SearchResults> {
    const params = new URLSearchParams({
      term: query,
      types: types.join(','),
      limit: limit.toString(),
    });

    const data = await this.request<AppleMusicSearchResponse>(
      `/catalog/${this.config.storefront}/search?${params}`,
    );

    return {
      tracks: data.results?.songs?.data?.map((s) => this.mapSong(s)) || [],
      albums: data.results?.albums?.data?.map((a) => this.mapAlbum(a)) || [],
      artists: data.results?.artists?.data?.map((a) => this.mapArtist(a)) || [],
      playlists:
        data.results?.playlists?.data?.map((p) => this.mapPlaylist(p)) || [],
    };
  }

  /**
   * Get song by ID
   */
  async getSong(songId: string): Promise<Track | null> {
    try {
      const data = await this.request<AppleMusicResource<AppleMusicSong>>(
        `/catalog/${this.config.storefront}/songs/${songId}`,
      );
      return data.data?.[0] ? this.mapSong(data.data[0]) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get album by ID
   */
  async getAlbum(albumId: string): Promise<Album | null> {
    try {
      const data = await this.request<AppleMusicResource<AppleMusicAlbum>>(
        `/catalog/${this.config.storefront}/albums/${albumId}`,
      );
      return data.data?.[0] ? this.mapAlbumFull(data.data[0]) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get artist by ID
   */
  async getArtist(artistId: string): Promise<Artist | null> {
    try {
      const data = await this.request<AppleMusicResource<AppleMusicArtist>>(
        `/catalog/${this.config.storefront}/artists/${artistId}`,
      );
      return data.data?.[0] ? this.mapArtist(data.data[0]) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get playlist by ID
   */
  async getPlaylist(playlistId: string): Promise<Playlist | null> {
    try {
      const data = await this.request<AppleMusicResource<AppleMusicPlaylist>>(
        `/catalog/${this.config.storefront}/playlists/${playlistId}`,
      );
      return data.data?.[0] ? this.mapPlaylistFull(data.data[0]) : null;
    } catch {
      return null;
    }
  }

  // ==================== User Library ====================

  /**
   * Get user's library songs
   */
  async getLibrarySongs(limit = 50, offset = 0): Promise<Track[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    const data = await this.request<AppleMusicResource<AppleMusicSong>>(
      `/me/library/songs?${params}`,
      {},
      true,
    );

    return data.data?.map((s) => this.mapSong(s)) || [];
  }

  /**
   * Get user's library albums
   */
  async getLibraryAlbums(limit = 50, offset = 0): Promise<Album[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    const data = await this.request<AppleMusicResource<AppleMusicAlbum>>(
      `/me/library/albums?${params}`,
      {},
      true,
    );

    return data.data?.map((a) => this.mapAlbum(a)) || [];
  }

  /**
   * Get user's library playlists
   */
  async getLibraryPlaylists(limit = 50, offset = 0): Promise<Playlist[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    const data = await this.request<AppleMusicResource<AppleMusicPlaylist>>(
      `/me/library/playlists?${params}`,
      {},
      true,
    );

    return data.data?.map((p) => this.mapPlaylist(p)) || [];
  }

  /**
   * Add song to library
   */
  async addToLibrary(songIds: string[]): Promise<void> {
    const params = new URLSearchParams();
    songIds.forEach((id) => params.append('ids[songs]', id));

    await this.request(`/me/library?${params}`, { method: 'POST' }, true);
  }

  /**
   * Create library playlist
   */
  async createPlaylist(
    name: string,
    options?: { description?: string; trackIds?: string[] },
  ): Promise<Playlist> {
    const body: AppleMusicCreatePlaylistRequest = {
      attributes: {
        name,
        description: options?.description || '',
      },
    };

    if (options?.trackIds && options.trackIds.length > 0) {
      body.relationships = {
        tracks: {
          data: options.trackIds.map((id) => ({
            id,
            type: 'songs',
          })),
        },
      };
    }

    const data = await this.request<AppleMusicResource<AppleMusicPlaylist>>(
      '/me/library/playlists',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      true,
    );

    return this.mapPlaylist(data.data[0]);
  }

  /**
   * Add tracks to library playlist
   */
  async addToPlaylist(playlistId: string, trackIds: string[]): Promise<void> {
    const body = {
      data: trackIds.map((id) => ({
        id,
        type: 'songs',
      })),
    };

    await this.request(
      `/me/library/playlists/${playlistId}/tracks`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      true,
    );
  }

  // ==================== Recommendations ====================

  /**
   * Get personalized recommendations
   */
  async getRecommendations(): Promise<Playlist[]> {
    const data = await this.request<AppleMusicResource<AppleMusicPlaylist>>(
      '/me/recommendations',
      {},
      true,
    );

    return data.data?.map((p) => this.mapPlaylist(p)) || [];
  }

  /**
   * Get recently played
   */
  async getRecentlyPlayed(limit = 10): Promise<Track[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
    });

    const data = await this.request<AppleMusicResource<AppleMusicSong>>(
      `/me/recent/played/tracks?${params}`,
      {},
      true,
    );

    return data.data?.map((s) => this.mapSong(s)) || [];
  }

  // ==================== Charts ====================

  /**
   * Get charts (top songs, albums, etc.)
   */
  async getCharts(
    types: ('songs' | 'albums' | 'playlists')[] = ['songs', 'albums'],
    limit = 20,
  ): Promise<{
    songs: Track[];
    albums: Album[];
    playlists: Playlist[];
  }> {
    const params = new URLSearchParams({
      types: types.join(','),
      limit: limit.toString(),
    });

    const data = await this.request<AppleMusicChartsResponse>(
      `/catalog/${this.config.storefront}/charts?${params}`,
    );

    return {
      songs:
        data.results?.songs?.[0]?.data?.map((s) => this.mapSong(s)) || [],
      albums:
        data.results?.albums?.[0]?.data?.map((a) => this.mapAlbum(a)) || [],
      playlists:
        data.results?.playlists?.[0]?.data?.map((p) => this.mapPlaylist(p)) ||
        [],
    };
  }

  // ==================== Mapping Helpers ====================

  private mapSong(song: AppleMusicSong): Track {
    const attrs = song.attributes;
    return {
      id: song.id,
      name: attrs?.name || 'Unknown',
      artist: attrs?.artistName || 'Unknown Artist',
      album: attrs?.albumName || '',
      duration: attrs?.durationInMillis || 0,
      artworkUrl: attrs?.artwork?.url
        ?.replace('{w}', '300')
        .replace('{h}', '300'),
      uri: `music://song/${song.id}`,
      provider: 'apple_music',
    };
  }

  private mapAlbum(album: AppleMusicAlbum): Album {
    const attrs = album.attributes;
    return {
      id: album.id,
      name: attrs?.name || 'Unknown',
      artist: attrs?.artistName || 'Unknown Artist',
      tracks: [],
      artworkUrl: attrs?.artwork?.url
        ?.replace('{w}', '300')
        .replace('{h}', '300'),
      releaseDate: attrs?.releaseDate,
      provider: 'apple_music',
    };
  }

  private mapAlbumFull(album: AppleMusicAlbum): Album {
    const base = this.mapAlbum(album);
    const tracks =
      album.relationships?.tracks?.data?.map((s) => this.mapSong(s)) || [];
    return { ...base, tracks };
  }

  private mapArtist(artist: AppleMusicArtist): Artist {
    const attrs = artist.attributes;
    return {
      id: artist.id,
      name: attrs?.name || 'Unknown',
      genres: attrs?.genreNames,
      imageUrl: attrs?.artwork?.url
        ?.replace('{w}', '300')
        .replace('{h}', '300'),
      provider: 'apple_music',
    };
  }

  private mapPlaylist(playlist: AppleMusicPlaylist): Playlist {
    const attrs = playlist.attributes;
    return {
      id: playlist.id,
      name: attrs?.name || 'Unknown',
      description: attrs?.description?.standard,
      owner: attrs?.curatorName,
      tracks: [],
      artworkUrl: attrs?.artwork?.url
        ?.replace('{w}', '300')
        .replace('{h}', '300'),
      isPublic: true,
      provider: 'apple_music',
    };
  }

  private mapPlaylistFull(playlist: AppleMusicPlaylist): Playlist {
    const base = this.mapPlaylist(playlist);
    const tracks =
      playlist.relationships?.tracks?.data?.map((s) => this.mapSong(s)) || [];
    return { ...base, tracks };
  }
}

// ==================== Apple Music API Types ====================

interface AppleMusicResource<T> {
  data: T[];
  next?: string;
}

interface AppleMusicSong {
  id: string;
  type: 'songs';
  attributes?: {
    name: string;
    artistName: string;
    albumName?: string;
    durationInMillis: number;
    artwork?: {
      url: string;
    };
  };
}

interface AppleMusicAlbum {
  id: string;
  type: 'albums';
  attributes?: {
    name: string;
    artistName: string;
    releaseDate?: string;
    artwork?: {
      url: string;
    };
  };
  relationships?: {
    tracks?: {
      data: AppleMusicSong[];
    };
  };
}

interface AppleMusicArtist {
  id: string;
  type: 'artists';
  attributes?: {
    name: string;
    genreNames?: string[];
    artwork?: {
      url: string;
    };
  };
}

interface AppleMusicPlaylist {
  id: string;
  type: 'playlists';
  attributes?: {
    name: string;
    description?: {
      standard?: string;
    };
    curatorName?: string;
    artwork?: {
      url: string;
    };
  };
  relationships?: {
    tracks?: {
      data: AppleMusicSong[];
    };
  };
}

interface AppleMusicSearchResponse {
  results?: {
    songs?: AppleMusicResource<AppleMusicSong>;
    albums?: AppleMusicResource<AppleMusicAlbum>;
    artists?: AppleMusicResource<AppleMusicArtist>;
    playlists?: AppleMusicResource<AppleMusicPlaylist>;
  };
}

interface AppleMusicChartsResponse {
  results?: {
    songs?: { data: AppleMusicSong[] }[];
    albums?: { data: AppleMusicAlbum[] }[];
    playlists?: { data: AppleMusicPlaylist[] }[];
  };
}

interface AppleMusicCreatePlaylistRequest {
  attributes: {
    name: string;
    description?: string;
  };
  relationships?: {
    tracks?: {
      data: { id: string; type: string }[];
    };
  };
}
