/**
 * Shopping Automation Service
 *
 * Manages automated shopping sessions with secure 2FA handling.
 */

import type {
  ShoppingSession,
  ShoppingStatus,
  CartItem,
  PaymentInfo,
  ShippingInfo,
  ShoppingServiceConfig,
} from '../types.js';
import type { SavingsConfig } from '../config.js';
import {
  TwoFactorSessionManager,
  type TwoFactorSession,
  type TwoFactorMethod,
  type TwoFactorConsent,
  maskPhoneNumber,
  maskEmail,
  getPhoneLastFour,
} from './2fa-session.js';
import {
  CheckoutHandler,
  type CheckoutFlow,
  type CheckoutState,
  type CheckoutStep,
  type CheckoutResult,
} from './checkout-handler.js';

export {
  TwoFactorSessionManager,
  type TwoFactorSession,
  type TwoFactorMethod,
  type TwoFactorConsent,
  maskPhoneNumber,
  maskEmail,
  getPhoneLastFour,
} from './2fa-session.js';

export {
  CheckoutHandler,
  type CheckoutFlow,
  type CheckoutState,
  type CheckoutStep,
  type CheckoutResult,
} from './checkout-handler.js';

/**
 * Shopping session store interface
 */
export interface ShoppingSessionStore {
  create(session: Omit<ShoppingSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<ShoppingSession>;
  get(sessionId: string): Promise<ShoppingSession | null>;
  update(sessionId: string, updates: Partial<ShoppingSession>): Promise<ShoppingSession | null>;
  delete(sessionId: string): Promise<boolean>;
  list(userId: string, options?: {
    status?: ShoppingStatus[];
    limit?: number;
  }): Promise<ShoppingSession[]>;
}

/**
 * Shopping automation service configuration
 */
export interface ShoppingAutomationConfig {
  enabled: boolean;
  sessionTimeoutMinutes: number;
  require2FAConsent: boolean;
  maxConcurrentSessions: number;
  allowedRetailers?: string[];
  blockedRetailers?: string[];
}

/**
 * Shopping automation service
 */
export class ShoppingAutomationService {
  private readonly config: ShoppingAutomationConfig;
  private readonly twoFactorManager: TwoFactorSessionManager;
  private readonly checkoutHandler: CheckoutHandler;
  private sessions: Map<string, ShoppingSession> = new Map();

  constructor(config?: Partial<ShoppingServiceConfig>) {
    this.config = {
      enabled: config?.enabled ?? true,
      sessionTimeoutMinutes: 30,
      require2FAConsent: config?.sms2faBridge?.requireExplicitConsent ?? true,
      maxConcurrentSessions: 3,
      allowedRetailers: undefined,
      blockedRetailers: undefined,
    };

    this.twoFactorManager = new TwoFactorSessionManager({
      sessionTimeoutSeconds: config?.sms2faBridge?.sessionTimeoutSeconds ?? 300,
      requireExplicitConsent: this.config.require2FAConsent,
    });

    this.checkoutHandler = new CheckoutHandler();
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  /**
   * Create a new shopping session
   */
  async createSession(
    userId: string,
    retailer: string,
    items: CartItem[]
  ): Promise<ShoppingSession | { error: string }> {
    if (!this.config.enabled) {
      return { error: 'Shopping automation is disabled' };
    }

    // Check if retailer is allowed
    if (!this.isRetailerAllowed(retailer)) {
      return { error: `Shopping at ${retailer} is not allowed` };
    }

    // Check concurrent session limit
    const activeSessions = Array.from(this.sessions.values())
      .filter(s => s.userId === userId && s.status !== 'completed' && s.status !== 'cancelled');

    if (activeSessions.length >= this.config.maxConcurrentSessions) {
      return { error: 'Maximum concurrent shopping sessions reached' };
    }

    const checkoutFlow = this.checkoutHandler.getCheckoutFlow(retailer);

    const session: ShoppingSession = {
      id: crypto.randomUUID(),
      userId,
      retailer,
      retailerUrl: '',
      items,
      status: 'cart_ready',
      requires2FA: checkoutFlow?.requires2FA ?? false,
      totalAmount: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Get a shopping session
   */
  async getSession(sessionId: string): Promise<ShoppingSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Update session status
   */
  async updateSessionStatus(
    sessionId: string,
    status: ShoppingStatus
  ): Promise<ShoppingSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.status = status;
    session.updatedAt = Date.now();
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Update cart items
   */
  async updateCartItems(
    sessionId: string,
    items: CartItem[]
  ): Promise<ShoppingSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.items = items;
    session.updatedAt = Date.now();
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Cancel a session
   */
  async cancelSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.status = 'cancelled';
    session.updatedAt = Date.now();
    this.sessions.set(sessionId, session);

    // Cancel any 2FA sessions
    const tfaSessions = this.twoFactorManager.getSessionsForShoppingSession(sessionId);
    for (const tfaSession of tfaSessions) {
      this.twoFactorManager.cancelSession(tfaSession.id);
    }

    // Cancel checkout
    this.checkoutHandler.cancelCheckout(sessionId);

    return true;
  }

  /**
   * List sessions for a user
   */
  async listSessions(
    userId: string,
    options?: { status?: ShoppingStatus[]; limit?: number }
  ): Promise<ShoppingSession[]> {
    let sessions = Array.from(this.sessions.values())
      .filter(s => s.userId === userId);

    if (options?.status) {
      sessions = sessions.filter(s => options.status!.includes(s.status));
    }

    sessions.sort((a, b) => b.updatedAt - a.updatedAt);

    if (options?.limit) {
      sessions = sessions.slice(0, options.limit);
    }

    return sessions;
  }

  // ==========================================================================
  // 2FA Operations
  // ==========================================================================

  /**
   * Grant consent for 2FA
   */
  grant2FAConsent(userId: string, methods: TwoFactorMethod[]): TwoFactorConsent {
    return this.twoFactorManager.grantConsent(userId, methods);
  }

  /**
   * Revoke 2FA consent
   */
  revoke2FAConsent(userId: string): void {
    this.twoFactorManager.revokeConsent(userId);
  }

  /**
   * Check if user has 2FA consent
   */
  has2FAConsent(userId: string, method?: TwoFactorMethod): boolean {
    return this.twoFactorManager.hasConsent(userId, method);
  }

  /**
   * Start 2FA verification for a session
   */
  async start2FAVerification(
    sessionId: string,
    method: TwoFactorMethod,
    contact: { phone?: string; email?: string }
  ): Promise<TwoFactorSession | { error: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { error: 'Shopping session not found' };
    }

    if (!session.requires2FA) {
      return { error: 'This session does not require 2FA' };
    }

    const contactInfo = method === 'sms' && contact.phone
      ? { phoneLastFour: getPhoneLastFour(contact.phone) }
      : method === 'email' && contact.email
        ? { emailMasked: maskEmail(contact.email) }
        : {};

    const result = this.twoFactorManager.createSession(
      sessionId,
      session.userId,
      method,
      contactInfo
    );

    if ('error' in result) {
      return result;
    }

    // Update session
    session.twoFactorMethod = method;
    session.status = 'awaiting_2fa';
    session.updatedAt = Date.now();
    this.sessions.set(sessionId, session);

    return result;
  }

  /**
   * Submit 2FA code
   */
  async submit2FACode(
    tfaSessionId: string,
    code: string
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.twoFactorManager.submitCode(tfaSessionId, code);

    if (result.success) {
      // Find and update the shopping session
      const tfaSession = this.twoFactorManager.getSession(tfaSessionId);
      if (tfaSession) {
        const shoppingSession = this.sessions.get(tfaSession.shoppingSessionId);
        if (shoppingSession) {
          shoppingSession.status = 'checkout';
          shoppingSession.updatedAt = Date.now();
          this.sessions.set(shoppingSession.id, shoppingSession);
        }
      }
    }

    return result;
  }

  /**
   * Get 2FA session status
   */
  get2FASession(tfaSessionId: string): TwoFactorSession | null {
    return this.twoFactorManager.getSession(tfaSessionId);
  }

  /**
   * Get 2FA audit log for a user
   */
  get2FAAuditLog(userId: string, limit?: number): Array<{
    timestamp: number;
    action: string;
    details: Record<string, unknown>;
  }> {
    return this.twoFactorManager.getAuditLog(userId, limit);
  }

  // ==========================================================================
  // Checkout Operations
  // ==========================================================================

  /**
   * Start checkout process
   */
  async startCheckout(sessionId: string): Promise<CheckoutState | { error: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { error: 'Shopping session not found' };
    }

    // Validate cart
    const validation = this.checkoutHandler.validateCart(session.items);
    if (!validation.valid) {
      return { error: `Cart validation failed: ${validation.errors.join(', ')}` };
    }

    // Check if 2FA is required and verified
    if (session.requires2FA && session.status !== 'checkout') {
      const tfaSessions = this.twoFactorManager.getSessionsForShoppingSession(sessionId);
      const verified = tfaSessions.some(s => s.status === 'verified');

      if (!verified) {
        return { error: '2FA verification required before checkout' };
      }
    }

    session.status = 'checkout';
    session.updatedAt = Date.now();
    this.sessions.set(sessionId, session);

    return this.checkoutHandler.startCheckout(session);
  }

  /**
   * Get checkout state
   */
  getCheckoutState(sessionId: string): CheckoutState | null {
    return this.checkoutHandler.getState(sessionId);
  }

  /**
   * Advance checkout step
   */
  advanceCheckoutStep(
    sessionId: string,
    stepData?: Record<string, unknown>
  ): CheckoutState | { error: string } {
    return this.checkoutHandler.advanceStep(sessionId, stepData);
  }

  /**
   * Set shipping info
   */
  async setShippingInfo(
    sessionId: string,
    shippingInfo: ShippingInfo
  ): Promise<{ valid: boolean; errors: string[] }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { valid: false, errors: ['Session not found'] };
    }

    const validation = this.checkoutHandler.validateShippingInfo(shippingInfo);
    if (validation.valid) {
      session.shippingInfo = shippingInfo;
      session.updatedAt = Date.now();
      this.sessions.set(sessionId, session);
    }

    return validation;
  }

  /**
   * Set payment info (validated only - never stored in full)
   */
  async setPaymentInfo(
    sessionId: string,
    paymentInfo: PaymentInfo
  ): Promise<{ valid: boolean; errors: string[] }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { valid: false, errors: ['Session not found'] };
    }

    const validation = this.checkoutHandler.validatePaymentInfo(paymentInfo);
    if (validation.valid) {
      // Only store reference info, not full card details
      session.paymentInfo = {
        type: paymentInfo.type,
        cardLastFour: paymentInfo.cardLastFour,
        expiryMonth: paymentInfo.expiryMonth,
        expiryYear: paymentInfo.expiryYear,
        billingAddress: paymentInfo.billingAddress,
      };
      session.updatedAt = Date.now();
      this.sessions.set(sessionId, session);
    }

    return validation;
  }

  /**
   * Calculate order totals
   */
  calculateTotals(
    sessionId: string,
    shippingCost: number = 0,
    taxRate: number = 0
  ): {
    subtotal: number;
    shipping: number;
    tax: number;
    total: number;
    savings: number;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return this.checkoutHandler.calculateTotals(session.items, shippingCost, taxRate);
  }

  /**
   * Generate order summary
   */
  generateOrderSummary(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const totals = this.checkoutHandler.calculateTotals(session.items);
    return this.checkoutHandler.generateOrderSummary(session, totals);
  }

  /**
   * Complete checkout
   */
  async completeCheckout(sessionId: string): Promise<CheckoutResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        success: false,
        errors: [{
          step: 'confirmation',
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found',
          recoverable: false,
          timestamp: Date.now(),
        }],
      };
    }

    const result = this.checkoutHandler.completeCheckout(sessionId);

    if (result.success) {
      session.status = 'completed';
      session.updatedAt = Date.now();
      this.sessions.set(sessionId, session);
    }

    return result;
  }

  /**
   * Get checkout progress
   */
  getCheckoutProgress(sessionId: string): number {
    return this.checkoutHandler.getProgress(sessionId);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Check if a retailer is allowed
   */
  private isRetailerAllowed(retailer: string): boolean {
    const normalized = retailer.toLowerCase();

    if (this.config.blockedRetailers) {
      for (const blocked of this.config.blockedRetailers) {
        if (normalized.includes(blocked.toLowerCase())) {
          return false;
        }
      }
    }

    if (this.config.allowedRetailers) {
      for (const allowed of this.config.allowedRetailers) {
        if (normalized.includes(allowed.toLowerCase())) {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  /**
   * Get checkout flow info for a retailer
   */
  getCheckoutFlowInfo(retailer: string): CheckoutFlow | null {
    return this.checkoutHandler.getCheckoutFlow(retailer);
  }

  /**
   * Get service statistics
   */
  getStats(): {
    activeSessions: number;
    completedSessions: number;
    twoFactorStats: {
      activeSessions: number;
      verifiedSessions: number;
      failedSessions: number;
    };
  } {
    const sessions = Array.from(this.sessions.values());

    return {
      activeSessions: sessions.filter(s =>
        s.status !== 'completed' && s.status !== 'cancelled'
      ).length,
      completedSessions: sessions.filter(s => s.status === 'completed').length,
      twoFactorStats: this.twoFactorManager.getStats(),
    };
  }

  /**
   * Cleanup stale sessions
   */
  cleanupStaleSessions(): number {
    const staleThreshold = this.config.sessionTimeoutMinutes * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      if (
        session.status !== 'completed' &&
        session.status !== 'cancelled' &&
        now - session.updatedAt > staleThreshold
      ) {
        session.status = 'cancelled';
        session.updatedAt = now;
        this.sessions.set(sessionId, session);
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * Factory function to create shopping automation service
 */
export function createShoppingAutomationService(
  config?: Partial<SavingsConfig>
): ShoppingAutomationService {
  return new ShoppingAutomationService(config?.shopping);
}
