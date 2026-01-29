/**
 * Savings Module Types
 *
 * Core type definitions for the money-saving automations module including
 * price negotiation, shopping automation, price monitoring, insurance claims,
 * expense tracking, bill reminders, and subscription analysis.
 */

// =============================================================================
// Vendor Types
// =============================================================================

export interface VendorInfo {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  category: VendorCategory;
  type?: string;
  industry?: string;
  customerYears?: number;
  customerSince?: number;
  totalSpent?: number;
  lastContactDate?: number;
}

export type VendorCategory =
  | 'utility'
  | 'insurance'
  | 'telecom'
  | 'retail'
  | 'subscription'
  | 'financial'
  | 'travel'
  | 'healthcare'
  | 'other';

// =============================================================================
// Negotiation Types
// =============================================================================

export interface NegotiationSession {
  id: string;
  userId: string;
  type: NegotiationType;
  vendor: VendorInfo;
  targetAmount: number;
  currentAmount: number;
  status: NegotiationStatus;
  emails: NegotiationEmail[];
  counterOffers: CounterOffer[];
  notes?: string;
  startedAt: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type NegotiationType = 'price' | 'rate' | 'fee' | 'contract' | 'refund';

export type NegotiationStatus =
  | 'draft'
  | 'pending'
  | 'sent'
  | 'negotiating'
  | 'awaiting_response'
  | 'counter_received'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export interface NegotiationEmail {
  id: string;
  direction: 'outbound' | 'inbound';
  subject: string;
  body: string;
  sentAt?: number;
  receivedAt?: number;
  status: 'draft' | 'sent' | 'delivered' | 'read' | 'replied' | 'received';
}

export interface CounterOffer {
  id: string;
  amount: number;
  justification: string;
  strategy: CounterOfferStrategy;
  confidence: number;
  proposedAt: number;
  status: 'proposed' | 'accepted' | 'rejected' | 'countered';
  metadata?: Record<string, unknown>;
}

export type CounterOfferStrategy =
  | 'competitor-match'
  | 'loyalty'
  | 'bulk'
  | 'timing'
  | 'bundle'
  | 'cancellation-threat'
  | 'market-rate';

export interface NegotiationTemplate {
  id: string;
  name: string;
  type: NegotiationType;
  vendorCategory: VendorCategory;
  subject: string;
  body: string;
  variables: string[];
  successRate?: number;
}

// =============================================================================
// Shopping & 2FA Types
// =============================================================================

export interface ShoppingSession {
  id: string;
  userId: string;
  retailer: string;
  retailerUrl: string;
  items: CartItem[];
  status: ShoppingStatus;
  requires2FA: boolean;
  twoFactorMethod?: TwoFactorMethod;
  twoFactorSession?: TwoFactorSession;
  totalAmount: number;
  discount?: number;
  promoCode?: string;
  checkoutUrl?: string;
  orderConfirmation?: string;
  paymentInfo?: PaymentInfo;
  shippingInfo?: ShippingInfo;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface CartItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  originalPrice?: number;
  url?: string;
  sku?: string;
  variant?: string;
  available?: boolean;
}

export type ShoppingStatus =
  | 'created'
  | 'items_added'
  | 'cart_ready'
  | 'checkout'
  | 'checkout_started'
  | 'awaiting_2fa'
  | '2fa_verified'
  | 'payment_pending'
  | 'payment_completed'
  | 'order_confirmed'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface PaymentInfo {
  type: 'card' | 'paypal' | 'apple_pay' | 'google_pay' | 'other';
  method?: 'credit_card' | 'debit_card' | 'paypal' | 'apple_pay' | 'google_pay' | 'other';
  cardLastFour?: string;
  cardBrand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  billingAddress?: ShippingInfo;
}

export interface ShippingInfo {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
}

export type TwoFactorMethod = 'sms' | 'email' | 'app' | 'voice' | 'hardware';

export interface TwoFactorSession {
  id: string;
  shoppingSessionId: string;
  method: TwoFactorMethod;
  status: TwoFactorStatus;
  phoneLastFour?: string;
  emailMasked?: string;
  expiresAt: number;
  createdAt: number;
  verifiedAt?: number;
  // Note: Code is NEVER stored - passed directly through secure channel
}

export type TwoFactorStatus =
  | 'pending'
  | 'code_sent'
  | 'code_received'
  | 'verified'
  | 'expired'
  | 'failed';

export interface TwoFactorConsent {
  userId: string;
  retailer: string;
  method: TwoFactorMethod;
  consentedAt: number;
  expiresAt: number;
  deviceId?: string;
}

// =============================================================================
// Price Monitoring Types
// =============================================================================

export interface PriceAlert {
  id: string;
  userId: string;
  productUrl: string;
  productName: string;
  productImage?: string;
  retailer: string;
  targetPrice: number;
  currentPrice: number;
  originalPrice: number;
  alertType: PriceAlertType;
  isActive: boolean;
  priceHistory: PricePoint[];
  notificationChannels: string[];
  lastCheckedAt?: number;
  triggeredAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type PriceAlertType = 'below' | 'drop-percent' | 'all-time-low' | 'back-in-stock';

export interface PricePoint {
  price: number;
  timestamp: number;
  inStock: boolean;
  source?: string;
}

export interface PriceCheckResult {
  productUrl: string;
  currentPrice: number;
  inStock: boolean;
  lastCheckedAt: number;
  priceChange?: {
    direction: 'up' | 'down' | 'unchanged';
    amount: number;
    percentChange: number;
  };
}

export interface PriceDrop {
  alertId: string;
  productName: string;
  productUrl: string;
  previousPrice: number;
  currentPrice: number;
  targetPrice: number;
  savings: number;
  percentDrop: number;
  isAllTimeLow: boolean;
  detectedAt: number;
}

// =============================================================================
// Insurance Types
// =============================================================================

export interface InsuranceClaim {
  id: string;
  userId: string;
  type: InsuranceType;
  provider: string;
  policyNumber: string; // Encrypted at rest
  status: ClaimStatus;
  claimNumber?: string;
  incidentDate: number;
  filedDate?: number;
  description: string;
  estimatedAmount?: number;
  approvedAmount?: number;
  paidAmount?: number;
  documents: ClaimDocument[];
  timeline: ClaimTimelineEvent[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type InsuranceType = 'auto' | 'home' | 'health' | 'travel' | 'life' | 'renters' | 'other';

export type ClaimStatus =
  | 'draft'
  | 'ready_to_file'
  | 'filed'
  | 'under_review'
  | 'additional_info_requested'
  | 'approved'
  | 'partially_approved'
  | 'denied'
  | 'paid'
  | 'appealed'
  | 'closed';

export interface ClaimDocument {
  id: string;
  type: ClaimDocumentType;
  name: string;
  mimeType: string;
  size: number;
  storagePath: string; // Encrypted reference
  uploadedAt: number;
  verified: boolean;
}

export type ClaimDocumentType =
  | 'photo'
  | 'receipt'
  | 'police_report'
  | 'medical_record'
  | 'estimate'
  | 'invoice'
  | 'id_document'
  | 'proof_of_ownership'
  | 'other';

export interface ClaimTimelineEvent {
  id: string;
  type: ClaimEventType;
  description: string;
  timestamp: number;
  actor?: string;
  metadata?: Record<string, unknown>;
}

export type ClaimEventType =
  | 'created'
  | 'document_added'
  | 'filed'
  | 'status_changed'
  | 'response_received'
  | 'info_requested'
  | 'info_provided'
  | 'decision_made'
  | 'payment_received'
  | 'note_added';

export interface InsurancePolicy {
  id: string;
  userId: string;
  type: InsuranceType;
  provider: string;
  policyNumber: string; // Encrypted
  coverageAmount: number;
  deductible: number;
  premiumAmount: number;
  premiumFrequency: 'monthly' | 'quarterly' | 'annually';
  startDate: number;
  endDate: number;
  isActive: boolean;
}

// =============================================================================
// Expense Types
// =============================================================================

export interface Expense {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  subcategory?: string;
  description: string;
  merchant?: string;
  expenseDate: number;
  paymentMethod?: string;
  receiptUrl?: string;
  splits?: ExpenseSplit[];
  tags: string[];
  isRecurring: boolean;
  recurringId?: string;
  createdAt: number;
  updatedAt: number;
}

export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'housing'
  | 'utilities'
  | 'entertainment'
  | 'shopping'
  | 'health'
  | 'travel'
  | 'education'
  | 'personal'
  | 'gifts'
  | 'other';

export interface ExpenseSplit {
  id: string;
  odId: string; // Other debtor ID
  odName: string;
  odEmail?: string;
  odPhone?: string;
  amount: number;
  status: SplitStatus;
  requestedAt?: number;
  paidAt?: number;
  reminderCount: number;
  lastReminderAt?: number;
  paymentMethod?: string;
  paymentReference?: string;
}

export type SplitStatus = 'pending' | 'requested' | 'reminded' | 'paid' | 'forgiven' | 'disputed';

export interface SplitGroup {
  id: string;
  userId: string;
  name: string;
  description?: string;
  members: GroupMember[];
  expenses: string[]; // Expense IDs
  defaultSplitType: SplitType;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GroupMember {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  defaultShare?: number; // For unequal splits
  isActive: boolean;
  joinedAt: number;
}

export type SplitType = 'equal' | 'percentage' | 'exact' | 'shares';

export interface Settlement {
  id: string;
  groupId?: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'cancelled';
  method?: string;
  reference?: string;
  createdAt: number;
  completedAt?: number;
}

export interface GroupBalance {
  userId: string;
  userName: string;
  balance: number; // Positive = owed money, Negative = owes money
  owes: Map<string, number>; // userId -> amount
  owedBy: Map<string, number>; // userId -> amount
}

// =============================================================================
// Bill Types
// =============================================================================

export interface Bill {
  id: string;
  userId: string;
  name: string;
  payee: string;
  payeeUrl?: string;
  accountNumber?: string; // Encrypted
  amount: number;
  currency: string;
  frequency: BillFrequency;
  dueDay: number; // Day of month (1-31) or day of week (1-7)
  reminderDays: number[];
  autopay: boolean;
  autopayAccountId?: string;
  category: ExpenseCategory;
  isActive: boolean;
  nextDueDate: number;
  lastPaidDate?: number;
  lastPaidAmount?: number;
  paymentHistory: BillPayment[];
  createdAt: number;
  updatedAt: number;
}

export type BillFrequency =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'semi-annually'
  | 'annually';

export interface BillPayment {
  id: string;
  amount: number;
  paidAt: number;
  method?: string;
  confirmationNumber?: string;
  wasLate: boolean;
  lateFee?: number;
}

export interface BillReminder {
  id: string;
  billId: string;
  userId: string;
  billName: string;
  amount: number;
  dueDate: number;
  daysUntilDue: number;
  scheduledFor: number;
  sent: boolean;
  sentAt?: number;
  channels: string[];
}

// =============================================================================
// Subscription Types
// =============================================================================

export interface Subscription {
  id: string;
  userId: string;
  name: string;
  provider: string;
  providerUrl?: string;
  amount: number;
  currency: string;
  frequency: SubscriptionFrequency;
  status: SubscriptionStatus;
  detectedFrom: SubscriptionSource;
  category: SubscriptionCategory;
  startDate: number;
  nextBillingDate?: number;
  trialEndsAt?: number;
  cancelledAt?: number;
  usageMetrics?: SubscriptionUsage;
  cancellationSteps?: string[];
  cancellationUrl?: string;
  linkedTransactions: string[];
  tags: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type SubscriptionFrequency = 'weekly' | 'monthly' | 'quarterly' | 'annually';

export type SubscriptionStatus =
  | 'active'
  | 'trial'
  | 'paused'
  | 'cancelled'
  | 'expired'
  | 'unknown';

export type SubscriptionSource = 'manual' | 'transaction' | 'email' | 'bank-feed';

export type SubscriptionCategory =
  | 'streaming'
  | 'software'
  | 'gaming'
  | 'news'
  | 'fitness'
  | 'productivity'
  | 'cloud-storage'
  | 'music'
  | 'food-delivery'
  | 'utilities'
  | 'membership'
  | 'other';

export interface SubscriptionUsage {
  lastUsedAt?: number;
  usageCount?: number;
  usagePeriodDays: number;
  averageUsagePerWeek?: number;
  isUnused: boolean;
  unusedDays?: number;
}

export interface DetectedSubscription {
  name: string;
  provider: string;
  amount: number;
  frequency: SubscriptionFrequency;
  confidence: number;
  transactions: TransactionMatch[];
  suggestedCategory?: SubscriptionCategory;
}

export interface TransactionMatch {
  id: string;
  amount: number;
  date: number;
  description: string;
}

export interface SubscriptionAnalysis {
  totalMonthly: number;
  totalAnnual: number;
  unusedSubscriptions: Subscription[];
  upcomingRenewals: Subscription[];
  potentialSavings: number;
  categoryBreakdown: Map<SubscriptionCategory, number>;
  recommendations: SubscriptionRecommendation[];
}

export interface SubscriptionRecommendation {
  type: 'cancel' | 'downgrade' | 'switch' | 'bundle';
  subscriptionId: string;
  subscriptionName: string;
  reason: string;
  potentialSavings: number;
  confidence: number;
  alternativeProvider?: string;
  alternativeAmount?: number;
}

// =============================================================================
// Provider Types
// =============================================================================

export interface SavingsProviderConfig {
  name: string;
  apiKeyEnvVar?: string;
  baseUrl?: string;
  timeout?: number;
  retryCount?: number;
}

export interface SavingsProviderResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  cached: boolean;
  fetchedAt: number;
}

// =============================================================================
// Event Types
// =============================================================================

export interface SavingsEvent {
  type: SavingsEventType;
  userId: string;
  timestamp: number;
  data: unknown;
}

export type SavingsEventType =
  // Price monitoring events
  | 'savings.price.drop-detected'
  | 'savings.price.target-reached'
  | 'savings.price.all-time-low'
  | 'savings.price.back-in-stock'
  // Negotiation events
  | 'savings.negotiation.started'
  | 'savings.negotiation.email-sent'
  | 'savings.negotiation.response-received'
  | 'savings.negotiation.success'
  | 'savings.negotiation.failed'
  // Bill events
  | 'savings.bill.reminder'
  | 'savings.bill.due-today'
  | 'savings.bill.overdue'
  | 'savings.bill.paid'
  // Subscription events
  | 'savings.subscription.detected'
  | 'savings.subscription.unused'
  | 'savings.subscription.renewal-upcoming'
  | 'savings.subscription.cancelled'
  // Insurance events
  | 'savings.insurance.claim-filed'
  | 'savings.insurance.status-changed'
  | 'savings.insurance.payment-received'
  // Expense events
  | 'savings.expense.split-created'
  | 'savings.expense.split-requested'
  | 'savings.expense.split-paid'
  | 'savings.expense.split-reminder'
  // Shopping events
  | 'savings.shopping.checkout-started'
  | 'savings.shopping.2fa-required'
  | 'savings.shopping.order-completed';

// =============================================================================
// Store Types
// =============================================================================

export interface NegotiationQueryOptions {
  status?: NegotiationStatus[];
  type?: NegotiationType[];
  vendorCategory?: VendorCategory;
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'updatedAt' | 'startedAt';
  orderDirection?: 'asc' | 'desc';
}

export interface PriceAlertQueryOptions {
  isActive?: boolean;
  alertType?: PriceAlertType[];
  retailer?: string;
  limit?: number;
  offset?: number;
}

export interface InsuranceClaimQueryOptions {
  status?: ClaimStatus[];
  type?: InsuranceType[];
  provider?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'incidentDate' | 'filedDate';
  orderDirection?: 'asc' | 'desc';
}

export interface ExpenseQueryOptions {
  category?: ExpenseCategory[];
  dateFrom?: number;
  dateTo?: number;
  minAmount?: number;
  maxAmount?: number;
  hasSplits?: boolean;
  tags?: string[];
  limit?: number;
  offset?: number;
  orderBy?: 'expenseDate' | 'amount' | 'createdAt';
  orderDirection?: 'asc' | 'desc';
}

export interface BillQueryOptions {
  isActive?: boolean;
  category?: ExpenseCategory[];
  frequency?: BillFrequency[];
  dueBefore?: number;
  dueAfter?: number;
  limit?: number;
  offset?: number;
}

export interface SubscriptionQueryOptions {
  status?: SubscriptionStatus[];
  category?: SubscriptionCategory[];
  frequency?: SubscriptionFrequency[];
  source?: SubscriptionSource[];
  isUnused?: boolean;
  limit?: number;
  offset?: number;
  orderBy?: 'amount' | 'nextBillingDate' | 'createdAt';
  orderDirection?: 'asc' | 'desc';
}

// =============================================================================
// Service Config Types
// =============================================================================

export interface SavingsServiceConfig {
  enabled?: boolean;
}

export interface NegotiationServiceConfig extends SavingsServiceConfig {
  emailProvider?: 'smtp' | 'sendgrid' | 'ses';
  maxConcurrentNegotiations?: number;
  defaultFollowUpDays?: number;
}

export interface ShoppingServiceConfig extends SavingsServiceConfig {
  sessionTimeoutSeconds?: number;
  requireExplicitConsent?: boolean;
  maxItemsPerSession?: number;
  sms2faBridge?: {
    enabled?: boolean;
    provider?: 'twilio' | 'vonage' | 'messagebird';
    sessionTimeoutSeconds?: number;
    requireExplicitConsent?: boolean;
    maxSessionsPerHour?: number;
    auditAllOperations?: boolean;
  };
}

export interface PriceMonitoringServiceConfig extends SavingsServiceConfig {
  checkIntervalMinutes?: number;
  maxAlertsPerUser?: number;
  historyRetentionDays?: number;
  batchSize?: number;
}

export interface InsuranceServiceConfig extends SavingsServiceConfig {
  encryptPII?: boolean;
  encryptionKeyEnvVar?: string;
  maxDocumentSizeMB?: number;
}

export interface ExpenseServiceConfig extends SavingsServiceConfig {
  defaultCurrency?: string;
  splitRequestProvider?: 'email' | 'venmo' | 'paypal' | 'manual';
  autoReminderDays?: number[];
}

export interface BillServiceConfig extends SavingsServiceConfig {
  defaultReminderDays?: number[];
  overdueGraceDays?: number;
}

export interface SubscriptionServiceConfig extends SavingsServiceConfig {
  detectFromTransactions?: boolean;
  unusedThresholdDays?: number;
  renewalReminderDays?: number;
}
