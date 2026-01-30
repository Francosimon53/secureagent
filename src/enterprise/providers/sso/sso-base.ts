/**
 * Base SSO Provider
 *
 * Abstract base for SSO provider implementations
 */

import type { EventEmitter } from 'events';
import { BaseEnterpriseProvider, type BaseProviderConfig } from '../base.js';
import type { SSOProvider } from '../../types.js';
import type { SSOProviderInterface } from '../../services/sso-service.js';

// =============================================================================
// SSO Types
// =============================================================================

export interface SSOUserInfo {
  /** Provider-specific subject/user ID */
  subjectId: string;
  /** User email */
  email: string;
  /** Full name */
  name?: string;
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Groups/roles from provider */
  groups?: string[];
  /** Raw attributes from provider */
  rawAttributes?: Record<string, unknown>;
}

export interface SSOTokens {
  /** Access token */
  accessToken: string;
  /** ID token (JWT) */
  idToken?: string;
  /** Refresh token */
  refreshToken?: string;
  /** Token expiration in seconds */
  expiresIn?: number;
  /** Token type (usually "Bearer") */
  tokenType?: string;
  /** Scopes granted */
  scope?: string;
}

export interface SSOAuthState {
  /** State parameter for CSRF protection */
  state: string;
  /** Nonce for ID token validation */
  nonce?: string;
  /** Tenant ID */
  tenantId: string;
  /** Redirect URL after auth */
  redirectUrl?: string;
  /** Additional data */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// SSO Provider Configuration
// =============================================================================

export interface BaseSSOProviderConfig extends BaseProviderConfig {
  /** SSO provider type */
  providerType: SSOProvider;
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** Redirect/callback URL */
  redirectUri: string;
  /** OAuth scopes to request */
  scopes?: string[];
}

// =============================================================================
// Base SSO Provider
// =============================================================================

export abstract class BaseSSOProvider<
  TConfig extends BaseSSOProviderConfig = BaseSSOProviderConfig
> extends BaseEnterpriseProvider<TConfig> implements SSOProviderInterface {
  constructor(config: TConfig, eventEmitter?: EventEmitter) {
    super(config, eventEmitter);
  }

  /**
   * Get provider type
   */
  get providerType(): SSOProvider {
    return this.config.providerType;
  }

  /**
   * Get authorization URL for OAuth flow
   */
  abstract getAuthorizationUrl(state: string, nonce?: string): string;

  /**
   * Exchange authorization code for tokens
   */
  abstract exchangeCode(code: string): Promise<SSOTokens>;

  /**
   * Get user info from access token
   */
  abstract getUserInfo(accessToken: string): Promise<SSOUserInfo>;

  /**
   * Validate SAML assertion (optional, for SAML providers)
   */
  validateAssertion?(assertion: string): Promise<{
    subjectId: string;
    email: string;
    name?: string;
    attributes: Record<string, string | string[]>;
  }>;

  /**
   * Refresh access token
   */
  abstract refreshToken(refreshToken: string): Promise<SSOTokens>;

  /**
   * Revoke token
   */
  abstract revokeToken(token: string): Promise<void>;

  /**
   * Validate ID token
   */
  abstract validateIdToken(idToken: string, nonce?: string): Promise<{
    valid: boolean;
    claims?: Record<string, unknown>;
    error?: string;
  }>;

  // =============================================================================
  // Helpers
  // =============================================================================

  /**
   * Build query string from params
   */
  protected buildQueryString(params: Record<string, string | undefined>): string {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.set(key, value);
      }
    }
    return searchParams.toString();
  }

  /**
   * Make HTTP request (using fetch)
   */
  protected async httpRequest<T>(
    url: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      headers?: Record<string, string>;
      body?: string | URLSearchParams;
    } = {}
  ): Promise<T> {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body?.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Decode JWT without verification (for extracting claims)
   */
  protected decodeJwt(token: string): Record<string, unknown> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    return JSON.parse(decoded);
  }

  // =============================================================================
  // Provider Lifecycle
  // =============================================================================

  protected async doInitialize(): Promise<void> {
    // Validate configuration
    if (!this.config.clientId) {
      throw new Error('SSO client ID is required');
    }
    if (!this.config.clientSecret) {
      throw new Error('SSO client secret is required');
    }
    if (!this.config.redirectUri) {
      throw new Error('SSO redirect URI is required');
    }
  }

  protected async doShutdown(): Promise<void> {
    // No cleanup needed
  }

  protected async doHealthCheck(): Promise<Record<string, unknown>> {
    return {
      providerType: this.providerType,
      clientIdConfigured: !!this.config.clientId,
      redirectUri: this.config.redirectUri,
    };
  }
}
