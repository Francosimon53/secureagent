import { Event, EventMiddleware } from './types.js';
import { getLogger } from '../observability/logger.js';
import { getTracer } from '../observability/tracing.js';

const logger = getLogger().child({ module: 'EventMiddleware' });

// ============================================================================
// Built-in Middlewares
// ============================================================================

/**
 * Logging middleware - logs all events
 */
export function loggingMiddleware(options: {
  level?: 'debug' | 'info';
  includeData?: boolean;
} = {}): EventMiddleware {
  const level = options.level ?? 'debug';
  const includeData = options.includeData ?? false;

  return async (event, next) => {
    const logData: Record<string, unknown> = {
      eventId: event.id,
      type: event.type,
      correlationId: event.correlationId,
    };

    if (includeData) {
      logData.data = event.data;
    }

    logger[level](logData, 'Event received');
    await next();
    logger[level]({ eventId: event.id }, 'Event processed');
  };
}

/**
 * Audit middleware - records events for compliance
 */
export function auditMiddleware(options: {
  topics?: string[];
  excludeTopics?: string[];
} = {}): EventMiddleware {
  const auditLog = getLogger().child({ module: 'EventAudit' });

  return async (event, next) => {
    // Check if we should audit this event
    if (options.topics && !options.topics.includes(event.type)) {
      await next();
      return;
    }

    if (options.excludeTopics?.includes(event.type)) {
      await next();
      return;
    }

    // Record before processing
    auditLog.info({
      action: 'event.received',
      eventId: event.id,
      eventType: event.type,
      correlationId: event.correlationId,
      source: event.source,
      eventTimestamp: event.timestamp,
    }, 'Event received for processing');

    await next();

    // Record after processing
    auditLog.info({
      action: 'event.processed',
      eventId: event.id,
      eventType: event.type,
    }, 'Event processed successfully');
  };
}

/**
 * Tracing middleware - adds distributed tracing
 */
export function tracingMiddleware(): EventMiddleware {
  return async (event, next) => {
    const tracer = getTracer();
    const span = tracer.startSpan(`event.${event.type}`, {
      attributes: {
        'event.id': event.id,
        'event.type': event.type,
        'event.source': event.source ?? 'unknown',
        'event.correlationId': event.correlationId ?? '',
      },
    });

    try {
      await next();
      span.setStatus('ok');
    } catch (error) {
      span.setStatus('error', error instanceof Error ? error.message : 'Unknown error');
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  };
}

/**
 * Validation middleware - validates event data against schema
 */
export function validationMiddleware(options: {
  schemas: Map<string, (data: unknown) => boolean>;
  onInvalid?: 'throw' | 'skip' | 'log';
}): EventMiddleware {
  const onInvalid = options.onInvalid ?? 'throw';

  return async (event, next) => {
    const validator = options.schemas.get(event.type);

    if (validator && !validator(event.data)) {
      const message = `Invalid event data for type '${event.type}'`;

      if (onInvalid === 'throw') {
        throw new Error(message);
      } else if (onInvalid === 'log') {
        logger.warn({ eventId: event.id, type: event.type }, message);
      } else if (onInvalid === 'skip') {
        logger.debug({ eventId: event.id, type: event.type }, 'Skipping invalid event');
        return;
      }
    }

    await next();
  };
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(options: {
  maxEventsPerSecond: number;
  perTopic?: boolean;
}): EventMiddleware {
  const counts = new Map<string, number[]>();
  const windowMs = 1000;

  return async (event, next) => {
    const key = options.perTopic ? event.type : '__global__';
    const now = Date.now();

    // Get or initialize window
    let timestamps = counts.get(key) ?? [];

    // Remove old timestamps
    timestamps = timestamps.filter(t => now - t < windowMs);

    // Check limit
    if (timestamps.length >= options.maxEventsPerSecond) {
      throw new Error(`Rate limit exceeded for ${options.perTopic ? `topic '${event.type}'` : 'event bus'}`);
    }

    // Add current timestamp
    timestamps.push(now);
    counts.set(key, timestamps);

    await next();
  };
}

/**
 * Transformation middleware - transforms event data
 */
export function transformMiddleware(options: {
  transforms: Map<string, (data: unknown) => unknown>;
}): EventMiddleware {
  return async (event, next) => {
    const transform = options.transforms.get(event.type);

    if (transform) {
      (event as { data: unknown }).data = transform(event.data);
    }

    await next();
  };
}

/**
 * Filtering middleware - filters events based on predicate
 */
export function filterMiddleware(options: {
  predicate: (event: Event) => boolean;
  onFiltered?: 'skip' | 'log';
}): EventMiddleware {
  return async (event, next) => {
    if (!options.predicate(event)) {
      if (options.onFiltered === 'log') {
        logger.debug({ eventId: event.id, type: event.type }, 'Event filtered out');
      }
      return;
    }

    await next();
  };
}

/**
 * Deduplication middleware - prevents duplicate event processing
 */
export function deduplicationMiddleware(options: {
  windowMs?: number;
  keyExtractor?: (event: Event) => string;
} = {}): EventMiddleware {
  const windowMs = options.windowMs ?? 60000; // 1 minute default
  const seenEvents = new Map<string, number>();
  const keyExtractor = options.keyExtractor ?? ((e: Event) => e.id);

  // Cleanup old entries periodically
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamp] of seenEvents) {
      if (timestamp < cutoff) {
        seenEvents.delete(key);
      }
    }
  }, windowMs);

  return async (event, next) => {
    const key = keyExtractor(event);
    const now = Date.now();

    if (seenEvents.has(key)) {
      const lastSeen = seenEvents.get(key)!;
      if (now - lastSeen < windowMs) {
        logger.debug({ eventId: event.id, key }, 'Duplicate event skipped');
        return;
      }
    }

    seenEvents.set(key, now);
    await next();
  };
}

/**
 * Error handling middleware - catches and handles errors
 */
export function errorHandlingMiddleware(options: {
  onError: (event: Event, error: Error) => void | Promise<void>;
  rethrow?: boolean;
}): EventMiddleware {
  return async (event, next) => {
    try {
      await next();
    } catch (error) {
      await options.onError(event, error as Error);
      if (options.rethrow !== false) {
        throw error;
      }
    }
  };
}

/**
 * Metrics middleware - collects event metrics
 */
export function metricsMiddleware(options: {
  onEvent?: (event: Event, duration: number) => void;
} = {}): EventMiddleware {
  return async (event, next) => {
    const start = Date.now();

    try {
      await next();
    } finally {
      const duration = Date.now() - start;
      options.onEvent?.(event, duration);
    }
  };
}

/**
 * Compose multiple middlewares into one
 */
export function composeMiddleware(...middlewares: EventMiddleware[]): EventMiddleware {
  return async (event, next) => {
    let index = 0;

    const dispatch = async (): Promise<void> => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++];
        await middleware(event, dispatch);
      } else {
        await next();
      }
    };

    await dispatch();
  };
}
