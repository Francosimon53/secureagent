/**
 * Multi-Agent Orchestration System Types
 * Defines all type definitions for agent orchestration, communication, and learning
 */

// =============================================================================
// Model Configuration
// =============================================================================

/**
 * Model tier classification for resource allocation
 */
export type ModelTier = 'fast' | 'balanced' | 'powerful';

/**
 * Supported Claude model identifiers
 */
export type ModelId = 'claude-3-haiku' | 'claude-3-sonnet' | 'claude-3-opus';

/**
 * Model configuration for an agent
 */
export interface ModelConfig {
  /** Performance tier */
  tier: ModelTier;
  /** Specific model identifier */
  modelId: ModelId;
  /** Maximum tokens for completion */
  maxTokens: number;
  /** Temperature for response generation */
  temperature: number;
}

// =============================================================================
// Agent Personas
// =============================================================================

/**
 * Predefined persona types
 */
export type PersonaType = 'developer' | 'marketing' | 'research' | 'business' | 'custom';

/**
 * Communication tone styles
 */
export type PersonaTone = 'formal' | 'casual' | 'technical' | 'friendly';

/**
 * Agent persona definition
 */
export interface AgentPersona {
  /** Unique persona identifier */
  id: string;
  /** Display name for the persona */
  name: string;
  /** Persona type classification */
  type: PersonaType;
  /** Human-readable description */
  description: string;
  /** System prompt defining behavior */
  systemPrompt: string;
  /** Model configuration */
  modelConfig: ModelConfig;
  /** List of capabilities this persona has */
  capabilities: string[];
  /** Optional constraints on behavior */
  constraints?: string[];
  /** Communication tone */
  tone?: PersonaTone;
}

// =============================================================================
// Orchestrated Agents
// =============================================================================

/**
 * Agent operational status
 */
export type AgentStatus = 'idle' | 'working' | 'waiting' | 'error' | 'terminated';

/**
 * An active orchestrated agent instance
 */
export interface OrchestratedAgent {
  /** Unique agent instance identifier */
  id: string;
  /** Reference to the persona being used */
  personaId: string;
  /** Full persona configuration */
  persona: AgentPersona;
  /** Current operational status */
  status: AgentStatus;
  /** Current task description if working */
  currentTask?: string;
  /** Communication channel ID if assigned */
  channelId?: string;
  /** Parent agent ID if this is a sub-agent */
  parentAgentId?: string;
  /** IDs of spawned sub-agents */
  subAgentIds: string[];
  /** Creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActiveAt: number;
  /** Extensible metadata */
  metadata: Record<string, unknown>;
}

// =============================================================================
// Communication Protocol
// =============================================================================

/**
 * Message type classification
 */
export type MessageType = 'request' | 'response' | 'broadcast' | 'handoff' | 'status';

/**
 * Message priority levels
 */
export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Inter-agent message structure
 */
export interface AgentMessage {
  /** Unique message identifier */
  id: string;
  /** Message type */
  type: MessageType;
  /** Sending agent ID */
  fromAgentId: string;
  /** Target agent ID (undefined for broadcasts) */
  toAgentId?: string;
  /** Communication channel ID */
  channelId: string;
  /** Message content */
  content: string;
  /** Additional context data */
  context?: Record<string, unknown>;
  /** Message priority */
  priority: MessagePriority;
  /** ID of message being replied to */
  replyToMessageId?: string;
  /** Message timestamp */
  timestamp: number;
  /** Optional expiration timestamp */
  expiresAt?: number;
}

/**
 * Request for task handoff between agents
 */
export interface HandoffRequest {
  /** Unique handoff identifier */
  id: string;
  /** Agent initiating handoff */
  fromAgentId: string;
  /** Target agent for handoff */
  toAgentId: string;
  /** Task being handed off */
  task: string;
  /** Context to transfer */
  context: Record<string, unknown>;
  /** Handoff reason */
  reason: string;
  /** Request timestamp */
  requestedAt: number;
  /** Completion timestamp */
  completedAt?: number;
  /** Whether handoff was accepted */
  accepted?: boolean;
}

// =============================================================================
// Communication Channels
// =============================================================================

/**
 * Channel status
 */
export type ChannelStatus = 'active' | 'closed';

/**
 * Communication channel for agent collaboration
 */
export interface CommunicationChannel {
  /** Unique channel identifier */
  id: string;
  /** Channel name */
  name: string;
  /** Session ID this channel belongs to */
  sessionId?: string;
  /** IDs of agents in this channel */
  participantIds: string[];
  /** Channel status */
  status: ChannelStatus;
  /** Creation timestamp */
  createdAt: number;
  /** Last message timestamp */
  lastMessageAt?: number;
  /** Channel metadata */
  metadata: Record<string, unknown>;
}

// =============================================================================
// Collaboration Sessions
// =============================================================================

/**
 * Session operational status
 */
export type SessionStatus = 'active' | 'paused' | 'completed' | 'failed';

/**
 * Multi-agent collaboration session
 */
export interface CollaborationSession {
  /** Unique session identifier */
  id: string;
  /** Session name */
  name: string;
  /** Primary communication channel ID */
  channelId: string;
  /** IDs of participating agents */
  participantAgentIds: string[];
  /** ID of coordinating agent */
  coordinatorAgentId: string;
  /** Session objective */
  objective: string;
  /** Current status */
  status: SessionStatus;
  /** Message history */
  messageHistory: AgentMessage[];
  /** Shared context between agents */
  sharedContext: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Completion timestamp */
  completedAt?: number;
  /** Session result if completed */
  result?: unknown;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Background Tasks
// =============================================================================

/**
 * Task priority levels
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Task operational status
 */
export type TaskStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * Task checkpoint for resumable operations
 */
export interface TaskCheckpoint {
  /** Task ID */
  taskId: string;
  /** Current step number */
  step: number;
  /** Total steps */
  totalSteps: number;
  /** Serialized state */
  state: Record<string, unknown>;
  /** Checkpoint timestamp */
  savedAt: number;
}

/**
 * Background task definition
 */
export interface BackgroundTask {
  /** Unique task identifier */
  id: string;
  /** Task name */
  name: string;
  /** Task description */
  description: string;
  /** Assigned agent ID */
  assignedAgentId?: string;
  /** Required persona type for execution */
  requiredPersonaType?: PersonaType;
  /** Task priority */
  priority: TaskPriority;
  /** Current status */
  status: TaskStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Latest checkpoint */
  checkpoint?: TaskCheckpoint;
  /** Whether eligible for overnight processing */
  overnightEligible: boolean;
  /** Estimated duration in minutes */
  estimatedDurationMinutes?: number;
  /** Start timestamp */
  startedAt?: number;
  /** Completion timestamp */
  completedAt?: number;
  /** Error message if failed */
  error?: string;
  /** Task result */
  result?: unknown;
  /** Retry count */
  retryCount: number;
  /** Max retries allowed */
  maxRetries: number;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

// =============================================================================
// Reporting
// =============================================================================

/**
 * Individual agent status report
 */
export interface AgentStatusReport {
  /** Agent ID */
  agentId: string;
  /** Persona name */
  personaName: string;
  /** Current status */
  status: AgentStatus;
  /** Tasks completed count */
  tasksCompleted: number;
  /** Tasks failed count */
  tasksFailed: number;
  /** Average task duration in ms */
  averageTaskDurationMs: number;
  /** Messages processed count */
  messagesProcessed: number;
  /** Error count */
  errorCount: number;
  /** Uptime in ms */
  uptime: number;
  /** Last error message */
  lastError?: string;
}

/**
 * System health status
 */
export type SystemHealth = 'healthy' | 'degraded' | 'critical';

/**
 * Daily operational report
 */
export interface DailyReport {
  /** Report identifier */
  id: string;
  /** Report date (YYYY-MM-DD) */
  date: string;
  /** Individual agent reports */
  agentReports: AgentStatusReport[];
  /** Total tasks completed */
  totalTasksCompleted: number;
  /** Total tasks failed */
  totalTasksFailed: number;
  /** Tasks processed overnight */
  overnightTasksProcessed: number;
  /** Improvements applied */
  improvementsApplied: number;
  /** System health assessment */
  systemHealth: SystemHealth;
  /** Recommendations for improvement */
  recommendations: string[];
  /** Generation timestamp */
  generatedAt: number;
}

// =============================================================================
// Learning & Self-Improvement
// =============================================================================

/**
 * Error category classification
 */
export type ErrorCategory = 'timeout' | 'api_error' | 'validation' | 'logic' | 'resource' | 'unknown';

/**
 * Captured error for analysis
 */
export interface CapturedError {
  /** Error identifier */
  id: string;
  /** Agent that encountered error */
  agentId: string;
  /** Task ID if applicable */
  taskId?: string;
  /** Error category */
  category: ErrorCategory;
  /** Error message */
  message: string;
  /** Stack trace */
  stack?: string;
  /** Error context */
  context: Record<string, unknown>;
  /** How the error was resolved */
  resolution?: string;
  /** Strategy to prevent recurrence */
  preventionStrategy?: string;
  /** Occurrence timestamp */
  occurredAt: number;
  /** Resolution timestamp */
  resolvedAt?: number;
}

/**
 * Learned pattern from error analysis
 */
export interface LearnedPattern {
  /** Pattern identifier */
  id: string;
  /** Pattern category */
  category: string;
  /** Pattern description */
  pattern: string;
  /** Recommended solution */
  solution: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Times this pattern led to success */
  successCount: number;
  /** Times this pattern failed */
  failureCount: number;
  /** Creation timestamp */
  createdAt: number;
  /** Last usage timestamp */
  lastUsedAt: number;
}

/**
 * Improvement type classification
 */
export type ImprovementType = 'prompt_optimization' | 'workflow_change' | 'resource_allocation' | 'error_prevention';

/**
 * Impact level assessment
 */
export type ImpactLevel = 'low' | 'medium' | 'high';

/**
 * Suggested improvement from learning system
 */
export interface ImprovementSuggestion {
  /** Suggestion identifier */
  id: string;
  /** Improvement type */
  type: ImprovementType;
  /** Description of improvement */
  description: string;
  /** Expected impact level */
  expectedImpact: ImpactLevel;
  /** Pattern IDs this is based on */
  basedOnPatterns: string[];
  /** Whether implemented */
  implemented: boolean;
  /** Implementation timestamp */
  implementedAt?: number;
  /** Measured impact after implementation */
  measuredImpact?: number;
}

// =============================================================================
// Metrics & Statistics
// =============================================================================

/**
 * Agent metrics for monitoring
 */
export interface AgentMetrics {
  /** Agent ID */
  agentId: string;
  /** Total tasks processed */
  totalTasks: number;
  /** Successful task count */
  successfulTasks: number;
  /** Failed task count */
  failedTasks: number;
  /** Total messages sent */
  messagesSent: number;
  /** Total messages received */
  messagesReceived: number;
  /** Average response time in ms */
  averageResponseTimeMs: number;
  /** Total active time in ms */
  totalActiveTimeMs: number;
  /** Error count */
  errors: number;
}

/**
 * Session metrics for monitoring
 */
export interface SessionMetrics {
  /** Session ID */
  sessionId: string;
  /** Total messages exchanged */
  totalMessages: number;
  /** Participant count */
  participantCount: number;
  /** Duration in ms */
  durationMs: number;
  /** Handoffs completed */
  handoffsCompleted: number;
  /** Whether objective was achieved */
  objectiveAchieved: boolean;
}

/**
 * System-wide orchestration metrics
 */
export interface OrchestrationMetrics {
  /** Active agent count */
  activeAgents: number;
  /** Active session count */
  activeSessions: number;
  /** Queued task count */
  queuedTasks: number;
  /** Running task count */
  runningTasks: number;
  /** Total messages today */
  messagesToday: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** System health */
  systemHealth: SystemHealth;
}
