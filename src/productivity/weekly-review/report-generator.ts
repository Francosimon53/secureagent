/**
 * Weekly Review Report Generator
 *
 * Generates formatted weekly review reports.
 */

import type {
  WeeklyReviewData,
  TaskMetrics,
  CalendarMetrics,
  EmailMetrics,
} from '../types.js';

/**
 * Report format options
 */
export type ReportFormat = 'markdown' | 'html' | 'text';

/**
 * Generate a weekly review report
 */
export function generateReport(data: WeeklyReviewData, format: ReportFormat = 'markdown'): string {
  switch (format) {
    case 'markdown':
      return generateMarkdownReport(data);
    case 'html':
      return generateHTMLReport(data);
    case 'text':
      return generateTextReport(data);
    default:
      return generateMarkdownReport(data);
  }
}

// =============================================================================
// Markdown Report
// =============================================================================

function generateMarkdownReport(data: WeeklyReviewData): string {
  const lines: string[] = [];

  // Header
  lines.push('# Weekly Review');
  lines.push(`*Week of ${formatDateRange(data.weekStartDate, data.weekEndDate)}*`);
  lines.push('');

  // Summary Section
  lines.push('## Summary');
  lines.push('');
  lines.push(generateSummaryMarkdown(data));
  lines.push('');

  // Tasks Section
  lines.push('## Task Performance');
  lines.push('');
  lines.push(generateTaskMetricsMarkdown(data.taskMetrics));
  lines.push('');

  // Calendar Section
  lines.push('## Calendar Analysis');
  lines.push('');
  lines.push(generateCalendarMetricsMarkdown(data.calendarMetrics));
  lines.push('');

  // Email Section
  lines.push('## Email Management');
  lines.push('');
  lines.push(generateEmailMetricsMarkdown(data.emailMetrics));
  lines.push('');

  // Highlights
  if (data.highlights.length > 0) {
    lines.push('## Highlights');
    lines.push('');
    for (const highlight of data.highlights) {
      lines.push(`- ${highlight}`);
    }
    lines.push('');
  }

  // Areas for Improvement
  if (data.areasForImprovement.length > 0) {
    lines.push('## Areas for Improvement');
    lines.push('');
    for (const area of data.areasForImprovement) {
      lines.push(`- ${area}`);
    }
    lines.push('');
  }

  // Next Week Suggestions
  if (data.nextWeekSuggestions.length > 0) {
    lines.push('## Next Week');
    lines.push('');
    for (const suggestion of data.nextWeekSuggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function generateSummaryMarkdown(data: WeeklyReviewData): string {
  const s = data.summary;
  const lines: string[] = [];

  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Tasks Completed | ${s.tasksCompleted} |`);
  lines.push(`| Tasks Created | ${s.tasksCreated} |`);
  lines.push(`| Completion Rate | ${(s.completionRate * 100).toFixed(1)}% |`);
  lines.push(`| Meeting Hours | ${s.meetingHours.toFixed(1)} |`);
  lines.push(`| Focus Time | ${s.focusTimeHours.toFixed(1)} hours |`);
  lines.push(`| Emails Processed | ${s.emailsProcessed} |`);

  return lines.join('\n');
}

function generateTaskMetricsMarkdown(metrics: TaskMetrics): string {
  const lines: string[] = [];

  // Progress bar
  const completionPct = Math.round(metrics.completionRate * 100);
  const filled = Math.round(completionPct / 5);
  const progressBar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  lines.push(`**Completion Rate:** [${progressBar}] ${completionPct}%`);
  lines.push('');

  lines.push(`- Completed: ${metrics.completed} tasks`);
  lines.push(`- Created: ${metrics.created} tasks`);
  lines.push(`- Overdue: ${metrics.overdue} tasks`);
  lines.push(`- Avg. Completion Time: ${formatDuration(metrics.averageCompletionTime)}`);
  lines.push('');

  // By priority
  lines.push('**By Priority:**');
  for (const [priority, data] of Object.entries(metrics.byPriority)) {
    const pct = data.total > 0 ? ((data.completed / data.total) * 100).toFixed(0) : 0;
    lines.push(`- ${capitalize(priority)}: ${data.completed}/${data.total} (${pct}%)`);
  }

  return lines.join('\n');
}

function generateCalendarMetricsMarkdown(metrics: CalendarMetrics): string {
  const lines: string[] = [];

  lines.push(`- Total Meetings: ${metrics.totalMeetings}`);
  lines.push(`- Meeting Hours: ${metrics.meetingHours.toFixed(1)}`);
  lines.push(`- Focus Blocks: ${metrics.focusBlocks}`);
  lines.push(`- Focus Hours: ${metrics.focusHours.toFixed(1)}`);
  lines.push(`- Avg. Meeting Length: ${Math.round(metrics.averageMeetingLength)} min`);
  lines.push(`- Busiest Day: ${metrics.busiestDay}`);
  lines.push('');

  if (metrics.conflictsDetected > 0) {
    lines.push(`⚠️ **Conflicts:** ${metrics.conflictsDetected} detected, ${metrics.conflictsResolved} resolved`);
  }

  return lines.join('\n');
}

function generateEmailMetricsMarkdown(metrics: EmailMetrics): string {
  const lines: string[] = [];

  lines.push(`- Received: ${metrics.received}`);
  lines.push(`- Sent: ${metrics.sent}`);
  lines.push(`- Archived: ${metrics.archived}`);
  lines.push(`- Avg. Response Time: ${formatDuration(metrics.averageResponseTime)}`);

  if (metrics.inboxZeroAchieved > 0) {
    lines.push(`- 🎉 Inbox Zero achieved ${metrics.inboxZeroAchieved} time(s)!`);
  }

  if (metrics.unsubscribes > 0) {
    lines.push(`- Unsubscribed from ${metrics.unsubscribes} mailing list(s)`);
  }

  return lines.join('\n');
}

// =============================================================================
// HTML Report
// =============================================================================

function generateHTMLReport(data: WeeklyReviewData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    h1, h2 { color: #333; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
    .metric-card { background: #f5f5f5; padding: 16px; border-radius: 8px; text-align: center; }
    .metric-value { font-size: 2em; font-weight: bold; color: #1976d2; }
    .metric-label { color: #666; font-size: 0.9em; }
    .progress-bar { background: #e0e0e0; border-radius: 10px; height: 20px; overflow: hidden; }
    .progress-fill { background: #4caf50; height: 100%; transition: width 0.3s; }
    .highlight { background: #e8f5e9; padding: 8px 12px; border-left: 4px solid #4caf50; margin: 8px 0; }
    .improvement { background: #fff3e0; padding: 8px 12px; border-left: 4px solid #ff9800; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; }
  </style>
</head>
<body>
  <h1>Weekly Review</h1>
  <p>${formatDateRange(data.weekStartDate, data.weekEndDate)}</p>

  <div class="summary-grid">
    <div class="metric-card">
      <div class="metric-value">${data.summary.tasksCompleted}</div>
      <div class="metric-label">Tasks Completed</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${data.summary.meetingHours.toFixed(1)}h</div>
      <div class="metric-label">Meeting Hours</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${(data.summary.completionRate * 100).toFixed(0)}%</div>
      <div class="metric-label">Completion Rate</div>
    </div>
  </div>

  <h2>Task Performance</h2>
  <div class="progress-bar">
    <div class="progress-fill" style="width: ${data.taskMetrics.completionRate * 100}%"></div>
  </div>
  <p>${data.taskMetrics.completed} of ${data.taskMetrics.completed + data.taskMetrics.overdue} tasks completed</p>

  <h2>Highlights</h2>
  ${data.highlights.map(h => `<div class="highlight">${h}</div>`).join('')}

  <h2>Areas for Improvement</h2>
  ${data.areasForImprovement.map(a => `<div class="improvement">${a}</div>`).join('')}
</body>
</html>`;
}

// =============================================================================
// Text Report
// =============================================================================

function generateTextReport(data: WeeklyReviewData): string {
  const lines: string[] = [];

  lines.push('WEEKLY REVIEW');
  lines.push(formatDateRange(data.weekStartDate, data.weekEndDate));
  lines.push('');
  lines.push('='.repeat(50));
  lines.push('');

  // Summary
  lines.push('SUMMARY');
  lines.push('-'.repeat(20));
  lines.push(`Tasks Completed: ${data.summary.tasksCompleted}`);
  lines.push(`Completion Rate: ${(data.summary.completionRate * 100).toFixed(1)}%`);
  lines.push(`Meeting Hours: ${data.summary.meetingHours.toFixed(1)}`);
  lines.push(`Focus Time: ${data.summary.focusTimeHours.toFixed(1)} hours`);
  lines.push('');

  // Highlights
  if (data.highlights.length > 0) {
    lines.push('HIGHLIGHTS');
    lines.push('-'.repeat(20));
    for (const highlight of data.highlights) {
      lines.push(`* ${highlight}`);
    }
    lines.push('');
  }

  // Areas for Improvement
  if (data.areasForImprovement.length > 0) {
    lines.push('AREAS FOR IMPROVEMENT');
    lines.push('-'.repeat(20));
    for (const area of data.areasForImprovement) {
      lines.push(`* ${area}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatDateRange(start: number, end: number): string {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

  if (startDate.getFullYear() !== endDate.getFullYear()) {
    return `${startDate.toLocaleDateString('en-US', { ...options, year: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { ...options, year: 'numeric' })}`;
  }

  return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', { ...options, year: 'numeric' })}`;
}

function formatDuration(ms: number): string {
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s`;
  }

  if (ms < 3600000) {
    return `${Math.round(ms / 60000)}m`;
  }

  const hours = Math.floor(ms / 3600000);
  const minutes = Math.round((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate performance insights based on metrics
 */
export function generateInsights(data: WeeklyReviewData): string[] {
  const insights: string[] = [];
  const { taskMetrics, calendarMetrics, summary } = data;

  // Task insights
  if (taskMetrics.completionRate >= 0.8) {
    insights.push('Excellent task completion rate this week!');
  } else if (taskMetrics.completionRate < 0.5) {
    insights.push('Task completion rate was lower than usual. Consider breaking down tasks into smaller pieces.');
  }

  if (taskMetrics.overdue > 5) {
    insights.push(`${taskMetrics.overdue} tasks are overdue. Review and prioritize or reschedule them.`);
  }

  // Calendar insights
  const meetingRatio = calendarMetrics.meetingHours / (calendarMetrics.meetingHours + calendarMetrics.focusHours);
  if (meetingRatio > 0.6) {
    insights.push('More than 60% of your time was in meetings. Consider blocking focus time.');
  }

  if (calendarMetrics.focusBlocks < 3) {
    insights.push('Few focus blocks this week. Try to schedule dedicated deep work time.');
  }

  // Overall insights
  if (summary.focusTimeHours < 10) {
    insights.push('Low focus time this week. Aim for at least 2 hours of focus time per day.');
  }

  return insights;
}

/**
 * Generate improvement suggestions
 */
export function generateSuggestions(data: WeeklyReviewData): string[] {
  const suggestions: string[] = [];
  const { taskMetrics, calendarMetrics, emailMetrics } = data;

  if (taskMetrics.completionRate < 0.7) {
    suggestions.push('Try using the Pomodoro technique to boost task completion.');
  }

  if (calendarMetrics.conflictsDetected > 2) {
    suggestions.push('Review your calendar weekly to prevent scheduling conflicts.');
  }

  if (emailMetrics.inboxZeroAchieved === 0) {
    suggestions.push('Set aside 15 minutes at the end of each day to clear your inbox.');
  }

  if (calendarMetrics.averageMeetingLength > 45) {
    suggestions.push('Consider defaulting to 25 or 50 minute meetings to allow buffer time.');
  }

  return suggestions;
}
