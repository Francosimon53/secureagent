import { ToolExecutionResult } from '../security/types.js';

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Agent state
 */
export type AgentState = 'idle' | 'processing' | 'waiting_approval' | 'executing' | 'error' | 'stopped';

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Unique agent identifier */
  id: string;
  /** Agent name for display */
  name: string;
  /** Agent description */
  description?: string;
  /** Maximum conversation turns before reset */
  maxTurns?: number;
  /** Maximum tool calls per turn */
  maxToolCallsPerTurn?: number;
  /** Maximum total tool calls per conversation */
  maxToolCallsTotal?: number;
  /** Timeout for each turn in ms */
  turnTimeout?: number;
  /** Enable human-in-the-loop for tool approval */
  requireApproval?: boolean;
  /** Tools requiring approval */
  approvalRequiredTools?: string[];
  /** System prompt/instructions */
  systemPrompt?: string;
  /** Enable conversation memory */
  enableMemory?: boolean;
  /** Maximum memory entries */
  maxMemoryEntries?: number;
  /** Allowed tool names (empty = all allowed) */
  allowedTools?: string[];
  /** Denied tool names */
  deniedTools?: string[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Conversation message
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  /** For tool messages */
  toolCallId?: string;
  toolName?: string;
  toolResult?: ToolExecutionResult;
}

/**
 * Tool call request from the model
 */
export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  timestamp: number;
}

/**
 * Tool call with approval status
 */
export interface PendingToolCall extends ToolCallRequest {
  status: 'pending' | 'approved' | 'denied' | 'executed' | 'failed';
  approvedBy?: string;
  approvedAt?: number;
  deniedReason?: string;
  result?: ToolExecutionResult;
}

/**
 * Agent turn - one request/response cycle
 */
export interface AgentTurn {
  id: string;
  turnNumber: number;
  userMessage: ConversationMessage;
  assistantMessage?: ConversationMessage;
  toolCalls: PendingToolCall[];
  startTime: number;
  endTime?: number;
  duration?: number;
  error?: string;
}

/**
 * Conversation context
 */
export interface ConversationContext {
  id: string;
  agentId: string;
  userId?: string;
  channelId?: string;
  channelType?: string;
  messages: ConversationMessage[];
  turns: AgentTurn[];
  currentTurn?: AgentTurn;
  state: AgentState;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
  /** Total tool calls in this conversation */
  totalToolCalls: number;
  /** Variables stored by tools */
  variables: Record<string, unknown>;
}

/**
 * Agent execution options
 */
export interface ExecutionOptions {
  /** User identity for authorization */
  userId?: string;
  /** Session ID */
  sessionId?: string;
  /** Channel information */
  channel?: {
    id: string;
    type: string;
  };
  /** Additional context */
  context?: Record<string, unknown>;
  /** Override approval requirement */
  requireApproval?: boolean;
  /** Timeout override */
  timeout?: number;
  /** Stream responses */
  stream?: boolean;
}

/**
 * Agent response
 */
export interface AgentResponse {
  /** Response message */
  message: string;
  /** Response content (test-compatible alias for message) */
  content?: string;
  /** Conversation ID */
  conversationId: string;
  /** Turn number */
  turnNumber: number;
  /** Tool calls made */
  toolCalls: PendingToolCall[];
  /** Tools waiting for approval */
  pendingApprovals: PendingToolCall[];
  /** Execution duration in ms */
  duration: number;
  /** Any error that occurred */
  error?: string;
  /** Whether conversation is complete */
  complete: boolean;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Tool approval request
 */
export interface ApprovalRequest {
  conversationId: string;
  turnId: string;
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  requestedAt: number;
  expiresAt: number;
  userId?: string;
  context?: string;
}

/**
 * Tool approval response
 */
export interface ApprovalResponse {
  toolCallId: string;
  approved: boolean;
  approvedBy?: string;
  reason?: string;
}

/**
 * Agent event types
 */
export type AgentEventType =
  | 'conversation:started'
  | 'conversation:ended'
  | 'turn:started'
  | 'turn:completed'
  | 'message:received'
  | 'message:sent'
  | 'tool:requested'
  | 'tool:approved'
  | 'tool:denied'
  | 'tool:executing'
  | 'tool:completed'
  | 'tool:failed'
  | 'approval:requested'
  | 'approval:timeout'
  | 'error'
  | 'state:changed';

/**
 * Agent event
 */
export interface AgentEvent {
  type: AgentEventType;
  agentId: string;
  conversationId?: string;
  turnId?: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

/**
 * Agent event handler
 */
export type AgentEventHandler = (event: AgentEvent) => void | Promise<void>;

/**
 * Memory entry for agent
 */
export interface MemoryEntry {
  id: string;
  conversationId?: string;
  content: string;
  type: 'fact' | 'preference' | 'context' | 'summary';
  importance: number;
  createdAt: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
  /** Test-compatible: key for lookup */
  key?: string;
  /** Test-compatible: value storage */
  value?: unknown;
}

/**
 * Agent statistics
 */
export interface AgentStats {
  totalConversations: number;
  activeConversations: number;
  totalTurns: number;
  totalMessages?: number;
  totalToolCalls: number;
  approvedToolCalls: number;
  deniedToolCalls: number;
  failedToolCalls: number;
  averageTurnDuration: number;
  errorCount: number;
}
