/**
 * Daily Reporter
 * Generates daily status reports for the orchestration system
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  DailyReport,
  AgentStatusReport,
  SystemHealth,
  ImprovementSuggestion,
} from '../types.js';
import type { LearningStore } from '../stores/learning-store.js';
import type { StatusCollector, StatusSnapshot } from './status-collector.js';
import { ORCHESTRATION_EVENTS } from '../events.js';

/**
 * Daily reporter configuration
 */
export interface DailyReporterConfig {
  /** Enable daily reports */
  enabled: boolean;
  /** Report generation hour (0-23) */
  reportHour: number;
  /** Time zone offset in hours */
  timezoneOffset: number;
  /** Report retention in days */
  retentionDays: number;
  /** Include recommendations */
  includeRecommendations: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_REPORTER_CONFIG: DailyReporterConfig = {
  enabled: true,
  reportHour: 8, // 8 AM
  timezoneOffset: 0,
  retentionDays: 30,
  includeRecommendations: true,
};

/**
 * Reporter events
 */
export interface DailyReporterEvents {
  'report:generated': (report: DailyReport) => void;
  'report:cleanup': (deletedCount: number) => void;
}

/**
 * Generates daily reports
 */
export class DailyReporter extends EventEmitter {
  private config: DailyReporterConfig;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private lastReportDate: string | null = null;

  constructor(
    private statusCollector: StatusCollector,
    private learningStore: LearningStore,
    config?: Partial<DailyReporterConfig>
  ) {
    super();
    this.config = { ...DEFAULT_REPORTER_CONFIG, ...config };
  }

  /**
   * Start the daily reporter
   */
  start(): void {
    if (this.checkInterval || !this.config.enabled) {
      return;
    }

    // Check every minute if it's time to generate report
    this.checkInterval = setInterval(
      () => this.checkAndGenerate(),
      60 * 1000
    );

    // Immediate check
    this.checkAndGenerate();
  }

  /**
   * Stop the daily reporter
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Check if it's time to generate and do so
   */
  private async checkAndGenerate(): Promise<void> {
    if (!this.isReportTime()) {
      return;
    }

    const today = this.getDateString();
    if (this.lastReportDate === today) {
      return; // Already generated today
    }

    await this.generateDailyReport();
    this.lastReportDate = today;

    // Cleanup old reports
    await this.cleanup();
  }

  /**
   * Check if it's time to generate the report
   */
  private isReportTime(): boolean {
    const now = new Date();
    const hour = (now.getUTCHours() + this.config.timezoneOffset + 24) % 24;
    const minute = now.getUTCMinutes();

    // Generate within the first 5 minutes of the report hour
    return hour === this.config.reportHour && minute < 5;
  }

  /**
   * Get date string for today
   */
  private getDateString(date: Date = new Date()): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Generate daily report
   */
  async generateDailyReport(date?: string): Promise<DailyReport> {
    const reportDate = date || this.getDateString();

    // Get data for the day
    const [
      agentReports,
      taskStats,
      overnightStats,
      improvements,
      systemHealth,
    ] = await Promise.all([
      this.collectAgentReports(),
      this.collectTaskStats(),
      this.collectOvernightStats(),
      this.collectImprovements(),
      this.determineSystemHealth(),
    ]);

    const recommendations = this.config.includeRecommendations
      ? this.generateRecommendations(agentReports, taskStats, systemHealth)
      : [];

    const report: DailyReport = {
      id: randomUUID(),
      date: reportDate,
      agentReports,
      totalTasksCompleted: taskStats.completed,
      totalTasksFailed: taskStats.failed,
      overnightTasksProcessed: overnightStats.processed,
      improvementsApplied: improvements.applied,
      systemHealth,
      recommendations,
      generatedAt: Date.now(),
    };

    // Save report
    await this.learningStore.saveReport(report);

    this.emit('report:generated', report);
    this.emit(ORCHESTRATION_EVENTS.DAILY_REPORT_GENERATED, {
      reportId: report.id,
      reportDate: report.date,
      totalAgents: report.agentReports.length,
      systemHealth: report.systemHealth,
      timestamp: Date.now(),
      source: 'daily-reporter',
    });

    return report;
  }

  /**
   * Get report by ID
   */
  async getReport(reportId: string): Promise<DailyReport | null> {
    return this.learningStore.getReport(reportId);
  }

  /**
   * Get report for a date
   */
  async getReportByDate(date: string): Promise<DailyReport | null> {
    return this.learningStore.getReportByDate(date);
  }

  /**
   * Get recent reports
   */
  async getRecentReports(days: number = 7): Promise<DailyReport[]> {
    return this.learningStore.getRecentReports(days);
  }

  /**
   * Cleanup old reports
   */
  async cleanup(): Promise<number> {
    const deleted = await this.learningStore.deleteOldReports(this.config.retentionDays);
    if (deleted > 0) {
      this.emit('report:cleanup', deleted);
    }
    return deleted;
  }

  /**
   * Collect agent reports from status collector
   */
  private async collectAgentReports(): Promise<AgentStatusReport[]> {
    const snapshot = this.statusCollector.getLatestSnapshot();
    return snapshot?.agentReports || [];
  }

  /**
   * Collect task statistics
   */
  private async collectTaskStats(): Promise<{ completed: number; failed: number }> {
    const snapshot = this.statusCollector.getLatestSnapshot();
    return {
      completed: snapshot?.taskSummary.completed || 0,
      failed: snapshot?.taskSummary.failed || 0,
    };
  }

  /**
   * Collect overnight processing statistics
   */
  private async collectOvernightStats(): Promise<{ processed: number }> {
    // This would integrate with the OvernightProcessor
    // For now, return placeholder
    return { processed: 0 };
  }

  /**
   * Collect improvements data
   */
  private async collectImprovements(): Promise<{ applied: number }> {
    const implemented = await this.learningStore.getImplementedImprovements();
    const recentlyApplied = implemented.filter(
      i => i.implementedAt && i.implementedAt > Date.now() - 24 * 60 * 60 * 1000
    );
    return { applied: recentlyApplied.length };
  }

  /**
   * Determine system health
   */
  private async determineSystemHealth(): Promise<SystemHealth> {
    return this.statusCollector.getSystemHealth();
  }

  /**
   * Generate recommendations based on data
   */
  private generateRecommendations(
    agentReports: AgentStatusReport[],
    taskStats: { completed: number; failed: number },
    health: SystemHealth
  ): string[] {
    const recommendations: string[] = [];

    // Check error rates
    const agentsWithHighErrors = agentReports.filter(
      a => a.errorCount > 5 || (a.tasksFailed > 0 && a.tasksFailed / (a.tasksCompleted + a.tasksFailed) > 0.2)
    );

    if (agentsWithHighErrors.length > 0) {
      recommendations.push(
        `${agentsWithHighErrors.length} agent(s) have elevated error rates. Consider reviewing their task assignments.`
      );
    }

    // Check task success rate
    const totalTasks = taskStats.completed + taskStats.failed;
    if (totalTasks > 0) {
      const successRate = taskStats.completed / totalTasks;
      if (successRate < 0.8) {
        recommendations.push(
          `Task success rate is ${(successRate * 100).toFixed(1)}%. Consider investigating common failure patterns.`
        );
      }
    }

    // Check for idle agents
    const idleAgents = agentReports.filter(a => a.status === 'idle' && a.uptime > 60 * 60 * 1000);
    if (idleAgents.length > 2) {
      recommendations.push(
        `${idleAgents.length} agents have been idle for over an hour. Consider terminating unused agents.`
      );
    }

    // Health-based recommendations
    if (health === 'degraded') {
      recommendations.push(
        'System health is degraded. Review error logs and consider reducing load.'
      );
    } else if (health === 'critical') {
      recommendations.push(
        'CRITICAL: System health is critical. Immediate attention required.'
      );
    }

    // Check for agents with no activity
    const inactiveAgents = agentReports.filter(
      a => a.tasksCompleted === 0 && a.messagesProcessed === 0 && a.uptime > 30 * 60 * 1000
    );
    if (inactiveAgents.length > 0) {
      recommendations.push(
        `${inactiveAgents.length} agent(s) have no recorded activity. Verify they are functioning correctly.`
      );
    }

    return recommendations;
  }

  /**
   * Generate comparison with previous day
   */
  async generateComparison(): Promise<{
    tasksDelta: number;
    errorsDelta: number;
    healthChange: string;
  } | null> {
    const today = this.getDateString();
    const yesterday = this.getDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));

    const [todayReport, yesterdayReport] = await Promise.all([
      this.learningStore.getReportByDate(today),
      this.learningStore.getReportByDate(yesterday),
    ]);

    if (!todayReport || !yesterdayReport) {
      return null;
    }

    return {
      tasksDelta: todayReport.totalTasksCompleted - yesterdayReport.totalTasksCompleted,
      errorsDelta: todayReport.totalTasksFailed - yesterdayReport.totalTasksFailed,
      healthChange:
        todayReport.systemHealth === yesterdayReport.systemHealth
          ? 'unchanged'
          : `${yesterdayReport.systemHealth} → ${todayReport.systemHealth}`,
    };
  }

  /**
   * Get weekly summary
   */
  async getWeeklySummary(): Promise<{
    totalTasks: number;
    totalErrors: number;
    avgAgents: number;
    healthTrend: SystemHealth[];
  }> {
    const reports = await this.getRecentReports(7);

    const summary = reports.reduce(
      (acc, r) => ({
        tasks: acc.tasks + r.totalTasksCompleted,
        errors: acc.errors + r.totalTasksFailed,
        agents: acc.agents + r.agentReports.length,
        health: [...acc.health, r.systemHealth],
      }),
      { tasks: 0, errors: 0, agents: 0, health: [] as SystemHealth[] }
    );

    return {
      totalTasks: summary.tasks,
      totalErrors: summary.errors,
      avgAgents: reports.length > 0 ? summary.agents / reports.length : 0,
      healthTrend: summary.health,
    };
  }
}

/**
 * Create a daily reporter
 */
export function createDailyReporter(
  statusCollector: StatusCollector,
  learningStore: LearningStore,
  config?: Partial<DailyReporterConfig>
): DailyReporter {
  return new DailyReporter(statusCollector, learningStore, config);
}
