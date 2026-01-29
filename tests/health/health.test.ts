import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HealthChecker,
  getHealthChecker,
  initHealthChecker,
  memoryCheck,
  eventLoopCheck,
  customCheck,
  compositeCheck,
} from '../../src/health/index.js';

describe('HealthChecker', () => {
  let checker: HealthChecker;

  beforeEach(() => {
    checker = new HealthChecker();
  });

  afterEach(() => {
    checker.stop();
  });

  describe('register', () => {
    it('should register a health check', () => {
      checker.register({
        name: 'test-check',
        check: async () => ({ name: 'test-check', status: 'healthy', timestamp: Date.now(), duration: 0 }),
      });

      // Check is registered by running it
      const result = checker.runCheck('test-check');
      expect(result).toBeDefined();
    });
  });

  describe('runCheck', () => {
    it('should run a single check', async () => {
      checker.register({
        name: 'simple-check',
        check: async () => ({
          name: 'simple-check',
          status: 'healthy',
          message: 'All good',
          timestamp: Date.now(),
          duration: 0,
        }),
      });

      const result = await checker.runCheck('simple-check');

      expect(result.status).toBe('healthy');
      expect(result.message).toBe('All good');
    });

    it('should handle check failures', async () => {
      checker.register({
        name: 'failing-check',
        check: async () => {
          throw new Error('Check failed');
        },
      });

      const result = await checker.runCheck('failing-check');

      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('Check failed');
    });

    it('should handle check timeouts', async () => {
      checker.register({
        name: 'slow-check',
        check: async () => {
          await new Promise(resolve => setTimeout(resolve, 5000));
          return { name: 'slow-check', status: 'healthy', timestamp: Date.now(), duration: 0 };
        },
        timeout: 100,
      });

      const result = await checker.runCheck('slow-check');

      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('timed out');
    });
  });

  describe('runAllChecks', () => {
    it('should run all registered checks', async () => {
      checker.register({
        name: 'check-1',
        check: async () => ({ name: 'check-1', status: 'healthy', timestamp: Date.now(), duration: 0 }),
      });

      checker.register({
        name: 'check-2',
        check: async () => ({ name: 'check-2', status: 'healthy', timestamp: Date.now(), duration: 0 }),
      });

      const report = await checker.runAllChecks();

      expect(report.status).toBe('healthy');
      expect(report.checks.find(c => c.name === 'check-1')?.status).toBe('healthy');
      expect(report.checks.find(c => c.name === 'check-2')?.status).toBe('healthy');
    });

    it('should report degraded when any check is degraded', async () => {
      checker.register({
        name: 'healthy-check',
        check: async () => ({ name: 'healthy-check', status: 'healthy', timestamp: Date.now(), duration: 0 }),
      });

      checker.register({
        name: 'degraded-check',
        check: async () => ({ name: 'degraded-check', status: 'degraded', timestamp: Date.now(), duration: 0 }),
      });

      const report = await checker.runAllChecks();

      expect(report.status).toBe('degraded');
    });

    it('should report unhealthy when critical check is unhealthy', async () => {
      checker.register({
        name: 'healthy-check',
        check: async () => ({ name: 'healthy-check', status: 'healthy', timestamp: Date.now(), duration: 0 }),
      });

      checker.register({
        name: 'unhealthy-check',
        check: async () => ({ name: 'unhealthy-check', status: 'unhealthy', timestamp: Date.now(), duration: 0 }),
        critical: true,
      });

      const report = await checker.runAllChecks();

      expect(report.status).toBe('unhealthy');
    });
  });

  describe('liveness and readiness', () => {
    it('should report liveness', async () => {
      const result = await checker.liveness();

      expect(result.alive).toBe(true);
    });

    it('should report readiness based on checks', async () => {
      checker.register({
        name: 'ready-check',
        check: async () => ({ name: 'ready-check', status: 'healthy', timestamp: Date.now(), duration: 0 }),
        critical: true,
      });

      // Run the check first to populate results
      await checker.runCheck('ready-check');

      const result = await checker.readiness();

      expect(result.ready).toBe(true);
    });

    it('should not be ready when critical check fails', async () => {
      checker.register({
        name: 'critical-check',
        check: async () => ({ name: 'critical-check', status: 'unhealthy', timestamp: Date.now(), duration: 0 }),
        critical: true,
      });

      // Run the check first to populate results
      await checker.runCheck('critical-check');

      const result = await checker.readiness();

      expect(result.ready).toBe(false);
    });
  });

  describe('uptime', () => {
    it('should track uptime', async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      const uptime = checker.getUptime();
      expect(uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('events', () => {
    it('should emit health events', async () => {
      const events: string[] = [];

      checker.on('health', (event) => {
        events.push(event.type);
      });

      checker.register({
        name: 'event-check',
        check: async () => ({ name: 'event-check', status: 'healthy', timestamp: Date.now(), duration: 0 }),
      });

      await checker.runCheck('event-check');

      expect(events.length).toBeGreaterThan(0);
    });
  });
});

describe('Built-in Checks', () => {
  describe('memoryCheck', () => {
    it('should check memory usage', async () => {
      const check = memoryCheck({ thresholdPercent: 95 });
      const result = await check();

      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
      expect(result.details).toHaveProperty('heapUsed');
      expect(result.details).toHaveProperty('heapTotal');
    });
  });

  describe('eventLoopCheck', () => {
    it('should check event loop lag', async () => {
      const check = eventLoopCheck({ thresholdMs: 1000 });
      const result = await check();

      expect(result.status).toBe('healthy');
      expect(result.details).toHaveProperty('lag');
    });
  });

  describe('customCheck', () => {
    it('should create a custom check', async () => {
      const check = customCheck('custom', async () => ({
        name: 'custom',
        status: 'healthy',
        message: 'Custom check passed',
        timestamp: Date.now(),
        duration: 0,
      }));

      const result = await check();

      expect(result.status).toBe('healthy');
      expect(result.message).toBe('Custom check passed');
    });
  });

  describe('compositeCheck', () => {
    it('should combine multiple checks', async () => {
      const check = compositeCheck('composite', {
        checks: [
          async () => ({ name: 'sub1', status: 'healthy' as const, timestamp: Date.now(), duration: 0 }),
          async () => ({ name: 'sub2', status: 'healthy' as const, timestamp: Date.now(), duration: 0 }),
        ],
      });

      const result = await check();

      expect(result.status).toBe('healthy');
    });

    it('should report worst status', async () => {
      const check = compositeCheck('composite', {
        checks: [
          async () => ({ name: 'sub1', status: 'healthy' as const, timestamp: Date.now(), duration: 0 }),
          async () => ({ name: 'sub2', status: 'degraded' as const, timestamp: Date.now(), duration: 0 }),
          async () => ({ name: 'sub3', status: 'healthy' as const, timestamp: Date.now(), duration: 0 }),
        ],
      });

      const result = await check();

      expect(result.status).toBe('degraded');
    });
  });
});

describe('Global Health Checker', () => {
  afterEach(() => {
    getHealthChecker().stop();
  });

  it('should return the same instance', () => {
    const checker1 = getHealthChecker();
    const checker2 = getHealthChecker();

    expect(checker1).toBe(checker2);
  });

  it('should initialize with options', () => {
    const checker = initHealthChecker({ version: '1.0.0' });
    expect(checker).toBeDefined();
  });
});
