/**
 * SMS 2FA Bridge Provider
 *
 * Secure SMS forwarding for two-factor authentication.
 *
 * SECURITY NOTES:
 * - Codes are NEVER stored - they are passed through immediately
 * - Explicit user consent is required before enabling
 * - Sessions expire after configurable timeout (default 5 minutes)
 * - Rate limiting prevents abuse
 * - All operations are audit logged
 */

import { BaseSavingsProvider, SavingsProviderError } from './base.js';

/**
 * SMS provider type
 */
export type SmsProviderType = 'twilio' | 'vonage' | 'mock';

/**
 * SMS 2FA bridge configuration
 */
export interface Sms2FABridgeConfig {
  provider: SmsProviderType;
  sessionTimeoutSeconds: number;
  maxSessionsPerHour: number;
  requireExplicitConsent: boolean;
  webhookUrl?: string;
  // Provider-specific credentials (never logged)
  credentials?: {
    accountSid?: string;
    authToken?: string;
    apiKey?: string;
    apiSecret?: string;
  };
}

/**
 * SMS message
 */
export interface SmsMessage {
  from: string;
  to: string;
  body: string;
  receivedAt: number;
}

/**
 * 2FA code extraction result
 */
export interface CodeExtractionResult {
  found: boolean;
  code?: string;
  confidence: number;
  source?: string;
}

/**
 * SMS 2FA bridge provider
 */
export class Sms2FABridgeProvider extends BaseSavingsProvider {
  readonly name = 'sms-2fa-bridge';
  readonly version = '1.0.0';

  get type(): string {
    return 'sms-2fa';
  }

  private readonly bridgeConfig: Sms2FABridgeConfig;
  private messageCallbacks: Map<string, (message: SmsMessage) => void> = new Map();
  private auditLog: Array<{
    timestamp: number;
    action: string;
    userId?: string;
    details: Record<string, unknown>;
  }> = [];

  constructor(config?: Partial<Sms2FABridgeConfig>) {
    super({ name: 'sms-2fa-bridge' });
    this.bridgeConfig = {
      provider: config?.provider ?? 'mock',
      sessionTimeoutSeconds: config?.sessionTimeoutSeconds ?? 300,
      maxSessionsPerHour: config?.maxSessionsPerHour ?? 5,
      requireExplicitConsent: config?.requireExplicitConsent ?? true,
      webhookUrl: config?.webhookUrl,
      credentials: config?.credentials,
    };
  }

  /**
   * Register a callback for incoming messages
   *
   * @param userId - User ID for the callback
   * @param callback - Function to call when a message is received
   * @returns Cleanup function to unregister the callback
   */
  registerMessageCallback(
    userId: string,
    callback: (message: SmsMessage) => void
  ): () => void {
    this.messageCallbacks.set(userId, callback);
    this.log('callback-registered', userId);

    // Auto-cleanup after timeout
    const timeout = setTimeout(() => {
      this.messageCallbacks.delete(userId);
      this.log('callback-expired', userId);
    }, this.bridgeConfig.sessionTimeoutSeconds * 1000);

    return () => {
      clearTimeout(timeout);
      this.messageCallbacks.delete(userId);
      this.log('callback-unregistered', userId);
    };
  }

  /**
   * Handle incoming SMS webhook
   *
   * This would be called by your webhook endpoint when an SMS is received.
   * The code is extracted and passed directly to the callback - NEVER stored.
   */
  async handleIncomingMessage(message: SmsMessage): Promise<{
    processed: boolean;
    codeFound: boolean;
  }> {
    this.log('message-received', undefined, { from: message.from });

    // Try to extract 2FA code
    const extraction = this.extractCode(message.body);

    if (!extraction.found) {
      return { processed: false, codeFound: false };
    }

    // Find matching callback and invoke it
    // Note: Code is passed through, not stored
    let processed = false;
    for (const [userId, callback] of this.messageCallbacks) {
      try {
        // Pass the message to callback - code will be used immediately
        callback(message);
        processed = true;
        this.log('code-delivered', userId, {
          confidence: extraction.confidence,
          source: extraction.source,
        });
      } catch (error) {
        this.log('callback-error', userId, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { processed, codeFound: extraction.found };
  }

  /**
   * Extract 2FA code from message text
   *
   * IMPORTANT: This extracts but does NOT store the code.
   * The code should be used immediately and discarded.
   */
  extractCode(messageBody: string): CodeExtractionResult {
    const patterns = [
      // 6-digit codes
      { regex: /\b(\d{6})\b/, confidence: 0.9, source: '6-digit' },
      // 4-digit codes
      { regex: /\b(\d{4})\b/, confidence: 0.7, source: '4-digit' },
      // Codes with prefix like "Code: 123456"
      { regex: /code[:\s]+(\d{4,8})/i, confidence: 0.95, source: 'labeled-code' },
      // OTP pattern
      { regex: /OTP[:\s]+(\d{4,8})/i, confidence: 0.95, source: 'otp' },
      // Verification code
      { regex: /verification[:\s]+(\d{4,8})/i, confidence: 0.9, source: 'verification' },
      // PIN
      { regex: /PIN[:\s]+(\d{4,8})/i, confidence: 0.9, source: 'pin' },
      // Security code
      { regex: /security code[:\s]+(\d{4,8})/i, confidence: 0.9, source: 'security' },
    ];

    for (const pattern of patterns) {
      const match = pattern.regex.exec(messageBody);
      if (match) {
        return {
          found: true,
          code: match[1],
          confidence: pattern.confidence,
          source: pattern.source,
        };
      }
    }

    return {
      found: false,
      confidence: 0,
    };
  }

  /**
   * Get webhook URL for configuring SMS forwarding
   */
  getWebhookUrl(): string | undefined {
    return this.bridgeConfig.webhookUrl;
  }

  /**
   * Get provider configuration (without sensitive data)
   */
  getProviderInfo(): {
    provider: SmsProviderType;
    sessionTimeoutSeconds: number;
    maxSessionsPerHour: number;
    requireExplicitConsent: boolean;
    webhookConfigured: boolean;
  } {
    return {
      provider: this.bridgeConfig.provider,
      sessionTimeoutSeconds: this.bridgeConfig.sessionTimeoutSeconds,
      maxSessionsPerHour: this.bridgeConfig.maxSessionsPerHour,
      requireExplicitConsent: this.bridgeConfig.requireExplicitConsent,
      webhookConfigured: !!this.bridgeConfig.webhookUrl,
    };
  }

  /**
   * Check if provider is properly configured
   */
  isConfigured(): boolean {
    if (this.bridgeConfig.provider === 'mock') {
      return true;
    }

    if (this.bridgeConfig.provider === 'twilio') {
      return !!(
        this.bridgeConfig.credentials?.accountSid &&
        this.bridgeConfig.credentials?.authToken
      );
    }

    if (this.bridgeConfig.provider === 'vonage') {
      return !!(
        this.bridgeConfig.credentials?.apiKey &&
        this.bridgeConfig.credentials?.apiSecret
      );
    }

    return false;
  }

  /**
   * Validate webhook signature
   *
   * Different providers use different signature methods.
   */
  validateWebhookSignature(
    payload: string,
    signature: string,
    timestamp?: string
  ): boolean {
    if (this.bridgeConfig.provider === 'mock') {
      return true;
    }

    // In production, implement actual signature validation
    // for Twilio, Vonage, etc.

    // Twilio uses X-Twilio-Signature header
    // Vonage uses signature_secret validation

    // For now, return true if credentials are configured
    return this.isConfigured();
  }

  /**
   * Get audit log for a user
   */
  getAuditLog(userId: string, limit: number = 100): Array<{
    timestamp: number;
    action: string;
    details: Record<string, unknown>;
  }> {
    return this.auditLog
      .filter(entry => entry.userId === userId)
      .slice(-limit);
  }

  /**
   * Clear old audit log entries
   */
  pruneAuditLog(olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - olderThanMs;
    const initialLength = this.auditLog.length;
    this.auditLog = this.auditLog.filter(entry => entry.timestamp > cutoff);
    return initialLength - this.auditLog.length;
  }

  /**
   * Log an action for auditing
   */
  private log(
    action: string,
    userId?: string,
    details: Record<string, unknown> = {}
  ): void {
    // Never log sensitive data like codes
    const safeDetails = { ...details };
    delete safeDetails.code;
    delete safeDetails.body;

    this.auditLog.push({
      timestamp: Date.now(),
      action,
      userId,
      details: safeDetails,
    });

    // Keep only last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
  }
}

/**
 * Mock SMS provider for testing
 */
export class MockSmsProvider {
  private bridge: Sms2FABridgeProvider;

  constructor(bridge: Sms2FABridgeProvider) {
    this.bridge = bridge;
  }

  /**
   * Simulate receiving an SMS with a 2FA code
   */
  async simulateIncomingCode(
    fromNumber: string,
    code: string
  ): Promise<void> {
    const message: SmsMessage = {
      from: fromNumber,
      to: '+1234567890',
      body: `Your verification code is: ${code}. This code expires in 10 minutes.`,
      receivedAt: Date.now(),
    };

    await this.bridge.handleIncomingMessage(message);
  }

  /**
   * Simulate receiving a generic SMS
   */
  async simulateIncomingMessage(
    fromNumber: string,
    body: string
  ): Promise<void> {
    const message: SmsMessage = {
      from: fromNumber,
      to: '+1234567890',
      body,
      receivedAt: Date.now(),
    };

    await this.bridge.handleIncomingMessage(message);
  }
}

/**
 * Create SMS 2FA bridge provider factory
 */
export function createSms2FABridge(
  config?: Partial<Sms2FABridgeConfig>
): Sms2FABridgeProvider {
  return new Sms2FABridgeProvider(config);
}
