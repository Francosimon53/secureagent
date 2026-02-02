/**
 * Music Control Integration - Shared Types
 *
 * Common type definitions for music control across Spotify, Sonos, Apple Music, and system audio
 */

/**
 * Playback state
 */
export type PlaybackState = 'playing' | 'paused' | 'stopped' | 'buffering';
export type RepeatMode = 'off' | 'track' | 'context';
export type ShuffleState = boolean;

/**
 * Music provider identifier
 */
export type MusicProvider = 'spotify' | 'sonos' | 'apple_music' | 'system';

/**
 * Track information
 */
export interface Track {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  duration: number; // milliseconds
  artworkUrl?: string;
  uri?: string; // Service-specific URI (e.g., spotify:track:xxx)
  provider: MusicProvider;
}

/**
 * Album information
 */
export interface Album {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  tracks: Track[];
  artworkUrl?: string;
  releaseDate?: string;
  provider: MusicProvider;
}

/**
 * Artist information
 */
export interface Artist {
  id: string;
  name: string;
  genres?: string[];
  imageUrl?: string;
  provider: MusicProvider;
}

/**
 * Playlist information
 */
export interface Playlist {
  id: string;
  name: string;
  description?: string;
  owner?: string;
  tracks: Track[];
  artworkUrl?: string;
  isPublic?: boolean;
  provider: MusicProvider;
}

/**
 * Playback device
 */
export interface PlaybackDevice {
  id: string;
  name: string;
  type: 'computer' | 'speaker' | 'tv' | 'phone' | 'tablet' | 'group';
  isActive: boolean;
  volume?: number;
  provider: MusicProvider;
}

/**
 * Sonos speaker (extends PlaybackDevice)
 */
export interface SonosSpeaker extends PlaybackDevice {
  ip: string;
  model: string;
  roomName: string;
  groupId?: string;
  isCoordinator: boolean;
}

/**
 * Sonos speaker group
 */
export interface SonosGroup {
  id: string;
  name: string;
  coordinator: SonosSpeaker;
  members: SonosSpeaker[];
}

/**
 * Current playback context
 */
export interface PlaybackContext {
  track: Track | null;
  position: number; // milliseconds
  state: PlaybackState;
  volume: number; // 0-100
  shuffle: ShuffleState;
  repeat: RepeatMode;
  device?: PlaybackDevice;
  queue?: Track[];
}

/**
 * Search results across music services
 */
export interface SearchResults {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
}

/**
 * Natural language command result
 */
export interface MusicCommandResult {
  success: boolean;
  action: string;
  message: string;
  data?: unknown;
}

/**
 * Play options for unified playback
 */
export interface PlayOptions {
  uri?: string;
  query?: string;
  device?: string;
  provider?: MusicProvider;
  position?: number;
  shuffle?: boolean;
}

/**
 * Search options
 */
export interface SearchOptions {
  provider?: MusicProvider;
  types?: ('track' | 'album' | 'artist' | 'playlist')[];
  limit?: number;
}

/**
 * Spotify OAuth tokens
 */
export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string[];
}

/**
 * Apple Music tokens
 */
export interface AppleMusicTokens {
  developerToken: string;
  userToken?: string;
}

/**
 * Music provider status
 */
export interface MusicProviderStatus {
  provider: MusicProvider;
  connected: boolean;
  deviceCount?: number;
  error?: string;
}

/**
 * System audio device
 */
export interface AudioDevice {
  id: string;
  name: string;
  type: 'output' | 'input';
  isDefault: boolean;
}

/**
 * Mood-based playback options
 */
export type MusicMood =
  | 'relaxing'
  | 'energetic'
  | 'focus'
  | 'happy'
  | 'sad'
  | 'romantic'
  | 'chill'
  | 'party';

/**
 * Activity-based playback options
 */
export type MusicActivity =
  | 'workout'
  | 'sleep'
  | 'party'
  | 'study'
  | 'cooking'
  | 'commute'
  | 'meditation';

/**
 * Music integration events
 */
export const MUSIC_EVENTS = {
  PLAYBACK_STARTED: 'music:playback_started',
  PLAYBACK_PAUSED: 'music:playback_paused',
  PLAYBACK_STOPPED: 'music:playback_stopped',
  TRACK_CHANGED: 'music:track_changed',
  VOLUME_CHANGED: 'music:volume_changed',
  DEVICE_CHANGED: 'music:device_changed',
  PROVIDER_CONNECTED: 'music:provider_connected',
  PROVIDER_DISCONNECTED: 'music:provider_disconnected',
  ERROR: 'music:error',
} as const;

export type MusicEventType = (typeof MUSIC_EVENTS)[keyof typeof MUSIC_EVENTS];

export interface MusicEvent {
  type: MusicEventType;
  provider: MusicProvider;
  timestamp: number;
  data?: unknown;
}

/**
 * Music error codes
 */
export const MUSIC_ERROR_CODES = {
  NOT_CONNECTED: 'MUSIC_001',
  PLAYBACK_FAILED: 'MUSIC_002',
  DEVICE_NOT_FOUND: 'MUSIC_003',
  SEARCH_FAILED: 'MUSIC_004',
  API_ERROR: 'MUSIC_005',
  AUTH_EXPIRED: 'MUSIC_006',
  RATE_LIMITED: 'MUSIC_007',
  PERMISSION_DENIED: 'MUSIC_008',
  PLATFORM_NOT_SUPPORTED: 'MUSIC_009',
  SONOS_DISCOVERY_FAILED: 'MUSIC_010',
} as const;

export type MusicErrorCode =
  (typeof MUSIC_ERROR_CODES)[keyof typeof MUSIC_ERROR_CODES];

/**
 * Music error class
 */
export class MusicError extends Error {
  constructor(
    message: string,
    public code: MusicErrorCode,
    public provider: MusicProvider,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'MusicError';
  }
}
