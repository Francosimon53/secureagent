/**
 * Plan Validator
 * Validates plans before execution
 */

import { EventEmitter } from 'events';
import type { Plan, PlanStep, Goal } from '../types.js';
import type { PlanningConfig } from '../config.js';
import { AUTONOMY_ERROR_CODES, AutonomyError } from '../constants.js';
import type { ToolDefinition } from './goal-planner.js';

/**
 * Validation issue
 */
export interface ValidationIssue {
  /** Issue severity */
  severity: 'error' | 'warning' | 'info';
  /** Issue code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Related step ID */
  stepId?: string;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the plan is valid */
  valid: boolean;
  /** List of issues found */
  issues: ValidationIssue[];
  /** Statistics about the plan */
  stats: {
    stepCount: number;
    toolSteps: number;
    maxDepth: number;
    estimatedDuration: number;
  };
}

/**
 * Plan validator configuration
 */
export interface PlanValidatorConfig {
  /** Available tools for validation */
  availableTools?: ToolDefinition[];
  /** Planning configuration */
  planningConfig?: Partial<PlanningConfig>;
  /** Maximum allowed steps */
  maxSteps?: number;
  /** Maximum dependency depth */
  maxDependencyDepth?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  maxSteps: 20,
  maxDependencyDepth: 10,
  minStepDescriptionLength: 10,
};

/**
 * Plan Validator
 * Validates plans for correctness and feasibility
 */
export class PlanValidator extends EventEmitter {
  private readonly availableTools: Map<string, ToolDefinition>;
  private readonly config: typeof DEFAULT_CONFIG;

  constructor(config?: PlanValidatorConfig) {
    super();
    this.availableTools = new Map();
    if (config?.availableTools) {
      for (const tool of config.availableTools) {
        this.availableTools.set(tool.name, tool);
      }
    }
    this.config = {
      ...DEFAULT_CONFIG,
      maxSteps: config?.maxSteps ?? DEFAULT_CONFIG.maxSteps,
      maxDependencyDepth: config?.maxDependencyDepth ?? DEFAULT_CONFIG.maxDependencyDepth,
      minStepDescriptionLength: config?.planningConfig?.minStepDescriptionLength ?? DEFAULT_CONFIG.minStepDescriptionLength,
    };
  }

  /**
   * Validate a plan
   */
  validate(plan: Plan, goal?: Goal): ValidationResult {
    const issues: ValidationIssue[] = [];

    // Basic structure validation
    this.validateStructure(plan, issues);

    // Step validation
    for (const step of plan.steps) {
      this.validateStep(step, plan, issues);
    }

    // Dependency validation
    this.validateDependencies(plan, issues);

    // Tool validation
    this.validateTools(plan, issues);

    // Goal alignment (if goal provided)
    if (goal) {
      this.validateGoalAlignment(plan, goal, issues);
    }

    // Calculate stats
    const stats = this.calculateStats(plan);

    return {
      valid: !issues.some(i => i.severity === 'error'),
      issues,
      stats,
    };
  }

  /**
   * Validate and throw if invalid
   */
  validateOrThrow(plan: Plan, goal?: Goal): void {
    const result = this.validate(plan, goal);
    if (!result.valid) {
      const errors = result.issues.filter(i => i.severity === 'error');
      throw new AutonomyError(
        AUTONOMY_ERROR_CODES.PLAN_VALIDATION_FAILED,
        `Plan validation failed: ${errors.map(e => e.message).join('; ')}`,
        { issues: errors }
      );
    }
  }

  /**
   * Update available tools
   */
  setAvailableTools(tools: ToolDefinition[]): void {
    this.availableTools.clear();
    for (const tool of tools) {
      this.availableTools.set(tool.name, tool);
    }
  }

  /**
   * Validate plan structure
   */
  private validateStructure(plan: Plan, issues: ValidationIssue[]): void {
    // Check for empty plan
    if (!plan.steps || plan.steps.length === 0) {
      issues.push({
        severity: 'error',
        code: 'EMPTY_PLAN',
        message: 'Plan has no steps',
        suggestion: 'Add at least one step to the plan',
      });
      return;
    }

    // Check step count
    if (plan.steps.length > this.config.maxSteps) {
      issues.push({
        severity: 'error',
        code: 'TOO_MANY_STEPS',
        message: `Plan has ${plan.steps.length} steps, maximum is ${this.config.maxSteps}`,
        suggestion: 'Break the plan into smaller sub-plans or reduce steps',
      });
    }

    // Check for unique step IDs
    const stepIds = new Set<string>();
    for (const step of plan.steps) {
      if (stepIds.has(step.id)) {
        issues.push({
          severity: 'error',
          code: 'DUPLICATE_STEP_ID',
          message: `Duplicate step ID: ${step.id}`,
          stepId: step.id,
          suggestion: 'Ensure all steps have unique IDs',
        });
      }
      stepIds.add(step.id);
    }

    // Check order sequence
    const orders = plan.steps.map(s => s.order).sort((a, b) => a - b);
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] !== i) {
        issues.push({
          severity: 'warning',
          code: 'NON_SEQUENTIAL_ORDER',
          message: 'Step orders are not sequential',
          suggestion: 'Consider renumbering steps to be sequential',
        });
        break;
      }
    }
  }

  /**
   * Validate a single step
   */
  private validateStep(step: PlanStep, plan: Plan, issues: ValidationIssue[]): void {
    // Check description
    if (!step.description || step.description.trim().length < this.config.minStepDescriptionLength) {
      issues.push({
        severity: 'warning',
        code: 'SHORT_DESCRIPTION',
        message: `Step ${step.id} has a short or missing description`,
        stepId: step.id,
        suggestion: `Add a description of at least ${this.config.minStepDescriptionLength} characters`,
      });
    }

    // Check max retries
    if (step.maxRetries < 0) {
      issues.push({
        severity: 'error',
        code: 'INVALID_MAX_RETRIES',
        message: `Step ${step.id} has invalid maxRetries: ${step.maxRetries}`,
        stepId: step.id,
        suggestion: 'Set maxRetries to a non-negative number',
      });
    }

    // Validate tool arguments if tool is specified
    if (step.toolName && step.toolArguments) {
      const tool = this.availableTools.get(step.toolName);
      if (tool?.parameters) {
        this.validateToolArguments(step, tool, issues);
      }
    }
  }

  /**
   * Validate dependencies
   */
  private validateDependencies(plan: Plan, issues: ValidationIssue[]): void {
    const stepIds = new Set(plan.steps.map(s => s.id));
    const stepOrders = new Map(plan.steps.map(s => [s.id, s.order]));

    for (const step of plan.steps) {
      if (!step.dependsOn) continue;

      for (const depId of step.dependsOn) {
        // Check if dependency exists
        if (!stepIds.has(depId)) {
          issues.push({
            severity: 'error',
            code: 'MISSING_DEPENDENCY',
            message: `Step ${step.id} depends on non-existent step ${depId}`,
            stepId: step.id,
            suggestion: 'Remove the dependency or add the missing step',
          });
          continue;
        }

        // Check for forward dependencies (depending on later steps)
        const depOrder = stepOrders.get(depId)!;
        if (depOrder >= step.order) {
          issues.push({
            severity: 'error',
            code: 'FORWARD_DEPENDENCY',
            message: `Step ${step.id} depends on step ${depId} which comes later`,
            stepId: step.id,
            suggestion: 'Reorder steps so dependencies come first',
          });
        }
      }
    }

    // Check for circular dependencies
    const circular = this.findCircularDependencies(plan);
    if (circular) {
      issues.push({
        severity: 'error',
        code: 'CIRCULAR_DEPENDENCY',
        message: `Circular dependency detected involving steps: ${circular.join(' -> ')}`,
        suggestion: 'Remove the circular dependency',
      });
    }

    // Check dependency depth
    const maxDepth = this.calculateMaxDependencyDepth(plan);
    if (maxDepth > this.config.maxDependencyDepth) {
      issues.push({
        severity: 'warning',
        code: 'DEEP_DEPENDENCY_CHAIN',
        message: `Dependency chain depth (${maxDepth}) exceeds recommended maximum (${this.config.maxDependencyDepth})`,
        suggestion: 'Consider flattening the dependency structure',
      });
    }
  }

  /**
   * Validate tools
   */
  private validateTools(plan: Plan, issues: ValidationIssue[]): void {
    for (const step of plan.steps) {
      if (!step.toolName) continue;

      if (!this.availableTools.has(step.toolName)) {
        issues.push({
          severity: 'warning',
          code: 'UNKNOWN_TOOL',
          message: `Step ${step.id} uses unknown tool: ${step.toolName}`,
          stepId: step.id,
          suggestion: 'Verify the tool name is correct or register the tool',
        });
      }
    }
  }

  /**
   * Validate tool arguments
   */
  private validateToolArguments(
    step: PlanStep,
    tool: ToolDefinition,
    issues: ValidationIssue[]
  ): void {
    const params = tool.parameters as {
      required?: string[];
      properties?: Record<string, unknown>;
    } | undefined;

    if (!params) return;

    // Check required parameters
    if (params.required) {
      for (const required of params.required) {
        if (!(required in (step.toolArguments ?? {}))) {
          issues.push({
            severity: 'warning',
            code: 'MISSING_REQUIRED_ARG',
            message: `Step ${step.id} missing required argument: ${required}`,
            stepId: step.id,
            suggestion: `Add the ${required} argument`,
          });
        }
      }
    }

    // Check for unknown parameters
    if (params.properties && step.toolArguments) {
      for (const arg of Object.keys(step.toolArguments)) {
        if (!(arg in params.properties)) {
          issues.push({
            severity: 'info',
            code: 'UNKNOWN_ARG',
            message: `Step ${step.id} has unknown argument: ${arg}`,
            stepId: step.id,
          });
        }
      }
    }
  }

  /**
   * Validate alignment with goal
   */
  private validateGoalAlignment(plan: Plan, goal: Goal, issues: ValidationIssue[]): void {
    // Check if plan has steps that might address the goal
    const goalWords = goal.description.toLowerCase().split(/\s+/);
    const planWords = plan.steps
      .map(s => s.description.toLowerCase())
      .join(' ')
      .split(/\s+/);

    const commonWords = goalWords.filter(w =>
      w.length > 3 && planWords.some(pw => pw.includes(w))
    );

    if (commonWords.length < 1 && goalWords.length > 2) {
      issues.push({
        severity: 'warning',
        code: 'GOAL_ALIGNMENT',
        message: 'Plan steps may not align well with the goal description',
        suggestion: 'Review steps to ensure they address the goal',
      });
    }

    // Check deadline
    if (goal.deadline && plan.estimatedDuration) {
      const timeRemaining = goal.deadline - Date.now();
      if (plan.estimatedDuration > timeRemaining) {
        issues.push({
          severity: 'warning',
          code: 'DEADLINE_RISK',
          message: `Estimated duration (${Math.round(plan.estimatedDuration / 60000)}min) may exceed deadline`,
          suggestion: 'Consider optimizing the plan or adjusting expectations',
        });
      }
    }
  }

  /**
   * Find circular dependencies
   */
  private findCircularDependencies(plan: Plan): string[] | null {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (stepId: string): boolean => {
      visited.add(stepId);
      recursionStack.add(stepId);
      path.push(stepId);

      const step = plan.steps.find(s => s.id === stepId);
      if (step?.dependsOn) {
        for (const depId of step.dependsOn) {
          if (!visited.has(depId)) {
            if (dfs(depId)) return true;
          } else if (recursionStack.has(depId)) {
            path.push(depId);
            return true;
          }
        }
      }

      path.pop();
      recursionStack.delete(stepId);
      return false;
    };

    for (const step of plan.steps) {
      if (!visited.has(step.id)) {
        if (dfs(step.id)) {
          return path;
        }
      }
    }

    return null;
  }

  /**
   * Calculate maximum dependency depth
   */
  private calculateMaxDependencyDepth(plan: Plan): number {
    const depths = new Map<string, number>();

    const getDepth = (stepId: string): number => {
      if (depths.has(stepId)) return depths.get(stepId)!;

      const step = plan.steps.find(s => s.id === stepId);
      if (!step?.dependsOn?.length) {
        depths.set(stepId, 0);
        return 0;
      }

      const maxDepDepth = Math.max(...step.dependsOn.map(getDepth));
      const depth = maxDepDepth + 1;
      depths.set(stepId, depth);
      return depth;
    };

    return Math.max(0, ...plan.steps.map(s => getDepth(s.id)));
  }

  /**
   * Calculate plan statistics
   */
  private calculateStats(plan: Plan): ValidationResult['stats'] {
    return {
      stepCount: plan.steps.length,
      toolSteps: plan.steps.filter(s => s.toolName).length,
      maxDepth: this.calculateMaxDependencyDepth(plan),
      estimatedDuration: plan.estimatedDuration ?? plan.steps.length * 30000,
    };
  }
}

/**
 * Create a plan validator
 */
export function createPlanValidator(config?: PlanValidatorConfig): PlanValidator {
  return new PlanValidator(config);
}
