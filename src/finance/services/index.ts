/**
 * Finance Services Index
 *
 * Re-exports all finance service modules.
 */

// Risk Management
export {
  type RiskManagementService,
  RiskManagementServiceImpl,
  createRiskManagementService,
  RuleEngine,
  createRuleEngine,
  PositionSizer,
  createPositionSizer,
  DrawdownMonitor,
  createDrawdownMonitor,
  type PositionSizeRequest,
} from './risk-management/index.js';

// Trading Bot (placeholder exports)
export * from './trading-bot/index.js';

// Sentiment Analysis (placeholder exports)
export * from './sentiment-analysis/index.js';

// Trade Learning (placeholder exports)
export * from './trade-learning/index.js';

// Portfolio (placeholder exports)
export * from './portfolio/index.js';

// Wallet Monitoring (placeholder exports)
export * from './wallet-monitoring/index.js';

// Invoicing (placeholder exports)
export * from './invoicing/index.js';
