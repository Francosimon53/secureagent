/**
 * Reminder Scheduler
 *
 * Schedules and sends appointment reminders via SMS, email, or voice.
 * Supports configurable reminder intervals (e.g., 24h, 2h before).
 */

import { EventEmitter } from 'events';
import type { AppointmentStore } from '../../stores/appointment-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type {
  Appointment,
  AppointmentReminder,
  Patient,
  PatientContact,
} from '../../types.js';
import type { NotificationProvider, NotificationMessage } from '../../providers/notification/types.js';
import type { AppointmentConfig, NotificationConfig } from '../../config.js';
import { HEALTH_EVENTS, NOTIFICATION_TEMPLATES } from '../../constants.js';

// =============================================================================
// Reminder Scheduler Options
// =============================================================================

export interface ReminderSchedulerOptions {
  appointmentStore: AppointmentStore;
  patientStore: PatientStore;
  smsProvider?: NotificationProvider;
  emailProvider?: NotificationProvider;
  voiceProvider?: NotificationProvider;
  config: AppointmentConfig;
  notificationConfig: NotificationConfig;
}

// =============================================================================
// Reminder Scheduler
// =============================================================================

export class ReminderScheduler extends EventEmitter {
  private readonly appointmentStore: AppointmentStore;
  private readonly patientStore: PatientStore;
  private readonly smsProvider?: NotificationProvider;
  private readonly emailProvider?: NotificationProvider;
  private readonly voiceProvider?: NotificationProvider;
  private readonly config: AppointmentConfig;
  private readonly notificationConfig: NotificationConfig;

  constructor(options: ReminderSchedulerOptions) {
    super();
    this.appointmentStore = options.appointmentStore;
    this.patientStore = options.patientStore;
    this.smsProvider = options.smsProvider;
    this.emailProvider = options.emailProvider;
    this.voiceProvider = options.voiceProvider;
    this.config = options.config;
    this.notificationConfig = options.notificationConfig;
  }

  /**
   * Schedule reminders for an appointment
   */
  async scheduleReminders(appointment: Appointment): Promise<void> {
    const reminderIntervals = this.config.reminderIntervals;
    const reminders: AppointmentReminder[] = [];

    for (const minutesBefore of reminderIntervals) {
      const scheduledAt = appointment.startTime - minutesBefore * 60 * 1000;

      // Don't schedule reminders in the past
      if (scheduledAt <= Date.now()) continue;

      // Determine template based on interval
      const templateId = this.getTemplateForInterval(minutesBefore);
      const channel = this.notificationConfig.defaultChannel;

      reminders.push({
        id: crypto.randomUUID(),
        appointmentId: appointment.id,
        channel,
        scheduledAt,
        status: 'pending',
        messageTemplate: templateId,
      });
    }

    // Update appointment with reminders
    if (reminders.length > 0) {
      await this.appointmentStore.updateAppointment(appointment.id, {
        reminders: [...appointment.reminders, ...reminders],
      });

      this.emit(HEALTH_EVENTS.REMINDER_SCHEDULED, {
        appointmentId: appointment.id,
        reminderCount: reminders.length,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Reschedule reminders after appointment time change
   */
  async rescheduleReminders(appointment: Appointment): Promise<void> {
    // Cancel existing pending reminders
    const updatedReminders = appointment.reminders.map((r) =>
      r.status === 'pending' ? { ...r, status: 'failed' as const, error: 'Rescheduled' } : r
    );

    await this.appointmentStore.updateAppointment(appointment.id, {
      reminders: updatedReminders,
    });

    // Schedule new reminders
    const appointmentWithUpdatedReminders = {
      ...appointment,
      reminders: updatedReminders,
    };

    await this.scheduleReminders(appointmentWithUpdatedReminders);
  }

  /**
   * Cancel all pending reminders for an appointment
   */
  async cancelReminders(appointmentId: string): Promise<void> {
    const appointment = await this.appointmentStore.getAppointment(appointmentId);
    if (!appointment) return;

    const updatedReminders = appointment.reminders.map((r) =>
      r.status === 'pending' ? { ...r, status: 'failed' as const, error: 'Cancelled' } : r
    );

    await this.appointmentStore.updateAppointment(appointmentId, {
      reminders: updatedReminders,
    });
  }

  /**
   * Send all pending reminders that are due
   */
  async sendPendingReminders(userId: string): Promise<number> {
    const now = Date.now();
    const upcoming = await this.appointmentStore.getUpcomingReminders(userId, now);

    let sentCount = 0;

    for (const { appointment, reminder } of upcoming) {
      try {
        await this.sendReminder(appointment, reminder);
        sentCount++;
      } catch (error) {
        // Log error but continue with other reminders
        this.emit(HEALTH_EVENTS.REMINDER_FAILED, {
          appointmentId: appointment.id,
          reminderId: reminder.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        });
      }
    }

    return sentCount;
  }

  /**
   * Send a specific reminder
   */
  private async sendReminder(
    appointment: Appointment,
    reminder: AppointmentReminder
  ): Promise<void> {
    // Get patient and contact
    const patient = await this.patientStore.getPatient(appointment.patientId);
    if (!patient) {
      throw new Error(`Patient not found: ${appointment.patientId}`);
    }

    const contact = await this.patientStore.getPrimaryContact(appointment.patientId);
    if (!contact) {
      throw new Error(`No contact found for patient: ${appointment.patientId}`);
    }

    // Build message
    const message = this.buildMessage(appointment, patient, contact, reminder);

    // Get provider for channel
    const provider = this.getProviderForChannel(reminder.channel);
    if (!provider) {
      throw new Error(`No provider available for channel: ${reminder.channel}`);
    }

    // Build recipient
    const recipient = {
      phone: reminder.channel !== 'email' ? contact.phone : undefined,
      email: reminder.channel === 'email' ? contact.email : undefined,
      name: `${contact.firstName} ${contact.lastName}`,
      language: contact.language,
    };

    // Send notification
    const result = await provider.send(recipient, message);

    // Update reminder status
    await this.appointmentStore.updateReminder(appointment.id, reminder.id, {
      status: result.success ? 'sent' : 'failed',
      sentAt: result.success ? Date.now() : undefined,
      error: result.error,
    });

    if (result.success) {
      this.emit(HEALTH_EVENTS.REMINDER_SENT, {
        appointmentId: appointment.id,
        reminderId: reminder.id,
        channel: reminder.channel,
        messageId: result.messageId,
        timestamp: Date.now(),
      });
    } else {
      // Try fallback channels
      await this.tryFallbackChannels(appointment, reminder, patient, contact, message);
    }
  }

  /**
   * Try fallback notification channels
   */
  private async tryFallbackChannels(
    appointment: Appointment,
    reminder: AppointmentReminder,
    patient: Patient,
    contact: PatientContact,
    message: NotificationMessage
  ): Promise<void> {
    const fallbackChannels = this.notificationConfig.fallbackChannels;

    for (const channel of fallbackChannels) {
      if (channel === reminder.channel) continue;

      const provider = this.getProviderForChannel(channel);
      if (!provider) continue;

      const recipient = {
        phone: channel !== 'email' ? contact.phone : undefined,
        email: channel === 'email' ? contact.email : undefined,
        name: `${contact.firstName} ${contact.lastName}`,
        language: contact.language,
      };

      // Skip if contact doesn't have required info
      if (channel === 'email' && !contact.email) continue;
      if (channel !== 'email' && !contact.phone) continue;

      try {
        const result = await provider.send(recipient, message);

        if (result.success) {
          // Add fallback reminder record
          await this.appointmentStore.addReminder(appointment.id, {
            appointmentId: appointment.id,
            channel,
            scheduledAt: Date.now(),
            sentAt: Date.now(),
            status: 'sent',
            messageTemplate: reminder.messageTemplate,
          });

          this.emit(HEALTH_EVENTS.REMINDER_SENT, {
            appointmentId: appointment.id,
            channel,
            fallback: true,
            messageId: result.messageId,
            timestamp: Date.now(),
          });

          return; // Successfully sent via fallback
        }
      } catch {
        // Continue to next fallback
      }
    }

    // All fallbacks failed
    this.emit(HEALTH_EVENTS.REMINDER_FAILED, {
      appointmentId: appointment.id,
      reminderId: reminder.id,
      error: 'All notification channels failed',
      timestamp: Date.now(),
    });
  }

  /**
   * Build notification message from template
   */
  private buildMessage(
    appointment: Appointment,
    patient: Patient,
    contact: PatientContact,
    reminder: AppointmentReminder
  ): NotificationMessage {
    const template = this.getTemplate(reminder.messageTemplate);

    // Format date/time
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
      location: appointment.locationAddress ?? appointment.locationType,
      clinicPhone: '(555) 123-4567', // Should come from config
      clinicName: 'ABA Therapy Center', // Should come from config
      confirmationLink: `https://app.example.com/confirm/${appointment.id}`, // Should be configurable
    };

    return {
      templateId: reminder.messageTemplate,
      text: this.applyVariables(template.sms, variables),
      html: template.email?.body ? this.applyVariables(template.email.body, variables) : undefined,
      subject: template.email?.subject
        ? this.applyVariables(template.email.subject, variables)
        : undefined,
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
   * Get template for reminder interval
   */
  private getTemplateForInterval(minutesBefore: number): string {
    if (minutesBefore >= 1440) {
      return 'appointment-reminder-24h';
    } else if (minutesBefore >= 60) {
      return 'appointment-reminder-2h';
    }
    return 'appointment-reminder-2h';
  }

  /**
   * Get notification template by ID
   */
  private getTemplate(templateId: string): (typeof NOTIFICATION_TEMPLATES)[keyof typeof NOTIFICATION_TEMPLATES] {
    const templates = NOTIFICATION_TEMPLATES as Record<
      string,
      (typeof NOTIFICATION_TEMPLATES)[keyof typeof NOTIFICATION_TEMPLATES]
    >;

    // Map template ID to template key
    const templateKey = templateId
      .toUpperCase()
      .replace(/-/g, '_') as keyof typeof NOTIFICATION_TEMPLATES;

    return templates[templateKey] ?? NOTIFICATION_TEMPLATES.APPOINTMENT_REMINDER_24H;
  }

  /**
   * Get notification provider for channel
   */
  private getProviderForChannel(
    channel: 'sms' | 'email' | 'voice'
  ): NotificationProvider | undefined {
    switch (channel) {
      case 'sms':
        return this.smsProvider;
      case 'email':
        return this.emailProvider;
      case 'voice':
        return this.voiceProvider;
      default:
        return undefined;
    }
  }
}
