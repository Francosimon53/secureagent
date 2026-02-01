/**
 * Apple Reminders Integration - Tool Definitions
 */

import type { ToolDefinition } from '../types.js';
import type { AppleRemindersClient } from './osascript.js';
import type { ReminderPriority } from './types.js';

/**
 * Create Apple Reminders tools
 */
export function createAppleRemindersTools(
  client: AppleRemindersClient,
): ToolDefinition[] {
  return [
    createListListsTool(client),
    createListRemindersTool(client),
    createCreateReminderTool(client),
    createCompleteReminderTool(client),
    createUpdateReminderTool(client),
    createDeleteReminderTool(client),
  ];
}

/**
 * List reminder lists
 */
function createListListsTool(client: AppleRemindersClient): ToolDefinition {
  return {
    name: 'reminders_list_lists',
    description: 'List all reminder lists in Apple Reminders.',
    parameters: [],
    riskLevel: 'low',
    execute: async () => {
      try {
        const lists = await client.getLists();

        return {
          success: true,
          data: {
            lists: lists.map((l) => ({
              id: l.id,
              name: l.name,
              isDefault: l.isDefault,
              reminderCount: l.reminderCount,
            })),
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list lists',
        };
      }
    },
  };
}

/**
 * List reminders
 */
function createListRemindersTool(client: AppleRemindersClient): ToolDefinition {
  return {
    name: 'reminders_list_items',
    description: 'List reminders in a specific list or all lists.',
    parameters: [
      {
        name: 'listName',
        type: 'string',
        description: 'Name of the list (optional, defaults to all lists)',
        required: false,
      },
      {
        name: 'includeCompleted',
        type: 'boolean',
        description: 'Include completed reminders (default: false)',
        required: false,
        default: false,
      },
      {
        name: 'dueBefore',
        type: 'string',
        description: 'Only reminders due before this date (ISO 8601)',
        required: false,
      },
      {
        name: 'dueAfter',
        type: 'string',
        description: 'Only reminders due after this date (ISO 8601)',
        required: false,
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        const reminders = await client.getReminders({
          listName: params.listName as string | undefined,
          includeCompleted: params.includeCompleted as boolean,
          dueBefore: params.dueBefore as string | undefined,
          dueAfter: params.dueAfter as string | undefined,
        });

        return {
          success: true,
          data: {
            reminders: reminders.map((r) => ({
              id: r.id,
              name: r.name,
              body: r.body,
              listName: r.listName,
              completed: r.completed,
              dueDate: r.dueDate?.toISOString(),
              priority: r.priority,
              flagged: r.flagged,
            })),
            total: reminders.length,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to list reminders',
        };
      }
    },
  };
}

/**
 * Create reminder
 */
function createCreateReminderTool(client: AppleRemindersClient): ToolDefinition {
  return {
    name: 'reminders_create',
    description: 'Create a new reminder in Apple Reminders.',
    parameters: [
      {
        name: 'name',
        type: 'string',
        description: 'Reminder title',
        required: true,
      },
      {
        name: 'listName',
        type: 'string',
        description: 'Name of the list (optional, uses default list)',
        required: false,
      },
      {
        name: 'body',
        type: 'string',
        description: 'Reminder notes/body',
        required: false,
      },
      {
        name: 'dueDate',
        type: 'string',
        description: 'Due date (ISO 8601 format)',
        required: false,
      },
      {
        name: 'priority',
        type: 'string',
        description: 'Priority: none, low, medium, high',
        required: false,
        enum: ['none', 'low', 'medium', 'high'],
      },
      {
        name: 'flagged',
        type: 'boolean',
        description: 'Whether to flag the reminder',
        required: false,
        default: false,
      },
    ],
    riskLevel: 'medium',
    execute: async (params) => {
      try {
        const reminder = await client.createReminder({
          name: params.name as string,
          listName: params.listName as string | undefined,
          body: params.body as string | undefined,
          dueDate: params.dueDate as string | undefined,
          priority: params.priority as ReminderPriority | undefined,
          flagged: params.flagged as boolean | undefined,
        });

        return {
          success: true,
          data: {
            id: reminder.id,
            name: reminder.name,
            listName: reminder.listName,
            dueDate: reminder.dueDate?.toISOString(),
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to create reminder',
        };
      }
    },
  };
}

/**
 * Complete reminder
 */
function createCompleteReminderTool(
  client: AppleRemindersClient,
): ToolDefinition {
  return {
    name: 'reminders_complete',
    description: 'Mark a reminder as complete.',
    parameters: [
      {
        name: 'reminderId',
        type: 'string',
        description: 'The ID of the reminder to complete',
        required: true,
      },
    ],
    riskLevel: 'medium',
    execute: async (params) => {
      try {
        const reminder = await client.completeReminder(params.reminderId as string);

        return {
          success: true,
          data: {
            id: reminder.id,
            name: reminder.name,
            completed: reminder.completed,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to complete reminder',
        };
      }
    },
  };
}

/**
 * Update reminder
 */
function createUpdateReminderTool(client: AppleRemindersClient): ToolDefinition {
  return {
    name: 'reminders_update',
    description: 'Update an existing reminder.',
    parameters: [
      {
        name: 'reminderId',
        type: 'string',
        description: 'The ID of the reminder to update',
        required: true,
      },
      {
        name: 'name',
        type: 'string',
        description: 'New title',
        required: false,
      },
      {
        name: 'body',
        type: 'string',
        description: 'New notes/body',
        required: false,
      },
      {
        name: 'dueDate',
        type: 'string',
        description: 'New due date (ISO 8601, or empty to clear)',
        required: false,
      },
      {
        name: 'priority',
        type: 'string',
        description: 'New priority: none, low, medium, high',
        required: false,
        enum: ['none', 'low', 'medium', 'high'],
      },
      {
        name: 'flagged',
        type: 'boolean',
        description: 'Whether to flag the reminder',
        required: false,
      },
    ],
    riskLevel: 'medium',
    execute: async (params) => {
      try {
        const reminder = await client.updateReminder(params.reminderId as string, {
          name: params.name as string | undefined,
          body: params.body as string | undefined,
          dueDate:
            params.dueDate === ''
              ? null
              : (params.dueDate as string | undefined),
          priority: params.priority as ReminderPriority | undefined,
          flagged: params.flagged as boolean | undefined,
        });

        return {
          success: true,
          data: {
            id: reminder.id,
            name: reminder.name,
            dueDate: reminder.dueDate?.toISOString(),
            priority: reminder.priority,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to update reminder',
        };
      }
    },
  };
}

/**
 * Delete reminder
 */
function createDeleteReminderTool(client: AppleRemindersClient): ToolDefinition {
  return {
    name: 'reminders_delete',
    description: 'Delete a reminder.',
    parameters: [
      {
        name: 'reminderId',
        type: 'string',
        description: 'The ID of the reminder to delete',
        required: true,
      },
    ],
    riskLevel: 'high',
    execute: async (params) => {
      try {
        await client.deleteReminder(params.reminderId as string);

        return {
          success: true,
          data: { deleted: true, reminderId: params.reminderId },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to delete reminder',
        };
      }
    },
  };
}
