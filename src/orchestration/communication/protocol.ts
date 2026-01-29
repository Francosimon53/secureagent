/**
 * Bot-to-Bot Communication Protocol
 * Defines the protocol for inter-agent communication
 */

import { randomUUID } from 'crypto';
import type {
  AgentMessage,
  MessageType,
  MessagePriority,
  HandoffRequest,
} from '../types.js';

/**
 * Protocol message envelope
 */
export interface MessageEnvelope {
  /** Protocol version */
  version: string;
  /** Message ID */
  id: string;
  /** Envelope creation timestamp */
  createdAt: number;
  /** Message payload */
  payload: AgentMessage;
  /** Optional signature for verification */
  signature?: string;
  /** Delivery confirmation required */
  requiresAck: boolean;
  /** Acknowledgment ID if this is an ack */
  ackForMessageId?: string;
}

/**
 * Protocol configuration
 */
export interface ProtocolConfig {
  /** Protocol version */
  version: string;
  /** Default message TTL in ms */
  defaultTTLMs: number;
  /** Max message size in bytes */
  maxMessageSizeBytes: number;
  /** Require delivery acknowledgment */
  requireAcknowledgment: boolean;
  /** Enable message signing */
  enableSigning: boolean;
}

/**
 * Default protocol configuration
 */
const DEFAULT_PROTOCOL_CONFIG: ProtocolConfig = {
  version: '1.0',
  defaultTTLMs: 24 * 60 * 60 * 1000, // 24 hours
  maxMessageSizeBytes: 65536,
  requireAcknowledgment: false,
  enableSigning: false,
};

/**
 * Message builder for creating protocol-compliant messages
 */
export class MessageBuilder {
  private message: Partial<AgentMessage> = {};

  constructor() {
    this.message.id = randomUUID();
    this.message.timestamp = Date.now();
    this.message.priority = 'normal';
  }

  /**
   * Set message type
   */
  type(type: MessageType): MessageBuilder {
    this.message.type = type;
    return this;
  }

  /**
   * Set sender
   */
  from(agentId: string): MessageBuilder {
    this.message.fromAgentId = agentId;
    return this;
  }

  /**
   * Set recipient (optional for broadcasts)
   */
  to(agentId: string): MessageBuilder {
    this.message.toAgentId = agentId;
    return this;
  }

  /**
   * Set channel
   */
  channel(channelId: string): MessageBuilder {
    this.message.channelId = channelId;
    return this;
  }

  /**
   * Set content
   */
  content(content: string): MessageBuilder {
    this.message.content = content;
    return this;
  }

  /**
   * Set context
   */
  context(context: Record<string, unknown>): MessageBuilder {
    this.message.context = context;
    return this;
  }

  /**
   * Set priority
   */
  priority(priority: MessagePriority): MessageBuilder {
    this.message.priority = priority;
    return this;
  }

  /**
   * Set as reply to another message
   */
  replyTo(messageId: string): MessageBuilder {
    this.message.replyToMessageId = messageId;
    return this;
  }

  /**
   * Set expiration
   */
  expiresAt(timestamp: number): MessageBuilder {
    this.message.expiresAt = timestamp;
    return this;
  }

  /**
   * Set TTL in milliseconds
   */
  ttl(ms: number): MessageBuilder {
    this.message.expiresAt = Date.now() + ms;
    return this;
  }

  /**
   * Build the message
   */
  build(): AgentMessage {
    if (!this.message.type) {
      throw new Error('Message type is required');
    }
    if (!this.message.fromAgentId) {
      throw new Error('Sender agent ID is required');
    }
    if (!this.message.channelId) {
      throw new Error('Channel ID is required');
    }
    if (!this.message.content) {
      throw new Error('Message content is required');
    }

    return this.message as AgentMessage;
  }
}

/**
 * Create a request message
 */
export function createRequest(
  fromAgentId: string,
  channelId: string,
  content: string,
  options?: {
    toAgentId?: string;
    context?: Record<string, unknown>;
    priority?: MessagePriority;
    ttlMs?: number;
  }
): AgentMessage {
  const builder = new MessageBuilder()
    .type('request')
    .from(fromAgentId)
    .channel(channelId)
    .content(content);

  if (options?.toAgentId) builder.to(options.toAgentId);
  if (options?.context) builder.context(options.context);
  if (options?.priority) builder.priority(options.priority);
  if (options?.ttlMs) builder.ttl(options.ttlMs);

  return builder.build();
}

/**
 * Create a response message
 */
export function createResponse(
  fromAgentId: string,
  channelId: string,
  content: string,
  replyToMessageId: string,
  options?: {
    toAgentId?: string;
    context?: Record<string, unknown>;
    priority?: MessagePriority;
  }
): AgentMessage {
  const builder = new MessageBuilder()
    .type('response')
    .from(fromAgentId)
    .channel(channelId)
    .content(content)
    .replyTo(replyToMessageId);

  if (options?.toAgentId) builder.to(options.toAgentId);
  if (options?.context) builder.context(options.context);
  if (options?.priority) builder.priority(options.priority);

  return builder.build();
}

/**
 * Create a broadcast message
 */
export function createBroadcast(
  fromAgentId: string,
  channelId: string,
  content: string,
  options?: {
    context?: Record<string, unknown>;
    priority?: MessagePriority;
    ttlMs?: number;
  }
): AgentMessage {
  const builder = new MessageBuilder()
    .type('broadcast')
    .from(fromAgentId)
    .channel(channelId)
    .content(content);

  if (options?.context) builder.context(options.context);
  if (options?.priority) builder.priority(options.priority);
  if (options?.ttlMs) builder.ttl(options.ttlMs);

  return builder.build();
}

/**
 * Create a handoff message
 */
export function createHandoffMessage(
  fromAgentId: string,
  toAgentId: string,
  channelId: string,
  handoffRequest: HandoffRequest
): AgentMessage {
  return new MessageBuilder()
    .type('handoff')
    .from(fromAgentId)
    .to(toAgentId)
    .channel(channelId)
    .content(`Handoff request: ${handoffRequest.task}`)
    .context({
      handoffId: handoffRequest.id,
      task: handoffRequest.task,
      reason: handoffRequest.reason,
      handoffContext: handoffRequest.context,
    })
    .priority('high')
    .build();
}

/**
 * Create a status message
 */
export function createStatusMessage(
  fromAgentId: string,
  channelId: string,
  status: string,
  details?: Record<string, unknown>
): AgentMessage {
  return new MessageBuilder()
    .type('status')
    .from(fromAgentId)
    .channel(channelId)
    .content(status)
    .context(details || {})
    .priority('low')
    .build();
}

/**
 * Create a handoff request
 */
export function createHandoffRequest(
  fromAgentId: string,
  toAgentId: string,
  task: string,
  reason: string,
  context: Record<string, unknown> = {}
): HandoffRequest {
  return {
    id: randomUUID(),
    fromAgentId,
    toAgentId,
    task,
    reason,
    context,
    requestedAt: Date.now(),
  };
}

/**
 * Protocol handler for message processing
 */
export class Protocol {
  private config: ProtocolConfig;

  constructor(config?: Partial<ProtocolConfig>) {
    this.config = { ...DEFAULT_PROTOCOL_CONFIG, ...config };
  }

  /**
   * Wrap a message in an envelope
   */
  wrap(message: AgentMessage, options?: { requiresAck?: boolean }): MessageEnvelope {
    return {
      version: this.config.version,
      id: randomUUID(),
      createdAt: Date.now(),
      payload: message,
      requiresAck: options?.requiresAck ?? this.config.requireAcknowledgment,
    };
  }

  /**
   * Unwrap an envelope
   */
  unwrap(envelope: MessageEnvelope): AgentMessage {
    // Verify version compatibility
    if (!this.isCompatibleVersion(envelope.version)) {
      throw new Error(`Incompatible protocol version: ${envelope.version}`);
    }

    return envelope.payload;
  }

  /**
   * Check version compatibility
   */
  isCompatibleVersion(version: string): boolean {
    const [major] = version.split('.');
    const [currentMajor] = this.config.version.split('.');
    return major === currentMajor;
  }

  /**
   * Validate a message
   */
  validate(message: AgentMessage): string[] {
    const errors: string[] = [];

    if (!message.id) {
      errors.push('Message ID is required');
    }

    if (!message.type) {
      errors.push('Message type is required');
    }

    if (!message.fromAgentId) {
      errors.push('Sender agent ID is required');
    }

    if (!message.channelId) {
      errors.push('Channel ID is required');
    }

    if (!message.content) {
      errors.push('Message content is required');
    }

    // Check message size
    const contentSize = new TextEncoder().encode(message.content).length;
    if (contentSize > this.config.maxMessageSizeBytes) {
      errors.push(
        `Message content exceeds maximum size (${contentSize} > ${this.config.maxMessageSizeBytes})`
      );
    }

    // Check expiration
    if (message.expiresAt && message.expiresAt < Date.now()) {
      errors.push('Message has expired');
    }

    return errors;
  }

  /**
   * Check if message is expired
   */
  isExpired(message: AgentMessage): boolean {
    return message.expiresAt !== undefined && message.expiresAt < Date.now();
  }

  /**
   * Create an acknowledgment envelope
   */
  createAck(originalEnvelope: MessageEnvelope): MessageEnvelope {
    return {
      version: this.config.version,
      id: randomUUID(),
      createdAt: Date.now(),
      payload: {
        id: randomUUID(),
        type: 'status',
        fromAgentId: originalEnvelope.payload.toAgentId || 'system',
        channelId: originalEnvelope.payload.channelId,
        content: 'ACK',
        priority: 'low',
        timestamp: Date.now(),
      },
      requiresAck: false,
      ackForMessageId: originalEnvelope.payload.id,
    };
  }

  /**
   * Get protocol version
   */
  getVersion(): string {
    return this.config.version;
  }

  /**
   * Get protocol configuration
   */
  getConfig(): ProtocolConfig {
    return { ...this.config };
  }
}

/**
 * Create a protocol instance
 */
export function createProtocol(config?: Partial<ProtocolConfig>): Protocol {
  return new Protocol(config);
}

// Export default protocol instance
export const defaultProtocol = new Protocol();
