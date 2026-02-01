/**
 * Autonomy Module Types
 * Core type definitions for autonomous agent capabilities
 */

import type { ToolExecutionResult } from '../security/types.js';

// ============================================================================
// Goal & Planning Types
// ============================================================================

/**
 * Goal priority levels
 */
export type GoalPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Goal status
 */
export type GoalStatus = 'pending' | 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled';

/**
 * A goal to be achieved by the agent
 */
export interface Goal {
  /** Unique goal identifier */
  id: string;
  /** Human-readable description of what to achieve */
  description: string;
  /** Constraints or limitations on how to achieve the goal */
  constraints?: string[];
  /** Criteria that determine when the goal is successfully completed */
  successCriteria?: string[];
  /** Priority level */
  priority: GoalPriority;
  /** Optional deadline timestamp */
  deadline?: number;
  /** Parent goal ID if this is a sub-goal */
  parentGoalId?: string;
  /** Current status */
  status: GoalStatus;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Goal creation input
 */
export interface GoalInput {
  description: string;
  constraints?: string[];
  successCriteria?: string[];
  priority?: GoalPriority;
  deadline?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Plan status
 */
export type PlanStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'paused' | 'cancelled';

/**
 * A plan to achieve a goal
 */
export interface Plan {
  /** Unique plan identifier */
  id: string;
  /** Associated goal ID */
  goalId: string;
  /** Ordered list of steps to execute */
  steps: PlanStep[];
  /** Current status */
  status: PlanStatus;
  /** Estimated total duration in ms */
  estimatedDuration?: number;
  /** Complexity score (1-10) */
  complexity?: number;
  /** Current step index being executed */
  currentStepIndex: number;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Completion timestamp */
  completedAt?: number;
  /** Plan version (for optimistic locking) */
  version?: number;
  /** Total cost incurred */
  totalCost?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Step status
 */
export type StepStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'retrying' | 'skipped';

/**
 * A single step in a plan
 */
export interface PlanStep {
  /** Unique step identifier */
  id: string;
  /** Execution order (0-based) */
  order: number;
  /** Human-readable description */
  description: string;
  /** Tool to execute (if applicable) */
  toolName?: string;
  /** Arguments for the tool */
  toolArguments?: Record<string, unknown>;
  /** IDs of steps that must complete before this one */
  dependsOn?: string[];
  /** Current status */
  status: StepStatus;
  /** Number of retry attempts */
  retryCount: number;
  /** Maximum retry attempts allowed */
  maxRetries: number;
  /** Execution result */
  result?: StepResult;
  /** Start timestamp */
  startedAt?: number;
  /** Completion timestamp */
  completedAt?: number;
  /** Error message if failed */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of executing a step
 */
export interface StepResult {
  /** Whether the step succeeded */
  success: boolean;
  /** Output from the step */
  output?: unknown;
  /** Tool execution result if a tool was called */
  toolResult?: ToolExecutionResult;
  /** Duration in ms */
  durationMs: number;
  /** Any captured variables */
  capturedVariables?: Record<string, unknown>;
}

// ============================================================================
// Tool Chaining Types
// ============================================================================

/**
 * Chain execution mode
 */
export type ChainMode = 'explicit' | 'llm_decided';

/**
 * A chain of tools to execute in sequence
 */
export interface ToolChain {
  /** Unique chain identifier */
  id: string;
  /** Name for the chain */
  name?: string;
  /** Description of what the chain accomplishes */
  description?: string;
  /** Steps in the chain */
  steps: ChainStep[];
  /** Execution mode */
  mode: ChainMode;
  /** Creation timestamp */
  createdAt: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Argument mapping for chain steps
 */
export interface ArgumentMapping {
  /** Static values */
  static: Record<string, unknown>;
  /** Values from named variables */
  fromVariable: Record<string, string>;
  /** Values from previous step output */
  fromPrevious: Record<string, string>;
}

/**
 * A single step in a tool chain
 */
export interface ChainStep {
  /** Step identifier */
  id: string;
  /** Tool to execute */
  toolName: string;
  /** Argument mapping */
  argumentMapping: ArgumentMapping;
  /** Step to execute on success (step ID or 'next' or 'end') */
  onSuccess?: string;
  /** Step to execute on failure (step ID or 'abort' or 'skip') */
  onFailure?: string;
  /** Transform function for output (stored as string for serialization) */
  outputTransform?: string;
  /** Condition to check before executing (stored as string) */
  condition?: string;
}

/**
 * Chain execution state
 */
export interface ChainExecutionState {
  /** Chain ID */
  chainId: string;
  /** Current step index */
  currentStepIndex: number;
  /** Step results */
  stepResults: Map<string, StepResult>;
  /** Accumulated variables */
  variables: Record<string, unknown>;
  /** Previous step output */
  previousOutput?: unknown;
  /** Whether chain is complete */
  complete: boolean;
  /** Whether chain succeeded */
  success: boolean;
  /** Error if failed */
  error?: string;
}

// ============================================================================
// Variable Registry Types
// ============================================================================

/**
 * Variable scope
 */
export type VariableScope = 'step' | 'chain' | 'execution' | 'session';

/**
 * A stored variable
 */
export interface StoredVariable {
  /** Variable name */
  name: string;
  /** Variable value */
  value: unknown;
  /** Scope of the variable */
  scope: VariableScope;
  /** Source step or chain ID */
  sourceId: string;
  /** Creation timestamp */
  createdAt: number;
  /** Expiration timestamp */
  expiresAt?: number;
}

// ============================================================================
// Correction Types
// ============================================================================

/**
 * Correction strategy types
 */
export type CorrectionStrategy =
  | 'retry_with_backoff'
  | 'parameter_variation'
  | 'alternative_tool'
  | 'decompose_step'
  | 'skip_step'
  | 'abort_execution';

/**
 * A tracked failure
 */
export interface TrackedFailure {
  /** Unique failure ID */
  id: string;
  /** Associated step ID */
  stepId: string;
  /** Associated plan ID */
  planId?: string;
  /** Associated chain ID */
  chainId?: string;
  /** Tool that failed */
  toolName?: string;
  /** Error message */
  error: string;
  /** Error category */
  category: FailureCategory;
  /** Arguments that caused the failure */
  arguments?: Record<string, unknown>;
  /** Timestamp */
  timestamp: number;
  /** Correction strategy attempted */
  strategyAttempted?: CorrectionStrategy;
  /** Whether correction succeeded */
  correctionSucceeded?: boolean;
}

/**
 * Failure categories
 */
export type FailureCategory =
  | 'validation_error'
  | 'permission_denied'
  | 'resource_not_found'
  | 'timeout'
  | 'rate_limit'
  | 'network_error'
  | 'tool_error'
  | 'unknown';

/**
 * Learned pattern from session
 */
export interface LearnedPattern {
  /** Pattern identifier */
  id: string;
  /** Pattern type */
  type: 'failure_pattern' | 'success_pattern' | 'optimization';
  /** Tool or step this applies to */
  appliesTo: string;
  /** Pattern description */
  description: string;
  /** Recommended action */
  recommendation: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Number of times observed */
  occurrences: number;
  /** Last seen timestamp */
  lastSeen: number;
  /** Creation timestamp */
  createdAt: number;
}

// ============================================================================
// Approval Types
// ============================================================================

/**
 * Permission levels
 */
export type PermissionLevel = 'always_ask' | 'sensitive_only' | 'never_ask';

/**
 * Sensitivity categories
 */
export type SensitivityCategory =
  | 'data_modification'
  | 'external_communication'
  | 'financial'
  | 'credential_access'
  | 'irreversible_action'
  | 'system_change'
  | 'data_export';

/**
 * Action classification result
 */
export interface ActionClassification {
  /** Whether the action is sensitive */
  isSensitive: boolean;
  /** Categories that apply */
  categories: SensitivityCategory[];
  /** Risk level (1-10) */
  riskLevel: number;
  /** Explanation of classification */
  explanation: string;
}

/**
 * Approval request with rich context
 */
export interface EnrichedApprovalRequest {
  /** Unique request ID */
  id: string;
  /** Goal being pursued */
  goal: Goal;
  /** Current plan */
  plan: Plan;
  /** Step requiring approval */
  step: PlanStep;
  /** Action classification */
  classification: ActionClassification;
  /** Current progress (0-100) */
  progressPercent: number;
  /** Alternative actions available */
  alternatives?: AlternativeAction[];
  /** Time remaining before timeout */
  timeoutMs: number;
  /** Request timestamp */
  requestedAt: number;
}

/**
 * Alternative action suggestion
 */
export interface AlternativeAction {
  /** Description of the alternative */
  description: string;
  /** Tool and arguments for the alternative */
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  /** Risk level (1-10) */
  riskLevel: number;
  /** Whether this is the recommended alternative */
  recommended: boolean;
}

/**
 * Approval response
 */
export interface ApprovalDecision {
  /** Request ID */
  requestId: string;
  /** Whether approved */
  approved: boolean;
  /** Who approved/denied */
  decidedBy: string;
  /** Reason for decision */
  reason?: string;
  /** Selected alternative (if any) */
  selectedAlternative?: AlternativeAction;
  /** Decision timestamp */
  decidedAt: number;
}

/**
 * User permission settings
 */
export interface UserPermissions {
  /** User ID */
  userId: string;
  /** Default permission level */
  defaultLevel: PermissionLevel;
  /** Per-category overrides */
  categoryOverrides: Partial<Record<SensitivityCategory, PermissionLevel>>;
  /** Per-tool overrides */
  toolOverrides: Record<string, PermissionLevel>;
  /** Trusted tool patterns (glob patterns) */
  trustedPatterns: string[];
  /** Last updated timestamp */
  updatedAt: number;
}

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Execution status
 */
export type ExecutionStatus =
  | 'initializing'
  | 'planning'
  | 'executing'
  | 'waiting_approval'
  | 'correcting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

/**
 * An autonomous execution session
 */
export interface ExecutionSession {
  /** Session ID */
  id: string;
  /** Goal being executed */
  goal: Goal;
  /** Current plan */
  plan?: Plan;
  /** Current status */
  status: ExecutionStatus;
  /** Number of iterations completed */
  iterationCount: number;
  /** Maximum iterations allowed */
  maxIterations: number;
  /** Accumulated variables */
  variables: Record<string, unknown>;
  /** Tracked failures */
  failures: TrackedFailure[];
  /** Learned patterns */
  patterns: LearnedPattern[];
  /** Start timestamp */
  startedAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Completion timestamp */
  completedAt?: number;
  /** Final result */
  result?: ExecutionResult;
  /** User ID */
  userId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Execution result
 */
export interface ExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Output from execution */
  output?: unknown;
  /** Final status */
  status: ExecutionStatus;
  /** Error message if failed */
  error?: string;
  /** Summary of what was accomplished */
  summary: string;
  /** Steps completed */
  stepsCompleted: number;
  /** Total steps */
  totalSteps: number;
  /** Duration in ms */
  durationMs: number;
  /** Variables captured */
  variables: Record<string, unknown>;
}

/**
 * Execution options
 */
export interface ExecutionOptions {
  /** Maximum iterations */
  maxIterations?: number;
  /** Step timeout in ms */
  stepTimeout?: number;
  /** Total execution timeout in ms */
  executionTimeout?: number;
  /** Permission level override */
  permissionLevel?: PermissionLevel;
  /** Checkpoint interval in ms */
  checkpointInterval?: number;
  /** Enable session learning */
  enableLearning?: boolean;
  /** User ID for permissions */
  userId?: string;
  /** Webhook URLs for progress updates */
  webhooks?: WebhookConfig[];
  /** Additional context for LLM */
  additionalContext?: string;
  /** Whether to run in background */
  background?: boolean;
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  /** Webhook URL */
  url: string;
  /** Events to send */
  events: WebhookEvent[];
  /** Secret for signing */
  secret?: string;
  /** Headers to include */
  headers?: Record<string, string>;
}

/**
 * Webhook event types
 */
export type WebhookEvent =
  | 'started'
  | 'progress'
  | 'step_completed'
  | 'step_failed'
  | 'approval_required'
  | 'completed'
  | 'failed';

// ============================================================================
// Evaluation Types
// ============================================================================

/**
 * Step evaluation result
 */
export interface StepEvaluation {
  /** Whether the step succeeded */
  succeeded: boolean;
  /** Whether to continue execution */
  shouldContinue: boolean;
  /** Whether correction is needed */
  needsCorrection: boolean;
  /** Suggested correction strategy */
  correctionStrategy?: CorrectionStrategy;
  /** Evaluation notes */
  notes: string;
  /** Variables to capture */
  capturedVariables?: Record<string, unknown>;
}

/**
 * Plan evaluation result
 */
export interface PlanEvaluation {
  /** Whether the plan is complete */
  isComplete: boolean;
  /** Whether the goal is achieved */
  goalAchieved: boolean;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reasoning */
  reasoning: string;
  /** Suggested next steps if not complete */
  suggestedSteps?: PlanStep[];
}

// ============================================================================
// Store Types
// ============================================================================

/**
 * Execution checkpoint
 */
export interface ExecutionCheckpoint {
  /** Session ID */
  sessionId: string;
  /** Current step index */
  stepIndex: number;
  /** Total steps */
  totalSteps: number;
  /** Session state */
  state: ExecutionSession;
  /** Checkpoint timestamp */
  savedAt: number;
}

/**
 * Plan checkpoint
 */
export interface PlanCheckpoint {
  /** Plan ID */
  planId: string;
  /** Current step index */
  stepIndex: number;
  /** Step results so far */
  stepResults: Record<string, StepResult>;
  /** Variables accumulated */
  variables: Record<string, unknown>;
  /** Checkpoint timestamp */
  savedAt: number;
}
