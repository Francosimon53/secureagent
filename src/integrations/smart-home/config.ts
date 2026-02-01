/**
 * Smart Home Integration - Configuration Schemas
 */

import { z } from 'zod';

// Philips Hue config
export const HueConfigSchema = z.object({
  bridgeIp: z.string().ip().optional(),
  username: z.string().optional(), // API key from bridge pairing
  clientKey: z.string().optional(), // For entertainment API
  autoDiscover: z.boolean().default(true),
});

export type HueConfig = z.infer<typeof HueConfigSchema>;

// Home Assistant config
export const HomeAssistantConfigSchema = z.object({
  url: z.string().url(),
  accessToken: z.string(),
  useWebSocket: z.boolean().default(true),
  verifySSL: z.boolean().default(true),
});

export type HomeAssistantConfig = z.infer<typeof HomeAssistantConfigSchema>;

// TP-Link Kasa config
export const KasaConfigSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().optional(),
  autoDiscover: z.boolean().default(true),
  discoveryTimeout: z.number().default(5000),
});

export type KasaConfig = z.infer<typeof KasaConfigSchema>;

// TP-Link Tapo config
export const TapoConfigSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  autoDiscover: z.boolean().default(true),
});

export type TapoConfig = z.infer<typeof TapoConfigSchema>;

// Nest config
export const NestConfigSchema = z.object({
  projectId: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
});

export type NestConfig = z.infer<typeof NestConfigSchema>;

// Ecobee config
export const EcobeeConfigSchema = z.object({
  apiKey: z.string(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  pin: z.string().optional(), // For initial auth
});

export type EcobeeConfig = z.infer<typeof EcobeeConfigSchema>;

// Ring config
export const RingConfigSchema = z.object({
  refreshToken: z.string(),
  controlCenterDisplayName: z.string().default('SecureAgent'),
});

export type RingConfig = z.infer<typeof RingConfigSchema>;

// Main smart home config
export const SmartHomeConfigSchema = z.object({
  enabled: z.boolean().default(true),

  hue: HueConfigSchema.optional(),
  homeAssistant: HomeAssistantConfigSchema.optional(),
  kasa: KasaConfigSchema.optional(),
  tapo: TapoConfigSchema.optional(),
  nest: NestConfigSchema.optional(),
  ecobee: EcobeeConfigSchema.optional(),
  ring: RingConfigSchema.optional(),

  // General settings
  pollingInterval: z.number().default(30000), // ms
  enableAutoDiscovery: z.boolean().default(true),
  enableRoutines: z.boolean().default(true),

  // Natural language settings
  roomAliases: z.record(z.string(), z.array(z.string())).default({}),
  deviceAliases: z.record(z.string(), z.array(z.string())).default({}),
});

export type SmartHomeConfig = z.infer<typeof SmartHomeConfigSchema>;

// Default config
export const defaultSmartHomeConfig: SmartHomeConfig = {
  enabled: true,
  pollingInterval: 30000,
  enableAutoDiscovery: true,
  enableRoutines: true,
  roomAliases: {},
  deviceAliases: {},
};
