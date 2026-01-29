/**
 * Price Alert Engine
 *
 * Monitors travel prices and triggers alerts when targets are reached.
 */

import type { TravelPriceAlertStore } from '../../stores/price-alert-store.js';
import type {
  TravelPriceAlert,
  TravelPriceAlertType,
  TravelPricePoint,
  TravelPriceCheckResult,
} from '../../types.js';
import type {
  PriceAggregatorProvider,
  FlightPriceResult,
  HotelPriceResult,
} from '../../providers/base.js';

export interface AlertEngineConfig {
  enabled: boolean;
  flightCheckIntervalMinutes: number;
  hotelCheckIntervalMinutes: number;
  maxAlertsPerUser: number;
  notificationChannels: string[];
}

export interface AlertEngineDeps {
  store: TravelPriceAlertStore;
  getFlightAggregator: () => PriceAggregatorProvider | undefined;
  getHotelAggregator: () => PriceAggregatorProvider | undefined;
  onPriceDropDetected?: (event: PriceDropEvent) => void;
  onTargetReached?: (event: TargetReachedEvent) => void;
}

export interface PriceDropEvent {
  alertId: string;
  userId: string;
  type: TravelPriceAlertType;
  destination: string;
  previousPrice: number;
  currentPrice: number;
  dropPercent: number;
  isAllTimeLow: boolean;
}

export interface TargetReachedEvent {
  alertId: string;
  userId: string;
  type: TravelPriceAlertType;
  destination: string;
  targetPrice: number;
  currentPrice: number;
}

/**
 * Engine for monitoring travel prices and triggering alerts
 */
export class AlertEngine {
  private readonly config: AlertEngineConfig;
  private readonly deps: AlertEngineDeps;
  private flightInterval: NodeJS.Timeout | null = null;
  private hotelInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(config: AlertEngineConfig, deps: AlertEngineDeps) {
    this.config = config;
    this.deps = deps;
  }

  /**
   * Create a new price alert
   */
  async createAlert(
    userId: string,
    type: TravelPriceAlertType,
    params: {
      origin?: string;
      destination: string;
      outboundDate: number;
      returnDate?: number;
      targetPrice: number;
      notificationChannels?: string[];
    }
  ): Promise<TravelPriceAlert> {
    // Check user alert limit
    const existingCount = await this.deps.store.countAlerts(userId, { isActive: true });
    if (existingCount >= this.config.maxAlertsPerUser) {
      throw new Error(`Maximum alerts (${this.config.maxAlertsPerUser}) reached`);
    }

    const alert = await this.deps.store.createAlert({
      userId,
      type,
      origin: params.origin,
      destination: params.destination,
      outboundDate: params.outboundDate,
      returnDate: params.returnDate,
      targetPrice: params.targetPrice,
      priceHistory: [],
      isActive: true,
      notificationChannels: params.notificationChannels ?? this.config.notificationChannels,
    });

    // Fetch initial price
    await this.checkAlertPrice(alert);

    return alert;
  }

  /**
   * Update an existing alert
   */
  async updateAlert(
    alertId: string,
    updates: Partial<Pick<TravelPriceAlert, 'targetPrice' | 'notificationChannels' | 'isActive'>>
  ): Promise<TravelPriceAlert | null> {
    return this.deps.store.updateAlert(alertId, updates);
  }

  /**
   * Delete an alert
   */
  async deleteAlert(alertId: string): Promise<boolean> {
    return this.deps.store.deleteAlert(alertId);
  }

  /**
   * Get alert by ID
   */
  async getAlert(alertId: string): Promise<TravelPriceAlert | null> {
    return this.deps.store.getAlert(alertId);
  }

  /**
   * List alerts for a user
   */
  async listAlerts(
    userId: string,
    options?: { type?: TravelPriceAlertType[]; isActive?: boolean }
  ): Promise<TravelPriceAlert[]> {
    return this.deps.store.listAlerts(userId, options);
  }

  /**
   * Check price for a single alert
   */
  async checkAlertPrice(alert: TravelPriceAlert): Promise<TravelPriceCheckResult | null> {
    const aggregator = alert.type === 'flight'
      ? this.deps.getFlightAggregator()
      : this.deps.getHotelAggregator();

    if (!aggregator) {
      return null;
    }

    try {
      let currentPrice: number;

      if (alert.type === 'flight') {
        const results = await aggregator.searchFlightPrices(
          alert.origin ?? '',
          alert.destination,
          alert.outboundDate,
          alert.returnDate
        );

        if (results.length === 0) {
          return null;
        }

        // Get lowest price from results
        currentPrice = Math.min(...results.map(r => r.price));
      } else {
        const results = await aggregator.searchHotelPrices(
          alert.destination,
          alert.outboundDate,
          alert.returnDate ?? alert.outboundDate + (24 * 60 * 60 * 1000)
        );

        if (results.length === 0) {
          return null;
        }

        currentPrice = Math.min(...results.map(r => r.price));
      }

      // Calculate price change
      const previousPrice = alert.currentPrice;
      let priceChange: TravelPriceCheckResult['priceChange'];

      if (previousPrice !== undefined) {
        const amount = currentPrice - previousPrice;
        const percentChange = (amount / previousPrice) * 100;

        priceChange = {
          direction: amount > 0 ? 'up' : (amount < 0 ? 'down' : 'unchanged'),
          amount: Math.abs(amount),
          percentChange: Math.abs(percentChange),
        };
      }

      // Update alert with new price
      const pricePoint: TravelPricePoint = {
        price: currentPrice,
        timestamp: Date.now(),
        source: 'aggregator',
      };

      await this.deps.store.addPricePoint(alert.id, pricePoint);

      // Check for events
      const isAllTimeLow = !alert.lowestPrice || currentPrice < alert.lowestPrice;

      // Check if price dropped
      if (priceChange?.direction === 'down' && priceChange.percentChange >= 5) {
        this.emitPriceDropEvent(alert, previousPrice!, currentPrice, priceChange.percentChange, isAllTimeLow);
      }

      // Check if target reached
      if (currentPrice <= alert.targetPrice && !alert.triggeredAt) {
        await this.deps.store.markAlertTriggered(alert.id);
        this.emitTargetReachedEvent(alert, currentPrice);
      }

      return {
        alertId: alert.id,
        currentPrice,
        previousPrice,
        lowestPrice: isAllTimeLow ? currentPrice : (alert.lowestPrice ?? currentPrice),
        priceChange,
        checkedAt: Date.now(),
        source: 'aggregator',
      };
    } catch (error) {
      console.error(`Error checking price for alert ${alert.id}:`, error);
      return null;
    }
  }

  /**
   * Process all pending alerts of a specific type
   */
  async processAlerts(type: TravelPriceAlertType): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }

    this.isProcessing = true;
    let processed = 0;

    try {
      const alerts = await this.deps.store.getAlertsToCheck(type, 50);

      for (const alert of alerts) {
        await this.checkAlertPrice(alert);
        processed++;

        // Small delay between checks to avoid rate limiting
        await this.delay(500);
      }
    } finally {
      this.isProcessing = false;
    }

    return processed;
  }

  /**
   * Get price history for an alert
   */
  async getPriceHistory(alertId: string): Promise<TravelPricePoint[]> {
    const alert = await this.deps.store.getAlert(alertId);
    return alert?.priceHistory ?? [];
  }

  /**
   * Get price analytics for an alert
   */
  async getPriceAnalytics(alertId: string): Promise<{
    currentPrice?: number;
    lowestPrice?: number;
    highestPrice?: number;
    averagePrice?: number;
    priceVolatility?: number;
    trend: 'rising' | 'falling' | 'stable' | 'unknown';
  }> {
    const alert = await this.deps.store.getAlert(alertId);
    if (!alert || alert.priceHistory.length === 0) {
      return { trend: 'unknown' };
    }

    const prices = alert.priceHistory.map(p => p.price);
    const currentPrice = prices[prices.length - 1];
    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);
    const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;

    // Calculate volatility (standard deviation)
    const squaredDiffs = prices.map(p => Math.pow(p - averagePrice, 2));
    const priceVolatility = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / prices.length);

    // Determine trend from recent prices
    let trend: 'rising' | 'falling' | 'stable' | 'unknown' = 'unknown';
    if (prices.length >= 3) {
      const recent = prices.slice(-3);
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const older = prices.slice(-6, -3);

      if (older.length > 0) {
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        const diff = recentAvg - olderAvg;
        const threshold = olderAvg * 0.03; // 3% threshold

        if (diff > threshold) {
          trend = 'rising';
        } else if (diff < -threshold) {
          trend = 'falling';
        } else {
          trend = 'stable';
        }
      }
    }

    return {
      currentPrice,
      lowestPrice,
      highestPrice,
      averagePrice: Math.round(averagePrice),
      priceVolatility: Math.round(priceVolatility),
      trend,
    };
  }

  /**
   * Start the alert monitoring loops
   */
  start(): void {
    if (!this.config.enabled) {
      return;
    }

    // Start flight price monitoring
    this.flightInterval = setInterval(
      () => this.processAlerts('flight').catch(console.error),
      this.config.flightCheckIntervalMinutes * 60 * 1000
    );

    // Start hotel price monitoring
    this.hotelInterval = setInterval(
      () => this.processAlerts('hotel').catch(console.error),
      this.config.hotelCheckIntervalMinutes * 60 * 1000
    );

    // Process immediately
    this.processAlerts('flight').catch(console.error);
    this.processAlerts('hotel').catch(console.error);
  }

  /**
   * Stop the alert monitoring
   */
  stop(): void {
    if (this.flightInterval) {
      clearInterval(this.flightInterval);
      this.flightInterval = null;
    }

    if (this.hotelInterval) {
      clearInterval(this.hotelInterval);
      this.hotelInterval = null;
    }
  }

  /**
   * Check if engine is running
   */
  isRunning(): boolean {
    return this.flightInterval !== null || this.hotelInterval !== null;
  }

  private emitPriceDropEvent(
    alert: TravelPriceAlert,
    previousPrice: number,
    currentPrice: number,
    dropPercent: number,
    isAllTimeLow: boolean
  ): void {
    if (this.deps.onPriceDropDetected) {
      this.deps.onPriceDropDetected({
        alertId: alert.id,
        userId: alert.userId,
        type: alert.type,
        destination: alert.destination,
        previousPrice,
        currentPrice,
        dropPercent,
        isAllTimeLow,
      });
    }
  }

  private emitTargetReachedEvent(alert: TravelPriceAlert, currentPrice: number): void {
    if (this.deps.onTargetReached) {
      this.deps.onTargetReached({
        alertId: alert.id,
        userId: alert.userId,
        type: alert.type,
        destination: alert.destination,
        targetPrice: alert.targetPrice,
        currentPrice,
      });
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create an alert engine instance
 */
export function createAlertEngine(
  config: Partial<AlertEngineConfig>,
  deps: AlertEngineDeps
): AlertEngine {
  const fullConfig: AlertEngineConfig = {
    enabled: config.enabled ?? true,
    flightCheckIntervalMinutes: config.flightCheckIntervalMinutes ?? 360,
    hotelCheckIntervalMinutes: config.hotelCheckIntervalMinutes ?? 720,
    maxAlertsPerUser: config.maxAlertsPerUser ?? 20,
    notificationChannels: config.notificationChannels ?? ['email'],
  };

  return new AlertEngine(fullConfig, deps);
}
