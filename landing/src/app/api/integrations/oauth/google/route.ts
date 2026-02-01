import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

/**
 * GET /api/integrations/oauth/google/start
 *
 * Start Google OAuth flow - returns authorization URL
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const state = searchParams.get('state');

  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      {
        success: false,
        error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID environment variable.',
      },
      { status: 500 },
    );
  }

  // Build the redirect URI
  const origin = request.headers.get('origin') || 'http://localhost:3000';
  const redirectUri = `${origin}/api/integrations/oauth/google/callback`;

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state: state || '',
    access_type: 'offline',
    prompt: 'consent',
  });

  const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

  return NextResponse.json({
    success: true,
    authUrl,
  });
}

/**
 * POST /api/integrations/oauth/google
 *
 * Exchange authorization code for tokens
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, state } = body;

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Authorization code is required' },
        { status: 400 },
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          success: false,
          error: 'Google OAuth not configured',
        },
        { status: 500 },
      );
    }

    // Build the redirect URI
    const origin = request.headers.get('origin') || 'http://localhost:3000';
    const redirectUri = `${origin}/api/integrations/oauth/google/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json();
      return NextResponse.json(
        {
          success: false,
          error: error.error_description || 'Failed to exchange code',
        },
        { status: 400 },
      );
    }

    const tokens = await tokenResponse.json();

    // In production, store tokens securely in database/session
    // For now, return success with token info (without exposing actual tokens)

    return NextResponse.json({
      success: true,
      message: 'Successfully connected to Google',
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
    });
  } catch (error) {
    console.error('Google OAuth error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth failed',
      },
      { status: 500 },
    );
  }
}
