/**
 * Apple Reminders Integration
 *
 * Provides integration with Apple Reminders on macOS using AppleScript.
 */

import { BaseIntegration } from '../base-integration.js';
import type {
  ToolDefinition,
  IntegrationMetadata,
} from '../types.js';
import { IntegrationError, INTEGRATION_ERROR_CODES } from '../types.js';
import type { AppleRemindersConfig } from '../config.js';
import { AppleRemindersClient } from './osascript.js';
import { createAppleRemindersTools } from './tools.js';

// Re-export types
export * from './types.js';
export { AppleRemindersClient } from './osascript.js';
export { createAppleRemindersTools } from './tools.js';

/**
 * Apple Reminders integration metadata
 */
const APPLE_REMINDERS_METADATA: IntegrationMetadata = {
  name: 'apple-reminders',
  displayName: 'Apple Reminders',
  description: 'Connect to Apple Reminders on macOS',
  icon: '⏰',
  category: 'tasks',
  platforms: ['macos'],
  authType: 'none',
  setupInstructions: {
    steps: [
      {
        number: 1,
        title: 'Click Connect',
        description: 'Click the Connect button below',
      },
      {
        number: 2,
        title: 'Grant Permission',
        description:
          'When prompted, allow SecureAgent to control Reminders in System Preferences',
      },
      {
        number: 3,
        title: 'Done',
        description: 'You can now use Reminders with SecureAgent',
      },
    ],
    docsUrl:
      'https://support.apple.com/guide/reminders/welcome/mac',
  },
};

/**
 * Apple Reminders Integration class
 */
export class AppleRemindersIntegration extends BaseIntegration {
  private client?: AppleRemindersClient;
  private config?: AppleRemindersConfig;

  constructor(config?: AppleRemindersConfig) {
    super(
      'apple-reminders',
      'Apple Reminders integration for macOS',
      '⏰',
      APPLE_REMINDERS_METADATA,
    );
    this.config = config;
  }

  /**
   * Initialize the integration
   */
  async initialize(): Promise<void> {
    // Check platform
    if (process.platform !== 'darwin') {
      this.setError('Apple Reminders is only available on macOS');
      return;
    }

    // Try to connect automatically
    try {
      await this.connect({});
    } catch {
      // Don't fail initialization
    }
  }

  /**
   * Connect (request permission)
   */
  async connect(_credentials: unknown): Promise<void> {
    if (process.platform !== 'darwin') {
      throw new IntegrationError(
        'Apple Reminders is only available on macOS',
        INTEGRATION_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
        'apple-reminders',
      );
    }

    this.client = new AppleRemindersClient();

    // Check if we have access
    const hasAccess = await this.client.checkAccess();
    if (!hasAccess) {
      this.client = undefined;
      throw new IntegrationError(
        'Permission denied. Please grant Automation permission for Reminders in System Preferences.',
        INTEGRATION_ERROR_CODES.PERMISSION_DENIED,
        'apple-reminders',
      );
    }

    this.setConnected();
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    this.client = undefined;
    await super.disconnect();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.client) return false;
    if (process.platform !== 'darwin') return false;
    return this.client.checkAccess();
  }

  /**
   * Get available tools
   */
  getTools(): ToolDefinition[] {
    if (!this.client) return [];
    return createAppleRemindersTools(this.client);
  }

  /**
   * Get the client for direct access
   */
  getClient(): AppleRemindersClient | undefined {
    return this.client;
  }
}
