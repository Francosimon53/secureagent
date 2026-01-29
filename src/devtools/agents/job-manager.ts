/**
 * Job Manager
 *
 * Manages the lifecycle of agent jobs including execution, cancellation, and cleanup.
 */

import { spawn, ChildProcess } from 'child_process';
import type {
  AgentJob,
  AgentJobStatus,
  AgentJobResult,
  AgentSpawnRequest,
  AgentType,
} from '../types.js';
import type { AgentJobStore } from '../stores/agent-job-store.js';
import { ProgressReporter } from './progress-reporter.js';

// =============================================================================
// Types
// =============================================================================

export interface JobManagerConfig {
  maxConcurrent: number;
  defaultTimeout: number;
  allowedAgentTypes: AgentType[];
}

interface RunningJob {
  job: AgentJob;
  process?: ChildProcess;
  abortController: AbortController;
  timeoutId?: NodeJS.Timeout;
}

// =============================================================================
// Job Manager
// =============================================================================

/**
 * Manages agent job lifecycle
 */
export class JobManager {
  private runningJobs = new Map<string, RunningJob>();
  private config: JobManagerConfig;

  constructor(
    private readonly store: AgentJobStore,
    private readonly progressReporter: ProgressReporter,
    config?: Partial<JobManagerConfig>
  ) {
    this.config = {
      maxConcurrent: config?.maxConcurrent ?? 3,
      defaultTimeout: config?.defaultTimeout ?? 300000,
      allowedAgentTypes: config?.allowedAgentTypes ?? ['claude-code'],
    };
  }

  /**
   * Get the number of running jobs
   */
  get runningCount(): number {
    return this.runningJobs.size;
  }

  /**
   * Check if we can start a new job
   */
  canStartJob(): boolean {
    return this.runningJobs.size < this.config.maxConcurrent;
  }

  /**
   * Create and start a new job
   */
  async createJob(request: AgentSpawnRequest): Promise<AgentJob> {
    // Validate agent type
    if (!this.config.allowedAgentTypes.includes(request.agentType)) {
      throw new Error(`Agent type '${request.agentType}' is not allowed`);
    }

    // Check concurrency limit
    if (!this.canStartJob()) {
      throw new Error(`Maximum concurrent jobs (${this.config.maxConcurrent}) reached`);
    }

    // Create job in store
    const job = await this.store.create({
      userId: request.userId,
      agentType: request.agentType,
      prompt: request.prompt,
      status: 'pending',
      progress: 0,
      workingDirectory: request.workingDirectory,
      timeout: request.timeout ?? this.config.defaultTimeout,
    });

    return job;
  }

  /**
   * Start executing a job
   */
  async startJob(jobId: string): Promise<void> {
    const job = await this.store.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status !== 'pending') {
      throw new Error(`Job ${jobId} is not in pending status`);
    }

    // Update status to running
    await this.store.updateStatus(jobId, 'running');

    const abortController = new AbortController();
    const runningJob: RunningJob = {
      job,
      abortController,
    };

    this.runningJobs.set(jobId, runningJob);

    // Start progress tracking
    this.progressReporter.startTracking({ ...job, status: 'running' });

    // Set timeout
    if (job.timeout) {
      runningJob.timeoutId = setTimeout(() => {
        this.handleTimeout(jobId);
      }, job.timeout);
    }

    // Execute the job
    this.executeJob(runningJob).catch(error => {
      this.handleError(jobId, error);
    });
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const runningJob = this.runningJobs.get(jobId);
    if (!runningJob) {
      return false;
    }

    // Abort the job
    runningJob.abortController.abort();

    // Kill the process if running
    if (runningJob.process && !runningJob.process.killed) {
      runningJob.process.kill('SIGTERM');

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (runningJob.process && !runningJob.process.killed) {
          runningJob.process.kill('SIGKILL');
        }
      }, 5000);
    }

    // Clear timeout
    if (runningJob.timeoutId) {
      clearTimeout(runningJob.timeoutId);
    }

    // Update status
    await this.store.updateStatus(jobId, 'cancelled');
    this.progressReporter.reportCancelled(jobId);
    this.runningJobs.delete(jobId);

    return true;
  }

  /**
   * Get a running job
   */
  getRunningJob(jobId: string): AgentJob | undefined {
    return this.runningJobs.get(jobId)?.job;
  }

  /**
   * List all running jobs
   */
  listRunningJobs(): AgentJob[] {
    return Array.from(this.runningJobs.values()).map(rj => rj.job);
  }

  /**
   * Cleanup completed/failed jobs older than the given age
   */
  async cleanup(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    return this.store.deleteOlderThan(cutoff);
  }

  /**
   * Shutdown the job manager
   */
  async shutdown(): Promise<void> {
    // Cancel all running jobs
    const jobIds = Array.from(this.runningJobs.keys());
    await Promise.all(jobIds.map(id => this.cancelJob(id)));

    // Stop progress reporter
    this.progressReporter.stopAll();
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private async executeJob(runningJob: RunningJob): Promise<void> {
    const { job, abortController } = runningJob;

    try {
      let result: AgentJobResult;

      switch (job.agentType) {
        case 'claude-code':
          result = await this.executeClaudeCode(job, abortController.signal);
          break;
        case 'codex':
          result = await this.executeCodex(job, abortController.signal);
          break;
        case 'custom':
          result = await this.executeCustomAgent(job, abortController.signal);
          break;
        default:
          throw new Error(`Unknown agent type: ${job.agentType}`);
      }

      // Job completed successfully
      await this.completeJob(job.id, result);
    } catch (error) {
      if (abortController.signal.aborted) {
        // Job was cancelled, don't report error
        return;
      }
      throw error;
    }
  }

  private async executeClaudeCode(job: AgentJob, signal: AbortSignal): Promise<AgentJobResult> {
    return new Promise((resolve, reject) => {
      // Spawn claude code process
      const args = ['--print', '--dangerously-skip-permissions', job.prompt];

      const proc = spawn('claude', args, {
        cwd: job.workingDirectory ?? process.cwd(),
        signal,
        env: {
          ...process.env,
        },
      });

      const runningJob = this.runningJobs.get(job.id);
      if (runningJob) {
        runningJob.process = proc;
      }

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
        this.parseAndReportProgress(job.id, data.toString());
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        const success = code === 0;
        resolve({
          success,
          output: stdout || stderr,
          exitCode: code ?? undefined,
          filesChanged: this.extractChangedFiles(stdout),
        });
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async executeCodex(job: AgentJob, signal: AbortSignal): Promise<AgentJobResult> {
    return new Promise((resolve, reject) => {
      // Spawn codex process (OpenAI Codex CLI)
      const args = ['--quiet', job.prompt];

      const proc = spawn('codex', args, {
        cwd: job.workingDirectory ?? process.cwd(),
        signal,
      });

      const runningJob = this.runningJobs.get(job.id);
      if (runningJob) {
        runningJob.process = proc;
      }

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        const success = code === 0;
        resolve({
          success,
          output: stdout || stderr,
          exitCode: code ?? undefined,
        });
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async executeCustomAgent(job: AgentJob, _signal: AbortSignal): Promise<AgentJobResult> {
    // Custom agent execution - can be extended for other agent types
    return {
      success: false,
      output: 'Custom agent execution not implemented',
    };
  }

  private async completeJob(jobId: string, result: AgentJobResult): Promise<void> {
    const runningJob = this.runningJobs.get(jobId);
    if (runningJob?.timeoutId) {
      clearTimeout(runningJob.timeoutId);
    }

    await this.store.setResult(jobId, result);
    this.progressReporter.reportCompleted(jobId, result);
    this.runningJobs.delete(jobId);
  }

  private async handleError(jobId: string, error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    const runningJob = this.runningJobs.get(jobId);
    if (runningJob?.timeoutId) {
      clearTimeout(runningJob.timeoutId);
    }

    await this.store.updateStatus(jobId, 'failed', errorMessage);
    this.progressReporter.reportFailed(jobId, errorMessage);
    this.runningJobs.delete(jobId);
  }

  private async handleTimeout(jobId: string): Promise<void> {
    const runningJob = this.runningJobs.get(jobId);
    if (!runningJob) return;

    // Kill the process
    if (runningJob.process && !runningJob.process.killed) {
      runningJob.process.kill('SIGTERM');
    }

    await this.store.updateStatus(jobId, 'failed', 'Job timed out');
    this.progressReporter.reportFailed(jobId, 'Job timed out');
    this.runningJobs.delete(jobId);
  }

  private parseAndReportProgress(jobId: string, output: string): void {
    // Try to extract progress from output
    // Claude Code outputs progress indicators like "Step 1/5" or percentages
    const stepMatch = output.match(/Step\s+(\d+)\s*\/\s*(\d+)/i);
    if (stepMatch) {
      const current = parseInt(stepMatch[1], 10);
      const total = parseInt(stepMatch[2], 10);
      const progress = Math.round((current / total) * 100);
      this.progressReporter.reportProgress(jobId, progress, `Step ${current}/${total}`);
      return;
    }

    const percentMatch = output.match(/(\d+)%/);
    if (percentMatch) {
      const progress = parseInt(percentMatch[1], 10);
      this.progressReporter.reportProgress(jobId, progress);
    }
  }

  private extractChangedFiles(output: string): string[] {
    const files: string[] = [];

    // Look for common patterns indicating file changes
    const patterns = [
      /(?:Created|Modified|Updated|Edited|Wrote)\s+(?:file\s+)?[`']?([^\s`']+\.[a-z]+)[`']?/gi,
      /(?:Writing|Creating)\s+(?:to\s+)?[`']?([^\s`']+\.[a-z]+)[`']?/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        if (match[1] && !files.includes(match[1])) {
          files.push(match[1]);
        }
      }
    }

    return files;
  }
}

/**
 * Create a job manager
 */
export function createJobManager(
  store: AgentJobStore,
  progressReporter: ProgressReporter,
  config?: Partial<JobManagerConfig>
): JobManager {
  return new JobManager(store, progressReporter, config);
}
