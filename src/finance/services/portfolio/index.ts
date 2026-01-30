/**
 * Portfolio Service
 *
 * Portfolio tracking, rebalancing, and performance analysis.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  Portfolio,
  Position,
  RebalanceSuggestion,
  PortfolioPerformance,
  PortfolioSnapshot,
  AllocationTarget,
  Asset,
} from '../../types.js';
import type { PortfolioConfig } from '../../config.js';
import type { PortfolioStore } from '../../stores/portfolio-store.js';
import { FINANCE_EVENTS, FINANCE_DEFAULTS } from '../../constants.js';

// =============================================================================
// Service Interface
// =============================================================================

export interface PortfolioService {
  // Initialization
  initialize(store: PortfolioStore): Promise<void>;

  // Portfolio management
  createPortfolio(userId: string, name: string, initialCash?: number): Promise<Portfolio>;
  getPortfolio(userId: string): Promise<Portfolio | null>;
  updatePortfolio(portfolioId: string, updates: Partial<Portfolio>): Promise<Portfolio | null>;

  // Position management
  addPosition(portfolioId: string, asset: Asset, quantity: number, price: number): Promise<Position>;
  updatePosition(positionId: string, quantity: number, price: number): Promise<Position | null>;
  closePosition(positionId: string, exitPrice: number): Promise<number>; // Returns realized P&L

  // Rebalancing
  setTargetAllocations(portfolioId: string, targets: AllocationTarget[]): Promise<void>;
  getRebalanceSuggestions(portfolioId: string): Promise<RebalanceSuggestion[]>;

  // Performance
  getPerformance(portfolioId: string, period: PortfolioPerformance['period']): Promise<PortfolioPerformance>;
  takeSnapshot(portfolioId: string): Promise<PortfolioSnapshot>;

  // Events
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

// =============================================================================
// Implementation
// =============================================================================

export class PortfolioServiceImpl extends EventEmitter implements PortfolioService {
  private config: PortfolioConfig;
  private store: PortfolioStore | null = null;

  constructor(config?: Partial<PortfolioConfig>) {
    super();
    this.config = {
      enabled: true,
      defaultCurrency: 'USD',
      rebalanceThresholdPercent: 5,
      snapshotIntervalHours: 6,
      performanceCalculationMethod: 'twrr',
      taxLotMethod: 'fifo',
      includeFees: true,
      trackUnrealizedGains: true,
      ...config,
    };
  }

  async initialize(store: PortfolioStore): Promise<void> {
    this.store = store;
    await this.store.initialize();
  }

  async createPortfolio(
    userId: string,
    name: string,
    initialCash = 0
  ): Promise<Portfolio> {
    this.ensureInitialized();

    const portfolio = await this.store!.createPortfolio({
      userId,
      name,
      positions: [],
      cashBalance: { amount: initialCash, currency: this.config.defaultCurrency },
      totalValue: { amount: initialCash, currency: this.config.defaultCurrency },
    });

    this.emit(FINANCE_EVENTS.PORTFOLIO_UPDATED, portfolio);

    return portfolio;
  }

  async getPortfolio(userId: string): Promise<Portfolio | null> {
    this.ensureInitialized();
    return this.store!.getPortfolioByUserId(userId);
  }

  async updatePortfolio(
    portfolioId: string,
    updates: Partial<Portfolio>
  ): Promise<Portfolio | null> {
    this.ensureInitialized();

    const portfolio = await this.store!.updatePortfolio(portfolioId, updates);

    if (portfolio) {
      this.emit(FINANCE_EVENTS.PORTFOLIO_UPDATED, portfolio);
    }

    return portfolio;
  }

  async addPosition(
    portfolioId: string,
    asset: Asset,
    quantity: number,
    price: number
  ): Promise<Position> {
    this.ensureInitialized();

    const portfolio = await this.store!.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error('Portfolio not found');
    }

    // Check if position already exists
    let position = await this.store!.getPositionByAsset(portfolioId, asset);

    if (position) {
      // Update existing position
      const newQuantity = position.quantity + quantity;
      const newCostBasis = position.costBasis + (quantity * price);
      const newAvgPrice = newCostBasis / newQuantity;

      position = await this.store!.updatePosition(position.id, {
        quantity: newQuantity,
        costBasis: newCostBasis,
        avgEntryPrice: newAvgPrice,
        currentPrice: price,
        currentValue: newQuantity * price,
      }) ?? position;

      // Add lot
      await this.store!.addLot(position.id, {
        quantity,
        price,
        date: Date.now(),
        fees: 0,
      });
    } else {
      // Create new position
      position = await this.store!.createPosition({
        portfolioId,
        asset,
        quantity,
        costBasis: quantity * price,
        currentPrice: price,
        currentValue: quantity * price,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        realizedPnL: 0,
        allocationPercent: 0,
        avgEntryPrice: price,
        firstBuyDate: Date.now(),
        lastUpdateDate: Date.now(),
        lots: [{
          id: randomUUID(),
          quantity,
          price,
          date: Date.now(),
          fees: 0,
        }],
      });
    }

    // Update portfolio totals
    await this.updatePortfolioTotals(portfolioId);

    this.emit(FINANCE_EVENTS.POSITION_OPENED, position);

    return position;
  }

  async updatePosition(
    positionId: string,
    quantity: number,
    price: number
  ): Promise<Position | null> {
    this.ensureInitialized();

    const position = await this.store!.getPosition(positionId);
    if (!position) {
      return null;
    }

    const updated = await this.store!.updatePosition(positionId, {
      quantity,
      currentPrice: price,
      currentValue: quantity * price,
      unrealizedPnL: (price * quantity) - position.costBasis,
      unrealizedPnLPercent: position.costBasis > 0
        ? ((price * quantity - position.costBasis) / position.costBasis) * 100
        : 0,
    });

    if (updated) {
      await this.updatePortfolioTotals(position.portfolioId);
      this.emit(FINANCE_EVENTS.POSITION_UPDATED, updated);
    }

    return updated;
  }

  async closePosition(positionId: string, exitPrice: number): Promise<number> {
    this.ensureInitialized();

    const position = await this.store!.getPosition(positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    // Calculate realized P&L
    const realizedPnL = (exitPrice * position.quantity) - position.costBasis;

    // Delete position
    await this.store!.deletePosition(positionId);

    // Update portfolio totals
    await this.updatePortfolioTotals(position.portfolioId);

    this.emit(FINANCE_EVENTS.POSITION_CLOSED, { position, realizedPnL, exitPrice });

    return realizedPnL;
  }

  async setTargetAllocations(
    portfolioId: string,
    targets: AllocationTarget[]
  ): Promise<void> {
    this.ensureInitialized();

    // Validate allocations sum to 100%
    const total = targets.reduce((sum, t) => sum + t.targetPercent, 0);
    if (Math.abs(total - 100) > 0.01) {
      throw new Error(`Target allocations must sum to 100%, got ${total}%`);
    }

    await this.store!.setAllocationTargets(portfolioId, targets);
  }

  async getRebalanceSuggestions(portfolioId: string): Promise<RebalanceSuggestion[]> {
    this.ensureInitialized();

    const portfolio = await this.store!.getPortfolio(portfolioId);
    if (!portfolio) {
      return [];
    }

    const targets = portfolio.targetAllocations ?? [];
    if (targets.length === 0) {
      return [];
    }

    const suggestions: RebalanceSuggestion[] = [];
    const threshold = this.config.rebalanceThresholdPercent ?? FINANCE_DEFAULTS.REBALANCE_THRESHOLD_PERCENT;

    for (const target of targets) {
      const position = portfolio.positions.find(p => p.asset === target.asset);
      const currentAllocation = position?.allocationPercent ?? 0;
      const drift = currentAllocation - target.targetPercent;

      if (Math.abs(drift) >= threshold) {
        const action = drift > 0 ? 'sell' : 'buy';
        const driftValue = Math.abs(drift / 100) * portfolio.totalValue.amount;

        suggestions.push({
          id: randomUUID(),
          portfolioId,
          asset: target.asset,
          action,
          quantity: driftValue / (position?.currentPrice ?? 1),
          estimatedValue: driftValue,
          currentAllocation,
          targetAllocation: target.targetPercent,
          drift,
          priority: Math.abs(drift) >= threshold * 2 ? 'high' : 'medium',
          reason: `${target.asset} is ${Math.abs(drift).toFixed(1)}% ${drift > 0 ? 'overweight' : 'underweight'}`,
          createdAt: Date.now(),
        });
      }
    }

    if (suggestions.length > 0) {
      this.emit(FINANCE_EVENTS.REBALANCE_SUGGESTED, suggestions);
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  async getPerformance(
    portfolioId: string,
    period: PortfolioPerformance['period']
  ): Promise<PortfolioPerformance> {
    this.ensureInitialized();

    const portfolio = await this.store!.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error('Portfolio not found');
    }

    // Get snapshots for period
    const now = Date.now();
    const periodMs = this.getPeriodMs(period);
    const startTime = now - periodMs;

    const snapshots = await this.store!.getSnapshots(portfolioId, startTime, now);

    if (snapshots.length === 0) {
      // No historical data, return current state
      return {
        portfolioId,
        period,
        startValue: portfolio.totalValue.amount,
        endValue: portfolio.totalValue.amount,
        totalReturn: 0,
        totalReturnPercent: 0,
        annualizedReturn: 0,
        volatility: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        maxDrawdown: 0,
        maxDrawdownDate: now,
        winRate: 0,
        profitFactor: 0,
        bestDay: { date: '', return: 0 },
        worstDay: { date: '', return: 0 },
        dailyReturns: [],
      };
    }

    const startValue = snapshots[0].totalValue;
    const endValue = portfolio.totalValue.amount;
    const totalReturn = endValue - startValue;
    const totalReturnPercent = startValue > 0 ? (totalReturn / startValue) * 100 : 0;

    // Calculate daily returns
    const dailyReturns = this.calculateDailyReturns(snapshots);

    // Calculate performance metrics
    const volatility = this.calculateVolatility(dailyReturns);
    const annualizedReturn = this.annualizeReturn(totalReturnPercent, periodMs);
    const sharpeRatio = volatility > 0 ? (annualizedReturn - 2) / volatility : 0; // Assuming 2% risk-free rate
    const sortinoRatio = this.calculateSortinoRatio(dailyReturns, annualizedReturn);

    // Find max drawdown
    const { maxDrawdown, maxDrawdownDate } = this.findMaxDrawdown(snapshots);

    // Find best/worst days
    const bestDay = dailyReturns.reduce((best, day) =>
      day.return > best.return ? day : best,
      { date: '', return: -Infinity, value: 0 }
    );
    const worstDay = dailyReturns.reduce((worst, day) =>
      day.return < worst.return ? day : worst,
      { date: '', return: Infinity, value: 0 }
    );

    // Calculate win rate and profit factor
    const wins = dailyReturns.filter(d => d.return > 0);
    const losses = dailyReturns.filter(d => d.return < 0);
    const winRate = dailyReturns.length > 0 ? wins.length / dailyReturns.length : 0;
    const totalWins = wins.reduce((sum, d) => sum + d.return, 0);
    const totalLosses = Math.abs(losses.reduce((sum, d) => sum + d.return, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    return {
      portfolioId,
      period,
      startValue,
      endValue,
      totalReturn,
      totalReturnPercent,
      annualizedReturn,
      volatility,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      maxDrawdownDate,
      winRate,
      profitFactor,
      bestDay: { date: bestDay.date, return: bestDay.return },
      worstDay: { date: worstDay.date, return: worstDay.return },
      dailyReturns,
    };
  }

  async takeSnapshot(portfolioId: string): Promise<PortfolioSnapshot> {
    this.ensureInitialized();

    const portfolio = await this.store!.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error('Portfolio not found');
    }

    const snapshot: PortfolioSnapshot = {
      portfolioId,
      timestamp: Date.now(),
      totalValue: portfolio.totalValue.amount,
      positions: portfolio.positions.map(p => ({
        asset: p.asset,
        quantity: p.quantity,
        value: p.currentValue,
        allocation: p.allocationPercent,
      })),
    };

    await this.store!.saveSnapshot(snapshot);

    this.emit(FINANCE_EVENTS.PERFORMANCE_SNAPSHOT, snapshot);

    return snapshot;
  }

  private ensureInitialized(): void {
    if (!this.store) {
      throw new Error('Portfolio service not initialized');
    }
  }

  private async updatePortfolioTotals(portfolioId: string): Promise<void> {
    const positions = await this.store!.listPositions(portfolioId);
    const portfolio = await this.store!.getPortfolio(portfolioId);

    if (!portfolio) return;

    const positionsValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
    const totalValue = portfolio.cashBalance.amount + positionsValue;

    // Update allocation percentages
    for (const position of positions) {
      const allocation = totalValue > 0 ? (position.currentValue / totalValue) * 100 : 0;
      await this.store!.updatePosition(position.id, { allocationPercent: allocation });
    }

    await this.store!.updatePortfolio(portfolioId, {
      totalValue: { amount: totalValue, currency: portfolio.totalValue.currency },
    });
  }

  private getPeriodMs(period: PortfolioPerformance['period']): number {
    const day = 24 * 60 * 60 * 1000;
    switch (period) {
      case '1d': return day;
      case '1w': return 7 * day;
      case '1m': return 30 * day;
      case '3m': return 90 * day;
      case '6m': return 180 * day;
      case '1y': return 365 * day;
      case 'ytd':
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        return now.getTime() - startOfYear.getTime();
      case 'all': return 10 * 365 * day;
      default: return 30 * day;
    }
  }

  private calculateDailyReturns(
    snapshots: PortfolioSnapshot[]
  ): Array<{ date: string; return: number; value: number }> {
    const returns: Array<{ date: string; return: number; value: number }> = [];

    for (let i = 1; i < snapshots.length; i++) {
      const prev = snapshots[i - 1];
      const curr = snapshots[i];
      const dailyReturn = prev.totalValue > 0
        ? ((curr.totalValue - prev.totalValue) / prev.totalValue) * 100
        : 0;

      returns.push({
        date: new Date(curr.timestamp).toISOString().split('T')[0],
        return: dailyReturn,
        value: curr.totalValue,
      });
    }

    return returns;
  }

  private calculateVolatility(
    dailyReturns: Array<{ return: number }>
  ): number {
    if (dailyReturns.length < 2) return 0;

    const returns = dailyReturns.map(d => d.return);
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

    // Annualize (assuming 252 trading days)
    return Math.sqrt(variance * 252);
  }

  private annualizeReturn(totalReturnPercent: number, periodMs: number): number {
    const years = periodMs / (365 * 24 * 60 * 60 * 1000);
    if (years <= 0) return 0;
    return (Math.pow(1 + totalReturnPercent / 100, 1 / years) - 1) * 100;
  }

  private calculateSortinoRatio(
    dailyReturns: Array<{ return: number }>,
    annualizedReturn: number
  ): number {
    const negativeReturns = dailyReturns.filter(d => d.return < 0).map(d => d.return);
    if (negativeReturns.length === 0) return annualizedReturn > 0 ? Infinity : 0;

    const downsideVariance = negativeReturns.reduce((sum, r) => sum + r * r, 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance * 252);

    return downsideDeviation > 0 ? (annualizedReturn - 2) / downsideDeviation : 0;
  }

  private findMaxDrawdown(
    snapshots: PortfolioSnapshot[]
  ): { maxDrawdown: number; maxDrawdownDate: number } {
    let peak = 0;
    let maxDrawdown = 0;
    let maxDrawdownDate = Date.now();

    for (const snapshot of snapshots) {
      if (snapshot.totalValue > peak) {
        peak = snapshot.totalValue;
      }

      const drawdown = peak > 0 ? ((peak - snapshot.totalValue) / peak) * 100 : 0;

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownDate = snapshot.timestamp;
      }
    }

    return { maxDrawdown, maxDrawdownDate };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPortfolioService(config?: Partial<PortfolioConfig>): PortfolioService {
  return new PortfolioServiceImpl(config);
}
