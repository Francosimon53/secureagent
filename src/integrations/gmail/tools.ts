/**
 * Gmail Integration - Tool Definitions
 */

import type { ToolDefinition } from '../types.js';
import type { GmailApi } from './api.js';
import type { ComposeEmailInput } from './types.js';

/**
 * Create Gmail tools
 */
export function createGmailTools(api: GmailApi): ToolDefinition[] {
  return [
    createSearchTool(api),
    createGetMessageTool(api),
    createSendTool(api),
    createReplyTool(api),
    createArchiveTool(api),
    createLabelTool(api),
  ];
}

/**
 * Search emails
 */
function createSearchTool(api: GmailApi): ToolDefinition {
  return {
    name: 'gmail_search',
    description:
      'Search for emails in Gmail. Supports Gmail search syntax including from:, to:, subject:, has:attachment, etc.',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'Search query (Gmail search syntax)',
        required: false,
      },
      {
        name: 'from',
        type: 'string',
        description: 'Filter by sender email',
        required: false,
      },
      {
        name: 'to',
        type: 'string',
        description: 'Filter by recipient email',
        required: false,
      },
      {
        name: 'subject',
        type: 'string',
        description: 'Filter by subject',
        required: false,
      },
      {
        name: 'after',
        type: 'string',
        description: 'Only messages after this date (YYYY-MM-DD)',
        required: false,
      },
      {
        name: 'before',
        type: 'string',
        description: 'Only messages before this date (YYYY-MM-DD)',
        required: false,
      },
      {
        name: 'hasAttachment',
        type: 'boolean',
        description: 'Only messages with attachments',
        required: false,
      },
      {
        name: 'maxResults',
        type: 'number',
        description: 'Maximum number of results (default: 10)',
        required: false,
        default: 10,
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        const results = await api.searchMessages({
          query: params.query as string | undefined,
          from: params.from as string | undefined,
          to: params.to as string | undefined,
          subject: params.subject as string | undefined,
          after: params.after as string | undefined,
          before: params.before as string | undefined,
          hasAttachment: params.hasAttachment as boolean | undefined,
          maxResults: (params.maxResults as number) || 10,
        });

        return {
          success: true,
          data: {
            messages: results.messages.map((msg) => ({
              id: msg.id,
              threadId: msg.threadId,
              from: msg.from,
              to: msg.to,
              subject: msg.subject,
              snippet: msg.snippet,
              date: msg.date.toISOString(),
              isUnread: msg.isUnread,
              hasAttachments: msg.hasAttachments,
            })),
            resultCount: results.resultSizeEstimate,
            nextPageToken: results.nextPageToken,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to search emails',
        };
      }
    },
  };
}

/**
 * Get message content
 */
function createGetMessageTool(api: GmailApi): ToolDefinition {
  return {
    name: 'gmail_get_message',
    description: 'Get the full content of an email message.',
    parameters: [
      {
        name: 'messageId',
        type: 'string',
        description: 'The ID of the message to retrieve',
        required: true,
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        const message = await api.getMessage(params.messageId as string);

        return {
          success: true,
          data: {
            id: message.id,
            threadId: message.threadId,
            from: message.from,
            to: message.to,
            cc: message.cc,
            subject: message.subject,
            body: message.body,
            date: message.date.toISOString(),
            labels: message.labels,
            isUnread: message.isUnread,
            isStarred: message.isStarred,
            hasAttachments: message.hasAttachments,
            attachments: message.attachments,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to get message',
        };
      }
    },
  };
}

/**
 * Send email
 */
function createSendTool(api: GmailApi): ToolDefinition {
  return {
    name: 'gmail_send',
    description: 'Send a new email.',
    parameters: [
      {
        name: 'to',
        type: 'string',
        description: 'Recipient email address(es), comma-separated',
        required: true,
      },
      {
        name: 'subject',
        type: 'string',
        description: 'Email subject',
        required: true,
      },
      {
        name: 'body',
        type: 'string',
        description: 'Email body content',
        required: true,
      },
      {
        name: 'cc',
        type: 'string',
        description: 'CC recipients, comma-separated',
        required: false,
      },
      {
        name: 'bcc',
        type: 'string',
        description: 'BCC recipients, comma-separated',
        required: false,
      },
      {
        name: 'isHtml',
        type: 'boolean',
        description: 'Whether the body is HTML',
        required: false,
        default: false,
      },
    ],
    riskLevel: 'high',
    execute: async (params) => {
      try {
        const email: ComposeEmailInput = {
          to: (params.to as string).split(',').map((e) => e.trim()),
          subject: params.subject as string,
          body: params.body as string,
          cc: params.cc
            ? (params.cc as string).split(',').map((e) => e.trim())
            : undefined,
          bcc: params.bcc
            ? (params.bcc as string).split(',').map((e) => e.trim())
            : undefined,
          isHtml: params.isHtml as boolean,
        };

        const sent = await api.sendEmail(email);

        return {
          success: true,
          data: {
            id: sent.id,
            threadId: sent.threadId,
            to: sent.to,
            subject: sent.subject,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to send email',
        };
      }
    },
  };
}

/**
 * Reply to email
 */
function createReplyTool(api: GmailApi): ToolDefinition {
  return {
    name: 'gmail_reply',
    description: 'Reply to an existing email thread.',
    parameters: [
      {
        name: 'messageId',
        type: 'string',
        description: 'The ID of the message to reply to',
        required: true,
      },
      {
        name: 'body',
        type: 'string',
        description: 'Reply body content',
        required: true,
      },
      {
        name: 'replyAll',
        type: 'boolean',
        description: 'Reply to all recipients',
        required: false,
        default: false,
      },
      {
        name: 'isHtml',
        type: 'boolean',
        description: 'Whether the body is HTML',
        required: false,
        default: false,
      },
    ],
    riskLevel: 'high',
    execute: async (params) => {
      try {
        // Get the original message
        const original = await api.getMessage(params.messageId as string);

        // Determine recipients
        let to = [original.from];
        let cc: string[] | undefined;

        if (params.replyAll) {
          // Include all original recipients except self
          const profile = await api.getProfile();
          const allRecipients = [...(original.to || []), ...(original.cc || [])];
          const others = allRecipients.filter(
            (e) => !e.includes(profile.emailAddress),
          );
          if (others.length > 0) {
            cc = others;
          }
        }

        // Build reply
        const subject = original.subject.startsWith('Re:')
          ? original.subject
          : `Re: ${original.subject}`;

        const messageId = `<${params.messageId}@mail.gmail.com>`;

        const email: ComposeEmailInput = {
          to,
          cc,
          subject,
          body: params.body as string,
          isHtml: params.isHtml as boolean,
          inReplyTo: messageId,
          references: messageId,
          threadId: original.threadId,
        };

        const sent = await api.sendEmail(email);

        return {
          success: true,
          data: {
            id: sent.id,
            threadId: sent.threadId,
            to: sent.to,
            subject: sent.subject,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to reply',
        };
      }
    },
  };
}

/**
 * Archive email
 */
function createArchiveTool(api: GmailApi): ToolDefinition {
  return {
    name: 'gmail_archive',
    description: 'Archive an email (remove from inbox).',
    parameters: [
      {
        name: 'messageId',
        type: 'string',
        description: 'The ID of the message to archive',
        required: true,
      },
    ],
    riskLevel: 'medium',
    execute: async (params) => {
      try {
        await api.archiveMessage(params.messageId as string);

        return {
          success: true,
          data: { archived: true, messageId: params.messageId },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to archive email',
        };
      }
    },
  };
}

/**
 * Add/remove labels
 */
function createLabelTool(api: GmailApi): ToolDefinition {
  return {
    name: 'gmail_label',
    description: 'Add or remove labels from an email.',
    parameters: [
      {
        name: 'messageId',
        type: 'string',
        description: 'The ID of the message',
        required: true,
      },
      {
        name: 'addLabels',
        type: 'array',
        description: 'Label IDs to add',
        required: false,
      },
      {
        name: 'removeLabels',
        type: 'array',
        description: 'Label IDs to remove',
        required: false,
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        const message = await api.modifyLabels(
          params.messageId as string,
          params.addLabels as string[] | undefined,
          params.removeLabels as string[] | undefined,
        );

        return {
          success: true,
          data: {
            messageId: message.id,
            labels: message.labels,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to modify labels',
        };
      }
    },
  };
}
