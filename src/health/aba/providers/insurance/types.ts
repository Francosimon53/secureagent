/**
 * Insurance Provider Types
 *
 * Type definitions for insurance payer integrations.
 */

// =============================================================================
// Common Types
// =============================================================================

export interface PersonInfo {
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: string; // CCYYMMDD format
  gender: 'M' | 'F' | 'U';
  memberId: string;
  groupNumber?: string;
}

export interface ProviderInfo {
  npi: string;
  name: string;
  taxId?: string;
  taxonomy?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}

export interface DiagnosisCode {
  code: string;
  codeType: 'ICD10' | 'ICD9';
  isPrimary: boolean;
}

export interface ServiceLine {
  serviceCode: string;
  modifier?: string[];
  quantity: number;
  quantityType: 'UN' | 'MJ' | 'VS'; // Units, Minutes, Visits
  chargeAmount?: number;
  fromDate: string;
  toDate?: string;
}

// =============================================================================
// Eligibility Types
// =============================================================================

export interface EligibilityRequest {
  traceNumber: string;
  subscriber: PersonInfo;
  patient?: PersonInfo;
  provider: ProviderInfo;
  serviceDate?: number;
  serviceTypeCode: string; // e.g., '30' for health benefit plan coverage
}

export interface EligibilityResponse {
  traceNumber: string;
  status: 'active' | 'inactive' | 'unknown';
  subscriberInfo: {
    name: string;
    memberId: string;
    groupNumber?: string;
    planName?: string;
  };
  coverageInfo: {
    effectiveDate?: string;
    terminationDate?: string;
    planType?: string;
    networkStatus?: 'in-network' | 'out-of-network' | 'unknown';
  };
  benefits: BenefitInfo[];
  errors?: EligibilityError[];
  rawResponse?: string;
}

export interface BenefitInfo {
  serviceType: string;
  serviceTypeDescription: string;
  coverageLevel: 'individual' | 'family' | 'employee-only';
  inNetwork: boolean;
  benefitAmount?: number;
  benefitPercent?: number;
  deductible?: number;
  deductibleRemaining?: number;
  outOfPocketMax?: number;
  outOfPocketRemaining?: number;
  copay?: number;
  coinsurance?: number;
  authorizationRequired: boolean;
  quantityLimit?: number;
  quantityLimitPeriod?: string;
  notes?: string[];
}

export interface EligibilityError {
  code: string;
  message: string;
  followUpAction?: string;
}

// =============================================================================
// Authorization Types
// =============================================================================

export interface AuthorizationRequest {
  traceNumber: string;
  subscriber: PersonInfo;
  patient?: PersonInfo;
  provider: ProviderInfo;
  referringProvider?: ProviderInfo;
  serviceTypeCode: string;
  levelOfService: string;
  startDate: number;
  endDate: number;
  quantity: number;
  quantityType: 'UN' | 'MJ' | 'VS';
  diagnosisCodes: string[];
  procedureCodes?: string[];
  placeOfService: string;
  facilityCode?: string;
  clinicalInfo?: string;
  attachments?: AuthorizationAttachment[];
}

export interface AuthorizationAttachment {
  type: 'clinical-notes' | 'treatment-plan' | 'assessment' | 'other';
  fileName: string;
  contentType: string;
  content: string; // Base64 encoded
}

export interface AuthorizationResponse {
  traceNumber: string;
  authorizationNumber?: string;
  status: 'approved' | 'denied' | 'pending' | 'pend' | 'modified' | 'cancelled';
  statusReason?: string;
  certificationNumber?: string;
  effectiveDate?: string;
  expirationDate?: string;
  approvedQuantity?: number;
  approvedQuantityType?: string;
  approvedServiceCodes?: string[];
  denialReasonCode?: string;
  denialReasonDescription?: string;
  pendReasonCode?: string;
  pendReasonDescription?: string;
  additionalInfoRequired?: string[];
  contactInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  errors?: AuthorizationError[];
  rawResponse?: string;
}

export interface AuthorizationError {
  code: string;
  message: string;
  location?: string;
}

// =============================================================================
// Claim Types
// =============================================================================

export interface ClaimSubmission {
  traceNumber: string;
  claimType: 'professional' | 'institutional';
  subscriber: PersonInfo;
  patient?: PersonInfo;
  billingProvider: ProviderInfo;
  renderingProvider?: ProviderInfo;
  referringProvider?: ProviderInfo;
  authorizationNumber?: string;
  diagnosisCodes: DiagnosisCode[];
  serviceLines: ServiceLine[];
  totalChargeAmount: number;
  patientAccountNumber?: string;
  claimFilingIndicator: string; // e.g., 'CI' for commercial insurance
  assignmentOfBenefits: boolean;
  releaseOfInformation: boolean;
  signatureOnFile: boolean;
  acceptAssignment: boolean;
  attachments?: ClaimAttachment[];
}

export interface ClaimAttachment {
  type: string;
  controlNumber: string;
  fileName: string;
  contentType: string;
  content: string; // Base64 encoded
}

export interface ClaimResponse {
  traceNumber: string;
  claimNumber?: string;
  payerClaimNumber?: string;
  status: 'accepted' | 'rejected' | 'pending' | 'paid' | 'denied';
  statusDate?: string;
  acceptedLineItems?: number;
  rejectedLineItems?: number;
  totalChargeAmount?: number;
  paidAmount?: number;
  patientResponsibility?: number;
  adjustments?: ClaimAdjustment[];
  lineItemStatus?: LineItemStatus[];
  errors?: ClaimError[];
  rawResponse?: string;
}

export interface ClaimAdjustment {
  groupCode: string;
  reasonCode: string;
  amount: number;
  quantity?: number;
}

export interface LineItemStatus {
  lineNumber: number;
  serviceCode: string;
  status: 'accepted' | 'rejected' | 'modified';
  chargeAmount: number;
  paidAmount?: number;
  adjustmentReasonCode?: string;
  adjustmentAmount?: number;
  remark?: string;
}

export interface ClaimError {
  code: string;
  message: string;
  lineNumber?: number;
  field?: string;
}

// =============================================================================
// Payer Template Types
// =============================================================================

export interface PayerTemplate {
  payerId: string;
  payerName: string;
  clearinghouse: 'availity' | 'change-healthcare' | 'direct';
  supportedTransactions: SupportedTransaction[];
  authorizationRequirements?: AuthorizationRequirements;
  claimRequirements?: ClaimRequirements;
  contactInfo: PayerContactInfo;
  submissionGuidelines?: string[];
}

export interface SupportedTransaction {
  type: '270' | '271' | '276' | '277' | '278' | '837P' | '837I' | '835';
  description: string;
  version: string;
  supported: boolean;
}

export interface AuthorizationRequirements {
  requiresAuth: boolean;
  serviceCodes: string[];
  lookbackDays?: number;
  maxUnitsPerAuth?: number;
  renewalLeadDays?: number;
  supportsConcurrentReview: boolean;
  requiresProgressNotes: boolean;
  requiresTreatmentPlan: boolean;
  turnaroundDays: number;
}

export interface ClaimRequirements {
  timelyFilingDays: number;
  requiresAuthNumber: boolean;
  requiresReferral: boolean;
  acceptsElectronic: boolean;
  requiresNPI: boolean;
  modifiersRequired?: string[];
  billingGuidelines?: string[];
}

export interface PayerContactInfo {
  providerServices: {
    phone: string;
    hours?: string;
  };
  authorizationDept?: {
    phone: string;
    fax?: string;
    email?: string;
    portal?: string;
  };
  claimsDept?: {
    phone: string;
    address?: string;
  };
  portalUrl?: string;
}
