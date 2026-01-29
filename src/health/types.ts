// ============================================================================
// Health Check Types
// ============================================================================

/**
 * Health status values
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Component name */
  name: string;
  /** Health status */
  status: HealthStatus;
  /** Optional message */
  message?: string;
  /** Check duration in ms */
  duration: number;
  /** Timestamp of check */
  timestamp: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Aggregate health report
 */
export interface HealthReport {
  /** Overall status */
  status: HealthStatus;
  /** Individual check results */
  checks: HealthCheckResult[];
  /** Report generation timestamp */
  timestamp: number;
  /** Total duration to run all checks */
  duration: number;
  /** Application version */
  version?: string;
  /** Uptime in seconds */
  uptime: number;
}

/**
 * Liveness probe result
 */
export interface LivenessResult {
  alive: boolean;
  timestamp: number;
}

/**
 * Readiness probe result
 */
export interface ReadinessResult {
  ready: boolean;
  timestamp: number;
  reason?: string;
}

/**
 * Health check function type
 */
export type HealthCheckFn = () => Promise<HealthCheckResult> | HealthCheckResult;

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /** Check name */
  name: string;
  /** Check function */
  check: HealthCheckFn;
  /** Timeout in ms */
  timeout?: number;
  /** Whether this check is critical for readiness */
  critical?: boolean;
  /** Check interval for background monitoring */
  interval?: number;
  /** Number of failures before marking unhealthy */
  failureThreshold?: number;
  /** Number of successes before marking healthy */
  successThreshold?: number;
  /** Tags for filtering */
  tags?: string[];
}

/**
 * Dependency health check configuration
 */
export interface DependencyCheckConfig {
  /** Dependency name */
  name: string;
  /** Type of dependency */
  type: 'database' | 'cache' | 'api' | 'queue' | 'storage' | 'custom';
  /** Check function */
  check: () => Promise<boolean>;
  /** Timeout in ms */
  timeout?: number;
  /** Is this dependency required for the app to function */
  required?: boolean;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Health check events
 */
export type HealthEventType =
  | 'check:started'
  | 'check:completed'
  | 'check:failed'
  | 'check:timeout'
  | 'status:changed'
  | 'degraded'
  | 'recovered';

/**
 * Health event
 */
export interface HealthEvent {
  type: HealthEventType;
  checkName?: string;
  previousStatus?: HealthStatus;
  currentStatus: HealthStatus;
  timestamp: number;
  error?: string;
}

/**
 * Health event handler
 */
export type HealthEventHandler = (event: HealthEvent) => void;
