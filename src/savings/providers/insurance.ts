/**
 * Insurance Providers
 *
 * Provider integrations for insurance companies.
 */

import { BaseSavingsProvider, SavingsProviderError } from './base.js';
import type { InsuranceType, ClaimStatus } from '../types.js';

/**
 * Insurance provider information
 */
export interface InsuranceProviderInfo {
  id: string;
  name: string;
  types: InsuranceType[];
  claimPortalUrl?: string;
  phoneNumber?: string;
  emailSupport?: string;
  averageProcessingDays?: number;
  rating?: number;
}

/**
 * Claim submission result
 */
export interface ClaimSubmissionResult {
  success: boolean;
  claimNumber?: string;
  confirmationNumber?: string;
  estimatedProcessingDays?: number;
  nextSteps?: string[];
  error?: string;
}

/**
 * Claim status check result
 */
export interface ClaimStatusResult {
  success: boolean;
  status?: ClaimStatus;
  lastUpdated?: number;
  notes?: string;
  expectedResolution?: number;
  error?: string;
}

/**
 * Insurance provider interface
 */
export interface InsuranceProvider {
  readonly name: string;
  readonly version: string;

  getProviderInfo(): InsuranceProviderInfo;
  submitClaim(claimData: ClaimSubmissionData): Promise<ClaimSubmissionResult>;
  checkClaimStatus(claimNumber: string, policyNumber: string): Promise<ClaimStatusResult>;
  getRequiredDocuments(claimType: InsuranceType): string[];
}

/**
 * Claim submission data
 */
export interface ClaimSubmissionData {
  policyNumber: string;
  claimType: InsuranceType;
  incidentDate: number;
  description: string;
  estimatedAmount?: number;
  contactEmail: string;
  contactPhone: string;
  documents: Array<{
    type: string;
    filename: string;
    data: string; // Base64 encoded
  }>;
}

/**
 * Known insurance providers database
 */
const KNOWN_PROVIDERS: Map<string, InsuranceProviderInfo> = new Map([
  ['state-farm', {
    id: 'state-farm',
    name: 'State Farm',
    types: ['auto', 'home', 'life', 'health'],
    claimPortalUrl: 'https://www.statefarm.com/claims',
    phoneNumber: '1-800-732-5246',
    averageProcessingDays: 14,
    rating: 4.2,
  }],
  ['geico', {
    id: 'geico',
    name: 'GEICO',
    types: ['auto', 'home'],
    claimPortalUrl: 'https://www.geico.com/claims',
    phoneNumber: '1-800-841-3000',
    averageProcessingDays: 10,
    rating: 4.0,
  }],
  ['progressive', {
    id: 'progressive',
    name: 'Progressive',
    types: ['auto', 'home'],
    claimPortalUrl: 'https://www.progressive.com/claims',
    phoneNumber: '1-800-776-4737',
    averageProcessingDays: 12,
    rating: 4.1,
  }],
  ['allstate', {
    id: 'allstate',
    name: 'Allstate',
    types: ['auto', 'home', 'life'],
    claimPortalUrl: 'https://www.allstate.com/claims',
    phoneNumber: '1-800-255-7828',
    averageProcessingDays: 15,
    rating: 3.9,
  }],
  ['usaa', {
    id: 'usaa',
    name: 'USAA',
    types: ['auto', 'home', 'life'],
    claimPortalUrl: 'https://www.usaa.com/claims',
    phoneNumber: '1-800-531-8722',
    averageProcessingDays: 8,
    rating: 4.5,
  }],
  ['liberty-mutual', {
    id: 'liberty-mutual',
    name: 'Liberty Mutual',
    types: ['auto', 'home'],
    claimPortalUrl: 'https://www.libertymutual.com/claims',
    phoneNumber: '1-800-225-2467',
    averageProcessingDays: 14,
    rating: 4.0,
  }],
  ['nationwide', {
    id: 'nationwide',
    name: 'Nationwide',
    types: ['auto', 'home', 'life'],
    claimPortalUrl: 'https://www.nationwide.com/claims',
    phoneNumber: '1-800-421-3535',
    averageProcessingDays: 13,
    rating: 4.1,
  }],
  ['farmers', {
    id: 'farmers',
    name: 'Farmers Insurance',
    types: ['auto', 'home', 'life'],
    claimPortalUrl: 'https://www.farmers.com/claims',
    phoneNumber: '1-800-435-7764',
    averageProcessingDays: 14,
    rating: 3.8,
  }],
]);

/**
 * Generic insurance provider implementation
 *
 * In a production environment, this would integrate with actual
 * insurance company APIs. This implementation provides a framework
 * and mock responses.
 */
export class GenericInsuranceProvider extends BaseSavingsProvider implements InsuranceProvider {
  readonly version = '1.0.0';
  private providerInfo: InsuranceProviderInfo;

  get type(): string {
    return 'insurance';
  }

  constructor(providerId: string) {
    super({ name: providerId });
    this.providerInfo = KNOWN_PROVIDERS.get(providerId.toLowerCase().replace(/\s+/g, '-')) ?? {
      id: providerId,
      name: providerId,
      types: ['auto', 'home', 'health', 'travel', 'life', 'other'] as InsuranceType[],
    };
  }

  get name(): string {
    return this.providerInfo.name;
  }

  getProviderInfo(): InsuranceProviderInfo {
    return this.providerInfo;
  }

  async submitClaim(claimData: ClaimSubmissionData): Promise<ClaimSubmissionResult> {
    // In production, this would submit to the actual insurance provider's API

    // Validate required data
    if (!claimData.policyNumber) {
      return { success: false, error: 'Policy number is required' };
    }

    if (!claimData.description || claimData.description.length < 50) {
      return { success: false, error: 'Description must be at least 50 characters' };
    }

    // Simulate successful submission
    const claimNumber = this.generateClaimNumber();

    return {
      success: true,
      claimNumber,
      confirmationNumber: `CONF-${Date.now()}`,
      estimatedProcessingDays: this.providerInfo.averageProcessingDays ?? 14,
      nextSteps: [
        'You will receive an email confirmation within 24 hours',
        'An adjuster will contact you within 2-3 business days',
        'Keep all documentation related to your claim',
        `Track your claim status at ${this.providerInfo.claimPortalUrl ?? 'the provider portal'}`,
      ],
    };
  }

  async checkClaimStatus(
    claimNumber: string,
    policyNumber: string
  ): Promise<ClaimStatusResult> {
    // In production, this would query the insurance provider's API

    // Simulate status check
    return {
      success: true,
      status: 'under_review',
      lastUpdated: Date.now() - 2 * 24 * 60 * 60 * 1000,
      notes: 'Claim is being reviewed by an adjuster',
      expectedResolution: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
  }

  getRequiredDocuments(claimType: InsuranceType): string[] {
    const documents: Record<InsuranceType, string[]> = {
      auto: [
        'Police report (if applicable)',
        'Photos of damage',
        'Repair estimates',
        'Driver\'s license copy',
        'Vehicle registration',
      ],
      home: [
        'Photos of damage',
        'Repair estimates',
        'List of damaged items with values',
        'Receipts for emergency repairs',
      ],
      renters: [
        'Photos of damage',
        'List of damaged/stolen items with values',
        'Police report (for theft)',
        'Lease agreement',
      ],
      health: [
        'Itemized medical bills',
        'Explanation of Benefits (EOB)',
        'Provider documentation',
        'Prescription receipts',
      ],
      travel: [
        'Booking confirmations',
        'Receipts for expenses',
        'Correspondence with airlines/hotels',
        'Police report (for theft)',
      ],
      life: [
        'Death certificate',
        'Policy documents',
        'Beneficiary identification',
        'Funeral/burial receipts',
      ],
      other: [
        'Description of incident',
        'Supporting documentation',
        'Receipts/invoices',
      ],
    };

    return documents[claimType] ?? documents.other;
  }

  private generateClaimNumber(): string {
    const prefix = this.providerInfo.id.slice(0, 2).toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }
}

/**
 * Insurance provider registry
 */
export class InsuranceProviderRegistry {
  private providers: Map<string, InsuranceProvider> = new Map();

  /**
   * Get or create a provider for an insurance company
   */
  getProvider(providerName: string): InsuranceProvider {
    const normalized = providerName.toLowerCase().replace(/\s+/g, '-');

    if (this.providers.has(normalized)) {
      return this.providers.get(normalized)!;
    }

    const provider = new GenericInsuranceProvider(providerName);
    this.providers.set(normalized, provider);
    return provider;
  }

  /**
   * Register a custom provider
   */
  registerProvider(name: string, provider: InsuranceProvider): void {
    const normalized = name.toLowerCase().replace(/\s+/g, '-');
    this.providers.set(normalized, provider);
  }

  /**
   * List known providers
   */
  listKnownProviders(): InsuranceProviderInfo[] {
    return Array.from(KNOWN_PROVIDERS.values());
  }

  /**
   * Search providers by name
   */
  searchProviders(query: string): InsuranceProviderInfo[] {
    const normalized = query.toLowerCase();
    return Array.from(KNOWN_PROVIDERS.values())
      .filter(p => p.name.toLowerCase().includes(normalized));
  }

  /**
   * Get providers by claim type
   */
  getProvidersByInsuranceType(claimType: InsuranceType): InsuranceProviderInfo[] {
    return Array.from(KNOWN_PROVIDERS.values())
      .filter(p => p.types.includes(claimType));
  }

  /**
   * Get top-rated providers
   */
  getTopRatedProviders(limit: number = 5): InsuranceProviderInfo[] {
    return Array.from(KNOWN_PROVIDERS.values())
      .filter(p => p.rating !== undefined)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, limit);
  }
}

/**
 * Create insurance provider registry
 */
export function createInsuranceProviderRegistry(): InsuranceProviderRegistry {
  return new InsuranceProviderRegistry();
}
