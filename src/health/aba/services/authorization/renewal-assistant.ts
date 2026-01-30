/**
 * Renewal Assistant
 *
 * Assists with authorization renewal process by:
 * - Identifying authorizations needing renewal
 * - Calculating suggested units based on utilization
 * - Preparing renewal request data
 * - Tracking renewal request status
 */

import { EventEmitter } from 'events';
import type { AuthorizationStore } from '../../stores/authorization-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type {
  Authorization,
  AuthorizationId,
} from '../../types.js';
import type { AuthorizationConfig } from '../../config.js';
import { HEALTH_EVENTS } from '../../constants.js';

// =============================================================================
// Renewal Assistant Options
// =============================================================================

export interface RenewalAssistantOptions {
  authorizationStore: AuthorizationStore;
  patientStore: PatientStore;
  config: AuthorizationConfig;
}

// =============================================================================
// Renewal Request Data
// =============================================================================

export interface RenewalRequestData {
  authorization: Authorization;
  suggestedUnits: number;
  suggestedDuration: number; // days
  utilizationRate: number;
  justification: string;
  clinicalNotes?: string;
}

// =============================================================================
// Renewal Assistant
// =============================================================================

export class RenewalAssistant extends EventEmitter {
  private readonly authorizationStore: AuthorizationStore;
  private readonly patientStore: PatientStore;
  private readonly config: AuthorizationConfig;

  constructor(options: RenewalAssistantOptions) {
    super();
    this.authorizationStore = options.authorizationStore;
    this.patientStore = options.patientStore;
    this.config = options.config;
  }

  /**
   * Get authorizations that need renewal
   */
  async getAuthorizationsNeedingRenewal(userId: string): Promise<Authorization[]> {
    const renewalWindowDays = this.config.renewalLeadTimeDays;
    const expiring = await this.authorizationStore.getExpiringAuthorizations(
      userId,
      renewalWindowDays
    );

    // Filter out those already in renewal process
    return expiring.filter(
      (auth) =>
        auth.status !== 'pending' &&
        auth.status !== 'denied' &&
        !auth.renewalRequested
    );
  }

  /**
   * Request authorization renewal
   */
  async requestRenewal(id: AuthorizationId): Promise<Authorization | null> {
    const auth = await this.authorizationStore.getAuthorization(id);
    if (!auth) return null;

    // Mark renewal as requested
    const updated = await this.authorizationStore.updateAuthorization(id, {
      renewalRequested: true,
      renewalRequestDate: Date.now(),
    });

    if (updated) {
      this.emit(HEALTH_EVENTS.AUTHORIZATION_RENEWAL_REQUESTED, {
        authorizationId: id,
        patientId: auth.patientId,
        timestamp: Date.now(),
      });
    }

    return updated;
  }

  /**
   * Prepare renewal request data with suggested values
   */
  async prepareRenewalRequest(id: AuthorizationId): Promise<RenewalRequestData | null> {
    const auth = await this.authorizationStore.getAuthorization(id);
    if (!auth) return null;

    const patient = await this.patientStore.getPatient(auth.patientId);
    if (!patient) return null;

    // Calculate utilization metrics
    const now = Date.now();
    const authDurationDays = (auth.endDate - auth.startDate) / (24 * 60 * 60 * 1000);
    const daysElapsed = Math.max(1, (now - auth.startDate) / (24 * 60 * 60 * 1000));
    const utilizationRate = auth.usedUnits / auth.totalUnits;

    // Project units needed for next period
    const unitsPerDay = auth.usedUnits / daysElapsed;
    const projectedUnitsNeeded = Math.ceil(unitsPerDay * authDurationDays);

    // Add buffer for variability (10%)
    const suggestedUnits = Math.ceil(projectedUnitsNeeded * 1.1);

    // Suggest same duration as current authorization
    const suggestedDuration = Math.ceil(authDurationDays);

    // Generate justification based on utilization
    const justification = this.generateJustification(auth, utilizationRate, patient);

    return {
      authorization: auth,
      suggestedUnits,
      suggestedDuration,
      utilizationRate,
      justification,
    };
  }

  /**
   * Calculate optimal units for renewal based on historical usage
   */
  async calculateOptimalUnits(
    userId: string,
    patientId: string,
    serviceCode: string
  ): Promise<{
    suggestedUnits: number;
    confidence: 'high' | 'medium' | 'low';
    rationale: string;
  }> {
    // Get historical authorizations for this patient/service
    const authorizations = await this.authorizationStore.listAuthorizations(userId, {
      patientId,
      serviceCode,
    });

    if (authorizations.length === 0) {
      return {
        suggestedUnits: 120, // Default for new patients (30 hours)
        confidence: 'low',
        rationale: 'No historical data available. Using default recommendation.',
      };
    }

    // Calculate average utilization across past authorizations
    const completedAuths = authorizations.filter(
      (a) => a.status === 'expired' || a.usedUnits >= a.totalUnits * 0.9
    );

    if (completedAuths.length === 0) {
      // Use current authorization's trajectory
      const currentAuth = authorizations.find((a) => a.status === 'approved');
      if (currentAuth) {
        const now = Date.now();
        const daysElapsed = Math.max(1, (now - currentAuth.startDate) / (24 * 60 * 60 * 1000));
        const authDuration = (currentAuth.endDate - currentAuth.startDate) / (24 * 60 * 60 * 1000);
        const projectedUsage = (currentAuth.usedUnits / daysElapsed) * authDuration;

        return {
          suggestedUnits: Math.ceil(projectedUsage * 1.1),
          confidence: 'medium',
          rationale: `Based on current authorization trajectory. Projected to use ${Math.round(projectedUsage)} units.`,
        };
      }

      return {
        suggestedUnits: 120,
        confidence: 'low',
        rationale: 'Insufficient historical data. Using default recommendation.',
      };
    }

    // Calculate weighted average (more recent = higher weight)
    let totalWeightedUnits = 0;
    let totalWeight = 0;

    completedAuths
      .sort((a, b) => b.endDate - a.endDate)
      .forEach((auth, index) => {
        const weight = 1 / (index + 1); // More recent gets higher weight
        totalWeightedUnits += auth.usedUnits * weight;
        totalWeight += weight;
      });

    const averageUnits = totalWeightedUnits / totalWeight;
    const suggestedUnits = Math.ceil(averageUnits * 1.1); // 10% buffer

    return {
      suggestedUnits,
      confidence: completedAuths.length >= 3 ? 'high' : 'medium',
      rationale: `Based on ${completedAuths.length} completed authorization(s). Average usage: ${Math.round(averageUnits)} units.`,
    };
  }

  /**
   * Check if authorization is eligible for renewal
   */
  async isEligibleForRenewal(id: AuthorizationId): Promise<{
    eligible: boolean;
    reason?: string;
  }> {
    const auth = await this.authorizationStore.getAuthorization(id);
    if (!auth) {
      return { eligible: false, reason: 'Authorization not found' };
    }

    // Check if already in renewal process
    if (auth.renewalRequested) {
      return { eligible: false, reason: 'Renewal already requested' };
    }

    // Check if denied
    if (auth.status === 'denied') {
      return { eligible: false, reason: 'Authorization was denied' };
    }

    // Check if too early for renewal
    const now = Date.now();
    const daysUntilExpiration = (auth.endDate - now) / (24 * 60 * 60 * 1000);

    if (daysUntilExpiration > this.config.renewalLeadTimeDays) {
      return {
        eligible: false,
        reason: `Too early for renewal. ${Math.ceil(daysUntilExpiration)} days until expiration.`,
      };
    }

    // Check if already expired
    if (auth.status === 'expired' || auth.endDate < now) {
      return {
        eligible: false,
        reason: 'Authorization has expired. New authorization required.',
      };
    }

    return { eligible: true };
  }

  /**
   * Get renewal timeline recommendations
   */
  getRenewalTimeline(auth: Authorization): {
    recommendedSubmitDate: number;
    latestSubmitDate: number;
    estimatedApprovalTime: number; // days
  } {
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;

    // Estimate processing time based on payer
    const estimatedApprovalTime = this.getEstimatedApprovalTime(auth.payerId);

    // Recommended: Submit with enough buffer for approval + contingency
    const recommendedBuffer = estimatedApprovalTime + 7; // Extra week for contingency
    const recommendedSubmitDate = auth.endDate - recommendedBuffer * msPerDay;

    // Latest: Absolute latest to avoid gap in coverage
    const latestSubmitDate = auth.endDate - estimatedApprovalTime * msPerDay;

    return {
      recommendedSubmitDate: Math.max(now, recommendedSubmitDate),
      latestSubmitDate: Math.max(now, latestSubmitDate),
      estimatedApprovalTime,
    };
  }

  /**
   * Generate justification text for renewal
   */
  private generateJustification(
    auth: Authorization,
    utilizationRate: number,
    patient: { firstName: string; lastName: string }
  ): string {
    const parts: string[] = [];

    // Introduction
    parts.push(
      `Request for renewal of authorization ${auth.authorizationNumber} for patient ${patient.firstName} ${patient.lastName}.`
    );

    // Utilization context
    const utilizationPercent = Math.round(utilizationRate * 100);
    if (utilizationPercent >= 90) {
      parts.push(
        `Patient has demonstrated excellent engagement with ${utilizationPercent}% utilization of authorized units, indicating ongoing medical necessity and treatment compliance.`
      );
    } else if (utilizationPercent >= 70) {
      parts.push(
        `Patient has maintained good treatment engagement with ${utilizationPercent}% utilization of authorized units.`
      );
    } else if (utilizationPercent >= 50) {
      parts.push(
        `Patient has utilized ${utilizationPercent}% of authorized units. Continued services are recommended to support treatment progress.`
      );
    } else {
      parts.push(
        `Patient has utilized ${utilizationPercent}% of authorized units. Factors affecting utilization have been addressed and continued authorization is requested.`
      );
    }

    // Service context
    parts.push(
      `Continuation of ${auth.serviceDescription} services is medically necessary to maintain progress toward treatment goals.`
    );

    return parts.join(' ');
  }

  /**
   * Get estimated approval time for a payer
   */
  private getEstimatedApprovalTime(payerId?: string): number {
    // Default estimates by payer (in days)
    const payerEstimates: Record<string, number> = {
      bcbs: 10,
      aetna: 14,
      cigna: 12,
      uhc: 14,
      medicaid: 21,
    };

    if (payerId && payerEstimates[payerId.toLowerCase()]) {
      return payerEstimates[payerId.toLowerCase()];
    }

    return 14; // Default 2 weeks
  }

  /**
   * Track renewal request status
   * Note: Status tracking is done via notes field since Authorization type
   * doesn't have dedicated renewal status fields
   */
  async updateRenewalStatus(
    id: AuthorizationId,
    status: 'submitted' | 'under-review' | 'approved' | 'denied' | 'info-requested',
    notes?: string
  ): Promise<Authorization | null> {
    const auth = await this.authorizationStore.getAuthorization(id);
    if (!auth) return null;

    const statusNote = `[Renewal ${status}${notes ? `: ${notes}` : ''}] ${new Date().toISOString()}`;
    const existingNotes = auth.notes ?? '';
    const updatedNotes = existingNotes ? `${existingNotes}\n${statusNote}` : statusNote;

    const updates: Partial<Authorization> = {
      notes: updatedNotes,
    };

    // If renewal is approved or denied, clear the renewal requested flag
    if (status === 'approved' || status === 'denied') {
      updates.renewalRequested = false;
    }

    return this.authorizationStore.updateAuthorization(id, updates);
  }

  /**
   * Get pending renewal requests
   */
  async getPendingRenewals(userId: string): Promise<Authorization[]> {
    const authorizations = await this.authorizationStore.listAuthorizations(userId, {
      status: 'approved',
    });

    // Return authorizations that have renewal requested
    return authorizations.filter((auth) => auth.renewalRequested);
  }
}
