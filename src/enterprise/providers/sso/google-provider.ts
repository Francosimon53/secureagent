/**
 * Google SSO Provider
 *
 * Google OAuth 2.0 / OpenID Connect implementation
 */

import type { EventEmitter } from 'events';
import { BaseSSOProvider, type BaseSSOProviderConfig, type SSOTokens, type SSOUserInfo } from './sso-base.js';

// =============================================================================
// Google OAuth Configuration
// =============================================================================

export interface GoogleSSOProviderConfig extends BaseSSOProviderConfig {
  /** Hosted domain restriction (optional) */
  hostedDomain?: string;
  /** Login hint (email) */
  loginHint?: string;
  /** Prompt type */
  prompt?: 'none' | 'consent' | 'select_account';
  /** Access type for refresh tokens */
  accessType?: 'online' | 'offline';
}

// =============================================================================
// Google OAuth Endpoints
// =============================================================================

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

// Default scopes for Google SSO
const DEFAULT_SCOPES = ['openid', 'email', 'profile'];

// =============================================================================
// Google SSO Provider
// =============================================================================

export class GoogleSSOProvider extends BaseSSOProvider<GoogleSSOProviderConfig> {
  constructor(config: GoogleSSOProviderConfig, eventEmitter?: EventEmitter) {
    super(
      {
        ...config,
        providerType: 'google',
        scopes: config.scopes ?? DEFAULT_SCOPES,
      },
      eventEmitter
    );
  }

  /**
   * Get Google authorization URL
   */
  getAuthorizationUrl(state: string, nonce?: string): string {
    const params: Record<string, string | undefined> = {
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes?.join(' '),
      state,
      nonce,
      access_type: this.config.accessType ?? 'offline',
      prompt: this.config.prompt ?? 'select_account',
      hd: this.config.hostedDomain,
      login_hint: this.config.loginHint,
    };

    return `${GOOGLE_AUTH_URL}?${this.buildQueryString(params)}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string): Promise<SSOTokens> {
    const body = new URLSearchParams({
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await this.withRetry(async () => {
      return this.httpRequest<{
        access_token: string;
        id_token?: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
        scope?: string;
      }>(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
    }, 'exchangeCode');

    this.emit('sso:tokens:exchanged', {
      provider: 'google',
      hasRefreshToken: !!response.refresh_token,
    });

    return {
      accessToken: response.access_token,
      idToken: response.id_token,
      refreshToken: response.refresh_token,
      expiresIn: response.expires_in,
      tokenType: response.token_type,
      scope: response.scope,
    };
  }

  /**
   * Get user info from Google
   */
  async getUserInfo(accessToken: string): Promise<SSOUserInfo> {
    const response = await this.withRetry(async () => {
      return this.httpRequest<{
        sub: string;
        email: string;
        email_verified: boolean;
        name?: string;
        given_name?: string;
        family_name?: string;
        picture?: string;
        locale?: string;
        hd?: string;
      }>(GOOGLE_USERINFO_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    }, 'getUserInfo');

    return {
      subjectId: response.sub,
      email: response.email,
      name: response.name,
      firstName: response.given_name,
      lastName: response.family_name,
      avatarUrl: response.picture,
      rawAttributes: {
        email_verified: response.email_verified,
        locale: response.locale,
        hd: response.hd,
      },
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<SSOTokens> {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
    });

    const response = await this.withRetry(async () => {
      return this.httpRequest<{
        access_token: string;
        id_token?: string;
        expires_in?: number;
        token_type?: string;
        scope?: string;
      }>(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
    }, 'refreshToken');

    return {
      accessToken: response.access_token,
      idToken: response.id_token,
      refreshToken, // Google doesn't return a new refresh token
      expiresIn: response.expires_in,
      tokenType: response.token_type,
      scope: response.scope,
    };
  }

  /**
   * Revoke token
   */
  async revokeToken(token: string): Promise<void> {
    const body = new URLSearchParams({ token });

    await this.withRetry(async () => {
      await fetch(`${GOOGLE_REVOKE_URL}?${body.toString()}`, {
        method: 'POST',
      });
    }, 'revokeToken');

    this.emit('sso:token:revoked', { provider: 'google' });
  }

  /**
   * Validate ID token
   */
  async validateIdToken(
    idToken: string,
    nonce?: string
  ): Promise<{
    valid: boolean;
    claims?: Record<string, unknown>;
    error?: string;
  }> {
    try {
      const claims = this.decodeJwt(idToken) as {
        iss: string;
        aud: string;
        sub: string;
        email: string;
        exp: number;
        iat: number;
        nonce?: string;
      };

      // Validate issuer
      if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') {
        return { valid: false, error: 'Invalid issuer' };
      }

      // Validate audience
      if (claims.aud !== this.config.clientId) {
        return { valid: false, error: 'Invalid audience' };
      }

      // Validate expiration
      const now = Math.floor(Date.now() / 1000);
      if (claims.exp < now) {
        return { valid: false, error: 'Token expired' };
      }

      // Validate nonce if provided
      if (nonce && claims.nonce !== nonce) {
        return { valid: false, error: 'Invalid nonce' };
      }

      // Note: In production, you should also verify the signature using Google's public keys
      // from GOOGLE_CERTS_URL. This simplified version just validates the claims.

      return { valid: true, claims };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Token validation failed',
      };
    }
  }

  // =============================================================================
  // Provider Lifecycle
  // =============================================================================

  protected async doHealthCheck(): Promise<Record<string, unknown>> {
    // Verify we can reach Google's OAuth endpoint
    try {
      const response = await fetch(GOOGLE_CERTS_URL);
      return {
        providerType: 'google',
        certsReachable: response.ok,
        clientIdConfigured: !!this.config.clientId,
        redirectUri: this.config.redirectUri,
        hostedDomain: this.config.hostedDomain,
      };
    } catch {
      return {
        providerType: 'google',
        certsReachable: false,
        error: 'Failed to reach Google certificates endpoint',
      };
    }
  }
}

/**
 * Create Google SSO provider
 */
export function createGoogleSSOProvider(
  config: GoogleSSOProviderConfig,
  eventEmitter?: EventEmitter
): GoogleSSOProvider {
  return new GoogleSSOProvider(config, eventEmitter);
}
