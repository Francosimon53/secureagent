/**
 * Alert Engine
 *
 * Configurable alert rules and evaluation for price monitoring.
 */

import type { PriceAlert, PricePoint, PriceDrop } from '../types.js';

/**
 * Alert rule types
 */
export type AlertRuleType =
  | 'price-below'
  | 'price-drop-percent'
  | 'price-drop-amount'
  | 'all-time-low'
  | 'back-in-stock'
  | 'price-increase'
  | 'volatility';

/**
 * Alert rule definition
 */
export interface AlertRule {
  id: string;
  type: AlertRuleType;
  threshold?: number;
  lookbackPeriodHours?: number;
  enabled: boolean;
  priority: number;
  customCondition?: (alert: PriceAlert, currentPrice: number, inStock: boolean) => boolean;
}

/**
 * Alert evaluation result
 */
export interface AlertEvaluation {
  triggered: boolean;
  rule: AlertRule;
  details: {
    previousPrice?: number;
    currentPrice: number;
    threshold?: number;
    percentChange?: number;
    amountChange?: number;
    isAllTimeLow?: boolean;
    wasOutOfStock?: boolean;
    volatility?: number;
  };
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Alert engine for evaluating price rules
 */
export class AlertEngine {
  private rules: AlertRule[] = [];

  constructor(defaultRules?: AlertRule[]) {
    if (defaultRules) {
      this.rules = defaultRules;
    } else {
      this.initializeDefaultRules();
    }
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultRules(): void {
    this.rules = [
      {
        id: 'price-below-target',
        type: 'price-below',
        enabled: true,
        priority: 1,
      },
      {
        id: 'significant-drop',
        type: 'price-drop-percent',
        threshold: 10, // 10% drop
        enabled: true,
        priority: 2,
      },
      {
        id: 'all-time-low',
        type: 'all-time-low',
        enabled: true,
        priority: 3,
      },
      {
        id: 'back-in-stock',
        type: 'back-in-stock',
        enabled: true,
        priority: 4,
      },
    ];
  }

  /**
   * Add a custom rule
   */
  addRule(rule: AlertRule): void {
    // Remove existing rule with same ID
    this.rules = this.rules.filter(r => r.id !== rule.id);
    this.rules.push(rule);
    // Sort by priority
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Remove a rule
   */
  removeRule(ruleId: string): boolean {
    const initialLength = this.rules.length;
    this.rules = this.rules.filter(r => r.id !== ruleId);
    return this.rules.length < initialLength;
  }

  /**
   * Enable or disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Get all rules
   */
  getRules(): AlertRule[] {
    return [...this.rules];
  }

  /**
   * Evaluate an alert against all enabled rules
   */
  evaluate(
    alert: PriceAlert,
    currentPrice: number,
    inStock: boolean
  ): AlertEvaluation[] {
    const evaluations: AlertEvaluation[] = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const evaluation = this.evaluateRule(alert, rule, currentPrice, inStock);
      if (evaluation.triggered) {
        evaluations.push(evaluation);
      }
    }

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    evaluations.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return evaluations;
  }

  /**
   * Evaluate a single rule
   */
  private evaluateRule(
    alert: PriceAlert,
    rule: AlertRule,
    currentPrice: number,
    inStock: boolean
  ): AlertEvaluation {
    const previousPrice = alert.currentPrice;
    const priceChange = previousPrice - currentPrice;
    const percentChange = previousPrice > 0 ? (priceChange / previousPrice) * 100 : 0;

    switch (rule.type) {
      case 'price-below':
        return this.evaluatePriceBelow(alert, rule, currentPrice, previousPrice);

      case 'price-drop-percent':
        return this.evaluatePriceDropPercent(alert, rule, currentPrice, previousPrice, percentChange);

      case 'price-drop-amount':
        return this.evaluatePriceDropAmount(alert, rule, currentPrice, previousPrice, priceChange);

      case 'all-time-low':
        return this.evaluateAllTimeLow(alert, rule, currentPrice, previousPrice);

      case 'back-in-stock':
        return this.evaluateBackInStock(alert, rule, currentPrice, inStock);

      case 'price-increase':
        return this.evaluatePriceIncrease(alert, rule, currentPrice, previousPrice, percentChange);

      case 'volatility':
        return this.evaluateVolatility(alert, rule, currentPrice);

      default:
        // Custom condition
        if (rule.customCondition) {
          const triggered = rule.customCondition(alert, currentPrice, inStock);
          return {
            triggered,
            rule,
            details: { currentPrice, previousPrice },
            message: triggered ? 'Custom condition met' : 'Custom condition not met',
            severity: 'medium',
          };
        }
        return {
          triggered: false,
          rule,
          details: { currentPrice },
          message: 'Unknown rule type',
          severity: 'low',
        };
    }
  }

  private evaluatePriceBelow(
    alert: PriceAlert,
    rule: AlertRule,
    currentPrice: number,
    previousPrice: number
  ): AlertEvaluation {
    const triggered = currentPrice <= alert.targetPrice;
    const savings = alert.originalPrice - currentPrice;

    return {
      triggered,
      rule,
      details: {
        currentPrice,
        previousPrice,
        threshold: alert.targetPrice,
        amountChange: savings,
      },
      message: triggered
        ? `Price dropped to ${currentPrice} (target: ${alert.targetPrice}). Save ${savings.toFixed(2)}!`
        : `Current price ${currentPrice} is above target ${alert.targetPrice}`,
      severity: triggered ? 'high' : 'low',
    };
  }

  private evaluatePriceDropPercent(
    alert: PriceAlert,
    rule: AlertRule,
    currentPrice: number,
    previousPrice: number,
    percentChange: number
  ): AlertEvaluation {
    const threshold = rule.threshold ?? 10;
    const triggered = percentChange >= threshold;

    return {
      triggered,
      rule,
      details: {
        currentPrice,
        previousPrice,
        threshold,
        percentChange,
      },
      message: triggered
        ? `Price dropped ${percentChange.toFixed(1)}% from ${previousPrice} to ${currentPrice}`
        : `Price change ${percentChange.toFixed(1)}% below threshold ${threshold}%`,
      severity: triggered ? (percentChange >= 20 ? 'critical' : 'high') : 'low',
    };
  }

  private evaluatePriceDropAmount(
    alert: PriceAlert,
    rule: AlertRule,
    currentPrice: number,
    previousPrice: number,
    priceChange: number
  ): AlertEvaluation {
    const threshold = rule.threshold ?? 10;
    const triggered = priceChange >= threshold;

    return {
      triggered,
      rule,
      details: {
        currentPrice,
        previousPrice,
        threshold,
        amountChange: priceChange,
      },
      message: triggered
        ? `Price dropped ${priceChange.toFixed(2)} from ${previousPrice} to ${currentPrice}`
        : `Price change ${priceChange.toFixed(2)} below threshold ${threshold}`,
      severity: triggered ? 'high' : 'low',
    };
  }

  private evaluateAllTimeLow(
    alert: PriceAlert,
    rule: AlertRule,
    currentPrice: number,
    previousPrice: number
  ): AlertEvaluation {
    const lowestInHistory = alert.priceHistory.length > 0
      ? Math.min(...alert.priceHistory.map(p => p.price))
      : previousPrice;

    const triggered = currentPrice < lowestInHistory;
    const savings = alert.originalPrice - currentPrice;

    return {
      triggered,
      rule,
      details: {
        currentPrice,
        previousPrice,
        isAllTimeLow: triggered,
        amountChange: savings,
      },
      message: triggered
        ? `All-time low price! ${currentPrice} (previous low: ${lowestInHistory}). Save ${savings.toFixed(2)}!`
        : `Current price ${currentPrice} is not the lowest (low: ${lowestInHistory})`,
      severity: triggered ? 'critical' : 'low',
    };
  }

  private evaluateBackInStock(
    alert: PriceAlert,
    rule: AlertRule,
    currentPrice: number,
    inStock: boolean
  ): AlertEvaluation {
    // Check if item was previously out of stock
    const lastPoint = alert.priceHistory[alert.priceHistory.length - 1];
    const wasOutOfStock = lastPoint && !lastPoint.inStock;
    const triggered = inStock && wasOutOfStock;

    return {
      triggered,
      rule,
      details: {
        currentPrice,
        wasOutOfStock,
      },
      message: triggered
        ? `Item is back in stock at ${currentPrice}!`
        : inStock ? 'Item is in stock' : 'Item is out of stock',
      severity: triggered ? 'high' : 'low',
    };
  }

  private evaluatePriceIncrease(
    alert: PriceAlert,
    rule: AlertRule,
    currentPrice: number,
    previousPrice: number,
    percentChange: number
  ): AlertEvaluation {
    const threshold = rule.threshold ?? 5;
    const triggered = percentChange < 0 && Math.abs(percentChange) >= threshold;

    return {
      triggered,
      rule,
      details: {
        currentPrice,
        previousPrice,
        threshold,
        percentChange,
      },
      message: triggered
        ? `Price increased ${Math.abs(percentChange).toFixed(1)}% from ${previousPrice} to ${currentPrice}`
        : `Price stable or decreased`,
      severity: triggered ? 'medium' : 'low',
    };
  }

  private evaluateVolatility(
    alert: PriceAlert,
    rule: AlertRule,
    currentPrice: number
  ): AlertEvaluation {
    const lookbackHours = rule.lookbackPeriodHours ?? 24;
    const lookbackMs = lookbackHours * 60 * 60 * 1000;
    const cutoff = Date.now() - lookbackMs;

    // Get prices within lookback period
    const recentPrices = alert.priceHistory
      .filter(p => p.timestamp >= cutoff)
      .map(p => p.price);

    if (recentPrices.length < 2) {
      return {
        triggered: false,
        rule,
        details: { currentPrice },
        message: 'Not enough data for volatility calculation',
        severity: 'low',
      };
    }

    // Calculate standard deviation
    const mean = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const squaredDiffs = recentPrices.map(p => Math.pow(p - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
    const stdDev = Math.sqrt(variance);
    const volatility = (stdDev / mean) * 100;

    const threshold = rule.threshold ?? 10;
    const triggered = volatility >= threshold;

    return {
      triggered,
      rule,
      details: {
        currentPrice,
        threshold,
        volatility,
      },
      message: triggered
        ? `High price volatility detected: ${volatility.toFixed(1)}%`
        : `Price volatility ${volatility.toFixed(1)}% within normal range`,
      severity: triggered ? 'medium' : 'low',
    };
  }

  /**
   * Create a price drop event from evaluation results
   */
  createPriceDrop(
    alert: PriceAlert,
    evaluations: AlertEvaluation[]
  ): PriceDrop | null {
    if (evaluations.length === 0) {
      return null;
    }

    const topEval = evaluations[0];
    const previousPrice = alert.currentPrice;
    const currentPrice = topEval.details.currentPrice;
    const savings = previousPrice - currentPrice;
    const percentDrop = previousPrice > 0 ? (savings / previousPrice) * 100 : 0;

    return {
      alertId: alert.id,
      productName: alert.productName,
      productUrl: alert.productUrl,
      previousPrice,
      currentPrice,
      targetPrice: alert.targetPrice,
      savings,
      percentDrop,
      isAllTimeLow: topEval.details.isAllTimeLow ?? false,
      detectedAt: Date.now(),
    };
  }
}
