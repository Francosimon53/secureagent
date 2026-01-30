/**
 * Notification Provider Types
 *
 * Common types for all notification providers (SMS, Email, Voice)
 */

/**
 * Notification message content
 */
export interface NotificationMessage {
  /** Template ID */
  templateId?: string;
  /** Plain text content */
  text: string;
  /** HTML content (for email) */
  html?: string;
  /** Subject line (for email) */
  subject?: string;
  /** Template variables */
  variables?: Record<string, string | number>;
}

/**
 * Notification recipient
 */
export interface NotificationRecipient {
  /** Recipient phone number (E.164 format for SMS/voice) */
  phone?: string;
  /** Recipient email address */
  email?: string;
  /** Recipient name */
  name?: string;
  /** Preferred language */
  language?: string;
}

/**
 * Notification result
 */
export interface NotificationResult {
  /** Whether sending was successful */
  success: boolean;
  /** Provider message ID */
  messageId?: string;
  /** Error message if failed */
  error?: string;
  /** Error code */
  errorCode?: string;
  /** Whether the error is retryable */
  retryable?: boolean;
  /** Delivery status */
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  /** Timestamp */
  timestamp: number;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Delivery receipt/webhook payload
 */
export interface DeliveryReceipt {
  /** Provider message ID */
  messageId: string;
  /** Delivery status */
  status: 'delivered' | 'failed' | 'undelivered' | 'read';
  /** Timestamp */
  timestamp: number;
  /** Error code (if failed) */
  errorCode?: string;
  /** Error message (if failed) */
  errorMessage?: string;
  /** Raw webhook payload */
  rawPayload?: unknown;
}

/**
 * Notification provider interface
 */
export interface NotificationProvider {
  /** Provider name */
  readonly name: string;
  /** Provider type (sms, email, voice) */
  readonly type: 'sms' | 'email' | 'voice';

  /** Initialize the provider */
  initialize(): Promise<void>;
  /** Shutdown the provider */
  shutdown(): Promise<void>;
  /** Check if initialized */
  isInitialized(): boolean;

  /** Send a notification */
  send(recipient: NotificationRecipient, message: NotificationMessage): Promise<NotificationResult>;

  /** Send bulk notifications */
  sendBulk(
    recipients: NotificationRecipient[],
    message: NotificationMessage
  ): Promise<NotificationResult[]>;

  /** Get delivery status */
  getStatus(messageId: string): Promise<NotificationResult | null>;

  /** Process delivery receipt webhook */
  processWebhook(payload: unknown): Promise<DeliveryReceipt | null>;
}
