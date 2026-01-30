/**
 * Skill Tools
 *
 * Agent tools for creating, listing, and running skills dynamically.
 * These tools can be used by AI agents to extend their capabilities.
 */

import type { SkillCreateInput, SkillMetadata, SkillExecutionResult } from './types.js';
import type { SkillCreator } from './skill-creator.js';

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * JSON Schema property definition
 */
export interface SchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

/**
 * Tool definition compatible with OpenAI/Anthropic tool format
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, SchemaProperty>;
    required: string[];
  };
}

/**
 * Tool call result
 */
export interface ToolCallResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

// =============================================================================
// Skill Tool Definitions
// =============================================================================

export const CREATE_SKILL_TOOL: ToolDefinition = {
  name: 'create_skill',
  description: `Create a new dynamic skill that can be executed later. Skills are JavaScript functions that run in a sandboxed environment. The code must contain an async execute(params, context) function.

Example skill code:
\`\`\`
async function execute(params, context) {
  const { url } = params;
  const response = await fetch(url);
  return await response.json();
}
\`\`\`

Security notes:
- Skills run in a sandbox with limited globals
- No access to process, require, or file system
- Network access is controlled (no localhost/internal IPs)
- Code is validated for dangerous patterns`,
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Unique name for the skill (alphanumeric, hyphens allowed)',
      },
      description: {
        type: 'string',
        description: 'What the skill does',
      },
      code: {
        type: 'string',
        description: 'JavaScript code containing an async execute(params, context) function',
      },
      parameters: {
        type: 'array',
        description: 'Parameter definitions for the skill',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['string', 'number', 'boolean', 'array', 'object'] },
            description: { type: 'string' },
            required: { type: 'boolean' },
          },
          required: ['name', 'type', 'description', 'required'],
        },
      },
      tags: {
        type: 'array',
        description: 'Tags for categorizing the skill',
        items: { type: 'string' },
      },
    },
    required: ['name', 'description', 'code'],
  },
};

export const LIST_SKILLS_TOOL: ToolDefinition = {
  name: 'list_skills',
  description: 'List available skills. Can filter by enabled status or tags.',
  parameters: {
    type: 'object',
    properties: {
      enabled: {
        type: 'boolean',
        description: 'Filter by enabled status',
      },
      tags: {
        type: 'array',
        description: 'Filter by tags',
        items: { type: 'string' },
      },
      query: {
        type: 'string',
        description: 'Search query to filter skills by name, description, or tags',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of skills to return',
      },
    },
    required: [],
  },
};

export const RUN_SKILL_TOOL: ToolDefinition = {
  name: 'run_skill',
  description: 'Execute a skill by name with the given parameters.',
  parameters: {
    type: 'object',
    properties: {
      skill_name: {
        type: 'string',
        description: 'Name of the skill to execute',
      },
      params: {
        type: 'object',
        description: 'Parameters to pass to the skill',
      },
      timeout: {
        type: 'number',
        description: 'Execution timeout in milliseconds (default: 30000)',
      },
    },
    required: ['skill_name'],
  },
};

export const GET_SKILL_TOOL: ToolDefinition = {
  name: 'get_skill',
  description: 'Get details about a specific skill including its code and parameters.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the skill to get details for',
      },
    },
    required: ['name'],
  },
};

export const DELETE_SKILL_TOOL: ToolDefinition = {
  name: 'delete_skill',
  description: 'Delete a skill by name.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the skill to delete',
      },
    },
    required: ['name'],
  },
};

// =============================================================================
// All Skill Tools
// =============================================================================

export const SKILL_TOOLS: ToolDefinition[] = [
  CREATE_SKILL_TOOL,
  LIST_SKILLS_TOOL,
  RUN_SKILL_TOOL,
  GET_SKILL_TOOL,
  DELETE_SKILL_TOOL,
];

// =============================================================================
// Tool Handler
// =============================================================================

export class SkillToolHandler {
  constructor(
    private readonly skillCreator: SkillCreator,
    private readonly userId: string = 'agent'
  ) {}

  /**
   * Handle a tool call
   */
  async handleToolCall(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> {
    switch (toolName) {
      case 'create_skill':
        return this.handleCreateSkill(args);
      case 'list_skills':
        return this.handleListSkills(args);
      case 'run_skill':
        return this.handleRunSkill(args);
      case 'get_skill':
        return this.handleGetSkill(args);
      case 'delete_skill':
        return this.handleDeleteSkill(args);
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }
  }

  /**
   * Handle create_skill tool
   */
  private async handleCreateSkill(args: Record<string, unknown>): Promise<ToolCallResult> {
    try {
      const input: SkillCreateInput = {
        name: args.name as string,
        description: args.description as string,
        code: args.code as string,
        parameters: args.parameters as SkillCreateInput['parameters'],
        tags: args.tags as string[],
        author: this.userId,
      };

      const metadata = await this.skillCreator.createSkill(input);

      return {
        success: true,
        result: {
          message: `Skill '${metadata.name}' created successfully`,
          skillId: metadata.id,
          name: metadata.name,
          description: metadata.description,
          parameters: metadata.parameters,
          tags: metadata.tags,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle list_skills tool
   */
  private async handleListSkills(args: Record<string, unknown>): Promise<ToolCallResult> {
    try {
      let skills: SkillMetadata[];

      if (args.query) {
        skills = await this.skillCreator.searchSkills(args.query as string);
      } else {
        skills = await this.skillCreator.listSkills({
          enabled: args.enabled as boolean | undefined,
          tags: args.tags as string[] | undefined,
          limit: args.limit as number | undefined,
        });
      }

      return {
        success: true,
        result: {
          count: skills.length,
          skills: skills.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            tags: s.tags,
            enabled: s.enabled,
            executionCount: s.executionCount,
            parameters: s.parameters.map(p => ({
              name: p.name,
              type: p.type,
              required: p.required,
            })),
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle run_skill tool
   */
  private async handleRunSkill(args: Record<string, unknown>): Promise<ToolCallResult> {
    try {
      const skillName = args.skill_name as string;
      const params = (args.params as Record<string, unknown>) || {};
      const timeout = args.timeout as number | undefined;

      const result = await this.skillCreator.executeSkillByName(skillName, params, {
        userId: this.userId,
        timeout,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      return {
        success: true,
        result: {
          output: result.result,
          duration: result.duration,
          logs: result.logs,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle get_skill tool
   */
  private async handleGetSkill(args: Record<string, unknown>): Promise<ToolCallResult> {
    try {
      const skill = await this.skillCreator.getSkillByName(args.name as string);

      if (!skill) {
        return {
          success: false,
          error: `Skill not found: ${args.name}`,
        };
      }

      return {
        success: true,
        result: {
          id: skill.metadata.id,
          name: skill.metadata.name,
          description: skill.metadata.description,
          version: skill.metadata.version,
          author: skill.metadata.author,
          parameters: skill.metadata.parameters,
          tags: skill.metadata.tags,
          enabled: skill.metadata.enabled,
          code: skill.code,
          executionCount: skill.metadata.executionCount,
          lastExecutedAt: skill.metadata.lastExecutedAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle delete_skill tool
   */
  private async handleDeleteSkill(args: Record<string, unknown>): Promise<ToolCallResult> {
    try {
      const skill = await this.skillCreator.getSkillByName(args.name as string);

      if (!skill) {
        return {
          success: false,
          error: `Skill not found: ${args.name}`,
        };
      }

      const deleted = await this.skillCreator.deleteSkill(skill.metadata.id);

      return {
        success: deleted,
        result: deleted
          ? { message: `Skill '${args.name}' deleted successfully` }
          : undefined,
        error: deleted ? undefined : 'Failed to delete skill',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get all tool definitions
   */
  getToolDefinitions(): ToolDefinition[] {
    return SKILL_TOOLS;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createSkillToolHandler(
  skillCreator: SkillCreator,
  userId?: string
): SkillToolHandler {
  return new SkillToolHandler(skillCreator, userId);
}
