/**
 * Agent Lifecycle Manager
 * Manages the lifecycle of orchestrated agents
 */

import { EventEmitter } from 'events';
import type {
  OrchestratedAgent,
  AgentStatus,
  AgentPersona,
  AgentMetrics,
} from '../types.js';
import type { AgentStore } from '../stores/agent-store.js';
import { ORCHESTRATION_EVENTS } from '../events.js';

/**
 * Agent lifecycle configuration
 */
export interface AgentLifecycleConfig {
  /** Idle timeout in milliseconds */
  idleTimeoutMs: number;
  /** Auto-terminate on completion */
  autoTerminateOnCompletion: boolean;
  /** Check interval for idle agents */
  idleCheckIntervalMs: number;
}

/**
 * Default lifecycle configuration
 */
const DEFAULT_LIFECYCLE_CONFIG: AgentLifecycleConfig = {
  idleTimeoutMs: 30 * 60 * 1000, // 30 minutes
  autoTerminateOnCompletion: true,
  idleCheckIntervalMs: 5 * 60 * 1000, // 5 minutes
};

/**
 * Agent lifecycle events
 */
export interface AgentLifecycleEvents {
  'agent:created': (agent: OrchestratedAgent) => void;
  'agent:status-changed': (agent: OrchestratedAgent, previousStatus: AgentStatus) => void;
  'agent:terminated': (agentId: string, reason: string) => void;
  'agent:idle-timeout': (agent: OrchestratedAgent) => void;
  'agent:error': (agentId: string, error: Error) => void;
}

/**
 * Manages agent lifecycle operations
 */
export class AgentLifecycleManager extends EventEmitter {
  private config: AgentLifecycleConfig;
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private agentTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(
    private store: AgentStore,
    config?: Partial<AgentLifecycleConfig>
  ) {
    super();
    this.config = { ...DEFAULT_LIFECYCLE_CONFIG, ...config };
  }

  /**
   * Start lifecycle management
   */
  start(): void {
    if (this.idleCheckInterval) {
      return;
    }

    this.idleCheckInterval = setInterval(
      () => this.checkIdleAgents(),
      this.config.idleCheckIntervalMs
    );
  }

  /**
   * Stop lifecycle management
   */
  stop(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }

    // Clear all agent timers
    for (const timer of this.agentTimers.values()) {
      clearTimeout(timer);
    }
    this.agentTimers.clear();
  }

  /**
   * Create a new agent
   */
  async createAgent(
    id: string,
    persona: AgentPersona,
    options?: {
      channelId?: string;
      parentAgentId?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<OrchestratedAgent> {
    const now = Date.now();

    const agent: OrchestratedAgent = {
      id,
      personaId: persona.id,
      persona,
      status: 'idle',
      channelId: options?.channelId,
      parentAgentId: options?.parentAgentId,
      subAgentIds: [],
      metadata: options?.metadata || {},
      createdAt: now,
      lastActiveAt: now,
    };

    await this.store.save(agent);
    this.emit('agent:created', agent);
    this.emit(ORCHESTRATION_EVENTS.AGENT_SPAWNED, {
      agentId: agent.id,
      personaId: persona.id,
      personaType: persona.type,
      parentAgentId: options?.parentAgentId,
      timestamp: now,
      source: 'agent-lifecycle',
    });

    // Start idle timer
    this.resetIdleTimer(id);

    return agent;
  }

  /**
   * Update agent status
   */
  async updateStatus(
    agentId: string,
    status: AgentStatus,
    currentTask?: string
  ): Promise<OrchestratedAgent | null> {
    const agent = await this.store.get(agentId);
    if (!agent) {
      return null;
    }

    const previousStatus = agent.status;
    await this.store.updateStatus(agentId, status, currentTask);

    // Update local reference
    agent.status = status;
    agent.currentTask = currentTask;
    agent.lastActiveAt = Date.now();

    this.emit('agent:status-changed', agent, previousStatus);
    this.emit(ORCHESTRATION_EVENTS.AGENT_STATUS_CHANGED, {
      agentId,
      previousStatus,
      newStatus: status,
      timestamp: Date.now(),
      source: 'agent-lifecycle',
    });

    // Handle status-specific actions
    if (status === 'working') {
      this.clearIdleTimer(agentId);
    } else if (status === 'idle') {
      this.resetIdleTimer(agentId);

      // Auto-terminate if configured and task was completed
      if (this.config.autoTerminateOnCompletion && previousStatus === 'working') {
        // Check if there's any pending work
        const tasksForAgent = await this.hasAssignedTasks(agentId);
        if (!tasksForAgent) {
          await this.terminate(agentId, 'Task completed - auto-terminate');
        }
      }
    } else if (status === 'terminated') {
      this.clearIdleTimer(agentId);
    }

    return agent;
  }

  /**
   * Mark agent as working on a task
   */
  async setWorking(agentId: string, task: string): Promise<OrchestratedAgent | null> {
    return this.updateStatus(agentId, 'working', task);
  }

  /**
   * Mark agent as idle
   */
  async setIdle(agentId: string): Promise<OrchestratedAgent | null> {
    return this.updateStatus(agentId, 'idle');
  }

  /**
   * Mark agent as waiting
   */
  async setWaiting(agentId: string, reason?: string): Promise<OrchestratedAgent | null> {
    return this.updateStatus(agentId, 'waiting', reason);
  }

  /**
   * Mark agent as errored
   */
  async setError(agentId: string, error: Error | string): Promise<OrchestratedAgent | null> {
    const errorMessage = error instanceof Error ? error.message : error;
    const agent = await this.updateStatus(agentId, 'error', errorMessage);

    if (agent) {
      this.emit('agent:error', agentId, error instanceof Error ? error : new Error(errorMessage));
      this.emit(ORCHESTRATION_EVENTS.AGENT_ERROR, {
        agentId,
        error: errorMessage,
        category: 'unknown',
        timestamp: Date.now(),
        source: 'agent-lifecycle',
      });
    }

    return agent;
  }

  /**
   * Terminate an agent
   */
  async terminate(agentId: string, reason: string = 'Manual termination'): Promise<boolean> {
    const agent = await this.store.get(agentId);
    if (!agent) {
      return false;
    }

    // First terminate any sub-agents
    for (const subAgentId of agent.subAgentIds) {
      await this.terminate(subAgentId, 'Parent agent terminated');
    }

    // Update parent's sub-agent list if this is a sub-agent
    if (agent.parentAgentId) {
      await this.removeSubAgent(agent.parentAgentId, agentId);
    }

    // Clear timers
    this.clearIdleTimer(agentId);

    // Mark as terminated
    await this.store.updateStatus(agentId, 'terminated');

    this.emit('agent:terminated', agentId, reason);
    this.emit(ORCHESTRATION_EVENTS.AGENT_TERMINATED, {
      agentId,
      reason,
      wasForced: false,
      timestamp: Date.now(),
      source: 'agent-lifecycle',
    });

    return true;
  }

  /**
   * Force terminate an agent (for cleanup)
   */
  async forceTerminate(agentId: string, reason: string = 'Force termination'): Promise<boolean> {
    const agent = await this.store.get(agentId);
    if (!agent) {
      return false;
    }

    // Clear timers
    this.clearIdleTimer(agentId);

    // Delete from store
    await this.store.delete(agentId);

    this.emit('agent:terminated', agentId, reason);
    this.emit(ORCHESTRATION_EVENTS.AGENT_TERMINATED, {
      agentId,
      reason,
      wasForced: true,
      timestamp: Date.now(),
      source: 'agent-lifecycle',
    });

    return true;
  }

  /**
   * Touch agent to reset activity timestamp
   */
  async touch(agentId: string): Promise<void> {
    await this.store.touch(agentId);
    this.resetIdleTimer(agentId);
  }

  /**
   * Add sub-agent to parent
   */
  async addSubAgent(parentAgentId: string, subAgentId: string): Promise<void> {
    const parent = await this.store.get(parentAgentId);
    if (parent && !parent.subAgentIds.includes(subAgentId)) {
      parent.subAgentIds.push(subAgentId);
      await this.store.save(parent);
    }
  }

  /**
   * Remove sub-agent from parent
   */
  async removeSubAgent(parentAgentId: string, subAgentId: string): Promise<void> {
    const parent = await this.store.get(parentAgentId);
    if (parent) {
      parent.subAgentIds = parent.subAgentIds.filter(id => id !== subAgentId);
      await this.store.save(parent);
    }
  }

  /**
   * Get agent
   */
  async getAgent(agentId: string): Promise<OrchestratedAgent | null> {
    return this.store.get(agentId);
  }

  /**
   * Get all agents
   */
  async getAllAgents(): Promise<OrchestratedAgent[]> {
    return this.store.getAll();
  }

  /**
   * Get active agents (not terminated)
   */
  async getActiveAgents(): Promise<OrchestratedAgent[]> {
    const all = await this.store.getAll();
    return all.filter(a => a.status !== 'terminated');
  }

  /**
   * Get agent metrics
   */
  async getMetrics(agentId: string): Promise<AgentMetrics | null> {
    return this.store.getMetrics(agentId);
  }

  /**
   * Update agent metrics
   */
  async updateMetrics(agentId: string, updates: Partial<AgentMetrics>): Promise<void> {
    await this.store.updateMetrics(agentId, updates);
  }

  /**
   * Increment message count
   */
  async incrementMessagesSent(agentId: string): Promise<void> {
    const metrics = await this.store.getMetrics(agentId);
    if (metrics) {
      await this.store.updateMetrics(agentId, {
        messagesSent: metrics.messagesSent + 1,
      });
    }
  }

  /**
   * Increment received message count
   */
  async incrementMessagesReceived(agentId: string): Promise<void> {
    const metrics = await this.store.getMetrics(agentId);
    if (metrics) {
      await this.store.updateMetrics(agentId, {
        messagesReceived: metrics.messagesReceived + 1,
      });
    }
  }

  /**
   * Record task completion
   */
  async recordTaskCompletion(agentId: string, success: boolean, durationMs: number): Promise<void> {
    const metrics = await this.store.getMetrics(agentId);
    if (metrics) {
      const totalTasks = metrics.totalTasks + 1;
      const successfulTasks = success ? metrics.successfulTasks + 1 : metrics.successfulTasks;
      const failedTasks = success ? metrics.failedTasks : metrics.failedTasks + 1;

      // Calculate new average response time
      const previousTotal = metrics.averageResponseTimeMs * metrics.totalTasks;
      const averageResponseTimeMs = (previousTotal + durationMs) / totalTasks;

      await this.store.updateMetrics(agentId, {
        totalTasks,
        successfulTasks,
        failedTasks,
        averageResponseTimeMs,
      });
    }
  }

  /**
   * Check for idle agents and terminate if needed
   */
  private async checkIdleAgents(): Promise<void> {
    const idleAgents = await this.store.getIdleAgents(this.config.idleTimeoutMs);

    for (const agent of idleAgents) {
      this.emit('agent:idle-timeout', agent);
      await this.terminate(agent.id, 'Idle timeout');
    }
  }

  /**
   * Reset idle timer for an agent
   */
  private resetIdleTimer(agentId: string): void {
    this.clearIdleTimer(agentId);

    const timer = setTimeout(async () => {
      const agent = await this.store.get(agentId);
      if (agent && agent.status === 'idle') {
        this.emit('agent:idle-timeout', agent);
        await this.terminate(agentId, 'Idle timeout');
      }
    }, this.config.idleTimeoutMs);

    this.agentTimers.set(agentId, timer);
  }

  /**
   * Clear idle timer for an agent
   */
  private clearIdleTimer(agentId: string): void {
    const timer = this.agentTimers.get(agentId);
    if (timer) {
      clearTimeout(timer);
      this.agentTimers.delete(agentId);
    }
  }

  /**
   * Check if agent has assigned tasks (placeholder for integration)
   */
  private async hasAssignedTasks(_agentId: string): Promise<boolean> {
    // This would be integrated with the task store
    // For now, return false to allow auto-termination
    return false;
  }
}

/**
 * Create an agent lifecycle manager
 */
export function createAgentLifecycleManager(
  store: AgentStore,
  config?: Partial<AgentLifecycleConfig>
): AgentLifecycleManager {
  return new AgentLifecycleManager(store, config);
}
