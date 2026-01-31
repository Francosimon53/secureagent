/**
 * Agent API Endpoint
 *
 * Unified REST API for the SecureAgent with full tool execution capabilities.
 * This endpoint provides access to the complete agent functionality including:
 * - Conversational AI with Claude
 * - Tool execution (file, HTTP, shell, data operations)
 * - Memory management
 * - Skill execution
 *
 * Endpoints:
 * - POST /api/agent/chat - Send a message and get a response
 * - POST /api/agent/tool - Execute a tool directly
 * - GET /api/agent/tools - List available tools
 * - GET /api/agent/conversation/:id - Get conversation history
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// Tool definitions for Claude
const AVAILABLE_TOOLS: Anthropic.Tool[] = [
  // Data tools (LOW risk - auto-approved)
  {
    name: 'json_parse',
    description: 'Parse a JSON string into an object',
    input_schema: {
      type: 'object' as const,
      properties: {
        json: { type: 'string', description: 'JSON string to parse' },
      },
      required: ['json'],
    },
  },
  {
    name: 'base64_encode',
    description: 'Encode text to base64',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'Text to encode' },
      },
      required: ['text'],
    },
  },
  {
    name: 'base64_decode',
    description: 'Decode base64 to text',
    input_schema: {
      type: 'object' as const,
      properties: {
        encoded: { type: 'string', description: 'Base64 string to decode' },
      },
      required: ['encoded'],
    },
  },
  {
    name: 'compute_hash',
    description: 'Compute hash of data (md5, sha1, sha256, sha512)',
    input_schema: {
      type: 'object' as const,
      properties: {
        data: { type: 'string', description: 'Data to hash' },
        algorithm: { type: 'string', enum: ['md5', 'sha1', 'sha256', 'sha512'], description: 'Hash algorithm' },
      },
      required: ['data', 'algorithm'],
    },
  },
  {
    name: 'generate_uuid',
    description: 'Generate a UUID v4',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_timestamp',
    description: 'Get current timestamp',
    input_schema: {
      type: 'object' as const,
      properties: {
        format: { type: 'string', enum: ['iso', 'unix', 'unix_ms'], description: 'Timestamp format' },
      },
      required: [],
    },
  },
  // HTTP tools (HIGH risk - shown for demo but restricted)
  {
    name: 'http_request',
    description: 'Make an HTTP request to a URL. Restricted to public APIs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to request' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP method' },
        headers: { type: 'object', description: 'Request headers' },
        body: { type: 'string', description: 'Request body (for POST/PUT)' },
      },
      required: ['url'],
    },
  },
  // Skill tools (dynamic skills)
  {
    name: 'run_skill',
    description: 'Execute a previously created skill by name',
    input_schema: {
      type: 'object' as const,
      properties: {
        skill_name: { type: 'string', description: 'Name of the skill to run' },
        params: { type: 'object', description: 'Parameters to pass to the skill' },
      },
      required: ['skill_name'],
    },
  },
  {
    name: 'list_skills',
    description: 'List all available skills',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  // Browser tools (HIGH risk - web automation)
  {
    name: 'browser_navigate',
    description: 'Navigate browser to a URL and return page title',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'], description: 'When to consider navigation complete' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current page',
    input_schema: {
      type: 'object' as const,
      properties: {
        fullPage: { type: 'boolean', description: 'Capture full page' },
        selector: { type: 'string', description: 'CSS selector of element to screenshot' },
      },
      required: [],
    },
  },
  {
    name: 'browser_click',
    description: 'Click an element on the page',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector of element to click' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector of input element' },
        text: { type: 'string', description: 'Text to type' },
        clear: { type: 'boolean', description: 'Clear field before typing' },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'browser_extract',
    description: 'Extract text content from page or element',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector (default: entire page)' },
        type: { type: 'string', enum: ['text', 'html'], description: 'Extract text or HTML' },
      },
      required: [],
    },
  },
  {
    name: 'browser_query',
    description: 'Query elements on the page and get their info',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector to query' },
        limit: { type: 'number', description: 'Max elements to return (default: 10)' },
      },
      required: ['selector'],
    },
  },
];

// Tool execution handlers
async function executeDataTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const crypto = await import('crypto');

  switch (name) {
    case 'json_parse':
      return JSON.parse(args.json as string);
    case 'base64_encode':
      return Buffer.from(args.text as string).toString('base64');
    case 'base64_decode':
      return Buffer.from(args.encoded as string, 'base64').toString('utf-8');
    case 'compute_hash':
      return crypto.createHash(args.algorithm as string).update(args.data as string).digest('hex');
    case 'generate_uuid':
      return crypto.randomUUID();
    case 'get_timestamp': {
      const format = (args.format as string) || 'iso';
      const now = Date.now();
      if (format === 'unix') return Math.floor(now / 1000);
      if (format === 'unix_ms') return now;
      return new Date(now).toISOString();
    }
    default:
      throw new Error(`Unknown data tool: ${name}`);
  }
}

async function executeHttpTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name !== 'http_request') {
    throw new Error(`Unknown HTTP tool: ${name}`);
  }

  const url = args.url as string;
  const method = (args.method as string) || 'GET';
  const headers = (args.headers as Record<string, string>) || {};
  const body = args.body as string | undefined;

  // Security: Block localhost and internal IPs
  const blockedPatterns = [
    /^https?:\/\/localhost/i,
    /^https?:\/\/127\./,
    /^https?:\/\/0\./,
    /^https?:\/\/10\./,
    /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^https?:\/\/192\.168\./,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(url)) {
      throw new Error(`Access to ${url} is blocked for security reasons`);
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      'User-Agent': 'SecureAgent/1.0',
      ...headers,
    },
    body: body && ['POST', 'PUT', 'PATCH'].includes(method) ? body : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  let data: unknown;

  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    data,
  };
}

// Skill system integration
import { createSkillSystem, type SkillSystem } from '../src/skills/index.js';

// Browser automation
import { PuppeteerBrowser } from '../src/tools/browser.js';

// Shared browser instance for agent
let agentBrowser: PuppeteerBrowser | null = null;

async function getAgentBrowser(): Promise<PuppeteerBrowser> {
  if (!agentBrowser) {
    agentBrowser = new PuppeteerBrowser();
  }
  return agentBrowser;
}

let skillSystem: SkillSystem | null = null;

async function getSkillSystem(): Promise<SkillSystem> {
  if (!skillSystem) {
    skillSystem = createSkillSystem({ persistToFile: false });
    await skillSystem.initialize();
  }
  return skillSystem;
}

async function executeSkillTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const system = await getSkillSystem();

  if (name === 'list_skills') {
    const result = await system.toolHandler.handleToolCall('list_skills', {});
    return result.result;
  }

  if (name === 'run_skill') {
    const result = await system.toolHandler.handleToolCall('run_skill', {
      skill_name: args.skill_name,
      params: args.params || {},
    });
    if (!result.success) {
      throw new Error(result.error || 'Skill execution failed');
    }
    return result.result;
  }

  throw new Error(`Unknown skill tool: ${name}`);
}

async function executeBrowserTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const browser = await getAgentBrowser();

  switch (name) {
    case 'browser_navigate':
      return browser.navigate(
        args.url as string,
        (args.waitUntil as 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2') || 'load'
      );
    case 'browser_screenshot':
      return browser.screenshot({
        fullPage: args.fullPage as boolean,
        selector: args.selector as string,
      });
    case 'browser_click':
      return browser.click(args.selector as string);
    case 'browser_type':
      return browser.type(
        args.selector as string,
        args.text as string,
        { clear: args.clear as boolean }
      );
    case 'browser_extract':
      return args.type === 'html'
        ? browser.extractHtml(args.selector as string)
        : browser.extractText(args.selector as string);
    case 'browser_query':
      return browser.query(args.selector as string, (args.limit as number) || 10);
    default:
      throw new Error(`Unknown browser tool: ${name}`);
  }
}

// Main tool execution router
async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Data tools
  if (['json_parse', 'base64_encode', 'base64_decode', 'compute_hash', 'generate_uuid', 'get_timestamp'].includes(name)) {
    return executeDataTool(name, args);
  }

  // HTTP tools
  if (name === 'http_request') {
    return executeHttpTool(name, args);
  }

  // Skill tools
  if (['run_skill', 'list_skills'].includes(name)) {
    return executeSkillTool(name, args);
  }

  // Browser tools
  if (name.startsWith('browser_')) {
    return executeBrowserTool(name, args);
  }

  throw new Error(`Unknown tool: ${name}`);
}

// Conversation storage (in-memory for serverless)
const conversations = new Map<string, Anthropic.MessageParam[]>();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method, query } = req;
  const action = query.action as string | undefined;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse body - wrap in try-catch for Vercel dev server compatibility
  let body: Record<string, unknown> = {};
  try {
    const rawBody = req.body;
    if (typeof rawBody === 'string') {
      body = JSON.parse(rawBody);
    } else if (rawBody && typeof rawBody === 'object') {
      body = rawBody;
    }
  } catch {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid JSON in request body',
    });
  }

  try {
    // GET /api/agent/tools - List available tools
    if (method === 'GET' && action === 'tools') {
      return res.status(200).json({
        success: true,
        tools: AVAILABLE_TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        })),
      });
    }

    // GET /api/agent/conversation?id=xxx - Get conversation history
    if (method === 'GET' && action === 'conversation') {
      const conversationId = query.id as string;
      if (!conversationId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'id query parameter is required',
        });
      }

      const messages = conversations.get(conversationId) || [];
      return res.status(200).json({
        success: true,
        conversationId,
        messages,
      });
    }

    // POST /api/agent/tool - Execute a tool directly
    if (method === 'POST' && action === 'tool') {
      const { name, arguments: args } = body;

      if (!name) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'name is required',
        });
      }

      const result = await executeTool(name, args || {});
      return res.status(200).json({
        success: true,
        tool: name,
        result,
      });
    }

    // POST /api/agent/chat - Chat with agent
    if (method === 'POST' && (action === 'chat' || !action)) {
      const { message, conversationId, maxTurns = 5 } = body;

      if (!message) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'message is required',
        });
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: 'Configuration Error',
          message: 'ANTHROPIC_API_KEY not configured',
        });
      }

      const client = new Anthropic({ apiKey });
      const convId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Get or create conversation history
      let messages = conversations.get(convId) || [];
      messages.push({ role: 'user', content: message });

      // Tool use loop
      let response: Anthropic.Message;
      let turns = 0;
      const toolResults: Array<{ tool: string; result: unknown }> = [];

      while (turns < maxTurns) {
        turns++;

        response = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: `You are SecureAgent, a helpful AI assistant with access to tools for data processing, HTTP requests, browser automation, and custom skills. Use tools when appropriate to help the user. Be concise and helpful.

Available tools:
- Data tools: json_parse, base64_encode, base64_decode, compute_hash, generate_uuid, get_timestamp
- HTTP tools: http_request (for fetching data from public APIs)
- Browser tools: browser_navigate, browser_screenshot, browser_click, browser_type, browser_extract, browser_query (for web automation)
- Skill tools: run_skill, list_skills (for running custom skills)

When using browser tools:
1. First navigate to a URL with browser_navigate
2. Use browser_query to find elements by CSS selector
3. Use browser_click and browser_type to interact
4. Use browser_extract to get page content

When using tools, explain what you're doing briefly.`,
          messages,
          tools: AVAILABLE_TOOLS,
        });

        // Check if we need to execute tools
        const toolUseBlocks = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
        );

        if (toolUseBlocks.length === 0) {
          // No tool calls, we're done
          break;
        }

        // Execute tools
        const toolResultContents: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          try {
            const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
            toolResults.push({ tool: toolUse.name, result });
            toolResultContents.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            });
          } catch (error) {
            toolResults.push({ tool: toolUse.name, result: { error: (error as Error).message } });
            toolResultContents.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: (error as Error).message }),
              is_error: true,
            });
          }
        }

        // Add assistant response and tool results to messages
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResultContents });
      }

      // Extract final text response
      const textBlocks = response!.content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );
      const responseText = textBlocks.map(b => b.text).join('\n');

      // Store conversation
      messages.push({ role: 'assistant', content: response!.content });
      conversations.set(convId, messages);

      return res.status(200).json({
        success: true,
        conversationId: convId,
        response: responseText,
        toolsUsed: toolResults.length > 0 ? toolResults : undefined,
        model: 'claude-sonnet-4-20250514',
        usage: {
          inputTokens: response!.usage.input_tokens,
          outputTokens: response!.usage.output_tokens,
        },
      });
    }

    // GET /api/agent - API info
    if (method === 'GET' && !action) {
      return res.status(200).json({
        name: 'SecureAgent API',
        version: '1.0.0',
        description: 'AI agent with tool execution capabilities',
        endpoints: {
          chat: {
            method: 'POST',
            path: '/api/agent?action=chat',
            body: { message: 'string', conversationId: 'string (optional)', maxTurns: 'number (optional, default 5)' },
          },
          tool: {
            method: 'POST',
            path: '/api/agent?action=tool',
            body: { name: 'string', arguments: 'object' },
          },
          tools: {
            method: 'GET',
            path: '/api/agent?action=tools',
          },
          conversation: {
            method: 'GET',
            path: '/api/agent?action=conversation&id=<conversationId>',
          },
        },
        availableTools: AVAILABLE_TOOLS.map(t => t.name),
      });
    }

    return res.status(400).json({
      error: 'Bad Request',
      message: `Unknown action: ${action}`,
    });

  } catch (error) {
    console.error('Agent API error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: (error as Error).message,
    });
  }
}
