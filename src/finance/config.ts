/**
 * Finance Module Configuration Schemas
 *
 * Zod schemas for validating and typing finance module configuration.
 */

import { z } from 'zod';

// =============================================================================
// Exchange Configuration Schemas
// =============================================================================

export const ExchangeCredentialsSchema = z.object({
  apiKeyEnvVar: z.string().default(''),
  apiSecretEnvVar: z.string().default(''),
  passphraseEnvVar: z.string().optional(), // Coinbase requires passphrase
});

export const ExchangeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  credentials: ExchangeCredentialsSchema,
  sandbox: z.boolean().default(true), // Use sandbox/testnet by default
  rateLimitPerMinute: z.number().min(1).max(1000).default(30),
  timeout: z.number().min(1000).max(60000).default(10000),
  retryAttempts: z.number().min(0).max(5).default(3),
  retryDelayMs: z.number().min(100).max(10000).default(1000),
});

export const ExchangesConfigSchema = z.object({
  coinbase: ExchangeConfigSchema.optional(),
  kraken: ExchangeConfigSchema.optional(),
  binance: ExchangeConfigSchema.optional(),
});

// =============================================================================
// Risk Management Configuration Schema
// =============================================================================

export const RiskRulesSchema = z.object({
  maxPositionSizePercent: z.number().min(1).max(100).default(10),
  maxDailyLossPercent: z.number().min(1).max(50).default(5),
  maxDrawdownPercent: z.number().min(1).max(50).default(15),
  maxOpenPositions: z.number().min(1).max(100).default(10),
  minLiquidityRatio: z.number().min(0).max(1).default(0.2),
  requireStopLoss: z.boolean().default(true),
  maxLeverageRatio: z.number().min(1).max(10).default(1),
  cooldownMinutesAfterLoss: z.number().min(0).max(1440).default(30),
  maxSingleTradeRiskPercent: z.number().min(0.1).max(10).default(2),
  minRiskRewardRatio: z.number().min(1).max(10).default(1.5),
});

export const RiskManagementConfigSchema = z.object({
  enabled: z.boolean().default(true),
  rules: RiskRulesSchema.default({}),
  alertOnViolation: z.boolean().default(true),
  haltOnCriticalViolation: z.boolean().default(true),
  dailyPnLResetHourUtc: z.number().min(0).max(23).default(0),
  snapshotIntervalMinutes: z.number().min(1).max(60).default(5),
});

// =============================================================================
// Sentiment Analysis Configuration Schema
// =============================================================================

export const TwitterSentimentConfigSchema = z.object({
  enabled: z.boolean().default(false),
  apiKeyEnvVar: z.string().default('TWITTER_API_KEY'),
  apiSecretEnvVar: z.string().default('TWITTER_API_SECRET'),
  bearerTokenEnvVar: z.string().default('TWITTER_BEARER_TOKEN'),
  rateLimitPerMinute: z.number().min(1).max(100).default(15),
  trackedAccounts: z.array(z.string()).default([]),
  trackedHashtags: z.array(z.string()).default([]),
  minFollowers: z.number().min(0).default(1000),
});

export const RedditSentimentConfigSchema = z.object({
  enabled: z.boolean().default(false),
  clientIdEnvVar: z.string().default('REDDIT_CLIENT_ID'),
  clientSecretEnvVar: z.string().default('REDDIT_CLIENT_SECRET'),
  rateLimitPerMinute: z.number().min(1).max(60).default(10),
  subreddits: z.array(z.string()).default(['cryptocurrency', 'bitcoin', 'ethereum']),
  minUpvotes: z.number().min(0).default(10),
});

export const NewsSentimentConfigSchema = z.object({
  enabled: z.boolean().default(false),
  apiKeyEnvVar: z.string().default('NEWS_API_KEY'),
  rateLimitPerMinute: z.number().min(1).max(100).default(30),
  sources: z.array(z.string()).default([]),
  excludeSources: z.array(z.string()).default([]),
  languages: z.array(z.string()).default(['en']),
});

export const SentimentConfigSchema = z.object({
  enabled: z.boolean().default(true),
  twitter: TwitterSentimentConfigSchema.optional(),
  reddit: RedditSentimentConfigSchema.optional(),
  news: NewsSentimentConfigSchema.optional(),
  aggregationIntervalMinutes: z.number().min(1).max(60).default(15),
  signalThresholdStrength: z.number().min(0).max(1).default(0.6),
  signalExpirationMinutes: z.number().min(5).max(1440).default(60),
  cacheResultsMinutes: z.number().min(1).max(60).default(5),
});

// =============================================================================
// Portfolio Configuration Schema
// =============================================================================

export const PortfolioConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultCurrency: z.enum(['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF']).default('USD'),
  rebalanceThresholdPercent: z.number().min(1).max(50).default(5),
  snapshotIntervalHours: z.number().min(1).max(24).default(6),
  performanceCalculationMethod: z.enum(['twrr', 'mwrr', 'simple']).default('twrr'),
  taxLotMethod: z.enum(['fifo', 'lifo', 'hifo', 'specific']).default('fifo'),
  includeFees: z.boolean().default(true),
  trackUnrealizedGains: z.boolean().default(true),
});

// =============================================================================
// Wallet Monitoring Configuration Schema
// =============================================================================

export const BlockchainProviderConfigSchema = z.object({
  enabled: z.boolean().default(false),
  rpcUrlEnvVar: z.string().optional(),
  apiKeyEnvVar: z.string().optional(),
  rateLimitPerMinute: z.number().min(1).max(100).default(30),
  timeout: z.number().min(1000).max(60000).default(15000),
});

export const WalletMonitoringConfigSchema = z.object({
  enabled: z.boolean().default(true),
  ethereum: BlockchainProviderConfigSchema.extend({
    enabled: z.boolean().default(false),
    apiKeyEnvVar: z.string().default('ETHERSCAN_API_KEY'),
  }).optional(),
  bitcoin: BlockchainProviderConfigSchema.extend({
    enabled: z.boolean().default(false),
    apiKeyEnvVar: z.string().default('BLOCKCYPHER_API_KEY'),
  }).optional(),
  solana: BlockchainProviderConfigSchema.extend({
    enabled: z.boolean().default(false),
    rpcUrlEnvVar: z.string().default('SOLANA_RPC_URL'),
  }).optional(),
  pollIntervalMinutes: z.number().min(1).max(60).default(5),
  gasPriceAlertThreshold: z.number().min(1).default(100), // Gwei
  largeTransactionThresholdUsd: z.number().min(100).default(10000),
});

// =============================================================================
// Invoicing Configuration Schema
// =============================================================================

export const InvoicingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultCurrency: z.enum(['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF']).default('USD'),
  defaultTaxRate: z.number().min(0).max(100).default(0),
  defaultPaymentTermsDays: z.number().min(1).max(365).default(30),
  invoiceNumberPrefix: z.string().default('INV-'),
  invoiceNumberPadding: z.number().min(1).max(10).default(5),
  defaultTemplate: z.string().default('standard'),
  companyInfo: z.object({
    name: z.string().optional(),
    address: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    taxId: z.string().optional(),
    logo: z.string().optional(),
  }).optional(),
  overdueReminderDays: z.array(z.number()).default([1, 7, 14, 30]),
});

// =============================================================================
// Trade Learning Configuration Schema
// =============================================================================

export const TradeLearningConfigSchema = z.object({
  enabled: z.boolean().default(true),
  minTradesForPattern: z.number().min(3).max(100).default(10),
  minPatternConfidence: z.number().min(0).max(1).default(0.6),
  patternDecayDays: z.number().min(1).max(365).default(90),
  maxPatternsStored: z.number().min(10).max(10000).default(1000),
  evaluateTradesAfterHours: z.number().min(1).max(168).default(24),
  useEmbeddings: z.boolean().default(false),
  embeddingModelEnvVar: z.string().default('OPENAI_API_KEY'),
  similarityThreshold: z.number().min(0).max(1).default(0.8),
  autoLearnFromTrades: z.boolean().default(true),
  learningCycleHours: z.number().min(1).max(168).default(24),
});

// =============================================================================
// Trading Bot Configuration Schema
// =============================================================================

export const TradingBotConfigSchema = z.object({
  enabled: z.boolean().default(false), // Disabled by default for safety
  paperTrading: z.boolean().default(true), // Paper trading by default
  defaultExchange: z.enum(['coinbase', 'kraken', 'binance']).optional(),
  maxConcurrentStrategies: z.number().min(1).max(10).default(3),
  signalAggregationMethod: z.enum(['weighted', 'consensus', 'strongest']).default('consensus'),
  minAggregatedConfidence: z.number().min(0).max(1).default(0.7),
  executionDelayMs: z.number().min(0).max(60000).default(1000),
  orderTimeoutMs: z.number().min(1000).max(300000).default(30000),
  retryFailedOrders: z.boolean().default(false),
  logAllSignals: z.boolean().default(true),
  webhookUrl: z.string().url().optional(),
});

// =============================================================================
// Main Finance Configuration Schema
// =============================================================================

export const FinanceConfigSchema = z.object({
  enabled: z.boolean().default(true),

  // API domain allowlist (deny-by-default)
  allowedApiDomains: z.array(z.string()).default([
    'api.coinbase.com',
    'api.pro.coinbase.com',
    'api.exchange.coinbase.com',
    'api.kraken.com',
    'api.binance.com',
    'api.binance.us',
    'api.etherscan.io',
    'api.blockcypher.com',
    'api.coingecko.com',
    'pro-api.coinmarketcap.com',
    'api.twitter.com',
    'oauth.reddit.com',
    'newsapi.org',
  ]),

  // Exchange configurations
  exchanges: ExchangesConfigSchema.default({}),

  // Feature configurations
  riskManagement: RiskManagementConfigSchema.optional(),
  sentiment: SentimentConfigSchema.optional(),
  portfolio: PortfolioConfigSchema.optional(),
  walletMonitoring: WalletMonitoringConfigSchema.optional(),
  invoicing: InvoicingConfigSchema.optional(),
  tradeLearning: TradeLearningConfigSchema.optional(),
  tradingBot: TradingBotConfigSchema.optional(),

  // Storage configuration
  storeType: z.enum(['memory', 'database']).default('database'),

  // Event configuration
  eventBusEnabled: z.boolean().default(true),

  // Price data configuration
  priceDataProvider: z.enum(['coingecko', 'coinmarketcap', 'exchange']).default('coingecko'),
  priceUpdateIntervalSeconds: z.number().min(10).max(3600).default(60),
  priceCacheDurationSeconds: z.number().min(5).max(300).default(30),
});

// =============================================================================
// Type Exports
// =============================================================================

export type ExchangeCredentials = z.infer<typeof ExchangeCredentialsSchema>;
export type ExchangeConfig = z.infer<typeof ExchangeConfigSchema>;
export type ExchangesConfig = z.infer<typeof ExchangesConfigSchema>;
export type RiskRules = z.infer<typeof RiskRulesSchema>;
export type RiskManagementConfig = z.infer<typeof RiskManagementConfigSchema>;
export type TwitterSentimentConfig = z.infer<typeof TwitterSentimentConfigSchema>;
export type RedditSentimentConfig = z.infer<typeof RedditSentimentConfigSchema>;
export type NewsSentimentConfig = z.infer<typeof NewsSentimentConfigSchema>;
export type SentimentConfig = z.infer<typeof SentimentConfigSchema>;
export type PortfolioConfig = z.infer<typeof PortfolioConfigSchema>;
export type BlockchainProviderConfig = z.infer<typeof BlockchainProviderConfigSchema>;
export type WalletMonitoringConfig = z.infer<typeof WalletMonitoringConfigSchema>;
export type InvoicingConfig = z.infer<typeof InvoicingConfigSchema>;
export type TradeLearningConfig = z.infer<typeof TradeLearningConfigSchema>;
export type TradingBotConfig = z.infer<typeof TradingBotConfigSchema>;
export type FinanceConfig = z.infer<typeof FinanceConfigSchema>;

// =============================================================================
// Default Values Export
// =============================================================================

export const DEFAULT_RISK_RULES: RiskRules = {
  maxPositionSizePercent: 10,
  maxDailyLossPercent: 5,
  maxDrawdownPercent: 15,
  maxOpenPositions: 10,
  minLiquidityRatio: 0.2,
  requireStopLoss: true,
  maxLeverageRatio: 1,
  cooldownMinutesAfterLoss: 30,
  maxSingleTradeRiskPercent: 2,
  minRiskRewardRatio: 1.5,
};

export const DEFAULT_FINANCE_CONFIG: FinanceConfig = FinanceConfigSchema.parse({});
