/**
 * Skills Module
 *
 * Dynamic skill creation and execution system.
 * Allows agents to create, manage, and run custom tools.
 */

// Types
export type {
  Skill,
  SkillMetadata,
  SkillParameter,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillCreateInput,
  SkillUpdateInput,
  SkillErrorCode,
} from './types.js';

export {
  SkillError,
  SKILL_DEFAULTS,
  SKILL_EVENTS,
  BLOCKED_PATTERNS,
  SANDBOX_GLOBALS,
  SkillParameterSchema,
  SkillCreateInputSchema,
  SkillUpdateInputSchema,
} from './types.js';

// Registry
export type { SkillRegistry, DatabaseAdapter } from './skill-registry.js';
export {
  InMemorySkillRegistry,
  DatabaseSkillRegistry,
  createSkillRegistry,
} from './skill-registry.js';

// Executor
export type { SkillExecutorConfig } from './skill-executor.js';
export {
  SkillExecutor,
  createSkillExecutor,
  validateSkillCode,
} from './skill-executor.js';

// Loader
export type { SkillFile, SkillLoaderConfig } from './skill-loader.js';
export {
  SkillLoader,
  createSkillLoader,
} from './skill-loader.js';

// Creator
export type { SkillCreatorConfig } from './skill-creator.js';
export {
  SkillCreator,
  createSkillCreator,
} from './skill-creator.js';

// Tools
export type { ToolDefinition, ToolCallResult } from './skill-tools.js';
export {
  SkillToolHandler,
  createSkillToolHandler,
  SKILL_TOOLS,
  CREATE_SKILL_TOOL,
  LIST_SKILLS_TOOL,
  RUN_SKILL_TOOL,
  GET_SKILL_TOOL,
  DELETE_SKILL_TOOL,
} from './skill-tools.js';

// =============================================================================
// Convenience Factory
// =============================================================================

import { createSkillRegistry, InMemorySkillRegistry } from './skill-registry.js';
import { createSkillExecutor } from './skill-executor.js';
import { createSkillLoader } from './skill-loader.js';
import { createSkillCreator, SkillCreator } from './skill-creator.js';
import { createSkillToolHandler, SkillToolHandler } from './skill-tools.js';

export interface SkillSystemConfig {
  skillsDir?: string;
  persistToFile?: boolean;
  maxSkillsPerUser?: number;
  defaultTimeout?: number;
}

export interface SkillSystem {
  creator: SkillCreator;
  toolHandler: SkillToolHandler;
  initialize(): Promise<void>;
}

/**
 * Create a complete skill system with all components
 */
export function createSkillSystem(config?: SkillSystemConfig): SkillSystem {
  const skillsDir = config?.skillsDir || './skills';
  const persistToFile = config?.persistToFile ?? false;

  const registry = createSkillRegistry('memory');
  const executor = createSkillExecutor({
    defaultTimeout: config?.defaultTimeout,
  });
  const loader = createSkillLoader(registry, {
    skillsDir,
    autoLoad: false, // Will load during initialize
  });
  const creator = createSkillCreator(registry, executor, loader, {
    skillsDir,
    persistToFile,
    maxSkillsPerUser: config?.maxSkillsPerUser,
    defaultTimeout: config?.defaultTimeout,
  });
  const toolHandler = createSkillToolHandler(creator);

  return {
    creator,
    toolHandler,
    initialize: async () => {
      await creator.initialize();
    },
  };
}
