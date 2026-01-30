/**
 * Finance Stores Index
 *
 * Re-exports all store interfaces, implementations, and factory functions.
 */

// Trade Store
export {
  type TradeStore,
  type DatabaseAdapter,
  DatabaseTradeStore,
  InMemoryTradeStore,
  createTradeStore,
} from './trade-store.js';

// Portfolio Store
export {
  type PortfolioStore,
  DatabasePortfolioStore,
  InMemoryPortfolioStore,
  createPortfolioStore,
} from './portfolio-store.js';

// Wallet Store
export {
  type WalletStore,
  DatabaseWalletStore,
  InMemoryWalletStore,
  createWalletStore,
} from './wallet-store.js';

// Pattern Store
export {
  type PatternStore,
  DatabasePatternStore,
  InMemoryPatternStore,
  createPatternStore,
} from './pattern-store.js';

// Invoice Store
export {
  type InvoiceStore,
  DatabaseInvoiceStore,
  InMemoryInvoiceStore,
  createInvoiceStore,
} from './invoice-store.js';
