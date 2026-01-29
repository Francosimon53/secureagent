// ============================================================================
// Event Bus Types
// ============================================================================

/**
 * Base event interface
 */
export interface Event<T = unknown> {
  /** Unique event ID */
  id: string;
  /** Event type/topic */
  type: string;
  /** Event payload */
  data: T;
  /** Event timestamp */
  timestamp: number;
  /** Source of the event */
  source?: string;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Causation ID (ID of event that caused this one) */
  causationId?: string;
  /** Event metadata */
  metadata?: Record<string, unknown>;
  /** Event version for schema evolution */
  version?: number;
}

/**
 * Event envelope with delivery info
 */
export interface EventEnvelope<T = unknown> extends Event<T> {
  /** Delivery attempt number */
  attempt: number;
  /** First delivery attempt timestamp */
  firstAttemptAt: number;
  /** Last delivery attempt timestamp */
  lastAttemptAt: number;
  /** Subscriber that received this event */
  subscriberId?: string;
}

/**
 * Event handler function
 */
export type EventHandler<T = unknown> = (event: Event<T>) => void | Promise<void>;

/**
 * Event filter predicate
 */
export type EventFilter<T = unknown> = (event: Event<T>) => boolean;

/**
 * Subscription options
 */
export interface SubscriptionOptions {
  /** Subscription ID (auto-generated if not provided) */
  id?: string;
  /** Filter events before delivery */
  filter?: EventFilter;
  /** Priority (higher = delivered first) */
  priority?: number;
  /** Process events sequentially */
  sequential?: boolean;
  /** Maximum concurrent handlers (if not sequential) */
  concurrency?: number;
  /** Retry failed handlers */
  retry?: {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
  /** Dead letter queue for failed events */
  deadLetterTopic?: string;
  /** Timeout for handler execution */
  timeout?: number;
  /** Only receive events after subscription */
  startFromNow?: boolean;
}

/**
 * Subscription info
 */
export interface Subscription {
  id: string;
  topic: string;
  handler: EventHandler;
  options: SubscriptionOptions;
  createdAt: number;
  active: boolean;
  stats: SubscriptionStats;
}

/**
 * Subscription statistics
 */
export interface SubscriptionStats {
  received: number;
  processed: number;
  failed: number;
  retried: number;
  deadLettered: number;
  lastEventAt: number | null;
  averageProcessingTime: number;
}

/**
 * Publish options
 */
export interface PublishOptions {
  /** Delay delivery by ms */
  delay?: number;
  /** Event priority */
  priority?: number;
  /** Time-to-live in ms */
  ttl?: number;
  /** Persist event */
  persist?: boolean;
  /** Correlation ID */
  correlationId?: string;
  /** Causation ID */
  causationId?: string;
}

/**
 * Topic configuration
 */
export interface TopicConfig {
  /** Topic name */
  name: string;
  /** Topic description */
  description?: string;
  /** Retain last N events */
  retainCount?: number;
  /** Retain events for N ms */
  retainDuration?: number;
  /** Maximum subscribers */
  maxSubscribers?: number;
  /** Dead letter topic */
  deadLetterTopic?: string;
  /** Schema for event validation */
  schema?: unknown;
}

/**
 * Event bus statistics
 */
export interface EventBusStats {
  totalPublished: number;
  totalDelivered: number;
  totalFailed: number;
  totalRetried: number;
  totalDeadLettered: number;
  activeSubscriptions: number;
  topicCount: number;
  queueSize: number;
  processingRate: number;
}

/**
 * Event store interface for persistence
 */
export interface EventStore {
  /** Store an event */
  store(event: Event): Promise<void>;
  /** Get events by topic */
  getByTopic(topic: string, options?: {
    limit?: number;
    after?: string;
    before?: string;
  }): Promise<Event[]>;
  /** Get event by ID */
  getById(id: string): Promise<Event | null>;
  /** Get events by correlation ID */
  getByCorrelationId(correlationId: string): Promise<Event[]>;
  /** Delete old events */
  cleanup(olderThan: number): Promise<number>;
}

/**
 * Middleware function for event processing
 */
export type EventMiddleware = (
  event: Event,
  next: () => Promise<void>
) => Promise<void>;

/**
 * Event bus configuration
 */
export interface EventBusConfig {
  /** Maximum queue size */
  maxQueueSize?: number;
  /** Default retry options */
  defaultRetry?: SubscriptionOptions['retry'];
  /** Enable event persistence */
  persistence?: boolean;
  /** Event store implementation */
  eventStore?: EventStore;
  /** Global middlewares */
  middlewares?: EventMiddleware[];
  /** Dead letter topic name */
  deadLetterTopic?: string;
  /** Enable metrics collection */
  enableMetrics?: boolean;
}
