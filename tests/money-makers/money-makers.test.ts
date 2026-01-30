/**
 * Money Makers Module Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MoneyMakers,
  createMoneyMakers,
  AutoNegotiator,
  createAutoNegotiator,
  ShoppingAutomation,
  createShoppingAutomation,
  PriceMonitor,
  createPriceMonitor,
  InsuranceClaimHandler,
  createInsuranceClaimHandler,
  ExpenseTracker,
  createExpenseTracker,
  BillReminderManager,
  createBillReminderManager,
  SubscriptionManager,
  createSubscriptionManager,
  DealFinder,
  createDealFinder,
  MONEY_MAKERS_EVENTS,
  formatMoney,
  redactPII,
  categorizeExpense,
  detectSubscription,
  calculateSavingsPercent,
  generateDealScore,
  calculateLateFee,
} from '../../src/money-makers/index.js';
import type { Money, EmailProvider, InsuranceProvider } from '../../src/money-makers/types.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockEmailProvider(): EmailProvider {
  return {
    sendEmail: vi.fn().mockResolvedValue('email-123'),
    getInbox: vi.fn().mockResolvedValue([]),
  };
}

function createTestMoney(amount: number, currency: Money['currency'] = 'USD'): Money {
  return { amount, currency };
}

// =============================================================================
// Constants Tests
// =============================================================================

describe('Constants', () => {
  describe('formatMoney', () => {
    it('should format USD', () => {
      expect(formatMoney(1234.56, 'USD')).toBe('$1,234.56');
    });

    it('should format integers', () => {
      expect(formatMoney(100, 'USD')).toBe('$100.00');
    });
  });

  describe('redactPII', () => {
    it('should redact credit card numbers', () => {
      const text = 'Card: 4111-1111-1111-1111';
      expect(redactPII(text)).toBe('Card: [REDACTED]');
    });

    it('should redact SSN', () => {
      const text = 'SSN: 123-45-6789';
      expect(redactPII(text)).toBe('SSN: [REDACTED]');
    });
  });

  describe('categorizeExpense', () => {
    it('should categorize food expenses', () => {
      expect(categorizeExpense('lunch at restaurant')).toBe('food');
    });

    it('should categorize grocery expenses', () => {
      expect(categorizeExpense('Costco shopping')).toBe('groceries');
    });

    it('should categorize gas expenses', () => {
      expect(categorizeExpense('Shell gas station')).toBe('gas');
    });

    it('should return other for unknown', () => {
      expect(categorizeExpense('random purchase xyz')).toBe('other');
    });
  });

  describe('detectSubscription', () => {
    it('should detect Netflix', () => {
      const result = detectSubscription('Netflix');
      expect(result?.name).toBe('Netflix');
      expect(result?.category).toBe('streaming');
    });

    it('should detect Spotify', () => {
      const result = detectSubscription('Spotify Premium');
      expect(result?.name).toBe('Spotify');
    });

    it('should return null for unknown', () => {
      expect(detectSubscription('Unknown Service XYZ')).toBeNull();
    });
  });

  describe('calculateSavingsPercent', () => {
    it('should calculate savings percentage', () => {
      expect(calculateSavingsPercent(100, 80)).toBe(20);
    });

    it('should handle zero original', () => {
      expect(calculateSavingsPercent(0, 50)).toBe(0);
    });
  });

  describe('calculateLateFee', () => {
    it('should return 0 within grace period', () => {
      expect(calculateLateFee(100, 3, 'utilities')).toBe(0);
    });

    it('should calculate late fee after grace period', () => {
      const fee = calculateLateFee(100, 15, 'utilities');
      expect(fee).toBeGreaterThan(0);
    });
  });

  describe('generateDealScore', () => {
    it('should generate score based on savings', () => {
      const score = generateDealScore({
        savingsPercent: 50,
        relevance: 80,
        verified: true,
        matchesWishlist: true,
      });
      expect(score).toBeGreaterThan(50);
    });

    it('should boost score for expiring deals', () => {
      const score = generateDealScore({
        savingsPercent: 20,
        relevance: 50,
        expiresIn: 1000, // expires in 1 second
        verified: false,
        matchesWishlist: false,
      });
      expect(score).toBeGreaterThan(20);
    });
  });
});

// =============================================================================
// AutoNegotiator Tests
// =============================================================================

describe('AutoNegotiator', () => {
  let negotiator: AutoNegotiator;
  let emailProvider: EmailProvider;

  beforeEach(() => {
    emailProvider = createMockEmailProvider();
    negotiator = createAutoNegotiator({ emailProvider });
  });

  describe('negotiation creation', () => {
    it('should create a negotiation', async () => {
      const negotiation = await negotiator.startNegotiation({
        userId: 'user-1',
        target: {
          type: 'car_purchase',
          description: 'Honda Accord 2024',
          targetItem: 'Honda Accord',
          maxBudget: createTestMoney(35000),
        },
        parties: [
          { email: 'dealer1@example.com', name: 'Dealer 1' },
          { email: 'dealer2@example.com', name: 'Dealer 2' },
        ],
        strategy: 'aggressive',
      });

      expect(negotiation.id).toBeDefined();
      expect(negotiation.parties).toHaveLength(2);
      expect(negotiation.strategy).toBe('aggressive');
      expect(negotiation.status).toBe('draft');
    });

    it('should use default strategy', async () => {
      const negotiation = await negotiator.startNegotiation({
        userId: 'user-1',
        target: {
          type: 'salary',
          description: 'Salary negotiation',
          targetItem: 'Annual salary',
          maxBudget: createTestMoney(150000),
        },
        parties: [{ email: 'hr@company.com' }],
      });

      expect(negotiation.strategy).toBe('moderate');
    });
  });

  describe('draft generation', () => {
    it('should generate initial draft', async () => {
      const negotiation = await negotiator.startNegotiation({
        userId: 'user-1',
        target: {
          type: 'service_contract',
          description: 'IT Services Contract',
          targetItem: 'Annual contract',
          maxBudget: createTestMoney(50000),
        },
        parties: [{ email: 'vendor@example.com' }],
      });

      const draft = await negotiator.generateDraft(negotiation.id, negotiation.parties[0].id, 'initial');

      expect(draft.subject).toContain('Inquiry');
      expect(draft.body).toBeDefined();
      expect(draft.keyPoints).toBeDefined();
    });
  });

  describe('response handling', () => {
    it('should record incoming response', async () => {
      const negotiation = await negotiator.startNegotiation({
        userId: 'user-1',
        target: {
          type: 'car_purchase',
          description: 'Used car',
          targetItem: 'Toyota Camry',
          maxBudget: createTestMoney(25000),
        },
        parties: [{ email: 'seller@example.com' }],
      });

      const message = negotiator.recordResponse(negotiation.id, negotiation.parties[0].id, {
        content: 'We can offer $23,000',
        offer: createTestMoney(23000),
      });

      expect(message.direction).toBe('inbound');
      expect(message.offer?.amount).toBe(23000);

      const updated = negotiator.getNegotiation(negotiation.id);
      expect(updated.bestOffer?.offer.amount).toBe(23000);
    });
  });

  describe('counter offers', () => {
    it('should suggest counter offer', async () => {
      const negotiation = await negotiator.startNegotiation({
        userId: 'user-1',
        target: {
          type: 'car_purchase',
          description: 'New car',
          targetItem: 'Honda Civic',
          maxBudget: createTestMoney(30000),
          idealPrice: createTestMoney(25000),
        },
        parties: [{ email: 'dealer@example.com' }],
        strategy: 'aggressive',
      });

      const suggestion = await negotiator.suggestCounterOffer(
        negotiation.id,
        negotiation.parties[0].id,
        createTestMoney(28000)
      );

      expect(suggestion.suggestedOffer.amount).toBeLessThan(28000);
      expect(suggestion.reasoning).toBeDefined();
      expect(suggestion.talkingPoints.length).toBeGreaterThan(0);
    });
  });

  describe('tips', () => {
    it('should return tips for negotiation type', () => {
      const tips = negotiator.getTips('car_purchase');
      expect(tips.length).toBeGreaterThan(0);
      expect(tips[0]).toContain('price');
    });
  });
});

// =============================================================================
// ShoppingAutomation Tests
// =============================================================================

describe('ShoppingAutomation', () => {
  let shopping: ShoppingAutomation;

  beforeEach(() => {
    shopping = createShoppingAutomation();
  });

  describe('shopping list', () => {
    it('should create shopping list', () => {
      const list = shopping.createList({
        userId: 'user-1',
        name: 'Weekly Groceries',
        store: 'costco',
        budget: createTestMoney(200),
      });

      expect(list.id).toBeDefined();
      expect(list.name).toBe('Weekly Groceries');
      expect(list.status).toBe('draft');
    });

    it('should add items to list', () => {
      const list = shopping.createList({ userId: 'user-1', name: 'Test List' });

      const item = shopping.addItem(list.id, {
        name: 'Milk',
        quantity: 2,
        unit: 'gallons',
      });

      expect(item.id).toBeDefined();
      expect(item.name).toBe('Milk');
      expect(item.quantity).toBe(2);

      const updated = shopping.getList(list.id);
      expect(updated.items).toHaveLength(1);
    });

    it('should parse natural language items', () => {
      const list = shopping.createList({ userId: 'user-1', name: 'Test' });

      const item = shopping.addItemFromText(list.id, '2 gallons of milk');

      expect(item.quantity).toBe(2);
      expect(item.unit).toBe('gallons');
      expect(item.name).toBe('milk');
    });
  });

  describe('estimates', () => {
    it('should estimate list total', () => {
      const list = shopping.createList({ userId: 'user-1', name: 'Test' });

      shopping.addItem(list.id, {
        name: 'Item 1',
        quantity: 2,
        maxPrice: createTestMoney(10),
      });

      shopping.addItem(list.id, {
        name: 'Item 2',
        quantity: 1,
        maxPrice: createTestMoney(25),
      });

      const total = shopping.estimateTotal(list.id);
      expect(total.amount).toBe(45); // 2*10 + 1*25
    });
  });

  describe('credentials', () => {
    it('should store and check credentials', async () => {
      await shopping.storeCredentials('user-1', 'amazon', 'user@email.com', 'password123', true, 'sms');

      expect(shopping.hasCredentials('user-1', 'amazon')).toBe(true);
      expect(shopping.hasCredentials('user-1', 'walmart')).toBe(false);
    });
  });
});

// =============================================================================
// PriceMonitor Tests
// =============================================================================

describe('PriceMonitor', () => {
  let monitor: PriceMonitor;

  beforeEach(() => {
    monitor = createPriceMonitor();
  });

  describe('tracking', () => {
    it('should track item', () => {
      const item = monitor.track({
        userId: 'user-1',
        name: 'MacBook Pro',
        url: 'https://apple.com/macbook-pro',
        category: 'product',
        currentPrice: createTestMoney(2000),
        targetPrice: createTestMoney(1800),
      });

      expect(item.id).toBeDefined();
      expect(item.name).toBe('MacBook Pro');
      expect(item.isActive).toBe(true);
    });

    it('should enforce user limit', () => {
      const smallLimitMonitor = createPriceMonitor({ maxItemsPerUser: 2 });

      smallLimitMonitor.track({ userId: 'user-1', name: 'Item 1', category: 'product' });
      smallLimitMonitor.track({ userId: 'user-1', name: 'Item 2', category: 'product' });

      expect(() => {
        smallLimitMonitor.track({ userId: 'user-1', name: 'Item 3', category: 'product' });
      }).toThrow('Maximum items limit');
    });
  });

  describe('price history', () => {
    it('should record manual price', () => {
      const item = monitor.track({
        userId: 'user-1',
        name: 'Test Item',
        category: 'product',
        currentPrice: createTestMoney(100),
      });

      monitor.recordManualPrice(item.id, createTestMoney(95));

      const history = monitor.getPriceHistory(item.id);
      expect(history).toHaveLength(2);
      // Check that both prices exist in history
      const amounts = history.map(h => h.price.amount);
      expect(amounts).toContain(100);
      expect(amounts).toContain(95);
      // Current price should be the latest recorded
      const updated = monitor.getItem(item.id);
      expect(updated.currentPrice?.amount).toBe(95);
    });

    it('should calculate price stats', () => {
      const item = monitor.track({
        userId: 'user-1',
        name: 'Test',
        category: 'product',
        currentPrice: createTestMoney(100),
      });

      monitor.recordManualPrice(item.id, createTestMoney(90));
      monitor.recordManualPrice(item.id, createTestMoney(110));
      monitor.recordManualPrice(item.id, createTestMoney(95));

      const stats = monitor.getPriceStats(item.id);
      expect(stats.lowest?.amount).toBe(90);
      expect(stats.highest?.amount).toBe(110);
      expect(stats.current?.amount).toBe(95);
    });
  });

  describe('predictions', () => {
    it('should generate prediction with sufficient data', () => {
      const item = monitor.track({
        userId: 'user-1',
        name: 'Test',
        category: 'product',
        currentPrice: createTestMoney(100),
      });

      // Add enough history
      for (let i = 0; i < 10; i++) {
        monitor.recordManualPrice(item.id, createTestMoney(100 - i));
      }

      const prediction = monitor.getPrediction(item.id);
      expect(prediction).not.toBeNull();
      expect(prediction?.recommendation).toBeDefined();
    });
  });
});

// =============================================================================
// InsuranceClaimHandler Tests
// =============================================================================

describe('InsuranceClaimHandler', () => {
  let handler: InsuranceClaimHandler;
  let testProvider: InsuranceProvider;

  beforeEach(() => {
    handler = createInsuranceClaimHandler();
    testProvider = {
      id: 'provider-1',
      name: 'Test Insurance Co',
      type: 'health',
      policyNumber: 'POL-123456',
    };
  });

  describe('claim creation', () => {
    it('should create claim with document checklist', () => {
      const claim = handler.createClaim({
        userId: 'user-1',
        provider: testProvider,
        type: 'health',
        incidentDate: Date.now() - 86400000,
        description: 'Doctor visit',
        claimAmount: createTestMoney(500),
      });

      expect(claim.id).toBeDefined();
      expect(claim.status).toBe('draft');
      expect(claim.documents.length).toBeGreaterThan(0);
      expect(claim.documents.some(d => d.name.includes('medical bill'))).toBe(true);
    });

    it('should generate documents for different claim types', () => {
      const autoClaim = handler.createClaim({
        userId: 'user-1',
        provider: { ...testProvider, type: 'auto' },
        type: 'auto',
        incidentDate: Date.now(),
        description: 'Fender bender',
        claimAmount: createTestMoney(2000),
      });

      expect(autoClaim.documents.some(d => d.name.includes('Police report'))).toBe(true);
    });
  });

  describe('document tracking', () => {
    it('should mark documents as obtained', () => {
      const claim = handler.createClaim({
        userId: 'user-1',
        provider: testProvider,
        type: 'health',
        incidentDate: Date.now(),
        description: 'Test',
        claimAmount: createTestMoney(100),
      });

      const doc = claim.documents[0];
      handler.markDocumentObtained(claim.id, doc.id, '/path/to/doc.pdf');

      const updated = handler.getClaim(claim.id);
      expect(updated.documents.find(d => d.id === doc.id)?.obtained).toBe(true);
    });

    it('should identify missing documents', () => {
      const claim = handler.createClaim({
        userId: 'user-1',
        provider: testProvider,
        type: 'health',
        incidentDate: Date.now(),
        description: 'Test',
        claimAmount: createTestMoney(100),
      });

      const missing = handler.getMissingDocuments(claim.id);
      expect(missing.length).toBe(claim.documents.filter(d => d.required).length);
    });
  });

  describe('communications', () => {
    it('should record communications', () => {
      const claim = handler.createClaim({
        userId: 'user-1',
        provider: testProvider,
        type: 'health',
        incidentDate: Date.now(),
        description: 'Test',
        claimAmount: createTestMoney(100),
      });

      const comm = handler.recordCommunication(claim.id, {
        direction: 'outbound',
        type: 'email',
        summary: 'Submitted claim documents',
      });

      expect(comm.id).toBeDefined();
      expect(handler.getCommunicationHistory(claim.id)).toHaveLength(1);
    });

    it('should generate communication drafts', () => {
      const claim = handler.createClaim({
        userId: 'user-1',
        provider: testProvider,
        type: 'health',
        incidentDate: Date.now(),
        description: 'Test',
        claimAmount: createTestMoney(100),
      });

      const draft = handler.generateCommunicationDraft(claim.id, 'status_inquiry');

      expect(draft).toContain('status');
      expect(draft).toContain(testProvider.policyNumber);
    });
  });

  describe('appeals', () => {
    it('should generate appeal letter for denied claim', async () => {
      const claim = handler.createClaim({
        userId: 'user-1',
        provider: testProvider,
        type: 'health',
        incidentDate: Date.now(),
        description: 'Test',
        claimAmount: createTestMoney(100),
      });

      handler.updateStatus(claim.id, 'denied');

      const appeal = await handler.generateAppealLetter(claim.id);

      expect(appeal.subject).toContain('Appeal');
      expect(appeal.keyArguments.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// ExpenseTracker Tests
// =============================================================================

describe('ExpenseTracker', () => {
  let tracker: ExpenseTracker;

  beforeEach(() => {
    tracker = createExpenseTracker();
  });

  describe('expense logging', () => {
    it('should log expense from natural language', () => {
      const expense = tracker.log('user-1', 'Spent $47.50 at Costco for groceries');

      expect(expense.amount.amount).toBe(47.50);
      expect(expense.merchant).toBe('Costco');
      expect(expense.category).toBe('groceries');
    });

    it('should parse different formats', () => {
      const expense1 = tracker.log('user-1', '$100 on gas');
      expect(expense1.amount.amount).toBe(100);
      expect(expense1.category).toBe('gas');

      const expense2 = tracker.log('user-1', 'paid 25.00 for lunch');
      expect(expense2.amount.amount).toBe(25);
    });

    it('should create expense directly', () => {
      const expense = tracker.createExpense({
        userId: 'user-1',
        amount: createTestMoney(150),
        description: 'New shoes',
        category: 'shopping',
        merchant: 'Nike',
      });

      expect(expense.id).toBeDefined();
      expect(expense.category).toBe('shopping');
    });
  });

  describe('split expenses', () => {
    it('should split expense with others', () => {
      const expense = tracker.createExpense({
        userId: 'user-1',
        amount: createTestMoney(100),
        description: 'Dinner',
      });

      tracker.splitExpense(expense.id, [
        { userId: 'user-2', name: 'Friend 1', amount: createTestMoney(33) },
        { userId: 'user-3', name: 'Friend 2', amount: createTestMoney(33) },
      ]);

      const updated = tracker.getExpense(expense.id);
      expect(updated.splitWith).toHaveLength(2);
      expect(updated.splitWith![0].settled).toBe(false);
    });

    it('should settle splits', () => {
      const expense = tracker.createExpense({
        userId: 'user-1',
        amount: createTestMoney(60),
        description: 'Pizza',
      });

      tracker.splitExpense(expense.id, [
        { userId: 'user-2', name: 'Friend', amount: createTestMoney(30) },
      ]);

      tracker.settleSplit(expense.id, 'user-2');

      const updated = tracker.getExpense(expense.id);
      expect(updated.splitWith![0].settled).toBe(true);
    });
  });

  describe('budgets', () => {
    it('should create budget', () => {
      const budget = tracker.createBudget({
        userId: 'user-1',
        name: 'Monthly Budget',
        period: 'monthly',
        totalLimit: createTestMoney(3000),
        categoryLimits: [
          { category: 'food', limit: createTestMoney(500) },
          { category: 'entertainment', limit: createTestMoney(200) },
        ],
      });

      expect(budget.id).toBeDefined();
      expect(budget.categories).toHaveLength(2);
    });

    it('should track budget status', () => {
      const budget = tracker.createBudget({
        userId: 'user-1',
        name: 'Test Budget',
        period: 'monthly',
        totalLimit: createTestMoney(1000),
      });

      tracker.createExpense({
        userId: 'user-1',
        amount: createTestMoney(300),
        description: 'Expense 1',
      });

      const status = tracker.getBudgetStatus(budget.id);
      expect(status.percentUsed).toBe(30);
      expect(status.remaining.amount).toBe(700);
    });
  });

  describe('recurring expenses', () => {
    it('should mark expense as recurring', () => {
      const expense = tracker.createExpense({
        userId: 'user-1',
        amount: createTestMoney(15),
        description: 'Netflix',
        merchant: 'Netflix',
      });

      const recurring = tracker.markAsRecurring(expense.id, 'monthly');

      expect(recurring.frequency).toBe('monthly');
      expect(recurring.nextOccurrence).toBeGreaterThan(Date.now());
    });

    it('should calculate monthly recurring total', () => {
      const expense = tracker.createExpense({
        userId: 'user-1',
        amount: createTestMoney(15),
        description: 'Netflix',
      });

      tracker.markAsRecurring(expense.id, 'monthly');

      const total = tracker.getMonthlyRecurringTotal('user-1');
      expect(total.amount).toBe(15);
    });
  });
});

// =============================================================================
// BillReminderManager Tests
// =============================================================================

describe('BillReminderManager', () => {
  let manager: BillReminderManager;

  beforeEach(() => {
    manager = createBillReminderManager();
  });

  describe('bill management', () => {
    it('should add bill', () => {
      const dueDate = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days from now

      const bill = manager.addBill({
        userId: 'user-1',
        name: 'Electric Bill',
        payee: 'Power Company',
        amount: createTestMoney(150),
        dueDate,
        frequency: 'monthly',
        category: 'utilities',
      });

      expect(bill.id).toBeDefined();
      expect(bill.status).toBe('upcoming');
    });

    it('should detect due today status', () => {
      const bill = manager.addBill({
        userId: 'user-1',
        name: 'Test Bill',
        payee: 'Test',
        amount: createTestMoney(50),
        dueDate: Date.now(), // Due now
        frequency: 'one_time',
      });

      expect(bill.status).toBe('due_today');
    });

    it('should detect overdue status', () => {
      const bill = manager.addBill({
        userId: 'user-1',
        name: 'Test Bill',
        payee: 'Test',
        amount: createTestMoney(50),
        dueDate: Date.now() - 86400000, // Yesterday
        frequency: 'one_time',
      });

      expect(bill.status).toBe('overdue');
    });
  });

  describe('payments', () => {
    it('should record payment', () => {
      const originalDueDate = Date.now() + 86400000;
      const bill = manager.addBill({
        userId: 'user-1',
        name: 'Test Bill',
        payee: 'Test',
        amount: createTestMoney(100),
        dueDate: originalDueDate,
        frequency: 'monthly',
      });

      const payment = manager.recordPayment(bill.id, {
        amount: createTestMoney(100),
        confirmationNumber: 'CONF-123',
      });

      expect(payment.id).toBeDefined();

      const updated = manager.getBill(bill.id);
      expect(updated.lastPaidDate).toBeDefined();
      // Recurring bill should have new due date (30 days later for monthly)
      expect(updated.dueDate).toBeGreaterThan(originalDueDate);
    });

    it('should get payment history', () => {
      const bill = manager.addBill({
        userId: 'user-1',
        name: 'Test',
        payee: 'Test',
        amount: createTestMoney(50),
        dueDate: Date.now(),
        frequency: 'monthly',
      });

      manager.recordPayment(bill.id, { amount: createTestMoney(50) });
      manager.recordPayment(bill.id, { amount: createTestMoney(50) });

      const history = manager.getPaymentHistory(bill.id);
      expect(history).toHaveLength(2);
    });
  });

  describe('calculations', () => {
    it('should calculate late fee', () => {
      const bill = manager.addBill({
        userId: 'user-1',
        name: 'Test',
        payee: 'Test',
        amount: createTestMoney(100),
        dueDate: Date.now() - 15 * 86400000, // 15 days ago
        frequency: 'one_time',
        category: 'utilities',
      });

      const lateFee = manager.calculateLateFee(bill.id);
      expect(lateFee.amount).toBeGreaterThan(0);
    });

    it('should calculate monthly total', () => {
      manager.addBill({
        userId: 'user-1',
        name: 'Monthly Bill',
        payee: 'Test',
        amount: createTestMoney(100),
        dueDate: Date.now() + 86400000,
        frequency: 'monthly',
      });

      manager.addBill({
        userId: 'user-1',
        name: 'Weekly Bill',
        payee: 'Test',
        amount: createTestMoney(25),
        dueDate: Date.now() + 86400000,
        frequency: 'weekly',
      });

      const total = manager.getMonthlyTotal('user-1');
      // 100 + (25 * 4.33) = ~208
      expect(total.amount).toBeGreaterThan(200);
    });
  });

  describe('calendar', () => {
    it('should get bill calendar', () => {
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();

      manager.addBill({
        userId: 'user-1',
        name: 'Bill 1',
        payee: 'Test',
        amount: createTestMoney(100),
        dueDate: new Date(thisYear, thisMonth, 15).getTime(),
        frequency: 'monthly',
      });

      manager.addBill({
        userId: 'user-1',
        name: 'Bill 2',
        payee: 'Test',
        amount: createTestMoney(50),
        dueDate: new Date(thisYear, thisMonth, 20).getTime(),
        frequency: 'monthly',
      });

      const calendar = manager.getBillCalendar('user-1', thisYear, thisMonth);

      expect(calendar.bills).toHaveLength(2);
      expect(calendar.totalDue.amount).toBe(150);
    });
  });
});

// =============================================================================
// SubscriptionManager Tests
// =============================================================================

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager;

  beforeEach(() => {
    manager = createSubscriptionManager();
  });

  describe('subscription management', () => {
    it('should add subscription', () => {
      const sub = manager.addSubscription({
        userId: 'user-1',
        name: 'Netflix',
        provider: 'Netflix',
        amount: createTestMoney(15.99),
        frequency: 'monthly',
        category: 'streaming',
        priority: 'useful',
      });

      expect(sub.id).toBeDefined();
      expect(sub.category).toBe('streaming');
    });

    it('should auto-detect category', () => {
      const sub = manager.addSubscription({
        userId: 'user-1',
        name: 'Spotify Premium',
        provider: 'Spotify',
        amount: createTestMoney(9.99),
        frequency: 'monthly',
      });

      expect(sub.category).toBe('streaming');
    });
  });

  describe('detection', () => {
    it('should detect subscriptions from transactions', () => {
      const transactions = [
        { merchant: 'Netflix', amount: 15.99, date: Date.now() - 30 * 86400000 },
        { merchant: 'Netflix', amount: 15.99, date: Date.now() },
      ];

      const detected = manager.detectFromTransactions('user-1', transactions);

      expect(detected.length).toBeGreaterThan(0);
      expect(detected[0].merchantName).toBe('netflix');
      expect(detected[0].frequency).toBe('monthly');
    });

    it('should confirm detected subscription', () => {
      const detection = {
        merchantName: 'Spotify',
        amount: createTestMoney(9.99),
        frequency: 'monthly' as const,
        lastCharge: Date.now(),
        chargeCount: 3,
        confidence: 85,
        suggestedCategory: 'streaming' as const,
      };

      const sub = manager.confirmDetection('user-1', detection);

      expect(sub.provider).toBe('Spotify');
      expect(sub.amount.amount).toBe(9.99);
    });
  });

  describe('ROI analysis', () => {
    it('should calculate ROI', () => {
      const sub = manager.addSubscription({
        userId: 'user-1',
        name: 'Test Service',
        provider: 'Test',
        amount: createTestMoney(20),
        frequency: 'monthly',
        usageFrequency: 'daily',
        priority: 'useful',
      });

      const roi = manager.calculateROI(sub.id);

      expect(roi.monthlyAmount.amount).toBe(20);
      expect(roi.yearlyAmount.amount).toBe(240);
      expect(roi.usageScore).toBe(100); // daily usage
      expect(roi.recommendation).toBe('keep');
    });

    it('should recommend canceling unused subscriptions', () => {
      const sub = manager.addSubscription({
        userId: 'user-1',
        name: 'Unused Service',
        provider: 'Test',
        amount: createTestMoney(15),
        frequency: 'monthly',
        usageFrequency: 'never',
        priority: 'unused',
      });

      const roi = manager.calculateROI(sub.id);

      expect(roi.recommendation).toBe('cancel');
      expect(roi.potentialSavings).toBeDefined();
    });
  });

  describe('cancellation assistance', () => {
    it('should provide cancellation steps', () => {
      const sub = manager.addSubscription({
        userId: 'user-1',
        name: 'Test',
        provider: 'Test',
        amount: createTestMoney(10),
        frequency: 'monthly',
        cancellationUrl: 'https://test.com/cancel',
      });

      const assistance = manager.getCancellationAssistance(sub.id);

      expect(assistance.steps.length).toBeGreaterThan(0);
      expect(assistance.expectedDifficulty).toBeDefined();
    });

    it('should generate phone script when needed', () => {
      const sub = manager.addSubscription({
        userId: 'user-1',
        name: 'Test',
        provider: 'Test',
        amount: createTestMoney(10),
        frequency: 'monthly',
        cancellationPhone: '1-800-CANCEL',
      });

      const assistance = manager.getCancellationAssistance(sub.id);

      expect(assistance.phoneScript).toBeDefined();
      expect(assistance.phoneScript).toContain('Hello');
    });
  });

  describe('reports', () => {
    it('should generate subscription report', () => {
      manager.addSubscription({
        userId: 'user-1',
        name: 'Netflix',
        provider: 'Netflix',
        amount: createTestMoney(15),
        frequency: 'monthly',
        category: 'streaming',
        priority: 'useful',
      });

      manager.addSubscription({
        userId: 'user-1',
        name: 'Spotify',
        provider: 'Spotify',
        amount: createTestMoney(10),
        frequency: 'monthly',
        category: 'streaming',
        priority: 'useful',
      });

      const report = manager.generateReport('user-1');

      expect(report.subscriptionCount).toBe(2);
      expect(report.totalMonthly.amount).toBe(25);
      expect(report.totalYearly.amount).toBe(300);
      expect(report.byCategory.streaming.count).toBe(2);
    });
  });

  describe('aggressive mode', () => {
    it('should identify all cancel candidates', () => {
      manager.addSubscription({
        userId: 'user-1',
        name: 'Unused 1',
        provider: 'Test',
        amount: createTestMoney(20),
        frequency: 'monthly',
        priority: 'unused',
      });

      manager.addSubscription({
        userId: 'user-1',
        name: 'Useful',
        provider: 'Test',
        amount: createTestMoney(10),
        frequency: 'monthly',
        priority: 'essential',
      });

      const cancelList = manager.getJustCancelList('user-1');

      expect(cancelList.length).toBe(1);
      expect(cancelList[0].subscription.name).toBe('Unused 1');
    });
  });
});

// =============================================================================
// DealFinder Tests
// =============================================================================

describe('DealFinder', () => {
  let finder: DealFinder;

  beforeEach(() => {
    finder = createDealFinder();
  });

  describe('wishlist', () => {
    it('should add to wishlist', () => {
      const item = finder.addToWishlist({
        userId: 'user-1',
        name: 'MacBook Pro',
        url: 'https://apple.com/macbook',
        targetPrice: createTestMoney(1800),
        priority: 'high',
      });

      expect(item.id).toBeDefined();
      expect(item.name).toBe('MacBook Pro');
    });

    it('should get user wishlist sorted by priority', () => {
      finder.addToWishlist({ userId: 'user-1', name: 'Low', priority: 'low' });
      finder.addToWishlist({ userId: 'user-1', name: 'High', priority: 'high' });
      finder.addToWishlist({ userId: 'user-1', name: 'Medium', priority: 'medium' });

      const wishlist = finder.getUserWishlist('user-1');

      expect(wishlist[0].name).toBe('High');
      expect(wishlist[1].name).toBe('Medium');
      expect(wishlist[2].name).toBe('Low');
    });
  });

  describe('deals', () => {
    it('should add deal', () => {
      const deal = finder.addDeal({
        type: 'price_drop',
        title: 'iPhone 15 Pro Sale',
        description: 'Limited time offer',
        originalPrice: createTestMoney(999),
        dealPrice: createTestMoney(899),
        url: 'https://example.com/deal',
        source: 'test',
        verified: true,
      });

      expect(deal.id).toBeDefined();
      expect(deal.savings.amount).toBe(100);
      expect(deal.savingsPercent).toBe(10);
    });

    it('should match deals with wishlist', () => {
      finder.addToWishlist({ userId: 'user-1', name: 'iPhone 15' });

      const deal = finder.addDeal({
        type: 'price_drop',
        title: 'iPhone 15 Deal',
        description: 'Sale',
        dealPrice: createTestMoney(800),
        url: 'https://example.com',
        source: 'test',
      });

      expect(deal.matchedWishlistItems?.length).toBeGreaterThan(0);
    });
  });

  describe('coupons', () => {
    it('should add coupon', () => {
      const coupon = finder.addCoupon({
        code: 'SAVE20',
        description: '20% off',
        discountType: 'percentage',
        discountValue: 20,
        merchant: 'TestStore',
        verified: true,
      });

      expect(coupon.code).toBe('SAVE20');
      expect(coupon.verified).toBe(true);
    });

    it('should find coupons for merchant', () => {
      finder.addCoupon({
        code: 'CODE1',
        description: 'Discount 1',
        discountType: 'percentage',
        discountValue: 10,
        merchant: 'Amazon',
        verified: true,
      });

      finder.addCoupon({
        code: 'CODE2',
        description: 'Discount 2',
        discountType: 'fixed',
        discountValue: 25,
        merchant: 'Amazon',
      });

      const coupons = finder.findCoupons('amazon');

      expect(coupons).toHaveLength(2);
      expect(coupons[0].verified).toBe(true); // verified first
    });

    it('should find best coupon for purchase', () => {
      finder.addCoupon({
        code: 'PERCENT10',
        description: '10%',
        discountType: 'percentage',
        discountValue: 10,
        merchant: 'Store',
      });

      finder.addCoupon({
        code: 'FLAT25',
        description: '$25 off',
        discountType: 'fixed',
        discountValue: 25,
        merchant: 'Store',
      });

      const best = finder.getBestCoupon('store', createTestMoney(100));

      expect(best?.code).toBe('FLAT25'); // $25 > $10 (10% of 100)
    });
  });

  describe('cashback', () => {
    it('should add cashback offer', () => {
      const offer = finder.addCashbackOffer({
        merchant: 'Amazon',
        platform: 'Rakuten',
        cashbackPercent: 5,
        activationUrl: 'https://rakuten.com/amazon',
      });

      expect(offer.id).toBeDefined();
      expect(offer.cashbackPercent).toBe(5);
    });

    it('should calculate potential cashback', () => {
      finder.addCashbackOffer({
        merchant: 'BestBuy',
        platform: 'Test',
        cashbackPercent: 3,
        activationUrl: 'https://example.com',
      });

      const cashback = finder.calculateCashback('BestBuy', createTestMoney(500));

      expect(cashback?.amount).toBe(15); // 3% of 500
    });
  });
});

// =============================================================================
// MoneyMakers Integration Tests
// =============================================================================

describe('MoneyMakers', () => {
  let moneyMakers: MoneyMakers;

  beforeEach(() => {
    moneyMakers = createMoneyMakers();
  });

  it('should create with all components', () => {
    expect(moneyMakers.negotiator).toBeDefined();
    expect(moneyMakers.shopping).toBeDefined();
    expect(moneyMakers.priceMonitor).toBeDefined();
    expect(moneyMakers.insuranceClaims).toBeDefined();
    expect(moneyMakers.expenseTracker).toBeDefined();
    expect(moneyMakers.billReminder).toBeDefined();
    expect(moneyMakers.subscriptions).toBeDefined();
    expect(moneyMakers.dealFinder).toBeDefined();
  });

  describe('quick access methods', () => {
    it('should start negotiation', async () => {
      const negotiation = await moneyMakers.startNegotiation({
        userId: 'user-1',
        type: 'car_purchase',
        description: 'New car',
        targetItem: 'Honda Accord',
        maxBudget: createTestMoney(30000),
        dealers: ['dealer@example.com'],
      });

      expect(negotiation.id).toBeDefined();
    });

    it('should track price', () => {
      const item = moneyMakers.trackPrice({
        userId: 'user-1',
        name: 'Test Product',
        url: 'https://example.com/product',
        targetPrice: createTestMoney(100),
      });

      expect(item.id).toBeDefined();
      expect(item.category).toBe('product');
    });

    it('should log expense', () => {
      const expense = moneyMakers.logExpense('user-1', 'Spent $50 at grocery store');

      expect(expense.amount.amount).toBe(50);
    });
  });

  describe('financial overview', () => {
    it('should get financial overview', async () => {
      // Add some data
      moneyMakers.logExpense('user-1', '$100 on groceries');

      moneyMakers.billReminder.addBill({
        userId: 'user-1',
        name: 'Test Bill',
        payee: 'Test',
        amount: createTestMoney(50),
        dueDate: Date.now() + 86400000,
        frequency: 'monthly',
      });

      moneyMakers.subscriptions.addSubscription({
        userId: 'user-1',
        name: 'Netflix',
        provider: 'Netflix',
        amount: createTestMoney(15),
        frequency: 'monthly',
      });

      const overview = await moneyMakers.getFinancialOverview('user-1');

      expect(overview.monthlyExpenses).toBeDefined();
      expect(overview.monthlyBills).toBeDefined();
      expect(overview.monthlySubscriptions).toBeDefined();
      expect(overview.totalMonthlyCommitment).toBeDefined();
    });
  });

  describe('savings opportunities', () => {
    it('should identify savings opportunities', () => {
      moneyMakers.subscriptions.addSubscription({
        userId: 'user-1',
        name: 'Unused Sub',
        provider: 'Test',
        amount: createTestMoney(20),
        frequency: 'monthly',
        priority: 'unused',
        usageFrequency: 'never', // Add this to ensure low score
      });

      const opportunities = moneyMakers.getSavingsOpportunities('user-1');

      expect(opportunities.subscriptionsToCancel.length).toBeGreaterThan(0);
    });
  });
});
