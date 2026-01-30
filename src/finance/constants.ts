/**
 * Finance Module Constants
 *
 * Events, defaults, error codes, and other constants for the finance module.
 */

// =============================================================================
// Event Constants
// =============================================================================

export const FINANCE_EVENTS = {
  // Trading Events
  TRADE_CREATED: 'finance:trade:created',
  TRADE_UPDATED: 'finance:trade:updated',
  TRADE_FILLED: 'finance:trade:filled',
  TRADE_CANCELLED: 'finance:trade:cancelled',
  TRADE_FAILED: 'finance:trade:failed',
  ORDER_SUBMITTED: 'finance:order:submitted',
  ORDER_REJECTED: 'finance:order:rejected',

  // Risk Management Events
  RISK_CHECK_PASSED: 'finance:risk:passed',
  RISK_CHECK_FAILED: 'finance:risk:failed',
  RISK_WARNING: 'finance:risk:warning',
  DRAWDOWN_WARNING: 'finance:drawdown:warning',
  DRAWDOWN_CRITICAL: 'finance:drawdown:critical',
  TRADING_HALTED: 'finance:trading:halted',
  TRADING_RESUMED: 'finance:trading:resumed',
  DAILY_LOSS_LIMIT_REACHED: 'finance:daily-loss:reached',
  POSITION_LIMIT_REACHED: 'finance:position-limit:reached',
  COOLDOWN_STARTED: 'finance:cooldown:started',
  COOLDOWN_ENDED: 'finance:cooldown:ended',

  // Sentiment Events
  SENTIMENT_UPDATED: 'finance:sentiment:updated',
  SENTIMENT_SIGNAL_GENERATED: 'finance:sentiment:signal',
  SENTIMENT_TREND_CHANGE: 'finance:sentiment:trend-change',
  BULLISH_SIGNAL: 'finance:signal:bullish',
  BEARISH_SIGNAL: 'finance:signal:bearish',

  // Portfolio Events
  PORTFOLIO_UPDATED: 'finance:portfolio:updated',
  POSITION_OPENED: 'finance:position:opened',
  POSITION_CLOSED: 'finance:position:closed',
  POSITION_UPDATED: 'finance:position:updated',
  REBALANCE_SUGGESTED: 'finance:rebalance:suggested',
  REBALANCE_EXECUTED: 'finance:rebalance:executed',
  PERFORMANCE_SNAPSHOT: 'finance:performance:snapshot',

  // Wallet Events
  WALLET_ADDED: 'finance:wallet:added',
  WALLET_REMOVED: 'finance:wallet:removed',
  WALLET_BALANCE_CHANGED: 'finance:wallet:balance-changed',
  WALLET_TRANSACTION_DETECTED: 'finance:wallet:transaction',
  WALLET_LARGE_TRANSACTION: 'finance:wallet:large-transaction',
  WALLET_LOW_BALANCE: 'finance:wallet:low-balance',
  GAS_PRICE_SPIKE: 'finance:gas:spike',

  // Invoice Events
  INVOICE_CREATED: 'finance:invoice:created',
  INVOICE_SENT: 'finance:invoice:sent',
  INVOICE_PAID: 'finance:invoice:paid',
  INVOICE_OVERDUE: 'finance:invoice:overdue',
  INVOICE_CANCELLED: 'finance:invoice:cancelled',
  TIME_ENTRY_CREATED: 'finance:time-entry:created',
  TIME_ENTRY_UPDATED: 'finance:time-entry:updated',

  // Learning Events
  PATTERN_LEARNED: 'finance:pattern:learned',
  PATTERN_UPDATED: 'finance:pattern:updated',
  PATTERN_MATCHED: 'finance:pattern:matched',
  TRADE_EVALUATED: 'finance:trade:evaluated',
  LEARNING_CYCLE_COMPLETE: 'finance:learning:cycle-complete',

  // Provider Events
  PROVIDER_CONNECTED: 'finance:provider:connected',
  PROVIDER_DISCONNECTED: 'finance:provider:disconnected',
  PROVIDER_ERROR: 'finance:provider:error',
  RATE_LIMIT_WARNING: 'finance:rate-limit:warning',

  // Alert Events
  ALERT_TRIGGERED: 'finance:alert:triggered',
  ALERT_ACKNOWLEDGED: 'finance:alert:acknowledged',
  ALERT_EXPIRED: 'finance:alert:expired',
} as const;

// =============================================================================
// Error Codes
// =============================================================================

export const FINANCE_ERROR_CODES = {
  // General Errors
  UNKNOWN_ERROR: 'FINANCE_UNKNOWN_ERROR',
  INITIALIZATION_FAILED: 'FINANCE_INIT_FAILED',
  CONFIGURATION_INVALID: 'FINANCE_CONFIG_INVALID',
  NOT_INITIALIZED: 'FINANCE_NOT_INITIALIZED',

  // Provider Errors
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  PROVIDER_AUTH_FAILED: 'PROVIDER_AUTH_FAILED',
  PROVIDER_RATE_LIMITED: 'PROVIDER_RATE_LIMITED',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  DOMAIN_NOT_ALLOWED: 'DOMAIN_NOT_ALLOWED',

  // Trading Errors
  TRADE_NOT_FOUND: 'TRADE_NOT_FOUND',
  TRADE_ALREADY_EXISTS: 'TRADE_ALREADY_EXISTS',
  TRADE_INVALID_STATUS: 'TRADE_INVALID_STATUS',
  ORDER_REJECTED: 'ORDER_REJECTED',
  ORDER_FAILED: 'ORDER_FAILED',
  ORDER_TIMEOUT: 'ORDER_TIMEOUT',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  INVALID_PRICE: 'INVALID_PRICE',
  MARKET_CLOSED: 'MARKET_CLOSED',
  TRADING_PAIR_NOT_FOUND: 'TRADING_PAIR_NOT_FOUND',

  // Risk Errors
  RISK_CHECK_FAILED: 'RISK_CHECK_FAILED',
  POSITION_SIZE_EXCEEDED: 'POSITION_SIZE_EXCEEDED',
  DAILY_LOSS_LIMIT_EXCEEDED: 'DAILY_LOSS_LIMIT_EXCEEDED',
  DRAWDOWN_LIMIT_EXCEEDED: 'DRAWDOWN_LIMIT_EXCEEDED',
  POSITION_LIMIT_EXCEEDED: 'POSITION_LIMIT_EXCEEDED',
  LIQUIDITY_INSUFFICIENT: 'LIQUIDITY_INSUFFICIENT',
  STOP_LOSS_REQUIRED: 'STOP_LOSS_REQUIRED',
  LEVERAGE_EXCEEDED: 'LEVERAGE_EXCEEDED',
  TRADING_HALTED: 'TRADING_HALTED',
  COOLDOWN_ACTIVE: 'COOLDOWN_ACTIVE',
  RISK_REWARD_INSUFFICIENT: 'RISK_REWARD_INSUFFICIENT',

  // Portfolio Errors
  PORTFOLIO_NOT_FOUND: 'PORTFOLIO_NOT_FOUND',
  POSITION_NOT_FOUND: 'POSITION_NOT_FOUND',
  INVALID_ALLOCATION: 'INVALID_ALLOCATION',
  REBALANCE_FAILED: 'REBALANCE_FAILED',

  // Wallet Errors
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  WALLET_ALREADY_EXISTS: 'WALLET_ALREADY_EXISTS',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  NETWORK_NOT_SUPPORTED: 'NETWORK_NOT_SUPPORTED',
  TRANSACTION_NOT_FOUND: 'TRANSACTION_NOT_FOUND',

  // Invoice Errors
  INVOICE_NOT_FOUND: 'INVOICE_NOT_FOUND',
  INVOICE_ALREADY_PAID: 'INVOICE_ALREADY_PAID',
  INVOICE_CANCELLED: 'INVOICE_CANCELLED',
  TIME_ENTRY_NOT_FOUND: 'TIME_ENTRY_NOT_FOUND',
  TIME_ENTRY_ALREADY_BILLED: 'TIME_ENTRY_ALREADY_BILLED',
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
  INVALID_LINE_ITEM: 'INVALID_LINE_ITEM',

  // Sentiment Errors
  SENTIMENT_FETCH_FAILED: 'SENTIMENT_FETCH_FAILED',
  NO_SENTIMENT_DATA: 'NO_SENTIMENT_DATA',
  SENTIMENT_SOURCE_UNAVAILABLE: 'SENTIMENT_SOURCE_UNAVAILABLE',

  // Learning Errors
  PATTERN_NOT_FOUND: 'PATTERN_NOT_FOUND',
  EVALUATION_FAILED: 'EVALUATION_FAILED',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
} as const;

// =============================================================================
// Default Values
// =============================================================================

export const FINANCE_DEFAULTS = {
  // Timeouts
  API_TIMEOUT_MS: 10000,
  ORDER_TIMEOUT_MS: 30000,
  WEBSOCKET_TIMEOUT_MS: 30000,

  // Rate Limiting
  RATE_LIMIT_PER_MINUTE: 30,
  RATE_LIMIT_BURST: 5,

  // Retry Configuration
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
  RETRY_MULTIPLIER: 2,
  RETRY_MAX_DELAY_MS: 10000,

  // Caching
  PRICE_CACHE_SECONDS: 30,
  SENTIMENT_CACHE_SECONDS: 300,
  BALANCE_CACHE_SECONDS: 60,

  // Polling Intervals
  PRICE_POLL_SECONDS: 60,
  WALLET_POLL_MINUTES: 5,
  SENTIMENT_POLL_MINUTES: 15,
  PORTFOLIO_SNAPSHOT_HOURS: 6,

  // Risk Management
  MAX_POSITION_SIZE_PERCENT: 10,
  MAX_DAILY_LOSS_PERCENT: 5,
  MAX_DRAWDOWN_PERCENT: 15,
  MAX_OPEN_POSITIONS: 10,
  MIN_LIQUIDITY_RATIO: 0.2,
  MAX_LEVERAGE_RATIO: 1,
  COOLDOWN_MINUTES_AFTER_LOSS: 30,
  MIN_RISK_REWARD_RATIO: 1.5,
  MAX_SINGLE_TRADE_RISK_PERCENT: 2,

  // Sentiment Analysis
  SENTIMENT_SIGNAL_THRESHOLD: 0.6,
  SENTIMENT_SIGNAL_EXPIRY_MINUTES: 60,
  MIN_SAMPLE_SIZE_FOR_SIGNAL: 10,
  INFLUENCER_MIN_FOLLOWERS: 10000,

  // Portfolio
  REBALANCE_THRESHOLD_PERCENT: 5,
  TAX_LOT_METHOD: 'fifo' as const,

  // Wallet Monitoring
  GAS_SPIKE_THRESHOLD_GWEI: 100,
  LARGE_TRANSACTION_THRESHOLD_USD: 10000,

  // Invoicing
  PAYMENT_TERMS_DAYS: 30,
  INVOICE_NUMBER_PADDING: 5,

  // Learning
  MIN_TRADES_FOR_PATTERN: 10,
  MIN_PATTERN_CONFIDENCE: 0.6,
  PATTERN_DECAY_DAYS: 90,
  MAX_PATTERNS_STORED: 1000,
  EVALUATE_TRADES_AFTER_HOURS: 24,
  SIMILARITY_THRESHOLD: 0.8,

  // Alerts
  ALERT_COOLDOWN_MINUTES: 15,
  CRITICAL_ALERT_COOLDOWN_MINUTES: 5,
  ALERT_EXPIRY_HOURS: 24,
} as const;

// =============================================================================
// Supported Assets
// =============================================================================

export const SUPPORTED_FIAT_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CAD',
  'AUD',
  'CHF',
] as const;

export const COMMON_CRYPTO_SYMBOLS = [
  'BTC',
  'ETH',
  'SOL',
  'USDT',
  'USDC',
  'XRP',
  'ADA',
  'DOGE',
  'AVAX',
  'DOT',
  'MATIC',
  'LINK',
  'UNI',
  'ATOM',
  'LTC',
] as const;

// =============================================================================
// Exchange-Specific Constants
// =============================================================================

export const EXCHANGE_API_URLS = {
  coinbase: {
    rest: 'https://api.exchange.coinbase.com',
    sandbox: 'https://api-public.sandbox.exchange.coinbase.com',
    websocket: 'wss://ws-feed.exchange.coinbase.com',
    sandboxWebsocket: 'wss://ws-feed-public.sandbox.exchange.coinbase.com',
  },
  kraken: {
    rest: 'https://api.kraken.com',
    websocket: 'wss://ws.kraken.com',
  },
  binance: {
    rest: 'https://api.binance.com',
    us: 'https://api.binance.us',
    testnet: 'https://testnet.binance.vision',
    websocket: 'wss://stream.binance.com:9443',
    testnetWebsocket: 'wss://testnet.binance.vision',
  },
} as const;

// =============================================================================
// Blockchain Constants
// =============================================================================

export const BLOCKCHAIN_EXPLORERS = {
  ethereum: 'https://etherscan.io',
  bitcoin: 'https://blockstream.info',
  solana: 'https://explorer.solana.com',
  polygon: 'https://polygonscan.com',
  arbitrum: 'https://arbiscan.io',
  optimism: 'https://optimistic.etherscan.io',
  avalanche: 'https://snowtrace.io',
  bsc: 'https://bscscan.com',
} as const;

export const BLOCKCHAIN_API_URLS = {
  ethereum: {
    etherscan: 'https://api.etherscan.io/api',
    infura: 'https://mainnet.infura.io/v3',
    alchemy: 'https://eth-mainnet.g.alchemy.com/v2',
  },
  bitcoin: {
    blockcypher: 'https://api.blockcypher.com/v1/btc/main',
    blockstream: 'https://blockstream.info/api',
  },
  solana: {
    mainnet: 'https://api.mainnet-beta.solana.com',
    devnet: 'https://api.devnet.solana.com',
  },
} as const;

export const NATIVE_TOKENS = {
  ethereum: { symbol: 'ETH', decimals: 18 },
  bitcoin: { symbol: 'BTC', decimals: 8 },
  solana: { symbol: 'SOL', decimals: 9 },
  polygon: { symbol: 'MATIC', decimals: 18 },
  arbitrum: { symbol: 'ETH', decimals: 18 },
  optimism: { symbol: 'ETH', decimals: 18 },
  avalanche: { symbol: 'AVAX', decimals: 18 },
  bsc: { symbol: 'BNB', decimals: 18 },
} as const;

// =============================================================================
// Sentiment Source Constants
// =============================================================================

export const SENTIMENT_WEIGHTS = {
  twitter: 0.35,
  reddit: 0.25,
  news: 0.40,
} as const;

export const SENTIMENT_LABELS = {
  VERY_BULLISH: { min: 0.6, max: 1.0, label: 'very_bullish' },
  BULLISH: { min: 0.2, max: 0.6, label: 'bullish' },
  NEUTRAL: { min: -0.2, max: 0.2, label: 'neutral' },
  BEARISH: { min: -0.6, max: -0.2, label: 'bearish' },
  VERY_BEARISH: { min: -1.0, max: -0.6, label: 'very_bearish' },
} as const;

// =============================================================================
// Invoice Templates
// =============================================================================

export const INVOICE_TEMPLATES = {
  standard: 'standard',
  minimal: 'minimal',
  professional: 'professional',
  detailed: 'detailed',
} as const;

export const INVOICE_STATUS_FLOW = {
  draft: ['sent', 'cancelled'],
  sent: ['viewed', 'paid', 'overdue', 'cancelled'],
  viewed: ['paid', 'overdue', 'cancelled'],
  overdue: ['paid', 'cancelled'],
  paid: ['refunded'],
  cancelled: [],
  refunded: [],
} as const;

// =============================================================================
// Pattern Categories
// =============================================================================

export const PATTERN_CATEGORIES = [
  'entry',
  'exit',
  'risk',
  'timing',
  'sentiment',
  'technical',
] as const;

export const PATTERN_CONDITION_TYPES = [
  'sentiment',
  'price',
  'volume',
  'volatility',
  'trend',
  'time',
  'custom',
] as const;

// =============================================================================
// Type Exports for Constants
// =============================================================================

export type FinanceEventType = (typeof FINANCE_EVENTS)[keyof typeof FINANCE_EVENTS];
export type FinanceErrorCode = (typeof FINANCE_ERROR_CODES)[keyof typeof FINANCE_ERROR_CODES];
export type SupportedFiatCurrency = (typeof SUPPORTED_FIAT_CURRENCIES)[number];
export type CommonCryptoSymbol = (typeof COMMON_CRYPTO_SYMBOLS)[number];
export type PatternCategory = (typeof PATTERN_CATEGORIES)[number];
export type PatternConditionType = (typeof PATTERN_CONDITION_TYPES)[number];
