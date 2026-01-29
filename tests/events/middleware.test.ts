import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EventBus,
  loggingMiddleware,
  tracingMiddleware,
  validationMiddleware,
  rateLimitMiddleware,
  transformMiddleware,
  filterMiddleware,
  deduplicationMiddleware,
  errorHandlingMiddleware,
  metricsMiddleware,
  composeMiddleware,
} from '../../src/events/index.js';

describe('Event Middlewares', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  afterEach(async () => {
    await bus.drain();
    bus.clear();
  });

  describe('loggingMiddleware', () => {
    it('should log events', async () => {
      bus.use(loggingMiddleware({ level: 'debug' }));

      const handler = vi.fn();
      bus.subscribe('test', handler);

      await bus.publish('test', { data: 'test' });
      await bus.drain();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('validationMiddleware', () => {
    it('should validate event data', async () => {
      const schemas = new Map<string, (data: unknown) => boolean>();
      schemas.set('validated', (data: unknown) => {
        return typeof data === 'object' && data !== null && 'required' in data;
      });

      bus.use(validationMiddleware({ schemas, onInvalid: 'throw' }));

      const handler = vi.fn();
      bus.subscribe('validated', handler);

      // Invalid event should throw
      await expect(
        bus.publish('validated', { notRequired: true })
      ).rejects.toThrow();

      // Valid event should pass
      await bus.publish('validated', { required: true });
      await bus.drain();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should skip invalid events when configured', async () => {
      const schemas = new Map<string, (data: unknown) => boolean>();
      schemas.set('skip-invalid', () => false);

      bus.use(validationMiddleware({ schemas, onInvalid: 'skip' }));

      const handler = vi.fn();
      bus.subscribe('skip-invalid', handler);

      await bus.publish('skip-invalid', { data: 'test' });
      await bus.drain();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('rateLimitMiddleware', () => {
    it('should rate limit events', async () => {
      bus.use(rateLimitMiddleware({ maxEventsPerSecond: 2 }));

      const handler = vi.fn();
      bus.subscribe('rate-limited', handler);

      // First two should succeed
      await bus.publish('rate-limited', { n: 1 });
      await bus.publish('rate-limited', { n: 2 });

      // Third should be rate limited
      await expect(
        bus.publish('rate-limited', { n: 3 })
      ).rejects.toThrow(/rate limit/i);
    });

    it('should rate limit per topic when configured', async () => {
      bus.use(rateLimitMiddleware({ maxEventsPerSecond: 2, perTopic: true }));

      const handler = vi.fn();
      bus.subscribe('topic-a', handler);
      bus.subscribe('topic-b', handler);

      // Each topic should have its own limit
      await bus.publish('topic-a', { n: 1 });
      await bus.publish('topic-a', { n: 2 });
      await bus.publish('topic-b', { n: 1 });
      await bus.publish('topic-b', { n: 2 });

      await bus.drain();
      expect(handler).toHaveBeenCalledTimes(4);
    });
  });

  describe('transformMiddleware', () => {
    it('should transform event data', async () => {
      const transforms = new Map<string, (data: unknown) => unknown>();
      transforms.set('transform', (data: any) => ({
        ...data,
        transformed: true,
      }));

      bus.use(transformMiddleware({ transforms }));

      const handler = vi.fn();
      bus.subscribe('transform', handler);

      await bus.publish('transform', { original: true });
      await bus.drain();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { original: true, transformed: true },
        })
      );
    });
  });

  describe('filterMiddleware', () => {
    it('should filter events based on predicate', async () => {
      bus.use(filterMiddleware({
        predicate: (event) => event.data.allowed === true,
      }));

      const handler = vi.fn();
      bus.subscribe('filtered', handler);

      await bus.publish('filtered', { allowed: false });
      await bus.publish('filtered', { allowed: true });
      await bus.drain();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { allowed: true },
        })
      );
    });
  });

  describe('deduplicationMiddleware', () => {
    it('should deduplicate events', async () => {
      bus.use(deduplicationMiddleware({
        windowMs: 1000,
        keyExtractor: (event) => event.data.key,
      }));

      const handler = vi.fn();
      bus.subscribe('dedup', handler);

      await bus.publish('dedup', { key: 'same' });
      await bus.publish('dedup', { key: 'same' });
      await bus.publish('dedup', { key: 'different' });
      await bus.drain();

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('errorHandlingMiddleware', () => {
    it('should catch and handle errors', async () => {
      const onError = vi.fn();

      bus.use(errorHandlingMiddleware({ onError, rethrow: false }));

      bus.subscribe('error-test', () => {
        throw new Error('handler error');
      });

      await bus.publish('error-test', { data: 'test' });
      await bus.drain();

      expect(onError).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Error)
      );
    });

    it('should rethrow errors when configured', async () => {
      const onError = vi.fn();

      bus.use(errorHandlingMiddleware({ onError, rethrow: true }));

      bus.subscribe('rethrow-test', () => {
        throw new Error('handler error');
      });

      await bus.publish('rethrow-test', { data: 'test' });
      // Error should be thrown and eventually end up in dead letter queue
      await bus.drain();

      expect(onError).toHaveBeenCalled();
    });
  });

  describe('metricsMiddleware', () => {
    it('should track event metrics', async () => {
      const metrics: Array<{ event: any; duration: number }> = [];

      bus.use(metricsMiddleware({
        onEvent: (event, duration) => {
          metrics.push({ event, duration });
        },
      }));

      const handler = vi.fn();
      bus.subscribe('metrics', handler);

      await bus.publish('metrics', { data: 'test' });
      await bus.drain();

      expect(metrics).toHaveLength(1);
      expect(metrics[0].duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('composeMiddleware', () => {
    it('should compose multiple middlewares', async () => {
      const order: string[] = [];

      const middleware1 = async (event: any, next: () => Promise<void>) => {
        order.push('m1-before');
        await next();
        order.push('m1-after');
      };

      const middleware2 = async (event: any, next: () => Promise<void>) => {
        order.push('m2-before');
        await next();
        order.push('m2-after');
      };

      bus.use(composeMiddleware(middleware1, middleware2));

      const handler = vi.fn(() => order.push('handler'));
      bus.subscribe('composed', handler);

      await bus.publish('composed', { data: 'test' });
      await bus.drain();

      expect(order).toEqual([
        'm1-before',
        'm2-before',
        'handler',
        'm2-after',
        'm1-after',
      ]);
    });
  });
});
