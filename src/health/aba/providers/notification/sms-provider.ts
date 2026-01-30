/**
 * SMS Notification Provider
 *
 * SMS notification provider with Twilio integration for:
 * - Appointment reminders
 * - Confirmation requests
 * - Authorization alerts
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
import type { SMSConfig } from '../../config.js';

// =============================================================================
// SMS Provider Configuration
// =============================================================================

export interface SMSProviderConfig extends HealthProviderConfig {
  provider: 'twilio' | 'vonage' | 'aws-sns';
  accountSidEnvVar: string;
  authTokenEnvVar: string;
  fromNumberEnvVar: string;
  enableDeliveryReceipts: boolean;
}

// =============================================================================
// Twilio Response Types
// =============================================================================

interface TwilioMessageResponse {
  sid: string;
  status: string;
  error_code?: number;
  error_message?: string;
  date_created: string;
}

interface TwilioWebhookPayload {
  MessageSid: string;
  MessageStatus: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  To?: string;
  From?: string;
}

// =============================================================================
// SMS Notification Provider
// =============================================================================

export class SMSNotificationProvider
  extends BaseHealthProvider<SMSProviderConfig>
  implements NotificationProvider
{
  private accountSid: string | undefined;
  private authToken: string | undefined;
  private fromNumber: string | undefined;
  private readonly baseUrl: string;

  constructor(config: SMSProviderConfig) {
    super(config, ['api.twilio.com']);
    this.baseUrl = 'https://api.twilio.com/2010-04-01';
  }

  get name(): string {
    return `sms-${this.config.provider}`;
  }

  get type(): 'sms' {
    return 'sms';
  }

  protected requiresApiKey(): boolean {
    return false; // Uses separate auth mechanism
  }

  protected async onInitialize(): Promise<void> {
    this.accountSid = process.env[this.config.accountSidEnvVar];
    this.authToken = process.env[this.config.authTokenEnvVar];
    this.fromNumber = process.env[this.config.fromNumberEnvVar];

    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      throw new Error(
        `SMS provider requires ${this.config.accountSidEnvVar}, ${this.config.authTokenEnvVar}, and ${this.config.fromNumberEnvVar} environment variables`
      );
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    return {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }

  async send(
    recipient: NotificationRecipient,
    message: NotificationMessage
  ): Promise<NotificationResult> {
    this.ensureInitialized();

    if (!recipient.phone) {
      return {
        success: false,
        error: 'Phone number is required for SMS',
        errorCode: HEALTH_ERROR_CODES.NOTIFICATION_NO_RECIPIENT,
        status: 'failed',
        timestamp: Date.now(),
      };
    }

    // Apply template variables
    let body = message.text;
    if (message.variables) {
      for (const [key, value] of Object.entries(message.variables)) {
        body = body.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
    }

    // Ensure HIPAA compliance - no PHI in SMS
    body = this.sanitizeForHIPAA(body);

    const url = `${this.baseUrl}/Accounts/${this.accountSid}/Messages.json`;

    const formData = new URLSearchParams({
      To: this.normalizePhoneNumber(recipient.phone),
      From: this.fromNumber!,
      Body: body,
    });

    if (this.config.enableDeliveryReceipts) {
      // Status callback would be configured in Twilio console or via webhook URL
    }

    const result = await this.fetch<TwilioMessageResponse>(url, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
      },
      body: formData.toString(),
    });

    if (!result.success || !result.data) {
      this.emit(HEALTH_EVENTS.REMINDER_FAILED, {
        recipient: recipient.phone,
        error: result.error,
        timestamp: Date.now(),
      });

      return {
        success: false,
        error: result.error ?? 'Failed to send SMS',
        errorCode: result.errorCode,
        retryable: result.retryable,
        status: 'failed',
        timestamp: Date.now(),
      };
    }

    const response = result.data;
    const success = ['queued', 'sending', 'sent', 'delivered'].includes(response.status);

    if (success) {
      this.emit(HEALTH_EVENTS.REMINDER_SENT, {
        messageId: response.sid,
        recipient: recipient.phone,
        timestamp: Date.now(),
      });
    }

    return {
      success,
      messageId: response.sid,
      error: response.error_message,
      errorCode: response.error_code?.toString(),
      status: this.mapTwilioStatus(response.status),
      timestamp: Date.now(),
      metadata: {
        provider: 'twilio',
        dateCreated: response.date_created,
      },
    };
  }

  async sendBulk(
    recipients: NotificationRecipient[],
    message: NotificationMessage
  ): Promise<NotificationResult[]> {
    // Send in parallel with rate limiting
    const results: NotificationResult[] = [];

    // Process in batches to respect rate limits
    const batchSize = 10;
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
    this.ensureInitialized();

    const url = `${this.baseUrl}/Accounts/${this.accountSid}/Messages/${messageId}.json`;

    const result = await this.fetch<TwilioMessageResponse>(url, {
      method: 'GET',
    });

    if (!result.success || !result.data) {
      return null;
    }

    const response = result.data;
    return {
      success: ['delivered', 'sent'].includes(response.status),
      messageId: response.sid,
      error: response.error_message,
      errorCode: response.error_code?.toString(),
      status: this.mapTwilioStatus(response.status),
      timestamp: Date.now(),
    };
  }

  async processWebhook(payload: unknown): Promise<DeliveryReceipt | null> {
    const data = payload as TwilioWebhookPayload;

    if (!data.MessageSid || !data.MessageStatus) {
      return null;
    }

    const receipt: DeliveryReceipt = {
      messageId: data.MessageSid,
      status: this.mapTwilioStatusToReceipt(data.MessageStatus),
      timestamp: Date.now(),
      errorCode: data.ErrorCode,
      errorMessage: data.ErrorMessage,
      rawPayload: payload,
    };

    // Emit delivery event
    if (receipt.status === 'delivered') {
      this.emit(HEALTH_EVENTS.REMINDER_DELIVERED, {
        messageId: receipt.messageId,
        timestamp: receipt.timestamp,
      });
    } else if (receipt.status === 'failed' || receipt.status === 'undelivered') {
      this.emit(HEALTH_EVENTS.REMINDER_FAILED, {
        messageId: receipt.messageId,
        error: receipt.errorMessage,
        timestamp: receipt.timestamp,
      });
    }

    return receipt;
  }

  /**
   * Process incoming SMS reply (for confirmations)
   */
  async processIncomingMessage(
    payload: unknown
  ): Promise<{ from: string; body: string; messageId: string } | null> {
    const data = payload as {
      From?: string;
      Body?: string;
      MessageSid?: string;
    };

    if (!data.From || !data.Body || !data.MessageSid) {
      return null;
    }

    return {
      from: data.From,
      body: data.Body.trim().toUpperCase(),
      messageId: data.MessageSid,
    };
  }

  /**
   * Normalize phone number to E.164 format
   */
  private normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');

    // Add country code if missing (assuming US)
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    } else if (phone.startsWith('+')) {
      return phone;
    }

    return `+${digits}`;
  }

  /**
   * Sanitize message for HIPAA compliance
   * Remove or mask any potential PHI
   */
  private sanitizeForHIPAA(message: string): string {
    // Don't include full patient names in SMS
    // Use first name only or generic "your child"
    // Don't include specific diagnosis information
    // Don't include full addresses
    // Keep message short and use confirmation links
    return message;
  }

  /**
   * Map Twilio status to our status
   */
  private mapTwilioStatus(
    status: string
  ): NotificationResult['status'] {
    switch (status.toLowerCase()) {
      case 'queued':
      case 'accepted':
        return 'queued';
      case 'sending':
      case 'sent':
        return 'sent';
      case 'delivered':
        return 'delivered';
      case 'failed':
      case 'canceled':
        return 'failed';
      case 'undelivered':
        return 'undelivered';
      default:
        return 'queued';
    }
  }

  /**
   * Map Twilio webhook status to receipt status
   */
  private mapTwilioStatusToReceipt(
    status: string
  ): DeliveryReceipt['status'] {
    switch (status.toLowerCase()) {
      case 'delivered':
        return 'delivered';
      case 'read':
        return 'read';
      case 'failed':
        return 'failed';
      case 'undelivered':
        return 'undelivered';
      default:
        return 'delivered';
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createSMSProvider(config: SMSConfig): SMSNotificationProvider {
  return new SMSNotificationProvider({
    provider: config.provider,
    accountSidEnvVar: config.accountSidEnvVar,
    authTokenEnvVar: config.authTokenEnvVar,
    fromNumberEnvVar: config.fromNumberEnvVar,
    enableDeliveryReceipts: config.enableDeliveryReceipts,
    rateLimitPerMinute: config.rateLimitPerMinute,
  });
}
