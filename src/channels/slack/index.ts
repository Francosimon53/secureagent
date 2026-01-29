import { createHmac, timingSafeEqual } from 'crypto';
import { BaseChannel, Message, SendOptions } from '../base.js';
import { getLogger, getAuditLogger } from '../../observability/logger.js';
import { RateLimiter } from '../../security/guardrails/rate-limiter.js';

const logger = getLogger().child({ module: 'SlackChannel' });
const auditLogger = getAuditLogger();

// ============================================================================
// Slack API Types
// ============================================================================

export interface SlackConfig {
  botToken: string;              // xoxb-...
  appToken?: string;             // xapp-... for Socket Mode
  signingSecret: string;         // For request verification

  // Socket Mode configuration
  socketMode?: {
    enabled?: boolean;
  };

  // Rate limiting
  rateLimit?: {
    messagesPerSecond?: number;
    messagesPerMinute?: number;
  };
}

interface SlackUser {
  id: string;
  team_id?: string;
  name?: string;
  real_name?: string;
  profile?: {
    display_name?: string;
    real_name?: string;
    email?: string;
    image_48?: string;
    image_72?: string;
  };
  is_bot?: boolean;
  is_app_user?: boolean;
}

interface SlackChannelInfo {
  id: string;
  name?: string;
  is_channel?: boolean;
  is_group?: boolean;
  is_im?: boolean;
  is_mpim?: boolean;
  is_private?: boolean;
  created?: number;
  creator?: string;
  topic?: { value: string };
  purpose?: { value: string };
}

interface SlackMessage {
  type: 'message';
  subtype?: string;
  channel: string;
  user?: string;
  bot_id?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  parent_user_id?: string;
  team?: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  files?: SlackFile[];
  reactions?: Array<{ name: string; count: number; users: string[] }>;
  edited?: { user: string; ts: string };
  reply_count?: number;
  reply_users_count?: number;
  reply_users?: string[];
}

interface SlackBlock {
  type: string;
  block_id?: string;
  text?: SlackTextObject;
  accessory?: SlackBlockElement;
  elements?: SlackBlockElement[];
  fields?: SlackTextObject[];
  image_url?: string;
  alt_text?: string;
  title?: SlackTextObject;
  element?: SlackBlockElement;
  label?: SlackTextObject;
  hint?: SlackTextObject;
  optional?: boolean;
  dispatch_action?: boolean;
}

interface SlackTextObject {
  type: 'plain_text' | 'mrkdwn';
  text: string;
  emoji?: boolean;
  verbatim?: boolean;
}

interface SlackBlockElement {
  type: string;
  action_id?: string;
  text?: SlackTextObject;
  value?: string;
  url?: string;
  style?: 'primary' | 'danger';
  options?: Array<{
    text: SlackTextObject;
    value: string;
    description?: SlackTextObject;
  }>;
  initial_option?: { text: SlackTextObject; value: string };
  placeholder?: SlackTextObject;
  confirm?: {
    title: SlackTextObject;
    text: SlackTextObject;
    confirm: SlackTextObject;
    deny: SlackTextObject;
  };
}

interface SlackAttachment {
  color?: string;
  fallback?: string;
  author_name?: string;
  author_link?: string;
  author_icon?: string;
  title?: string;
  title_link?: string;
  text?: string;
  fields?: Array<{ title: string; value: string; short?: boolean }>;
  image_url?: string;
  thumb_url?: string;
  footer?: string;
  footer_icon?: string;
  ts?: number;
  mrkdwn_in?: string[];
}

interface SlackFile {
  id: string;
  name: string;
  title?: string;
  mimetype: string;
  filetype: string;
  size: number;
  url_private?: string;
  url_private_download?: string;
  thumb_64?: string;
  thumb_360?: string;
  permalink?: string;
}

interface SlackEvent {
  type: string;
  event_ts?: string;
  user?: string;
  channel?: string;
  team?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  files?: SlackFile[];
  blocks?: SlackBlock[];
  subtype?: string;
  bot_id?: string;
  message?: SlackMessage;
  previous_message?: SlackMessage;
  item?: { type: string; channel: string; ts: string };
  reaction?: string;
  item_user?: string;
  actions?: SlackAction[];
  trigger_id?: string;
  response_url?: string;
  container?: { type: string; message_ts: string; channel_id: string };
}

interface SlackAction {
  action_id: string;
  block_id: string;
  type: string;
  value?: string;
  selected_option?: { text: SlackTextObject; value: string };
  selected_options?: Array<{ text: SlackTextObject; value: string }>;
  selected_user?: string;
  selected_channel?: string;
  selected_date?: string;
  action_ts: string;
}

interface SlackEventPayload {
  token: string;
  team_id: string;
  api_app_id: string;
  event: SlackEvent;
  type: 'event_callback';
  event_id: string;
  event_time: number;
  authorizations?: Array<{
    enterprise_id?: string;
    team_id: string;
    user_id: string;
    is_bot: boolean;
    is_enterprise_install: boolean;
  }>;
}

interface SlackInteractionPayload {
  type: 'block_actions' | 'shortcut' | 'message_action' | 'view_submission' | 'view_closed';
  token: string;
  trigger_id: string;
  response_url?: string;
  user: { id: string; username: string; team_id: string };
  team: { id: string; domain: string };
  channel?: { id: string; name: string };
  message?: SlackMessage;
  actions?: SlackAction[];
  view?: SlackView;
  container?: { type: string; message_ts?: string; channel_id?: string; view_id?: string };
}

interface SlackView {
  id: string;
  team_id: string;
  type: 'modal' | 'home';
  title: SlackTextObject;
  submit?: SlackTextObject;
  close?: SlackTextObject;
  blocks: SlackBlock[];
  private_metadata?: string;
  callback_id?: string;
  state?: { values: Record<string, Record<string, SlackActionState>> };
  hash?: string;
  external_id?: string;
}

interface SlackActionState {
  type: string;
  value?: string;
  selected_option?: { value: string };
  selected_options?: Array<{ value: string }>;
  selected_user?: string;
  selected_users?: string[];
  selected_channel?: string;
  selected_channels?: string[];
  selected_date?: string;
}

interface SlackSlashCommand {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
  api_app_id: string;
}

interface SlackApiResponse<T = unknown> {
  ok: boolean;
  error?: string;
  response_metadata?: {
    next_cursor?: string;
    scopes?: string[];
  };
  channel?: string;
  ts?: string;
  message?: SlackMessage;
  user?: SlackUser;
  [key: string]: unknown;
}

// ============================================================================
// Slack Channel Implementation
// ============================================================================

export class SlackChannel extends BaseChannel {
  private readonly config: Required<Pick<SlackConfig, 'botToken' | 'signingSecret'>> & {
    appToken?: string;
    socketMode: Required<NonNullable<SlackConfig['socketMode']>>;
    rateLimit: Required<NonNullable<SlackConfig['rateLimit']>>;
  };
  private messageHandler?: (message: Message) => Promise<void>;
  private actionHandler?: (action: { userId: string; channelId: string; actionId: string; value?: string; triggerId: string; responseUrl?: string }) => Promise<unknown>;
  private commandHandler?: (command: { command: string; text: string; userId: string; channelId: string; triggerId: string; responseUrl: string }) => Promise<unknown>;
  private readonly rateLimiter: RateLimiter;
  private readonly minuteRateLimiter: RateLimiter;
  private ws: WebSocket | null = null;
  private botUserId: string | null = null;
  private teamId: string | null = null;

  private static readonly API_BASE = 'https://slack.com/api';

  constructor(config: SlackConfig) {
    super('slack');

    this.config = {
      botToken: config.botToken,
      signingSecret: config.signingSecret,
      appToken: config.appToken,
      socketMode: {
        enabled: config.socketMode?.enabled ?? false,
      },
      rateLimit: {
        messagesPerSecond: config.rateLimit?.messagesPerSecond ?? 1,
        messagesPerMinute: config.rateLimit?.messagesPerMinute ?? 50,
      },
    };

    // Per-second rate limiter (Slack's Tier 3 limit)
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
      // Test authentication
      const authResult = await this.apiRequest<{ user_id: string; team_id: string; user: string; team: string }>(
        'auth.test'
      );

      this.botUserId = authResult.user_id;
      this.teamId = authResult.team_id;

      logger.info(
        { botUserId: this.botUserId, teamId: this.teamId, botName: authResult.user },
        'Slack bot authenticated'
      );

      // Connect to Socket Mode if enabled
      if (this.config.socketMode.enabled && this.config.appToken) {
        await this.connectSocketMode();
      }

      this.setConnected(true);
    } catch (error) {
      logger.error({ error }, 'Failed to connect Slack channel');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }

    this.setConnected(false);
    logger.info('Slack channel disconnected');
  }

  // ============================================================================
  // Socket Mode
  // ============================================================================

  private async connectSocketMode(): Promise<void> {
    if (!this.config.appToken) {
      throw new Error('App token required for Socket Mode');
    }

    // Get WebSocket URL
    const response = await fetch(`${SlackChannel.API_BASE}/apps.connections.open`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.appToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const data = await response.json() as SlackApiResponse & { url?: string };
    if (!data.ok || !data.url) {
      throw new Error(`Failed to get Socket Mode URL: ${data.error}`);
    }

    const wsUrl = data.url;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        logger.info('Slack Socket Mode connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleSocketMessage(event.data as string);
      };

      this.ws.onerror = (error) => {
        logger.error({ error }, 'Slack Socket Mode error');
        reject(error);
      };

      this.ws.onclose = (event) => {
        logger.warn({ code: event.code, reason: event.reason }, 'Slack Socket Mode closed');
        // Attempt reconnection
        if (this.connected) {
          setTimeout(() => this.connectSocketMode(), 5000);
        }
      };
    });
  }

  private handleSocketMessage(data: string): void {
    try {
      const payload = JSON.parse(data);

      // Acknowledge the message
      if (payload.envelope_id) {
        this.ws?.send(JSON.stringify({ envelope_id: payload.envelope_id }));
      }

      switch (payload.type) {
        case 'hello':
          logger.debug('Slack Socket Mode handshake complete');
          break;

        case 'events_api':
          this.handleEventPayload(payload.payload);
          break;

        case 'interactive':
          this.handleInteractionPayload(payload.payload);
          break;

        case 'slash_commands':
          this.handleSlashCommand(payload.payload);
          break;

        case 'disconnect':
          logger.warn({ reason: payload.reason }, 'Slack requested disconnect');
          break;
      }
    } catch (error) {
      logger.error({ error, data }, 'Failed to parse Socket Mode message');
    }
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private async handleEventPayload(payload: SlackEventPayload): Promise<void> {
    const event = payload.event;

    switch (event.type) {
      case 'message':
        await this.handleMessageEvent(event);
        break;

      case 'app_mention':
        await this.handleMessageEvent(event);
        break;

      case 'reaction_added':
      case 'reaction_removed':
        logger.debug({ type: event.type, reaction: event.reaction }, 'Reaction event');
        break;

      default:
        logger.trace({ type: event.type }, 'Unhandled Slack event');
    }
  }

  private async handleMessageEvent(event: SlackEvent): Promise<void> {
    // Ignore bot messages and message_changed events from bots
    if (event.bot_id || event.subtype === 'bot_message') return;
    if (event.subtype === 'message_changed' && event.message?.bot_id) return;

    if (this.messageHandler) {
      const message = this.slackToMessage(event);
      try {
        await this.messageHandler(message);
      } catch (error) {
        logger.error({ error, ts: event.ts }, 'Error handling Slack message');
      }
    }
  }

  private async handleInteractionPayload(payload: SlackInteractionPayload): Promise<void> {
    if (payload.type === 'block_actions' && payload.actions && this.actionHandler) {
      for (const action of payload.actions) {
        try {
          await this.actionHandler({
            userId: payload.user.id,
            channelId: payload.channel?.id ?? '',
            actionId: action.action_id,
            value: action.value ?? action.selected_option?.value,
            triggerId: payload.trigger_id,
            responseUrl: payload.response_url,
          });
        } catch (error) {
          logger.error({ error, actionId: action.action_id }, 'Error handling Slack action');
        }
      }
    }

    if (payload.type === 'view_submission' && payload.view) {
      logger.debug({ viewId: payload.view.id, callbackId: payload.view.callback_id }, 'View submission');
      // View submissions can be handled via the action handler or a dedicated handler
    }
  }

  private async handleSlashCommand(command: SlackSlashCommand): Promise<void> {
    if (this.commandHandler) {
      try {
        await this.commandHandler({
          command: command.command,
          text: command.text,
          userId: command.user_id,
          channelId: command.channel_id,
          triggerId: command.trigger_id,
          responseUrl: command.response_url,
        });
      } catch (error) {
        logger.error({ error, command: command.command }, 'Error handling Slack command');
      }
    }
  }

  private slackToMessage(event: SlackEvent): Message {
    const content = event.text ?? event.message?.text ?? '';
    const metadata: Record<string, unknown> = {
      teamId: event.team ?? this.teamId,
      threadTs: event.thread_ts,
      isThreadReply: !!event.thread_ts,
      subtype: event.subtype,
    };

    // Add file info
    if (event.files && event.files.length > 0) {
      metadata.files = event.files.map(f => ({
        id: f.id,
        name: f.name,
        mimetype: f.mimetype,
        size: f.size,
        url: f.url_private,
        permalink: f.permalink,
      }));
    }

    // Add blocks info
    if (event.blocks && event.blocks.length > 0) {
      metadata.hasBlocks = true;
      metadata.blockCount = event.blocks.length;
    }

    // Handle edited messages
    if (event.subtype === 'message_changed' && event.message) {
      metadata.edited = true;
      metadata.previousText = event.previous_message?.text;
      return {
        id: event.message.ts,
        channelId: event.channel ?? '',
        senderId: event.message.user ?? '',
        content: event.message.text,
        timestamp: parseFloat(event.message.ts) * 1000,
        metadata,
      };
    }

    return {
      id: event.ts ?? '',
      channelId: event.channel ?? '',
      senderId: event.user ?? '',
      content,
      timestamp: event.ts ? parseFloat(event.ts) * 1000 : Date.now(),
      metadata,
    };
  }

  // ============================================================================
  // Messaging
  // ============================================================================

  async send(
    channelId: string,
    content: string,
    options?: SendOptions & {
      blocks?: SlackBlock[];
      attachments?: SlackAttachment[];
      threadTs?: string;
      unfurlLinks?: boolean;
      unfurlMedia?: boolean;
      mrkdwn?: boolean;
    }
  ): Promise<void> {
    // Check rate limits
    const perSecondResult = this.rateLimiter.consume('slack:send');
    if (!perSecondResult.allowed) {
      throw new Error(`Rate limited: retry in ${perSecondResult.retryAfterMs}ms`);
    }

    const minuteResult = this.minuteRateLimiter.consume('slack:minute');
    if (!minuteResult.allowed) {
      throw new Error(`Minute rate limit reached: retry in ${minuteResult.retryAfterMs}ms`);
    }

    const sanitized = this.sanitizeOutgoing(content);

    const params: Record<string, unknown> = {
      channel: channelId,
      text: sanitized,
    };

    if (options?.blocks) {
      params.blocks = options.blocks;
    }
    if (options?.attachments) {
      params.attachments = options.attachments;
    }
    if (options?.replyTo || options?.threadTs) {
      params.thread_ts = options.replyTo ?? options.threadTs;
    }
    if (options?.unfurlLinks !== undefined) {
      params.unfurl_links = options.unfurlLinks;
    }
    if (options?.unfurlMedia !== undefined) {
      params.unfurl_media = options.unfurlMedia;
    }
    if (options?.mrkdwn !== undefined) {
      params.mrkdwn = options.mrkdwn;
    }

    const result = await this.apiRequest<{ channel: string; ts: string; message: SlackMessage }>(
      'chat.postMessage',
      params
    );

    logger.debug(
      { channelId, ts: result.ts },
      'Slack message sent'
    );

    auditLogger.log({
      eventId: result.ts ?? '',
      timestamp: Date.now(),
      eventType: 'channel',
      severity: 'info',
      actor: { userId: 'system' },
      resource: { type: 'slack_message', id: result.ts ?? '' },
      action: 'send',
      outcome: 'success',
      details: { channelId, contentLength: sanitized.length },
    });
  }

  async sendEphemeral(
    channelId: string,
    userId: string,
    content: string,
    options?: { blocks?: SlackBlock[]; threadTs?: string }
  ): Promise<void> {
    const sanitized = this.sanitizeOutgoing(content);

    await this.apiRequest('chat.postEphemeral', {
      channel: channelId,
      user: userId,
      text: sanitized,
      blocks: options?.blocks,
      thread_ts: options?.threadTs,
    });
  }

  async updateMessage(
    channelId: string,
    ts: string,
    content: string,
    options?: { blocks?: SlackBlock[]; attachments?: SlackAttachment[] }
  ): Promise<void> {
    const sanitized = this.sanitizeOutgoing(content);

    await this.apiRequest('chat.update', {
      channel: channelId,
      ts,
      text: sanitized,
      blocks: options?.blocks,
      attachments: options?.attachments,
    });
  }

  async deleteMessage(channelId: string, ts: string): Promise<void> {
    await this.apiRequest('chat.delete', {
      channel: channelId,
      ts,
    });
  }

  async addReaction(channelId: string, ts: string, emoji: string): Promise<void> {
    await this.apiRequest('reactions.add', {
      channel: channelId,
      timestamp: ts,
      name: emoji.replace(/:/g, ''),
    });
  }

  async removeReaction(channelId: string, ts: string, emoji: string): Promise<void> {
    await this.apiRequest('reactions.remove', {
      channel: channelId,
      timestamp: ts,
      name: emoji.replace(/:/g, ''),
    });
  }

  async uploadFile(
    channelIds: string | string[],
    content: Buffer | string,
    options: { filename: string; title?: string; initialComment?: string; threadTs?: string }
  ): Promise<void> {
    const channels = Array.isArray(channelIds) ? channelIds.join(',') : channelIds;

    await this.apiRequest('files.upload', {
      channels,
      content: typeof content === 'string' ? content : content.toString('base64'),
      filename: options.filename,
      title: options.title,
      initial_comment: options.initialComment,
      thread_ts: options.threadTs,
    });
  }

  // ============================================================================
  // Interactive Components
  // ============================================================================

  async openModal(triggerId: string, view: SlackView): Promise<void> {
    await this.apiRequest('views.open', {
      trigger_id: triggerId,
      view,
    });
  }

  async updateModal(viewId: string, view: Partial<SlackView>): Promise<void> {
    await this.apiRequest('views.update', {
      view_id: viewId,
      view,
    });
  }

  async pushModal(triggerId: string, view: SlackView): Promise<void> {
    await this.apiRequest('views.push', {
      trigger_id: triggerId,
      view,
    });
  }

  async respondToUrl(responseUrl: string, message: {
    text?: string;
    blocks?: SlackBlock[];
    attachments?: SlackAttachment[];
    response_type?: 'in_channel' | 'ephemeral';
    replace_original?: boolean;
    delete_original?: boolean;
  }): Promise<void> {
    const response = await fetch(responseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Failed to respond to URL: ${response.status}`);
    }
  }

  // ============================================================================
  // Block Builders
  // ============================================================================

  createSection(options: {
    text?: string | SlackTextObject;
    blockId?: string;
    fields?: Array<string | SlackTextObject>;
    accessory?: SlackBlockElement;
  }): SlackBlock {
    return {
      type: 'section',
      block_id: options.blockId,
      text: typeof options.text === 'string'
        ? { type: 'mrkdwn', text: options.text }
        : options.text,
      fields: options.fields?.map(f =>
        typeof f === 'string' ? { type: 'mrkdwn' as const, text: f } : f
      ),
      accessory: options.accessory,
    };
  }

  createActions(options: {
    blockId?: string;
    elements: SlackBlockElement[];
  }): SlackBlock {
    return {
      type: 'actions',
      block_id: options.blockId,
      elements: options.elements,
    };
  }

  createDivider(): SlackBlock {
    return { type: 'divider' };
  }

  createHeader(text: string): SlackBlock {
    return {
      type: 'header',
      text: { type: 'plain_text', text },
    };
  }

  createContext(elements: Array<string | SlackTextObject | { type: 'image'; image_url: string; alt_text: string }>): SlackBlock {
    return {
      type: 'context',
      elements: elements.map(e =>
        typeof e === 'string' ? { type: 'mrkdwn' as const, text: e } : e
      ) as SlackBlockElement[],
    };
  }

  createImage(options: { imageUrl: string; altText: string; title?: string; blockId?: string }): SlackBlock {
    return {
      type: 'image',
      block_id: options.blockId,
      image_url: options.imageUrl,
      alt_text: options.altText,
      title: options.title ? { type: 'plain_text', text: options.title } : undefined,
    };
  }

  createInput(options: {
    blockId: string;
    label: string;
    element: SlackBlockElement;
    hint?: string;
    optional?: boolean;
    dispatchAction?: boolean;
  }): SlackBlock {
    return {
      type: 'input',
      block_id: options.blockId,
      element: options.element,
      label: { type: 'plain_text', text: options.label },
      hint: options.hint ? { type: 'plain_text', text: options.hint } : undefined,
      optional: options.optional,
      dispatch_action: options.dispatchAction,
    };
  }

  // ============================================================================
  // Element Builders
  // ============================================================================

  createButton(options: {
    actionId: string;
    text: string;
    value?: string;
    url?: string;
    style?: 'primary' | 'danger';
  }): SlackBlockElement {
    return {
      type: 'button',
      action_id: options.actionId,
      text: { type: 'plain_text', text: options.text },
      value: options.value,
      url: options.url,
      style: options.style,
    };
  }

  createStaticSelect(options: {
    actionId: string;
    placeholder?: string;
    options: Array<{ text: string; value: string; description?: string }>;
    initialOption?: { text: string; value: string };
  }): SlackBlockElement {
    return {
      type: 'static_select',
      action_id: options.actionId,
      placeholder: options.placeholder ? { type: 'plain_text', text: options.placeholder } : undefined,
      options: options.options.map(o => ({
        text: { type: 'plain_text' as const, text: o.text },
        value: o.value,
        description: o.description ? { type: 'plain_text' as const, text: o.description } : undefined,
      })),
      initial_option: options.initialOption ? {
        text: { type: 'plain_text', text: options.initialOption.text },
        value: options.initialOption.value,
      } : undefined,
    };
  }

  createMultiStaticSelect(options: {
    actionId: string;
    placeholder?: string;
    options: Array<{ text: string; value: string }>;
    maxSelectedItems?: number;
  }): SlackBlockElement {
    return {
      type: 'multi_static_select',
      action_id: options.actionId,
      placeholder: options.placeholder ? { type: 'plain_text', text: options.placeholder } : undefined,
      options: options.options.map(o => ({
        text: { type: 'plain_text' as const, text: o.text },
        value: o.value,
      })),
    };
  }

  createDatePicker(options: {
    actionId: string;
    placeholder?: string;
    initialDate?: string;
  }): SlackBlockElement {
    return {
      type: 'datepicker',
      action_id: options.actionId,
      placeholder: options.placeholder ? { type: 'plain_text', text: options.placeholder } : undefined,
    };
  }

  createTextInput(options: {
    actionId: string;
    placeholder?: string;
    initialValue?: string;
    multiline?: boolean;
    minLength?: number;
    maxLength?: number;
  }): SlackBlockElement {
    return {
      type: 'plain_text_input',
      action_id: options.actionId,
      placeholder: options.placeholder ? { type: 'plain_text', text: options.placeholder } : undefined,
    };
  }

  // ============================================================================
  // Webhook Verification
  // ============================================================================

  verifySignature(
    timestamp: string,
    signature: string,
    body: string
  ): boolean {
    // Check timestamp is recent (within 5 minutes)
    const requestTimestamp = parseInt(timestamp, 10);
    const currentTimestamp = Math.floor(Date.now() / 1000);

    if (Math.abs(currentTimestamp - requestTimestamp) > 300) {
      logger.warn({ age: currentTimestamp - requestTimestamp }, 'Slack request timestamp too old');
      return false;
    }

    // Compute expected signature
    const sigBasestring = `v0:${timestamp}:${body}`;
    const expectedSignature = 'v0=' + createHmac('sha256', this.config.signingSecret)
      .update(sigBasestring)
      .digest('hex');

    // Compare signatures (timing-safe)
    try {
      return timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Webhook Handlers
  // ============================================================================

  async handleEventWebhook(
    payload: unknown,
    headers?: { 'x-slack-request-timestamp'?: string; 'x-slack-signature'?: string },
    rawBody?: string
  ): Promise<{ challenge?: string } | void> {
    // Verify signature if provided
    if (headers?.['x-slack-request-timestamp'] && headers?.['x-slack-signature'] && rawBody) {
      if (!this.verifySignature(
        headers['x-slack-request-timestamp'],
        headers['x-slack-signature'],
        rawBody
      )) {
        throw new Error('Invalid Slack signature');
      }
    }

    const data = payload as { type: string; challenge?: string; event?: SlackEvent };

    // Handle URL verification challenge
    if (data.type === 'url_verification') {
      return { challenge: data.challenge };
    }

    // Handle event callback
    if (data.type === 'event_callback') {
      await this.handleEventPayload(payload as SlackEventPayload);
    }
  }

  async handleInteractionWebhook(
    payload: string | SlackInteractionPayload,
    headers?: { 'x-slack-request-timestamp'?: string; 'x-slack-signature'?: string },
    rawBody?: string
  ): Promise<void> {
    // Verify signature
    if (headers?.['x-slack-request-timestamp'] && headers?.['x-slack-signature'] && rawBody) {
      if (!this.verifySignature(
        headers['x-slack-request-timestamp'],
        headers['x-slack-signature'],
        rawBody
      )) {
        throw new Error('Invalid Slack signature');
      }
    }

    const data = typeof payload === 'string' ? JSON.parse(payload) as SlackInteractionPayload : payload;

    await this.handleInteractionPayload(data);
  }

  async handleSlashCommandWebhook(
    payload: SlackSlashCommand,
    headers?: { 'x-slack-request-timestamp'?: string; 'x-slack-signature'?: string },
    rawBody?: string
  ): Promise<void> {
    // Verify signature
    if (headers?.['x-slack-request-timestamp'] && headers?.['x-slack-signature'] && rawBody) {
      if (!this.verifySignature(
        headers['x-slack-request-timestamp'],
        headers['x-slack-signature'],
        rawBody
      )) {
        throw new Error('Invalid Slack signature');
      }
    }

    await this.handleSlashCommand(payload);
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

  onAction(handler: (action: {
    userId: string;
    channelId: string;
    actionId: string;
    value?: string;
    triggerId: string;
    responseUrl?: string;
  }) => Promise<unknown>): void {
    this.actionHandler = handler;
  }

  onCommand(handler: (command: {
    command: string;
    text: string;
    userId: string;
    channelId: string;
    triggerId: string;
    responseUrl: string;
  }) => Promise<unknown>): void {
    this.commandHandler = handler;
  }

  // ============================================================================
  // User & Channel Info
  // ============================================================================

  async getUserInfo(userId: string): Promise<SlackUser> {
    const result = await this.apiRequest<{ user: SlackUser }>('users.info', { user: userId });
    return result.user!;
  }

  async getChannelInfo(channelId: string): Promise<SlackChannelInfo> {
    const result = await this.apiRequest<{ channel: SlackChannelInfo }>('conversations.info', { channel: channelId });
    return result.channel!;
  }

  async listChannels(options?: { types?: string; limit?: number; cursor?: string }): Promise<{ channels: SlackChannelInfo[]; nextCursor?: string }> {
    const result = await this.apiRequest<{ channels: SlackChannelInfo[]; response_metadata?: { next_cursor?: string } }>(
      'conversations.list',
      {
        types: options?.types ?? 'public_channel,private_channel',
        limit: options?.limit ?? 100,
        cursor: options?.cursor,
      }
    );

    return {
      channels: (result.channels ?? []) as SlackChannelInfo[],
      nextCursor: result.response_metadata?.next_cursor,
    };
  }

  // ============================================================================
  // API Helpers
  // ============================================================================

  private async apiRequest<T extends Record<string, unknown>>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const url = `${SlackChannel.API_BASE}/${method}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: params ? JSON.stringify(params) : undefined,
    });

    const data = await response.json() as SlackApiResponse<T>;

    if (!data.ok) {
      logger.error({ method, error: data.error }, 'Slack API error');
      throw new Error(`Slack API error: ${data.error}`);
    }

    return data as unknown as T;
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getBotUserId(): string | null {
    return this.botUserId;
  }

  getTeamId(): string | null {
    return this.teamId;
  }
}

// Export types
export type {
  SlackUser,
  SlackChannelInfo,
  SlackMessage,
  SlackBlock,
  SlackBlockElement,
  SlackTextObject,
  SlackAttachment,
  SlackFile,
  SlackView,
  SlackAction,
  SlackEvent,
  SlackEventPayload,
  SlackInteractionPayload,
  SlackSlashCommand,
};
