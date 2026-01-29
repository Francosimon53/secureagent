/**
 * Claim Builder
 *
 * Assists with building and validating insurance claims.
 */

import type {
  InsuranceClaim,
  InsuranceType,
  ClaimStatus,
  ClaimDocument,
  ClaimTimelineEvent,
} from '../types.js';

/**
 * Claim field validation
 */
export interface FieldValidation {
  field: string;
  valid: boolean;
  error?: string;
  suggestion?: string;
}

/**
 * Claim validation result
 */
export interface ClaimValidation {
  valid: boolean;
  fields: FieldValidation[];
  completeness: number; // 0-100
  missingRequired: string[];
  suggestions: string[];
}

/**
 * Claim form section
 */
export interface ClaimFormSection {
  id: string;
  title: string;
  description: string;
  fields: ClaimFormField[];
  required: boolean;
}

/**
 * Claim form field
 */
export interface ClaimFormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'select' | 'checkbox' | 'file';
  required: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
  };
  helpText?: string;
}

/**
 * Claim builder class
 */
export class ClaimBuilder {
  /**
   * Get form sections for a claim type
   */
  getFormSections(claimType: InsuranceType): ClaimFormSection[] {
    const commonSections = this.getCommonSections();
    const typeSections = this.getTypeSections(claimType);

    return [...commonSections, ...typeSections];
  }

  /**
   * Validate a claim
   */
  validateClaim(claim: Partial<InsuranceClaim>): ClaimValidation {
    const fields: FieldValidation[] = [];
    const missingRequired: string[] = [];
    const suggestions: string[] = [];

    // Required fields
    if (!claim.type) {
      fields.push({ field: 'type', valid: false, error: 'Claim type is required' });
      missingRequired.push('type');
    } else {
      fields.push({ field: 'type', valid: true });
    }

    if (!claim.provider) {
      fields.push({ field: 'provider', valid: false, error: 'Insurance provider is required' });
      missingRequired.push('provider');
    } else {
      fields.push({ field: 'provider', valid: true });
    }

    if (!claim.policyNumber) {
      fields.push({ field: 'policyNumber', valid: false, error: 'Policy number is required' });
      missingRequired.push('policyNumber');
    } else if (claim.policyNumber.length < 5) {
      fields.push({
        field: 'policyNumber',
        valid: false,
        error: 'Policy number seems too short',
        suggestion: 'Check your insurance card for the correct policy number',
      });
    } else {
      fields.push({ field: 'policyNumber', valid: true });
    }

    if (!claim.incidentDate) {
      fields.push({ field: 'incidentDate', valid: false, error: 'Incident date is required' });
      missingRequired.push('incidentDate');
    } else {
      const incidentDate = new Date(claim.incidentDate);
      const now = new Date();

      if (incidentDate > now) {
        fields.push({
          field: 'incidentDate',
          valid: false,
          error: 'Incident date cannot be in the future',
        });
      } else {
        fields.push({ field: 'incidentDate', valid: true });

        // Check if filing within typical deadline
        const daysSinceIncident = Math.floor(
          (now.getTime() - incidentDate.getTime()) / (24 * 60 * 60 * 1000)
        );
        if (daysSinceIncident > 30) {
          suggestions.push(
            `It has been ${daysSinceIncident} days since the incident. ` +
            'Most claims should be filed promptly. Check your policy for filing deadlines.'
          );
        }
      }
    }

    if (!claim.description || claim.description.length < 50) {
      if (!claim.description) {
        fields.push({ field: 'description', valid: false, error: 'Description is required' });
        missingRequired.push('description');
      } else {
        fields.push({
          field: 'description',
          valid: false,
          error: 'Description should be more detailed',
          suggestion: 'Include who, what, when, where, and how the incident occurred',
        });
      }
    } else {
      fields.push({ field: 'description', valid: true });
    }

    // Calculate completeness
    const validFields = fields.filter(f => f.valid).length;
    const completeness = Math.round((validFields / fields.length) * 100);

    // Add type-specific suggestions
    if (claim.type) {
      suggestions.push(...this.getTypeSuggestions(claim.type));
    }

    return {
      valid: missingRequired.length === 0 && fields.every(f => f.valid),
      fields,
      completeness,
      missingRequired,
      suggestions,
    };
  }

  /**
   * Generate claim description template
   */
  generateDescriptionTemplate(claimType: InsuranceType): string {
    const templates: Record<InsuranceType, string> = {
      auto: `On [DATE], at approximately [TIME], [DESCRIBE WHAT HAPPENED].

Location: [ADDRESS/INTERSECTION]

Parties involved:
- My vehicle: [YEAR, MAKE, MODEL, LICENSE PLATE]
- Other vehicle(s): [YEAR, MAKE, MODEL if known]

Damage description:
[DESCRIBE DAMAGE TO YOUR VEHICLE]

Injuries: [DESCRIBE ANY INJURIES OR STATE "No injuries"]

Police report: [YES/NO - REPORT NUMBER IF APPLICABLE]

Additional details:
[ANY OTHER RELEVANT INFORMATION]`,

      home: `On [DATE], I discovered [DESCRIBE WHAT HAPPENED/WAS DAMAGED].

Location of damage: [SPECIFIC AREA OF HOME]

Cause of damage: [DESCRIBE CAUSE IF KNOWN]

Description of damage:
[LIST ALL DAMAGED ITEMS AND AREAS]

Estimated value of damage: [AMOUNT IF KNOWN]

Emergency repairs made: [DESCRIBE ANY IMMEDIATE REPAIRS]

Additional details:
[ANY OTHER RELEVANT INFORMATION]`,

      health: `On [DATE], I received medical treatment for [CONDITION/REASON].

Healthcare provider: [DOCTOR/HOSPITAL NAME]
Treatment received: [DESCRIBE TREATMENT]
Diagnosis: [IF KNOWN]

Related to: [ACCIDENT/ILLNESS/ROUTINE CARE]

Total charges: [AMOUNT]
Amount paid: [AMOUNT PAID OUT OF POCKET]

Additional claims submitted: [OTHER INSURANCE IF APPLICABLE]

Additional details:
[ANY OTHER RELEVANT INFORMATION]`,

      travel: `On [DATE], during my trip to [DESTINATION], [DESCRIBE WHAT HAPPENED].

Trip details:
- Departure date: [DATE]
- Return date: [DATE]
- Booking confirmation: [NUMBER]

Incident description:
[DETAILED DESCRIPTION OF WHAT HAPPENED]

Expenses incurred:
[LIST ALL EXPENSES WITH AMOUNTS]

Documentation available:
[LIST RECEIPTS, CONFIRMATIONS, ETC.]

Additional details:
[ANY OTHER RELEVANT INFORMATION]`,

      life: `This claim is being filed for the death of [POLICYHOLDER NAME] on [DATE].

Cause of death: [AS STATED ON DEATH CERTIFICATE]
Policy number: [NUMBER]

Beneficiary information:
- Name: [YOUR NAME]
- Relationship to deceased: [RELATIONSHIP]

Supporting documents attached:
- Death certificate
- [OTHER DOCUMENTS]

Additional details:
[ANY OTHER RELEVANT INFORMATION]`,

      renters: `On [DATE], I discovered [DESCRIBE WHAT HAPPENED/WAS DAMAGED] at my rental unit.

Address: [RENTAL ADDRESS]

Cause of damage/loss: [DESCRIBE CAUSE IF KNOWN]

Description of loss:
[LIST ALL DAMAGED/STOLEN ITEMS]

Estimated value of items: [AMOUNT IF KNOWN]

Emergency measures taken: [DESCRIBE ANY IMMEDIATE ACTIONS]

Landlord notified: [YES/NO - DATE IF APPLICABLE]

Police report: [YES/NO - REPORT NUMBER IF APPLICABLE]

Additional details:
[ANY OTHER RELEVANT INFORMATION]`,

      other: `On [DATE], [DESCRIBE THE INCIDENT OR SITUATION].

Policy type: [TYPE OF COVERAGE]
Policy number: [NUMBER]

Description of claim:
[DETAILED DESCRIPTION]

Estimated value/amount: [AMOUNT]

Supporting documentation:
[LIST DOCUMENTS]

Additional details:
[ANY OTHER RELEVANT INFORMATION]`,
    };

    return templates[claimType] ?? templates.other;
  }

  /**
   * Estimate claim processing time
   */
  estimateProcessingTime(claimType: InsuranceType, hasAllDocuments: boolean): {
    minDays: number;
    maxDays: number;
    factors: string[];
  } {
    const baseTimes: Record<InsuranceType, { min: number; max: number }> = {
      auto: { min: 7, max: 30 },
      home: { min: 14, max: 45 },
      health: { min: 14, max: 30 },
      travel: { min: 7, max: 21 },
      life: { min: 30, max: 60 },
      renters: { min: 14, max: 30 },
      other: { min: 14, max: 45 },
    };

    const base = baseTimes[claimType] ?? baseTimes.other;
    const factors: string[] = [];

    let minDays = base.min;
    let maxDays = base.max;

    if (!hasAllDocuments) {
      minDays += 7;
      maxDays += 14;
      factors.push('Missing documentation may delay processing');
    }

    factors.push(`Typical processing time for ${claimType} claims: ${base.min}-${base.max} days`);

    return { minDays, maxDays, factors };
  }

  /**
   * Create initial timeline entry
   */
  createInitialTimelineEntry(): ClaimTimelineEvent {
    return {
      id: crypto.randomUUID(),
      type: 'created',
      description: 'Insurance claim initiated',
      timestamp: Date.now(),
      actor: 'policyholder',
    };
  }

  /**
   * Generate status update message
   */
  generateStatusMessage(
    oldStatus: ClaimStatus,
    newStatus: ClaimStatus,
    notes?: string
  ): string {
    const statusMessages: Record<ClaimStatus, string> = {
      draft: 'Claim saved as draft',
      ready_to_file: 'Claim is ready to file',
      filed: 'Claim submitted to insurance company',
      under_review: 'Claim is being reviewed by insurance adjuster',
      additional_info_requested: 'Insurance company has requested additional information',
      approved: 'Claim has been approved',
      partially_approved: 'Claim has been partially approved',
      denied: 'Claim has been denied',
      paid: 'Claim payment has been issued',
      appealed: 'Claim denial has been appealed',
      closed: 'Claim has been closed',
    };

    let message = statusMessages[newStatus] ?? `Status changed to ${newStatus}`;

    if (notes) {
      message += `. Note: ${notes}`;
    }

    return message;
  }

  /**
   * Get next steps for a claim status
   */
  getNextSteps(status: ClaimStatus): string[] {
    const nextSteps: Record<ClaimStatus, string[]> = {
      draft: [
        'Complete all required fields',
        'Gather supporting documents',
        'Review claim details for accuracy',
        'Submit claim when ready',
      ],
      ready_to_file: [
        'Review all information for accuracy',
        'Ensure all documents are attached',
        'Submit claim to insurance company',
      ],
      filed: [
        'Wait for acknowledgment from insurance company',
        'Keep records of submission (confirmation number, date)',
        'Monitor email for updates',
      ],
      under_review: [
        'Be available for questions from the adjuster',
        'Prepare any additional documentation that may be needed',
        'Follow up if no response within expected timeframe',
      ],
      additional_info_requested: [
        'Review what information is being requested',
        'Gather and submit requested documents promptly',
        'Contact adjuster if you have questions',
      ],
      approved: [
        'Review approval details and payment amount',
        'Understand any deductibles or copays',
        'Wait for payment to be processed',
      ],
      partially_approved: [
        'Review what was approved and what was not',
        'Understand the reasons for partial approval',
        'Consider appealing denied portions if appropriate',
      ],
      denied: [
        'Review denial reason carefully',
        'Request detailed explanation if needed',
        'Consider filing an appeal if you disagree',
        'Consult with insurance advocate if necessary',
      ],
      paid: [
        'Verify payment amount received',
        'Keep records for tax purposes',
        'Follow up if payment differs from expected amount',
      ],
      appealed: [
        'Wait for appeal review decision',
        'Gather additional supporting documentation',
        'Consider consulting with an insurance advocate',
      ],
      closed: [
        'Keep all claim documentation for your records',
        'File for at least 7 years',
        'Contact insurance if any issues arise',
      ],
    };

    return nextSteps[status] ?? [];
  }

  // Private methods

  private getCommonSections(): ClaimFormSection[] {
    return [
      {
        id: 'policy-info',
        title: 'Policy Information',
        description: 'Enter your insurance policy details',
        required: true,
        fields: [
          {
            id: 'provider',
            label: 'Insurance Company',
            type: 'text',
            required: true,
            placeholder: 'e.g., State Farm, Geico, Allstate',
          },
          {
            id: 'policyNumber',
            label: 'Policy Number',
            type: 'text',
            required: true,
            placeholder: 'Found on your insurance card',
            validation: { minLength: 5 },
          },
        ],
      },
      {
        id: 'incident-info',
        title: 'Incident Details',
        description: 'Describe the incident',
        required: true,
        fields: [
          {
            id: 'incidentDate',
            label: 'Date of Incident',
            type: 'date',
            required: true,
          },
          {
            id: 'description',
            label: 'Description',
            type: 'textarea',
            required: true,
            placeholder: 'Provide a detailed description of what happened',
            validation: { minLength: 50 },
            helpText: 'Include who, what, when, where, and how',
          },
        ],
      },
    ];
  }

  private getTypeSections(claimType: InsuranceType): ClaimFormSection[] {
    const typeSections: Record<InsuranceType, ClaimFormSection[]> = {
      auto: [
        {
          id: 'vehicle-info',
          title: 'Vehicle Information',
          description: 'Details about your vehicle',
          required: true,
          fields: [
            { id: 'vehicleYear', label: 'Year', type: 'number', required: true },
            { id: 'vehicleMake', label: 'Make', type: 'text', required: true },
            { id: 'vehicleModel', label: 'Model', type: 'text', required: true },
            { id: 'vin', label: 'VIN', type: 'text', required: false },
            { id: 'licensePlate', label: 'License Plate', type: 'text', required: false },
          ],
        },
        {
          id: 'accident-details',
          title: 'Accident Details',
          description: 'Information about the accident',
          required: true,
          fields: [
            { id: 'location', label: 'Location', type: 'text', required: true },
            {
              id: 'otherPartiesInvolved',
              label: 'Other parties involved?',
              type: 'checkbox',
              required: false,
            },
            { id: 'policeReportNumber', label: 'Police Report Number', type: 'text', required: false },
          ],
        },
      ],
      home: [
        {
          id: 'property-info',
          title: 'Property Information',
          description: 'Details about the property',
          required: true,
          fields: [
            { id: 'propertyAddress', label: 'Property Address', type: 'text', required: true },
            {
              id: 'damageType',
              label: 'Type of Damage',
              type: 'select',
              required: true,
              options: [
                { value: 'fire', label: 'Fire' },
                { value: 'water', label: 'Water/Flood' },
                { value: 'wind', label: 'Wind/Storm' },
                { value: 'theft', label: 'Theft/Vandalism' },
                { value: 'other', label: 'Other' },
              ],
            },
          ],
        },
      ],
      health: [
        {
          id: 'treatment-info',
          title: 'Treatment Information',
          description: 'Details about medical treatment',
          required: true,
          fields: [
            { id: 'providerName', label: 'Healthcare Provider', type: 'text', required: true },
            { id: 'treatmentDate', label: 'Date of Treatment', type: 'date', required: true },
            { id: 'diagnosis', label: 'Diagnosis', type: 'text', required: false },
            { id: 'totalCharges', label: 'Total Charges', type: 'number', required: true },
          ],
        },
      ],
      travel: [
        {
          id: 'trip-info',
          title: 'Trip Information',
          description: 'Details about your trip',
          required: true,
          fields: [
            { id: 'destination', label: 'Destination', type: 'text', required: true },
            { id: 'departureDate', label: 'Departure Date', type: 'date', required: true },
            { id: 'returnDate', label: 'Return Date', type: 'date', required: true },
            { id: 'bookingConfirmation', label: 'Booking Confirmation', type: 'text', required: false },
          ],
        },
      ],
      life: [
        {
          id: 'deceased-info',
          title: 'Deceased Information',
          description: 'Information about the policyholder',
          required: true,
          fields: [
            { id: 'deceasedName', label: 'Name of Deceased', type: 'text', required: true },
            { id: 'dateOfDeath', label: 'Date of Death', type: 'date', required: true },
            { id: 'causeOfDeath', label: 'Cause of Death', type: 'text', required: false },
          ],
        },
        {
          id: 'beneficiary-info',
          title: 'Beneficiary Information',
          description: 'Your information as beneficiary',
          required: true,
          fields: [
            { id: 'beneficiaryName', label: 'Your Name', type: 'text', required: true },
            { id: 'relationship', label: 'Relationship to Deceased', type: 'text', required: true },
          ],
        },
      ],
      renters: [
        {
          id: 'rental-info',
          title: 'Rental Property Information',
          description: 'Details about your rental unit',
          required: true,
          fields: [
            { id: 'rentalAddress', label: 'Rental Address', type: 'text', required: true },
            { id: 'landlordName', label: 'Landlord Name', type: 'text', required: false },
            { id: 'landlordContact', label: 'Landlord Contact', type: 'text', required: false },
            {
              id: 'lossType',
              label: 'Type of Loss',
              type: 'select',
              required: true,
              options: [
                { value: 'theft', label: 'Theft/Burglary' },
                { value: 'fire', label: 'Fire' },
                { value: 'water', label: 'Water Damage' },
                { value: 'vandalism', label: 'Vandalism' },
                { value: 'other', label: 'Other' },
              ],
            },
          ],
        },
      ],
      other: [],
    };

    return typeSections[claimType] ?? [];
  }

  private getTypeSuggestions(claimType: InsuranceType): string[] {
    const suggestions: Record<InsuranceType, string[]> = {
      auto: [
        'Take photos of all damage before repairs',
        'Get repair estimates from multiple shops',
        'Keep a copy of the police report',
      ],
      home: [
        'Document damage with photos and video',
        'Keep receipts for emergency repairs',
        'Make a list of damaged items with values',
      ],
      health: [
        'Keep copies of all medical bills',
        'Request itemized statements from providers',
        'Track all out-of-pocket expenses',
      ],
      travel: [
        'Keep all receipts and boarding passes',
        'Document any communication with airlines/hotels',
        'Note dates and times of delays',
      ],
      life: [
        'Obtain certified death certificate',
        'Gather all policy documents',
        'Have beneficiary identification ready',
      ],
      renters: [
        'Document all damaged or stolen items with photos',
        'File a police report for theft or vandalism',
        'Notify your landlord in writing',
        'Keep receipts for any temporary housing expenses',
      ],
      other: [
        'Document everything thoroughly',
        'Keep copies of all correspondence',
        'Follow up regularly on claim status',
      ],
    };

    return suggestions[claimType] ?? suggestions.other;
  }
}
