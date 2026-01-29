import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EventBus,
  RequestReply,
  EventAggregator,
  Saga,
  AggregateRoot,
  SimpleEventStore,
} from '../../src/events/index.js';
import type { DomainEvent } from '../../src/events/index.js';

describe('RequestReply', () => {
  let bus: EventBus;
  let requestReply: RequestReply;

  beforeEach(() => {
    bus = new EventBus();
    requestReply = new RequestReply(bus);
  });

  afterEach(() => {
    requestReply.destroy();
  });

  describe('request', () => {
    it('should send request and receive reply', async () => {
      // Set up responder
      requestReply.respond<{ name: string }, { greeting: string }>(
        'greet',
        (data) => ({ greeting: `Hello, ${data.name}!` })
      );

      const response = await requestReply.request<{ name: string }, { greeting: string }>(
        'greet',
        { name: 'World' }
      );

      expect(response.greeting).toBe('Hello, World!');
    });

    it('should handle async responders', async () => {
      requestReply.respond<number, number>('double', async (n) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return n * 2;
      });

      const result = await requestReply.request<number, number>('double', 21);
      expect(result).toBe(42);
    });

    it('should timeout on no response', async () => {
      await expect(
        requestReply.request('no-responder', { data: 'test' }, { timeout: 100 })
      ).rejects.toThrow(/timed out/);
    });

    it('should propagate responder errors', async () => {
      requestReply.respond('failing', () => {
        throw new Error('responder error');
      });

      await expect(
        requestReply.request('failing', { data: 'test' })
      ).rejects.toThrow('responder error');
    });
  });
});

describe('EventAggregator', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe('aggregation', () => {
    it('should aggregate events over time window', async () => {
      const windows: any[] = [];

      const aggregator = new EventAggregator(
        'events',
        { windowDuration: 100, maxEvents: 10 },
        bus
      );

      aggregator.start((window) => {
        windows.push(window);
      });

      await bus.publish('events', { n: 1 });
      await bus.publish('events', { n: 2 });
      await bus.publish('events', { n: 3 });

      // Wait for window to close
      await new Promise(resolve => setTimeout(resolve, 150));

      aggregator.stop();

      expect(windows).toHaveLength(1);
      expect(windows[0].events).toHaveLength(3);
    });

    it('should close window early when maxEvents reached', async () => {
      const windows: any[] = [];

      const aggregator = new EventAggregator(
        'events',
        { windowDuration: 10000, maxEvents: 2 },
        bus
      );

      aggregator.start((window) => {
        windows.push(window);
      });

      await bus.publish('events', { n: 1 });
      await bus.publish('events', { n: 2 });
      await bus.drain();

      // Small delay for processing
      await new Promise(resolve => setTimeout(resolve, 50));

      aggregator.stop();

      expect(windows.length).toBeGreaterThanOrEqual(1);
      expect(windows[0].events).toHaveLength(2);
    });

    it('should aggregate from multiple topics', async () => {
      const windows: any[] = [];

      const aggregator = new EventAggregator(
        ['topic-a', 'topic-b'],
        { windowDuration: 100 },
        bus
      );

      aggregator.start((window) => {
        windows.push(window);
      });

      await bus.publish('topic-a', { source: 'a' });
      await bus.publish('topic-b', { source: 'b' });

      await new Promise(resolve => setTimeout(resolve, 150));

      aggregator.stop();

      expect(windows[0].events).toHaveLength(2);
    });
  });
});

describe('Saga', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe('execute', () => {
    it('should execute all steps successfully', async () => {
      const saga = new Saga<{ value: number }>('test-saga', bus);

      saga
        .step({
          name: 'step1',
          execute: async (ctx) => ({ ...ctx, value: ctx.value + 1 }),
        })
        .step({
          name: 'step2',
          execute: async (ctx) => ({ ...ctx, value: ctx.value * 2 }),
        });

      const result = await saga.execute({ value: 5 });

      expect(result.success).toBe(true);
      expect(result.context.value).toBe(12); // (5 + 1) * 2
      expect(result.completedSteps).toEqual(['step1', 'step2']);
    });

    it('should run compensating transactions on failure', async () => {
      const compensated: string[] = [];

      const saga = new Saga<{ value: number }>('compensate-saga', bus);

      saga
        .step({
          name: 'step1',
          execute: async (ctx) => ({ ...ctx, value: ctx.value + 1 }),
          compensate: async () => { compensated.push('step1'); },
        })
        .step({
          name: 'step2',
          execute: async (ctx) => ({ ...ctx, value: ctx.value * 2 }),
          compensate: async () => { compensated.push('step2'); },
        })
        .step({
          name: 'step3',
          execute: async () => { throw new Error('step3 failed'); },
        });

      const result = await saga.execute({ value: 5 });

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('step3');
      expect(result.error).toBe('step3 failed');
      expect(compensated).toEqual(['step2', 'step1']); // Reverse order
    });

    it('should publish saga events', async () => {
      const events: string[] = [];

      bus.subscribe('saga.events-saga.started', () => events.push('started'));
      bus.subscribe('saga.events-saga.step.started', () => events.push('step-started'));
      bus.subscribe('saga.events-saga.step.completed', () => events.push('step-completed'));
      bus.subscribe('saga.events-saga.completed', () => events.push('completed'));

      const saga = new Saga<{ value: number }>('events-saga', bus);

      saga.step({
        name: 'step1',
        execute: async (ctx) => ctx,
      });

      await saga.execute({ value: 1 });
      await bus.drain();

      expect(events).toContain('started');
      expect(events).toContain('step-started');
      expect(events).toContain('step-completed');
      expect(events).toContain('completed');
    });
  });
});

describe('Event Sourcing', () => {
  describe('AggregateRoot', () => {
    class Counter extends AggregateRoot<{ count: number }> {
      constructor(id: string) {
        super(id, 'Counter');
        this.state = { count: 0 };
      }

      increment(): void {
        this.apply('Incremented', { amount: 1 });
      }

      decrement(): void {
        this.apply('Decremented', { amount: 1 });
      }

      getCount(): number {
        return this.state.count;
      }

      protected applyEvent(event: DomainEvent): void {
        switch (event.type) {
          case 'Incremented':
            this.state.count += (event.data as { amount: number }).amount;
            break;
          case 'Decremented':
            this.state.count -= (event.data as { amount: number }).amount;
            break;
        }
      }
    }

    it('should track uncommitted events', () => {
      const counter = new Counter('counter-1');

      counter.increment();
      counter.increment();
      counter.decrement();

      expect(counter.getCount()).toBe(1);
      expect(counter.getUncommittedEvents()).toHaveLength(3);
      expect(counter.getVersion()).toBe(3);
    });

    it('should clear uncommitted events', () => {
      const counter = new Counter('counter-1');

      counter.increment();
      counter.clearUncommittedEvents();

      expect(counter.getUncommittedEvents()).toHaveLength(0);
    });

    it('should load from history', () => {
      const counter = new Counter('counter-1');

      const history: DomainEvent[] = [
        {
          id: '1',
          type: 'Incremented',
          data: { amount: 1 },
          timestamp: Date.now(),
          aggregateId: 'counter-1',
          aggregateType: 'Counter',
          sequenceNumber: 1,
        },
        {
          id: '2',
          type: 'Incremented',
          data: { amount: 1 },
          timestamp: Date.now(),
          aggregateId: 'counter-1',
          aggregateType: 'Counter',
          sequenceNumber: 2,
        },
      ];

      counter.loadFromHistory(history);

      expect(counter.getCount()).toBe(2);
      expect(counter.getVersion()).toBe(2);
      expect(counter.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('SimpleEventStore', () => {
    let bus: EventBus;
    let store: SimpleEventStore;

    beforeEach(() => {
      bus = new EventBus();
      store = new SimpleEventStore(bus);
    });

    it('should save and retrieve events', async () => {
      const events: DomainEvent[] = [
        {
          id: '1',
          type: 'Created',
          data: { name: 'test' },
          timestamp: Date.now(),
          aggregateId: 'agg-1',
          aggregateType: 'TestAggregate',
          sequenceNumber: 1,
        },
      ];

      await store.save('agg-1', events);

      const retrieved = store.getEvents('agg-1');
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].data).toEqual({ name: 'test' });
    });

    it('should filter events by sequence number', async () => {
      const events: DomainEvent[] = [
        {
          id: '1',
          type: 'Event1',
          data: {},
          timestamp: Date.now(),
          aggregateId: 'agg-1',
          aggregateType: 'TestAggregate',
          sequenceNumber: 1,
        },
        {
          id: '2',
          type: 'Event2',
          data: {},
          timestamp: Date.now(),
          aggregateId: 'agg-1',
          aggregateType: 'TestAggregate',
          sequenceNumber: 2,
        },
        {
          id: '3',
          type: 'Event3',
          data: {},
          timestamp: Date.now(),
          aggregateId: 'agg-1',
          aggregateType: 'TestAggregate',
          sequenceNumber: 3,
        },
      ];

      await store.save('agg-1', events);

      const afterSeq1 = store.getEvents('agg-1', 1);
      expect(afterSeq1).toHaveLength(2);
      expect(afterSeq1[0].sequenceNumber).toBe(2);
    });

    it('should get events by type', async () => {
      await store.save('agg-1', [{
        id: '1',
        type: 'TypeA',
        data: {},
        timestamp: Date.now(),
        aggregateId: 'agg-1',
        aggregateType: 'Test',
        sequenceNumber: 1,
      }]);

      await store.save('agg-2', [{
        id: '2',
        type: 'TypeA',
        data: {},
        timestamp: Date.now(),
        aggregateId: 'agg-2',
        aggregateType: 'Test',
        sequenceNumber: 1,
      }]);

      await store.save('agg-3', [{
        id: '3',
        type: 'TypeB',
        data: {},
        timestamp: Date.now(),
        aggregateId: 'agg-3',
        aggregateType: 'Test',
        sequenceNumber: 1,
      }]);

      const typeAEvents = store.getEventsByType('TypeA');
      expect(typeAEvents).toHaveLength(2);
    });

    it('should publish events to bus', async () => {
      const handler = vi.fn();
      bus.subscribe('TestEvent', handler);

      await store.save('agg-1', [{
        id: '1',
        type: 'TestEvent',
        data: { value: 42 },
        timestamp: Date.now(),
        aggregateId: 'agg-1',
        aggregateType: 'Test',
        sequenceNumber: 1,
      }]);

      await bus.drain();

      expect(handler).toHaveBeenCalled();
    });
  });
});
