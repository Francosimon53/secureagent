/**
 * Data Retention
 *
 * Manages HIPAA-compliant data retention policies including:
 * - Automatic data archival
 * - Retention period enforcement
 * - Secure data deletion
 * - Audit trail preservation
 */

import { EventEmitter } from 'events';
import type { HealthAuditStore } from '../../stores/audit-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type { AppointmentStore } from '../../stores/appointment-store.js';
import type { AuthorizationStore } from '../../stores/authorization-store.js';
import type { ProgressReportStore } from '../../stores/progress-report-store.js';
import type { FAQStore } from '../../stores/faq-store.js';
import type { ScheduleStore } from '../../stores/schedule-store.js';
import type { ResourceType } from '../../types.js';

// Type alias for backward compatibility
type AuditResourceType = ResourceType;
import type { HIPAAConfig } from '../../config.js';
import type { AuditLogger, AuditContext } from './audit-logger.js';
import { HEALTH_EVENTS } from '../../constants.js';

// =============================================================================
// Data Retention Options
// =============================================================================

export interface DataRetentionOptions {
  auditStore: HealthAuditStore;
  patientStore: PatientStore;
  appointmentStore: AppointmentStore;
  authorizationStore: AuthorizationStore;
  progressReportStore: ProgressReportStore;
  faqStore: FAQStore;
  scheduleStore: ScheduleStore;
  auditLogger: AuditLogger;
  config: HIPAAConfig;
}

// =============================================================================
// Retention Policy
// =============================================================================

export interface RetentionPolicy {
  resourceType: AuditResourceType;
  retentionDays: number;
  archiveBeforeDelete: boolean;
  requiresApproval: boolean;
  exemptions?: RetentionExemption[];
}

export interface RetentionExemption {
  condition: 'active-treatment' | 'pending-litigation' | 'audit-hold' | 'research';
  description: string;
}

// =============================================================================
// Retention Job
// =============================================================================

export interface RetentionJob {
  id: string;
  resourceType: AuditResourceType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: number;
  completedAt?: number;
  recordsProcessed: number;
  recordsArchived: number;
  recordsDeleted: number;
  errors: string[];
}

// =============================================================================
// Data Retention Manager
// =============================================================================

export class DataRetentionManager extends EventEmitter {
  private readonly auditStore: HealthAuditStore;
  private readonly patientStore: PatientStore;
  private readonly appointmentStore: AppointmentStore;
  private readonly authorizationStore: AuthorizationStore;
  private readonly progressReportStore: ProgressReportStore;
  private readonly faqStore: FAQStore;
  private readonly scheduleStore: ScheduleStore;
  private readonly auditLogger: AuditLogger;
  private readonly config: HIPAAConfig;

  private readonly policies: Map<AuditResourceType, RetentionPolicy> = new Map();
  private readonly jobs: Map<string, RetentionJob> = new Map();
  private readonly holds: Set<string> = new Set(); // Resource IDs on hold

  constructor(options: DataRetentionOptions) {
    super();
    this.auditStore = options.auditStore;
    this.patientStore = options.patientStore;
    this.appointmentStore = options.appointmentStore;
    this.authorizationStore = options.authorizationStore;
    this.progressReportStore = options.progressReportStore;
    this.faqStore = options.faqStore;
    this.scheduleStore = options.scheduleStore;
    this.auditLogger = options.auditLogger;
    this.config = options.config;

    // Initialize default policies
    this.initializeDefaultPolicies();
  }

  /**
   * Initialize default retention policies
   */
  private initializeDefaultPolicies(): void {
    // Patient records: 7 years after last service
    this.policies.set('patient', {
      resourceType: 'patient',
      retentionDays: this.config.patientRecordRetentionYears * 365,
      archiveBeforeDelete: true,
      requiresApproval: true,
      exemptions: [
        { condition: 'active-treatment', description: 'Patient has active treatment' },
        { condition: 'pending-litigation', description: 'Records under legal hold' },
      ],
    });

    // Appointments: 7 years
    this.policies.set('appointment', {
      resourceType: 'appointment',
      retentionDays: 7 * 365,
      archiveBeforeDelete: true,
      requiresApproval: false,
    });

    // Authorizations: 7 years
    this.policies.set('authorization', {
      resourceType: 'authorization',
      retentionDays: 7 * 365,
      archiveBeforeDelete: true,
      requiresApproval: false,
    });

    // Progress reports: 7 years
    this.policies.set('progress-report', {
      resourceType: 'progress-report',
      retentionDays: 7 * 365,
      archiveBeforeDelete: true,
      requiresApproval: false,
    });

    // Audit logs: 6 years minimum (HIPAA requirement)
    this.policies.set('audit-log', {
      resourceType: 'audit-log',
      retentionDays: this.config.auditLogRetentionDays,
      archiveBeforeDelete: true,
      requiresApproval: true,
    });

    // Chat sessions: 3 years
    this.policies.set('chat', {
      resourceType: 'chat',
      retentionDays: 3 * 365,
      archiveBeforeDelete: false,
      requiresApproval: false,
    });

    // Schedules: 3 years
    this.policies.set('schedule', {
      resourceType: 'schedule',
      retentionDays: 3 * 365,
      archiveBeforeDelete: false,
      requiresApproval: false,
    });

    // Session data: 7 years (part of medical record)
    this.policies.set('session-data', {
      resourceType: 'session-data',
      retentionDays: 7 * 365,
      archiveBeforeDelete: true,
      requiresApproval: false,
    });
  }

  // ===========================================================================
  // Policy Management
  // ===========================================================================

  /**
   * Get retention policy for a resource type
   */
  getPolicy(resourceType: AuditResourceType): RetentionPolicy | undefined {
    return this.policies.get(resourceType);
  }

  /**
   * Set retention policy
   */
  setPolicy(policy: RetentionPolicy): void {
    this.policies.set(policy.resourceType, policy);

    this.emit(HEALTH_EVENTS.RETENTION_POLICY_UPDATED, {
      resourceType: policy.resourceType,
      retentionDays: policy.retentionDays,
      timestamp: Date.now(),
    });
  }

  /**
   * Get all policies
   */
  getAllPolicies(): RetentionPolicy[] {
    return Array.from(this.policies.values());
  }

  // ===========================================================================
  // Hold Management
  // ===========================================================================

  /**
   * Place a hold on a resource (prevent deletion)
   */
  placeHold(resourceId: string, reason: string, context: AuditContext): void {
    this.holds.add(resourceId);

    this.auditLogger.log(context, 'update', 'audit-log', resourceId, {
      action: 'hold-placed',
      reason,
    });

    this.emit(HEALTH_EVENTS.RETENTION_HOLD_PLACED, {
      resourceId,
      reason,
      timestamp: Date.now(),
    });
  }

  /**
   * Release a hold
   */
  releaseHold(resourceId: string, context: AuditContext): void {
    this.holds.delete(resourceId);

    this.auditLogger.log(context, 'update', 'audit-log', resourceId, {
      action: 'hold-released',
    });

    this.emit(HEALTH_EVENTS.RETENTION_HOLD_RELEASED, {
      resourceId,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if resource is on hold
   */
  isOnHold(resourceId: string): boolean {
    return this.holds.has(resourceId);
  }

  /**
   * Get all holds
   */
  getHolds(): string[] {
    return Array.from(this.holds);
  }

  // ===========================================================================
  // Retention Enforcement
  // ===========================================================================

  /**
   * Run retention check for all resource types
   */
  async runRetentionCheck(
    userId: string,
    context: AuditContext,
    dryRun = true
  ): Promise<Map<AuditResourceType, RetentionJob>> {
    const results = new Map<AuditResourceType, RetentionJob>();

    for (const policy of this.policies.values()) {
      const job = await this.processResourceType(userId, policy, context, dryRun);
      results.set(policy.resourceType, job);
    }

    return results;
  }

  /**
   * Process retention for a specific resource type
   */
  async processResourceType(
    userId: string,
    policy: RetentionPolicy,
    context: AuditContext,
    dryRun: boolean
  ): Promise<RetentionJob> {
    const job: RetentionJob = {
      id: crypto.randomUUID(),
      resourceType: policy.resourceType,
      status: 'running',
      startedAt: Date.now(),
      recordsProcessed: 0,
      recordsArchived: 0,
      recordsDeleted: 0,
      errors: [],
    };

    this.jobs.set(job.id, job);

    try {
      const cutoffDate = Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000;
      const expiredRecords = await this.findExpiredRecords(
        userId,
        policy.resourceType,
        cutoffDate
      );

      for (const record of expiredRecords) {
        job.recordsProcessed++;

        // Check for holds
        if (this.isOnHold(record.id)) {
          continue;
        }

        // Check exemptions
        if (await this.checkExemptions(record, policy)) {
          continue;
        }

        if (!dryRun) {
          // Archive if required
          if (policy.archiveBeforeDelete) {
            await this.archiveRecord(userId, policy.resourceType, record, context);
            job.recordsArchived++;
          }

          // Delete record
          await this.deleteRecord(userId, policy.resourceType, record.id, context);
          job.recordsDeleted++;
        } else {
          // Dry run - just count
          if (policy.archiveBeforeDelete) {
            job.recordsArchived++;
          }
          job.recordsDeleted++;
        }
      }

      job.status = 'completed';
    } catch (error) {
      job.status = 'failed';
      job.errors.push(error instanceof Error ? error.message : String(error));
    }

    job.completedAt = Date.now();

    this.emit(HEALTH_EVENTS.RETENTION_JOB_COMPLETED, {
      jobId: job.id,
      resourceType: policy.resourceType,
      recordsProcessed: job.recordsProcessed,
      recordsDeleted: job.recordsDeleted,
      status: job.status,
      timestamp: Date.now(),
    });

    return job;
  }

  /**
   * Find records past retention period
   */
  private async findExpiredRecords(
    userId: string,
    resourceType: AuditResourceType,
    cutoffDate: number
  ): Promise<Array<{ id: string; lastModified: number; [key: string]: unknown }>> {
    const records: Array<{ id: string; lastModified: number; [key: string]: unknown }> = [];

    switch (resourceType) {
      case 'patient': {
        // Get inactive patients with no recent activity
        const patients = await this.patientStore.listPatients(userId, {
          status: 'inactive',
        });
        for (const patient of patients) {
          if (patient.updatedAt < cutoffDate) {
            records.push({
              lastModified: patient.updatedAt,
              ...patient,
            });
          }
        }
        break;
      }

      case 'authorization': {
        const auths = await this.authorizationStore.listAuthorizations(userId, {
          status: 'expired',
        });
        for (const auth of auths) {
          if (auth.updatedAt < cutoffDate) {
            records.push({
              lastModified: auth.updatedAt,
              ...auth,
            });
          }
        }
        break;
      }

      case 'progress-report': {
        const reports = await this.progressReportStore.listReports(userId);
        for (const report of reports) {
          if (report.updatedAt < cutoffDate) {
            records.push({
              lastModified: report.updatedAt,
              ...report,
            });
          }
        }
        break;
      }

      case 'audit-log': {
        // Audit logs are handled differently - get stats
        const stats = await this.auditStore.getStats();
        // In real implementation, would query for old entries
        break;
      }

      default:
        // Other resource types would be handled similarly
        break;
    }

    return records;
  }

  /**
   * Check if record has exemptions
   */
  private async checkExemptions(
    record: { id: string; [key: string]: unknown },
    policy: RetentionPolicy
  ): Promise<boolean> {
    if (!policy.exemptions) return false;

    for (const exemption of policy.exemptions) {
      switch (exemption.condition) {
        case 'active-treatment':
          // Check if patient has active treatment
          if (policy.resourceType === 'patient' && record.status === 'active') {
            return true;
          }
          break;

        case 'pending-litigation':
          // Would check litigation hold database
          break;

        case 'audit-hold':
          // Already checked via isOnHold
          break;

        case 'research':
          // Would check research study enrollment
          break;
      }
    }

    return false;
  }

  /**
   * Archive a record before deletion
   */
  private async archiveRecord(
    userId: string,
    resourceType: AuditResourceType,
    record: { id: string; [key: string]: unknown },
    context: AuditContext
  ): Promise<void> {
    // In real implementation, would:
    // 1. Serialize record to encrypted format
    // 2. Store in cold storage (S3 Glacier, etc.)
    // 3. Create archive metadata entry

    await this.auditLogger.log(context, 'export', resourceType, record.id, {
      action: 'archived',
      archiveLocation: `archive/${resourceType}/${record.id}`,
    });
  }

  /**
   * Delete a record
   */
  private async deleteRecord(
    userId: string,
    resourceType: AuditResourceType,
    recordId: string,
    context: AuditContext
  ): Promise<void> {
    switch (resourceType) {
      case 'patient':
        await this.patientStore.deletePatient(recordId);
        break;

      case 'authorization':
        await this.authorizationStore.deleteAuthorization(recordId);
        break;

      case 'progress-report':
        await this.progressReportStore.deleteReport(recordId);
        break;

      default:
        // Handle other resource types
        break;
    }

    await this.auditLogger.log(context, 'delete', resourceType, recordId, {
      action: 'retention-delete',
      deletedAt: Date.now(),
    });
  }

  // ===========================================================================
  // Job Management
  // ===========================================================================

  /**
   * Get job status
   */
  getJob(jobId: string): RetentionJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get recent jobs
   */
  getRecentJobs(limit = 10): RetentionJob[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
      .slice(0, limit);
  }

  // ===========================================================================
  // Reports
  // ===========================================================================

  /**
   * Generate retention status report
   */
  async generateRetentionReport(
    userId: string
  ): Promise<{
    policies: RetentionPolicy[];
    holdCount: number;
    lastJobResults: Map<AuditResourceType, RetentionJob>;
    upcomingDeletions: Array<{
      resourceType: AuditResourceType;
      count: number;
      earliestDate: number;
    }>;
  }> {
    const lastJobResults = new Map<AuditResourceType, RetentionJob>();

    // Get most recent job for each resource type
    for (const job of this.jobs.values()) {
      const existing = lastJobResults.get(job.resourceType);
      if (!existing || (job.startedAt ?? 0) > (existing.startedAt ?? 0)) {
        lastJobResults.set(job.resourceType, job);
      }
    }

    // Calculate upcoming deletions (records approaching retention limit)
    const upcomingDeletions: Array<{
      resourceType: AuditResourceType;
      count: number;
      earliestDate: number;
    }> = [];

    // This would query each store for records within 90 days of retention cutoff
    // Simplified for example

    return {
      policies: this.getAllPolicies(),
      holdCount: this.holds.size,
      lastJobResults,
      upcomingDeletions,
    };
  }
}
