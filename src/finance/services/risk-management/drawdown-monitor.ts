/**
 * Drawdown Monitor
 *
 * Tracks portfolio drawdown and manages trading halts.
 */

import { EventEmitter } from 'events';
import type { RiskRules, DrawdownState, DailyPnL } from '../../types.js';
import { FINANCE_EVENTS, FINANCE_DEFAULTS } from '../../constants.js';
import { DEFAULT_RISK_RULES } from '../../config.js';

// =============================================================================
// Drawdown Monitor
// =============================================================================

export class DrawdownMonitor extends EventEmitter {
  private rules: RiskRules;
  private drawdownState: DrawdownState;
  private dailyPnL: DailyPnL;
  private cooldownEndTime: number = 0;
  private valueHistory: Array<{ timestamp: number; value: number }> = [];

  constructor(rules?: Partial<RiskRules>, initialValue: number = 0) {
    super();
    this.rules = { ...DEFAULT_RISK_RULES, ...rules };

    const now = Date.now();
    this.drawdownState = {
      peakValue: initialValue,
      currentValue: initialValue,
      drawdownAmount: 0,
      drawdownPercent: 0,
      maxDrawdownAmount: 0,
      maxDrawdownPercent: 0,
      isHalted: false,
      recoveryNeeded: 0,
      lastUpdated: now,
    };

    this.dailyPnL = {
      date: new Date().toISOString().split('T')[0],
      startValue: initialValue,
      currentValue: initialValue,
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalPnL: 0,
      percentChange: 0,
      trades: 0,
      wins: 0,
      losses: 0,
      isLossLimitReached: false,
    };
  }

  /**
   * Update risk rules
   */
  updateRules(rules: Partial<RiskRules>): void {
    this.rules = { ...this.rules, ...rules };
    // Re-evaluate halt status with new rules
    this.checkHaltConditions();
  }

  /**
   * Update portfolio value
   */
  updateValue(newValue: number): void {
    const now = Date.now();
    const previousValue = this.drawdownState.currentValue;

    // Store in history
    this.valueHistory.push({ timestamp: now, value: newValue });

    // Keep last 24 hours of history
    const dayAgo = now - 24 * 60 * 60 * 1000;
    this.valueHistory = this.valueHistory.filter(v => v.timestamp > dayAgo);

    // Update peak if new high
    if (newValue > this.drawdownState.peakValue) {
      this.drawdownState.peakValue = newValue;
    }

    // Calculate current drawdown
    this.drawdownState.currentValue = newValue;
    this.drawdownState.drawdownAmount = this.drawdownState.peakValue - newValue;
    this.drawdownState.drawdownPercent =
      this.drawdownState.peakValue > 0
        ? (this.drawdownState.drawdownAmount / this.drawdownState.peakValue) * 100
        : 0;

    // Track max drawdown
    if (this.drawdownState.drawdownPercent > this.drawdownState.maxDrawdownPercent) {
      this.drawdownState.maxDrawdownPercent = this.drawdownState.drawdownPercent;
      this.drawdownState.maxDrawdownAmount = this.drawdownState.drawdownAmount;
    }

    // Calculate recovery needed
    this.drawdownState.recoveryNeeded =
      this.drawdownState.peakValue > 0
        ? ((this.drawdownState.peakValue - newValue) / newValue) * 100
        : 0;

    this.drawdownState.lastUpdated = now;

    // Update daily P&L
    this.updateDailyPnL(newValue);

    // Check halt conditions
    this.checkHaltConditions();

    // Emit warnings if approaching limits
    if (this.drawdownState.drawdownPercent >= this.rules.maxDrawdownPercent * 0.7) {
      this.emit(FINANCE_EVENTS.DRAWDOWN_WARNING, {
        drawdownPercent: this.drawdownState.drawdownPercent,
        maxAllowed: this.rules.maxDrawdownPercent,
        timestamp: now,
      });
    }
  }

  /**
   * Update daily P&L tracking
   */
  private updateDailyPnL(newValue: number): void {
    const today = new Date().toISOString().split('T')[0];

    // Reset if new day
    if (this.dailyPnL.date !== today) {
      this.dailyPnL = {
        date: today,
        startValue: this.drawdownState.currentValue,
        currentValue: newValue,
        realizedPnL: 0,
        unrealizedPnL: 0,
        totalPnL: 0,
        percentChange: 0,
        trades: 0,
        wins: 0,
        losses: 0,
        isLossLimitReached: false,
      };
    }

    this.dailyPnL.currentValue = newValue;
    this.dailyPnL.totalPnL = newValue - this.dailyPnL.startValue;
    this.dailyPnL.percentChange =
      this.dailyPnL.startValue > 0
        ? (this.dailyPnL.totalPnL / this.dailyPnL.startValue) * 100
        : 0;

    // Check daily loss limit
    if (this.dailyPnL.percentChange <= -this.rules.maxDailyLossPercent) {
      if (!this.dailyPnL.isLossLimitReached) {
        this.dailyPnL.isLossLimitReached = true;
        this.emit(FINANCE_EVENTS.DAILY_LOSS_LIMIT_REACHED, {
          percentChange: this.dailyPnL.percentChange,
          maxAllowed: this.rules.maxDailyLossPercent,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Record a trade result
   */
  recordTrade(pnl: number, isRealized: boolean = true): void {
    this.dailyPnL.trades++;

    if (pnl > 0) {
      this.dailyPnL.wins++;
    } else if (pnl < 0) {
      this.dailyPnL.losses++;
      // Start cooldown after significant loss
      if (Math.abs(pnl / this.drawdownState.currentValue) * 100 >= 1) {
        this.startCooldown();
      }
    }

    if (isRealized) {
      this.dailyPnL.realizedPnL += pnl;
    } else {
      this.dailyPnL.unrealizedPnL += pnl;
    }
  }

  /**
   * Check and enforce halt conditions
   */
  private checkHaltConditions(): void {
    const wasHalted = this.drawdownState.isHalted;
    let shouldHalt = false;
    let haltReason = '';

    // Check max drawdown
    if (this.drawdownState.drawdownPercent >= this.rules.maxDrawdownPercent) {
      shouldHalt = true;
      haltReason = `Max drawdown exceeded: ${this.drawdownState.drawdownPercent.toFixed(2)}%`;
    }

    // Check daily loss limit
    if (this.dailyPnL.isLossLimitReached) {
      shouldHalt = true;
      haltReason = `Daily loss limit reached: ${this.dailyPnL.percentChange.toFixed(2)}%`;
    }

    if (shouldHalt && !wasHalted) {
      this.drawdownState.isHalted = true;
      this.drawdownState.haltedAt = Date.now();
      this.drawdownState.haltReason = haltReason;

      this.emit(FINANCE_EVENTS.TRADING_HALTED, {
        reason: haltReason,
        drawdownPercent: this.drawdownState.drawdownPercent,
        dailyLossPercent: this.dailyPnL.percentChange,
        timestamp: Date.now(),
      });
    } else if (!shouldHalt && wasHalted) {
      // Check if we can resume
      const recoveryThreshold = this.rules.maxDrawdownPercent * 0.5;
      if (this.drawdownState.drawdownPercent < recoveryThreshold) {
        this.resumeTrading();
      }
    }
  }

  /**
   * Start cooldown period after loss
   */
  private startCooldown(): void {
    const now = Date.now();
    this.cooldownEndTime = now + this.rules.cooldownMinutesAfterLoss * 60 * 1000;

    this.emit(FINANCE_EVENTS.COOLDOWN_STARTED, {
      endTime: this.cooldownEndTime,
      durationMinutes: this.rules.cooldownMinutesAfterLoss,
      timestamp: now,
    });
  }

  /**
   * Check if in cooldown period
   */
  isInCooldown(): boolean {
    return Date.now() < this.cooldownEndTime;
  }

  /**
   * Get remaining cooldown time in seconds
   */
  getCooldownRemaining(): number {
    const remaining = this.cooldownEndTime - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  /**
   * Force halt trading
   */
  haltTrading(reason: string): void {
    if (!this.drawdownState.isHalted) {
      this.drawdownState.isHalted = true;
      this.drawdownState.haltedAt = Date.now();
      this.drawdownState.haltReason = reason;

      this.emit(FINANCE_EVENTS.TRADING_HALTED, {
        reason,
        forced: true,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Resume trading (manual override)
   */
  resumeTrading(): void {
    if (this.drawdownState.isHalted) {
      this.drawdownState.isHalted = false;
      this.drawdownState.haltedAt = undefined;
      this.drawdownState.haltReason = undefined;

      this.emit(FINANCE_EVENTS.TRADING_RESUMED, {
        drawdownPercent: this.drawdownState.drawdownPercent,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Reset peak (e.g., after deposit)
   */
  resetPeak(newPeakValue?: number): void {
    this.drawdownState.peakValue = newPeakValue ?? this.drawdownState.currentValue;
    this.drawdownState.drawdownAmount = 0;
    this.drawdownState.drawdownPercent = 0;
    this.drawdownState.recoveryNeeded = 0;
    this.drawdownState.lastUpdated = Date.now();
  }

  /**
   * Get current drawdown state
   */
  getDrawdownState(): DrawdownState {
    return { ...this.drawdownState };
  }

  /**
   * Get current daily P&L
   */
  getDailyPnL(): DailyPnL {
    return { ...this.dailyPnL };
  }

  /**
   * Check if trading is allowed
   */
  canTrade(): { allowed: boolean; reason?: string } {
    if (this.drawdownState.isHalted) {
      return { allowed: false, reason: this.drawdownState.haltReason };
    }

    if (this.isInCooldown()) {
      return {
        allowed: false,
        reason: `Cooldown active: ${this.getCooldownRemaining()} seconds remaining`,
      };
    }

    if (this.dailyPnL.isLossLimitReached) {
      return { allowed: false, reason: 'Daily loss limit reached' };
    }

    return { allowed: true };
  }

  /**
   * Get value history for analysis
   */
  getValueHistory(): Array<{ timestamp: number; value: number }> {
    return [...this.valueHistory];
  }

  /**
   * Calculate volatility from recent history
   */
  calculateVolatility(hoursBack: number = 24): number {
    const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
    const recentValues = this.valueHistory
      .filter(v => v.timestamp > cutoff)
      .map(v => v.value);

    if (recentValues.length < 2) {
      return 0;
    }

    // Calculate returns
    const returns: number[] = [];
    for (let i = 1; i < recentValues.length; i++) {
      if (recentValues[i - 1] > 0) {
        returns.push((recentValues[i] - recentValues[i - 1]) / recentValues[i - 1]);
      }
    }

    if (returns.length === 0) {
      return 0;
    }

    // Calculate standard deviation of returns
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

    return Math.sqrt(variance);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createDrawdownMonitor(
  rules?: Partial<RiskRules>,
  initialValue?: number
): DrawdownMonitor {
  return new DrawdownMonitor(rules, initialValue);
}
