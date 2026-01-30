/**
 * Authorization Tracker
 *
 * Tracks authorization unit usage and provides utilization analytics.
 */

import { EventEmitter } from 'events';
import type { AuthorizationStore } from '../../stores/authorization-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type {
  Authorization,
  AuthorizationId,
  PatientId,
} from '../../types.js';
import type { AuthorizationConfig } from '../../config.js';
import { HEALTH_EVENTS } from '../../constants.js';

// =============================================================================
// Authorization Tracker Options
// =============================================================================

export interface AuthorizationTrackerOptions {
  authorizationStore: AuthorizationStore;
  patientStore: PatientStore;
  config: AuthorizationConfig;
}

// =============================================================================
// Utilization Report
// =============================================================================

export interface UtilizationReport {
  authorizationId: AuthorizationId;
  authorizationNumber: string;
  patientId: PatientId;
  patientName: string;
  serviceCode: string;
  totalUnits: number;
  usedUnits: number;
  remainingUnits: number;
  utilizationPercent: number;
  daysRemaining: number;
  projectedRunoutDate?: number;
  averageUnitsPerWeek: number;
  status: 'healthy' | 'warning' | 'critical';
}

// =============================================================================
// Authorization Tracker
// =============================================================================

export class AuthorizationTracker extends EventEmitter {
  private readonly authorizationStore: AuthorizationStore;
  private readonly patientStore: PatientStore;
  private readonly config: AuthorizationConfig;

  constructor(options: AuthorizationTrackerOptions) {
    super();
    this.authorizationStore = options.authorizationStore;
    this.patientStore = options.patientStore;
    this.config = options.config;
  }

  /**
   * Use authorization units
   */
  async useUnits(id: AuthorizationId, units: number): Promise<Authorization | null> {
    const auth = await this.authorizationStore.getAuthorization(id);
    if (!auth) return null;

    if (auth.remainingUnits < units) {
      throw new Error(
        `Insufficient units: requested ${units}, available ${auth.remainingUnits}`
      );
    }

    const updated = await this.authorizationStore.useUnits(id, units);

    if (updated) {
      // Check if units are now low
      const percentRemaining = (updated.remainingUnits / updated.totalUnits) * 100;

      for (const threshold of this.config.unitsAlertThresholds) {
        if (percentRemaining <= threshold * 100) {
          this.emit(HEALTH_EVENTS.AUTHORIZATION_LOW_UNITS, {
            authorizationId: id,
            remainingUnits: updated.remainingUnits,
            percentRemaining,
            threshold,
            timestamp: Date.now(),
          });
          break;
        }
      }
    }

    return updated;
  }

  /**
   * Refund authorization units (e.g., for cancelled sessions)
   */
  async refundUnits(id: AuthorizationId, units: number): Promise<Authorization | null> {
    return this.authorizationStore.refundUnits(id, units);
  }

  /**
   * Check if authorization has sufficient units
   */
  async hasAvailableUnits(id: AuthorizationId, unitsNeeded: number): Promise<boolean> {
    const remaining = await this.authorizationStore.getUnitsRemaining(id);
    return remaining !== null && remaining >= unitsNeeded;
  }

  /**
   * Get units remaining for an authorization
   */
  async getUnitsRemaining(id: AuthorizationId): Promise<number | null> {
    return this.authorizationStore.getUnitsRemaining(id);
  }

  /**
   * Calculate units needed for a session
   */
  calculateUnitsForSession(durationMinutes: number, minutesPerUnit = 15): number {
    return Math.ceil(durationMinutes / minutesPerUnit);
  }

  /**
   * Get utilization report for an authorization
   */
  async getUtilizationReport(id: AuthorizationId): Promise<UtilizationReport | null> {
    const auth = await this.authorizationStore.getAuthorization(id);
    if (!auth) return null;

    const patient = await this.patientStore.getPatient(auth.patientId);
    if (!patient) return null;

    const now = Date.now();
    const daysSinceStart = Math.max(1, (now - auth.startDate) / (24 * 60 * 60 * 1000));
    const daysRemaining = Math.max(0, (auth.endDate - now) / (24 * 60 * 60 * 1000));
    const weeksSinceStart = daysSinceStart / 7;

    const utilizationPercent = (auth.usedUnits / auth.totalUnits) * 100;
    const averageUnitsPerWeek = auth.usedUnits / weeksSinceStart;

    // Project when units will run out
    let projectedRunoutDate: number | undefined;
    if (averageUnitsPerWeek > 0 && auth.remainingUnits > 0) {
      const weeksRemaining = auth.remainingUnits / averageUnitsPerWeek;
      projectedRunoutDate = now + weeksRemaining * 7 * 24 * 60 * 60 * 1000;
    }

    // Determine status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    const percentRemaining = (auth.remainingUnits / auth.totalUnits) * 100;

    if (percentRemaining <= 10 || daysRemaining <= 7) {
      status = 'critical';
    } else if (percentRemaining <= 20 || daysRemaining <= 14) {
      status = 'warning';
    }

    // Also critical if projected runout is before end date
    if (projectedRunoutDate && projectedRunoutDate < auth.endDate) {
      status = 'warning';
      if (projectedRunoutDate < now + 14 * 24 * 60 * 60 * 1000) {
        status = 'critical';
      }
    }

    return {
      authorizationId: auth.id,
      authorizationNumber: auth.authorizationNumber,
      patientId: auth.patientId,
      patientName: `${patient.firstName} ${patient.lastName}`,
      serviceCode: auth.serviceCode,
      totalUnits: auth.totalUnits,
      usedUnits: auth.usedUnits,
      remainingUnits: auth.remainingUnits,
      utilizationPercent,
      daysRemaining: Math.ceil(daysRemaining),
      projectedRunoutDate,
      averageUnitsPerWeek,
      status,
    };
  }

  /**
   * Get utilization reports for all active authorizations
   */
  async getAllUtilizationReports(userId: string): Promise<UtilizationReport[]> {
    const activeAuths = await this.authorizationStore.getActiveAuthorizations(userId);
    const reports: UtilizationReport[] = [];

    for (const auth of activeAuths) {
      const report = await this.getUtilizationReport(auth.id);
      if (report) {
        reports.push(report);
      }
    }

    // Sort by status (critical first) then by days remaining
    reports.sort((a, b) => {
      const statusOrder = { critical: 0, warning: 1, healthy: 2 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return a.daysRemaining - b.daysRemaining;
    });

    return reports;
  }

  /**
   * Get patient's unit consumption summary
   */
  async getPatientUnitSummary(
    userId: string,
    patientId: PatientId
  ): Promise<{
    totalAuthorized: number;
    totalUsed: number;
    totalRemaining: number;
    byServiceCode: Array<{
      serviceCode: string;
      authorized: number;
      used: number;
      remaining: number;
    }>;
  }> {
    const authorizations = await this.authorizationStore.getActiveAuthorizations(
      userId,
      patientId
    );

    const byServiceCode = new Map<
      string,
      { authorized: number; used: number; remaining: number }
    >();

    let totalAuthorized = 0;
    let totalUsed = 0;
    let totalRemaining = 0;

    for (const auth of authorizations) {
      totalAuthorized += auth.totalUnits;
      totalUsed += auth.usedUnits;
      totalRemaining += auth.remainingUnits;

      const existing = byServiceCode.get(auth.serviceCode) ?? {
        authorized: 0,
        used: 0,
        remaining: 0,
      };

      byServiceCode.set(auth.serviceCode, {
        authorized: existing.authorized + auth.totalUnits,
        used: existing.used + auth.usedUnits,
        remaining: existing.remaining + auth.remainingUnits,
      });
    }

    return {
      totalAuthorized,
      totalUsed,
      totalRemaining,
      byServiceCode: Array.from(byServiceCode.entries()).map(([serviceCode, data]) => ({
        serviceCode,
        ...data,
      })),
    };
  }

  /**
   * Validate units before scheduling
   */
  async validateUnitsForScheduling(
    userId: string,
    patientId: PatientId,
    serviceCode: string,
    unitsNeeded: number
  ): Promise<{
    valid: boolean;
    authorization?: Authorization;
    error?: string;
  }> {
    const auth = await this.authorizationStore.getAuthorizationForService(
      userId,
      patientId,
      serviceCode
    );

    if (!auth) {
      return {
        valid: false,
        error: `No active authorization found for service code ${serviceCode}`,
      };
    }

    if (auth.remainingUnits < unitsNeeded) {
      return {
        valid: false,
        authorization: auth,
        error: `Insufficient units: need ${unitsNeeded}, have ${auth.remainingUnits}`,
      };
    }

    // Check if authorization will still be valid
    const now = Date.now();
    if (auth.endDate < now) {
      return {
        valid: false,
        authorization: auth,
        error: 'Authorization has expired',
      };
    }

    return {
      valid: true,
      authorization: auth,
    };
  }
}
