/**
 * Audit Logger
 *
 * Comprehensive HIPAA-compliant audit logging for all PHI access.
 * Logs all create, read, update, delete, export, and share operations.
 */

import { EventEmitter } from 'events';
import type { HealthAuditStore } from '../../stores/audit-store.js';
import type {
  HealthAuditLog,
  AuditAction,
  ResourceType,
  AccessLevel,
} from '../../types.js';

// Type aliases for backward compatibility
type HealthAuditEntry = HealthAuditLog;
type AuditResourceType = ResourceType;
import type { HIPAAConfig } from '../../config.js';
import { HEALTH_EVENTS } from '../../constants.js';

// =============================================================================
// Audit Logger Options
// =============================================================================

export interface AuditLoggerOptions {
  auditStore: HealthAuditStore;
  config: HIPAAConfig;
}

// =============================================================================
// Audit Context
// =============================================================================

export interface AuditContext {
  userId: string;
  userRole: AccessLevel;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

// =============================================================================
// Audit Logger
// =============================================================================

export class AuditLogger extends EventEmitter {
  private readonly auditStore: HealthAuditStore;
  private readonly config: HIPAAConfig;
  private readonly hashSalt: string;

  constructor(options: AuditLoggerOptions) {
    super();
    this.auditStore = options.auditStore;
    this.config = options.config;
    this.hashSalt = crypto.randomUUID();
  }

  /**
   * Log an audit entry
   */
  async log(
    context: AuditContext,
    action: AuditAction,
    resourceType: AuditResourceType,
    resourceId: string,
    metadata?: Record<string, unknown>
  ): Promise<HealthAuditEntry> {
    const entry = await this.auditStore.log({
      actor: {
        userId: context.userId,
        role: context.userRole,
        sessionId: context.sessionId,
        ipAddressHash: context.ipAddress ? this.hashIpAddress(context.ipAddress) : 'unknown',
      },
      action,
      resource: {
        type: resourceType,
        id: resourceId,
      },
      accessMethod: 'api',
      outcome: 'success',
      phiAccessed: metadata?.phiAccess === true,
      metadata,
    });

    this.emit(HEALTH_EVENTS.AUDIT_LOGGED, {
      entryId: entry.id,
      action,
      resourceType,
      timestamp: entry.timestamp,
    });

    return entry;
  }

  /**
   * Log a failed action
   */
  async logFailure(
    context: AuditContext,
    action: AuditAction,
    resourceType: AuditResourceType,
    resourceId: string,
    errorMessage: string,
    metadata?: Record<string, unknown>
  ): Promise<HealthAuditEntry> {
    const entry = await this.auditStore.log({
      actor: {
        userId: context.userId,
        role: context.userRole,
        sessionId: context.sessionId,
        ipAddressHash: context.ipAddress ? this.hashIpAddress(context.ipAddress) : 'unknown',
      },
      action,
      resource: {
        type: resourceType,
        id: resourceId,
      },
      accessMethod: 'api',
      outcome: 'failure',
      denialReason: errorMessage,
      phiAccessed: false,
      metadata,
    });

    this.emit(HEALTH_EVENTS.AUDIT_FAILURE_LOGGED, {
      entryId: entry.id,
      action,
      resourceType,
      errorMessage,
      timestamp: entry.timestamp,
    });

    return entry;
  }

  // ===========================================================================
  // Convenience Methods for Common Actions
  // ===========================================================================

  /**
   * Log PHI access (read)
   */
  async logPhiAccess(
    context: AuditContext,
    resourceType: AuditResourceType,
    resourceId: string,
    fieldsAccessed?: string[]
  ): Promise<HealthAuditEntry> {
    return this.log(context, 'read', resourceType, resourceId, {
      fieldsAccessed,
      phiAccess: true,
    });
  }

  /**
   * Log PHI modification
   */
  async logPhiModification(
    context: AuditContext,
    resourceType: AuditResourceType,
    resourceId: string,
    action: 'create' | 'update' | 'delete',
    changes?: Record<string, { old: unknown; new: unknown }>
  ): Promise<HealthAuditEntry> {
    return this.log(context, action, resourceType, resourceId, {
      changes: this.sanitizeChanges(changes),
      phiAccess: true,
    });
  }

  /**
   * Log PHI export
   */
  async logPhiExport(
    context: AuditContext,
    resourceType: AuditResourceType,
    resourceIds: string[],
    format: string,
    destination?: string
  ): Promise<HealthAuditEntry> {
    return this.log(context, 'export', resourceType, resourceIds.join(','), {
      exportedCount: resourceIds.length,
      format,
      destination,
      phiAccess: true,
    });
  }

  /**
   * Log PHI sharing
   */
  async logPhiShare(
    context: AuditContext,
    resourceType: AuditResourceType,
    resourceId: string,
    sharedWith: string,
    shareMethod: string
  ): Promise<HealthAuditEntry> {
    return this.log(context, 'share', resourceType, resourceId, {
      sharedWith,
      shareMethod,
      phiAccess: true,
    });
  }

  /**
   * Log login attempt
   */
  async logLogin(
    context: AuditContext,
    success: boolean,
    failureReason?: string
  ): Promise<HealthAuditEntry> {
    if (success) {
      return this.log(context, 'login', 'user', context.sessionId ?? 'unknown', {
        loginTime: Date.now(),
      });
    } else {
      return this.logFailure(
        context,
        'login',
        'user',
        'failed',
        failureReason ?? 'Authentication failed'
      );
    }
  }

  /**
   * Log logout
   */
  async logLogout(
    context: AuditContext,
    sessionDurationMs: number
  ): Promise<HealthAuditEntry> {
    return this.log(context, 'logout', 'user', context.sessionId ?? 'unknown', {
      sessionDurationMs,
      logoutTime: Date.now(),
    });
  }

  /**
   * Log permission denied
   */
  async logPermissionDenied(
    context: AuditContext,
    resourceType: AuditResourceType,
    resourceId: string,
    attemptedAction: AuditAction,
    requiredPermission: string
  ): Promise<HealthAuditEntry> {
    return this.logFailure(
      context,
      attemptedAction,
      resourceType,
      resourceId,
      'Permission denied',
      {
        requiredPermission,
        userRole: context.userRole,
      }
    );
  }

  // ===========================================================================
  // Batch Operations
  // ===========================================================================

  /**
   * Log multiple entries in batch
   */
  async logBatch(
    entries: Array<{
      context: AuditContext;
      action: AuditAction;
      resourceType: AuditResourceType;
      resourceId: string;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<HealthAuditEntry[]> {
    const auditEntries = entries.map((e) => ({
      actor: {
        userId: e.context.userId,
        role: e.context.userRole,
        sessionId: e.context.sessionId,
        ipAddressHash: e.context.ipAddress ? this.hashIpAddress(e.context.ipAddress) : 'unknown',
      },
      action: e.action,
      resource: {
        type: e.resourceType,
        id: e.resourceId,
      },
      accessMethod: 'api' as const,
      outcome: 'success' as const,
      phiAccessed: e.metadata?.phiAccess === true,
      metadata: e.metadata,
    }));

    return this.auditStore.logBatch(auditEntries);
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Get audit entries for a resource
   */
  async getResourceHistory(
    userId: string,
    resourceType: AuditResourceType,
    resourceId: string
  ): Promise<HealthAuditEntry[]> {
    const result = await this.auditStore.query({
      resourceType,
    });
    // Filter by resource ID since query doesn't support it directly
    return result.logs.filter((log) => log.resource.id === resourceId);
  }

  /**
   * Get audit entries for an actor
   */
  async getActorActivity(
    userId: string,
    actorId: string,
    startDate?: number,
    endDate?: number
  ): Promise<HealthAuditEntry[]> {
    return this.auditStore.getUserActivityLog(actorId);
  }

  /**
   * Get failed access attempts
   */
  async getFailedAttempts(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<HealthAuditEntry[]> {
    return this.auditStore.getDeniedAccessAttempts(startDate, endDate);
  }

  /**
   * Get PHI access log
   */
  async getPhiAccessLog(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<HealthAuditEntry[]> {
    return this.auditStore.getPHIAccessLogs(startDate, endDate);
  }

  // ===========================================================================
  // Reports
  // ===========================================================================

  /**
   * Generate access report for compliance
   */
  async generateAccessReport(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<{
    period: { start: number; end: number };
    summary: {
      totalAccess: number;
      uniqueActors: number;
      phiAccess: number;
      failedAttempts: number;
      exports: number;
      shares: number;
    };
    byAction: Record<string, number>;
    byResource: Record<string, number>;
    byActor: Array<{ actorId: string; accessCount: number; lastAccess: number }>;
    failures: HealthAuditEntry[];
  }> {
    const result = await this.auditStore.query({
      startTime: startDate,
      endTime: endDate,
    });

    const entries = result.logs;

    // Calculate summary
    const actorSet = new Set(entries.map((e) => e.actor.userId));
    const phiEntries = entries.filter((e) => e.phiAccessed);
    const failures = entries.filter((e) => e.outcome !== 'success');
    const exportsEntries = entries.filter((e) => e.action === 'export');
    const shares = entries.filter((e) => e.action === 'share');

    // Count by action
    const byAction: Record<string, number> = {};
    for (const entry of entries) {
      byAction[entry.action] = (byAction[entry.action] ?? 0) + 1;
    }

    // Count by resource
    const byResource: Record<string, number> = {};
    for (const entry of entries) {
      byResource[entry.resource.type] = (byResource[entry.resource.type] ?? 0) + 1;
    }

    // Group by actor
    const actorActivity = new Map<string, { count: number; lastAccess: number }>();
    for (const entry of entries) {
      const current = actorActivity.get(entry.actor.userId) ?? { count: 0, lastAccess: 0 };
      current.count++;
      current.lastAccess = Math.max(current.lastAccess, entry.timestamp);
      actorActivity.set(entry.actor.userId, current);
    }

    const byActor = Array.from(actorActivity.entries())
      .map(([actorId, data]) => ({
        actorId,
        accessCount: data.count,
        lastAccess: data.lastAccess,
      }))
      .sort((a, b) => b.accessCount - a.accessCount);

    return {
      period: { start: startDate, end: endDate },
      summary: {
        totalAccess: entries.length,
        uniqueActors: actorSet.size,
        phiAccess: phiEntries.length,
        failedAttempts: failures.length,
        exports: exportsEntries.length,
        shares: shares.length,
      },
      byAction,
      byResource,
      byActor,
      failures,
    };
  }

  /**
   * Check for suspicious activity
   */
  async detectSuspiciousActivity(
    userId: string,
    timeWindowMs = 3600000 // 1 hour
  ): Promise<Array<{
    type: string;
    description: string;
    actorId: string;
    count: number;
    entries: HealthAuditEntry[];
  }>> {
    const endDate = Date.now();
    const startDate = endDate - timeWindowMs;

    const result = await this.auditStore.query({
      startTime: startDate,
      endTime: endDate,
    });

    const suspicious: Array<{
      type: string;
      description: string;
      actorId: string;
      count: number;
      entries: HealthAuditEntry[];
    }> = [];

    // Check for excessive failed logins
    const failedLogins = result.logs.filter(
      (e) => e.action === 'login' && e.outcome !== 'success'
    );
    const failedByActor = this.groupByActor(failedLogins);

    for (const [actorId, entries] of failedByActor) {
      if (entries.length >= 5) {
        suspicious.push({
          type: 'excessive-failed-logins',
          description: `${entries.length} failed login attempts`,
          actorId,
          count: entries.length,
          entries,
        });
      }
    }

    // Check for unusual export volume
    const exportsEntries = result.logs.filter((e) => e.action === 'export');
    const exportsByActor = this.groupByActor(exportsEntries);

    for (const [actorId, entries] of exportsByActor) {
      if (entries.length >= 10) {
        suspicious.push({
          type: 'high-export-volume',
          description: `${entries.length} exports in ${timeWindowMs / 60000} minutes`,
          actorId,
          count: entries.length,
          entries,
        });
      }
    }

    // Check for access outside business hours
    const offHoursEntries = result.logs.filter((e) => {
      const date = new Date(e.timestamp);
      const hour = date.getHours();
      const day = date.getDay();
      // Weekend or outside 7am-9pm
      return day === 0 || day === 6 || hour < 7 || hour > 21;
    });

    if (offHoursEntries.length > 50) {
      const offHoursByActor = this.groupByActor(offHoursEntries);
      for (const [actorId, entries] of offHoursByActor) {
        suspicious.push({
          type: 'off-hours-access',
          description: `${entries.length} access events outside business hours`,
          actorId,
          count: entries.length,
          entries: entries.slice(0, 10), // Limit to first 10
        });
      }
    }

    return suspicious;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Hash IP address for privacy
   */
  private hashIpAddress(ip: string): string {
    // Simple hash for IP privacy - in production, use proper hashing
    const parts = ip.split('.');
    if (parts.length === 4) {
      // Mask last two octets for IPv4
      return `${parts[0]}.${parts[1]}.xxx.xxx`;
    }
    // For IPv6 or other, just return masked version
    return ip.substring(0, ip.length / 2) + '***';
  }

  /**
   * Sanitize change records (remove sensitive data)
   */
  private sanitizeChanges(
    changes?: Record<string, { old: unknown; new: unknown }>
  ): Record<string, { old: string; new: string }> | undefined {
    if (!changes) return undefined;

    const sensitiveFields = ['ssn', 'password', 'dateOfBirth', 'address', 'phone'];
    const sanitized: Record<string, { old: string; new: string }> = {};

    for (const [field, value] of Object.entries(changes)) {
      if (sensitiveFields.includes(field.toLowerCase())) {
        sanitized[field] = { old: '[REDACTED]', new: '[REDACTED]' };
      } else {
        sanitized[field] = {
          old: String(value.old),
          new: String(value.new),
        };
      }
    }

    return sanitized;
  }

  /**
   * Group entries by actor
   */
  private groupByActor(entries: HealthAuditEntry[]): Map<string, HealthAuditEntry[]> {
    const grouped = new Map<string, HealthAuditEntry[]>();

    for (const entry of entries) {
      const actorId = entry.actor.userId;
      if (!grouped.has(actorId)) {
        grouped.set(actorId, []);
      }
      grouped.get(actorId)!.push(entry);
    }

    return grouped;
  }
}
