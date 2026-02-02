/**
 * Telegram Scheduled Tasks Cron Job
 *
 * Runs periodically to check for due scheduled tasks and execute them.
 * Uses Claude to process the task and sends results via Telegram.
 *
 * Endpoints:
 * - GET /api/telegram-tasks - Cron endpoint (triggered by Vercel)
 * - POST /api/telegram-tasks - Manual trigger for testing
 *
 * Vercel Cron Schedule: Every 5 minutes (configured in vercel.json)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import {
  getDueTasks,
  updateTaskAfterExecution,
  getUser,
  getStats,
  type ScheduledTask,
} from './lib/telegram-store.js';
import { sendTelegramMessage } from './telegram.js';

// =============================================================================
// Task Execution
// =============================================================================

const TASK_TOOLS: Anthropic.Tool[] = [
  {
    name: 'http_request',
    description: 'Make an HTTP request to fetch data from public APIs or websites',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to request' },
        method: { type: 'string', enum: ['GET', 'POST'], description: 'HTTP method' },
      },
      required: ['url'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for information',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_timestamp',
    description: 'Get current date and time',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'http_request') {
    const url = args.url as string;
    const method = (args.method as string) || 'GET';

    // Security: Block localhost and internal IPs
    const blockedPatterns = [
      /^https?:\/\/localhost/i,
      /^https?:\/\/127\./,
      /^https?:\/\/10\./,
      /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^https?:\/\/192\.168\./,
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(url)) {
        throw new Error('Access blocked for security reasons');
      }
    }

    const response = await fetch(url, { method });
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return await response.json();
    }

    // For HTML, extract just the text content (simplified)
    const text = await response.text();
    if (text.length > 5000) {
      return text.substring(0, 5000) + '...';
    }
    return text;
  }

  if (name === 'web_search') {
    const query = args.query as string;
    // Use DuckDuckGo instant answer API
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const response = await fetch(searchUrl);
    const data = await response.json() as { AbstractText?: string; RelatedTopics?: Array<{ Text?: string }> };

    let result = data.AbstractText || '';
    if (!result && data.RelatedTopics?.length) {
      result = data.RelatedTopics.slice(0, 5).map(t => t.Text).filter(Boolean).join('\n\n');
    }
    return result || 'No results found';
  }

  if (name === 'get_timestamp') {
    return new Date().toISOString();
  }

  throw new Error(`Unknown tool: ${name}`);
}

/**
 * Execute a scheduled task using Claude
 */
async function executeTask(task: ScheduledTask): Promise<{ success: boolean; result?: string; error?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'API key not configured' };
  }

  const client = new Anthropic({ apiKey });
  const user = getUser(task.chatId);
  const userName = user?.firstName || 'User';

  try {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: task.task },
    ];

    let response: Anthropic.Message;
    let turns = 0;
    const maxTurns = 5; // Allow more turns for complex tasks

    while (turns < maxTurns) {
      turns++;

      response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: `You are SecureAgent, executing a scheduled task for ${userName}.

This task was scheduled by the user to run automatically. Complete the task thoroughly and provide a clear, actionable summary of the results.

Task: "${task.task}"

Instructions:
- Use available tools to search the web, fetch data, or get information as needed
- Be thorough but concise in your response
- Format the response nicely for Telegram (use simple formatting, avoid markdown tables)
- If the task involves news/updates, summarize the key points
- If the task is a reminder, confirm it clearly

Current time: ${new Date().toISOString()}`,
        messages,
        tools: TASK_TOOLS,
      });

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) {
        break;
      }

      // Execute tools
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        try {
          const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: typeof result === 'string' ? result : JSON.stringify(result),
          });
        } catch (error) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: (error as Error).message }),
            is_error: true,
          });
        }
      }

      // Add to conversation for next turn
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }

    // Extract text response
    const textBlocks = response!.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    const result = textBlocks.map(b => b.text).join('\n');

    return { success: true, result: result || 'Task completed but no output generated.' };
  } catch (error) {
    console.error('Task execution error:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Process all due tasks
 */
async function processDueTasks(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{ taskId: string; chatId: string; success: boolean; error?: string }>;
}> {
  const dueTasks = getDueTasks();
  const results: Array<{ taskId: string; chatId: string; success: boolean; error?: string }> = [];

  let succeeded = 0;
  let failed = 0;

  for (const task of dueTasks) {
    console.log(`Executing task ${task.id}: ${task.task.substring(0, 50)}...`);

    // Execute the task
    const execution = await executeTask(task);

    // Update task status
    updateTaskAfterExecution(task.id, execution);

    // Send result to user
    if (execution.success && execution.result) {
      const message = `⏰ <b>Scheduled Task Completed</b>\n\n📋 <b>Task:</b> ${task.task}\n\n${execution.result}`;

      // Split if too long
      const maxLength = 4096;
      if (message.length <= maxLength) {
        await sendTelegramMessage(task.chatId, message);
      } else {
        // Send header first
        await sendTelegramMessage(
          task.chatId,
          `⏰ <b>Scheduled Task Completed</b>\n\n📋 <b>Task:</b> ${task.task}`
        );

        // Then send result in chunks
        let remaining = execution.result;
        while (remaining.length > 0) {
          await sendTelegramMessage(task.chatId, remaining.slice(0, maxLength));
          remaining = remaining.slice(maxLength);
        }
      }

      succeeded++;
    } else {
      // Notify user of failure
      await sendTelegramMessage(
        task.chatId,
        `❌ <b>Scheduled Task Failed</b>\n\n📋 <b>Task:</b> ${task.task}\n\n⚠️ Error: ${execution.error || 'Unknown error'}\n\nThe task will retry at the next scheduled time.`
      );
      failed++;
    }

    results.push({
      taskId: task.id,
      chatId: task.chatId,
      success: execution.success,
      error: execution.error,
    });
  }

  return {
    processed: dueTasks.length,
    succeeded,
    failed,
    results,
  };
}

// =============================================================================
// Handler
// =============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;

  // Verify this is a legitimate cron request or manual trigger
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  // For manual testing, allow POST with secret
  if (method === 'POST') {
    const body = req.body as { secret?: string } | undefined;
    if (cronSecret && body?.secret !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // GET - Cron endpoint (Vercel Cron will call this)
  // POST - Manual trigger for testing
  if (method === 'GET' || method === 'POST') {
    const stats = getStats();

    // If no due tasks, return early
    if (stats.dueTasks === 0) {
      return res.status(200).json({
        ok: true,
        message: 'No tasks due',
        stats,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`Processing ${stats.dueTasks} due tasks...`);

    try {
      const result = await processDueTasks();

      return res.status(200).json({
        ok: true,
        message: `Processed ${result.processed} tasks`,
        ...result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Task processing error:', error);
      return res.status(500).json({
        ok: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
