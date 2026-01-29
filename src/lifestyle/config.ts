/**
 * Lifestyle Module Configuration Schema
 *
 * Zod schemas for validating lifestyle module configuration.
 */

import { z } from 'zod';

// =============================================================================
// Wine Cellar Configuration
// =============================================================================

export const WineCellarConfigSchema = z.object({
  enabled: z.boolean().default(true),
  lowStockThreshold: z.number().min(0).max(10).default(2),
  drinkingWindowAlertDays: z.number().min(7).max(365).default(30),
  peakYearAlertDays: z.number().min(7).max(365).default(60),
  enablePairingSearch: z.boolean().default(true),
  defaultCurrency: z.string().length(3).default('USD'),
  maxWinesPerUser: z.number().min(10).max(10000).default(1000),
  inventoryLocations: z.array(z.string()).default(['cellar', 'wine_fridge', 'rack']),
  notificationChannels: z.array(z.string()).default(['email']),
});

// =============================================================================
// Entertainment Configuration
// =============================================================================

export const EntertainmentConfigSchema = z.object({
  enabled: z.boolean().default(true),
  provider: z.enum(['tmdb', 'tvmaze']).default('tmdb'),
  episodeCheckIntervalHours: z.number().min(1).max(24).default(6),
  releaseAlertDays: z.number().min(1).max(30).default(7),
  maxWatchlistItems: z.number().min(10).max(1000).default(500),
  trackProgress: z.boolean().default(true),
  autoUpdateAirDates: z.boolean().default(true),
  notificationChannels: z.array(z.string()).default(['email', 'push']),
  defaultPriority: z.number().min(1).max(5).default(3),
});

// =============================================================================
// Event Discovery Configuration
// =============================================================================

export const EventDiscoveryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  providers: z.array(z.enum(['ticketmaster', 'eventbrite', 'songkick'])).default(['ticketmaster']),
  checkIntervalHours: z.number().min(1).max(48).default(12),
  defaultRadius: z.number().min(5).max(200).default(50),
  radiusUnit: z.enum(['miles', 'km']).default('miles'),
  maxEventsPerSearch: z.number().min(10).max(200).default(50),
  maxSavedEvents: z.number().min(10).max(500).default(100),
  recommendationScoreThreshold: z.number().min(0).max(1).default(0.6),
  notificationChannels: z.array(z.string()).default(['email', 'push']),
  eventCategories: z.array(z.enum([
    'concert', 'sports', 'theater', 'comedy', 'festival',
    'exhibition', 'conference', 'workshop', 'food_drink', 'other'
  ])).default(['concert', 'sports', 'theater', 'comedy']),
});

// =============================================================================
// Main Lifestyle Configuration
// =============================================================================

export const LifestyleConfigSchema = z.object({
  enabled: z.boolean().default(true),

  // API allowlist (deny-by-default)
  allowedApiDomains: z.array(z.string()).default([
    'api.themoviedb.org',
    'api.tvmaze.com',
    'app.ticketmaster.com',
    'www.eventbriteapi.com',
    'api.songkick.com',
    'api.vivino.com',
  ]),

  // Feature configurations
  wineCellar: WineCellarConfigSchema.optional(),
  entertainment: EntertainmentConfigSchema.optional(),
  eventDiscovery: EventDiscoveryConfigSchema.optional(),

  // Store configuration
  storeType: z.enum(['memory', 'database']).default('database'),

  // Event configuration
  eventBusEnabled: z.boolean().default(true),

  // API keys
  tmdbApiKeyEnvVar: z.string().default('TMDB_API_KEY'),
  ticketmasterApiKeyEnvVar: z.string().default('TICKETMASTER_API_KEY'),
  eventbriteApiKeyEnvVar: z.string().default('EVENTBRITE_API_KEY'),
  vivinoApiKeyEnvVar: z.string().default('VIVINO_API_KEY'),
});

// =============================================================================
// Type Exports
// =============================================================================

export type WineCellarConfig = z.infer<typeof WineCellarConfigSchema>;
export type EntertainmentConfig = z.infer<typeof EntertainmentConfigSchema>;
export type EventDiscoveryConfig = z.infer<typeof EventDiscoveryConfigSchema>;
export type LifestyleConfig = z.infer<typeof LifestyleConfigSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

export function validateLifestyleConfig(config: unknown): LifestyleConfig {
  return LifestyleConfigSchema.parse(config);
}

export function safeParseLifestyleConfig(config: unknown): { success: boolean; data?: LifestyleConfig; error?: string } {
  const result = LifestyleConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
  };
}

export function getDefaultLifestyleConfig(): LifestyleConfig {
  return LifestyleConfigSchema.parse({});
}
