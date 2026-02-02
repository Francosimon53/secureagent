import { NextRequest, NextResponse } from 'next/server';

/**
 * Music API - Playback Control
 *
 * GET /api/music/playback - Get current playback state
 * POST /api/music/playback - Control playback (play, pause, next, previous, seek, volume)
 */

// Mock playback state (in production, this would come from actual music providers)
let playbackState = {
  track: null as {
    id: string;
    name: string;
    artist: string;
    album: string;
    duration: number;
    artworkUrl?: string;
    uri?: string;
    provider: string;
  } | null,
  position: 0,
  state: 'stopped' as 'playing' | 'paused' | 'stopped' | 'buffering',
  volume: 50,
  shuffle: false,
  repeat: 'off' as 'off' | 'track' | 'context',
  device: null as {
    id: string;
    name: string;
    type: string;
    isActive: boolean;
  } | null,
};

/**
 * GET /api/music/playback
 *
 * Get current playback state
 */
export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      playback: playbackState.track ? playbackState : null,
    });
  } catch (error) {
    console.error('Failed to get playback:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get playback state',
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/music/playback
 *
 * Control playback
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    if (!action) {
      return NextResponse.json(
        {
          success: false,
          error: 'Action is required',
        },
        { status: 400 },
      );
    }

    let result: { success: boolean; message: string; data?: unknown };

    switch (action) {
      case 'play':
        result = await handlePlay(params);
        break;
      case 'pause':
        result = handlePause();
        break;
      case 'next':
        result = handleNext();
        break;
      case 'previous':
        result = handlePrevious();
        break;
      case 'seek':
        result = handleSeek(params.position);
        break;
      case 'volume':
        result = handleVolume(params.level);
        break;
      case 'shuffle':
        result = handleShuffle(params.state);
        break;
      case 'repeat':
        result = handleRepeat(params.mode);
        break;
      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown action: ${action}`,
          },
          { status: 400 },
        );
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      data: result.data,
      playback: playbackState,
    });
  } catch (error) {
    console.error('Playback control failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Playback control failed',
      },
      { status: 500 },
    );
  }
}

/**
 * Handle play action
 */
async function handlePlay(params: {
  uri?: string;
  query?: string;
  deviceId?: string;
}): Promise<{ success: boolean; message: string; data?: unknown }> {
  // In production, this would call the actual Spotify/Sonos/Apple Music API

  if (params.query) {
    // Search and play - mock response
    playbackState.track = {
      id: 'mock-track-id',
      name: params.query,
      artist: 'Search Result',
      album: 'Mock Album',
      duration: 180000,
      provider: 'spotify',
    };
    playbackState.state = 'playing';
    playbackState.position = 0;

    return {
      success: true,
      message: `Playing: ${params.query}`,
      data: { track: playbackState.track },
    };
  }

  if (params.uri) {
    // Play specific URI
    playbackState.state = 'playing';
    return {
      success: true,
      message: 'Playing from URI',
    };
  }

  // Resume playback
  if (playbackState.track) {
    playbackState.state = 'playing';
    return {
      success: true,
      message: 'Playback resumed',
    };
  }

  return {
    success: false,
    message: 'Nothing to play',
  };
}

/**
 * Handle pause action
 */
function handlePause(): { success: boolean; message: string } {
  playbackState.state = 'paused';
  return {
    success: true,
    message: 'Playback paused',
  };
}

/**
 * Handle next track
 */
function handleNext(): { success: boolean; message: string } {
  // In production, this would advance to the next track in queue
  playbackState.position = 0;
  return {
    success: true,
    message: 'Skipped to next track',
  };
}

/**
 * Handle previous track
 */
function handlePrevious(): { success: boolean; message: string } {
  // If more than 3 seconds in, restart current track
  if (playbackState.position > 3000) {
    playbackState.position = 0;
    return {
      success: true,
      message: 'Restarted current track',
    };
  }

  // Otherwise go to previous
  playbackState.position = 0;
  return {
    success: true,
    message: 'Going to previous track',
  };
}

/**
 * Handle seek
 */
function handleSeek(position: number): { success: boolean; message: string; data?: unknown } {
  if (typeof position !== 'number') {
    return {
      success: false,
      message: 'Position is required',
    };
  }

  playbackState.position = Math.max(0, Math.min(position, playbackState.track?.duration || 0));
  return {
    success: true,
    message: `Seeked to ${Math.floor(position / 1000)}s`,
    data: { position: playbackState.position },
  };
}

/**
 * Handle volume change
 */
function handleVolume(level: number): { success: boolean; message: string; data?: unknown } {
  if (typeof level !== 'number') {
    return {
      success: false,
      message: 'Volume level is required',
    };
  }

  playbackState.volume = Math.max(0, Math.min(100, Math.round(level)));
  return {
    success: true,
    message: `Volume set to ${playbackState.volume}%`,
    data: { volume: playbackState.volume },
  };
}

/**
 * Handle shuffle toggle
 */
function handleShuffle(state: boolean): { success: boolean; message: string; data?: unknown } {
  playbackState.shuffle = !!state;
  return {
    success: true,
    message: `Shuffle ${playbackState.shuffle ? 'enabled' : 'disabled'}`,
    data: { shuffle: playbackState.shuffle },
  };
}

/**
 * Handle repeat mode
 */
function handleRepeat(
  mode: 'off' | 'track' | 'context',
): { success: boolean; message: string; data?: unknown } {
  if (!['off', 'track', 'context'].includes(mode)) {
    return {
      success: false,
      message: 'Invalid repeat mode',
    };
  }

  playbackState.repeat = mode;
  return {
    success: true,
    message: `Repeat: ${mode}`,
    data: { repeat: playbackState.repeat },
  };
}

/**
 * Update playback state (for use by other modules)
 */
export function setPlaybackState(update: Partial<typeof playbackState>) {
  playbackState = { ...playbackState, ...update };
}

/**
 * Get current playback state
 */
export function getPlaybackState() {
  return playbackState;
}
