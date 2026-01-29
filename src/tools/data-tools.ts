import { z } from 'zod';
import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import { defineTool, CommonSchemas, type ToolDefinition } from './registry.js';

// ============================================================================
// Data Tools - Data transformation and utilities
// ============================================================================

/**
 * Parse JSON
 * Risk: Low - Data parsing
 */
export const jsonParse = defineTool({
  name: 'data_json_parse',
  description: 'Parse a JSON string into an object.',
  version: '1.0.0',
  parameters: z.object({
    json: z.string().min(1).max(10 * 1024 * 1024),
    strict: z.boolean().optional().default(true),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 5000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    try {
      const result = JSON.parse(params.json);
      return {
        success: true,
        data: result,
        type: Array.isArray(result) ? 'array' : typeof result,
      };
    } catch (error) {
      if (params.strict) {
        throw error;
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Parse error',
      };
    }
  },
});

/**
 * Stringify to JSON
 * Risk: Low - Data formatting
 */
export const jsonStringify = defineTool({
  name: 'data_json_stringify',
  description: 'Convert an object to a JSON string.',
  version: '1.0.0',
  parameters: z.object({
    data: z.unknown(),
    pretty: z.boolean().optional().default(false),
    indent: z.number().int().min(0).max(8).optional().default(2),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 5000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    const indent = params.pretty ? params.indent : undefined;
    const result = JSON.stringify(params.data, null, indent);

    return {
      json: result,
      length: result.length,
    };
  },
});

/**
 * Query JSON with JSONPath-like syntax
 * Risk: Low - Data querying
 */
export const jsonQuery = defineTool({
  name: 'data_json_query',
  description: 'Query JSON data using a simple path expression (e.g., "users[0].name" or "items.*.id").',
  version: '1.0.0',
  parameters: z.object({
    data: z.unknown(),
    path: z.string().min(1).max(500),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 5000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    const result = queryJson(params.data, params.path);

    return {
      path: params.path,
      result,
      found: result !== undefined,
    };
  },
});

function queryJson(data: unknown, path: string): unknown {
  const parts = path.split(/\.|\[|\]/).filter(p => p !== '');
  let current: unknown = data;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (part === '*') {
      // Wildcard: return array of all values
      if (Array.isArray(current)) {
        return current;
      } else if (typeof current === 'object') {
        return Object.values(current);
      }
      return undefined;
    }

    if (typeof current === 'object' && current !== null) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Base64 encode
 * Risk: Low - Data encoding
 */
export const base64Encode = defineTool({
  name: 'data_base64_encode',
  description: 'Encode data to base64.',
  version: '1.0.0',
  parameters: z.object({
    data: z.string().max(10 * 1024 * 1024),
    urlSafe: z.boolean().optional().default(false),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 5000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    let encoded = Buffer.from(params.data, 'utf8').toString('base64');

    if (params.urlSafe) {
      encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    return {
      encoded,
      length: encoded.length,
      urlSafe: params.urlSafe,
    };
  },
});

/**
 * Base64 decode
 * Risk: Low - Data decoding
 */
export const base64Decode = defineTool({
  name: 'data_base64_decode',
  description: 'Decode base64 data to string.',
  version: '1.0.0',
  parameters: z.object({
    data: z.string().max(10 * 1024 * 1024),
    urlSafe: z.boolean().optional().default(false),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 5000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    let input = params.data;

    if (params.urlSafe) {
      input = input.replace(/-/g, '+').replace(/_/g, '/');
      // Add padding if needed
      while (input.length % 4) {
        input += '=';
      }
    }

    const decoded = Buffer.from(input, 'base64').toString('utf8');

    return {
      decoded,
      length: decoded.length,
    };
  },
});

/**
 * Hex encode
 * Risk: Low - Data encoding
 */
export const hexEncode = defineTool({
  name: 'data_hex_encode',
  description: 'Encode data to hexadecimal.',
  version: '1.0.0',
  parameters: z.object({
    data: z.string().max(5 * 1024 * 1024),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 5000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    const encoded = Buffer.from(params.data, 'utf8').toString('hex');

    return {
      encoded,
      length: encoded.length,
    };
  },
});

/**
 * Hex decode
 * Risk: Low - Data decoding
 */
export const hexDecode = defineTool({
  name: 'data_hex_decode',
  description: 'Decode hexadecimal data to string.',
  version: '1.0.0',
  parameters: z.object({
    data: z.string().max(10 * 1024 * 1024).regex(/^[0-9a-fA-F]+$/),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 5000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    const decoded = Buffer.from(params.data, 'hex').toString('utf8');

    return {
      decoded,
      length: decoded.length,
    };
  },
});

/**
 * URL encode
 * Risk: Low - Data encoding
 */
export const urlEncode = defineTool({
  name: 'data_url_encode',
  description: 'URL-encode a string.',
  version: '1.0.0',
  parameters: z.object({
    data: z.string().max(1024 * 1024),
    component: z.boolean().optional().default(true),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 1000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    const encoded = params.component
      ? encodeURIComponent(params.data)
      : encodeURI(params.data);

    return {
      encoded,
      length: encoded.length,
    };
  },
});

/**
 * URL decode
 * Risk: Low - Data decoding
 */
export const urlDecode = defineTool({
  name: 'data_url_decode',
  description: 'URL-decode a string.',
  version: '1.0.0',
  parameters: z.object({
    data: z.string().max(1024 * 1024),
    component: z.boolean().optional().default(true),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 1000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    const decoded = params.component
      ? decodeURIComponent(params.data)
      : decodeURI(params.data);

    return {
      decoded,
      length: decoded.length,
    };
  },
});

/**
 * Compute hash
 * Risk: Low - Cryptographic hashing
 */
export const computeHash = defineTool({
  name: 'data_hash',
  description: 'Compute a cryptographic hash of the input data.',
  version: '1.0.0',
  parameters: z.object({
    data: z.string().max(100 * 1024 * 1024),
    algorithm: z.enum(['md5', 'sha1', 'sha256', 'sha384', 'sha512']).optional().default('sha256'),
    encoding: z.enum(['hex', 'base64']).optional().default('hex'),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 30000,
  rateLimit: { maxCalls: 500, windowMs: 60000 },
  async execute(params) {
    const algorithm = params.algorithm ?? 'sha256';
    const encoding = params.encoding ?? 'hex';
    const hash = createHash(algorithm);
    hash.update(params.data);
    const digest = hash.digest(encoding);

    return {
      algorithm,
      encoding,
      hash: digest,
      inputLength: params.data.length,
    };
  },
});

/**
 * Compute HMAC
 * Risk: Medium - Uses secret key
 */
export const computeHmac = defineTool({
  name: 'data_hmac',
  description: 'Compute an HMAC (Hash-based Message Authentication Code).',
  version: '1.0.0',
  parameters: z.object({
    data: z.string().max(100 * 1024 * 1024),
    key: z.string().min(1).max(1024),
    algorithm: z.enum(['sha1', 'sha256', 'sha384', 'sha512']).optional().default('sha256'),
    encoding: z.enum(['hex', 'base64']).optional().default('hex'),
  }),
  riskLevel: 'medium',
  requiresApproval: false,
  sandboxed: false,
  timeout: 30000,
  rateLimit: { maxCalls: 500, windowMs: 60000 },
  async execute(params) {
    const algorithm = params.algorithm ?? 'sha256';
    const encoding = params.encoding ?? 'hex';
    const hmac = createHmac(algorithm, params.key);
    hmac.update(params.data);
    const digest = hmac.digest(encoding);

    return {
      algorithm,
      encoding,
      hmac: digest,
    };
  },
});

/**
 * Generate random bytes
 * Risk: Low - Random generation
 */
export const generateRandom = defineTool({
  name: 'data_random',
  description: 'Generate cryptographically secure random bytes.',
  version: '1.0.0',
  parameters: z.object({
    length: z.number().int().min(1).max(1024).default(32),
    encoding: z.enum(['hex', 'base64', 'base64url']).optional().default('hex'),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 1000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    const length = params.length ?? 32;
    const encoding = params.encoding ?? 'hex';
    const bytes = randomBytes(length);
    let encoded: string;

    if (encoding === 'base64url') {
      encoded = bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    } else {
      encoded = bytes.toString(encoding as BufferEncoding);
    }

    return {
      value: encoded,
      length,
      encoding,
    };
  },
});

/**
 * Generate UUID
 * Risk: Low - UUID generation
 */
export const generateUuid = defineTool({
  name: 'data_uuid',
  description: 'Generate a UUID (v4).',
  version: '1.0.0',
  parameters: z.object({
    count: z.number().int().min(1).max(100).optional().default(1),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 1000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    const count = params.count ?? 1;
    if (count === 1) {
      return { uuid: randomUUID() };
    }

    const uuids: string[] = [];
    for (let i = 0; i < count; i++) {
      uuids.push(randomUUID());
    }

    return { uuids };
  },
});

/**
 * Get current timestamp
 * Risk: Low - Time utility
 */
export const getTimestamp = defineTool({
  name: 'data_timestamp',
  description: 'Get the current timestamp in various formats.',
  version: '1.0.0',
  parameters: z.object({
    format: z.enum(['unix', 'unixMs', 'iso', 'utc', 'local']).optional().default('iso'),
    timezone: z.string().max(50).optional(),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 1000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    const now = new Date();

    let formatted: string | number;

    switch (params.format) {
      case 'unix':
        formatted = Math.floor(now.getTime() / 1000);
        break;
      case 'unixMs':
        formatted = now.getTime();
        break;
      case 'iso':
        formatted = now.toISOString();
        break;
      case 'utc':
        formatted = now.toUTCString();
        break;
      case 'local':
        formatted = params.timezone
          ? now.toLocaleString('en-US', { timeZone: params.timezone })
          : now.toLocaleString();
        break;
      default:
        formatted = now.toISOString();
    }

    return {
      timestamp: formatted,
      format: params.format,
      raw: {
        unix: Math.floor(now.getTime() / 1000),
        unixMs: now.getTime(),
        iso: now.toISOString(),
      },
    };
  },
});

/**
 * Parse date/time
 * Risk: Low - Date parsing
 */
export const parseDate = defineTool({
  name: 'data_date_parse',
  description: 'Parse a date string and return components.',
  version: '1.0.0',
  parameters: z.object({
    date: z.string().max(100),
    timezone: z.string().max(50).optional(),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 1000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    const parsed = new Date(params.date);

    if (isNaN(parsed.getTime())) {
      return {
        valid: false,
        error: 'Invalid date string',
      };
    }

    return {
      valid: true,
      unix: Math.floor(parsed.getTime() / 1000),
      unixMs: parsed.getTime(),
      iso: parsed.toISOString(),
      utc: parsed.toUTCString(),
      components: {
        year: parsed.getUTCFullYear(),
        month: parsed.getUTCMonth() + 1,
        day: parsed.getUTCDate(),
        hour: parsed.getUTCHours(),
        minute: parsed.getUTCMinutes(),
        second: parsed.getUTCSeconds(),
        millisecond: parsed.getUTCMilliseconds(),
        dayOfWeek: parsed.getUTCDay(),
      },
    };
  },
});

/**
 * Text operations
 * Risk: Low - Text manipulation
 */
export const textOps = defineTool({
  name: 'data_text',
  description: 'Perform common text operations (split, join, replace, etc.).',
  version: '1.0.0',
  parameters: z.object({
    text: z.string().max(10 * 1024 * 1024),
    operation: z.enum([
      'split',
      'join',
      'replace',
      'replaceAll',
      'trim',
      'upper',
      'lower',
      'reverse',
      'lines',
      'words',
      'chars',
      'length',
      'includes',
      'startsWith',
      'endsWith',
      'slice',
      'repeat',
      'pad',
    ]),
    delimiter: z.string().max(100).optional(),
    replacement: z.string().max(10000).optional(),
    pattern: z.string().max(1000).optional(),
    start: z.number().int().optional(),
    end: z.number().int().optional(),
    count: z.number().int().min(1).max(1000).optional(),
    padChar: z.string().max(10).optional(),
    padLength: z.number().int().min(1).max(10000).optional(),
    padSide: z.enum(['start', 'end']).optional(),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 5000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    const { text, operation } = params;

    switch (operation) {
      case 'split':
        return { result: text.split(params.delimiter ?? '') };

      case 'join':
        return { result: text.split('\n').join(params.delimiter ?? ',') };

      case 'replace':
        return { result: text.replace(params.pattern ?? '', params.replacement ?? '') };

      case 'replaceAll':
        return { result: text.split(params.pattern ?? '').join(params.replacement ?? '') };

      case 'trim':
        return { result: text.trim() };

      case 'upper':
        return { result: text.toUpperCase() };

      case 'lower':
        return { result: text.toLowerCase() };

      case 'reverse':
        return { result: text.split('').reverse().join('') };

      case 'lines':
        const lines = text.split(/\r?\n/);
        return { result: lines, count: lines.length };

      case 'words':
        const words = text.split(/\s+/).filter(w => w.length > 0);
        return { result: words, count: words.length };

      case 'chars':
        return { result: text.split(''), count: text.length };

      case 'length':
        return { length: text.length, bytes: Buffer.byteLength(text, 'utf8') };

      case 'includes':
        return { result: text.includes(params.pattern ?? '') };

      case 'startsWith':
        return { result: text.startsWith(params.pattern ?? '') };

      case 'endsWith':
        return { result: text.endsWith(params.pattern ?? '') };

      case 'slice':
        return { result: text.slice(params.start, params.end) };

      case 'repeat':
        return { result: text.repeat(params.count ?? 1) };

      case 'pad':
        const padLength = params.padLength ?? text.length;
        const padChar = params.padChar ?? ' ';
        if (params.padSide === 'end') {
          return { result: text.padEnd(padLength, padChar) };
        }
        return { result: text.padStart(padLength, padChar) };

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  },
});

/**
 * Regex operations
 * Risk: Low - Pattern matching
 */
export const regexOps = defineTool({
  name: 'data_regex',
  description: 'Perform regex operations (match, test, extract groups).',
  version: '1.0.0',
  parameters: z.object({
    text: z.string().max(10 * 1024 * 1024),
    pattern: z.string().min(1).max(1000),
    flags: z.string().max(10).optional().default(''),
    operation: z.enum(['test', 'match', 'matchAll', 'replace', 'split']).optional().default('match'),
    replacement: z.string().max(10000).optional(),
    limit: z.number().int().min(1).max(10000).optional(),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 10000,
  rateLimit: { maxCalls: 500, windowMs: 60000 },
  async execute(params) {
    // Validate regex (prevent ReDoS)
    if (params.pattern.length > 200) {
      throw new Error('Pattern too complex');
    }

    const regex = new RegExp(params.pattern, params.flags);

    switch (params.operation) {
      case 'test':
        return { matches: regex.test(params.text) };

      case 'match': {
        const match = params.text.match(regex);
        if (!match) {
          return { found: false };
        }
        return {
          found: true,
          match: match[0],
          groups: match.slice(1),
          index: match.index,
        };
      }

      case 'matchAll': {
        const matches: Array<{
          match: string;
          groups: string[];
          index: number;
        }> = [];

        const flags = params.flags ?? '';
        const globalRegex = new RegExp(params.pattern, flags.includes('g') ? flags : flags + 'g');

        let m;
        const limit = params.limit ?? 1000;

        while ((m = globalRegex.exec(params.text)) !== null && matches.length < limit) {
          matches.push({
            match: m[0],
            groups: m.slice(1),
            index: m.index,
          });
        }

        return {
          found: matches.length > 0,
          matches,
          count: matches.length,
          truncated: matches.length >= limit,
        };
      }

      case 'replace':
        return { result: params.text.replace(regex, params.replacement ?? '') };

      case 'split': {
        const parts = params.text.split(regex);
        return {
          result: params.limit ? parts.slice(0, params.limit) : parts,
          count: parts.length,
        };
      }

      default:
        throw new Error(`Unknown operation: ${params.operation}`);
    }
  },
});

// ============================================================================
// Export all data tools
// ============================================================================

export const dataTools: ToolDefinition<unknown, unknown>[] = [
  jsonParse as ToolDefinition<unknown, unknown>,
  jsonStringify as ToolDefinition<unknown, unknown>,
  jsonQuery as ToolDefinition<unknown, unknown>,
  base64Encode as ToolDefinition<unknown, unknown>,
  base64Decode as ToolDefinition<unknown, unknown>,
  hexEncode as ToolDefinition<unknown, unknown>,
  hexDecode as ToolDefinition<unknown, unknown>,
  urlEncode as ToolDefinition<unknown, unknown>,
  urlDecode as ToolDefinition<unknown, unknown>,
  computeHash as ToolDefinition<unknown, unknown>,
  computeHmac as ToolDefinition<unknown, unknown>,
  generateRandom as ToolDefinition<unknown, unknown>,
  generateUuid as ToolDefinition<unknown, unknown>,
  getTimestamp as ToolDefinition<unknown, unknown>,
  parseDate as ToolDefinition<unknown, unknown>,
  textOps as ToolDefinition<unknown, unknown>,
  regexOps as ToolDefinition<unknown, unknown>,
];
