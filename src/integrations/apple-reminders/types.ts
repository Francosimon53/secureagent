/**
 * Apple Reminders Integration - Types
 */

/**
 * Reminder list
 */
export interface ReminderList {
  id: string;
  name: string;
  color?: string;
  isDefault: boolean;
  reminderCount: number;
}

/**
 * Reminder item
 */
export interface Reminder {
  id: string;
  name: string;
  body?: string;
  listId: string;
  listName: string;
  completed: boolean;
  completionDate?: Date;
  dueDate?: Date;
  dueTime?: string;
  priority: ReminderPriority;
  flagged: boolean;
  notes?: string;
  url?: string;
  creationDate: Date;
  modificationDate: Date;
}

/**
 * Reminder priority
 */
export type ReminderPriority = 'none' | 'low' | 'medium' | 'high';

/**
 * Priority mapping for AppleScript
 */
export const PRIORITY_MAP: Record<ReminderPriority, number> = {
  none: 0,
  low: 9,
  medium: 5,
  high: 1,
};

export const REVERSE_PRIORITY_MAP: Record<number, ReminderPriority> = {
  0: 'none',
  1: 'high',
  5: 'medium',
  9: 'low',
};

/**
 * Create reminder input
 */
export interface CreateReminderInput {
  name: string;
  listId?: string;
  listName?: string;
  body?: string;
  dueDate?: Date | string;
  priority?: ReminderPriority;
  flagged?: boolean;
  notes?: string;
  url?: string;
}

/**
 * Update reminder input
 */
export interface UpdateReminderInput {
  name?: string;
  body?: string;
  dueDate?: Date | string | null;
  priority?: ReminderPriority;
  flagged?: boolean;
  notes?: string;
  completed?: boolean;
}

/**
 * List reminders options
 */
export interface ListRemindersOptions {
  listId?: string;
  listName?: string;
  includeCompleted?: boolean;
  dueBefore?: Date | string;
  dueAfter?: Date | string;
}

/**
 * AppleScript execution result
 */
export interface AppleScriptResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
