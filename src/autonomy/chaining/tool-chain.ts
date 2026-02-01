/**
 * Tool Chain Orchestrator
 * Manages execution of tool chains with variable passing
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  ToolChain,
  ChainStep,
  ChainExecutionState,
  StepResult,
} from '../types.js';
import type { ChainingConfig } from '../config.js';
import { AUTONOMY_EVENTS, AUTONOMY_ERROR_CODES, AutonomyError } from '../constants.js';
import { VariableRegistry } from './variable-registry.js';

/**
 * Tool executor interface (matches existing ToolExecutor pattern)
 */
export interface ToolExecutorInterface {
  execute(
    request: { id: string; name: string; arguments: Record<string, unknown>; timestamp: number },
    context: { conversationId: string; turnId: string; userId?: string; variables?: Record<string, unknown> }
  ): Promise<{
    status: string;
    result?: { success: boolean; output?: unknown; error?: Error };
  }>;
}

/**
 * Tool chain orchestrator configuration
 */
export interface ToolChainOrchestratorConfig {
  /** Tool executor */
  executor: ToolExecutorInterface;
  /** Variable registry */
  variableRegistry?: VariableRegistry;
  /** Chaining configuration */
  chainingConfig?: Partial<ChainingConfig>;
  /** Default timeout per step in ms */
  stepTimeout?: number;
}

/**
 * Tool Chain Orchestrator
 * Executes chains of tools with variable passing between steps
 */
export class ToolChainOrchestrator extends EventEmitter {
  private readonly executor: ToolExecutorInterface;
  private readonly variableRegistry: VariableRegistry;
  private readonly config: {
    maxChainSteps: number;
    persistVariables: boolean;
    enableOutputTransform: boolean;
    enableConditionalBranching: boolean;
    stepTimeout: number;
  };

  constructor(config: ToolChainOrchestratorConfig) {
    super();
    this.executor = config.executor;
    this.variableRegistry = config.variableRegistry ?? new VariableRegistry();
    this.config = {
      maxChainSteps: config.chainingConfig?.maxChainSteps ?? 20,
      persistVariables: config.chainingConfig?.persistVariables ?? true,
      enableOutputTransform: config.chainingConfig?.enableOutputTransform ?? true,
      enableConditionalBranching: config.chainingConfig?.enableConditionalBranching ?? true,
      stepTimeout: config.stepTimeout ?? 60000,
    };
  }

  /**
   * Execute a tool chain
   */
  async execute(
    chain: ToolChain,
    initialVariables?: Record<string, unknown>,
    context?: { conversationId?: string; userId?: string }
  ): Promise<ChainExecutionState> {
    // Validate chain
    if (chain.steps.length > this.config.maxChainSteps) {
      throw new AutonomyError(
        AUTONOMY_ERROR_CODES.CHAIN_INVALID,
        `Chain exceeds maximum steps (${chain.steps.length} > ${this.config.maxChainSteps})`
      );
    }

    // Initialize state
    const state: ChainExecutionState = {
      chainId: chain.id,
      currentStepIndex: 0,
      stepResults: new Map(),
      variables: { ...initialVariables },
      previousOutput: undefined,
      complete: false,
      success: false,
    };

    // Import initial variables
    if (initialVariables) {
      this.variableRegistry.import(initialVariables, {
        scope: 'chain',
        sourceId: chain.id,
      });
    }

    const conversationId = context?.conversationId ?? randomUUID();
    const userId = context?.userId;

    this.emit(AUTONOMY_EVENTS.CHAIN_STARTED, {
      chainId: chain.id,
      stepCount: chain.steps.length,
      timestamp: Date.now(),
    });

    try {
      // Execute steps
      let currentStepId: string | undefined = chain.steps[0]?.id;

      while (currentStepId && !state.complete) {
        const step = chain.steps.find(s => s.id === currentStepId);
        if (!step) {
          throw new AutonomyError(
            AUTONOMY_ERROR_CODES.CHAIN_STEP_INVALID,
            `Step ${currentStepId} not found in chain`
          );
        }

        state.currentStepIndex = chain.steps.indexOf(step);

        // Check condition if present
        if (step.condition && this.config.enableConditionalBranching) {
          const conditionResult = this.evaluateCondition(step.condition, state);
          if (!conditionResult) {
            // Skip this step
            currentStepId = this.getNextStepId(chain, step, true);
            continue;
          }
        }

        // Execute step
        const result = await this.executeStep(step, state, conversationId, userId);
        state.stepResults.set(step.id, result);
        state.previousOutput = result.output;

        // Capture variables from result
        if (result.capturedVariables) {
          Object.assign(state.variables, result.capturedVariables);
          if (this.config.persistVariables) {
            this.variableRegistry.import(result.capturedVariables, {
              scope: 'chain',
              sourceId: chain.id,
            });
          }
        }

        // Determine next step
        if (result.success) {
          currentStepId = this.getNextStepId(chain, step, true);
        } else {
          currentStepId = this.getNextStepId(chain, step, false);
          if (currentStepId === 'abort') {
            state.error = result.output ? String(result.output) : 'Step failed';
            state.complete = true;
            state.success = false;
            break;
          }
        }

        // Check for end
        if (!currentStepId || currentStepId === 'end') {
          state.complete = true;
          state.success = true;
        }
      }

      // If we exited without marking complete, mark as success
      if (!state.complete) {
        state.complete = true;
        state.success = !state.error;
      }

      this.emit(
        state.success ? AUTONOMY_EVENTS.CHAIN_COMPLETED : AUTONOMY_EVENTS.CHAIN_FAILED,
        {
          chainId: chain.id,
          success: state.success,
          stepsExecuted: state.stepResults.size,
          error: state.error,
          timestamp: Date.now(),
        }
      );

      return state;
    } catch (error) {
      state.complete = true;
      state.success = false;
      state.error = error instanceof Error ? error.message : String(error);

      this.emit(AUTONOMY_EVENTS.CHAIN_FAILED, {
        chainId: chain.id,
        success: false,
        error: state.error,
        timestamp: Date.now(),
      });

      return state;
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: ChainStep,
    state: ChainExecutionState,
    conversationId: string,
    userId?: string
  ): Promise<StepResult> {
    const startTime = Date.now();

    this.emit(AUTONOMY_EVENTS.CHAIN_STEP_STARTED, {
      chainId: state.chainId,
      stepId: step.id,
      toolName: step.toolName,
      timestamp: startTime,
    });

    try {
      // Resolve arguments
      const resolvedArgs = this.resolveArguments(step, state);

      // Execute tool with timeout
      const result = await Promise.race([
        this.executor.execute(
          {
            id: randomUUID(),
            name: step.toolName,
            arguments: resolvedArgs,
            timestamp: Date.now(),
          },
          {
            conversationId,
            turnId: step.id,
            userId,
            variables: state.variables,
          }
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Step timeout')), this.config.stepTimeout)
        ),
      ]);

      const success = result.status === 'executed' && result.result?.success !== false;
      let output = result.result?.output;

      // Apply output transform if configured
      if (output && step.outputTransform && this.config.enableOutputTransform) {
        output = this.applyTransform(output, step.outputTransform);
      }

      const stepResult: StepResult = {
        success,
        output,
        toolResult: result.result as StepResult['toolResult'],
        durationMs: Date.now() - startTime,
        capturedVariables: this.extractVariables(output),
      };

      this.emit(
        success ? AUTONOMY_EVENTS.CHAIN_STEP_COMPLETED : AUTONOMY_EVENTS.CHAIN_STEP_FAILED,
        {
          chainId: state.chainId,
          stepId: step.id,
          success,
          durationMs: stepResult.durationMs,
          timestamp: Date.now(),
        }
      );

      return stepResult;
    } catch (error) {
      const stepResult: StepResult = {
        success: false,
        output: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };

      this.emit(AUTONOMY_EVENTS.CHAIN_STEP_FAILED, {
        chainId: state.chainId,
        stepId: step.id,
        success: false,
        error: stepResult.output,
        timestamp: Date.now(),
      });

      return stepResult;
    }
  }

  /**
   * Resolve arguments for a step
   */
  private resolveArguments(
    step: ChainStep,
    state: ChainExecutionState
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = { ...step.argumentMapping.static };

    // Resolve from variables
    for (const [argName, varName] of Object.entries(step.argumentMapping.fromVariable)) {
      const value = this.variableRegistry.get(varName) ?? state.variables[varName];
      if (value !== undefined) {
        resolved[argName] = value;
      }
    }

    // Resolve from previous output
    for (const [argName, path] of Object.entries(step.argumentMapping.fromPrevious)) {
      if (state.previousOutput !== undefined) {
        const value = this.resolvePath(state.previousOutput, path);
        if (value !== undefined) {
          resolved[argName] = value;
        }
      }
    }

    // Resolve any template strings in static values
    const context = {
      previous: state.previousOutput,
      ...state.variables,
    };

    return this.variableRegistry.resolveArguments(resolved, context);
  }

  /**
   * Get the next step ID based on success/failure
   */
  private getNextStepId(chain: ToolChain, currentStep: ChainStep, success: boolean): string | undefined {
    if (success) {
      if (currentStep.onSuccess) {
        if (currentStep.onSuccess === 'next') {
          const currentIndex = chain.steps.indexOf(currentStep);
          return chain.steps[currentIndex + 1]?.id;
        }
        return currentStep.onSuccess;
      }
      // Default: go to next step
      const currentIndex = chain.steps.indexOf(currentStep);
      return chain.steps[currentIndex + 1]?.id;
    } else {
      if (currentStep.onFailure) {
        if (currentStep.onFailure === 'skip') {
          const currentIndex = chain.steps.indexOf(currentStep);
          return chain.steps[currentIndex + 1]?.id;
        }
        return currentStep.onFailure;
      }
      // Default: abort on failure
      return 'abort';
    }
  }

  /**
   * Evaluate a condition string
   */
  private evaluateCondition(condition: string, state: ChainExecutionState): boolean {
    try {
      // Simple condition evaluation - supports basic comparisons
      // Format: "variable operator value" e.g., "count > 0"
      const match = condition.match(/^(\S+)\s*(==|!=|>|<|>=|<=)\s*(.+)$/);
      if (!match) {
        // Treat as boolean variable lookup
        const value = this.variableRegistry.get(condition) ?? state.variables[condition];
        return Boolean(value);
      }

      const [, varPath, operator, rawValue] = match;
      const actualValue = this.variableRegistry.get(varPath) ?? state.variables[varPath];
      let expectedValue: unknown = rawValue.trim();

      // Parse expected value
      if (expectedValue === 'true') expectedValue = true;
      else if (expectedValue === 'false') expectedValue = false;
      else if (expectedValue === 'null') expectedValue = null;
      else if (/^-?\d+$/.test(expectedValue as string)) expectedValue = parseInt(expectedValue as string);
      else if (/^-?\d+\.\d+$/.test(expectedValue as string)) expectedValue = parseFloat(expectedValue as string);
      else if ((expectedValue as string).startsWith('"') && (expectedValue as string).endsWith('"')) {
        expectedValue = (expectedValue as string).slice(1, -1);
      }

      switch (operator) {
        case '==': return actualValue == expectedValue;
        case '!=': return actualValue != expectedValue;
        case '>': return (actualValue as number) > (expectedValue as number);
        case '<': return (actualValue as number) < (expectedValue as number);
        case '>=': return (actualValue as number) >= (expectedValue as number);
        case '<=': return (actualValue as number) <= (expectedValue as number);
        default: return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Apply a transform to output
   */
  private applyTransform(output: unknown, transform: string): unknown {
    try {
      // Simple transform support: path extraction
      // Format: "extract:path.to.value" or "stringify" or "parse"
      if (transform.startsWith('extract:')) {
        const path = transform.slice(8);
        return this.resolvePath(output, path);
      }
      if (transform === 'stringify') {
        return JSON.stringify(output);
      }
      if (transform === 'parse') {
        return typeof output === 'string' ? JSON.parse(output) : output;
      }
      return output;
    } catch {
      return output;
    }
  }

  /**
   * Extract variables from output
   */
  private extractVariables(output: unknown): Record<string, unknown> | undefined {
    if (!output || typeof output !== 'object') return undefined;

    // If output has a 'variables' field, use it
    const obj = output as Record<string, unknown>;
    if (obj.variables && typeof obj.variables === 'object') {
      return obj.variables as Record<string, unknown>;
    }

    // If output is a simple object, store it as 'result'
    return { result: output };
  }

  /**
   * Resolve a dot-separated path in an object
   */
  private resolvePath(obj: unknown, path: string): unknown {
    if (path === '' || path === '.') return obj;

    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Get the variable registry
   */
  getVariableRegistry(): VariableRegistry {
    return this.variableRegistry;
  }
}

/**
 * Create a tool chain orchestrator
 */
export function createToolChainOrchestrator(
  config: ToolChainOrchestratorConfig
): ToolChainOrchestrator {
  return new ToolChainOrchestrator(config);
}
