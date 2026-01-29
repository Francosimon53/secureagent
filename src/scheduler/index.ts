import { randomUUID } from 'crypto';
import {
  JobDefinition,
  JobHandler,
  JobContext,
  JobResult,
  JobStatus,
  SchedulerConfig,
} from './types.js';
import {
  getNextCronTime,
  isValidCron,
  isInterval,
  parseInterval,
  describeCron,
} from './cron-parser.js';
import { EventBus, getEventBus } from '../events/index.js';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'Scheduler' });

// Re-export types and utilities
export * from './types.js';
export * from './cron-parser.js';
export * from './triggers.js';

// ============================================================================
// Scheduler Implementation
// ============================================================================

/**
 * Job scheduler with cron expressions and interval support
 */
export class Scheduler {
  private readonly jobs = new Map<string, JobDefinition>();
  private readonly handlers = new Map<string, JobHandler>();
  private readonly runningJobs = new Set<string>();
  private readonly config: Required<SchedulerConfig>;
  private tickTimer: NodeJS.Timeout | null = null;
  private eventBus: EventBus | null = null;
  private started = false;
  private lastTick = 0;

  constructor(config: SchedulerConfig = {}) {
    this.config = {
      tickInterval: config.tickInterval ?? 1000,
      maxConcurrentJobs: config.maxConcurrentJobs ?? 10,
      enablePersistence: config.enablePersistence ?? false,
      defaultTimeoutMs: config.defaultTimeoutMs ?? 300000,
      defaultRetryCount: config.defaultRetryCount ?? 0,
      defaultRetryDelayMs: config.defaultRetryDelayMs ?? 60000,
    };
  }

  /**
   * Initialize the scheduler
   */
  async initialize(): Promise<void> {
    this.eventBus = getEventBus();
    logger.info({ config: this.config }, 'Scheduler initialized');
  }

  /**
   * Register a job handler
   */
  registerHandler(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
    logger.debug({ handlerName: name }, 'Job handler registered');
  }

  /**
   * Schedule a job with a cron expression
   */
  schedule(
    name: string,
    cronExpression: string,
    handlerOrName: JobHandler | string,
    options: Partial<JobDefinition> = {}
  ): string {
    if (!isValidCron(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const id = randomUUID();
    const handlerName = typeof handlerOrName === 'string' ? handlerOrName : name;
    const handler = typeof handlerOrName === 'function' ? handlerOrName : undefined;

    if (handler) {
      this.handlers.set(handlerName, handler);
    }

    const job: JobDefinition = {
      id,
      name,
      schedule: cronExpression,
      handlerName,
      handler,
      enabled: options.enabled ?? true,
      runCount: 0,
      nextRunAt: getNextCronTime(cronExpression).getTime(),
      ...options,
    };

    this.jobs.set(id, job);

    logger.info(
      { jobId: id, name, schedule: cronExpression, description: describeCron(cronExpression) },
      'Job scheduled'
    );

    return id;
  }

  /**
   * Schedule a job with an interval
   */
  scheduleInterval(
    name: string,
    intervalMs: number,
    handlerOrName: JobHandler | string,
    options: Partial<JobDefinition> = {}
  ): string {
    const id = randomUUID();
    const handlerName = typeof handlerOrName === 'string' ? handlerOrName : name;
    const handler = typeof handlerOrName === 'function' ? handlerOrName : undefined;

    if (handler) {
      this.handlers.set(handlerName, handler);
    }

    const job: JobDefinition = {
      id,
      name,
      schedule: `interval:${intervalMs}`,
      handlerName,
      handler,
      enabled: options.enabled ?? true,
      runCount: 0,
      nextRunAt: Date.now() + intervalMs,
      ...options,
    };

    this.jobs.set(id, job);

    logger.info({ jobId: id, name, intervalMs }, 'Interval job scheduled');

    return id;
  }

  /**
   * Schedule a one-time job
   */
  scheduleOnce(
    name: string,
    runAt: Date | number,
    handlerOrName: JobHandler | string,
    options: Partial<JobDefinition> = {}
  ): string {
    const id = randomUUID();
    const runAtMs = typeof runAt === 'number' ? runAt : runAt.getTime();
    const handlerName = typeof handlerOrName === 'string' ? handlerOrName : name;
    const handler = typeof handlerOrName === 'function' ? handlerOrName : undefined;

    if (handler) {
      this.handlers.set(handlerName, handler);
    }

    // Use a very distant cron that won't match again
    const job: JobDefinition = {
      id,
      name,
      schedule: 'once',
      handlerName,
      handler,
      enabled: options.enabled ?? true,
      runCount: 0,
      nextRunAt: runAtMs,
      ...options,
    };

    this.jobs.set(id, job);

    logger.info({ jobId: id, name, runAt: new Date(runAtMs).toISOString() }, 'One-time job scheduled');

    return id;
  }

  /**
   * Cancel a job
   */
  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    this.jobs.delete(jobId);
    logger.info({ jobId, name: job.name }, 'Job cancelled');

    return true;
  }

  /**
   * Enable a job
   */
  enable(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    job.enabled = true;
    this.updateNextRunTime(job);
    logger.info({ jobId, name: job.name }, 'Job enabled');

    return true;
  }

  /**
   * Disable a job
   */
  disable(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    job.enabled = false;
    logger.info({ jobId, name: job.name }, 'Job disabled');

    return true;
  }

  /**
   * Get a job by ID
   */
  get(jobId: string): JobDefinition | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get a job by name
   */
  getByName(name: string): JobDefinition | undefined {
    for (const job of this.jobs.values()) {
      if (job.name === name) {
        return job;
      }
    }
    return undefined;
  }

  /**
   * List all jobs
   */
  list(filters?: { enabled?: boolean }): JobDefinition[] {
    let results = Array.from(this.jobs.values());

    if (filters?.enabled !== undefined) {
      results = results.filter(j => j.enabled === filters.enabled);
    }

    return results;
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.lastTick = Date.now();

    // Start tick loop
    this.tickTimer = setInterval(() => {
      this.tick().catch(err => {
        logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Scheduler tick error');
      });
    }, this.config.tickInterval);

    logger.info({ tickInterval: this.config.tickInterval }, 'Scheduler started');
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.started = false;

    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    // Wait for running jobs to complete (with timeout)
    const timeout = 30000;
    const startWait = Date.now();

    while (this.runningJobs.size > 0 && Date.now() - startWait < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.runningJobs.size > 0) {
      logger.warn({ runningJobs: this.runningJobs.size }, 'Scheduler stopped with running jobs');
    }

    logger.info('Scheduler stopped');
  }

  /**
   * Manually run a job immediately
   */
  async runNow(jobId: string): Promise<JobResult> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    return this.executeJob(job);
  }

  /**
   * Get scheduler statistics
   */
  getStats(): {
    totalJobs: number;
    enabledJobs: number;
    runningJobs: number;
    nextJobAt: number | null;
  } {
    const jobs = Array.from(this.jobs.values());
    const enabledJobs = jobs.filter(j => j.enabled);
    const nextJob = enabledJobs
      .filter(j => j.nextRunAt)
      .sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0))[0];

    return {
      totalJobs: jobs.length,
      enabledJobs: enabledJobs.length,
      runningJobs: this.runningJobs.size,
      nextJobAt: nextJob?.nextRunAt ?? null,
    };
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.started;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async tick(): Promise<void> {
    const now = Date.now();
    const jobsToRun: JobDefinition[] = [];

    // Find jobs ready to run
    for (const job of this.jobs.values()) {
      if (!job.enabled || !job.nextRunAt) {
        continue;
      }

      if (job.nextRunAt <= now) {
        // Check concurrency limit
        if (this.runningJobs.size >= this.config.maxConcurrentJobs) {
          logger.warn({ jobId: job.id }, 'Max concurrent jobs reached, deferring job');
          continue;
        }

        // Check if job is already running
        if (this.runningJobs.has(job.id)) {
          logger.warn({ jobId: job.id }, 'Job already running, skipping');
          continue;
        }

        jobsToRun.push(job);
      }
    }

    // Execute jobs
    for (const job of jobsToRun) {
      this.executeJob(job).catch(err => {
        logger.error(
          { jobId: job.id, error: err instanceof Error ? err.message : String(err) },
          'Job execution error'
        );
      });
    }

    this.lastTick = now;
  }

  private async executeJob(job: JobDefinition): Promise<JobResult> {
    const startTime = Date.now();
    const abortController = new AbortController();
    let timeoutTimer: NodeJS.Timeout | undefined;

    // Get handler
    const handler = job.handler ?? this.handlers.get(job.handlerName);
    if (!handler) {
      const result: JobResult = {
        jobId: job.id,
        jobName: job.name,
        status: 'failed',
        startedAt: startTime,
        completedAt: Date.now(),
        duration: 0,
        error: `Handler not found: ${job.handlerName}`,
      };
      job.lastStatus = 'failed';
      job.lastError = result.error;
      return result;
    }

    // Mark as running
    this.runningJobs.add(job.id);

    const context: JobContext = {
      jobId: job.id,
      jobName: job.name,
      scheduledAt: job.nextRunAt ?? startTime,
      startedAt: startTime,
      lastRunAt: job.lastRunAt,
      runCount: job.runCount,
      signal: abortController.signal,
      data: job.data,
    };

    try {
      // Set up timeout
      const timeoutMs = job.timeoutMs ?? this.config.defaultTimeoutMs;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => {
          abortController.abort();
          reject(new Error(`Job timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      // Execute handler
      await Promise.race([handler(context), timeoutPromise]);

      const result: JobResult = {
        jobId: job.id,
        jobName: job.name,
        status: 'completed',
        startedAt: startTime,
        completedAt: Date.now(),
        duration: Date.now() - startTime,
      };

      // Update job state
      job.lastRunAt = startTime;
      job.runCount++;
      job.lastStatus = 'completed';
      job.lastError = undefined;
      this.updateNextRunTime(job);

      logger.info(
        { jobId: job.id, name: job.name, duration: result.duration },
        'Job completed'
      );

      // Emit event
      if (this.eventBus) {
        await this.eventBus.publish('scheduler.job.completed', {
          jobId: job.id,
          jobName: job.name,
          duration: result.duration,
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for retry
      const retryCount = job.retryCount ?? this.config.defaultRetryCount;
      const currentRetries = (job.data?._retries as number) ?? 0;

      if (currentRetries < retryCount) {
        // Schedule retry
        const retryDelay = job.retryDelayMs ?? this.config.defaultRetryDelayMs;
        job.nextRunAt = Date.now() + retryDelay;
        job.data = { ...job.data, _retries: currentRetries + 1 };

        logger.warn(
          { jobId: job.id, name: job.name, retry: currentRetries + 1, maxRetries: retryCount },
          'Job failed, scheduling retry'
        );
      } else {
        // Update job state
        job.lastRunAt = startTime;
        job.runCount++;
        job.lastStatus = 'failed';
        job.lastError = errorMessage;
        job.data = { ...job.data, _retries: 0 };
        this.updateNextRunTime(job);
      }

      const result: JobResult = {
        jobId: job.id,
        jobName: job.name,
        status: 'failed',
        startedAt: startTime,
        completedAt: Date.now(),
        duration: Date.now() - startTime,
        error: errorMessage,
      };

      logger.error(
        { jobId: job.id, name: job.name, error: errorMessage },
        'Job failed'
      );

      // Emit event
      if (this.eventBus) {
        await this.eventBus.publish('scheduler.job.failed', {
          jobId: job.id,
          jobName: job.name,
          error: errorMessage,
        });
      }

      return result;
    } finally {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      this.runningJobs.delete(job.id);
    }
  }

  private updateNextRunTime(job: JobDefinition): void {
    if (!job.enabled) {
      job.nextRunAt = undefined;
      return;
    }

    if (job.schedule === 'once') {
      // One-time job, disable after run
      job.enabled = false;
      job.nextRunAt = undefined;
      return;
    }

    if (isInterval(job.schedule)) {
      const interval = parseInterval(job.schedule);
      job.nextRunAt = Date.now() + interval;
      return;
    }

    if (isValidCron(job.schedule)) {
      job.nextRunAt = getNextCronTime(job.schedule).getTime();
      return;
    }

    job.nextRunAt = undefined;
  }
}

// ============================================================================
// Factory and Global Instance
// ============================================================================

let globalScheduler: Scheduler | null = null;

/**
 * Initialize the global scheduler
 */
export async function initScheduler(config?: SchedulerConfig): Promise<Scheduler> {
  globalScheduler = new Scheduler(config);
  await globalScheduler.initialize();
  return globalScheduler;
}

/**
 * Get the global scheduler
 */
export function getScheduler(): Scheduler {
  if (!globalScheduler) {
    throw new Error('Scheduler not initialized. Call initScheduler() first.');
  }
  return globalScheduler;
}

/**
 * Check if scheduler is initialized
 */
export function isSchedulerInitialized(): boolean {
  return globalScheduler !== null;
}
