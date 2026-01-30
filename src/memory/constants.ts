/**
 * Memory Module Constants
 *
 * Event names, default configurations, and validation rules
 */

import type { MemoryPriority, RetentionPolicy, EncryptionConfig } from './types.js';

// =============================================================================
// Memory Events
// =============================================================================

export const MEMORY_EVENTS = {
  // Memory events
  MEMORY_STORED: 'memory:stored',
  MEMORY_RETRIEVED: 'memory:retrieved',
  MEMORY_UPDATED: 'memory:updated',
  MEMORY_DELETED: 'memory:deleted',
  MEMORY_EXPIRED: 'memory:expired',
  MEMORY_SEARCHED: 'memory:searched',

  // Context events
  CONTEXT_ACCUMULATED: 'memory:context:accumulated',
  PREFERENCE_EXTRACTED: 'memory:preference:extracted',
  FACT_LEARNED: 'memory:fact:learned',
  FACT_UPDATED: 'memory:fact:updated',

  // Cron events
  CRON_SCHEDULED: 'memory:cron:scheduled',
  CRON_EXECUTED: 'memory:cron:executed',
  CRON_FAILED: 'memory:cron:failed',
  CRON_COMPLETED: 'memory:cron:completed',
  CRON_DISABLED: 'memory:cron:disabled',

  // Trigger events
  TRIGGER_CREATED: 'memory:trigger:created',
  TRIGGER_FIRED: 'memory:trigger:fired',
  TRIGGER_FAILED: 'memory:trigger:failed',
  TRIGGER_DISABLED: 'memory:trigger:disabled',
  TRIGGER_COOLDOWN: 'memory:trigger:cooldown',

  // Heartbeat events
  HEARTBEAT_STARTED: 'memory:heartbeat:started',
  HEARTBEAT_TICK: 'memory:heartbeat:tick',
  HEARTBEAT_ACTION: 'memory:heartbeat:action',
  HEARTBEAT_STOPPED: 'memory:heartbeat:stopped',
  HEARTBEAT_ERROR: 'memory:heartbeat:error',

  // Notification events
  NOTIFICATION_QUEUED: 'memory:notification:queued',
  NOTIFICATION_DELIVERED: 'memory:notification:delivered',
  NOTIFICATION_READ: 'memory:notification:read',
  NOTIFICATION_DISMISSED: 'memory:notification:dismissed',
  NOTIFICATION_EXPIRED: 'memory:notification:expired',
} as const;

export type MemoryEventType = typeof MEMORY_EVENTS[keyof typeof MEMORY_EVENTS];

// =============================================================================
// Default Configurations
// =============================================================================

export const MEMORY_DEFAULTS = {
  /** Default memory priority */
  DEFAULT_PRIORITY: 'normal' as MemoryPriority,

  /** Default retention policy */
  DEFAULT_RETENTION: 'permanent' as RetentionPolicy,

  /** Default TTL in milliseconds (24 hours) */
  DEFAULT_TTL_MS: 24 * 60 * 60 * 1000,

  /** Default decay rate (per day) */
  DEFAULT_DECAY_RATE: 0.1,

  /** Default search limit */
  DEFAULT_SEARCH_LIMIT: 10,

  /** Minimum similarity threshold for search */
  MIN_SIMILARITY_THRESHOLD: 0.5,

  /** Default embedding dimensions */
  EMBEDDING_DIMENSIONS: 1536,

  /** Maximum memory value length */
  MAX_MEMORY_VALUE_LENGTH: 100000,

  /** Maximum metadata size in bytes */
  MAX_METADATA_SIZE: 10240,

  /** Memory cleanup interval in ms */
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000, // 1 hour

  /** Session memory TTL in ms */
  SESSION_MEMORY_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
} as const;

export const CONTEXT_DEFAULTS = {
  /** Minimum confidence threshold for preferences */
  MIN_PREFERENCE_CONFIDENCE: 0.6,

  /** Minimum confidence threshold for facts */
  MIN_FACT_CONFIDENCE: 0.7,

  /** Maximum context entries per session */
  MAX_CONTEXT_ENTRIES: 1000,

  /** Context accumulation batch size */
  ACCUMULATION_BATCH_SIZE: 10,

  /** Context retention period in ms */
  CONTEXT_RETENTION_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;

export const CRON_DEFAULTS = {
  /** Default timezone */
  DEFAULT_TIMEZONE: 'UTC',

  /** Maximum concurrent cron jobs */
  MAX_CONCURRENT_JOBS: 10,

  /** Job execution timeout in ms */
  JOB_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes

  /** Minimum schedule interval in ms */
  MIN_INTERVAL_MS: 60 * 1000, // 1 minute

  /** Maximum schedule lookahead in ms */
  MAX_LOOKAHEAD_MS: 24 * 60 * 60 * 1000, // 24 hours

  /** Scheduler tick interval in ms */
  SCHEDULER_TICK_MS: 1000,
} as const;

export const TRIGGER_DEFAULTS = {
  /** Default cooldown period in ms */
  DEFAULT_COOLDOWN_MS: 5 * 60 * 1000, // 5 minutes

  /** Maximum triggers per user */
  MAX_TRIGGERS_PER_USER: 100,

  /** Maximum actions per trigger */
  MAX_ACTIONS_PER_TRIGGER: 10,

  /** File watcher debounce in ms */
  FILE_WATCHER_DEBOUNCE_MS: 1000,

  /** Price check interval in ms */
  PRICE_CHECK_INTERVAL_MS: 60 * 1000, // 1 minute

  /** Webhook timeout in ms */
  WEBHOOK_TIMEOUT_MS: 30 * 1000, // 30 seconds
} as const;

export const HEARTBEAT_DEFAULTS = {
  /** Default heartbeat interval in ms */
  DEFAULT_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes

  /** Minimum heartbeat interval in ms */
  MIN_INTERVAL_MS: 60 * 1000, // 1 minute

  /** Maximum heartbeat interval in ms */
  MAX_INTERVAL_MS: 24 * 60 * 60 * 1000, // 24 hours

  /** Maximum behaviors per config */
  MAX_BEHAVIORS: 20,

  /** Behavior execution timeout in ms */
  BEHAVIOR_TIMEOUT_MS: 30 * 1000, // 30 seconds
} as const;

export const NOTIFICATION_DEFAULTS = {
  /** Maximum queue size per user */
  MAX_QUEUE_SIZE: 100,

  /** Default notification expiry in ms */
  DEFAULT_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000, // 7 days

  /** Batch delivery size */
  BATCH_SIZE: 10,

  /** Delivery retry count */
  MAX_RETRIES: 3,

  /** Retry delay in ms */
  RETRY_DELAY_MS: 5000,

  /** Quiet hours check interval in ms */
  QUIET_HOURS_CHECK_MS: 60 * 1000, // 1 minute
} as const;

// =============================================================================
// Encryption Configuration
// =============================================================================

export const ENCRYPTION_CONFIG: EncryptionConfig = {
  algorithm: 'aes-256-gcm',
  keyDerivation: 'pbkdf2',
  iterations: 100000,
  saltLength: 16,
  ivLength: 12,
  tagLength: 16,
};

// =============================================================================
// Priority Weights
// =============================================================================

export const PRIORITY_WEIGHTS: Record<MemoryPriority, number> = {
  low: 1,
  normal: 2,
  high: 4,
  critical: 8,
};

export const PRIORITY_ORDER: MemoryPriority[] = ['critical', 'high', 'normal', 'low'];

// =============================================================================
// Cron Expression Patterns
// =============================================================================

export const CRON_PATTERNS = {
  /** Every minute */
  EVERY_MINUTE: '* * * * *',

  /** Every 5 minutes */
  EVERY_5_MINUTES: '*/5 * * * *',

  /** Every 15 minutes */
  EVERY_15_MINUTES: '*/15 * * * *',

  /** Every 30 minutes */
  EVERY_30_MINUTES: '*/30 * * * *',

  /** Every hour */
  EVERY_HOUR: '0 * * * *',

  /** Every day at midnight */
  DAILY_MIDNIGHT: '0 0 * * *',

  /** Every day at 9am */
  DAILY_9AM: '0 9 * * *',

  /** Every Monday at 9am */
  WEEKLY_MONDAY_9AM: '0 9 * * 1',

  /** First of month at midnight */
  MONTHLY_FIRST: '0 0 1 * *',

  /** Weekdays at 9am */
  WEEKDAYS_9AM: '0 9 * * 1-5',
} as const;

// =============================================================================
// Validation Rules
// =============================================================================

export const VALIDATION_RULES = {
  memory: {
    keyMinLength: 1,
    keyMaxLength: 256,
    valueMinLength: 1,
    valueMaxLength: 100000,
    metadataMaxSize: 10240,
  },
  cron: {
    nameMinLength: 1,
    nameMaxLength: 128,
    expressionPattern: /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/,
  },
  trigger: {
    nameMinLength: 1,
    nameMaxLength: 128,
    maxConditions: 10,
    maxActions: 10,
  },
  notification: {
    titleMinLength: 1,
    titleMaxLength: 256,
    messageMinLength: 1,
    messageMaxLength: 4096,
  },
} as const;

// =============================================================================
// Error Messages
// =============================================================================

export const ERROR_MESSAGES = {
  MEMORY_NOT_FOUND: 'Memory entry not found',
  MEMORY_EXPIRED: 'Memory entry has expired',
  MEMORY_DUPLICATE: 'Memory entry with this key already exists',
  ENCRYPTION_FAILED: 'Failed to encrypt data',
  DECRYPTION_FAILED: 'Failed to decrypt data',
  INVALID_EMBEDDING: 'Invalid embedding vector',
  SCHEDULE_INVALID: 'Invalid cron schedule expression',
  TRIGGER_NOT_FOUND: 'Trigger not found',
  TRIGGER_DISABLED: 'Trigger is disabled',
  HEARTBEAT_FAILED: 'Heartbeat execution failed',
  NOTIFICATION_FAILED: 'Failed to deliver notification',
  VALIDATION_ERROR: 'Validation failed',
} as const;

// =============================================================================
// Database Table Names
// =============================================================================

export const TABLE_NAMES = {
  MEMORIES: 'memories',
  CONTEXTS: 'contexts',
  PREFERENCES: 'preferences',
  LEARNED_FACTS: 'learned_facts',
  CRON_SCHEDULES: 'cron_schedules',
  CRON_HISTORY: 'cron_history',
  TRIGGERS: 'triggers',
  TRIGGER_HISTORY: 'trigger_history',
  HEARTBEAT_CONFIGS: 'heartbeat_configs',
  NOTIFICATIONS: 'notifications',
  NOTIFICATION_PREFERENCES: 'notification_preferences',
} as const;
