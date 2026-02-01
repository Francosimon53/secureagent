/**
 * Goal Planner
 * Decomposes goals into executable plans using LLM
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  Goal,
  GoalInput,
  Plan,
  PlanStep,
  GoalPriority,
} from '../types.js';
import type { PlanningConfig } from '../config.js';
import { AUTONOMY_EVENTS, AUTONOMY_ERROR_CODES, AutonomyError, AUTONOMY_DEFAULTS } from '../constants.js';

/**
 * Tool definition for planning
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/**
 * LLM interface for planning
 */
export interface PlanningLLM {
  generatePlan(prompt: string): Promise<string>;
}

/**
 * Goal planner configuration
 */
export interface GoalPlannerConfig {
  /** LLM for plan generation */
  llm?: PlanningLLM;
  /** Available tools */
  availableTools?: ToolDefinition[];
  /** Planning configuration */
  planningConfig?: Partial<PlanningConfig>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<Omit<GoalPlannerConfig, 'llm' | 'availableTools'>> & { planningConfig: Required<PlanningConfig> } = {
  planningConfig: {
    enableLLMPlanning: true,
    maxPlanningIterations: 5,
    enablePlanValidation: true,
    enableDynamicReplanning: true,
    minStepDescriptionLength: 10,
  },
};

/**
 * Goal Planner
 * Decomposes high-level goals into actionable plans
 */
export class GoalPlanner extends EventEmitter {
  private readonly llm?: PlanningLLM;
  private readonly availableTools: ToolDefinition[];
  private readonly config: typeof DEFAULT_CONFIG.planningConfig;

  constructor(config?: GoalPlannerConfig) {
    super();
    this.llm = config?.llm;
    this.availableTools = config?.availableTools ?? [];
    this.config = {
      ...DEFAULT_CONFIG.planningConfig,
      ...config?.planningConfig,
    };
  }

  /**
   * Create a goal
   */
  createGoal(input: GoalInput): Goal {
    const goal: Goal = {
      id: randomUUID(),
      description: input.description,
      constraints: input.constraints,
      successCriteria: input.successCriteria,
      priority: input.priority ?? 'normal',
      deadline: input.deadline,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: input.metadata,
    };

    this.emit(AUTONOMY_EVENTS.GOAL_CREATED, {
      goalId: goal.id,
      description: goal.description,
      priority: goal.priority,
      timestamp: Date.now(),
    });

    return goal;
  }

  /**
   * Generate a plan for a goal
   */
  async generatePlan(goal: Goal): Promise<Plan> {
    goal.status = 'planning';
    goal.updatedAt = Date.now();

    this.emit(AUTONOMY_EVENTS.GOAL_UPDATED, {
      goalId: goal.id,
      status: 'planning',
      timestamp: Date.now(),
    });

    let steps: PlanStep[];

    if (this.config.enableLLMPlanning && this.llm) {
      steps = await this.generatePlanWithLLM(goal);
    } else {
      steps = this.generateSimplePlan(goal);
    }

    const plan: Plan = {
      id: randomUUID(),
      goalId: goal.id,
      steps,
      status: 'pending',
      currentStepIndex: 0,
      estimatedDuration: this.estimateDuration(steps),
      complexity: this.estimateComplexity(steps),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.emit(AUTONOMY_EVENTS.PLAN_CREATED, {
      planId: plan.id,
      goalId: goal.id,
      stepCount: steps.length,
      timestamp: Date.now(),
    });

    return plan;
  }

  /**
   * Replan based on feedback
   */
  async replan(
    goal: Goal,
    currentPlan: Plan,
    feedback: {
      failedStepId?: string;
      error?: string;
      additionalContext?: string;
    }
  ): Promise<Plan> {
    if (!this.config.enableDynamicReplanning) {
      throw new AutonomyError(
        AUTONOMY_ERROR_CODES.PLAN_CREATION_FAILED,
        'Dynamic replanning is disabled'
      );
    }

    const completedSteps = currentPlan.steps.filter(s => s.status === 'completed');
    const remainingGoal = this.describeRemainingGoal(goal, completedSteps, feedback);

    // Create a sub-goal for the remaining work
    const subGoal = this.createGoal({
      description: remainingGoal,
      constraints: goal.constraints,
      successCriteria: goal.successCriteria,
      priority: goal.priority,
    });
    subGoal.parentGoalId = goal.id;

    const newPlan = await this.generatePlan(subGoal);

    this.emit(AUTONOMY_EVENTS.PLAN_REPLANNED, {
      originalPlanId: currentPlan.id,
      newPlanId: newPlan.id,
      goalId: goal.id,
      reason: feedback.error ?? 'Replanning requested',
      timestamp: Date.now(),
    });

    return newPlan;
  }

  /**
   * Update available tools
   */
  setAvailableTools(tools: ToolDefinition[]): void {
    this.availableTools.length = 0;
    this.availableTools.push(...tools);
  }

  /**
   * Add a tool
   */
  addTool(tool: ToolDefinition): void {
    this.availableTools.push(tool);
  }

  /**
   * Get available tools
   */
  getAvailableTools(): ToolDefinition[] {
    return [...this.availableTools];
  }

  /**
   * Generate plan using LLM
   */
  private async generatePlanWithLLM(goal: Goal): Promise<PlanStep[]> {
    const prompt = this.buildPlanningPrompt(goal);

    let response: string;
    try {
      response = await this.llm!.generatePlan(prompt);
    } catch (error) {
      // Fall back to simple plan if LLM fails
      return this.generateSimplePlan(goal);
    }

    return this.parseLLMResponse(response, goal);
  }

  /**
   * Build the prompt for LLM planning
   */
  private buildPlanningPrompt(goal: Goal): string {
    const toolList = this.availableTools
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');

    const constraints = goal.constraints?.length
      ? `Constraints:\n${goal.constraints.map(c => `- ${c}`).join('\n')}`
      : '';

    const criteria = goal.successCriteria?.length
      ? `Success criteria:\n${goal.successCriteria.map(c => `- ${c}`).join('\n')}`
      : '';

    return `You are a planning assistant. Create a step-by-step plan to achieve the following goal.

Goal: ${goal.description}

${constraints}

${criteria}

Available tools:
${toolList || 'No specific tools available - create general steps'}

Create a plan with clear, actionable steps. For each step:
1. Describe what needs to be done
2. If a tool should be used, specify which one and with what arguments
3. Note any dependencies on previous steps

Output format (JSON array):
[
  {
    "description": "Step description",
    "toolName": "tool_name (optional)",
    "toolArguments": { "arg": "value" } (optional),
    "dependsOn": ["step_id"] (optional)
  }
]

Maximum ${AUTONOMY_DEFAULTS.MAX_STEPS_PER_PLAN} steps.`;
  }

  /**
   * Parse LLM response into steps
   */
  private parseLLMResponse(response: string, goal: Goal): PlanStep[] {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return this.generateSimplePlan(goal);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        return this.generateSimplePlan(goal);
      }

      const steps: PlanStep[] = [];
      const idMap = new Map<number, string>();

      for (let i = 0; i < parsed.length && i < AUTONOMY_DEFAULTS.MAX_STEPS_PER_PLAN; i++) {
        const item = parsed[i];
        const stepId = randomUUID();
        idMap.set(i, stepId);

        const step: PlanStep = {
          id: stepId,
          order: i,
          description: String(item.description || `Step ${i + 1}`),
          status: 'pending',
          retryCount: 0,
          maxRetries: AUTONOMY_DEFAULTS.MAX_RETRIES_PER_STEP,
        };

        if (item.toolName && typeof item.toolName === 'string') {
          step.toolName = item.toolName;
        }

        if (item.toolArguments && typeof item.toolArguments === 'object') {
          step.toolArguments = item.toolArguments;
        }

        if (item.dependsOn && Array.isArray(item.dependsOn)) {
          step.dependsOn = item.dependsOn
            .map((dep: unknown) => {
              if (typeof dep === 'number') return idMap.get(dep);
              if (typeof dep === 'string') return dep;
              return undefined;
            })
            .filter(Boolean) as string[];
        }

        steps.push(step);
      }

      return steps.length > 0 ? steps : this.generateSimplePlan(goal);
    } catch {
      return this.generateSimplePlan(goal);
    }
  }

  /**
   * Generate a simple plan without LLM
   */
  private generateSimplePlan(goal: Goal): PlanStep[] {
    // Create a single step to attempt the goal directly
    const step: PlanStep = {
      id: randomUUID(),
      order: 0,
      description: `Execute: ${goal.description}`,
      status: 'pending',
      retryCount: 0,
      maxRetries: AUTONOMY_DEFAULTS.MAX_RETRIES_PER_STEP,
    };

    // Try to match a tool based on goal description
    const matchedTool = this.matchTool(goal.description);
    if (matchedTool) {
      step.toolName = matchedTool.name;
    }

    return [step];
  }

  /**
   * Match a tool based on description
   */
  private matchTool(description: string): ToolDefinition | undefined {
    const lowerDesc = description.toLowerCase();

    for (const tool of this.availableTools) {
      const toolWords = tool.name.toLowerCase().split('_');
      const descWords = tool.description.toLowerCase().split(' ');

      // Check if any tool name words appear in the description
      if (toolWords.some(word => lowerDesc.includes(word))) {
        return tool;
      }

      // Check if description keywords match
      if (descWords.some(word => word.length > 4 && lowerDesc.includes(word))) {
        return tool;
      }
    }

    return undefined;
  }

  /**
   * Describe the remaining goal after partial completion
   */
  private describeRemainingGoal(
    goal: Goal,
    completedSteps: PlanStep[],
    feedback: { failedStepId?: string; error?: string; additionalContext?: string }
  ): string {
    const completedDescriptions = completedSteps
      .map(s => s.description)
      .join(', ');

    let description = `Continue working on: ${goal.description}`;

    if (completedDescriptions) {
      description += `\n\nAlready completed: ${completedDescriptions}`;
    }

    if (feedback.error) {
      description += `\n\nPrevious attempt failed: ${feedback.error}`;
    }

    if (feedback.additionalContext) {
      description += `\n\nAdditional context: ${feedback.additionalContext}`;
    }

    return description;
  }

  /**
   * Estimate duration for a plan
   */
  private estimateDuration(steps: PlanStep[]): number {
    // Rough estimate: 30 seconds per step base, plus tool-specific estimates
    return steps.length * 30000;
  }

  /**
   * Estimate complexity of a plan
   */
  private estimateComplexity(steps: PlanStep[]): number {
    // 1-10 scale based on number of steps and dependencies
    const stepScore = Math.min(steps.length / 2, 5);
    const dependencyScore = steps.filter(s => s.dependsOn?.length).length / steps.length * 5;
    return Math.ceil(stepScore + dependencyScore);
  }
}

/**
 * Create a goal planner
 */
export function createGoalPlanner(config?: GoalPlannerConfig): GoalPlanner {
  return new GoalPlanner(config);
}
