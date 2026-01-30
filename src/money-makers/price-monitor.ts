/**
 * Price Monitor
 *
 * Track prices and alert on changes for flights, hotels, products, crypto
 */

import type {
  PriceMonitorItem,
  PricePoint,
  PriceAlert,
  PricePrediction,
  PriceMonitorCategory,
  Money,
  AlertChannel,
  NotificationProvider,
  PriceScraperProvider,
} from './types.js';
import {
  MONEY_MAKERS_EVENTS,
  PRICE_CHECK_INTERVALS,
  PRICE_CHANGE_THRESHOLDS,
  formatMoney,
} from './constants.js';

// =============================================================================
// Price Monitor Config
// =============================================================================

export interface PriceMonitorConfig {
  /** Price scraper provider */
  scraperProvider?: PriceScraperProvider;
  /** Notification provider */
  notificationProvider?: NotificationProvider;
  /** Default check interval in minutes */
  defaultCheckInterval: number;
  /** Max items to monitor per user */
  maxItemsPerUser: number;
  /** Max price history points to retain */
  maxHistoryPoints: number;
  /** Default alert channels */
  defaultAlertChannels: AlertChannel[];
  /** Webhook URL for alerts */
  webhookUrl?: string;
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: PriceMonitorConfig = {
  defaultCheckInterval: PRICE_CHECK_INTERVALS.standard,
  maxItemsPerUser: 50,
  maxHistoryPoints: 1000,
  defaultAlertChannels: ['push'],
};

// =============================================================================
// Price Monitor
// =============================================================================

export class PriceMonitor {
  private readonly config: PriceMonitorConfig;
  private items = new Map<string, PriceMonitorItem>();
  private alerts = new Map<string, PriceAlert>();
  private checkTimers = new Map<string, NodeJS.Timeout>();

  constructor(config?: Partial<PriceMonitorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Item Tracking
  // ==========================================================================

  /**
   * Track a new item for price changes
   */
  track(params: {
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
    checkInterval?: number;
    alertChannels?: AlertChannel[];
  }): PriceMonitorItem {
    // Check user limit
    const userItems = this.getUserItems(params.userId);
    if (userItems.length >= this.config.maxItemsPerUser) {
      throw new Error(`Maximum items limit (${this.config.maxItemsPerUser}) reached`);
    }

    const id = this.generateId();
    const now = Date.now();

    const item: PriceMonitorItem = {
      id,
      userId: params.userId,
      name: params.name,
      url: params.url,
      category: params.category,
      currentPrice: params.currentPrice,
      threshold: params.threshold,
      targetPrice: params.targetPrice,
      alertOnIncrease: params.alertOnIncrease ?? false,
      alertOnDecrease: params.alertOnDecrease ?? true,
      percentageThreshold: params.percentageThreshold ?? PRICE_CHANGE_THRESHOLDS.moderate * 100,
      priceHistory: params.currentPrice
        ? [{ price: params.currentPrice, timestamp: now, source: 'initial' }]
        : [],
      checkInterval: params.checkInterval ?? this.config.defaultCheckInterval,
      alertChannels: params.alertChannels ?? this.config.defaultAlertChannels,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.items.set(id, item);
    this.scheduleCheck(item);

    return item;
  }

  /**
   * Update tracking parameters
   */
  updateItem(
    itemId: string,
    updates: Partial<Pick<
      PriceMonitorItem,
      'name' | 'threshold' | 'targetPrice' | 'alertOnIncrease' | 'alertOnDecrease' |
      'percentageThreshold' | 'checkInterval' | 'alertChannels' | 'isActive'
    >>
  ): PriceMonitorItem {
    const item = this.getItem(itemId);

    Object.assign(item, updates);
    item.updatedAt = Date.now();

    // Reschedule if interval changed
    if (updates.checkInterval !== undefined) {
      this.clearCheck(itemId);
      if (item.isActive) {
        this.scheduleCheck(item);
      }
    }

    // Toggle monitoring
    if (updates.isActive !== undefined) {
      if (updates.isActive) {
        this.scheduleCheck(item);
      } else {
        this.clearCheck(itemId);
      }
    }

    return item;
  }

  /**
   * Stop tracking an item
   */
  untrack(itemId: string): void {
    this.clearCheck(itemId);
    this.items.delete(itemId);
  }

  /**
   * Get item by ID
   */
  getItem(itemId: string): PriceMonitorItem {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Monitored item not found: ${itemId}`);
    }
    return item;
  }

  /**
   * Get all items for a user
   */
  getUserItems(userId: string): PriceMonitorItem[] {
    return Array.from(this.items.values()).filter(i => i.userId === userId);
  }

  /**
   * Get items by category
   */
  getItemsByCategory(
    userId: string,
    category: PriceMonitorCategory
  ): PriceMonitorItem[] {
    return this.getUserItems(userId).filter(i => i.category === category);
  }

  // ==========================================================================
  // Price Checking
  // ==========================================================================

  /**
   * Manually check price for an item
   */
  async checkPrice(itemId: string): Promise<PricePoint | null> {
    const item = this.getItem(itemId);

    if (!item.url || !this.config.scraperProvider) {
      return null;
    }

    if (!this.config.scraperProvider.supportsUrl(item.url)) {
      return null;
    }

    try {
      const result = await this.config.scraperProvider.scrapePrice(item.url);
      const pricePoint: PricePoint = {
        price: result.price,
        timestamp: Date.now(),
        source: new URL(item.url).hostname,
        metadata: result.metadata,
      };

      this.recordPrice(item, pricePoint);
      item.lastChecked = pricePoint.timestamp;

      this.emit(MONEY_MAKERS_EVENTS.PRICE_CHECK_COMPLETED, {
        itemId,
        price: result.price,
      });

      return pricePoint;
    } catch (error) {
      // Log error but don't throw
      return null;
    }
  }

  /**
   * Check prices for all active items
   */
  async checkAllPrices(userId?: string): Promise<Map<string, PricePoint | null>> {
    const items = userId ? this.getUserItems(userId) : Array.from(this.items.values());
    const results = new Map<string, PricePoint | null>();

    const checks = items
      .filter(i => i.isActive)
      .map(async item => {
        const result = await this.checkPrice(item.id);
        results.set(item.id, result);
      });

    await Promise.allSettled(checks);

    return results;
  }

  /**
   * Record a manual price update
   */
  recordManualPrice(
    itemId: string,
    price: Money,
    source: string = 'manual'
  ): PricePoint {
    const item = this.getItem(itemId);

    const pricePoint: PricePoint = {
      price,
      timestamp: Date.now(),
      source,
    };

    this.recordPrice(item, pricePoint);

    return pricePoint;
  }

  // ==========================================================================
  // Price History & Analysis
  // ==========================================================================

  /**
   * Get price history for an item
   */
  getPriceHistory(
    itemId: string,
    limit?: number
  ): PricePoint[] {
    const item = this.getItem(itemId);
    const history = [...item.priceHistory].sort((a, b) => b.timestamp - a.timestamp);

    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Get price statistics
   */
  getPriceStats(itemId: string): {
    current: Money | undefined;
    lowest: Money | undefined;
    highest: Money | undefined;
    average: Money | undefined;
    trend: 'up' | 'down' | 'stable';
    changePercent: number;
  } {
    const item = this.getItem(itemId);
    const history = item.priceHistory;

    if (history.length === 0) {
      return {
        current: undefined,
        lowest: undefined,
        highest: undefined,
        average: undefined,
        trend: 'stable',
        changePercent: 0,
      };
    }

    const prices = history.map(h => h.price.amount);
    const currency = history[0].price.currency;

    const current = item.currentPrice;
    const lowest: Money = { amount: Math.min(...prices), currency };
    const highest: Money = { amount: Math.max(...prices), currency };
    const average: Money = {
      amount: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      currency,
    };

    // Calculate trend from last 5 data points
    const recent = history.slice(-5);
    let trend: 'up' | 'down' | 'stable' = 'stable';
    let changePercent = 0;

    if (recent.length >= 2) {
      const first = recent[0].price.amount;
      const last = recent[recent.length - 1].price.amount;
      changePercent = ((last - first) / first) * 100;

      if (changePercent > PRICE_CHANGE_THRESHOLDS.minor * 100) {
        trend = 'up';
      } else if (changePercent < -PRICE_CHANGE_THRESHOLDS.minor * 100) {
        trend = 'down';
      }
    }

    return { current, lowest, highest, average, trend, changePercent };
  }

  /**
   * Get price prediction (simplified algorithm)
   */
  getPrediction(itemId: string): PricePrediction | null {
    const item = this.getItem(itemId);
    const stats = this.getPriceStats(itemId);

    if (!stats.current || !stats.average) {
      return null;
    }

    // Simple prediction based on trend
    let predictedAmount = stats.current.amount;
    let confidence = 50;
    let recommendation: 'buy_now' | 'wait' | 'uncertain' = 'uncertain';
    let reasoning = 'Insufficient data for confident prediction';

    if (item.priceHistory.length >= 10) {
      if (stats.trend === 'down') {
        predictedAmount = stats.current.amount * 0.95;
        confidence = 60;
        recommendation = 'wait';
        reasoning = 'Price trend is downward, consider waiting for further drops';
      } else if (stats.trend === 'up') {
        predictedAmount = stats.current.amount * 1.05;
        confidence = 60;
        recommendation = 'buy_now';
        reasoning = 'Price trend is upward, buying now may save money';
      }

      // Check if current price is near historical low
      if (stats.lowest && stats.current.amount <= stats.lowest.amount * 1.05) {
        recommendation = 'buy_now';
        confidence = 70;
        reasoning = 'Current price is near historical low';
      }
    }

    return {
      itemId,
      predictedPrice: {
        amount: Math.round(predictedAmount),
        currency: stats.current.currency,
      },
      confidence,
      predictedDate: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      reasoning,
      recommendation,
    };
  }

  // ==========================================================================
  // Alerts
  // ==========================================================================

  /**
   * Get alerts for a user
   */
  getAlerts(userId: string, unacknowledgedOnly: boolean = false): PriceAlert[] {
    return Array.from(this.alerts.values()).filter(
      a => a.userId === userId && (!unacknowledgedOnly || !a.acknowledged)
    );
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  /**
   * Acknowledge all alerts for a user
   */
  acknowledgeAllAlerts(userId: string): void {
    for (const alert of this.alerts.values()) {
      if (alert.userId === userId) {
        alert.acknowledged = true;
      }
    }
  }

  // ==========================================================================
  // Multi-source Comparison
  // ==========================================================================

  /**
   * Compare prices across multiple sources
   */
  async compareAcrossSources(
    itemId: string,
    additionalUrls: string[]
  ): Promise<Array<{ source: string; price: Money; url: string }>> {
    const item = this.getItem(itemId);
    const results: Array<{ source: string; price: Money; url: string }> = [];

    if (item.currentPrice) {
      results.push({
        source: 'tracked',
        price: item.currentPrice,
        url: item.url ?? '',
      });
    }

    if (this.config.scraperProvider) {
      for (const url of additionalUrls) {
        if (this.config.scraperProvider.supportsUrl(url)) {
          try {
            const result = await this.config.scraperProvider.scrapePrice(url);
            results.push({
              source: new URL(url).hostname,
              price: result.price,
              url,
            });
          } catch {
            // Skip failed sources
          }
        }
      }
    }

    return results.sort((a, b) => a.price.amount - b.price.amount);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private recordPrice(item: PriceMonitorItem, pricePoint: PricePoint): void {
    const previousPrice = item.currentPrice;

    // Add to history
    item.priceHistory.push(pricePoint);

    // Trim history if needed
    if (item.priceHistory.length > this.config.maxHistoryPoints) {
      item.priceHistory = item.priceHistory.slice(-this.config.maxHistoryPoints);
    }

    // Update current price
    item.currentPrice = pricePoint.price;
    item.updatedAt = Date.now();

    // Check for alerts
    if (previousPrice) {
      this.checkForAlerts(item, previousPrice, pricePoint.price);
    }
  }

  private checkForAlerts(
    item: PriceMonitorItem,
    previousPrice: Money,
    newPrice: Money
  ): void {
    const percentChange = ((newPrice.amount - previousPrice.amount) / previousPrice.amount) * 100;
    const thresholdPercent = item.percentageThreshold ?? PRICE_CHANGE_THRESHOLDS.moderate * 100;

    let alertType: PriceAlert['type'] | null = null;

    // Check for significant changes
    if (percentChange <= -thresholdPercent && item.alertOnDecrease) {
      alertType = 'drop';
      this.emit(MONEY_MAKERS_EVENTS.PRICE_DROP_DETECTED, {
        itemId: item.id,
        itemName: item.name,
        previousPrice,
        newPrice,
        percentChange,
      });
    } else if (percentChange >= thresholdPercent && item.alertOnIncrease) {
      alertType = 'increase';
      this.emit(MONEY_MAKERS_EVENTS.PRICE_INCREASE_DETECTED, {
        itemId: item.id,
        itemName: item.name,
        previousPrice,
        newPrice,
        percentChange,
      });
    }

    // Check threshold
    if (item.threshold && newPrice.amount <= item.threshold.amount) {
      alertType = 'threshold_reached';
      this.emit(MONEY_MAKERS_EVENTS.PRICE_THRESHOLD_REACHED, {
        itemId: item.id,
        itemName: item.name,
        threshold: item.threshold,
        currentPrice: newPrice,
      });
    }

    // Check target price
    if (item.targetPrice && newPrice.amount <= item.targetPrice.amount) {
      alertType = 'target_reached';
      this.emit(MONEY_MAKERS_EVENTS.PRICE_TARGET_REACHED, {
        itemId: item.id,
        itemName: item.name,
        targetPrice: item.targetPrice,
        currentPrice: newPrice,
      });
    }

    if (alertType) {
      const alert: PriceAlert = {
        id: this.generateId(),
        itemId: item.id,
        userId: item.userId,
        type: alertType,
        previousPrice,
        newPrice,
        percentageChange: Math.round(percentChange * 100) / 100,
        timestamp: Date.now(),
        acknowledged: false,
      };

      this.alerts.set(alert.id, alert);
      this.sendNotifications(item, alert);
    }
  }

  private async sendNotifications(
    item: PriceMonitorItem,
    alert: PriceAlert
  ): Promise<void> {
    if (!this.config.notificationProvider) return;

    const title = this.getAlertTitle(alert);
    const body = this.getAlertBody(item, alert);

    for (const channel of item.alertChannels) {
      try {
        await this.config.notificationProvider.send(
          item.userId,
          channel,
          title,
          body
        );
      } catch {
        // Log error but continue
      }
    }

    // Webhook notification
    if (this.config.webhookUrl) {
      try {
        await fetch(this.config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item, alert }),
        });
      } catch {
        // Webhook failed
      }
    }
  }

  private getAlertTitle(alert: PriceAlert): string {
    switch (alert.type) {
      case 'drop':
        return 'Price Drop Alert';
      case 'increase':
        return 'Price Increase Alert';
      case 'threshold_reached':
        return 'Price Below Threshold';
      case 'target_reached':
        return 'Target Price Reached!';
    }
  }

  private getAlertBody(item: PriceMonitorItem, alert: PriceAlert): string {
    const priceStr = formatMoney(alert.newPrice.amount, alert.newPrice.currency);
    const changeStr = `${alert.percentageChange > 0 ? '+' : ''}${alert.percentageChange}%`;

    switch (alert.type) {
      case 'drop':
        return `${item.name} dropped to ${priceStr} (${changeStr})`;
      case 'increase':
        return `${item.name} increased to ${priceStr} (${changeStr})`;
      case 'threshold_reached':
        return `${item.name} is now ${priceStr} - below your threshold!`;
      case 'target_reached':
        return `${item.name} hit your target price of ${priceStr}!`;
    }
  }

  private scheduleCheck(item: PriceMonitorItem): void {
    this.clearCheck(item.id);

    const timer = setInterval(
      () => this.checkPrice(item.id),
      item.checkInterval * 60 * 1000
    );

    this.checkTimers.set(item.id, timer);
  }

  private clearCheck(itemId: string): void {
    const timer = this.checkTimers.get(itemId);
    if (timer) {
      clearInterval(timer);
      this.checkTimers.delete(itemId);
    }
  }

  private generateId(): string {
    return `pm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPriceMonitor(
  config?: Partial<PriceMonitorConfig>
): PriceMonitor {
  return new PriceMonitor(config);
}
