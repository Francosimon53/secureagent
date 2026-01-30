/**
 * Appointment Service
 *
 * Unified service for appointment management including:
 * - Scheduling and management
 * - Reminder scheduling and delivery
 * - Confirmation tracking
 * - No-show handling
 */

import { EventEmitter } from 'events';
import type { AppointmentStore } from '../../stores/appointment-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type { AuthorizationStore } from '../../stores/authorization-store.js';
import type { HealthAuditStore } from '../../stores/audit-store.js';
import type {
  Appointment,
  AppointmentStatus,
  AppointmentQueryOptions,
  Patient,
  PatientContact,
  PatientId,
  RBTId,
  AppointmentId,
} from '../../types.js';
import type { NotificationProvider } from '../../providers/notification/types.js';
import type { AppointmentConfig, NotificationConfig } from '../../config.js';
import { HEALTH_EVENTS, NOTIFICATION_TEMPLATES } from '../../constants.js';
import { ReminderScheduler } from './reminder-scheduler.js';
import { ConfirmationTracker } from './confirmation-tracker.js';
import { NoShowHandler } from './no-show-handler.js';

// =============================================================================
// Appointment Service Options
// =============================================================================

export interface AppointmentServiceOptions {
  appointmentStore: AppointmentStore;
  patientStore: PatientStore;
  authorizationStore: AuthorizationStore;
  auditStore: HealthAuditStore;
  smsProvider?: NotificationProvider;
  emailProvider?: NotificationProvider;
  voiceProvider?: NotificationProvider;
  appointmentConfig: AppointmentConfig;
  notificationConfig: NotificationConfig;
  userId: string;
}

// =============================================================================
// Appointment Service
// =============================================================================

export class AppointmentService extends EventEmitter {
  private readonly appointmentStore: AppointmentStore;
  private readonly patientStore: PatientStore;
  private readonly authorizationStore: AuthorizationStore;
  private readonly auditStore: HealthAuditStore;
  private readonly config: AppointmentConfig;
  private readonly notificationConfig: NotificationConfig;
  private readonly userId: string;

  private readonly reminderScheduler: ReminderScheduler;
  private readonly confirmationTracker: ConfirmationTracker;
  private readonly noShowHandler: NoShowHandler;

  constructor(options: AppointmentServiceOptions) {
    super();

    this.appointmentStore = options.appointmentStore;
    this.patientStore = options.patientStore;
    this.authorizationStore = options.authorizationStore;
    this.auditStore = options.auditStore;
    this.config = options.appointmentConfig;
    this.notificationConfig = options.notificationConfig;
    this.userId = options.userId;

    // Initialize sub-services
    this.reminderScheduler = new ReminderScheduler({
      appointmentStore: options.appointmentStore,
      patientStore: options.patientStore,
      smsProvider: options.smsProvider,
      emailProvider: options.emailProvider,
      voiceProvider: options.voiceProvider,
      config: options.appointmentConfig,
      notificationConfig: options.notificationConfig,
    });

    this.confirmationTracker = new ConfirmationTracker({
      appointmentStore: options.appointmentStore,
      config: options.appointmentConfig,
    });

    this.noShowHandler = new NoShowHandler({
      appointmentStore: options.appointmentStore,
      patientStore: options.patientStore,
      authorizationStore: options.authorizationStore,
      smsProvider: options.smsProvider,
      emailProvider: options.emailProvider,
      config: options.appointmentConfig,
    });

    // Forward events
    this.reminderScheduler.on(HEALTH_EVENTS.REMINDER_SENT, (data) =>
      this.emit(HEALTH_EVENTS.REMINDER_SENT, data)
    );
    this.reminderScheduler.on(HEALTH_EVENTS.REMINDER_FAILED, (data) =>
      this.emit(HEALTH_EVENTS.REMINDER_FAILED, data)
    );
    this.confirmationTracker.on(HEALTH_EVENTS.CONFIRMATION_RECEIVED, (data) =>
      this.emit(HEALTH_EVENTS.CONFIRMATION_RECEIVED, data)
    );
    this.noShowHandler.on(HEALTH_EVENTS.APPOINTMENT_NO_SHOW, (data) =>
      this.emit(HEALTH_EVENTS.APPOINTMENT_NO_SHOW, data)
    );
  }

  // ===========================================================================
  // Appointment CRUD
  // ===========================================================================

  /**
   * Schedule a new appointment
   */
  async scheduleAppointment(
    appointment: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt' | 'reminders' | 'status'>
  ): Promise<Appointment> {
    // Validate patient exists
    const patient = await this.patientStore.getPatient(appointment.patientId);
    if (!patient) {
      throw new Error(`Patient not found: ${appointment.patientId}`);
    }

    if (patient.status !== 'active') {
      throw new Error(`Patient is not active: ${patient.status}`);
    }

    // Check for conflicts if RBT is assigned
    if (appointment.rbtId) {
      const conflicts = await this.appointmentStore.checkConflicts(
        this.userId,
        appointment.rbtId,
        appointment.startTime,
        appointment.endTime
      );

      if (conflicts.length > 0) {
        throw new Error(
          `Schedule conflict: RBT has ${conflicts.length} overlapping appointment(s)`
        );
      }
    }

    // Validate authorization if provided
    if (appointment.authorizationId) {
      const auth = await this.authorizationStore.getAuthorization(
        appointment.authorizationId
      );
      if (!auth) {
        throw new Error(`Authorization not found: ${appointment.authorizationId}`);
      }
      if (auth.status === 'expired') {
        throw new Error('Authorization has expired');
      }
      if (auth.remainingUnits <= 0) {
        throw new Error('Authorization has no remaining units');
      }
    }

    // Create appointment
    const newAppointment = await this.appointmentStore.createAppointment({
      ...appointment,
      userId: this.userId,
      status: 'scheduled',
      reminders: [],
    });

    // Schedule reminders
    await this.reminderScheduler.scheduleReminders(newAppointment);

    // Emit event
    this.emit(HEALTH_EVENTS.APPOINTMENT_SCHEDULED, {
      appointmentId: newAppointment.id,
      patientId: newAppointment.patientId,
      startTime: newAppointment.startTime,
      timestamp: Date.now(),
    });

    return newAppointment;
  }

  /**
   * Get appointment by ID
   */
  async getAppointment(id: AppointmentId): Promise<Appointment | null> {
    return this.appointmentStore.getAppointment(id);
  }

  /**
   * Update an appointment
   */
  async updateAppointment(
    id: AppointmentId,
    updates: Partial<Appointment>
  ): Promise<Appointment | null> {
    const existing = await this.appointmentStore.getAppointment(id);
    if (!existing) return null;

    // If time changed, check for conflicts and reschedule reminders
    if (updates.startTime || updates.endTime) {
      const startTime = updates.startTime ?? existing.startTime;
      const endTime = updates.endTime ?? existing.endTime;
      const rbtId = updates.rbtId ?? existing.rbtId;

      if (rbtId) {
        const conflicts = await this.appointmentStore.checkConflicts(
          this.userId,
          rbtId,
          startTime,
          endTime,
          id
        );

        if (conflicts.length > 0) {
          throw new Error(
            `Schedule conflict: RBT has ${conflicts.length} overlapping appointment(s)`
          );
        }
      }
    }

    const updated = await this.appointmentStore.updateAppointment(id, updates);

    // Reschedule reminders if time changed
    if (updated && (updates.startTime || updates.endTime)) {
      await this.reminderScheduler.rescheduleReminders(updated);
    }

    return updated;
  }

  /**
   * Reschedule an appointment
   */
  async rescheduleAppointment(
    id: AppointmentId,
    newStartTime: number,
    newEndTime: number
  ): Promise<Appointment | null> {
    const existing = await this.appointmentStore.getAppointment(id);
    if (!existing) return null;

    const updated = await this.updateAppointment(id, {
      startTime: newStartTime,
      endTime: newEndTime,
      status: 'scheduled',
    });

    if (updated) {
      this.emit(HEALTH_EVENTS.APPOINTMENT_RESCHEDULED, {
        appointmentId: id,
        oldTime: existing.startTime,
        newTime: newStartTime,
        timestamp: Date.now(),
      });
    }

    return updated;
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(id: AppointmentId, reason?: string): Promise<Appointment | null> {
    const updated = await this.appointmentStore.updateStatus(id, 'cancelled', reason);

    if (updated) {
      // Cancel pending reminders
      await this.reminderScheduler.cancelReminders(id);

      // Emit event
      this.emit(HEALTH_EVENTS.APPOINTMENT_CANCELLED, {
        appointmentId: id,
        reason,
        timestamp: Date.now(),
      });
    }

    return updated;
  }

  /**
   * List appointments with filtering
   */
  async listAppointments(options?: AppointmentQueryOptions): Promise<Appointment[]> {
    return this.appointmentStore.listAppointments(this.userId, options);
  }

  /**
   * Get appointments for a patient
   */
  async getPatientAppointments(
    patientId: PatientId,
    options?: AppointmentQueryOptions
  ): Promise<Appointment[]> {
    return this.appointmentStore.getAppointmentsByPatient(this.userId, patientId, options);
  }

  /**
   * Get appointments for an RBT
   */
  async getRBTAppointments(
    rbtId: RBTId,
    options?: AppointmentQueryOptions
  ): Promise<Appointment[]> {
    return this.appointmentStore.getAppointmentsByRBT(this.userId, rbtId, options);
  }

  /**
   * Get upcoming appointments
   */
  async getUpcomingAppointments(limit?: number): Promise<Appointment[]> {
    return this.appointmentStore.getUpcomingAppointments(this.userId, limit);
  }

  // ===========================================================================
  // Status Management
  // ===========================================================================

  /**
   * Check in to an appointment
   */
  async checkIn(id: AppointmentId): Promise<Appointment | null> {
    const updated = await this.appointmentStore.checkIn(id);

    if (updated) {
      this.emit(HEALTH_EVENTS.APPOINTMENT_STARTED, {
        appointmentId: id,
        checkedInAt: updated.checkedInAt,
        timestamp: Date.now(),
      });
    }

    return updated;
  }

  /**
   * Check out from an appointment
   */
  async checkOut(id: AppointmentId, sessionNotes?: string): Promise<Appointment | null> {
    const appointment = await this.appointmentStore.getAppointment(id);
    if (!appointment) return null;

    // Update appointment
    let updated = await this.appointmentStore.checkOut(id);
    if (!updated) return null;

    // Add session notes if provided
    if (sessionNotes) {
      updated = await this.appointmentStore.updateAppointment(id, { sessionNotes });
    }

    // Use authorization units if applicable
    if (appointment.authorizationId && appointment.unitsToBill) {
      await this.authorizationStore.useUnits(
        appointment.authorizationId,
        appointment.unitsToBill
      );
    }

    if (updated) {
      this.emit(HEALTH_EVENTS.APPOINTMENT_COMPLETED, {
        appointmentId: id,
        checkedOutAt: updated.checkedOutAt,
        timestamp: Date.now(),
      });
    }

    return updated;
  }

  /**
   * Mark appointment as no-show
   */
  async markNoShow(id: AppointmentId, reason?: string): Promise<Appointment | null> {
    const updated = await this.noShowHandler.markNoShow(id, reason);

    if (updated) {
      this.emit(HEALTH_EVENTS.APPOINTMENT_NO_SHOW, {
        appointmentId: id,
        reason,
        timestamp: Date.now(),
      });
    }

    return updated;
  }

  // ===========================================================================
  // Reminder Management
  // ===========================================================================

  /**
   * Send pending reminders (called by scheduler)
   */
  async sendPendingReminders(): Promise<number> {
    return this.reminderScheduler.sendPendingReminders(this.userId);
  }

  /**
   * Process reminder confirmation response
   */
  async processConfirmation(
    appointmentId: AppointmentId,
    response: 'confirmed' | 'reschedule-requested' | 'cancelled',
    responseMethod: 'sms-reply' | 'email-link' | 'voice-keypress' | 'manual',
    rawResponse?: string
  ): Promise<Appointment | null> {
    return this.confirmationTracker.processConfirmation(
      appointmentId,
      response,
      responseMethod,
      rawResponse
    );
  }

  /**
   * Get appointments pending confirmation
   */
  async getPendingConfirmations(): Promise<Appointment[]> {
    return this.appointmentStore.getPendingConfirmations(this.userId);
  }

  // ===========================================================================
  // No-Show Management
  // ===========================================================================

  /**
   * Check for and process no-shows (called by scheduler)
   */
  async processNoShows(): Promise<number> {
    return this.noShowHandler.processNoShows(this.userId);
  }

  /**
   * Get no-show appointments in date range
   */
  async getNoShowAppointments(
    startDate: number,
    endDate: number
  ): Promise<Appointment[]> {
    return this.appointmentStore.getNoShowAppointments(this.userId, startDate, endDate);
  }

  // ===========================================================================
  // Conflict Detection
  // ===========================================================================

  /**
   * Check for scheduling conflicts
   */
  async checkConflicts(
    rbtId: RBTId,
    startTime: number,
    endTime: number,
    excludeAppointmentId?: AppointmentId
  ): Promise<Appointment[]> {
    return this.appointmentStore.checkConflicts(
      this.userId,
      rbtId,
      startTime,
      endTime,
      excludeAppointmentId
    );
  }
}

// Re-export sub-services
export { ReminderScheduler } from './reminder-scheduler.js';
export { ConfirmationTracker } from './confirmation-tracker.js';
export { NoShowHandler } from './no-show-handler.js';
