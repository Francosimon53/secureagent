/**
 * Morning Brief
 *
 * Daily briefing generator with schedule, emails, tasks, and highlights
 */

import type {
  MorningBrief,
  MorningBriefPreferences,
  WeatherInfo,
  ScheduleOverview,
  EmailOverview,
  TaskOverview,
  BriefHighlight,
  CalendarEvent,
  EmailSummary,
  Task,
  WeatherProvider,
} from './types.js';
import type { EmailSummarizer } from './email-summarizer.js';
import type { InboxZeroManager } from './inbox-zero.js';
import type { CalendarManager } from './calendar-manager.js';
import type { TaskScorer } from './task-scorer.js';
import {
  DAILY_DRIVER_EVENTS,
  MORNING_BRIEF_DEFAULTS,
  GREETING_TEMPLATES,
  TIME_CONSTANTS,
  getStartOfDay,
  getEndOfDay,
  getTimeOfDay,
} from './constants.js';

// =============================================================================
// Morning Brief Config
// =============================================================================

export interface MorningBriefConfig {
  /** Email summarizer */
  emailSummarizer?: EmailSummarizer;
  /** Inbox manager */
  inboxManager?: InboxZeroManager;
  /** Calendar manager */
  calendarManager?: CalendarManager;
  /** Task scorer */
  taskScorer?: TaskScorer;
  /** Weather provider */
  weatherProvider?: WeatherProvider;
  /** Default preferences */
  defaultPreferences: MorningBriefPreferences;
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_PREFERENCES: MorningBriefPreferences = {
  userId: 'default',
  deliveryTime: MORNING_BRIEF_DEFAULTS.DEFAULT_DELIVERY_TIME,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  includeWeather: true,
  includeMotivationalQuote: true,
  vipContacts: [],
  focusAreas: [],
  customReminders: [],
};

const DEFAULT_CONFIG: MorningBriefConfig = {
  defaultPreferences: DEFAULT_PREFERENCES,
};

// =============================================================================
// Morning Brief Generator
// =============================================================================

export class MorningBriefGenerator {
  private readonly config: MorningBriefConfig;
  private userPreferences = new Map<string, MorningBriefPreferences>();

  constructor(config?: Partial<MorningBriefConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set user preferences
   */
  setPreferences(userId: string, prefs: Partial<MorningBriefPreferences>): void {
    const existing = this.userPreferences.get(userId) ?? { ...this.config.defaultPreferences, userId };
    this.userPreferences.set(userId, { ...existing, ...prefs });
  }

  /**
   * Get user preferences
   */
  getPreferences(userId: string): MorningBriefPreferences {
    return this.userPreferences.get(userId) ?? { ...this.config.defaultPreferences, userId };
  }

  /**
   * Generate morning brief
   */
  async generate(userId: string, date?: number): Promise<MorningBrief> {
    const prefs = this.getPreferences(userId);
    const briefDate = date ?? Date.now();
    const hour = new Date(briefDate).getHours();
    const timeOfDay = getTimeOfDay(hour);

    // Generate components in parallel
    const [weather, schedule, emails, tasks, highlights] = await Promise.all([
      this.getWeather(prefs),
      this.getScheduleOverview(briefDate),
      this.getEmailOverview(prefs),
      this.getTaskOverview(briefDate),
      this.getHighlights(prefs, briefDate),
    ]);

    const greeting = this.generateGreeting(timeOfDay, prefs);
    const reminders = this.generateReminders(prefs, schedule, tasks);
    const motivationalQuote = prefs.includeMotivationalQuote
      ? this.getMotivationalQuote()
      : undefined;

    const brief: MorningBrief = {
      date: briefDate,
      greeting,
      weather,
      schedule,
      emails,
      tasks,
      highlights,
      reminders,
      motivationalQuote,
    };

    this.emit(DAILY_DRIVER_EVENTS.MORNING_BRIEF_GENERATED, { userId, brief });

    return brief;
  }

  /**
   * Format brief as text
   */
  formatAsText(brief: MorningBrief): string {
    const lines: string[] = [];

    lines.push(brief.greeting);
    lines.push('');

    // Weather
    if (brief.weather) {
      lines.push(`🌤️ Weather: ${brief.weather.current.temp}° ${brief.weather.current.condition}`);
      if (brief.weather.alerts?.length) {
        lines.push(`⚠️ ${brief.weather.alerts.join(', ')}`);
      }
      lines.push('');
    }

    // Schedule
    lines.push('📅 Today\'s Schedule:');
    if (brief.schedule.meetingCount === 0) {
      lines.push('  No meetings scheduled - great day for deep work!');
    } else {
      lines.push(`  ${brief.schedule.meetingCount} meetings (${Math.round(brief.schedule.totalMeetingTime / 60)}h)`);
      if (brief.schedule.nextEvent) {
        const time = new Date(brief.schedule.nextEvent.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        lines.push(`  Next: ${brief.schedule.nextEvent.title} at ${time}`);
      }
      if (brief.schedule.conflicts.length > 0) {
        lines.push(`  ⚠️ ${brief.schedule.conflicts.length} scheduling conflict(s)`);
      }
    }
    lines.push('');

    // Emails
    lines.push('📧 Inbox:');
    lines.push(`  ${brief.emails.unreadCount} unread, ${brief.emails.actionRequiredCount} need action`);
    if (brief.emails.topPriority.length > 0) {
      lines.push('  Priority:');
      for (const email of brief.emails.topPriority.slice(0, 3)) {
        lines.push(`    - ${email.summary.substring(0, 60)}...`);
      }
    }
    lines.push('');

    // Tasks
    lines.push('✅ Tasks:');
    if (brief.tasks.overdue.length > 0) {
      lines.push(`  ⚠️ ${brief.tasks.overdue.length} overdue`);
    }
    lines.push(`  ${brief.tasks.dueToday.length} due today`);
    if (brief.tasks.suggestedFocus.length > 0) {
      lines.push('  Suggested focus:');
      for (const task of brief.tasks.suggestedFocus.slice(0, 3)) {
        lines.push(`    - ${task.title}`);
      }
    }
    lines.push('');

    // Highlights
    if (brief.highlights.length > 0) {
      lines.push('⭐ Highlights:');
      for (const highlight of brief.highlights) {
        lines.push(`  ${highlight.icon ?? '•'} ${highlight.title}`);
      }
      lines.push('');
    }

    // Reminders
    if (brief.reminders.length > 0) {
      lines.push('📌 Reminders:');
      for (const reminder of brief.reminders) {
        lines.push(`  - ${reminder}`);
      }
      lines.push('');
    }

    // Quote
    if (brief.motivationalQuote) {
      lines.push('');
      lines.push(`💭 "${brief.motivationalQuote}"`);
    }

    return lines.join('\n');
  }

  // ==========================================================================
  // Component Generators
  // ==========================================================================

  private async getWeather(prefs: MorningBriefPreferences): Promise<WeatherInfo | undefined> {
    if (!prefs.includeWeather || !prefs.weatherLocation || !this.config.weatherProvider) {
      return undefined;
    }

    try {
      const [current, forecast, alerts] = await Promise.all([
        this.config.weatherProvider.getCurrentWeather(prefs.weatherLocation),
        this.config.weatherProvider.getForecast(prefs.weatherLocation, 12),
        this.config.weatherProvider.getAlerts(prefs.weatherLocation),
      ]);

      return {
        location: prefs.weatherLocation,
        current,
        forecast,
        alerts,
      };
    } catch {
      return undefined;
    }
  }

  private async getScheduleOverview(date: number): Promise<ScheduleOverview> {
    if (!this.config.calendarManager) {
      return {
        meetingCount: 0,
        totalMeetingTime: 0,
        focusTimeBlocks: [],
        conflicts: [],
        busyPercentage: 0,
      };
    }

    try {
      const dayOverview = await this.config.calendarManager.getDayOverview(date);
      const focusBlocks = await this.config.calendarManager.findFocusBlocks(date);
      const nextEvent = await this.config.calendarManager.getNextEvent();

      const nonAllDayEvents = dayOverview.events.filter(e => !e.isAllDay);

      return {
        firstEvent: nonAllDayEvents[0],
        nextEvent: nextEvent ?? undefined,
        meetingCount: nonAllDayEvents.length,
        totalMeetingTime: dayOverview.busyTime,
        focusTimeBlocks: focusBlocks.map(b => ({ start: b.start, end: b.end })),
        conflicts: this.config.calendarManager.detectConflicts(dayOverview.events),
        busyPercentage: Math.round((dayOverview.busyTime / (dayOverview.busyTime + dayOverview.freeTime)) * 100),
      };
    } catch {
      return {
        meetingCount: 0,
        totalMeetingTime: 0,
        focusTimeBlocks: [],
        conflicts: [],
        busyPercentage: 0,
      };
    }
  }

  private async getEmailOverview(prefs: MorningBriefPreferences): Promise<EmailOverview> {
    if (!this.config.inboxManager) {
      return {
        unreadCount: 0,
        urgentCount: 0,
        actionRequiredCount: 0,
        topPriority: [],
        vipEmails: [],
      };
    }

    try {
      const stats = await this.config.inboxManager.getStats();
      const byPriority = await this.config.inboxManager.getUnreadByPriority();
      const actionRequired = await this.config.inboxManager.getActionRequired();

      const topPriority: EmailSummary[] = [];
      const vipEmails: EmailSummary[] = [];

      // Get summaries for urgent and high priority emails
      if (this.config.emailSummarizer) {
        const urgentEmails = [...byPriority.urgent, ...byPriority.high].slice(0, MORNING_BRIEF_DEFAULTS.MAX_PRIORITY_EMAILS);
        const summaries = await this.config.emailSummarizer.summarizeMany(urgentEmails);
        topPriority.push(...summaries);

        // Filter VIP emails
        for (const summary of summaries) {
          const email = urgentEmails.find(e => e.id === summary.emailId);
          if (email && prefs.vipContacts.includes(email.from.email.toLowerCase())) {
            vipEmails.push(summary);
          }
        }
      }

      return {
        unreadCount: stats.unread,
        urgentCount: stats.byPriority.urgent,
        actionRequiredCount: stats.actionRequired,
        topPriority,
        vipEmails,
      };
    } catch {
      return {
        unreadCount: 0,
        urgentCount: 0,
        actionRequiredCount: 0,
        topPriority: [],
        vipEmails: [],
      };
    }
  }

  private async getTaskOverview(date: number): Promise<TaskOverview> {
    if (!this.config.taskScorer) {
      return {
        dueToday: [],
        overdue: [],
        highPriority: [],
        suggestedFocus: [],
        completedYesterday: 0,
      };
    }

    try {
      const [dueToday, overdue, suggested] = await Promise.all([
        this.config.taskScorer.getTasksDueToday(),
        this.config.taskScorer.getOverdueTasks(),
        this.config.taskScorer.getSuggestedFocusTasks(MORNING_BRIEF_DEFAULTS.MAX_FOCUS_TASKS),
      ]);

      const prioritized = await this.config.taskScorer.getPrioritizedTasks({ priority: ['critical', 'high'] });

      return {
        dueToday: dueToday.map(d => d.task),
        overdue: overdue.map(d => d.task),
        highPriority: prioritized.slice(0, 5).map(d => d.task),
        suggestedFocus: suggested.map(d => d.task),
        completedYesterday: 0, // Would need historical data
      };
    } catch {
      return {
        dueToday: [],
        overdue: [],
        highPriority: [],
        suggestedFocus: [],
        completedYesterday: 0,
      };
    }
  }

  private async getHighlights(prefs: MorningBriefPreferences, date: number): Promise<BriefHighlight[]> {
    const highlights: BriefHighlight[] = [];
    const lookahead = MORNING_BRIEF_DEFAULTS.HIGHLIGHT_LOOKAHEAD_DAYS * TIME_CONSTANTS.DAY_MS;

    // Get upcoming deadlines
    if (this.config.taskScorer) {
      try {
        const tasks = await this.config.taskScorer.getPrioritizedTasks({
          dueBefore: date + lookahead,
          priority: ['critical', 'high'],
        });

        for (const { task } of tasks.slice(0, 2)) {
          if (task.dueDate) {
            highlights.push({
              type: 'deadline',
              title: `Deadline: ${task.title}`,
              description: `Due ${new Date(task.dueDate).toLocaleDateString()}`,
              time: task.dueDate,
              icon: '⏰',
            });
          }
        }
      } catch {
        // Ignore errors
      }
    }

    // Get upcoming meetings
    if (this.config.calendarManager) {
      try {
        const events = await this.config.calendarManager.getUpcomingEvents(72);
        const importantMeetings = events.filter(e =>
          e.attendees.length > 5 || // Large meetings
          e.title.toLowerCase().includes('review') ||
          e.title.toLowerCase().includes('presentation')
        );

        for (const event of importantMeetings.slice(0, 2)) {
          highlights.push({
            type: 'meeting',
            title: event.title,
            description: `${event.attendees.length} attendees`,
            time: event.start,
            icon: '📅',
          });
        }
      } catch {
        // Ignore errors
      }
    }

    // Add custom reminders
    for (const reminder of prefs.customReminders) {
      highlights.push({
        type: 'reminder',
        title: reminder,
        description: 'Custom reminder',
        icon: '📌',
      });
    }

    return highlights.slice(0, MORNING_BRIEF_DEFAULTS.MAX_HIGHLIGHTS);
  }

  private generateGreeting(timeOfDay: 'morning' | 'afternoon' | 'evening', prefs: MorningBriefPreferences): string {
    const templates = GREETING_TEMPLATES[timeOfDay];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  private generateReminders(
    prefs: MorningBriefPreferences,
    schedule: ScheduleOverview,
    tasks: TaskOverview
  ): string[] {
    const reminders: string[] = [...prefs.customReminders];

    if (tasks.overdue.length > 0) {
      reminders.push(`You have ${tasks.overdue.length} overdue task(s) to address`);
    }

    if (schedule.conflicts.length > 0) {
      reminders.push('Review your calendar - there are scheduling conflicts');
    }

    if (schedule.busyPercentage > 80) {
      reminders.push('Heavy meeting day - consider declining non-essential meetings');
    }

    if (schedule.focusTimeBlocks.length === 0 && tasks.highPriority.length > 0) {
      reminders.push('No focus time blocked - consider scheduling deep work time');
    }

    return reminders;
  }

  private getMotivationalQuote(): string {
    const quotes = [
      'The secret of getting ahead is getting started. - Mark Twain',
      'Focus on being productive instead of busy. - Tim Ferriss',
      'The way to get started is to quit talking and begin doing. - Walt Disney',
      'Your time is limited, don\'t waste it living someone else\'s life. - Steve Jobs',
      'The only way to do great work is to love what you do. - Steve Jobs',
      'Success is not final, failure is not fatal. It is the courage to continue that counts. - Winston Churchill',
      'Start where you are. Use what you have. Do what you can. - Arthur Ashe',
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createMorningBriefGenerator(config?: Partial<MorningBriefConfig>): MorningBriefGenerator {
  return new MorningBriefGenerator(config);
}
