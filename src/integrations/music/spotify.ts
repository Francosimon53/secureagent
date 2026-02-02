/**
 * Music Control Integration - Spotify Web API
 *
 * Full Spotify integration using the Web API with OAuth 2.0
 */

import type { SpotifyConfig } from './config.js';
import type {
  Track,
  Album,
  Artist,
  Playlist,
  PlaybackContext,
  PlaybackDevice,
  SearchResults,
  SpotifyTokens,
  PlaybackState,
  RepeatMode,
} from './types.js';
import { MusicError, MUSIC_ERROR_CODES } from './types.js';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

/**
 * Spotify Web API Integration
 */
export class SpotifyIntegration {
  private config: SpotifyConfig;
  private accessToken?: string;
  private refreshToken?: string;
  private tokenExpiry?: number;

  constructor(config: SpotifyConfig) {
    this.config = config;
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.tokenExpiry = config.tokenExpiry;
  }

  /**
   * Check if connected with valid tokens
   */
  isConnected(): boolean {
    return !!this.accessToken && (!this.tokenExpiry || Date.now() < this.tokenExpiry);
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(state: string, redirectUri?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: redirectUri || this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state,
      show_dialog: 'true',
    });

    return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri?: string,
  ): Promise<SpotifyTokens> {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${this.config.clientId}:${this.config.clientSecret}`,
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri || this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new MusicError(
        `Failed to exchange code: ${error}`,
        MUSIC_ERROR_CODES.AUTH_EXPIRED,
        'spotify',
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope?: string;
    };
    const tokens: SpotifyTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope?.split(' ') || this.config.scopes,
    };

    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.tokenExpiry = tokens.expiresAt;

    return tokens;
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<SpotifyTokens> {
    if (!this.refreshToken) {
      throw new MusicError(
        'No refresh token available',
        MUSIC_ERROR_CODES.AUTH_EXPIRED,
        'spotify',
      );
    }

    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${this.config.clientId}:${this.config.clientSecret}`,
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new MusicError(
        'Failed to refresh token',
        MUSIC_ERROR_CODES.AUTH_EXPIRED,
        'spotify',
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };
    const tokens: SpotifyTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || this.refreshToken!,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope?.split(' ') || this.config.scopes,
    };

    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.tokenExpiry = tokens.expiresAt;

    return tokens;
  }

  /**
   * Set tokens directly (e.g., from stored credentials)
   */
  setTokens(tokens: SpotifyTokens): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.tokenExpiry = tokens.expiresAt;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    // Refresh token if expired
    if (this.tokenExpiry && Date.now() >= this.tokenExpiry - 60000) {
      await this.refreshAccessToken();
    }

    if (!this.accessToken) {
      throw new MusicError(
        'Not connected to Spotify',
        MUSIC_ERROR_CODES.NOT_CONNECTED,
        'spotify',
      );
    }

    const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (response.status === 401) {
      // Try refreshing token once
      await this.refreshAccessToken();
      return this.request(endpoint, options);
    }

    if (response.status === 429) {
      throw new MusicError(
        'Rate limited by Spotify',
        MUSIC_ERROR_CODES.RATE_LIMITED,
        'spotify',
      );
    }

    if (!response.ok) {
      const error = await response.text();
      throw new MusicError(
        `Spotify API error: ${error}`,
        MUSIC_ERROR_CODES.API_ERROR,
        'spotify',
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  // ==================== Playback Control ====================

  /**
   * Start/resume playback
   */
  async play(options?: {
    uri?: string;
    uris?: string[];
    contextUri?: string;
    deviceId?: string;
    positionMs?: number;
  }): Promise<void> {
    const params = options?.deviceId
      ? `?device_id=${options.deviceId}`
      : '';
    const body: Record<string, unknown> = {};

    if (options?.contextUri) {
      body.context_uri = options.contextUri;
    }
    if (options?.uris) {
      body.uris = options.uris;
    } else if (options?.uri) {
      body.uris = [options.uri];
    }
    if (options?.positionMs !== undefined) {
      body.position_ms = options.positionMs;
    }

    await this.request(`/me/player/play${params}`, {
      method: 'PUT',
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    await this.request('/me/player/pause', { method: 'PUT' });
  }

  /**
   * Skip to next track
   */
  async next(): Promise<void> {
    await this.request('/me/player/next', { method: 'POST' });
  }

  /**
   * Skip to previous track
   */
  async previous(): Promise<void> {
    await this.request('/me/player/previous', { method: 'POST' });
  }

  /**
   * Seek to position in track
   */
  async seek(positionMs: number): Promise<void> {
    await this.request(`/me/player/seek?position_ms=${positionMs}`, {
      method: 'PUT',
    });
  }

  /**
   * Set volume
   */
  async setVolume(volumePercent: number): Promise<void> {
    const volume = Math.max(0, Math.min(100, Math.round(volumePercent)));
    await this.request(`/me/player/volume?volume_percent=${volume}`, {
      method: 'PUT',
    });
  }

  /**
   * Set shuffle state
   */
  async setShuffle(state: boolean): Promise<void> {
    await this.request(`/me/player/shuffle?state=${state}`, {
      method: 'PUT',
    });
  }

  /**
   * Set repeat mode
   */
  async setRepeat(mode: RepeatMode): Promise<void> {
    await this.request(`/me/player/repeat?state=${mode}`, {
      method: 'PUT',
    });
  }

  // ==================== Playback State ====================

  /**
   * Get current playback state
   */
  async getPlayback(): Promise<PlaybackContext | null> {
    try {
      const data = await this.request<SpotifyPlaybackState>('/me/player');
      if (!data || !data.item) {
        return null;
      }

      return this.mapPlaybackState(data);
    } catch (error) {
      if (error instanceof MusicError && error.code === MUSIC_ERROR_CODES.API_ERROR) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get currently playing track
   */
  async getCurrentTrack(): Promise<Track | null> {
    const data = await this.request<SpotifyCurrentlyPlaying>(
      '/me/player/currently-playing',
    );
    if (!data || !data.item) {
      return null;
    }

    return this.mapTrack(data.item);
  }

  /**
   * Get available devices
   */
  async getDevices(): Promise<PlaybackDevice[]> {
    const data = await this.request<{ devices: SpotifyDevice[] }>(
      '/me/player/devices',
    );
    return data.devices.map((device) => this.mapDevice(device));
  }

  /**
   * Transfer playback to device
   */
  async transferPlayback(deviceId: string, play = false): Promise<void> {
    await this.request('/me/player', {
      method: 'PUT',
      body: JSON.stringify({
        device_ids: [deviceId],
        play,
      }),
    });
  }

  /**
   * Get current queue
   */
  async getQueue(): Promise<Track[]> {
    const data = await this.request<SpotifyQueue>('/me/player/queue');
    return data.queue?.map((item) => this.mapTrack(item)) || [];
  }

  /**
   * Add track to queue
   */
  async addToQueue(uri: string, deviceId?: string): Promise<void> {
    const params = new URLSearchParams({ uri });
    if (deviceId) {
      params.set('device_id', deviceId);
    }
    await this.request(`/me/player/queue?${params}`, { method: 'POST' });
  }

  // ==================== Search ====================

  /**
   * Search Spotify catalog
   */
  async search(
    query: string,
    types: ('track' | 'album' | 'artist' | 'playlist')[] = [
      'track',
      'album',
      'artist',
      'playlist',
    ],
    limit = 20,
  ): Promise<SearchResults> {
    const params = new URLSearchParams({
      q: query,
      type: types.join(','),
      limit: limit.toString(),
    });

    const data = await this.request<SpotifySearchResults>(
      `/search?${params}`,
    );

    return {
      tracks: data.tracks?.items.map((t) => this.mapTrack(t)) || [],
      albums: data.albums?.items.map((a) => this.mapAlbum(a)) || [],
      artists: data.artists?.items.map((a) => this.mapArtist(a)) || [],
      playlists: data.playlists?.items.map((p) => this.mapPlaylist(p)) || [],
    };
  }

  // ==================== Playlists ====================

  /**
   * Get user's playlists
   */
  async getPlaylists(limit = 50): Promise<Playlist[]> {
    const data = await this.request<SpotifyPaginated<SpotifyPlaylistSimplified>>(
      `/me/playlists?limit=${limit}`,
    );
    return data.items.map((p) => this.mapPlaylist(p));
  }

  /**
   * Get playlist details with tracks
   */
  async getPlaylist(playlistId: string): Promise<Playlist> {
    const data = await this.request<SpotifyPlaylistFull>(
      `/playlists/${playlistId}`,
    );
    return this.mapPlaylistFull(data);
  }

  /**
   * Create new playlist
   */
  async createPlaylist(
    name: string,
    options?: { description?: string; isPublic?: boolean },
  ): Promise<Playlist> {
    const user = await this.request<{ id: string }>('/me');
    const data = await this.request<SpotifyPlaylistFull>(
      `/users/${user.id}/playlists`,
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: options?.description || '',
          public: options?.isPublic ?? false,
        }),
      },
    );
    return this.mapPlaylistFull(data);
  }

  /**
   * Add tracks to playlist
   */
  async addToPlaylist(playlistId: string, uris: string[]): Promise<void> {
    await this.request(`/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ uris }),
    });
  }

  // ==================== Library ====================

  /**
   * Get user's liked/saved songs
   */
  async getLikedSongs(limit = 50, offset = 0): Promise<Track[]> {
    const data = await this.request<SpotifyPaginated<{ track: SpotifyTrack }>>(
      `/me/tracks?limit=${limit}&offset=${offset}`,
    );
    return data.items.map((item) => this.mapTrack(item.track));
  }

  /**
   * Save track to library
   */
  async saveTrack(trackId: string): Promise<void> {
    await this.request(`/me/tracks?ids=${trackId}`, { method: 'PUT' });
  }

  /**
   * Remove track from library
   */
  async removeTrack(trackId: string): Promise<void> {
    await this.request(`/me/tracks?ids=${trackId}`, { method: 'DELETE' });
  }

  /**
   * Check if tracks are saved
   */
  async checkSavedTracks(trackIds: string[]): Promise<boolean[]> {
    return this.request<boolean[]>(
      `/me/tracks/contains?ids=${trackIds.join(',')}`,
    );
  }

  // ==================== Helper Methods ====================

  private mapTrack(track: SpotifyTrack): Track {
    return {
      id: track.id,
      name: track.name,
      artist: track.artists.map((a) => a.name).join(', '),
      artistId: track.artists[0]?.id,
      album: track.album?.name || '',
      albumId: track.album?.id,
      duration: track.duration_ms,
      artworkUrl: track.album?.images?.[0]?.url,
      uri: track.uri,
      provider: 'spotify',
    };
  }

  private mapAlbum(album: SpotifyAlbum): Album {
    return {
      id: album.id,
      name: album.name,
      artist: album.artists.map((a) => a.name).join(', '),
      artistId: album.artists[0]?.id,
      tracks: [],
      artworkUrl: album.images?.[0]?.url,
      releaseDate: album.release_date,
      provider: 'spotify',
    };
  }

  private mapArtist(artist: SpotifyArtist): Artist {
    return {
      id: artist.id,
      name: artist.name,
      genres: artist.genres,
      imageUrl: artist.images?.[0]?.url,
      provider: 'spotify',
    };
  }

  private mapPlaylist(playlist: SpotifyPlaylistSimplified): Playlist {
    return {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description || undefined,
      owner: playlist.owner?.display_name,
      tracks: [],
      artworkUrl: playlist.images?.[0]?.url,
      isPublic: playlist.public,
      provider: 'spotify',
    };
  }

  private mapPlaylistFull(playlist: SpotifyPlaylistFull): Playlist {
    return {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description || undefined,
      owner: playlist.owner?.display_name,
      tracks: playlist.tracks.items
        .filter((item) => item.track)
        .map((item) => this.mapTrack(item.track)),
      artworkUrl: playlist.images?.[0]?.url,
      isPublic: playlist.public,
      provider: 'spotify',
    };
  }

  private mapDevice(device: SpotifyDevice): PlaybackDevice {
    return {
      id: device.id,
      name: device.name,
      type: this.mapDeviceType(device.type),
      isActive: device.is_active,
      volume: device.volume_percent,
      provider: 'spotify',
    };
  }

  private mapDeviceType(
    type: string,
  ): 'computer' | 'speaker' | 'tv' | 'phone' | 'tablet' | 'group' {
    const typeMap: Record<string, PlaybackDevice['type']> = {
      Computer: 'computer',
      Smartphone: 'phone',
      Tablet: 'tablet',
      Speaker: 'speaker',
      TV: 'tv',
      AVR: 'speaker',
      STB: 'tv',
      AudioDongle: 'speaker',
      GameConsole: 'tv',
      CastVideo: 'tv',
      CastAudio: 'speaker',
      Automobile: 'speaker',
    };
    return typeMap[type] || 'speaker';
  }

  private mapPlaybackState(data: SpotifyPlaybackState): PlaybackContext {
    const stateMap: Record<string, PlaybackState> = {
      playing: 'playing',
      paused: 'paused',
    };

    return {
      track: data.item ? this.mapTrack(data.item) : null,
      position: data.progress_ms || 0,
      state: data.is_playing ? 'playing' : 'paused',
      volume: data.device?.volume_percent || 0,
      shuffle: data.shuffle_state || false,
      repeat: (data.repeat_state as RepeatMode) || 'off',
      device: data.device ? this.mapDevice(data.device) : undefined,
    };
  }
}

// ==================== Spotify API Types ====================

interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  artists: { id: string; name: string }[];
  album?: {
    id: string;
    name: string;
    images?: { url: string }[];
  };
}

interface SpotifyAlbum {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images?: { url: string }[];
  release_date?: string;
}

interface SpotifyArtist {
  id: string;
  name: string;
  genres?: string[];
  images?: { url: string }[];
}

interface SpotifyPlaylistSimplified {
  id: string;
  name: string;
  description?: string;
  owner?: { display_name: string };
  images?: { url: string }[];
  public?: boolean;
}

interface SpotifyPlaylistFull extends SpotifyPlaylistSimplified {
  tracks: {
    items: { track: SpotifyTrack }[];
  };
}

interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent?: number;
}

interface SpotifyPlaybackState {
  is_playing: boolean;
  progress_ms?: number;
  item?: SpotifyTrack;
  device?: SpotifyDevice;
  shuffle_state?: boolean;
  repeat_state?: string;
}

interface SpotifyCurrentlyPlaying {
  is_playing: boolean;
  item?: SpotifyTrack;
}

interface SpotifyQueue {
  queue?: SpotifyTrack[];
}

interface SpotifySearchResults {
  tracks?: { items: SpotifyTrack[] };
  albums?: { items: SpotifyAlbum[] };
  artists?: { items: SpotifyArtist[] };
  playlists?: { items: SpotifyPlaylistSimplified[] };
}

interface SpotifyPaginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
