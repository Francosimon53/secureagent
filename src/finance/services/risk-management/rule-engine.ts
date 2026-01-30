/**
 * Risk Rule Engine
 *
 * Evaluates trades against risk management rules.
 */

import type {
  RiskRules,
  RiskAssessment,
  RiskViolation,
  RiskWarning,
  Trade,
  Portfolio,
  DrawdownState,
  DailyPnL,
} from '../../types.js';
import { DEFAULT_RISK_RULES } from '../../config.js';

// =============================================================================
// Rule Engine
// =============================================================================

export class RuleEngine {
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
   * Get current rules
   */
  getRules(): RiskRules {
    return { ...this.rules };
  }

  /**
   * Evaluate a trade against all risk rules
   */
  evaluateTrade(
    trade: Partial<Trade>,
    portfolio: Portfolio,
    drawdownState: DrawdownState,
    dailyPnL: DailyPnL,
    openPositions: number
  ): RiskAssessment {
    const violations: RiskViolation[] = [];
    const warnings: RiskWarning[] = [];

    // Check if trading is halted
    if (drawdownState.isHalted) {
      violations.push({
        rule: 'maxDrawdownPercent',
        message: `Trading halted due to drawdown: ${drawdownState.haltReason}`,
        currentValue: drawdownState.drawdownPercent,
        limit: this.rules.maxDrawdownPercent,
        severity: 'critical',
      });
    }

    // Check daily loss limit
    if (dailyPnL.isLossLimitReached) {
      violations.push({
        rule: 'maxDailyLossPercent',
        message: `Daily loss limit reached: ${dailyPnL.percentChange.toFixed(2)}%`,
        currentValue: Math.abs(dailyPnL.percentChange),
        limit: this.rules.maxDailyLossPercent,
        severity: 'critical',
      });
    }

    // Check position count
    if (openPositions >= this.rules.maxOpenPositions) {
      violations.push({
        rule: 'maxOpenPositions',
        message: `Maximum open positions reached: ${openPositions}/${this.rules.maxOpenPositions}`,
        currentValue: openPositions,
        limit: this.rules.maxOpenPositions,
        severity: 'high',
      });
    }

    // Check position size
    const tradeValue = (trade.quantity ?? 0) * (trade.price ?? 0);
    const positionSizePercent = (tradeValue / portfolio.totalValue.amount) * 100;

    if (positionSizePercent > this.rules.maxPositionSizePercent) {
      violations.push({
        rule: 'maxPositionSizePercent',
        message: `Position size ${positionSizePercent.toFixed(1)}% exceeds limit of ${this.rules.maxPositionSizePercent}%`,
        currentValue: positionSizePercent,
        limit: this.rules.maxPositionSizePercent,
        severity: 'high',
      });
    }

    // Check stop-loss requirement
    if (this.rules.requireStopLoss && !trade.stopLossPrice) {
      violations.push({
        rule: 'requireStopLoss',
        message: 'Stop-loss is required for all trades',
        currentValue: 0,
        limit: 1,
        severity: 'high',
      });
    }

    // Check liquidity ratio
    const cashPercent = (portfolio.cashBalance.amount / portfolio.totalValue.amount) * 100;
    if (cashPercent < this.rules.minLiquidityRatio * 100) {
      violations.push({
        rule: 'minLiquidityRatio',
        message: `Cash balance ${cashPercent.toFixed(1)}% below minimum ${this.rules.minLiquidityRatio * 100}%`,
        currentValue: cashPercent / 100,
        limit: this.rules.minLiquidityRatio,
        severity: 'high',
      });
    }

    // Check single trade risk
    if (trade.stopLossPrice && trade.price && trade.quantity) {
      const riskAmount = Math.abs(trade.price - trade.stopLossPrice) * trade.quantity;
      const riskPercent = (riskAmount / portfolio.totalValue.amount) * 100;

      if (riskPercent > this.rules.maxSingleTradeRiskPercent) {
        violations.push({
          rule: 'maxSingleTradeRiskPercent',
          message: `Trade risk ${riskPercent.toFixed(2)}% exceeds limit of ${this.rules.maxSingleTradeRiskPercent}%`,
          currentValue: riskPercent,
          limit: this.rules.maxSingleTradeRiskPercent,
          severity: 'high',
        });
      }
    }

    // Check risk/reward ratio
    if (trade.stopLossPrice && trade.takeProfitPrice && trade.price) {
      const risk = Math.abs(trade.price - trade.stopLossPrice);
      const reward = Math.abs(trade.takeProfitPrice - trade.price);
      const ratio = risk > 0 ? reward / risk : 0;

      if (ratio < this.rules.minRiskRewardRatio) {
        warnings.push({
          rule: 'minRiskRewardRatio',
          message: `Risk/reward ratio ${ratio.toFixed(2)} below minimum ${this.rules.minRiskRewardRatio}`,
          currentValue: ratio,
          threshold: this.rules.minRiskRewardRatio,
          severity: 'medium',
        });
      }
    }

    // Add warnings for approaching limits
    if (openPositions >= this.rules.maxOpenPositions * 0.8) {
      warnings.push({
        rule: 'maxOpenPositions',
        message: `Approaching position limit: ${openPositions}/${this.rules.maxOpenPositions}`,
        currentValue: openPositions,
        threshold: this.rules.maxOpenPositions * 0.8,
        severity: 'low',
      });
    }

    if (drawdownState.drawdownPercent >= this.rules.maxDrawdownPercent * 0.7) {
      warnings.push({
        rule: 'maxDrawdownPercent',
        message: `Drawdown at ${drawdownState.drawdownPercent.toFixed(1)}%, approaching limit`,
        currentValue: drawdownState.drawdownPercent,
        threshold: this.rules.maxDrawdownPercent * 0.7,
        severity: 'medium',
      });
    }

    // Calculate adjusted quantity if needed
    let adjustedQuantity: number | undefined;
    if (positionSizePercent > this.rules.maxPositionSizePercent && trade.price) {
      const maxValue = (portfolio.totalValue.amount * this.rules.maxPositionSizePercent) / 100;
      adjustedQuantity = maxValue / trade.price;
    }

    return {
      allowed: violations.length === 0,
      trade,
      violations,
      warnings,
      adjustedQuantity,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if a specific rule is violated
   */
  checkRule(
    rule: keyof RiskRules,
    currentValue: number,
    context?: Record<string, unknown>
  ): { violated: boolean; message: string } {
    const limit = this.rules[rule];

    switch (rule) {
      case 'maxPositionSizePercent':
      case 'maxDailyLossPercent':
      case 'maxDrawdownPercent':
      case 'maxSingleTradeRiskPercent':
        return {
          violated: currentValue > (limit as number),
          message: `${rule}: ${currentValue.toFixed(2)}% exceeds ${limit}%`,
        };

      case 'maxOpenPositions':
        return {
          violated: currentValue >= (limit as number),
          message: `${rule}: ${currentValue} >= ${limit}`,
        };

      case 'minLiquidityRatio':
      case 'minRiskRewardRatio':
        return {
          violated: currentValue < (limit as number),
          message: `${rule}: ${currentValue.toFixed(2)} < ${limit}`,
        };

      case 'requireStopLoss':
        return {
          violated: Boolean(limit) && !context?.hasStopLoss,
          message: 'Stop-loss is required but not set',
        };

      case 'maxLeverageRatio':
        return {
          violated: currentValue > (limit as number),
          message: `Leverage ${currentValue}x exceeds ${limit}x limit`,
        };

      case 'cooldownMinutesAfterLoss':
        return {
          violated: context?.inCooldown === true,
          message: `In cooldown period for ${limit} minutes after loss`,
        };

      default:
        return { violated: false, message: '' };
    }
  }

  /**
   * Get risk score (0-100) based on current state
   */
  calculateRiskScore(
    portfolio: Portfolio,
    drawdownState: DrawdownState,
    dailyPnL: DailyPnL,
    openPositions: number
  ): { score: number; factors: Array<{ name: string; score: number; weight: number }> } {
    const factors: Array<{ name: string; score: number; weight: number }> = [];

    // Drawdown factor (25% weight)
    const drawdownScore = Math.max(0, 100 - (drawdownState.drawdownPercent / this.rules.maxDrawdownPercent) * 100);
    factors.push({ name: 'Drawdown', score: drawdownScore, weight: 0.25 });

    // Daily P&L factor (20% weight)
    const dailyPnlScore = dailyPnL.percentChange >= 0
      ? 100
      : Math.max(0, 100 - (Math.abs(dailyPnL.percentChange) / this.rules.maxDailyLossPercent) * 100);
    factors.push({ name: 'Daily P&L', score: dailyPnlScore, weight: 0.20 });

    // Position concentration factor (20% weight)
    const largestPosition = portfolio.positions.reduce(
      (max, p) => Math.max(max, p.allocationPercent),
      0
    );
    const concentrationScore = Math.max(
      0,
      100 - (largestPosition / this.rules.maxPositionSizePercent) * 50
    );
    factors.push({ name: 'Concentration', score: concentrationScore, weight: 0.20 });

    // Liquidity factor (15% weight)
    const cashPercent = (portfolio.cashBalance.amount / portfolio.totalValue.amount) * 100;
    const liquidityScore = Math.min(100, (cashPercent / (this.rules.minLiquidityRatio * 100)) * 100);
    factors.push({ name: 'Liquidity', score: liquidityScore, weight: 0.15 });

    // Position count factor (10% weight)
    const positionScore = Math.max(0, 100 - (openPositions / this.rules.maxOpenPositions) * 100);
    factors.push({ name: 'Position Count', score: positionScore, weight: 0.10 });

    // Volatility factor (10% weight) - based on recent performance
    const volatilityScore = dailyPnL.wins + dailyPnL.losses > 0
      ? (dailyPnL.wins / (dailyPnL.wins + dailyPnL.losses)) * 100
      : 50;
    factors.push({ name: 'Win Rate', score: volatilityScore, weight: 0.10 });

    // Calculate weighted average
    const score = factors.reduce((sum, f) => sum + f.score * f.weight, 0);

    return { score, factors };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createRuleEngine(rules?: Partial<RiskRules>): RuleEngine {
  return new RuleEngine(rules);
}
