/**
 * Docker Sandbox Types
 *
 * Type definitions for secure code execution in isolated Docker containers.
 * Security-critical: All types enforce isolation constraints.
 */

import { z } from 'zod';

// =============================================================================
// Language Support
// =============================================================================

export type SupportedLanguage = 'python' | 'javascript' | 'bash';

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  'python',
  'javascript',
  'bash',
] as const;

export const LANGUAGE_IMAGES: Record<SupportedLanguage, string> = {
  python: 'secureagent/sandbox-python:latest',
  javascript: 'secureagent/sandbox-node:latest',
  bash: 'secureagent/sandbox-bash:latest',
};

export const LANGUAGE_COMMANDS: Record<SupportedLanguage, string[]> = {
  python: ['python3', '-c'],
  javascript: ['node', '-e'],
  bash: ['bash', '-c'],
};

export const LANGUAGE_FILE_EXTENSIONS: Record<SupportedLanguage, string> = {
  python: '.py',
  javascript: '.js',
  bash: '.sh',
};

// =============================================================================
// Resource Limits
// =============================================================================

export const ResourceLimitsSchema = z.object({
  /** Memory limit in bytes (default: 128MB) */
  memoryBytes: z.number().int().positive().default(128 * 1024 * 1024),

  /** Memory swap limit in bytes (default: 256MB) */
  memorySwapBytes: z.number().int().positive().default(256 * 1024 * 1024),

  /** CPU period in microseconds (default: 100000 = 100ms) */
  cpuPeriod: z.number().int().positive().default(100000),

  /** CPU quota in microseconds (default: 50000 = 50% of one core) */
  cpuQuota: z.number().int().positive().default(50000),

  /** Number of CPUs (default: 0.5) */
  cpus: z.number().positive().max(4).default(0.5),

  /** Maximum number of PIDs (default: 64) */
  pidsLimit: z.number().int().positive().max(256).default(64),

  /** Maximum output size in bytes (default: 1MB) */
  maxOutputBytes: z.number().int().positive().default(1024 * 1024),

  /** Maximum file size in bytes (default: 10MB) */
  maxFileSizeBytes: z.number().int().positive().default(10 * 1024 * 1024),
});

export type ResourceLimits = z.infer<typeof ResourceLimitsSchema>;

// =============================================================================
// Network Configuration
// =============================================================================

export const NetworkConfigSchema = z.object({
  /** Enable network access (default: false for security) */
  enabled: z.boolean().default(false),

  /** Allowed outbound hosts (only if network enabled) */
  allowedHosts: z.array(z.string()).default([]),

  /** Allowed outbound ports (only if network enabled) */
  allowedPorts: z.array(z.number().int().positive().max(65535)).default([443, 80]),

  /** DNS servers to use */
  dnsServers: z.array(z.string().ip()).default(['8.8.8.8', '8.8.4.4']),
});

export type NetworkConfig = z.infer<typeof NetworkConfigSchema>;

// =============================================================================
// Sandbox Configuration
// =============================================================================

export const SandboxConfigSchema = z.object({
  /** Execution timeout in milliseconds (default: 30000 = 30s) */
  timeoutMs: z.number().int().positive().max(300000).default(30000),

  /** Resource limits */
  resources: ResourceLimitsSchema.default({}),

  /** Network configuration */
  network: NetworkConfigSchema.default({}),

  /** Enable read-only root filesystem (default: true) */
  readOnlyRootFs: z.boolean().default(true),

  /** Drop all Linux capabilities (default: true) */
  dropAllCapabilities: z.boolean().default(true),

  /** Use seccomp profile (default: true) */
  useSeccomp: z.boolean().default(true),

  /** Run as non-root user (default: true) */
  runAsNonRoot: z.boolean().default(true),

  /** User ID to run as (default: 65534 = nobody) */
  userId: z.number().int().positive().default(65534),

  /** Group ID to run as (default: 65534 = nogroup) */
  groupId: z.number().int().positive().default(65534),

  /** Working directory inside container */
  workDir: z.string().default('/sandbox'),

  /** Temporary directory for file operations */
  tmpDir: z.string().default('/tmp/sandbox'),

  /** Enable audit logging (default: true) */
  enableAuditLog: z.boolean().default(true),

  /** Container image pull policy */
  imagePullPolicy: z.enum(['always', 'if-not-present', 'never']).default('if-not-present'),
});

export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

// =============================================================================
// Execution Request/Response
// =============================================================================

export const ExecutionRequestSchema = z.object({
  /** Unique execution ID */
  executionId: z.string().uuid().optional(),

  /** Programming language */
  language: z.enum(['python', 'javascript', 'bash']),

  /** Code to execute */
  code: z.string().min(1).max(100000),

  /** Standard input to provide */
  stdin: z.string().max(1024 * 1024).optional(),

  /** Environment variables (sanitized) */
  env: z.record(z.string()).optional(),

  /** Files to include in sandbox */
  files: z
    .array(
      z.object({
        path: z.string().max(255),
        content: z.string().max(10 * 1024 * 1024),
        executable: z.boolean().default(false),
      })
    )
    .max(10)
    .optional(),

  /** Override default sandbox config */
  config: SandboxConfigSchema.partial().optional(),

  /** User ID for audit */
  userId: z.string().optional(),

  /** Tenant ID for multi-tenant isolation */
  tenantId: z.string().optional(),

  /** Correlation ID for tracing */
  correlationId: z.string().optional(),
});

export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;

export interface ExecutionResult {
  /** Unique execution ID */
  executionId: string;

  /** Whether execution succeeded */
  success: boolean;

  /** Exit code from container */
  exitCode: number;

  /** Standard output */
  stdout: string;

  /** Standard error */
  stderr: string;

  /** Execution duration in milliseconds */
  durationMs: number;

  /** Memory used in bytes */
  memoryUsedBytes: number;

  /** Whether execution was killed due to timeout */
  timedOut: boolean;

  /** Whether execution was killed due to resource limits */
  oomKilled: boolean;

  /** Error message if execution failed */
  error?: string;

  /** Container ID (for debugging) */
  containerId?: string;

  /** Timestamp of execution */
  timestamp: number;
}

// =============================================================================
// Container State
// =============================================================================

export type ContainerState =
  | 'creating'
  | 'created'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'removing'
  | 'removed'
  | 'error';

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: ContainerState;
  executionId: string;
  language: SupportedLanguage;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  exitCode?: number;
}

// =============================================================================
// Audit Log
// =============================================================================

export interface SandboxAuditEntry {
  id: string;
  executionId: string;
  userId?: string;
  tenantId?: string;
  correlationId?: string;
  language: SupportedLanguage;
  codeHash: string;
  codeSizeBytes: number;
  containerId?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  exitCode?: number;
  success: boolean;
  timedOut: boolean;
  oomKilled: boolean;
  memoryUsedBytes?: number;
  stdoutSizeBytes?: number;
  stderrSizeBytes?: number;
  error?: string;
  networkEnabled: boolean;
  resourceLimits: ResourceLimits;
  clientIp?: string;
  userAgent?: string;
}

// =============================================================================
// Events
// =============================================================================

export const SANDBOX_EVENTS = {
  EXECUTION_STARTED: 'sandbox:execution:started',
  EXECUTION_COMPLETED: 'sandbox:execution:completed',
  EXECUTION_FAILED: 'sandbox:execution:failed',
  EXECUTION_TIMEOUT: 'sandbox:execution:timeout',
  EXECUTION_OOM: 'sandbox:execution:oom',
  CONTAINER_CREATED: 'sandbox:container:created',
  CONTAINER_STARTED: 'sandbox:container:started',
  CONTAINER_STOPPED: 'sandbox:container:stopped',
  CONTAINER_REMOVED: 'sandbox:container:removed',
  CONTAINER_ERROR: 'sandbox:container:error',
  AUDIT_LOG_WRITTEN: 'sandbox:audit:written',
} as const;

export type SandboxEventType = (typeof SANDBOX_EVENTS)[keyof typeof SANDBOX_EVENTS];

// =============================================================================
// Error Codes
// =============================================================================

export const SANDBOX_ERROR_CODES = {
  INVALID_REQUEST: 'SANDBOX_INVALID_REQUEST',
  INVALID_LANGUAGE: 'SANDBOX_INVALID_LANGUAGE',
  CODE_TOO_LARGE: 'SANDBOX_CODE_TOO_LARGE',
  DOCKER_NOT_AVAILABLE: 'SANDBOX_DOCKER_NOT_AVAILABLE',
  IMAGE_NOT_FOUND: 'SANDBOX_IMAGE_NOT_FOUND',
  IMAGE_PULL_FAILED: 'SANDBOX_IMAGE_PULL_FAILED',
  CONTAINER_CREATE_FAILED: 'SANDBOX_CONTAINER_CREATE_FAILED',
  CONTAINER_START_FAILED: 'SANDBOX_CONTAINER_START_FAILED',
  EXECUTION_TIMEOUT: 'SANDBOX_EXECUTION_TIMEOUT',
  EXECUTION_OOM: 'SANDBOX_EXECUTION_OOM',
  EXECUTION_FAILED: 'SANDBOX_EXECUTION_FAILED',
  OUTPUT_TOO_LARGE: 'SANDBOX_OUTPUT_TOO_LARGE',
  NETWORK_DENIED: 'SANDBOX_NETWORK_DENIED',
  INTERNAL_ERROR: 'SANDBOX_INTERNAL_ERROR',
} as const;

export type SandboxErrorCode = (typeof SANDBOX_ERROR_CODES)[keyof typeof SANDBOX_ERROR_CODES];

export class SandboxError extends Error {
  constructor(
    public readonly code: SandboxErrorCode,
    message: string,
    public readonly executionId?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SandboxError';
    Error.captureStackTrace(this, SandboxError);
  }
}

// =============================================================================
// Service Interfaces
// =============================================================================

export interface ContainerManager {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  isDockerAvailable(): Promise<boolean>;
  pullImage(image: string): Promise<void>;
  hasImage(image: string): Promise<boolean>;
  createContainer(request: ExecutionRequest, config: SandboxConfig): Promise<string>;
  startContainer(containerId: string): Promise<void>;
  waitForContainer(containerId: string, timeoutMs: number): Promise<{ exitCode: number; oomKilled: boolean }>;
  getContainerLogs(containerId: string): Promise<{ stdout: string; stderr: string }>;
  getContainerStats(containerId: string): Promise<{ memoryUsedBytes: number }>;
  stopContainer(containerId: string): Promise<void>;
  removeContainer(containerId: string): Promise<void>;
  listContainers(): Promise<ContainerInfo[]>;
  cleanupStaleContainers(maxAgeMs: number): Promise<number>;
}

export interface SandboxService {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  getExecution(executionId: string): Promise<ExecutionResult | null>;
  cancelExecution(executionId: string): Promise<boolean>;
  getActiveExecutions(): Promise<string[]>;
  getAuditLog(options?: { limit?: number; userId?: string; tenantId?: string }): Promise<SandboxAuditEntry[]>;
}

export interface SandboxAuditLogger {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  log(entry: SandboxAuditEntry): Promise<void>;
  query(options: {
    limit?: number;
    offset?: number;
    userId?: string;
    tenantId?: string;
    startTime?: number;
    endTime?: number;
    success?: boolean;
  }): Promise<SandboxAuditEntry[]>;
  getEntry(id: string): Promise<SandboxAuditEntry | null>;
  cleanup(maxAgeMs: number): Promise<number>;
}
