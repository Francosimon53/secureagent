/**
 * Compliance Service
 *
 * Unified service for HIPAA compliance including:
 * - Comprehensive audit logging
 * - Role-based access control
 * - Data retention management
 */

import { EventEmitter } from 'events';
import type { HealthAuditStore } from '../../stores/audit-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type { AppointmentStore } from '../../stores/appointment-store.js';
import type { AuthorizationStore } from '../../stores/authorization-store.js';
import type { ProgressReportStore } from '../../stores/progress-report-store.js';
import type { FAQStore } from '../../stores/faq-store.js';
import type { ScheduleStore } from '../../stores/schedule-store.js';
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
import { AuditLogger, type AuditContext } from './audit-logger.js';
import {
  AccessController,
  type AccessRequest,
  type AccessResult,
  type Permission,
  AccessDeniedError,
} from './access-controller.js';
import {
  DataRetentionManager,
  type RetentionPolicy,
  type RetentionJob,
} from './data-retention.js';

// =============================================================================
// Compliance Service Options
// =============================================================================

export interface ComplianceServiceOptions {
  auditStore: HealthAuditStore;
  patientStore: PatientStore;
  appointmentStore: AppointmentStore;
  authorizationStore: AuthorizationStore;
  progressReportStore: ProgressReportStore;
  faqStore: FAQStore;
  scheduleStore: ScheduleStore;
  config: HIPAAConfig;
}

// =============================================================================
// Compliance Service
// =============================================================================

export class ComplianceService extends EventEmitter {
  private readonly auditStore: HealthAuditStore;
  private readonly config: HIPAAConfig;

  private readonly auditLogger: AuditLogger;
  private readonly accessController: AccessController;
  private readonly dataRetention: DataRetentionManager;

  constructor(options: ComplianceServiceOptions) {
    super();

    this.auditStore = options.auditStore;
    this.config = options.config;

    // Initialize audit logger
    this.auditLogger = new AuditLogger({
      auditStore: options.auditStore,
      config: options.config,
    });

    // Initialize access controller
    this.accessController = new AccessController({
      auditLogger: this.auditLogger,
    });

    // Initialize data retention manager
    this.dataRetention = new DataRetentionManager({
      auditStore: options.auditStore,
      patientStore: options.patientStore,
      appointmentStore: options.appointmentStore,
      authorizationStore: options.authorizationStore,
      progressReportStore: options.progressReportStore,
      faqStore: options.faqStore,
      scheduleStore: options.scheduleStore,
      auditLogger: this.auditLogger,
      config: options.config,
    });

    // Forward events
    this.auditLogger.on(HEALTH_EVENTS.AUDIT_LOGGED, (data) =>
      this.emit(HEALTH_EVENTS.AUDIT_LOGGED, data)
    );
    this.auditLogger.on(HEALTH_EVENTS.AUDIT_FAILURE_LOGGED, (data) =>
      this.emit(HEALTH_EVENTS.AUDIT_FAILURE_LOGGED, data)
    );
    this.accessController.on(HEALTH_EVENTS.ACCESS_DENIED, (data) =>
      this.emit(HEALTH_EVENTS.ACCESS_DENIED, data)
    );
    this.dataRetention.on(HEALTH_EVENTS.RETENTION_JOB_COMPLETED, (data) =>
      this.emit(HEALTH_EVENTS.RETENTION_JOB_COMPLETED, data)
    );
  }

  // ===========================================================================
  // Audit Logging
  // ===========================================================================

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
    return this.auditLogger.log(context, action, resourceType, resourceId, metadata);
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
    return this.auditLogger.logFailure(
      context,
      action,
      resourceType,
      resourceId,
      errorMessage,
      metadata
    );
  }

  /**
   * Log PHI access
   */
  async logPhiAccess(
    context: AuditContext,
    resourceType: AuditResourceType,
    resourceId: string,
    fieldsAccessed?: string[]
  ): Promise<HealthAuditEntry> {
    return this.auditLogger.logPhiAccess(context, resourceType, resourceId, fieldsAccessed);
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
    return this.auditLogger.logPhiModification(
      context,
      resourceType,
      resourceId,
      action,
      changes
    );
  }

  /**
   * Log login attempt
   */
  async logLogin(
    context: AuditContext,
    success: boolean,
    failureReason?: string
  ): Promise<HealthAuditEntry> {
    return this.auditLogger.logLogin(context, success, failureReason);
  }

  /**
   * Log logout
   */
  async logLogout(
    context: AuditContext,
    sessionDurationMs: number
  ): Promise<HealthAuditEntry> {
    return this.auditLogger.logLogout(context, sessionDurationMs);
  }

  /**
   * Get audit history for a resource
   */
  async getResourceHistory(
    userId: string,
    resourceType: AuditResourceType,
    resourceId: string
  ): Promise<HealthAuditEntry[]> {
    return this.auditLogger.getResourceHistory(userId, resourceType, resourceId);
  }

  /**
   * Get activity log for an actor
   */
  async getActorActivity(
    userId: string,
    actorId: string,
    startDate?: number,
    endDate?: number
  ): Promise<HealthAuditEntry[]> {
    return this.auditLogger.getActorActivity(userId, actorId, startDate, endDate);
  }

  /**
   * Generate access report
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
    return this.auditLogger.generateAccessReport(userId, startDate, endDate);
  }

  /**
   * Detect suspicious activity
   */
  async detectSuspiciousActivity(
    userId: string,
    timeWindowMs?: number
  ): Promise<Array<{
    type: string;
    description: string;
    actorId: string;
    count: number;
    entries: HealthAuditEntry[];
  }>> {
    return this.auditLogger.detectSuspiciousActivity(userId, timeWindowMs);
  }

  // ===========================================================================
  // Access Control
  // ===========================================================================

  /**
   * Check if access is allowed
   */
  async checkAccess(request: AccessRequest): Promise<AccessResult> {
    return this.accessController.checkAccess(request);
  }

  /**
   * Require access (throws if denied)
   */
  async requireAccess(request: AccessRequest): Promise<void> {
    return this.accessController.requireAccess(request);
  }

  /**
   * Check if user has permission
   */
  hasPermission(
    userId: string,
    userRole: AccessLevel,
    resourceType: AuditResourceType,
    action: AuditAction
  ): boolean {
    return this.accessController.hasPermission(userId, userRole, resourceType, action);
  }

  /**
   * Get user permissions
   */
  getPermissions(userId: string, role: AccessLevel): Permission[] {
    return this.accessController.getPermissions(userId, role);
  }

  /**
   * Add custom permission
   */
  addCustomPermission(userId: string, permission: Permission): void {
    this.accessController.addCustomPermission(userId, permission);
  }

  /**
   * Remove custom permission
   */
  removeCustomPermission(
    userId: string,
    resourceType: AuditResourceType,
    action: AuditAction
  ): void {
    this.accessController.removeCustomPermission(userId, resourceType, action);
  }

  /**
   * Get accessible resources for a role
   */
  getAccessibleResources(userRole: AccessLevel, action: AuditAction): AuditResourceType[] {
    return this.accessController.getAccessibleResources(userRole, action);
  }

  /**
   * Get allowed actions for a resource
   */
  getAllowedActions(userRole: AccessLevel, resourceType: AuditResourceType): AuditAction[] {
    return this.accessController.getAllowedActions(userRole, resourceType);
  }

  /**
   * Create audit context
   */
  createContext(
    userId: string,
    userRole: AccessLevel,
    options?: Partial<AuditContext>
  ): AuditContext {
    return this.accessController.createContext(userId, userRole, options);
  }

  // ===========================================================================
  // Data Retention
  // ===========================================================================

  /**
   * Get retention policy
   */
  getRetentionPolicy(resourceType: AuditResourceType): RetentionPolicy | undefined {
    return this.dataRetention.getPolicy(resourceType);
  }

  /**
   * Set retention policy
   */
  setRetentionPolicy(policy: RetentionPolicy): void {
    this.dataRetention.setPolicy(policy);
  }

  /**
   * Get all retention policies
   */
  getAllRetentionPolicies(): RetentionPolicy[] {
    return this.dataRetention.getAllPolicies();
  }

  /**
   * Place legal hold on a resource
   */
  placeHold(resourceId: string, reason: string, context: AuditContext): void {
    this.dataRetention.placeHold(resourceId, reason, context);
  }

  /**
   * Release legal hold
   */
  releaseHold(resourceId: string, context: AuditContext): void {
    this.dataRetention.releaseHold(resourceId, context);
  }

  /**
   * Check if resource is on hold
   */
  isOnHold(resourceId: string): boolean {
    return this.dataRetention.isOnHold(resourceId);
  }

  /**
   * Run retention check
   */
  async runRetentionCheck(
    userId: string,
    context: AuditContext,
    dryRun = true
  ): Promise<Map<AuditResourceType, RetentionJob>> {
    return this.dataRetention.runRetentionCheck(userId, context, dryRun);
  }

  /**
   * Get retention job status
   */
  getRetentionJob(jobId: string): RetentionJob | undefined {
    return this.dataRetention.getJob(jobId);
  }

  /**
   * Get recent retention jobs
   */
  getRecentRetentionJobs(limit?: number): RetentionJob[] {
    return this.dataRetention.getRecentJobs(limit);
  }

  /**
   * Generate retention report
   */
  async generateRetentionReport(userId: string): Promise<{
    policies: RetentionPolicy[];
    holdCount: number;
    lastJobResults: Map<AuditResourceType, RetentionJob>;
    upcomingDeletions: Array<{
      resourceType: AuditResourceType;
      count: number;
      earliestDate: number;
    }>;
  }> {
    return this.dataRetention.generateRetentionReport(userId);
  }

  // ===========================================================================
  // Compliance Dashboard
  // ===========================================================================

  /**
   * Get compliance status overview
   */
  async getComplianceStatus(userId: string): Promise<{
    auditLogging: {
      enabled: boolean;
      retentionDays: number;
      recentEntryCount: number;
      failureCount: number;
    };
    accessControl: {
      rolesConfigured: number;
      customPermissions: number;
      recentDenials: number;
    };
    dataRetention: {
      policiesConfigured: number;
      holdsActive: number;
      pendingDeletions: number;
    };
    suspiciousActivity: Array<{
      type: string;
      description: string;
      actorId: string;
      count: number;
    }>;
    overallScore: number; // 0-100
  }> {
    // Get audit stats
    const stats = await this.auditStore.getStats();
    const recentFailures = await this.auditLogger.getFailedAttempts(
      userId,
      Date.now() - 24 * 60 * 60 * 1000,
      Date.now()
    );

    // Get suspicious activity
    const suspiciousActivity = await this.auditLogger.detectSuspiciousActivity(userId);

    // Calculate compliance score
    let score = 100;
    if (recentFailures.length > 10) score -= 10;
    if (suspiciousActivity.length > 0) score -= 20 * suspiciousActivity.length;
    if (this.dataRetention.getHolds().length > 10) score -= 5;
    score = Math.max(0, score);

    return {
      auditLogging: {
        enabled: true,
        retentionDays: this.config.auditLogRetentionDays,
        recentEntryCount: stats.totalLogs,
        failureCount: recentFailures.length,
      },
      accessControl: {
        rolesConfigured: 5, // admin, supervisor, rbt, billing, parent
        customPermissions: 0, // Would count actual custom permissions
        recentDenials: recentFailures.filter((f) => f.denialReason === 'Permission denied').length,
      },
      dataRetention: {
        policiesConfigured: this.dataRetention.getAllPolicies().length,
        holdsActive: this.dataRetention.getHolds().length,
        pendingDeletions: 0, // Would calculate from retention check
      },
      suspiciousActivity: suspiciousActivity.map((s) => ({
        type: s.type,
        description: s.description,
        actorId: s.actorId,
        count: s.count,
      })),
      overallScore: score,
    };
  }
}

// Re-export sub-components
export { AuditLogger, type AuditContext } from './audit-logger.js';
export {
  AccessController,
  type AccessRequest,
  type AccessResult,
  type Permission,
  AccessDeniedError,
  createAccessMiddleware,
} from './access-controller.js';
export {
  DataRetentionManager,
  type RetentionPolicy,
  type RetentionJob,
} from './data-retention.js';
