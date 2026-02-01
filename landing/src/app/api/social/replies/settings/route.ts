import { NextRequest, NextResponse } from 'next/server';

// In-memory store for demo - replace with database in production
const autoReplySettings = new Map<string, {
  platform: string;
  enabled: boolean;
  requireApproval: boolean;
  respondToComments: boolean;
  respondToMentions: boolean;
  respondToDMs: boolean;
  excludeKeywords: string[];
  includeKeywords: string[];
  maxRepliesPerHour: number;
  replyDelay: number;
  tone: 'professional' | 'friendly' | 'casual';
  customPrompt?: string;
  updatedAt: number;
}>();

// Initialize with defaults
const platforms = ['twitter', 'linkedin', 'bluesky', 'youtube', 'instagram'];
for (const platform of platforms) {
  autoReplySettings.set(platform, {
    platform,
    enabled: false,
    requireApproval: true,
    respondToComments: true,
    respondToMentions: true,
    respondToDMs: false,
    excludeKeywords: [],
    includeKeywords: [],
    maxRepliesPerHour: 20,
    replyDelay: 60,
    tone: 'professional',
    updatedAt: Date.now(),
  });
}

/**
 * GET /api/social/replies/settings
 * Get auto-reply settings for all platforms or a specific platform
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');

    if (platform) {
      const settings = autoReplySettings.get(platform);
      if (!settings) {
        return NextResponse.json(
          { error: `Unknown platform: ${platform}` },
          { status: 404 }
        );
      }
      return NextResponse.json({ settings });
    }

    // Return all settings
    const allSettings = Array.from(autoReplySettings.values());
    return NextResponse.json({ settings: allSettings });
  } catch (error) {
    console.error('Error fetching auto-reply settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/social/replies/settings
 * Update auto-reply settings for a platform
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform, ...updates } = body;

    if (!platform) {
      return NextResponse.json(
        { error: 'Platform is required' },
        { status: 400 }
      );
    }

    const current = autoReplySettings.get(platform);
    if (!current) {
      return NextResponse.json(
        { error: `Unknown platform: ${platform}` },
        { status: 404 }
      );
    }

    // Validate settings
    if (updates.tone && !['professional', 'friendly', 'casual'].includes(updates.tone)) {
      return NextResponse.json(
        { error: 'Invalid tone. Must be professional, friendly, or casual' },
        { status: 400 }
      );
    }

    if (updates.maxRepliesPerHour !== undefined && (updates.maxRepliesPerHour < 1 || updates.maxRepliesPerHour > 100)) {
      return NextResponse.json(
        { error: 'maxRepliesPerHour must be between 1 and 100' },
        { status: 400 }
      );
    }

    if (updates.replyDelay !== undefined && (updates.replyDelay < 0 || updates.replyDelay > 3600)) {
      return NextResponse.json(
        { error: 'replyDelay must be between 0 and 3600 seconds' },
        { status: 400 }
      );
    }

    // Update settings
    const updated = {
      ...current,
      ...updates,
      platform, // Ensure platform can't be changed
      updatedAt: Date.now(),
    };

    autoReplySettings.set(platform, updated);

    return NextResponse.json({
      success: true,
      settings: updated,
    });
  } catch (error) {
    console.error('Error updating auto-reply settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/social/replies/settings/bulk
 * Update auto-reply settings for multiple platforms at once
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { settings: bulkSettings } = body;

    if (!bulkSettings || !Array.isArray(bulkSettings)) {
      return NextResponse.json(
        { error: 'Settings array is required' },
        { status: 400 }
      );
    }

    const results = [];

    for (const update of bulkSettings) {
      const { platform, ...updates } = update;
      if (!platform) continue;

      const current = autoReplySettings.get(platform);
      if (!current) continue;

      const updated = {
        ...current,
        ...updates,
        platform,
        updatedAt: Date.now(),
      };

      autoReplySettings.set(platform, updated);
      results.push(updated);
    }

    return NextResponse.json({
      success: true,
      updated: results.length,
      settings: results,
    });
  } catch (error) {
    console.error('Error bulk updating auto-reply settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
