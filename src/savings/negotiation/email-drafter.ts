/**
 * Email Drafter
 *
 * Generates negotiation emails with various tones and strategies.
 */

import type {
  NegotiationSession,
  NegotiationEmail,
  CounterOffer,
  VendorInfo,
} from '../types.js';

/**
 * Email template type
 */
export type EmailTemplate =
  | 'initial-request'
  | 'counter-offer'
  | 'competitor-match'
  | 'loyalty-appeal'
  | 'cancellation-threat'
  | 'follow-up'
  | 'acceptance'
  | 'rejection';

/**
 * Email tone
 */
export type EmailTone = 'formal' | 'friendly' | 'assertive' | 'urgent';

/**
 * Email draft options
 */
export interface EmailDraftOptions {
  template: EmailTemplate;
  tone: EmailTone;
  includeCompetitorData?: boolean;
  includeLoyaltyHistory?: boolean;
  customPoints?: string[];
}

/**
 * Generated email draft
 */
export interface EmailDraft {
  subject: string;
  body: string;
  tone: EmailTone;
  template: EmailTemplate;
  placeholders: string[];
  suggestedAttachments?: string[];
}

/**
 * Email drafter class
 */
export class EmailDrafter {
  /**
   * Draft an email for a negotiation session
   */
  draft(session: NegotiationSession, options: EmailDraftOptions): EmailDraft {
    switch (options.template) {
      case 'initial-request':
        return this.draftInitialRequest(session, options);
      case 'counter-offer':
        return this.draftCounterOffer(session, options);
      case 'competitor-match':
        return this.draftCompetitorMatch(session, options);
      case 'loyalty-appeal':
        return this.draftLoyaltyAppeal(session, options);
      case 'cancellation-threat':
        return this.draftCancellationThreat(session, options);
      case 'follow-up':
        return this.draftFollowUp(session, options);
      case 'acceptance':
        return this.draftAcceptance(session, options);
      case 'rejection':
        return this.draftRejection(session, options);
      default:
        return this.draftInitialRequest(session, options);
    }
  }

  /**
   * Generate subject line
   */
  generateSubject(
    template: EmailTemplate,
    vendor: VendorInfo,
    accountNumber?: string
  ): string {
    const accountRef = accountNumber ? ` - Account ${accountNumber}` : '';

    switch (template) {
      case 'initial-request':
        return `Rate Review Request${accountRef}`;
      case 'counter-offer':
        return `Re: Rate Negotiation${accountRef}`;
      case 'competitor-match':
        return `Price Match Request${accountRef}`;
      case 'loyalty-appeal':
        return `Loyal Customer Rate Review${accountRef}`;
      case 'cancellation-threat':
        return `Service Cancellation Consideration${accountRef}`;
      case 'follow-up':
        return `Following Up on Rate Review Request${accountRef}`;
      case 'acceptance':
        return `Accepting Your Offer${accountRef}`;
      case 'rejection':
        return `Unable to Accept Current Terms${accountRef}`;
      default:
        return `Account Inquiry${accountRef}`;
    }
  }

  /**
   * Apply tone adjustments to text
   */
  applyTone(text: string, tone: EmailTone): string {
    switch (tone) {
      case 'formal':
        return text;
      case 'friendly':
        return text
          .replace(/I am writing/g, "I'm writing")
          .replace(/I would/g, "I'd")
          .replace(/cannot/g, "can't")
          .replace(/will not/g, "won't");
      case 'assertive':
        return text
          .replace(/I would like/g, 'I need')
          .replace(/Could you/g, 'Please')
          .replace(/I was hoping/g, 'I expect');
      case 'urgent':
        return text
          .replace(/when you have a chance/gi, 'as soon as possible')
          .replace(/at your convenience/gi, 'immediately')
          .replace(/I would appreciate/g, 'I urgently need');
      default:
        return text;
    }
  }

  /**
   * Create NegotiationEmail from draft
   */
  createEmail(
    draft: EmailDraft,
    session: NegotiationSession,
    direction: 'outbound' | 'inbound' = 'outbound'
  ): Omit<NegotiationEmail, 'id'> {
    return {
      direction,
      subject: draft.subject,
      body: draft.body,
      sentAt: Date.now(),
      status: 'draft',
    };
  }

  // Private drafting methods

  private draftInitialRequest(
    session: NegotiationSession,
    options: EmailDraftOptions
  ): EmailDraft {
    const yearCount = session.vendor.customerSince
      ? Math.floor((Date.now() - session.vendor.customerSince) / (365 * 24 * 60 * 60 * 1000))
      : null;

    let body = `Dear ${session.vendor.name} Customer Service,

I am writing to request a review of my current rate of $${session.currentAmount.toFixed(2)} per month.

`;

    if (yearCount && yearCount > 0 && options.includeLoyaltyHistory) {
      body += `I have been a loyal customer for ${yearCount} years and have always maintained a good payment history. `;
    }

    body += `Due to my current budget constraints, I am hoping to negotiate a lower rate.

I would like to request a reduction to $${session.targetAmount.toFixed(2)} per month, which would be more in line with my budget.

`;

    if (options.customPoints && options.customPoints.length > 0) {
      body += 'Additional points for consideration:\n';
      for (const point of options.customPoints) {
        body += `- ${point}\n`;
      }
      body += '\n';
    }

    body += `I value our business relationship and would prefer to continue as a customer. Please let me know what options are available.

Thank you for your time and consideration.

Best regards,
[YOUR NAME]
[YOUR PHONE NUMBER]
[YOUR ACCOUNT NUMBER]`;

    return {
      subject: this.generateSubject('initial-request', session.vendor),
      body: this.applyTone(body, options.tone),
      tone: options.tone,
      template: 'initial-request',
      placeholders: ['[YOUR NAME]', '[YOUR PHONE NUMBER]', '[YOUR ACCOUNT NUMBER]'],
    };
  }

  private draftCounterOffer(
    session: NegotiationSession,
    options: EmailDraftOptions
  ): EmailDraft {
    const latestOffer = session.counterOffers[session.counterOffers.length - 1];
    const offerAmount = latestOffer?.amount ?? session.targetAmount;

    const body = `Dear ${session.vendor.name} Customer Service,

Thank you for your response regarding my rate review request.

While I appreciate the consideration, I was hoping for a rate closer to $${offerAmount.toFixed(2)} per month. This amount would work better with my current budget.

${latestOffer?.justification ?? 'I believe this is a fair request based on market conditions and my history as a customer.'}

Would you be able to accommodate this rate? I am ready to commit to staying with your service if we can reach an agreement.

Thank you for your continued assistance.

Best regards,
[YOUR NAME]
[YOUR ACCOUNT NUMBER]`;

    return {
      subject: this.generateSubject('counter-offer', session.vendor),
      body: this.applyTone(body, options.tone),
      tone: options.tone,
      template: 'counter-offer',
      placeholders: ['[YOUR NAME]', '[YOUR ACCOUNT NUMBER]'],
    };
  }

  private draftCompetitorMatch(
    session: NegotiationSession,
    options: EmailDraftOptions
  ): EmailDraft {
    const latestOffer = session.counterOffers.find(o => o.strategy === 'competitor-match');
    const competitorName = latestOffer?.metadata?.competitor ?? '[COMPETITOR NAME]';
    const competitorPrice = latestOffer?.amount ?? session.targetAmount;

    const body = `Dear ${session.vendor.name} Customer Service,

I am writing to request a price match for my current service.

I have received an offer from ${competitorName} for a comparable service at $${competitorPrice.toFixed(2)} per month. This is significantly lower than my current rate of $${session.currentAmount.toFixed(2)}.

I would prefer to stay with ${session.vendor.name} as I have been satisfied with the service. However, the price difference is significant and I cannot justify paying a premium.

Would you be able to match or come close to the competitor's price of $${competitorPrice.toFixed(2)}?

I am ready to commit to continuing my service if we can reach an agreement on pricing.

Thank you for your consideration.

Best regards,
[YOUR NAME]
[YOUR ACCOUNT NUMBER]`;

    return {
      subject: this.generateSubject('competitor-match', session.vendor),
      body: this.applyTone(body, options.tone),
      tone: options.tone,
      template: 'competitor-match',
      placeholders: ['[YOUR NAME]', '[YOUR ACCOUNT NUMBER]', '[COMPETITOR NAME]'],
      suggestedAttachments: ['Competitor quote or screenshot'],
    };
  }

  private draftLoyaltyAppeal(
    session: NegotiationSession,
    options: EmailDraftOptions
  ): EmailDraft {
    const yearCount = session.vendor.customerSince
      ? Math.floor((Date.now() - session.vendor.customerSince) / (365 * 24 * 60 * 60 * 1000))
      : '[NUMBER OF YEARS]';

    const body = `Dear ${session.vendor.name} Customer Service,

I am reaching out as a loyal customer of ${yearCount} years to request a loyalty rate review.

During my time as a customer, I have:
- Maintained consistent and on-time payments
- Recommended your services to friends and family
- Remained a subscriber through various price increases

My current rate is $${session.currentAmount.toFixed(2)} per month. I have noticed that new customers are being offered promotional rates significantly lower than what I am paying.

I believe that long-standing customers like myself deserve recognition for our loyalty. I would like to request a rate of $${session.targetAmount.toFixed(2)} per month, which I feel is fair given my history with your company.

I truly value our relationship and hope we can reach an agreement that allows me to continue as a satisfied customer.

Thank you for your consideration.

Sincerely,
[YOUR NAME]
[YOUR ACCOUNT NUMBER]
Customer since [START DATE]`;

    return {
      subject: this.generateSubject('loyalty-appeal', session.vendor),
      body: this.applyTone(body, options.tone),
      tone: options.tone,
      template: 'loyalty-appeal',
      placeholders: ['[YOUR NAME]', '[YOUR ACCOUNT NUMBER]', '[START DATE]', '[NUMBER OF YEARS]'],
    };
  }

  private draftCancellationThreat(
    session: NegotiationSession,
    options: EmailDraftOptions
  ): EmailDraft {
    const body = `Dear ${session.vendor.name} Customer Service,

I am writing to discuss my options regarding my current subscription.

After reviewing my budget and comparing prices in the market, I am seriously considering cancelling my service with ${session.vendor.name}. My current rate of $${session.currentAmount.toFixed(2)} per month is no longer sustainable for me.

Before I proceed with cancellation, I wanted to reach out to see if there are any retention offers or discounts available that would allow me to continue as a customer.

I would need a rate of $${session.targetAmount.toFixed(2)} per month or lower to justify staying with your service.

If this is not possible, please let me know the process for cancelling my account.

Thank you for your prompt attention to this matter.

Regards,
[YOUR NAME]
[YOUR ACCOUNT NUMBER]`;

    return {
      subject: this.generateSubject('cancellation-threat', session.vendor),
      body: this.applyTone(body, options.tone),
      tone: options.tone,
      template: 'cancellation-threat',
      placeholders: ['[YOUR NAME]', '[YOUR ACCOUNT NUMBER]'],
    };
  }

  private draftFollowUp(
    session: NegotiationSession,
    options: EmailDraftOptions
  ): EmailDraft {
    const lastEmail = session.emails[session.emails.length - 1];
    const daysSince = lastEmail
      ? Math.floor((Date.now() - (lastEmail.sentAt ?? 0)) / (24 * 60 * 60 * 1000))
      : 7;

    const body = `Dear ${session.vendor.name} Customer Service,

I am following up on my previous request regarding a rate review, sent approximately ${daysSince} days ago.

As a reminder, I requested a reduction from my current rate of $${session.currentAmount.toFixed(2)} to $${session.targetAmount.toFixed(2)} per month.

I would appreciate an update on the status of my request. I am still very much interested in continuing as a customer if we can reach an agreement on pricing.

Please let me know if you need any additional information from me.

Thank you,
[YOUR NAME]
[YOUR ACCOUNT NUMBER]`;

    return {
      subject: this.generateSubject('follow-up', session.vendor),
      body: this.applyTone(body, options.tone),
      tone: options.tone,
      template: 'follow-up',
      placeholders: ['[YOUR NAME]', '[YOUR ACCOUNT NUMBER]'],
    };
  }

  private draftAcceptance(
    session: NegotiationSession,
    options: EmailDraftOptions
  ): EmailDraft {
    const acceptedAmount = session.counterOffers[session.counterOffers.length - 1]?.amount
      ?? session.targetAmount;

    const body = `Dear ${session.vendor.name} Customer Service,

Thank you for your offer to adjust my rate.

I am pleased to accept the new rate of $${acceptedAmount.toFixed(2)} per month. I appreciate your willingness to work with me on this matter.

Please confirm when this new rate will take effect and provide any documentation or confirmation number for my records.

I look forward to continuing as a satisfied customer.

Best regards,
[YOUR NAME]
[YOUR ACCOUNT NUMBER]`;

    return {
      subject: this.generateSubject('acceptance', session.vendor),
      body: this.applyTone(body, options.tone),
      tone: options.tone,
      template: 'acceptance',
      placeholders: ['[YOUR NAME]', '[YOUR ACCOUNT NUMBER]'],
    };
  }

  private draftRejection(
    session: NegotiationSession,
    options: EmailDraftOptions
  ): EmailDraft {
    const body = `Dear ${session.vendor.name} Customer Service,

Thank you for your response regarding my rate review request.

Unfortunately, I am unable to accept the terms offered. The rate of $${session.currentAmount.toFixed(2)} per month remains outside of my budget constraints.

Given this, I will need to proceed with cancellation of my service. Please provide information on how to close my account and any final billing details.

Thank you for your time and for the service you have provided during my time as a customer.

Regards,
[YOUR NAME]
[YOUR ACCOUNT NUMBER]`;

    return {
      subject: this.generateSubject('rejection', session.vendor),
      body: this.applyTone(body, options.tone),
      tone: options.tone,
      template: 'rejection',
      placeholders: ['[YOUR NAME]', '[YOUR ACCOUNT NUMBER]'],
    };
  }

  /**
   * Get available templates for a session state
   */
  getAvailableTemplates(session: NegotiationSession): EmailTemplate[] {
    const templates: EmailTemplate[] = [];

    switch (session.status) {
      case 'draft':
        templates.push('initial-request', 'competitor-match', 'loyalty-appeal');
        break;
      case 'sent':
      case 'pending':
        templates.push('follow-up');
        break;
      case 'negotiating':
        templates.push('counter-offer', 'cancellation-threat', 'acceptance', 'rejection');
        break;
      case 'accepted':
        templates.push('acceptance');
        break;
      case 'rejected':
        templates.push('rejection', 'cancellation-threat');
        break;
    }

    return templates;
  }

  /**
   * Suggest the best template based on session state
   */
  suggestTemplate(session: NegotiationSession): {
    template: EmailTemplate;
    reason: string;
  } {
    const hasCompetitorData = session.counterOffers.some(o => o.strategy === 'competitor-match');
    const yearCount = session.vendor.customerSince
      ? Math.floor((Date.now() - session.vendor.customerSince) / (365 * 24 * 60 * 60 * 1000))
      : 0;

    if (session.status === 'draft') {
      if (hasCompetitorData) {
        return {
          template: 'competitor-match',
          reason: 'You have competitor pricing data which typically has the highest success rate',
        };
      }
      if (yearCount >= 2) {
        return {
          template: 'loyalty-appeal',
          reason: `Your ${yearCount} years as a customer gives you leverage for a loyalty discount`,
        };
      }
      return {
        template: 'initial-request',
        reason: 'Start with a polite general request to gauge their flexibility',
      };
    }

    if (session.status === 'sent' || session.status === 'pending') {
      return {
        template: 'follow-up',
        reason: 'Following up shows you are serious about the negotiation',
      };
    }

    if (session.status === 'negotiating') {
      if (session.counterOffers.length >= 2) {
        return {
          template: 'cancellation-threat',
          reason: 'Multiple rounds of negotiation suggest you may need to escalate',
        };
      }
      return {
        template: 'counter-offer',
        reason: 'Continue the negotiation with a counter-proposal',
      };
    }

    return {
      template: 'initial-request',
      reason: 'Default template for starting negotiations',
    };
  }
}
