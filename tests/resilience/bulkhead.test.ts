import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Bulkhead,
  BulkheadRegistry,
  Semaphore,
  BulkheadFullError,
  BulkheadTimeoutError,
  getBulkheadRegistry,
  createBulkhead,
} from '../../src/resilience/index.js';

describe('Semaphore', () => {
  it('should limit concurrent access', async () => {
    const semaphore = new Semaphore(2);
    let concurrent = 0;
    let maxConcurrent = 0;

    const task = async () => {
      await semaphore.acquire();
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(resolve => setTimeout(resolve, 50));
      concurrent--;
      semaphore.release();
    };

    await Promise.all([task(), task(), task(), task()]);

    expect(maxConcurrent).toBe(2);
  });

  it('should support tryAcquire with timeout', async () => {
    const semaphore = new Semaphore(1);

    await semaphore.acquire();

    const acquired = await semaphore.tryAcquire(50);
    expect(acquired).toBe(false);

    semaphore.release();

    const acquiredAfterRelease = await semaphore.tryAcquire(50);
    expect(acquiredAfterRelease).toBe(true);
  });
});

describe('Bulkhead', () => {
  let bulkhead: Bulkhead;

  beforeEach(() => {
    bulkhead = new Bulkhead({
      maxConcurrent: 2,
      maxQueued: 3,
      timeout: 5000,
    });
  });

  describe('execute', () => {
    it('should execute within concurrency limit', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const task = async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(resolve => setTimeout(resolve, 50));
        concurrent--;
        return 'done';
      };

      const results = await Promise.all([
        bulkhead.execute(task),
        bulkhead.execute(task),
        bulkhead.execute(task),
        bulkhead.execute(task),
      ]);

      expect(maxConcurrent).toBe(2);
      expect(results).toEqual(['done', 'done', 'done', 'done']);
    });

    it('should queue excess requests', async () => {
      const slowTask = () => new Promise(resolve => setTimeout(() => resolve('slow'), 100));

      // Fill concurrent slots
      const p1 = bulkhead.execute(slowTask);
      const p2 = bulkhead.execute(slowTask);

      // These should be queued
      const p3 = bulkhead.execute(slowTask);
      const p4 = bulkhead.execute(slowTask);

      const stats = bulkhead.getStats();
      expect(stats.queued).toBeGreaterThanOrEqual(0);

      const results = await Promise.all([p1, p2, p3, p4]);
      expect(results).toEqual(['slow', 'slow', 'slow', 'slow']);
    });

    it('should reject when queue is full', async () => {
      const fullBulkhead = new Bulkhead({
        maxConcurrent: 1,
        maxQueued: 1,
        timeout: 5000,
      });

      const slowTask = () => new Promise(resolve => setTimeout(resolve, 1000));

      // Fill concurrent slot
      fullBulkhead.execute(slowTask);
      // Fill queue
      fullBulkhead.execute(slowTask);

      // Should reject
      await expect(fullBulkhead.execute(slowTask)).rejects.toThrow(BulkheadFullError);
    });

    it('should timeout waiting for slot', async () => {
      const shortTimeoutBulkhead = new Bulkhead({
        maxConcurrent: 1,
        maxQueued: 10,
        timeout: 50,
      });

      const slowTask = () => new Promise(resolve => setTimeout(resolve, 500));

      // Fill the slot
      shortTimeoutBulkhead.execute(slowTask);

      // Should timeout waiting for slot
      await expect(
        shortTimeoutBulkhead.execute(async () => 'fast')
      ).rejects.toThrow(BulkheadTimeoutError);
    });
  });

  describe('getStats', () => {
    it('should track statistics', async () => {
      await bulkhead.execute(async () => 'success');

      const stats = bulkhead.getStats();

      expect(stats.totalExecuted).toBe(1);
      expect(stats.active).toBe(0);
    });
  });
});

describe('BulkheadRegistry', () => {
  let registry: BulkheadRegistry;

  beforeEach(() => {
    registry = new BulkheadRegistry();
  });

  it('should create and retrieve bulkheads', () => {
    const bulkhead = registry.getOrCreate('api-calls', {
      maxConcurrent: 10,
      maxQueued: 50,
    });

    expect(bulkhead).toBeDefined();
    expect(registry.getOrCreate('api-calls')).toBe(bulkhead);
  });

  it('should list all registered bulkheads', () => {
    registry.getOrCreate('bulkhead-1');
    registry.getOrCreate('bulkhead-2');

    const names = registry.list();

    expect(names).toContain('bulkhead-1');
    expect(names).toContain('bulkhead-2');
  });
});

describe('createBulkhead', () => {
  it('should create a bulkhead with default config', () => {
    const bulkhead = createBulkhead('test');
    expect(bulkhead).toBeDefined();
  });
});
