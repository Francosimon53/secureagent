/**
 * Autonomy Module Constants
 * Event names, error codes, and default values
 */

// ============================================================================
// Event Names
// ============================================================================

export const AUTONOMY_EVENTS = {
  // Goal events
  GOAL_CREATED: 'autonomy:goal:created',
  GOAL_UPDATED: 'autonomy:goal:updated',
  GOAL_COMPLETED: 'autonomy:goal:completed',
  GOAL_FAILED: 'autonomy:goal:failed',
  GOAL_CANCELLED: 'autonomy:goal:cancelled',

  // Plan events
  PLAN_CREATED: 'autonomy:plan:created',
  PLAN_UPDATED: 'autonomy:plan:updated',
  PLAN_STARTED: 'autonomy:plan:started',
  PLAN_COMPLETED: 'autonomy:plan:completed',
  PLAN_FAILED: 'autonomy:plan:failed',
  PLAN_REPLANNED: 'autonomy:plan:replanned',

  // Step events
  STEP_STARTED: 'autonomy:step:started',
  STEP_COMPLETED: 'autonomy:step:completed',
  STEP_FAILED: 'autonomy:step:failed',
  STEP_RETRYING: 'autonomy:step:retrying',
  STEP_SKIPPED: 'autonomy:step:skipped',

  // Execution events
  EXECUTION_STARTED: 'autonomy:execution:started',
  EXECUTION_PROGRESS: 'autonomy:execution:progress',
  EXECUTION_PAUSED: 'autonomy:execution:paused',
  EXECUTION_RESUMED: 'autonomy:execution:resumed',
  EXECUTION_COMPLETED: 'autonomy:execution:completed',
  EXECUTION_FAILED: 'autonomy:execution:failed',
  EXECUTION_CANCELLED: 'autonomy:execution:cancelled',
  EXECUTION_CHECKPOINTED: 'autonomy:execution:checkpointed',

  // Chain events
  CHAIN_STARTED: 'autonomy:chain:started',
  CHAIN_STEP_STARTED: 'autonomy:chain:step:started',
  CHAIN_STEP_COMPLETED: 'autonomy:chain:step:completed',
  CHAIN_STEP_FAILED: 'autonomy:chain:step:failed',
  CHAIN_COMPLETED: 'autonomy:chain:completed',
  CHAIN_FAILED: 'autonomy:chain:failed',

  // Correction events
  CORRECTION_STARTED: 'autonomy:correction:started',
  CORRECTION_STRATEGY_SELECTED: 'autonomy:correction:strategy:selected',
  CORRECTION_SUCCEEDED: 'autonomy:correction:succeeded',
  CORRECTION_FAILED: 'autonomy:correction:failed',
  PATTERN_LEARNED: 'autonomy:pattern:learned',

  // Approval events
  APPROVAL_REQUESTED: 'autonomy:approval:requested',
  APPROVAL_GRANTED: 'autonomy:approval:granted',
  APPROVAL_DENIED: 'autonomy:approval:denied',
  APPROVAL_TIMEOUT: 'autonomy:approval:timeout',
  APPROVAL_ALTERNATIVE_SELECTED: 'autonomy:approval:alternative:selected',

  // Variable events
  VARIABLE_SET: 'autonomy:variable:set',
  VARIABLE_UPDATED: 'autonomy:variable:updated',
  VARIABLE_EXPIRED: 'autonomy:variable:expired',

  // Webhook events
  WEBHOOK_SENT: 'autonomy:webhook:sent',
  WEBHOOK_FAILED: 'autonomy:webhook:failed',
} as const;

export type AutonomyEventType = typeof AUTONOMY_EVENTS[keyof typeof AUTONOMY_EVENTS];

// ============================================================================
// Error Codes
// ============================================================================

export const AUTONOMY_ERROR_CODES = {
  // General errors
  UNKNOWN_ERROR: 'AUTONOMY_UNKNOWN_ERROR',
  INITIALIZATION_FAILED: 'AUTONOMY_INIT_FAILED',
  CONFIGURATION_INVALID: 'AUTONOMY_CONFIG_INVALID',
  NOT_INITIALIZED: 'AUTONOMY_NOT_INITIALIZED',

  // Goal errors
  GOAL_NOT_FOUND: 'AUTONOMY_GOAL_NOT_FOUND',
  GOAL_INVALID: 'AUTONOMY_GOAL_INVALID',
  GOAL_ALREADY_EXISTS: 'AUTONOMY_GOAL_ALREADY_EXISTS',

  // Plan errors
  PLAN_NOT_FOUND: 'AUTONOMY_PLAN_NOT_FOUND',
  PLAN_INVALID: 'AUTONOMY_PLAN_INVALID',
  PLAN_CREATION_FAILED: 'AUTONOMY_PLAN_CREATION_FAILED',
  PLAN_VALIDATION_FAILED: 'AUTONOMY_PLAN_VALIDATION_FAILED',

  // Step errors
  STEP_NOT_FOUND: 'AUTONOMY_STEP_NOT_FOUND',
  STEP_EXECUTION_FAILED: 'AUTONOMY_STEP_EXECUTION_FAILED',
  STEP_TIMEOUT: 'AUTONOMY_STEP_TIMEOUT',
  STEP_DEPENDENCY_FAILED: 'AUTONOMY_STEP_DEPENDENCY_FAILED',

  // Execution errors
  EXECUTION_NOT_FOUND: 'AUTONOMY_EXECUTION_NOT_FOUND',
  EXECUTION_TIMEOUT: 'AUTONOMY_EXECUTION_TIMEOUT',
  EXECUTION_MAX_ITERATIONS: 'AUTONOMY_EXECUTION_MAX_ITERATIONS',
  EXECUTION_CANCELLED: 'AUTONOMY_EXECUTION_CANCELLED',
  EXECUTION_ALREADY_RUNNING: 'AUTONOMY_EXECUTION_ALREADY_RUNNING',

  // Chain errors
  CHAIN_NOT_FOUND: 'AUTONOMY_CHAIN_NOT_FOUND',
  CHAIN_INVALID: 'AUTONOMY_CHAIN_INVALID',
  CHAIN_STEP_INVALID: 'AUTONOMY_CHAIN_STEP_INVALID',
  CHAIN_VARIABLE_NOT_FOUND: 'AUTONOMY_CHAIN_VARIABLE_NOT_FOUND',

  // Correction errors
  CORRECTION_FAILED: 'AUTONOMY_CORRECTION_FAILED',
  NO_CORRECTION_STRATEGY: 'AUTONOMY_NO_CORRECTION_STRATEGY',
  MAX_RETRIES_EXCEEDED: 'AUTONOMY_MAX_RETRIES_EXCEEDED',

  // Approval errors
  APPROVAL_REQUIRED: 'AUTONOMY_APPROVAL_REQUIRED',
  APPROVAL_DENIED: 'AUTONOMY_APPROVAL_DENIED',
  APPROVAL_TIMEOUT: 'AUTONOMY_APPROVAL_TIMEOUT',

  // Store errors
  STORE_ERROR: 'AUTONOMY_STORE_ERROR',
  CHECKPOINT_NOT_FOUND: 'AUTONOMY_CHECKPOINT_NOT_FOUND',
  CHECKPOINT_SAVE_FAILED: 'AUTONOMY_CHECKPOINT_SAVE_FAILED',

  // Tool errors
  TOOL_NOT_FOUND: 'AUTONOMY_TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED: 'AUTONOMY_TOOL_EXECUTION_FAILED',
} as const;

export type AutonomyErrorCode = typeof AUTONOMY_ERROR_CODES[keyof typeof AUTONOMY_ERROR_CODES];

// ============================================================================
// Default Values
// ============================================================================

export const AUTONOMY_DEFAULTS = {
  // Execution defaults
  MAX_ITERATIONS: 50,
  MAX_STEPS_PER_PLAN: 20,
  STEP_TIMEOUT_MS: 60000,
  EXECUTION_TIMEOUT_MS: 3600000,
  DEFAULT_CONCURRENCY: 3,

  // Correction defaults
  MAX_RETRIES_PER_STEP: 3,
  BASE_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 30000,
  BACKOFF_MULTIPLIER: 2,

  // Approval defaults
  APPROVAL_TIMEOUT_MS: 300000,
  MAX_ALTERNATIVES: 3,

  // Chaining defaults
  MAX_CHAIN_STEPS: 20,
  VARIABLE_EXPIRATION_MS: 0,

  // Long-running defaults
  CHECKPOINT_INTERVAL_MS: 300000,
  MAX_CONCURRENT_BACKGROUND: 10,

  // Store defaults
  EXECUTION_RETENTION_DAYS: 30,
  PLAN_RETENTION_DAYS: 30,
} as const;

// ============================================================================
// Strategy Definitions
// ============================================================================

/**
 * Failure categories type (needed for proper typing)
 */
type FailureCategoryType =
  | 'validation_error'
  | 'permission_denied'
  | 'resource_not_found'
  | 'timeout'
  | 'rate_limit'
  | 'network_error'
  | 'tool_error'
  | 'unknown';

/**
 * Correction strategy info type
 */
interface CorrectionStrategyInfo {
  name: string;
  description: string;
  applicableCategories: FailureCategoryType[];
}

/**
 * Correction strategies with descriptions
 */
export const CORRECTION_STRATEGIES: Record<string, CorrectionStrategyInfo> = {
  retry_with_backoff: {
    name: 'Retry with Backoff',
    description: 'Retry the same operation with exponential backoff delay',
    applicableCategories: ['timeout', 'rate_limit', 'network_error'],
  },
  parameter_variation: {
    name: 'Parameter Variation',
    description: 'Retry with modified parameters based on error feedback',
    applicableCategories: ['validation_error', 'tool_error'],
  },
  alternative_tool: {
    name: 'Alternative Tool',
    description: 'Try an alternative tool that can achieve the same result',
    applicableCategories: ['tool_error', 'permission_denied', 'resource_not_found'],
  },
  decompose_step: {
    name: 'Decompose Step',
    description: 'Break the step into smaller, more manageable sub-steps',
    applicableCategories: ['timeout', 'tool_error', 'unknown'],
  },
  skip_step: {
    name: 'Skip Step',
    description: 'Skip this step and continue with the next one',
    applicableCategories: ['resource_not_found', 'permission_denied'],
  },
  abort_execution: {
    name: 'Abort Execution',
    description: 'Stop the execution and report failure',
    applicableCategories: ['unknown'],
  },
};

// ============================================================================
// Sensitivity Keywords
// ============================================================================

/**
 * Keywords that indicate sensitive operations
 */
export const SENSITIVITY_KEYWORDS = {
  data_modification: [
    'delete', 'remove', 'drop', 'truncate', 'update', 'modify', 'edit',
    'write', 'create', 'insert', 'alter', 'replace', 'overwrite', 'clear',
  ],
  external_communication: [
    'send', 'email', 'sms', 'message', 'notify', 'post', 'publish', 'broadcast',
    'webhook', 'api', 'http', 'request', 'call', 'invoke',
  ],
  financial: [
    'payment', 'transfer', 'charge', 'refund', 'invoice', 'bill', 'price',
    'cost', 'fee', 'money', 'currency', 'crypto', 'trade', 'buy', 'sell',
  ],
  credential_access: [
    'password', 'token', 'key', 'secret', 'credential', 'auth', 'login',
    'session', 'oauth', 'api_key', 'private', 'certificate',
  ],
  irreversible_action: [
    'permanent', 'irreversible', 'destroy', 'purge', 'wipe', 'format',
    'reset', 'factory', 'unrecoverable', 'final',
  ],
  system_change: [
    'config', 'setting', 'permission', 'role', 'user', 'admin', 'install',
    'uninstall', 'upgrade', 'downgrade', 'restart', 'shutdown',
  ],
  data_export: [
    'export', 'download', 'backup', 'dump', 'extract', 'sync', 'copy',
    'migrate', 'transfer', 'share',
  ],
} as const;

// ============================================================================
// Error Class
// ============================================================================

/**
 * Autonomy module error
 */
export class AutonomyError extends Error {
  constructor(
    public readonly code: AutonomyErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AutonomyError';
  }

  /**
   * Create from error code
   */
  static fromCode(code: AutonomyErrorCode, details?: Record<string, unknown>): AutonomyError {
    const messages: Record<AutonomyErrorCode, string> = {
      [AUTONOMY_ERROR_CODES.UNKNOWN_ERROR]: 'An unknown error occurred',
      [AUTONOMY_ERROR_CODES.INITIALIZATION_FAILED]: 'Failed to initialize autonomy module',
      [AUTONOMY_ERROR_CODES.CONFIGURATION_INVALID]: 'Invalid configuration provided',
      [AUTONOMY_ERROR_CODES.NOT_INITIALIZED]: 'Autonomy module not initialized',
      [AUTONOMY_ERROR_CODES.GOAL_NOT_FOUND]: 'Goal not found',
      [AUTONOMY_ERROR_CODES.GOAL_INVALID]: 'Invalid goal provided',
      [AUTONOMY_ERROR_CODES.GOAL_ALREADY_EXISTS]: 'Goal already exists',
      [AUTONOMY_ERROR_CODES.PLAN_NOT_FOUND]: 'Plan not found',
      [AUTONOMY_ERROR_CODES.PLAN_INVALID]: 'Invalid plan provided',
      [AUTONOMY_ERROR_CODES.PLAN_CREATION_FAILED]: 'Failed to create plan',
      [AUTONOMY_ERROR_CODES.PLAN_VALIDATION_FAILED]: 'Plan validation failed',
      [AUTONOMY_ERROR_CODES.STEP_NOT_FOUND]: 'Step not found',
      [AUTONOMY_ERROR_CODES.STEP_EXECUTION_FAILED]: 'Step execution failed',
      [AUTONOMY_ERROR_CODES.STEP_TIMEOUT]: 'Step timed out',
      [AUTONOMY_ERROR_CODES.STEP_DEPENDENCY_FAILED]: 'Step dependency failed',
      [AUTONOMY_ERROR_CODES.EXECUTION_NOT_FOUND]: 'Execution not found',
      [AUTONOMY_ERROR_CODES.EXECUTION_TIMEOUT]: 'Execution timed out',
      [AUTONOMY_ERROR_CODES.EXECUTION_MAX_ITERATIONS]: 'Maximum iterations exceeded',
      [AUTONOMY_ERROR_CODES.EXECUTION_CANCELLED]: 'Execution was cancelled',
      [AUTONOMY_ERROR_CODES.EXECUTION_ALREADY_RUNNING]: 'Execution is already running',
      [AUTONOMY_ERROR_CODES.CHAIN_NOT_FOUND]: 'Chain not found',
      [AUTONOMY_ERROR_CODES.CHAIN_INVALID]: 'Invalid chain provided',
      [AUTONOMY_ERROR_CODES.CHAIN_STEP_INVALID]: 'Invalid chain step',
      [AUTONOMY_ERROR_CODES.CHAIN_VARIABLE_NOT_FOUND]: 'Chain variable not found',
      [AUTONOMY_ERROR_CODES.CORRECTION_FAILED]: 'Correction strategy failed',
      [AUTONOMY_ERROR_CODES.NO_CORRECTION_STRATEGY]: 'No correction strategy available',
      [AUTONOMY_ERROR_CODES.MAX_RETRIES_EXCEEDED]: 'Maximum retries exceeded',
      [AUTONOMY_ERROR_CODES.APPROVAL_REQUIRED]: 'Approval required',
      [AUTONOMY_ERROR_CODES.APPROVAL_DENIED]: 'Approval denied',
      [AUTONOMY_ERROR_CODES.APPROVAL_TIMEOUT]: 'Approval timeout',
      [AUTONOMY_ERROR_CODES.STORE_ERROR]: 'Store operation failed',
      [AUTONOMY_ERROR_CODES.CHECKPOINT_NOT_FOUND]: 'Checkpoint not found',
      [AUTONOMY_ERROR_CODES.CHECKPOINT_SAVE_FAILED]: 'Failed to save checkpoint',
      [AUTONOMY_ERROR_CODES.TOOL_NOT_FOUND]: 'Tool not found',
      [AUTONOMY_ERROR_CODES.TOOL_EXECUTION_FAILED]: 'Tool execution failed',
    };
    return new AutonomyError(code, messages[code], details);
  }

  /**
   * Convert to plain object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Check if error is an AutonomyError
 */
export function isAutonomyError(error: unknown): error is AutonomyError {
  return error instanceof AutonomyError;
}
