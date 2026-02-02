import { NextRequest, NextResponse } from 'next/server';

/**
 * Music API - Search
 *
 * GET /api/music/search - Search for music across providers
 */

/**
 * GET /api/music/search
 *
 * Search for tracks, albums, artists, and playlists
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const types = searchParams.get('types')?.split(',') || ['track', 'album', 'artist', 'playlist'];
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const provider = searchParams.get('provider') || 'spotify';

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: 'Query parameter "q" is required',
        },
        { status: 400 },
      );
    }

    // In production, this would call the actual music provider APIs
    // For now, return mock results based on the query
    const results = generateMockResults(query, types, limit, provider);

    return NextResponse.json({
      success: true,
      query,
      provider,
      results,
    });
  } catch (error) {
    console.error('Search failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed',
      },
      { status: 500 },
    );
  }
}

/**
 * Generate mock search results
 */
function generateMockResults(
  query: string,
  types: string[],
  limit: number,
  provider: string,
) {
  const results: {
    tracks: Array<{
      id: string;
      name: string;
      artist: string;
      album: string;
      duration: number;
      artworkUrl: string;
      uri: string;
      provider: string;
    }>;
    albums: Array<{
      id: string;
      name: string;
      artist: string;
      artworkUrl: string;
      releaseDate: string;
      provider: string;
    }>;
    artists: Array<{
      id: string;
      name: string;
      genres: string[];
      imageUrl: string;
      provider: string;
    }>;
    playlists: Array<{
      id: string;
      name: string;
      description: string;
      owner: string;
      artworkUrl: string;
      provider: string;
    }>;
  } = {
    tracks: [],
    albums: [],
    artists: [],
    playlists: [],
  };

  // Generate mock tracks
  if (types.includes('track')) {
    for (let i = 0; i < Math.min(limit, 5); i++) {
      results.tracks.push({
        id: `track-${i}`,
        name: `${query} - Track ${i + 1}`,
        artist: `Artist ${i + 1}`,
        album: `Album ${i + 1}`,
        duration: 180000 + i * 30000,
        artworkUrl: `https://picsum.photos/300/300?random=${i}`,
        uri: `${provider}:track:mock-${i}`,
        provider,
      });
    }
  }

  // Generate mock albums
  if (types.includes('album')) {
    for (let i = 0; i < Math.min(limit, 3); i++) {
      results.albums.push({
        id: `album-${i}`,
        name: `${query} - Album ${i + 1}`,
        artist: `Artist ${i + 1}`,
        artworkUrl: `https://picsum.photos/300/300?random=${i + 10}`,
        releaseDate: `202${i}`,
        provider,
      });
    }
  }

  // Generate mock artists
  if (types.includes('artist')) {
    for (let i = 0; i < Math.min(limit, 3); i++) {
      results.artists.push({
        id: `artist-${i}`,
        name: `${query} Artist ${i + 1}`,
        genres: ['Pop', 'Rock'],
        imageUrl: `https://picsum.photos/300/300?random=${i + 20}`,
        provider,
      });
    }
  }

  // Generate mock playlists
  if (types.includes('playlist')) {
    for (let i = 0; i < Math.min(limit, 3); i++) {
      results.playlists.push({
        id: `playlist-${i}`,
        name: `${query} Playlist ${i + 1}`,
        description: `A playlist featuring ${query}`,
        owner: 'Music Curator',
        artworkUrl: `https://picsum.photos/300/300?random=${i + 30}`,
        provider,
      });
    }
  }

  return results;
}
