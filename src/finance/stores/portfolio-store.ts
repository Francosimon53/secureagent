/**
 * Portfolio Store
 *
 * Persistence layer for portfolios and positions with interface, database, and in-memory implementations.
 */

import { randomUUID } from 'crypto';
import type {
  Portfolio,
  Position,
  PositionLot,
  AllocationTarget,
  PositionQueryOptions,
  PortfolioSnapshot,
  Currency,
  Asset,
} from '../types.js';
import type { DatabaseAdapter } from './trade-store.js';

// =============================================================================
// Portfolio Store Interface
// =============================================================================

export interface PortfolioStore {
  initialize(): Promise<void>;

  // Portfolio CRUD
  createPortfolio(portfolio: Omit<Portfolio, 'id' | 'createdAt' | 'updatedAt'>): Promise<Portfolio>;
  getPortfolio(portfolioId: string): Promise<Portfolio | null>;
  getPortfolioByUserId(userId: string): Promise<Portfolio | null>;
  updatePortfolio(portfolioId: string, updates: Partial<Portfolio>): Promise<Portfolio | null>;
  deletePortfolio(portfolioId: string): Promise<boolean>;
  listPortfolios(userId: string): Promise<Portfolio[]>;

  // Position CRUD
  createPosition(position: Omit<Position, 'id'>): Promise<Position>;
  getPosition(positionId: string): Promise<Position | null>;
  getPositionByAsset(portfolioId: string, asset: Asset): Promise<Position | null>;
  updatePosition(positionId: string, updates: Partial<Position>): Promise<Position | null>;
  deletePosition(positionId: string): Promise<boolean>;
  listPositions(portfolioId: string, options?: PositionQueryOptions): Promise<Position[]>;

  // Position lots
  addLot(positionId: string, lot: Omit<PositionLot, 'id'>): Promise<PositionLot>;
  removeLot(positionId: string, lotId: string): Promise<boolean>;
  getLots(positionId: string): Promise<PositionLot[]>;

  // Allocation targets
  setAllocationTargets(portfolioId: string, targets: AllocationTarget[]): Promise<void>;
  getAllocationTargets(portfolioId: string): Promise<AllocationTarget[]>;

  // Snapshots
  saveSnapshot(snapshot: PortfolioSnapshot): Promise<void>;
  getSnapshots(portfolioId: string, from: number, to: number): Promise<PortfolioSnapshot[]>;
  getLatestSnapshot(portfolioId: string): Promise<PortfolioSnapshot | null>;
}

// =============================================================================
// Database Row Types
// =============================================================================

interface PortfolioRow {
  id: string;
  user_id: string;
  name: string;
  cash_amount: number;
  cash_currency: string;
  total_value: number;
  total_value_currency: string;
  created_at: number;
  updated_at: number;
}

interface PositionRow {
  id: string;
  portfolio_id: string;
  asset: string;
  quantity: number;
  cost_basis: number;
  current_price: number;
  current_value: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  realized_pnl: number;
  allocation_percent: number;
  avg_entry_price: number;
  first_buy_date: number;
  last_update_date: number;
  exchange: string | null;
}

interface LotRow {
  id: string;
  position_id: string;
  quantity: number;
  price: number;
  date: number;
  fees: number;
  trade_id: string | null;
}

interface AllocationTargetRow {
  portfolio_id: string;
  asset: string;
  target_percent: number;
  min_percent: number | null;
  max_percent: number | null;
}

interface SnapshotRow {
  portfolio_id: string;
  timestamp: number;
  total_value: number;
  positions_json: string;
}

// =============================================================================
// Database Portfolio Store
// =============================================================================

export class DatabasePortfolioStore implements PortfolioStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Portfolios table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS portfolios (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        cash_amount REAL DEFAULT 0,
        cash_currency TEXT DEFAULT 'USD',
        total_value REAL DEFAULT 0,
        total_value_currency TEXT DEFAULT 'USD',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Positions table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS positions (
        id TEXT PRIMARY KEY,
        portfolio_id TEXT NOT NULL,
        asset TEXT NOT NULL,
        quantity REAL DEFAULT 0,
        cost_basis REAL DEFAULT 0,
        current_price REAL DEFAULT 0,
        current_value REAL DEFAULT 0,
        unrealized_pnl REAL DEFAULT 0,
        unrealized_pnl_percent REAL DEFAULT 0,
        realized_pnl REAL DEFAULT 0,
        allocation_percent REAL DEFAULT 0,
        avg_entry_price REAL DEFAULT 0,
        first_buy_date INTEGER NOT NULL,
        last_update_date INTEGER NOT NULL,
        exchange TEXT,
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
        UNIQUE(portfolio_id, asset)
      )
    `);

    // Lots table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS position_lots (
        id TEXT PRIMARY KEY,
        position_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        price REAL NOT NULL,
        date INTEGER NOT NULL,
        fees REAL DEFAULT 0,
        trade_id TEXT,
        FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE
      )
    `);

    // Allocation targets table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS allocation_targets (
        portfolio_id TEXT NOT NULL,
        asset TEXT NOT NULL,
        target_percent REAL NOT NULL,
        min_percent REAL,
        max_percent REAL,
        PRIMARY KEY (portfolio_id, asset),
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
      )
    `);

    // Snapshots table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        portfolio_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        total_value REAL NOT NULL,
        positions_json TEXT NOT NULL,
        PRIMARY KEY (portfolio_id, timestamp),
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_portfolios_user ON portfolios(user_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_positions_portfolio ON positions(portfolio_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_lots_position ON position_lots(position_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_portfolio_time ON portfolio_snapshots(portfolio_id, timestamp)
    `);
  }

  // Portfolio CRUD
  async createPortfolio(
    portfolio: Omit<Portfolio, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Portfolio> {
    const now = Date.now();
    const id = randomUUID();

    const item: Portfolio = {
      ...portfolio,
      id,
      positions: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO portfolios (
        id, user_id, name, cash_amount, cash_currency,
        total_value, total_value_currency, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.name,
        item.cashBalance.amount,
        item.cashBalance.currency,
        item.totalValue.amount,
        item.totalValue.currency,
        item.createdAt,
        item.updatedAt,
      ]
    );

    // Save allocation targets if provided
    if (item.targetAllocations) {
      await this.setAllocationTargets(item.id, item.targetAllocations);
    }

    return item;
  }

  async getPortfolio(portfolioId: string): Promise<Portfolio | null> {
    const result = await this.db.query<PortfolioRow>(
      'SELECT * FROM portfolios WHERE id = ?',
      [portfolioId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const positions = await this.listPositions(portfolioId);
    const targetAllocations = await this.getAllocationTargets(portfolioId);

    return this.rowToPortfolio(row, positions, targetAllocations);
  }

  async getPortfolioByUserId(userId: string): Promise<Portfolio | null> {
    const result = await this.db.query<PortfolioRow>(
      'SELECT * FROM portfolios WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const positions = await this.listPositions(row.id);
    const targetAllocations = await this.getAllocationTargets(row.id);

    return this.rowToPortfolio(row, positions, targetAllocations);
  }

  async updatePortfolio(
    portfolioId: string,
    updates: Partial<Portfolio>
  ): Promise<Portfolio | null> {
    const existing = await this.getPortfolio(portfolioId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const params: unknown[] = [now];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      params.push(updates.name);
    }
    if (updates.cashBalance !== undefined) {
      setClauses.push('cash_amount = ?', 'cash_currency = ?');
      params.push(updates.cashBalance.amount, updates.cashBalance.currency);
    }
    if (updates.totalValue !== undefined) {
      setClauses.push('total_value = ?', 'total_value_currency = ?');
      params.push(updates.totalValue.amount, updates.totalValue.currency);
    }

    params.push(portfolioId);

    await this.db.execute(
      `UPDATE portfolios SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    if (updates.targetAllocations !== undefined) {
      await this.setAllocationTargets(portfolioId, updates.targetAllocations);
    }

    return this.getPortfolio(portfolioId);
  }

  async deletePortfolio(portfolioId: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM portfolios WHERE id = ?', [portfolioId]);
    return result.changes > 0;
  }

  async listPortfolios(userId: string): Promise<Portfolio[]> {
    const result = await this.db.query<PortfolioRow>(
      'SELECT * FROM portfolios WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    const portfolios: Portfolio[] = [];
    for (const row of result.rows) {
      const positions = await this.listPositions(row.id);
      const targetAllocations = await this.getAllocationTargets(row.id);
      portfolios.push(this.rowToPortfolio(row, positions, targetAllocations));
    }

    return portfolios;
  }

  // Position CRUD
  async createPosition(position: Omit<Position, 'id'>): Promise<Position> {
    const id = randomUUID();
    const item: Position = { ...position, id };

    await this.db.execute(
      `INSERT INTO positions (
        id, portfolio_id, asset, quantity, cost_basis,
        current_price, current_value, unrealized_pnl, unrealized_pnl_percent,
        realized_pnl, allocation_percent, avg_entry_price,
        first_buy_date, last_update_date, exchange
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.portfolioId,
        item.asset,
        item.quantity,
        item.costBasis,
        item.currentPrice,
        item.currentValue,
        item.unrealizedPnL,
        item.unrealizedPnLPercent,
        item.realizedPnL,
        item.allocationPercent,
        item.avgEntryPrice,
        item.firstBuyDate,
        item.lastUpdateDate,
        item.exchange ?? null,
      ]
    );

    // Save lots
    for (const lot of item.lots) {
      await this.addLot(item.id, lot);
    }

    return item;
  }

  async getPosition(positionId: string): Promise<Position | null> {
    const result = await this.db.query<PositionRow>(
      'SELECT * FROM positions WHERE id = ?',
      [positionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const lots = await this.getLots(positionId);
    return this.rowToPosition(result.rows[0], lots);
  }

  async getPositionByAsset(portfolioId: string, asset: Asset): Promise<Position | null> {
    const result = await this.db.query<PositionRow>(
      'SELECT * FROM positions WHERE portfolio_id = ? AND asset = ?',
      [portfolioId, asset]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const lots = await this.getLots(result.rows[0].id);
    return this.rowToPosition(result.rows[0], lots);
  }

  async updatePosition(positionId: string, updates: Partial<Position>): Promise<Position | null> {
    const existing = await this.getPosition(positionId);
    if (!existing) {
      return null;
    }

    const setClauses: string[] = ['last_update_date = ?'];
    const params: unknown[] = [Date.now()];

    if (updates.quantity !== undefined) {
      setClauses.push('quantity = ?');
      params.push(updates.quantity);
    }
    if (updates.costBasis !== undefined) {
      setClauses.push('cost_basis = ?');
      params.push(updates.costBasis);
    }
    if (updates.currentPrice !== undefined) {
      setClauses.push('current_price = ?');
      params.push(updates.currentPrice);
    }
    if (updates.currentValue !== undefined) {
      setClauses.push('current_value = ?');
      params.push(updates.currentValue);
    }
    if (updates.unrealizedPnL !== undefined) {
      setClauses.push('unrealized_pnl = ?');
      params.push(updates.unrealizedPnL);
    }
    if (updates.unrealizedPnLPercent !== undefined) {
      setClauses.push('unrealized_pnl_percent = ?');
      params.push(updates.unrealizedPnLPercent);
    }
    if (updates.realizedPnL !== undefined) {
      setClauses.push('realized_pnl = ?');
      params.push(updates.realizedPnL);
    }
    if (updates.allocationPercent !== undefined) {
      setClauses.push('allocation_percent = ?');
      params.push(updates.allocationPercent);
    }
    if (updates.avgEntryPrice !== undefined) {
      setClauses.push('avg_entry_price = ?');
      params.push(updates.avgEntryPrice);
    }

    params.push(positionId);

    await this.db.execute(
      `UPDATE positions SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    return this.getPosition(positionId);
  }

  async deletePosition(positionId: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM positions WHERE id = ?', [positionId]);
    return result.changes > 0;
  }

  async listPositions(portfolioId: string, options: PositionQueryOptions = {}): Promise<Position[]> {
    let sql = 'SELECT * FROM positions WHERE portfolio_id = ?';
    const params: unknown[] = [portfolioId];

    if (options.asset) {
      sql += ' AND asset = ?';
      params.push(options.asset);
    }
    if (options.hasUnrealizedGain) {
      sql += ' AND unrealized_pnl > 0';
    }
    if (options.hasUnrealizedLoss) {
      sql += ' AND unrealized_pnl < 0';
    }
    if (options.minValue !== undefined) {
      sql += ' AND current_value >= ?';
      params.push(options.minValue);
    }
    if (options.maxValue !== undefined) {
      sql += ' AND current_value <= ?';
      params.push(options.maxValue);
    }

    sql += ' ORDER BY current_value DESC';

    const result = await this.db.query<PositionRow>(sql, params);
    const positions: Position[] = [];

    for (const row of result.rows) {
      const lots = await this.getLots(row.id);
      positions.push(this.rowToPosition(row, lots));
    }

    return positions;
  }

  // Lots
  async addLot(positionId: string, lot: Omit<PositionLot, 'id'>): Promise<PositionLot> {
    const id = randomUUID();
    const item: PositionLot = { ...lot, id };

    await this.db.execute(
      `INSERT INTO position_lots (id, position_id, quantity, price, date, fees, trade_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [item.id, positionId, item.quantity, item.price, item.date, item.fees, item.tradeId ?? null]
    );

    return item;
  }

  async removeLot(positionId: string, lotId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM position_lots WHERE id = ? AND position_id = ?',
      [lotId, positionId]
    );
    return result.changes > 0;
  }

  async getLots(positionId: string): Promise<PositionLot[]> {
    const result = await this.db.query<LotRow>(
      'SELECT * FROM position_lots WHERE position_id = ? ORDER BY date ASC',
      [positionId]
    );

    return result.rows.map(row => ({
      id: row.id,
      quantity: row.quantity,
      price: row.price,
      date: row.date,
      fees: row.fees,
      tradeId: row.trade_id ?? undefined,
    }));
  }

  // Allocation targets
  async setAllocationTargets(portfolioId: string, targets: AllocationTarget[]): Promise<void> {
    await this.db.execute('DELETE FROM allocation_targets WHERE portfolio_id = ?', [portfolioId]);

    for (const target of targets) {
      await this.db.execute(
        `INSERT INTO allocation_targets (portfolio_id, asset, target_percent, min_percent, max_percent)
         VALUES (?, ?, ?, ?, ?)`,
        [
          portfolioId,
          target.asset,
          target.targetPercent,
          target.minPercent ?? null,
          target.maxPercent ?? null,
        ]
      );
    }
  }

  async getAllocationTargets(portfolioId: string): Promise<AllocationTarget[]> {
    const result = await this.db.query<AllocationTargetRow>(
      'SELECT * FROM allocation_targets WHERE portfolio_id = ?',
      [portfolioId]
    );

    return result.rows.map(row => ({
      asset: row.asset,
      targetPercent: row.target_percent,
      minPercent: row.min_percent ?? undefined,
      maxPercent: row.max_percent ?? undefined,
    }));
  }

  // Snapshots
  async saveSnapshot(snapshot: PortfolioSnapshot): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO portfolio_snapshots (portfolio_id, timestamp, total_value, positions_json)
       VALUES (?, ?, ?, ?)`,
      [
        snapshot.portfolioId,
        snapshot.timestamp,
        snapshot.totalValue,
        JSON.stringify(snapshot.positions),
      ]
    );
  }

  async getSnapshots(portfolioId: string, from: number, to: number): Promise<PortfolioSnapshot[]> {
    const result = await this.db.query<SnapshotRow>(
      `SELECT * FROM portfolio_snapshots
       WHERE portfolio_id = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`,
      [portfolioId, from, to]
    );

    return result.rows.map(row => ({
      portfolioId: row.portfolio_id,
      timestamp: row.timestamp,
      totalValue: row.total_value,
      positions: JSON.parse(row.positions_json),
    }));
  }

  async getLatestSnapshot(portfolioId: string): Promise<PortfolioSnapshot | null> {
    const result = await this.db.query<SnapshotRow>(
      `SELECT * FROM portfolio_snapshots
       WHERE portfolio_id = ?
       ORDER BY timestamp DESC LIMIT 1`,
      [portfolioId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      portfolioId: row.portfolio_id,
      timestamp: row.timestamp,
      totalValue: row.total_value,
      positions: JSON.parse(row.positions_json),
    };
  }

  // Helper methods
  private rowToPortfolio(
    row: PortfolioRow,
    positions: Position[],
    targetAllocations: AllocationTarget[]
  ): Portfolio {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      positions,
      cashBalance: {
        amount: row.cash_amount,
        currency: row.cash_currency as Currency,
      },
      totalValue: {
        amount: row.total_value,
        currency: row.total_value_currency as Currency,
      },
      targetAllocations: targetAllocations.length > 0 ? targetAllocations : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToPosition(row: PositionRow, lots: PositionLot[]): Position {
    return {
      id: row.id,
      portfolioId: row.portfolio_id,
      asset: row.asset,
      quantity: row.quantity,
      costBasis: row.cost_basis,
      currentPrice: row.current_price,
      currentValue: row.current_value,
      unrealizedPnL: row.unrealized_pnl,
      unrealizedPnLPercent: row.unrealized_pnl_percent,
      realizedPnL: row.realized_pnl,
      allocationPercent: row.allocation_percent,
      avgEntryPrice: row.avg_entry_price,
      firstBuyDate: row.first_buy_date,
      lastUpdateDate: row.last_update_date,
      exchange: row.exchange as Position['exchange'],
      lots,
    };
  }
}

// =============================================================================
// In-Memory Portfolio Store
// =============================================================================

export class InMemoryPortfolioStore implements PortfolioStore {
  private portfolios = new Map<string, Portfolio>();
  private positions = new Map<string, Position>();
  private lots = new Map<string, PositionLot[]>();
  private allocationTargets = new Map<string, AllocationTarget[]>();
  private snapshots = new Map<string, PortfolioSnapshot[]>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async createPortfolio(
    portfolio: Omit<Portfolio, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Portfolio> {
    const now = Date.now();
    const item: Portfolio = {
      ...portfolio,
      id: randomUUID(),
      positions: [],
      createdAt: now,
      updatedAt: now,
    };
    this.portfolios.set(item.id, item);

    if (item.targetAllocations) {
      this.allocationTargets.set(item.id, item.targetAllocations);
    }

    return item;
  }

  async getPortfolio(portfolioId: string): Promise<Portfolio | null> {
    const portfolio = this.portfolios.get(portfolioId);
    if (!portfolio) {
      return null;
    }

    const positions = await this.listPositions(portfolioId);
    const targetAllocations = this.allocationTargets.get(portfolioId) ?? [];

    return {
      ...portfolio,
      positions,
      targetAllocations: targetAllocations.length > 0 ? targetAllocations : undefined,
    };
  }

  async getPortfolioByUserId(userId: string): Promise<Portfolio | null> {
    for (const portfolio of this.portfolios.values()) {
      if (portfolio.userId === userId) {
        return this.getPortfolio(portfolio.id);
      }
    }
    return null;
  }

  async updatePortfolio(
    portfolioId: string,
    updates: Partial<Portfolio>
  ): Promise<Portfolio | null> {
    const existing = this.portfolios.get(portfolioId);
    if (!existing) {
      return null;
    }

    const updated: Portfolio = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    this.portfolios.set(portfolioId, updated);

    if (updates.targetAllocations !== undefined) {
      this.allocationTargets.set(portfolioId, updates.targetAllocations);
    }

    return this.getPortfolio(portfolioId);
  }

  async deletePortfolio(portfolioId: string): Promise<boolean> {
    // Delete associated positions and their lots
    const positions = await this.listPositions(portfolioId);
    for (const position of positions) {
      this.lots.delete(position.id);
      this.positions.delete(position.id);
    }

    this.allocationTargets.delete(portfolioId);
    this.snapshots.delete(portfolioId);

    return this.portfolios.delete(portfolioId);
  }

  async listPortfolios(userId: string): Promise<Portfolio[]> {
    const result: Portfolio[] = [];
    for (const portfolio of this.portfolios.values()) {
      if (portfolio.userId === userId) {
        const full = await this.getPortfolio(portfolio.id);
        if (full) {
          result.push(full);
        }
      }
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  async createPosition(position: Omit<Position, 'id'>): Promise<Position> {
    const item: Position = { ...position, id: randomUUID() };
    this.positions.set(item.id, item);
    this.lots.set(item.id, [...item.lots]);
    return item;
  }

  async getPosition(positionId: string): Promise<Position | null> {
    const position = this.positions.get(positionId);
    if (!position) {
      return null;
    }
    return {
      ...position,
      lots: this.lots.get(positionId) ?? [],
    };
  }

  async getPositionByAsset(portfolioId: string, asset: Asset): Promise<Position | null> {
    for (const position of this.positions.values()) {
      if (position.portfolioId === portfolioId && position.asset === asset) {
        return this.getPosition(position.id);
      }
    }
    return null;
  }

  async updatePosition(positionId: string, updates: Partial<Position>): Promise<Position | null> {
    const existing = this.positions.get(positionId);
    if (!existing) {
      return null;
    }

    const updated: Position = {
      ...existing,
      ...updates,
      id: existing.id,
      portfolioId: existing.portfolioId,
      lastUpdateDate: Date.now(),
    };

    this.positions.set(positionId, updated);
    return this.getPosition(positionId);
  }

  async deletePosition(positionId: string): Promise<boolean> {
    this.lots.delete(positionId);
    return this.positions.delete(positionId);
  }

  async listPositions(portfolioId: string, options: PositionQueryOptions = {}): Promise<Position[]> {
    let result: Position[] = [];

    for (const position of this.positions.values()) {
      if (position.portfolioId === portfolioId) {
        const full = await this.getPosition(position.id);
        if (full) {
          result.push(full);
        }
      }
    }

    if (options.asset) {
      result = result.filter(p => p.asset === options.asset);
    }
    if (options.hasUnrealizedGain) {
      result = result.filter(p => p.unrealizedPnL > 0);
    }
    if (options.hasUnrealizedLoss) {
      result = result.filter(p => p.unrealizedPnL < 0);
    }
    if (options.minValue !== undefined) {
      result = result.filter(p => p.currentValue >= options.minValue!);
    }
    if (options.maxValue !== undefined) {
      result = result.filter(p => p.currentValue <= options.maxValue!);
    }

    return result.sort((a, b) => b.currentValue - a.currentValue);
  }

  async addLot(positionId: string, lot: Omit<PositionLot, 'id'>): Promise<PositionLot> {
    const item: PositionLot = { ...lot, id: randomUUID() };
    const existing = this.lots.get(positionId) ?? [];
    this.lots.set(positionId, [...existing, item]);
    return item;
  }

  async removeLot(positionId: string, lotId: string): Promise<boolean> {
    const existing = this.lots.get(positionId);
    if (!existing) {
      return false;
    }
    const filtered = existing.filter(l => l.id !== lotId);
    if (filtered.length === existing.length) {
      return false;
    }
    this.lots.set(positionId, filtered);
    return true;
  }

  async getLots(positionId: string): Promise<PositionLot[]> {
    return this.lots.get(positionId) ?? [];
  }

  async setAllocationTargets(portfolioId: string, targets: AllocationTarget[]): Promise<void> {
    this.allocationTargets.set(portfolioId, targets);
  }

  async getAllocationTargets(portfolioId: string): Promise<AllocationTarget[]> {
    return this.allocationTargets.get(portfolioId) ?? [];
  }

  async saveSnapshot(snapshot: PortfolioSnapshot): Promise<void> {
    const existing = this.snapshots.get(snapshot.portfolioId) ?? [];
    // Remove any snapshot with the same timestamp
    const filtered = existing.filter(s => s.timestamp !== snapshot.timestamp);
    filtered.push(snapshot);
    filtered.sort((a, b) => a.timestamp - b.timestamp);
    this.snapshots.set(snapshot.portfolioId, filtered);
  }

  async getSnapshots(portfolioId: string, from: number, to: number): Promise<PortfolioSnapshot[]> {
    const all = this.snapshots.get(portfolioId) ?? [];
    return all.filter(s => s.timestamp >= from && s.timestamp <= to);
  }

  async getLatestSnapshot(portfolioId: string): Promise<PortfolioSnapshot | null> {
    const all = this.snapshots.get(portfolioId) ?? [];
    if (all.length === 0) {
      return null;
    }
    return all[all.length - 1];
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPortfolioStore(type: 'memory'): InMemoryPortfolioStore;
export function createPortfolioStore(type: 'database', db: DatabaseAdapter): DatabasePortfolioStore;
export function createPortfolioStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): PortfolioStore {
  if (type === 'memory') {
    return new InMemoryPortfolioStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabasePortfolioStore(db);
}
