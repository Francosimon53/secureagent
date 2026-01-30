/**
 * Daily Driver Constants
 *
 * Default configurations, events, and scoring parameters
 */

import type {
  EmailPriority,
  EmailCategory,
  TaskPriority,
  TaskEnergyLevel,
} from './types.js';

// =============================================================================
// Events
// =============================================================================

export const DAILY_DRIVER_EVENTS = {
  // Morning brief events
  MORNING_BRIEF_GENERATED: 'daily-driver:brief:generated',
  MORNING_BRIEF_DELIVERED: 'daily-driver:brief:delivered',

  // Email events
  EMAIL_SUMMARIZED: 'daily-driver:email:summarized',
  EMAIL_CATEGORIZED: 'daily-driver:email:categorized',
  INBOX_PROCESSED: 'daily-driver:inbox:processed',
  EMAIL_ACTION_TAKEN: 'daily-driver:email:action',

  // Calendar events
  CALENDAR_SYNCED: 'daily-driver:calendar:synced',
  CONFLICT_DETECTED: 'daily-driver:calendar:conflict',
  MEETING_REMINDER: 'daily-driver:meeting:reminder',

  // Task events
  TASK_SCORED: 'daily-driver:task:scored',
  TASKS_PRIORITIZED: 'daily-driver:tasks:prioritized',
  TASK_SUGGESTION: 'daily-driver:task:suggestion',

  // Weekly review events
  WEEKLY_REVIEW_GENERATED: 'daily-driver:review:generated',
  WEEKLY_INSIGHTS: 'daily-driver:review:insights',

  // Meeting prep events
  MEETING_PREP_READY: 'daily-driver:meeting:prep-ready',
  PARTICIPANT_ENRICHED: 'daily-driver:meeting:participant-enriched',
} as const;

export type DailyDriverEventType = typeof DAILY_DRIVER_EVENTS[keyof typeof DAILY_DRIVER_EVENTS];

// =============================================================================
// Email Constants
// =============================================================================

export const EMAIL_PRIORITY_WEIGHTS: Record<EmailPriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export const EMAIL_CATEGORY_LABELS: Record<EmailCategory, string> = {
  action_required: 'Action Required',
  follow_up: 'Follow Up',
  fyi: 'FYI',
  newsletter: 'Newsletter',
  promotional: 'Promotional',
  spam: 'Spam',
};

export const EMAIL_CATEGORIZATION_PATTERNS = {
  action_required: [
    /please (respond|reply|review|approve|confirm|sign|complete)/i,
    /action (required|needed|requested)/i,
    /deadline/i,
    /asap/i,
    /urgent(ly)?/i,
    /by (today|tomorrow|end of day|eod|cob)/i,
  ],
  follow_up: [
    /follow(ing)? up/i,
    /checking in/i,
    /just wanted to/i,
    /circling back/i,
    /any update/i,
    /status update/i,
  ],
  newsletter: [
    /unsubscribe/i,
    /weekly digest/i,
    /newsletter/i,
    /view in browser/i,
    /email preferences/i,
  ],
  promotional: [
    /limited time/i,
    /% off/i,
    /sale ends/i,
    /special offer/i,
    /discount/i,
    /free (trial|shipping)/i,
  ],
} as const;

export const INBOX_ZERO_DEFAULTS = {
  /** Max emails to process in one batch */
  BATCH_SIZE: 50,
  /** Days after which to auto-archive read emails */
  AUTO_ARCHIVE_DAYS: 30,
  /** Minimum confidence for auto-categorization */
  AUTO_CATEGORIZE_THRESHOLD: 0.8,
  /** Words per minute for read time estimation */
  WORDS_PER_MINUTE: 250,
};

// =============================================================================
// Task Scoring Constants
// =============================================================================

export const TASK_PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export const TASK_ENERGY_WEIGHTS: Record<TaskEnergyLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export const TASK_SCORING_DEFAULTS = {
  /** Weight for urgency (due date proximity) */
  URGENCY_WEIGHT: 0.25,
  /** Weight for importance (priority) */
  IMPORTANCE_WEIGHT: 0.25,
  /** Weight for effort (estimated time) */
  EFFORT_WEIGHT: 0.15,
  /** Weight for context match */
  CONTEXT_WEIGHT: 0.15,
  /** Weight for dependencies */
  DEPENDENCY_WEIGHT: 0.10,
  /** Weight for energy match */
  ENERGY_WEIGHT: 0.10,

  /** Days until due to consider urgent */
  URGENT_DAYS: 1,
  /** Days until due to consider soon */
  SOON_DAYS: 3,
  /** Days until due to consider upcoming */
  UPCOMING_DAYS: 7,

  /** Quick task threshold in minutes */
  QUICK_TASK_MINUTES: 15,
  /** Long task threshold in minutes */
  LONG_TASK_MINUTES: 120,
};

export const TASK_RECOMMENDATIONS = {
  DO_NOW: { threshold: 80, label: 'Do Now', color: '#dc2626' },
  SCHEDULE: { threshold: 60, label: 'Schedule', color: '#f59e0b' },
  DELEGATE: { threshold: 40, label: 'Consider Delegating', color: '#3b82f6' },
  DEFER: { threshold: 20, label: 'Defer', color: '#6b7280' },
  ELIMINATE: { threshold: 0, label: 'Reconsider', color: '#9ca3af' },
} as const;

// =============================================================================
// Calendar Constants
// =============================================================================

export const CALENDAR_DEFAULTS = {
  /** Working hours start (24h format) */
  WORK_START_HOUR: 9,
  /** Working hours end (24h format) */
  WORK_END_HOUR: 17,
  /** Minimum focus block duration in minutes */
  MIN_FOCUS_BLOCK_MINUTES: 30,
  /** Buffer time between meetings in minutes */
  MEETING_BUFFER_MINUTES: 5,
  /** Travel time threshold in minutes */
  TRAVEL_TIME_THRESHOLD: 15,
  /** Days to look ahead for overview */
  OVERVIEW_DAYS: 7,
  /** Minutes before meeting for prep reminder */
  PREP_REMINDER_MINUTES: 15,
};

export const MEETING_TYPES = {
  ONE_ON_ONE: { icon: '👤', label: '1:1', prepTime: 10 },
  TEAM: { icon: '👥', label: 'Team Meeting', prepTime: 15 },
  EXTERNAL: { icon: '🤝', label: 'External', prepTime: 20 },
  INTERVIEW: { icon: '📋', label: 'Interview', prepTime: 30 },
  PRESENTATION: { icon: '📊', label: 'Presentation', prepTime: 45 },
  BRAINSTORM: { icon: '💡', label: 'Brainstorm', prepTime: 10 },
  REVIEW: { icon: '📝', label: 'Review', prepTime: 15 },
} as const;

// =============================================================================
// Morning Brief Constants
// =============================================================================

export const MORNING_BRIEF_DEFAULTS = {
  /** Default delivery time (HH:mm) */
  DEFAULT_DELIVERY_TIME: '07:00',
  /** Maximum emails to include */
  MAX_PRIORITY_EMAILS: 5,
  /** Maximum tasks to suggest for focus */
  MAX_FOCUS_TASKS: 3,
  /** Maximum highlights to include */
  MAX_HIGHLIGHTS: 5,
  /** Days to look ahead for highlights */
  HIGHLIGHT_LOOKAHEAD_DAYS: 3,
};

export const GREETING_TEMPLATES = {
  morning: [
    'Good morning! Here\'s your daily brief.',
    'Rise and shine! Let\'s make today count.',
    'Good morning! Here\'s what\'s on your radar.',
  ],
  afternoon: [
    'Good afternoon! Here\'s a quick update.',
    'Hope your day is going well. Here\'s what\'s next.',
  ],
  evening: [
    'Good evening! Here\'s a wrap-up of your day.',
    'Wrapping up the day. Here\'s what you accomplished.',
  ],
} as const;

// =============================================================================
// Weekly Review Constants
// =============================================================================

export const WEEKLY_REVIEW_DEFAULTS = {
  /** Day of week for review (0 = Sunday) */
  REVIEW_DAY: 0,
  /** Time for review delivery (HH:mm) */
  REVIEW_TIME: '18:00',
  /** Minimum accomplishments to highlight */
  MIN_ACCOMPLISHMENTS: 3,
  /** Maximum recommendations */
  MAX_RECOMMENDATIONS: 5,
};

export const PRODUCTIVITY_SCORE_WEIGHTS = {
  tasksCompleted: 0.25,
  focusTime: 0.25,
  meetingEfficiency: 0.20,
  emailResponseRate: 0.15,
  goalProgress: 0.15,
};

export const INSIGHT_CATEGORIES = {
  productivity: { icon: '📈', label: 'Productivity' },
  time_management: { icon: '⏰', label: 'Time Management' },
  communication: { icon: '💬', label: 'Communication' },
  focus: { icon: '🎯', label: 'Focus' },
  balance: { icon: '⚖️', label: 'Work-Life Balance' },
} as const;

// =============================================================================
// Meeting Prep Constants
// =============================================================================

export const MEETING_PREP_DEFAULTS = {
  /** Minutes before meeting to generate prep */
  PREP_LEAD_TIME_MINUTES: 30,
  /** Maximum previous meetings to include */
  MAX_PREVIOUS_MEETINGS: 5,
  /** Maximum related emails per participant */
  MAX_RELATED_EMAILS: 3,
  /** Minimum talking points */
  MIN_TALKING_POINTS: 3,
  /** Maximum questions to suggest */
  MAX_QUESTIONS: 5,
};

export const PARTICIPANT_ENRICHMENT_SOURCES = [
  'email_history',
  'calendar_history',
  'notes',
  'linkedin',
  'company_directory',
] as const;

// =============================================================================
// Time Helpers
// =============================================================================

export const TIME_CONSTANTS = {
  MINUTE_MS: 60 * 1000,
  HOUR_MS: 60 * 60 * 1000,
  DAY_MS: 24 * 60 * 60 * 1000,
  WEEK_MS: 7 * 24 * 60 * 60 * 1000,
};

export function getStartOfDay(timestamp?: number): number {
  const date = timestamp ? new Date(timestamp) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function getEndOfDay(timestamp?: number): number {
  return getStartOfDay(timestamp) + TIME_CONSTANTS.DAY_MS - 1;
}

export function getStartOfWeek(timestamp?: number): number {
  const date = timestamp ? new Date(timestamp) : new Date();
  const day = date.getDay();
  return getStartOfDay(date.getTime() - day * TIME_CONSTANTS.DAY_MS);
}

export function getEndOfWeek(timestamp?: number): number {
  return getStartOfWeek(timestamp) + TIME_CONSTANTS.WEEK_MS - 1;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
