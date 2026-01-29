/**
 * Savings Providers
 *
 * Provider exports for the savings module.
 */

// Base provider and registry
export {
  BaseSavingsProvider,
  SavingsProviderRegistry,
  SavingsProviderError,
  getSavingsProviderRegistry,
  initSavingsProviderRegistry,
} from './base.js';

// Price monitoring providers
export {
  PriceMonitoringProvider,
  GenericPriceProvider,
  AmazonPriceProvider,
  MultiProviderPriceChecker,
  type ProductPrice,
  type PriceCheckResult,
} from './price-monitoring.js';

// Banking providers
export {
  PlaidBankingProvider,
  TransactionAnalyzer,
  type BankingProvider,
  type BankAccount,
  type BankTransaction,
  type Institution,
  type LinkTokenResponse,
  type AccessTokenResponse,
  type LinkOptions,
  type TransactionOptions,
} from './banking.js';

// SMS 2FA bridge provider
export {
  Sms2FABridgeProvider,
  MockSmsProvider,
  createSms2FABridge,
  type Sms2FABridgeConfig,
  type SmsProviderType,
  type SmsMessage,
  type CodeExtractionResult,
} from './sms-2fa-bridge.js';

// Insurance providers
export {
  GenericInsuranceProvider,
  InsuranceProviderRegistry,
  createInsuranceProviderRegistry,
  type InsuranceProvider,
  type InsuranceProviderInfo,
  type ClaimSubmissionData,
  type ClaimSubmissionResult,
  type ClaimStatusResult,
} from './insurance.js';

// Email negotiation providers
export {
  BaseEmailProvider,
  MockEmailProvider,
  SmtpEmailProvider,
  SendGridEmailProvider,
  SesEmailProvider,
  EmailTemplateManager,
  createEmailProvider,
  type EmailNegotiationProvider,
  type EmailSendOptions,
  type EmailSendResult,
  type EmailAttachment,
  type EmailProviderType,
  type EmailProviderConfig,
  type EmailTemplate,
} from './email-negotiation.js';
