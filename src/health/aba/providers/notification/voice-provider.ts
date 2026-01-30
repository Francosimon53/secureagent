/**
 * Voice Notification Provider
 *
 * Voice call notification provider with Twilio integration for:
 * - Urgent appointment reminders
 * - Critical authorization alerts
 * - Emergency notifications
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
import type { VoiceConfig } from '../../config.js';

// =============================================================================
// Voice Provider Configuration
// =============================================================================

export interface VoiceProviderConfig extends HealthProviderConfig {
  provider: 'twilio' | 'vonage';
  accountSidEnvVar: string;
  authTokenEnvVar: string;
  fromNumberEnvVar: string;
  voice: 'alice' | 'man' | 'woman' | 'polly';
  language: string;
  maxCallDurationSeconds: number;
}

// =============================================================================
// Twilio Call Response Types
// =============================================================================

interface TwilioCallResponse {
  sid: string;
  status: string;
  duration?: string;
  error_code?: number;
  error_message?: string;
  date_created: string;
}

interface TwilioCallWebhookPayload {
  CallSid: string;
  CallStatus: string;
  CallDuration?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  Digits?: string; // DTMF input
  To?: string;
  From?: string;
}

// =============================================================================
// Voice Notification Provider
// =============================================================================

export class VoiceNotificationProvider
  extends BaseHealthProvider<VoiceProviderConfig>
  implements NotificationProvider
{
  private accountSid: string | undefined;
  private authToken: string | undefined;
  private fromNumber: string | undefined;
  private readonly baseUrl: string;

  constructor(config: VoiceProviderConfig) {
    super(config, ['api.twilio.com']);
    this.baseUrl = 'https://api.twilio.com/2010-04-01';
  }

  get name(): string {
    return `voice-${this.config.provider}`;
  }

  get type(): 'voice' {
    return 'voice';
  }

  protected requiresApiKey(): boolean {
    return false;
  }

  protected async onInitialize(): Promise<void> {
    this.accountSid = process.env[this.config.accountSidEnvVar];
    this.authToken = process.env[this.config.authTokenEnvVar];
    this.fromNumber = process.env[this.config.fromNumberEnvVar];

    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      throw new Error(
        `Voice provider requires ${this.config.accountSidEnvVar}, ${this.config.authTokenEnvVar}, and ${this.config.fromNumberEnvVar} environment variables`
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
        error: 'Phone number is required for voice calls',
        errorCode: HEALTH_ERROR_CODES.NOTIFICATION_NO_RECIPIENT,
        status: 'failed',
        timestamp: Date.now(),
      };
    }

    // Apply template variables
    let text = message.text;
    if (message.variables) {
      for (const [key, value] of Object.entries(message.variables)) {
        text = text.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
    }

    // Generate TwiML for the call
    const twiml = this.generateTwiML(text, recipient.language);

    const url = `${this.baseUrl}/Accounts/${this.accountSid}/Calls.json`;

    const formData = new URLSearchParams({
      To: this.normalizePhoneNumber(recipient.phone),
      From: this.fromNumber!,
      Twiml: twiml,
      Timeout: String(this.config.maxCallDurationSeconds),
    });

    const result = await this.fetch<TwilioCallResponse>(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
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
        error: result.error ?? 'Failed to initiate call',
        errorCode: result.errorCode,
        retryable: result.retryable,
        status: 'failed',
        timestamp: Date.now(),
      };
    }

    const response = result.data;
    const success = ['queued', 'ringing', 'in-progress', 'completed'].includes(
      response.status
    );

    if (success) {
      this.emit(HEALTH_EVENTS.REMINDER_SENT, {
        messageId: response.sid,
        recipient: recipient.phone,
        type: 'voice',
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
    // Voice calls are more rate-limited, process slowly
    const results: NotificationResult[] = [];

    for (const recipient of recipients) {
      const result = await this.send(recipient, message);
      results.push(result);

      // Wait between calls to avoid overwhelming
      await this.sleep(1000);
    }

    return results;
  }

  async getStatus(messageId: string): Promise<NotificationResult | null> {
    this.ensureInitialized();

    const url = `${this.baseUrl}/Accounts/${this.accountSid}/Calls/${messageId}.json`;

    const result = await this.fetch<TwilioCallResponse>(url, {
      method: 'GET',
    });

    if (!result.success || !result.data) {
      return null;
    }

    const response = result.data;
    return {
      success: response.status === 'completed',
      messageId: response.sid,
      error: response.error_message,
      errorCode: response.error_code?.toString(),
      status: this.mapTwilioStatus(response.status),
      timestamp: Date.now(),
      metadata: {
        duration: response.duration,
      },
    };
  }

  async processWebhook(payload: unknown): Promise<DeliveryReceipt | null> {
    const data = payload as TwilioCallWebhookPayload;

    if (!data.CallSid || !data.CallStatus) {
      return null;
    }

    const receipt: DeliveryReceipt = {
      messageId: data.CallSid,
      status: this.mapTwilioStatusToReceipt(data.CallStatus),
      timestamp: Date.now(),
      errorCode: data.ErrorCode,
      errorMessage: data.ErrorMessage,
      rawPayload: payload,
    };

    // Emit delivery event
    if (receipt.status === 'delivered') {
      this.emit(HEALTH_EVENTS.REMINDER_DELIVERED, {
        messageId: receipt.messageId,
        duration: data.CallDuration,
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

  /**
   * Process DTMF input from call (for confirmations)
   */
  async processKeyPress(
    payload: unknown
  ): Promise<{ callSid: string; digits: string } | null> {
    const data = payload as TwilioCallWebhookPayload;

    if (!data.CallSid || !data.Digits) {
      return null;
    }

    return {
      callSid: data.CallSid,
      digits: data.Digits,
    };
  }

  /**
   * Make a call with confirmation request (press 1 to confirm)
   */
  async sendWithConfirmation(
    recipient: NotificationRecipient,
    message: NotificationMessage,
    callbackUrl: string
  ): Promise<NotificationResult> {
    this.ensureInitialized();

    if (!recipient.phone) {
      return {
        success: false,
        error: 'Phone number is required for voice calls',
        errorCode: HEALTH_ERROR_CODES.NOTIFICATION_NO_RECIPIENT,
        status: 'failed',
        timestamp: Date.now(),
      };
    }

    let text = message.text;
    if (message.variables) {
      for (const [key, value] of Object.entries(message.variables)) {
        text = text.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
    }

    const twiml = this.generateConfirmationTwiML(text, callbackUrl, recipient.language);

    const url = `${this.baseUrl}/Accounts/${this.accountSid}/Calls.json`;

    const formData = new URLSearchParams({
      To: this.normalizePhoneNumber(recipient.phone),
      From: this.fromNumber!,
      Twiml: twiml,
      Timeout: String(this.config.maxCallDurationSeconds),
    });

    const result = await this.fetch<TwilioCallResponse>(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: formData.toString(),
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to initiate call',
        errorCode: result.errorCode,
        retryable: result.retryable,
        status: 'failed',
        timestamp: Date.now(),
      };
    }

    return {
      success: true,
      messageId: result.data.sid,
      status: this.mapTwilioStatus(result.data.status),
      timestamp: Date.now(),
    };
  }

  /**
   * Generate TwiML for text-to-speech
   */
  private generateTwiML(text: string, language?: string): string {
    const lang = language ?? this.config.language;
    const voice = this.config.voice;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${lang}">${this.escapeXml(text)}</Say>
</Response>`;
  }

  /**
   * Generate TwiML with confirmation request
   */
  private generateConfirmationTwiML(
    text: string,
    callbackUrl: string,
    language?: string
  ): string {
    const lang = language ?? this.config.language;
    const voice = this.config.voice;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${lang}">${this.escapeXml(text)}</Say>
  <Gather numDigits="1" action="${callbackUrl}" method="POST" timeout="10">
    <Say voice="${voice}" language="${lang}">
      Press 1 to confirm this appointment. Press 2 to request a reschedule.
    </Say>
  </Gather>
  <Say voice="${voice}" language="${lang}">
    We did not receive a response. Goodbye.
  </Say>
</Response>`;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Normalize phone number to E.164 format
   */
  private normalizePhoneNumber(phone: string): string {
    const digits = phone.replace(/\D/g, '');

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
   * Map Twilio call status to our status
   */
  private mapTwilioStatus(status: string): NotificationResult['status'] {
    switch (status.toLowerCase()) {
      case 'queued':
      case 'initiated':
        return 'queued';
      case 'ringing':
      case 'in-progress':
        return 'sent';
      case 'completed':
        return 'delivered';
      case 'busy':
      case 'no-answer':
      case 'canceled':
        return 'undelivered';
      case 'failed':
        return 'failed';
      default:
        return 'queued';
    }
  }

  /**
   * Map Twilio webhook status to receipt status
   */
  private mapTwilioStatusToReceipt(status: string): DeliveryReceipt['status'] {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'delivered';
      case 'busy':
      case 'no-answer':
      case 'canceled':
        return 'undelivered';
      case 'failed':
        return 'failed';
      default:
        return 'delivered';
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createVoiceProvider(config: VoiceConfig): VoiceNotificationProvider {
  return new VoiceNotificationProvider({
    provider: config.provider,
    accountSidEnvVar: config.accountSidEnvVar,
    authTokenEnvVar: config.authTokenEnvVar,
    fromNumberEnvVar: config.fromNumberEnvVar,
    voice: config.voice,
    language: config.language,
    maxCallDurationSeconds: config.maxCallDurationSeconds,
    rateLimitPerMinute: config.rateLimitPerMinute,
  });
}
