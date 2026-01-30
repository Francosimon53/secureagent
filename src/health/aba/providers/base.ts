/**
 * Base Health Provider
 *
 * Abstract base class for all healthcare providers with HIPAA-compliant
 * audit logging, rate limiting, retry logic, and error handling.
 */

import { EventEmitter } from 'events';
import { HEALTH_EVENTS, HEALTH_ERROR_CODES, HEALTH_DEFAULTS } from '../constants.js';
import type { HealthAuditLog, AccessLevel, AuditAction, ResourceType } from '../types.js';

// =============================================================================
// Error Classes
// =============================================================================

export class HealthProviderError extends Error {
  constructor(
    public readonly providerName: string,
    public readonly code: string,
    message: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(`[${providerName}] ${message}`);
    this.name = 'HealthProviderError';
  }
}

// =============================================================================
// Rate Limiter
// =============================================================================

interface RateLimitState {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per millisecond
}

export class RateLimiter {
  private state: RateLimitState;

  constructor(maxRequestsPerMinute: number) {
    this.state = {
      tokens: maxRequestsPerMinute,
      lastRefill: Date.now(),
      maxTokens: maxRequestsPerMinute,
      refillRate: maxRequestsPerMinute / 60000,
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

  getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.state.tokens);
  }

  getWaitTimeMs(): number {
    this.refillTokens();
    if (this.state.tokens >= 1) {
      return 0;
    }
    return Math.ceil((1 - this.state.tokens) / this.state.refillRate);
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.state.lastRefill;
    const tokensToAdd = elapsed * this.state.refillRate;
    this.state.tokens = Math.min(this.state.maxTokens, this.state.tokens + tokensToAdd);
    this.state.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Provider Result Type
// =============================================================================

export interface HealthProviderResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  retryable?: boolean;
  cached?: boolean;
  fetchedAt: number;
  rateLimit?: {
    remaining: number;
    resetAt: number;
  };
}

// =============================================================================
// Provider Configuration
// =============================================================================

export interface HealthProviderConfig {
  apiKeyEnvVar?: string;
  apiSecretEnvVar?: string;
  rateLimitPerMinute?: number;
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  retryMultiplier?: number;
  retryMaxDelayMs?: number;
  sandbox?: boolean;
}

// =============================================================================
// Audit Context
// =============================================================================

export interface AuditContext {
  actorId: string;
  actorName?: string;
  actorRole: AccessLevel;
  sessionId?: string;
  ipAddress?: string;
  patientId?: string;
}

// =============================================================================
// Base Provider
// =============================================================================

export abstract class BaseHealthProvider<
  TConfig extends HealthProviderConfig = HealthProviderConfig
> extends EventEmitter {
  protected readonly config: TConfig;
  protected readonly apiKey: string | undefined;
  protected readonly apiSecret: string | undefined;
  protected initialized = false;
  protected rateLimiter: RateLimiter;
  protected allowedDomains: string[] = [];

  constructor(config: TConfig, allowedDomains?: string[]) {
    super();
    this.config = config;
    this.apiKey = config.apiKeyEnvVar ? process.env[config.apiKeyEnvVar] : undefined;
    this.apiSecret = config.apiSecretEnvVar ? process.env[config.apiSecretEnvVar] : undefined;
    this.rateLimiter = new RateLimiter(
      config.rateLimitPerMinute ?? HEALTH_DEFAULTS.RATE_LIMIT_PER_MINUTE
    );
    this.allowedDomains = allowedDomains ?? [];
  }

  /**
   * Provider name for identification and logging
   */
  abstract get name(): string;

  /**
   * Provider type (notification, insurance, ehr, etc.)
   */
  abstract get type(): string;

  /**
   * Whether this provider requires API authentication
   */
  protected requiresApiKey(): boolean {
    return true;
  }

  /**
   * Whether this provider requires API secret
   */
  protected requiresApiSecret(): boolean {
    return false;
  }

  /**
   * Check if provider is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Initialize the provider
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.requiresApiKey() && !this.apiKey) {
      throw new HealthProviderError(
        this.name,
        HEALTH_ERROR_CODES.PROVIDER_AUTH_FAILED,
        `API key not found in environment variable: ${this.config.apiKeyEnvVar}`
      );
    }

    if (this.requiresApiSecret() && !this.apiSecret) {
      throw new HealthProviderError(
        this.name,
        HEALTH_ERROR_CODES.PROVIDER_AUTH_FAILED,
        `API secret not found in environment variable: ${this.config.apiSecretEnvVar}`
      );
    }

    await this.onInitialize();
    this.initialized = true;

    this.emit(HEALTH_EVENTS.PROVIDER_CONNECTED, {
      provider: this.name,
      type: this.type,
      timestamp: Date.now(),
    });
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    await this.onShutdown();
    this.initialized = false;

    this.emit(HEALTH_EVENTS.PROVIDER_DISCONNECTED, {
      provider: this.name,
      type: this.type,
      timestamp: Date.now(),
    });
  }

  /**
   * Custom initialization logic for subclasses
   */
  protected async onInitialize(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Custom shutdown logic for subclasses
   */
  protected async onShutdown(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Get authentication headers for API requests
   */
  protected getAuthHeaders(): Record<string, string> {
    // Override in subclasses for custom auth
    return {};
  }

  /**
   * Check if a URL's domain is allowed
   */
  protected isAllowedDomain(url: string): boolean {
    if (this.allowedDomains.length === 0) {
      return true;
    }

    try {
      const hostname = new URL(url).hostname;
      return this.allowedDomains.some((domain) => {
        return hostname === domain || hostname.endsWith(`.${domain}`);
      });
    } catch {
      return false;
    }
  }

  /**
   * Create HIPAA audit log entry
   */
  protected createAuditLog(
    context: AuditContext,
    action: AuditAction,
    resource: {
      type: ResourceType;
      id: string;
      description?: string;
    },
    outcome: 'success' | 'failure' | 'denied',
    details?: {
      phiAccessed?: boolean;
      fieldsAccessed?: string[];
      changes?: Array<{ field: string; oldValue?: unknown; newValue?: unknown }>;
      denialReason?: string;
      metadata?: Record<string, unknown>;
    }
  ): HealthAuditLog {
    const auditLog: HealthAuditLog = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      actor: {
        userId: context.actorId,
        userName: context.actorName,
        role: context.actorRole,
        sessionId: context.sessionId,
        ipAddressHash: context.ipAddress
          ? this.hashIpAddress(context.ipAddress)
          : 'unknown',
      },
      action,
      resource: {
        type: resource.type,
        id: resource.id,
        patientId: context.patientId,
        description: resource.description,
      },
      accessMethod: 'api',
      outcome,
      phiAccessed: details?.phiAccessed ?? false,
      fieldsAccessed: details?.fieldsAccessed,
      changes: details?.changes,
      denialReason: details?.denialReason,
      metadata: details?.metadata,
    };

    // Emit audit event
    this.emit(HEALTH_EVENTS.AUDIT_LOG_CREATED, auditLog);

    return auditLog;
  }

  /**
   * Hash IP address for privacy (HIPAA minimum necessary)
   */
  private hashIpAddress(ip: string): string {
    // Simple hash for privacy - in production use proper crypto
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      const char = ip.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Make an HTTP fetch request with rate limiting, retries, and error handling
   */
  protected async fetch<T>(
    url: string,
    options?: RequestInit,
    auditContext?: AuditContext
  ): Promise<HealthProviderResult<T>> {
    // Domain validation
    if (!this.isAllowedDomain(url)) {
      const hostname = new URL(url).hostname;

      if (auditContext) {
        this.createAuditLog(
          auditContext,
          'read',
          { type: 'user', id: 'external', description: `Domain: ${hostname}` },
          'denied',
          { denialReason: 'Domain not in allowlist' }
        );
      }

      return {
        success: false,
        error: `Domain not allowed: ${hostname}`,
        errorCode: HEALTH_ERROR_CODES.DOMAIN_NOT_ALLOWED,
        retryable: false,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const maxAttempts = this.config.retryAttempts ?? HEALTH_DEFAULTS.RETRY_ATTEMPTS;
    const baseDelay = this.config.retryDelayMs ?? HEALTH_DEFAULTS.RETRY_DELAY_MS;
    const multiplier = this.config.retryMultiplier ?? HEALTH_DEFAULTS.RETRY_MULTIPLIER;
    const maxDelay = this.config.retryMaxDelayMs ?? HEALTH_DEFAULTS.RETRY_MAX_DELAY_MS;
    const timeout = this.config.timeout ?? HEALTH_DEFAULTS.API_TIMEOUT_MS;

    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;

      try {
        // Rate limiting
        await this.rateLimiter.acquire();

        // Timeout handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              ...this.getAuthHeaders(),
              ...options?.headers,
            },
          });

          clearTimeout(timeoutId);

          // Extract rate limit info from headers
          const rateLimit = this.extractRateLimitInfo(response.headers);

          // Handle HTTP errors
          if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            const retryable = response.status >= 500 || response.status === 429;

            if (retryable && attempt < maxAttempts) {
              const delay = Math.min(
                baseDelay * Math.pow(multiplier, attempt - 1) + Math.random() * 1000,
                maxDelay
              );
              await this.sleep(delay);
              continue;
            }

            return {
              success: false,
              error: `HTTP ${response.status}: ${errorBody || response.statusText}`,
              errorCode: this.mapHttpStatusToErrorCode(response.status),
              retryable,
              cached: false,
              fetchedAt: Date.now(),
              rateLimit,
            };
          }

          // Parse response
          const data = (await response.json()) as T;

          return {
            success: true,
            data,
            cached: false,
            fetchedAt: Date.now(),
            rateLimit,
          };
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (error) {
        lastError = error as Error;

        // Handle abort (timeout)
        if (lastError.name === 'AbortError') {
          if (attempt < maxAttempts) {
            const delay = Math.min(baseDelay * Math.pow(multiplier, attempt - 1), maxDelay);
            await this.sleep(delay);
            continue;
          }

          return {
            success: false,
            error: `Request timeout after ${timeout}ms`,
            errorCode: HEALTH_ERROR_CODES.PROVIDER_TIMEOUT,
            retryable: true,
            cached: false,
            fetchedAt: Date.now(),
          };
        }

        // Network errors are retryable
        if (attempt < maxAttempts) {
          const delay = Math.min(baseDelay * Math.pow(multiplier, attempt - 1), maxDelay);
          await this.sleep(delay);
          continue;
        }
      }
    }

    // All retries exhausted
    this.emit(HEALTH_EVENTS.PROVIDER_ERROR, {
      provider: this.name,
      error: lastError?.message ?? 'Unknown error',
      timestamp: Date.now(),
    });

    return {
      success: false,
      error: lastError?.message ?? 'Request failed after retries',
      errorCode: HEALTH_ERROR_CODES.PROVIDER_ERROR,
      retryable: true,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Extract rate limit information from response headers
   */
  protected extractRateLimitInfo(
    headers: Headers
  ): { remaining: number; resetAt: number } | undefined {
    const remaining =
      headers.get('x-ratelimit-remaining') ??
      headers.get('ratelimit-remaining') ??
      headers.get('x-rate-limit-remaining');

    const reset =
      headers.get('x-ratelimit-reset') ??
      headers.get('ratelimit-reset') ??
      headers.get('x-rate-limit-reset');

    if (remaining !== null && reset !== null) {
      return {
        remaining: parseInt(remaining, 10),
        resetAt: parseInt(reset, 10) * 1000,
      };
    }

    return undefined;
  }

  /**
   * Map HTTP status codes to error codes
   */
  protected mapHttpStatusToErrorCode(status: number): string {
    switch (status) {
      case 401:
      case 403:
        return HEALTH_ERROR_CODES.PROVIDER_AUTH_FAILED;
      case 429:
        return HEALTH_ERROR_CODES.PROVIDER_RATE_LIMITED;
      case 408:
      case 504:
        return HEALTH_ERROR_CODES.PROVIDER_TIMEOUT;
      default:
        return HEALTH_ERROR_CODES.PROVIDER_ERROR;
    }
  }

  /**
   * Sleep helper
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validate that the provider is initialized
   */
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new HealthProviderError(
        this.name,
        HEALTH_ERROR_CODES.NOT_INITIALIZED,
        'Provider not initialized. Call initialize() first.'
      );
    }
  }
}

// =============================================================================
// Provider Registry
// =============================================================================

export class HealthProviderRegistry {
  private readonly providers = new Map<string, BaseHealthProvider>();
  private readonly defaultProviders = new Map<string, string>();

  /**
   * Register a provider
   */
  register<T extends BaseHealthProvider>(
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
   * Get a provider by type and optional name
   */
  get<T extends BaseHealthProvider>(type: string, name?: string): T | undefined {
    const providerName = name ?? this.defaultProviders.get(type);
    if (!providerName) {
      return undefined;
    }
    return this.providers.get(`${type}:${providerName}`) as T | undefined;
  }

  /**
   * Get all providers of a type
   */
  getAll<T extends BaseHealthProvider>(type: string): T[] {
    const result: T[] = [];
    for (const [key, provider] of this.providers) {
      if (key.startsWith(`${type}:`)) {
        result.push(provider as T);
      }
    }
    return result;
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): BaseHealthProvider[] {
    return Array.from(this.providers.values());
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
   * Unregister a provider
   */
  unregister(type: string, name: string): boolean {
    const key = `${type}:${name}`;
    const deleted = this.providers.delete(key);

    if (this.defaultProviders.get(type) === name) {
      this.defaultProviders.delete(type);
      for (const [k] of this.providers) {
        if (k.startsWith(`${type}:`)) {
          this.defaultProviders.set(type, k.split(':')[1]);
          break;
        }
      }
    }

    return deleted;
  }

  /**
   * Initialize all providers
   */
  async initializeAll(): Promise<void> {
    const promises = Array.from(this.providers.values()).map((p) => p.initialize());
    await Promise.all(promises);
  }

  /**
   * Shutdown all providers
   */
  async shutdownAll(): Promise<void> {
    const promises = Array.from(this.providers.values()).map((p) => p.shutdown());
    await Promise.all(promises);
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
// Exports
// =============================================================================

export const healthProviderRegistry = new HealthProviderRegistry();
