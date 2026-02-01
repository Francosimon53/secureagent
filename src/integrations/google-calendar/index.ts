/**
 * Google Calendar Integration
 *
 * Provides integration with Google Calendar for event management.
 */

import { OAuthIntegration } from '../base-integration.js';
import type {
  ToolDefinition,
  IntegrationMetadata,
  OAuthCredentials,
} from '../types.js';
import { IntegrationError, INTEGRATION_ERROR_CODES } from '../types.js';
import type { GoogleConfig } from '../config.js';
import {
  GoogleOAuth,
  GOOGLE_SCOPES,
  type GoogleScope,
} from './oauth.js';
import { GoogleCalendarApi } from './api.js';
import { createGoogleCalendarTools } from './tools.js';

// Re-export types
export * from './types.js';
export { GoogleCalendarApi } from './api.js';
export { createGoogleCalendarTools } from './tools.js';
export {
  GoogleOAuth,
  createGoogleOAuth,
  GOOGLE_SCOPES,
  type GoogleScope,
  type GoogleOAuthConfig,
  type GoogleTokens,
} from './oauth.js';

/**
 * Google Calendar integration metadata
 */
const GOOGLE_CALENDAR_METADATA: IntegrationMetadata = {
  name: 'google-calendar',
  displayName: 'Google Calendar',
  description: 'Connect to Google Calendar for event management',
  icon: '📅',
  category: 'calendar',
  platforms: ['web', 'macos', 'windows', 'linux', 'ios', 'android'],
  authType: 'oauth',
  setupInstructions: {
    steps: [
      {
        number: 1,
        title: 'Click Connect',
        description: 'Click the Connect button to start the OAuth flow',
      },
      {
        number: 2,
        title: 'Sign In',
        description: 'Sign in with your Google account in the popup window',
      },
      {
        number: 3,
        title: 'Grant Access',
        description: 'Allow SecureAgent to access your calendar',
      },
      {
        number: 4,
        title: 'Done',
        description: 'You will be redirected back and connected automatically',
      },
    ],
    docsUrl: 'https://developers.google.com/calendar/api/guides/overview',
  },
};

/**
 * Calendar-specific scopes
 */
const CALENDAR_SCOPES: GoogleScope[] = [
  GOOGLE_SCOPES.CALENDAR_READONLY,
  GOOGLE_SCOPES.CALENDAR_EVENTS,
];

/**
 * Google Calendar Integration class
 */
export class GoogleCalendarIntegration extends OAuthIntegration {
  private api?: GoogleCalendarApi;
  private config?: GoogleConfig;
  private oauth?: GoogleOAuth;
  private oauthCredentials?: OAuthCredentials;

  constructor(config?: GoogleConfig) {
    super(
      'google-calendar',
      'Google Calendar integration for event management',
      '📅',
      GOOGLE_CALENDAR_METADATA,
    );
    this.config = config;

    if (config?.oauth?.clientId && config?.oauth?.clientSecret) {
      this.oauth = new GoogleOAuth({
        clientId: config.oauth.clientId,
        clientSecret: config.oauth.clientSecret,
        redirectUri:
          config.oauth.redirectUri ||
          '/api/integrations/oauth/google/callback',
      });
    }
  }

  /**
   * Initialize the integration
   */
  async initialize(): Promise<void> {
    // If credentials are stored in config, try to connect
    if (
      this.config?.oauth?.accessToken &&
      this.config?.oauth?.refreshToken
    ) {
      try {
        await this.connect({
          accessToken: this.config.oauth.accessToken,
          refreshToken: this.config.oauth.refreshToken,
          expiresAt: this.config.oauth.expiresAt || Date.now() + 3600000,
          scope: this.config.oauth.scope || CALENDAR_SCOPES,
        });
      } catch {
        // Don't fail initialization
      }
    }
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthorizationUrl(state: string, redirectUri: string): string {
    if (!this.oauth) {
      throw new IntegrationError(
        'OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
        INTEGRATION_ERROR_CODES.INVALID_CREDENTIALS,
        'google-calendar',
      );
    }

    // Create a temporary OAuth with the provided redirect URI
    const tempOAuth = new GoogleOAuth({
      clientId: this.getClientId(),
      clientSecret: this.getClientSecret(),
      redirectUri,
    });

    return tempOAuth.getAuthorizationUrl(this.getScopes(), state);
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    // Create OAuth with the redirect URI used
    const oauth = new GoogleOAuth({
      clientId: this.getClientId(),
      clientSecret: this.getClientSecret(),
      redirectUri,
    });

    const tokens = await oauth.exchangeCode(code);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || '',
      expiresIn: tokens.expiresIn,
    };
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    if (!this.oauth) {
      throw new IntegrationError(
        'OAuth not configured',
        INTEGRATION_ERROR_CODES.INVALID_CREDENTIALS,
        'google-calendar',
      );
    }

    const tokens = await this.oauth.refreshToken(refreshToken);

    // Update the API client
    if (this.api) {
      this.api.updateAccessToken(
        tokens.accessToken,
        Date.now() + tokens.expiresIn * 1000,
      );
    }

    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    };
  }

  /**
   * Connect with OAuth credentials
   */
  async connect(credentials: OAuthCredentials): Promise<void> {
    if (!credentials.accessToken) {
      throw new IntegrationError(
        'Access token is required',
        INTEGRATION_ERROR_CODES.INVALID_CREDENTIALS,
        'google-calendar',
      );
    }

    this.oauthCredentials = credentials;
    this.api = new GoogleCalendarApi({
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      expiresAt: credentials.expiresAt,
    });

    // Verify credentials
    const valid = await this.api.verifyCredentials();
    if (!valid) {
      // Try to refresh if we have a refresh token
      if (credentials.refreshToken && this.oauth) {
        try {
          const newTokens = await this.refreshAccessToken(
            credentials.refreshToken,
          );
          this.api.updateAccessToken(
            newTokens.accessToken,
            Date.now() + newTokens.expiresIn * 1000,
          );
          this.oauthCredentials = {
            ...credentials,
            accessToken: newTokens.accessToken,
            expiresAt: Date.now() + newTokens.expiresIn * 1000,
          };
        } catch {
          this.api = undefined;
          this.oauthCredentials = undefined;
          throw new IntegrationError(
            'Google Calendar authentication failed',
            INTEGRATION_ERROR_CODES.AUTHENTICATION_FAILED,
            'google-calendar',
          );
        }
      } else {
        this.api = undefined;
        this.oauthCredentials = undefined;
        throw new IntegrationError(
          'Google Calendar authentication failed',
          INTEGRATION_ERROR_CODES.AUTHENTICATION_FAILED,
          'google-calendar',
        );
      }
    }

    this.setConnected();
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    this.api = undefined;
    this.oauthCredentials = undefined;
    await super.disconnect();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.api) return false;
    return this.api.verifyCredentials();
  }

  /**
   * Get available tools
   */
  getTools(): ToolDefinition[] {
    if (!this.api) return [];
    return createGoogleCalendarTools(this.api);
  }

  /**
   * Get the API client for direct access
   */
  getApi(): GoogleCalendarApi | undefined {
    return this.api;
  }

  /**
   * Get scopes
   */
  getScopes(): GoogleScope[] {
    return CALENDAR_SCOPES;
  }

  /**
   * Get auth URL
   */
  protected getAuthUrl(): string {
    return 'https://accounts.google.com/o/oauth2/v2/auth';
  }

  /**
   * Get token URL
   */
  protected getTokenUrl(): string {
    return 'https://oauth2.googleapis.com/token';
  }

  /**
   * Get client ID
   */
  protected getClientId(): string {
    if (!this.config?.oauth?.clientId) {
      throw new IntegrationError(
        'Google client ID not configured',
        INTEGRATION_ERROR_CODES.INVALID_CREDENTIALS,
        'google-calendar',
      );
    }
    return this.config.oauth.clientId;
  }

  /**
   * Get client secret
   */
  protected getClientSecret(): string {
    if (!this.config?.oauth?.clientSecret) {
      throw new IntegrationError(
        'Google client secret not configured',
        INTEGRATION_ERROR_CODES.INVALID_CREDENTIALS,
        'google-calendar',
      );
    }
    return this.config.oauth.clientSecret;
  }
}
