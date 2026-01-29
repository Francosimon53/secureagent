/**
 * Deployment Service
 *
 * Service for managing deployments including triggering, monitoring, and rollback.
 */

import type {
  Deployment,
  DeploymentStatus,
  DeploymentEnvironment,
  DeploymentTriggerRequest,
  DeploymentTriggerResult,
  RollbackRequest,
  RollbackResult,
  DeploymentQueryOptions,
  ApprovalRequest,
  ApprovalResponse,
} from '../types.js';
import type { DeploymentConfig } from '../config.js';
import type { DeploymentStore } from '../stores/deployment-store.js';
import { BasePipelineProvider, createPipelineProvider } from '../providers/pipeline.js';

// =============================================================================
// Types
// =============================================================================

export interface DeploymentServiceConfig extends DeploymentConfig {
  approvalHandler?: ApprovalHandler;
}

export type ApprovalHandler = (request: ApprovalRequest) => Promise<ApprovalResponse>;

// =============================================================================
// Deployment Service
// =============================================================================

/**
 * Service for managing deployments
 */
export class DeploymentService {
  private readonly store: DeploymentStore;
  private readonly pipelineProvider: BasePipelineProvider;
  private readonly config: DeploymentServiceConfig;
  private readonly approvalHandler?: ApprovalHandler;
  private initialized = false;
  private pollingIntervals = new Map<string, NodeJS.Timeout>();

  constructor(store: DeploymentStore, config: DeploymentServiceConfig) {
    this.store = store;
    this.config = config;
    this.pipelineProvider = createPipelineProvider(config);
    this.approvalHandler = config.approvalHandler;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.store.initialize();
    await this.pipelineProvider.initialize();
    this.initialized = true;
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Trigger a deployment
   */
  async triggerDeployment(request: DeploymentTriggerRequest): Promise<DeploymentTriggerResult> {
    this.ensureInitialized();

    // Check if approval is required for this environment
    const requiresApproval = this.requiresApproval(request.environment);

    if (requiresApproval && !request.dryRun) {
      const approved = await this.requestApproval({
        id: `deploy-${request.repository}-${request.environment}-${Date.now()}`,
        userId: request.userId,
        action: 'deploy',
        description: `Deploy ${request.branch} to ${request.environment}`,
        details: {
          repository: request.repository,
          branch: request.branch,
          environment: request.environment,
          commit: request.commit,
        },
        status: 'pending',
        timeout: 300000, // 5 minutes
        requestedAt: Date.now(),
      });

      if (!approved.approved) {
        return {
          success: false,
          requiresApproval: true,
          message: approved.reason ?? 'Deployment not approved',
        };
      }
    }

    // Get previous deployment for rollback support
    const previousDeployment = await this.store.getLastSuccessful(
      request.repository,
      request.environment
    );

    // Trigger the pipeline
    const triggerResult = await this.pipelineProvider.triggerDeployment(
      request.repository,
      request.branch,
      request.environment,
      request.commit
    );

    if (!triggerResult.success || !triggerResult.data?.triggered) {
      return {
        success: false,
        message: triggerResult.error ?? 'Failed to trigger deployment',
      };
    }

    // Create deployment record
    const deployment = await this.store.create({
      userId: request.userId,
      repository: request.repository,
      branch: request.branch,
      commit: request.commit ?? 'HEAD',
      environment: request.environment,
      status: 'pending',
      pipelineProvider: this.config.provider,
      pipelineUrl: triggerResult.data.pipelineUrl,
      previousDeploymentId: previousDeployment?.id,
      rollbackAvailable: false,
      triggeredAt: Date.now(),
    });

    // Start polling for status
    this.startStatusPolling(deployment.id, triggerResult.data.deploymentId);

    return {
      success: true,
      deployment,
      message: 'Deployment triggered successfully',
    };
  }

  /**
   * Get a deployment
   */
  async getDeployment(deploymentId: string): Promise<Deployment | null> {
    this.ensureInitialized();
    return this.store.get(deploymentId);
  }

  /**
   * List deployments
   */
  async listDeployments(options?: DeploymentQueryOptions): Promise<Deployment[]> {
    this.ensureInitialized();
    return this.store.list(options);
  }

  /**
   * List deployments for a user
   */
  async listUserDeployments(userId: string, options?: DeploymentQueryOptions): Promise<Deployment[]> {
    this.ensureInitialized();
    return this.store.listByUser(userId, options);
  }

  /**
   * List deployments for a repository
   */
  async listRepositoryDeployments(repository: string, options?: DeploymentQueryOptions): Promise<Deployment[]> {
    this.ensureInitialized();
    return this.store.listByRepository(repository, options);
  }

  /**
   * Rollback a deployment
   */
  async rollback(request: RollbackRequest): Promise<RollbackResult> {
    this.ensureInitialized();

    const deployment = await this.store.get(request.deploymentId);
    if (!deployment) {
      return {
        success: false,
        message: 'Deployment not found',
      };
    }

    // Get target deployment (previous or specified)
    let targetDeployment: Deployment | null = null;
    if (request.targetDeploymentId) {
      targetDeployment = await this.store.get(request.targetDeploymentId);
    } else {
      targetDeployment = await this.store.getPreviousDeployment(request.deploymentId);
    }

    if (!targetDeployment) {
      return {
        success: false,
        message: 'No previous deployment available for rollback',
      };
    }

    if (!targetDeployment.rollbackAvailable) {
      return {
        success: false,
        message: 'Target deployment is not available for rollback',
      };
    }

    // Check if approval is required
    if (this.config.rollbackRequiresApproval) {
      const approved = await this.requestApproval({
        id: `rollback-${request.deploymentId}-${Date.now()}`,
        userId: request.userId,
        action: 'rollback',
        description: `Rollback ${deployment.repository} from ${deployment.commit} to ${targetDeployment.commit}`,
        details: {
          currentDeployment: deployment,
          targetDeployment,
          reason: request.reason,
        },
        status: 'pending',
        timeout: 300000,
        requestedAt: Date.now(),
      });

      if (!approved.approved) {
        return {
          success: false,
          requiresApproval: true,
          message: approved.reason ?? 'Rollback not approved',
        };
      }
    }

    // Trigger rollback deployment
    const triggerResult = await this.pipelineProvider.triggerDeployment(
      targetDeployment.repository,
      targetDeployment.branch,
      targetDeployment.environment,
      targetDeployment.commit
    );

    if (!triggerResult.success) {
      return {
        success: false,
        message: triggerResult.error ?? 'Failed to trigger rollback',
      };
    }

    // Create rollback deployment record
    const rollbackDeployment = await this.store.create({
      userId: request.userId,
      repository: targetDeployment.repository,
      branch: targetDeployment.branch,
      commit: targetDeployment.commit,
      environment: targetDeployment.environment,
      status: 'pending',
      pipelineProvider: this.config.provider,
      pipelineUrl: triggerResult.data?.pipelineUrl,
      previousDeploymentId: deployment.id,
      rollbackAvailable: false,
      triggeredAt: Date.now(),
    });

    // Update original deployment status
    await this.store.updateStatus(deployment.id, 'rolled-back', `Rolled back to ${targetDeployment.commit}`);

    // Start polling for rollback status
    if (triggerResult.data?.deploymentId) {
      this.startStatusPolling(rollbackDeployment.id, triggerResult.data.deploymentId);
    }

    return {
      success: true,
      deployment: rollbackDeployment,
      message: `Rollback initiated to ${targetDeployment.commit}`,
    };
  }

  /**
   * Cancel a deployment
   */
  async cancelDeployment(deploymentId: string, pipelineDeploymentId?: string): Promise<boolean> {
    this.ensureInitialized();

    // Stop polling
    this.stopStatusPolling(deploymentId);

    // Cancel in pipeline if ID provided
    if (pipelineDeploymentId) {
      await this.pipelineProvider.cancelDeployment(pipelineDeploymentId);
    }

    // Update status
    await this.store.updateStatus(deploymentId, 'cancelled');

    return true;
  }

  /**
   * Get last successful deployment for an environment
   */
  async getLastSuccessful(repository: string, environment: DeploymentEnvironment): Promise<Deployment | null> {
    this.ensureInitialized();
    return this.store.getLastSuccessful(repository, environment);
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    // Stop all polling
    for (const [deploymentId] of this.pollingIntervals) {
      this.stopStatusPolling(deploymentId);
    }

    await this.pipelineProvider.shutdown();
    this.initialized = false;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private requiresApproval(environment: DeploymentEnvironment): boolean {
    if (environment === 'production') {
      return this.config.productionRequiresApproval;
    }
    if (environment === 'staging') {
      return this.config.stagingRequiresApproval;
    }
    return false;
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

  private startStatusPolling(deploymentId: string, pipelineDeploymentId?: string): void {
    if (!pipelineDeploymentId) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const statusResult = await this.pipelineProvider.getDeploymentStatus(pipelineDeploymentId);

        if (statusResult.success && statusResult.data) {
          const { status, logs, url } = statusResult.data;

          // Update deployment status
          await this.store.updateStatus(deploymentId, status, logs);

          // Update deployment URL if available
          if (url) {
            await this.store.update(deploymentId, { deploymentUrl: url });
          }

          // Stop polling if terminal state
          if (['succeeded', 'failed', 'cancelled', 'rolled-back'].includes(status)) {
            this.stopStatusPolling(deploymentId);
          }
        }
      } catch (error) {
        console.error(`Error polling deployment status for ${deploymentId}:`, error);
      }
    }, this.config.pollInterval);

    this.pollingIntervals.set(deploymentId, interval);
  }

  private stopStatusPolling(deploymentId: string): void {
    const interval = this.pollingIntervals.get(deploymentId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(deploymentId);
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('DeploymentService not initialized. Call initialize() first.');
    }
  }
}

/**
 * Create a deployment service
 */
export function createDeploymentService(
  store: DeploymentStore,
  config: DeploymentServiceConfig
): DeploymentService {
  return new DeploymentService(store, config);
}
