/**
 * Developer Tools Module Types
 *
 * Core type definitions for agent spawning, GitHub PR management,
 * deployments, bug detection, test-fix loops, and issue creation.
 */

// =============================================================================
// Agent Jobs
// =============================================================================

export type AgentJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type AgentType = 'claude-code' | 'codex' | 'custom';

export interface AgentJob {
  id: string;
  userId: string;
  agentType: AgentType;
  prompt: string;
  status: AgentJobStatus;
  progress: number;           // 0-100
  progressMessage?: string;
  result?: AgentJobResult;
  error?: string;
  workingDirectory?: string;
  timeout?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface AgentJobResult {
  success: boolean;
  output: string;
  filesChanged?: string[];
  tokensUsed?: number;
  exitCode?: number;
}

export interface AgentProgressEvent {
  jobId: string;
  progress: number;
  message: string;
  timestamp: number;
}

export interface AgentSpawnRequest {
  userId: string;
  agentType: AgentType;
  prompt: string;
  workingDirectory?: string;
  timeout?: number;
  env?: Record<string, string>;
}

// =============================================================================
// GitHub / PR Management
// =============================================================================

export type PRAction = 'review' | 'approve' | 'request-changes' | 'merge' | 'comment' | 'close';
export type PRStatus = 'open' | 'closed' | 'merged' | 'draft';
export type ChecksStatus = 'pending' | 'passing' | 'failing' | 'unknown';

export interface PullRequest {
  id: string;
  number: number;
  repository: string;
  owner: string;
  title: string;
  description: string;
  author: string;
  status: PRStatus;
  headBranch: string;
  baseBranch: string;
  headSha: string;
  isDraft: boolean;
  reviewers: string[];
  labels: string[];
  checksStatus: ChecksStatus;
  mergeable?: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: number;
  updatedAt: number;
}

export interface PRReviewRequest {
  prNumber: number;
  repository: string;
  owner: string;
  action: PRAction;
  comment?: string;
  reviewBody?: string;
  commitId?: string;
}

export interface PRReviewResult {
  success: boolean;
  action: PRAction;
  prNumber: number;
  message: string;
  url?: string;
  reviewId?: number;
  mergeCommitSha?: string;
}

export interface PRComment {
  id: number;
  body: string;
  author: string;
  path?: string;
  line?: number;
  side?: 'LEFT' | 'RIGHT';
  createdAt: number;
  updatedAt: number;
}

export interface PRFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  patch?: string;
  previousFilename?: string;
}

// =============================================================================
// Deployments
// =============================================================================

export type DeploymentStatus = 'pending' | 'in-progress' | 'succeeded' | 'failed' | 'rolled-back' | 'cancelled';
export type DeploymentEnvironment = 'development' | 'staging' | 'production';
export type PipelineProvider = 'github-actions' | 'vercel' | 'netlify' | 'custom-webhook';

export interface Deployment {
  id: string;
  userId: string;
  repository: string;
  branch: string;
  commit: string;
  environment: DeploymentEnvironment;
  status: DeploymentStatus;
  pipelineProvider: PipelineProvider;
  pipelineUrl?: string;
  deploymentUrl?: string;
  logs?: string;
  previousDeploymentId?: string;
  rollbackAvailable: boolean;
  approvedBy?: string;
  approvedAt?: number;
  triggeredAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface DeploymentTriggerRequest {
  userId: string;
  repository: string;
  branch: string;
  environment: DeploymentEnvironment;
  commit?: string;
  dryRun?: boolean;
}

export interface DeploymentTriggerResult {
  success: boolean;
  deployment?: Deployment;
  message: string;
  requiresApproval?: boolean;
}

export interface RollbackRequest {
  userId: string;
  deploymentId: string;
  targetDeploymentId?: string;
  reason: string;
}

export interface RollbackResult {
  success: boolean;
  deployment?: Deployment;
  message: string;
  requiresApproval?: boolean;
}

// =============================================================================
// Bug Detection
// =============================================================================

export type BugSeverity = 'critical' | 'high' | 'medium' | 'low';
export type BugSource = 'logs' | 'errors' | 'metrics' | 'manual';
export type BugStatus = 'detected' | 'investigating' | 'fixing' | 'fixed' | 'wont-fix' | 'false-positive';

export interface DetectedBug {
  id: string;
  userId: string;
  source: BugSource;
  severity: BugSeverity;
  status: BugStatus;
  title: string;
  description: string;
  stackTrace?: string;
  affectedFiles?: string[];
  suggestedFix?: string;
  autoFixAttempted: boolean;
  autoFixResult?: AutoFixResult;
  relatedIssueId?: string;
  relatedPRNumber?: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface AutoFixResult {
  attempted: boolean;
  success: boolean;
  patchApplied?: string;
  filesModified?: string[];
  testsPass?: boolean;
  error?: string;
  agentJobId?: string;
}

export interface BugDetectionConfig {
  enabled: boolean;
  sources: BugSource[];
  severityThreshold: BugSeverity;
  autoFixEnabled: boolean;
  autoFixRequiresApproval: boolean;
  patterns?: BugPattern[];
}

export interface BugPattern {
  id: string;
  name: string;
  pattern: string;
  severity: BugSeverity;
  source: BugSource;
  enabled: boolean;
}

export interface BugDetectionResult {
  bugs: DetectedBug[];
  scannedSources: BugSource[];
  scanDuration: number;
  timestamp: number;
}

// =============================================================================
// Test-Fix Loop
// =============================================================================

export type TestResult = 'pass' | 'fail' | 'error' | 'skip';
export type TestFixStatus = 'running' | 'succeeded' | 'failed' | 'max-iterations' | 'cancelled';

export interface TestFixSession {
  id: string;
  userId: string;
  testCommand: string;
  maxIterations: number;
  currentIteration: number;
  status: TestFixStatus;
  testResults: TestRunResult[];
  fixesApplied: AppliedFix[];
  workingDirectory?: string;
  createdAt: number;
  completedAt?: number;
}

export interface TestRunResult {
  iteration: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  total: number;
  failures: TestFailure[];
  duration: number;
  output?: string;
  timestamp: number;
}

export interface TestFailure {
  testName: string;
  testFile: string;
  errorMessage: string;
  stackTrace?: string;
  expected?: string;
  actual?: string;
  line?: number;
}

export interface AppliedFix {
  iteration: number;
  targetFile: string;
  description: string;
  patch: string;
  fixedTests: string[];
  agentJobId?: string;
  timestamp: number;
}

export interface TestFixRequest {
  userId: string;
  testCommand: string;
  maxIterations?: number;
  workingDirectory?: string;
  timeout?: number;
}

export interface TestFixResult {
  session: TestFixSession;
  success: boolean;
  message: string;
  totalFixesApplied: number;
  finalTestResult?: TestRunResult;
}

// =============================================================================
// Issue Creation
// =============================================================================

export interface GitHubIssue {
  id: string;
  number?: number;
  repository: string;
  owner: string;
  title: string;
  body: string;
  labels: string[];
  assignees: string[];
  milestone?: string;
  state?: 'open' | 'closed';
  url?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface IssueFromConversation {
  conversationId: string;
  userId: string;
  relevantMessages: ConversationMessage[];
  extractedContext: ExtractedIssueContext;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface ExtractedIssueContext {
  problem: string;
  stepsToReproduce?: string[];
  expectedBehavior?: string;
  actualBehavior?: string;
  codeReferences?: CodeReference[];
  errorMessages?: string[];
  environment?: Record<string, string>;
}

export interface CodeReference {
  file: string;
  startLine: number;
  endLine: number;
  snippet: string;
  language?: string;
}

export interface IssueCreateRequest {
  userId: string;
  repository: string;
  owner: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  conversationId?: string;
  extractFromConversation?: boolean;
}

export interface IssueCreateResult {
  success: boolean;
  issue?: GitHubIssue;
  message: string;
  url?: string;
}

// =============================================================================
// Approval Workflow
// =============================================================================

export type ApprovalAction = 'merge' | 'deploy' | 'rollback' | 'auto-fix';

export interface ApprovalRequest {
  id: string;
  userId: string;
  action: ApprovalAction;
  description: string;
  details: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  timeout: number;
  requestedAt: number;
  respondedAt?: number;
  respondedBy?: string;
}

export interface ApprovalResponse {
  approved: boolean;
  userId?: string;
  reason?: string;
  timestamp: number;
}

// =============================================================================
// Event Types
// =============================================================================

export type DevToolsEventType =
  // Agent events
  | 'devtools.agent.started'
  | 'devtools.agent.progress'
  | 'devtools.agent.completed'
  | 'devtools.agent.failed'
  | 'devtools.agent.cancelled'
  // PR events
  | 'devtools.pr.reviewed'
  | 'devtools.pr.approved'
  | 'devtools.pr.changes-requested'
  | 'devtools.pr.merged'
  | 'devtools.pr.commented'
  | 'devtools.pr.closed'
  // Deployment events
  | 'devtools.deployment.triggered'
  | 'devtools.deployment.started'
  | 'devtools.deployment.succeeded'
  | 'devtools.deployment.failed'
  | 'devtools.deployment.approval-required'
  | 'devtools.rollback.initiated'
  | 'devtools.rollback.completed'
  | 'devtools.rollback.failed'
  // Bug detection events
  | 'devtools.bug.detected'
  | 'devtools.bug.auto-fix-started'
  | 'devtools.bug.auto-fix-succeeded'
  | 'devtools.bug.auto-fix-failed'
  // Test-fix loop events
  | 'devtools.test.run-started'
  | 'devtools.test.run-completed'
  | 'devtools.test.fix-applied'
  | 'devtools.test.loop-succeeded'
  | 'devtools.test.loop-failed'
  | 'devtools.test.loop-max-iterations'
  // Issue events
  | 'devtools.issue.created'
  | 'devtools.issue.updated';

export interface DevToolsEvent<T = unknown> {
  type: DevToolsEventType;
  userId: string;
  timestamp: number;
  data: T;
  correlationId?: string;
}

// =============================================================================
// Provider Types
// =============================================================================

export interface DevToolsProviderConfig {
  name: string;
  type: string;
  tokenEnvVar?: string;
  baseUrl?: string;
  timeout?: number;
  rateLimitPerHour?: number;
}

export interface DevToolsProviderResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}

// =============================================================================
// Store Types
// =============================================================================

export interface AgentJobQueryOptions {
  userId?: string;
  status?: AgentJobStatus[];
  agentType?: AgentType;
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'startedAt' | 'completedAt';
  orderDirection?: 'asc' | 'desc';
}

export interface DeploymentQueryOptions {
  userId?: string;
  repository?: string;
  environment?: DeploymentEnvironment;
  status?: DeploymentStatus[];
  limit?: number;
  offset?: number;
  orderBy?: 'triggeredAt' | 'completedAt';
  orderDirection?: 'asc' | 'desc';
}

export interface DetectedBugQueryOptions {
  userId?: string;
  source?: BugSource[];
  severity?: BugSeverity[];
  status?: BugStatus[];
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'severity';
  orderDirection?: 'asc' | 'desc';
}

export interface TestFixSessionQueryOptions {
  userId?: string;
  status?: TestFixStatus[];
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'completedAt';
  orderDirection?: 'asc' | 'desc';
}

export interface CreatedIssueQueryOptions {
  userId?: string;
  repository?: string;
  owner?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt';
  orderDirection?: 'asc' | 'desc';
}
