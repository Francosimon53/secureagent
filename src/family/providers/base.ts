/**
 * Family Provider Base Classes
 *
 * Abstract base classes and registry for family feature providers.
 */

import type { ProviderConfig, ProviderResult } from '../types.js';

// ============================================================================
// Base Provider
// ============================================================================

export abstract class BaseFamilyProvider<TConfig extends ProviderConfig = ProviderConfig> {
  protected readonly config: TConfig;
  protected readonly apiKey: string | undefined;
  protected initialized = false;

  constructor(config: TConfig) {
    this.config = config;
    if (config.apiKeyEnvVar) {
      this.apiKey = process.env[config.apiKeyEnvVar];
    }
  }

  abstract get name(): string;
  abstract get type(): string;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.onInitialize();
    this.initialized = true;
  }

  protected async onInitialize(): Promise<void> {
    // Override in subclasses if needed
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;
    await this.onShutdown();
    this.initialized = false;
  }

  protected async onShutdown(): Promise<void> {
    // Override in subclasses if needed
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`Provider ${this.name} not initialized. Call initialize() first.`);
    }
  }

  protected ensureApiKey(): void {
    if (!this.apiKey) {
      throw new Error(
        `API key not configured for provider ${this.name}. ` +
        `Set environment variable ${this.config.apiKeyEnvVar}.`
      );
    }
  }

  protected async fetch<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<ProviderResult<T>> {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json() as T;
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  protected isAllowedDomain(url: string, allowedDomains: string[]): boolean {
    try {
      const urlObj = new URL(url);
      return allowedDomains.some(domain =>
        urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Provider Registry
// ============================================================================

export class FamilyProviderRegistry {
  private readonly providers = new Map<string, BaseFamilyProvider>();
  private readonly defaultProviders = new Map<string, string>();

  /**
   * Register a provider
   */
  register<T extends BaseFamilyProvider>(
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
  get<T extends BaseFamilyProvider>(type: string, name?: string): T | undefined {
    const providerName = name ?? this.defaultProviders.get(type);
    if (!providerName) return undefined;

    const key = `${type}:${providerName}`;
    return this.providers.get(key) as T | undefined;
  }

  /**
   * Get the default provider for a type
   */
  getDefault<T extends BaseFamilyProvider>(type: string): T | undefined {
    return this.get<T>(type);
  }

  /**
   * Check if a provider exists
   */
  has(type: string, name?: string): boolean {
    if (name) {
      return this.providers.has(`${type}:${name}`);
    }
    return this.defaultProviders.has(type);
  }

  /**
   * List all providers of a given type
   */
  list(type: string): string[] {
    const providers: string[] = [];
    for (const key of this.providers.keys()) {
      if (key.startsWith(`${type}:`)) {
        providers.push(key.split(':')[1]);
      }
    }
    return providers;
  }

  /**
   * List all provider types
   */
  listTypes(): string[] {
    return Array.from(this.defaultProviders.keys());
  }

  /**
   * Initialize all registered providers
   */
  async initializeAll(): Promise<void> {
    const promises = Array.from(this.providers.values()).map(p => p.initialize());
    await Promise.all(promises);
  }

  /**
   * Shutdown all registered providers
   */
  async shutdownAll(): Promise<void> {
    const promises = Array.from(this.providers.values()).map(p => p.shutdown());
    await Promise.all(promises);
  }

  /**
   * Unregister a provider
   */
  unregister(type: string, name: string): boolean {
    const key = `${type}:${name}`;
    const deleted = this.providers.delete(key);

    // If this was the default, find a new default
    if (deleted && this.defaultProviders.get(type) === name) {
      const remaining = this.list(type);
      if (remaining.length > 0) {
        this.defaultProviders.set(type, remaining[0]);
      } else {
        this.defaultProviders.delete(type);
      }
    }

    return deleted;
  }

  /**
   * Clear all providers
   */
  clear(): void {
    this.providers.clear();
    this.defaultProviders.clear();
  }
}

// ============================================================================
// Global Registry
// ============================================================================

let globalFamilyRegistry: FamilyProviderRegistry | null = null;

export function getFamilyProviderRegistry(): FamilyProviderRegistry {
  if (!globalFamilyRegistry) {
    throw new Error('Family provider registry not initialized. Call initFamilyProviderRegistry() first.');
  }
  return globalFamilyRegistry;
}

export function initFamilyProviderRegistry(): FamilyProviderRegistry {
  if (!globalFamilyRegistry) {
    globalFamilyRegistry = new FamilyProviderRegistry();
  }
  return globalFamilyRegistry;
}

export function resetFamilyProviderRegistry(): void {
  if (globalFamilyRegistry) {
    globalFamilyRegistry.clear();
    globalFamilyRegistry = null;
  }
}
