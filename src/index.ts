// Configuration
export {
  ConfigSchema,
  ConfigLoader,
  ConfigValidationError,
  type Config,
  type SecurityConfig,
  type SandboxConfig as AppSandboxConfig,
  type ObservabilityConfig,
  type MCPConfig,
} from './config/index.js';

// Security - Types
export {
  // Types
  type UserIdentity,
  type TokenPayload,
  type SessionContext,
  type AuthenticationResult,
  type DeviceFingerprint,
  type Permission,
  type Role,
  type AuthorizationContext,
  type AuthorizationResult,
  type ToolCall,
  type ToolExecutionContext,
  type ToolExecutionResult,
  type AuditEvent,
  type AuditEventType,
  // Errors
  SecurityError,
  AuthenticationError,
  TokenExpiredError,
  InvalidTokenError,
  MFARequiredError,
  AuthorizationError,
  InsufficientPermissionsError,
  SessionError,
  ToolNotAllowedError,
  ToolValidationError,
  ToolExecutionError,
  RateLimitError,
  PromptInjectionError,
  SandboxError,
  SecurityConfigError,
  isSecurityError,
  isAuthenticationError,
  isAuthorizationError,
} from './security/types.js';

// Security - Auth
export { TokenService } from './security/auth/token-service.js';
export { SessionManager } from './security/auth/session-manager.js';

// Security - Guardrails
export {
  detectPromptInjection,
  detectWithCache,
  analyzeRetrievedContent,
  type DetectionResult,
  type InjectionCategory,
  OutputValidator,
  getOutputValidator,
  validateOutput,
  sanitizeOutput,
  type OutputValidationResult,
  type OutputIssue,
  type OutputIssueType,
  type OutputValidatorConfig,
  RateLimiter,
  SlidingWindowRateLimiter,
  TieredRateLimiter,
  type RateLimiterConfig,
  type RateLimitResult,
} from './security/guardrails/index.js';

// Security - Sandbox
export {
  GVisorSandbox,
  NsjailSandbox,
  DockerSandbox,
  detectRuntimes,
  SandboxExecutor,
  SandboxPool,
  executeInSandbox,
  type SandboxConfig,
  type ExecutionRequest,
  type ExecutionResult,
  type SandboxExecutorConfig,
  type SandboxRuntime,
} from './security/sandbox/index.js';

// Observability
export * from './observability/index.js';

// Tools
export * from './tools/index.js';

// MCP Server
export {
  // OAuth 2.1 + PKCE + DPoP
  OAuthAuthorizationServer,
  generatePKCE,
  verifyPKCE,
  verifyDPoPProof,
  ClientRegistrationSchema,
  type OAuthServerConfig,
  type ClientRegistration,
  type RegisteredClient,
  type PKCEChallenge,
  type AuthorizationCode as OAuthAuthorizationCode,
  type AccessToken as OAuthAccessToken,
  type RefreshToken,
  type TokenResponse,
  type TokenError,
  // MCP Protocol
  MCPProtocolHandler,
  MCPHTTPTransport,
  MCPRequestSchema,
  MCPErrorCodes,
  type MCPRequest,
  type MCPResponse,
  type MCPToolDefinition,
  type MCPResource,
  type MCPPrompt,
  // MCP Server
  MCPServer,
  createMCPMiddleware,
  createMCPServer,
  type MCPServerOptions,
  type CreateMCPServerOptions,
} from './mcp/index.js';

// Channels
export {
  BaseChannel,
  WhatsAppChannel,
  TelegramChannel,
  parseCommand,
  DiscordChannel,
  SlackChannel,
  SignalChannel,
  IMessageChannel,
  type Message,
  type SendOptions,
  type WhatsAppConfig,
  type TelegramConfig,
  type ParsedCommand,
} from './channels/index.js';

// Persistence
export {
  // Database
  DatabaseManager,
  MemoryDatabaseAdapter,
  getDatabase,
  initDatabase,
  type DatabaseConfig,
  type DatabaseAdapter,
  type QueryResult,
  type Transaction,
  // Session Store
  DatabaseSessionStore,
  MemorySessionStore,
  createSessionStore,
  type SessionStore,
  // Token Store
  DatabaseTokenStore,
  MemoryTokenStore,
  createTokenStore,
  type TokenStore,
  type StoredAccessToken,
  type StoredRefreshToken,
  type StoredAuthCode,
  // Audit Store
  DatabaseAuditStore,
  MemoryAuditStore,
  createAuditStore,
  type AuditStore,
  type AuditQueryFilters,
  type AuditQueryOptions,
  type AuditQueryResult,
  type AuditStats,
} from './persistence/index.js';

// Resilience
export {
  // Circuit Breaker
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitOpenError,
  CircuitTimeoutError,
  getCircuitBreakerRegistry,
  createCircuitBreaker,
  type CircuitState,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,
  // Retry
  retry,
  withRetry,
  retryable,
  RetryBuilder,
  RetryExhaustedError,
  RetryAbortedError,
  retryOnAnyError,
  retryOnNetworkError,
  retryOnHttpStatus,
  retryOnTransientError,
  type RetryStrategy,
  type RetryConfig,
  type RetryResult,
  type RetryAttempt,
  // Bulkhead
  Bulkhead,
  BulkheadRegistry,
  Semaphore,
  BulkheadFullError,
  BulkheadTimeoutError,
  getBulkheadRegistry,
  createBulkhead,
  type BulkheadConfig,
  type BulkheadStats,
  // Fallback
  withFallback,
  FallbackChain,
  FallbackCache,
  GracefulDegradation,
  fallbackOnAny,
  fallbackOnErrorType,
  fallbackOnMessage,
  dontFallbackOn,
  type FallbackConfig,
  type FallbackResult,
  type DegradationLevel,
  // Combined Policy
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
  type ResiliencePolicyConfig,
  type PolicyResult,
} from './resilience/index.js';

// Validation
export {
  // Schema validation
  SchemaValidator,
  ValidationSchemaError,
  getValidator,
  validate,
  assertValid,
  sanitizeString,
  coerceValue,
  type SchemaType,
  type StringFormat,
  type Schema,
  type SanitizeOptions,
  type ValidationError,
  type ValidationResult,
  // Tool validation
  ToolValidator,
  ToolValidatorRegistry,
  ToolInputValidationError,
  getToolValidatorRegistry,
  registerToolValidator,
  validateToolInput,
  filePathSchema,
  urlSchema,
  commandSchema,
  identifierSchema,
  textContentSchema,
  type ToolParameter,
  type ToolValidationConfig,
  type ToolValidationResult,
  type ToolParameterError,
} from './validation/index.js';

// Agent
export {
  // Agent
  Agent,
  AgentRegistry,
  getAgentRegistry,
  createAgent,
  // Conversation
  ConversationManager,
  getConversationManager,
  // Executor
  ToolExecutor,
  createToolExecutor,
  // Types
  type AgentState,
  type AgentConfig,
  type ConversationMessage,
  type ToolCallRequest,
  type PendingToolCall,
  type AgentTurn,
  type ConversationContext,
  type ExecutionOptions,
  type AgentResponse,
  type ApprovalRequest,
  type ApprovalResponse,
  type AgentEventType,
  type AgentEvent,
  type AgentEventHandler,
  type MemoryEntry,
  type AgentStats,
  type MessageHandler,
  type AgentOptions,
  type ToolExecutionPolicy,
  type ApprovalHandler,
  type ToolExecutorConfig,
  type ExecutionContext,
} from './agent/index.js';

// Health Checks
export {
  // Checker
  HealthChecker,
  getHealthChecker,
  initHealthChecker,
  // Built-in Checks
  memoryCheck,
  eventLoopCheck,
  databaseCheck,
  httpEndpointCheck,
  dnsCheck,
  diskSpaceCheck,
  cpuLoadCheck,
  customCheck,
  compositeCheck,
  // HTTP Handlers
  createHealthHandler,
  expressHealthMiddleware,
  generatePrometheusMetrics,
  createPrometheusHandler,
  // Types
  type HealthStatus,
  type HealthCheckResult,
  type HealthReport,
  type LivenessResult,
  type ReadinessResult,
  type HealthCheckFn,
  type HealthCheckConfig,
  type DependencyCheckConfig,
  type HealthEventType,
  type HealthEvent,
  type HealthEventHandler,
  type HealthEndpointOptions,
  type HealthEndpointResponse,
} from './health/index.js';

// Events / Pub-Sub
export {
  // Event Bus
  EventBus,
  getEventBus,
  initEventBus,
  createPublisher,
  createSubscriber,
  // Middleware
  loggingMiddleware,
  auditMiddleware,
  tracingMiddleware,
  validationMiddleware,
  rateLimitMiddleware,
  transformMiddleware,
  filterMiddleware,
  deduplicationMiddleware,
  errorHandlingMiddleware,
  metricsMiddleware,
  composeMiddleware,
  // Patterns
  RequestReply,
  EventAggregator,
  Saga,
  AggregateRoot,
  SimpleEventStore,
  // Types
  type Event,
  type EventEnvelope,
  type EventHandler,
  type EventFilter,
  type SubscriptionOptions,
  type Subscription,
  type SubscriptionStats,
  type PublishOptions,
  type TopicConfig,
  type EventBusStats,
  type EventStore,
  type EventMiddleware,
  type EventBusConfig,
  type RequestOptions,
  type AggregationWindow,
  type AggregatorOptions,
  type SagaStep,
  type SagaResult,
  type DomainEvent,
} from './events/index.js';
