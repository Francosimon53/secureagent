/**
 * Agent Spawner
 * Main entry point for creating and managing orchestrated agents
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  OrchestratedAgent,
  AgentPersona,
  PersonaType,
  AgentStatus,
  AgentMetrics,
} from '../types.js';
import type { AgentStore } from '../stores/agent-store.js';
import type { SpawnerConfig } from '../config.js';
import {
  AgentLifecycleManager,
  createAgentLifecycleManager,
  type AgentLifecycleConfig,
} from './agent-lifecycle.js';
import {
  SubAgentFactory,
  createSubAgentFactory,
  type SubAgentRequest,
  type SubAgentResult,
  type SubAgentFactoryConfig,
} from './sub-agent-factory.js';
import {
  PersonaRegistry,
  getPersonaRegistry,
} from '../personas/persona-registry.js';
import { ORCHESTRATION_EVENTS } from '../events.js';

/**
 * Agent spawn request
 */
export interface SpawnRequest {
  /** Optional custom agent ID */
  id?: string;
  /** Persona type to use */
  personaType?: PersonaType;
  /** Specific persona ID */
  personaId?: string;
  /** Custom persona configuration */
  customPersona?: Partial<AgentPersona>;
  /** Channel to join */
  channelId?: string;
  /** Initial task */
  initialTask?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent spawner configuration
 */
export interface AgentSpawnerConfig {
  /** Maximum concurrent agents */
  maxConcurrentAgents: number;
  /** Agent idle timeout in minutes */
  agentIdleTimeoutMinutes: number;
  /** Maximum sub-agents per parent */
  maxSubAgentsPerAgent: number;
  /** Auto-terminate on completion */
  autoTerminateOnCompletion: boolean;
  /** Default persona type */
  defaultPersonaType: PersonaType;
}

/**
 * Default spawner configuration
 */
const DEFAULT_SPAWNER_CONFIG: AgentSpawnerConfig = {
  maxConcurrentAgents: 10,
  agentIdleTimeoutMinutes: 30,
  maxSubAgentsPerAgent: 5,
  autoTerminateOnCompletion: true,
  defaultPersonaType: 'developer',
};

/**
 * Agent spawner events
 */
export interface AgentSpawnerEvents {
  'spawn:success': (agent: OrchestratedAgent) => void;
  'spawn:failed': (error: Error, request: SpawnRequest) => void;
  'spawn:limit-reached': (count: number) => void;
}

/**
 * Main agent spawner class
 */
export class AgentSpawner extends EventEmitter {
  private config: AgentSpawnerConfig;
  private lifecycle: AgentLifecycleManager;
  private subAgentFactory: SubAgentFactory;
  private started: boolean = false;

  constructor(
    private store: AgentStore,
    private personaRegistry: PersonaRegistry,
    config?: Partial<AgentSpawnerConfig>
  ) {
    super();
    this.config = { ...DEFAULT_SPAWNER_CONFIG, ...config };

    // Initialize lifecycle manager
    const lifecycleConfig: Partial<AgentLifecycleConfig> = {
      idleTimeoutMs: this.config.agentIdleTimeoutMinutes * 60 * 1000,
      autoTerminateOnCompletion: this.config.autoTerminateOnCompletion,
    };
    this.lifecycle = createAgentLifecycleManager(store, lifecycleConfig);

    // Initialize sub-agent factory
    const factoryConfig: Partial<SubAgentFactoryConfig> = {
      maxSubAgentsPerParent: this.config.maxSubAgentsPerAgent,
      defaultPersonaType: this.config.defaultPersonaType,
      autoTerminate: this.config.autoTerminateOnCompletion,
    };
    this.subAgentFactory = createSubAgentFactory(
      store,
      this.lifecycle,
      personaRegistry,
      factoryConfig
    );

    // Forward lifecycle events
    this.lifecycle.on('agent:created', (agent) => {
      this.emit('spawn:success', agent);
    });

    this.lifecycle.on('agent:error', (agentId, error) => {
      this.emit(ORCHESTRATION_EVENTS.AGENT_ERROR, {
        agentId,
        error: error.message,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Start the spawner
   */
  start(): void {
    if (this.started) {
      return;
    }
    this.lifecycle.start();
    this.started = true;
  }

  /**
   * Stop the spawner
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.lifecycle.stop();
    this.started = false;
  }

  /**
   * Spawn a new agent
   */
  async spawn(request: SpawnRequest = {}): Promise<OrchestratedAgent> {
    // Check agent limit
    const activeCount = await this.store.countActive();
    if (activeCount >= this.config.maxConcurrentAgents) {
      this.emit('spawn:limit-reached', activeCount);
      throw new Error(
        `Maximum concurrent agents reached (${this.config.maxConcurrentAgents})`
      );
    }

    try {
      // Resolve persona
      const persona = this.resolvePersona(request);

      // Generate agent ID
      const agentId = request.id || `agent-${randomUUID().slice(0, 8)}`;

      // Create agent
      const agent = await this.lifecycle.createAgent(agentId, persona, {
        channelId: request.channelId,
        metadata: request.metadata,
      });

      // Set initial task if provided
      if (request.initialTask) {
        await this.lifecycle.setWorking(agentId, request.initialTask);
      }

      return agent;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('spawn:failed', err, request);
      throw err;
    }
  }

  /**
   * Spawn multiple agents
   */
  async spawnMultiple(requests: SpawnRequest[]): Promise<OrchestratedAgent[]> {
    const activeCount = await this.store.countActive();
    const available = this.config.maxConcurrentAgents - activeCount;

    if (requests.length > available) {
      throw new Error(
        `Cannot spawn ${requests.length} agents. Only ${available} slots available.`
      );
    }

    const agents: OrchestratedAgent[] = [];
    for (const request of requests) {
      const agent = await this.spawn(request);
      agents.push(agent);
    }

    return agents;
  }

  /**
   * Spawn a sub-agent
   */
  async spawnSubAgent(request: SubAgentRequest): Promise<OrchestratedAgent> {
    return this.subAgentFactory.createSubAgent(request);
  }

  /**
   * Spawn multiple sub-agents
   */
  async spawnSubAgents(
    parentAgentId: string,
    tasks: Array<{
      task: string;
      personaType?: PersonaType;
      personaId?: string;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<OrchestratedAgent[]> {
    return this.subAgentFactory.createSubAgents(parentAgentId, tasks);
  }

  /**
   * Complete a sub-agent's task
   */
  async completeSubAgent(
    subAgentId: string,
    result: SubAgentResult
  ): Promise<void> {
    return this.subAgentFactory.completeSubAgent(subAgentId, result);
  }

  /**
   * Get an agent by ID
   */
  async getAgent(agentId: string): Promise<OrchestratedAgent | null> {
    return this.lifecycle.getAgent(agentId);
  }

  /**
   * Get all agents
   */
  async getAllAgents(): Promise<OrchestratedAgent[]> {
    return this.lifecycle.getAllAgents();
  }

  /**
   * Get active agents
   */
  async getActiveAgents(): Promise<OrchestratedAgent[]> {
    return this.lifecycle.getActiveAgents();
  }

  /**
   * Get agents by status
   */
  async getAgentsByStatus(status: AgentStatus): Promise<OrchestratedAgent[]> {
    return this.store.getByStatus(status);
  }

  /**
   * Get agents by persona type
   */
  async getAgentsByPersonaType(personaType: PersonaType): Promise<OrchestratedAgent[]> {
    return this.store.getByPersonaType(personaType);
  }

  /**
   * Get agents in a channel
   */
  async getAgentsInChannel(channelId: string): Promise<OrchestratedAgent[]> {
    return this.store.getByChannel(channelId);
  }

  /**
   * Get sub-agents for a parent
   */
  async getSubAgents(parentAgentId: string): Promise<OrchestratedAgent[]> {
    return this.subAgentFactory.getSubAgents(parentAgentId);
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(
    agentId: string,
    status: AgentStatus,
    currentTask?: string
  ): Promise<OrchestratedAgent | null> {
    return this.lifecycle.updateStatus(agentId, status, currentTask);
  }

  /**
   * Set agent as working
   */
  async setAgentWorking(agentId: string, task: string): Promise<OrchestratedAgent | null> {
    return this.lifecycle.setWorking(agentId, task);
  }

  /**
   * Set agent as idle
   */
  async setAgentIdle(agentId: string): Promise<OrchestratedAgent | null> {
    return this.lifecycle.setIdle(agentId);
  }

  /**
   * Set agent as waiting
   */
  async setAgentWaiting(agentId: string, reason?: string): Promise<OrchestratedAgent | null> {
    return this.lifecycle.setWaiting(agentId, reason);
  }

  /**
   * Set agent as errored
   */
  async setAgentError(agentId: string, error: Error | string): Promise<OrchestratedAgent | null> {
    return this.lifecycle.setError(agentId, error);
  }

  /**
   * Terminate an agent
   */
  async terminateAgent(agentId: string, reason?: string): Promise<boolean> {
    return this.lifecycle.terminate(agentId, reason);
  }

  /**
   * Force terminate an agent
   */
  async forceTerminateAgent(agentId: string, reason?: string): Promise<boolean> {
    return this.lifecycle.forceTerminate(agentId, reason);
  }

  /**
   * Terminate all agents
   */
  async terminateAllAgents(reason: string = 'System shutdown'): Promise<void> {
    const agents = await this.getActiveAgents();
    for (const agent of agents) {
      await this.lifecycle.terminate(agent.id, reason);
    }
  }

  /**
   * Touch agent to reset activity
   */
  async touchAgent(agentId: string): Promise<void> {
    return this.lifecycle.touch(agentId);
  }

  /**
   * Get agent metrics
   */
  async getAgentMetrics(agentId: string): Promise<AgentMetrics | null> {
    return this.lifecycle.getMetrics(agentId);
  }

  /**
   * Record task completion for an agent
   */
  async recordTaskCompletion(
    agentId: string,
    success: boolean,
    durationMs: number
  ): Promise<void> {
    return this.lifecycle.recordTaskCompletion(agentId, success, durationMs);
  }

  /**
   * Get active agent count
   */
  async getActiveCount(): Promise<number> {
    return this.store.countActive();
  }

  /**
   * Get available spawn slots
   */
  async getAvailableSlots(): Promise<number> {
    const active = await this.store.countActive();
    return this.config.maxConcurrentAgents - active;
  }

  /**
   * Check if can spawn more agents
   */
  async canSpawn(): Promise<boolean> {
    return (await this.getAvailableSlots()) > 0;
  }

  /**
   * Check if can spawn sub-agents
   */
  async canSpawnSubAgent(parentAgentId: string): Promise<boolean> {
    return this.subAgentFactory.canCreateSubAgent(parentAgentId);
  }

  /**
   * Get lifecycle manager (for advanced operations)
   */
  getLifecycleManager(): AgentLifecycleManager {
    return this.lifecycle;
  }

  /**
   * Get sub-agent factory (for advanced operations)
   */
  getSubAgentFactory(): SubAgentFactory {
    return this.subAgentFactory;
  }

  /**
   * Resolve persona from request
   */
  private resolvePersona(request: SpawnRequest): AgentPersona {
    // Use specific persona ID if provided
    if (request.personaId) {
      const persona = this.personaRegistry.get(request.personaId);
      if (!persona) {
        throw new Error(`Persona '${request.personaId}' not found`);
      }

      if (request.customPersona) {
        return this.applyOverrides(persona, request.customPersona);
      }

      return persona;
    }

    // Use persona type
    const personaType = request.personaType || this.config.defaultPersonaType;
    const persona = this.personaRegistry.getByType(personaType);

    if (!persona) {
      throw new Error(`No persona found for type '${personaType}'`);
    }

    if (request.customPersona) {
      return this.applyOverrides(persona, request.customPersona);
    }

    return persona;
  }

  /**
   * Apply custom overrides to a persona
   */
  private applyOverrides(
    base: AgentPersona,
    overrides: Partial<AgentPersona>
  ): AgentPersona {
    return {
      ...base,
      ...overrides,
      id: base.id,
      modelConfig: {
        ...base.modelConfig,
        ...overrides.modelConfig,
      },
      capabilities: [
        ...base.capabilities,
        ...(overrides.capabilities || []),
      ],
      constraints: [
        ...(base.constraints || []),
        ...(overrides.constraints || []),
      ],
    };
  }
}

/**
 * Create an agent spawner from configuration
 */
export function createAgentSpawner(
  store: AgentStore,
  personaRegistry?: PersonaRegistry,
  config?: Partial<SpawnerConfig>
): AgentSpawner {
  const registry = personaRegistry || getPersonaRegistry();

  const spawnerConfig: Partial<AgentSpawnerConfig> = {
    maxConcurrentAgents: config?.maxConcurrentAgents,
    agentIdleTimeoutMinutes: config?.agentIdleTimeoutMinutes,
    maxSubAgentsPerAgent: config?.maxSubAgentsPerAgent,
    autoTerminateOnCompletion: config?.autoTerminateOnCompletion,
  };

  return new AgentSpawner(store, registry, spawnerConfig);
}
