import { createHmac, timingSafeEqual } from 'crypto';
import { BaseChannel, Message, SendOptions } from '../base.js';
import { getLogger, getAuditLogger } from '../../observability/logger.js';
import { RateLimiter } from '../../security/guardrails/rate-limiter.js';

const logger = getLogger().child({ module: 'DiscordChannel' });
const auditLogger = getAuditLogger();

// ============================================================================
// Discord API Types
// ============================================================================

export interface DiscordConfig {
  botToken: string;
  applicationId: string;
  publicKey?: string;           // For interaction signature verification

  // Gateway configuration
  gateway?: {
    intents?: number;           // Gateway intents bitmask
    shardId?: number;
    shardCount?: number;
  };

  // Rate limiting
  rateLimit?: {
    messagesPerSecond?: number;
    messagesPerChannel?: number;
  };
}

// Discord Gateway Intents
export const GatewayIntents = {
  GUILDS: 1 << 0,
  GUILD_MEMBERS: 1 << 1,
  GUILD_MODERATION: 1 << 2,
  GUILD_EMOJIS_AND_STICKERS: 1 << 3,
  GUILD_INTEGRATIONS: 1 << 4,
  GUILD_WEBHOOKS: 1 << 5,
  GUILD_INVITES: 1 << 6,
  GUILD_VOICE_STATES: 1 << 7,
  GUILD_PRESENCES: 1 << 8,
  GUILD_MESSAGES: 1 << 9,
  GUILD_MESSAGE_REACTIONS: 1 << 10,
  GUILD_MESSAGE_TYPING: 1 << 11,
  DIRECT_MESSAGES: 1 << 12,
  DIRECT_MESSAGE_REACTIONS: 1 << 13,
  DIRECT_MESSAGE_TYPING: 1 << 14,
  MESSAGE_CONTENT: 1 << 15,
  GUILD_SCHEDULED_EVENTS: 1 << 16,
  // Convenience combinations
  ALL_MESSAGES: (1 << 9) | (1 << 12) | (1 << 15),
  ALL_GUILDS: (1 << 0) | (1 << 9) | (1 << 15),
} as const;

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string;
  avatar?: string;
  bot?: boolean;
  system?: boolean;
}

interface DiscordGuildMember {
  user?: DiscordUser;
  nick?: string;
  avatar?: string;
  roles: string[];
  joined_at: string;
  deaf: boolean;
  mute: boolean;
}

interface DiscordChannelInfo {
  id: string;
  type: number;
  guild_id?: string;
  name?: string;
  topic?: string;
  nsfw?: boolean;
  last_message_id?: string;
  parent_id?: string;
}

interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: DiscordUser;
  member?: DiscordGuildMember;
  content: string;
  timestamp: string;
  edited_timestamp?: string;
  tts: boolean;
  mention_everyone: boolean;
  mentions: DiscordUser[];
  mention_roles: string[];
  attachments: Array<{
    id: string;
    filename: string;
    content_type?: string;
    size: number;
    url: string;
    proxy_url: string;
    height?: number;
    width?: number;
  }>;
  embeds: DiscordEmbed[];
  reactions?: Array<{
    count: number;
    me: boolean;
    emoji: { id?: string; name: string };
  }>;
  pinned: boolean;
  type: number;
  message_reference?: {
    message_id?: string;
    channel_id?: string;
    guild_id?: string;
  };
  referenced_message?: DiscordMessage;
  interaction?: {
    id: string;
    type: number;
    name: string;
    user: DiscordUser;
  };
  components?: DiscordComponent[];
}

interface DiscordEmbed {
  title?: string;
  type?: 'rich' | 'image' | 'video' | 'gifv' | 'article' | 'link';
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: { text: string; icon_url?: string };
  image?: { url: string; height?: number; width?: number };
  thumbnail?: { url: string; height?: number; width?: number };
  video?: { url: string; height?: number; width?: number };
  provider?: { name?: string; url?: string };
  author?: { name: string; url?: string; icon_url?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

interface DiscordComponent {
  type: number;
  components?: DiscordComponent[];
  style?: number;
  label?: string;
  emoji?: { id?: string; name: string };
  custom_id?: string;
  url?: string;
  disabled?: boolean;
  options?: Array<{
    label: string;
    value: string;
    description?: string;
    emoji?: { id?: string; name: string };
    default?: boolean;
  }>;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
}

interface DiscordInteraction {
  id: string;
  application_id: string;
  type: number;
  data?: {
    id: string;
    name: string;
    type: number;
    resolved?: Record<string, unknown>;
    options?: Array<{
      name: string;
      type: number;
      value?: unknown;
      options?: unknown[];
      focused?: boolean;
    }>;
    custom_id?: string;
    component_type?: number;
    values?: string[];
  };
  guild_id?: string;
  channel_id?: string;
  member?: DiscordGuildMember;
  user?: DiscordUser;
  token: string;
  version: number;
  message?: DiscordMessage;
}

// Interaction Types
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

// Interaction Response Types
const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
  MODAL: 9,
} as const;

// Component Types
const ComponentType = {
  ACTION_ROW: 1,
  BUTTON: 2,
  STRING_SELECT: 3,
  TEXT_INPUT: 4,
  USER_SELECT: 5,
  ROLE_SELECT: 6,
  MENTIONABLE_SELECT: 7,
  CHANNEL_SELECT: 8,
} as const;

// Button Styles
const ButtonStyle = {
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DANGER: 4,
  LINK: 5,
} as const;

// Gateway Opcodes
const GatewayOpcode = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  PRESENCE_UPDATE: 3,
  VOICE_STATE_UPDATE: 4,
  RESUME: 6,
  RECONNECT: 7,
  REQUEST_GUILD_MEMBERS: 8,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

// ============================================================================
// Discord Channel Implementation
// ============================================================================

export class DiscordChannel extends BaseChannel {
  private readonly config: Required<Pick<DiscordConfig, 'botToken' | 'applicationId'>> & {
    publicKey?: string;
    gateway: Required<NonNullable<DiscordConfig['gateway']>>;
    rateLimit: Required<NonNullable<DiscordConfig['rateLimit']>>;
  };
  private messageHandler?: (message: Message) => Promise<void>;
  private interactionHandler?: (interaction: DiscordInteraction) => Promise<unknown>;
  private readonly rateLimiter: RateLimiter;
  private readonly channelRateLimiters = new Map<string, RateLimiter>();
  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionId: string | null = null;
  private sequence: number | null = null;
  private resumeGatewayUrl: string | null = null;
  private botUser: DiscordUser | null = null;

  private static readonly API_BASE = 'https://discord.com/api/v10';
  private static readonly GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

  constructor(config: DiscordConfig) {
    super('discord');

    this.config = {
      botToken: config.botToken,
      applicationId: config.applicationId,
      publicKey: config.publicKey,
      gateway: {
        intents: config.gateway?.intents ?? (GatewayIntents.GUILDS | GatewayIntents.GUILD_MESSAGES | GatewayIntents.DIRECT_MESSAGES | GatewayIntents.MESSAGE_CONTENT),
        shardId: config.gateway?.shardId ?? 0,
        shardCount: config.gateway?.shardCount ?? 1,
      },
      rateLimit: {
        messagesPerSecond: config.rateLimit?.messagesPerSecond ?? 5,
        messagesPerChannel: config.rateLimit?.messagesPerChannel ?? 5,
      },
    };

    // Global rate limiter
    this.rateLimiter = new RateLimiter({
      maxTokens: 50,
      refillRate: 50,
      refillIntervalMs: 1000,
    });
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async connect(): Promise<void> {
    try {
      // Verify bot token by fetching current user
      this.botUser = await this.apiRequest<DiscordUser>('GET', '/users/@me');
      logger.info(
        { botId: this.botUser.id, username: this.botUser.username },
        'Discord bot authenticated'
      );

      // Connect to gateway
      await this.connectGateway();

      this.setConnected(true);
    } catch (error) {
      logger.error({ error }, 'Failed to connect Discord channel');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.disconnectGateway();
    this.setConnected(false);
    logger.info('Discord channel disconnected');
  }

  // ============================================================================
  // Gateway Connection
  // ============================================================================

  private async connectGateway(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this.resumeGatewayUrl ?? DiscordChannel.GATEWAY_URL;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        logger.debug('Discord gateway connection opened');
      };

      this.ws.onmessage = (event) => {
        this.handleGatewayMessage(event.data as string, resolve);
      };

      this.ws.onerror = (error) => {
        logger.error({ error }, 'Discord gateway error');
        reject(error);
      };

      this.ws.onclose = (event) => {
        logger.warn({ code: event.code, reason: event.reason }, 'Discord gateway closed');
        this.handleGatewayClose(event.code);
      };
    });
  }

  private disconnectGateway(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }
  }

  private handleGatewayMessage(data: string, onReady?: () => void): void {
    try {
      const payload = JSON.parse(data);
      const { op, d, s, t } = payload;

      // Update sequence number
      if (s !== null) {
        this.sequence = s;
      }

      switch (op) {
        case GatewayOpcode.HELLO:
          // Start heartbeating
          this.startHeartbeat(d.heartbeat_interval);
          // Identify or resume
          if (this.sessionId && this.sequence !== null) {
            this.sendResume();
          } else {
            this.sendIdentify();
          }
          break;

        case GatewayOpcode.HEARTBEAT:
          this.sendHeartbeat();
          break;

        case GatewayOpcode.HEARTBEAT_ACK:
          // Heartbeat acknowledged
          break;

        case GatewayOpcode.INVALID_SESSION:
          // Session invalidated, need to re-identify
          this.sessionId = null;
          this.sequence = null;
          if (d) {
            // Resumable, wait and resume
            setTimeout(() => this.sendIdentify(), 1000 + Math.random() * 5000);
          } else {
            // Not resumable, identify fresh
            this.sendIdentify();
          }
          break;

        case GatewayOpcode.RECONNECT:
          // Discord wants us to reconnect
          this.reconnectGateway();
          break;

        case GatewayOpcode.DISPATCH:
          this.handleDispatch(t, d, onReady);
          break;
      }
    } catch (error) {
      logger.error({ error, data }, 'Failed to parse gateway message');
    }
  }

  private handleDispatch(eventName: string, data: unknown, onReady?: () => void): void {
    switch (eventName) {
      case 'READY':
        const ready = data as { session_id: string; resume_gateway_url: string; user: DiscordUser };
        this.sessionId = ready.session_id;
        this.resumeGatewayUrl = ready.resume_gateway_url;
        this.botUser = ready.user;
        logger.info({ sessionId: this.sessionId }, 'Discord gateway ready');
        if (onReady) onReady();
        break;

      case 'RESUMED':
        logger.info('Discord gateway session resumed');
        if (onReady) onReady();
        break;

      case 'MESSAGE_CREATE':
        this.handleMessageCreate(data as DiscordMessage);
        break;

      case 'MESSAGE_UPDATE':
        this.handleMessageUpdate(data as DiscordMessage);
        break;

      case 'INTERACTION_CREATE':
        this.handleInteractionCreate(data as DiscordInteraction);
        break;

      case 'GUILD_CREATE':
        const guild = data as { id: string; name: string };
        logger.debug({ guildId: guild.id, name: guild.name }, 'Joined guild');
        break;

      default:
        // Log unknown events at trace level
        logger.trace({ event: eventName }, 'Unhandled gateway event');
    }
  }

  private handleGatewayClose(code: number): void {
    // Clear heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Determine if we should reconnect
    const reconnectableCodes = [4000, 4001, 4002, 4003, 4005, 4007, 4008, 4009];
    const nonReconnectableCodes = [4004, 4010, 4011, 4012, 4013, 4014];

    if (nonReconnectableCodes.includes(code)) {
      logger.error({ code }, 'Discord gateway closed with non-reconnectable code');
      this.setConnected(false);
      return;
    }

    if (this.connected || reconnectableCodes.includes(code)) {
      logger.info({ code }, 'Attempting gateway reconnection');
      setTimeout(() => this.reconnectGateway(), 1000 + Math.random() * 5000);
    }
  }

  private async reconnectGateway(): Promise<void> {
    this.disconnectGateway();
    try {
      await this.connectGateway();
    } catch (error) {
      logger.error({ error }, 'Failed to reconnect gateway');
      // Retry after delay
      setTimeout(() => this.reconnectGateway(), 5000);
    }
  }

  private startHeartbeat(intervalMs: number): void {
    // Add jitter
    const jitter = Math.random() * intervalMs;
    setTimeout(() => {
      this.sendHeartbeat();
      this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), intervalMs);
    }, jitter);
  }

  private sendHeartbeat(): void {
    this.sendGateway({ op: GatewayOpcode.HEARTBEAT, d: this.sequence });
  }

  private sendIdentify(): void {
    this.sendGateway({
      op: GatewayOpcode.IDENTIFY,
      d: {
        token: this.config.botToken,
        intents: this.config.gateway.intents,
        properties: {
          os: process.platform,
          browser: 'secureagent',
          device: 'secureagent',
        },
        shard: [this.config.gateway.shardId, this.config.gateway.shardCount],
      },
    });
  }

  private sendResume(): void {
    this.sendGateway({
      op: GatewayOpcode.RESUME,
      d: {
        token: this.config.botToken,
        session_id: this.sessionId,
        seq: this.sequence,
      },
    });
  }

  private sendGateway(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  private async handleMessageCreate(msg: DiscordMessage): Promise<void> {
    // Ignore messages from bots (including ourselves)
    if (msg.author.bot) return;

    if (this.messageHandler) {
      const message = this.discordToMessage(msg);
      try {
        await this.messageHandler(message);
      } catch (error) {
        logger.error({ error, messageId: msg.id }, 'Error handling Discord message');
      }
    }
  }

  private async handleMessageUpdate(msg: DiscordMessage): Promise<void> {
    // Ignore bot messages and messages without content
    if (msg.author?.bot || !msg.content) return;

    if (this.messageHandler) {
      const message = this.discordToMessage(msg, true);
      try {
        await this.messageHandler(message);
      } catch (error) {
        logger.error({ error, messageId: msg.id }, 'Error handling Discord message update');
      }
    }
  }

  private async handleInteractionCreate(interaction: DiscordInteraction): Promise<void> {
    // Handle ping
    if (interaction.type === InteractionType.PING) {
      await this.respondToInteraction(interaction.id, interaction.token, {
        type: InteractionResponseType.PONG,
      });
      return;
    }

    if (this.interactionHandler) {
      try {
        const response = await this.interactionHandler(interaction);
        if (response) {
          await this.respondToInteraction(interaction.id, interaction.token, response);
        }
      } catch (error) {
        logger.error({ error, interactionId: interaction.id }, 'Error handling Discord interaction');
      }
    }
  }

  private discordToMessage(msg: DiscordMessage, edited = false): Message {
    let content = msg.content;
    const metadata: Record<string, unknown> = {
      edited,
      guildId: msg.guild_id,
      authorId: msg.author.id,
      authorUsername: msg.author.username,
      authorGlobalName: msg.author.global_name,
    };

    // Add member info if available
    if (msg.member) {
      metadata.memberNick = msg.member.nick;
      metadata.memberRoles = msg.member.roles;
    }

    // Add attachments
    if (msg.attachments.length > 0) {
      metadata.attachments = msg.attachments.map(a => ({
        id: a.id,
        filename: a.filename,
        contentType: a.content_type,
        size: a.size,
        url: a.url,
      }));
      if (!content) {
        content = `[${msg.attachments.length} attachment(s)]`;
      }
    }

    // Add embeds info
    if (msg.embeds.length > 0) {
      metadata.embedCount = msg.embeds.length;
    }

    // Add reply reference
    if (msg.message_reference) {
      metadata.replyToMessageId = msg.message_reference.message_id;
      if (msg.referenced_message) {
        metadata.replyToContent = msg.referenced_message.content?.slice(0, 100);
        metadata.replyToAuthor = msg.referenced_message.author.username;
      }
    }

    // Add mentions
    if (msg.mentions.length > 0) {
      metadata.mentions = msg.mentions.map(u => ({ id: u.id, username: u.username }));
    }

    // Add components info
    if (msg.components && msg.components.length > 0) {
      metadata.hasComponents = true;
    }

    return {
      id: msg.id,
      channelId: msg.channel_id,
      senderId: msg.author.id,
      content,
      timestamp: new Date(msg.timestamp).getTime(),
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
      embeds?: DiscordEmbed[];
      components?: DiscordComponent[];
      allowedMentions?: {
        parse?: Array<'roles' | 'users' | 'everyone'>;
        roles?: string[];
        users?: string[];
        repliedUser?: boolean;
      };
      tts?: boolean;
    }
  ): Promise<void> {
    // Check global rate limit
    const globalResult = this.rateLimiter.consume('discord:global');
    if (!globalResult.allowed) {
      throw new Error(`Rate limited: retry in ${globalResult.retryAfterMs}ms`);
    }

    // Check per-channel rate limit
    let channelLimiter = this.channelRateLimiters.get(channelId);
    if (!channelLimiter) {
      channelLimiter = new RateLimiter({
        maxTokens: this.config.rateLimit.messagesPerChannel,
        refillRate: this.config.rateLimit.messagesPerChannel,
        refillIntervalMs: 5000,
      });
      this.channelRateLimiters.set(channelId, channelLimiter);
    }

    const channelResult = channelLimiter.consume(channelId);
    if (!channelResult.allowed) {
      throw new Error(`Channel rate limited: retry in ${channelResult.retryAfterMs}ms`);
    }

    const sanitized = this.sanitizeOutgoing(content);

    const payload: Record<string, unknown> = {
      content: sanitized,
    };

    if (options?.replyTo) {
      payload.message_reference = { message_id: options.replyTo };
    }
    if (options?.embeds) {
      payload.embeds = options.embeds;
    }
    if (options?.components) {
      payload.components = options.components;
    }
    if (options?.allowedMentions) {
      payload.allowed_mentions = options.allowedMentions;
    }
    if (options?.tts) {
      payload.tts = options.tts;
    }

    const result = await this.apiRequest<DiscordMessage>(
      'POST',
      `/channels/${channelId}/messages`,
      payload
    );

    logger.debug(
      { channelId, messageId: result.id },
      'Discord message sent'
    );

    auditLogger.log({
      eventId: result.id,
      timestamp: Date.now(),
      eventType: 'channel',
      severity: 'info',
      actor: { userId: 'system' },
      resource: { type: 'discord_message', id: result.id },
      action: 'send',
      outcome: 'success',
      details: { channelId, contentLength: sanitized.length },
    });
  }

  async sendEmbed(
    channelId: string,
    embed: DiscordEmbed,
    options?: SendOptions
  ): Promise<void> {
    await this.send(channelId, '', { ...options, embeds: [embed] });
  }

  async editMessage(
    channelId: string,
    messageId: string,
    content: string,
    options?: { embeds?: DiscordEmbed[]; components?: DiscordComponent[] }
  ): Promise<void> {
    const sanitized = this.sanitizeOutgoing(content);

    await this.apiRequest(
      'PATCH',
      `/channels/${channelId}/messages/${messageId}`,
      {
        content: sanitized,
        embeds: options?.embeds,
        components: options?.components,
      }
    );
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    await this.apiRequest('DELETE', `/channels/${channelId}/messages/${messageId}`);
  }

  async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
    const encodedEmoji = encodeURIComponent(emoji);
    await this.apiRequest(
      'PUT',
      `/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`
    );
  }

  async triggerTyping(channelId: string): Promise<void> {
    await this.apiRequest('POST', `/channels/${channelId}/typing`);
  }

  // ============================================================================
  // Interactions
  // ============================================================================

  async respondToInteraction(
    interactionId: string,
    interactionToken: string,
    response: unknown
  ): Promise<void> {
    await this.apiRequest(
      'POST',
      `/interactions/${interactionId}/${interactionToken}/callback`,
      response
    );
  }

  async editInteractionResponse(
    interactionToken: string,
    content: string,
    options?: { embeds?: DiscordEmbed[]; components?: DiscordComponent[] }
  ): Promise<void> {
    await this.apiRequest(
      'PATCH',
      `/webhooks/${this.config.applicationId}/${interactionToken}/messages/@original`,
      {
        content: this.sanitizeOutgoing(content),
        embeds: options?.embeds,
        components: options?.components,
      }
    );
  }

  async sendFollowup(
    interactionToken: string,
    content: string,
    options?: { embeds?: DiscordEmbed[]; components?: DiscordComponent[]; ephemeral?: boolean }
  ): Promise<void> {
    await this.apiRequest(
      'POST',
      `/webhooks/${this.config.applicationId}/${interactionToken}`,
      {
        content: this.sanitizeOutgoing(content),
        embeds: options?.embeds,
        components: options?.components,
        flags: options?.ephemeral ? 64 : 0,
      }
    );
  }

  // ============================================================================
  // Slash Commands
  // ============================================================================

  async registerGlobalCommands(commands: Array<{
    name: string;
    description: string;
    options?: unknown[];
    default_member_permissions?: string;
    dm_permission?: boolean;
  }>): Promise<void> {
    await this.apiRequest(
      'PUT',
      `/applications/${this.config.applicationId}/commands`,
      commands
    );
    logger.info({ count: commands.length }, 'Registered global slash commands');
  }

  async registerGuildCommands(
    guildId: string,
    commands: Array<{
      name: string;
      description: string;
      options?: unknown[];
    }>
  ): Promise<void> {
    await this.apiRequest(
      'PUT',
      `/applications/${this.config.applicationId}/guilds/${guildId}/commands`,
      commands
    );
    logger.info({ guildId, count: commands.length }, 'Registered guild slash commands');
  }

  // ============================================================================
  // Component Builders
  // ============================================================================

  createButton(options: {
    customId?: string;
    label?: string;
    style?: number;
    emoji?: { name: string; id?: string };
    url?: string;
    disabled?: boolean;
  }): DiscordComponent {
    return {
      type: ComponentType.BUTTON,
      style: options.url ? ButtonStyle.LINK : (options.style ?? ButtonStyle.PRIMARY),
      label: options.label,
      emoji: options.emoji,
      custom_id: options.customId,
      url: options.url,
      disabled: options.disabled,
    };
  }

  createActionRow(components: DiscordComponent[]): DiscordComponent {
    return {
      type: ComponentType.ACTION_ROW,
      components,
    };
  }

  createSelectMenu(options: {
    customId: string;
    placeholder?: string;
    minValues?: number;
    maxValues?: number;
    options: Array<{
      label: string;
      value: string;
      description?: string;
      emoji?: { name: string; id?: string };
      default?: boolean;
    }>;
  }): DiscordComponent {
    return {
      type: ComponentType.STRING_SELECT,
      custom_id: options.customId,
      placeholder: options.placeholder,
      min_values: options.minValues,
      max_values: options.maxValues,
      options: options.options,
    };
  }

  // ============================================================================
  // Embed Builder
  // ============================================================================

  createEmbed(options: {
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    timestamp?: string | Date;
    footer?: { text: string; iconUrl?: string };
    image?: string;
    thumbnail?: string;
    author?: { name: string; url?: string; iconUrl?: string };
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
  }): DiscordEmbed {
    return {
      title: options.title,
      description: options.description,
      url: options.url,
      color: options.color,
      timestamp: options.timestamp instanceof Date ? options.timestamp.toISOString() : options.timestamp,
      footer: options.footer ? { text: options.footer.text, icon_url: options.footer.iconUrl } : undefined,
      image: options.image ? { url: options.image } : undefined,
      thumbnail: options.thumbnail ? { url: options.thumbnail } : undefined,
      author: options.author ? { name: options.author.name, url: options.author.url, icon_url: options.author.iconUrl } : undefined,
      fields: options.fields,
    };
  }

  // ============================================================================
  // Webhook Handling (for Interactions)
  // ============================================================================

  verifyInteraction(
    signature: string,
    timestamp: string,
    body: string
  ): boolean {
    if (!this.config.publicKey) {
      logger.warn('Cannot verify interaction: no public key configured');
      return false;
    }

    try {
      const message = Buffer.from(timestamp + body);
      const signatureBytes = Buffer.from(signature, 'hex');
      const publicKeyBytes = Buffer.from(this.config.publicKey, 'hex');

      // Ed25519 verification would go here
      // In a real implementation, use a proper Ed25519 library
      // For now, this is a placeholder that should be replaced with:
      // return nacl.sign.detached.verify(message, signatureBytes, publicKeyBytes);

      // Simplified check for structure
      return signatureBytes.length === 64 && publicKeyBytes.length === 32;
    } catch {
      return false;
    }
  }

  async handleWebhook(
    body: unknown,
    signature?: string,
    timestamp?: string,
    rawBody?: string
  ): Promise<unknown> {
    // Verify signature if provided
    if (signature && timestamp && rawBody) {
      if (!this.verifyInteraction(signature, timestamp, rawBody)) {
        throw new Error('Invalid interaction signature');
      }
    }

    const interaction = body as DiscordInteraction;

    // Handle ping
    if (interaction.type === InteractionType.PING) {
      return { type: InteractionResponseType.PONG };
    }

    // Handle via interaction handler
    if (this.interactionHandler) {
      return await this.interactionHandler(interaction);
    }

    // Default: acknowledge
    return {
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    };
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

  onInteraction(handler: (interaction: DiscordInteraction) => Promise<unknown>): void {
    this.interactionHandler = handler;
  }

  // ============================================================================
  // API Helpers
  // ============================================================================

  private async apiRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${DiscordChannel.API_BASE}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bot ${this.config.botToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'SecureAgent (https://github.com/secureagent, 1.0.0)',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') ?? '1', 10);
      logger.warn({ retryAfter, path }, 'Discord API rate limited');
      throw new Error(`Rate limited: retry after ${retryAfter}s`);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      logger.error({ status: response.status, error, path }, 'Discord API error');
      throw new Error(`Discord API error: ${response.status} ${JSON.stringify(error)}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getBotUser(): DiscordUser | null {
    return this.botUser;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}

// Export types
export type {
  DiscordUser,
  DiscordMessage,
  DiscordEmbed,
  DiscordComponent,
  DiscordInteraction,
  DiscordChannelInfo,
};

// Export constants
export { InteractionType, InteractionResponseType, ComponentType, ButtonStyle };
