/**
 * Base Payer Provider
 *
 * Abstract base class for insurance payer integrations.
 * Provides common functionality for authorization requests,
 * claim submissions, and eligibility checks.
 */

import { BaseHealthProvider, type HealthProviderConfig } from '../base.js';
import type {
  AuthorizationRequest,
  AuthorizationResponse,
  EligibilityRequest,
  EligibilityResponse,
  ClaimSubmission,
  ClaimResponse,
} from './types.js';

// =============================================================================
// Payer Provider Config
// =============================================================================

export interface PayerProviderConfig extends HealthProviderConfig {
  payerId: string;
  payerName: string;
  apiEndpoint: string;
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  environment: 'sandbox' | 'production';
  submitterId: string;
  submitterName: string;
  npi: string;
  taxId: string;
}

// =============================================================================
// Base Payer Provider
// =============================================================================

export abstract class BasePayerProvider extends BaseHealthProvider {
  protected readonly payerConfig: PayerProviderConfig;
  protected accessToken?: string;
  protected tokenExpiry?: number;

  constructor(config: PayerProviderConfig) {
    super(config);
    this.payerConfig = config;
  }

  /**
   * Get provider name
   */
  get name(): string {
    return this.payerConfig.payerName;
  }

  /**
   * Get provider type
   */
  get type(): string {
    return 'insurance';
  }

  /**
   * Get payer ID
   */
  get payerId(): string {
    return this.payerConfig.payerId;
  }

  /**
   * Check rate limit before making a request
   */
  protected async checkRateLimit(): Promise<void> {
    await this.rateLimiter.acquire();
  }

  /**
   * Execute a function with retry logic
   */
  protected async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    baseDelay = 1000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxAttempts) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error('All retry attempts failed');
  }

  // ===========================================================================
  // Authentication
  // ===========================================================================

  /**
   * Get access token for API calls
   */
  protected async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const token = await this.authenticate();
    this.accessToken = token.accessToken;
    this.tokenExpiry = Date.now() + token.expiresIn * 1000;

    return this.accessToken;
  }

  /**
   * Authenticate with payer API
   */
  protected abstract authenticate(): Promise<{
    accessToken: string;
    expiresIn: number;
  }>;

  // ===========================================================================
  // Eligibility
  // ===========================================================================

  /**
   * Check patient eligibility
   */
  async checkEligibility(request: EligibilityRequest): Promise<EligibilityResponse> {
    await this.checkRateLimit();

    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    this.emit('request', {
      type: 'eligibility',
      requestId,
      payerId: this.payerId,
    });

    try {
      const response = await this.executeWithRetry(() =>
        this.doCheckEligibility(request)
      );

      this.emit('response', {
        type: 'eligibility',
        requestId,
        payerId: this.payerId,
        duration: Date.now() - startTime,
        success: true,
      });

      return response;
    } catch (error) {
      this.emit('error', {
        type: 'eligibility',
        requestId,
        payerId: this.payerId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Execute eligibility check (to be implemented by subclass)
   */
  protected abstract doCheckEligibility(
    request: EligibilityRequest
  ): Promise<EligibilityResponse>;

  // ===========================================================================
  // Authorization
  // ===========================================================================

  /**
   * Submit authorization request
   */
  async submitAuthorization(
    request: AuthorizationRequest
  ): Promise<AuthorizationResponse> {
    await this.checkRateLimit();

    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    this.emit('request', {
      type: 'authorization',
      requestId,
      payerId: this.payerId,
    });

    try {
      const response = await this.executeWithRetry(() =>
        this.doSubmitAuthorization(request)
      );

      this.emit('response', {
        type: 'authorization',
        requestId,
        payerId: this.payerId,
        duration: Date.now() - startTime,
        success: true,
      });

      return response;
    } catch (error) {
      this.emit('error', {
        type: 'authorization',
        requestId,
        payerId: this.payerId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Execute authorization submission (to be implemented by subclass)
   */
  protected abstract doSubmitAuthorization(
    request: AuthorizationRequest
  ): Promise<AuthorizationResponse>;

  /**
   * Check authorization status
   */
  async checkAuthorizationStatus(
    authorizationNumber: string
  ): Promise<AuthorizationResponse> {
    await this.checkRateLimit();

    return this.executeWithRetry(() =>
      this.doCheckAuthorizationStatus(authorizationNumber)
    );
  }

  /**
   * Execute authorization status check (to be implemented by subclass)
   */
  protected abstract doCheckAuthorizationStatus(
    authorizationNumber: string
  ): Promise<AuthorizationResponse>;

  // ===========================================================================
  // Claims
  // ===========================================================================

  /**
   * Submit claim
   */
  async submitClaim(claim: ClaimSubmission): Promise<ClaimResponse> {
    await this.checkRateLimit();

    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    this.emit('request', {
      type: 'claim',
      requestId,
      payerId: this.payerId,
    });

    try {
      const response = await this.executeWithRetry(() =>
        this.doSubmitClaim(claim)
      );

      this.emit('response', {
        type: 'claim',
        requestId,
        payerId: this.payerId,
        duration: Date.now() - startTime,
        success: true,
      });

      return response;
    } catch (error) {
      this.emit('error', {
        type: 'claim',
        requestId,
        payerId: this.payerId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Execute claim submission (to be implemented by subclass)
   */
  protected abstract doSubmitClaim(claim: ClaimSubmission): Promise<ClaimResponse>;

  /**
   * Check claim status
   */
  async checkClaimStatus(claimNumber: string): Promise<ClaimResponse> {
    await this.checkRateLimit();

    return this.executeWithRetry(() => this.doCheckClaimStatus(claimNumber));
  }

  /**
   * Execute claim status check (to be implemented by subclass)
   */
  protected abstract doCheckClaimStatus(claimNumber: string): Promise<ClaimResponse>;

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Build standard EDI 270 eligibility request
   */
  protected buildEligibilityEDI(request: EligibilityRequest): string {
    // Build 270 transaction
    const isa = this.buildISASegment();
    const gs = this.buildGSSegment('HS');
    const st = `ST*270*0001*005010X279A1~`;

    const bht = `BHT*0022*13*${request.traceNumber}*${this.formatDate()}*${this.formatTime()}~`;

    // Source (submitter)
    const hl1 = `HL*1**20*1~`;
    const nm1Source = `NM1*PR*2*${this.payerConfig.payerName}*****PI*${this.payerId}~`;

    // Receiver (provider)
    const hl2 = `HL*2*1*21*1~`;
    const nm1Receiver = `NM1*1P*2*${this.payerConfig.submitterName}*****XX*${this.payerConfig.npi}~`;

    // Subscriber
    const hl3 = `HL*3*2*22*0~`;
    const trn = `TRN*1*${request.traceNumber}*${this.payerConfig.submitterId}~`;
    const nm1Subscriber = `NM1*IL*1*${request.subscriber.lastName}*${request.subscriber.firstName}****MI*${request.subscriber.memberId}~`;
    const dmg = `DMG*D8*${request.subscriber.dateOfBirth}*${request.subscriber.gender}~`;
    const dtp = `DTP*291*D8*${this.formatDate(request.serviceDate)}~`;
    const eq = `EQ*${request.serviceTypeCode}~`;

    const se = `SE*14*0001~`;
    const ge = this.buildGESegment();
    const iea = this.buildIEASegment();

    return [
      isa, gs, st, bht, hl1, nm1Source, hl2, nm1Receiver, hl3, trn,
      nm1Subscriber, dmg, dtp, eq, se, ge, iea
    ].join('\n');
  }

  /**
   * Build standard EDI 278 authorization request
   */
  protected buildAuthorizationEDI(request: AuthorizationRequest): string {
    // Build 278 transaction
    const isa = this.buildISASegment();
    const gs = this.buildGSSegment('HI');
    const st = `ST*278*0001*005010X217~`;

    const bht = `BHT*0007*11*${request.traceNumber}*${this.formatDate()}*${this.formatTime()}*AR~`;

    // Source (submitter)
    const hl1 = `HL*1**20*1~`;
    const nm1Source = `NM1*X3*2*${this.payerConfig.payerName}*****PI*${this.payerId}~`;

    // Provider
    const hl2 = `HL*2*1*21*1~`;
    const nm1Provider = `NM1*1P*2*${this.payerConfig.submitterName}*****XX*${this.payerConfig.npi}~`;

    // Subscriber
    const hl3 = `HL*3*2*22*1~`;
    const nm1Subscriber = `NM1*IL*1*${request.subscriber.lastName}*${request.subscriber.firstName}****MI*${request.subscriber.memberId}~`;
    const dmg = `DMG*D8*${request.subscriber.dateOfBirth}*${request.subscriber.gender}~`;

    // Patient (if different from subscriber)
    let patientSegments = '';
    if (request.patient && request.patient.memberId !== request.subscriber.memberId) {
      const hl4 = `HL*4*3*23*0~`;
      const nm1Patient = `NM1*QC*1*${request.patient.lastName}*${request.patient.firstName}~`;
      const dmgPatient = `DMG*D8*${request.patient.dateOfBirth}*${request.patient.gender}~`;
      patientSegments = `${hl4}\n${nm1Patient}\n${dmgPatient}\n`;
    }

    // Service info
    const um = `UM*HS*I*${request.serviceTypeCode}***${request.levelOfService}~`;
    const dtp = `DTP*472*RD8*${this.formatDate(request.startDate)}-${this.formatDate(request.endDate)}~`;
    const hsd = `HSD*VS*${request.quantity}*${request.quantityType}~`;

    // Diagnosis
    const hiSegments = request.diagnosisCodes
      .map((code, idx) => `HI*${idx === 0 ? 'ABK' : 'ABF'}:${code}~`)
      .join('\n');

    const se = `SE*${15 + (patientSegments ? 3 : 0) + request.diagnosisCodes.length}*0001~`;
    const ge = this.buildGESegment();
    const iea = this.buildIEASegment();

    return [
      isa, gs, st, bht, hl1, nm1Source, hl2, nm1Provider, hl3,
      nm1Subscriber, dmg, patientSegments, um, dtp, hsd, hiSegments,
      se, ge, iea
    ].filter(Boolean).join('\n');
  }

  /**
   * Build ISA segment
   */
  protected buildISASegment(): string {
    const now = new Date();
    const date = this.formatDate(now.getTime()).slice(2); // YYMMDD
    const time = this.formatTime();

    return `ISA*00*          *00*          *ZZ*${this.padRight(this.payerConfig.submitterId, 15)}*ZZ*${this.padRight(this.payerId, 15)}*${date}*${time}*^*00501*000000001*0*${this.payerConfig.environment === 'production' ? 'P' : 'T'}*:~`;
  }

  /**
   * Build GS segment
   */
  protected buildGSSegment(functionalId: string): string {
    const now = new Date();
    return `GS*${functionalId}*${this.payerConfig.submitterId}*${this.payerId}*${this.formatDate()}*${this.formatTime()}*1*X*005010X279A1~`;
  }

  /**
   * Build GE segment
   */
  protected buildGESegment(): string {
    return `GE*1*1~`;
  }

  /**
   * Build IEA segment
   */
  protected buildIEASegment(): string {
    return `IEA*1*000000001~`;
  }

  /**
   * Format date as CCYYMMDD
   */
  protected formatDate(timestamp?: number): string {
    const date = timestamp ? new Date(timestamp) : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Format time as HHMM
   */
  protected formatTime(): string {
    const date = new Date();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}${minutes}`;
  }

  /**
   * Pad string on right
   */
  protected padRight(str: string, length: number): string {
    return str.padEnd(length, ' ').slice(0, length);
  }

  /**
   * Parse EDI response
   */
  protected parseEDIResponse(edi: string): Record<string, string[]> {
    const segments: Record<string, string[]> = {};
    const lines = edi.split('~').filter((line) => line.trim());

    for (const line of lines) {
      const elements = line.split('*');
      const segmentId = elements[0];

      if (!segments[segmentId]) {
        segments[segmentId] = [];
      }
      segments[segmentId].push(line);
    }

    return segments;
  }
}
