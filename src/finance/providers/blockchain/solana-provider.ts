/**
 * Solana Blockchain Provider
 *
 * Provides integration with Solana network for wallet monitoring.
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

export interface SolanaProviderConfig extends FinanceProviderConfig {
  rpcUrlEnvVar?: string;
  network?: 'mainnet-beta' | 'devnet' | 'testnet';
}

interface SolanaRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result: T;
  error?: {
    code: number;
    message: string;
  };
}

interface SolanaBalanceResult {
  context: { slot: number };
  value: number;
}

interface SolanaTokenAccountResult {
  context: { slot: number };
  value: Array<{
    account: {
      data: {
        parsed: {
          info: {
            mint: string;
            owner: string;
            tokenAmount: {
              amount: string;
              decimals: number;
              uiAmount: number;
              uiAmountString: string;
            };
          };
          type: string;
        };
        program: string;
        space: number;
      };
      lamports: number;
    };
    pubkey: string;
  }>;
}

interface SolanaSignatureResult {
  blockTime: number | null;
  confirmationStatus: string;
  err: null | object;
  memo: string | null;
  signature: string;
  slot: number;
}

interface SolanaTransactionResult {
  blockTime: number | null;
  meta: {
    err: null | object;
    fee: number;
    postBalances: number[];
    preBalances: number[];
    postTokenBalances?: Array<{
      accountIndex: number;
      mint: string;
      uiTokenAmount: {
        amount: string;
        decimals: number;
        uiAmount: number;
      };
    }>;
    preTokenBalances?: Array<{
      accountIndex: number;
      mint: string;
      uiTokenAmount: {
        amount: string;
        decimals: number;
        uiAmount: number;
      };
    }>;
  };
  slot: number;
  transaction: {
    message: {
      accountKeys: string[];
      instructions: Array<{
        programIdIndex: number;
        accounts: number[];
        data: string;
      }>;
    };
    signatures: string[];
  };
}

// Known token mints
const TOKEN_INFO: Record<string, { symbol: string; name: string; decimals: number }> = {
  'So11111111111111111111111111111111111111112': { symbol: 'SOL', name: 'Wrapped SOL', decimals: 9 },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether', decimals: 6 },
};

// =============================================================================
// Provider Implementation
// =============================================================================

export class SolanaProvider extends BaseFinanceProvider<SolanaProviderConfig> {
  private readonly rpcUrl: string;

  constructor(config: SolanaProviderConfig, allowedDomains?: string[]) {
    super(config, allowedDomains ?? ['api.mainnet-beta.solana.com', 'api.devnet.solana.com']);

    const customRpc = config.rpcUrlEnvVar ? process.env[config.rpcUrlEnvVar] : undefined;
    const network = config.network ?? 'mainnet-beta';

    this.rpcUrl = customRpc ?? (
      network === 'mainnet-beta'
        ? BLOCKCHAIN_API_URLS.solana.mainnet
        : BLOCKCHAIN_API_URLS.solana.devnet
    );
  }

  get name(): string {
    return 'solana';
  }

  get type(): string {
    return 'blockchain';
  }

  protected requiresApiKey(): boolean {
    return false; // Public RPC endpoints available
  }

  /**
   * Make RPC request to Solana
   */
  private async rpcRequest<T>(method: string, params: unknown[]): Promise<FinanceProviderResult<T>> {
    const result = await this.fetch<SolanaRpcResponse<T>>(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
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

    if (result.data.error) {
      return {
        success: false,
        error: result.data.error.message,
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
   * Get SOL balance for an address
   */
  async getBalance(address: string): Promise<FinanceProviderResult<WalletBalance>> {
    this.ensureInitialized();

    const result = await this.rpcRequest<SolanaBalanceResult>('getBalance', [address]);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    // Balance is in lamports (1 SOL = 1e9 lamports)
    const balance = result.data.value / 1_000_000_000;

    return {
      success: true,
      data: {
        token: 'Solana',
        symbol: 'SOL',
        balance,
        decimals: 9,
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

    const balances: WalletBalance[] = [];

    // Get SOL balance
    const solResult = await this.getBalance(address);
    if (solResult.success && solResult.data && solResult.data.balance > 0) {
      balances.push(solResult.data);
    }

    // Get SPL token accounts
    const tokenResult = await this.rpcRequest<SolanaTokenAccountResult>(
      'getTokenAccountsByOwner',
      [
        address,
        { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
        { encoding: 'jsonParsed' },
      ]
    );

    if (tokenResult.success && tokenResult.data) {
      for (const account of tokenResult.data.value) {
        const info = account.account.data.parsed.info;
        const tokenInfo = TOKEN_INFO[info.mint];

        if (info.tokenAmount.uiAmount > 0) {
          balances.push({
            token: tokenInfo?.name ?? info.mint.slice(0, 8),
            symbol: tokenInfo?.symbol ?? 'SPL',
            balance: info.tokenAmount.uiAmount,
            decimals: info.tokenAmount.decimals,
            usdValue: 0,
            contractAddress: info.mint,
            isNative: false,
          });
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

    // Get recent signatures
    const sigResult = await this.rpcRequest<SolanaSignatureResult[]>(
      'getSignaturesForAddress',
      [address, { limit }]
    );

    if (!sigResult.success || !sigResult.data) {
      return {
        success: false,
        error: sigResult.error,
        errorCode: sigResult.errorCode,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const transactions: WalletTransaction[] = [];

    // Get details for each transaction (limit to avoid rate limits)
    const signaturesLimit = Math.min(sigResult.data.length, 20);

    for (let i = 0; i < signaturesLimit; i++) {
      const sig = sigResult.data[i];

      const txResult = await this.rpcRequest<SolanaTransactionResult | null>(
        'getTransaction',
        [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
      );

      if (!txResult.success || !txResult.data) {
        continue;
      }

      const tx = txResult.data;
      const accountKeys = tx.transaction.message.accountKeys;
      const addressIndex = accountKeys.indexOf(address);

      // Calculate value change for the address
      let value = 0;
      if (addressIndex >= 0 && tx.meta) {
        const preBalance = tx.meta.preBalances[addressIndex] ?? 0;
        const postBalance = tx.meta.postBalances[addressIndex] ?? 0;
        value = (postBalance - preBalance) / 1_000_000_000;
      }

      // Determine from/to
      const from = value < 0 ? address : accountKeys[0];
      const to = value > 0 ? address : accountKeys[accountKeys.length - 1] ?? address;

      transactions.push({
        hash: sig.signature,
        network: 'solana' as BlockchainNetwork,
        from,
        to,
        value: Math.abs(value),
        gasCostUsd: 0,
        status: tx.meta?.err ? 'failed' : 'confirmed',
        blockNumber: tx.slot,
        timestamp: (tx.blockTime ?? 0) * 1000,
        type: 'transfer',
      });
    }

    return {
      success: true,
      data: transactions,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Validate a Solana address
   */
  isValidAddress(address: string): boolean {
    // Base58 encoded, 32-44 characters
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createSolanaProvider(
  config: SolanaProviderConfig,
  allowedDomains?: string[]
): SolanaProvider {
  return new SolanaProvider(config, allowedDomains);
}
