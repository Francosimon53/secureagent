/**
 * Confirmation Tracker
 *
 * Tracks appointment confirmation responses from patients/caregivers.
 * Processes SMS replies, email clicks, and voice keypresses.
 */

import { EventEmitter } from 'events';
import type { AppointmentStore } from '../../stores/appointment-store.js';
import type {
  Appointment,
  ReminderConfirmation,
  AppointmentId,
} from '../../types.js';
import type { AppointmentConfig } from '../../config.js';
import { HEALTH_EVENTS } from '../../constants.js';

// =============================================================================
// Confirmation Tracker Options
// =============================================================================

export interface ConfirmationTrackerOptions {
  appointmentStore: AppointmentStore;
  config: AppointmentConfig;
}

// =============================================================================
// SMS Reply Patterns
// =============================================================================

const CONFIRMATION_PATTERNS = {
  confirmed: [
    /^(confirm|yes|y|1|ok|okay|confirmed|c)$/i,
    /^confirm/i,
  ],
  reschedule: [
    /^(reschedule|change|2|r)$/i,
    /^reschedule/i,
    /can(')?t make it/i,
    /need to (change|reschedule)/i,
  ],
  cancel: [
    /^(cancel|no|n|3|cancelled)$/i,
    /^cancel/i,
  ],
};

// =============================================================================
// Confirmation Tracker
// =============================================================================

export class ConfirmationTracker extends EventEmitter {
  private readonly appointmentStore: AppointmentStore;
  private readonly config: AppointmentConfig;

  constructor(options: ConfirmationTrackerOptions) {
    super();
    this.appointmentStore = options.appointmentStore;
    this.config = options.config;
  }

  /**
   * Process a confirmation response
   */
  async processConfirmation(
    appointmentId: AppointmentId,
    response: 'confirmed' | 'reschedule-requested' | 'cancelled',
    responseMethod: 'sms-reply' | 'email-link' | 'voice-keypress' | 'manual',
    rawResponse?: string,
    notes?: string
  ): Promise<Appointment | null> {
    const appointment = await this.appointmentStore.getAppointment(appointmentId);
    if (!appointment) {
      return null;
    }

    // Find the most recent reminder
    const lastReminder = appointment.reminders
      .filter((r) => r.status === 'sent' || r.status === 'delivered')
      .sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0))[0];

    const confirmation: Omit<ReminderConfirmation, 'id'> = {
      appointmentId,
      reminderId: lastReminder?.id ?? 'unknown',
      response,
      responseMethod,
      receivedAt: Date.now(),
      rawResponse,
      notes,
    };

    // Record the confirmation
    const updated = await this.appointmentStore.recordConfirmation(
      appointmentId,
      confirmation
    );

    if (updated) {
      this.emit(HEALTH_EVENTS.CONFIRMATION_RECEIVED, {
        appointmentId,
        response,
        responseMethod,
        timestamp: Date.now(),
      });

      // Handle response-specific actions
      if (response === 'confirmed') {
        await this.handleConfirmed(updated);
      } else if (response === 'reschedule-requested') {
        await this.handleRescheduleRequest(updated);
      } else if (response === 'cancelled') {
        await this.handleCancellation(updated);
      }
    }

    return updated;
  }

  /**
   * Process an SMS reply and determine the response type
   */
  async processSMSReply(
    appointmentId: AppointmentId,
    message: string
  ): Promise<{
    response: 'confirmed' | 'reschedule-requested' | 'cancelled' | 'unknown';
    appointment: Appointment | null;
  }> {
    const trimmed = message.trim();
    let response: 'confirmed' | 'reschedule-requested' | 'cancelled' | 'unknown' = 'unknown';

    // Check patterns in order
    for (const pattern of CONFIRMATION_PATTERNS.confirmed) {
      if (pattern.test(trimmed)) {
        response = 'confirmed';
        break;
      }
    }

    if (response === 'unknown') {
      for (const pattern of CONFIRMATION_PATTERNS.reschedule) {
        if (pattern.test(trimmed)) {
          response = 'reschedule-requested';
          break;
        }
      }
    }

    if (response === 'unknown') {
      for (const pattern of CONFIRMATION_PATTERNS.cancel) {
        if (pattern.test(trimmed)) {
          response = 'cancelled';
          break;
        }
      }
    }

    // If we couldn't determine the response, log it but don't process
    if (response === 'unknown') {
      return { response, appointment: null };
    }

    const appointment = await this.processConfirmation(
      appointmentId,
      response,
      'sms-reply',
      message
    );

    return { response, appointment };
  }

  /**
   * Process a voice keypress response
   */
  async processVoiceKeypress(
    appointmentId: AppointmentId,
    digits: string
  ): Promise<{
    response: 'confirmed' | 'reschedule-requested' | 'unknown';
    appointment: Appointment | null;
  }> {
    let response: 'confirmed' | 'reschedule-requested' | 'unknown' = 'unknown';

    if (digits === '1') {
      response = 'confirmed';
    } else if (digits === '2') {
      response = 'reschedule-requested';
    }

    if (response === 'unknown') {
      return { response, appointment: null };
    }

    const appointment = await this.processConfirmation(
      appointmentId,
      response,
      'voice-keypress',
      `Pressed ${digits}`
    );

    return { response, appointment };
  }

  /**
   * Process an email link click confirmation
   */
  async processEmailLink(
    appointmentId: AppointmentId,
    action: 'confirm' | 'reschedule'
  ): Promise<Appointment | null> {
    const response = action === 'confirm' ? 'confirmed' : 'reschedule-requested';

    return this.processConfirmation(appointmentId, response, 'email-link');
  }

  /**
   * Get appointments pending confirmation
   */
  async getPendingConfirmations(userId: string): Promise<Appointment[]> {
    return this.appointmentStore.getPendingConfirmations(userId);
  }

  /**
   * Get confirmation rate statistics
   */
  async getConfirmationStats(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<{
    total: number;
    confirmed: number;
    pending: number;
    rescheduled: number;
    cancelled: number;
    confirmationRate: number;
  }> {
    const appointments = await this.appointmentStore.getAppointmentsInRange(
      userId,
      startDate,
      endDate
    );

    const stats = {
      total: appointments.length,
      confirmed: 0,
      pending: 0,
      rescheduled: 0,
      cancelled: 0,
      confirmationRate: 0,
    };

    for (const apt of appointments) {
      if (apt.status === 'confirmed' || apt.status === 'completed') {
        stats.confirmed++;
      } else if (apt.status === 'cancelled') {
        if (apt.confirmation?.response === 'reschedule-requested') {
          stats.rescheduled++;
        } else {
          stats.cancelled++;
        }
      } else if (apt.status === 'scheduled') {
        stats.pending++;
      }
    }

    if (stats.total > 0) {
      stats.confirmationRate = (stats.confirmed / stats.total) * 100;
    }

    return stats;
  }

  /**
   * Handle confirmed appointment
   */
  private async handleConfirmed(appointment: Appointment): Promise<void> {
    // Appointment status is already updated by recordConfirmation
    this.emit(HEALTH_EVENTS.APPOINTMENT_CONFIRMED, {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle reschedule request
   */
  private async handleRescheduleRequest(appointment: Appointment): Promise<void> {
    // The appointment remains scheduled but flagged for follow-up
    // Staff will need to contact the patient to reschedule
    this.emit(HEALTH_EVENTS.APPOINTMENT_RESCHEDULED, {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      requestOnly: true,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle cancellation
   */
  private async handleCancellation(appointment: Appointment): Promise<void> {
    // Update appointment status to cancelled
    await this.appointmentStore.updateStatus(
      appointment.id,
      'cancelled',
      'Patient requested cancellation via confirmation response'
    );

    this.emit(HEALTH_EVENTS.APPOINTMENT_CANCELLED, {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      reason: 'Patient requested via confirmation',
      timestamp: Date.now(),
    });
  }
}
