import { NextRequest, NextResponse } from 'next/server';

/**
 * Music API - Main Status & Command Endpoint
 *
 * GET /api/music - Get music integration status
 * POST /api/music - Execute a music command
 */

// In-memory state (in production, use a proper state management solution)
let musicState = {
  spotify: {
    connected: false,
    accessToken: null as string | null,
    refreshToken: null as string | null,
    tokenExpiry: null as number | null,
  },
  sonos: {
    connected: false,
    speakerCount: 0,
  },
  appleMusic: {
    connected: false,
  },
  system: {
    connected: true, // Always available on supported platforms
  },
  activeProvider: 'spotify' as 'spotify' | 'sonos' | 'apple_music' | 'system',
};

/**
 * GET /api/music
 *
 * Get status of all music integrations
 */
export async function GET() {
  try {
    const providers = [
      {
        name: 'spotify',
        displayName: 'Spotify',
        connected: musicState.spotify.connected,
        icon: '🎵',
      },
      {
        name: 'sonos',
        displayName: 'Sonos',
        connected: musicState.sonos.connected,
        deviceCount: musicState.sonos.speakerCount,
        icon: '🔊',
      },
      {
        name: 'apple_music',
        displayName: 'Apple Music',
        connected: musicState.appleMusic.connected,
        icon: '🍎',
      },
      {
        name: 'system',
        displayName: 'System Audio',
        connected: musicState.system.connected,
        icon: '🖥️',
      },
    ];

    return NextResponse.json({
      success: true,
      activeProvider: musicState.activeProvider,
      providers,
    });
  } catch (error) {
    console.error('Failed to get music status:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get music status',
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/music
 *
 * Execute a natural language music command
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { command, provider } = body;

    if (!command) {
      return NextResponse.json(
        {
          success: false,
          error: 'Command is required',
        },
        { status: 400 },
      );
    }

    // Parse and execute the command
    const result = await executeCommand(command, provider);

    return NextResponse.json({
      success: result.success,
      action: result.action,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error('Failed to execute music command:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute command',
      },
      { status: 500 },
    );
  }
}

/**
 * Execute a natural language music command
 */
async function executeCommand(
  command: string,
  provider?: string,
): Promise<{
  success: boolean;
  action: string;
  message: string;
  data?: unknown;
}> {
  const lowerCommand = command.toLowerCase().trim();

  // Simple command parsing
  // In production, this would use the MusicManager from the backend

  // Play/Resume
  if (/^(play|resume|start)( music)?$/i.test(lowerCommand)) {
    return { success: true, action: 'play', message: 'Playing music' };
  }

  // Pause
  if (/^(pause|stop)( the)?( music)?$/i.test(lowerCommand)) {
    return { success: true, action: 'pause', message: 'Music paused' };
  }

  // Skip/Next
  if (/^(skip|next)( this)?( song| track)?$/i.test(lowerCommand)) {
    return { success: true, action: 'next', message: 'Skipped to next track' };
  }

  // Previous/Back
  if (/^(previous|back|go back)( track| song)?$/i.test(lowerCommand)) {
    return { success: true, action: 'previous', message: 'Going to previous track' };
  }

  // Volume
  const volumeMatch = lowerCommand.match(/^set volume to (\d+)%?$/i);
  if (volumeMatch) {
    const level = parseInt(volumeMatch[1], 10);
    return { success: true, action: 'set_volume', message: `Volume set to ${level}%`, data: { volume: level } };
  }

  // Volume up
  if (/^(turn it up|louder|volume up)$/i.test(lowerCommand)) {
    return { success: true, action: 'volume_up', message: 'Volume increased' };
  }

  // Volume down
  if (/^(turn it down|quieter|volume down)$/i.test(lowerCommand)) {
    return { success: true, action: 'volume_down', message: 'Volume decreased' };
  }

  // Play search query
  const playMatch = lowerCommand.match(/^play (.+)$/i);
  if (playMatch) {
    const query = playMatch[1];
    return { success: true, action: 'play_search', message: `Playing: ${query}`, data: { query } };
  }

  // What's playing
  if (/^what('s| is)( this)?( song| playing)?(\?)?$/i.test(lowerCommand)) {
    return { success: true, action: 'now_playing', message: 'Nothing is currently playing' };
  }

  return {
    success: false,
    action: 'unknown',
    message: `Unknown command: ${command}`,
  };
}

/**
 * Update music state (called by other routes)
 */
export function updateMusicState(update: Partial<typeof musicState>) {
  musicState = { ...musicState, ...update };
}

/**
 * Get current music state
 */
export function getMusicState() {
  return musicState;
}
