/**
 * GitHub Provider
 *
 * GitHub REST API provider for PR management, issue creation, and repository operations.
 */

import { BaseDevToolsProvider, DevToolsProviderError } from './base.js';
import type {
  DevToolsProviderConfig,
  DevToolsProviderResult,
  PullRequest,
  PRReviewResult,
  PRComment,
  PRFile,
  PRStatus,
  ChecksStatus,
  GitHubIssue,
} from '../types.js';
import type { GitHubConfig } from '../config.js';

// =============================================================================
// Types
// =============================================================================

export interface GitHubProviderConfig extends DevToolsProviderConfig {
  apiBaseUrl: string;
  defaultOwner?: string;
  defaultRepository?: string;
  rateLimitPerHour: number;
  mergeRequiresApproval: boolean;
  deleteBranchAfterMerge: boolean;
  defaultMergeMethod: 'merge' | 'squash' | 'rebase';
  requirePassingChecks: boolean;
}

interface GitHubPRResponse {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  user: { login: string };
  head: { ref: string; sha: string };
  base: { ref: string };
  requested_reviewers: Array<{ login: string }>;
  labels: Array<{ name: string }>;
  mergeable: boolean | null;
  additions: number;
  deletions: number;
  changed_files: number;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
}

interface GitHubReviewResponse {
  id: number;
  state: string;
  body: string;
  user: { login: string };
  submitted_at: string;
}

interface GitHubIssueResponse {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
  milestone: { title: string } | null;
  html_url: string;
  created_at: string;
  updated_at: string;
}

interface GitHubCommentResponse {
  id: number;
  body: string;
  user: { login: string };
  path?: string;
  line?: number;
  side?: string;
  created_at: string;
  updated_at: string;
}

interface GitHubFileResponse {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
}

interface GitHubCheckRunsResponse {
  total_count: number;
  check_runs: Array<{
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
  }>;
}

interface GitHubMergeResponse {
  sha: string;
  merged: boolean;
  message: string;
}

interface GitHubWorkflowDispatchResponse {
  // Empty response on success (204 No Content)
}

// =============================================================================
// Provider Implementation
// =============================================================================

/**
 * GitHub REST API provider
 */
export class GitHubProvider extends BaseDevToolsProvider<GitHubProviderConfig> {
  get name(): string {
    return 'github';
  }

  get type(): string {
    return 'git';
  }

  /**
   * Get pull request details
   */
  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<DevToolsProviderResult<PullRequest>> {
    const url = `${this.config.apiBaseUrl}/repos/${owner}/${repo}/pulls/${prNumber}`;
    const result = await this.fetch<GitHubPRResponse>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to get pull request',
        rateLimitRemaining: result.rateLimitRemaining,
        rateLimitReset: result.rateLimitReset,
      };
    }

    const pr = this.transformPR(owner, repo, result.data);

    // Get checks status
    const checksResult = await this.getChecksStatus(owner, repo, pr.headSha);
    if (checksResult.success && checksResult.data) {
      pr.checksStatus = checksResult.data;
    }

    return {
      success: true,
      data: pr,
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  /**
   * List pull requests
   */
  async listPullRequests(
    owner: string,
    repo: string,
    options: { state?: 'open' | 'closed' | 'all'; head?: string; base?: string; limit?: number } = {}
  ): Promise<DevToolsProviderResult<PullRequest[]>> {
    const params = new URLSearchParams();
    if (options.state) params.append('state', options.state);
    if (options.head) params.append('head', options.head);
    if (options.base) params.append('base', options.base);
    if (options.limit) params.append('per_page', options.limit.toString());

    const url = `${this.config.apiBaseUrl}/repos/${owner}/${repo}/pulls?${params}`;
    const result = await this.fetch<GitHubPRResponse[]>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to list pull requests',
        rateLimitRemaining: result.rateLimitRemaining,
        rateLimitReset: result.rateLimitReset,
      };
    }

    const prs = result.data.map(pr => this.transformPR(owner, repo, pr));

    return {
      success: true,
      data: prs,
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  /**
   * Get PR files changed
   */
  async getPRFiles(owner: string, repo: string, prNumber: number): Promise<DevToolsProviderResult<PRFile[]>> {
    const url = `${this.config.apiBaseUrl}/repos/${owner}/${repo}/pulls/${prNumber}/files`;
    const result = await this.fetch<GitHubFileResponse[]>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to get PR files',
        rateLimitRemaining: result.rateLimitRemaining,
        rateLimitReset: result.rateLimitReset,
      };
    }

    const files: PRFile[] = result.data.map(f => ({
      filename: f.filename,
      status: f.status as PRFile['status'],
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
      previousFilename: f.previous_filename,
    }));

    return {
      success: true,
      data: files,
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  /**
   * Create a review on a PR
   */
  async createReview(
    owner: string,
    repo: string,
    prNumber: number,
    options: {
      event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
      body?: string;
      commitId?: string;
    }
  ): Promise<DevToolsProviderResult<PRReviewResult>> {
    const url = `${this.config.apiBaseUrl}/repos/${owner}/${repo}/pulls/${prNumber}/reviews`;

    const result = await this.fetch<GitHubReviewResponse>(url, {
      method: 'POST',
      body: JSON.stringify({
        event: options.event,
        body: options.body,
        commit_id: options.commitId,
      }),
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        data: {
          success: false,
          action: options.event === 'APPROVE' ? 'approve' : options.event === 'REQUEST_CHANGES' ? 'request-changes' : 'review',
          prNumber,
          message: result.error ?? 'Failed to create review',
        },
      };
    }

    return {
      success: true,
      data: {
        success: true,
        action: options.event === 'APPROVE' ? 'approve' : options.event === 'REQUEST_CHANGES' ? 'request-changes' : 'review',
        prNumber,
        message: `Review created: ${options.event}`,
        reviewId: result.data?.id,
        url: `https://github.com/${owner}/${repo}/pull/${prNumber}#pullrequestreview-${result.data?.id}`,
      },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  /**
   * Merge a pull request
   */
  async mergePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    options: {
      mergeMethod?: 'merge' | 'squash' | 'rebase';
      commitTitle?: string;
      commitMessage?: string;
    } = {}
  ): Promise<DevToolsProviderResult<PRReviewResult>> {
    // First check if checks are passing if required
    if (this.config.requirePassingChecks) {
      const pr = await this.getPullRequest(owner, repo, prNumber);
      if (pr.success && pr.data?.checksStatus === 'failing') {
        return {
          success: false,
          data: {
            success: false,
            action: 'merge',
            prNumber,
            message: 'Cannot merge: checks are failing',
          },
        };
      }
    }

    const url = `${this.config.apiBaseUrl}/repos/${owner}/${repo}/pulls/${prNumber}/merge`;
    const mergeMethod = options.mergeMethod ?? this.config.defaultMergeMethod;

    const result = await this.fetch<GitHubMergeResponse>(url, {
      method: 'PUT',
      body: JSON.stringify({
        merge_method: mergeMethod,
        commit_title: options.commitTitle,
        commit_message: options.commitMessage,
      }),
    });

    if (!result.success || !result.data?.merged) {
      return {
        success: false,
        data: {
          success: false,
          action: 'merge',
          prNumber,
          message: result.error ?? result.data?.message ?? 'Failed to merge PR',
        },
      };
    }

    // Delete branch if configured
    if (this.config.deleteBranchAfterMerge) {
      const prDetails = await this.getPullRequest(owner, repo, prNumber);
      if (prDetails.success && prDetails.data) {
        await this.deleteBranch(owner, repo, prDetails.data.headBranch);
      }
    }

    return {
      success: true,
      data: {
        success: true,
        action: 'merge',
        prNumber,
        message: 'PR merged successfully',
        mergeCommitSha: result.data.sha,
        url: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
      },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  /**
   * Create a comment on a PR
   */
  async createPRComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string
  ): Promise<DevToolsProviderResult<PRComment>> {
    const url = `${this.config.apiBaseUrl}/repos/${owner}/${repo}/issues/${prNumber}/comments`;

    const result = await this.fetch<GitHubCommentResponse>(url, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to create PR comment',
        rateLimitRemaining: result.rateLimitRemaining,
        rateLimitReset: result.rateLimitReset,
      };
    }

    return {
      success: true,
      data: {
        id: result.data.id,
        body: result.data.body,
        author: result.data.user.login,
        createdAt: new Date(result.data.created_at).getTime(),
        updatedAt: new Date(result.data.updated_at).getTime(),
      },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  /**
   * Close a pull request
   */
  async closePullRequest(owner: string, repo: string, prNumber: number): Promise<DevToolsProviderResult<PRReviewResult>> {
    const url = `${this.config.apiBaseUrl}/repos/${owner}/${repo}/pulls/${prNumber}`;

    const result = await this.fetch<GitHubPRResponse>(url, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });

    if (!result.success) {
      return {
        success: false,
        data: {
          success: false,
          action: 'close',
          prNumber,
          message: result.error ?? 'Failed to close PR',
        },
      };
    }

    return {
      success: true,
      data: {
        success: true,
        action: 'close',
        prNumber,
        message: 'PR closed',
        url: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
      },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  /**
   * Create a GitHub issue
   */
  async createIssue(
    owner: string,
    repo: string,
    options: {
      title: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
      milestone?: number;
    }
  ): Promise<DevToolsProviderResult<GitHubIssue>> {
    const url = `${this.config.apiBaseUrl}/repos/${owner}/${repo}/issues`;

    const result = await this.fetch<GitHubIssueResponse>(url, {
      method: 'POST',
      body: JSON.stringify({
        title: options.title,
        body: options.body,
        labels: options.labels,
        assignees: options.assignees,
        milestone: options.milestone,
      }),
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to create issue',
        rateLimitRemaining: result.rateLimitRemaining,
        rateLimitReset: result.rateLimitReset,
      };
    }

    return {
      success: true,
      data: this.transformIssue(owner, repo, result.data),
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  /**
   * Get issue details
   */
  async getIssue(owner: string, repo: string, issueNumber: number): Promise<DevToolsProviderResult<GitHubIssue>> {
    const url = `${this.config.apiBaseUrl}/repos/${owner}/${repo}/issues/${issueNumber}`;
    const result = await this.fetch<GitHubIssueResponse>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to get issue',
        rateLimitRemaining: result.rateLimitRemaining,
        rateLimitReset: result.rateLimitReset,
      };
    }

    return {
      success: true,
      data: this.transformIssue(owner, repo, result.data),
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  /**
   * Trigger a GitHub Actions workflow
   */
  async triggerWorkflow(
    owner: string,
    repo: string,
    workflowId: string,
    ref: string,
    inputs?: Record<string, string>
  ): Promise<DevToolsProviderResult<{ triggered: boolean }>> {
    const url = `${this.config.apiBaseUrl}/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

    const result = await this.fetch<GitHubWorkflowDispatchResponse>(url, {
      method: 'POST',
      body: JSON.stringify({
        ref,
        inputs,
      }),
    });

    // GitHub returns 204 No Content on success
    if (!result.success && !result.error?.includes('204')) {
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      data: { triggered: true },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  /**
   * Get checks status for a commit
   */
  async getChecksStatus(owner: string, repo: string, ref: string): Promise<DevToolsProviderResult<ChecksStatus>> {
    const url = `${this.config.apiBaseUrl}/repos/${owner}/${repo}/commits/${ref}/check-runs`;
    const result = await this.fetch<GitHubCheckRunsResponse>(url);

    if (!result.success || !result.data) {
      return { success: true, data: 'unknown' };
    }

    const checkRuns = result.data.check_runs;

    if (checkRuns.length === 0) {
      return { success: true, data: 'unknown' };
    }

    const hasPending = checkRuns.some(c => c.status !== 'completed');
    const hasFailing = checkRuns.some(c => c.conclusion === 'failure' || c.conclusion === 'cancelled');

    let status: ChecksStatus = 'passing';
    if (hasPending) {
      status = 'pending';
    } else if (hasFailing) {
      status = 'failing';
    }

    return {
      success: true,
      data: status,
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  /**
   * Delete a branch
   */
  async deleteBranch(owner: string, repo: string, branch: string): Promise<DevToolsProviderResult<{ deleted: boolean }>> {
    const url = `${this.config.apiBaseUrl}/repos/${owner}/${repo}/git/refs/heads/${branch}`;

    const result = await this.fetch<void>(url, {
      method: 'DELETE',
    });

    return {
      success: true,
      data: { deleted: result.success },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  private transformPR(owner: string, repo: string, data: GitHubPRResponse): PullRequest {
    let status: PRStatus = 'open';
    if (data.merged_at) {
      status = 'merged';
    } else if (data.state === 'closed') {
      status = 'closed';
    } else if (data.draft) {
      status = 'draft';
    }

    return {
      id: data.id.toString(),
      number: data.number,
      repository: repo,
      owner,
      title: data.title,
      description: data.body ?? '',
      author: data.user.login,
      status,
      headBranch: data.head.ref,
      baseBranch: data.base.ref,
      headSha: data.head.sha,
      isDraft: data.draft,
      reviewers: data.requested_reviewers.map(r => r.login),
      labels: data.labels.map(l => l.name),
      checksStatus: 'unknown',
      mergeable: data.mergeable ?? undefined,
      additions: data.additions,
      deletions: data.deletions,
      changedFiles: data.changed_files,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  }

  private transformIssue(owner: string, repo: string, data: GitHubIssueResponse): GitHubIssue {
    return {
      id: data.id.toString(),
      number: data.number,
      repository: repo,
      owner,
      title: data.title,
      body: data.body ?? '',
      labels: data.labels.map(l => l.name),
      assignees: data.assignees.map(a => a.login),
      milestone: data.milestone?.title,
      state: data.state as 'open' | 'closed',
      url: data.html_url,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  }
}

/**
 * Create a GitHub provider from config
 */
export function createGitHubProvider(config: GitHubConfig): GitHubProvider {
  return new GitHubProvider({
    name: 'github',
    type: 'git',
    tokenEnvVar: config.tokenEnvVar,
    apiBaseUrl: config.apiBaseUrl,
    defaultOwner: config.defaultOwner,
    defaultRepository: config.defaultRepository,
    rateLimitPerHour: config.rateLimitPerHour,
    mergeRequiresApproval: config.mergeRequiresApproval,
    deleteBranchAfterMerge: config.deleteBranchAfterMerge,
    defaultMergeMethod: config.defaultMergeMethod,
    requirePassingChecks: config.requirePassingChecks,
    timeout: config.timeout,
  });
}
