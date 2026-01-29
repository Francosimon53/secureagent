/**
 * Sub-Agent Factory
 * Creates and manages sub-agents for specific tasks
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  OrchestratedAgent,
  AgentPersona,
  PersonaType,
} from '../types.js';
import type { AgentStore } from '../stores/agent-store.js';
import type { AgentLifecycleManager } from './agent-lifecycle.js';
import { PersonaRegistry } from '../personas/persona-registry.js';
import { ORCHESTRATION_EVENTS } from '../events.js';

/**
 * Sub-agent creation request
 */
export interface SubAgentRequest {
  /** Parent agent ID */
  parentAgentId: string;
  /** Task for the sub-agent */
  task: string;
  /** Persona type to use */
  personaType?: PersonaType;
  /** Specific persona ID */
  personaId?: string;
  /** Custom persona override */
  customPersona?: Partial<AgentPersona>;
  /** Optional channel ID */
  channelId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Sub-agent result
 */
export interface SubAgentResult {
  /** Sub-agent ID */
  subAgentId: string;
  /** Success status */
  success: boolean;
  /** Result data */
  result?: unknown;
  /** Error if failed */
  error?: string;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Sub-agent factory configuration
 */
export interface SubAgentFactoryConfig {
  /** Maximum sub-agents per parent */
  maxSubAgentsPerParent: number;
  /** Default persona type for sub-agents */
  defaultPersonaType: PersonaType;
  /** Auto-terminate sub-agents on completion */
  autoTerminate: boolean;
}

/**
 * Default factory configuration
 */
const DEFAULT_FACTORY_CONFIG: SubAgentFactoryConfig = {
  maxSubAgentsPerParent: 5,
  defaultPersonaType: 'developer',
  autoTerminate: true,
};

/**
 * Factory for creating sub-agents
 */
export class SubAgentFactory extends EventEmitter {
  private config: SubAgentFactoryConfig;

  constructor(
    private store: AgentStore,
    private lifecycle: AgentLifecycleManager,
    private personaRegistry: PersonaRegistry,
    config?: Partial<SubAgentFactoryConfig>
  ) {
    super();
    this.config = { ...DEFAULT_FACTORY_CONFIG, ...config };
  }

  /**
   * Create a sub-agent
   */
  async createSubAgent(request: SubAgentRequest): Promise<OrchestratedAgent> {
    // Verify parent exists
    const parent = await this.store.get(request.parentAgentId);
    if (!parent) {
      throw new Error(`Parent agent '${request.parentAgentId}' not found`);
    }

    // Check sub-agent limit
    if (parent.subAgentIds.length >= this.config.maxSubAgentsPerParent) {
      throw new Error(
        `Parent agent has reached maximum sub-agents (${this.config.maxSubAgentsPerParent})`
      );
    }

    // Resolve persona
    const persona = this.resolvePersona(request);

    // Generate sub-agent ID
    const subAgentId = `${request.parentAgentId}-sub-${randomUUID().slice(0, 8)}`;

    // Create sub-agent
    const subAgent = await this.lifecycle.createAgent(subAgentId, persona, {
      channelId: request.channelId || parent.channelId,
      parentAgentId: request.parentAgentId,
      metadata: {
        ...request.metadata,
        task: request.task,
        createdBy: request.parentAgentId,
      },
    });

    // Update parent's sub-agent list
    await this.lifecycle.addSubAgent(request.parentAgentId, subAgentId);

    this.emit(ORCHESTRATION_EVENTS.SUBAGENT_CREATED, {
      subAgentId,
      parentAgentId: request.parentAgentId,
      personaType: persona.type,
      task: request.task,
      timestamp: Date.now(),
      source: 'sub-agent-factory',
    });

    return subAgent;
  }

  /**
   * Create multiple sub-agents for parallel tasks
   */
  async createSubAgents(
    parentAgentId: string,
    tasks: Array<{
      task: string;
      personaType?: PersonaType;
      personaId?: string;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<OrchestratedAgent[]> {
    const parent = await this.store.get(parentAgentId);
    if (!parent) {
      throw new Error(`Parent agent '${parentAgentId}' not found`);
    }

    // Check total capacity
    const available = this.config.maxSubAgentsPerParent - parent.subAgentIds.length;
    if (tasks.length > available) {
      throw new Error(
        `Cannot create ${tasks.length} sub-agents. Only ${available} slots available.`
      );
    }

    const subAgents: OrchestratedAgent[] = [];

    for (const taskDef of tasks) {
      const subAgent = await this.createSubAgent({
        parentAgentId,
        task: taskDef.task,
        personaType: taskDef.personaType,
        personaId: taskDef.personaId,
        metadata: taskDef.metadata,
      });
      subAgents.push(subAgent);
    }

    return subAgents;
  }

  /**
   * Complete a sub-agent's task
   */
  async completeSubAgent(
    subAgentId: string,
    result: SubAgentResult
  ): Promise<void> {
    const subAgent = await this.store.get(subAgentId);
    if (!subAgent) {
      throw new Error(`Sub-agent '${subAgentId}' not found`);
    }

    // Record completion metrics
    await this.lifecycle.recordTaskCompletion(
      subAgentId,
      result.success,
      result.durationMs
    );

    if (result.success) {
      this.emit(ORCHESTRATION_EVENTS.SUBAGENT_COMPLETED, {
        subAgentId,
        parentAgentId: subAgent.parentAgentId,
        result: result.result,
        durationMs: result.durationMs,
        timestamp: Date.now(),
        source: 'sub-agent-factory',
      });
    } else {
      this.emit(ORCHESTRATION_EVENTS.SUBAGENT_FAILED, {
        subAgentId,
        parentAgentId: subAgent.parentAgentId,
        error: result.error,
        durationMs: result.durationMs,
        timestamp: Date.now(),
        source: 'sub-agent-factory',
      });
    }

    // Auto-terminate if configured
    if (this.config.autoTerminate) {
      await this.lifecycle.terminate(
        subAgentId,
        result.success ? 'Task completed' : 'Task failed'
      );
    }
  }

  /**
   * Get sub-agents for a parent
   */
  async getSubAgents(parentAgentId: string): Promise<OrchestratedAgent[]> {
    return this.store.getSubAgents(parentAgentId);
  }

  /**
   * Check if parent can create more sub-agents
   */
  async canCreateSubAgent(parentAgentId: string): Promise<boolean> {
    const parent = await this.store.get(parentAgentId);
    if (!parent) {
      return false;
    }
    return parent.subAgentIds.length < this.config.maxSubAgentsPerParent;
  }

  /**
   * Get available sub-agent slots
   */
  async getAvailableSlots(parentAgentId: string): Promise<number> {
    const parent = await this.store.get(parentAgentId);
    if (!parent) {
      return 0;
    }
    return this.config.maxSubAgentsPerParent - parent.subAgentIds.length;
  }

  /**
   * Terminate all sub-agents for a parent
   */
  async terminateAllSubAgents(parentAgentId: string, reason: string = 'Parent cleanup'): Promise<void> {
    const subAgents = await this.getSubAgents(parentAgentId);
    for (const subAgent of subAgents) {
      await this.lifecycle.terminate(subAgent.id, reason);
    }
  }

  /**
   * Resolve persona from request
   */
  private resolvePersona(request: SubAgentRequest): AgentPersona {
    // Use specific persona ID if provided
    if (request.personaId) {
      const persona = this.personaRegistry.get(request.personaId);
      if (!persona) {
        throw new Error(`Persona '${request.personaId}' not found`);
      }

      // Apply custom overrides
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

    // Apply custom overrides
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
      id: base.id, // Preserve original ID
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
 * Create a sub-agent factory
 */
export function createSubAgentFactory(
  store: AgentStore,
  lifecycle: AgentLifecycleManager,
  personaRegistry: PersonaRegistry,
  config?: Partial<SubAgentFactoryConfig>
): SubAgentFactory {
  return new SubAgentFactory(store, lifecycle, personaRegistry, config);
}
