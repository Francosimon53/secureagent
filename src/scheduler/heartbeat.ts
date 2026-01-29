import { randomUUID } from 'crypto';
import { EventBus, getEventBus, Event } from '../events/index.js';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'HeartbeatEngine' });

// ============================================================================
// Heartbeat Types
// ============================================================================

/**
 * Heartbeat configuration for a user/channel
 */
export interface HeartbeatConfig {
  /** Unique heartbeat ID */
  id: string;
  /** User ID */
  userId: string;
  /** Channel ID for message delivery */
  channelId: string;
  /** Channel type (slack, discord, etc.) */
  channelType: string;
  /** Heartbeat interval in milliseconds */
  intervalMs: number;
  /** Message generator function name */
  messageGeneratorName?: string;
  /** Custom message generator */
  messageGenerator?: (context: HeartbeatContext) => Promise<HeartbeatMessage | null>;
  /** Condition checker - return true to send heartbeat */
  conditionChecker?: (context: HeartbeatContext) => Promise<boolean>;
  /** Condition checker function name */
  conditionCheckerName?: string;
  /** Is heartbeat active */
  active: boolean;
  /** Last heartbeat timestamp */
  lastHeartbeatAt?: number;
  /** Heartbeat count */
  heartbeatCount: number;
  /** Quiet hours (don't send during these hours) */
  quietHours?: { start: number; end: number };
  /** Days to skip (0=Sunday, 6=Saturday) */
  skipDays?: number[];
  /** Maximum heartbeats per day */
  maxPerDay?: number;
  /** Heartbeats sent today */
  sentToday: number;
  /** Last reset date (YYYY-MM-DD) */
  lastResetDate?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Context passed to message generators and condition checkers
 */
export interface HeartbeatContext {
  /** Heartbeat config */
  config: HeartbeatConfig;
  /** User ID */
  userId: string;
  /** Channel ID */
  channelId: string;
  /** Time since last heartbeat (ms) */
  timeSinceLastHeartbeat: number;
  /** Current timestamp */
  timestamp: number;
  /** Day of week (0=Sunday) */
  dayOfWeek: number;
  /** Hour of day (0-23) */
  hourOfDay: number;
  /** Total heartbeats sent */
  totalHeartbeats: number;
  /** Heartbeats sent today */
  sentToday: number;
}

/**
 * Heartbeat message to send
 */
export interface HeartbeatMessage {
  /** Message content */
  content: string;
  /** Optional structured data */
  data?: Record<string, unknown>;
  /** Message type */
  type?: 'text' | 'reminder' | 'update' | 'prompt' | 'custom';
  /** Priority (higher = more important) */
  priority?: number;
}

/**
 * Heartbeat event data
 */
export interface HeartbeatEvent {
  heartbeatId: string;
  userId: string;
  channelId: string;
  channelType: string;
  message: HeartbeatMessage;
  timestamp: number;
}

/**
 * Heartbeat engine configuration
 */
export interface HeartbeatEngineConfig {
  /** Tick interval for checking heartbeats (default: 60000ms = 1 min) */
  tickInterval?: number;
  /** Default heartbeat interval (default: 86400000ms = 24h) */
  defaultInterval?: number;
  /** Default quiet hours */
  defaultQuietHours?: { start: number; end: number };
  /** Enable persistence */
  enablePersistence?: boolean;
}

// ============================================================================
// Heartbeat Engine Implementation
// ============================================================================

/**
 * Engine for managing proactive bot-initiated messages
 * Sends periodic "heartbeat" messages to users based on configurable schedules
 */
export class HeartbeatEngine {
  private readonly heartbeats = new Map<string, HeartbeatConfig>();
  private readonly messageGenerators = new Map<string, (context: HeartbeatContext) => Promise<HeartbeatMessage | null>>();
  private readonly conditionCheckers = new Map<string, (context: HeartbeatContext) => Promise<boolean>>();
  private readonly config: Required<HeartbeatEngineConfig>;
  private tickTimer: NodeJS.Timeout | null = null;
  private eventBus: EventBus | null = null;
  private started = false;

  constructor(config: HeartbeatEngineConfig = {}) {
    this.config = {
      tickInterval: config.tickInterval ?? 60000,
      defaultInterval: config.defaultInterval ?? 86400000,
      defaultQuietHours: config.defaultQuietHours ?? { start: 22, end: 8 },
      enablePersistence: config.enablePersistence ?? false,
    };
  }

  /**
   * Initialize the heartbeat engine
   */
  async initialize(): Promise<void> {
    this.eventBus = getEventBus();

    // Register built-in message generators
    this.registerMessageGenerator('default', async () => ({
      content: 'Hello! Just checking in.',
      type: 'text' as const,
    }));

    this.registerMessageGenerator('reminder', async (ctx) => ({
      content: `Reminder: It's been ${Math.round(ctx.timeSinceLastHeartbeat / 3600000)} hours since we last connected.`,
      type: 'reminder' as const,
    }));

    logger.info({ config: this.config }, 'Heartbeat engine initialized');
  }

  /**
   * Register a message generator function
   */
  registerMessageGenerator(
    name: string,
    generator: (context: HeartbeatContext) => Promise<HeartbeatMessage | null>
  ): void {
    this.messageGenerators.set(name, generator);
    logger.debug({ name }, 'Message generator registered');
  }

  /**
   * Register a condition checker function
   */
  registerConditionChecker(
    name: string,
    checker: (context: HeartbeatContext) => Promise<boolean>
  ): void {
    this.conditionCheckers.set(name, checker);
    logger.debug({ name }, 'Condition checker registered');
  }

  /**
   * Register a new heartbeat for a user
   */
  register(
    userId: string,
    channelId: string,
    channelType: string,
    options: Partial<HeartbeatConfig> = {}
  ): string {
    const id = options.id ?? randomUUID();

    const heartbeat: HeartbeatConfig = {
      id,
      userId,
      channelId,
      channelType,
      intervalMs: options.intervalMs ?? this.config.defaultInterval,
      messageGeneratorName: options.messageGeneratorName ?? 'default',
      messageGenerator: options.messageGenerator,
      conditionChecker: options.conditionChecker,
      conditionCheckerName: options.conditionCheckerName,
      active: options.active ?? true,
      heartbeatCount: options.heartbeatCount ?? 0,
      quietHours: options.quietHours ?? this.config.defaultQuietHours,
      skipDays: options.skipDays,
      maxPerDay: options.maxPerDay,
      sentToday: options.sentToday ?? 0,
      metadata: options.metadata,
    };

    this.heartbeats.set(id, heartbeat);

    logger.info(
      { heartbeatId: id, userId, channelId, intervalMs: heartbeat.intervalMs },
      'Heartbeat registered'
    );

    return id;
  }

  /**
   * Unregister a heartbeat
   */
  unregister(heartbeatId: string): boolean {
    const heartbeat = this.heartbeats.get(heartbeatId);
    if (!heartbeat) return false;

    this.heartbeats.delete(heartbeatId);
    logger.info({ heartbeatId, userId: heartbeat.userId }, 'Heartbeat unregistered');

    return true;
  }

  /**
   * Pause a heartbeat
   */
  pause(heartbeatId: string): boolean {
    const heartbeat = this.heartbeats.get(heartbeatId);
    if (!heartbeat) return false;

    heartbeat.active = false;
    logger.info({ heartbeatId }, 'Heartbeat paused');

    return true;
  }

  /**
   * Resume a heartbeat
   */
  resume(heartbeatId: string): boolean {
    const heartbeat = this.heartbeats.get(heartbeatId);
    if (!heartbeat) return false;

    heartbeat.active = true;
    logger.info({ heartbeatId }, 'Heartbeat resumed');

    return true;
  }

  /**
   * Update heartbeat configuration
   */
  update(heartbeatId: string, updates: Partial<HeartbeatConfig>): boolean {
    const heartbeat = this.heartbeats.get(heartbeatId);
    if (!heartbeat) return false;

    Object.assign(heartbeat, updates);
    logger.debug({ heartbeatId, updates: Object.keys(updates) }, 'Heartbeat updated');

    return true;
  }

  /**
   * Get a heartbeat by ID
   */
  get(heartbeatId: string): HeartbeatConfig | undefined {
    return this.heartbeats.get(heartbeatId);
  }

  /**
   * Get heartbeats for a user
   */
  getByUser(userId: string): HeartbeatConfig[] {
    return Array.from(this.heartbeats.values()).filter(h => h.userId === userId);
  }

  /**
   * Get heartbeats for a channel
   */
  getByChannel(channelId: string): HeartbeatConfig[] {
    return Array.from(this.heartbeats.values()).filter(h => h.channelId === channelId);
  }

  /**
   * List all heartbeats
   */
  list(filters?: { active?: boolean; userId?: string }): HeartbeatConfig[] {
    let results = Array.from(this.heartbeats.values());

    if (filters?.active !== undefined) {
      results = results.filter(h => h.active === filters.active);
    }
    if (filters?.userId) {
      results = results.filter(h => h.userId === filters.userId);
    }

    return results;
  }

  /**
   * Start the heartbeat engine
   */
  start(): void {
    if (this.started) return;

    this.started = true;

    this.tickTimer = setInterval(() => {
      this.tick().catch(err => {
        logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Heartbeat tick error');
      });
    }, this.config.tickInterval);

    logger.info({ tickInterval: this.config.tickInterval }, 'Heartbeat engine started');
  }

  /**
   * Stop the heartbeat engine
   */
  async stop(): Promise<void> {
    if (!this.started) return;

    this.started = false;

    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    logger.info('Heartbeat engine stopped');
  }

  /**
   * Manually trigger a heartbeat
   */
  async trigger(heartbeatId: string): Promise<boolean> {
    const heartbeat = this.heartbeats.get(heartbeatId);
    if (!heartbeat) return false;

    return this.sendHeartbeat(heartbeat);
  }

  /**
   * Get engine statistics
   */
  getStats(): {
    totalHeartbeats: number;
    activeHeartbeats: number;
    totalSent: number;
  } {
    const heartbeats = Array.from(this.heartbeats.values());
    return {
      totalHeartbeats: heartbeats.length,
      activeHeartbeats: heartbeats.filter(h => h.active).length,
      totalSent: heartbeats.reduce((sum, h) => sum + h.heartbeatCount, 0),
    };
  }

  /**
   * Check if engine is running
   */
  isRunning(): boolean {
    return this.started;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async tick(): Promise<void> {
    const now = Date.now();
    const currentDate = new Date();
    const today = currentDate.toISOString().split('T')[0];
    const dayOfWeek = currentDate.getDay();
    const hourOfDay = currentDate.getHours();

    for (const heartbeat of this.heartbeats.values()) {
      if (!heartbeat.active) continue;

      // Reset daily counter if new day
      if (heartbeat.lastResetDate !== today) {
        heartbeat.sentToday = 0;
        heartbeat.lastResetDate = today;
      }

      // Check if heartbeat is due
      const timeSinceLast = heartbeat.lastHeartbeatAt
        ? now - heartbeat.lastHeartbeatAt
        : Infinity;

      if (timeSinceLast < heartbeat.intervalMs) continue;

      // Check quiet hours
      if (heartbeat.quietHours) {
        const { start, end } = heartbeat.quietHours;
        if (start > end) {
          // Quiet hours span midnight (e.g., 22:00 - 08:00)
          if (hourOfDay >= start || hourOfDay < end) continue;
        } else {
          // Quiet hours within same day (e.g., 02:00 - 06:00)
          if (hourOfDay >= start && hourOfDay < end) continue;
        }
      }

      // Check skip days
      if (heartbeat.skipDays?.includes(dayOfWeek)) continue;

      // Check daily limit
      if (heartbeat.maxPerDay && heartbeat.sentToday >= heartbeat.maxPerDay) continue;

      // Send the heartbeat
      try {
        const sent = await this.sendHeartbeat(heartbeat);
        if (sent) {
          heartbeat.lastHeartbeatAt = now;
          heartbeat.heartbeatCount++;
          heartbeat.sentToday++;
        }
      } catch (error) {
        logger.error(
          { heartbeatId: heartbeat.id, error: error instanceof Error ? error.message : String(error) },
          'Failed to send heartbeat'
        );
      }
    }
  }

  private async sendHeartbeat(heartbeat: HeartbeatConfig): Promise<boolean> {
    const now = Date.now();
    const currentDate = new Date();

    const context: HeartbeatContext = {
      config: heartbeat,
      userId: heartbeat.userId,
      channelId: heartbeat.channelId,
      timeSinceLastHeartbeat: heartbeat.lastHeartbeatAt
        ? now - heartbeat.lastHeartbeatAt
        : Infinity,
      timestamp: now,
      dayOfWeek: currentDate.getDay(),
      hourOfDay: currentDate.getHours(),
      totalHeartbeats: heartbeat.heartbeatCount,
      sentToday: heartbeat.sentToday,
    };

    // Check condition if specified
    if (heartbeat.conditionChecker) {
      const shouldSend = await heartbeat.conditionChecker(context);
      if (!shouldSend) {
        logger.debug({ heartbeatId: heartbeat.id }, 'Heartbeat condition not met');
        return false;
      }
    } else if (heartbeat.conditionCheckerName) {
      const checker = this.conditionCheckers.get(heartbeat.conditionCheckerName);
      if (checker) {
        const shouldSend = await checker(context);
        if (!shouldSend) {
          logger.debug({ heartbeatId: heartbeat.id }, 'Heartbeat condition not met');
          return false;
        }
      }
    }

    // Generate message
    let message: HeartbeatMessage | null = null;

    if (heartbeat.messageGenerator) {
      message = await heartbeat.messageGenerator(context);
    } else if (heartbeat.messageGeneratorName) {
      const generator = this.messageGenerators.get(heartbeat.messageGeneratorName);
      if (generator) {
        message = await generator(context);
      }
    }

    if (!message) {
      logger.debug({ heartbeatId: heartbeat.id }, 'No message generated');
      return false;
    }

    // Emit heartbeat event for delivery
    if (this.eventBus) {
      const eventData: HeartbeatEvent = {
        heartbeatId: heartbeat.id,
        userId: heartbeat.userId,
        channelId: heartbeat.channelId,
        channelType: heartbeat.channelType,
        message,
        timestamp: now,
      };

      await this.eventBus.publish('heartbeat.send', eventData);

      logger.info(
        { heartbeatId: heartbeat.id, userId: heartbeat.userId, channelId: heartbeat.channelId },
        'Heartbeat sent'
      );
    }

    return true;
  }
}

// ============================================================================
// Factory and Global Instance
// ============================================================================

let globalHeartbeatEngine: HeartbeatEngine | null = null;

/**
 * Initialize the global heartbeat engine
 */
export async function initHeartbeatEngine(
  config?: HeartbeatEngineConfig
): Promise<HeartbeatEngine> {
  globalHeartbeatEngine = new HeartbeatEngine(config);
  await globalHeartbeatEngine.initialize();
  return globalHeartbeatEngine;
}

/**
 * Get the global heartbeat engine
 */
export function getHeartbeatEngine(): HeartbeatEngine {
  if (!globalHeartbeatEngine) {
    throw new Error('Heartbeat engine not initialized. Call initHeartbeatEngine() first.');
  }
  return globalHeartbeatEngine;
}

/**
 * Check if heartbeat engine is initialized
 */
export function isHeartbeatEngineInitialized(): boolean {
  return globalHeartbeatEngine !== null;
}
