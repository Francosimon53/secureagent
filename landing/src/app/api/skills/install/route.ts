import { NextResponse } from 'next/server';

// In-memory installation state (in production, this would be stored in a database)
const installedSkills = new Set(['web-search', 'file-manager', 'github', 'http-request', 'json-processor', 'memory']);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { skillId, action } = body;

    if (!skillId) {
      return NextResponse.json(
        { error: 'skillId is required' },
        { status: 400 }
      );
    }

    if (!action || !['install', 'uninstall'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "install" or "uninstall"' },
        { status: 400 }
      );
    }

    // Premium skills that require a paid plan
    const premiumSkills = ['code-executor', 'email', 'data-analysis', 'screenshot', 'pdf-processor'];

    if (action === 'install') {
      // Check if skill is premium (in production, verify user's subscription)
      if (premiumSkills.includes(skillId)) {
        // For demo purposes, allow installation but note it's premium
        installedSkills.add(skillId);
        return NextResponse.json({
          success: true,
          skillId,
          action: 'installed',
          message: 'Premium skill installed. Upgrade to Pro for full access.',
          premium: true,
        });
      }

      installedSkills.add(skillId);
      return NextResponse.json({
        success: true,
        skillId,
        action: 'installed',
        message: `Skill "${skillId}" has been installed successfully.`,
      });
    } else {
      // Uninstall
      if (!installedSkills.has(skillId)) {
        return NextResponse.json(
          { error: 'Skill is not installed' },
          { status: 400 }
        );
      }

      installedSkills.delete(skillId);
      return NextResponse.json({
        success: true,
        skillId,
        action: 'uninstalled',
        message: `Skill "${skillId}" has been uninstalled.`,
      });
    }
  } catch (error) {
    console.error('Skill install error:', error);
    return NextResponse.json(
      { error: 'Failed to process skill action' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    installed: Array.from(installedSkills),
    count: installedSkills.size,
  });
}
