/**
 * No-Show Handler
 *
 * Handles no-show detection and processing including:
 * - Automatic no-show detection after grace period
 * - No-show notifications to caregivers
 * - No-show tracking and reporting
 */

import { EventEmitter } from 'events';
import type { AppointmentStore } from '../../stores/appointment-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type { AuthorizationStore } from '../../stores/authorization-store.js';
import type {
  Appointment,
  Patient,
  PatientContact,
  AppointmentId,
} from '../../types.js';
import type { NotificationProvider, NotificationMessage } from '../../providers/notification/types.js';
import type { AppointmentConfig } from '../../config.js';
import { HEALTH_EVENTS, NOTIFICATION_TEMPLATES } from '../../constants.js';

// =============================================================================
// No-Show Handler Options
// =============================================================================

export interface NoShowHandlerOptions {
  appointmentStore: AppointmentStore;
  patientStore: PatientStore;
  authorizationStore: AuthorizationStore;
  smsProvider?: NotificationProvider;
  emailProvider?: NotificationProvider;
  config: AppointmentConfig;
}

// =============================================================================
// No-Show Handler
// =============================================================================

export class NoShowHandler extends EventEmitter {
  private readonly appointmentStore: AppointmentStore;
  private readonly patientStore: PatientStore;
  private readonly authorizationStore: AuthorizationStore;
  private readonly smsProvider?: NotificationProvider;
  private readonly emailProvider?: NotificationProvider;
  private readonly config: AppointmentConfig;

  constructor(options: NoShowHandlerOptions) {
    super();
    this.appointmentStore = options.appointmentStore;
    this.patientStore = options.patientStore;
    this.authorizationStore = options.authorizationStore;
    this.smsProvider = options.smsProvider;
    this.emailProvider = options.emailProvider;
    this.config = options.config;
  }

  /**
   * Mark an appointment as no-show
   */
  async markNoShow(
    appointmentId: AppointmentId,
    reason?: string
  ): Promise<Appointment | null> {
    const appointment = await this.appointmentStore.getAppointment(appointmentId);
    if (!appointment) {
      return null;
    }

    // Can only mark as no-show if status is scheduled, confirmed, or in-progress
    if (!['scheduled', 'confirmed', 'in-progress'].includes(appointment.status)) {
      return null;
    }

    // Update status
    const updated = await this.appointmentStore.updateStatus(
      appointmentId,
      'no-show',
      reason
    );

    if (updated) {
      // Send no-show notification
      await this.sendNoShowNotification(updated);

      this.emit(HEALTH_EVENTS.APPOINTMENT_NO_SHOW, {
        appointmentId,
        patientId: appointment.patientId,
        reason,
        timestamp: Date.now(),
      });
    }

    return updated;
  }

  /**
   * Process no-shows for appointments past their grace period
   * Called periodically by scheduler
   */
  async processNoShows(userId: string): Promise<number> {
    const now = Date.now();
    const gracePeriodMs = this.config.noShowGracePeriod * 60 * 1000;

    // Get appointments that should be checked for no-show
    const appointments = await this.appointmentStore.listAppointments(userId, {
      status: ['scheduled', 'confirmed'],
      endDate: now - gracePeriodMs, // Appointments that ended before grace period
    });

    let noShowCount = 0;

    for (const appointment of appointments) {
      // Only mark as no-show if appointment time + grace period has passed
      const noShowTime = appointment.startTime + gracePeriodMs;

      if (now >= noShowTime && !appointment.checkedInAt) {
        await this.markNoShow(
          appointment.id,
          `Auto-marked as no-show after ${this.config.noShowGracePeriod} minute grace period`
        );
        noShowCount++;
      }
    }

    return noShowCount;
  }

  /**
   * Send no-show notification to caregiver
   */
  private async sendNoShowNotification(appointment: Appointment): Promise<void> {
    const patient = await this.patientStore.getPatient(appointment.patientId);
    if (!patient) return;

    const contact = await this.patientStore.getPrimaryContact(appointment.patientId);
    if (!contact) return;

    const message = this.buildNoShowMessage(appointment, patient, contact);

    // Try SMS first
    if (this.smsProvider && contact.phone) {
      try {
        await this.smsProvider.send(
          {
            phone: contact.phone,
            name: `${contact.firstName} ${contact.lastName}`,
            language: contact.language,
          },
          message
        );
        return;
      } catch {
        // Fall through to email
      }
    }

    // Try email as fallback
    if (this.emailProvider && contact.email) {
      try {
        await this.emailProvider.send(
          {
            email: contact.email,
            name: `${contact.firstName} ${contact.lastName}`,
            language: contact.language,
          },
          message
        );
      } catch {
        // Log error but don't throw
        this.emit(HEALTH_EVENTS.REMINDER_FAILED, {
          appointmentId: appointment.id,
          error: 'Failed to send no-show notification',
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Build no-show notification message
   */
  private buildNoShowMessage(
    appointment: Appointment,
    patient: Patient,
    contact: PatientContact
  ): NotificationMessage {
    const template = NOTIFICATION_TEMPLATES.NO_SHOW_NOTIFICATION;

    const appointmentDate = new Date(appointment.startTime);
    const dateStr = appointmentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = appointmentDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    const variables: Record<string, string> = {
      patientFirstName: patient.firstName,
      patientLastName: patient.lastName,
      contactName: `${contact.firstName} ${contact.lastName}`,
      appointmentDate: dateStr,
      appointmentTime: timeStr,
      rbtName: appointment.rbtId ?? 'your provider',
      clinicPhone: '(555) 123-4567', // Should come from config
      clinicName: 'ABA Therapy Center', // Should come from config
    };

    return {
      templateId: 'no-show',
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

  /**
   * Get no-show statistics for a patient
   */
  async getPatientNoShowStats(
    userId: string,
    patientId: string,
    startDate: number,
    endDate: number
  ): Promise<{
    totalAppointments: number;
    noShows: number;
    noShowRate: number;
    lastNoShow?: Appointment;
  }> {
    const appointments = await this.appointmentStore.getAppointmentsByPatient(
      userId,
      patientId,
      {
        startDate,
        endDate,
        status: ['completed', 'no-show', 'cancelled'],
      }
    );

    const noShows = appointments.filter((a) => a.status === 'no-show');
    const completed = appointments.filter(
      (a) => a.status === 'completed' || a.status === 'no-show'
    );

    const lastNoShow = noShows.sort((a, b) => b.startTime - a.startTime)[0];

    return {
      totalAppointments: completed.length,
      noShows: noShows.length,
      noShowRate: completed.length > 0 ? (noShows.length / completed.length) * 100 : 0,
      lastNoShow,
    };
  }

  /**
   * Get no-show report for date range
   */
  async getNoShowReport(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<{
    totalNoShows: number;
    noShowsByPatient: Array<{
      patientId: string;
      patientName: string;
      noShowCount: number;
      noShowRate: number;
    }>;
    noShowsByRBT: Array<{
      rbtId: string;
      noShowCount: number;
    }>;
    noShowsByDayOfWeek: Record<string, number>;
    averageNoShowRate: number;
  }> {
    const noShows = await this.appointmentStore.getNoShowAppointments(
      userId,
      startDate,
      endDate
    );

    const allAppointments = await this.appointmentStore.getAppointmentsInRange(
      userId,
      startDate,
      endDate
    );

    // Group by patient
    const patientNoShows = new Map<string, { count: number; total: number }>();
    for (const apt of allAppointments) {
      if (!patientNoShows.has(apt.patientId)) {
        patientNoShows.set(apt.patientId, { count: 0, total: 0 });
      }
      const stats = patientNoShows.get(apt.patientId)!;
      stats.total++;
      if (apt.status === 'no-show') {
        stats.count++;
      }
    }

    // Group by RBT
    const rbtNoShows = new Map<string, number>();
    for (const apt of noShows) {
      if (apt.rbtId) {
        rbtNoShows.set(apt.rbtId, (rbtNoShows.get(apt.rbtId) ?? 0) + 1);
      }
    }

    // Group by day of week
    const dayOfWeekNoShows: Record<string, number> = {};
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const apt of noShows) {
      const day = dayNames[new Date(apt.startTime).getDay()];
      dayOfWeekNoShows[day] = (dayOfWeekNoShows[day] ?? 0) + 1;
    }

    // Get patient names
    const noShowsByPatient: Array<{
      patientId: string;
      patientName: string;
      noShowCount: number;
      noShowRate: number;
    }> = [];

    for (const [patientId, stats] of patientNoShows) {
      if (stats.count > 0) {
        const patient = await this.patientStore.getPatient(patientId);
        noShowsByPatient.push({
          patientId,
          patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown',
          noShowCount: stats.count,
          noShowRate: (stats.count / stats.total) * 100,
        });
      }
    }

    // Sort by no-show count
    noShowsByPatient.sort((a, b) => b.noShowCount - a.noShowCount);

    const completedCount = allAppointments.filter(
      (a) => a.status === 'completed' || a.status === 'no-show'
    ).length;

    return {
      totalNoShows: noShows.length,
      noShowsByPatient,
      noShowsByRBT: Array.from(rbtNoShows.entries()).map(([rbtId, noShowCount]) => ({
        rbtId,
        noShowCount,
      })),
      noShowsByDayOfWeek: dayOfWeekNoShows,
      averageNoShowRate: completedCount > 0 ? (noShows.length / completedCount) * 100 : 0,
    };
  }
}
