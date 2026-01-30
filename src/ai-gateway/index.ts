/**
 * AI Gateway Module
 *
 * Unified AI provider routing, cost control, rate limiting, and usage tracking
 */

import type {
  AIProvider,
  AIRequestOptions,
  AIResponse,
  AIMessage,
  ProviderConfig,
  ModelInfo,
  ModelSelectionCriteria,
  RouteConfig,
  RoutingDecision,
  RoutingStrategy,
  BudgetConfig,
  BudgetStatus,
  UsageRecord,
  UsageSummary,
  RateLimitStatus,
  RateLimitTier,
  CostEstimate,
  LoopDetectionResult,
  LoopPattern,
} from './types.js';
import { AIGatewayError } from './types.js';
import { AI_GATEWAY_EVENTS, AI_GATEWAY_DEFAULTS } from './constants.js';

import { ProviderRegistry, createProviderRegistry } from './provider-registry.js';
import { ModelRouter, createModelRouter } from './model-router.js';
import { BudgetManager, createBudgetManager, createBudgetStore, InMemoryBudgetStore } from './budget-manager.js';
import { UsageTracker, createUsageTracker, createUsageStore, InMemoryUsageStore } from './usage-tracker.js';
import { CostEstimator, createCostEstimator, TokenCounter } from './cost-estimator.js';
import { LoopDetector, createLoopDetector } from './loop-detector.js';
import { RateLimiter, createRateLimiter, checkRateLimit, withRateLimit } from './rate-limiter.js';

// =============================================================================
// AI Gateway Configuration
// =============================================================================

export interface AIGatewayConfig {
  /** Default routing strategy */
  defaultStrategy: RoutingStrategy;
  /** Default budget limits (in cents) */
  defaultBudget?: {
    dailyLimit?: number;
    monthlyLimit?: number;
    alertThresholds?: number[];
  };
  /** Default rate limit tier */
  defaultRateLimitTier: RateLimitTier;
  /** Enable loop detection */
  enableLoopDetection: boolean;
  /** Enable usage tracking */
  enableUsageTracking: boolean;
  /** Enable cost estimation logging */
  enableCostLogging: boolean;
  /** Health check interval in ms */
  healthCheckIntervalMs: number;
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: AIGatewayConfig = {
  defaultStrategy: 'cost_optimized',
  defaultRateLimitTier: 'standard',
  enableLoopDetection: true,
  enableUsageTracking: true,
  enableCostLogging: true,
  healthCheckIntervalMs: AI_GATEWAY_DEFAULTS.HEALTH_CHECK_INTERVAL_MS,
};

// =============================================================================
// AI Gateway Manager
// =============================================================================

export class AIGateway {
  private readonly config: AIGatewayConfig;

  // Core components
  public readonly registry: ProviderRegistry;
  public readonly router: ModelRouter;
  public readonly budgetManager: BudgetManager;
  public readonly usageTracker: UsageTracker;
  public readonly costEstimator: CostEstimator;
  public readonly loopDetector: LoopDetector;
  public readonly rateLimiter: RateLimiter;

  private initialized = false;

  constructor(config?: Partial<AIGatewayConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create event handler that merges with user callback
    const eventHandler = (event: string, data: unknown) => {
      this.config.onEvent?.(event, data);
    };

    // Initialize components
    this.registry = createProviderRegistry({
      healthCheckIntervalMs: this.config.healthCheckIntervalMs,
      onEvent: eventHandler,
    });

    this.costEstimator = createCostEstimator(this.registry);

    this.router = createModelRouter(this.registry, this.costEstimator, {
      defaultStrategy: this.config.defaultStrategy,
      onEvent: eventHandler,
    });

    this.budgetManager = createBudgetManager(createBudgetStore('memory'), {
      defaultAlertThresholds: [...(this.config.defaultBudget?.alertThresholds ?? AI_GATEWAY_DEFAULTS.BUDGET_ALERT_THRESHOLDS)],
      onEvent: eventHandler,
    });

    this.usageTracker = createUsageTracker(createUsageStore('memory'), {
      onEvent: eventHandler,
    });

    this.loopDetector = createLoopDetector({
      onEvent: eventHandler,
    });

    this.rateLimiter = createRateLimiter({
      onEvent: eventHandler,
    });
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Initialize the gateway
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Start health checks
    this.registry.startHealthChecks();

    // Set up default budget if configured
    if (this.config.defaultBudget) {
      if (this.config.defaultBudget.dailyLimit) {
        await this.budgetManager.createBudget(
          'Default Daily Budget',
          this.config.defaultBudget.dailyLimit,
          'daily',
          {
            alertThresholds: this.config.defaultBudget.alertThresholds ?? [50, 75, 90],
            hardLimit: false,
            rollover: false,
          }
        );
      }

      if (this.config.defaultBudget.monthlyLimit) {
        await this.budgetManager.createBudget(
          'Default Monthly Budget',
          this.config.defaultBudget.monthlyLimit,
          'monthly',
          {
            alertThresholds: this.config.defaultBudget.alertThresholds ?? [50, 75, 90],
            hardLimit: false,
            rollover: false,
          }
        );
      }
    }

    this.initialized = true;
  }

  /**
   * Shutdown the gateway
   */
  async shutdown(): Promise<void> {
    this.registry.stopHealthChecks();
    this.loopDetector.clearAllHistory();
    this.initialized = false;
  }

  // ==========================================================================
  // Provider Management
  // ==========================================================================

  /**
   * Register an AI provider
   */
  registerProvider(config: ProviderConfig): void {
    this.registry.registerProvider(config);
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): AIProvider[] {
    return this.registry.getAvailableProviders();
  }

  /**
   * Get provider status
   */
  getProviderStatus(provider: AIProvider) {
    return this.registry.getProviderInfo(provider);
  }

  // ==========================================================================
  // Model Management
  // ==========================================================================

  /**
   * Register a model
   */
  registerModel(model: ModelInfo): void {
    this.registry.registerModel(model);
  }

  /**
   * Get enabled models
   */
  getEnabledModels(): ModelInfo[] {
    return this.registry.getEnabledModels();
  }

  /**
   * Find the best model for a capability
   */
  findBestModel(capability: string, options?: ModelSelectionCriteria): ModelInfo | undefined {
    return this.registry.findBestModel(capability as any, options);
  }

  // ==========================================================================
  // Routing
  // ==========================================================================

  /**
   * Register a route configuration
   */
  registerRoute(route: RouteConfig): void {
    this.router.registerRoute(route);
  }

  /**
   * Select a model for a request
   */
  selectModel(
    request: AIRequestOptions,
    options?: {
      routeId?: string;
      criteria?: ModelSelectionCriteria;
    }
  ): RoutingDecision {
    return this.router.selectModel(request, options?.routeId, options?.criteria);
  }

  /**
   * Get fallback model after a failure
   */
  getFallback(failedModel: string, request: AIRequestOptions, routeId?: string): RoutingDecision | undefined {
    return this.router.getFallback(failedModel, request, routeId);
  }

  // ==========================================================================
  // Cost Estimation
  // ==========================================================================

  /**
   * Estimate cost for a request
   */
  estimateCost(request: AIRequestOptions, modelId?: string): CostEstimate {
    return this.costEstimator.estimate(request, modelId);
  }

  /**
   * Find the cheapest model for a request
   */
  findCheapestModel(request: AIRequestOptions, modelIds?: string[]): CostEstimate | undefined {
    return this.costEstimator.findCheapestModel(request, modelIds);
  }

  /**
   * Calculate actual cost from usage
   */
  calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    return this.costEstimator.calculateActualCost(modelId, inputTokens, outputTokens);
  }

  // ==========================================================================
  // Budget Management
  // ==========================================================================

  /**
   * Create a budget
   */
  async createBudget(
    name: string,
    limitCents: number,
    period: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'total',
    options?: {
      userId?: string;
      teamId?: string;
      alertThresholds?: number[];
      hardLimit?: boolean;
      rollover?: boolean;
    }
  ): Promise<BudgetConfig> {
    return this.budgetManager.createBudget(name, limitCents, period, options);
  }

  /**
   * Get budget status
   */
  async getBudgetStatus(budgetId: string): Promise<BudgetStatus | null> {
    return this.budgetManager.getStatus(budgetId);
  }

  /**
   * Check if a request is within budget
   */
  async checkBudget(budgetId: string, estimatedCostCents: number): Promise<{ allowed: boolean; status: BudgetStatus | null }> {
    const canSpend = await this.budgetManager.canSpend(budgetId, estimatedCostCents);
    const status = await this.budgetManager.getStatus(budgetId);
    return { allowed: canSpend, status };
  }

  /**
   * Record spending against a budget
   */
  async recordSpending(budgetId: string, amountCents: number): Promise<void> {
    await this.budgetManager.recordSpending(budgetId, amountCents);
  }

  // ==========================================================================
  // Usage Tracking
  // ==========================================================================

  /**
   * Record API usage
   */
  async recordUsage(record: Omit<UsageRecord, 'id'>): Promise<UsageRecord | null> {
    if (!this.config.enableUsageTracking) {
      return null;
    }
    return this.usageTracker.record(record);
  }

  /**
   * Get usage summary
   */
  async getUsageSummary(options?: {
    userId?: string;
    teamId?: string;
    startTime?: number;
    endTime?: number;
  }): Promise<UsageSummary> {
    return this.usageTracker.getSummary(options);
  }

  /**
   * Get usage records
   */
  async getUsageRecords(options?: {
    userId?: string;
    teamId?: string;
    provider?: AIProvider;
    model?: string;
    limit?: number;
    offset?: number;
  }): Promise<UsageRecord[]> {
    return this.usageTracker.getRecords(options);
  }

  // ==========================================================================
  // Rate Limiting
  // ==========================================================================

  /**
   * Set rate limit tier for a user
   */
  setRateLimitTier(userId: string, tier: RateLimitTier): void {
    this.rateLimiter.setTier(userId, tier);
  }

  /**
   * Check rate limit for a user
   */
  checkRateLimit(userId: string, estimatedTokens?: number): RateLimitStatus {
    return this.rateLimiter.checkRequest(userId, estimatedTokens);
  }

  /**
   * Consume a rate limit slot
   */
  consumeRateLimit(userId: string, tokens?: number): void {
    this.rateLimiter.consumeRequest(userId, tokens);
  }

  /**
   * Release a rate limit slot (for concurrent request tracking)
   */
  releaseRateLimit(userId: string): void {
    this.rateLimiter.releaseRequest(userId);
  }

  /**
   * Get rate limit status for a user
   */
  getRateLimitStatus(userId: string): RateLimitStatus {
    return this.rateLimiter.getStatus(userId);
  }

  // ==========================================================================
  // Loop Detection
  // ==========================================================================

  /**
   * Check for conversation loops
   */
  detectLoop(conversationId: string, messages: AIMessage[]): LoopDetectionResult {
    if (!this.config.enableLoopDetection) {
      return { isLoop: false, confidence: 0, recommendation: 'continue' };
    }
    return this.loopDetector.detect(conversationId, messages);
  }

  /**
   * Add messages to loop detection history
   */
  addToLoopHistory(conversationId: string, messages: AIMessage[]): void {
    if (this.config.enableLoopDetection) {
      this.loopDetector.addToHistory(conversationId, messages);
    }
  }

  /**
   * Clear loop detection history for a conversation
   */
  clearLoopHistory(conversationId: string): void {
    this.loopDetector.clearHistory(conversationId);
  }

  /**
   * Add a custom loop pattern
   */
  addLoopPattern(pattern: LoopPattern): void {
    this.loopDetector.addPattern(pattern);
  }

  // ==========================================================================
  // Request Processing
  // ==========================================================================

  /**
   * Pre-flight check for a request
   *
   * Validates budget, rate limits, and loop detection before making the actual API call
   */
  async preflightCheck(
    userId: string,
    request: AIRequestOptions,
    options?: {
      budgetId?: string;
      conversationId?: string;
      routeId?: string;
    }
  ): Promise<{
    allowed: boolean;
    decision: RoutingDecision;
    estimate: CostEstimate;
    rateLimitStatus: RateLimitStatus;
    loopResult?: LoopDetectionResult;
    error?: AIGatewayError;
  }> {
    // 1. Select model
    let decision: RoutingDecision;
    try {
      decision = this.selectModel(request, {
        routeId: options?.routeId,
      });
    } catch (error) {
      if (error instanceof AIGatewayError) {
        return {
          allowed: false,
          decision: {} as RoutingDecision,
          estimate: {} as CostEstimate,
          rateLimitStatus: {} as RateLimitStatus,
          error,
        };
      }
      throw error;
    }

    // 2. Estimate cost
    const estimate = this.estimateCost(request, decision.selectedModel);

    // 3. Check rate limit
    const rateLimitStatus = this.checkRateLimit(userId, estimate.estimatedInputTokens);
    if (rateLimitStatus.isLimited) {
      return {
        allowed: false,
        decision,
        estimate,
        rateLimitStatus,
        error: new AIGatewayError(
          'RATE_LIMITED',
          'Rate limit exceeded',
          429,
          rateLimitStatus.retryAfter
        ),
      };
    }

    // 4. Check budget
    if (options?.budgetId) {
      const budgetResult = await this.checkBudget(options.budgetId, estimate.estimatedCostCents);
      if (!budgetResult.allowed) {
        return {
          allowed: false,
          decision,
          estimate,
          rateLimitStatus,
          error: new AIGatewayError('BUDGET_EXCEEDED', 'Budget limit exceeded', 402),
        };
      }
    }

    // 5. Check for loops
    let loopResult: LoopDetectionResult | undefined;
    if (options?.conversationId && this.config.enableLoopDetection) {
      loopResult = this.detectLoop(options.conversationId, request.messages);
      if (loopResult.isLoop && loopResult.recommendation === 'stop') {
        return {
          allowed: false,
          decision,
          estimate,
          rateLimitStatus,
          loopResult,
          error: new AIGatewayError('LOOP_DETECTED', loopResult.message ?? 'Conversation loop detected', 400),
        };
      }
    }

    return {
      allowed: true,
      decision,
      estimate,
      rateLimitStatus,
      loopResult,
    };
  }

  /**
   * Record completion of a request
   *
   * Updates usage tracking, budget spending, and rate limit tokens
   */
  async recordCompletion(
    userId: string,
    response: AIResponse,
    options?: {
      budgetId?: string;
      conversationId?: string;
      teamId?: string;
    }
  ): Promise<void> {
    const costCents = this.calculateCost(
      response.model,
      response.usage.promptTokens,
      response.usage.completionTokens
    );

    // Record usage
    if (this.config.enableUsageTracking) {
      await this.recordUsage({
        userId,
        teamId: options?.teamId,
        requestId: response.id,
        provider: response.provider,
        model: response.model,
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        costCents,
        latencyMs: response.latencyMs,
        success: true,
        cached: response.cached,
        timestamp: Date.now(),
      });
    }

    // Record budget spending
    if (options?.budgetId) {
      await this.recordSpending(options.budgetId, costCents);
    }

    // Record actual tokens for rate limiting
    this.rateLimiter.recordTokens(userId, response.usage.totalTokens);

    // Release concurrent slot
    this.releaseRateLimit(userId);

    // Update provider success
    this.registry.recordSuccess(response.provider, response.latencyMs);

    // Add to loop history
    if (options?.conversationId) {
      this.addToLoopHistory(options.conversationId, [response.message]);
    }
  }

  /**
   * Record a failed request
   */
  async recordFailure(
    userId: string,
    provider: AIProvider,
    model: string,
    error: Error,
    options?: {
      requestId?: string;
      latencyMs?: number;
      isRateLimited?: boolean;
    }
  ): Promise<void> {
    // Record usage with failure
    if (this.config.enableUsageTracking) {
      await this.recordUsage({
        userId,
        requestId: options?.requestId ?? `error-${Date.now()}`,
        provider,
        model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costCents: 0,
        latencyMs: options?.latencyMs ?? 0,
        success: false,
        metadata: { error: error.message },
        timestamp: Date.now(),
      });
    }

    // Release concurrent slot
    this.releaseRateLimit(userId);

    // Update provider error
    this.registry.recordError(provider, options?.isRateLimited);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createAIGateway(config?: Partial<AIGatewayConfig>): AIGateway {
  return new AIGateway(config);
}

// =============================================================================
// Re-exports
// =============================================================================

// Types
export * from './types.js';

// Constants
export {
  AI_GATEWAY_EVENTS,
  AI_GATEWAY_DEFAULTS,
  MODEL_PRICING,
  DEFAULT_MODELS,
  RATE_LIMIT_CONFIGS,
  TIER_ORDER,
  PROVIDER_CAPABILITIES,
  ERROR_MESSAGES,
  TABLE_NAMES,
  compareTiers,
} from './constants.js';

// Components
export {
  ProviderRegistry,
  createProviderRegistry,
  type ProviderRegistryConfig,
} from './provider-registry.js';

export {
  ModelRouter,
  createModelRouter,
  type ModelRouterConfig,
} from './model-router.js';

export {
  BudgetManager,
  createBudgetManager,
  createBudgetStore,
  InMemoryBudgetStore,
  DatabaseBudgetStore,
  type BudgetManagerConfig,
  type BudgetStore,
} from './budget-manager.js';

export {
  UsageTracker,
  createUsageTracker,
  createUsageStore,
  InMemoryUsageStore,
  DatabaseUsageStore,
  type UsageTrackerConfig,
  type UsageStore,
} from './usage-tracker.js';

export {
  CostEstimator,
  createCostEstimator,
  TokenCounter,
  type CostEstimatorConfig,
} from './cost-estimator.js';

export {
  LoopDetector,
  createLoopDetector,
  type LoopDetectorConfig,
} from './loop-detector.js';

export {
  RateLimiter,
  createRateLimiter,
  checkRateLimit,
  withRateLimit,
  type RateLimiterConfig,
  type RateLimitMiddlewareResult,
} from './rate-limiter.js';
