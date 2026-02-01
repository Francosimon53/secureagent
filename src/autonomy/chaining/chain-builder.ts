/**
 * Chain Builder
 * Fluent API for building tool chains
 */

import { randomUUID } from 'crypto';
import type {
  ToolChain,
  ChainStep,
  ChainMode,
  ArgumentMapping,
} from '../types.js';

/**
 * Step builder for fluent API
 */
export class ChainStepBuilder {
  private currentStep: Partial<ChainStep>;
  private builder: ChainBuilder;

  constructor(builder: ChainBuilder, toolName: string) {
    this.builder = builder;
    this.currentStep = {
      id: randomUUID(),
      toolName,
      argumentMapping: {
        static: {},
        fromVariable: {},
        fromPrevious: {},
      },
    };
  }

  /**
   * Set a static argument value
   */
  withArg(name: string, value: unknown): this {
    this.currentStep.argumentMapping!.static[name] = value;
    return this;
  }

  /**
   * Set multiple static arguments
   */
  withArgs(args: Record<string, unknown>): this {
    Object.assign(this.currentStep.argumentMapping!.static, args);
    return this;
  }

  /**
   * Map an argument from a named variable
   */
  fromVariable(argName: string, variableName: string): this {
    this.currentStep.argumentMapping!.fromVariable[argName] = variableName;
    return this;
  }

  /**
   * Map an argument from the previous step's output
   * @param argName - The argument name
   * @param path - Path to the value in previous output (e.g., "data.items[0].id")
   */
  fromPrevious(argName: string, path: string = ''): this {
    this.currentStep.argumentMapping!.fromPrevious[argName] = path;
    return this;
  }

  /**
   * Map the entire previous output to an argument
   */
  withPreviousOutput(argName: string): this {
    return this.fromPrevious(argName, '');
  }

  /**
   * Set the step to execute on success
   */
  onSuccess(stepIdOrAction: string): this {
    this.currentStep.onSuccess = stepIdOrAction;
    return this;
  }

  /**
   * Set the step to execute on failure
   */
  onFailure(stepIdOrAction: string): this {
    this.currentStep.onFailure = stepIdOrAction;
    return this;
  }

  /**
   * Add a condition for this step
   */
  when(condition: string): this {
    this.currentStep.condition = condition;
    return this;
  }

  /**
   * Add an output transform
   */
  transform(transform: string): this {
    this.currentStep.outputTransform = transform;
    return this;
  }

  /**
   * Extract a specific field from the output
   */
  extract(path: string): this {
    return this.transform(`extract:${path}`);
  }

  /**
   * Add another step to the chain
   */
  step(toolName: string, args?: Record<string, unknown>): ChainStepBuilder {
    this.builder.addStep(this.build());
    const newBuilder = new ChainStepBuilder(this.builder, toolName);
    if (args) {
      newBuilder.withArgs(args);
    }
    return newBuilder;
  }

  /**
   * Build and finalize the chain
   */
  build(): ChainStep {
    return this.currentStep as ChainStep;
  }

  /**
   * End step building and return to chain builder
   */
  endStep(): ChainBuilder {
    this.builder.addStep(this.build());
    return this.builder;
  }
}

/**
 * Chain Builder
 * Provides a fluent API for building tool chains
 */
export class ChainBuilder {
  private chain: Partial<ToolChain>;
  private steps: ChainStep[] = [];

  constructor() {
    this.chain = {
      id: randomUUID(),
      mode: 'explicit',
      createdAt: Date.now(),
    };
  }

  /**
   * Set chain ID
   */
  withId(id: string): this {
    this.chain.id = id;
    return this;
  }

  /**
   * Set chain name
   */
  named(name: string): this {
    this.chain.name = name;
    return this;
  }

  /**
   * Set chain description
   */
  describedAs(description: string): this {
    this.chain.description = description;
    return this;
  }

  /**
   * Set execution mode
   */
  mode(mode: ChainMode): this {
    this.chain.mode = mode;
    return this;
  }

  /**
   * Set to explicit mode (predefined steps)
   */
  explicit(): this {
    return this.mode('explicit');
  }

  /**
   * Set to LLM-decided mode (dynamic steps)
   */
  llmDecided(): this {
    return this.mode('llm_decided');
  }

  /**
   * Add metadata
   */
  withMetadata(metadata: Record<string, unknown>): this {
    this.chain.metadata = { ...this.chain.metadata, ...metadata };
    return this;
  }

  /**
   * Add a step to the chain
   */
  step(toolName: string, args?: Record<string, unknown>): ChainStepBuilder {
    const stepBuilder = new ChainStepBuilder(this, toolName);
    if (args) {
      stepBuilder.withArgs(args);
    }
    return stepBuilder;
  }

  /**
   * Add a pre-built step
   */
  addStep(step: ChainStep): this {
    this.steps.push(step);
    return this;
  }

  /**
   * Add multiple steps
   */
  addSteps(steps: ChainStep[]): this {
    this.steps.push(...steps);
    return this;
  }

  /**
   * Build the chain
   */
  build(): ToolChain {
    return {
      ...this.chain,
      steps: this.steps,
    } as ToolChain;
  }
}

/**
 * Start building a chain
 */
export function buildChain(): ChainBuilder {
  return new ChainBuilder();
}

/**
 * Create a simple chain from a list of tool calls
 */
export function simpleChain(
  steps: Array<{
    tool: string;
    args?: Record<string, unknown>;
    fromPrevious?: Record<string, string>;
  }>
): ToolChain {
  let builder = buildChain();

  for (const stepDef of steps) {
    let stepBuilder = builder.step(stepDef.tool);

    if (stepDef.args) {
      stepBuilder = stepBuilder.withArgs(stepDef.args);
    }

    if (stepDef.fromPrevious) {
      for (const [argName, path] of Object.entries(stepDef.fromPrevious)) {
        stepBuilder = stepBuilder.fromPrevious(argName, path);
      }
    }

    builder = stepBuilder.endStep();
  }

  return builder.build();
}

/**
 * Create a chain step directly
 */
export function createStep(
  toolName: string,
  options?: {
    id?: string;
    args?: Record<string, unknown>;
    fromVariable?: Record<string, string>;
    fromPrevious?: Record<string, string>;
    onSuccess?: string;
    onFailure?: string;
    condition?: string;
    transform?: string;
  }
): ChainStep {
  return {
    id: options?.id ?? randomUUID(),
    toolName,
    argumentMapping: {
      static: options?.args ?? {},
      fromVariable: options?.fromVariable ?? {},
      fromPrevious: options?.fromPrevious ?? {},
    },
    onSuccess: options?.onSuccess,
    onFailure: options?.onFailure,
    condition: options?.condition,
    outputTransform: options?.transform,
  };
}

/**
 * Create a chain from a simple definition
 */
export function createChain(
  definition: {
    name?: string;
    description?: string;
    mode?: ChainMode;
    steps: Array<{
      tool: string;
      args?: Record<string, unknown>;
      fromVariable?: Record<string, string>;
      fromPrevious?: Record<string, string>;
      onSuccess?: string;
      onFailure?: string;
      condition?: string;
      transform?: string;
    }>;
  }
): ToolChain {
  return {
    id: randomUUID(),
    name: definition.name,
    description: definition.description,
    mode: definition.mode ?? 'explicit',
    steps: definition.steps.map(step => createStep(step.tool, step)),
    createdAt: Date.now(),
  };
}
