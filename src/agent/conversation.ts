import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import {
  ConversationContext,
  ConversationMessage,
  AgentTurn,
  PendingToolCall,
  AgentState,
  MemoryEntry,
} from './types.js';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'Conversation' });

// ============================================================================
// Conversation Manager
// ============================================================================

/**
 * Manages conversation state and history
 */
export class ConversationManager extends EventEmitter {
  private readonly conversations = new Map<string, ConversationContext>();
  private readonly memory = new Map<string, MemoryEntry[]>();
  private readonly maxConversations: number;
  private readonly conversationTTL: number;

  constructor(options: {
    maxConversations?: number;
    conversationTTL?: number;
  } = {}) {
    super();
    this.maxConversations = options.maxConversations ?? 1000;
    this.conversationTTL = options.conversationTTL ?? 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Create a new conversation
   */
  createConversation(options: {
    agentId: string;
    userId?: string;
    channelId?: string;
    channelType?: string;
    metadata?: Record<string, unknown>;
  }): ConversationContext {
    // Enforce max conversations
    if (this.conversations.size >= this.maxConversations) {
      this.cleanupOldConversations();
    }

    const now = Date.now();
    const context: ConversationContext = {
      id: randomUUID(),
      agentId: options.agentId,
      userId: options.userId,
      channelId: options.channelId,
      channelType: options.channelType,
      messages: [],
      turns: [],
      state: 'idle',
      createdAt: now,
      updatedAt: now,
      metadata: options.metadata,
      totalToolCalls: 0,
      variables: {},
    };

    this.conversations.set(context.id, context);
    this.emit('created', context);

    logger.info({ conversationId: context.id, agentId: options.agentId }, 'Conversation created');

    return context;
  }

  /**
   * Get a conversation by ID
   */
  getConversation(id: string): ConversationContext | undefined {
    return this.conversations.get(id);
  }

  /**
   * Get or create a conversation
   */
  getOrCreateConversation(
    id: string | undefined,
    options: {
      agentId: string;
      userId?: string;
      channelId?: string;
      channelType?: string;
      metadata?: Record<string, unknown>;
    }
  ): ConversationContext {
    if (id) {
      const existing = this.conversations.get(id);
      if (existing) {
        return existing;
      }
    }
    return this.createConversation(options);
  }

  /**
   * Add a message to conversation
   */
  addMessage(conversationId: string, message: Omit<ConversationMessage, 'id' | 'timestamp'>): ConversationMessage {
    const context = this.conversations.get(conversationId);
    if (!context) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const fullMessage: ConversationMessage = {
      ...message,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    context.messages.push(fullMessage);
    context.updatedAt = Date.now();

    this.emit('message', { conversationId, message: fullMessage });

    return fullMessage;
  }

  /**
   * Start a new turn
   */
  startTurn(conversationId: string, userMessage: ConversationMessage): AgentTurn {
    const context = this.conversations.get(conversationId);
    if (!context) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const turn: AgentTurn = {
      id: randomUUID(),
      turnNumber: context.turns.length + 1,
      userMessage,
      toolCalls: [],
      startTime: Date.now(),
    };

    context.turns.push(turn);
    context.currentTurn = turn;
    context.state = 'processing';
    context.updatedAt = Date.now();

    this.emit('turnStarted', { conversationId, turn });

    return turn;
  }

  /**
   * Complete current turn
   */
  completeTurn(
    conversationId: string,
    assistantMessage?: ConversationMessage,
    error?: string
  ): AgentTurn | undefined {
    const context = this.conversations.get(conversationId);
    if (!context || !context.currentTurn) {
      return undefined;
    }

    const turn = context.currentTurn;
    turn.endTime = Date.now();
    turn.duration = turn.endTime - turn.startTime;
    turn.assistantMessage = assistantMessage;
    turn.error = error;

    context.currentTurn = undefined;
    context.state = error ? 'error' : 'idle';
    context.updatedAt = Date.now();

    this.emit('turnCompleted', { conversationId, turn });

    return turn;
  }

  /**
   * Add tool call to current turn
   */
  addToolCall(conversationId: string, toolCall: PendingToolCall): void {
    const context = this.conversations.get(conversationId);
    if (!context || !context.currentTurn) {
      throw new Error(`No active turn in conversation ${conversationId}`);
    }

    context.currentTurn.toolCalls.push(toolCall);
    context.totalToolCalls++;
    context.updatedAt = Date.now();

    this.emit('toolCall', { conversationId, toolCall });
  }

  /**
   * Update tool call status
   */
  updateToolCall(
    conversationId: string,
    toolCallId: string,
    update: Partial<PendingToolCall>
  ): PendingToolCall | undefined {
    const context = this.conversations.get(conversationId);
    if (!context) {
      return undefined;
    }

    // Search in current turn first, then in history
    const turns = context.currentTurn
      ? [...context.turns.slice(0, -1), context.currentTurn]
      : context.turns;

    for (const turn of turns.reverse()) {
      const toolCall = turn.toolCalls.find(tc => tc.id === toolCallId);
      if (toolCall) {
        Object.assign(toolCall, update);
        context.updatedAt = Date.now();
        return toolCall;
      }
    }

    return undefined;
  }

  /**
   * Get pending tool calls awaiting approval
   */
  getPendingApprovals(conversationId: string): PendingToolCall[] {
    const context = this.conversations.get(conversationId);
    if (!context || !context.currentTurn) {
      return [];
    }

    return context.currentTurn.toolCalls.filter(tc => tc.status === 'pending');
  }

  /**
   * Set conversation state
   */
  setState(conversationId: string, state: AgentState): void {
    const context = this.conversations.get(conversationId);
    if (context) {
      const previousState = context.state;
      context.state = state;
      context.updatedAt = Date.now();
      this.emit('stateChanged', { conversationId, previousState, state });
    }
  }

  /**
   * Set a variable in conversation context
   */
  setVariable(conversationId: string, key: string, value: unknown): void {
    const context = this.conversations.get(conversationId);
    if (context) {
      context.variables[key] = value;
      context.updatedAt = Date.now();
    }
  }

  /**
   * Get a variable from conversation context
   */
  getVariable(conversationId: string, key: string): unknown {
    return this.conversations.get(conversationId)?.variables[key];
  }

  /**
   * Get conversation history for context window
   */
  getHistory(
    conversationId: string,
    options: {
      maxMessages?: number;
      includeSystem?: boolean;
      includeToolResults?: boolean;
    } = {}
  ): ConversationMessage[] {
    const context = this.conversations.get(conversationId);
    if (!context) {
      return [];
    }

    let messages = [...context.messages];

    if (!options.includeSystem) {
      messages = messages.filter(m => m.role !== 'system');
    }

    if (!options.includeToolResults) {
      messages = messages.filter(m => m.role !== 'tool');
    }

    if (options.maxMessages && messages.length > options.maxMessages) {
      messages = messages.slice(-options.maxMessages);
    }

    return messages;
  }

  /**
   * Add memory entry
   */
  addMemory(conversationId: string, entry: Omit<MemoryEntry, 'id' | 'createdAt'>): MemoryEntry {
    const fullEntry: MemoryEntry = {
      ...entry,
      id: randomUUID(),
      createdAt: Date.now(),
    };

    const memories = this.memory.get(conversationId) ?? [];
    memories.push(fullEntry);
    this.memory.set(conversationId, memories);

    return fullEntry;
  }

  /**
   * Get memories for conversation
   */
  getMemories(
    conversationId: string,
    options: {
      type?: MemoryEntry['type'];
      minImportance?: number;
      limit?: number;
    } = {}
  ): MemoryEntry[] {
    let memories = this.memory.get(conversationId) ?? [];

    // Filter expired
    const now = Date.now();
    memories = memories.filter(m => !m.expiresAt || m.expiresAt > now);

    if (options.type) {
      memories = memories.filter(m => m.type === options.type);
    }

    if (options.minImportance !== undefined) {
      memories = memories.filter(m => m.importance >= options.minImportance!);
    }

    // Sort by importance descending
    memories.sort((a, b) => b.importance - a.importance);

    if (options.limit) {
      memories = memories.slice(0, options.limit);
    }

    return memories;
  }

  /**
   * End a conversation
   */
  endConversation(conversationId: string): void {
    const context = this.conversations.get(conversationId);
    if (context) {
      context.state = 'stopped';
      context.updatedAt = Date.now();
      this.emit('ended', { conversationId });
    }
  }

  /**
   * Delete a conversation
   */
  deleteConversation(conversationId: string): boolean {
    this.memory.delete(conversationId);
    return this.conversations.delete(conversationId);
  }

  /**
   * Get all active conversations for an agent
   */
  getAgentConversations(agentId: string): ConversationContext[] {
    return Array.from(this.conversations.values())
      .filter(c => c.agentId === agentId && c.state !== 'stopped');
  }

  /**
   * Get all conversations for a user
   */
  getUserConversations(userId: string): ConversationContext[] {
    return Array.from(this.conversations.values())
      .filter(c => c.userId === userId);
  }

  /**
   * Cleanup old conversations
   */
  cleanupOldConversations(): number {
    const cutoff = Date.now() - this.conversationTTL;
    let cleaned = 0;

    for (const [id, context] of this.conversations) {
      if (context.updatedAt < cutoff || context.state === 'stopped') {
        this.conversations.delete(id);
        this.memory.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info({ cleaned }, 'Cleaned up old conversations');
    }

    return cleaned;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalConversations: number;
    activeConversations: number;
    byState: Record<AgentState, number>;
  } {
    const stats = {
      totalConversations: this.conversations.size,
      activeConversations: 0,
      byState: {} as Record<AgentState, number>,
    };

    for (const context of this.conversations.values()) {
      stats.byState[context.state] = (stats.byState[context.state] ?? 0) + 1;
      if (context.state !== 'stopped' && context.state !== 'error') {
        stats.activeConversations++;
      }
    }

    return stats;
  }

  /**
   * Export conversation for persistence
   */
  exportConversation(conversationId: string): {
    context: ConversationContext;
    memories: MemoryEntry[];
  } | undefined {
    const context = this.conversations.get(conversationId);
    if (!context) {
      return undefined;
    }

    return {
      context: { ...context },
      memories: [...(this.memory.get(conversationId) ?? [])],
    };
  }

  /**
   * Import conversation from persistence
   */
  importConversation(data: {
    context: ConversationContext;
    memories: MemoryEntry[];
  }): void {
    this.conversations.set(data.context.id, data.context);
    if (data.memories.length > 0) {
      this.memory.set(data.context.id, data.memories);
    }
  }

  // ============================================================================
  // Test-compatible method aliases
  // ============================================================================

  /**
   * Create a new conversation (test-compatible alias)
   */
  create(options: {
    userId: string;
    agentId: string;
    channelId?: string;
    channelType?: string;
    metadata?: Record<string, unknown>;
  }): ConversationContext & { turnCount?: number } {
    const context = this.createConversation(options);
    return { ...context, turnCount: 0 };
  }

  /**
   * Get a conversation by ID (test-compatible alias)
   */
  get(id: string): (ConversationContext & { turnCount?: number }) | undefined {
    const context = this.getConversation(id);
    if (!context) return undefined;
    // Calculate turn count: count pairs of user/assistant messages
    let turnCount = 0;
    let hasUser = false;
    for (const msg of context.messages) {
      if (msg.role === 'user') {
        hasUser = true;
      } else if (msg.role === 'assistant' && hasUser) {
        turnCount++;
        hasUser = false;
      }
    }
    return { ...context, turnCount };
  }

  /**
   * End a conversation (test-compatible alias)
   */
  end(id: string): void {
    this.deleteConversation(id);
  }

  /**
   * Store a memory entry (test-compatible)
   */
  remember(conversationId: string, key: string, value: unknown): void {
    // Store in the memory map with key as the identifier
    const memories = this.memory.get(conversationId) ?? [];
    // Check if key already exists
    const existingIdx = memories.findIndex(m => m.key === key);
    const entry: MemoryEntry = {
      id: randomUUID(),
      key,
      content: '',
      type: 'fact',
      importance: 0.5,
      value,
      createdAt: Date.now(),
    };
    if (existingIdx >= 0) {
      memories[existingIdx] = entry;
    } else {
      memories.push(entry);
    }
    this.memory.set(conversationId, memories);
  }

  /**
   * Recall a memory entry (test-compatible)
   */
  recall(conversationId: string, key: string): { value: unknown } | undefined {
    const memories = this.memory.get(conversationId) ?? [];
    const entry = memories.find(m => m.key === key);
    return entry ? { value: entry.value } : undefined;
  }

  /**
   * Forget a memory entry (test-compatible)
   */
  forget(conversationId: string, key: string): void {
    const memories = this.memory.get(conversationId) ?? [];
    const filtered = memories.filter(m => m.key !== key);
    this.memory.set(conversationId, filtered);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalManager: ConversationManager | null = null;

/**
 * Get the global conversation manager
 */
export function getConversationManager(): ConversationManager {
  if (!globalManager) {
    globalManager = new ConversationManager();
  }
  return globalManager;
}
