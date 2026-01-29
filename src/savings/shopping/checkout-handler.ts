/**
 * Checkout Handler
 *
 * Handles automated checkout flows for shopping automation.
 */

import type {
  ShoppingSession,
  ShoppingStatus,
  CartItem,
  PaymentInfo,
  ShippingInfo,
} from '../types.js';

/**
 * Checkout step
 */
export type CheckoutStep =
  | 'cart-review'
  | 'shipping-info'
  | 'shipping-method'
  | 'payment-info'
  | '2fa-verification'
  | 'order-review'
  | 'confirmation'
  | 'complete';

/**
 * Checkout flow definition
 */
export interface CheckoutFlow {
  retailer: string;
  steps: CheckoutStep[];
  requires2FA: boolean;
  supports: {
    guestCheckout: boolean;
    savedPayment: boolean;
    expressCheckout: boolean;
    applePay: boolean;
    googlePay: boolean;
  };
  estimatedSeconds: number;
}

/**
 * Checkout state
 */
export interface CheckoutState {
  sessionId: string;
  currentStep: CheckoutStep;
  completedSteps: CheckoutStep[];
  stepData: Map<CheckoutStep, StepData>;
  errors: CheckoutError[];
  startedAt: number;
  lastActivityAt: number;
}

/**
 * Step data
 */
export interface StepData {
  enteredAt: number;
  completedAt?: number;
  data?: Record<string, unknown>;
  validationErrors?: string[];
}

/**
 * Checkout error
 */
export interface CheckoutError {
  step: CheckoutStep;
  code: string;
  message: string;
  recoverable: boolean;
  timestamp: number;
}

/**
 * Checkout result
 */
export interface CheckoutResult {
  success: boolean;
  orderId?: string;
  orderTotal?: number;
  confirmationNumber?: string;
  estimatedDelivery?: string;
  errors?: CheckoutError[];
}

/**
 * Known retailer checkout flows
 */
const KNOWN_CHECKOUT_FLOWS: Map<string, CheckoutFlow> = new Map([
  ['amazon', {
    retailer: 'Amazon',
    steps: ['cart-review', 'shipping-method', 'payment-info', 'order-review', 'confirmation'],
    requires2FA: true,
    supports: {
      guestCheckout: false,
      savedPayment: true,
      expressCheckout: true,
      applePay: false,
      googlePay: false,
    },
    estimatedSeconds: 60,
  }],
  ['walmart', {
    retailer: 'Walmart',
    steps: ['cart-review', 'shipping-info', 'shipping-method', 'payment-info', 'order-review', 'confirmation'],
    requires2FA: false,
    supports: {
      guestCheckout: true,
      savedPayment: true,
      expressCheckout: true,
      applePay: true,
      googlePay: true,
    },
    estimatedSeconds: 90,
  }],
  ['target', {
    retailer: 'Target',
    steps: ['cart-review', 'shipping-info', 'shipping-method', 'payment-info', 'order-review', 'confirmation'],
    requires2FA: false,
    supports: {
      guestCheckout: true,
      savedPayment: true,
      expressCheckout: true,
      applePay: true,
      googlePay: true,
    },
    estimatedSeconds: 90,
  }],
  ['bestbuy', {
    retailer: 'Best Buy',
    steps: ['cart-review', 'shipping-info', 'payment-info', '2fa-verification', 'order-review', 'confirmation'],
    requires2FA: true,
    supports: {
      guestCheckout: true,
      savedPayment: true,
      expressCheckout: false,
      applePay: true,
      googlePay: true,
    },
    estimatedSeconds: 120,
  }],
]);

/**
 * Checkout handler class
 */
export class CheckoutHandler {
  private states: Map<string, CheckoutState> = new Map();

  /**
   * Get checkout flow for a retailer
   */
  getCheckoutFlow(retailer: string): CheckoutFlow | null {
    const normalized = this.normalizeRetailerName(retailer);

    for (const [key, flow] of KNOWN_CHECKOUT_FLOWS) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return flow;
      }
    }

    // Return generic flow
    return {
      retailer,
      steps: ['cart-review', 'shipping-info', 'shipping-method', 'payment-info', 'order-review', 'confirmation'],
      requires2FA: false,
      supports: {
        guestCheckout: true,
        savedPayment: false,
        expressCheckout: false,
        applePay: false,
        googlePay: false,
      },
      estimatedSeconds: 120,
    };
  }

  /**
   * Start a checkout flow
   */
  startCheckout(session: ShoppingSession): CheckoutState {
    const flow = this.getCheckoutFlow(session.retailer);

    const state: CheckoutState = {
      sessionId: session.id,
      currentStep: flow?.steps[0] ?? 'cart-review',
      completedSteps: [],
      stepData: new Map(),
      errors: [],
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.states.set(session.id, state);
    return state;
  }

  /**
   * Get current checkout state
   */
  getState(sessionId: string): CheckoutState | null {
    return this.states.get(sessionId) ?? null;
  }

  /**
   * Advance to next step
   */
  advanceStep(
    sessionId: string,
    stepData?: Record<string, unknown>
  ): CheckoutState | { error: string } {
    const state = this.states.get(sessionId);
    if (!state) {
      return { error: 'Checkout session not found' };
    }

    // Record completion of current step
    const currentStepData = state.stepData.get(state.currentStep) ?? {
      enteredAt: Date.now(),
    };
    currentStepData.completedAt = Date.now();
    currentStepData.data = stepData;
    state.stepData.set(state.currentStep, currentStepData);
    state.completedSteps.push(state.currentStep);

    // Get next step
    const flow = this.getCheckoutFlowForSession(sessionId);
    if (!flow) {
      return { error: 'Unable to determine checkout flow' };
    }

    const currentIndex = flow.steps.indexOf(state.currentStep);
    if (currentIndex < flow.steps.length - 1) {
      state.currentStep = flow.steps[currentIndex + 1];
      state.stepData.set(state.currentStep, { enteredAt: Date.now() });
    }

    state.lastActivityAt = Date.now();
    this.states.set(sessionId, state);

    return state;
  }

  /**
   * Go back to previous step
   */
  goBackStep(sessionId: string): CheckoutState | { error: string } {
    const state = this.states.get(sessionId);
    if (!state) {
      return { error: 'Checkout session not found' };
    }

    if (state.completedSteps.length === 0) {
      return { error: 'Already at first step' };
    }

    state.currentStep = state.completedSteps.pop()!;
    state.lastActivityAt = Date.now();
    this.states.set(sessionId, state);

    return state;
  }

  /**
   * Record an error
   */
  recordError(
    sessionId: string,
    error: Omit<CheckoutError, 'timestamp'>
  ): void {
    const state = this.states.get(sessionId);
    if (!state) {
      return;
    }

    state.errors.push({
      ...error,
      timestamp: Date.now(),
    });

    state.lastActivityAt = Date.now();
    this.states.set(sessionId, state);
  }

  /**
   * Validate cart items
   */
  validateCart(items: CartItem[]): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (items.length === 0) {
      errors.push('Cart is empty');
      return { valid: false, errors, warnings };
    }

    for (const item of items) {
      if (item.quantity <= 0) {
        errors.push(`Invalid quantity for ${item.name}`);
      }

      if (item.price <= 0) {
        errors.push(`Invalid price for ${item.name}`);
      }

      if (!item.available) {
        errors.push(`${item.name} is out of stock`);
      }

      if (item.quantity > 10) {
        warnings.push(`High quantity (${item.quantity}) for ${item.name}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate shipping info
   */
  validateShippingInfo(info: ShippingInfo): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!info.name || info.name.trim().length < 2) {
      errors.push('Name is required');
    }

    if (!info.address1 || info.address1.trim().length < 5) {
      errors.push('Address is required');
    }

    if (!info.city || info.city.trim().length < 2) {
      errors.push('City is required');
    }

    if (!info.state || info.state.trim().length < 2) {
      errors.push('State is required');
    }

    if (!info.postalCode || !/^\d{5}(-\d{4})?$/.test(info.postalCode)) {
      errors.push('Valid ZIP code is required');
    }

    if (!info.country) {
      errors.push('Country is required');
    }

    if (info.phone && !/^\+?[\d\s-()]{10,}$/.test(info.phone)) {
      errors.push('Invalid phone number format');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate payment info (basic validation only - no card storage)
   */
  validatePaymentInfo(info: PaymentInfo): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (info.type === 'card') {
      if (!info.cardLastFour || info.cardLastFour.length !== 4) {
        errors.push('Card information is required');
      }

      if (!info.expiryMonth || info.expiryMonth < 1 || info.expiryMonth > 12) {
        errors.push('Valid expiry month is required');
      }

      if (!info.expiryYear || info.expiryYear < new Date().getFullYear()) {
        errors.push('Card has expired');
      }

      // Check if card is expiring soon
      const now = new Date();
      if (
        info.expiryYear === now.getFullYear() &&
        info.expiryMonth !== undefined &&
        info.expiryMonth <= now.getMonth() + 1
      ) {
        errors.push('Card is expired or expiring this month');
      }
    }

    if (!info.billingAddress) {
      errors.push('Billing address is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate order totals
   */
  calculateTotals(
    items: CartItem[],
    shippingCost: number = 0,
    taxRate: number = 0
  ): {
    subtotal: number;
    shipping: number;
    tax: number;
    total: number;
    savings: number;
  } {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const originalTotal = items.reduce(
      (sum, item) => sum + (item.originalPrice ?? item.price) * item.quantity,
      0
    );
    const savings = originalTotal - subtotal;
    const tax = subtotal * taxRate;
    const total = subtotal + shippingCost + tax;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      shipping: Math.round(shippingCost * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100,
      savings: Math.round(savings * 100) / 100,
    };
  }

  /**
   * Generate order summary
   */
  generateOrderSummary(
    session: ShoppingSession,
    totals: ReturnType<typeof this.calculateTotals>
  ): string {
    let summary = `Order Summary for ${session.retailer}\n`;
    summary += '='.repeat(40) + '\n\n';

    summary += 'Items:\n';
    for (const item of session.items) {
      const itemTotal = item.price * item.quantity;
      summary += `  ${item.name} x${item.quantity} - $${itemTotal.toFixed(2)}\n`;
      if (item.originalPrice && item.originalPrice > item.price) {
        const savings = (item.originalPrice - item.price) * item.quantity;
        summary += `    (Save $${savings.toFixed(2)})\n`;
      }
    }

    summary += '\n';
    summary += `Subtotal: $${totals.subtotal.toFixed(2)}\n`;
    summary += `Shipping: $${totals.shipping.toFixed(2)}\n`;
    summary += `Tax: $${totals.tax.toFixed(2)}\n`;
    summary += '-'.repeat(20) + '\n';
    summary += `Total: $${totals.total.toFixed(2)}\n`;

    if (totals.savings > 0) {
      summary += `\nYou saved: $${totals.savings.toFixed(2)}\n`;
    }

    return summary;
  }

  /**
   * Complete checkout
   */
  completeCheckout(sessionId: string): CheckoutResult {
    const state = this.states.get(sessionId);
    if (!state) {
      return {
        success: false,
        errors: [{
          step: 'confirmation',
          code: 'SESSION_NOT_FOUND',
          message: 'Checkout session not found',
          recoverable: false,
          timestamp: Date.now(),
        }],
      };
    }

    // Check for unrecoverable errors
    const criticalErrors = state.errors.filter(e => !e.recoverable);
    if (criticalErrors.length > 0) {
      return {
        success: false,
        errors: criticalErrors,
      };
    }

    // Mark as complete
    state.currentStep = 'complete';
    state.completedSteps.push('confirmation');
    state.lastActivityAt = Date.now();
    this.states.set(sessionId, state);

    // Generate mock confirmation (in real implementation, this would be from retailer)
    return {
      success: true,
      orderId: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      confirmationNumber: Math.random().toString(36).slice(2, 10).toUpperCase(),
    };
  }

  /**
   * Cancel checkout
   */
  cancelCheckout(sessionId: string): void {
    this.states.delete(sessionId);
  }

  /**
   * Get checkout progress percentage
   */
  getProgress(sessionId: string): number {
    const state = this.states.get(sessionId);
    if (!state) {
      return 0;
    }

    const flow = this.getCheckoutFlowForSession(sessionId);
    if (!flow) {
      return 0;
    }

    return Math.round((state.completedSteps.length / flow.steps.length) * 100);
  }

  /**
   * Check if checkout is stale
   */
  isStale(sessionId: string, staleThresholdMs: number = 600000): boolean {
    const state = this.states.get(sessionId);
    if (!state) {
      return true;
    }

    return Date.now() - state.lastActivityAt > staleThresholdMs;
  }

  // Private methods

  private normalizeRetailerName(retailer: string): string {
    return retailer.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private getCheckoutFlowForSession(sessionId: string): CheckoutFlow | null {
    // In a real implementation, this would look up the session's retailer
    // For now, return a generic flow
    return this.getCheckoutFlow('generic');
  }
}
