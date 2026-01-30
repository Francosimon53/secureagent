/**
 * Skill Loader
 *
 * Loads skills from the filesystem and validates them.
 */

import { readdir, readFile, stat, writeFile, mkdir } from 'fs/promises';
import { join, basename, extname } from 'path';
import type { SkillMetadata, SkillCreateInput } from './types.js';
import { SkillError, SKILL_DEFAULTS, SkillCreateInputSchema } from './types.js';
import { validateSkillCode } from './skill-executor.js';
import type { SkillRegistry } from './skill-registry.js';

// =============================================================================
// Skill File Format
// =============================================================================

/**
 * Skill file structure (JSON with embedded code)
 */
export interface SkillFile {
  name: string;
  description: string;
  version?: string;
  author?: string;
  parameters?: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    required: boolean;
    default?: unknown;
  }>;
  tags?: string[];
  code: string;
}

// =============================================================================
// Skill Loader
// =============================================================================

export interface SkillLoaderConfig {
  skillsDir: string;
  autoLoad: boolean;
  watchForChanges: boolean;
}

const DEFAULT_CONFIG: SkillLoaderConfig = {
  skillsDir: SKILL_DEFAULTS.SKILLS_DIR,
  autoLoad: true,
  watchForChanges: false,
};

export class SkillLoader {
  private readonly config: SkillLoaderConfig;
  private readonly registry: SkillRegistry;
  private loadedFiles = new Map<string, string>(); // filepath -> skillId

  constructor(registry: SkillRegistry, config?: Partial<SkillLoaderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = registry;
  }

  /**
   * Initialize loader and optionally load all skills
   */
  async initialize(): Promise<void> {
    // Ensure skills directory exists
    await this.ensureSkillsDir();

    if (this.config.autoLoad) {
      await this.loadAll();
    }
  }

  /**
   * Ensure skills directory exists
   */
  private async ensureSkillsDir(): Promise<void> {
    try {
      await stat(this.config.skillsDir);
    } catch {
      await mkdir(this.config.skillsDir, { recursive: true });
    }
  }

  /**
   * Load all skills from the skills directory
   */
  async loadAll(): Promise<{ loaded: number; errors: string[] }> {
    const errors: string[] = [];
    let loaded = 0;

    try {
      const files = await readdir(this.config.skillsDir);
      const skillFiles = files.filter(f => f.endsWith('.skill.json'));

      for (const file of skillFiles) {
        try {
          await this.loadFile(join(this.config.skillsDir, file));
          loaded++;
        } catch (error) {
          errors.push(`${file}: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      // Directory might not exist yet
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return { loaded, errors };
  }

  /**
   * Load a single skill file
   */
  async loadFile(filepath: string): Promise<SkillMetadata> {
    // Read and parse file
    const content = await readFile(filepath, 'utf-8');
    let skillFile: SkillFile;

    try {
      skillFile = JSON.parse(content);
    } catch {
      throw new SkillError('SKILL_INVALID', `Invalid JSON in ${filepath}`);
    }

    // Validate skill file structure
    const validation = SkillCreateInputSchema.safeParse({
      name: skillFile.name,
      description: skillFile.description,
      code: skillFile.code,
      parameters: skillFile.parameters,
      tags: skillFile.tags,
      author: skillFile.author,
    });

    if (!validation.success) {
      throw new SkillError(
        'SKILL_VALIDATION_ERROR',
        `Invalid skill file: ${validation.error.message}`
      );
    }

    // Validate code security
    const codeValidation = validateSkillCode(skillFile.code);
    if (!codeValidation.valid) {
      throw new SkillError(
        'SKILL_SECURITY_VIOLATION',
        `Code validation failed: ${codeValidation.errors.join(', ')}`
      );
    }

    // Check if already loaded (update vs create)
    const existingId = this.loadedFiles.get(filepath);
    if (existingId) {
      const updated = await this.registry.update(existingId, {
        name: skillFile.name,
        description: skillFile.description,
        code: skillFile.code,
        parameters: skillFile.parameters,
        tags: skillFile.tags,
      });
      if (updated) return updated;
    }

    // Check if skill with same name exists
    const existing = await this.registry.getByName(skillFile.name);
    if (existing) {
      this.loadedFiles.set(filepath, existing.id);
      return existing;
    }

    // Register new skill
    const metadata = await this.registry.register(
      {
        name: skillFile.name,
        description: skillFile.description,
        code: skillFile.code,
        parameters: skillFile.parameters,
        tags: skillFile.tags,
        author: skillFile.author,
      },
      skillFile.code
    );

    this.loadedFiles.set(filepath, metadata.id);
    return metadata;
  }

  /**
   * Save a skill to a file
   */
  async saveToFile(
    metadata: SkillMetadata,
    code: string,
    filename?: string
  ): Promise<string> {
    const skillFile: SkillFile = {
      name: metadata.name,
      description: metadata.description,
      version: metadata.version,
      author: metadata.author,
      parameters: metadata.parameters,
      tags: metadata.tags,
      code,
    };

    const fname = filename || `${metadata.name}.skill.json`;
    const filepath = join(this.config.skillsDir, fname);

    await this.ensureSkillsDir();
    await writeFile(filepath, JSON.stringify(skillFile, null, 2), 'utf-8');

    this.loadedFiles.set(filepath, metadata.id);
    return filepath;
  }

  /**
   * Get the skills directory path
   */
  getSkillsDir(): string {
    return this.config.skillsDir;
  }

  /**
   * List all skill files
   */
  async listFiles(): Promise<string[]> {
    try {
      const files = await readdir(this.config.skillsDir);
      return files.filter(f => f.endsWith('.skill.json'));
    } catch {
      return [];
    }
  }

  /**
   * Delete a skill file
   */
  async deleteFile(filename: string): Promise<boolean> {
    const { unlink } = await import('fs/promises');
    const filepath = join(this.config.skillsDir, filename);

    try {
      await unlink(filepath);
      this.loadedFiles.delete(filepath);
      return true;
    } catch {
      return false;
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createSkillLoader(
  registry: SkillRegistry,
  config?: Partial<SkillLoaderConfig>
): SkillLoader {
  return new SkillLoader(registry, config);
}
