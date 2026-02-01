/**
 * Google OAuth 2.0 Handler
 *
 * Shared OAuth logic for Google Calendar and Gmail
 */

import { IntegrationError, INTEGRATION_ERROR_CODES } from '../types.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Google OAuth scopes
 */
export const GOOGLE_SCOPES = {
  CALENDAR_READONLY: 'https://www.googleapis.com/auth/calendar.readonly',
  CALENDAR_EVENTS: 'https://www.googleapis.com/auth/calendar.events',
  GMAIL_READONLY: 'https://www.googleapis.com/auth/gmail.readonly',
  GMAIL_SEND: 'https://www.googleapis.com/auth/gmail.send',
  GMAIL_MODIFY: 'https://www.googleapis.com/auth/gmail.modify',
  USER_EMAIL: 'https://www.googleapis.com/auth/userinfo.email',
} as const;

export type GoogleScope = (typeof GOOGLE_SCOPES)[keyof typeof GOOGLE_SCOPES];

/**
 * OAuth configuration
 */
export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * OAuth tokens
 */
export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
}

/**
 * Google OAuth handler
 */
export class GoogleOAuth {
  constructor(private config: GoogleOAuthConfig) {}

  /**
   * Generate authorization URL
   */
  getAuthorizationUrl(scopes: GoogleScope[], state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string): Promise<GoogleTokens> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new IntegrationError(
        `Failed to exchange code: ${(error as { error_description?: string }).error_description || response.statusText}`,
        INTEGRATION_ERROR_CODES.AUTHENTICATION_FAILED,
        'google',
      );
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
      scope: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<GoogleTokens> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new IntegrationError(
        `Failed to refresh token: ${(error as { error_description?: string }).error_description || response.statusText}`,
        INTEGRATION_ERROR_CODES.AUTHENTICATION_FAILED,
        'google',
      );
    }

    const data = await response.json() as {
      access_token: string;
      expires_in: number;
      token_type: string;
      scope: string;
    };

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Revoke access token
   */
  async revokeToken(token: string): Promise<void> {
    const response = await fetch(
      `https://oauth2.googleapis.com/revoke?token=${token}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    if (!response.ok && response.status !== 400) {
      // 400 means token already revoked, which is fine
      throw new IntegrationError(
        'Failed to revoke token',
        INTEGRATION_ERROR_CODES.API_ERROR,
        'google',
      );
    }
  }
}

/**
 * Create OAuth handler
 */
export function createGoogleOAuth(config: GoogleOAuthConfig): GoogleOAuth {
  return new GoogleOAuth(config);
}
