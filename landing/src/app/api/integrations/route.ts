import { NextResponse } from 'next/server';

/**
 * GET /api/integrations
 *
 * List all integrations and their connection status
 */
export async function GET() {
  try {
    // In a real implementation, this would use the IntegrationManager
    // For now, return mock data showing disconnected state
    const connections = [
      { integrationName: 'notion', connected: false },
      { integrationName: 'google-calendar', connected: false },
      { integrationName: 'gmail', connected: false },
      { integrationName: 'obsidian', connected: false },
      { integrationName: 'trello', connected: false },
      { integrationName: 'apple-reminders', connected: false },
    ];

    // Check for stored credentials in cookies/session
    // This is a simplified version - in production, use proper session management

    return NextResponse.json({
      success: true,
      connections,
    });
  } catch (error) {
    console.error('Failed to list integrations:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to list integrations',
      },
      { status: 500 },
    );
  }
}
