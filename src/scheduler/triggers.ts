import { randomUUID } from 'crypto';
import {
  TriggerDefinition,
  TriggerContext,
  TriggerResult,
  TriggerCondition,
  TriggerManagerConfig,
  TriggerAction,
} from './types.js';
import { getNextCronTime, isValidCron, isInterval, parseInterval } from './cron-parser.js';
import { EventBus, getEventBus, Event } from '../events/index.js';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'TriggerManager' });

// ============================================================================
// Trigger Manager
// ============================================================================

/**
 * Manages event-based, schedule-based, and condition-based triggers
 * Enables proactive bot messaging
 */
export class TriggerManager {
  private readonly triggers = new Map<string, TriggerDefinition>();
  private readonly handlers = new Map<string, (context: TriggerContext) => Promise<void>>();
  private readonly config: Required<TriggerManagerConfig>;
  private eventBus: EventBus | null = null;
  private eventSubscriptions = new Map<string, () => void>();
  private scheduledTimers = new Map<string, NodeJS.Timeout>();
  private started = false;

  constructor(config: TriggerManagerConfig = {}) {
    this.config = {
      enablePersistence: config.enablePersistence ?? false,
      defaultCooldownMs: config.defaultCooldownMs ?? 1000,
      maxTriggersPerEvent: config.maxTriggersPerEvent ?? 10,
    };
  }

  /**
   * Initialize the trigger manager
   */
  async initialize(): Promise<void> {
    this.eventBus = getEventBus();
    logger.info('Trigger manager initialized');
  }

  /**
   * Register a handler function for use with function-type trigger actions
   */
  registerHandler(name: string, handler: (context: TriggerContext) => Promise<void>): void {
    this.handlers.set(name, handler);
    logger.debug({ handlerName: name }, 'Trigger handler registered');
  }

  /**
   * Register a new trigger
   */
  register(trigger: Omit<TriggerDefinition, 'id' | 'triggerCount'>): string {
    const id = randomUUID();
    const definition: TriggerDefinition = {
      ...trigger,
      id,
      triggerCount: 0,
    };

    // Validate trigger
    this.validateTrigger(definition);

    this.triggers.set(id, definition);

    // Set up event subscription or schedule if started
    if (this.started && definition.enabled) {
      this.activateTrigger(definition);
    }

    logger.info({ triggerId: id, name: trigger.name, type: trigger.type }, 'Trigger registered');

    return id;
  }

  /**
   * Unregister a trigger
   */
  unregister(triggerId: string): boolean {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) {
      return false;
    }

    this.deactivateTrigger(trigger);
    this.triggers.delete(triggerId);

    logger.info({ triggerId, name: trigger.name }, 'Trigger unregistered');

    return true;
  }

  /**
   * Enable a trigger
   */
  enable(triggerId: string): boolean {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) {
      return false;
    }

    if (!trigger.enabled) {
      trigger.enabled = true;
      if (this.started) {
        this.activateTrigger(trigger);
      }
      logger.info({ triggerId, name: trigger.name }, 'Trigger enabled');
    }

    return true;
  }

  /**
   * Disable a trigger
   */
  disable(triggerId: string): boolean {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) {
      return false;
    }

    if (trigger.enabled) {
      trigger.enabled = false;
      this.deactivateTrigger(trigger);
      logger.info({ triggerId, name: trigger.name }, 'Trigger disabled');
    }

    return true;
  }

  /**
   * Get a trigger by ID
   */
  get(triggerId: string): TriggerDefinition | undefined {
    return this.triggers.get(triggerId);
  }

  /**
   * List all triggers
   */
  list(filters?: { type?: string; enabled?: boolean; userId?: string }): TriggerDefinition[] {
    let results = Array.from(this.triggers.values());

    if (filters?.type) {
      results = results.filter(t => t.type === filters.type);
    }
    if (filters?.enabled !== undefined) {
      results = results.filter(t => t.enabled === filters.enabled);
    }
    if (filters?.userId) {
      results = results.filter(t => t.userId === filters.userId);
    }

    return results;
  }

  /**
   * Start the trigger manager
   */
  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;

    // Activate all enabled triggers
    for (const trigger of this.triggers.values()) {
      if (trigger.enabled) {
        this.activateTrigger(trigger);
      }
    }

    logger.info('Trigger manager started');
  }

  /**
   * Stop the trigger manager
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.started = false;

    // Clear all subscriptions and timers
    for (const unsubscribe of this.eventSubscriptions.values()) {
      unsubscribe();
    }
    this.eventSubscriptions.clear();

    for (const timer of this.scheduledTimers.values()) {
      clearTimeout(timer);
    }
    this.scheduledTimers.clear();

    logger.info('Trigger manager stopped');
  }

  /**
   * Manually fire a trigger (for testing or programmatic use)
   */
  async fire(triggerId: string, eventData?: Record<string, unknown>): Promise<TriggerResult> {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) {
      throw new Error(`Trigger not found: ${triggerId}`);
    }

    return this.executeTrigger(trigger, eventData);
  }

  /**
   * Evaluate condition triggers against current state
   */
  async evaluateConditions(state: Record<string, unknown>): Promise<TriggerResult[]> {
    const results: TriggerResult[] = [];

    for (const trigger of this.triggers.values()) {
      if (trigger.type !== 'condition' || !trigger.enabled || !trigger.conditions) {
        continue;
      }

      // Check cooldown
      if (trigger.lastTriggeredAt && trigger.cooldownMs) {
        if (Date.now() - trigger.lastTriggeredAt < trigger.cooldownMs) {
          continue;
        }
      }

      // Evaluate conditions
      if (this.evaluateConditionSet(trigger.conditions, state)) {
        const result = await this.executeTrigger(trigger, state);
        results.push(result);
      }
    }

    return results;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private validateTrigger(trigger: TriggerDefinition): void {
    if (!trigger.name) {
      throw new Error('Trigger name is required');
    }

    switch (trigger.type) {
      case 'event':
        if (!trigger.eventTopic) {
          throw new Error('Event trigger requires eventTopic');
        }
        break;

      case 'schedule':
        if (!trigger.schedule) {
          throw new Error('Schedule trigger requires schedule');
        }
        if (!isValidCron(trigger.schedule) && !isInterval(trigger.schedule)) {
          throw new Error(`Invalid schedule: ${trigger.schedule}`);
        }
        break;

      case 'condition':
        if (!trigger.conditions || trigger.conditions.length === 0) {
          throw new Error('Condition trigger requires conditions');
        }
        break;

      default:
        throw new Error(`Invalid trigger type: ${trigger.type}`);
    }

    if (!trigger.action || !trigger.action.type) {
      throw new Error('Trigger action is required');
    }
  }

  private activateTrigger(trigger: TriggerDefinition): void {
    switch (trigger.type) {
      case 'event':
        this.subscribeToEvent(trigger);
        break;

      case 'schedule':
        this.scheduleNextRun(trigger);
        break;

      case 'condition':
        // Condition triggers are evaluated on-demand
        break;
    }
  }

  private deactivateTrigger(trigger: TriggerDefinition): void {
    // Remove event subscription
    const unsubscribe = this.eventSubscriptions.get(trigger.id);
    if (unsubscribe) {
      unsubscribe();
      this.eventSubscriptions.delete(trigger.id);
    }

    // Clear scheduled timer
    const timer = this.scheduledTimers.get(trigger.id);
    if (timer) {
      clearTimeout(timer);
      this.scheduledTimers.delete(trigger.id);
    }
  }

  private subscribeToEvent(trigger: TriggerDefinition): void {
    if (!this.eventBus || !trigger.eventTopic) {
      return;
    }

    const topic = trigger.eventTopic;
    const subscriptionId = this.eventBus.subscribe(topic, async (event: Event) => {
      if (!trigger.enabled) {
        return;
      }

      // Check cooldown
      if (trigger.lastTriggeredAt && trigger.cooldownMs) {
        if (Date.now() - trigger.lastTriggeredAt < trigger.cooldownMs) {
          logger.debug({ triggerId: trigger.id }, 'Trigger on cooldown, skipping');
          return;
        }
      }

      try {
        const eventData = event.data as Record<string, unknown> | undefined;
        await this.executeTrigger(trigger, eventData, topic);
      } catch (error) {
        logger.error(
          { triggerId: trigger.id, error: error instanceof Error ? error.message : String(error) },
          'Error executing event trigger'
        );
      }
    });

    // Create an unsubscribe function
    const unsubscribe = () => this.eventBus!.unsubscribe(topic, subscriptionId);
    this.eventSubscriptions.set(trigger.id, unsubscribe);
    logger.debug({ triggerId: trigger.id, topic }, 'Subscribed to event');
  }

  private scheduleNextRun(trigger: TriggerDefinition): void {
    if (!trigger.schedule) {
      return;
    }

    let delay: number;

    if (isInterval(trigger.schedule)) {
      delay = parseInterval(trigger.schedule);
    } else {
      const nextTime = getNextCronTime(trigger.schedule);
      delay = nextTime.getTime() - Date.now();
    }

    const timer = setTimeout(async () => {
      if (!trigger.enabled) {
        return;
      }

      try {
        await this.executeTrigger(trigger);
      } catch (error) {
        logger.error(
          { triggerId: trigger.id, error: error instanceof Error ? error.message : String(error) },
          'Error executing scheduled trigger'
        );
      }

      // Schedule next run
      if (trigger.enabled && this.started) {
        this.scheduleNextRun(trigger);
      }
    }, delay);

    this.scheduledTimers.set(trigger.id, timer);

    const nextRunTime = new Date(Date.now() + delay);
    logger.debug({ triggerId: trigger.id, nextRun: nextRunTime.toISOString() }, 'Scheduled next trigger run');
  }

  private async executeTrigger(
    trigger: TriggerDefinition,
    eventData?: Record<string, unknown>,
    eventTopic?: string
  ): Promise<TriggerResult> {
    const startTime = Date.now();

    const context: TriggerContext = {
      trigger,
      eventData,
      eventTopic,
      triggeredAt: startTime,
      userId: trigger.userId,
    };

    try {
      // Execute action
      await this.executeAction(trigger.action, context);

      // Update trigger state
      trigger.lastTriggeredAt = startTime;
      trigger.triggerCount++;

      const result: TriggerResult = {
        triggerId: trigger.id,
        triggerName: trigger.name,
        success: true,
        triggeredAt: startTime,
        completedAt: Date.now(),
        duration: Date.now() - startTime,
      };

      logger.debug({ triggerId: trigger.id, name: trigger.name }, 'Trigger executed successfully');

      // Emit event
      if (this.eventBus) {
        await this.eventBus.publish('trigger.fired', {
          triggerId: trigger.id,
          triggerName: trigger.name,
          triggerType: trigger.type,
          actionType: trigger.action.type,
          duration: result.duration,
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: TriggerResult = {
        triggerId: trigger.id,
        triggerName: trigger.name,
        success: false,
        triggeredAt: startTime,
        completedAt: Date.now(),
        duration: Date.now() - startTime,
        error: errorMessage,
      };

      logger.error({ triggerId: trigger.id, error: errorMessage }, 'Trigger execution failed');

      return result;
    }
  }

  private async executeAction(action: TriggerAction, context: TriggerContext): Promise<void> {
    switch (action.type) {
      case 'message':
        await this.executeMessageAction(action, context);
        break;

      case 'event':
        await this.executeEventAction(action, context);
        break;

      case 'function':
        await this.executeFunctionAction(action, context);
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  private async executeMessageAction(action: TriggerAction, context: TriggerContext): Promise<void> {
    if (!action.channelId || !action.content) {
      throw new Error('Message action requires channelId and content');
    }

    // Emit event for message delivery
    // The actual delivery is handled by the messaging system
    if (this.eventBus) {
      await this.eventBus.publish('trigger.message', {
        channelId: action.channelId,
        content: action.content,
        triggerId: context.trigger.id,
        triggerName: context.trigger.name,
        userId: context.userId,
      });
    }

    logger.debug(
      { triggerId: context.trigger.id, channelId: action.channelId },
      'Message action emitted'
    );
  }

  private async executeEventAction(action: TriggerAction, context: TriggerContext): Promise<void> {
    if (!action.topic) {
      throw new Error('Event action requires topic');
    }

    if (this.eventBus) {
      await this.eventBus.publish(action.topic, {
        ...action.eventData,
        _trigger: {
          id: context.trigger.id,
          name: context.trigger.name,
        },
      });
    }

    logger.debug(
      { triggerId: context.trigger.id, topic: action.topic },
      'Event action published'
    );
  }

  private async executeFunctionAction(action: TriggerAction, context: TriggerContext): Promise<void> {
    let handler = action.handler;

    if (!handler && action.handlerName) {
      handler = this.handlers.get(action.handlerName);
    }

    if (!handler) {
      throw new Error(`Handler not found: ${action.handlerName ?? 'unnamed'}`);
    }

    await handler(context);

    logger.debug(
      { triggerId: context.trigger.id, handler: action.handlerName },
      'Function action executed'
    );
  }

  private evaluateConditionSet(conditions: TriggerCondition[], state: Record<string, unknown>): boolean {
    // All conditions must match (AND logic)
    for (const condition of conditions) {
      if (!this.evaluateCondition(condition, state)) {
        return false;
      }
    }
    return true;
  }

  private evaluateCondition(condition: TriggerCondition, state: Record<string, unknown>): boolean {
    const fieldValue = this.getNestedValue(state, condition.field);

    switch (condition.operator) {
      case 'eq':
        return fieldValue === condition.value;

      case 'ne':
        return fieldValue !== condition.value;

      case 'gt':
        return typeof fieldValue === 'number' && typeof condition.value === 'number'
          && fieldValue > condition.value;

      case 'gte':
        return typeof fieldValue === 'number' && typeof condition.value === 'number'
          && fieldValue >= condition.value;

      case 'lt':
        return typeof fieldValue === 'number' && typeof condition.value === 'number'
          && fieldValue < condition.value;

      case 'lte':
        return typeof fieldValue === 'number' && typeof condition.value === 'number'
          && fieldValue <= condition.value;

      case 'contains':
        return typeof fieldValue === 'string' && typeof condition.value === 'string'
          && fieldValue.includes(condition.value);

      case 'matches':
        return typeof fieldValue === 'string' && typeof condition.value === 'string'
          && new RegExp(condition.value).test(fieldValue);

      default:
        return false;
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}

// ============================================================================
// Factory and Global Instance
// ============================================================================

let globalTriggerManager: TriggerManager | null = null;

/**
 * Initialize the global trigger manager
 */
export async function initTriggerManager(
  config?: TriggerManagerConfig
): Promise<TriggerManager> {
  globalTriggerManager = new TriggerManager(config);
  await globalTriggerManager.initialize();
  return globalTriggerManager;
}

/**
 * Get the global trigger manager
 */
export function getTriggerManager(): TriggerManager {
  if (!globalTriggerManager) {
    throw new Error('Trigger manager not initialized. Call initTriggerManager() first.');
  }
  return globalTriggerManager;
}

/**
 * Check if trigger manager is initialized
 */
export function isTriggerManagerInitialized(): boolean {
  return globalTriggerManager !== null;
}
