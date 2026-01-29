/**
 * Eisenhower Matrix Implementation
 *
 * Task categorization based on urgency and importance.
 */

import type { TodoItem, TodoPriority } from '../types.js';

/**
 * Eisenhower quadrant types
 */
export type EisenhowerQuadrant =
  | 'do-first'      // Urgent + Important: Do immediately
  | 'schedule'      // Not Urgent + Important: Schedule for later
  | 'delegate'      // Urgent + Not Important: Delegate if possible
  | 'eliminate';    // Not Urgent + Not Important: Consider eliminating

/**
 * Eisenhower classification result
 */
export interface EisenhowerClassification {
  quadrant: EisenhowerQuadrant;
  urgencyScore: number;
  importanceScore: number;
  recommendation: string;
}

/**
 * Thresholds for classification
 */
export interface EisenhowerThresholds {
  urgencyThreshold: number;
  importanceThreshold: number;
  urgentHours: number;
}

const DEFAULT_THRESHOLDS: EisenhowerThresholds = {
  urgencyThreshold: 0.5,
  importanceThreshold: 0.5,
  urgentHours: 48,
};

/**
 * Classify a task using the Eisenhower Matrix
 */
export function classifyTask(
  task: TodoItem,
  thresholds: Partial<EisenhowerThresholds> = {}
): EisenhowerClassification {
  const config = { ...DEFAULT_THRESHOLDS, ...thresholds };

  const urgencyScore = calculateUrgency(task, config.urgentHours);
  const importanceScore = calculateImportance(task);

  const isUrgent = urgencyScore >= config.urgencyThreshold;
  const isImportant = importanceScore >= config.importanceThreshold;

  let quadrant: EisenhowerQuadrant;
  let recommendation: string;

  if (isUrgent && isImportant) {
    quadrant = 'do-first';
    recommendation = 'Handle this task immediately. It is both urgent and important.';
  } else if (!isUrgent && isImportant) {
    quadrant = 'schedule';
    recommendation = 'Schedule dedicated time for this task. It is important but not urgent.';
  } else if (isUrgent && !isImportant) {
    quadrant = 'delegate';
    recommendation = 'Consider delegating this task or handling it quickly. It is urgent but not important.';
  } else {
    quadrant = 'eliminate';
    recommendation = 'Evaluate if this task is necessary. Consider eliminating or postponing it.';
  }

  return {
    quadrant,
    urgencyScore,
    importanceScore,
    recommendation,
  };
}

/**
 * Calculate urgency score based on due date
 */
function calculateUrgency(task: TodoItem, urgentHours: number): number {
  if (!task.dueDate) {
    return 0.2; // Low urgency if no due date
  }

  const now = Date.now();
  const hoursUntilDue = (task.dueDate - now) / (1000 * 60 * 60);

  if (hoursUntilDue <= 0) {
    return 1.0; // Overdue = maximum urgency
  }

  if (hoursUntilDue <= 24) {
    return 0.95; // Due within 24 hours
  }

  if (hoursUntilDue <= urgentHours) {
    // Linear decay from 0.9 to 0.5 over the urgent period
    const progress = hoursUntilDue / urgentHours;
    return 0.9 - (progress * 0.4);
  }

  if (hoursUntilDue <= urgentHours * 3) {
    // Gradual decrease for medium-term tasks
    const progress = (hoursUntilDue - urgentHours) / (urgentHours * 2);
    return 0.5 - (progress * 0.3);
  }

  return 0.2; // Low urgency for far-future tasks
}

/**
 * Calculate importance score based on priority and context
 */
function calculateImportance(task: TodoItem): number {
  const priorityScores: Record<TodoPriority, number> = {
    critical: 1.0,
    high: 0.8,
    medium: 0.5,
    low: 0.2,
  };

  let score = priorityScores[task.priority] ?? 0.5;

  // Boost for work context (typically more important)
  if (task.context === 'work') {
    score = Math.min(score + 0.1, 1.0);
  }

  // Boost for tasks with subtasks (typically more complex/important)
  if (task.subtasks && task.subtasks.length > 0) {
    score = Math.min(score + 0.05, 1.0);
  }

  return score;
}

/**
 * Group tasks by Eisenhower quadrant
 */
export function groupByQuadrant(
  tasks: TodoItem[],
  thresholds?: Partial<EisenhowerThresholds>
): Map<EisenhowerQuadrant, TodoItem[]> {
  const groups = new Map<EisenhowerQuadrant, TodoItem[]>([
    ['do-first', []],
    ['schedule', []],
    ['delegate', []],
    ['eliminate', []],
  ]);

  for (const task of tasks) {
    const classification = classifyTask(task, thresholds);
    groups.get(classification.quadrant)!.push(task);
  }

  return groups;
}

/**
 * Get tasks that should be done first (urgent + important)
 */
export function getDoFirstTasks(
  tasks: TodoItem[],
  thresholds?: Partial<EisenhowerThresholds>
): TodoItem[] {
  return tasks.filter(task => {
    const classification = classifyTask(task, thresholds);
    return classification.quadrant === 'do-first';
  });
}

/**
 * Get tasks that should be scheduled (not urgent + important)
 */
export function getScheduleTasks(
  tasks: TodoItem[],
  thresholds?: Partial<EisenhowerThresholds>
): TodoItem[] {
  return tasks.filter(task => {
    const classification = classifyTask(task, thresholds);
    return classification.quadrant === 'schedule';
  });
}

/**
 * Generate a summary of the Eisenhower distribution
 */
export function generateEisenhowerSummary(
  tasks: TodoItem[],
  thresholds?: Partial<EisenhowerThresholds>
): EisenhowerSummary {
  const groups = groupByQuadrant(tasks, thresholds);

  return {
    total: tasks.length,
    doFirst: groups.get('do-first')!.length,
    schedule: groups.get('schedule')!.length,
    delegate: groups.get('delegate')!.length,
    eliminate: groups.get('eliminate')!.length,
    healthScore: calculateHealthScore(groups),
    recommendations: generateRecommendations(groups),
  };
}

/**
 * Summary of Eisenhower distribution
 */
export interface EisenhowerSummary {
  total: number;
  doFirst: number;
  schedule: number;
  delegate: number;
  eliminate: number;
  healthScore: number;
  recommendations: string[];
}

/**
 * Calculate a health score based on distribution
 * Ideal: Most tasks in "schedule" quadrant, few in "do-first"
 */
function calculateHealthScore(groups: Map<EisenhowerQuadrant, TodoItem[]>): number {
  const total = Array.from(groups.values()).reduce((sum, arr) => sum + arr.length, 0);
  if (total === 0) return 1.0;

  const doFirstPct = groups.get('do-first')!.length / total;
  const schedulePct = groups.get('schedule')!.length / total;
  const eliminatePct = groups.get('eliminate')!.length / total;

  // Penalize for too many urgent tasks
  let score = 1.0;
  score -= doFirstPct * 0.5; // High penalty for urgent+important
  score += schedulePct * 0.3; // Reward for scheduled important tasks
  score -= eliminatePct * 0.2; // Small penalty for elimination candidates

  return Math.max(0, Math.min(1, score));
}

/**
 * Generate recommendations based on distribution
 */
function generateRecommendations(groups: Map<EisenhowerQuadrant, TodoItem[]>): string[] {
  const recommendations: string[] = [];
  const total = Array.from(groups.values()).reduce((sum, arr) => sum + arr.length, 0);

  if (total === 0) {
    return ['No tasks to analyze.'];
  }

  const doFirstCount = groups.get('do-first')!.length;
  const scheduleCount = groups.get('schedule')!.length;
  const delegateCount = groups.get('delegate')!.length;
  const eliminateCount = groups.get('eliminate')!.length;

  if (doFirstCount > total * 0.4) {
    recommendations.push(
      `${doFirstCount} tasks require immediate attention. Consider breaking them down or delegating some.`
    );
  }

  if (scheduleCount > total * 0.5) {
    recommendations.push(
      `Good job! ${scheduleCount} tasks are important but not urgent. Block time to work on these.`
    );
  }

  if (delegateCount > total * 0.3) {
    recommendations.push(
      `${delegateCount} tasks are urgent but not important. Look for opportunities to delegate.`
    );
  }

  if (eliminateCount > total * 0.2) {
    recommendations.push(
      `${eliminateCount} tasks may not be necessary. Review and eliminate if possible.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('Your task distribution looks balanced.');
  }

  return recommendations;
}
