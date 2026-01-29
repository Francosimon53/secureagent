/**
 * Banking Providers
 *
 * Providers for banking integrations (Plaid, bank APIs).
 */

import { BaseSavingsProvider, SavingsProviderError } from './base.js';

/**
 * Bank account information
 */
export interface BankAccount {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'loan' | 'investment' | 'other';
  subtype?: string;
  mask: string; // Last 4 digits
  institution: string;
  institutionId?: string;
  currentBalance?: number;
  availableBalance?: number;
  currency: string;
}

/**
 * Bank transaction
 */
export interface BankTransaction {
  id: string;
  accountId: string;
  amount: number;
  date: number;
  name: string;
  merchantName?: string;
  category?: string[];
  pending: boolean;
  type: 'debit' | 'credit';
}

/**
 * Institution information
 */
export interface Institution {
  id: string;
  name: string;
  logo?: string;
  primaryColor?: string;
  url?: string;
  supportsTransactions: boolean;
  supportsBalance: boolean;
}

/**
 * Link token response
 */
export interface LinkTokenResponse {
  linkToken: string;
  expiresAt: number;
}

/**
 * Public token exchange response
 */
export interface AccessTokenResponse {
  accessToken: string;
  itemId: string;
}

/**
 * Banking provider interface
 */
export interface BankingProvider {
  readonly name: string;
  readonly version: string;

  // Link management
  createLinkToken(userId: string, options?: LinkOptions): Promise<LinkTokenResponse>;
  exchangePublicToken(publicToken: string): Promise<AccessTokenResponse>;
  invalidateAccessToken(accessToken: string): Promise<boolean>;

  // Account operations
  getAccounts(accessToken: string): Promise<BankAccount[]>;
  getAccount(accessToken: string, accountId: string): Promise<BankAccount | null>;

  // Transaction operations
  getTransactions(accessToken: string, options: TransactionOptions): Promise<BankTransaction[]>;

  // Institution operations
  getInstitution(institutionId: string): Promise<Institution | null>;
  searchInstitutions(query: string): Promise<Institution[]>;
}

/**
 * Link options
 */
export interface LinkOptions {
  products?: ('transactions' | 'auth' | 'identity' | 'balance' | 'investments')[];
  countryCodes?: string[];
  language?: string;
  linkCustomizationName?: string;
}

/**
 * Transaction fetch options
 */
export interface TransactionOptions {
  accountIds?: string[];
  startDate: number;
  endDate: number;
  count?: number;
  offset?: number;
}

/**
 * Plaid banking provider
 *
 * Note: This is a mock implementation. In production, you would use
 * the official Plaid SDK and API.
 */
export class PlaidBankingProvider extends BaseSavingsProvider implements BankingProvider {
  readonly name = 'plaid';
  readonly version = '1.0.0';

  private clientId?: string;
  private secret?: string;
  private environment: 'sandbox' | 'development' | 'production' = 'sandbox';

  get type(): string {
    return 'banking';
  }

  constructor(config?: {
    clientId?: string;
    secret?: string;
    environment?: 'sandbox' | 'development' | 'production';
  }) {
    super({ name: 'plaid' });
    this.clientId = config?.clientId;
    this.secret = config?.secret;
    this.environment = config?.environment ?? 'sandbox';
  }

  private getBaseUrl(): string {
    switch (this.environment) {
      case 'production':
        return 'https://production.plaid.com';
      case 'development':
        return 'https://development.plaid.com';
      default:
        return 'https://sandbox.plaid.com';
    }
  }

  async createLinkToken(userId: string, options?: LinkOptions): Promise<LinkTokenResponse> {
    if (!this.clientId || !this.secret) {
      throw new SavingsProviderError('Plaid credentials not configured', 'plaid');
    }

    // In production, this would call Plaid's /link/token/create endpoint
    // For now, return a mock response
    return {
      linkToken: `link-${this.environment}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
    };
  }

  async exchangePublicToken(publicToken: string): Promise<AccessTokenResponse> {
    if (!this.clientId || !this.secret) {
      throw new SavingsProviderError('Plaid credentials not configured', 'plaid');
    }

    // In production, this would call Plaid's /item/public_token/exchange endpoint
    return {
      accessToken: `access-${this.environment}-${Date.now()}`,
      itemId: `item-${Date.now()}`,
    };
  }

  async invalidateAccessToken(accessToken: string): Promise<boolean> {
    if (!this.clientId || !this.secret) {
      throw new SavingsProviderError('Plaid credentials not configured', 'plaid');
    }

    // In production, this would call Plaid's /item/access_token/invalidate endpoint
    return true;
  }

  async getAccounts(accessToken: string): Promise<BankAccount[]> {
    if (!this.clientId || !this.secret) {
      throw new SavingsProviderError('Plaid credentials not configured', 'plaid');
    }

    // In production, this would call Plaid's /accounts/get endpoint
    // Return mock data for demonstration
    return [
      {
        id: 'acc-checking-1',
        name: 'Checking Account',
        type: 'checking',
        mask: '1234',
        institution: 'Sample Bank',
        currentBalance: 2500.00,
        availableBalance: 2400.00,
        currency: 'USD',
      },
      {
        id: 'acc-savings-1',
        name: 'Savings Account',
        type: 'savings',
        mask: '5678',
        institution: 'Sample Bank',
        currentBalance: 10000.00,
        availableBalance: 10000.00,
        currency: 'USD',
      },
    ];
  }

  async getAccount(accessToken: string, accountId: string): Promise<BankAccount | null> {
    const accounts = await this.getAccounts(accessToken);
    return accounts.find(a => a.id === accountId) ?? null;
  }

  async getTransactions(
    accessToken: string,
    options: TransactionOptions
  ): Promise<BankTransaction[]> {
    if (!this.clientId || !this.secret) {
      throw new SavingsProviderError('Plaid credentials not configured', 'plaid');
    }

    // In production, this would call Plaid's /transactions/get endpoint
    // Return mock data for demonstration
    return [
      {
        id: 'txn-1',
        accountId: 'acc-checking-1',
        amount: -15.99,
        date: Date.now() - 2 * 24 * 60 * 60 * 1000,
        name: 'Netflix',
        merchantName: 'Netflix',
        category: ['Entertainment', 'Streaming'],
        pending: false,
        type: 'debit',
      },
      {
        id: 'txn-2',
        accountId: 'acc-checking-1',
        amount: -9.99,
        date: Date.now() - 5 * 24 * 60 * 60 * 1000,
        name: 'Spotify',
        merchantName: 'Spotify',
        category: ['Entertainment', 'Music'],
        pending: false,
        type: 'debit',
      },
    ];
  }

  async getInstitution(institutionId: string): Promise<Institution | null> {
    // In production, this would call Plaid's /institutions/get_by_id endpoint
    return {
      id: institutionId,
      name: 'Sample Bank',
      supportsTransactions: true,
      supportsBalance: true,
    };
  }

  async searchInstitutions(query: string): Promise<Institution[]> {
    // In production, this would call Plaid's /institutions/search endpoint
    return [
      {
        id: 'ins-sample-1',
        name: 'Sample Bank',
        supportsTransactions: true,
        supportsBalance: true,
      },
      {
        id: 'ins-sample-2',
        name: 'Sample Credit Union',
        supportsTransactions: true,
        supportsBalance: true,
      },
    ];
  }
}

/**
 * Transaction analyzer for detecting patterns
 */
export class TransactionAnalyzer {
  /**
   * Detect recurring transactions (potential subscriptions)
   */
  detectRecurring(transactions: BankTransaction[]): Array<{
    merchant: string;
    amount: number;
    frequency: 'weekly' | 'monthly' | 'quarterly' | 'annually';
    confidence: number;
    transactions: BankTransaction[];
  }> {
    // Group by merchant
    const byMerchant = new Map<string, BankTransaction[]>();

    for (const tx of transactions) {
      const key = tx.merchantName?.toLowerCase() ?? tx.name.toLowerCase();
      const existing = byMerchant.get(key) ?? [];
      existing.push(tx);
      byMerchant.set(key, existing);
    }

    const recurring: Array<{
      merchant: string;
      amount: number;
      frequency: 'weekly' | 'monthly' | 'quarterly' | 'annually';
      confidence: number;
      transactions: BankTransaction[];
    }> = [];

    for (const [merchant, txs] of byMerchant) {
      if (txs.length < 2) continue;

      // Sort by date
      txs.sort((a, b) => a.date - b.date);

      // Calculate intervals
      const intervals: number[] = [];
      for (let i = 1; i < txs.length; i++) {
        const days = (txs[i].date - txs[i - 1].date) / (24 * 60 * 60 * 1000);
        intervals.push(days);
      }

      if (intervals.length === 0) continue;

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = this.calculateVariance(intervals);

      // Determine frequency
      let frequency: 'weekly' | 'monthly' | 'quarterly' | 'annually' | null = null;

      if (avgInterval >= 5 && avgInterval <= 9 && variance < 3) {
        frequency = 'weekly';
      } else if (avgInterval >= 26 && avgInterval <= 35 && variance < 10) {
        frequency = 'monthly';
      } else if (avgInterval >= 85 && avgInterval <= 100 && variance < 15) {
        frequency = 'quarterly';
      } else if (avgInterval >= 350 && avgInterval <= 380 && variance < 20) {
        frequency = 'annually';
      }

      if (frequency) {
        // Calculate average amount
        const amounts = txs.map(t => Math.abs(t.amount));
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const amountVariance = this.calculateVariance(amounts);

        // Calculate confidence
        let confidence = 0.5;
        if (txs.length >= 3) confidence += 0.2;
        if (variance < 5) confidence += 0.1;
        if (amountVariance / avgAmount < 0.05) confidence += 0.1;

        recurring.push({
          merchant,
          amount: Math.round(avgAmount * 100) / 100,
          frequency,
          confidence: Math.min(confidence, 0.95),
          transactions: txs,
        });
      }
    }

    return recurring.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Categorize transactions by spending category
   */
  categorizeSpending(transactions: BankTransaction[]): Map<string, {
    total: number;
    count: number;
    transactions: BankTransaction[];
  }> {
    const categories = new Map<string, {
      total: number;
      count: number;
      transactions: BankTransaction[];
    }>();

    for (const tx of transactions) {
      if (tx.type === 'credit') continue; // Skip income

      const category = tx.category?.[0] ?? 'Uncategorized';
      const existing = categories.get(category) ?? { total: 0, count: 0, transactions: [] };

      existing.total += Math.abs(tx.amount);
      existing.count++;
      existing.transactions.push(tx);

      categories.set(category, existing);
    }

    return categories;
  }

  /**
   * Calculate monthly spending average
   */
  calculateMonthlyAverage(transactions: BankTransaction[]): number {
    if (transactions.length === 0) return 0;

    const debitTransactions = transactions.filter(t => t.type === 'debit');
    if (debitTransactions.length === 0) return 0;

    // Find date range
    const dates = debitTransactions.map(t => t.date);
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);

    const months = Math.max(1, (maxDate - minDate) / (30 * 24 * 60 * 60 * 1000));
    const totalSpending = debitTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    return totalSpending / months;
  }

  private calculateVariance(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }
}
