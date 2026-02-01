/**
 * Notion Integration
 *
 * Provides integration with Notion for pages, databases, and content management.
 */

import { ApiKeyIntegration } from '../base-integration.js';
import type {
  ToolDefinition,
  IntegrationMetadata,
  ApiKeyCredentials,
} from '../types.js';
import { IntegrationError, INTEGRATION_ERROR_CODES } from '../types.js';
import type { NotionConfig } from '../config.js';
import { NotionApi } from './api.js';
import { createNotionTools } from './tools.js';

// Re-export types
export * from './types.js';
export { NotionApi } from './api.js';
export { createNotionTools } from './tools.js';

/**
 * Notion integration metadata
 */
const NOTION_METADATA: IntegrationMetadata = {
  name: 'notion',
  displayName: 'Notion',
  description: 'Connect to Notion for page and database management',
  icon: '📝',
  category: 'productivity',
  platforms: ['web', 'macos', 'windows', 'linux', 'ios', 'android'],
  authType: 'api_key',
  setupInstructions: {
    steps: [
      {
        number: 1,
        title: 'Create Integration',
        description: 'Go to Notion integrations page and create a new integration',
        link: 'https://www.notion.so/my-integrations',
      },
      {
        number: 2,
        title: 'Copy Token',
        description: 'Copy the Internal Integration Token from your integration settings',
      },
      {
        number: 3,
        title: 'Share Pages',
        description:
          'Share the pages and databases you want to access with your integration',
      },
      {
        number: 4,
        title: 'Connect',
        description: 'Paste your token here to connect',
      },
    ],
    docsUrl: 'https://developers.notion.com/docs/getting-started',
  },
};

/**
 * Notion Integration class
 */
export class NotionIntegration extends ApiKeyIntegration {
  private api?: NotionApi;
  private config?: NotionConfig;

  constructor(config?: NotionConfig) {
    super(
      'notion',
      'Notion integration for pages and databases',
      '📝',
      NOTION_METADATA,
    );
    this.config = config;
  }

  /**
   * Initialize the integration
   */
  async initialize(): Promise<void> {
    // If API key is provided in config, try to connect automatically
    if (this.config?.apiKey) {
      try {
        await this.connect({ apiKey: this.config.apiKey });
      } catch {
        // Don't fail initialization, just leave disconnected
      }
    }
  }

  /**
   * Connect with API key
   */
  async connect(credentials: ApiKeyCredentials): Promise<void> {
    if (!credentials.apiKey) {
      throw new IntegrationError(
        'API key is required',
        INTEGRATION_ERROR_CODES.INVALID_CREDENTIALS,
        'notion',
      );
    }

    this.api = new NotionApi({ apiKey: credentials.apiKey });
    this.apiKey = credentials.apiKey;

    // Verify the API key
    const valid = await this.api.verifyCredentials();
    if (!valid) {
      this.api = undefined;
      this.apiKey = undefined;
      throw new IntegrationError(
        'Invalid Notion API key',
        INTEGRATION_ERROR_CODES.AUTHENTICATION_FAILED,
        'notion',
      );
    }

    this.setConnected();
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    this.api = undefined;
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
    return createNotionTools(this.api);
  }

  /**
   * Get the API client for direct access
   */
  getApi(): NotionApi | undefined {
    return this.api;
  }
}
