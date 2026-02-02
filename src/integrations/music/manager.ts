/**
 * Music Control Integration - Unified Manager
 *
 * Unified interface for controlling music across Spotify, Sonos, Apple Music, and system audio
 */

import type { MusicConfig } from './config.js';
import { DEFAULT_MUSIC_CONFIG } from './config.js';
import { SpotifyIntegration } from './spotify.js';
import { SonosIntegration } from './sonos.js';
import { AppleMusicIntegration } from './apple-music.js';
import { AudioControlIntegration } from './audio-control.js';
import type {
  MusicProvider,
  Track,
  Playlist,
  PlaybackContext,
  PlaybackDevice,
  SearchResults,
  MusicCommandResult,
  PlayOptions,
  SearchOptions,
  MusicProviderStatus,
  MusicMood,
  MusicActivity,
  SonosSpeaker,
  SonosGroup,
} from './types.js';
import { MusicError, MUSIC_ERROR_CODES, MUSIC_EVENTS } from './types.js';

/**
 * Unified Music Manager
 *
 * Provides a single interface to control music playback across multiple services:
 * - Spotify (streaming)
 * - Sonos (speakers)
 * - Apple Music (streaming)
 * - System Audio (volume control)
 */
export class MusicManager {
  private config: MusicConfig;
  private spotify: SpotifyIntegration | null = null;
  private sonos: SonosIntegration | null = null;
  private appleMusic: AppleMusicIntegration | null = null;
  private audioControl: AudioControlIntegration;
  private activeProvider: MusicProvider;
  private initialized = false;

  constructor(config: Partial<MusicConfig> = {}) {
    this.config = { ...DEFAULT_MUSIC_CONFIG, ...config };
    this.activeProvider = this.config.defaultProvider;

    // Initialize audio control (always available on macOS)
    this.audioControl = new AudioControlIntegration(
      this.config.audioControl || { enabled: true },
    );

    // Initialize configured providers
    if (this.config.spotify) {
      this.spotify = new SpotifyIntegration(this.config.spotify);
    }

    if (this.config.sonos) {
      this.sonos = new SonosIntegration(this.config.sonos);
    }

    if (this.config.appleMusic) {
      this.appleMusic = new AppleMusicIntegration(this.config.appleMusic);
    }
  }

  /**
   * Initialize all configured providers
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const initPromises: Promise<void>[] = [];

    // Initialize Sonos (requires network discovery)
    if (this.sonos) {
      initPromises.push(
        this.sonos.initialize().catch((err) => {
          console.warn('Failed to initialize Sonos:', err.message);
        }),
      );
    }

    await Promise.all(initPromises);
    this.initialized = true;
  }

  /**
   * Clean up and disconnect all providers
   */
  async disconnect(): Promise<void> {
    if (this.sonos) {
      await this.sonos.disconnect();
    }
    this.initialized = false;
  }

  // ==================== Provider Status ====================

  /**
   * Get status of all providers
   */
  getProviderStatus(): MusicProviderStatus[] {
    const statuses: MusicProviderStatus[] = [];

    if (this.spotify) {
      statuses.push({
        provider: 'spotify',
        connected: this.spotify.isConnected(),
      });
    }

    if (this.sonos) {
      const rooms = this.sonos.getRooms();
      statuses.push({
        provider: 'sonos',
        connected: this.sonos.isConnected(),
        deviceCount: rooms.length,
      });
    }

    if (this.appleMusic) {
      statuses.push({
        provider: 'apple_music',
        connected: this.appleMusic.isConnected(),
      });
    }

    statuses.push({
      provider: 'system',
      connected: this.audioControl.isEnabled(),
    });

    return statuses;
  }

  /**
   * Get active provider
   */
  getActiveProvider(): MusicProvider {
    return this.activeProvider;
  }

  /**
   * Set active provider
   */
  setActiveProvider(provider: MusicProvider): void {
    this.activeProvider = provider;
  }

  /**
   * Get provider integration instance
   */
  getProvider(provider: MusicProvider): SpotifyIntegration | SonosIntegration | AppleMusicIntegration | AudioControlIntegration | null {
    switch (provider) {
      case 'spotify':
        return this.spotify;
      case 'sonos':
        return this.sonos;
      case 'apple_music':
        return this.appleMusic;
      case 'system':
        return this.audioControl;
      default:
        return null;
    }
  }

  // ==================== Unified Playback Control ====================

  /**
   * Start or resume playback
   */
  async play(options?: PlayOptions): Promise<void> {
    const provider = options?.provider || this.activeProvider;

    switch (provider) {
      case 'spotify':
        if (!this.spotify?.isConnected()) {
          throw new MusicError(
            'Spotify not connected',
            MUSIC_ERROR_CODES.NOT_CONNECTED,
            'spotify',
          );
        }
        if (options?.query) {
          // Search and play first result
          const results = await this.spotify.search(options.query, ['track'], 1);
          if (results.tracks.length > 0) {
            await this.spotify.play({ uri: results.tracks[0].uri });
          }
        } else {
          await this.spotify.play({
            uri: options?.uri,
            deviceId: options?.device,
            positionMs: options?.position,
          });
        }
        break;

      case 'sonos':
        if (!this.sonos?.isConnected()) {
          throw new MusicError(
            'Sonos not connected',
            MUSIC_ERROR_CODES.NOT_CONNECTED,
            'sonos',
          );
        }
        if (options?.uri) {
          await this.sonos.playUri(options.uri, options.device);
        } else {
          await this.sonos.play(options?.device);
        }
        break;

      case 'apple_music':
        // Apple Music playback requires MusicKit in browser
        throw new MusicError(
          'Apple Music playback requires MusicKit JS in browser',
          MUSIC_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
          'apple_music',
        );

      case 'system':
        await this.audioControl.playPause();
        break;
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    switch (this.activeProvider) {
      case 'spotify':
        await this.spotify?.pause();
        break;
      case 'sonos':
        await this.sonos?.pause();
        break;
      case 'system':
        await this.audioControl.playPause();
        break;
    }
  }

  /**
   * Skip to next track
   */
  async next(): Promise<void> {
    switch (this.activeProvider) {
      case 'spotify':
        await this.spotify?.next();
        break;
      case 'sonos':
        await this.sonos?.next();
        break;
      case 'system':
        await this.audioControl.nextTrack();
        break;
    }
  }

  /**
   * Go to previous track
   */
  async previous(): Promise<void> {
    switch (this.activeProvider) {
      case 'spotify':
        await this.spotify?.previous();
        break;
      case 'sonos':
        await this.sonos?.previous();
        break;
      case 'system':
        await this.audioControl.previousTrack();
        break;
    }
  }

  /**
   * Seek to position in track (milliseconds)
   */
  async seek(position: number): Promise<void> {
    switch (this.activeProvider) {
      case 'spotify':
        await this.spotify?.seek(position);
        break;
      case 'sonos':
        await this.sonos?.seek(position);
        break;
    }
  }

  /**
   * Set volume (0-100)
   */
  async setVolume(level: number, device?: string): Promise<void> {
    const volume = Math.max(0, Math.min(100, Math.round(level)));

    switch (this.activeProvider) {
      case 'spotify':
        await this.spotify?.setVolume(volume);
        break;
      case 'sonos':
        await this.sonos?.setVolume(volume, device);
        break;
      case 'system':
        await this.audioControl.setVolume(volume);
        break;
    }
  }

  /**
   * Set shuffle state
   */
  async setShuffle(state: boolean): Promise<void> {
    if (this.activeProvider === 'spotify') {
      await this.spotify?.setShuffle(state);
    }
  }

  /**
   * Set repeat mode
   */
  async setRepeat(mode: 'off' | 'track' | 'context'): Promise<void> {
    if (this.activeProvider === 'spotify') {
      await this.spotify?.setRepeat(mode);
    }
  }

  // ==================== Playback State ====================

  /**
   * Get current playback state
   */
  async getPlayback(): Promise<PlaybackContext | null> {
    switch (this.activeProvider) {
      case 'spotify':
        return this.spotify?.getPlayback() || null;
      case 'sonos':
        return this.sonos?.getPlayback() || null;
      default:
        return null;
    }
  }

  /**
   * Get current queue
   */
  async getQueue(): Promise<Track[]> {
    if (this.activeProvider === 'spotify' && this.spotify) {
      return this.spotify.getQueue();
    }
    return [];
  }

  /**
   * Add track to queue
   */
  async addToQueue(uri: string): Promise<void> {
    if (this.activeProvider === 'spotify' && this.spotify) {
      await this.spotify.addToQueue(uri);
    }
  }

  // ==================== Search ====================

  /**
   * Search for music
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResults> {
    const provider = options?.provider || this.activeProvider;
    const types = options?.types || ['track', 'album', 'artist', 'playlist'];
    const limit = options?.limit || 20;

    switch (provider) {
      case 'spotify':
        if (this.spotify?.isConnected()) {
          return this.spotify.search(query, types, limit);
        }
        break;

      case 'apple_music':
        if (this.appleMusic?.isConnected()) {
          const appleTypes = types.map((t) =>
            t === 'track' ? 'songs' : t === 'playlist' ? 'playlists' : t,
          ) as ('songs' | 'albums' | 'artists' | 'playlists')[];
          return this.appleMusic.search(query, appleTypes, limit);
        }
        break;
    }

    return { tracks: [], albums: [], artists: [], playlists: [] };
  }

  // ==================== Device Management ====================

  /**
   * Get all available devices across providers
   */
  async getDevices(): Promise<PlaybackDevice[]> {
    const devices: PlaybackDevice[] = [];

    // Spotify devices
    if (this.spotify?.isConnected()) {
      try {
        const spotifyDevices = await this.spotify.getDevices();
        devices.push(...spotifyDevices);
      } catch {
        // Ignore errors
      }
    }

    // Sonos rooms
    if (this.sonos?.isConnected()) {
      const rooms = this.sonos.getRooms();
      devices.push(...rooms);
    }

    return devices;
  }

  /**
   * Set active playback device
   */
  async setActiveDevice(deviceId: string, provider?: MusicProvider): Promise<void> {
    const targetProvider = provider || this.activeProvider;

    switch (targetProvider) {
      case 'spotify':
        if (this.spotify?.isConnected()) {
          await this.spotify.transferPlayback(deviceId);
        }
        break;
      case 'system':
        await this.audioControl.setOutputDevice(deviceId);
        break;
    }
  }

  // ==================== Playlist Management ====================

  /**
   * Get user's playlists
   */
  async getPlaylists(provider?: MusicProvider): Promise<Playlist[]> {
    const targetProvider = provider || this.activeProvider;

    switch (targetProvider) {
      case 'spotify':
        if (this.spotify?.isConnected()) {
          return this.spotify.getPlaylists();
        }
        break;
      case 'apple_music':
        if (this.appleMusic?.isUserAuthenticated()) {
          return this.appleMusic.getLibraryPlaylists();
        }
        break;
    }

    return [];
  }

  /**
   * Play a playlist
   */
  async playPlaylist(playlistId: string, provider?: MusicProvider): Promise<void> {
    const targetProvider = provider || this.activeProvider;

    if (targetProvider === 'spotify' && this.spotify?.isConnected()) {
      await this.spotify.play({ contextUri: `spotify:playlist:${playlistId}` });
    }
  }

  /**
   * Create a new playlist
   */
  async createPlaylist(
    name: string,
    options?: { description?: string; isPublic?: boolean },
    provider?: MusicProvider,
  ): Promise<Playlist | null> {
    const targetProvider = provider || this.activeProvider;

    switch (targetProvider) {
      case 'spotify':
        if (this.spotify?.isConnected()) {
          return this.spotify.createPlaylist(name, options);
        }
        break;
      case 'apple_music':
        if (this.appleMusic?.isUserAuthenticated()) {
          return this.appleMusic.createPlaylist(name, options);
        }
        break;
    }

    return null;
  }

  // ==================== Sonos Specific ====================

  /**
   * Get Sonos rooms
   */
  getSonosRooms(): SonosSpeaker[] {
    return this.sonos?.getRooms() || [];
  }

  /**
   * Get Sonos groups
   */
  getSonosGroups(): SonosGroup[] {
    return this.sonos?.getGroups() || [];
  }

  /**
   * Group Sonos speakers
   */
  async groupSonosSpeakers(coordinatorRoom: string, memberRooms: string[]): Promise<void> {
    if (this.sonos) {
      await this.sonos.groupSpeakers(coordinatorRoom, memberRooms);
    }
  }

  /**
   * Ungroup Sonos speaker
   */
  async ungroupSonosSpeaker(room: string): Promise<void> {
    if (this.sonos) {
      await this.sonos.ungroupSpeaker(room);
    }
  }

  /**
   * Play Sonos favorite
   */
  async playSonosFavorite(name: string, room?: string): Promise<void> {
    if (this.sonos) {
      await this.sonos.playFavorite(name, room);
    }
  }

  /**
   * Get Sonos favorites
   */
  async getSonosFavorites(): Promise<{ id: string; title: string; uri: string }[]> {
    return this.sonos?.getFavorites() || [];
  }

  // ==================== System Audio ====================

  /**
   * Get system volume
   */
  async getSystemVolume(): Promise<number> {
    return this.audioControl.getVolume();
  }

  /**
   * Set system volume
   */
  async setSystemVolume(level: number): Promise<void> {
    await this.audioControl.setVolume(level);
  }

  /**
   * Toggle system mute
   */
  async toggleMute(): Promise<boolean> {
    return this.audioControl.toggleMute();
  }

  /**
   * Get system audio state
   */
  async getSystemAudioState(): Promise<{
    volume: number;
    muted: boolean;
  }> {
    const state = await this.audioControl.getState();
    return { volume: state.volume, muted: state.muted };
  }

  // ==================== Natural Language Commands ====================

  /**
   * Execute a natural language music command
   */
  async executeCommand(command: string): Promise<MusicCommandResult> {
    const lowerCommand = command.toLowerCase().trim();

    try {
      // Play/Resume
      if (/^(play|resume|start)( music)?$/i.test(lowerCommand)) {
        await this.play();
        return { success: true, action: 'play', message: 'Playing music' };
      }

      // Pause
      if (/^(pause|stop)( the)?( music)?$/i.test(lowerCommand)) {
        await this.pause();
        return { success: true, action: 'pause', message: 'Music paused' };
      }

      // Skip/Next
      if (/^(skip|next)( this)?( song| track)?$/i.test(lowerCommand)) {
        await this.next();
        return { success: true, action: 'next', message: 'Skipped to next track' };
      }

      // Previous/Back
      if (/^(previous|back|go back)( track| song)?$/i.test(lowerCommand)) {
        await this.previous();
        return { success: true, action: 'previous', message: 'Going to previous track' };
      }

      // Volume up
      if (/^(turn it up|louder|volume up|increase volume)$/i.test(lowerCommand)) {
        const current = await this.audioControl.increaseVolume(10);
        return { success: true, action: 'volume_up', message: `Volume: ${current}%` };
      }

      // Volume down
      if (/^(turn it down|quieter|volume down|decrease volume)$/i.test(lowerCommand)) {
        const current = await this.audioControl.decreaseVolume(10);
        return { success: true, action: 'volume_down', message: `Volume: ${current}%` };
      }

      // Set volume
      const volumeMatch = lowerCommand.match(/^set volume to (\d+)%?$/i);
      if (volumeMatch) {
        const level = parseInt(volumeMatch[1], 10);
        await this.setVolume(level);
        return { success: true, action: 'set_volume', message: `Volume set to ${level}%` };
      }

      // Mute
      if (/^mute$/i.test(lowerCommand)) {
        await this.audioControl.mute();
        return { success: true, action: 'mute', message: 'Audio muted' };
      }

      // Unmute
      if (/^unmute$/i.test(lowerCommand)) {
        await this.audioControl.unmute();
        return { success: true, action: 'unmute', message: 'Audio unmuted' };
      }

      // Shuffle
      if (/^shuffle( on| my music)?$/i.test(lowerCommand)) {
        await this.setShuffle(true);
        return { success: true, action: 'shuffle', message: 'Shuffle enabled' };
      }

      // What's playing
      if (/^what('s| is)( this)?( song| playing| the song)?(\?)?$/i.test(lowerCommand)) {
        const playback = await this.getPlayback();
        if (playback?.track) {
          return {
            success: true,
            action: 'now_playing',
            message: `Now playing: ${playback.track.name} by ${playback.track.artist}`,
            data: playback.track,
          };
        }
        return { success: true, action: 'now_playing', message: 'Nothing is playing' };
      }

      // Play in room (Sonos)
      const roomMatch = lowerCommand.match(/^play in(?: the)? (.+)$/i);
      if (roomMatch && this.sonos) {
        const room = roomMatch[1];
        await this.sonos.play(room);
        return { success: true, action: 'play_room', message: `Playing in ${room}` };
      }

      // Play search query
      const playMatch = lowerCommand.match(/^play (.+)$/i);
      if (playMatch) {
        const query = playMatch[1];
        await this.play({ query });
        return { success: true, action: 'play_search', message: `Playing: ${query}` };
      }

      // Unrecognized command
      return {
        success: false,
        action: 'unknown',
        message: `Unknown command: ${command}`,
      };
    } catch (error) {
      return {
        success: false,
        action: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==================== Mood/Activity Playback ====================

  /**
   * Play music for a mood
   */
  async playMood(mood: MusicMood): Promise<void> {
    const moodQueries: Record<MusicMood, string> = {
      relaxing: 'relaxing chill ambient',
      energetic: 'energetic upbeat workout',
      focus: 'focus concentration instrumental',
      happy: 'happy uplifting feel good',
      sad: 'sad melancholy emotional',
      romantic: 'romantic love songs',
      chill: 'chill vibes lofi',
      party: 'party dance hits',
    };

    const query = moodQueries[mood] || mood;
    await this.play({ query });
  }

  /**
   * Play music for an activity
   */
  async playActivity(activity: MusicActivity): Promise<void> {
    const activityQueries: Record<MusicActivity, string> = {
      workout: 'workout pump up gym',
      sleep: 'sleep ambient relaxing',
      party: 'party dance club hits',
      study: 'study focus instrumental lofi',
      cooking: 'cooking dinner jazz',
      commute: 'driving commute mix',
      meditation: 'meditation zen peaceful',
    };

    const query = activityQueries[activity] || activity;
    await this.play({ query });
  }
}

// Singleton instance
let musicManagerInstance: MusicManager | null = null;

/**
 * Initialize the music manager singleton
 */
export function initMusicManager(config?: Partial<MusicConfig>): MusicManager {
  if (!musicManagerInstance) {
    musicManagerInstance = new MusicManager(config);
  }
  return musicManagerInstance;
}

/**
 * Get the music manager singleton
 */
export function getMusicManager(): MusicManager {
  if (!musicManagerInstance) {
    musicManagerInstance = new MusicManager();
  }
  return musicManagerInstance;
}
