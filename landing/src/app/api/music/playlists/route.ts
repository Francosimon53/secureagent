import { NextRequest, NextResponse } from 'next/server';

/**
 * Music API - Playlist Management
 *
 * GET /api/music/playlists - List user playlists
 * POST /api/music/playlists - Create a new playlist
 */

// Mock playlists (in production, these would come from actual providers)
const mockPlaylists = [
  {
    id: 'playlist-1',
    name: 'Liked Songs',
    description: 'Your favorite tracks',
    owner: 'You',
    trackCount: 127,
    artworkUrl: 'https://picsum.photos/300/300?random=1',
    isPublic: false,
    provider: 'spotify',
  },
  {
    id: 'playlist-2',
    name: 'Chill Vibes',
    description: 'Relaxing tunes for any occasion',
    owner: 'You',
    trackCount: 45,
    artworkUrl: 'https://picsum.photos/300/300?random=2',
    isPublic: true,
    provider: 'spotify',
  },
  {
    id: 'playlist-3',
    name: 'Workout Mix',
    description: 'High energy tracks',
    owner: 'You',
    trackCount: 38,
    artworkUrl: 'https://picsum.photos/300/300?random=3',
    isPublic: true,
    provider: 'spotify',
  },
  {
    id: 'playlist-4',
    name: 'Focus',
    description: 'Music for concentration',
    owner: 'You',
    trackCount: 62,
    artworkUrl: 'https://picsum.photos/300/300?random=4',
    isPublic: false,
    provider: 'spotify',
  },
  {
    id: 'playlist-5',
    name: 'Discover Weekly',
    description: 'Your weekly mixtape of fresh music',
    owner: 'Spotify',
    trackCount: 30,
    artworkUrl: 'https://picsum.photos/300/300?random=5',
    isPublic: false,
    provider: 'spotify',
  },
];

/**
 * GET /api/music/playlists
 *
 * List user playlists
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const provider = searchParams.get('provider') || 'spotify';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Filter by provider
    let playlists = mockPlaylists.filter((p) => p.provider === provider);

    // Apply pagination
    const total = playlists.length;
    playlists = playlists.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      playlists,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Failed to get playlists:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get playlists',
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/music/playlists
 *
 * Create a new playlist
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, isPublic, provider } = body;

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: 'Playlist name is required',
        },
        { status: 400 },
      );
    }

    // Create new playlist (mock)
    const newPlaylist = {
      id: `playlist-${Date.now()}`,
      name: name as string,
      description: (description as string) || '',
      owner: 'You',
      trackCount: 0,
      artworkUrl: '',
      isPublic: (isPublic as boolean) ?? false,
      provider: (provider as string) || 'spotify',
    };

    mockPlaylists.push(newPlaylist);

    return NextResponse.json({
      success: true,
      message: `Playlist "${name}" created`,
      playlist: newPlaylist,
    });
  } catch (error) {
    console.error('Failed to create playlist:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create playlist',
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/music/playlists
 *
 * Update a playlist (add tracks, rename, etc.)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { playlistId, name, description, isPublic, addTracks } = body;

    if (!playlistId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Playlist ID is required',
        },
        { status: 400 },
      );
    }

    const playlist = mockPlaylists.find((p) => p.id === playlistId);
    if (!playlist) {
      return NextResponse.json(
        {
          success: false,
          error: 'Playlist not found',
        },
        { status: 404 },
      );
    }

    // Update playlist properties
    if (name !== undefined) playlist.name = name;
    if (description !== undefined) playlist.description = description;
    if (isPublic !== undefined) playlist.isPublic = isPublic;

    // Add tracks
    if (addTracks && Array.isArray(addTracks)) {
      playlist.trackCount += addTracks.length;
    }

    return NextResponse.json({
      success: true,
      message: 'Playlist updated',
      playlist,
    });
  } catch (error) {
    console.error('Failed to update playlist:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update playlist',
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/music/playlists
 *
 * Delete a playlist
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { playlistId } = body;

    if (!playlistId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Playlist ID is required',
        },
        { status: 400 },
      );
    }

    const index = mockPlaylists.findIndex((p) => p.id === playlistId);
    if (index === -1) {
      return NextResponse.json(
        {
          success: false,
          error: 'Playlist not found',
        },
        { status: 404 },
      );
    }

    const [deleted] = mockPlaylists.splice(index, 1);

    return NextResponse.json({
      success: true,
      message: `Playlist "${deleted.name}" deleted`,
    });
  } catch (error) {
    console.error('Failed to delete playlist:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete playlist',
      },
      { status: 500 },
    );
  }
}
