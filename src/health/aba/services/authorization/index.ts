/**
 * Authorization Service
 *
 * Unified service for insurance authorization management including:
 * - Authorization tracking
 * - Expiration monitoring
 * - Renewal assistance
 * - Unit consumption tracking
 */

import { EventEmitter } from 'events';
import type { AuthorizationStore } from '../../stores/authorization-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type { HealthAuditStore } from '../../stores/audit-store.js';
import type {
  Authorization,
  AuthorizationStatus,
  AuthorizationQueryOptions,
  AuthorizationAlert,
  PatientId,
  AuthorizationId,
} from '../../types.js';
import type { NotificationProvider } from '../../providers/notification/types.js';
import type { AuthorizationConfig, NotificationConfig } from '../../config.js';
import { HEALTH_EVENTS } from '../../constants.js';
import { AuthorizationTracker } from './auth-tracker.js';
import { ExpirationMonitor } from './expiration-monitor.js';
import { RenewalAssistant } from './renewal-assistant.js';

// =============================================================================
// Authorization Service Options
// =============================================================================

export interface AuthorizationServiceOptions {
  authorizationStore: AuthorizationStore;
  patientStore: PatientStore;
  auditStore: HealthAuditStore;
  smsProvider?: NotificationProvider;
  emailProvider?: NotificationProvider;
  authorizationConfig: AuthorizationConfig;
  notificationConfig: NotificationConfig;
  userId: string;
}

// =============================================================================
// Authorization Service
// =============================================================================

export class AuthorizationService extends EventEmitter {
  private readonly authorizationStore: AuthorizationStore;
  private readonly patientStore: PatientStore;
  private readonly auditStore: HealthAuditStore;
  private readonly config: AuthorizationConfig;
  private readonly notificationConfig: NotificationConfig;
  private readonly userId: string;

  private readonly tracker: AuthorizationTracker;
  private readonly expirationMonitor: ExpirationMonitor;
  private readonly renewalAssistant: RenewalAssistant;

  constructor(options: AuthorizationServiceOptions) {
    super();

    this.authorizationStore = options.authorizationStore;
    this.patientStore = options.patientStore;
    this.auditStore = options.auditStore;
    this.config = options.authorizationConfig;
    this.notificationConfig = options.notificationConfig;
    this.userId = options.userId;

    // Initialize sub-services
    this.tracker = new AuthorizationTracker({
      authorizationStore: options.authorizationStore,
      patientStore: options.patientStore,
      config: options.authorizationConfig,
    });

    this.expirationMonitor = new ExpirationMonitor({
      authorizationStore: options.authorizationStore,
      patientStore: options.patientStore,
      smsProvider: options.smsProvider,
      emailProvider: options.emailProvider,
      config: options.authorizationConfig,
      notificationConfig: options.notificationConfig,
    });

    this.renewalAssistant = new RenewalAssistant({
      authorizationStore: options.authorizationStore,
      patientStore: options.patientStore,
      config: options.authorizationConfig,
    });

    // Forward events
    this.expirationMonitor.on(HEALTH_EVENTS.AUTHORIZATION_EXPIRING, (data) =>
      this.emit(HEALTH_EVENTS.AUTHORIZATION_EXPIRING, data)
    );
    this.expirationMonitor.on(HEALTH_EVENTS.AUTHORIZATION_EXPIRED, (data) =>
      this.emit(HEALTH_EVENTS.AUTHORIZATION_EXPIRED, data)
    );
    this.expirationMonitor.on(HEALTH_EVENTS.AUTHORIZATION_LOW_UNITS, (data) =>
      this.emit(HEALTH_EVENTS.AUTHORIZATION_LOW_UNITS, data)
    );
    this.renewalAssistant.on(HEALTH_EVENTS.AUTHORIZATION_RENEWAL_REQUESTED, (data) =>
      this.emit(HEALTH_EVENTS.AUTHORIZATION_RENEWAL_REQUESTED, data)
    );
  }

  // ===========================================================================
  // Authorization CRUD
  // ===========================================================================

  /**
   * Create a new authorization
   */
  async createAuthorization(
    authorization: Omit<Authorization, 'id' | 'createdAt' | 'updatedAt' | 'alerts'>
  ): Promise<Authorization> {
    // Validate patient exists
    const patient = await this.patientStore.getPatient(authorization.patientId);
    if (!patient) {
      throw new Error(`Patient not found: ${authorization.patientId}`);
    }

    // Create authorization
    const newAuth = await this.authorizationStore.createAuthorization({
      ...authorization,
      userId: this.userId,
      alerts: [],
    });

    this.emit(HEALTH_EVENTS.AUTHORIZATION_CREATED, {
      authorizationId: newAuth.id,
      patientId: newAuth.patientId,
      timestamp: Date.now(),
    });

    return newAuth;
  }

  /**
   * Get authorization by ID
   */
  async getAuthorization(id: AuthorizationId): Promise<Authorization | null> {
    return this.authorizationStore.getAuthorization(id);
  }

  /**
   * Get authorization by number
   */
  async getAuthorizationByNumber(authNumber: string): Promise<Authorization | null> {
    return this.authorizationStore.getAuthorizationByNumber(this.userId, authNumber);
  }

  /**
   * Update an authorization
   */
  async updateAuthorization(
    id: AuthorizationId,
    updates: Partial<Authorization>
  ): Promise<Authorization | null> {
    const updated = await this.authorizationStore.updateAuthorization(id, updates);

    if (updated) {
      this.emit(HEALTH_EVENTS.AUTHORIZATION_UPDATED, {
        authorizationId: id,
        updates: Object.keys(updates),
        timestamp: Date.now(),
      });
    }

    return updated;
  }

  /**
   * Delete an authorization
   */
  async deleteAuthorization(id: AuthorizationId): Promise<boolean> {
    return this.authorizationStore.deleteAuthorization(id);
  }

  /**
   * List authorizations with filtering
   */
  async listAuthorizations(options?: AuthorizationQueryOptions): Promise<Authorization[]> {
    return this.authorizationStore.listAuthorizations(this.userId, options);
  }

  /**
   * Get authorizations for a patient
   */
  async getPatientAuthorizations(patientId: PatientId): Promise<Authorization[]> {
    return this.authorizationStore.getAuthorizationsByPatient(this.userId, patientId);
  }

  /**
   * Get active authorizations
   */
  async getActiveAuthorizations(patientId?: PatientId): Promise<Authorization[]> {
    return this.authorizationStore.getActiveAuthorizations(this.userId, patientId);
  }

  // ===========================================================================
  // Unit Tracking
  // ===========================================================================

  /**
   * Use authorization units
   */
  async useUnits(id: AuthorizationId, units: number): Promise<Authorization | null> {
    return this.tracker.useUnits(id, units);
  }

  /**
   * Refund authorization units
   */
  async refundUnits(id: AuthorizationId, units: number): Promise<Authorization | null> {
    return this.tracker.refundUnits(id, units);
  }

  /**
   * Get authorization for a specific service
   */
  async getAuthorizationForService(
    patientId: PatientId,
    serviceCode: string
  ): Promise<Authorization | null> {
    return this.authorizationStore.getAuthorizationForService(
      this.userId,
      patientId,
      serviceCode
    );
  }

  /**
   * Check if authorization has sufficient units
   */
  async hasAvailableUnits(id: AuthorizationId, unitsNeeded: number): Promise<boolean> {
    return this.tracker.hasAvailableUnits(id, unitsNeeded);
  }

  // ===========================================================================
  // Status Management
  // ===========================================================================

  /**
   * Update authorization status
   */
  async updateStatus(
    id: AuthorizationId,
    status: AuthorizationStatus
  ): Promise<Authorization | null> {
    const updated = await this.authorizationStore.updateStatus(id, status);

    if (updated) {
      const eventType =
        status === 'approved'
          ? HEALTH_EVENTS.AUTHORIZATION_APPROVED
          : status === 'denied'
            ? HEALTH_EVENTS.AUTHORIZATION_DENIED
            : status === 'expired'
              ? HEALTH_EVENTS.AUTHORIZATION_EXPIRED
              : HEALTH_EVENTS.AUTHORIZATION_UPDATED;

      this.emit(eventType, {
        authorizationId: id,
        status,
        timestamp: Date.now(),
      });
    }

    return updated;
  }

  // ===========================================================================
  // Expiration Monitoring
  // ===========================================================================

  /**
   * Check for expiring authorizations and send alerts
   */
  async checkExpirations(): Promise<number> {
    return this.expirationMonitor.checkExpirations(this.userId);
  }

  /**
   * Check for low unit authorizations and send alerts
   */
  async checkLowUnits(): Promise<number> {
    return this.expirationMonitor.checkLowUnits(this.userId);
  }

  /**
   * Update expired authorizations
   */
  async updateExpiredAuthorizations(): Promise<number> {
    const count = await this.authorizationStore.updateExpiredAuthorizations(this.userId);

    if (count > 0) {
      this.emit(HEALTH_EVENTS.AUTHORIZATION_EXPIRED, {
        count,
        timestamp: Date.now(),
      });
    }

    return count;
  }

  /**
   * Get expiring authorizations
   */
  async getExpiringAuthorizations(withinDays: number): Promise<Authorization[]> {
    return this.authorizationStore.getExpiringAuthorizations(this.userId, withinDays);
  }

  /**
   * Get low unit authorizations
   */
  async getLowUnitAuthorizations(thresholdPercent: number): Promise<Authorization[]> {
    return this.authorizationStore.getLowUnitAuthorizations(this.userId, thresholdPercent);
  }

  // ===========================================================================
  // Alert Management
  // ===========================================================================

  /**
   * Get unacknowledged alerts
   */
  async getUnacknowledgedAlerts(): Promise<
    Array<{ authorization: Authorization; alert: AuthorizationAlert }>
  > {
    return this.authorizationStore.getUnacknowledgedAlerts(this.userId);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(
    authorizationId: AuthorizationId,
    alertId: string,
    acknowledgedBy: string
  ): Promise<Authorization | null> {
    return this.authorizationStore.acknowledgeAlert(
      authorizationId,
      alertId,
      acknowledgedBy
    );
  }

  // ===========================================================================
  // Renewal Management
  // ===========================================================================

  /**
   * Request authorization renewal
   */
  async requestRenewal(id: AuthorizationId): Promise<Authorization | null> {
    return this.renewalAssistant.requestRenewal(id);
  }

  /**
   * Get authorizations needing renewal
   */
  async getAuthorizationsNeedingRenewal(): Promise<Authorization[]> {
    return this.renewalAssistant.getAuthorizationsNeedingRenewal(this.userId);
  }

  /**
   * Prepare renewal request data
   */
  async prepareRenewalRequest(id: AuthorizationId): Promise<{
    authorization: Authorization;
    suggestedUnits: number;
    suggestedDuration: number;
    utilizationRate: number;
  } | null> {
    return this.renewalAssistant.prepareRenewalRequest(id);
  }
}

// Re-export sub-services
export { AuthorizationTracker } from './auth-tracker.js';
export { ExpirationMonitor } from './expiration-monitor.js';
export { RenewalAssistant } from './renewal-assistant.js';
