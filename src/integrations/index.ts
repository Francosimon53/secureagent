/**
 * Native Integrations Module
 *
 * Central manager for all native integrations
 */

import type {
  Integration,
  IntegrationConnection,
  IntegrationMetadata,
  ToolDefinition,
  IntegrationCredentials,
} from './types.js';
import {
  IntegrationError,
  INTEGRATION_ERROR_CODES,
  INTEGRATION_EVENTS,
} from './types.js';
import type { IntegrationsConfig } from './config.js';
import {
  DEFAULT_INTEGRATIONS_CONFIG,
  loadConfigFromEnv,
  validateIntegrationsConfig,
} from './config.js';
import type { IntegrationEventEmitter } from './base-integration.js';

// Import individual integrations
import { NotionIntegration } from './notion/index.js';
import { GoogleCalendarIntegration } from './google-calendar/index.js';
import { GmailIntegration } from './gmail/index.js';
import { ObsidianIntegration } from './obsidian/index.js';
import { TrelloIntegration } from './trello/index.js';
import { AppleRemindersIntegration } from './apple-reminders/index.js';

/**
 * Integration manager configuration
 */
export interface IntegrationManagerConfig {
  config?: Partial<IntegrationsConfig>;
  eventEmitter?: IntegrationEventEmitter;
}

/**
 * Integration Manager
 *
 * Central class for managing all integrations
 */
export class IntegrationManager {
  private integrations: Map<string, Integration> = new Map();
  private config: IntegrationsConfig;
  private eventEmitter?: IntegrationEventEmitter;
  private initialized = false;

  constructor(options: IntegrationManagerConfig = {}) {
    // Merge config from env, defaults, and provided config
    const envConfig = loadConfigFromEnv();
    this.config = validateIntegrationsConfig({
      ...DEFAULT_INTEGRATIONS_CONFIG,
      ...envConfig,
      ...options.config,
    });
    this.eventEmitter = options.eventEmitter;
  }

  /**
   * Initialize all integrations
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Register all integrations
    await this.registerIntegrations();

    // Initialize each integration
    for (const integration of this.integrations.values()) {
      try {
        await integration.initialize();
      } catch (error) {
        // Log but don't fail - integrations may work later
        console.warn(
          `Failed to initialize ${integration.name}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    this.initialized = true;
  }

  /**
   * Register all available integrations
   */
  private async registerIntegrations(): Promise<void> {
    // Notion
    if (this.config.notion?.enabled !== false) {
      const notion = new NotionIntegration(this.config.notion);
      if (this.eventEmitter) notion.setEventEmitter(this.eventEmitter);
      this.integrations.set('notion', notion);
    }

    // Google Calendar
    if (this.config.google?.calendar?.enabled !== false) {
      const calendar = new GoogleCalendarIntegration(this.config.google);
      if (this.eventEmitter) calendar.setEventEmitter(this.eventEmitter);
      this.integrations.set('google-calendar', calendar);
    }

    // Gmail
    if (this.config.google?.gmail?.enabled !== false) {
      const gmail = new GmailIntegration(this.config.google);
      if (this.eventEmitter) gmail.setEventEmitter(this.eventEmitter);
      this.integrations.set('gmail', gmail);
    }

    // Obsidian
    if (this.config.obsidian?.enabled !== false) {
      const obsidian = new ObsidianIntegration(this.config.obsidian);
      if (this.eventEmitter) obsidian.setEventEmitter(this.eventEmitter);
      this.integrations.set('obsidian', obsidian);
    }

    // Trello
    if (this.config.trello?.enabled !== false) {
      const trello = new TrelloIntegration(this.config.trello);
      if (this.eventEmitter) trello.setEventEmitter(this.eventEmitter);
      this.integrations.set('trello', trello);
    }

    // Apple Reminders (macOS only)
    if (
      this.config.appleReminders?.enabled !== false &&
      process.platform === 'darwin'
    ) {
      const reminders = new AppleRemindersIntegration(
        this.config.appleReminders,
      );
      if (this.eventEmitter) reminders.setEventEmitter(this.eventEmitter);
      this.integrations.set('apple-reminders', reminders);
    }
  }

  /**
   * Get an integration by name
   */
  getIntegration(name: string): Integration | undefined {
    return this.integrations.get(name);
  }

  /**
   * Get all integrations
   */
  getAllIntegrations(): Integration[] {
    return Array.from(this.integrations.values());
  }

  /**
   * Get all integration connections for dashboard
   */
  getConnections(): IntegrationConnection[] {
    return this.getAllIntegrations().map((integration) => {
      const baseIntegration = integration as Integration & {
        getConnection?: () => IntegrationConnection;
      };
      if (baseIntegration.getConnection) {
        return baseIntegration.getConnection();
      }
      return {
        integrationName: integration.name,
        connected: integration.status === 'connected',
      };
    });
  }

  /**
   * Get all integration metadata for dashboard
   */
  getMetadata(): IntegrationMetadata[] {
    return this.getAllIntegrations().map((integration) => {
      const baseIntegration = integration as Integration & {
        getMetadata?: () => IntegrationMetadata;
      };
      if (baseIntegration.getMetadata) {
        return baseIntegration.getMetadata();
      }
      return {
        name: integration.name,
        displayName: integration.name,
        description: integration.description,
        icon: integration.icon,
        category: 'other' as const,
        platforms: ['web' as const],
        authType: 'api_key' as const,
        setupInstructions: { steps: [] },
      };
    });
  }

  /**
   * Connect an integration
   */
  async connect(
    integrationName: string,
    credentials: IntegrationCredentials,
  ): Promise<void> {
    const integration = this.integrations.get(integrationName);
    if (!integration) {
      throw new IntegrationError(
        `Integration ${integrationName} not found`,
        INTEGRATION_ERROR_CODES.NOT_FOUND,
        integrationName,
      );
    }

    await integration.connect(credentials);
  }

  /**
   * Disconnect an integration
   */
  async disconnect(integrationName: string): Promise<void> {
    const integration = this.integrations.get(integrationName);
    if (!integration) {
      throw new IntegrationError(
        `Integration ${integrationName} not found`,
        INTEGRATION_ERROR_CODES.NOT_FOUND,
        integrationName,
      );
    }

    await integration.disconnect();
  }

  /**
   * Test an integration connection
   */
  async testConnection(integrationName: string): Promise<boolean> {
    const integration = this.integrations.get(integrationName);
    if (!integration) {
      throw new IntegrationError(
        `Integration ${integrationName} not found`,
        INTEGRATION_ERROR_CODES.NOT_FOUND,
        integrationName,
      );
    }

    return integration.healthCheck();
  }

  /**
   * Get all tools from all connected integrations
   */
  getAllTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const integration of this.integrations.values()) {
      if (integration.status === 'connected') {
        tools.push(...integration.getTools());
      }
    }
    return tools;
  }

  /**
   * Get tools from a specific integration
   */
  getToolsForIntegration(integrationName: string): ToolDefinition[] {
    const integration = this.integrations.get(integrationName);
    if (!integration) {
      return [];
    }
    return integration.getTools();
  }

  /**
   * Execute a tool by name
   */
  async executeTool(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    // Find the tool across all integrations
    for (const integration of this.integrations.values()) {
      const tools = integration.getTools();
      const tool = tools.find((t) => t.name === toolName);
      if (tool) {
        return tool.execute(params);
      }
    }

    return {
      success: false,
      error: `Tool ${toolName} not found`,
    };
  }

  /**
   * Get OAuth authorization URL for Google
   */
  getGoogleAuthUrl(state: string, redirectUri: string): string | null {
    const calendar = this.integrations.get(
      'google-calendar',
    ) as GoogleCalendarIntegration | undefined;
    if (calendar) {
      return calendar.getAuthorizationUrl(state, redirectUri);
    }
    return null;
  }

  /**
   * Handle Google OAuth callback
   */
  async handleGoogleCallback(
    code: string,
    redirectUri: string,
  ): Promise<void> {
    const calendar = this.integrations.get(
      'google-calendar',
    ) as GoogleCalendarIntegration | undefined;
    const gmail = this.integrations.get('gmail') as GmailIntegration | undefined;

    if (calendar) {
      const tokens = await calendar.exchangeCodeForTokens(code, redirectUri);

      // Connect calendar
      await calendar.connect({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
        scope: calendar.getScopes(),
      });

      // Also connect Gmail if available
      if (gmail) {
        await gmail.connect({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: Date.now() + tokens.expiresIn * 1000,
          scope: gmail.getScopes(),
        });
      }
    }
  }

  /**
   * Shutdown all integrations
   */
  async shutdown(): Promise<void> {
    for (const integration of this.integrations.values()) {
      try {
        await integration.disconnect();
      } catch (error) {
        console.warn(
          `Failed to disconnect ${integration.name}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
    this.integrations.clear();
    this.initialized = false;
  }
}

// Singleton instance
let integrationManager: IntegrationManager | null = null;

/**
 * Initialize the integration manager
 */
export function initIntegrationManager(
  options?: IntegrationManagerConfig,
): IntegrationManager {
  integrationManager = new IntegrationManager(options);
  return integrationManager;
}

/**
 * Get the integration manager instance
 */
export function getIntegrationManager(): IntegrationManager {
  if (!integrationManager) {
    integrationManager = new IntegrationManager();
  }
  return integrationManager;
}

/**
 * Check if integration manager is initialized
 */
export function isIntegrationManagerInitialized(): boolean {
  return integrationManager !== null;
}

// Re-export types and utilities
export * from './types.js';
export * from './config.js';
export { BaseIntegration, OAuthIntegration, ApiKeyIntegration, LocalIntegration } from './base-integration.js';
export type { IntegrationEventEmitter } from './base-integration.js';

// Re-export individual integrations with their types
export { NotionIntegration, NotionApi, createNotionTools } from './notion/index.js';
export type {
  NotionPage,
  NotionDatabase,
  NotionBlock,
  NotionSearchResult,
  NotionFilter,
  NotionSort,
  PageContent,
  BlockContent,
  DatabaseItemContent,
} from './notion/types.js';

export {
  GoogleCalendarIntegration,
  GoogleCalendarApi,
  createGoogleCalendarTools,
  GoogleOAuth,
  createGoogleOAuth,
  GOOGLE_SCOPES,
} from './google-calendar/index.js';
export type {
  GoogleScope,
  GoogleOAuthConfig,
  GoogleTokens,
} from './google-calendar/oauth.js';
export type {
  CalendarEvent,
  Calendar,
  EventInput,
  EventListOptions,
  EventListResponse,
  EventDateTime,
  FreeBusyRequest,
  FreeBusyResponse,
} from './google-calendar/types.js';

export { GmailIntegration, GmailApi, createGmailTools } from './gmail/index.js';
export { GMAIL_LABELS } from './gmail/types.js';
export type {
  SimplifiedEmail,
  ComposeEmailInput,
  EmailSearchOptions,
  EmailListResponse,
  GmailLabelId,
  GmailMessage,
  GmailLabel,
} from './gmail/types.js';

export { ObsidianIntegration, ObsidianVault, createObsidianTools } from './obsidian/index.js';
export type {
  ObsidianNote,
  NoteMetadata,
  NoteSearchResult,
  CreateNoteInput,
  UpdateNoteInput,
  SearchOptions as ObsidianSearchOptions,
  ListFolderOptions,
  BacklinkResult,
} from './obsidian/types.js';

export { TrelloIntegration, TrelloApi, createTrelloTools } from './trello/index.js';
export type {
  TrelloBoard,
  TrelloList,
  TrelloCard,
  TrelloLabel,
  TrelloMember,
  CreateCardInput,
  UpdateCardInput,
  BoardWithDetails,
} from './trello/types.js';

export { AppleRemindersIntegration, AppleRemindersClient, createAppleRemindersTools } from './apple-reminders/index.js';
export type {
  Reminder,
  ReminderList,
  ReminderPriority,
  CreateReminderInput,
  UpdateReminderInput,
  ListRemindersOptions,
} from './apple-reminders/types.js';
