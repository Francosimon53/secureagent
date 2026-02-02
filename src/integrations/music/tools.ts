/**
 * Music Control Integration - AI Agent Tools
 *
 * Tool definitions for AI agents to control music playback
 */

import type { ToolDefinition, ToolParameter, ToolResult } from '../types.js';
import { getMusicManager } from './manager.js';
import type { MusicProvider, MusicMood, MusicActivity } from './types.js';

/**
 * Create a music tool definition
 */
function createMusicTool(
  name: string,
  description: string,
  parameters: ToolParameter[],
  riskLevel: ToolDefinition['riskLevel'],
  execute: (params: Record<string, unknown>) => Promise<ToolResult>,
): ToolDefinition {
  return {
    name: `music_${name}`,
    description,
    parameters,
    riskLevel,
    execute,
  };
}

/**
 * Get all music control tools
 */
export function getMusicTools(): ToolDefinition[] {
  return [
    // ==================== Playback Control ====================

    createMusicTool(
      'play',
      'Start or resume music playback. Can play a specific song/artist/album by search query, or resume current playback.',
      [
        {
          name: 'query',
          type: 'string',
          description: 'Search query to find and play music (e.g., "Bohemian Rhapsody", "The Beatles", "jazz music")',
          required: false,
        },
        {
          name: 'uri',
          type: 'string',
          description: 'Specific track/playlist URI to play (e.g., spotify:track:xxx)',
          required: false,
        },
        {
          name: 'device',
          type: 'string',
          description: 'Device or room name to play on',
          required: false,
        },
        {
          name: 'provider',
          type: 'string',
          description: 'Music provider to use',
          required: false,
          enum: ['spotify', 'sonos', 'apple_music', 'system'],
        },
      ],
      'low',
      async (params) => {
        try {
          const manager = getMusicManager();
          await manager.play({
            query: params.query as string | undefined,
            uri: params.uri as string | undefined,
            device: params.device as string | undefined,
            provider: params.provider as MusicProvider | undefined,
          });
          return {
            success: true,
            data: { message: params.query ? `Playing: ${params.query}` : 'Playback started' },
          };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to play' };
        }
      },
    ),

    createMusicTool(
      'pause',
      'Pause music playback',
      [],
      'low',
      async () => {
        try {
          const manager = getMusicManager();
          await manager.pause();
          return { success: true, data: { message: 'Playback paused' } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to pause' };
        }
      },
    ),

    createMusicTool(
      'next',
      'Skip to the next track',
      [],
      'low',
      async () => {
        try {
          const manager = getMusicManager();
          await manager.next();
          return { success: true, data: { message: 'Skipped to next track' } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to skip' };
        }
      },
    ),

    createMusicTool(
      'previous',
      'Go to the previous track',
      [],
      'low',
      async () => {
        try {
          const manager = getMusicManager();
          await manager.previous();
          return { success: true, data: { message: 'Going to previous track' } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to go back' };
        }
      },
    ),

    createMusicTool(
      'volume',
      'Set the volume level (0-100)',
      [
        {
          name: 'level',
          type: 'number',
          description: 'Volume level from 0 to 100',
          required: true,
        },
        {
          name: 'device',
          type: 'string',
          description: 'Specific device or room to set volume for',
          required: false,
        },
      ],
      'low',
      async (params) => {
        try {
          const manager = getMusicManager();
          const level = params.level as number;
          await manager.setVolume(level, params.device as string | undefined);
          return { success: true, data: { message: `Volume set to ${level}%`, volume: level } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to set volume' };
        }
      },
    ),

    // ==================== Information ====================

    createMusicTool(
      'now_playing',
      'Get information about the currently playing track',
      [],
      'low',
      async () => {
        try {
          const manager = getMusicManager();
          const playback = await manager.getPlayback();
          if (playback?.track) {
            return {
              success: true,
              data: {
                track: playback.track,
                position: playback.position,
                state: playback.state,
                volume: playback.volume,
                shuffle: playback.shuffle,
                repeat: playback.repeat,
              },
            };
          }
          return { success: true, data: { message: 'Nothing is currently playing' } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to get playback' };
        }
      },
    ),

    createMusicTool(
      'search',
      'Search for music (tracks, albums, artists, playlists)',
      [
        {
          name: 'query',
          type: 'string',
          description: 'Search query',
          required: true,
        },
        {
          name: 'types',
          type: 'array',
          description: 'Types to search for',
          required: false,
          enum: ['track', 'album', 'artist', 'playlist'],
        },
        {
          name: 'limit',
          type: 'number',
          description: 'Maximum results per type (default: 10)',
          required: false,
        },
      ],
      'low',
      async (params) => {
        try {
          const manager = getMusicManager();
          const results = await manager.search(params.query as string, {
            types: params.types as ('track' | 'album' | 'artist' | 'playlist')[] | undefined,
            limit: (params.limit as number) || 10,
          });
          return { success: true, data: results };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Search failed' };
        }
      },
    ),

    // ==================== Device Management ====================

    createMusicTool(
      'devices',
      'List available playback devices (speakers, phones, computers)',
      [],
      'low',
      async () => {
        try {
          const manager = getMusicManager();
          const devices = await manager.getDevices();
          return { success: true, data: { devices } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to get devices' };
        }
      },
    ),

    createMusicTool(
      'set_device',
      'Switch playback to a different device',
      [
        {
          name: 'device_id',
          type: 'string',
          description: 'ID or name of the device to switch to',
          required: true,
        },
      ],
      'low',
      async (params) => {
        try {
          const manager = getMusicManager();
          await manager.setActiveDevice(params.device_id as string);
          return { success: true, data: { message: `Switched to device: ${params.device_id}` } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to switch device' };
        }
      },
    ),

    // ==================== Queue Management ====================

    createMusicTool(
      'queue',
      'View current queue or add a track to the queue',
      [
        {
          name: 'action',
          type: 'string',
          description: 'Action to perform: "view" or "add"',
          required: true,
          enum: ['view', 'add'],
        },
        {
          name: 'uri',
          type: 'string',
          description: 'Track URI to add (required for "add" action)',
          required: false,
        },
      ],
      'low',
      async (params) => {
        try {
          const manager = getMusicManager();
          if (params.action === 'add' && params.uri) {
            await manager.addToQueue(params.uri as string);
            return { success: true, data: { message: 'Track added to queue' } };
          } else {
            const queue = await manager.getQueue();
            return { success: true, data: { queue } };
          }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Queue operation failed' };
        }
      },
    ),

    // ==================== Playlist Management ====================

    createMusicTool(
      'playlists',
      'List user playlists',
      [
        {
          name: 'provider',
          type: 'string',
          description: 'Music provider',
          required: false,
          enum: ['spotify', 'apple_music'],
        },
      ],
      'low',
      async (params) => {
        try {
          const manager = getMusicManager();
          const playlists = await manager.getPlaylists(params.provider as MusicProvider | undefined);
          return { success: true, data: { playlists } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to get playlists' };
        }
      },
    ),

    createMusicTool(
      'play_playlist',
      'Play a specific playlist',
      [
        {
          name: 'playlist_id',
          type: 'string',
          description: 'Playlist ID to play',
          required: true,
        },
      ],
      'low',
      async (params) => {
        try {
          const manager = getMusicManager();
          await manager.playPlaylist(params.playlist_id as string);
          return { success: true, data: { message: 'Playing playlist' } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to play playlist' };
        }
      },
    ),

    createMusicTool(
      'save_track',
      'Save the current track to your library/liked songs',
      [],
      'medium',
      async () => {
        try {
          const manager = getMusicManager();
          const playback = await manager.getPlayback();
          if (!playback?.track) {
            return { success: false, error: 'No track is currently playing' };
          }

          const spotify = manager.getProvider('spotify');
          if (spotify && 'saveTrack' in spotify) {
            await (spotify as { saveTrack: (id: string) => Promise<void> }).saveTrack(playback.track.id);
            return { success: true, data: { message: `Saved: ${playback.track.name}` } };
          }

          return { success: false, error: 'Save not supported on current provider' };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to save track' };
        }
      },
    ),

    createMusicTool(
      'create_playlist',
      'Create a new playlist',
      [
        {
          name: 'name',
          type: 'string',
          description: 'Name for the new playlist',
          required: true,
        },
        {
          name: 'description',
          type: 'string',
          description: 'Description for the playlist',
          required: false,
        },
        {
          name: 'public',
          type: 'boolean',
          description: 'Whether the playlist should be public',
          required: false,
          default: false,
        },
      ],
      'medium',
      async (params) => {
        try {
          const manager = getMusicManager();
          const playlist = await manager.createPlaylist(params.name as string, {
            description: params.description as string | undefined,
            isPublic: params.public as boolean | undefined,
          });
          if (playlist) {
            return { success: true, data: { playlist } };
          }
          return { success: false, error: 'Failed to create playlist' };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to create playlist' };
        }
      },
    ),

    // ==================== Sonos Specific ====================

    createMusicTool(
      'sonos_rooms',
      'List Sonos rooms/speakers on the network',
      [],
      'low',
      async () => {
        try {
          const manager = getMusicManager();
          const rooms = manager.getSonosRooms();
          const groups = manager.getSonosGroups();
          return { success: true, data: { rooms, groups } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to get Sonos rooms' };
        }
      },
    ),

    createMusicTool(
      'sonos_group',
      'Group or ungroup Sonos speakers',
      [
        {
          name: 'action',
          type: 'string',
          description: 'Action: "group" to group speakers, "ungroup" to separate a speaker',
          required: true,
          enum: ['group', 'ungroup'],
        },
        {
          name: 'coordinator',
          type: 'string',
          description: 'Room name of the coordinator (for group action)',
          required: false,
        },
        {
          name: 'members',
          type: 'array',
          description: 'Room names to add to the group',
          required: false,
        },
        {
          name: 'room',
          type: 'string',
          description: 'Room name to ungroup (for ungroup action)',
          required: false,
        },
      ],
      'medium',
      async (params) => {
        try {
          const manager = getMusicManager();

          if (params.action === 'group') {
            if (!params.coordinator || !params.members) {
              return { success: false, error: 'Coordinator and members required for grouping' };
            }
            await manager.groupSonosSpeakers(
              params.coordinator as string,
              params.members as string[],
            );
            return { success: true, data: { message: 'Speakers grouped' } };
          } else if (params.action === 'ungroup') {
            if (!params.room) {
              return { success: false, error: 'Room name required for ungrouping' };
            }
            await manager.ungroupSonosSpeaker(params.room as string);
            return { success: true, data: { message: `${params.room} ungrouped` } };
          }

          return { success: false, error: 'Invalid action' };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Group operation failed' };
        }
      },
    ),

    // ==================== System Audio ====================

    createMusicTool(
      'system_audio',
      'Control system audio (volume, mute, output device)',
      [
        {
          name: 'action',
          type: 'string',
          description: 'Action to perform',
          required: true,
          enum: ['get_volume', 'set_volume', 'mute', 'unmute', 'toggle_mute', 'get_devices', 'set_device'],
        },
        {
          name: 'value',
          type: 'number',
          description: 'Volume level (0-100) for set_volume action',
          required: false,
        },
        {
          name: 'device',
          type: 'string',
          description: 'Device name for set_device action',
          required: false,
        },
      ],
      'low',
      async (params) => {
        try {
          const manager = getMusicManager();
          const action = params.action as string;

          switch (action) {
            case 'get_volume': {
              const volume = await manager.getSystemVolume();
              return { success: true, data: { volume } };
            }
            case 'set_volume': {
              const level = params.value as number;
              if (level === undefined) {
                return { success: false, error: 'Volume level required' };
              }
              await manager.setSystemVolume(level);
              return { success: true, data: { message: `Volume set to ${level}%`, volume: level } };
            }
            case 'mute': {
              const audioControl = manager.getProvider('system');
              if (audioControl && 'mute' in audioControl) {
                await (audioControl as { mute: () => Promise<void> }).mute();
              }
              return { success: true, data: { message: 'Audio muted', muted: true } };
            }
            case 'unmute': {
              const audioControl = manager.getProvider('system');
              if (audioControl && 'unmute' in audioControl) {
                await (audioControl as { unmute: () => Promise<void> }).unmute();
              }
              return { success: true, data: { message: 'Audio unmuted', muted: false } };
            }
            case 'toggle_mute': {
              const muted = await manager.toggleMute();
              return { success: true, data: { message: muted ? 'Audio muted' : 'Audio unmuted', muted } };
            }
            case 'get_devices': {
              const audioControl = manager.getProvider('system');
              if (audioControl && 'getOutputDevices' in audioControl) {
                const devices = await (audioControl as { getOutputDevices: () => Promise<unknown[]> }).getOutputDevices();
                return { success: true, data: { devices } };
              }
              return { success: false, error: 'Device listing not available' };
            }
            case 'set_device': {
              if (!params.device) {
                return { success: false, error: 'Device name required' };
              }
              await manager.setActiveDevice(params.device as string, 'system');
              return { success: true, data: { message: `Output set to: ${params.device}` } };
            }
            default:
              return { success: false, error: `Unknown action: ${action}` };
          }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'System audio operation failed' };
        }
      },
    ),

    // ==================== Mood/Activity ====================

    createMusicTool(
      'play_mood',
      'Play music matching a mood',
      [
        {
          name: 'mood',
          type: 'string',
          description: 'Mood to play music for',
          required: true,
          enum: ['relaxing', 'energetic', 'focus', 'happy', 'sad', 'romantic', 'chill', 'party'],
        },
      ],
      'low',
      async (params) => {
        try {
          const manager = getMusicManager();
          await manager.playMood(params.mood as MusicMood);
          return { success: true, data: { message: `Playing ${params.mood} music` } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to play mood' };
        }
      },
    ),

    createMusicTool(
      'play_activity',
      'Play music suited for an activity',
      [
        {
          name: 'activity',
          type: 'string',
          description: 'Activity to play music for',
          required: true,
          enum: ['workout', 'sleep', 'party', 'study', 'cooking', 'commute', 'meditation'],
        },
      ],
      'low',
      async (params) => {
        try {
          const manager = getMusicManager();
          await manager.playActivity(params.activity as MusicActivity);
          return { success: true, data: { message: `Playing music for ${params.activity}` } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to play activity music' };
        }
      },
    ),

    // ==================== Natural Language ====================

    createMusicTool(
      'command',
      'Execute a natural language music command',
      [
        {
          name: 'command',
          type: 'string',
          description: 'Natural language command (e.g., "play some jazz", "skip this song", "turn it up")',
          required: true,
        },
      ],
      'low',
      async (params) => {
        try {
          const manager = getMusicManager();
          const result = await manager.executeCommand(params.command as string);
          return { success: result.success, data: result, error: result.success ? undefined : result.message };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Command failed' };
        }
      },
    ),
  ];
}

/**
 * Get music tools as a record for easy lookup
 */
export function getMusicToolsMap(): Record<string, ToolDefinition> {
  const tools = getMusicTools();
  const map: Record<string, ToolDefinition> = {};
  for (const tool of tools) {
    map[tool.name] = tool;
  }
  return map;
}
