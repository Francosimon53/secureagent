import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { existsSync, watch, FSWatcher } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { BaseChannel, Message, SendOptions } from '../base.js';
import { getLogger, getAuditLogger } from '../../observability/logger.js';
import { RateLimiter } from '../../security/guardrails/rate-limiter.js';

const execAsync = promisify(exec);
const logger = getLogger().child({ module: 'IMessageChannel' });
const auditLogger = getAuditLogger();

// ============================================================================
// iMessage Types
// ============================================================================

export interface IMessageConfig {
  // Path to Messages database (default: ~/Library/Messages/chat.db)
  databasePath?: string;

  // Polling interval in ms for checking new messages (default: 2000)
  pollingIntervalMs?: number;

  // Use file watcher instead of polling (more efficient but may miss messages)
  useFileWatcher?: boolean;

  // Rate limiting
  rateLimit?: {
    messagesPerMinute?: number;
  };

  // Enable debug mode
  debug?: boolean;
}

interface IMessageRecord {
  ROWID: number;
  guid: string;
  text: string | null;
  handle_id: number;
  service: string;
  date: number;
  date_read: number | null;
  date_delivered: number | null;
  is_from_me: number;
  is_read: number;
  is_delivered: number;
  is_sent: number;
  has_attachment: number;
  cache_has_attachments: number;
  item_type: number;
  group_title: string | null;
  group_action_type: number;
  associated_message_guid: string | null;
  associated_message_type: number;
  balloon_bundle_id: string | null;
  expressive_send_style_id: string | null;
  thread_originator_guid: string | null;
  thread_originator_part: string | null;
  reply_to_guid: string | null;
}

interface IMessageHandle {
  ROWID: number;
  id: string;  // Phone number or email
  service: string;
  uncanonicalized_id: string | null;
  person_centric_id: string | null;
}

interface IMessageChat {
  ROWID: number;
  guid: string;
  chat_identifier: string;
  service_name: string;
  room_name: string | null;
  display_name: string | null;
  group_id: string | null;
  is_archived: number;
  last_read_message_timestamp: number;
}

interface IMessageAttachment {
  ROWID: number;
  guid: string;
  created_date: number;
  filename: string;
  uti: string;
  mime_type: string | null;
  transfer_state: number;
  is_outgoing: number;
  total_bytes: number;
}

interface ParsedMessage {
  id: string;
  guid: string;
  chatId: string;
  senderId: string;
  senderService: string;
  content: string;
  timestamp: number;
  isFromMe: boolean;
  isRead: boolean;
  isDelivered: boolean;
  hasAttachment: boolean;
  attachments: IMessageAttachment[];
  replyToGuid?: string;
  threadOriginatorGuid?: string;
  expressiveStyle?: string;
  groupTitle?: string;
  tapback?: {
    type: number;
    targetGuid: string;
  };
}

// Tapback types
const TapbackType = {
  LOVE: 2000,
  LIKE: 2001,
  DISLIKE: 2002,
  LAUGH: 2003,
  EMPHASIS: 2004,
  QUESTION: 2005,
  REMOVE_LOVE: 3000,
  REMOVE_LIKE: 3001,
  REMOVE_DISLIKE: 3002,
  REMOVE_LAUGH: 3003,
  REMOVE_EMPHASIS: 3004,
  REMOVE_QUESTION: 3005,
} as const;

const TapbackEmoji: Record<number, string> = {
  [TapbackType.LOVE]: '❤️',
  [TapbackType.LIKE]: '👍',
  [TapbackType.DISLIKE]: '👎',
  [TapbackType.LAUGH]: '😂',
  [TapbackType.EMPHASIS]: '‼️',
  [TapbackType.QUESTION]: '❓',
};

// ============================================================================
// iMessage Channel Implementation
// ============================================================================

export class IMessageChannel extends BaseChannel {
  private readonly config: {
    databasePath: string;
    pollingIntervalMs: number;
    useFileWatcher: boolean;
    rateLimit: { messagesPerMinute: number };
    debug: boolean;
  };

  private messageHandler?: (message: Message) => Promise<void>;
  private tapbackHandler?: (tapback: {
    emoji: string;
    targetGuid: string;
    senderId: string;
    isRemove: boolean;
  }) => Promise<void>;

  private readonly rateLimiter: RateLimiter;
  private pollingInterval: NodeJS.Timeout | null = null;
  private fileWatcher: FSWatcher | null = null;
  private lastProcessedRowId = 0;
  private processedGuids = new Set<string>();
  private chatCache = new Map<number, IMessageChat>();
  private handleCache = new Map<number, IMessageHandle>();

  constructor(config: IMessageConfig = {}) {
    super('imessage');

    const defaultDbPath = join(homedir(), 'Library', 'Messages', 'chat.db');

    this.config = {
      databasePath: config.databasePath ?? defaultDbPath,
      pollingIntervalMs: config.pollingIntervalMs ?? 2000,
      useFileWatcher: config.useFileWatcher ?? false,
      rateLimit: {
        messagesPerMinute: config.rateLimit?.messagesPerMinute ?? 30,
      },
      debug: config.debug ?? false,
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
    // Verify we're on macOS
    if (process.platform !== 'darwin') {
      throw new Error('iMessage channel is only available on macOS');
    }

    // Check if database exists
    if (!existsSync(this.config.databasePath)) {
      throw new Error(`iMessage database not found at ${this.config.databasePath}`);
    }

    // Check for Full Disk Access
    try {
      await this.queryDatabase('SELECT 1 FROM message LIMIT 1');
    } catch (error) {
      if (String(error).includes('database is locked') || String(error).includes('unable to open')) {
        throw new Error(
          'Cannot access iMessage database. Please grant Full Disk Access to your terminal/application in System Preferences > Security & Privacy > Privacy > Full Disk Access'
        );
      }
      throw error;
    }

    // Get the latest message ROWID to start from
    try {
      const result = await this.queryDatabase<{ max_id: number }>(
        'SELECT MAX(ROWID) as max_id FROM message'
      );
      this.lastProcessedRowId = result[0]?.max_id ?? 0;
    } catch {
      this.lastProcessedRowId = 0;
    }

    // Start watching for new messages
    if (this.config.useFileWatcher) {
      this.startFileWatcher();
    } else {
      this.startPolling();
    }

    this.setConnected(true);
    logger.info({ databasePath: this.config.databasePath }, 'iMessage channel connected');
  }

  async disconnect(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }

    this.setConnected(false);
    logger.info('iMessage channel disconnected');
  }

  // ============================================================================
  // Message Watching
  // ============================================================================

  private startPolling(): void {
    this.pollingInterval = setInterval(async () => {
      try {
        await this.checkNewMessages();
      } catch (error) {
        logger.error({ error }, 'Error checking for new iMessages');
      }
    }, this.config.pollingIntervalMs);

    logger.debug({ intervalMs: this.config.pollingIntervalMs }, 'Started iMessage polling');
  }

  private startFileWatcher(): void {
    const dbDir = join(this.config.databasePath, '..');

    this.fileWatcher = watch(dbDir, { persistent: true }, async (eventType, filename) => {
      if (filename === 'chat.db' || filename === 'chat.db-wal') {
        try {
          await this.checkNewMessages();
        } catch (error) {
          logger.error({ error }, 'Error checking for new iMessages after file change');
        }
      }
    });

    logger.debug('Started iMessage file watcher');
  }

  private async checkNewMessages(): Promise<void> {
    const messages = await this.queryDatabase<IMessageRecord>(`
      SELECT
        m.ROWID,
        m.guid,
        m.text,
        m.handle_id,
        m.service,
        m.date,
        m.date_read,
        m.date_delivered,
        m.is_from_me,
        m.is_read,
        m.is_delivered,
        m.is_sent,
        m.cache_has_attachments as has_attachment,
        m.item_type,
        m.group_title,
        m.group_action_type,
        m.associated_message_guid,
        m.associated_message_type,
        m.balloon_bundle_id,
        m.expressive_send_style_id,
        m.thread_originator_guid,
        m.thread_originator_part,
        m.reply_to_guid
      FROM message m
      WHERE m.ROWID > ${this.lastProcessedRowId}
        AND m.is_from_me = 0
      ORDER BY m.ROWID ASC
      LIMIT 100
    `);

    for (const msg of messages) {
      // Skip already processed messages
      if (this.processedGuids.has(msg.guid)) continue;
      this.processedGuids.add(msg.guid);

      // Update last processed ROWID
      if (msg.ROWID > this.lastProcessedRowId) {
        this.lastProcessedRowId = msg.ROWID;
      }

      // Limit processed GUIDs cache size
      if (this.processedGuids.size > 10000) {
        const guids = Array.from(this.processedGuids);
        for (let i = 0; i < 5000; i++) {
          this.processedGuids.delete(guids[i]);
        }
      }

      await this.handleIncomingMessage(msg);
    }
  }

  private async handleIncomingMessage(record: IMessageRecord): Promise<void> {
    // Handle tapback (reaction)
    if (record.associated_message_guid && record.associated_message_type >= 2000) {
      await this.handleTapback(record);
      return;
    }

    // Skip empty messages and system messages
    if (!record.text && !record.has_attachment) return;
    if (record.item_type !== 0) return;

    // Get sender info
    const handle = await this.getHandle(record.handle_id);
    if (!handle) {
      logger.warn({ handleId: record.handle_id }, 'Could not find handle for message');
      return;
    }

    // Get chat info
    const chat = await this.getChatForMessage(record.ROWID);
    const chatId = chat?.chat_identifier ?? handle.id;

    // Get attachments if any
    let attachments: IMessageAttachment[] = [];
    if (record.has_attachment) {
      attachments = await this.getAttachments(record.ROWID);
    }

    // Build message
    let content = record.text ?? '';
    if (!content && attachments.length > 0) {
      content = `[${attachments.length} attachment(s)]`;
    }

    const metadata: Record<string, unknown> = {
      guid: record.guid,
      service: record.service,
      isRead: record.is_read === 1,
      isDelivered: record.is_delivered === 1,
    };

    if (attachments.length > 0) {
      metadata.attachments = attachments.map((a) => ({
        id: a.guid,
        filename: a.filename,
        mimeType: a.mime_type ?? a.uti,
        size: a.total_bytes,
      }));
    }

    if (record.reply_to_guid) {
      metadata.replyToGuid = record.reply_to_guid;
    }

    if (record.thread_originator_guid) {
      metadata.threadOriginatorGuid = record.thread_originator_guid;
    }

    if (record.expressive_send_style_id) {
      metadata.expressiveStyle = record.expressive_send_style_id;
    }

    if (chat?.display_name || record.group_title) {
      metadata.groupName = chat?.display_name ?? record.group_title;
      metadata.isGroup = true;
    }

    const message: Message = {
      id: record.guid,
      channelId: chatId,
      senderId: handle.id,
      content,
      timestamp: this.cocoaToUnixTimestamp(record.date),
      metadata,
    };

    if (this.messageHandler) {
      const sanitized = this.sanitizeIncoming(message);
      try {
        await this.messageHandler(sanitized);
      } catch (error) {
        logger.error({ error, messageId: message.id }, 'Error handling iMessage');
      }
    }

    auditLogger.log({
      eventId: message.id,
      timestamp: Date.now(),
      eventType: 'channel',
      severity: 'info',
      actor: { userId: handle.id },
      resource: { type: 'imessage_message', id: message.id },
      action: 'receive',
      outcome: 'success',
      details: { chatId, hasAttachment: attachments.length > 0 },
    });
  }

  private async handleTapback(record: IMessageRecord): Promise<void> {
    if (!this.tapbackHandler || !record.associated_message_guid) return;

    const handle = await this.getHandle(record.handle_id);
    if (!handle) return;

    const isRemove = record.associated_message_type >= 3000;
    const typeBase = isRemove ? record.associated_message_type - 1000 : record.associated_message_type;
    const emoji = TapbackEmoji[typeBase] ?? '?';

    try {
      await this.tapbackHandler({
        emoji,
        targetGuid: record.associated_message_guid.replace('p:0/', '').replace('bp:', ''),
        senderId: handle.id,
        isRemove,
      });
    } catch (error) {
      logger.error({ error }, 'Error handling iMessage tapback');
    }
  }

  // ============================================================================
  // Sending Messages
  // ============================================================================

  async send(
    channelId: string,
    content: string,
    options?: SendOptions & {
      service?: 'iMessage' | 'SMS';
      attachmentPath?: string;
    }
  ): Promise<void> {
    // Check rate limit
    const rateLimitResult = this.rateLimiter.consume('imessage:send');
    if (!rateLimitResult.allowed) {
      throw new Error(`Rate limited: retry in ${rateLimitResult.retryAfterMs}ms`);
    }

    const sanitized = this.sanitizeOutgoing(content);
    const service = options?.service ?? 'iMessage';

    // Use AppleScript to send message
    const script = this.buildSendScript(channelId, sanitized, service, options?.attachmentPath);

    try {
      await this.runAppleScript(script);

      logger.debug({ channelId, service }, 'iMessage sent');

      auditLogger.log({
        eventId: `${Date.now()}`,
        timestamp: Date.now(),
        eventType: 'channel',
        severity: 'info',
        actor: { userId: 'system' },
        resource: { type: 'imessage_message', id: channelId },
        action: 'send',
        outcome: 'success',
        details: { channelId, service, contentLength: sanitized.length },
      });
    } catch (error) {
      logger.error({ error, channelId }, 'Failed to send iMessage');
      throw error;
    }
  }

  private buildSendScript(
    recipient: string,
    text: string,
    service: 'iMessage' | 'SMS',
    attachmentPath?: string
  ): string {
    // Escape special characters for AppleScript
    const escapedText = text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
    const escapedRecipient = recipient.replace(/"/g, '\\"');

    let script = `
      tell application "Messages"
        set targetService to 1st service whose service type = ${service === 'iMessage' ? 'iMessage' : 'SMS'}
        set targetBuddy to buddy "${escapedRecipient}" of targetService
        send "${escapedText}" to targetBuddy
    `;

    if (attachmentPath) {
      const escapedPath = attachmentPath.replace(/"/g, '\\"');
      script += `
        set theAttachment to POSIX file "${escapedPath}"
        send theAttachment to targetBuddy
      `;
    }

    script += `
      end tell
    `;

    return script;
  }

  async sendToGroup(
    groupChatId: string,
    content: string,
    options?: { attachmentPath?: string }
  ): Promise<void> {
    const rateLimitResult = this.rateLimiter.consume('imessage:send');
    if (!rateLimitResult.allowed) {
      throw new Error(`Rate limited: retry in ${rateLimitResult.retryAfterMs}ms`);
    }

    const sanitized = this.sanitizeOutgoing(content);
    const escapedText = sanitized
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
    const escapedChatId = groupChatId.replace(/"/g, '\\"');

    let script = `
      tell application "Messages"
        set targetChat to chat id "${escapedChatId}"
        send "${escapedText}" to targetChat
    `;

    if (options?.attachmentPath) {
      const escapedPath = options.attachmentPath.replace(/"/g, '\\"');
      script += `
        set theAttachment to POSIX file "${escapedPath}"
        send theAttachment to targetChat
      `;
    }

    script += `
      end tell
    `;

    try {
      await this.runAppleScript(script);
      logger.debug({ groupChatId }, 'iMessage sent to group');
    } catch (error) {
      logger.error({ error, groupChatId }, 'Failed to send iMessage to group');
      throw error;
    }
  }

  async sendTapback(
    chatId: string,
    messageGuid: string,
    tapbackType: keyof typeof TapbackType
  ): Promise<void> {
    // Unfortunately, AppleScript doesn't support sending tapbacks
    // This would require using private APIs or Shortcuts
    logger.warn('Sending tapbacks is not supported via AppleScript');
    throw new Error('Tapback sending is not supported');
  }

  // ============================================================================
  // Database Queries
  // ============================================================================

  private async queryDatabase<T>(query: string): Promise<T[]> {
    // Use sqlite3 command-line tool to query the database
    // We use -json output format for easier parsing
    const escapedQuery = query.replace(/"/g, '\\"');

    try {
      const { stdout } = await execAsync(
        `sqlite3 -json "${this.config.databasePath}" "${escapedQuery}"`,
        { maxBuffer: 10 * 1024 * 1024 }
      );

      if (!stdout.trim()) {
        return [];
      }

      return JSON.parse(stdout) as T[];
    } catch (error) {
      // Try without -json flag (older sqlite3 versions)
      const { stdout } = await execAsync(
        `sqlite3 -header -separator '|' "${this.config.databasePath}" "${escapedQuery}"`,
        { maxBuffer: 10 * 1024 * 1024 }
      );

      return this.parseSqliteOutput<T>(stdout);
    }
  }

  private parseSqliteOutput<T>(output: string): T[] {
    const lines = output.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split('|');
    const results: T[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('|');
      const row: Record<string, unknown> = {};

      for (let j = 0; j < headers.length; j++) {
        const value = values[j];
        // Try to parse as number
        const num = Number(value);
        row[headers[j]] = isNaN(num) ? value : num;
      }

      results.push(row as T);
    }

    return results;
  }

  private async getHandle(handleId: number): Promise<IMessageHandle | null> {
    // Check cache first
    if (this.handleCache.has(handleId)) {
      return this.handleCache.get(handleId)!;
    }

    const handles = await this.queryDatabase<IMessageHandle>(`
      SELECT ROWID, id, service, uncanonicalized_id, person_centric_id
      FROM handle
      WHERE ROWID = ${handleId}
    `);

    if (handles.length > 0) {
      this.handleCache.set(handleId, handles[0]);
      return handles[0];
    }

    return null;
  }

  private async getChatForMessage(messageRowId: number): Promise<IMessageChat | null> {
    const chats = await this.queryDatabase<IMessageChat>(`
      SELECT c.ROWID, c.guid, c.chat_identifier, c.service_name, c.room_name,
             c.display_name, c.group_id, c.is_archived, c.last_read_message_timestamp
      FROM chat c
      JOIN chat_message_join cmj ON cmj.chat_id = c.ROWID
      WHERE cmj.message_id = ${messageRowId}
    `);

    return chats[0] ?? null;
  }

  private async getAttachments(messageRowId: number): Promise<IMessageAttachment[]> {
    return this.queryDatabase<IMessageAttachment>(`
      SELECT a.ROWID, a.guid, a.created_date, a.filename, a.uti,
             a.mime_type, a.transfer_state, a.is_outgoing, a.total_bytes
      FROM attachment a
      JOIN message_attachment_join maj ON maj.attachment_id = a.ROWID
      WHERE maj.message_id = ${messageRowId}
    `);
  }

  // ============================================================================
  // Chat Management
  // ============================================================================

  async listChats(limit = 50): Promise<Array<{
    id: string;
    displayName: string | null;
    identifier: string;
    isGroup: boolean;
    lastMessageTimestamp: number;
  }>> {
    const chats = await this.queryDatabase<IMessageChat & { last_message_date: number }>(`
      SELECT c.ROWID, c.guid, c.chat_identifier, c.service_name, c.room_name,
             c.display_name, c.group_id, c.is_archived, c.last_read_message_timestamp,
             MAX(m.date) as last_message_date
      FROM chat c
      LEFT JOIN chat_message_join cmj ON cmj.chat_id = c.ROWID
      LEFT JOIN message m ON m.ROWID = cmj.message_id
      WHERE c.is_archived = 0
      GROUP BY c.ROWID
      ORDER BY last_message_date DESC
      LIMIT ${limit}
    `);

    return chats.map((c) => ({
      id: c.guid,
      displayName: c.display_name,
      identifier: c.chat_identifier,
      isGroup: c.room_name !== null || c.chat_identifier.includes('chat'),
      lastMessageTimestamp: this.cocoaToUnixTimestamp(c.last_message_date ?? 0),
    }));
  }

  async getChatHistory(
    chatIdentifier: string,
    options?: { limit?: number; beforeTimestamp?: number }
  ): Promise<ParsedMessage[]> {
    const limit = options?.limit ?? 50;
    let whereClause = '';

    if (options?.beforeTimestamp) {
      const cocoaTime = this.unixToCocoaTimestamp(options.beforeTimestamp);
      whereClause = `AND m.date < ${cocoaTime}`;
    }

    const messages = await this.queryDatabase<IMessageRecord & { handle_id_str: string }>(`
      SELECT
        m.ROWID,
        m.guid,
        m.text,
        m.handle_id,
        h.id as handle_id_str,
        m.service,
        m.date,
        m.date_read,
        m.date_delivered,
        m.is_from_me,
        m.is_read,
        m.is_delivered,
        m.is_sent,
        m.cache_has_attachments as has_attachment,
        m.item_type,
        m.group_title,
        m.group_action_type,
        m.associated_message_guid,
        m.associated_message_type,
        m.balloon_bundle_id,
        m.expressive_send_style_id,
        m.thread_originator_guid,
        m.thread_originator_part,
        m.reply_to_guid
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat c ON c.ROWID = cmj.chat_id
      LEFT JOIN handle h ON h.ROWID = m.handle_id
      WHERE c.chat_identifier = '${chatIdentifier.replace(/'/g, "''")}'
        AND m.item_type = 0
        ${whereClause}
      ORDER BY m.date DESC
      LIMIT ${limit}
    `);

    return messages.map((m) => ({
      id: String(m.ROWID),
      guid: m.guid,
      chatId: chatIdentifier,
      senderId: m.is_from_me ? 'me' : (m.handle_id_str ?? String(m.handle_id)),
      senderService: m.service,
      content: m.text ?? '',
      timestamp: this.cocoaToUnixTimestamp(m.date),
      isFromMe: m.is_from_me === 1,
      isRead: m.is_read === 1,
      isDelivered: m.is_delivered === 1,
      hasAttachment: m.has_attachment === 1,
      attachments: [],
      replyToGuid: m.reply_to_guid ?? undefined,
      threadOriginatorGuid: m.thread_originator_guid ?? undefined,
      expressiveStyle: m.expressive_send_style_id ?? undefined,
      groupTitle: m.group_title ?? undefined,
    })).reverse();
  }

  async getRecentContacts(limit = 20): Promise<Array<{
    id: string;
    service: string;
    lastMessageTimestamp: number;
  }>> {
    const contacts = await this.queryDatabase<{
      id: string;
      service: string;
      last_date: number;
    }>(`
      SELECT h.id, h.service, MAX(m.date) as last_date
      FROM handle h
      JOIN message m ON m.handle_id = h.ROWID
      WHERE m.is_from_me = 0
      GROUP BY h.id, h.service
      ORDER BY last_date DESC
      LIMIT ${limit}
    `);

    return contacts.map((c) => ({
      id: c.id,
      service: c.service,
      lastMessageTimestamp: this.cocoaToUnixTimestamp(c.last_date),
    }));
  }

  // ============================================================================
  // AppleScript Helpers
  // ============================================================================

  private async runAppleScript(script: string): Promise<string> {
    const escapedScript = script.replace(/'/g, "'\\''");
    const { stdout } = await execAsync(`osascript -e '${escapedScript}'`);
    return stdout.trim();
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private cocoaToUnixTimestamp(cocoaTime: number): number {
    // macOS uses Cocoa time (nanoseconds since 2001-01-01)
    // Unix time is milliseconds since 1970-01-01
    // Difference is 978307200 seconds
    if (cocoaTime === 0) return 0;

    // Check if it's in nanoseconds (post-Sierra) or seconds (pre-Sierra)
    if (cocoaTime > 1000000000000000) {
      // Nanoseconds
      return Math.floor(cocoaTime / 1000000) + 978307200000;
    } else if (cocoaTime > 1000000000) {
      // Seconds (legacy)
      return cocoaTime * 1000 + 978307200000;
    }

    return cocoaTime + 978307200000;
  }

  private unixToCocoaTimestamp(unixTime: number): number {
    // Convert Unix milliseconds to Cocoa nanoseconds
    return (unixTime - 978307200000) * 1000000;
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  onMessage(handler: (message: Message) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onTapback(handler: (tapback: {
    emoji: string;
    targetGuid: string;
    senderId: string;
    isRemove: boolean;
  }) => Promise<void>): void {
    this.tapbackHandler = handler;
  }

  // ============================================================================
  // Static Utilities
  // ============================================================================

  static isAvailable(): boolean {
    if (process.platform !== 'darwin') return false;

    try {
      // Check if Messages.app exists
      execSync('test -d "/Applications/Messages.app"');
      return true;
    } catch {
      return false;
    }
  }

  static async checkPermissions(): Promise<{
    hasFullDiskAccess: boolean;
    hasAutomationAccess: boolean;
  }> {
    const result = {
      hasFullDiskAccess: false,
      hasAutomationAccess: false,
    };

    // Check Full Disk Access by trying to read the Messages database
    const dbPath = join(homedir(), 'Library', 'Messages', 'chat.db');
    try {
      execSync(`sqlite3 "${dbPath}" "SELECT 1 FROM message LIMIT 1"`, { stdio: 'pipe' });
      result.hasFullDiskAccess = true;
    } catch {
      result.hasFullDiskAccess = false;
    }

    // Check Automation access
    try {
      execSync(`osascript -e 'tell application "Messages" to name'`, { stdio: 'pipe' });
      result.hasAutomationAccess = true;
    } catch {
      result.hasAutomationAccess = false;
    }

    return result;
  }
}

// Export types and constants
export { TapbackType, TapbackEmoji };
export type {
  IMessageRecord,
  IMessageHandle,
  IMessageChat,
  IMessageAttachment,
  ParsedMessage,
};
