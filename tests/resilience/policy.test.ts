import { describe, it, expect, vi } from 'vitest';
import {
  ResiliencePolicy,
  PolicyBuilder,
  PolicyTimeoutError,
  policy,
  apiPolicy,
  databasePolicy,
  criticalPolicy,
  isCircuitOpen,
  isRetryExhausted,
  isBulkheadFull,
  isPolicyTimeout,
  isResilienceError,
} from '../../src/resilience/index.js';

describe('ResiliencePolicy', () => {
  describe('execute', () => {
    it('should execute operation successfully', async () => {
      const p = new ResiliencePolicy({
        name: 'test-policy',
      });

      const result = await p.execute(async () => 'success');

      expect(result).toBe('success');
    });

    it('should apply circuit breaker', async () => {
      const p = new ResiliencePolicy({
        name: 'circuit-policy',
        circuitBreaker: {
          failureThreshold: 2,
          resetTimeout: 1000,
        },
      });

      const failingOp = async () => {
        throw new Error('failure');
      };

      // Fail twice to open circuit
      await p.execute(failingOp).catch(() => {});
      await p.execute(failingOp).catch(() => {});

      // Third call should fail fast
      await expect(p.execute(failingOp)).rejects.toThrow();
    });

    it('should apply retry', async () => {
      let attempts = 0;

      const p = new ResiliencePolicy({
        name: 'retry-policy',
        retry: {
          maxAttempts: 3,
          initialDelay: 10,
        },
      });

      const result = await p.execute(async () => {
        attempts++;
        if (attempts < 3) throw new Error('temporary');
        return 'success';
      });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should apply bulkhead', async () => {
      const p = new ResiliencePolicy({
        name: 'bulkhead-policy',
        bulkhead: {
          maxConcurrent: 2,
          maxQueued: 1,
        },
      });

      let concurrent = 0;
      let maxConcurrent = 0;

      const slowOp = async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(resolve => setTimeout(resolve, 50));
        concurrent--;
        return 'done';
      };

      const results = await Promise.all([
        p.execute(slowOp),
        p.execute(slowOp),
        p.execute(slowOp),
      ]);

      expect(maxConcurrent).toBeLessThanOrEqual(2);
      expect(results).toEqual(['done', 'done', 'done']);
    });

    it('should apply timeout', async () => {
      const p = new ResiliencePolicy({
        name: 'timeout-policy',
        timeout: 50,
      });

      await expect(
        p.execute(async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'done';
        })
      ).rejects.toThrow(PolicyTimeoutError);
    });

    it('should apply fallback', async () => {
      const p = new ResiliencePolicy({
        name: 'fallback-policy',
        fallback: () => 'fallback-value',
      });

      const result = await p.execute(async () => {
        throw new Error('primary failed');
      });

      expect(result).toBe('fallback-value');
    });
  });

  describe('getStats', () => {
    it('should track execution statistics', async () => {
      const p = new ResiliencePolicy({
        name: 'stats-policy',
      });

      await p.execute(async () => 'success');
      await p.execute(async () => { throw new Error('fail'); }).catch(() => {});

      const stats = p.getStats();

      expect(stats.totalExecutions).toBe(2);
      expect(stats.successCount).toBe(1);
      expect(stats.failureCount).toBe(1);
    });
  });
});

describe('PolicyBuilder', () => {
  it('should build policy fluently', async () => {
    const p = new PolicyBuilder('fluent-policy')
      .retry({ maxAttempts: 2, initialDelay: 10 })
      .timeout(1000)
      .build();

    const result = await p.execute(async () => 'built');

    expect(result).toBe('built');
  });

  it('should chain multiple configurations', async () => {
    let attempts = 0;

    const p = new PolicyBuilder('chained')
      .circuitBreaker({ failureThreshold: 5, resetTimeout: 5000 })
      .retry({ maxAttempts: 3, initialDelay: 10 })
      .bulkhead({ maxConcurrent: 5, maxQueued: 10 })
      .timeout(5000)
      .fallback(() => 'fallback')
      .build();

    const result = await p.execute(async () => {
      attempts++;
      if (attempts < 2) throw new Error('retry');
      return 'success';
    });

    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });
});

describe('Pre-configured Policies', () => {
  describe('policy', () => {
    it('should create a basic policy', () => {
      const p = policy('basic');
      expect(p).toBeDefined();
    });
  });

  describe('apiPolicy', () => {
    it('should create an API-optimized policy', async () => {
      const p = apiPolicy('api');

      const result = await p.execute(async () => 'api-result');
      expect(result).toBe('api-result');
    });
  });

  describe('databasePolicy', () => {
    it('should create a database-optimized policy', async () => {
      const p = databasePolicy('db');

      const result = await p.execute(async () => 'db-result');
      expect(result).toBe('db-result');
    });
  });

  describe('criticalPolicy', () => {
    it('should create a policy for critical operations', async () => {
      const p = criticalPolicy('critical');

      const result = await p.execute(async () => 'critical-result');
      expect(result).toBe('critical-result');
    });
  });
});

describe('Error Type Guards', () => {
  it('isCircuitOpen should identify circuit open errors', async () => {
    const p = new ResiliencePolicy({
      name: 'guard-circuit',
      circuitBreaker: { failureThreshold: 1, resetTimeout: 1000 },
    });

    // Open the circuit
    await p.execute(async () => { throw new Error('fail'); }).catch(() => {});

    try {
      await p.execute(async () => 'success');
    } catch (error) {
      expect(isCircuitOpen(error)).toBe(true);
    }
  });

  it('isRetryExhausted should identify retry exhaustion', async () => {
    const p = new ResiliencePolicy({
      name: 'guard-retry',
      retry: { maxAttempts: 2, initialDelay: 10 },
    });

    try {
      await p.execute(async () => { throw new Error('always fail'); });
    } catch (error) {
      expect(isRetryExhausted(error)).toBe(true);
    }
  });

  it('isBulkheadFull should identify bulkhead rejection', async () => {
    const p = new ResiliencePolicy({
      name: 'guard-bulkhead',
      bulkhead: { maxConcurrent: 1, maxQueued: 0 },
    });

    const slowOp = () => new Promise(resolve => setTimeout(resolve, 1000));

    // Fill the bulkhead
    p.execute(slowOp);

    try {
      await p.execute(async () => 'should fail');
    } catch (error) {
      expect(isBulkheadFull(error)).toBe(true);
    }
  });

  it('isPolicyTimeout should identify timeout errors', async () => {
    const p = new ResiliencePolicy({
      name: 'guard-timeout',
      timeout: 10,
    });

    try {
      await p.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
    } catch (error) {
      expect(isPolicyTimeout(error)).toBe(true);
    }
  });

  it('isResilienceError should identify any resilience error', async () => {
    const p = new ResiliencePolicy({
      name: 'guard-any',
      timeout: 10,
    });

    try {
      await p.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
    } catch (error) {
      expect(isResilienceError(error)).toBe(true);
    }
  });
});
