import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EventBus,
  getEventBus,
  initEventBus,
  createPublisher,
  createSubscriber,
} from '../../src/events/index.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  afterEach(async () => {
    await bus.drain();
    bus.clear();
  });

  describe('publish and subscribe', () => {
    it('should deliver events to subscribers', async () => {
      const handler = vi.fn();

      bus.subscribe('test-topic', handler);
      await bus.publish('test-topic', { message: 'hello' });
      await bus.drain();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'test-topic',
          data: { message: 'hello' },
        })
      );
    });

    it('should deliver events to multiple subscribers', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.subscribe('test-topic', handler1);
      bus.subscribe('test-topic', handler2);
      await bus.publish('test-topic', { message: 'hello' });
      await bus.drain();

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should not deliver events to different topics', async () => {
      const handler = vi.fn();

      bus.subscribe('topic-a', handler);
      await bus.publish('topic-b', { message: 'hello' });
      await bus.drain();

      expect(handler).not.toHaveBeenCalled();
    });

    it('should return event ID on publish', async () => {
      const eventId = await bus.publish('test-topic', { data: 'test' });
      expect(eventId).toBeDefined();
      expect(typeof eventId).toBe('string');
    });
  });

  describe('unsubscribe', () => {
    it('should stop delivering events after unsubscribe', async () => {
      const handler = vi.fn();

      const subId = bus.subscribe('test-topic', handler);
      await bus.publish('test-topic', { message: 'first' });
      await bus.drain();

      expect(handler).toHaveBeenCalledTimes(1);

      bus.unsubscribe('test-topic', subId);
      await bus.publish('test-topic', { message: 'second' });
      await bus.drain();

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('topics', () => {
    it('should create topics automatically', async () => {
      await bus.publish('auto-topic', { data: 'test' });

      const topic = bus.getTopic('auto-topic');
      expect(topic).toBeDefined();
      expect(topic?.name).toBe('auto-topic');
    });

    it('should create topics with configuration', () => {
      bus.createTopic({
        name: 'configured-topic',
        description: 'A configured topic',
        retainCount: 50,
        maxSubscribers: 10,
      });

      const topic = bus.getTopic('configured-topic');
      expect(topic?.retainCount).toBe(50);
      expect(topic?.maxSubscribers).toBe(10);
    });

    it('should delete topics', () => {
      bus.createTopic({ name: 'deletable' });
      expect(bus.getTopic('deletable')).toBeDefined();

      bus.deleteTopic('deletable');
      expect(bus.getTopic('deletable')).toBeUndefined();
    });
  });

  describe('subscription options', () => {
    it('should filter events', async () => {
      const handler = vi.fn();

      bus.subscribe('test-topic', handler, {
        filter: (event) => event.data.priority === 'high',
      });

      await bus.publish('test-topic', { priority: 'low' });
      await bus.publish('test-topic', { priority: 'high' });
      await bus.drain();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { priority: 'high' },
        })
      );
    });

    it('should respect priority order', async () => {
      const order: number[] = [];

      bus.subscribe('test-topic', () => order.push(1), { priority: 1 });
      bus.subscribe('test-topic', () => order.push(2), { priority: 2 });
      bus.subscribe('test-topic', () => order.push(3), { priority: 3 });

      await bus.publish('test-topic', {});
      await bus.drain();

      expect(order).toEqual([3, 2, 1]);
    });
  });

  describe('event retention', () => {
    it('should retain events for late subscribers', async () => {
      bus.createTopic({
        name: 'retained',
        retainCount: 10,
      });

      await bus.publish('retained', { message: 'retained-1' });
      await bus.publish('retained', { message: 'retained-2' });
      await bus.drain();

      const retained = bus.getRetainedEvents('retained');
      expect(retained).toHaveLength(2);
    });

    it('should enforce retention limits', async () => {
      bus.createTopic({
        name: 'limited',
        retainCount: 2,
      });

      await bus.publish('limited', { n: 1 });
      await bus.publish('limited', { n: 2 });
      await bus.publish('limited', { n: 3 });
      await bus.drain();

      const retained = bus.getRetainedEvents('limited');
      expect(retained).toHaveLength(2);
      expect(retained[0].data).toEqual({ n: 2 });
      expect(retained[1].data).toEqual({ n: 3 });
    });
  });

  describe('publish options', () => {
    it('should support delayed publishing', async () => {
      const handler = vi.fn();
      bus.subscribe('delayed', handler);

      const start = Date.now();
      await bus.publish('delayed', { data: 'test' }, { delay: 100 });

      // Should not be called immediately
      expect(handler).not.toHaveBeenCalled();

      // Wait for delay
      await new Promise(resolve => setTimeout(resolve, 150));
      await bus.drain();

      expect(handler).toHaveBeenCalled();
    });

    it('should support correlation IDs', async () => {
      const handler = vi.fn();
      bus.subscribe('correlated', handler);

      await bus.publish('correlated', { data: 'test' }, {
        correlationId: 'request-123',
      });
      await bus.drain();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'request-123',
        })
      );
    });
  });

  describe('batch publishing', () => {
    it('should publish multiple events', async () => {
      const handler = vi.fn();
      bus.subscribe('batch', handler);

      const ids = await bus.publishBatch([
        { topic: 'batch', data: { n: 1 } },
        { topic: 'batch', data: { n: 2 } },
        { topic: 'batch', data: { n: 3 } },
      ]);
      await bus.drain();

      expect(ids).toHaveLength(3);
      expect(handler).toHaveBeenCalledTimes(3);
    });
  });

  describe('statistics', () => {
    it('should track statistics', async () => {
      const handler = vi.fn();
      bus.subscribe('stats', handler);

      await bus.publish('stats', { data: 'test' });
      await bus.drain();

      const stats = bus.getStats();
      expect(stats.totalPublished).toBeGreaterThan(0);
      expect(stats.totalDelivered).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should retry failed deliveries', async () => {
      let attempts = 0;
      const handler = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) throw new Error('temporary failure');
      });

      bus.subscribe('retry-test', handler, {
        retry: {
          maxAttempts: 3,
          initialDelay: 10,
          maxDelay: 100,
          backoffMultiplier: 2,
        },
      });

      await bus.publish('retry-test', { data: 'test' });

      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(attempts).toBe(3);
    });
  });
});

describe('createPublisher', () => {
  it('should create a typed publisher', async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe('typed-topic', handler);

    interface MyEvent {
      userId: string;
      action: string;
    }

    const publish = createPublisher<MyEvent>(bus, 'typed-topic');

    await publish({ userId: 'user-1', action: 'login' });
    await bus.drain();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: 'user-1', action: 'login' },
      })
    );
  });
});

describe('createSubscriber', () => {
  it('should create a typed subscriber', async () => {
    const bus = new EventBus();

    interface MyEvent {
      value: number;
    }

    const received: MyEvent[] = [];

    createSubscriber<MyEvent>(bus, 'typed-topic', (event) => {
      received.push(event.data);
    });

    await bus.publish('typed-topic', { value: 42 });
    await bus.drain();

    expect(received).toEqual([{ value: 42 }]);
  });
});
