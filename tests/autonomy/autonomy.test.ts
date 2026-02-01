/**
 * Autonomy Module Tests
 * Comprehensive tests for agentic autonomy capabilities
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  // Manager
  AutonomyManager,
  createAutonomyManager,
  // Types
  type Goal,
  type Plan,
  type PlanStep,
  type ToolChain,
  type ExecutionSession,
  type TrackedFailure,
  type ActionClassification,
  // Planning
  GoalPlanner,
  createGoalPlanner,
  PlanValidator,
  createPlanValidator,
  // Execution
  AgenticLoop,
  createAgenticLoop,
  Evaluator,
  createEvaluator,
  // Chaining
  ToolChainOrchestrator,
  createToolChainOrchestrator,
  ChainBuilder,
  ChainStepBuilder,
  VariableRegistry,
  createVariableRegistry,
  // Correction
  CorrectionEngine,
  createCorrectionEngine,
  FailureTracker,
  createFailureTracker,
  StrategySelector,
  createStrategySelector,
  SessionLearner,
  createSessionLearner,
  // Approval
  PermissionManager,
  createPermissionManager,
  SensitivityClassifier,
  createSensitivityClassifier,
  ConfirmationBuilder,
  createConfirmationBuilder,
  // Stores
  InMemoryExecutionStore,
  InMemoryPlanStore,
  createExecutionStore,
  createPlanStore,
  // Constants
  AUTONOMY_EVENTS,
  CORRECTION_STRATEGIES,
} from '../../src/autonomy/index.js';

// Mock tool executor
const createMockToolExecutor = () => ({
  execute: vi.fn().mockResolvedValue({ success: true, data: 'mock result' }),
  getAvailableTools: () => ['search', 'calculate', 'send_email'],
});

describe('GoalPlanner', () => {
  let planner: GoalPlanner;

  beforeEach(() => {
    planner = createGoalPlanner();
  });

  describe('goal creation', () => {
    it('should create a goal from input', () => {
      const goal = planner.createGoal({
        description: 'Research AI developments',
        priority: 'high',
        constraints: ['Use reputable sources'],
      });

      expect(goal.id).toBeDefined();
      expect(goal.description).toBe('Research AI developments');
      expect(goal.priority).toBe('high');
      expect(goal.constraints).toContain('Use reputable sources');
    });

    it('should use default priority when not specified', () => {
      const goal = planner.createGoal({ description: 'Test' });
      expect(goal.priority).toBe('normal');
    });

    it('should generate plan for goal', async () => {
      const goal = planner.createGoal({ description: 'Test goal' });
      const plan = await planner.generatePlan(goal);

      expect(plan.id).toBeDefined();
      expect(plan.goalId).toBe(goal.id);
      expect(plan.steps).toBeDefined();
      expect(Array.isArray(plan.steps)).toBe(true);
    });
  });
});

describe('PlanValidator', () => {
  let validator: PlanValidator;

  beforeEach(() => {
    validator = createPlanValidator();
  });

  it('should validate a valid plan', () => {
    const plan: Plan = {
      id: 'plan1',
      goalId: 'goal1',
      steps: [
        { id: 's1', order: 0, description: 'Step 1 description', status: 'pending', retryCount: 0, maxRetries: 3 },
        { id: 's2', order: 1, description: 'Step 2 description', status: 'pending', retryCount: 0, maxRetries: 3 },
      ],
      status: 'pending',
      currentStepIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const result = validator.validate(plan);
    expect(result.valid).toBe(true);
  });

  it('should detect missing steps', () => {
    const plan: Plan = {
      id: 'plan1',
      goalId: 'goal1',
      steps: [],
      status: 'pending',
      currentStepIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const result = validator.validate(plan);
    expect(result.valid).toBe(false);
  });
});

describe('VariableRegistry', () => {
  let registry: VariableRegistry;

  beforeEach(() => {
    registry = createVariableRegistry();
  });

  describe('variable storage', () => {
    it('should store and retrieve variables', () => {
      registry.set('key1', 'value1', { scope: 'step' });
      expect(registry.get('key1')).toBe('value1');
    });

    it('should return undefined for missing variables', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('should delete variables', () => {
      registry.set('key1', 'value1', { scope: 'step' });
      registry.delete('key1');
      expect(registry.get('key1')).toBeUndefined();
    });

    it('should clear all variables', () => {
      registry.set('key1', 'value1', { scope: 'step' });
      registry.set('key2', 'value2', { scope: 'chain' });
      registry.clear();
      expect(registry.get('key1')).toBeUndefined();
      expect(registry.get('key2')).toBeUndefined();
    });
  });

  describe('template resolution', () => {
    it('should resolve simple templates', () => {
      registry.set('name', 'World', { scope: 'step' });
      const result = registry.resolveTemplate('Hello, {{name}}!');
      expect(result).toBe('Hello, World!');
    });

    it('should resolve multiple variables', () => {
      registry.set('greeting', 'Hello', { scope: 'step' });
      registry.set('name', 'Alice', { scope: 'step' });
      const result = registry.resolveTemplate('{{greeting}}, {{name}}!');
      expect(result).toBe('Hello, Alice!');
    });

    it('should leave unresolved variables as-is', () => {
      const result = registry.resolveTemplate('Hello, {{unknown}}!');
      expect(result).toBe('Hello, {{unknown}}!');
    });
  });
});

describe('ChainBuilder', () => {
  it('should build a simple chain', () => {
    const builder = new ChainBuilder();
    const chain = builder
      .step('tool1')
      .withArgs({ param: 'value' })
      .endStep()
      .build();

    expect(chain.id).toBeDefined();
    expect(chain.steps).toHaveLength(1);
    expect(chain.steps[0].toolName).toBe('tool1');
  });

  it('should chain multiple steps', () => {
    const builder = new ChainBuilder();
    const chain = builder
      .step('tool1')
      .withArg('query', 'test')
      .endStep()
      .step('tool2')
      .fromPrevious('input', 'results')
      .endStep()
      .build();

    expect(chain.steps).toHaveLength(2);
  });

  it('should generate unique IDs', () => {
    const chain1 = new ChainBuilder().build();
    const chain2 = new ChainBuilder().build();
    expect(chain1.id).not.toBe(chain2.id);
  });

  it('should support named chains', () => {
    const chain = new ChainBuilder()
      .named('my-chain')
      .build();

    expect(chain.name).toBe('my-chain');
  });
});

describe('FailureTracker', () => {
  let tracker: FailureTracker;

  beforeEach(() => {
    tracker = createFailureTracker();
  });

  afterEach(() => {
    tracker.destroy();
  });

  it('should track failures', () => {
    const failure = tracker.track({
      stepId: 'step1',
      error: 'Test error',
      category: 'tool_error',
    });

    expect(failure.id).toBeDefined();
    expect(failure.stepId).toBe('step1');
  });

  it('should get failures for step', () => {
    tracker.track({
      stepId: 'step1',
      error: 'Error 1',
      category: 'tool_error',
    });
    tracker.track({
      stepId: 'step1',
      error: 'Error 2',
      category: 'tool_error',
    });

    const failures = tracker.getByStep('step1');
    expect(failures).toHaveLength(2);
  });

  it('should get recent failures', () => {
    tracker.track({
      stepId: 'step1',
      error: 'Error',
      category: 'tool_error',
    });

    const recent = tracker.getRecent();
    expect(recent.length).toBeGreaterThan(0);
  });

  it('should get statistics', () => {
    tracker.track({
      stepId: 'step1',
      error: 'Error',
      category: 'timeout' as any,
    });

    const stats = tracker.getStats();
    expect(stats.totalFailures).toBe(1);
  });
});

describe('StrategySelector', () => {
  let selector: StrategySelector;

  beforeEach(() => {
    selector = createStrategySelector();
  });

  it('should select a strategy for a failure', () => {
    const failure: TrackedFailure = {
      id: 'f1',
      stepId: 'step1',
      error: 'Network timeout',
      category: 'timeout',
      timestamp: Date.now(),
    };

    const step: PlanStep = {
      id: 'step1',
      order: 0,
      description: 'Test step',
      status: 'failed',
      retryCount: 0,
      maxRetries: 3,
    };

    const selection = selector.select(failure, step);
    expect(selection).toBeDefined();
    expect(selection.strategy).toBeDefined();
  });

  it('should not repeat failed strategies', () => {
    const failure: TrackedFailure = {
      id: 'f1',
      stepId: 'step1',
      error: 'Error',
      category: 'unknown',
      timestamp: Date.now(),
    };

    const step: PlanStep = {
      id: 'step1',
      order: 0,
      description: 'Test step',
      status: 'failed',
      retryCount: 0,
      maxRetries: 3,
    };

    const tried = ['retry_with_backoff', 'parameter_variation'];
    const selection = selector.select(failure, step, { previousStrategies: tried as any });

    expect(selection).toBeDefined();
    if (selection.strategy !== 'abort_execution') {
      expect(tried).not.toContain(selection.strategy);
    }
  });
});

describe('SessionLearner', () => {
  let learner: SessionLearner;

  beforeEach(() => {
    learner = createSessionLearner();
  });

  it('should record corrections', () => {
    learner.recordCorrectionSuccess('api_call', 'retry_with_backoff');

    const patterns = learner.getPatterns();
    expect(Array.isArray(patterns)).toBe(true);
  });

  it('should suggest strategies based on patterns', () => {
    // Record multiple successes with same strategy
    for (let i = 0; i < 5; i++) {
      learner.recordCorrectionSuccess('api_call', 'retry_with_backoff');
    }

    const suggestion = learner.getRecommendedStrategy('api_call');
    // May or may not have a suggestion depending on confidence threshold
    expect(suggestion === undefined || typeof suggestion === 'string').toBe(true);
  });

  it('should clear patterns', () => {
    learner.recordCorrectionSuccess('api_call', 'skip_step');

    learner.clear();
    expect(learner.getPatterns()).toHaveLength(0);
  });
});

describe('SensitivityClassifier', () => {
  let classifier: SensitivityClassifier;

  beforeEach(() => {
    classifier = createSensitivityClassifier();
  });

  it('should classify data modification actions as sensitive', () => {
    const step: PlanStep = {
      id: 's1',
      order: 1,
      description: 'Delete old records from database',
      toolName: 'database_delete',
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
    };

    const classification = classifier.classify(step);
    expect(classification.isSensitive).toBe(true);
    expect(classification.categories).toContain('data_modification');
  });

  it('should classify financial actions as sensitive', () => {
    const step: PlanStep = {
      id: 's1',
      order: 1,
      description: 'Process payment for order',
      toolName: 'stripe_charge',
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
    };

    const classification = classifier.classify(step);
    expect(classification.isSensitive).toBe(true);
    expect(classification.categories).toContain('financial');
  });

  it('should classify credential access as sensitive', () => {
    const step: PlanStep = {
      id: 's1',
      order: 1,
      description: 'Retrieve API credentials',
      toolName: 'get_credentials',
      toolArguments: { key: 'api_key' },
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
    };

    const classification = classifier.classify(step);
    expect(classification.isSensitive).toBe(true);
    expect(classification.categories).toContain('credential_access');
  });

  it('should not classify read-only actions as sensitive', () => {
    const step: PlanStep = {
      id: 's1',
      order: 1,
      description: 'Search for articles',
      toolName: 'web_search',
      toolArguments: { query: 'AI news' },
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
    };

    const classification = classifier.classify(step);
    expect(classification.isSensitive).toBe(false);
  });

  it('should provide risk levels', () => {
    const step: PlanStep = {
      id: 's1',
      order: 1,
      description: 'Drop database table',
      toolName: 'database_drop',
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
    };

    const classification = classifier.classify(step);
    expect(classification.riskLevel).toBeGreaterThanOrEqual(7);
  });
});

describe('ConfirmationBuilder', () => {
  let builder: ConfirmationBuilder;

  beforeEach(() => {
    builder = createConfirmationBuilder();
  });

  it('should build an enriched approval request', async () => {
    const step: PlanStep = {
      id: 's1',
      order: 1,
      description: 'Send email notification',
      toolName: 'send_email',
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
    };

    const classification: ActionClassification = {
      isSensitive: true,
      categories: ['external_communication'],
      riskLevel: 6,
      explanation: 'Sends external communication',
    };

    const goal: Goal = {
      id: 'g1',
      description: 'Notify users',
      priority: 'normal',
      status: 'executing',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const plan: Plan = {
      id: 'p1',
      goalId: 'g1',
      steps: [step],
      status: 'executing',
      currentStepIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const request = await builder.build(step, classification, { goal, plan });

    expect(request.id).toBeDefined();
    expect(request.step).toBe(step);
    expect(request.classification).toBe(classification);
  });

  it('should generate alternative suggestions', async () => {
    const step: PlanStep = {
      id: 's1',
      order: 1,
      description: 'Delete user data',
      toolName: 'delete_data',
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
    };

    const classification: ActionClassification = {
      isSensitive: true,
      categories: ['data_modification', 'irreversible_action'],
      riskLevel: 9,
      explanation: 'Irreversible data deletion',
    };

    const goal: Goal = {
      id: 'g1',
      description: 'Clean up data',
      priority: 'normal',
      status: 'executing',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const plan: Plan = {
      id: 'p1',
      goalId: 'g1',
      steps: [step],
      status: 'executing',
      currentStepIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const request = await builder.build(step, classification, { goal, plan });

    expect(request.alternatives).toBeDefined();
    expect(request.alternatives!.length).toBeGreaterThan(0);
  });
});

describe('PermissionManager', () => {
  let manager: PermissionManager;

  beforeEach(() => {
    manager = createPermissionManager();
  });

  afterEach(() => {
    manager.cancelAllPending();
  });

  describe('permission levels', () => {
    it('should use default permission level', async () => {
      const step: PlanStep = {
        id: 's1',
        order: 1,
        description: 'Simple search',
        toolName: 'search',
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
      };

      const result = await manager.requiresApproval(step);
      expect(result.required).toBeDefined();
      expect(result.classification).toBeDefined();
    });

    it('should respect always_ask permission level', async () => {
      manager.setPermissions('user1', { defaultLevel: 'always_ask' });

      const step: PlanStep = {
        id: 's1',
        order: 1,
        description: 'Simple search',
        toolName: 'search',
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
      };

      const result = await manager.requiresApproval(step, 'user1');
      expect(result.required).toBe(true);
    });

    it('should respect never_ask permission level', async () => {
      manager.setPermissions('user1', { defaultLevel: 'never_ask' });

      const step: PlanStep = {
        id: 's1',
        order: 1,
        description: 'Delete all data',
        toolName: 'delete_all',
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
      };

      const result = await manager.requiresApproval(step, 'user1');
      expect(result.required).toBe(false);
    });
  });

  describe('tool overrides', () => {
    it('should respect tool-specific overrides', async () => {
      manager.setToolOverride('user1', 'special_tool', 'always_ask');

      const step: PlanStep = {
        id: 's1',
        order: 1,
        description: 'Use special tool',
        toolName: 'special_tool',
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
      };

      const result = await manager.requiresApproval(step, 'user1');
      expect(result.required).toBe(true);
    });
  });

  describe('trusted patterns', () => {
    it('should skip approval for trusted patterns', async () => {
      manager.addTrustedPattern('user1', 'search*');
      manager.setPermissions('user1', { defaultLevel: 'sensitive_only' });

      const step: PlanStep = {
        id: 's1',
        order: 1,
        description: 'Web search',
        toolName: 'search_web',
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
      };

      const result = await manager.requiresApproval(step, 'user1');
      expect(result.required).toBe(false);
    });
  });
});

describe('Stores', () => {
  describe('ExecutionStore', () => {
    let store: InMemoryExecutionStore;

    beforeEach(() => {
      store = new InMemoryExecutionStore();
    });

    it('should save and retrieve sessions', async () => {
      const session: ExecutionSession = {
        id: 'session1',
        goal: {
          id: 'goal1',
          description: 'Test goal',
          priority: 'normal',
          status: 'executing',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        status: 'executing',
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
        iterationCount: 0,
        maxIterations: 50,
        variables: {},
        failures: [],
        patterns: [],
      };

      await store.saveSession(session);
      const retrieved = await store.getSession('session1');

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('session1');
    });

    it('should list sessions with filters', async () => {
      const session1: ExecutionSession = {
        id: 's1',
        goal: { id: 'g1', description: 'Test 1', priority: 'normal', status: 'executing', createdAt: Date.now(), updatedAt: Date.now() },
        status: 'executing',
        userId: 'user1',
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
        iterationCount: 0,
        maxIterations: 50,
        variables: {},
        failures: [],
        patterns: [],
      };

      const session2: ExecutionSession = {
        id: 's2',
        goal: { id: 'g2', description: 'Test 2', priority: 'normal', status: 'completed', createdAt: Date.now(), updatedAt: Date.now() },
        status: 'completed',
        userId: 'user2',
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
        iterationCount: 0,
        maxIterations: 50,
        variables: {},
        failures: [],
        patterns: [],
      };

      await store.saveSession(session1);
      await store.saveSession(session2);

      const executing = await store.listSessions({ status: 'executing' });
      expect(executing).toHaveLength(1);
      expect(executing[0].id).toBe('s1');

      const user1Sessions = await store.listSessions({ userId: 'user1' });
      expect(user1Sessions).toHaveLength(1);
    });

    it('should update session status', async () => {
      const session: ExecutionSession = {
        id: 's1',
        goal: { id: 'g1', description: 'Test', priority: 'normal', status: 'executing', createdAt: Date.now(), updatedAt: Date.now() },
        status: 'executing',
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
        iterationCount: 0,
        maxIterations: 50,
        variables: {},
        failures: [],
        patterns: [],
      };

      await store.saveSession(session);
      await store.updateSessionStatus('s1', 'completed');

      const updated = await store.getSession('s1');
      expect(updated!.status).toBe('completed');
      expect(updated!.completedAt).toBeDefined();
    });

    it('should delete sessions', async () => {
      const session: ExecutionSession = {
        id: 's1',
        goal: { id: 'g1', description: 'Test', priority: 'normal', status: 'completed', createdAt: Date.now(), updatedAt: Date.now() },
        status: 'completed',
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
        iterationCount: 0,
        maxIterations: 50,
        variables: {},
        failures: [],
        patterns: [],
      };

      await store.saveSession(session);
      await store.deleteSession('s1');

      const deleted = await store.getSession('s1');
      expect(deleted).toBeNull();
    });
  });

  describe('PlanStore', () => {
    let store: InMemoryPlanStore;

    beforeEach(() => {
      store = new InMemoryPlanStore();
    });

    it('should save and retrieve plans', async () => {
      const plan: Plan = {
        id: 'plan1',
        goalId: 'goal1',
        steps: [
          { id: 's1', order: 1, description: 'Step 1', status: 'pending', retryCount: 0, maxRetries: 3 },
        ],
        status: 'pending',
        currentStepIndex: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await store.savePlan(plan);
      const retrieved = await store.getPlan('plan1');

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('plan1');
    });

    it('should update step status', async () => {
      const plan: Plan = {
        id: 'plan1',
        goalId: 'goal1',
        steps: [
          { id: 's1', order: 1, description: 'Step 1', status: 'pending', retryCount: 0, maxRetries: 3 },
        ],
        status: 'pending',
        currentStepIndex: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await store.savePlan(plan);
      await store.updateStepStatus('plan1', 's1', 'completed');

      const updated = await store.getPlan('plan1');
      expect(updated!.steps[0].status).toBe('completed');
    });

    it('should get active plans', async () => {
      const activePlan: Plan = {
        id: 'p1',
        goalId: 'g1',
        steps: [],
        status: 'executing',
        currentStepIndex: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const completedPlan: Plan = {
        id: 'p2',
        goalId: 'g2',
        steps: [],
        status: 'completed',
        currentStepIndex: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await store.savePlan(activePlan);
      await store.savePlan(completedPlan);

      const active = await store.getActivePlans();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('p1');
    });
  });
});

describe('CorrectionEngine', () => {
  let engine: CorrectionEngine;

  beforeEach(() => {
    engine = createCorrectionEngine();
  });

  afterEach(() => {
    engine.destroy();
  });

  it('should be an instance of CorrectionEngine', () => {
    expect(engine).toBeDefined();
  });

  it('should provide access to failure tracker', () => {
    expect(engine.failureTracker).toBeDefined();
  });

  it('should provide access to strategy selector', () => {
    expect(engine.strategySelector).toBeDefined();
  });

  it('should provide access to session learner', () => {
    expect(engine.sessionLearner).toBeDefined();
  });
});

describe('Evaluator', () => {
  let evaluator: Evaluator;

  beforeEach(() => {
    evaluator = createEvaluator();
  });

  it('should evaluate step results', async () => {
    const step: PlanStep = {
      id: 's1',
      order: 0,
      description: 'Test step',
      status: 'completed',
      retryCount: 0,
      maxRetries: 3,
    };

    const result = {
      success: true,
      output: { data: 'test' },
      durationMs: 100,
    };

    const evaluation = await evaluator.evaluateStep(step, result);
    expect(evaluation).toBeDefined();
    expect(evaluation.succeeded).toBe(true);
  });
});

describe('Factory functions', () => {
  it('should create stores with correct type', () => {
    const memoryExec = createExecutionStore('memory');
    expect(memoryExec).toBeInstanceOf(InMemoryExecutionStore);

    const memoryPlan = createPlanStore('memory');
    expect(memoryPlan).toBeInstanceOf(InMemoryPlanStore);
  });
});
