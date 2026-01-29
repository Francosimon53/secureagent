/**
 * Subscription Detector
 *
 * Detects subscriptions from transaction patterns.
 */

import type {
  DetectedSubscription,
  SubscriptionFrequency,
  SubscriptionCategory,
  TransactionMatch,
} from '../types.js';

/**
 * Transaction for detection
 */
export interface Transaction {
  id: string;
  amount: number;
  merchant: string;
  description: string;
  date: number;
  category?: string;
}

/**
 * Transaction pattern for detection
 */
export interface TransactionPattern {
  merchant: string;
  normalizedMerchant: string;
  transactions: Transaction[];
  averageAmount: number;
  amountVariance: number;
  averageIntervalDays: number;
  intervalVariance: number;
  frequency: SubscriptionFrequency | null;
  confidence: number;
}

/**
 * Known subscription providers for better detection
 */
const KNOWN_PROVIDERS: Map<string, { name: string; category: SubscriptionCategory }> = new Map([
  ['netflix', { name: 'Netflix', category: 'streaming' }],
  ['spotify', { name: 'Spotify', category: 'music' }],
  ['hulu', { name: 'Hulu', category: 'streaming' }],
  ['disney', { name: 'Disney+', category: 'streaming' }],
  ['hbo', { name: 'HBO Max', category: 'streaming' }],
  ['amazon prime', { name: 'Amazon Prime', category: 'streaming' }],
  ['apple music', { name: 'Apple Music', category: 'music' }],
  ['youtube', { name: 'YouTube Premium', category: 'streaming' }],
  ['dropbox', { name: 'Dropbox', category: 'cloud-storage' }],
  ['icloud', { name: 'iCloud', category: 'cloud-storage' }],
  ['google one', { name: 'Google One', category: 'cloud-storage' }],
  ['microsoft', { name: 'Microsoft 365', category: 'software' }],
  ['adobe', { name: 'Adobe Creative Cloud', category: 'software' }],
  ['github', { name: 'GitHub', category: 'software' }],
  ['slack', { name: 'Slack', category: 'productivity' }],
  ['zoom', { name: 'Zoom', category: 'productivity' }],
  ['notion', { name: 'Notion', category: 'productivity' }],
  ['gym', { name: 'Gym Membership', category: 'fitness' }],
  ['planet fitness', { name: 'Planet Fitness', category: 'fitness' }],
  ['peloton', { name: 'Peloton', category: 'fitness' }],
  ['nyt', { name: 'New York Times', category: 'news' }],
  ['wsj', { name: 'Wall Street Journal', category: 'news' }],
  ['washington post', { name: 'Washington Post', category: 'news' }],
  ['doordash', { name: 'DoorDash', category: 'food-delivery' }],
  ['uber eats', { name: 'Uber Eats', category: 'food-delivery' }],
  ['grubhub', { name: 'Grubhub', category: 'food-delivery' }],
  ['xbox', { name: 'Xbox Game Pass', category: 'gaming' }],
  ['playstation', { name: 'PlayStation Plus', category: 'gaming' }],
  ['nintendo', { name: 'Nintendo Online', category: 'gaming' }],
]);

/**
 * Subscription detector class
 */
export class SubscriptionDetector {
  private readonly confidenceThreshold: number;
  private readonly minTransactions: number;

  constructor(options?: { confidenceThreshold?: number; minTransactions?: number }) {
    this.confidenceThreshold = options?.confidenceThreshold ?? 0.7;
    this.minTransactions = options?.minTransactions ?? 2;
  }

  /**
   * Detect subscriptions from a list of transactions
   */
  detect(transactions: Transaction[]): DetectedSubscription[] {
    // Group transactions by normalized merchant
    const patterns = this.groupByMerchant(transactions);

    // Analyze each pattern
    const detected: DetectedSubscription[] = [];

    for (const pattern of patterns) {
      if (pattern.confidence >= this.confidenceThreshold && pattern.frequency) {
        const known = this.lookupKnownProvider(pattern.normalizedMerchant);

        detected.push({
          name: known?.name ?? this.formatMerchantName(pattern.merchant),
          provider: pattern.merchant,
          amount: pattern.averageAmount,
          frequency: pattern.frequency,
          confidence: pattern.confidence,
          transactions: pattern.transactions.map(t => ({
            id: t.id,
            amount: t.amount,
            date: t.date,
            description: t.description,
          })),
          suggestedCategory: known?.category ?? this.guessCategory(pattern),
        });
      }
    }

    // Sort by confidence
    detected.sort((a, b) => b.confidence - a.confidence);

    return detected;
  }

  /**
   * Group transactions by merchant
   */
  private groupByMerchant(transactions: Transaction[]): TransactionPattern[] {
    const groups = new Map<string, Transaction[]>();

    for (const tx of transactions) {
      const normalized = this.normalizeMerchant(tx.merchant);
      if (!groups.has(normalized)) {
        groups.set(normalized, []);
      }
      groups.get(normalized)!.push(tx);
    }

    const patterns: TransactionPattern[] = [];

    for (const [normalized, txs] of groups) {
      if (txs.length < this.minTransactions) {
        continue;
      }

      // Sort by date
      txs.sort((a, b) => a.date - b.date);

      const pattern = this.analyzePattern(txs, normalized);
      if (pattern) {
        patterns.push(pattern);
      }
    }

    return patterns;
  }

  /**
   * Analyze transaction pattern
   */
  private analyzePattern(transactions: Transaction[], normalizedMerchant: string): TransactionPattern | null {
    if (transactions.length < this.minTransactions) {
      return null;
    }

    // Calculate average amount and variance
    const amounts = transactions.map(t => t.amount);
    const averageAmount = this.average(amounts);
    const amountVariance = this.variance(amounts);

    // Calculate intervals between transactions
    const intervals: number[] = [];
    for (let i = 1; i < transactions.length; i++) {
      const daysBetween = (transactions[i].date - transactions[i - 1].date) / (24 * 60 * 60 * 1000);
      intervals.push(daysBetween);
    }

    if (intervals.length === 0) {
      return null;
    }

    const averageIntervalDays = this.average(intervals);
    const intervalVariance = this.variance(intervals);

    // Determine frequency
    const frequency = this.determineFrequency(averageIntervalDays, intervalVariance);

    // Calculate confidence
    const confidence = this.calculateConfidence(
      transactions.length,
      amountVariance,
      intervalVariance,
      averageAmount,
      frequency
    );

    return {
      merchant: transactions[0].merchant,
      normalizedMerchant,
      transactions,
      averageAmount: Math.round(averageAmount * 100) / 100,
      amountVariance,
      averageIntervalDays,
      intervalVariance,
      frequency,
      confidence,
    };
  }

  /**
   * Determine subscription frequency from interval
   */
  private determineFrequency(avgDays: number, variance: number): SubscriptionFrequency | null {
    // High variance means irregular payments - not a subscription
    if (variance > 15) {
      return null;
    }

    if (avgDays >= 5 && avgDays <= 9) {
      return 'weekly';
    }
    if (avgDays >= 26 && avgDays <= 35) {
      return 'monthly';
    }
    if (avgDays >= 85 && avgDays <= 95) {
      return 'quarterly';
    }
    if (avgDays >= 355 && avgDays <= 375) {
      return 'annually';
    }

    return null;
  }

  /**
   * Calculate detection confidence
   */
  private calculateConfidence(
    transactionCount: number,
    amountVariance: number,
    intervalVariance: number,
    averageAmount: number,
    frequency: SubscriptionFrequency | null
  ): number {
    let confidence = 0.5;

    // More transactions = higher confidence
    if (transactionCount >= 6) {
      confidence += 0.2;
    } else if (transactionCount >= 4) {
      confidence += 0.15;
    } else if (transactionCount >= 3) {
      confidence += 0.1;
    }

    // Low amount variance = higher confidence
    const amountCV = averageAmount > 0 ? Math.sqrt(amountVariance) / averageAmount : 1;
    if (amountCV < 0.01) {
      confidence += 0.2; // Exact same amount each time
    } else if (amountCV < 0.05) {
      confidence += 0.15;
    } else if (amountCV < 0.1) {
      confidence += 0.1;
    }

    // Low interval variance = higher confidence
    if (intervalVariance < 2) {
      confidence += 0.15;
    } else if (intervalVariance < 5) {
      confidence += 0.1;
    } else if (intervalVariance < 10) {
      confidence += 0.05;
    }

    // Valid frequency detected
    if (frequency) {
      confidence += 0.1;
    }

    return Math.min(confidence, 0.95);
  }

  /**
   * Normalize merchant name for grouping
   */
  private normalizeMerchant(merchant: string): string {
    return merchant
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 2) // Take first two words only
      .join(' ');
  }

  /**
   * Format merchant name for display
   */
  private formatMerchantName(merchant: string): string {
    return merchant
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Look up known provider
   */
  private lookupKnownProvider(normalizedMerchant: string): { name: string; category: SubscriptionCategory } | null {
    for (const [key, value] of KNOWN_PROVIDERS) {
      if (normalizedMerchant.includes(key)) {
        return value;
      }
    }
    return null;
  }

  /**
   * Guess category from pattern
   */
  private guessCategory(pattern: TransactionPattern): SubscriptionCategory {
    const merchant = pattern.normalizedMerchant;

    // Try to guess based on keywords
    if (/stream|video|tv|movie|film/.test(merchant)) return 'streaming';
    if (/music|audio|sound/.test(merchant)) return 'music';
    if (/cloud|storage|backup/.test(merchant)) return 'cloud-storage';
    if (/software|app|tool/.test(merchant)) return 'software';
    if (/gym|fitness|health|workout/.test(merchant)) return 'fitness';
    if (/news|paper|journal|magazine/.test(merchant)) return 'news';
    if (/game|gaming|xbox|playstation/.test(merchant)) return 'gaming';
    if (/food|delivery|eat|meal/.test(merchant)) return 'food-delivery';

    return 'other';
  }

  /**
   * Calculate average
   */
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate variance
   */
  private variance(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = this.average(values);
    const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
    return this.average(squaredDiffs);
  }

  /**
   * Validate a detected subscription against new transactions
   */
  validateDetection(
    detected: DetectedSubscription,
    newTransactions: Transaction[]
  ): { isValid: boolean; updatedConfidence: number; reason: string } {
    // Find matching transactions
    const normalizedProvider = this.normalizeMerchant(detected.provider);
    const matching = newTransactions.filter(tx =>
      this.normalizeMerchant(tx.merchant) === normalizedProvider
    );

    if (matching.length === 0) {
      return {
        isValid: true,
        updatedConfidence: detected.confidence * 0.95, // Slight decrease
        reason: 'No new matching transactions',
      };
    }

    // Check if amounts match
    const amounts = matching.map(t => t.amount);
    const avgAmount = this.average(amounts);
    const amountDiff = Math.abs(avgAmount - detected.amount) / detected.amount;

    if (amountDiff > 0.2) {
      return {
        isValid: false,
        updatedConfidence: detected.confidence * 0.5,
        reason: `Amount changed significantly (${detected.amount} -> ${avgAmount})`,
      };
    }

    // Check if frequency still matches
    if (matching.length >= 2) {
      const intervals: number[] = [];
      const allTx = [...detected.transactions, ...matching].sort((a, b) => a.date - b.date);

      for (let i = 1; i < allTx.length; i++) {
        intervals.push((allTx[i].date - allTx[i - 1].date) / (24 * 60 * 60 * 1000));
      }

      const avgInterval = this.average(intervals);
      const newFreq = this.determineFrequency(avgInterval, this.variance(intervals));

      if (newFreq !== detected.frequency) {
        return {
          isValid: false,
          updatedConfidence: detected.confidence * 0.6,
          reason: `Frequency appears to have changed`,
        };
      }
    }

    return {
      isValid: true,
      updatedConfidence: Math.min(detected.confidence * 1.05, 0.95),
      reason: 'Pattern continues to match',
    };
  }
}
