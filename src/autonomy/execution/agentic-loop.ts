/**
 * Agentic Loop
 * Main execution orchestrator for autonomous agent operations
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  Goal,
  GoalInput,
  Plan,
  PlanStep,
  ExecutionSession,
  ExecutionResult,
  ExecutionOptions,
  ExecutionStatus,
  StepResult,
  TrackedFailure,
  LearnedPattern,
} from '../types.js';
import type { AutonomyConfig } from '../config.js';
import {
  AUTONOMY_EVENTS,
  AUTONOMY_ERROR_CODES,
  AutonomyError,
  AUTONOMY_DEFAULTS,
} from '../constants.js';
import { GoalPlanner, type ToolDefinition, type PlanningLLM } from '../planning/goal-planner.js';
import { PlanValidator } from '../planning/plan-validator.js';
import { StepExecutor } from './step-executor.js';
import { Evaluator, type EvaluationLLM } from './evaluator.js';
import { VariableRegistry } from '../chaining/variable-registry.js';
import type { ToolExecutorInterface } from '../chaining/tool-chain.js';

/**
 * Agentic loop configuration
 */
export interface AgenticLoopConfig {
  /** Tool executor */
  toolExecutor: ToolExecutorInterface;
  /** Available tools */
  availableTools?: ToolDefinition[];
  /** LLM for planning and evaluation */
  llm?: PlanningLLM & EvaluationLLM;
  /** Autonomy configuration */
  config?: Partial<AutonomyConfig>;
  /** User ID */
  userId?: string;
}

/**
 * Agentic Loop
 * Orchestrates the complete autonomous execution cycle
 */
export class AgenticLoop extends EventEmitter {
  private readonly toolExecutor: ToolExecutorInterface;
  private readonly availableTools: ToolDefinition[];
  private readonly llm?: PlanningLLM & EvaluationLLM;
  private readonly config: AutonomyConfig;
  private readonly userId?: string;

  private readonly goalPlanner: GoalPlanner;
  private readonly planValidator: PlanValidator;
  private readonly evaluator: Evaluator;

  private readonly activeSessions: Map<string, ExecutionSession> = new Map();
  private readonly sessionExecutors: Map<string, StepExecutor> = new Map();

  constructor(loopConfig: AgenticLoopConfig) {
    super();
    this.toolExecutor = loopConfig.toolExecutor;
    this.availableTools = loopConfig.availableTools ?? [];
    this.llm = loopConfig.llm;
    this.userId = loopConfig.userId;

    // Build full config with defaults
    this.config = {
      enabled: true,
      execution: {
        maxIterations: loopConfig.config?.execution?.maxIterations ?? AUTONOMY_DEFAULTS.MAX_ITERATIONS,
        maxStepsPerPlan: loopConfig.config?.execution?.maxStepsPerPlan ?? AUTONOMY_DEFAULTS.MAX_STEPS_PER_PLAN,
        stepTimeout: loopConfig.config?.execution?.stepTimeout ?? AUTONOMY_DEFAULTS.STEP_TIMEOUT_MS,
        executionTimeout: loopConfig.config?.execution?.executionTimeout ?? AUTONOMY_DEFAULTS.EXECUTION_TIMEOUT_MS,
        defaultConcurrency: loopConfig.config?.execution?.defaultConcurrency ?? AUTONOMY_DEFAULTS.DEFAULT_CONCURRENCY,
        enableCheckpointing: loopConfig.config?.execution?.enableCheckpointing ?? true,
      },
      correction: {
        maxRetriesPerStep: loopConfig.config?.correction?.maxRetriesPerStep ?? AUTONOMY_DEFAULTS.MAX_RETRIES_PER_STEP,
        baseRetryDelay: loopConfig.config?.correction?.baseRetryDelay ?? AUTONOMY_DEFAULTS.BASE_RETRY_DELAY_MS,
        maxRetryDelay: loopConfig.config?.correction?.maxRetryDelay ?? AUTONOMY_DEFAULTS.MAX_RETRY_DELAY_MS,
        backoffMultiplier: loopConfig.config?.correction?.backoffMultiplier ?? AUTONOMY_DEFAULTS.BACKOFF_MULTIPLIER,
        enableSessionLearning: loopConfig.config?.correction?.enableSessionLearning ?? true,
        patternConfidenceThreshold: loopConfig.config?.correction?.patternConfidenceThreshold ?? 0.7,
        maxPatternsPerSession: loopConfig.config?.correction?.maxPatternsPerSession ?? 100,
      },
      approval: {
        defaultPermissionLevel: loopConfig.config?.approval?.defaultPermissionLevel ?? 'sensitive_only',
        sensitiveCategories: loopConfig.config?.approval?.sensitiveCategories ?? [
          'data_modification',
          'financial',
          'credential_access',
          'irreversible_action',
        ],
        approvalTimeout: loopConfig.config?.approval?.approvalTimeout ?? AUTONOMY_DEFAULTS.APPROVAL_TIMEOUT_MS,
        suggestAlternatives: loopConfig.config?.approval?.suggestAlternatives ?? true,
        maxAlternatives: loopConfig.config?.approval?.maxAlternatives ?? AUTONOMY_DEFAULTS.MAX_ALTERNATIVES,
        alwaysRequireApprovalPatterns: loopConfig.config?.approval?.alwaysRequireApprovalPatterns ?? [],
        neverRequireApprovalPatterns: loopConfig.config?.approval?.neverRequireApprovalPatterns ?? [],
      },
      planning: {
        enableLLMPlanning: loopConfig.config?.planning?.enableLLMPlanning ?? true,
        maxPlanningIterations: loopConfig.config?.planning?.maxPlanningIterations ?? 5,
        enablePlanValidation: loopConfig.config?.planning?.enablePlanValidation ?? true,
        enableDynamicReplanning: loopConfig.config?.planning?.enableDynamicReplanning ?? true,
        minStepDescriptionLength: loopConfig.config?.planning?.minStepDescriptionLength ?? 10,
      },
      chaining: {
        maxChainSteps: loopConfig.config?.chaining?.maxChainSteps ?? 20,
        persistVariables: loopConfig.config?.chaining?.persistVariables ?? true,
        variableExpirationMs: loopConfig.config?.chaining?.variableExpirationMs ?? 0,
        enableOutputTransform: loopConfig.config?.chaining?.enableOutputTransform ?? true,
        enableConditionalBranching: loopConfig.config?.chaining?.enableConditionalBranching ?? true,
      },
      longRunning: {
        enableBackground: loopConfig.config?.longRunning?.enableBackground ?? true,
        checkpointInterval: loopConfig.config?.longRunning?.checkpointInterval ?? AUTONOMY_DEFAULTS.CHECKPOINT_INTERVAL_MS,
        enableWebhooks: loopConfig.config?.longRunning?.enableWebhooks ?? true,
        maxConcurrentBackgroundExecutions: loopConfig.config?.longRunning?.maxConcurrentBackgroundExecutions ?? 10,
        backgroundTimeout: loopConfig.config?.longRunning?.backgroundTimeout ?? 0,
      },
      store: {
        type: loopConfig.config?.store?.type ?? 'database',
        executionRetentionDays: loopConfig.config?.store?.executionRetentionDays ?? 30,
        planRetentionDays: loopConfig.config?.store?.planRetentionDays ?? 30,
        enableCompression: loopConfig.config?.store?.enableCompression ?? false,
      },
    };

    // Initialize components
    this.goalPlanner = new GoalPlanner({
      llm: this.llm,
      availableTools: this.availableTools,
      planningConfig: this.config.planning,
    });

    this.planValidator = new PlanValidator({
      availableTools: this.availableTools,
      planningConfig: this.config.planning,
      maxSteps: this.config.execution.maxStepsPerPlan,
    });

    this.evaluator = new Evaluator({
      llm: this.llm,
      enableLLMEvaluation: !!this.llm,
    });
  }

  /**
   * Execute a goal
   */
  async executeGoal(
    goalInput: GoalInput,
    options?: ExecutionOptions
  ): Promise<ExecutionResult> {
    // Create goal
    const goal = this.goalPlanner.createGoal(goalInput);

    // Create session
    const session = this.createSession(goal, options);
    this.activeSessions.set(session.id, session);

    this.emit(AUTONOMY_EVENTS.EXECUTION_STARTED, {
      sessionId: session.id,
      goalId: goal.id,
      timestamp: Date.now(),
    });

    const executionTimeout = options?.executionTimeout ?? this.config.execution.executionTimeout;

    try {
      // Execute with timeout
      const result = await Promise.race([
        this.runExecutionLoop(session),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new AutonomyError(AUTONOMY_ERROR_CODES.EXECUTION_TIMEOUT, 'Execution timed out')),
            executionTimeout
          )
        ),
      ]);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      session.status = 'failed';
      session.completedAt = Date.now();

      this.emit(AUTONOMY_EVENTS.EXECUTION_FAILED, {
        sessionId: session.id,
        goalId: goal.id,
        error: errorMessage,
        timestamp: Date.now(),
      });

      return {
        success: false,
        status: 'failed',
        error: errorMessage,
        summary: `Execution failed: ${errorMessage}`,
        stepsCompleted: session.plan?.steps.filter(s => s.status === 'completed').length ?? 0,
        totalSteps: session.plan?.steps.length ?? 0,
        durationMs: Date.now() - session.startedAt,
        variables: session.variables,
      };
    } finally {
      this.activeSessions.delete(session.id);
      this.sessionExecutors.delete(session.id);
    }
  }

  /**
   * Cancel an execution
   */
  async cancelExecution(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.status = 'cancelled';
    session.completedAt = Date.now();

    this.emit(AUTONOMY_EVENTS.EXECUTION_CANCELLED, {
      sessionId,
      goalId: session.goal.id,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Pause an execution
   */
  async pauseExecution(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'executing') {
      return false;
    }

    session.status = 'paused';

    this.emit(AUTONOMY_EVENTS.EXECUTION_PAUSED, {
      sessionId,
      goalId: session.goal.id,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Resume an execution
   */
  async resumeExecution(sessionId: string): Promise<ExecutionResult | null> {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'paused') {
      return null;
    }

    session.status = 'executing';

    this.emit(AUTONOMY_EVENTS.EXECUTION_RESUMED, {
      sessionId,
      goalId: session.goal.id,
      timestamp: Date.now(),
    });

    return this.runExecutionLoop(session);
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): ExecutionSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): ExecutionSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Update available tools
   */
  setAvailableTools(tools: ToolDefinition[]): void {
    this.availableTools.length = 0;
    this.availableTools.push(...tools);
    this.goalPlanner.setAvailableTools(tools);
    this.planValidator.setAvailableTools(tools);
  }

  /**
   * Create an execution session
   */
  private createSession(goal: Goal, options?: ExecutionOptions): ExecutionSession {
    return {
      id: randomUUID(),
      goal,
      status: 'initializing',
      iterationCount: 0,
      maxIterations: options?.maxIterations ?? this.config.execution.maxIterations,
      variables: {},
      failures: [],
      patterns: [],
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      userId: options?.userId ?? this.userId,
    };
  }

  /**
   * Run the main execution loop
   */
  private async runExecutionLoop(session: ExecutionSession): Promise<ExecutionResult> {
    // Planning phase
    session.status = 'planning';
    session.goal.status = 'planning';

    const plan = await this.goalPlanner.generatePlan(session.goal);

    // Validate plan
    if (this.config.planning.enablePlanValidation) {
      this.planValidator.validateOrThrow(plan, session.goal);
    }

    session.plan = plan;
    plan.status = 'executing';
    session.goal.status = 'executing';
    session.status = 'executing';

    // Create step executor
    const variableRegistry = new VariableRegistry({
      defaultExpiration: this.config.chaining.variableExpirationMs,
    });

    const stepExecutor = new StepExecutor({
      toolExecutor: this.toolExecutor,
      variableRegistry,
      executionConfig: this.config.execution,
      userId: session.userId,
    });

    this.sessionExecutors.set(session.id, stepExecutor);

    // Execute plan
    const stepResults = new Map<string, StepResult>();
    const completedStepIds = new Set<string>();

    this.emit(AUTONOMY_EVENTS.PLAN_STARTED, {
      planId: plan.id,
      goalId: session.goal.id,
      sessionId: session.id,
      stepCount: plan.steps.length,
      timestamp: Date.now(),
    });

    // Main loop
    while (session.status === 'executing' && session.iterationCount < session.maxIterations) {
      session.iterationCount++;
      session.lastActivityAt = Date.now();

      // Get ready steps
      const readySteps = stepExecutor.getReadySteps(
        plan.steps.filter(s => s.status === 'pending'),
        completedStepIds,
        new Set()
      );

      if (readySteps.length === 0) {
        // Check if all steps are done
        if (completedStepIds.size === plan.steps.length) {
          break;
        }

        // Check if all remaining steps have failed dependencies
        const remainingSteps = plan.steps.filter(s => s.status === 'pending');
        if (remainingSteps.every(s => s.dependsOn?.some(d => {
          const depStep = plan.steps.find(ps => ps.id === d);
          return depStep?.status === 'failed' || depStep?.status === 'skipped';
        }))) {
          // All remaining steps are blocked
          break;
        }

        // Shouldn't happen - break to avoid infinite loop
        break;
      }

      // Execute ready steps (sequentially for now)
      for (const step of readySteps) {
        if (session.status !== 'executing') break;

        step.status = 'executing';
        step.startedAt = Date.now();
        plan.currentStepIndex = step.order;

        const result = await stepExecutor.execute(step, {
          planId: plan.id,
          sessionId: session.id,
          variables: session.variables,
        });

        stepResults.set(step.id, result);

        // Evaluate result
        const evaluation = await this.evaluator.evaluateStep(step, result, {
          goal: session.goal,
          plan,
          previousResults: stepResults,
          variables: session.variables,
        });

        if (evaluation.capturedVariables) {
          Object.assign(session.variables, evaluation.capturedVariables);
        }

        if (evaluation.succeeded) {
          step.status = 'completed';
          step.completedAt = Date.now();
          step.result = result;
          completedStepIds.add(step.id);
        } else if (evaluation.needsCorrection && evaluation.correctionStrategy) {
          // Handle correction
          const corrected = await this.handleCorrection(
            session,
            step,
            result,
            evaluation.correctionStrategy
          );

          if (corrected) {
            // Retry step
            step.status = 'pending';
            step.retryCount++;
          } else {
            step.status = 'failed';
            step.completedAt = Date.now();
            step.error = result.output?.toString() ?? 'Step failed';
            step.result = result;

            if (!evaluation.shouldContinue) {
              session.status = 'failed';
              break;
            }
          }
        } else {
          step.status = 'failed';
          step.completedAt = Date.now();
          step.error = result.output?.toString() ?? 'Step failed';
          step.result = result;

          if (!evaluation.shouldContinue) {
            session.status = 'failed';
            break;
          }
        }

        // Emit progress
        this.emit(AUTONOMY_EVENTS.EXECUTION_PROGRESS, {
          sessionId: session.id,
          goalId: session.goal.id,
          planId: plan.id,
          stepId: step.id,
          progress: Math.round((completedStepIds.size / plan.steps.length) * 100),
          timestamp: Date.now(),
        });
      }
    }

    // Evaluate final result
    const planEvaluation = await this.evaluator.evaluatePlan(
      plan,
      session.goal,
      stepResults,
      session.variables
    );

    // Update final status
    if (session.status === 'executing') {
      if (planEvaluation.goalAchieved) {
        session.status = 'completed';
        session.goal.status = 'completed';
        plan.status = 'completed';
      } else if (session.iterationCount >= session.maxIterations) {
        session.status = 'failed';
        session.goal.status = 'failed';
        plan.status = 'failed';
      } else {
        session.status = 'completed';
        session.goal.status = 'completed';
        plan.status = 'completed';
      }
    }

    session.completedAt = Date.now();

    // Build result
    const result: ExecutionResult = {
      success: planEvaluation.goalAchieved,
      output: session.variables,
      status: session.status,
      error: session.status === 'failed'
        ? plan.steps.find(s => s.status === 'failed')?.error
        : undefined,
      summary: planEvaluation.reasoning,
      stepsCompleted: completedStepIds.size,
      totalSteps: plan.steps.length,
      durationMs: Date.now() - session.startedAt,
      variables: session.variables,
    };

    session.result = result;

    this.emit(
      result.success ? AUTONOMY_EVENTS.EXECUTION_COMPLETED : AUTONOMY_EVENTS.EXECUTION_FAILED,
      {
        sessionId: session.id,
        goalId: session.goal.id,
        success: result.success,
        summary: result.summary,
        timestamp: Date.now(),
      }
    );

    return result;
  }

  /**
   * Handle step correction
   */
  private async handleCorrection(
    session: ExecutionSession,
    step: PlanStep,
    result: StepResult,
    strategy: string
  ): Promise<boolean> {
    this.emit(AUTONOMY_EVENTS.CORRECTION_STARTED, {
      sessionId: session.id,
      stepId: step.id,
      strategy,
      timestamp: Date.now(),
    });

    // Track failure
    const failure: TrackedFailure = {
      id: randomUUID(),
      stepId: step.id,
      planId: session.plan?.id,
      toolName: step.toolName,
      error: result.output?.toString() ?? 'Unknown error',
      category: this.evaluator.categorizeFailure(result.output?.toString() ?? ''),
      arguments: step.toolArguments,
      timestamp: Date.now(),
      strategyAttempted: strategy as TrackedFailure['strategyAttempted'],
    };
    session.failures.push(failure);

    // Apply correction strategy
    let corrected = false;

    switch (strategy) {
      case 'retry_with_backoff':
        // Just return true to allow retry
        corrected = step.retryCount < step.maxRetries;
        break;

      case 'parameter_variation':
        // Modify parameters slightly
        if (step.toolArguments) {
          // Simple variation: add a retry hint
          step.toolArguments = {
            ...step.toolArguments,
            _retry_attempt: step.retryCount + 1,
          };
        }
        corrected = step.retryCount < step.maxRetries;
        break;

      case 'skip_step':
        step.status = 'skipped';
        step.completedAt = Date.now();
        corrected = false; // Don't retry, but continue
        break;

      case 'abort_execution':
        session.status = 'failed';
        corrected = false;
        break;

      default:
        corrected = false;
    }

    failure.correctionSucceeded = corrected;

    this.emit(
      corrected ? AUTONOMY_EVENTS.CORRECTION_SUCCEEDED : AUTONOMY_EVENTS.CORRECTION_FAILED,
      {
        sessionId: session.id,
        stepId: step.id,
        strategy,
        succeeded: corrected,
        timestamp: Date.now(),
      }
    );

    return corrected;
  }
}

/**
 * Create an agentic loop
 */
export function createAgenticLoop(config: AgenticLoopConfig): AgenticLoop {
  return new AgenticLoop(config);
}
