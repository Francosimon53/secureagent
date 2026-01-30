/**
 * Bitcoin Blockchain Provider
 *
 * Provides integration with Bitcoin network for wallet monitoring.
 */

import { BaseFinanceProvider, type FinanceProviderConfig } from '../base.js';
import type {
  WalletBalance,
  WalletTransaction,
  BlockchainNetwork,
  FinanceProviderResult,
} from '../../types.js';
import { BLOCKCHAIN_API_URLS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface BitcoinProviderConfig extends FinanceProviderConfig {
  useBlockcypher?: boolean;
}

interface BlockstreamAddressInfo {
  address: string;
  chain_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

interface BlockstreamTx {
  txid: string;
  version: number;
  locktime: number;
  vin: Array<{
    txid: string;
    vout: number;
    prevout: {
      scriptpubkey_address: string;
      value: number;
    };
  }>;
  vout: Array<{
    scriptpubkey_address: string;
    value: number;
  }>;
  size: number;
  weight: number;
  fee: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
}

interface BlockcypherAddressInfo {
  address: string;
  total_received: number;
  total_sent: number;
  balance: number;
  unconfirmed_balance: number;
  final_balance: number;
  n_tx: number;
  unconfirmed_n_tx: number;
  final_n_tx: number;
  txrefs?: Array<{
    tx_hash: string;
    block_height: number;
    tx_input_n: number;
    tx_output_n: number;
    value: number;
    ref_balance: number;
    spent: boolean;
    confirmations: number;
    confirmed: string;
    double_spend: boolean;
  }>;
}

// =============================================================================
// Provider Implementation
// =============================================================================

export class BitcoinProvider extends BaseFinanceProvider<BitcoinProviderConfig> {
  private readonly useBlockcypher: boolean;
  private readonly blockstreamUrl = BLOCKCHAIN_API_URLS.bitcoin.blockstream;
  private readonly blockcypherUrl = BLOCKCHAIN_API_URLS.bitcoin.blockcypher;

  constructor(config: BitcoinProviderConfig, allowedDomains?: string[]) {
    super(config, allowedDomains ?? ['blockstream.info', 'api.blockcypher.com']);
    this.useBlockcypher = config.useBlockcypher ?? false;
  }

  get name(): string {
    return 'bitcoin';
  }

  get type(): string {
    return 'blockchain';
  }

  protected requiresApiKey(): boolean {
    return this.useBlockcypher; // Blockcypher needs API key for higher limits
  }

  /**
   * Get BTC balance for an address
   */
  async getBalance(address: string): Promise<FinanceProviderResult<WalletBalance>> {
    this.ensureInitialized();

    if (this.useBlockcypher) {
      return this.getBalanceBlockcypher(address);
    }
    return this.getBalanceBlockstream(address);
  }

  private async getBalanceBlockstream(
    address: string
  ): Promise<FinanceProviderResult<WalletBalance>> {
    const result = await this.fetch<BlockstreamAddressInfo>(
      `${this.blockstreamUrl}/address/${address}`
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

    const chain = result.data.chain_stats;
    const mempool = result.data.mempool_stats;

    // Balance = funded - spent (in satoshis)
    const confirmedBalance =
      (chain.funded_txo_sum - chain.spent_txo_sum) / 100_000_000;
    const unconfirmedBalance =
      (mempool.funded_txo_sum - mempool.spent_txo_sum) / 100_000_000;

    return {
      success: true,
      data: {
        token: 'Bitcoin',
        symbol: 'BTC',
        balance: confirmedBalance + unconfirmedBalance,
        decimals: 8,
        usdValue: 0, // Would need price lookup
        isNative: true,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  private async getBalanceBlockcypher(
    address: string
  ): Promise<FinanceProviderResult<WalletBalance>> {
    const url = this.apiKey
      ? `${this.blockcypherUrl}/addrs/${address}/balance?token=${this.apiKey}`
      : `${this.blockcypherUrl}/addrs/${address}/balance`;

    const result = await this.fetch<BlockcypherAddressInfo>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    return {
      success: true,
      data: {
        token: 'Bitcoin',
        symbol: 'BTC',
        balance: result.data.final_balance / 100_000_000,
        decimals: 8,
        usdValue: 0,
        isNative: true,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get token balances (just BTC for Bitcoin)
   */
  async getTokenBalances(address: string): Promise<FinanceProviderResult<WalletBalance[]>> {
    const result = await this.getBalance(address);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    return {
      success: true,
      data: result.data.balance > 0 ? [result.data] : [],
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get transaction history for an address
   */
  async getTransactions(
    address: string,
    limit: number = 50
  ): Promise<FinanceProviderResult<WalletTransaction[]>> {
    this.ensureInitialized();

    if (this.useBlockcypher) {
      return this.getTransactionsBlockcypher(address, limit);
    }
    return this.getTransactionsBlockstream(address, limit);
  }

  private async getTransactionsBlockstream(
    address: string,
    limit: number
  ): Promise<FinanceProviderResult<WalletTransaction[]>> {
    const result = await this.fetch<BlockstreamTx[]>(
      `${this.blockstreamUrl}/address/${address}/txs`
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

    const transactions: WalletTransaction[] = result.data.slice(0, limit).map(tx => {
      // Determine if this is incoming or outgoing
      const isIncoming = tx.vout.some(vout => vout.scriptpubkey_address === address);
      const isOutgoing = tx.vin.some(vin => vin.prevout?.scriptpubkey_address === address);

      // Calculate value for this address
      let value = 0;
      if (isIncoming) {
        value = tx.vout
          .filter(vout => vout.scriptpubkey_address === address)
          .reduce((sum, vout) => sum + vout.value, 0);
      }
      if (isOutgoing) {
        value = tx.vin
          .filter(vin => vin.prevout?.scriptpubkey_address === address)
          .reduce((sum, vin) => sum + vin.prevout.value, 0);
      }

      // Get sender/receiver
      const from = isOutgoing ? address : tx.vin[0]?.prevout?.scriptpubkey_address ?? 'unknown';
      const to = isIncoming ? address : tx.vout[0]?.scriptpubkey_address ?? 'unknown';

      return {
        hash: tx.txid,
        network: 'bitcoin' as BlockchainNetwork,
        from,
        to,
        value: value / 100_000_000,
        status: tx.status.confirmed ? 'confirmed' : 'pending',
        blockNumber: tx.status.block_height,
        timestamp: tx.status.block_time ? tx.status.block_time * 1000 : Date.now(),
        type: 'transfer' as const,
      };
    });

    return {
      success: true,
      data: transactions,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  private async getTransactionsBlockcypher(
    address: string,
    limit: number
  ): Promise<FinanceProviderResult<WalletTransaction[]>> {
    const url = this.apiKey
      ? `${this.blockcypherUrl}/addrs/${address}?limit=${limit}&token=${this.apiKey}`
      : `${this.blockcypherUrl}/addrs/${address}?limit=${limit}`;

    const result = await this.fetch<BlockcypherAddressInfo>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const transactions: WalletTransaction[] = (result.data.txrefs ?? []).map(txref => ({
      hash: txref.tx_hash,
      network: 'bitcoin' as BlockchainNetwork,
      from: txref.tx_input_n >= 0 ? address : 'unknown',
      to: txref.tx_output_n >= 0 ? address : 'unknown',
      value: txref.value / 100_000_000,
      status: txref.confirmations > 0 ? 'confirmed' : 'pending',
      blockNumber: txref.block_height,
      timestamp: new Date(txref.confirmed).getTime(),
      type: 'transfer' as const,
    }));

    return {
      success: true,
      data: transactions,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Validate a Bitcoin address
   */
  isValidAddress(address: string): boolean {
    // Legacy address (starts with 1)
    if (/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) {
      return true;
    }
    // P2SH address (starts with 3)
    if (/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) {
      return true;
    }
    // Bech32 address (starts with bc1)
    if (/^bc1[a-z0-9]{39,59}$/i.test(address)) {
      return true;
    }
    return false;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createBitcoinProvider(
  config: BitcoinProviderConfig,
  allowedDomains?: string[]
): BitcoinProvider {
  return new BitcoinProvider(config, allowedDomains);
}
