/**
 * Base Wellness Provider
 *
 * Abstract base classes for wellness data providers:
 * - BaseWellnessProvider: Core provider functionality
 * - OAuthWellnessProvider: OAuth 2.0/1.0a support
 * - WellnessProviderRegistry: Provider management
 */

import { EventEmitter } from 'events';
import type {
  WearableSource,
  OAuthToken,
  SyncResult,
  RecoveryData,
  StrainData,
  SleepRecord,
  Activity,
} from '../types.js';

// =============================================================================
// Provider Configuration Types
// =============================================================================

export interface ProviderConfig {
  enabled: boolean;
}

export interface OAuthProviderConfig extends ProviderConfig {
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  baseUrl: string;
  scopes?: string[];
}

export interface OAuth1ProviderConfig extends ProviderConfig {
  consumerKeyEnvVar: string;
  consumerSecretEnvVar: string;
  baseUrl: string;
}

// =============================================================================
// Provider Result Types
// =============================================================================

export interface ProviderResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
}

export interface OAuth1TokenResponse {
  oauthToken: string;
  oauthTokenSecret: string;
}

// =============================================================================
// Base Wellness Provider
// =============================================================================

export abstract class BaseWellnessProvider<TConfig extends ProviderConfig = ProviderConfig> extends EventEmitter {
  protected readonly config: TConfig;
  protected initialized = false;

  constructor(config: TConfig) {
    super();
    this.config = config;
  }

  /** Provider name for identification */
  abstract get name(): WearableSource;

  /** Provider display name */
  abstract get displayName(): string;

  /** Initialize the provider */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.config.enabled) {
      throw new Error(`Provider ${this.name} is not enabled`);
    }

    await this.onInitialize();
    this.initialized = true;
    this.emit('initialized', { provider: this.name });
  }

  /** Check if provider is initialized */
  isInitialized(): boolean {
    return this.initialized;
  }

  /** Check if provider is enabled */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /** Override for custom initialization logic */
  protected async onInitialize(): Promise<void> {
    // Default: no-op
  }

  /** Shutdown the provider */
  async shutdown(): Promise<void> {
    this.initialized = false;
    this.emit('shutdown', { provider: this.name });
  }

  /** HTTP fetch with timeout and error handling */
  protected async fetch<T>(
    url: string,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<ProviderResult<T>> {
    const { timeout = 30000, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
        };
      }

      const data = (await response.json()) as T;
      return { success: true, data, statusCode: response.status };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return { success: false, error: `Request timeout after ${timeout}ms` };
        }
        return { success: false, error: error.message };
      }
      return { success: false, error: String(error) };
    }
  }

  /** Get environment variable value */
  protected getEnvVar(envVarName: string): string | undefined {
    return process.env[envVarName];
  }

  /** Require environment variable (throws if missing) */
  protected requireEnvVar(envVarName: string): string {
    const value = this.getEnvVar(envVarName);
    if (!value) {
      throw new Error(`Missing required environment variable: ${envVarName}`);
    }
    return value;
  }
}

// =============================================================================
// OAuth 2.0 Wellness Provider
// =============================================================================

export abstract class OAuthWellnessProvider<
  TConfig extends OAuthProviderConfig = OAuthProviderConfig,
> extends BaseWellnessProvider<TConfig> {
  protected token?: OAuthToken;

  /** Get OAuth authorization URL */
  abstract getAuthorizationUrl(redirectUri: string, state: string): string;

  /** Exchange authorization code for tokens */
  abstract exchangeCode(code: string, redirectUri: string): Promise<ProviderResult<TokenResponse>>;

  /** Refresh access token */
  abstract refreshToken(refreshToken: string): Promise<ProviderResult<TokenResponse>>;

  /** Set the current OAuth token */
  setToken(token: OAuthToken): void {
    this.token = token;
  }

  /** Get the current OAuth token */
  getToken(): OAuthToken | undefined {
    return this.token;
  }

  /** Check if token is expired */
  isTokenExpired(): boolean {
    if (!this.token) {
      return true;
    }
    // Consider expired if within 5 minutes of expiration
    return Date.now() >= this.token.expiresAt - 5 * 60 * 1000;
  }

  /** Ensure we have a valid token (refresh if needed) */
  protected async ensureValidToken(): Promise<void> {
    if (!this.token) {
      throw new Error('No OAuth token available');
    }

    if (this.isTokenExpired()) {
      const result = await this.refreshToken(this.token.refreshToken);
      if (!result.success || !result.data) {
        throw new Error(`Failed to refresh token: ${result.error}`);
      }

      this.token = {
        ...this.token,
        accessToken: result.data.accessToken,
        refreshToken: result.data.refreshToken,
        expiresAt: Date.now() + result.data.expiresIn * 1000,
        updatedAt: Date.now(),
      };

      this.emit('token:refreshed', { provider: this.name, token: this.token });
    }
  }

  /** Make authenticated API request */
  protected async authenticatedFetch<T>(
    url: string,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<ProviderResult<T>> {
    await this.ensureValidToken();

    return this.fetch<T>(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.token!.accessToken}`,
      },
    });
  }

  /** Get client ID from environment */
  protected getClientId(): string {
    return this.requireEnvVar(this.config.clientIdEnvVar);
  }

  /** Get client secret from environment */
  protected getClientSecret(): string {
    return this.requireEnvVar(this.config.clientSecretEnvVar);
  }
}

// =============================================================================
// OAuth 1.0a Wellness Provider
// =============================================================================

export abstract class OAuth1WellnessProvider<
  TConfig extends OAuth1ProviderConfig = OAuth1ProviderConfig,
> extends BaseWellnessProvider<TConfig> {
  protected oauthToken?: string;
  protected oauthTokenSecret?: string;

  /** Get request token for OAuth 1.0a flow */
  abstract getRequestToken(callbackUrl: string): Promise<ProviderResult<OAuth1TokenResponse>>;

  /** Get authorization URL with request token */
  abstract getAuthorizationUrl(oauthToken: string): string;

  /** Exchange verifier for access token */
  abstract exchangeVerifier(
    oauthToken: string,
    oauthTokenSecret: string,
    oauthVerifier: string
  ): Promise<ProviderResult<OAuth1TokenResponse>>;

  /** Set OAuth tokens */
  setTokens(oauthToken: string, oauthTokenSecret: string): void {
    this.oauthToken = oauthToken;
    this.oauthTokenSecret = oauthTokenSecret;
  }

  /** Get OAuth tokens */
  getTokens(): { oauthToken?: string; oauthTokenSecret?: string } {
    return {
      oauthToken: this.oauthToken,
      oauthTokenSecret: this.oauthTokenSecret,
    };
  }

  /** Generate OAuth 1.0a signature */
  protected generateOAuthSignature(
    method: string,
    url: string,
    params: Record<string, string>,
    tokenSecret: string = ''
  ): string {
    const consumerSecret = this.requireEnvVar(this.config.consumerSecretEnvVar);

    // Sort and encode params
    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    // Create signature base string
    const signatureBase = [
      method.toUpperCase(),
      encodeURIComponent(url),
      encodeURIComponent(sortedParams),
    ].join('&');

    // Create signing key
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;

    // HMAC-SHA1 signature (would need crypto import in real implementation)
    // This is a placeholder - real implementation would use crypto
    const crypto = require('crypto');
    const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');

    return signature;
  }

  /** Generate OAuth 1.0a header */
  protected generateOAuthHeader(
    method: string,
    url: string,
    additionalParams: Record<string, string> = {}
  ): string {
    const consumerKey = this.requireEnvVar(this.config.consumerKeyEnvVar);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = Math.random().toString(36).substring(2);

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: consumerKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_version: '1.0',
      ...additionalParams,
    };

    if (this.oauthToken) {
      oauthParams.oauth_token = this.oauthToken;
    }

    const signature = this.generateOAuthSignature(
      method,
      url,
      oauthParams,
      this.oauthTokenSecret
    );

    oauthParams.oauth_signature = signature;

    const headerParts = Object.keys(oauthParams)
      .sort()
      .map((key) => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
      .join(', ');

    return `OAuth ${headerParts}`;
  }

  /** Make authenticated API request with OAuth 1.0a */
  protected async authenticatedFetch<T>(
    url: string,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<ProviderResult<T>> {
    const method = options.method || 'GET';
    const authHeader = this.generateOAuthHeader(method, url);

    return this.fetch<T>(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: authHeader,
      },
    });
  }
}

// =============================================================================
// Sync-capable Provider Interface
// =============================================================================

export interface SyncCapableProvider {
  /** Sync recovery data */
  syncRecovery(userId: string, since?: number): Promise<SyncResult>;

  /** Sync strain data */
  syncStrain(userId: string, since?: number): Promise<SyncResult>;

  /** Sync sleep data */
  syncSleep(userId: string, since?: number): Promise<SyncResult>;

  /** Sync activity data */
  syncActivities(userId: string, since?: number): Promise<SyncResult>;

  /** Full sync */
  syncAll(userId: string, since?: number): Promise<SyncResult[]>;
}

// =============================================================================
// Wellness Provider Registry
// =============================================================================

export class WellnessProviderRegistry {
  private static instance: WellnessProviderRegistry | null = null;
  private readonly providers = new Map<WearableSource, BaseWellnessProvider>();
  private readonly defaultProvider: WearableSource | null = null;

  /**
   * Get singleton instance
   */
  static getInstance(): WellnessProviderRegistry {
    if (!WellnessProviderRegistry.instance) {
      WellnessProviderRegistry.instance = new WellnessProviderRegistry();
    }
    return WellnessProviderRegistry.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    WellnessProviderRegistry.instance = null;
  }

  /**
   * Register a provider
   */
  register(provider: BaseWellnessProvider): void {
    this.providers.set(provider.name, provider);
  }

  /**
   * Get a provider by name
   */
  get<T extends BaseWellnessProvider>(name: WearableSource): T | undefined {
    return this.providers.get(name) as T | undefined;
  }

  /**
   * Get a provider by name (alias for get)
   */
  getProvider<T extends BaseWellnessProvider>(name: WearableSource): T | null {
    return (this.providers.get(name) as T) ?? null;
  }

  /**
   * Check if a provider is registered
   */
  has(name: WearableSource): boolean {
    return this.providers.has(name);
  }

  /**
   * List all registered provider names
   */
  list(): WearableSource[] {
    return Array.from(this.providers.keys());
  }

  /**
   * List all registered provider names (alias for list)
   */
  listProviders(): WearableSource[] {
    return this.list();
  }

  /**
   * List all enabled providers
   */
  listEnabled(): WearableSource[] {
    return Array.from(this.providers.entries())
      .filter(([_, provider]) => provider.isEnabled())
      .map(([name]) => name);
  }

  /**
   * Initialize all registered providers
   */
  async initializeAll(): Promise<void> {
    const enabledProviders = Array.from(this.providers.values()).filter((p) => p.isEnabled());

    await Promise.all(enabledProviders.map((provider) => provider.initialize()));
  }

  /**
   * Shutdown all registered providers
   */
  async shutdownAll(): Promise<void> {
    await Promise.all(Array.from(this.providers.values()).map((provider) => provider.shutdown()));
  }

  /**
   * Remove a provider
   */
  remove(name: WearableSource): boolean {
    return this.providers.delete(name);
  }

  /**
   * Clear all providers
   */
  clear(): void {
    this.providers.clear();
  }

  /**
   * Get provider count
   */
  get size(): number {
    return this.providers.size;
  }
}

// =============================================================================
// Global Registry Singleton
// =============================================================================

let globalRegistry: WellnessProviderRegistry | null = null;

/**
 * Get the global wellness provider registry
 */
export function getWellnessProviderRegistry(): WellnessProviderRegistry {
  if (!globalRegistry) {
    globalRegistry = new WellnessProviderRegistry();
  }
  return globalRegistry;
}

/**
 * Initialize the global wellness provider registry
 */
export function initWellnessProviderRegistry(): WellnessProviderRegistry {
  globalRegistry = new WellnessProviderRegistry();
  return globalRegistry;
}

/**
 * Check if registry is initialized
 */
export function isWellnessProviderRegistryInitialized(): boolean {
  return globalRegistry !== null;
}
