/**
 * Checkpoint Manager
 * Manages task checkpointing for resumable operations
 */

import { EventEmitter } from 'events';
import type { TaskCheckpoint, BackgroundTask } from '../types.js';
import type { TaskStore } from '../stores/task-store.js';
import { ORCHESTRATION_EVENTS } from '../events.js';

/**
 * Checkpoint manager configuration
 */
export interface CheckpointManagerConfig {
  /** Checkpoint interval in minutes */
  checkpointIntervalMinutes: number;
  /** Auto-checkpoint enabled */
  autoCheckpoint: boolean;
  /** Maximum checkpoints to keep per task */
  maxCheckpointsPerTask: number;
}

/**
 * Default configuration
 */
const DEFAULT_CHECKPOINT_CONFIG: CheckpointManagerConfig = {
  checkpointIntervalMinutes: 5,
  autoCheckpoint: true,
  maxCheckpointsPerTask: 1,
};

/**
 * Checkpoint events
 */
export interface CheckpointManagerEvents {
  'checkpoint:saved': (checkpoint: TaskCheckpoint) => void;
  'checkpoint:restored': (taskId: string, checkpoint: TaskCheckpoint) => void;
  'checkpoint:deleted': (taskId: string) => void;
}

/**
 * Manages task checkpoints
 */
export class CheckpointManager extends EventEmitter {
  private config: CheckpointManagerConfig;
  private checkpointInterval: ReturnType<typeof setInterval> | null = null;
  private taskStates: Map<string, { lastCheckpoint: number; state: Record<string, unknown> }> = new Map();

  constructor(
    private store: TaskStore,
    config?: Partial<CheckpointManagerConfig>
  ) {
    super();
    this.config = { ...DEFAULT_CHECKPOINT_CONFIG, ...config };
  }

  /**
   * Start automatic checkpointing
   */
  start(): void {
    if (this.checkpointInterval || !this.config.autoCheckpoint) {
      return;
    }

    this.checkpointInterval = setInterval(
      () => this.autoCheckpointRunningTasks(),
      this.config.checkpointIntervalMinutes * 60 * 1000
    );
  }

  /**
   * Stop automatic checkpointing
   */
  stop(): void {
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
      this.checkpointInterval = null;
    }
  }

  /**
   * Save a checkpoint
   */
  async saveCheckpoint(
    taskId: string,
    step: number,
    totalSteps: number,
    state: Record<string, unknown>
  ): Promise<TaskCheckpoint> {
    const checkpoint: TaskCheckpoint = {
      taskId,
      step,
      totalSteps,
      state,
      savedAt: Date.now(),
    };

    await this.store.saveCheckpoint(checkpoint);

    // Update local state
    this.taskStates.set(taskId, {
      lastCheckpoint: Date.now(),
      state,
    });

    this.emit('checkpoint:saved', checkpoint);
    this.emit(ORCHESTRATION_EVENTS.TASK_CHECKPOINTED, {
      taskId,
      step,
      totalSteps,
      timestamp: Date.now(),
      source: 'checkpoint-manager',
    });

    return checkpoint;
  }

  /**
   * Get checkpoint for a task
   */
  async getCheckpoint(taskId: string): Promise<TaskCheckpoint | null> {
    return this.store.getCheckpoint(taskId);
  }

  /**
   * Restore from checkpoint
   */
  async restoreCheckpoint(taskId: string): Promise<TaskCheckpoint | null> {
    const checkpoint = await this.store.getCheckpoint(taskId);

    if (checkpoint) {
      this.emit('checkpoint:restored', taskId, checkpoint);
    }

    return checkpoint;
  }

  /**
   * Delete checkpoint for a task
   */
  async deleteCheckpoint(taskId: string): Promise<boolean> {
    const deleted = await this.store.deleteCheckpoint(taskId);
    this.taskStates.delete(taskId);

    if (deleted) {
      this.emit('checkpoint:deleted', taskId);
    }

    return deleted;
  }

  /**
   * Get all checkpoints
   */
  async getAllCheckpoints(): Promise<TaskCheckpoint[]> {
    return this.store.getAllCheckpoints();
  }

  /**
   * Check if task has checkpoint
   */
  async hasCheckpoint(taskId: string): Promise<boolean> {
    const checkpoint = await this.store.getCheckpoint(taskId);
    return checkpoint !== null;
  }

  /**
   * Update task state (for auto-checkpointing)
   */
  updateTaskState(taskId: string, state: Record<string, unknown>): void {
    const existing = this.taskStates.get(taskId);
    this.taskStates.set(taskId, {
      lastCheckpoint: existing?.lastCheckpoint ?? 0,
      state,
    });
  }

  /**
   * Get task state
   */
  getTaskState(taskId: string): Record<string, unknown> | null {
    return this.taskStates.get(taskId)?.state ?? null;
  }

  /**
   * Calculate checkpoint progress
   */
  calculateProgress(checkpoint: TaskCheckpoint): number {
    if (checkpoint.totalSteps === 0) {
      return 0;
    }
    return Math.round((checkpoint.step / checkpoint.totalSteps) * 100);
  }

  /**
   * Should checkpoint (based on interval)
   */
  shouldCheckpoint(taskId: string): boolean {
    const taskState = this.taskStates.get(taskId);
    if (!taskState) {
      return true;
    }

    const intervalMs = this.config.checkpointIntervalMinutes * 60 * 1000;
    return Date.now() - taskState.lastCheckpoint >= intervalMs;
  }

  /**
   * Auto-checkpoint running tasks
   */
  private async autoCheckpointRunningTasks(): Promise<void> {
    const runningTasks = await this.store.getByStatus('running');

    for (const task of runningTasks) {
      const taskState = this.taskStates.get(task.id);
      if (!taskState) {
        continue;
      }

      if (this.shouldCheckpoint(task.id)) {
        // Calculate step based on progress
        const step = Math.round(task.progress);
        const totalSteps = 100;

        await this.saveCheckpoint(task.id, step, totalSteps, taskState.state);
      }
    }
  }

  /**
   * Resume task from checkpoint
   */
  async prepareResume(taskId: string): Promise<{
    checkpoint: TaskCheckpoint | null;
    startStep: number;
    state: Record<string, unknown>;
  }> {
    const checkpoint = await this.getCheckpoint(taskId);

    if (checkpoint) {
      return {
        checkpoint,
        startStep: checkpoint.step,
        state: checkpoint.state,
      };
    }

    return {
      checkpoint: null,
      startStep: 0,
      state: {},
    };
  }

  /**
   * Create a checkpointing context for a task handler
   */
  createContext(taskId: string, totalSteps: number) {
    let currentStep = 0;
    let currentState: Record<string, unknown> = {};
    const manager = this;

    return {
      /**
       * Update step and optionally save checkpoint
       */
      step: async (step: number, state?: Record<string, unknown>): Promise<void> => {
        currentStep = step;
        if (state) {
          currentState = { ...currentState, ...state };
        }

        if (manager.shouldCheckpoint(taskId)) {
          await manager.saveCheckpoint(taskId, step, totalSteps, currentState);
        } else {
          manager.updateTaskState(taskId, currentState);
        }
      },

      /**
       * Force save checkpoint
       */
      checkpoint: async (state?: Record<string, unknown>): Promise<TaskCheckpoint> => {
        if (state) {
          currentState = { ...currentState, ...state };
        }
        return manager.saveCheckpoint(taskId, currentStep, totalSteps, currentState);
      },

      /**
       * Get current state
       */
      getState: (): Record<string, unknown> => {
        return currentState;
      },

      /**
       * Set state
       */
      setState: (state: Record<string, unknown>): void => {
        currentState = { ...currentState, ...state };
        manager.updateTaskState(taskId, currentState);
      },

      /**
       * Get progress percentage
       */
      getProgress: (): number => {
        return totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
      },
    };
  }
}

/**
 * Create a checkpoint manager
 */
export function createCheckpointManager(
  store: TaskStore,
  config?: Partial<CheckpointManagerConfig>
): CheckpointManager {
  return new CheckpointManager(store, config);
}
