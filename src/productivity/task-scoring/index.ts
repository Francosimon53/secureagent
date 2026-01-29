/**
 * Task Scoring Service
 *
 * Calculates and manages task priority scores using weighted factors.
 */

import type {
  TodoItem,
  TaskScore,
  TaskScoringWeights,
  TodoContext,
} from '../types.js';
import type { TaskScoringConfig } from '../config.js';
import type { TodoStore } from '../stores/productivity-store.js';
import {
  classifyTask,
  groupByQuadrant,
  generateEisenhowerSummary,
  type EisenhowerClassification,
  type EisenhowerSummary,
  type EisenhowerQuadrant,
} from './eisenhower.js';

// Re-export Eisenhower types
export {
  classifyTask,
  groupByQuadrant,
  generateEisenhowerSummary,
  type EisenhowerClassification,
  type EisenhowerSummary,
  type EisenhowerQuadrant,
};

/**
 * Default scoring weights
 */
const DEFAULT_WEIGHTS: TaskScoringWeights = {
  urgency: 0.3,
  importance: 0.3,
  effort: 0.15,
  contextMatch: 0.15,
  decay: 0.1,
};

/**
 * Task Scoring Service
 */
export class TaskScoringService {
  private readonly weights: TaskScoringWeights;
  private readonly decayHalfLifeMs: number;
  private currentContext: TodoContext = 'work';

  constructor(
    private readonly todoStore: TodoStore,
    config?: Partial<TaskScoringConfig>
  ) {
    this.weights = {
      ...DEFAULT_WEIGHTS,
      ...config?.weights,
    };
    this.decayHalfLifeMs = (config?.decayHalfLifeDays ?? 7) * 24 * 60 * 60 * 1000;
  }

  /**
   * Set the current context (work/personal)
   */
  setContext(context: TodoContext): void {
    this.currentContext = context;
  }

  /**
   * Get the current context
   */
  getContext(): TodoContext {
    return this.currentContext;
  }

  /**
   * Calculate score for a single task
   */
  calculateScore(task: TodoItem): TaskScore {
    const now = Date.now();

    // Urgency: inverse of time until due (0-1)
    const urgency = this.calculateUrgency(task, now);

    // Importance: from priority field and other factors
    const importance = this.calculateImportance(task);

    // Effort: estimated effort (inverse - lower effort = higher score)
    const effort = this.calculateEffort(task);

    // Context match: alignment with current context
    const contextMatch = this.calculateContextMatch(task);

    // Decay: exponential based on age
    const decay = this.calculateDecay(task, now);

    // Weighted total
    const total =
      this.weights.urgency * urgency +
      this.weights.importance * importance +
      this.weights.effort * effort +
      this.weights.contextMatch * contextMatch +
      this.weights.decay * decay;

    return {
      total: Math.round(total * 1000) / 1000,
      urgency: Math.round(urgency * 1000) / 1000,
      importance: Math.round(importance * 1000) / 1000,
      effort: Math.round(effort * 1000) / 1000,
      contextMatch: Math.round(contextMatch * 1000) / 1000,
      decay: Math.round(decay * 1000) / 1000,
      computedAt: now,
    };
  }

  /**
   * Score and update a task in the store
   */
  async scoreTask(taskId: string): Promise<TaskScore | null> {
    const task = await this.todoStore.get(taskId);
    if (!task) {
      return null;
    }

    const score = this.calculateScore(task);
    await this.todoStore.updateScore(taskId, score);
    return score;
  }

  /**
   * Score multiple tasks and update the store
   */
  async scoreTasks(taskIds: string[]): Promise<Map<string, TaskScore>> {
    const results = new Map<string, TaskScore>();

    for (const taskId of taskIds) {
      const score = await this.scoreTask(taskId);
      if (score) {
        results.set(taskId, score);
      }
    }

    return results;
  }

  /**
   * Score all pending tasks for a user
   */
  async scoreAllPendingTasks(userId: string): Promise<number> {
    const tasks = await this.todoStore.list(userId, {
      status: ['pending', 'in_progress'],
    });

    let scored = 0;
    for (const task of tasks) {
      const score = this.calculateScore(task);
      if (await this.todoStore.updateScore(task.id, score)) {
        scored++;
      }
    }

    return scored;
  }

  /**
   * Get tasks sorted by score
   */
  async getTopTasks(
    userId: string,
    limit = 10,
    context?: TodoContext
  ): Promise<TodoItem[]> {
    if (context) {
      this.setContext(context);
    }

    const tasks = await this.todoStore.list(userId, {
      status: ['pending', 'in_progress'],
      context: context ?? this.currentContext,
    });

    // Score all tasks
    const scoredTasks = tasks.map(task => ({
      task,
      score: this.calculateScore(task),
    }));

    // Sort by score descending
    scoredTasks.sort((a, b) => b.score.total - a.score.total);

    // Return top N tasks with updated scores
    return scoredTasks.slice(0, limit).map(({ task, score }) => ({
      ...task,
      score,
    }));
  }

  /**
   * Get Eisenhower matrix classification for tasks
   */
  async getEisenhowerMatrix(userId: string): Promise<Map<EisenhowerQuadrant, TodoItem[]>> {
    const tasks = await this.todoStore.list(userId, {
      status: ['pending', 'in_progress'],
    });

    return groupByQuadrant(tasks);
  }

  /**
   * Get Eisenhower summary for tasks
   */
  async getEisenhowerSummary(userId: string): Promise<EisenhowerSummary> {
    const tasks = await this.todoStore.list(userId, {
      status: ['pending', 'in_progress'],
    });

    return generateEisenhowerSummary(tasks);
  }

  /**
   * Get task classification
   */
  getTaskClassification(task: TodoItem): EisenhowerClassification {
    return classifyTask(task);
  }

  // ==========================================================================
  // Private scoring calculations
  // ==========================================================================

  private calculateUrgency(task: TodoItem, now: number): number {
    if (!task.dueDate) {
      return 0.2; // Low urgency if no due date
    }

    const hoursUntilDue = (task.dueDate - now) / (1000 * 60 * 60);

    if (hoursUntilDue <= 0) {
      return 1.0; // Overdue
    }

    if (hoursUntilDue <= 24) {
      return 1.0;
    }

    if (hoursUntilDue <= 72) {
      return 0.7;
    }

    if (hoursUntilDue <= 168) {
      return 0.4;
    }

    return 0.2;
  }

  private calculateImportance(task: TodoItem): number {
    const priorityScores = {
      critical: 1.0,
      high: 0.8,
      medium: 0.5,
      low: 0.2,
    };

    return priorityScores[task.priority] ?? 0.5;
  }

  private calculateEffort(task: TodoItem): number {
    // Estimate effort based on task characteristics
    let effort = 0.5; // Default medium effort

    // Tasks with subtasks are typically more effort
    if (task.subtasks && task.subtasks.length > 0) {
      effort += 0.1 * Math.min(task.subtasks.length, 5);
    }

    // Tasks with longer descriptions may be more complex
    if (task.description) {
      const wordCount = task.description.split(/\s+/).length;
      if (wordCount > 50) {
        effort += 0.1;
      }
    }

    // Return inverse (lower effort = higher score for prioritization)
    return Math.max(0, 1 - Math.min(effort, 1));
  }

  private calculateContextMatch(task: TodoItem): number {
    if (task.context === 'both') {
      return 0.8; // Slightly lower than exact match
    }

    if (task.context === this.currentContext) {
      return 1.0;
    }

    return 0.3; // Low score for mismatched context
  }

  private calculateDecay(task: TodoItem, now: number): number {
    const ageMs = now - task.createdAt;
    // Exponential decay based on half-life
    // Returns 1.0 for new tasks, 0.5 after half-life, approaching 0 for old tasks
    return Math.pow(0.5, ageMs / this.decayHalfLifeMs);
  }
}

/**
 * Create a task scoring service
 */
export function createTaskScoringService(
  todoStore: TodoStore,
  config?: Partial<TaskScoringConfig>
): TaskScoringService {
  return new TaskScoringService(todoStore, config);
}
