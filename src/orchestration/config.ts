/**
 * Orchestration Configuration Schema
 * Zod-based configuration validation for the multi-agent orchestration system
 */

import { z } from 'zod';

/**
 * Persona configuration schema
 */
export const PersonasConfigSchema = z.object({
  /** Enable preset personas (developer, marketing, research, business) */
  enablePresets: z.boolean().default(true),
  /** Path to custom persona definitions */
  customPersonasPath: z.string().optional(),
  /** Default model tier for new personas */
  defaultModelTier: z.enum(['fast', 'balanced', 'powerful']).default('balanced'),
});

/**
 * Agent spawner configuration schema
 */
export const SpawnerConfigSchema = z.object({
  /** Maximum concurrent agents allowed */
  maxConcurrentAgents: z.number().min(1).max(50).default(10),
  /** Agent idle timeout in minutes before auto-termination */
  agentIdleTimeoutMinutes: z.number().min(5).max(120).default(30),
  /** Maximum sub-agents per parent agent */
  maxSubAgentsPerAgent: z.number().min(1).max(10).default(5),
  /** Auto-terminate agents when task completes */
  autoTerminateOnCompletion: z.boolean().default(true),
});

/**
 * Communication configuration schema
 */
export const CommunicationConfigSchema = z.object({
  /** Maximum message size in bytes */
  maxMessageSizeBytes: z.number().min(1024).max(1048576).default(65536),
  /** Message retention period in hours */
  messageRetentionHours: z.number().min(1).max(168).default(24),
  /** Maximum channels per collaboration session */
  maxChannelsPerSession: z.number().min(1).max(10).default(5),
  /** Enable broadcast messaging */
  enableBroadcast: z.boolean().default(true),
});

/**
 * Background task processing configuration schema
 */
export const BackgroundConfigSchema = z.object({
  /** Enable background task processing */
  enabled: z.boolean().default(true),
  /** Maximum tasks in queue */
  maxQueueSize: z.number().min(10).max(1000).default(100),
  /** Checkpoint interval in minutes */
  checkpointIntervalMinutes: z.number().min(1).max(30).default(5),
  /** Task timeout in minutes */
  taskTimeoutMinutes: z.number().min(5).max(480).default(60),
  /** Retry failed tasks */
  retryFailedTasks: z.boolean().default(true),
  /** Maximum retry attempts */
  maxRetries: z.number().min(0).max(5).default(3),
});

/**
 * Overnight processing configuration schema
 */
export const OvernightConfigSchema = z.object({
  /** Enable overnight processing mode */
  enabled: z.boolean().default(true),
  /** Overnight processing start hour (0-23) */
  startHour: z.number().min(0).max(23).default(1),
  /** Overnight processing end hour (0-23) */
  endHour: z.number().min(0).max(23).default(6),
  /** Maximum tasks to process per night */
  maxTasksPerNight: z.number().min(1).max(100).default(20),
  /** Minimum priority threshold for overnight processing */
  priorityThreshold: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
});

/**
 * Reporting configuration schema
 */
export const ReportingConfigSchema = z.object({
  /** Enable reporting */
  enabled: z.boolean().default(true),
  /** Daily report generation hour (0-23) */
  dailyReportHour: z.number().min(0).max(23).default(8),
  /** Report retention in days */
  retentionDays: z.number().min(7).max(365).default(30),
  /** Include detailed metrics in reports */
  includeDetailedMetrics: z.boolean().default(true),
});

/**
 * Learning and self-improvement configuration schema
 */
export const LearningConfigSchema = z.object({
  /** Enable learning system */
  enabled: z.boolean().default(true),
  /** Capture all errors for analysis */
  captureAllErrors: z.boolean().default(true),
  /** Minimum confidence score to create a pattern */
  minConfidenceForPattern: z.number().min(0.1).max(1).default(0.7),
  /** Automatically apply improvements without approval */
  autoApplyImprovements: z.boolean().default(false),
  /** Require approval for improvements */
  improvementApprovalRequired: z.boolean().default(true),
});

/**
 * Main orchestration configuration schema
 */
export const OrchestrationConfigSchema = z.object({
  /** Enable orchestration module */
  enabled: z.boolean().default(true),
  /** Storage type for orchestration data */
  storeType: z.enum(['memory', 'database']).default('database'),
  /** Persona configuration */
  personas: PersonasConfigSchema.default({}),
  /** Agent spawner configuration */
  spawner: SpawnerConfigSchema.default({}),
  /** Communication configuration */
  communication: CommunicationConfigSchema.default({}),
  /** Background task configuration */
  background: BackgroundConfigSchema.default({}),
  /** Overnight processing configuration */
  overnight: OvernightConfigSchema.default({}),
  /** Reporting configuration */
  reporting: ReportingConfigSchema.default({}),
  /** Learning configuration */
  learning: LearningConfigSchema.default({}),
});

// =============================================================================
// Type Exports
// =============================================================================

export type OrchestrationConfig = z.infer<typeof OrchestrationConfigSchema>;
export type PersonasConfig = z.infer<typeof PersonasConfigSchema>;
export type SpawnerConfig = z.infer<typeof SpawnerConfigSchema>;
export type CommunicationConfig = z.infer<typeof CommunicationConfigSchema>;
export type BackgroundConfig = z.infer<typeof BackgroundConfigSchema>;
export type OvernightConfig = z.infer<typeof OvernightConfigSchema>;
export type ReportingConfig = z.infer<typeof ReportingConfigSchema>;
export type LearningConfig = z.infer<typeof LearningConfigSchema>;

// =============================================================================
// Validation Utilities
// =============================================================================

/**
 * Validate orchestration configuration
 */
export function validateOrchestrationConfig(
  config: unknown
): { success: true; data: OrchestrationConfig } | { success: false; errors: Array<{ path: string; message: string }> } {
  const result = OrchestrationConfigSchema.safeParse(config);

  if (!result.success) {
    return {
      success: false,
      errors: result.error.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    };
  }

  return { success: true, data: result.data };
}

/**
 * Safe parse orchestration configuration
 */
export function safeParseOrchestrationConfig(config: unknown): OrchestrationConfig | null {
  const result = OrchestrationConfigSchema.safeParse(config);
  return result.success ? result.data : null;
}

/**
 * Get default orchestration configuration
 */
export function getDefaultOrchestrationConfig(): OrchestrationConfig {
  return OrchestrationConfigSchema.parse({});
}
