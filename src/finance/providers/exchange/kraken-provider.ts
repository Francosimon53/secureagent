/**
 * Kraken Exchange Provider
 *
 * Provides integration with Kraken API for trading operations.
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

export interface KrakenProviderConfig extends FinanceProviderConfig {
  // Kraken-specific config options
}

interface KrakenAssetPair {
  altname: string;
  wsname: string;
  base: string;
  quote: string;
  pair_decimals: number;
  lot_decimals: number;
  lot_multiplier: number;
  ordermin: string;
  status: string;
}

interface KrakenTicker {
  a: [string, string, string]; // ask [price, whole lot volume, lot volume]
  b: [string, string, string]; // bid
  c: [string, string]; // last trade closed [price, lot volume]
  v: [string, string]; // volume [today, last 24 hours]
  p: [string, string]; // vwap
  t: [number, number]; // trades
  l: [string, string]; // low
  h: [string, string]; // high
  o: string; // opening price
}

interface KrakenOHLC {
  0: number; // time
  1: string; // open
  2: string; // high
  3: string; // low
  4: string; // close
  5: string; // vwap
  6: string; // volume
  7: number; // count
}

interface KrakenOrderBook {
  asks: Array<[string, string, number]>; // [price, volume, timestamp]
  bids: Array<[string, string, number]>;
}

interface KrakenBalance {
  [asset: string]: string;
}

interface KrakenOrderResponse {
  descr: { order: string };
  txid: string[];
}

interface KrakenOrderInfo {
  refid: string | null;
  userref: number | null;
  status: string;
  opentm: number;
  starttm: number;
  expiretm: number;
  descr: {
    pair: string;
    type: string;
    ordertype: string;
    price: string;
    price2: string;
    leverage: string;
    order: string;
    close: string;
  };
  vol: string;
  vol_exec: string;
  cost: string;
  fee: string;
  price: string;
  stopprice: string;
  limitprice: string;
  misc: string;
  oflags: string;
}

interface KrakenResponse<T> {
  error: string[];
  result: T;
}

// =============================================================================
// Provider Implementation
// =============================================================================

export class KrakenProvider extends BaseFinanceProvider<KrakenProviderConfig> {
  private readonly baseUrl = EXCHANGE_API_URLS.kraken.rest;
  private assetPairs: Map<string, KrakenAssetPair> = new Map();
  private assetMap: Map<string, string> = new Map(); // Maps Kraken asset codes to standard

  constructor(config: KrakenProviderConfig, allowedDomains?: string[]) {
    super(config, allowedDomains ?? ['api.kraken.com']);
  }

  get name(): string {
    return 'kraken';
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
    await this.loadAssetPairs();
  }

  /**
   * Create signature for authenticated requests
   */
  protected createSignature(
    _method: string,
    path: string,
    body?: string,
    nonce?: number
  ): string {
    if (!this.apiSecret) {
      throw new FinanceProviderError(
        this.name,
        FINANCE_ERROR_CODES.PROVIDER_AUTH_FAILED,
        'API secret not configured'
      );
    }

    const urlPath = path.replace(this.baseUrl, '');
    const postData = body ?? '';
    const nonceValue = nonce ?? Date.now() * 1000;

    // Create SHA256 hash of nonce + POST data
    const sha256Hash = createHmac('sha256', '')
      .update(nonceValue.toString() + postData)
      .digest();

    // Create HMAC-SHA512 signature
    const secretKey = Buffer.from(this.apiSecret, 'base64');
    const message = Buffer.concat([Buffer.from(urlPath), sha256Hash]);
    return createHmac('sha512', secretKey).update(message).digest('base64');
  }

  /**
   * Make authenticated POST request
   */
  private async authenticatedPost<T>(
    path: string,
    data: Record<string, string | number> = {}
  ): Promise<FinanceProviderResult<T>> {
    this.ensureInitialized();

    const nonce = Date.now() * 1000;
    const postData = new URLSearchParams({ ...data, nonce: nonce.toString() }).toString();
    const signature = this.createSignature('POST', path, postData, nonce);

    const result = await this.fetch<KrakenResponse<T>>(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'API-Key': this.apiKey ?? '',
        'API-Sign': signature,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: postData,
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

    if (result.data.error && result.data.error.length > 0) {
      return {
        success: false,
        error: result.data.error.join(', '),
        errorCode: FINANCE_ERROR_CODES.PROVIDER_ERROR,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    return {
      success: true,
      data: result.data.result,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Make public request
   */
  private async publicFetch<T>(path: string): Promise<FinanceProviderResult<T>> {
    const result = await this.fetch<KrakenResponse<T>>(`${this.baseUrl}${path}`);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    if (result.data.error && result.data.error.length > 0) {
      return {
        success: false,
        error: result.data.error.join(', '),
        errorCode: FINANCE_ERROR_CODES.PROVIDER_ERROR,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    return {
      success: true,
      data: result.data.result,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Load and cache available trading pairs
   */
  private async loadAssetPairs(): Promise<void> {
    const result = await this.publicFetch<Record<string, KrakenAssetPair>>('/0/public/AssetPairs');

    if (result.success && result.data) {
      this.assetPairs.clear();
      for (const [key, pair] of Object.entries(result.data)) {
        if (pair.status === 'online') {
          this.assetPairs.set(key, pair);
          // Also map by wsname for easier lookup
          this.assetPairs.set(pair.wsname, pair);
        }
      }
    }

    // Build asset mapping (Kraken uses different symbols like XXBT for BTC)
    this.assetMap.set('XXBT', 'BTC');
    this.assetMap.set('XBT', 'BTC');
    this.assetMap.set('XETH', 'ETH');
    this.assetMap.set('ZUSD', 'USD');
    this.assetMap.set('ZEUR', 'EUR');
    this.assetMap.set('ZGBP', 'GBP');
    this.assetMap.set('ZJPY', 'JPY');
    this.assetMap.set('XXRP', 'XRP');
    this.assetMap.set('XLTC', 'LTC');
  }

  /**
   * Normalize Kraken asset symbol to standard
   */
  private normalizeAsset(krakenAsset: string): string {
    return this.assetMap.get(krakenAsset) ?? krakenAsset;
  }

  /**
   * Convert standard symbol to Kraken pair format
   */
  private toKrakenPair(symbol: string): string {
    // Try common formats
    if (this.assetPairs.has(symbol)) {
      return symbol;
    }

    // Try with X prefix for crypto
    const [base, quote] = symbol.split('-');
    const krakenBase = base === 'BTC' ? 'XBT' : base;
    const krakenQuote = quote === 'USD' ? 'USD' : quote;

    const variations = [
      `${krakenBase}${krakenQuote}`,
      `X${krakenBase}Z${krakenQuote}`,
      `${base}${quote}`,
    ];

    for (const variation of variations) {
      if (this.assetPairs.has(variation)) {
        return variation;
      }
    }

    return symbol;
  }

  /**
   * Get available trading pairs
   */
  async getTradingPairs(): Promise<FinanceProviderResult<TradingPair[]>> {
    this.ensureInitialized();

    if (this.assetPairs.size === 0) {
      await this.loadAssetPairs();
    }

    const seen = new Set<string>();
    const pairs: TradingPair[] = [];

    for (const [, pair] of this.assetPairs) {
      if (!seen.has(pair.altname)) {
        seen.add(pair.altname);
        pairs.push({
          base: this.normalizeAsset(pair.base),
          quote: this.normalizeAsset(pair.quote),
          symbol: pair.altname,
        });
      }
    }

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
    const krakenPair = this.toKrakenPair(symbol);
    const result = await this.publicFetch<Record<string, KrakenTicker>>(
      `/0/public/Ticker?pair=${krakenPair}`
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

    const tickerData = Object.values(result.data)[0];
    if (!tickerData) {
      return {
        success: false,
        error: `No ticker data for ${symbol}`,
        errorCode: FINANCE_ERROR_CODES.TRADING_PAIR_NOT_FOUND,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const pair = this.assetPairs.get(krakenPair);
    const last = parseFloat(tickerData.c[0]);
    const open = parseFloat(tickerData.o);
    const change24h = last - open;
    const changePercent24h = open > 0 ? (change24h / open) * 100 : 0;

    const marketData: MarketData = {
      exchangeId: 'kraken',
      pair: {
        base: pair ? this.normalizeAsset(pair.base) : symbol.split('-')[0],
        quote: pair ? this.normalizeAsset(pair.quote) : symbol.split('-')[1],
        symbol,
      },
      bid: parseFloat(tickerData.b[0]),
      ask: parseFloat(tickerData.a[0]),
      last,
      volume24h: parseFloat(tickerData.v[1]),
      high24h: parseFloat(tickerData.h[1]),
      low24h: parseFloat(tickerData.l[1]),
      change24h,
      changePercent24h,
      timestamp: Date.now(),
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
    // Map interval to Kraken interval (minutes)
    const intervalMap: Record<OHLCVInterval, number> = {
      '1m': 1,
      '5m': 5,
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '4h': 240,
      '1d': 1440,
      '1w': 10080,
      '1M': 21600,
    };

    const krakenInterval = intervalMap[interval];
    if (!krakenInterval) {
      return {
        success: false,
        error: `Unsupported interval: ${interval}`,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const krakenPair = this.toKrakenPair(symbol);
    const result = await this.publicFetch<{ [key: string]: KrakenOHLC[] | number }>(
      `/0/public/OHLC?pair=${krakenPair}&interval=${krakenInterval}`
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

    // Find the OHLC data (key is the pair name, exclude 'last')
    const ohlcKey = Object.keys(result.data).find(k => k !== 'last');
    if (!ohlcKey) {
      return {
        success: false,
        error: 'No OHLC data found',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const rawCandles = result.data[ohlcKey] as unknown as KrakenOHLC[];
    const candles = rawCandles.slice(-limit).map(
      (candle): OHLCV => ({
        timestamp: candle[0] * 1000,
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[6]),
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
    const krakenPair = this.toKrakenPair(symbol);
    const result = await this.publicFetch<Record<string, KrakenOrderBook>>(
      `/0/public/Depth?pair=${krakenPair}&count=${depth}`
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

    const bookData = Object.values(result.data)[0];
    if (!bookData) {
      return {
        success: false,
        error: 'No order book data',
        errorCode: FINANCE_ERROR_CODES.TRADING_PAIR_NOT_FOUND,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const pair = this.assetPairs.get(krakenPair);

    const orderBook: OrderBook = {
      exchangeId: 'kraken',
      pair: {
        base: pair ? this.normalizeAsset(pair.base) : symbol.split('-')[0],
        quote: pair ? this.normalizeAsset(pair.quote) : symbol.split('-')[1],
        symbol,
      },
      bids: bookData.bids.map(([price, quantity]) => ({
        price: parseFloat(price),
        quantity: parseFloat(quantity),
      })),
      asks: bookData.asks.map(([price, quantity]) => ({
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
    const result = await this.authenticatedPost<KrakenBalance>('/0/private/Balance');

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const balances: ExchangeBalance[] = Object.entries(result.data)
      .filter(([, balance]) => parseFloat(balance) > 0)
      .map(([asset, balance]) => ({
        asset: this.normalizeAsset(asset),
        free: parseFloat(balance),
        locked: 0, // Kraken doesn't provide locked in balance endpoint
        total: parseFloat(balance),
      }));

    const account: ExchangeAccount = {
      exchangeId: 'kraken',
      balances,
      totalUsdValue: 0, // Would need price lookup
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

    const krakenPair = this.toKrakenPair(trade.pair.symbol);
    const orderData: Record<string, string | number> = {
      pair: krakenPair,
      type: trade.side,
      ordertype: trade.type === 'market' ? 'market' : trade.type === 'limit' ? 'limit' : 'stop-loss',
      volume: trade.quantity.toString(),
    };

    if (trade.type === 'limit' && trade.price) {
      orderData.price = trade.price.toString();
    }

    if (trade.stopPrice) {
      orderData.price = trade.stopPrice.toString();
    }

    const result = await this.authenticatedPost<KrakenOrderResponse>(
      '/0/private/AddOrder',
      orderData
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
        orderId: result.data.txid[0],
        status: 'pending',
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<FinanceProviderResult<boolean>> {
    const result = await this.authenticatedPost<{ count: number }>(
      '/0/private/CancelOrder',
      { txid: orderId }
    );

    return {
      success: result.success && (result.data?.count ?? 0) > 0,
      data: result.success && (result.data?.count ?? 0) > 0,
      error: result.error,
      errorCode: result.errorCode,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get order status
   */
  async getOrder(orderId: string): Promise<FinanceProviderResult<KrakenOrderInfo>> {
    const result = await this.authenticatedPost<Record<string, KrakenOrderInfo>>(
      '/0/private/QueryOrders',
      { txid: orderId }
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

    const orderInfo = result.data[orderId];
    if (!orderInfo) {
      return {
        success: false,
        error: 'Order not found',
        errorCode: FINANCE_ERROR_CODES.TRADE_NOT_FOUND,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    return {
      success: true,
      data: orderInfo,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get open orders
   */
  async getOpenOrders(): Promise<FinanceProviderResult<Record<string, KrakenOrderInfo>>> {
    return this.authenticatedPost<Record<string, KrakenOrderInfo>>('/0/private/OpenOrders');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createKrakenProvider(
  config: KrakenProviderConfig,
  allowedDomains?: string[]
): KrakenProvider {
  return new KrakenProvider(config, allowedDomains);
}
