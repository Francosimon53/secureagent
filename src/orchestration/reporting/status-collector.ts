/**
 * Status Collector
 * Collects status information from agents for reporting
 */

import { EventEmitter } from 'events';
import type {
  AgentStatusReport,
  OrchestratedAgent,
  AgentMetrics,
  OrchestrationMetrics,
  SystemHealth,
} from '../types.js';
import type { AgentStore } from '../stores/agent-store.js';
import type { TaskStore } from '../stores/task-store.js';
import type { SessionStore } from '../stores/session-store.js';
import type { LearningStore } from '../stores/learning-store.js';
import { ORCHESTRATION_EVENTS } from '../events.js';

/**
 * Status collector configuration
 */
export interface StatusCollectorConfig {
  /** Collection interval in minutes */
  collectionIntervalMinutes: number;
  /** Include detailed metrics */
  includeDetailedMetrics: boolean;
  /** Health thresholds */
  healthThresholds: {
    /** Error rate threshold for degraded status */
    degradedErrorRate: number;
    /** Error rate threshold for critical status */
    criticalErrorRate: number;
    /** Active agent threshold for healthy status */
    minActiveAgents: number;
  };
}

/**
 * Default configuration
 */
const DEFAULT_COLLECTOR_CONFIG: StatusCollectorConfig = {
  collectionIntervalMinutes: 5,
  includeDetailedMetrics: true,
  healthThresholds: {
    degradedErrorRate: 0.1,   // 10%
    criticalErrorRate: 0.3,   // 30%
    minActiveAgents: 0,
  },
};

/**
 * Status snapshot
 */
export interface StatusSnapshot {
  /** Snapshot timestamp */
  timestamp: number;
  /** Agent reports */
  agentReports: AgentStatusReport[];
  /** System metrics */
  systemMetrics: OrchestrationMetrics;
  /** Error summary */
  errorSummary: {
    totalErrors: number;
    recentErrors: number;
    unresolvedErrors: number;
    errorsByCategory: Record<string, number>;
  };
  /** Task summary */
  taskSummary: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    successRate: number;
  };
  /** Session summary */
  sessionSummary: {
    active: number;
    completed: number;
    failed: number;
  };
}

/**
 * Status collector events
 */
export interface StatusCollectorEvents {
  'status:collected': (snapshot: StatusSnapshot) => void;
  'health:changed': (previousHealth: SystemHealth, newHealth: SystemHealth) => void;
}

/**
 * Collects and aggregates status information
 */
export class StatusCollector extends EventEmitter {
  private config: StatusCollectorConfig;
  private collectionInterval: ReturnType<typeof setInterval> | null = null;
  private lastHealth: SystemHealth = 'healthy';
  private snapshots: StatusSnapshot[] = [];
  private maxSnapshots: number = 288; // 24 hours at 5-minute intervals

  constructor(
    private agentStore: AgentStore,
    private taskStore: TaskStore,
    private sessionStore: SessionStore,
    private learningStore: LearningStore,
    config?: Partial<StatusCollectorConfig>
  ) {
    super();
    this.config = { ...DEFAULT_COLLECTOR_CONFIG, ...config };
  }

  /**
   * Start collecting status
   */
  start(): void {
    if (this.collectionInterval) {
      return;
    }

    this.collectionInterval = setInterval(
      () => this.collect(),
      this.config.collectionIntervalMinutes * 60 * 1000
    );

    // Collect immediately
    this.collect();
  }

  /**
   * Stop collecting status
   */
  stop(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
  }

  /**
   * Collect status snapshot
   */
  async collect(): Promise<StatusSnapshot> {
    const [
      agentReports,
      systemMetrics,
      errorSummary,
      taskSummary,
      sessionSummary,
    ] = await Promise.all([
      this.collectAgentReports(),
      this.collectSystemMetrics(),
      this.collectErrorSummary(),
      this.collectTaskSummary(),
      this.collectSessionSummary(),
    ]);

    const snapshot: StatusSnapshot = {
      timestamp: Date.now(),
      agentReports,
      systemMetrics,
      errorSummary,
      taskSummary,
      sessionSummary,
    };

    // Store snapshot
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    // Check for health changes
    const newHealth = systemMetrics.systemHealth;
    if (newHealth !== this.lastHealth) {
      this.emit('health:changed', this.lastHealth, newHealth);
    }
    this.lastHealth = newHealth;

    this.emit('status:collected', snapshot);
    this.emit(ORCHESTRATION_EVENTS.STATUS_COLLECTED, {
      timestamp: snapshot.timestamp,
      agentCount: agentReports.length,
      systemHealth: systemMetrics.systemHealth,
      source: 'status-collector',
    });

    return snapshot;
  }

  /**
   * Get latest snapshot
   */
  getLatestSnapshot(): StatusSnapshot | null {
    return this.snapshots[this.snapshots.length - 1] || null;
  }

  /**
   * Get snapshots for time range
   */
  getSnapshots(startTime: number, endTime: number = Date.now()): StatusSnapshot[] {
    return this.snapshots.filter(s => s.timestamp >= startTime && s.timestamp <= endTime);
  }

  /**
   * Get current system health
   */
  getSystemHealth(): SystemHealth {
    return this.lastHealth;
  }

  /**
   * Collect agent reports
   */
  private async collectAgentReports(): Promise<AgentStatusReport[]> {
    const agents = await this.agentStore.getAll();
    const reports: AgentStatusReport[] = [];

    for (const agent of agents) {
      if (agent.status === 'terminated') {
        continue;
      }

      const metrics = await this.agentStore.getMetrics(agent.id);
      const report = this.createAgentReport(agent, metrics);
      reports.push(report);
    }

    return reports;
  }

  /**
   * Create agent report
   */
  private createAgentReport(
    agent: OrchestratedAgent,
    metrics: AgentMetrics | null
  ): AgentStatusReport {
    return {
      agentId: agent.id,
      personaName: agent.persona.name,
      status: agent.status,
      tasksCompleted: metrics?.successfulTasks ?? 0,
      tasksFailed: metrics?.failedTasks ?? 0,
      averageTaskDurationMs: metrics?.averageResponseTimeMs ?? 0,
      messagesProcessed: (metrics?.messagesSent ?? 0) + (metrics?.messagesReceived ?? 0),
      errorCount: metrics?.errors ?? 0,
      uptime: Date.now() - agent.createdAt,
      lastError: undefined, // Would need to track this in agent state
    };
  }

  /**
   * Collect system metrics
   */
  private async collectSystemMetrics(): Promise<OrchestrationMetrics> {
    const [
      agents,
      sessions,
      queuedTasks,
      runningTasks,
      recentErrors,
    ] = await Promise.all([
      this.agentStore.getAll(),
      this.sessionStore.getAllSessions(),
      this.taskStore.countByStatus('queued'),
      this.taskStore.countByStatus('running'),
      this.learningStore.getRecentErrors(24),
    ]);

    const activeAgents = agents.filter(a => a.status !== 'terminated').length;
    const activeSessions = sessions.filter(s => s.status === 'active').length;

    // Calculate error rate
    const totalOperations = agents.reduce((sum, a) => {
      // This is a simplification - would need proper metrics tracking
      return sum + 1;
    }, 0);
    const errorRate = totalOperations > 0 ? recentErrors.length / totalOperations : 0;

    // Determine system health
    const systemHealth = this.determineHealth(errorRate, activeAgents);

    return {
      activeAgents,
      activeSessions,
      queuedTasks,
      runningTasks,
      messagesToday: 0, // Would need proper tracking
      errorRate,
      systemHealth,
    };
  }

  /**
   * Determine system health based on metrics
   */
  private determineHealth(errorRate: number, activeAgents: number): SystemHealth {
    if (errorRate >= this.config.healthThresholds.criticalErrorRate) {
      return 'critical';
    }

    if (errorRate >= this.config.healthThresholds.degradedErrorRate) {
      return 'degraded';
    }

    if (activeAgents < this.config.healthThresholds.minActiveAgents) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Collect error summary
   */
  private async collectErrorSummary(): Promise<StatusSnapshot['errorSummary']> {
    const [recentErrors, unresolvedErrors] = await Promise.all([
      this.learningStore.getRecentErrors(24),
      this.learningStore.getUnresolvedErrors(),
    ]);

    const errorsByCategory: Record<string, number> = {};
    for (const error of recentErrors) {
      errorsByCategory[error.category] = (errorsByCategory[error.category] || 0) + 1;
    }

    return {
      totalErrors: recentErrors.length,
      recentErrors: recentErrors.filter(e => e.occurredAt > Date.now() - 60 * 60 * 1000).length,
      unresolvedErrors: unresolvedErrors.length,
      errorsByCategory,
    };
  }

  /**
   * Collect task summary
   */
  private async collectTaskSummary(): Promise<StatusSnapshot['taskSummary']> {
    const [queued, running, completed, failed] = await Promise.all([
      this.taskStore.countByStatus('queued'),
      this.taskStore.countByStatus('running'),
      this.taskStore.countByStatus('completed'),
      this.taskStore.countByStatus('failed'),
    ]);

    const total = completed + failed;
    const successRate = total > 0 ? completed / total : 1;

    return {
      queued,
      running,
      completed,
      failed,
      successRate,
    };
  }

  /**
   * Collect session summary
   */
  private async collectSessionSummary(): Promise<StatusSnapshot['sessionSummary']> {
    const sessions = await this.sessionStore.getAllSessions();

    return {
      active: sessions.filter(s => s.status === 'active').length,
      completed: sessions.filter(s => s.status === 'completed').length,
      failed: sessions.filter(s => s.status === 'failed').length,
    };
  }

  /**
   * Get agent report by ID
   */
  async getAgentReport(agentId: string): Promise<AgentStatusReport | null> {
    const agent = await this.agentStore.get(agentId);
    if (!agent) {
      return null;
    }

    const metrics = await this.agentStore.getMetrics(agentId);
    return this.createAgentReport(agent, metrics);
  }

  /**
   * Get trend data for a metric
   */
  getTrend(
    metric: 'activeAgents' | 'queuedTasks' | 'errorRate',
    hours: number = 24
  ): Array<{ timestamp: number; value: number }> {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const relevant = this.snapshots.filter(s => s.timestamp >= cutoff);

    return relevant.map(s => ({
      timestamp: s.timestamp,
      value: s.systemMetrics[metric],
    }));
  }

  /**
   * Get aggregated stats for time period
   */
  getAggregatedStats(startTime: number, endTime: number = Date.now()): {
    avgActiveAgents: number;
    avgErrorRate: number;
    totalTasksCompleted: number;
    totalTasksFailed: number;
    avgTaskSuccessRate: number;
  } {
    const snapshots = this.getSnapshots(startTime, endTime);

    if (snapshots.length === 0) {
      return {
        avgActiveAgents: 0,
        avgErrorRate: 0,
        totalTasksCompleted: 0,
        totalTasksFailed: 0,
        avgTaskSuccessRate: 0,
      };
    }

    const sum = snapshots.reduce(
      (acc, s) => ({
        activeAgents: acc.activeAgents + s.systemMetrics.activeAgents,
        errorRate: acc.errorRate + s.systemMetrics.errorRate,
        tasksCompleted: acc.tasksCompleted + s.taskSummary.completed,
        tasksFailed: acc.tasksFailed + s.taskSummary.failed,
        successRate: acc.successRate + s.taskSummary.successRate,
      }),
      { activeAgents: 0, errorRate: 0, tasksCompleted: 0, tasksFailed: 0, successRate: 0 }
    );

    return {
      avgActiveAgents: sum.activeAgents / snapshots.length,
      avgErrorRate: sum.errorRate / snapshots.length,
      totalTasksCompleted: sum.tasksCompleted,
      totalTasksFailed: sum.tasksFailed,
      avgTaskSuccessRate: sum.successRate / snapshots.length,
    };
  }
}

/**
 * Create a status collector
 */
export function createStatusCollector(
  agentStore: AgentStore,
  taskStore: TaskStore,
  sessionStore: SessionStore,
  learningStore: LearningStore,
  config?: Partial<StatusCollectorConfig>
): StatusCollector {
  return new StatusCollector(agentStore, taskStore, sessionStore, learningStore, config);
}
