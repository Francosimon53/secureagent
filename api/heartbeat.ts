/**
 * Proactive Heartbeat System
 *
 * Scheduled cron jobs that send proactive messages to users.
 * Uses Vercel Cron to trigger at scheduled times.
 *
 * Features:
 * - Morning briefings (7am)
 * - Midday check-ins (12pm)
 * - Evening summaries (6pm)
 * - Custom user preferences
 *
 * Endpoints:
 * - POST /api/heartbeat?action=trigger - Manual trigger for testing
 * - POST /api/heartbeat?action=subscribe - Subscribe a user to heartbeats
 * - POST /api/heartbeat?action=unsubscribe - Unsubscribe a user
 * - GET /api/heartbeat?action=preferences - Get user preferences
 * - POST /api/heartbeat?action=preferences - Update user preferences
 * - GET /api/heartbeat - Cron endpoint (triggered by Vercel)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// Types
// =============================================================================

interface HeartbeatPreferences {
  userId: string;
  channel: 'telegram' | 'email' | 'webhook';
  channelId: string; // Telegram chat ID, email address, or webhook URL
  enabled: boolean;
  timezone: string;
  schedule: {
    morning: boolean;    // 7am
    midday: boolean;     // 12pm
    evening: boolean;    // 6pm
    custom?: string[];   // Custom times in HH:MM format
  };
  topics: string[];      // Topics of interest for briefings
  lastHeartbeat?: number;
  createdAt: number;
  updatedAt: number;
}

interface HeartbeatResult {
  userId: string;
  success: boolean;
  message?: string;
  error?: string;
}

// =============================================================================
// In-Memory Storage (Use Redis/DB in production)
// =============================================================================

const preferences = new Map<string, HeartbeatPreferences>();

// =============================================================================
// Telegram Helper
// =============================================================================

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json() as { ok: boolean };
    return data.ok;
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    return false;
  }
}

// =============================================================================
// AI Message Generation
// =============================================================================

async function generateHeartbeatMessage(
  type: 'morning' | 'midday' | 'evening' | 'custom',
  userPrefs: HeartbeatPreferences
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return getDefaultMessage(type);
  }

  const client = new Anthropic({ apiKey });

  const timeContext = {
    morning: 'early morning, people are starting their day',
    midday: 'midday, people are in the middle of their workday',
    evening: 'evening, people are winding down from work',
    custom: 'a custom scheduled check-in time',
  };

  const topics = userPrefs.topics.length > 0
    ? `User is interested in: ${userPrefs.topics.join(', ')}`
    : 'No specific topics configured';

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You are SecureAgent, a helpful AI assistant that sends proactive heartbeat messages to users.
The current time context is: ${timeContext[type]}.
${topics}

Generate a brief, friendly, and helpful message appropriate for this time of day.
Keep it concise (2-4 sentences). Be warm but not overly cheerful.
If morning: include a motivational thought or useful tip for the day
If midday: include a quick productivity tip or reminder to take breaks
If evening: include a reflection prompt or wind-down suggestion

Do NOT include greetings like "Good morning" - the message should feel natural and conversational.
Use appropriate emojis sparingly (1-2 max).`,
      messages: [
        {
          role: 'user',
          content: `Generate a ${type} heartbeat message for the user.`,
        },
      ],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    return textBlock?.text || getDefaultMessage(type);
  } catch (error) {
    console.error('Failed to generate AI message:', error);
    return getDefaultMessage(type);
  }
}

function getDefaultMessage(type: 'morning' | 'midday' | 'evening' | 'custom'): string {
  const messages = {
    morning: "☀️ Ready to tackle the day? Remember: small consistent steps lead to big results. What's your most important task today?",
    midday: "🌤️ Quick check-in: How's your day going? If you've been at it for a while, consider a short break - your brain will thank you.",
    evening: "🌙 As the day winds down, take a moment to acknowledge what you accomplished. Rest well - tomorrow brings new opportunities.",
    custom: "👋 Just checking in! How can I help you today?",
  };
  return messages[type];
}

// =============================================================================
// Heartbeat Execution
// =============================================================================

function getCurrentHeartbeatType(): 'morning' | 'midday' | 'evening' | null {
  const now = new Date();
  const hour = now.getUTCHours();

  // Convert to approximate local time ranges (adjust based on common timezones)
  // Morning: 6-9 UTC (covers US early morning to EU morning)
  // Midday: 11-14 UTC
  // Evening: 17-20 UTC

  if (hour >= 6 && hour < 9) return 'morning';
  if (hour >= 11 && hour < 14) return 'midday';
  if (hour >= 17 && hour < 20) return 'evening';

  return null;
}

async function sendHeartbeat(
  userPrefs: HeartbeatPreferences,
  type: 'morning' | 'midday' | 'evening' | 'custom'
): Promise<HeartbeatResult> {
  const message = await generateHeartbeatMessage(type, userPrefs);

  if (userPrefs.channel === 'telegram') {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return {
        userId: userPrefs.userId,
        success: false,
        error: 'Telegram bot token not configured',
      };
    }

    const success = await sendTelegramMessage(botToken, userPrefs.channelId, message);
    return {
      userId: userPrefs.userId,
      success,
      message: success ? message : undefined,
      error: success ? undefined : 'Failed to send Telegram message',
    };
  }

  if (userPrefs.channel === 'webhook') {
    try {
      const response = await fetch(userPrefs.channelId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          message,
          userId: userPrefs.userId,
          timestamp: new Date().toISOString(),
        }),
      });

      const success = response.ok;
      return {
        userId: userPrefs.userId,
        success,
        message: success ? message : undefined,
        error: success ? undefined : `Webhook returned ${response.status}`,
      };
    } catch (error) {
      return {
        userId: userPrefs.userId,
        success: false,
        error: (error as Error).message,
      };
    }
  }

  return {
    userId: userPrefs.userId,
    success: false,
    error: `Unsupported channel: ${userPrefs.channel}`,
  };
}

async function executeHeartbeats(type: 'morning' | 'midday' | 'evening'): Promise<HeartbeatResult[]> {
  const results: HeartbeatResult[] = [];

  for (const [, userPrefs] of preferences) {
    if (!userPrefs.enabled) continue;

    // Check if this type is enabled for user
    if (!userPrefs.schedule[type]) continue;

    // Check cooldown (don't send more than once per 4 hours)
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
    if (userPrefs.lastHeartbeat && userPrefs.lastHeartbeat > fourHoursAgo) {
      continue;
    }

    const result = await sendHeartbeat(userPrefs, type);
    results.push(result);

    // Update last heartbeat time
    if (result.success) {
      userPrefs.lastHeartbeat = Date.now();
    }
  }

  return results;
}

// =============================================================================
// API Handler
// =============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method, query } = req;
  const action = query.action as string | undefined;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verify cron secret for scheduled runs
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  // Parse body
  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  try {
    // GET /api/heartbeat - Cron trigger (called by Vercel Cron)
    if (method === 'GET' && !action) {
      // Verify cron secret
      if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const type = getCurrentHeartbeatType();
      if (!type) {
        return res.status(200).json({
          success: true,
          message: 'No heartbeat scheduled for this time',
          currentHourUTC: new Date().getUTCHours(),
        });
      }

      const results = await executeHeartbeats(type);

      return res.status(200).json({
        success: true,
        type,
        results,
        executedAt: new Date().toISOString(),
      });
    }

    // POST /api/heartbeat?action=trigger - Manual trigger for testing
    if (method === 'POST' && action === 'trigger') {
      const { type, userId } = body;

      if (!type || !['morning', 'midday', 'evening', 'custom'].includes(type)) {
        return res.status(400).json({
          error: 'Invalid type. Use: morning, midday, evening, or custom',
        });
      }

      if (userId) {
        // Trigger for specific user
        const userPrefs = preferences.get(userId);
        if (!userPrefs) {
          return res.status(404).json({ error: 'User not found' });
        }

        const result = await sendHeartbeat(userPrefs, type);
        return res.status(200).json(result);
      }

      // Trigger for all users
      const results = await executeHeartbeats(type);
      return res.status(200).json({ success: true, results });
    }

    // POST /api/heartbeat?action=subscribe - Subscribe a user
    if (method === 'POST' && action === 'subscribe') {
      const { userId, channel, channelId, timezone, schedule, topics } = body;

      if (!userId || !channel || !channelId) {
        return res.status(400).json({
          error: 'userId, channel, and channelId are required',
        });
      }

      const newPrefs: HeartbeatPreferences = {
        userId,
        channel,
        channelId,
        enabled: true,
        timezone: timezone || 'UTC',
        schedule: schedule || { morning: true, midday: false, evening: true },
        topics: topics || [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      preferences.set(userId, newPrefs);

      return res.status(200).json({
        success: true,
        message: 'Subscribed to heartbeats',
        preferences: newPrefs,
      });
    }

    // POST /api/heartbeat?action=unsubscribe - Unsubscribe a user
    if (method === 'POST' && action === 'unsubscribe') {
      const { userId } = body;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const userPrefs = preferences.get(userId);
      if (userPrefs) {
        userPrefs.enabled = false;
        userPrefs.updatedAt = Date.now();
      }

      return res.status(200).json({
        success: true,
        message: 'Unsubscribed from heartbeats',
      });
    }

    // GET /api/heartbeat?action=preferences - Get user preferences
    if (method === 'GET' && action === 'preferences') {
      const userId = query.userId as string;

      if (!userId) {
        return res.status(400).json({ error: 'userId query parameter required' });
      }

      const userPrefs = preferences.get(userId);
      if (!userPrefs) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.status(200).json({ preferences: userPrefs });
    }

    // POST /api/heartbeat?action=preferences - Update user preferences
    if (method === 'POST' && action === 'preferences') {
      const { userId, ...updates } = body;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const userPrefs = preferences.get(userId);
      if (!userPrefs) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Update allowed fields
      if (updates.enabled !== undefined) userPrefs.enabled = updates.enabled;
      if (updates.timezone) userPrefs.timezone = updates.timezone;
      if (updates.schedule) userPrefs.schedule = { ...userPrefs.schedule, ...updates.schedule };
      if (updates.topics) userPrefs.topics = updates.topics;
      userPrefs.updatedAt = Date.now();

      return res.status(200).json({
        success: true,
        message: 'Preferences updated',
        preferences: userPrefs,
      });
    }

    // GET /api/heartbeat?action=status - Get system status
    if (method === 'GET' && action === 'status') {
      return res.status(200).json({
        name: 'SecureAgent Heartbeat System',
        version: '1.0.0',
        currentHourUTC: new Date().getUTCHours(),
        currentType: getCurrentHeartbeatType(),
        subscriberCount: Array.from(preferences.values()).filter(p => p.enabled).length,
        schedules: {
          morning: '6-9 UTC',
          midday: '11-14 UTC',
          evening: '17-20 UTC',
        },
        endpoints: {
          cronTrigger: 'GET /api/heartbeat',
          manualTrigger: 'POST /api/heartbeat?action=trigger',
          subscribe: 'POST /api/heartbeat?action=subscribe',
          unsubscribe: 'POST /api/heartbeat?action=unsubscribe',
          getPreferences: 'GET /api/heartbeat?action=preferences&userId=X',
          updatePreferences: 'POST /api/heartbeat?action=preferences',
          status: 'GET /api/heartbeat?action=status',
        },
        vercelCronConfig: {
          schedule: '0 7,12,18 * * *',
          note: 'Add to vercel.json crons array',
        },
      });
    }

    return res.status(400).json({
      error: 'Invalid action',
      validActions: ['trigger', 'subscribe', 'unsubscribe', 'preferences', 'status'],
    });

  } catch (error) {
    console.error('Heartbeat API error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: (error as Error).message,
    });
  }
}
