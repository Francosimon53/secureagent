/**
 * Email Notification Provider
 *
 * Email notification provider with SendGrid integration for:
 * - Appointment reminders
 * - Authorization alerts
 * - Progress report delivery
 */

import { BaseHealthProvider, type HealthProviderConfig } from '../base.js';
import type {
  NotificationProvider,
  NotificationMessage,
  NotificationRecipient,
  NotificationResult,
  DeliveryReceipt,
} from './types.js';
import { HEALTH_EVENTS, HEALTH_ERROR_CODES } from '../../constants.js';
import type { EmailConfig } from '../../config.js';

// =============================================================================
// Email Provider Configuration
// =============================================================================

export interface EmailProviderConfig extends HealthProviderConfig {
  provider: 'sendgrid' | 'ses' | 'smtp' | 'mailgun';
  fromEmail?: string;
  fromName?: string;
  replyToEmail?: string;
  enableClickTracking: boolean;
  enableOpenTracking: boolean;
}

// =============================================================================
// SendGrid Response Types
// =============================================================================

interface SendGridResponse {
  statusCode?: number;
  headers?: Record<string, string>;
}

interface SendGridErrorResponse {
  errors?: Array<{
    message: string;
    field?: string;
  }>;
}

interface SendGridWebhookPayload {
  event: string;
  sg_message_id: string;
  timestamp: number;
  reason?: string;
  status?: string;
}

// =============================================================================
// Email Notification Provider
// =============================================================================

export class EmailNotificationProvider
  extends BaseHealthProvider<EmailProviderConfig>
  implements NotificationProvider
{
  private readonly baseUrl: string;

  constructor(config: EmailProviderConfig) {
    super(config, ['api.sendgrid.com']);
    this.baseUrl = 'https://api.sendgrid.com/v3';
  }

  get name(): string {
    return `email-${this.config.provider}`;
  }

  get type(): 'email' {
    return 'email';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async send(
    recipient: NotificationRecipient,
    message: NotificationMessage
  ): Promise<NotificationResult> {
    this.ensureInitialized();

    if (!recipient.email) {
      return {
        success: false,
        error: 'Email address is required',
        errorCode: HEALTH_ERROR_CODES.NOTIFICATION_NO_RECIPIENT,
        status: 'failed',
        timestamp: Date.now(),
      };
    }

    // Apply template variables
    let textContent = message.text;
    let htmlContent = message.html ?? this.textToHtml(message.text);
    let subject = message.subject ?? 'Notification';

    if (message.variables) {
      for (const [key, value] of Object.entries(message.variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        textContent = textContent.replace(regex, String(value));
        htmlContent = htmlContent.replace(regex, String(value));
        subject = subject.replace(regex, String(value));
      }
    }

    const url = `${this.baseUrl}/mail/send`;

    const payload = {
      personalizations: [
        {
          to: [
            {
              email: recipient.email,
              name: recipient.name,
            },
          ],
        },
      ],
      from: {
        email: this.config.fromEmail ?? 'noreply@example.com',
        name: this.config.fromName ?? 'ABA Therapy Center',
      },
      reply_to: this.config.replyToEmail
        ? { email: this.config.replyToEmail }
        : undefined,
      subject,
      content: [
        {
          type: 'text/plain',
          value: textContent,
        },
        {
          type: 'text/html',
          value: htmlContent,
        },
      ],
      tracking_settings: {
        click_tracking: {
          enable: this.config.enableClickTracking,
        },
        open_tracking: {
          enable: this.config.enableOpenTracking,
        },
      },
    };

    const result = await this.fetch<SendGridResponse>(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!result.success) {
      this.emit(HEALTH_EVENTS.REMINDER_FAILED, {
        recipient: recipient.email,
        error: result.error,
        timestamp: Date.now(),
      });

      return {
        success: false,
        error: result.error ?? 'Failed to send email',
        errorCode: result.errorCode,
        retryable: result.retryable,
        status: 'failed',
        timestamp: Date.now(),
      };
    }

    // SendGrid returns message ID in headers for successful sends
    const messageId =
      result.data?.headers?.['x-message-id'] ?? crypto.randomUUID();

    this.emit(HEALTH_EVENTS.REMINDER_SENT, {
      messageId,
      recipient: recipient.email,
      timestamp: Date.now(),
    });

    return {
      success: true,
      messageId,
      status: 'queued',
      timestamp: Date.now(),
      metadata: {
        provider: 'sendgrid',
      },
    };
  }

  async sendBulk(
    recipients: NotificationRecipient[],
    message: NotificationMessage
  ): Promise<NotificationResult[]> {
    // SendGrid supports bulk sending with personalizations
    // For simplicity, we'll send individually with rate limiting
    const results: NotificationResult[] = [];

    const batchSize = 20;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((recipient) => this.send(recipient, message))
      );
      results.push(...batchResults);
    }

    return results;
  }

  async getStatus(messageId: string): Promise<NotificationResult | null> {
    // SendGrid doesn't have a direct status check API
    // Status is typically received via webhooks
    // Return null to indicate status should come from webhook
    return null;
  }

  async processWebhook(payload: unknown): Promise<DeliveryReceipt | null> {
    // SendGrid sends an array of events
    const events = Array.isArray(payload) ? payload : [payload];

    for (const event of events) {
      const data = event as SendGridWebhookPayload;

      if (!data.sg_message_id || !data.event) {
        continue;
      }

      const receipt: DeliveryReceipt = {
        messageId: data.sg_message_id,
        status: this.mapSendGridEventToStatus(data.event),
        timestamp: data.timestamp * 1000, // Convert to ms
        errorMessage: data.reason,
        rawPayload: event,
      };

      // Emit delivery event
      if (receipt.status === 'delivered') {
        this.emit(HEALTH_EVENTS.REMINDER_DELIVERED, {
          messageId: receipt.messageId,
          timestamp: receipt.timestamp,
        });
      } else if (receipt.status === 'failed') {
        this.emit(HEALTH_EVENTS.REMINDER_FAILED, {
          messageId: receipt.messageId,
          error: receipt.errorMessage,
          timestamp: receipt.timestamp,
        });
      }

      return receipt;
    }

    return null;
  }

  /**
   * Send email with attachment (for progress reports)
   */
  async sendWithAttachment(
    recipient: NotificationRecipient,
    message: NotificationMessage,
    attachment: {
      content: string; // Base64 encoded
      filename: string;
      type: string; // MIME type
    }
  ): Promise<NotificationResult> {
    this.ensureInitialized();

    if (!recipient.email) {
      return {
        success: false,
        error: 'Email address is required',
        errorCode: HEALTH_ERROR_CODES.NOTIFICATION_NO_RECIPIENT,
        status: 'failed',
        timestamp: Date.now(),
      };
    }

    const url = `${this.baseUrl}/mail/send`;

    let subject = message.subject ?? 'Document';
    if (message.variables) {
      for (const [key, value] of Object.entries(message.variables)) {
        subject = subject.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
    }

    const payload = {
      personalizations: [
        {
          to: [{ email: recipient.email, name: recipient.name }],
        },
      ],
      from: {
        email: this.config.fromEmail ?? 'noreply@example.com',
        name: this.config.fromName ?? 'ABA Therapy Center',
      },
      subject,
      content: [
        {
          type: 'text/plain',
          value: message.text,
        },
      ],
      attachments: [
        {
          content: attachment.content,
          filename: attachment.filename,
          type: attachment.type,
          disposition: 'attachment',
        },
      ],
    };

    const result = await this.fetch<SendGridResponse>(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? 'Failed to send email',
        errorCode: result.errorCode,
        retryable: result.retryable,
        status: 'failed',
        timestamp: Date.now(),
      };
    }

    const messageId =
      result.data?.headers?.['x-message-id'] ?? crypto.randomUUID();

    return {
      success: true,
      messageId,
      status: 'queued',
      timestamp: Date.now(),
    };
  }

  /**
   * Convert plain text to simple HTML
   */
  private textToHtml(text: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    ${text.split('\n').map((line) => `<p>${line || '&nbsp;'}</p>`).join('\n')}
  </div>
</body>
</html>`;
  }

  /**
   * Map SendGrid event to delivery status
   */
  private mapSendGridEventToStatus(
    event: string
  ): DeliveryReceipt['status'] {
    switch (event.toLowerCase()) {
      case 'delivered':
        return 'delivered';
      case 'open':
        return 'read';
      case 'bounce':
      case 'dropped':
      case 'spamreport':
        return 'failed';
      case 'deferred':
        return 'undelivered';
      default:
        return 'delivered';
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createEmailProvider(config: EmailConfig): EmailNotificationProvider {
  return new EmailNotificationProvider({
    apiKeyEnvVar: config.apiKeyEnvVar,
    provider: config.provider,
    fromEmail: config.fromEmail,
    fromName: config.fromName,
    replyToEmail: config.replyToEmail,
    enableClickTracking: config.enableClickTracking,
    enableOpenTracking: config.enableOpenTracking,
    rateLimitPerMinute: config.rateLimitPerMinute,
  });
}
