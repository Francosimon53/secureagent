/**
 * Savings Module Configuration Schema
 *
 * Zod schemas for validating savings module configuration.
 */

import { z } from 'zod';

// =============================================================================
// Negotiation Configuration
// =============================================================================

export const NegotiationConfigSchema = z.object({
  enabled: z.boolean().default(true),
  emailProvider: z.enum(['smtp', 'sendgrid', 'ses']).default('smtp'),
  maxConcurrentNegotiations: z.number().min(1).max(20).default(5),
  defaultFollowUpDays: z.number().min(1).max(30).default(7),
  smtpConfig: z.object({
    host: z.string().optional(),
    port: z.number().min(1).max(65535).default(587),
    secure: z.boolean().default(true),
    authEnvVar: z.string().default('SMTP_AUTH'),
  }).optional(),
});

// =============================================================================
// Shopping & 2FA Configuration
// =============================================================================

export const SMS2FABridgeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['twilio', 'vonage', 'messagebird']).default('twilio'),
  sessionTimeoutSeconds: z.number().min(60).max(600).default(300),
  requireExplicitConsent: z.boolean().default(true),
  maxSessionsPerHour: z.number().min(1).max(20).default(5),
  auditAllOperations: z.boolean().default(true),
});

export const ShoppingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  sessionTimeoutMinutes: z.number().min(5).max(60).default(30),
  maxItemsPerSession: z.number().min(1).max(100).default(50),
  requireExplicitConsent: z.boolean().default(true),
  sms2faBridge: SMS2FABridgeConfigSchema.optional(),
  allowedRetailers: z.array(z.string()).default([]),
});

// =============================================================================
// Price Monitoring Configuration
// =============================================================================

export const PriceMonitoringConfigSchema = z.object({
  enabled: z.boolean().default(true),
  checkIntervalMinutes: z.number().min(15).max(1440).default(60),
  maxAlertsPerUser: z.number().min(1).max(200).default(50),
  historyRetentionDays: z.number().min(7).max(365).default(90),
  batchSize: z.number().min(5).max(100).default(20),
  providers: z.array(z.string()).default([]),
  notificationChannels: z.array(z.string()).default(['email']),
});

// =============================================================================
// Insurance Configuration
// =============================================================================

export const InsuranceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  encryptPII: z.boolean().default(true),
  encryptionKeyEnvVar: z.string().default('INSURANCE_ENCRYPTION_KEY'),
  maxDocumentSizeMB: z.number().min(1).max(50).default(10),
  allowedDocumentTypes: z.array(z.string()).default([
    'image/jpeg',
    'image/png',
    'image/heic',
    'application/pdf',
  ]),
  retentionDays: z.number().min(30).max(3650).default(365),
});

// =============================================================================
// Expense Configuration
// =============================================================================

export const ExpenseConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultCurrency: z.string().length(3).default('USD'),
  splitRequestProvider: z.enum(['email', 'venmo', 'paypal', 'manual']).default('email'),
  autoReminderDays: z.array(z.number().min(1).max(30)).default([3, 7, 14]),
  maxSplitMembers: z.number().min(2).max(50).default(20),
  roundingPrecision: z.number().min(0).max(4).default(2),
});

// =============================================================================
// Bills Configuration
// =============================================================================

export const BillsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultReminderDays: z.array(z.number().min(1).max(30)).default([7, 3, 1]),
  overdueGraceDays: z.number().min(0).max(30).default(3),
  maxBillsPerUser: z.number().min(10).max(500).default(100),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format').default('09:00'),
});

// =============================================================================
// Subscriptions Configuration
// =============================================================================

export const SubscriptionsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  detectFromTransactions: z.boolean().default(true),
  unusedThresholdDays: z.number().min(7).max(180).default(30),
  renewalReminderDays: z.number().min(1).max(30).default(7),
  maxSubscriptionsPerUser: z.number().min(10).max(500).default(100),
  transactionLookbackDays: z.number().min(30).max(365).default(90),
  detectionConfidenceThreshold: z.number().min(0).max(1).default(0.7),
});

// =============================================================================
// Main Savings Configuration
// =============================================================================

export const SavingsConfigSchema = z.object({
  enabled: z.boolean().default(true),

  // API allowlist (deny-by-default)
  allowedApiDomains: z.array(z.string()).default([
    'api.stripe.com',
    'api.plaid.com',
    'api.twilio.com',
    'api.sendgrid.com',
  ]),

  // Feature configurations
  negotiation: NegotiationConfigSchema.optional(),
  shopping: ShoppingConfigSchema.optional(),
  priceMonitoring: PriceMonitoringConfigSchema.optional(),
  insurance: InsuranceConfigSchema.optional(),
  expenses: ExpenseConfigSchema.optional(),
  bills: BillsConfigSchema.optional(),
  subscriptions: SubscriptionsConfigSchema.optional(),

  // Store configuration
  storeType: z.enum(['memory', 'database']).default('database'),

  // Event configuration
  eventBusEnabled: z.boolean().default(true),
});

// =============================================================================
// Type Exports
// =============================================================================

export type NegotiationConfig = z.infer<typeof NegotiationConfigSchema>;
export type SMS2FABridgeConfig = z.infer<typeof SMS2FABridgeConfigSchema>;
export type ShoppingConfig = z.infer<typeof ShoppingConfigSchema>;
export type PriceMonitoringConfig = z.infer<typeof PriceMonitoringConfigSchema>;
export type InsuranceConfig = z.infer<typeof InsuranceConfigSchema>;
export type ExpenseConfig = z.infer<typeof ExpenseConfigSchema>;
export type BillsConfig = z.infer<typeof BillsConfigSchema>;
export type SubscriptionsConfig = z.infer<typeof SubscriptionsConfigSchema>;
export type SavingsConfig = z.infer<typeof SavingsConfigSchema>;
