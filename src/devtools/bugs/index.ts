/**
 * Bug Detection Service
 *
 * Service for detecting bugs from logs, errors, and metrics with auto-fix support.
 */

import type {
  DetectedBug,
  BugSeverity,
  BugSource,
  BugStatus,
  AutoFixResult,
  BugDetectionResult,
  DetectedBugQueryOptions,
  ApprovalRequest,
  ApprovalResponse,
  AgentSpawnRequest,
} from '../types.js';
import type { BugDetectionConfig, BugPatternConfig } from '../config.js';
import type { DetectedBugStore } from '../stores/issue-store.js';

// =============================================================================
// Types
// =============================================================================

export interface BugDetectionServiceConfig extends BugDetectionConfig {
  approvalHandler?: ApprovalHandler;
  agentSpawner?: AgentSpawner;
}

export type ApprovalHandler = (request: ApprovalRequest) => Promise<ApprovalResponse>;
export type AgentSpawner = (request: AgentSpawnRequest) => Promise<{ id: string; output?: string }>;

export interface LogEntry {
  timestamp: number;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  source?: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}

export interface ErrorEntry {
  name: string;
  message: string;
  stack?: string;
  timestamp: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Default Patterns
// =============================================================================

const DEFAULT_PATTERNS: BugPatternConfig[] = [
  {
    id: 'unhandled-rejection',
    name: 'Unhandled Promise Rejection',
    pattern: 'UnhandledPromiseRejection|unhandled promise rejection',
    severity: 'high',
    source: 'errors',
    enabled: true,
  },
  {
    id: 'uncaught-exception',
    name: 'Uncaught Exception',
    pattern: 'UncaughtException|uncaught exception',
    severity: 'critical',
    source: 'errors',
    enabled: true,
  },
  {
    id: 'type-error',
    name: 'Type Error',
    pattern: 'TypeError:',
    severity: 'high',
    source: 'errors',
    enabled: true,
  },
  {
    id: 'reference-error',
    name: 'Reference Error',
    pattern: 'ReferenceError:',
    severity: 'high',
    source: 'errors',
    enabled: true,
  },
  {
    id: 'null-pointer',
    name: 'Null Pointer',
    pattern: 'cannot read propert|null|undefined is not|cannot access',
    severity: 'high',
    source: 'errors',
    enabled: true,
  },
  {
    id: 'memory-leak',
    name: 'Memory Leak',
    pattern: 'memory leak|out of memory|heap out of memory',
    severity: 'critical',
    source: 'logs',
    enabled: true,
  },
  {
    id: 'timeout',
    name: 'Timeout Error',
    pattern: 'timeout|timed out|ETIMEDOUT',
    severity: 'medium',
    source: 'errors',
    enabled: true,
  },
  {
    id: 'connection-error',
    name: 'Connection Error',
    pattern: 'ECONNREFUSED|ECONNRESET|connection refused|connection reset',
    severity: 'medium',
    source: 'errors',
    enabled: true,
  },
];

// =============================================================================
// Bug Detection Service
// =============================================================================

/**
 * Service for detecting bugs and attempting auto-fixes
 */
export class BugDetectionService {
  private readonly store: DetectedBugStore;
  private readonly config: BugDetectionServiceConfig;
  private readonly patterns: BugPatternConfig[];
  private readonly approvalHandler?: ApprovalHandler;
  private readonly agentSpawner?: AgentSpawner;
  private initialized = false;

  constructor(store: DetectedBugStore, config?: Partial<BugDetectionServiceConfig>) {
    this.store = store;
    this.config = {
      enabled: config?.enabled ?? true,
      sources: config?.sources ?? ['errors', 'logs'],
      severityThreshold: config?.severityThreshold ?? 'medium',
      autoFixEnabled: config?.autoFixEnabled ?? false,
      autoFixRequiresApproval: config?.autoFixRequiresApproval ?? true,
      autoFixMaxAttempts: config?.autoFixMaxAttempts ?? 3,
      patterns: config?.patterns ?? [],
      logScanIntervalMs: config?.logScanIntervalMs ?? 60000,
      errorRetentionDays: config?.errorRetentionDays ?? 30,
      approvalHandler: config?.approvalHandler,
      agentSpawner: config?.agentSpawner,
    };
    this.patterns = [...DEFAULT_PATTERNS, ...this.config.patterns];
    this.approvalHandler = this.config.approvalHandler;
    this.agentSpawner = this.config.agentSpawner;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.store.initialize();
    this.initialized = true;
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Detect bugs from log entries
   */
  async detectFromLogs(userId: string, logs: LogEntry[]): Promise<BugDetectionResult> {
    this.ensureInitialized();

    if (!this.config.sources.includes('logs')) {
      return {
        bugs: [],
        scannedSources: [],
        scanDuration: 0,
        timestamp: Date.now(),
      };
    }

    const startTime = Date.now();
    const bugs: DetectedBug[] = [];

    for (const log of logs) {
      if (log.level !== 'error' && log.level !== 'warn') {
        continue;
      }

      const detected = await this.detectBug(userId, log.message, 'logs', log.stack);
      if (detected && this.meetsThreshold(detected.severity)) {
        bugs.push(detected);
      }
    }

    return {
      bugs,
      scannedSources: ['logs'],
      scanDuration: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  /**
   * Detect bugs from error entries
   */
  async detectFromErrors(userId: string, errors: ErrorEntry[]): Promise<BugDetectionResult> {
    this.ensureInitialized();

    if (!this.config.sources.includes('errors')) {
      return {
        bugs: [],
        scannedSources: [],
        scanDuration: 0,
        timestamp: Date.now(),
      };
    }

    const startTime = Date.now();
    const bugs: DetectedBug[] = [];

    for (const error of errors) {
      const message = `${error.name}: ${error.message}`;
      const detected = await this.detectBug(userId, message, 'errors', error.stack);
      if (detected && this.meetsThreshold(detected.severity)) {
        bugs.push(detected);
      }
    }

    return {
      bugs,
      scannedSources: ['errors'],
      scanDuration: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  /**
   * Manually report a bug
   */
  async reportBug(
    userId: string,
    title: string,
    description: string,
    options?: {
      severity?: BugSeverity;
      stackTrace?: string;
      affectedFiles?: string[];
      suggestedFix?: string;
    }
  ): Promise<DetectedBug> {
    this.ensureInitialized();

    const bug = await this.store.create({
      userId,
      source: 'manual',
      severity: options?.severity ?? 'medium',
      status: 'detected',
      title,
      description,
      stackTrace: options?.stackTrace,
      affectedFiles: options?.affectedFiles,
      suggestedFix: options?.suggestedFix,
      autoFixAttempted: false,
    });

    return bug;
  }

  /**
   * Get a bug by ID
   */
  async getBug(bugId: string): Promise<DetectedBug | null> {
    this.ensureInitialized();
    return this.store.get(bugId);
  }

  /**
   * List bugs
   */
  async listBugs(options?: DetectedBugQueryOptions): Promise<DetectedBug[]> {
    this.ensureInitialized();
    return this.store.list(options);
  }

  /**
   * List bugs for a user
   */
  async listUserBugs(userId: string, options?: DetectedBugQueryOptions): Promise<DetectedBug[]> {
    this.ensureInitialized();
    return this.store.listByUser(userId, options);
  }

  /**
   * Update bug status
   */
  async updateStatus(bugId: string, status: BugStatus): Promise<boolean> {
    this.ensureInitialized();
    return this.store.updateStatus(bugId, status);
  }

  /**
   * Attempt to auto-fix a bug
   */
  async attemptAutoFix(bugId: string): Promise<AutoFixResult> {
    this.ensureInitialized();

    if (!this.config.autoFixEnabled) {
      return {
        attempted: false,
        success: false,
        error: 'Auto-fix is disabled',
      };
    }

    if (!this.agentSpawner) {
      return {
        attempted: false,
        success: false,
        error: 'No agent spawner configured',
      };
    }

    const bug = await this.store.get(bugId);
    if (!bug) {
      return {
        attempted: false,
        success: false,
        error: 'Bug not found',
      };
    }

    // Check if approval is required
    if (this.config.autoFixRequiresApproval) {
      const approved = await this.requestApproval({
        id: `autofix-${bugId}-${Date.now()}`,
        userId: bug.userId,
        action: 'auto-fix',
        description: `Auto-fix bug: ${bug.title}`,
        details: {
          bugId,
          title: bug.title,
          description: bug.description,
          severity: bug.severity,
        },
        status: 'pending',
        timeout: 300000,
        requestedAt: Date.now(),
      });

      if (!approved.approved) {
        return {
          attempted: false,
          success: false,
          error: approved.reason ?? 'Auto-fix not approved',
        };
      }
    }

    // Update status to fixing
    await this.store.updateStatus(bugId, 'fixing');

    try {
      // Generate fix prompt
      const prompt = this.generateFixPrompt(bug);

      // Spawn agent to fix
      const agentResult = await this.agentSpawner({
        userId: bug.userId,
        agentType: 'claude-code',
        prompt,
      });

      const result: AutoFixResult = {
        attempted: true,
        success: true,
        patchApplied: agentResult.output,
        agentJobId: agentResult.id,
      };

      // Store result
      await this.store.setAutoFixResult(bugId, result);
      await this.store.updateStatus(bugId, 'fixed');

      return result;
    } catch (error) {
      const result: AutoFixResult = {
        attempted: true,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };

      await this.store.setAutoFixResult(bugId, result);
      await this.store.updateStatus(bugId, 'detected');

      return result;
    }
  }

  /**
   * Link a bug to a GitHub issue
   */
  async linkToIssue(bugId: string, issueId: string): Promise<boolean> {
    this.ensureInitialized();
    return this.store.linkToIssue(bugId, issueId);
  }

  /**
   * Link a bug to a PR
   */
  async linkToPR(bugId: string, prNumber: number): Promise<boolean> {
    this.ensureInitialized();
    return this.store.linkToPR(bugId, prNumber);
  }

  /**
   * Cleanup old bugs
   */
  async cleanup(): Promise<number> {
    this.ensureInitialized();
    const cutoff = Date.now() - (this.config.errorRetentionDays * 24 * 60 * 60 * 1000);
    return this.store.deleteOlderThan(cutoff);
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private async detectBug(
    userId: string,
    message: string,
    source: BugSource,
    stackTrace?: string
  ): Promise<DetectedBug | null> {
    // Find matching pattern
    for (const pattern of this.patterns) {
      if (!pattern.enabled || pattern.source !== source) {
        continue;
      }

      const regex = new RegExp(pattern.pattern, 'i');
      if (regex.test(message)) {
        // Create bug record
        const bug = await this.store.create({
          userId,
          source,
          severity: pattern.severity,
          status: 'detected',
          title: pattern.name,
          description: message,
          stackTrace,
          autoFixAttempted: false,
        });

        return bug;
      }
    }

    return null;
  }

  private meetsThreshold(severity: BugSeverity): boolean {
    const levels: BugSeverity[] = ['low', 'medium', 'high', 'critical'];
    const thresholdIndex = levels.indexOf(this.config.severityThreshold);
    const severityIndex = levels.indexOf(severity);
    return severityIndex >= thresholdIndex;
  }

  private generateFixPrompt(bug: DetectedBug): string {
    let prompt = `Fix the following bug:\n\nTitle: ${bug.title}\nDescription: ${bug.description}\n`;

    if (bug.stackTrace) {
      prompt += `\nStack Trace:\n${bug.stackTrace}\n`;
    }

    if (bug.affectedFiles && bug.affectedFiles.length > 0) {
      prompt += `\nAffected Files:\n${bug.affectedFiles.join('\n')}\n`;
    }

    if (bug.suggestedFix) {
      prompt += `\nSuggested Fix:\n${bug.suggestedFix}\n`;
    }

    prompt += '\nPlease analyze the issue and implement a fix.';

    return prompt;
  }

  private async requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    if (!this.approvalHandler) {
      return {
        approved: true,
        timestamp: Date.now(),
      };
    }

    return this.approvalHandler(request);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('BugDetectionService not initialized. Call initialize() first.');
    }
  }
}

/**
 * Create a bug detection service
 */
export function createBugDetectionService(
  store: DetectedBugStore,
  config?: Partial<BugDetectionServiceConfig>
): BugDetectionService {
  return new BugDetectionService(store, config);
}
