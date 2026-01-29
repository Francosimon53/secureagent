import pino, { Logger, LoggerOptions, DestinationStream } from 'pino';
import type { AuditEvent } from '../security/types.js';

const DEFAULT_REDACT_PATHS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'cookie',
  'credential',
  'credentials',
  'privateKey',
  'private_key',
  'jwtSecret',
  'jwt_secret',
  'signingSecret',
  'signing_secret',
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.api_key',
  '*.authorization',
  '*.credential',
  '*.credentials',
  'headers.authorization',
  'headers.cookie',
  'headers["x-api-key"]',
  'body.password',
  'body.token',
  'body.secret',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

const SENSITIVE_PATTERNS = [
  { pattern: /sk-[a-zA-Z0-9]{48}/g, replacement: '[REDACTED_OPENAI_KEY]' },
  { pattern: /sk-ant-[a-zA-Z0-9-]{95}/g, replacement: '[REDACTED_ANTHROPIC_KEY]' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /gho_[a-zA-Z0-9]{36}/g, replacement: '[REDACTED_GITHUB_OAUTH]' },
  { pattern: /github_pat_[a-zA-Z0-9_]{22,}/g, replacement: '[REDACTED_GITHUB_PAT]' },
  { pattern: /xox[baprs]-[a-zA-Z0-9-]{10,}/g, replacement: '[REDACTED_SLACK_TOKEN]' },
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: '[REDACTED_AWS_KEY]' },
  { pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, replacement: '[REDACTED_JWT]' },
  { pattern: /Bearer\s+[a-zA-Z0-9._-]+/gi, replacement: 'Bearer [REDACTED]' },
  { pattern: /:\/\/[^:]+:[^@]+@/g, replacement: '://[REDACTED]@' },
];

export interface LoggerConfig {
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  prettyPrint?: boolean;
  redactPaths?: string[];
  serviceName?: string;
  version?: string;
}

function redactSensitiveStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    let result = value;
    for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitiveStrings);
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = redactSensitiveStrings(val);
    }
    return result;
  }

  return value;
}

export function createLogger(config: LoggerConfig = {}): Logger {
  const {
    level = 'info',
    prettyPrint = false,
    redactPaths = [],
    serviceName = 'secureagent',
    version = '1.0.0',
  } = config;

  const allRedactPaths = [...DEFAULT_REDACT_PATHS, ...redactPaths];

  const options: LoggerOptions = {
    level,
    name: serviceName,
    redact: {
      paths: allRedactPaths,
      censor: '[REDACTED]',
    },
    base: {
      service: serviceName,
      version,
      pid: process.pid,
    },
    serializers: {
      err: pino.stdSerializers.err,
      res: pino.stdSerializers.res,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ level: label }),
      log: (obj: Record<string, unknown>) => redactSensitiveStrings(obj) as Record<string, unknown>,
    },
  };

  if (prettyPrint) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(options);
}

let loggerInstance: Logger | null = null;

export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}

export function initLogger(config: LoggerConfig): Logger {
  loggerInstance = createLogger(config);
  return loggerInstance;
}

export class AuditLogger {
  private logger: Logger;
  private destination: DestinationStream | null = null;

  constructor(config: { logPath?: string; logger?: Logger } = {}) {
    if (config.logPath) {
      this.destination = pino.destination(config.logPath);
      this.logger = pino(
        {
          level: 'info',
          timestamp: pino.stdTimeFunctions.isoTime,
          base: { type: 'audit' },
        },
        this.destination
      );
    } else {
      this.logger = config.logger ?? getLogger().child({ type: 'audit' });
    }
  }

  log(event: AuditEvent): void {
    const level = this.severityToLevel(event.severity);

    this.logger[level]({
      eventId: event.eventId,
      eventType: event.eventType,
      actor: event.actor,
      resource: event.resource,
      action: event.action,
      outcome: event.outcome,
      details: event.details,
      riskIndicators: event.riskIndicators,
    });
  }

  private severityToLevel(severity: AuditEvent['severity']): 'info' | 'warn' | 'error' | 'fatal' {
    switch (severity) {
      case 'info':
        return 'info';
      case 'warn':
        return 'warn';
      case 'error':
        return 'error';
      case 'critical':
        return 'fatal';
    }
  }

  authenticationAttempt(
    userId: string,
    outcome: 'success' | 'failure',
    details: Record<string, unknown>
  ): void {
    this.log({
      eventId: crypto.randomUUID(),
      timestamp: Date.now(),
      eventType: 'authentication',
      severity: outcome === 'failure' ? 'warn' : 'info',
      actor: { userId },
      resource: { type: 'session' },
      action: 'authenticate',
      outcome,
      details,
    });
  }

  toolExecution(
    userId: string,
    toolName: string,
    outcome: 'success' | 'failure' | 'blocked',
    details: Record<string, unknown>
  ): void {
    this.log({
      eventId: crypto.randomUUID(),
      timestamp: Date.now(),
      eventType: 'tool_execution',
      severity: outcome === 'blocked' ? 'warn' : outcome === 'failure' ? 'error' : 'info',
      actor: { userId },
      resource: { type: 'tool', name: toolName },
      action: 'execute',
      outcome,
      details,
    });
  }

  promptInjectionDetected(
    userId: string,
    confidence: number,
    patterns: string[]
  ): void {
    this.log({
      eventId: crypto.randomUUID(),
      timestamp: Date.now(),
      eventType: 'prompt_injection',
      severity: confidence > 0.8 ? 'critical' : 'warn',
      actor: { userId },
      resource: { type: 'prompt' },
      action: 'validate',
      outcome: 'blocked',
      details: { confidence, patterns },
      riskIndicators: ['prompt_injection_attempt'],
    });
  }

  sessionAnomaly(
    userId: string,
    sessionId: string,
    riskScore: number,
    indicators: string[]
  ): void {
    this.log({
      eventId: crypto.randomUUID(),
      timestamp: Date.now(),
      eventType: 'session',
      severity: riskScore > 0.8 ? 'critical' : 'warn',
      actor: { userId, sessionId },
      resource: { type: 'session', id: sessionId },
      action: 'validate',
      outcome: riskScore > 0.7 ? 'blocked' : 'success',
      details: { riskScore },
      riskIndicators: indicators,
    });
  }
}

let auditLoggerInstance: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger();
  }
  return auditLoggerInstance;
}

export function initAuditLogger(config: { logPath?: string }): AuditLogger {
  auditLoggerInstance = new AuditLogger(config);
  return auditLoggerInstance;
}
