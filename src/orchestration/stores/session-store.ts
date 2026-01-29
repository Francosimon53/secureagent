/**
 * Session Store
 * Tracks collaboration sessions between agents
 */

import type {
  CollaborationSession,
  SessionStatus,
  AgentMessage,
  CommunicationChannel,
  ChannelStatus,
  SessionMetrics,
} from '../types.js';
import type { DatabaseAdapter } from '../../persistence/index.js';

/**
 * Session store interface
 */
export interface SessionStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  // Session operations
  /** Get a session by ID */
  getSession(id: string): Promise<CollaborationSession | null>;

  /** Get all sessions */
  getAllSessions(): Promise<CollaborationSession[]>;

  /** Get sessions by status */
  getSessionsByStatus(status: SessionStatus): Promise<CollaborationSession[]>;

  /** Get sessions for an agent */
  getSessionsForAgent(agentId: string): Promise<CollaborationSession[]>;

  /** Save a session */
  saveSession(session: CollaborationSession): Promise<void>;

  /** Update session status */
  updateSessionStatus(id: string, status: SessionStatus, result?: unknown, error?: string): Promise<void>;

  /** Add message to session history */
  addMessageToSession(sessionId: string, message: AgentMessage): Promise<void>;

  /** Update session shared context */
  updateSharedContext(sessionId: string, context: Record<string, unknown>): Promise<void>;

  /** Delete a session */
  deleteSession(id: string): Promise<boolean>;

  // Channel operations
  /** Get a channel by ID */
  getChannel(id: string): Promise<CommunicationChannel | null>;

  /** Get all channels */
  getAllChannels(): Promise<CommunicationChannel[]>;

  /** Get channels for a session */
  getChannelsForSession(sessionId: string): Promise<CommunicationChannel[]>;

  /** Save a channel */
  saveChannel(channel: CommunicationChannel): Promise<void>;

  /** Update channel status */
  updateChannelStatus(id: string, status: ChannelStatus): Promise<void>;

  /** Add participant to channel */
  addParticipant(channelId: string, agentId: string): Promise<void>;

  /** Remove participant from channel */
  removeParticipant(channelId: string, agentId: string): Promise<void>;

  /** Delete a channel */
  deleteChannel(id: string): Promise<boolean>;

  // Message operations
  /** Get messages for a channel */
  getMessagesForChannel(channelId: string, limit?: number): Promise<AgentMessage[]>;

  /** Save a message */
  saveMessage(message: AgentMessage): Promise<void>;

  /** Delete expired messages */
  deleteExpiredMessages(): Promise<number>;

  // Metrics
  /** Get session metrics */
  getSessionMetrics(sessionId: string): Promise<SessionMetrics | null>;
}

/**
 * In-memory session store implementation
 */
export class InMemorySessionStore implements SessionStore {
  private sessions: Map<string, CollaborationSession> = new Map();
  private channels: Map<string, CommunicationChannel> = new Map();
  private messages: Map<string, AgentMessage[]> = new Map();

  async initialize(): Promise<void> {
    // No initialization needed
  }

  // Session operations
  async getSession(id: string): Promise<CollaborationSession | null> {
    return this.sessions.get(id) || null;
  }

  async getAllSessions(): Promise<CollaborationSession[]> {
    return Array.from(this.sessions.values());
  }

  async getSessionsByStatus(status: SessionStatus): Promise<CollaborationSession[]> {
    return Array.from(this.sessions.values()).filter(s => s.status === status);
  }

  async getSessionsForAgent(agentId: string): Promise<CollaborationSession[]> {
    return Array.from(this.sessions.values()).filter(
      s => s.participantAgentIds.includes(agentId) || s.coordinatorAgentId === agentId
    );
  }

  async saveSession(session: CollaborationSession): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async updateSessionStatus(id: string, status: SessionStatus, result?: unknown, error?: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.status = status;
      session.updatedAt = Date.now();
      if (status === 'completed' || status === 'failed') {
        session.completedAt = Date.now();
      }
      if (result !== undefined) {
        session.result = result;
      }
      if (error !== undefined) {
        session.error = error;
      }
    }
  }

  async addMessageToSession(sessionId: string, message: AgentMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messageHistory.push(message);
      session.updatedAt = Date.now();
    }
  }

  async updateSharedContext(sessionId: string, context: Record<string, unknown>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.sharedContext = { ...session.sharedContext, ...context };
      session.updatedAt = Date.now();
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  // Channel operations
  async getChannel(id: string): Promise<CommunicationChannel | null> {
    return this.channels.get(id) || null;
  }

  async getAllChannels(): Promise<CommunicationChannel[]> {
    return Array.from(this.channels.values());
  }

  async getChannelsForSession(sessionId: string): Promise<CommunicationChannel[]> {
    return Array.from(this.channels.values()).filter(c => c.sessionId === sessionId);
  }

  async saveChannel(channel: CommunicationChannel): Promise<void> {
    this.channels.set(channel.id, { ...channel });
    if (!this.messages.has(channel.id)) {
      this.messages.set(channel.id, []);
    }
  }

  async updateChannelStatus(id: string, status: ChannelStatus): Promise<void> {
    const channel = this.channels.get(id);
    if (channel) {
      channel.status = status;
    }
  }

  async addParticipant(channelId: string, agentId: string): Promise<void> {
    const channel = this.channels.get(channelId);
    if (channel && !channel.participantIds.includes(agentId)) {
      channel.participantIds.push(agentId);
    }
  }

  async removeParticipant(channelId: string, agentId: string): Promise<void> {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.participantIds = channel.participantIds.filter(id => id !== agentId);
    }
  }

  async deleteChannel(id: string): Promise<boolean> {
    this.messages.delete(id);
    return this.channels.delete(id);
  }

  // Message operations
  async getMessagesForChannel(channelId: string, limit?: number): Promise<AgentMessage[]> {
    const messages = this.messages.get(channelId) || [];
    if (limit) {
      return messages.slice(-limit);
    }
    return [...messages];
  }

  async saveMessage(message: AgentMessage): Promise<void> {
    const messages = this.messages.get(message.channelId);
    if (messages) {
      messages.push(message);
    }

    // Update channel last message time
    const channel = this.channels.get(message.channelId);
    if (channel) {
      channel.lastMessageAt = message.timestamp;
    }
  }

  async deleteExpiredMessages(): Promise<number> {
    const now = Date.now();
    let count = 0;

    for (const [channelId, messages] of this.messages) {
      const before = messages.length;
      const filtered = messages.filter(m => !m.expiresAt || m.expiresAt > now);
      this.messages.set(channelId, filtered);
      count += before - filtered.length;
    }

    return count;
  }

  async getSessionMetrics(sessionId: string): Promise<SessionMetrics | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      sessionId,
      totalMessages: session.messageHistory.length,
      participantCount: session.participantAgentIds.length,
      durationMs: (session.completedAt || Date.now()) - session.createdAt,
      handoffsCompleted: session.messageHistory.filter(m => m.type === 'handoff').length,
      objectiveAchieved: session.status === 'completed',
    };
  }
}

/**
 * Database session store implementation
 */
export class DatabaseSessionStore implements SessionStore {
  constructor(private db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS orchestration_sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        participant_agent_ids TEXT NOT NULL DEFAULT '[]',
        coordinator_agent_id TEXT NOT NULL,
        objective TEXT NOT NULL,
        status TEXT NOT NULL,
        shared_context TEXT NOT NULL DEFAULT '{}',
        result TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS orchestration_channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        session_id TEXT,
        participant_ids TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        last_message_at INTEGER
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS orchestration_messages (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        from_agent_id TEXT NOT NULL,
        to_agent_id TEXT,
        channel_id TEXT NOT NULL,
        content TEXT NOT NULL,
        context TEXT DEFAULT '{}',
        priority TEXT NOT NULL,
        reply_to_message_id TEXT,
        timestamp INTEGER NOT NULL,
        expires_at INTEGER,
        FOREIGN KEY (channel_id) REFERENCES orchestration_channels(id) ON DELETE CASCADE
      )
    `);

    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_status ON orchestration_sessions(status)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_orchestration_channels_session ON orchestration_channels(session_id)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_orchestration_messages_channel ON orchestration_messages(channel_id)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_orchestration_messages_expires ON orchestration_messages(expires_at)`).catch(() => {});
  }

  private rowToSession(row: Record<string, unknown>): CollaborationSession {
    return {
      id: row.id as string,
      name: row.name as string,
      channelId: row.channel_id as string,
      participantAgentIds: JSON.parse(row.participant_agent_ids as string),
      coordinatorAgentId: row.coordinator_agent_id as string,
      objective: row.objective as string,
      status: row.status as SessionStatus,
      messageHistory: [], // Loaded separately
      sharedContext: JSON.parse(row.shared_context as string),
      result: row.result ? JSON.parse(row.result as string) : undefined,
      error: row.error as string | undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      completedAt: row.completed_at as number | undefined,
    };
  }

  private rowToChannel(row: Record<string, unknown>): CommunicationChannel {
    return {
      id: row.id as string,
      name: row.name as string,
      sessionId: row.session_id as string | undefined,
      participantIds: JSON.parse(row.participant_ids as string),
      status: row.status as ChannelStatus,
      metadata: JSON.parse(row.metadata as string),
      createdAt: row.created_at as number,
      lastMessageAt: row.last_message_at as number | undefined,
    };
  }

  private rowToMessage(row: Record<string, unknown>): AgentMessage {
    return {
      id: row.id as string,
      type: row.type as AgentMessage['type'],
      fromAgentId: row.from_agent_id as string,
      toAgentId: row.to_agent_id as string | undefined,
      channelId: row.channel_id as string,
      content: row.content as string,
      context: JSON.parse(row.context as string || '{}'),
      priority: row.priority as AgentMessage['priority'],
      replyToMessageId: row.reply_to_message_id as string | undefined,
      timestamp: row.timestamp as number,
      expiresAt: row.expires_at as number | undefined,
    };
  }

  // Session operations
  async getSession(id: string): Promise<CollaborationSession | null> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_sessions WHERE id = ?',
      [id]
    );
    if (!result.rows[0]) return null;

    const session = this.rowToSession(result.rows[0]);
    // Load message history
    const messages = await this.getMessagesForChannel(session.channelId);
    session.messageHistory = messages;
    return session;
  }

  async getAllSessions(): Promise<CollaborationSession[]> {
    const result = await this.db.query<Record<string, unknown>>('SELECT * FROM orchestration_sessions');
    return Promise.all(result.rows.map(async row => {
      const session = this.rowToSession(row);
      session.messageHistory = await this.getMessagesForChannel(session.channelId);
      return session;
    }));
  }

  async getSessionsByStatus(status: SessionStatus): Promise<CollaborationSession[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_sessions WHERE status = ?',
      [status]
    );
    return Promise.all(result.rows.map(async row => {
      const session = this.rowToSession(row);
      session.messageHistory = await this.getMessagesForChannel(session.channelId);
      return session;
    }));
  }

  async getSessionsForAgent(agentId: string): Promise<CollaborationSession[]> {
    const result = await this.db.query<Record<string, unknown>>('SELECT * FROM orchestration_sessions');
    const sessions = result.rows.map(row => this.rowToSession(row));
    const filtered = sessions.filter(
      s => s.participantAgentIds.includes(agentId) || s.coordinatorAgentId === agentId
    );
    return Promise.all(filtered.map(async session => {
      session.messageHistory = await this.getMessagesForChannel(session.channelId);
      return session;
    }));
  }

  async saveSession(session: CollaborationSession): Promise<void> {
    await this.db.query(
      `INSERT OR REPLACE INTO orchestration_sessions
       (id, name, channel_id, participant_agent_ids, coordinator_agent_id, objective, status, shared_context, result, error, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.name,
        session.channelId,
        JSON.stringify(session.participantAgentIds),
        session.coordinatorAgentId,
        session.objective,
        session.status,
        JSON.stringify(session.sharedContext),
        session.result ? JSON.stringify(session.result) : null,
        session.error || null,
        session.createdAt,
        session.updatedAt,
        session.completedAt || null,
      ]
    );
  }

  async updateSessionStatus(id: string, status: SessionStatus, result?: unknown, error?: string): Promise<void> {
    const now = Date.now();
    const completedAt = (status === 'completed' || status === 'failed') ? now : null;

    await this.db.query(
      `UPDATE orchestration_sessions SET status = ?, result = ?, error = ?, updated_at = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?`,
      [status, result ? JSON.stringify(result) : null, error || null, now, completedAt, id]
    );
  }

  async addMessageToSession(sessionId: string, message: AgentMessage): Promise<void> {
    await this.saveMessage(message);
    await this.db.query(
      `UPDATE orchestration_sessions SET updated_at = ? WHERE id = ?`,
      [Date.now(), sessionId]
    );
  }

  async updateSharedContext(sessionId: string, context: Record<string, unknown>): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      const newContext = { ...session.sharedContext, ...context };
      await this.db.query(
        `UPDATE orchestration_sessions SET shared_context = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(newContext), Date.now(), sessionId]
      );
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM orchestration_sessions WHERE id = ?',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Channel operations
  async getChannel(id: string): Promise<CommunicationChannel | null> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_channels WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.rowToChannel(result.rows[0]) : null;
  }

  async getAllChannels(): Promise<CommunicationChannel[]> {
    const result = await this.db.query<Record<string, unknown>>('SELECT * FROM orchestration_channels');
    return result.rows.map(row => this.rowToChannel(row));
  }

  async getChannelsForSession(sessionId: string): Promise<CommunicationChannel[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_channels WHERE session_id = ?',
      [sessionId]
    );
    return result.rows.map(row => this.rowToChannel(row));
  }

  async saveChannel(channel: CommunicationChannel): Promise<void> {
    await this.db.query(
      `INSERT OR REPLACE INTO orchestration_channels
       (id, name, session_id, participant_ids, status, metadata, created_at, last_message_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        channel.id,
        channel.name,
        channel.sessionId || null,
        JSON.stringify(channel.participantIds),
        channel.status,
        JSON.stringify(channel.metadata),
        channel.createdAt,
        channel.lastMessageAt || null,
      ]
    );
  }

  async updateChannelStatus(id: string, status: ChannelStatus): Promise<void> {
    await this.db.query(
      'UPDATE orchestration_channels SET status = ? WHERE id = ?',
      [status, id]
    );
  }

  async addParticipant(channelId: string, agentId: string): Promise<void> {
    const channel = await this.getChannel(channelId);
    if (channel && !channel.participantIds.includes(agentId)) {
      channel.participantIds.push(agentId);
      await this.db.query(
        'UPDATE orchestration_channels SET participant_ids = ? WHERE id = ?',
        [JSON.stringify(channel.participantIds), channelId]
      );
    }
  }

  async removeParticipant(channelId: string, agentId: string): Promise<void> {
    const channel = await this.getChannel(channelId);
    if (channel) {
      channel.participantIds = channel.participantIds.filter(id => id !== agentId);
      await this.db.query(
        'UPDATE orchestration_channels SET participant_ids = ? WHERE id = ?',
        [JSON.stringify(channel.participantIds), channelId]
      );
    }
  }

  async deleteChannel(id: string): Promise<boolean> {
    // Messages will be deleted by CASCADE
    const result = await this.db.query(
      'DELETE FROM orchestration_channels WHERE id = ?',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Message operations
  async getMessagesForChannel(channelId: string, limit?: number): Promise<AgentMessage[]> {
    let query = 'SELECT * FROM orchestration_messages WHERE channel_id = ? ORDER BY timestamp ASC';
    const params: unknown[] = [channelId];

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const result = await this.db.query<Record<string, unknown>>(query, params);
    return result.rows.map(row => this.rowToMessage(row));
  }

  async saveMessage(message: AgentMessage): Promise<void> {
    await this.db.query(
      `INSERT OR REPLACE INTO orchestration_messages
       (id, type, from_agent_id, to_agent_id, channel_id, content, context, priority, reply_to_message_id, timestamp, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        message.type,
        message.fromAgentId,
        message.toAgentId || null,
        message.channelId,
        message.content,
        JSON.stringify(message.context || {}),
        message.priority,
        message.replyToMessageId || null,
        message.timestamp,
        message.expiresAt || null,
      ]
    );

    // Update channel last message time
    await this.db.query(
      'UPDATE orchestration_channels SET last_message_at = ? WHERE id = ?',
      [message.timestamp, message.channelId]
    );
  }

  async deleteExpiredMessages(): Promise<number> {
    const result = await this.db.query(
      'DELETE FROM orchestration_messages WHERE expires_at IS NOT NULL AND expires_at < ?',
      [Date.now()]
    );
    return result.rowCount ?? 0;
  }

  async getSessionMetrics(sessionId: string): Promise<SessionMetrics | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const messageCountResult = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM orchestration_messages WHERE channel_id = ?',
      [session.channelId]
    );

    const handoffCountResult = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM orchestration_messages WHERE channel_id = ? AND type = 'handoff'`,
      [session.channelId]
    );

    return {
      sessionId,
      totalMessages: messageCountResult.rows[0]?.count || 0,
      participantCount: session.participantAgentIds.length,
      durationMs: (session.completedAt || Date.now()) - session.createdAt,
      handoffsCompleted: handoffCountResult.rows[0]?.count || 0,
      objectiveAchieved: session.status === 'completed',
    };
  }
}

/**
 * Create a session store based on type
 */
export function createSessionStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): SessionStore {
  if (type === 'database') {
    if (!dbAdapter) {
      throw new Error('Database adapter required for database store');
    }
    return new DatabaseSessionStore(dbAdapter);
  }
  return new InMemorySessionStore();
}
