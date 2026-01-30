/**
 * Base Enterprise Provider
 *
 * Abstract base class for enterprise feature providers
 */

import type { EventEmitter } from 'events';

// =============================================================================
// Provider Status
// =============================================================================

export type ProviderStatus = 'initialized' | 'connected' | 'disconnected' | 'error';

export interface ProviderHealth {
  status: ProviderStatus;
  lastCheck: number;
  latency?: number;
  error?: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// Provider Configuration
// =============================================================================

export interface BaseProviderConfig {
  /** Provider name for identification */
  name: string;
  /** Enable provider */
  enabled: boolean;
  /** Health check interval in ms */
  healthCheckInterval?: number;
  /** Request timeout in ms */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
  };
}

// =============================================================================
// Base Enterprise Provider
// =============================================================================

export abstract class BaseEnterpriseProvider<
  TConfig extends BaseProviderConfig = BaseProviderConfig
> {
  protected config: TConfig;
  protected status: ProviderStatus = 'initialized';
  protected lastError?: Error;
  protected healthCheckTimer?: ReturnType<typeof setInterval>;
  protected eventEmitter?: EventEmitter;

  constructor(config: TConfig, eventEmitter?: EventEmitter) {
    this.config = config;
    this.eventEmitter = eventEmitter;
  }

  /**
   * Get provider name
   */
  get name(): string {
    return this.config.name;
  }

  /**
   * Check if provider is enabled
   */
  get enabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get current provider status
   */
  getStatus(): ProviderStatus {
    return this.status;
  }

  /**
   * Initialize the provider
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      this.status = 'disconnected';
      return;
    }

    try {
      await this.doInitialize();
      this.status = 'connected';

      // Start health checks if configured
      if (this.config.healthCheckInterval && this.config.healthCheckInterval > 0) {
        this.startHealthChecks();
      }

      this.emit('provider:initialized', { provider: this.name });
    } catch (error) {
      this.status = 'error';
      this.lastError = error instanceof Error ? error : new Error(String(error));
      this.emit('provider:error', { provider: this.name, error: this.lastError.message });
      throw error;
    }
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    this.stopHealthChecks();

    try {
      await this.doShutdown();
      this.status = 'disconnected';
      this.emit('provider:shutdown', { provider: this.name });
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      this.emit('provider:error', { provider: this.name, error: this.lastError.message });
    }
  }

  /**
   * Get provider health
   */
  async getHealth(): Promise<ProviderHealth> {
    const startTime = Date.now();

    try {
      const details = await this.doHealthCheck();
      return {
        status: this.status,
        lastCheck: Date.now(),
        latency: Date.now() - startTime,
        details,
      };
    } catch (error) {
      return {
        status: 'error',
        lastCheck: Date.now(),
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute with retry logic
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    context?: string
  ): Promise<T> {
    const retryConfig = this.config.retry ?? {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retryConfig.maxRetries) {
          const delay = Math.min(
            retryConfig.baseDelay * Math.pow(2, attempt),
            retryConfig.maxDelay
          );

          this.emit('provider:retry', {
            provider: this.name,
            context,
            attempt: attempt + 1,
            delay,
            error: lastError.message,
          });

          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Execute with timeout
   */
  protected async withTimeout<T>(
    operation: Promise<T>,
    timeout?: number
  ): Promise<T> {
    const timeoutMs = timeout ?? this.config.timeout ?? 30000;

    return Promise.race([
      operation,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }

  /**
   * Start health check interval
   */
  protected startHealthChecks(): void {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(async () => {
      try {
        const health = await this.getHealth();
        if (health.status === 'error') {
          this.emit('provider:health:degraded', { provider: this.name, health });
        }
      } catch (error) {
        // Health check failed, but don't crash
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop health check interval
   */
  protected stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Emit event if emitter is available
   */
  protected emit(event: string, data: Record<string, unknown>): void {
    this.eventEmitter?.emit(event, data);
  }

  /**
   * Sleep helper
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // =============================================================================
  // Abstract methods to implement
  // =============================================================================

  /**
   * Provider-specific initialization
   */
  protected abstract doInitialize(): Promise<void>;

  /**
   * Provider-specific shutdown
   */
  protected abstract doShutdown(): Promise<void>;

  /**
   * Provider-specific health check
   */
  protected abstract doHealthCheck(): Promise<Record<string, unknown>>;
}

/**
 * Provider factory function type
 */
export type ProviderFactory<
  TConfig extends BaseProviderConfig,
  TProvider extends BaseEnterpriseProvider<TConfig>
> = (config: TConfig, eventEmitter?: EventEmitter) => TProvider;
