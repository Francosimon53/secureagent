/**
 * Alert Engine
 *
 * Monitors appointments and authorizations for:
 * - Upcoming appointments needing confirmation
 * - Authorization expirations
 * - Low authorization units
 * - No-show patterns
 */

import { EventEmitter } from 'events';
import type { AppointmentStore } from '../stores/appointment-store.js';
import type { AuthorizationStore } from '../stores/authorization-store.js';
import type { PatientStore } from '../stores/patient-store.js';
import type {
  Appointment,
  Authorization,
  AuthorizationAlert,
  Patient,
} from '../types.js';
import type { AuthorizationConfig } from '../config.js';
import { HEALTH_EVENTS, HEALTH_DEFAULTS } from '../constants.js';

// =============================================================================
// Alert Types
// =============================================================================

export interface Alert {
  id: string;
  type: 'authorization-expiring' | 'authorization-low-units' | 'appointment-unconfirmed' | 'no-show-pattern';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  resourceType: 'appointment' | 'authorization' | 'patient';
  resourceId: string;
  patientId?: string;
  patientName?: string;
  createdAt: number;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Alert Engine Options
// =============================================================================

export interface AlertEngineOptions {
  appointmentStore: AppointmentStore;
  authorizationStore: AuthorizationStore;
  patientStore: PatientStore;
  authorizationConfig: AuthorizationConfig;
}

// =============================================================================
// Alert Engine
// =============================================================================

export class AlertEngine extends EventEmitter {
  private readonly appointmentStore: AppointmentStore;
  private readonly authorizationStore: AuthorizationStore;
  private readonly patientStore: PatientStore;
  private readonly config: AuthorizationConfig;

  constructor(options: AlertEngineOptions) {
    super();
    this.appointmentStore = options.appointmentStore;
    this.authorizationStore = options.authorizationStore;
    this.patientStore = options.patientStore;
    this.config = options.authorizationConfig;
  }

  /**
   * Run all alert checks and return generated alerts
   */
  async runAlertChecks(userId: string): Promise<Alert[]> {
    const alerts: Alert[] = [];

    // Check authorization expirations
    const expiringAlerts = await this.checkAuthorizationExpirations(userId);
    alerts.push(...expiringAlerts);

    // Check authorization units
    const lowUnitAlerts = await this.checkAuthorizationUnits(userId);
    alerts.push(...lowUnitAlerts);

    // Check unconfirmed appointments
    const unconfirmedAlerts = await this.checkUnconfirmedAppointments(userId);
    alerts.push(...unconfirmedAlerts);

    // Check no-show patterns
    const noShowAlerts = await this.checkNoShowPatterns(userId);
    alerts.push(...noShowAlerts);

    return alerts;
  }

  /**
   * Check for expiring authorizations
   */
  async checkAuthorizationExpirations(userId: string): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const thresholds = this.config.alertThresholdsDays;

    for (const days of thresholds) {
      const expiring = await this.authorizationStore.getExpiringAuthorizations(userId, days);

      for (const auth of expiring) {
        // Check if alert already exists and is not acknowledged
        const existingAlert = auth.alerts.find(
          (a) =>
            a.type === 'expiring' &&
            a.daysUntilExpiration === days &&
            !a.acknowledgedAt
        );

        if (existingAlert) continue;

        const patient = await this.patientStore.getPatient(auth.patientId);
        const daysUntil = Math.ceil((auth.endDate - Date.now()) / (24 * 60 * 60 * 1000));

        const alert: Alert = {
          id: crypto.randomUUID(),
          type: 'authorization-expiring',
          severity: days <= 7 ? 'critical' : days <= 14 ? 'warning' : 'info',
          title: `Authorization Expiring in ${daysUntil} Days`,
          message: `Authorization ${auth.authorizationNumber} for ${patient?.firstName ?? 'Patient'} ${patient?.lastName ?? ''} expires on ${new Date(auth.endDate).toLocaleDateString()}`,
          resourceType: 'authorization',
          resourceId: auth.id,
          patientId: auth.patientId,
          patientName: patient ? `${patient.firstName} ${patient.lastName}` : undefined,
          createdAt: Date.now(),
          metadata: {
            authorizationNumber: auth.authorizationNumber,
            serviceCode: auth.serviceCode,
            endDate: auth.endDate,
            daysUntilExpiration: daysUntil,
          },
        };

        alerts.push(alert);

        // Add alert to authorization
        const authAlert: Omit<AuthorizationAlert, 'id'> = {
          authorizationId: auth.id,
          type: 'expiring',
          severity: alert.severity,
          message: alert.message,
          daysUntilExpiration: daysUntil,
          createdAt: Date.now(),
        };

        await this.authorizationStore.addAlert(auth.id, authAlert);

        this.emit(HEALTH_EVENTS.AUTHORIZATION_EXPIRING, {
          authorizationId: auth.id,
          patientId: auth.patientId,
          daysUntilExpiration: daysUntil,
          timestamp: Date.now(),
        });
      }
    }

    return alerts;
  }

  /**
   * Check for low authorization units
   */
  async checkAuthorizationUnits(userId: string): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const thresholds = this.config.unitsAlertThresholds;

    for (const threshold of thresholds) {
      const lowUnits = await this.authorizationStore.getLowUnitAuthorizations(
        userId,
        threshold
      );

      for (const auth of lowUnits) {
        const percentRemaining = (auth.remainingUnits / auth.totalUnits) * 100;

        // Check if alert already exists for this threshold
        const existingAlert = auth.alerts.find(
          (a) =>
            a.type === 'low-units' &&
            a.unitsRemainingPercent !== undefined &&
            Math.abs(a.unitsRemainingPercent - percentRemaining) < 5 &&
            !a.acknowledgedAt
        );

        if (existingAlert) continue;

        const patient = await this.patientStore.getPatient(auth.patientId);

        const alert: Alert = {
          id: crypto.randomUUID(),
          type: 'authorization-low-units',
          severity: threshold <= 0.1 ? 'critical' : 'warning',
          title: `Authorization Low on Units (${Math.round(percentRemaining)}% remaining)`,
          message: `Authorization ${auth.authorizationNumber} for ${patient?.firstName ?? 'Patient'} ${patient?.lastName ?? ''} has only ${auth.remainingUnits} of ${auth.totalUnits} units remaining`,
          resourceType: 'authorization',
          resourceId: auth.id,
          patientId: auth.patientId,
          patientName: patient ? `${patient.firstName} ${patient.lastName}` : undefined,
          createdAt: Date.now(),
          metadata: {
            authorizationNumber: auth.authorizationNumber,
            serviceCode: auth.serviceCode,
            totalUnits: auth.totalUnits,
            usedUnits: auth.usedUnits,
            remainingUnits: auth.remainingUnits,
            percentRemaining,
          },
        };

        alerts.push(alert);

        // Add alert to authorization
        const authAlert: Omit<AuthorizationAlert, 'id'> = {
          authorizationId: auth.id,
          type: 'low-units',
          severity: alert.severity,
          message: alert.message,
          unitsRemainingPercent: percentRemaining,
          createdAt: Date.now(),
        };

        await this.authorizationStore.addAlert(auth.id, authAlert);

        this.emit(HEALTH_EVENTS.AUTHORIZATION_LOW_UNITS, {
          authorizationId: auth.id,
          patientId: auth.patientId,
          remainingUnits: auth.remainingUnits,
          percentRemaining,
          timestamp: Date.now(),
        });
      }
    }

    return alerts;
  }

  /**
   * Check for unconfirmed appointments
   */
  async checkUnconfirmedAppointments(userId: string): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const pendingConfirmations = await this.appointmentStore.getPendingConfirmations(userId);

    // Only alert for appointments within 48 hours
    const cutoff = Date.now() + 48 * 60 * 60 * 1000;

    for (const apt of pendingConfirmations) {
      if (apt.startTime > cutoff) continue;

      const patient = await this.patientStore.getPatient(apt.patientId);
      const hoursUntil = Math.round((apt.startTime - Date.now()) / (60 * 60 * 1000));

      const alert: Alert = {
        id: crypto.randomUUID(),
        type: 'appointment-unconfirmed',
        severity: hoursUntil <= 12 ? 'critical' : hoursUntil <= 24 ? 'warning' : 'info',
        title: `Unconfirmed Appointment in ${hoursUntil} Hours`,
        message: `Appointment for ${patient?.firstName ?? 'Patient'} ${patient?.lastName ?? ''} on ${new Date(apt.startTime).toLocaleString()} has not been confirmed`,
        resourceType: 'appointment',
        resourceId: apt.id,
        patientId: apt.patientId,
        patientName: patient ? `${patient.firstName} ${patient.lastName}` : undefined,
        createdAt: Date.now(),
        metadata: {
          startTime: apt.startTime,
          hoursUntil,
          remindersSent: apt.reminders.filter((r) => r.status === 'sent').length,
        },
      };

      alerts.push(alert);
    }

    return alerts;
  }

  /**
   * Check for patients with no-show patterns
   */
  async checkNoShowPatterns(userId: string): Promise<Alert[]> {
    const alerts: Alert[] = [];

    // Look at last 90 days
    const endDate = Date.now();
    const startDate = endDate - 90 * 24 * 60 * 60 * 1000;

    const noShows = await this.appointmentStore.getNoShowAppointments(userId, startDate, endDate);

    // Group by patient
    const patientNoShows = new Map<string, number>();
    for (const apt of noShows) {
      patientNoShows.set(apt.patientId, (patientNoShows.get(apt.patientId) ?? 0) + 1);
    }

    // Alert for patients with 3+ no-shows
    for (const [patientId, count] of patientNoShows) {
      if (count < 3) continue;

      const patient = await this.patientStore.getPatient(patientId);

      const alert: Alert = {
        id: crypto.randomUUID(),
        type: 'no-show-pattern',
        severity: count >= 5 ? 'critical' : 'warning',
        title: `No-Show Pattern Detected: ${count} No-Shows`,
        message: `${patient?.firstName ?? 'Patient'} ${patient?.lastName ?? ''} has ${count} no-shows in the past 90 days`,
        resourceType: 'patient',
        resourceId: patientId,
        patientId,
        patientName: patient ? `${patient.firstName} ${patient.lastName}` : undefined,
        createdAt: Date.now(),
        metadata: {
          noShowCount: count,
          period: '90 days',
        },
      };

      alerts.push(alert);
    }

    return alerts;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(
    alertType: string,
    resourceId: string,
    acknowledgedBy: string
  ): Promise<void> {
    // For authorization alerts, update in the store
    if (alertType.startsWith('authorization-')) {
      const auth = await this.authorizationStore.getAuthorization(resourceId);
      if (auth) {
        const unacknowledgedAlert = auth.alerts.find((a) => !a.acknowledgedAt);
        if (unacknowledgedAlert) {
          await this.authorizationStore.acknowledgeAlert(
            resourceId,
            unacknowledgedAlert.id,
            acknowledgedBy
          );
        }
      }
    }
  }

  /**
   * Get all unacknowledged alerts
   */
  async getUnacknowledgedAlerts(userId: string): Promise<Alert[]> {
    const alerts: Alert[] = [];

    // Get authorization alerts
    const authAlerts = await this.authorizationStore.getUnacknowledgedAlerts(userId);
    for (const { authorization, alert } of authAlerts) {
      const patient = await this.patientStore.getPatient(authorization.patientId);
      alerts.push({
        id: alert.id,
        type: alert.type === 'expiring' ? 'authorization-expiring' : 'authorization-low-units',
        severity: alert.severity,
        title: alert.message,
        message: alert.message,
        resourceType: 'authorization',
        resourceId: authorization.id,
        patientId: authorization.patientId,
        patientName: patient ? `${patient.firstName} ${patient.lastName}` : undefined,
        createdAt: alert.createdAt,
        metadata: {
          daysUntilExpiration: alert.daysUntilExpiration,
          unitsRemainingPercent: alert.unitsRemainingPercent,
        },
      });
    }

    return alerts;
  }

  /**
   * Get alert summary
   */
  async getAlertSummary(userId: string): Promise<{
    critical: number;
    warning: number;
    info: number;
    total: number;
    byType: Record<string, number>;
  }> {
    const alerts = await this.runAlertChecks(userId);

    const summary = {
      critical: 0,
      warning: 0,
      info: 0,
      total: alerts.length,
      byType: {} as Record<string, number>,
    };

    for (const alert of alerts) {
      if (alert.severity === 'critical') summary.critical++;
      else if (alert.severity === 'warning') summary.warning++;
      else summary.info++;

      summary.byType[alert.type] = (summary.byType[alert.type] ?? 0) + 1;
    }

    return summary;
  }
}
