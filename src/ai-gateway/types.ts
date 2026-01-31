/**
 * AI Gateway Types
 *
 * Type definitions for AI provider routing, cost control, and usage tracking
 */

// =============================================================================
// Provider Types
// =============================================================================

/** Supported AI providers */
export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure'
  | 'cohere'
  | 'replicate'
  | 'huggingface'
  | 'ollama'
  | 'groq'
  | 'deepseek'
  | 'openrouter'
  | 'together'
  | 'fireworks'
  | 'custom';

/** Provider status */
export type ProviderStatus = 'available' | 'degraded' | 'unavailable' | 'rate_limited' | 'unknown';

/** Provider capability */
export type ProviderCapability =
  | 'chat'
  | 'completion'
  | 'embedding'
  | 'image_generation'
  | 'image_analysis'
  | 'audio_transcription'
  | 'audio_generation'
  | 'function_calling'
  | 'streaming'
  | 'json_mode';

/** Provider configuration */
export interface ProviderConfig {
  provider: AIProvider;
  apiKey?: string;
  apiEndpoint?: string;
  organization?: string;
  defaultModel?: string;
  maxRetries?: number;
  timeout?: number;
  headers?: Record<string, string>;
  enabled?: boolean;
  priority?: number;
}

/** Provider info */
export interface ProviderInfo {
  provider: AIProvider;
  status: ProviderStatus;
  capabilities: ProviderCapability[];
  models: string[];
  latencyMs?: number;
  lastChecked?: number;
  errorCount: number;
  successCount: number;
}

// =============================================================================
// Model Types
// =============================================================================

/** Model tier for quality/cost tradeoffs */
export type ModelTier = 'economy' | 'standard' | 'premium' | 'flagship';

/** Model info */
export interface ModelInfo {
  id: string;
  provider: AIProvider;
  name: string;
  tier: ModelTier;
  capabilities: ProviderCapability[];
  contextWindow: number;
  maxOutputTokens?: number;
  costPerInputToken: number;
  costPerOutputToken: number;
  latencyMs?: number;
  enabled: boolean;
}

/** Model selection criteria */
export interface ModelSelectionCriteria {
  /** Required capabilities */
  capabilities?: ProviderCapability[];
  /** Minimum tier */
  minTier?: ModelTier;
  /** Maximum tier */
  maxTier?: ModelTier;
  /** Maximum cost per 1K tokens */
  maxCostPer1K?: number;
  /** Minimum context window */
  minContextWindow?: number;
  /** Preferred providers */
  preferredProviders?: AIProvider[];
  /** Exclude providers */
  excludeProviders?: AIProvider[];
  /** Specific model IDs to consider */
  modelIds?: string[];
}

// =============================================================================
// Request/Response Types
// =============================================================================

/** AI request message */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string | AIContentPart[];
  name?: string;
  toolCallId?: string;
  toolCalls?: AIToolCall[];
}

/** Content part for multimodal messages */
export interface AIContentPart {
  type: 'text' | 'image_url' | 'image_base64';
  text?: string;
  imageUrl?: string;
  imageData?: string;
  mimeType?: string;
}

/** Tool call */
export interface AIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** Tool definition */
export interface AIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

/** AI request options */
export interface AIRequestOptions {
  model?: string;
  messages: AIMessage[];
  tools?: AIToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  stream?: boolean;
  responseFormat?: { type: 'text' | 'json_object' };
  seed?: number;
  metadata?: Record<string, unknown>;
}

/** AI response */
export interface AIResponse {
  id: string;
  provider: AIProvider;
  model: string;
  message: AIMessage;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
  usage: AIUsage;
  latencyMs: number;
  cached?: boolean;
  metadata?: Record<string, unknown>;
}

/** Token usage */
export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Streaming chunk */
export interface AIStreamChunk {
  id: string;
  delta: {
    content?: string;
    toolCalls?: Partial<AIToolCall>[];
  };
  finishReason?: AIResponse['finishReason'];
  usage?: Partial<AIUsage>;
}

// =============================================================================
// Routing Types
// =============================================================================

/** Routing strategy */
export type RoutingStrategy =
  | 'cost_optimized'
  | 'latency_optimized'
  | 'quality_optimized'
  | 'round_robin'
  | 'weighted'
  | 'failover';

/** Route configuration */
export interface RouteConfig {
  id: string;
  name: string;
  strategy: RoutingStrategy;
  criteria?: ModelSelectionCriteria;
  fallbackChain?: string[];
  timeout?: number;
  retries?: number;
  enabled: boolean;
}

/** Routing decision */
export interface RoutingDecision {
  routeId: string;
  selectedModel: string;
  selectedProvider: AIProvider;
  reason: string;
  alternatives: string[];
  estimatedCost: number;
  estimatedLatency?: number;
}

// =============================================================================
// Budget Types
// =============================================================================

/** Budget period */
export type BudgetPeriod = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'total';

/** Budget configuration */
export interface BudgetConfig {
  id: string;
  userId?: string;
  teamId?: string;
  name: string;
  limitCents: number;
  period: BudgetPeriod;
  alertThresholds: number[];
  hardLimit: boolean;
  rollover: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Budget status */
export interface BudgetStatus {
  budgetId: string;
  spentCents: number;
  remainingCents: number;
  percentUsed: number;
  periodStart: number;
  periodEnd: number;
  overLimit: boolean;
  alerts: BudgetAlert[];
}

/** Budget alert */
export interface BudgetAlert {
  budgetId: string;
  threshold: number;
  triggeredAt: number;
  message: string;
}

// =============================================================================
// Usage Tracking Types
// =============================================================================

/** Usage record */
export interface UsageRecord {
  id: string;
  userId?: string;
  teamId?: string;
  requestId: string;
  provider: AIProvider;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costCents: number;
  latencyMs: number;
  success: boolean;
  cached?: boolean;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/** Usage summary */
export interface UsageSummary {
  periodStart: number;
  periodEnd: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCostCents: number;
  averageLatencyMs: number;
  byProvider: Record<AIProvider, ProviderUsageSummary>;
  byModel: Record<string, ModelUsageSummary>;
}

/** Provider usage summary */
export interface ProviderUsageSummary {
  requests: number;
  tokens: number;
  costCents: number;
  averageLatencyMs: number;
  errorRate: number;
}

/** Model usage summary */
export interface ModelUsageSummary {
  provider: AIProvider;
  requests: number;
  tokens: number;
  costCents: number;
  averageLatencyMs: number;
}

// =============================================================================
// Cost Estimation Types
// =============================================================================

/** Cost estimate */
export interface CostEstimate {
  model: string;
  provider: AIProvider;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostCents: number;
  minCostCents: number;
  maxCostCents: number;
  confidence: number;
}

// =============================================================================
// Rate Limiting Types
// =============================================================================

/** Rate limit tier */
export type RateLimitTier = 'free' | 'standard' | 'premium' | 'unlimited';

/** Rate limit config */
export interface RateLimitConfig {
  tier: RateLimitTier;
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  tokensPerMinute: number;
  tokensPerDay: number;
  concurrentRequests: number;
}

/** Rate limit status */
export interface RateLimitStatus {
  tier: RateLimitTier;
  requestsRemaining: {
    minute: number;
    hour: number;
    day: number;
  };
  tokensRemaining: {
    minute: number;
    day: number;
  };
  resetTimes: {
    minute: number;
    hour: number;
    day: number;
  };
  isLimited: boolean;
  retryAfter?: number;
}

// =============================================================================
// Loop Detection Types
// =============================================================================

/** Loop detection result */
export interface LoopDetectionResult {
  isLoop: boolean;
  confidence: number;
  loopType?: 'exact' | 'semantic' | 'pattern';
  matchedMessages?: number[];
  recommendation: 'continue' | 'warn' | 'stop';
  message?: string;
}

/** Loop pattern */
export interface LoopPattern {
  id: string;
  type: 'exact' | 'semantic' | 'regex';
  pattern: string;
  threshold: number;
  windowSize: number;
  action: 'log' | 'warn' | 'stop';
}

// =============================================================================
// Error Types
// =============================================================================

export type AIGatewayErrorCode =
  | 'PROVIDER_ERROR'
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'INVALID_REQUEST'
  | 'MODEL_NOT_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'TIMEOUT'
  | 'LOOP_DETECTED'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_ERROR';

export class AIGatewayError extends Error {
  constructor(
    public readonly code: AIGatewayErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly retryAfter?: number,
    public readonly provider?: AIProvider
  ) {
    super(message);
    this.name = 'AIGatewayError';
  }
}
