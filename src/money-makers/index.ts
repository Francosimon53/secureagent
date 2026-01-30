/**
 * Money Makers Module
 *
 * Features with proven ROI - negotiation, price tracking, expense management, and more
 */

import type {
  Negotiation,
  NegotiationTarget,
  NegotiationStrategy,
  ShoppingList,
  PurchaseOrder,
  PriceMonitorItem,
  InsuranceClaim,
  Expense,
  ExpenseCategory,
  Budget,
  Bill,
  Subscription,
  Deal,
  WishlistItem,
  Money,
  AlertChannel,
  EmailProvider,
  SMSProvider,
  NotificationProvider,
  EncryptionProvider,
  PriceScraperProvider,
  OCRProvider,
} from './types.js';
import { MONEY_MAKERS_EVENTS } from './constants.js';

import { AutoNegotiator, createAutoNegotiator, type AutoNegotiatorConfig } from './auto-negotiator.js';
import { ShoppingAutomation, createShoppingAutomation, type ShoppingAutomationConfig } from './shopping-automation.js';
import { PriceMonitor, createPriceMonitor, type PriceMonitorConfig } from './price-monitor.js';
import { InsuranceClaimHandler, createInsuranceClaimHandler, type InsuranceClaimHandlerConfig } from './insurance-claim-handler.js';
import { ExpenseTracker, createExpenseTracker, type ExpenseTrackerConfig } from './expense-tracker.js';
import { BillReminderManager, createBillReminderManager, type BillReminderConfig } from './bill-reminder.js';
import { SubscriptionManager, createSubscriptionManager, type SubscriptionManagerConfig } from './subscription-manager.js';
import { DealFinder, createDealFinder, type DealFinderConfig } from './deal-finder.js';

// =============================================================================
// Money Makers Configuration
// =============================================================================

export interface MoneyMakersConfig {
  /** Email provider for negotiations and communications */
  emailProvider?: EmailProvider;
  /** SMS provider for 2FA and notifications */
  smsProvider?: SMSProvider;
  /** Notification provider for alerts */
  notificationProvider?: NotificationProvider;
  /** Encryption provider for sensitive data */
  encryptionProvider?: EncryptionProvider;
  /** Price scraper for monitoring */
  priceScraperProvider?: PriceScraperProvider;
  /** OCR provider for receipts */
  ocrProvider?: OCRProvider;
  /** Default currency */
  defaultCurrency: Money['currency'];
  /** Default alert channels */
  defaultAlertChannels: AlertChannel[];
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: MoneyMakersConfig = {
  defaultCurrency: 'USD',
  defaultAlertChannels: ['push'],
};

// =============================================================================
// Money Makers Manager
// =============================================================================

export class MoneyMakers {
  private readonly config: MoneyMakersConfig;

  // Components
  public readonly negotiator: AutoNegotiator;
  public readonly shopping: ShoppingAutomation;
  public readonly priceMonitor: PriceMonitor;
  public readonly insuranceClaims: InsuranceClaimHandler;
  public readonly expenseTracker: ExpenseTracker;
  public readonly billReminder: BillReminderManager;
  public readonly subscriptions: SubscriptionManager;
  public readonly dealFinder: DealFinder;

  constructor(config?: Partial<MoneyMakersConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const eventHandler = (event: string, data: unknown) => {
      this.config.onEvent?.(event, data);
    };

    // Initialize components with shared config
    this.negotiator = createAutoNegotiator({
      emailProvider: this.config.emailProvider,
      onEvent: eventHandler,
    });

    this.shopping = createShoppingAutomation({
      encryptionProvider: this.config.encryptionProvider,
      smsProvider: this.config.smsProvider,
      notificationProvider: this.config.notificationProvider,
      defaultAlertChannels: this.config.defaultAlertChannels,
      onEvent: eventHandler,
    });

    this.priceMonitor = createPriceMonitor({
      scraperProvider: this.config.priceScraperProvider,
      notificationProvider: this.config.notificationProvider,
      defaultAlertChannels: this.config.defaultAlertChannels,
      onEvent: eventHandler,
    });

    this.insuranceClaims = createInsuranceClaimHandler({
      notificationProvider: this.config.notificationProvider,
      defaultAlertChannels: this.config.defaultAlertChannels,
      onEvent: eventHandler,
    });

    this.expenseTracker = createExpenseTracker({
      ocrProvider: this.config.ocrProvider,
      defaultCurrency: this.config.defaultCurrency,
      onEvent: eventHandler,
    });

    this.billReminder = createBillReminderManager({
      notificationProvider: this.config.notificationProvider,
      defaultAlertChannels: this.config.defaultAlertChannels,
      onEvent: eventHandler,
    });

    this.subscriptions = createSubscriptionManager({
      onEvent: eventHandler,
    });

    this.dealFinder = createDealFinder({
      scraperProvider: this.config.priceScraperProvider,
      notificationProvider: this.config.notificationProvider,
      defaultAlertChannels: this.config.defaultAlertChannels,
      onEvent: eventHandler,
    });
  }

  // ==========================================================================
  // Quick Access Methods
  // ==========================================================================

  /**
   * Start a negotiation
   */
  async startNegotiation(params: {
    userId: string;
    type: NegotiationTarget['type'];
    description: string;
    targetItem: string;
    maxBudget: Money;
    dealers: string[];
    strategy?: NegotiationStrategy;
  }): Promise<Negotiation> {
    const target: NegotiationTarget = {
      type: params.type,
      description: params.description,
      targetItem: params.targetItem,
      maxBudget: params.maxBudget,
    };

    const parties = params.dealers.map(email => ({
      email,
      name: email.split('@')[0],
    }));

    return this.negotiator.startNegotiation({
      userId: params.userId,
      target,
      parties,
      strategy: params.strategy,
    });
  }

  /**
   * Track a price
   */
  trackPrice(params: {
    userId: string;
    name: string;
    url: string;
    threshold?: Money;
    targetPrice?: Money;
  }): PriceMonitorItem {
    return this.priceMonitor.track({
      userId: params.userId,
      name: params.name,
      url: params.url,
      category: 'product',
      threshold: params.threshold,
      targetPrice: params.targetPrice,
      alertChannels: this.config.defaultAlertChannels,
    });
  }

  /**
   * Log an expense from natural language
   */
  logExpense(userId: string, text: string): Expense {
    return this.expenseTracker.log(userId, text);
  }

  /**
   * Get financial overview
   */
  async getFinancialOverview(userId: string): Promise<{
    monthlyExpenses: Money;
    monthlyBills: Money;
    monthlySubscriptions: Money;
    totalMonthlyCommitment: Money;
    upcomingBills: Bill[];
    subscriptionsSavingsPotential: Money;
    activeNegotiations: number;
    trackedPrices: number;
  }> {
    // Get expense summary for current month
    const now = Date.now();
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const expenseSummary = this.expenseTracker.getSummary(userId, {
      start: monthStart.getTime(),
      end: now,
    });

    const monthlyBills = this.billReminder.getMonthlyTotal(userId);
    const monthlySubscriptions = this.subscriptions.getUserSubscriptions(userId, { activeOnly: true })
      .reduce((sum, sub) => {
        const monthly = this.toMonthly(sub.amount.amount, sub.frequency);
        return sum + monthly;
      }, 0);

    const subscriptionReport = this.subscriptions.generateReport(userId);
    const upcomingBills = this.billReminder.getUpcomingBills(userId, 7);
    const negotiations = this.negotiator.listNegotiations(userId, 'active');
    const trackedItems = this.priceMonitor.getUserItems(userId);

    const currency = expenseSummary.totalSpent.currency;

    return {
      monthlyExpenses: expenseSummary.totalSpent,
      monthlyBills,
      monthlySubscriptions: { amount: Math.round(monthlySubscriptions), currency },
      totalMonthlyCommitment: {
        amount: Math.round(monthlyBills.amount + monthlySubscriptions),
        currency,
      },
      upcomingBills,
      subscriptionsSavingsPotential: subscriptionReport.potentialMonthlySavings,
      activeNegotiations: negotiations.length,
      trackedPrices: trackedItems.length,
    };
  }

  /**
   * Get savings opportunities
   */
  getSavingsOpportunities(userId: string): {
    subscriptionsToCancel: Array<{ name: string; monthlySavings: Money }>;
    dealsMatchingWishlist: Deal[];
    negotiationPotential: Money;
  } {
    const cancelCandidates = this.subscriptions.getCancellationCandidates(userId);
    const subscriptionsToCancel = cancelCandidates.map(c => ({
      name: c.subscription.name,
      monthlySavings: c.roi.monthlyAmount,
    }));

    const deals = this.dealFinder.getDealsForUser(userId);
    const dealsMatchingWishlist = deals.filter(d => d.matchedWishlistItems?.length);

    // Estimate negotiation potential (10-25% of typical purchases)
    const negotiationPotential: Money = { amount: 0, currency: this.config.defaultCurrency };

    return {
      subscriptionsToCancel,
      dealsMatchingWishlist,
      negotiationPotential,
    };
  }

  /**
   * Enable "just fucking cancel" mode
   */
  enableAggressiveCancelMode(): void {
    this.subscriptions.enableAggressiveMode();
  }

  /**
   * Get all subscriptions to cancel
   */
  getJustCancelList(userId: string) {
    return this.subscriptions.getJustCancelList(userId);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private toMonthly(amount: number, frequency: string): number {
    switch (frequency) {
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
      default:
        return 0;
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createMoneyMakers(config?: Partial<MoneyMakersConfig>): MoneyMakers {
  return new MoneyMakers(config);
}

// =============================================================================
// Re-exports
// =============================================================================

// Types
export * from './types.js';

// Constants
export {
  MONEY_MAKERS_EVENTS,
  NEGOTIATION_STRATEGIES,
  NEGOTIATION_TYPE_TIPS,
  EXPENSE_CATEGORY_KEYWORDS,
  EXPENSE_CATEGORY_ICONS,
  SUBSCRIPTION_PATTERNS,
  CANCELLATION_DIFFICULTY,
  DEFAULT_REMINDER_DAYS,
  BILL_FREQUENCY_DAYS,
  LATE_FEE_ESTIMATES,
  PRICE_CHECK_INTERVALS,
  PRICE_CHANGE_THRESHOLDS,
  STORE_CONFIGS,
  TWO_FACTOR_TIMEOUT,
  DEAL_SCORE_WEIGHTS,
  COUPON_SOURCES,
  CASHBACK_PLATFORMS,
  PII_PATTERNS,
  REDACTION_PLACEHOLDER,
  getNextBillingDate,
  calculateLateFee,
  formatMoney,
  redactPII,
  categorizeExpense,
  detectSubscription,
  calculateSavingsPercent,
  generateDealScore,
} from './constants.js';

// Components
export {
  AutoNegotiator,
  createAutoNegotiator,
  type AutoNegotiatorConfig,
} from './auto-negotiator.js';

export {
  ShoppingAutomation,
  createShoppingAutomation,
  type ShoppingAutomationConfig,
} from './shopping-automation.js';

export {
  PriceMonitor,
  createPriceMonitor,
  type PriceMonitorConfig,
} from './price-monitor.js';

export {
  InsuranceClaimHandler,
  createInsuranceClaimHandler,
  type InsuranceClaimHandlerConfig,
} from './insurance-claim-handler.js';

export {
  ExpenseTracker,
  createExpenseTracker,
  type ExpenseTrackerConfig,
} from './expense-tracker.js';

export {
  BillReminderManager,
  createBillReminderManager,
  type BillReminderConfig,
} from './bill-reminder.js';

export {
  SubscriptionManager,
  createSubscriptionManager,
  type SubscriptionManagerConfig,
} from './subscription-manager.js';

export {
  DealFinder,
  createDealFinder,
  type DealFinderConfig,
} from './deal-finder.js';
