/**
 * Task Scorer
 *
 * Intelligent task prioritization using multiple factors
 */

import type {
  Task,
  TaskScore,
  TaskFilter,
  TaskProvider,
  TaskContext,
  TaskEnergyLevel,
} from './types.js';
import { DailyDriverError } from './types.js';
import {
  DAILY_DRIVER_EVENTS,
  TASK_PRIORITY_WEIGHTS,
  TASK_ENERGY_WEIGHTS,
  TASK_SCORING_DEFAULTS,
  TASK_RECOMMENDATIONS,
  TIME_CONSTANTS,
} from './constants.js';

// =============================================================================
// Task Scorer Config
// =============================================================================

export interface TaskScorerConfig {
  /** Task provider */
  provider?: TaskProvider;
  /** Scoring weights */
  weights: {
    urgency: number;
    importance: number;
    effort: number;
    context: number;
    dependencies: number;
    energy: number;
  };
  /** Urgency thresholds in days */
  urgencyThresholds: {
    urgent: number;
    soon: number;
    upcoming: number;
  };
  /** Quick task threshold in minutes */
  quickTaskMinutes: number;
  /** Long task threshold in minutes */
  longTaskMinutes: number;
  /** Current user context */
  currentContext?: TaskContext;
  /** Current energy level */
  currentEnergy?: TaskEnergyLevel;
  /** Time of day (affects energy recommendations) */
  timeOfDay?: 'morning' | 'afternoon' | 'evening';
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: TaskScorerConfig = {
  weights: {
    urgency: TASK_SCORING_DEFAULTS.URGENCY_WEIGHT,
    importance: TASK_SCORING_DEFAULTS.IMPORTANCE_WEIGHT,
    effort: TASK_SCORING_DEFAULTS.EFFORT_WEIGHT,
    context: TASK_SCORING_DEFAULTS.CONTEXT_WEIGHT,
    dependencies: TASK_SCORING_DEFAULTS.DEPENDENCY_WEIGHT,
    energy: TASK_SCORING_DEFAULTS.ENERGY_WEIGHT,
  },
  urgencyThresholds: {
    urgent: TASK_SCORING_DEFAULTS.URGENT_DAYS,
    soon: TASK_SCORING_DEFAULTS.SOON_DAYS,
    upcoming: TASK_SCORING_DEFAULTS.UPCOMING_DAYS,
  },
  quickTaskMinutes: TASK_SCORING_DEFAULTS.QUICK_TASK_MINUTES,
  longTaskMinutes: TASK_SCORING_DEFAULTS.LONG_TASK_MINUTES,
};

// =============================================================================
// Task Scorer
// =============================================================================

export class TaskScorer {
  private readonly config: TaskScorerConfig;
  private provider: TaskProvider | null = null;
  private taskCache = new Map<string, Task>();

  constructor(config?: Partial<TaskScorerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.provider = this.config.provider ?? null;
  }

  /**
   * Set the task provider
   */
  setProvider(provider: TaskProvider): void {
    this.provider = provider;
  }

  /**
   * Set current context
   */
  setContext(context: TaskContext): void {
    this.config.currentContext = context;
  }

  /**
   * Set current energy level
   */
  setEnergyLevel(energy: TaskEnergyLevel): void {
    this.config.currentEnergy = energy;
  }

  /**
   * Score a single task
   */
  scoreTask(task: Task): TaskScore {
    const breakdown = {
      urgency: this.calculateUrgencyScore(task),
      importance: this.calculateImportanceScore(task),
      effort: this.calculateEffortScore(task),
      context: this.calculateContextScore(task),
      dependencies: this.calculateDependencyScore(task),
      energy: this.calculateEnergyScore(task),
    };

    const totalScore =
      breakdown.urgency * this.config.weights.urgency +
      breakdown.importance * this.config.weights.importance +
      breakdown.effort * this.config.weights.effort +
      breakdown.context * this.config.weights.context +
      breakdown.dependencies * this.config.weights.dependencies +
      breakdown.energy * this.config.weights.energy;

    const normalizedScore = Math.round(totalScore * 100);
    const recommendation = this.getRecommendation(normalizedScore, task);
    const reasoning = this.generateReasoning(task, breakdown, recommendation);

    const score: TaskScore = {
      taskId: task.id,
      totalScore: normalizedScore,
      breakdown,
      recommendation,
      reasoning,
    };

    this.emit(DAILY_DRIVER_EVENTS.TASK_SCORED, { task, score });

    return score;
  }

  /**
   * Score multiple tasks
   */
  scoreTasks(tasks: Task[]): TaskScore[] {
    return tasks.map(task => this.scoreTask(task));
  }

  /**
   * Get prioritized task list
   */
  async getPrioritizedTasks(filter?: TaskFilter): Promise<Array<{ task: Task; score: TaskScore }>> {
    this.ensureProvider();

    const tasks = await this.provider!.listTasks({
      status: ['pending', 'in_progress'],
      ...filter,
    });

    const scored = tasks.map(task => ({
      task,
      score: this.scoreTask(task),
    }));

    // Sort by score (highest first)
    scored.sort((a, b) => b.score.totalScore - a.score.totalScore);

    this.emit(DAILY_DRIVER_EVENTS.TASKS_PRIORITIZED, {
      count: scored.length,
      topTask: scored[0]?.task.title,
    });

    return scored;
  }

  /**
   * Get suggested focus tasks
   */
  async getSuggestedFocusTasks(maxTasks: number = 3): Promise<Array<{ task: Task; score: TaskScore }>> {
    const prioritized = await this.getPrioritizedTasks();

    // Filter for actionable tasks
    const actionable = prioritized.filter(({ task, score }) => {
      // Skip blocked tasks
      if (task.dependencies && task.dependencies.length > 0) {
        const allDepsComplete = task.dependencies.every(depId => {
          const dep = this.taskCache.get(depId);
          return dep?.status === 'completed';
        });
        if (!allDepsComplete) return false;
      }

      // Prefer tasks that match current context
      if (this.config.currentContext && task.context) {
        if (!task.context.includes(this.config.currentContext)) return false;
      }

      return score.recommendation === 'do_now' || score.recommendation === 'schedule';
    });

    const suggestions = actionable.slice(0, maxTasks);

    this.emit(DAILY_DRIVER_EVENTS.TASK_SUGGESTION, {
      suggestions: suggestions.map(s => s.task.title),
    });

    return suggestions;
  }

  /**
   * Get quick wins (low effort, high impact tasks)
   */
  async getQuickWins(maxTasks: number = 5): Promise<Array<{ task: Task; score: TaskScore }>> {
    const prioritized = await this.getPrioritizedTasks();

    return prioritized
      .filter(({ task }) => {
        const isQuick = (task.estimatedMinutes ?? 30) <= this.config.quickTaskMinutes;
        const isHighPriority = task.priority === 'critical' || task.priority === 'high';
        return isQuick && isHighPriority;
      })
      .slice(0, maxTasks);
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(): Promise<Array<{ task: Task; score: TaskScore; daysOverdue: number }>> {
    this.ensureProvider();

    const now = Date.now();
    const tasks = await this.provider!.listTasks({
      status: ['pending', 'in_progress'],
      dueBefore: now,
    });

    return tasks.map(task => ({
      task,
      score: this.scoreTask(task),
      daysOverdue: Math.floor((now - (task.dueDate ?? now)) / TIME_CONSTANTS.DAY_MS),
    }));
  }

  /**
   * Get tasks due today
   */
  async getTasksDueToday(): Promise<Array<{ task: Task; score: TaskScore }>> {
    this.ensureProvider();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const tasks = await this.provider!.listTasks({
      status: ['pending', 'in_progress'],
      dueAfter: startOfDay.getTime(),
      dueBefore: endOfDay.getTime(),
    });

    return tasks.map(task => ({
      task,
      score: this.scoreTask(task),
    }));
  }

  /**
   * Estimate task completion time
   */
  estimateCompletionTime(tasks: Task[]): {
    totalMinutes: number;
    workingDays: number;
    breakdown: Array<{ taskId: string; minutes: number }>;
  } {
    const breakdown = tasks.map(task => ({
      taskId: task.id,
      minutes: task.estimatedMinutes ?? 30,
    }));

    const totalMinutes = breakdown.reduce((sum, b) => sum + b.minutes, 0);
    const workingHoursPerDay = 6; // Assume 6 productive hours
    const workingDays = Math.ceil(totalMinutes / (workingHoursPerDay * 60));

    return { totalMinutes, workingDays, breakdown };
  }

  // ==========================================================================
  // Scoring Calculations
  // ==========================================================================

  private calculateUrgencyScore(task: Task): number {
    if (!task.dueDate) return 0.3; // No due date = medium-low urgency

    const now = Date.now();
    const daysUntilDue = (task.dueDate - now) / TIME_CONSTANTS.DAY_MS;

    if (daysUntilDue < 0) return 1; // Overdue
    if (daysUntilDue <= this.config.urgencyThresholds.urgent) return 0.9;
    if (daysUntilDue <= this.config.urgencyThresholds.soon) return 0.7;
    if (daysUntilDue <= this.config.urgencyThresholds.upcoming) return 0.5;
    return 0.2;
  }

  private calculateImportanceScore(task: Task): number {
    const priorityScore = TASK_PRIORITY_WEIGHTS[task.priority] / 4;

    // Boost for tasks with dependencies on them
    let dependencyBoost = 0;
    if (task.subtasks && task.subtasks.length > 0) {
      dependencyBoost = 0.1;
    }

    return Math.min(1, priorityScore + dependencyBoost);
  }

  private calculateEffortScore(task: Task): number {
    const minutes = task.estimatedMinutes ?? 30;

    // Favor quick tasks (higher score = better)
    if (minutes <= this.config.quickTaskMinutes) return 0.9;
    if (minutes <= 30) return 0.7;
    if (minutes <= 60) return 0.5;
    if (minutes <= this.config.longTaskMinutes) return 0.3;
    return 0.1;
  }

  private calculateContextScore(task: Task): number {
    if (!this.config.currentContext || !task.context) return 0.5;

    if (task.context.includes(this.config.currentContext)) return 1;
    if (task.context.includes('anywhere')) return 0.8;
    return 0.2;
  }

  private calculateDependencyScore(task: Task): number {
    if (!task.dependencies || task.dependencies.length === 0) return 1;

    // Check if dependencies are complete
    const completedDeps = task.dependencies.filter(depId => {
      const dep = this.taskCache.get(depId);
      return dep?.status === 'completed';
    });

    return completedDeps.length / task.dependencies.length;
  }

  private calculateEnergyScore(task: Task): number {
    if (!this.config.currentEnergy) return 0.5;

    const taskEnergy = TASK_ENERGY_WEIGHTS[task.energyRequired];
    const currentEnergy = TASK_ENERGY_WEIGHTS[this.config.currentEnergy];

    // Match energy levels (high energy task when we have high energy = good)
    if (currentEnergy >= taskEnergy) return 1;
    if (currentEnergy === taskEnergy - 1) return 0.6;
    return 0.3;
  }

  private getRecommendation(
    score: number,
    task: Task
  ): TaskScore['recommendation'] {
    // Check for blocked tasks
    if (task.dependencies && task.dependencies.length > 0) {
      const allDepsComplete = task.dependencies.every(depId => {
        const dep = this.taskCache.get(depId);
        return dep?.status === 'completed';
      });
      if (!allDepsComplete) return 'defer';
    }

    // Check Eisenhower matrix
    const isUrgent = task.dueDate && (task.dueDate - Date.now()) < this.config.urgencyThresholds.soon * TIME_CONSTANTS.DAY_MS;
    const isImportant = task.priority === 'critical' || task.priority === 'high';

    if (isUrgent && isImportant) return 'do_now';
    if (!isUrgent && isImportant) return 'schedule';
    if (isUrgent && !isImportant) return 'delegate';
    if (!isUrgent && !isImportant && score < 30) return 'eliminate';

    // Score-based recommendation
    if (score >= TASK_RECOMMENDATIONS.DO_NOW.threshold) return 'do_now';
    if (score >= TASK_RECOMMENDATIONS.SCHEDULE.threshold) return 'schedule';
    if (score >= TASK_RECOMMENDATIONS.DELEGATE.threshold) return 'delegate';
    if (score >= TASK_RECOMMENDATIONS.DEFER.threshold) return 'defer';
    return 'eliminate';
  }

  private generateReasoning(
    task: Task,
    breakdown: TaskScore['breakdown'],
    recommendation: TaskScore['recommendation']
  ): string {
    const reasons: string[] = [];

    if (breakdown.urgency > 0.8) {
      if (task.dueDate && task.dueDate < Date.now()) {
        reasons.push('This task is overdue');
      } else {
        reasons.push('Due soon');
      }
    }

    if (breakdown.importance > 0.7) {
      reasons.push('High priority');
    }

    if (breakdown.effort > 0.8) {
      reasons.push('Quick win opportunity');
    }

    if (breakdown.context === 1) {
      reasons.push('Matches current context');
    } else if (breakdown.context < 0.3) {
      reasons.push('Context mismatch');
    }

    if (breakdown.dependencies < 1 && task.dependencies) {
      reasons.push('Waiting on dependencies');
    }

    if (breakdown.energy === 1) {
      reasons.push('Good energy match');
    } else if (breakdown.energy < 0.4) {
      reasons.push('Energy level mismatch');
    }

    const recommendationLabels: Record<string, string> = {
      do_now: 'Do this now',
      schedule: 'Schedule for focused time',
      delegate: 'Consider delegating',
      defer: 'Defer to later',
      eliminate: 'Reconsider if needed',
    };

    return `${recommendationLabels[recommendation]}. ${reasons.join('. ')}.`;
  }

  private ensureProvider(): void {
    if (!this.provider) {
      throw new DailyDriverError(
        'CONFIGURATION_ERROR',
        'Task provider not configured'
      );
    }
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTaskScorer(config?: Partial<TaskScorerConfig>): TaskScorer {
  return new TaskScorer(config);
}
