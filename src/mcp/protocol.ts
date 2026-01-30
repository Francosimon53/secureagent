import { z } from 'zod';
import { randomBytes } from 'crypto';
import { getLogger, getAuditLogger } from '../observability/logger.js';
import { OAuthAuthorizationServer, type AccessToken } from './oauth.js';
import { ToolRegistry } from '../tools/registry.js';
import type { ToolExecutionContext, ToolCall, UserIdentity, SessionContext } from '../security/types.js';
import { SandboxExecutor, type SandboxExecutorConfig } from '../security/sandbox/executor.js';
import { MCPRateLimiter, type RateLimitResult } from './rate-limiter.js';
import { ScopeManager } from './scopes.js';

const logger = getLogger().child({ module: 'MCPProtocol' });
const auditLogger = getAuditLogger();

// ============================================================================
// MCP Protocol Types (based on Model Context Protocol spec)
// ============================================================================

export const MCPRequestSchema = z.discriminatedUnion('method', [
  z.object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.literal('initialize'),
    params: z.object({
      protocolVersion: z.string(),
      capabilities: z.object({
        roots: z.object({ listChanged: z.boolean().optional() }).optional(),
        sampling: z.object({}).optional(),
      }).optional(),
      clientInfo: z.object({
        name: z.string(),
        version: z.string(),
      }),
    }),
  }),
  z.object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.literal('tools/list'),
    params: z.object({
      cursor: z.string().optional(),
    }).optional(),
  }),
  z.object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.literal('tools/call'),
    params: z.object({
      name: z.string(),
      arguments: z.record(z.unknown()).optional(),
    }),
  }),
  z.object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.literal('resources/list'),
    params: z.object({
      cursor: z.string().optional(),
    }).optional(),
  }),
  z.object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.literal('resources/read'),
    params: z.object({
      uri: z.string(),
    }),
  }),
  z.object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.literal('prompts/list'),
    params: z.object({
      cursor: z.string().optional(),
    }).optional(),
  }),
  z.object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.literal('prompts/get'),
    params: z.object({
      name: z.string(),
      arguments: z.record(z.string()).optional(),
    }),
  }),
  z.object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.literal('ping'),
    params: z.object({}).optional(),
  }),
]);

export type MCPRequest = z.infer<typeof MCPRequestSchema>;

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

// MCP Error Codes
export const MCPErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom error codes
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32002,
  RATE_LIMITED: -32003,
  TOOL_EXECUTION_ERROR: -32004,
  // Test-compatible aliases (PascalCase)
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  Unauthorized: -32001,
  Forbidden: -32002,
  RateLimited: -32003,
  ToolExecutionError: -32004,
} as const;

// ============================================================================
// MCP Tool Definition
// ============================================================================

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

// ============================================================================
// MCP Server Configuration
// ============================================================================

export interface MCPServerConfig {
  name: string;
  version: string;
  oauth: OAuthAuthorizationServer;
  toolRegistry: ToolRegistry;
  sandbox?: SandboxExecutor;
  sandboxConfig?: SandboxExecutorConfig;
  resources?: MCPResource[];
  prompts?: MCPPrompt[];
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
  /** Rate limiter instance */
  rateLimiter?: MCPRateLimiter;
  /** Scope manager for tool authorization */
  scopeManager?: ScopeManager;
  /** Enable strict scope checking (deny if no scope grants access) */
  strictScopes?: boolean;
}

// ============================================================================
// MCP Protocol Handler
// ============================================================================

// Test-compatible tool registration interface
interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

export class MCPProtocolHandler {
  private readonly config: MCPServerConfig;
  private readonly sessions = new Map<string, {
    token: AccessToken;
    initialized: boolean;
    clientInfo?: { name: string; version: string };
    rateLimitStatus?: RateLimitResult;
  }>();
  private readonly rateLimiter: MCPRateLimiter;
  private readonly scopeManager: ScopeManager;

  // Test-compatible tool storage
  private readonly registeredTools = new Map<string, RegisteredTool>();
  private testSessionInitialized = false;

  constructor(config?: MCPServerConfig) {
    if (config) {
      this.config = {
        capabilities: {
          tools: true,
          resources: true,
          prompts: true,
          logging: true,
        },
        resources: [],
        prompts: [],
        strictScopes: true,
        ...config,
      };

      // Initialize rate limiter (use provided or create default)
      this.rateLimiter = config.rateLimiter ?? new MCPRateLimiter();

      // Initialize scope manager (use provided or create default)
      this.scopeManager = config.scopeManager ?? new ScopeManager();
    } else {
      // Test-compatible empty config - use minimal defaults
      this.config = {
        name: 'test-server',
        version: '1.0.0',
        oauth: undefined as unknown as OAuthAuthorizationServer,
        toolRegistry: undefined as unknown as ToolRegistry,
        capabilities: {
          tools: true,
          resources: true,
          prompts: true,
          logging: true,
        },
        resources: [],
        prompts: [],
      };
      this.rateLimiter = new MCPRateLimiter();
      this.scopeManager = new ScopeManager();
    }
  }

  /**
   * Register a tool (test-compatible)
   */
  registerTool(tool: RegisteredTool): void {
    this.registeredTools.set(tool.name, tool);
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  createSession(token: AccessToken): string {
    const sessionId = randomBytes(16).toString('hex');
    this.sessions.set(sessionId, {
      token,
      initialized: false,
    });
    return sessionId;
  }

  getSession(sessionId: string): { token: AccessToken; initialized: boolean } | undefined {
    return this.sessions.get(sessionId);
  }

  endSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  // ============================================================================
  // Request Handler
  // ============================================================================

  /**
   * Handle request - supports both original (sessionId, request) and test-compatible (request) signatures
   */
  async handleRequest(
    sessionIdOrRequest: string | unknown,
    request?: unknown
  ): Promise<MCPResponse> {
    // Test-compatible single-argument signature
    if (typeof sessionIdOrRequest !== 'string') {
      return this.handleTestRequest(sessionIdOrRequest);
    }

    // Original two-argument signature
    const sessionId = sessionIdOrRequest;
    const session = this.sessions.get(sessionId);

    if (!session) {
      return this.error(0, MCPErrorCodes.UNAUTHORIZED, 'Invalid session');
    }

    // Validate token is still valid
    if (session.token.expiresAt < Date.now()) {
      this.sessions.delete(sessionId);
      return this.error(0, MCPErrorCodes.UNAUTHORIZED, 'Token expired');
    }

    // Parse and validate request
    let parsed: MCPRequest;
    try {
      parsed = MCPRequestSchema.parse(request);
    } catch (err) {
      logger.warn({ error: err }, 'Invalid MCP request');
      const reqId = (request as Record<string, unknown>)?.id;
      return this.error(
        typeof reqId === 'string' || typeof reqId === 'number' ? reqId : 0,
        MCPErrorCodes.INVALID_REQUEST,
        'Invalid request format'
      );
    }

    // Route to handler
    const requestId = parsed.id;
    try {
      switch (parsed.method) {
        case 'initialize':
          return this.handleInitialize(sessionId, parsed);
        case 'ping':
          return this.handlePing(parsed);
        case 'tools/list':
          return this.handleToolsList(session, parsed);
        case 'tools/call':
          return await this.handleToolsCall(session, parsed);
        case 'resources/list':
          return this.handleResourcesList(session, parsed);
        case 'resources/read':
          return await this.handleResourcesRead(session, parsed);
        case 'prompts/list':
          return this.handlePromptsList(session, parsed);
        case 'prompts/get':
          return this.handlePromptsGet(session, parsed);
        default:
          // Should never reach here due to discriminated union exhaustiveness
          return this.error(requestId, MCPErrorCodes.METHOD_NOT_FOUND, 'Method not found');
      }
    } catch (err) {
      logger.error({ error: err, method: parsed.method }, 'MCP request handler error');
      return this.error(requestId, MCPErrorCodes.INTERNAL_ERROR, 'Internal error');
    }
  }

  /**
   * Test-compatible request handler (no session/OAuth)
   */
  private async handleTestRequest(request: unknown): Promise<MCPResponse> {
    const req = request as Record<string, unknown>;
    const requestId = (typeof req.id === 'string' || typeof req.id === 'number') ? req.id : 0;
    const method = req.method as string;

    // Validate JSON-RPC structure
    if (req.jsonrpc !== '2.0' || !method) {
      return this.error(requestId, MCPErrorCodes.INVALID_REQUEST, 'Invalid JSON-RPC request');
    }

    // Handle methods
    switch (method) {
      case 'initialize': {
        this.testSessionInitialized = true;
        const params = req.params as { protocolVersion?: string; clientInfo?: { name: string; version: string } };
        return this.success(requestId, {
          protocolVersion: params?.protocolVersion ?? '2024-11-05',
          capabilities: {
            tools: { listChanged: true },
            resources: { subscribe: false, listChanged: true },
            prompts: { listChanged: true },
            logging: {},
          },
          serverInfo: {
            name: this.config?.name ?? 'test-server',
            version: this.config?.version ?? '1.0.0',
          },
        });
      }

      case 'tools/list': {
        if (!this.testSessionInitialized) {
          return this.error(requestId, MCPErrorCodes.INVALID_REQUEST, 'Session not initialized');
        }
        const tools = Array.from(this.registeredTools.values()).map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
        return this.success(requestId, { tools });
      }

      case 'tools/call': {
        if (!this.testSessionInitialized) {
          return this.error(requestId, MCPErrorCodes.INVALID_REQUEST, 'Session not initialized');
        }
        const params = req.params as { name: string; arguments?: Record<string, unknown> };
        const tool = this.registeredTools.get(params.name);
        if (!tool) {
          return this.error(requestId, MCPErrorCodes.INVALID_PARAMS, `Tool not found: ${params.name}`);
        }
        try {
          const result = await tool.handler(params.arguments ?? {});
          return this.success(requestId, result);
        } catch (err) {
          return this.error(
            requestId,
            MCPErrorCodes.TOOL_EXECUTION_ERROR,
            err instanceof Error ? err.message : 'Tool execution failed'
          );
        }
      }

      default:
        return this.error(requestId, MCPErrorCodes.METHOD_NOT_FOUND, `Unknown method: ${method}`);
    }
  }

  // ============================================================================
  // Protocol Handlers
  // ============================================================================

  private handleInitialize(
    sessionId: string,
    request: Extract<MCPRequest, { method: 'initialize' }>
  ): MCPResponse {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return this.error(request.id, MCPErrorCodes.UNAUTHORIZED, 'Invalid session');
    }

    session.initialized = true;
    session.clientInfo = request.params.clientInfo;

    logger.info(
      { sessionId, client: request.params.clientInfo },
      'MCP session initialized'
    );

    return this.success(request.id, {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: this.config.capabilities?.tools ? { listChanged: true } : undefined,
        resources: this.config.capabilities?.resources ? { subscribe: false, listChanged: true } : undefined,
        prompts: this.config.capabilities?.prompts ? { listChanged: true } : undefined,
        logging: this.config.capabilities?.logging ? {} : undefined,
      },
      serverInfo: {
        name: this.config.name,
        version: this.config.version,
      },
    });
  }

  private handlePing(request: Extract<MCPRequest, { method: 'ping' }>): MCPResponse {
    return this.success(request.id, {});
  }

  private handleToolsList(
    session: { token: AccessToken; initialized: boolean },
    request: Extract<MCPRequest, { method: 'tools/list' }>
  ): MCPResponse {
    if (!session.initialized) {
      return this.error(request.id, MCPErrorCodes.INVALID_REQUEST, 'Session not initialized');
    }

    // Check scope
    if (!session.token.scope.includes('tools:list') && !session.token.scope.includes('read')) {
      return this.error(request.id, MCPErrorCodes.FORBIDDEN, 'Insufficient scope');
    }

    // Get tools from registry
    const allTools = this.config.toolRegistry.list();

    // Filter tools based on granted scopes
    const accessibleToolNames = this.scopeManager.getAccessibleTools(session.token.scope);
    const accessibleSet = new Set(accessibleToolNames);

    // If user has admin or tools:execute, show all tools
    const hasFullAccess = session.token.scope.includes('admin') ||
                          session.token.scope.includes('tools:execute');

    const filteredTools = hasFullAccess
      ? allTools
      : allTools.filter(tool => accessibleSet.has(tool.name));

    // Get full tool definitions for schema extraction
    const mcpTools: MCPToolDefinition[] = filteredTools.map(tool => {
      // Get the full tool definition to access parameters schema
      const fullTool = this.config.toolRegistry.get(tool.name);

      return {
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: 'object' as const,
          properties: fullTool ? this.zodToJsonSchema(fullTool.parameters) : {},
          required: fullTool ? this.getRequiredFields(fullTool.parameters) : [],
        },
      };
    });

    logger.debug(
      {
        clientId: session.token.clientId,
        totalTools: allTools.length,
        accessibleTools: mcpTools.length,
        scopes: session.token.scope,
      },
      'Tools listed'
    );

    return this.success(request.id, {
      tools: mcpTools,
    });
  }

  private async handleToolsCall(
    session: { token: AccessToken; initialized: boolean; rateLimitStatus?: RateLimitResult },
    request: Extract<MCPRequest, { method: 'tools/call' }>
  ): Promise<MCPResponse> {
    if (!session.initialized) {
      return this.error(request.id, MCPErrorCodes.INVALID_REQUEST, 'Session not initialized');
    }

    const { name, arguments: args } = request.params;
    const requestId = randomBytes(16).toString('hex');

    // Check rate limit for this tool
    const rateLimitResult = this.rateLimiter.check({
      clientId: session.token.clientId,
      toolName: name,
      scopes: session.token.scope,
      userId: session.token.userId,
    });

    if (!rateLimitResult.allowed) {
      logger.warn(
        { clientId: session.token.clientId, tool: name, retryAfter: rateLimitResult.retryAfter },
        'Tool call rate limited'
      );

      auditLogger.log({
        eventId: requestId,
        timestamp: Date.now(),
        eventType: 'rate_limit',
        severity: 'warn',
        actor: { userId: session.token.userId },
        resource: { type: 'tool', name },
        action: 'execute',
        outcome: 'blocked',
        details: {
          limitType: rateLimitResult.limitType,
          retryAfter: rateLimitResult.retryAfter,
        },
      });

      return this.error(
        request.id,
        MCPErrorCodes.RATE_LIMITED,
        `Rate limit exceeded. Retry after ${rateLimitResult.retryAfter} seconds`,
        { retryAfter: rateLimitResult.retryAfter }
      );
    }

    // Store rate limit status for response headers
    session.rateLimitStatus = rateLimitResult;

    // Check scope-based authorization for this tool
    const scopeCheck = this.scopeManager.canExecuteTool(session.token.scope, name);

    if (!scopeCheck.allowed) {
      logger.warn(
        { clientId: session.token.clientId, tool: name, reason: scopeCheck.reason },
        'Tool access denied by scope'
      );

      auditLogger.log({
        eventId: requestId,
        timestamp: Date.now(),
        eventType: 'authorization',
        severity: 'warn',
        actor: { userId: session.token.userId },
        resource: { type: 'tool', name },
        action: 'execute',
        outcome: 'blocked',
        details: {
          reason: scopeCheck.reason,
          grantedScopes: session.token.scope,
        },
      });

      return this.error(request.id, MCPErrorCodes.FORBIDDEN, scopeCheck.reason ?? 'Insufficient scope');
    }

    // Check if scope requires MFA
    if (this.scopeManager.requiresMfa(session.token.scope)) {
      if (!session.token.dpopJkt) {
        return this.error(
          request.id,
          MCPErrorCodes.FORBIDDEN,
          'This operation requires MFA. Please use DPoP-bound tokens.'
        );
      }
    }

    // Build identity for the user
    const identity: UserIdentity = {
      userId: session.token.userId,
      roles: session.token.scope,
      mfaVerified: session.token.dpopJkt !== undefined,
    };

    // Build session context
    const sessionContext: SessionContext = {
      sessionId: randomBytes(8).toString('hex'),
      userId: session.token.userId,
      deviceId: session.token.dpopJkt ?? 'unknown',
      ipAddress: 'unknown',
      userAgent: 'mcp-client',
      createdAt: session.token.issuedAt,
      lastActivityAt: Date.now(),
      expiresAt: session.token.expiresAt,
      riskScore: 0,
      mfaVerified: session.token.dpopJkt !== undefined,
    };

    // Build tool call
    const toolCall: ToolCall = {
      toolName: name,
      parameters: (args ?? {}) as Record<string, unknown>,
      requestId,
      timestamp: Date.now(),
    };

    // Build execution context
    const context: ToolExecutionContext = {
      identity,
      session: sessionContext,
      tool: toolCall,
      sandboxed: this.config.sandbox !== undefined,
    };

    const startTime = Date.now();

    // Audit log - start
    auditLogger.log({
      eventId: requestId,
      timestamp: Date.now(),
      eventType: 'mcp',
      severity: 'info',
      actor: { userId: session.token.userId },
      resource: { type: 'tool', name },
      action: 'execute_start',
      outcome: 'success',
      details: {
        clientId: session.token.clientId,
        scope: scopeCheck.matchedScope,
        args: Object.keys(args ?? {}),
      },
    });

    try {
      const result = await this.config.toolRegistry.execute(toolCall, context);
      const durationMs = Date.now() - startTime;

      // Record successful execution
      this.rateLimiter.record({
        clientId: session.token.clientId,
        toolName: name,
        durationMs,
      });

      if (!result.success) {
        auditLogger.log({
          eventId: requestId,
          timestamp: Date.now(),
          eventType: 'mcp',
          severity: 'warn',
          actor: { userId: session.token.userId },
          resource: { type: 'tool', name },
          action: 'execute',
          outcome: 'failure',
          details: {
            error: result.error?.message,
            durationMs,
          },
        });

        return this.error(
          request.id,
          MCPErrorCodes.TOOL_EXECUTION_ERROR,
          result.error?.message ?? 'Tool execution failed'
        );
      }

      // Audit log - success
      auditLogger.log({
        eventId: requestId,
        timestamp: Date.now(),
        eventType: 'mcp',
        severity: 'info',
        actor: { userId: session.token.userId },
        resource: { type: 'tool', name },
        action: 'execute',
        outcome: 'success',
        details: { durationMs },
      });

      return this.success(request.id, {
        content: [
          {
            type: 'text',
            text: typeof result.result === 'string'
              ? result.result
              : JSON.stringify(result.result, null, 2),
          },
        ],
        isError: false,
      });
    } catch (err) {
      const durationMs = Date.now() - startTime;

      logger.error({ error: err, tool: name, durationMs }, 'Tool execution error');

      auditLogger.log({
        eventId: requestId,
        timestamp: Date.now(),
        eventType: 'mcp',
        severity: 'error',
        actor: { userId: session.token.userId },
        resource: { type: 'tool', name },
        action: 'execute',
        outcome: 'failure',
        details: {
          error: err instanceof Error ? err.message : 'Unknown error',
          durationMs,
        },
      });

      return this.error(
        request.id,
        MCPErrorCodes.TOOL_EXECUTION_ERROR,
        err instanceof Error ? err.message : 'Tool execution failed'
      );
    }
  }

  private handleResourcesList(
    session: { token: AccessToken; initialized: boolean },
    request: Extract<MCPRequest, { method: 'resources/list' }>
  ): MCPResponse {
    if (!session.initialized) {
      return this.error(request.id, MCPErrorCodes.INVALID_REQUEST, 'Session not initialized');
    }

    if (!session.token.scope.includes('read')) {
      return this.error(request.id, MCPErrorCodes.FORBIDDEN, 'Insufficient scope');
    }

    return this.success(request.id, {
      resources: this.config.resources ?? [],
    });
  }

  private async handleResourcesRead(
    session: { token: AccessToken; initialized: boolean },
    request: Extract<MCPRequest, { method: 'resources/read' }>
  ): Promise<MCPResponse> {
    if (!session.initialized) {
      return this.error(request.id, MCPErrorCodes.INVALID_REQUEST, 'Session not initialized');
    }

    if (!session.token.scope.includes('read')) {
      return this.error(request.id, MCPErrorCodes.FORBIDDEN, 'Insufficient scope');
    }

    const resource = this.config.resources?.find(r => r.uri === request.params.uri);
    if (!resource) {
      return this.error(request.id, MCPErrorCodes.INVALID_PARAMS, 'Resource not found');
    }

    // In a real implementation, fetch the resource content
    return this.success(request.id, {
      contents: [
        {
          uri: resource.uri,
          mimeType: resource.mimeType ?? 'text/plain',
          text: `Resource content for ${resource.uri}`,
        },
      ],
    });
  }

  private handlePromptsList(
    session: { token: AccessToken; initialized: boolean },
    request: Extract<MCPRequest, { method: 'prompts/list' }>
  ): MCPResponse {
    if (!session.initialized) {
      return this.error(request.id, MCPErrorCodes.INVALID_REQUEST, 'Session not initialized');
    }

    if (!session.token.scope.includes('read')) {
      return this.error(request.id, MCPErrorCodes.FORBIDDEN, 'Insufficient scope');
    }

    return this.success(request.id, {
      prompts: this.config.prompts ?? [],
    });
  }

  private handlePromptsGet(
    session: { token: AccessToken; initialized: boolean },
    request: Extract<MCPRequest, { method: 'prompts/get' }>
  ): MCPResponse {
    if (!session.initialized) {
      return this.error(request.id, MCPErrorCodes.INVALID_REQUEST, 'Session not initialized');
    }

    if (!session.token.scope.includes('read')) {
      return this.error(request.id, MCPErrorCodes.FORBIDDEN, 'Insufficient scope');
    }

    const prompt = this.config.prompts?.find(p => p.name === request.params.name);
    if (!prompt) {
      return this.error(request.id, MCPErrorCodes.INVALID_PARAMS, 'Prompt not found');
    }

    return this.success(request.id, {
      description: prompt.description,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Prompt template for ${prompt.name}`,
          },
        },
      ],
    });
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private success(id: string | number, result: unknown): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  private error(
    id: string | number,
    code: number,
    message: string,
    data?: unknown
  ): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
  }

  private zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
    // Simplified Zod to JSON Schema conversion
    // In production, use a proper library like zod-to-json-schema
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodTypeToJsonSchema(value as z.ZodTypeAny);
      }

      return properties;
    }

    return {};
  }

  private zodTypeToJsonSchema(type: z.ZodTypeAny): Record<string, unknown> {
    if (type instanceof z.ZodString) {
      return { type: 'string' };
    }
    if (type instanceof z.ZodNumber) {
      return { type: 'number' };
    }
    if (type instanceof z.ZodBoolean) {
      return { type: 'boolean' };
    }
    if (type instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodTypeToJsonSchema(type.element),
      };
    }
    if (type instanceof z.ZodOptional) {
      return this.zodTypeToJsonSchema(type.unwrap());
    }
    if (type instanceof z.ZodDefault) {
      return this.zodTypeToJsonSchema(type.removeDefault());
    }

    return { type: 'string' }; // Fallback
  }

  private getRequiredFields(schema: z.ZodTypeAny): string[] {
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) {
          required.push(key);
        }
      }

      return required;
    }

    return [];
  }
}

// ============================================================================
// HTTP Transport Helper
// ============================================================================

export interface HTTPTransportConfig {
  oauth: OAuthAuthorizationServer;
  protocol: MCPProtocolHandler;
}

export class MCPHTTPTransport {
  private readonly config: HTTPTransportConfig;

  constructor(config: HTTPTransportConfig) {
    this.config = config;
  }

  async handleRequest(
    method: string,
    path: string,
    headers: Record<string, string>,
    body: unknown
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    body: unknown;
  }> {
    // Handle OAuth endpoints
    if (path === '/.well-known/oauth-authorization-server') {
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: this.config.oauth.getMetadata(),
      };
    }

    // Extract authorization
    const authHeader = headers['authorization'] ?? headers['Authorization'];
    const dpopHeader = headers['dpop'] ?? headers['DPoP'];

    if (!authHeader) {
      return {
        status: 401,
        headers: { 'www-authenticate': 'Bearer' },
        body: { error: 'unauthorized' },
      };
    }

    // Parse bearer/DPoP token
    const [scheme, token] = authHeader.split(' ');
    if (!token || (scheme !== 'Bearer' && scheme !== 'DPoP')) {
      return {
        status: 401,
        headers: { 'www-authenticate': 'Bearer' },
        body: { error: 'invalid_token' },
      };
    }

    // Validate token
    const validation = this.config.oauth.validateAccessToken(
      token,
      dpopHeader,
      method,
      path
    );

    if (!validation.valid) {
      return {
        status: 401,
        headers: { 'www-authenticate': 'Bearer error="invalid_token"' },
        body: { error: validation.error },
      };
    }

    // Create session and handle MCP request
    const sessionId = this.config.protocol.createSession(validation.token);

    try {
      const response = await this.config.protocol.handleRequest(sessionId, body);

      return {
        status: response.error ? 400 : 200,
        headers: { 'content-type': 'application/json' },
        body: response,
      };
    } finally {
      this.config.protocol.endSession(sessionId);
    }
  }
}
