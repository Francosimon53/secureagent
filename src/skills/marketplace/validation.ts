/**
 * Skill Marketplace - Validation
 *
 * Validation logic for skill submissions
 */

import { z } from 'zod';
import type {
  SkillConfig,
  SkillSubmission,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  SkillCategory,
  SkillPermission,
} from './types.js';
import { SKILL_CATEGORIES } from './types.js';

/**
 * Reserved skill names
 */
const RESERVED_NAMES = [
  'system',
  'admin',
  'root',
  'marketplace',
  'official',
  'secureagent',
  'core',
  'internal',
];

/**
 * Maximum code size (100KB)
 */
const MAX_CODE_SIZE = 100 * 1024;

/**
 * Maximum description length
 */
const MAX_DESCRIPTION_LENGTH = 1000;

/**
 * Skill parameter schema
 */
const SkillParameterSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Parameter name must be alphanumeric'),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  description: z.string().min(1).max(200),
  required: z.boolean(),
  default: z.unknown().optional(),
  enum: z.array(z.string()).optional(),
});

/**
 * Skill config schema
 */
const SkillConfigSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(50)
    .regex(
      /^[a-z][a-z0-9-]*$/,
      'Skill name must be lowercase alphanumeric with hyphens',
    ),
  displayName: z.string().min(3).max(100),
  description: z.string().min(10).max(MAX_DESCRIPTION_LENGTH),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'Version must be in semver format (x.y.z)'),
  category: z.enum(SKILL_CATEGORIES),
  icon: z.string().max(10).optional(),
  parameters: z.array(SkillParameterSchema).max(20),
  tags: z.array(z.string().max(30)).max(10).optional(),
  dependencies: z.array(z.string()).max(10).optional(),
  permissions: z
    .array(
      z.enum([
        'network',
        'filesystem',
        'shell',
        'browser',
        'notifications',
        'clipboard',
      ]),
    )
    .optional(),
});

/**
 * Dangerous patterns to check in code
 */
const DANGEROUS_PATTERNS = [
  { pattern: /eval\s*\(/, message: 'Use of eval() is not allowed' },
  { pattern: /new\s+Function\s*\(/, message: 'Use of new Function() is not allowed' },
  { pattern: /process\.exit/, message: 'process.exit() is not allowed' },
  { pattern: /child_process/, message: 'Direct child_process access is not allowed' },
  { pattern: /require\s*\(\s*['"`]fs['"`]\s*\)/, message: 'Direct fs require is not allowed, use provided APIs' },
  { pattern: /__dirname|__filename/, message: 'Direct path access is not allowed' },
  { pattern: /process\.env\[/, message: 'Direct env access is discouraged, use provided config' },
];

/**
 * Required code patterns
 */
const REQUIRED_PATTERNS = [
  { pattern: /export\s+(default\s+)?function|export\s+const\s+\w+\s*=/, message: 'Skill must export a function' },
];

/**
 * Validate skill config
 */
function validateConfig(config: unknown): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  try {
    SkillConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      for (const issue of error.issues) {
        errors.push({
          field: issue.path.join('.'),
          message: issue.message,
          code: 'INVALID_CONFIG',
        });
      }
    }
    return { valid: false, errors };
  }

  const typedConfig = config as SkillConfig;

  // Check reserved names
  if (RESERVED_NAMES.includes(typedConfig.name.toLowerCase())) {
    errors.push({
      field: 'name',
      message: `Skill name "${typedConfig.name}" is reserved`,
      code: 'RESERVED_NAME',
    });
  }

  // Check for duplicate parameter names
  const paramNames = new Set<string>();
  for (const param of typedConfig.parameters) {
    if (paramNames.has(param.name)) {
      errors.push({
        field: `parameters.${param.name}`,
        message: `Duplicate parameter name: ${param.name}`,
        code: 'DUPLICATE_PARAM',
      });
    }
    paramNames.add(param.name);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate skill code
 */
function validateCode(code: string): {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
} {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check code size
  if (code.length > MAX_CODE_SIZE) {
    errors.push({
      field: 'code',
      message: `Code exceeds maximum size of ${MAX_CODE_SIZE / 1024}KB`,
      code: 'CODE_TOO_LARGE',
    });
  }

  // Check for dangerous patterns
  for (const { pattern, message } of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      errors.push({
        field: 'code',
        message,
        code: 'DANGEROUS_CODE',
      });
    }
  }

  // Check for required patterns
  for (const { pattern, message } of REQUIRED_PATTERNS) {
    if (!pattern.test(code)) {
      errors.push({
        field: 'code',
        message,
        code: 'MISSING_EXPORT',
      });
    }
  }

  // Check for TypeScript syntax (basic)
  if (!code.includes('async') && !code.includes('Promise')) {
    warnings.push({
      field: 'code',
      message: 'Consider making your skill function async for better performance',
      suggestion: 'export async function execute(params) { ... }',
    });
  }

  // Check for error handling
  if (!code.includes('try') && !code.includes('catch')) {
    warnings.push({
      field: 'code',
      message: 'Consider adding error handling to your skill',
      suggestion: 'Wrap your code in try/catch blocks',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate complete skill submission
 */
export function validateSkillSubmission(submission: SkillSubmission): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate config
  const configResult = validateConfig(submission.config);
  errors.push(...configResult.errors);

  // Validate code
  const codeResult = validateCode(submission.code);
  errors.push(...codeResult.errors);
  warnings.push(...codeResult.warnings);

  // Cross-validation: check parameters used in code
  if (configResult.valid) {
    for (const param of submission.config.parameters) {
      if (param.required && !submission.code.includes(param.name)) {
        warnings.push({
          field: `parameters.${param.name}`,
          message: `Required parameter "${param.name}" may not be used in code`,
          suggestion: 'Ensure all required parameters are used',
        });
      }
    }
  }

  // Check permissions match code patterns
  if (submission.config.permissions) {
    if (
      submission.code.includes('fetch') &&
      !submission.config.permissions.includes('network')
    ) {
      warnings.push({
        field: 'permissions',
        message: 'Code uses fetch but network permission is not declared',
        suggestion: 'Add "network" to permissions array',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate version bump
 */
export function validateVersionBump(
  currentVersion: string,
  newVersion: string,
): { valid: boolean; error?: string } {
  const current = currentVersion.split('.').map(Number);
  const next = newVersion.split('.').map(Number);

  // Ensure version is incrementing
  const currentNum = current[0] * 10000 + current[1] * 100 + current[2];
  const nextNum = next[0] * 10000 + next[1] * 100 + next[2];

  if (nextNum <= currentNum) {
    return {
      valid: false,
      error: `New version ${newVersion} must be greater than current version ${currentVersion}`,
    };
  }

  return { valid: true };
}

/**
 * Sanitize skill for safe display
 */
export function sanitizeSkillForDisplay(skill: {
  config: SkillConfig;
  code: string;
}): { config: SkillConfig; codePreview: string } {
  return {
    config: skill.config,
    codePreview:
      skill.code.length > 500
        ? skill.code.substring(0, 500) + '...'
        : skill.code,
  };
}
