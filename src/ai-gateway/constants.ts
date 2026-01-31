/**
 * AI Gateway Constants
 *
 * Default configurations, model pricing, and event definitions
 */

import type {
  AIProvider,
  ModelInfo,
  ModelTier,
  RateLimitConfig,
  RateLimitTier,
  ProviderCapability,
} from './types.js';

// =============================================================================
// AI Gateway Events
// =============================================================================

export const AI_GATEWAY_EVENTS = {
  // Request events
  REQUEST_STARTED: 'ai-gateway:request:started',
  REQUEST_COMPLETED: 'ai-gateway:request:completed',
  REQUEST_FAILED: 'ai-gateway:request:failed',
  REQUEST_RETRIED: 'ai-gateway:request:retried',

  // Provider events
  PROVIDER_REGISTERED: 'ai-gateway:provider:registered',
  PROVIDER_STATUS_CHANGED: 'ai-gateway:provider:status-changed',
  PROVIDER_HEALTH_CHECK: 'ai-gateway:provider:health-check',

  // Routing events
  ROUTE_SELECTED: 'ai-gateway:route:selected',
  ROUTE_FALLBACK: 'ai-gateway:route:fallback',
  ROUTE_FAILED: 'ai-gateway:route:failed',

  // Budget events
  BUDGET_WARNING: 'ai-gateway:budget:warning',
  BUDGET_EXCEEDED: 'ai-gateway:budget:exceeded',
  BUDGET_RESET: 'ai-gateway:budget:reset',

  // Rate limit events
  RATE_LIMITED: 'ai-gateway:rate-limit:exceeded',
  RATE_LIMIT_WARNING: 'ai-gateway:rate-limit:warning',

  // Usage events
  USAGE_RECORDED: 'ai-gateway:usage:recorded',
  USAGE_SUMMARY: 'ai-gateway:usage:summary',

  // Loop detection events
  LOOP_DETECTED: 'ai-gateway:loop:detected',
  LOOP_WARNING: 'ai-gateway:loop:warning',

  // Cache events
  CACHE_HIT: 'ai-gateway:cache:hit',
  CACHE_MISS: 'ai-gateway:cache:miss',
} as const;

export type AIGatewayEventType = typeof AI_GATEWAY_EVENTS[keyof typeof AI_GATEWAY_EVENTS];

// =============================================================================
// Default Model Pricing (per 1M tokens, in cents)
// =============================================================================

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI models
  'gpt-5': { input: 500, output: 1500 },
  'gpt-4o': { input: 250, output: 1000 },
  'gpt-4o-mini': { input: 15, output: 60 },
  'gpt-4-turbo': { input: 1000, output: 3000 },
  'gpt-4': { input: 3000, output: 6000 },
  'gpt-3.5-turbo': { input: 50, output: 150 },
  'o1': { input: 1500, output: 6000 },
  'o1-mini': { input: 300, output: 1200 },
  'text-embedding-3-large': { input: 13, output: 0 },
  'text-embedding-3-small': { input: 2, output: 0 },

  // Anthropic models
  'claude-opus-4-5-20251101': { input: 1500, output: 7500 },
  'claude-opus-4-20250514': { input: 1500, output: 7500 },
  'claude-sonnet-4-20250514': { input: 300, output: 1500 },
  'claude-3-5-sonnet-20241022': { input: 300, output: 1500 },
  'claude-3-opus-20240229': { input: 1500, output: 7500 },
  'claude-3-sonnet-20240229': { input: 300, output: 1500 },
  'claude-3-haiku-20240307': { input: 25, output: 125 },

  // Google models
  'gemini-2.5-pro': { input: 125, output: 500 },
  'gemini-2.5-flash': { input: 7.5, output: 30 },
  'gemini-1.5-pro': { input: 125, output: 500 },
  'gemini-1.5-flash': { input: 7.5, output: 30 },
  'gemini-pro': { input: 50, output: 150 },

  // Meta Llama models (via Groq/Together)
  'llama-4-maverick-405b': { input: 50, output: 100 },
  'llama-4-scout-70b': { input: 15, output: 30 },
  'llama-3.3-70b': { input: 15, output: 30 },
  'llama-3.1-405b': { input: 50, output: 100 },
  'llama-3.1-70b': { input: 15, output: 30 },
  'llama-3.1-8b': { input: 5, output: 10 },

  // DeepSeek models (cost-effective)
  'deepseek-chat': { input: 14, output: 28 },
  'deepseek-reasoner': { input: 55, output: 219 },
  'deepseek-coder': { input: 14, output: 28 },

  // Cohere models
  'command-r-plus': { input: 300, output: 1500 },
  'command-r': { input: 50, output: 150 },
  'embed-english-v3.0': { input: 10, output: 0 },

  // Mixtral (via Groq/Together)
  'mixtral-8x22b': { input: 90, output: 90 },
  'mixtral-8x7b': { input: 24, output: 24 },

  // Default fallback
  'default': { input: 100, output: 300 },
};

// =============================================================================
// Default Model Registry
// =============================================================================

export const DEFAULT_MODELS: ModelInfo[] = [
  // ==========================================================================
  // OpenAI Models
  // ==========================================================================
  {
    id: 'gpt-5',
    provider: 'openai',
    name: 'GPT-5',
    tier: 'flagship',
    capabilities: ['chat', 'function_calling', 'streaming', 'json_mode', 'image_analysis'],
    contextWindow: 256000,
    maxOutputTokens: 32768,
    costPerInputToken: 0.005,
    costPerOutputToken: 0.015,
    enabled: true,
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    name: 'GPT-4o',
    tier: 'premium',
    capabilities: ['chat', 'function_calling', 'streaming', 'json_mode', 'image_analysis'],
    contextWindow: 128000,
    maxOutputTokens: 16384,
    costPerInputToken: 0.0025,
    costPerOutputToken: 0.01,
    enabled: true,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    name: 'GPT-4o Mini',
    tier: 'standard',
    capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'],
    contextWindow: 128000,
    maxOutputTokens: 16384,
    costPerInputToken: 0.00015,
    costPerOutputToken: 0.0006,
    enabled: true,
  },
  {
    id: 'o1',
    provider: 'openai',
    name: 'o1 (Reasoning)',
    tier: 'flagship',
    capabilities: ['chat', 'streaming'],
    contextWindow: 200000,
    maxOutputTokens: 100000,
    costPerInputToken: 0.015,
    costPerOutputToken: 0.06,
    enabled: true,
  },
  {
    id: 'o1-mini',
    provider: 'openai',
    name: 'o1-mini',
    tier: 'premium',
    capabilities: ['chat', 'streaming'],
    contextWindow: 128000,
    maxOutputTokens: 65536,
    costPerInputToken: 0.003,
    costPerOutputToken: 0.012,
    enabled: true,
  },
  {
    id: 'gpt-3.5-turbo',
    provider: 'openai',
    name: 'GPT-3.5 Turbo',
    tier: 'economy',
    capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'],
    contextWindow: 16385,
    maxOutputTokens: 4096,
    costPerInputToken: 0.0005,
    costPerOutputToken: 0.0015,
    enabled: true,
  },
  {
    id: 'text-embedding-3-large',
    provider: 'openai',
    name: 'Text Embedding 3 Large',
    tier: 'standard',
    capabilities: ['embedding'],
    contextWindow: 8191,
    costPerInputToken: 0.00013,
    costPerOutputToken: 0,
    enabled: true,
  },

  // ==========================================================================
  // Anthropic Models
  // ==========================================================================
  {
    id: 'claude-opus-4-5-20251101',
    provider: 'anthropic',
    name: 'Claude Opus 4.5',
    tier: 'flagship',
    capabilities: ['chat', 'function_calling', 'streaming', 'image_analysis'],
    contextWindow: 200000,
    maxOutputTokens: 32000,
    costPerInputToken: 0.015,
    costPerOutputToken: 0.075,
    enabled: true,
  },
  {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    name: 'Claude Sonnet 4',
    tier: 'premium',
    capabilities: ['chat', 'function_calling', 'streaming', 'image_analysis'],
    contextWindow: 200000,
    maxOutputTokens: 16000,
    costPerInputToken: 0.003,
    costPerOutputToken: 0.015,
    enabled: true,
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    name: 'Claude 3.5 Sonnet',
    tier: 'premium',
    capabilities: ['chat', 'function_calling', 'streaming', 'image_analysis'],
    contextWindow: 200000,
    maxOutputTokens: 8192,
    costPerInputToken: 0.003,
    costPerOutputToken: 0.015,
    enabled: true,
  },
  {
    id: 'claude-3-haiku-20240307',
    provider: 'anthropic',
    name: 'Claude 3 Haiku',
    tier: 'economy',
    capabilities: ['chat', 'function_calling', 'streaming'],
    contextWindow: 200000,
    maxOutputTokens: 4096,
    costPerInputToken: 0.00025,
    costPerOutputToken: 0.00125,
    enabled: true,
  },

  // ==========================================================================
  // Google Models
  // ==========================================================================
  {
    id: 'gemini-2.5-pro',
    provider: 'google',
    name: 'Gemini 2.5 Pro',
    tier: 'flagship',
    capabilities: ['chat', 'function_calling', 'streaming', 'image_analysis'],
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    costPerInputToken: 0.00125,
    costPerOutputToken: 0.005,
    enabled: true,
  },
  {
    id: 'gemini-2.5-flash',
    provider: 'google',
    name: 'Gemini 2.5 Flash',
    tier: 'standard',
    capabilities: ['chat', 'function_calling', 'streaming'],
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    costPerInputToken: 0.000075,
    costPerOutputToken: 0.0003,
    enabled: true,
  },
  {
    id: 'gemini-1.5-pro',
    provider: 'google',
    name: 'Gemini 1.5 Pro',
    tier: 'premium',
    capabilities: ['chat', 'function_calling', 'streaming', 'image_analysis'],
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    costPerInputToken: 0.00125,
    costPerOutputToken: 0.005,
    enabled: true,
  },
  {
    id: 'gemini-1.5-flash',
    provider: 'google',
    name: 'Gemini 1.5 Flash',
    tier: 'economy',
    capabilities: ['chat', 'function_calling', 'streaming'],
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    costPerInputToken: 0.000075,
    costPerOutputToken: 0.0003,
    enabled: true,
  },

  // ==========================================================================
  // Meta Llama Models (via Groq)
  // ==========================================================================
  {
    id: 'llama-4-maverick-405b',
    provider: 'groq',
    name: 'Llama 4 Maverick 405B',
    tier: 'flagship',
    capabilities: ['chat', 'function_calling', 'streaming'],
    contextWindow: 128000,
    maxOutputTokens: 32768,
    costPerInputToken: 0.0005,
    costPerOutputToken: 0.001,
    enabled: true,
  },
  {
    id: 'llama-4-scout-70b',
    provider: 'groq',
    name: 'Llama 4 Scout 70B',
    tier: 'premium',
    capabilities: ['chat', 'function_calling', 'streaming'],
    contextWindow: 128000,
    maxOutputTokens: 32768,
    costPerInputToken: 0.00015,
    costPerOutputToken: 0.0003,
    enabled: true,
  },
  {
    id: 'llama-3.3-70b',
    provider: 'groq',
    name: 'Llama 3.3 70B',
    tier: 'standard',
    capabilities: ['chat', 'function_calling', 'streaming'],
    contextWindow: 128000,
    maxOutputTokens: 8192,
    costPerInputToken: 0.00015,
    costPerOutputToken: 0.0003,
    enabled: true,
  },
  {
    id: 'llama-3.1-8b',
    provider: 'groq',
    name: 'Llama 3.1 8B',
    tier: 'economy',
    capabilities: ['chat', 'streaming'],
    contextWindow: 128000,
    maxOutputTokens: 8192,
    costPerInputToken: 0.00005,
    costPerOutputToken: 0.0001,
    enabled: true,
  },

  // ==========================================================================
  // DeepSeek Models (Cost-Effective)
  // ==========================================================================
  {
    id: 'deepseek-chat',
    provider: 'deepseek',
    name: 'DeepSeek V3',
    tier: 'standard',
    capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'],
    contextWindow: 64000,
    maxOutputTokens: 8192,
    costPerInputToken: 0.00014,
    costPerOutputToken: 0.00028,
    enabled: true,
  },
  {
    id: 'deepseek-reasoner',
    provider: 'deepseek',
    name: 'DeepSeek R1',
    tier: 'premium',
    capabilities: ['chat', 'streaming'],
    contextWindow: 64000,
    maxOutputTokens: 8192,
    costPerInputToken: 0.00055,
    costPerOutputToken: 0.00219,
    enabled: true,
  },
  {
    id: 'deepseek-coder',
    provider: 'deepseek',
    name: 'DeepSeek Coder',
    tier: 'standard',
    capabilities: ['chat', 'function_calling', 'streaming'],
    contextWindow: 64000,
    maxOutputTokens: 8192,
    costPerInputToken: 0.00014,
    costPerOutputToken: 0.00028,
    enabled: true,
  },

  // ==========================================================================
  // OpenRouter Models (Access to 100+ models)
  // ==========================================================================
  {
    id: 'openrouter/auto',
    provider: 'openrouter',
    name: 'Auto (Best for prompt)',
    tier: 'standard',
    capabilities: ['chat', 'function_calling', 'streaming'],
    contextWindow: 128000,
    maxOutputTokens: 8192,
    costPerInputToken: 0.001, // Variable based on selected model
    costPerOutputToken: 0.003,
    enabled: true,
  },

  // ==========================================================================
  // Mixtral Models (via Groq/Together)
  // ==========================================================================
  {
    id: 'mixtral-8x22b',
    provider: 'groq',
    name: 'Mixtral 8x22B',
    tier: 'premium',
    capabilities: ['chat', 'function_calling', 'streaming'],
    contextWindow: 65536,
    maxOutputTokens: 8192,
    costPerInputToken: 0.0009,
    costPerOutputToken: 0.0009,
    enabled: true,
  },
  {
    id: 'mixtral-8x7b',
    provider: 'groq',
    name: 'Mixtral 8x7B',
    tier: 'standard',
    capabilities: ['chat', 'function_calling', 'streaming'],
    contextWindow: 32768,
    maxOutputTokens: 8192,
    costPerInputToken: 0.00024,
    costPerOutputToken: 0.00024,
    enabled: true,
  },
];

// =============================================================================
// Tier Order
// =============================================================================

export const TIER_ORDER: ModelTier[] = ['economy', 'standard', 'premium', 'flagship'];

export function compareTiers(a: ModelTier, b: ModelTier): number {
  return TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b);
}

// =============================================================================
// Rate Limit Configurations
// =============================================================================

export const RATE_LIMIT_CONFIGS: Record<RateLimitTier, RateLimitConfig> = {
  free: {
    tier: 'free',
    requestsPerMinute: 10,
    requestsPerHour: 100,
    requestsPerDay: 500,
    tokensPerMinute: 10000,
    tokensPerDay: 100000,
    concurrentRequests: 2,
  },
  standard: {
    tier: 'standard',
    requestsPerMinute: 50,
    requestsPerHour: 500,
    requestsPerDay: 5000,
    tokensPerMinute: 50000,
    tokensPerDay: 1000000,
    concurrentRequests: 5,
  },
  premium: {
    tier: 'premium',
    requestsPerMinute: 200,
    requestsPerHour: 2000,
    requestsPerDay: 20000,
    tokensPerMinute: 200000,
    tokensPerDay: 5000000,
    concurrentRequests: 20,
  },
  unlimited: {
    tier: 'unlimited',
    requestsPerMinute: Number.MAX_SAFE_INTEGER,
    requestsPerHour: Number.MAX_SAFE_INTEGER,
    requestsPerDay: Number.MAX_SAFE_INTEGER,
    tokensPerMinute: Number.MAX_SAFE_INTEGER,
    tokensPerDay: Number.MAX_SAFE_INTEGER,
    concurrentRequests: 100,
  },
};

// =============================================================================
// Default Settings
// =============================================================================

export const AI_GATEWAY_DEFAULTS = {
  /** Default request timeout in ms */
  DEFAULT_TIMEOUT_MS: 60000,

  /** Default max retries */
  DEFAULT_MAX_RETRIES: 3,

  /** Retry delay in ms */
  RETRY_DELAY_MS: 1000,

  /** Retry backoff multiplier */
  RETRY_BACKOFF: 2,

  /** Health check interval in ms */
  HEALTH_CHECK_INTERVAL_MS: 60000,

  /** Provider error threshold before marking unavailable */
  ERROR_THRESHOLD: 5,

  /** Budget alert thresholds (percentage) */
  BUDGET_ALERT_THRESHOLDS: [50, 75, 90, 100],

  /** Loop detection window size */
  LOOP_DETECTION_WINDOW: 10,

  /** Loop detection similarity threshold */
  LOOP_SIMILARITY_THRESHOLD: 0.95,

  /** Cache TTL in ms */
  CACHE_TTL_MS: 3600000, // 1 hour

  /** Max cache entries */
  MAX_CACHE_ENTRIES: 1000,

  /** Token estimation chars per token */
  CHARS_PER_TOKEN: 4,
} as const;

// =============================================================================
// Provider Capabilities
// =============================================================================

export const PROVIDER_CAPABILITIES: Record<AIProvider, ProviderCapability[]> = {
  openai: ['chat', 'completion', 'embedding', 'image_generation', 'image_analysis', 'audio_transcription', 'function_calling', 'streaming', 'json_mode'],
  anthropic: ['chat', 'image_analysis', 'function_calling', 'streaming'],
  google: ['chat', 'embedding', 'image_generation', 'image_analysis', 'function_calling', 'streaming'],
  azure: ['chat', 'completion', 'embedding', 'image_generation', 'image_analysis', 'function_calling', 'streaming', 'json_mode'],
  cohere: ['chat', 'embedding', 'function_calling', 'streaming'],
  replicate: ['chat', 'image_generation', 'audio_generation', 'streaming'],
  huggingface: ['chat', 'embedding', 'streaming'],
  ollama: ['chat', 'embedding', 'streaming'],
  groq: ['chat', 'function_calling', 'streaming'],
  deepseek: ['chat', 'function_calling', 'streaming', 'json_mode'],
  openrouter: ['chat', 'function_calling', 'streaming', 'image_analysis'],
  together: ['chat', 'embedding', 'function_calling', 'streaming'],
  fireworks: ['chat', 'function_calling', 'streaming'],
  custom: ['chat', 'streaming'],
};

// =============================================================================
// Error Messages
// =============================================================================

export const ERROR_MESSAGES = {
  PROVIDER_ERROR: 'Provider returned an error',
  RATE_LIMITED: 'Rate limit exceeded',
  BUDGET_EXCEEDED: 'Budget limit exceeded',
  INVALID_REQUEST: 'Invalid request',
  MODEL_NOT_FOUND: 'Model not found',
  PROVIDER_UNAVAILABLE: 'Provider is unavailable',
  TIMEOUT: 'Request timed out',
  LOOP_DETECTED: 'Conversation loop detected',
  VALIDATION_ERROR: 'Validation failed',
  UNKNOWN_ERROR: 'An unknown error occurred',
} as const;

// =============================================================================
// Table Names (for persistence)
// =============================================================================

export const TABLE_NAMES = {
  USAGE_RECORDS: 'ai_usage_records',
  BUDGETS: 'ai_budgets',
  BUDGET_ALERTS: 'ai_budget_alerts',
  RATE_LIMITS: 'ai_rate_limits',
  PROVIDER_CONFIGS: 'ai_provider_configs',
  ROUTES: 'ai_routes',
  CACHE: 'ai_cache',
} as const;
