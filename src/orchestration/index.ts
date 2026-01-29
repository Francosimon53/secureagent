/**
 * Multi-Agent Orchestration System
 * Main module entry point and Orchestrator class
 */

import { EventEmitter } from 'events';
import type { DatabaseAdapter } from '../persistence/index.js';

// Types
export * from './types.js';

// Events
export { ORCHESTRATION_EVENTS, type OrchestrationEventType } from './events.js';
export type {
  BaseOrchestrationEvent,
  AgentSpawnedEvent,
  AgentTerminatedEvent,
  AgentStatusChangedEvent,
  AgentErrorEvent,
  MessageEvent,
  ChannelEvent,
  SessionEvent,
  HandoffEvent,
  TaskEvent,
  OvernightEvent,
  ReportEvent,
  LearningEvent,
  OrchestrationEventPayload,
} from './events.js';

// Configuration
export {
  OrchestrationConfigSchema,
  PersonasConfigSchema,
  SpawnerConfigSchema,
  CommunicationConfigSchema,
  BackgroundConfigSchema,
  OvernightConfigSchema,
  ReportingConfigSchema,
  LearningConfigSchema,
  validateOrchestrationConfig,
  safeParseOrchestrationConfig,
  getDefaultOrchestrationConfig,
  type OrchestrationConfig,
  type PersonasConfig,
  type SpawnerConfig,
  type CommunicationConfig,
  type BackgroundConfig,
  type OvernightConfig,
  type ReportingConfig,
  type LearningConfig,
} from './config.js';

// Stores
export * from './stores/index.js';

// Personas
export * from './personas/index.js';

// Spawner
export * from './spawner/index.js';

// Communication
export * from './communication/index.js';

// Background
export * from './background/index.js';

// Reporting
export * from './reporting/index.js';

// Learning
export * from './learning/index.js';

// Import for Orchestrator
import type { OrchestrationConfig } from './config.js';
import type { OrchestratedAgent, AgentPersona, PersonaType, BackgroundTask, CollaborationSession, DailyReport } from './types.js';
import {
  createOrchestrationStores,
  initializeOrchestrationStores,
  type OrchestrationStores,
} from './stores/index.js';
import {
  PersonaRegistry,
  initPersonaRegistry,
} from './personas/index.js';
import {
  AgentSpawner,
  createAgentSpawner,
  type SpawnRequest,
  type SubAgentRequest,
} from './spawner/index.js';
import {
  ChannelManager,
  createChannelManager,
  MessageRouter,
  createMessageRouter,
  CollaborationSessionManager,
  createCollaborationSessionManager,
  type CreateSessionOptions,
} from './communication/index.js';
import {
  TaskQueue,
  createTaskQueue,
  CheckpointManager,
  createCheckpointManager,
  OvernightProcessor,
  createOvernightProcessor,
  type CreateTaskOptions,
  type TaskHandler,
} from './background/index.js';
import {
  StatusCollector,
  createStatusCollector,
  DailyReporter,
  createDailyReporter,
} from './reporting/index.js';
import {
  ErrorCapture,
  createErrorCapture,
  KnowledgeStore,
  createKnowledgeStore,
  ImprovementEngine,
  createImprovementEngine,
  type CaptureErrorRequest,
} from './learning/index.js';
import { getDefaultOrchestrationConfig } from './config.js';

/**
 * Orchestrator initialization options
 */
export interface OrchestratorOptions {
  /** Configuration */
  config?: Partial<OrchestrationConfig>;
  /** Database adapter for persistent storage */
  dbAdapter?: DatabaseAdapter;
}

/**
 * Main Orchestrator class
 * Central coordinator for the multi-agent orchestration system
 */
export class Orchestrator extends EventEmitter {
  private config: OrchestrationConfig;
  private stores!: OrchestrationStores;
  private personaRegistry!: PersonaRegistry;
  private spawner!: AgentSpawner;
  private channelManager!: ChannelManager;
  private messageRouter!: MessageRouter;
  private sessionManager!: CollaborationSessionManager;
  private taskQueue!: TaskQueue;
  private checkpointManager!: CheckpointManager;
  private overnightProcessor!: OvernightProcessor;
  private statusCollector!: StatusCollector;
  private dailyReporter!: DailyReporter;
  private errorCapture!: ErrorCapture;
  private knowledgeStore!: KnowledgeStore;
  private improvementEngine!: ImprovementEngine;

  private initialized: boolean = false;
  private started: boolean = false;

  constructor(private options: OrchestratorOptions = {}) {
    super();
    this.config = {
      ...getDefaultOrchestrationConfig(),
      ...options.config,
    };
  }

  /**
   * Initialize the orchestrator
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const storeType = this.options.dbAdapter ? 'database' : this.config.storeType;

    // Initialize stores
    this.stores = createOrchestrationStores(storeType, this.options.dbAdapter);
    await initializeOrchestrationStores(this.stores);

    // Initialize persona registry
    this.personaRegistry = initPersonaRegistry({
      enablePresets: this.config.personas.enablePresets,
      defaultModelTier: this.config.personas.defaultModelTier,
    });

    // Initialize spawner
    this.spawner = createAgentSpawner(
      this.stores.agents,
      this.personaRegistry,
      this.config.spawner
    );

    // Initialize communication
    this.channelManager = createChannelManager(
      this.stores.sessions,
      this.config.communication
    );

    this.messageRouter = createMessageRouter(
      this.channelManager,
      this.stores.agents,
      this.config.communication
    );

    this.sessionManager = createCollaborationSessionManager(
      this.stores.sessions,
      this.channelManager,
      this.messageRouter
    );

    // Initialize background processing
    this.taskQueue = createTaskQueue(
      this.stores.tasks,
      this.config.background
    );

    this.checkpointManager = createCheckpointManager(
      this.stores.tasks,
      { checkpointIntervalMinutes: this.config.background.checkpointIntervalMinutes }
    );

    this.overnightProcessor = createOvernightProcessor(
      this.stores.tasks,
      this.taskQueue,
      this.config.overnight
    );

    // Initialize reporting
    this.statusCollector = createStatusCollector(
      this.stores.agents,
      this.stores.tasks,
      this.stores.sessions,
      this.stores.learning,
      this.config.reporting
    );

    this.dailyReporter = createDailyReporter(
      this.statusCollector,
      this.stores.learning,
      this.config.reporting
    );

    // Initialize learning
    this.errorCapture = createErrorCapture(
      this.stores.learning,
      {
        captureAll: this.config.learning.captureAllErrors,
        enablePatternDetection: this.config.learning.enabled,
      }
    );

    this.knowledgeStore = createKnowledgeStore(
      this.stores.learning,
      { minConfidence: this.config.learning.minConfidenceForPattern }
    );

    this.improvementEngine = createImprovementEngine(
      this.stores.learning,
      this.knowledgeStore,
      this.errorCapture,
      {
        enabled: this.config.learning.enabled,
        autoApplyLowRisk: this.config.learning.autoApplyImprovements,
        requireApproval: this.config.learning.improvementApprovalRequired,
      }
    );

    this.initialized = true;
  }

  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.started) {
      return;
    }

    // Start all components
    this.spawner.start();
    this.channelManager.start();
    this.taskQueue.start();
    this.checkpointManager.start();
    this.overnightProcessor.start();
    this.statusCollector.start();
    this.dailyReporter.start();
    this.errorCapture.start();
    this.knowledgeStore.start();
    this.improvementEngine.start();

    this.started = true;
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    // Stop all components
    await this.spawner.stop();
    this.channelManager.stop();
    this.taskQueue.stop();
    this.checkpointManager.stop();
    this.overnightProcessor.stop();
    this.statusCollector.stop();
    this.dailyReporter.stop();
    this.errorCapture.stop();
    this.knowledgeStore.stop();
    this.improvementEngine.stop();

    this.started = false;
  }

  /**
   * Check if orchestrator is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if orchestrator is running
   */
  isRunning(): boolean {
    return this.started;
  }

  // ==========================================================================
  // Agent Operations
  // ==========================================================================

  /**
   * Spawn a new agent
   */
  async spawnAgent(request?: SpawnRequest): Promise<OrchestratedAgent> {
    return this.spawner.spawn(request);
  }

  /**
   * Spawn a sub-agent
   */
  async spawnSubAgent(request: SubAgentRequest): Promise<OrchestratedAgent> {
    return this.spawner.spawnSubAgent(request);
  }

  /**
   * Get an agent by ID
   */
  async getAgent(agentId: string): Promise<OrchestratedAgent | null> {
    return this.spawner.getAgent(agentId);
  }

  /**
   * Get all active agents
   */
  async getActiveAgents(): Promise<OrchestratedAgent[]> {
    return this.spawner.getActiveAgents();
  }

  /**
   * Terminate an agent
   */
  async terminateAgent(agentId: string, reason?: string): Promise<boolean> {
    return this.spawner.terminateAgent(agentId, reason);
  }

  // ==========================================================================
  // Persona Operations
  // ==========================================================================

  /**
   * Get a persona
   */
  getPersona(personaId: string): AgentPersona | null {
    return this.personaRegistry.get(personaId);
  }

  /**
   * Register a custom persona
   */
  registerPersona(persona: AgentPersona): void {
    this.personaRegistry.register(persona);
  }

  /**
   * Get all personas
   */
  getAllPersonas(): AgentPersona[] {
    return this.personaRegistry.getAll();
  }

  // ==========================================================================
  // Collaboration Operations
  // ==========================================================================

  /**
   * Start a collaboration session
   */
  async startSession(options: CreateSessionOptions): Promise<CollaborationSession> {
    return this.sessionManager.createSession(options);
  }

  /**
   * Get a session
   */
  async getSession(sessionId: string): Promise<CollaborationSession | null> {
    return this.sessionManager.getSession(sessionId);
  }

  /**
   * Complete a session
   */
  async completeSession(sessionId: string, result?: unknown): Promise<boolean> {
    return this.sessionManager.completeSession(sessionId, result);
  }

  /**
   * Request a handoff
   */
  async requestHandoff(
    sessionId: string,
    fromAgentId: string,
    toAgentId: string,
    task: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    return this.sessionManager.requestHandoff(
      sessionId,
      fromAgentId,
      toAgentId,
      task,
      reason,
      context
    );
  }

  // ==========================================================================
  // Task Operations
  // ==========================================================================

  /**
   * Queue a background task
   */
  async queueTask(options: CreateTaskOptions): Promise<BackgroundTask> {
    return this.taskQueue.enqueue(options);
  }

  /**
   * Get a task
   */
  async getTask(taskId: string): Promise<BackgroundTask | null> {
    return this.taskQueue.getTask(taskId);
  }

  /**
   * Register a task handler
   */
  registerTaskHandler(name: string, handler: TaskHandler): void {
    this.taskQueue.registerHandler(name, handler);
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    return this.taskQueue.cancelTask(taskId);
  }

  // ==========================================================================
  // Error & Learning Operations
  // ==========================================================================

  /**
   * Capture an error
   */
  async captureError(request: CaptureErrorRequest) {
    return this.errorCapture.capture(request);
  }

  /**
   * Get improvement suggestions
   */
  async getImprovementSuggestions() {
    return this.improvementEngine.getPendingImprovements();
  }

  /**
   * Apply an improvement
   */
  async applyImprovement(improvementId: string): Promise<boolean> {
    return this.improvementEngine.applyImprovement(improvementId);
  }

  // ==========================================================================
  // Reporting Operations
  // ==========================================================================

  /**
   * Generate a daily report
   */
  async generateDailyReport(): Promise<DailyReport> {
    return this.dailyReporter.generateDailyReport();
  }

  /**
   * Get recent reports
   */
  async getRecentReports(days?: number): Promise<DailyReport[]> {
    return this.dailyReporter.getRecentReports(days);
  }

  /**
   * Get current status snapshot
   */
  async getStatusSnapshot() {
    return this.statusCollector.collect();
  }

  // ==========================================================================
  // Component Access
  // ==========================================================================

  /**
   * Get the spawner instance
   */
  getSpawner(): AgentSpawner {
    return this.spawner;
  }

  /**
   * Get the persona registry
   */
  getPersonaRegistry(): PersonaRegistry {
    return this.personaRegistry;
  }

  /**
   * Get the channel manager
   */
  getChannelManager(): ChannelManager {
    return this.channelManager;
  }

  /**
   * Get the message router
   */
  getMessageRouter(): MessageRouter {
    return this.messageRouter;
  }

  /**
   * Get the session manager
   */
  getSessionManager(): CollaborationSessionManager {
    return this.sessionManager;
  }

  /**
   * Get the task queue
   */
  getTaskQueue(): TaskQueue {
    return this.taskQueue;
  }

  /**
   * Get the checkpoint manager
   */
  getCheckpointManager(): CheckpointManager {
    return this.checkpointManager;
  }

  /**
   * Get the overnight processor
   */
  getOvernightProcessor(): OvernightProcessor {
    return this.overnightProcessor;
  }

  /**
   * Get the status collector
   */
  getStatusCollector(): StatusCollector {
    return this.statusCollector;
  }

  /**
   * Get the daily reporter
   */
  getDailyReporter(): DailyReporter {
    return this.dailyReporter;
  }

  /**
   * Get the error capture
   */
  getErrorCapture(): ErrorCapture {
    return this.errorCapture;
  }

  /**
   * Get the knowledge store
   */
  getKnowledgeStore(): KnowledgeStore {
    return this.knowledgeStore;
  }

  /**
   * Get the improvement engine
   */
  getImprovementEngine(): ImprovementEngine {
    return this.improvementEngine;
  }

  /**
   * Get the stores
   */
  getStores(): OrchestrationStores {
    return this.stores;
  }
}

// =============================================================================
// Global Instance Management
// =============================================================================

let globalOrchestrator: Orchestrator | null = null;

/**
 * Initialize the global orchestrator
 */
export async function initOrchestration(
  options?: OrchestratorOptions
): Promise<Orchestrator> {
  globalOrchestrator = new Orchestrator(options);
  await globalOrchestrator.initialize();
  return globalOrchestrator;
}

/**
 * Get the global orchestrator
 */
export function getOrchestrator(): Orchestrator {
  if (!globalOrchestrator) {
    throw new Error('Orchestrator not initialized. Call initOrchestration() first.');
  }
  return globalOrchestrator;
}

/**
 * Check if orchestrator is initialized
 */
export function isOrchestrationInitialized(): boolean {
  return globalOrchestrator !== null && globalOrchestrator.isInitialized();
}

/**
 * Create an orchestrator instance (without setting global)
 */
export function createOrchestrator(options?: OrchestratorOptions): Orchestrator {
  return new Orchestrator(options);
}
