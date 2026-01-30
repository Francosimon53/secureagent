/**
 * Event Trigger
 *
 * Event-driven triggers for file changes, price thresholds, time-based events, and webhooks
 */

import { randomUUID } from 'crypto';
import { watch, type FSWatcher } from 'fs';
import type {
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
} from './types.js';
import { MemoryError } from './types.js';
import { TRIGGER_DEFAULTS, MEMORY_EVENTS, TABLE_NAMES } from './constants.js';
import { CronParser } from './cron-scheduler.js';

// =============================================================================
// Database Adapter Interface
// =============================================================================

export interface DatabaseAdapter {
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

// =============================================================================
// Trigger Store Interface
// =============================================================================

export interface TriggerStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Create a trigger */
  create(trigger: Omit<EventTrigger, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount'>): Promise<EventTrigger>;

  /** Get trigger by ID */
  get(id: string): Promise<EventTrigger | null>;

  /** Get triggers for a user */
  getByUserId(userId: string): Promise<EventTrigger[]>;

  /** Get enabled triggers by type */
  getEnabledByType(type: TriggerType): Promise<EventTrigger[]>;

  /** Update trigger */
  update(id: string, updates: Partial<EventTrigger>): Promise<EventTrigger | null>;

  /** Delete trigger */
  delete(id: string): Promise<boolean>;

  /** Record trigger execution */
  recordExecution(triggerId: string, event: TriggerEvent): Promise<void>;

  /** Get trigger history */
  getHistory(triggerId: string, limit?: number): Promise<TriggerEvent[]>;
}

// =============================================================================
// Database Row Types
// =============================================================================

interface TriggerRow {
  id: string;
  user_id: string;
  name: string;
  type: string;
  enabled: number;
  config: string;
  actions: string;
  cooldown_ms: number | null;
  last_triggered_at: number | null;
  trigger_count: number;
  max_triggers: number | null;
  created_at: number;
  updated_at: number;
}

interface TriggerHistoryRow {
  id: string;
  trigger_id: string;
  type: string;
  data: string;
  timestamp: number;
}

// =============================================================================
// Database Trigger Store
// =============================================================================

export class DatabaseTriggerStore implements TriggerStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.TRIGGERS} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        config TEXT NOT NULL,
        actions TEXT NOT NULL,
        cooldown_ms INTEGER,
        last_triggered_at INTEGER,
        trigger_count INTEGER NOT NULL DEFAULT 0,
        max_triggers INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.TRIGGER_HISTORY} (
        id TEXT PRIMARY KEY,
        trigger_id TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (trigger_id) REFERENCES ${TABLE_NAMES.TRIGGERS}(id)
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_triggers_user ON ${TABLE_NAMES.TRIGGERS}(user_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_triggers_type ON ${TABLE_NAMES.TRIGGERS}(type)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_trigger_history_trigger ON ${TABLE_NAMES.TRIGGER_HISTORY}(trigger_id)
    `);
  }

  async create(input: Omit<EventTrigger, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount'>): Promise<EventTrigger> {
    const now = Date.now();
    const id = randomUUID();

    const trigger: EventTrigger = {
      ...input,
      id,
      triggerCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO ${TABLE_NAMES.TRIGGERS} (
        id, user_id, name, type, enabled, config, actions, cooldown_ms,
        trigger_count, max_triggers, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trigger.id,
        trigger.userId,
        trigger.name,
        trigger.type,
        trigger.enabled ? 1 : 0,
        JSON.stringify(trigger.config),
        JSON.stringify(trigger.actions),
        trigger.cooldownMs ?? null,
        trigger.triggerCount,
        trigger.maxTriggers ?? null,
        trigger.createdAt,
        trigger.updatedAt,
      ]
    );

    return trigger;
  }

  async get(id: string): Promise<EventTrigger | null> {
    const result = await this.db.execute<TriggerRow>(
      `SELECT * FROM ${TABLE_NAMES.TRIGGERS} WHERE id = ?`,
      [id]
    );
    return result.length > 0 ? this.rowToTrigger(result[0]) : null;
  }

  async getByUserId(userId: string): Promise<EventTrigger[]> {
    const result = await this.db.execute<TriggerRow>(
      `SELECT * FROM ${TABLE_NAMES.TRIGGERS} WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
    return result.map(row => this.rowToTrigger(row));
  }

  async getEnabledByType(type: TriggerType): Promise<EventTrigger[]> {
    const result = await this.db.execute<TriggerRow>(
      `SELECT * FROM ${TABLE_NAMES.TRIGGERS} WHERE type = ? AND enabled = 1`,
      [type]
    );
    return result.map(row => this.rowToTrigger(row));
  }

  async update(id: string, updates: Partial<EventTrigger>): Promise<EventTrigger | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, updatedAt: Date.now() };

    await this.db.execute(
      `UPDATE ${TABLE_NAMES.TRIGGERS} SET
        name = ?, type = ?, enabled = ?, config = ?, actions = ?,
        cooldown_ms = ?, last_triggered_at = ?, trigger_count = ?,
        max_triggers = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.type,
        updated.enabled ? 1 : 0,
        JSON.stringify(updated.config),
        JSON.stringify(updated.actions),
        updated.cooldownMs ?? null,
        updated.lastTriggeredAt ?? null,
        updated.triggerCount,
        updated.maxTriggers ?? null,
        updated.updatedAt,
        id,
      ]
    );

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    await this.db.execute(
      `DELETE FROM ${TABLE_NAMES.TRIGGER_HISTORY} WHERE trigger_id = ?`,
      [id]
    );
    const result = await this.db.execute(
      `DELETE FROM ${TABLE_NAMES.TRIGGERS} WHERE id = ?`,
      [id]
    );
    return (result as unknown as { changes: number }).changes > 0;
  }

  async recordExecution(triggerId: string, event: TriggerEvent): Promise<void> {
    await this.db.execute(
      `INSERT INTO ${TABLE_NAMES.TRIGGER_HISTORY} (id, trigger_id, type, data, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), triggerId, event.type, JSON.stringify(event.data), event.timestamp]
    );

    // Update trigger stats
    await this.db.execute(
      `UPDATE ${TABLE_NAMES.TRIGGERS} SET
        last_triggered_at = ?, trigger_count = trigger_count + 1
      WHERE id = ?`,
      [event.timestamp, triggerId]
    );
  }

  async getHistory(triggerId: string, limit: number = 100): Promise<TriggerEvent[]> {
    const result = await this.db.execute<TriggerHistoryRow>(
      `SELECT * FROM ${TABLE_NAMES.TRIGGER_HISTORY}
       WHERE trigger_id = ? ORDER BY timestamp DESC LIMIT ?`,
      [triggerId, limit]
    );
    return result.map(row => ({
      triggerId: row.trigger_id,
      type: row.type as TriggerType,
      data: JSON.parse(row.data),
      timestamp: row.timestamp,
    }));
  }

  private rowToTrigger(row: TriggerRow): EventTrigger {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      type: row.type as TriggerType,
      enabled: row.enabled === 1,
      config: JSON.parse(row.config),
      actions: JSON.parse(row.actions),
      cooldownMs: row.cooldown_ms ?? undefined,
      lastTriggeredAt: row.last_triggered_at ?? undefined,
      triggerCount: row.trigger_count,
      maxTriggers: row.max_triggers ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Trigger Store
// =============================================================================

export class InMemoryTriggerStore implements TriggerStore {
  private triggers = new Map<string, EventTrigger>();
  private history = new Map<string, TriggerEvent[]>();

  async initialize(): Promise<void> {
    // No-op
  }

  async create(input: Omit<EventTrigger, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount'>): Promise<EventTrigger> {
    const now = Date.now();
    const trigger: EventTrigger = {
      ...input,
      id: randomUUID(),
      triggerCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.triggers.set(trigger.id, trigger);
    return { ...trigger };
  }

  async get(id: string): Promise<EventTrigger | null> {
    const trigger = this.triggers.get(id);
    return trigger ? { ...trigger } : null;
  }

  async getByUserId(userId: string): Promise<EventTrigger[]> {
    return Array.from(this.triggers.values())
      .filter(t => t.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(t => ({ ...t }));
  }

  async getEnabledByType(type: TriggerType): Promise<EventTrigger[]> {
    return Array.from(this.triggers.values())
      .filter(t => t.type === type && t.enabled)
      .map(t => ({ ...t }));
  }

  async update(id: string, updates: Partial<EventTrigger>): Promise<EventTrigger | null> {
    const existing = this.triggers.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, updatedAt: Date.now() };
    this.triggers.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    this.history.delete(id);
    return this.triggers.delete(id);
  }

  async recordExecution(triggerId: string, event: TriggerEvent): Promise<void> {
    const trigger = this.triggers.get(triggerId);
    if (trigger) {
      trigger.lastTriggeredAt = event.timestamp;
      trigger.triggerCount++;
    }

    const history = this.history.get(triggerId) ?? [];
    history.unshift(event);
    this.history.set(triggerId, history.slice(0, 1000));
  }

  async getHistory(triggerId: string, limit: number = 100): Promise<TriggerEvent[]> {
    return (this.history.get(triggerId) ?? []).slice(0, limit);
  }
}

// =============================================================================
// Condition Evaluator
// =============================================================================

export class ConditionEvaluator {
  static evaluate(condition: TriggerCondition, data: Record<string, unknown>): boolean {
    const fieldValue = this.getFieldValue(data, condition.field);
    return this.compare(fieldValue, condition.operator, condition.value);
  }

  static evaluateAll(
    conditions: TriggerCondition[],
    data: Record<string, unknown>,
    logic: 'and' | 'or'
  ): boolean {
    if (conditions.length === 0) return true;

    if (logic === 'and') {
      return conditions.every(c => this.evaluate(c, data));
    } else {
      return conditions.some(c => this.evaluate(c, data));
    }
  }

  private static getFieldValue(data: Record<string, unknown>, field: string): unknown {
    const parts = field.split('.');
    let value: unknown = data;

    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = (value as Record<string, unknown>)[part];
    }

    return value;
  }

  private static compare(a: unknown, operator: ConditionOperator, b: unknown): boolean {
    switch (operator) {
      case 'eq':
        return a === b;
      case 'ne':
        return a !== b;
      case 'gt':
        return typeof a === 'number' && typeof b === 'number' && a > b;
      case 'gte':
        return typeof a === 'number' && typeof b === 'number' && a >= b;
      case 'lt':
        return typeof a === 'number' && typeof b === 'number' && a < b;
      case 'lte':
        return typeof a === 'number' && typeof b === 'number' && a <= b;
      case 'contains':
        return typeof a === 'string' && typeof b === 'string' && a.includes(b);
      case 'matches':
        return typeof a === 'string' && typeof b === 'string' && new RegExp(b).test(a);
      default:
        return false;
    }
  }
}

// =============================================================================
// Event Trigger Engine
// =============================================================================

export interface TriggerActionHandler {
  (action: TriggerAction, event: TriggerEvent, trigger: EventTrigger): Promise<void>;
}

export interface PriceProvider {
  getPrice(symbol: string): Promise<number>;
}

export interface TriggerEngineConfig {
  fileWatcherDebounceMs: number;
  priceCheckIntervalMs: number;
  webhookTimeoutMs: number;
  defaultCooldownMs: number;
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: TriggerEngineConfig = {
  fileWatcherDebounceMs: TRIGGER_DEFAULTS.FILE_WATCHER_DEBOUNCE_MS,
  priceCheckIntervalMs: TRIGGER_DEFAULTS.PRICE_CHECK_INTERVAL_MS,
  webhookTimeoutMs: TRIGGER_DEFAULTS.WEBHOOK_TIMEOUT_MS,
  defaultCooldownMs: TRIGGER_DEFAULTS.DEFAULT_COOLDOWN_MS,
};

export class EventTriggerEngine {
  private readonly config: TriggerEngineConfig;
  private readonly actionHandlers = new Map<string, TriggerActionHandler>();
  private priceProvider?: PriceProvider;

  private fileWatchers = new Map<string, FSWatcher>();
  private priceCheckTimer?: NodeJS.Timeout;
  private scheduleCheckTimer?: NodeJS.Timeout;
  private lastPrices = new Map<string, number>();
  private fileDebounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly store: TriggerStore,
    config?: Partial<TriggerEngineConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registerDefaultActionHandlers();
  }

  /**
   * Register an action handler
   */
  registerActionHandler(type: string, handler: TriggerActionHandler): void {
    this.actionHandlers.set(type, handler);
  }

  /**
   * Set the price provider for price threshold triggers
   */
  setPriceProvider(provider: PriceProvider): void {
    this.priceProvider = provider;
  }

  /**
   * Start the trigger engine
   */
  async start(): Promise<void> {
    // Set up file watchers
    const fileChangeTriggers = await this.store.getEnabledByType('file_change');
    for (const trigger of fileChangeTriggers) {
      this.setupFileWatcher(trigger);
    }

    // Start price checking
    if (this.priceProvider) {
      this.priceCheckTimer = setInterval(
        () => this.checkPrices(),
        this.config.priceCheckIntervalMs
      );
    }

    // Start schedule checking
    this.scheduleCheckTimer = setInterval(
      () => this.checkSchedules(),
      60000 // Check every minute
    );

    this.emit(MEMORY_EVENTS.TRIGGER_CREATED, { status: 'engine_started' });
  }

  /**
   * Stop the trigger engine
   */
  stop(): void {
    // Stop file watchers
    for (const watcher of this.fileWatchers.values()) {
      watcher.close();
    }
    this.fileWatchers.clear();

    // Stop timers
    if (this.priceCheckTimer) {
      clearInterval(this.priceCheckTimer);
      this.priceCheckTimer = undefined;
    }
    if (this.scheduleCheckTimer) {
      clearInterval(this.scheduleCheckTimer);
      this.scheduleCheckTimer = undefined;
    }

    // Clear debounce timers
    for (const timer of this.fileDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.fileDebounceTimers.clear();

    this.emit(MEMORY_EVENTS.TRIGGER_DISABLED, { status: 'engine_stopped' });
  }

  /**
   * Create a trigger
   */
  async createTrigger(
    userId: string,
    name: string,
    type: TriggerType,
    config: TriggerConfig,
    actions: TriggerAction[],
    options?: { cooldownMs?: number; maxTriggers?: number }
  ): Promise<EventTrigger> {
    // Validate config
    this.validateConfig(type, config);

    const trigger = await this.store.create({
      userId,
      name,
      type,
      enabled: true,
      config,
      actions,
      cooldownMs: options?.cooldownMs ?? this.config.defaultCooldownMs,
      maxTriggers: options?.maxTriggers,
    });

    // Set up monitoring for the trigger
    if (type === 'file_change') {
      this.setupFileWatcher(trigger);
    }

    this.emit(MEMORY_EVENTS.TRIGGER_CREATED, { trigger });
    return trigger;
  }

  /**
   * Get trigger
   */
  async getTrigger(id: string): Promise<EventTrigger | null> {
    return this.store.get(id);
  }

  /**
   * Get triggers for a user
   */
  async getTriggers(userId: string): Promise<EventTrigger[]> {
    return this.store.getByUserId(userId);
  }

  /**
   * Update trigger
   */
  async updateTrigger(id: string, updates: Partial<EventTrigger>): Promise<EventTrigger | null> {
    const existing = await this.store.get(id);
    if (!existing) return null;

    const updated = await this.store.update(id, updates);

    // Update file watcher if needed
    if (existing.type === 'file_change' && updated) {
      this.removeFileWatcher(existing.id);
      if (updated.enabled) {
        this.setupFileWatcher(updated);
      }
    }

    return updated;
  }

  /**
   * Delete trigger
   */
  async deleteTrigger(id: string): Promise<boolean> {
    const trigger = await this.store.get(id);
    if (trigger?.type === 'file_change') {
      this.removeFileWatcher(id);
    }
    return this.store.delete(id);
  }

  /**
   * Enable/disable trigger
   */
  async setEnabled(id: string, enabled: boolean): Promise<EventTrigger | null> {
    return this.updateTrigger(id, { enabled });
  }

  /**
   * Fire a trigger manually or from webhook
   */
  async fireTrigger(id: string, data: Record<string, unknown>): Promise<void> {
    const trigger = await this.store.get(id);
    if (!trigger) {
      throw new MemoryError('TRIGGER_NOT_FOUND', 'Trigger not found');
    }
    if (!trigger.enabled) {
      throw new MemoryError('TRIGGER_DISABLED', 'Trigger is disabled');
    }

    await this.executeTrigger(trigger, data);
  }

  /**
   * Handle incoming webhook
   */
  async handleWebhook(
    path: string,
    method: string,
    headers: Record<string, string>,
    body: Record<string, unknown>
  ): Promise<{ triggered: boolean; triggerId?: string }> {
    const triggers = await this.store.getEnabledByType('webhook');

    for (const trigger of triggers) {
      const config = trigger.config as WebhookTriggerConfig;
      if (config.path !== path) continue;
      if (config.method && config.method !== method) continue;

      // Verify secret if configured
      if (config.secret) {
        const signature = headers['x-webhook-signature'] || headers['x-hub-signature'];
        if (!signature || !this.verifyWebhookSignature(body, config.secret, signature)) {
          continue;
        }
      }

      await this.executeTrigger(trigger, { headers, body });
      return { triggered: true, triggerId: trigger.id };
    }

    return { triggered: false };
  }

  /**
   * Get trigger history
   */
  async getHistory(triggerId: string, limit?: number): Promise<TriggerEvent[]> {
    return this.store.getHistory(triggerId, limit);
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private registerDefaultActionHandlers(): void {
    // Notify action
    this.actionHandlers.set('notify', async (_action, event, trigger) => {
      this.emit(MEMORY_EVENTS.TRIGGER_FIRED, { trigger, event, type: 'notify' });
    });

    // Store action - handled externally
    this.actionHandlers.set('store', async (_action, event, trigger) => {
      this.emit(MEMORY_EVENTS.TRIGGER_FIRED, { trigger, event, type: 'store' });
    });
  }

  private validateConfig(type: TriggerType, config: TriggerConfig): void {
    if (config.type !== type) {
      throw new MemoryError('VALIDATION_ERROR', `Config type mismatch: expected ${type}, got ${config.type}`);
    }

    switch (type) {
      case 'file_change':
        const fc = config as FileChangeTriggerConfig;
        if (!fc.paths || fc.paths.length === 0) {
          throw new MemoryError('VALIDATION_ERROR', 'File change trigger requires paths');
        }
        break;

      case 'price_threshold':
        const pt = config as PriceThresholdTriggerConfig;
        if (!pt.symbol || typeof pt.threshold !== 'number') {
          throw new MemoryError('VALIDATION_ERROR', 'Price threshold trigger requires symbol and threshold');
        }
        break;

      case 'time_based':
        const tbConfig = config as TimeBasedTriggerConfig;
        const tbValidation = CronParser.validate(tbConfig.schedule);
        if (!tbValidation.valid) {
          throw new MemoryError('SCHEDULE_INVALID', tbValidation.error ?? 'Invalid cron expression');
        }
        break;

      case 'schedule':
        const schedConfig = config as ScheduleTriggerConfig;
        const schedValidation = CronParser.validate(schedConfig.expression);
        if (!schedValidation.valid) {
          throw new MemoryError('SCHEDULE_INVALID', schedValidation.error ?? 'Invalid cron expression');
        }
        break;

      case 'webhook':
        const wh = config as WebhookTriggerConfig;
        if (!wh.path) {
          throw new MemoryError('VALIDATION_ERROR', 'Webhook trigger requires path');
        }
        break;

      case 'condition':
        const cond = config as ConditionTriggerConfig;
        if (!cond.conditions || cond.conditions.length === 0) {
          throw new MemoryError('VALIDATION_ERROR', 'Condition trigger requires conditions');
        }
        break;
    }
  }

  private setupFileWatcher(trigger: EventTrigger): void {
    const config = trigger.config as FileChangeTriggerConfig;

    for (const path of config.paths) {
      try {
        const watcher = watch(path, { recursive: true }, (eventType, filename) => {
          // Debounce file changes
          const key = `${trigger.id}:${filename}`;
          const existing = this.fileDebounceTimers.get(key);
          if (existing) {
            clearTimeout(existing);
          }

          this.fileDebounceTimers.set(key, setTimeout(() => {
            this.fileDebounceTimers.delete(key);
            this.handleFileChange(trigger, eventType, filename ?? path);
          }, this.config.fileWatcherDebounceMs));
        });

        this.fileWatchers.set(`${trigger.id}:${path}`, watcher);
      } catch {
        // Path doesn't exist or can't be watched
      }
    }
  }

  private removeFileWatcher(triggerId: string): void {
    for (const [key, watcher] of this.fileWatchers) {
      if (key.startsWith(`${triggerId}:`)) {
        watcher.close();
        this.fileWatchers.delete(key);
      }
    }
  }

  private async handleFileChange(
    trigger: EventTrigger,
    eventType: string,
    filename: string
  ): Promise<void> {
    const config = trigger.config as FileChangeTriggerConfig;

    // Check event type filter
    const event = eventType === 'rename' ? 'create' : 'modify';
    if (config.events && !config.events.includes(event as 'create' | 'modify' | 'delete')) {
      return;
    }

    // Check patterns
    if (config.patterns) {
      const matches = config.patterns.some(p => new RegExp(p).test(filename));
      if (!matches) return;
    }

    // Check ignore patterns
    if (config.ignorePatterns) {
      const ignored = config.ignorePatterns.some(p => new RegExp(p).test(filename));
      if (ignored) return;
    }

    await this.executeTrigger(trigger, { eventType, filename });
  }

  private async checkPrices(): Promise<void> {
    if (!this.priceProvider) return;

    const triggers = await this.store.getEnabledByType('price_threshold');

    for (const trigger of triggers) {
      const config = trigger.config as PriceThresholdTriggerConfig;

      try {
        const currentPrice = await this.priceProvider.getPrice(config.symbol);
        const lastPrice = this.lastPrices.get(config.symbol);

        let shouldTrigger = false;

        switch (config.operator) {
          case 'above':
            shouldTrigger = currentPrice > config.threshold;
            break;
          case 'below':
            shouldTrigger = currentPrice < config.threshold;
            break;
          case 'crosses':
            if (lastPrice !== undefined) {
              const crossedUp = lastPrice < config.threshold && currentPrice >= config.threshold;
              const crossedDown = lastPrice > config.threshold && currentPrice <= config.threshold;
              shouldTrigger = crossedUp || crossedDown;
            }
            break;
        }

        this.lastPrices.set(config.symbol, currentPrice);

        if (shouldTrigger) {
          await this.executeTrigger(trigger, {
            symbol: config.symbol,
            price: currentPrice,
            threshold: config.threshold,
            operator: config.operator,
          });
        }
      } catch {
        // Failed to get price
      }
    }
  }

  private async checkSchedules(): Promise<void> {
    const now = new Date();
    const triggers = await this.store.getEnabledByType('time_based');
    triggers.push(...(await this.store.getEnabledByType('schedule')));

    for (const trigger of triggers) {
      const config = trigger.config as TimeBasedTriggerConfig | ScheduleTriggerConfig;
      const expression = config.type === 'time_based'
        ? (config as TimeBasedTriggerConfig).schedule
        : (config as ScheduleTriggerConfig).expression;
      const timezone = config.timezone ?? 'UTC';

      try {
        const parsed = CronParser.parse(expression);
        const nextRun = CronParser.getNextRunTime(parsed, now, timezone);

        // Check if we should run now (within this minute)
        const diffMs = Math.abs(nextRun.getTime() - now.getTime());
        if (diffMs < 60000) {
          // Check if we ran recently (within cooldown)
          if (trigger.lastTriggeredAt) {
            const sinceLastRun = now.getTime() - trigger.lastTriggeredAt;
            if (sinceLastRun < 60000) continue;
          }

          await this.executeTrigger(trigger, {
            scheduledTime: nextRun.toISOString(),
            expression,
          });
        }
      } catch {
        // Invalid expression
      }
    }
  }

  private async executeTrigger(
    trigger: EventTrigger,
    data: Record<string, unknown>
  ): Promise<void> {
    const now = Date.now();

    // Check cooldown
    if (trigger.cooldownMs && trigger.lastTriggeredAt) {
      const elapsed = now - trigger.lastTriggeredAt;
      if (elapsed < trigger.cooldownMs) {
        this.emit(MEMORY_EVENTS.TRIGGER_COOLDOWN, { trigger, elapsed, required: trigger.cooldownMs });
        return;
      }
    }

    // Check max triggers
    if (trigger.maxTriggers && trigger.triggerCount >= trigger.maxTriggers) {
      await this.store.update(trigger.id, { enabled: false });
      this.emit(MEMORY_EVENTS.TRIGGER_DISABLED, { trigger, reason: 'max_triggers_reached' });
      return;
    }

    // Check conditions for condition triggers
    if (trigger.type === 'condition') {
      const config = trigger.config as ConditionTriggerConfig;
      if (!ConditionEvaluator.evaluateAll(config.conditions, data, config.logic)) {
        return;
      }
    }

    // Create event
    const event: TriggerEvent = {
      triggerId: trigger.id,
      type: trigger.type,
      data,
      timestamp: now,
    };

    // Record execution
    await this.store.recordExecution(trigger.id, event);

    // Execute actions
    for (const action of trigger.actions) {
      const handler = this.actionHandlers.get(action.type);
      if (handler) {
        try {
          await handler(action, event, trigger);
        } catch (error) {
          this.emit(MEMORY_EVENTS.TRIGGER_FAILED, {
            trigger,
            action,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    this.emit(MEMORY_EVENTS.TRIGGER_FIRED, { trigger, event });
  }

  private verifyWebhookSignature(
    body: Record<string, unknown>,
    secret: string,
    signature: string
  ): boolean {
    // Simple HMAC verification
    const crypto = require('crypto');
    const payload = JSON.stringify(body);
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `sha256=${expected}` === signature || expected === signature;
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createTriggerStore(type: 'memory'): InMemoryTriggerStore;
export function createTriggerStore(type: 'database', db: DatabaseAdapter): DatabaseTriggerStore;
export function createTriggerStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): TriggerStore {
  if (type === 'memory') {
    return new InMemoryTriggerStore();
  }
  if (!db) {
    throw new MemoryError('VALIDATION_ERROR', 'Database adapter required for database store');
  }
  return new DatabaseTriggerStore(db);
}

export function createEventTriggerEngine(
  store: TriggerStore,
  config?: Partial<TriggerEngineConfig>
): EventTriggerEngine {
  return new EventTriggerEngine(store, config);
}
