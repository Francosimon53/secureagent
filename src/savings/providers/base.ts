/**
 * Base Savings Provider and Registry
 *
 * Abstract base class for all savings providers and a registry
 * for managing provider instances.
 */

import type { SavingsProviderConfig, SavingsProviderResult } from '../types.js';

/**
 * Abstract base class for all savings providers
 */
export abstract class BaseSavingsProvider<TConfig extends SavingsProviderConfig = SavingsProviderConfig> {
  protected readonly config: TConfig;
  protected readonly apiKey: string | undefined;
  protected initialized = false;

  constructor(config: TConfig) {
    this.config = config;
    this.apiKey = config.apiKeyEnvVar ? process.env[config.apiKeyEnvVar] : undefined;
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

    if (!this.apiKey && this.requiresApiKey()) {
      throw new SavingsProviderError(
        this.name,
        `API key not found. Set ${this.config.apiKeyEnvVar} environment variable.`
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
   * Check if the provider requires an API key
   */
  protected requiresApiKey(): boolean {
    return !!this.config.apiKeyEnvVar;
  }

  /**
   * Hook for subclass initialization
   */
  protected async onInitialize(): Promise<void> {
    // Override in subclasses if needed
  }

  /**
   * Make an HTTP request with common error handling
   */
  protected async fetch<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<SavingsProviderResult<T>> {
    const timeout = this.config.timeout ?? 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      const data = await response.json() as T;
      return {
        success: true,
        data,
        cached: false,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: `Request timed out after ${timeout}ms`,
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        cached: false,
        fetchedAt: Date.now(),
      };
    }
  }

  /**
   * Validate that a URL is in the allowed domains list
   */
  protected isAllowedDomain(url: string, allowedDomains: string[]): boolean {
    try {
      const parsedUrl = new URL(url);
      return allowedDomains.some(domain =>
        parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
      );
    } catch {
      return false;
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
 * Savings provider registry for managing multiple providers
 */
export class SavingsProviderRegistry {
  private readonly providers = new Map<string, BaseSavingsProvider>();
  private readonly defaultProviders = new Map<string, string>();

  /**
   * Register a provider
   */
  register<T extends BaseSavingsProvider>(
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
  get<T extends BaseSavingsProvider>(type: string, name?: string): T | undefined {
    const providerName = name ?? this.defaultProviders.get(type);
    if (!providerName) {
      return undefined;
    }
    return this.providers.get(`${type}:${providerName}`) as T | undefined;
  }

  /**
   * Get the default provider for a type
   */
  getDefault<T extends BaseSavingsProvider>(type: string): T | undefined {
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
 * Savings provider error class
 */
export class SavingsProviderError extends Error {
  constructor(
    public readonly providerName: string,
    message: string,
    public readonly cause?: Error
  ) {
    super(`[${providerName}] ${message}`);
    this.name = 'SavingsProviderError';
  }
}

// Global savings provider registry instance
let globalSavingsRegistry: SavingsProviderRegistry | null = null;

/**
 * Get the global savings provider registry
 */
export function getSavingsProviderRegistry(): SavingsProviderRegistry {
  if (!globalSavingsRegistry) {
    globalSavingsRegistry = new SavingsProviderRegistry();
  }
  return globalSavingsRegistry;
}

/**
 * Initialize the global savings provider registry
 */
export function initSavingsProviderRegistry(): SavingsProviderRegistry {
  globalSavingsRegistry = new SavingsProviderRegistry();
  return globalSavingsRegistry;
}
