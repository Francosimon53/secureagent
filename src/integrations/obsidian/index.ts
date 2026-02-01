/**
 * Obsidian Integration
 *
 * Provides integration with local Obsidian vaults for note management.
 */

import { LocalIntegration } from '../base-integration.js';
import type {
  ToolDefinition,
  IntegrationMetadata,
  LocalPathCredentials,
} from '../types.js';
import { IntegrationError, INTEGRATION_ERROR_CODES } from '../types.js';
import type { ObsidianConfig } from '../config.js';
import { ObsidianVault } from './vault.js';
import { createObsidianTools } from './tools.js';

// Re-export types
export * from './types.js';
export { ObsidianVault } from './vault.js';
export { createObsidianTools } from './tools.js';

/**
 * Obsidian integration metadata
 */
const OBSIDIAN_METADATA: IntegrationMetadata = {
  name: 'obsidian',
  displayName: 'Obsidian',
  description: 'Connect to your local Obsidian vault for note management',
  icon: '📓',
  category: 'notes',
  platforms: ['macos', 'windows', 'linux'],
  authType: 'local',
  setupInstructions: {
    steps: [
      {
        number: 1,
        title: 'Find Vault Path',
        description: 'Locate your Obsidian vault folder on your computer',
      },
      {
        number: 2,
        title: 'Copy Path',
        description: 'Copy the full path to your vault folder',
      },
      {
        number: 3,
        title: 'Connect',
        description: 'Paste the path here to connect',
      },
    ],
    docsUrl: 'https://help.obsidian.md/Getting+started/Create+a+vault',
  },
};

/**
 * Obsidian Integration class
 */
export class ObsidianIntegration extends LocalIntegration {
  private vault?: ObsidianVault;
  private config?: ObsidianConfig;

  constructor(config?: ObsidianConfig) {
    super(
      'obsidian',
      'Obsidian integration for local note management',
      '📓',
      OBSIDIAN_METADATA,
    );
    this.config = config;
  }

  /**
   * Initialize the integration
   */
  async initialize(): Promise<void> {
    // If vault path is provided in config, try to connect
    if (this.config?.vaultPath) {
      try {
        await this.connect({ vaultPath: this.config.vaultPath });
      } catch {
        // Don't fail initialization
      }
    }
  }

  /**
   * Connect with vault path
   */
  async connect(credentials: LocalPathCredentials): Promise<void> {
    if (!credentials.vaultPath) {
      throw new IntegrationError(
        'Vault path is required',
        INTEGRATION_ERROR_CODES.INVALID_CREDENTIALS,
        'obsidian',
      );
    }

    const ignoredFolders = this.config?.ignoredFolders || ['.obsidian', '.trash'];
    this.vault = new ObsidianVault(credentials.vaultPath, ignoredFolders);
    this.basePath = credentials.vaultPath;

    // Verify the vault
    const valid = await this.vault.verifyVault();
    if (!valid) {
      this.vault = undefined;
      this.basePath = undefined;
      throw new IntegrationError(
        'Invalid Obsidian vault path',
        INTEGRATION_ERROR_CODES.INVALID_CREDENTIALS,
        'obsidian',
      );
    }

    this.setConnected({ vaultPath: credentials.vaultPath });
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    this.vault = undefined;
    await super.disconnect();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.vault) return false;
    return this.vault.verifyVault();
  }

  /**
   * Get available tools
   */
  getTools(): ToolDefinition[] {
    if (!this.vault) return [];
    return createObsidianTools(this.vault);
  }

  /**
   * Get the vault client for direct access
   */
  getVault(): ObsidianVault | undefined {
    return this.vault;
  }
}
