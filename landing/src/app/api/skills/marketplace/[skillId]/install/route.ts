/**
 * Skill Install API
 * POST /api/skills/marketplace/[skillId]/install - Install a skill
 */

import { NextResponse } from 'next/server';

// In-memory storage for demo
const installedSkills: Record<string, Set<string>> = {};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ skillId: string }> }
) {
  const { skillId } = await params;
  
  try {
    const body = await request.json();
    const userId = body.userId || 'anonymous';

    // Initialize user's installed skills if needed
    if (!installedSkills[userId]) {
      installedSkills[userId] = new Set();
    }

    // Add skill to user's installed set
    installedSkills[userId].add(skillId);

    return NextResponse.json({
      success: true,
      message: `Skill ${skillId} installed successfully`,
      skillId,
      userId,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to install skill' },
      { status: 500 }
    );
  }
}
