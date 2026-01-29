/**
 * Price Monitoring Service
 *
 * Manages travel price alerts and monitoring.
 */

export {
  AlertEngine,
  createAlertEngine,
  type AlertEngineConfig,
  type AlertEngineDeps,
  type PriceDropEvent,
  type TargetReachedEvent,
} from './alert-engine.js';

import type { TravelPriceAlertStore } from '../../stores/price-alert-store.js';
import type {
  TravelPriceAlert,
  TravelPriceAlertType,
  TravelPricePoint,
} from '../../types.js';
import type { PriceAggregatorProvider } from '../../providers/base.js';
import { AlertEngine, createAlertEngine, type AlertEngineConfig } from './alert-engine.js';

export interface PriceMonitoringServiceConfig extends Partial<AlertEngineConfig> {
  enabled?: boolean;
}

export interface PriceMonitoringServiceDeps {
  store: TravelPriceAlertStore;
  getFlightAggregator: () => PriceAggregatorProvider | undefined;
  getHotelAggregator: () => PriceAggregatorProvider | undefined;
}

/**
 * High-level price monitoring service
 */
export class PriceMonitoringService {
  private readonly engine: AlertEngine;
  private readonly deps: PriceMonitoringServiceDeps;
  private readonly config: PriceMonitoringServiceConfig;

  constructor(config: PriceMonitoringServiceConfig, deps: PriceMonitoringServiceDeps) {
    this.config = config;
    this.deps = deps;

    this.engine = createAlertEngine(config, {
      store: deps.store,
      getFlightAggregator: deps.getFlightAggregator,
      getHotelAggregator: deps.getHotelAggregator,
    });
  }

  /**
   * Create a flight price alert
   */
  async createFlightAlert(
    userId: string,
    params: {
      origin: string;
      destination: string;
      outboundDate: number;
      returnDate?: number;
      targetPrice: number;
    }
  ): Promise<TravelPriceAlert> {
    return this.engine.createAlert(userId, 'flight', params);
  }

  /**
   * Create a hotel price alert
   */
  async createHotelAlert(
    userId: string,
    params: {
      destination: string;
      checkInDate: number;
      checkOutDate: number;
      targetPrice: number;
    }
  ): Promise<TravelPriceAlert> {
    return this.engine.createAlert(userId, 'hotel', {
      destination: params.destination,
      outboundDate: params.checkInDate,
      returnDate: params.checkOutDate,
      targetPrice: params.targetPrice,
    });
  }

  /**
   * Get alert by ID
   */
  async getAlert(alertId: string): Promise<TravelPriceAlert | null> {
    return this.engine.getAlert(alertId);
  }

  /**
   * List alerts for a user
   */
  async listAlerts(
    userId: string,
    options?: { type?: TravelPriceAlertType[]; isActive?: boolean }
  ): Promise<TravelPriceAlert[]> {
    return this.engine.listAlerts(userId, options);
  }

  /**
   * Update alert target price
   */
  async updateTargetPrice(alertId: string, targetPrice: number): Promise<TravelPriceAlert | null> {
    return this.engine.updateAlert(alertId, { targetPrice });
  }

  /**
   * Pause an alert
   */
  async pauseAlert(alertId: string): Promise<TravelPriceAlert | null> {
    return this.engine.updateAlert(alertId, { isActive: false });
  }

  /**
   * Resume an alert
   */
  async resumeAlert(alertId: string): Promise<TravelPriceAlert | null> {
    return this.engine.updateAlert(alertId, { isActive: true });
  }

  /**
   * Delete an alert
   */
  async deleteAlert(alertId: string): Promise<boolean> {
    return this.engine.deleteAlert(alertId);
  }

  /**
   * Manually check price for an alert
   */
  async checkPrice(alertId: string): Promise<{
    currentPrice?: number;
    previousPrice?: number;
    change?: { direction: 'up' | 'down' | 'unchanged'; percent: number };
  } | null> {
    const alert = await this.engine.getAlert(alertId);
    if (!alert) {
      return null;
    }

    const result = await this.engine.checkAlertPrice(alert);
    if (!result) {
      return null;
    }

    return {
      currentPrice: result.currentPrice,
      previousPrice: result.previousPrice,
      change: result.priceChange
        ? { direction: result.priceChange.direction, percent: result.priceChange.percentChange }
        : undefined,
    };
  }

  /**
   * Get price history for an alert
   */
  async getPriceHistory(alertId: string): Promise<TravelPricePoint[]> {
    return this.engine.getPriceHistory(alertId);
  }

  /**
   * Get price analytics for an alert
   */
  async getPriceAnalytics(alertId: string): Promise<{
    currentPrice?: number;
    lowestPrice?: number;
    highestPrice?: number;
    averagePrice?: number;
    trend: 'rising' | 'falling' | 'stable' | 'unknown';
  }> {
    return this.engine.getPriceAnalytics(alertId);
  }

  /**
   * Get alerts that have been triggered
   */
  async getTriggeredAlerts(userId: string): Promise<TravelPriceAlert[]> {
    return this.deps.store.getTriggeredAlerts(userId);
  }

  /**
   * Start the price monitoring service
   */
  start(): void {
    if (this.config.enabled !== false) {
      this.engine.start();
    }
  }

  /**
   * Stop the price monitoring service
   */
  stop(): void {
    this.engine.stop();
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.engine.isRunning();
  }
}

/**
 * Create a price monitoring service instance
 */
export function createPriceMonitoringService(
  config: PriceMonitoringServiceConfig,
  deps: PriceMonitoringServiceDeps
): PriceMonitoringService {
  return new PriceMonitoringService(config, deps);
}
