/**
 * Productivity Module Configuration Schema
 *
 * Zod schemas for validating productivity module configuration.
 */

import { z } from 'zod';

// =============================================================================
// Weather Configuration
// =============================================================================

export const WeatherConfigSchema = z.object({
  provider: z.enum(['openweathermap', 'weatherapi']).default('openweathermap'),
  apiKeyEnvVar: z.string().default('WEATHER_API_KEY'),
  location: z.string().optional(),
  units: z.enum(['metric', 'imperial']).default('metric'),
  cacheTTLSeconds: z.number().min(60).max(3600).default(900),
});

// =============================================================================
// Calendar Configuration
// =============================================================================

export const CalendarConfigSchema = z.object({
  provider: z.enum(['google', 'outlook']).default('google'),
  credentialsEnvVar: z.string().default('CALENDAR_CREDENTIALS'),
  lookAheadDays: z.number().min(1).max(30).default(7),
  includeDeclined: z.boolean().default(false),
  cacheTTLSeconds: z.number().min(60).max(3600).default(300),
});

// =============================================================================
// Email Configuration
// =============================================================================

export const EmailConfigSchema = z.object({
  provider: z.enum(['gmail', 'outlook']).default('gmail'),
  credentialsEnvVar: z.string().default('EMAIL_CREDENTIALS'),
  maxEmailsToProcess: z.number().min(10).max(500).default(100),
  vipSenders: z.array(z.string()).default([]),
  autoArchiveAfterDays: z.number().min(0).max(90).default(0),
  cacheTTLSeconds: z.number().min(60).max(1800).default(300),
});

// =============================================================================
// News Configuration
// =============================================================================

export const NewsConfigSchema = z.object({
  provider: z.enum(['newsapi', 'rss']).default('newsapi'),
  apiKeyEnvVar: z.string().default('NEWS_API_KEY'),
  categories: z.array(z.string()).default(['technology', 'business']),
  sources: z.array(z.string()).default([]),
  maxItems: z.number().min(5).max(50).default(10),
  cacheTTLSeconds: z.number().min(300).max(3600).default(900),
});

// =============================================================================
// Task Scoring Configuration
// =============================================================================

export const TaskScoringWeightsSchema = z.object({
  urgency: z.number().min(0).max(1).default(0.3),
  importance: z.number().min(0).max(1).default(0.3),
  effort: z.number().min(0).max(1).default(0.15),
  contextMatch: z.number().min(0).max(1).default(0.15),
  decay: z.number().min(0).max(1).default(0.1),
});

export const TaskScoringConfigSchema = z.object({
  enabled: z.boolean().default(true),
  weights: TaskScoringWeightsSchema.default({}),
  decayHalfLifeDays: z.number().min(1).max(30).default(7),
  recalculateIntervalMinutes: z.number().min(5).max(60).default(15),
});

// =============================================================================
// Morning Brief Configuration
// =============================================================================

export const MorningBriefConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultDeliveryTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format').default('07:00'),
  sections: z.array(z.enum([
    'weather', 'calendar', 'health', 'email', 'news', 'tasks',
  ])).default(['weather', 'calendar', 'tasks']),
  timezone: z.string().default('UTC'),
  maxTasksToShow: z.number().min(3).max(20).default(5),
  maxEventsToShow: z.number().min(3).max(20).default(5),
});

// =============================================================================
// Inbox Zero Configuration
// =============================================================================

export const InboxZeroConfigSchema = z.object({
  enabled: z.boolean().default(true),
  confidenceThreshold: z.number().min(0).max(1).default(0.7),
  autoArchivePromotions: z.boolean().default(false),
  autoUnsubscribe: z.boolean().default(false),
  dailyDigestEnabled: z.boolean().default(true),
  dailyDigestTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).default('18:00'),
});

// =============================================================================
// Email to Todo Configuration
// =============================================================================

export const EmailToTodoConfigSchema = z.object({
  enabled: z.boolean().default(true),
  confidenceThreshold: z.number().min(0).max(1).default(0.6),
  defaultPriority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  defaultContext: z.enum(['work', 'personal', 'both']).default('work'),
  autoCreateTasks: z.boolean().default(false),
  requireApproval: z.boolean().default(true),
});

// =============================================================================
// Calendar Conflicts Configuration
// =============================================================================

export const CalendarConflictsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  lookAheadDays: z.number().min(1).max(30).default(7),
  minOverlapMinutes: z.number().min(1).max(60).default(5),
  autoSuggest: z.boolean().default(true),
  notifyOnConflict: z.boolean().default(true),
  ignoreAllDayEvents: z.boolean().default(true),
});

// =============================================================================
// Weekly Review Configuration
// =============================================================================

export const WeeklyReviewConfigSchema = z.object({
  enabled: z.boolean().default(true),
  deliveryDay: z.enum(['sunday', 'monday']).default('sunday'),
  deliveryTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).default('20:00'),
  includeNextWeekPreview: z.boolean().default(true),
  includeGoalProgress: z.boolean().default(true),
  reportFormat: z.enum(['markdown', 'html', 'text']).default('markdown'),
});

// =============================================================================
// Main Productivity Configuration
// =============================================================================

export const ProductivityConfigSchema = z.object({
  enabled: z.boolean().default(true),

  // API allowlist (deny-by-default)
  allowedApiDomains: z.array(z.string()).default([
    'api.openweathermap.org',
    'www.googleapis.com',
    'graph.microsoft.com',
    'newsapi.org',
  ]),

  // Provider configurations
  weather: WeatherConfigSchema.optional(),
  calendar: CalendarConfigSchema.optional(),
  email: EmailConfigSchema.optional(),
  news: NewsConfigSchema.optional(),

  // Feature configurations
  taskScoring: TaskScoringConfigSchema.optional(),
  morningBrief: MorningBriefConfigSchema.optional(),
  inboxZero: InboxZeroConfigSchema.optional(),
  emailToTodo: EmailToTodoConfigSchema.optional(),
  calendarConflicts: CalendarConflictsConfigSchema.optional(),
  weeklyReview: WeeklyReviewConfigSchema.optional(),

  // Store configuration
  storeType: z.enum(['memory', 'database']).default('database'),
});

// =============================================================================
// Type Exports
// =============================================================================

export type WeatherConfig = z.infer<typeof WeatherConfigSchema>;
export type CalendarConfig = z.infer<typeof CalendarConfigSchema>;
export type EmailConfig = z.infer<typeof EmailConfigSchema>;
export type NewsConfig = z.infer<typeof NewsConfigSchema>;
export type TaskScoringConfig = z.infer<typeof TaskScoringConfigSchema>;
export type TaskScoringWeightsConfig = z.infer<typeof TaskScoringWeightsSchema>;
export type MorningBriefConfig = z.infer<typeof MorningBriefConfigSchema>;
export type InboxZeroConfig = z.infer<typeof InboxZeroConfigSchema>;
export type EmailToTodoConfig = z.infer<typeof EmailToTodoConfigSchema>;
export type CalendarConflictsConfig = z.infer<typeof CalendarConflictsConfigSchema>;
export type WeeklyReviewConfig = z.infer<typeof WeeklyReviewConfigSchema>;
export type ProductivityConfig = z.infer<typeof ProductivityConfigSchema>;
