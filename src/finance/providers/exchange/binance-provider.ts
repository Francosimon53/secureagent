/**
 * Binance Exchange Provider
 *
 * Provides integration with Binance API for trading operations.
 */

import { createHmac } from 'crypto';
import {
  BaseFinanceProvider,
  FinanceProviderError,
  type FinanceProviderConfig,
} from '../base.js';
import type {
  MarketData,
  OHLCV,
  OHLCVInterval,
  OrderBook,
  ExchangeBalance,
  ExchangeAccount,
  Trade,
  TradingPair,
  FinanceProviderResult,
} from '../../types.js';
import { EXCHANGE_API_URLS, FINANCE_ERROR_CODES } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface BinanceProviderConfig extends FinanceProviderConfig {
  useTestnet?: boolean;
  useBinanceUS?: boolean;
}

interface BinanceExchangeInfo {
  timezone: string;
  serverTime: number;
  symbols: BinanceSymbol[];
}

interface BinanceSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  baseAssetPrecision: number;
  quoteAssetPrecision: number;
  orderTypes: string[];
  filters: Array<{ filterType: string; [key: string]: string | number }>;
}

interface BinanceTicker24h {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  count: number;
}

interface BinanceKline {
  0: number; // Open time
  1: string; // Open
  2: string; // High
  3: string; // Low
  4: string; // Close
  5: string; // Volume
  6: number; // Close time
  7: string; // Quote asset volume
  8: number; // Number of trades
  9: string; // Taker buy base asset volume
  10: string; // Taker buy quote asset volume
  11: string; // Unused
}

interface BinanceOrderBookResponse {
  lastUpdateId: number;
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
}

interface BinanceAccountInfo {
  makerCommission: number;
  takerCommission: number;
  buyerCommission: number;
  sellerCommission: number;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
  accountType: string;
  balances: Array<{
    asset: string;
    free: string;
    locked: string;
  }>;
}

interface BinanceOrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LOSS_LIMIT' | 'TAKE_PROFIT' | 'TAKE_PROFIT_LIMIT';
  quantity?: string;
  quoteOrderQty?: string;
  price?: string;
  stopPrice?: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  newClientOrderId?: string;
  newOrderRespType?: 'ACK' | 'RESULT' | 'FULL';
}

interface BinanceOrderResponse {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  fills?: Array<{
    price: string;
    qty: string;
    commission: string;
    commissionAsset: string;
  }>;
}

// =============================================================================
// Provider Implementation
// =============================================================================

export class BinanceProvider extends BaseFinanceProvider<BinanceProviderConfig> {
  private readonly baseUrl: string;
  private symbols: Map<string, BinanceSymbol> = new Map();
  private serverTimeOffset = 0;

  constructor(config: BinanceProviderConfig, allowedDomains?: string[]) {
    super(config, allowedDomains ?? ['api.binance.com', 'api.binance.us', 'testnet.binance.vision']);

    if (config.useTestnet) {
      this.baseUrl = EXCHANGE_API_URLS.binance.testnet;
    } else if (config.useBinanceUS) {
      this.baseUrl = EXCHANGE_API_URLS.binance.us;
    } else {
      this.baseUrl = EXCHANGE_API_URLS.binance.rest;
    }
  }

  get name(): string {
    return 'binance';
  }

  get type(): string {
    return 'exchange';
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  protected requiresApiSecret(): boolean {
    return true;
  }

  protected async onInitialize(): Promise<void> {
    await this.syncServerTime();
    await this.loadSymbols();
  }

  /**
   * Sync with Binance server time to avoid timestamp errors
   */
  private async syncServerTime(): Promise<void> {
    const result = await this.publicFetch<{ serverTime: number }>('/api/v3/time');
    if (result.success && result.data) {
      this.serverTimeOffset = result.data.serverTime - Date.now();
    }
  }

  /**
   * Get server-synced timestamp
   */
  private getTimestamp(): number {
    return Date.now() + this.serverTimeOffset;
  }

  /**
   * Create signature for authenticated requests
   */
  protected createSignature(
    _method: string,
    _path: string,
    body?: string
  ): string {
    if (!this.apiSecret) {
      throw new FinanceProviderError(
        this.name,
        FINANCE_ERROR_CODES.PROVIDER_AUTH_FAILED,
        'API secret not configured'
      );
    }

    return createHmac('sha256', this.apiSecret).update(body ?? '').digest('hex');
  }

  /**
   * Make authenticated request
   */
  private async authenticatedFetch<T>(
    method: string,
    path: string,
    params: Record<string, string | number> = {}
  ): Promise<FinanceProviderResult<T>> {
    this.ensureInitialized();

    const timestamp = this.getTimestamp();
    const queryParams = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, v.toString()])
      ),
      timestamp: timestamp.toString(),
    });

    const signature = this.createSignature(method, path, queryParams.toString());
    queryParams.append('signature', signature);

    const url = `${this.baseUrl}${path}?${queryParams.toString()}`;

    return this.fetch<T>(url, {
      method,
      headers: {
        'X-MBX-APIKEY': this.apiKey ?? '',
      },
    });
  }

  /**
   * Make public request
   */
  private async publicFetch<T>(
    path: string,
    params: Record<string, string | number> = {}
  ): Promise<FinanceProviderResult<T>> {
    const queryParams = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, v.toString()])
      )
    );

    const queryString = queryParams.toString();
    const url = queryString
      ? `${this.baseUrl}${path}?${queryString}`
      : `${this.baseUrl}${path}`;

    return this.fetch<T>(url);
  }

  /**
   * Load and cache available trading symbols
   */
  private async loadSymbols(): Promise<void> {
    const result = await this.publicFetch<BinanceExchangeInfo>('/api/v3/exchangeInfo');

    if (result.success && result.data) {
      this.symbols.clear();
      for (const symbol of result.data.symbols) {
        if (symbol.status === 'TRADING') {
          this.symbols.set(symbol.symbol, symbol);
        }
      }
    }
  }

  /**
   * Convert standard symbol to Binance format
   */
  private toBinanceSymbol(symbol: string): string {
    // If already in Binance format (no separator)
    if (this.symbols.has(symbol)) {
      return symbol;
    }

    // Convert from "BTC-USD" to "BTCUSD"
    const normalized = symbol.replace('-', '').replace('/', '');
    if (this.symbols.has(normalized)) {
      return normalized;
    }

    // Try with USDT instead of USD
    const withUSDT = normalized.replace('USD', 'USDT');
    if (this.symbols.has(withUSDT)) {
      return withUSDT;
    }

    return normalized;
  }

  /**
   * Get available trading pairs
   */
  async getTradingPairs(): Promise<FinanceProviderResult<TradingPair[]>> {
    this.ensureInitialized();

    if (this.symbols.size === 0) {
      await this.loadSymbols();
    }

    const pairs: TradingPair[] = Array.from(this.symbols.values()).map(symbol => ({
      base: symbol.baseAsset,
      quote: symbol.quoteAsset,
      symbol: symbol.symbol,
    }));

    return {
      success: true,
      data: pairs,
      cached: true,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get market data for a trading pair
   */
  async getMarketData(symbol: string): Promise<FinanceProviderResult<MarketData>> {
    const binanceSymbol = this.toBinanceSymbol(symbol);
    const result = await this.publicFetch<BinanceTicker24h>('/api/v3/ticker/24hr', {
      symbol: binanceSymbol,
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const ticker = result.data;
    const symbolInfo = this.symbols.get(binanceSymbol);

    const marketData: MarketData = {
      exchangeId: 'binance',
      pair: {
        base: symbolInfo?.baseAsset ?? symbol.split('-')[0],
        quote: symbolInfo?.quoteAsset ?? symbol.split('-')[1],
        symbol: binanceSymbol,
      },
      bid: parseFloat(ticker.bidPrice),
      ask: parseFloat(ticker.askPrice),
      last: parseFloat(ticker.lastPrice),
      volume24h: parseFloat(ticker.volume),
      high24h: parseFloat(ticker.highPrice),
      low24h: parseFloat(ticker.lowPrice),
      change24h: parseFloat(ticker.priceChange),
      changePercent24h: parseFloat(ticker.priceChangePercent),
      timestamp: ticker.closeTime,
    };

    return {
      success: true,
      data: marketData,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get OHLCV candles
   */
  async getOHLCV(
    symbol: string,
    interval: OHLCVInterval,
    limit: number = 100
  ): Promise<FinanceProviderResult<OHLCV[]>> {
    const binanceSymbol = this.toBinanceSymbol(symbol);

    // Map to Binance interval format
    const intervalMap: Record<OHLCVInterval, string> = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '30m': '30m',
      '1h': '1h',
      '4h': '4h',
      '1d': '1d',
      '1w': '1w',
      '1M': '1M',
    };

    const binanceInterval = intervalMap[interval];
    if (!binanceInterval) {
      return {
        success: false,
        error: `Unsupported interval: ${interval}`,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const result = await this.publicFetch<BinanceKline[]>('/api/v3/klines', {
      symbol: binanceSymbol,
      interval: binanceInterval,
      limit,
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const candles: OHLCV[] = result.data.map(
      (kline): OHLCV => ({
        timestamp: kline[0],
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
      })
    );

    return {
      success: true,
      data: candles,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get order book
   */
  async getOrderBook(
    symbol: string,
    depth: number = 50
  ): Promise<FinanceProviderResult<OrderBook>> {
    const binanceSymbol = this.toBinanceSymbol(symbol);

    // Binance limit options: 5, 10, 20, 50, 100, 500, 1000, 5000
    const validLimits = [5, 10, 20, 50, 100, 500, 1000, 5000];
    const binanceLimit = validLimits.find(l => l >= depth) ?? 100;

    const result = await this.publicFetch<BinanceOrderBookResponse>('/api/v3/depth', {
      symbol: binanceSymbol,
      limit: binanceLimit,
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const symbolInfo = this.symbols.get(binanceSymbol);

    const orderBook: OrderBook = {
      exchangeId: 'binance',
      pair: {
        base: symbolInfo?.baseAsset ?? symbol.split('-')[0],
        quote: symbolInfo?.quoteAsset ?? symbol.split('-')[1],
        symbol: binanceSymbol,
      },
      bids: result.data.bids.slice(0, depth).map(([price, quantity]) => ({
        price: parseFloat(price),
        quantity: parseFloat(quantity),
      })),
      asks: result.data.asks.slice(0, depth).map(([price, quantity]) => ({
        price: parseFloat(price),
        quantity: parseFloat(quantity),
      })),
      timestamp: Date.now(),
    };

    return {
      success: true,
      data: orderBook,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get account balances
   */
  async getBalances(): Promise<FinanceProviderResult<ExchangeAccount>> {
    const result = await this.authenticatedFetch<BinanceAccountInfo>('GET', '/api/v3/account');

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const balances: ExchangeBalance[] = result.data.balances
      .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map(b => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
        total: parseFloat(b.free) + parseFloat(b.locked),
      }));

    // Get USDT balance for approximate total value
    const usdtBalance = balances.find(b => b.asset === 'USDT');
    const usdBalance = balances.find(b => b.asset === 'USD');
    const totalUsdValue = (usdtBalance?.total ?? 0) + (usdBalance?.total ?? 0);

    const account: ExchangeAccount = {
      exchangeId: 'binance',
      balances,
      totalUsdValue,
      lastUpdated: result.data.updateTime,
    };

    return {
      success: true,
      data: account,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Place an order
   */
  async placeOrder(trade: Partial<Trade>): Promise<FinanceProviderResult<{ orderId: string; status: string }>> {
    if (!trade.pair?.symbol || !trade.side || !trade.type || !trade.quantity) {
      return {
        success: false,
        error: 'Missing required trade parameters',
        errorCode: FINANCE_ERROR_CODES.ORDER_REJECTED,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const binanceSymbol = this.toBinanceSymbol(trade.pair.symbol);

    // Map order type
    const typeMap: Record<string, BinanceOrderRequest['type']> = {
      market: 'MARKET',
      limit: 'LIMIT',
      'stop-loss': 'STOP_LOSS',
      'stop-limit': 'STOP_LOSS_LIMIT',
      'take-profit': 'TAKE_PROFIT',
    };

    const params: Record<string, string | number> = {
      symbol: binanceSymbol,
      side: trade.side.toUpperCase(),
      type: typeMap[trade.type] ?? 'MARKET',
      quantity: trade.quantity.toString(),
      newOrderRespType: 'RESULT',
    };

    if (trade.type === 'limit' && trade.price) {
      params.price = trade.price.toString();
      params.timeInForce = trade.timeInForce ?? 'GTC';
    }

    if (trade.stopPrice) {
      params.stopPrice = trade.stopPrice.toString();
    }

    const result = await this.authenticatedFetch<BinanceOrderResponse>('POST', '/api/v3/order', params);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode ?? FINANCE_ERROR_CODES.ORDER_FAILED,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    return {
      success: true,
      data: {
        orderId: result.data.orderId.toString(),
        status: result.data.status.toLowerCase(),
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Cancel an order
   */
  async cancelOrder(symbol: string, orderId: string): Promise<FinanceProviderResult<boolean>> {
    const binanceSymbol = this.toBinanceSymbol(symbol);

    const result = await this.authenticatedFetch<BinanceOrderResponse>(
      'DELETE',
      '/api/v3/order',
      {
        symbol: binanceSymbol,
        orderId: parseInt(orderId, 10),
      }
    );

    return {
      success: result.success,
      data: result.success,
      error: result.error,
      errorCode: result.errorCode,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get order status
   */
  async getOrder(symbol: string, orderId: string): Promise<FinanceProviderResult<BinanceOrderResponse>> {
    const binanceSymbol = this.toBinanceSymbol(symbol);

    return this.authenticatedFetch<BinanceOrderResponse>('GET', '/api/v3/order', {
      symbol: binanceSymbol,
      orderId: parseInt(orderId, 10),
    });
  }

  /**
   * Get open orders
   */
  async getOpenOrders(symbol?: string): Promise<FinanceProviderResult<BinanceOrderResponse[]>> {
    const params: Record<string, string | number> = {};

    if (symbol) {
      params.symbol = this.toBinanceSymbol(symbol);
    }

    return this.authenticatedFetch<BinanceOrderResponse[]>('GET', '/api/v3/openOrders', params);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createBinanceProvider(
  config: BinanceProviderConfig,
  allowedDomains?: string[]
): BinanceProvider {
  return new BinanceProvider(config, allowedDomains);
}
