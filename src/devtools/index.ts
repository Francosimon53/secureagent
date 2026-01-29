/**
 * Developer Tools Module
 *
 * Comprehensive developer tools suite with agent spawning, GitHub PR management,
 * deployment pipelines, bug detection, test-fix loops, and issue creation.
 */

// =============================================================================
// Types
// =============================================================================

export * from './types.js';

// =============================================================================
// Configuration
// =============================================================================

export {
  // Schemas
  DevToolsConfigSchema,
  AgentConfigSchema,
  GitHubConfigSchema,
  DeploymentConfigSchema,
  BugDetectionConfigSchema,
  BugPatternSchema,
  TestFixLoopConfigSchema,
  IssueConfigSchema,
  ApprovalConfigSchema,

  // Types
  type DevToolsConfig,
  type AgentConfig,
  type GitHubConfig,
  type DeploymentConfig,
  type BugDetectionConfig,
  type BugPatternConfig,
  type TestFixLoopConfig,
  type IssueConfig,
  type ApprovalConfig,

  // Helpers
  parseDevToolsConfig,
  mergeWithDefaults,
  DEFAULT_DEVTOOLS_CONFIG,
} from './config.js';

// =============================================================================
// Providers
// =============================================================================

export {
  // Base
  BaseDevToolsProvider,
  DevToolsProviderRegistry,
  DevToolsProviderError,
  getDevToolsProviderRegistry,
  initDevToolsProviderRegistry,

  // GitHub
  GitHubProvider,
  createGitHubProvider,
  type GitHubProviderConfig,

  // Pipeline
  BasePipelineProvider,
  GitHubActionsProvider,
  VercelProvider,
  NetlifyProvider,
  CustomWebhookProvider,
  createPipelineProvider,
  type PipelineProviderConfig,
  type PipelineTriggerResult,
  type PipelineStatusResult,
} from './providers/index.js';

// =============================================================================
// Stores
// =============================================================================

export {
  // Agent Job Store
  type AgentJobStore,
  type DatabaseAdapter,
  DatabaseAgentJobStore,
  InMemoryAgentJobStore,
  createAgentJobStore,

  // Deployment Store
  type DeploymentStore,
  DatabaseDeploymentStore,
  InMemoryDeploymentStore,
  createDeploymentStore,

  // Issue & Bug Stores
  type CreatedIssueStore,
  type DetectedBugStore,
  DatabaseCreatedIssueStore,
  DatabaseDetectedBugStore,
  InMemoryCreatedIssueStore,
  InMemoryDetectedBugStore,
  createCreatedIssueStore,
  createDetectedBugStore,

  // Test Fix Session Store
  type TestFixSessionStore,
  DatabaseTestFixSessionStore,
  InMemoryTestFixSessionStore,
  createTestFixSessionStore,
} from './stores/index.js';

// =============================================================================
// Agent Spawning
// =============================================================================

export {
  AgentSpawningService,
  createAgentSpawningService,
  type AgentSpawningServiceEvents,

  // Progress Reporter
  ProgressReporter,
  createProgressReporter,
  type ProgressReporterEvents,
  type ProgressReporterConfig,

  // Job Manager
  JobManager,
  createJobManager,
  type JobManagerConfig,
} from './agents/index.js';

// =============================================================================
// GitHub PR Management
// =============================================================================

export {
  PRManagementService,
  createPRManagementService,
  type PRManagementServiceConfig,
  type ApprovalHandler,
} from './github/index.js';

// =============================================================================
// Deployments
// =============================================================================

export {
  DeploymentService,
  createDeploymentService,
  type DeploymentServiceConfig,
} from './deployments/index.js';

// =============================================================================
// Bug Detection
// =============================================================================

export {
  BugDetectionService,
  createBugDetectionService,
  type BugDetectionServiceConfig,
  type LogEntry,
  type ErrorEntry,
} from './bugs/index.js';

// =============================================================================
// Test Fix Loop
// =============================================================================

export {
  TestFixLoopService,
  createTestFixLoopService,
  type TestFixLoopServiceConfig,
} from './testing/index.js';

// =============================================================================
// Issue Creation
// =============================================================================

export {
  IssueCreationService,
  createIssueCreationService,
  type IssueCreationServiceConfig,
} from './issues/index.js';

// =============================================================================
// Event Constants
// =============================================================================

export const DEVTOOLS_EVENTS = {
  // Agent events
  AGENT_JOB_STARTED: 'devtools.agent.started',
  AGENT_JOB_PROGRESS: 'devtools.agent.progress',
  AGENT_JOB_COMPLETED: 'devtools.agent.completed',
  AGENT_JOB_FAILED: 'devtools.agent.failed',
  AGENT_JOB_CANCELLED: 'devtools.agent.cancelled',

  // PR events
  PR_REVIEWED: 'devtools.pr.reviewed',
  PR_APPROVED: 'devtools.pr.approved',
  PR_CHANGES_REQUESTED: 'devtools.pr.changes-requested',
  PR_MERGED: 'devtools.pr.merged',
  PR_COMMENTED: 'devtools.pr.commented',
  PR_CLOSED: 'devtools.pr.closed',

  // Deployment events
  DEPLOYMENT_TRIGGERED: 'devtools.deployment.triggered',
  DEPLOYMENT_STARTED: 'devtools.deployment.started',
  DEPLOYMENT_SUCCEEDED: 'devtools.deployment.succeeded',
  DEPLOYMENT_FAILED: 'devtools.deployment.failed',
  DEPLOYMENT_APPROVAL_REQUIRED: 'devtools.deployment.approval-required',
  ROLLBACK_INITIATED: 'devtools.rollback.initiated',
  ROLLBACK_COMPLETED: 'devtools.rollback.completed',
  ROLLBACK_FAILED: 'devtools.rollback.failed',

  // Bug detection events
  BUG_DETECTED: 'devtools.bug.detected',
  BUG_AUTO_FIX_STARTED: 'devtools.bug.auto-fix-started',
  BUG_AUTO_FIX_SUCCEEDED: 'devtools.bug.auto-fix-succeeded',
  BUG_AUTO_FIX_FAILED: 'devtools.bug.auto-fix-failed',

  // Test-fix loop events
  TEST_RUN_STARTED: 'devtools.test.run-started',
  TEST_RUN_COMPLETED: 'devtools.test.run-completed',
  TEST_FIX_APPLIED: 'devtools.test.fix-applied',
  TEST_LOOP_SUCCEEDED: 'devtools.test.loop-succeeded',
  TEST_LOOP_FAILED: 'devtools.test.loop-failed',
  TEST_LOOP_MAX_ITERATIONS: 'devtools.test.loop-max-iterations',

  // Issue events
  ISSUE_CREATED: 'devtools.issue.created',
  ISSUE_UPDATED: 'devtools.issue.updated',
} as const;

// =============================================================================
// DevTools Manager
// =============================================================================

import type { DevToolsConfig } from './config.js';
import { DevToolsConfigSchema, mergeWithDefaults } from './config.js';
import type { DatabaseAdapter, AgentJobStore } from './stores/agent-job-store.js';
import { createAgentJobStore } from './stores/agent-job-store.js';
import type { DeploymentStore } from './stores/deployment-store.js';
import { createDeploymentStore } from './stores/deployment-store.js';
import type { CreatedIssueStore, DetectedBugStore } from './stores/issue-store.js';
import { createCreatedIssueStore, createDetectedBugStore } from './stores/issue-store.js';
import type { TestFixSessionStore } from './stores/test-fix-session-store.js';
import { createTestFixSessionStore } from './stores/test-fix-session-store.js';
import { AgentSpawningService, createAgentSpawningService } from './agents/index.js';
import { PRManagementService, createPRManagementService } from './github/index.js';
import { DeploymentService, createDeploymentService } from './deployments/index.js';
import { BugDetectionService, createBugDetectionService } from './bugs/index.js';
import { TestFixLoopService, createTestFixLoopService } from './testing/index.js';
import { IssueCreationService, createIssueCreationService } from './issues/index.js';
import { DevToolsProviderRegistry, initDevToolsProviderRegistry } from './providers/base.js';

/**
 * Central DevTools Manager
 */
export class DevToolsManager {
  private initialized = false;
  private config: DevToolsConfig;

  // Stores
  private agentJobStore!: AgentJobStore;
  private deploymentStore!: DeploymentStore;
  private createdIssueStore!: CreatedIssueStore;
  private detectedBugStore!: DetectedBugStore;
  private testFixSessionStore!: TestFixSessionStore;

  // Registry
  private providerRegistry!: DevToolsProviderRegistry;

  // Services
  private agentSpawningService?: AgentSpawningService;
  private prManagementService?: PRManagementService;
  private deploymentService?: DeploymentService;
  private bugDetectionService?: BugDetectionService;
  private testFixLoopService?: TestFixLoopService;
  private issueCreationService?: IssueCreationService;

  constructor(config?: Partial<DevToolsConfig>) {
    const result = DevToolsConfigSchema.safeParse(config ?? {});
    if (!result.success) {
      throw new Error(`Invalid devtools config: ${result.error.message}`);
    }
    this.config = mergeWithDefaults(result.data);
  }

  /**
   * Initialize the DevTools manager
   */
  async initialize(dbAdapter?: DatabaseAdapter): Promise<void> {
    if (this.initialized) {
      return;
    }

    const storeType = this.config.storeType;

    // Initialize stores
    if (storeType === 'database' && dbAdapter) {
      this.agentJobStore = createAgentJobStore('database', dbAdapter);
      this.deploymentStore = createDeploymentStore('database', dbAdapter);
      this.createdIssueStore = createCreatedIssueStore('database', dbAdapter);
      this.detectedBugStore = createDetectedBugStore('database', dbAdapter);
      this.testFixSessionStore = createTestFixSessionStore('database', dbAdapter);
    } else {
      this.agentJobStore = createAgentJobStore('memory');
      this.deploymentStore = createDeploymentStore('memory');
      this.createdIssueStore = createCreatedIssueStore('memory');
      this.detectedBugStore = createDetectedBugStore('memory');
      this.testFixSessionStore = createTestFixSessionStore('memory');
    }

    await this.agentJobStore.initialize();
    await this.deploymentStore.initialize();
    await this.createdIssueStore.initialize();
    await this.detectedBugStore.initialize();
    await this.testFixSessionStore.initialize();

    // Initialize provider registry
    this.providerRegistry = initDevToolsProviderRegistry();

    // Initialize services
    await this.initializeServices();

    this.initialized = true;
  }

  /**
   * Initialize services based on configuration
   */
  private async initializeServices(): Promise<void> {
    // Agent spawning service
    if (this.config.agents?.enabled !== false) {
      this.agentSpawningService = createAgentSpawningService(
        this.agentJobStore,
        this.config.agents
      );
      await this.agentSpawningService.initialize();
    }

    // PR management service
    if (this.config.github?.enabled !== false) {
      this.prManagementService = createPRManagementService({
        ...this.config.github!,
      });
      await this.prManagementService.initialize();
    }

    // Deployment service
    if (this.config.deployments?.enabled !== false) {
      this.deploymentService = createDeploymentService(
        this.deploymentStore,
        this.config.deployments!
      );
      await this.deploymentService.initialize();
    }

    // Bug detection service
    if (this.config.bugDetection?.enabled !== false) {
      this.bugDetectionService = createBugDetectionService(
        this.detectedBugStore,
        {
          ...this.config.bugDetection,
          agentSpawner: this.agentSpawningService
            ? async (request) => {
                const job = await this.agentSpawningService!.spawnAgent(request);
                const completed = await this.agentSpawningService!.waitForJob(job.id);
                return { id: completed.id, output: completed.result?.output };
              }
            : undefined,
        }
      );
      await this.bugDetectionService.initialize();
    }

    // Test fix loop service
    if (this.config.testFixLoop?.enabled !== false) {
      this.testFixLoopService = createTestFixLoopService(
        this.testFixSessionStore,
        {
          ...this.config.testFixLoop,
          agentSpawner: this.agentSpawningService
            ? async (request) => {
                const job = await this.agentSpawningService!.spawnAgent(request);
                const completed = await this.agentSpawningService!.waitForJob(job.id);
                return { id: completed.id, output: completed.result?.output };
              }
            : undefined,
        }
      );
      await this.testFixLoopService.initialize();
    }

    // Issue creation service
    if (this.config.issues?.enabled !== false && this.config.github) {
      this.issueCreationService = createIssueCreationService(
        this.createdIssueStore,
        {
          ...this.config.issues!,
          github: this.config.github,
        }
      );
      await this.issueCreationService.initialize();
    }
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // =============================================================================
  // Store Accessors
  // =============================================================================

  getAgentJobStore(): AgentJobStore {
    this.ensureInitialized();
    return this.agentJobStore;
  }

  getDeploymentStore(): DeploymentStore {
    this.ensureInitialized();
    return this.deploymentStore;
  }

  getCreatedIssueStore(): CreatedIssueStore {
    this.ensureInitialized();
    return this.createdIssueStore;
  }

  getDetectedBugStore(): DetectedBugStore {
    this.ensureInitialized();
    return this.detectedBugStore;
  }

  getTestFixSessionStore(): TestFixSessionStore {
    this.ensureInitialized();
    return this.testFixSessionStore;
  }

  // =============================================================================
  // Service Accessors
  // =============================================================================

  getProviderRegistry(): DevToolsProviderRegistry {
    this.ensureInitialized();
    return this.providerRegistry;
  }

  getAgentSpawningService(): AgentSpawningService | undefined {
    this.ensureInitialized();
    return this.agentSpawningService;
  }

  getPRManagementService(): PRManagementService | undefined {
    this.ensureInitialized();
    return this.prManagementService;
  }

  getDeploymentService(): DeploymentService | undefined {
    this.ensureInitialized();
    return this.deploymentService;
  }

  getBugDetectionService(): BugDetectionService | undefined {
    this.ensureInitialized();
    return this.bugDetectionService;
  }

  getTestFixLoopService(): TestFixLoopService | undefined {
    this.ensureInitialized();
    return this.testFixLoopService;
  }

  getIssueCreationService(): IssueCreationService | undefined {
    this.ensureInitialized();
    return this.issueCreationService;
  }

  // =============================================================================
  // Lifecycle
  // =============================================================================

  /**
   * Shutdown the manager
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // Shutdown services
    await this.agentSpawningService?.shutdown();
    await this.prManagementService?.shutdown();
    await this.deploymentService?.shutdown();
    await this.bugDetectionService?.shutdown();
    await this.testFixLoopService?.shutdown();
    await this.issueCreationService?.shutdown();

    // Shutdown provider registry
    await this.providerRegistry.shutdownAll();

    this.initialized = false;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('DevToolsManager not initialized. Call initialize() first.');
    }
  }
}

// =============================================================================
// Global Singleton
// =============================================================================

let globalDevToolsManager: DevToolsManager | null = null;

/**
 * Initialize the global DevTools manager
 */
export async function initDevTools(
  config?: Partial<DevToolsConfig>,
  dbAdapter?: DatabaseAdapter
): Promise<DevToolsManager> {
  globalDevToolsManager = new DevToolsManager(config);
  await globalDevToolsManager.initialize(dbAdapter);
  return globalDevToolsManager;
}

/**
 * Get the global DevTools manager
 */
export function getDevToolsManager(): DevToolsManager {
  if (!globalDevToolsManager) {
    throw new Error('DevToolsManager not initialized. Call initDevTools() first.');
  }
  return globalDevToolsManager;
}

/**
 * Check if DevTools manager is initialized
 */
export function isDevToolsInitialized(): boolean {
  return globalDevToolsManager !== null && globalDevToolsManager.isInitialized();
}
