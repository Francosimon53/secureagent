import { IncomingMessage, ServerResponse } from 'http';
import { HealthChecker, getHealthChecker } from './checker.js';
import { HealthReport, LivenessResult, ReadinessResult } from './types.js';

// ============================================================================
// HTTP Health Endpoints
// ============================================================================

/**
 * Health endpoint options
 */
export interface HealthEndpointOptions {
  /** Custom health checker instance */
  checker?: HealthChecker;
  /** Include detailed checks in response */
  detailed?: boolean;
  /** Custom path prefix */
  basePath?: string;
  /** Require authentication for detailed info */
  requireAuth?: boolean;
  /** Authentication function */
  authenticate?: (req: IncomingMessage) => boolean | Promise<boolean>;
}

/**
 * Health endpoint response
 */
export interface HealthEndpointResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
}

/**
 * Create health endpoint handler for raw HTTP
 */
export function createHealthHandler(options: HealthEndpointOptions = {}): (
  req: IncomingMessage,
  res: ServerResponse
) => Promise<void> {
  const checker = options.checker ?? getHealthChecker();
  const basePath = options.basePath ?? '/health';

  return async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const path = url.pathname;

    let response: HealthEndpointResponse;

    try {
      // Check authentication if required
      if (options.requireAuth && options.authenticate) {
        const isAuthenticated = await options.authenticate(req);
        if (!isAuthenticated) {
          response = {
            statusCode: 401,
            body: { error: 'Unauthorized' },
            headers: { 'Content-Type': 'application/json' },
          };
          sendResponse(res, response);
          return;
        }
      }

      if (path === basePath || path === `${basePath}/`) {
        response = await handleHealthCheck(checker, options.detailed ?? false);
      } else if (path === `${basePath}/live` || path === `${basePath}/liveness`) {
        response = await handleLiveness(checker);
      } else if (path === `${basePath}/ready` || path === `${basePath}/readiness`) {
        response = await handleReadiness(checker);
      } else if (path.startsWith(`${basePath}/checks/`)) {
        const checkName = path.slice(`${basePath}/checks/`.length);
        response = await handleSingleCheck(checker, checkName);
      } else {
        response = {
          statusCode: 404,
          body: { error: 'Not found' },
          headers: { 'Content-Type': 'application/json' },
        };
      }
    } catch (error) {
      response = {
        statusCode: 500,
        body: { error: 'Internal server error' },
        headers: { 'Content-Type': 'application/json' },
      };
    }

    sendResponse(res, response);
  };
}

/**
 * Handle main health check endpoint
 */
async function handleHealthCheck(
  checker: HealthChecker,
  detailed: boolean
): Promise<HealthEndpointResponse> {
  const report = await checker.runAllChecks();

  const body: Record<string, unknown> = {
    status: report.status,
    timestamp: new Date(report.timestamp).toISOString(),
    uptime: report.uptime,
  };

  if (report.version) {
    body.version = report.version;
  }

  if (detailed) {
    body.checks = report.checks.map(c => ({
      name: c.name,
      status: c.status,
      message: c.message,
      duration: c.duration,
      metadata: c.metadata,
    }));
    body.duration = report.duration;
  }

  return {
    statusCode: report.status === 'healthy' ? 200 : report.status === 'degraded' ? 200 : 503,
    body,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  };
}

/**
 * Handle liveness probe endpoint
 */
async function handleLiveness(checker: HealthChecker): Promise<HealthEndpointResponse> {
  const result = await checker.liveness();

  return {
    statusCode: result.alive ? 200 : 503,
    body: {
      status: result.alive ? 'alive' : 'dead',
      timestamp: new Date(result.timestamp).toISOString(),
    },
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  };
}

/**
 * Handle readiness probe endpoint
 */
async function handleReadiness(checker: HealthChecker): Promise<HealthEndpointResponse> {
  const result = await checker.readiness();

  const body: Record<string, unknown> = {
    status: result.ready ? 'ready' : 'not_ready',
    timestamp: new Date(result.timestamp).toISOString(),
  };

  if (result.reason) {
    body.reason = result.reason;
  }

  return {
    statusCode: result.ready ? 200 : 503,
    body,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  };
}

/**
 * Handle single check endpoint
 */
async function handleSingleCheck(
  checker: HealthChecker,
  checkName: string
): Promise<HealthEndpointResponse> {
  const result = await checker.runCheck(checkName);

  if (result.status === 'unknown' && result.message === 'Check not found') {
    return {
      statusCode: 404,
      body: { error: `Check '${checkName}' not found` },
      headers: { 'Content-Type': 'application/json' },
    };
  }

  return {
    statusCode: result.status === 'healthy' ? 200 : result.status === 'degraded' ? 200 : 503,
    body: {
      name: result.name,
      status: result.status,
      message: result.message,
      duration: result.duration,
      timestamp: new Date(result.timestamp).toISOString(),
      metadata: result.metadata,
    },
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  };
}

/**
 * Send HTTP response
 */
function sendResponse(res: ServerResponse, response: HealthEndpointResponse): void {
  res.writeHead(response.statusCode, response.headers);
  res.end(JSON.stringify(response.body));
}

// ============================================================================
// Express/Koa/Fastify Compatible Middleware
// ============================================================================

/**
 * Express-compatible middleware
 */
export function expressHealthMiddleware(options: HealthEndpointOptions = {}): (
  req: { url: string; method: string; headers: Record<string, string | string[] | undefined> },
  res: { status: (code: number) => { json: (body: unknown) => void }; set: (headers: Record<string, string>) => void },
  next: () => void
) => Promise<void> {
  const checker = options.checker ?? getHealthChecker();
  const basePath = options.basePath ?? '/health';

  return async (req, res, next) => {
    if (!req.url.startsWith(basePath)) {
      next();
      return;
    }

    const path = req.url.split('?')[0];

    try {
      let response: HealthEndpointResponse;

      if (path === basePath || path === `${basePath}/`) {
        response = await handleHealthCheck(checker, options.detailed ?? false);
      } else if (path === `${basePath}/live` || path === `${basePath}/liveness`) {
        response = await handleLiveness(checker);
      } else if (path === `${basePath}/ready` || path === `${basePath}/readiness`) {
        response = await handleReadiness(checker);
      } else if (path.startsWith(`${basePath}/checks/`)) {
        const checkName = path.slice(`${basePath}/checks/`.length);
        response = await handleSingleCheck(checker, checkName);
      } else {
        next();
        return;
      }

      res.set(response.headers);
      res.status(response.statusCode).json(response.body);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// ============================================================================
// Prometheus Metrics Export
// ============================================================================

/**
 * Generate Prometheus-compatible metrics from health checks
 */
export async function generatePrometheusMetrics(
  checker?: HealthChecker
): Promise<string> {
  const hc = checker ?? getHealthChecker();
  const report = await hc.runAllChecks();
  const lines: string[] = [];

  // Overall health status (0 = unhealthy, 0.5 = degraded, 1 = healthy)
  const statusValue = report.status === 'healthy' ? 1 : report.status === 'degraded' ? 0.5 : 0;
  lines.push('# HELP health_status Overall health status (0=unhealthy, 0.5=degraded, 1=healthy)');
  lines.push('# TYPE health_status gauge');
  lines.push(`health_status ${statusValue}`);

  // Uptime
  lines.push('# HELP health_uptime_seconds Application uptime in seconds');
  lines.push('# TYPE health_uptime_seconds gauge');
  lines.push(`health_uptime_seconds ${report.uptime}`);

  // Individual check status
  lines.push('# HELP health_check_status Individual health check status (0=unhealthy, 0.5=degraded, 1=healthy)');
  lines.push('# TYPE health_check_status gauge');
  for (const check of report.checks) {
    const value = check.status === 'healthy' ? 1 : check.status === 'degraded' ? 0.5 : 0;
    lines.push(`health_check_status{check="${check.name}"} ${value}`);
  }

  // Check duration
  lines.push('# HELP health_check_duration_ms Health check duration in milliseconds');
  lines.push('# TYPE health_check_duration_ms gauge');
  for (const check of report.checks) {
    lines.push(`health_check_duration_ms{check="${check.name}"} ${check.duration}`);
  }

  return lines.join('\n');
}

/**
 * Prometheus metrics endpoint handler
 */
export function createPrometheusHandler(options: { checker?: HealthChecker } = {}): (
  req: IncomingMessage,
  res: ServerResponse
) => Promise<void> {
  const checker = options.checker ?? getHealthChecker();

  return async (req, res) => {
    try {
      const metrics = await generatePrometheusMetrics(checker);
      res.writeHead(200, {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      });
      res.end(metrics);
    } catch (error) {
      res.writeHead(500);
      res.end('Error generating metrics');
    }
  };
}
