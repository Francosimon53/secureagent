/**
 * Content Creator Suite - Base Provider
 *
 * Abstract base class for all content providers with rate limiting,
 * timeout handling, and domain validation.
 */

import type { ContentProviderConfig, ContentProviderResult } from '../types.js';
import { ERROR_CODES, CONTENT_DEFAULTS } from '../constants.js';

// =============================================================================
// Provider Error Class
// =============================================================================

export class ContentProviderError extends Error {
  constructor(
    public readonly providerName: string,
    public readonly code: string,
    message: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(`[${providerName}] ${message}`);
    this.name = 'ContentProviderError';
  }
}

// =============================================================================
// Rate Limiter
// =============================================================================

interface RateLimitState {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number;
}

export class RateLimiter {
  private state: RateLimitState;

  constructor(maxRequestsPerMinute: number) {
    this.state = {
      tokens: maxRequestsPerMinute,
      lastRefill: Date.now(),
      maxTokens: maxRequestsPerMinute,
      refillRate: maxRequestsPerMinute / 60000, // tokens per millisecond
    };
  }

  async acquire(): Promise<void> {
    this.refillTokens();

    if (this.state.tokens < 1) {
      const waitTime = Math.ceil((1 - this.state.tokens) / this.state.refillRate);
      await this.sleep(waitTime);
      this.refillTokens();
    }

    this.state.tokens -= 1;
  }

  canProceed(): boolean {
    this.refillTokens();
    return this.state.tokens >= 1;
  }

  getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.state.tokens);
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.state.lastRefill;
    const tokensToAdd = elapsed * this.state.refillRate;

    this.state.tokens = Math.min(this.state.maxTokens, this.state.tokens + tokensToAdd);
    this.state.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Abstract Base Provider
// =============================================================================

export abstract class BaseContentProvider<TConfig extends ContentProviderConfig = ContentProviderConfig> {
  protected readonly config: TConfig;
  protected readonly apiKey: string | undefined;
  protected initialized = false;
  protected rateLimiter: RateLimiter;

  constructor(config: TConfig) {
    this.config = config;
    this.apiKey = config.apiKeyEnvVar ? process.env[config.apiKeyEnvVar] : undefined;
    this.rateLimiter = new RateLimiter(config.rateLimitPerMinute ?? CONTENT_DEFAULTS.AI_GENERATION_RATE_LIMIT);
  }

  /**
   * Provider name for identification
   */
  abstract get name(): string;

  /**
   * Provider type (e.g., 'social', 'ai', 'blog', 'trends')
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
      throw new ContentProviderError(
        this.name,
        ERROR_CODES.PROVIDER_AUTH_FAILED,
        `API key not found in environment variable: ${this.config.apiKeyEnvVar}`
      );
    }

    await this.onInitialize();
    this.initialized = true;
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    await this.onShutdown();
    this.initialized = false;
  }

  /**
   * Check if provider is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if this provider requires an API key
   */
  protected requiresApiKey(): boolean {
    return true;
  }

  /**
   * Custom initialization logic
   */
  protected async onInitialize(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Custom shutdown logic
   */
  protected async onShutdown(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Make an authenticated HTTP request with rate limiting and timeout
   */
  protected async fetch<T>(
    url: string,
    options?: RequestInit,
    allowedDomains?: string[]
  ): Promise<ContentProviderResult<T>> {
    // Validate domain if allowedDomains provided
    if (allowedDomains && !this.isAllowedDomain(url, allowedDomains)) {
      return {
        success: false,
        error: `Domain not allowed: ${new URL(url).hostname}`,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    // Apply rate limiting
    await this.rateLimiter.acquire();

    const timeout = this.config.timeout ?? CONTENT_DEFAULTS.API_TIMEOUT;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
          ...options?.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`,
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
          error: `Request timeout after ${timeout}ms`,
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
   * Make a request with automatic retries
   */
  protected async fetchWithRetry<T>(
    url: string,
    options?: RequestInit,
    allowedDomains?: string[]
  ): Promise<ContentProviderResult<T>> {
    const maxRetries = this.config.maxRetries ?? 3;
    let lastResult: ContentProviderResult<T> | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      lastResult = await this.fetch<T>(url, options, allowedDomains);

      if (lastResult.success) {
        return lastResult;
      }

      // Don't retry on client errors (4xx)
      if (lastResult.error.includes('HTTP 4')) {
        return lastResult;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await this.sleep(delay);
      }
    }

    return lastResult!;
  }

  /**
   * Get authentication headers for requests
   */
  protected getAuthHeaders(): Record<string, string> {
    if (!this.apiKey) {
      return {};
    }
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  /**
   * Check if a URL's domain is in the allowed list
   */
  protected isAllowedDomain(url: string, allowedDomains: string[]): boolean {
    try {
      const parsedUrl = new URL(url);
      return allowedDomains.some(
        domain =>
          parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Provider Registry
// =============================================================================

export class ContentProviderRegistry {
  private readonly providers = new Map<string, BaseContentProvider>();
  private readonly defaultProviders = new Map<string, string>();

  /**
   * Register a provider
   */
  register<T extends BaseContentProvider>(
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
   * Get a specific provider by type and name
   */
  get<T extends BaseContentProvider>(type: string, name?: string): T | undefined {
    const providerName = name ?? this.defaultProviders.get(type);
    if (!providerName) {
      return undefined;
    }
    return this.providers.get(`${type}:${providerName}`) as T | undefined;
  }

  /**
   * Get the default provider for a type
   */
  getDefault<T extends BaseContentProvider>(type: string): T | undefined {
    const name = this.defaultProviders.get(type);
    if (!name) {
      return undefined;
    }
    return this.get<T>(type, name);
  }

  /**
   * Get all providers of a type
   */
  getAllOfType<T extends BaseContentProvider>(type: string): T[] {
    const result: T[] = [];
    for (const [key, provider] of this.providers) {
      if (key.startsWith(`${type}:`)) {
        result.push(provider as T);
      }
    }
    return result;
  }

  /**
   * Get all registered provider names
   */
  getRegisteredProviders(): { type: string; name: string }[] {
    return Array.from(this.providers.keys()).map(key => {
      const [type, name] = key.split(':');
      return { type, name };
    });
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
   * Initialize all providers
   */
  async initializeAll(): Promise<void> {
    const initPromises = Array.from(this.providers.values()).map(p =>
      p.initialize().catch(err => {
        console.warn(`Failed to initialize provider ${p.name}:`, err.message);
      })
    );
    await Promise.all(initPromises);
  }

  /**
   * Shutdown all providers
   */
  async shutdownAll(): Promise<void> {
    const shutdownPromises = Array.from(this.providers.values()).map(p =>
      p.shutdown().catch(err => {
        console.warn(`Failed to shutdown provider ${p.name}:`, err.message);
      })
    );
    await Promise.all(shutdownPromises);
  }

  /**
   * Unregister a provider
   */
  unregister(type: string, name: string): boolean {
    const key = `${type}:${name}`;
    const existed = this.providers.has(key);
    this.providers.delete(key);

    // If this was the default, pick another default
    if (this.defaultProviders.get(type) === name) {
      const remaining = this.getAllOfType(type);
      if (remaining.length > 0) {
        const newDefault = Array.from(this.providers.keys()).find(k =>
          k.startsWith(`${type}:`)
        );
        if (newDefault) {
          this.defaultProviders.set(type, newDefault.split(':')[1]);
        }
      } else {
        this.defaultProviders.delete(type);
      }
    }

    return existed;
  }

  /**
   * Clear all providers
   */
  clear(): void {
    this.providers.clear();
    this.defaultProviders.clear();
  }
}

// =============================================================================
// Global Registry Instance
// =============================================================================

let globalRegistry: ContentProviderRegistry | null = null;

export function getContentProviderRegistry(): ContentProviderRegistry {
  if (!globalRegistry) {
    globalRegistry = new ContentProviderRegistry();
  }
  return globalRegistry;
}

export function initContentProviderRegistry(): ContentProviderRegistry {
  globalRegistry = new ContentProviderRegistry();
  return globalRegistry;
}

export function resetContentProviderRegistry(): void {
  if (globalRegistry) {
    globalRegistry.clear();
  }
  globalRegistry = null;
}
