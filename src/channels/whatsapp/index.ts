import { createHmac, timingSafeEqual } from 'crypto';
import { BaseChannel, Message, SendOptions } from '../base.js';
import { getLogger, getAuditLogger } from '../../observability/logger.js';
import { RateLimiter } from '../../security/guardrails/rate-limiter.js';

const logger = getLogger().child({ module: 'WhatsAppChannel' });
const auditLogger = getAuditLogger();

// ============================================================================
// WhatsApp Cloud API Types
// ============================================================================

export interface WhatsAppConfig {
  // WhatsApp Cloud API credentials
  phoneNumberId: string;
  accessToken: string;
  appSecret?: string;           // For webhook signature verification
  verifyToken?: string;         // For webhook verification challenge
  // Test-compatible alias
  webhookVerifyToken?: string;  // Alias for verifyToken

  // Optional configuration
  apiVersion?: string;         // Default: v18.0
  baseUrl?: string;            // Default: https://graph.facebook.com

  // Rate limiting
  rateLimit?: {
    messagesPerSecond?: number;
    messagesPerDay?: number;
  };

  // Retry configuration
  retry?: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  };
}

interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: 'whatsapp';
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: Array<{
        profile: { name: string };
        wa_id: string;
      }>;
      messages?: Array<{
        from: string;
        id: string;
        timestamp: string;
        type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'location' | 'contacts' | 'interactive' | 'button' | 'reaction';
        text?: { body: string };
        image?: { id: string; mime_type: string; sha256: string; caption?: string };
        document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string };
        audio?: { id: string; mime_type: string };
        video?: { id: string; mime_type: string; sha256: string; caption?: string };
        location?: { latitude: number; longitude: number; name?: string; address?: string };
        reaction?: { message_id: string; emoji: string };
        context?: { from: string; id: string };
      }>;
      statuses?: Array<{
        id: string;
        status: 'sent' | 'delivered' | 'read' | 'failed';
        timestamp: string;
        recipient_id: string;
        errors?: Array<{ code: number; title: string }>;
      }>;
    };
    field: string;
  }>;
}

interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: WhatsAppWebhookEntry[];
}

interface WhatsAppSendMessageResponse {
  messaging_product: 'whatsapp';
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

interface WhatsAppErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id: string;
  };
}

// ============================================================================
// WhatsApp Channel Implementation
// ============================================================================

export class WhatsAppChannel extends BaseChannel {
  private readonly config: Required<Omit<WhatsAppConfig, 'rateLimit' | 'retry'>> & {
    rateLimit: Required<NonNullable<WhatsAppConfig['rateLimit']>>;
    retry: Required<NonNullable<WhatsAppConfig['retry']>>;
  };
  private messageHandler?: (message: Message) => Promise<void>;
  private statusHandler?: (status: { messageId: string; status: string; recipientId: string }) => void;
  private readonly rateLimiter: RateLimiter;
  private readonly dailyRateLimiter: RateLimiter;

  constructor(config: WhatsAppConfig) {
    super('whatsapp');

    this.config = {
      phoneNumberId: config.phoneNumberId,
      accessToken: config.accessToken,
      appSecret: config.appSecret ?? '',
      // Support both verifyToken and webhookVerifyToken
      verifyToken: config.verifyToken ?? config.webhookVerifyToken ?? '',
      apiVersion: config.apiVersion ?? 'v18.0',
      baseUrl: config.baseUrl ?? 'https://graph.facebook.com',
      rateLimit: {
        messagesPerSecond: config.rateLimit?.messagesPerSecond ?? 80,
        messagesPerDay: config.rateLimit?.messagesPerDay ?? 1000,
      },
      retry: {
        maxAttempts: config.retry?.maxAttempts ?? 3,
        initialDelayMs: config.retry?.initialDelayMs ?? 1000,
        maxDelayMs: config.retry?.maxDelayMs ?? 30000,
      },
    };

    // Per-second rate limiter
    this.rateLimiter = new RateLimiter({
      maxTokens: this.config.rateLimit.messagesPerSecond,
      refillRate: this.config.rateLimit.messagesPerSecond,
      refillIntervalMs: 1000,
    });

    // Daily rate limiter
    this.dailyRateLimiter = new RateLimiter({
      maxTokens: this.config.rateLimit.messagesPerDay,
      refillRate: this.config.rateLimit.messagesPerDay,
      refillIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
    });
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async connect(): Promise<void> {
    // Verify credentials by fetching phone number info
    try {
      const response = await this.apiRequest<{ id: string; display_phone_number: string }>(
        'GET',
        `/${this.config.phoneNumberId}`
      );

      logger.info(
        { phoneNumberId: response.id, displayNumber: response.display_phone_number },
        'WhatsApp channel connected'
      );

      this.setConnected(true);
    } catch (error) {
      logger.error({ error }, 'Failed to connect WhatsApp channel');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.setConnected(false);
    logger.info('WhatsApp channel disconnected');
  }

  // ============================================================================
  // Messaging
  // ============================================================================

  async send(
    recipientId: string,
    content: string,
    options?: SendOptions & {
      previewUrl?: boolean;
      messageType?: 'text' | 'template';
      templateName?: string;
      templateLanguage?: string;
      templateComponents?: unknown[];
    }
  ): Promise<void> {
    // Check rate limits
    const perSecondResult = this.rateLimiter.consume(`whatsapp:send`);
    if (!perSecondResult.allowed) {
      throw new Error(`Rate limited: retry in ${perSecondResult.retryAfterMs}ms`);
    }

    const dailyResult = this.dailyRateLimiter.consume(`whatsapp:daily`);
    if (!dailyResult.allowed) {
      throw new Error('Daily message limit reached');
    }

    const sanitized = this.sanitizeOutgoing(content);

    // Build message payload
    let payload: Record<string, unknown>;

    if (options?.messageType === 'template' && options.templateName) {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientId,
        type: 'template',
        template: {
          name: options.templateName,
          language: { code: options.templateLanguage ?? 'en_US' },
          components: options.templateComponents,
        },
      };
    } else {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientId,
        type: 'text',
        text: {
          preview_url: options?.previewUrl ?? false,
          body: sanitized,
        },
      };

      // Add reply context if specified
      if (options?.replyTo) {
        payload.context = { message_id: options.replyTo };
      }
    }

    // Send with retry
    const response = await this.apiRequestWithRetry<WhatsAppSendMessageResponse>(
      'POST',
      `/${this.config.phoneNumberId}/messages`,
      payload
    );

    logger.debug(
      { recipientId, messageId: response.messages[0]?.id },
      'WhatsApp message sent'
    );

    // Audit log
    auditLogger.log({
      eventId: response.messages[0]?.id ?? crypto.randomUUID(),
      timestamp: Date.now(),
      eventType: 'channel',
      severity: 'info',
      actor: { userId: 'system' },
      resource: { type: 'whatsapp_message', id: response.messages[0]?.id ?? '' },
      action: 'send',
      outcome: 'success',
      details: { recipientId, contentLength: sanitized.length },
    });
  }

  async sendMedia(
    recipientId: string,
    mediaType: 'image' | 'document' | 'audio' | 'video' | 'sticker',
    mediaIdOrUrl: string,
    options?: { caption?: string; filename?: string; replyTo?: string }
  ): Promise<void> {
    const perSecondResult = this.rateLimiter.consume(`whatsapp:send`);
    if (!perSecondResult.allowed) {
      throw new Error(`Rate limited: retry in ${perSecondResult.retryAfterMs}ms`);
    }

    const isUrl = mediaIdOrUrl.startsWith('http://') || mediaIdOrUrl.startsWith('https://');
    const mediaKey = isUrl ? 'link' : 'id';

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientId,
      type: mediaType,
      [mediaType]: {
        [mediaKey]: mediaIdOrUrl,
        caption: options?.caption ? this.sanitizeOutgoing(options.caption) : undefined,
        filename: options?.filename,
      },
    };

    if (options?.replyTo) {
      payload.context = { message_id: options.replyTo };
    }

    await this.apiRequestWithRetry<WhatsAppSendMessageResponse>(
      'POST',
      `/${this.config.phoneNumberId}/messages`,
      payload
    );
  }

  async sendLocation(
    recipientId: string,
    latitude: number,
    longitude: number,
    options?: { name?: string; address?: string; replyTo?: string }
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientId,
      type: 'location',
      location: {
        latitude,
        longitude,
        name: options?.name,
        address: options?.address,
      },
    };

    if (options?.replyTo) {
      payload.context = { message_id: options.replyTo };
    }

    await this.apiRequestWithRetry<WhatsAppSendMessageResponse>(
      'POST',
      `/${this.config.phoneNumberId}/messages`,
      payload
    );
  }

  async markAsRead(messageId: string): Promise<void> {
    await this.apiRequest(
      'POST',
      `/${this.config.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }
    );
  }

  // ============================================================================
  // Webhook Handling
  // ============================================================================

  onMessage(handler: (message: Message) => Promise<void>): void {
    this.messageHandler = async (raw: Message) => {
      const sanitized = this.sanitizeIncoming(raw);
      await handler(sanitized);
    };
  }

  onStatus(handler: (status: { messageId: string; status: string; recipientId: string }) => void): void {
    this.statusHandler = handler;
  }

  /**
   * Verify webhook challenge from Meta
   * Supports both object params and positional arguments (mode, token, challenge)
   */
  verifyWebhook(
    paramsOrMode: {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    } | string,
    verifyToken?: string,
    challenge?: string
  ): { verified: boolean; challenge?: string } {
    let mode: string | undefined;
    let token: string | undefined;
    let challengeValue: string | undefined;

    // Support both signatures
    if (typeof paramsOrMode === 'string') {
      // Positional arguments: verifyWebhook(mode, token, challenge)
      mode = paramsOrMode;
      token = verifyToken;
      challengeValue = challenge;
    } else {
      // Object params: verifyWebhook({ 'hub.mode', 'hub.verify_token', 'hub.challenge' })
      mode = paramsOrMode['hub.mode'];
      token = paramsOrMode['hub.verify_token'];
      challengeValue = paramsOrMode['hub.challenge'];
    }

    if (
      mode === 'subscribe' &&
      token === this.config.verifyToken
    ) {
      logger.info('WhatsApp webhook verified');
      return { verified: true, challenge: challengeValue };
    }

    logger.warn('WhatsApp webhook verification failed');
    return { verified: false };
  }

  /**
   * Verify webhook signature
   */
  verifySignature(payload: string | Buffer, signature: string): boolean {
    const expectedSignature = createHmac('sha256', this.config.appSecret)
      .update(payload)
      .digest('hex');

    const signatureBuffer = Buffer.from(signature.replace('sha256=', ''));
    const expectedBuffer = Buffer.from(expectedSignature);

    try {
      return timingSafeEqual(signatureBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Handle incoming webhook payload
   */
  async handleWebhook(
    payload: unknown,
    signature?: string,
    rawBody?: string | Buffer
  ): Promise<void> {
    // Verify signature if provided
    if (signature && rawBody) {
      if (!this.verifySignature(rawBody, signature)) {
        logger.warn('Invalid webhook signature');
        throw new Error('Invalid webhook signature');
      }
    }

    const webhookPayload = payload as WhatsAppWebhookPayload;

    if (webhookPayload.object !== 'whatsapp_business_account') {
      return;
    }

    for (const entry of webhookPayload.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'messages') continue;

        const value = change.value;

        // Handle incoming messages
        if (value.messages && this.messageHandler) {
          for (const msg of value.messages) {
            const contact = value.contacts?.find(c => c.wa_id === msg.from);

            const message: Message = {
              id: msg.id,
              channelId: value.metadata.phone_number_id,
              senderId: msg.from,
              content: this.extractMessageContent(msg),
              timestamp: parseInt(msg.timestamp, 10) * 1000,
              metadata: {
                senderName: contact?.profile.name,
                messageType: msg.type,
                context: msg.context,
                ...(msg.image && { mediaId: msg.image.id, mimeType: msg.image.mime_type }),
                ...(msg.document && { mediaId: msg.document.id, filename: msg.document.filename }),
                ...(msg.audio && { mediaId: msg.audio.id }),
                ...(msg.video && { mediaId: msg.video.id }),
                ...(msg.location && { location: msg.location }),
              },
            };

            try {
              await this.messageHandler(message);
            } catch (error) {
              logger.error({ error, messageId: msg.id }, 'Error handling WhatsApp message');
            }
          }
        }

        // Handle status updates
        if (value.statuses && this.statusHandler) {
          for (const status of value.statuses) {
            this.statusHandler({
              messageId: status.id,
              status: status.status,
              recipientId: status.recipient_id,
            });

            if (status.errors) {
              logger.warn(
                { messageId: status.id, errors: status.errors },
                'WhatsApp message delivery failed'
              );
            }
          }
        }
      }
    }
  }

  private extractMessageContent(msg: NonNullable<WhatsAppWebhookEntry['changes'][0]['value']['messages']>[0]): string {
    switch (msg.type) {
      case 'text':
        return msg.text?.body ?? '';
      case 'image':
        return msg.image?.caption ?? '[Image]';
      case 'document':
        return msg.document?.caption ?? `[Document: ${msg.document?.filename ?? 'unnamed'}]`;
      case 'audio':
        return '[Audio message]';
      case 'video':
        return msg.video?.caption ?? '[Video]';
      case 'sticker':
        return '[Sticker]';
      case 'location':
        return `[Location: ${msg.location?.name ?? `${msg.location?.latitude},${msg.location?.longitude}`}]`;
      case 'reaction':
        return `[Reaction: ${msg.reaction?.emoji}]`;
      default:
        return '[Unsupported message type]';
    }
  }

  // ============================================================================
  // Media Handling
  // ============================================================================

  async downloadMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
    // First, get the media URL
    const mediaInfo = await this.apiRequest<{ url: string; mime_type: string }>(
      'GET',
      `/${mediaId}`
    );

    // Download the media
    const response = await fetch(mediaInfo.url, {
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download media: ${response.status}`);
    }

    const data = Buffer.from(await response.arrayBuffer());

    return {
      data,
      mimeType: mediaInfo.mime_type,
    };
  }

  async uploadMedia(
    data: Buffer,
    mimeType: string,
    filename?: string
  ): Promise<string> {
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('file', new Blob([data], { type: mimeType }), filename ?? 'file');
    formData.append('type', mimeType);

    const response = await fetch(
      `${this.config.baseUrl}/${this.config.apiVersion}/${this.config.phoneNumberId}/media`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const error = await response.json() as WhatsAppErrorResponse;
      throw new Error(`Media upload failed: ${error.error.message}`);
    }

    const result = await response.json() as { id: string };
    return result.id;
  }

  // ============================================================================
  // API Helpers
  // ============================================================================

  private async apiRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.config.baseUrl}/${this.config.apiVersion}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as WhatsAppErrorResponse;
      logger.error(
        { status: response.status, error: error.error },
        'WhatsApp API error'
      );
      throw new Error(`WhatsApp API error: ${error.error.message} (code: ${error.error.code})`);
    }

    return data as T;
  }

  private async apiRequestWithRetry<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = this.config.retry.initialDelayMs;

    for (let attempt = 1; attempt <= this.config.retry.maxAttempts; attempt++) {
      try {
        return await this.apiRequest<T>(method, path, body);
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx)
        if (lastError.message.includes('code: 4')) {
          throw lastError;
        }

        if (attempt < this.config.retry.maxAttempts) {
          logger.warn(
            { attempt, delay, error: lastError.message },
            'WhatsApp API request failed, retrying'
          );

          await this.sleep(delay);
          delay = Math.min(delay * 2, this.config.retry.maxDelayMs);
        }
      }
    }

    throw lastError!;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
