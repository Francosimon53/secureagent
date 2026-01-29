/**
 * Productivity Module Types
 *
 * Core type definitions for the productivity suite including weather,
 * calendar, email, task management, and reporting features.
 */

// =============================================================================
// Weather Types
// =============================================================================

export interface WeatherData {
  location: string;
  temperature: number;
  temperatureUnit: 'celsius' | 'fahrenheit';
  condition: string;
  humidity: number;
  windSpeed?: number;
  windDirection?: string;
  uvIndex?: number;
  visibility?: number;
  forecast: WeatherForecast[];
  alerts: WeatherAlert[];
  fetchedAt: number;
}

export interface WeatherForecast {
  date: number;
  high: number;
  low: number;
  condition: string;
  precipitation: number;
}

export interface WeatherAlert {
  id: string;
  type: 'warning' | 'watch' | 'advisory';
  title: string;
  description: string;
  severity: 'minor' | 'moderate' | 'severe' | 'extreme';
  startsAt: number;
  expiresAt: number;
}

// =============================================================================
// Calendar Types
// =============================================================================

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  startTime: number;
  endTime: number;
  isAllDay: boolean;
  attendees: CalendarAttendee[];
  organizer?: CalendarAttendee;
  status: 'confirmed' | 'tentative' | 'cancelled';
  recurrence?: string;
  conferenceLink?: string;
  reminders?: EventReminder[];
  createdAt: number;
  updatedAt: number;
}

export interface CalendarAttendee {
  email: string;
  name?: string;
  status: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  isOptional?: boolean;
  isOrganizer?: boolean;
}

export interface EventReminder {
  method: 'email' | 'popup' | 'sms';
  minutesBefore: number;
}

export interface CalendarConflict {
  event1: CalendarEvent;
  event2: CalendarEvent;
  overlapMinutes: number;
  severity: 'minor' | 'moderate' | 'severe';
  suggestions: ConflictResolution[];
}

export interface ConflictResolution {
  type: 'reschedule' | 'shorten' | 'decline' | 'make_optional' | 'find_alternative';
  description: string;
  targetEvent: 'event1' | 'event2' | 'both';
  suggestedTime?: { start: number; end: number };
  confidence: number;
}

// =============================================================================
// Email Types
// =============================================================================

export interface EmailDigest {
  id: string;
  messageId: string;
  threadId: string;
  subject: string;
  sender: string;
  senderName?: string;
  recipients: string[];
  receivedAt: number;
  snippet: string;
  priority: number;
  category: EmailCategory;
  labels: string[];
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachmentCount: number;
  hasUnsubscribeLink: boolean;
  isActionable: boolean;
  extractedTasks?: ExtractedTask[];
  suggestedActions?: EmailAction[];
}

export type EmailCategory = 'primary' | 'promotions' | 'social' | 'updates' | 'forums' | 'spam';

export interface ExtractedTask {
  title: string;
  description?: string;
  dueDate?: number;
  priority: TodoPriority;
  confidence: number;
  sourceText: string;
}

export interface EmailAction {
  type: 'reply' | 'archive' | 'delete' | 'snooze' | 'label' | 'forward' | 'unsubscribe';
  label?: string;
  description: string;
  confidence: number;
}

export interface EmailStats {
  total: number;
  unread: number;
  byCategory: Record<EmailCategory, number>;
  byPriority: { high: number; medium: number; low: number };
  averageResponseTime?: number;
}

// =============================================================================
// Task/Todo Types
// =============================================================================

export interface TodoItem {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: TodoStatus;
  priority: TodoPriority;
  dueDate?: number;
  startDate?: number;
  completedAt?: number;
  context: TodoContext;
  tags: string[];
  score?: TaskScore;
  sourceType?: TaskSourceType;
  sourceId?: string;
  parentId?: string;
  subtasks?: string[];
  recurrence?: RecurrenceRule;
  createdAt: number;
  updatedAt: number;
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'deferred';
export type TodoPriority = 'critical' | 'high' | 'medium' | 'low';
export type TodoContext = 'work' | 'personal' | 'both';
export type TaskSourceType = 'manual' | 'email' | 'calendar' | 'recurring' | 'api';

export interface TaskScore {
  total: number;
  urgency: number;
  importance: number;
  effort: number;
  contextMatch: number;
  decay: number;
  computedAt: number;
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  endDate?: number;
  occurrences?: number;
}

export interface TaskScoringWeights {
  urgency: number;
  importance: number;
  effort: number;
  contextMatch: number;
  decay: number;
}

// =============================================================================
// Morning Brief Types
// =============================================================================

export interface MorningBriefData {
  generatedAt: number;
  userId: string;
  sections: MorningBriefSection[];
  summary: string;
}

export interface MorningBriefSection {
  type: MorningBriefSectionType;
  title: string;
  content: unknown;
  priority: number;
}

export type MorningBriefSectionType = 'weather' | 'calendar' | 'health' | 'email' | 'news' | 'tasks';

export interface MorningBriefConfig {
  enabled: boolean;
  defaultDeliveryTime: string;
  sections: MorningBriefSectionType[];
  timezone?: string;
}

// =============================================================================
// Weekly Review Types
// =============================================================================

export interface WeeklyReviewData {
  generatedAt: number;
  userId: string;
  weekStartDate: number;
  weekEndDate: number;
  summary: WeeklyReviewSummary;
  taskMetrics: TaskMetrics;
  calendarMetrics: CalendarMetrics;
  emailMetrics: EmailMetrics;
  highlights: string[];
  areasForImprovement: string[];
  nextWeekSuggestions: string[];
}

export interface WeeklyReviewSummary {
  tasksCompleted: number;
  tasksCreated: number;
  completionRate: number;
  meetingHours: number;
  focusTimeHours: number;
  emailsProcessed: number;
  responseRate: number;
}

export interface TaskMetrics {
  completed: number;
  created: number;
  overdue: number;
  completionRate: number;
  averageCompletionTime: number;
  byPriority: Record<TodoPriority, { completed: number; total: number }>;
  byContext: Record<TodoContext, { completed: number; total: number }>;
}

export interface CalendarMetrics {
  totalMeetings: number;
  meetingHours: number;
  focusBlocks: number;
  focusHours: number;
  conflictsDetected: number;
  conflictsResolved: number;
  busiestDay: string;
  averageMeetingLength: number;
}

export interface EmailMetrics {
  received: number;
  sent: number;
  archived: number;
  inboxZeroAchieved: number;
  averageResponseTime: number;
  unsubscribes: number;
}

// =============================================================================
// News Types
// =============================================================================

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  author?: string;
  publishedAt: number;
  imageUrl?: string;
  category?: string;
  relevanceScore?: number;
}

export interface NewsFeed {
  items: NewsItem[];
  fetchedAt: number;
  source: string;
}

// =============================================================================
// Provider Types
// =============================================================================

export interface ProviderConfig {
  name: string;
  apiKeyEnvVar: string;
  baseUrl?: string;
  timeout?: number;
  retryCount?: number;
}

export interface ProviderResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  cached: boolean;
  fetchedAt: number;
}

export type WeatherProviderType = 'openweathermap' | 'weatherapi';
export type CalendarProviderType = 'google' | 'outlook';
export type EmailProviderType = 'gmail' | 'outlook';
export type NewsProviderType = 'newsapi' | 'rss';

// =============================================================================
// Store Types
// =============================================================================

export interface TodoQueryOptions {
  status?: TodoStatus[];
  priority?: TodoPriority[];
  context?: TodoContext;
  dueBefore?: number;
  dueAfter?: number;
  tags?: string[];
  sourceType?: TaskSourceType;
  limit?: number;
  offset?: number;
  orderBy?: 'dueDate' | 'priority' | 'score' | 'createdAt' | 'updatedAt';
  orderDirection?: 'asc' | 'desc';
}

export interface ProductivityConfigRecord {
  id: string;
  userId: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CacheEntry<T = unknown> {
  cacheKey: string;
  provider: string;
  data: T;
  expiresAt: number;
  createdAt: number;
}

// =============================================================================
// Event Types
// =============================================================================

export interface ProductivityEvent {
  type: ProductivityEventType;
  userId: string;
  timestamp: number;
  data: unknown;
}

export type ProductivityEventType =
  | 'morning-brief.ready'
  | 'morning-brief.delivered'
  | 'email.categorized'
  | 'email.task-extracted'
  | 'task.created'
  | 'task.completed'
  | 'task.scored'
  | 'calendar.conflict-detected'
  | 'calendar.conflict-resolved'
  | 'weekly-review.ready'
  | 'weekly-review.delivered';

// =============================================================================
// Service Types
// =============================================================================

export interface ProductivityServiceConfig {
  enabled?: boolean;
}

export interface MorningBriefServiceConfig extends ProductivityServiceConfig {
  defaultDeliveryTime?: string;
  sections?: MorningBriefSectionType[];
}

export interface InboxZeroServiceConfig extends ProductivityServiceConfig {
  maxEmailsToProcess?: number;
  vipSenders?: string[];
  autoArchiveAfterDays?: number;
}

export interface EmailToTodoServiceConfig extends ProductivityServiceConfig {
  confidenceThreshold?: number;
  defaultPriority?: TodoPriority;
  defaultContext?: TodoContext;
}

export interface CalendarConflictServiceConfig extends ProductivityServiceConfig {
  lookAheadDays?: number;
  minOverlapMinutes?: number;
  autoSuggest?: boolean;
}

export interface TaskScoringServiceConfig extends ProductivityServiceConfig {
  weights?: Partial<TaskScoringWeights>;
  decayHalfLifeDays?: number;
}

export interface WeeklyReviewServiceConfig extends ProductivityServiceConfig {
  deliveryDay?: 'sunday' | 'monday';
  deliveryTime?: string;
}
