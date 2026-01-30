/**
 * EHR Provider Index
 *
 * Placeholder for EHR (Electronic Health Record) integrations.
 * Future implementations may include:
 * - Epic
 * - Cerner
 * - Athenahealth
 * - Practice management systems
 */

import { BaseHealthProvider, type HealthProviderConfig } from '../base.js';

// =============================================================================
// EHR Provider Types
// =============================================================================

export interface EHRProviderConfig extends HealthProviderConfig {
  ehrSystem: string;
  apiEndpoint: string;
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  fhirVersion?: string;
}

export interface PatientSyncResult {
  synced: number;
  created: number;
  updated: number;
  errors: Array<{ patientId: string; error: string }>;
}

export interface AppointmentSyncResult {
  synced: number;
  created: number;
  updated: number;
  cancelled: number;
  errors: Array<{ appointmentId: string; error: string }>;
}

// =============================================================================
// Base EHR Provider
// =============================================================================

export abstract class BaseEHRProvider extends BaseHealthProvider {
  protected readonly ehrConfig: EHRProviderConfig;

  constructor(config: EHRProviderConfig) {
    super(config);
    this.ehrConfig = config;
  }

  /**
   * Get EHR system name
   */
  get ehrSystem(): string {
    return this.ehrConfig.ehrSystem;
  }

  /**
   * Test connection to EHR system
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Sync patients from EHR
   */
  abstract syncPatients(): Promise<PatientSyncResult>;

  /**
   * Sync appointments from EHR
   */
  abstract syncAppointments(): Promise<AppointmentSyncResult>;

  /**
   * Get patient by EHR ID
   */
  abstract getPatientByEHRId(ehrPatientId: string): Promise<unknown>;

  /**
   * Get appointments for a date range
   */
  abstract getAppointments(startDate: number, endDate: number): Promise<unknown[]>;
}

// =============================================================================
// Placeholder Provider
// =============================================================================

/**
 * Placeholder EHR provider for future implementation
 */
export class PlaceholderEHRProvider extends BaseEHRProvider {
  get name(): string {
    return 'Placeholder EHR';
  }

  get type(): string {
    return 'ehr';
  }

  async testConnection(): Promise<boolean> {
    throw new Error('EHR provider not implemented');
  }

  async syncPatients(): Promise<PatientSyncResult> {
    throw new Error('EHR provider not implemented');
  }

  async syncAppointments(): Promise<AppointmentSyncResult> {
    throw new Error('EHR provider not implemented');
  }

  async getPatientByEHRId(_ehrPatientId: string): Promise<unknown> {
    throw new Error('EHR provider not implemented');
  }

  async getAppointments(_startDate: number, _endDate: number): Promise<unknown[]> {
    throw new Error('EHR provider not implemented');
  }
}
