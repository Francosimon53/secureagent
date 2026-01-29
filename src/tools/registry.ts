import { z, ZodSchema, ZodError } from 'zod';
import type { UserIdentity, ToolCall, ToolExecutionContext } from '../security/types.js';
import { ToolNotAllowedError, ToolValidationError } from '../security/types.js';
import { getLogger, getAuditLogger } from '../observability/logger.js';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ToolDefinition<TParams = unknown, TResult = unknown> {
  name: string;
  description: string;
  version: string;
  parameters: ZodSchema<TParams>;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  sandboxed: boolean;
  timeout: number;
  requiredRoles?: string[];
  requiredPermissions?: string[];
  rateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
  execute: (params: TParams, context: ToolExecutionContext) => Promise<TResult>;
}

interface InternalToolDefinition {
  name: string;
  description: string;
  version: string;
  parameters: ZodSchema;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  sandboxed: boolean;
  timeout: number;
  requiredRoles?: string[];
  requiredPermissions?: string[];
  rateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
  execute: (params: unknown, context: ToolExecutionContext) => Promise<unknown>;
}

interface RegisteredTool {
  definition: InternalToolDefinition;
  callCount: number;
  lastCallTime: number;
  rateLimitWindow: Map<string, number[]>;
}

export class ToolRegistry {
  private readonly allowlist: Set<string>;
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly logger = getLogger().child({ module: 'ToolRegistry' });
  private readonly auditLogger = getAuditLogger();

  constructor(allowedTools: string[]) {
    this.allowlist = new Set(allowedTools);
    this.logger.info({ allowedTools }, 'Tool registry initialized with allowlist');
  }

  register<TParams, TResult>(definition: ToolDefinition<TParams, TResult>): boolean {
    if (!this.isValidToolName(definition.name)) {
      this.logger.warn({ toolName: definition.name }, 'Invalid tool name format');
      return false;
    }

    if (!this.allowlist.has(definition.name)) {
      this.logger.warn({ toolName: definition.name }, 'Tool not in allowlist, registration denied');
      return false;
    }

    const validationResult = this.validateDefinition(definition as ToolDefinition<unknown, unknown>);
    if (!validationResult.valid) {
      this.logger.error({ toolName: definition.name, errors: validationResult.errors }, 'Invalid tool definition');
      return false;
    }

    const internalDef: InternalToolDefinition = {
      name: definition.name,
      description: definition.description,
      version: definition.version,
      parameters: definition.parameters,
      riskLevel: definition.riskLevel,
      requiresApproval: definition.requiresApproval,
      sandboxed: definition.sandboxed,
      timeout: definition.timeout,
      requiredRoles: definition.requiredRoles,
      requiredPermissions: definition.requiredPermissions,
      rateLimit: definition.rateLimit,
      execute: definition.execute as (params: unknown, context: ToolExecutionContext) => Promise<unknown>,
    };

    this.tools.set(definition.name, {
      definition: internalDef,
      callCount: 0,
      lastCallTime: 0,
      rateLimitWindow: new Map(),
    });

    this.logger.info({
      toolName: definition.name,
      riskLevel: definition.riskLevel,
      sandboxed: definition.sandboxed,
    }, 'Tool registered');

    return true;
  }

  unregister(toolName: string): boolean {
    const result = this.tools.delete(toolName);
    if (result) {
      this.logger.info({ toolName }, 'Tool unregistered');
    }
    return result;
  }

  get(toolName: string): InternalToolDefinition | undefined {
    return this.tools.get(toolName)?.definition;
  }

  isAllowed(toolName: string): boolean {
    return this.allowlist.has(toolName) && this.tools.has(toolName);
  }

  validateCall(
    toolName: string,
    params: unknown
  ): { valid: boolean; params?: unknown; errors?: string[] } {
    const tool = this.tools.get(toolName);

    if (!tool) {
      return { valid: false, errors: [`Tool not found: ${toolName}`] };
    }

    try {
      const validatedParams = tool.definition.parameters.parse(params);
      return { valid: true, params: validatedParams };
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        return { valid: false, errors };
      }
      return { valid: false, errors: ['Parameter validation failed'] };
    }
  }

  checkPermission(
    toolName: string,
    identity: UserIdentity
  ): { allowed: boolean; reason?: string } {
    const tool = this.tools.get(toolName);

    if (!tool) {
      return { allowed: false, reason: 'Tool not found' };
    }

    const def = tool.definition;

    if (def.requiredRoles && def.requiredRoles.length > 0) {
      const hasRole = def.requiredRoles.some(role => identity.roles.includes(role));
      if (!hasRole) {
        return {
          allowed: false,
          reason: `Missing required role: ${def.requiredRoles.join(' or ')}`,
        };
      }
    }

    if ((def.riskLevel === 'high' || def.riskLevel === 'critical') && !identity.mfaVerified) {
      return { allowed: false, reason: 'MFA required for high-risk tools' };
    }

    return { allowed: true };
  }

  checkRateLimit(
    toolName: string,
    userId: string
  ): { allowed: boolean; retryAfterMs?: number } {
    const tool = this.tools.get(toolName);

    if (!tool || !tool.definition.rateLimit) {
      return { allowed: true };
    }

    const { maxCalls, windowMs } = tool.definition.rateLimit;
    const now = Date.now();

    let userCalls = tool.rateLimitWindow.get(userId) ?? [];
    userCalls = userCalls.filter(timestamp => now - timestamp < windowMs);
    tool.rateLimitWindow.set(userId, userCalls);

    if (userCalls.length >= maxCalls) {
      const oldestCall = Math.min(...userCalls);
      const retryAfterMs = windowMs - (now - oldestCall);
      return { allowed: false, retryAfterMs };
    }

    userCalls.push(now);

    return { allowed: true };
  }

  async execute<TResult = unknown>(
    call: ToolCall,
    context: ToolExecutionContext
  ): Promise<{
    success: boolean;
    result?: TResult;
    error?: Error;
    metrics: { durationMs: number };
  }> {
    const startTime = Date.now();
    const tool = this.tools.get(call.toolName);

    if (!tool) {
      throw new ToolNotAllowedError(call.toolName, call.requestId);
    }

    const validation = this.validateCall(call.toolName, call.parameters);
    if (!validation.valid) {
      throw new ToolValidationError(call.toolName, validation.errors ?? [], call.requestId);
    }

    const permission = this.checkPermission(call.toolName, context.identity);
    if (!permission.allowed) {
      this.auditLogger.toolExecution(
        context.identity.userId,
        call.toolName,
        'blocked',
        { reason: permission.reason }
      );
      throw new ToolNotAllowedError(call.toolName, call.requestId);
    }

    const rateLimit = this.checkRateLimit(call.toolName, context.identity.userId);
    if (!rateLimit.allowed) {
      this.auditLogger.toolExecution(
        context.identity.userId,
        call.toolName,
        'blocked',
        { reason: 'rate_limited', retryAfterMs: rateLimit.retryAfterMs }
      );
      throw new ToolValidationError(
        call.toolName,
        [`Rate limit exceeded, retry after ${rateLimit.retryAfterMs}ms`],
        call.requestId
      );
    }

    try {
      const result = await this.executeWithTimeout(
        tool.definition.execute(validation.params, context),
        tool.definition.timeout
      );

      const durationMs = Date.now() - startTime;

      tool.callCount++;
      tool.lastCallTime = Date.now();

      this.auditLogger.toolExecution(
        context.identity.userId,
        call.toolName,
        'success',
        { durationMs }
      );

      return {
        success: true,
        result: result as TResult,
        metrics: { durationMs },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      this.auditLogger.toolExecution(
        context.identity.userId,
        call.toolName,
        'failure',
        { durationMs, error: error instanceof Error ? error.message : 'Unknown error' }
      );

      return {
        success: false,
        error: error instanceof Error ? error : new Error('Unknown error'),
        metrics: { durationMs },
      };
    }
  }

  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tool execution timeout')), timeoutMs)
      ),
    ]);
  }

  private isValidToolName(name: string): boolean {
    return /^[a-z][a-z0-9_]*$/.test(name);
  }

  private validateDefinition(definition: ToolDefinition): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!definition.name) errors.push('name is required');
    if (!definition.description) errors.push('description is required');
    if (!definition.version) errors.push('version is required');
    if (!definition.parameters) errors.push('parameters schema is required');
    if (!definition.execute) errors.push('execute function is required');
    if (typeof definition.timeout !== 'number' || definition.timeout <= 0) {
      errors.push('timeout must be a positive number');
    }
    if (!['low', 'medium', 'high', 'critical'].includes(definition.riskLevel)) {
      errors.push('invalid riskLevel');
    }

    return { valid: errors.length === 0, errors };
  }

  list(): Array<{
    name: string;
    description: string;
    riskLevel: RiskLevel;
    requiresApproval: boolean;
    sandboxed: boolean;
  }> {
    return Array.from(this.tools.values()).map(t => ({
      name: t.definition.name,
      description: t.definition.description,
      riskLevel: t.definition.riskLevel,
      requiresApproval: t.definition.requiresApproval,
      sandboxed: t.definition.sandboxed,
    }));
  }

  getMetrics(): Map<string, { callCount: number; lastCallTime: number }> {
    const metrics = new Map<string, { callCount: number; lastCallTime: number }>();

    for (const [name, tool] of this.tools) {
      metrics.set(name, {
        callCount: tool.callCount,
        lastCallTime: tool.lastCallTime,
      });
    }

    return metrics;
  }
}

export function defineTool<TParams, TResult>(
  definition: ToolDefinition<TParams, TResult>
): ToolDefinition<TParams, TResult> {
  return definition;
}

export const CommonSchemas = {
  filePath: z.string()
    .min(1)
    .max(4096)
    .refine(
      path => !path.includes('..') && !path.startsWith('/'),
      'Path traversal not allowed'
    ),

  url: z.string().url().max(2048),

  safeString: z.string()
    .max(10000)
    .refine(
      str => !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(str),
      'Control characters not allowed'
    ),

  jsonObject: z.record(z.unknown()).refine(
    obj => {
      try {
        JSON.stringify(obj);
        return true;
      } catch {
        return false;
      }
    },
    'Must be JSON serializable'
  ),
};
