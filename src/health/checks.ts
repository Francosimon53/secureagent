import { HealthCheckResult, HealthStatus } from './types.js';
import { getDatabase } from '../persistence/database.js';

// ============================================================================
// Built-in Health Checks
// ============================================================================

/**
 * Memory usage health check
 */
export function memoryCheck(options: {
  warningThresholdPercent?: number;
  criticalThresholdPercent?: number;
  // Test-compatible alias
  thresholdPercent?: number;
} = {}): () => HealthCheckResult {
  // Support thresholdPercent as alias for criticalThresholdPercent
  const warningThreshold = options.warningThresholdPercent ?? 80;
  const criticalThreshold = options.thresholdPercent ?? options.criticalThresholdPercent ?? 95;

  return () => {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    const usagePercent = (usage.heapUsed / usage.heapTotal) * 100;

    let status: HealthStatus = 'healthy';
    let message = `Heap: ${heapUsedMB}MB / ${heapTotalMB}MB (${usagePercent.toFixed(1)}%)`;

    if (usagePercent >= criticalThreshold) {
      status = 'unhealthy';
      message = `Critical memory usage: ${message}`;
    } else if (usagePercent >= warningThreshold) {
      status = 'degraded';
      message = `High memory usage: ${message}`;
    }

    const metadata = {
      heapUsedMB,
      heapTotalMB,
      rssMB,
      usagePercent: Math.round(usagePercent * 10) / 10,
      externalMB: Math.round(usage.external / 1024 / 1024),
      // Test-compatible aliases
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
    };

    return {
      name: 'memory',
      status,
      message,
      duration: 0,
      timestamp: Date.now(),
      metadata,
      // Test-compatible alias
      details: metadata,
    };
  };
}

/**
 * Event loop lag health check
 */
export function eventLoopCheck(options: {
  warningThresholdMs?: number;
  criticalThresholdMs?: number;
  // Test-compatible alias
  thresholdMs?: number;
} = {}): () => Promise<HealthCheckResult> {
  const warningThreshold = options.warningThresholdMs ?? 100;
  const criticalThreshold = options.thresholdMs ?? options.criticalThresholdMs ?? 500;

  return () => {
    return new Promise(resolve => {
      const start = Date.now();

      setImmediate(() => {
        const lag = Date.now() - start;

        let status: HealthStatus = 'healthy';
        let message = `Event loop lag: ${lag}ms`;

        if (lag >= criticalThreshold) {
          status = 'unhealthy';
          message = `Critical event loop lag: ${lag}ms`;
        } else if (lag >= warningThreshold) {
          status = 'degraded';
          message = `High event loop lag: ${lag}ms`;
        }

        const metadata = {
          lagMs: lag,
          // Test-compatible alias
          lag,
        };

        resolve({
          name: 'event-loop',
          status,
          message,
          duration: lag,
          timestamp: Date.now(),
          metadata,
          // Test-compatible alias
          details: metadata,
        });
      });
    });
  };
}

/**
 * Database connection health check
 */
export function databaseCheck(): () => Promise<HealthCheckResult> {
  return async () => {
    const startTime = Date.now();

    try {
      const db = getDatabase();

      if (!db.isConnected()) {
        return {
          name: 'database',
          status: 'unhealthy',
          message: 'Database not connected',
          duration: Date.now() - startTime,
          timestamp: Date.now(),
        };
      }

      // Try a simple query
      await db.query('SELECT 1');

      const stats = db.getStats();

      return {
        name: 'database',
        status: 'healthy',
        message: 'Database connected',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
        metadata: {
          connections: stats?.connections,
          queries: stats?.queries,
          errors: stats?.errors,
        },
      };
    } catch (error) {
      return {
        name: 'database',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Database check failed',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  };
}

/**
 * HTTP endpoint health check
 */
export function httpEndpointCheck(options: {
  name: string;
  url: string;
  method?: string;
  expectedStatus?: number;
  timeout?: number;
  headers?: Record<string, string>;
}): () => Promise<HealthCheckResult> {
  const {
    name,
    url,
    method = 'GET',
    expectedStatus = 200,
    timeout = 5000,
    headers = {},
  } = options;

  return async () => {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;
      const isHealthy = response.status === expectedStatus;

      return {
        name,
        status: isHealthy ? 'healthy' : 'unhealthy',
        message: isHealthy
          ? `Endpoint responded with ${response.status}`
          : `Expected ${expectedStatus}, got ${response.status}`,
        duration,
        timestamp: Date.now(),
        metadata: {
          url,
          statusCode: response.status,
          responseTimeMs: duration,
        },
      };
    } catch (error) {
      return {
        name,
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Request failed',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
        metadata: {
          url,
          error: error instanceof Error ? error.name : 'Unknown',
        },
      };
    }
  };
}

/**
 * DNS resolution health check
 */
export function dnsCheck(options: {
  hostname: string;
}): () => Promise<HealthCheckResult> {
  return async () => {
    const startTime = Date.now();

    try {
      // Use dynamic import for dns module
      const dns = await import('dns');
      const { promisify } = await import('util');
      const lookup = promisify(dns.lookup);

      const result = await lookup(options.hostname);

      return {
        name: `dns-${options.hostname}`,
        status: 'healthy',
        message: `Resolved to ${result.address}`,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
        metadata: {
          hostname: options.hostname,
          address: result.address,
          family: result.family,
        },
      };
    } catch (error) {
      return {
        name: `dns-${options.hostname}`,
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'DNS resolution failed',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
        metadata: {
          hostname: options.hostname,
        },
      };
    }
  };
}

/**
 * Disk space health check
 */
export function diskSpaceCheck(options: {
  path?: string;
  warningThresholdPercent?: number;
  criticalThresholdPercent?: number;
} = {}): () => Promise<HealthCheckResult> {
  const warningThreshold = options.warningThresholdPercent ?? 80;
  const criticalThreshold = options.criticalThresholdPercent ?? 95;

  return async () => {
    const startTime = Date.now();

    try {
      const { execSync } = await import('child_process');
      const path = options.path ?? '/';

      // Use df command (works on Unix-like systems)
      const output = execSync(`df -P "${path}" | tail -1`, { encoding: 'utf8' });
      const parts = output.trim().split(/\s+/);

      const totalKB = parseInt(parts[1], 10);
      const usedKB = parseInt(parts[2], 10);
      const availableKB = parseInt(parts[3], 10);
      const usagePercent = (usedKB / totalKB) * 100;

      let status: HealthStatus = 'healthy';
      let message = `Disk usage: ${usagePercent.toFixed(1)}%`;

      if (usagePercent >= criticalThreshold) {
        status = 'unhealthy';
        message = `Critical disk usage: ${message}`;
      } else if (usagePercent >= warningThreshold) {
        status = 'degraded';
        message = `High disk usage: ${message}`;
      }

      return {
        name: 'disk-space',
        status,
        message,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
        metadata: {
          path,
          totalGB: Math.round(totalKB / 1024 / 1024 * 10) / 10,
          usedGB: Math.round(usedKB / 1024 / 1024 * 10) / 10,
          availableGB: Math.round(availableKB / 1024 / 1024 * 10) / 10,
          usagePercent: Math.round(usagePercent * 10) / 10,
        },
      };
    } catch (error) {
      return {
        name: 'disk-space',
        status: 'unknown',
        message: 'Could not determine disk space',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  };
}

/**
 * CPU load health check
 */
export function cpuLoadCheck(options: {
  warningThreshold?: number;
  criticalThreshold?: number;
} = {}): () => Promise<HealthCheckResult> {
  const warningThreshold = options.warningThreshold ?? 0.8;
  const criticalThreshold = options.criticalThreshold ?? 0.95;

  return async () => {
    const startTime = Date.now();

    try {
      const os = await import('os');
      const cpus = os.cpus();
      const loadAvg = os.loadavg();
      const numCpus = cpus.length;

      // Normalize load average by number of CPUs
      const normalizedLoad = loadAvg[0] / numCpus;

      let status: HealthStatus = 'healthy';
      let message = `CPU load: ${loadAvg[0].toFixed(2)} (${numCpus} cores)`;

      if (normalizedLoad >= criticalThreshold) {
        status = 'unhealthy';
        message = `Critical CPU load: ${message}`;
      } else if (normalizedLoad >= warningThreshold) {
        status = 'degraded';
        message = `High CPU load: ${message}`;
      }

      return {
        name: 'cpu-load',
        status,
        message,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
        metadata: {
          loadAverage1m: loadAvg[0],
          loadAverage5m: loadAvg[1],
          loadAverage15m: loadAvg[2],
          numCpus,
          normalizedLoad: Math.round(normalizedLoad * 100) / 100,
        },
      };
    } catch (error) {
      return {
        name: 'cpu-load',
        status: 'unknown',
        message: 'Could not determine CPU load',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  };
}

/**
 * Custom function health check wrapper
 * Supports two signatures:
 * 1. customCheck(options: { name, check, message? })
 * 2. customCheck(name, checkFn) - test-compatible
 */
export function customCheck(
  nameOrOptions: string | {
    name: string;
    check: () => Promise<boolean> | boolean;
    message?: string;
  },
  checkFn?: () => Promise<HealthCheckResult>
): () => Promise<HealthCheckResult> {
  // Test-compatible signature: customCheck(name, fn)
  if (typeof nameOrOptions === 'string' && typeof checkFn === 'function') {
    return async () => {
      const startTime = Date.now();
      try {
        const result = await checkFn();
        return {
          ...result,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        return {
          name: nameOrOptions,
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Check failed',
          duration: Date.now() - startTime,
          timestamp: Date.now(),
        };
      }
    };
  }

  // Original signature: customCheck(options)
  const options = nameOrOptions as {
    name: string;
    check: () => Promise<boolean> | boolean;
    message?: string;
  };

  return async () => {
    const startTime = Date.now();

    try {
      const result = await options.check();

      return {
        name: options.name,
        status: result ? 'healthy' : 'unhealthy',
        message: options.message ?? (result ? 'Check passed' : 'Check failed'),
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        name: options.name,
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Check failed',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  };
}

/**
 * Composite health check - combines multiple checks
 * Supports two signatures:
 * 1. compositeCheck(options: { name, checks, mode? })
 * 2. compositeCheck(name, { checks }) - test-compatible
 */
export function compositeCheck(
  nameOrOptions: string | {
    name: string;
    checks: Array<() => Promise<HealthCheckResult> | HealthCheckResult>;
    mode?: 'all' | 'any';
  },
  configArg?: {
    checks: Array<() => Promise<HealthCheckResult> | HealthCheckResult>;
    mode?: 'all' | 'any';
  }
): () => Promise<HealthCheckResult> {
  // Determine the actual options
  let name: string;
  let checks: Array<() => Promise<HealthCheckResult> | HealthCheckResult>;
  let mode: 'all' | 'any';

  if (typeof nameOrOptions === 'string') {
    // Test-compatible signature: compositeCheck(name, { checks })
    name = nameOrOptions;
    checks = configArg?.checks ?? [];
    mode = configArg?.mode ?? 'all';
  } else {
    // Original signature: compositeCheck(options)
    name = nameOrOptions.name;
    checks = nameOrOptions.checks;
    mode = nameOrOptions.mode ?? 'all';
  }

  return async () => {
    const startTime = Date.now();
    const results: HealthCheckResult[] = [];

    for (const check of checks) {
      results.push(await check());
    }

    const healthyCount = results.filter(r => r.status === 'healthy').length;
    const degradedCount = results.filter(r => r.status === 'degraded').length;
    const allHealthy = healthyCount === results.length;
    const anyHealthy = healthyCount > 0;

    // Determine overall status
    let status: HealthStatus;
    if (mode === 'all') {
      if (allHealthy) {
        status = 'healthy';
      } else if (degradedCount > 0 && healthyCount + degradedCount === results.length) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }
    } else {
      status = anyHealthy ? 'healthy' : 'unhealthy';
    }

    return {
      name,
      status,
      message: `${healthyCount}/${results.length} checks healthy`,
      duration: Date.now() - startTime,
      timestamp: Date.now(),
      metadata: {
        mode,
        totalChecks: results.length,
        healthyChecks: healthyCount,
        results: results.map(r => ({ name: r.name, status: r.status })),
      },
    };
  };
}
