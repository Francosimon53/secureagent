/**
 * Provider Registry
 *
 * Manages AI provider configurations, health status, and model registration
 */

import type {
  AIProvider,
  ProviderConfig,
  ProviderInfo,
  ProviderStatus,
  ProviderCapability,
  ModelInfo,
} from './types.js';
import { AIGatewayError } from './types.js';
import {
  AI_GATEWAY_EVENTS,
  AI_GATEWAY_DEFAULTS,
  PROVIDER_CAPABILITIES,
  DEFAULT_MODELS,
} from './constants.js';

// =============================================================================
// Provider Registry
// =============================================================================

export interface ProviderRegistryConfig {
  healthCheckIntervalMs: number;
  errorThreshold: number;
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: ProviderRegistryConfig = {
  healthCheckIntervalMs: AI_GATEWAY_DEFAULTS.HEALTH_CHECK_INTERVAL_MS,
  errorThreshold: AI_GATEWAY_DEFAULTS.ERROR_THRESHOLD,
};

export class ProviderRegistry {
  private readonly config: ProviderRegistryConfig;
  private readonly providers = new Map<AIProvider, ProviderConfig>();
  private readonly providerInfo = new Map<AIProvider, ProviderInfo>();
  private readonly models = new Map<string, ModelInfo>();
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(config?: Partial<ProviderRegistryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Register default models
    for (const model of DEFAULT_MODELS) {
      this.models.set(model.id, model);
    }
  }

  /**
   * Register a provider
   */
  registerProvider(config: ProviderConfig): void {
    const provider = config.provider;

    // Validate provider
    if (!PROVIDER_CAPABILITIES[provider]) {
      throw new AIGatewayError('VALIDATION_ERROR', `Unknown provider: ${provider}`);
    }

    this.providers.set(provider, config);

    // Initialize provider info
    this.providerInfo.set(provider, {
      provider,
      status: config.enabled !== false ? 'unknown' : 'unavailable',
      capabilities: PROVIDER_CAPABILITIES[provider],
      models: this.getModelsForProvider(provider).map(m => m.id),
      errorCount: 0,
      successCount: 0,
    });

    this.emit(AI_GATEWAY_EVENTS.PROVIDER_REGISTERED, { provider, config: { ...config, apiKey: '[REDACTED]' } });
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(provider: AIProvider): boolean {
    const existed = this.providers.delete(provider);
    this.providerInfo.delete(provider);
    return existed;
  }

  /**
   * Get provider config
   */
  getProvider(provider: AIProvider): ProviderConfig | undefined {
    return this.providers.get(provider);
  }

  /**
   * Get provider info
   */
  getProviderInfo(provider: AIProvider): ProviderInfo | undefined {
    return this.providerInfo.get(provider);
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all provider info
   */
  getAllProviderInfo(): ProviderInfo[] {
    return Array.from(this.providerInfo.values());
  }

  /**
   * Get available providers (enabled and not unavailable)
   */
  getAvailableProviders(): AIProvider[] {
    return Array.from(this.providers.entries())
      .filter(([provider, config]) => {
        if (config.enabled === false) return false;
        const info = this.providerInfo.get(provider);
        return info && info.status !== 'unavailable';
      })
      .map(([provider]) => provider);
  }

  /**
   * Check if a provider has a capability
   */
  hasCapability(provider: AIProvider, capability: ProviderCapability): boolean {
    const info = this.providerInfo.get(provider);
    return info?.capabilities.includes(capability) ?? false;
  }

  /**
   * Update provider status
   */
  updateProviderStatus(provider: AIProvider, status: ProviderStatus, latencyMs?: number): void {
    const info = this.providerInfo.get(provider);
    if (!info) return;

    const oldStatus = info.status;
    info.status = status;
    info.latencyMs = latencyMs;
    info.lastChecked = Date.now();

    if (oldStatus !== status) {
      this.emit(AI_GATEWAY_EVENTS.PROVIDER_STATUS_CHANGED, {
        provider,
        oldStatus,
        newStatus: status,
      });
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(provider: AIProvider, latencyMs: number): void {
    const info = this.providerInfo.get(provider);
    if (!info) return;

    info.successCount++;
    info.errorCount = Math.max(0, info.errorCount - 1);
    info.latencyMs = latencyMs;

    if (info.status === 'degraded' && info.errorCount === 0) {
      this.updateProviderStatus(provider, 'available', latencyMs);
    }
  }

  /**
   * Record a failed request
   */
  recordError(provider: AIProvider, isRateLimited: boolean = false): void {
    const info = this.providerInfo.get(provider);
    if (!info) return;

    info.errorCount++;

    if (isRateLimited) {
      this.updateProviderStatus(provider, 'rate_limited');
    } else if (info.errorCount >= this.config.errorThreshold) {
      this.updateProviderStatus(provider, 'unavailable');
    } else if (info.errorCount >= this.config.errorThreshold / 2) {
      this.updateProviderStatus(provider, 'degraded');
    }
  }

  // ==========================================================================
  // Model Management
  // ==========================================================================

  /**
   * Register a model
   */
  registerModel(model: ModelInfo): void {
    this.models.set(model.id, model);

    // Update provider's model list
    const info = this.providerInfo.get(model.provider);
    if (info && !info.models.includes(model.id)) {
      info.models.push(model.id);
    }
  }

  /**
   * Unregister a model
   */
  unregisterModel(modelId: string): boolean {
    const model = this.models.get(modelId);
    if (!model) return false;

    this.models.delete(modelId);

    // Update provider's model list
    const info = this.providerInfo.get(model.provider);
    if (info) {
      info.models = info.models.filter(id => id !== modelId);
    }

    return true;
  }

  /**
   * Get a model
   */
  getModel(modelId: string): ModelInfo | undefined {
    return this.models.get(modelId);
  }

  /**
   * Get all models
   */
  getAllModels(): ModelInfo[] {
    return Array.from(this.models.values());
  }

  /**
   * Get models for a provider
   */
  getModelsForProvider(provider: AIProvider): ModelInfo[] {
    return Array.from(this.models.values()).filter(m => m.provider === provider);
  }

  /**
   * Get enabled models
   */
  getEnabledModels(): ModelInfo[] {
    return Array.from(this.models.values()).filter(m => {
      if (!m.enabled) return false;
      const providerConfig = this.providers.get(m.provider);
      return providerConfig?.enabled !== false;
    });
  }

  /**
   * Get models by capability
   */
  getModelsByCapability(capability: ProviderCapability): ModelInfo[] {
    return this.getEnabledModels().filter(m => m.capabilities.includes(capability));
  }

  /**
   * Find the best model for a capability
   */
  findBestModel(
    capability: ProviderCapability,
    options?: {
      minTier?: string;
      maxTier?: string;
      preferredProvider?: AIProvider;
      maxCostPer1K?: number;
    }
  ): ModelInfo | undefined {
    let models = this.getModelsByCapability(capability);

    if (options?.preferredProvider) {
      const preferred = models.filter(m => m.provider === options.preferredProvider);
      if (preferred.length > 0) {
        models = preferred;
      }
    }

    if (options?.maxCostPer1K) {
      const maxCost = options.maxCostPer1K;
      models = models.filter(m => (m.costPerInputToken + m.costPerOutputToken) * 1000 <= maxCost);
    }

    // Sort by tier (highest first), then by cost (lowest first)
    models.sort((a, b) => {
      const tierOrder = ['flagship', 'premium', 'standard', 'economy'];
      const tierDiff = tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier);
      if (tierDiff !== 0) return tierDiff;
      return (a.costPerInputToken + a.costPerOutputToken) - (b.costPerInputToken + b.costPerOutputToken);
    });

    return models[0];
  }

  // ==========================================================================
  // Health Checking
  // ==========================================================================

  /**
   * Start health checking
   */
  startHealthChecks(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(
      () => this.runHealthChecks(),
      this.config.healthCheckIntervalMs
    );
  }

  /**
   * Stop health checking
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Run health checks on all providers
   */
  async runHealthChecks(): Promise<void> {
    const providers = this.getAvailableProviders();

    for (const provider of providers) {
      const startTime = Date.now();
      try {
        // Simple health check - just verify the provider is reachable
        // In a real implementation, this would make a test API call
        const info = this.providerInfo.get(provider);
        if (info) {
          const latencyMs = Date.now() - startTime;
          this.updateProviderStatus(provider, 'available', latencyMs);
          this.emit(AI_GATEWAY_EVENTS.PROVIDER_HEALTH_CHECK, {
            provider,
            status: 'available',
            latencyMs,
          });
        }
      } catch {
        this.recordError(provider);
        this.emit(AI_GATEWAY_EVENTS.PROVIDER_HEALTH_CHECK, {
          provider,
          status: 'unavailable',
          error: 'Health check failed',
        });
      }
    }
  }

  /**
   * Reset error count for a provider
   */
  resetErrors(provider: AIProvider): void {
    const info = this.providerInfo.get(provider);
    if (info) {
      info.errorCount = 0;
      if (info.status === 'unavailable' || info.status === 'degraded') {
        this.updateProviderStatus(provider, 'unknown');
      }
    }
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createProviderRegistry(
  config?: Partial<ProviderRegistryConfig>
): ProviderRegistry {
  return new ProviderRegistry(config);
}
