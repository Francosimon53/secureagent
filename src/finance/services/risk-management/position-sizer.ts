/**
 * Position Sizer
 *
 * Calculates optimal position sizes based on risk parameters.
 */

import type {
  RiskRules,
  PositionSizeResult,
  Portfolio,
} from '../../types.js';
import { DEFAULT_RISK_RULES } from '../../config.js';

// =============================================================================
// Position Sizing Methods
// =============================================================================

export type PositionSizingMethod =
  | 'fixed'        // Fixed dollar amount
  | 'percent'      // Percentage of portfolio
  | 'risk-based'   // Based on max risk per trade
  | 'kelly'        // Kelly Criterion
  | 'volatility';  // Based on asset volatility

export interface PositionSizeRequest {
  portfolio: Portfolio;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  method?: PositionSizingMethod;
  fixedAmount?: number;
  percentAmount?: number;
  winRate?: number;        // For Kelly
  avgWinLoss?: number;     // For Kelly (avg win / avg loss)
  volatility?: number;     // For volatility-based sizing
}

// =============================================================================
// Position Sizer
// =============================================================================

export class PositionSizer {
  private rules: RiskRules;

  constructor(rules?: Partial<RiskRules>) {
    this.rules = { ...DEFAULT_RISK_RULES, ...rules };
  }

  /**
   * Update risk rules
   */
  updateRules(rules: Partial<RiskRules>): void {
    this.rules = { ...this.rules, ...rules };
  }

  /**
   * Calculate recommended position size
   */
  calculatePositionSize(request: PositionSizeRequest): PositionSizeResult {
    const {
      portfolio,
      entryPrice,
      stopLossPrice,
      takeProfitPrice,
      method = 'risk-based',
    } = request;

    const portfolioValue = portfolio.totalValue.amount;
    const stopLossDistance = Math.abs(entryPrice - stopLossPrice);
    const stopLossPercent = (stopLossDistance / entryPrice) * 100;

    // Calculate max allowed quantity based on position size rule
    const maxPositionValue = (portfolioValue * this.rules.maxPositionSizePercent) / 100;
    const maxAllowedQuantity = maxPositionValue / entryPrice;

    // Calculate quantity based on method
    let recommendedQuantity: number;
    const notes: string[] = [];

    switch (method) {
      case 'fixed':
        recommendedQuantity = this.calculateFixedSize(
          request.fixedAmount ?? 1000,
          entryPrice
        );
        notes.push(`Fixed amount: $${request.fixedAmount ?? 1000}`);
        break;

      case 'percent':
        recommendedQuantity = this.calculatePercentSize(
          portfolioValue,
          request.percentAmount ?? 5,
          entryPrice
        );
        notes.push(`Portfolio percent: ${request.percentAmount ?? 5}%`);
        break;

      case 'kelly':
        recommendedQuantity = this.calculateKellySize(
          portfolioValue,
          entryPrice,
          request.winRate ?? 0.5,
          request.avgWinLoss ?? 1.5
        );
        notes.push(`Kelly Criterion: winRate=${request.winRate ?? 0.5}, avgWinLoss=${request.avgWinLoss ?? 1.5}`);
        break;

      case 'volatility':
        recommendedQuantity = this.calculateVolatilitySize(
          portfolioValue,
          entryPrice,
          request.volatility ?? 0.02
        );
        notes.push(`Volatility-adjusted: volatility=${((request.volatility ?? 0.02) * 100).toFixed(1)}%`);
        break;

      case 'risk-based':
      default:
        recommendedQuantity = this.calculateRiskBasedSize(
          portfolioValue,
          entryPrice,
          stopLossDistance
        );
        notes.push(`Risk-based: max ${this.rules.maxSingleTradeRiskPercent}% risk per trade`);
    }

    // Apply maximum constraints
    recommendedQuantity = Math.min(recommendedQuantity, maxAllowedQuantity);

    // Ensure we have enough cash
    const cashAvailable = portfolio.cashBalance.amount;
    const maxFromCash = cashAvailable / entryPrice;
    const maintainingLiquidity = (portfolioValue * this.rules.minLiquidityRatio);
    const maxWithLiquidity = (cashAvailable - maintainingLiquidity) / entryPrice;

    if (recommendedQuantity > maxWithLiquidity) {
      recommendedQuantity = Math.max(0, maxWithLiquidity);
      notes.push(`Reduced to maintain ${(this.rules.minLiquidityRatio * 100).toFixed(0)}% liquidity`);
    }

    // Calculate risk metrics
    const positionValue = recommendedQuantity * entryPrice;
    const riskAmount = recommendedQuantity * stopLossDistance;
    const potentialLoss = riskAmount;
    const potentialGain = takeProfitPrice
      ? recommendedQuantity * Math.abs(takeProfitPrice - entryPrice)
      : riskAmount * this.rules.minRiskRewardRatio;

    const riskRewardRatio = potentialLoss > 0 ? potentialGain / potentialLoss : 0;
    const portfolioPercent = (positionValue / portfolioValue) * 100;

    // Determine confidence level
    let confidence: 'high' | 'medium' | 'low' = 'high';
    if (riskRewardRatio < this.rules.minRiskRewardRatio) {
      confidence = 'low';
      notes.push(`Warning: R/R ratio ${riskRewardRatio.toFixed(2)} below minimum ${this.rules.minRiskRewardRatio}`);
    } else if (stopLossPercent > 10) {
      confidence = 'medium';
      notes.push(`Note: Wide stop-loss (${stopLossPercent.toFixed(1)}%)`);
    }

    if (recommendedQuantity <= 0) {
      confidence = 'low';
      notes.push('Insufficient funds or liquidity for this trade');
    }

    return {
      recommendedQuantity,
      maxAllowedQuantity,
      riskAmount,
      portfolioPercent,
      stopLossDistance,
      potentialLoss,
      potentialGain,
      riskRewardRatio,
      confidence,
      notes,
    };
  }

  /**
   * Fixed dollar amount sizing
   */
  private calculateFixedSize(amount: number, price: number): number {
    return amount / price;
  }

  /**
   * Percentage of portfolio sizing
   */
  private calculatePercentSize(
    portfolioValue: number,
    percent: number,
    price: number
  ): number {
    const positionValue = (portfolioValue * percent) / 100;
    return positionValue / price;
  }

  /**
   * Risk-based sizing (based on stop-loss)
   */
  private calculateRiskBasedSize(
    portfolioValue: number,
    price: number,
    stopLossDistance: number
  ): number {
    const maxRiskAmount = (portfolioValue * this.rules.maxSingleTradeRiskPercent) / 100;
    return maxRiskAmount / stopLossDistance;
  }

  /**
   * Kelly Criterion sizing
   */
  private calculateKellySize(
    portfolioValue: number,
    price: number,
    winRate: number,
    avgWinLoss: number
  ): number {
    // Kelly formula: f* = (bp - q) / b
    // where b = odds (avg win/loss), p = win rate, q = lose rate
    const b = avgWinLoss;
    const p = winRate;
    const q = 1 - winRate;

    let kellyFraction = (b * p - q) / b;

    // Apply half-Kelly for more conservative sizing
    kellyFraction = kellyFraction / 2;

    // Ensure it's within reasonable bounds
    kellyFraction = Math.max(0, Math.min(kellyFraction, 0.25));

    const positionValue = portfolioValue * kellyFraction;
    return positionValue / price;
  }

  /**
   * Volatility-adjusted sizing
   */
  private calculateVolatilitySize(
    portfolioValue: number,
    price: number,
    volatility: number
  ): number {
    // Target volatility contribution (e.g., 0.5% of portfolio per day)
    const targetVolContribution = 0.005;

    // Position size = (portfolio * target vol) / (price * volatility)
    const positionValue = (portfolioValue * targetVolContribution) / volatility;
    return positionValue / price;
  }

  /**
   * Calculate position size for scaling in
   */
  calculateScaleInSizes(
    request: PositionSizeRequest,
    numEntries: number = 3
  ): Array<{ price: number; quantity: number; cumulativePercent: number }> {
    const baseResult = this.calculatePositionSize(request);
    const totalQuantity = baseResult.recommendedQuantity;

    const entries: Array<{ price: number; quantity: number; cumulativePercent: number }> = [];
    const priceStep = (request.stopLossPrice - request.entryPrice) / (numEntries + 1);

    // Distribution: 40%, 30%, 30% (can be customized)
    const distribution = numEntries === 3
      ? [0.4, 0.3, 0.3]
      : Array(numEntries).fill(1 / numEntries);

    let cumulative = 0;
    for (let i = 0; i < numEntries; i++) {
      cumulative += distribution[i];
      entries.push({
        price: request.entryPrice + priceStep * i,
        quantity: totalQuantity * distribution[i],
        cumulativePercent: cumulative * 100,
      });
    }

    return entries;
  }

  /**
   * Validate if a position size is acceptable
   */
  validatePositionSize(
    quantity: number,
    price: number,
    portfolio: Portfolio
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    const positionValue = quantity * price;
    const portfolioValue = portfolio.totalValue.amount;
    const positionPercent = (positionValue / portfolioValue) * 100;

    if (positionPercent > this.rules.maxPositionSizePercent) {
      issues.push(
        `Position ${positionPercent.toFixed(1)}% exceeds max ${this.rules.maxPositionSizePercent}%`
      );
    }

    if (positionValue > portfolio.cashBalance.amount) {
      issues.push('Insufficient cash for this position');
    }

    const remainingCash = portfolio.cashBalance.amount - positionValue;
    const remainingCashPercent = (remainingCash / portfolioValue) * 100;
    if (remainingCashPercent < this.rules.minLiquidityRatio * 100) {
      issues.push(
        `Would leave only ${remainingCashPercent.toFixed(1)}% cash (min: ${this.rules.minLiquidityRatio * 100}%)`
      );
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPositionSizer(rules?: Partial<RiskRules>): PositionSizer {
  return new PositionSizer(rules);
}
