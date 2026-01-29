/**
 * Savings Stores
 *
 * Re-exports all store interfaces and implementations.
 */

// Expense Store
export {
  type ExpenseStore,
  DatabaseExpenseStore,
  InMemoryExpenseStore,
  createExpenseStore,
} from './expense-store.js';

// Subscription Store
export {
  type SubscriptionStore,
  DatabaseSubscriptionStore,
  InMemorySubscriptionStore,
  createSubscriptionStore,
} from './subscription-store.js';

// Price Alert Store
export {
  type PriceAlertStore,
  DatabasePriceAlertStore,
  InMemoryPriceAlertStore,
  createPriceAlertStore,
} from './price-alert-store.js';

// Insurance Claim Store
export {
  type InsuranceClaimStore,
  type EncryptionService,
  DatabaseInsuranceClaimStore,
  InMemoryInsuranceClaimStore,
  createInsuranceClaimStore,
} from './insurance-claim-store.js';

// Negotiation Store
export {
  type NegotiationStore,
  DatabaseNegotiationStore,
  InMemoryNegotiationStore,
  createNegotiationStore,
} from './negotiation-store.js';

// Bill Store
export {
  type BillStore,
  DatabaseBillStore,
  InMemoryBillStore,
  createBillStore,
} from './bill-store.js';

// Re-export database adapter type
export type { DatabaseAdapter } from './expense-store.js';
