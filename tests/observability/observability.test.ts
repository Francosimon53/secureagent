import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getLogger,
  getAuditLogger,
  getTracer,
  getMetricsRegistry,
} from '../../src/observability/index.js';

describe('Logger', () => {
  let logger: ReturnType<typeof getLogger>;

  beforeEach(() => {
    logger = getLogger();
  });

  describe('logging levels', () => {
    it('should have all log levels', () => {
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should create child loggers', () => {
      const child = logger.child({ module: 'test' });
      expect(child).toBeDefined();
      expect(typeof child.info).toBe('function');
    });
  });
});

describe('AuditLogger', () => {
  let auditLogger: ReturnType<typeof getAuditLogger>;

  beforeEach(() => {
    auditLogger = getAuditLogger();
  });

  it('should log audit events', () => {
    expect(() => {
      auditLogger.log({
        id: 'event-1',
        timestamp: Date.now(),
        eventType: 'authentication',
        severity: 'info',
        actor: { type: 'user', id: 'user-1' },
        resource: { type: 'session', id: 'session-1' },
        action: 'login',
        outcome: 'success',
      });
    }).not.toThrow();
  });
});

describe('Tracer', () => {
  let tracer: ReturnType<typeof getTracer>;

  beforeEach(() => {
    tracer = getTracer();
  });

  describe('startSpan', () => {
    it('should create spans', () => {
      const span = tracer.startSpan('test-operation');

      expect(span).toBeDefined();
      expect(typeof span.end).toBe('function');
      expect(typeof span.setStatus).toBe('function');
    });

    it('should support span attributes', () => {
      const span = tracer.startSpan('test-operation', {
        attributes: {
          'http.method': 'GET',
          'http.url': 'https://example.com',
        },
      });

      expect(span).toBeDefined();
      span.end();
    });

    it('should set span status', () => {
      const span = tracer.startSpan('test-operation');

      span.setStatus('ok');
      span.end();

      // Should not throw
    });

    it('should record exceptions', () => {
      const span = tracer.startSpan('test-operation');

      const error = new Error('test error');
      span.recordException(error);
      span.setStatus('error', error.message);
      span.end();

      // Should not throw
    });
  });

  describe('context propagation', () => {
    it('should support nested spans', () => {
      const parentSpan = tracer.startSpan('parent');

      const childSpan = tracer.startSpan('child', {
        parent: parentSpan,
      });

      childSpan.end();
      parentSpan.end();

      // Should not throw
    });
  });
});

describe('Metrics Registry', () => {
  let registry: ReturnType<typeof getMetricsRegistry>;

  beforeEach(() => {
    registry = getMetricsRegistry();
  });

  describe('counter', () => {
    it('should create and increment counters', () => {
      const counter = registry.createCounter('test_requests_total', {
        description: 'Total test requests',
        labels: ['method', 'status'],
      });

      counter.inc({ method: 'GET', status: '200' });
      counter.inc({ method: 'POST', status: '201' });
      counter.inc({ method: 'GET', status: '200' }, 5);

      const value = counter.get({ method: 'GET', status: '200' });
      expect(value).toBe(6);
    });
  });

  describe('gauge', () => {
    it('should create and update gauges', () => {
      const gauge = registry.createGauge('test_queue_size', {
        description: 'Current queue size',
      });

      gauge.set({}, 10);
      expect(gauge.get({})).toBe(10);

      gauge.inc({});
      expect(gauge.get({})).toBe(11);

      gauge.dec({});
      expect(gauge.get({})).toBe(10);
    });
  });

  describe('histogram', () => {
    it('should create and observe histograms', () => {
      const histogram = registry.createHistogram('test_request_duration', {
        description: 'Request duration',
        buckets: [0.1, 0.5, 1, 2, 5],
      });

      histogram.observe({}, 0.3);
      histogram.observe({}, 0.7);
      histogram.observe({}, 1.5);

      const stats = histogram.getStats({});
      expect(stats.count).toBe(3);
      expect(stats.sum).toBeCloseTo(2.5);
    });
  });

  describe('summary', () => {
    it('should create and observe summaries', () => {
      const summary = registry.createSummary('test_response_size', {
        description: 'Response size',
        percentiles: [0.5, 0.9, 0.99],
      });

      for (let i = 1; i <= 100; i++) {
        summary.observe({}, i);
      }

      const stats = summary.getStats({});
      expect(stats.count).toBe(100);
      expect(stats.percentiles[0.5]).toBeCloseTo(50, 0);
    });
  });

  describe('export', () => {
    it('should export metrics in prometheus format', () => {
      registry.createCounter('export_test', { description: 'Test' }).inc({});

      const output = registry.export('prometheus');

      expect(output).toContain('export_test');
    });

    it('should export metrics in JSON format', () => {
      registry.createCounter('json_test', { description: 'Test' }).inc({});

      const output = registry.export('json');
      const parsed = JSON.parse(output);

      expect(parsed).toBeDefined();
    });
  });
});
