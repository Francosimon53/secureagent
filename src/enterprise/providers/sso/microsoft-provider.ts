/**
 * Microsoft SSO Provider
 *
 * Microsoft Entra ID (Azure AD) OAuth 2.0 / OpenID Connect implementation
 */

import type { EventEmitter } from 'events';
import { BaseSSOProvider, type BaseSSOProviderConfig, type SSOTokens, type SSOUserInfo } from './sso-base.js';

// =============================================================================
// Microsoft OAuth Configuration
// =============================================================================

export interface MicrosoftSSOProviderConfig extends BaseSSOProviderConfig {
  /** Microsoft tenant ID (use 'common' for multi-tenant) */
  tenantId: string;
  /** Domain hint for login */
  domainHint?: string;
  /** Login hint (email) */
  loginHint?: string;
  /** Prompt type */
  prompt?: 'login' | 'none' | 'consent' | 'select_account';
}

// =============================================================================
// Microsoft OAuth Endpoints
// =============================================================================

const getMicrosoftAuthUrl = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;

const getMicrosoftTokenUrl = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

const MICROSOFT_GRAPH_URL = 'https://graph.microsoft.com/v1.0/me';
const MICROSOFT_LOGOUT_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/logout';

// Default scopes for Microsoft SSO
const DEFAULT_SCOPES = ['openid', 'email', 'profile', 'User.Read', 'offline_access'];

// =============================================================================
// Microsoft SSO Provider
// =============================================================================

export class MicrosoftSSOProvider extends BaseSSOProvider<MicrosoftSSOProviderConfig> {
  constructor(config: MicrosoftSSOProviderConfig, eventEmitter?: EventEmitter) {
    super(
      {
        ...config,
        providerType: 'microsoft',
        scopes: config.scopes ?? DEFAULT_SCOPES,
      },
      eventEmitter
    );
  }

  /**
   * Get Microsoft authorization URL
   */
  getAuthorizationUrl(state: string, nonce?: string): string {
    const params: Record<string, string | undefined> = {
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: this.config.scopes?.join(' '),
      state,
      nonce,
      prompt: this.config.prompt ?? 'select_account',
      domain_hint: this.config.domainHint,
      login_hint: this.config.loginHint,
    };

    const authUrl = getMicrosoftAuthUrl(this.config.tenantId);
    return `${authUrl}?${this.buildQueryString(params)}`;
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
      scope: this.config.scopes?.join(' ') ?? '',
    });

    const tokenUrl = getMicrosoftTokenUrl(this.config.tenantId);

    const response = await this.withRetry(async () => {
      return this.httpRequest<{
        access_token: string;
        id_token?: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
        scope?: string;
      }>(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
    }, 'exchangeCode');

    this.emit('sso:tokens:exchanged', {
      provider: 'microsoft',
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
   * Get user info from Microsoft Graph
   */
  async getUserInfo(accessToken: string): Promise<SSOUserInfo> {
    const response = await this.withRetry(async () => {
      return this.httpRequest<{
        id: string;
        mail?: string;
        userPrincipalName: string;
        displayName?: string;
        givenName?: string;
        surname?: string;
        jobTitle?: string;
        department?: string;
        officeLocation?: string;
        mobilePhone?: string;
      }>(MICROSOFT_GRAPH_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    }, 'getUserInfo');

    // Email can be in 'mail' or 'userPrincipalName'
    const email = response.mail ?? response.userPrincipalName;

    return {
      subjectId: response.id,
      email,
      name: response.displayName,
      firstName: response.givenName,
      lastName: response.surname,
      rawAttributes: {
        jobTitle: response.jobTitle,
        department: response.department,
        officeLocation: response.officeLocation,
        mobilePhone: response.mobilePhone,
        userPrincipalName: response.userPrincipalName,
      },
    };
  }

  /**
   * Get user's group memberships
   */
  async getUserGroups(accessToken: string): Promise<string[]> {
    try {
      const response = await this.httpRequest<{
        value: Array<{
          id: string;
          displayName: string;
        }>;
      }>(`${MICROSOFT_GRAPH_URL}/memberOf`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.value.map(group => group.displayName);
    } catch {
      // Group membership might require additional permissions
      return [];
    }
  }

  /**
   * Get user's profile photo URL
   */
  async getProfilePhoto(accessToken: string): Promise<string | undefined> {
    try {
      const response = await fetch(`${MICROSOFT_GRAPH_URL}/photo/$value`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const contentType = response.headers.get('content-type') ?? 'image/jpeg';
        return `data:${contentType};base64,${base64}`;
      }
    } catch {
      // Photo might not be available
    }
    return undefined;
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
      scope: this.config.scopes?.join(' ') ?? '',
    });

    const tokenUrl = getMicrosoftTokenUrl(this.config.tenantId);

    const response = await this.withRetry(async () => {
      return this.httpRequest<{
        access_token: string;
        id_token?: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
        scope?: string;
      }>(tokenUrl, {
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
      refreshToken: response.refresh_token ?? refreshToken,
      expiresIn: response.expires_in,
      tokenType: response.token_type,
      scope: response.scope,
    };
  }

  /**
   * Revoke token (Microsoft uses logout endpoint)
   */
  async revokeToken(_token: string): Promise<void> {
    // Microsoft doesn't have a token revocation endpoint
    // The logout endpoint is used instead for sign-out
    this.emit('sso:token:revoked', { provider: 'microsoft' });
  }

  /**
   * Get logout URL
   */
  getLogoutUrl(postLogoutRedirectUri?: string): string {
    const params: Record<string, string | undefined> = {
      post_logout_redirect_uri: postLogoutRedirectUri,
    };

    return `${MICROSOFT_LOGOUT_URL}?${this.buildQueryString(params)}`;
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
        email?: string;
        preferred_username?: string;
        exp: number;
        iat: number;
        nonce?: string;
        tid: string;
      };

      // Validate issuer (can be tenant-specific or common)
      const expectedIssuer = `https://login.microsoftonline.com/${this.config.tenantId}/v2.0`;
      const commonIssuer = `https://login.microsoftonline.com/${claims.tid}/v2.0`;

      if (claims.iss !== expectedIssuer && claims.iss !== commonIssuer) {
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

      // Note: In production, verify signature using Microsoft's public keys

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
    // Verify we can reach Microsoft's OAuth endpoint
    try {
      const openIdConfigUrl = `https://login.microsoftonline.com/${this.config.tenantId}/v2.0/.well-known/openid-configuration`;
      const response = await fetch(openIdConfigUrl);
      return {
        providerType: 'microsoft',
        tenantId: this.config.tenantId,
        openIdConfigReachable: response.ok,
        clientIdConfigured: !!this.config.clientId,
        redirectUri: this.config.redirectUri,
      };
    } catch {
      return {
        providerType: 'microsoft',
        openIdConfigReachable: false,
        error: 'Failed to reach Microsoft OpenID configuration endpoint',
      };
    }
  }
}

/**
 * Create Microsoft SSO provider
 */
export function createMicrosoftSSOProvider(
  config: MicrosoftSSOProviderConfig,
  eventEmitter?: EventEmitter
): MicrosoftSSOProvider {
  return new MicrosoftSSOProvider(config, eventEmitter);
}
