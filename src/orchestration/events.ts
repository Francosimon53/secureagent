/**
 * Orchestration Event Constants
 * Defines all event types for the multi-agent orchestration system
 */

/**
 * All orchestration-related event types
 */
export const ORCHESTRATION_EVENTS = {
  // ==========================================================================
  // Agent Lifecycle Events
  // ==========================================================================

  /** Fired when a new agent is spawned */
  AGENT_SPAWNED: 'orchestration.agent.spawned',
  /** Fired when an agent is terminated */
  AGENT_TERMINATED: 'orchestration.agent.terminated',
  /** Fired when an agent's status changes */
  AGENT_STATUS_CHANGED: 'orchestration.agent.status-changed',
  /** Fired when an agent encounters an error */
  AGENT_ERROR: 'orchestration.agent.error',
  /** Fired when an agent becomes idle */
  AGENT_IDLE: 'orchestration.agent.idle',
  /** Fired when an agent starts working */
  AGENT_WORKING: 'orchestration.agent.working',

  // ==========================================================================
  // Sub-Agent Events
  // ==========================================================================

  /** Fired when a sub-agent is created */
  SUBAGENT_CREATED: 'orchestration.subagent.created',
  /** Fired when a sub-agent completes its task */
  SUBAGENT_COMPLETED: 'orchestration.subagent.completed',
  /** Fired when a sub-agent fails */
  SUBAGENT_FAILED: 'orchestration.subagent.failed',

  // ==========================================================================
  // Communication Events
  // ==========================================================================

  /** Fired when a message is sent */
  MESSAGE_SENT: 'orchestration.message.sent',
  /** Fired when a message is received */
  MESSAGE_RECEIVED: 'orchestration.message.received',
  /** Fired when a message delivery fails */
  MESSAGE_FAILED: 'orchestration.message.failed',
  /** Fired when a broadcast is sent */
  BROADCAST_SENT: 'orchestration.broadcast.sent',

  // ==========================================================================
  // Channel Events
  // ==========================================================================

  /** Fired when a communication channel is created */
  CHANNEL_CREATED: 'orchestration.channel.created',
  /** Fired when a channel is closed */
  CHANNEL_CLOSED: 'orchestration.channel.closed',
  /** Fired when an agent joins a channel */
  CHANNEL_JOINED: 'orchestration.channel.joined',
  /** Fired when an agent leaves a channel */
  CHANNEL_LEFT: 'orchestration.channel.left',

  // ==========================================================================
  // Collaboration Session Events
  // ==========================================================================

  /** Fired when a collaboration session starts */
  SESSION_STARTED: 'orchestration.session.started',
  /** Fired when a session is paused */
  SESSION_PAUSED: 'orchestration.session.paused',
  /** Fired when a session is resumed */
  SESSION_RESUMED: 'orchestration.session.resumed',
  /** Fired when a session completes successfully */
  SESSION_COMPLETED: 'orchestration.session.completed',
  /** Fired when a session fails */
  SESSION_FAILED: 'orchestration.session.failed',

  // ==========================================================================
  // Handoff Events
  // ==========================================================================

  /** Fired when a handoff is requested */
  HANDOFF_REQUESTED: 'orchestration.handoff.requested',
  /** Fired when a handoff is accepted */
  HANDOFF_ACCEPTED: 'orchestration.handoff.accepted',
  /** Fired when a handoff is rejected */
  HANDOFF_REJECTED: 'orchestration.handoff.rejected',
  /** Fired when a handoff completes */
  HANDOFF_COMPLETED: 'orchestration.handoff.completed',

  // ==========================================================================
  // Background Task Events
  // ==========================================================================

  /** Fired when a task is queued */
  TASK_QUEUED: 'orchestration.task.queued',
  /** Fired when a task starts */
  TASK_STARTED: 'orchestration.task.started',
  /** Fired when a task reports progress */
  TASK_PROGRESS: 'orchestration.task.progress',
  /** Fired when a task is paused */
  TASK_PAUSED: 'orchestration.task.paused',
  /** Fired when a task is resumed */
  TASK_RESUMED: 'orchestration.task.resumed',
  /** Fired when a task completes */
  TASK_COMPLETED: 'orchestration.task.completed',
  /** Fired when a task fails */
  TASK_FAILED: 'orchestration.task.failed',
  /** Fired when a task is cancelled */
  TASK_CANCELLED: 'orchestration.task.cancelled',
  /** Fired when a task checkpoint is saved */
  TASK_CHECKPOINTED: 'orchestration.task.checkpointed',
  /** Fired when a task is retried */
  TASK_RETRIED: 'orchestration.task.retried',

  // ==========================================================================
  // Overnight Processing Events
  // ==========================================================================

  /** Fired when overnight processing starts */
  OVERNIGHT_STARTED: 'orchestration.overnight.started',
  /** Fired when overnight processing completes */
  OVERNIGHT_COMPLETED: 'orchestration.overnight.completed',
  /** Fired when an overnight task starts */
  OVERNIGHT_TASK_STARTED: 'orchestration.overnight.task-started',
  /** Fired when an overnight task completes */
  OVERNIGHT_TASK_COMPLETED: 'orchestration.overnight.task-completed',

  // ==========================================================================
  // Reporting Events
  // ==========================================================================

  /** Fired when a daily report is generated */
  DAILY_REPORT_GENERATED: 'orchestration.report.daily-generated',
  /** Fired when agent status is collected */
  STATUS_COLLECTED: 'orchestration.report.status-collected',

  // ==========================================================================
  // Learning Events
  // ==========================================================================

  /** Fired when an error is captured for learning */
  ERROR_CAPTURED: 'orchestration.learning.error-captured',
  /** Fired when a new pattern is learned */
  PATTERN_LEARNED: 'orchestration.learning.pattern-learned',
  /** Fired when a pattern is updated */
  PATTERN_UPDATED: 'orchestration.learning.pattern-updated',
  /** Fired when an improvement is suggested */
  IMPROVEMENT_SUGGESTED: 'orchestration.learning.improvement-suggested',
  /** Fired when an improvement is applied */
  IMPROVEMENT_APPLIED: 'orchestration.learning.improvement-applied',
  /** Fired when an improvement's impact is measured */
  IMPROVEMENT_MEASURED: 'orchestration.learning.improvement-measured',
} as const;

/**
 * Type for orchestration event names
 */
export type OrchestrationEventType = typeof ORCHESTRATION_EVENTS[keyof typeof ORCHESTRATION_EVENTS];

// =============================================================================
// Event Payload Types
// =============================================================================

/**
 * Base event payload with common fields
 */
export interface BaseOrchestrationEvent {
  /** Event timestamp */
  timestamp: number;
  /** Source component */
  source: string;
}

/**
 * Agent spawned event payload
 */
export interface AgentSpawnedEvent extends BaseOrchestrationEvent {
  agentId: string;
  personaId: string;
  personaType: string;
  parentAgentId?: string;
}

/**
 * Agent terminated event payload
 */
export interface AgentTerminatedEvent extends BaseOrchestrationEvent {
  agentId: string;
  reason: string;
  wasForced: boolean;
}

/**
 * Agent status changed event payload
 */
export interface AgentStatusChangedEvent extends BaseOrchestrationEvent {
  agentId: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
}

/**
 * Agent error event payload
 */
export interface AgentErrorEvent extends BaseOrchestrationEvent {
  agentId: string;
  error: string;
  category: string;
  taskId?: string;
}

/**
 * Message event payload
 */
export interface MessageEvent extends BaseOrchestrationEvent {
  messageId: string;
  fromAgentId: string;
  toAgentId?: string;
  channelId: string;
  messageType: string;
  priority: string;
}

/**
 * Channel event payload
 */
export interface ChannelEvent extends BaseOrchestrationEvent {
  channelId: string;
  sessionId?: string;
  participantIds: string[];
}

/**
 * Session event payload
 */
export interface SessionEvent extends BaseOrchestrationEvent {
  sessionId: string;
  status: string;
  participantCount: number;
  objective?: string;
  result?: unknown;
  error?: string;
}

/**
 * Handoff event payload
 */
export interface HandoffEvent extends BaseOrchestrationEvent {
  handoffId: string;
  fromAgentId: string;
  toAgentId: string;
  task: string;
  accepted?: boolean;
}

/**
 * Task event payload
 */
export interface TaskEvent extends BaseOrchestrationEvent {
  taskId: string;
  taskName: string;
  status: string;
  progress?: number;
  agentId?: string;
  error?: string;
  result?: unknown;
}

/**
 * Overnight processing event payload
 */
export interface OvernightEvent extends BaseOrchestrationEvent {
  tasksProcessed: number;
  tasksSucceeded: number;
  tasksFailed: number;
  durationMs: number;
}

/**
 * Report event payload
 */
export interface ReportEvent extends BaseOrchestrationEvent {
  reportId: string;
  reportDate: string;
  totalAgents: number;
  systemHealth: string;
}

/**
 * Learning event payload
 */
export interface LearningEvent extends BaseOrchestrationEvent {
  errorId?: string;
  patternId?: string;
  improvementId?: string;
  category?: string;
  confidence?: number;
  applied?: boolean;
}

/**
 * Union type for all orchestration event payloads
 */
export type OrchestrationEventPayload =
  | AgentSpawnedEvent
  | AgentTerminatedEvent
  | AgentStatusChangedEvent
  | AgentErrorEvent
  | MessageEvent
  | ChannelEvent
  | SessionEvent
  | HandoffEvent
  | TaskEvent
  | OvernightEvent
  | ReportEvent
  | LearningEvent;
