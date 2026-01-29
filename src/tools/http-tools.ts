import { z } from 'zod';
import { defineTool, CommonSchemas, type ToolDefinition } from './registry.js';
import type { ToolExecutionContext } from '../security/types.js';

// ============================================================================
// HTTP Tools - External API interactions
// ============================================================================

const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

const HeadersSchema = z.record(z.string()).optional();

const BodySchema = z.union([
  z.string(),
  CommonSchemas.jsonObject,
]).optional();

/**
 * Make HTTP request
 * Risk: High - Can make arbitrary HTTP requests
 */
export const httpRequest = defineTool({
  name: 'http_request',
  description: 'Make an HTTP request to an external URL. Supports GET, POST, PUT, PATCH, DELETE methods.',
  version: '1.0.0',
  parameters: z.object({
    url: CommonSchemas.url,
    method: HttpMethodSchema.optional().default('GET'),
    headers: HeadersSchema,
    body: BodySchema,
    timeout: z.number().int().min(1000).max(60000).optional().default(30000),
    followRedirects: z.boolean().optional().default(true),
    maxRedirects: z.number().int().min(0).max(10).optional().default(5),
    validateStatus: z.boolean().optional().default(true),
  }),
  riskLevel: 'high',
  requiresApproval: true,
  sandboxed: false,
  timeout: 60000,
  rateLimit: { maxCalls: 60, windowMs: 60000 },
  async execute(params, context) {
    // Validate URL against allowlist if configured
    validateUrl(params.url, context);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), params.timeout);

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'SecureAgent/1.0',
        ...params.headers,
      };

      let body: string | undefined;
      if (params.body) {
        if (typeof params.body === 'string') {
          body = params.body;
        } else {
          body = JSON.stringify(params.body);
          if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
          }
        }
      }

      const response = await fetch(params.url, {
        method: params.method,
        headers,
        body,
        signal: controller.signal,
        redirect: params.followRedirects ? 'follow' : 'manual',
      });

      clearTimeout(timeoutId);

      // Check status if validation is enabled
      if (params.validateStatus && !response.ok) {
        const errorBody = await response.text().catch(() => '');
        return {
          success: false,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          error: errorBody.slice(0, 1000),
        };
      }

      // Parse response body
      const contentType = response.headers.get('content-type') ?? '';
      let responseBody: unknown;

      if (contentType.includes('application/json')) {
        responseBody = await response.json();
      } else if (contentType.includes('text/')) {
        responseBody = await response.text();
      } else {
        // For binary data, return base64
        const buffer = await response.arrayBuffer();
        responseBody = {
          type: 'binary',
          encoding: 'base64',
          data: Buffer.from(buffer).toString('base64'),
          size: buffer.byteLength,
        };
      }

      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseBody,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${params.timeout}ms`);
      }

      throw error;
    }
  },
});

/**
 * Download file from URL
 * Risk: High - Downloads external content
 */
export const httpDownload = defineTool({
  name: 'http_download',
  description: 'Download a file from a URL. Returns the content as base64 or saves to a path.',
  version: '1.0.0',
  parameters: z.object({
    url: CommonSchemas.url,
    headers: HeadersSchema,
    timeout: z.number().int().min(1000).max(300000).optional().default(60000),
    maxSize: z.number().int().min(1).max(100 * 1024 * 1024).optional().default(10 * 1024 * 1024),
  }),
  riskLevel: 'high',
  requiresApproval: true,
  sandboxed: false,
  timeout: 300000,
  rateLimit: { maxCalls: 20, windowMs: 60000 },
  async execute(params, context) {
    validateUrl(params.url, context);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), params.timeout);

    try {
      const response = await fetch(params.url, {
        method: 'GET',
        headers: {
          'User-Agent': 'SecureAgent/1.0',
          ...params.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const maxSize = params.maxSize ?? 10 * 1024 * 1024;

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > maxSize) {
        throw new Error(`File size ${contentLength} exceeds maximum ${maxSize} bytes`);
      }

      const buffer = await response.arrayBuffer();

      if (buffer.byteLength > maxSize) {
        throw new Error(`Downloaded size ${buffer.byteLength} exceeds maximum ${maxSize} bytes`);
      }

      const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
      const contentDisposition = response.headers.get('content-disposition');
      let filename: string | undefined;

      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match) {
          filename = match[1].replace(/['"]/g, '');
        }
      }

      return {
        success: true,
        url: params.url,
        contentType,
        filename,
        size: buffer.byteLength,
        content: Buffer.from(buffer).toString('base64'),
        encoding: 'base64',
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Download timed out after ${params.timeout}ms`);
      }

      throw error;
    }
  },
});

/**
 * Make GraphQL request
 * Risk: High - Can make GraphQL queries
 */
export const graphqlRequest = defineTool({
  name: 'http_graphql',
  description: 'Execute a GraphQL query or mutation against an endpoint.',
  version: '1.0.0',
  parameters: z.object({
    url: CommonSchemas.url,
    query: z.string().min(1).max(50000),
    variables: CommonSchemas.jsonObject.optional(),
    operationName: z.string().max(100).optional(),
    headers: HeadersSchema,
    timeout: z.number().int().min(1000).max(60000).optional().default(30000),
  }),
  riskLevel: 'high',
  requiresApproval: true,
  sandboxed: false,
  timeout: 60000,
  rateLimit: { maxCalls: 60, windowMs: 60000 },
  async execute(params, context) {
    validateUrl(params.url, context);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), params.timeout);

    try {
      const response = await fetch(params.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SecureAgent/1.0',
          ...params.headers,
        },
        body: JSON.stringify({
          query: params.query,
          variables: params.variables,
          operationName: params.operationName,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await response.json() as {
        data?: unknown;
        errors?: unknown[];
        extensions?: unknown;
      };

      return {
        success: !result.errors,
        status: response.status,
        data: result.data,
        errors: result.errors,
        extensions: result.extensions,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`GraphQL request timed out after ${params.timeout}ms`);
      }

      throw error;
    }
  },
});

/**
 * Check URL accessibility
 * Risk: Low - Only checks if URL is reachable
 */
export const httpPing = defineTool({
  name: 'http_ping',
  description: 'Check if a URL is accessible. Returns status code and response time.',
  version: '1.0.0',
  parameters: z.object({
    url: CommonSchemas.url,
    method: z.enum(['GET', 'HEAD']).optional().default('HEAD'),
    timeout: z.number().int().min(1000).max(30000).optional().default(10000),
    followRedirects: z.boolean().optional().default(true),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 30000,
  rateLimit: { maxCalls: 120, windowMs: 60000 },
  async execute(params, context) {
    validateUrl(params.url, context);

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), params.timeout);

    try {
      const response = await fetch(params.url, {
        method: params.method,
        headers: {
          'User-Agent': 'SecureAgent/1.0',
        },
        signal: controller.signal,
        redirect: params.followRedirects ? 'follow' : 'manual',
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      return {
        reachable: true,
        status: response.status,
        statusText: response.statusText,
        responseTimeMs: responseTime,
        redirected: response.redirected,
        finalUrl: response.url,
        headers: {
          server: response.headers.get('server'),
          contentType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length'),
        },
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      return {
        reachable: false,
        responseTimeMs: responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

/**
 * Parse and validate URL
 * Risk: Low - Only parses URL
 */
export const parseUrl = defineTool({
  name: 'http_parse_url',
  description: 'Parse a URL into its components (protocol, host, port, path, query, etc.).',
  version: '1.0.0',
  parameters: z.object({
    url: z.string().min(1).max(2048),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 1000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    try {
      const url = new URL(params.url);

      const queryParams: Record<string, string | string[]> = {};
      url.searchParams.forEach((value, key) => {
        const existing = queryParams[key];
        if (existing) {
          if (Array.isArray(existing)) {
            existing.push(value);
          } else {
            queryParams[key] = [existing, value];
          }
        } else {
          queryParams[key] = value;
        }
      });

      return {
        valid: true,
        protocol: url.protocol.replace(':', ''),
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : ''),
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
        origin: url.origin,
        host: url.host,
        username: url.username || undefined,
        password: url.password ? '[REDACTED]' : undefined,
        queryParams,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid URL',
      };
    }
  },
});

/**
 * Build URL from components
 * Risk: Low - Only builds URL
 */
export const buildUrl = defineTool({
  name: 'http_build_url',
  description: 'Build a URL from its components.',
  version: '1.0.0',
  parameters: z.object({
    base: z.string().min(1).max(2048),
    path: z.string().max(2048).optional(),
    queryParams: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
    hash: z.string().max(256).optional(),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: false,
  timeout: 1000,
  rateLimit: { maxCalls: 1000, windowMs: 60000 },
  async execute(params) {
    try {
      const url = new URL(params.base);

      if (params.path) {
        // Handle path joining correctly
        if (params.path.startsWith('/')) {
          url.pathname = params.path;
        } else {
          url.pathname = url.pathname.replace(/\/$/, '') + '/' + params.path;
        }
      }

      if (params.queryParams) {
        for (const [key, value] of Object.entries(params.queryParams)) {
          url.searchParams.append(key, String(value));
        }
      }

      if (params.hash) {
        url.hash = params.hash.startsWith('#') ? params.hash : `#${params.hash}`;
      }

      return {
        url: url.toString(),
      };
    } catch (error) {
      throw new Error(`Failed to build URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

function validateUrl(url: string, context: ToolExecutionContext): void {
  const parsed = new URL(url);

  // Block localhost and internal networks by default
  const blockedHosts = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
  ];

  const blockedPatterns = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^fc00:/i,
    /^fd00:/i,
    /^fe80:/i,
  ];

  // Check if allowlist is configured
  const allowedHosts = context.session.metadata?.allowedHosts as string[] | undefined;
  if (allowedHosts && allowedHosts.length > 0) {
    if (!allowedHosts.includes(parsed.hostname)) {
      throw new Error(`Host ${parsed.hostname} not in allowlist`);
    }
    return;
  }

  // Default security: block internal networks
  if (blockedHosts.includes(parsed.hostname)) {
    throw new Error(`Access to ${parsed.hostname} is blocked`);
  }

  for (const pattern of blockedPatterns) {
    if (pattern.test(parsed.hostname)) {
      throw new Error(`Access to internal network address is blocked`);
    }
  }

  // Block non-HTTP(S) protocols
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Protocol ${parsed.protocol} is not allowed`);
  }
}

// ============================================================================
// Export all HTTP tools
// ============================================================================

export const httpTools: ToolDefinition<unknown, unknown>[] = [
  httpRequest as ToolDefinition<unknown, unknown>,
  httpDownload as ToolDefinition<unknown, unknown>,
  graphqlRequest as ToolDefinition<unknown, unknown>,
  httpPing as ToolDefinition<unknown, unknown>,
  parseUrl as ToolDefinition<unknown, unknown>,
  buildUrl as ToolDefinition<unknown, unknown>,
];
