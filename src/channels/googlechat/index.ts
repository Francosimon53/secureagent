/**
 * Google Chat Channel - Google Workspace Integration
 *
 * Uses Google Chat API for workspace messaging.
 * Supports both service account and OAuth authentication.
 */

import { BaseChannel, Message, SendOptions } from '../base.js';

// ============================================================================
// Google Chat Types
// ============================================================================

export interface GoogleChatConfig {
  // Service Account auth (recommended for bots)
  serviceAccountKey?: string;       // JSON key file content or path
  serviceAccountEmail?: string;

  // OAuth auth (for user-level access)
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;

  // Webhook configuration
  webhook?: {
    url: string;                    // Incoming webhook URL
  };

  // Pub/Sub for async messaging
  pubsub?: {
    projectId: string;
    subscriptionId: string;
  };

  // Rate limiting
  rateLimit?: {
    messagesPerSecond?: number;
  };
}

export interface GoogleChatSpace {
  name: string;                     // spaces/{space}
  type: 'ROOM' | 'DM' | 'TYPE_UNSPECIFIED';
  displayName?: string;
  spaceThreadingState?: 'THREADED_MESSAGES' | 'GROUPED_MESSAGES' | 'UNTHREADED_MESSAGES';
  spaceType?: 'SPACE' | 'GROUP_CHAT' | 'DIRECT_MESSAGE';
  singleUserBotDm?: boolean;
  threaded?: boolean;
  externalUserAllowed?: boolean;
}

export interface GoogleChatUser {
  name: string;                     // users/{user}
  displayName: string;
  domainId?: string;
  type: 'HUMAN' | 'BOT';
  isAnonymous?: boolean;
}

export interface GoogleChatMessage {
  name?: string;                    // spaces/{space}/messages/{message}
  sender?: GoogleChatUser;
  createTime?: string;
  text?: string;
  formattedText?: string;
  cards?: GoogleChatCard[];
  cardsV2?: GoogleChatCardV2[];
  annotations?: GoogleChatAnnotation[];
  thread?: { name: string; threadKey?: string };
  space?: GoogleChatSpace;
  fallbackText?: string;
  argumentText?: string;
  slashCommand?: { commandId: string };
  attachment?: GoogleChatAttachment[];
  matchedUrl?: { url: string };
  threadReply?: boolean;
  clientAssignedMessageId?: string;
}

export interface GoogleChatCard {
  header?: {
    title: string;
    subtitle?: string;
    imageUrl?: string;
    imageStyle?: 'IMAGE' | 'AVATAR';
  };
  sections?: Array<{
    header?: string;
    widgets?: GoogleChatWidget[];
  }>;
  cardActions?: Array<{
    actionLabel: string;
    onClick: GoogleChatOnClick;
  }>;
}

export interface GoogleChatCardV2 {
  cardId: string;
  card: {
    header?: {
      title: string;
      subtitle?: string;
      imageUrl?: string;
      imageType?: 'CIRCLE' | 'SQUARE';
    };
    sections?: Array<{
      header?: string;
      collapsible?: boolean;
      widgets?: GoogleChatWidgetV2[];
    }>;
  };
}

export interface GoogleChatWidget {
  textParagraph?: { text: string };
  image?: { imageUrl: string; onClick?: GoogleChatOnClick };
  keyValue?: {
    topLabel?: string;
    content: string;
    bottomLabel?: string;
    onClick?: GoogleChatOnClick;
    icon?: string;
    button?: GoogleChatButton;
  };
  buttons?: GoogleChatButton[];
}

export interface GoogleChatWidgetV2 {
  textParagraph?: { text: string };
  image?: { imageUrl: string; altText?: string; onClick?: GoogleChatOnClick };
  decoratedText?: {
    topLabel?: string;
    text: string;
    bottomLabel?: string;
    startIcon?: { knownIcon?: string; iconUrl?: string };
    endIcon?: { knownIcon?: string; iconUrl?: string };
    onClick?: GoogleChatOnClick;
    button?: GoogleChatButton;
  };
  buttonList?: { buttons: GoogleChatButton[] };
  divider?: object;
  selectionInput?: {
    name: string;
    label?: string;
    type: 'CHECK_BOX' | 'RADIO_BUTTON' | 'SWITCH' | 'DROPDOWN';
    items: Array<{ text: string; value: string; selected?: boolean }>;
  };
  textInput?: {
    name: string;
    label?: string;
    hintText?: string;
    value?: string;
    type?: 'SINGLE_LINE' | 'MULTIPLE_LINE';
  };
}

export interface GoogleChatButton {
  textButton?: { text: string; onClick: GoogleChatOnClick };
  imageButton?: { icon?: string; iconUrl?: string; onClick: GoogleChatOnClick };
  text?: string;
  icon?: { knownIcon?: string; iconUrl?: string };
  color?: { red: number; green: number; blue: number; alpha?: number };
  onClick?: GoogleChatOnClick;
  disabled?: boolean;
}

export interface GoogleChatOnClick {
  action?: {
    actionMethodName: string;
    parameters?: Array<{ key: string; value: string }>;
  };
  openLink?: { url: string };
}

export interface GoogleChatAnnotation {
  type: 'USER_MENTION' | 'SLASH_COMMAND' | 'RICH_LINK';
  startIndex?: number;
  length?: number;
  userMention?: { user: GoogleChatUser; type: 'ADD' | 'MENTION' };
  slashCommand?: { bot: GoogleChatUser; type: string; commandName: string; commandId: string };
  richLinkMetadata?: { uri: string; richLinkType: string };
}

export interface GoogleChatAttachment {
  name: string;
  contentName: string;
  contentType: string;
  thumbnailUri?: string;
  downloadUri?: string;
  source?: 'DRIVE_FILE' | 'UPLOADED_CONTENT';
}

export interface GoogleChatEvent {
  type: 'MESSAGE' | 'ADDED_TO_SPACE' | 'REMOVED_FROM_SPACE' | 'CARD_CLICKED';
  eventTime: string;
  token?: string;
  message?: GoogleChatMessage;
  user?: GoogleChatUser;
  space?: GoogleChatSpace;
  action?: {
    actionMethodName: string;
    parameters?: Array<{ key: string; value: string }>;
  };
  configCompleteRedirectUrl?: string;
  isDialogEvent?: boolean;
  dialogEventType?: 'REQUEST_DIALOG' | 'SUBMIT_DIALOG' | 'CANCEL_DIALOG';
}

// ============================================================================
// Google Chat Channel Implementation
// ============================================================================

export class GoogleChatChannel extends BaseChannel {
  private config: GoogleChatConfig;
  private accessToken?: string;
  private tokenExpiry?: number;
  private messageHandler?: (message: Message) => Promise<void>;
  private eventHandler?: (event: GoogleChatEvent) => Promise<GoogleChatMessage | void>;

  constructor(config: GoogleChatConfig) {
    super('googlechat');
    this.config = {
      ...config,
      rateLimit: {
        messagesPerSecond: config.rateLimit?.messagesPerSecond ?? 60,
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
      if (this.config.serviceAccountKey) {
        await this.authenticateServiceAccount();
      } else if (this.config.refreshToken) {
        await this.refreshAccessToken();
      } else if (!this.accessToken) {
        throw new Error('No authentication method provided');
      }

      // Test the connection
      await this.listSpaces();

      this.setConnected(true);
      console.log('[GoogleChat] Connected');
    } catch (error) {
      console.error('[GoogleChat] Connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.accessToken = undefined;
    this.tokenExpiry = undefined;
    this.setConnected(false);
    console.log('[GoogleChat] Disconnected');
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  private async authenticateServiceAccount(): Promise<void> {
    // Parse service account key
    let keyData: { client_email: string; private_key: string; token_uri: string };
    try {
      if (!this.config.serviceAccountKey) {
        throw new Error('Service account key is required');
      }
      keyData = typeof this.config.serviceAccountKey === 'string'
        ? JSON.parse(this.config.serviceAccountKey) as typeof keyData
        : this.config.serviceAccountKey as unknown as typeof keyData;
    } catch {
      throw new Error('Invalid service account key');
    }

    // Create JWT
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: keyData.client_email,
      scope: 'https://www.googleapis.com/auth/chat.bot',
      aud: keyData.token_uri,
      iat: now,
      exp: now + 3600,
    };

    // Sign JWT (simplified - in production use proper JWT library)
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signInput = `${header}.${body}`;

    // Note: In a real implementation, you'd sign with the private key using crypto
    // This is a simplified version
    const crypto = await import('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signInput);
    const signature = sign.sign(keyData.private_key, 'base64url');
    const jwt = `${signInput}.${signature}`;

    // Exchange JWT for access token
    const response = await fetch(keyData.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Service account auth failed: ${response.status}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.config.clientId || !this.config.clientSecret || !this.config.refreshToken) {
      throw new Error('OAuth credentials required for token refresh');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.tokenExpiry && Date.now() > this.tokenExpiry - 60000) {
      if (this.config.serviceAccountKey) {
        await this.authenticateServiceAccount();
      } else if (this.config.refreshToken) {
        await this.refreshAccessToken();
      }
    }
  }

  // ============================================================================
  // Messaging
  // ============================================================================

  async send(
    spaceName: string,
    content: string,
    options?: SendOptions & {
      threadKey?: string;
      messageReplyOption?: 'MESSAGE_REPLY_OPTION_UNSPECIFIED' | 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD' | 'REPLY_MESSAGE_OR_FAIL';
      cards?: GoogleChatCard[];
      cardsV2?: GoogleChatCardV2[];
    }
  ): Promise<void> {
    await this.ensureAuthenticated();

    const sanitized = this.sanitizeOutgoing(content);
    const message: Partial<GoogleChatMessage> = {
      text: sanitized,
    };

    if (options?.cards) {
      message.cards = options.cards;
    }
    if (options?.cardsV2) {
      message.cardsV2 = options.cardsV2;
    }
    if (options?.threadKey) {
      (message as { thread?: { name?: string; threadKey?: string } }).thread = { threadKey: options.threadKey };
    }

    const params = new URLSearchParams();
    if (options?.threadKey) {
      params.set('threadKey', options.threadKey);
    }
    if (options?.messageReplyOption) {
      params.set('messageReplyOption', options.messageReplyOption);
    }

    const queryString = params.toString();
    const url = `https://chat.googleapis.com/v1/${spaceName}/messages${queryString ? `?${queryString}` : ''}`;

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

    console.log(`[GoogleChat] Message sent to ${spaceName}`);
  }

  async sendCard(spaceName: string, card: GoogleChatCardV2, options?: { threadKey?: string }): Promise<void> {
    await this.send(spaceName, '', { ...options, cardsV2: [card] });
  }

  async updateMessage(messageName: string, text: string, updateMask = 'text'): Promise<void> {
    await this.ensureAuthenticated();

    const response = await fetch(
      `https://chat.googleapis.com/v1/${messageName}?updateMask=${updateMask}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: this.sanitizeOutgoing(text) }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update message: ${response.status}`);
    }
  }

  async deleteMessage(messageName: string): Promise<void> {
    await this.ensureAuthenticated();

    const response = await fetch(`https://chat.googleapis.com/v1/${messageName}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete message: ${response.status}`);
    }
  }

  async getMessage(messageName: string): Promise<GoogleChatMessage> {
    await this.ensureAuthenticated();

    const response = await fetch(`https://chat.googleapis.com/v1/${messageName}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to get message: ${response.status}`);
    }

    return response.json() as Promise<GoogleChatMessage>;
  }

  // ============================================================================
  // Webhook Support
  // ============================================================================

  async sendWebhook(content: string, options?: { cards?: GoogleChatCard[]; threadKey?: string }): Promise<void> {
    if (!this.config.webhook?.url) {
      throw new Error('Webhook URL not configured');
    }

    const message: Partial<GoogleChatMessage> = {
      text: this.sanitizeOutgoing(content),
    };

    if (options?.cards) {
      message.cards = options.cards;
    }

    let url = this.config.webhook.url;
    if (options?.threadKey) {
      url += `&threadKey=${encodeURIComponent(options.threadKey)}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }
  }

  // ============================================================================
  // Space Management
  // ============================================================================

  async listSpaces(): Promise<GoogleChatSpace[]> {
    await this.ensureAuthenticated();

    const response = await fetch('https://chat.googleapis.com/v1/spaces', {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to list spaces: ${response.status}`);
    }

    const data = await response.json() as { spaces?: GoogleChatSpace[] };
    return data.spaces || [];
  }

  async getSpace(spaceName: string): Promise<GoogleChatSpace> {
    await this.ensureAuthenticated();

    const response = await fetch(`https://chat.googleapis.com/v1/${spaceName}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to get space: ${response.status}`);
    }

    return response.json() as Promise<GoogleChatSpace>;
  }

  async listMembers(spaceName: string): Promise<Array<{ name: string; member: GoogleChatUser }>> {
    await this.ensureAuthenticated();

    const response = await fetch(`https://chat.googleapis.com/v1/${spaceName}/members`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to list members: ${response.status}`);
    }

    const data = await response.json() as { memberships?: Array<{ name: string; member: GoogleChatUser }> };
    return data.memberships || [];
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

  onEvent(handler: (event: GoogleChatEvent) => Promise<GoogleChatMessage | void>): void {
    this.eventHandler = handler;
  }

  /**
   * Handle incoming webhook event from Google Chat
   * Call this from your HTTP endpoint handler
   */
  async handleEvent(event: GoogleChatEvent): Promise<GoogleChatMessage | void> {
    // Handle MESSAGE events
    if (event.type === 'MESSAGE' && event.message && this.messageHandler) {
      const message = this.chatMessageToMessage(event);
      try {
        await this.messageHandler(message);
      } catch (error) {
        console.error('[GoogleChat] Message handler error:', error);
      }
    }

    // Handle all events with custom handler
    if (this.eventHandler) {
      return this.eventHandler(event);
    }
  }

  private chatMessageToMessage(event: GoogleChatEvent): Message {
    const msg = event.message!;

    return {
      id: msg.name || `${event.eventTime}`,
      channelId: msg.space?.name || '',
      senderId: msg.sender?.name || '',
      content: msg.text || msg.argumentText || '',
      timestamp: new Date(event.eventTime).getTime(),
      metadata: {
        senderDisplayName: msg.sender?.displayName,
        senderType: msg.sender?.type,
        spaceType: msg.space?.type,
        spaceDisplayName: msg.space?.displayName,
        threadName: msg.thread?.name,
        slashCommand: msg.slashCommand,
        annotations: msg.annotations,
        attachments: msg.attachment,
      },
    };
  }

  // ============================================================================
  // Card Builders
  // ============================================================================

  createTextCard(title: string, content: string, subtitle?: string): GoogleChatCardV2 {
    return {
      cardId: `card_${Date.now()}`,
      card: {
        header: { title, subtitle },
        sections: [
          { widgets: [{ textParagraph: { text: content } }] },
        ],
      },
    };
  }

  createButtonCard(
    title: string,
    buttons: Array<{ text: string; url?: string; action?: string }>
  ): GoogleChatCardV2 {
    return {
      cardId: `card_${Date.now()}`,
      card: {
        header: { title },
        sections: [
          {
            widgets: [
              {
                buttonList: {
                  buttons: buttons.map(btn => ({
                    text: btn.text,
                    onClick: btn.url
                      ? { openLink: { url: btn.url } }
                      : { action: { actionMethodName: btn.action || btn.text } },
                  })),
                },
              },
            ],
          },
        ],
      },
    };
  }
}
