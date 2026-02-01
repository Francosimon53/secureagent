/**
 * Native Integrations - Shared Types
 *
 * Common type definitions for all integrations
 */

/**
 * Tool definition for AI agents
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  riskLevel: 'low' | 'medium' | 'high';
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Base integration interface
 */
export interface Integration {
  name: string;
  description: string;
  icon: string;
  status: IntegrationStatus;

  initialize(): Promise<void>;
  connect(credentials: unknown): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<boolean>;
  getTools(): ToolDefinition[];
}

export type IntegrationStatus = 'disconnected' | 'connected' | 'error';

/**
 * Connection status stored for dashboard
 */
export interface IntegrationConnection {
  integrationName: string;
  connected: boolean;
  connectedAt?: number;
  lastUsed?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * OAuth 2.0 credentials (Google Calendar, Gmail)
 */
export interface OAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string[];
}

/**
 * API key credentials (Notion, Trello)
 */
export interface ApiKeyCredentials {
  apiKey: string;
  workspaceId?: string;
}

/**
 * Trello-specific credentials
 */
export interface TrelloCredentials {
  apiKey: string;
  token: string;
}

/**
 * Local path credentials (Obsidian)
 */
export interface LocalPathCredentials {
  vaultPath: string;
}

/**
 * Integration credentials union type
 */
export type IntegrationCredentials =
  | OAuthCredentials
  | ApiKeyCredentials
  | TrelloCredentials
  | LocalPathCredentials;

/**
 * Integration events
 */
export const INTEGRATION_EVENTS = {
  CONNECTED: 'integration:connected',
  DISCONNECTED: 'integration:disconnected',
  ERROR: 'integration:error',
  TOOL_EXECUTED: 'integration:tool_executed',
  CREDENTIALS_REFRESHED: 'integration:credentials_refreshed',
} as const;

export type IntegrationEventType =
  (typeof INTEGRATION_EVENTS)[keyof typeof INTEGRATION_EVENTS];

export interface IntegrationEvent {
  type: IntegrationEventType;
  integrationName: string;
  timestamp: number;
  data?: unknown;
}

/**
 * Integration error codes
 */
export const INTEGRATION_ERROR_CODES = {
  NOT_CONNECTED: 'INT_001',
  AUTHENTICATION_FAILED: 'INT_002',
  API_ERROR: 'INT_003',
  RATE_LIMITED: 'INT_004',
  INVALID_CREDENTIALS: 'INT_005',
  PERMISSION_DENIED: 'INT_006',
  NOT_FOUND: 'INT_007',
  VALIDATION_ERROR: 'INT_008',
  PLATFORM_NOT_SUPPORTED: 'INT_009',
} as const;

export type IntegrationErrorCode =
  (typeof INTEGRATION_ERROR_CODES)[keyof typeof INTEGRATION_ERROR_CODES];

/**
 * Integration error class
 */
export class IntegrationError extends Error {
  constructor(
    message: string,
    public code: IntegrationErrorCode,
    public integrationName: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}

/**
 * Integration setup instructions
 */
export interface SetupInstructions {
  steps: SetupStep[];
  docsUrl?: string;
}

export interface SetupStep {
  number: number;
  title: string;
  description: string;
  link?: string;
}

/**
 * Integration metadata for dashboard display
 */
export interface IntegrationMetadata {
  name: string;
  displayName: string;
  description: string;
  icon: string;
  category: IntegrationCategory;
  platforms: Platform[];
  authType: AuthType;
  setupInstructions: SetupInstructions;
}

export type IntegrationCategory =
  | 'productivity'
  | 'communication'
  | 'notes'
  | 'tasks'
  | 'calendar'
  | 'other';

export type Platform = 'web' | 'macos' | 'windows' | 'linux' | 'ios' | 'android';

export type AuthType = 'oauth' | 'api_key' | 'local' | 'none';
