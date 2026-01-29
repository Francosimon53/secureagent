// ============================================================================
// Scheduler Types
// ============================================================================

/**
 * Job status
 */
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Job handler function
 */
export type JobHandler = (context: JobContext) => Promise<void> | void;

/**
 * Job execution context
 */
export interface JobContext {
  /** Job ID */
  jobId: string;
  /** Job name */
  jobName: string;
  /** Scheduled run time */
  scheduledAt: number;
  /** Actual start time */
  startedAt: number;
  /** Previous run time (if any) */
  lastRunAt?: number;
  /** Run count */
  runCount: number;
  /** Abort signal */
  signal: AbortSignal;
  /** Custom data */
  data?: Record<string, unknown>;
}

/**
 * Job definition
 */
export interface JobDefinition {
  /** Unique job ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Cron expression or interval */
  schedule: string;
  /** Handler function name (for persistence) */
  handlerName: string;
  /** Handler function (runtime) */
  handler?: JobHandler;
  /** Is job enabled */
  enabled: boolean;
  /** Last run timestamp */
  lastRunAt?: number;
  /** Next run timestamp */
  nextRunAt?: number;
  /** Run count */
  runCount: number;
  /** Last run status */
  lastStatus?: JobStatus;
  /** Last error message */
  lastError?: string;
  /** Custom data passed to handler */
  data?: Record<string, unknown>;
  /** Timezone for cron (default: local) */
  timezone?: string;
  /** Maximum concurrent runs (default: 1) */
  maxConcurrent?: number;
  /** Retry count on failure */
  retryCount?: number;
  /** Retry delay in ms */
  retryDelayMs?: number;
  /** Job timeout in ms */
  timeoutMs?: number;
}

/**
 * Job result
 */
export interface JobResult {
  jobId: string;
  jobName: string;
  status: JobStatus;
  startedAt: number;
  completedAt: number;
  duration: number;
  error?: string;
  data?: Record<string, unknown>;
}

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  /** Tick interval in ms (default: 1000) */
  tickInterval?: number;
  /** Maximum concurrent jobs (default: 10) */
  maxConcurrentJobs?: number;
  /** Enable job persistence */
  enablePersistence?: boolean;
  /** Job timeout in ms (default: 300000 = 5 min) */
  defaultTimeoutMs?: number;
  /** Retry count on failure (default: 0) */
  defaultRetryCount?: number;
  /** Retry delay in ms (default: 60000 = 1 min) */
  defaultRetryDelayMs?: number;
}

// ============================================================================
// Trigger Types
// ============================================================================

/**
 * Trigger type
 */
export type TriggerType = 'event' | 'schedule' | 'condition';

/**
 * Trigger action type
 */
export type TriggerActionType = 'message' | 'event' | 'function';

/**
 * Trigger action configuration
 */
export interface TriggerAction {
  /** Action type */
  type: TriggerActionType;
  /** For 'message': channel to send to */
  channelId?: string;
  /** For 'message': message content */
  content?: string;
  /** For 'event': event topic to publish */
  topic?: string;
  /** For 'event': event data */
  eventData?: Record<string, unknown>;
  /** For 'function': handler name */
  handlerName?: string;
  /** For 'function': runtime handler */
  handler?: (context: TriggerContext) => Promise<void>;
}

/**
 * Trigger condition (for condition triggers)
 */
export interface TriggerCondition {
  /** Field to check */
  field: string;
  /** Comparison operator */
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'matches';
  /** Value to compare against */
  value: unknown;
}

/**
 * Trigger definition
 */
export interface TriggerDefinition {
  /** Unique trigger ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Trigger type */
  type: TriggerType;
  /** For event triggers: event topic pattern */
  eventTopic?: string;
  /** For schedule triggers: cron expression */
  schedule?: string;
  /** For condition triggers: conditions to evaluate */
  conditions?: TriggerCondition[];
  /** Action to execute when triggered */
  action: TriggerAction;
  /** Is trigger enabled */
  enabled: boolean;
  /** User ID for user-specific triggers */
  userId?: string;
  /** Last triggered timestamp */
  lastTriggeredAt?: number;
  /** Trigger count */
  triggerCount: number;
  /** Cooldown in ms between triggers */
  cooldownMs?: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Trigger execution context
 */
export interface TriggerContext {
  /** Trigger definition */
  trigger: TriggerDefinition;
  /** Event data (for event triggers) */
  eventData?: Record<string, unknown>;
  /** Event topic (for event triggers) */
  eventTopic?: string;
  /** Timestamp when triggered */
  triggeredAt: number;
  /** User ID if applicable */
  userId?: string;
}

/**
 * Trigger result
 */
export interface TriggerResult {
  triggerId: string;
  triggerName: string;
  success: boolean;
  triggeredAt: number;
  completedAt: number;
  duration: number;
  error?: string;
}

/**
 * Trigger manager configuration
 */
export interface TriggerManagerConfig {
  /** Enable trigger persistence */
  enablePersistence?: boolean;
  /** Default cooldown between trigger fires (ms) */
  defaultCooldownMs?: number;
  /** Maximum triggers per event */
  maxTriggersPerEvent?: number;
}
