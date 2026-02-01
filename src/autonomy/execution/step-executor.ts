/**
 * Step Executor
 * Executes individual plan steps with tool integration
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { PlanStep, StepResult } from '../types.js';
import type { ExecutionConfig } from '../config.js';
import { AUTONOMY_EVENTS, AUTONOMY_ERROR_CODES, AutonomyError, AUTONOMY_DEFAULTS } from '../constants.js';
import { VariableRegistry } from '../chaining/variable-registry.js';
import type { ToolExecutorInterface } from '../chaining/tool-chain.js';

/**
 * Step executor configuration
 */
export interface StepExecutorConfig {
  /** Tool executor */
  toolExecutor: ToolExecutorInterface;
  /** Variable registry */
  variableRegistry?: VariableRegistry;
  /** Execution configuration */
  executionConfig?: Partial<ExecutionConfig>;
  /** Conversation ID for tool execution */
  conversationId?: string;
  /** User ID for permissions */
  userId?: string;
}

/**
 * Step execution context
 */
export interface StepExecutionContext {
  /** Plan ID */
  planId: string;
  /** Execution session ID */
  sessionId: string;
  /** Additional context */
  additionalContext?: string;
  /** Current variables */
  variables?: Record<string, unknown>;
}

/**
 * Step Executor
 * Handles execution of individual plan steps
 */
export class StepExecutor extends EventEmitter {
  private readonly toolExecutor: ToolExecutorInterface;
  private readonly variableRegistry: VariableRegistry;
  private readonly stepTimeout: number;
  private readonly conversationId: string;
  private readonly userId?: string;

  constructor(config: StepExecutorConfig) {
    super();
    this.toolExecutor = config.toolExecutor;
    this.variableRegistry = config.variableRegistry ?? new VariableRegistry();
    this.stepTimeout = config.executionConfig?.stepTimeout ?? AUTONOMY_DEFAULTS.STEP_TIMEOUT_MS;
    this.conversationId = config.conversationId ?? randomUUID();
    this.userId = config.userId;
  }

  /**
   * Execute a step
   */
  async execute(step: PlanStep, context: StepExecutionContext): Promise<StepResult> {
    const startTime = Date.now();

    this.emit(AUTONOMY_EVENTS.STEP_STARTED, {
      stepId: step.id,
      planId: context.planId,
      sessionId: context.sessionId,
      toolName: step.toolName,
      timestamp: startTime,
    });

    try {
      let result: StepResult;

      if (step.toolName) {
        // Execute tool
        result = await this.executeToolStep(step, context);
      } else {
        // Non-tool step - just mark as complete
        result = {
          success: true,
          output: { message: 'Step completed', description: step.description },
          durationMs: Date.now() - startTime,
        };
      }

      // Capture variables
      if (result.success && result.output) {
        result.capturedVariables = this.captureVariables(result.output, step);

        // Store in registry
        if (result.capturedVariables) {
          for (const [name, value] of Object.entries(result.capturedVariables)) {
            this.variableRegistry.set(name, value, {
              scope: 'execution',
              sourceId: step.id,
            });
          }
        }
      }

      this.emit(
        result.success ? AUTONOMY_EVENTS.STEP_COMPLETED : AUTONOMY_EVENTS.STEP_FAILED,
        {
          stepId: step.id,
          planId: context.planId,
          sessionId: context.sessionId,
          success: result.success,
          durationMs: result.durationMs,
          timestamp: Date.now(),
        }
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: StepResult = {
        success: false,
        output: errorMessage,
        durationMs: Date.now() - startTime,
      };

      this.emit(AUTONOMY_EVENTS.STEP_FAILED, {
        stepId: step.id,
        planId: context.planId,
        sessionId: context.sessionId,
        success: false,
        error: errorMessage,
        durationMs: result.durationMs,
        timestamp: Date.now(),
      });

      return result;
    }
  }

  /**
   * Execute a tool step
   */
  private async executeToolStep(
    step: PlanStep,
    context: StepExecutionContext
  ): Promise<StepResult> {
    const startTime = Date.now();

    // Resolve arguments with variables
    const resolvedArgs = this.resolveArguments(
      step.toolArguments ?? {},
      context.variables ?? {}
    );

    // Execute with timeout
    const toolResult = await Promise.race([
      this.toolExecutor.execute(
        {
          id: randomUUID(),
          name: step.toolName!,
          arguments: resolvedArgs,
          timestamp: Date.now(),
        },
        {
          conversationId: this.conversationId,
          turnId: step.id,
          userId: this.userId,
          variables: context.variables,
        }
      ),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new AutonomyError(AUTONOMY_ERROR_CODES.STEP_TIMEOUT, 'Step execution timed out')),
          this.stepTimeout
        )
      ),
    ]);

    const success = toolResult.status === 'executed' &&
      (toolResult.result as { success?: boolean } | undefined)?.success !== false;

    return {
      success,
      output: (toolResult.result as { output?: unknown } | undefined)?.output ?? toolResult.result,
      toolResult: toolResult.result as StepResult['toolResult'],
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Resolve arguments with variable substitution
   */
  private resolveArguments(
    args: Record<string, unknown>,
    contextVariables: Record<string, unknown>
  ): Record<string, unknown> {
    // Combine context variables with registry
    const allVariables = {
      ...this.variableRegistry.export(),
      ...contextVariables,
    };

    return this.variableRegistry.resolveArguments(args, allVariables);
  }

  /**
   * Capture variables from step output
   */
  private captureVariables(
    output: unknown,
    step: PlanStep
  ): Record<string, unknown> | undefined {
    if (!output || typeof output !== 'object') {
      return undefined;
    }

    const captured: Record<string, unknown> = {};
    const obj = output as Record<string, unknown>;

    // Check for explicit variables field
    if ('variables' in obj && typeof obj.variables === 'object') {
      Object.assign(captured, obj.variables);
    }

    // Auto-capture common fields
    const commonFields = ['id', 'result', 'data', 'content', 'items', 'value', 'output'];
    for (const field of commonFields) {
      if (field in obj && obj[field] !== undefined) {
        captured[`${step.id}_${field}`] = obj[field];
      }
    }

    // Store the raw result
    captured[`${step.id}_output`] = output;

    return Object.keys(captured).length > 0 ? captured : undefined;
  }

  /**
   * Get the variable registry
   */
  getVariableRegistry(): VariableRegistry {
    return this.variableRegistry;
  }

  /**
   * Check if dependencies are satisfied
   */
  checkDependencies(step: PlanStep, completedStepIds: Set<string>): {
    satisfied: boolean;
    missing: string[];
  } {
    if (!step.dependsOn || step.dependsOn.length === 0) {
      return { satisfied: true, missing: [] };
    }

    const missing = step.dependsOn.filter(depId => !completedStepIds.has(depId));
    return {
      satisfied: missing.length === 0,
      missing,
    };
  }

  /**
   * Get ready steps (dependencies satisfied)
   */
  getReadySteps(
    steps: PlanStep[],
    completedStepIds: Set<string>,
    inProgressStepIds: Set<string>
  ): PlanStep[] {
    return steps.filter(step => {
      // Skip if already completed or in progress
      if (completedStepIds.has(step.id) || inProgressStepIds.has(step.id)) {
        return false;
      }

      // Skip if not pending
      if (step.status !== 'pending') {
        return false;
      }

      // Check dependencies
      return this.checkDependencies(step, completedStepIds).satisfied;
    });
  }
}

/**
 * Create a step executor
 */
export function createStepExecutor(config: StepExecutorConfig): StepExecutor {
  return new StepExecutor(config);
}
