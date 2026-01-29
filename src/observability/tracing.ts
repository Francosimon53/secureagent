import { randomBytes } from 'crypto';
import { getLogger } from './logger.js';

const logger = getLogger().child({ module: 'Tracing' });

// ============================================================================
// Tracing Types (OpenTelemetry-compatible)
// ============================================================================

/**
 * Trace context for propagation
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
}

/**
 * Span status
 */
export type SpanStatus = 'unset' | 'ok' | 'error';

/**
 * Span kind
 */
export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer';

/**
 * Span attributes
 */
export type SpanAttributes = Record<string, string | number | boolean | string[] | number[] | boolean[]>;

/**
 * Span event
 */
export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: SpanAttributes;
}

/**
 * Span link
 */
export interface SpanLink {
  context: TraceContext;
  attributes?: SpanAttributes;
}

/**
 * Span data
 */
export interface SpanData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTime: number;
  endTime?: number;
  status: SpanStatus;
  statusMessage?: string;
  attributes: SpanAttributes;
  events: SpanEvent[];
  links: SpanLink[];
}

/**
 * Span interface
 */
export interface Span {
  /** Get the span context */
  context(): TraceContext;
  /** Set an attribute */
  setAttribute(key: string, value: string | number | boolean): Span;
  /** Set multiple attributes */
  setAttributes(attributes: SpanAttributes): Span;
  /** Add an event */
  addEvent(name: string, attributes?: SpanAttributes): Span;
  /** Set status */
  setStatus(status: SpanStatus, message?: string): Span;
  /** Record an exception */
  recordException(error: Error): Span;
  /** End the span */
  end(): void;
  /** Check if span is recording */
  isRecording(): boolean;
  /** Get span data */
  getData(): SpanData;
}

/**
 * Tracer interface
 */
export interface Tracer {
  /** Start a new span */
  startSpan(name: string, options?: StartSpanOptions): Span;
  /** Start a span as active (sets as current context) */
  startActiveSpan<T>(name: string, fn: (span: Span) => T): T;
  /** Start a span as active with options */
  startActiveSpan<T>(name: string, options: StartSpanOptions, fn: (span: Span) => T): T;
  /** Get the current active span */
  getActiveSpan(): Span | undefined;
}

/**
 * Start span options
 */
export interface StartSpanOptions {
  kind?: SpanKind;
  attributes?: SpanAttributes;
  links?: SpanLink[];
  parent?: TraceContext;
  startTime?: number;
}

/**
 * Span exporter interface
 */
export interface SpanExporter {
  /** Export spans */
  export(spans: SpanData[]): Promise<void>;
  /** Shutdown the exporter */
  shutdown(): Promise<void>;
}

/**
 * Sampler interface
 */
export interface Sampler {
  /** Decide whether to sample a trace */
  shouldSample(context: TraceContext, name: string): boolean;
}

// ============================================================================
// Tracing Configuration
// ============================================================================

/**
 * Tracing configuration
 */
export interface TracingConfig {
  /** Enable tracing */
  enabled?: boolean;
  /** Service name */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Environment (production, staging, development) */
  environment?: string;
  /** Sampling rate (0.0 to 1.0) */
  sampleRate?: number;
  /** OTLP endpoint for exporting traces */
  endpoint?: string;
  /** Export batch size */
  batchSize?: number;
  /** Export interval in milliseconds */
  exportIntervalMs?: number;
  /** Maximum queue size */
  maxQueueSize?: number;
  /** Additional resource attributes */
  resourceAttributes?: SpanAttributes;
}

// ============================================================================
// Span Implementation
// ============================================================================

class SpanImpl implements Span {
  private readonly data: SpanData;
  private ended = false;

  constructor(
    name: string,
    traceId: string,
    spanId: string,
    parentSpanId: string | undefined,
    kind: SpanKind,
    attributes: SpanAttributes,
    links: SpanLink[],
    startTime: number
  ) {
    this.data = {
      traceId,
      spanId,
      parentSpanId,
      name,
      kind,
      startTime,
      status: 'unset',
      attributes: { ...attributes },
      events: [],
      links: [...links],
    };
  }

  context(): TraceContext {
    return {
      traceId: this.data.traceId,
      spanId: this.data.spanId,
      traceFlags: 1, // Sampled
    };
  }

  setAttribute(key: string, value: string | number | boolean): Span {
    if (this.ended) return this;
    this.data.attributes[key] = value;
    return this;
  }

  setAttributes(attributes: SpanAttributes): Span {
    if (this.ended) return this;
    Object.assign(this.data.attributes, attributes);
    return this;
  }

  addEvent(name: string, attributes?: SpanAttributes): Span {
    if (this.ended) return this;
    this.data.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
    return this;
  }

  setStatus(status: SpanStatus, message?: string): Span {
    if (this.ended) return this;
    this.data.status = status;
    this.data.statusMessage = message;
    return this;
  }

  recordException(error: Error): Span {
    if (this.ended) return this;

    this.addEvent('exception', {
      'exception.type': error.name,
      'exception.message': error.message,
      'exception.stacktrace': error.stack ?? '',
    });

    this.setStatus('error', error.message);
    return this;
  }

  end(): void {
    if (this.ended) return;
    this.data.endTime = Date.now();
    this.ended = true;
  }

  isRecording(): boolean {
    return !this.ended;
  }

  getData(): SpanData {
    return { ...this.data };
  }
}

// ============================================================================
// No-op Span (for disabled tracing)
// ============================================================================

class NoopSpan implements Span {
  private readonly ctx: TraceContext;

  constructor() {
    this.ctx = {
      traceId: '00000000000000000000000000000000',
      spanId: '0000000000000000',
      traceFlags: 0,
    };
  }

  context(): TraceContext {
    return this.ctx;
  }

  setAttribute(): Span {
    return this;
  }

  setAttributes(): Span {
    return this;
  }

  addEvent(): Span {
    return this;
  }

  setStatus(): Span {
    return this;
  }

  recordException(): Span {
    return this;
  }

  end(): void {}

  isRecording(): boolean {
    return false;
  }

  getData(): SpanData {
    return {
      traceId: this.ctx.traceId,
      spanId: this.ctx.spanId,
      name: '',
      kind: 'internal',
      startTime: 0,
      status: 'unset',
      attributes: {},
      events: [],
      links: [],
    };
  }
}

// ============================================================================
// Tracer Implementation
// ============================================================================

class TracerImpl implements Tracer {
  private readonly config: Required<TracingConfig>;
  private readonly sampler: Sampler;
  private readonly exporter: SpanExporter;
  private readonly spanStack: Span[] = [];
  private readonly pendingSpans: SpanData[] = [];
  private exportTimer: NodeJS.Timeout | null = null;

  constructor(config: Required<TracingConfig>, sampler: Sampler, exporter: SpanExporter) {
    this.config = config;
    this.sampler = sampler;
    this.exporter = exporter;

    // Start export timer
    if (config.exportIntervalMs > 0) {
      this.exportTimer = setInterval(() => this.flush(), config.exportIntervalMs);
    }
  }

  startSpan(name: string, options: StartSpanOptions = {}): Span {
    if (!this.config.enabled) {
      return new NoopSpan();
    }

    const parentContext = options.parent ?? this.getActiveSpan()?.context();
    const traceId = parentContext?.traceId ?? this.generateTraceId();
    const spanId = this.generateSpanId();
    const parentSpanId = parentContext?.spanId;

    // Check sampling
    const shouldSample = this.sampler.shouldSample(
      { traceId, spanId, traceFlags: 1 },
      name
    );

    if (!shouldSample) {
      return new NoopSpan();
    }

    const span = new SpanImpl(
      name,
      traceId,
      spanId,
      parentSpanId,
      options.kind ?? 'internal',
      {
        ...this.getResourceAttributes(),
        ...options.attributes,
      },
      options.links ?? [],
      options.startTime ?? Date.now()
    );

    return span;
  }

  startActiveSpan<T>(name: string, optionsOrFn: StartSpanOptions | ((span: Span) => T), fn?: (span: Span) => T): T {
    const options = typeof optionsOrFn === 'function' ? {} : optionsOrFn;
    const callback = typeof optionsOrFn === 'function' ? optionsOrFn : fn!;

    const span = this.startSpan(name, options);
    this.spanStack.push(span);

    try {
      const result = callback(span);

      // Handle promises
      if (result instanceof Promise) {
        return result
          .then((value) => {
            span.setStatus('ok');
            return value;
          })
          .catch((error) => {
            span.recordException(error instanceof Error ? error : new Error(String(error)));
            throw error;
          })
          .finally(() => {
            span.end();
            this.onSpanEnd(span);
            this.spanStack.pop();
          }) as T;
      }

      span.setStatus('ok');
      span.end();
      this.onSpanEnd(span);
      this.spanStack.pop();
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.end();
      this.onSpanEnd(span);
      this.spanStack.pop();
      throw error;
    }
  }

  getActiveSpan(): Span | undefined {
    return this.spanStack[this.spanStack.length - 1];
  }

  private onSpanEnd(span: Span): void {
    if (!span.isRecording()) {
      const data = span.getData();
      if (data.traceId !== '00000000000000000000000000000000') {
        this.pendingSpans.push(data);

        if (this.pendingSpans.length >= this.config.batchSize) {
          this.flush();
        }
      }
    }
  }

  async flush(): Promise<void> {
    if (this.pendingSpans.length === 0) return;

    const spans = this.pendingSpans.splice(0, this.pendingSpans.length);

    try {
      await this.exporter.export(spans);
    } catch (error) {
      logger.error({ error, count: spans.length }, 'Failed to export spans');
      // Put spans back if under max queue size
      if (this.pendingSpans.length + spans.length <= this.config.maxQueueSize) {
        this.pendingSpans.unshift(...spans);
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
      this.exportTimer = null;
    }

    await this.flush();
    await this.exporter.shutdown();
  }

  private generateTraceId(): string {
    return randomBytes(16).toString('hex');
  }

  private generateSpanId(): string {
    return randomBytes(8).toString('hex');
  }

  private getResourceAttributes(): SpanAttributes {
    return {
      'service.name': this.config.serviceName,
      'service.version': this.config.serviceVersion,
      'deployment.environment': this.config.environment,
      ...this.config.resourceAttributes,
    };
  }
}

// ============================================================================
// Samplers
// ============================================================================

/**
 * Always sample
 */
export class AlwaysOnSampler implements Sampler {
  shouldSample(): boolean {
    return true;
  }
}

/**
 * Never sample
 */
export class AlwaysOffSampler implements Sampler {
  shouldSample(): boolean {
    return false;
  }
}

/**
 * Probabilistic sampler
 */
export class ProbabilitySampler implements Sampler {
  private readonly probability: number;

  constructor(probability: number) {
    this.probability = Math.max(0, Math.min(1, probability));
  }

  shouldSample(): boolean {
    return Math.random() < this.probability;
  }
}

/**
 * Rate limiting sampler (max traces per second)
 */
export class RateLimitingSampler implements Sampler {
  private readonly maxTracesPerSecond: number;
  private count = 0;
  private lastReset = Date.now();

  constructor(maxTracesPerSecond: number) {
    this.maxTracesPerSecond = maxTracesPerSecond;
  }

  shouldSample(): boolean {
    const now = Date.now();
    if (now - this.lastReset >= 1000) {
      this.count = 0;
      this.lastReset = now;
    }

    if (this.count < this.maxTracesPerSecond) {
      this.count++;
      return true;
    }

    return false;
  }
}

// ============================================================================
// Exporters
// ============================================================================

/**
 * Console exporter (for development)
 */
export class ConsoleSpanExporter implements SpanExporter {
  async export(spans: SpanData[]): Promise<void> {
    for (const span of spans) {
      const duration = span.endTime ? span.endTime - span.startTime : 0;
      console.log(JSON.stringify({
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        name: span.name,
        kind: span.kind,
        status: span.status,
        duration: `${duration}ms`,
        attributes: span.attributes,
        events: span.events.length,
      }));
    }
  }

  async shutdown(): Promise<void> {}
}

/**
 * In-memory exporter (for testing)
 */
export class InMemorySpanExporter implements SpanExporter {
  private readonly spans: SpanData[] = [];

  async export(spans: SpanData[]): Promise<void> {
    this.spans.push(...spans);
  }

  async shutdown(): Promise<void> {}

  getSpans(): SpanData[] {
    return [...this.spans];
  }

  clear(): void {
    this.spans.length = 0;
  }
}

/**
 * OTLP HTTP exporter
 */
export class OTLPHttpExporter implements SpanExporter {
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;

  constructor(endpoint: string, headers?: Record<string, string>) {
    this.endpoint = endpoint;
    this.headers = headers ?? {};
  }

  async export(spans: SpanData[]): Promise<void> {
    if (spans.length === 0) return;

    const payload = this.toOTLPFormat(spans);

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`OTLP export failed: ${response.status} ${response.statusText}`);
    }
  }

  async shutdown(): Promise<void> {}

  private toOTLPFormat(spans: SpanData[]): unknown {
    // Group spans by resource
    const resourceSpans = new Map<string, SpanData[]>();

    for (const span of spans) {
      const key = span.attributes['service.name'] as string ?? 'unknown';
      const group = resourceSpans.get(key) ?? [];
      group.push(span);
      resourceSpans.set(key, group);
    }

    return {
      resourceSpans: Array.from(resourceSpans.entries()).map(([serviceName, spans]) => ({
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: serviceName } },
          ],
        },
        scopeSpans: [{
          scope: { name: 'secureagent' },
          spans: spans.map(span => this.spanToOTLP(span)),
        }],
      })),
    };
  }

  private spanToOTLP(span: SpanData): unknown {
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      kind: this.kindToOTLP(span.kind),
      startTimeUnixNano: span.startTime * 1000000,
      endTimeUnixNano: (span.endTime ?? span.startTime) * 1000000,
      attributes: Object.entries(span.attributes).map(([key, value]) => ({
        key,
        value: this.valueToOTLP(value),
      })),
      events: span.events.map(event => ({
        timeUnixNano: event.timestamp * 1000000,
        name: event.name,
        attributes: event.attributes
          ? Object.entries(event.attributes).map(([key, value]) => ({
              key,
              value: this.valueToOTLP(value),
            }))
          : [],
      })),
      status: {
        code: span.status === 'ok' ? 1 : span.status === 'error' ? 2 : 0,
        message: span.statusMessage,
      },
    };
  }

  private kindToOTLP(kind: SpanKind): number {
    switch (kind) {
      case 'internal': return 1;
      case 'server': return 2;
      case 'client': return 3;
      case 'producer': return 4;
      case 'consumer': return 5;
      default: return 0;
    }
  }

  private valueToOTLP(value: unknown): unknown {
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') {
      return Number.isInteger(value) ? { intValue: value } : { doubleValue: value };
    }
    if (typeof value === 'boolean') return { boolValue: value };
    if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map(v => this.valueToOTLP(v)),
        },
      };
    }
    return { stringValue: String(value) };
  }
}

/**
 * Batching exporter wrapper
 */
export class BatchingSpanExporter implements SpanExporter {
  private readonly exporter: SpanExporter;
  private readonly buffer: SpanData[] = [];
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(exporter: SpanExporter, batchSize: number = 100, flushIntervalMs: number = 5000) {
    this.exporter = exporter;
    this.batchSize = batchSize;
    this.flushIntervalMs = flushIntervalMs;

    this.flushTimer = setInterval(() => this.flush(), flushIntervalMs);
  }

  async export(spans: SpanData[]): Promise<void> {
    this.buffer.push(...spans);

    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.buffer.length);
    await this.exporter.export(batch);
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
    await this.exporter.shutdown();
  }
}

// ============================================================================
// Tracing Manager
// ============================================================================

let globalTracer: TracerImpl | null = null;

/**
 * Initialize tracing
 */
export function initTracing(config: TracingConfig): Tracer {
  const fullConfig: Required<TracingConfig> = {
    enabled: config.enabled ?? true,
    serviceName: config.serviceName,
    serviceVersion: config.serviceVersion ?? '1.0.0',
    environment: config.environment ?? 'development',
    sampleRate: config.sampleRate ?? 1.0,
    endpoint: config.endpoint ?? '',
    batchSize: config.batchSize ?? 100,
    exportIntervalMs: config.exportIntervalMs ?? 5000,
    maxQueueSize: config.maxQueueSize ?? 2048,
    resourceAttributes: config.resourceAttributes ?? {},
  };

  // Create sampler
  const sampler = fullConfig.sampleRate >= 1.0
    ? new AlwaysOnSampler()
    : fullConfig.sampleRate <= 0
      ? new AlwaysOffSampler()
      : new ProbabilitySampler(fullConfig.sampleRate);

  // Create exporter
  let exporter: SpanExporter;
  if (fullConfig.endpoint) {
    exporter = new BatchingSpanExporter(
      new OTLPHttpExporter(fullConfig.endpoint),
      fullConfig.batchSize,
      fullConfig.exportIntervalMs
    );
  } else if (fullConfig.environment === 'development') {
    exporter = new ConsoleSpanExporter();
  } else {
    exporter = new InMemorySpanExporter();
  }

  globalTracer = new TracerImpl(fullConfig, sampler, exporter);

  logger.info(
    { serviceName: fullConfig.serviceName, sampleRate: fullConfig.sampleRate },
    'Tracing initialized'
  );

  return globalTracer;
}

/**
 * Get the global tracer
 */
export function getTracer(): Tracer {
  if (!globalTracer) {
    // Return a no-op tracer if not initialized
    return {
      startSpan: () => new NoopSpan(),
      startActiveSpan: <T>(_name: string, optionsOrFn: StartSpanOptions | ((span: Span) => T), fn?: (span: Span) => T): T => {
        const callback = typeof optionsOrFn === 'function' ? optionsOrFn : fn!;
        return callback(new NoopSpan());
      },
      getActiveSpan: () => undefined,
    };
  }
  return globalTracer;
}

/**
 * Shutdown tracing
 */
export async function shutdownTracing(): Promise<void> {
  if (globalTracer) {
    await globalTracer.shutdown();
    globalTracer = null;
  }
}

// ============================================================================
// Trace Context Propagation (W3C Trace Context)
// ============================================================================

/**
 * Parse traceparent header
 */
export function parseTraceparent(header: string): TraceContext | null {
  // Format: version-traceId-spanId-traceFlags
  const match = header.match(/^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/);
  if (!match) return null;

  return {
    traceId: match[1],
    spanId: match[2],
    traceFlags: parseInt(match[3], 16),
  };
}

/**
 * Create traceparent header
 */
export function createTraceparent(context: TraceContext): string {
  const flags = context.traceFlags.toString(16).padStart(2, '0');
  return `00-${context.traceId}-${context.spanId}-${flags}`;
}

/**
 * Parse tracestate header
 */
export function parseTracestate(header: string): Record<string, string> {
  const state: Record<string, string> = {};
  for (const pair of header.split(',')) {
    const [key, value] = pair.trim().split('=');
    if (key && value) {
      state[key] = value;
    }
  }
  return state;
}

/**
 * Create tracestate header
 */
export function createTracestate(state: Record<string, string>): string {
  return Object.entries(state)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}

// ============================================================================
// Tracing Decorators / Helpers
// ============================================================================

/**
 * Trace a function
 */
export function trace<T extends (...args: unknown[]) => unknown>(
  name: string,
  fn: T,
  options?: StartSpanOptions
): T {
  return ((...args: unknown[]) => {
    const tracer = getTracer();
    return tracer.startActiveSpan(name, options ?? {}, (span) => {
      try {
        const result = fn(...args);
        if (result instanceof Promise) {
          return result.finally(() => span.end());
        }
        span.end();
        return result;
      } catch (error) {
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.end();
        throw error;
      }
    });
  }) as T;
}

/**
 * Create a child span
 */
export function withSpan<T>(name: string, fn: (span: Span) => T, options?: StartSpanOptions): T {
  return getTracer().startActiveSpan(name, options ?? {}, fn);
}

/**
 * Add attributes to current span
 */
export function setSpanAttributes(attributes: SpanAttributes): void {
  getTracer().getActiveSpan()?.setAttributes(attributes);
}

/**
 * Add event to current span
 */
export function addSpanEvent(name: string, attributes?: SpanAttributes): void {
  getTracer().getActiveSpan()?.addEvent(name, attributes);
}

/**
 * Record exception in current span
 */
export function recordSpanException(error: Error): void {
  getTracer().getActiveSpan()?.recordException(error);
}
