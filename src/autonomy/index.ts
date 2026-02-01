/**
 * Autonomy Module
 * Agentic capabilities for SecureAgent
 *
 * Provides:
 * - Goal-based planning and execution
 * - Tool chaining with variable passing
 * - Self-correction and learning
 * - Human-in-the-loop approval workflows
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  Goal,
  GoalInput,
  Plan,
  ToolChain,
  ExecutionSession,
  ExecutionResult,
  ChainExecutionState,
  ExecutionStatus,
} from './types.js';
import { AUTONOMY_EVENTS, AUTONOMY_DEFAULTS } from './constants.js';
import { AutonomyConfigSchema, type AutonomyConfig } from './config.js';
import { GoalPlanner, createGoalPlanner } from './planning/index.js';
import { AgenticLoop, createAgenticLoop } from './execution/index.js';
import {
  ToolChainOrchestrator,
  ChainBuilder,
  VariableRegistry,
  createToolChainOrchestrator,
  createVariableRegistry,
} from './chaining/index.js';
import { CorrectionEngine, createCorrectionEngine } from './correction/index.js';
import { PermissionManager, createPermissionManager, type ApprovalHandler } from './approval/index.js';
import {
  createExecutionStore,
  createPlanStore,
  type ExecutionStore,
  type PlanStore,
} from './stores/index.js';

// Re-export all types
export * from './types.js';
export * from './config.js';
export * from './constants.js';

// Re-export submodules
export * from './planning/index.js';
export * from './execution/index.js';
export * from './chaining/index.js';
export * from './correction/index.js';
export * from './approval/index.js';
export * from './stores/index.js';

/**
 * Tool executor interface for autonomy module
 */
export interface AutonomyToolExecutor {
  execute(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  getAvailableTools(): string[];
}

/**
 * LLM provider interface for planning
 */
export interface LLMProvider {
  generatePlan(goal: Goal): Promise<{ steps: Array<{ id: string; order: number; description: string; toolName?: string }> }>;
  evaluateResult(step: unknown, result: unknown): Promise<{ success: boolean; confidence: number }>;
  suggestCorrection(failure: unknown): Promise<{ strategy: string }>;
}

/**
 * Autonomy manager configuration
 */
export interface AutonomyManagerConfig {
  /** Autonomy configuration */
  config?: Partial<AutonomyConfig>;
  /** LLM provider for planning */
  llmProvider?: LLMProvider;
  /** Tool executor */
  toolExecutor?: AutonomyToolExecutor;
  /** Approval handler */
  approvalHandler?: ApprovalHandler;
  /** Execution store */
  executionStore?: ExecutionStore;
  /** Plan store */
  planStore?: PlanStore;
  /** Database for stores (if using database stores) */
  database?: unknown;
}

/**
 * Autonomy Manager
 * Main entry point for autonomous agent capabilities
 */
export class AutonomyManager extends EventEmitter {
  private readonly config: AutonomyConfig;
  private readonly planner: GoalPlanner;
  private readonly loop: AgenticLoop;
  private readonly chainOrchestrator: ToolChainOrchestrator;
  private readonly correctionEngine: CorrectionEngine;
  private readonly permissionManager: PermissionManager;
  private readonly executionStore: ExecutionStore;
  private readonly planStore: PlanStore;
  private readonly variableRegistry: VariableRegistry;
  private readonly activeSessions: Map<string, ExecutionSession> = new Map();

  constructor(managerConfig?: AutonomyManagerConfig) {
    super();

    // Parse and validate configuration with defaults
    const parsed = AutonomyConfigSchema.safeParse(managerConfig?.config ?? {});
    this.config = parsed.success ? parsed.data : {
      enabled: true,
      execution: {
        maxIterations: AUTONOMY_DEFAULTS.MAX_ITERATIONS,
        maxStepsPerPlan: AUTONOMY_DEFAULTS.MAX_STEPS_PER_PLAN,
        stepTimeout: AUTONOMY_DEFAULTS.STEP_TIMEOUT_MS,
        executionTimeout: AUTONOMY_DEFAULTS.EXECUTION_TIMEOUT_MS,
        defaultConcurrency: AUTONOMY_DEFAULTS.DEFAULT_CONCURRENCY,
        enableCheckpointing: true,
      },
      correction: {
        maxRetriesPerStep: AUTONOMY_DEFAULTS.MAX_RETRIES_PER_STEP,
        baseRetryDelay: AUTONOMY_DEFAULTS.BASE_RETRY_DELAY_MS,
        maxRetryDelay: AUTONOMY_DEFAULTS.MAX_RETRY_DELAY_MS,
        backoffMultiplier: AUTONOMY_DEFAULTS.BACKOFF_MULTIPLIER,
        enableSessionLearning: true,
        patternConfidenceThreshold: 0.7,
        maxPatternsPerSession: 100,
      },
      approval: {
        defaultPermissionLevel: 'sensitive_only',
        sensitiveCategories: ['data_modification', 'financial', 'credential_access', 'irreversible_action'],
        approvalTimeout: AUTONOMY_DEFAULTS.APPROVAL_TIMEOUT_MS,
        suggestAlternatives: true,
        maxAlternatives: AUTONOMY_DEFAULTS.MAX_ALTERNATIVES,
        alwaysRequireApprovalPatterns: [],
        neverRequireApprovalPatterns: [],
      },
      planning: {
        enableLLMPlanning: true,
        maxPlanningIterations: 5,
        enablePlanValidation: true,
        enableDynamicReplanning: true,
        minStepDescriptionLength: 10,
      },
      chaining: {
        maxChainSteps: AUTONOMY_DEFAULTS.MAX_CHAIN_STEPS,
        persistVariables: true,
        variableExpirationMs: AUTONOMY_DEFAULTS.VARIABLE_EXPIRATION_MS,
        enableOutputTransform: true,
        enableConditionalBranching: true,
      },
      longRunning: {
        enableBackground: true,
        checkpointInterval: AUTONOMY_DEFAULTS.CHECKPOINT_INTERVAL_MS,
        enableWebhooks: true,
        maxConcurrentBackgroundExecutions: AUTONOMY_DEFAULTS.MAX_CONCURRENT_BACKGROUND,
        backgroundTimeout: 0,
      },
      store: {
        type: 'memory',
        executionRetentionDays: AUTONOMY_DEFAULTS.EXECUTION_RETENTION_DAYS,
        planRetentionDays: AUTONOMY_DEFAULTS.PLAN_RETENTION_DAYS,
        enableCompression: false,
      },
    };

    // Initialize variable registry
    this.variableRegistry = createVariableRegistry();

    // Initialize stores
    const storeType = this.config.store?.type ?? 'memory';
    this.executionStore = managerConfig?.executionStore ??
      createExecutionStore(storeType, managerConfig?.database);
    this.planStore = managerConfig?.planStore ??
      createPlanStore(storeType, managerConfig?.database);

    // Initialize correction engine
    this.correctionEngine = createCorrectionEngine();

    // Initialize permission manager
    this.permissionManager = createPermissionManager({
      approvalConfig: this.config.approval,
      approvalHandler: managerConfig?.approvalHandler,
    });

    // Initialize planner
    this.planner = createGoalPlanner();

    // Initialize chain orchestrator
    this.chainOrchestrator = createToolChainOrchestrator({
      executor: {
        execute: async (
          request: { id: string; name: string; arguments: Record<string, unknown>; timestamp: number },
          _context: { conversationId: string; turnId: string; userId?: string; variables?: Record<string, unknown> }
        ) => {
          if (managerConfig?.toolExecutor) {
            const result = await managerConfig.toolExecutor.execute(request.name, request.arguments);
            return { status: 'completed', result: { success: true, output: result } };
          }
          return { status: 'completed', result: { success: true, output: null } };
        },
      },
    });

    // Initialize agentic loop
    this.loop = createAgenticLoop({
      toolExecutor: {
        execute: async (
          request: { id: string; name: string; arguments: Record<string, unknown>; timestamp: number },
          _context: { conversationId: string; turnId: string; userId?: string; variables?: Record<string, unknown> }
        ) => {
          if (managerConfig?.toolExecutor) {
            const result = await managerConfig.toolExecutor.execute(request.name, request.arguments);
            return { status: 'completed', result: { success: true, output: result } };
          }
          return { status: 'completed', result: { success: true, output: null } };
        },
      },
    });

    // Set up event forwarding
    this.setupEventForwarding();
  }

  /**
   * Execute a goal autonomously
   */
  async executeGoal(
    input: GoalInput,
    options?: {
      userId?: string;
      sessionId?: string;
      webhooks?: Array<{ url: string; events: string[] }>;
    }
  ): Promise<ExecutionResult> {
    const goal = this.planner.createGoal(input);
    const sessionId = options?.sessionId ?? randomUUID();
    const now = Date.now();

    // Create execution session
    const session: ExecutionSession = {
      id: sessionId,
      goal,
      status: 'initializing' as ExecutionStatus,
      userId: options?.userId,
      startedAt: now,
      lastActivityAt: now,
      iterationCount: 0,
      maxIterations: this.config.execution?.maxIterations ?? 50,
      variables: {},
      failures: [],
      patterns: [],
    };

    this.activeSessions.set(sessionId, session);
    await this.executionStore.saveSession(session);

    this.emit(AUTONOMY_EVENTS.GOAL_CREATED, {
      sessionId,
      goalId: goal.id,
      description: goal.description,
      timestamp: now,
    });

    try {
      // Execute through agentic loop
      session.status = 'executing';
      await this.executionStore.saveSession(session);

      const result = await this.loop.executeGoal(goal);

      // Update session with result
      session.status = result.success ? 'completed' : 'failed';
      session.completedAt = Date.now();
      session.result = result;
      await this.executionStore.saveSession(session);

      this.emit(
        result.success ? AUTONOMY_EVENTS.GOAL_COMPLETED : AUTONOMY_EVENTS.GOAL_FAILED,
        {
          sessionId,
          goalId: goal.id,
          success: result.success,
          timestamp: Date.now(),
        }
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      session.status = 'failed';
      session.completedAt = Date.now();
      await this.executionStore.saveSession(session);

      this.emit(AUTONOMY_EVENTS.GOAL_FAILED, {
        sessionId,
        goalId: goal.id,
        error: errorMessage,
        timestamp: Date.now(),
      });

      return {
        success: false,
        status: 'failed',
        error: errorMessage,
        summary: `Execution failed: ${errorMessage}`,
        stepsCompleted: 0,
        totalSteps: 0,
        durationMs: Date.now() - session.startedAt,
        variables: {},
      };
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Build a tool chain using fluent API
   */
  buildChain(name?: string): ChainBuilder {
    const builder = new ChainBuilder();
    if (name) {
      builder.named(name);
    }
    return builder;
  }

  /**
   * Execute a tool chain
   */
  async executeChain(
    chain: ToolChain,
    initialVariables?: Record<string, unknown>,
    options?: {
      userId?: string;
      toolExecutor?: AutonomyToolExecutor;
    }
  ): Promise<ChainExecutionState> {
    // Set initial variables
    if (initialVariables) {
      for (const [key, value] of Object.entries(initialVariables)) {
        this.variableRegistry.set(key, value, { scope: 'chain' });
      }
    }

    this.emit(AUTONOMY_EVENTS.CHAIN_STARTED, {
      chainId: chain.id,
      name: chain.name,
      stepCount: chain.steps.length,
      timestamp: Date.now(),
    });

    const result = await this.chainOrchestrator.execute(chain);

    this.emit(
      result.success ? AUTONOMY_EVENTS.CHAIN_COMPLETED : AUTONOMY_EVENTS.CHAIN_FAILED,
      {
        chainId: chain.id,
        success: result.success,
        currentStepIndex: result.currentStepIndex,
        timestamp: Date.now(),
      }
    );

    return result;
  }

  /**
   * Create a plan for a goal without executing
   */
  async planGoal(input: GoalInput): Promise<Plan> {
    const goal = this.planner.createGoal(input);
    const plan = await this.planner.generatePlan(goal);
    await this.planStore.savePlan(plan);
    return plan;
  }

  /**
   * Execute an existing plan
   */
  async executePlan(
    planId: string,
    options?: { userId?: string; sessionId?: string }
  ): Promise<ExecutionResult> {
    const plan = await this.planStore.getPlan(planId);
    if (!plan) {
      return {
        success: false,
        status: 'failed',
        error: `Plan not found: ${planId}`,
        summary: `Plan not found: ${planId}`,
        stepsCompleted: 0,
        totalSteps: 0,
        durationMs: 0,
        variables: {},
      };
    }

    return this.executeGoal(
      { description: `Execute plan: ${planId}` },
      { ...options, sessionId: options?.sessionId ?? planId }
    );
  }

  /**
   * Pause an active execution
   */
  async pauseExecution(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'executing') {
      return false;
    }

    session.status = 'paused';
    session.lastActivityAt = Date.now();
    await this.executionStore.saveSession(session);

    this.emit(AUTONOMY_EVENTS.EXECUTION_PAUSED, {
      sessionId,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Resume a paused execution
   */
  async resumeExecution(sessionId: string): Promise<boolean> {
    const session = await this.executionStore.getSession(sessionId);
    if (!session || session.status !== 'paused') {
      return false;
    }

    this.emit(AUTONOMY_EVENTS.EXECUTION_RESUMED, {
      sessionId,
      timestamp: Date.now(),
    });

    // Re-execute from checkpoint
    return this.executeGoal(session.goal, {
      userId: session.userId,
      sessionId,
    }).then(() => true).catch(() => false);
  }

  /**
   * Cancel an active execution
   */
  async cancelExecution(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.status = 'cancelled';
    session.completedAt = Date.now();
    await this.executionStore.saveSession(session);
    this.activeSessions.delete(sessionId);

    this.emit(AUTONOMY_EVENTS.EXECUTION_CANCELLED, {
      sessionId,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Get execution session
   */
  async getSession(sessionId: string): Promise<ExecutionSession | null> {
    return this.activeSessions.get(sessionId) ??
      this.executionStore.getSession(sessionId);
  }

  /**
   * List execution sessions
   */
  async listSessions(options?: {
    status?: ExecutionStatus;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<ExecutionSession[]> {
    return this.executionStore.listSessions(options);
  }

  /**
   * Get pending approval requests
   */
  getPendingApprovals() {
    return this.permissionManager.getPendingApprovals();
  }

  /**
   * Provide an approval decision
   */
  approveRequest(requestId: string, approved: boolean, options?: {
    decidedBy?: string;
    reason?: string;
  }): boolean {
    return this.permissionManager.provideDecision(requestId, approved, options);
  }

  /**
   * Set user permissions
   */
  setUserPermissions(userId: string, permissions: {
    defaultLevel?: 'always_ask' | 'sensitive_only' | 'never_ask';
    categoryOverrides?: Record<string, 'always_ask' | 'sensitive_only' | 'never_ask'>;
    toolOverrides?: Record<string, 'always_ask' | 'sensitive_only' | 'never_ask'>;
    trustedPatterns?: string[];
  }): void {
    this.permissionManager.setPermissions(userId, permissions);
  }

  /**
   * Get the planner
   */
  getPlanner(): GoalPlanner {
    return this.planner;
  }

  /**
   * Get the correction engine
   */
  getCorrectionEngine(): CorrectionEngine {
    return this.correctionEngine;
  }

  /**
   * Get the permission manager
   */
  getPermissionManager(): PermissionManager {
    return this.permissionManager;
  }

  /**
   * Get the variable registry
   */
  getVariableRegistry(): VariableRegistry {
    return this.variableRegistry;
  }

  /**
   * Get configuration
   */
  getConfig(): AutonomyConfig {
    return { ...this.config };
  }

  /**
   * Cleanup old data
   */
  async cleanup(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<{
    sessions: number;
    plans: number;
  }> {
    const sessions = await this.executionStore.cleanupOldSessions(olderThanMs);
    const plans = await this.planStore.cleanupOldPlans(olderThanMs);
    return { sessions, plans };
  }

  /**
   * Set up event forwarding from subcomponents
   */
  private setupEventForwarding(): void {
    // Forward planner events
    this.planner.on(AUTONOMY_EVENTS.PLAN_CREATED, (data) => this.emit(AUTONOMY_EVENTS.PLAN_CREATED, data));
    this.planner.on(AUTONOMY_EVENTS.PLAN_UPDATED, (data) => this.emit(AUTONOMY_EVENTS.PLAN_UPDATED, data));

    // Forward loop events
    this.loop.on(AUTONOMY_EVENTS.STEP_STARTED, (data) => this.emit(AUTONOMY_EVENTS.STEP_STARTED, data));
    this.loop.on(AUTONOMY_EVENTS.STEP_COMPLETED, (data) => this.emit(AUTONOMY_EVENTS.STEP_COMPLETED, data));
    this.loop.on(AUTONOMY_EVENTS.STEP_FAILED, (data) => this.emit(AUTONOMY_EVENTS.STEP_FAILED, data));

    // Forward correction events
    this.correctionEngine.on(AUTONOMY_EVENTS.CORRECTION_STARTED, (data) => this.emit(AUTONOMY_EVENTS.CORRECTION_STARTED, data));
    this.correctionEngine.on(AUTONOMY_EVENTS.CORRECTION_SUCCEEDED, (data) => this.emit(AUTONOMY_EVENTS.CORRECTION_SUCCEEDED, data));
    this.correctionEngine.on(AUTONOMY_EVENTS.CORRECTION_FAILED, (data) => this.emit(AUTONOMY_EVENTS.CORRECTION_FAILED, data));

    // Forward approval events
    this.permissionManager.on(AUTONOMY_EVENTS.APPROVAL_REQUESTED, (data) => this.emit(AUTONOMY_EVENTS.APPROVAL_REQUESTED, data));
    this.permissionManager.on(AUTONOMY_EVENTS.APPROVAL_GRANTED, (data) => this.emit(AUTONOMY_EVENTS.APPROVAL_GRANTED, data));
    this.permissionManager.on(AUTONOMY_EVENTS.APPROVAL_DENIED, (data) => this.emit(AUTONOMY_EVENTS.APPROVAL_DENIED, data));
    this.permissionManager.on(AUTONOMY_EVENTS.APPROVAL_TIMEOUT, (data) => this.emit(AUTONOMY_EVENTS.APPROVAL_TIMEOUT, data));

    // Forward chain events
    this.chainOrchestrator.on(AUTONOMY_EVENTS.CHAIN_STEP_STARTED, (data) => this.emit(AUTONOMY_EVENTS.CHAIN_STEP_STARTED, data));
    this.chainOrchestrator.on(AUTONOMY_EVENTS.CHAIN_STEP_COMPLETED, (data) => this.emit(AUTONOMY_EVENTS.CHAIN_STEP_COMPLETED, data));
  }
}

/**
 * Create an autonomy manager
 */
export function createAutonomyManager(config?: AutonomyManagerConfig): AutonomyManager {
  return new AutonomyManager(config);
}

/**
 * Create an autonomy module (alias for createAutonomyManager)
 */
export const createAutonomyModule = createAutonomyManager;

// Default export
export default AutonomyManager;
