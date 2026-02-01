/**
 * Trello Integration
 *
 * Provides integration with Trello for board and card management.
 */

import { ApiKeyIntegration } from '../base-integration.js';
import type {
  ToolDefinition,
  IntegrationMetadata,
  TrelloCredentials,
} from '../types.js';
import { IntegrationError, INTEGRATION_ERROR_CODES } from '../types.js';
import type { TrelloConfig } from '../config.js';
import { TrelloApi } from './api.js';
import { createTrelloTools } from './tools.js';

// Re-export types
export * from './types.js';
export { TrelloApi } from './api.js';
export { createTrelloTools } from './tools.js';

/**
 * Trello integration metadata
 */
const TRELLO_METADATA: IntegrationMetadata = {
  name: 'trello',
  displayName: 'Trello',
  description: 'Connect to Trello for board and card management',
  icon: '📋',
  category: 'tasks',
  platforms: ['web', 'macos', 'windows', 'linux', 'ios', 'android'],
  authType: 'api_key',
  setupInstructions: {
    steps: [
      {
        number: 1,
        title: 'Get API Key',
        description: 'Go to Trello Power-Ups admin and create a new Power-Up',
        link: 'https://trello.com/power-ups/admin',
      },
      {
        number: 2,
        title: 'Generate Key',
        description: 'Click on your Power-Up and go to API Key section',
      },
      {
        number: 3,
        title: 'Get Token',
        description:
          'Click "Token" link next to your API key to generate a token',
      },
      {
        number: 4,
        title: 'Connect',
        description: 'Enter both your API Key and Token here',
      },
    ],
    docsUrl: 'https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/',
  },
};

/**
 * Trello Integration class
 */
export class TrelloIntegration extends ApiKeyIntegration {
  private api?: TrelloApi;
  private config?: TrelloConfig;
  private token?: string;

  constructor(config?: TrelloConfig) {
    super(
      'trello',
      'Trello integration for board and card management',
      '📋',
      TRELLO_METADATA,
    );
    this.config = config;
  }

  /**
   * Initialize the integration
   */
  async initialize(): Promise<void> {
    // If credentials are provided in config, try to connect
    if (this.config?.apiKey && this.config?.token) {
      try {
        await this.connect({
          apiKey: this.config.apiKey,
          token: this.config.token,
        });
      } catch {
        // Don't fail initialization
      }
    }
  }

  /**
   * Connect with API key and token
   */
  async connect(credentials: TrelloCredentials): Promise<void> {
    if (!credentials.apiKey || !credentials.token) {
      throw new IntegrationError(
        'API key and token are required',
        INTEGRATION_ERROR_CODES.INVALID_CREDENTIALS,
        'trello',
      );
    }

    this.api = new TrelloApi({
      apiKey: credentials.apiKey,
      token: credentials.token,
    });
    this.apiKey = credentials.apiKey;
    this.token = credentials.token;

    // Verify credentials
    const valid = await this.api.verifyCredentials();
    if (!valid) {
      this.api = undefined;
      this.apiKey = undefined;
      this.token = undefined;
      throw new IntegrationError(
        'Invalid Trello credentials',
        INTEGRATION_ERROR_CODES.AUTHENTICATION_FAILED,
        'trello',
      );
    }

    this.setConnected();
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    this.api = undefined;
    this.token = undefined;
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
    return createTrelloTools(this.api);
  }

  /**
   * Get the API client for direct access
   */
  getApi(): TrelloApi | undefined {
    return this.api;
  }
}
