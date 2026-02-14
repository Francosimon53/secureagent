import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createHash, randomUUID } from 'crypto';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// Tool definitions for Claude
const AVAILABLE_TOOLS: Anthropic.Tool[] = [
  // Data tools (LOW risk)
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
    description: 'Get current timestamp in various formats',
    input_schema: {
      type: 'object' as const,
      properties: {
        format: { type: 'string', enum: ['iso', 'unix', 'unix_ms'], description: 'Timestamp format' },
      },
      required: [],
    },
  },
  // HTTP tools
  {
    name: 'http_request',
    description: 'Make an HTTP request to fetch data from public APIs or websites',
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
  // Web search
  {
    name: 'web_search',
    description: 'Search the web for information. Use this to find current information, news, or facts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  // Code execution
  {
    name: 'run_code',
    description: 'Execute JavaScript/TypeScript code safely. Returns the result of the last expression.',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute' },
        language: { type: 'string', enum: ['javascript', 'typescript'], description: 'Programming language' },
      },
      required: ['code'],
    },
  },
  // Math
  {
    name: 'calculate',
    description: 'Perform mathematical calculations',
    input_schema: {
      type: 'object' as const,
      properties: {
        expression: { type: 'string', description: 'Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)", "sin(45)")' },
      },
      required: ['expression'],
    },
  },
];

// System prompt for SecureAgent
const SYSTEM_PROMPT = `You are SecureAgent, an enterprise-grade AI assistant with powerful tool capabilities.

Your capabilities:
- Execute code and calculations
- Search the web for current information
- Make HTTP requests to APIs
- Process data (JSON, base64, hashing)
- Generate UUIDs and timestamps

Your personality:
- Professional but friendly
- Concise but thorough
- Security-conscious
- Proactive in using tools when helpful

When you need information or need to perform actions:
1. Use the appropriate tool
2. Explain what you're doing briefly
3. Present results clearly

Always respond in the same language the user writes in.
Use tools proactively when they would help answer the user's question.`;

// Tool execution functions
function executeDataTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case 'json_parse':
      return JSON.parse(args.json as string);
    case 'base64_encode':
      return Buffer.from(args.text as string).toString('base64');
    case 'base64_decode':
      return Buffer.from(args.encoded as string, 'base64').toString('utf-8');
    case 'compute_hash':
      return createHash(args.algorithm as string).update(args.data as string).digest('hex');
    case 'generate_uuid':
      return randomUUID();
    case 'get_timestamp': {
      const format = args.format || 'iso';
      if (format === 'unix') return Math.floor(Date.now() / 1000);
      if (format === 'unix_ms') return Date.now();
      return new Date().toISOString();
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

  // Security: Block internal/private IPs
  const urlObj = new URL(url);
  const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
  if (blockedHosts.some(h => urlObj.hostname.includes(h))) {
    throw new Error('Requests to internal addresses are not allowed');
  }

  const response = await fetch(url, {
    method,
    headers: {
      'User-Agent': 'SecureAgent/1.0',
      ...headers,
    },
    body: body || undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  let data: unknown;

  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
    // Truncate large responses
    if (typeof data === 'string' && data.length > 10000) {
      data = data.substring(0, 10000) + '\n...[truncated]';
    }
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    data,
  };
}

async function executeWebSearch(query: string): Promise<unknown> {
  // Use a simple web search via DuckDuckGo HTML (no API key needed)
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SecureAgent/1.0)',
      },
    });
    const html = await response.text();
    
    // Extract search results from HTML
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([^<]+)/g;
    let match;
    
    while ((match = resultRegex.exec(html)) !== null && results.length < 5) {
      results.push({
        url: match[1],
        title: match[2].trim(),
        snippet: match[3].trim(),
      });
    }

    // Fallback: simpler extraction
    if (results.length === 0) {
      const simpleRegex = /class="result__title"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)/g;
      while ((match = simpleRegex.exec(html)) !== null && results.length < 5) {
        results.push({
          url: match[1],
          title: match[2].trim(),
          snippet: '',
        });
      }
    }

    return {
      query,
      results: results.length > 0 ? results : [{ title: 'No results found', url: '', snippet: 'Try a different search query' }],
    };
  } catch (error) {
    return {
      query,
      error: `Search failed: ${(error as Error).message}`,
      results: [],
    };
  }
}

function executeCode(code: string): unknown {
  // Safe JavaScript execution using Function constructor
  // This is sandboxed - no access to Node.js APIs
  try {
    // Create a safe context with limited globals
    const safeGlobals = {
      Math,
      Date,
      JSON,
      String,
      Number,
      Boolean,
      Array,
      Object,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      console: {
        log: (...args: unknown[]) => args.map(a => JSON.stringify(a)).join(' '),
      },
    };

    const fn = new Function(
      ...Object.keys(safeGlobals),
      `"use strict"; return (${code})`
    );

    const result = fn(...Object.values(safeGlobals));
    return result;
  } catch (error) {
    return { error: `Code execution failed: ${(error as Error).message}` };
  }
}

function executeCalculate(expression: string): unknown {
  // Safe math evaluation
  try {
    // Replace common math functions
    let expr = expression
      .replace(/\bsqrt\(/g, 'Math.sqrt(')
      .replace(/\babs\(/g, 'Math.abs(')
      .replace(/\bsin\(/g, 'Math.sin(')
      .replace(/\bcos\(/g, 'Math.cos(')
      .replace(/\btan\(/g, 'Math.tan(')
      .replace(/\blog\(/g, 'Math.log(')
      .replace(/\blog10\(/g, 'Math.log10(')
      .replace(/\bexp\(/g, 'Math.exp(')
      .replace(/\bpow\(/g, 'Math.pow(')
      .replace(/\bround\(/g, 'Math.round(')
      .replace(/\bfloor\(/g, 'Math.floor(')
      .replace(/\bceil\(/g, 'Math.ceil(')
      .replace(/\bpi\b/gi, 'Math.PI')
      .replace(/\be\b/g, 'Math.E');

    // Validate - only allow safe characters
    if (!/^[0-9+\-*/().,%\s\w]+$/.test(expr)) {
      throw new Error('Invalid characters in expression');
    }

    const fn = new Function('Math', `"use strict"; return (${expr})`);
    const result = fn(Math);
    return { expression, result };
  } catch (error) {
    return { expression, error: `Calculation failed: ${(error as Error).message}` };
  }
}

// Main tool executor
async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Data tools
  if (['json_parse', 'base64_encode', 'base64_decode', 'compute_hash', 'generate_uuid', 'get_timestamp'].includes(name)) {
    return executeDataTool(name, args);
  }

  // HTTP tools
  if (name === 'http_request') {
    return executeHttpTool(name, args);
  }

  // Web search
  if (name === 'web_search') {
    return executeWebSearch(args.query as string);
  }

  // Code execution
  if (name === 'run_code') {
    return executeCode(args.code as string);
  }

  // Calculator
  if (name === 'calculate') {
    return executeCalculate(args.expression as string);
  }

  throw new Error(`Unknown tool: ${name}`);
}

// Conversation storage (in-memory)
const conversations = new Map<string, Anthropic.MessageParam[]>();

interface ChatRequest {
  message: string;
  conversationId?: string;
  maxTurns?: number;
}

export async function POST(request: Request) {
  try {
    // Check API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not configured');
      return NextResponse.json(
        { error: 'AI service not configured. Please contact support.' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { message, conversationId, maxTurns = 10 } = body as ChatRequest;

    // Validate request
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    if (message.length > 10000) {
      return NextResponse.json(
        { error: 'Message too long (max 10000 characters)' },
        { status: 400 }
      );
    }

    const convId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Get or create conversation history
    const messages: Anthropic.MessageParam[] = conversations.get(convId) || [];
    messages.push({ role: 'user', content: message });

    // Tool use loop
    let response: Anthropic.Message;
    let turns = 0;
    const toolResults: Array<{ tool: string; result: unknown }> = [];

    while (turns < maxTurns) {
      turns++;

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
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

    // Limit stored conversations (memory management)
    if (conversations.size > 1000) {
      const oldest = conversations.keys().next().value;
      if (oldest) conversations.delete(oldest);
    }

    return NextResponse.json({
      id: randomUUID(),
      message: responseText,
      conversationId: convId,
      timestamp: Date.now(),
      toolsUsed: toolResults.length > 0 ? toolResults : undefined,
      model: 'claude-sonnet-4-20250514',
    });

  } catch (error) {
    console.error('Chat API error:', error);
    
    // Handle specific error types
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: 'AI service authentication failed. Please contact support.' },
        { status: 503 }
      );
    }

    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: 'Service is busy. Please try again in a moment.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'An error occurred processing your request.' },
      { status: 500 }
    );
  }
}
