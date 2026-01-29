/**
 * Agent Spawning Service
 *
 * Service for spawning and managing Claude Code and other agent processes.
 */

import { EventEmitter } from 'events';
import type {
  AgentJob,
  AgentJobResult,
  AgentSpawnRequest,
  AgentProgressEvent,
  AgentJobQueryOptions,
} from '../types.js';
import type { AgentConfig } from '../config.js';
import type { AgentJobStore } from '../stores/agent-job-store.js';
import { ProgressReporter, createProgressReporter } from './progress-reporter.js';
import { JobManager, createJobManager } from './job-manager.js';

// =============================================================================
// Re-exports
// =============================================================================

export {
  ProgressReporter,
  createProgressReporter,
  type ProgressReporterEvents,
  type ProgressReporterConfig,
} from './progress-reporter.js';

export {
  JobManager,
  createJobManager,
  type JobManagerConfig,
} from './job-manager.js';

// =============================================================================
// Types
// =============================================================================

export interface AgentSpawningServiceEvents {
  'job:started': (job: AgentJob) => void;
  'job:progress': (event: AgentProgressEvent) => void;
  'job:completed': (job: AgentJob, result: AgentJobResult) => void;
  'job:failed': (job: AgentJob, error: string) => void;
  'job:cancelled': (job: AgentJob) => void;
}

// =============================================================================
// Agent Spawning Service
// =============================================================================

/**
 * Service for spawning and managing agent jobs
 */
export class AgentSpawningService extends EventEmitter {
  private readonly store: AgentJobStore;
  private readonly progressReporter: ProgressReporter;
  private readonly jobManager: JobManager;
  private readonly config: AgentConfig;
  private initialized = false;

  constructor(store: AgentJobStore, config?: Partial<AgentConfig>) {
    super();

    this.store = store;
    this.config = {
      enabled: config?.enabled ?? true,
      defaultTimeout: config?.defaultTimeout ?? 300000,
      maxConcurrent: config?.maxConcurrent ?? 3,
      progressReportInterval: config?.progressReportInterval ?? 5000,
      allowedAgentTypes: config?.allowedAgentTypes ?? ['claude-code'],
    };

    // Create progress reporter
    this.progressReporter = createProgressReporter({
      reportInterval: this.config.progressReportInterval,
      autoProgress: true,
    });

    // Create job manager
    this.jobManager = createJobManager(store, this.progressReporter, {
      maxConcurrent: this.config.maxConcurrent,
      defaultTimeout: this.config.defaultTimeout,
      allowedAgentTypes: this.config.allowedAgentTypes,
    });

    // Wire up events
    this.setupEventHandlers();
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.store.initialize();
    this.initialized = true;
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Spawn a new agent job
   */
  async spawnAgent(request: AgentSpawnRequest): Promise<AgentJob> {
    if (!this.config.enabled) {
      throw new Error('Agent spawning service is disabled');
    }

    this.ensureInitialized();

    // Create the job
    const job = await this.jobManager.createJob(request);

    // Start execution in background
    this.jobManager.startJob(job.id).catch(error => {
      // Error handling is done internally, this is just for unhandled rejections
      console.error(`Unexpected error starting job ${job.id}:`, error);
    });

    return job;
  }

  /**
   * Get a job by ID
   */
  async getJob(jobId: string): Promise<AgentJob | null> {
    this.ensureInitialized();
    return this.store.get(jobId);
  }

  /**
   * List jobs
   */
  async listJobs(options?: AgentJobQueryOptions): Promise<AgentJob[]> {
    this.ensureInitialized();
    return this.store.list(options);
  }

  /**
   * List jobs for a user
   */
  async listUserJobs(userId: string, options?: AgentJobQueryOptions): Promise<AgentJob[]> {
    this.ensureInitialized();
    return this.store.listByUser(userId, options);
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    this.ensureInitialized();
    return this.jobManager.cancelJob(jobId);
  }

  /**
   * Get the progress of a job
   */
  getProgress(jobId: string): number {
    return this.progressReporter.getProgress(jobId);
  }

  /**
   * Check if we can start another job
   */
  canStartJob(): boolean {
    return this.jobManager.canStartJob();
  }

  /**
   * Get the number of running jobs
   */
  getRunningJobCount(): number {
    return this.jobManager.runningCount;
  }

  /**
   * Get all running jobs
   */
  getRunningJobs(): AgentJob[] {
    return this.jobManager.listRunningJobs();
  }

  /**
   * Wait for a job to complete
   */
  async waitForJob(jobId: string, timeoutMs?: number): Promise<AgentJob> {
    this.ensureInitialized();

    const timeout = timeoutMs ?? this.config.defaultTimeout;
    const startTime = Date.now();

    while (true) {
      const job = await this.store.get(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        return job;
      }

      if (Date.now() - startTime > timeout) {
        throw new Error(`Timeout waiting for job ${jobId}`);
      }

      // Poll every second
      await this.sleep(1000);
    }
  }

  /**
   * Cleanup old jobs
   */
  async cleanup(maxAgeMs: number): Promise<number> {
    this.ensureInitialized();
    return this.jobManager.cleanup(maxAgeMs);
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    await this.jobManager.shutdown();
    this.initialized = false;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private setupEventHandlers(): void {
    // Forward progress reporter events
    this.progressReporter.on('started', (jobId: string) => {
      this.store.get(jobId).then(job => {
        if (job) {
          this.emit('job:started', job);
        }
      });
    });

    this.progressReporter.on('progress', (event: AgentProgressEvent) => {
      this.emit('job:progress', event);

      // Update store with progress
      this.store.updateProgress(event.jobId, event.progress, event.message);
    });

    this.progressReporter.on('completed', (jobId: string, result: AgentJobResult) => {
      this.store.get(jobId).then(job => {
        if (job) {
          this.emit('job:completed', job, result);
        }
      });
    });

    this.progressReporter.on('failed', (jobId: string, error: string) => {
      this.store.get(jobId).then(job => {
        if (job) {
          this.emit('job:failed', job, error);
        }
      });
    });

    this.progressReporter.on('cancelled', (jobId: string) => {
      this.store.get(jobId).then(job => {
        if (job) {
          this.emit('job:cancelled', job);
        }
      });
    });
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('AgentSpawningService not initialized. Call initialize() first.');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Type-safe event methods
  override on<K extends keyof AgentSpawningServiceEvents>(
    event: K,
    listener: AgentSpawningServiceEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof AgentSpawningServiceEvents>(
    event: K,
    ...args: Parameters<AgentSpawningServiceEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  override off<K extends keyof AgentSpawningServiceEvents>(
    event: K,
    listener: AgentSpawningServiceEvents[K]
  ): this {
    return super.off(event, listener);
  }
}

/**
 * Create an agent spawning service
 */
export function createAgentSpawningService(
  store: AgentJobStore,
  config?: Partial<AgentConfig>
): AgentSpawningService {
  return new AgentSpawningService(store, config);
}
