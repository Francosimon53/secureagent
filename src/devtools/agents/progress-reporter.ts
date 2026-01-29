/**
 * Progress Reporter
 *
 * EventEmitter-based progress reporting for agent jobs.
 */

import { EventEmitter } from 'events';
import type { AgentProgressEvent, AgentJobResult, AgentJob } from '../types.js';

// =============================================================================
// Types
// =============================================================================

export interface ProgressReporterEvents {
  progress: (event: AgentProgressEvent) => void;
  started: (jobId: string) => void;
  completed: (jobId: string, result: AgentJobResult) => void;
  failed: (jobId: string, error: string) => void;
  cancelled: (jobId: string) => void;
}

export interface ProgressReporterConfig {
  reportInterval: number;
  autoProgress: boolean;
}

// =============================================================================
// Progress Reporter
// =============================================================================

/**
 * Progress reporter for agent jobs
 */
export class ProgressReporter extends EventEmitter {
  private progressIntervals = new Map<string, NodeJS.Timeout>();
  private jobProgress = new Map<string, number>();
  private config: ProgressReporterConfig;

  constructor(config?: Partial<ProgressReporterConfig>) {
    super();
    this.config = {
      reportInterval: config?.reportInterval ?? 5000,
      autoProgress: config?.autoProgress ?? true,
    };
  }

  /**
   * Start tracking progress for a job
   */
  startTracking(job: AgentJob): void {
    this.jobProgress.set(job.id, 0);
    this.emit('started', job.id);

    if (this.config.autoProgress) {
      this.startAutoProgress(job.id);
    }
  }

  /**
   * Report progress for a job
   */
  reportProgress(jobId: string, progress: number, message?: string): void {
    const clampedProgress = Math.min(100, Math.max(0, progress));
    this.jobProgress.set(jobId, clampedProgress);

    const event: AgentProgressEvent = {
      jobId,
      progress: clampedProgress,
      message: message ?? `Progress: ${clampedProgress}%`,
      timestamp: Date.now(),
    };

    this.emit('progress', event);
  }

  /**
   * Report job completion
   */
  reportCompleted(jobId: string, result: AgentJobResult): void {
    this.stopTracking(jobId);
    this.jobProgress.set(jobId, 100);
    this.emit('completed', jobId, result);
  }

  /**
   * Report job failure
   */
  reportFailed(jobId: string, error: string): void {
    this.stopTracking(jobId);
    this.emit('failed', jobId, error);
  }

  /**
   * Report job cancellation
   */
  reportCancelled(jobId: string): void {
    this.stopTracking(jobId);
    this.emit('cancelled', jobId);
  }

  /**
   * Get current progress for a job
   */
  getProgress(jobId: string): number {
    return this.jobProgress.get(jobId) ?? 0;
  }

  /**
   * Stop tracking a job
   */
  stopTracking(jobId: string): void {
    const interval = this.progressIntervals.get(jobId);
    if (interval) {
      clearInterval(interval);
      this.progressIntervals.delete(jobId);
    }
  }

  /**
   * Stop all tracking
   */
  stopAll(): void {
    for (const [jobId] of this.progressIntervals) {
      this.stopTracking(jobId);
    }
    this.jobProgress.clear();
  }

  /**
   * Start automatic progress increments
   */
  private startAutoProgress(jobId: string): void {
    const interval = setInterval(() => {
      const currentProgress = this.jobProgress.get(jobId) ?? 0;

      // Slowly increment progress, but never reach 100 automatically
      // Uses logarithmic curve to slow down as it approaches completion
      if (currentProgress < 90) {
        const increment = Math.max(1, Math.floor((90 - currentProgress) / 10));
        const newProgress = Math.min(90, currentProgress + increment);
        this.reportProgress(jobId, newProgress, 'Processing...');
      }
    }, this.config.reportInterval);

    this.progressIntervals.set(jobId, interval);
  }

  // Type-safe event methods
  override on<K extends keyof ProgressReporterEvents>(
    event: K,
    listener: ProgressReporterEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof ProgressReporterEvents>(
    event: K,
    ...args: Parameters<ProgressReporterEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  override off<K extends keyof ProgressReporterEvents>(
    event: K,
    listener: ProgressReporterEvents[K]
  ): this {
    return super.off(event, listener);
  }

  override once<K extends keyof ProgressReporterEvents>(
    event: K,
    listener: ProgressReporterEvents[K]
  ): this {
    return super.once(event, listener);
  }
}

/**
 * Create a progress reporter
 */
export function createProgressReporter(config?: Partial<ProgressReporterConfig>): ProgressReporter {
  return new ProgressReporter(config);
}
