/**
 * Evaluator
 * Evaluates step and plan execution results
 */

import { EventEmitter } from 'events';
import type {
  StepResult,
  StepEvaluation,
  PlanEvaluation,
  Plan,
  PlanStep,
  Goal,
  CorrectionStrategy,
  FailureCategory,
} from '../types.js';

/**
 * LLM interface for evaluation
 */
export interface EvaluationLLM {
  evaluate(prompt: string): Promise<string>;
}

/**
 * Evaluator configuration
 */
export interface EvaluatorConfig {
  /** LLM for evaluation */
  llm?: EvaluationLLM;
  /** Enable LLM-based evaluation */
  enableLLMEvaluation?: boolean;
}

/**
 * Evaluator
 * Evaluates execution results and determines next actions
 */
export class Evaluator extends EventEmitter {
  private readonly llm?: EvaluationLLM;
  private readonly enableLLMEvaluation: boolean;

  constructor(config?: EvaluatorConfig) {
    super();
    this.llm = config?.llm;
    this.enableLLMEvaluation = config?.enableLLMEvaluation ?? true;
  }

  /**
   * Evaluate a step result
   */
  async evaluateStep(
    step: PlanStep,
    result: StepResult,
    context?: {
      goal?: Goal;
      plan?: Plan;
      previousResults?: Map<string, StepResult>;
      variables?: Record<string, unknown>;
    }
  ): Promise<StepEvaluation> {
    // Use rule-based evaluation first
    const ruleEvaluation = this.ruleBasedStepEvaluation(step, result);

    // If LLM evaluation is enabled and we have an LLM, enhance the evaluation
    if (this.enableLLMEvaluation && this.llm && context?.goal) {
      try {
        return await this.llmEnhancedStepEvaluation(step, result, ruleEvaluation, context);
      } catch {
        // Fall back to rule-based
        return ruleEvaluation;
      }
    }

    return ruleEvaluation;
  }

  /**
   * Evaluate plan completion
   */
  async evaluatePlan(
    plan: Plan,
    goal: Goal,
    stepResults: Map<string, StepResult>,
    variables: Record<string, unknown>
  ): Promise<PlanEvaluation> {
    // Check basic completion
    const completedSteps = plan.steps.filter(s => s.status === 'completed');
    const failedSteps = plan.steps.filter(s => s.status === 'failed');
    const isComplete = completedSteps.length === plan.steps.length;

    // Rule-based evaluation
    const ruleEvaluation: PlanEvaluation = {
      isComplete,
      goalAchieved: isComplete && failedSteps.length === 0,
      confidence: this.calculateConfidence(plan, stepResults),
      reasoning: this.generateReasoning(plan, goal, stepResults),
    };

    // LLM enhancement if available
    if (this.enableLLMEvaluation && this.llm) {
      try {
        return await this.llmEnhancedPlanEvaluation(plan, goal, stepResults, variables, ruleEvaluation);
      } catch {
        return ruleEvaluation;
      }
    }

    return ruleEvaluation;
  }

  /**
   * Categorize a failure
   */
  categorizeFailure(error: string | Error): FailureCategory {
    const errorStr = typeof error === 'string' ? error : error.message;
    const lowerError = errorStr.toLowerCase();

    // Check for specific error patterns
    if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
      return 'timeout';
    }
    if (lowerError.includes('rate limit') || lowerError.includes('too many requests') || lowerError.includes('429')) {
      return 'rate_limit';
    }
    if (lowerError.includes('not found') || lowerError.includes('404') || lowerError.includes('does not exist')) {
      return 'resource_not_found';
    }
    if (lowerError.includes('permission') || lowerError.includes('forbidden') || lowerError.includes('403') || lowerError.includes('unauthorized') || lowerError.includes('401')) {
      return 'permission_denied';
    }
    if (lowerError.includes('validation') || lowerError.includes('invalid') || lowerError.includes('required')) {
      return 'validation_error';
    }
    if (lowerError.includes('network') || lowerError.includes('connection') || lowerError.includes('econnrefused') || lowerError.includes('socket')) {
      return 'network_error';
    }
    if (lowerError.includes('tool') || lowerError.includes('execution')) {
      return 'tool_error';
    }

    return 'unknown';
  }

  /**
   * Suggest correction strategy based on failure category
   */
  suggestCorrectionStrategy(
    category: FailureCategory,
    retryCount: number,
    maxRetries: number
  ): CorrectionStrategy | undefined {
    // If we've exhausted retries, suggest more drastic measures
    if (retryCount >= maxRetries) {
      switch (category) {
        case 'resource_not_found':
        case 'permission_denied':
          return 'skip_step';
        case 'tool_error':
          return 'alternative_tool';
        case 'timeout':
          return 'decompose_step';
        default:
          return 'abort_execution';
      }
    }

    // Suggest based on category
    switch (category) {
      case 'timeout':
      case 'rate_limit':
      case 'network_error':
        return 'retry_with_backoff';
      case 'validation_error':
        return 'parameter_variation';
      case 'resource_not_found':
        return 'alternative_tool';
      case 'permission_denied':
        return 'skip_step';
      case 'tool_error':
        return retryCount < 1 ? 'retry_with_backoff' : 'alternative_tool';
      default:
        return retryCount < 1 ? 'retry_with_backoff' : undefined;
    }
  }

  /**
   * Extract variables from a result
   */
  extractVariables(result: StepResult): Record<string, unknown> {
    if (!result.output) return {};

    // If output has explicit variables, use them
    if (result.capturedVariables) {
      return result.capturedVariables;
    }

    // Try to extract from output structure
    if (typeof result.output === 'object' && result.output !== null) {
      const obj = result.output as Record<string, unknown>;

      // Look for common patterns
      if ('data' in obj) return { data: obj.data };
      if ('result' in obj) return { result: obj.result };
      if ('items' in obj) return { items: obj.items };
      if ('content' in obj) return { content: obj.content };

      // Return the whole object if small
      const keys = Object.keys(obj);
      if (keys.length <= 5) {
        return obj;
      }
    }

    // For primitives, store as 'value'
    return { value: result.output };
  }

  /**
   * Rule-based step evaluation
   */
  private ruleBasedStepEvaluation(step: PlanStep, result: StepResult): StepEvaluation {
    const succeeded = result.success;
    let shouldContinue = true;
    let needsCorrection = false;
    let correctionStrategy: CorrectionStrategy | undefined;
    let notes = '';

    if (!succeeded) {
      const category = this.categorizeFailure(
        result.toolResult?.error?.message ?? result.output?.toString() ?? 'Unknown error'
      );

      correctionStrategy = this.suggestCorrectionStrategy(
        category,
        step.retryCount,
        step.maxRetries
      );

      needsCorrection = correctionStrategy !== undefined && correctionStrategy !== 'abort_execution';
      shouldContinue = correctionStrategy !== 'abort_execution';

      notes = `Step failed with ${category}. `;
      if (correctionStrategy) {
        notes += `Suggested strategy: ${correctionStrategy}`;
      } else {
        notes += 'No correction strategy available';
      }
    } else {
      notes = 'Step completed successfully';
    }

    return {
      succeeded,
      shouldContinue,
      needsCorrection,
      correctionStrategy,
      notes,
      capturedVariables: this.extractVariables(result),
    };
  }

  /**
   * LLM-enhanced step evaluation
   */
  private async llmEnhancedStepEvaluation(
    step: PlanStep,
    result: StepResult,
    ruleEvaluation: StepEvaluation,
    context: { goal?: Goal; plan?: Plan; previousResults?: Map<string, StepResult>; variables?: Record<string, unknown> }
  ): Promise<StepEvaluation> {
    const prompt = `Evaluate this step execution result:

Step: ${step.description}
Tool: ${step.toolName ?? 'None'}
Result: ${result.success ? 'Success' : 'Failed'}
Output: ${JSON.stringify(result.output).slice(0, 500)}

Goal: ${context.goal?.description ?? 'Not specified'}

Current assessment:
- Succeeded: ${ruleEvaluation.succeeded}
- Should continue: ${ruleEvaluation.shouldContinue}
- Needs correction: ${ruleEvaluation.needsCorrection}
- Notes: ${ruleEvaluation.notes}

Based on the goal and step result:
1. Should we continue with the plan? (yes/no)
2. Any variables to capture for later steps?
3. Any adjustments to the assessment?

Respond in JSON format:
{
  "shouldContinue": true/false,
  "notes": "evaluation notes",
  "capturedVariables": { "key": "value" }
}`;

    const response = await this.llm!.evaluate(prompt);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          ...ruleEvaluation,
          shouldContinue: parsed.shouldContinue ?? ruleEvaluation.shouldContinue,
          notes: parsed.notes ?? ruleEvaluation.notes,
          capturedVariables: {
            ...ruleEvaluation.capturedVariables,
            ...parsed.capturedVariables,
          },
        };
      }
    } catch {
      // Fall back to rule-based
    }

    return ruleEvaluation;
  }

  /**
   * LLM-enhanced plan evaluation
   */
  private async llmEnhancedPlanEvaluation(
    plan: Plan,
    goal: Goal,
    stepResults: Map<string, StepResult>,
    variables: Record<string, unknown>,
    ruleEvaluation: PlanEvaluation
  ): Promise<PlanEvaluation> {
    const completedSteps = plan.steps
      .filter(s => s.status === 'completed')
      .map(s => s.description)
      .join('\n- ');

    const prompt = `Evaluate if this goal has been achieved:

Goal: ${goal.description}
${goal.successCriteria?.length ? `Success criteria:\n- ${goal.successCriteria.join('\n- ')}` : ''}

Completed steps:
- ${completedSteps || 'None'}

Variables collected: ${JSON.stringify(variables).slice(0, 500)}

Current assessment:
- Plan complete: ${ruleEvaluation.isComplete}
- Goal achieved: ${ruleEvaluation.goalAchieved}
- Confidence: ${ruleEvaluation.confidence}

Questions:
1. Has the goal been achieved?
2. What is your confidence (0-1)?
3. If not achieved, what additional steps are needed?

Respond in JSON:
{
  "goalAchieved": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "explanation",
  "suggestedSteps": ["step1", "step2"] (if needed)
}`;

    const response = await this.llm!.evaluate(prompt);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isComplete: ruleEvaluation.isComplete,
          goalAchieved: parsed.goalAchieved ?? ruleEvaluation.goalAchieved,
          confidence: parsed.confidence ?? ruleEvaluation.confidence,
          reasoning: parsed.reasoning ?? ruleEvaluation.reasoning,
          suggestedSteps: parsed.suggestedSteps?.map((desc: string, i: number) => ({
            id: `suggested-${i}`,
            order: plan.steps.length + i,
            description: desc,
            status: 'pending' as const,
            retryCount: 0,
            maxRetries: 3,
          })),
        };
      }
    } catch {
      // Fall back to rule-based
    }

    return ruleEvaluation;
  }

  /**
   * Calculate confidence based on results
   */
  private calculateConfidence(plan: Plan, stepResults: Map<string, StepResult>): number {
    const total = plan.steps.length;
    if (total === 0) return 0;

    let score = 0;
    for (const step of plan.steps) {
      const result = stepResults.get(step.id);
      if (result?.success) {
        score += 1;
      } else if (step.status === 'skipped') {
        score += 0.5; // Partial credit for skipped
      }
    }

    return Math.round((score / total) * 100) / 100;
  }

  /**
   * Generate reasoning for evaluation
   */
  private generateReasoning(
    plan: Plan,
    goal: Goal,
    stepResults: Map<string, StepResult>
  ): string {
    const completed = plan.steps.filter(s => s.status === 'completed').length;
    const failed = plan.steps.filter(s => s.status === 'failed').length;
    const total = plan.steps.length;

    let reasoning = `Completed ${completed}/${total} steps. `;

    if (failed > 0) {
      reasoning += `${failed} steps failed. `;
    }

    if (completed === total && failed === 0) {
      reasoning += `All steps completed successfully, goal likely achieved.`;
    } else if (completed === total) {
      reasoning += `All steps attempted but some failed.`;
    } else {
      reasoning += `Execution incomplete.`;
    }

    return reasoning;
  }
}

/**
 * Create an evaluator
 */
export function createEvaluator(config?: EvaluatorConfig): Evaluator {
  return new Evaluator(config);
}
