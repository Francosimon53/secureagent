import { NextRequest, NextResponse } from 'next/server';

// In-memory store for demo - replace with database in production
const connectedAccounts = new Map<string, {
  id: string;
  platform: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  connected: boolean;
  connectedAt?: number;
  followers?: number;
  accessToken?: string;
  refreshToken?: string;
}>();

/**
 * GET /api/social/accounts
 * List all connected social media accounts
 */
export async function GET() {
  try {
    const accounts = Array.from(connectedAccounts.values()).map(account => ({
      id: account.id,
      platform: account.platform,
      username: account.username,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      connected: account.connected,
      connectedAt: account.connectedAt,
      followers: account.followers,
    }));

    // Add placeholder accounts for platforms not yet connected
    const platforms = ['twitter', 'linkedin', 'bluesky', 'youtube', 'instagram'];
    const connectedPlatforms = new Set(accounts.map(a => a.platform));

    for (const platform of platforms) {
      if (!connectedPlatforms.has(platform)) {
        accounts.push({
          id: `placeholder_${platform}`,
          platform,
          username: '',
          displayName: undefined,
          avatarUrl: undefined,
          connected: false,
          connectedAt: undefined,
          followers: undefined,
        });
      }
    }

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/social/accounts
 * Connect a new social media account
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform, credentials } = body;

    if (!platform) {
      return NextResponse.json(
        { error: 'Platform is required' },
        { status: 400 }
      );
    }

    // Validate credentials based on platform
    let account;
    switch (platform) {
      case 'twitter':
        if (!credentials?.apiKey || !credentials?.apiSecret || !credentials?.accessToken) {
          return NextResponse.json(
            { error: 'Twitter requires apiKey, apiSecret, and accessToken' },
            { status: 400 }
          );
        }
        account = {
          id: `twitter_${Date.now()}`,
          platform: 'twitter',
          username: credentials.username || '@user',
          displayName: credentials.displayName,
          connected: true,
          connectedAt: Date.now(),
          accessToken: credentials.accessToken,
        };
        break;

      case 'linkedin':
        if (!credentials?.accessToken) {
          return NextResponse.json(
            { error: 'LinkedIn requires accessToken' },
            { status: 400 }
          );
        }
        account = {
          id: `linkedin_${Date.now()}`,
          platform: 'linkedin',
          username: credentials.username || 'user',
          displayName: credentials.displayName,
          connected: true,
          connectedAt: Date.now(),
          accessToken: credentials.accessToken,
        };
        break;

      case 'bluesky':
        if (!credentials?.identifier || !credentials?.password) {
          return NextResponse.json(
            { error: 'Bluesky requires identifier and password' },
            { status: 400 }
          );
        }
        account = {
          id: `bluesky_${Date.now()}`,
          platform: 'bluesky',
          username: credentials.identifier,
          displayName: credentials.displayName,
          connected: true,
          connectedAt: Date.now(),
        };
        break;

      case 'youtube':
        if (!credentials?.accessToken) {
          return NextResponse.json(
            { error: 'YouTube requires accessToken' },
            { status: 400 }
          );
        }
        account = {
          id: `youtube_${Date.now()}`,
          platform: 'youtube',
          username: credentials.channelName || 'channel',
          displayName: credentials.displayName,
          connected: true,
          connectedAt: Date.now(),
          accessToken: credentials.accessToken,
        };
        break;

      case 'instagram':
        if (!credentials?.accessToken || !credentials?.businessAccountId) {
          return NextResponse.json(
            { error: 'Instagram requires accessToken and businessAccountId' },
            { status: 400 }
          );
        }
        account = {
          id: `instagram_${Date.now()}`,
          platform: 'instagram',
          username: credentials.username || '@user',
          displayName: credentials.displayName,
          connected: true,
          connectedAt: Date.now(),
          accessToken: credentials.accessToken,
        };
        break;

      default:
        return NextResponse.json(
          { error: `Unsupported platform: ${platform}` },
          { status: 400 }
        );
    }

    connectedAccounts.set(account.id, account);

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        platform: account.platform,
        username: account.username,
        displayName: account.displayName,
        connected: account.connected,
        connectedAt: account.connectedAt,
      },
    });
  } catch (error) {
    console.error('Error connecting account:', error);
    return NextResponse.json(
      { error: 'Failed to connect account' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/social/accounts
 * Disconnect a social media account
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    const account = connectedAccounts.get(accountId);
    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    connectedAccounts.delete(accountId);

    return NextResponse.json({
      success: true,
      message: `Disconnected ${account.platform} account`,
    });
  } catch (error) {
    console.error('Error disconnecting account:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect account' },
      { status: 500 }
    );
  }
}
