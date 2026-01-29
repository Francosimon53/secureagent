/**
 * Weekly Review Service
 *
 * Generates comprehensive weekly productivity reviews.
 */

import type {
  WeeklyReviewData,
  WeeklyReviewSummary,
  TaskMetrics,
  CalendarMetrics,
  EmailMetrics,
  TodoItem,
  CalendarEvent,
  TodoPriority,
  TodoContext,
} from '../types.js';
import type { WeeklyReviewConfig } from '../config.js';
import type { CalendarProvider } from '../providers/calendar.js';
import type { EmailProvider } from '../providers/email.js';
import type { TodoStore } from '../stores/productivity-store.js';
import {
  generateReport,
  generateInsights,
  generateSuggestions,
  type ReportFormat,
} from './report-generator.js';

// Re-export report generator
export { generateReport, generateInsights, generateSuggestions, type ReportFormat };

/**
 * Provider configuration for weekly review
 */
export interface WeeklyReviewProviders {
  calendar?: CalendarProvider;
  email?: EmailProvider;
  todoStore: TodoStore;
}

/**
 * Weekly Review Service
 */
export class WeeklyReviewService {
  private readonly deliveryDay: 'sunday' | 'monday';
  private readonly deliveryTime: string;
  private readonly includeNextWeekPreview: boolean;

  constructor(
    private readonly providers: WeeklyReviewProviders,
    config?: Partial<WeeklyReviewConfig>
  ) {
    this.deliveryDay = config?.deliveryDay ?? 'sunday';
    this.deliveryTime = config?.deliveryTime ?? '20:00';
    this.includeNextWeekPreview = config?.includeNextWeekPreview ?? true;
  }

  /**
   * Generate a weekly review
   */
  async generateReview(userId: string): Promise<WeeklyReviewData> {
    const { weekStart, weekEnd } = this.getWeekBoundaries();

    // Gather metrics
    const taskMetrics = await this.calculateTaskMetrics(userId, weekStart, weekEnd);
    const calendarMetrics = await this.calculateCalendarMetrics(weekStart, weekEnd);
    const emailMetrics = await this.calculateEmailMetrics();

    // Calculate summary
    const summary = this.calculateSummary(taskMetrics, calendarMetrics, emailMetrics);

    // Generate highlights and suggestions
    const reviewData: WeeklyReviewData = {
      generatedAt: Date.now(),
      userId,
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      summary,
      taskMetrics,
      calendarMetrics,
      emailMetrics,
      highlights: [],
      areasForImprovement: [],
      nextWeekSuggestions: [],
    };

    // Add insights and suggestions
    reviewData.highlights = this.generateHighlights(reviewData);
    reviewData.areasForImprovement = generateInsights(reviewData);
    reviewData.nextWeekSuggestions = generateSuggestions(reviewData);

    return reviewData;
  }

  /**
   * Generate a formatted review report
   */
  async generateFormattedReview(
    userId: string,
    format: ReportFormat = 'markdown'
  ): Promise<string> {
    const data = await this.generateReview(userId);
    return generateReport(data, format);
  }

  /**
   * Get week boundaries (Monday to Sunday)
   */
  private getWeekBoundaries(): { weekStart: number; weekEnd: number } {
    const now = new Date();
    const dayOfWeek = now.getDay();

    // Adjust to get to the start of the week (Monday)
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMonday - 7); // Previous week
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return {
      weekStart: weekStart.getTime(),
      weekEnd: weekEnd.getTime(),
    };
  }

  /**
   * Calculate task metrics for the week
   */
  private async calculateTaskMetrics(
    userId: string,
    weekStart: number,
    weekEnd: number
  ): Promise<TaskMetrics> {
    const allTasks = await this.providers.todoStore.list(userId, {});

    // Filter tasks for the week
    const createdThisWeek = allTasks.filter(
      t => t.createdAt >= weekStart && t.createdAt <= weekEnd
    );

    const completedThisWeek = allTasks.filter(
      t => t.completedAt && t.completedAt >= weekStart && t.completedAt <= weekEnd
    );

    const overdueEnd = allTasks.filter(
      t => t.status !== 'completed' && t.dueDate && t.dueDate <= weekEnd
    );

    // Calculate by priority
    const byPriority: Record<TodoPriority, { completed: number; total: number }> = {
      critical: { completed: 0, total: 0 },
      high: { completed: 0, total: 0 },
      medium: { completed: 0, total: 0 },
      low: { completed: 0, total: 0 },
    };

    for (const task of createdThisWeek) {
      byPriority[task.priority].total++;
    }

    for (const task of completedThisWeek) {
      if (byPriority[task.priority]) {
        byPriority[task.priority].completed++;
      }
    }

    // Calculate by context
    const byContext: Record<TodoContext, { completed: number; total: number }> = {
      work: { completed: 0, total: 0 },
      personal: { completed: 0, total: 0 },
      both: { completed: 0, total: 0 },
    };

    for (const task of createdThisWeek) {
      byContext[task.context].total++;
    }

    for (const task of completedThisWeek) {
      if (byContext[task.context]) {
        byContext[task.context].completed++;
      }
    }

    // Calculate average completion time
    let totalCompletionTime = 0;
    let completionTimeCount = 0;

    for (const task of completedThisWeek) {
      if (task.completedAt) {
        totalCompletionTime += task.completedAt - task.createdAt;
        completionTimeCount++;
      }
    }

    const avgCompletionTime = completionTimeCount > 0
      ? totalCompletionTime / completionTimeCount
      : 0;

    return {
      completed: completedThisWeek.length,
      created: createdThisWeek.length,
      overdue: overdueEnd.length,
      completionRate: createdThisWeek.length > 0
        ? completedThisWeek.length / createdThisWeek.length
        : 0,
      averageCompletionTime: avgCompletionTime,
      byPriority,
      byContext,
    };
  }

  /**
   * Calculate calendar metrics for the week
   */
  private async calculateCalendarMetrics(
    weekStart: number,
    weekEnd: number
  ): Promise<CalendarMetrics> {
    if (!this.providers.calendar) {
      return this.emptyCalendarMetrics();
    }

    const result = await this.providers.calendar.getEvents(weekStart, weekEnd);

    if (!result.success || !result.data) {
      return this.emptyCalendarMetrics();
    }

    const events = result.data.filter(e => e.status !== 'cancelled' && !e.isAllDay);

    // Calculate total meeting hours
    let totalMeetingMs = 0;
    const dayMeetings = new Map<string, number>();

    for (const event of events) {
      const duration = event.endTime - event.startTime;
      totalMeetingMs += duration;

      const day = new Date(event.startTime).toLocaleDateString('en-US', { weekday: 'long' });
      dayMeetings.set(day, (dayMeetings.get(day) ?? 0) + 1);
    }

    // Find busiest day
    let busiestDay = 'Monday';
    let maxMeetings = 0;
    for (const [day, count] of dayMeetings) {
      if (count > maxMeetings) {
        maxMeetings = count;
        busiestDay = day;
      }
    }

    // Calculate focus time (assuming 8 hour workday, 5 days)
    const totalWorkHours = 40;
    const meetingHours = totalMeetingMs / (1000 * 60 * 60);
    const focusHours = Math.max(0, totalWorkHours - meetingHours);

    // Estimate focus blocks (2+ hour gaps between meetings)
    const focusBlocks = this.countFocusBlocks(events);

    return {
      totalMeetings: events.length,
      meetingHours,
      focusBlocks,
      focusHours,
      conflictsDetected: 0, // Would need conflict service
      conflictsResolved: 0,
      busiestDay,
      averageMeetingLength: events.length > 0
        ? totalMeetingMs / events.length / 60000
        : 0,
    };
  }

  /**
   * Count focus blocks (2+ hour gaps)
   */
  private countFocusBlocks(events: CalendarEvent[]): number {
    if (events.length < 2) {
      return events.length === 0 ? 5 : 4; // Assume most days have focus time
    }

    const sorted = [...events].sort((a, b) => a.startTime - b.startTime);
    let focusBlocks = 0;
    const twoHours = 2 * 60 * 60 * 1000;

    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].startTime - sorted[i].endTime;
      if (gap >= twoHours) {
        focusBlocks++;
      }
    }

    return focusBlocks;
  }

  /**
   * Calculate email metrics (placeholder - needs email history)
   */
  private async calculateEmailMetrics(): Promise<EmailMetrics> {
    // Email metrics would require tracking over time
    // For now, return placeholder data
    if (!this.providers.email) {
      return this.emptyEmailMetrics();
    }

    const stats = await this.providers.email.getStats();

    if (!stats.success || !stats.data) {
      return this.emptyEmailMetrics();
    }

    return {
      received: stats.data.total,
      sent: 0, // Would need sent mail tracking
      archived: 0, // Would need action tracking
      inboxZeroAchieved: 0, // Would need daily tracking
      averageResponseTime: 0,
      unsubscribes: 0,
    };
  }

  /**
   * Calculate weekly summary
   */
  private calculateSummary(
    taskMetrics: TaskMetrics,
    calendarMetrics: CalendarMetrics,
    emailMetrics: EmailMetrics
  ): WeeklyReviewSummary {
    return {
      tasksCompleted: taskMetrics.completed,
      tasksCreated: taskMetrics.created,
      completionRate: taskMetrics.completionRate,
      meetingHours: calendarMetrics.meetingHours,
      focusTimeHours: calendarMetrics.focusHours,
      emailsProcessed: emailMetrics.received + emailMetrics.archived,
      responseRate: 0, // Would need response tracking
    };
  }

  /**
   * Generate highlights based on data
   */
  private generateHighlights(data: WeeklyReviewData): string[] {
    const highlights: string[] = [];

    if (data.taskMetrics.completionRate >= 0.9) {
      highlights.push('Outstanding task completion rate of 90%+!');
    } else if (data.taskMetrics.completionRate >= 0.8) {
      highlights.push('Great task completion rate this week.');
    }

    if (data.taskMetrics.completed >= 10) {
      highlights.push(`Completed ${data.taskMetrics.completed} tasks!`);
    }

    if (data.calendarMetrics.focusHours >= 15) {
      highlights.push('Excellent focus time - over 15 hours of deep work.');
    }

    if (data.emailMetrics.inboxZeroAchieved > 0) {
      highlights.push(`Achieved inbox zero ${data.emailMetrics.inboxZeroAchieved} times!`);
    }

    if (data.calendarMetrics.conflictsResolved > 0) {
      highlights.push(`Resolved ${data.calendarMetrics.conflictsResolved} scheduling conflicts.`);
    }

    // If no highlights, add a generic one
    if (highlights.length === 0) {
      highlights.push('Another productive week completed!');
    }

    return highlights;
  }

  /**
   * Get cron expression for weekly delivery
   */
  getCronExpression(): string {
    const [hour, minute] = this.deliveryTime.split(':').map(Number);
    const dayNum = this.deliveryDay === 'sunday' ? 0 : 1;
    return `${minute} ${hour} * * ${dayNum}`;
  }

  /**
   * Empty calendar metrics
   */
  private emptyCalendarMetrics(): CalendarMetrics {
    return {
      totalMeetings: 0,
      meetingHours: 0,
      focusBlocks: 0,
      focusHours: 0,
      conflictsDetected: 0,
      conflictsResolved: 0,
      busiestDay: 'N/A',
      averageMeetingLength: 0,
    };
  }

  /**
   * Empty email metrics
   */
  private emptyEmailMetrics(): EmailMetrics {
    return {
      received: 0,
      sent: 0,
      archived: 0,
      inboxZeroAchieved: 0,
      averageResponseTime: 0,
      unsubscribes: 0,
    };
  }
}

/**
 * Create a weekly review service
 */
export function createWeeklyReviewService(
  providers: WeeklyReviewProviders,
  config?: Partial<WeeklyReviewConfig>
): WeeklyReviewService {
  return new WeeklyReviewService(providers, config);
}
