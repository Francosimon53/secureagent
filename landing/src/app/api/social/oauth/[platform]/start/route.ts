import { NextRequest, NextResponse } from 'next/server';

// OAuth configuration for each platform
const OAUTH_CONFIG: Record<string, {
  authUrl: string;
  scopes: string[];
  clientIdEnv: string;
  redirectPath: string;
}> = {
  twitter: {
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    clientIdEnv: 'TWITTER_CLIENT_ID',
    redirectPath: '/api/social/oauth/twitter/callback',
  },
  youtube: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    redirectPath: '/api/social/oauth/youtube/callback',
  },
  instagram: {
    authUrl: 'https://api.instagram.com/oauth/authorize',
    scopes: ['user_profile', 'user_media'],
    clientIdEnv: 'INSTAGRAM_CLIENT_ID',
    redirectPath: '/api/social/oauth/instagram/callback',
  },
  linkedin: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    scopes: ['r_liteprofile', 'r_emailaddress', 'w_member_social'],
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    redirectPath: '/api/social/oauth/linkedin/callback',
  },
};

/**
 * GET /api/social/oauth/[platform]/start
 * Start OAuth flow for a social media platform
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const { platform } = await params;

    const config = OAUTH_CONFIG[platform];
    if (!config) {
      return NextResponse.json(
        { error: `OAuth not supported for platform: ${platform}` },
        { status: 400 }
      );
    }

    const clientId = process.env[config.clientIdEnv];
    if (!clientId) {
      return NextResponse.json(
        { error: `${platform} OAuth is not configured. Missing ${config.clientIdEnv}` },
        { status: 500 }
      );
    }

    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(7) + Date.now().toString(36);

    // Build the redirect URI
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}${config.redirectPath}`;

    // Build OAuth authorization URL
    const authParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state,
    });

    // Platform-specific parameters
    if (platform === 'twitter') {
      authParams.set('code_challenge_method', 'S256');
      // In production, generate proper PKCE challenge
      authParams.set('code_challenge', 'challenge');
    }

    if (platform === 'youtube') {
      authParams.set('access_type', 'offline');
      authParams.set('prompt', 'consent');
    }

    const authUrl = `${config.authUrl}?${authParams.toString()}`;

    return NextResponse.json({
      authUrl,
      state,
      platform,
    });
  } catch (error) {
    console.error('Error starting OAuth:', error);
    return NextResponse.json(
      { error: 'Failed to start OAuth flow' },
      { status: 500 }
    );
  }
}
