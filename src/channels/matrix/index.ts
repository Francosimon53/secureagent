/**
 * Matrix Channel - Decentralized Chat Integration
 *
 * Uses Matrix protocol for federated, encrypted messaging.
 * Compatible with Element, Synapse, and other Matrix homeservers.
 */

import { BaseChannel, Message, SendOptions } from '../base.js';

// ============================================================================
// Matrix Types
// ============================================================================

export interface MatrixConfig {
  homeserverUrl: string;           // e.g., https://matrix.org
  accessToken?: string;            // For token-based auth
  userId?: string;                 // e.g., @bot:matrix.org
  deviceId?: string;               // For E2EE device tracking

  // Password-based auth (alternative to token)
  username?: string;
  password?: string;

  // Sync configuration
  sync?: {
    enabled?: boolean;
    timeout?: number;              // Sync timeout in ms
    fullState?: boolean;           // Get full room state
    filterId?: string;             // Server-side filter
  };

  // Encryption settings
  encryption?: {
    enabled?: boolean;
    verifyDevices?: boolean;
    trustUnverified?: boolean;
  };

  // Rate limiting
  rateLimit?: {
    messagesPerSecond?: number;
  };
}

export interface MatrixRoom {
  roomId: string;
  name?: string;
  topic?: string;
  canonicalAlias?: string;
  joinedMemberCount?: number;
  isEncrypted?: boolean;
  isDirect?: boolean;
}

export interface MatrixUser {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  presence?: 'online' | 'offline' | 'unavailable';
  lastActiveAgo?: number;
}

export interface MatrixEvent {
  eventId: string;
  type: string;
  roomId: string;
  sender: string;
  originServerTs: number;
  content: Record<string, unknown>;
  unsigned?: {
    age?: number;
    transactionId?: string;
    prevContent?: Record<string, unknown>;
  };
}

export interface MatrixMessageContent {
  msgtype: 'm.text' | 'm.notice' | 'm.emote' | 'm.image' | 'm.file' | 'm.audio' | 'm.video';
  body: string;
  format?: 'org.matrix.custom.html';
  formatted_body?: string;
  url?: string;                    // mxc:// URL for media
  info?: {
    mimetype?: string;
    size?: number;
    w?: number;
    h?: number;
    duration?: number;
  };
  'm.relates_to'?: {
    'm.in_reply_to'?: { event_id: string };
    rel_type?: string;
    event_id?: string;
  };
}

interface MatrixSyncResponse {
  next_batch: string;
  rooms?: {
    join?: Record<string, {
      timeline?: {
        events: MatrixEvent[];
        prev_batch?: string;
        limited?: boolean;
      };
      state?: { events: MatrixEvent[] };
      ephemeral?: { events: MatrixEvent[] };
    }>;
    invite?: Record<string, {
      invite_state?: { events: MatrixEvent[] };
    }>;
    leave?: Record<string, object>;
  };
  presence?: {
    events: MatrixEvent[];
  };
}

interface MatrixError {
  errcode: string;
  error: string;
  retry_after_ms?: number;
}

// ============================================================================
// Matrix Channel Implementation
// ============================================================================

export class MatrixChannel extends BaseChannel {
  private config: MatrixConfig;
  private accessToken?: string;
  private userId?: string;
  private deviceId?: string;
  private syncToken?: string;
  private messageHandler?: (message: Message) => Promise<void>;
  private syncAbortController: AbortController | null = null;
  private joinedRooms: Set<string> = new Set();

  constructor(config: MatrixConfig) {
    super('matrix');
    this.config = {
      ...config,
      sync: {
        enabled: config.sync?.enabled ?? true,
        timeout: config.sync?.timeout ?? 30000,
        fullState: config.sync?.fullState ?? false,
        ...config.sync,
      },
      encryption: {
        enabled: config.encryption?.enabled ?? false,
        verifyDevices: config.encryption?.verifyDevices ?? false,
        trustUnverified: config.encryption?.trustUnverified ?? true,
        ...config.encryption,
      },
      rateLimit: {
        messagesPerSecond: config.rateLimit?.messagesPerSecond ?? 10,
        ...config.rateLimit,
      },
    };
    this.accessToken = config.accessToken;
    this.userId = config.userId;
    this.deviceId = config.deviceId;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async connect(): Promise<void> {
    try {
      // Authenticate if needed
      if (!this.accessToken && this.config.username && this.config.password) {
        await this.login();
      }

      if (!this.accessToken) {
        throw new Error('No access token available. Provide accessToken or username/password.');
      }

      // Verify credentials
      const whoami = await this.apiRequest<{ user_id: string; device_id?: string }>(
        'GET',
        '/_matrix/client/v3/account/whoami'
      );
      this.userId = whoami.user_id;
      this.deviceId = whoami.device_id;

      // Get joined rooms
      const roomsResponse = await this.apiRequest<{ joined_rooms: string[] }>(
        'GET',
        '/_matrix/client/v3/joined_rooms'
      );
      this.joinedRooms = new Set(roomsResponse.joined_rooms);

      // Start sync loop
      if (this.config.sync?.enabled) {
        this.startSync();
      }

      this.setConnected(true);
      console.log(`[Matrix] Connected as ${this.userId}`);
    } catch (error) {
      console.error('[Matrix] Connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.stopSync();

    // Optionally logout (invalidates token)
    // await this.apiRequest('POST', '/_matrix/client/v3/logout', {});

    this.setConnected(false);
    console.log('[Matrix] Disconnected');
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  private async login(): Promise<void> {
    const response = await this.apiRequest<{
      user_id: string;
      access_token: string;
      device_id: string;
      well_known?: { 'm.homeserver': { base_url: string } };
    }>('POST', '/_matrix/client/v3/login', {
      type: 'm.login.password',
      identifier: {
        type: 'm.id.user',
        user: this.config.username,
      },
      password: this.config.password,
      device_id: this.config.deviceId,
      initial_device_display_name: 'SecureAgent Bot',
    });

    this.accessToken = response.access_token;
    this.userId = response.user_id;
    this.deviceId = response.device_id;

    console.log(`[Matrix] Logged in as ${this.userId}`);
  }

  // ============================================================================
  // Sync Loop
  // ============================================================================

  private startSync(): void {
    this.syncAbortController = new AbortController();
    this.syncLoop();
  }

  private stopSync(): void {
    if (this.syncAbortController) {
      this.syncAbortController.abort();
      this.syncAbortController = null;
    }
  }

  private async syncLoop(): Promise<void> {
    while (this.syncAbortController && !this.syncAbortController.signal.aborted) {
      try {
        const params = new URLSearchParams({
          timeout: String(this.config.sync?.timeout ?? 30000),
        });

        if (this.syncToken) {
          params.set('since', this.syncToken);
        }
        if (this.config.sync?.fullState) {
          params.set('full_state', 'true');
        }
        if (this.config.sync?.filterId) {
          params.set('filter', this.config.sync.filterId);
        }

        const sync = await this.apiRequest<MatrixSyncResponse>(
          'GET',
          `/_matrix/client/v3/sync?${params}`,
          undefined,
          this.config.sync?.timeout ? this.config.sync.timeout + 10000 : 40000
        );

        this.syncToken = sync.next_batch;
        await this.processSyncResponse(sync);
      } catch (error) {
        if ((error as Error).name === 'AbortError') break;

        console.error('[Matrix] Sync error:', error);
        await this.sleep(5000);
      }
    }
  }

  private async processSyncResponse(sync: MatrixSyncResponse): Promise<void> {
    if (!sync.rooms?.join) return;

    for (const [roomId, roomData] of Object.entries(sync.rooms.join)) {
      this.joinedRooms.add(roomId);

      if (!roomData.timeline?.events) continue;

      for (const event of roomData.timeline.events) {
        if (event.type !== 'm.room.message') continue;
        if (event.sender === this.userId) continue; // Skip own messages

        const message = this.eventToMessage(roomId, event);
        if (this.messageHandler) {
          try {
            await this.messageHandler(message);
          } catch (error) {
            console.error('[Matrix] Message handler error:', error);
          }
        }
      }
    }
  }

  private eventToMessage(roomId: string, event: MatrixEvent): Message {
    const content = event.content as unknown as MatrixMessageContent;
    let messageContent = content.body || '';
    const metadata: Record<string, unknown> = {
      eventType: event.type,
      msgtype: content.msgtype,
    };

    // Handle formatted content
    if (content.formatted_body) {
      metadata.formattedBody = content.formatted_body;
    }

    // Handle media
    if (content.url) {
      metadata.mediaUrl = content.url;
      metadata.mediaInfo = content.info;
    }

    // Handle replies
    if (content['m.relates_to']?.['m.in_reply_to']) {
      metadata.replyToEventId = content['m.relates_to']['m.in_reply_to'].event_id;
    }

    return {
      id: event.eventId,
      channelId: roomId,
      senderId: event.sender,
      content: messageContent,
      timestamp: event.originServerTs,
      metadata,
    };
  }

  // ============================================================================
  // Messaging
  // ============================================================================

  async send(
    roomId: string,
    content: string,
    options?: SendOptions & {
      format?: 'text' | 'html' | 'notice';
      replyToEventId?: string;
    }
  ): Promise<void> {
    const sanitized = this.sanitizeOutgoing(content);

    const messageContent: MatrixMessageContent = {
      msgtype: options?.format === 'notice' ? 'm.notice' : 'm.text',
      body: sanitized,
    };

    // Add HTML formatting
    if (options?.format === 'html') {
      messageContent.format = 'org.matrix.custom.html';
      messageContent.formatted_body = sanitized;
    }

    // Handle replies
    if (options?.replyToEventId) {
      messageContent['m.relates_to'] = {
        'm.in_reply_to': { event_id: options.replyToEventId },
      };
    }

    const txnId = `m${Date.now()}`;
    await this.apiRequest(
      'PUT',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      messageContent
    );

    console.log(`[Matrix] Message sent to ${roomId}`);
  }

  async sendImage(
    roomId: string,
    url: string,
    filename: string,
    options?: { caption?: string; width?: number; height?: number; size?: number; mimetype?: string }
  ): Promise<void> {
    const content: MatrixMessageContent = {
      msgtype: 'm.image',
      body: options?.caption || filename,
      url,
      info: {
        mimetype: options?.mimetype || 'image/png',
        size: options?.size,
        w: options?.width,
        h: options?.height,
      },
    };

    const txnId = `m${Date.now()}`;
    await this.apiRequest(
      'PUT',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      content
    );
  }

  async sendTyping(roomId: string, typing: boolean, timeout = 30000): Promise<void> {
    await this.apiRequest(
      'PUT',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/typing/${encodeURIComponent(this.userId!)}`,
      { typing, timeout }
    );
  }

  async sendReaction(roomId: string, eventId: string, emoji: string): Promise<void> {
    const content = {
      'm.relates_to': {
        rel_type: 'm.annotation',
        event_id: eventId,
        key: emoji,
      },
    };

    const txnId = `m${Date.now()}`;
    await this.apiRequest(
      'PUT',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.reaction/${txnId}`,
      content
    );
  }

  async redactMessage(roomId: string, eventId: string, reason?: string): Promise<void> {
    const txnId = `m${Date.now()}`;
    await this.apiRequest(
      'PUT',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/redact/${encodeURIComponent(eventId)}/${txnId}`,
      { reason }
    );
  }

  // ============================================================================
  // Room Management
  // ============================================================================

  async joinRoom(roomIdOrAlias: string): Promise<string> {
    const response = await this.apiRequest<{ room_id: string }>(
      'POST',
      `/_matrix/client/v3/join/${encodeURIComponent(roomIdOrAlias)}`,
      {}
    );
    this.joinedRooms.add(response.room_id);
    return response.room_id;
  }

  async leaveRoom(roomId: string): Promise<void> {
    await this.apiRequest(
      'POST',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/leave`,
      {}
    );
    this.joinedRooms.delete(roomId);
  }

  async createRoom(options: {
    name?: string;
    topic?: string;
    isPublic?: boolean;
    isDirect?: boolean;
    invite?: string[];
    encrypted?: boolean;
  }): Promise<string> {
    const createParams: Record<string, unknown> = {
      name: options.name,
      topic: options.topic,
      visibility: options.isPublic ? 'public' : 'private',
      is_direct: options.isDirect,
      invite: options.invite,
    };

    if (options.encrypted) {
      createParams.initial_state = [
        {
          type: 'm.room.encryption',
          state_key: '',
          content: { algorithm: 'm.megolm.v1.aes-sha2' },
        },
      ];
    }

    const response = await this.apiRequest<{ room_id: string }>(
      'POST',
      '/_matrix/client/v3/createRoom',
      createParams
    );
    this.joinedRooms.add(response.room_id);
    return response.room_id;
  }

  async getRoomInfo(roomId: string): Promise<MatrixRoom> {
    const stateEvents = await this.apiRequest<MatrixEvent[]>(
      'GET',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state`
    );

    const room: MatrixRoom = { roomId };

    for (const event of stateEvents) {
      switch (event.type) {
        case 'm.room.name':
          room.name = (event.content as { name?: string }).name;
          break;
        case 'm.room.topic':
          room.topic = (event.content as { topic?: string }).topic;
          break;
        case 'm.room.canonical_alias':
          room.canonicalAlias = (event.content as { alias?: string }).alias;
          break;
        case 'm.room.encryption':
          room.isEncrypted = true;
          break;
      }
    }

    return room;
  }

  async getJoinedRooms(): Promise<string[]> {
    return Array.from(this.joinedRooms);
  }

  // ============================================================================
  // User Info
  // ============================================================================

  async getUserProfile(userId: string): Promise<MatrixUser> {
    const profile = await this.apiRequest<{ displayname?: string; avatar_url?: string }>(
      'GET',
      `/_matrix/client/v3/profile/${encodeURIComponent(userId)}`
    );

    return {
      userId,
      displayName: profile.displayname,
      avatarUrl: profile.avatar_url,
    };
  }

  async setDisplayName(displayName: string): Promise<void> {
    await this.apiRequest(
      'PUT',
      `/_matrix/client/v3/profile/${encodeURIComponent(this.userId!)}/displayname`,
      { displayname: displayName }
    );
  }

  // ============================================================================
  // Media
  // ============================================================================

  async uploadMedia(
    content: Buffer,
    filename: string,
    contentType: string
  ): Promise<string> {
    const response = await fetch(
      `${this.config.homeserverUrl}/_matrix/media/v3/upload?filename=${encodeURIComponent(filename)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': contentType,
        },
        body: content,
      }
    );

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    const data = await response.json() as { content_uri: string };
    return data.content_uri; // mxc:// URL
  }

  getMediaUrl(mxcUrl: string): string {
    // Convert mxc://server/media_id to https://homeserver/_matrix/media/v3/download/server/media_id
    const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
    if (!match) throw new Error('Invalid mxc URL');

    const [, serverName, mediaId] = match;
    return `${this.config.homeserverUrl}/_matrix/media/v3/download/${serverName}/${mediaId}`;
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

  // ============================================================================
  // API Helpers
  // ============================================================================

  private async apiRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = 30000
  ): Promise<T> {
    const url = `${this.config.homeserverUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...(this.accessToken && { Authorization: `Bearer ${this.accessToken}` }),
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json() as MatrixError;

        if (error.retry_after_ms) {
          throw new Error(`Rate limited: retry after ${error.retry_after_ms}ms`);
        }

        throw new Error(`Matrix API error: ${error.errcode} - ${error.error}`);
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getUserId(): string | undefined {
    return this.userId;
  }

  getDeviceId(): string | undefined {
    return this.deviceId;
  }
}
