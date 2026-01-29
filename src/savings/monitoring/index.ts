/**
 * Price Monitoring Service
 *
 * Monitors product prices and triggers alerts when conditions are met.
 */

import type {
  PriceAlert,
  PricePoint,
  PriceDrop,
  PriceCheckResult,
  PriceMonitoringServiceConfig,
  PriceAlertType,
} from '../types.js';
import type { PriceAlertStore } from '../stores/index.js';
import type { SavingsConfig } from '../config.js';

export { AlertEngine, type AlertRule, type AlertEvaluation } from './alert-engine.js';
export { PriceHistoryAnalyzer, type PriceAnalysis, type PriceTrend } from './price-history.js';

/**
 * Price monitoring service configuration
 */
export interface PriceMonitoringConfig {
  checkIntervalMinutes: number;
  maxAlertsPerUser: number;
  historyRetentionDays: number;
  batchSize: number;
  notificationChannels: string[];
}

/**
 * Price check provider interface
 */
export interface PriceCheckProvider {
  name: string;
  supportedRetailers: string[];
  checkPrice(productUrl: string): Promise<PriceCheckResult>;
}

/**
 * Price monitoring service
 */
export class PriceMonitoringService {
  private readonly config: PriceMonitoringConfig;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private providers: PriceCheckProvider[] = [];

  constructor(
    private readonly alertStore: PriceAlertStore,
    config?: Partial<PriceMonitoringServiceConfig>
  ) {
    this.config = {
      checkIntervalMinutes: config?.checkIntervalMinutes ?? 60,
      maxAlertsPerUser: config?.maxAlertsPerUser ?? 50,
      historyRetentionDays: config?.historyRetentionDays ?? 90,
      batchSize: config?.batchSize ?? 20,
      notificationChannels: ['email'],
    };
  }

  /**
   * Register a price check provider
   */
  registerProvider(provider: PriceCheckProvider): void {
    this.providers.push(provider);
  }

  /**
   * Start the price monitoring loop
   */
  start(): void {
    if (this.checkInterval) {
      return;
    }

    const intervalMs = this.config.checkIntervalMinutes * 60 * 1000;
    this.checkInterval = setInterval(() => {
      this.runCheckCycle().catch(console.error);
    }, intervalMs);

    // Run initial check
    this.runCheckCycle().catch(console.error);
  }

  /**
   * Stop the price monitoring loop
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Run a single check cycle
   */
  async runCheckCycle(): Promise<PriceDrop[]> {
    const alerts = await this.alertStore.getAlertsToCheck(this.config.batchSize);
    const drops: PriceDrop[] = [];

    for (const alert of alerts) {
      try {
        const result = await this.checkPrice(alert);
        if (result) {
          const drop = await this.processCheckResult(alert, result);
          if (drop) {
            drops.push(drop);
          }
        }
      } catch (error) {
        console.error(`Failed to check price for alert ${alert.id}:`, error);
      }
    }

    return drops;
  }

  /**
   * Create a new price alert
   */
  async createAlert(
    userId: string,
    productUrl: string,
    productName: string,
    targetPrice: number,
    alertType: PriceAlertType,
    options?: {
      retailer?: string;
      productImage?: string;
      notificationChannels?: string[];
    }
  ): Promise<PriceAlert> {
    // Check user alert limit
    const existingCount = await this.alertStore.count(userId, { isActive: true });
    if (existingCount >= this.config.maxAlertsPerUser) {
      throw new Error(`Maximum alerts limit reached (${this.config.maxAlertsPerUser})`);
    }

    // Check if alert already exists for this URL
    const existing = await this.alertStore.getByUrl(userId, productUrl);
    if (existing) {
      throw new Error('Alert already exists for this product');
    }

    // Get initial price
    const initialCheck = await this.checkPrice({ productUrl } as PriceAlert);
    const currentPrice = initialCheck?.currentPrice ?? targetPrice;

    const retailer = options?.retailer ?? this.extractRetailer(productUrl);

    return this.alertStore.create({
      userId,
      productUrl,
      productName,
      productImage: options?.productImage,
      retailer,
      targetPrice,
      currentPrice,
      originalPrice: currentPrice,
      alertType,
      isActive: true,
      priceHistory: [{
        price: currentPrice,
        timestamp: Date.now(),
        inStock: initialCheck?.inStock ?? true,
      }],
      notificationChannels: options?.notificationChannels ?? this.config.notificationChannels,
    });
  }

  /**
   * Update an existing alert
   */
  async updateAlert(
    alertId: string,
    updates: Partial<Pick<PriceAlert, 'targetPrice' | 'alertType' | 'isActive' | 'notificationChannels'>>
  ): Promise<PriceAlert | null> {
    return this.alertStore.update(alertId, updates);
  }

  /**
   * Delete an alert
   */
  async deleteAlert(alertId: string): Promise<boolean> {
    return this.alertStore.delete(alertId);
  }

  /**
   * Get all alerts for a user
   */
  async getAlerts(userId: string, activeOnly = true): Promise<PriceAlert[]> {
    if (activeOnly) {
      return this.alertStore.getActive(userId);
    }
    return this.alertStore.list(userId);
  }

  /**
   * Get alert by ID
   */
  async getAlert(alertId: string): Promise<PriceAlert | null> {
    return this.alertStore.get(alertId);
  }

  /**
   * Get triggered alerts
   */
  async getTriggeredAlerts(userId: string): Promise<PriceAlert[]> {
    return this.alertStore.getTriggered(userId);
  }

  /**
   * Get price history for an alert
   */
  async getPriceHistory(alertId: string, limit?: number): Promise<PricePoint[]> {
    return this.alertStore.getPriceHistory(alertId, limit);
  }

  /**
   * Get the lowest recorded price
   */
  async getLowestPrice(alertId: string): Promise<number | null> {
    return this.alertStore.getLowestPrice(alertId);
  }

  /**
   * Manually trigger a price check for a specific alert
   */
  async checkAlertNow(alertId: string): Promise<PriceCheckResult | null> {
    const alert = await this.alertStore.get(alertId);
    if (!alert) {
      return null;
    }

    return this.checkPrice(alert);
  }

  /**
   * Check price for an alert using registered providers
   */
  private async checkPrice(alert: PriceAlert): Promise<PriceCheckResult | null> {
    const retailer = alert.retailer ?? this.extractRetailer(alert.productUrl);

    // Find a provider that supports this retailer
    for (const provider of this.providers) {
      if (provider.supportedRetailers.includes(retailer) ||
          provider.supportedRetailers.includes('*')) {
        try {
          return await provider.checkPrice(alert.productUrl);
        } catch (error) {
          console.error(`Provider ${provider.name} failed:`, error);
        }
      }
    }

    // No provider available - return null
    return null;
  }

  /**
   * Process a price check result and determine if alert should trigger
   */
  private async processCheckResult(
    alert: PriceAlert,
    result: PriceCheckResult
  ): Promise<PriceDrop | null> {
    const now = Date.now();

    // Add price point to history
    await this.alertStore.addPricePoint(alert.id, {
      price: result.currentPrice,
      timestamp: now,
      inStock: result.inStock,
      source: 'auto-check',
    });

    // Check if alert should trigger
    const triggered = this.shouldTrigger(alert, result);

    if (triggered) {
      // Mark alert as triggered
      await this.alertStore.update(alert.id, {
        triggeredAt: now,
        currentPrice: result.currentPrice,
      });

      // Calculate savings
      const previousPrice = alert.currentPrice;
      const savings = previousPrice - result.currentPrice;
      const percentDrop = ((previousPrice - result.currentPrice) / previousPrice) * 100;

      // Check if this is an all-time low
      const lowestPrice = await this.alertStore.getLowestPrice(alert.id);
      const isAllTimeLow = lowestPrice !== null && result.currentPrice <= lowestPrice;

      return {
        alertId: alert.id,
        productName: alert.productName,
        productUrl: alert.productUrl,
        previousPrice,
        currentPrice: result.currentPrice,
        targetPrice: alert.targetPrice,
        savings,
        percentDrop,
        isAllTimeLow,
        detectedAt: now,
      };
    }

    // Just update current price without triggering
    await this.alertStore.update(alert.id, {
      currentPrice: result.currentPrice,
      lastCheckedAt: now,
    });

    return null;
  }

  /**
   * Determine if an alert should trigger based on its type
   */
  private shouldTrigger(alert: PriceAlert, result: PriceCheckResult): boolean {
    switch (alert.alertType) {
      case 'below':
        return result.currentPrice <= alert.targetPrice;

      case 'drop-percent': {
        const dropPercent = ((alert.originalPrice - result.currentPrice) / alert.originalPrice) * 100;
        return dropPercent >= alert.targetPrice;
      }

      case 'all-time-low': {
        const lowestInHistory = Math.min(...alert.priceHistory.map(p => p.price));
        return result.currentPrice < lowestInHistory;
      }

      case 'back-in-stock': {
        if (!result.inStock) return false;
        // Check if the item was out of stock in the last check
        const lastPoint = alert.priceHistory[alert.priceHistory.length - 1];
        return lastPoint && !lastPoint.inStock;
      }

      default:
        return false;
    }
  }

  /**
   * Extract retailer name from URL
   */
  private extractRetailer(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      // Remove www. prefix and extract domain name
      const domain = hostname.replace(/^www\./, '');
      const parts = domain.split('.');
      // Return the main domain name (e.g., 'amazon' from 'amazon.com')
      return parts[0];
    } catch {
      return 'unknown';
    }
  }

  /**
   * Clean up old price history entries
   */
  async cleanupHistory(): Promise<number> {
    const cutoffDate = Date.now() - (this.config.historyRetentionDays * 24 * 60 * 60 * 1000);
    let cleaned = 0;

    const alerts = await this.alertStore.getAlertsToCheck(1000);
    for (const alert of alerts) {
      const originalLength = alert.priceHistory.length;
      const filteredHistory = alert.priceHistory.filter(p => p.timestamp >= cutoffDate);

      if (filteredHistory.length < originalLength) {
        await this.alertStore.update(alert.id, { priceHistory: filteredHistory });
        cleaned += originalLength - filteredHistory.length;
      }
    }

    return cleaned;
  }
}

/**
 * Factory function to create price monitoring service
 */
export function createPriceMonitoringService(
  alertStore: PriceAlertStore,
  config?: Partial<SavingsConfig>
): PriceMonitoringService {
  return new PriceMonitoringService(alertStore, config?.priceMonitoring);
}
