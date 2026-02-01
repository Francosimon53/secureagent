/**
 * Microsoft Teams Channel - Microsoft Graph Integration
 *
 * Uses Microsoft Graph API for Teams messaging.
 * Supports both user-delegated and application permissions.
 */

import { BaseChannel, Message, SendOptions } from '../base.js';

// ============================================================================
// Microsoft Teams Types
// ============================================================================

export interface TeamsConfig {
  // Application credentials
  tenantId: string;
  clientId: string;
  clientSecret?: string;           // For app-only auth

  // User-delegated auth
  accessToken?: string;
  refreshToken?: string;

  // Bot configuration
  botId?: string;
  botName?: string;

  // Webhook for incoming messages
  webhook?: {
    endpoint: string;              // Your server endpoint
    secret?: string;               // HMAC validation secret
  };

  // Rate limiting
  rateLimit?: {
    messagesPerSecond?: number;
  };
}

export interface TeamsTeam {
  id: string;
  displayName: string;
  description?: string;
  webUrl?: string;
  isArchived?: boolean;
  visibility?: 'private' | 'public';
  createdDateTime?: string;
}

export interface TeamsChannel {
  id: string;
  displayName: string;
  description?: string;
  email?: string;
  webUrl?: string;
  membershipType?: 'standard' | 'private' | 'shared';
  createdDateTime?: string;
}

export interface TeamsUser {
  id: string;
  displayName: string;
  userPrincipalName?: string;
  email?: string;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
}

export interface TeamsMessage {
  id: string;
  replyToId?: string;
  etag?: string;
  messageType: 'message' | 'chatMessage' | 'systemEventMessage';
  createdDateTime: string;
  lastModifiedDateTime?: string;
  deletedDateTime?: string;
  subject?: string;
  body: {
    contentType: 'text' | 'html';
    content: string;
  };
  from?: {
    user?: TeamsUser;
    application?: { id: string; displayName: string };
  };
  attachments?: TeamsAttachment[];
  mentions?: TeamsMention[];
  reactions?: TeamsReaction[];
  importance?: 'normal' | 'high' | 'urgent';
  webUrl?: string;
  channelIdentity?: {
    teamId: string;
    channelId: string;
  };
}

export interface TeamsAttachment {
  id: string;
  contentType: string;
  contentUrl?: string;
  content?: string;
  name?: string;
  thumbnailUrl?: string;
}

export interface TeamsMention {
  id: number;
  mentionText: string;
  mentioned: {
    user?: TeamsUser;
    application?: { id: string; displayName: string };
  };
}

export interface TeamsReaction {
  reactionType: 'like' | 'angry' | 'sad' | 'laugh' | 'heart' | 'surprised';
  createdDateTime: string;
  user: { id: string; displayName?: string };
}

export interface TeamsChat {
  id: string;
  topic?: string;
  createdDateTime: string;
  lastUpdatedDateTime?: string;
  chatType: 'oneOnOne' | 'group' | 'meeting';
  webUrl?: string;
  members?: TeamsChatMember[];
}

export interface TeamsChatMember {
  id: string;
  displayName: string;
  userId?: string;
  email?: string;
  roles?: string[];
}

export interface TeamsAdaptiveCard {
  type: 'AdaptiveCard';
  version: string;
  body: TeamsAdaptiveCardElement[];
  actions?: TeamsAdaptiveCardAction[];
  $schema?: string;
}

export interface TeamsAdaptiveCardElement {
  type: 'TextBlock' | 'Image' | 'Container' | 'ColumnSet' | 'Column' | 'FactSet' | 'Input.Text' | 'Input.Choice';
  text?: string;
  size?: 'small' | 'default' | 'medium' | 'large' | 'extraLarge';
  weight?: 'lighter' | 'default' | 'bolder';
  color?: 'default' | 'dark' | 'light' | 'accent' | 'good' | 'warning' | 'attention';
  wrap?: boolean;
  url?: string;
  columns?: TeamsAdaptiveCardElement[];
  items?: TeamsAdaptiveCardElement[];
  facts?: Array<{ title: string; value: string }>;
  id?: string;
  placeholder?: string;
  isMultiline?: boolean;
  choices?: Array<{ title: string; value: string }>;
}

export interface TeamsAdaptiveCardAction {
  type: 'Action.OpenUrl' | 'Action.Submit' | 'Action.ShowCard';
  title: string;
  url?: string;
  data?: unknown;
  card?: TeamsAdaptiveCard;
}

export interface TeamsActivity {
  type: 'message' | 'conversationUpdate' | 'messageReaction' | 'invoke' | 'event';
  id: string;
  timestamp: string;
  serviceUrl: string;
  channelId: string;
  from: { id: string; name?: string; aadObjectId?: string };
  conversation: { id: string; name?: string; isGroup?: boolean; conversationType?: string; tenantId?: string };
  recipient: { id: string; name?: string };
  text?: string;
  attachments?: TeamsAttachment[];
  entities?: Array<{ type: string; mentioned?: { id: string; name: string } }>;
  channelData?: {
    team?: { id: string; name?: string };
    channel?: { id: string; name?: string };
    tenant?: { id: string };
  };
  value?: unknown;
  replyToId?: string;
}

// ============================================================================
// Microsoft Teams Channel Implementation
// ============================================================================

export class TeamsChannel extends BaseChannel {
  private config: TeamsConfig;
  private accessToken?: string;
  private tokenExpiry?: number;
  private messageHandler?: (message: Message) => Promise<void>;
  private activityHandler?: (activity: TeamsActivity) => Promise<TeamsActivity | void>;

  private static readonly GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
  private static readonly AUTH_URL = 'https://login.microsoftonline.com';

  constructor(config: TeamsConfig) {
    super('teams');
    this.config = {
      ...config,
      rateLimit: {
        messagesPerSecond: config.rateLimit?.messagesPerSecond ?? 30,
        ...config.rateLimit,
      },
    };
    this.accessToken = config.accessToken;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async connect(): Promise<void> {
    try {
      // Authenticate
      if (this.config.clientSecret) {
        await this.authenticateApp();
      } else if (this.config.refreshToken) {
        await this.refreshAccessToken();
      } else if (!this.accessToken) {
        throw new Error('No authentication method provided');
      }

      // Test the connection
      await this.getMe();

      this.setConnected(true);
      console.log('[Teams] Connected');
    } catch (error) {
      console.error('[Teams] Connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.accessToken = undefined;
    this.tokenExpiry = undefined;
    this.setConnected(false);
    console.log('[Teams] Disconnected');
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  private async authenticateApp(): Promise<void> {
    const response = await fetch(
      `${TeamsChannel.AUTH_URL}/${this.config.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret!,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`App auth failed: ${response.status} - ${error}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);
  }

  private async refreshAccessToken(): Promise<void> {
    const response = await fetch(
      `${TeamsChannel.AUTH_URL}/${this.config.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          refresh_token: this.config.refreshToken!,
          scope: 'https://graph.microsoft.com/.default offline_access',
          grant_type: 'refresh_token',
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number; refresh_token?: string };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);

    // Update refresh token if a new one was issued
    if (data.refresh_token) {
      this.config.refreshToken = data.refresh_token;
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.tokenExpiry && Date.now() > this.tokenExpiry - 60000) {
      if (this.config.clientSecret) {
        await this.authenticateApp();
      } else if (this.config.refreshToken) {
        await this.refreshAccessToken();
      }
    }
  }

  // ============================================================================
  // Messaging
  // ============================================================================

  async send(
    targetId: string,
    content: string,
    options?: SendOptions & {
      contentType?: 'text' | 'html';
      importance?: 'normal' | 'high' | 'urgent';
      subject?: string;
      attachments?: TeamsAttachment[];
      mentions?: Array<{ userId: string; displayName: string }>;
    }
  ): Promise<void> {
    await this.ensureAuthenticated();

    const sanitized = this.sanitizeOutgoing(content);

    // Determine if this is a team channel or chat
    const isTeamChannel = targetId.includes('@thread');

    let url: string;
    if (isTeamChannel) {
      // Format: teamId:channelId or just channelId for channel messages
      const [teamId, channelId] = targetId.includes(':')
        ? targetId.split(':')
        : [undefined, targetId];

      if (teamId) {
        url = `${TeamsChannel.GRAPH_BASE}/teams/${teamId}/channels/${channelId}/messages`;
      } else {
        // Try to extract from the channel ID format
        url = `${TeamsChannel.GRAPH_BASE}/teams/${channelId}/messages`;
      }
    } else {
      // Chat message
      url = `${TeamsChannel.GRAPH_BASE}/chats/${targetId}/messages`;
    }

    const message: Partial<TeamsMessage> = {
      body: {
        contentType: options?.contentType || 'text',
        content: sanitized,
      },
    };

    if (options?.importance) {
      message.importance = options.importance;
    }
    if (options?.subject) {
      message.subject = options.subject;
    }
    if (options?.attachments) {
      message.attachments = options.attachments;
    }

    // Handle mentions
    if (options?.mentions && options.mentions.length > 0) {
      message.mentions = options.mentions.map((m, idx) => ({
        id: idx,
        mentionText: m.displayName,
        mentioned: { user: { id: m.userId, displayName: m.displayName } },
      }));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send message: ${response.status} - ${error}`);
    }

    console.log(`[Teams] Message sent to ${targetId}`);
  }

  async sendToChannel(teamId: string, channelId: string, content: string, options?: Parameters<typeof this.send>[2]): Promise<void> {
    await this.send(`${teamId}:${channelId}`, content, options);
  }

  async sendToChat(chatId: string, content: string, options?: Parameters<typeof this.send>[2]): Promise<void> {
    await this.send(chatId, content, options);
  }

  async sendCard(targetId: string, card: TeamsAdaptiveCard): Promise<void> {
    const attachment: TeamsAttachment = {
      id: `card_${Date.now()}`,
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: JSON.stringify(card),
    };

    await this.send(targetId, '', { attachments: [attachment] });
  }

  async replyToMessage(
    teamId: string,
    channelId: string,
    messageId: string,
    content: string
  ): Promise<void> {
    await this.ensureAuthenticated();

    const url = `${TeamsChannel.GRAPH_BASE}/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: {
          contentType: 'text',
          content: this.sanitizeOutgoing(content),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to reply: ${response.status}`);
    }
  }

  async updateMessage(
    chatId: string,
    messageId: string,
    content: string
  ): Promise<void> {
    await this.ensureAuthenticated();

    const url = `${TeamsChannel.GRAPH_BASE}/chats/${chatId}/messages/${messageId}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: {
          contentType: 'text',
          content: this.sanitizeOutgoing(content),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update message: ${response.status}`);
    }
  }

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    await this.ensureAuthenticated();

    const url = `${TeamsChannel.GRAPH_BASE}/chats/${chatId}/messages/${messageId}/softDelete`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete message: ${response.status}`);
    }
  }

  // ============================================================================
  // Team and Channel Management
  // ============================================================================

  async listTeams(): Promise<TeamsTeam[]> {
    await this.ensureAuthenticated();

    const response = await fetch(`${TeamsChannel.GRAPH_BASE}/me/joinedTeams`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to list teams: ${response.status}`);
    }

    const data = await response.json() as { value: TeamsTeam[] };
    return data.value;
  }

  async getTeam(teamId: string): Promise<TeamsTeam> {
    await this.ensureAuthenticated();

    const response = await fetch(`${TeamsChannel.GRAPH_BASE}/teams/${teamId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to get team: ${response.status}`);
    }

    return response.json() as Promise<TeamsTeam>;
  }

  async listChannels(teamId: string): Promise<TeamsChannel[]> {
    await this.ensureAuthenticated();

    const response = await fetch(`${TeamsChannel.GRAPH_BASE}/teams/${teamId}/channels`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to list channels: ${response.status}`);
    }

    const data = await response.json() as { value: TeamsChannel[] };
    return data.value;
  }

  async getChannel(teamId: string, channelId: string): Promise<TeamsChannel> {
    await this.ensureAuthenticated();

    const response = await fetch(`${TeamsChannel.GRAPH_BASE}/teams/${teamId}/channels/${channelId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to get channel: ${response.status}`);
    }

    return response.json() as Promise<TeamsChannel>;
  }

  // ============================================================================
  // Chat Management
  // ============================================================================

  async listChats(): Promise<TeamsChat[]> {
    await this.ensureAuthenticated();

    const response = await fetch(`${TeamsChannel.GRAPH_BASE}/me/chats`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to list chats: ${response.status}`);
    }

    const data = await response.json() as { value: TeamsChat[] };
    return data.value;
  }

  async getChat(chatId: string): Promise<TeamsChat> {
    await this.ensureAuthenticated();

    const response = await fetch(`${TeamsChannel.GRAPH_BASE}/chats/${chatId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to get chat: ${response.status}`);
    }

    return response.json() as Promise<TeamsChat>;
  }

  async createChat(members: string[], topic?: string): Promise<TeamsChat> {
    await this.ensureAuthenticated();

    const chatType = members.length > 1 ? 'group' : 'oneOnOne';

    const response = await fetch(`${TeamsChannel.GRAPH_BASE}/chats`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatType,
        topic: chatType === 'group' ? topic : undefined,
        members: members.map((userId, idx) => ({
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: idx === 0 ? ['owner'] : [],
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${userId}')`,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create chat: ${response.status}`);
    }

    return response.json() as Promise<TeamsChat>;
  }

  // ============================================================================
  // User Info
  // ============================================================================

  async getMe(): Promise<TeamsUser> {
    await this.ensureAuthenticated();

    const response = await fetch(`${TeamsChannel.GRAPH_BASE}/me`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.status}`);
    }

    return response.json() as Promise<TeamsUser>;
  }

  async getUser(userId: string): Promise<TeamsUser> {
    await this.ensureAuthenticated();

    const response = await fetch(`${TeamsChannel.GRAPH_BASE}/users/${userId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user: ${response.status}`);
    }

    return response.json() as Promise<TeamsUser>;
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  onMessage(handler: (message: Message) => Promise<void>): void {
    this.messageHandler = async (raw: Message) => {
      const sanitized = this.sanitizeIncoming(raw);
      await handler(sanitized);
    };
  }

  onActivity(handler: (activity: TeamsActivity) => Promise<TeamsActivity | void>): void {
    this.activityHandler = handler;
  }

  /**
   * Handle incoming Bot Framework activity
   * Call this from your HTTP endpoint handler
   */
  async handleActivity(activity: TeamsActivity): Promise<TeamsActivity | void> {
    // Handle message activities
    if (activity.type === 'message' && activity.text && this.messageHandler) {
      const message = this.activityToMessage(activity);
      try {
        await this.messageHandler(message);
      } catch (error) {
        console.error('[Teams] Message handler error:', error);
      }
    }

    // Handle all activities with custom handler
    if (this.activityHandler) {
      return this.activityHandler(activity);
    }
  }

  private activityToMessage(activity: TeamsActivity): Message {
    return {
      id: activity.id,
      channelId: activity.conversation.id,
      senderId: activity.from.id,
      content: activity.text || '',
      timestamp: new Date(activity.timestamp).getTime(),
      metadata: {
        senderName: activity.from.name,
        conversationType: activity.conversation.conversationType,
        isGroup: activity.conversation.isGroup,
        teamId: activity.channelData?.team?.id,
        teamName: activity.channelData?.team?.name,
        channelId: activity.channelData?.channel?.id,
        channelName: activity.channelData?.channel?.name,
        tenantId: activity.channelData?.tenant?.id || activity.conversation.tenantId,
        attachments: activity.attachments,
        mentions: activity.entities?.filter(e => e.type === 'mention'),
        replyToId: activity.replyToId,
        serviceUrl: activity.serviceUrl,
      },
    };
  }

  // ============================================================================
  // Adaptive Card Builders
  // ============================================================================

  createTextCard(title: string, content: string): TeamsAdaptiveCard {
    return {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        { type: 'TextBlock', text: title, size: 'large', weight: 'bolder' },
        { type: 'TextBlock', text: content, wrap: true },
      ],
    };
  }

  createButtonCard(
    title: string,
    buttons: Array<{ text: string; url?: string; action?: string }>
  ): TeamsAdaptiveCard {
    return {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        { type: 'TextBlock', text: title, size: 'large', weight: 'bolder' },
      ],
      actions: buttons.map(btn => ({
        type: btn.url ? 'Action.OpenUrl' : 'Action.Submit',
        title: btn.text,
        url: btn.url,
        data: btn.action ? { action: btn.action } : undefined,
      })),
    };
  }

  createFactCard(title: string, facts: Array<{ title: string; value: string }>): TeamsAdaptiveCard {
    return {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        { type: 'TextBlock', text: title, size: 'large', weight: 'bolder' },
        { type: 'FactSet', facts },
      ],
    };
  }
}
