/**
 * Travel Module Configuration Schema
 *
 * Zod schemas for validating travel module configuration.
 */

import { z } from 'zod';

// =============================================================================
// Check-In Configuration
// =============================================================================

export const CheckInConfigSchema = z.object({
  enabled: z.boolean().default(true),
  autoCheckInEnabled: z.boolean().default(true),
  checkInAdvanceMinutes: z.number().min(0).max(60).default(1),
  maxRetries: z.number().min(1).max(5).default(3),
  preferredSeatCategories: z.array(
    z.enum(['window', 'aisle', 'front', 'exit_row', 'extra_legroom', 'bulkhead'])
  ).default(['aisle']),
  retryDelayMs: z.number().min(1000).max(60000).default(5000),
  supportedAirlines: z.array(z.string()).default([
    'united', 'delta', 'southwest', 'american', 'jetblue'
  ]),
});

// =============================================================================
// Price Monitoring Configuration
// =============================================================================

export const TravelPriceMonitoringConfigSchema = z.object({
  enabled: z.boolean().default(true),
  flightCheckIntervalMinutes: z.number().min(60).max(1440).default(360),
  hotelCheckIntervalMinutes: z.number().min(60).max(1440).default(720),
  maxAlertsPerUser: z.number().min(1).max(50).default(20),
  historyRetentionDays: z.number().min(7).max(365).default(90),
  notificationChannels: z.array(z.string()).default(['email']),
  aggregators: z.array(z.string()).default(['google_flights', 'kayak']),
});

// =============================================================================
// Car Rental Configuration
// =============================================================================

export const CarRentalConfigSchema = z.object({
  enabled: z.boolean().default(true),
  providers: z.array(z.string()).default(['enterprise', 'hertz', 'national', 'avis', 'budget']),
  cacheResultsMinutes: z.number().min(5).max(60).default(15),
  maxQuotesPerSearch: z.number().min(5).max(50).default(20),
  defaultVehicleClasses: z.array(z.string()).default(['economy', 'compact', 'midsize', 'suv']),
});

// =============================================================================
// Itinerary Configuration
// =============================================================================

export const ItineraryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultReminderMinutes: z.array(z.number()).default([1440, 60, 15]),
  calendarSyncEnabled: z.boolean().default(true),
  calendarProvider: z.enum(['google', 'outlook', 'ical']).default('google'),
  includeLayovers: z.boolean().default(true),
  autoGenerateReminders: z.boolean().default(true),
});

// =============================================================================
// Departure Alerts Configuration
// =============================================================================

export const DepartureAlertsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  trafficProvider: z.enum(['google_maps', 'here']).default('google_maps'),
  checkIntervalMinutes: z.number().min(5).max(60).default(15),
  defaultBufferMinutes: z.object({
    airport: z.number().min(30).max(240).default(120),
    hotel: z.number().min(10).max(120).default(30),
    activity: z.number().min(10).max(120).default(30),
    car_rental: z.number().min(15).max(180).default(60),
  }).default({}),
  startMonitoringHoursBefore: z.number().min(1).max(24).default(4),
  maxActiveAlerts: z.number().min(1).max(20).default(10),
  notificationChannels: z.array(z.string()).default(['push', 'sms']),
});

// =============================================================================
// Main Travel Configuration
// =============================================================================

export const TravelConfigSchema = z.object({
  enabled: z.boolean().default(true),

  // API allowlist (deny-by-default)
  allowedApiDomains: z.array(z.string()).default([
    'www.googleapis.com',
    'maps.googleapis.com',
    'api.flightaware.com',
    'api.kayak.com',
  ]),

  // Feature configurations
  checkIn: CheckInConfigSchema.optional(),
  priceMonitoring: TravelPriceMonitoringConfigSchema.optional(),
  carRental: CarRentalConfigSchema.optional(),
  itinerary: ItineraryConfigSchema.optional(),
  departureAlerts: DepartureAlertsConfigSchema.optional(),

  // Store configuration
  storeType: z.enum(['memory', 'database']).default('database'),

  // Event configuration
  eventBusEnabled: z.boolean().default(true),

  // API keys
  trafficApiKeyEnvVar: z.string().default('GOOGLE_MAPS_API_KEY'),
  flightApiKeyEnvVar: z.string().default('FLIGHT_API_KEY'),
});

// =============================================================================
// Type Exports
// =============================================================================

export type CheckInConfig = z.infer<typeof CheckInConfigSchema>;
export type TravelPriceMonitoringConfig = z.infer<typeof TravelPriceMonitoringConfigSchema>;
export type CarRentalConfig = z.infer<typeof CarRentalConfigSchema>;
export type ItineraryConfig = z.infer<typeof ItineraryConfigSchema>;
export type DepartureAlertsConfig = z.infer<typeof DepartureAlertsConfigSchema>;
export type TravelConfig = z.infer<typeof TravelConfigSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

export function validateTravelConfig(config: unknown): TravelConfig {
  return TravelConfigSchema.parse(config);
}

export function safeParseTravelConfig(config: unknown): { success: boolean; data?: TravelConfig; error?: string } {
  const result = TravelConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
  };
}

export function getDefaultTravelConfig(): TravelConfig {
  return TravelConfigSchema.parse({});
}
