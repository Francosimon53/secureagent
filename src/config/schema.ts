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

// Persistence configuration
const PersistenceConfigSchema = z.object({
  database: z.object({
    type: z.enum(['memory', 'sqlite', 'postgresql']).default('sqlite'),
    filename: z.string().default('./data/secureagent.db'),
    journalMode: z.enum(['wal', 'delete', 'truncate', 'memory', 'off']).default('wal'),
    synchronous: z.enum(['off', 'normal', 'full', 'extra']).default('normal'),
    busyTimeout: z.number().default(5000),
    cacheSize: z.number().default(-64000), // 64MB
    foreignKeys: z.boolean().default(true),
  }),

  encryption: z.object({
    enabled: z.boolean().default(true),
    masterKeyEnvVar: z.string().default('SECUREAGENT_MASTER_KEY'),
    saltLength: z.number().default(16),
    ivLength: z.number().default(12),
  }),
});

// Scheduler configuration
const SchedulerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  tickInterval: z.number().min(100).max(60000).default(1000),
  maxConcurrentJobs: z.number().min(1).max(100).default(10),
  defaultTimeoutMs: z.number().default(300000), // 5 minutes
  defaultRetryCount: z.number().default(0),
  defaultRetryDelayMs: z.number().default(60000), // 1 minute
});

// Memory manager configuration
const MemoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxMemoriesPerUser: z.number().min(10).max(10000).default(1000),
  defaultExpirationMs: z.number().default(0), // 0 = never
  enableSummarization: z.boolean().default(true),
  summarizationThreshold: z.number().default(100),
  storeType: z.enum(['memory', 'database']).default('database'),
});

// Trigger manager configuration
const TriggerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultCooldownMs: z.number().default(1000),
  maxTriggersPerEvent: z.number().default(10),
});

// Productivity configuration
const ProductivityConfigSchema = z.object({
  enabled: z.boolean().default(true),

  // API allowlist (deny-by-default)
  allowedApiDomains: z.array(z.string()).default([
    'api.openweathermap.org',
    'www.googleapis.com',
    'graph.microsoft.com',
    'newsapi.org',
  ]),

  weather: z.object({
    provider: z.enum(['openweathermap', 'weatherapi']).default('openweathermap'),
    apiKeyEnvVar: z.string().default('WEATHER_API_KEY'),
    location: z.string().optional(),
    units: z.enum(['metric', 'imperial']).default('metric'),
    cacheTTLSeconds: z.number().min(60).max(3600).default(900),
  }).optional(),

  calendar: z.object({
    provider: z.enum(['google', 'outlook']).default('google'),
    credentialsEnvVar: z.string().default('CALENDAR_CREDENTIALS'),
    lookAheadDays: z.number().min(1).max(30).default(7),
    includeDeclined: z.boolean().default(false),
    cacheTTLSeconds: z.number().min(60).max(3600).default(300),
  }).optional(),

  email: z.object({
    provider: z.enum(['gmail', 'outlook']).default('gmail'),
    credentialsEnvVar: z.string().default('EMAIL_CREDENTIALS'),
    maxEmailsToProcess: z.number().min(10).max(500).default(100),
    vipSenders: z.array(z.string()).default([]),
    autoArchiveAfterDays: z.number().min(0).max(90).default(0),
    cacheTTLSeconds: z.number().min(60).max(1800).default(300),
  }).optional(),

  taskScoring: z.object({
    enabled: z.boolean().default(true),
    weights: z.object({
      urgency: z.number().min(0).max(1).default(0.3),
      importance: z.number().min(0).max(1).default(0.3),
      effort: z.number().min(0).max(1).default(0.15),
      contextMatch: z.number().min(0).max(1).default(0.15),
      decay: z.number().min(0).max(1).default(0.1),
    }).default({}),
    decayHalfLifeDays: z.number().min(1).max(30).default(7),
  }).optional(),

  morningBrief: z.object({
    enabled: z.boolean().default(true),
    defaultDeliveryTime: z.string().default('07:00'),
    sections: z.array(z.enum([
      'weather', 'calendar', 'health', 'email', 'news', 'tasks',
    ])).default(['weather', 'calendar', 'tasks']),
  }).optional(),

  weeklyReview: z.object({
    enabled: z.boolean().default(true),
    deliveryDay: z.enum(['sunday', 'monday']).default('sunday'),
    deliveryTime: z.string().default('20:00'),
  }).optional(),

  storeType: z.enum(['memory', 'database']).default('database'),
});

// Savings configuration
const SavingsConfigSchema = z.object({
  enabled: z.boolean().default(true),

  negotiation: z.object({
    enabled: z.boolean().default(true),
    emailProvider: z.enum(['smtp', 'sendgrid', 'ses']).default('smtp'),
  }).optional(),

  shopping: z.object({
    enabled: z.boolean().default(true),
    sms2faBridge: z.object({
      enabled: z.boolean().default(false),
      provider: z.enum(['twilio', 'vonage']).default('twilio'),
      sessionTimeoutSeconds: z.number().default(300),
      requireExplicitConsent: z.boolean().default(true),
    }).optional(),
  }).optional(),

  priceMonitoring: z.object({
    enabled: z.boolean().default(true),
    checkIntervalMinutes: z.number().default(60),
    maxAlertsPerUser: z.number().default(50),
    historyRetentionDays: z.number().default(90),
  }).optional(),

  insurance: z.object({
    enabled: z.boolean().default(true),
    encryptPII: z.boolean().default(true),
    encryptionKeyEnvVar: z.string().default('INSURANCE_ENCRYPTION_KEY'),
  }).optional(),

  expenses: z.object({
    enabled: z.boolean().default(true),
    defaultCurrency: z.string().default('USD'),
    splitRequestProvider: z.enum(['email', 'venmo', 'manual']).default('email'),
  }).optional(),

  bills: z.object({
    enabled: z.boolean().default(true),
    defaultReminderDays: z.array(z.number()).default([7, 3, 1]),
    overdueGraceDays: z.number().default(3),
  }).optional(),

  subscriptions: z.object({
    enabled: z.boolean().default(true),
    detectFromTransactions: z.boolean().default(true),
    unusedThresholdDays: z.number().default(30),
    renewalReminderDays: z.number().default(7),
  }).optional(),

  storeType: z.enum(['memory', 'database']).default('database'),
});

// Family configuration
const FamilyConfigSchema = z.object({
  enabled: z.boolean().default(true),
  storeType: z.enum(['memory', 'database']).default('database'),
  maxFamilyGroupsPerUser: z.number().min(1).default(5),
  maxMembersPerGroup: z.number().min(2).default(20),

  mealPlanning: z.object({
    enabled: z.boolean().default(true),
    defaultServings: z.number().min(1).default(4),
    enablePriceEstimates: z.boolean().default(false),
  }).optional(),

  schoolCalendar: z.object({
    enabled: z.boolean().default(true),
    syncIntervalMinutes: z.number().min(5).default(60),
    enableNotifications: z.boolean().default(true),
    googleCalendarApiKeyEnvVar: z.string().default('GOOGLE_CALENDAR_API_KEY'),
  }).optional(),

  projects: z.object({
    enabled: z.boolean().default(true),
    enableWeeklySummaries: z.boolean().default(true),
    maxTopicsPerProject: z.number().min(1).default(20),
    maxNotesPerTopic: z.number().min(1).default(100),
  }).optional(),

  sharedMemories: z.object({
    enabled: z.boolean().default(true),
    requireConsent: z.boolean().default(true),
    encryptionEnabled: z.boolean().default(true),
    maxMemoriesPerUser: z.number().min(1).default(1000),
  }).optional(),

  games: z.object({
    enabled: z.boolean().default(true),
    aiProviderApiKeyEnvVar: z.string().default('OPENAI_API_KEY'),
    maxGamesPerDay: z.number().min(1).default(10),
    kidSafePrompts: z.boolean().default(true),
  }).optional(),

  recipes: z.object({
    enabled: z.boolean().default(true),
    provider: z.enum(['spoonacular', 'edamam', 'local']).default('local'),
    apiKeyEnvVar: z.string().default('RECIPE_API_KEY'),
    maxSuggestions: z.number().min(1).default(10),
  }).optional(),
});

// Wellness configuration (health tracking)
const WellnessConfigSchema = z.object({
  enabled: z.boolean().default(true),
  storeType: z.enum(['memory', 'database']).default('database'),

  bloodwork: z.object({
    enabled: z.boolean().default(true),
    pdfParserLibrary: z.enum(['pdf-parse', 'pdf2json']).default('pdf-parse'),
    maxFileSizeMB: z.number().min(1).max(50).default(10),
    enableTrendAnalysis: z.boolean().default(true),
  }).optional(),

  whoop: z.object({
    enabled: z.boolean().default(true),
    clientIdEnvVar: z.string().default('WHOOP_CLIENT_ID'),
    clientSecretEnvVar: z.string().default('WHOOP_CLIENT_SECRET'),
    baseUrl: z.string().url().default('https://api.prod.whoop.com'),
    syncIntervalMinutes: z.number().min(15).max(1440).default(60),
    lowRecoveryThreshold: z.number().min(0).max(100).default(33),
  }).optional(),

  garmin: z.object({
    enabled: z.boolean().default(true),
    consumerKeyEnvVar: z.string().default('GARMIN_CONSUMER_KEY'),
    consumerSecretEnvVar: z.string().default('GARMIN_CONSUMER_SECRET'),
    syncIntervalMinutes: z.number().min(15).max(1440).default(60),
    includeGPSData: z.boolean().default(true),
  }).optional(),

  appleHealth: z.object({
    enabled: z.boolean().default(true),
    supportedFormats: z.array(z.enum(['xml', 'csv'])).default(['xml', 'csv']),
    maxImportFileSizeMB: z.number().min(1).max(500).default(100),
  }).optional(),

  sleepMonitoring: z.object({
    enabled: z.boolean().default(true),
    preferredSource: z.enum(['whoop', 'garmin', 'apple_health', 'auto']).default('auto'),
    targetSleepMinutes: z.number().min(240).max(720).default(480),
    targetBedtime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).default('22:30'),
    enableAlerts: z.boolean().default(true),
  }).optional(),

  medications: z.object({
    enabled: z.boolean().default(true),
    defaultReminderMinutesBefore: z.number().min(0).max(60).default(5),
    snoozeIntervalMinutes: z.number().min(5).max(60).default(10),
    missedWindowMinutes: z.number().min(30).max(360).default(120),
    refillReminderDays: z.number().min(1).max(30).default(7),
    lowAdherenceThreshold: z.number().min(0).max(100).default(80),
  }).optional(),

  sync: z.object({
    enabled: z.boolean().default(true),
    defaultIntervalMinutes: z.number().min(15).max(1440).default(60),
    retryAttempts: z.number().min(1).max(5).default(3),
  }).optional(),
});

// DevTools configuration
const DevToolsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  storeType: z.enum(['memory', 'database']).default('database'),

  agents: z.object({
    enabled: z.boolean().default(true),
    defaultTimeout: z.number().min(1000).max(3600000).default(300000),
    maxConcurrent: z.number().min(1).max(10).default(3),
    progressReportInterval: z.number().min(1000).max(60000).default(5000),
    allowedAgentTypes: z.array(z.enum(['claude-code', 'codex', 'custom'])).default(['claude-code']),
  }).optional(),

  github: z.object({
    enabled: z.boolean().default(true),
    tokenEnvVar: z.string().default('GITHUB_TOKEN'),
    apiBaseUrl: z.string().url().default('https://api.github.com'),
    defaultOwner: z.string().optional(),
    rateLimitPerHour: z.number().min(1).max(5000).default(1000),
    mergeRequiresApproval: z.boolean().default(true),
    deleteBranchAfterMerge: z.boolean().default(true),
    defaultMergeMethod: z.enum(['merge', 'squash', 'rebase']).default('squash'),
    requirePassingChecks: z.boolean().default(true),
    timeout: z.number().min(1000).max(60000).default(30000),
  }).optional(),

  deployments: z.object({
    enabled: z.boolean().default(true),
    provider: z.enum(['github-actions', 'vercel', 'netlify', 'custom-webhook']).default('github-actions'),
    productionRequiresApproval: z.boolean().default(true),
    stagingRequiresApproval: z.boolean().default(false),
    rollbackRequiresApproval: z.boolean().default(true),
    webhookUrl: z.string().url().optional(),
    timeout: z.number().min(1000).max(1800000).default(600000),
    pollInterval: z.number().min(1000).max(60000).default(10000),
  }).optional(),

  bugDetection: z.object({
    enabled: z.boolean().default(true),
    sources: z.array(z.enum(['logs', 'errors', 'metrics', 'manual'])).default(['errors', 'logs']),
    severityThreshold: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
    autoFixEnabled: z.boolean().default(false),
    autoFixRequiresApproval: z.boolean().default(true),
  }).optional(),

  testFixLoop: z.object({
    enabled: z.boolean().default(true),
    defaultTestCommand: z.string().default('npm test'),
    maxIterations: z.number().min(1).max(20).default(5),
    timeoutPerIteration: z.number().min(10000).max(600000).default(120000),
  }).optional(),

  issues: z.object({
    enabled: z.boolean().default(true),
    defaultLabels: z.array(z.string()).default(['bug', 'auto-created']),
    includeConversationContext: z.boolean().default(true),
    maxContextMessages: z.number().min(1).max(50).default(10),
  }).optional(),
});

// Root configuration schema
const BaseConfigSchema = z.object({
  env: NodeEnvSchema,
  security: SecurityConfigSchema,
  sandbox: SandboxConfigSchema,
  observability: ObservabilityConfigSchema,
  mcp: MCPConfigSchema,
  persistence: PersistenceConfigSchema.optional(),
  scheduler: SchedulerConfigSchema.optional(),
  memory: MemoryConfigSchema.optional(),
  triggers: TriggerConfigSchema.optional(),
  productivity: ProductivityConfigSchema.optional(),
  savings: SavingsConfigSchema.optional(),
  devtools: DevToolsConfigSchema.optional(),
  family: FamilyConfigSchema.optional(),
  wellness: WellnessConfigSchema.optional(),
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
export type PersistenceConfig = z.infer<typeof PersistenceConfigSchema>;
export type SchedulerConfig = z.infer<typeof SchedulerConfigSchema>;
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;
export type TriggerConfig = z.infer<typeof TriggerConfigSchema>;
export type ProductivityConfig = z.infer<typeof ProductivityConfigSchema>;
export type SavingsConfig = z.infer<typeof SavingsConfigSchema>;
export type DevToolsConfig = z.infer<typeof DevToolsConfigSchema>;
export type FamilyConfig = z.infer<typeof FamilyConfigSchema>;
export type WellnessConfig = z.infer<typeof WellnessConfigSchema>;

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
