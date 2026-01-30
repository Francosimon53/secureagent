/**
 * Payer Templates Index
 *
 * Exports all payer-specific templates and utilities.
 */

import type { PayerTemplate } from '../types.js';

// Export individual templates
export { BCBSTemplate, BCBSStateTemplates, getBCBSTemplate } from './bcbs-template.js';

// =============================================================================
// Generic Payer Templates
// =============================================================================

/**
 * Aetna Template
 */
export const AetnaTemplate: PayerTemplate = {
  payerId: 'AETNA',
  payerName: 'Aetna',
  clearinghouse: 'availity',
  supportedTransactions: [
    { type: '270', description: 'Eligibility Inquiry', version: '005010X279A1', supported: true },
    { type: '271', description: 'Eligibility Response', version: '005010X279A1', supported: true },
    { type: '276', description: 'Claim Status Inquiry', version: '005010X212', supported: true },
    { type: '277', description: 'Claim Status Response', version: '005010X212', supported: true },
    { type: '278', description: 'Health Care Services Review', version: '005010X217', supported: true },
    { type: '837P', description: 'Professional Claim', version: '005010X222A1', supported: true },
    { type: '835', description: 'Payment/Remittance', version: '005010X221A1', supported: true },
  ],
  authorizationRequirements: {
    requiresAuth: true,
    serviceCodes: ['97151', '97152', '97153', '97154', '97155', '97156', '97157', '97158'],
    lookbackDays: 14,
    maxUnitsPerAuth: 720,
    renewalLeadDays: 30,
    supportsConcurrentReview: true,
    requiresProgressNotes: true,
    requiresTreatmentPlan: true,
    turnaroundDays: 14,
  },
  claimRequirements: {
    timelyFilingDays: 365,
    requiresAuthNumber: true,
    requiresReferral: false,
    acceptsElectronic: true,
    requiresNPI: true,
    modifiersRequired: ['HM', 'HN', 'HO'],
    billingGuidelines: [
      'Authorization required for all ABA services',
      'Bill with appropriate credential modifier (HM, HN, HO)',
      'Use place of service 12 for home-based',
      'Progress notes required every 90 days',
    ],
  },
  contactInfo: {
    providerServices: {
      phone: '1-800-624-0756',
      hours: 'Monday-Friday 8am-6pm EST',
    },
    authorizationDept: {
      phone: '1-800-624-0756',
      portal: 'https://www.availity.com',
    },
    claimsDept: {
      phone: '1-800-624-0756',
    },
    portalUrl: 'https://www.aetna.com/providerportal',
  },
  submissionGuidelines: [
    'Use Availity portal for authorization submissions',
    'Treatment plan must include SMART goals',
    'Functional assessment required within 30 days of start of care',
  ],
};

/**
 * Cigna Template
 */
export const CignaTemplate: PayerTemplate = {
  payerId: 'CIGNA',
  payerName: 'Cigna',
  clearinghouse: 'availity',
  supportedTransactions: [
    { type: '270', description: 'Eligibility Inquiry', version: '005010X279A1', supported: true },
    { type: '271', description: 'Eligibility Response', version: '005010X279A1', supported: true },
    { type: '276', description: 'Claim Status Inquiry', version: '005010X212', supported: true },
    { type: '277', description: 'Claim Status Response', version: '005010X212', supported: true },
    { type: '278', description: 'Health Care Services Review', version: '005010X217', supported: true },
    { type: '837P', description: 'Professional Claim', version: '005010X222A1', supported: true },
    { type: '835', description: 'Payment/Remittance', version: '005010X221A1', supported: true },
  ],
  authorizationRequirements: {
    requiresAuth: true,
    serviceCodes: ['97151', '97152', '97153', '97154', '97155', '97156', '97157', '97158'],
    lookbackDays: 30,
    maxUnitsPerAuth: 800,
    renewalLeadDays: 30,
    supportsConcurrentReview: true,
    requiresProgressNotes: true,
    requiresTreatmentPlan: true,
    turnaroundDays: 12,
  },
  claimRequirements: {
    timelyFilingDays: 365,
    requiresAuthNumber: true,
    requiresReferral: false,
    acceptsElectronic: true,
    requiresNPI: true,
    modifiersRequired: ['HM', 'HN', 'HO'],
    billingGuidelines: [
      'Submit authorization through Evicore',
      'All services require prior authorization',
      'Include session notes with claims over 4 units/day',
    ],
  },
  contactInfo: {
    providerServices: {
      phone: '1-800-88-CIGNA',
      hours: 'Monday-Friday 8am-8pm EST',
    },
    authorizationDept: {
      phone: '1-888-693-3211',
      portal: 'https://www.evicore.com',
    },
    claimsDept: {
      phone: '1-800-88-CIGNA',
    },
    portalUrl: 'https://cignaforhcp.cigna.com',
  },
  submissionGuidelines: [
    'Use Evicore for all authorization requests',
    'Include standardized autism assessment results',
    'BCBA must sign treatment plan',
  ],
};

/**
 * UnitedHealthcare Template
 */
export const UnitedHealthcareTemplate: PayerTemplate = {
  payerId: 'UHC',
  payerName: 'UnitedHealthcare',
  clearinghouse: 'change-healthcare',
  supportedTransactions: [
    { type: '270', description: 'Eligibility Inquiry', version: '005010X279A1', supported: true },
    { type: '271', description: 'Eligibility Response', version: '005010X279A1', supported: true },
    { type: '276', description: 'Claim Status Inquiry', version: '005010X212', supported: true },
    { type: '277', description: 'Claim Status Response', version: '005010X212', supported: true },
    { type: '278', description: 'Health Care Services Review', version: '005010X217', supported: true },
    { type: '837P', description: 'Professional Claim', version: '005010X222A1', supported: true },
    { type: '835', description: 'Payment/Remittance', version: '005010X221A1', supported: true },
  ],
  authorizationRequirements: {
    requiresAuth: true,
    serviceCodes: ['97151', '97152', '97153', '97154', '97155', '97156', '97157', '97158'],
    lookbackDays: 30,
    maxUnitsPerAuth: 800,
    renewalLeadDays: 30,
    supportsConcurrentReview: true,
    requiresProgressNotes: true,
    requiresTreatmentPlan: true,
    turnaroundDays: 14,
  },
  claimRequirements: {
    timelyFilingDays: 365,
    requiresAuthNumber: true,
    requiresReferral: false,
    acceptsElectronic: true,
    requiresNPI: true,
    modifiersRequired: ['HM', 'HN', 'HO', 'XE', 'XP', 'XS', 'XU'],
    billingGuidelines: [
      'Use Optum ABA portal for authorizations',
      'Modifier XE/XP/XS/XU required for multiple procedures',
      'Include diagnosis codes on all claims',
      'Bill supervision separately with 97155',
    ],
  },
  contactInfo: {
    providerServices: {
      phone: '1-877-842-3210',
      hours: 'Monday-Friday 8am-8pm EST',
    },
    authorizationDept: {
      phone: '1-866-261-7673',
      portal: 'https://www.myoptumhealthcareaba.com',
    },
    claimsDept: {
      phone: '1-877-842-3210',
    },
    portalUrl: 'https://www.uhcprovider.com',
  },
  submissionGuidelines: [
    'Register for Optum ABA portal access',
    'Submit initial assessment within 30 days',
    'Quarterly progress reports required',
    'Parent training must be documented separately',
  ],
};

/**
 * Medicaid Template (Generic)
 */
export const MedicaidTemplate: PayerTemplate = {
  payerId: 'MEDICAID',
  payerName: 'Medicaid',
  clearinghouse: 'direct',
  supportedTransactions: [
    { type: '270', description: 'Eligibility Inquiry', version: '005010X279A1', supported: true },
    { type: '271', description: 'Eligibility Response', version: '005010X279A1', supported: true },
    { type: '278', description: 'Health Care Services Review', version: '005010X217', supported: true },
    { type: '837P', description: 'Professional Claim', version: '005010X222A1', supported: true },
  ],
  authorizationRequirements: {
    requiresAuth: true,
    serviceCodes: ['97151', '97152', '97153', '97154', '97155', '97156', '97157', '97158', 'H2019', 'T1027'],
    lookbackDays: 0, // Must have auth before starting
    maxUnitsPerAuth: 2080, // Varies by state
    renewalLeadDays: 60,
    supportsConcurrentReview: false,
    requiresProgressNotes: true,
    requiresTreatmentPlan: true,
    turnaroundDays: 21, // Federal requirement
  },
  claimRequirements: {
    timelyFilingDays: 365, // Varies by state
    requiresAuthNumber: true,
    requiresReferral: true,
    acceptsElectronic: true,
    requiresNPI: true,
    modifiersRequired: ['HM', 'HN', 'HO', 'U1', 'U2', 'U3'],
    billingGuidelines: [
      'State-specific codes may be required (H2019, T1027)',
      'Physician referral required',
      'Medicaid ID must be active on date of service',
      'EVV (Electronic Visit Verification) required in many states',
    ],
  },
  contactInfo: {
    providerServices: {
      phone: 'State-specific',
      hours: 'Varies by state',
    },
    authorizationDept: {
      phone: 'State-specific',
    },
    claimsDept: {
      phone: 'State-specific',
    },
    portalUrl: 'State-specific',
  },
  submissionGuidelines: [
    'Check state-specific Medicaid requirements',
    'Maintain active provider enrollment',
    'Physician order required within 12 months',
    'EPSDT may provide additional coverage for children',
  ],
};

// =============================================================================
// Template Registry
// =============================================================================

const PAYER_TEMPLATES: Map<string, PayerTemplate> = new Map([
  ['AETNA', AetnaTemplate],
  ['CIGNA', CignaTemplate],
  ['UHC', UnitedHealthcareTemplate],
  ['MEDICAID', MedicaidTemplate],
]);

/**
 * Get payer template by ID
 */
export function getPayerTemplate(payerId: string): PayerTemplate | undefined {
  // Check direct match
  const template = PAYER_TEMPLATES.get(payerId.toUpperCase());
  if (template) return template;

  // Check BCBS variations
  if (payerId.toUpperCase().startsWith('BCBS')) {
    const { getBCBSTemplate } = require('./bcbs-template.js');
    const stateCode = payerId.slice(4);
    return getBCBSTemplate(stateCode);
  }

  return undefined;
}

/**
 * Get all available payer templates
 */
export function getAllPayerTemplates(): PayerTemplate[] {
  const { BCBSTemplate } = require('./bcbs-template.js');
  return [BCBSTemplate, AetnaTemplate, CignaTemplate, UnitedHealthcareTemplate, MedicaidTemplate];
}

/**
 * Register a custom payer template
 */
export function registerPayerTemplate(template: PayerTemplate): void {
  PAYER_TEMPLATES.set(template.payerId.toUpperCase(), template);
}
