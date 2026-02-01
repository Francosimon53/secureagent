/**
 * Autonomy Module Configuration
 * Zod schemas for autonomous agent configuration
 */

import { z } from 'zod';

// ============================================================================
// Execution Configuration
// ============================================================================

export const ExecutionConfigSchema = z.object({
  /** Maximum number of agentic iterations per execution */
  maxIterations: z.number().min(1).max(500).default(50),
  /** Maximum steps per plan */
  maxStepsPerPlan: z.number().min(1).max(100).default(20),
  /** Timeout for each step in ms */
  stepTimeout: z.number().min(1000).max(600000).default(60000),
  /** Overall execution timeout in ms */
  executionTimeout: z.number().min(60000).max(86400000).default(3600000),
  /** Default concurrency for parallel steps */
  defaultConcurrency: z.number().min(1).max(10).default(3),
  /** Enable step-level checkpointing */
  enableCheckpointing: z.boolean().default(true),
});

export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>;

// ============================================================================
// Correction Configuration
// ============================================================================

export const CorrectionConfigSchema = z.object({
  /** Maximum retries per step */
  maxRetriesPerStep: z.number().min(0).max(10).default(3),
  /** Base delay for exponential backoff in ms */
  baseRetryDelay: z.number().min(100).max(60000).default(1000),
  /** Maximum retry delay in ms */
  maxRetryDelay: z.number().min(1000).max(300000).default(30000),
  /** Backoff multiplier */
  backoffMultiplier: z.number().min(1).max(5).default(2),
  /** Enable within-session learning */
  enableSessionLearning: z.boolean().default(true),
  /** Minimum confidence for pattern application */
  patternConfidenceThreshold: z.number().min(0).max(1).default(0.7),
  /** Maximum patterns to store per session */
  maxPatternsPerSession: z.number().min(10).max(1000).default(100),
});

export type CorrectionConfig = z.infer<typeof CorrectionConfigSchema>;

// ============================================================================
// Approval Configuration
// ============================================================================

export const PermissionLevelSchema = z.enum(['always_ask', 'sensitive_only', 'never_ask']);

export const SensitivityCategorySchema = z.enum([
  'data_modification',
  'external_communication',
  'financial',
  'credential_access',
  'irreversible_action',
  'system_change',
  'data_export',
]);

export const ApprovalConfigSchema = z.object({
  /** Default permission level for all users */
  defaultPermissionLevel: PermissionLevelSchema.default('sensitive_only'),
  /** Categories considered sensitive */
  sensitiveCategories: z.array(SensitivityCategorySchema).default([
    'data_modification',
    'financial',
    'credential_access',
    'irreversible_action',
  ]),
  /** Timeout for approval requests in ms */
  approvalTimeout: z.number().min(30000).max(3600000).default(300000),
  /** Enable alternative action suggestions */
  suggestAlternatives: z.boolean().default(true),
  /** Maximum alternatives to suggest */
  maxAlternatives: z.number().min(0).max(5).default(3),
  /** Tools that always require approval (glob patterns) */
  alwaysRequireApprovalPatterns: z.array(z.string()).default([
    '*delete*',
    '*remove*',
    '*drop*',
    '*send_email*',
    '*payment*',
    '*transfer*',
  ]),
  /** Tools that never require approval (glob patterns) */
  neverRequireApprovalPatterns: z.array(z.string()).default([
    'read_*',
    'get_*',
    'list_*',
    'search_*',
  ]),
});

export type ApprovalConfig = z.infer<typeof ApprovalConfigSchema>;

// ============================================================================
// Planning Configuration
// ============================================================================

export const PlanningConfigSchema = z.object({
  /** Enable LLM-based plan generation */
  enableLLMPlanning: z.boolean().default(true),
  /** Maximum planning iterations */
  maxPlanningIterations: z.number().min(1).max(20).default(5),
  /** Enable plan validation */
  enablePlanValidation: z.boolean().default(true),
  /** Enable dynamic re-planning on failure */
  enableDynamicReplanning: z.boolean().default(true),
  /** Minimum step description length */
  minStepDescriptionLength: z.number().min(5).max(50).default(10),
});

export type PlanningConfig = z.infer<typeof PlanningConfigSchema>;

// ============================================================================
// Chaining Configuration
// ============================================================================

export const ChainingConfigSchema = z.object({
  /** Maximum steps per chain */
  maxChainSteps: z.number().min(1).max(50).default(20),
  /** Enable variable persistence across chains */
  persistVariables: z.boolean().default(true),
  /** Variable expiration in ms (0 = never) */
  variableExpirationMs: z.number().min(0).default(0),
  /** Enable output transformation */
  enableOutputTransform: z.boolean().default(true),
  /** Enable conditional branching */
  enableConditionalBranching: z.boolean().default(true),
});

export type ChainingConfig = z.infer<typeof ChainingConfigSchema>;

// ============================================================================
// Long-running Configuration
// ============================================================================

export const LongRunningConfigSchema = z.object({
  /** Enable background execution */
  enableBackground: z.boolean().default(true),
  /** Checkpoint interval in ms */
  checkpointInterval: z.number().min(60000).max(1800000).default(300000),
  /** Enable webhook notifications */
  enableWebhooks: z.boolean().default(true),
  /** Maximum concurrent background executions */
  maxConcurrentBackgroundExecutions: z.number().min(1).max(50).default(10),
  /** Background execution timeout in ms (0 = no timeout) */
  backgroundTimeout: z.number().min(0).default(0),
});

export type LongRunningConfig = z.infer<typeof LongRunningConfigSchema>;

// ============================================================================
// Store Configuration
// ============================================================================

export const StoreConfigSchema = z.object({
  /** Store type */
  type: z.enum(['memory', 'database']).default('database'),
  /** Execution retention days */
  executionRetentionDays: z.number().min(1).max(365).default(30),
  /** Plan retention days */
  planRetentionDays: z.number().min(1).max(365).default(30),
  /** Enable compression for stored data */
  enableCompression: z.boolean().default(false),
});

export type StoreConfig = z.infer<typeof StoreConfigSchema>;

// ============================================================================
// Main Autonomy Configuration
// ============================================================================

export const AutonomyConfigSchema = z.object({
  /** Enable the autonomy module */
  enabled: z.boolean().default(true),
  /** Execution configuration */
  execution: ExecutionConfigSchema.default({}),
  /** Correction configuration */
  correction: CorrectionConfigSchema.default({}),
  /** Approval configuration */
  approval: ApprovalConfigSchema.default({}),
  /** Planning configuration */
  planning: PlanningConfigSchema.default({}),
  /** Chaining configuration */
  chaining: ChainingConfigSchema.default({}),
  /** Long-running execution configuration */
  longRunning: LongRunningConfigSchema.default({}),
  /** Store configuration */
  store: StoreConfigSchema.default({}),
});

export type AutonomyConfig = z.infer<typeof AutonomyConfigSchema>;

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_AUTONOMY_CONFIG: AutonomyConfig = AutonomyConfigSchema.parse({});

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * Validate autonomy configuration
 */
export function validateAutonomyConfig(config: unknown): { valid: true; config: AutonomyConfig } | { valid: false; errors: string[] } {
  const result = AutonomyConfigSchema.safeParse(config);
  if (result.success) {
    return { valid: true, config: result.data };
  }
  return {
    valid: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Safely parse autonomy configuration
 */
export function safeParseAutonomyConfig(config: unknown): AutonomyConfig {
  return AutonomyConfigSchema.parse(config);
}

/**
 * Merge configuration with defaults
 */
export function mergeWithDefaults(config?: Partial<AutonomyConfig>): AutonomyConfig {
  return AutonomyConfigSchema.parse(config ?? {});
}
