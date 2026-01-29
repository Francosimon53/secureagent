// Security domain types and error classes

export interface UserIdentity {
  userId: string;
  email?: string;
  roles: string[];
  mfaVerified: boolean;
}

export interface TokenPayload {
  sub: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  jti: string;
  type: 'access' | 'refresh';
  roles: string[];
  mfa: boolean;
  fingerprint: string;
}

export interface SessionContext {
  sessionId: string;
  userId: string;
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  riskScore: number;
  mfaVerified: boolean;
  metadata?: Record<string, unknown>;
}

export interface AuthenticationResult {
  success: boolean;
  identity?: UserIdentity;
  accessToken?: string;
  refreshToken?: string;
  error?: SecurityError;
}

export interface DeviceFingerprint {
  deviceId: string;
  userAgent: string;
  ipAddress: string;
  acceptLanguage?: string;
  screenResolution?: string;
  timezone?: string;
}

export interface Permission {
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'execute';
  conditions?: Record<string, unknown>;
}

export interface Role {
  name: string;
  permissions: Permission[];
  inherits?: string[];
}

export interface AuthorizationContext {
  identity: UserIdentity;
  resource: string;
  action: string;
  attributes?: Record<string, unknown>;
}

export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
  matchedPermission?: Permission;
}

export interface ToolCall {
  toolName: string;
  parameters: Record<string, unknown>;
  requestId: string;
  timestamp: number;
}

export interface ToolExecutionContext {
  identity: UserIdentity;
  session: SessionContext;
  tool: ToolCall;
  sandboxed: boolean;
}

export interface ToolExecutionResult {
  success: boolean;
  output?: unknown;
  error?: SecurityError;
  metrics: {
    durationMs: number;
    memoryUsedBytes?: number;
    cpuTimeMs?: number;
  };
}

export interface AuditEvent {
  eventId: string;
  timestamp: number;
  eventType: AuditEventType;
  severity: 'info' | 'warn' | 'error' | 'critical';
  actor: {
    userId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
  };
  resource: {
    type: string;
    id?: string;
    name?: string;
  };
  action: string;
  outcome: 'success' | 'failure' | 'blocked';
  details?: Record<string, unknown>;
  riskIndicators?: string[];
}

export type AuditEventType =
  | 'authentication'
  | 'authorization'
  | 'session'
  | 'tool_execution'
  | 'prompt_injection'
  | 'rate_limit'
  | 'configuration'
  | 'sandbox'
  | 'mcp'
  | 'oauth'
  | 'security'
  | 'channel';

// Security Errors

export abstract class SecurityError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly timestamp: number;
  readonly requestId: string | undefined;

  constructor(message: string, requestId?: string) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = Date.now();
    this.requestId = requestId;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      timestamp: this.timestamp,
      requestId: this.requestId,
    };
  }
}

export class AuthenticationError extends SecurityError {
  readonly code = 'AUTHENTICATION_FAILED';
  readonly httpStatus = 401;

  constructor(
    message: string = 'Authentication failed',
    public readonly reason?: 'invalid_credentials' | 'expired_token' | 'invalid_token' | 'mfa_required',
    requestId?: string
  ) {
    super(message, requestId);
  }
}

export class TokenExpiredError extends SecurityError {
  readonly code = 'TOKEN_EXPIRED';
  readonly httpStatus = 401;

  constructor(requestId?: string) {
    super('Token has expired', requestId);
  }
}

export class InvalidTokenError extends SecurityError {
  readonly code = 'INVALID_TOKEN';
  readonly httpStatus = 401;

  constructor(
    message: string = 'Invalid token',
    public readonly reason?: 'malformed' | 'signature' | 'audience' | 'issuer',
    requestId?: string
  ) {
    super(message, requestId);
  }
}

export class MFARequiredError extends SecurityError {
  readonly code = 'MFA_REQUIRED';
  readonly httpStatus = 403;

  constructor(requestId?: string) {
    super('Multi-factor authentication required', requestId);
  }
}

export class AuthorizationError extends SecurityError {
  readonly code = 'AUTHORIZATION_DENIED';
  readonly httpStatus = 403;

  constructor(
    message: string = 'Access denied',
    public readonly resource?: string,
    public readonly action?: string,
    requestId?: string
  ) {
    super(message, requestId);
  }
}

export class InsufficientPermissionsError extends SecurityError {
  readonly code = 'INSUFFICIENT_PERMISSIONS';
  readonly httpStatus = 403;

  constructor(
    public readonly requiredPermission: string,
    requestId?: string
  ) {
    super(`Missing required permission: ${requiredPermission}`, requestId);
  }
}

export class SessionError extends SecurityError {
  readonly code = 'SESSION_ERROR';
  readonly httpStatus = 401;

  constructor(
    message: string,
    public readonly reason: 'expired' | 'revoked' | 'invalid' | 'limit_exceeded' | 'anomaly_detected',
    requestId?: string
  ) {
    super(message, requestId);
  }
}

export class ToolNotAllowedError extends SecurityError {
  readonly code = 'TOOL_NOT_ALLOWED';
  readonly httpStatus = 403;

  constructor(
    public readonly toolName: string,
    requestId?: string
  ) {
    super(`Tool not in allowlist: ${toolName}`, requestId);
  }
}

export class ToolValidationError extends SecurityError {
  readonly code = 'TOOL_VALIDATION_FAILED';
  readonly httpStatus = 400;

  constructor(
    public readonly toolName: string,
    public readonly validationErrors: string[],
    requestId?: string
  ) {
    super(`Tool validation failed: ${validationErrors.join(', ')}`, requestId);
  }
}

export class ToolExecutionError extends SecurityError {
  readonly code = 'TOOL_EXECUTION_FAILED';
  readonly httpStatus = 500;

  constructor(
    public readonly toolName: string,
    message: string,
    requestId?: string
  ) {
    super(`Tool execution failed: ${message}`, requestId);
  }
}

export class RateLimitError extends SecurityError {
  readonly code = 'RATE_LIMIT_EXCEEDED';
  readonly httpStatus = 429;

  constructor(
    public readonly retryAfterMs: number,
    requestId?: string
  ) {
    super('Rate limit exceeded', requestId);
  }
}

export class PromptInjectionError extends SecurityError {
  readonly code = 'PROMPT_INJECTION_DETECTED';
  readonly httpStatus = 400;

  constructor(
    public readonly confidence: number,
    public readonly patterns: string[],
    requestId?: string
  ) {
    super('Potential prompt injection detected', requestId);
  }
}

export class SandboxError extends SecurityError {
  readonly code = 'SANDBOX_ERROR';
  readonly httpStatus = 500;

  constructor(
    message: string,
    public readonly reason: 'timeout' | 'memory_exceeded' | 'not_available' | 'execution_failed',
    requestId?: string
  ) {
    super(message, requestId);
  }
}

export class SecurityConfigError extends SecurityError {
  readonly code = 'SECURITY_CONFIG_ERROR';
  readonly httpStatus = 500;

  constructor(message: string, requestId?: string) {
    super(message, requestId);
  }
}

export function isSecurityError(error: unknown): error is SecurityError {
  return error instanceof SecurityError;
}

export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError;
}
