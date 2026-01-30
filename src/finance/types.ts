/**
 * Finance Module Type Definitions
 *
 * Comprehensive types for trading, risk management, sentiment analysis,
 * portfolio tracking, wallet monitoring, and invoicing.
 */

// =============================================================================
// Common Types
// =============================================================================

export type Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD' | 'CHF';
export type CryptoCurrency = 'BTC' | 'ETH' | 'SOL' | 'USDT' | 'USDC' | string;
export type Asset = Currency | CryptoCurrency;

export interface Money {
  amount: number;
  currency: Currency;
}

export interface CryptoAmount {
  amount: number;
  symbol: CryptoCurrency;
}

export interface Timestamp {
  timestamp: number;
  iso: string;
}

// =============================================================================
// Exchange & Trading Types
// =============================================================================

export type ExchangeId = 'coinbase' | 'kraken' | 'binance';

export type OrderSide = 'buy' | 'sell';

export type OrderType = 'market' | 'limit' | 'stop-loss' | 'stop-limit' | 'take-profit' | 'trailing-stop';

export type TradeStatus =
  | 'pending'
  | 'open'
  | 'filled'
  | 'partial'
  | 'cancelled'
  | 'failed'
  | 'expired';

export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'GTD';

export interface TradingPair {
  base: Asset;
  quote: Asset;
  symbol: string; // e.g., "BTC-USD"
}

export interface Trade {
  id: string;
  exchangeId: ExchangeId;
  exchangeOrderId?: string;
  userId: string;
  pair: TradingPair;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number; // For limit orders
  stopPrice?: number; // For stop orders
  filledQuantity: number;
  averageFilledPrice?: number;
  status: TradeStatus;
  timeInForce: TimeInForce;
  fees: number;
  feeCurrency: Asset;
  strategyId?: string;
  signalId?: string;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  filledAt?: number;
  cancelledAt?: number;
}

export interface MarketData {
  exchangeId: ExchangeId;
  pair: TradingPair;
  bid: number;
  ask: number;
  last: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  change24h: number;
  changePercent24h: number;
  timestamp: number;
}

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type OHLCVInterval =
  | '1m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '4h'
  | '1d'
  | '1w'
  | '1M';

export interface OrderBook {
  exchangeId: ExchangeId;
  pair: TradingPair;
  bids: Array<{ price: number; quantity: number }>;
  asks: Array<{ price: number; quantity: number }>;
  timestamp: number;
}

export interface ExchangeBalance {
  asset: Asset;
  free: number;
  locked: number;
  total: number;
}

export interface ExchangeAccount {
  exchangeId: ExchangeId;
  balances: ExchangeBalance[];
  totalUsdValue: number;
  lastUpdated: number;
}

// =============================================================================
// Risk Management Types
// =============================================================================

export interface RiskRules {
  maxPositionSizePercent: number; // Max % of portfolio per position
  maxDailyLossPercent: number; // Halt trading after this daily loss
  maxDrawdownPercent: number; // Halt trading after this drawdown
  maxOpenPositions: number; // Max concurrent positions
  minLiquidityRatio: number; // Keep this % in cash
  requireStopLoss: boolean; // All trades must have stop-loss
  maxLeverageRatio: number; // Max leverage allowed
  cooldownMinutesAfterLoss: number; // Cooldown after significant loss
  maxSingleTradeRiskPercent: number; // Max risk per single trade
  minRiskRewardRatio: number; // Minimum risk/reward ratio
}

export interface RiskAssessment {
  allowed: boolean;
  trade: Partial<Trade>;
  violations: RiskViolation[];
  warnings: RiskWarning[];
  adjustedQuantity?: number;
  adjustedStopLoss?: number;
  timestamp: number;
}

export interface RiskViolation {
  rule: keyof RiskRules;
  message: string;
  currentValue: number;
  limit: number;
  severity: 'critical' | 'high';
}

export interface RiskWarning {
  rule: keyof RiskRules;
  message: string;
  currentValue: number;
  threshold: number;
  severity: 'medium' | 'low';
}

export interface DrawdownState {
  peakValue: number;
  currentValue: number;
  drawdownAmount: number;
  drawdownPercent: number;
  maxDrawdownAmount: number;
  maxDrawdownPercent: number;
  isHalted: boolean;
  haltedAt?: number;
  haltReason?: string;
  recoveryNeeded: number;
  lastUpdated: number;
}

export interface DailyPnL {
  date: string; // YYYY-MM-DD
  startValue: number;
  currentValue: number;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;
  percentChange: number;
  trades: number;
  wins: number;
  losses: number;
  isLossLimitReached: boolean;
}

export interface PositionSizeResult {
  recommendedQuantity: number;
  maxAllowedQuantity: number;
  riskAmount: number;
  portfolioPercent: number;
  stopLossDistance: number;
  potentialLoss: number;
  potentialGain: number;
  riskRewardRatio: number;
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
}

// =============================================================================
// Sentiment Analysis Types
// =============================================================================

export type SentimentSource = 'twitter' | 'reddit' | 'news' | 'discord' | 'telegram';

export type SentimentLabel = 'very_bullish' | 'bullish' | 'neutral' | 'bearish' | 'very_bearish';

export interface SentimentScore {
  asset: Asset;
  score: number; // -1 to 1
  label: SentimentLabel;
  confidence: number; // 0 to 1
  sources: SentimentSourceScore[];
  sampleSize: number;
  timestamp: number;
  timeframe: '1h' | '4h' | '24h' | '7d';
}

export interface SentimentSourceScore {
  source: SentimentSource;
  score: number;
  confidence: number;
  sampleSize: number;
  trendDirection: 'improving' | 'stable' | 'declining';
  significantPosts: SocialPost[];
}

export interface SocialPost {
  id: string;
  source: SentimentSource;
  author: string;
  authorFollowers?: number;
  content: string;
  sentiment: number;
  engagement: {
    likes: number;
    shares: number;
    comments: number;
  };
  isInfluencer: boolean;
  publishedAt: number;
  analyzedAt: number;
}

export interface SentimentTrend {
  asset: Asset;
  currentScore: number;
  previousScore: number;
  change: number;
  direction: 'improving' | 'stable' | 'declining';
  momentum: number;
  volatility: number;
  dataPoints: Array<{ timestamp: number; score: number }>;
}

export interface SentimentSignal {
  id: string;
  asset: Asset;
  type: 'bullish' | 'bearish' | 'reversal' | 'breakout';
  strength: number; // 0 to 1
  confidence: number;
  sources: SentimentSource[];
  trigger: string;
  timestamp: number;
  expiresAt: number;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Portfolio Types
// =============================================================================

export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  positions: Position[];
  cashBalance: Money;
  totalValue: Money;
  targetAllocations?: AllocationTarget[];
  createdAt: number;
  updatedAt: number;
}

export interface Position {
  id: string;
  portfolioId: string;
  asset: Asset;
  quantity: number;
  costBasis: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  realizedPnL: number;
  allocationPercent: number;
  avgEntryPrice: number;
  firstBuyDate: number;
  lastUpdateDate: number;
  exchange?: ExchangeId;
  lots: PositionLot[];
}

export interface PositionLot {
  id: string;
  quantity: number;
  price: number;
  date: number;
  fees: number;
  tradeId?: string;
}

export interface AllocationTarget {
  asset: Asset;
  targetPercent: number;
  minPercent?: number;
  maxPercent?: number;
}

export interface RebalanceSuggestion {
  id: string;
  portfolioId: string;
  asset: Asset;
  action: 'buy' | 'sell';
  quantity: number;
  estimatedValue: number;
  currentAllocation: number;
  targetAllocation: number;
  drift: number;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  createdAt: number;
}

export interface PortfolioPerformance {
  portfolioId: string;
  period: '1d' | '1w' | '1m' | '3m' | '6m' | '1y' | 'ytd' | 'all';
  startValue: number;
  endValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownDate: number;
  winRate: number;
  profitFactor: number;
  bestDay: { date: string; return: number };
  worstDay: { date: string; return: number };
  dailyReturns: Array<{ date: string; return: number; value: number }>;
}

export interface PortfolioSnapshot {
  portfolioId: string;
  timestamp: number;
  totalValue: number;
  positions: Array<{
    asset: Asset;
    quantity: number;
    value: number;
    allocation: number;
  }>;
}

// =============================================================================
// Wallet Monitoring Types
// =============================================================================

export type BlockchainNetwork =
  | 'ethereum'
  | 'bitcoin'
  | 'solana'
  | 'polygon'
  | 'arbitrum'
  | 'optimism'
  | 'avalanche'
  | 'bsc';

export interface WatchedWallet {
  id: string;
  userId: string;
  address: string;
  network: BlockchainNetwork;
  label: string;
  balances: WalletBalance[];
  totalUsdValue: number;
  alertThresholds: WalletAlertThresholds;
  isOwned: boolean; // User's own wallet vs. watching someone else's
  lastChecked: number;
  createdAt: number;
  updatedAt: number;
}

export interface WalletBalance {
  token: string;
  symbol: string;
  balance: number;
  decimals: number;
  usdValue: number;
  change24h?: number;
  contractAddress?: string;
  isNative: boolean;
}

export interface WalletAlertThresholds {
  minBalanceUsd?: number;
  maxBalanceUsd?: number;
  largeTransactionUsd?: number;
  tokenWhitelist?: string[];
  alertOnAnyTransaction?: boolean;
  alertOnIncoming?: boolean;
  alertOnOutgoing?: boolean;
}

export interface WalletTransaction {
  hash: string;
  network: BlockchainNetwork;
  from: string;
  to: string;
  value: number;
  tokenSymbol?: string;
  tokenAddress?: string;
  usdValue?: number;
  gasUsed?: number;
  gasPrice?: number;
  gasCostUsd?: number;
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
  timestamp: number;
  type: 'transfer' | 'swap' | 'approve' | 'contract' | 'unknown';
  method?: string;
}

export interface GasPrice {
  network: BlockchainNetwork;
  slow: { gwei: number; estimatedSeconds: number };
  standard: { gwei: number; estimatedSeconds: number };
  fast: { gwei: number; estimatedSeconds: number };
  instant: { gwei: number; estimatedSeconds: number };
  baseFee?: number;
  priorityFee?: number;
  timestamp: number;
}

export interface WalletAlert {
  id: string;
  walletId: string;
  type:
    | 'low_balance'
    | 'high_balance'
    | 'large_transaction'
    | 'incoming_transfer'
    | 'outgoing_transfer'
    | 'gas_spike'
    | 'suspicious_activity';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  data: Record<string, unknown>;
  acknowledged: boolean;
  createdAt: number;
}

// =============================================================================
// Invoice Types
// =============================================================================

export interface Invoice {
  id: string;
  userId: string;
  invoiceNumber: string;
  client: InvoiceClient;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  currency: Currency;
  status: InvoiceStatus;
  issueDate: number;
  dueDate: number;
  paidDate?: number;
  paymentMethod?: string;
  notes?: string;
  terms?: string;
  template: string;
  createdAt: number;
  updatedAt: number;
}

export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled' | 'refunded';

export interface InvoiceClient {
  name: string;
  email?: string;
  phone?: string;
  address?: InvoiceAddress;
  taxId?: string;
}

export interface InvoiceAddress {
  street: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxable: boolean;
  category?: string;
  timeEntryIds?: string[];
}

export interface TimeEntry {
  id: string;
  userId: string;
  projectId?: string;
  projectName?: string;
  taskDescription: string;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  hourlyRate?: number;
  billable: boolean;
  billed: boolean;
  invoiceId?: string;
  tags?: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface InvoiceSummary {
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  totalOverdue: number;
  invoiceCount: number;
  paidCount: number;
  overdueCount: number;
  averagePaymentDays: number;
}

// =============================================================================
// Trade Learning Types (RAG)
// =============================================================================

export interface TradePattern {
  id: string;
  name: string;
  category: 'entry' | 'exit' | 'risk' | 'timing' | 'sentiment' | 'technical';
  conditions: PatternCondition[];
  outcome: 'profitable' | 'unprofitable' | 'neutral';
  successRate: number;
  sampleSize: number;
  averageReturn: number;
  averageHoldingPeriod: number;
  confidence: number;
  embedding?: number[];
  examples: string[];
  createdAt: number;
  lastUpdated: number;
  lastApplied?: number;
}

export interface PatternCondition {
  type: 'sentiment' | 'price' | 'volume' | 'volatility' | 'trend' | 'time' | 'custom';
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between' | 'contains';
  field: string;
  value: number | string | [number, number];
  weight: number;
}

export interface TradeEvaluation {
  id: string;
  tradeId: string;
  trade: Trade;
  entryScore: number;
  exitScore: number;
  timingScore: number;
  riskManagementScore: number;
  overallScore: number;
  actualReturn: number;
  expectedReturn?: number;
  holdingPeriodHours: number;
  lessonsLearned: string[];
  matchedPatterns: string[];
  newPatternSuggestions: string[];
  evaluatedAt: number;
}

export interface TradeLearningStats {
  totalTradesEvaluated: number;
  patternsIdentified: number;
  averageAccuracy: number;
  topPerformingPatterns: Array<{ patternId: string; name: string; successRate: number }>;
  recentImprovements: string[];
  lastLearningCycle: number;
}

export interface PatternMatch {
  patternId: string;
  pattern: TradePattern;
  matchScore: number;
  matchedConditions: PatternCondition[];
  recommendation: 'follow' | 'avoid' | 'neutral';
  confidence: number;
}

// =============================================================================
// Trading Signal Types
// =============================================================================

export interface TradingSignal {
  id: string;
  source: 'sentiment' | 'technical' | 'pattern' | 'manual' | 'combined';
  asset: Asset;
  action: 'buy' | 'sell' | 'hold';
  strength: number; // 0 to 1
  confidence: number;
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  timeframe: string;
  reasoning: string;
  expiresAt: number;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface AggregatedSignal {
  asset: Asset;
  signals: TradingSignal[];
  consensusAction: 'buy' | 'sell' | 'hold';
  aggregateStrength: number;
  aggregateConfidence: number;
  agreementRatio: number;
  conflictingSignals: boolean;
  recommendation: string;
  timestamp: number;
}

// =============================================================================
// Trading Strategy Types
// =============================================================================

export interface TradingStrategy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  assets: Asset[];
  entryRules: StrategyRule[];
  exitRules: StrategyRule[];
  positionSizing: 'fixed' | 'percent' | 'risk-based' | 'kelly';
  positionSizeValue: number;
  maxConcurrentTrades: number;
  minSignalStrength: number;
  minConfidence: number;
  cooldownMinutes: number;
  backtestResults?: BacktestResult;
  createdAt: number;
  updatedAt: number;
}

export interface StrategyRule {
  id: string;
  name: string;
  type: 'sentiment' | 'price' | 'volume' | 'time' | 'pattern';
  condition: string;
  parameters: Record<string, number | string>;
  weight: number;
  required: boolean;
}

export interface BacktestResult {
  strategyId: string;
  period: { start: number; end: number };
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  executedAt: number;
}

// =============================================================================
// Alert & Notification Types
// =============================================================================

export type FinanceAlertType =
  | 'risk_violation'
  | 'drawdown_warning'
  | 'trading_halted'
  | 'position_limit'
  | 'sentiment_signal'
  | 'price_alert'
  | 'wallet_alert'
  | 'trade_executed'
  | 'trade_failed'
  | 'rebalance_needed'
  | 'invoice_overdue'
  | 'pattern_detected';

export interface FinanceAlert {
  id: string;
  type: FinanceAlertType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  data: Record<string, unknown>;
  userId: string;
  acknowledged: boolean;
  acknowledgedAt?: number;
  createdAt: number;
  expiresAt?: number;
}

// =============================================================================
// Provider Result Types
// =============================================================================

export interface FinanceProviderResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  retryable?: boolean;
  cached?: boolean;
  fetchedAt: number;
  rateLimit?: {
    remaining: number;
    resetAt: number;
  };
}

// =============================================================================
// Query Option Types
// =============================================================================

export interface TradeQueryOptions {
  exchangeId?: ExchangeId;
  status?: TradeStatus[];
  side?: OrderSide;
  pair?: string;
  dateFrom?: number;
  dateTo?: number;
  strategyId?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'filledAt';
  sortOrder?: 'asc' | 'desc';
}

export interface PositionQueryOptions {
  portfolioId?: string;
  asset?: Asset;
  hasUnrealizedGain?: boolean;
  hasUnrealizedLoss?: boolean;
  minValue?: number;
  maxValue?: number;
}

export interface InvoiceQueryOptions {
  status?: InvoiceStatus[];
  clientName?: string;
  dateFrom?: number;
  dateTo?: number;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
  offset?: number;
}

export interface TimeEntryQueryOptions {
  projectId?: string;
  billable?: boolean;
  billed?: boolean;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
  offset?: number;
}

export interface WalletQueryOptions {
  network?: BlockchainNetwork;
  isOwned?: boolean;
  minValueUsd?: number;
}

export interface PatternQueryOptions {
  category?: TradePattern['category'];
  outcome?: TradePattern['outcome'];
  minConfidence?: number;
  minSuccessRate?: number;
  minSampleSize?: number;
  limit?: number;
  sortBy?: 'confidence' | 'successRate' | 'lastApplied';
}
