/**
 * Daily Driver Module
 *
 * Productivity features for daily workflow management
 */

import type {
  EmailProvider,
  CalendarProvider,
  TaskProvider,
  WeatherProvider,
  MorningBrief,
  MorningBriefPreferences,
  WeeklyReview,
  MeetingPrep,
  CalendarEvent,
  Email,
  EmailSummary,
  Task,
  TaskScore,
  InboxStats,
  CalendarDay,
  WeekOverview,
} from './types.js';
import { DailyDriverError } from './types.js';
import { DAILY_DRIVER_EVENTS } from './constants.js';

import { EmailSummarizer, createEmailSummarizer, type AISummarizer } from './email-summarizer.js';
import { InboxZeroManager, createInboxZeroManager, type TriageDecision } from './inbox-zero.js';
import { CalendarManager, createCalendarManager } from './calendar-manager.js';
import { TaskScorer, createTaskScorer } from './task-scorer.js';
import { MorningBriefGenerator, createMorningBriefGenerator } from './morning-brief.js';
import { WeeklyReviewGenerator, createWeeklyReviewGenerator } from './weekly-review.js';
import { MeetingPrepGenerator, createMeetingPrepGenerator, type AIPrepAssistant } from './meeting-prep.js';

// =============================================================================
// Daily Driver Configuration
// =============================================================================

export interface DailyDriverConfig {
  /** Email provider */
  emailProvider?: EmailProvider;
  /** Calendar provider */
  calendarProvider?: CalendarProvider;
  /** Task provider */
  taskProvider?: TaskProvider;
  /** Weather provider */
  weatherProvider?: WeatherProvider;
  /** AI summarizer for emails */
  aiSummarizer?: AISummarizer;
  /** AI prep assistant for meetings */
  aiPrepAssistant?: AIPrepAssistant;
  /** VIP contacts for priority handling */
  vipContacts: string[];
  /** Working hours start (0-23) */
  workStartHour: number;
  /** Working hours end (0-23) */
  workEndHour: number;
  /** Default timezone */
  timezone: string;
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: DailyDriverConfig = {
  vipContacts: [],
  workStartHour: 9,
  workEndHour: 17,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

// =============================================================================
// Daily Driver Manager
// =============================================================================

export class DailyDriver {
  private readonly config: DailyDriverConfig;

  // Components
  public readonly emailSummarizer: EmailSummarizer;
  public readonly inboxManager: InboxZeroManager;
  public readonly calendarManager: CalendarManager;
  public readonly taskScorer: TaskScorer;
  public readonly morningBriefGenerator: MorningBriefGenerator;
  public readonly weeklyReviewGenerator: WeeklyReviewGenerator;
  public readonly meetingPrepGenerator: MeetingPrepGenerator;

  constructor(config?: Partial<DailyDriverConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const eventHandler = (event: string, data: unknown) => {
      this.config.onEvent?.(event, data);
    };

    // Initialize components
    this.emailSummarizer = createEmailSummarizer({
      aiSummarizer: this.config.aiSummarizer,
      vipContacts: this.config.vipContacts,
      onEvent: eventHandler,
    });

    this.inboxManager = createInboxZeroManager({
      provider: this.config.emailProvider,
      summarizer: this.emailSummarizer,
      vipContacts: this.config.vipContacts,
      onEvent: eventHandler,
    });

    this.calendarManager = createCalendarManager({
      provider: this.config.calendarProvider,
      workStartHour: this.config.workStartHour,
      workEndHour: this.config.workEndHour,
      timezone: this.config.timezone,
      onEvent: eventHandler,
    });

    this.taskScorer = createTaskScorer({
      provider: this.config.taskProvider,
      onEvent: eventHandler,
    });

    this.morningBriefGenerator = createMorningBriefGenerator({
      emailSummarizer: this.emailSummarizer,
      inboxManager: this.inboxManager,
      calendarManager: this.calendarManager,
      taskScorer: this.taskScorer,
      weatherProvider: this.config.weatherProvider,
      onEvent: eventHandler,
    });

    this.weeklyReviewGenerator = createWeeklyReviewGenerator({
      calendarManager: this.calendarManager,
      taskScorer: this.taskScorer,
      inboxManager: this.inboxManager,
      onEvent: eventHandler,
    });

    this.meetingPrepGenerator = createMeetingPrepGenerator({
      calendarManager: this.calendarManager,
      emailSummarizer: this.emailSummarizer,
      inboxManager: this.inboxManager,
      aiAssistant: this.config.aiPrepAssistant,
      onEvent: eventHandler,
    });
  }

  // ==========================================================================
  // Provider Management
  // ==========================================================================

  /**
   * Set email provider
   */
  setEmailProvider(provider: EmailProvider): void {
    this.inboxManager.setProvider(provider);
  }

  /**
   * Set calendar provider
   */
  setCalendarProvider(provider: CalendarProvider): void {
    this.calendarManager.setProvider(provider);
  }

  /**
   * Set task provider
   */
  setTaskProvider(provider: TaskProvider): void {
    this.taskScorer.setProvider(provider);
  }

  // ==========================================================================
  // Morning Brief
  // ==========================================================================

  /**
   * Generate morning brief
   */
  async getMorningBrief(userId?: string): Promise<MorningBrief> {
    return this.morningBriefGenerator.generate(userId ?? 'default');
  }

  /**
   * Get morning brief as formatted text
   */
  async getMorningBriefText(userId?: string): Promise<string> {
    const brief = await this.getMorningBrief(userId);
    return this.morningBriefGenerator.formatAsText(brief);
  }

  /**
   * Set morning brief preferences
   */
  setMorningBriefPreferences(userId: string, prefs: Partial<MorningBriefPreferences>): void {
    this.morningBriefGenerator.setPreferences(userId, prefs);
  }

  // ==========================================================================
  // Inbox Management
  // ==========================================================================

  /**
   * Get inbox statistics
   */
  async getInboxStats(): Promise<InboxStats> {
    return this.inboxManager.getStats();
  }

  /**
   * Triage inbox and get suggested actions
   */
  async triageInbox(options?: { limit?: number; autoApply?: boolean }): Promise<TriageDecision[]> {
    return this.inboxManager.triageInbox(options);
  }

  /**
   * Summarize an email
   */
  async summarizeEmail(email: Email): Promise<EmailSummary> {
    return this.emailSummarizer.summarize(email);
  }

  /**
   * Get emails requiring action
   */
  async getActionRequiredEmails(): Promise<Array<{ email: Email; summary?: EmailSummary }>> {
    return this.inboxManager.getActionRequired();
  }

  /**
   * Archive old emails
   */
  async archiveOldEmails(daysOld?: number): Promise<number> {
    return this.inboxManager.archiveOldEmails(daysOld);
  }

  // ==========================================================================
  // Calendar Management
  // ==========================================================================

  /**
   * Get today's overview
   */
  async getTodayOverview(): Promise<CalendarDay> {
    return this.calendarManager.getDayOverview();
  }

  /**
   * Get week overview
   */
  async getWeekOverview(): Promise<WeekOverview> {
    return this.calendarManager.getWeekOverview();
  }

  /**
   * Get upcoming events
   */
  async getUpcomingEvents(hours?: number): Promise<CalendarEvent[]> {
    return this.calendarManager.getUpcomingEvents(hours);
  }

  /**
   * Get next event
   */
  async getNextEvent(): Promise<CalendarEvent | null> {
    return this.calendarManager.getNextEvent();
  }

  /**
   * Find focus time blocks
   */
  async findFocusBlocks(date?: number, minMinutes?: number): Promise<Array<{ start: number; end: number; duration: number }>> {
    return this.calendarManager.findFocusBlocks(date, minMinutes);
  }

  /**
   * Block focus time
   */
  async blockFocusTime(title: string, durationMinutes: number): Promise<CalendarEvent | null> {
    return this.calendarManager.blockFocusTime(title, durationMinutes);
  }

  /**
   * Find next available time slot
   */
  async findNextAvailableSlot(durationMinutes: number): Promise<{ start: number; end: number } | null> {
    return this.calendarManager.findNextAvailableSlot(durationMinutes);
  }

  // ==========================================================================
  // Task Management
  // ==========================================================================

  /**
   * Get prioritized tasks
   */
  async getPrioritizedTasks(): Promise<Array<{ task: Task; score: TaskScore }>> {
    return this.taskScorer.getPrioritizedTasks();
  }

  /**
   * Get suggested focus tasks
   */
  async getSuggestedFocusTasks(maxTasks?: number): Promise<Array<{ task: Task; score: TaskScore }>> {
    return this.taskScorer.getSuggestedFocusTasks(maxTasks);
  }

  /**
   * Get quick wins
   */
  async getQuickWins(maxTasks?: number): Promise<Array<{ task: Task; score: TaskScore }>> {
    return this.taskScorer.getQuickWins(maxTasks);
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(): Promise<Array<{ task: Task; score: TaskScore; daysOverdue: number }>> {
    return this.taskScorer.getOverdueTasks();
  }

  /**
   * Get tasks due today
   */
  async getTasksDueToday(): Promise<Array<{ task: Task; score: TaskScore }>> {
    return this.taskScorer.getTasksDueToday();
  }

  /**
   * Score a task
   */
  scoreTask(task: Task): TaskScore {
    return this.taskScorer.scoreTask(task);
  }

  /**
   * Set current context for task scoring
   */
  setTaskContext(context: 'home' | 'office' | 'phone' | 'computer' | 'errand' | 'anywhere'): void {
    this.taskScorer.setContext(context);
  }

  /**
   * Set current energy level for task scoring
   */
  setEnergyLevel(energy: 'high' | 'medium' | 'low'): void {
    this.taskScorer.setEnergyLevel(energy);
  }

  // ==========================================================================
  // Weekly Review
  // ==========================================================================

  /**
   * Generate weekly review
   */
  async getWeeklyReview(): Promise<WeeklyReview> {
    return this.weeklyReviewGenerator.generate();
  }

  /**
   * Get weekly review as formatted text
   */
  async getWeeklyReviewText(): Promise<string> {
    const review = await this.getWeeklyReview();
    return this.weeklyReviewGenerator.formatAsText(review);
  }

  // ==========================================================================
  // Meeting Prep
  // ==========================================================================

  /**
   * Generate meeting prep
   */
  async getMeetingPrep(event: CalendarEvent): Promise<MeetingPrep> {
    return this.meetingPrepGenerator.generatePrep(event);
  }

  /**
   * Get meeting prep as formatted text
   */
  async getMeetingPrepText(event: CalendarEvent): Promise<string> {
    const prep = await this.getMeetingPrep(event);
    return this.meetingPrepGenerator.formatAsText(prep);
  }

  /**
   * Get prep for upcoming meetings
   */
  async getUpcomingMeetingPreps(hoursAhead?: number): Promise<MeetingPrep[]> {
    return this.meetingPrepGenerator.generateUpcomingPreps(hoursAhead);
  }

  /**
   * Get next meeting needing prep
   */
  async getNextMeetingNeedingPrep(): Promise<CalendarEvent | null> {
    return this.meetingPrepGenerator.getNextMeetingNeedingPrep();
  }

  // ==========================================================================
  // Quick Actions
  // ==========================================================================

  /**
   * Get a quick summary of today
   */
  async getQuickDaySummary(): Promise<{
    meetingCount: number;
    nextMeeting?: CalendarEvent;
    unreadEmails: number;
    urgentEmails: number;
    tasksDueToday: number;
    overdueTasks: number;
  }> {
    const [dayOverview, inboxStats, dueToday, overdue] = await Promise.all([
      this.getTodayOverview().catch(() => ({ events: [] })),
      this.getInboxStats().catch(() => ({ unread: 0, byPriority: { urgent: 0, high: 0, normal: 0, low: 0 } } as InboxStats)),
      this.getTasksDueToday().catch(() => []),
      this.getOverdueTasks().catch(() => []),
    ]);

    const nextMeeting = dayOverview.events.find(e => e.start > Date.now() && !e.isAllDay);

    return {
      meetingCount: dayOverview.events.filter(e => !e.isAllDay).length,
      nextMeeting,
      unreadEmails: inboxStats.unread,
      urgentEmails: inboxStats.byPriority.urgent,
      tasksDueToday: dueToday.length,
      overdueTasks: overdue.length,
    };
  }

  /**
   * Get what to work on next
   */
  async getWhatNext(): Promise<{
    nextMeeting?: { event: CalendarEvent; inMinutes: number };
    suggestedTask?: { task: Task; reason: string };
    focusBlock?: { start: number; end: number; duration: number };
  }> {
    const now = Date.now();

    // Check for upcoming meetings
    const nextEvent = await this.getNextEvent();
    const nextMeeting = nextEvent && !nextEvent.isAllDay
      ? { event: nextEvent, inMinutes: Math.round((nextEvent.start - now) / 60000) }
      : undefined;

    // Get suggested task
    const suggested = await this.getSuggestedFocusTasks(1);
    const suggestedTask = suggested[0]
      ? { task: suggested[0].task, reason: suggested[0].score.reasoning }
      : undefined;

    // Find focus time
    const focusBlocks = await this.findFocusBlocks();
    const focusBlock = focusBlocks.find(b => b.start <= now && b.end > now) ?? focusBlocks[0];

    return {
      nextMeeting,
      suggestedTask,
      focusBlock,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createDailyDriver(config?: Partial<DailyDriverConfig>): DailyDriver {
  return new DailyDriver(config);
}

// =============================================================================
// Re-exports
// =============================================================================

// Types
export * from './types.js';

// Constants
export {
  DAILY_DRIVER_EVENTS,
  EMAIL_PRIORITY_WEIGHTS,
  EMAIL_CATEGORY_LABELS,
  TASK_PRIORITY_WEIGHTS,
  TASK_ENERGY_WEIGHTS,
  TASK_SCORING_DEFAULTS,
  TASK_RECOMMENDATIONS,
  CALENDAR_DEFAULTS,
  MEETING_TYPES,
  MORNING_BRIEF_DEFAULTS,
  WEEKLY_REVIEW_DEFAULTS,
  MEETING_PREP_DEFAULTS,
  TIME_CONSTANTS,
  getStartOfDay,
  getEndOfDay,
  getStartOfWeek,
  getEndOfWeek,
  formatDuration,
  getTimeOfDay,
} from './constants.js';

// Components
export {
  EmailSummarizer,
  createEmailSummarizer,
  type EmailSummarizerConfig,
  type AISummarizer,
} from './email-summarizer.js';

export {
  InboxZeroManager,
  createInboxZeroManager,
  type InboxZeroConfig,
  type TriageDecision,
} from './inbox-zero.js';

export {
  CalendarManager,
  createCalendarManager,
  type CalendarManagerConfig,
} from './calendar-manager.js';

export {
  TaskScorer,
  createTaskScorer,
  type TaskScorerConfig,
} from './task-scorer.js';

export {
  MorningBriefGenerator,
  createMorningBriefGenerator,
  type MorningBriefConfig,
} from './morning-brief.js';

export {
  WeeklyReviewGenerator,
  createWeeklyReviewGenerator,
  type WeeklyReviewConfig,
} from './weekly-review.js';

export {
  MeetingPrepGenerator,
  createMeetingPrepGenerator,
  type MeetingPrepConfig,
  type AIPrepAssistant,
  type MeetingHistoryStore,
} from './meeting-prep.js';
