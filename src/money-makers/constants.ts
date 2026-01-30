/**
 * Money Makers Constants
 *
 * Event names, defaults, and configuration constants
 */

import type {
  ExpenseCategory,
  SubscriptionCategory,
  NegotiationType,
  BillFrequency,
} from './types.js';

// =============================================================================
// Event Names
// =============================================================================

export const MONEY_MAKERS_EVENTS = {
  // Auto-Negotiator Events
  NEGOTIATION_STARTED: 'money-makers:negotiation:started',
  NEGOTIATION_MESSAGE_SENT: 'money-makers:negotiation:message-sent',
  NEGOTIATION_RESPONSE_RECEIVED: 'money-makers:negotiation:response-received',
  NEGOTIATION_COUNTER_OFFER: 'money-makers:negotiation:counter-offer',
  NEGOTIATION_COMPLETED: 'money-makers:negotiation:completed',
  NEGOTIATION_CANCELLED: 'money-makers:negotiation:cancelled',

  // Shopping Automation Events
  SHOPPING_LIST_CREATED: 'money-makers:shopping:list-created',
  SHOPPING_ORDER_STARTED: 'money-makers:shopping:order-started',
  SHOPPING_2FA_REQUIRED: 'money-makers:shopping:2fa-required',
  SHOPPING_ORDER_CONFIRMED: 'money-makers:shopping:order-confirmed',
  SHOPPING_ORDER_SHIPPED: 'money-makers:shopping:order-shipped',
  SHOPPING_ORDER_DELIVERED: 'money-makers:shopping:order-delivered',

  // Price Monitor Events
  PRICE_CHECK_COMPLETED: 'money-makers:price:check-completed',
  PRICE_DROP_DETECTED: 'money-makers:price:drop-detected',
  PRICE_INCREASE_DETECTED: 'money-makers:price:increase-detected',
  PRICE_THRESHOLD_REACHED: 'money-makers:price:threshold-reached',
  PRICE_TARGET_REACHED: 'money-makers:price:target-reached',

  // Insurance Claim Events
  CLAIM_CREATED: 'money-makers:claim:created',
  CLAIM_SUBMITTED: 'money-makers:claim:submitted',
  CLAIM_STATUS_CHANGED: 'money-makers:claim:status-changed',
  CLAIM_DOCUMENT_NEEDED: 'money-makers:claim:document-needed',
  CLAIM_FOLLOW_UP_DUE: 'money-makers:claim:follow-up-due',
  CLAIM_APPROVED: 'money-makers:claim:approved',
  CLAIM_DENIED: 'money-makers:claim:denied',

  // Expense Tracker Events
  EXPENSE_LOGGED: 'money-makers:expense:logged',
  EXPENSE_CATEGORIZED: 'money-makers:expense:categorized',
  BUDGET_WARNING: 'money-makers:expense:budget-warning',
  BUDGET_EXCEEDED: 'money-makers:expense:budget-exceeded',
  RECURRING_EXPENSE_DETECTED: 'money-makers:expense:recurring-detected',

  // Bill Reminder Events
  BILL_CREATED: 'money-makers:bill:created',
  BILL_REMINDER_SENT: 'money-makers:bill:reminder-sent',
  BILL_DUE_SOON: 'money-makers:bill:due-soon',
  BILL_DUE_TODAY: 'money-makers:bill:due-today',
  BILL_OVERDUE: 'money-makers:bill:overdue',
  BILL_PAID: 'money-makers:bill:paid',

  // Subscription Manager Events
  SUBSCRIPTION_DETECTED: 'money-makers:subscription:detected',
  SUBSCRIPTION_ADDED: 'money-makers:subscription:added',
  SUBSCRIPTION_CANCELLED: 'money-makers:subscription:cancelled',
  SUBSCRIPTION_REPORT_GENERATED: 'money-makers:subscription:report-generated',
  SAVINGS_OPPORTUNITY: 'money-makers:subscription:savings-opportunity',

  // Deal Finder Events
  DEAL_FOUND: 'money-makers:deal:found',
  WISHLIST_MATCH: 'money-makers:deal:wishlist-match',
  COUPON_FOUND: 'money-makers:deal:coupon-found',
  CASHBACK_OPPORTUNITY: 'money-makers:deal:cashback-opportunity',
} as const;

// =============================================================================
// Negotiation Constants
// =============================================================================

export const NEGOTIATION_STRATEGIES: Record<string, {
  initialDiscount: number;
  counterStep: number;
  maxRounds: number;
  toneLevel: 'friendly' | 'professional' | 'firm';
}> = {
  aggressive: {
    initialDiscount: 0.25,
    counterStep: 0.05,
    maxRounds: 5,
    toneLevel: 'firm',
  },
  moderate: {
    initialDiscount: 0.15,
    counterStep: 0.03,
    maxRounds: 4,
    toneLevel: 'professional',
  },
  conservative: {
    initialDiscount: 0.10,
    counterStep: 0.02,
    maxRounds: 3,
    toneLevel: 'friendly',
  },
  walk_away_ready: {
    initialDiscount: 0.30,
    counterStep: 0.10,
    maxRounds: 3,
    toneLevel: 'firm',
  },
  time_pressure: {
    initialDiscount: 0.20,
    counterStep: 0.05,
    maxRounds: 2,
    toneLevel: 'professional',
  },
};

export const NEGOTIATION_TYPE_TIPS: Record<NegotiationType, string[]> = {
  car_purchase: [
    'Research invoice price vs MSRP',
    'Get quotes from multiple dealers',
    'Consider end-of-month timing',
    'Ask about dealer incentives',
    'Negotiate price before trade-in',
  ],
  car_lease: [
    'Negotiate the capitalized cost',
    'Ask about money factor',
    'Look for lease specials',
    'Negotiate disposition fee waiver',
  ],
  service_contract: [
    'Request competitive bids',
    'Ask for volume discounts',
    'Negotiate payment terms',
    'Include performance clauses',
  ],
  salary: [
    'Research market rates',
    'Consider total compensation',
    'Time the ask strategically',
    'Have alternative offers ready',
  ],
  rent: [
    'Research comparable rentals',
    'Offer longer lease for discount',
    'Ask about move-in specials',
    'Negotiate amenities included',
  ],
  insurance: [
    'Bundle policies for discounts',
    'Ask about loyalty discounts',
    'Increase deductible to lower premium',
    'Shop quotes annually',
  ],
  vendor_contract: [
    'Request volume pricing',
    'Negotiate payment terms',
    'Ask for early payment discounts',
    'Include SLA guarantees',
  ],
  custom: [
    'Research market rates',
    'Be prepared to walk away',
    'Start lower than target',
    'Get everything in writing',
  ],
};

// =============================================================================
// Expense Categories
// =============================================================================

export const EXPENSE_CATEGORY_KEYWORDS: Record<ExpenseCategory, string[]> = {
  food: ['restaurant', 'dining', 'food', 'eat', 'lunch', 'dinner', 'breakfast', 'cafe', 'coffee'],
  groceries: ['grocery', 'supermarket', 'costco', 'walmart', 'safeway', 'kroger', 'whole foods', 'trader joe'],
  transportation: ['uber', 'lyft', 'taxi', 'bus', 'train', 'metro', 'parking', 'toll'],
  gas: ['gas', 'fuel', 'shell', 'chevron', 'exxon', 'bp', 'mobil', 'gas station'],
  utilities: ['electric', 'water', 'gas bill', 'internet', 'phone', 'utility', 'pge', 'comcast'],
  housing: ['rent', 'mortgage', 'hoa', 'maintenance', 'repair', 'home'],
  healthcare: ['doctor', 'hospital', 'pharmacy', 'cvs', 'walgreens', 'medical', 'dental', 'vision'],
  entertainment: ['movie', 'concert', 'theater', 'netflix', 'spotify', 'game', 'entertainment'],
  shopping: ['amazon', 'target', 'mall', 'clothing', 'shoes', 'electronics'],
  travel: ['hotel', 'airbnb', 'flight', 'airline', 'vacation', 'trip'],
  education: ['tuition', 'school', 'course', 'book', 'training', 'udemy', 'coursera'],
  personal: ['haircut', 'salon', 'spa', 'gym', 'fitness'],
  business: ['office', 'supplies', 'equipment', 'software', 'business'],
  subscription: ['subscription', 'membership', 'premium', 'plus', 'pro'],
  other: [],
};

export const EXPENSE_CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  food: '🍔',
  groceries: '🛒',
  transportation: '🚗',
  gas: '⛽',
  utilities: '💡',
  housing: '🏠',
  healthcare: '🏥',
  entertainment: '🎬',
  shopping: '🛍️',
  travel: '✈️',
  education: '📚',
  personal: '💇',
  business: '💼',
  subscription: '📱',
  other: '📋',
};

// =============================================================================
// Subscription Constants
// =============================================================================

export const SUBSCRIPTION_PATTERNS: Array<{
  pattern: RegExp;
  category: SubscriptionCategory;
  name: string;
}> = [
  { pattern: /netflix/i, category: 'streaming', name: 'Netflix' },
  { pattern: /spotify/i, category: 'streaming', name: 'Spotify' },
  { pattern: /disney\+|disneyplus/i, category: 'streaming', name: 'Disney+' },
  { pattern: /hulu/i, category: 'streaming', name: 'Hulu' },
  { pattern: /hbo\s?max/i, category: 'streaming', name: 'HBO Max' },
  { pattern: /amazon\s?prime/i, category: 'shopping', name: 'Amazon Prime' },
  { pattern: /apple\s?(music|tv|one|arcade)/i, category: 'streaming', name: 'Apple Services' },
  { pattern: /youtube\s?(premium|music)/i, category: 'streaming', name: 'YouTube Premium' },
  { pattern: /microsoft\s?365|office\s?365/i, category: 'software', name: 'Microsoft 365' },
  { pattern: /adobe/i, category: 'software', name: 'Adobe Creative Cloud' },
  { pattern: /dropbox/i, category: 'software', name: 'Dropbox' },
  { pattern: /icloud/i, category: 'software', name: 'iCloud' },
  { pattern: /google\s?(one|drive|workspace)/i, category: 'software', name: 'Google Services' },
  { pattern: /gym|fitness|planet\s?fitness|la\s?fitness|equinox/i, category: 'fitness', name: 'Gym Membership' },
  { pattern: /peloton/i, category: 'fitness', name: 'Peloton' },
  { pattern: /nytimes|new\s?york\s?times/i, category: 'news', name: 'NY Times' },
  { pattern: /wall\s?street\s?journal|wsj/i, category: 'news', name: 'WSJ' },
  { pattern: /washington\s?post/i, category: 'news', name: 'Washington Post' },
  { pattern: /xbox|playstation|nintendo/i, category: 'gaming', name: 'Gaming Service' },
  { pattern: /doordash\s?dash\s?pass/i, category: 'food', name: 'DoorDash DashPass' },
  { pattern: /uber\s?one|uber\s?eats\s?pass/i, category: 'food', name: 'Uber One' },
  { pattern: /instacart/i, category: 'food', name: 'Instacart+' },
  { pattern: /linkedin\s?premium/i, category: 'social', name: 'LinkedIn Premium' },
  { pattern: /coursera|udemy|skillshare/i, category: 'education', name: 'Online Learning' },
];

export const CANCELLATION_DIFFICULTY: Record<string, 'easy' | 'medium' | 'hard'> = {
  'Netflix': 'easy',
  'Spotify': 'easy',
  'Disney+': 'easy',
  'Hulu': 'easy',
  'Amazon Prime': 'medium',
  'Adobe Creative Cloud': 'hard',
  'Gym Membership': 'hard',
  'NY Times': 'medium',
  'Sirius XM': 'hard',
  'Planet Fitness': 'hard',
};

// =============================================================================
// Bill Reminder Constants
// =============================================================================

export const DEFAULT_REMINDER_DAYS = [7, 3, 1, 0];

export const BILL_FREQUENCY_DAYS: Record<BillFrequency, number> = {
  one_time: 0,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 90,
  semi_annual: 180,
  annual: 365,
};

export const LATE_FEE_ESTIMATES: Record<string, { percentage: number; flat: number; gracePeriod: number }> = {
  credit_card: { percentage: 0, flat: 35, gracePeriod: 0 },
  mortgage: { percentage: 0.05, flat: 0, gracePeriod: 15 },
  rent: { percentage: 0.05, flat: 50, gracePeriod: 5 },
  utilities: { percentage: 0, flat: 10, gracePeriod: 10 },
  insurance: { percentage: 0, flat: 25, gracePeriod: 30 },
};

// =============================================================================
// Price Monitor Constants
// =============================================================================

export const PRICE_CHECK_INTERVALS = {
  realtime: 5,      // 5 minutes
  frequent: 60,     // 1 hour
  standard: 360,    // 6 hours
  daily: 1440,      // 24 hours
  weekly: 10080,    // 7 days
} as const;

export const PRICE_CHANGE_THRESHOLDS = {
  significant: 0.10,  // 10%
  moderate: 0.05,     // 5%
  minor: 0.02,        // 2%
} as const;

// =============================================================================
// Shopping Automation Constants
// =============================================================================

export const STORE_CONFIGS: Record<string, {
  name: string;
  domain: string;
  supports2FA: boolean;
  checkoutTimeout: number;
}> = {
  amazon: {
    name: 'Amazon',
    domain: 'amazon.com',
    supports2FA: true,
    checkoutTimeout: 300000,
  },
  walmart: {
    name: 'Walmart',
    domain: 'walmart.com',
    supports2FA: true,
    checkoutTimeout: 300000,
  },
  target: {
    name: 'Target',
    domain: 'target.com',
    supports2FA: true,
    checkoutTimeout: 300000,
  },
  costco: {
    name: 'Costco',
    domain: 'costco.com',
    supports2FA: false,
    checkoutTimeout: 300000,
  },
  grocery: {
    name: 'Grocery Store',
    domain: '',
    supports2FA: false,
    checkoutTimeout: 600000,
  },
  pharmacy: {
    name: 'Pharmacy',
    domain: '',
    supports2FA: true,
    checkoutTimeout: 300000,
  },
  custom: {
    name: 'Custom Store',
    domain: '',
    supports2FA: false,
    checkoutTimeout: 300000,
  },
};

export const TWO_FACTOR_TIMEOUT = 120000; // 2 minutes

// =============================================================================
// Deal Finder Constants
// =============================================================================

export const DEAL_SCORE_WEIGHTS = {
  savingsPercent: 0.3,
  relevance: 0.25,
  expiringSoon: 0.15,
  verified: 0.15,
  wishlistMatch: 0.15,
} as const;

export const COUPON_SOURCES = [
  'RetailMeNot',
  'Honey',
  'Rakuten',
  'Slickdeals',
  'CouponCabin',
  'Brad\'s Deals',
] as const;

export const CASHBACK_PLATFORMS = [
  'Rakuten',
  'TopCashback',
  'Ibotta',
  'Dosh',
  'Capital One Shopping',
] as const;

// =============================================================================
// Security Constants
// =============================================================================

export const PII_PATTERNS = {
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  bankAccount: /\b\d{8,17}\b/g,
  routingNumber: /\b\d{9}\b/g,
};

export const REDACTION_PLACEHOLDER = '[REDACTED]';

// =============================================================================
// Helper Functions
// =============================================================================

export function getNextBillingDate(lastDate: number, frequency: BillFrequency): number {
  const days = BILL_FREQUENCY_DAYS[frequency];
  if (days === 0) return lastDate;
  return lastDate + days * 24 * 60 * 60 * 1000;
}

export function calculateLateFee(
  amount: number,
  daysLate: number,
  billType: string
): number {
  const config = LATE_FEE_ESTIMATES[billType] ?? LATE_FEE_ESTIMATES.utilities;

  if (daysLate <= config.gracePeriod) return 0;

  const percentageFee = amount * config.percentage;
  return Math.max(percentageFee, config.flat);
}

export function formatMoney(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function redactPII(text: string): string {
  let redacted = text;
  for (const pattern of Object.values(PII_PATTERNS)) {
    redacted = redacted.replace(pattern, REDACTION_PLACEHOLDER);
  }
  return redacted;
}

export function categorizeExpense(description: string): ExpenseCategory {
  const lower = description.toLowerCase();

  for (const [category, keywords] of Object.entries(EXPENSE_CATEGORY_KEYWORDS)) {
    if (keywords.some(keyword => lower.includes(keyword))) {
      return category as ExpenseCategory;
    }
  }

  return 'other';
}

export function detectSubscription(
  merchantName: string
): { name: string; category: SubscriptionCategory } | null {
  for (const { pattern, category, name } of SUBSCRIPTION_PATTERNS) {
    if (pattern.test(merchantName)) {
      return { name, category };
    }
  }
  return null;
}

export function calculateSavingsPercent(original: number, sale: number): number {
  if (original <= 0) return 0;
  return Math.round(((original - sale) / original) * 100);
}

export function generateDealScore(params: {
  savingsPercent: number;
  relevance: number;
  expiresIn?: number;
  verified: boolean;
  matchesWishlist: boolean;
}): number {
  let score = 0;

  score += Math.min(params.savingsPercent, 100) * DEAL_SCORE_WEIGHTS.savingsPercent;
  score += params.relevance * DEAL_SCORE_WEIGHTS.relevance;

  if (params.expiresIn !== undefined && params.expiresIn < 24 * 60 * 60 * 1000) {
    score += 100 * DEAL_SCORE_WEIGHTS.expiringSoon;
  }

  if (params.verified) {
    score += 100 * DEAL_SCORE_WEIGHTS.verified;
  }

  if (params.matchesWishlist) {
    score += 100 * DEAL_SCORE_WEIGHTS.wishlistMatch;
  }

  return Math.round(Math.min(100, score));
}
