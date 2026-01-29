import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';
import { BaseChannel, Message, SendOptions } from '../base.js';
import { getLogger, getAuditLogger } from '../../observability/logger.js';
import { RateLimiter } from '../../security/guardrails/rate-limiter.js';

const logger = getLogger().child({ module: 'SignalChannel' });
const auditLogger = getAuditLogger();

// ============================================================================
// Signal Types
// ============================================================================

export interface SignalConfig {
  // Phone number in E.164 format (+1234567890)
  phoneNumber: string;

  // Path to signal-cli executable (default: 'signal-cli')
  signalCliPath?: string;

  // Config directory for signal-cli
  configPath?: string;

  // Use JSON-RPC daemon mode (recommended for production)
  daemonMode?: boolean;

  // Unix socket path for daemon mode
  socketPath?: string;

  // Trust mode for safety numbers
  trustMode?: 'always' | 'on-first-use' | 'never';

  // Rate limiting
  rateLimit?: {
    messagesPerMinute?: number;
  };
}

// Signal message envelope
interface SignalEnvelope {
  source?: string;
  sourceNumber?: string;
  sourceUuid?: string;
  sourceName?: string;
  sourceDevice?: number;
  timestamp?: number;
  dataMessage?: SignalDataMessage;
  syncMessage?: SignalSyncMessage;
  receiptMessage?: SignalReceiptMessage;
  typingMessage?: SignalTypingMessage;
  callMessage?: unknown;
}

interface SignalDataMessage {
  timestamp?: number;
  message?: string;
  body?: string;
  expiresInSeconds?: number;
  viewOnce?: boolean;
  reaction?: SignalReaction;
  quote?: SignalQuote;
  mentions?: SignalMention[];
  attachments?: SignalAttachment[];
  sticker?: SignalSticker;
  groupInfo?: SignalGroupInfo;
  previews?: SignalPreview[];
}

interface SignalSyncMessage {
  sentMessage?: {
    destination?: string;
    destinationNumber?: string;
    destinationUuid?: string;
    timestamp?: number;
    message?: string;
    expiresInSeconds?: number;
    groupInfo?: SignalGroupInfo;
  };
  readMessages?: Array<{
    sender?: string;
    senderNumber?: string;
    senderUuid?: string;
    timestamp?: number;
  }>;
  contacts?: unknown;
  groups?: unknown;
}

interface SignalReceiptMessage {
  when?: number;
  isDelivery?: boolean;
  isRead?: boolean;
  isViewed?: boolean;
  timestamps?: number[];
}

interface SignalTypingMessage {
  action?: 'STARTED' | 'STOPPED';
  timestamp?: number;
  groupId?: string;
}

interface SignalReaction {
  emoji?: string;
  targetAuthor?: string;
  targetAuthorNumber?: string;
  targetAuthorUuid?: string;
  targetSentTimestamp?: number;
  isRemove?: boolean;
}

interface SignalQuote {
  id?: number;
  author?: string;
  authorNumber?: string;
  authorUuid?: string;
  text?: string;
  mentions?: SignalMention[];
  attachments?: SignalAttachment[];
}

interface SignalMention {
  start?: number;
  length?: number;
  uuid?: string;
  number?: string;
}

interface SignalAttachment {
  contentType?: string;
  filename?: string;
  id?: string;
  size?: number;
  width?: number;
  height?: number;
  caption?: string;
  uploadTimestamp?: number;
}

interface SignalSticker {
  packId?: string;
  packKey?: string;
  stickerId?: number;
  emoji?: string;
}

interface SignalGroupInfo {
  groupId?: string;
  type?: 'DELIVER' | 'UPDATE' | 'QUIT' | 'REQUEST_INFO';
  name?: string;
  members?: string[];
  membersUuid?: string[];
  avatar?: string;
}

interface SignalPreview {
  url?: string;
  title?: string;
  description?: string;
  image?: SignalAttachment;
}

// JSON-RPC types
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: {
    envelope?: SignalEnvelope;
    account?: string;
    subscription?: number;
  };
}

// ============================================================================
// Signal Channel Implementation
// ============================================================================

export class SignalChannel extends BaseChannel {
  private readonly config: Required<Pick<SignalConfig, 'phoneNumber'>> & {
    signalCliPath: string;
    configPath?: string;
    daemonMode: boolean;
    socketPath?: string;
    trustMode: 'always' | 'on-first-use' | 'never';
    rateLimit: { messagesPerMinute: number };
  };

  private messageHandler?: (message: Message) => Promise<void>;
  private reactionHandler?: (reaction: {
    emoji: string;
    targetMessageTimestamp: number;
    senderId: string;
    isRemove: boolean;
  }) => Promise<void>;
  private typingHandler?: (typing: {
    senderId: string;
    groupId?: string;
    isTyping: boolean;
  }) => Promise<void>;
  private receiptHandler?: (receipt: {
    senderId: string;
    timestamps: number[];
    type: 'delivery' | 'read' | 'viewed';
  }) => Promise<void>;

  private readonly rateLimiter: RateLimiter;
  private process: ChildProcess | null = null;
  private readline: Interface | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private subscriptionId: number | null = null;

  constructor(config: SignalConfig) {
    super('signal');

    this.config = {
      phoneNumber: config.phoneNumber,
      signalCliPath: config.signalCliPath ?? 'signal-cli',
      configPath: config.configPath,
      daemonMode: config.daemonMode ?? true,
      socketPath: config.socketPath,
      trustMode: config.trustMode ?? 'on-first-use',
      rateLimit: {
        messagesPerMinute: config.rateLimit?.messagesPerMinute ?? 30,
      },
    };

    this.rateLimiter = new RateLimiter({
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
      if (this.config.daemonMode) {
        await this.startDaemon();
      } else {
        // Verify signal-cli is working
        await this.executeCommand(['--version']);
      }

      logger.info({ phoneNumber: this.config.phoneNumber }, 'Signal channel connected');
      this.setConnected(true);
    } catch (error) {
      logger.error({ error }, 'Failed to connect Signal channel');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.subscriptionId !== null) {
      try {
        await this.sendRpcRequest('unsubscribe', { subscription: this.subscriptionId });
      } catch {
        // Ignore errors during shutdown
      }
    }

    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }

    // Clear pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Channel disconnected'));
    }
    this.pendingRequests.clear();

    this.setConnected(false);
    logger.info('Signal channel disconnected');
  }

  // ============================================================================
  // Daemon Mode
  // ============================================================================

  private async startDaemon(): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['--output=json', 'jsonRpc'];

      if (this.config.configPath) {
        args.unshift('--config', this.config.configPath);
      }

      args.unshift('-a', this.config.phoneNumber);

      this.process = spawn(this.config.signalCliPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.on('error', (error) => {
        logger.error({ error }, 'Signal daemon process error');
        reject(error);
      });

      this.process.on('exit', (code, signal) => {
        logger.warn({ code, signal }, 'Signal daemon process exited');
        this.handleDaemonExit();
      });

      if (this.process.stderr) {
        this.process.stderr.on('data', (data: Buffer) => {
          const message = data.toString().trim();
          if (message) {
            logger.debug({ stderr: message }, 'Signal daemon stderr');
          }
        });
      }

      if (this.process.stdout) {
        this.readline = createInterface({
          input: this.process.stdout,
          crlfDelay: Infinity,
        });

        this.readline.on('line', (line) => {
          this.handleDaemonLine(line);
        });
      }

      // Subscribe to receive messages
      setTimeout(async () => {
        try {
          const result = await this.sendRpcRequest('subscribeReceive', {
            account: this.config.phoneNumber,
          }) as { subscription: number };
          this.subscriptionId = result.subscription;
          logger.info({ subscriptionId: this.subscriptionId }, 'Subscribed to Signal messages');
          resolve();
        } catch (error) {
          reject(error);
        }
      }, 1000);
    });
  }

  private handleDaemonExit(): void {
    if (this.connected) {
      logger.info('Attempting to reconnect Signal daemon');
      setTimeout(() => {
        this.startDaemon().catch((error) => {
          logger.error({ error }, 'Failed to reconnect Signal daemon');
        });
      }, 5000);
    }
  }

  private handleDaemonLine(line: string): void {
    if (!line.trim()) return;

    try {
      const data = JSON.parse(line);

      // Check if it's a response to a request
      if ('id' in data && this.pendingRequests.has(data.id)) {
        const pending = this.pendingRequests.get(data.id)!;
        this.pendingRequests.delete(data.id);
        clearTimeout(pending.timeout);

        const response = data as JsonRpcResponse;
        if (response.error) {
          pending.reject(new Error(response.error.message));
        } else {
          pending.resolve(response.result);
        }
        return;
      }

      // Check if it's a notification (incoming message)
      if ('method' in data && data.method === 'receive') {
        const notification = data as JsonRpcNotification;
        if (notification.params?.envelope) {
          this.handleEnvelope(notification.params.envelope);
        }
      }
    } catch (error) {
      logger.error({ error, line }, 'Failed to parse Signal daemon output');
    }
  }

  private async sendRpcRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.process?.stdin) {
      throw new Error('Signal daemon not running');
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      this.process!.stdin!.write(JSON.stringify(request) + '\n');
    });
  }

  // ============================================================================
  // Command Mode (non-daemon)
  // ============================================================================

  private async executeCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const fullArgs = ['--output=json'];

      if (this.config.configPath) {
        fullArgs.push('--config', this.config.configPath);
      }

      fullArgs.push('-a', this.config.phoneNumber, ...args);

      const proc = spawn(this.config.signalCliPath, fullArgs);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', reject);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`signal-cli exited with code ${code}: ${stderr}`));
        }
      });
    });
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  private handleEnvelope(envelope: SignalEnvelope): void {
    const senderId = envelope.sourceNumber ?? envelope.sourceUuid ?? envelope.source ?? '';

    // Handle data message (regular message)
    if (envelope.dataMessage) {
      this.handleDataMessage(envelope, envelope.dataMessage, senderId);
    }

    // Handle sync message (messages we sent from another device)
    if (envelope.syncMessage?.sentMessage) {
      this.handleSyncMessage(envelope.syncMessage);
    }

    // Handle receipt
    if (envelope.receiptMessage) {
      this.handleReceiptMessage(envelope.receiptMessage, senderId);
    }

    // Handle typing indicator
    if (envelope.typingMessage) {
      this.handleTypingMessage(envelope.typingMessage, senderId);
    }
  }

  private handleDataMessage(
    envelope: SignalEnvelope,
    dataMessage: SignalDataMessage,
    senderId: string
  ): void {
    // Handle reaction
    if (dataMessage.reaction && this.reactionHandler) {
      this.reactionHandler({
        emoji: dataMessage.reaction.emoji ?? '',
        targetMessageTimestamp: dataMessage.reaction.targetSentTimestamp ?? 0,
        senderId,
        isRemove: dataMessage.reaction.isRemove ?? false,
      }).catch((error) => {
        logger.error({ error }, 'Error handling Signal reaction');
      });
      return;
    }

    // Handle regular message
    const content = dataMessage.message ?? dataMessage.body ?? '';
    if (!content && !dataMessage.attachments?.length) return;

    const channelId = dataMessage.groupInfo?.groupId ?? senderId;
    const metadata: Record<string, unknown> = {
      senderName: envelope.sourceName,
      senderUuid: envelope.sourceUuid,
      senderDevice: envelope.sourceDevice,
      expiresInSeconds: dataMessage.expiresInSeconds,
      viewOnce: dataMessage.viewOnce,
    };

    // Add group info
    if (dataMessage.groupInfo) {
      metadata.isGroup = true;
      metadata.groupId = dataMessage.groupInfo.groupId;
      metadata.groupName = dataMessage.groupInfo.name;
    }

    // Add quote info
    if (dataMessage.quote) {
      metadata.quote = {
        id: dataMessage.quote.id,
        author: dataMessage.quote.authorNumber ?? dataMessage.quote.authorUuid,
        text: dataMessage.quote.text,
      };
    }

    // Add mentions
    if (dataMessage.mentions?.length) {
      metadata.mentions = dataMessage.mentions.map((m) => ({
        start: m.start,
        length: m.length,
        userId: m.number ?? m.uuid,
      }));
    }

    // Add attachments
    if (dataMessage.attachments?.length) {
      metadata.attachments = dataMessage.attachments.map((a) => ({
        id: a.id,
        contentType: a.contentType,
        filename: a.filename,
        size: a.size,
        width: a.width,
        height: a.height,
        caption: a.caption,
      }));
    }

    // Add sticker
    if (dataMessage.sticker) {
      metadata.sticker = {
        packId: dataMessage.sticker.packId,
        stickerId: dataMessage.sticker.stickerId,
        emoji: dataMessage.sticker.emoji,
      };
    }

    // Add link previews
    if (dataMessage.previews?.length) {
      metadata.previews = dataMessage.previews.map((p) => ({
        url: p.url,
        title: p.title,
        description: p.description,
      }));
    }

    const message: Message = {
      id: `${envelope.timestamp ?? Date.now()}`,
      channelId,
      senderId,
      content,
      timestamp: envelope.timestamp ?? Date.now(),
      metadata,
    };

    if (this.messageHandler) {
      const sanitized = this.sanitizeIncoming(message);
      this.messageHandler(sanitized).catch((error) => {
        logger.error({ error, messageId: message.id }, 'Error handling Signal message');
      });
    }

    auditLogger.log({
      eventId: message.id,
      timestamp: Date.now(),
      eventType: 'channel',
      severity: 'info',
      actor: { userId: senderId },
      resource: { type: 'signal_message', id: message.id },
      action: 'receive',
      outcome: 'success',
      details: { channelId, isGroup: !!dataMessage.groupInfo },
    });
  }

  private handleSyncMessage(syncMessage: SignalSyncMessage): void {
    if (syncMessage.sentMessage) {
      const sent = syncMessage.sentMessage;
      logger.debug(
        {
          destination: sent.destinationNumber ?? sent.destinationUuid,
          timestamp: sent.timestamp,
        },
        'Sync: message sent from another device'
      );
    }
  }

  private handleReceiptMessage(receipt: SignalReceiptMessage, senderId: string): void {
    if (!this.receiptHandler) return;

    let type: 'delivery' | 'read' | 'viewed' = 'delivery';
    if (receipt.isRead) type = 'read';
    if (receipt.isViewed) type = 'viewed';

    this.receiptHandler({
      senderId,
      timestamps: receipt.timestamps ?? [],
      type,
    }).catch((error) => {
      logger.error({ error }, 'Error handling Signal receipt');
    });
  }

  private handleTypingMessage(typing: SignalTypingMessage, senderId: string): void {
    if (!this.typingHandler) return;

    this.typingHandler({
      senderId,
      groupId: typing.groupId,
      isTyping: typing.action === 'STARTED',
    }).catch((error) => {
      logger.error({ error }, 'Error handling Signal typing indicator');
    });
  }

  // ============================================================================
  // Sending Messages
  // ============================================================================

  async send(
    channelId: string,
    content: string,
    options?: SendOptions & {
      attachments?: string[];
      quote?: { timestamp: number; author: string };
      mentions?: Array<{ start: number; length: number; uuid: string }>;
      expiresInSeconds?: number;
      viewOnce?: boolean;
    }
  ): Promise<void> {
    // Check rate limit
    const rateLimitResult = this.rateLimiter.consume('signal:send');
    if (!rateLimitResult.allowed) {
      throw new Error(`Rate limited: retry in ${rateLimitResult.retryAfterMs}ms`);
    }

    const sanitized = this.sanitizeOutgoing(content);

    if (this.config.daemonMode) {
      await this.sendViaDaemon(channelId, sanitized, options);
    } else {
      await this.sendViaCommand(channelId, sanitized, options);
    }

    logger.debug({ channelId }, 'Signal message sent');

    auditLogger.log({
      eventId: `${Date.now()}`,
      timestamp: Date.now(),
      eventType: 'channel',
      severity: 'info',
      actor: { userId: 'system' },
      resource: { type: 'signal_message', id: channelId },
      action: 'send',
      outcome: 'success',
      details: { channelId, contentLength: sanitized.length },
    });
  }

  private async sendViaDaemon(
    channelId: string,
    content: string,
    options?: SendOptions & {
      attachments?: string[];
      quote?: { timestamp: number; author: string };
      mentions?: Array<{ start: number; length: number; uuid: string }>;
      expiresInSeconds?: number;
      viewOnce?: boolean;
    }
  ): Promise<void> {
    const isGroup = channelId.startsWith('group:') || channelId.length > 20;
    const params: Record<string, unknown> = {
      account: this.config.phoneNumber,
      message: content,
    };

    if (isGroup) {
      params.groupId = channelId.replace('group:', '');
    } else {
      params.recipient = [channelId];
    }

    if (options?.attachments?.length) {
      params.attachments = options.attachments;
    }

    if (options?.quote) {
      params.quoteTimestamp = options.quote.timestamp;
      params.quoteAuthor = options.quote.author;
    }

    if (options?.mentions?.length) {
      params.mentions = options.mentions.map((m) => `${m.start}:${m.length}:${m.uuid}`);
    }

    if (options?.expiresInSeconds) {
      params.expiresInSeconds = options.expiresInSeconds;
    }

    if (options?.viewOnce) {
      params.viewOnce = true;
    }

    await this.sendRpcRequest('send', params);
  }

  private async sendViaCommand(
    channelId: string,
    content: string,
    options?: SendOptions & {
      attachments?: string[];
      quote?: { timestamp: number; author: string };
      expiresInSeconds?: number;
    }
  ): Promise<void> {
    const isGroup = channelId.startsWith('group:') || channelId.length > 20;
    const args = ['send'];

    if (isGroup) {
      args.push('-g', channelId.replace('group:', ''));
    } else {
      args.push(channelId);
    }

    args.push('-m', content);

    if (options?.attachments?.length) {
      for (const attachment of options.attachments) {
        args.push('-a', attachment);
      }
    }

    if (options?.expiresInSeconds) {
      args.push('-e', options.expiresInSeconds.toString());
    }

    await this.executeCommand(args);
  }

  async sendReaction(
    channelId: string,
    targetTimestamp: number,
    targetAuthor: string,
    emoji: string,
    remove = false
  ): Promise<void> {
    if (this.config.daemonMode) {
      await this.sendRpcRequest('sendReaction', {
        account: this.config.phoneNumber,
        recipient: channelId.startsWith('group:') ? undefined : [channelId],
        groupId: channelId.startsWith('group:') ? channelId.replace('group:', '') : undefined,
        emoji,
        targetAuthor,
        targetTimestamp,
        remove,
      });
    } else {
      const args = ['sendReaction'];
      if (channelId.startsWith('group:')) {
        args.push('-g', channelId.replace('group:', ''));
      } else {
        args.push(channelId);
      }
      args.push('-e', emoji, '-a', targetAuthor, '-t', targetTimestamp.toString());
      if (remove) {
        args.push('-r');
      }
      await this.executeCommand(args);
    }
  }

  async sendTyping(channelId: string, stop = false): Promise<void> {
    if (this.config.daemonMode) {
      await this.sendRpcRequest('sendTyping', {
        account: this.config.phoneNumber,
        recipient: channelId.startsWith('group:') ? undefined : [channelId],
        groupId: channelId.startsWith('group:') ? channelId.replace('group:', '') : undefined,
        stop,
      });
    }
    // Command mode doesn't support typing indicators
  }

  async markRead(channelId: string, timestamps: number[]): Promise<void> {
    if (this.config.daemonMode) {
      await this.sendRpcRequest('sendReceipt', {
        account: this.config.phoneNumber,
        recipient: [channelId],
        type: 'read',
        targetTimestamp: timestamps,
      });
    } else {
      const args = ['sendReceipt', '-t', 'read', channelId];
      for (const ts of timestamps) {
        args.push('--target-timestamp', ts.toString());
      }
      await this.executeCommand(args);
    }
  }

  // ============================================================================
  // Group Management
  // ============================================================================

  async createGroup(name: string, members: string[]): Promise<string> {
    if (this.config.daemonMode) {
      const result = await this.sendRpcRequest('updateGroup', {
        account: this.config.phoneNumber,
        name,
        members,
      }) as { groupId: string };
      return result.groupId;
    } else {
      const args = ['updateGroup', '-n', name];
      for (const member of members) {
        args.push('-m', member);
      }
      const output = await this.executeCommand(args);
      const match = output.match(/Created group "([^"]+)"/);
      return match?.[1] ?? '';
    }
  }

  async updateGroup(
    groupId: string,
    options: {
      name?: string;
      description?: string;
      avatar?: string;
      addMembers?: string[];
      removeMembers?: string[];
      addAdmins?: string[];
      removeAdmins?: string[];
    }
  ): Promise<void> {
    if (this.config.daemonMode) {
      await this.sendRpcRequest('updateGroup', {
        account: this.config.phoneNumber,
        groupId,
        ...options,
      });
    } else {
      const args = ['updateGroup', '-g', groupId];
      if (options.name) args.push('-n', options.name);
      if (options.description) args.push('-d', options.description);
      if (options.avatar) args.push('--avatar', options.avatar);
      if (options.addMembers) {
        for (const m of options.addMembers) args.push('-m', m);
      }
      if (options.removeMembers) {
        for (const m of options.removeMembers) args.push('--remove-member', m);
      }
      if (options.addAdmins) {
        for (const a of options.addAdmins) args.push('--admin', a);
      }
      if (options.removeAdmins) {
        for (const a of options.removeAdmins) args.push('--remove-admin', a);
      }
      await this.executeCommand(args);
    }
  }

  async leaveGroup(groupId: string): Promise<void> {
    if (this.config.daemonMode) {
      await this.sendRpcRequest('quitGroup', {
        account: this.config.phoneNumber,
        groupId,
      });
    } else {
      await this.executeCommand(['quitGroup', '-g', groupId]);
    }
  }

  async listGroups(): Promise<Array<{ id: string; name: string; members: string[] }>> {
    if (this.config.daemonMode) {
      const result = await this.sendRpcRequest('listGroups', {
        account: this.config.phoneNumber,
      }) as Array<{ id: string; name: string; members: string[] }>;
      return result;
    } else {
      const output = await this.executeCommand(['listGroups', '-d']);
      try {
        return JSON.parse(output);
      } catch {
        return [];
      }
    }
  }

  // ============================================================================
  // Contact Management
  // ============================================================================

  async setContactName(number: string, name: string): Promise<void> {
    if (this.config.daemonMode) {
      await this.sendRpcRequest('updateContact', {
        account: this.config.phoneNumber,
        recipient: number,
        name,
      });
    } else {
      await this.executeCommand(['updateContact', number, '-n', name]);
    }
  }

  async listContacts(): Promise<Array<{ number: string; uuid?: string; name?: string }>> {
    if (this.config.daemonMode) {
      const result = await this.sendRpcRequest('listContacts', {
        account: this.config.phoneNumber,
      }) as Array<{ number: string; uuid?: string; name?: string }>;
      return result;
    } else {
      const output = await this.executeCommand(['listContacts']);
      try {
        return JSON.parse(output);
      } catch {
        return [];
      }
    }
  }

  async trustIdentity(number: string, trustLevel: 'always' | 'verified'): Promise<void> {
    if (this.config.daemonMode) {
      await this.sendRpcRequest('trust', {
        account: this.config.phoneNumber,
        recipient: number,
        trustAllKnownKeys: trustLevel === 'always',
      });
    } else {
      const args = ['trust', number];
      if (trustLevel === 'always') {
        args.push('-a');
      } else {
        args.push('-v');
      }
      await this.executeCommand(args);
    }
  }

  // ============================================================================
  // Registration / Linking
  // ============================================================================

  async register(captcha?: string): Promise<void> {
    const args = ['register'];
    if (captcha) {
      args.push('--captcha', captcha);
    }
    await this.executeCommand(args);
    logger.info({ phoneNumber: this.config.phoneNumber }, 'Signal registration initiated');
  }

  async verify(code: string): Promise<void> {
    await this.executeCommand(['verify', code]);
    logger.info({ phoneNumber: this.config.phoneNumber }, 'Signal phone number verified');
  }

  async link(deviceName: string): Promise<string> {
    // This returns a URI that should be displayed as a QR code
    const output = await this.executeCommand(['link', '-n', deviceName]);
    const match = output.match(/sgnl:\/\/[^\s]+/);
    return match?.[0] ?? '';
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  onMessage(handler: (message: Message) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onReaction(handler: (reaction: {
    emoji: string;
    targetMessageTimestamp: number;
    senderId: string;
    isRemove: boolean;
  }) => Promise<void>): void {
    this.reactionHandler = handler;
  }

  onTyping(handler: (typing: {
    senderId: string;
    groupId?: string;
    isTyping: boolean;
  }) => Promise<void>): void {
    this.typingHandler = handler;
  }

  onReceipt(handler: (receipt: {
    senderId: string;
    timestamps: number[];
    type: 'delivery' | 'read' | 'viewed';
  }) => Promise<void>): void {
    this.receiptHandler = handler;
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getPhoneNumber(): string {
    return this.config.phoneNumber;
  }
}

// Export types
export type {
  SignalEnvelope,
  SignalDataMessage,
  SignalAttachment,
  SignalReaction,
  SignalGroupInfo,
};
