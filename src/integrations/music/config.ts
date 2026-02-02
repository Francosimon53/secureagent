/**
 * Music Control Integration - Configuration Schemas
 *
 * Zod schemas for validating music integration configurations
 */

import { z } from 'zod';

/**
 * Spotify OAuth configuration
 */
export const SpotifyConfigSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  redirectUri: z.string().default('/api/music/spotify/callback'),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenExpiry: z.number().optional(),
  scopes: z
    .array(z.string())
    .default([
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'playlist-read-private',
      'playlist-modify-public',
      'playlist-modify-private',
      'user-library-read',
      'user-library-modify',
    ]),
});

export type SpotifyConfig = z.infer<typeof SpotifyConfigSchema>;

/**
 * Sonos configuration
 */
export const SonosConfigSchema = z.object({
  enabled: z.boolean().default(true),
  autoDiscover: z.boolean().default(true),
  speakerIps: z.array(z.string()).optional(),
  defaultRoom: z.string().optional(),
  refreshInterval: z.number().default(30000), // 30 seconds
});

export type SonosConfig = z.infer<typeof SonosConfigSchema>;

/**
 * Apple Music configuration
 */
export const AppleMusicConfigSchema = z.object({
  developerToken: z.string().optional(),
  userToken: z.string().optional(),
  storefront: z.string().default('us'),
});

export type AppleMusicConfig = z.infer<typeof AppleMusicConfigSchema>;

/**
 * System audio control configuration
 */
export const AudioControlConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultDevice: z.string().optional(),
});

export type AudioControlConfig = z.infer<typeof AudioControlConfigSchema>;

/**
 * Complete music integration configuration
 */
export const MusicConfigSchema = z.object({
  enabled: z.boolean().default(true),
  spotify: SpotifyConfigSchema.optional(),
  sonos: SonosConfigSchema.optional(),
  appleMusic: AppleMusicConfigSchema.optional(),
  audioControl: AudioControlConfigSchema.optional(),
  defaultProvider: z
    .enum(['spotify', 'sonos', 'apple_music', 'system'])
    .default('spotify'),
});

export type MusicConfig = z.infer<typeof MusicConfigSchema>;

/**
 * Default music configuration
 */
export const DEFAULT_MUSIC_CONFIG: MusicConfig = {
  enabled: true,
  defaultProvider: 'spotify',
  sonos: {
    enabled: true,
    autoDiscover: true,
    refreshInterval: 30000,
  },
  audioControl: {
    enabled: true,
  },
};

/**
 * Validate music configuration
 */
export function validateMusicConfig(config: unknown): MusicConfig {
  return MusicConfigSchema.parse(config);
}

/**
 * Safe parse music configuration
 */
export function safeParseMusicConfig(config: unknown): {
  success: boolean;
  data?: MusicConfig;
  error?: z.ZodError;
} {
  const result = MusicConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Environment variable names for music integrations
 */
export const MUSIC_ENV_VARS = {
  // Spotify
  SPOTIFY_CLIENT_ID: 'SPOTIFY_CLIENT_ID',
  SPOTIFY_CLIENT_SECRET: 'SPOTIFY_CLIENT_SECRET',
  SPOTIFY_REDIRECT_URI: 'SPOTIFY_REDIRECT_URI',

  // Apple Music
  APPLE_MUSIC_DEVELOPER_TOKEN: 'APPLE_MUSIC_DEVELOPER_TOKEN',
  APPLE_MUSIC_USER_TOKEN: 'APPLE_MUSIC_USER_TOKEN',
  APPLE_MUSIC_STOREFRONT: 'APPLE_MUSIC_STOREFRONT',

  // Sonos (usually auto-discovered, but can specify IPs)
  SONOS_SPEAKER_IPS: 'SONOS_SPEAKER_IPS',
  SONOS_DEFAULT_ROOM: 'SONOS_DEFAULT_ROOM',
} as const;

/**
 * Load music configuration from environment variables
 */
export function loadMusicConfigFromEnv(): Partial<MusicConfig> {
  const config: Partial<MusicConfig> = {
    enabled: true,
    defaultProvider: 'spotify',
  };

  // Spotify
  const spotifyClientId = process.env[MUSIC_ENV_VARS.SPOTIFY_CLIENT_ID];
  const spotifyClientSecret = process.env[MUSIC_ENV_VARS.SPOTIFY_CLIENT_SECRET];
  if (spotifyClientId && spotifyClientSecret) {
    config.spotify = {
      clientId: spotifyClientId,
      clientSecret: spotifyClientSecret,
      redirectUri:
        process.env[MUSIC_ENV_VARS.SPOTIFY_REDIRECT_URI] ||
        '/api/music/spotify/callback',
      scopes: [
        'user-read-playback-state',
        'user-modify-playback-state',
        'user-read-currently-playing',
        'playlist-read-private',
        'playlist-modify-public',
        'playlist-modify-private',
        'user-library-read',
        'user-library-modify',
      ],
    };
  }

  // Apple Music
  const appleMusicToken = process.env[MUSIC_ENV_VARS.APPLE_MUSIC_DEVELOPER_TOKEN];
  if (appleMusicToken) {
    config.appleMusic = {
      developerToken: appleMusicToken,
      userToken: process.env[MUSIC_ENV_VARS.APPLE_MUSIC_USER_TOKEN],
      storefront: process.env[MUSIC_ENV_VARS.APPLE_MUSIC_STOREFRONT] || 'us',
    };
  }

  // Sonos
  const sonosSpeakerIps = process.env[MUSIC_ENV_VARS.SONOS_SPEAKER_IPS];
  config.sonos = {
    enabled: true,
    autoDiscover: !sonosSpeakerIps, // Auto-discover if no IPs specified
    speakerIps: sonosSpeakerIps?.split(',').map((ip) => ip.trim()),
    defaultRoom: process.env[MUSIC_ENV_VARS.SONOS_DEFAULT_ROOM],
    refreshInterval: 30000,
  };

  // Audio control (always enabled on supported platforms)
  config.audioControl = {
    enabled: true,
  };

  return config;
}

/**
 * Spotify OAuth scopes with descriptions
 */
export const SPOTIFY_SCOPES = {
  'user-read-playback-state': 'Read your current playback state',
  'user-modify-playback-state': 'Control playback on your devices',
  'user-read-currently-playing': 'Read your currently playing track',
  'playlist-read-private': 'Access your private playlists',
  'playlist-modify-public': 'Manage your public playlists',
  'playlist-modify-private': 'Manage your private playlists',
  'user-library-read': 'Access your saved tracks and albums',
  'user-library-modify': 'Manage your saved tracks and albums',
} as const;

/**
 * Get required Spotify scopes as array
 */
export function getSpotifyScopes(): string[] {
  return Object.keys(SPOTIFY_SCOPES);
}
