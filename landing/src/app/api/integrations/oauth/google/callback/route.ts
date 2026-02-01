import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * GET /api/integrations/oauth/google/callback
 *
 * OAuth callback handler for Google
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard/integrations?error=${encodeURIComponent(error)}`, request.url),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/dashboard/integrations?error=no_code', request.url),
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL('/dashboard/integrations?error=not_configured', request.url),
    );
  }

  try {
    // Build the redirect URI
    const origin = request.nextUrl.origin;
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
      const errorData = await tokenResponse.json();
      console.error('Token exchange failed:', errorData);
      return NextResponse.redirect(
        new URL(
          `/dashboard/integrations?error=${encodeURIComponent(errorData.error_description || 'token_exchange_failed')}`,
          request.url,
        ),
      );
    }

    const tokens = await tokenResponse.json();

    // In production, you would:
    // 1. Store tokens securely in database with user association
    // 2. Set up refresh token rotation
    // 3. Store in encrypted session

    // For now, set a cookie to indicate connection (not secure for production)
    const response = NextResponse.redirect(
      new URL('/dashboard/integrations?connected=google', request.url),
    );

    // Set a cookie to track the connection (use secure httpOnly cookies in production)
    response.cookies.set('google_connected', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(
      new URL(
        `/dashboard/integrations?error=${encodeURIComponent(
          err instanceof Error ? err.message : 'unknown_error',
        )}`,
        request.url,
      ),
    );
  }
}
