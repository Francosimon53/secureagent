/**
 * Skill Creator
 *
 * Handles the creation and management of dynamic skills.
 * Integrates registry, executor, and loader components.
 */

import type {
  Skill,
  SkillMetadata,
  SkillCreateInput,
  SkillUpdateInput,
  SkillExecutionContext,
  SkillExecutionResult,
} from './types.js';
import { SkillError, SkillCreateInputSchema, SKILL_DEFAULTS } from './types.js';
import type { SkillRegistry } from './skill-registry.js';
import { SkillExecutor, validateSkillCode } from './skill-executor.js';
import { SkillLoader } from './skill-loader.js';

// =============================================================================
// Skill Creator Configuration
// =============================================================================

export interface SkillCreatorConfig {
  maxSkillsPerUser: number;
  defaultTimeout: number;
  skillsDir: string;
  persistToFile: boolean;
}

const DEFAULT_CONFIG: SkillCreatorConfig = {
  maxSkillsPerUser: SKILL_DEFAULTS.MAX_SKILLS_PER_USER,
  defaultTimeout: SKILL_DEFAULTS.EXECUTION_TIMEOUT_MS,
  skillsDir: SKILL_DEFAULTS.SKILLS_DIR,
  persistToFile: true,
};

// =============================================================================
// Skill Creator
// =============================================================================

export class SkillCreator {
  private readonly config: SkillCreatorConfig;
  private readonly registry: SkillRegistry;
  private readonly executor: SkillExecutor;
  private readonly loader: SkillLoader;
  private readonly codeStore = new Map<string, string>(); // skillId -> code

  constructor(
    registry: SkillRegistry,
    executor: SkillExecutor,
    loader: SkillLoader,
    config?: Partial<SkillCreatorConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = registry;
    this.executor = executor;
    this.loader = loader;
  }

  /**
   * Initialize the skill creator
   */
  async initialize(): Promise<void> {
    await this.registry.initialize();
    // Only initialize loader (creates directory) if persisting to file
    if (this.config.persistToFile) {
      await this.loader.initialize();
    }
  }

  /**
   * Create a new skill
   */
  async createSkill(input: SkillCreateInput): Promise<SkillMetadata> {
    // Validate input
    const validation = SkillCreateInputSchema.safeParse(input);
    if (!validation.success) {
      throw new SkillError(
        'SKILL_VALIDATION_ERROR',
        `Invalid skill input: ${validation.error.message}`
      );
    }

    // Validate code security
    const codeValidation = validateSkillCode(input.code);
    if (!codeValidation.valid) {
      throw new SkillError(
        'SKILL_SECURITY_VIOLATION',
        `Code validation failed: ${codeValidation.errors.join(', ')}`
      );
    }

    // Check for duplicate name
    const existing = await this.registry.getByName(input.name);
    if (existing) {
      throw new SkillError('SKILL_EXISTS', `Skill '${input.name}' already exists`);
    }

    // Register skill
    const metadata = await this.registry.register(input, input.code);

    // Store code
    this.codeStore.set(metadata.id, input.code);

    // Persist to file if configured
    if (this.config.persistToFile) {
      await this.loader.saveToFile(metadata, input.code);
    }

    return metadata;
  }

  /**
   * Get a skill by ID
   */
  async getSkill(id: string): Promise<Skill | null> {
    const metadata = await this.registry.get(id);
    if (!metadata) return null;

    const code = this.codeStore.get(id);
    if (!code) return null;

    return this.buildSkill(metadata, code);
  }

  /**
   * Get a skill by name
   */
  async getSkillByName(name: string): Promise<Skill | null> {
    const metadata = await this.registry.getByName(name);
    if (!metadata) return null;

    const code = this.codeStore.get(metadata.id);
    if (!code) return null;

    return this.buildSkill(metadata, code);
  }

  /**
   * List all skills
   */
  async listSkills(options?: {
    enabled?: boolean;
    tags?: string[];
    limit?: number;
  }): Promise<SkillMetadata[]> {
    return this.registry.list(options);
  }

  /**
   * Search skills
   */
  async searchSkills(query: string): Promise<SkillMetadata[]> {
    return this.registry.search(query);
  }

  /**
   * Update a skill
   */
  async updateSkill(id: string, updates: SkillUpdateInput): Promise<SkillMetadata | null> {
    // If code is being updated, validate it
    if (updates.code) {
      const codeValidation = validateSkillCode(updates.code);
      if (!codeValidation.valid) {
        throw new SkillError(
          'SKILL_SECURITY_VIOLATION',
          `Code validation failed: ${codeValidation.errors.join(', ')}`
        );
      }
    }

    const metadata = await this.registry.update(id, updates);
    if (!metadata) return null;

    // Update code store
    if (updates.code) {
      this.codeStore.set(id, updates.code);

      // Update file if persisting
      if (this.config.persistToFile) {
        await this.loader.saveToFile(metadata, updates.code);
      }
    }

    return metadata;
  }

  /**
   * Delete a skill
   */
  async deleteSkill(id: string): Promise<boolean> {
    const metadata = await this.registry.get(id);
    if (!metadata) return false;

    const deleted = await this.registry.delete(id);
    if (deleted) {
      this.codeStore.delete(id);

      // Delete file if persisting
      if (this.config.persistToFile) {
        await this.loader.deleteFile(`${metadata.name}.skill.json`);
      }
    }

    return deleted;
  }

  /**
   * Execute a skill
   */
  async executeSkill(
    skillId: string,
    params: Record<string, unknown>,
    context: Partial<SkillExecutionContext>
  ): Promise<SkillExecutionResult> {
    const metadata = await this.registry.get(skillId);
    if (!metadata) {
      return {
        success: false,
        error: `Skill not found: ${skillId}`,
        duration: 0,
      };
    }

    if (!metadata.enabled) {
      return {
        success: false,
        error: `Skill is disabled: ${metadata.name}`,
        duration: 0,
      };
    }

    const code = this.codeStore.get(skillId);
    if (!code) {
      return {
        success: false,
        error: `Skill code not found: ${skillId}`,
        duration: 0,
      };
    }

    // Validate parameters
    const paramValidation = this.executor.validateParams(params, metadata);
    if (!paramValidation.valid) {
      return {
        success: false,
        error: `Parameter validation failed: ${paramValidation.errors.join(', ')}`,
        duration: 0,
      };
    }

    // Build execution context
    const fullContext: SkillExecutionContext = {
      skillId,
      userId: context.userId || 'anonymous',
      sessionId: context.sessionId,
      timeout: context.timeout || this.config.defaultTimeout,
      sandboxed: context.sandboxed !== false,
    };

    // Execute
    const result = await this.executor.execute(code, params, fullContext);

    // Record execution
    await this.registry.recordExecution(skillId, result.success);

    return result;
  }

  /**
   * Execute a skill by name
   */
  async executeSkillByName(
    name: string,
    params: Record<string, unknown>,
    context: Partial<SkillExecutionContext>
  ): Promise<SkillExecutionResult> {
    const metadata = await this.registry.getByName(name);
    if (!metadata) {
      return {
        success: false,
        error: `Skill not found: ${name}`,
        duration: 0,
      };
    }
    return this.executeSkill(metadata.id, params, context);
  }

  /**
   * Build a Skill object from metadata and code
   */
  private buildSkill(metadata: SkillMetadata, code: string): Skill {
    return {
      metadata,
      code,
      execute: async (params, context) => {
        const result = await this.executeSkill(metadata.id, params, context);
        if (!result.success) {
          throw new SkillError('SKILL_EXECUTION_ERROR', result.error || 'Unknown error');
        }
        return result.result;
      },
    };
  }

  /**
   * Import skill code into the code store (for skills loaded from files)
   */
  importCode(skillId: string, code: string): void {
    this.codeStore.set(skillId, code);
  }

  /**
   * Get code for a skill
   */
  getCode(skillId: string): string | undefined {
    return this.codeStore.get(skillId);
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createSkillCreator(
  registry: SkillRegistry,
  executor: SkillExecutor,
  loader: SkillLoader,
  config?: Partial<SkillCreatorConfig>
): SkillCreator {
  return new SkillCreator(registry, executor, loader, config);
}
