/**
 * Wallet Store
 *
 * Persistence layer for watched wallets and transactions with interface, database, and in-memory implementations.
 */

import { randomUUID } from 'crypto';
import type {
  WatchedWallet,
  WalletBalance,
  WalletTransaction,
  WalletAlert,
  WalletAlertThresholds,
  WalletQueryOptions,
  BlockchainNetwork,
} from '../types.js';
import type { DatabaseAdapter } from './trade-store.js';

// =============================================================================
// Wallet Store Interface
// =============================================================================

export interface WalletStore {
  initialize(): Promise<void>;

  // Wallet CRUD
  createWallet(wallet: Omit<WatchedWallet, 'id' | 'createdAt' | 'updatedAt'>): Promise<WatchedWallet>;
  getWallet(walletId: string): Promise<WatchedWallet | null>;
  getWalletByAddress(address: string, network: BlockchainNetwork): Promise<WatchedWallet | null>;
  updateWallet(walletId: string, updates: Partial<WatchedWallet>): Promise<WatchedWallet | null>;
  deleteWallet(walletId: string): Promise<boolean>;
  listWallets(userId: string, options?: WalletQueryOptions): Promise<WatchedWallet[]>;

  // Balances
  updateBalances(walletId: string, balances: WalletBalance[]): Promise<void>;
  getBalances(walletId: string): Promise<WalletBalance[]>;

  // Transactions
  saveTransaction(walletId: string, transaction: WalletTransaction): Promise<void>;
  getTransaction(hash: string): Promise<WalletTransaction | null>;
  getTransactions(walletId: string, limit: number, offset?: number): Promise<WalletTransaction[]>;
  getRecentTransactions(walletId: string, since: number): Promise<WalletTransaction[]>;

  // Alerts
  createAlert(alert: Omit<WalletAlert, 'id' | 'createdAt'>): Promise<WalletAlert>;
  getAlert(alertId: string): Promise<WalletAlert | null>;
  acknowledgeAlert(alertId: string): Promise<boolean>;
  getUnacknowledgedAlerts(walletId: string): Promise<WalletAlert[]>;
  getAlertsByWallet(walletId: string, limit: number): Promise<WalletAlert[]>;
}

// =============================================================================
// Database Row Types
// =============================================================================

interface WalletRow {
  id: string;
  user_id: string;
  address: string;
  network: string;
  label: string;
  total_usd_value: number;
  alert_thresholds_json: string;
  is_owned: number;
  last_checked: number;
  created_at: number;
  updated_at: number;
}

interface BalanceRow {
  wallet_id: string;
  token: string;
  symbol: string;
  balance: number;
  decimals: number;
  usd_value: number;
  change_24h: number | null;
  contract_address: string | null;
  is_native: number;
}

interface TransactionRow {
  hash: string;
  wallet_id: string;
  network: string;
  from_address: string;
  to_address: string;
  value: number;
  token_symbol: string | null;
  token_address: string | null;
  usd_value: number | null;
  gas_used: number | null;
  gas_price: number | null;
  gas_cost_usd: number | null;
  status: string;
  block_number: number | null;
  timestamp: number;
  type: string;
  method: string | null;
}

interface AlertRow {
  id: string;
  wallet_id: string;
  type: string;
  severity: string;
  message: string;
  data_json: string;
  acknowledged: number;
  acknowledged_at: number | null;
  created_at: number;
}

// =============================================================================
// Database Wallet Store
// =============================================================================

export class DatabaseWalletStore implements WalletStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Wallets table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS watched_wallets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        address TEXT NOT NULL,
        network TEXT NOT NULL,
        label TEXT NOT NULL,
        total_usd_value REAL DEFAULT 0,
        alert_thresholds_json TEXT NOT NULL DEFAULT '{}',
        is_owned INTEGER DEFAULT 1,
        last_checked INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(address, network)
      )
    `);

    // Balances table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS wallet_balances (
        wallet_id TEXT NOT NULL,
        token TEXT NOT NULL,
        symbol TEXT NOT NULL,
        balance REAL NOT NULL,
        decimals INTEGER NOT NULL,
        usd_value REAL DEFAULT 0,
        change_24h REAL,
        contract_address TEXT,
        is_native INTEGER DEFAULT 0,
        PRIMARY KEY (wallet_id, token),
        FOREIGN KEY (wallet_id) REFERENCES watched_wallets(id) ON DELETE CASCADE
      )
    `);

    // Transactions table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        hash TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        network TEXT NOT NULL,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        value REAL NOT NULL,
        token_symbol TEXT,
        token_address TEXT,
        usd_value REAL,
        gas_used INTEGER,
        gas_price INTEGER,
        gas_cost_usd REAL,
        status TEXT NOT NULL,
        block_number INTEGER,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        method TEXT,
        FOREIGN KEY (wallet_id) REFERENCES watched_wallets(id) ON DELETE CASCADE
      )
    `);

    // Alerts table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS wallet_alerts (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        data_json TEXT NOT NULL,
        acknowledged INTEGER DEFAULT 0,
        acknowledged_at INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (wallet_id) REFERENCES watched_wallets(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_wallets_user ON watched_wallets(user_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_transactions_wallet_time ON wallet_transactions(wallet_id, timestamp)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_alerts_wallet ON wallet_alerts(wallet_id, acknowledged)
    `);
  }

  // Wallet CRUD
  async createWallet(
    wallet: Omit<WatchedWallet, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<WatchedWallet> {
    const now = Date.now();
    const id = randomUUID();

    const item: WatchedWallet = {
      ...wallet,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO watched_wallets (
        id, user_id, address, network, label, total_usd_value,
        alert_thresholds_json, is_owned, last_checked, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.address,
        item.network,
        item.label,
        item.totalUsdValue,
        JSON.stringify(item.alertThresholds),
        item.isOwned ? 1 : 0,
        item.lastChecked,
        item.createdAt,
        item.updatedAt,
      ]
    );

    // Save balances
    if (item.balances.length > 0) {
      await this.updateBalances(item.id, item.balances);
    }

    return item;
  }

  async getWallet(walletId: string): Promise<WatchedWallet | null> {
    const result = await this.db.query<WalletRow>(
      'SELECT * FROM watched_wallets WHERE id = ?',
      [walletId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const balances = await this.getBalances(walletId);
    return this.rowToWallet(result.rows[0], balances);
  }

  async getWalletByAddress(
    address: string,
    network: BlockchainNetwork
  ): Promise<WatchedWallet | null> {
    const result = await this.db.query<WalletRow>(
      'SELECT * FROM watched_wallets WHERE address = ? AND network = ?',
      [address, network]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const balances = await this.getBalances(result.rows[0].id);
    return this.rowToWallet(result.rows[0], balances);
  }

  async updateWallet(
    walletId: string,
    updates: Partial<WatchedWallet>
  ): Promise<WatchedWallet | null> {
    const existing = await this.getWallet(walletId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const params: unknown[] = [now];

    if (updates.label !== undefined) {
      setClauses.push('label = ?');
      params.push(updates.label);
    }
    if (updates.totalUsdValue !== undefined) {
      setClauses.push('total_usd_value = ?');
      params.push(updates.totalUsdValue);
    }
    if (updates.alertThresholds !== undefined) {
      setClauses.push('alert_thresholds_json = ?');
      params.push(JSON.stringify(updates.alertThresholds));
    }
    if (updates.isOwned !== undefined) {
      setClauses.push('is_owned = ?');
      params.push(updates.isOwned ? 1 : 0);
    }
    if (updates.lastChecked !== undefined) {
      setClauses.push('last_checked = ?');
      params.push(updates.lastChecked);
    }

    params.push(walletId);

    await this.db.execute(
      `UPDATE watched_wallets SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    if (updates.balances !== undefined) {
      await this.updateBalances(walletId, updates.balances);
    }

    return this.getWallet(walletId);
  }

  async deleteWallet(walletId: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM watched_wallets WHERE id = ?', [walletId]);
    return result.changes > 0;
  }

  async listWallets(userId: string, options: WalletQueryOptions = {}): Promise<WatchedWallet[]> {
    let sql = 'SELECT * FROM watched_wallets WHERE user_id = ?';
    const params: unknown[] = [userId];

    if (options.network) {
      sql += ' AND network = ?';
      params.push(options.network);
    }
    if (options.isOwned !== undefined) {
      sql += ' AND is_owned = ?';
      params.push(options.isOwned ? 1 : 0);
    }
    if (options.minValueUsd !== undefined) {
      sql += ' AND total_usd_value >= ?';
      params.push(options.minValueUsd);
    }

    sql += ' ORDER BY total_usd_value DESC';

    const result = await this.db.query<WalletRow>(sql, params);
    const wallets: WatchedWallet[] = [];

    for (const row of result.rows) {
      const balances = await this.getBalances(row.id);
      wallets.push(this.rowToWallet(row, balances));
    }

    return wallets;
  }

  // Balances
  async updateBalances(walletId: string, balances: WalletBalance[]): Promise<void> {
    await this.db.execute('DELETE FROM wallet_balances WHERE wallet_id = ?', [walletId]);

    for (const balance of balances) {
      await this.db.execute(
        `INSERT INTO wallet_balances (
          wallet_id, token, symbol, balance, decimals, usd_value,
          change_24h, contract_address, is_native
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          walletId,
          balance.token,
          balance.symbol,
          balance.balance,
          balance.decimals,
          balance.usdValue,
          balance.change24h ?? null,
          balance.contractAddress ?? null,
          balance.isNative ? 1 : 0,
        ]
      );
    }
  }

  async getBalances(walletId: string): Promise<WalletBalance[]> {
    const result = await this.db.query<BalanceRow>(
      'SELECT * FROM wallet_balances WHERE wallet_id = ? ORDER BY usd_value DESC',
      [walletId]
    );

    return result.rows.map(row => ({
      token: row.token,
      symbol: row.symbol,
      balance: row.balance,
      decimals: row.decimals,
      usdValue: row.usd_value,
      change24h: row.change_24h ?? undefined,
      contractAddress: row.contract_address ?? undefined,
      isNative: row.is_native === 1,
    }));
  }

  // Transactions
  async saveTransaction(walletId: string, transaction: WalletTransaction): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO wallet_transactions (
        hash, wallet_id, network, from_address, to_address, value,
        token_symbol, token_address, usd_value, gas_used, gas_price,
        gas_cost_usd, status, block_number, timestamp, type, method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transaction.hash,
        walletId,
        transaction.network,
        transaction.from,
        transaction.to,
        transaction.value,
        transaction.tokenSymbol ?? null,
        transaction.tokenAddress ?? null,
        transaction.usdValue ?? null,
        transaction.gasUsed ?? null,
        transaction.gasPrice ?? null,
        transaction.gasCostUsd ?? null,
        transaction.status,
        transaction.blockNumber ?? null,
        transaction.timestamp,
        transaction.type,
        transaction.method ?? null,
      ]
    );
  }

  async getTransaction(hash: string): Promise<WalletTransaction | null> {
    const result = await this.db.query<TransactionRow>(
      'SELECT * FROM wallet_transactions WHERE hash = ?',
      [hash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToTransaction(result.rows[0]);
  }

  async getTransactions(
    walletId: string,
    limit: number,
    offset = 0
  ): Promise<WalletTransaction[]> {
    const result = await this.db.query<TransactionRow>(
      `SELECT * FROM wallet_transactions
       WHERE wallet_id = ?
       ORDER BY timestamp DESC
       LIMIT ? OFFSET ?`,
      [walletId, limit, offset]
    );

    return result.rows.map(row => this.rowToTransaction(row));
  }

  async getRecentTransactions(walletId: string, since: number): Promise<WalletTransaction[]> {
    const result = await this.db.query<TransactionRow>(
      `SELECT * FROM wallet_transactions
       WHERE wallet_id = ? AND timestamp >= ?
       ORDER BY timestamp DESC`,
      [walletId, since]
    );

    return result.rows.map(row => this.rowToTransaction(row));
  }

  // Alerts
  async createAlert(alert: Omit<WalletAlert, 'id' | 'createdAt'>): Promise<WalletAlert> {
    const now = Date.now();
    const id = randomUUID();

    const item: WalletAlert = {
      ...alert,
      id,
      createdAt: now,
    };

    await this.db.execute(
      `INSERT INTO wallet_alerts (
        id, wallet_id, type, severity, message, data_json, acknowledged, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.walletId,
        item.type,
        item.severity,
        item.message,
        JSON.stringify(item.data),
        item.acknowledged ? 1 : 0,
        item.createdAt,
      ]
    );

    return item;
  }

  async getAlert(alertId: string): Promise<WalletAlert | null> {
    const result = await this.db.query<AlertRow>(
      'SELECT * FROM wallet_alerts WHERE id = ?',
      [alertId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToAlert(result.rows[0]);
  }

  async acknowledgeAlert(alertId: string): Promise<boolean> {
    const result = await this.db.execute(
      'UPDATE wallet_alerts SET acknowledged = 1, acknowledged_at = ? WHERE id = ?',
      [Date.now(), alertId]
    );
    return result.changes > 0;
  }

  async getUnacknowledgedAlerts(walletId: string): Promise<WalletAlert[]> {
    const result = await this.db.query<AlertRow>(
      `SELECT * FROM wallet_alerts
       WHERE wallet_id = ? AND acknowledged = 0
       ORDER BY created_at DESC`,
      [walletId]
    );

    return result.rows.map(row => this.rowToAlert(row));
  }

  async getAlertsByWallet(walletId: string, limit: number): Promise<WalletAlert[]> {
    const result = await this.db.query<AlertRow>(
      `SELECT * FROM wallet_alerts
       WHERE wallet_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [walletId, limit]
    );

    return result.rows.map(row => this.rowToAlert(row));
  }

  // Helper methods
  private rowToWallet(row: WalletRow, balances: WalletBalance[]): WatchedWallet {
    return {
      id: row.id,
      userId: row.user_id,
      address: row.address,
      network: row.network as BlockchainNetwork,
      label: row.label,
      balances,
      totalUsdValue: row.total_usd_value,
      alertThresholds: JSON.parse(row.alert_thresholds_json) as WalletAlertThresholds,
      isOwned: row.is_owned === 1,
      lastChecked: row.last_checked,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToTransaction(row: TransactionRow): WalletTransaction {
    return {
      hash: row.hash,
      network: row.network as BlockchainNetwork,
      from: row.from_address,
      to: row.to_address,
      value: row.value,
      tokenSymbol: row.token_symbol ?? undefined,
      tokenAddress: row.token_address ?? undefined,
      usdValue: row.usd_value ?? undefined,
      gasUsed: row.gas_used ?? undefined,
      gasPrice: row.gas_price ?? undefined,
      gasCostUsd: row.gas_cost_usd ?? undefined,
      status: row.status as WalletTransaction['status'],
      blockNumber: row.block_number ?? undefined,
      timestamp: row.timestamp,
      type: row.type as WalletTransaction['type'],
      method: row.method ?? undefined,
    };
  }

  private rowToAlert(row: AlertRow): WalletAlert {
    return {
      id: row.id,
      walletId: row.wallet_id,
      type: row.type as WalletAlert['type'],
      severity: row.severity as WalletAlert['severity'],
      message: row.message,
      data: JSON.parse(row.data_json),
      acknowledged: row.acknowledged === 1,
      createdAt: row.created_at,
    };
  }
}

// =============================================================================
// In-Memory Wallet Store
// =============================================================================

export class InMemoryWalletStore implements WalletStore {
  private wallets = new Map<string, WatchedWallet>();
  private balances = new Map<string, WalletBalance[]>();
  private transactions = new Map<string, WalletTransaction[]>();
  private transactionsByHash = new Map<string, WalletTransaction>();
  private alerts = new Map<string, WalletAlert>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async createWallet(
    wallet: Omit<WatchedWallet, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<WatchedWallet> {
    const now = Date.now();
    const item: WatchedWallet = {
      ...wallet,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    this.wallets.set(item.id, item);
    this.balances.set(item.id, [...item.balances]);
    this.transactions.set(item.id, []);

    return item;
  }

  async getWallet(walletId: string): Promise<WatchedWallet | null> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      return null;
    }
    return {
      ...wallet,
      balances: this.balances.get(walletId) ?? [],
    };
  }

  async getWalletByAddress(
    address: string,
    network: BlockchainNetwork
  ): Promise<WatchedWallet | null> {
    for (const wallet of this.wallets.values()) {
      if (wallet.address === address && wallet.network === network) {
        return this.getWallet(wallet.id);
      }
    }
    return null;
  }

  async updateWallet(
    walletId: string,
    updates: Partial<WatchedWallet>
  ): Promise<WatchedWallet | null> {
    const existing = this.wallets.get(walletId);
    if (!existing) {
      return null;
    }

    const updated: WatchedWallet = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      address: existing.address,
      network: existing.network,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    this.wallets.set(walletId, updated);

    if (updates.balances) {
      this.balances.set(walletId, updates.balances);
    }

    return this.getWallet(walletId);
  }

  async deleteWallet(walletId: string): Promise<boolean> {
    this.balances.delete(walletId);

    // Clean up transactions
    const txs = this.transactions.get(walletId) ?? [];
    for (const tx of txs) {
      this.transactionsByHash.delete(tx.hash);
    }
    this.transactions.delete(walletId);

    // Clean up alerts
    for (const [id, alert] of this.alerts) {
      if (alert.walletId === walletId) {
        this.alerts.delete(id);
      }
    }

    return this.wallets.delete(walletId);
  }

  async listWallets(userId: string, options: WalletQueryOptions = {}): Promise<WatchedWallet[]> {
    let result: WatchedWallet[] = [];

    for (const wallet of this.wallets.values()) {
      if (wallet.userId === userId) {
        const full = await this.getWallet(wallet.id);
        if (full) {
          result.push(full);
        }
      }
    }

    if (options.network) {
      result = result.filter(w => w.network === options.network);
    }
    if (options.isOwned !== undefined) {
      result = result.filter(w => w.isOwned === options.isOwned);
    }
    if (options.minValueUsd !== undefined) {
      result = result.filter(w => w.totalUsdValue >= options.minValueUsd!);
    }

    return result.sort((a, b) => b.totalUsdValue - a.totalUsdValue);
  }

  async updateBalances(walletId: string, balances: WalletBalance[]): Promise<void> {
    this.balances.set(walletId, balances);
  }

  async getBalances(walletId: string): Promise<WalletBalance[]> {
    return this.balances.get(walletId) ?? [];
  }

  async saveTransaction(walletId: string, transaction: WalletTransaction): Promise<void> {
    const existing = this.transactions.get(walletId) ?? [];

    // Remove if already exists
    const filtered = existing.filter(t => t.hash !== transaction.hash);
    filtered.push(transaction);
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    this.transactions.set(walletId, filtered);
    this.transactionsByHash.set(transaction.hash, transaction);
  }

  async getTransaction(hash: string): Promise<WalletTransaction | null> {
    return this.transactionsByHash.get(hash) ?? null;
  }

  async getTransactions(
    walletId: string,
    limit: number,
    offset = 0
  ): Promise<WalletTransaction[]> {
    const all = this.transactions.get(walletId) ?? [];
    return all.slice(offset, offset + limit);
  }

  async getRecentTransactions(walletId: string, since: number): Promise<WalletTransaction[]> {
    const all = this.transactions.get(walletId) ?? [];
    return all.filter(t => t.timestamp >= since);
  }

  async createAlert(alert: Omit<WalletAlert, 'id' | 'createdAt'>): Promise<WalletAlert> {
    const item: WalletAlert = {
      ...alert,
      id: randomUUID(),
      createdAt: Date.now(),
    };
    this.alerts.set(item.id, item);
    return item;
  }

  async getAlert(alertId: string): Promise<WalletAlert | null> {
    return this.alerts.get(alertId) ?? null;
  }

  async acknowledgeAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return false;
    }
    alert.acknowledged = true;
    return true;
  }

  async getUnacknowledgedAlerts(walletId: string): Promise<WalletAlert[]> {
    return Array.from(this.alerts.values())
      .filter(a => a.walletId === walletId && !a.acknowledged)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getAlertsByWallet(walletId: string, limit: number): Promise<WalletAlert[]> {
    return Array.from(this.alerts.values())
      .filter(a => a.walletId === walletId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createWalletStore(type: 'memory'): InMemoryWalletStore;
export function createWalletStore(type: 'database', db: DatabaseAdapter): DatabaseWalletStore;
export function createWalletStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): WalletStore {
  if (type === 'memory') {
    return new InMemoryWalletStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseWalletStore(db);
}
