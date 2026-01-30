/**
 * Risk Management Service
 *
 * Facade for risk management functionality including rule evaluation,
 * position sizing, and drawdown monitoring.
 */

import { EventEmitter } from 'events';
import type {
  RiskRules,
  RiskAssessment,
  PositionSizeResult,
  DrawdownState,
  DailyPnL,
  Trade,
  Portfolio,
} from '../../types.js';
import type { RiskManagementConfig } from '../../config.js';
import { FINANCE_EVENTS } from '../../constants.js';
import { DEFAULT_RISK_RULES } from '../../config.js';
import { RuleEngine, createRuleEngine } from './rule-engine.js';
import { PositionSizer, createPositionSizer, type PositionSizeRequest } from './position-sizer.js';
import { DrawdownMonitor, createDrawdownMonitor } from './drawdown-monitor.js';

// =============================================================================
// Service Interface
// =============================================================================

export interface RiskManagementService {
  // Configuration
  updateRules(rules: Partial<RiskRules>): void;
  getRules(): RiskRules;

  // Trade evaluation
  evaluateTrade(
    trade: Partial<Trade>,
    portfolio: Portfolio,
    openPositions: number
  ): RiskAssessment;

  // Position sizing
  calculatePositionSize(request: PositionSizeRequest): PositionSizeResult;
  validatePositionSize(
    quantity: number,
    price: number,
    portfolio: Portfolio
  ): { valid: boolean; issues: string[] };

  // Drawdown tracking
  updatePortfolioValue(value: number): void;
  recordTrade(pnl: number, isRealized?: boolean): void;
  getDrawdownState(): DrawdownState;
  getDailyPnL(): DailyPnL;

  // Trading status
  canTrade(): { allowed: boolean; reason?: string };
  haltTrading(reason: string): void;
  resumeTrading(): void;
  isInCooldown(): boolean;

  // Risk scoring
  calculateRiskScore(
    portfolio: Portfolio,
    openPositions: number
  ): { score: number; factors: Array<{ name: string; score: number; weight: number }> };

  // Event handling
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

// =============================================================================
// Service Implementation
// =============================================================================

export class RiskManagementServiceImpl extends EventEmitter implements RiskManagementService {
  private ruleEngine: RuleEngine;
  private positionSizer: PositionSizer;
  private drawdownMonitor: DrawdownMonitor;
  private config: RiskManagementConfig;

  constructor(config?: Partial<RiskManagementConfig>, initialPortfolioValue?: number) {
    super();

    this.config = {
      enabled: true,
      rules: DEFAULT_RISK_RULES,
      alertOnViolation: true,
      haltOnCriticalViolation: true,
      dailyPnLResetHourUtc: 0,
      snapshotIntervalMinutes: 5,
      ...config,
    };

    const rules = this.config.rules;

    this.ruleEngine = createRuleEngine(rules);
    this.positionSizer = createPositionSizer(rules);
    this.drawdownMonitor = createDrawdownMonitor(rules, initialPortfolioValue);

    // Forward events from drawdown monitor
    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    const events = [
      FINANCE_EVENTS.TRADING_HALTED,
      FINANCE_EVENTS.TRADING_RESUMED,
      FINANCE_EVENTS.DRAWDOWN_WARNING,
      FINANCE_EVENTS.DRAWDOWN_CRITICAL,
      FINANCE_EVENTS.DAILY_LOSS_LIMIT_REACHED,
      FINANCE_EVENTS.COOLDOWN_STARTED,
      FINANCE_EVENTS.COOLDOWN_ENDED,
    ];

    for (const event of events) {
      this.drawdownMonitor.on(event, (...args) => {
        this.emit(event, ...args);
      });
    }
  }

  // Configuration
  updateRules(rules: Partial<RiskRules>): void {
    this.ruleEngine.updateRules(rules);
    this.positionSizer.updateRules(rules);
    this.drawdownMonitor.updateRules(rules);
  }

  getRules(): RiskRules {
    return this.ruleEngine.getRules();
  }

  // Trade evaluation
  evaluateTrade(
    trade: Partial<Trade>,
    portfolio: Portfolio,
    openPositions: number
  ): RiskAssessment {
    const assessment = this.ruleEngine.evaluateTrade(
      trade,
      portfolio,
      this.drawdownMonitor.getDrawdownState(),
      this.drawdownMonitor.getDailyPnL(),
      openPositions
    );

    // Emit events for violations and warnings
    if (this.config.alertOnViolation) {
      if (assessment.violations.length > 0) {
        this.emit(FINANCE_EVENTS.RISK_CHECK_FAILED, {
          trade,
          violations: assessment.violations,
          timestamp: Date.now(),
        });
      } else if (assessment.warnings.length > 0) {
        this.emit(FINANCE_EVENTS.RISK_WARNING, {
          trade,
          warnings: assessment.warnings,
          timestamp: Date.now(),
        });
      } else {
        this.emit(FINANCE_EVENTS.RISK_CHECK_PASSED, {
          trade,
          timestamp: Date.now(),
        });
      }
    }

    return assessment;
  }

  // Position sizing
  calculatePositionSize(request: PositionSizeRequest): PositionSizeResult {
    return this.positionSizer.calculatePositionSize(request);
  }

  validatePositionSize(
    quantity: number,
    price: number,
    portfolio: Portfolio
  ): { valid: boolean; issues: string[] } {
    return this.positionSizer.validatePositionSize(quantity, price, portfolio);
  }

  // Drawdown tracking
  updatePortfolioValue(value: number): void {
    this.drawdownMonitor.updateValue(value);
  }

  recordTrade(pnl: number, isRealized = true): void {
    this.drawdownMonitor.recordTrade(pnl, isRealized);
  }

  getDrawdownState(): DrawdownState {
    return this.drawdownMonitor.getDrawdownState();
  }

  getDailyPnL(): DailyPnL {
    return this.drawdownMonitor.getDailyPnL();
  }

  // Trading status
  canTrade(): { allowed: boolean; reason?: string } {
    if (!this.config.enabled) {
      return { allowed: true };
    }
    return this.drawdownMonitor.canTrade();
  }

  haltTrading(reason: string): void {
    this.drawdownMonitor.haltTrading(reason);
  }

  resumeTrading(): void {
    this.drawdownMonitor.resumeTrading();
  }

  isInCooldown(): boolean {
    return this.drawdownMonitor.isInCooldown();
  }

  // Risk scoring
  calculateRiskScore(
    portfolio: Portfolio,
    openPositions: number
  ): { score: number; factors: Array<{ name: string; score: number; weight: number }> } {
    return this.ruleEngine.calculateRiskScore(
      portfolio,
      this.drawdownMonitor.getDrawdownState(),
      this.drawdownMonitor.getDailyPnL(),
      openPositions
    );
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createRiskManagementService(
  config?: Partial<RiskManagementConfig>,
  initialPortfolioValue?: number
): RiskManagementService {
  return new RiskManagementServiceImpl(config, initialPortfolioValue);
}

// =============================================================================
// Re-exports
// =============================================================================

export { RuleEngine, createRuleEngine } from './rule-engine.js';
export { PositionSizer, createPositionSizer, type PositionSizeRequest } from './position-sizer.js';
export { DrawdownMonitor, createDrawdownMonitor } from './drawdown-monitor.js';
