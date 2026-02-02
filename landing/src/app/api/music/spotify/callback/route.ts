import { NextRequest, NextResponse } from 'next/server';

/**
 * Spotify OAuth Callback
 *
 * GET /api/music/spotify/callback - Handle OAuth callback from Spotify
 */

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

/**
 * GET /api/music/spotify/callback
 *
 * Handle OAuth callback from Spotify authorization
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  // Handle error from Spotify
  if (error) {
    console.error('Spotify OAuth error:', error);
    return NextResponse.redirect(
      new URL(
        `/dashboard/music?error=${encodeURIComponent(error)}`,
        request.url,
      ),
    );
  }

  // Validate code
  if (!code) {
    return NextResponse.redirect(
      new URL(
        '/dashboard/music?error=missing_code',
        request.url,
      ),
    );
  }

  try {
    // Get client credentials from environment
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectUri =
      process.env.SPOTIFY_REDIRECT_URI ||
      `${new URL(request.url).origin}/api/music/spotify/callback`;

    if (!clientId || !clientSecret) {
      console.error('Spotify credentials not configured');
      return NextResponse.redirect(
        new URL(
          '/dashboard/music?error=not_configured',
          request.url,
        ),
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Spotify token exchange failed:', errorText);
      return NextResponse.redirect(
        new URL(
          '/dashboard/music?error=token_exchange_failed',
          request.url,
        ),
      );
    }

    const tokens = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, scope } = tokens;

    // Calculate expiry time
    const expiresAt = Date.now() + expires_in * 1000;

    // In production, store tokens securely (database, encrypted cookie, etc.)
    // For now, set an HTTP-only cookie with the tokens
    const tokenData = JSON.stringify({
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt,
      scope: scope?.split(' ') || [],
    });

    // Create redirect response with cookie
    const response = NextResponse.redirect(
      new URL('/dashboard/music?connected=spotify', request.url),
    );

    // Set HTTP-only cookie (not secure for production - use proper session management)
    response.cookies.set('spotify_tokens', tokenData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('Spotify OAuth callback error:', err);
    return NextResponse.redirect(
      new URL(
        '/dashboard/music?error=callback_failed',
        request.url,
      ),
    );
  }
}

/**
 * POST /api/music/spotify/callback
 *
 * Manual token exchange (for non-redirect flows)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, redirectUri } = body;

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Authorization code is required' },
        { status: 400 },
      );
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const callbackUri =
      redirectUri ||
      process.env.SPOTIFY_REDIRECT_URI ||
      `${request.nextUrl.origin}/api/music/spotify/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { success: false, error: 'Spotify credentials not configured' },
        { status: 500 },
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return NextResponse.json(
        { success: false, error: `Token exchange failed: ${errorText}` },
        { status: 400 },
      );
    }

    const tokens = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, scope } = tokens;

    return NextResponse.json({
      success: true,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      expiresAt: Date.now() + expires_in * 1000,
      scope: scope?.split(' ') || [],
    });
  } catch (error) {
    console.error('Spotify token exchange error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Token exchange failed',
      },
      { status: 500 },
    );
  }
}
