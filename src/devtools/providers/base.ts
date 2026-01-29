/**
 * Base DevTools Provider and Registry
 *
 * Abstract base class for all devtools providers and a registry
 * for managing provider instances.
 */

import type { DevToolsProviderConfig, DevToolsProviderResult } from '../types.js';

/**
 * Abstract base class for all devtools providers
 */
export abstract class BaseDevToolsProvider<TConfig extends DevToolsProviderConfig = DevToolsProviderConfig> {
  protected readonly config: TConfig;
  protected readonly token: string | undefined;
  protected initialized = false;
  protected rateLimitRemaining: number | undefined;
  protected rateLimitReset: number | undefined;

  constructor(config: TConfig) {
    this.config = config;
    if (config.tokenEnvVar) {
      this.token = process.env[config.tokenEnvVar];
    }
  }

  /**
   * Get the provider name
   */
  abstract get name(): string;

  /**
   * Get the provider type
   */
  abstract get type(): string;

  /**
   * Initialize the provider
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.token && this.requiresToken()) {
      throw new DevToolsProviderError(
        this.name,
        `Token not found. Set ${this.config.tokenEnvVar} environment variable.`
      );
    }

    await this.onInitialize();
    this.initialized = true;
  }

  /**
   * Check if the provider is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if the provider requires a token
   */
  protected requiresToken(): boolean {
    return true;
  }

  /**
   * Hook for subclass initialization
   */
  protected async onInitialize(): Promise<void> {
    // Override in subclasses if needed
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): { remaining?: number; resetAt?: number } {
    return {
      remaining: this.rateLimitRemaining,
      resetAt: this.rateLimitReset,
    };
  }

  /**
   * Check if we're rate limited
   */
  isRateLimited(): boolean {
    if (this.rateLimitRemaining === undefined) {
      return false;
    }
    return this.rateLimitRemaining <= 0;
  }

  /**
   * Make an HTTP request with common error handling and rate limit tracking
   */
  protected async fetch<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<DevToolsProviderResult<T>> {
    const timeout = this.config.timeout ?? 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> ?? {}),
      };

      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers,
      });

      clearTimeout(timeoutId);

      // Track rate limit headers
      this.updateRateLimitFromResponse(response);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`,
          rateLimitRemaining: this.rateLimitRemaining,
          rateLimitReset: this.rateLimitReset,
        };
      }

      const data = await response.json() as T;
      return {
        success: true,
        data,
        rateLimitRemaining: this.rateLimitRemaining,
        rateLimitReset: this.rateLimitReset,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: `Request timed out after ${timeout}ms`,
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update rate limit tracking from response headers
   */
  protected updateRateLimitFromResponse(response: Response): void {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');

    if (remaining) {
      this.rateLimitRemaining = parseInt(remaining, 10);
    }
    if (reset) {
      this.rateLimitReset = parseInt(reset, 10) * 1000; // Convert to ms
    }
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    this.initialized = false;
  }
}

/**
 * DevTools provider registry for managing multiple providers
 */
export class DevToolsProviderRegistry {
  private readonly providers = new Map<string, BaseDevToolsProvider>();
  private readonly defaultProviders = new Map<string, string>();

  /**
   * Register a provider
   */
  register<T extends BaseDevToolsProvider>(
    type: string,
    name: string,
    provider: T,
    isDefault = false
  ): void {
    const key = `${type}:${name}`;
    this.providers.set(key, provider);

    if (isDefault || !this.defaultProviders.has(type)) {
      this.defaultProviders.set(type, name);
    }
  }

  /**
   * Get a specific provider
   */
  get<T extends BaseDevToolsProvider>(type: string, name?: string): T | undefined {
    const providerName = name ?? this.defaultProviders.get(type);
    if (!providerName) {
      return undefined;
    }
    return this.providers.get(`${type}:${providerName}`) as T | undefined;
  }

  /**
   * Get the default provider for a type
   */
  getDefault<T extends BaseDevToolsProvider>(type: string): T | undefined {
    const name = this.defaultProviders.get(type);
    if (!name) {
      return undefined;
    }
    return this.get<T>(type, name);
  }

  /**
   * Check if a provider is registered
   */
  has(type: string, name?: string): boolean {
    if (name) {
      return this.providers.has(`${type}:${name}`);
    }
    return this.defaultProviders.has(type);
  }

  /**
   * List all providers of a type
   */
  list(type: string): string[] {
    const names: string[] = [];
    for (const key of this.providers.keys()) {
      if (key.startsWith(`${type}:`)) {
        names.push(key.split(':')[1]);
      }
    }
    return names;
  }

  /**
   * List all registered provider types
   */
  listTypes(): string[] {
    return Array.from(this.defaultProviders.keys());
  }

  /**
   * Initialize all registered providers
   */
  async initializeAll(): Promise<void> {
    const initPromises: Promise<void>[] = [];
    for (const provider of this.providers.values()) {
      initPromises.push(provider.initialize());
    }
    await Promise.all(initPromises);
  }

  /**
   * Shutdown all registered providers
   */
  async shutdownAll(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];
    for (const provider of this.providers.values()) {
      shutdownPromises.push(provider.shutdown());
    }
    await Promise.all(shutdownPromises);
  }

  /**
   * Remove a provider
   */
  remove(type: string, name: string): boolean {
    const key = `${type}:${name}`;
    const removed = this.providers.delete(key);

    if (this.defaultProviders.get(type) === name) {
      // Find a new default
      const remaining = this.list(type);
      if (remaining.length > 0) {
        this.defaultProviders.set(type, remaining[0]);
      } else {
        this.defaultProviders.delete(type);
      }
    }

    return removed;
  }

  /**
   * Clear all providers
   */
  clear(): void {
    this.providers.clear();
    this.defaultProviders.clear();
  }
}

/**
 * DevTools provider error class
 */
export class DevToolsProviderError extends Error {
  constructor(
    public readonly providerName: string,
    message: string,
    public readonly cause?: Error
  ) {
    super(`[${providerName}] ${message}`);
    this.name = 'DevToolsProviderError';
  }
}

// Global provider registry instance
let globalRegistry: DevToolsProviderRegistry | null = null;

/**
 * Get the global devtools provider registry
 */
export function getDevToolsProviderRegistry(): DevToolsProviderRegistry {
  if (!globalRegistry) {
    globalRegistry = new DevToolsProviderRegistry();
  }
  return globalRegistry;
}

/**
 * Initialize the global devtools provider registry
 */
export function initDevToolsProviderRegistry(): DevToolsProviderRegistry {
  globalRegistry = new DevToolsProviderRegistry();
  return globalRegistry;
}
