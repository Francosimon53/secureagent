/**
 * Skill Executor
 *
 * Executes skills in a sandboxed environment with timeout protection.
 * Uses Node.js vm module for isolation.
 */

import { Script, createContext, runInContext } from 'vm';
import type {
  Skill,
  SkillMetadata,
  SkillExecutionContext,
  SkillExecutionResult,
} from './types.js';
import {
  SkillError,
  SKILL_DEFAULTS,
  BLOCKED_PATTERNS,
  SANDBOX_GLOBALS,
} from './types.js';

// =============================================================================
// Sandbox Environment
// =============================================================================

/**
 * Sandbox console type (subset of Console)
 */
interface SandboxConsole {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

/**
 * Create a sandboxed console that captures logs
 */
function createSandboxConsole(logs: string[]): SandboxConsole {
  const log = (...args: unknown[]) => {
    logs.push(args.map(a => String(a)).join(' '));
  };
  return {
    log,
    info: log,
    warn: log,
    error: log,
    debug: log,
  };
}

/**
 * Create a sandboxed fetch function with restrictions
 */
function createSandboxFetch(timeout: number): typeof fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    // Block localhost and internal IPs
    const blockedPatterns = [
      /^https?:\/\/localhost/i,
      /^https?:\/\/127\./,
      /^https?:\/\/0\./,
      /^https?:\/\/10\./,
      /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^https?:\/\/192\.168\./,
      /^https?:\/\/\[::1\]/,
      /^file:/,
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(url)) {
        throw new Error(`Access to ${url} is blocked for security reasons`);
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

/**
 * Create sandbox context with allowed globals
 */
function createSandboxContext(
  params: Record<string, unknown>,
  context: SkillExecutionContext,
  logs: string[]
): Record<string, unknown> {
  const sandboxFetch = createSandboxFetch(context.timeout);

  return {
    // Allowed globals
    console: createSandboxConsole(logs),
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Buffer,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,

    // Network access (controlled)
    fetch: sandboxFetch,

    // Skill params and context
    params,
    context: {
      skillId: context.skillId,
      userId: context.userId,
      sessionId: context.sessionId,
    },

    // Utilities
    setTimeout: (fn: () => void, ms: number) => {
      if (ms > context.timeout) ms = context.timeout;
      return setTimeout(fn, ms);
    },
    clearTimeout,
    setInterval: undefined, // Disabled
    clearInterval: undefined,

    // No access to process, require, etc.
    process: undefined,
    require: undefined,
    module: undefined,
    exports: undefined,
    __dirname: undefined,
    __filename: undefined,
    global: undefined,
    globalThis: undefined,
  };
}

// =============================================================================
// Code Validation
// =============================================================================

/**
 * Validate skill code for security issues
 */
export function validateSkillCode(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      errors.push(`Blocked pattern detected: ${pattern.source}`);
    }
  }

  // Try to parse the code
  try {
    new Script(code, { filename: 'skill.js' });
  } catch (error) {
    errors.push(`Syntax error: ${(error as Error).message}`);
  }

  // Check for async execute function
  if (!code.includes('async function execute') && !code.includes('execute = async')) {
    errors.push('Skill must export an async execute function');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// Skill Executor
// =============================================================================

export interface SkillExecutorConfig {
  defaultTimeout: number;
  maxOutputSize: number;
  maxLogs: number;
}

const DEFAULT_CONFIG: SkillExecutorConfig = {
  defaultTimeout: SKILL_DEFAULTS.EXECUTION_TIMEOUT_MS,
  maxOutputSize: 1024 * 1024, // 1MB
  maxLogs: 100,
};

export class SkillExecutor {
  private readonly config: SkillExecutorConfig;

  constructor(config?: Partial<SkillExecutorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a skill with the given parameters
   */
  async execute(
    code: string,
    params: Record<string, unknown>,
    context: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const logs: string[] = [];
    const timeout = context.timeout || this.config.defaultTimeout;

    // Validate code first
    const validation = validateSkillCode(code);
    if (!validation.valid) {
      return {
        success: false,
        error: `Code validation failed: ${validation.errors.join(', ')}`,
        duration: Date.now() - startTime,
        logs,
      };
    }

    try {
      // Create sandbox context
      const sandbox = createSandboxContext(params, { ...context, timeout }, logs);
      const vmContext = createContext(sandbox);

      // Wrap code to capture result
      const wrappedCode = `
        (async () => {
          ${code}

          // Call execute if it exists
          if (typeof execute === 'function') {
            return await execute(params, context);
          }
          throw new Error('No execute function found');
        })()
      `;

      // Compile script
      const script = new Script(wrappedCode, {
        filename: 'skill.js',
      });

      // Execute with timeout
      const resultPromise = script.runInContext(vmContext, {
        timeout,
        displayErrors: true,
      });

      // Race against timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new SkillError('SKILL_TIMEOUT', `Skill execution timed out after ${timeout}ms`));
        }, timeout + 100);
      });

      const result = await Promise.race([resultPromise, timeoutPromise]);
      const duration = Date.now() - startTime;

      // Truncate result if too large
      let truncatedResult = result;
      const resultStr = JSON.stringify(result);
      if (resultStr && resultStr.length > this.config.maxOutputSize) {
        truncatedResult = {
          _truncated: true,
          _originalSize: resultStr.length,
          preview: resultStr.slice(0, 1000) + '...',
        };
      }

      return {
        success: true,
        result: truncatedResult,
        duration,
        logs: logs.slice(0, this.config.maxLogs),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for specific error types
      if (errorMessage.includes('Script execution timed out')) {
        return {
          success: false,
          error: `Skill execution timed out after ${timeout}ms`,
          duration,
          logs: logs.slice(0, this.config.maxLogs),
        };
      }

      return {
        success: false,
        error: errorMessage,
        duration,
        logs: logs.slice(0, this.config.maxLogs),
      };
    }
  }

  /**
   * Validate parameters against skill definition
   */
  validateParams(
    params: Record<string, unknown>,
    metadata: SkillMetadata
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const param of metadata.parameters) {
      const value = params[param.name];

      if (param.required && value === undefined) {
        errors.push(`Missing required parameter: ${param.name}`);
        continue;
      }

      if (value !== undefined) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== param.type && param.type !== 'object') {
          errors.push(`Parameter '${param.name}' expected ${param.type}, got ${actualType}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createSkillExecutor(config?: Partial<SkillExecutorConfig>): SkillExecutor {
  return new SkillExecutor(config);
}
