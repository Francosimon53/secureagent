/**
 * Wellness Providers Index
 *
 * Exports all wellness data providers and base classes.
 */

// Base classes and registry
export {
  BaseWellnessProvider,
  OAuthWellnessProvider,
  OAuth1WellnessProvider,
  WellnessProviderRegistry,
  getWellnessProviderRegistry,
  initWellnessProviderRegistry,
  isWellnessProviderRegistryInitialized,
  type ProviderConfig,
  type OAuthProviderConfig,
  type OAuth1ProviderConfig,
  type ProviderResult,
  type TokenResponse,
  type OAuth1TokenResponse,
  type SyncCapableProvider,
} from './base.js';

// WHOOP Provider
export {
  WhoopProvider,
  createWhoopProvider,
  type WhoopConfig,
} from './whoop.js';

// Garmin Provider
export {
  GarminProvider,
  createGarminProvider,
  type GarminConfig,
} from './garmin.js';

// Apple Health Provider
export {
  AppleHealthProvider,
  createAppleHealthProvider,
  type AppleHealthConfig,
  type AppleHealthImportResult,
} from './apple-health.js';
