/**
 * Negotiation Service
 *
 * Manages price negotiations with vendors through email and other channels.
 */

import type {
  NegotiationSession,
  NegotiationEmail,
  NegotiationStatus,
  NegotiationType,
  CounterOffer,
  VendorInfo,
  NegotiationServiceConfig,
} from '../types.js';
import type { NegotiationStore } from '../stores/index.js';
import type { SavingsConfig } from '../config.js';
import { EmailDrafter, type EmailTemplate, type EmailTone, type EmailDraft } from './email-drafter.js';
import { CounterOfferEngine, type MarketData, type StrategyEvaluation, type CounterOfferSuggestion } from './counter-offer.js';
import { VendorContactManager, type VendorContact, type NegotiationAttempt } from './dealer-contact.js';

export { EmailDrafter, type EmailTemplate, type EmailTone, type EmailDraft } from './email-drafter.js';
export { CounterOfferEngine, type MarketData, type StrategyEvaluation, type CounterOfferSuggestion } from './counter-offer.js';
export { VendorContactManager, type VendorContact, type NegotiationAttempt } from './dealer-contact.js';

/**
 * Email sending result
 */
export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Email provider interface
 */
export interface EmailProvider {
  send(options: {
    to: string;
    subject: string;
    body: string;
    from?: string;
    replyTo?: string;
  }): Promise<SendEmailResult>;
}

/**
 * Negotiation service configuration
 */
export interface NegotiationConfig {
  emailProvider: 'smtp' | 'sendgrid' | 'ses';
  defaultTone: EmailTone;
  followUpDays: number;
  maxAttempts: number;
}

/**
 * Negotiation service class
 */
export class NegotiationService {
  private readonly config: NegotiationConfig;
  private readonly emailDrafter: EmailDrafter;
  private readonly counterOfferEngine: CounterOfferEngine;
  private readonly vendorContactManager: VendorContactManager;
  private emailProvider?: EmailProvider;

  constructor(
    private readonly negotiationStore: NegotiationStore,
    config?: Partial<NegotiationServiceConfig>
  ) {
    this.config = {
      emailProvider: config?.emailProvider ?? 'smtp',
      defaultTone: 'formal',
      followUpDays: 7,
      maxAttempts: 5,
    };

    this.emailDrafter = new EmailDrafter();
    this.counterOfferEngine = new CounterOfferEngine();
    this.vendorContactManager = new VendorContactManager();
  }

  /**
   * Set the email provider for sending emails
   */
  setEmailProvider(provider: EmailProvider): void {
    this.emailProvider = provider;
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  /**
   * Start a new negotiation session
   */
  async startNegotiation(
    userId: string,
    type: NegotiationType,
    vendor: VendorInfo,
    currentAmount: number,
    targetAmount?: number
  ): Promise<NegotiationSession> {
    // Calculate recommended target if not provided
    const calculatedTarget = targetAmount ??
      this.counterOfferEngine.calculateTargetPrice(currentAmount, undefined, vendor).target;

    const session = await this.negotiationStore.createSession({
      userId,
      type,
      vendor,
      targetAmount: calculatedTarget,
      currentAmount,
      status: 'draft',
      emails: [],
      counterOffers: [],
      startedAt: Date.now(),
    });

    return session;
  }

  /**
   * Get a negotiation session by ID
   */
  async getSession(sessionId: string): Promise<NegotiationSession | null> {
    return this.negotiationStore.getSession(sessionId);
  }

  /**
   * Update session status
   */
  async updateStatus(
    sessionId: string,
    status: NegotiationStatus
  ): Promise<NegotiationSession | null> {
    const session = await this.negotiationStore.getSession(sessionId);
    if (!session) {
      return null;
    }

    const updated = await this.negotiationStore.updateSession(sessionId, { status });

    // Record outcome if session is complete
    if (updated && (status === 'accepted' || status === 'rejected')) {
      const finalAmount = status === 'accepted'
        ? (session.counterOffers[session.counterOffers.length - 1]?.amount ?? session.targetAmount)
        : session.currentAmount;

      this.vendorContactManager.recordNegotiationAttempt(session.vendor.name, {
        date: Date.now(),
        method: 'email',
        outcome: status === 'accepted' ? 'success' : 'rejected',
        originalAmount: session.currentAmount,
        finalAmount,
      });
    }

    return updated;
  }

  /**
   * List negotiations for a user
   */
  async listNegotiations(
    userId: string,
    options?: {
      status?: NegotiationStatus[];
      type?: NegotiationType[];
      limit?: number;
      offset?: number;
    }
  ): Promise<NegotiationSession[]> {
    return this.negotiationStore.listSessions(userId, options);
  }

  /**
   * Get active negotiations
   */
  async getActiveNegotiations(userId: string): Promise<NegotiationSession[]> {
    return this.negotiationStore.getActiveNegotiations(userId);
  }

  /**
   * Delete a negotiation session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    return this.negotiationStore.deleteSession(sessionId);
  }

  // ==========================================================================
  // Email Operations
  // ==========================================================================

  /**
   * Draft an email for a negotiation
   */
  draftEmail(
    session: NegotiationSession,
    template?: EmailTemplate,
    tone?: EmailTone
  ): EmailDraft {
    const suggestedTemplate = template ?? this.emailDrafter.suggestTemplate(session).template;
    const emailTone = tone ?? this.config.defaultTone;

    return this.emailDrafter.draft(session, {
      template: suggestedTemplate,
      tone: emailTone,
      includeLoyaltyHistory: true,
    });
  }

  /**
   * Get available email templates for a session
   */
  getAvailableTemplates(session: NegotiationSession): EmailTemplate[] {
    return this.emailDrafter.getAvailableTemplates(session);
  }

  /**
   * Get template suggestion with reasoning
   */
  getTemplateSuggestion(session: NegotiationSession): {
    template: EmailTemplate;
    reason: string;
  } {
    return this.emailDrafter.suggestTemplate(session);
  }

  /**
   * Add an email to a session
   */
  async addEmail(
    sessionId: string,
    email: Omit<NegotiationEmail, 'id'>
  ): Promise<NegotiationEmail | null> {
    return this.negotiationStore.addEmail(sessionId, email);
  }

  /**
   * Send an email for a negotiation
   */
  async sendEmail(
    sessionId: string,
    recipientEmail: string,
    draft: EmailDraft,
    senderInfo?: { name: string; email: string }
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.emailProvider) {
      return { success: false, error: 'Email provider not configured' };
    }

    const session = await this.negotiationStore.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Fill in placeholders
    let body = draft.body;
    if (senderInfo) {
      body = body.replace('[YOUR NAME]', senderInfo.name);
    }

    try {
      const result = await this.emailProvider.send({
        to: recipientEmail,
        subject: draft.subject,
        body,
        from: senderInfo?.email,
      });

      if (result.success) {
        // Record the email
        await this.negotiationStore.addEmail(sessionId, {
          direction: 'outbound',
          subject: draft.subject,
          body,
          sentAt: Date.now(),
          status: 'sent',
        });

        // Update session status
        if (session.status === 'draft') {
          await this.negotiationStore.updateSession(sessionId, { status: 'sent' });
        }
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  /**
   * Record an incoming email response
   */
  async recordResponse(
    sessionId: string,
    subject: string,
    body: string,
    receivedAt?: number
  ): Promise<NegotiationSession | null> {
    const session = await this.negotiationStore.getSession(sessionId);
    if (!session) {
      return null;
    }

    await this.negotiationStore.addEmail(sessionId, {
      direction: 'inbound',
      subject,
      body,
      receivedAt: receivedAt ?? Date.now(),
      status: 'received',
    });

    // Update status to negotiating if we got a response
    if (session.status === 'sent' || session.status === 'pending') {
      await this.negotiationStore.updateSession(sessionId, { status: 'negotiating' });
    }

    return this.negotiationStore.getSession(sessionId);
  }

  // ==========================================================================
  // Counter-Offer Operations
  // ==========================================================================

  /**
   * Generate counter-offer strategies
   */
  generateStrategies(
    session: NegotiationSession,
    marketData?: MarketData
  ): CounterOfferSuggestion[] {
    return this.counterOfferEngine.generateStrategies(session, marketData);
  }

  /**
   * Get the best counter-offer strategy
   */
  getBestStrategy(
    session: NegotiationSession,
    marketData?: MarketData
  ): CounterOfferSuggestion {
    return this.counterOfferEngine.selectBestStrategy(session, marketData);
  }

  /**
   * Add a counter-offer to a session
   */
  async addCounterOffer(
    sessionId: string,
    counterOffer: Omit<CounterOffer, 'id'>
  ): Promise<CounterOffer | null> {
    return this.negotiationStore.addCounterOffer(sessionId, counterOffer);
  }

  /**
   * Generate response to vendor's offer
   */
  generateCounterToOffer(
    session: NegotiationSession,
    vendorOffer: number,
    vendorReason?: string
  ): CounterOfferSuggestion {
    return this.counterOfferEngine.generateCounterToResponse(session, vendorOffer, vendorReason);
  }

  /**
   * Calculate recommended target price
   */
  calculateTargetPrice(
    currentPrice: number,
    marketData?: MarketData,
    vendorInfo?: VendorInfo
  ): { target: number; floor: number; ceiling: number } {
    return this.counterOfferEngine.calculateTargetPrice(currentPrice, marketData, vendorInfo);
  }

  // ==========================================================================
  // Vendor Contact Operations
  // ==========================================================================

  /**
   * Find vendor contact information
   */
  findVendorContact(vendorName: string): VendorContact | null {
    return this.vendorContactManager.findVendor(vendorName);
  }

  /**
   * Get negotiation tips for a vendor
   */
  getNegotiationTips(vendorName: string): string[] {
    return this.vendorContactManager.getNegotiationTips(vendorName);
  }

  /**
   * Get vendor success rate from history
   */
  getVendorSuccessRate(vendorName: string): { rate: number; attempts: number } | null {
    return this.vendorContactManager.getSuccessRate(vendorName);
  }

  /**
   * List known vendors
   */
  listKnownVendors(): string[] {
    return this.vendorContactManager.listKnownVendors();
  }

  // ==========================================================================
  // Templates
  // ==========================================================================

  /**
   * Save a negotiation template
   */
  async saveTemplate(
    userId: string,
    name: string,
    type: NegotiationType,
    templateData: {
      subject: string;
      body: string;
      tone: EmailTone;
    }
  ): Promise<{ id: string }> {
    const savedTemplate = await this.negotiationStore.createTemplate({
      name,
      type,
      vendorCategory: 'other',
      subject: templateData.subject,
      body: templateData.body,
      variables: this.extractVariables(templateData.body),
    });
    return { id: savedTemplate.id };
  }

  /**
   * Get templates for a user
   */
  async getTemplates(
    userId: string,
    type?: NegotiationType
  ): Promise<Array<{
    id: string;
    name: string;
    type: NegotiationType;
    subject: string;
    body: string;
    variables: string[];
  }>> {
    return this.negotiationStore.listTemplates({ type });
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    return this.negotiationStore.deleteTemplate(templateId);
  }

  // ==========================================================================
  // Analytics
  // ==========================================================================

  /**
   * Get negotiation statistics for a user
   */
  async getStats(userId: string): Promise<{
    totalNegotiations: number;
    successRate: number;
    totalSavings: number;
    averageSavings: number;
    byVendor: Map<string, { count: number; savings: number }>;
  }> {
    const [successRate, totalSavings, avgSavings] = await Promise.all([
      this.negotiationStore.getSuccessRate(userId),
      this.negotiationStore.getTotalSavings(userId),
      this.negotiationStore.getAverageSavings(userId),
    ]);

    const negotiations = await this.negotiationStore.listSessions(userId);
    const totalNegotiations = negotiations.length;

    // Calculate by vendor
    const byVendor = new Map<string, { count: number; savings: number }>();
    for (const session of negotiations) {
      const vendorName = session.vendor.name;
      const current = byVendor.get(vendorName) ?? { count: 0, savings: 0 };
      current.count++;

      if (session.status === 'accepted' && session.counterOffers.length > 0) {
        const finalOffer = session.counterOffers[session.counterOffers.length - 1];
        current.savings += session.currentAmount - finalOffer.amount;
      }

      byVendor.set(vendorName, current);
    }

    return {
      totalNegotiations,
      successRate,
      totalSavings,
      averageSavings: avgSavings,
      byVendor,
    };
  }

  /**
   * Get sessions needing follow-up
   */
  async getSessionsNeedingFollowUp(userId: string): Promise<NegotiationSession[]> {
    const active = await this.negotiationStore.getActiveNegotiations(userId);
    const followUpThreshold = this.config.followUpDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    return active.filter(session => {
      const lastEmail = session.emails
        .filter(e => e.direction === 'outbound')
        .sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0))[0];

      if (!lastEmail?.sentAt) {
        return false;
      }

      return (now - lastEmail.sentAt) > followUpThreshold;
    });
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Extract variables from template text
   */
  private extractVariables(text: string): string[] {
    const regex = /\[([A-Z_\s]+)\]/g;
    const variables: string[] = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (!variables.includes(match[0])) {
        variables.push(match[0]);
      }
    }

    return variables;
  }
}

/**
 * Factory function to create negotiation service
 */
export function createNegotiationService(
  negotiationStore: NegotiationStore,
  config?: Partial<SavingsConfig>
): NegotiationService {
  return new NegotiationService(negotiationStore, config?.negotiation);
}
