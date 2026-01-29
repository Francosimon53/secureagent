/**
 * Family Features Module - Configuration Schemas
 *
 * Zod schemas for validating family module configuration.
 */

import { z } from 'zod';

// ============================================================================
// Family Group Settings Schema
// ============================================================================

export const FamilyGroupSettingsSchema = z.object({
  timezone: z.string().default('UTC'),
  defaultReminderMinutes: z.array(z.number()).default([60, 1440]), // 1 hour, 1 day
  mealPlanStartDay: z.enum(['sunday', 'monday']).default('sunday'),
  shareMemoriesEnabled: z.boolean().default(true),
  kidSafeMode: z.boolean().default(true),
});

export type FamilyGroupSettingsConfig = z.infer<typeof FamilyGroupSettingsSchema>;

// ============================================================================
// Meal Planning Config Schema
// ============================================================================

export const MealPlanningConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultServings: z.number().min(1).default(4),
  groceryCategories: z.array(z.string()).default([
    'produce',
    'dairy',
    'meat',
    'bakery',
    'frozen',
    'canned',
    'dry goods',
    'beverages',
    'snacks',
    'household',
    'other',
  ]),
  defaultStores: z.array(z.string()).default([]),
  enablePriceEstimates: z.boolean().default(false),
});

export type MealPlanningConfig = z.infer<typeof MealPlanningConfigSchema>;

// ============================================================================
// School Calendar Config Schema
// ============================================================================

export const SchoolCalendarConfigSchema = z.object({
  enabled: z.boolean().default(true),
  syncIntervalMinutes: z.number().min(5).default(60),
  defaultReminderMinutes: z.array(z.number()).default([60, 1440]),
  enableNotifications: z.boolean().default(true),
  notificationChannels: z.array(z.enum(['push', 'email', 'sms'])).default(['push']),
  googleCalendarApiKeyEnvVar: z.string().default('GOOGLE_CALENDAR_API_KEY'),
  outlookCalendarApiKeyEnvVar: z.string().default('OUTLOOK_CALENDAR_API_KEY'),
});

export type SchoolCalendarConfig = z.infer<typeof SchoolCalendarConfigSchema>;

// ============================================================================
// Family Projects Config Schema
// ============================================================================

export const FamilyProjectsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  enableWeeklySummaries: z.boolean().default(true),
  summaryGenerationDay: z.enum(['sunday', 'monday', 'friday', 'saturday']).default('sunday'),
  summaryGenerationHour: z.number().min(0).max(23).default(9),
  maxTopicsPerProject: z.number().min(1).default(20),
  maxNotesPerTopic: z.number().min(1).default(100),
});

export type FamilyProjectsConfig = z.infer<typeof FamilyProjectsConfigSchema>;

// ============================================================================
// Shared Memories Config Schema
// ============================================================================

export const SharedMemoriesConfigSchema = z.object({
  enabled: z.boolean().default(true),
  requireConsent: z.boolean().default(true),
  defaultShareWithChildren: z.boolean().default(false),
  encryptionEnabled: z.boolean().default(true),
  maxMemoriesPerUser: z.number().min(1).default(1000),
  defaultExpirationDays: z.number().optional(),
  autoShareCategories: z.array(z.string()).default([]),
});

export type SharedMemoriesConfig = z.infer<typeof SharedMemoriesConfigSchema>;

// ============================================================================
// Games Generator Config Schema
// ============================================================================

export const GamesGeneratorConfigSchema = z.object({
  enabled: z.boolean().default(true),
  aiProviderApiKeyEnvVar: z.string().default('OPENAI_API_KEY'),
  aiModel: z.string().default('gpt-4o-mini'),
  maxTokens: z.number().min(100).default(2000),
  maxGamesPerDay: z.number().min(1).default(10),
  defaultAgeRange: z.object({
    min: z.number().min(0).default(5),
    max: z.number().max(18).default(12),
  }).default({ min: 5, max: 12 }),
  enableEducationalGames: z.boolean().default(true),
  kidSafePrompts: z.boolean().default(true),
});

export type GamesGeneratorConfig = z.infer<typeof GamesGeneratorConfigSchema>;

// ============================================================================
// Recipe Suggestions Config Schema
// ============================================================================

export const RecipeSuggestionsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  provider: z.enum(['spoonacular', 'edamam', 'local']).default('local'),
  apiKeyEnvVar: z.string().default('RECIPE_API_KEY'),
  maxSuggestions: z.number().min(1).default(10),
  matchThreshold: z.number().min(0).max(1).default(0.3), // 30% ingredients match
  prioritizeFavorites: z.boolean().default(true),
  considerDietaryRestrictions: z.boolean().default(true),
  considerExpiringIngredients: z.boolean().default(true),
  expirationWarningDays: z.number().min(1).default(3),
});

export type RecipeSuggestionsConfig = z.infer<typeof RecipeSuggestionsConfigSchema>;

// ============================================================================
// Main Family Config Schema
// ============================================================================

export const FamilyConfigSchema = z.object({
  enabled: z.boolean().default(true),
  storeType: z.enum(['memory', 'database']).default('database'),
  maxFamilyGroupsPerUser: z.number().min(1).default(5),
  maxMembersPerGroup: z.number().min(2).default(20),

  // Feature-specific configs
  mealPlanning: MealPlanningConfigSchema.optional(),
  schoolCalendar: SchoolCalendarConfigSchema.optional(),
  projects: FamilyProjectsConfigSchema.optional(),
  sharedMemories: SharedMemoriesConfigSchema.optional(),
  games: GamesGeneratorConfigSchema.optional(),
  recipes: RecipeSuggestionsConfigSchema.optional(),

  // Default group settings
  defaultGroupSettings: FamilyGroupSettingsSchema.optional(),
});

export type FamilyConfig = z.infer<typeof FamilyConfigSchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

export function validateFamilyConfig(config: unknown): FamilyConfig {
  return FamilyConfigSchema.parse(config);
}

export function safeParseFamilyConfig(config: unknown): { success: true; data: FamilyConfig } | { success: false; error: z.ZodError } {
  const result = FamilyConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function getDefaultFamilyConfig(): FamilyConfig {
  return FamilyConfigSchema.parse({});
}
