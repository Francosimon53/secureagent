/**
 * Docker Sandbox Module
 *
 * Secure code execution in isolated Docker containers.
 * Supports Python, JavaScript/Node.js, and Bash.
 *
 * Security features:
 * - Complete container isolation
 * - No network access by default
 * - Resource limits (CPU, memory, PIDs)
 * - Seccomp profile for syscall filtering
 * - Read-only root filesystem
 * - Non-root execution
 * - Audit logging for all executions
 *
 * @example
 * ```typescript
 * import { createSandboxService } from './sandbox';
 *
 * const sandbox = createSandboxService({ debug: true });
 * await sandbox.initialize();
 *
 * const result = await sandbox.execute({
 *   language: 'python',
 *   code: 'print("Hello from sandbox!")',
 * });
 *
 * console.log(result.stdout); // "Hello from sandbox!\n"
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
  SupportedLanguage,
  ResourceLimits,
  NetworkConfig,
  SandboxConfig,
  ExecutionRequest,
  ExecutionResult,
  ContainerState,
  ContainerInfo,
  SandboxAuditEntry,
  SandboxEventType,
  SandboxErrorCode,
  ContainerManager,
  SandboxService,
  SandboxAuditLogger,
} from './types.js';

export {
  SUPPORTED_LANGUAGES,
  LANGUAGE_IMAGES,
  LANGUAGE_COMMANDS,
  LANGUAGE_FILE_EXTENSIONS,
  ResourceLimitsSchema,
  NetworkConfigSchema,
  SandboxConfigSchema,
  ExecutionRequestSchema,
  SANDBOX_EVENTS,
  SANDBOX_ERROR_CODES,
  SandboxError,
} from './types.js';

// =============================================================================
// Container Manager
// =============================================================================

export type { DockerContainerManagerConfig } from './container-manager.js';
export { DockerContainerManager, createContainerManager } from './container-manager.js';

// =============================================================================
// Sandbox Service
// =============================================================================

export type { SandboxServiceConfig } from './sandbox-service.js';
export { DockerSandboxService, createSandboxService } from './sandbox-service.js';

// =============================================================================
// Audit Logger
// =============================================================================

export type {
  AuditLoggerConfig,
  DatabaseAdapter,
  QueryOptions,
} from './audit-logger.js';

export {
  InMemorySandboxAuditLogger,
  SQLiteAuditAdapter,
  createAuditLogger,
  createSQLiteAuditAdapter,
} from './audit-logger.js';

// =============================================================================
// Convenience Factory
// =============================================================================

import { createSandboxService, SandboxServiceConfig } from './sandbox-service.js';
import { createAuditLogger, createSQLiteAuditAdapter } from './audit-logger.js';
import { createContainerManager } from './container-manager.js';
import { SandboxService } from './types.js';

export interface SandboxSystemConfig {
  /** Enable debug logging */
  debug?: boolean;

  /** Maximum concurrent executions */
  maxConcurrentExecutions?: number;

  /** Default timeout in milliseconds */
  defaultTimeoutMs?: number;

  /** Default memory limit in bytes */
  defaultMemoryBytes?: number;

  /** Enable network by default */
  enableNetworkByDefault?: boolean;

  /** SQLite database path for audit logs (optional) */
  auditDbPath?: string;

  /** Pre-pull Docker images on startup */
  prePullImages?: boolean;
}

/**
 * Create a fully configured sandbox system
 */
export async function createSandboxSystem(
  config?: SandboxSystemConfig
): Promise<SandboxService> {
  const auditLogger = config?.auditDbPath
    ? createAuditLogger({
        persistToDatabase: true,
        databaseAdapter: createSQLiteAuditAdapter(config.auditDbPath),
        enableConsoleLog: config?.debug,
      })
    : createAuditLogger({
        enableConsoleLog: config?.debug,
      });

  const containerManager = createContainerManager({
    debug: config?.debug,
  });

  const serviceConfig: Partial<SandboxServiceConfig> = {
    debug: config?.debug ?? false,
    maxConcurrentExecutions: config?.maxConcurrentExecutions ?? 10,
    prePullImages: config?.prePullImages ?? true,
    containerManager,
    auditLogger,
    defaults: {
      timeoutMs: config?.defaultTimeoutMs ?? 30000,
      resources: {
        memoryBytes: config?.defaultMemoryBytes ?? 128 * 1024 * 1024,
        memorySwapBytes: 256 * 1024 * 1024,
        cpuPeriod: 100000,
        cpuQuota: 50000,
        cpus: 0.5,
        pidsLimit: 64,
        maxOutputBytes: 1024 * 1024,
        maxFileSizeBytes: 10 * 1024 * 1024,
      },
      network: {
        enabled: config?.enableNetworkByDefault ?? false,
        allowedHosts: [],
        allowedPorts: [443, 80],
        dnsServers: ['8.8.8.8', '8.8.4.4'],
      },
      readOnlyRootFs: true,
      dropAllCapabilities: true,
      useSeccomp: true,
      runAsNonRoot: true,
      userId: 65534,
      groupId: 65534,
      workDir: '/sandbox',
      tmpDir: '/tmp/sandbox',
      enableAuditLog: true,
      imagePullPolicy: 'if-not-present',
    },
  };

  const service = createSandboxService(serviceConfig);
  await service.initialize();

  return service;
}
