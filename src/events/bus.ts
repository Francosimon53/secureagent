import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import {
  Event,
  EventEnvelope,
  EventHandler,
  EventFilter,
  SubscriptionOptions,
  Subscription,
  SubscriptionStats,
  PublishOptions,
  TopicConfig,
  EventBusStats,
  EventStore,
  EventMiddleware,
  EventBusConfig,
} from './types.js';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'EventBus' });

// ============================================================================
// Event Bus Implementation
// ============================================================================

/**
 * In-memory event bus with pub/sub capabilities
 */
export class EventBus extends EventEmitter {
  private readonly config: Required<EventBusConfig>;
  private readonly subscriptions = new Map<string, Map<string, Subscription>>();
  private readonly topics = new Map<string, TopicConfig>();
  private readonly retainedEvents = new Map<string, Event[]>();
  private readonly pendingEvents: Array<{ event: Event; options: PublishOptions }> = [];
  private readonly middlewares: EventMiddleware[] = [];
  private processing = false;
  private stats: EventBusStats = {
    totalPublished: 0,
    totalDelivered: 0,
    totalFailed: 0,
    totalRetried: 0,
    totalDeadLettered: 0,
    activeSubscriptions: 0,
    topicCount: 0,
    queueSize: 0,
    processingRate: 0,
  };

  constructor(config: EventBusConfig = {}) {
    super();
    this.config = {
      maxQueueSize: config.maxQueueSize ?? 10000,
      defaultRetry: config.defaultRetry ?? {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
      },
      persistence: config.persistence ?? false,
      eventStore: config.eventStore ?? undefined as unknown as EventStore,
      middlewares: config.middlewares ?? [],
      deadLetterTopic: config.deadLetterTopic ?? '__dead_letter__',
      enableMetrics: config.enableMetrics ?? true,
    };

    this.middlewares = [...this.config.middlewares];

    // Create dead letter topic
    this.createTopic({
      name: this.config.deadLetterTopic,
      description: 'Dead letter queue for failed events',
      retainCount: 1000,
    });
  }

  /**
   * Create a topic with configuration
   */
  createTopic(config: TopicConfig): void {
    if (this.topics.has(config.name)) {
      logger.warn({ topic: config.name }, 'Topic already exists');
      return;
    }

    this.topics.set(config.name, {
      retainCount: 100,
      retainDuration: 3600000, // 1 hour
      maxSubscribers: 100,
      ...config,
    });
    this.subscriptions.set(config.name, new Map());
    this.retainedEvents.set(config.name, []);
    this.stats.topicCount++;

    logger.info({ topic: config.name }, 'Topic created');
  }

  /**
   * Delete a topic
   */
  deleteTopic(name: string): boolean {
    if (name === this.config.deadLetterTopic) {
      logger.warn('Cannot delete dead letter topic');
      return false;
    }

    const deleted = this.topics.delete(name);
    if (deleted) {
      this.subscriptions.delete(name);
      this.retainedEvents.delete(name);
      this.stats.topicCount--;
      logger.info({ topic: name }, 'Topic deleted');
    }
    return deleted;
  }

  /**
   * Subscribe to a topic
   */
  subscribe<T = unknown>(
    topic: string,
    handler: EventHandler<T>,
    options: SubscriptionOptions = {}
  ): string {
    // Auto-create topic if it doesn't exist
    if (!this.topics.has(topic)) {
      this.createTopic({ name: topic });
    }

    const topicConfig = this.topics.get(topic)!;
    const topicSubs = this.subscriptions.get(topic)!;

    // Check max subscribers
    if (topicConfig.maxSubscribers && topicSubs.size >= topicConfig.maxSubscribers) {
      throw new Error(`Topic '${topic}' has reached maximum subscribers (${topicConfig.maxSubscribers})`);
    }

    const subscriptionId = options.id ?? randomUUID();

    const subscription: Subscription = {
      id: subscriptionId,
      topic,
      handler: handler as EventHandler,
      options: {
        priority: 0,
        sequential: false,
        concurrency: 10,
        timeout: 30000,
        startFromNow: true,
        ...options,
        retry: options.retry ?? this.config.defaultRetry,
      },
      createdAt: Date.now(),
      active: true,
      stats: {
        received: 0,
        processed: 0,
        failed: 0,
        retried: 0,
        deadLettered: 0,
        lastEventAt: null,
        averageProcessingTime: 0,
      },
    };

    topicSubs.set(subscriptionId, subscription);
    this.stats.activeSubscriptions++;

    logger.debug({ topic, subscriptionId }, 'Subscription created');

    // Deliver retained events if not starting from now
    if (!options.startFromNow) {
      const retained = this.retainedEvents.get(topic) ?? [];
      for (const event of retained) {
        this.deliverToSubscription(subscription, event);
      }
    }

    return subscriptionId;
  }

  /**
   * Unsubscribe from a topic
   */
  unsubscribe(topic: string, subscriptionId: string): boolean {
    const topicSubs = this.subscriptions.get(topic);
    if (!topicSubs) return false;

    const subscription = topicSubs.get(subscriptionId);
    if (subscription) {
      subscription.active = false;
      topicSubs.delete(subscriptionId);
      this.stats.activeSubscriptions--;
      logger.debug({ topic, subscriptionId }, 'Subscription removed');
      return true;
    }
    return false;
  }

  /**
   * Publish an event
   */
  async publish<T = unknown>(
    topic: string,
    data: T,
    options: PublishOptions = {}
  ): Promise<string> {
    // Auto-create topic if it doesn't exist
    if (!this.topics.has(topic)) {
      this.createTopic({ name: topic });
    }

    const event: Event<T> = {
      id: randomUUID(),
      type: topic,
      data,
      timestamp: Date.now(),
      correlationId: options.correlationId,
      causationId: options.causationId,
      version: 1,
    };

    // Check queue size
    if (this.pendingEvents.length >= this.config.maxQueueSize) {
      throw new Error('Event queue is full');
    }

    // Persist if enabled
    if (this.config.persistence && this.config.eventStore) {
      await this.config.eventStore.store(event);
    }

    // Delay if specified
    if (options.delay && options.delay > 0) {
      setTimeout(() => {
        this.queueEventForDelivery(event, options);
      }, options.delay);
      this.stats.totalPublished++;
      logger.debug({ topic, eventId: event.id }, 'Event published (delayed)');
      return event.id;
    }

    // For immediate delivery, run middlewares wrapping around delivery
    // This allows error handling middleware to catch handler errors
    const shouldContinue = await this.runMiddlewaresWithDelivery(event, options);
    if (!shouldContinue) {
      // Event was filtered/skipped by middleware
      return event.id;
    }

    this.stats.totalPublished++;
    logger.debug({ topic, eventId: event.id }, 'Event published');

    return event.id;
  }

  /**
   * Publish multiple events atomically
   */
  async publishBatch<T = unknown>(
    events: Array<{ topic: string; data: T; options?: PublishOptions }>
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const e of events) {
      const id = await this.publish(e.topic, e.data, e.options);
      ids.push(id);
    }
    return ids;
  }

  /**
   * Add middleware
   */
  use(middleware: EventMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Get topic info
   */
  getTopic(name: string): TopicConfig | undefined {
    return this.topics.get(name);
  }

  /**
   * Get all topics
   */
  getTopics(): TopicConfig[] {
    return Array.from(this.topics.values());
  }

  /**
   * Get subscription info
   */
  getSubscription(topic: string, subscriptionId: string): Subscription | undefined {
    return this.subscriptions.get(topic)?.get(subscriptionId);
  }

  /**
   * Get all subscriptions for a topic
   */
  getSubscriptions(topic: string): Subscription[] {
    const topicSubs = this.subscriptions.get(topic);
    return topicSubs ? Array.from(topicSubs.values()) : [];
  }

  /**
   * Get statistics
   */
  getStats(): EventBusStats {
    return { ...this.stats, queueSize: this.pendingEvents.length };
  }

  /**
   * Get retained events for a topic
   */
  getRetainedEvents(topic: string): Event[] {
    return [...(this.retainedEvents.get(topic) ?? [])];
  }

  /**
   * Clear all events and subscriptions
   */
  clear(): void {
    this.pendingEvents.length = 0;
    for (const [topic] of this.subscriptions) {
      if (topic !== this.config.deadLetterTopic) {
        this.subscriptions.get(topic)?.clear();
        this.retainedEvents.set(topic, []);
      }
    }
    this.stats.activeSubscriptions = 0;
  }

  /**
   * Wait for all pending events to be processed
   */
  async drain(): Promise<void> {
    while (this.pendingEvents.length > 0 || this.processing) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Process the event queue (for delayed events)
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.pendingEvents.length > 0) {
        const item = this.pendingEvents.shift();
        if (!item) break;

        const { event, options } = item;

        // Check TTL
        if (options.ttl && Date.now() - event.timestamp > options.ttl) {
          logger.debug({ eventId: event.id }, 'Event expired');
          continue;
        }

        // For delayed events, run middlewares now (with delivery at the end)
        await this.runMiddlewaresWithDelivery(event, options);
        this.stats.totalPublished++;
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Run middleware chain with delivery at the end
   * This allows error handling middleware to catch handler errors
   * Returns true if event was processed, false if skipped by middleware
   */
  private async runMiddlewaresWithDelivery(event: Event, options: PublishOptions): Promise<boolean> {
    let continued = false;
    let deliveryStarted = false;
    let index = 0;

    const next = async (): Promise<void> => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++];
        await middleware(event, next);
      } else {
        // End of middleware chain - now deliver the event
        continued = true;
        this.retainEvent(event);
        deliveryStarted = true;
        // Deliver with error propagation so middleware can catch handler errors
        await this.deliverEventWithErrorPropagation(event);
      }
    };

    if (this.middlewares.length === 0) {
      // No middlewares, just deliver normally
      this.retainEvent(event);
      await this.deliverEvent(event);
      return true;
    }

    try {
      await next();
    } catch (error) {
      // Only catch errors that occurred during/after delivery (handler errors)
      // Let middleware errors (validation, rate limiting) propagate to reject publish()
      if (deliveryStarted) {
        // Handler error that was rethrown by middleware after being handled
        // The error was already logged/handled by handleDeliveryFailure
        logger.debug({ eventId: event.id, error }, 'Handler error propagated through middleware chain');
        continued = true;
      } else {
        // Middleware error (e.g., validation, rate limiting) - should reject publish()
        throw error;
      }
    }

    return continued;
  }

  /**
   * Queue event for delayed delivery (skips middleware during queueing)
   */
  private queueEventForDelivery(event: Event, options: PublishOptions): void {
    this.pendingEvents.push({ event, options });
    this.processQueue();
  }

  /**
   * Retain event for late subscribers
   */
  private retainEvent(event: Event): void {
    const topicConfig = this.topics.get(event.type);
    if (!topicConfig) return;

    const retained = this.retainedEvents.get(event.type) ?? [];
    retained.push(event);

    // Enforce retention limits
    const now = Date.now();

    // Remove old events by duration
    if (topicConfig.retainDuration) {
      const cutoff = now - topicConfig.retainDuration;
      while (retained.length > 0 && retained[0].timestamp < cutoff) {
        retained.shift();
      }
    }

    // Remove old events by count
    if (topicConfig.retainCount) {
      while (retained.length > topicConfig.retainCount) {
        retained.shift();
      }
    }

    this.retainedEvents.set(event.type, retained);
  }

  /**
   * Deliver event to all subscribers
   */
  private async deliverEvent(event: Event): Promise<void> {
    const topicSubs = this.subscriptions.get(event.type);
    if (!topicSubs || topicSubs.size === 0) return;

    // Sort by priority (higher first)
    const subscribers = Array.from(topicSubs.values())
      .filter(s => s.active)
      .sort((a, b) => (b.options.priority ?? 0) - (a.options.priority ?? 0));

    // Deliver to each subscriber
    const deliveries = subscribers.map(sub => this.deliverToSubscription(sub, event));
    await Promise.all(deliveries);
  }

  /**
   * Deliver event with error propagation (for middleware error handling)
   * Errors from handlers propagate so middleware can catch them
   */
  private async deliverEventWithErrorPropagation(event: Event): Promise<void> {
    const topicSubs = this.subscriptions.get(event.type);
    if (!topicSubs || topicSubs.size === 0) return;

    // Sort by priority (higher first)
    const subscribers = Array.from(topicSubs.values())
      .filter(s => s.active)
      .sort((a, b) => (b.options.priority ?? 0) - (a.options.priority ?? 0));

    // Deliver to each subscriber, propagating first error
    const errors: Error[] = [];
    for (const sub of subscribers) {
      try {
        await this.deliverToSubscriptionWithErrorPropagation(sub, event);
      } catch (error) {
        errors.push(error as Error);
      }
    }

    // If any errors occurred, throw the first one (so middleware can catch it)
    if (errors.length > 0) {
      throw errors[0];
    }
  }

  /**
   * Deliver to subscription with error propagation
   */
  private async deliverToSubscriptionWithErrorPropagation(
    subscription: Subscription,
    event: Event
  ): Promise<void> {
    // Apply filter
    if (subscription.options.filter && !subscription.options.filter(event)) {
      return;
    }

    subscription.stats.received++;
    subscription.stats.lastEventAt = Date.now();

    const envelope: EventEnvelope = {
      ...event,
      attempt: 1,
      firstAttemptAt: Date.now(),
      lastAttemptAt: Date.now(),
      subscriberId: subscription.id,
    };

    try {
      await this.executeHandler(subscription, envelope);
      subscription.stats.processed++;
      this.stats.totalDelivered++;
    } catch (error) {
      // Log and schedule retry but also propagate the error
      await this.handleDeliveryFailure(subscription, envelope, error);
      // Re-throw so middleware can catch it
      throw error;
    }
  }

  /**
   * Deliver event to a single subscription
   */
  private async deliverToSubscription(subscription: Subscription, event: Event): Promise<void> {
    // Apply filter
    if (subscription.options.filter && !subscription.options.filter(event)) {
      return;
    }

    subscription.stats.received++;
    subscription.stats.lastEventAt = Date.now();

    const envelope: EventEnvelope = {
      ...event,
      attempt: 1,
      firstAttemptAt: Date.now(),
      lastAttemptAt: Date.now(),
      subscriberId: subscription.id,
    };

    try {
      await this.executeHandler(subscription, envelope);
      subscription.stats.processed++;
      this.stats.totalDelivered++;
    } catch (error) {
      await this.handleDeliveryFailure(subscription, envelope, error);
    }
  }

  /**
   * Execute handler with timeout
   */
  private async executeHandler(subscription: Subscription, envelope: EventEnvelope): Promise<void> {
    const timeout = subscription.options.timeout ?? 30000;

    await Promise.race([
      subscription.handler(envelope),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Handler timeout')), timeout)
      ),
    ]);
  }

  /**
   * Handle delivery failure with retry
   */
  private async handleDeliveryFailure(
    subscription: Subscription,
    envelope: EventEnvelope,
    error: unknown
  ): Promise<void> {
    const retryConfig = subscription.options.retry;
    subscription.stats.failed++;
    this.stats.totalFailed++;

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn({
      topic: envelope.type,
      eventId: envelope.id,
      subscriptionId: subscription.id,
      attempt: envelope.attempt,
      error: errorMessage,
    }, 'Event delivery failed');

    // Check if we should retry
    if (retryConfig && envelope.attempt < retryConfig.maxAttempts) {
      const delay = Math.min(
        retryConfig.initialDelay * Math.pow(retryConfig.backoffMultiplier, envelope.attempt - 1),
        retryConfig.maxDelay
      );

      subscription.stats.retried++;
      this.stats.totalRetried++;

      // Schedule retry
      setTimeout(async () => {
        const retryEnvelope: EventEnvelope = {
          ...envelope,
          attempt: envelope.attempt + 1,
          lastAttemptAt: Date.now(),
        };

        try {
          await this.executeHandler(subscription, retryEnvelope);
          subscription.stats.processed++;
          this.stats.totalDelivered++;
        } catch (retryError) {
          await this.handleDeliveryFailure(subscription, retryEnvelope, retryError);
        }
      }, delay);
    } else {
      // Send to dead letter queue
      await this.sendToDeadLetter(envelope, subscription, errorMessage);
    }
  }

  /**
   * Send event to dead letter topic
   */
  private async sendToDeadLetter(
    envelope: EventEnvelope,
    subscription: Subscription,
    error: string
  ): Promise<void> {
    const dlTopic = subscription.options.deadLetterTopic ?? this.config.deadLetterTopic;

    subscription.stats.deadLettered++;
    this.stats.totalDeadLettered++;

    await this.publish(dlTopic, {
      originalEvent: envelope,
      subscriptionId: subscription.id,
      error,
      failedAt: Date.now(),
    });

    logger.error({
      topic: envelope.type,
      eventId: envelope.id,
      subscriptionId: subscription.id,
      error,
    }, 'Event sent to dead letter queue');
  }
}

// ============================================================================
// Typed Event Helpers
// ============================================================================

/**
 * Create a typed event publisher
 */
export function createPublisher<T>(
  bus: EventBus,
  topic: string,
  defaultOptions?: PublishOptions
): (data: T, options?: PublishOptions) => Promise<string> {
  return (data: T, options?: PublishOptions) =>
    bus.publish(topic, data, { ...defaultOptions, ...options });
}

/**
 * Create a typed event subscriber
 */
export function createSubscriber<T>(
  bus: EventBus,
  topic: string,
  handler: EventHandler<T>,
  options?: SubscriptionOptions
): string {
  return bus.subscribe(topic, handler, options);
}

// ============================================================================
// Singleton
// ============================================================================

let globalBus: EventBus | null = null;

/**
 * Get the global event bus
 */
export function getEventBus(): EventBus {
  if (!globalBus) {
    globalBus = new EventBus();
  }
  return globalBus;
}

/**
 * Initialize event bus with config
 */
export function initEventBus(config: EventBusConfig = {}): EventBus {
  globalBus = new EventBus(config);
  return globalBus;
}
