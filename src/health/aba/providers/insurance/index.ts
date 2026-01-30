/**
 * Insurance Provider Index
 *
 * Exports insurance payer integration components.
 */

// Types
export type {
  PersonInfo,
  ProviderInfo,
  DiagnosisCode,
  ServiceLine,
  EligibilityRequest,
  EligibilityResponse,
  BenefitInfo,
  EligibilityError,
  AuthorizationRequest,
  AuthorizationAttachment,
  AuthorizationResponse,
  AuthorizationError,
  ClaimSubmission,
  ClaimAttachment,
  ClaimResponse,
  ClaimAdjustment,
  LineItemStatus,
  ClaimError,
  PayerTemplate,
  SupportedTransaction,
  AuthorizationRequirements,
  ClaimRequirements,
  PayerContactInfo,
} from './types.js';

// Base Provider
export {
  BasePayerProvider,
  type PayerProviderConfig,
} from './base-payer-provider.js';

// Payer Templates
export {
  BCBSTemplate,
  BCBSStateTemplates,
  getBCBSTemplate,
  AetnaTemplate,
  CignaTemplate,
  UnitedHealthcareTemplate,
  MedicaidTemplate,
  getPayerTemplate,
  getAllPayerTemplates,
  registerPayerTemplate,
} from './payer-templates/index.js';
