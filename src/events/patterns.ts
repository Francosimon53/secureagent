import { randomUUID } from 'crypto';
import { EventBus, getEventBus } from './bus.js';
import { Event, EventHandler, SubscriptionOptions } from './types.js';

// ============================================================================
// Request/Reply Pattern
// ============================================================================

/**
 * Request/Reply options
 */
export interface RequestOptions {
  timeout?: number;
  correlationId?: string;
}

/**
 * Request/Reply pattern implementation
 */
export class RequestReply {
  private readonly bus: EventBus;
  private readonly replyTopic: string;
  private readonly pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>();

  constructor(bus?: EventBus, replyTopic = '__replies__') {
    this.bus = bus ?? getEventBus();
    this.replyTopic = replyTopic;

    // Subscribe to replies
    this.bus.subscribe(this.replyTopic, this.handleReply.bind(this), {
      id: `reply-handler-${randomUUID()}`,
    });
  }

  /**
   * Send a request and wait for reply
   */
  async request<TRequest, TReply>(
    topic: string,
    data: TRequest,
    options: RequestOptions = {}
  ): Promise<TReply> {
    const correlationId = options.correlationId ?? randomUUID();
    const timeout = options.timeout ?? 30000;

    return new Promise<TReply>((resolve, reject) => {
      // Set timeout
      const timer = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`Request to '${topic}' timed out after ${timeout}ms`));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(correlationId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      // Send request
      this.bus.publish(topic, {
        data,
        replyTo: this.replyTopic,
        correlationId,
      }).catch(error => {
        this.pendingRequests.delete(correlationId);
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  /**
   * Handle incoming replies
   */
  private handleReply(event: Event): void {
    const { correlationId, data, error } = event.data as {
      correlationId: string;
      data?: unknown;
      error?: string;
    };

    const pending = this.pendingRequests.get(correlationId);
    if (!pending) return;

    this.pendingRequests.delete(correlationId);
    clearTimeout(pending.timer);

    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(data);
    }
  }

  /**
   * Create a responder for a topic
   */
  respond<TRequest, TReply>(
    topic: string,
    handler: (data: TRequest, event: Event) => TReply | Promise<TReply>
  ): string {
    return this.bus.subscribe(topic, async (event) => {
      const { data, replyTo, correlationId } = event.data as {
        data: TRequest;
        replyTo: string;
        correlationId: string;
      };

      try {
        const result = await handler(data, event);
        await this.bus.publish(replyTo, {
          correlationId,
          data: result,
        });
      } catch (error) {
        await this.bus.publish(replyTo, {
          correlationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  /**
   * Clean up
   */
  destroy(): void {
    for (const [, { timer, reject }] of this.pendingRequests) {
      clearTimeout(timer);
      reject(new Error('RequestReply destroyed'));
    }
    this.pendingRequests.clear();
  }
}

// ============================================================================
// Event Aggregator Pattern
// ============================================================================

/**
 * Aggregation window
 */
export interface AggregationWindow {
  events: Event[];
  startTime: number;
  endTime?: number;
}

/**
 * Aggregator options
 */
export interface AggregatorOptions {
  /** Window duration in ms */
  windowDuration: number;
  /** Maximum events per window */
  maxEvents?: number;
  /** Emit partial windows on close */
  emitPartial?: boolean;
}

/**
 * Event aggregator - collects events over a time window
 */
export class EventAggregator<T = unknown> {
  private readonly bus: EventBus;
  private readonly topics: string[];
  private readonly options: Required<AggregatorOptions>;
  private readonly subscriptions: string[] = [];
  private currentWindow: AggregationWindow | null = null;
  private windowTimer: NodeJS.Timeout | null = null;
  private aggregateHandler?: (window: AggregationWindow) => void | Promise<void>;

  constructor(
    topics: string | string[],
    options: AggregatorOptions,
    bus?: EventBus
  ) {
    this.bus = bus ?? getEventBus();
    this.topics = Array.isArray(topics) ? topics : [topics];
    this.options = {
      windowDuration: options.windowDuration,
      maxEvents: options.maxEvents ?? Infinity,
      emitPartial: options.emitPartial ?? true,
    };
  }

  /**
   * Start aggregation
   */
  start(handler: (window: AggregationWindow) => void | Promise<void>): void {
    this.aggregateHandler = handler;
    this.startNewWindow();

    // Subscribe to topics
    for (const topic of this.topics) {
      const subId = this.bus.subscribe(topic, this.handleEvent.bind(this));
      this.subscriptions.push(topic + ':' + subId);
    }
  }

  /**
   * Stop aggregation
   */
  stop(): void {
    // Unsubscribe
    for (const sub of this.subscriptions) {
      const [topic, subId] = sub.split(':');
      this.bus.unsubscribe(topic, subId);
    }
    this.subscriptions.length = 0;

    // Clear timer
    if (this.windowTimer) {
      clearTimeout(this.windowTimer);
      this.windowTimer = null;
    }

    // Emit final window if partial enabled
    if (this.options.emitPartial && this.currentWindow && this.currentWindow.events.length > 0) {
      this.closeWindow();
    }

    this.currentWindow = null;
  }

  /**
   * Handle incoming event
   */
  private handleEvent(event: Event): void {
    if (!this.currentWindow) return;

    this.currentWindow.events.push(event);

    // Check max events
    if (this.currentWindow.events.length >= this.options.maxEvents) {
      this.closeWindow();
      this.startNewWindow();
    }
  }

  /**
   * Start a new aggregation window
   */
  private startNewWindow(): void {
    this.currentWindow = {
      events: [],
      startTime: Date.now(),
    };

    this.windowTimer = setTimeout(() => {
      this.closeWindow();
      this.startNewWindow();
    }, this.options.windowDuration);
  }

  /**
   * Close current window and emit
   */
  private closeWindow(): void {
    if (!this.currentWindow) return;

    this.currentWindow.endTime = Date.now();

    if (this.aggregateHandler && this.currentWindow.events.length > 0) {
      this.aggregateHandler(this.currentWindow);
    }
  }
}

// ============================================================================
// Saga Pattern
// ============================================================================

/**
 * Saga step definition
 */
export interface SagaStep<TContext> {
  name: string;
  execute: (context: TContext) => Promise<TContext>;
  compensate?: (context: TContext) => Promise<void>;
}

/**
 * Saga execution result
 */
export interface SagaResult<TContext> {
  success: boolean;
  context: TContext;
  completedSteps: string[];
  failedStep?: string;
  error?: string;
}

/**
 * Saga orchestrator for distributed transactions
 */
export class Saga<TContext extends Record<string, unknown>> {
  private readonly bus: EventBus;
  private readonly name: string;
  private readonly steps: SagaStep<TContext>[] = [];

  constructor(name: string, bus?: EventBus) {
    this.name = name;
    this.bus = bus ?? getEventBus();
  }

  /**
   * Add a step to the saga
   */
  step(step: SagaStep<TContext>): this {
    this.steps.push(step);
    return this;
  }

  /**
   * Execute the saga
   */
  async execute(initialContext: TContext): Promise<SagaResult<TContext>> {
    const completedSteps: string[] = [];
    let context = { ...initialContext };

    // Publish saga started event
    await this.bus.publish(`saga.${this.name}.started`, {
      sagaName: this.name,
      context: initialContext,
    });

    try {
      for (const step of this.steps) {
        // Publish step started event
        await this.bus.publish(`saga.${this.name}.step.started`, {
          sagaName: this.name,
          stepName: step.name,
          context,
        });

        // Execute step
        context = await step.execute(context);
        completedSteps.push(step.name);

        // Publish step completed event
        await this.bus.publish(`saga.${this.name}.step.completed`, {
          sagaName: this.name,
          stepName: step.name,
          context,
        });
      }

      // Publish saga completed event
      await this.bus.publish(`saga.${this.name}.completed`, {
        sagaName: this.name,
        context,
        completedSteps,
      });

      return {
        success: true,
        context,
        completedSteps,
      };
    } catch (error) {
      const failedStep = this.steps[completedSteps.length]?.name ?? 'unknown';
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Publish step failed event
      await this.bus.publish(`saga.${this.name}.step.failed`, {
        sagaName: this.name,
        stepName: failedStep,
        error: errorMessage,
        context,
      });

      // Run compensating transactions in reverse order
      for (let i = completedSteps.length - 1; i >= 0; i--) {
        const step = this.steps[i];
        if (step.compensate) {
          try {
            await step.compensate(context);

            await this.bus.publish(`saga.${this.name}.step.compensated`, {
              sagaName: this.name,
              stepName: step.name,
            });
          } catch (compError) {
            await this.bus.publish(`saga.${this.name}.step.compensation-failed`, {
              sagaName: this.name,
              stepName: step.name,
              error: compError instanceof Error ? compError.message : String(compError),
            });
          }
        }
      }

      // Publish saga failed event
      await this.bus.publish(`saga.${this.name}.failed`, {
        sagaName: this.name,
        failedStep,
        error: errorMessage,
        completedSteps,
      });

      return {
        success: false,
        context,
        completedSteps,
        failedStep,
        error: errorMessage,
      };
    }
  }
}

// ============================================================================
// Event Sourcing Helpers
// ============================================================================

/**
 * Domain event for event sourcing
 */
export interface DomainEvent<T = unknown> extends Event<T> {
  aggregateId: string;
  aggregateType: string;
  sequenceNumber: number;
}

/**
 * Aggregate root base class
 */
export abstract class AggregateRoot<TState> {
  protected state!: TState;
  private uncommittedEvents: DomainEvent[] = [];
  private version = 0;

  constructor(
    public readonly id: string,
    public readonly type: string
  ) {}

  /**
   * Get current version
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Get uncommitted events
   */
  getUncommittedEvents(): DomainEvent[] {
    return [...this.uncommittedEvents];
  }

  /**
   * Clear uncommitted events
   */
  clearUncommittedEvents(): void {
    this.uncommittedEvents = [];
  }

  /**
   * Apply an event
   */
  protected apply<T>(eventType: string, data: T): void {
    const event: DomainEvent<T> = {
      id: randomUUID(),
      type: eventType,
      data,
      timestamp: Date.now(),
      aggregateId: this.id,
      aggregateType: this.type,
      sequenceNumber: ++this.version,
    };

    this.applyEvent(event);
    this.uncommittedEvents.push(event);
  }

  /**
   * Load from event history
   */
  loadFromHistory(events: DomainEvent[]): void {
    for (const event of events) {
      this.applyEvent(event);
      this.version = event.sequenceNumber;
    }
  }

  /**
   * Apply event to state (must be implemented by subclass)
   */
  protected abstract applyEvent(event: DomainEvent): void;
}

/**
 * Simple event store using event bus
 */
export class SimpleEventStore {
  private readonly bus: EventBus;
  private readonly events = new Map<string, DomainEvent[]>();

  constructor(bus?: EventBus) {
    this.bus = bus ?? getEventBus();
  }

  /**
   * Save events for an aggregate
   */
  async save(aggregateId: string, events: DomainEvent[]): Promise<void> {
    const existing = this.events.get(aggregateId) ?? [];
    existing.push(...events);
    this.events.set(aggregateId, existing);

    // Publish events to bus
    for (const event of events) {
      await this.bus.publish(event.type, event);
    }
  }

  /**
   * Get events for an aggregate
   */
  getEvents(aggregateId: string, afterSequence = 0): DomainEvent[] {
    const events = this.events.get(aggregateId) ?? [];
    return events.filter(e => e.sequenceNumber > afterSequence);
  }

  /**
   * Get all events of a type
   */
  getEventsByType(eventType: string): DomainEvent[] {
    const result: DomainEvent[] = [];
    for (const events of this.events.values()) {
      result.push(...events.filter(e => e.type === eventType));
    }
    return result.sort((a, b) => a.timestamp - b.timestamp);
  }
}
