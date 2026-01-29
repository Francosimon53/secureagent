import { EventEmitter } from 'events';
import {
  HealthStatus,
  HealthCheckResult,
  HealthReport,
  LivenessResult,
  ReadinessResult,
  HealthCheckConfig,
  DependencyCheckConfig,
  HealthEvent,
  HealthEventHandler,
} from './types.js';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'HealthChecker' });

// ============================================================================
// Health Checker Implementation
// ============================================================================

/**
 * Centralized health checker for the application
 */
export class HealthChecker extends EventEmitter {
  private readonly checks = new Map<string, HealthCheckConfig>();
  private readonly dependencies = new Map<string, DependencyCheckConfig>();
  private readonly lastResults = new Map<string, HealthCheckResult>();
  private readonly failureCounts = new Map<string, number>();
  private readonly successCounts = new Map<string, number>();
  private readonly intervalIds = new Map<string, NodeJS.Timeout>();
  private readonly startTime = Date.now();
  private version?: string;
  private overallStatus: HealthStatus = 'unknown';

  constructor(options: { version?: string } = {}) {
    super();
    this.version = options.version;
  }

  /**
   * Register a health check
   */
  register(config: HealthCheckConfig): void {
    this.checks.set(config.name, {
      timeout: 5000,
      critical: true,
      failureThreshold: 3,
      successThreshold: 1,
      ...config,
    });

    // Start background monitoring if interval is set
    if (config.interval && config.interval > 0) {
      this.startBackgroundCheck(config.name);
    }

    logger.info({ checkName: config.name, critical: config.critical }, 'Health check registered');
  }

  /**
   * Unregister a health check
   */
  unregister(name: string): boolean {
    this.stopBackgroundCheck(name);
    this.lastResults.delete(name);
    this.failureCounts.delete(name);
    this.successCounts.delete(name);
    return this.checks.delete(name);
  }

  /**
   * Register a dependency check
   */
  registerDependency(config: DependencyCheckConfig): void {
    this.dependencies.set(config.name, {
      timeout: 3000,
      required: true,
      ...config,
    });

    logger.info({ dependency: config.name, type: config.type }, 'Dependency check registered');
  }

  /**
   * Unregister a dependency
   */
  unregisterDependency(name: string): boolean {
    return this.dependencies.delete(name);
  }

  /**
   * Run a single health check
   */
  async runCheck(name: string): Promise<HealthCheckResult> {
    const config = this.checks.get(name);
    if (!config) {
      return {
        name,
        status: 'unknown',
        message: 'Check not found',
        duration: 0,
        timestamp: Date.now(),
      };
    }

    const startTime = Date.now();
    this.emitEvent('check:started', name, 'unknown');

    try {
      const result = await this.executeWithTimeout(
        config.check,
        config.timeout!,
        name
      );

      const duration = Date.now() - startTime;
      const finalResult: HealthCheckResult = {
        ...result,
        duration,
        timestamp: Date.now(),
      };

      this.updateCheckStatus(name, finalResult);
      this.emitEvent('check:completed', name, finalResult.status);

      return finalResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: HealthCheckResult = {
        name,
        status: 'unhealthy',
        message: errorMessage,
        duration,
        timestamp: Date.now(),
      };

      this.updateCheckStatus(name, result);
      this.emitEvent('check:failed', name, 'unhealthy', errorMessage);

      return result;
    }
  }

  /**
   * Run all health checks
   */
  async runAllChecks(options: { tags?: string[]; parallel?: boolean } = {}): Promise<HealthReport> {
    const startTime = Date.now();
    const checks = this.getChecksToRun(options.tags);

    let results: HealthCheckResult[];

    if (options.parallel !== false) {
      results = await Promise.all(
        checks.map(name => this.runCheck(name))
      );
    } else {
      results = [];
      for (const name of checks) {
        results.push(await this.runCheck(name));
      }
    }

    const overallStatus = this.calculateOverallStatus(results);
    const previousStatus = this.overallStatus;

    if (previousStatus !== overallStatus) {
      this.overallStatus = overallStatus;
      this.emitStatusChange(previousStatus, overallStatus);
    }

    return {
      status: overallStatus,
      checks: results,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      version: this.version,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Run dependency checks
   */
  async checkDependencies(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [name, config] of this.dependencies) {
      try {
        const healthy = await this.executeWithTimeout(
          config.check,
          config.timeout!,
          name
        );
        results.set(name, healthy);
      } catch {
        results.set(name, false);
      }
    }

    return results;
  }

  /**
   * Liveness probe - is the process alive?
   */
  async liveness(): Promise<LivenessResult> {
    // Basic liveness - if we can respond, we're alive
    return {
      alive: true,
      timestamp: Date.now(),
    };
  }

  /**
   * Readiness probe - is the application ready to serve traffic?
   */
  async readiness(): Promise<ReadinessResult> {
    // Check critical dependencies
    const depResults = await this.checkDependencies();
    const requiredDeps = Array.from(this.dependencies.entries())
      .filter(([_, config]) => config.required);

    for (const [name, config] of requiredDeps) {
      if (!depResults.get(name)) {
        return {
          ready: false,
          timestamp: Date.now(),
          reason: `Required dependency '${name}' is unhealthy`,
        };
      }
    }

    // Check critical health checks (use cached results if available)
    const criticalChecks = Array.from(this.checks.entries())
      .filter(([_, config]) => config.critical);

    for (const [name, _] of criticalChecks) {
      const lastResult = this.lastResults.get(name);
      if (lastResult && lastResult.status === 'unhealthy') {
        return {
          ready: false,
          timestamp: Date.now(),
          reason: `Critical check '${name}' is unhealthy: ${lastResult.message}`,
        };
      }
    }

    return {
      ready: true,
      timestamp: Date.now(),
    };
  }

  /**
   * Get current overall status
   */
  getStatus(): HealthStatus {
    return this.overallStatus;
  }

  /**
   * Get last result for a check
   */
  getLastResult(name: string): HealthCheckResult | undefined {
    return this.lastResults.get(name);
  }

  /**
   * Get all last results
   */
  getAllLastResults(): Map<string, HealthCheckResult> {
    return new Map(this.lastResults);
  }

  /**
   * Get uptime in seconds
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Subscribe to health events
   */
  onHealthEvent(handler: HealthEventHandler): void {
    this.on('health', handler);
  }

  /**
   * Stop all background checks
   */
  stop(): void {
    for (const name of this.intervalIds.keys()) {
      this.stopBackgroundCheck(name);
    }
  }

  /**
   * Execute check with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T> | T,
    timeout: number,
    name: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.emitEvent('check:timeout', name, 'unhealthy');
        reject(new Error(`Health check '${name}' timed out after ${timeout}ms`));
      }, timeout);

      Promise.resolve(fn())
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Update check status with threshold logic
   */
  private updateCheckStatus(name: string, result: HealthCheckResult): void {
    const config = this.checks.get(name);
    if (!config) return;

    const previousResult = this.lastResults.get(name);
    const previousStatus = previousResult?.status ?? 'unknown';

    if (result.status === 'healthy') {
      this.failureCounts.set(name, 0);
      const successCount = (this.successCounts.get(name) ?? 0) + 1;
      this.successCounts.set(name, successCount);

      // Only mark healthy after threshold successes
      if (successCount >= config.successThreshold! || previousStatus === 'unknown') {
        this.lastResults.set(name, result);
      }
    } else {
      this.successCounts.set(name, 0);
      const failureCount = (this.failureCounts.get(name) ?? 0) + 1;
      this.failureCounts.set(name, failureCount);

      // Only mark unhealthy after threshold failures
      if (failureCount >= config.failureThreshold! || previousStatus === 'unknown') {
        this.lastResults.set(name, result);
      }
    }
  }

  /**
   * Calculate overall status from check results
   */
  private calculateOverallStatus(results: HealthCheckResult[]): HealthStatus {
    if (results.length === 0) {
      return 'unknown';
    }

    const hasUnhealthy = results.some(r => r.status === 'unhealthy');
    const hasDegraded = results.some(r => r.status === 'degraded');
    const hasUnknown = results.some(r => r.status === 'unknown');

    // Check if any critical checks are unhealthy
    const criticalUnhealthy = results.some(r => {
      const config = this.checks.get(r.name);
      return config?.critical && r.status === 'unhealthy';
    });

    if (criticalUnhealthy) {
      return 'unhealthy';
    }

    if (hasUnhealthy) {
      return 'degraded';
    }

    if (hasDegraded) {
      return 'degraded';
    }

    if (hasUnknown) {
      return 'unknown';
    }

    return 'healthy';
  }

  /**
   * Get checks to run based on tags
   */
  private getChecksToRun(tags?: string[]): string[] {
    if (!tags || tags.length === 0) {
      return Array.from(this.checks.keys());
    }

    return Array.from(this.checks.entries())
      .filter(([_, config]) => {
        if (!config.tags) return false;
        return tags.some(tag => config.tags!.includes(tag));
      })
      .map(([name]) => name);
  }

  /**
   * Start background monitoring for a check
   */
  private startBackgroundCheck(name: string): void {
    const config = this.checks.get(name);
    if (!config?.interval) return;

    // Stop existing interval if any
    this.stopBackgroundCheck(name);

    const intervalId = setInterval(async () => {
      await this.runCheck(name);
    }, config.interval);

    this.intervalIds.set(name, intervalId);

    // Run initial check
    this.runCheck(name).catch(err => {
      logger.error({ checkName: name, error: err }, 'Background health check failed');
    });
  }

  /**
   * Stop background monitoring for a check
   */
  private stopBackgroundCheck(name: string): void {
    const intervalId = this.intervalIds.get(name);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervalIds.delete(name);
    }
  }

  /**
   * Emit health event
   */
  private emitEvent(
    type: HealthEvent['type'],
    checkName: string,
    status: HealthStatus,
    error?: string
  ): void {
    const event: HealthEvent = {
      type,
      checkName,
      currentStatus: status,
      timestamp: Date.now(),
      error,
    };
    this.emit('health', event);
  }

  /**
   * Emit status change event
   */
  private emitStatusChange(previous: HealthStatus, current: HealthStatus): void {
    const event: HealthEvent = {
      type: 'status:changed',
      previousStatus: previous,
      currentStatus: current,
      timestamp: Date.now(),
    };
    this.emit('health', event);

    // Emit specific events for degradation/recovery
    if (previous === 'healthy' && current !== 'healthy') {
      this.emit('health', { ...event, type: 'degraded' });
      logger.warn({ previousStatus: previous, currentStatus: current }, 'System health degraded');
    } else if (previous !== 'healthy' && current === 'healthy') {
      this.emit('health', { ...event, type: 'recovered' });
      logger.info({ previousStatus: previous, currentStatus: current }, 'System health recovered');
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalChecker: HealthChecker | null = null;

/**
 * Get the global health checker
 */
export function getHealthChecker(): HealthChecker {
  if (!globalChecker) {
    globalChecker = new HealthChecker();
  }
  return globalChecker;
}

/**
 * Initialize health checker with options
 */
export function initHealthChecker(options: { version?: string } = {}): HealthChecker {
  globalChecker = new HealthChecker(options);
  return globalChecker;
}
