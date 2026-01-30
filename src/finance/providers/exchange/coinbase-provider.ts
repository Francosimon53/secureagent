/**
 * Coinbase Exchange Provider
 *
 * Provides integration with Coinbase Pro/Exchange API for trading operations.
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

export interface CoinbaseProviderConfig extends FinanceProviderConfig {
  passphraseEnvVar?: string;
  sandbox?: boolean;
}

interface CoinbaseProduct {
  id: string;
  base_currency: string;
  quote_currency: string;
  base_min_size: string;
  base_max_size: string;
  quote_increment: string;
  base_increment: string;
  display_name: string;
  status: string;
  trading_disabled: boolean;
}

interface CoinbaseTicker {
  trade_id: number;
  price: string;
  size: string;
  bid: string;
  ask: string;
  volume: string;
  time: string;
}

interface CoinbaseStats {
  open: string;
  high: string;
  low: string;
  volume: string;
  last: string;
  volume_30day: string;
}

interface CoinbaseCandle {
  0: number; // timestamp
  1: number; // low
  2: number; // high
  3: number; // open
  4: number; // close
  5: number; // volume
}

interface CoinbaseOrderBookResponse {
  sequence: number;
  bids: Array<[string, string, number]>; // [price, size, num_orders]
  asks: Array<[string, string, number]>;
}

interface CoinbaseAccount {
  id: string;
  currency: string;
  balance: string;
  available: string;
  hold: string;
  profile_id: string;
  trading_enabled: boolean;
}

interface CoinbaseOrderRequest {
  product_id: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  price?: string;
  size?: string;
  funds?: string;
  stop_price?: string;
  time_in_force?: 'GTC' | 'IOC' | 'FOK' | 'GTT';
  post_only?: boolean;
  client_oid?: string;
}

interface CoinbaseOrderResponse {
  id: string;
  product_id: string;
  side: string;
  type: string;
  created_at: string;
  done_at?: string;
  done_reason?: string;
  fill_fees: string;
  filled_size: string;
  executed_value: string;
  status: string;
  settled: boolean;
  size?: string;
  price?: string;
  stop_price?: string;
  time_in_force: string;
}

// =============================================================================
// Provider Implementation
// =============================================================================

export class CoinbaseProvider extends BaseFinanceProvider<CoinbaseProviderConfig> {
  private readonly passphrase: string | undefined;
  private readonly baseUrl: string;
  private products: Map<string, CoinbaseProduct> = new Map();

  constructor(config: CoinbaseProviderConfig, allowedDomains?: string[]) {
    super(config, allowedDomains ?? ['api.exchange.coinbase.com', 'api-public.sandbox.exchange.coinbase.com']);
    this.passphrase = config.passphraseEnvVar ? process.env[config.passphraseEnvVar] : undefined;
    this.baseUrl = config.sandbox
      ? EXCHANGE_API_URLS.coinbase.sandbox
      : EXCHANGE_API_URLS.coinbase.rest;
  }

  get name(): string {
    return 'coinbase';
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
    // Fetch and cache products
    await this.loadProducts();
  }

  /**
   * Create signature for authenticated requests
   */
  protected createSignature(
    method: string,
    path: string,
    body?: string,
    timestamp?: number
  ): string {
    if (!this.apiSecret) {
      throw new FinanceProviderError(
        this.name,
        FINANCE_ERROR_CODES.PROVIDER_AUTH_FAILED,
        'API secret not configured'
      );
    }

    const ts = timestamp ?? Math.floor(Date.now() / 1000);
    const message = `${ts}${method.toUpperCase()}${path}${body ?? ''}`;
    const key = Buffer.from(this.apiSecret, 'base64');
    return createHmac('sha256', key).update(message).digest('base64');
  }

  /**
   * Get authentication headers for requests
   */
  protected getAuthHeaders(
    method: string = 'GET',
    path: string = '',
    body?: string
  ): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.createSignature(method, path, body, timestamp);

    return {
      'CB-ACCESS-KEY': this.apiKey ?? '',
      'CB-ACCESS-SIGN': signature,
      'CB-ACCESS-TIMESTAMP': timestamp.toString(),
      'CB-ACCESS-PASSPHRASE': this.passphrase ?? '',
    };
  }

  /**
   * Make authenticated request
   */
  private async authenticatedFetch<T>(
    method: string,
    path: string,
    body?: object
  ): Promise<FinanceProviderResult<T>> {
    this.ensureInitialized();

    const bodyStr = body ? JSON.stringify(body) : undefined;
    const headers = this.getAuthHeaders(method, path, bodyStr);

    return this.fetch<T>(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: bodyStr,
    });
  }

  /**
   * Make public request (no auth required)
   */
  private async publicFetch<T>(path: string): Promise<FinanceProviderResult<T>> {
    return this.fetch<T>(`${this.baseUrl}${path}`);
  }

  /**
   * Load and cache available trading products
   */
  private async loadProducts(): Promise<void> {
    const result = await this.publicFetch<CoinbaseProduct[]>('/products');

    if (result.success && result.data) {
      this.products.clear();
      for (const product of result.data) {
        if (!product.trading_disabled && product.status === 'online') {
          this.products.set(product.id, product);
        }
      }
    }
  }

  /**
   * Get available trading pairs
   */
  async getTradingPairs(): Promise<FinanceProviderResult<TradingPair[]>> {
    this.ensureInitialized();

    if (this.products.size === 0) {
      await this.loadProducts();
    }

    const pairs: TradingPair[] = Array.from(this.products.values()).map(product => ({
      base: product.base_currency,
      quote: product.quote_currency,
      symbol: product.id,
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
    const [tickerResult, statsResult] = await Promise.all([
      this.publicFetch<CoinbaseTicker>(`/products/${symbol}/ticker`),
      this.publicFetch<CoinbaseStats>(`/products/${symbol}/stats`),
    ]);

    if (!tickerResult.success || !tickerResult.data) {
      return {
        success: false,
        error: tickerResult.error,
        errorCode: tickerResult.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const ticker = tickerResult.data;
    const stats = statsResult.data;

    const product = this.products.get(symbol);
    if (!product) {
      return {
        success: false,
        error: `Trading pair not found: ${symbol}`,
        errorCode: FINANCE_ERROR_CODES.TRADING_PAIR_NOT_FOUND,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const last = parseFloat(ticker.price);
    const open = stats ? parseFloat(stats.open) : last;
    const change24h = last - open;
    const changePercent24h = open > 0 ? (change24h / open) * 100 : 0;

    const marketData: MarketData = {
      exchangeId: 'coinbase',
      pair: {
        base: product.base_currency,
        quote: product.quote_currency,
        symbol,
      },
      bid: parseFloat(ticker.bid),
      ask: parseFloat(ticker.ask),
      last,
      volume24h: parseFloat(ticker.volume),
      high24h: stats ? parseFloat(stats.high) : last,
      low24h: stats ? parseFloat(stats.low) : last,
      change24h,
      changePercent24h,
      timestamp: new Date(ticker.time).getTime(),
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
    // Map interval to Coinbase granularity (seconds)
    const granularityMap: Record<OHLCVInterval, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '30m': 1800,
      '1h': 3600,
      '4h': 14400,
      '1d': 86400,
      '1w': 604800,
      '1M': 2592000,
    };

    const granularity = granularityMap[interval];
    if (!granularity) {
      return {
        success: false,
        error: `Unsupported interval: ${interval}`,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const result = await this.publicFetch<CoinbaseCandle[]>(
      `/products/${symbol}/candles?granularity=${granularity}`
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    // Coinbase returns most recent first, limit and reverse
    const candles = result.data.slice(0, limit).reverse().map(
      (candle): OHLCV => ({
        timestamp: candle[0] * 1000,
        open: candle[3],
        high: candle[2],
        low: candle[1],
        close: candle[4],
        volume: candle[5],
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
    const level = depth <= 50 ? 2 : 3;
    const result = await this.publicFetch<CoinbaseOrderBookResponse>(
      `/products/${symbol}/book?level=${level}`
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const product = this.products.get(symbol);
    if (!product) {
      return {
        success: false,
        error: `Trading pair not found: ${symbol}`,
        errorCode: FINANCE_ERROR_CODES.TRADING_PAIR_NOT_FOUND,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const orderBook: OrderBook = {
      exchangeId: 'coinbase',
      pair: {
        base: product.base_currency,
        quote: product.quote_currency,
        symbol,
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
    const result = await this.authenticatedFetch<CoinbaseAccount[]>('GET', '/accounts');

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const balances: ExchangeBalance[] = result.data
      .filter(account => parseFloat(account.balance) > 0)
      .map(account => ({
        asset: account.currency,
        free: parseFloat(account.available),
        locked: parseFloat(account.hold),
        total: parseFloat(account.balance),
      }));

    // Calculate total USD value (simplified - would need price lookup for non-USD)
    const usdBalance = balances.find(b => b.asset === 'USD');
    const totalUsdValue = usdBalance?.total ?? 0;

    const account: ExchangeAccount = {
      exchangeId: 'coinbase',
      balances,
      totalUsdValue,
      lastUpdated: Date.now(),
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

    // Map TimeInForce - Coinbase uses GTT instead of GTD
    const tif = trade.timeInForce ?? 'GTC';
    const coinbaseTif: 'GTC' | 'IOC' | 'FOK' | 'GTT' = tif === 'GTD' ? 'GTT' : tif as 'GTC' | 'IOC' | 'FOK';

    const orderRequest: CoinbaseOrderRequest = {
      product_id: trade.pair.symbol,
      side: trade.side,
      type: trade.type === 'market' ? 'market' : trade.type === 'limit' ? 'limit' : 'stop',
      size: trade.quantity.toString(),
      time_in_force: coinbaseTif,
    };

    if (trade.type === 'limit' && trade.price) {
      orderRequest.price = trade.price.toString();
    }

    if (trade.stopPrice) {
      orderRequest.stop_price = trade.stopPrice.toString();
    }

    const result = await this.authenticatedFetch<CoinbaseOrderResponse>(
      'POST',
      '/orders',
      orderRequest
    );

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
        orderId: result.data.id,
        status: result.data.status,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<FinanceProviderResult<boolean>> {
    const result = await this.authenticatedFetch<string[]>(
      'DELETE',
      `/orders/${orderId}`
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
  async getOrder(orderId: string): Promise<FinanceProviderResult<CoinbaseOrderResponse>> {
    return this.authenticatedFetch<CoinbaseOrderResponse>('GET', `/orders/${orderId}`);
  }

  /**
   * Get open orders
   */
  async getOpenOrders(symbol?: string): Promise<FinanceProviderResult<CoinbaseOrderResponse[]>> {
    const path = symbol ? `/orders?product_id=${symbol}&status=open` : '/orders?status=open';
    return this.authenticatedFetch<CoinbaseOrderResponse[]>('GET', path);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createCoinbaseProvider(
  config: CoinbaseProviderConfig,
  allowedDomains?: string[]
): CoinbaseProvider {
  return new CoinbaseProvider(config, allowedDomains);
}
