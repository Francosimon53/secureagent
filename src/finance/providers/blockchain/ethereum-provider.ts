/**
 * Ethereum Blockchain Provider
 *
 * Provides integration with Ethereum and EVM-compatible chains for wallet monitoring.
 */

import { BaseFinanceProvider, type FinanceProviderConfig } from '../base.js';
import type {
  WalletBalance,
  WalletTransaction,
  GasPrice,
  BlockchainNetwork,
  FinanceProviderResult,
} from '../../types.js';
import { BLOCKCHAIN_API_URLS, NATIVE_TOKENS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface EthereumProviderConfig extends FinanceProviderConfig {
  network?: 'mainnet' | 'goerli' | 'sepolia';
  rpcUrlEnvVar?: string;
}

interface EtherscanBalanceResponse {
  status: string;
  message: string;
  result: string;
}

interface EtherscanTokenBalanceResponse {
  status: string;
  result: Array<{
    contractAddress: string;
    tokenName: string;
    tokenSymbol: string;
    tokenDecimal: string;
    balance: string;
  }>;
}

interface EtherscanTxListResponse {
  status: string;
  result: Array<{
    blockNumber: string;
    timeStamp: string;
    hash: string;
    from: string;
    to: string;
    value: string;
    gas: string;
    gasPrice: string;
    gasUsed: string;
    isError: string;
    functionName?: string;
  }>;
}

interface EtherscanGasPriceResponse {
  status: string;
  result: {
    SafeGasPrice: string;
    ProposeGasPrice: string;
    FastGasPrice: string;
    suggestBaseFee: string;
  };
}

interface EtherscanTokenTxResponse {
  status: string;
  result: Array<{
    blockNumber: string;
    timeStamp: string;
    hash: string;
    from: string;
    to: string;
    value: string;
    tokenName: string;
    tokenSymbol: string;
    tokenDecimal: string;
    contractAddress: string;
    gasUsed: string;
    gasPrice: string;
  }>;
}

// =============================================================================
// Provider Implementation
// =============================================================================

export class EthereumProvider extends BaseFinanceProvider<EthereumProviderConfig> {
  private readonly baseUrl: string;
  private readonly network: BlockchainNetwork;

  constructor(config: EthereumProviderConfig, allowedDomains?: string[]) {
    super(config, allowedDomains ?? ['api.etherscan.io']);
    this.baseUrl = BLOCKCHAIN_API_URLS.ethereum.etherscan;
    this.network = 'ethereum';
  }

  get name(): string {
    return 'ethereum';
  }

  get type(): string {
    return 'blockchain';
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  /**
   * Get ETH balance for an address
   */
  async getBalance(address: string): Promise<FinanceProviderResult<WalletBalance>> {
    this.ensureInitialized();

    const result = await this.fetch<EtherscanBalanceResponse>(
      `${this.baseUrl}?module=account&action=balance&address=${address}&tag=latest&apikey=${this.apiKey}`
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

    if (result.data.status !== '1') {
      return {
        success: false,
        error: result.data.message || 'Failed to get balance',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const balance = parseFloat(result.data.result) / Math.pow(10, 18);

    return {
      success: true,
      data: {
        token: 'Ethereum',
        symbol: 'ETH',
        balance,
        decimals: 18,
        usdValue: 0, // Would need price lookup
        isNative: true,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get all token balances for an address
   */
  async getTokenBalances(address: string): Promise<FinanceProviderResult<WalletBalance[]>> {
    this.ensureInitialized();

    // Get ETH balance
    const ethResult = await this.getBalance(address);
    const balances: WalletBalance[] = [];

    if (ethResult.success && ethResult.data && ethResult.data.balance > 0) {
      balances.push(ethResult.data);
    }

    // Get ERC-20 token balances
    const tokenResult = await this.fetch<EtherscanTokenBalanceResponse>(
      `${this.baseUrl}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${this.apiKey}`
    );

    if (tokenResult.success && tokenResult.data?.status === '1') {
      // Get unique tokens from transactions
      const tokenAddresses = new Set<string>();
      const tokenInfo = new Map<string, { name: string; symbol: string; decimals: number }>();

      for (const tx of tokenResult.data.result) {
        if (!tokenAddresses.has(tx.contractAddress)) {
          tokenAddresses.add(tx.contractAddress);
          tokenInfo.set(tx.contractAddress, {
            name: tx.tokenName,
            symbol: tx.tokenSymbol,
            decimals: parseInt(tx.tokenDecimal, 10),
          });
        }
      }

      // Get current balance for each token
      for (const [contractAddress, info] of tokenInfo) {
        const balanceResult = await this.fetch<EtherscanBalanceResponse>(
          `${this.baseUrl}?module=account&action=tokenbalance&contractaddress=${contractAddress}&address=${address}&tag=latest&apikey=${this.apiKey}`
        );

        if (balanceResult.success && balanceResult.data?.status === '1') {
          const balance = parseFloat(balanceResult.data.result) / Math.pow(10, info.decimals);

          if (balance > 0) {
            balances.push({
              token: info.name,
              symbol: info.symbol,
              balance,
              decimals: info.decimals,
              usdValue: 0, // Would need price lookup
              contractAddress,
              isNative: false,
            });
          }
        }
      }
    }

    return {
      success: true,
      data: balances,
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

    // Get normal transactions
    const txResult = await this.fetch<EtherscanTxListResponse>(
      `${this.baseUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc&apikey=${this.apiKey}`
    );

    if (!txResult.success || !txResult.data) {
      return {
        success: false,
        error: txResult.error,
        errorCode: txResult.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const transactions: WalletTransaction[] = [];

    if (txResult.data.status === '1') {
      for (const tx of txResult.data.result) {
        const gasUsed = parseInt(tx.gasUsed, 10);
        const gasPrice = parseInt(tx.gasPrice, 10);
        const gasCostWei = gasUsed * gasPrice;
        const gasCostEth = gasCostWei / Math.pow(10, 18);

        transactions.push({
          hash: tx.hash,
          network: this.network,
          from: tx.from,
          to: tx.to,
          value: parseFloat(tx.value) / Math.pow(10, 18),
          gasUsed,
          gasPrice: gasPrice / Math.pow(10, 9), // Gwei
          gasCostUsd: 0, // Would need ETH price
          status: tx.isError === '0' ? 'confirmed' : 'failed',
          blockNumber: parseInt(tx.blockNumber, 10),
          timestamp: parseInt(tx.timeStamp, 10) * 1000,
          type: tx.functionName ? 'contract' : 'transfer',
          method: tx.functionName?.split('(')[0],
        });
      }
    }

    // Also get token transfers
    const tokenTxResult = await this.fetch<EtherscanTokenTxResponse>(
      `${this.baseUrl}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc&apikey=${this.apiKey}`
    );

    if (tokenTxResult.success && tokenTxResult.data?.status === '1') {
      for (const tx of tokenTxResult.data.result) {
        const decimals = parseInt(tx.tokenDecimal, 10);

        transactions.push({
          hash: tx.hash,
          network: this.network,
          from: tx.from,
          to: tx.to,
          value: parseFloat(tx.value) / Math.pow(10, decimals),
          tokenSymbol: tx.tokenSymbol,
          tokenAddress: tx.contractAddress,
          gasUsed: parseInt(tx.gasUsed, 10),
          gasPrice: parseInt(tx.gasPrice, 10) / Math.pow(10, 9),
          status: 'confirmed',
          timestamp: parseInt(tx.timeStamp, 10) * 1000,
          type: 'transfer',
        });
      }
    }

    // Sort by timestamp and deduplicate
    const seen = new Set<string>();
    const uniqueTxs = transactions
      .filter(tx => {
        if (seen.has(tx.hash)) return false;
        seen.add(tx.hash);
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    return {
      success: true,
      data: uniqueTxs,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get current gas prices
   */
  async getGasPrices(): Promise<FinanceProviderResult<GasPrice>> {
    this.ensureInitialized();

    const result = await this.fetch<EtherscanGasPriceResponse>(
      `${this.baseUrl}?module=gastracker&action=gasoracle&apikey=${this.apiKey}`
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

    if (result.data.status !== '1') {
      return {
        success: false,
        error: 'Failed to get gas prices',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const data = result.data.result;

    return {
      success: true,
      data: {
        network: this.network,
        slow: {
          gwei: parseFloat(data.SafeGasPrice),
          estimatedSeconds: 180,
        },
        standard: {
          gwei: parseFloat(data.ProposeGasPrice),
          estimatedSeconds: 60,
        },
        fast: {
          gwei: parseFloat(data.FastGasPrice),
          estimatedSeconds: 15,
        },
        instant: {
          gwei: parseFloat(data.FastGasPrice) * 1.2,
          estimatedSeconds: 5,
        },
        baseFee: parseFloat(data.suggestBaseFee),
        timestamp: Date.now(),
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Validate an Ethereum address
   */
  isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createEthereumProvider(
  config: EthereumProviderConfig,
  allowedDomains?: string[]
): EthereumProvider {
  return new EthereumProvider(config, allowedDomains);
}
