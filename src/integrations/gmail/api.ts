/**
 * Gmail Integration - API Wrapper
 */

import type {
  GmailMessage,
  GmailThread,
  GmailLabel,
  GmailDraft,
  SimplifiedEmail,
  ComposeEmailInput,
  EmailSearchOptions,
  EmailListResponse,
  EmailAttachmentInfo,
} from './types.js';
import { IntegrationError, INTEGRATION_ERROR_CODES } from '../types.js';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

/**
 * Gmail API client configuration
 */
export interface GmailApiConfig {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

/**
 * Gmail API client
 */
export class GmailApi {
  private accessToken: string;

  constructor(config: GmailApiConfig) {
    this.accessToken = config.accessToken;
  }

  /**
   * Update access token
   */
  updateAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
  }

  /**
   * Make authenticated request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    let url = `${GMAIL_API_BASE}${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          params.set(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const message =
        (error as { error?: { message?: string } }).error?.message ||
        response.statusText;

      if (response.status === 401) {
        throw new IntegrationError(
          'Gmail authentication failed',
          INTEGRATION_ERROR_CODES.AUTHENTICATION_FAILED,
          'gmail',
        );
      }

      if (response.status === 403) {
        throw new IntegrationError(
          'Permission denied for Gmail',
          INTEGRATION_ERROR_CODES.PERMISSION_DENIED,
          'gmail',
        );
      }

      if (response.status === 429) {
        throw new IntegrationError(
          'Gmail rate limit exceeded',
          INTEGRATION_ERROR_CODES.RATE_LIMITED,
          'gmail',
        );
      }

      throw new IntegrationError(
        `Gmail API error: ${message}`,
        INTEGRATION_ERROR_CODES.API_ERROR,
        'gmail',
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * Search for messages
   */
  async searchMessages(options: EmailSearchOptions = {}): Promise<EmailListResponse> {
    // Build search query
    const queryParts: string[] = [];
    if (options.query) queryParts.push(options.query);
    if (options.from) queryParts.push(`from:${options.from}`);
    if (options.to) queryParts.push(`to:${options.to}`);
    if (options.subject) queryParts.push(`subject:${options.subject}`);
    if (options.after) {
      const date =
        options.after instanceof Date
          ? options.after.toISOString().split('T')[0]
          : options.after;
      queryParts.push(`after:${date}`);
    }
    if (options.before) {
      const date =
        options.before instanceof Date
          ? options.before.toISOString().split('T')[0]
          : options.before;
      queryParts.push(`before:${date}`);
    }
    if (options.hasAttachment) queryParts.push('has:attachment');

    const response = await this.request<{
      messages?: { id: string; threadId: string }[];
      nextPageToken?: string;
      resultSizeEstimate: number;
    }>('GET', '/users/me/messages', undefined, {
      q: queryParts.join(' ') || undefined,
      labelIds: options.labelIds?.join(','),
      maxResults: options.maxResults || 10,
      pageToken: options.pageToken,
      includeSpamTrash: options.includeSpamTrash,
    });

    // Fetch full messages
    const messages: SimplifiedEmail[] = [];
    for (const msg of response.messages || []) {
      try {
        const full = await this.getMessage(msg.id);
        messages.push(full);
      } catch {
        // Skip messages that fail to load
      }
    }

    return {
      messages,
      nextPageToken: response.nextPageToken,
      resultSizeEstimate: response.resultSizeEstimate,
    };
  }

  /**
   * Get a single message
   */
  async getMessage(messageId: string): Promise<SimplifiedEmail> {
    const message = await this.request<GmailMessage>(
      'GET',
      `/users/me/messages/${messageId}`,
      undefined,
      { format: 'full' },
    );

    return this.simplifyMessage(message);
  }

  /**
   * Get a thread with all messages
   */
  async getThread(threadId: string): Promise<GmailThread> {
    return this.request<GmailThread>(
      'GET',
      `/users/me/threads/${threadId}`,
      undefined,
      { format: 'full' },
    );
  }

  /**
   * Send an email
   */
  async sendEmail(email: ComposeEmailInput): Promise<SimplifiedEmail> {
    const raw = this.createRawEmail(email);

    const response = await this.request<GmailMessage>(
      'POST',
      '/users/me/messages/send',
      { raw, threadId: email.threadId },
    );

    return this.simplifyMessage(response);
  }

  /**
   * Create a draft
   */
  async createDraft(email: ComposeEmailInput): Promise<GmailDraft> {
    const raw = this.createRawEmail(email);

    return this.request<GmailDraft>('POST', '/users/me/drafts', {
      message: { raw, threadId: email.threadId },
    });
  }

  /**
   * Modify message labels
   */
  async modifyLabels(
    messageId: string,
    addLabelIds?: string[],
    removeLabelIds?: string[],
  ): Promise<SimplifiedEmail> {
    const message = await this.request<GmailMessage>(
      'POST',
      `/users/me/messages/${messageId}/modify`,
      {
        addLabelIds,
        removeLabelIds,
      },
    );

    return this.simplifyMessage(message);
  }

  /**
   * Archive a message (remove from INBOX)
   */
  async archiveMessage(messageId: string): Promise<SimplifiedEmail> {
    return this.modifyLabels(messageId, undefined, ['INBOX']);
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string): Promise<SimplifiedEmail> {
    return this.modifyLabels(messageId, undefined, ['UNREAD']);
  }

  /**
   * Mark message as unread
   */
  async markAsUnread(messageId: string): Promise<SimplifiedEmail> {
    return this.modifyLabels(messageId, ['UNREAD']);
  }

  /**
   * Star a message
   */
  async starMessage(messageId: string): Promise<SimplifiedEmail> {
    return this.modifyLabels(messageId, ['STARRED']);
  }

  /**
   * Unstar a message
   */
  async unstarMessage(messageId: string): Promise<SimplifiedEmail> {
    return this.modifyLabels(messageId, undefined, ['STARRED']);
  }

  /**
   * Trash a message
   */
  async trashMessage(messageId: string): Promise<SimplifiedEmail> {
    const message = await this.request<GmailMessage>(
      'POST',
      `/users/me/messages/${messageId}/trash`,
    );
    return this.simplifyMessage(message);
  }

  /**
   * List labels
   */
  async listLabels(): Promise<GmailLabel[]> {
    const response = await this.request<{ labels: GmailLabel[] }>(
      'GET',
      '/users/me/labels',
    );
    return response.labels;
  }

  /**
   * Get user profile
   */
  async getProfile(): Promise<{ emailAddress: string; messagesTotal: number; threadsTotal: number }> {
    return this.request<{
      emailAddress: string;
      messagesTotal: number;
      threadsTotal: number;
    }>('GET', '/users/me/profile');
  }

  /**
   * Verify credentials
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      await this.getProfile();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create raw email for sending
   */
  private createRawEmail(email: ComposeEmailInput): string {
    const to = Array.isArray(email.to) ? email.to.join(', ') : email.to;
    const cc = email.cc
      ? Array.isArray(email.cc)
        ? email.cc.join(', ')
        : email.cc
      : undefined;
    const bcc = email.bcc
      ? Array.isArray(email.bcc)
        ? email.bcc.join(', ')
        : email.bcc
      : undefined;

    const boundary = `boundary_${Date.now()}`;
    const contentType = email.isHtml
      ? `multipart/alternative; boundary="${boundary}"`
      : 'text/plain; charset=utf-8';

    let headers = `To: ${to}\n`;
    if (cc) headers += `Cc: ${cc}\n`;
    if (bcc) headers += `Bcc: ${bcc}\n`;
    headers += `Subject: ${email.subject}\n`;
    if (email.inReplyTo) headers += `In-Reply-To: ${email.inReplyTo}\n`;
    if (email.references) headers += `References: ${email.references}\n`;
    headers += `MIME-Version: 1.0\n`;
    headers += `Content-Type: ${contentType}\n`;

    let body: string;
    if (email.isHtml) {
      body = `--${boundary}\nContent-Type: text/plain; charset=utf-8\n\n${this.stripHtml(email.body)}\n--${boundary}\nContent-Type: text/html; charset=utf-8\n\n${email.body}\n--${boundary}--`;
    } else {
      body = email.body;
    }

    const rawEmail = `${headers}\n${body}`;

    // Base64url encode
    return Buffer.from(rawEmail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Strip HTML tags from string
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
  }

  /**
   * Convert Gmail message to simplified format
   */
  private simplifyMessage(message: GmailMessage): SimplifiedEmail {
    const headers = message.payload.headers;
    const getHeader = (name: string): string =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
      '';

    const from = getHeader('From');
    const to = getHeader('To')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const cc = getHeader('Cc')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const subject = getHeader('Subject');
    const date = new Date(getHeader('Date') || parseInt(message.internalDate));

    // Extract body
    let body = '';
    let htmlBody: string | undefined;
    const attachments: EmailAttachmentInfo[] = [];

    const extractBody = (payload: typeof message.payload): void => {
      if (payload.mimeType === 'text/plain' && payload.body.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      } else if (payload.mimeType === 'text/html' && payload.body.data) {
        htmlBody = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      } else if (payload.parts) {
        for (const part of payload.parts) {
          extractBody(part);
          // Check for attachments
          if (part.filename && part.body.attachmentId) {
            attachments.push({
              filename: part.filename,
              mimeType: part.mimeType,
              size: part.body.size,
              attachmentId: part.body.attachmentId,
            });
          }
        }
      }
    };

    extractBody(message.payload);

    return {
      id: message.id,
      threadId: message.threadId,
      from,
      to,
      cc: cc.length > 0 ? cc : undefined,
      subject,
      snippet: message.snippet,
      body: body || this.stripHtml(htmlBody || ''),
      htmlBody,
      date,
      labels: message.labelIds,
      isUnread: message.labelIds.includes('UNREAD'),
      isStarred: message.labelIds.includes('STARRED'),
      hasAttachments: attachments.length > 0,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }
}
