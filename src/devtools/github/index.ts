/**
 * PR Management Service
 *
 * Service for managing GitHub pull requests including review, approve, merge, and comment.
 */

import type {
  PullRequest,
  PRReviewRequest,
  PRReviewResult,
  PRComment,
  PRFile,
  PRAction,
  ApprovalRequest,
  ApprovalResponse,
} from '../types.js';
import type { GitHubConfig } from '../config.js';
import { GitHubProvider, createGitHubProvider } from '../providers/github.js';

// =============================================================================
// Types
// =============================================================================

export interface PRManagementServiceConfig extends GitHubConfig {
  approvalHandler?: ApprovalHandler;
}

export type ApprovalHandler = (request: ApprovalRequest) => Promise<ApprovalResponse>;

// =============================================================================
// PR Management Service
// =============================================================================

/**
 * Service for managing GitHub pull requests
 */
export class PRManagementService {
  private readonly github: GitHubProvider;
  private readonly config: PRManagementServiceConfig;
  private readonly approvalHandler?: ApprovalHandler;
  private initialized = false;

  constructor(config: PRManagementServiceConfig) {
    this.config = config;
    this.github = createGitHubProvider(config);
    this.approvalHandler = config.approvalHandler;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.github.initialize();
    this.initialized = true;
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get a pull request
   */
  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequest | null> {
    this.ensureInitialized();

    const result = await this.github.getPullRequest(owner, repo, prNumber);
    if (!result.success || !result.data) {
      return null;
    }

    return result.data;
  }

  /**
   * List pull requests
   */
  async listPullRequests(
    owner: string,
    repo: string,
    options?: { state?: 'open' | 'closed' | 'all'; head?: string; base?: string; limit?: number }
  ): Promise<PullRequest[]> {
    this.ensureInitialized();

    const result = await this.github.listPullRequests(owner, repo, options);
    return result.data ?? [];
  }

  /**
   * Get files changed in a PR
   */
  async getPRFiles(owner: string, repo: string, prNumber: number): Promise<PRFile[]> {
    this.ensureInitialized();

    const result = await this.github.getPRFiles(owner, repo, prNumber);
    return result.data ?? [];
  }

  /**
   * Perform a PR action (review, approve, merge, comment, close)
   */
  async performAction(request: PRReviewRequest): Promise<PRReviewResult> {
    this.ensureInitialized();

    switch (request.action) {
      case 'approve':
        return this.approvePR(request);
      case 'request-changes':
        return this.requestChangesPR(request);
      case 'review':
        return this.reviewPR(request);
      case 'merge':
        return this.mergePR(request);
      case 'comment':
        return this.commentPR(request);
      case 'close':
        return this.closePR(request);
      default:
        return {
          success: false,
          action: request.action,
          prNumber: request.prNumber,
          message: `Unknown action: ${request.action}`,
        };
    }
  }

  /**
   * Approve a pull request
   */
  async approvePR(request: PRReviewRequest): Promise<PRReviewResult> {
    this.ensureInitialized();

    const result = await this.github.createReview(
      request.owner,
      request.repository,
      request.prNumber,
      {
        event: 'APPROVE',
        body: request.reviewBody,
        commitId: request.commitId,
      }
    );

    return result.data ?? {
      success: false,
      action: 'approve',
      prNumber: request.prNumber,
      message: result.error ?? 'Failed to approve PR',
    };
  }

  /**
   * Request changes on a pull request
   */
  async requestChangesPR(request: PRReviewRequest): Promise<PRReviewResult> {
    this.ensureInitialized();

    if (!request.reviewBody) {
      return {
        success: false,
        action: 'request-changes',
        prNumber: request.prNumber,
        message: 'Review body is required when requesting changes',
      };
    }

    const result = await this.github.createReview(
      request.owner,
      request.repository,
      request.prNumber,
      {
        event: 'REQUEST_CHANGES',
        body: request.reviewBody,
        commitId: request.commitId,
      }
    );

    return result.data ?? {
      success: false,
      action: 'request-changes',
      prNumber: request.prNumber,
      message: result.error ?? 'Failed to request changes',
    };
  }

  /**
   * Create a review comment on a PR
   */
  async reviewPR(request: PRReviewRequest): Promise<PRReviewResult> {
    this.ensureInitialized();

    const result = await this.github.createReview(
      request.owner,
      request.repository,
      request.prNumber,
      {
        event: 'COMMENT',
        body: request.reviewBody,
        commitId: request.commitId,
      }
    );

    return result.data ?? {
      success: false,
      action: 'review',
      prNumber: request.prNumber,
      message: result.error ?? 'Failed to create review',
    };
  }

  /**
   * Merge a pull request
   */
  async mergePR(request: PRReviewRequest): Promise<PRReviewResult> {
    this.ensureInitialized();

    // Check if approval is required
    if (this.config.mergeRequiresApproval) {
      const approved = await this.requestApproval({
        id: `merge-${request.owner}-${request.repository}-${request.prNumber}`,
        userId: 'system',
        action: 'merge',
        description: `Merge PR #${request.prNumber} in ${request.owner}/${request.repository}`,
        details: {
          owner: request.owner,
          repository: request.repository,
          prNumber: request.prNumber,
        },
        status: 'pending',
        timeout: 300000, // 5 minutes
        requestedAt: Date.now(),
      });

      if (!approved.approved) {
        return {
          success: false,
          action: 'merge',
          prNumber: request.prNumber,
          message: approved.reason ?? 'Merge not approved',
        };
      }
    }

    const result = await this.github.mergePullRequest(
      request.owner,
      request.repository,
      request.prNumber,
      {
        mergeMethod: this.config.defaultMergeMethod,
      }
    );

    return result.data ?? {
      success: false,
      action: 'merge',
      prNumber: request.prNumber,
      message: result.error ?? 'Failed to merge PR',
    };
  }

  /**
   * Add a comment to a PR
   */
  async commentPR(request: PRReviewRequest): Promise<PRReviewResult> {
    this.ensureInitialized();

    if (!request.comment) {
      return {
        success: false,
        action: 'comment',
        prNumber: request.prNumber,
        message: 'Comment body is required',
      };
    }

    const result = await this.github.createPRComment(
      request.owner,
      request.repository,
      request.prNumber,
      request.comment
    );

    if (!result.success) {
      return {
        success: false,
        action: 'comment',
        prNumber: request.prNumber,
        message: result.error ?? 'Failed to add comment',
      };
    }

    return {
      success: true,
      action: 'comment',
      prNumber: request.prNumber,
      message: 'Comment added',
      url: `https://github.com/${request.owner}/${request.repository}/pull/${request.prNumber}`,
    };
  }

  /**
   * Close a pull request
   */
  async closePR(request: PRReviewRequest): Promise<PRReviewResult> {
    this.ensureInitialized();

    const result = await this.github.closePullRequest(
      request.owner,
      request.repository,
      request.prNumber
    );

    return result.data ?? {
      success: false,
      action: 'close',
      prNumber: request.prNumber,
      message: result.error ?? 'Failed to close PR',
    };
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus(): { remaining?: number; resetAt?: number } {
    return this.github.getRateLimitStatus();
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    await this.github.shutdown();
    this.initialized = false;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private async requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    if (!this.approvalHandler) {
      // No approval handler, auto-approve
      return {
        approved: true,
        timestamp: Date.now(),
      };
    }

    return this.approvalHandler(request);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('PRManagementService not initialized. Call initialize() first.');
    }
  }
}

/**
 * Create a PR management service
 */
export function createPRManagementService(config: PRManagementServiceConfig): PRManagementService {
  return new PRManagementService(config);
}
