/**
 * Health ABA Providers Index
 *
 * Exports all provider interfaces, implementations, and registries
 */

// Base Provider
export {
  BaseHealthProvider,
  HealthProviderError,
  RateLimiter,
  HealthProviderRegistry,
  healthProviderRegistry,
  type HealthProviderConfig,
  type HealthProviderResult,
} from './base.js';

// Notification Providers
export {
  type NotificationProvider,
  type NotificationRecipient,
  type NotificationMessage,
  type NotificationResult,
  SMSNotificationProvider,
  EmailNotificationProvider,
  VoiceNotificationProvider,
} from './notification/index.js';

// Insurance Providers
export {
  BasePayerProvider,
  type PayerProviderConfig,
  type PersonInfo,
  type ProviderInfo,
  type EligibilityRequest,
  type EligibilityResponse,
  BCBSTemplate,
  AetnaTemplate,
  CignaTemplate,
  UnitedHealthcareTemplate,
  MedicaidTemplate,
  getPayerTemplate,
  getAllPayerTemplates,
  registerPayerTemplate,
} from './insurance/index.js';

// Re-export insurance-specific types with qualified names to avoid conflicts with types.ts versions
export type {
  AuthorizationRequest as InsuranceAuthorizationRequest,
  AuthorizationResponse as InsuranceAuthorizationResponse,
  ClaimSubmission as InsuranceClaimSubmission,
  ClaimResponse as InsuranceClaimResponse,
  PayerTemplate as InsurancePayerTemplate,
} from './insurance/index.js';

// EHR Providers (placeholder)
export {
  BaseEHRProvider,
  PlaceholderEHRProvider,
  type EHRProviderConfig,
  type PatientSyncResult,
  type AppointmentSyncResult,
} from './ehr/index.js';
