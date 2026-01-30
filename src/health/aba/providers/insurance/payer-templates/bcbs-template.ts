/**
 * BCBS (Blue Cross Blue Shield) Payer Template
 *
 * Configuration and requirements for BCBS payers.
 * Note: BCBS is a federation of independent companies, requirements may vary by state.
 */

import type { PayerTemplate } from '../types.js';

// =============================================================================
// BCBS Template
// =============================================================================

export const BCBSTemplate: PayerTemplate = {
  payerId: 'BCBS', // Generic, actual ID varies by state
  payerName: 'Blue Cross Blue Shield',
  clearinghouse: 'availity',
  supportedTransactions: [
    { type: '270', description: 'Eligibility Inquiry', version: '005010X279A1', supported: true },
    { type: '271', description: 'Eligibility Response', version: '005010X279A1', supported: true },
    { type: '276', description: 'Claim Status Inquiry', version: '005010X212', supported: true },
    { type: '277', description: 'Claim Status Response', version: '005010X212', supported: true },
    { type: '278', description: 'Health Care Services Review', version: '005010X217', supported: true },
    { type: '837P', description: 'Professional Claim', version: '005010X222A1', supported: true },
    { type: '837I', description: 'Institutional Claim', version: '005010X223A2', supported: true },
    { type: '835', description: 'Payment/Remittance', version: '005010X221A1', supported: true },
  ],
  authorizationRequirements: {
    requiresAuth: true,
    serviceCodes: ['97151', '97152', '97153', '97154', '97155', '97156', '97157', '97158'],
    lookbackDays: 30,
    maxUnitsPerAuth: 960, // ~240 hours
    renewalLeadDays: 30,
    supportsConcurrentReview: true,
    requiresProgressNotes: true,
    requiresTreatmentPlan: true,
    turnaroundDays: 10,
  },
  claimRequirements: {
    timelyFilingDays: 365,
    requiresAuthNumber: true,
    requiresReferral: false,
    acceptsElectronic: true,
    requiresNPI: true,
    modifiersRequired: ['GT', 'HM', 'HN'],
    billingGuidelines: [
      'Use GT modifier for telehealth services',
      'HM modifier required for less than bachelor\'s degree',
      'HN modifier required for bachelor\'s degree',
      'Bill in 15-minute increments',
      'Maximum 8 hours per day for 97153',
      'Supervision ratio must be documented',
    ],
  },
  contactInfo: {
    providerServices: {
      phone: '1-800-676-BLUE (2583)',
      hours: 'Monday-Friday 8am-8pm EST',
    },
    authorizationDept: {
      phone: '1-800-676-BLUE (2583)',
      fax: '1-800-676-3296',
      portal: 'https://www.availity.com',
    },
    claimsDept: {
      phone: '1-800-676-BLUE (2583)',
    },
    portalUrl: 'https://www.availity.com',
  },
  submissionGuidelines: [
    'Initial authorization request must include comprehensive assessment',
    'Treatment plan with measurable goals required',
    'Progress notes must be submitted with reauthorization requests',
    'Parent/caregiver training documentation required',
    'Supervision notes must be included',
  ],
};

// =============================================================================
// State-Specific BCBS Templates
// =============================================================================

export const BCBSStateTemplates: Record<string, Partial<PayerTemplate>> = {
  // BCBS of Texas
  TX: {
    payerId: 'BCBSTX',
    payerName: 'Blue Cross Blue Shield of Texas',
    authorizationRequirements: {
      requiresAuth: true,
      serviceCodes: ['97151', '97152', '97153', '97154', '97155', '97156', '97157', '97158'],
      lookbackDays: 30,
      maxUnitsPerAuth: 960,
      renewalLeadDays: 30,
      supportsConcurrentReview: true,
      requiresProgressNotes: true,
      requiresTreatmentPlan: true,
      turnaroundDays: 14,
    },
    contactInfo: {
      providerServices: {
        phone: '1-800-451-0287',
        hours: 'Monday-Friday 7am-7pm CST',
      },
      authorizationDept: {
        phone: '1-800-451-0287',
        fax: '1-888-346-1029',
        portal: 'https://www.bcbstx.com/provider',
      },
      claimsDept: {
        phone: '1-800-451-0287',
        address: 'PO Box 660044, Dallas, TX 75266-0044',
      },
      portalUrl: 'https://www.bcbstx.com/provider',
    },
  },

  // BCBS of California (Anthem)
  CA: {
    payerId: 'ANTHEM_CA',
    payerName: 'Anthem Blue Cross of California',
    authorizationRequirements: {
      requiresAuth: true,
      serviceCodes: ['97151', '97152', '97153', '97154', '97155', '97156', '97157', '97158'],
      lookbackDays: 14,
      maxUnitsPerAuth: 720, // ~180 hours
      renewalLeadDays: 45,
      supportsConcurrentReview: true,
      requiresProgressNotes: true,
      requiresTreatmentPlan: true,
      turnaroundDays: 5, // California law
    },
    contactInfo: {
      providerServices: {
        phone: '1-800-274-7767',
        hours: 'Monday-Friday 5am-6pm PST',
      },
      authorizationDept: {
        phone: '1-800-274-7767',
        portal: 'https://www.anthem.com/ca/provider',
      },
      claimsDept: {
        phone: '1-800-274-7767',
      },
      portalUrl: 'https://www.anthem.com/ca/provider',
    },
  },

  // BCBS of Florida
  FL: {
    payerId: 'BCBSFL',
    payerName: 'Blue Cross Blue Shield of Florida',
    authorizationRequirements: {
      requiresAuth: true,
      serviceCodes: ['97151', '97152', '97153', '97154', '97155', '97156', '97157', '97158'],
      lookbackDays: 30,
      maxUnitsPerAuth: 1040, // ~260 hours
      renewalLeadDays: 30,
      supportsConcurrentReview: true,
      requiresProgressNotes: true,
      requiresTreatmentPlan: true,
      turnaroundDays: 15,
    },
    contactInfo: {
      providerServices: {
        phone: '1-800-727-2227',
        hours: 'Monday-Friday 8am-6pm EST',
      },
      authorizationDept: {
        phone: '1-800-727-2227',
        fax: '1-800-282-4548',
        portal: 'https://www.floridablue.com/providers',
      },
      claimsDept: {
        phone: '1-800-727-2227',
      },
      portalUrl: 'https://www.floridablue.com/providers',
    },
  },
};

/**
 * Get BCBS template for a specific state
 */
export function getBCBSTemplate(stateCode?: string): PayerTemplate {
  if (!stateCode) return BCBSTemplate;

  const stateTemplate = BCBSStateTemplates[stateCode.toUpperCase()];
  if (!stateTemplate) return BCBSTemplate;

  // Merge state-specific overrides with base template
  return {
    ...BCBSTemplate,
    ...stateTemplate,
    authorizationRequirements: {
      ...BCBSTemplate.authorizationRequirements!,
      ...stateTemplate.authorizationRequirements,
    },
    claimRequirements: {
      ...BCBSTemplate.claimRequirements!,
      ...stateTemplate.claimRequirements,
    },
    contactInfo: {
      ...BCBSTemplate.contactInfo,
      ...stateTemplate.contactInfo,
    },
  };
}
