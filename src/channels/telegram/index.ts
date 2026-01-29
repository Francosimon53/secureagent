import { timingSafeEqual } from 'crypto';
import { BaseChannel, Message, SendOptions } from '../base.js';
import { getLogger, getAuditLogger } from '../../observability/logger.js';
import { RateLimiter } from '../../security/guardrails/rate-limiter.js';

const logger = getLogger().child({ module: 'TelegramChannel' });
const auditLogger = getAuditLogger();

// ============================================================================
// Telegram Bot API Types
// ============================================================================

export interface TelegramConfig {
  botToken: string;
  webhookSecret?: string;      // For validating webhook requests
  baseUrl?: string;            // Default: https://api.telegram.org

  // Polling configuration
  polling?: {
    enabled?: boolean;
    timeout?: number;          // Long polling timeout in seconds
    limit?: number;            // Max updates per request (1-100)
    allowedUpdates?: string[]; // Filter update types
  };

  // Webhook configuration
  webhook?: {
    url: string;
    secretToken?: string;
    certificate?: string;      // PEM for self-signed certificates
    ipAddress?: string;        // Fixed IP for webhook
    maxConnections?: number;   // Max simultaneous connections (1-100)
    dropPendingUpdates?: boolean;
  };

  // Rate limiting
  rateLimit?: {
    messagesPerSecond?: number;
    messagesPerMinute?: number;
  };
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  date: number;
  chat: TelegramChat;
  forward_from?: TelegramUser;
  forward_from_chat?: TelegramChat;
  forward_date?: number;
  reply_to_message?: TelegramMessage;
  text?: string;
  caption?: string;
  entities?: Array<{
    type: string;
    offset: number;
    length: number;
    url?: string;
    user?: TelegramUser;
    language?: string;
  }>;
  photo?: Array<{
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    file_size?: number;
  }>;
  document?: {
    file_id: string;
    file_unique_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
  audio?: {
    file_id: string;
    file_unique_id: string;
    duration: number;
    performer?: string;
    title?: string;
    mime_type?: string;
    file_size?: number;
  };
  video?: {
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    duration: number;
    mime_type?: string;
    file_size?: number;
  };
  voice?: {
    file_id: string;
    file_unique_id: string;
    duration: number;
    mime_type?: string;
    file_size?: number;
  };
  location?: {
    longitude: number;
    latitude: number;
    horizontal_accuracy?: number;
    live_period?: number;
  };
  contact?: {
    phone_number: string;
    first_name: string;
    last_name?: string;
    user_id?: number;
    vcard?: string;
  };
  sticker?: {
    file_id: string;
    file_unique_id: string;
    type: 'regular' | 'mask' | 'custom_emoji';
    width: number;
    height: number;
    is_animated: boolean;
    is_video: boolean;
    emoji?: string;
  };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    inline_message_id?: string;
    chat_instance: string;
    data?: string;
  };
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: {
    migrate_to_chat_id?: number;
    retry_after?: number;
  };
}

// ============================================================================
// Telegram Channel Implementation
// ============================================================================

export class TelegramChannel extends BaseChannel {
  private readonly config: Required<Pick<TelegramConfig, 'botToken' | 'baseUrl'>> & {
    polling: Required<NonNullable<TelegramConfig['polling']>>;
    rateLimit: Required<NonNullable<TelegramConfig['rateLimit']>>;
    webhookSecret?: string;
    webhook?: TelegramConfig['webhook'];
  };
  private messageHandler?: (message: Message) => Promise<void>;
  private callbackHandler?: (callback: { id: string; data: string; chatId: number; messageId?: number }) => Promise<string | void>;
  private readonly rateLimiter: RateLimiter;
  private readonly minuteRateLimiter: RateLimiter;
  private pollingAbortController: AbortController | null = null;
  private lastUpdateId = 0;
  private botInfo: TelegramUser | null = null;

  constructor(config: TelegramConfig) {
    super('telegram');

    this.config = {
      botToken: config.botToken,
      webhookSecret: config.webhookSecret,
      baseUrl: config.baseUrl ?? 'https://api.telegram.org',
      webhook: config.webhook,
      polling: {
        enabled: config.polling?.enabled ?? !config.webhook,
        timeout: config.polling?.timeout ?? 30,
        limit: config.polling?.limit ?? 100,
        allowedUpdates: config.polling?.allowedUpdates ?? ['message', 'edited_message', 'callback_query'],
      },
      rateLimit: {
        messagesPerSecond: config.rateLimit?.messagesPerSecond ?? 30,
        messagesPerMinute: config.rateLimit?.messagesPerMinute ?? 1000,
      },
    };

    // Per-second rate limiter
    this.rateLimiter = new RateLimiter({
      maxTokens: this.config.rateLimit.messagesPerSecond,
      refillRate: this.config.rateLimit.messagesPerSecond,
      refillIntervalMs: 1000,
    });

    // Per-minute rate limiter
    this.minuteRateLimiter = new RateLimiter({
      maxTokens: this.config.rateLimit.messagesPerMinute,
      refillRate: this.config.rateLimit.messagesPerMinute,
      refillIntervalMs: 60000,
    });
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async connect(): Promise<void> {
    try {
      // Get bot info
      this.botInfo = await this.apiRequest<TelegramUser>('getMe');
      logger.info(
        { botId: this.botInfo.id, username: this.botInfo.username },
        'Telegram bot connected'
      );

      // Set up webhook or start polling
      if (this.config.webhook) {
        await this.setupWebhook();
      } else if (this.config.polling.enabled) {
        this.startPolling();
      }

      this.setConnected(true);
    } catch (error) {
      logger.error({ error }, 'Failed to connect Telegram channel');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling();

    // Remove webhook if it was set
    if (this.config.webhook) {
      try {
        await this.apiRequest('deleteWebhook');
      } catch {
        // Ignore errors during cleanup
      }
    }

    this.setConnected(false);
    logger.info('Telegram channel disconnected');
  }

  // ============================================================================
  // Webhook Setup
  // ============================================================================

  private async setupWebhook(): Promise<void> {
    if (!this.config.webhook) return;

    const params: Record<string, unknown> = {
      url: this.config.webhook.url,
      allowed_updates: this.config.polling.allowedUpdates,
    };

    if (this.config.webhook.secretToken) {
      params.secret_token = this.config.webhook.secretToken;
    }
    if (this.config.webhook.certificate) {
      params.certificate = this.config.webhook.certificate;
    }
    if (this.config.webhook.ipAddress) {
      params.ip_address = this.config.webhook.ipAddress;
    }
    if (this.config.webhook.maxConnections) {
      params.max_connections = this.config.webhook.maxConnections;
    }
    if (this.config.webhook.dropPendingUpdates) {
      params.drop_pending_updates = this.config.webhook.dropPendingUpdates;
    }

    await this.apiRequest('setWebhook', params);
    logger.info({ url: this.config.webhook.url }, 'Telegram webhook configured');
  }

  // ============================================================================
  // Long Polling
  // ============================================================================

  private startPolling(): void {
    this.pollingAbortController = new AbortController();
    this.pollLoop();
  }

  private stopPolling(): void {
    if (this.pollingAbortController) {
      this.pollingAbortController.abort();
      this.pollingAbortController = null;
    }
  }

  private async pollLoop(): Promise<void> {
    while (this.pollingAbortController && !this.pollingAbortController.signal.aborted) {
      try {
        const updates = await this.apiRequest<TelegramUpdate[]>('getUpdates', {
          offset: this.lastUpdateId + 1,
          limit: this.config.polling.limit,
          timeout: this.config.polling.timeout,
          allowed_updates: this.config.polling.allowedUpdates,
        });

        for (const update of updates) {
          this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
          await this.processUpdate(update);
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          break;
        }

        logger.error({ error }, 'Telegram polling error');
        // Wait before retrying
        await this.sleep(5000);
      }
    }
  }

  // ============================================================================
  // Update Processing
  // ============================================================================

  private async processUpdate(update: TelegramUpdate): Promise<void> {
    // Handle messages
    const msg = update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post;
    if (msg && this.messageHandler) {
      const message = this.telegramToMessage(msg, !!update.edited_message || !!update.edited_channel_post);
      try {
        await this.messageHandler(message);
      } catch (error) {
        logger.error({ error, messageId: msg.message_id }, 'Error handling Telegram message');
      }
    }

    // Handle callback queries
    if (update.callback_query && this.callbackHandler) {
      try {
        const answer = await this.callbackHandler({
          id: update.callback_query.id,
          data: update.callback_query.data ?? '',
          chatId: update.callback_query.message?.chat.id ?? 0,
          messageId: update.callback_query.message?.message_id,
        });

        // Acknowledge the callback
        await this.apiRequest('answerCallbackQuery', {
          callback_query_id: update.callback_query.id,
          text: answer,
        });
      } catch (error) {
        logger.error({ error, callbackId: update.callback_query.id }, 'Error handling Telegram callback');
      }
    }
  }

  private telegramToMessage(msg: TelegramMessage, edited: boolean): Message {
    let content = msg.text ?? msg.caption ?? '';
    let metadata: Record<string, unknown> = {
      edited,
      chatType: msg.chat.type,
      chatTitle: msg.chat.title,
    };

    // Add sender info
    if (msg.from) {
      metadata.senderUsername = msg.from.username;
      metadata.senderFirstName = msg.from.first_name;
      metadata.senderLastName = msg.from.last_name;
      metadata.senderLanguage = msg.from.language_code;
    }

    // Add reply context
    if (msg.reply_to_message) {
      metadata.replyToMessageId = msg.reply_to_message.message_id;
      metadata.replyToText = msg.reply_to_message.text?.slice(0, 100);
    }

    // Add forward info
    if (msg.forward_from || msg.forward_from_chat) {
      metadata.forwarded = true;
      metadata.forwardDate = msg.forward_date;
    }

    // Handle different content types
    if (msg.photo) {
      const largestPhoto = msg.photo[msg.photo.length - 1];
      content = content || '[Photo]';
      metadata.photoFileId = largestPhoto.file_id;
      metadata.photoWidth = largestPhoto.width;
      metadata.photoHeight = largestPhoto.height;
    }

    if (msg.document) {
      content = content || `[Document: ${msg.document.file_name ?? 'unnamed'}]`;
      metadata.documentFileId = msg.document.file_id;
      metadata.documentFileName = msg.document.file_name;
      metadata.documentMimeType = msg.document.mime_type;
    }

    if (msg.audio) {
      content = content || `[Audio: ${msg.audio.title ?? 'untitled'}]`;
      metadata.audioFileId = msg.audio.file_id;
      metadata.audioDuration = msg.audio.duration;
    }

    if (msg.video) {
      content = content || '[Video]';
      metadata.videoFileId = msg.video.file_id;
      metadata.videoDuration = msg.video.duration;
    }

    if (msg.voice) {
      content = '[Voice message]';
      metadata.voiceFileId = msg.voice.file_id;
      metadata.voiceDuration = msg.voice.duration;
    }

    if (msg.location) {
      content = `[Location: ${msg.location.latitude}, ${msg.location.longitude}]`;
      metadata.location = msg.location;
    }

    if (msg.contact) {
      content = `[Contact: ${msg.contact.first_name} ${msg.contact.phone_number}]`;
      metadata.contact = msg.contact;
    }

    if (msg.sticker) {
      content = `[Sticker: ${msg.sticker.emoji ?? ''}]`;
      metadata.stickerFileId = msg.sticker.file_id;
    }

    // Parse commands and mentions
    if (msg.entities) {
      const commands = msg.entities.filter(e => e.type === 'bot_command');
      if (commands.length > 0) {
        metadata.commands = commands.map(c =>
          msg.text?.slice(c.offset, c.offset + c.length)
        );
      }

      const mentions = msg.entities.filter(e => e.type === 'mention');
      if (mentions.length > 0) {
        metadata.mentions = mentions.map(m =>
          msg.text?.slice(m.offset, m.offset + m.length)
        );
      }
    }

    return {
      id: `${msg.chat.id}:${msg.message_id}`,
      channelId: String(msg.chat.id),
      senderId: String(msg.from?.id ?? msg.sender_chat?.id ?? 0),
      content,
      timestamp: msg.date * 1000,
      metadata,
    };
  }

  // ============================================================================
  // Messaging
  // ============================================================================

  async send(
    chatId: string,
    content: string,
    options?: SendOptions & {
      parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
      disableWebPagePreview?: boolean;
      disableNotification?: boolean;
      protectContent?: boolean;
      replyMarkup?: unknown;
    }
  ): Promise<void> {
    // Check rate limits
    const perSecondResult = this.rateLimiter.consume(`telegram:send`);
    if (!perSecondResult.allowed) {
      throw new Error(`Rate limited: retry in ${perSecondResult.retryAfterMs}ms`);
    }

    const minuteResult = this.minuteRateLimiter.consume(`telegram:minute`);
    if (!minuteResult.allowed) {
      throw new Error(`Minute rate limit reached: retry in ${minuteResult.retryAfterMs}ms`);
    }

    const sanitized = this.sanitizeOutgoing(content);

    const params: Record<string, unknown> = {
      chat_id: chatId,
      text: sanitized,
    };

    if (options?.parseMode) {
      params.parse_mode = options.parseMode;
    }
    if (options?.disableWebPagePreview) {
      params.disable_web_page_preview = options.disableWebPagePreview;
    }
    if (options?.disableNotification) {
      params.disable_notification = options.disableNotification;
    }
    if (options?.protectContent) {
      params.protect_content = options.protectContent;
    }
    if (options?.replyTo) {
      params.reply_to_message_id = options.replyTo;
    }
    if (options?.replyMarkup) {
      params.reply_markup = options.replyMarkup;
    }

    const result = await this.apiRequest<TelegramMessage>('sendMessage', params);

    logger.debug(
      { chatId, messageId: result.message_id },
      'Telegram message sent'
    );

    auditLogger.log({
      eventId: `${chatId}:${result.message_id}`,
      timestamp: Date.now(),
      eventType: 'channel',
      severity: 'info',
      actor: { userId: 'system' },
      resource: { type: 'telegram_message', id: String(result.message_id) },
      action: 'send',
      outcome: 'success',
      details: { chatId, contentLength: sanitized.length },
    });
  }

  async sendPhoto(
    chatId: string,
    photo: string, // file_id, URL, or file path
    options?: { caption?: string; parseMode?: string; replyTo?: string; replyMarkup?: unknown }
  ): Promise<void> {
    const params: Record<string, unknown> = {
      chat_id: chatId,
      photo,
    };

    if (options?.caption) {
      params.caption = this.sanitizeOutgoing(options.caption);
    }
    if (options?.parseMode) {
      params.parse_mode = options.parseMode;
    }
    if (options?.replyTo) {
      params.reply_to_message_id = options.replyTo;
    }
    if (options?.replyMarkup) {
      params.reply_markup = options.replyMarkup;
    }

    await this.apiRequest<TelegramMessage>('sendPhoto', params);
  }

  async sendDocument(
    chatId: string,
    document: string,
    options?: { caption?: string; filename?: string; replyTo?: string }
  ): Promise<void> {
    const params: Record<string, unknown> = {
      chat_id: chatId,
      document,
    };

    if (options?.caption) {
      params.caption = this.sanitizeOutgoing(options.caption);
    }
    if (options?.replyTo) {
      params.reply_to_message_id = options.replyTo;
    }

    await this.apiRequest<TelegramMessage>('sendDocument', params);
  }

  async sendLocation(
    chatId: string,
    latitude: number,
    longitude: number,
    options?: { livePeriod?: number; replyTo?: string }
  ): Promise<void> {
    const params: Record<string, unknown> = {
      chat_id: chatId,
      latitude,
      longitude,
    };

    if (options?.livePeriod) {
      params.live_period = options.livePeriod;
    }
    if (options?.replyTo) {
      params.reply_to_message_id = options.replyTo;
    }

    await this.apiRequest<TelegramMessage>('sendLocation', params);
  }

  async sendChatAction(chatId: string, action: 'typing' | 'upload_photo' | 'upload_document' | 'record_voice' | 'record_video'): Promise<void> {
    await this.apiRequest('sendChatAction', {
      chat_id: chatId,
      action,
    });
  }

  async editMessage(
    chatId: string,
    messageId: number,
    text: string,
    options?: { parseMode?: string; replyMarkup?: unknown }
  ): Promise<void> {
    const params: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text: this.sanitizeOutgoing(text),
    };

    if (options?.parseMode) {
      params.parse_mode = options.parseMode;
    }
    if (options?.replyMarkup) {
      params.reply_markup = options.replyMarkup;
    }

    await this.apiRequest('editMessageText', params);
  }

  async deleteMessage(chatId: string, messageId: number): Promise<void> {
    await this.apiRequest('deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  // ============================================================================
  // Inline Keyboards
  // ============================================================================

  createInlineKeyboard(rows: Array<Array<{ text: string; callbackData?: string; url?: string }>>): unknown {
    return {
      inline_keyboard: rows.map(row =>
        row.map(button => ({
          text: button.text,
          ...(button.callbackData && { callback_data: button.callbackData }),
          ...(button.url && { url: button.url }),
        }))
      ),
    };
  }

  createReplyKeyboard(
    rows: string[][],
    options?: { oneTime?: boolean; resize?: boolean; placeholder?: string }
  ): unknown {
    return {
      keyboard: rows.map(row => row.map(text => ({ text }))),
      one_time_keyboard: options?.oneTime ?? false,
      resize_keyboard: options?.resize ?? true,
      input_field_placeholder: options?.placeholder,
    };
  }

  removeKeyboard(): unknown {
    return { remove_keyboard: true };
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  onMessage(handler: (message: Message) => Promise<void>): void {
    this.messageHandler = async (raw: Message) => {
      const sanitized = this.sanitizeIncoming(raw);
      await handler(sanitized);
    };
  }

  onCallback(handler: (callback: { id: string; data: string; chatId: number; messageId?: number }) => Promise<string | void>): void {
    this.callbackHandler = handler;
  }

  // ============================================================================
  // Webhook Handling
  // ============================================================================

  /**
   * Verify webhook request using secret token
   */
  verifyWebhook(secretToken: string): boolean {
    if (!this.config.webhook?.secretToken) {
      return true; // No secret configured
    }

    try {
      return timingSafeEqual(
        Buffer.from(secretToken),
        Buffer.from(this.config.webhook.secretToken)
      );
    } catch {
      return false;
    }
  }

  /**
   * Handle incoming webhook update
   */
  async handleWebhook(update: unknown, secretToken?: string): Promise<void> {
    // Verify secret token if provided
    if (secretToken && !this.verifyWebhook(secretToken)) {
      logger.warn('Invalid webhook secret token');
      throw new Error('Invalid webhook secret token');
    }

    await this.processUpdate(update as TelegramUpdate);
  }

  // ============================================================================
  // File Handling
  // ============================================================================

  async getFileUrl(fileId: string): Promise<string> {
    const file = await this.apiRequest<{ file_id: string; file_path: string }>('getFile', {
      file_id: fileId,
    });

    return `${this.config.baseUrl}/file/bot${this.config.botToken}/${file.file_path}`;
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const url = await this.getFileUrl(fileId);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  // ============================================================================
  // Bot Commands
  // ============================================================================

  async setCommands(commands: Array<{ command: string; description: string }>): Promise<void> {
    await this.apiRequest('setMyCommands', { commands });
  }

  async getCommands(): Promise<Array<{ command: string; description: string }>> {
    return this.apiRequest('getMyCommands');
  }

  // ============================================================================
  // API Helpers
  // ============================================================================

  private async apiRequest<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const url = `${this.config.baseUrl}/bot${this.config.botToken}/${method}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: params ? JSON.stringify(params) : undefined,
      signal: this.pollingAbortController?.signal,
    });

    const data = await response.json() as TelegramApiResponse<T>;

    if (!data.ok) {
      // Handle rate limiting
      if (data.parameters?.retry_after) {
        logger.warn(
          { retryAfter: data.parameters.retry_after },
          'Telegram rate limited'
        );
        throw new Error(`Rate limited: retry after ${data.parameters.retry_after}s`);
      }

      logger.error(
        { errorCode: data.error_code, description: data.description },
        'Telegram API error'
      );
      throw new Error(`Telegram API error: ${data.description} (code: ${data.error_code})`);
    }

    return data.result!;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getBotInfo(): TelegramUser | null {
    return this.botInfo;
  }
}

// ============================================================================
// Command Parser Helper
// ============================================================================

export interface ParsedCommand {
  command: string;
  args: string;
  argsList: string[];
  botUsername?: string;
}

export function parseCommand(text: string, botUsername?: string): ParsedCommand | null {
  const match = text.match(/^\/([a-zA-Z0-9_]+)(@[a-zA-Z0-9_]+)?(?:\s+(.*))?$/);
  if (!match) return null;

  const [, command, mention, args = ''] = match;

  // If command is addressed to a specific bot, check if it's us
  if (mention && botUsername && mention.toLowerCase() !== `@${botUsername.toLowerCase()}`) {
    return null;
  }

  return {
    command,
    args: args.trim(),
    argsList: args.trim().split(/\s+/).filter(Boolean),
    botUsername: mention?.slice(1),
  };
}
