/**
 * Native Integrations - Configuration Schemas
 *
 * Zod schemas for validating integration configurations
 */

import { z } from 'zod';

/**
 * Notion configuration
 */
export const NotionConfigSchema = z.object({
  apiKey: z.string().optional(),
  enabled: z.boolean().default(true),
});

export type NotionConfig = z.infer<typeof NotionConfigSchema>;

/**
 * Google OAuth configuration (shared by Calendar and Gmail)
 */
export const GoogleOAuthConfigSchema = z.object({
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  redirectUri: z
    .string()
    .default('/api/integrations/oauth/google/callback'),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
  scope: z.array(z.string()).optional(),
});

export type GoogleOAuthConfig = z.infer<typeof GoogleOAuthConfigSchema>;

/**
 * Google Calendar configuration
 */
export const GoogleCalendarConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultCalendarId: z.string().default('primary'),
  timeZone: z.string().optional(),
});

export type GoogleCalendarConfig = z.infer<typeof GoogleCalendarConfigSchema>;

/**
 * Gmail configuration
 */
export const GmailConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxResults: z.number().default(50),
  labelIds: z.array(z.string()).optional(),
});

export type GmailConfig = z.infer<typeof GmailConfigSchema>;

/**
 * Combined Google configuration
 */
export const GoogleConfigSchema = z.object({
  oauth: GoogleOAuthConfigSchema.optional(),
  calendar: GoogleCalendarConfigSchema.optional(),
  gmail: GmailConfigSchema.optional(),
});

export type GoogleConfig = z.infer<typeof GoogleConfigSchema>;

/**
 * Obsidian configuration
 */
export const ObsidianConfigSchema = z.object({
  vaultPath: z.string().optional(),
  enabled: z.boolean().default(true),
  watchForChanges: z.boolean().default(false),
  ignoredFolders: z.array(z.string()).default(['.obsidian', '.trash']),
});

export type ObsidianConfig = z.infer<typeof ObsidianConfigSchema>;

/**
 * Trello configuration
 */
export const TrelloConfigSchema = z.object({
  apiKey: z.string().optional(),
  token: z.string().optional(),
  enabled: z.boolean().default(true),
});

export type TrelloConfig = z.infer<typeof TrelloConfigSchema>;

/**
 * Apple Reminders configuration
 */
export const AppleRemindersConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultList: z.string().optional(),
});

export type AppleRemindersConfig = z.infer<typeof AppleRemindersConfigSchema>;

/**
 * Complete integrations configuration
 */
export const IntegrationsConfigSchema = z.object({
  notion: NotionConfigSchema.optional(),
  google: GoogleConfigSchema.optional(),
  obsidian: ObsidianConfigSchema.optional(),
  trello: TrelloConfigSchema.optional(),
  appleReminders: AppleRemindersConfigSchema.optional(),
});

export type IntegrationsConfig = z.infer<typeof IntegrationsConfigSchema>;

/**
 * Default configuration values
 */
export const DEFAULT_INTEGRATIONS_CONFIG: IntegrationsConfig = {
  notion: {
    enabled: true,
  },
  google: {
    calendar: {
      enabled: true,
      defaultCalendarId: 'primary',
    },
    gmail: {
      enabled: true,
      maxResults: 50,
    },
  },
  obsidian: {
    enabled: true,
    watchForChanges: false,
    ignoredFolders: ['.obsidian', '.trash'],
  },
  trello: {
    enabled: true,
  },
  appleReminders: {
    enabled: true,
  },
};

/**
 * Validate integrations configuration
 */
export function validateIntegrationsConfig(
  config: unknown,
): IntegrationsConfig {
  return IntegrationsConfigSchema.parse(config);
}

/**
 * Safe parse integrations configuration
 */
export function safeParseIntegrationsConfig(config: unknown): {
  success: boolean;
  data?: IntegrationsConfig;
  error?: z.ZodError;
} {
  const result = IntegrationsConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Environment variable names for integrations
 */
export const INTEGRATION_ENV_VARS = {
  // Notion
  NOTION_API_KEY: 'NOTION_API_KEY',

  // Google
  GOOGLE_CLIENT_ID: 'GOOGLE_CLIENT_ID',
  GOOGLE_CLIENT_SECRET: 'GOOGLE_CLIENT_SECRET',
  GOOGLE_OAUTH_CREDENTIALS: 'GOOGLE_OAUTH_CREDENTIALS',

  // Trello
  TRELLO_API_KEY: 'TRELLO_API_KEY',
  TRELLO_TOKEN: 'TRELLO_TOKEN',

  // Obsidian
  OBSIDIAN_VAULT_PATH: 'OBSIDIAN_VAULT_PATH',
} as const;

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnv(): Partial<IntegrationsConfig> {
  const config: Partial<IntegrationsConfig> = {};

  // Notion
  if (process.env[INTEGRATION_ENV_VARS.NOTION_API_KEY]) {
    config.notion = {
      apiKey: process.env[INTEGRATION_ENV_VARS.NOTION_API_KEY],
      enabled: true,
    };
  }

  // Google
  const googleClientId = process.env[INTEGRATION_ENV_VARS.GOOGLE_CLIENT_ID];
  const googleClientSecret =
    process.env[INTEGRATION_ENV_VARS.GOOGLE_CLIENT_SECRET];
  if (googleClientId && googleClientSecret) {
    let oauthCredentials: {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: number;
      scope?: string[];
    } = {};

    // Parse stored OAuth credentials if available
    const storedCredentials =
      process.env[INTEGRATION_ENV_VARS.GOOGLE_OAUTH_CREDENTIALS];
    if (storedCredentials) {
      try {
        oauthCredentials = JSON.parse(storedCredentials);
      } catch {
        // Ignore parse errors
      }
    }

    config.google = {
      oauth: {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        redirectUri: '/api/integrations/oauth/google/callback',
        ...oauthCredentials,
      },
      calendar: { enabled: true, defaultCalendarId: 'primary' },
      gmail: { enabled: true, maxResults: 50 },
    };
  }

  // Trello
  const trelloApiKey = process.env[INTEGRATION_ENV_VARS.TRELLO_API_KEY];
  const trelloToken = process.env[INTEGRATION_ENV_VARS.TRELLO_TOKEN];
  if (trelloApiKey && trelloToken) {
    config.trello = {
      apiKey: trelloApiKey,
      token: trelloToken,
      enabled: true,
    };
  }

  // Obsidian
  const obsidianVaultPath = process.env[INTEGRATION_ENV_VARS.OBSIDIAN_VAULT_PATH];
  if (obsidianVaultPath) {
    config.obsidian = {
      vaultPath: obsidianVaultPath,
      enabled: true,
      watchForChanges: false,
      ignoredFolders: ['.obsidian', '.trash'],
    };
  }

  return config;
}
