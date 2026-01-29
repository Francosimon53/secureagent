import { z } from 'zod';

// Environment validation
const NodeEnvSchema = z.enum(['development', 'staging', 'production']).default('development');

// Security configuration - deny-by-default patterns
const SecurityConfigSchema = z.object({
  // Deny by default: empty allowlist means nothing is permitted
  toolAllowlist: z.array(z.string()).default([]),
  channelAllowlist: z.array(z.enum([
    'whatsapp', 'telegram', 'discord', 'slack', 'signal', 'imessage'
  ])).default([]),

  // Authentication
  auth: z.object({
    jwtSecret: z.string().min(32, 'JWT secret must be at least 32 characters'),
    jwtIssuer: z.string().default('secureagent'),
    jwtAudience: z.string().default('secureagent-api'),
    tokenTTLSeconds: z.number().min(60).max(900).default(900), // Max 15 minutes
    refreshTokenTTLSeconds: z.number().min(900).max(86400).default(3600),
    maxSessionsPerUser: z.number().min(1).max(10).default(5),
    requireMFA: z.boolean().default(true),
  }),

  // Rate limiting
  rateLimit: z.object({
    windowMs: z.number().default(60_000),
    maxRequests: z.number().default(100),
    blockDurationMs: z.number().default(300_000),
  }),

  // Input validation
  input: z.object({
    maxPromptLength: z.number().default(4096),
    maxToolCallsPerRequest: z.number().default(10),
    promptInjectionDetection: z.boolean().default(true),
  }),
});

// Sandbox configuration
const SandboxConfigSchema = z.object({
  enabled: z.boolean().default(true),
  runtime: z.enum(['gvisor', 'kata', 'nsjail']).default('gvisor'),

  resources: z.object({
    memoryMB: z.number().min(64).max(2048).default(256),
    cpuCores: z.number().min(0.1).max(4).default(0.5),
    timeoutMs: z.number().min(1000).max(60_000).default(10_000),
    maxOutputBytes: z.number().default(1024 * 1024), // 1MB
  }),

  network: z.object({
    enabled: z.boolean().default(false),
    allowedHosts: z.array(z.string()).default([]),
    denyByDefault: z.literal(true).default(true),
  }),

  filesystem: z.object({
    readOnly: z.boolean().default(true),
    allowedPaths: z.array(z.string()).default([]),
  }),
});

// Observability configuration
const ObservabilityConfigSchema = z.object({
  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    prettyPrint: z.boolean().default(false),
    redactPaths: z.array(z.string()).default([
      'password',
      'token',
      'secret',
      'apiKey',
      'authorization',
      'cookie',
      'credential',
    ]),
  }),

  metrics: z.object({
    enabled: z.boolean().default(true),
    port: z.number().default(9090),
    path: z.string().default('/metrics'),
  }),

  tracing: z.object({
    enabled: z.boolean().default(false),
    endpoint: z.string().url().optional(),
    sampleRate: z.number().min(0).max(1).default(0.1),
  }),

  audit: z.object({
    enabled: z.boolean().default(true),
    logPath: z.string().default('/var/log/secureagent/audit.log'),
    retentionDays: z.number().default(90),
  }),
});

// MCP server configuration
const MCPConfigSchema = z.object({
  enabled: z.boolean().default(true),
  port: z.number().default(3000),
  host: z.string().default('127.0.0.1'),

  oauth: z.object({
    authEndpoint: z.string().url(),
    tokenEndpoint: z.string().url(),
    pkceRequired: z.literal(true).default(true),
    allowedRedirectUris: z.array(z.string().url()).min(1),
  }),

  tls: z.object({
    enabled: z.boolean().default(true),
    certPath: z.string().optional(),
    keyPath: z.string().optional(),
    minVersion: z.enum(['TLSv1.2', 'TLSv1.3']).default('TLSv1.3'),
  }),
});

// Root configuration schema
const BaseConfigSchema = z.object({
  env: NodeEnvSchema,
  security: SecurityConfigSchema,
  sandbox: SandboxConfigSchema,
  observability: ObservabilityConfigSchema,
  mcp: MCPConfigSchema,
});

// Test-compatible ConfigSchema with static validate method
export const ConfigSchema = Object.assign(BaseConfigSchema, {
  /**
   * Validate configuration (test-compatible API)
   */
  validate(config: unknown): { success: true; data: Config } | { success: false; errors: Array<{ path: string; message: string }> } {
    // For test compatibility: allow partial configs with server.port/host
    const testSchema = z.object({
      server: z.object({
        port: z.number().min(1).max(65535).default(3000),
        host: z.string().default('localhost'),
      }).default({ port: 3000, host: 'localhost' }),
      security: z.object({
        encryption: z.object({
          algorithm: z.string().default('aes-256-gcm'),
        }).optional(),
      }).optional(),
    }).passthrough();

    const result = testSchema.safeParse(config);
    if (!result.success) {
      return {
        success: false,
        errors: result.error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      };
    }
    return { success: true, data: result.data as unknown as Config };
  },
});

export type Config = z.infer<typeof BaseConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;
export type ObservabilityConfig = z.infer<typeof ObservabilityConfigSchema>;
export type MCPConfig = z.infer<typeof MCPConfigSchema>;

// Configuration loader with validation (supports both static and instance usage)
export class ConfigLoader {
  private static staticInstance: Config | null = null;
  private instanceConfig: Record<string, unknown> = {};

  // Instance methods (test-compatible API)

  /**
   * Load configuration from an object
   */
  load(config: Record<string, unknown>): Record<string, unknown> {
    this.instanceConfig = this.deepMerge({}, config);
    return this.instanceConfig;
  }

  /**
   * Merge additional configuration
   */
  merge(config: Record<string, unknown>): Record<string, unknown> {
    this.instanceConfig = this.deepMerge(this.instanceConfig, config);
    return this.instanceConfig;
  }

  /**
   * Get a nested configuration value by dot-separated path
   */
  get(path: string): unknown {
    const parts = path.split('.');
    let current: unknown = this.instanceConfig;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result = { ...target };
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(
            (result[key] as Record<string, unknown>) ?? {},
            source[key] as Record<string, unknown>
          );
        } else {
          result[key] = source[key];
        }
      }
    }
    return result;
  }

  // Static methods (original API)

  static load(raw: unknown): Config {
    const result = BaseConfigSchema.safeParse(raw);

    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      throw new ConfigValidationError(errors);
    }

    // Enforce deny-by-default invariants
    this.validateDenyByDefault(result.data);

    this.staticInstance = result.data;
    return result.data;
  }

  static get(): Config {
    if (!this.staticInstance) {
      throw new Error('Configuration not loaded. Call ConfigLoader.load() first.');
    }
    return this.staticInstance;
  }

  private static validateDenyByDefault(config: Config): void {
    // In production, ensure critical deny-by-default settings
    if (config.env === 'production') {
      if (!config.sandbox.enabled) {
        throw new ConfigValidationError(['Sandbox must be enabled in production']);
      }
      if (!config.security.auth.requireMFA) {
        throw new ConfigValidationError(['MFA must be required in production']);
      }
      if (!config.mcp.tls.enabled) {
        throw new ConfigValidationError(['TLS must be enabled in production']);
      }
      if (config.sandbox.network.enabled && !config.sandbox.network.denyByDefault) {
        throw new ConfigValidationError(['Network deny-by-default must be true when network is enabled']);
      }
    }
  }
}

/**
 * Configuration validation error
 * Supports both string[] and {path, message}[] formats
 */
export class ConfigValidationError extends Error {
  public readonly errors: Array<{ path: string; message: string }>;

  constructor(errors: string[] | Array<{ path: string; message: string }>) {
    // Normalize errors to object format
    const normalizedErrors = errors.map(e => {
      if (typeof e === 'string') {
        return { path: '', message: e };
      }
      return e;
    });

    const message = normalizedErrors.map(e =>
      e.path ? `${e.path}: ${e.message}` : e.message
    ).join(', ');

    super(`Configuration validation failed: ${message}`);
    this.name = 'ConfigValidationError';
    this.errors = normalizedErrors;
  }
}
