/**
 * Sandbox Service
 *
 * Main orchestration service for secure code execution.
 * Coordinates container management, execution, and audit logging.
 */

import { createHash, randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import {
  SandboxService,
  ContainerManager,
  SandboxAuditLogger,
  SandboxConfig,
  SandboxConfigSchema,
  ExecutionRequest,
  ExecutionRequestSchema,
  ExecutionResult,
  SandboxAuditEntry,
  SandboxError,
  SANDBOX_ERROR_CODES,
  SANDBOX_EVENTS,
  LANGUAGE_IMAGES,
  SUPPORTED_LANGUAGES,
  ResourceLimits,
  ResourceLimitsSchema,
} from './types.js';
import { createContainerManager } from './container-manager.js';
import { createAuditLogger } from './audit-logger.js';

// =============================================================================
// Service Configuration
// =============================================================================

export interface SandboxServiceConfig {
  /** Default sandbox configuration */
  defaults: SandboxConfig;

  /** Container manager instance */
  containerManager?: ContainerManager;

  /** Audit logger instance */
  auditLogger?: SandboxAuditLogger;

  /** Maximum concurrent executions */
  maxConcurrentExecutions: number;

  /** Cleanup stale containers interval (ms) */
  cleanupIntervalMs: number;

  /** Maximum age for stale containers (ms) */
  maxContainerAgeMs: number;

  /** Pre-pull images on startup */
  prePullImages: boolean;

  /** Enable debug logging */
  debug: boolean;
}

const DEFAULT_SERVICE_CONFIG: SandboxServiceConfig = {
  defaults: SandboxConfigSchema.parse({}),
  maxConcurrentExecutions: 10,
  cleanupIntervalMs: 60000, // 1 minute
  maxContainerAgeMs: 300000, // 5 minutes
  prePullImages: true,
  debug: false,
};

// =============================================================================
// Sandbox Service Implementation
// =============================================================================

export class DockerSandboxService extends EventEmitter implements SandboxService {
  private config: SandboxServiceConfig;
  private containerManager: ContainerManager;
  private auditLogger: SandboxAuditLogger;
  private activeExecutions: Map<string, ExecutionState> = new Map();
  private executionResults: Map<string, ExecutionResult> = new Map();
  private cleanupTimer?: NodeJS.Timeout;
  private initialized = false;

  constructor(config?: Partial<SandboxServiceConfig>) {
    super();
    this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };

    // Use provided instances or create defaults
    this.containerManager = this.config.containerManager || createContainerManager({
      debug: this.config.debug,
    });
    this.auditLogger = this.config.auditLogger || createAuditLogger({
      enableConsoleLog: this.config.debug,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.log('Initializing sandbox service...');

    // Initialize container manager
    await this.containerManager.initialize();

    // Initialize audit logger
    await this.auditLogger.initialize();

    // Pre-pull images if enabled
    if (this.config.prePullImages) {
      await this.pullRequiredImages();
    }

    // Start cleanup timer
    this.cleanupTimer = setInterval(
      () => this.cleanupStaleContainers(),
      this.config.cleanupIntervalMs
    );

    this.initialized = true;
    this.log('Sandbox service initialized');
  }

  async shutdown(): Promise<void> {
    this.log('Shutting down sandbox service...');

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Cancel all active executions
    for (const executionId of this.activeExecutions.keys()) {
      await this.cancelExecution(executionId);
    }

    // Shutdown components
    await this.containerManager.shutdown();
    await this.auditLogger.shutdown();

    this.activeExecutions.clear();
    this.executionResults.clear();
    this.initialized = false;

    this.log('Sandbox service shut down');
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    // Validate request
    const validatedRequest = this.validateRequest(request);
    const executionId = validatedRequest.executionId || randomUUID();
    validatedRequest.executionId = executionId;

    // Check concurrent execution limit
    if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
      throw new SandboxError(
        SANDBOX_ERROR_CODES.INTERNAL_ERROR,
        `Maximum concurrent executions (${this.config.maxConcurrentExecutions}) reached`,
        executionId
      );
    }

    // Merge config with defaults
    const config = this.mergeConfig(validatedRequest.config);

    // Create execution state
    const state: ExecutionState = {
      executionId,
      request: validatedRequest,
      config,
      startTime: Date.now(),
      containerId: undefined,
    };
    this.activeExecutions.set(executionId, state);

    // Emit start event
    this.emit(SANDBOX_EVENTS.EXECUTION_STARTED, { executionId, language: validatedRequest.language });

    try {
      // Execute in container
      const result = await this.executeInContainer(state);

      // Store result
      this.executionResults.set(executionId, result);

      // Log to audit
      await this.logAuditEntry(state, result);

      // Emit completion event
      if (result.success) {
        this.emit(SANDBOX_EVENTS.EXECUTION_COMPLETED, result);
      } else if (result.timedOut) {
        this.emit(SANDBOX_EVENTS.EXECUTION_TIMEOUT, result);
      } else if (result.oomKilled) {
        this.emit(SANDBOX_EVENTS.EXECUTION_OOM, result);
      } else {
        this.emit(SANDBOX_EVENTS.EXECUTION_FAILED, result);
      }

      return result;
    } catch (error) {
      // Handle errors
      const result = this.createErrorResult(executionId, error, state.startTime);
      this.executionResults.set(executionId, result);

      // Log to audit
      await this.logAuditEntry(state, result);

      // Emit failure event
      this.emit(SANDBOX_EVENTS.EXECUTION_FAILED, result);

      throw error;
    } finally {
      // Cleanup
      this.activeExecutions.delete(executionId);

      // Remove container
      if (state.containerId) {
        try {
          await this.containerManager.removeContainer(state.containerId);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  async getExecution(executionId: string): Promise<ExecutionResult | null> {
    return this.executionResults.get(executionId) || null;
  }

  async cancelExecution(executionId: string): Promise<boolean> {
    const state = this.activeExecutions.get(executionId);
    if (!state) return false;

    if (state.containerId) {
      try {
        await this.containerManager.stopContainer(state.containerId);
        await this.containerManager.removeContainer(state.containerId);
      } catch {
        // Ignore errors
      }
    }

    this.activeExecutions.delete(executionId);
    return true;
  }

  async getActiveExecutions(): Promise<string[]> {
    return Array.from(this.activeExecutions.keys());
  }

  async getAuditLog(options?: {
    limit?: number;
    userId?: string;
    tenantId?: string;
  }): Promise<SandboxAuditEntry[]> {
    return this.auditLogger.query(options || {});
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private validateRequest(request: ExecutionRequest): ExecutionRequest {
    try {
      const validated = ExecutionRequestSchema.parse(request);

      // Check language is supported
      if (!SUPPORTED_LANGUAGES.includes(validated.language)) {
        throw new SandboxError(
          SANDBOX_ERROR_CODES.INVALID_LANGUAGE,
          `Unsupported language: ${validated.language}. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`
        );
      }

      // Check code size
      if (validated.code.length > 100000) {
        throw new SandboxError(
          SANDBOX_ERROR_CODES.CODE_TOO_LARGE,
          `Code size exceeds limit: ${validated.code.length} > 100000 bytes`
        );
      }

      return validated;
    } catch (error) {
      if (error instanceof SandboxError) throw error;
      throw new SandboxError(
        SANDBOX_ERROR_CODES.INVALID_REQUEST,
        `Invalid execution request: ${error}`
      );
    }
  }

  private mergeConfig(override?: Partial<SandboxConfig>): SandboxConfig {
    if (!override) return this.config.defaults;

    return SandboxConfigSchema.parse({
      ...this.config.defaults,
      ...override,
      resources: {
        ...this.config.defaults.resources,
        ...override.resources,
      },
      network: {
        ...this.config.defaults.network,
        ...override.network,
      },
    });
  }

  private async executeInContainer(state: ExecutionState): Promise<ExecutionResult> {
    const { executionId, request, config, startTime } = state;

    // Ensure image is available
    const image = LANGUAGE_IMAGES[request.language];
    const hasImage = await this.containerManager.hasImage(image);
    if (!hasImage) {
      if (config.imagePullPolicy === 'never') {
        throw new SandboxError(
          SANDBOX_ERROR_CODES.IMAGE_NOT_FOUND,
          `Image not found and pull policy is 'never': ${image}`,
          executionId
        );
      }
      await this.containerManager.pullImage(image);
    }

    // Create container
    const containerId = await this.containerManager.createContainer(request, config);
    state.containerId = containerId;

    // Start container
    await this.containerManager.startContainer(containerId);

    // Wait for completion with timeout
    let waitResult: { exitCode: number; oomKilled: boolean };
    let timedOut = false;

    try {
      waitResult = await this.containerManager.waitForContainer(containerId, config.timeoutMs);
    } catch (error) {
      if (error instanceof SandboxError && error.code === SANDBOX_ERROR_CODES.EXECUTION_TIMEOUT) {
        timedOut = true;
        // Stop the container
        await this.containerManager.stopContainer(containerId);
        waitResult = { exitCode: 137, oomKilled: false };
      } else {
        throw error;
      }
    }

    // Get logs
    const logs = await this.containerManager.getContainerLogs(containerId);

    // Get stats
    const stats = await this.containerManager.getContainerStats(containerId);

    // Truncate output if too large
    const maxOutput = config.resources.maxOutputBytes;
    let stdout = logs.stdout;
    let stderr = logs.stderr;

    if (stdout.length > maxOutput) {
      stdout = stdout.slice(0, maxOutput) + `\n... [truncated, exceeded ${maxOutput} bytes]`;
    }
    if (stderr.length > maxOutput) {
      stderr = stderr.slice(0, maxOutput) + `\n... [truncated, exceeded ${maxOutput} bytes]`;
    }

    const endTime = Date.now();
    const durationMs = endTime - startTime;

    return {
      executionId,
      success: waitResult.exitCode === 0 && !timedOut && !waitResult.oomKilled,
      exitCode: waitResult.exitCode,
      stdout,
      stderr,
      durationMs,
      memoryUsedBytes: stats.memoryUsedBytes,
      timedOut,
      oomKilled: waitResult.oomKilled,
      containerId,
      timestamp: endTime,
    };
  }

  private createErrorResult(
    executionId: string,
    error: unknown,
    startTime: number
  ): ExecutionResult {
    const endTime = Date.now();
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      executionId,
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: '',
      durationMs: endTime - startTime,
      memoryUsedBytes: 0,
      timedOut: false,
      oomKilled: false,
      error: errorMessage,
      timestamp: endTime,
    };
  }

  private async logAuditEntry(state: ExecutionState, result: ExecutionResult): Promise<void> {
    const { executionId, request, config, startTime } = state;

    const entry: SandboxAuditEntry = {
      id: randomUUID(),
      executionId,
      userId: request.userId,
      tenantId: request.tenantId,
      correlationId: request.correlationId,
      language: request.language,
      codeHash: this.hashCode(request.code),
      codeSizeBytes: Buffer.byteLength(request.code, 'utf8'),
      containerId: result.containerId,
      startTime,
      endTime: result.timestamp,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      success: result.success,
      timedOut: result.timedOut,
      oomKilled: result.oomKilled,
      memoryUsedBytes: result.memoryUsedBytes,
      stdoutSizeBytes: Buffer.byteLength(result.stdout, 'utf8'),
      stderrSizeBytes: Buffer.byteLength(result.stderr, 'utf8'),
      error: result.error,
      networkEnabled: config.network.enabled,
      resourceLimits: config.resources,
    };

    await this.auditLogger.log(entry);
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex').slice(0, 16);
  }

  private async pullRequiredImages(): Promise<void> {
    this.log('Pre-pulling sandbox images...');

    for (const language of SUPPORTED_LANGUAGES) {
      const image = LANGUAGE_IMAGES[language];
      const hasImage = await this.containerManager.hasImage(image);

      if (!hasImage) {
        this.log(`Pulling image: ${image}`);
        try {
          await this.containerManager.pullImage(image);
        } catch (error) {
          this.log(`Warning: Failed to pull image ${image}: ${error}`);
        }
      } else {
        this.log(`Image already available: ${image}`);
      }
    }
  }

  private async cleanupStaleContainers(): Promise<void> {
    try {
      const cleaned = await this.containerManager.cleanupStaleContainers(
        this.config.maxContainerAgeMs
      );
      if (cleaned > 0) {
        this.log(`Cleaned up ${cleaned} stale containers`);
      }
    } catch (error) {
      this.log(`Error cleaning up containers: ${error}`);
    }
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[SandboxService] ${message}`);
    }
  }
}

// =============================================================================
// Execution State
// =============================================================================

interface ExecutionState {
  executionId: string;
  request: ExecutionRequest;
  config: SandboxConfig;
  startTime: number;
  containerId?: string;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createSandboxService(config?: Partial<SandboxServiceConfig>): SandboxService {
  return new DockerSandboxService(config);
}
