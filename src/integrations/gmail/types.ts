/**
 * Gmail Integration - Types
 */

/**
 * Gmail message
 */
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: MessagePayload;
  sizeEstimate: number;
  raw?: string;
}

export interface MessagePayload {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers: MessageHeader[];
  body: MessageBody;
  parts?: MessagePayload[];
}

export interface MessageHeader {
  name: string;
  value: string;
}

export interface MessageBody {
  attachmentId?: string;
  size: number;
  data?: string;
}

/**
 * Gmail thread
 */
export interface GmailThread {
  id: string;
  historyId: string;
  messages: GmailMessage[];
}

/**
 * Gmail label
 */
export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messageListVisibility?: 'show' | 'hide';
  labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
  color?: {
    textColor?: string;
    backgroundColor?: string;
  };
}

/**
 * Gmail draft
 */
export interface GmailDraft {
  id: string;
  message: GmailMessage;
}

/**
 * Gmail attachment
 */
export interface GmailAttachment {
  attachmentId: string;
  size: number;
  data: string;
}

/**
 * Simplified email representation
 */
export interface SimplifiedEmail {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  snippet: string;
  body: string;
  htmlBody?: string;
  date: Date;
  labels: string[];
  isUnread: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachments?: EmailAttachmentInfo[];
}

export interface EmailAttachmentInfo {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

/**
 * Email compose input
 */
export interface ComposeEmailInput {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

/**
 * Email search options
 */
export interface EmailSearchOptions {
  query?: string;
  from?: string;
  to?: string;
  subject?: string;
  after?: string | Date;
  before?: string | Date;
  hasAttachment?: boolean;
  labelIds?: string[];
  maxResults?: number;
  pageToken?: string;
  includeSpamTrash?: boolean;
}

/**
 * Email list response
 */
export interface EmailListResponse {
  messages: SimplifiedEmail[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

/**
 * Common Gmail label IDs
 */
export const GMAIL_LABELS = {
  INBOX: 'INBOX',
  SENT: 'SENT',
  DRAFTS: 'DRAFT',
  SPAM: 'SPAM',
  TRASH: 'TRASH',
  STARRED: 'STARRED',
  IMPORTANT: 'IMPORTANT',
  UNREAD: 'UNREAD',
  CATEGORY_PERSONAL: 'CATEGORY_PERSONAL',
  CATEGORY_SOCIAL: 'CATEGORY_SOCIAL',
  CATEGORY_PROMOTIONS: 'CATEGORY_PROMOTIONS',
  CATEGORY_UPDATES: 'CATEGORY_UPDATES',
  CATEGORY_FORUMS: 'CATEGORY_FORUMS',
} as const;

export type GmailLabelId = (typeof GMAIL_LABELS)[keyof typeof GMAIL_LABELS];
