/**
 * Trading Bot Service
 *
 * Facade for automated trading functionality.
 */

import { EventEmitter } from 'events';
import type {
  Trade,
  TradingSignal,
  AggregatedSignal,
  TradingStrategy,
  Portfolio,
  Asset,
  ExchangeId,
} from '../../types.js';
import type { TradingBotConfig } from '../../config.js';
import { FINANCE_EVENTS } from '../../constants.js';

// =============================================================================
// Service Interface
// =============================================================================

export interface TradingBotService {
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;

  // Strategies
  addStrategy(strategy: TradingStrategy): void;
  removeStrategy(strategyId: string): boolean;
  enableStrategy(strategyId: string, enabled: boolean): void;
  getStrategies(): TradingStrategy[];

  // Signals
  submitSignal(signal: TradingSignal): void;
  getAggregatedSignals(): AggregatedSignal[];

  // Manual execution
  executeSignal(signal: TradingSignal, portfolio: Portfolio): Promise<Trade | null>;

  // Events
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

// =============================================================================
// Implementation
// =============================================================================

export class TradingBotServiceImpl extends EventEmitter implements TradingBotService {
  private config: TradingBotConfig;
  private running = false;
  private strategies = new Map<string, TradingStrategy>();
  private pendingSignals: TradingSignal[] = [];
  private aggregatedSignals = new Map<Asset, AggregatedSignal>();

  constructor(config?: Partial<TradingBotConfig>) {
    super();
    this.config = {
      enabled: false,
      paperTrading: true,
      maxConcurrentStrategies: 3,
      signalAggregationMethod: 'consensus',
      minAggregatedConfidence: 0.7,
      executionDelayMs: 1000,
      orderTimeoutMs: 30000,
      retryFailedOrders: false,
      logAllSignals: true,
      ...config,
    };
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('Trading bot is disabled in configuration');
    }

    this.running = true;
    this.emit('started', { paperTrading: this.config.paperTrading });
  }

  async stop(): Promise<void> {
    this.running = false;
    this.emit('stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  addStrategy(strategy: TradingStrategy): void {
    if (this.strategies.size >= this.config.maxConcurrentStrategies) {
      throw new Error(`Maximum ${this.config.maxConcurrentStrategies} strategies allowed`);
    }
    this.strategies.set(strategy.id, strategy);
    this.emit('strategy:added', strategy);
  }

  removeStrategy(strategyId: string): boolean {
    const removed = this.strategies.delete(strategyId);
    if (removed) {
      this.emit('strategy:removed', { strategyId });
    }
    return removed;
  }

  enableStrategy(strategyId: string, enabled: boolean): void {
    const strategy = this.strategies.get(strategyId);
    if (strategy) {
      strategy.enabled = enabled;
      this.emit('strategy:updated', { strategyId, enabled });
    }
  }

  getStrategies(): TradingStrategy[] {
    return Array.from(this.strategies.values());
  }

  submitSignal(signal: TradingSignal): void {
    this.pendingSignals.push(signal);

    if (this.config.logAllSignals) {
      this.emit('signal:received', signal);
    }

    this.aggregateSignals(signal.asset);
  }

  private aggregateSignals(asset: Asset): void {
    const assetSignals = this.pendingSignals.filter(s => s.asset === asset);

    if (assetSignals.length === 0) {
      return;
    }

    // Calculate aggregate based on method
    let consensusAction: 'buy' | 'sell' | 'hold' = 'hold';
    let aggregateStrength = 0;
    let aggregateConfidence = 0;

    switch (this.config.signalAggregationMethod) {
      case 'weighted': {
        let totalWeight = 0;
        let weightedSum = 0;

        for (const signal of assetSignals) {
          const weight = signal.confidence;
          totalWeight += weight;
          weightedSum += (signal.action === 'buy' ? 1 : signal.action === 'sell' ? -1 : 0) * signal.strength * weight;
        }

        const avgSignal = totalWeight > 0 ? weightedSum / totalWeight : 0;
        consensusAction = avgSignal > 0.3 ? 'buy' : avgSignal < -0.3 ? 'sell' : 'hold';
        aggregateStrength = Math.abs(avgSignal);
        aggregateConfidence = totalWeight / assetSignals.length;
        break;
      }

      case 'strongest': {
        const strongest = assetSignals.reduce((max, s) =>
          s.strength * s.confidence > max.strength * max.confidence ? s : max
        );
        consensusAction = strongest.action;
        aggregateStrength = strongest.strength;
        aggregateConfidence = strongest.confidence;
        break;
      }

      case 'consensus':
      default: {
        const buyCount = assetSignals.filter(s => s.action === 'buy').length;
        const sellCount = assetSignals.filter(s => s.action === 'sell').length;
        const total = assetSignals.length;

        consensusAction = buyCount > sellCount * 1.5 ? 'buy' :
                         sellCount > buyCount * 1.5 ? 'sell' : 'hold';
        aggregateStrength = Math.max(buyCount, sellCount) / total;
        aggregateConfidence = assetSignals.reduce((sum, s) => sum + s.confidence, 0) / total;
        break;
      }
    }

    const aggregated: AggregatedSignal = {
      asset,
      signals: assetSignals,
      consensusAction,
      aggregateStrength,
      aggregateConfidence,
      agreementRatio: assetSignals.filter(s => s.action === consensusAction).length / assetSignals.length,
      conflictingSignals: new Set(assetSignals.map(s => s.action)).size > 1,
      recommendation: `${consensusAction.toUpperCase()} with ${(aggregateConfidence * 100).toFixed(0)}% confidence`,
      timestamp: Date.now(),
    };

    this.aggregatedSignals.set(asset, aggregated);
    this.emit('signal:aggregated', aggregated);
  }

  getAggregatedSignals(): AggregatedSignal[] {
    return Array.from(this.aggregatedSignals.values());
  }

  async executeSignal(signal: TradingSignal, portfolio: Portfolio): Promise<Trade | null> {
    if (!this.running) {
      throw new Error('Trading bot is not running');
    }

    if (signal.confidence < this.config.minAggregatedConfidence) {
      this.emit('signal:rejected', { signal, reason: 'Low confidence' });
      return null;
    }

    // In paper trading mode, simulate execution
    if (this.config.paperTrading) {
      this.emit('trade:simulated', { signal });
      return null;
    }

    // Execution delay
    if (this.config.executionDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.executionDelayMs));
    }

    // Actual execution would happen here via exchange provider
    this.emit(FINANCE_EVENTS.ORDER_SUBMITTED, { signal });

    return null;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTradingBotService(config?: Partial<TradingBotConfig>): TradingBotService {
  return new TradingBotServiceImpl(config);
}
