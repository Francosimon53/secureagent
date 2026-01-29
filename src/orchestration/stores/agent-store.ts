/**
 * Agent Store
 * Tracks active orchestrated agents and their state
 */

import type { OrchestratedAgent, AgentStatus, AgentMetrics } from '../types.js';
import type { DatabaseAdapter } from '../../persistence/index.js';

/**
 * Agent store interface
 */
export interface AgentStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Get an agent by ID */
  get(id: string): Promise<OrchestratedAgent | null>;

  /** Get all agents */
  getAll(): Promise<OrchestratedAgent[]>;

  /** Get agents by status */
  getByStatus(status: AgentStatus): Promise<OrchestratedAgent[]>;

  /** Get agents by persona type */
  getByPersonaType(personaType: string): Promise<OrchestratedAgent[]>;

  /** Get sub-agents of a parent agent */
  getSubAgents(parentAgentId: string): Promise<OrchestratedAgent[]>;

  /** Get agents in a channel */
  getByChannel(channelId: string): Promise<OrchestratedAgent[]>;

  /** Save an agent */
  save(agent: OrchestratedAgent): Promise<void>;

  /** Update agent status */
  updateStatus(id: string, status: AgentStatus, currentTask?: string): Promise<void>;

  /** Update agent activity timestamp */
  touch(id: string): Promise<void>;

  /** Delete an agent */
  delete(id: string): Promise<boolean>;

  /** Get idle agents (older than specified ms) */
  getIdleAgents(idleThresholdMs: number): Promise<OrchestratedAgent[]>;

  /** Count active agents */
  countActive(): Promise<number>;

  /** Get agent metrics */
  getMetrics(agentId: string): Promise<AgentMetrics | null>;

  /** Update agent metrics */
  updateMetrics(agentId: string, metrics: Partial<AgentMetrics>): Promise<void>;
}

/**
 * In-memory agent store implementation
 */
export class InMemoryAgentStore implements AgentStore {
  private agents: Map<string, OrchestratedAgent> = new Map();
  private metrics: Map<string, AgentMetrics> = new Map();

  async initialize(): Promise<void> {
    // No initialization needed for memory store
  }

  async get(id: string): Promise<OrchestratedAgent | null> {
    return this.agents.get(id) || null;
  }

  async getAll(): Promise<OrchestratedAgent[]> {
    return Array.from(this.agents.values());
  }

  async getByStatus(status: AgentStatus): Promise<OrchestratedAgent[]> {
    return Array.from(this.agents.values()).filter(a => a.status === status);
  }

  async getByPersonaType(personaType: string): Promise<OrchestratedAgent[]> {
    return Array.from(this.agents.values()).filter(a => a.persona.type === personaType);
  }

  async getSubAgents(parentAgentId: string): Promise<OrchestratedAgent[]> {
    return Array.from(this.agents.values()).filter(a => a.parentAgentId === parentAgentId);
  }

  async getByChannel(channelId: string): Promise<OrchestratedAgent[]> {
    return Array.from(this.agents.values()).filter(a => a.channelId === channelId);
  }

  async save(agent: OrchestratedAgent): Promise<void> {
    this.agents.set(agent.id, { ...agent });

    // Initialize metrics if not exists
    if (!this.metrics.has(agent.id)) {
      this.metrics.set(agent.id, {
        agentId: agent.id,
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        messagesSent: 0,
        messagesReceived: 0,
        averageResponseTimeMs: 0,
        totalActiveTimeMs: 0,
        errors: 0,
      });
    }
  }

  async updateStatus(id: string, status: AgentStatus, currentTask?: string): Promise<void> {
    const agent = this.agents.get(id);
    if (agent) {
      agent.status = status;
      agent.currentTask = currentTask;
      agent.lastActiveAt = Date.now();
    }
  }

  async touch(id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (agent) {
      agent.lastActiveAt = Date.now();
    }
  }

  async delete(id: string): Promise<boolean> {
    const existed = this.agents.has(id);
    this.agents.delete(id);
    this.metrics.delete(id);
    return existed;
  }

  async getIdleAgents(idleThresholdMs: number): Promise<OrchestratedAgent[]> {
    const cutoff = Date.now() - idleThresholdMs;
    return Array.from(this.agents.values()).filter(
      a => a.status === 'idle' && a.lastActiveAt < cutoff
    );
  }

  async countActive(): Promise<number> {
    return Array.from(this.agents.values()).filter(
      a => a.status !== 'terminated'
    ).length;
  }

  async getMetrics(agentId: string): Promise<AgentMetrics | null> {
    return this.metrics.get(agentId) || null;
  }

  async updateMetrics(agentId: string, updates: Partial<AgentMetrics>): Promise<void> {
    const existing = this.metrics.get(agentId);
    if (existing) {
      this.metrics.set(agentId, { ...existing, ...updates });
    }
  }
}

/**
 * Database agent store implementation
 */
export class DatabaseAgentStore implements AgentStore {
  constructor(private db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS orchestration_agents (
        id TEXT PRIMARY KEY,
        persona_id TEXT NOT NULL,
        persona_data TEXT NOT NULL,
        status TEXT NOT NULL,
        current_task TEXT,
        channel_id TEXT,
        parent_agent_id TEXT,
        sub_agent_ids TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS orchestration_agent_metrics (
        agent_id TEXT PRIMARY KEY,
        total_tasks INTEGER NOT NULL DEFAULT 0,
        successful_tasks INTEGER NOT NULL DEFAULT 0,
        failed_tasks INTEGER NOT NULL DEFAULT 0,
        messages_sent INTEGER NOT NULL DEFAULT 0,
        messages_received INTEGER NOT NULL DEFAULT 0,
        average_response_time_ms REAL NOT NULL DEFAULT 0,
        total_active_time_ms INTEGER NOT NULL DEFAULT 0,
        errors INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (agent_id) REFERENCES orchestration_agents(id) ON DELETE CASCADE
      )
    `);

    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_orchestration_agents_status ON orchestration_agents(status)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_orchestration_agents_channel ON orchestration_agents(channel_id)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_orchestration_agents_parent ON orchestration_agents(parent_agent_id)`).catch(() => {});
  }

  private rowToAgent(row: Record<string, unknown>): OrchestratedAgent {
    return {
      id: row.id as string,
      personaId: row.persona_id as string,
      persona: JSON.parse(row.persona_data as string),
      status: row.status as AgentStatus,
      currentTask: row.current_task as string | undefined,
      channelId: row.channel_id as string | undefined,
      parentAgentId: row.parent_agent_id as string | undefined,
      subAgentIds: JSON.parse(row.sub_agent_ids as string),
      metadata: JSON.parse(row.metadata as string),
      createdAt: row.created_at as number,
      lastActiveAt: row.last_active_at as number,
    };
  }

  async get(id: string): Promise<OrchestratedAgent | null> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_agents WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.rowToAgent(result.rows[0]) : null;
  }

  async getAll(): Promise<OrchestratedAgent[]> {
    const result = await this.db.query<Record<string, unknown>>('SELECT * FROM orchestration_agents');
    return result.rows.map(row => this.rowToAgent(row));
  }

  async getByStatus(status: AgentStatus): Promise<OrchestratedAgent[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_agents WHERE status = ?',
      [status]
    );
    return result.rows.map(row => this.rowToAgent(row));
  }

  async getByPersonaType(personaType: string): Promise<OrchestratedAgent[]> {
    const result = await this.db.query<Record<string, unknown>>('SELECT * FROM orchestration_agents');
    return result.rows
      .map(row => this.rowToAgent(row))
      .filter(a => a.persona.type === personaType);
  }

  async getSubAgents(parentAgentId: string): Promise<OrchestratedAgent[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_agents WHERE parent_agent_id = ?',
      [parentAgentId]
    );
    return result.rows.map(row => this.rowToAgent(row));
  }

  async getByChannel(channelId: string): Promise<OrchestratedAgent[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_agents WHERE channel_id = ?',
      [channelId]
    );
    return result.rows.map(row => this.rowToAgent(row));
  }

  async save(agent: OrchestratedAgent): Promise<void> {
    await this.db.query(
      `INSERT OR REPLACE INTO orchestration_agents
       (id, persona_id, persona_data, status, current_task, channel_id, parent_agent_id, sub_agent_ids, metadata, created_at, last_active_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agent.id,
        agent.personaId,
        JSON.stringify(agent.persona),
        agent.status,
        agent.currentTask || null,
        agent.channelId || null,
        agent.parentAgentId || null,
        JSON.stringify(agent.subAgentIds),
        JSON.stringify(agent.metadata),
        agent.createdAt,
        agent.lastActiveAt,
      ]
    );

    // Ensure metrics row exists
    await this.db.query(
      `INSERT OR IGNORE INTO orchestration_agent_metrics (agent_id) VALUES (?)`,
      [agent.id]
    );
  }

  async updateStatus(id: string, status: AgentStatus, currentTask?: string): Promise<void> {
    await this.db.query(
      `UPDATE orchestration_agents SET status = ?, current_task = ?, last_active_at = ? WHERE id = ?`,
      [status, currentTask || null, Date.now(), id]
    );
  }

  async touch(id: string): Promise<void> {
    await this.db.query(
      `UPDATE orchestration_agents SET last_active_at = ? WHERE id = ?`,
      [Date.now(), id]
    );
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM orchestration_agents WHERE id = ?',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getIdleAgents(idleThresholdMs: number): Promise<OrchestratedAgent[]> {
    const cutoff = Date.now() - idleThresholdMs;
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM orchestration_agents WHERE status = 'idle' AND last_active_at < ?`,
      [cutoff]
    );
    return result.rows.map(row => this.rowToAgent(row));
  }

  async countActive(): Promise<number> {
    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM orchestration_agents WHERE status != 'terminated'`
    );
    return result.rows[0]?.count || 0;
  }

  async getMetrics(agentId: string): Promise<AgentMetrics | null> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_agent_metrics WHERE agent_id = ?',
      [agentId]
    );
    const row = result.rows[0];
    if (!row) return null;

    return {
      agentId: row.agent_id as string,
      totalTasks: row.total_tasks as number,
      successfulTasks: row.successful_tasks as number,
      failedTasks: row.failed_tasks as number,
      messagesSent: row.messages_sent as number,
      messagesReceived: row.messages_received as number,
      averageResponseTimeMs: row.average_response_time_ms as number,
      totalActiveTimeMs: row.total_active_time_ms as number,
      errors: row.errors as number,
    };
  }

  async updateMetrics(agentId: string, updates: Partial<AgentMetrics>): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (updates.totalTasks !== undefined) {
      setClauses.push('total_tasks = ?');
      values.push(updates.totalTasks);
    }
    if (updates.successfulTasks !== undefined) {
      setClauses.push('successful_tasks = ?');
      values.push(updates.successfulTasks);
    }
    if (updates.failedTasks !== undefined) {
      setClauses.push('failed_tasks = ?');
      values.push(updates.failedTasks);
    }
    if (updates.messagesSent !== undefined) {
      setClauses.push('messages_sent = ?');
      values.push(updates.messagesSent);
    }
    if (updates.messagesReceived !== undefined) {
      setClauses.push('messages_received = ?');
      values.push(updates.messagesReceived);
    }
    if (updates.averageResponseTimeMs !== undefined) {
      setClauses.push('average_response_time_ms = ?');
      values.push(updates.averageResponseTimeMs);
    }
    if (updates.totalActiveTimeMs !== undefined) {
      setClauses.push('total_active_time_ms = ?');
      values.push(updates.totalActiveTimeMs);
    }
    if (updates.errors !== undefined) {
      setClauses.push('errors = ?');
      values.push(updates.errors);
    }

    if (setClauses.length > 0) {
      values.push(agentId);
      await this.db.query(
        `UPDATE orchestration_agent_metrics SET ${setClauses.join(', ')} WHERE agent_id = ?`,
        values
      );
    }
  }
}

/**
 * Create an agent store based on type
 */
export function createAgentStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): AgentStore {
  if (type === 'database') {
    if (!dbAdapter) {
      throw new Error('Database adapter required for database store');
    }
    return new DatabaseAgentStore(dbAdapter);
  }
  return new InMemoryAgentStore();
}
