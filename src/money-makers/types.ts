/**
 * Money Makers Types
 *
 * Type definitions for financial productivity features
 */

// =============================================================================
// Common Types
// =============================================================================

export type Currency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY' | 'CNY';

export interface Money {
  amount: number;
  currency: Currency;
}

export interface DateRange {
  start: number;
  end: number;
}

export type AlertChannel = 'email' | 'sms' | 'whatsapp' | 'push' | 'webhook';

export interface ContactInfo {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
}

// =============================================================================
// Auto-Negotiator Types
// =============================================================================

export type NegotiationType =
  | 'car_purchase'
  | 'car_lease'
  | 'service_contract'
  | 'salary'
  | 'rent'
  | 'insurance'
  | 'vendor_contract'
  | 'custom';

export type NegotiationStrategy =
  | 'aggressive'
  | 'moderate'
  | 'conservative'
  | 'walk_away_ready'
  | 'time_pressure';

export type NegotiationStatus =
  | 'draft'
  | 'active'
  | 'awaiting_response'
  | 'counter_offered'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'completed';

export interface NegotiationTarget {
  type: NegotiationType;
  description: string;
  targetItem: string;
  maxBudget: Money;
  idealPrice?: Money;
  deadline?: number;
  mustHaves?: string[];
  niceToHaves?: string[];
}

export interface NegotiationParty {
  id: string;
  contact: ContactInfo;
  channel: 'email' | 'phone' | 'chat' | 'in_person';
  initialOffer?: Money;
  currentOffer?: Money;
  responseHistory: NegotiationMessage[];
  status: 'contacted' | 'responded' | 'negotiating' | 'final_offer' | 'closed';
  notes?: string;
}

export interface NegotiationMessage {
  id: string;
  direction: 'outbound' | 'inbound';
  channel: string;
  content: string;
  offer?: Money;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface Negotiation {
  id: string;
  userId: string;
  target: NegotiationTarget;
  strategy: NegotiationStrategy;
  parties: NegotiationParty[];
  status: NegotiationStatus;
  bestOffer?: { partyId: string; offer: Money };
  savedAmount?: Money;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  notes: string[];
}

export interface CounterOfferSuggestion {
  suggestedOffer: Money;
  reasoning: string;
  talkingPoints: string[];
  riskLevel: 'low' | 'medium' | 'high';
  expectedOutcome: string;
}

export interface NegotiationDraft {
  subject: string;
  body: string;
  tone: 'professional' | 'friendly' | 'firm' | 'urgent';
  keyPoints: string[];
}

// =============================================================================
// Shopping Automation Types
// =============================================================================

export type StoreType =
  | 'grocery'
  | 'amazon'
  | 'walmart'
  | 'target'
  | 'costco'
  | 'pharmacy'
  | 'custom';

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  category?: string;
  preferredStore?: StoreType;
  maxPrice?: Money;
  notes?: string;
  isRecurring?: boolean;
  recurringInterval?: number; // days
}

export interface ShoppingList {
  id: string;
  userId: string;
  name: string;
  items: ShoppingItem[];
  store?: StoreType;
  budget?: Money;
  scheduledFor?: number;
  status: 'draft' | 'ready' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
}

export interface StoreCredentials {
  storeType: StoreType;
  username: string;
  // Password should be stored encrypted, not in plain text
  encryptedPassword: string;
  twoFactorEnabled: boolean;
  twoFactorMethod?: 'sms' | 'email' | 'authenticator';
}

export interface PurchaseOrder {
  id: string;
  userId: string;
  listId?: string;
  store: StoreType;
  items: Array<{
    item: ShoppingItem;
    actualPrice: Money;
    found: boolean;
  }>;
  subtotal: Money;
  tax: Money;
  total: Money;
  status: 'pending' | 'processing' | 'awaiting_2fa' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  confirmationNumber?: string;
  trackingNumber?: string;
  estimatedDelivery?: number;
  createdAt: number;
  updatedAt: number;
}

export interface TwoFactorRequest {
  orderId: string;
  store: StoreType;
  method: 'sms' | 'email' | 'authenticator';
  requestedAt: number;
  expiresAt: number;
  completed: boolean;
}

// =============================================================================
// Price Monitor Types
// =============================================================================

export type PriceMonitorCategory =
  | 'flight'
  | 'hotel'
  | 'product'
  | 'crypto'
  | 'stock'
  | 'service'
  | 'custom';

export interface PricePoint {
  price: Money;
  timestamp: number;
  source: string;
  metadata?: Record<string, unknown>;
}

export interface PriceMonitorItem {
  id: string;
  userId: string;
  name: string;
  url?: string;
  category: PriceMonitorCategory;
  currentPrice?: Money;
  threshold?: Money;
  targetPrice?: Money;
  alertOnIncrease?: boolean;
  alertOnDecrease?: boolean;
  percentageThreshold?: number;
  priceHistory: PricePoint[];
  checkInterval: number; // minutes
  lastChecked?: number;
  alertChannels: AlertChannel[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PriceAlert {
  id: string;
  itemId: string;
  userId: string;
  type: 'drop' | 'increase' | 'threshold_reached' | 'target_reached';
  previousPrice: Money;
  newPrice: Money;
  percentageChange: number;
  timestamp: number;
  acknowledged: boolean;
}

export interface PricePrediction {
  itemId: string;
  predictedPrice: Money;
  confidence: number;
  predictedDate: number;
  reasoning: string;
  recommendation: 'buy_now' | 'wait' | 'uncertain';
}

// =============================================================================
// Insurance Claim Handler Types
// =============================================================================

export type InsuranceType =
  | 'health'
  | 'auto'
  | 'home'
  | 'life'
  | 'disability'
  | 'travel'
  | 'pet'
  | 'other';

export type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'additional_info_needed'
  | 'approved'
  | 'partially_approved'
  | 'denied'
  | 'appealed'
  | 'paid'
  | 'closed';

export interface InsuranceProvider {
  id: string;
  name: string;
  type: InsuranceType;
  policyNumber: string;
  contactPhone?: string;
  contactEmail?: string;
  claimsPortalUrl?: string;
  notes?: string;
}

export interface ClaimDocument {
  id: string;
  type: 'receipt' | 'photo' | 'report' | 'form' | 'correspondence' | 'other';
  name: string;
  description?: string;
  filePath?: string;
  uploadedAt: number;
  required: boolean;
  obtained: boolean;
}

export interface InsuranceClaim {
  id: string;
  userId: string;
  provider: InsuranceProvider;
  type: InsuranceType;
  incidentDate: number;
  description: string;
  claimAmount: Money;
  approvedAmount?: Money;
  status: ClaimStatus;
  claimNumber?: string;
  documents: ClaimDocument[];
  communications: ClaimCommunication[];
  followUps: FollowUp[];
  submittedAt?: number;
  resolvedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ClaimCommunication {
  id: string;
  direction: 'inbound' | 'outbound';
  type: 'email' | 'phone' | 'letter' | 'portal';
  summary: string;
  content?: string;
  timestamp: number;
  representative?: string;
  actionRequired?: string;
}

export interface FollowUp {
  id: string;
  scheduledFor: number;
  reason: string;
  completed: boolean;
  completedAt?: number;
  notes?: string;
}

export interface AppealLetter {
  claimId: string;
  subject: string;
  body: string;
  keyArguments: string[];
  supportingDocuments: string[];
  generatedAt: number;
}

// =============================================================================
// Expense Tracker Types
// =============================================================================

export type ExpenseCategory =
  | 'food'
  | 'groceries'
  | 'transportation'
  | 'gas'
  | 'utilities'
  | 'housing'
  | 'healthcare'
  | 'entertainment'
  | 'shopping'
  | 'travel'
  | 'education'
  | 'personal'
  | 'business'
  | 'subscription'
  | 'other';

export interface Expense {
  id: string;
  userId: string;
  amount: Money;
  category: ExpenseCategory;
  subcategory?: string;
  description: string;
  merchant?: string;
  date: number;
  paymentMethod?: string;
  receiptId?: string;
  tags: string[];
  isRecurring: boolean;
  recurringId?: string;
  splitWith?: ExpenseSplit[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ExpenseSplit {
  userId: string;
  name: string;
  amount: Money;
  settled: boolean;
  settledAt?: number;
}

export interface RecurringExpense {
  id: string;
  userId: string;
  description: string;
  amount: Money;
  category: ExpenseCategory;
  merchant?: string;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  nextOccurrence: number;
  isActive: boolean;
  createdAt: number;
}

export interface Budget {
  id: string;
  userId: string;
  name: string;
  period: 'weekly' | 'monthly' | 'yearly';
  categories: Array<{
    category: ExpenseCategory;
    limit: Money;
    spent: Money;
  }>;
  totalLimit: Money;
  totalSpent: Money;
  startDate: number;
  endDate: number;
  createdAt: number;
}

export interface ExpenseSummary {
  period: DateRange;
  totalSpent: Money;
  byCategory: Record<ExpenseCategory, Money>;
  topMerchants: Array<{ merchant: string; total: Money }>;
  averagePerDay: Money;
  comparedToPrevious: {
    percentageChange: number;
    trend: 'up' | 'down' | 'stable';
  };
}

// =============================================================================
// Bill Reminder Types
// =============================================================================

export type BillFrequency =
  | 'one_time'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'annual';

export type BillStatus =
  | 'upcoming'
  | 'due_soon'
  | 'due_today'
  | 'overdue'
  | 'paid'
  | 'cancelled';

export interface Bill {
  id: string;
  userId: string;
  name: string;
  payee: string;
  amount: Money;
  dueDate: number;
  frequency: BillFrequency;
  category: ExpenseCategory;
  autoPay: boolean;
  autoPayDate?: number;
  accountNumber?: string;
  website?: string;
  notes?: string;
  reminderDays: number[];
  status: BillStatus;
  lastPaidDate?: number;
  lastPaidAmount?: Money;
  lateFee?: Money;
  createdAt: number;
  updatedAt: number;
}

export interface BillPayment {
  id: string;
  billId: string;
  userId: string;
  amount: Money;
  paidDate: number;
  confirmationNumber?: string;
  paymentMethod?: string;
  notes?: string;
}

export interface BillReminder {
  id: string;
  billId: string;
  userId: string;
  daysUntilDue: number;
  scheduledFor: number;
  sent: boolean;
  sentAt?: number;
  channel: AlertChannel;
}

export interface BillCalendar {
  month: number;
  year: number;
  bills: Array<{
    bill: Bill;
    dueDate: number;
    status: BillStatus;
    amount: Money;
  }>;
  totalDue: Money;
  paidCount: number;
  upcomingCount: number;
}

// =============================================================================
// Subscription Manager Types
// =============================================================================

export type SubscriptionCategory =
  | 'streaming'
  | 'software'
  | 'gaming'
  | 'news'
  | 'fitness'
  | 'food'
  | 'shopping'
  | 'finance'
  | 'productivity'
  | 'social'
  | 'education'
  | 'other';

export type SubscriptionPriority =
  | 'essential'
  | 'useful'
  | 'optional'
  | 'unused'
  | 'unknown';

export interface Subscription {
  id: string;
  userId: string;
  name: string;
  provider: string;
  amount: Money;
  frequency: BillFrequency;
  category: SubscriptionCategory;
  priority: SubscriptionPriority;
  startDate: number;
  nextBillingDate: number;
  cancellationUrl?: string;
  cancellationPhone?: string;
  cancellationInstructions?: string;
  lastUsed?: number;
  usageFrequency?: 'daily' | 'weekly' | 'monthly' | 'rarely' | 'never';
  notes?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SubscriptionDetection {
  merchantName: string;
  amount: Money;
  frequency: BillFrequency;
  lastCharge: number;
  chargeCount: number;
  confidence: number;
  suggestedCategory: SubscriptionCategory;
}

export interface SubscriptionROI {
  subscriptionId: string;
  monthlyAmount: Money;
  yearlyAmount: Money;
  usageScore: number; // 0-100
  valueScore: number; // 0-100
  recommendation: 'keep' | 'review' | 'cancel';
  reasoning: string;
  potentialSavings?: Money;
}

export interface CancellationAssistance {
  subscriptionId: string;
  steps: string[];
  phoneScript?: string;
  emailTemplate?: string;
  retentionOfferTips?: string[];
  expectedDifficulty: 'easy' | 'medium' | 'hard';
  estimatedTime: string;
}

export interface SubscriptionReport {
  userId: string;
  generatedAt: number;
  totalMonthly: Money;
  totalYearly: Money;
  subscriptionCount: number;
  byCategory: Record<SubscriptionCategory, { count: number; monthly: Money }>;
  byPriority: Record<SubscriptionPriority, { count: number; monthly: Money }>;
  recommendations: SubscriptionROI[];
  potentialMonthlySavings: Money;
  potentialYearlySavings: Money;
}

// =============================================================================
// Deal Finder Types
// =============================================================================

export type DealType =
  | 'price_drop'
  | 'coupon'
  | 'cashback'
  | 'bundle'
  | 'clearance'
  | 'flash_sale'
  | 'member_exclusive';

export interface WishlistItem {
  id: string;
  userId: string;
  name: string;
  url?: string;
  targetPrice?: Money;
  currentPrice?: Money;
  category?: string;
  priority: 'high' | 'medium' | 'low';
  notes?: string;
  addedAt: number;
}

export interface Deal {
  id: string;
  type: DealType;
  title: string;
  description: string;
  originalPrice?: Money;
  dealPrice: Money;
  savings: Money;
  savingsPercent: number;
  url: string;
  source: string;
  code?: string;
  expiresAt?: number;
  terms?: string;
  verified: boolean;
  score: number; // 0-100 relevance score
  matchedWishlistItems?: string[];
  foundAt: number;
}

export interface CouponCode {
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed' | 'free_shipping';
  discountValue: number;
  minimumPurchase?: Money;
  expiresAt?: number;
  merchant: string;
  verified: boolean;
  successRate?: number;
  lastVerified?: number;
}

export interface CashbackOffer {
  id: string;
  merchant: string;
  platform: string; // e.g., "Rakuten", "TopCashback"
  cashbackPercent: number;
  maxCashback?: Money;
  terms?: string;
  activationUrl: string;
  expiresAt?: number;
}

export interface DealAlert {
  id: string;
  userId: string;
  dealId: string;
  wishlistItemId?: string;
  alertedAt: number;
  channel: AlertChannel;
  clicked: boolean;
  purchased: boolean;
}

// =============================================================================
// Error Types
// =============================================================================

export class MoneyMakersError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MoneyMakersError';
  }
}

// =============================================================================
// Provider Interfaces
// =============================================================================

export interface EmailProvider {
  sendEmail(to: string, subject: string, body: string): Promise<string>;
  getInbox(query?: string): Promise<Array<{ id: string; from: string; subject: string; body: string }>>;
}

export interface SMSProvider {
  sendSMS(to: string, message: string): Promise<string>;
  receiveSMS(from: string, timeout?: number): Promise<string | null>;
}

export interface NotificationProvider {
  send(userId: string, channel: AlertChannel, title: string, body: string): Promise<void>;
}

export interface EncryptionProvider {
  encrypt(data: string): Promise<string>;
  decrypt(encryptedData: string): Promise<string>;
}

export interface PriceScraperProvider {
  scrapePrice(url: string): Promise<{ price: Money; available: boolean; metadata?: Record<string, unknown> }>;
  supportsUrl(url: string): boolean;
}

export interface OCRProvider {
  extractText(imagePath: string): Promise<string>;
  extractReceipt(imagePath: string): Promise<{
    merchant?: string;
    total?: Money;
    date?: number;
    items?: Array<{ name: string; price: Money }>;
  }>;
}
