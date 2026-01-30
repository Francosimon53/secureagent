/**
 * Daily Driver Types
 *
 * Type definitions for productivity features
 */

// =============================================================================
// Email Types
// =============================================================================

export type EmailPriority = 'urgent' | 'high' | 'normal' | 'low';
export type EmailCategory = 'action_required' | 'follow_up' | 'fyi' | 'newsletter' | 'promotional' | 'spam';
export type EmailSentiment = 'positive' | 'neutral' | 'negative' | 'urgent';

export interface Email {
  id: string;
  threadId: string;
  from: EmailParticipant;
  to: EmailParticipant[];
  cc?: EmailParticipant[];
  subject: string;
  body: string;
  bodyPlain?: string;
  receivedAt: number;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  attachments?: EmailAttachment[];
  inReplyTo?: string;
}

export interface EmailParticipant {
  name?: string;
  email: string;
}

export interface EmailAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface EmailSummary {
  emailId: string;
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  sentiment: EmailSentiment;
  priority: EmailPriority;
  category: EmailCategory;
  suggestedReply?: string;
  estimatedReadTime: number;
}

export interface EmailThread {
  id: string;
  subject: string;
  participants: EmailParticipant[];
  emails: Email[];
  lastActivity: number;
  unreadCount: number;
  summary?: string;
}

export interface InboxStats {
  total: number;
  unread: number;
  byPriority: Record<EmailPriority, number>;
  byCategory: Record<EmailCategory, number>;
  actionRequired: number;
  averageResponseTime?: number;
}

export interface InboxZeroAction {
  type: 'archive' | 'delete' | 'label' | 'snooze' | 'reply' | 'forward' | 'star' | 'unsubscribe';
  emailId: string;
  params?: {
    label?: string;
    snoozeUntil?: number;
    replyDraft?: string;
    forwardTo?: string;
  };
}

export interface EmailFilter {
  from?: string[];
  to?: string[];
  subject?: string;
  hasAttachment?: boolean;
  isUnread?: boolean;
  priority?: EmailPriority[];
  category?: EmailCategory[];
  receivedAfter?: number;
  receivedBefore?: number;
  labels?: string[];
  excludeLabels?: string[];
}

// =============================================================================
// Calendar Types
// =============================================================================

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled';
export type EventVisibility = 'public' | 'private' | 'default';
export type ResponseStatus = 'accepted' | 'declined' | 'tentative' | 'needsAction';
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  start: number;
  end: number;
  isAllDay: boolean;
  status: EventStatus;
  visibility: EventVisibility;
  organizer: EmailParticipant;
  attendees: EventAttendee[];
  recurrence?: RecurrenceRule;
  conferenceLink?: string;
  reminders?: EventReminder[];
  attachments?: EventAttachment[];
  colorId?: string;
  iCalUID?: string;
}

export interface EventAttendee extends EmailParticipant {
  responseStatus: ResponseStatus;
  optional?: boolean;
  organizer?: boolean;
}

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  count?: number;
  until?: number;
  byDay?: string[];
  byMonth?: number[];
  byMonthDay?: number[];
}

export interface EventReminder {
  method: 'email' | 'popup' | 'sms';
  minutes: number;
}

export interface EventAttachment {
  title: string;
  fileUrl: string;
  mimeType: string;
  iconLink?: string;
}

export interface CalendarDay {
  date: number;
  events: CalendarEvent[];
  busyTime: number;
  freeTime: number;
  focusTime: number;
}

export interface WeekOverview {
  weekStart: number;
  weekEnd: number;
  days: CalendarDay[];
  totalMeetings: number;
  totalMeetingTime: number;
  focusTimeAvailable: number;
  conflicts: EventConflict[];
}

export interface EventConflict {
  event1Id: string;
  event2Id: string;
  overlapStart: number;
  overlapEnd: number;
  severity: 'overlap' | 'back_to_back' | 'travel_time';
}

export interface CalendarFilter {
  calendarIds?: string[];
  startAfter?: number;
  startBefore?: number;
  includeAllDay?: boolean;
  excludeCancelled?: boolean;
  searchQuery?: string;
}

// =============================================================================
// Task Types
// =============================================================================

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'deferred';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskEnergyLevel = 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: number;
  estimatedMinutes?: number;
  actualMinutes?: number;
  energyRequired: TaskEnergyLevel;
  tags: string[];
  projectId?: string;
  parentTaskId?: string;
  subtasks?: string[];
  dependencies?: string[];
  assignee?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  recurring?: RecurrenceRule;
  context?: TaskContext[];
  score?: number;
}

export type TaskContext = 'home' | 'office' | 'phone' | 'computer' | 'errand' | 'anywhere';

export interface TaskScore {
  taskId: string;
  totalScore: number;
  breakdown: {
    urgency: number;
    importance: number;
    effort: number;
    context: number;
    dependencies: number;
    energy: number;
  };
  recommendation: 'do_now' | 'schedule' | 'delegate' | 'defer' | 'eliminate';
  reasoning: string;
}

export interface TaskFilter {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  tags?: string[];
  projectId?: string;
  dueBefore?: number;
  dueAfter?: number;
  hasSubtasks?: boolean;
  energyLevel?: TaskEnergyLevel[];
  context?: TaskContext[];
}

// =============================================================================
// Morning Brief Types
// =============================================================================

export interface MorningBrief {
  date: number;
  greeting: string;
  weather?: WeatherInfo;
  schedule: ScheduleOverview;
  emails: EmailOverview;
  tasks: TaskOverview;
  highlights: BriefHighlight[];
  reminders: string[];
  motivationalQuote?: string;
}

export interface WeatherInfo {
  location: string;
  current: {
    temp: number;
    feelsLike: number;
    condition: string;
    icon: string;
  };
  forecast: Array<{
    time: number;
    temp: number;
    condition: string;
    precipChance: number;
  }>;
  alerts?: string[];
}

export interface ScheduleOverview {
  firstEvent?: CalendarEvent;
  nextEvent?: CalendarEvent;
  meetingCount: number;
  totalMeetingTime: number;
  focusTimeBlocks: Array<{ start: number; end: number }>;
  conflicts: EventConflict[];
  busyPercentage: number;
}

export interface EmailOverview {
  unreadCount: number;
  urgentCount: number;
  actionRequiredCount: number;
  topPriority: EmailSummary[];
  vipEmails: EmailSummary[];
}

export interface TaskOverview {
  dueToday: Task[];
  overdue: Task[];
  highPriority: Task[];
  suggestedFocus: Task[];
  completedYesterday: number;
}

export interface BriefHighlight {
  type: 'meeting' | 'deadline' | 'birthday' | 'reminder' | 'goal' | 'milestone';
  title: string;
  description: string;
  time?: number;
  icon?: string;
}

export interface MorningBriefPreferences {
  userId: string;
  deliveryTime: string; // HH:mm format
  timezone: string;
  includeWeather: boolean;
  weatherLocation?: string;
  includeMotivationalQuote: boolean;
  vipContacts: string[];
  focusAreas: string[];
  customReminders: string[];
}

// =============================================================================
// Weekly Review Types
// =============================================================================

export interface WeeklyReview {
  weekStart: number;
  weekEnd: number;
  summary: WeeklySummary;
  accomplishments: Accomplishment[];
  insights: ReviewInsight[];
  goals: GoalProgress[];
  nextWeekFocus: string[];
  recommendations: ReviewRecommendation[];
}

export interface WeeklySummary {
  tasksCompleted: number;
  tasksCreated: number;
  tasksOverdue: number;
  meetingsAttended: number;
  meetingHours: number;
  emailsSent: number;
  emailsReceived: number;
  focusHours: number;
  productivityScore: number;
}

export interface Accomplishment {
  type: 'task' | 'project' | 'milestone' | 'habit';
  title: string;
  description?: string;
  completedAt: number;
  impact: 'high' | 'medium' | 'low';
}

export interface ReviewInsight {
  category: 'productivity' | 'time_management' | 'communication' | 'focus' | 'balance';
  insight: string;
  trend: 'improving' | 'stable' | 'declining';
  suggestion?: string;
}

export interface GoalProgress {
  goalId: string;
  title: string;
  progress: number;
  target: number;
  unit: string;
  onTrack: boolean;
  daysRemaining?: number;
}

export interface ReviewRecommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  recommendation: string;
  actionable: boolean;
  relatedTasks?: string[];
}

// =============================================================================
// Meeting Prep Types
// =============================================================================

export interface MeetingPrep {
  eventId: string;
  event: CalendarEvent;
  preparedAt: number;
  participants: ParticipantInfo[];
  context: MeetingContext;
  agenda?: AgendaItem[];
  talkingPoints: string[];
  questions: string[];
  documents: PrepDocument[];
  previousMeetings: MeetingHistory[];
  reminders: string[];
}

export interface ParticipantInfo extends EmailParticipant {
  role?: string;
  company?: string;
  title?: string;
  lastInteraction?: number;
  notes?: string;
  linkedInUrl?: string;
  recentEmails?: EmailSummary[];
}

export interface MeetingContext {
  purpose: string;
  type: 'one_on_one' | 'team' | 'external' | 'interview' | 'presentation' | 'brainstorm' | 'review';
  isRecurring: boolean;
  seriesHistory?: MeetingHistory[];
  relatedProjects?: string[];
  goals?: string[];
}

export interface AgendaItem {
  title: string;
  duration: number;
  owner?: string;
  notes?: string;
  status?: 'pending' | 'discussed' | 'deferred';
}

export interface PrepDocument {
  title: string;
  type: 'attachment' | 'email' | 'note' | 'external';
  url?: string;
  summary?: string;
  relevance: string;
}

export interface MeetingHistory {
  eventId: string;
  date: number;
  title: string;
  attendees: string[];
  notes?: string;
  actionItems?: string[];
  outcome?: string;
}

// =============================================================================
// Provider Interfaces
// =============================================================================

export interface EmailProvider {
  name: string;
  listEmails(filter: EmailFilter, options?: { limit?: number; offset?: number }): Promise<Email[]>;
  getEmail(id: string): Promise<Email | null>;
  getThread(threadId: string): Promise<EmailThread | null>;
  markAsRead(ids: string[]): Promise<void>;
  markAsUnread(ids: string[]): Promise<void>;
  archive(ids: string[]): Promise<void>;
  trash(ids: string[]): Promise<void>;
  label(ids: string[], labelId: string): Promise<void>;
  unlabel(ids: string[], labelId: string): Promise<void>;
  star(ids: string[]): Promise<void>;
  unstar(ids: string[]): Promise<void>;
  sendEmail(to: string[], subject: string, body: string, options?: { cc?: string[]; bcc?: string[]; replyTo?: string }): Promise<string>;
  createDraft(to: string[], subject: string, body: string): Promise<string>;
}

export interface CalendarProvider {
  name: string;
  listEvents(filter: CalendarFilter): Promise<CalendarEvent[]>;
  getEvent(calendarId: string, eventId: string): Promise<CalendarEvent | null>;
  createEvent(calendarId: string, event: Omit<CalendarEvent, 'id' | 'calendarId'>): Promise<CalendarEvent>;
  updateEvent(calendarId: string, eventId: string, updates: Partial<CalendarEvent>): Promise<CalendarEvent | null>;
  deleteEvent(calendarId: string, eventId: string): Promise<boolean>;
  respondToEvent(calendarId: string, eventId: string, response: ResponseStatus): Promise<void>;
  getFreeBusy(calendarIds: string[], start: number, end: number): Promise<Array<{ start: number; end: number }>>;
}

export interface TaskProvider {
  name: string;
  listTasks(filter: TaskFilter): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;
  completeTask(id: string): Promise<Task | null>;
  reorderTasks(taskIds: string[]): Promise<void>;
}

export interface WeatherProvider {
  name: string;
  getCurrentWeather(location: string): Promise<WeatherInfo['current']>;
  getForecast(location: string, hours: number): Promise<WeatherInfo['forecast']>;
  getAlerts(location: string): Promise<string[]>;
}

// =============================================================================
// Error Types
// =============================================================================

export type DailyDriverErrorCode =
  | 'PROVIDER_ERROR'
  | 'NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'CONFIGURATION_ERROR'
  | 'AI_ERROR'
  | 'UNKNOWN_ERROR';

export class DailyDriverError extends Error {
  constructor(
    public readonly code: DailyDriverErrorCode,
    message: string,
    public readonly provider?: string
  ) {
    super(message);
    this.name = 'DailyDriverError';
  }
}
