/**
 * Voice Calls Tools
 *
 * AI agent tools for voice call functionality.
 */

import type { VoiceCallsManager } from './manager.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Create voice call tools for the AI agent
 */
export function createVoiceCallTools(manager: VoiceCallsManager): ToolDefinition[] {
  return [
    // Make a phone call
    {
      name: 'voice_make_call',
      description: 'Make an outbound phone call. Can use AI to handle the conversation automatically for tasks like scheduling appointments, making reservations, or delivering messages.',
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Phone number to call (E.164 format or contact name)',
          },
          task: {
            type: 'string',
            description: 'The task for the AI to accomplish on the call (e.g., "schedule a dentist appointment for next Tuesday")',
          },
          useAI: {
            type: 'boolean',
            description: 'Whether to use AI to handle the call automatically',
          },
          context: {
            type: 'object',
            description: 'Additional context for the call (e.g., preferred times, party size)',
          },
        },
        required: ['to'],
      },
      riskLevel: 'high',
    },

    // Send SMS
    {
      name: 'voice_send_sms',
      description: 'Send a text message (SMS) to a phone number.',
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Phone number or contact name to send the message to',
          },
          message: {
            type: 'string',
            description: 'The text message to send',
          },
        },
        required: ['to', 'message'],
      },
      riskLevel: 'medium',
    },

    // Get call history
    {
      name: 'voice_get_call_history',
      description: 'Get recent call history including call details, recordings, and transcriptions.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of calls to return',
          },
          direction: {
            type: 'string',
            description: 'Filter by call direction',
            enum: ['inbound', 'outbound', 'all'],
          },
        },
        required: [],
      },
      riskLevel: 'low',
    },

    // Get voicemails
    {
      name: 'voice_get_voicemails',
      description: 'Get voicemail messages with transcriptions.',
      parameters: {
        type: 'object',
        properties: {
          unreadOnly: {
            type: 'boolean',
            description: 'Only return unread voicemails',
          },
        },
        required: [],
      },
      riskLevel: 'low',
    },

    // Manage contacts
    {
      name: 'voice_manage_contact',
      description: 'Add, update, or get contact information.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform',
            enum: ['add', 'update', 'get', 'list'],
          },
          name: {
            type: 'string',
            description: 'Contact name',
          },
          phoneNumber: {
            type: 'string',
            description: 'Phone number',
          },
          email: {
            type: 'string',
            description: 'Email address',
          },
          tags: {
            type: 'string',
            description: 'Comma-separated tags (e.g., "family,important")',
          },
        },
        required: ['action'],
      },
      riskLevel: 'low',
    },

    // Set up call handling rule
    {
      name: 'voice_set_call_rule',
      description: 'Configure how incoming calls should be handled based on conditions.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Rule name',
          },
          callerCondition: {
            type: 'string',
            description: 'Caller ID condition (e.g., "contains:+1415" or "contact_tag:family")',
          },
          timeCondition: {
            type: 'string',
            description: 'Time condition (e.g., "09:00-17:00" or "weekdays")',
          },
          action: {
            type: 'string',
            description: 'Action to take',
            enum: ['answer_ai', 'forward', 'voicemail', 'reject', 'sms_response'],
          },
          actionParams: {
            type: 'object',
            description: 'Parameters for the action (e.g., forward number, message text)',
          },
        },
        required: ['name', 'action'],
      },
      riskLevel: 'medium',
    },

    // Create conference call
    {
      name: 'voice_conference_call',
      description: 'Create a conference call with multiple participants.',
      parameters: {
        type: 'object',
        properties: {
          participants: {
            type: 'string',
            description: 'Comma-separated phone numbers or contact names',
          },
          name: {
            type: 'string',
            description: 'Conference name',
          },
        },
        required: ['participants'],
      },
      riskLevel: 'high',
    },

    // Voice settings
    {
      name: 'voice_settings',
      description: 'Get or update voice call settings like greeting, voicemail, auto-answer.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Get or set settings',
            enum: ['get', 'set'],
          },
          greeting: {
            type: 'string',
            description: 'Greeting message for AI calls',
          },
          voicemailGreeting: {
            type: 'string',
            description: 'Voicemail greeting message',
          },
          autoAnswer: {
            type: 'boolean',
            description: 'Automatically answer calls with AI',
          },
          callScreening: {
            type: 'boolean',
            description: 'Screen incoming calls',
          },
        },
        required: ['action'],
      },
      riskLevel: 'low',
    },

    // Voice clone management
    {
      name: 'voice_clone',
      description: 'Manage voice cloning - clone your voice for AI to use on calls.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Action to perform',
            enum: ['list_voices', 'get_clone', 'delete_clone', 'get_guidelines'],
          },
          cloneId: {
            type: 'string',
            description: 'Voice clone ID (for get/delete)',
          },
        },
        required: ['action'],
      },
      riskLevel: 'low',
    },
  ];
}

/**
 * Execute a voice call tool
 */
export async function executeVoiceCallTool(
  manager: VoiceCallsManager,
  toolName: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'voice_make_call': {
        const to = resolvePhoneNumber(manager, params.to as string);

        if (params.useAI || params.task) {
          const call = await manager.makeAICall({
            to,
            task: params.task as string || 'Have a conversation',
            context: params.context as Record<string, unknown>,
          });

          return {
            success: true,
            data: {
              callId: call.id,
              status: call.status,
              message: `AI call initiated to ${to}. The AI will handle: ${params.task || 'the conversation'}`,
            },
          };
        }

        const call = await manager.makeCall({
          to,
          record: true,
        });

        return {
          success: true,
          data: {
            callId: call.id,
            status: call.status,
            message: `Call initiated to ${to}`,
          },
        };
      }

      case 'voice_send_sms': {
        const to = resolvePhoneNumber(manager, params.to as string);

        const message = await manager.sendSMS({
          to,
          body: params.message as string,
        });

        return {
          success: true,
          data: {
            messageId: message.id,
            status: message.status,
            message: `SMS sent to ${to}`,
          },
        };
      }

      case 'voice_get_call_history': {
        let calls = manager.getCallHistory();

        if (params.direction && params.direction !== 'all') {
          calls = calls.filter((c) => c.direction === params.direction);
        }

        if (params.limit) {
          calls = calls.slice(0, params.limit as number);
        }

        return {
          success: true,
          data: calls.map((c) => ({
            id: c.id,
            direction: c.direction,
            status: c.status,
            from: c.from,
            to: c.to,
            duration: c.duration,
            timestamp: new Date(c.startTime).toISOString(),
            hasRecording: !!c.recordingUrl,
            hasVoicemail: !!c.voicemailUrl,
            transcription: c.transcription || c.voicemailTranscription,
          })),
        };
      }

      case 'voice_get_voicemails': {
        const calls = manager.getCallHistory()
          .filter((c) => c.voicemailUrl);

        return {
          success: true,
          data: calls.map((c) => ({
            id: c.id,
            from: c.from,
            timestamp: new Date(c.startTime).toISOString(),
            duration: c.duration,
            transcription: c.voicemailTranscription,
            audioUrl: c.voicemailUrl,
          })),
        };
      }

      case 'voice_manage_contact': {
        const action = params.action as string;

        if (action === 'list') {
          return {
            success: true,
            data: manager.getContacts(),
          };
        }

        if (action === 'get') {
          const contact = manager.findContactByNumber(params.phoneNumber as string) ||
            manager.getContacts().find((c) => c.name.toLowerCase() === (params.name as string)?.toLowerCase());

          if (!contact) {
            return { success: false, error: 'Contact not found' };
          }

          return { success: true, data: contact };
        }

        if (action === 'add') {
          const contact = manager.addContact({
            name: params.name as string,
            phoneNumbers: [{
              type: 'mobile',
              number: params.phoneNumber as string,
            }],
            email: params.email as string,
            tags: params.tags ? (params.tags as string).split(',').map((t) => t.trim()) : [],
          });

          return {
            success: true,
            data: contact,
          };
        }

        return { success: false, error: `Unknown action: ${action}` };
      }

      case 'voice_set_call_rule': {
        const conditions: Array<{
          type: 'caller_id' | 'time_of_day' | 'contact_tag';
          operator: 'equals' | 'contains' | 'in_range';
          value: string | { start: string; end: string };
        }> = [];

        if (params.callerCondition) {
          const [type, value] = (params.callerCondition as string).split(':');
          conditions.push({
            type: type === 'contact_tag' ? 'contact_tag' : 'caller_id',
            operator: 'contains',
            value,
          });
        }

        if (params.timeCondition) {
          const timeStr = params.timeCondition as string;
          if (timeStr.includes('-')) {
            const [start, end] = timeStr.split('-');
            conditions.push({
              type: 'time_of_day',
              operator: 'in_range',
              value: { start, end },
            });
          }
        }

        const rule = manager.addCallRule({
          name: params.name as string,
          enabled: true,
          priority: 10,
          conditions,
          actions: [{
            type: params.action as 'answer_ai' | 'forward' | 'voicemail' | 'reject' | 'sms_response',
            params: params.actionParams as Record<string, unknown>,
          }],
        });

        return {
          success: true,
          data: {
            ruleId: rule.id,
            message: `Call handling rule "${rule.name}" created`,
          },
        };
      }

      case 'voice_conference_call': {
        const callFeatures = manager.getCallFeatures();
        if (!callFeatures) {
          return { success: false, error: 'Call features not available' };
        }

        const participants = (params.participants as string)
          .split(',')
          .map((p) => resolvePhoneNumber(manager, p.trim()));

        const conference = await callFeatures.createConference({
          name: params.name as string || `Conference ${Date.now()}`,
          participants,
          record: true,
        });

        return {
          success: true,
          data: {
            conferenceId: conference.id,
            participants: conference.participants.length,
            message: `Conference call started with ${participants.length} participants`,
          },
        };
      }

      case 'voice_settings': {
        if (params.action === 'get') {
          return {
            success: true,
            data: manager.getVoiceSettings(),
          };
        }

        if (params.action === 'set') {
          const updates: Record<string, unknown> = {};
          if (params.greeting !== undefined) updates.greeting = params.greeting;
          if (params.voicemailGreeting !== undefined) updates.voicemailGreeting = params.voicemailGreeting;
          if (params.autoAnswer !== undefined) updates.autoAnswer = params.autoAnswer;
          if (params.callScreening !== undefined) updates.callScreening = params.callScreening;

          const settings = manager.updateVoiceSettings(updates);
          return {
            success: true,
            data: settings,
          };
        }

        return { success: false, error: 'Invalid action' };
      }

      case 'voice_clone': {
        const voiceClone = manager.getVoiceCloneService();
        if (!voiceClone) {
          return { success: false, error: 'Voice cloning not configured' };
        }

        switch (params.action) {
          case 'list_voices':
            const voices = await voiceClone.getVoices();
            return { success: true, data: voices };

          case 'get_clone':
            const clone = voiceClone.getVoiceClone(params.cloneId as string);
            if (!clone) {
              return { success: false, error: 'Voice clone not found' };
            }
            return { success: true, data: clone };

          case 'delete_clone':
            const deleted = await voiceClone.deleteVoiceClone(params.cloneId as string);
            return {
              success: deleted,
              data: deleted ? 'Voice clone deleted' : undefined,
              error: deleted ? undefined : 'Failed to delete voice clone',
            };

          case 'get_guidelines':
            return {
              success: true,
              data: voiceClone.getRecordingGuidelines(),
            };

          default:
            return { success: false, error: `Unknown action: ${params.action}` };
        }
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Resolve phone number from contact name or number
 */
function resolvePhoneNumber(manager: VoiceCallsManager, input: string): string {
  // Check if it's already a phone number
  if (input.match(/^\+?[\d\s\-()]+$/)) {
    return input.replace(/[\s\-()]/g, '');
  }

  // Look up contact
  const contacts = manager.getContacts();
  const contact = contacts.find((c) =>
    c.name.toLowerCase() === input.toLowerCase()
  );

  if (contact && contact.phoneNumbers.length > 0) {
    return contact.phoneNumbers[0].number;
  }

  throw new Error(`Could not resolve phone number for: ${input}`);
}
