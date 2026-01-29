/**
 * Message Router
 * Routes messages between agents in channels
 */

import { EventEmitter } from 'events';
import type {
  AgentMessage,
  MessageType,
  MessagePriority,
} from '../types.js';
import type { ChannelManager } from './channel-manager.js';
import type { AgentStore } from '../stores/agent-store.js';
import { Protocol, createProtocol, type MessageEnvelope } from './protocol.js';
import { ORCHESTRATION_EVENTS } from '../events.js';

/**
 * Message handler function type
 */
export type MessageHandler = (message: AgentMessage) => Promise<void>;

/**
 * Message filter function type
 */
export type MessageFilter = (message: AgentMessage) => boolean;

/**
 * Router subscription
 */
export interface RouterSubscription {
  /** Subscription ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** Channel ID (optional - subscribes to all if not specified) */
  channelId?: string;
  /** Message type filter */
  messageTypes?: MessageType[];
  /** Custom filter */
  filter?: MessageFilter;
  /** Handler function */
  handler: MessageHandler;
  /** Priority for handler execution */
  priority: number;
}

/**
 * Router configuration
 */
export interface MessageRouterConfig {
  /** Enable broadcast messages */
  enableBroadcast: boolean;
  /** Maximum message queue size per agent */
  maxQueueSize: number;
  /** Retry failed deliveries */
  retryFailedDeliveries: boolean;
  /** Max retries */
  maxRetries: number;
}

/**
 * Default router configuration
 */
const DEFAULT_ROUTER_CONFIG: MessageRouterConfig = {
  enableBroadcast: true,
  maxQueueSize: 1000,
  retryFailedDeliveries: true,
  maxRetries: 3,
};

/**
 * Message delivery result
 */
export interface DeliveryResult {
  /** Message ID */
  messageId: string;
  /** Recipients who received the message */
  delivered: string[];
  /** Recipients who failed to receive */
  failed: Array<{ agentId: string; error: string }>;
  /** Whether all deliveries succeeded */
  success: boolean;
}

/**
 * Router events
 */
export interface MessageRouterEvents {
  'message:routed': (message: AgentMessage, recipients: string[]) => void;
  'message:delivered': (message: AgentMessage, agentId: string) => void;
  'message:failed': (message: AgentMessage, agentId: string, error: Error) => void;
  'broadcast:sent': (message: AgentMessage, recipients: string[]) => void;
}

/**
 * Routes messages between agents
 */
export class MessageRouter extends EventEmitter {
  private config: MessageRouterConfig;
  private protocol: Protocol;
  private subscriptions: Map<string, RouterSubscription> = new Map();
  private pendingAcks: Map<string, MessageEnvelope> = new Map();
  private messageQueues: Map<string, AgentMessage[]> = new Map();

  constructor(
    private channelManager: ChannelManager,
    private agentStore: AgentStore,
    config?: Partial<MessageRouterConfig>
  ) {
    super();
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
    this.protocol = createProtocol();
  }

  /**
   * Subscribe to messages
   */
  subscribe(
    agentId: string,
    handler: MessageHandler,
    options?: {
      channelId?: string;
      messageTypes?: MessageType[];
      filter?: MessageFilter;
      priority?: number;
    }
  ): string {
    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const subscription: RouterSubscription = {
      id: subscriptionId,
      agentId,
      channelId: options?.channelId,
      messageTypes: options?.messageTypes,
      filter: options?.filter,
      handler,
      priority: options?.priority ?? 0,
    };

    this.subscriptions.set(subscriptionId, subscription);
    return subscriptionId;
  }

  /**
   * Unsubscribe from messages
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Unsubscribe all for an agent
   */
  unsubscribeAll(agentId: string): number {
    let count = 0;
    for (const [id, sub] of this.subscriptions) {
      if (sub.agentId === agentId) {
        this.subscriptions.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Route a message
   */
  async route(message: AgentMessage): Promise<DeliveryResult> {
    // Validate message
    const errors = this.protocol.validate(message);
    if (errors.length > 0) {
      throw new Error(`Invalid message: ${errors.join(', ')}`);
    }

    // Check if expired
    if (this.protocol.isExpired(message)) {
      throw new Error('Message has expired');
    }

    // Store the message in the channel
    await this.channelManager.storeMessage(message);

    // Determine recipients
    const recipients = await this.getRecipients(message);

    const delivered: string[] = [];
    const failed: Array<{ agentId: string; error: string }> = [];

    // Deliver to each recipient
    for (const recipientId of recipients) {
      try {
        await this.deliverToAgent(message, recipientId);
        delivered.push(recipientId);

        this.emit('message:delivered', message, recipientId);
        this.emit(ORCHESTRATION_EVENTS.MESSAGE_RECEIVED, {
          messageId: message.id,
          fromAgentId: message.fromAgentId,
          toAgentId: recipientId,
          channelId: message.channelId,
          messageType: message.type,
          priority: message.priority,
          timestamp: Date.now(),
          source: 'message-router',
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        failed.push({ agentId: recipientId, error: errorMsg });

        this.emit('message:failed', message, recipientId, error as Error);
        this.emit(ORCHESTRATION_EVENTS.MESSAGE_FAILED, {
          messageId: message.id,
          fromAgentId: message.fromAgentId,
          toAgentId: recipientId,
          channelId: message.channelId,
          messageType: message.type,
          priority: message.priority,
          error: errorMsg,
          timestamp: Date.now(),
          source: 'message-router',
        });
      }
    }

    const result: DeliveryResult = {
      messageId: message.id,
      delivered,
      failed,
      success: failed.length === 0,
    };

    this.emit('message:routed', message, recipients);
    this.emit(ORCHESTRATION_EVENTS.MESSAGE_SENT, {
      messageId: message.id,
      fromAgentId: message.fromAgentId,
      toAgentId: message.toAgentId,
      channelId: message.channelId,
      messageType: message.type,
      priority: message.priority,
      timestamp: Date.now(),
      source: 'message-router',
    });

    return result;
  }

  /**
   * Send a direct message
   */
  async sendDirect(
    fromAgentId: string,
    toAgentId: string,
    channelId: string,
    content: string,
    options?: {
      context?: Record<string, unknown>;
      priority?: MessagePriority;
      replyTo?: string;
    }
  ): Promise<DeliveryResult> {
    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: 'request',
      fromAgentId,
      toAgentId,
      channelId,
      content,
      context: options?.context,
      priority: options?.priority || 'normal',
      replyToMessageId: options?.replyTo,
      timestamp: Date.now(),
    };

    return this.route(message);
  }

  /**
   * Broadcast a message to a channel
   */
  async broadcast(
    fromAgentId: string,
    channelId: string,
    content: string,
    options?: {
      context?: Record<string, unknown>;
      priority?: MessagePriority;
    }
  ): Promise<DeliveryResult> {
    if (!this.config.enableBroadcast) {
      throw new Error('Broadcast is disabled');
    }

    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: 'broadcast',
      fromAgentId,
      channelId,
      content,
      context: options?.context,
      priority: options?.priority || 'normal',
      timestamp: Date.now(),
    };

    const result = await this.route(message);

    this.emit('broadcast:sent', message, result.delivered);
    this.emit(ORCHESTRATION_EVENTS.BROADCAST_SENT, {
      messageId: message.id,
      fromAgentId: message.fromAgentId,
      channelId: message.channelId,
      recipientCount: result.delivered.length,
      timestamp: Date.now(),
      source: 'message-router',
    });

    return result;
  }

  /**
   * Get pending messages for an agent
   */
  async getPendingMessages(agentId: string): Promise<AgentMessage[]> {
    return this.messageQueues.get(agentId) || [];
  }

  /**
   * Clear pending messages for an agent
   */
  async clearPendingMessages(agentId: string): Promise<number> {
    const queue = this.messageQueues.get(agentId);
    const count = queue?.length || 0;
    this.messageQueues.delete(agentId);
    return count;
  }

  /**
   * Get recipients for a message
   */
  private async getRecipients(message: AgentMessage): Promise<string[]> {
    // Direct message
    if (message.toAgentId) {
      return [message.toAgentId];
    }

    // Broadcast - get all channel participants except sender
    const participants = await this.channelManager.getParticipants(message.channelId);
    return participants.filter(id => id !== message.fromAgentId);
  }

  /**
   * Deliver message to a specific agent
   */
  private async deliverToAgent(message: AgentMessage, agentId: string): Promise<void> {
    // Check if agent exists and is active
    const agent = await this.agentStore.get(agentId);
    if (!agent) {
      throw new Error(`Agent '${agentId}' not found`);
    }

    if (agent.status === 'terminated') {
      throw new Error(`Agent '${agentId}' is terminated`);
    }

    // Find matching subscriptions
    const matchingSubscriptions = this.findMatchingSubscriptions(message, agentId);

    if (matchingSubscriptions.length === 0) {
      // Queue the message for later delivery
      this.queueMessage(agentId, message);
      return;
    }

    // Sort by priority and execute handlers
    matchingSubscriptions.sort((a, b) => b.priority - a.priority);

    for (const subscription of matchingSubscriptions) {
      try {
        await subscription.handler(message);
      } catch (error) {
        // Log but don't fail - continue to other handlers
        console.error(
          `Handler error for subscription ${subscription.id}:`,
          error
        );
      }
    }
  }

  /**
   * Find subscriptions matching a message for an agent
   */
  private findMatchingSubscriptions(
    message: AgentMessage,
    agentId: string
  ): RouterSubscription[] {
    const matching: RouterSubscription[] = [];

    for (const subscription of this.subscriptions.values()) {
      // Must match agent ID
      if (subscription.agentId !== agentId) {
        continue;
      }

      // Check channel filter
      if (subscription.channelId && subscription.channelId !== message.channelId) {
        continue;
      }

      // Check message type filter
      if (subscription.messageTypes && !subscription.messageTypes.includes(message.type)) {
        continue;
      }

      // Check custom filter
      if (subscription.filter && !subscription.filter(message)) {
        continue;
      }

      matching.push(subscription);
    }

    return matching;
  }

  /**
   * Queue a message for later delivery
   */
  private queueMessage(agentId: string, message: AgentMessage): void {
    let queue = this.messageQueues.get(agentId);
    if (!queue) {
      queue = [];
      this.messageQueues.set(agentId, queue);
    }

    // Check queue size limit
    if (queue.length >= this.config.maxQueueSize) {
      // Remove oldest messages
      queue.shift();
    }

    queue.push(message);
  }

  /**
   * Process queued messages for an agent
   */
  async processQueuedMessages(agentId: string): Promise<number> {
    const queue = this.messageQueues.get(agentId);
    if (!queue || queue.length === 0) {
      return 0;
    }

    let processed = 0;
    const remaining: AgentMessage[] = [];

    for (const message of queue) {
      try {
        await this.deliverToAgent(message, agentId);
        processed++;
      } catch {
        remaining.push(message);
      }
    }

    if (remaining.length > 0) {
      this.messageQueues.set(agentId, remaining);
    } else {
      this.messageQueues.delete(agentId);
    }

    return processed;
  }
}

/**
 * Create a message router
 */
export function createMessageRouter(
  channelManager: ChannelManager,
  agentStore: AgentStore,
  config?: Partial<MessageRouterConfig>
): MessageRouter {
  return new MessageRouter(channelManager, agentStore, config);
}
