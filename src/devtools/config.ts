/**
 * Developer Tools Configuration
 *
 * Zod schemas for devtools module configuration including agent spawning,
 * GitHub integration, deployments, bug detection, test-fix loops, and issues.
 */

import { z } from 'zod';

// =============================================================================
// Agent Configuration
// =============================================================================

export const AgentConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultTimeout: z.number().min(1000).max(3600000).default(300000), // 5 minutes
  maxConcurrent: z.number().min(1).max(10).default(3),
  progressReportInterval: z.number().min(1000).max(60000).default(5000), // 5 seconds
  defaultWorkingDirectory: z.string().optional(),
  allowedAgentTypes: z.array(z.enum(['claude-code', 'codex', 'custom'])).default(['claude-code']),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// =============================================================================
// GitHub Configuration
// =============================================================================

export const GitHubConfigSchema = z.object({
  enabled: z.boolean().default(true),
  tokenEnvVar: z.string().default('GITHUB_TOKEN'),
  apiBaseUrl: z.string().url().default('https://api.github.com'),
  defaultOwner: z.string().optional(),
  defaultRepository: z.string().optional(),
  rateLimitPerHour: z.number().min(1).max(5000).default(1000),
  mergeRequiresApproval: z.boolean().default(true),
  deleteBranchAfterMerge: z.boolean().default(true),
  defaultMergeMethod: z.enum(['merge', 'squash', 'rebase']).default('squash'),
  requirePassingChecks: z.boolean().default(true),
  timeout: z.number().min(1000).max(60000).default(30000),
});

export type GitHubConfig = z.infer<typeof GitHubConfigSchema>;

// =============================================================================
// Deployment Configuration
// =============================================================================

export const DeploymentConfigSchema = z.object({
  enabled: z.boolean().default(true),
  provider: z.enum(['github-actions', 'vercel', 'netlify', 'custom-webhook']).default('github-actions'),
  productionRequiresApproval: z.boolean().default(true),
  stagingRequiresApproval: z.boolean().default(false),
  rollbackRequiresApproval: z.boolean().default(true),
  webhookUrl: z.string().url().optional(),
  webhookSecret: z.string().optional(),
  vercelTokenEnvVar: z.string().default('VERCEL_TOKEN'),
  vercelTeamId: z.string().optional(),
  vercelProjectId: z.string().optional(),
  netlifyTokenEnvVar: z.string().default('NETLIFY_TOKEN'),
  netlifySiteId: z.string().optional(),
  githubActionsWorkflow: z.string().default('deploy.yml'),
  timeout: z.number().min(1000).max(1800000).default(600000), // 10 minutes
  pollInterval: z.number().min(1000).max(60000).default(10000), // 10 seconds
});

export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;

// =============================================================================
// Bug Detection Configuration
// =============================================================================

export const BugPatternSchema = z.object({
  id: z.string(),
  name: z.string(),
  pattern: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  source: z.enum(['logs', 'errors', 'metrics', 'manual']),
  enabled: z.boolean().default(true),
});

export const BugDetectionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  sources: z.array(z.enum(['logs', 'errors', 'metrics', 'manual'])).default(['errors', 'logs']),
  severityThreshold: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  autoFixEnabled: z.boolean().default(false),
  autoFixRequiresApproval: z.boolean().default(true),
  autoFixMaxAttempts: z.number().min(1).max(5).default(3),
  patterns: z.array(BugPatternSchema).default([]),
  logScanIntervalMs: z.number().min(10000).max(3600000).default(60000), // 1 minute
  errorRetentionDays: z.number().min(1).max(365).default(30),
});

export type BugDetectionConfig = z.infer<typeof BugDetectionConfigSchema>;
export type BugPatternConfig = z.infer<typeof BugPatternSchema>;

// =============================================================================
// Test-Fix Loop Configuration
// =============================================================================

export const TestFixLoopConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultTestCommand: z.string().default('npm test'),
  maxIterations: z.number().min(1).max(20).default(5),
  timeoutPerIteration: z.number().min(10000).max(600000).default(120000), // 2 minutes
  fixGenerationTimeout: z.number().min(10000).max(600000).default(180000), // 3 minutes
  autoCommitFixes: z.boolean().default(false),
  stopOnFirstSuccess: z.boolean().default(true),
  preserveTestOrder: z.boolean().default(true),
});

export type TestFixLoopConfig = z.infer<typeof TestFixLoopConfigSchema>;

// =============================================================================
// Issue Configuration
// =============================================================================

export const IssueConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultLabels: z.array(z.string()).default(['bug', 'auto-created']),
  defaultAssignees: z.array(z.string()).default([]),
  includeConversationContext: z.boolean().default(true),
  maxContextMessages: z.number().min(1).max(50).default(10),
  includeCodeReferences: z.boolean().default(true),
  templatePath: z.string().optional(),
  autoCreateFromBugs: z.boolean().default(false),
});

export type IssueConfig = z.infer<typeof IssueConfigSchema>;

// =============================================================================
// Approval Configuration
// =============================================================================

export const ApprovalConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultTimeoutMs: z.number().min(30000).max(86400000).default(3600000), // 1 hour
  notifyOnRequest: z.boolean().default(true),
  notifyOnExpiry: z.boolean().default(true),
  requireReasonOnReject: z.boolean().default(true),
});

export type ApprovalConfig = z.infer<typeof ApprovalConfigSchema>;

// =============================================================================
// Main DevTools Configuration
// =============================================================================

export const DevToolsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  storeType: z.enum(['memory', 'database']).default('database'),

  agents: AgentConfigSchema.optional(),
  github: GitHubConfigSchema.optional(),
  deployments: DeploymentConfigSchema.optional(),
  bugDetection: BugDetectionConfigSchema.optional(),
  testFixLoop: TestFixLoopConfigSchema.optional(),
  issues: IssueConfigSchema.optional(),
  approval: ApprovalConfigSchema.optional(),
});

export type DevToolsConfig = z.infer<typeof DevToolsConfigSchema>;

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_DEVTOOLS_CONFIG: DevToolsConfig = {
  enabled: true,
  storeType: 'database',
  agents: {
    enabled: true,
    defaultTimeout: 300000,
    maxConcurrent: 3,
    progressReportInterval: 5000,
    allowedAgentTypes: ['claude-code'],
  },
  github: {
    enabled: true,
    tokenEnvVar: 'GITHUB_TOKEN',
    apiBaseUrl: 'https://api.github.com',
    rateLimitPerHour: 1000,
    mergeRequiresApproval: true,
    deleteBranchAfterMerge: true,
    defaultMergeMethod: 'squash',
    requirePassingChecks: true,
    timeout: 30000,
  },
  deployments: {
    enabled: true,
    provider: 'github-actions',
    productionRequiresApproval: true,
    stagingRequiresApproval: false,
    rollbackRequiresApproval: true,
    vercelTokenEnvVar: 'VERCEL_TOKEN',
    netlifyTokenEnvVar: 'NETLIFY_TOKEN',
    githubActionsWorkflow: 'deploy.yml',
    timeout: 600000,
    pollInterval: 10000,
  },
  bugDetection: {
    enabled: true,
    sources: ['errors', 'logs'],
    severityThreshold: 'medium',
    autoFixEnabled: false,
    autoFixRequiresApproval: true,
    autoFixMaxAttempts: 3,
    patterns: [],
    logScanIntervalMs: 60000,
    errorRetentionDays: 30,
  },
  testFixLoop: {
    enabled: true,
    defaultTestCommand: 'npm test',
    maxIterations: 5,
    timeoutPerIteration: 120000,
    fixGenerationTimeout: 180000,
    autoCommitFixes: false,
    stopOnFirstSuccess: true,
    preserveTestOrder: true,
  },
  issues: {
    enabled: true,
    defaultLabels: ['bug', 'auto-created'],
    defaultAssignees: [],
    includeConversationContext: true,
    maxContextMessages: 10,
    includeCodeReferences: true,
    autoCreateFromBugs: false,
  },
  approval: {
    enabled: true,
    defaultTimeoutMs: 3600000,
    notifyOnRequest: true,
    notifyOnExpiry: true,
    requireReasonOnReject: true,
  },
};

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Parse and validate devtools configuration
 */
export function parseDevToolsConfig(config: unknown): DevToolsConfig {
  const result = DevToolsConfigSchema.safeParse(config ?? {});
  if (!result.success) {
    throw new Error(`Invalid devtools config: ${result.error.message}`);
  }
  // Merge with defaults to ensure nested optional objects have their defaults applied
  return mergeWithDefaults(result.data);
}

/**
 * Merge partial config with defaults
 */
export function mergeWithDefaults(config?: Partial<DevToolsConfig>): DevToolsConfig {
  return {
    ...DEFAULT_DEVTOOLS_CONFIG,
    ...config,
    agents: config?.agents ? { ...DEFAULT_DEVTOOLS_CONFIG.agents, ...config.agents } : DEFAULT_DEVTOOLS_CONFIG.agents,
    github: config?.github ? { ...DEFAULT_DEVTOOLS_CONFIG.github, ...config.github } : DEFAULT_DEVTOOLS_CONFIG.github,
    deployments: config?.deployments ? { ...DEFAULT_DEVTOOLS_CONFIG.deployments, ...config.deployments } : DEFAULT_DEVTOOLS_CONFIG.deployments,
    bugDetection: config?.bugDetection ? { ...DEFAULT_DEVTOOLS_CONFIG.bugDetection, ...config.bugDetection } : DEFAULT_DEVTOOLS_CONFIG.bugDetection,
    testFixLoop: config?.testFixLoop ? { ...DEFAULT_DEVTOOLS_CONFIG.testFixLoop, ...config.testFixLoop } : DEFAULT_DEVTOOLS_CONFIG.testFixLoop,
    issues: config?.issues ? { ...DEFAULT_DEVTOOLS_CONFIG.issues, ...config.issues } : DEFAULT_DEVTOOLS_CONFIG.issues,
    approval: config?.approval ? { ...DEFAULT_DEVTOOLS_CONFIG.approval, ...config.approval } : DEFAULT_DEVTOOLS_CONFIG.approval,
  };
}
