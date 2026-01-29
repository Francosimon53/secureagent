import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitOpenError,
  getCircuitBreakerRegistry,
  createCircuitBreaker,
} from '../../src/resilience/index.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 1000,
      halfOpenMaxAttempts: 1,
    });
  });

  describe('execute', () => {
    it('should execute successful operations', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should pass through errors in closed state', async () => {
      await expect(
        breaker.execute(async () => {
          throw new Error('operation failed');
        })
      ).rejects.toThrow('operation failed');
    });

    it('should open after failure threshold', async () => {
      const failingOp = async () => {
        throw new Error('failure');
      };

      // Fail 3 times to open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker.execute(failingOp).catch(() => {});
      }

      expect(breaker.getState()).toBe('open');

      // Next call should fail fast
      await expect(breaker.execute(async () => 'success')).rejects.toThrow(
        CircuitOpenError
      );
    });

    it('should transition to half-open after reset timeout', async () => {
      const shortBreaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 100,
        halfOpenMaxAttempts: 1,
      });

      // Open the circuit
      await shortBreaker.execute(async () => {
        throw new Error('failure');
      }).catch(() => {});

      expect(shortBreaker.getState()).toBe('open');

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should now be half-open
      expect(shortBreaker.getState()).toBe('half-open');
    });

    it('should close after successful half-open attempt', async () => {
      const shortBreaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 100,
        halfOpenMaxAttempts: 1,
      });

      // Open the circuit
      await shortBreaker.execute(async () => {
        throw new Error('failure');
      }).catch(() => {});

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Successful call should close the circuit
      await shortBreaker.execute(async () => 'success');

      expect(shortBreaker.getState()).toBe('closed');
    });

    it('should re-open on failure during half-open', async () => {
      const shortBreaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 100,
        halfOpenMaxAttempts: 1,
      });

      // Open the circuit
      await shortBreaker.execute(async () => {
        throw new Error('failure');
      }).catch(() => {});

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Failure should re-open the circuit
      await shortBreaker.execute(async () => {
        throw new Error('still failing');
      }).catch(() => {});

      expect(shortBreaker.getState()).toBe('open');
    });
  });

  describe('getStats', () => {
    it('should track statistics', async () => {
      await breaker.execute(async () => 'success');
      await breaker.execute(async () => {
        throw new Error('failure');
      }).catch(() => {});

      const stats = breaker.getStats();

      expect(stats.totalRequests).toBe(2);
      expect(stats.successCount).toBe(1);
      expect(stats.failureCount).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset the circuit to closed state', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker.execute(async () => {
          throw new Error('failure');
        }).catch(() => {});
      }

      expect(breaker.getState()).toBe('open');

      breaker.reset();

      expect(breaker.getState()).toBe('closed');
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  it('should create and retrieve circuit breakers', () => {
    const breaker = registry.getOrCreate('test-service', {
      failureThreshold: 5,
      resetTimeout: 30000,
    });

    expect(breaker).toBeDefined();
    expect(registry.getOrCreate('test-service')).toBe(breaker);
  });

  it('should list all registered breakers', () => {
    registry.getOrCreate('service-1');
    registry.getOrCreate('service-2');

    const names = registry.list();

    expect(names).toContain('service-1');
    expect(names).toContain('service-2');
  });

  it('should get stats for all breakers', () => {
    registry.getOrCreate('service-1');
    registry.getOrCreate('service-2');

    const allStats = registry.getStats();

    expect(allStats['service-1']).toBeDefined();
    expect(allStats['service-2']).toBeDefined();
  });
});

describe('createCircuitBreaker', () => {
  it('should create a circuit breaker with default config', () => {
    const breaker = createCircuitBreaker('test');
    expect(breaker).toBeDefined();
    expect(breaker.getState()).toBe('closed');
  });
});
