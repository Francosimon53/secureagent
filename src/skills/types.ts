/**
 * Skill System Types
 *
 * Type definitions for dynamic skill creation and management.
 */

import { z } from 'zod';

// =============================================================================
// Core Skill Types
// =============================================================================

/**
 * Skill parameter definition
 */
export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: unknown;
}

/**
 * Skill execution context
 */
export interface SkillExecutionContext {
  skillId: string;
  userId: string;
  sessionId?: string;
  timeout: number;
  sandboxed: boolean;
}

/**
 * Skill execution result
 */
export interface SkillExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
  logs?: string[];
}

/**
 * Skill metadata
 */
export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  parameters: SkillParameter[];
  tags: string[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastExecutedAt?: number;
  executionCount: number;
  filePath?: string;
}

/**
 * Skill definition (runtime)
 */
export interface Skill {
  metadata: SkillMetadata;
  code: string;
  execute: (params: Record<string, unknown>, context: SkillExecutionContext) => Promise<unknown>;
}

/**
 * Skill creation input
 */
export interface SkillCreateInput {
  name: string;
  description: string;
  code: string;
  parameters?: SkillParameter[];
  tags?: string[];
  author?: string;
}

/**
 * Skill update input
 */
export interface SkillUpdateInput {
  name?: string;
  description?: string;
  code?: string;
  parameters?: SkillParameter[];
  tags?: string[];
  enabled?: boolean;
}

// =============================================================================
// Validation Schemas
// =============================================================================

export const SkillParameterSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  description: z.string().min(1).max(500),
  required: z.boolean(),
  default: z.unknown().optional(),
});

export const SkillCreateInputSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  description: z.string().min(1).max(1000),
  code: z.string().min(10).max(50000),
  parameters: z.array(SkillParameterSchema).max(20).optional(),
  tags: z.array(z.string().max(32)).max(10).optional(),
  author: z.string().max(100).optional(),
});

export const SkillUpdateInputSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/).optional(),
  description: z.string().min(1).max(1000).optional(),
  code: z.string().min(10).max(50000).optional(),
  parameters: z.array(SkillParameterSchema).max(20).optional(),
  tags: z.array(z.string().max(32)).max(10).optional(),
  enabled: z.boolean().optional(),
});

// =============================================================================
// Error Types
// =============================================================================

export type SkillErrorCode =
  | 'SKILL_NOT_FOUND'
  | 'SKILL_EXISTS'
  | 'SKILL_INVALID'
  | 'SKILL_EXECUTION_ERROR'
  | 'SKILL_TIMEOUT'
  | 'SKILL_SECURITY_VIOLATION'
  | 'SKILL_VALIDATION_ERROR';

export class SkillError extends Error {
  constructor(
    public readonly code: SkillErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'SkillError';
  }
}

// =============================================================================
// Constants
// =============================================================================

export const SKILL_DEFAULTS = {
  EXECUTION_TIMEOUT_MS: 30000,
  MAX_CODE_SIZE: 50000,
  MAX_PARAMETERS: 20,
  MAX_SKILLS_PER_USER: 100,
  SKILLS_DIR: 'skills',
} as const;

export const SKILL_EVENTS = {
  SKILL_CREATED: 'skill:created',
  SKILL_UPDATED: 'skill:updated',
  SKILL_DELETED: 'skill:deleted',
  SKILL_EXECUTED: 'skill:executed',
  SKILL_FAILED: 'skill:failed',
} as const;

/**
 * Blocked patterns in skill code for security
 */
export const BLOCKED_PATTERNS = [
  // Process manipulation
  /process\.exit/,
  /process\.kill/,
  /process\.env/,
  // File system (except through allowed APIs)
  /require\s*\(\s*['"]fs['"]\s*\)/,
  /require\s*\(\s*['"]child_process['"]\s*\)/,
  /import\s+.*from\s+['"]fs['"]/,
  /import\s+.*from\s+['"]child_process['"]/,
  // Eval and dynamic code execution
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  // Network access (must use provided fetch)
  /require\s*\(\s*['"]net['"]\s*\)/,
  /require\s*\(\s*['"]dgram['"]\s*\)/,
  /require\s*\(\s*['"]tls['"]\s*\)/,
  // Native bindings
  /require\s*\(\s*['"].*\.node['"]\s*\)/,
  /process\.binding/,
  // Global manipulation
  /global\./,
  /globalThis\./,
];

/**
 * Allowed globals in sandbox
 */
export const SANDBOX_GLOBALS = [
  'console',
  'JSON',
  'Math',
  'Date',
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
  'RegExp',
  'Error',
  'Map',
  'Set',
  'Promise',
  'setTimeout',
  'clearTimeout',
  'Buffer',
  'URL',
  'URLSearchParams',
  'TextEncoder',
  'TextDecoder',
] as const;
