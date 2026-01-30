/**
 * Weekly Review
 *
 * Weekly productivity review and insights generator
 */

import type {
  WeeklyReview,
  WeeklySummary,
  Accomplishment,
  ReviewInsight,
  GoalProgress,
  ReviewRecommendation,
  Task,
  CalendarEvent,
} from './types.js';
import type { CalendarManager } from './calendar-manager.js';
import type { TaskScorer } from './task-scorer.js';
import type { InboxZeroManager } from './inbox-zero.js';
import {
  DAILY_DRIVER_EVENTS,
  WEEKLY_REVIEW_DEFAULTS,
  PRODUCTIVITY_SCORE_WEIGHTS,
  INSIGHT_CATEGORIES,
  TIME_CONSTANTS,
  getStartOfWeek,
  getEndOfWeek,
  formatDuration,
} from './constants.js';

// =============================================================================
// Weekly Review Config
// =============================================================================

export interface WeeklyReviewConfig {
  /** Calendar manager */
  calendarManager?: CalendarManager;
  /** Task scorer */
  taskScorer?: TaskScorer;
  /** Inbox manager */
  inboxManager?: InboxZeroManager;
  /** Goal tracking callback */
  getGoalProgress?: () => Promise<GoalProgress[]>;
  /** Historical data callback for trends */
  getHistoricalData?: (weeks: number) => Promise<WeeklySummary[]>;
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: WeeklyReviewConfig = {};

// =============================================================================
// Weekly Review Generator
// =============================================================================

export class WeeklyReviewGenerator {
  private readonly config: WeeklyReviewConfig;

  constructor(config?: Partial<WeeklyReviewConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate weekly review
   */
  async generate(weekStart?: number): Promise<WeeklyReview> {
    const start = getStartOfWeek(weekStart);
    const end = getEndOfWeek(weekStart);

    const [summary, accomplishments, goals] = await Promise.all([
      this.generateSummary(start, end),
      this.getAccomplishments(start, end),
      this.getGoalProgress(),
    ]);

    const insights = await this.generateInsights(summary);
    const recommendations = this.generateRecommendations(summary, insights, goals);
    const nextWeekFocus = this.generateNextWeekFocus(summary, goals, recommendations);

    const review: WeeklyReview = {
      weekStart: start,
      weekEnd: end,
      summary,
      accomplishments,
      insights,
      goals,
      nextWeekFocus,
      recommendations,
    };

    this.emit(DAILY_DRIVER_EVENTS.WEEKLY_REVIEW_GENERATED, { review });

    return review;
  }

  /**
   * Format review as text
   */
  formatAsText(review: WeeklyReview): string {
    const lines: string[] = [];
    const weekRange = `${new Date(review.weekStart).toLocaleDateString()} - ${new Date(review.weekEnd).toLocaleDateString()}`;

    lines.push(`📊 Weekly Review: ${weekRange}`);
    lines.push('='.repeat(50));
    lines.push('');

    // Summary
    lines.push('📈 Summary');
    lines.push('-'.repeat(30));
    lines.push(`  Tasks completed: ${review.summary.tasksCompleted}`);
    lines.push(`  Tasks created: ${review.summary.tasksCreated}`);
    lines.push(`  Meetings attended: ${review.summary.meetingsAttended} (${formatDuration(review.summary.meetingHours * 60)})`);
    lines.push(`  Focus time: ${formatDuration(review.summary.focusHours * 60)}`);
    lines.push(`  Productivity score: ${review.summary.productivityScore}/100`);
    lines.push('');

    // Accomplishments
    if (review.accomplishments.length > 0) {
      lines.push('🏆 Accomplishments');
      lines.push('-'.repeat(30));
      for (const acc of review.accomplishments) {
        const impactIcon = acc.impact === 'high' ? '⭐' : acc.impact === 'medium' ? '•' : '○';
        lines.push(`  ${impactIcon} ${acc.title}`);
        if (acc.description) {
          lines.push(`    ${acc.description}`);
        }
      }
      lines.push('');
    }

    // Insights
    if (review.insights.length > 0) {
      lines.push('💡 Insights');
      lines.push('-'.repeat(30));
      for (const insight of review.insights) {
        const trendIcon = insight.trend === 'improving' ? '📈' : insight.trend === 'declining' ? '📉' : '➡️';
        lines.push(`  ${trendIcon} ${insight.insight}`);
        if (insight.suggestion) {
          lines.push(`    → ${insight.suggestion}`);
        }
      }
      lines.push('');
    }

    // Goals
    if (review.goals.length > 0) {
      lines.push('🎯 Goal Progress');
      lines.push('-'.repeat(30));
      for (const goal of review.goals) {
        const progressBar = this.createProgressBar(goal.progress, goal.target);
        const status = goal.onTrack ? '✅' : '⚠️';
        lines.push(`  ${status} ${goal.title}: ${progressBar} ${goal.progress}/${goal.target} ${goal.unit}`);
      }
      lines.push('');
    }

    // Recommendations
    if (review.recommendations.length > 0) {
      lines.push('📋 Recommendations');
      lines.push('-'.repeat(30));
      for (const rec of review.recommendations) {
        const priorityIcon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
        lines.push(`  ${priorityIcon} ${rec.recommendation}`);
      }
      lines.push('');
    }

    // Next week focus
    if (review.nextWeekFocus.length > 0) {
      lines.push('🎯 Next Week Focus');
      lines.push('-'.repeat(30));
      for (const focus of review.nextWeekFocus) {
        lines.push(`  • ${focus}`);
      }
    }

    return lines.join('\n');
  }

  // ==========================================================================
  // Summary Generation
  // ==========================================================================

  private async generateSummary(start: number, end: number): Promise<WeeklySummary> {
    let tasksCompleted = 0;
    let tasksCreated = 0;
    let tasksOverdue = 0;
    let meetingsAttended = 0;
    let meetingHours = 0;
    let emailsSent = 0;
    let emailsReceived = 0;
    let focusHours = 0;

    // Get calendar data
    if (this.config.calendarManager) {
      try {
        const calSummary = await this.config.calendarManager.getCalendarSummary(start, end);
        meetingsAttended = calSummary.totalEvents;
        meetingHours = calSummary.totalMeetingHours;
        focusHours = calSummary.focusHoursAvailable;
      } catch {
        // Ignore errors
      }
    }

    // Get task data
    if (this.config.taskScorer) {
      try {
        const prioritized = await this.config.taskScorer.getPrioritizedTasks();
        const overdue = await this.config.taskScorer.getOverdueTasks();

        // Count completed tasks (would need historical tracking)
        tasksCompleted = prioritized.filter(p => p.task.status === 'completed').length;
        tasksCreated = prioritized.length;
        tasksOverdue = overdue.length;
      } catch {
        // Ignore errors
      }
    }

    // Get email data
    if (this.config.inboxManager) {
      try {
        const stats = await this.config.inboxManager.getStats();
        emailsReceived = stats.total;
        // Would need to track sent emails
      } catch {
        // Ignore errors
      }
    }

    const productivityScore = this.calculateProductivityScore({
      tasksCompleted,
      tasksCreated,
      meetingsAttended,
      meetingHours,
      focusHours,
      emailsReceived,
    });

    return {
      tasksCompleted,
      tasksCreated,
      tasksOverdue,
      meetingsAttended,
      meetingHours,
      emailsSent,
      emailsReceived,
      focusHours,
      productivityScore,
    };
  }

  private calculateProductivityScore(data: {
    tasksCompleted: number;
    tasksCreated: number;
    meetingsAttended: number;
    meetingHours: number;
    focusHours: number;
    emailsReceived: number;
  }): number {
    let score = 50; // Base score

    // Task completion ratio
    if (data.tasksCreated > 0) {
      const completionRate = data.tasksCompleted / data.tasksCreated;
      score += (completionRate * 20 * PRODUCTIVITY_SCORE_WEIGHTS.tasksCompleted);
    }

    // Focus time (target: 20 hours per week)
    const focusTimeRatio = Math.min(data.focusHours / 20, 1);
    score += (focusTimeRatio * 20 * PRODUCTIVITY_SCORE_WEIGHTS.focusTime);

    // Meeting efficiency (less is better, target: < 10 hours)
    const meetingEfficiency = Math.max(0, 1 - (data.meetingHours / 40));
    score += (meetingEfficiency * 20 * PRODUCTIVITY_SCORE_WEIGHTS.meetingEfficiency);

    return Math.round(Math.min(100, Math.max(0, score)));
  }

  // ==========================================================================
  // Accomplishments
  // ==========================================================================

  private async getAccomplishments(start: number, end: number): Promise<Accomplishment[]> {
    const accomplishments: Accomplishment[] = [];

    // Get completed tasks
    if (this.config.taskScorer) {
      try {
        const tasks = await this.config.taskScorer.getPrioritizedTasks();
        const completed = tasks.filter(t =>
          t.task.status === 'completed' &&
          t.task.completedAt &&
          t.task.completedAt >= start &&
          t.task.completedAt <= end
        );

        for (const { task } of completed.slice(0, 10)) {
          accomplishments.push({
            type: 'task',
            title: task.title,
            description: task.description,
            completedAt: task.completedAt!,
            impact: task.priority === 'critical' ? 'high' : task.priority === 'high' ? 'medium' : 'low',
          });
        }
      } catch {
        // Ignore errors
      }
    }

    // Sort by impact
    accomplishments.sort((a, b) => {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      return impactOrder[a.impact] - impactOrder[b.impact];
    });

    return accomplishments.slice(0, WEEKLY_REVIEW_DEFAULTS.MIN_ACCOMPLISHMENTS * 2);
  }

  // ==========================================================================
  // Insights
  // ==========================================================================

  private async generateInsights(summary: WeeklySummary): Promise<ReviewInsight[]> {
    const insights: ReviewInsight[] = [];

    // Get historical data for trends
    let historicalData: WeeklySummary[] = [];
    if (this.config.getHistoricalData) {
      try {
        historicalData = await this.config.getHistoricalData(4);
      } catch {
        // Ignore errors
      }
    }

    // Productivity insights
    if (summary.productivityScore >= 70) {
      insights.push({
        category: 'productivity',
        insight: 'Strong productivity week - you\'re maintaining good momentum',
        trend: 'improving',
      });
    } else if (summary.productivityScore < 50) {
      insights.push({
        category: 'productivity',
        insight: 'Productivity dipped this week',
        trend: 'declining',
        suggestion: 'Review what blocked your progress and plan adjustments',
      });
    }

    // Meeting load insights
    if (summary.meetingHours > 20) {
      insights.push({
        category: 'time_management',
        insight: `Heavy meeting week (${formatDuration(summary.meetingHours * 60)})`,
        trend: 'declining',
        suggestion: 'Consider declining non-essential meetings next week',
      });
    } else if (summary.meetingHours < 5 && summary.tasksCompleted > 10) {
      insights.push({
        category: 'time_management',
        insight: 'Great balance between meetings and focused work',
        trend: 'improving',
      });
    }

    // Focus time insights
    if (summary.focusHours >= 15) {
      insights.push({
        category: 'focus',
        insight: 'Excellent focus time this week',
        trend: 'improving',
      });
    } else if (summary.focusHours < 10) {
      insights.push({
        category: 'focus',
        insight: 'Limited focus time available',
        trend: 'declining',
        suggestion: 'Block dedicated focus time slots in your calendar',
      });
    }

    // Task completion insights
    if (summary.tasksOverdue > 5) {
      insights.push({
        category: 'productivity',
        insight: `${summary.tasksOverdue} overdue tasks need attention`,
        trend: 'declining',
        suggestion: 'Review and reschedule overdue tasks',
      });
    }

    this.emit(DAILY_DRIVER_EVENTS.WEEKLY_INSIGHTS, { insights });

    return insights;
  }

  // ==========================================================================
  // Goals & Recommendations
  // ==========================================================================

  private async getGoalProgress(): Promise<GoalProgress[]> {
    if (this.config.getGoalProgress) {
      try {
        return await this.config.getGoalProgress();
      } catch {
        return [];
      }
    }
    return [];
  }

  private generateRecommendations(
    summary: WeeklySummary,
    insights: ReviewInsight[],
    goals: GoalProgress[]
  ): ReviewRecommendation[] {
    const recommendations: ReviewRecommendation[] = [];

    // Based on insights
    for (const insight of insights) {
      if (insight.suggestion) {
        recommendations.push({
          priority: insight.trend === 'declining' ? 'high' : 'medium',
          category: insight.category,
          recommendation: insight.suggestion,
          actionable: true,
        });
      }
    }

    // Based on goals
    for (const goal of goals) {
      if (!goal.onTrack) {
        recommendations.push({
          priority: 'high',
          category: 'goals',
          recommendation: `Focus on "${goal.title}" - currently behind target`,
          actionable: true,
          relatedTasks: [],
        });
      }
    }

    // General recommendations
    if (summary.meetingHours > 15 && summary.focusHours < 15) {
      recommendations.push({
        priority: 'medium',
        category: 'time_management',
        recommendation: 'Schedule meeting-free blocks to protect focus time',
        actionable: true,
      });
    }

    if (summary.tasksCompleted < summary.tasksCreated * 0.5) {
      recommendations.push({
        priority: 'medium',
        category: 'productivity',
        recommendation: 'Review task list for items to delegate or eliminate',
        actionable: true,
      });
    }

    return recommendations.slice(0, WEEKLY_REVIEW_DEFAULTS.MAX_RECOMMENDATIONS);
  }

  private generateNextWeekFocus(
    summary: WeeklySummary,
    goals: GoalProgress[],
    recommendations: ReviewRecommendation[]
  ): string[] {
    const focus: string[] = [];

    // Add goal-related focus
    for (const goal of goals.filter(g => !g.onTrack).slice(0, 2)) {
      focus.push(`Get back on track with "${goal.title}"`);
    }

    // Add high-priority recommendations
    for (const rec of recommendations.filter(r => r.priority === 'high').slice(0, 2)) {
      focus.push(rec.recommendation);
    }

    // Add positive reinforcement
    if (summary.productivityScore >= 70) {
      focus.push('Maintain momentum from this productive week');
    }

    // Default focuses
    if (focus.length === 0) {
      focus.push('Continue building on your progress');
      focus.push('Protect focus time for deep work');
    }

    return focus.slice(0, 5);
  }

  private createProgressBar(current: number, target: number): string {
    const percentage = Math.min(100, Math.round((current / target) * 100));
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createWeeklyReviewGenerator(config?: Partial<WeeklyReviewConfig>): WeeklyReviewGenerator {
  return new WeeklyReviewGenerator(config);
}
