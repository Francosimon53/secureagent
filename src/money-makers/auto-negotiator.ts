/**
 * Auto-Negotiator
 *
 * Multi-channel price negotiation system for cars, services, contracts, salaries
 */

import type {
  Negotiation,
  NegotiationTarget,
  NegotiationStrategy,
  NegotiationParty,
  NegotiationMessage,
  NegotiationStatus,
  NegotiationDraft,
  CounterOfferSuggestion,
  Money,
  ContactInfo,
  EmailProvider,
} from './types.js';
import {
  MONEY_MAKERS_EVENTS,
  NEGOTIATION_STRATEGIES,
  NEGOTIATION_TYPE_TIPS,
  formatMoney,
  redactPII,
} from './constants.js';

// =============================================================================
// Auto-Negotiator Config
// =============================================================================

export interface AutoNegotiatorConfig {
  /** Email provider for sending negotiation messages */
  emailProvider?: EmailProvider;
  /** Default strategy */
  defaultStrategy: NegotiationStrategy;
  /** Max concurrent negotiations */
  maxConcurrentNegotiations: number;
  /** Follow-up interval in hours */
  followUpIntervalHours: number;
  /** Max follow-ups before closing */
  maxFollowUps: number;
  /** AI assistant for drafting messages */
  aiAssistant?: {
    generateDraft(context: NegotiationContext): Promise<NegotiationDraft>;
    suggestCounterOffer(context: NegotiationContext, incomingOffer: Money): Promise<CounterOfferSuggestion>;
  };
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

interface NegotiationContext {
  negotiation: Negotiation;
  party: NegotiationParty;
  strategy: typeof NEGOTIATION_STRATEGIES[keyof typeof NEGOTIATION_STRATEGIES];
  round: number;
}

const DEFAULT_CONFIG: AutoNegotiatorConfig = {
  defaultStrategy: 'moderate',
  maxConcurrentNegotiations: 5,
  followUpIntervalHours: 48,
  maxFollowUps: 3,
};

// =============================================================================
// Auto-Negotiator
// =============================================================================

export class AutoNegotiator {
  private readonly config: AutoNegotiatorConfig;
  private negotiations = new Map<string, Negotiation>();
  private followUpTimers = new Map<string, NodeJS.Timeout>();

  constructor(config?: Partial<AutoNegotiatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start a new negotiation
   */
  async startNegotiation(params: {
    userId: string;
    target: NegotiationTarget;
    parties: ContactInfo[];
    strategy?: NegotiationStrategy;
  }): Promise<Negotiation> {
    const id = this.generateId();
    const strategy = params.strategy ?? this.config.defaultStrategy;

    const negotiation: Negotiation = {
      id,
      userId: params.userId,
      target: params.target,
      strategy,
      parties: params.parties.map((contact, index) => ({
        id: `party-${index}`,
        contact,
        channel: contact.email ? 'email' : 'phone',
        responseHistory: [],
        status: 'contacted',
      })),
      status: 'draft',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      notes: [],
    };

    this.negotiations.set(id, negotiation);

    this.emit(MONEY_MAKERS_EVENTS.NEGOTIATION_STARTED, {
      negotiationId: id,
      target: params.target,
      partyCount: params.parties.length,
    });

    return negotiation;
  }

  /**
   * Send initial outreach to all parties
   */
  async sendInitialOutreach(negotiationId: string): Promise<void> {
    const negotiation = this.getNegotiation(negotiationId);

    negotiation.status = 'active';
    negotiation.updatedAt = Date.now();

    for (const party of negotiation.parties) {
      try {
        const draft = await this.generateInitialDraft(negotiation, party);
        await this.sendMessage(negotiation, party, draft);
        party.status = 'contacted';
      } catch (error) {
        party.notes = `Failed to contact: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }
  }

  /**
   * Generate draft message for a party
   */
  async generateDraft(
    negotiationId: string,
    partyId: string,
    type: 'initial' | 'counter' | 'followup' | 'accept' | 'reject'
  ): Promise<NegotiationDraft> {
    const negotiation = this.getNegotiation(negotiationId);
    const party = this.getParty(negotiation, partyId);
    const strategyConfig = NEGOTIATION_STRATEGIES[negotiation.strategy];
    const round = party.responseHistory.filter(m => m.direction === 'outbound').length;

    const context: NegotiationContext = {
      negotiation,
      party,
      strategy: strategyConfig,
      round,
    };

    if (this.config.aiAssistant) {
      return this.config.aiAssistant.generateDraft(context);
    }

    return this.generateDefaultDraft(context, type);
  }

  /**
   * Get counter-offer suggestion
   */
  async suggestCounterOffer(
    negotiationId: string,
    partyId: string,
    incomingOffer: Money
  ): Promise<CounterOfferSuggestion> {
    const negotiation = this.getNegotiation(negotiationId);
    const party = this.getParty(negotiation, partyId);
    const strategyConfig = NEGOTIATION_STRATEGIES[negotiation.strategy];
    const round = party.responseHistory.filter(m => m.direction === 'outbound').length;

    const context: NegotiationContext = {
      negotiation,
      party,
      strategy: strategyConfig,
      round,
    };

    if (this.config.aiAssistant) {
      return this.config.aiAssistant.suggestCounterOffer(context, incomingOffer);
    }

    return this.calculateCounterOffer(context, incomingOffer);
  }

  /**
   * Record incoming response from a party
   */
  recordResponse(
    negotiationId: string,
    partyId: string,
    response: {
      content: string;
      offer?: Money;
      channel?: string;
    }
  ): NegotiationMessage {
    const negotiation = this.getNegotiation(negotiationId);
    const party = this.getParty(negotiation, partyId);

    const message: NegotiationMessage = {
      id: this.generateId(),
      direction: 'inbound',
      channel: response.channel ?? party.channel,
      content: response.content,
      offer: response.offer,
      timestamp: Date.now(),
    };

    party.responseHistory.push(message);
    party.status = 'responded';

    if (response.offer) {
      party.currentOffer = response.offer;
      this.updateBestOffer(negotiation);
    }

    negotiation.status = 'counter_offered';
    negotiation.updatedAt = Date.now();

    this.emit(MONEY_MAKERS_EVENTS.NEGOTIATION_RESPONSE_RECEIVED, {
      negotiationId,
      partyId,
      offer: response.offer,
    });

    return message;
  }

  /**
   * Send a counter-offer
   */
  async sendCounterOffer(
    negotiationId: string,
    partyId: string,
    counterOffer: Money,
    message?: string
  ): Promise<void> {
    const negotiation = this.getNegotiation(negotiationId);
    const party = this.getParty(negotiation, partyId);

    const draft: NegotiationDraft = message
      ? {
          subject: `Re: ${negotiation.target.description}`,
          body: message,
          tone: 'professional',
          keyPoints: [],
        }
      : await this.generateDraft(negotiationId, partyId, 'counter');

    draft.body = draft.body.replace(
      '{COUNTER_OFFER}',
      formatMoney(counterOffer.amount, counterOffer.currency)
    );

    await this.sendMessage(negotiation, party, draft, counterOffer);

    party.status = 'negotiating';
    negotiation.status = 'awaiting_response';
    negotiation.updatedAt = Date.now();

    this.scheduleFollowUp(negotiation, party);

    this.emit(MONEY_MAKERS_EVENTS.NEGOTIATION_COUNTER_OFFER, {
      negotiationId,
      partyId,
      counterOffer,
    });
  }

  /**
   * Accept an offer
   */
  async acceptOffer(negotiationId: string, partyId: string): Promise<void> {
    const negotiation = this.getNegotiation(negotiationId);
    const party = this.getParty(negotiation, partyId);

    const draft = await this.generateDraft(negotiationId, partyId, 'accept');
    await this.sendMessage(negotiation, party, draft);

    party.status = 'closed';
    negotiation.status = 'accepted';
    negotiation.completedAt = Date.now();
    negotiation.updatedAt = Date.now();

    if (party.currentOffer) {
      negotiation.bestOffer = { partyId, offer: party.currentOffer };
      negotiation.savedAmount = {
        amount: negotiation.target.maxBudget.amount - party.currentOffer.amount,
        currency: party.currentOffer.currency,
      };
    }

    this.clearFollowUp(partyId);

    // Notify other parties of rejection
    for (const otherParty of negotiation.parties) {
      if (otherParty.id !== partyId && otherParty.status !== 'closed') {
        await this.rejectParty(negotiation, otherParty);
      }
    }

    this.emit(MONEY_MAKERS_EVENTS.NEGOTIATION_COMPLETED, {
      negotiationId,
      partyId,
      finalOffer: party.currentOffer,
      savedAmount: negotiation.savedAmount,
    });
  }

  /**
   * Reject all offers and close negotiation
   */
  async cancelNegotiation(negotiationId: string, reason?: string): Promise<void> {
    const negotiation = this.getNegotiation(negotiationId);

    for (const party of negotiation.parties) {
      if (party.status !== 'closed') {
        await this.rejectParty(negotiation, party, reason);
      }
      this.clearFollowUp(party.id);
    }

    negotiation.status = 'cancelled';
    negotiation.completedAt = Date.now();
    negotiation.updatedAt = Date.now();
    if (reason) {
      negotiation.notes.push(`Cancelled: ${reason}`);
    }

    this.emit(MONEY_MAKERS_EVENTS.NEGOTIATION_CANCELLED, {
      negotiationId,
      reason,
    });
  }

  /**
   * Get negotiation by ID
   */
  getNegotiation(id: string): Negotiation {
    const negotiation = this.negotiations.get(id);
    if (!negotiation) {
      throw new Error(`Negotiation not found: ${id}`);
    }
    return negotiation;
  }

  /**
   * List all negotiations for a user
   */
  listNegotiations(userId: string, status?: NegotiationStatus): Negotiation[] {
    return Array.from(this.negotiations.values()).filter(
      n => n.userId === userId && (!status || n.status === status)
    );
  }

  /**
   * Get negotiation tips for a type
   */
  getTips(type: NegotiationTarget['type']): string[] {
    return NEGOTIATION_TYPE_TIPS[type] ?? NEGOTIATION_TYPE_TIPS.custom;
  }

  /**
   * Calculate potential savings based on strategy
   */
  estimateSavings(target: NegotiationTarget, strategy: NegotiationStrategy): Money {
    const strategyConfig = NEGOTIATION_STRATEGIES[strategy];
    const estimatedSavings = target.maxBudget.amount * strategyConfig.initialDiscount;

    return {
      amount: Math.round(estimatedSavings),
      currency: target.maxBudget.currency,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private getParty(negotiation: Negotiation, partyId: string): NegotiationParty {
    const party = negotiation.parties.find(p => p.id === partyId);
    if (!party) {
      throw new Error(`Party not found: ${partyId}`);
    }
    return party;
  }

  private async generateInitialDraft(
    negotiation: Negotiation,
    party: NegotiationParty
  ): Promise<NegotiationDraft> {
    return this.generateDefaultDraft(
      {
        negotiation,
        party,
        strategy: NEGOTIATION_STRATEGIES[negotiation.strategy],
        round: 0,
      },
      'initial'
    );
  }

  private generateDefaultDraft(
    context: NegotiationContext,
    type: 'initial' | 'counter' | 'followup' | 'accept' | 'reject'
  ): NegotiationDraft {
    const { negotiation, party, strategy } = context;
    const target = negotiation.target;

    const templates: Record<typeof type, () => NegotiationDraft> = {
      initial: () => {
        const initialOffer = {
          amount: target.maxBudget.amount * (1 - strategy.initialDiscount),
          currency: target.maxBudget.currency,
        };

        return {
          subject: `Inquiry: ${target.description}`,
          body: `Dear ${party.contact.name ?? 'Sir/Madam'},

I am interested in ${target.description} and am reaching out to discuss pricing options.

${target.mustHaves?.length ? `Key requirements:\n${target.mustHaves.map(r => `- ${r}`).join('\n')}` : ''}

Based on my research and budget, I would like to propose ${formatMoney(initialOffer.amount, initialOffer.currency)} as a starting point for discussion.

${target.deadline ? `I am looking to make a decision by ${new Date(target.deadline).toLocaleDateString()}.` : ''}

Please let me know if this is something we can work with, or if you have any questions.

Best regards`,
          tone: strategy.toneLevel,
          keyPoints: [
            `Initial offer: ${formatMoney(initialOffer.amount, initialOffer.currency)}`,
            ...(target.mustHaves ?? []),
          ],
        };
      },

      counter: () => ({
        subject: `Re: ${target.description}`,
        body: `Thank you for your response regarding ${target.description}.

I appreciate your offer of ${party.currentOffer ? formatMoney(party.currentOffer.amount, party.currentOffer.currency) : 'the amount discussed'}.

After careful consideration, I would like to propose {COUNTER_OFFER} as my counter-offer.

I believe this represents fair value and I am committed to moving forward quickly if we can agree on terms.

Please let me know your thoughts.

Best regards`,
        tone: strategy.toneLevel,
        keyPoints: ['Counter-offer sent', 'Expressed commitment to quick resolution'],
      }),

      followup: () => ({
        subject: `Follow Up: ${target.description}`,
        body: `Dear ${party.contact.name ?? 'Sir/Madam'},

I wanted to follow up on my previous message regarding ${target.description}.

I remain very interested in working together and would appreciate an update on your availability to discuss terms.

${negotiation.strategy === 'time_pressure' ? 'I have received other quotes and will need to make a decision soon.' : ''}

Looking forward to hearing from you.

Best regards`,
        tone: 'professional',
        keyPoints: ['Follow-up message', 'Maintained interest'],
      }),

      accept: () => ({
        subject: `Acceptance: ${target.description}`,
        body: `Dear ${party.contact.name ?? 'Sir/Madam'},

Thank you for working with me on ${target.description}.

I am pleased to accept your offer of ${party.currentOffer ? formatMoney(party.currentOffer.amount, party.currentOffer.currency) : 'the agreed amount'}.

Please let me know the next steps to finalize our agreement.

Best regards`,
        tone: 'friendly',
        keyPoints: ['Offer accepted', 'Requested next steps'],
      }),

      reject: () => ({
        subject: `Re: ${target.description}`,
        body: `Dear ${party.contact.name ?? 'Sir/Madam'},

Thank you for your time regarding ${target.description}.

After careful consideration, I have decided to pursue other options at this time.

I appreciate your efforts and wish you all the best.

Best regards`,
        tone: 'professional',
        keyPoints: ['Declined offer', 'Maintained professional relationship'],
      }),
    };

    return templates[type]();
  }

  private calculateCounterOffer(
    context: NegotiationContext,
    incomingOffer: Money
  ): CounterOfferSuggestion {
    const { negotiation, strategy, round } = context;
    const target = negotiation.target;
    const maxBudget = target.maxBudget.amount;
    const idealPrice = target.idealPrice?.amount ?? maxBudget * 0.85;

    // Calculate counter based on round and strategy
    const stepReduction = strategy.counterStep * (strategy.maxRounds - round);
    const counterAmount = Math.max(
      idealPrice,
      incomingOffer.amount * (1 - stepReduction)
    );

    // Don't go above max budget
    const suggestedOffer: Money = {
      amount: Math.round(Math.min(counterAmount, maxBudget)),
      currency: incomingOffer.currency,
    };

    const savingsPercent = Math.round(
      ((incomingOffer.amount - suggestedOffer.amount) / incomingOffer.amount) * 100
    );

    let riskLevel: 'low' | 'medium' | 'high' = 'medium';
    if (suggestedOffer.amount > incomingOffer.amount * 0.95) {
      riskLevel = 'low';
    } else if (suggestedOffer.amount < incomingOffer.amount * 0.85) {
      riskLevel = 'high';
    }

    return {
      suggestedOffer,
      reasoning: `Based on your ${negotiation.strategy} strategy and round ${round + 1} of ${strategy.maxRounds}, ` +
        `this counter-offer aims to save ${savingsPercent}% from their current offer.`,
      talkingPoints: [
        `Your target price: ${formatMoney(idealPrice, incomingOffer.currency)}`,
        `Current offer: ${formatMoney(incomingOffer.amount, incomingOffer.currency)}`,
        `Suggested counter: ${formatMoney(suggestedOffer.amount, suggestedOffer.currency)}`,
        round >= strategy.maxRounds - 1
          ? 'Consider this your final offer'
          : `${strategy.maxRounds - round - 1} negotiation rounds remaining`,
      ],
      riskLevel,
      expectedOutcome: riskLevel === 'low'
        ? 'High chance of acceptance'
        : riskLevel === 'medium'
        ? 'Likely to receive counter-offer'
        : 'May result in negotiation ending',
    };
  }

  private async sendMessage(
    negotiation: Negotiation,
    party: NegotiationParty,
    draft: NegotiationDraft,
    offer?: Money
  ): Promise<void> {
    if (party.channel === 'email' && this.config.emailProvider && party.contact.email) {
      await this.config.emailProvider.sendEmail(
        party.contact.email,
        draft.subject,
        draft.body
      );
    }

    const message: NegotiationMessage = {
      id: this.generateId(),
      direction: 'outbound',
      channel: party.channel,
      content: draft.body,
      offer,
      timestamp: Date.now(),
    };

    party.responseHistory.push(message);

    this.emit(MONEY_MAKERS_EVENTS.NEGOTIATION_MESSAGE_SENT, {
      negotiationId: negotiation.id,
      partyId: party.id,
      channel: party.channel,
    });
  }

  private async rejectParty(
    negotiation: Negotiation,
    party: NegotiationParty,
    reason?: string
  ): Promise<void> {
    const draft = this.generateDefaultDraft(
      {
        negotiation,
        party,
        strategy: NEGOTIATION_STRATEGIES[negotiation.strategy],
        round: 0,
      },
      'reject'
    );

    try {
      await this.sendMessage(negotiation, party, draft);
    } catch {
      // Ignore send errors during rejection
    }

    party.status = 'closed';
    if (reason) {
      party.notes = reason;
    }
  }

  private updateBestOffer(negotiation: Negotiation): void {
    let best: { partyId: string; offer: Money } | undefined;

    for (const party of negotiation.parties) {
      if (party.currentOffer) {
        if (!best || party.currentOffer.amount < best.offer.amount) {
          best = { partyId: party.id, offer: party.currentOffer };
        }
      }
    }

    negotiation.bestOffer = best;
  }

  private scheduleFollowUp(negotiation: Negotiation, party: NegotiationParty): void {
    this.clearFollowUp(party.id);

    const followUpCount = party.responseHistory.filter(
      m => m.direction === 'outbound' && m.content.includes('follow up')
    ).length;

    if (followUpCount >= this.config.maxFollowUps) {
      return;
    }

    const timer = setTimeout(
      async () => {
        if (party.status === 'negotiating' || party.status === 'contacted') {
          const draft = await this.generateDraft(negotiation.id, party.id, 'followup');
          await this.sendMessage(negotiation, party, draft);
          this.scheduleFollowUp(negotiation, party);
        }
      },
      this.config.followUpIntervalHours * 60 * 60 * 1000
    );

    this.followUpTimers.set(party.id, timer);
  }

  private clearFollowUp(partyId: string): void {
    const timer = this.followUpTimers.get(partyId);
    if (timer) {
      clearTimeout(timer);
      this.followUpTimers.delete(partyId);
    }
  }

  private generateId(): string {
    return `neg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private emit(event: string, data: unknown): void {
    // Redact any PII before emitting
    const safeData = typeof data === 'object' && data !== null
      ? JSON.parse(redactPII(JSON.stringify(data)))
      : data;
    this.config.onEvent?.(event, safeData);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createAutoNegotiator(
  config?: Partial<AutoNegotiatorConfig>
): AutoNegotiator {
  return new AutoNegotiator(config);
}
