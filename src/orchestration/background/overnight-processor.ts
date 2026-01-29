/**
 * Overnight Processor
 * Handles background task processing during off-hours
 */

import { EventEmitter } from 'events';
import type { BackgroundTask, TaskPriority } from '../types.js';
import type { TaskStore } from '../stores/task-store.js';
import type { TaskQueue, TaskHandler, TaskContext, TaskResult } from './task-queue.js';
import { ORCHESTRATION_EVENTS } from '../events.js';

/**
 * Overnight processor configuration
 */
export interface OvernightProcessorConfig {
  /** Enable overnight processing */
  enabled: boolean;
  /** Start hour (0-23) */
  startHour: number;
  /** End hour (0-23) */
  endHour: number;
  /** Maximum tasks per night */
  maxTasksPerNight: number;
  /** Minimum priority threshold */
  priorityThreshold: TaskPriority;
  /** Time zone offset in hours */
  timezoneOffset: number;
  /** Check interval in ms */
  checkIntervalMs: number;
}

/**
 * Default configuration
 */
const DEFAULT_OVERNIGHT_CONFIG: OvernightProcessorConfig = {
  enabled: true,
  startHour: 1,    // 1 AM
  endHour: 6,      // 6 AM
  maxTasksPerNight: 20,
  priorityThreshold: 'normal',
  timezoneOffset: 0,
  checkIntervalMs: 60 * 1000, // 1 minute
};

/**
 * Priority order for comparison
 */
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/**
 * Overnight session statistics
 */
export interface OvernightSession {
  /** Session ID */
  id: string;
  /** Start timestamp */
  startedAt: number;
  /** End timestamp */
  endedAt?: number;
  /** Tasks processed */
  tasksProcessed: number;
  /** Tasks succeeded */
  tasksSucceeded: number;
  /** Tasks failed */
  tasksFailed: number;
  /** Active */
  active: boolean;
}

/**
 * Overnight processor events
 */
export interface OvernightProcessorEvents {
  'overnight:started': (session: OvernightSession) => void;
  'overnight:completed': (session: OvernightSession) => void;
  'overnight:task-started': (task: BackgroundTask) => void;
  'overnight:task-completed': (task: BackgroundTask, result: TaskResult) => void;
  'overnight:task-failed': (task: BackgroundTask, error: string) => void;
}

/**
 * Processes tasks during overnight hours
 */
export class OvernightProcessor extends EventEmitter {
  private config: OvernightProcessorConfig;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private currentSession: OvernightSession | null = null;
  private started: boolean = false;

  constructor(
    private store: TaskStore,
    private taskQueue: TaskQueue,
    config?: Partial<OvernightProcessorConfig>
  ) {
    super();
    this.config = { ...DEFAULT_OVERNIGHT_CONFIG, ...config };
  }

  /**
   * Start the overnight processor
   */
  start(): void {
    if (this.started || !this.config.enabled) {
      return;
    }

    this.checkInterval = setInterval(
      () => this.check(),
      this.config.checkIntervalMs
    );

    this.started = true;

    // Immediate check
    this.check();
  }

  /**
   * Stop the overnight processor
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.started = false;
  }

  /**
   * Check if it's overnight hours and process if so
   */
  private async check(): Promise<void> {
    const isOvernight = this.isOvernightHours();

    if (isOvernight && !this.currentSession) {
      await this.startOvernightSession();
    } else if (!isOvernight && this.currentSession) {
      await this.endOvernightSession();
    } else if (isOvernight && this.currentSession && this.currentSession.active) {
      await this.processNext();
    }
  }

  /**
   * Check if current time is within overnight hours
   */
  isOvernightHours(): boolean {
    const now = new Date();
    const hour = (now.getUTCHours() + this.config.timezoneOffset + 24) % 24;

    if (this.config.startHour < this.config.endHour) {
      // Normal range (e.g., 1 AM to 6 AM)
      return hour >= this.config.startHour && hour < this.config.endHour;
    } else {
      // Crosses midnight (e.g., 22 PM to 6 AM)
      return hour >= this.config.startHour || hour < this.config.endHour;
    }
  }

  /**
   * Start an overnight session
   */
  private async startOvernightSession(): Promise<void> {
    this.currentSession = {
      id: `overnight-${Date.now()}`,
      startedAt: Date.now(),
      tasksProcessed: 0,
      tasksSucceeded: 0,
      tasksFailed: 0,
      active: true,
    };

    this.emit('overnight:started', this.currentSession);
    this.emit(ORCHESTRATION_EVENTS.OVERNIGHT_STARTED, {
      sessionId: this.currentSession.id,
      startedAt: this.currentSession.startedAt,
      timestamp: Date.now(),
      source: 'overnight-processor',
    });
  }

  /**
   * End the overnight session
   */
  private async endOvernightSession(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    this.currentSession.endedAt = Date.now();
    this.currentSession.active = false;

    const session = this.currentSession;
    this.currentSession = null;

    this.emit('overnight:completed', session);
    this.emit(ORCHESTRATION_EVENTS.OVERNIGHT_COMPLETED, {
      sessionId: session.id,
      tasksProcessed: session.tasksProcessed,
      tasksSucceeded: session.tasksSucceeded,
      tasksFailed: session.tasksFailed,
      durationMs: (session.endedAt || Date.now()) - session.startedAt,
      timestamp: Date.now(),
      source: 'overnight-processor',
    });
  }

  /**
   * Process the next overnight-eligible task
   */
  private async processNext(): Promise<void> {
    if (!this.currentSession || !this.currentSession.active) {
      return;
    }

    // Check if we've reached the limit
    if (this.currentSession.tasksProcessed >= this.config.maxTasksPerNight) {
      this.currentSession.active = false;
      return;
    }

    // Get eligible tasks
    const tasks = await this.store.getOvernightEligible(this.config.priorityThreshold);
    if (tasks.length === 0) {
      return;
    }

    // Get the highest priority task
    const task = tasks[0];

    // Process the task
    this.emit('overnight:task-started', task);
    this.emit(ORCHESTRATION_EVENTS.OVERNIGHT_TASK_STARTED, {
      taskId: task.id,
      taskName: task.name,
      sessionId: this.currentSession.id,
      timestamp: Date.now(),
      source: 'overnight-processor',
    });

    try {
      const result = await this.taskQueue.executeTask(task.id);
      this.currentSession.tasksProcessed++;

      if (result.success) {
        this.currentSession.tasksSucceeded++;
        this.emit('overnight:task-completed', task, result);
      } else {
        this.currentSession.tasksFailed++;
        this.emit('overnight:task-failed', task, result.error || 'Unknown error');
      }

      this.emit(ORCHESTRATION_EVENTS.OVERNIGHT_TASK_COMPLETED, {
        taskId: task.id,
        taskName: task.name,
        sessionId: this.currentSession.id,
        success: result.success,
        error: result.error,
        timestamp: Date.now(),
        source: 'overnight-processor',
      });
    } catch (error) {
      this.currentSession.tasksProcessed++;
      this.currentSession.tasksFailed++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emit('overnight:task-failed', task, errorMsg);
    }
  }

  /**
   * Get eligible tasks count
   */
  async getEligibleTasksCount(): Promise<number> {
    const tasks = await this.store.getOvernightEligible(this.config.priorityThreshold);
    return tasks.length;
  }

  /**
   * Get current session
   */
  getCurrentSession(): OvernightSession | null {
    return this.currentSession;
  }

  /**
   * Get time until overnight starts
   */
  getTimeUntilOvernight(): number {
    const now = new Date();
    const currentHour = (now.getUTCHours() + this.config.timezoneOffset + 24) % 24;
    const currentMinutes = now.getUTCMinutes();

    let hoursUntil = this.config.startHour - currentHour;
    if (hoursUntil <= 0) {
      hoursUntil += 24;
    }

    // Adjust for minutes
    const minutesUntil = hoursUntil * 60 - currentMinutes;
    return minutesUntil * 60 * 1000;
  }

  /**
   * Get remaining overnight time
   */
  getRemainingOvernightTime(): number {
    if (!this.isOvernightHours()) {
      return 0;
    }

    const now = new Date();
    const currentHour = (now.getUTCHours() + this.config.timezoneOffset + 24) % 24;
    const currentMinutes = now.getUTCMinutes();

    let hoursRemaining = this.config.endHour - currentHour;
    if (hoursRemaining <= 0) {
      hoursRemaining += 24;
    }

    const minutesRemaining = hoursRemaining * 60 - currentMinutes;
    return minutesRemaining * 60 * 1000;
  }

  /**
   * Force start overnight processing (for testing or manual override)
   */
  async forceStart(): Promise<void> {
    if (this.currentSession && this.currentSession.active) {
      return; // Already running
    }

    await this.startOvernightSession();

    // Process all eligible tasks
    while (
      this.currentSession &&
      this.currentSession.active &&
      this.currentSession.tasksProcessed < this.config.maxTasksPerNight
    ) {
      const tasks = await this.store.getOvernightEligible(this.config.priorityThreshold);
      if (tasks.length === 0) {
        break;
      }
      await this.processNext();
    }

    await this.endOvernightSession();
  }

  /**
   * Force stop overnight processing
   */
  async forceStop(): Promise<void> {
    if (this.currentSession) {
      this.currentSession.active = false;
      await this.endOvernightSession();
    }
  }

  /**
   * Check if processor is running
   */
  isRunning(): boolean {
    return this.currentSession !== null && this.currentSession.active;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OvernightProcessorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get configuration
   */
  getConfig(): OvernightProcessorConfig {
    return { ...this.config };
  }
}

/**
 * Create an overnight processor
 */
export function createOvernightProcessor(
  store: TaskStore,
  taskQueue: TaskQueue,
  config?: Partial<OvernightProcessorConfig>
): OvernightProcessor {
  return new OvernightProcessor(store, taskQueue, config);
}
