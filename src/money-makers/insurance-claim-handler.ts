/**
 * Insurance Claim Handler
 *
 * Automate insurance claims with form filling, document tracking, and appeals
 */

import type {
  InsuranceClaim,
  InsuranceProvider,
  ClaimDocument,
  ClaimCommunication,
  FollowUp,
  AppealLetter,
  ClaimStatus,
  InsuranceType,
  Money,
  NotificationProvider,
  AlertChannel,
} from './types.js';
import {
  MONEY_MAKERS_EVENTS,
  formatMoney,
  redactPII,
} from './constants.js';

// =============================================================================
// Insurance Claim Handler Config
// =============================================================================

export interface InsuranceClaimHandlerConfig {
  /** Notification provider */
  notificationProvider?: NotificationProvider;
  /** Default alert channels */
  defaultAlertChannels: AlertChannel[];
  /** Auto-schedule follow-ups */
  autoScheduleFollowUps: boolean;
  /** Default follow-up interval in days */
  defaultFollowUpDays: number;
  /** AI assistant for generating letters */
  aiAssistant?: {
    generateAppealLetter(claim: InsuranceClaim): Promise<AppealLetter>;
    suggestDocuments(claimType: InsuranceType, description: string): Promise<string[]>;
  };
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: InsuranceClaimHandlerConfig = {
  defaultAlertChannels: ['push', 'email'],
  autoScheduleFollowUps: true,
  defaultFollowUpDays: 7,
};

// =============================================================================
// Document Requirements by Claim Type
// =============================================================================

const REQUIRED_DOCUMENTS: Record<InsuranceType, string[]> = {
  health: [
    'Itemized medical bill',
    'Explanation of Benefits (EOB)',
    'Doctor\'s referral/prescription',
    'Medical records',
  ],
  auto: [
    'Police report',
    'Photos of damage',
    'Repair estimate',
    'Other driver\'s insurance info',
  ],
  home: [
    'Photos of damage',
    'Repair estimates',
    'Inventory of damaged items',
    'Police report (if theft)',
  ],
  life: [
    'Death certificate',
    'Policy documents',
    'Beneficiary identification',
  ],
  disability: [
    'Medical records',
    'Doctor\'s statement',
    'Employment records',
    'Proof of income',
  ],
  travel: [
    'Travel itinerary',
    'Receipts for expenses',
    'Medical records (if applicable)',
    'Police report (if theft)',
  ],
  pet: [
    'Veterinary records',
    'Itemized bills',
    'Treatment plan',
  ],
  other: [
    'Supporting documentation',
    'Receipts/invoices',
    'Photos (if applicable)',
  ],
};

// =============================================================================
// Insurance Claim Handler
// =============================================================================

export class InsuranceClaimHandler {
  private readonly config: InsuranceClaimHandlerConfig;
  private claims = new Map<string, InsuranceClaim>();
  private providers = new Map<string, InsuranceProvider>();
  private followUpTimers = new Map<string, NodeJS.Timeout>();

  constructor(config?: Partial<InsuranceClaimHandlerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Provider Management
  // ==========================================================================

  /**
   * Register an insurance provider
   */
  registerProvider(provider: InsuranceProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Get provider by ID
   */
  getProvider(providerId: string): InsuranceProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * List all providers
   */
  listProviders(): InsuranceProvider[] {
    return Array.from(this.providers.values());
  }

  // ==========================================================================
  // Claim Management
  // ==========================================================================

  /**
   * Create a new insurance claim
   */
  createClaim(params: {
    userId: string;
    provider: InsuranceProvider;
    type: InsuranceType;
    incidentDate: number;
    description: string;
    claimAmount: Money;
  }): InsuranceClaim {
    const id = this.generateId();
    const now = Date.now();

    // Generate required documents checklist
    const requiredDocs = REQUIRED_DOCUMENTS[params.type] ?? REQUIRED_DOCUMENTS.other;
    const documents: ClaimDocument[] = requiredDocs.map((doc, index) => ({
      id: `doc-${index}`,
      type: 'form',
      name: doc,
      required: true,
      obtained: false,
      uploadedAt: 0,
    }));

    const claim: InsuranceClaim = {
      id,
      userId: params.userId,
      provider: params.provider,
      type: params.type,
      incidentDate: params.incidentDate,
      description: params.description,
      claimAmount: params.claimAmount,
      status: 'draft',
      documents,
      communications: [],
      followUps: [],
      createdAt: now,
      updatedAt: now,
    };

    this.claims.set(id, claim);

    this.emit(MONEY_MAKERS_EVENTS.CLAIM_CREATED, {
      claimId: id,
      type: params.type,
      amount: params.claimAmount,
    });

    return claim;
  }

  /**
   * Get claim by ID
   */
  getClaim(claimId: string): InsuranceClaim {
    const claim = this.claims.get(claimId);
    if (!claim) {
      throw new Error(`Claim not found: ${claimId}`);
    }
    return claim;
  }

  /**
   * Get all claims for a user
   */
  getUserClaims(userId: string, status?: ClaimStatus): InsuranceClaim[] {
    return Array.from(this.claims.values()).filter(
      c => c.userId === userId && (!status || c.status === status)
    );
  }

  /**
   * Update claim status
   */
  updateStatus(
    claimId: string,
    status: ClaimStatus,
    details?: { claimNumber?: string; approvedAmount?: Money }
  ): InsuranceClaim {
    const claim = this.getClaim(claimId);
    const previousStatus = claim.status;

    claim.status = status;
    claim.updatedAt = Date.now();

    if (details?.claimNumber) {
      claim.claimNumber = details.claimNumber;
    }

    if (details?.approvedAmount) {
      claim.approvedAmount = details.approvedAmount;
    }

    if (status === 'submitted' && !claim.submittedAt) {
      claim.submittedAt = Date.now();
    }

    if (['approved', 'partially_approved', 'denied', 'paid', 'closed'].includes(status)) {
      claim.resolvedAt = Date.now();
    }

    this.emit(MONEY_MAKERS_EVENTS.CLAIM_STATUS_CHANGED, {
      claimId,
      previousStatus,
      newStatus: status,
    });

    // Emit specific events
    if (status === 'approved' || status === 'partially_approved') {
      this.emit(MONEY_MAKERS_EVENTS.CLAIM_APPROVED, {
        claimId,
        approvedAmount: claim.approvedAmount,
      });
    } else if (status === 'denied') {
      this.emit(MONEY_MAKERS_EVENTS.CLAIM_DENIED, { claimId });
    }

    // Auto-schedule follow-up for certain statuses
    if (this.config.autoScheduleFollowUps && ['under_review', 'additional_info_needed'].includes(status)) {
      this.scheduleFollowUp(claimId, 'Check on claim status');
    }

    return claim;
  }

  // ==========================================================================
  // Document Management
  // ==========================================================================

  /**
   * Get document checklist
   */
  getDocumentChecklist(claimId: string): ClaimDocument[] {
    const claim = this.getClaim(claimId);
    return claim.documents;
  }

  /**
   * Mark document as obtained
   */
  markDocumentObtained(
    claimId: string,
    documentId: string,
    filePath?: string
  ): void {
    const claim = this.getClaim(claimId);
    const doc = claim.documents.find(d => d.id === documentId);

    if (!doc) {
      throw new Error(`Document not found: ${documentId}`);
    }

    doc.obtained = true;
    doc.uploadedAt = Date.now();
    if (filePath) {
      doc.filePath = filePath;
    }

    claim.updatedAt = Date.now();
  }

  /**
   * Add a custom document
   */
  addDocument(
    claimId: string,
    document: Omit<ClaimDocument, 'id' | 'uploadedAt'>
  ): ClaimDocument {
    const claim = this.getClaim(claimId);
    const doc: ClaimDocument = {
      id: `doc-${Date.now()}`,
      ...document,
      uploadedAt: Date.now(),
    };

    claim.documents.push(doc);
    claim.updatedAt = Date.now();

    return doc;
  }

  /**
   * Check if all required documents are obtained
   */
  hasAllRequiredDocuments(claimId: string): boolean {
    const claim = this.getClaim(claimId);
    return claim.documents
      .filter(d => d.required)
      .every(d => d.obtained);
  }

  /**
   * Get missing documents
   */
  getMissingDocuments(claimId: string): ClaimDocument[] {
    const claim = this.getClaim(claimId);
    return claim.documents.filter(d => d.required && !d.obtained);
  }

  /**
   * Get suggested documents using AI
   */
  async suggestDocuments(claimId: string): Promise<string[]> {
    const claim = this.getClaim(claimId);

    if (this.config.aiAssistant) {
      return this.config.aiAssistant.suggestDocuments(claim.type, claim.description);
    }

    // Default suggestions based on type
    return REQUIRED_DOCUMENTS[claim.type] ?? REQUIRED_DOCUMENTS.other;
  }

  // ==========================================================================
  // Communication Tracking
  // ==========================================================================

  /**
   * Record a communication
   */
  recordCommunication(
    claimId: string,
    communication: Omit<ClaimCommunication, 'id' | 'timestamp'>
  ): ClaimCommunication {
    const claim = this.getClaim(claimId);
    const comm: ClaimCommunication = {
      id: `comm-${Date.now()}`,
      ...communication,
      timestamp: Date.now(),
    };

    claim.communications.push(comm);
    claim.updatedAt = Date.now();

    // Check for action required
    if (communication.actionRequired) {
      this.emit(MONEY_MAKERS_EVENTS.CLAIM_DOCUMENT_NEEDED, {
        claimId,
        action: communication.actionRequired,
      });
    }

    return comm;
  }

  /**
   * Get communication history
   */
  getCommunicationHistory(claimId: string): ClaimCommunication[] {
    const claim = this.getClaim(claimId);
    return [...claim.communications].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Generate provider communication draft
   */
  generateCommunicationDraft(
    claimId: string,
    type: 'status_inquiry' | 'document_submission' | 'escalation'
  ): string {
    const claim = this.getClaim(claimId);

    const templates: Record<typeof type, string> = {
      status_inquiry: `Dear ${claim.provider.name} Claims Department,

I am writing to inquire about the status of my claim.

Claim Number: ${claim.claimNumber ?? 'Pending'}
Policy Number: ${claim.provider.policyNumber}
Date of Incident: ${new Date(claim.incidentDate).toLocaleDateString()}
Claim Amount: ${formatMoney(claim.claimAmount.amount, claim.claimAmount.currency)}

Please provide an update on the current status of my claim and any additional information that may be required.

Thank you for your assistance.

Sincerely,
[Your Name]`,

      document_submission: `Dear ${claim.provider.name} Claims Department,

Please find attached the requested documentation for my claim.

Claim Number: ${claim.claimNumber ?? 'Pending'}
Policy Number: ${claim.provider.policyNumber}

Documents Attached:
${claim.documents.filter(d => d.obtained).map(d => `- ${d.name}`).join('\n')}

Please confirm receipt and let me know if any additional documentation is required.

Sincerely,
[Your Name]`,

      escalation: `Dear ${claim.provider.name} Customer Service Manager,

I am writing to escalate my claim that has been pending for an extended period.

Claim Number: ${claim.claimNumber ?? 'Pending'}
Policy Number: ${claim.provider.policyNumber}
Original Submission Date: ${claim.submittedAt ? new Date(claim.submittedAt).toLocaleDateString() : 'N/A'}

Despite multiple follow-ups, I have not received a satisfactory resolution. I request that this matter be escalated for immediate review.

Please contact me at your earliest convenience.

Sincerely,
[Your Name]`,
    };

    return templates[type];
  }

  // ==========================================================================
  // Follow-up Management
  // ==========================================================================

  /**
   * Schedule a follow-up
   */
  scheduleFollowUp(
    claimId: string,
    reason: string,
    daysFromNow?: number
  ): FollowUp {
    const claim = this.getClaim(claimId);
    const days = daysFromNow ?? this.config.defaultFollowUpDays;

    const followUp: FollowUp = {
      id: `followup-${Date.now()}`,
      scheduledFor: Date.now() + days * 24 * 60 * 60 * 1000,
      reason,
      completed: false,
    };

    claim.followUps.push(followUp);
    claim.updatedAt = Date.now();

    // Set timer for notification
    const timer = setTimeout(
      () => this.triggerFollowUpNotification(claimId, followUp.id),
      days * 24 * 60 * 60 * 1000
    );

    this.followUpTimers.set(followUp.id, timer);

    return followUp;
  }

  /**
   * Complete a follow-up
   */
  completeFollowUp(
    claimId: string,
    followUpId: string,
    notes?: string
  ): void {
    const claim = this.getClaim(claimId);
    const followUp = claim.followUps.find(f => f.id === followUpId);

    if (!followUp) {
      throw new Error(`Follow-up not found: ${followUpId}`);
    }

    followUp.completed = true;
    followUp.completedAt = Date.now();
    followUp.notes = notes;

    claim.updatedAt = Date.now();

    // Clear timer
    const timer = this.followUpTimers.get(followUpId);
    if (timer) {
      clearTimeout(timer);
      this.followUpTimers.delete(followUpId);
    }
  }

  /**
   * Get pending follow-ups
   */
  getPendingFollowUps(userId: string): Array<{ claim: InsuranceClaim; followUp: FollowUp }> {
    const results: Array<{ claim: InsuranceClaim; followUp: FollowUp }> = [];

    for (const claim of this.getUserClaims(userId)) {
      for (const followUp of claim.followUps) {
        if (!followUp.completed) {
          results.push({ claim, followUp });
        }
      }
    }

    return results.sort((a, b) => a.followUp.scheduledFor - b.followUp.scheduledFor);
  }

  // ==========================================================================
  // Appeal Generation
  // ==========================================================================

  /**
   * Generate appeal letter
   */
  async generateAppealLetter(claimId: string): Promise<AppealLetter> {
    const claim = this.getClaim(claimId);

    if (claim.status !== 'denied' && claim.status !== 'partially_approved') {
      throw new Error('Appeals can only be generated for denied or partially approved claims');
    }

    if (this.config.aiAssistant) {
      return this.config.aiAssistant.generateAppealLetter(claim);
    }

    return this.generateDefaultAppealLetter(claim);
  }

  /**
   * Submit appeal
   */
  submitAppeal(claimId: string): InsuranceClaim {
    const claim = this.getClaim(claimId);

    claim.status = 'appealed';
    claim.updatedAt = Date.now();

    // Schedule follow-up
    this.scheduleFollowUp(claimId, 'Check appeal status', 14);

    return claim;
  }

  // ==========================================================================
  // Claim Summary
  // ==========================================================================

  /**
   * Get claim summary
   */
  getClaimSummary(claimId: string): {
    claim: InsuranceClaim;
    documentsComplete: boolean;
    missingDocuments: string[];
    pendingFollowUps: number;
    daysOpen: number;
    potentialRecovery: Money;
  } {
    const claim = this.getClaim(claimId);
    const missingDocs = this.getMissingDocuments(claimId);
    const pendingFollowUps = claim.followUps.filter(f => !f.completed).length;
    const daysOpen = Math.floor((Date.now() - claim.createdAt) / (24 * 60 * 60 * 1000));

    const potentialRecovery: Money = {
      amount: claim.approvedAmount?.amount ?? claim.claimAmount.amount,
      currency: claim.claimAmount.currency,
    };

    return {
      claim,
      documentsComplete: missingDocs.length === 0,
      missingDocuments: missingDocs.map(d => d.name),
      pendingFollowUps,
      daysOpen,
      potentialRecovery,
    };
  }

  /**
   * Get total claims value
   */
  getTotalClaimsValue(userId: string, status?: ClaimStatus[]): Money {
    const claims = this.getUserClaims(userId);
    const filtered = status
      ? claims.filter(c => status.includes(c.status))
      : claims;

    let total = 0;
    let currency: Money['currency'] = 'USD';

    for (const claim of filtered) {
      const amount = claim.approvedAmount?.amount ?? claim.claimAmount.amount;
      total += amount;
      currency = claim.claimAmount.currency;
    }

    return { amount: total, currency };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private generateDefaultAppealLetter(claim: InsuranceClaim): AppealLetter {
    const keyArguments = [
      'The claim meets all policy requirements',
      'All required documentation has been provided',
      'The denial does not align with policy terms',
    ];

    const supportingDocuments = claim.documents
      .filter(d => d.obtained)
      .map(d => d.name);

    const body = `Dear ${claim.provider.name} Appeals Department,

I am writing to formally appeal the denial of my insurance claim.

Claim Number: ${claim.claimNumber ?? 'N/A'}
Policy Number: ${claim.provider.policyNumber}
Date of Incident: ${new Date(claim.incidentDate).toLocaleDateString()}
Original Claim Amount: ${formatMoney(claim.claimAmount.amount, claim.claimAmount.currency)}

I respectfully disagree with the decision to deny my claim for the following reasons:

${keyArguments.map((arg, i) => `${i + 1}. ${arg}`).join('\n')}

Supporting Documentation:
${supportingDocuments.map(doc => `- ${doc}`).join('\n')}

I request that you reconsider this claim based on the evidence provided. Please review my policy terms and the documentation submitted.

If additional information is required, please contact me immediately.

I look forward to a favorable resolution.

Sincerely,
[Your Name]`;

    return {
      claimId: claim.id,
      subject: `Appeal: Claim ${claim.claimNumber ?? claim.id} - ${claim.provider.name}`,
      body,
      keyArguments,
      supportingDocuments,
      generatedAt: Date.now(),
    };
  }

  private async triggerFollowUpNotification(
    claimId: string,
    followUpId: string
  ): Promise<void> {
    const claim = this.claims.get(claimId);
    const followUp = claim?.followUps.find(f => f.id === followUpId);

    if (!claim || !followUp || followUp.completed) return;

    this.emit(MONEY_MAKERS_EVENTS.CLAIM_FOLLOW_UP_DUE, {
      claimId,
      followUpId,
      reason: followUp.reason,
    });

    if (this.config.notificationProvider) {
      for (const channel of this.config.defaultAlertChannels) {
        await this.config.notificationProvider.send(
          claim.userId,
          channel,
          'Insurance Claim Follow-up Due',
          `${followUp.reason} - Claim: ${claim.claimNumber ?? claim.id}`
        );
      }
    }
  }

  private generateId(): string {
    return `claim-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private emit(event: string, data: unknown): void {
    const safeData = typeof data === 'object' && data !== null
      ? JSON.parse(redactPII(JSON.stringify(data)))
      : data;
    this.config.onEvent?.(event, safeData);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createInsuranceClaimHandler(
  config?: Partial<InsuranceClaimHandlerConfig>
): InsuranceClaimHandler {
  return new InsuranceClaimHandler(config);
}
