import { NextRequest, NextResponse } from 'next/server';

// Token endpoints for each platform
const TOKEN_CONFIG: Record<string, {
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  redirectPath: string;
}> = {
  twitter: {
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    clientIdEnv: 'TWITTER_CLIENT_ID',
    clientSecretEnv: 'TWITTER_CLIENT_SECRET',
    redirectPath: '/api/social/oauth/twitter/callback',
  },
  youtube: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    redirectPath: '/api/social/oauth/youtube/callback',
  },
  instagram: {
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    clientIdEnv: 'INSTAGRAM_CLIENT_ID',
    clientSecretEnv: 'INSTAGRAM_CLIENT_SECRET',
    redirectPath: '/api/social/oauth/instagram/callback',
  },
  linkedin: {
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
    redirectPath: '/api/social/oauth/linkedin/callback',
  },
};

/**
 * GET /api/social/oauth/[platform]/callback
 * Handle OAuth callback and exchange code for tokens
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const { platform } = await params;
    const { searchParams } = new URL(request.url);

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>OAuth Error</title></head>
          <body>
            <script>
              window.opener.postMessage({
                type: 'oauth_error',
                platform: '${platform}',
                error: '${error}',
                description: '${errorDescription || 'Unknown error'}'
              }, '*');
              window.close();
            </script>
            <p>OAuth failed: ${errorDescription || error}</p>
            <p>This window will close automatically.</p>
          </body>
        </html>
      `;
      return new NextResponse(errorHtml, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (!code) {
      return NextResponse.json(
        { error: 'Authorization code is required' },
        { status: 400 }
      );
    }

    const config = TOKEN_CONFIG[platform];
    if (!config) {
      return NextResponse.json(
        { error: `OAuth not supported for platform: ${platform}` },
        { status: 400 }
      );
    }

    const clientId = process.env[config.clientIdEnv];
    const clientSecret = process.env[config.clientSecretEnv];

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: `${platform} OAuth is not configured` },
        { status: 500 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}${config.redirectPath}`;

    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    // Platform-specific parameters
    if (platform === 'twitter') {
      // In production, include PKCE verifier
      tokenParams.set('code_verifier', 'verifier');
    }

    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error('Token exchange failed:', errorData);

      // Return HTML that notifies the opener window
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>OAuth Error</title></head>
          <body>
            <script>
              window.opener.postMessage({
                type: 'oauth_error',
                platform: '${platform}',
                error: 'token_exchange_failed'
              }, '*');
              window.close();
            </script>
            <p>Failed to complete OAuth. This window will close automatically.</p>
          </body>
        </html>
      `;
      return new NextResponse(errorHtml, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const tokens = await tokenResponse.json();

    // In production, store the tokens securely in the database
    // For now, return success to the popup window

    const successHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>OAuth Success</title></head>
        <body>
          <script>
            window.opener.postMessage({
              type: 'oauth_success',
              platform: '${platform}',
              // Don't send actual tokens to frontend in production
              connected: true
            }, '*');
            window.close();
          </script>
          <p>Successfully connected ${platform}!</p>
          <p>This window will close automatically.</p>
        </body>
      </html>
    `;

    return new NextResponse(successHtml, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.json(
      { error: 'OAuth callback failed' },
      { status: 500 }
    );
  }
}
