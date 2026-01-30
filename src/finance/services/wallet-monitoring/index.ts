/**
 * Wallet Monitoring Service
 *
 * Monitors blockchain wallets for balance changes and transactions.
 */

import { EventEmitter } from 'events';
import type {
  WatchedWallet,
  WalletBalance,
  WalletTransaction,
  GasPrice,
  BlockchainNetwork,
} from '../../types.js';
import type { WalletMonitoringConfig } from '../../config.js';
import type { WalletStore } from '../../stores/wallet-store.js';
import { FINANCE_EVENTS, FINANCE_DEFAULTS } from '../../constants.js';
import {
  EthereumProvider,
  BitcoinProvider,
  SolanaProvider,
} from '../../providers/blockchain/index.js';

// =============================================================================
// Service Interface
// =============================================================================

export interface WalletMonitoringService {
  // Initialization
  initialize(store: WalletStore): Promise<void>;
  start(): void;
  stop(): void;

  // Wallet management
  addWallet(
    userId: string,
    address: string,
    network: BlockchainNetwork,
    label: string
  ): Promise<WatchedWallet>;
  removeWallet(walletId: string): Promise<boolean>;
  updateWallet(walletId: string, updates: Partial<WatchedWallet>): Promise<WatchedWallet | null>;
  getWallets(userId: string): Promise<WatchedWallet[]>;

  // Balance checking
  refreshBalances(walletId: string): Promise<WalletBalance[]>;
  refreshAllBalances(userId: string): Promise<void>;

  // Transactions
  getTransactions(walletId: string, limit?: number): Promise<WalletTransaction[]>;
  checkNewTransactions(walletId: string): Promise<WalletTransaction[]>;

  // Gas prices
  getGasPrices(network: BlockchainNetwork): Promise<GasPrice | null>;

  // Events
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

// =============================================================================
// Implementation
// =============================================================================

export class WalletMonitoringServiceImpl extends EventEmitter implements WalletMonitoringService {
  private config: WalletMonitoringConfig;
  private store: WalletStore | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  private ethereumProvider?: EthereumProvider;
  private bitcoinProvider?: BitcoinProvider;
  private solanaProvider?: SolanaProvider;

  constructor(config?: Partial<WalletMonitoringConfig>) {
    super();
    this.config = {
      enabled: true,
      pollIntervalMinutes: 5,
      gasPriceAlertThreshold: 100,
      largeTransactionThresholdUsd: 10000,
      ...config,
    };
  }

  async initialize(store: WalletStore): Promise<void> {
    this.store = store;
    await this.store.initialize();

    // Initialize providers based on config
    if (this.config.ethereum?.enabled) {
      this.ethereumProvider = new EthereumProvider({
        apiKeyEnvVar: this.config.ethereum.apiKeyEnvVar,
      });
      await this.ethereumProvider.initialize();
    }

    if (this.config.bitcoin?.enabled) {
      this.bitcoinProvider = new BitcoinProvider({
        apiKeyEnvVar: this.config.bitcoin.apiKeyEnvVar,
      });
      await this.bitcoinProvider.initialize();
    }

    if (this.config.solana?.enabled) {
      this.solanaProvider = new SolanaProvider({
        rpcUrlEnvVar: this.config.solana.rpcUrlEnvVar,
      });
      await this.solanaProvider.initialize();
    }
  }

  start(): void {
    if (this.running) return;

    this.running = true;

    const intervalMs = (this.config.pollIntervalMinutes ?? FINANCE_DEFAULTS.WALLET_POLL_MINUTES) * 60 * 1000;

    this.pollInterval = setInterval(() => {
      this.pollAllWallets().catch(console.error);
    }, intervalMs);

    // Initial poll
    this.pollAllWallets().catch(console.error);
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.running = false;
  }

  async addWallet(
    userId: string,
    address: string,
    network: BlockchainNetwork,
    label: string
  ): Promise<WatchedWallet> {
    this.ensureInitialized();

    // Validate address
    if (!this.isValidAddress(address, network)) {
      throw new Error(`Invalid ${network} address: ${address}`);
    }

    // Check if already exists
    const existing = await this.store!.getWalletByAddress(address, network);
    if (existing) {
      throw new Error('Wallet already being watched');
    }

    // Get initial balances
    const balances = await this.fetchBalances(address, network);
    const totalUsdValue = balances.reduce((sum, b) => sum + b.usdValue, 0);

    const wallet = await this.store!.createWallet({
      userId,
      address,
      network,
      label,
      balances,
      totalUsdValue,
      alertThresholds: {},
      isOwned: true,
      lastChecked: Date.now(),
    });

    this.emit(FINANCE_EVENTS.WALLET_ADDED, wallet);

    return wallet;
  }

  async removeWallet(walletId: string): Promise<boolean> {
    this.ensureInitialized();

    const wallet = await this.store!.getWallet(walletId);
    const removed = await this.store!.deleteWallet(walletId);

    if (removed && wallet) {
      this.emit(FINANCE_EVENTS.WALLET_REMOVED, wallet);
    }

    return removed;
  }

  async updateWallet(
    walletId: string,
    updates: Partial<WatchedWallet>
  ): Promise<WatchedWallet | null> {
    this.ensureInitialized();
    return this.store!.updateWallet(walletId, updates);
  }

  async getWallets(userId: string): Promise<WatchedWallet[]> {
    this.ensureInitialized();
    return this.store!.listWallets(userId);
  }

  async refreshBalances(walletId: string): Promise<WalletBalance[]> {
    this.ensureInitialized();

    const wallet = await this.store!.getWallet(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const previousBalances = wallet.balances;
    const newBalances = await this.fetchBalances(wallet.address, wallet.network);
    const totalUsdValue = newBalances.reduce((sum, b) => sum + b.usdValue, 0);

    // Check for significant changes
    this.checkBalanceChanges(wallet, previousBalances, newBalances);

    // Update wallet
    await this.store!.updateWallet(walletId, {
      balances: newBalances,
      totalUsdValue,
      lastChecked: Date.now(),
    });

    return newBalances;
  }

  async refreshAllBalances(userId: string): Promise<void> {
    const wallets = await this.getWallets(userId);

    for (const wallet of wallets) {
      try {
        await this.refreshBalances(wallet.id);
      } catch (error) {
        console.error(`Failed to refresh wallet ${wallet.id}:`, error);
      }
    }
  }

  async getTransactions(walletId: string, limit = 50): Promise<WalletTransaction[]> {
    this.ensureInitialized();

    const wallet = await this.store!.getWallet(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Check if we have cached transactions
    const cached = await this.store!.getTransactions(walletId, limit);
    if (cached.length > 0) {
      return cached;
    }

    // Fetch from blockchain
    return this.fetchTransactions(wallet.address, wallet.network, limit);
  }

  async checkNewTransactions(walletId: string): Promise<WalletTransaction[]> {
    this.ensureInitialized();

    const wallet = await this.store!.getWallet(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const since = wallet.lastChecked;
    const transactions = await this.fetchTransactions(wallet.address, wallet.network, 20);

    const newTxs = transactions.filter(tx => tx.timestamp > since);

    // Save new transactions
    for (const tx of newTxs) {
      await this.store!.saveTransaction(walletId, tx);

      // Check for large transactions
      if (tx.usdValue && tx.usdValue >= (this.config.largeTransactionThresholdUsd ?? FINANCE_DEFAULTS.LARGE_TRANSACTION_THRESHOLD_USD)) {
        this.emit(FINANCE_EVENTS.WALLET_LARGE_TRANSACTION, { wallet, transaction: tx });

        await this.store!.createAlert({
          walletId,
          type: 'large_transaction',
          severity: 'warning',
          message: `Large transaction detected: $${tx.usdValue.toLocaleString()}`,
          data: { transaction: tx },
          acknowledged: false,
        });
      }

      this.emit(FINANCE_EVENTS.WALLET_TRANSACTION_DETECTED, { wallet, transaction: tx });
    }

    return newTxs;
  }

  async getGasPrices(network: BlockchainNetwork): Promise<GasPrice | null> {
    const provider = this.getProvider(network);
    if (!provider || !('getGasPrices' in provider)) {
      return null;
    }

    const result = await (provider as EthereumProvider).getGasPrices();
    if (!result.success || !result.data) {
      return null;
    }

    const gasPrice = result.data;

    // Check for gas spike
    const threshold = this.config.gasPriceAlertThreshold ?? FINANCE_DEFAULTS.GAS_SPIKE_THRESHOLD_GWEI;
    if (gasPrice.standard.gwei > threshold) {
      this.emit(FINANCE_EVENTS.GAS_PRICE_SPIKE, { network, gasPrice });
    }

    return gasPrice;
  }

  private ensureInitialized(): void {
    if (!this.store) {
      throw new Error('Wallet monitoring service not initialized');
    }
  }

  private getProvider(network: BlockchainNetwork) {
    switch (network) {
      case 'ethereum':
      case 'polygon':
      case 'arbitrum':
      case 'optimism':
      case 'avalanche':
      case 'bsc':
        return this.ethereumProvider;
      case 'bitcoin':
        return this.bitcoinProvider;
      case 'solana':
        return this.solanaProvider;
      default:
        return null;
    }
  }

  private isValidAddress(address: string, network: BlockchainNetwork): boolean {
    const provider = this.getProvider(network);
    if (!provider) return false;

    return provider.isValidAddress(address);
  }

  private async fetchBalances(
    address: string,
    network: BlockchainNetwork
  ): Promise<WalletBalance[]> {
    const provider = this.getProvider(network);
    if (!provider) return [];

    const result = await provider.getTokenBalances(address);
    return result.success ? result.data ?? [] : [];
  }

  private async fetchTransactions(
    address: string,
    network: BlockchainNetwork,
    limit: number
  ): Promise<WalletTransaction[]> {
    const provider = this.getProvider(network);
    if (!provider) return [];

    const result = await provider.getTransactions(address, limit);
    return result.success ? result.data ?? [] : [];
  }

  private checkBalanceChanges(
    wallet: WatchedWallet,
    previous: WalletBalance[],
    current: WalletBalance[]
  ): void {
    for (const currBalance of current) {
      const prevBalance = previous.find(b => b.symbol === currBalance.symbol);
      const prevAmount = prevBalance?.balance ?? 0;

      if (currBalance.balance !== prevAmount) {
        const change = currBalance.balance - prevAmount;
        const changePercent = prevAmount > 0 ? (change / prevAmount) * 100 : 100;

        this.emit(FINANCE_EVENTS.WALLET_BALANCE_CHANGED, {
          wallet,
          token: currBalance.symbol,
          previousBalance: prevAmount,
          currentBalance: currBalance.balance,
          change,
          changePercent,
        });

        // Check thresholds
        if (wallet.alertThresholds.minBalanceUsd && currBalance.usdValue < wallet.alertThresholds.minBalanceUsd) {
          this.emit(FINANCE_EVENTS.WALLET_LOW_BALANCE, { wallet, balance: currBalance });
        }
      }
    }
  }

  private async pollAllWallets(): Promise<void> {
    if (!this.store) return;

    // Get all wallets across all users
    // In production, this would be more efficient
    const wallets = await this.store.listWallets('*');

    for (const wallet of wallets) {
      try {
        await this.refreshBalances(wallet.id);
        await this.checkNewTransactions(wallet.id);
      } catch (error) {
        console.error(`Failed to poll wallet ${wallet.id}:`, error);
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createWalletMonitoringService(
  config?: Partial<WalletMonitoringConfig>
): WalletMonitoringService {
  return new WalletMonitoringServiceImpl(config);
}
