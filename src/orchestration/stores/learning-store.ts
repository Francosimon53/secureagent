/**
 * Learning Store
 * Stores captured errors, learned patterns, and improvement suggestions
 */

import type {
  CapturedError,
  LearnedPattern,
  ImprovementSuggestion,
  ErrorCategory,
  ImprovementType,
  DailyReport,
} from '../types.js';
import type { DatabaseAdapter } from '../../persistence/index.js';

/**
 * Learning store interface
 */
export interface LearningStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  // Error operations
  /** Save a captured error */
  saveError(error: CapturedError): Promise<void>;

  /** Get an error by ID */
  getError(id: string): Promise<CapturedError | null>;

  /** Get errors by category */
  getErrorsByCategory(category: ErrorCategory): Promise<CapturedError[]>;

  /** Get errors by agent */
  getErrorsByAgent(agentId: string): Promise<CapturedError[]>;

  /** Get unresolved errors */
  getUnresolvedErrors(): Promise<CapturedError[]>;

  /** Get recent errors (last N hours) */
  getRecentErrors(hours: number): Promise<CapturedError[]>;

  /** Mark error as resolved */
  resolveError(id: string, resolution: string, preventionStrategy?: string): Promise<void>;

  /** Delete old errors */
  deleteOldErrors(olderThanMs: number): Promise<number>;

  // Pattern operations
  /** Save a learned pattern */
  savePattern(pattern: LearnedPattern): Promise<void>;

  /** Get a pattern by ID */
  getPattern(id: string): Promise<LearnedPattern | null>;

  /** Get patterns by category */
  getPatternsByCategory(category: string): Promise<LearnedPattern[]>;

  /** Get patterns above confidence threshold */
  getConfidentPatterns(minConfidence: number): Promise<LearnedPattern[]>;

  /** Get all patterns */
  getAllPatterns(): Promise<LearnedPattern[]>;

  /** Update pattern success/failure counts */
  updatePatternStats(id: string, success: boolean): Promise<void>;

  /** Update pattern confidence */
  updatePatternConfidence(id: string, confidence: number): Promise<void>;

  /** Delete a pattern */
  deletePattern(id: string): Promise<boolean>;

  // Improvement operations
  /** Save an improvement suggestion */
  saveImprovement(improvement: ImprovementSuggestion): Promise<void>;

  /** Get an improvement by ID */
  getImprovement(id: string): Promise<ImprovementSuggestion | null>;

  /** Get pending improvements */
  getPendingImprovements(): Promise<ImprovementSuggestion[]>;

  /** Get improvements by type */
  getImprovementsByType(type: ImprovementType): Promise<ImprovementSuggestion[]>;

  /** Get implemented improvements */
  getImplementedImprovements(): Promise<ImprovementSuggestion[]>;

  /** Mark improvement as implemented */
  markImplemented(id: string, measuredImpact?: number): Promise<void>;

  /** Delete an improvement */
  deleteImprovement(id: string): Promise<boolean>;

  // Report operations
  /** Save a daily report */
  saveReport(report: DailyReport): Promise<void>;

  /** Get a report by ID */
  getReport(id: string): Promise<DailyReport | null>;

  /** Get report for a date */
  getReportByDate(date: string): Promise<DailyReport | null>;

  /** Get recent reports */
  getRecentReports(days: number): Promise<DailyReport[]>;

  /** Delete old reports */
  deleteOldReports(olderThanDays: number): Promise<number>;
}

/**
 * In-memory learning store implementation
 */
export class InMemoryLearningStore implements LearningStore {
  private errors: Map<string, CapturedError> = new Map();
  private patterns: Map<string, LearnedPattern> = new Map();
  private improvements: Map<string, ImprovementSuggestion> = new Map();
  private reports: Map<string, DailyReport> = new Map();

  async initialize(): Promise<void> {
    // No initialization needed
  }

  // Error operations
  async saveError(error: CapturedError): Promise<void> {
    this.errors.set(error.id, { ...error });
  }

  async getError(id: string): Promise<CapturedError | null> {
    return this.errors.get(id) || null;
  }

  async getErrorsByCategory(category: ErrorCategory): Promise<CapturedError[]> {
    return Array.from(this.errors.values()).filter(e => e.category === category);
  }

  async getErrorsByAgent(agentId: string): Promise<CapturedError[]> {
    return Array.from(this.errors.values()).filter(e => e.agentId === agentId);
  }

  async getUnresolvedErrors(): Promise<CapturedError[]> {
    return Array.from(this.errors.values()).filter(e => !e.resolvedAt);
  }

  async getRecentErrors(hours: number): Promise<CapturedError[]> {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return Array.from(this.errors.values()).filter(e => e.occurredAt > cutoff);
  }

  async resolveError(id: string, resolution: string, preventionStrategy?: string): Promise<void> {
    const error = this.errors.get(id);
    if (error) {
      error.resolution = resolution;
      error.preventionStrategy = preventionStrategy;
      error.resolvedAt = Date.now();
    }
  }

  async deleteOldErrors(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let count = 0;
    for (const [id, error] of this.errors) {
      if (error.occurredAt < cutoff) {
        this.errors.delete(id);
        count++;
      }
    }
    return count;
  }

  // Pattern operations
  async savePattern(pattern: LearnedPattern): Promise<void> {
    this.patterns.set(pattern.id, { ...pattern });
  }

  async getPattern(id: string): Promise<LearnedPattern | null> {
    return this.patterns.get(id) || null;
  }

  async getPatternsByCategory(category: string): Promise<LearnedPattern[]> {
    return Array.from(this.patterns.values()).filter(p => p.category === category);
  }

  async getConfidentPatterns(minConfidence: number): Promise<LearnedPattern[]> {
    return Array.from(this.patterns.values()).filter(p => p.confidence >= minConfidence);
  }

  async getAllPatterns(): Promise<LearnedPattern[]> {
    return Array.from(this.patterns.values());
  }

  async updatePatternStats(id: string, success: boolean): Promise<void> {
    const pattern = this.patterns.get(id);
    if (pattern) {
      if (success) {
        pattern.successCount++;
      } else {
        pattern.failureCount++;
      }
      pattern.lastUsedAt = Date.now();

      // Recalculate confidence
      const total = pattern.successCount + pattern.failureCount;
      pattern.confidence = total > 0 ? pattern.successCount / total : 0;
    }
  }

  async updatePatternConfidence(id: string, confidence: number): Promise<void> {
    const pattern = this.patterns.get(id);
    if (pattern) {
      pattern.confidence = Math.min(1, Math.max(0, confidence));
    }
  }

  async deletePattern(id: string): Promise<boolean> {
    return this.patterns.delete(id);
  }

  // Improvement operations
  async saveImprovement(improvement: ImprovementSuggestion): Promise<void> {
    this.improvements.set(improvement.id, { ...improvement });
  }

  async getImprovement(id: string): Promise<ImprovementSuggestion | null> {
    return this.improvements.get(id) || null;
  }

  async getPendingImprovements(): Promise<ImprovementSuggestion[]> {
    return Array.from(this.improvements.values()).filter(i => !i.implemented);
  }

  async getImprovementsByType(type: ImprovementType): Promise<ImprovementSuggestion[]> {
    return Array.from(this.improvements.values()).filter(i => i.type === type);
  }

  async getImplementedImprovements(): Promise<ImprovementSuggestion[]> {
    return Array.from(this.improvements.values()).filter(i => i.implemented);
  }

  async markImplemented(id: string, measuredImpact?: number): Promise<void> {
    const improvement = this.improvements.get(id);
    if (improvement) {
      improvement.implemented = true;
      improvement.implementedAt = Date.now();
      if (measuredImpact !== undefined) {
        improvement.measuredImpact = measuredImpact;
      }
    }
  }

  async deleteImprovement(id: string): Promise<boolean> {
    return this.improvements.delete(id);
  }

  // Report operations
  async saveReport(report: DailyReport): Promise<void> {
    this.reports.set(report.id, { ...report });
  }

  async getReport(id: string): Promise<DailyReport | null> {
    return this.reports.get(id) || null;
  }

  async getReportByDate(date: string): Promise<DailyReport | null> {
    return Array.from(this.reports.values()).find(r => r.date === date) || null;
  }

  async getRecentReports(days: number): Promise<DailyReport[]> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return Array.from(this.reports.values())
      .filter(r => r.generatedAt > cutoff)
      .sort((a, b) => b.generatedAt - a.generatedAt);
  }

  async deleteOldReports(olderThanDays: number): Promise<number> {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let count = 0;
    for (const [id, report] of this.reports) {
      if (report.generatedAt < cutoff) {
        this.reports.delete(id);
        count++;
      }
    }
    return count;
  }
}

/**
 * Database learning store implementation
 */
export class DatabaseLearningStore implements LearningStore {
  constructor(private db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS orchestration_errors (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        task_id TEXT,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        stack TEXT,
        context TEXT NOT NULL DEFAULT '{}',
        resolution TEXT,
        prevention_strategy TEXT,
        occurred_at INTEGER NOT NULL,
        resolved_at INTEGER
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS orchestration_patterns (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        pattern TEXT NOT NULL,
        solution TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS orchestration_improvements (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        expected_impact TEXT NOT NULL,
        based_on_patterns TEXT NOT NULL DEFAULT '[]',
        implemented INTEGER NOT NULL DEFAULT 0,
        implemented_at INTEGER,
        measured_impact REAL
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS orchestration_reports (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        agent_reports TEXT NOT NULL DEFAULT '[]',
        total_tasks_completed INTEGER NOT NULL DEFAULT 0,
        total_tasks_failed INTEGER NOT NULL DEFAULT 0,
        overnight_tasks_processed INTEGER NOT NULL DEFAULT 0,
        improvements_applied INTEGER NOT NULL DEFAULT 0,
        system_health TEXT NOT NULL,
        recommendations TEXT NOT NULL DEFAULT '[]',
        generated_at INTEGER NOT NULL
      )
    `);

    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_orchestration_errors_category ON orchestration_errors(category)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_orchestration_errors_agent ON orchestration_errors(agent_id)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_orchestration_patterns_category ON orchestration_patterns(category)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_orchestration_reports_date ON orchestration_reports(date)`).catch(() => {});
  }

  // Error operations
  async saveError(error: CapturedError): Promise<void> {
    await this.db.query(
      `INSERT OR REPLACE INTO orchestration_errors
       (id, agent_id, task_id, category, message, stack, context, resolution, prevention_strategy, occurred_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        error.id,
        error.agentId,
        error.taskId || null,
        error.category,
        error.message,
        error.stack || null,
        JSON.stringify(error.context),
        error.resolution || null,
        error.preventionStrategy || null,
        error.occurredAt,
        error.resolvedAt || null,
      ]
    );
  }

  private rowToError(row: Record<string, unknown>): CapturedError {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      taskId: row.task_id as string | undefined,
      category: row.category as ErrorCategory,
      message: row.message as string,
      stack: row.stack as string | undefined,
      context: JSON.parse(row.context as string),
      resolution: row.resolution as string | undefined,
      preventionStrategy: row.prevention_strategy as string | undefined,
      occurredAt: row.occurred_at as number,
      resolvedAt: row.resolved_at as number | undefined,
    };
  }

  async getError(id: string): Promise<CapturedError | null> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_errors WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.rowToError(result.rows[0]) : null;
  }

  async getErrorsByCategory(category: ErrorCategory): Promise<CapturedError[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_errors WHERE category = ?',
      [category]
    );
    return result.rows.map(row => this.rowToError(row));
  }

  async getErrorsByAgent(agentId: string): Promise<CapturedError[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_errors WHERE agent_id = ?',
      [agentId]
    );
    return result.rows.map(row => this.rowToError(row));
  }

  async getUnresolvedErrors(): Promise<CapturedError[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_errors WHERE resolved_at IS NULL'
    );
    return result.rows.map(row => this.rowToError(row));
  }

  async getRecentErrors(hours: number): Promise<CapturedError[]> {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_errors WHERE occurred_at > ?',
      [cutoff]
    );
    return result.rows.map(row => this.rowToError(row));
  }

  async resolveError(id: string, resolution: string, preventionStrategy?: string): Promise<void> {
    await this.db.query(
      'UPDATE orchestration_errors SET resolution = ?, prevention_strategy = ?, resolved_at = ? WHERE id = ?',
      [resolution, preventionStrategy || null, Date.now(), id]
    );
  }

  async deleteOldErrors(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    const result = await this.db.query(
      'DELETE FROM orchestration_errors WHERE occurred_at < ?',
      [cutoff]
    );
    return result.rowCount ?? 0;
  }

  // Pattern operations
  private rowToPattern(row: Record<string, unknown>): LearnedPattern {
    return {
      id: row.id as string,
      category: row.category as string,
      pattern: row.pattern as string,
      solution: row.solution as string,
      confidence: row.confidence as number,
      successCount: row.success_count as number,
      failureCount: row.failure_count as number,
      createdAt: row.created_at as number,
      lastUsedAt: row.last_used_at as number,
    };
  }

  async savePattern(pattern: LearnedPattern): Promise<void> {
    await this.db.query(
      `INSERT OR REPLACE INTO orchestration_patterns
       (id, category, pattern, solution, confidence, success_count, failure_count, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pattern.id,
        pattern.category,
        pattern.pattern,
        pattern.solution,
        pattern.confidence,
        pattern.successCount,
        pattern.failureCount,
        pattern.createdAt,
        pattern.lastUsedAt,
      ]
    );
  }

  async getPattern(id: string): Promise<LearnedPattern | null> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_patterns WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.rowToPattern(result.rows[0]) : null;
  }

  async getPatternsByCategory(category: string): Promise<LearnedPattern[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_patterns WHERE category = ?',
      [category]
    );
    return result.rows.map(row => this.rowToPattern(row));
  }

  async getConfidentPatterns(minConfidence: number): Promise<LearnedPattern[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_patterns WHERE confidence >= ?',
      [minConfidence]
    );
    return result.rows.map(row => this.rowToPattern(row));
  }

  async getAllPatterns(): Promise<LearnedPattern[]> {
    const result = await this.db.query<Record<string, unknown>>('SELECT * FROM orchestration_patterns');
    return result.rows.map(row => this.rowToPattern(row));
  }

  async updatePatternStats(id: string, success: boolean): Promise<void> {
    const pattern = await this.getPattern(id);
    if (pattern) {
      const successCount = success ? pattern.successCount + 1 : pattern.successCount;
      const failureCount = success ? pattern.failureCount : pattern.failureCount + 1;
      const total = successCount + failureCount;
      const confidence = total > 0 ? successCount / total : 0;

      await this.db.query(
        `UPDATE orchestration_patterns
         SET success_count = ?, failure_count = ?, confidence = ?, last_used_at = ?
         WHERE id = ?`,
        [successCount, failureCount, confidence, Date.now(), id]
      );
    }
  }

  async updatePatternConfidence(id: string, confidence: number): Promise<void> {
    await this.db.query(
      'UPDATE orchestration_patterns SET confidence = ? WHERE id = ?',
      [Math.min(1, Math.max(0, confidence)), id]
    );
  }

  async deletePattern(id: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM orchestration_patterns WHERE id = ?',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Improvement operations
  private rowToImprovement(row: Record<string, unknown>): ImprovementSuggestion {
    return {
      id: row.id as string,
      type: row.type as ImprovementType,
      description: row.description as string,
      expectedImpact: row.expected_impact as ImprovementSuggestion['expectedImpact'],
      basedOnPatterns: JSON.parse(row.based_on_patterns as string),
      implemented: Boolean(row.implemented),
      implementedAt: row.implemented_at as number | undefined,
      measuredImpact: row.measured_impact as number | undefined,
    };
  }

  async saveImprovement(improvement: ImprovementSuggestion): Promise<void> {
    await this.db.query(
      `INSERT OR REPLACE INTO orchestration_improvements
       (id, type, description, expected_impact, based_on_patterns, implemented, implemented_at, measured_impact)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        improvement.id,
        improvement.type,
        improvement.description,
        improvement.expectedImpact,
        JSON.stringify(improvement.basedOnPatterns),
        improvement.implemented ? 1 : 0,
        improvement.implementedAt || null,
        improvement.measuredImpact || null,
      ]
    );
  }

  async getImprovement(id: string): Promise<ImprovementSuggestion | null> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_improvements WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.rowToImprovement(result.rows[0]) : null;
  }

  async getPendingImprovements(): Promise<ImprovementSuggestion[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_improvements WHERE implemented = 0'
    );
    return result.rows.map(row => this.rowToImprovement(row));
  }

  async getImprovementsByType(type: ImprovementType): Promise<ImprovementSuggestion[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_improvements WHERE type = ?',
      [type]
    );
    return result.rows.map(row => this.rowToImprovement(row));
  }

  async getImplementedImprovements(): Promise<ImprovementSuggestion[]> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_improvements WHERE implemented = 1'
    );
    return result.rows.map(row => this.rowToImprovement(row));
  }

  async markImplemented(id: string, measuredImpact?: number): Promise<void> {
    await this.db.query(
      'UPDATE orchestration_improvements SET implemented = 1, implemented_at = ?, measured_impact = ? WHERE id = ?',
      [Date.now(), measuredImpact || null, id]
    );
  }

  async deleteImprovement(id: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM orchestration_improvements WHERE id = ?',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Report operations
  private rowToReport(row: Record<string, unknown>): DailyReport {
    return {
      id: row.id as string,
      date: row.date as string,
      agentReports: JSON.parse(row.agent_reports as string),
      totalTasksCompleted: row.total_tasks_completed as number,
      totalTasksFailed: row.total_tasks_failed as number,
      overnightTasksProcessed: row.overnight_tasks_processed as number,
      improvementsApplied: row.improvements_applied as number,
      systemHealth: row.system_health as DailyReport['systemHealth'],
      recommendations: JSON.parse(row.recommendations as string),
      generatedAt: row.generated_at as number,
    };
  }

  async saveReport(report: DailyReport): Promise<void> {
    await this.db.query(
      `INSERT OR REPLACE INTO orchestration_reports
       (id, date, agent_reports, total_tasks_completed, total_tasks_failed, overnight_tasks_processed,
        improvements_applied, system_health, recommendations, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        report.id,
        report.date,
        JSON.stringify(report.agentReports),
        report.totalTasksCompleted,
        report.totalTasksFailed,
        report.overnightTasksProcessed,
        report.improvementsApplied,
        report.systemHealth,
        JSON.stringify(report.recommendations),
        report.generatedAt,
      ]
    );
  }

  async getReport(id: string): Promise<DailyReport | null> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_reports WHERE id = ?',
      [id]
    );
    return result.rows[0] ? this.rowToReport(result.rows[0]) : null;
  }

  async getReportByDate(date: string): Promise<DailyReport | null> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_reports WHERE date = ?',
      [date]
    );
    return result.rows[0] ? this.rowToReport(result.rows[0]) : null;
  }

  async getRecentReports(days: number): Promise<DailyReport[]> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orchestration_reports WHERE generated_at > ? ORDER BY generated_at DESC',
      [cutoff]
    );
    return result.rows.map(row => this.rowToReport(row));
  }

  async deleteOldReports(olderThanDays: number): Promise<number> {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const result = await this.db.query(
      'DELETE FROM orchestration_reports WHERE generated_at < ?',
      [cutoff]
    );
    return result.rowCount ?? 0;
  }
}

/**
 * Create a learning store based on type
 */
export function createLearningStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): LearningStore {
  if (type === 'database') {
    if (!dbAdapter) {
      throw new Error('Database adapter required for database store');
    }
    return new DatabaseLearningStore(dbAdapter);
  }
  return new InMemoryLearningStore();
}
