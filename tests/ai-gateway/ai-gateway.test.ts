/**
 * AI Gateway Module Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AIGateway,
  createAIGateway,
  ProviderRegistry,
  createProviderRegistry,
  ModelRouter,
  createModelRouter,
  BudgetManager,
  createBudgetManager,
  createBudgetStore,
  UsageTracker,
  createUsageTracker,
  createUsageStore,
  CostEstimator,
  createCostEstimator,
  TokenCounter,
  LoopDetector,
  createLoopDetector,
  RateLimiter,
  createRateLimiter,
  checkRateLimit,
  withRateLimit,
  AIGatewayError,
  AI_GATEWAY_EVENTS,
  RATE_LIMIT_CONFIGS,
  DEFAULT_MODELS,
} from '../../src/ai-gateway/index.js';
import type {
  AIProvider,
  AIRequestOptions,
  AIResponse,
  AIMessage,
  BudgetConfig,
  RouteConfig,
  LoopPattern,
} from '../../src/ai-gateway/types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestRequest(overrides?: Partial<AIRequestOptions>): AIRequestOptions {
  return {
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello, how are you?' },
    ],
    ...overrides,
  };
}

function createTestResponse(overrides?: Partial<AIResponse>): AIResponse {
  return {
    id: 'resp-1',
    provider: 'openai',
    model: 'gpt-4o-mini',
    message: { role: 'assistant', content: 'I am doing well, thank you!' },
    finishReason: 'stop',
    usage: {
      promptTokens: 50,
      completionTokens: 20,
      totalTokens: 70,
    },
    latencyMs: 500,
    ...overrides,
  };
}

// =============================================================================
// Provider Registry Tests
// =============================================================================

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = createProviderRegistry();
  });

  afterEach(() => {
    registry.stopHealthChecks();
  });

  describe('provider management', () => {
    it('should register a provider', () => {
      registry.registerProvider({
        provider: 'openai',
        apiKey: 'test-key',
      });

      expect(registry.getProvider('openai')).toBeDefined();
      expect(registry.getProviderInfo('openai')?.status).toBe('unknown');
    });

    it('should throw for unknown provider', () => {
      expect(() => {
        registry.registerProvider({
          provider: 'unknown-provider' as AIProvider,
          apiKey: 'test',
        });
      }).toThrow();
    });

    it('should unregister a provider', () => {
      registry.registerProvider({ provider: 'openai', apiKey: 'test' });
      expect(registry.unregisterProvider('openai')).toBe(true);
      expect(registry.getProvider('openai')).toBeUndefined();
    });

    it('should get available providers', () => {
      registry.registerProvider({ provider: 'openai', apiKey: 'test' });
      registry.registerProvider({ provider: 'anthropic', apiKey: 'test', enabled: false });

      const available = registry.getAvailableProviders();
      expect(available).toContain('openai');
      expect(available).not.toContain('anthropic');
    });

    it('should check provider capabilities', () => {
      registry.registerProvider({ provider: 'openai', apiKey: 'test' });

      expect(registry.hasCapability('openai', 'chat')).toBe(true);
      expect(registry.hasCapability('openai', 'function_calling')).toBe(true);
    });
  });

  describe('model management', () => {
    it('should include default models', () => {
      expect(registry.getAllModels().length).toBeGreaterThan(0);
      expect(registry.getModel('gpt-4o')).toBeDefined();
    });

    it('should register custom model', () => {
      registry.registerModel({
        id: 'custom-model',
        provider: 'openai',
        name: 'Custom Model',
        tier: 'standard',
        capabilities: ['chat'],
        contextWindow: 4096,
        costPerInputToken: 0.001,
        costPerOutputToken: 0.002,
        enabled: true,
      });

      expect(registry.getModel('custom-model')).toBeDefined();
    });

    it('should get models by capability', () => {
      registry.registerProvider({ provider: 'openai', apiKey: 'test' });

      const chatModels = registry.getModelsByCapability('chat');
      expect(chatModels.length).toBeGreaterThan(0);

      const embeddingModels = registry.getModelsByCapability('embedding');
      expect(embeddingModels.length).toBeGreaterThan(0);
    });

    it('should find best model for capability', () => {
      registry.registerProvider({ provider: 'openai', apiKey: 'test' });

      const best = registry.findBestModel('chat');
      expect(best).toBeDefined();
      expect(best?.capabilities).toContain('chat');
    });
  });

  describe('status tracking', () => {
    it('should track success', () => {
      registry.registerProvider({ provider: 'openai', apiKey: 'test' });

      registry.recordSuccess('openai', 100);

      const info = registry.getProviderInfo('openai');
      expect(info?.successCount).toBe(1);
      expect(info?.latencyMs).toBe(100);
    });

    it('should track errors', () => {
      registry.registerProvider({ provider: 'openai', apiKey: 'test' });

      registry.recordError('openai');

      const info = registry.getProviderInfo('openai');
      expect(info?.errorCount).toBe(1);
    });

    it('should mark provider as degraded after errors', () => {
      registry.registerProvider({ provider: 'openai', apiKey: 'test' });

      // Trigger enough errors to degrade
      for (let i = 0; i < 3; i++) {
        registry.recordError('openai');
      }

      const info = registry.getProviderInfo('openai');
      expect(info?.status).toBe('degraded');
    });

    it('should mark provider as unavailable after threshold', () => {
      registry.registerProvider({ provider: 'openai', apiKey: 'test' });

      // Trigger enough errors to mark unavailable
      for (let i = 0; i < 5; i++) {
        registry.recordError('openai');
      }

      const info = registry.getProviderInfo('openai');
      expect(info?.status).toBe('unavailable');
    });

    it('should reset errors', () => {
      registry.registerProvider({ provider: 'openai', apiKey: 'test' });

      registry.recordError('openai');
      registry.resetErrors('openai');

      const info = registry.getProviderInfo('openai');
      expect(info?.errorCount).toBe(0);
    });
  });
});

// =============================================================================
// Cost Estimator Tests
// =============================================================================

describe('CostEstimator', () => {
  let registry: ProviderRegistry;
  let estimator: CostEstimator;

  beforeEach(() => {
    registry = createProviderRegistry();
    registry.registerProvider({ provider: 'openai', apiKey: 'test' });
    estimator = createCostEstimator(registry);
  });

  describe('token counting', () => {
    it('should count tokens in string', () => {
      const counter = new TokenCounter();
      const tokens = counter.countTokens('Hello, world!');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should count message tokens', () => {
      const counter = new TokenCounter();
      const tokens = counter.countMessageTokens([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should count tool tokens', () => {
      const counter = new TokenCounter();
      const tokens = counter.countToolTokens([
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather for a location',
            parameters: { type: 'object', properties: {} },
          },
        },
      ]);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('cost estimation', () => {
    it('should estimate cost for request', () => {
      const request = createTestRequest();
      const estimate = estimator.estimate(request, 'gpt-4o-mini');

      expect(estimate.model).toBe('gpt-4o-mini');
      expect(estimate.provider).toBe('openai');
      expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedOutputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedCostCents).toBeGreaterThan(0);
    });

    it('should estimate with default pricing for unknown model', () => {
      const request = createTestRequest({ model: 'unknown-model' });
      const estimate = estimator.estimate(request);

      expect(estimate.estimatedCostCents).toBeGreaterThan(0);
      expect(estimate.confidence).toBeLessThan(1);
    });

    it('should find cheapest model', () => {
      const request = createTestRequest();
      const cheapest = estimator.findCheapestModel(request);

      expect(cheapest).toBeDefined();
      expect(cheapest?.estimatedCostCents).toBeDefined();
    });

    it('should calculate actual cost', () => {
      const cost = estimator.calculateActualCost('gpt-4o-mini', 1000, 500);
      expect(cost).toBeGreaterThan(0);
    });

    it('should get cost per 1K tokens', () => {
      const costPer1K = estimator.getCostPer1K('gpt-4o-mini');
      expect(costPer1K.input).toBeGreaterThan(0);
      expect(costPer1K.output).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Model Router Tests
// =============================================================================

describe('ModelRouter', () => {
  let registry: ProviderRegistry;
  let estimator: CostEstimator;
  let router: ModelRouter;

  beforeEach(() => {
    registry = createProviderRegistry();
    registry.registerProvider({ provider: 'openai', apiKey: 'test' });
    registry.registerProvider({ provider: 'anthropic', apiKey: 'test' });
    estimator = createCostEstimator(registry);
    router = createModelRouter(registry, estimator);
  });

  describe('model selection', () => {
    it('should select specific model when requested', () => {
      const request = createTestRequest({ model: 'gpt-4o' });
      const decision = router.selectModel(request);

      expect(decision.selectedModel).toBe('gpt-4o');
      expect(decision.selectedProvider).toBe('openai');
    });

    it('should throw for non-existent model', () => {
      const request = createTestRequest({ model: 'non-existent' });

      expect(() => router.selectModel(request)).toThrow(AIGatewayError);
    });

    it('should auto-select model with cost_optimized strategy', () => {
      const request = createTestRequest();
      const decision = router.selectModel(request);

      expect(decision.selectedModel).toBeDefined();
      expect(decision.reason).toBe('Lowest cost model');
    });

    it('should respect model criteria', () => {
      const request = createTestRequest();
      const decision = router.selectModel(request, undefined, {
        preferredProviders: ['anthropic'],
      });

      expect(decision.selectedProvider).toBe('anthropic');
    });
  });

  describe('routing strategies', () => {
    it('should use cost_optimized strategy', () => {
      router.registerRoute({
        id: 'cheap',
        name: 'Cheap Route',
        strategy: 'cost_optimized',
        enabled: true,
      });

      const request = createTestRequest();
      const decision = router.selectModel(request, 'cheap');

      // The router uses the strategy from the route but returns 'auto' as routeId
      expect(decision.reason).toBe('Lowest cost model');
      expect(decision.selectedModel).toBeDefined();
    });

    it('should use quality_optimized strategy', () => {
      router.registerRoute({
        id: 'quality',
        name: 'Quality Route',
        strategy: 'quality_optimized',
        enabled: true,
      });

      const request = createTestRequest();
      const decision = router.selectModel(request, 'quality');

      expect(decision.reason).toBe('Highest quality model');
    });

    it('should use round_robin strategy', () => {
      router.registerRoute({
        id: 'rr',
        name: 'Round Robin',
        strategy: 'round_robin',
        enabled: true,
      });

      const request = createTestRequest();
      const decision1 = router.selectModel(request, 'rr');
      const decision2 = router.selectModel(request, 'rr');

      // May or may not be different depending on number of candidates
      expect(decision1.selectedModel).toBeDefined();
      expect(decision2.selectedModel).toBeDefined();
    });
  });

  describe('fallback handling', () => {
    it('should provide fallback model', () => {
      const request = createTestRequest();
      const fallback = router.getFallback('gpt-4o', request);

      expect(fallback).toBeDefined();
      expect(fallback?.selectedModel).not.toBe('gpt-4o');
    });

    it('should use fallback chain if defined', () => {
      router.registerRoute({
        id: 'with-fallback',
        name: 'With Fallback',
        strategy: 'failover',
        fallbackChain: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
        enabled: true,
      });

      const request = createTestRequest();
      const fallback = router.getFallback('gpt-4o', request, 'with-fallback');

      expect(fallback?.selectedModel).toBe('gpt-4o-mini');
    });
  });
});

// =============================================================================
// Budget Manager Tests
// =============================================================================

describe('BudgetManager', () => {
  let manager: BudgetManager;
  let budgetId: string;

  beforeEach(async () => {
    const store = createBudgetStore('memory');
    manager = createBudgetManager(store);
  });

  describe('budget lifecycle', () => {
    it('should create budget', async () => {
      const budget = await manager.createBudget('Test Budget', 1000, 'daily', {
        alertThresholds: [50, 75, 90],
        hardLimit: false,
        rollover: false,
      });

      budgetId = budget.id;
      const retrieved = await manager.getBudget(budgetId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.limitCents).toBe(1000);
    });

    it('should update budget', async () => {
      const budget = await manager.createBudget('Test Budget', 1000, 'daily', {
        alertThresholds: [50],
        hardLimit: false,
        rollover: false,
      });

      await manager.updateBudget(budget.id, { limitCents: 2000 });
      const updated = await manager.getBudget(budget.id);

      expect(updated?.limitCents).toBe(2000);
    });

    it('should delete budget', async () => {
      const budget = await manager.createBudget('Test Budget', 1000, 'daily', {
        alertThresholds: [50],
        hardLimit: false,
        rollover: false,
      });

      await manager.deleteBudget(budget.id);
      const deleted = await manager.getBudget(budget.id);

      expect(deleted).toBeNull();
    });
  });

  describe('spending tracking', () => {
    beforeEach(async () => {
      const budget = await manager.createBudget('Test Budget', 1000, 'daily', {
        alertThresholds: [50, 75, 90],
        hardLimit: false,
        rollover: false,
      });
      budgetId = budget.id;
    });

    it('should record spending', async () => {
      await manager.recordSpending(budgetId, 100);
      const status = await manager.getStatus(budgetId);

      expect(status?.spentCents).toBe(100);
      expect(status?.remainingCents).toBe(900);
    });

    it('should check budget availability', async () => {
      const canSpend = await manager.canSpend(budgetId, 500);
      const status = await manager.getStatus(budgetId);

      expect(canSpend).toBe(true);
      expect(status?.percentUsed).toBe(0);
    });

    it('should warn when approaching limit', async () => {
      const events: any[] = [];
      const store = createBudgetStore('memory');
      const managerWithEvents = createBudgetManager(store, {
        onEvent: (event, data) => events.push({ event, data }),
      });

      const budget = await managerWithEvents.createBudget('Test', 100, 'daily', {
        alertThresholds: [50],
        hardLimit: false,
        rollover: false,
      });

      await managerWithEvents.recordSpending(budget.id, 60);

      expect(events.some(e => e.event === AI_GATEWAY_EVENTS.BUDGET_WARNING)).toBe(true);
    });

    it('should block when hard limit exceeded', async () => {
      const store = createBudgetStore('memory');
      const hardManager = createBudgetManager(store);

      const budget = await hardManager.createBudget('Hard Limit', 100, 'daily', {
        alertThresholds: [50],
        hardLimit: true,
        rollover: false,
      });

      // Spend 90 out of 100
      await hardManager.recordSpending(budget.id, 90);

      // Check if we can spend 20 more (should be false since only 10 remaining)
      const canSpend = await hardManager.canSpend(budget.id, 20);
      const status = await hardManager.getStatus(budget.id);

      expect(canSpend).toBe(false);
      expect(status?.spentCents).toBe(90);
      expect(status?.remainingCents).toBe(10);
    });
  });
});

// =============================================================================
// Usage Tracker Tests
// =============================================================================

describe('UsageTracker', () => {
  let tracker: UsageTracker;

  beforeEach(() => {
    const store = createUsageStore('memory');
    tracker = createUsageTracker(store);
  });

  describe('recording', () => {
    it('should record usage', async () => {
      const id = await tracker.record({
        userId: 'user-1',
        requestId: 'req-1',
        provider: 'openai',
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costCents: 10,
        latencyMs: 500,
        success: true,
        timestamp: Date.now(),
      });

      expect(id).toBeDefined();
    });

    it('should retrieve records', async () => {
      await tracker.record({
        userId: 'user-1',
        requestId: 'req-1',
        provider: 'openai',
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costCents: 10,
        latencyMs: 500,
        success: true,
        timestamp: Date.now(),
      });

      const records = await tracker.getRecords({ userId: 'user-1' });
      expect(records.length).toBe(1);
      expect(records[0].model).toBe('gpt-4o');
    });
  });

  describe('summaries', () => {
    beforeEach(async () => {
      // Add test records
      for (let i = 0; i < 5; i++) {
        await tracker.record({
          userId: 'user-1',
          requestId: `req-${i}`,
          provider: 'openai',
          model: 'gpt-4o',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costCents: 10,
          latencyMs: 500,
          success: i < 4, // 4 successful, 1 failed
          timestamp: Date.now(),
        });
      }
    });

    it('should generate summary', async () => {
      const summary = await tracker.getSummary({ userId: 'user-1' });

      expect(summary.totalRequests).toBe(5);
      expect(summary.successfulRequests).toBe(4);
      expect(summary.failedRequests).toBe(1);
      expect(summary.totalTokens).toBe(750);
      expect(summary.totalCostCents).toBe(50);
    });

    it('should summarize by provider', async () => {
      const summary = await tracker.getSummary({ userId: 'user-1' });

      expect(summary.byProvider['openai']).toBeDefined();
      expect(summary.byProvider['openai'].requests).toBe(5);
    });

    it('should summarize by model', async () => {
      const summary = await tracker.getSummary({ userId: 'user-1' });

      expect(summary.byModel['gpt-4o']).toBeDefined();
      expect(summary.byModel['gpt-4o'].tokens).toBe(750);
    });
  });
});

// =============================================================================
// Loop Detector Tests
// =============================================================================

describe('LoopDetector', () => {
  let detector: LoopDetector;

  beforeEach(() => {
    detector = createLoopDetector();
  });

  describe('exact match detection', () => {
    it('should detect exact message repetition', () => {
      const conversationId = 'conv-1';
      const messages: AIMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      // Add to history multiple times
      detector.addToHistory(conversationId, messages);
      detector.addToHistory(conversationId, messages);
      detector.addToHistory(conversationId, messages);

      const result = detector.detect(conversationId, messages);

      expect(result.isLoop).toBe(true);
      expect(result.loopType).toBe('exact');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should not flag normal conversation', () => {
      const conversationId = 'conv-2';

      detector.addToHistory(conversationId, [
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: 'The answer is 4.' },
      ]);

      const result = detector.detect(conversationId, [
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'Paris is the capital of France.' },
      ]);

      expect(result.isLoop).toBe(false);
    });
  });

  describe('semantic similarity detection', () => {
    it('should detect semantically similar responses', () => {
      const conversationId = 'conv-3';

      // Add similar messages with slight variations
      detector.addToHistory(conversationId, [
        { role: 'assistant', content: 'I cannot help with that request.' },
      ]);
      detector.addToHistory(conversationId, [
        { role: 'assistant', content: 'I am unable to help with that request.' },
      ]);
      detector.addToHistory(conversationId, [
        { role: 'assistant', content: 'I cannot assist with that request.' },
      ]);

      const result = detector.detect(conversationId, [
        { role: 'assistant', content: 'I cannot help you with that request.' },
      ]);

      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('pattern detection', () => {
    it('should detect custom patterns', () => {
      const conversationId = 'conv-4';

      detector.addPattern({
        id: 'error-pattern',
        type: 'regex',
        pattern: 'error|failed|cannot',
        threshold: 3,
        windowSize: 10,
        action: 'warn',
      });

      detector.addToHistory(conversationId, [
        { role: 'assistant', content: 'An error occurred.' },
        { role: 'assistant', content: 'The operation failed.' },
        { role: 'assistant', content: 'I cannot process that.' },
      ]);

      const result = detector.detect(conversationId, [
        { role: 'assistant', content: 'Another error happened.' },
      ]);

      expect(result.isLoop).toBe(true);
      expect(result.loopType).toBe('pattern');
    });

    it('should remove patterns', () => {
      detector.addPattern({
        id: 'test-pattern',
        type: 'exact',
        pattern: 'test',
        threshold: 1,
        windowSize: 5,
        action: 'stop',
      });

      expect(detector.removePattern('test-pattern')).toBe(true);
      expect(detector.removePattern('non-existent')).toBe(false);
    });
  });

  describe('history management', () => {
    it('should clear history for conversation', () => {
      const conversationId = 'conv-5';

      detector.addToHistory(conversationId, [
        { role: 'user', content: 'Hello' },
      ]);

      detector.clearHistory(conversationId);

      // After clearing, no loop should be detected
      const result = detector.detect(conversationId, [
        { role: 'user', content: 'Hello' },
      ]);

      expect(result.isLoop).toBe(false);
    });

    it('should clear all history', () => {
      detector.addToHistory('conv-1', [{ role: 'user', content: 'A' }]);
      detector.addToHistory('conv-2', [{ role: 'user', content: 'B' }]);

      detector.clearAllHistory();

      expect(detector.detect('conv-1', [{ role: 'user', content: 'A' }]).isLoop).toBe(false);
      expect(detector.detect('conv-2', [{ role: 'user', content: 'B' }]).isLoop).toBe(false);
    });
  });
});

// =============================================================================
// Rate Limiter Tests
// =============================================================================

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = createRateLimiter();
  });

  describe('tier management', () => {
    it('should set tier for user', () => {
      limiter.setTier('user-1', 'premium');
      const status = limiter.getStatus('user-1');

      expect(status.tier).toBe('premium');
    });

    it('should default to standard tier', () => {
      const status = limiter.getStatus('new-user');
      expect(status.tier).toBe('standard');
    });
  });

  describe('request checking', () => {
    it('should allow requests within limit', () => {
      const status = limiter.checkRequest('user-1');

      expect(status.isLimited).toBe(false);
      expect(status.requestsRemaining.minute).toBeGreaterThan(0);
    });

    it('should block when rate limited', () => {
      limiter.setTier('user-1', 'free');

      // Exhaust the minute limit (10 for free tier)
      for (let i = 0; i < 10; i++) {
        limiter.consumeRequest('user-1');
      }

      const status = limiter.checkRequest('user-1');
      expect(status.isLimited).toBe(true);
      expect(status.retryAfter).toBeDefined();
    });

    it('should track token usage', () => {
      limiter.consumeRequest('user-1', 1000);
      const status = limiter.getStatus('user-1');

      expect(status.tokensRemaining.minute).toBeLessThan(RATE_LIMIT_CONFIGS.standard.tokensPerMinute);
    });
  });

  describe('concurrent requests', () => {
    it('should track concurrent requests', () => {
      limiter.setTier('user-1', 'free'); // 2 concurrent max

      limiter.consumeRequest('user-1');
      limiter.consumeRequest('user-1');

      const status = limiter.checkRequest('user-1');
      expect(status.isLimited).toBe(true);
    });

    it('should release concurrent slots', () => {
      limiter.setTier('user-1', 'free');

      limiter.consumeRequest('user-1');
      limiter.consumeRequest('user-1');
      limiter.releaseRequest('user-1');

      const status = limiter.checkRequest('user-1');
      expect(status.isLimited).toBe(false);
    });
  });

  describe('middleware helpers', () => {
    it('should check rate limit', () => {
      const result = checkRateLimit(limiter, 'user-1');

      expect(result.allowed).toBe(true);
      expect(result.status).toBeDefined();
    });

    it('should block when limited', () => {
      limiter.setTier('user-1', 'free');

      for (let i = 0; i < 10; i++) {
        limiter.consumeRequest('user-1');
      }

      const result = checkRateLimit(limiter, 'user-1');

      expect(result.allowed).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('RATE_LIMITED');
    });

    it('should wrap function with rate limiting', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRateLimit(limiter, 'user-1', fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should reject when rate limited', async () => {
      limiter.setTier('user-1', 'free');

      for (let i = 0; i < 10; i++) {
        limiter.consumeRequest('user-1');
      }

      const fn = vi.fn().mockResolvedValue('success');

      await expect(withRateLimit(limiter, 'user-1', fn)).rejects.toThrow();
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('reset and tracking', () => {
    it('should reset limits for user', () => {
      limiter.consumeRequest('user-1');
      limiter.consumeRequest('user-1');

      limiter.resetLimits('user-1');

      const status = limiter.getStatus('user-1');
      expect(status.requestsRemaining.minute).toBe(RATE_LIMIT_CONFIGS.standard.requestsPerMinute);
    });

    it('should track users', () => {
      limiter.consumeRequest('user-1');
      limiter.consumeRequest('user-2');

      const users = limiter.getTrackedUsers();
      expect(users).toContain('user-1');
      expect(users).toContain('user-2');
    });
  });
});

// =============================================================================
// AI Gateway Integration Tests
// =============================================================================

describe('AIGateway', () => {
  let gateway: AIGateway;

  beforeEach(async () => {
    gateway = createAIGateway({
      defaultStrategy: 'cost_optimized',
      enableLoopDetection: true,
      enableUsageTracking: true,
    });

    gateway.registerProvider({ provider: 'openai', apiKey: 'test' });
    gateway.registerProvider({ provider: 'anthropic', apiKey: 'test' });

    await gateway.initialize();
  });

  afterEach(async () => {
    await gateway.shutdown();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const newGateway = createAIGateway();
      await newGateway.initialize();
      await newGateway.shutdown();
    });

    it('should set up default budget if configured', async () => {
      const gatewayWithBudget = createAIGateway({
        defaultBudget: {
          dailyLimit: 1000,
          monthlyLimit: 10000,
        },
      });

      await gatewayWithBudget.initialize();

      const dailyStatus = await gatewayWithBudget.getBudgetStatus('default-daily');
      expect(dailyStatus).toBeDefined();

      await gatewayWithBudget.shutdown();
    });
  });

  describe('provider management', () => {
    it('should get available providers', () => {
      const providers = gateway.getAvailableProviders();

      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
    });

    it('should get provider status', () => {
      const status = gateway.getProviderStatus('openai');

      expect(status).toBeDefined();
      expect(status?.provider).toBe('openai');
    });
  });

  describe('model selection', () => {
    it('should select model for request', () => {
      const request = createTestRequest();
      const decision = gateway.selectModel(request);

      expect(decision.selectedModel).toBeDefined();
      expect(decision.selectedProvider).toBeDefined();
    });

    it('should get enabled models', () => {
      const models = gateway.getEnabledModels();
      expect(models.length).toBeGreaterThan(0);
    });
  });

  describe('cost estimation', () => {
    it('should estimate cost', () => {
      const request = createTestRequest();
      const estimate = gateway.estimateCost(request, 'gpt-4o-mini');

      expect(estimate.estimatedCostCents).toBeGreaterThan(0);
    });

    it('should find cheapest model', () => {
      const request = createTestRequest();
      const cheapest = gateway.findCheapestModel(request);

      expect(cheapest).toBeDefined();
    });
  });

  describe('rate limiting', () => {
    it('should set and check rate limit', () => {
      gateway.setRateLimitTier('user-1', 'premium');
      const status = gateway.checkRateLimit('user-1');

      expect(status.tier).toBe('premium');
      expect(status.isLimited).toBe(false);
    });
  });

  describe('loop detection', () => {
    it('should detect loops', () => {
      const messages: AIMessage[] = [
        { role: 'user', content: 'Repeat after me' },
        { role: 'assistant', content: 'Repeat after me' },
      ];

      // Add to history multiple times
      gateway.addToLoopHistory('conv-1', messages);
      gateway.addToLoopHistory('conv-1', messages);
      gateway.addToLoopHistory('conv-1', messages);

      const result = gateway.detectLoop('conv-1', messages);
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('preflight check', () => {
    it('should perform preflight check', async () => {
      const request = createTestRequest();
      const result = await gateway.preflightCheck('user-1', request);

      expect(result.allowed).toBe(true);
      expect(result.decision).toBeDefined();
      expect(result.estimate).toBeDefined();
      expect(result.rateLimitStatus).toBeDefined();
    });

    it('should block rate limited requests', async () => {
      gateway.setRateLimitTier('limited-user', 'free');

      // Exhaust rate limit
      for (let i = 0; i < 10; i++) {
        gateway.consumeRateLimit('limited-user');
      }

      const request = createTestRequest();
      const result = await gateway.preflightCheck('limited-user', request);

      expect(result.allowed).toBe(false);
      expect(result.error?.code).toBe('RATE_LIMITED');
    });

    it('should check budget', async () => {
      const budget = await gateway.createBudget('Test', 10, 'daily', {
        alertThresholds: [50],
        hardLimit: true,
        rollover: false,
      });

      await gateway.recordSpending(budget.id, 10);

      const request = createTestRequest();
      const result = await gateway.preflightCheck('user-1', request, {
        budgetId: budget.id,
      });

      expect(result.allowed).toBe(false);
      expect(result.error?.code).toBe('BUDGET_EXCEEDED');
    });
  });

  describe('completion recording', () => {
    it('should record completion', async () => {
      const response = createTestResponse();

      await gateway.recordCompletion('user-1', response);

      const summary = await gateway.getUsageSummary({ userId: 'user-1' });
      expect(summary.totalRequests).toBe(1);
    });

    it('should record failure', async () => {
      await gateway.recordFailure('user-1', 'openai', 'gpt-4o', new Error('Test error'));

      const summary = await gateway.getUsageSummary({ userId: 'user-1' });
      expect(summary.failedRequests).toBe(1);
    });
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('AIGatewayError', () => {
  it('should create error with all properties', () => {
    const error = new AIGatewayError(
      'RATE_LIMITED',
      'Rate limit exceeded',
      429,
      5000,
      'openai'
    );

    expect(error.code).toBe('RATE_LIMITED');
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.statusCode).toBe(429);
    expect(error.retryAfter).toBe(5000);
    expect(error.provider).toBe('openai');
    expect(error.name).toBe('AIGatewayError');
  });

  it('should extend Error', () => {
    const error = new AIGatewayError('UNKNOWN_ERROR', 'Something went wrong');
    expect(error instanceof Error).toBe(true);
  });
});
