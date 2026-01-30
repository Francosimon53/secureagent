/**
 * Subscription Manager
 *
 * Find and kill unwanted subscriptions with ROI analysis
 */

import type {
  Subscription,
  SubscriptionCategory,
  SubscriptionPriority,
  SubscriptionDetection,
  SubscriptionROI,
  CancellationAssistance,
  SubscriptionReport,
  BillFrequency,
  Money,
} from './types.js';
import {
  MONEY_MAKERS_EVENTS,
  SUBSCRIPTION_PATTERNS,
  CANCELLATION_DIFFICULTY,
  BILL_FREQUENCY_DAYS,
  detectSubscription,
  formatMoney,
} from './constants.js';

// =============================================================================
// Subscription Manager Config
// =============================================================================

export interface SubscriptionManagerConfig {
  /** Unused subscription threshold in days */
  unusedThresholdDays: number;
  /** ROI threshold for cancellation recommendation */
  cancelRecommendThreshold: number;
  /** Enable aggressive "just cancel" mode */
  aggressiveCancelMode: boolean;
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: SubscriptionManagerConfig = {
  unusedThresholdDays: 30,
  cancelRecommendThreshold: 30,
  aggressiveCancelMode: false,
};

// =============================================================================
// Subscription Manager
// =============================================================================

export class SubscriptionManager {
  private readonly config: SubscriptionManagerConfig;
  private subscriptions = new Map<string, Subscription>();

  constructor(config?: Partial<SubscriptionManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Subscription Management
  // ==========================================================================

  /**
   * Add a subscription manually
   */
  addSubscription(params: {
    userId: string;
    name: string;
    provider: string;
    amount: Money;
    frequency: BillFrequency;
    category?: SubscriptionCategory;
    priority?: SubscriptionPriority;
    startDate?: number;
    nextBillingDate?: number;
    cancellationUrl?: string;
    cancellationPhone?: string;
    cancellationInstructions?: string;
    usageFrequency?: Subscription['usageFrequency'];
    notes?: string;
  }): Subscription {
    const id = this.generateId();
    const now = Date.now();

    // Auto-detect category if not provided
    let category = params.category;
    if (!category) {
      const detected = detectSubscription(params.name) ?? detectSubscription(params.provider);
      category = detected?.category ?? 'other';
    }

    const subscription: Subscription = {
      id,
      userId: params.userId,
      name: params.name,
      provider: params.provider,
      amount: params.amount,
      frequency: params.frequency,
      category,
      priority: params.priority ?? 'unknown',
      startDate: params.startDate ?? now,
      nextBillingDate: params.nextBillingDate ?? this.calculateNextBilling(now, params.frequency),
      cancellationUrl: params.cancellationUrl,
      cancellationPhone: params.cancellationPhone,
      cancellationInstructions: params.cancellationInstructions,
      usageFrequency: params.usageFrequency,
      notes: params.notes,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.subscriptions.set(id, subscription);

    this.emit(MONEY_MAKERS_EVENTS.SUBSCRIPTION_ADDED, {
      subscriptionId: id,
      name: subscription.name,
      monthlyAmount: this.toMonthlyAmount(subscription.amount.amount, subscription.frequency),
    });

    return subscription;
  }

  /**
   * Get subscription by ID
   */
  getSubscription(subscriptionId: string): Subscription {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }
    return sub;
  }

  /**
   * Update subscription
   */
  updateSubscription(
    subscriptionId: string,
    updates: Partial<Pick<
      Subscription,
      'name' | 'amount' | 'frequency' | 'category' | 'priority' |
      'cancellationUrl' | 'cancellationPhone' | 'cancellationInstructions' |
      'usageFrequency' | 'lastUsed' | 'notes'
    >>
  ): Subscription {
    const sub = this.getSubscription(subscriptionId);

    Object.assign(sub, updates);
    sub.updatedAt = Date.now();

    // Auto-update priority based on usage
    if (updates.usageFrequency !== undefined || updates.lastUsed !== undefined) {
      this.updatePriority(sub);
    }

    return sub;
  }

  /**
   * Record subscription usage
   */
  recordUsage(subscriptionId: string): void {
    const sub = this.getSubscription(subscriptionId);
    sub.lastUsed = Date.now();
    sub.updatedAt = Date.now();
    this.updatePriority(sub);
  }

  /**
   * Get user's subscriptions
   */
  getUserSubscriptions(
    userId: string,
    options?: {
      category?: SubscriptionCategory;
      priority?: SubscriptionPriority;
      activeOnly?: boolean;
    }
  ): Subscription[] {
    let subs = Array.from(this.subscriptions.values()).filter(s => s.userId === userId);

    if (options?.category) {
      subs = subs.filter(s => s.category === options.category);
    }

    if (options?.priority) {
      subs = subs.filter(s => s.priority === options.priority);
    }

    if (options?.activeOnly) {
      subs = subs.filter(s => s.isActive);
    }

    return subs.sort((a, b) => {
      const aMonthly = this.toMonthlyAmount(a.amount.amount, a.frequency);
      const bMonthly = this.toMonthlyAmount(b.amount.amount, b.frequency);
      return bMonthly - aMonthly;
    });
  }

  // ==========================================================================
  // Subscription Detection
  // ==========================================================================

  /**
   * Detect subscriptions from bank transactions
   */
  detectFromTransactions(
    userId: string,
    transactions: Array<{
      merchant: string;
      amount: number;
      date: number;
      currency?: Money['currency'];
    }>
  ): SubscriptionDetection[] {
    const detections: SubscriptionDetection[] = [];
    const merchantGroups = new Map<string, Array<{ amount: number; date: number }>>();

    // Group transactions by merchant
    for (const tx of transactions) {
      const key = tx.merchant.toLowerCase();
      const group = merchantGroups.get(key) ?? [];
      group.push({ amount: tx.amount, date: tx.date });
      merchantGroups.set(key, group);
    }

    // Analyze each merchant for recurring patterns
    for (const [merchant, txs] of merchantGroups.entries()) {
      if (txs.length < 2) continue;

      // Sort by date
      txs.sort((a, b) => a.date - b.date);

      // Check for recurring pattern
      const amounts = txs.map(t => t.amount);
      const uniqueAmounts = [...new Set(amounts)];

      // Skip if amounts vary too much
      if (uniqueAmounts.length > 2) continue;

      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;

      // Calculate intervals between charges
      const intervals: number[] = [];
      for (let i = 1; i < txs.length; i++) {
        intervals.push(txs[i].date - txs[i - 1].date);
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const avgIntervalDays = avgInterval / (24 * 60 * 60 * 1000);

      // Determine frequency
      let frequency: BillFrequency = 'monthly';
      if (avgIntervalDays >= 25 && avgIntervalDays <= 35) {
        frequency = 'monthly';
      } else if (avgIntervalDays >= 6 && avgIntervalDays <= 8) {
        frequency = 'weekly';
      } else if (avgIntervalDays >= 85 && avgIntervalDays <= 95) {
        frequency = 'quarterly';
      } else if (avgIntervalDays >= 355 && avgIntervalDays <= 375) {
        frequency = 'annual';
      } else {
        continue; // Not a clear pattern
      }

      // Check if already tracked
      const existing = Array.from(this.subscriptions.values()).find(
        s => s.userId === userId && s.provider.toLowerCase().includes(merchant)
      );

      if (existing) continue;

      // Detect category
      const detected = detectSubscription(merchant);
      const currency = transactions[0]?.currency ?? 'USD';

      const detection: SubscriptionDetection = {
        merchantName: merchant,
        amount: { amount: Math.round(avgAmount * 100) / 100, currency },
        frequency,
        lastCharge: txs[txs.length - 1].date,
        chargeCount: txs.length,
        confidence: this.calculateDetectionConfidence(txs, avgInterval),
        suggestedCategory: detected?.category ?? 'other',
      };

      detections.push(detection);

      this.emit(MONEY_MAKERS_EVENTS.SUBSCRIPTION_DETECTED, {
        merchantName: detection.merchantName,
        amount: detection.amount,
        confidence: detection.confidence,
      });
    }

    return detections.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Confirm a detected subscription
   */
  confirmDetection(
    userId: string,
    detection: SubscriptionDetection,
    overrides?: Partial<Pick<Subscription, 'name' | 'category' | 'priority'>>
  ): Subscription {
    return this.addSubscription({
      userId,
      name: overrides?.name ?? detection.merchantName,
      provider: detection.merchantName,
      amount: detection.amount,
      frequency: detection.frequency,
      category: overrides?.category ?? detection.suggestedCategory,
      priority: overrides?.priority,
      nextBillingDate: this.calculateNextBilling(detection.lastCharge, detection.frequency),
    });
  }

  // ==========================================================================
  // ROI Analysis
  // ==========================================================================

  /**
   * Calculate ROI for a subscription
   */
  calculateROI(subscriptionId: string): SubscriptionROI {
    const sub = this.getSubscription(subscriptionId);
    const monthlyAmount = this.toMonthlyAmount(sub.amount.amount, sub.frequency);
    const yearlyAmount = monthlyAmount * 12;

    // Calculate usage score (0-100)
    let usageScore = 50;
    if (sub.usageFrequency) {
      const usageScores: Record<NonNullable<Subscription['usageFrequency']>, number> = {
        daily: 100,
        weekly: 80,
        monthly: 50,
        rarely: 20,
        never: 0,
      };
      usageScore = usageScores[sub.usageFrequency];
    }

    // Check last used
    if (sub.lastUsed) {
      const daysSinceUsed = Math.floor((Date.now() - sub.lastUsed) / (24 * 60 * 60 * 1000));
      if (daysSinceUsed > this.config.unusedThresholdDays) {
        usageScore = Math.min(usageScore, 20);
      }
    }

    // Calculate value score based on priority
    const priorityScores: Record<SubscriptionPriority, number> = {
      essential: 100,
      useful: 70,
      optional: 40,
      unused: 10,
      unknown: 50,
    };
    const valueScore = priorityScores[sub.priority];

    // Determine recommendation
    const combinedScore = (usageScore + valueScore) / 2;
    let recommendation: 'keep' | 'review' | 'cancel';
    let reasoning: string;
    let potentialSavings: Money | undefined;

    if (combinedScore >= 70) {
      recommendation = 'keep';
      reasoning = 'High usage and value - worth keeping';
    } else if (combinedScore >= this.config.cancelRecommendThreshold) {
      recommendation = 'review';
      reasoning = 'Moderate usage - consider if you still need this';
    } else {
      recommendation = 'cancel';
      reasoning = 'Low usage or value - canceling would save money';
      potentialSavings = { amount: Math.round(yearlyAmount), currency: sub.amount.currency };
    }

    // Aggressive mode overrides
    if (this.config.aggressiveCancelMode && sub.priority === 'unused') {
      recommendation = 'cancel';
      reasoning = 'AGGRESSIVE MODE: Unused subscription - cancel immediately!';
      potentialSavings = { amount: Math.round(yearlyAmount), currency: sub.amount.currency };
    }

    return {
      subscriptionId,
      monthlyAmount: { amount: Math.round(monthlyAmount), currency: sub.amount.currency },
      yearlyAmount: { amount: Math.round(yearlyAmount), currency: sub.amount.currency },
      usageScore,
      valueScore,
      recommendation,
      reasoning,
      potentialSavings,
    };
  }

  /**
   * Get all subscriptions with ROI analysis
   */
  analyzeAllSubscriptions(userId: string): SubscriptionROI[] {
    const subs = this.getUserSubscriptions(userId, { activeOnly: true });
    return subs.map(sub => this.calculateROI(sub.id));
  }

  /**
   * Get cancellation candidates
   */
  getCancellationCandidates(userId: string): Array<{ subscription: Subscription; roi: SubscriptionROI }> {
    const analyses = this.analyzeAllSubscriptions(userId);
    return analyses
      .filter(roi => roi.recommendation === 'cancel')
      .map(roi => ({
        subscription: this.getSubscription(roi.subscriptionId),
        roi,
      }))
      .sort((a, b) => (b.roi.potentialSavings?.amount ?? 0) - (a.roi.potentialSavings?.amount ?? 0));
  }

  // ==========================================================================
  // Cancellation Assistance
  // ==========================================================================

  /**
   * Get cancellation assistance
   */
  getCancellationAssistance(subscriptionId: string): CancellationAssistance {
    const sub = this.getSubscription(subscriptionId);
    const difficulty = CANCELLATION_DIFFICULTY[sub.name] ?? 'medium';

    const steps: string[] = [];
    let phoneScript: string | undefined;
    let emailTemplate: string | undefined;
    let retentionOfferTips: string[] = [];
    let estimatedTime = '5-10 minutes';

    // Build cancellation steps
    if (sub.cancellationUrl) {
      steps.push(`Go to: ${sub.cancellationUrl}`);
      steps.push('Log in to your account');
      steps.push('Navigate to subscription/membership settings');
      steps.push('Select cancel subscription');
      steps.push('Complete any exit survey');
    } else if (sub.cancellationPhone) {
      steps.push(`Call: ${sub.cancellationPhone}`);
      steps.push('Navigate phone tree to "Cancel subscription"');
      steps.push('Speak with a representative');
      steps.push('Confirm cancellation and get confirmation number');
      estimatedTime = '15-30 minutes';

      phoneScript = this.generatePhoneScript(sub);
    } else {
      steps.push('Check your account settings for cancellation options');
      steps.push('Look for "Manage subscription" or "Billing" section');
      if (sub.cancellationInstructions) {
        steps.push(sub.cancellationInstructions);
      }
    }

    // Email template
    emailTemplate = this.generateCancellationEmail(sub);

    // Retention offer tips
    if (difficulty === 'hard') {
      retentionOfferTips = [
        'They may offer a discounted rate - decline unless it\'s significant',
        'They may offer a free month - this just delays the charge',
        'They may ask why you\'re leaving - be firm but polite',
        'If transferred multiple times, ask for a supervisor',
        'Note the name of everyone you speak with',
      ];
      estimatedTime = '20-45 minutes';
    }

    return {
      subscriptionId,
      steps,
      phoneScript,
      emailTemplate,
      retentionOfferTips: retentionOfferTips.length > 0 ? retentionOfferTips : undefined,
      expectedDifficulty: difficulty,
      estimatedTime,
    };
  }

  /**
   * Mark subscription as cancelled
   */
  cancelSubscription(subscriptionId: string, cancelledDate?: number): void {
    const sub = this.getSubscription(subscriptionId);
    sub.isActive = false;
    sub.updatedAt = cancelledDate ?? Date.now();

    this.emit(MONEY_MAKERS_EVENTS.SUBSCRIPTION_CANCELLED, {
      subscriptionId,
      name: sub.name,
      monthlySavings: this.toMonthlyAmount(sub.amount.amount, sub.frequency),
    });
  }

  // ==========================================================================
  // Reporting
  // ==========================================================================

  /**
   * Generate subscription report
   */
  generateReport(userId: string): SubscriptionReport {
    const subs = this.getUserSubscriptions(userId, { activeOnly: true });
    const now = Date.now();

    let totalMonthly = 0;
    let currency: Money['currency'] = 'USD';

    const byCategory: Record<SubscriptionCategory, { count: number; monthly: Money }> = {} as any;
    const byPriority: Record<SubscriptionPriority, { count: number; monthly: Money }> = {} as any;

    for (const sub of subs) {
      const monthly = this.toMonthlyAmount(sub.amount.amount, sub.frequency);
      totalMonthly += monthly;
      currency = sub.amount.currency;

      // By category
      if (!byCategory[sub.category]) {
        byCategory[sub.category] = { count: 0, monthly: { amount: 0, currency } };
      }
      byCategory[sub.category].count++;
      byCategory[sub.category].monthly.amount += monthly;

      // By priority
      if (!byPriority[sub.priority]) {
        byPriority[sub.priority] = { count: 0, monthly: { amount: 0, currency } };
      }
      byPriority[sub.priority].count++;
      byPriority[sub.priority].monthly.amount += monthly;
    }

    const recommendations = this.analyzeAllSubscriptions(userId);
    const potentialMonthlySavings = recommendations
      .filter(r => r.recommendation === 'cancel')
      .reduce((sum, r) => sum + (r.monthlyAmount.amount), 0);

    this.emit(MONEY_MAKERS_EVENTS.SUBSCRIPTION_REPORT_GENERATED, {
      userId,
      totalMonthly,
      potentialSavings: potentialMonthlySavings,
    });

    if (potentialMonthlySavings > 0) {
      this.emit(MONEY_MAKERS_EVENTS.SAVINGS_OPPORTUNITY, {
        userId,
        potentialMonthlySavings,
        potentialYearlySavings: potentialMonthlySavings * 12,
      });
    }

    return {
      userId,
      generatedAt: now,
      totalMonthly: { amount: Math.round(totalMonthly), currency },
      totalYearly: { amount: Math.round(totalMonthly * 12), currency },
      subscriptionCount: subs.length,
      byCategory,
      byPriority,
      recommendations,
      potentialMonthlySavings: { amount: Math.round(potentialMonthlySavings), currency },
      potentialYearlySavings: { amount: Math.round(potentialMonthlySavings * 12), currency },
    };
  }

  // ==========================================================================
  // "Just Fucking Cancel" Mode
  // ==========================================================================

  /**
   * Enable aggressive cancellation mode
   */
  enableAggressiveMode(): void {
    this.config.aggressiveCancelMode = true;
  }

  /**
   * Get all subscriptions that should be cancelled immediately
   */
  getJustCancelList(userId: string): Array<{
    subscription: Subscription;
    assistance: CancellationAssistance;
    potentialYearlySavings: Money;
  }> {
    const wasAggressive = this.config.aggressiveCancelMode;
    this.config.aggressiveCancelMode = true;

    const candidates = this.getCancellationCandidates(userId);

    this.config.aggressiveCancelMode = wasAggressive;

    return candidates.map(({ subscription, roi }) => ({
      subscription,
      assistance: this.getCancellationAssistance(subscription.id),
      potentialYearlySavings: { amount: Math.round(roi.yearlyAmount.amount), currency: roi.yearlyAmount.currency },
    }));
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private updatePriority(sub: Subscription): void {
    if (!sub.lastUsed) {
      sub.priority = sub.priority === 'unknown' ? 'unknown' : sub.priority;
      return;
    }

    const daysSinceUsed = Math.floor((Date.now() - sub.lastUsed) / (24 * 60 * 60 * 1000));

    if (daysSinceUsed > this.config.unusedThresholdDays * 2) {
      sub.priority = 'unused';
    } else if (sub.usageFrequency === 'daily' || sub.usageFrequency === 'weekly') {
      sub.priority = sub.priority === 'essential' ? 'essential' : 'useful';
    } else if (sub.usageFrequency === 'rarely' || sub.usageFrequency === 'never') {
      sub.priority = 'optional';
    }
  }

  private calculateDetectionConfidence(
    transactions: Array<{ amount: number; date: number }>,
    avgInterval: number
  ): number {
    let confidence = 50;

    // More transactions = higher confidence
    confidence += Math.min(transactions.length * 5, 25);

    // Consistent amounts = higher confidence
    const amounts = transactions.map(t => t.amount);
    const variance = this.calculateVariance(amounts);
    if (variance < 0.01) confidence += 15;
    else if (variance < 0.05) confidence += 10;

    // Consistent intervals = higher confidence
    const intervals: number[] = [];
    for (let i = 1; i < transactions.length; i++) {
      intervals.push(transactions[i].date - transactions[i - 1].date);
    }
    const intervalVariance = this.calculateVariance(intervals);
    if (intervalVariance < 0.1) confidence += 10;

    return Math.min(confidence, 100);
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length) / mean;
  }

  private generatePhoneScript(sub: Subscription): string {
    return `Hello, I'd like to cancel my ${sub.name} subscription.

Account holder: [YOUR NAME]
Email on account: [YOUR EMAIL]

If asked why:
"I've reviewed my finances and need to cut back on subscriptions at this time."

If offered a discount:
"No thank you, I've made my decision and would like to proceed with cancellation."

If offered a free month:
"No thank you, please proceed with the cancellation."

Important: Get a confirmation number and the effective date of cancellation.`;
  }

  private generateCancellationEmail(sub: Subscription): string {
    return `Subject: Request to Cancel ${sub.name} Subscription

Dear ${sub.provider} Support Team,

I am writing to request the cancellation of my ${sub.name} subscription, effective immediately.

Account Information:
- Account holder: [YOUR NAME]
- Email: [YOUR EMAIL]
- Account/Member ID: ${sub.notes?.includes('ID') ? sub.notes : '[YOUR ACCOUNT ID]'}

Please confirm the cancellation in writing and provide:
1. The effective date of cancellation
2. Confirmation that no further charges will be made
3. Any refund due (if applicable)

If you require any additional information to process this request, please let me know.

Thank you for your assistance.

Sincerely,
[YOUR NAME]`;
  }

  private calculateNextBilling(lastDate: number, frequency: BillFrequency): number {
    const days = BILL_FREQUENCY_DAYS[frequency];
    if (days === 0) return lastDate;
    return lastDate + days * 24 * 60 * 60 * 1000;
  }

  private toMonthlyAmount(amount: number, frequency: BillFrequency): number {
    switch (frequency) {
      case 'one_time':
        return 0;
      case 'weekly':
        return amount * 4.33;
      case 'biweekly':
        return amount * 2.17;
      case 'monthly':
        return amount;
      case 'quarterly':
        return amount / 3;
      case 'semi_annual':
        return amount / 6;
      case 'annual':
        return amount / 12;
    }
  }

  private generateId(): string {
    return `sub-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createSubscriptionManager(
  config?: Partial<SubscriptionManagerConfig>
): SubscriptionManager {
  return new SubscriptionManager(config);
}
