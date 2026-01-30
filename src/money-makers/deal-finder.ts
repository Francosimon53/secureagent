/**
 * Deal Finder
 *
 * Proactive deal hunting with wishlist monitoring, coupons, and cashback
 */

import type {
  Deal,
  DealType,
  WishlistItem,
  CouponCode,
  CashbackOffer,
  DealAlert,
  Money,
  AlertChannel,
  NotificationProvider,
  PriceScraperProvider,
} from './types.js';
import {
  MONEY_MAKERS_EVENTS,
  COUPON_SOURCES,
  CASHBACK_PLATFORMS,
  generateDealScore,
  calculateSavingsPercent,
  formatMoney,
} from './constants.js';

// =============================================================================
// Deal Finder Config
// =============================================================================

export interface DealFinderConfig {
  /** Price scraper provider */
  scraperProvider?: PriceScraperProvider;
  /** Notification provider */
  notificationProvider?: NotificationProvider;
  /** Default alert channels */
  defaultAlertChannels: AlertChannel[];
  /** Minimum savings percent to alert */
  minSavingsPercent: number;
  /** Minimum deal score to alert */
  minDealScore: number;
  /** Check interval for wishlist (minutes) */
  wishlistCheckInterval: number;
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: DealFinderConfig = {
  defaultAlertChannels: ['push'],
  minSavingsPercent: 10,
  minDealScore: 50,
  wishlistCheckInterval: 60,
};

// =============================================================================
// Deal Finder
// =============================================================================

export class DealFinder {
  private readonly config: DealFinderConfig;
  private wishlist = new Map<string, WishlistItem>();
  private deals = new Map<string, Deal>();
  private coupons = new Map<string, CouponCode>();
  private cashbackOffers = new Map<string, CashbackOffer>();
  private alerts = new Map<string, DealAlert>();
  private checkTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<DealFinderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Wishlist Management
  // ==========================================================================

  /**
   * Add item to wishlist
   */
  addToWishlist(params: {
    userId: string;
    name: string;
    url?: string;
    targetPrice?: Money;
    currentPrice?: Money;
    category?: string;
    priority?: 'high' | 'medium' | 'low';
    notes?: string;
  }): WishlistItem {
    const id = this.generateId('wish');

    const item: WishlistItem = {
      id,
      userId: params.userId,
      name: params.name,
      url: params.url,
      targetPrice: params.targetPrice,
      currentPrice: params.currentPrice,
      category: params.category,
      priority: params.priority ?? 'medium',
      notes: params.notes,
      addedAt: Date.now(),
    };

    this.wishlist.set(id, item);

    return item;
  }

  /**
   * Update wishlist item
   */
  updateWishlistItem(
    itemId: string,
    updates: Partial<Pick<WishlistItem, 'name' | 'url' | 'targetPrice' | 'currentPrice' | 'priority' | 'notes'>>
  ): WishlistItem {
    const item = this.getWishlistItem(itemId);
    Object.assign(item, updates);
    return item;
  }

  /**
   * Remove from wishlist
   */
  removeFromWishlist(itemId: string): void {
    this.wishlist.delete(itemId);
  }

  /**
   * Get wishlist item
   */
  getWishlistItem(itemId: string): WishlistItem {
    const item = this.wishlist.get(itemId);
    if (!item) {
      throw new Error(`Wishlist item not found: ${itemId}`);
    }
    return item;
  }

  /**
   * Get user's wishlist
   */
  getUserWishlist(userId: string): WishlistItem[] {
    return Array.from(this.wishlist.values())
      .filter(item => item.userId === userId)
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }

  /**
   * Check wishlist for price drops
   */
  async checkWishlist(userId: string): Promise<Array<{ item: WishlistItem; deal?: Deal }>> {
    const items = this.getUserWishlist(userId);
    const results: Array<{ item: WishlistItem; deal?: Deal }> = [];

    for (const item of items) {
      if (item.url && this.config.scraperProvider?.supportsUrl(item.url)) {
        try {
          const priceData = await this.config.scraperProvider.scrapePrice(item.url);
          const previousPrice = item.currentPrice;

          item.currentPrice = priceData.price;

          // Check if price dropped
          if (previousPrice && priceData.price.amount < previousPrice.amount) {
            const savingsPercent = calculateSavingsPercent(previousPrice.amount, priceData.price.amount);

            if (savingsPercent >= this.config.minSavingsPercent) {
              const deal = this.createDealFromPriceDrop(item, previousPrice, priceData.price);
              results.push({ item, deal });
            } else {
              results.push({ item });
            }
          }

          // Check if hit target price
          if (item.targetPrice && priceData.price.amount <= item.targetPrice.amount) {
            const deal = this.createDealFromTargetReached(item, priceData.price);
            results.push({ item, deal });

            this.emit(MONEY_MAKERS_EVENTS.WISHLIST_MATCH, {
              itemId: item.id,
              itemName: item.name,
              targetPrice: item.targetPrice,
              currentPrice: priceData.price,
            });
          } else {
            results.push({ item });
          }
        } catch {
          results.push({ item });
        }
      } else {
        results.push({ item });
      }
    }

    return results;
  }

  // ==========================================================================
  // Deal Discovery
  // ==========================================================================

  /**
   * Add a discovered deal
   */
  addDeal(params: {
    type: DealType;
    title: string;
    description: string;
    originalPrice?: Money;
    dealPrice: Money;
    url: string;
    source: string;
    code?: string;
    expiresAt?: number;
    terms?: string;
    verified?: boolean;
  }): Deal {
    const id = this.generateId('deal');

    const savings: Money = {
      amount: params.originalPrice
        ? params.originalPrice.amount - params.dealPrice.amount
        : 0,
      currency: params.dealPrice.currency,
    };

    const savingsPercent = params.originalPrice
      ? calculateSavingsPercent(params.originalPrice.amount, params.dealPrice.amount)
      : 0;

    // Match with wishlist
    const matchedItems = this.findWishlistMatches(params.title);

    const score = generateDealScore({
      savingsPercent,
      relevance: matchedItems.length > 0 ? 100 : 50,
      expiresIn: params.expiresAt ? params.expiresAt - Date.now() : undefined,
      verified: params.verified ?? false,
      matchesWishlist: matchedItems.length > 0,
    });

    const deal: Deal = {
      id,
      type: params.type,
      title: params.title,
      description: params.description,
      originalPrice: params.originalPrice,
      dealPrice: params.dealPrice,
      savings,
      savingsPercent,
      url: params.url,
      source: params.source,
      code: params.code,
      expiresAt: params.expiresAt,
      terms: params.terms,
      verified: params.verified ?? false,
      score,
      matchedWishlistItems: matchedItems.map(i => i.id),
      foundAt: Date.now(),
    };

    this.deals.set(id, deal);

    if (score >= this.config.minDealScore) {
      this.emit(MONEY_MAKERS_EVENTS.DEAL_FOUND, {
        dealId: id,
        title: deal.title,
        savings: deal.savings,
        score,
      });
    }

    return deal;
  }

  /**
   * Get deals for a user (matched with wishlist)
   */
  getDealsForUser(userId: string, options?: {
    type?: DealType;
    minScore?: number;
    activeOnly?: boolean;
  }): Deal[] {
    const wishlistItemIds = new Set(
      this.getUserWishlist(userId).map(i => i.id)
    );

    let deals = Array.from(this.deals.values());

    // Filter by type
    if (options?.type) {
      deals = deals.filter(d => d.type === options.type);
    }

    // Filter by score
    const minScore = options?.minScore ?? this.config.minDealScore;
    deals = deals.filter(d => d.score >= minScore);

    // Filter expired
    if (options?.activeOnly !== false) {
      const now = Date.now();
      deals = deals.filter(d => !d.expiresAt || d.expiresAt > now);
    }

    // Sort by relevance to user's wishlist, then by score
    return deals.sort((a, b) => {
      const aMatches = a.matchedWishlistItems?.some(id => wishlistItemIds.has(id)) ? 1 : 0;
      const bMatches = b.matchedWishlistItems?.some(id => wishlistItemIds.has(id)) ? 1 : 0;

      if (aMatches !== bMatches) return bMatches - aMatches;
      return b.score - a.score;
    });
  }

  /**
   * Get top deals
   */
  getTopDeals(limit: number = 10): Deal[] {
    const now = Date.now();
    return Array.from(this.deals.values())
      .filter(d => !d.expiresAt || d.expiresAt > now)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ==========================================================================
  // Coupon Management
  // ==========================================================================

  /**
   * Add a coupon code
   */
  addCoupon(params: {
    code: string;
    description: string;
    discountType: 'percentage' | 'fixed' | 'free_shipping';
    discountValue: number;
    minimumPurchase?: Money;
    expiresAt?: number;
    merchant: string;
    verified?: boolean;
    successRate?: number;
  }): CouponCode {
    const coupon: CouponCode = {
      ...params,
      verified: params.verified ?? false,
      lastVerified: params.verified ? Date.now() : undefined,
    };

    this.coupons.set(`${params.merchant}:${params.code}`, coupon);

    this.emit(MONEY_MAKERS_EVENTS.COUPON_FOUND, {
      merchant: params.merchant,
      code: params.code,
      discountType: params.discountType,
      discountValue: params.discountValue,
    });

    return coupon;
  }

  /**
   * Find coupons for a merchant
   */
  findCoupons(merchant: string): CouponCode[] {
    const merchantLower = merchant.toLowerCase();
    const now = Date.now();

    return Array.from(this.coupons.values())
      .filter(c => {
        if (c.merchant.toLowerCase() !== merchantLower) return false;
        if (c.expiresAt && c.expiresAt < now) return false;
        return true;
      })
      .sort((a, b) => {
        // Sort by verified, then by success rate, then by discount value
        if (a.verified !== b.verified) return b.verified ? 1 : -1;
        if ((a.successRate ?? 0) !== (b.successRate ?? 0)) {
          return (b.successRate ?? 0) - (a.successRate ?? 0);
        }
        return b.discountValue - a.discountValue;
      });
  }

  /**
   * Verify a coupon worked
   */
  verifyCoupon(merchant: string, code: string, worked: boolean): void {
    const key = `${merchant}:${code}`;
    const coupon = this.coupons.get(key);

    if (coupon) {
      if (worked) {
        coupon.verified = true;
        coupon.lastVerified = Date.now();
        coupon.successRate = Math.min(100, (coupon.successRate ?? 50) + 10);
      } else {
        coupon.successRate = Math.max(0, (coupon.successRate ?? 50) - 20);
      }
    }
  }

  /**
   * Get best coupon for a purchase
   */
  getBestCoupon(merchant: string, purchaseAmount: Money): CouponCode | null {
    const coupons = this.findCoupons(merchant).filter(c => {
      if (c.minimumPurchase && purchaseAmount.amount < c.minimumPurchase.amount) {
        return false;
      }
      return true;
    });

    if (coupons.length === 0) return null;

    // Calculate effective discount for each
    const withDiscount = coupons.map(c => {
      let effectiveDiscount = 0;

      switch (c.discountType) {
        case 'percentage':
          effectiveDiscount = purchaseAmount.amount * (c.discountValue / 100);
          break;
        case 'fixed':
          effectiveDiscount = c.discountValue;
          break;
        case 'free_shipping':
          effectiveDiscount = 10; // Assume $10 shipping value
          break;
      }

      return { coupon: c, effectiveDiscount };
    });

    // Return best discount
    withDiscount.sort((a, b) => b.effectiveDiscount - a.effectiveDiscount);
    return withDiscount[0]?.coupon ?? null;
  }

  // ==========================================================================
  // Cashback Offers
  // ==========================================================================

  /**
   * Add a cashback offer
   */
  addCashbackOffer(params: {
    merchant: string;
    platform: string;
    cashbackPercent: number;
    maxCashback?: Money;
    terms?: string;
    activationUrl: string;
    expiresAt?: number;
  }): CashbackOffer {
    const id = this.generateId('cb');

    const offer: CashbackOffer = {
      id,
      ...params,
    };

    this.cashbackOffers.set(id, offer);

    this.emit(MONEY_MAKERS_EVENTS.CASHBACK_OPPORTUNITY, {
      merchant: params.merchant,
      platform: params.platform,
      cashbackPercent: params.cashbackPercent,
    });

    return offer;
  }

  /**
   * Find cashback offers for a merchant
   */
  findCashbackOffers(merchant: string): CashbackOffer[] {
    const merchantLower = merchant.toLowerCase();
    const now = Date.now();

    return Array.from(this.cashbackOffers.values())
      .filter(o => {
        if (!o.merchant.toLowerCase().includes(merchantLower)) return false;
        if (o.expiresAt && o.expiresAt < now) return false;
        return true;
      })
      .sort((a, b) => b.cashbackPercent - a.cashbackPercent);
  }

  /**
   * Get best cashback offer
   */
  getBestCashback(merchant: string): CashbackOffer | null {
    const offers = this.findCashbackOffers(merchant);
    return offers[0] ?? null;
  }

  /**
   * Calculate potential cashback
   */
  calculateCashback(merchant: string, purchaseAmount: Money): Money | null {
    const offer = this.getBestCashback(merchant);
    if (!offer) return null;

    let cashback = purchaseAmount.amount * (offer.cashbackPercent / 100);

    if (offer.maxCashback) {
      cashback = Math.min(cashback, offer.maxCashback.amount);
    }

    return { amount: Math.round(cashback * 100) / 100, currency: purchaseAmount.currency };
  }

  // ==========================================================================
  // Deal Scoring & Recommendations
  // ==========================================================================

  /**
   * Get personalized deal recommendations
   */
  getRecommendations(userId: string, limit: number = 10): Deal[] {
    const wishlist = this.getUserWishlist(userId);
    const wishlistCategories = new Set(wishlist.map(i => i.category).filter(Boolean));

    const deals = Array.from(this.deals.values()).filter(d => {
      // Active deals only
      if (d.expiresAt && d.expiresAt < Date.now()) return false;
      return d.score >= this.config.minDealScore;
    });

    // Score deals based on user preferences
    const scored = deals.map(deal => {
      let personalScore = deal.score;

      // Boost for wishlist matches
      if (deal.matchedWishlistItems?.some(id => wishlist.some(w => w.id === id))) {
        personalScore += 30;
      }

      // Boost for matching categories
      // (would need category on deals for this to work well)

      return { deal, personalScore };
    });

    return scored
      .sort((a, b) => b.personalScore - a.personalScore)
      .slice(0, limit)
      .map(s => s.deal);
  }

  /**
   * Get savings summary
   */
  getSavingsSummary(userId: string): {
    dealsUsed: number;
    totalSaved: Money;
    couponsUsed: number;
    cashbackEarned: Money;
  } {
    const alerts = Array.from(this.alerts.values()).filter(a => a.userId === userId);
    const purchased = alerts.filter(a => a.purchased);

    let totalSaved = 0;
    let currency: Money['currency'] = 'USD';

    for (const alert of purchased) {
      const deal = this.deals.get(alert.dealId);
      if (deal) {
        totalSaved += deal.savings.amount;
        currency = deal.savings.currency;
      }
    }

    return {
      dealsUsed: purchased.length,
      totalSaved: { amount: totalSaved, currency },
      couponsUsed: 0, // Would need to track this
      cashbackEarned: { amount: 0, currency }, // Would need to track this
    };
  }

  // ==========================================================================
  // Monitoring
  // ==========================================================================

  /**
   * Start automatic wishlist monitoring
   */
  startMonitoring(userId: string): void {
    this.stopMonitoring();

    this.checkTimer = setInterval(
      () => this.checkWishlist(userId),
      this.config.wishlistCheckInterval * 60 * 1000
    );
  }

  /**
   * Stop automatic monitoring
   */
  stopMonitoring(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private createDealFromPriceDrop(
    item: WishlistItem,
    previousPrice: Money,
    newPrice: Money
  ): Deal {
    return this.addDeal({
      type: 'price_drop',
      title: `Price Drop: ${item.name}`,
      description: `Price dropped from ${formatMoney(previousPrice.amount, previousPrice.currency)} to ${formatMoney(newPrice.amount, newPrice.currency)}`,
      originalPrice: previousPrice,
      dealPrice: newPrice,
      url: item.url ?? '',
      source: 'wishlist_monitoring',
      verified: true,
    });
  }

  private createDealFromTargetReached(
    item: WishlistItem,
    currentPrice: Money
  ): Deal {
    return this.addDeal({
      type: 'price_drop',
      title: `Target Price Reached: ${item.name}`,
      description: `Now at your target price of ${formatMoney(item.targetPrice!.amount, item.targetPrice!.currency)}`,
      originalPrice: item.targetPrice,
      dealPrice: currentPrice,
      url: item.url ?? '',
      source: 'wishlist_monitoring',
      verified: true,
    });
  }

  private findWishlistMatches(dealTitle: string): WishlistItem[] {
    const titleLower = dealTitle.toLowerCase();
    const titleWords = titleLower.split(/\s+/);

    return Array.from(this.wishlist.values()).filter(item => {
      const itemLower = item.name.toLowerCase();
      const itemWords = itemLower.split(/\s+/);

      // Check for word overlap
      const overlap = titleWords.filter(w => itemWords.includes(w));
      return overlap.length >= Math.min(2, itemWords.length);
    });
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createDealFinder(
  config?: Partial<DealFinderConfig>
): DealFinder {
  return new DealFinder(config);
}
