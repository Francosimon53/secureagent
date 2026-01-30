/**
 * Expiration Monitor
 *
 * Monitors authorization expirations and low unit levels.
 * Sends alerts at configurable thresholds (30/14/7 days, 20%/10% units).
 */

import { EventEmitter } from 'events';
import type { AuthorizationStore } from '../../stores/authorization-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type {
  Authorization,
  AuthorizationAlert,
  Patient,
  PatientContact,
} from '../../types.js';
import type { NotificationProvider, NotificationMessage } from '../../providers/notification/types.js';
import type { AuthorizationConfig, NotificationConfig } from '../../config.js';
import { HEALTH_EVENTS, NOTIFICATION_TEMPLATES } from '../../constants.js';

// =============================================================================
// Expiration Monitor Options
// =============================================================================

export interface ExpirationMonitorOptions {
  authorizationStore: AuthorizationStore;
  patientStore: PatientStore;
  smsProvider?: NotificationProvider;
  emailProvider?: NotificationProvider;
  config: AuthorizationConfig;
  notificationConfig: NotificationConfig;
}

// =============================================================================
// Expiration Monitor
// =============================================================================

export class ExpirationMonitor extends EventEmitter {
  private readonly authorizationStore: AuthorizationStore;
  private readonly patientStore: PatientStore;
  private readonly smsProvider?: NotificationProvider;
  private readonly emailProvider?: NotificationProvider;
  private readonly config: AuthorizationConfig;
  private readonly notificationConfig: NotificationConfig;

  constructor(options: ExpirationMonitorOptions) {
    super();
    this.authorizationStore = options.authorizationStore;
    this.patientStore = options.patientStore;
    this.smsProvider = options.smsProvider;
    this.emailProvider = options.emailProvider;
    this.config = options.config;
    this.notificationConfig = options.notificationConfig;
  }

  /**
   * Check for expiring authorizations and send alerts
   */
  async checkExpirations(userId: string): Promise<number> {
    let alertCount = 0;

    for (const days of this.config.alertThresholdsDays) {
      const expiring = await this.authorizationStore.getExpiringAuthorizations(userId, days);

      for (const auth of expiring) {
        const daysUntil = Math.ceil((auth.endDate - Date.now()) / (24 * 60 * 60 * 1000));

        // Check if we already sent an alert at this threshold
        const alreadyAlerted = auth.alerts.some(
          (a) =>
            a.type === 'expiring' &&
            a.daysUntilExpiration !== undefined &&
            a.daysUntilExpiration <= days &&
            a.daysUntilExpiration > days - 7 // Within the same threshold window
        );

        if (alreadyAlerted) continue;

        // Create alert
        await this.createExpirationAlert(auth, daysUntil, days);
        alertCount++;
      }
    }

    // Update expired authorizations
    await this.authorizationStore.updateExpiredAuthorizations(userId);

    return alertCount;
  }

  /**
   * Check for low unit authorizations and send alerts
   */
  async checkLowUnits(userId: string): Promise<number> {
    let alertCount = 0;

    for (const threshold of this.config.unitsAlertThresholds) {
      const lowUnits = await this.authorizationStore.getLowUnitAuthorizations(
        userId,
        threshold
      );

      for (const auth of lowUnits) {
        const percentRemaining = (auth.remainingUnits / auth.totalUnits) * 100;

        // Check if we already sent an alert at this threshold
        const alreadyAlerted = auth.alerts.some(
          (a) =>
            a.type === 'low-units' &&
            a.unitsRemainingPercent !== undefined &&
            a.unitsRemainingPercent <= threshold * 100 + 5 // Within 5% of threshold
        );

        if (alreadyAlerted) continue;

        // Create alert
        await this.createLowUnitsAlert(auth, percentRemaining, threshold);
        alertCount++;
      }
    }

    return alertCount;
  }

  /**
   * Create and send expiration alert
   */
  private async createExpirationAlert(
    auth: Authorization,
    daysUntil: number,
    thresholdDays: number
  ): Promise<void> {
    const patient = await this.patientStore.getPatient(auth.patientId);
    if (!patient) return;

    // Determine severity
    const severity: 'info' | 'warning' | 'critical' =
      daysUntil <= 7 ? 'critical' : daysUntil <= 14 ? 'warning' : 'info';

    // Create alert in store
    const alert: Omit<AuthorizationAlert, 'id'> = {
      authorizationId: auth.id,
      type: 'expiring',
      severity,
      message: `Authorization expires in ${daysUntil} days`,
      daysUntilExpiration: daysUntil,
      createdAt: Date.now(),
    };

    await this.authorizationStore.addAlert(auth.id, alert);

    // Send notification
    await this.sendExpirationNotification(auth, patient, daysUntil);

    // Update status if needed
    if (auth.status === 'approved' && daysUntil <= 30) {
      await this.authorizationStore.updateStatus(auth.id, 'expiring-soon');
    }

    this.emit(HEALTH_EVENTS.AUTHORIZATION_EXPIRING, {
      authorizationId: auth.id,
      patientId: auth.patientId,
      daysUntilExpiration: daysUntil,
      timestamp: Date.now(),
    });
  }

  /**
   * Create and send low units alert
   */
  private async createLowUnitsAlert(
    auth: Authorization,
    percentRemaining: number,
    threshold: number
  ): Promise<void> {
    const patient = await this.patientStore.getPatient(auth.patientId);
    if (!patient) return;

    // Determine severity
    const severity: 'info' | 'warning' | 'critical' =
      threshold <= 0.1 ? 'critical' : 'warning';

    // Create alert in store
    const alert: Omit<AuthorizationAlert, 'id'> = {
      authorizationId: auth.id,
      type: 'low-units',
      severity,
      message: `Only ${Math.round(percentRemaining)}% of units remaining`,
      unitsRemainingPercent: percentRemaining,
      createdAt: Date.now(),
    };

    await this.authorizationStore.addAlert(auth.id, alert);

    // Send notification
    await this.sendLowUnitsNotification(auth, patient, percentRemaining);

    this.emit(HEALTH_EVENTS.AUTHORIZATION_LOW_UNITS, {
      authorizationId: auth.id,
      patientId: auth.patientId,
      remainingUnits: auth.remainingUnits,
      percentRemaining,
      timestamp: Date.now(),
    });
  }

  /**
   * Send expiration notification
   */
  private async sendExpirationNotification(
    auth: Authorization,
    patient: Patient,
    daysUntil: number
  ): Promise<void> {
    const contact = await this.patientStore.getPrimaryContact(patient.id);
    if (!contact) return;

    const message = this.buildExpirationMessage(auth, patient, contact, daysUntil);

    await this.sendNotification(contact, message);
  }

  /**
   * Send low units notification
   */
  private async sendLowUnitsNotification(
    auth: Authorization,
    patient: Patient,
    percentRemaining: number
  ): Promise<void> {
    const contact = await this.patientStore.getPrimaryContact(patient.id);
    if (!contact) return;

    const message = this.buildLowUnitsMessage(auth, patient, contact, percentRemaining);

    await this.sendNotification(contact, message);
  }

  /**
   * Send notification via configured channels
   */
  private async sendNotification(
    contact: PatientContact,
    message: NotificationMessage
  ): Promise<void> {
    const channel = this.notificationConfig.defaultChannel;

    const recipient = {
      phone: channel !== 'email' ? contact.phone : undefined,
      email: channel === 'email' ? contact.email : undefined,
      name: `${contact.firstName} ${contact.lastName}`,
      language: contact.language,
    };

    // Try primary channel
    const provider =
      channel === 'sms' ? this.smsProvider : channel === 'email' ? this.emailProvider : undefined;

    if (provider) {
      try {
        await provider.send(recipient, message);
        return;
      } catch {
        // Fall through to fallback
      }
    }

    // Try fallback channels
    for (const fallback of this.notificationConfig.fallbackChannels) {
      if (fallback === channel) continue;

      const fallbackProvider =
        fallback === 'sms'
          ? this.smsProvider
          : fallback === 'email'
            ? this.emailProvider
            : undefined;

      if (!fallbackProvider) continue;

      const fallbackRecipient = {
        phone: fallback !== 'email' ? contact.phone : undefined,
        email: fallback === 'email' ? contact.email : undefined,
        name: `${contact.firstName} ${contact.lastName}`,
        language: contact.language,
      };

      if ((fallback === 'email' && !contact.email) || (fallback !== 'email' && !contact.phone)) {
        continue;
      }

      try {
        await fallbackProvider.send(fallbackRecipient, message);
        return;
      } catch {
        // Continue to next fallback
      }
    }
  }

  /**
   * Build expiration notification message
   */
  private buildExpirationMessage(
    auth: Authorization,
    patient: Patient,
    contact: PatientContact,
    daysUntil: number
  ): NotificationMessage {
    const template = NOTIFICATION_TEMPLATES.AUTHORIZATION_EXPIRING_30;

    const variables: Record<string, string> = {
      patientFirstName: patient.firstName,
      patientLastName: patient.lastName,
      contactName: `${contact.firstName} ${contact.lastName}`,
      authNumber: auth.authorizationNumber,
      serviceName: auth.serviceDescription,
      expirationDate: new Date(auth.endDate).toLocaleDateString(),
      unitsRemaining: String(auth.remainingUnits),
      clinicPhone: '(555) 123-4567',
      clinicName: 'ABA Therapy Center',
    };

    return {
      templateId: 'auth-expiring-30',
      text: this.applyVariables(template.sms, variables),
      html: this.applyVariables(template.email.body, variables),
      subject: this.applyVariables(template.email.subject, variables),
      variables,
    };
  }

  /**
   * Build low units notification message
   */
  private buildLowUnitsMessage(
    auth: Authorization,
    patient: Patient,
    contact: PatientContact,
    percentRemaining: number
  ): NotificationMessage {
    const template = NOTIFICATION_TEMPLATES.AUTHORIZATION_LOW_UNITS;

    const variables: Record<string, string> = {
      patientFirstName: patient.firstName,
      patientLastName: patient.lastName,
      contactName: `${contact.firstName} ${contact.lastName}`,
      authNumber: auth.authorizationNumber,
      unitsRemaining: String(auth.remainingUnits),
      totalUnits: String(auth.totalUnits),
      percentRemaining: String(Math.round(percentRemaining)),
      expirationDate: new Date(auth.endDate).toLocaleDateString(),
      clinicPhone: '(555) 123-4567',
      clinicName: 'ABA Therapy Center',
    };

    return {
      templateId: 'auth-low-units',
      text: this.applyVariables(template.sms, variables),
      html: this.applyVariables(template.email.body, variables),
      subject: this.applyVariables(template.email.subject, variables),
      variables,
    };
  }

  /**
   * Apply variables to template string
   */
  private applyVariables(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  }
}
