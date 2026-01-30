/**
 * Memory Module Types
 *
 * Type definitions for memory storage, context accumulation, and proactive features
 */

// =============================================================================
// Memory Types
// =============================================================================

/** Memory entry type */
export type MemoryType = 'fact' | 'preference' | 'context' | 'conversation' | 'task' | 'custom';

/** Memory priority levels */
export type MemoryPriority = 'low' | 'normal' | 'high' | 'critical';

/** Memory retention policy */
export type RetentionPolicy = 'permanent' | 'session' | 'ttl' | 'decay';

/** Memory entry */
export interface Memory {
  id: string;
  userId: string;
  sessionId?: string;
  type: MemoryType;
  key: string;
  value: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  priority: MemoryPriority;
  retention: RetentionPolicy;
  ttlMs?: number;
  decayRate?: number;
  score: number;
  accessCount: number;
  lastAccessedAt: number;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

/** Input for creating a memory */
export interface MemoryCreateInput {
  userId: string;
  sessionId?: string;
  type: MemoryType;
  key: string;
  value: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  priority?: MemoryPriority;
  retention?: RetentionPolicy;
  ttlMs?: number;
  decayRate?: number;
}

/** Input for updating a memory */
export interface MemoryUpdateInput {
  value?: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  priority?: MemoryPriority;
  retention?: RetentionPolicy;
  ttlMs?: number;
  decayRate?: number;
}

/** Memory search result */
export interface MemorySearchResult {
  memory: Memory;
  similarity: number;
  relevance: number;
}

/** Memory search options */
export interface MemorySearchOptions {
  type?: MemoryType;
  minSimilarity?: number;
  minRelevance?: number;
  limit?: number;
  includeExpired?: boolean;
}

// =============================================================================
// Context Types
// =============================================================================

/** Context entry for accumulating user context */
export interface Context {
  id: string;
  userId: string;
  sessionId: string;
  type: 'message' | 'action' | 'observation' | 'inference';
  content: string;
  source: string;
  confidence: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/** Extracted preference */
export interface Preference {
  id: string;
  userId: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  sources: string[];
  createdAt: number;
  updatedAt: number;
}

/** Learned fact */
export interface LearnedFact {
  id: string;
  userId: string;
  category: string;
  fact: string;
  confidence: number;
  sources: string[];
  verifiedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** Context accumulator result */
export interface AccumulatorResult {
  preferences: Preference[];
  facts: LearnedFact[];
  memories: Memory[];
}

// =============================================================================
// Cron Scheduler Types
// =============================================================================

/** Cron schedule configuration */
export interface CronSchedule {
  id: string;
  userId: string;
  name: string;
  expression: string;
  timezone: string;
  enabled: boolean;
  handler: string;
  payload?: Record<string, unknown>;
  lastRunAt?: number;
  nextRunAt?: number;
  runCount: number;
  maxRuns?: number;
  createdAt: number;
  updatedAt: number;
}

/** Cron schedule input */
export interface CronScheduleInput {
  userId: string;
  name: string;
  expression: string;
  timezone?: string;
  handler: string;
  payload?: Record<string, unknown>;
  maxRuns?: number;
}

/** Parsed cron expression */
export interface ParsedCronExpression {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

/** Cron job execution result */
export interface CronJobResult {
  scheduleId: string;
  executedAt: number;
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
}

// =============================================================================
// Event Trigger Types
// =============================================================================

/** Trigger types */
export type TriggerType = 'file_change' | 'price_threshold' | 'time_based' | 'webhook' | 'condition' | 'schedule';

/** Trigger condition operator */
export type ConditionOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'matches';

/** Event trigger configuration */
export interface EventTrigger {
  id: string;
  userId: string;
  name: string;
  type: TriggerType;
  enabled: boolean;
  config: TriggerConfig;
  actions: TriggerAction[];
  cooldownMs?: number;
  lastTriggeredAt?: number;
  triggerCount: number;
  maxTriggers?: number;
  createdAt: number;
  updatedAt: number;
}

/** Trigger configuration by type */
export type TriggerConfig =
  | FileChangeTriggerConfig
  | PriceThresholdTriggerConfig
  | TimeBasedTriggerConfig
  | WebhookTriggerConfig
  | ConditionTriggerConfig
  | ScheduleTriggerConfig;

/** File change trigger config */
export interface FileChangeTriggerConfig {
  type: 'file_change';
  paths: string[];
  events: ('create' | 'modify' | 'delete')[];
  patterns?: string[];
  ignorePatterns?: string[];
}

/** Price threshold trigger config */
export interface PriceThresholdTriggerConfig {
  type: 'price_threshold';
  symbol: string;
  operator: 'above' | 'below' | 'crosses';
  threshold: number;
  source?: string;
}

/** Time-based trigger config */
export interface TimeBasedTriggerConfig {
  type: 'time_based';
  schedule: string;
  timezone?: string;
}

/** Webhook trigger config */
export interface WebhookTriggerConfig {
  type: 'webhook';
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  secret?: string;
  headers?: Record<string, string>;
}

/** Condition trigger config */
export interface ConditionTriggerConfig {
  type: 'condition';
  conditions: TriggerCondition[];
  logic: 'and' | 'or';
}

/** Schedule trigger config */
export interface ScheduleTriggerConfig {
  type: 'schedule';
  expression: string;
  timezone?: string;
}

/** Trigger condition */
export interface TriggerCondition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

/** Trigger action */
export interface TriggerAction {
  type: 'notify' | 'execute' | 'webhook' | 'email' | 'store';
  config: Record<string, unknown>;
}

/** Trigger event */
export interface TriggerEvent {
  triggerId: string;
  type: TriggerType;
  data: Record<string, unknown>;
  timestamp: number;
}

// =============================================================================
// Heartbeat Engine Types
// =============================================================================

/** Heartbeat configuration */
export interface HeartbeatConfig {
  id: string;
  userId: string;
  botId: string;
  name: string;
  enabled: boolean;
  intervalMs: number;
  behaviors: HeartbeatBehavior[];
  context?: Record<string, unknown>;
  lastHeartbeatAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** Heartbeat behavior */
export interface HeartbeatBehavior {
  id: string;
  name: string;
  type: 'check' | 'analyze' | 'suggest' | 'alert' | 'action';
  enabled: boolean;
  priority: number;
  config: Record<string, unknown>;
  conditions?: TriggerCondition[];
}

/** Heartbeat result */
export interface HeartbeatResult {
  configId: string;
  timestamp: number;
  behaviors: HeartbeatBehaviorResult[];
  duration: number;
}

/** Heartbeat behavior result */
export interface HeartbeatBehaviorResult {
  behaviorId: string;
  executed: boolean;
  result?: unknown;
  actions?: ProactiveAction[];
  error?: string;
}

/** Proactive action from heartbeat */
export interface ProactiveAction {
  type: 'notification' | 'suggestion' | 'alert' | 'task' | 'memory';
  priority: MemoryPriority;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  expiresAt?: number;
}

// =============================================================================
// Proactive Notifier Types
// =============================================================================

/** Notification priority queue item */
export interface QueuedNotification {
  id: string;
  userId: string;
  priority: MemoryPriority;
  type: 'info' | 'success' | 'warning' | 'error' | 'suggestion';
  title: string;
  message: string;
  source: string;
  data?: Record<string, unknown>;
  actions?: NotificationAction[];
  read: boolean;
  dismissed: boolean;
  expiresAt?: number;
  createdAt: number;
}

/** Notification action */
export interface NotificationAction {
  id: string;
  label: string;
  type: 'link' | 'action' | 'dismiss';
  config: Record<string, unknown>;
}

/** Notification preferences */
export interface NotificationPreferences {
  userId: string;
  enabled: boolean;
  channels: NotificationChannel[];
  quietHours?: QuietHours;
  filters: NotificationFilter[];
}

/** Notification channel */
export interface NotificationChannel {
  type: 'in_app' | 'email' | 'push' | 'webhook';
  enabled: boolean;
  config: Record<string, unknown>;
}

/** Quiet hours configuration */
export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
  allowCritical: boolean;
}

/** Notification filter */
export interface NotificationFilter {
  type: string;
  sources?: string[];
  priorities?: MemoryPriority[];
  action: 'allow' | 'block' | 'snooze';
}

// =============================================================================
// Encryption Types
// =============================================================================

/** Encryption configuration */
export interface EncryptionConfig {
  algorithm: 'aes-256-gcm';
  keyDerivation: 'pbkdf2' | 'scrypt' | 'argon2';
  iterations?: number;
  saltLength: number;
  ivLength: number;
  tagLength: number;
}

/** Encrypted data container */
export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
  salt: string;
  algorithm: string;
}

// =============================================================================
// Error Types
// =============================================================================

export type MemoryErrorCode =
  | 'MEMORY_NOT_FOUND'
  | 'MEMORY_EXPIRED'
  | 'MEMORY_DUPLICATE'
  | 'ENCRYPTION_FAILED'
  | 'DECRYPTION_FAILED'
  | 'INVALID_EMBEDDING'
  | 'SCHEDULE_INVALID'
  | 'TRIGGER_NOT_FOUND'
  | 'TRIGGER_DISABLED'
  | 'HEARTBEAT_FAILED'
  | 'NOTIFICATION_FAILED'
  | 'VALIDATION_ERROR';

export class MemoryError extends Error {
  constructor(
    public readonly code: MemoryErrorCode,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'MemoryError';
  }
}
