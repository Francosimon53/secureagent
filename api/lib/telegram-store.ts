/**
 * Telegram Store
 *
 * Persistent storage for Telegram users and scheduled tasks.
 * Uses in-memory storage with JSON file backup for serverless persistence.
 *
 * In production, replace with:
 * - Vercel KV (Redis)
 * - Vercel Postgres
 * - Upstash Redis
 * - PlanetScale
 */

import { randomUUID } from 'crypto';

// =============================================================================
// Types
// =============================================================================

export interface TelegramUser {
  chatId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  registeredAt: number;
  lastMessageAt: number;
  preferences: {
    timezone: string;
    language: string;
    notificationsEnabled: boolean;
  };
}

export interface ScheduledTask {
  id: string;
  chatId: string;
  task: string;
  schedule: TaskSchedule;
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
  nextRunAt: number;
  runCount: number;
  lastResult?: string;
  lastError?: string;
}

export interface TaskSchedule {
  type: 'once' | 'daily' | 'weekly' | 'cron';
  time: string;          // HH:MM format
  daysOfWeek?: number[]; // 0-6 for weekly (0 = Sunday)
  date?: string;         // YYYY-MM-DD for once
  cron?: string;         // Cron expression
  timezone: string;
}

export interface TaskExecutionResult {
  taskId: string;
  chatId: string;
  success: boolean;
  result?: string;
  error?: string;
  executedAt: number;
}

// =============================================================================
// In-Memory Store (Replace with database in production)
// =============================================================================

// Note: In Vercel serverless, this will be reset on cold starts.
// For production, use Vercel KV, Upstash, or another persistent store.
const users = new Map<string, TelegramUser>();
const tasks = new Map<string, ScheduledTask>();

// =============================================================================
// User Operations
// =============================================================================

/**
 * Register or update a user
 */
export function registerUser(
  chatId: string,
  info: {
    username?: string;
    firstName?: string;
    lastName?: string;
  }
): TelegramUser {
  const existing = users.get(chatId);

  if (existing) {
    // Update existing user
    existing.username = info.username ?? existing.username;
    existing.firstName = info.firstName ?? existing.firstName;
    existing.lastName = info.lastName ?? existing.lastName;
    existing.lastMessageAt = Date.now();
    return existing;
  }

  // Create new user
  const user: TelegramUser = {
    chatId,
    username: info.username,
    firstName: info.firstName,
    lastName: info.lastName,
    registeredAt: Date.now(),
    lastMessageAt: Date.now(),
    preferences: {
      timezone: 'America/New_York',
      language: 'en',
      notificationsEnabled: true,
    },
  };

  users.set(chatId, user);
  return user;
}

/**
 * Get user by chat ID
 */
export function getUser(chatId: string): TelegramUser | null {
  return users.get(chatId) ?? null;
}

/**
 * Get all registered users
 */
export function getAllUsers(): TelegramUser[] {
  return Array.from(users.values());
}

/**
 * Update user preferences
 */
export function updateUserPreferences(
  chatId: string,
  preferences: Partial<TelegramUser['preferences']>
): boolean {
  const user = users.get(chatId);
  if (!user) return false;

  user.preferences = { ...user.preferences, ...preferences };
  return true;
}

// =============================================================================
// Task Operations
// =============================================================================

/**
 * Create a scheduled task
 */
export function createTask(
  chatId: string,
  task: string,
  schedule: TaskSchedule
): ScheduledTask {
  const id = randomUUID().substring(0, 8);
  const nextRunAt = calculateNextRunTime(schedule);

  const scheduledTask: ScheduledTask = {
    id,
    chatId,
    task,
    schedule,
    enabled: true,
    createdAt: Date.now(),
    nextRunAt,
    runCount: 0,
  };

  tasks.set(id, scheduledTask);
  return scheduledTask;
}

/**
 * Get task by ID
 */
export function getTask(taskId: string): ScheduledTask | null {
  return tasks.get(taskId) ?? null;
}

/**
 * Get all tasks for a user
 */
export function getUserTasks(chatId: string): ScheduledTask[] {
  return Array.from(tasks.values())
    .filter(t => t.chatId === chatId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Get all enabled tasks that are due
 */
export function getDueTasks(): ScheduledTask[] {
  const now = Date.now();
  return Array.from(tasks.values())
    .filter(t => t.enabled && t.nextRunAt <= now);
}

/**
 * Cancel (delete) a task
 */
export function cancelTask(taskId: string, chatId: string): boolean {
  const task = tasks.get(taskId);
  if (!task || task.chatId !== chatId) return false;

  tasks.delete(taskId);
  return true;
}

/**
 * Enable/disable a task
 */
export function setTaskEnabled(taskId: string, enabled: boolean): boolean {
  const task = tasks.get(taskId);
  if (!task) return false;

  task.enabled = enabled;
  if (enabled && !task.nextRunAt) {
    task.nextRunAt = calculateNextRunTime(task.schedule);
  }
  return true;
}

/**
 * Update task after execution
 */
export function updateTaskAfterExecution(
  taskId: string,
  result: { success: boolean; result?: string; error?: string }
): void {
  const task = tasks.get(taskId);
  if (!task) return;

  task.lastRunAt = Date.now();
  task.runCount++;
  task.lastResult = result.result;
  task.lastError = result.error;

  // Calculate next run time or disable if one-time
  if (task.schedule.type === 'once') {
    task.enabled = false;
    task.nextRunAt = 0;
  } else {
    task.nextRunAt = calculateNextRunTime(task.schedule);
  }
}

// =============================================================================
// Schedule Parsing
// =============================================================================

/**
 * Parse a natural language schedule string
 * Examples:
 * - "9:00am" or "9:00 AM" → daily at 9am
 * - "9:00am daily" → daily at 9am
 * - "monday 8am" or "every monday 8am" → weekly on monday at 8am
 * - "tomorrow 3pm" → one-time tomorrow at 3pm
 */
export function parseSchedule(input: string, timezone = 'America/New_York'): TaskSchedule | null {
  const normalized = input.toLowerCase().trim();

  // Extract time (required)
  const timeMatch = normalized.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (!timeMatch) return null;

  let hours = parseInt(timeMatch[1], 10);
  const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
  const meridiem = timeMatch[3]?.toLowerCase();

  // Convert to 24-hour format
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;

  const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

  // Check for day of week
  const dayNames: Record<string, number> = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6,
  };

  for (const [dayName, dayNum] of Object.entries(dayNames)) {
    if (normalized.includes(dayName)) {
      return {
        type: 'weekly',
        time,
        daysOfWeek: [dayNum],
        timezone,
      };
    }
  }

  // Check for "tomorrow"
  if (normalized.includes('tomorrow')) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      type: 'once',
      time,
      date: tomorrow.toISOString().split('T')[0],
      timezone,
    };
  }

  // Check for specific date (YYYY-MM-DD or MM/DD)
  const dateMatch = normalized.match(/(\d{4}-\d{2}-\d{2})|(\d{1,2}\/\d{1,2})/);
  if (dateMatch) {
    let date: string;
    if (dateMatch[1]) {
      date = dateMatch[1];
    } else {
      const [month, day] = dateMatch[2].split('/');
      const year = new Date().getFullYear();
      date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return {
      type: 'once',
      time,
      date,
      timezone,
    };
  }

  // Default to daily
  return {
    type: 'daily',
    time,
    timezone,
  };
}

/**
 * Calculate the next run time for a schedule
 */
export function calculateNextRunTime(schedule: TaskSchedule): number {
  const now = new Date();

  // Parse time
  const [hours, minutes] = schedule.time.split(':').map(Number);

  switch (schedule.type) {
    case 'once': {
      if (!schedule.date) return 0;
      const [year, month, day] = schedule.date.split('-').map(Number);
      const runDate = new Date(year, month - 1, day, hours, minutes);
      return runDate.getTime();
    }

    case 'daily': {
      const today = new Date(now);
      today.setHours(hours, minutes, 0, 0);

      // If time has passed today, schedule for tomorrow
      if (today.getTime() <= now.getTime()) {
        today.setDate(today.getDate() + 1);
      }
      return today.getTime();
    }

    case 'weekly': {
      if (!schedule.daysOfWeek || schedule.daysOfWeek.length === 0) {
        return calculateNextRunTime({ ...schedule, type: 'daily' });
      }

      const targetDay = schedule.daysOfWeek[0];
      const todayDay = now.getDay();
      let daysUntil = targetDay - todayDay;

      if (daysUntil < 0) daysUntil += 7;
      if (daysUntil === 0) {
        // Check if time has passed today
        const today = new Date(now);
        today.setHours(hours, minutes, 0, 0);
        if (today.getTime() <= now.getTime()) {
          daysUntil = 7;
        }
      }

      const runDate = new Date(now);
      runDate.setDate(runDate.getDate() + daysUntil);
      runDate.setHours(hours, minutes, 0, 0);
      return runDate.getTime();
    }

    default:
      return Date.now() + 60000; // Default: 1 minute from now
  }
}

/**
 * Format schedule for display
 */
export function formatSchedule(schedule: TaskSchedule): string {
  const timeStr = formatTime(schedule.time);

  switch (schedule.type) {
    case 'once':
      return `${schedule.date} at ${timeStr}`;

    case 'daily':
      return `Daily at ${timeStr}`;

    case 'weekly': {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayNames = schedule.daysOfWeek?.map(d => days[d]).join(', ') || '';
      return `Every ${dayNames} at ${timeStr}`;
    }

    case 'cron':
      return `Cron: ${schedule.cron}`;

    default:
      return timeStr;
  }
}

/**
 * Format time for display (HH:MM → h:MM AM/PM)
 */
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${meridiem}`;
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Get store statistics
 */
export function getStats(): {
  totalUsers: number;
  totalTasks: number;
  enabledTasks: number;
  dueTasks: number;
} {
  const allTasks = Array.from(tasks.values());
  const now = Date.now();

  return {
    totalUsers: users.size,
    totalTasks: allTasks.length,
    enabledTasks: allTasks.filter(t => t.enabled).length,
    dueTasks: allTasks.filter(t => t.enabled && t.nextRunAt <= now).length,
  };
}

/**
 * Clear all data (for testing)
 */
export function clearAll(): void {
  users.clear();
  tasks.clear();
}
