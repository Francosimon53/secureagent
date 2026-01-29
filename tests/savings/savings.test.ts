/**
 * Savings Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Stores
  InMemoryExpenseStore,
  InMemorySubscriptionStore,
  InMemoryPriceAlertStore,
  InMemoryInsuranceClaimStore,
  InMemoryNegotiationStore,
  InMemoryBillStore,

  // Services
  ExpenseTrackingService,
  SubscriptionAnalysisService,
  PriceMonitoringService,
  BillReminderService,
  NegotiationService,
  ShoppingAutomationService,
  InsuranceClaimService,

  // Utilities
  SplitCalculator,
  SettlementTracker,
  SubscriptionDetector,
  CancellationHelper,
  AlertEngine,
  PriceHistoryAnalyzer,
  EmailDrafter,
  CounterOfferEngine,
  VendorContactManager,
  TwoFactorSessionManager,
  CheckoutHandler,
  ClaimBuilder,
  DocumentManager,

  // Manager
  SavingsManager,
  createSavingsManager,

  // Types
  type Expense,
  type ExpenseSplit,
  type Subscription,
  type PriceAlert,
  type Bill,
  type NegotiationSession,
  type InsuranceClaim,
  type GroupMember,
} from '../../src/savings/index.js';

describe('Savings Module', () => {
  // ==========================================================================
  // Expense Store Tests
  // ==========================================================================
  describe('ExpenseStore', () => {
    let store: InMemoryExpenseStore;

    beforeEach(async () => {
      store = new InMemoryExpenseStore();
      await store.initialize();
    });

    it('should create and retrieve an expense', async () => {
      const expense = await store.createExpense({
        userId: 'user-1',
        amount: 50.00,
        currency: 'USD',
        category: 'food',
        description: 'Dinner with friends',
        expenseDate: Date.now(),
        tags: ['restaurant'],
      });

      expect(expense.id).toBeDefined();
      expect(expense.amount).toBe(50.00);
      expect(expense.category).toBe('food');

      const retrieved = await store.getExpense(expense.id);
      expect(retrieved).toEqual(expense);
    });

    it('should list expenses with filters', async () => {
      await store.createExpense({
        userId: 'user-1',
        amount: 25.00,
        currency: 'USD',
        category: 'food',
        description: 'Lunch',
        expenseDate: Date.now(),
        tags: [],
      });

      await store.createExpense({
        userId: 'user-1',
        amount: 100.00,
        currency: 'USD',
        category: 'utilities',
        description: 'Electric bill',
        expenseDate: Date.now(),
        tags: [],
      });

      await store.createExpense({
        userId: 'user-2',
        amount: 50.00,
        currency: 'USD',
        category: 'food',
        description: 'Dinner',
        expenseDate: Date.now(),
        tags: [],
      });

      const user1Expenses = await store.listExpenses('user-1');
      expect(user1Expenses.length).toBe(2);

      const foodExpenses = await store.listExpenses('user-1', { category: ['food'] });
      expect(foodExpenses.length).toBe(1);
    });

    it('should update an expense', async () => {
      const expense = await store.createExpense({
        userId: 'user-1',
        amount: 50.00,
        currency: 'USD',
        category: 'food',
        description: 'Original',
        expenseDate: Date.now(),
        tags: [],
      });

      const updated = await store.updateExpense(expense.id, {
        description: 'Updated description',
        amount: 75.00,
      });

      expect(updated?.description).toBe('Updated description');
      expect(updated?.amount).toBe(75.00);
    });

    it('should delete an expense', async () => {
      const expense = await store.createExpense({
        userId: 'user-1',
        amount: 25.00,
        currency: 'USD',
        category: 'food',
        description: 'To delete',
        expenseDate: Date.now(),
        tags: [],
      });

      const deleted = await store.deleteExpense(expense.id);
      expect(deleted).toBe(true);

      const retrieved = await store.getExpense(expense.id);
      expect(retrieved).toBeNull();
    });
  });

  // ==========================================================================
  // Subscription Store Tests
  // ==========================================================================
  describe('SubscriptionStore', () => {
    let store: InMemorySubscriptionStore;

    beforeEach(async () => {
      store = new InMemorySubscriptionStore();
      await store.initialize();
    });

    it('should create and retrieve a subscription', async () => {
      const subscription = await store.create({
        userId: 'user-1',
        name: 'Netflix',
        provider: 'Netflix Inc',
        amount: 15.99,
        currency: 'USD',
        frequency: 'monthly',
        status: 'active',
        detectedFrom: 'manual',
        category: 'streaming',
        startDate: Date.now(),
        linkedTransactions: [],
        tags: ['entertainment'],
      });

      expect(subscription.id).toBeDefined();
      expect(subscription.name).toBe('Netflix');
      expect(subscription.amount).toBe(15.99);

      const retrieved = await store.get(subscription.id);
      expect(retrieved).toEqual(subscription);
    });

    it('should track usage', async () => {
      const subscription = await store.create({
        userId: 'user-1',
        name: 'Spotify',
        provider: 'Spotify AB',
        amount: 9.99,
        currency: 'USD',
        frequency: 'monthly',
        status: 'active',
        detectedFrom: 'manual',
        category: 'music',
        startDate: Date.now(),
        linkedTransactions: [],
        tags: [],
      });

      const result = await store.recordUsage(subscription.id);
      expect(result).toBe(true);

      const updated = await store.get(subscription.id);
      expect(updated?.usageMetrics?.lastUsedAt).toBeDefined();
      expect(updated?.usageMetrics?.usageCount).toBe(1);
    });

    it('should get unused subscriptions', async () => {
      // Create active subscription with no recent usage
      const sub = await store.create({
        userId: 'user-1',
        name: 'Unused Service',
        provider: 'Unused Inc',
        amount: 19.99,
        currency: 'USD',
        frequency: 'monthly',
        status: 'active',
        detectedFrom: 'manual',
        category: 'software',
        startDate: Date.now() - 60 * 24 * 60 * 60 * 1000, // 60 days ago
        linkedTransactions: [],
        tags: [],
      });

      // Update usage metrics to mark as unused
      await store.updateUsage(sub.id, {
        isUnused: true,
        unusedDays: 45,
      });

      const unused = await store.getUnused('user-1', 30);
      expect(unused.length).toBe(1);
      expect(unused[0].name).toBe('Unused Service');
    });

    it('should calculate total monthly spend', async () => {
      await store.create({
        userId: 'user-1',
        name: 'Netflix',
        provider: 'Netflix Inc',
        amount: 15.99,
        currency: 'USD',
        frequency: 'monthly',
        status: 'active',
        detectedFrom: 'manual',
        category: 'streaming',
        startDate: Date.now(),
        linkedTransactions: [],
        tags: [],
      });

      await store.create({
        userId: 'user-1',
        name: 'Spotify',
        provider: 'Spotify AB',
        amount: 9.99,
        currency: 'USD',
        frequency: 'monthly',
        status: 'active',
        detectedFrom: 'manual',
        category: 'music',
        startDate: Date.now(),
        linkedTransactions: [],
        tags: [],
      });

      await store.create({
        userId: 'user-1',
        name: 'Adobe CC',
        provider: 'Adobe Inc',
        amount: 599.88,
        currency: 'USD',
        frequency: 'annually',
        status: 'active',
        detectedFrom: 'manual',
        category: 'software',
        startDate: Date.now(),
        linkedTransactions: [],
        tags: [],
      });

      const total = await store.getTotalMonthlySpend('user-1');
      // Netflix (15.99) + Spotify (9.99) + Adobe (599.88/12 = 49.99) = 75.97
      expect(total).toBeCloseTo(75.97, 2);
    });
  });

  // ==========================================================================
  // Bill Store Tests
  // ==========================================================================
  describe('BillStore', () => {
    let store: InMemoryBillStore;

    beforeEach(async () => {
      store = new InMemoryBillStore();
      await store.initialize();
    });

    it('should create and retrieve a bill', async () => {
      const bill = await store.create({
        userId: 'user-1',
        name: 'Electric Bill',
        payee: 'Power Company',
        amount: 150.00,
        currency: 'USD',
        frequency: 'monthly',
        dueDay: 15,
        reminderDays: [7, 3, 1],
        autopay: false,
        category: 'utilities',
        isActive: true,
        nextDueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        paymentHistory: [],
      });

      expect(bill.id).toBeDefined();
      expect(bill.name).toBe('Electric Bill');

      const retrieved = await store.get(bill.id);
      expect(retrieved).toEqual(bill);
    });

    it('should record a payment', async () => {
      const bill = await store.create({
        userId: 'user-1',
        name: 'Internet',
        payee: 'ISP',
        amount: 80.00,
        currency: 'USD',
        frequency: 'monthly',
        dueDay: 1,
        reminderDays: [7, 3],
        autopay: true,
        category: 'utilities',
        isActive: true,
        nextDueDate: Date.now() + 5 * 24 * 60 * 60 * 1000,
        paymentHistory: [],
      });

      const payment = await store.recordPayment(bill.id, {
        amount: 80.00,
        paidAt: Date.now(),
        method: 'autopay',
        wasLate: false,
      });

      expect(payment?.amount).toBe(80.00);

      const updated = await store.get(bill.id);
      expect(updated?.paymentHistory).toHaveLength(1);
      expect(updated?.lastPaidDate).toBeDefined();
    });

    it('should get bills due soon', async () => {
      await store.create({
        userId: 'user-1',
        name: 'Rent',
        payee: 'Landlord',
        amount: 1500.00,
        currency: 'USD',
        frequency: 'monthly',
        dueDay: 1,
        reminderDays: [7, 3],
        autopay: false,
        category: 'housing',
        isActive: true,
        nextDueDate: Date.now() + 3 * 24 * 60 * 60 * 1000, // 3 days
        paymentHistory: [],
      });

      await store.create({
        userId: 'user-1',
        name: 'Phone',
        payee: 'Mobile Carrier',
        amount: 50.00,
        currency: 'USD',
        frequency: 'monthly',
        dueDay: 20,
        reminderDays: [3],
        autopay: true,
        category: 'utilities',
        isActive: true,
        nextDueDate: Date.now() + 15 * 24 * 60 * 60 * 1000, // 15 days
        paymentHistory: [],
      });

      const dueSoon = await store.getDueSoon('user-1', 7);
      expect(dueSoon.length).toBe(1);
      expect(dueSoon[0].name).toBe('Rent');
    });
  });

  // ==========================================================================
  // Utility Class Tests
  // ==========================================================================
  describe('SplitCalculator', () => {
    let calculator: SplitCalculator;

    beforeEach(() => {
      calculator = new SplitCalculator();
    });

    it('should calculate equal splits', () => {
      const members: GroupMember[] = [
        { id: 'user-1', name: 'Alice', email: 'alice@example.com', joinedAt: Date.now() },
        { id: 'user-2', name: 'Bob', email: 'bob@example.com', joinedAt: Date.now() },
        { id: 'user-3', name: 'Carol', email: 'carol@example.com', joinedAt: Date.now() },
      ];

      const splits = calculator.calculate({
        type: 'equal',
        totalAmount: 100.00,
        members,
        includeOwner: false,
      });

      expect(splits).toHaveLength(3);
      // Each person pays 100/3 = 33.33
      expect(splits[0].amount).toBeCloseTo(33.33, 2);
    });

    it('should calculate percentage splits', () => {
      const members: GroupMember[] = [
        { id: 'user-1', name: 'Alice', email: 'alice@example.com', joinedAt: Date.now() },
        { id: 'user-2', name: 'Bob', email: 'bob@example.com', joinedAt: Date.now() },
      ];

      const customValues = new Map([
        ['user-1', 60],
        ['user-2', 40],
      ]);

      const splits = calculator.calculate({
        type: 'percentage',
        totalAmount: 100.00,
        members,
        customValues,
        includeOwner: false,
      });

      expect(splits).toHaveLength(2);
      expect(splits.find(s => s.memberId === 'user-1')?.amount).toBe(60.00);
      expect(splits.find(s => s.memberId === 'user-2')?.amount).toBe(40.00);
    });

    it('should calculate shares split', () => {
      const members: GroupMember[] = [
        { id: 'user-1', name: 'Alice', email: 'alice@example.com', joinedAt: Date.now() },
        { id: 'user-2', name: 'Bob', email: 'bob@example.com', joinedAt: Date.now() },
        { id: 'user-3', name: 'Carol', email: 'carol@example.com', joinedAt: Date.now() },
      ];

      const customValues = new Map([
        ['user-1', 1],
        ['user-2', 2],
        ['user-3', 3],
      ]);

      const splits = calculator.calculate({
        type: 'shares',
        totalAmount: 120.00,
        members,
        customValues,
        includeOwner: false,
      });

      expect(splits).toHaveLength(3);
      // Total shares = 6, per share = 20
      expect(splits.find(s => s.memberId === 'user-1')?.amount).toBe(20.00);
      expect(splits.find(s => s.memberId === 'user-2')?.amount).toBe(40.00);
      expect(splits.find(s => s.memberId === 'user-3')?.amount).toBe(60.00);
    });
  });

  describe('SubscriptionDetector', () => {
    let detector: SubscriptionDetector;

    beforeEach(() => {
      detector = new SubscriptionDetector();
    });

    it('should detect monthly subscription from transactions', () => {
      const now = Date.now();
      const transactions = [
        { id: '1', amount: 15.99, merchant: 'Netflix', description: 'Netflix subscription', date: now - 90 * 24 * 60 * 60 * 1000 },
        { id: '2', amount: 15.99, merchant: 'Netflix', description: 'Netflix subscription', date: now - 60 * 24 * 60 * 60 * 1000 },
        { id: '3', amount: 15.99, merchant: 'Netflix', description: 'Netflix subscription', date: now - 30 * 24 * 60 * 60 * 1000 },
        { id: '4', amount: 15.99, merchant: 'Netflix', description: 'Netflix subscription', date: now },
      ];

      const detected = detector.detect(transactions);

      expect(detected.length).toBeGreaterThan(0);
      expect(detected[0].name).toBe('Netflix');
      expect(detected[0].frequency).toBe('monthly');
      expect(detected[0].confidence).toBeGreaterThan(0.7);
    });

    it('should not detect irregular payments as subscriptions', () => {
      const now = Date.now();
      const transactions = [
        { id: '1', amount: 25.00, merchant: 'Random Store', description: 'Purchase', date: now - 100 * 24 * 60 * 60 * 1000 },
        { id: '2', amount: 45.00, merchant: 'Random Store', description: 'Purchase', date: now - 50 * 24 * 60 * 60 * 1000 },
        { id: '3', amount: 15.00, merchant: 'Random Store', description: 'Purchase', date: now },
      ];

      const detected = detector.detect(transactions);

      expect(detected.length).toBe(0);
    });
  });

  describe('CancellationHelper', () => {
    let helper: CancellationHelper;

    beforeEach(() => {
      helper = new CancellationHelper();
    });

    it('should provide cancellation guide for known providers', () => {
      const subscription: Subscription = {
        id: 'sub-1',
        userId: 'user-1',
        name: 'Netflix',
        provider: 'Netflix',
        amount: 15.99,
        currency: 'USD',
        frequency: 'monthly',
        status: 'active',
        detectedFrom: 'manual',
        category: 'streaming',
        startDate: Date.now(),
        linkedTransactions: [],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const guide = helper.getGuide(subscription);

      expect(guide.provider).toBe('Netflix');
      expect(guide.difficulty).toBe('easy');
      expect(guide.steps.length).toBeGreaterThan(0);
      expect(guide.cancellationUrl).toBeDefined();
    });

    it('should generate generic guide for unknown providers', () => {
      const subscription: Subscription = {
        id: 'sub-1',
        userId: 'user-1',
        name: 'Unknown Service',
        provider: 'Unknown Provider',
        amount: 9.99,
        currency: 'USD',
        frequency: 'monthly',
        status: 'active',
        detectedFrom: 'manual',
        category: 'software',
        startDate: Date.now(),
        linkedTransactions: [],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const guide = helper.getGuide(subscription);

      expect(guide.provider).toBe('Unknown Provider');
      expect(guide.steps.length).toBeGreaterThan(0);
    });

    it('should generate cancellation letter', () => {
      const subscription: Subscription = {
        id: 'sub-1',
        userId: 'user-1',
        name: 'Gym Membership',
        provider: 'Local Gym',
        amount: 49.99,
        currency: 'USD',
        frequency: 'monthly',
        status: 'active',
        detectedFrom: 'manual',
        category: 'fitness',
        startDate: Date.now(),
        linkedTransactions: [],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const letter = helper.generateCancellationLetter(subscription, {
        accountId: 'GYM-12345',
        reason: 'Moving to a new city',
      });

      expect(letter).toContain('Gym Membership');
      expect(letter).toContain('GYM-12345');
      expect(letter).toContain('Moving to a new city');
    });
  });

  describe('AlertEngine', () => {
    let engine: AlertEngine;

    beforeEach(() => {
      engine = new AlertEngine();
    });

    it('should trigger alert when price drops below target', () => {
      const alert: PriceAlert = {
        id: 'alert-1',
        userId: 'user-1',
        productUrl: 'https://example.com/product',
        productName: 'Test Product',
        targetPrice: 50.00,
        currentPrice: 60.00,
        alertType: 'below',
        priceHistory: [],
        notificationChannels: ['email'],
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // evaluate returns an array of evaluations
      const evaluations = engine.evaluate(alert, 45.00, true);

      expect(evaluations.length).toBeGreaterThan(0);
      const triggered = evaluations.some(e => e.triggered);
      expect(triggered).toBe(true);
    });

    it('should trigger alert when price drops by percentage', () => {
      const alert: PriceAlert = {
        id: 'alert-1',
        userId: 'user-1',
        productUrl: 'https://example.com/product',
        productName: 'Test Product',
        targetPrice: 20, // Not relevant for percent drop
        currentPrice: 100.00,
        alertType: 'drop-percent',
        priceHistory: [],
        notificationChannels: ['push'],
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const evaluations = engine.evaluate(alert, 75.00, true); // 25% drop

      expect(evaluations.length).toBeGreaterThan(0);
      const triggered = evaluations.some(e => e.triggered);
      expect(triggered).toBe(true);
    });
  });

  describe('EmailDrafter', () => {
    let drafter: EmailDrafter;

    beforeEach(() => {
      drafter = new EmailDrafter();
    });

    it('should draft initial request email', () => {
      const session: NegotiationSession = {
        id: 'session-1',
        userId: 'user-1',
        type: 'rate',
        vendor: {
          name: 'Internet Provider',
          type: 'telecom',
        },
        targetAmount: 60.00,
        currentAmount: 80.00,
        status: 'draft',
        emails: [],
        counterOffers: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const draft = drafter.draft(session, {
        template: 'initial-request',
        tone: 'formal',
      });

      expect(draft.subject).toContain('Rate Review');
      expect(draft.body).toContain('Internet Provider');
      expect(draft.body).toContain('$60.00');
      expect(draft.placeholders).toContain('[YOUR NAME]');
    });

    it('should draft competitor match email', () => {
      const session: NegotiationSession = {
        id: 'session-1',
        userId: 'user-1',
        type: 'price',
        vendor: {
          name: 'Cable Company',
          type: 'telecom',
        },
        targetAmount: 50.00,
        currentAmount: 75.00,
        status: 'draft',
        emails: [],
        counterOffers: [
          {
            amount: 50.00,
            justification: 'Competitor price',
            strategy: 'competitor-match',
            confidence: 0.85,
            metadata: { competitor: 'Other Cable Co' },
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const draft = drafter.draft(session, {
        template: 'competitor-match',
        tone: 'assertive',
      });

      expect(draft.subject).toContain('Price Match');
      expect(draft.body).toContain('competitor');
      expect(draft.template).toBe('competitor-match');
    });
  });

  describe('TwoFactorSessionManager', () => {
    let manager: TwoFactorSessionManager;

    beforeEach(() => {
      manager = new TwoFactorSessionManager({
        sessionTimeoutSeconds: 300,
        maxAttempts: 3,
        requireExplicitConsent: true,
      });
    });

    it('should require consent before creating session', () => {
      const result = manager.createSession('shop-1', 'user-1', 'sms');

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('not consented');
      }
    });

    it('should create session after consent is granted', () => {
      manager.grantConsent('user-1', ['sms', 'email']);

      const result = manager.createSession('shop-1', 'user-1', 'sms', {
        phoneLastFour: '1234',
      });

      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.id).toBeDefined();
        expect(result.status).toBe('pending');
        expect(result.phoneLastFour).toBe('1234');
      }
    });

    it('should revoke consent', () => {
      manager.grantConsent('user-1', ['sms', 'email']);
      expect(manager.hasConsent('user-1')).toBe(true);

      manager.revokeConsent('user-1');
      expect(manager.hasConsent('user-1')).toBe(false);
    });
  });

  describe('CheckoutHandler', () => {
    let handler: CheckoutHandler;

    beforeEach(() => {
      handler = new CheckoutHandler();
    });

    it('should get checkout flow for known retailer', () => {
      const flow = handler.getCheckoutFlow('Amazon');

      expect(flow).toBeDefined();
      expect(flow!.retailer).toBe('Amazon');
      expect(flow!.requires2FA).toBe(true);
      expect(flow!.steps.length).toBeGreaterThan(0);
    });

    it('should validate cart items', () => {
      const validation = handler.validateCart([
        { id: '1', name: 'Product 1', price: 29.99, quantity: 2, available: true },
        { id: '2', name: 'Product 2', price: 49.99, quantity: 1, available: true },
      ]);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject invalid cart', () => {
      const validation = handler.validateCart([
        { id: '1', name: 'Out of Stock', price: 29.99, quantity: 1, available: false },
      ]);

      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain('out of stock');
    });

    it('should calculate order totals', () => {
      const totals = handler.calculateTotals(
        [
          { id: '1', name: 'Item 1', price: 50.00, quantity: 2, available: true },
          { id: '2', name: 'Item 2', price: 25.00, quantity: 1, available: true },
        ],
        9.99, // Shipping
        0.08  // Tax rate
      );

      expect(totals.subtotal).toBe(125.00);
      expect(totals.shipping).toBe(9.99);
      expect(totals.tax).toBe(10.00); // 8% of 125
      expect(totals.total).toBe(144.99);
    });
  });

  describe('ClaimBuilder', () => {
    let builder: ClaimBuilder;

    beforeEach(() => {
      builder = new ClaimBuilder();
    });

    it('should get form sections for auto claim', () => {
      const sections = builder.getFormSections('auto');

      expect(sections.length).toBeGreaterThan(0);
      const vehicleSection = sections.find(s => s.id === 'vehicle-info');
      expect(vehicleSection).toBeDefined();
    });

    it('should validate claim', () => {
      const validation = builder.validateClaim({
        type: 'auto',
        provider: 'State Farm',
        policyNumber: 'POL-12345',
        incidentDate: Date.now() - 24 * 60 * 60 * 1000,
        description: 'This is a detailed description of the auto accident that occurred at the intersection of Main St and 1st Ave.',
      });

      expect(validation.valid).toBe(true);
      expect(validation.completeness).toBeGreaterThan(80);
    });

    it('should reject incomplete claim', () => {
      const validation = builder.validateClaim({
        type: 'auto',
        description: 'Short desc',
      });

      expect(validation.valid).toBe(false);
      expect(validation.missingRequired.length).toBeGreaterThan(0);
    });

    it('should generate description template', () => {
      const template = builder.generateDescriptionTemplate('auto');

      expect(template).toContain('[DATE]');
      expect(template).toContain('[DESCRIBE WHAT HAPPENED]');
      expect(template).toContain('vehicle');
    });
  });

  // ==========================================================================
  // SavingsManager Integration Tests
  // ==========================================================================
  describe('SavingsManager', () => {
    let manager: SavingsManager;
    let expenseStore: InMemoryExpenseStore;
    let subscriptionStore: InMemorySubscriptionStore;
    let billStore: InMemoryBillStore;

    beforeEach(async () => {
      expenseStore = new InMemoryExpenseStore();
      subscriptionStore = new InMemorySubscriptionStore();
      billStore = new InMemoryBillStore();

      await expenseStore.initialize();
      await subscriptionStore.initialize();
      await billStore.initialize();

      const stores = {
        expense: expenseStore,
        subscription: subscriptionStore,
        priceAlert: new InMemoryPriceAlertStore(),
        insuranceClaim: new InMemoryInsuranceClaimStore(),
        negotiation: new InMemoryNegotiationStore(),
        bill: billStore,
      };

      manager = createSavingsManager(stores, {
        enabled: true,
        priceMonitoring: { enabled: true },
        expenses: { enabled: true },
        bills: { enabled: true },
        subscriptions: { enabled: true },
        negotiation: { enabled: true },
        shopping: { enabled: true },
        insurance: { enabled: true },
      });

      await manager.initialize();
    });

    it('should initialize all services', () => {
      expect(manager.isInitialized()).toBe(true);

      const services = manager.getEnabledServices();
      expect(services).toContain('priceMonitoring');
      expect(services).toContain('expenses');
      expect(services).toContain('bills');
      expect(services).toContain('subscriptions');
      expect(services).toContain('negotiation');
      expect(services).toContain('shopping');
      expect(services).toContain('insurance');
    });

    it('should provide access to individual services', () => {
      expect(manager.priceMonitoring).toBeDefined();
      expect(manager.expenses).toBeDefined();
      expect(manager.bills).toBeDefined();
      expect(manager.subscriptions).toBeDefined();
      expect(manager.negotiation).toBeDefined();
      expect(manager.shopping).toBeDefined();
      expect(manager.insurance).toBeDefined();
    });

    it('should get savings summary for user', async () => {
      // The summary may have some services returning null if their stores don't have data
      const summary = await manager.getSavingsSummary('user-1');

      expect(summary).toBeDefined();
      // These will be defined since we initialized the manager with all stores
      expect(summary.priceAlerts).toBeDefined();
      expect(summary.subscriptions).toBeDefined();
      expect(summary.bills).toBeDefined();
    });

    it('should shutdown cleanly', async () => {
      await manager.shutdown();
      expect(manager.isInitialized()).toBe(false);
    });
  });
});
