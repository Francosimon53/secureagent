/**
 * Pipeline Providers
 *
 * CI/CD pipeline providers for triggering deployments and monitoring status.
 */

import { BaseDevToolsProvider, DevToolsProviderError } from './base.js';
import type {
  DevToolsProviderConfig,
  DevToolsProviderResult,
  Deployment,
  DeploymentStatus,
  PipelineProvider,
} from '../types.js';
import type { DeploymentConfig } from '../config.js';

// =============================================================================
// Types
// =============================================================================

export interface PipelineProviderConfig extends DevToolsProviderConfig {
  provider: PipelineProvider;
  webhookUrl?: string;
  webhookSecret?: string;
  pollInterval: number;
}

export interface PipelineTriggerResult {
  triggered: boolean;
  deploymentId?: string;
  pipelineUrl?: string;
  message: string;
}

export interface PipelineStatusResult {
  status: DeploymentStatus;
  logs?: string;
  url?: string;
  startedAt?: number;
  completedAt?: number;
}

// =============================================================================
// Base Pipeline Provider
// =============================================================================

/**
 * Abstract base class for pipeline providers
 */
export abstract class BasePipelineProvider extends BaseDevToolsProvider<PipelineProviderConfig> {
  abstract triggerDeployment(
    repository: string,
    branch: string,
    environment: string,
    commit?: string
  ): Promise<DevToolsProviderResult<PipelineTriggerResult>>;

  abstract getDeploymentStatus(deploymentId: string): Promise<DevToolsProviderResult<PipelineStatusResult>>;

  abstract cancelDeployment(deploymentId: string): Promise<DevToolsProviderResult<{ cancelled: boolean }>>;
}

// =============================================================================
// GitHub Actions Provider
// =============================================================================

interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
}

interface GitHubWorkflowRunsResponse {
  total_count: number;
  workflow_runs: GitHubWorkflowRun[];
}

/**
 * GitHub Actions pipeline provider
 */
export class GitHubActionsProvider extends BasePipelineProvider {
  private workflowFile: string;
  private apiBaseUrl = 'https://api.github.com';

  constructor(config: PipelineProviderConfig, workflowFile = 'deploy.yml') {
    super(config);
    this.workflowFile = workflowFile;
  }

  get name(): string {
    return 'github-actions';
  }

  get type(): string {
    return 'pipeline';
  }

  async triggerDeployment(
    repository: string,
    branch: string,
    environment: string,
    commit?: string
  ): Promise<DevToolsProviderResult<PipelineTriggerResult>> {
    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
      return {
        success: false,
        error: 'Invalid repository format. Expected "owner/repo"',
      };
    }

    const url = `${this.apiBaseUrl}/repos/${owner}/${repo}/actions/workflows/${this.workflowFile}/dispatches`;

    const result = await this.fetch<void>(url, {
      method: 'POST',
      body: JSON.stringify({
        ref: branch,
        inputs: {
          environment,
          commit: commit ?? '',
        },
      }),
    });

    // GitHub returns 204 No Content on success
    if (!result.success && !result.error?.includes('204')) {
      return {
        success: false,
        error: result.error ?? 'Failed to trigger workflow',
      };
    }

    // Poll for the new workflow run
    await this.sleep(2000); // Wait for GitHub to create the run

    const runsResult = await this.getRecentWorkflowRuns(owner, repo, branch);
    const latestRun = runsResult.data?.[0];

    return {
      success: true,
      data: {
        triggered: true,
        deploymentId: latestRun?.id.toString(),
        pipelineUrl: latestRun?.html_url,
        message: 'Deployment triggered successfully',
      },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  async getDeploymentStatus(deploymentId: string): Promise<DevToolsProviderResult<PipelineStatusResult>> {
    // Extract owner/repo from deployment ID format: "owner/repo/run_id"
    const parts = deploymentId.split('/');
    if (parts.length < 3) {
      return {
        success: false,
        error: 'Invalid deployment ID format',
      };
    }

    const [owner, repo, runId] = parts;
    const url = `${this.apiBaseUrl}/repos/${owner}/${repo}/actions/runs/${runId}`;

    const result = await this.fetch<GitHubWorkflowRun>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to get deployment status',
        rateLimitRemaining: result.rateLimitRemaining,
        rateLimitReset: result.rateLimitReset,
      };
    }

    const run = result.data;
    let status: DeploymentStatus = 'pending';

    if (run.status === 'in_progress' || run.status === 'queued') {
      status = 'in-progress';
    } else if (run.status === 'completed') {
      if (run.conclusion === 'success') {
        status = 'succeeded';
      } else if (run.conclusion === 'cancelled') {
        status = 'cancelled';
      } else {
        status = 'failed';
      }
    }

    return {
      success: true,
      data: {
        status,
        url: run.html_url,
        startedAt: new Date(run.created_at).getTime(),
        completedAt: run.status === 'completed' ? new Date(run.updated_at).getTime() : undefined,
      },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  async cancelDeployment(deploymentId: string): Promise<DevToolsProviderResult<{ cancelled: boolean }>> {
    const parts = deploymentId.split('/');
    if (parts.length < 3) {
      return {
        success: false,
        error: 'Invalid deployment ID format',
      };
    }

    const [owner, repo, runId] = parts;
    const url = `${this.apiBaseUrl}/repos/${owner}/${repo}/actions/runs/${runId}/cancel`;

    const result = await this.fetch<void>(url, { method: 'POST' });

    return {
      success: true,
      data: { cancelled: result.success || result.error?.includes('202') === true },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  private async getRecentWorkflowRuns(
    owner: string,
    repo: string,
    branch: string
  ): Promise<DevToolsProviderResult<GitHubWorkflowRun[]>> {
    const url = `${this.apiBaseUrl}/repos/${owner}/${repo}/actions/runs?branch=${branch}&per_page=5`;
    const result = await this.fetch<GitHubWorkflowRunsResponse>(url);

    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: result.data.workflow_runs,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Vercel Provider
// =============================================================================

interface VercelDeploymentResponse {
  id: string;
  url: string;
  state: string;
  readyState: string;
  createdAt: number;
  buildingAt?: number;
  ready?: number;
}

interface VercelDeploymentsResponse {
  deployments: VercelDeploymentResponse[];
}

/**
 * Vercel deployment provider
 */
export class VercelProvider extends BasePipelineProvider {
  private projectId?: string;
  private teamId?: string;
  private apiBaseUrl = 'https://api.vercel.com';

  constructor(config: PipelineProviderConfig, projectId?: string, teamId?: string) {
    super(config);
    this.projectId = projectId;
    this.teamId = teamId;
  }

  get name(): string {
    return 'vercel';
  }

  get type(): string {
    return 'pipeline';
  }

  async triggerDeployment(
    repository: string,
    branch: string,
    environment: string,
    _commit?: string
  ): Promise<DevToolsProviderResult<PipelineTriggerResult>> {
    if (!this.projectId) {
      return {
        success: false,
        error: 'Vercel project ID not configured',
      };
    }

    // Vercel deployments are typically triggered via git push
    // For manual triggers, we use the deployments API
    let url = `${this.apiBaseUrl}/v13/deployments`;
    if (this.teamId) {
      url += `?teamId=${this.teamId}`;
    }

    const target = environment === 'production' ? 'production' : 'preview';

    const result = await this.fetch<VercelDeploymentResponse>(url, {
      method: 'POST',
      body: JSON.stringify({
        name: this.projectId,
        target,
        gitSource: {
          type: 'github',
          ref: branch,
          repoId: repository,
        },
      }),
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to trigger Vercel deployment',
      };
    }

    return {
      success: true,
      data: {
        triggered: true,
        deploymentId: result.data.id,
        pipelineUrl: `https://vercel.com/${this.teamId ?? 'dashboard'}/${this.projectId}/${result.data.id}`,
        message: 'Vercel deployment triggered',
      },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  async getDeploymentStatus(deploymentId: string): Promise<DevToolsProviderResult<PipelineStatusResult>> {
    let url = `${this.apiBaseUrl}/v13/deployments/${deploymentId}`;
    if (this.teamId) {
      url += `?teamId=${this.teamId}`;
    }

    const result = await this.fetch<VercelDeploymentResponse>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to get Vercel deployment status',
        rateLimitRemaining: result.rateLimitRemaining,
        rateLimitReset: result.rateLimitReset,
      };
    }

    const deployment = result.data;
    let status: DeploymentStatus = 'pending';

    switch (deployment.readyState) {
      case 'QUEUED':
      case 'INITIALIZING':
        status = 'pending';
        break;
      case 'BUILDING':
        status = 'in-progress';
        break;
      case 'READY':
        status = 'succeeded';
        break;
      case 'ERROR':
        status = 'failed';
        break;
      case 'CANCELED':
        status = 'cancelled';
        break;
    }

    return {
      success: true,
      data: {
        status,
        url: `https://${deployment.url}`,
        startedAt: deployment.buildingAt,
        completedAt: deployment.ready,
      },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  async cancelDeployment(deploymentId: string): Promise<DevToolsProviderResult<{ cancelled: boolean }>> {
    let url = `${this.apiBaseUrl}/v12/deployments/${deploymentId}/cancel`;
    if (this.teamId) {
      url += `?teamId=${this.teamId}`;
    }

    const result = await this.fetch<void>(url, { method: 'PATCH' });

    return {
      success: true,
      data: { cancelled: result.success },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }
}

// =============================================================================
// Netlify Provider
// =============================================================================

interface NetlifyDeployResponse {
  id: string;
  state: string;
  url: string;
  ssl_url: string;
  deploy_url: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
}

/**
 * Netlify deployment provider
 */
export class NetlifyProvider extends BasePipelineProvider {
  private siteId?: string;
  private apiBaseUrl = 'https://api.netlify.com/api/v1';

  constructor(config: PipelineProviderConfig, siteId?: string) {
    super(config);
    this.siteId = siteId;
  }

  get name(): string {
    return 'netlify';
  }

  get type(): string {
    return 'pipeline';
  }

  async triggerDeployment(
    _repository: string,
    _branch: string,
    _environment: string,
    _commit?: string
  ): Promise<DevToolsProviderResult<PipelineTriggerResult>> {
    if (!this.siteId) {
      return {
        success: false,
        error: 'Netlify site ID not configured',
      };
    }

    // Trigger a new deploy via build hook or API
    const url = `${this.apiBaseUrl}/sites/${this.siteId}/builds`;

    const result = await this.fetch<NetlifyDeployResponse>(url, {
      method: 'POST',
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to trigger Netlify deployment',
      };
    }

    return {
      success: true,
      data: {
        triggered: true,
        deploymentId: result.data.id,
        pipelineUrl: `https://app.netlify.com/sites/${this.siteId}/deploys/${result.data.id}`,
        message: 'Netlify deployment triggered',
      },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  async getDeploymentStatus(deploymentId: string): Promise<DevToolsProviderResult<PipelineStatusResult>> {
    const url = `${this.apiBaseUrl}/deploys/${deploymentId}`;

    const result = await this.fetch<NetlifyDeployResponse>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to get Netlify deployment status',
        rateLimitRemaining: result.rateLimitRemaining,
        rateLimitReset: result.rateLimitReset,
      };
    }

    const deploy = result.data;
    let status: DeploymentStatus = 'pending';

    switch (deploy.state) {
      case 'new':
      case 'pending_review':
      case 'enqueued':
        status = 'pending';
        break;
      case 'building':
      case 'uploading':
      case 'uploaded':
      case 'preparing':
      case 'prepared':
      case 'processing':
        status = 'in-progress';
        break;
      case 'ready':
        status = 'succeeded';
        break;
      case 'error':
        status = 'failed';
        break;
      case 'cancelled':
        status = 'cancelled';
        break;
    }

    return {
      success: true,
      data: {
        status,
        url: deploy.ssl_url || deploy.url,
        startedAt: new Date(deploy.created_at).getTime(),
        completedAt: deploy.published_at ? new Date(deploy.published_at).getTime() : undefined,
      },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  async cancelDeployment(deploymentId: string): Promise<DevToolsProviderResult<{ cancelled: boolean }>> {
    const url = `${this.apiBaseUrl}/deploys/${deploymentId}/cancel`;

    const result = await this.fetch<void>(url, { method: 'POST' });

    return {
      success: true,
      data: { cancelled: result.success },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }
}

// =============================================================================
// Custom Webhook Provider
// =============================================================================

/**
 * Custom webhook pipeline provider for generic CI/CD systems
 */
export class CustomWebhookProvider extends BasePipelineProvider {
  get name(): string {
    return 'custom-webhook';
  }

  get type(): string {
    return 'pipeline';
  }

  protected requiresToken(): boolean {
    return false;
  }

  async triggerDeployment(
    repository: string,
    branch: string,
    environment: string,
    commit?: string
  ): Promise<DevToolsProviderResult<PipelineTriggerResult>> {
    if (!this.config.webhookUrl) {
      return {
        success: false,
        error: 'Webhook URL not configured',
      };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.webhookSecret) {
      headers['X-Webhook-Secret'] = this.config.webhookSecret;
    }

    const result = await this.fetch<{ deploymentId?: string; message?: string }>(
      this.config.webhookUrl,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          repository,
          branch,
          environment,
          commit,
          timestamp: Date.now(),
        }),
      }
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? 'Webhook request failed',
      };
    }

    return {
      success: true,
      data: {
        triggered: true,
        deploymentId: result.data?.deploymentId,
        message: result.data?.message ?? 'Deployment triggered via webhook',
      },
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
    };
  }

  async getDeploymentStatus(_deploymentId: string): Promise<DevToolsProviderResult<PipelineStatusResult>> {
    // Custom webhooks don't have a standard way to check status
    return {
      success: false,
      error: 'Status checking not supported for custom webhook provider',
    };
  }

  async cancelDeployment(_deploymentId: string): Promise<DevToolsProviderResult<{ cancelled: boolean }>> {
    // Custom webhooks don't have a standard way to cancel
    return {
      success: false,
      error: 'Cancellation not supported for custom webhook provider',
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a pipeline provider from config
 */
export function createPipelineProvider(config: DeploymentConfig): BasePipelineProvider {
  const providerConfig: PipelineProviderConfig = {
    name: config.provider,
    type: 'pipeline',
    tokenEnvVar: config.provider === 'vercel' ? config.vercelTokenEnvVar :
                 config.provider === 'netlify' ? config.netlifyTokenEnvVar :
                 'GITHUB_TOKEN',
    provider: config.provider,
    webhookUrl: config.webhookUrl,
    webhookSecret: config.webhookSecret,
    pollInterval: config.pollInterval,
    timeout: config.timeout,
  };

  switch (config.provider) {
    case 'github-actions':
      return new GitHubActionsProvider(providerConfig, config.githubActionsWorkflow);
    case 'vercel':
      return new VercelProvider(providerConfig, config.vercelProjectId, config.vercelTeamId);
    case 'netlify':
      return new NetlifyProvider(providerConfig, config.netlifySiteId);
    case 'custom-webhook':
      return new CustomWebhookProvider(providerConfig);
    default:
      throw new DevToolsProviderError('pipeline', `Unknown provider: ${config.provider}`);
  }
}
