/**
 * Memory Module
 *
 * Memory & Proactivity features for SecureAgent including:
 * - Encrypted persistent memory with vector embeddings
 * - Context accumulation and preference/fact extraction
 * - POSIX cron scheduling
 * - Event-driven triggers
 * - Proactive heartbeat behaviors
 * - Priority-based notifications
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Memory types
  Memory,
  MemoryType,
  MemoryPriority,
  RetentionPolicy,
  MemoryCreateInput,
  MemoryUpdateInput,
  MemorySearchResult,
  MemorySearchOptions,

  // Context types
  Context,
  Preference,
  LearnedFact,
  AccumulatorResult,

  // Cron types
  CronSchedule,
  CronScheduleInput,
  ParsedCronExpression,
  CronJobResult,

  // Trigger types
  EventTrigger,
  TriggerConfig,
  TriggerAction,
  TriggerCondition,
  TriggerEvent,
  TriggerType,
  ConditionOperator,
  FileChangeTriggerConfig,
  PriceThresholdTriggerConfig,
  TimeBasedTriggerConfig,
  WebhookTriggerConfig,
  ConditionTriggerConfig,
  ScheduleTriggerConfig,

  // Heartbeat types
  HeartbeatConfig,
  HeartbeatBehavior,
  HeartbeatResult,
  HeartbeatBehaviorResult,
  ProactiveAction,

  // Notification types
  QueuedNotification,
  NotificationAction,
  NotificationPreferences,
  NotificationChannel,
  QuietHours,
  NotificationFilter,

  // Encryption types
  EncryptionConfig,
  EncryptedData,

  // Error types
  MemoryErrorCode,
} from './types.js';

export { MemoryError } from './types.js';

// =============================================================================
// Constants
// =============================================================================

export {
  MEMORY_EVENTS,
  MEMORY_DEFAULTS,
  CONTEXT_DEFAULTS,
  CRON_DEFAULTS,
  TRIGGER_DEFAULTS,
  HEARTBEAT_DEFAULTS,
  NOTIFICATION_DEFAULTS,
  ENCRYPTION_CONFIG,
  PRIORITY_WEIGHTS,
  PRIORITY_ORDER,
  CRON_PATTERNS,
  VALIDATION_RULES,
  ERROR_MESSAGES,
  TABLE_NAMES,
} from './constants.js';

export type { MemoryEventType } from './constants.js';

// =============================================================================
// Memory Store
// =============================================================================

export type {
  MemoryStore,
  MemoryQueryOptions,
  DatabaseAdapter,
} from './memory-store.js';

export {
  DatabaseMemoryStore,
  InMemoryMemoryStore,
  MemoryEncryption,
  cosineSimilarity,
  createMemoryStore,
} from './memory-store.js';

// =============================================================================
// Context Accumulator
// =============================================================================

export type {
  ContextStore,
  AccumulatorConfig,
} from './context-accumulator.js';

export {
  DatabaseContextStore,
  InMemoryContextStore,
  ContextAccumulator,
  createContextStore,
  createContextAccumulator,
} from './context-accumulator.js';

// =============================================================================
// Cron Scheduler
// =============================================================================

export type {
  CronScheduleStore,
  CronJobHandler,
  CronSchedulerConfig,
} from './cron-scheduler.js';

export {
  CronParser,
  DatabaseCronScheduleStore,
  InMemoryCronScheduleStore,
  CronScheduler,
  createCronScheduleStore,
  createCronScheduler,
} from './cron-scheduler.js';

// =============================================================================
// Event Trigger
// =============================================================================

export type {
  TriggerStore,
  TriggerActionHandler,
  PriceProvider,
  TriggerEngineConfig,
} from './event-trigger.js';

export {
  DatabaseTriggerStore,
  InMemoryTriggerStore,
  ConditionEvaluator,
  EventTriggerEngine,
  createTriggerStore,
  createEventTriggerEngine,
} from './event-trigger.js';

// =============================================================================
// Heartbeat Engine
// =============================================================================

export type {
  HeartbeatConfigStore,
  BehaviorHandler,
  HeartbeatEngineConfig,
} from './heartbeat-engine.js';

export {
  DatabaseHeartbeatConfigStore,
  InMemoryHeartbeatConfigStore,
  CheckBehaviorHandler,
  AnalyzeBehaviorHandler,
  SuggestBehaviorHandler,
  AlertBehaviorHandler,
  ActionBehaviorHandler,
  HeartbeatEngine,
  createBehavior,
  createHeartbeatConfigStore,
  createHeartbeatEngine,
} from './heartbeat-engine.js';

// =============================================================================
// Proactive Notifier
// =============================================================================

export type {
  NotificationStore,
  NotificationQueryOptions,
  NotificationDeliveryHandler,
  ProactiveNotifierConfig,
} from './proactive-notifier.js';

export {
  DatabaseNotificationStore,
  InMemoryNotificationStore,
  ProactiveNotifier,
  createNotificationAction,
  createDefaultPreferences,
  createNotificationStore,
  createProactiveNotifier,
} from './proactive-notifier.js';

// =============================================================================
// Memory Manager (Unified Interface)
// =============================================================================

import type { Memory, MemoryCreateInput, MemorySearchOptions, Preference, LearnedFact, CronSchedule, CronScheduleInput, EventTrigger, TriggerConfig, TriggerAction, HeartbeatConfig, HeartbeatBehavior, QueuedNotification, NotificationPreferences, ProactiveAction, MemoryPriority } from './types.js';
import { createMemoryStore, type MemoryStore, type DatabaseAdapter } from './memory-store.js';
import { createContextStore, createContextAccumulator, type ContextStore, ContextAccumulator } from './context-accumulator.js';
import { createCronScheduleStore, createCronScheduler, type CronScheduleStore, CronScheduler } from './cron-scheduler.js';
import { createTriggerStore, createEventTriggerEngine, type TriggerStore, EventTriggerEngine } from './event-trigger.js';
import { createHeartbeatConfigStore, createHeartbeatEngine, type HeartbeatConfigStore, HeartbeatEngine } from './heartbeat-engine.js';
import { createNotificationStore, createProactiveNotifier, type NotificationStore, ProactiveNotifier } from './proactive-notifier.js';
import { MEMORY_EVENTS } from './constants.js';

export interface MemoryManagerConfig {
  /** Encryption key for memory storage */
  encryptionKey: string | Buffer;
  /** Database adapter (optional, uses in-memory if not provided) */
  database?: DatabaseAdapter;
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

export interface MemoryManagerStores {
  memory: MemoryStore;
  context: ContextStore;
  cronSchedule: CronScheduleStore;
  trigger: TriggerStore;
  heartbeat: HeartbeatConfigStore;
  notification: NotificationStore;
}

export interface MemoryManagerServices {
  accumulator: ContextAccumulator;
  scheduler: CronScheduler;
  triggerEngine: EventTriggerEngine;
  heartbeatEngine: HeartbeatEngine;
  notifier: ProactiveNotifier;
}

/**
 * Unified interface for all memory and proactivity features
 */
export class MemoryManager {
  readonly stores: MemoryManagerStores;
  readonly services: MemoryManagerServices;

  private constructor(
    stores: MemoryManagerStores,
    services: MemoryManagerServices,
    private readonly config: MemoryManagerConfig
  ) {
    this.stores = stores;
    this.services = services;
  }

  /**
   * Create and initialize a MemoryManager
   */
  static async create(config: MemoryManagerConfig): Promise<MemoryManager> {
    const storeType = config.database ? 'database' : 'memory';

    // Create stores
    const stores: MemoryManagerStores = {
      memory: config.database
        ? createMemoryStore('database', config.database, config.encryptionKey)
        : createMemoryStore('memory', config.encryptionKey),
      context: config.database
        ? createContextStore('database', config.database)
        : createContextStore('memory'),
      cronSchedule: config.database
        ? createCronScheduleStore('database', config.database)
        : createCronScheduleStore('memory'),
      trigger: config.database
        ? createTriggerStore('database', config.database)
        : createTriggerStore('memory'),
      heartbeat: config.database
        ? createHeartbeatConfigStore('database', config.database)
        : createHeartbeatConfigStore('memory'),
      notification: config.database
        ? createNotificationStore('database', config.database)
        : createNotificationStore('memory'),
    };

    // Initialize all stores
    await Promise.all([
      stores.memory.initialize(),
      stores.context.initialize(),
      stores.cronSchedule.initialize(),
      stores.trigger.initialize(),
      stores.heartbeat.initialize(),
      stores.notification.initialize(),
    ]);

    // Create services
    const services: MemoryManagerServices = {
      accumulator: createContextAccumulator(stores.context, stores.memory, {
        onEvent: config.onEvent,
      }),
      scheduler: createCronScheduler(stores.cronSchedule, {
        onEvent: config.onEvent,
      }),
      triggerEngine: createEventTriggerEngine(stores.trigger, {
        onEvent: config.onEvent,
      }),
      heartbeatEngine: createHeartbeatEngine(stores.heartbeat, {
        onEvent: config.onEvent,
        onAction: async (action, hbConfig) => {
          // Queue actions as notifications
          await stores.notification.queue({
            userId: hbConfig.userId,
            priority: action.priority,
            type: action.type === 'alert' ? 'warning' : action.type === 'suggestion' ? 'info' : 'info',
            title: action.title,
            message: action.message,
            source: `heartbeat:${hbConfig.id}`,
            data: action.data,
            expiresAt: action.expiresAt,
          });
        },
      }),
      notifier: createProactiveNotifier(stores.notification, {
        onEvent: config.onEvent,
      }),
    };

    return new MemoryManager(stores, services, config);
  }

  /**
   * Start all services
   */
  async start(): Promise<void> {
    this.services.scheduler.start();
    await this.services.triggerEngine.start();
    await this.services.heartbeatEngine.start();
    this.services.notifier.start();
    this.emit(MEMORY_EVENTS.MEMORY_STORED, { status: 'manager_started' });
  }

  /**
   * Stop all services
   */
  async stop(): Promise<void> {
    this.services.scheduler.stop();
    this.services.triggerEngine.stop();
    this.services.heartbeatEngine.stop();
    this.services.notifier.stop();
    await this.stores.memory.cleanup();
    await this.services.accumulator.cleanup();
    this.emit(MEMORY_EVENTS.MEMORY_DELETED, { status: 'manager_stopped' });
  }

  // ==========================================================================
  // Memory Operations
  // ==========================================================================

  async storeMemory(input: MemoryCreateInput): Promise<Memory> {
    return this.stores.memory.store(input);
  }

  async getMemory(id: string, userId: string): Promise<Memory | null> {
    return this.stores.memory.retrieve(id, userId);
  }

  async searchMemories(
    userId: string,
    embedding: number[],
    options?: MemorySearchOptions
  ): Promise<Memory[]> {
    const results = await this.stores.memory.search(userId, embedding, options);
    return results.map(r => r.memory);
  }

  async forgetMemory(id: string, userId: string): Promise<boolean> {
    return this.stores.memory.forget(id, userId);
  }

  // ==========================================================================
  // Context Operations
  // ==========================================================================

  async accumulateContext(
    userId: string,
    sessionId: string,
    content: string,
    source?: string
  ): Promise<{ preferences: Preference[]; facts: LearnedFact[] }> {
    const result = await this.services.accumulator.accumulate(userId, sessionId, content, source);
    return { preferences: result.preferences, facts: result.facts };
  }

  async getPreferences(userId: string, category?: string): Promise<Preference[]> {
    return this.services.accumulator.getPreferences(userId, category);
  }

  async getFacts(userId: string, category?: string): Promise<LearnedFact[]> {
    return this.services.accumulator.getFacts(userId, category);
  }

  async buildContextSummary(userId: string): Promise<string> {
    return this.services.accumulator.buildContextSummary(userId);
  }

  // ==========================================================================
  // Cron Operations
  // ==========================================================================

  async createSchedule(input: CronScheduleInput): Promise<CronSchedule> {
    return this.services.scheduler.createSchedule(input);
  }

  async getSchedules(userId: string): Promise<CronSchedule[]> {
    return this.services.scheduler.getSchedules(userId);
  }

  async deleteSchedule(id: string): Promise<boolean> {
    return this.services.scheduler.deleteSchedule(id);
  }

  // ==========================================================================
  // Trigger Operations
  // ==========================================================================

  async createTrigger(
    userId: string,
    name: string,
    type: EventTrigger['type'],
    config: TriggerConfig,
    actions: TriggerAction[]
  ): Promise<EventTrigger> {
    return this.services.triggerEngine.createTrigger(userId, name, type, config, actions);
  }

  async getTriggers(userId: string): Promise<EventTrigger[]> {
    return this.services.triggerEngine.getTriggers(userId);
  }

  async deleteTrigger(id: string): Promise<boolean> {
    return this.services.triggerEngine.deleteTrigger(id);
  }

  // ==========================================================================
  // Heartbeat Operations
  // ==========================================================================

  async createHeartbeat(
    userId: string,
    botId: string,
    name: string,
    behaviors: HeartbeatBehavior[],
    options?: { intervalMs?: number }
  ): Promise<HeartbeatConfig> {
    return this.services.heartbeatEngine.createConfig(userId, botId, name, behaviors, options);
  }

  async getHeartbeats(userId: string): Promise<HeartbeatConfig[]> {
    return this.services.heartbeatEngine.getConfigs(userId);
  }

  async deleteHeartbeat(id: string): Promise<boolean> {
    return this.services.heartbeatEngine.deleteConfig(id);
  }

  // ==========================================================================
  // Notification Operations
  // ==========================================================================

  async notify(
    userId: string,
    title: string,
    message: string,
    options?: {
      type?: QueuedNotification['type'];
      priority?: MemoryPriority;
      source?: string;
    }
  ): Promise<QueuedNotification> {
    return this.services.notifier.notify(userId, title, message, options);
  }

  async getNotifications(userId: string, unreadOnly?: boolean): Promise<QueuedNotification[]> {
    return this.services.notifier.getNotifications(userId, { unreadOnly });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.services.notifier.getUnreadCount(userId);
  }

  async markNotificationAsRead(id: string): Promise<boolean> {
    return this.services.notifier.markAsRead(id);
  }

  async dismissNotification(id: string): Promise<boolean> {
    return this.services.notifier.dismiss(id);
  }

  async getNotificationPreferences(userId: string): Promise<NotificationPreferences | null> {
    return this.services.notifier.getPreferences(userId);
  }

  async updateNotificationPreferences(
    userId: string,
    updates: Partial<Omit<NotificationPreferences, 'userId'>>
  ): Promise<NotificationPreferences> {
    return this.services.notifier.updatePreferences(userId, updates);
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

/**
 * Create a MemoryManager instance
 */
export async function createMemoryManager(config: MemoryManagerConfig): Promise<MemoryManager> {
  return MemoryManager.create(config);
}
