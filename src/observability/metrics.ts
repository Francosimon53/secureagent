// ============================================================================
// Prometheus-Compatible Metrics System
// ============================================================================

/**
 * Metric types following Prometheus conventions
 */
export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

/**
 * Label set for metrics
 */
export type Labels = Record<string, string>;

/**
 * Base metric interface
 */
export interface Metric {
  name: string;
  help: string;
  type: MetricType;
  labelNames: string[];
}

/**
 * Counter metric - monotonically increasing values
 */
export interface Counter extends Metric {
  type: 'counter';
  inc(labels?: Labels, value?: number): void;
  get(labels?: Labels): number;
  reset(labels?: Labels): void;
}

/**
 * Gauge metric - values that can go up and down
 */
export interface Gauge extends Metric {
  type: 'gauge';
  set(labels: Labels | undefined, value: number): void;
  inc(labels?: Labels, value?: number): void;
  dec(labels?: Labels, value?: number): void;
  get(labels?: Labels): number;
  setToCurrentTime(labels?: Labels): void;
}

/**
 * Histogram metric - observations in configurable buckets
 */
export interface Histogram extends Metric {
  type: 'histogram';
  observe(labels: Labels | undefined, value: number): void;
  startTimer(labels?: Labels): () => number;
  get(labels?: Labels): HistogramValue;
  reset(labels?: Labels): void;
}

/**
 * Histogram value representation
 */
export interface HistogramValue {
  buckets: Map<number, number>;
  sum: number;
  count: number;
}

/**
 * Summary metric - quantile observations
 */
export interface Summary extends Metric {
  type: 'summary';
  observe(labels: Labels | undefined, value: number): void;
  startTimer(labels?: Labels): () => number;
  get(labels?: Labels): SummaryValue;
  reset(labels?: Labels): void;
}

/**
 * Summary value representation
 */
export interface SummaryValue {
  quantiles: Map<number, number>;
  sum: number;
  count: number;
}

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  /** Prefix for all metric names */
  prefix?: string;
  /** Default labels applied to all metrics */
  defaultLabels?: Labels;
  /** Default histogram buckets */
  defaultBuckets?: number[];
  /** Default summary quantiles */
  defaultQuantiles?: number[];
  /** Enable metric collection */
  enabled?: boolean;
}

/**
 * Create label key from labels object
 */
function labelKey(labels?: Labels): string {
  if (!labels || Object.keys(labels).length === 0) return '';
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
}

/**
 * Escape label value for Prometheus format
 */
function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

// ============================================================================
// Counter Implementation
// ============================================================================

class CounterImpl implements Counter {
  readonly type = 'counter' as const;
  private values = new Map<string, number>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: string[] = []
  ) {}

  inc(labels?: Labels, value: number = 1): void {
    if (value < 0) {
      throw new Error('Counter can only be incremented with positive values');
    }
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }

  get(labels?: Labels): number {
    return this.values.get(labelKey(labels)) ?? 0;
  }

  reset(labels?: Labels): void {
    if (labels) {
      this.values.delete(labelKey(labels));
    } else {
      this.values.clear();
    }
  }

  collect(): Map<string, number> {
    return new Map(this.values);
  }
}

// ============================================================================
// Gauge Implementation
// ============================================================================

class GaugeImpl implements Gauge {
  readonly type = 'gauge' as const;
  private values = new Map<string, number>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: string[] = []
  ) {}

  set(labels: Labels | undefined, value: number): void {
    this.values.set(labelKey(labels), value);
  }

  inc(labels?: Labels, value: number = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }

  dec(labels?: Labels, value: number = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) - value);
  }

  get(labels?: Labels): number {
    return this.values.get(labelKey(labels)) ?? 0;
  }

  setToCurrentTime(labels?: Labels): void {
    this.set(labels, Date.now() / 1000);
  }

  collect(): Map<string, number> {
    return new Map(this.values);
  }
}

// ============================================================================
// Histogram Implementation
// ============================================================================

interface HistogramData {
  buckets: Map<number, number>;
  sum: number;
  count: number;
}

class HistogramImpl implements Histogram {
  readonly type = 'histogram' as const;
  private data = new Map<string, HistogramData>();
  private readonly buckets: number[];

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: string[] = [],
    buckets?: number[]
  ) {
    // Default buckets suitable for request durations in seconds
    this.buckets = buckets ?? [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    this.buckets.sort((a, b) => a - b);
  }

  observe(labels: Labels | undefined, value: number): void {
    const key = labelKey(labels);
    let data = this.data.get(key);

    if (!data) {
      data = {
        buckets: new Map(this.buckets.map(b => [b, 0])),
        sum: 0,
        count: 0,
      };
      this.data.set(key, data);
    }

    data.sum += value;
    data.count += 1;

    // Increment all buckets where value <= bucket
    for (const bucket of this.buckets) {
      if (value <= bucket) {
        data.buckets.set(bucket, (data.buckets.get(bucket) ?? 0) + 1);
      }
    }
  }

  startTimer(labels?: Labels): () => number {
    const start = process.hrtime.bigint();
    return () => {
      const duration = Number(process.hrtime.bigint() - start) / 1e9; // Convert to seconds
      this.observe(labels, duration);
      return duration;
    };
  }

  get(labels?: Labels): HistogramValue {
    const data = this.data.get(labelKey(labels));
    if (!data) {
      return {
        buckets: new Map(this.buckets.map(b => [b, 0])),
        sum: 0,
        count: 0,
      };
    }
    return {
      buckets: new Map(data.buckets),
      sum: data.sum,
      count: data.count,
    };
  }

  reset(labels?: Labels): void {
    if (labels) {
      this.data.delete(labelKey(labels));
    } else {
      this.data.clear();
    }
  }

  collect(): Map<string, HistogramData> {
    return new Map(this.data);
  }

  getBuckets(): number[] {
    return [...this.buckets];
  }
}

// ============================================================================
// Summary Implementation (Simplified - uses reservoir sampling)
// ============================================================================

interface SummaryData {
  values: number[];
  sum: number;
  count: number;
}

class SummaryImpl implements Summary {
  readonly type = 'summary' as const;
  private data = new Map<string, SummaryData>();
  private readonly quantiles: number[];
  private readonly maxAge: number;
  private readonly ageBuckets: number;
  private readonly maxSamples: number;

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: string[] = [],
    quantiles?: number[],
    maxAge: number = 600000, // 10 minutes
    ageBuckets: number = 5,
    maxSamples: number = 1000
  ) {
    this.quantiles = quantiles ?? [0.5, 0.9, 0.95, 0.99];
    this.maxAge = maxAge;
    this.ageBuckets = ageBuckets;
    this.maxSamples = maxSamples;
  }

  observe(labels: Labels | undefined, value: number): void {
    const key = labelKey(labels);
    let data = this.data.get(key);

    if (!data) {
      data = { values: [], sum: 0, count: 0 };
      this.data.set(key, data);
    }

    data.sum += value;
    data.count += 1;

    // Reservoir sampling to limit memory
    if (data.values.length < this.maxSamples) {
      data.values.push(value);
    } else {
      const idx = Math.floor(Math.random() * data.count);
      if (idx < this.maxSamples) {
        data.values[idx] = value;
      }
    }
  }

  startTimer(labels?: Labels): () => number {
    const start = process.hrtime.bigint();
    return () => {
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      this.observe(labels, duration);
      return duration;
    };
  }

  get(labels?: Labels): SummaryValue {
    const data = this.data.get(labelKey(labels));
    if (!data || data.values.length === 0) {
      return {
        quantiles: new Map(this.quantiles.map(q => [q, 0])),
        sum: 0,
        count: 0,
      };
    }

    // Calculate quantiles
    const sorted = [...data.values].sort((a, b) => a - b);
    const quantileValues = new Map<number, number>();

    for (const q of this.quantiles) {
      const idx = Math.ceil(q * sorted.length) - 1;
      quantileValues.set(q, sorted[Math.max(0, idx)]);
    }

    return {
      quantiles: quantileValues,
      sum: data.sum,
      count: data.count,
    };
  }

  reset(labels?: Labels): void {
    if (labels) {
      this.data.delete(labelKey(labels));
    } else {
      this.data.clear();
    }
  }

  collect(): Map<string, SummaryData> {
    return new Map(this.data);
  }

  getQuantiles(): number[] {
    return [...this.quantiles];
  }
}

// ============================================================================
// Metrics Registry
// ============================================================================

/**
 * Central registry for all metrics
 */
export class MetricsRegistry {
  private readonly metrics = new Map<string, Counter | Gauge | Histogram | Summary>();
  private readonly config: Required<MetricsConfig>;

  constructor(config: MetricsConfig = {}) {
    this.config = {
      prefix: config.prefix ?? 'secureagent',
      defaultLabels: config.defaultLabels ?? {},
      defaultBuckets: config.defaultBuckets ?? [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      defaultQuantiles: config.defaultQuantiles ?? [0.5, 0.9, 0.95, 0.99],
      enabled: config.enabled ?? true,
    };
  }

  /**
   * Create or get a counter
   */
  counter(name: string, help: string, labelNames: string[] = []): Counter {
    const fullName = this.prefixedName(name);
    let metric = this.metrics.get(fullName);

    if (metric) {
      if (metric.type !== 'counter') {
        throw new Error(`Metric ${fullName} already exists with type ${metric.type}`);
      }
      return metric as Counter;
    }

    metric = new CounterImpl(fullName, help, labelNames);
    this.metrics.set(fullName, metric);
    return metric as Counter;
  }

  /**
   * Create or get a gauge
   */
  gauge(name: string, help: string, labelNames: string[] = []): Gauge {
    const fullName = this.prefixedName(name);
    let metric = this.metrics.get(fullName);

    if (metric) {
      if (metric.type !== 'gauge') {
        throw new Error(`Metric ${fullName} already exists with type ${metric.type}`);
      }
      return metric as Gauge;
    }

    metric = new GaugeImpl(fullName, help, labelNames);
    this.metrics.set(fullName, metric);
    return metric as Gauge;
  }

  /**
   * Create or get a histogram
   */
  histogram(
    name: string,
    help: string,
    labelNames: string[] = [],
    buckets?: number[]
  ): Histogram {
    const fullName = this.prefixedName(name);
    let metric = this.metrics.get(fullName);

    if (metric) {
      if (metric.type !== 'histogram') {
        throw new Error(`Metric ${fullName} already exists with type ${metric.type}`);
      }
      return metric as Histogram;
    }

    metric = new HistogramImpl(fullName, help, labelNames, buckets ?? this.config.defaultBuckets);
    this.metrics.set(fullName, metric);
    return metric as Histogram;
  }

  /**
   * Create or get a summary
   */
  summary(
    name: string,
    help: string,
    labelNames: string[] = [],
    quantiles?: number[]
  ): Summary {
    const fullName = this.prefixedName(name);
    let metric = this.metrics.get(fullName);

    if (metric) {
      if (metric.type !== 'summary') {
        throw new Error(`Metric ${fullName} already exists with type ${metric.type}`);
      }
      return metric as Summary;
    }

    metric = new SummaryImpl(fullName, help, labelNames, quantiles ?? this.config.defaultQuantiles);
    this.metrics.set(fullName, metric);
    return metric as Summary;
  }

  /**
   * Get a metric by name
   */
  getMetric(name: string): Counter | Gauge | Histogram | Summary | undefined {
    return this.metrics.get(this.prefixedName(name));
  }

  // ============================================================================
  // Test-compatible method aliases
  // ============================================================================

  /**
   * Create a counter (test-compatible alias)
   */
  createCounter(name: string, options: { description: string; labels?: string[] }): Counter {
    return this.counter(name, options.description, options.labels ?? []);
  }

  /**
   * Create a gauge (test-compatible alias)
   */
  createGauge(name: string, options: { description: string; labels?: string[] }): Gauge {
    return this.gauge(name, options.description, options.labels ?? []);
  }

  /**
   * Create a histogram (test-compatible alias)
   */
  createHistogram(name: string, options: { description: string; buckets?: number[]; labels?: string[] }): Histogram & { getStats: (labels?: Labels) => { count: number; sum: number } } {
    const histogram = this.histogram(name, options.description, options.labels ?? [], options.buckets);
    // Add getStats method for test compatibility
    return Object.assign(histogram, {
      getStats: (labels?: Labels) => {
        const data = histogram.get(labels);
        return { count: data.count, sum: data.sum };
      },
    });
  }

  /**
   * Create a summary (test-compatible alias)
   */
  createSummary(name: string, options: { description: string; percentiles?: number[]; labels?: string[] }): Summary & { getStats: (labels?: Labels) => { count: number; percentiles: Record<number, number> } } {
    const summary = this.summary(name, options.description, options.labels ?? [], options.percentiles);
    // Add getStats method for test compatibility
    return Object.assign(summary, {
      getStats: (labels?: Labels) => {
        const data = summary.get(labels);
        const percentiles: Record<number, number> = {};
        data.quantiles.forEach((value, key) => {
          percentiles[key] = value;
        });
        return { count: data.count, percentiles };
      },
    });
  }

  /**
   * Export metrics in specified format (test-compatible, synchronous)
   */
  export(format: 'prometheus' | 'json'): string {
    if (!this.config.enabled) {
      return '';
    }

    if (format === 'json') {
      const metricsData: Record<string, unknown> = {};
      for (const [name, metric] of this.metrics) {
        metricsData[name] = {
          type: metric.type,
          help: metric.help,
        };
      }
      return JSON.stringify(metricsData);
    }

    // Prometheus format
    const lines: string[] = [];
    for (const metric of this.metrics.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      if (metric.type === 'counter') {
        const counter = metric as CounterImpl;
        for (const [labels, value] of counter.collect()) {
          lines.push(this.formatMetric(metric.name, labels, value));
        }
      } else if (metric.type === 'gauge') {
        const gauge = metric as GaugeImpl;
        for (const [labels, value] of gauge.collect()) {
          lines.push(this.formatMetric(metric.name, labels, value));
        }
      } else if (metric.type === 'histogram') {
        const histogram = metric as HistogramImpl;
        for (const [labels, data] of histogram.collect()) {
          // Output buckets
          for (const bucket of histogram.getBuckets()) {
            const bucketLabels = labels ? `${labels},le="${bucket}"` : `le="${bucket}"`;
            lines.push(this.formatMetric(`${metric.name}_bucket`, bucketLabels, data.buckets.get(bucket) ?? 0));
          }
          // +Inf bucket
          const infLabels = labels ? `${labels},le="+Inf"` : `le="+Inf"`;
          lines.push(this.formatMetric(`${metric.name}_bucket`, infLabels, data.count));
          // Sum and count
          lines.push(this.formatMetric(`${metric.name}_sum`, labels, data.sum));
          lines.push(this.formatMetric(`${metric.name}_count`, labels, data.count));
        }
      } else if (metric.type === 'summary') {
        const summary = metric as SummaryImpl;
        for (const [labels, data] of summary.collect()) {
          // Calculate and output quantiles
          const sorted = [...data.values].sort((a, b) => a - b);
          for (const q of summary.getQuantiles()) {
            const idx = Math.ceil(q * sorted.length) - 1;
            const value = sorted[Math.max(0, idx)] ?? 0;
            const quantileLabels = labels ? `${labels},quantile="${q}"` : `quantile="${q}"`;
            lines.push(this.formatMetric(metric.name, quantileLabels, value));
          }
          // Sum and count
          lines.push(this.formatMetric(`${metric.name}_sum`, labels, data.sum));
          lines.push(this.formatMetric(`${metric.name}_count`, labels, data.count));
        }
      }

      lines.push(''); // Empty line between metrics
    }

    return lines.join('\n');
  }

  /**
   * Export metrics asynchronously (original API)
   */
  async exportAsync(): Promise<string> {
    return this.export('prometheus');
  }

  /**
   * Remove a metric
   */
  removeMetric(name: string): boolean {
    return this.metrics.delete(this.prefixedName(name));
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }

  /**
   * Format a single metric line
   */
  private formatMetric(name: string, labels: string, value: number): string {
    // Apply default labels
    let allLabels = labels;
    if (Object.keys(this.config.defaultLabels).length > 0) {
      const defaultLabelStr = Object.entries(this.config.defaultLabels)
        .map(([k, v]) => `${k}="${escapeLabelValue(v)}"`)
        .join(',');
      allLabels = labels ? `${defaultLabelStr},${labels}` : defaultLabelStr;
    }

    if (allLabels) {
      return `${name}{${allLabels}} ${value}`;
    }
    return `${name} ${value}`;
  }

  /**
   * Get prefixed metric name
   */
  private prefixedName(name: string): string {
    if (this.config.prefix) {
      return `${this.config.prefix}_${name}`;
    }
    return name;
  }
}

// ============================================================================
// Default Registry and Convenience Functions
// ============================================================================

let defaultRegistry: MetricsRegistry | null = null;

/**
 * Initialize the default metrics registry
 */
export function initMetrics(config?: MetricsConfig): MetricsRegistry {
  defaultRegistry = new MetricsRegistry(config);
  return defaultRegistry;
}

/**
 * Get the default metrics registry
 */
export function getMetrics(): MetricsRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new MetricsRegistry();
  }
  return defaultRegistry;
}

// ============================================================================
// Pre-defined SecureAgent Metrics
// ============================================================================

/**
 * Initialize standard SecureAgent metrics
 */
export function initSecureAgentMetrics(registry?: MetricsRegistry): {
  // Authentication metrics
  authAttempts: Counter;
  authFailures: Counter;
  tokenRefreshes: Counter;
  activeSessions: Gauge;

  // Authorization metrics
  authzChecks: Counter;
  authzDenials: Counter;

  // MFA metrics
  mfaEnrollments: Counter;
  mfaVerifications: Counter;
  mfaFailures: Counter;

  // Tool execution metrics
  toolExecutions: Counter;
  toolDuration: Histogram;
  toolErrors: Counter;

  // Sandbox metrics
  sandboxExecutions: Counter;
  sandboxDuration: Histogram;
  sandboxTimeouts: Counter;
  sandboxMemoryExceeded: Counter;

  // Rate limiting metrics
  rateLimitHits: Counter;
  rateLimitBlocks: Counter;

  // Security metrics
  promptInjectionAttempts: Counter;
  credentialLeakBlocks: Counter;

  // Channel metrics
  messagesSent: Counter;
  messagesReceived: Counter;
  channelErrors: Counter;
} {
  const reg = registry ?? getMetrics();

  return {
    // Authentication
    authAttempts: reg.counter(
      'auth_attempts_total',
      'Total authentication attempts',
      ['method', 'status']
    ),
    authFailures: reg.counter(
      'auth_failures_total',
      'Total authentication failures',
      ['reason']
    ),
    tokenRefreshes: reg.counter(
      'token_refreshes_total',
      'Total token refresh operations',
      ['status']
    ),
    activeSessions: reg.gauge(
      'active_sessions',
      'Number of active sessions',
      ['user_type']
    ),

    // Authorization
    authzChecks: reg.counter(
      'authz_checks_total',
      'Total authorization checks',
      ['resource', 'action', 'result']
    ),
    authzDenials: reg.counter(
      'authz_denials_total',
      'Total authorization denials',
      ['resource', 'action', 'reason']
    ),

    // MFA
    mfaEnrollments: reg.counter(
      'mfa_enrollments_total',
      'Total MFA enrollments',
      ['status']
    ),
    mfaVerifications: reg.counter(
      'mfa_verifications_total',
      'Total MFA verification attempts',
      ['method', 'status']
    ),
    mfaFailures: reg.counter(
      'mfa_failures_total',
      'Total MFA verification failures',
      ['reason']
    ),

    // Tool execution
    toolExecutions: reg.counter(
      'tool_executions_total',
      'Total tool executions',
      ['tool', 'status']
    ),
    toolDuration: reg.histogram(
      'tool_duration_seconds',
      'Tool execution duration in seconds',
      ['tool'],
      [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60]
    ),
    toolErrors: reg.counter(
      'tool_errors_total',
      'Total tool execution errors',
      ['tool', 'error_type']
    ),

    // Sandbox
    sandboxExecutions: reg.counter(
      'sandbox_executions_total',
      'Total sandbox executions',
      ['runtime', 'status']
    ),
    sandboxDuration: reg.histogram(
      'sandbox_duration_seconds',
      'Sandbox execution duration in seconds',
      ['runtime'],
      [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300]
    ),
    sandboxTimeouts: reg.counter(
      'sandbox_timeouts_total',
      'Total sandbox execution timeouts',
      ['runtime']
    ),
    sandboxMemoryExceeded: reg.counter(
      'sandbox_memory_exceeded_total',
      'Total sandbox memory limit exceeded',
      ['runtime']
    ),

    // Rate limiting
    rateLimitHits: reg.counter(
      'rate_limit_hits_total',
      'Total rate limit checks',
      ['resource', 'allowed']
    ),
    rateLimitBlocks: reg.counter(
      'rate_limit_blocks_total',
      'Total requests blocked by rate limiter',
      ['resource']
    ),

    // Security
    promptInjectionAttempts: reg.counter(
      'prompt_injection_attempts_total',
      'Total detected prompt injection attempts',
      ['confidence_level']
    ),
    credentialLeakBlocks: reg.counter(
      'credential_leak_blocks_total',
      'Total credential leak attempts blocked',
      ['credential_type']
    ),

    // Channels
    messagesSent: reg.counter(
      'messages_sent_total',
      'Total messages sent',
      ['channel']
    ),
    messagesReceived: reg.counter(
      'messages_received_total',
      'Total messages received',
      ['channel']
    ),
    channelErrors: reg.counter(
      'channel_errors_total',
      'Total channel errors',
      ['channel', 'error_type']
    ),
  };
}
