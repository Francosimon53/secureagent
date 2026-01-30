/**
 * Cron Scheduler
 *
 * POSIX cron expression parsing and job scheduling
 */

import { randomUUID } from 'crypto';
import type {
  CronSchedule,
  CronScheduleInput,
  ParsedCronExpression,
  CronJobResult,
} from './types.js';
import { MemoryError } from './types.js';
import { CRON_DEFAULTS, MEMORY_EVENTS, TABLE_NAMES } from './constants.js';

// =============================================================================
// Database Adapter Interface
// =============================================================================

export interface DatabaseAdapter {
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

// =============================================================================
// Cron Schedule Store Interface
// =============================================================================

export interface CronScheduleStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Create a new schedule */
  create(input: CronScheduleInput): Promise<CronSchedule>;

  /** Get schedule by ID */
  get(id: string): Promise<CronSchedule | null>;

  /** Get schedules for a user */
  getByUserId(userId: string): Promise<CronSchedule[]>;

  /** Get schedules due for execution */
  getDueSchedules(now: number): Promise<CronSchedule[]>;

  /** Update schedule */
  update(id: string, updates: Partial<CronSchedule>): Promise<CronSchedule | null>;

  /** Delete schedule */
  delete(id: string): Promise<boolean>;

  /** Record job execution */
  recordExecution(result: CronJobResult): Promise<void>;

  /** Get execution history */
  getHistory(scheduleId: string, limit?: number): Promise<CronJobResult[]>;
}

// =============================================================================
// Cron Expression Parser
// =============================================================================

export class CronParser {
  /**
   * Parse a POSIX cron expression
   * Format: minute hour day-of-month month day-of-week
   */
  static parse(expression: string): ParsedCronExpression {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new MemoryError('SCHEDULE_INVALID', `Invalid cron expression: expected 5 parts, got ${parts.length}`);
    }

    return {
      minute: this.parseField(parts[0], 0, 59),
      hour: this.parseField(parts[1], 0, 23),
      dayOfMonth: this.parseField(parts[2], 1, 31),
      month: this.parseField(parts[3], 1, 12),
      dayOfWeek: this.parseField(parts[4], 0, 6),
    };
  }

  /**
   * Parse a single cron field
   */
  private static parseField(field: string, min: number, max: number): number[] {
    const values: Set<number> = new Set();

    // Handle list (comma-separated)
    const parts = field.split(',');

    for (const part of parts) {
      // Handle step values (*/n or n-m/s)
      if (part.includes('/')) {
        const [range, stepStr] = part.split('/');
        const step = parseInt(stepStr, 10);
        if (isNaN(step) || step < 1) {
          throw new MemoryError('SCHEDULE_INVALID', `Invalid step value: ${stepStr}`);
        }

        const [start, end] = this.parseRange(range, min, max);
        for (let i = start; i <= end; i += step) {
          values.add(i);
        }
      }
      // Handle range (n-m)
      else if (part.includes('-')) {
        const [start, end] = this.parseRange(part, min, max);
        for (let i = start; i <= end; i++) {
          values.add(i);
        }
      }
      // Handle wildcard (*)
      else if (part === '*') {
        for (let i = min; i <= max; i++) {
          values.add(i);
        }
      }
      // Handle single value
      else {
        const value = parseInt(part, 10);
        if (isNaN(value) || value < min || value > max) {
          throw new MemoryError('SCHEDULE_INVALID', `Invalid value: ${part} (expected ${min}-${max})`);
        }
        values.add(value);
      }
    }

    return Array.from(values).sort((a, b) => a - b);
  }

  /**
   * Parse a range expression
   */
  private static parseRange(range: string, min: number, max: number): [number, number] {
    if (range === '*') {
      return [min, max];
    }

    const parts = range.split('-');
    if (parts.length === 1) {
      const value = parseInt(parts[0], 10);
      return [value, value];
    }

    const start = parseInt(parts[0], 10);
    const end = parseInt(parts[1], 10);

    if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) {
      throw new MemoryError('SCHEDULE_INVALID', `Invalid range: ${range}`);
    }

    return [start, end];
  }

  /**
   * Calculate the next run time from a parsed expression
   */
  static getNextRunTime(parsed: ParsedCronExpression, from: Date = new Date(), timezone: string = 'UTC'): Date {
    // Convert to timezone-aware date
    const date = new Date(from);

    // Start from the next minute
    date.setSeconds(0, 0);
    date.setMinutes(date.getMinutes() + 1);

    // Find the next matching time (max 1 year search)
    const maxIterations = 366 * 24 * 60;
    for (let i = 0; i < maxIterations; i++) {
      const minute = date.getMinutes();
      const hour = date.getHours();
      const dayOfMonth = date.getDate();
      const month = date.getMonth() + 1;
      const dayOfWeek = date.getDay();

      if (
        parsed.minute.includes(minute) &&
        parsed.hour.includes(hour) &&
        parsed.dayOfMonth.includes(dayOfMonth) &&
        parsed.month.includes(month) &&
        parsed.dayOfWeek.includes(dayOfWeek)
      ) {
        return date;
      }

      // Advance by one minute
      date.setMinutes(date.getMinutes() + 1);
    }

    throw new MemoryError('SCHEDULE_INVALID', 'Could not find next run time within one year');
  }

  /**
   * Get all run times between two dates
   */
  static getRunTimesBetween(
    parsed: ParsedCronExpression,
    from: Date,
    to: Date,
    timezone: string = 'UTC'
  ): Date[] {
    const times: Date[] = [];
    let current = new Date(from);

    while (current < to) {
      const next = this.getNextRunTime(parsed, current, timezone);
      if (next >= to) break;
      times.push(next);
      current = new Date(next.getTime() + 60000);
    }

    return times;
  }

  /**
   * Validate a cron expression
   */
  static validate(expression: string): { valid: boolean; error?: string } {
    try {
      this.parse(expression);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid cron expression',
      };
    }
  }

  /**
   * Convert to human-readable description
   */
  static describe(expression: string): string {
    const parsed = this.parse(expression);

    const parts: string[] = [];

    // Describe minute
    if (parsed.minute.length === 60) {
      parts.push('every minute');
    } else if (parsed.minute.length === 1) {
      parts.push(`at minute ${parsed.minute[0]}`);
    } else {
      parts.push(`at minutes ${parsed.minute.join(', ')}`);
    }

    // Describe hour
    if (parsed.hour.length === 24) {
      parts.push('of every hour');
    } else if (parsed.hour.length === 1) {
      parts.push(`past hour ${parsed.hour[0]}`);
    } else {
      parts.push(`past hours ${parsed.hour.join(', ')}`);
    }

    // Describe day
    const everyDay = parsed.dayOfMonth.length === 31 && parsed.dayOfWeek.length === 7;
    if (!everyDay) {
      if (parsed.dayOfMonth.length < 31) {
        parts.push(`on day ${parsed.dayOfMonth.join(', ')} of the month`);
      }
      if (parsed.dayOfWeek.length < 7) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        parts.push(`on ${parsed.dayOfWeek.map(d => days[d]).join(', ')}`);
      }
    }

    // Describe month
    if (parsed.month.length < 12) {
      const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      parts.push(`in ${parsed.month.map(m => months[m]).join(', ')}`);
    }

    return parts.join(' ');
  }
}

// =============================================================================
// Database Row Types
// =============================================================================

interface ScheduleRow {
  id: string;
  user_id: string;
  name: string;
  expression: string;
  timezone: string;
  enabled: number;
  handler: string;
  payload: string | null;
  last_run_at: number | null;
  next_run_at: number | null;
  run_count: number;
  max_runs: number | null;
  created_at: number;
  updated_at: number;
}

interface HistoryRow {
  id: string;
  schedule_id: string;
  executed_at: number;
  success: number;
  result: string | null;
  error: string | null;
  duration: number;
}

// =============================================================================
// Database Schedule Store
// =============================================================================

export class DatabaseCronScheduleStore implements CronScheduleStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.CRON_SCHEDULES} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        expression TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        enabled INTEGER NOT NULL DEFAULT 1,
        handler TEXT NOT NULL,
        payload TEXT,
        last_run_at INTEGER,
        next_run_at INTEGER,
        run_count INTEGER NOT NULL DEFAULT 0,
        max_runs INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.CRON_HISTORY} (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL,
        executed_at INTEGER NOT NULL,
        success INTEGER NOT NULL,
        result TEXT,
        error TEXT,
        duration INTEGER NOT NULL,
        FOREIGN KEY (schedule_id) REFERENCES ${TABLE_NAMES.CRON_SCHEDULES}(id)
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_cron_schedules_user ON ${TABLE_NAMES.CRON_SCHEDULES}(user_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_cron_schedules_next_run ON ${TABLE_NAMES.CRON_SCHEDULES}(next_run_at)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_cron_history_schedule ON ${TABLE_NAMES.CRON_HISTORY}(schedule_id)
    `);
  }

  async create(input: CronScheduleInput): Promise<CronSchedule> {
    const now = Date.now();
    const id = randomUUID();
    const timezone = input.timezone ?? CRON_DEFAULTS.DEFAULT_TIMEZONE;

    // Parse and validate expression
    const parsed = CronParser.parse(input.expression);
    const nextRunAt = CronParser.getNextRunTime(parsed, new Date(), timezone).getTime();

    const schedule: CronSchedule = {
      id,
      userId: input.userId,
      name: input.name,
      expression: input.expression,
      timezone,
      enabled: true,
      handler: input.handler,
      payload: input.payload,
      nextRunAt,
      runCount: 0,
      maxRuns: input.maxRuns,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO ${TABLE_NAMES.CRON_SCHEDULES} (
        id, user_id, name, expression, timezone, enabled, handler, payload,
        next_run_at, run_count, max_runs, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        schedule.id,
        schedule.userId,
        schedule.name,
        schedule.expression,
        schedule.timezone,
        1,
        schedule.handler,
        schedule.payload ? JSON.stringify(schedule.payload) : null,
        schedule.nextRunAt,
        schedule.runCount,
        schedule.maxRuns ?? null,
        schedule.createdAt,
        schedule.updatedAt,
      ]
    );

    return schedule;
  }

  async get(id: string): Promise<CronSchedule | null> {
    const result = await this.db.execute<ScheduleRow>(
      `SELECT * FROM ${TABLE_NAMES.CRON_SCHEDULES} WHERE id = ?`,
      [id]
    );
    return result.length > 0 ? this.rowToSchedule(result[0]) : null;
  }

  async getByUserId(userId: string): Promise<CronSchedule[]> {
    const result = await this.db.execute<ScheduleRow>(
      `SELECT * FROM ${TABLE_NAMES.CRON_SCHEDULES} WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
    return result.map(row => this.rowToSchedule(row));
  }

  async getDueSchedules(now: number): Promise<CronSchedule[]> {
    const result = await this.db.execute<ScheduleRow>(
      `SELECT * FROM ${TABLE_NAMES.CRON_SCHEDULES}
       WHERE enabled = 1 AND next_run_at <= ? AND (max_runs IS NULL OR run_count < max_runs)`,
      [now]
    );
    return result.map(row => this.rowToSchedule(row));
  }

  async update(id: string, updates: Partial<CronSchedule>): Promise<CronSchedule | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, updatedAt: Date.now() };

    // Recalculate next run time if expression changed
    if (updates.expression) {
      const parsed = CronParser.parse(updates.expression);
      updated.nextRunAt = CronParser.getNextRunTime(parsed, new Date(), updated.timezone).getTime();
    }

    await this.db.execute(
      `UPDATE ${TABLE_NAMES.CRON_SCHEDULES} SET
        name = ?, expression = ?, timezone = ?, enabled = ?, handler = ?,
        payload = ?, last_run_at = ?, next_run_at = ?, run_count = ?,
        max_runs = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.expression,
        updated.timezone,
        updated.enabled ? 1 : 0,
        updated.handler,
        updated.payload ? JSON.stringify(updated.payload) : null,
        updated.lastRunAt ?? null,
        updated.nextRunAt ?? null,
        updated.runCount,
        updated.maxRuns ?? null,
        updated.updatedAt,
        id,
      ]
    );

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    await this.db.execute(
      `DELETE FROM ${TABLE_NAMES.CRON_HISTORY} WHERE schedule_id = ?`,
      [id]
    );
    const result = await this.db.execute(
      `DELETE FROM ${TABLE_NAMES.CRON_SCHEDULES} WHERE id = ?`,
      [id]
    );
    return (result as unknown as { changes: number }).changes > 0;
  }

  async recordExecution(result: CronJobResult): Promise<void> {
    await this.db.execute(
      `INSERT INTO ${TABLE_NAMES.CRON_HISTORY} (
        id, schedule_id, executed_at, success, result, error, duration
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        result.scheduleId,
        result.executedAt,
        result.success ? 1 : 0,
        result.result ? JSON.stringify(result.result) : null,
        result.error ?? null,
        result.duration,
      ]
    );
  }

  async getHistory(scheduleId: string, limit: number = 100): Promise<CronJobResult[]> {
    const result = await this.db.execute<HistoryRow>(
      `SELECT * FROM ${TABLE_NAMES.CRON_HISTORY} WHERE schedule_id = ? ORDER BY executed_at DESC LIMIT ?`,
      [scheduleId, limit]
    );
    return result.map(row => ({
      scheduleId: row.schedule_id,
      executedAt: row.executed_at,
      success: row.success === 1,
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error ?? undefined,
      duration: row.duration,
    }));
  }

  private rowToSchedule(row: ScheduleRow): CronSchedule {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      expression: row.expression,
      timezone: row.timezone,
      enabled: row.enabled === 1,
      handler: row.handler,
      payload: row.payload ? JSON.parse(row.payload) : undefined,
      lastRunAt: row.last_run_at ?? undefined,
      nextRunAt: row.next_run_at ?? undefined,
      runCount: row.run_count,
      maxRuns: row.max_runs ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// =============================================================================
// In-Memory Schedule Store
// =============================================================================

export class InMemoryCronScheduleStore implements CronScheduleStore {
  private schedules = new Map<string, CronSchedule>();
  private history = new Map<string, CronJobResult[]>();

  async initialize(): Promise<void> {
    // No-op
  }

  async create(input: CronScheduleInput): Promise<CronSchedule> {
    const now = Date.now();
    const id = randomUUID();
    const timezone = input.timezone ?? CRON_DEFAULTS.DEFAULT_TIMEZONE;

    const parsed = CronParser.parse(input.expression);
    const nextRunAt = CronParser.getNextRunTime(parsed, new Date(), timezone).getTime();

    const schedule: CronSchedule = {
      id,
      userId: input.userId,
      name: input.name,
      expression: input.expression,
      timezone,
      enabled: true,
      handler: input.handler,
      payload: input.payload,
      nextRunAt,
      runCount: 0,
      maxRuns: input.maxRuns,
      createdAt: now,
      updatedAt: now,
    };

    this.schedules.set(id, schedule);
    return { ...schedule };
  }

  async get(id: string): Promise<CronSchedule | null> {
    const schedule = this.schedules.get(id);
    return schedule ? { ...schedule } : null;
  }

  async getByUserId(userId: string): Promise<CronSchedule[]> {
    return Array.from(this.schedules.values())
      .filter(s => s.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(s => ({ ...s }));
  }

  async getDueSchedules(now: number): Promise<CronSchedule[]> {
    return Array.from(this.schedules.values())
      .filter(s => s.enabled && s.nextRunAt && s.nextRunAt <= now)
      .filter(s => !s.maxRuns || s.runCount < s.maxRuns)
      .map(s => ({ ...s }));
  }

  async update(id: string, updates: Partial<CronSchedule>): Promise<CronSchedule | null> {
    const existing = this.schedules.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, updatedAt: Date.now() };

    if (updates.expression) {
      const parsed = CronParser.parse(updates.expression);
      updated.nextRunAt = CronParser.getNextRunTime(parsed, new Date(), updated.timezone).getTime();
    }

    this.schedules.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    this.history.delete(id);
    return this.schedules.delete(id);
  }

  async recordExecution(result: CronJobResult): Promise<void> {
    const history = this.history.get(result.scheduleId) ?? [];
    history.unshift(result);
    this.history.set(result.scheduleId, history.slice(0, 1000));
  }

  async getHistory(scheduleId: string, limit: number = 100): Promise<CronJobResult[]> {
    const history = this.history.get(scheduleId) ?? [];
    return history.slice(0, limit);
  }
}

// =============================================================================
// Cron Scheduler Service
// =============================================================================

export interface CronJobHandler {
  (schedule: CronSchedule): Promise<unknown>;
}

export interface CronSchedulerConfig {
  tickIntervalMs: number;
  maxConcurrentJobs: number;
  jobTimeoutMs: number;
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: CronSchedulerConfig = {
  tickIntervalMs: CRON_DEFAULTS.SCHEDULER_TICK_MS,
  maxConcurrentJobs: CRON_DEFAULTS.MAX_CONCURRENT_JOBS,
  jobTimeoutMs: CRON_DEFAULTS.JOB_TIMEOUT_MS,
};

export class CronScheduler {
  private readonly config: CronSchedulerConfig;
  private readonly handlers = new Map<string, CronJobHandler>();
  private tickTimer?: NodeJS.Timeout;
  private runningJobs = 0;

  constructor(
    private readonly store: CronScheduleStore,
    config?: Partial<CronSchedulerConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a job handler
   */
  registerHandler(name: string, handler: CronJobHandler): void {
    this.handlers.set(name, handler);
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.tickTimer) return;

    this.tickTimer = setInterval(() => this.tick(), this.config.tickIntervalMs);
    this.emit(MEMORY_EVENTS.CRON_SCHEDULED, { status: 'started' });
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = undefined;
    }
    this.emit(MEMORY_EVENTS.CRON_DISABLED, { status: 'stopped' });
  }

  /**
   * Create a new schedule
   */
  async createSchedule(input: CronScheduleInput): Promise<CronSchedule> {
    // Validate handler exists
    if (!this.handlers.has(input.handler)) {
      throw new MemoryError('VALIDATION_ERROR', `Unknown handler: ${input.handler}`);
    }

    const schedule = await this.store.create(input);
    this.emit(MEMORY_EVENTS.CRON_SCHEDULED, { schedule });
    return schedule;
  }

  /**
   * Get schedule
   */
  async getSchedule(id: string): Promise<CronSchedule | null> {
    return this.store.get(id);
  }

  /**
   * Get schedules for a user
   */
  async getSchedules(userId: string): Promise<CronSchedule[]> {
    return this.store.getByUserId(userId);
  }

  /**
   * Update schedule
   */
  async updateSchedule(id: string, updates: Partial<CronSchedule>): Promise<CronSchedule | null> {
    return this.store.update(id, updates);
  }

  /**
   * Delete schedule
   */
  async deleteSchedule(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  /**
   * Enable/disable schedule
   */
  async setEnabled(id: string, enabled: boolean): Promise<CronSchedule | null> {
    return this.store.update(id, { enabled });
  }

  /**
   * Get execution history
   */
  async getHistory(scheduleId: string, limit?: number): Promise<CronJobResult[]> {
    return this.store.getHistory(scheduleId, limit);
  }

  /**
   * Execute a schedule immediately
   */
  async executeNow(id: string): Promise<CronJobResult> {
    const schedule = await this.store.get(id);
    if (!schedule) {
      throw new MemoryError('SCHEDULE_INVALID', 'Schedule not found');
    }
    return this.executeJob(schedule);
  }

  /**
   * Scheduler tick - check for due jobs
   */
  private async tick(): Promise<void> {
    if (this.runningJobs >= this.config.maxConcurrentJobs) return;

    const now = Date.now();
    const dueSchedules = await this.store.getDueSchedules(now);

    for (const schedule of dueSchedules) {
      if (this.runningJobs >= this.config.maxConcurrentJobs) break;
      this.runJob(schedule);
    }
  }

  /**
   * Run a job asynchronously
   */
  private async runJob(schedule: CronSchedule): Promise<void> {
    this.runningJobs++;

    try {
      const result = await this.executeJob(schedule);
      await this.store.recordExecution(result);

      // Update schedule
      const parsed = CronParser.parse(schedule.expression);
      const nextRunAt = CronParser.getNextRunTime(parsed, new Date(), schedule.timezone).getTime();

      await this.store.update(schedule.id, {
        lastRunAt: result.executedAt,
        nextRunAt,
        runCount: schedule.runCount + 1,
      });

      // Disable if max runs reached
      if (schedule.maxRuns && schedule.runCount + 1 >= schedule.maxRuns) {
        await this.store.update(schedule.id, { enabled: false });
        this.emit(MEMORY_EVENTS.CRON_COMPLETED, { schedule });
      }

      this.emit(MEMORY_EVENTS.CRON_EXECUTED, { schedule, result });
    } catch {
      // Error already logged in executeJob
    } finally {
      this.runningJobs--;
    }
  }

  /**
   * Execute a job
   */
  private async executeJob(schedule: CronSchedule): Promise<CronJobResult> {
    const startTime = Date.now();
    const handler = this.handlers.get(schedule.handler);

    if (!handler) {
      const result: CronJobResult = {
        scheduleId: schedule.id,
        executedAt: startTime,
        success: false,
        error: `Handler not found: ${schedule.handler}`,
        duration: 0,
      };
      this.emit(MEMORY_EVENTS.CRON_FAILED, { schedule, result });
      return result;
    }

    try {
      // Execute with timeout
      const resultPromise = handler(schedule);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Job timeout')), this.config.jobTimeoutMs)
      );

      const jobResult = await Promise.race([resultPromise, timeoutPromise]);

      return {
        scheduleId: schedule.id,
        executedAt: startTime,
        success: true,
        result: jobResult,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const result: CronJobResult = {
        scheduleId: schedule.id,
        executedAt: startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      };
      this.emit(MEMORY_EVENTS.CRON_FAILED, { schedule, result });
      return result;
    }
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createCronScheduleStore(type: 'memory'): InMemoryCronScheduleStore;
export function createCronScheduleStore(type: 'database', db: DatabaseAdapter): DatabaseCronScheduleStore;
export function createCronScheduleStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): CronScheduleStore {
  if (type === 'memory') {
    return new InMemoryCronScheduleStore();
  }
  if (!db) {
    throw new MemoryError('VALIDATION_ERROR', 'Database adapter required for database store');
  }
  return new DatabaseCronScheduleStore(db);
}

export function createCronScheduler(
  store: CronScheduleStore,
  config?: Partial<CronSchedulerConfig>
): CronScheduler {
  return new CronScheduler(store, config);
}
