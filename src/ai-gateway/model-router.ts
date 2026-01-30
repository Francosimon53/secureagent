/**
 * Model Router
 *
 * Intelligent routing of AI requests to optimal models with fallback chains
 */

import type {
  AIProvider,
  ModelInfo,
  ModelSelectionCriteria,
  RouteConfig,
  RoutingDecision,
  RoutingStrategy,
  AIRequestOptions,
  ProviderCapability,
} from './types.js';
import { AIGatewayError } from './types.js';
import type { ProviderRegistry } from './provider-registry.js';
import type { CostEstimator } from './cost-estimator.js';
import { AI_GATEWAY_EVENTS, TIER_ORDER, compareTiers } from './constants.js';

// =============================================================================
// Model Router
// =============================================================================

export interface ModelRouterConfig {
  defaultStrategy: RoutingStrategy;
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: ModelRouterConfig = {
  defaultStrategy: 'cost_optimized',
};

export class ModelRouter {
  private readonly config: ModelRouterConfig;
  private readonly routes = new Map<string, RouteConfig>();
  private roundRobinIndex = 0;

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly costEstimator: CostEstimator,
    config?: Partial<ModelRouterConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a route
   */
  registerRoute(route: RouteConfig): void {
    this.routes.set(route.id, route);
  }

  /**
   * Unregister a route
   */
  unregisterRoute(routeId: string): boolean {
    return this.routes.delete(routeId);
  }

  /**
   * Get a route
   */
  getRoute(routeId: string): RouteConfig | undefined {
    return this.routes.get(routeId);
  }

  /**
   * Get all routes
   */
  getAllRoutes(): RouteConfig[] {
    return Array.from(this.routes.values());
  }

  /**
   * Select the best model for a request
   */
  selectModel(
    request: AIRequestOptions,
    routeId?: string,
    overrideCriteria?: ModelSelectionCriteria
  ): RoutingDecision {
    const route = routeId ? this.routes.get(routeId) : undefined;
    const strategy = route?.strategy ?? this.config.defaultStrategy;
    const criteria = overrideCriteria ?? route?.criteria ?? {};

    // If specific model requested, use it
    if (request.model) {
      const model = this.registry.getModel(request.model);
      if (!model) {
        throw new AIGatewayError('MODEL_NOT_FOUND', `Model not found: ${request.model}`);
      }
      if (!model.enabled) {
        throw new AIGatewayError('MODEL_NOT_FOUND', `Model is disabled: ${request.model}`);
      }
      const providerInfo = this.registry.getProviderInfo(model.provider);
      if (providerInfo?.status === 'unavailable') {
        throw new AIGatewayError('PROVIDER_UNAVAILABLE', `Provider unavailable: ${model.provider}`);
      }

      const estimate = this.costEstimator.estimate(request, model.id);

      return {
        routeId: routeId ?? 'direct',
        selectedModel: model.id,
        selectedProvider: model.provider,
        reason: 'Model explicitly specified',
        alternatives: [],
        estimatedCost: estimate.estimatedCostCents,
      };
    }

    // Get candidate models
    const candidates = this.getCandidateModels(request, criteria);
    if (candidates.length === 0) {
      throw new AIGatewayError('MODEL_NOT_FOUND', 'No suitable models found for request');
    }

    // Select based on strategy
    const selected = this.applyStrategy(strategy, candidates, request);

    this.emit(AI_GATEWAY_EVENTS.ROUTE_SELECTED, {
      routeId: routeId ?? 'default',
      strategy,
      selected: selected.selectedModel,
      candidates: candidates.map(m => m.id),
    });

    return selected;
  }

  /**
   * Get fallback model for a failed request
   */
  getFallback(
    failedModel: string,
    request: AIRequestOptions,
    routeId?: string
  ): RoutingDecision | undefined {
    const route = routeId ? this.routes.get(routeId) : undefined;

    // Check explicit fallback chain
    if (route?.fallbackChain) {
      const currentIndex = route.fallbackChain.indexOf(failedModel);
      if (currentIndex >= 0 && currentIndex < route.fallbackChain.length - 1) {
        const nextModel = route.fallbackChain[currentIndex + 1];
        const model = this.registry.getModel(nextModel);
        if (model && model.enabled) {
          const estimate = this.costEstimator.estimate(request, model.id);
          this.emit(AI_GATEWAY_EVENTS.ROUTE_FALLBACK, {
            failedModel,
            fallbackModel: nextModel,
          });
          return {
            routeId: routeId ?? 'fallback',
            selectedModel: model.id,
            selectedProvider: model.provider,
            reason: 'Fallback after failure',
            alternatives: [],
            estimatedCost: estimate.estimatedCostCents,
          };
        }
      }
    }

    // Auto-select alternative
    const candidates = this.getCandidateModels(request, route?.criteria ?? {})
      .filter(m => m.id !== failedModel);

    if (candidates.length === 0) {
      this.emit(AI_GATEWAY_EVENTS.ROUTE_FAILED, {
        failedModel,
        reason: 'No fallback models available',
      });
      return undefined;
    }

    const selected = this.applyStrategy('failover', candidates, request);

    this.emit(AI_GATEWAY_EVENTS.ROUTE_FALLBACK, {
      failedModel,
      fallbackModel: selected.selectedModel,
    });

    return selected;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private getCandidateModels(
    request: AIRequestOptions,
    criteria: ModelSelectionCriteria
  ): ModelInfo[] {
    let models = this.registry.getEnabledModels();

    // Filter by required capabilities
    const requiredCaps = this.inferRequiredCapabilities(request);
    if (requiredCaps.length > 0 || criteria.capabilities?.length) {
      const allCaps = [...new Set([...requiredCaps, ...(criteria.capabilities ?? [])])];
      models = models.filter(m => allCaps.every(cap => m.capabilities.includes(cap)));
    }

    // Filter by tier
    if (criteria.minTier) {
      models = models.filter(m => compareTiers(m.tier, criteria.minTier!) >= 0);
    }
    if (criteria.maxTier) {
      models = models.filter(m => compareTiers(m.tier, criteria.maxTier!) <= 0);
    }

    // Filter by cost
    if (criteria.maxCostPer1K) {
      models = models.filter(m => {
        const costPer1K = (m.costPerInputToken + m.costPerOutputToken) * 1000;
        return costPer1K <= criteria.maxCostPer1K!;
      });
    }

    // Filter by context window
    if (criteria.minContextWindow) {
      models = models.filter(m => m.contextWindow >= criteria.minContextWindow!);
    }

    // Filter by provider
    if (criteria.preferredProviders?.length) {
      const preferred = models.filter(m => criteria.preferredProviders!.includes(m.provider));
      if (preferred.length > 0) {
        models = preferred;
      }
    }
    if (criteria.excludeProviders?.length) {
      models = models.filter(m => !criteria.excludeProviders!.includes(m.provider));
    }

    // Filter by specific model IDs
    if (criteria.modelIds?.length) {
      models = models.filter(m => criteria.modelIds!.includes(m.id));
    }

    // Filter by provider availability
    models = models.filter(m => {
      const info = this.registry.getProviderInfo(m.provider);
      return info && info.status !== 'unavailable';
    });

    return models;
  }

  private inferRequiredCapabilities(request: AIRequestOptions): ProviderCapability[] {
    const caps: ProviderCapability[] = ['chat'];

    if (request.tools?.length) {
      caps.push('function_calling');
    }
    if (request.stream) {
      caps.push('streaming');
    }
    if (request.responseFormat?.type === 'json_object') {
      caps.push('json_mode');
    }

    // Check for image content
    for (const msg of request.messages) {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'image_url' || part.type === 'image_base64') {
            caps.push('image_analysis');
            break;
          }
        }
      }
    }

    return caps;
  }

  private applyStrategy(
    strategy: RoutingStrategy,
    candidates: ModelInfo[],
    request: AIRequestOptions
  ): RoutingDecision {
    let selected: ModelInfo;
    let reason: string;

    switch (strategy) {
      case 'cost_optimized':
        selected = this.selectCostOptimized(candidates, request);
        reason = 'Lowest cost model';
        break;

      case 'latency_optimized':
        selected = this.selectLatencyOptimized(candidates);
        reason = 'Lowest latency model';
        break;

      case 'quality_optimized':
        selected = this.selectQualityOptimized(candidates);
        reason = 'Highest quality model';
        break;

      case 'round_robin':
        selected = this.selectRoundRobin(candidates);
        reason = 'Round robin selection';
        break;

      case 'weighted':
        selected = this.selectWeighted(candidates);
        reason = 'Weighted random selection';
        break;

      case 'failover':
        selected = this.selectFailover(candidates);
        reason = 'Failover selection';
        break;

      default:
        selected = candidates[0];
        reason = 'Default selection';
    }

    const estimate = this.costEstimator.estimate(request, selected.id);
    const providerInfo = this.registry.getProviderInfo(selected.provider);

    return {
      routeId: 'auto',
      selectedModel: selected.id,
      selectedProvider: selected.provider,
      reason,
      alternatives: candidates.filter(m => m.id !== selected.id).map(m => m.id),
      estimatedCost: estimate.estimatedCostCents,
      estimatedLatency: providerInfo?.latencyMs,
    };
  }

  private selectCostOptimized(candidates: ModelInfo[], request: AIRequestOptions): ModelInfo {
    // Estimate cost for each candidate
    const withCosts = candidates.map(model => ({
      model,
      cost: this.costEstimator.estimate(request, model.id).estimatedCostCents,
    }));

    // Sort by cost ascending
    withCosts.sort((a, b) => a.cost - b.cost);

    return withCosts[0].model;
  }

  private selectLatencyOptimized(candidates: ModelInfo[]): ModelInfo {
    // Sort by known latency (unknown latency goes last)
    const withLatency = candidates.map(model => ({
      model,
      latency: this.registry.getProviderInfo(model.provider)?.latencyMs ?? Number.MAX_SAFE_INTEGER,
    }));

    withLatency.sort((a, b) => a.latency - b.latency);

    return withLatency[0].model;
  }

  private selectQualityOptimized(candidates: ModelInfo[]): ModelInfo {
    // Sort by tier (flagship first), then by cost (higher cost = assumed higher quality)
    const sorted = [...candidates].sort((a, b) => {
      const tierDiff = compareTiers(b.tier, a.tier);
      if (tierDiff !== 0) return tierDiff;
      return (b.costPerInputToken + b.costPerOutputToken) - (a.costPerInputToken + a.costPerOutputToken);
    });

    return sorted[0];
  }

  private selectRoundRobin(candidates: ModelInfo[]): ModelInfo {
    const index = this.roundRobinIndex % candidates.length;
    this.roundRobinIndex++;
    return candidates[index];
  }

  private selectWeighted(candidates: ModelInfo[]): ModelInfo {
    // Weight by provider priority (if set) and inverse cost
    const weights = candidates.map(model => {
      const providerConfig = this.registry.getProvider(model.provider);
      const priority = providerConfig?.priority ?? 1;
      const costWeight = 1 / (model.costPerInputToken + model.costPerOutputToken + 0.0001);
      return priority * costWeight;
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < candidates.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return candidates[i];
      }
    }

    return candidates[candidates.length - 1];
  }

  private selectFailover(candidates: ModelInfo[]): ModelInfo {
    // Prefer providers with best health status
    const withHealth = candidates.map(model => {
      const info = this.registry.getProviderInfo(model.provider);
      let healthScore = 0;
      switch (info?.status) {
        case 'available': healthScore = 3; break;
        case 'degraded': healthScore = 2; break;
        case 'rate_limited': healthScore = 1; break;
        default: healthScore = 0;
      }
      return { model, healthScore, errorCount: info?.errorCount ?? 0 };
    });

    withHealth.sort((a, b) => {
      const healthDiff = b.healthScore - a.healthScore;
      if (healthDiff !== 0) return healthDiff;
      return a.errorCount - b.errorCount;
    });

    return withHealth[0].model;
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createModelRouter(
  registry: ProviderRegistry,
  costEstimator: CostEstimator,
  config?: Partial<ModelRouterConfig>
): ModelRouter {
  return new ModelRouter(registry, costEstimator, config);
}
