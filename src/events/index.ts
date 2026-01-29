// Types
export {
  type Event,
  type EventEnvelope,
  type EventHandler,
  type EventFilter,
  type SubscriptionOptions,
  type Subscription,
  type SubscriptionStats,
  type PublishOptions,
  type TopicConfig,
  type EventBusStats,
  type EventStore,
  type EventMiddleware,
  type EventBusConfig,
} from './types.js';

// Event Bus
export {
  EventBus,
  getEventBus,
  initEventBus,
  createPublisher,
  createSubscriber,
} from './bus.js';

// Middleware
export {
  loggingMiddleware,
  auditMiddleware,
  tracingMiddleware,
  validationMiddleware,
  rateLimitMiddleware,
  transformMiddleware,
  filterMiddleware,
  deduplicationMiddleware,
  errorHandlingMiddleware,
  metricsMiddleware,
  composeMiddleware,
} from './middleware.js';

// Patterns
export {
  RequestReply,
  EventAggregator,
  Saga,
  AggregateRoot,
  SimpleEventStore,
  type RequestOptions,
  type AggregationWindow,
  type AggregatorOptions,
  type SagaStep,
  type SagaResult,
  type DomainEvent,
} from './patterns.js';
