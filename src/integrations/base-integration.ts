/**
 * Native Integrations - Base Integration Class
 *
 * Abstract base class for all integrations
 */

import type {
  Integration,
  IntegrationStatus,
  ToolDefinition,
  IntegrationMetadata,
  IntegrationConnection,
  IntegrationCredentials,
} from './types.js';
import {
  IntegrationError,
  INTEGRATION_ERROR_CODES,
  INTEGRATION_EVENTS,
} from './types.js';

/**
 * Event emitter interface for integrations
 */
export interface IntegrationEventEmitter {
  emit(event: string, data: unknown): void;
  on(event: string, handler: (data: unknown) => void): void;
  off(event: string, handler: (data: unknown) => void): void;
}

/**
 * Abstract base class for integrations
 */
export abstract class BaseIntegration implements Integration {
  public status: IntegrationStatus = 'disconnected';
  protected credentials?: IntegrationCredentials;
  protected eventEmitter?: IntegrationEventEmitter;
  protected connection?: IntegrationConnection;

  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly icon: string,
    protected readonly metadata: IntegrationMetadata,
  ) {}

  /**
   * Set event emitter for publishing events
   */
  setEventEmitter(emitter: IntegrationEventEmitter): void {
    this.eventEmitter = emitter;
  }

  /**
   * Get integration metadata
   */
  getMetadata(): IntegrationMetadata {
    return this.metadata;
  }

  /**
   * Get current connection status
   */
  getConnection(): IntegrationConnection {
    return {
      integrationName: this.name,
      connected: this.status === 'connected',
      connectedAt: this.connection?.connectedAt,
      lastUsed: this.connection?.lastUsed,
      error: this.connection?.error,
      metadata: this.connection?.metadata,
    };
  }

  /**
   * Initialize the integration
   */
  abstract initialize(): Promise<void>;

  /**
   * Connect with credentials
   */
  abstract connect(credentials: unknown): Promise<void>;

  /**
   * Disconnect and clean up
   */
  async disconnect(): Promise<void> {
    this.credentials = undefined;
    this.status = 'disconnected';
    this.connection = {
      integrationName: this.name,
      connected: false,
    };
    this.emitEvent(INTEGRATION_EVENTS.DISCONNECTED, {});
  }

  /**
   * Health check
   */
  abstract healthCheck(): Promise<boolean>;

  /**
   * Get available tools
   */
  abstract getTools(): ToolDefinition[];

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.status === 'connected';
  }

  /**
   * Require connection before executing
   */
  protected requireConnection(): void {
    if (!this.isConnected()) {
      throw new IntegrationError(
        `${this.name} is not connected`,
        INTEGRATION_ERROR_CODES.NOT_CONNECTED,
        this.name,
      );
    }
  }

  /**
   * Update last used timestamp
   */
  protected updateLastUsed(): void {
    if (this.connection) {
      this.connection.lastUsed = Date.now();
    }
  }

  /**
   * Set connection error
   */
  protected setError(error: string): void {
    this.status = 'error';
    if (this.connection) {
      this.connection.error = error;
      this.connection.connected = false;
    }
    this.emitEvent(INTEGRATION_EVENTS.ERROR, { error });
  }

  /**
   * Set connected status
   */
  protected setConnected(metadata?: Record<string, unknown>): void {
    this.status = 'connected';
    this.connection = {
      integrationName: this.name,
      connected: true,
      connectedAt: Date.now(),
      metadata,
    };
    this.emitEvent(INTEGRATION_EVENTS.CONNECTED, { metadata });
  }

  /**
   * Emit integration event
   */
  protected emitEvent(type: string, data: unknown): void {
    if (this.eventEmitter) {
      this.eventEmitter.emit(type, {
        integrationName: this.name,
        timestamp: Date.now(),
        data,
      });
    }
  }

  /**
   * Create a tool definition helper
   */
  protected createTool(
    name: string,
    description: string,
    parameters: ToolDefinition['parameters'],
    riskLevel: ToolDefinition['riskLevel'],
    execute: ToolDefinition['execute'],
  ): ToolDefinition {
    return {
      name: `${this.name.toLowerCase()}_${name}`,
      description,
      parameters,
      riskLevel,
      execute: async (params) => {
        this.requireConnection();
        this.updateLastUsed();
        try {
          const result = await execute(params);
          this.emitEvent(INTEGRATION_EVENTS.TOOL_EXECUTED, {
            tool: name,
            params,
            success: result.success,
          });
          return result;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          this.emitEvent(INTEGRATION_EVENTS.TOOL_EXECUTED, {
            tool: name,
            params,
            success: false,
            error: errorMessage,
          });
          return { success: false, error: errorMessage };
        }
      },
    };
  }
}

/**
 * OAuth-based integration base class
 */
export abstract class OAuthIntegration extends BaseIntegration {
  protected abstract getAuthUrl(): string;
  protected abstract getTokenUrl(): string;
  protected abstract getScopes(): string[];

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.getClientId(),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.getScopes().join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return `${this.getAuthUrl()}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  abstract exchangeCodeForTokens(
    code: string,
    redirectUri: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }>;

  /**
   * Refresh access token
   */
  abstract refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }>;

  /**
   * Get client ID from config
   */
  protected abstract getClientId(): string;

  /**
   * Get client secret from config
   */
  protected abstract getClientSecret(): string;
}

/**
 * API key-based integration base class
 */
export abstract class ApiKeyIntegration extends BaseIntegration {
  protected apiKey?: string;

  async connect(credentials: { apiKey: string }): Promise<void> {
    this.apiKey = credentials.apiKey;

    // Validate the API key
    const valid = await this.healthCheck();
    if (valid) {
      this.setConnected();
    } else {
      this.apiKey = undefined;
      throw new IntegrationError(
        'Invalid API key',
        INTEGRATION_ERROR_CODES.INVALID_CREDENTIALS,
        this.name,
      );
    }
  }

  async disconnect(): Promise<void> {
    this.apiKey = undefined;
    await super.disconnect();
  }
}

/**
 * Local file-based integration base class
 */
export abstract class LocalIntegration extends BaseIntegration {
  protected basePath?: string;

  /**
   * Connect with local path credentials
   * Subclasses should override this to handle specific credential types
   */
  abstract connect(credentials: unknown): Promise<void>;

  async disconnect(): Promise<void> {
    this.basePath = undefined;
    await super.disconnect();
  }
}
