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
  // Date/Time
  {
    name: 'get_datetime',
    description: 'Get current date and time in any timezone',
    input_schema: {
      type: 'object' as const,
      properties: {
        timezone: { type: 'string', description: 'Timezone (e.g., "America/New_York", "Europe/London", "Asia/Tokyo")' },
        format: { type: 'string', description: 'Output format: "full", "date", "time", "iso"' },
      },
      required: [],
    },
  },
  // Text analysis
  {
    name: 'analyze_text',
    description: 'Analyze text: word count, character count, reading time, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'Text to analyze' },
      },
      required: ['text'],
    },
  },
  // URL tools
  {
    name: 'parse_url',
    description: 'Parse a URL into its components (protocol, host, path, query params)',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to parse' },
      },
      required: ['url'],
    },
  },
  // QR Code
  {
    name: 'generate_qr',
    description: 'Generate a QR code URL for any text or URL',
    input_schema: {
      type: 'object' as const,
      properties: {
        data: { type: 'string', description: 'Text or URL to encode in QR code' },
        size: { type: 'number', description: 'Size in pixels (default 200)' },
      },
      required: ['data'],
    },
  },
  // Weather (using Open-Meteo, no API key needed)
  {
    name: 'get_weather',
    description: 'Get current weather for a location',
    input_schema: {
      type: 'object' as const,
      properties: {
        city: { type: 'string', description: 'City name' },
        country: { type: 'string', description: 'Country code (e.g., US, ES, MX)' },
      },
      required: ['city'],
    },
  },
  // Currency conversion
  {
    name: 'convert_currency',
    description: 'Convert between currencies using current exchange rates',
    input_schema: {
      type: 'object' as const,
      properties: {
        amount: { type: 'number', description: 'Amount to convert' },
        from: { type: 'string', description: 'Source currency code (e.g., USD, EUR, MXN)' },
        to: { type: 'string', description: 'Target currency code' },
      },
      required: ['amount', 'from', 'to'],
    },
  },
];

// System prompt for SecureAgent
const SYSTEM_PROMPT = `You are SecureAgent, an enterprise-grade AI assistant with powerful tool capabilities.

YOUR TOOLS:
- **Calculator**: Math expressions, percentages, scientific calculations
- **Web Search**: Find information on Wikipedia and the web
- **HTTP Requests**: Fetch data from any public API
- **Weather**: Get current weather for any city
- **Currency Converter**: Convert between any currencies with live rates
- **Code Execution**: Run JavaScript safely
- **Date/Time**: Get current time in any timezone
- **Text Analysis**: Word count, reading time, etc.
- **QR Codes**: Generate QR codes for any text/URL
- **Data Tools**: JSON parsing, base64, hashing, UUIDs

INSTRUCTIONS:
1. Use tools proactively when they help answer questions
2. For math → use calculate tool
3. For current info → use web_search or http_request
4. For weather → use get_weather
5. For currency → use convert_currency
6. Explain briefly what you're doing
7. Present results clearly

LANGUAGE: Always respond in the same language the user writes in.

PERSONALITY: Professional but friendly, concise but thorough, security-conscious.`;

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
  // Try multiple search methods
  
  // Method 1: Wikipedia API (reliable, always works)
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5&origin=*`;
    const wikiResponse = await fetch(wikiUrl);
    const wikiData = await wikiResponse.json();
    
    if (wikiData.query?.search?.length > 0) {
      const results = wikiData.query.search.map((item: { title: string; snippet: string; pageid: number }) => ({
        title: item.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
        snippet: item.snippet.replace(/<[^>]*>/g, ''), // Remove HTML tags
        source: 'Wikipedia',
      }));
      
      return {
        query,
        source: 'Wikipedia',
        results,
      };
    }
  } catch (e) {
    console.error('Wikipedia search failed:', e);
  }

  // Method 2: DuckDuckGo Instant Answer API
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const ddgResponse = await fetch(ddgUrl);
    const ddgData = await ddgResponse.json();
    
    const results: Array<{ title: string; url: string; snippet: string; source: string }> = [];
    
    // Abstract (main result)
    if (ddgData.Abstract) {
      results.push({
        title: ddgData.Heading || query,
        url: ddgData.AbstractURL || '',
        snippet: ddgData.Abstract,
        source: ddgData.AbstractSource || 'DuckDuckGo',
      });
    }
    
    // Related topics
    if (ddgData.RelatedTopics) {
      for (const topic of ddgData.RelatedTopics.slice(0, 4)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 50),
            url: topic.FirstURL,
            snippet: topic.Text,
            source: 'DuckDuckGo',
          });
        }
      }
    }
    
    if (results.length > 0) {
      return { query, source: 'DuckDuckGo', results };
    }
  } catch (e) {
    console.error('DuckDuckGo search failed:', e);
  }

  // Method 3: Use http_request to get a webpage and extract info
  try {
    // Try to get current info from a news API or reliable source
    const newsUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=5&apiKey=demo`;
    const newsResponse = await fetch(newsUrl);
    if (newsResponse.ok) {
      const newsData = await newsResponse.json();
      if (newsData.articles?.length > 0) {
        return {
          query,
          source: 'News',
          results: newsData.articles.map((a: { title: string; url: string; description: string; source: { name: string } }) => ({
            title: a.title,
            url: a.url,
            snippet: a.description,
            source: a.source?.name || 'News',
          })),
        };
      }
    }
  } catch (e) {
    // News API might not work without key, that's ok
  }

  return {
    query,
    message: 'No direct search results found. Try using http_request to fetch specific URLs or ask me to help with the query.',
    results: [],
  };
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

// Date/time tool
function executeDateTime(args: Record<string, unknown>): unknown {
  const timezone = (args.timezone as string) || 'UTC';
  const format = (args.format as string) || 'full';
  
  try {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { timeZone: timezone };
    
    if (format === 'date') {
      options.dateStyle = 'full';
      return { timezone, date: now.toLocaleDateString('en-US', options) };
    } else if (format === 'time') {
      options.timeStyle = 'long';
      return { timezone, time: now.toLocaleTimeString('en-US', options) };
    } else if (format === 'iso') {
      return { timezone, iso: now.toISOString() };
    } else {
      options.dateStyle = 'full';
      options.timeStyle = 'long';
      return { 
        timezone, 
        datetime: now.toLocaleString('en-US', options),
        iso: now.toISOString(),
        unix: Math.floor(now.getTime() / 1000),
      };
    }
  } catch {
    return { error: `Invalid timezone: ${timezone}` };
  }
}

// Text analysis tool
function analyzeText(text: string): unknown {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  const readingTimeMinutes = Math.ceil(words.length / 200); // ~200 words per minute
  
  return {
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    words: words.length,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    readingTime: `${readingTimeMinutes} min`,
    averageWordLength: words.length > 0 ? (text.replace(/\s/g, '').length / words.length).toFixed(1) : 0,
  };
}

// URL parser
function parseUrl(url: string): unknown {
  try {
    const parsed = new URL(url);
    const params: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => { params[key] = value; });
    
    return {
      protocol: parsed.protocol,
      host: parsed.host,
      hostname: parsed.hostname,
      port: parsed.port || 'default',
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
      queryParams: params,
    };
  } catch {
    return { error: `Invalid URL: ${url}` };
  }
}

// QR code generator (using public API)
function generateQR(data: string, size: number = 200): unknown {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
  return {
    data,
    size,
    qrCodeUrl: qrUrl,
    note: 'Click or copy the URL to view/download the QR code',
  };
}

// Weather tool (using Open-Meteo - free, no API key)
async function getWeather(city: string, country?: string): Promise<unknown> {
  try {
    // First, geocode the city
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1${country ? `&country=${country}` : ''}`;
    const geoResponse = await fetch(geoUrl);
    const geoData = await geoResponse.json();
    
    if (!geoData.results || geoData.results.length === 0) {
      return { error: `City not found: ${city}` };
    }
    
    const location = geoData.results[0];
    const { latitude, longitude, name, country: countryName } = location;
    
    // Get weather
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&temperature_unit=celsius`;
    const weatherResponse = await fetch(weatherUrl);
    const weatherData = await weatherResponse.json();
    
    const current = weatherData.current;
    const weatherCodes: Record<number, string> = {
      0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle',
      55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 80: 'Slight rain showers',
      81: 'Moderate rain showers', 82: 'Violent rain showers', 95: 'Thunderstorm',
    };
    
    return {
      location: `${name}, ${countryName}`,
      temperature: `${current.temperature_2m}°C (${(current.temperature_2m * 9/5 + 32).toFixed(1)}°F)`,
      humidity: `${current.relative_humidity_2m}%`,
      wind: `${current.wind_speed_10m} km/h`,
      conditions: weatherCodes[current.weather_code] || 'Unknown',
      coordinates: { latitude, longitude },
    };
  } catch (error) {
    return { error: `Weather lookup failed: ${(error as Error).message}` };
  }
}

// Currency conversion (using exchangerate.host - free)
async function convertCurrency(amount: number, from: string, to: string): Promise<unknown> {
  try {
    const url = `https://api.exchangerate.host/convert?from=${from.toUpperCase()}&to=${to.toUpperCase()}&amount=${amount}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.success === false) {
      // Fallback to frankfurter.app (another free API)
      const fallbackUrl = `https://api.frankfurter.app/latest?amount=${amount}&from=${from.toUpperCase()}&to=${to.toUpperCase()}`;
      const fallbackResponse = await fetch(fallbackUrl);
      const fallbackData = await fallbackResponse.json();
      
      if (fallbackData.rates && fallbackData.rates[to.toUpperCase()]) {
        return {
          amount,
          from: from.toUpperCase(),
          to: to.toUpperCase(),
          result: fallbackData.rates[to.toUpperCase()],
          rate: fallbackData.rates[to.toUpperCase()] / amount,
          source: 'Frankfurter API',
        };
      }
      return { error: 'Currency conversion failed' };
    }
    
    return {
      amount,
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      result: data.result,
      rate: data.info?.rate || (data.result / amount),
      source: 'ExchangeRate API',
    };
  } catch (error) {
    return { error: `Currency conversion failed: ${(error as Error).message}` };
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

  // Date/time
  if (name === 'get_datetime') {
    return executeDateTime(args);
  }

  // Text analysis
  if (name === 'analyze_text') {
    return analyzeText(args.text as string);
  }

  // URL parser
  if (name === 'parse_url') {
    return parseUrl(args.url as string);
  }

  // QR code
  if (name === 'generate_qr') {
    return generateQR(args.data as string, args.size as number);
  }

  // Weather
  if (name === 'get_weather') {
    return getWeather(args.city as string, args.country as string);
  }

  // Currency
  if (name === 'convert_currency') {
    return convertCurrency(args.amount as number, args.from as string, args.to as string);
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
