/**
 * Email Providers
 *
 * Implementations for Gmail and Outlook Mail providers.
 */

import { BaseProvider, ProviderError } from './base.js';
import type {
  EmailDigest,
  EmailCategory,
  EmailStats,
  ProviderResult,
  EmailProviderType,
} from '../types.js';
import type { EmailConfig } from '../config.js';

/**
 * Abstract email provider interface
 */
export abstract class EmailProvider extends BaseProvider<EmailConfig & { name: string; apiKeyEnvVar: string }> {
  abstract get type(): 'email';
  abstract get providerType(): EmailProviderType;

  /**
   * Get emails from inbox
   */
  abstract getEmails(options?: EmailQueryOptions): Promise<ProviderResult<EmailDigest[]>>;

  /**
   * Get a single email by ID
   */
  abstract getEmail(emailId: string): Promise<ProviderResult<EmailDigest | null>>;

  /**
   * Get email statistics
   */
  abstract getStats(): Promise<ProviderResult<EmailStats>>;

  /**
   * Mark email as read
   */
  abstract markAsRead(emailId: string): Promise<ProviderResult<boolean>>;

  /**
   * Archive email
   */
  abstract archive(emailId: string): Promise<ProviderResult<boolean>>;
}

export interface EmailQueryOptions {
  maxResults?: number;
  query?: string;
  unreadOnly?: boolean;
  category?: EmailCategory;
  after?: number;
  before?: number;
}

/**
 * Gmail provider
 */
export class GmailProvider extends EmailProvider {
  private readonly baseUrl = 'https://www.googleapis.com/gmail/v1';
  private accessToken: string | undefined;

  get name(): string {
    return 'gmail';
  }

  get type(): 'email' {
    return 'email';
  }

  get providerType(): EmailProviderType {
    return 'gmail';
  }

  protected override requiresApiKey(): boolean {
    return false;
  }

  protected override async onInitialize(): Promise<void> {
    const credentialsJson = process.env[this.config.credentialsEnvVar];
    if (credentialsJson) {
      try {
        const credentials = JSON.parse(credentialsJson);
        this.accessToken = credentials.access_token;
      } catch {
        throw new ProviderError(this.name, 'Invalid credentials JSON format');
      }
    }
  }

  async getEmails(options: EmailQueryOptions = {}): Promise<ProviderResult<EmailDigest[]>> {
    if (!this.accessToken) {
      return {
        success: false,
        error: 'Not authenticated',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const maxResults = options.maxResults ?? this.config.maxEmailsToProcess;
    let query = options.query ?? '';

    if (options.unreadOnly) {
      query += ' is:unread';
    }

    if (options.category) {
      query += ` category:${options.category}`;
    }

    const params = new URLSearchParams({
      maxResults: String(maxResults),
      q: query.trim(),
    });

    const listUrl = `${this.baseUrl}/users/me/messages?${params}`;
    const listResult = await this.fetch<GmailListResponse>(listUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!listResult.success || !listResult.data) {
      return {
        success: false,
        error: listResult.error ?? 'Failed to fetch email list',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const messages = listResult.data.messages ?? [];
    const emails: EmailDigest[] = [];

    // Fetch details for each message (batch for better performance)
    for (const msg of messages.slice(0, maxResults)) {
      const detailUrl = `${this.baseUrl}/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe`;
      const detailResult = await this.fetch<GmailMessageResponse>(detailUrl, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (detailResult.success && detailResult.data) {
        emails.push(this.mapGmailMessage(detailResult.data));
      }
    }

    return {
      success: true,
      data: emails,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async getEmail(emailId: string): Promise<ProviderResult<EmailDigest | null>> {
    if (!this.accessToken) {
      return {
        success: false,
        error: 'Not authenticated',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const url = `${this.baseUrl}/users/me/messages/${emailId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe`;
    const result = await this.fetch<GmailMessageResponse>(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to fetch email',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    return {
      success: true,
      data: this.mapGmailMessage(result.data),
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async getStats(): Promise<ProviderResult<EmailStats>> {
    if (!this.accessToken) {
      return {
        success: false,
        error: 'Not authenticated',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    // Get total count
    const profileUrl = `${this.baseUrl}/users/me/profile`;
    const profileResult = await this.fetch<{ messagesTotal: number }>(profileUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    // Get unread count
    const unreadUrl = `${this.baseUrl}/users/me/messages?q=is:unread&maxResults=1`;
    const unreadResult = await this.fetch<{ resultSizeEstimate: number }>(unreadUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    const total = profileResult.data?.messagesTotal ?? 0;
    const unread = unreadResult.data?.resultSizeEstimate ?? 0;

    return {
      success: true,
      data: {
        total,
        unread,
        byCategory: {
          primary: 0,
          promotions: 0,
          social: 0,
          updates: 0,
          forums: 0,
          spam: 0,
        },
        byPriority: { high: 0, medium: 0, low: 0 },
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async markAsRead(emailId: string): Promise<ProviderResult<boolean>> {
    if (!this.accessToken) {
      return {
        success: false,
        error: 'Not authenticated',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const url = `${this.baseUrl}/users/me/messages/${emailId}/modify`;
    const result = await this.fetch<unknown>(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}` },
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    });

    return {
      success: result.success,
      data: result.success,
      error: result.error,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async archive(emailId: string): Promise<ProviderResult<boolean>> {
    if (!this.accessToken) {
      return {
        success: false,
        error: 'Not authenticated',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const url = `${this.baseUrl}/users/me/messages/${emailId}/modify`;
    const result = await this.fetch<unknown>(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}` },
      body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
    });

    return {
      success: result.success,
      data: result.success,
      error: result.error,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  private mapGmailMessage(msg: GmailMessageResponse): EmailDigest {
    const headers = new Map<string, string>();
    for (const header of msg.payload?.headers ?? []) {
      headers.set(header.name.toLowerCase(), header.value);
    }

    const fromHeader = headers.get('from') ?? '';
    const [senderName, senderEmail] = this.parseEmailAddress(fromHeader);

    const labels = msg.labelIds ?? [];
    const category = this.mapLabelsToCategory(labels);

    return {
      id: msg.id,
      messageId: msg.id,
      threadId: msg.threadId,
      subject: headers.get('subject') ?? '(No Subject)',
      sender: senderEmail,
      senderName,
      recipients: this.parseRecipients(headers.get('to') ?? ''),
      receivedAt: parseInt(msg.internalDate, 10),
      snippet: msg.snippet ?? '',
      priority: 0.5,
      category,
      labels,
      isRead: !labels.includes('UNREAD'),
      isStarred: labels.includes('STARRED'),
      hasAttachments: msg.payload?.parts?.some(p => p.filename) ?? false,
      attachmentCount: msg.payload?.parts?.filter(p => p.filename).length ?? 0,
      hasUnsubscribeLink: headers.has('list-unsubscribe'),
      isActionable: false,
    };
  }

  private parseEmailAddress(header: string): [string | undefined, string] {
    const match = header.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/);
    if (match) {
      return [match[1]?.trim() || undefined, match[2].trim()];
    }
    return [undefined, header.trim()];
  }

  private parseRecipients(toHeader: string): string[] {
    return toHeader.split(',').map(r => {
      const [, email] = this.parseEmailAddress(r.trim());
      return email;
    });
  }

  private mapLabelsToCategory(labels: string[]): EmailCategory {
    if (labels.includes('CATEGORY_PROMOTIONS')) return 'promotions';
    if (labels.includes('CATEGORY_SOCIAL')) return 'social';
    if (labels.includes('CATEGORY_UPDATES')) return 'updates';
    if (labels.includes('CATEGORY_FORUMS')) return 'forums';
    if (labels.includes('SPAM')) return 'spam';
    return 'primary';
  }
}

/**
 * Outlook Mail provider
 */
export class OutlookMailProvider extends EmailProvider {
  private readonly baseUrl = 'https://graph.microsoft.com/v1.0';
  private accessToken: string | undefined;

  get name(): string {
    return 'outlook';
  }

  get type(): 'email' {
    return 'email';
  }

  get providerType(): EmailProviderType {
    return 'outlook';
  }

  protected override requiresApiKey(): boolean {
    return false;
  }

  protected override async onInitialize(): Promise<void> {
    const credentialsJson = process.env[this.config.credentialsEnvVar];
    if (credentialsJson) {
      try {
        const credentials = JSON.parse(credentialsJson);
        this.accessToken = credentials.access_token;
      } catch {
        throw new ProviderError(this.name, 'Invalid credentials JSON format');
      }
    }
  }

  async getEmails(options: EmailQueryOptions = {}): Promise<ProviderResult<EmailDigest[]>> {
    if (!this.accessToken) {
      return {
        success: false,
        error: 'Not authenticated',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const maxResults = options.maxResults ?? this.config.maxEmailsToProcess;
    let filter = '';

    if (options.unreadOnly) {
      filter = 'isRead eq false';
    }

    const params = new URLSearchParams({
      $top: String(maxResults),
      $orderby: 'receivedDateTime desc',
    });

    if (filter) {
      params.set('$filter', filter);
    }

    const url = `${this.baseUrl}/me/messages?${params}`;
    const result = await this.fetch<OutlookMessagesResponse>(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to fetch emails',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const emails = result.data.value.map(msg => this.mapOutlookMessage(msg));

    return {
      success: true,
      data: emails,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async getEmail(emailId: string): Promise<ProviderResult<EmailDigest | null>> {
    if (!this.accessToken) {
      return {
        success: false,
        error: 'Not authenticated',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const url = `${this.baseUrl}/me/messages/${emailId}`;
    const result = await this.fetch<OutlookMessageItem>(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to fetch email',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    return {
      success: true,
      data: this.mapOutlookMessage(result.data),
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async getStats(): Promise<ProviderResult<EmailStats>> {
    if (!this.accessToken) {
      return {
        success: false,
        error: 'Not authenticated',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    // Get total and unread counts
    const countUrl = `${this.baseUrl}/me/mailFolders/inbox`;
    const countResult = await this.fetch<{ totalItemCount: number; unreadItemCount: number }>(countUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    return {
      success: true,
      data: {
        total: countResult.data?.totalItemCount ?? 0,
        unread: countResult.data?.unreadItemCount ?? 0,
        byCategory: {
          primary: 0,
          promotions: 0,
          social: 0,
          updates: 0,
          forums: 0,
          spam: 0,
        },
        byPriority: { high: 0, medium: 0, low: 0 },
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async markAsRead(emailId: string): Promise<ProviderResult<boolean>> {
    if (!this.accessToken) {
      return {
        success: false,
        error: 'Not authenticated',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const url = `${this.baseUrl}/me/messages/${emailId}`;
    const result = await this.fetch<unknown>(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${this.accessToken}` },
      body: JSON.stringify({ isRead: true }),
    });

    return {
      success: result.success,
      data: result.success,
      error: result.error,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async archive(emailId: string): Promise<ProviderResult<boolean>> {
    if (!this.accessToken) {
      return {
        success: false,
        error: 'Not authenticated',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const url = `${this.baseUrl}/me/messages/${emailId}/move`;
    const result = await this.fetch<unknown>(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}` },
      body: JSON.stringify({ destinationId: 'archive' }),
    });

    return {
      success: result.success,
      data: result.success,
      error: result.error,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  private mapOutlookMessage(msg: OutlookMessageItem): EmailDigest {
    return {
      id: msg.id,
      messageId: msg.internetMessageId ?? msg.id,
      threadId: msg.conversationId ?? msg.id,
      subject: msg.subject ?? '(No Subject)',
      sender: msg.from?.emailAddress?.address ?? '',
      senderName: msg.from?.emailAddress?.name,
      recipients: (msg.toRecipients ?? []).map(r => r.emailAddress.address),
      receivedAt: new Date(msg.receivedDateTime).getTime(),
      snippet: msg.bodyPreview ?? '',
      priority: msg.importance === 'high' ? 0.8 : msg.importance === 'low' ? 0.2 : 0.5,
      category: 'primary',
      labels: msg.categories ?? [],
      isRead: msg.isRead ?? false,
      isStarred: msg.flag?.flagStatus === 'flagged',
      hasAttachments: msg.hasAttachments ?? false,
      attachmentCount: 0,
      hasUnsubscribeLink: false,
      isActionable: false,
    };
  }
}

// =============================================================================
// API Response Types
// =============================================================================

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  resultSizeEstimate?: number;
}

interface GmailMessageResponse {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    parts?: Array<{ filename?: string }>;
  };
}

interface OutlookMessagesResponse {
  value: OutlookMessageItem[];
}

interface OutlookMessageItem {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime: string;
  isRead?: boolean;
  importance?: 'low' | 'normal' | 'high';
  hasAttachments?: boolean;
  categories?: string[];
  flag?: {
    flagStatus?: string;
  };
  from?: {
    emailAddress: {
      name?: string;
      address: string;
    };
  };
  toRecipients?: Array<{
    emailAddress: {
      name?: string;
      address: string;
    };
  }>;
}

/**
 * Create an email provider based on type
 */
export function createEmailProvider(
  type: EmailProviderType,
  config: EmailConfig
): EmailProvider {
  const providerConfig = {
    ...config,
    name: type,
    apiKeyEnvVar: config.credentialsEnvVar,
  };

  switch (type) {
    case 'gmail':
      return new GmailProvider(providerConfig);
    case 'outlook':
      return new OutlookMailProvider(providerConfig);
    default:
      throw new ProviderError('email', `Unknown email provider type: ${type}`);
  }
}
