export {
  createLogger,
  getLogger,
  initLogger,
  AuditLogger,
  getAuditLogger,
  initAuditLogger,
  type LoggerConfig,
} from './logger.js';

export {
  MetricsRegistry,
  initMetrics,
  getMetrics,
  getMetrics as getMetricsRegistry, // Test-compatible alias
  initSecureAgentMetrics,
  type MetricType,
  type Labels,
  type Metric,
  type Counter,
  type Gauge,
  type Histogram,
  type Summary,
  type HistogramValue,
  type SummaryValue,
  type MetricsConfig,
} from './metrics.js';

export {
  // Core tracing
  initTracing,
  getTracer,
  shutdownTracing,
  // Samplers
  AlwaysOnSampler,
  AlwaysOffSampler,
  ProbabilitySampler,
  RateLimitingSampler,
  // Exporters
  ConsoleSpanExporter,
  InMemorySpanExporter,
  OTLPHttpExporter,
  BatchingSpanExporter,
  // Context propagation
  parseTraceparent,
  createTraceparent,
  parseTracestate,
  createTracestate,
  // Helpers
  trace,
  withSpan,
  setSpanAttributes,
  addSpanEvent,
  recordSpanException,
  // Types
  type TraceContext,
  type SpanStatus,
  type SpanKind,
  type SpanAttributes,
  type SpanEvent,
  type SpanLink,
  type SpanData,
  type Span,
  type Tracer,
  type StartSpanOptions,
  type SpanExporter,
  type Sampler,
  type TracingConfig,
} from './tracing.js';
