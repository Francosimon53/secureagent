/**
 * Skill Install API Route
 *
 * POST /api/skills/marketplace/:id/install - Install skill to user account
 * DELETE /api/skills/marketplace/:id/install - Uninstall skill
 */

import { NextRequest, NextResponse } from 'next/server';

// In-memory installs store (replace with database in production)
const installs: Map<string, Map<string, { installedAt: number; version: string }>> = new Map();

// Demo skill IDs
const validSkillIds = [
  'skill_1', 'skill_2', 'skill_3', 'skill_4',
  'skill_5', 'skill_6', 'skill_7', 'skill_8',
];

/**
 * POST /api/skills/marketplace/:id/install
 * Install skill to user account
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: skillId } = await params;
    const body = await request.json().catch(() => ({}));
    const userId = body.userId || 'demo_user';

    // Check if skill exists
    if (!validSkillIds.includes(skillId) && !skillId.startsWith('skill_')) {
      return NextResponse.json(
        { error: 'Skill not found' },
        { status: 404 },
      );
    }

    // Get or create user's installs
    if (!installs.has(userId)) {
      installs.set(userId, new Map());
    }
    const userInstalls = installs.get(userId)!;

    // Check if already installed
    if (userInstalls.has(skillId)) {
      return NextResponse.json(
        { error: 'Skill is already installed' },
        { status: 409 },
      );
    }

    // Install skill
    userInstalls.set(skillId, {
      installedAt: Date.now(),
      version: body.version || '1.0.0',
    });

    return NextResponse.json({
      success: true,
      message: 'Skill installed successfully',
      install: {
        skillId,
        userId,
        installedAt: userInstalls.get(skillId)!.installedAt,
        version: userInstalls.get(skillId)!.version,
      },
    });
  } catch (error) {
    console.error('Install skill error:', error);
    return NextResponse.json(
      { error: 'Failed to install skill' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/skills/marketplace/:id/install
 * Uninstall skill from user account
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: skillId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'demo_user';

    // Get user's installs
    const userInstalls = installs.get(userId);
    if (!userInstalls || !userInstalls.has(skillId)) {
      return NextResponse.json(
        { error: 'Skill is not installed' },
        { status: 404 },
      );
    }

    // Uninstall skill
    userInstalls.delete(skillId);

    return NextResponse.json({
      success: true,
      message: 'Skill uninstalled successfully',
    });
  } catch (error) {
    console.error('Uninstall skill error:', error);
    return NextResponse.json(
      { error: 'Failed to uninstall skill' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/skills/marketplace/:id/install
 * Check if skill is installed
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: skillId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'demo_user';

    const userInstalls = installs.get(userId);
    const install = userInstalls?.get(skillId);

    return NextResponse.json({
      installed: !!install,
      install: install || null,
    });
  } catch (error) {
    console.error('Check install error:', error);
    return NextResponse.json(
      { error: 'Failed to check install status' },
      { status: 500 },
    );
  }
}
