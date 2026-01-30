/**
 * Finance Module
 *
 * Comprehensive finance module providing:
 * - Trading bot framework with exchange API integration
 * - Risk management with hard-coded rules
 * - Social sentiment analysis for market signals
 * - Self-learning trade evaluation with RAG memory
 * - Portfolio tracking with rebalancing suggestions
 * - Crypto wallet monitoring with alerts
 * - Invoice generation from time tracking data
 */

import { EventEmitter } from 'events';
import type { FinanceConfig } from './config.js';
import { FinanceConfigSchema, DEFAULT_FINANCE_CONFIG } from './config.js';
import type { DatabaseAdapter } from './stores/trade-store.js';

// Re-export types
export * from './types.js';

// Re-export config
export {
  FinanceConfigSchema,
  DEFAULT_FINANCE_CONFIG,
  DEFAULT_RISK_RULES,
  type FinanceConfig,
  type RiskRules,
  type RiskManagementConfig,
  type SentimentConfig,
  type PortfolioConfig,
  type WalletMonitoringConfig,
  type InvoicingConfig,
  type TradeLearningConfig,
  type TradingBotConfig,
  type ExchangeConfig,
} from './config.js';

// Re-export constants
export * from './constants.js';

// Re-export stores
export * from './stores/index.js';

// Re-export providers
export * from './providers/index.js';

// Re-export services
export * from './services/index.js';

// Re-export monitoring
export * from './monitoring/index.js';

// Re-export learning
export * from './learning/index.js';

// =============================================================================
// Finance Manager
// =============================================================================

import {
  createTradeStore,
  createPortfolioStore,
  createWalletStore,
  createPatternStore,
  createInvoiceStore,
  type TradeStore,
  type PortfolioStore,
  type WalletStore,
  type PatternStore,
  type InvoiceStore,
} from './stores/index.js';

import {
  createRiskManagementService,
  createTradingBotService,
  createSentimentAnalysisService,
  createTradeLearningService,
  createPortfolioService,
  createWalletMonitoringService,
  createInvoicingService,
  type RiskManagementService,
  type TradingBotService,
  type SentimentAnalysisService,
  type TradeLearningService,
  type PortfolioService,
  type WalletMonitoringService,
  type InvoicingService,
} from './services/index.js';

import { createAlertEngine, type AlertEngine } from './monitoring/index.js';

export interface FinanceManager {
  // Configuration
  readonly config: FinanceConfig;

  // Stores
  readonly tradeStore: TradeStore;
  readonly portfolioStore: PortfolioStore;
  readonly walletStore: WalletStore;
  readonly patternStore: PatternStore;
  readonly invoiceStore: InvoiceStore;

  // Services
  readonly riskManagement: RiskManagementService;
  readonly tradingBot: TradingBotService;
  readonly sentiment: SentimentAnalysisService;
  readonly tradeLearning: TradeLearningService;
  readonly portfolio: PortfolioService;
  readonly walletMonitoring: WalletMonitoringService;
  readonly invoicing: InvoicingService;

  // Monitoring
  readonly alerts: AlertEngine;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // Events
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

class FinanceManagerImpl extends EventEmitter implements FinanceManager {
  readonly config: FinanceConfig;

  // Stores
  readonly tradeStore: TradeStore;
  readonly portfolioStore: PortfolioStore;
  readonly walletStore: WalletStore;
  readonly patternStore: PatternStore;
  readonly invoiceStore: InvoiceStore;

  // Services
  readonly riskManagement: RiskManagementService;
  readonly tradingBot: TradingBotService;
  readonly sentiment: SentimentAnalysisService;
  readonly tradeLearning: TradeLearningService;
  readonly portfolio: PortfolioService;
  readonly walletMonitoring: WalletMonitoringService;
  readonly invoicing: InvoicingService;

  // Monitoring
  readonly alerts: AlertEngine;

  private initialized = false;

  constructor(config: Partial<FinanceConfig> = {}, db?: DatabaseAdapter) {
    super();

    // Parse and validate config
    this.config = FinanceConfigSchema.parse(config);

    // Initialize stores
    const storeType = this.config.storeType;

    if (storeType === 'database') {
      if (!db) {
        throw new Error('Database adapter required for database store type');
      }
      this.tradeStore = createTradeStore('database', db);
      this.portfolioStore = createPortfolioStore('database', db);
      this.walletStore = createWalletStore('database', db);
      this.patternStore = createPatternStore('database', db);
      this.invoiceStore = createInvoiceStore('database', db);
    } else {
      this.tradeStore = createTradeStore('memory');
      this.portfolioStore = createPortfolioStore('memory');
      this.walletStore = createWalletStore('memory');
      this.patternStore = createPatternStore('memory');
      this.invoiceStore = createInvoiceStore('memory');
    }

    // Initialize services
    this.riskManagement = createRiskManagementService(this.config.riskManagement);
    this.tradingBot = createTradingBotService(this.config.tradingBot);
    this.sentiment = createSentimentAnalysisService(this.config.sentiment);
    this.tradeLearning = createTradeLearningService(this.config.tradeLearning);
    this.portfolio = createPortfolioService(this.config.portfolio);
    this.walletMonitoring = createWalletMonitoringService(this.config.walletMonitoring);
    this.invoicing = createInvoicingService(this.config.invoicing);

    // Initialize monitoring
    this.alerts = createAlertEngine();

    // Forward events
    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    // Forward service events to manager
    const services = [
      this.riskManagement,
      this.tradingBot,
      this.sentiment,
      this.tradeLearning,
      this.portfolio,
      this.walletMonitoring,
      this.invoicing,
      this.alerts,
    ];

    for (const service of services) {
      if (service instanceof EventEmitter) {
        // Forward all events
        const originalEmit = service.emit.bind(service);
        service.emit = (event: string, ...args: unknown[]) => {
          originalEmit(event, ...args);
          this.emit(event, ...args);
          return true;
        };
      }
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize stores
    await Promise.all([
      this.tradeStore.initialize(),
      this.portfolioStore.initialize(),
      this.walletStore.initialize(),
      this.patternStore.initialize(),
      this.invoiceStore.initialize(),
    ]);

    // Initialize services that need stores
    await this.tradeLearning.initialize(this.patternStore);
    await this.portfolio.initialize(this.portfolioStore);
    await this.walletMonitoring.initialize(this.walletStore);
    await this.invoicing.initialize(this.invoiceStore);

    // Start background services if enabled
    if (this.config.walletMonitoring?.enabled) {
      this.walletMonitoring.start();
    }

    this.initialized = true;
    this.emit('initialized');
  }

  async shutdown(): Promise<void> {
    // Stop background services
    this.walletMonitoring.stop();

    if (this.tradingBot.isRunning()) {
      await this.tradingBot.stop();
    }

    this.initialized = false;
    this.emit('shutdown');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createFinanceManager(
  config?: Partial<FinanceConfig>,
  db?: DatabaseAdapter
): FinanceManager {
  return new FinanceManagerImpl(config, db);
}

// Default export
export default createFinanceManager;
