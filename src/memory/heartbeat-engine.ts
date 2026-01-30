/**
 * Heartbeat Engine
 *
 * Proactive bot behavior with periodic checks, analysis, and suggestions
 */

import { randomUUID } from 'crypto';
import type {
  HeartbeatConfig,
  HeartbeatBehavior,
  HeartbeatResult,
  HeartbeatBehaviorResult,
  ProactiveAction,
  TriggerCondition,
} from './types.js';
import { MemoryError } from './types.js';
import { HEARTBEAT_DEFAULTS, MEMORY_EVENTS, TABLE_NAMES } from './constants.js';
import { ConditionEvaluator } from './event-trigger.js';

// =============================================================================
// Database Adapter Interface
// =============================================================================

export interface DatabaseAdapter {
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

// =============================================================================
// Heartbeat Config Store Interface
// =============================================================================

export interface HeartbeatConfigStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Create a heartbeat config */
  create(config: Omit<HeartbeatConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<HeartbeatConfig>;

  /** Get config by ID */
  get(id: string): Promise<HeartbeatConfig | null>;

  /** Get configs for a user */
  getByUserId(userId: string): Promise<HeartbeatConfig[]>;

  /** Get enabled configs */
  getEnabled(): Promise<HeartbeatConfig[]>;

  /** Update config */
  update(id: string, updates: Partial<HeartbeatConfig>): Promise<HeartbeatConfig | null>;

  /** Delete config */
  delete(id: string): Promise<boolean>;
}

// =============================================================================
// Database Row Type
// =============================================================================

interface HeartbeatConfigRow {
  id: string;
  user_id: string;
  bot_id: string;
  name: string;
  enabled: number;
  interval_ms: number;
  behaviors: string;
  context: string | null;
  last_heartbeat_at: number | null;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Database Heartbeat Config Store
// =============================================================================

export class DatabaseHeartbeatConfigStore implements HeartbeatConfigStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.HEARTBEAT_CONFIGS} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        bot_id TEXT NOT NULL,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        interval_ms INTEGER NOT NULL,
        behaviors TEXT NOT NULL,
        context TEXT,
        last_heartbeat_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_heartbeat_configs_user ON ${TABLE_NAMES.HEARTBEAT_CONFIGS}(user_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_heartbeat_configs_bot ON ${TABLE_NAMES.HEARTBEAT_CONFIGS}(bot_id)
    `);
  }

  async create(input: Omit<HeartbeatConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<HeartbeatConfig> {
    const now = Date.now();
    const id = randomUUID();

    const config: HeartbeatConfig = {
      ...input,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO ${TABLE_NAMES.HEARTBEAT_CONFIGS} (
        id, user_id, bot_id, name, enabled, interval_ms, behaviors, context,
        last_heartbeat_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        config.id,
        config.userId,
        config.botId,
        config.name,
        config.enabled ? 1 : 0,
        config.intervalMs,
        JSON.stringify(config.behaviors),
        config.context ? JSON.stringify(config.context) : null,
        config.lastHeartbeatAt ?? null,
        config.createdAt,
        config.updatedAt,
      ]
    );

    return config;
  }

  async get(id: string): Promise<HeartbeatConfig | null> {
    const result = await this.db.execute<HeartbeatConfigRow>(
      `SELECT * FROM ${TABLE_NAMES.HEARTBEAT_CONFIGS} WHERE id = ?`,
      [id]
    );
    return result.length > 0 ? this.rowToConfig(result[0]) : null;
  }

  async getByUserId(userId: string): Promise<HeartbeatConfig[]> {
    const result = await this.db.execute<HeartbeatConfigRow>(
      `SELECT * FROM ${TABLE_NAMES.HEARTBEAT_CONFIGS} WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
    return result.map(row => this.rowToConfig(row));
  }

  async getEnabled(): Promise<HeartbeatConfig[]> {
    const result = await this.db.execute<HeartbeatConfigRow>(
      `SELECT * FROM ${TABLE_NAMES.HEARTBEAT_CONFIGS} WHERE enabled = 1`
    );
    return result.map(row => this.rowToConfig(row));
  }

  async update(id: string, updates: Partial<HeartbeatConfig>): Promise<HeartbeatConfig | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, updatedAt: Date.now() };

    await this.db.execute(
      `UPDATE ${TABLE_NAMES.HEARTBEAT_CONFIGS} SET
        name = ?, enabled = ?, interval_ms = ?, behaviors = ?, context = ?,
        last_heartbeat_at = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.enabled ? 1 : 0,
        updated.intervalMs,
        JSON.stringify(updated.behaviors),
        updated.context ? JSON.stringify(updated.context) : null,
        updated.lastHeartbeatAt ?? null,
        updated.updatedAt,
        id,
      ]
    );

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.execute(
      `DELETE FROM ${TABLE_NAMES.HEARTBEAT_CONFIGS} WHERE id = ?`,
      [id]
    );
    return (result as unknown as { changes: number }).changes > 0;
  }

  private rowToConfig(row: HeartbeatConfigRow): HeartbeatConfig {
    return {
      id: row.id,
      userId: row.user_id,
      botId: row.bot_id,
      name: row.name,
      enabled: row.enabled === 1,
      intervalMs: row.interval_ms,
      behaviors: JSON.parse(row.behaviors),
      context: row.context ? JSON.parse(row.context) : undefined,
      lastHeartbeatAt: row.last_heartbeat_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Heartbeat Config Store
// =============================================================================

export class InMemoryHeartbeatConfigStore implements HeartbeatConfigStore {
  private configs = new Map<string, HeartbeatConfig>();

  async initialize(): Promise<void> {
    // No-op
  }

  async create(input: Omit<HeartbeatConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<HeartbeatConfig> {
    const now = Date.now();
    const config: HeartbeatConfig = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.configs.set(config.id, config);
    return { ...config };
  }

  async get(id: string): Promise<HeartbeatConfig | null> {
    const config = this.configs.get(id);
    return config ? { ...config } : null;
  }

  async getByUserId(userId: string): Promise<HeartbeatConfig[]> {
    return Array.from(this.configs.values())
      .filter(c => c.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(c => ({ ...c }));
  }

  async getEnabled(): Promise<HeartbeatConfig[]> {
    return Array.from(this.configs.values())
      .filter(c => c.enabled)
      .map(c => ({ ...c }));
  }

  async update(id: string, updates: Partial<HeartbeatConfig>): Promise<HeartbeatConfig | null> {
    const existing = this.configs.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, updatedAt: Date.now() };
    this.configs.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    return this.configs.delete(id);
  }
}

// =============================================================================
// Behavior Handler Interface
// =============================================================================

export interface BehaviorHandler {
  /**
   * Execute the behavior and return actions to take
   */
  execute(
    behavior: HeartbeatBehavior,
    config: HeartbeatConfig,
    context: Record<string, unknown>
  ): Promise<HeartbeatBehaviorResult>;
}

// =============================================================================
// Built-in Behavior Handlers
// =============================================================================

export class CheckBehaviorHandler implements BehaviorHandler {
  async execute(
    behavior: HeartbeatBehavior,
    config: HeartbeatConfig,
    context: Record<string, unknown>
  ): Promise<HeartbeatBehaviorResult> {
    const actions: ProactiveAction[] = [];

    // Check conditions
    const conditions = behavior.conditions ?? [];
    const passed = ConditionEvaluator.evaluateAll(conditions, context, 'and');

    const onPass = behavior.config.onPass as { title?: string; message?: string } | undefined;
    const onFail = behavior.config.onFail as { title?: string; message?: string } | undefined;

    if (passed && onPass) {
      actions.push({
        type: 'notification',
        priority: 'normal',
        title: onPass.title ?? behavior.name,
        message: onPass.message ?? 'Check passed',
        data: { behaviorId: behavior.id, configId: config.id },
      });
    }

    if (!passed && onFail) {
      actions.push({
        type: 'alert',
        priority: 'high',
        title: onFail.title ?? behavior.name,
        message: onFail.message ?? 'Check failed',
        data: { behaviorId: behavior.id, configId: config.id },
      });
    }

    return {
      behaviorId: behavior.id,
      executed: true,
      result: { passed },
      actions,
    };
  }
}

export class AnalyzeBehaviorHandler implements BehaviorHandler {
  async execute(
    behavior: HeartbeatBehavior,
    config: HeartbeatConfig,
    context: Record<string, unknown>
  ): Promise<HeartbeatBehaviorResult> {
    const actions: ProactiveAction[] = [];

    // Extract metrics from context
    const metrics = behavior.config.metrics as string[] | undefined;
    const results: Record<string, unknown> = {};

    if (metrics) {
      for (const metric of metrics) {
        const value = this.extractMetric(context, metric);
        results[metric] = value;

        // Check thresholds
        const thresholds = behavior.config.thresholds as Record<string, { warning?: number; critical?: number }> | undefined;
        if (thresholds?.[metric] && typeof value === 'number') {
          if (thresholds[metric].critical !== undefined && value >= thresholds[metric].critical!) {
            actions.push({
              type: 'alert',
              priority: 'critical',
              title: `Critical: ${metric}`,
              message: `${metric} is at ${value} (threshold: ${thresholds[metric].critical})`,
              data: { metric, value, threshold: thresholds[metric].critical },
            });
          } else if (thresholds[metric].warning !== undefined && value >= thresholds[metric].warning!) {
            actions.push({
              type: 'alert',
              priority: 'high',
              title: `Warning: ${metric}`,
              message: `${metric} is at ${value} (threshold: ${thresholds[metric].warning})`,
              data: { metric, value, threshold: thresholds[metric].warning },
            });
          }
        }
      }
    }

    return {
      behaviorId: behavior.id,
      executed: true,
      result: results,
      actions,
    };
  }

  private extractMetric(context: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let value: unknown = context;
    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  }
}

export class SuggestBehaviorHandler implements BehaviorHandler {
  async execute(
    behavior: HeartbeatBehavior,
    config: HeartbeatConfig,
    _context: Record<string, unknown>
  ): Promise<HeartbeatBehaviorResult> {
    const suggestions = behavior.config.suggestions as Array<{
      condition?: TriggerCondition[];
      title: string;
      message: string;
      priority?: string;
    }> | undefined;

    const actions: ProactiveAction[] = [];

    if (suggestions) {
      for (const suggestion of suggestions) {
        // Check conditions if present
        if (suggestion.condition) {
          if (!ConditionEvaluator.evaluateAll(suggestion.condition, _context, 'and')) {
            continue;
          }
        }

        actions.push({
          type: 'suggestion',
          priority: (suggestion.priority ?? 'normal') as ProactiveAction['priority'],
          title: suggestion.title,
          message: suggestion.message,
          data: { behaviorId: behavior.id, configId: config.id },
        });
      }
    }

    return {
      behaviorId: behavior.id,
      executed: true,
      actions,
    };
  }
}

export class AlertBehaviorHandler implements BehaviorHandler {
  async execute(
    behavior: HeartbeatBehavior,
    config: HeartbeatConfig,
    context: Record<string, unknown>
  ): Promise<HeartbeatBehaviorResult> {
    const conditions = behavior.conditions ?? [];
    const actions: ProactiveAction[] = [];

    // Only alert if conditions are met
    const shouldAlert = conditions.length === 0 ||
      ConditionEvaluator.evaluateAll(conditions, context, 'and');

    if (shouldAlert) {
      const configTitle = behavior.config.title as string | undefined;
      const configMessage = behavior.config.message as string | undefined;
      const configPriority = behavior.config.priority as string | undefined;
      actions.push({
        type: 'alert',
        priority: (configPriority ?? 'high') as ProactiveAction['priority'],
        title: configTitle ?? behavior.name,
        message: configMessage ?? 'Alert triggered',
        data: { behaviorId: behavior.id, configId: config.id, context },
      });
    }

    return {
      behaviorId: behavior.id,
      executed: shouldAlert,
      actions,
    };
  }
}

export class ActionBehaviorHandler implements BehaviorHandler {
  constructor(private readonly actionExecutor?: (action: Record<string, unknown>) => Promise<unknown>) {}

  async execute(
    behavior: HeartbeatBehavior,
    config: HeartbeatConfig,
    context: Record<string, unknown>
  ): Promise<HeartbeatBehaviorResult> {
    const conditions = behavior.conditions ?? [];
    const actions: ProactiveAction[] = [];

    // Check conditions
    const shouldExecute = conditions.length === 0 ||
      ConditionEvaluator.evaluateAll(conditions, context, 'and');

    if (!shouldExecute) {
      return {
        behaviorId: behavior.id,
        executed: false,
      };
    }

    // Execute the action
    let result: unknown;
    if (this.actionExecutor && behavior.config.action) {
      try {
        result = await this.actionExecutor(behavior.config.action as Record<string, unknown>);
        actions.push({
          type: 'notification',
          priority: 'normal',
          title: `Action completed: ${behavior.name}`,
          message: 'The automated action was executed successfully',
          data: { behaviorId: behavior.id, result },
        });
      } catch (error) {
        actions.push({
          type: 'alert',
          priority: 'high',
          title: `Action failed: ${behavior.name}`,
          message: error instanceof Error ? error.message : 'Unknown error',
          data: { behaviorId: behavior.id },
        });
      }
    }

    return {
      behaviorId: behavior.id,
      executed: true,
      result,
      actions,
    };
  }
}

// =============================================================================
// Heartbeat Engine
// =============================================================================

export interface HeartbeatEngineConfig {
  behaviorTimeoutMs: number;
  onEvent?: (event: string, data: unknown) => void;
  onAction?: (action: ProactiveAction, config: HeartbeatConfig) => Promise<void>;
}

const DEFAULT_CONFIG: HeartbeatEngineConfig = {
  behaviorTimeoutMs: HEARTBEAT_DEFAULTS.BEHAVIOR_TIMEOUT_MS,
};

export class HeartbeatEngine {
  private readonly config: HeartbeatEngineConfig;
  private readonly handlers = new Map<string, BehaviorHandler>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private contextProvider?: () => Promise<Record<string, unknown>>;

  constructor(
    private readonly store: HeartbeatConfigStore,
    config?: Partial<HeartbeatEngineConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registerDefaultHandlers();
  }

  /**
   * Register a behavior handler
   */
  registerHandler(type: string, handler: BehaviorHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * Set the context provider
   */
  setContextProvider(provider: () => Promise<Record<string, unknown>>): void {
    this.contextProvider = provider;
  }

  /**
   * Start the heartbeat engine
   */
  async start(): Promise<void> {
    const configs = await this.store.getEnabled();
    for (const config of configs) {
      this.startHeartbeat(config);
    }
    this.emit(MEMORY_EVENTS.HEARTBEAT_STARTED, { configCount: configs.length });
  }

  /**
   * Stop the heartbeat engine
   */
  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.emit(MEMORY_EVENTS.HEARTBEAT_STOPPED, {});
  }

  /**
   * Create a heartbeat config
   */
  async createConfig(
    userId: string,
    botId: string,
    name: string,
    behaviors: HeartbeatBehavior[],
    options?: {
      intervalMs?: number;
      context?: Record<string, unknown>;
      enabled?: boolean;
    }
  ): Promise<HeartbeatConfig> {
    const intervalMs = options?.intervalMs ?? HEARTBEAT_DEFAULTS.DEFAULT_INTERVAL_MS;

    // Validate interval
    if (intervalMs < HEARTBEAT_DEFAULTS.MIN_INTERVAL_MS) {
      throw new MemoryError(
        'VALIDATION_ERROR',
        `Interval must be at least ${HEARTBEAT_DEFAULTS.MIN_INTERVAL_MS}ms`
      );
    }
    if (intervalMs > HEARTBEAT_DEFAULTS.MAX_INTERVAL_MS) {
      throw new MemoryError(
        'VALIDATION_ERROR',
        `Interval must be at most ${HEARTBEAT_DEFAULTS.MAX_INTERVAL_MS}ms`
      );
    }

    // Validate behaviors
    if (behaviors.length > HEARTBEAT_DEFAULTS.MAX_BEHAVIORS) {
      throw new MemoryError(
        'VALIDATION_ERROR',
        `Maximum ${HEARTBEAT_DEFAULTS.MAX_BEHAVIORS} behaviors allowed`
      );
    }

    const config = await this.store.create({
      userId,
      botId,
      name,
      enabled: options?.enabled ?? true,
      intervalMs,
      behaviors,
      context: options?.context,
    });

    if (config.enabled) {
      this.startHeartbeat(config);
    }

    return config;
  }

  /**
   * Get config
   */
  async getConfig(id: string): Promise<HeartbeatConfig | null> {
    return this.store.get(id);
  }

  /**
   * Get configs for a user
   */
  async getConfigs(userId: string): Promise<HeartbeatConfig[]> {
    return this.store.getByUserId(userId);
  }

  /**
   * Update config
   */
  async updateConfig(id: string, updates: Partial<HeartbeatConfig>): Promise<HeartbeatConfig | null> {
    const existing = await this.store.get(id);
    if (!existing) return null;

    const updated = await this.store.update(id, updates);
    if (!updated) return null;

    // Restart heartbeat if needed
    this.stopHeartbeat(id);
    if (updated.enabled) {
      this.startHeartbeat(updated);
    }

    return updated;
  }

  /**
   * Delete config
   */
  async deleteConfig(id: string): Promise<boolean> {
    this.stopHeartbeat(id);
    return this.store.delete(id);
  }

  /**
   * Enable/disable config
   */
  async setEnabled(id: string, enabled: boolean): Promise<HeartbeatConfig | null> {
    return this.updateConfig(id, { enabled });
  }

  /**
   * Trigger a heartbeat immediately
   */
  async triggerHeartbeat(id: string): Promise<HeartbeatResult> {
    const config = await this.store.get(id);
    if (!config) {
      throw new MemoryError('HEARTBEAT_FAILED', 'Heartbeat config not found');
    }
    return this.executeHeartbeat(config);
  }

  /**
   * Add a behavior to a config
   */
  async addBehavior(configId: string, behavior: HeartbeatBehavior): Promise<HeartbeatConfig | null> {
    const config = await this.store.get(configId);
    if (!config) return null;

    const behaviors = [...config.behaviors, behavior];
    return this.updateConfig(configId, { behaviors });
  }

  /**
   * Remove a behavior from a config
   */
  async removeBehavior(configId: string, behaviorId: string): Promise<HeartbeatConfig | null> {
    const config = await this.store.get(configId);
    if (!config) return null;

    const behaviors = config.behaviors.filter(b => b.id !== behaviorId);
    return this.updateConfig(configId, { behaviors });
  }

  /**
   * Update a behavior
   */
  async updateBehavior(
    configId: string,
    behaviorId: string,
    updates: Partial<HeartbeatBehavior>
  ): Promise<HeartbeatConfig | null> {
    const config = await this.store.get(configId);
    if (!config) return null;

    const behaviors = config.behaviors.map(b =>
      b.id === behaviorId ? { ...b, ...updates } : b
    );
    return this.updateConfig(configId, { behaviors });
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private registerDefaultHandlers(): void {
    this.handlers.set('check', new CheckBehaviorHandler());
    this.handlers.set('analyze', new AnalyzeBehaviorHandler());
    this.handlers.set('suggest', new SuggestBehaviorHandler());
    this.handlers.set('alert', new AlertBehaviorHandler());
    this.handlers.set('action', new ActionBehaviorHandler());
  }

  private startHeartbeat(config: HeartbeatConfig): void {
    if (this.timers.has(config.id)) return;

    const timer = setInterval(async () => {
      try {
        await this.executeHeartbeat(config);
      } catch (error) {
        this.emit(MEMORY_EVENTS.HEARTBEAT_ERROR, {
          configId: config.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, config.intervalMs);

    this.timers.set(config.id, timer);
  }

  private stopHeartbeat(configId: string): void {
    const timer = this.timers.get(configId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(configId);
    }
  }

  private async executeHeartbeat(config: HeartbeatConfig): Promise<HeartbeatResult> {
    const startTime = Date.now();
    const behaviorResults: HeartbeatBehaviorResult[] = [];

    // Get context
    let context: Record<string, unknown> = config.context ?? {};
    if (this.contextProvider) {
      try {
        context = { ...context, ...(await this.contextProvider()) };
      } catch {
        // Use default context
      }
    }

    // Execute behaviors in priority order
    const sortedBehaviors = [...config.behaviors]
      .filter(b => b.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const behavior of sortedBehaviors) {
      const handler = this.handlers.get(behavior.type);
      if (!handler) {
        behaviorResults.push({
          behaviorId: behavior.id,
          executed: false,
          error: `Unknown behavior type: ${behavior.type}`,
        });
        continue;
      }

      try {
        // Execute with timeout
        const resultPromise = handler.execute(behavior, config, context);
        const timeoutPromise = new Promise<HeartbeatBehaviorResult>((_, reject) =>
          setTimeout(() => reject(new Error('Behavior timeout')), this.config.behaviorTimeoutMs)
        );

        const result = await Promise.race([resultPromise, timeoutPromise]);
        behaviorResults.push(result);

        // Handle actions
        if (result.actions) {
          for (const action of result.actions) {
            await this.handleAction(action, config);
          }
        }
      } catch (error) {
        behaviorResults.push({
          behaviorId: behavior.id,
          executed: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Update last heartbeat time
    await this.store.update(config.id, { lastHeartbeatAt: startTime });

    const result: HeartbeatResult = {
      configId: config.id,
      timestamp: startTime,
      behaviors: behaviorResults,
      duration: Date.now() - startTime,
    };

    this.emit(MEMORY_EVENTS.HEARTBEAT_TICK, result);
    return result;
  }

  private async handleAction(action: ProactiveAction, config: HeartbeatConfig): Promise<void> {
    this.emit(MEMORY_EVENTS.HEARTBEAT_ACTION, { action, configId: config.id });

    if (this.config.onAction) {
      try {
        await this.config.onAction(action, config);
      } catch (error) {
        this.emit(MEMORY_EVENTS.HEARTBEAT_ERROR, {
          configId: config.id,
          action,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a behavior configuration
 */
export function createBehavior(
  name: string,
  type: HeartbeatBehavior['type'],
  config: Record<string, unknown>,
  options?: {
    id?: string;
    priority?: number;
    enabled?: boolean;
    conditions?: TriggerCondition[];
  }
): HeartbeatBehavior {
  return {
    id: options?.id ?? randomUUID(),
    name,
    type,
    enabled: options?.enabled ?? true,
    priority: options?.priority ?? 0,
    config,
    conditions: options?.conditions,
  };
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createHeartbeatConfigStore(type: 'memory'): InMemoryHeartbeatConfigStore;
export function createHeartbeatConfigStore(type: 'database', db: DatabaseAdapter): DatabaseHeartbeatConfigStore;
export function createHeartbeatConfigStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): HeartbeatConfigStore {
  if (type === 'memory') {
    return new InMemoryHeartbeatConfigStore();
  }
  if (!db) {
    throw new MemoryError('VALIDATION_ERROR', 'Database adapter required for database store');
  }
  return new DatabaseHeartbeatConfigStore(db);
}

export function createHeartbeatEngine(
  store: HeartbeatConfigStore,
  config?: Partial<HeartbeatEngineConfig>
): HeartbeatEngine {
  return new HeartbeatEngine(store, config);
}
