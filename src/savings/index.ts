/**
 * Savings Module
 *
 * Comprehensive money-saving automation module with:
 * - Price negotiation with email drafting and counter-offer strategies
 * - Shopping automation with secure 2FA handling
 * - Price monitoring with configurable alerts
 * - Insurance claim filing with PII encryption
 * - Expense tracking with friend splitting and settlement optimization
 * - Bill reminders with scheduling
 * - Subscription analysis with detection from transactions
 */

// Types
export type {
  // Negotiation types
  NegotiationType,
  NegotiationStatus,
  CounterOfferStrategy,
  VendorInfo,
  NegotiationEmail,
  CounterOffer,
  NegotiationSession,
  NegotiationTemplate,

  // Shopping types
  ShoppingStatus,
  CartItem,
  ShoppingSession,
  TwoFactorSession as TwoFactorSessionType,
  TwoFactorStatus,

  // Price monitoring types
  PriceAlertType,
  PricePoint,
  PriceAlert,
  PriceCheckResult,
  PriceDrop,

  // Insurance types
  InsuranceType,
  ClaimStatus,
  ClaimDocumentType,
  ClaimDocument,
  ClaimTimelineEvent,
  ClaimEventType,
  InsuranceClaim,

  // Expense types
  ExpenseCategory,
  SplitType,
  SplitStatus,
  ExpenseSplit,
  Expense,
  GroupMember,
  SplitGroup,
  Settlement,
  GroupBalance,

  // Bill types
  BillFrequency,
  BillPayment,
  BillReminder,
  Bill,

  // Subscription types
  SubscriptionFrequency,
  SubscriptionCategory,
  SubscriptionStatus,
  SubscriptionUsage,
  TransactionMatch,
  DetectedSubscription,
  Subscription,
  SubscriptionAnalysis,
  SubscriptionRecommendation,

  // Event types
  SavingsEventType,
  SavingsEvent,

  // Config types
  NegotiationServiceConfig,
  ShoppingServiceConfig,
  PriceMonitoringServiceConfig,
  InsuranceServiceConfig,
  ExpenseServiceConfig,
  BillServiceConfig,
  SubscriptionServiceConfig,
  SavingsProviderConfig,
  SavingsProviderResult,
} from './types.js';

// Configuration
export {
  SavingsConfigSchema,
  type SavingsConfig,
} from './config.js';

// Providers
export {
  BaseSavingsProvider,
  SavingsProviderRegistry,
  SavingsProviderError,
  getSavingsProviderRegistry,
  initSavingsProviderRegistry,
  // Price monitoring
  PriceMonitoringProvider,
  GenericPriceProvider,
  AmazonPriceProvider,
  MultiProviderPriceChecker,
  // Banking
  PlaidBankingProvider,
  TransactionAnalyzer,
  // SMS 2FA
  Sms2FABridgeProvider,
  MockSmsProvider,
  createSms2FABridge,
  // Insurance
  GenericInsuranceProvider,
  InsuranceProviderRegistry,
  createInsuranceProviderRegistry,
  // Email
  MockEmailProvider,
  SmtpEmailProvider,
  SendGridEmailProvider,
  SesEmailProvider,
  EmailTemplateManager,
  createEmailProvider,
} from './providers/index.js';

// Stores
export {
  // Expense store
  type ExpenseStore,
  DatabaseExpenseStore,
  InMemoryExpenseStore,
  // Subscription store
  type SubscriptionStore,
  DatabaseSubscriptionStore,
  InMemorySubscriptionStore,
  // Price alert store
  type PriceAlertStore,
  DatabasePriceAlertStore,
  InMemoryPriceAlertStore,
  // Insurance claim store
  type InsuranceClaimStore,
  type EncryptionService,
  DatabaseInsuranceClaimStore,
  InMemoryInsuranceClaimStore,
  // Negotiation store
  type NegotiationStore,
  DatabaseNegotiationStore,
  InMemoryNegotiationStore,
  // Bill store
  type BillStore,
  DatabaseBillStore,
  InMemoryBillStore,
} from './stores/index.js';

// Services
export {
  // Price monitoring
  PriceMonitoringService,
  createPriceMonitoringService,
  AlertEngine,
  PriceHistoryAnalyzer,
} from './monitoring/index.js';

export {
  // Expense tracking
  ExpenseTrackingService,
  createExpenseTrackingService,
  SplitCalculator,
  SettlementTracker,
} from './expenses/index.js';

export {
  // Bill reminders
  BillReminderService,
  createBillReminderService,
  ReminderScheduler,
  type ScheduledReminder,
} from './bills/index.js';

export {
  // Subscriptions
  SubscriptionAnalysisService,
  createSubscriptionAnalysisService,
  SubscriptionDetector,
  CancellationHelper,
  type CancellationGuide,
} from './subscriptions/index.js';

export {
  // Negotiation
  NegotiationService,
  createNegotiationService,
  EmailDrafter,
  CounterOfferEngine,
  VendorContactManager,
  type EmailTemplate,
  type EmailTone,
  type EmailDraft,
  type MarketData,
  type StrategyEvaluation,
  type VendorContact,
  type NegotiationAttempt,
} from './negotiation/index.js';

export {
  // Shopping automation
  ShoppingAutomationService,
  createShoppingAutomationService,
  TwoFactorSessionManager,
  CheckoutHandler,
  maskPhoneNumber,
  maskEmail,
  getPhoneLastFour,
  type TwoFactorSession,
  type TwoFactorMethod,
  type TwoFactorConsent,
  type CheckoutFlow,
  type CheckoutState,
  type CheckoutStep,
  type CheckoutResult,
} from './shopping/index.js';

export {
  // Insurance claims
  InsuranceClaimService,
  createInsuranceClaimService,
  ClaimBuilder,
  DocumentManager,
  type ClaimValidation,
  type ClaimFormSection,
  type DocumentValidation,
} from './insurance/index.js';

// Event definitions for the event bus
export const SAVINGS_EVENTS = {
  // Price monitoring events
  PRICE_DROP_DETECTED: 'savings.price.drop-detected',
  PRICE_TARGET_REACHED: 'savings.price.target-reached',
  PRICE_ALL_TIME_LOW: 'savings.price.all-time-low',
  PRICE_BACK_IN_STOCK: 'savings.price.back-in-stock',

  // Negotiation events
  NEGOTIATION_STARTED: 'savings.negotiation.started',
  NEGOTIATION_EMAIL_SENT: 'savings.negotiation.email-sent',
  NEGOTIATION_RESPONSE_RECEIVED: 'savings.negotiation.response-received',
  NEGOTIATION_SUCCESS: 'savings.negotiation.success',
  NEGOTIATION_FAILED: 'savings.negotiation.failed',

  // Bill events
  BILL_REMINDER: 'savings.bill.reminder',
  BILL_DUE_TODAY: 'savings.bill.due-today',
  BILL_OVERDUE: 'savings.bill.overdue',
  BILL_PAID: 'savings.bill.paid',

  // Subscription events
  SUBSCRIPTION_DETECTED: 'savings.subscription.detected',
  SUBSCRIPTION_UNUSED: 'savings.subscription.unused',
  SUBSCRIPTION_RENEWAL_UPCOMING: 'savings.subscription.renewal-upcoming',
  SUBSCRIPTION_PRICE_INCREASE: 'savings.subscription.price-increase',

  // Insurance events
  CLAIM_CREATED: 'savings.insurance.claim-created',
  CLAIM_SUBMITTED: 'savings.insurance.claim-submitted',
  CLAIM_STATUS_CHANGED: 'savings.insurance.status-changed',
  CLAIM_APPROVED: 'savings.insurance.claim-approved',
  CLAIM_DENIED: 'savings.insurance.claim-denied',

  // Expense events
  EXPENSE_CREATED: 'savings.expense.created',
  SPLIT_REQUESTED: 'savings.expense.split-requested',
  SPLIT_PAID: 'savings.expense.split-paid',
  SETTLEMENT_COMPLETED: 'savings.expense.settlement-completed',

  // Shopping events
  SHOPPING_SESSION_STARTED: 'savings.shopping.session-started',
  SHOPPING_2FA_REQUIRED: 'savings.shopping.2fa-required',
  SHOPPING_2FA_VERIFIED: 'savings.shopping.2fa-verified',
  SHOPPING_CHECKOUT_COMPLETED: 'savings.shopping.checkout-completed',
} as const;

/**
 * Savings Manager - Main entry point for the savings module
 *
 * Coordinates all savings services and provides a unified API.
 */
export class SavingsManager {
  private _priceMonitoring?: PriceMonitoringService;
  private _expenses?: ExpenseTrackingService;
  private _bills?: BillReminderService;
  private _subscriptions?: SubscriptionAnalysisService;
  private _negotiation?: NegotiationService;
  private _shopping?: ShoppingAutomationService;
  private _insurance?: InsuranceClaimService;
  private initialized = false;

  constructor(
    private readonly stores: {
      expense?: ExpenseStore;
      subscription?: SubscriptionStore;
      priceAlert?: PriceAlertStore;
      insuranceClaim?: InsuranceClaimStore;
      negotiation?: NegotiationStore;
      bill?: BillStore;
    },
    private readonly config?: SavingsConfig
  ) {}

  /**
   * Initialize the savings manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize services based on available stores and config
    if (this.stores.priceAlert && this.config?.priceMonitoring?.enabled !== false) {
      this._priceMonitoring = createPriceMonitoringService(
        this.stores.priceAlert,
        this.config
      );
    }

    if (this.stores.expense && this.config?.expenses?.enabled !== false) {
      this._expenses = createExpenseTrackingService(
        this.stores.expense,
        this.config
      );
    }

    if (this.stores.bill && this.config?.bills?.enabled !== false) {
      this._bills = createBillReminderService(
        this.stores.bill,
        this.config
      );
    }

    if (this.stores.subscription && this.config?.subscriptions?.enabled !== false) {
      this._subscriptions = createSubscriptionAnalysisService(
        this.stores.subscription,
        this.config
      );
    }

    if (this.stores.negotiation && this.config?.negotiation?.enabled !== false) {
      this._negotiation = createNegotiationService(
        this.stores.negotiation,
        this.config
      );
    }

    if (this.config?.shopping?.enabled !== false) {
      this._shopping = createShoppingAutomationService(this.config);
    }

    if (this.stores.insuranceClaim && this.config?.insurance?.enabled !== false) {
      this._insurance = createInsuranceClaimService(
        this.stores.insuranceClaim,
        this.config
      );
    }

    this.initialized = true;
  }

  /**
   * Get the price monitoring service
   */
  get priceMonitoring(): PriceMonitoringService | undefined {
    return this._priceMonitoring;
  }

  /**
   * Get the expense tracking service
   */
  get expenses(): ExpenseTrackingService | undefined {
    return this._expenses;
  }

  /**
   * Get the bill reminder service
   */
  get bills(): BillReminderService | undefined {
    return this._bills;
  }

  /**
   * Get the subscription analysis service
   */
  get subscriptions(): SubscriptionAnalysisService | undefined {
    return this._subscriptions;
  }

  /**
   * Get the negotiation service
   */
  get negotiation(): NegotiationService | undefined {
    return this._negotiation;
  }

  /**
   * Get the shopping automation service
   */
  get shopping(): ShoppingAutomationService | undefined {
    return this._shopping;
  }

  /**
   * Get the insurance claim service
   */
  get insurance(): InsuranceClaimService | undefined {
    return this._insurance;
  }

  /**
   * Check if the manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get a summary of enabled services
   */
  getEnabledServices(): string[] {
    const services: string[] = [];

    if (this._priceMonitoring) services.push('priceMonitoring');
    if (this._expenses) services.push('expenses');
    if (this._bills) services.push('bills');
    if (this._subscriptions) services.push('subscriptions');
    if (this._negotiation) services.push('negotiation');
    if (this._shopping) services.push('shopping');
    if (this._insurance) services.push('insurance');

    return services;
  }

  /**
   * Get comprehensive savings summary for a user
   */
  async getSavingsSummary(userId: string): Promise<{
    priceAlerts: { active: number; totalSavings: number } | null;
    subscriptions: { total: number; monthlySpend: number; unused: number } | null;
    bills: { upcoming: number; overdue: number; monthlyTotal: number } | null;
    expenses: { pendingSplits: number; owedToYou: number; youOwe: number } | null;
    negotiations: { active: number; totalSavings: number; successRate: number } | null;
  }> {
    const summary: {
      priceAlerts: { active: number; totalSavings: number } | null;
      subscriptions: { total: number; monthlySpend: number; unused: number } | null;
      bills: { upcoming: number; overdue: number; monthlyTotal: number } | null;
      expenses: { pendingSplits: number; owedToYou: number; youOwe: number } | null;
      negotiations: { active: number; totalSavings: number; successRate: number } | null;
    } = {
      priceAlerts: null,
      subscriptions: null,
      bills: null,
      expenses: null,
      negotiations: null,
    };

    // Price alerts summary
    if (this._priceMonitoring) {
      const alerts = await this._priceMonitoring.getAlerts(userId);
      const activeAlerts = alerts.filter(a => a.isActive);
      summary.priceAlerts = {
        active: activeAlerts.length,
        totalSavings: 0, // Would calculate from triggered alerts
      };
    }

    // Subscriptions summary
    if (this._subscriptions) {
      const analysis = await this._subscriptions.analyzeSubscriptions(userId);
      summary.subscriptions = {
        total: (await this._subscriptions.getActiveSubscriptions(userId)).length,
        monthlySpend: analysis.totalMonthly,
        unused: analysis.unusedSubscriptions.length,
      };
    }

    // Bills summary
    if (this._bills) {
      const upcoming = await this._bills.getBillsDueSoon(userId, 7);
      const overdue = await this._bills.getOverdueBills(userId);
      const monthlyTotal = await this._bills.getMonthlyTotal(userId);
      summary.bills = {
        upcoming: upcoming.length,
        overdue: overdue.length,
        monthlyTotal,
      };
    }

    // Expenses summary
    if (this._expenses) {
      const pending = await this._expenses.getPendingSplits(userId);
      const whoOwes = await this._expenses.getWhoOwesWhom(userId);

      const owedToYou = whoOwes.owedToYou.reduce((sum, item) => sum + item.amount, 0);
      const youOwe = whoOwes.youOwe.reduce((sum, item) => sum + item.amount, 0);

      summary.expenses = {
        pendingSplits: pending.length,
        owedToYou,
        youOwe,
      };
    }

    // Negotiations summary
    if (this._negotiation) {
      const stats = await this._negotiation.getStats(userId);
      const active = await this._negotiation.getActiveNegotiations(userId);
      summary.negotiations = {
        active: active.length,
        totalSavings: stats.totalSavings,
        successRate: stats.successRate,
      };
    }

    return summary;
  }

  /**
   * Shutdown the savings manager
   */
  async shutdown(): Promise<void> {
    // Cleanup resources if needed
    this.initialized = false;
  }
}

/**
 * Create a SavingsManager instance
 */
export function createSavingsManager(
  stores: {
    expense?: ExpenseStore;
    subscription?: SubscriptionStore;
    priceAlert?: PriceAlertStore;
    insuranceClaim?: InsuranceClaimStore;
    negotiation?: NegotiationStore;
    bill?: BillStore;
  },
  config?: SavingsConfig
): SavingsManager {
  return new SavingsManager(stores, config);
}

// Import service factories for internal use
import { createPriceMonitoringService, PriceMonitoringService, AlertEngine, PriceHistoryAnalyzer } from './monitoring/index.js';
import { createExpenseTrackingService, ExpenseTrackingService, SplitCalculator, SettlementTracker } from './expenses/index.js';
import { createBillReminderService, BillReminderService, ReminderScheduler } from './bills/index.js';
import { createSubscriptionAnalysisService, SubscriptionAnalysisService, SubscriptionDetector, CancellationHelper } from './subscriptions/index.js';
import { createNegotiationService, NegotiationService, EmailDrafter, CounterOfferEngine, VendorContactManager } from './negotiation/index.js';
import { createShoppingAutomationService, ShoppingAutomationService, TwoFactorSessionManager, CheckoutHandler, maskPhoneNumber, maskEmail, getPhoneLastFour } from './shopping/index.js';
import { createInsuranceClaimService, InsuranceClaimService, ClaimBuilder, DocumentManager } from './insurance/index.js';
import type { ExpenseStore, SubscriptionStore, PriceAlertStore, InsuranceClaimStore, NegotiationStore, BillStore } from './stores/index.js';
import type { SavingsConfig } from './config.js';
