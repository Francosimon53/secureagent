/**
 * Apple Reminders Integration - AppleScript Execution
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  ReminderList,
  Reminder,
  CreateReminderInput,
  UpdateReminderInput,
  ListRemindersOptions,
  AppleScriptResult,
  ReminderPriority,
} from './types.js';
import { PRIORITY_MAP, REVERSE_PRIORITY_MAP } from './types.js';
import { IntegrationError, INTEGRATION_ERROR_CODES } from '../types.js';

const execAsync = promisify(exec);

/**
 * Execute AppleScript
 */
async function runAppleScript<T>(script: string): Promise<AppleScriptResult<T>> {
  if (process.platform !== 'darwin') {
    return {
      success: false,
      error: 'Apple Reminders is only available on macOS',
    };
  }

  try {
    const { stdout, stderr } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);

    if (stderr && !stdout) {
      return { success: false, error: stderr.trim() };
    }

    return { success: true, data: stdout.trim() as T };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AppleScript execution failed';

    // Check for specific errors
    if (message.includes('not authorized')) {
      return {
        success: false,
        error: 'Automation permission required. Please allow access in System Preferences > Security & Privacy > Privacy > Automation',
      };
    }

    return { success: false, error: message };
  }
}

/**
 * Parse AppleScript list output
 */
function parseListOutput(output: string): string[] {
  // AppleScript returns lists as {item1, item2, item3}
  const match = output.match(/^\{(.+)\}$/);
  if (!match) return output ? [output] : [];

  // Split by comma, handling quoted strings
  const items: string[] = [];
  let current = '';
  let inQuotes = false;
  let depth = 0;

  for (const char of match[1]) {
    if (char === '"' && current.slice(-1) !== '\\') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === '{') {
      depth++;
      current += char;
    } else if (char === '}') {
      depth--;
      current += char;
    } else if (char === ',' && !inQuotes && depth === 0) {
      items.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    items.push(current.trim());
  }

  return items.map((item) => item.replace(/^"|"$/g, ''));
}

/**
 * Apple Reminders AppleScript client
 */
export class AppleRemindersClient {
  /**
   * Check if Reminders is accessible
   */
  async checkAccess(): Promise<boolean> {
    const result = await runAppleScript<string>(`
      tell application "Reminders"
        return name of default list
      end tell
    `);

    return result.success;
  }

  /**
   * Get all reminder lists
   */
  async getLists(): Promise<ReminderList[]> {
    const script = `
      tell application "Reminders"
        set output to ""
        repeat with aList in lists
          set listId to id of aList
          set listName to name of aList
          set listColor to ""
          try
            set listColor to color of aList
          end try
          set isDefault to (aList is default list)
          set rCount to count of reminders in aList
          set output to output & listId & "|||" & listName & "|||" & listColor & "|||" & isDefault & "|||" & rCount & "\\n"
        end repeat
        return output
      end tell
    `;

    const result = await runAppleScript<string>(script);
    if (!result.success || !result.data) {
      throw new IntegrationError(
        result.error || 'Failed to get lists',
        INTEGRATION_ERROR_CODES.API_ERROR,
        'apple-reminders',
      );
    }

    const lists: ReminderList[] = [];
    const lines = result.data.split('\n').filter(Boolean);

    for (const line of lines) {
      const [id, name, color, isDefault, count] = line.split('|||');
      lists.push({
        id: id || '',
        name: name || '',
        color: color || undefined,
        isDefault: isDefault === 'true',
        reminderCount: parseInt(count) || 0,
      });
    }

    return lists;
  }

  /**
   * Get default list
   */
  async getDefaultList(): Promise<ReminderList | null> {
    const lists = await this.getLists();
    return lists.find((l) => l.isDefault) || lists[0] || null;
  }

  /**
   * Get reminders from a list
   */
  async getReminders(options: ListRemindersOptions = {}): Promise<Reminder[]> {
    const listFilter = options.listName
      ? `list "${options.listName}"`
      : options.listId
        ? `list id "${options.listId}"`
        : 'default list';

    const completedFilter = options.includeCompleted
      ? ''
      : 'whose completed is false';

    const script = `
      tell application "Reminders"
        set output to ""
        tell ${listFilter}
          set theListName to name
          set theListId to id
          repeat with aReminder in (reminders ${completedFilter})
            set remId to id of aReminder
            set remName to name of aReminder
            set remBody to ""
            try
              set remBody to body of aReminder
            end try
            set remCompleted to completed of aReminder
            set remCompletionDate to ""
            try
              if remCompleted then
                set remCompletionDate to (completion date of aReminder) as string
              end if
            end try
            set remDueDate to ""
            try
              set remDueDate to (due date of aReminder) as string
            end try
            set remPriority to priority of aReminder
            set remFlagged to flagged of aReminder
            set remCreated to (creation date of aReminder) as string
            set remModified to (modification date of aReminder) as string
            set output to output & remId & "|||" & remName & "|||" & remBody & "|||" & theListId & "|||" & theListName & "|||" & remCompleted & "|||" & remCompletionDate & "|||" & remDueDate & "|||" & remPriority & "|||" & remFlagged & "|||" & remCreated & "|||" & remModified & "\\n"
          end repeat
        end tell
        return output
      end tell
    `;

    const result = await runAppleScript<string>(script);
    if (!result.success || !result.data) {
      throw new IntegrationError(
        result.error || 'Failed to get reminders',
        INTEGRATION_ERROR_CODES.API_ERROR,
        'apple-reminders',
      );
    }

    const reminders: Reminder[] = [];
    const lines = result.data.split('\n').filter(Boolean);

    for (const line of lines) {
      const parts = line.split('|||');
      const [
        id,
        name,
        body,
        listId,
        listName,
        completed,
        completionDate,
        dueDate,
        priority,
        flagged,
        created,
        modified,
      ] = parts;

      const reminder: Reminder = {
        id: id || '',
        name: name || '',
        body: body || undefined,
        listId: listId || '',
        listName: listName || '',
        completed: completed === 'true',
        completionDate: completionDate ? new Date(completionDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        priority: REVERSE_PRIORITY_MAP[parseInt(priority) || 0] || 'none',
        flagged: flagged === 'true',
        creationDate: created ? new Date(created) : new Date(),
        modificationDate: modified ? new Date(modified) : new Date(),
      };

      // Apply date filters
      if (options.dueBefore && reminder.dueDate) {
        const before = new Date(options.dueBefore);
        if (reminder.dueDate > before) continue;
      }
      if (options.dueAfter && reminder.dueDate) {
        const after = new Date(options.dueAfter);
        if (reminder.dueDate < after) continue;
      }

      reminders.push(reminder);
    }

    return reminders;
  }

  /**
   * Create a new reminder
   */
  async createReminder(input: CreateReminderInput): Promise<Reminder> {
    const listTarget = input.listName
      ? `list "${input.listName}"`
      : input.listId
        ? `list id "${input.listId}"`
        : 'default list';

    const dueDatePart = input.dueDate
      ? `set due date of newReminder to date "${new Date(input.dueDate).toLocaleString()}"`
      : '';

    const priorityPart = input.priority
      ? `set priority of newReminder to ${PRIORITY_MAP[input.priority]}`
      : '';

    const flaggedPart = input.flagged !== undefined
      ? `set flagged of newReminder to ${input.flagged}`
      : '';

    const bodyPart = input.body
      ? `set body of newReminder to "${input.body.replace(/"/g, '\\"')}"`
      : '';

    const script = `
      tell application "Reminders"
        tell ${listTarget}
          set newReminder to make new reminder with properties {name:"${input.name.replace(/"/g, '\\"')}"}
          ${dueDatePart}
          ${priorityPart}
          ${flaggedPart}
          ${bodyPart}
          return id of newReminder
        end tell
      end tell
    `;

    const result = await runAppleScript<string>(script);
    if (!result.success || !result.data) {
      throw new IntegrationError(
        result.error || 'Failed to create reminder',
        INTEGRATION_ERROR_CODES.API_ERROR,
        'apple-reminders',
      );
    }

    // Get the created reminder
    const reminders = await this.getReminders({
      listName: input.listName,
      listId: input.listId,
      includeCompleted: true,
    });

    const created = reminders.find((r) => r.id === result.data);
    if (!created) {
      throw new IntegrationError(
        'Failed to find created reminder',
        INTEGRATION_ERROR_CODES.API_ERROR,
        'apple-reminders',
      );
    }

    return created;
  }

  /**
   * Update a reminder
   */
  async updateReminder(reminderId: string, input: UpdateReminderInput): Promise<Reminder> {
    const updates: string[] = [];

    if (input.name !== undefined) {
      updates.push(`set name of targetReminder to "${input.name.replace(/"/g, '\\"')}"`);
    }
    if (input.body !== undefined) {
      updates.push(`set body of targetReminder to "${input.body.replace(/"/g, '\\"')}"`);
    }
    if (input.dueDate !== undefined) {
      if (input.dueDate === null) {
        updates.push('set due date of targetReminder to missing value');
      } else {
        updates.push(`set due date of targetReminder to date "${new Date(input.dueDate).toLocaleString()}"`);
      }
    }
    if (input.priority !== undefined) {
      updates.push(`set priority of targetReminder to ${PRIORITY_MAP[input.priority]}`);
    }
    if (input.flagged !== undefined) {
      updates.push(`set flagged of targetReminder to ${input.flagged}`);
    }
    if (input.completed !== undefined) {
      updates.push(`set completed of targetReminder to ${input.completed}`);
    }

    if (updates.length === 0) {
      throw new IntegrationError(
        'No updates specified',
        INTEGRATION_ERROR_CODES.VALIDATION_ERROR,
        'apple-reminders',
      );
    }

    const script = `
      tell application "Reminders"
        set targetReminder to reminder id "${reminderId}"
        ${updates.join('\n        ')}
        return id of targetReminder
      end tell
    `;

    const result = await runAppleScript<string>(script);
    if (!result.success) {
      throw new IntegrationError(
        result.error || 'Failed to update reminder',
        INTEGRATION_ERROR_CODES.API_ERROR,
        'apple-reminders',
      );
    }

    // Get updated reminder
    const allReminders = await this.getReminders({ includeCompleted: true });
    const updated = allReminders.find((r) => r.id === reminderId);

    if (!updated) {
      throw new IntegrationError(
        'Failed to find updated reminder',
        INTEGRATION_ERROR_CODES.API_ERROR,
        'apple-reminders',
      );
    }

    return updated;
  }

  /**
   * Mark reminder as complete
   */
  async completeReminder(reminderId: string): Promise<Reminder> {
    return this.updateReminder(reminderId, { completed: true });
  }

  /**
   * Delete a reminder
   */
  async deleteReminder(reminderId: string): Promise<void> {
    const script = `
      tell application "Reminders"
        delete reminder id "${reminderId}"
      end tell
    `;

    const result = await runAppleScript<string>(script);
    if (!result.success) {
      throw new IntegrationError(
        result.error || 'Failed to delete reminder',
        INTEGRATION_ERROR_CODES.API_ERROR,
        'apple-reminders',
      );
    }
  }
}
