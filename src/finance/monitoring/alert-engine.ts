/**
 * Finance Alert Engine
 *
 * Rule-based alert system with cooldown management for finance events.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  FinanceAlert,
  FinanceAlertType,
  DrawdownState,
  DailyPnL,
  WalletBalance,
  SentimentScore,
  Portfolio,
} from '../types.js';
import { FINANCE_EVENTS, FINANCE_DEFAULTS } from '../constants.js';

// =============================================================================
// Alert Rule Types
// =============================================================================

export interface AlertRule {
  id: string;
  type: FinanceAlertType;
  enabled: boolean;
  priority: number;
  cooldownMinutes: number;
  threshold?: number;
  customCondition?: (context: AlertContext) => boolean;
}

export interface AlertContext {
  drawdownState?: DrawdownState;
  dailyPnL?: DailyPnL;
  walletBalance?: WalletBalance;
  sentiment?: SentimentScore;
  portfolio?: Portfolio;
  custom?: Record<string, unknown>;
}

export interface AlertEvaluation {
  triggered: boolean;
  rule: AlertRule;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  data: Record<string, unknown>;
}

// =============================================================================
// Alert Engine
// =============================================================================

export class AlertEngine extends EventEmitter {
  private rules: AlertRule[] = [];
  private lastAlertTimes = new Map<string, number>();
  private activeAlerts = new Map<string, FinanceAlert>();

  constructor(defaultRules?: AlertRule[]) {
    super();

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
        id: 'drawdown-warning',
        type: 'drawdown_warning',
        enabled: true,
        priority: 1,
        cooldownMinutes: FINANCE_DEFAULTS.ALERT_COOLDOWN_MINUTES,
        threshold: 10, // 10% drawdown
      },
      {
        id: 'drawdown-critical',
        type: 'drawdown_warning',
        enabled: true,
        priority: 0,
        cooldownMinutes: FINANCE_DEFAULTS.CRITICAL_ALERT_COOLDOWN_MINUTES,
        threshold: 15, // 15% drawdown - critical
      },
      {
        id: 'trading-halted',
        type: 'trading_halted',
        enabled: true,
        priority: 0,
        cooldownMinutes: 60,
      },
      {
        id: 'daily-loss-warning',
        type: 'risk_violation',
        enabled: true,
        priority: 1,
        cooldownMinutes: FINANCE_DEFAULTS.ALERT_COOLDOWN_MINUTES,
        threshold: 3, // 3% daily loss
      },
      {
        id: 'position-limit',
        type: 'position_limit',
        enabled: true,
        priority: 2,
        cooldownMinutes: FINANCE_DEFAULTS.ALERT_COOLDOWN_MINUTES,
        threshold: 8, // 80% of max positions
      },
      {
        id: 'sentiment-bullish',
        type: 'sentiment_signal',
        enabled: true,
        priority: 3,
        cooldownMinutes: 60,
        threshold: 0.6, // Strong bullish signal
      },
      {
        id: 'sentiment-bearish',
        type: 'sentiment_signal',
        enabled: true,
        priority: 3,
        cooldownMinutes: 60,
        threshold: -0.6, // Strong bearish signal
      },
      {
        id: 'wallet-low-balance',
        type: 'wallet_alert',
        enabled: true,
        priority: 2,
        cooldownMinutes: 240, // 4 hours
      },
      {
        id: 'wallet-large-tx',
        type: 'wallet_alert',
        enabled: true,
        priority: 1,
        cooldownMinutes: 15,
        threshold: 10000, // $10,000 transaction
      },
      {
        id: 'invoice-overdue',
        type: 'invoice_overdue',
        enabled: true,
        priority: 2,
        cooldownMinutes: 1440, // 24 hours
      },
      {
        id: 'pattern-detected',
        type: 'pattern_detected',
        enabled: true,
        priority: 3,
        cooldownMinutes: FINANCE_DEFAULTS.ALERT_COOLDOWN_MINUTES,
        threshold: 0.8, // High confidence pattern
      },
    ];

    this.rules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Add or update a rule
   */
  addRule(rule: AlertRule): void {
    this.rules = this.rules.filter(r => r.id !== rule.id);
    this.rules.push(rule);
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
   * Enable/disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
    }
  }

  /**
   * Check if rule is in cooldown
   */
  isInCooldown(ruleId: string): boolean {
    const lastTime = this.lastAlertTimes.get(ruleId);
    if (!lastTime) {
      return false;
    }

    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) {
      return false;
    }

    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    return Date.now() - lastTime < cooldownMs;
  }

  /**
   * Evaluate all rules against context
   */
  evaluate(context: AlertContext, userId: string): FinanceAlert[] {
    const alerts: FinanceAlert[] = [];

    for (const rule of this.rules) {
      if (!rule.enabled || this.isInCooldown(rule.id)) {
        continue;
      }

      const evaluation = this.evaluateRule(rule, context);

      if (evaluation.triggered) {
        const alert = this.createAlert(rule, evaluation, userId);
        alerts.push(alert);

        // Record alert time
        this.lastAlertTimes.set(rule.id, Date.now());

        // Store active alert
        this.activeAlerts.set(alert.id, alert);

        // Emit event
        this.emit(FINANCE_EVENTS.ALERT_TRIGGERED, alert);
      }
    }

    return alerts;
  }

  /**
   * Evaluate a single rule
   */
  private evaluateRule(rule: AlertRule, context: AlertContext): AlertEvaluation {
    // Check custom condition first
    if (rule.customCondition) {
      const triggered = rule.customCondition(context);
      return {
        triggered,
        rule,
        severity: this.getSeverityFromPriority(rule.priority),
        title: rule.type.replace(/_/g, ' ').toUpperCase(),
        message: triggered ? 'Custom condition met' : 'Custom condition not met',
        data: { ...context.custom },
      };
    }

    // Built-in rule evaluation
    switch (rule.type) {
      case 'drawdown_warning':
        return this.evaluateDrawdown(rule, context);

      case 'trading_halted':
        return this.evaluateTradingHalted(rule, context);

      case 'risk_violation':
        return this.evaluateDailyLoss(rule, context);

      case 'position_limit':
        return this.evaluatePositionLimit(rule, context);

      case 'sentiment_signal':
        return this.evaluateSentiment(rule, context);

      case 'wallet_alert':
        return this.evaluateWallet(rule, context);

      case 'pattern_detected':
        return this.evaluatePattern(rule, context);

      default:
        return {
          triggered: false,
          rule,
          severity: 'info',
          title: rule.type,
          message: 'Unknown rule type',
          data: {},
        };
    }
  }

  private evaluateDrawdown(rule: AlertRule, context: AlertContext): AlertEvaluation {
    const drawdown = context.drawdownState;
    if (!drawdown) {
      return { triggered: false, rule, severity: 'info', title: '', message: '', data: {} };
    }

    const threshold = rule.threshold ?? 10;
    const triggered = drawdown.drawdownPercent >= threshold;
    const severity = drawdown.drawdownPercent >= 15 ? 'critical' : 'warning';

    return {
      triggered,
      rule,
      severity,
      title: 'Drawdown Alert',
      message: `Portfolio drawdown at ${drawdown.drawdownPercent.toFixed(2)}% (threshold: ${threshold}%)`,
      data: {
        drawdownPercent: drawdown.drawdownPercent,
        peakValue: drawdown.peakValue,
        currentValue: drawdown.currentValue,
        recoveryNeeded: drawdown.recoveryNeeded,
      },
    };
  }

  private evaluateTradingHalted(rule: AlertRule, context: AlertContext): AlertEvaluation {
    const drawdown = context.drawdownState;
    const triggered = drawdown?.isHalted ?? false;

    return {
      triggered,
      rule,
      severity: 'critical',
      title: 'Trading Halted',
      message: drawdown?.haltReason ?? 'Trading has been halted',
      data: {
        haltedAt: drawdown?.haltedAt,
        reason: drawdown?.haltReason,
      },
    };
  }

  private evaluateDailyLoss(rule: AlertRule, context: AlertContext): AlertEvaluation {
    const dailyPnL = context.dailyPnL;
    if (!dailyPnL) {
      return { triggered: false, rule, severity: 'info', title: '', message: '', data: {} };
    }

    const threshold = rule.threshold ?? 3;
    const triggered = dailyPnL.percentChange <= -threshold;

    return {
      triggered,
      rule,
      severity: dailyPnL.isLossLimitReached ? 'critical' : 'warning',
      title: 'Daily Loss Alert',
      message: `Daily loss at ${Math.abs(dailyPnL.percentChange).toFixed(2)}% (threshold: ${threshold}%)`,
      data: {
        percentChange: dailyPnL.percentChange,
        totalPnL: dailyPnL.totalPnL,
        trades: dailyPnL.trades,
        wins: dailyPnL.wins,
        losses: dailyPnL.losses,
      },
    };
  }

  private evaluatePositionLimit(rule: AlertRule, context: AlertContext): AlertEvaluation {
    const portfolio = context.portfolio;
    if (!portfolio) {
      return { triggered: false, rule, severity: 'info', title: '', message: '', data: {} };
    }

    const threshold = rule.threshold ?? 8;
    const positionCount = portfolio.positions.length;
    const triggered = positionCount >= threshold;

    return {
      triggered,
      rule,
      severity: 'warning',
      title: 'Position Limit Warning',
      message: `${positionCount} open positions (warning at ${threshold})`,
      data: {
        positionCount,
        threshold,
      },
    };
  }

  private evaluateSentiment(rule: AlertRule, context: AlertContext): AlertEvaluation {
    const sentiment = context.sentiment;
    if (!sentiment) {
      return { triggered: false, rule, severity: 'info', title: '', message: '', data: {} };
    }

    const threshold = rule.threshold ?? 0.6;
    const isBullish = rule.id.includes('bullish');
    const triggered = isBullish
      ? sentiment.score >= threshold
      : sentiment.score <= -threshold;

    return {
      triggered,
      rule,
      severity: 'info',
      title: `Sentiment Signal: ${isBullish ? 'Bullish' : 'Bearish'}`,
      message: `${sentiment.asset} sentiment score: ${sentiment.score.toFixed(2)} (confidence: ${(sentiment.confidence * 100).toFixed(0)}%)`,
      data: {
        asset: sentiment.asset,
        score: sentiment.score,
        confidence: sentiment.confidence,
        label: sentiment.label,
      },
    };
  }

  private evaluateWallet(rule: AlertRule, context: AlertContext): AlertEvaluation {
    const wallet = context.walletBalance;
    if (!wallet) {
      return { triggered: false, rule, severity: 'info', title: '', message: '', data: {} };
    }

    if (rule.id === 'wallet-large-tx') {
      const threshold = rule.threshold ?? 10000;
      const triggered = wallet.usdValue >= threshold;

      return {
        triggered,
        rule,
        severity: 'warning',
        title: 'Large Transaction Detected',
        message: `${wallet.symbol} transaction worth $${wallet.usdValue.toLocaleString()}`,
        data: {
          symbol: wallet.symbol,
          amount: wallet.balance,
          usdValue: wallet.usdValue,
        },
      };
    }

    return { triggered: false, rule, severity: 'info', title: '', message: '', data: {} };
  }

  private evaluatePattern(rule: AlertRule, context: AlertContext): AlertEvaluation {
    const patternData = context.custom?.pattern as { confidence?: number; name?: string } | undefined;
    if (!patternData) {
      return { triggered: false, rule, severity: 'info', title: '', message: '', data: {} };
    }

    const threshold = rule.threshold ?? 0.8;
    const triggered = (patternData.confidence ?? 0) >= threshold;

    return {
      triggered,
      rule,
      severity: 'info',
      title: 'Pattern Detected',
      message: `High confidence pattern: ${patternData.name ?? 'Unknown'}`,
      data: { ...patternData },
    };
  }

  /**
   * Create alert from evaluation
   */
  private createAlert(
    rule: AlertRule,
    evaluation: AlertEvaluation,
    userId: string
  ): FinanceAlert {
    return {
      id: randomUUID(),
      type: rule.type,
      severity: evaluation.severity,
      title: evaluation.title,
      message: evaluation.message,
      data: evaluation.data,
      userId,
      acknowledged: false,
      createdAt: Date.now(),
      expiresAt: Date.now() + FINANCE_DEFAULTS.ALERT_EXPIRY_HOURS * 60 * 60 * 1000,
    };
  }

  /**
   * Map priority to severity
   */
  private getSeverityFromPriority(priority: number): 'info' | 'warning' | 'critical' {
    if (priority === 0) return 'critical';
    if (priority <= 2) return 'warning';
    return 'info';
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.acknowledged = true;
    alert.acknowledgedAt = Date.now();

    this.emit(FINANCE_EVENTS.ALERT_ACKNOWLEDGED, alert);
    return true;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(userId?: string): FinanceAlert[] {
    const now = Date.now();
    const alerts: FinanceAlert[] = [];

    for (const alert of this.activeAlerts.values()) {
      // Skip expired alerts
      if (alert.expiresAt && alert.expiresAt < now) {
        this.activeAlerts.delete(alert.id);
        this.emit(FINANCE_EVENTS.ALERT_EXPIRED, alert);
        continue;
      }

      // Filter by user if specified
      if (userId && alert.userId !== userId) {
        continue;
      }

      alerts.push(alert);
    }

    return alerts.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get unacknowledged alerts
   */
  getUnacknowledgedAlerts(userId?: string): FinanceAlert[] {
    return this.getActiveAlerts(userId).filter(a => !a.acknowledged);
  }

  /**
   * Clear old alerts
   */
  clearExpiredAlerts(): number {
    const now = Date.now();
    let cleared = 0;

    for (const [id, alert] of this.activeAlerts) {
      if (alert.expiresAt && alert.expiresAt < now) {
        this.activeAlerts.delete(id);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Reset cooldown for a rule
   */
  resetCooldown(ruleId: string): void {
    this.lastAlertTimes.delete(ruleId);
  }

  /**
   * Reset all cooldowns
   */
  resetAllCooldowns(): void {
    this.lastAlertTimes.clear();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createAlertEngine(defaultRules?: AlertRule[]): AlertEngine {
  return new AlertEngine(defaultRules);
}
