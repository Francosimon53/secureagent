/**
 * Cancellation Helper
 *
 * Provides guidance and assistance for cancelling subscriptions.
 */

import type { Subscription, SubscriptionCategory } from '../types.js';

/**
 * Cancellation guide
 */
export interface CancellationGuide {
  provider: string;
  category: SubscriptionCategory;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedMinutes: number;
  steps: CancellationStep[];
  cancellationUrl?: string;
  contactInfo?: {
    phone?: string;
    email?: string;
    chatUrl?: string;
  };
  warnings: string[];
  tips: string[];
  refundPolicy?: string;
}

/**
 * Cancellation step
 */
export interface CancellationStep {
  order: number;
  action: string;
  details?: string;
  url?: string;
  note?: string;
}

/**
 * Known cancellation processes
 */
const KNOWN_CANCELLATION_GUIDES: Map<string, Partial<CancellationGuide>> = new Map([
  ['netflix', {
    difficulty: 'easy',
    estimatedMinutes: 2,
    steps: [
      { order: 1, action: 'Log in to Netflix', url: 'https://netflix.com' },
      { order: 2, action: 'Click on your profile icon in the top right' },
      { order: 3, action: 'Select "Account"' },
      { order: 4, action: 'Click "Cancel Membership"' },
      { order: 5, action: 'Confirm cancellation' },
    ],
    cancellationUrl: 'https://www.netflix.com/cancelplan',
    tips: ['You can keep watching until the end of your billing period'],
    refundPolicy: 'No refunds for partial months',
  }],
  ['spotify', {
    difficulty: 'easy',
    estimatedMinutes: 3,
    steps: [
      { order: 1, action: 'Log in to Spotify', url: 'https://spotify.com' },
      { order: 2, action: 'Go to Account settings' },
      { order: 3, action: 'Scroll to "Your plan"' },
      { order: 4, action: 'Click "Change plan"' },
      { order: 5, action: 'Select "Cancel Premium"' },
      { order: 6, action: 'Follow the prompts to confirm' },
    ],
    tips: ['You\'ll revert to the free tier with ads'],
    refundPolicy: 'No refunds for partial months',
  }],
  ['adobe', {
    difficulty: 'hard',
    estimatedMinutes: 15,
    steps: [
      { order: 1, action: 'Log in to Adobe account', url: 'https://account.adobe.com' },
      { order: 2, action: 'Go to Plans' },
      { order: 3, action: 'Click "Manage plan"' },
      { order: 4, action: 'Select "Cancel plan"' },
      { order: 5, action: 'Complete the cancellation survey' },
      { order: 6, action: 'May need to chat with support to confirm' },
    ],
    contactInfo: {
      phone: '1-800-833-6687',
      chatUrl: 'https://helpx.adobe.com/contact.html',
    },
    warnings: [
      'Annual plans may have early termination fees (up to 50% of remaining subscription)',
      'You may lose access to files stored in Creative Cloud',
    ],
    tips: [
      'Consider downgrading to Photography plan instead of cancelling completely',
      'Wait until near renewal to avoid fees',
    ],
    refundPolicy: 'Pro-rated refund minus early termination fee for annual plans',
  }],
  ['amazon prime', {
    difficulty: 'medium',
    estimatedMinutes: 5,
    steps: [
      { order: 1, action: 'Go to Amazon Prime membership settings', url: 'https://www.amazon.com/gp/primecentral' },
      { order: 2, action: 'Click "Update, cancel and more"' },
      { order: 3, action: 'Select "End membership"' },
      { order: 4, action: 'Follow the prompts (Amazon will try to retain you)' },
      { order: 5, action: 'Confirm cancellation' },
    ],
    warnings: ['You\'ll lose Prime shipping, Prime Video, and other benefits'],
    tips: [
      'Check if you\'ve used Prime benefits recently to evaluate value',
      'Consider pausing instead if you might return',
    ],
    refundPolicy: 'Full refund if you haven\'t used Prime benefits, partial otherwise',
  }],
  ['gym', {
    difficulty: 'hard',
    estimatedMinutes: 30,
    steps: [
      { order: 1, action: 'Check your contract for cancellation terms' },
      { order: 2, action: 'Write a cancellation letter (may be required)' },
      { order: 3, action: 'Visit the gym in person or send certified mail' },
      { order: 4, action: 'Get confirmation in writing' },
      { order: 5, action: 'Monitor your bank for continued charges' },
    ],
    warnings: [
      'Many gyms require 30-60 days notice',
      'Some require in-person cancellation or certified mail',
      'Annual contracts may have early termination fees',
    ],
    tips: [
      'Send cancellation via certified mail with return receipt',
      'Take photos of any cancellation forms you sign',
      'Set a calendar reminder to check for continued charges',
    ],
  }],
]);

/**
 * Cancellation helper class
 */
export class CancellationHelper {
  /**
   * Get cancellation guide for a subscription
   */
  getGuide(subscription: Subscription): CancellationGuide {
    const normalizedProvider = subscription.provider.toLowerCase();

    // Check for known provider
    for (const [key, guide] of KNOWN_CANCELLATION_GUIDES) {
      if (normalizedProvider.includes(key)) {
        return {
          provider: subscription.provider,
          category: subscription.category,
          difficulty: guide.difficulty ?? 'medium',
          estimatedMinutes: guide.estimatedMinutes ?? 10,
          steps: guide.steps ?? this.generateGenericSteps(subscription),
          cancellationUrl: subscription.cancellationUrl ?? guide.cancellationUrl,
          contactInfo: guide.contactInfo,
          warnings: guide.warnings ?? [],
          tips: guide.tips ?? [],
          refundPolicy: guide.refundPolicy,
        };
      }
    }

    // Generate generic guide
    return this.generateGenericGuide(subscription);
  }

  /**
   * Generate a generic cancellation guide
   */
  private generateGenericGuide(subscription: Subscription): CancellationGuide {
    const steps = subscription.cancellationSteps
      ? subscription.cancellationSteps.map((step, i) => ({
          order: i + 1,
          action: step,
        }))
      : this.generateGenericSteps(subscription);

    return {
      provider: subscription.provider,
      category: subscription.category,
      difficulty: this.estimateDifficulty(subscription.category),
      estimatedMinutes: this.estimateTime(subscription.category),
      steps,
      cancellationUrl: subscription.cancellationUrl,
      warnings: this.getGenericWarnings(subscription),
      tips: this.getGenericTips(subscription),
    };
  }

  /**
   * Generate generic cancellation steps
   */
  private generateGenericSteps(subscription: Subscription): CancellationStep[] {
    const providerUrl = subscription.providerUrl ?? `https://${subscription.provider.toLowerCase().replace(/\s+/g, '')}.com`;

    return [
      {
        order: 1,
        action: `Log in to your ${subscription.provider} account`,
        url: providerUrl,
      },
      {
        order: 2,
        action: 'Navigate to Account Settings or Billing',
      },
      {
        order: 3,
        action: 'Look for "Cancel Subscription", "Manage Plan", or "Billing"',
      },
      {
        order: 4,
        action: 'Follow the cancellation flow',
        note: 'The provider may try to offer you discounts to stay',
      },
      {
        order: 5,
        action: 'Save or screenshot the cancellation confirmation',
      },
      {
        order: 6,
        action: 'Check your email for cancellation confirmation',
      },
    ];
  }

  /**
   * Estimate cancellation difficulty by category
   */
  private estimateDifficulty(category: SubscriptionCategory): 'easy' | 'medium' | 'hard' {
    switch (category) {
      case 'streaming':
      case 'music':
        return 'easy';
      case 'software':
      case 'cloud-storage':
      case 'productivity':
        return 'medium';
      case 'fitness':
      case 'membership':
        return 'hard';
      default:
        return 'medium';
    }
  }

  /**
   * Estimate cancellation time by category
   */
  private estimateTime(category: SubscriptionCategory): number {
    switch (category) {
      case 'streaming':
      case 'music':
        return 3;
      case 'software':
      case 'cloud-storage':
        return 10;
      case 'fitness':
      case 'membership':
        return 20;
      default:
        return 10;
    }
  }

  /**
   * Get generic warnings for subscription cancellation
   */
  private getGenericWarnings(subscription: Subscription): string[] {
    const warnings: string[] = [];

    if (subscription.frequency === 'annually') {
      warnings.push('Annual subscriptions may have early termination fees');
    }

    if (subscription.trialEndsAt && subscription.trialEndsAt > Date.now()) {
      warnings.push('You are currently on a free trial - cancel before it ends to avoid charges');
    }

    switch (subscription.category) {
      case 'cloud-storage':
        warnings.push('Make sure to backup any files stored in the service before cancelling');
        break;
      case 'software':
        warnings.push('Check if you have any files that require this software to open');
        break;
      case 'fitness':
        warnings.push('Check your contract for cancellation notice requirements');
        break;
    }

    return warnings;
  }

  /**
   * Get generic tips for subscription cancellation
   */
  private getGenericTips(subscription: Subscription): string[] {
    const tips: string[] = [];

    tips.push('Check if you can pause instead of cancel if you might return');

    if (subscription.frequency === 'annually') {
      tips.push('Consider waiting until closer to renewal to avoid losing paid time');
    }

    tips.push('Document your cancellation with screenshots or confirmation emails');

    if (subscription.amount > 50) {
      tips.push('Consider contacting support to negotiate a lower rate instead of cancelling');
    }

    return tips;
  }

  /**
   * Generate a cancellation letter/email
   */
  generateCancellationLetter(subscription: Subscription, options?: {
    accountId?: string;
    reason?: string;
    effectiveDate?: string;
  }): string {
    const effectiveDate = options?.effectiveDate ?? 'immediately';

    return `
To Whom It May Concern,

I am writing to request the cancellation of my ${subscription.name} subscription${options?.accountId ? ` (Account: ${options.accountId})` : ''}.

Please cancel my subscription ${effectiveDate === 'immediately' ? 'effective immediately' : `effective ${effectiveDate}`}.

${options?.reason ? `Reason for cancellation: ${options.reason}` : ''}

Please send written confirmation of this cancellation to my email address on file. I also request that no further charges be made to my payment method.

Thank you for your attention to this matter.

Sincerely,
[Your Name]
[Your Email]
[Date]
    `.trim();
  }

  /**
   * Get cancellation checklist
   */
  getCancellationChecklist(subscription: Subscription): Array<{
    task: string;
    completed: boolean;
    priority: 'high' | 'medium' | 'low';
  }> {
    const checklist: Array<{
      task: string;
      completed: boolean;
      priority: 'high' | 'medium' | 'low';
    }> = [
      {
        task: 'Review subscription terms and cancellation policy',
        completed: false,
        priority: 'high',
      },
      {
        task: 'Check for any prepaid period or unused time',
        completed: false,
        priority: 'high',
      },
    ];

    if (subscription.category === 'cloud-storage') {
      checklist.push({
        task: 'Download/backup all stored files',
        completed: false,
        priority: 'high',
      });
    }

    checklist.push(
      {
        task: 'Note any early termination fees',
        completed: false,
        priority: 'medium',
      },
      {
        task: 'Initiate cancellation process',
        completed: false,
        priority: 'high',
      },
      {
        task: 'Save cancellation confirmation',
        completed: false,
        priority: 'high',
      },
      {
        task: 'Set reminder to verify no more charges',
        completed: false,
        priority: 'medium',
      },
      {
        task: 'Remove payment method if possible',
        completed: false,
        priority: 'low',
      }
    );

    return checklist;
  }

  /**
   * Calculate potential refund
   */
  calculatePotentialRefund(subscription: Subscription): {
    eligibleForRefund: boolean;
    estimatedAmount: number;
    notes: string[];
  } {
    const notes: string[] = [];
    let eligibleForRefund = false;
    let estimatedAmount = 0;

    if (!subscription.nextBillingDate) {
      return { eligibleForRefund: false, estimatedAmount: 0, notes: ['Unable to calculate - no billing date'] };
    }

    const now = Date.now();
    const msRemaining = subscription.nextBillingDate - now;
    const daysRemaining = Math.floor(msRemaining / (24 * 60 * 60 * 1000));

    if (subscription.frequency === 'annually') {
      if (daysRemaining > 300) {
        eligibleForRefund = true;
        // Pro-rated refund minus typical 50% early termination fee
        estimatedAmount = (subscription.amount * (daysRemaining / 365)) * 0.5;
        notes.push('Annual plan - may be subject to early termination fee');
      } else {
        notes.push('Less than 2 months remaining - refund unlikely');
      }
    } else if (subscription.frequency === 'monthly') {
      if (daysRemaining > 25) {
        eligibleForRefund = true;
        estimatedAmount = subscription.amount;
        notes.push('Recently billed - may be eligible for full month refund');
      } else {
        notes.push('Monthly subscriptions typically don\'t offer partial refunds');
      }
    }

    return {
      eligibleForRefund,
      estimatedAmount: Math.round(estimatedAmount * 100) / 100,
      notes,
    };
  }
}
