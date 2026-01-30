/**
 * Trade Store
 *
 * Persistence layer for trade records with interface, database, and in-memory implementations.
 */

import { randomUUID } from 'crypto';
import type {
  Trade,
  TradeStatus,
  TradeQueryOptions,
  ExchangeId,
  OrderSide,
  TradingPair,
  OrderType,
  TimeInForce,
} from '../types.js';

// =============================================================================
// Database Adapter Interface
// =============================================================================

export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

// =============================================================================
// Trade Store Interface
// =============================================================================

export interface TradeStore {
  initialize(): Promise<void>;

  // CRUD operations
  createTrade(trade: Omit<Trade, 'id' | 'createdAt' | 'updatedAt'>): Promise<Trade>;
  getTrade(tradeId: string): Promise<Trade | null>;
  updateTrade(tradeId: string, updates: Partial<Trade>): Promise<Trade | null>;
  deleteTrade(tradeId: string): Promise<boolean>;

  // Query operations
  listTrades(userId: string, options?: TradeQueryOptions): Promise<Trade[]>;
  countTrades(userId: string, options?: TradeQueryOptions): Promise<number>;

  // Specialized queries
  getOpenTrades(userId: string, exchangeId?: ExchangeId): Promise<Trade[]>;
  getTradesByStrategy(userId: string, strategyId: string): Promise<Trade[]>;
  getTradesBySignal(userId: string, signalId: string): Promise<Trade[]>;
  getTradesInDateRange(userId: string, from: number, to: number): Promise<Trade[]>;
  getRecentTrades(userId: string, limit: number): Promise<Trade[]>;

  // Statistics
  getTradeStats(
    userId: string,
    dateFrom?: number,
    dateTo?: number
  ): Promise<{
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnL: number;
    avgPnL: number;
    avgHoldingPeriodHours: number;
  }>;
}

// =============================================================================
// Database Row Types
// =============================================================================

interface TradeRow {
  id: string;
  user_id: string;
  exchange_id: string;
  exchange_order_id: string | null;
  pair_base: string;
  pair_quote: string;
  pair_symbol: string;
  side: string;
  type: string;
  quantity: number;
  price: number | null;
  stop_price: number | null;
  filled_quantity: number;
  average_filled_price: number | null;
  status: string;
  time_in_force: string;
  fees: number;
  fee_currency: string;
  strategy_id: string | null;
  signal_id: string | null;
  stop_loss_price: number | null;
  take_profit_price: number | null;
  notes: string | null;
  metadata: string | null;
  created_at: number;
  updated_at: number;
  filled_at: number | null;
  cancelled_at: number | null;
}

// =============================================================================
// Database Trade Store
// =============================================================================

export class DatabaseTradeStore implements TradeStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        exchange_id TEXT NOT NULL,
        exchange_order_id TEXT,
        pair_base TEXT NOT NULL,
        pair_quote TEXT NOT NULL,
        pair_symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        type TEXT NOT NULL,
        quantity REAL NOT NULL,
        price REAL,
        stop_price REAL,
        filled_quantity REAL DEFAULT 0,
        average_filled_price REAL,
        status TEXT NOT NULL DEFAULT 'pending',
        time_in_force TEXT NOT NULL DEFAULT 'GTC',
        fees REAL DEFAULT 0,
        fee_currency TEXT NOT NULL,
        strategy_id TEXT,
        signal_id TEXT,
        stop_loss_price REAL,
        take_profit_price REAL,
        notes TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        filled_at INTEGER,
        cancelled_at INTEGER
      )
    `);

    // Create indexes
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_trades_user_date ON trades(user_id, created_at)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_trades_user_status ON trades(user_id, status)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_trades_user_exchange ON trades(user_id, exchange_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(user_id, strategy_id)
    `);
  }

  async createTrade(trade: Omit<Trade, 'id' | 'createdAt' | 'updatedAt'>): Promise<Trade> {
    const now = Date.now();
    const id = randomUUID();

    const item: Trade = {
      ...trade,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO trades (
        id, user_id, exchange_id, exchange_order_id,
        pair_base, pair_quote, pair_symbol,
        side, type, quantity, price, stop_price,
        filled_quantity, average_filled_price, status, time_in_force,
        fees, fee_currency, strategy_id, signal_id,
        stop_loss_price, take_profit_price, notes, metadata,
        created_at, updated_at, filled_at, cancelled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.exchangeId,
        item.exchangeOrderId ?? null,
        item.pair.base,
        item.pair.quote,
        item.pair.symbol,
        item.side,
        item.type,
        item.quantity,
        item.price ?? null,
        item.stopPrice ?? null,
        item.filledQuantity,
        item.averageFilledPrice ?? null,
        item.status,
        item.timeInForce,
        item.fees,
        item.feeCurrency,
        item.strategyId ?? null,
        item.signalId ?? null,
        item.stopLossPrice ?? null,
        item.takeProfitPrice ?? null,
        item.notes ?? null,
        item.metadata ? JSON.stringify(item.metadata) : null,
        item.createdAt,
        item.updatedAt,
        item.filledAt ?? null,
        item.cancelledAt ?? null,
      ]
    );

    return item;
  }

  async getTrade(tradeId: string): Promise<Trade | null> {
    const result = await this.db.query<TradeRow>(
      'SELECT * FROM trades WHERE id = ?',
      [tradeId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToTrade(result.rows[0]);
  }

  async updateTrade(tradeId: string, updates: Partial<Trade>): Promise<Trade | null> {
    const existing = await this.getTrade(tradeId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const params: unknown[] = [now];

    if (updates.exchangeOrderId !== undefined) {
      setClauses.push('exchange_order_id = ?');
      params.push(updates.exchangeOrderId);
    }
    if (updates.filledQuantity !== undefined) {
      setClauses.push('filled_quantity = ?');
      params.push(updates.filledQuantity);
    }
    if (updates.averageFilledPrice !== undefined) {
      setClauses.push('average_filled_price = ?');
      params.push(updates.averageFilledPrice);
    }
    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      params.push(updates.status);
    }
    if (updates.fees !== undefined) {
      setClauses.push('fees = ?');
      params.push(updates.fees);
    }
    if (updates.stopLossPrice !== undefined) {
      setClauses.push('stop_loss_price = ?');
      params.push(updates.stopLossPrice);
    }
    if (updates.takeProfitPrice !== undefined) {
      setClauses.push('take_profit_price = ?');
      params.push(updates.takeProfitPrice);
    }
    if (updates.notes !== undefined) {
      setClauses.push('notes = ?');
      params.push(updates.notes);
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?');
      params.push(JSON.stringify(updates.metadata));
    }
    if (updates.filledAt !== undefined) {
      setClauses.push('filled_at = ?');
      params.push(updates.filledAt);
    }
    if (updates.cancelledAt !== undefined) {
      setClauses.push('cancelled_at = ?');
      params.push(updates.cancelledAt);
    }

    params.push(tradeId);

    await this.db.execute(
      `UPDATE trades SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    return this.getTrade(tradeId);
  }

  async deleteTrade(tradeId: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM trades WHERE id = ?', [tradeId]);
    return result.changes > 0;
  }

  async listTrades(userId: string, options: TradeQueryOptions = {}): Promise<Trade[]> {
    const { sql, params } = this.buildTradeQuerySQL(userId, options);
    const result = await this.db.query<TradeRow>(sql, params);
    return result.rows.map(row => this.rowToTrade(row));
  }

  async countTrades(userId: string, options: TradeQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildTradeQuerySQL(userId, options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async getOpenTrades(userId: string, exchangeId?: ExchangeId): Promise<Trade[]> {
    const conditions: string[] = ['user_id = ?', "status IN ('pending', 'open', 'partial')"];
    const params: unknown[] = [userId];

    if (exchangeId) {
      conditions.push('exchange_id = ?');
      params.push(exchangeId);
    }

    const result = await this.db.query<TradeRow>(
      `SELECT * FROM trades WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );

    return result.rows.map(row => this.rowToTrade(row));
  }

  async getTradesByStrategy(userId: string, strategyId: string): Promise<Trade[]> {
    const result = await this.db.query<TradeRow>(
      'SELECT * FROM trades WHERE user_id = ? AND strategy_id = ? ORDER BY created_at DESC',
      [userId, strategyId]
    );
    return result.rows.map(row => this.rowToTrade(row));
  }

  async getTradesBySignal(userId: string, signalId: string): Promise<Trade[]> {
    const result = await this.db.query<TradeRow>(
      'SELECT * FROM trades WHERE user_id = ? AND signal_id = ? ORDER BY created_at DESC',
      [userId, signalId]
    );
    return result.rows.map(row => this.rowToTrade(row));
  }

  async getTradesInDateRange(userId: string, from: number, to: number): Promise<Trade[]> {
    const result = await this.db.query<TradeRow>(
      'SELECT * FROM trades WHERE user_id = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at DESC',
      [userId, from, to]
    );
    return result.rows.map(row => this.rowToTrade(row));
  }

  async getRecentTrades(userId: string, limit: number): Promise<Trade[]> {
    const result = await this.db.query<TradeRow>(
      'SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [userId, limit]
    );
    return result.rows.map(row => this.rowToTrade(row));
  }

  async getTradeStats(
    userId: string,
    dateFrom?: number,
    dateTo?: number
  ): Promise<{
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnL: number;
    avgPnL: number;
    avgHoldingPeriodHours: number;
  }> {
    const conditions: string[] = ['user_id = ?', "status = 'filled'"];
    const params: unknown[] = [userId];

    if (dateFrom) {
      conditions.push('filled_at >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('filled_at <= ?');
      params.push(dateTo);
    }

    const result = await this.db.query<TradeRow>(
      `SELECT * FROM trades WHERE ${conditions.join(' AND ')}`,
      params
    );

    const trades = result.rows.map(row => this.rowToTrade(row));

    if (trades.length === 0) {
      return {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnL: 0,
        avgPnL: 0,
        avgHoldingPeriodHours: 0,
      };
    }

    let totalPnL = 0;
    let wins = 0;
    let losses = 0;
    let totalHoldingHours = 0;

    for (const trade of trades) {
      // Calculate P&L (simplified - actual calculation would need entry/exit prices)
      const pnl = trade.side === 'buy'
        ? ((trade.averageFilledPrice ?? 0) - (trade.price ?? 0)) * trade.filledQuantity
        : ((trade.price ?? 0) - (trade.averageFilledPrice ?? 0)) * trade.filledQuantity;

      totalPnL += pnl - trade.fees;

      if (pnl > 0) {
        wins++;
      } else if (pnl < 0) {
        losses++;
      }

      if (trade.filledAt) {
        totalHoldingHours += (trade.filledAt - trade.createdAt) / (1000 * 60 * 60);
      }
    }

    return {
      totalTrades: trades.length,
      wins,
      losses,
      winRate: trades.length > 0 ? wins / trades.length : 0,
      totalPnL,
      avgPnL: trades.length > 0 ? totalPnL / trades.length : 0,
      avgHoldingPeriodHours: trades.length > 0 ? totalHoldingHours / trades.length : 0,
    };
  }

  private buildTradeQuerySQL(
    userId: string,
    options: TradeQueryOptions,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (options.exchangeId) {
      conditions.push('exchange_id = ?');
      params.push(options.exchangeId);
    }

    if (options.status && options.status.length > 0) {
      const placeholders = options.status.map(() => '?').join(',');
      conditions.push(`status IN (${placeholders})`);
      params.push(...options.status);
    }

    if (options.side) {
      conditions.push('side = ?');
      params.push(options.side);
    }

    if (options.pair) {
      conditions.push('pair_symbol = ?');
      params.push(options.pair);
    }

    if (options.dateFrom) {
      conditions.push('created_at >= ?');
      params.push(options.dateFrom);
    }

    if (options.dateTo) {
      conditions.push('created_at <= ?');
      params.push(options.dateTo);
    }

    if (options.strategyId) {
      conditions.push('strategy_id = ?');
      params.push(options.strategyId);
    }

    const whereClause = conditions.join(' AND ');

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM trades WHERE ${whereClause}`,
        params,
      };
    }

    const sortColumn = options.sortBy ?? 'created_at';
    const sortOrder = options.sortOrder ?? 'desc';
    let sql = `SELECT * FROM trades WHERE ${whereClause} ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}`;

    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (options.offset) {
      sql += ` OFFSET ${options.offset}`;
    }

    return { sql, params };
  }

  private rowToTrade(row: TradeRow): Trade {
    const pair: TradingPair = {
      base: row.pair_base,
      quote: row.pair_quote,
      symbol: row.pair_symbol,
    };

    return {
      id: row.id,
      userId: row.user_id,
      exchangeId: row.exchange_id as ExchangeId,
      exchangeOrderId: row.exchange_order_id ?? undefined,
      pair,
      side: row.side as OrderSide,
      type: row.type as OrderType,
      quantity: row.quantity,
      price: row.price ?? undefined,
      stopPrice: row.stop_price ?? undefined,
      filledQuantity: row.filled_quantity,
      averageFilledPrice: row.average_filled_price ?? undefined,
      status: row.status as TradeStatus,
      timeInForce: row.time_in_force as TimeInForce,
      fees: row.fees,
      feeCurrency: row.fee_currency,
      strategyId: row.strategy_id ?? undefined,
      signalId: row.signal_id ?? undefined,
      stopLossPrice: row.stop_loss_price ?? undefined,
      takeProfitPrice: row.take_profit_price ?? undefined,
      notes: row.notes ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      filledAt: row.filled_at ?? undefined,
      cancelledAt: row.cancelled_at ?? undefined,
    };
  }
}

// =============================================================================
// In-Memory Trade Store
// =============================================================================

export class InMemoryTradeStore implements TradeStore {
  private trades = new Map<string, Trade>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async createTrade(trade: Omit<Trade, 'id' | 'createdAt' | 'updatedAt'>): Promise<Trade> {
    const now = Date.now();
    const item: Trade = {
      ...trade,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.trades.set(item.id, item);
    return item;
  }

  async getTrade(tradeId: string): Promise<Trade | null> {
    return this.trades.get(tradeId) ?? null;
  }

  async updateTrade(tradeId: string, updates: Partial<Trade>): Promise<Trade | null> {
    const existing = this.trades.get(tradeId);
    if (!existing) {
      return null;
    }

    const updated: Trade = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    this.trades.set(tradeId, updated);
    return updated;
  }

  async deleteTrade(tradeId: string): Promise<boolean> {
    return this.trades.delete(tradeId);
  }

  async listTrades(userId: string, options: TradeQueryOptions = {}): Promise<Trade[]> {
    let items = Array.from(this.trades.values()).filter(t => t.userId === userId);

    if (options.exchangeId) {
      items = items.filter(t => t.exchangeId === options.exchangeId);
    }
    if (options.status && options.status.length > 0) {
      items = items.filter(t => options.status!.includes(t.status));
    }
    if (options.side) {
      items = items.filter(t => t.side === options.side);
    }
    if (options.pair) {
      items = items.filter(t => t.pair.symbol === options.pair);
    }
    if (options.dateFrom) {
      items = items.filter(t => t.createdAt >= options.dateFrom!);
    }
    if (options.dateTo) {
      items = items.filter(t => t.createdAt <= options.dateTo!);
    }
    if (options.strategyId) {
      items = items.filter(t => t.strategyId === options.strategyId);
    }

    // Sort
    const sortBy = options.sortBy ?? 'createdAt';
    const sortOrder = options.sortOrder ?? 'desc';
    items.sort((a, b) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      return sortOrder === 'desc' ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
    });

    if (options.offset) {
      items = items.slice(options.offset);
    }
    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  async countTrades(userId: string, options: TradeQueryOptions = {}): Promise<number> {
    const trades = await this.listTrades(userId, { ...options, limit: undefined, offset: undefined });
    return trades.length;
  }

  async getOpenTrades(userId: string, exchangeId?: ExchangeId): Promise<Trade[]> {
    const openStatuses: TradeStatus[] = ['pending', 'open', 'partial'];
    return this.listTrades(userId, { exchangeId, status: openStatuses });
  }

  async getTradesByStrategy(userId: string, strategyId: string): Promise<Trade[]> {
    return this.listTrades(userId, { strategyId });
  }

  async getTradesBySignal(userId: string, signalId: string): Promise<Trade[]> {
    return Array.from(this.trades.values()).filter(
      t => t.userId === userId && t.signalId === signalId
    );
  }

  async getTradesInDateRange(userId: string, from: number, to: number): Promise<Trade[]> {
    return this.listTrades(userId, { dateFrom: from, dateTo: to });
  }

  async getRecentTrades(userId: string, limit: number): Promise<Trade[]> {
    return this.listTrades(userId, { limit });
  }

  async getTradeStats(
    userId: string,
    dateFrom?: number,
    dateTo?: number
  ): Promise<{
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnL: number;
    avgPnL: number;
    avgHoldingPeriodHours: number;
  }> {
    let trades = Array.from(this.trades.values()).filter(
      t => t.userId === userId && t.status === 'filled'
    );

    if (dateFrom) {
      trades = trades.filter(t => (t.filledAt ?? 0) >= dateFrom);
    }
    if (dateTo) {
      trades = trades.filter(t => (t.filledAt ?? 0) <= dateTo);
    }

    if (trades.length === 0) {
      return {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnL: 0,
        avgPnL: 0,
        avgHoldingPeriodHours: 0,
      };
    }

    let totalPnL = 0;
    let wins = 0;
    let losses = 0;
    let totalHoldingHours = 0;

    for (const trade of trades) {
      const pnl = trade.side === 'buy'
        ? ((trade.averageFilledPrice ?? 0) - (trade.price ?? 0)) * trade.filledQuantity
        : ((trade.price ?? 0) - (trade.averageFilledPrice ?? 0)) * trade.filledQuantity;

      totalPnL += pnl - trade.fees;

      if (pnl > 0) {
        wins++;
      } else if (pnl < 0) {
        losses++;
      }

      if (trade.filledAt) {
        totalHoldingHours += (trade.filledAt - trade.createdAt) / (1000 * 60 * 60);
      }
    }

    return {
      totalTrades: trades.length,
      wins,
      losses,
      winRate: trades.length > 0 ? wins / trades.length : 0,
      totalPnL,
      avgPnL: trades.length > 0 ? totalPnL / trades.length : 0,
      avgHoldingPeriodHours: trades.length > 0 ? totalHoldingHours / trades.length : 0,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTradeStore(type: 'memory'): InMemoryTradeStore;
export function createTradeStore(type: 'database', db: DatabaseAdapter): DatabaseTradeStore;
export function createTradeStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): TradeStore {
  if (type === 'memory') {
    return new InMemoryTradeStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseTradeStore(db);
}
