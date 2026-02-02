/**
 * Music Control Integration
 *
 * Unified music control for Spotify, Sonos, Apple Music, and system audio
 *
 * @module integrations/music
 */

// Types
export type {
  PlaybackState,
  RepeatMode,
  ShuffleState,
  MusicProvider,
  Track,
  Album,
  Artist,
  Playlist,
  PlaybackDevice,
  SonosSpeaker,
  SonosGroup,
  PlaybackContext,
  SearchResults,
  MusicCommandResult,
  PlayOptions,
  SearchOptions,
  SpotifyTokens,
  AppleMusicTokens,
  MusicProviderStatus,
  AudioDevice,
  MusicMood,
  MusicActivity,
  MusicEventType,
  MusicEvent,
  MusicErrorCode,
} from './types.js';

export { MusicError, MUSIC_EVENTS, MUSIC_ERROR_CODES } from './types.js';

// Configuration
export type {
  SpotifyConfig,
  SonosConfig,
  AppleMusicConfig,
  AudioControlConfig,
  MusicConfig,
} from './config.js';

export {
  SpotifyConfigSchema,
  SonosConfigSchema,
  AppleMusicConfigSchema,
  AudioControlConfigSchema,
  MusicConfigSchema,
  DEFAULT_MUSIC_CONFIG,
  validateMusicConfig,
  safeParseMusicConfig,
  MUSIC_ENV_VARS,
  loadMusicConfigFromEnv,
  SPOTIFY_SCOPES,
  getSpotifyScopes,
} from './config.js';

// Integrations
export { SpotifyIntegration } from './spotify.js';
export { SonosIntegration } from './sonos.js';
export { AppleMusicIntegration } from './apple-music.js';
export { AudioControlIntegration, createAudioControl } from './audio-control.js';

// Manager
export { MusicManager, initMusicManager, getMusicManager } from './manager.js';

// AI Agent Tools
export { getMusicTools, getMusicToolsMap } from './tools.js';
