/**
 * Gmail Integration
 *
 * Provides integration with Gmail for email management.
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
} from '../google-calendar/oauth.js';
import { GmailApi } from './api.js';
import { createGmailTools } from './tools.js';

// Re-export types
export * from './types.js';
export { GmailApi } from './api.js';
export { createGmailTools } from './tools.js';

/**
 * Gmail integration metadata
 */
const GMAIL_METADATA: IntegrationMetadata = {
  name: 'gmail',
  displayName: 'Gmail',
  description: 'Connect to Gmail for email management',
  icon: '✉️',
  category: 'communication',
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
        description: 'Allow SecureAgent to access your Gmail',
      },
      {
        number: 4,
        title: 'Done',
        description: 'You will be redirected back and connected automatically',
      },
    ],
    docsUrl: 'https://developers.google.com/gmail/api/guides',
  },
};

/**
 * Gmail-specific scopes
 */
const GMAIL_SCOPES: GoogleScope[] = [
  GOOGLE_SCOPES.GMAIL_READONLY,
  GOOGLE_SCOPES.GMAIL_SEND,
  GOOGLE_SCOPES.GMAIL_MODIFY,
];

/**
 * Gmail Integration class
 */
export class GmailIntegration extends OAuthIntegration {
  private api?: GmailApi;
  private config?: GoogleConfig;
  private oauth?: GoogleOAuth;
  private oauthCredentials?: OAuthCredentials;

  constructor(config?: GoogleConfig) {
    super(
      'gmail',
      'Gmail integration for email management',
      '✉️',
      GMAIL_METADATA,
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
          scope: this.config.oauth.scope || GMAIL_SCOPES,
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
        'gmail',
      );
    }

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
        'gmail',
      );
    }

    const tokens = await this.oauth.refreshToken(refreshToken);

    if (this.api) {
      this.api.updateAccessToken(tokens.accessToken);
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
        'gmail',
      );
    }

    this.oauthCredentials = credentials;
    this.api = new GmailApi({
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
          this.api.updateAccessToken(newTokens.accessToken);
          this.oauthCredentials = {
            ...credentials,
            accessToken: newTokens.accessToken,
            expiresAt: Date.now() + newTokens.expiresIn * 1000,
          };
        } catch {
          this.api = undefined;
          this.oauthCredentials = undefined;
          throw new IntegrationError(
            'Gmail authentication failed',
            INTEGRATION_ERROR_CODES.AUTHENTICATION_FAILED,
            'gmail',
          );
        }
      } else {
        this.api = undefined;
        this.oauthCredentials = undefined;
        throw new IntegrationError(
          'Gmail authentication failed',
          INTEGRATION_ERROR_CODES.AUTHENTICATION_FAILED,
          'gmail',
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
    return createGmailTools(this.api);
  }

  /**
   * Get the API client for direct access
   */
  getApi(): GmailApi | undefined {
    return this.api;
  }

  /**
   * Get scopes
   */
  getScopes(): GoogleScope[] {
    return GMAIL_SCOPES;
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
        'gmail',
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
        'gmail',
      );
    }
    return this.config.oauth.clientSecret;
  }
}
