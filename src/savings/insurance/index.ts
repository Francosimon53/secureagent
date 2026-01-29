/**
 * Insurance Claim Service
 *
 * Manages insurance claim filing and tracking.
 */

import type {
  InsuranceClaim,
  InsuranceType,
  ClaimStatus,
  ClaimDocument,
  ClaimTimelineEvent,
  InsuranceServiceConfig,
} from '../types.js';
import type { InsuranceClaimStore } from '../stores/index.js';
import type { SavingsConfig } from '../config.js';
import { ClaimBuilder, type ClaimValidation, type ClaimFormSection } from './claim-builder.js';
import { DocumentManager, type DocumentValidation } from './document-manager.js';

export { ClaimBuilder, type ClaimValidation, type ClaimFormSection } from './claim-builder.js';
export { DocumentManager, type DocumentValidation } from './document-manager.js';

/**
 * Insurance claim service configuration
 */
export interface InsuranceClaimConfig {
  encryptPII: boolean;
  maxClaimsPerUser: number;
  documentMaxSizeBytes: number;
}

/**
 * Insurance claim service
 */
export class InsuranceClaimService {
  private readonly config: InsuranceClaimConfig;
  private readonly claimBuilder: ClaimBuilder;
  private readonly documentManager: DocumentManager;

  constructor(
    private readonly claimStore: InsuranceClaimStore,
    config?: Partial<InsuranceServiceConfig>
  ) {
    this.config = {
      encryptPII: config?.encryptPII ?? true,
      maxClaimsPerUser: 50,
      documentMaxSizeBytes: 10 * 1024 * 1024, // 10MB
    };

    this.claimBuilder = new ClaimBuilder();
    this.documentManager = new DocumentManager();
  }

  // ==========================================================================
  // Claim CRUD Operations
  // ==========================================================================

  /**
   * Create a new claim (draft)
   */
  async createClaim(
    userId: string,
    type: InsuranceType,
    provider: string,
    policyNumber: string,
    incidentDate: number,
    description: string,
    options?: {
      claimNumber?: string;
      estimatedAmount?: number;
    }
  ): Promise<InsuranceClaim> {
    // Check claim limit
    const existingCount = await this.claimStore.count(userId);
    if (existingCount >= this.config.maxClaimsPerUser) {
      throw new Error(`Maximum claims limit reached (${this.config.maxClaimsPerUser})`);
    }

    const initialTimeline: ClaimTimelineEvent = this.claimBuilder.createInitialTimelineEntry();

    const claim = await this.claimStore.create({
      userId,
      type,
      provider,
      policyNumber,
      claimNumber: options?.claimNumber,
      status: 'draft',
      incidentDate,
      description,
      estimatedAmount: options?.estimatedAmount,
      documents: [],
      timeline: [initialTimeline],
    });

    return claim;
  }

  /**
   * Get a claim by ID
   */
  async getClaim(claimId: string): Promise<InsuranceClaim | null> {
    return this.claimStore.get(claimId);
  }

  /**
   * Update a claim
   */
  async updateClaim(
    claimId: string,
    updates: Partial<InsuranceClaim>
  ): Promise<InsuranceClaim | null> {
    const claim = await this.claimStore.get(claimId);
    if (!claim) {
      return null;
    }

    // Don't allow updating filed/closed claims directly
    if (['filed', 'approved', 'denied', 'paid', 'closed'].includes(claim.status)) {
      throw new Error(`Cannot update claim in ${claim.status} status`);
    }

    return this.claimStore.update(claimId, updates);
  }

  /**
   * Delete a claim
   */
  async deleteClaim(claimId: string): Promise<boolean> {
    const claim = await this.claimStore.get(claimId);
    if (!claim) {
      return false;
    }

    // Only allow deleting draft claims
    if (claim.status !== 'draft') {
      throw new Error('Can only delete draft claims');
    }

    return this.claimStore.delete(claimId);
  }

  /**
   * List claims for a user
   */
  async listClaims(
    userId: string,
    options?: {
      status?: ClaimStatus[];
      type?: InsuranceType[];
      limit?: number;
      offset?: number;
    }
  ): Promise<InsuranceClaim[]> {
    return this.claimStore.list(userId, options);
  }

  /**
   * Get pending claims
   */
  async getPendingClaims(userId: string): Promise<InsuranceClaim[]> {
    return this.claimStore.getPending(userId);
  }

  // ==========================================================================
  // Status Management
  // ==========================================================================

  /**
   * Submit a claim
   */
  async submitClaim(claimId: string): Promise<InsuranceClaim | null> {
    const claim = await this.claimStore.get(claimId);
    if (!claim) {
      return null;
    }

    if (claim.status !== 'draft' && claim.status !== 'ready_to_file') {
      throw new Error('Can only submit draft or ready_to_file claims');
    }

    // Validate claim
    const validation = this.validateClaim(claim);
    if (!validation.valid) {
      throw new Error(`Claim validation failed: ${validation.missingRequired.join(', ')}`);
    }

    const success = await this.claimStore.updateStatus(claimId, 'filed', 'Claim submitted for review');
    if (success) {
      return this.claimStore.get(claimId);
    }
    return null;
  }

  /**
   * Update claim status
   */
  async updateClaimStatus(
    claimId: string,
    status: ClaimStatus,
    notes?: string
  ): Promise<InsuranceClaim | null> {
    const success = await this.claimStore.updateStatus(claimId, status, notes);
    if (success) {
      return this.claimStore.get(claimId);
    }
    return null;
  }

  /**
   * Get next steps for a claim
   */
  getNextSteps(claim: InsuranceClaim): string[] {
    return this.claimBuilder.getNextSteps(claim.status);
  }

  // ==========================================================================
  // Document Operations
  // ==========================================================================

  /**
   * Add a document to a claim
   */
  async addDocument(
    claimId: string,
    document: Omit<ClaimDocument, 'id' | 'uploadedAt' | 'verified'>
  ): Promise<ClaimDocument | null> {
    const claim = await this.claimStore.get(claimId);
    if (!claim) {
      return null;
    }

    // Track document locally
    this.documentManager.addDocument(claimId, document);

    // Update claim store with uploadedAt
    const docWithTimestamp: Omit<ClaimDocument, 'id'> = {
      ...document,
      uploadedAt: Date.now(),
      verified: false,
    };
    return this.claimStore.addDocument(claimId, docWithTimestamp);
  }

  /**
   * Remove a document from a claim
   */
  async removeDocument(
    claimId: string,
    documentId: string
  ): Promise<boolean> {
    const claim = await this.claimStore.get(claimId);
    if (!claim) {
      return false;
    }

    if (!['draft', 'additional_info_requested'].includes(claim.status)) {
      throw new Error('Cannot modify documents for claims in this status');
    }

    this.documentManager.removeDocument(claimId, documentId);
    return this.claimStore.removeDocument(claimId, documentId);
  }

  /**
   * Get document requirements for a claim type
   */
  getDocumentRequirements(claimType: InsuranceType): {
    required: string[];
    optional: string[];
    notes: string[];
  } {
    return this.documentManager.getRequirements(claimType);
  }

  /**
   * Check if claim has all required documents
   */
  checkDocumentCompleteness(claim: InsuranceClaim): {
    complete: boolean;
    missing: string[];
    present: string[];
  } {
    return this.documentManager.checkRequiredDocuments(claim.id, claim.type);
  }

  /**
   * Generate document checklist
   */
  generateDocumentChecklist(claimType: InsuranceType): Array<{
    type: string;
    description: string;
    required: boolean;
    tips: string[];
  }> {
    return this.documentManager.generateChecklist(claimType);
  }

  /**
   * Validate a document before upload
   */
  validateDocument(file: {
    name: string;
    size: number;
    type: string;
  }): DocumentValidation {
    return this.documentManager.validateDocument(file, {
      maxSizeBytes: this.config.documentMaxSizeBytes,
    });
  }

  // ==========================================================================
  // Claim Building & Validation
  // ==========================================================================

  /**
   * Get form sections for a claim type
   */
  getClaimFormSections(claimType: InsuranceType): ClaimFormSection[] {
    return this.claimBuilder.getFormSections(claimType);
  }

  /**
   * Validate a claim
   */
  validateClaim(claim: Partial<InsuranceClaim>): ClaimValidation {
    return this.claimBuilder.validateClaim(claim);
  }

  /**
   * Generate description template
   */
  generateDescriptionTemplate(claimType: InsuranceType): string {
    return this.claimBuilder.generateDescriptionTemplate(claimType);
  }

  /**
   * Estimate claim processing time
   */
  estimateProcessingTime(claim: InsuranceClaim): {
    minDays: number;
    maxDays: number;
    factors: string[];
  } {
    const docCheck = this.checkDocumentCompleteness(claim);
    return this.claimBuilder.estimateProcessingTime(claim.type, docCheck.complete);
  }

  // ==========================================================================
  // Timeline Operations
  // ==========================================================================

  /**
   * Add a timeline event
   */
  async addTimelineEvent(
    claimId: string,
    event: Omit<ClaimTimelineEvent, 'id'>
  ): Promise<ClaimTimelineEvent | null> {
    return this.claimStore.addTimelineEvent(claimId, event);
  }

  /**
   * Get claim timeline
   */
  async getTimeline(claimId: string): Promise<ClaimTimelineEvent[]> {
    const claim = await this.claimStore.get(claimId);
    if (!claim) {
      return [];
    }
    return claim.timeline;
  }

  // ==========================================================================
  // Analytics & Reporting
  // ==========================================================================

  /**
   * Get claim statistics for a user
   */
  async getClaimStats(userId: string): Promise<{
    total: number;
    byStatus: Map<ClaimStatus, number>;
    byType: Map<InsuranceType, number>;
    totalEstimatedAmount: number;
    totalApprovedAmount: number;
    averageProcessingDays: number;
  }> {
    const claims = await this.claimStore.list(userId);

    const byStatus = new Map<ClaimStatus, number>();
    const byType = new Map<InsuranceType, number>();
    let totalEstimated = 0;
    let totalApproved = 0;
    let totalProcessingDays = 0;
    let completedClaimsCount = 0;

    for (const claim of claims) {
      // Count by status
      byStatus.set(claim.status, (byStatus.get(claim.status) ?? 0) + 1);

      // Count by type
      byType.set(claim.type, (byType.get(claim.type) ?? 0) + 1);

      // Sum estimated amounts
      if (claim.estimatedAmount) {
        totalEstimated += claim.estimatedAmount;
      }

      // Sum approved amounts
      if (claim.approvedAmount) {
        totalApproved += claim.approvedAmount;
      }

      // Calculate processing time for completed claims
      if (['approved', 'denied', 'paid', 'closed'].includes(claim.status)) {
        const submitEvent = claim.timeline.find(e => e.type === 'filed');
        const completeEvent = claim.timeline.find(e =>
          e.type === 'decision_made' ||
          e.type === 'payment_received'
        );

        if (submitEvent && completeEvent) {
          const days = Math.floor(
            (completeEvent.timestamp - submitEvent.timestamp) / (24 * 60 * 60 * 1000)
          );
          totalProcessingDays += days;
          completedClaimsCount++;
        }
      }
    }

    return {
      total: claims.length,
      byStatus,
      byType,
      totalEstimatedAmount: totalEstimated,
      totalApprovedAmount: totalApproved,
      averageProcessingDays: completedClaimsCount > 0
        ? Math.round(totalProcessingDays / completedClaimsCount)
        : 0,
    };
  }

  /**
   * Get claims pending action
   */
  async getClaimsPendingAction(userId: string): Promise<InsuranceClaim[]> {
    const claims = await this.claimStore.list(userId, {
      status: ['draft', 'ready_to_file', 'additional_info_requested'],
    });

    return claims;
  }

  /**
   * Generate claim summary report
   */
  async generateClaimSummary(claimId: string): Promise<string> {
    const claim = await this.claimStore.get(claimId);
    if (!claim) {
      return 'Claim not found';
    }

    const docCheck = this.checkDocumentCompleteness(claim);
    const processing = this.estimateProcessingTime(claim);

    let summary = `Insurance Claim Summary\n`;
    summary += `${'='.repeat(40)}\n\n`;

    summary += `Claim Type: ${claim.type}\n`;
    summary += `Provider: ${claim.provider}\n`;
    summary += `Status: ${claim.status}\n`;
    summary += `Incident Date: ${new Date(claim.incidentDate).toLocaleDateString()}\n\n`;

    summary += `Description:\n${claim.description}\n\n`;

    if (claim.estimatedAmount) {
      summary += `Estimated Amount: $${claim.estimatedAmount.toFixed(2)}\n`;
    }
    if (claim.approvedAmount) {
      summary += `Approved Amount: $${claim.approvedAmount.toFixed(2)}\n`;
    }

    summary += `\nDocuments:\n`;
    summary += `  Required: ${docCheck.present.length}/${docCheck.present.length + docCheck.missing.length}\n`;
    if (docCheck.missing.length > 0) {
      summary += `  Missing: ${docCheck.missing.join(', ')}\n`;
    }

    summary += `\nEstimated Processing: ${processing.minDays}-${processing.maxDays} days\n`;

    summary += `\nNext Steps:\n`;
    for (const step of this.getNextSteps(claim)) {
      summary += `  - ${step}\n`;
    }

    summary += `\nTimeline:\n`;
    for (const event of claim.timeline.slice(-5)) {
      const date = new Date(event.timestamp).toLocaleDateString();
      summary += `  ${date}: ${event.description}\n`;
    }

    return summary;
  }
}

/**
 * Factory function to create insurance claim service
 */
export function createInsuranceClaimService(
  claimStore: InsuranceClaimStore,
  config?: Partial<SavingsConfig>
): InsuranceClaimService {
  return new InsuranceClaimService(claimStore, config?.insurance);
}
