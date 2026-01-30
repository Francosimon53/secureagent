/**
 * Shopping Automation
 *
 * Automated purchasing with 2FA handling, price comparison, and budget checking
 */

import type {
  ShoppingList,
  ShoppingItem,
  PurchaseOrder,
  TwoFactorRequest,
  StoreCredentials,
  StoreType,
  Money,
  EncryptionProvider,
  SMSProvider,
  NotificationProvider,
  AlertChannel,
} from './types.js';
import {
  MONEY_MAKERS_EVENTS,
  STORE_CONFIGS,
  TWO_FACTOR_TIMEOUT,
  formatMoney,
  redactPII,
} from './constants.js';

// =============================================================================
// Shopping Automation Config
// =============================================================================

export interface ShoppingAutomationConfig {
  /** Encryption provider for storing credentials securely */
  encryptionProvider?: EncryptionProvider;
  /** SMS provider for 2FA interception */
  smsProvider?: SMSProvider;
  /** Notification provider for alerts */
  notificationProvider?: NotificationProvider;
  /** Default alert channels */
  defaultAlertChannels: AlertChannel[];
  /** Auto-compare prices before purchase */
  autoPriceCompare: boolean;
  /** Require budget check before purchase */
  requireBudgetCheck: boolean;
  /** 2FA timeout in milliseconds */
  twoFactorTimeout: number;
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: ShoppingAutomationConfig = {
  defaultAlertChannels: ['push'],
  autoPriceCompare: true,
  requireBudgetCheck: true,
  twoFactorTimeout: TWO_FACTOR_TIMEOUT,
};

// =============================================================================
// Shopping Automation Manager
// =============================================================================

export class ShoppingAutomation {
  private readonly config: ShoppingAutomationConfig;
  private shoppingLists = new Map<string, ShoppingList>();
  private orders = new Map<string, PurchaseOrder>();
  private credentials = new Map<string, StoreCredentials>();
  private pending2FA = new Map<string, TwoFactorRequest>();
  private recurringSchedules = new Map<string, NodeJS.Timeout>();

  constructor(config?: Partial<ShoppingAutomationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Shopping List Management
  // ==========================================================================

  /**
   * Create a new shopping list
   */
  createList(params: {
    userId: string;
    name: string;
    items?: ShoppingItem[];
    store?: StoreType;
    budget?: Money;
  }): ShoppingList {
    const id = this.generateId('list');

    const list: ShoppingList = {
      id,
      userId: params.userId,
      name: params.name,
      items: params.items ?? [],
      store: params.store,
      budget: params.budget,
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.shoppingLists.set(id, list);

    this.emit(MONEY_MAKERS_EVENTS.SHOPPING_LIST_CREATED, {
      listId: id,
      itemCount: list.items.length,
    });

    return list;
  }

  /**
   * Add item to shopping list
   */
  addItem(listId: string, item: Omit<ShoppingItem, 'id'>): ShoppingItem {
    const list = this.getList(listId);
    const newItem: ShoppingItem = {
      id: this.generateId('item'),
      ...item,
    };

    list.items.push(newItem);
    list.updatedAt = Date.now();

    return newItem;
  }

  /**
   * Add item from natural language
   */
  addItemFromText(listId: string, text: string): ShoppingItem {
    const parsed = this.parseItemText(text);
    return this.addItem(listId, parsed);
  }

  /**
   * Remove item from shopping list
   */
  removeItem(listId: string, itemId: string): void {
    const list = this.getList(listId);
    list.items = list.items.filter(i => i.id !== itemId);
    list.updatedAt = Date.now();
  }

  /**
   * Get shopping list by ID
   */
  getList(listId: string): ShoppingList {
    const list = this.shoppingLists.get(listId);
    if (!list) {
      throw new Error(`Shopping list not found: ${listId}`);
    }
    return list;
  }

  /**
   * Get all lists for a user
   */
  getUserLists(userId: string): ShoppingList[] {
    return Array.from(this.shoppingLists.values()).filter(
      l => l.userId === userId
    );
  }

  /**
   * Calculate estimated total for a list
   */
  estimateTotal(listId: string): Money {
    const list = this.getList(listId);
    let total = 0;
    let currency = 'USD';

    for (const item of list.items) {
      if (item.maxPrice) {
        total += item.maxPrice.amount * item.quantity;
        currency = item.maxPrice.currency;
      }
    }

    return { amount: total, currency: currency as Money['currency'] };
  }

  // ==========================================================================
  // Store Credentials
  // ==========================================================================

  /**
   * Store credentials securely
   */
  async storeCredentials(
    userId: string,
    storeType: StoreType,
    username: string,
    password: string,
    twoFactorEnabled: boolean = false,
    twoFactorMethod?: 'sms' | 'email' | 'authenticator'
  ): Promise<void> {
    let encryptedPassword = password;

    if (this.config.encryptionProvider) {
      encryptedPassword = await this.config.encryptionProvider.encrypt(password);
    }

    const credentials: StoreCredentials = {
      storeType,
      username,
      encryptedPassword,
      twoFactorEnabled,
      twoFactorMethod,
    };

    this.credentials.set(`${userId}:${storeType}`, credentials);
  }

  /**
   * Check if credentials exist for a store
   */
  hasCredentials(userId: string, storeType: StoreType): boolean {
    return this.credentials.has(`${userId}:${storeType}`);
  }

  /**
   * Remove stored credentials
   */
  removeCredentials(userId: string, storeType: StoreType): void {
    this.credentials.delete(`${userId}:${storeType}`);
  }

  // ==========================================================================
  // Order Processing
  // ==========================================================================

  /**
   * Start a purchase order from a shopping list
   */
  async startOrder(listId: string): Promise<PurchaseOrder> {
    const list = this.getList(listId);
    const id = this.generateId('order');

    // Check budget if required
    if (this.config.requireBudgetCheck && list.budget) {
      const estimated = this.estimateTotal(listId);
      if (estimated.amount > list.budget.amount) {
        throw new Error(
          `Estimated total ${formatMoney(estimated.amount, estimated.currency)} ` +
          `exceeds budget ${formatMoney(list.budget.amount, list.budget.currency)}`
        );
      }
    }

    const order: PurchaseOrder = {
      id,
      userId: list.userId,
      listId,
      store: list.store ?? 'custom',
      items: list.items.map(item => ({
        item,
        actualPrice: item.maxPrice ?? { amount: 0, currency: 'USD' },
        found: false,
      })),
      subtotal: { amount: 0, currency: 'USD' },
      tax: { amount: 0, currency: 'USD' },
      total: { amount: 0, currency: 'USD' },
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.orders.set(id, order);
    list.status = 'in_progress';

    this.emit(MONEY_MAKERS_EVENTS.SHOPPING_ORDER_STARTED, {
      orderId: id,
      listId,
      store: order.store,
    });

    return order;
  }

  /**
   * Process 2FA requirement
   */
  async request2FA(orderId: string): Promise<TwoFactorRequest> {
    const order = this.getOrder(orderId);
    const credKey = `${order.userId}:${order.store}`;
    const creds = this.credentials.get(credKey);

    if (!creds?.twoFactorEnabled) {
      throw new Error('2FA not enabled for this store');
    }

    const request: TwoFactorRequest = {
      orderId,
      store: order.store,
      method: creds.twoFactorMethod ?? 'sms',
      requestedAt: Date.now(),
      expiresAt: Date.now() + this.config.twoFactorTimeout,
      completed: false,
    };

    this.pending2FA.set(orderId, request);
    order.status = 'awaiting_2fa';
    order.updatedAt = Date.now();

    this.emit(MONEY_MAKERS_EVENTS.SHOPPING_2FA_REQUIRED, {
      orderId,
      method: request.method,
      expiresAt: request.expiresAt,
    });

    // Attempt auto-intercept if SMS provider available
    if (request.method === 'sms' && this.config.smsProvider) {
      this.attemptSMSIntercept(orderId, request);
    }

    return request;
  }

  /**
   * Submit 2FA code
   */
  async submit2FA(orderId: string, code: string): Promise<boolean> {
    const request = this.pending2FA.get(orderId);
    if (!request) {
      throw new Error('No pending 2FA request for this order');
    }

    if (Date.now() > request.expiresAt) {
      this.pending2FA.delete(orderId);
      throw new Error('2FA code expired');
    }

    // In real implementation, this would verify with the store
    const verified = this.verify2FACode(code);

    if (verified) {
      request.completed = true;
      this.pending2FA.delete(orderId);

      const order = this.getOrder(orderId);
      order.status = 'processing';
      order.updatedAt = Date.now();
    }

    return verified;
  }

  /**
   * Confirm order completion
   */
  confirmOrder(
    orderId: string,
    details: {
      confirmationNumber: string;
      total: Money;
      tax?: Money;
      estimatedDelivery?: number;
    }
  ): PurchaseOrder {
    const order = this.getOrder(orderId);

    order.confirmationNumber = details.confirmationNumber;
    order.total = details.total;
    order.tax = details.tax ?? { amount: 0, currency: 'USD' };
    order.subtotal = {
      amount: details.total.amount - (details.tax?.amount ?? 0),
      currency: details.total.currency,
    };
    order.estimatedDelivery = details.estimatedDelivery;
    order.status = 'confirmed';
    order.updatedAt = Date.now();

    if (order.listId) {
      const list = this.shoppingLists.get(order.listId);
      if (list) {
        list.status = 'completed';
      }
    }

    this.emit(MONEY_MAKERS_EVENTS.SHOPPING_ORDER_CONFIRMED, {
      orderId,
      confirmationNumber: details.confirmationNumber,
      total: details.total,
    });

    return order;
  }

  /**
   * Update order shipping status
   */
  updateShipping(
    orderId: string,
    trackingNumber: string,
    status: 'shipped' | 'delivered'
  ): void {
    const order = this.getOrder(orderId);

    order.trackingNumber = trackingNumber;
    order.status = status;
    order.updatedAt = Date.now();

    const event = status === 'shipped'
      ? MONEY_MAKERS_EVENTS.SHOPPING_ORDER_SHIPPED
      : MONEY_MAKERS_EVENTS.SHOPPING_ORDER_DELIVERED;

    this.emit(event, {
      orderId,
      trackingNumber,
    });
  }

  /**
   * Get order by ID
   */
  getOrder(orderId: string): PurchaseOrder {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }
    return order;
  }

  /**
   * Get user's orders
   */
  getUserOrders(
    userId: string,
    status?: PurchaseOrder['status']
  ): PurchaseOrder[] {
    return Array.from(this.orders.values()).filter(
      o => o.userId === userId && (!status || o.status === status)
    );
  }

  // ==========================================================================
  // Recurring Orders
  // ==========================================================================

  /**
   * Schedule recurring order
   */
  scheduleRecurring(
    listId: string,
    intervalDays: number
  ): void {
    const list = this.getList(listId);

    // Clear existing schedule
    this.cancelRecurring(listId);

    const intervalMs = intervalDays * 24 * 60 * 60 * 1000;

    const timer = setInterval(async () => {
      try {
        // Create a copy of the list for the new order
        const newList = this.createList({
          userId: list.userId,
          name: `${list.name} (Recurring)`,
          items: list.items.map(i => ({ ...i, id: this.generateId('item') })),
          store: list.store,
          budget: list.budget,
        });

        await this.startOrder(newList.id);
      } catch (error) {
        this.emit('error', {
          type: 'recurring_order_failed',
          listId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, intervalMs);

    this.recurringSchedules.set(listId, timer);
    list.scheduledFor = Date.now() + intervalMs;
  }

  /**
   * Cancel recurring order
   */
  cancelRecurring(listId: string): void {
    const timer = this.recurringSchedules.get(listId);
    if (timer) {
      clearInterval(timer);
      this.recurringSchedules.delete(listId);
    }
  }

  // ==========================================================================
  // Price Comparison
  // ==========================================================================

  /**
   * Compare prices across stores (stub - would integrate with price APIs)
   */
  async comparePrices(item: ShoppingItem): Promise<Array<{
    store: StoreType;
    price: Money;
    available: boolean;
    url?: string;
  }>> {
    // In real implementation, this would call price comparison APIs
    const mockResults: Array<{
      store: StoreType;
      price: Money;
      available: boolean;
    }> = [
      { store: 'amazon', price: { amount: item.maxPrice?.amount ?? 10, currency: 'USD' }, available: true },
      { store: 'walmart', price: { amount: (item.maxPrice?.amount ?? 10) * 0.95, currency: 'USD' }, available: true },
      { store: 'target', price: { amount: (item.maxPrice?.amount ?? 10) * 1.05, currency: 'USD' }, available: true },
    ];

    return mockResults.sort((a, b) => a.price.amount - b.price.amount);
  }

  /**
   * Find best price for all items in a list
   */
  async findBestPrices(listId: string): Promise<Map<string, {
    bestStore: StoreType;
    bestPrice: Money;
    savings: Money;
  }>> {
    const list = this.getList(listId);
    const results = new Map<string, { bestStore: StoreType; bestPrice: Money; savings: Money }>();

    for (const item of list.items) {
      const comparison = await this.comparePrices(item);
      const best = comparison[0];

      if (best && item.maxPrice) {
        results.set(item.id, {
          bestStore: best.store,
          bestPrice: best.price,
          savings: {
            amount: Math.max(0, item.maxPrice.amount - best.price.amount),
            currency: best.price.currency,
          },
        });
      }
    }

    return results;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private parseItemText(text: string): Omit<ShoppingItem, 'id'> {
    // Parse natural language like "2 gallons of milk"
    const quantityMatch = text.match(/^(\d+)\s*/);
    const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 1;

    const withoutQuantity = quantityMatch
      ? text.substring(quantityMatch[0].length)
      : text;

    // Check for unit (gallon, lb, oz, etc.)
    const unitMatch = withoutQuantity.match(/^(gallons?|lbs?|oz|packs?|boxes?|bags?|bottles?)\s+(?:of\s+)?/i);
    const unit = unitMatch ? unitMatch[1] : undefined;

    const name = unitMatch
      ? withoutQuantity.substring(unitMatch[0].length)
      : withoutQuantity;

    return {
      name: name.trim(),
      quantity,
      unit,
    };
  }

  private async attemptSMSIntercept(
    orderId: string,
    request: TwoFactorRequest
  ): Promise<void> {
    if (!this.config.smsProvider) return;

    try {
      const code = await this.config.smsProvider.receiveSMS(
        'store',
        this.config.twoFactorTimeout
      );

      if (code) {
        await this.submit2FA(orderId, code);
      }
    } catch {
      // SMS intercept failed, user will need to enter manually
    }
  }

  private verify2FACode(code: string): boolean {
    // In real implementation, this would verify with the store
    return code.length === 6 && /^\d+$/.test(code);
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private emit(event: string, data: unknown): void {
    const safeData = typeof data === 'object' && data !== null
      ? JSON.parse(redactPII(JSON.stringify(data)))
      : data;
    this.config.onEvent?.(event, safeData);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createShoppingAutomation(
  config?: Partial<ShoppingAutomationConfig>
): ShoppingAutomation {
  return new ShoppingAutomation(config);
}
