/**
 * Channel Manager
 * Manages communication channels for agent collaboration
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  CommunicationChannel,
  ChannelStatus,
  AgentMessage,
} from '../types.js';
import type { SessionStore } from '../stores/session-store.js';
import { ORCHESTRATION_EVENTS } from '../events.js';

/**
 * Channel creation options
 */
export interface CreateChannelOptions {
  /** Channel name */
  name: string;
  /** Session ID to associate with */
  sessionId?: string;
  /** Initial participants */
  participantIds?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Channel manager configuration
 */
export interface ChannelManagerConfig {
  /** Maximum channels per session */
  maxChannelsPerSession: number;
  /** Maximum participants per channel */
  maxParticipantsPerChannel: number;
  /** Message retention in hours */
  messageRetentionHours: number;
}

/**
 * Default configuration
 */
const DEFAULT_CHANNEL_CONFIG: ChannelManagerConfig = {
  maxChannelsPerSession: 5,
  maxParticipantsPerChannel: 20,
  messageRetentionHours: 24,
};

/**
 * Channel manager events
 */
export interface ChannelManagerEvents {
  'channel:created': (channel: CommunicationChannel) => void;
  'channel:closed': (channelId: string) => void;
  'channel:joined': (channelId: string, agentId: string) => void;
  'channel:left': (channelId: string, agentId: string) => void;
  'message:received': (message: AgentMessage) => void;
}

/**
 * Manages communication channels
 */
export class ChannelManager extends EventEmitter {
  private config: ChannelManagerConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private store: SessionStore,
    config?: Partial<ChannelManagerConfig>
  ) {
    super();
    this.config = { ...DEFAULT_CHANNEL_CONFIG, ...config };
  }

  /**
   * Start the channel manager
   */
  start(): void {
    if (this.cleanupInterval) {
      return;
    }

    // Run message cleanup every hour
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredMessages(),
      60 * 60 * 1000
    );
  }

  /**
   * Stop the channel manager
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Create a new channel
   */
  async createChannel(options: CreateChannelOptions): Promise<CommunicationChannel> {
    // Check session channel limit if session ID provided
    if (options.sessionId) {
      const existingChannels = await this.store.getChannelsForSession(options.sessionId);
      if (existingChannels.length >= this.config.maxChannelsPerSession) {
        throw new Error(
          `Session has reached maximum channels (${this.config.maxChannelsPerSession})`
        );
      }
    }

    const channel: CommunicationChannel = {
      id: randomUUID(),
      name: options.name,
      sessionId: options.sessionId,
      participantIds: options.participantIds || [],
      status: 'active',
      metadata: options.metadata || {},
      createdAt: Date.now(),
    };

    await this.store.saveChannel(channel);

    this.emit('channel:created', channel);
    this.emit(ORCHESTRATION_EVENTS.CHANNEL_CREATED, {
      channelId: channel.id,
      sessionId: channel.sessionId,
      participantIds: channel.participantIds,
      timestamp: Date.now(),
      source: 'channel-manager',
    });

    return channel;
  }

  /**
   * Get a channel by ID
   */
  async getChannel(channelId: string): Promise<CommunicationChannel | null> {
    return this.store.getChannel(channelId);
  }

  /**
   * Get all channels
   */
  async getAllChannels(): Promise<CommunicationChannel[]> {
    return this.store.getAllChannels();
  }

  /**
   * Get active channels
   */
  async getActiveChannels(): Promise<CommunicationChannel[]> {
    const all = await this.store.getAllChannels();
    return all.filter(c => c.status === 'active');
  }

  /**
   * Get channels for a session
   */
  async getChannelsForSession(sessionId: string): Promise<CommunicationChannel[]> {
    return this.store.getChannelsForSession(sessionId);
  }

  /**
   * Close a channel
   */
  async closeChannel(channelId: string): Promise<boolean> {
    const channel = await this.store.getChannel(channelId);
    if (!channel) {
      return false;
    }

    await this.store.updateChannelStatus(channelId, 'closed');

    this.emit('channel:closed', channelId);
    this.emit(ORCHESTRATION_EVENTS.CHANNEL_CLOSED, {
      channelId,
      sessionId: channel.sessionId,
      participantIds: channel.participantIds,
      timestamp: Date.now(),
      source: 'channel-manager',
    });

    return true;
  }

  /**
   * Delete a channel
   */
  async deleteChannel(channelId: string): Promise<boolean> {
    return this.store.deleteChannel(channelId);
  }

  /**
   * Join a channel
   */
  async joinChannel(channelId: string, agentId: string): Promise<boolean> {
    const channel = await this.store.getChannel(channelId);
    if (!channel) {
      throw new Error(`Channel '${channelId}' not found`);
    }

    if (channel.status !== 'active') {
      throw new Error(`Channel '${channelId}' is not active`);
    }

    if (channel.participantIds.includes(agentId)) {
      return false; // Already joined
    }

    if (channel.participantIds.length >= this.config.maxParticipantsPerChannel) {
      throw new Error(
        `Channel has reached maximum participants (${this.config.maxParticipantsPerChannel})`
      );
    }

    await this.store.addParticipant(channelId, agentId);

    this.emit('channel:joined', channelId, agentId);
    this.emit(ORCHESTRATION_EVENTS.CHANNEL_JOINED, {
      channelId,
      agentId,
      timestamp: Date.now(),
      source: 'channel-manager',
    });

    return true;
  }

  /**
   * Leave a channel
   */
  async leaveChannel(channelId: string, agentId: string): Promise<boolean> {
    const channel = await this.store.getChannel(channelId);
    if (!channel) {
      return false;
    }

    if (!channel.participantIds.includes(agentId)) {
      return false; // Not in channel
    }

    await this.store.removeParticipant(channelId, agentId);

    this.emit('channel:left', channelId, agentId);
    this.emit(ORCHESTRATION_EVENTS.CHANNEL_LEFT, {
      channelId,
      agentId,
      timestamp: Date.now(),
      source: 'channel-manager',
    });

    return true;
  }

  /**
   * Check if agent is in channel
   */
  async isInChannel(channelId: string, agentId: string): Promise<boolean> {
    const channel = await this.store.getChannel(channelId);
    return channel !== null && channel.participantIds.includes(agentId);
  }

  /**
   * Get channel participants
   */
  async getParticipants(channelId: string): Promise<string[]> {
    const channel = await this.store.getChannel(channelId);
    return channel?.participantIds || [];
  }

  /**
   * Store a message in a channel
   */
  async storeMessage(message: AgentMessage): Promise<void> {
    const channel = await this.store.getChannel(message.channelId);
    if (!channel) {
      throw new Error(`Channel '${message.channelId}' not found`);
    }

    if (channel.status !== 'active') {
      throw new Error(`Channel '${message.channelId}' is not active`);
    }

    // Set expiration if not set
    if (!message.expiresAt) {
      message.expiresAt = Date.now() + this.config.messageRetentionHours * 60 * 60 * 1000;
    }

    await this.store.saveMessage(message);

    this.emit('message:received', message);
  }

  /**
   * Get messages for a channel
   */
  async getMessages(channelId: string, limit?: number): Promise<AgentMessage[]> {
    return this.store.getMessagesForChannel(channelId, limit);
  }

  /**
   * Get recent messages
   */
  async getRecentMessages(channelId: string, count: number = 50): Promise<AgentMessage[]> {
    return this.store.getMessagesForChannel(channelId, count);
  }

  /**
   * Cleanup expired messages
   */
  async cleanupExpiredMessages(): Promise<number> {
    return this.store.deleteExpiredMessages();
  }

  /**
   * Create a direct channel between two agents
   */
  async createDirectChannel(
    agent1Id: string,
    agent2Id: string,
    sessionId?: string
  ): Promise<CommunicationChannel> {
    return this.createChannel({
      name: `direct-${agent1Id}-${agent2Id}`,
      sessionId,
      participantIds: [agent1Id, agent2Id],
      metadata: {
        type: 'direct',
        createdBy: agent1Id,
      },
    });
  }

  /**
   * Create a group channel
   */
  async createGroupChannel(
    name: string,
    participantIds: string[],
    sessionId?: string,
    metadata?: Record<string, unknown>
  ): Promise<CommunicationChannel> {
    return this.createChannel({
      name,
      sessionId,
      participantIds,
      metadata: {
        ...metadata,
        type: 'group',
      },
    });
  }

  /**
   * Get channels containing an agent
   */
  async getChannelsForAgent(agentId: string): Promise<CommunicationChannel[]> {
    const all = await this.store.getAllChannels();
    return all.filter(c => c.participantIds.includes(agentId));
  }

  /**
   * Get active channels for an agent
   */
  async getActiveChannelsForAgent(agentId: string): Promise<CommunicationChannel[]> {
    const channels = await this.getChannelsForAgent(agentId);
    return channels.filter(c => c.status === 'active');
  }

  /**
   * Broadcast to all participants in a channel
   */
  async broadcastToChannel(
    channelId: string,
    message: AgentMessage
  ): Promise<string[]> {
    const channel = await this.store.getChannel(channelId);
    if (!channel) {
      throw new Error(`Channel '${channelId}' not found`);
    }

    // Store the message
    await this.storeMessage(message);

    // Return list of participants who will receive it
    return channel.participantIds.filter(id => id !== message.fromAgentId);
  }
}

/**
 * Create a channel manager
 */
export function createChannelManager(
  store: SessionStore,
  config?: Partial<ChannelManagerConfig>
): ChannelManager {
  return new ChannelManager(store, config);
}
