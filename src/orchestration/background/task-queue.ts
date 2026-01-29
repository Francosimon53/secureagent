/**
 * Task Queue
 * Manages background task queuing and processing
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  BackgroundTask,
  TaskStatus,
  TaskPriority,
  PersonaType,
} from '../types.js';
import type { TaskStore } from '../stores/task-store.js';
import { ORCHESTRATION_EVENTS } from '../events.js';

/**
 * Task creation options
 */
export interface CreateTaskOptions {
  /** Task name */
  name: string;
  /** Task description */
  description: string;
  /** Required persona type */
  requiredPersonaType?: PersonaType;
  /** Task priority */
  priority?: TaskPriority;
  /** Eligible for overnight processing */
  overnightEligible?: boolean;
  /** Estimated duration in minutes */
  estimatedDurationMinutes?: number;
  /** Maximum retries */
  maxRetries?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Task queue configuration
 */
export interface TaskQueueConfig {
  /** Maximum queue size */
  maxQueueSize: number;
  /** Task timeout in minutes */
  taskTimeoutMinutes: number;
  /** Retry failed tasks */
  retryFailedTasks: boolean;
  /** Maximum retries */
  maxRetries: number;
  /** Processing interval in ms */
  processingIntervalMs: number;
}

/**
 * Default configuration
 */
const DEFAULT_QUEUE_CONFIG: TaskQueueConfig = {
  maxQueueSize: 100,
  taskTimeoutMinutes: 60,
  retryFailedTasks: true,
  maxRetries: 3,
  processingIntervalMs: 5000,
};

/**
 * Task handler function type
 */
export type TaskHandler = (
  task: BackgroundTask,
  context: TaskContext
) => Promise<TaskResult>;

/**
 * Task execution context
 */
export interface TaskContext {
  /** Report progress (0-100) */
  reportProgress: (progress: number) => Promise<void>;
  /** Save checkpoint */
  saveCheckpoint: (step: number, totalSteps: number, state: Record<string, unknown>) => Promise<void>;
  /** Get last checkpoint */
  getCheckpoint: () => Promise<{ step: number; totalSteps: number; state: Record<string, unknown> } | null>;
  /** Check if task should abort */
  shouldAbort: () => boolean;
}

/**
 * Task result
 */
export interface TaskResult {
  /** Success status */
  success: boolean;
  /** Result data */
  result?: unknown;
  /** Error message if failed */
  error?: string;
}

/**
 * Queue events
 */
export interface TaskQueueEvents {
  'task:queued': (task: BackgroundTask) => void;
  'task:started': (task: BackgroundTask) => void;
  'task:progress': (taskId: string, progress: number) => void;
  'task:completed': (task: BackgroundTask, result: unknown) => void;
  'task:failed': (task: BackgroundTask, error: string) => void;
  'task:retried': (task: BackgroundTask, attempt: number) => void;
  'task:timeout': (task: BackgroundTask) => void;
}

/**
 * Background task queue
 */
export class TaskQueue extends EventEmitter {
  private config: TaskQueueConfig;
  private handlers: Map<string, TaskHandler> = new Map();
  private processingInterval: ReturnType<typeof setInterval> | null = null;
  private runningTasks: Map<string, { aborted: boolean }> = new Map();
  private started: boolean = false;

  constructor(
    private store: TaskStore,
    config?: Partial<TaskQueueConfig>
  ) {
    super();
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }

  /**
   * Start the task queue
   */
  start(): void {
    if (this.started) {
      return;
    }

    this.processingInterval = setInterval(
      () => this.processQueue(),
      this.config.processingIntervalMs
    );

    this.started = true;
  }

  /**
   * Stop the task queue
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Mark all running tasks as aborted
    for (const context of this.runningTasks.values()) {
      context.aborted = true;
    }

    this.started = false;
  }

  /**
   * Register a task handler
   */
  registerHandler(name: string, handler: TaskHandler): void {
    this.handlers.set(name, handler);
  }

  /**
   * Unregister a task handler
   */
  unregisterHandler(name: string): boolean {
    return this.handlers.delete(name);
  }

  /**
   * Enqueue a task
   */
  async enqueue(options: CreateTaskOptions): Promise<BackgroundTask> {
    // Check queue capacity
    const queuedCount = await this.store.countByStatus('queued');
    if (queuedCount >= this.config.maxQueueSize) {
      throw new Error(`Task queue is full (${this.config.maxQueueSize} tasks)`);
    }

    const task: BackgroundTask = {
      id: randomUUID(),
      name: options.name,
      description: options.description,
      requiredPersonaType: options.requiredPersonaType,
      priority: options.priority || 'normal',
      status: 'queued',
      progress: 0,
      overnightEligible: options.overnightEligible ?? false,
      estimatedDurationMinutes: options.estimatedDurationMinutes,
      retryCount: 0,
      maxRetries: options.maxRetries ?? this.config.maxRetries,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.store.save(task);

    this.emit('task:queued', task);
    this.emit(ORCHESTRATION_EVENTS.TASK_QUEUED, {
      taskId: task.id,
      taskName: task.name,
      status: task.status,
      priority: task.priority,
      timestamp: Date.now(),
      source: 'task-queue',
    });

    return task;
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId: string): Promise<BackgroundTask | null> {
    return this.store.get(taskId);
  }

  /**
   * Get all tasks
   */
  async getAllTasks(): Promise<BackgroundTask[]> {
    return this.store.getAll();
  }

  /**
   * Get queued tasks
   */
  async getQueuedTasks(limit?: number): Promise<BackgroundTask[]> {
    return this.store.getQueuedTasks(limit);
  }

  /**
   * Get running tasks
   */
  async getRunningTasks(): Promise<BackgroundTask[]> {
    return this.store.getByStatus('running');
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const task = await this.store.get(taskId);
    if (!task) {
      return false;
    }

    if (task.status === 'running') {
      // Mark as aborted
      const context = this.runningTasks.get(taskId);
      if (context) {
        context.aborted = true;
      }
    }

    await this.store.updateStatus(taskId, 'cancelled');

    this.emit(ORCHESTRATION_EVENTS.TASK_CANCELLED, {
      taskId: task.id,
      taskName: task.name,
      status: 'cancelled',
      timestamp: Date.now(),
      source: 'task-queue',
    });

    return true;
  }

  /**
   * Pause a task
   */
  async pauseTask(taskId: string): Promise<boolean> {
    const task = await this.store.get(taskId);
    if (!task || task.status !== 'running') {
      return false;
    }

    // Mark as aborted
    const context = this.runningTasks.get(taskId);
    if (context) {
      context.aborted = true;
    }

    await this.store.updateStatus(taskId, 'paused');

    this.emit(ORCHESTRATION_EVENTS.TASK_PAUSED, {
      taskId: task.id,
      taskName: task.name,
      status: 'paused',
      progress: task.progress,
      timestamp: Date.now(),
      source: 'task-queue',
    });

    return true;
  }

  /**
   * Resume a paused task
   */
  async resumeTask(taskId: string): Promise<boolean> {
    const task = await this.store.get(taskId);
    if (!task || task.status !== 'paused') {
      return false;
    }

    await this.store.updateStatus(taskId, 'queued');

    this.emit(ORCHESTRATION_EVENTS.TASK_RESUMED, {
      taskId: task.id,
      taskName: task.name,
      status: 'queued',
      timestamp: Date.now(),
      source: 'task-queue',
    });

    return true;
  }

  /**
   * Execute a task immediately
   */
  async executeTask(taskId: string): Promise<TaskResult> {
    const task = await this.store.get(taskId);
    if (!task) {
      throw new Error(`Task '${taskId}' not found`);
    }

    return this.runTask(task);
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    queued: number;
    running: number;
    completed: number;
    failed: number;
    paused: number;
  }> {
    const [queued, running, completed, failed, paused] = await Promise.all([
      this.store.countByStatus('queued'),
      this.store.countByStatus('running'),
      this.store.countByStatus('completed'),
      this.store.countByStatus('failed'),
      this.store.countByStatus('paused'),
    ]);

    return { queued, running, completed, failed, paused };
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    // Check for timed out tasks
    await this.handleTimeouts();

    // Get next task to process
    const tasks = await this.store.getQueuedTasks(1);
    if (tasks.length === 0) {
      return;
    }

    const task = tasks[0];

    // Check if handler exists
    const handler = this.handlers.get(task.name);
    if (!handler) {
      // No handler, leave in queue
      return;
    }

    // Run the task
    await this.runTask(task);
  }

  /**
   * Run a task
   */
  private async runTask(task: BackgroundTask): Promise<TaskResult> {
    const handler = this.handlers.get(task.name);
    if (!handler) {
      throw new Error(`No handler registered for task '${task.name}'`);
    }

    // Mark as running
    await this.store.updateStatus(task.id, 'running');
    task.status = 'running';
    task.startedAt = Date.now();

    const runContext = { aborted: false };
    this.runningTasks.set(task.id, runContext);

    this.emit('task:started', task);
    this.emit(ORCHESTRATION_EVENTS.TASK_STARTED, {
      taskId: task.id,
      taskName: task.name,
      status: 'running',
      timestamp: Date.now(),
      source: 'task-queue',
    });

    // Create task context
    const context: TaskContext = {
      reportProgress: async (progress: number) => {
        await this.store.updateProgress(task.id, progress);
        this.emit('task:progress', task.id, progress);
        this.emit(ORCHESTRATION_EVENTS.TASK_PROGRESS, {
          taskId: task.id,
          taskName: task.name,
          status: 'running',
          progress,
          timestamp: Date.now(),
          source: 'task-queue',
        });
      },
      saveCheckpoint: async (step: number, totalSteps: number, state: Record<string, unknown>) => {
        await this.store.saveCheckpoint({
          taskId: task.id,
          step,
          totalSteps,
          state,
          savedAt: Date.now(),
        });
        this.emit(ORCHESTRATION_EVENTS.TASK_CHECKPOINTED, {
          taskId: task.id,
          taskName: task.name,
          step,
          totalSteps,
          timestamp: Date.now(),
          source: 'task-queue',
        });
      },
      getCheckpoint: async () => {
        const checkpoint = await this.store.getCheckpoint(task.id);
        return checkpoint
          ? { step: checkpoint.step, totalSteps: checkpoint.totalSteps, state: checkpoint.state }
          : null;
      },
      shouldAbort: () => runContext.aborted,
    };

    try {
      const result = await handler(task, context);

      this.runningTasks.delete(task.id);

      if (result.success) {
        await this.store.updateStatus(task.id, 'completed', undefined, result.result);
        await this.store.updateProgress(task.id, 100);
        await this.store.deleteCheckpoint(task.id);

        this.emit('task:completed', task, result.result);
        this.emit(ORCHESTRATION_EVENTS.TASK_COMPLETED, {
          taskId: task.id,
          taskName: task.name,
          status: 'completed',
          result: result.result,
          timestamp: Date.now(),
          source: 'task-queue',
        });
      } else {
        await this.handleTaskFailure(task, result.error || 'Unknown error');
      }

      return result;
    } catch (error) {
      this.runningTasks.delete(task.id);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.handleTaskFailure(task, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle task failure
   */
  private async handleTaskFailure(task: BackgroundTask, error: string): Promise<void> {
    // Check if should retry
    if (this.config.retryFailedTasks && task.retryCount < task.maxRetries) {
      await this.store.incrementRetry(task.id);
      await this.store.updateStatus(task.id, 'queued');

      this.emit('task:retried', task, task.retryCount + 1);
      this.emit(ORCHESTRATION_EVENTS.TASK_RETRIED, {
        taskId: task.id,
        taskName: task.name,
        status: 'queued',
        retryCount: task.retryCount + 1,
        timestamp: Date.now(),
        source: 'task-queue',
      });
    } else {
      await this.store.updateStatus(task.id, 'failed', error);

      this.emit('task:failed', task, error);
      this.emit(ORCHESTRATION_EVENTS.TASK_FAILED, {
        taskId: task.id,
        taskName: task.name,
        status: 'failed',
        error,
        timestamp: Date.now(),
        source: 'task-queue',
      });
    }
  }

  /**
   * Handle timed out tasks
   */
  private async handleTimeouts(): Promise<void> {
    const timeoutMs = this.config.taskTimeoutMinutes * 60 * 1000;
    const timedOut = await this.store.getTimedOutTasks(timeoutMs);

    for (const task of timedOut) {
      // Abort the task
      const context = this.runningTasks.get(task.id);
      if (context) {
        context.aborted = true;
      }

      this.emit('task:timeout', task);

      // Handle as failure
      await this.handleTaskFailure(task, 'Task timed out');
    }
  }
}

/**
 * Create a task queue
 */
export function createTaskQueue(
  store: TaskStore,
  config?: Partial<TaskQueueConfig>
): TaskQueue {
  return new TaskQueue(store, config);
}
