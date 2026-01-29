import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { UserIdentity } from '../types.js';
import { AuthenticationError, MFARequiredError } from '../types.js';
import { getLogger, getAuditLogger } from '../../observability/logger.js';

// ============================================================================
// MFA Service - Multi-Factor Authentication with TOTP
// ============================================================================

/**
 * MFA configuration
 */
export interface MFAServiceConfig {
  /** Application name shown in authenticator apps */
  appName: string;
  /** Issuer name for TOTP */
  issuer: string;
  /** TOTP time step in seconds (default: 30) */
  timeStep?: number;
  /** Number of digits in OTP (default: 6) */
  digits?: number;
  /** Allow this many time steps before/after current (default: 1) */
  window?: number;
  /** Number of backup codes to generate (default: 10) */
  backupCodeCount?: number;
  /** Backup code length (default: 8) */
  backupCodeLength?: number;
  /** Rate limit: max verification attempts per window */
  maxAttempts?: number;
  /** Rate limit window in milliseconds */
  attemptWindowMs?: number;
}

/**
 * MFA enrollment data
 */
export interface MFAEnrollment {
  /** User ID */
  userId: string;
  /** Base32-encoded secret */
  secret: string;
  /** Backup codes (hashed) */
  backupCodes: string[];
  /** When enrollment was initiated */
  createdAt: number;
  /** Whether enrollment is confirmed (first OTP verified) */
  confirmed: boolean;
  /** When last verified */
  lastVerifiedAt?: number;
  /** Recovery email (optional) */
  recoveryEmail?: string;
}

/**
 * MFA verification result
 */
export interface MFAVerificationResult {
  success: boolean;
  method?: 'totp' | 'backup_code';
  remainingBackupCodes?: number;
  error?: string;
}

/**
 * TOTP provisioning URI data
 */
export interface TOTPProvisioningData {
  /** The secret in base32 format */
  secret: string;
  /** The otpauth:// URI for QR code */
  uri: string;
  /** Manual entry key (formatted secret) */
  manualKey: string;
  /** Backup codes (shown only once during enrollment) */
  backupCodes: string[];
}

/**
 * MFA Service
 *
 * Implements Time-based One-Time Password (TOTP) according to RFC 6238
 * with backup codes for recovery.
 */
export class MFAService {
  private readonly config: Required<MFAServiceConfig>;
  private readonly logger = getLogger().child({ module: 'MFAService' });
  private readonly auditLogger = getAuditLogger();

  // In-memory storage (should be replaced with persistent storage)
  private readonly enrollments = new Map<string, MFAEnrollment>();
  private readonly attemptTracker = new Map<string, { count: number; resetAt: number }>();

  // Base32 alphabet
  private readonly BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  constructor(config: MFAServiceConfig) {
    this.config = {
      appName: config.appName,
      issuer: config.issuer,
      timeStep: config.timeStep ?? 30,
      digits: config.digits ?? 6,
      window: config.window ?? 1,
      backupCodeCount: config.backupCodeCount ?? 10,
      backupCodeLength: config.backupCodeLength ?? 8,
      maxAttempts: config.maxAttempts ?? 5,
      attemptWindowMs: config.attemptWindowMs ?? 300000, // 5 minutes
    };
  }

  /**
   * Initiate MFA enrollment for a user
   */
  async enrollUser(userId: string, email?: string): Promise<TOTPProvisioningData> {
    // Check if already enrolled
    const existing = this.enrollments.get(userId);
    if (existing?.confirmed) {
      throw new Error('User already has MFA enabled. Disable first to re-enroll.');
    }

    // Generate secret (160 bits = 20 bytes, as per RFC 4226)
    const secretBytes = randomBytes(20);
    const secret = this.base32Encode(secretBytes);

    // Generate backup codes
    const backupCodesPlain = this.generateBackupCodes();
    const backupCodesHashed = backupCodesPlain.map(code => this.hashBackupCode(code));

    // Create enrollment
    const enrollment: MFAEnrollment = {
      userId,
      secret,
      backupCodes: backupCodesHashed,
      createdAt: Date.now(),
      confirmed: false,
      recoveryEmail: email,
    };

    this.enrollments.set(userId, enrollment);

    // Build provisioning URI
    const accountName = email ?? userId;
    const uri = this.buildProvisioningUri(accountName, secret);

    this.logger.info({ userId }, 'MFA enrollment initiated');

    this.auditLogger.log({
      eventId: crypto.randomUUID(),
      timestamp: Date.now(),
      eventType: 'authentication',
      severity: 'info',
      actor: { userId },
      resource: { type: 'mfa', name: 'enrollment' },
      action: 'initiate',
      outcome: 'success',
    });

    return {
      secret,
      uri,
      manualKey: this.formatSecretForDisplay(secret),
      backupCodes: backupCodesPlain, // Only shown once!
    };
  }

  /**
   * Confirm MFA enrollment by verifying first OTP
   */
  async confirmEnrollment(userId: string, otp: string): Promise<boolean> {
    const enrollment = this.enrollments.get(userId);
    if (!enrollment) {
      throw new Error('No pending MFA enrollment found');
    }

    if (enrollment.confirmed) {
      throw new Error('MFA already confirmed');
    }

    // Verify the OTP
    const isValid = this.verifyTOTP(enrollment.secret, otp);

    if (isValid) {
      enrollment.confirmed = true;
      enrollment.lastVerifiedAt = Date.now();

      this.logger.info({ userId }, 'MFA enrollment confirmed');

      this.auditLogger.log({
        eventId: crypto.randomUUID(),
        timestamp: Date.now(),
        eventType: 'authentication',
        severity: 'info',
        actor: { userId },
        resource: { type: 'mfa', name: 'enrollment' },
        action: 'confirm',
        outcome: 'success',
      });

      return true;
    }

    this.auditLogger.log({
      eventId: crypto.randomUUID(),
      timestamp: Date.now(),
      eventType: 'authentication',
      severity: 'warn',
      actor: { userId },
      resource: { type: 'mfa', name: 'enrollment' },
      action: 'confirm',
      outcome: 'failure',
      details: { reason: 'Invalid OTP' },
    });

    return false;
  }

  /**
   * Verify MFA code (TOTP or backup code)
   */
  async verify(userId: string, code: string): Promise<MFAVerificationResult> {
    const enrollment = this.enrollments.get(userId);
    if (!enrollment) {
      return { success: false, error: 'MFA not enrolled' };
    }

    if (!enrollment.confirmed) {
      return { success: false, error: 'MFA enrollment not confirmed' };
    }

    // Check rate limiting
    if (!this.checkRateLimit(userId)) {
      this.auditLogger.log({
        eventId: crypto.randomUUID(),
        timestamp: Date.now(),
        eventType: 'authentication',
        severity: 'warn',
        actor: { userId },
        resource: { type: 'mfa', name: 'verification' },
        action: 'verify',
        outcome: 'blocked',
        details: { reason: 'Rate limit exceeded' },
        riskIndicators: ['rate_limit_exceeded'],
      });

      return { success: false, error: 'Too many verification attempts. Please wait.' };
    }

    // Normalize code (remove spaces/dashes)
    const normalizedCode = code.replace(/[\s-]/g, '').toUpperCase();

    // Try TOTP first (if 6 digits)
    if (/^\d{6}$/.test(normalizedCode)) {
      const isValid = this.verifyTOTP(enrollment.secret, normalizedCode);

      if (isValid) {
        enrollment.lastVerifiedAt = Date.now();
        this.resetRateLimit(userId);

        this.auditLogger.log({
          eventId: crypto.randomUUID(),
          timestamp: Date.now(),
          eventType: 'authentication',
          severity: 'info',
          actor: { userId },
          resource: { type: 'mfa', name: 'verification' },
          action: 'verify',
          outcome: 'success',
          details: { method: 'totp' },
        });

        return { success: true, method: 'totp' };
      }
    }

    // Try backup code
    const backupResult = this.verifyBackupCode(enrollment, normalizedCode);
    if (backupResult.success) {
      enrollment.lastVerifiedAt = Date.now();
      this.resetRateLimit(userId);

      this.auditLogger.log({
        eventId: crypto.randomUUID(),
        timestamp: Date.now(),
        eventType: 'authentication',
        severity: 'info',
        actor: { userId },
        resource: { type: 'mfa', name: 'verification' },
        action: 'verify',
        outcome: 'success',
        details: { method: 'backup_code', remainingCodes: backupResult.remainingCodes },
      });

      return {
        success: true,
        method: 'backup_code',
        remainingBackupCodes: backupResult.remainingCodes,
      };
    }

    // Record failed attempt
    this.recordAttempt(userId);

    this.auditLogger.log({
      eventId: crypto.randomUUID(),
      timestamp: Date.now(),
      eventType: 'authentication',
      severity: 'warn',
      actor: { userId },
      resource: { type: 'mfa', name: 'verification' },
      action: 'verify',
      outcome: 'failure',
      details: { reason: 'Invalid code' },
      riskIndicators: ['failed_mfa_attempt'],
    });

    return { success: false, error: 'Invalid verification code' };
  }

  /**
   * Disable MFA for a user
   */
  async disable(userId: string, otp: string): Promise<boolean> {
    const enrollment = this.enrollments.get(userId);
    if (!enrollment) {
      return false;
    }

    // Require valid OTP to disable
    const isValid = this.verifyTOTP(enrollment.secret, otp);
    if (!isValid) {
      this.auditLogger.log({
        eventId: crypto.randomUUID(),
        timestamp: Date.now(),
        eventType: 'authentication',
        severity: 'warn',
        actor: { userId },
        resource: { type: 'mfa', name: 'disable' },
        action: 'disable',
        outcome: 'failure',
        details: { reason: 'Invalid OTP' },
      });

      return false;
    }

    this.enrollments.delete(userId);

    this.logger.info({ userId }, 'MFA disabled');

    this.auditLogger.log({
      eventId: crypto.randomUUID(),
      timestamp: Date.now(),
      eventType: 'authentication',
      severity: 'info',
      actor: { userId },
      resource: { type: 'mfa', name: 'disable' },
      action: 'disable',
      outcome: 'success',
    });

    return true;
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(userId: string, otp: string): Promise<string[]> {
    const enrollment = this.enrollments.get(userId);
    if (!enrollment?.confirmed) {
      throw new Error('MFA not enabled');
    }

    // Require valid OTP to regenerate
    const isValid = this.verifyTOTP(enrollment.secret, otp);
    if (!isValid) {
      throw new AuthenticationError('Invalid OTP', 'invalid_credentials');
    }

    // Generate new backup codes
    const backupCodesPlain = this.generateBackupCodes();
    enrollment.backupCodes = backupCodesPlain.map(code => this.hashBackupCode(code));

    this.logger.info({ userId }, 'Backup codes regenerated');

    this.auditLogger.log({
      eventId: crypto.randomUUID(),
      timestamp: Date.now(),
      eventType: 'authentication',
      severity: 'info',
      actor: { userId },
      resource: { type: 'mfa', name: 'backup_codes' },
      action: 'regenerate',
      outcome: 'success',
    });

    return backupCodesPlain;
  }

  /**
   * Check if user has MFA enabled
   */
  isEnabled(userId: string): boolean {
    const enrollment = this.enrollments.get(userId);
    return enrollment?.confirmed ?? false;
  }

  /**
   * Get enrollment status
   */
  getEnrollmentStatus(userId: string): {
    enrolled: boolean;
    confirmed: boolean;
    backupCodesRemaining: number;
    lastVerifiedAt?: number;
  } {
    const enrollment = this.enrollments.get(userId);

    if (!enrollment) {
      return {
        enrolled: false,
        confirmed: false,
        backupCodesRemaining: 0,
      };
    }

    return {
      enrolled: true,
      confirmed: enrollment.confirmed,
      backupCodesRemaining: enrollment.backupCodes.length,
      lastVerifiedAt: enrollment.lastVerifiedAt,
    };
  }

  /**
   * Require MFA verification for identity
   */
  async requireVerification(identity: UserIdentity): Promise<void> {
    if (!identity.mfaVerified) {
      if (this.isEnabled(identity.userId)) {
        throw new MFARequiredError();
      }
    }
  }

  // ============================================================================
  // TOTP Implementation (RFC 6238)
  // ============================================================================

  /**
   * Generate TOTP for current time
   */
  private generateTOTP(secret: string, timeOffset: number = 0): string {
    const now = Math.floor(Date.now() / 1000);
    const counter = Math.floor((now + timeOffset * this.config.timeStep) / this.config.timeStep);

    return this.generateHOTP(secret, counter);
  }

  /**
   * Generate HOTP (HMAC-based OTP) - RFC 4226
   */
  private generateHOTP(secret: string, counter: number): string {
    // Decode secret from base32
    const secretBytes = this.base32Decode(secret);

    // Convert counter to 8-byte big-endian
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));

    // Calculate HMAC-SHA1
    const hmac = createHmac('sha1', secretBytes);
    hmac.update(counterBuffer);
    const hash = hmac.digest();

    // Dynamic truncation
    const offset = hash[hash.length - 1] & 0x0f;
    const binary =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);

    // Generate OTP
    const otp = binary % Math.pow(10, this.config.digits);
    return otp.toString().padStart(this.config.digits, '0');
  }

  /**
   * Verify TOTP with time window tolerance
   */
  private verifyTOTP(secret: string, otp: string): boolean {
    // Check current and adjacent time windows
    for (let offset = -this.config.window; offset <= this.config.window; offset++) {
      const expectedOTP = this.generateTOTP(secret, offset);
      if (this.timingSafeCompare(otp, expectedOTP)) {
        return true;
      }
    }
    return false;
  }

  // ============================================================================
  // Backup Code Management
  // ============================================================================

  /**
   * Generate backup codes
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars (I, O, 0, 1)

    for (let i = 0; i < this.config.backupCodeCount; i++) {
      let code = '';
      const bytes = randomBytes(this.config.backupCodeLength);
      for (let j = 0; j < this.config.backupCodeLength; j++) {
        code += chars[bytes[j] % chars.length];
      }
      codes.push(code);
    }

    return codes;
  }

  /**
   * Hash a backup code for storage
   */
  private hashBackupCode(code: string): string {
    const hash = createHmac('sha256', 'backup-code-salt');
    hash.update(code.toUpperCase());
    return hash.digest('hex');
  }

  /**
   * Verify and consume a backup code
   */
  private verifyBackupCode(enrollment: MFAEnrollment, code: string): {
    success: boolean;
    remainingCodes?: number;
  } {
    const hashedCode = this.hashBackupCode(code);
    const index = enrollment.backupCodes.findIndex(stored =>
      this.timingSafeCompare(stored, hashedCode)
    );

    if (index === -1) {
      return { success: false };
    }

    // Remove used backup code
    enrollment.backupCodes.splice(index, 1);

    return {
      success: true,
      remainingCodes: enrollment.backupCodes.length,
    };
  }

  // ============================================================================
  // Base32 Encoding/Decoding
  // ============================================================================

  /**
   * Encode bytes to Base32
   */
  private base32Encode(buffer: Buffer): string {
    let result = '';
    let bits = 0;
    let value = 0;

    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;

      while (bits >= 5) {
        result += this.BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      result += this.BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    return result;
  }

  /**
   * Decode Base32 to bytes
   */
  private base32Decode(encoded: string): Buffer {
    const cleanedInput = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
    const bytes: number[] = [];
    let bits = 0;
    let value = 0;

    for (const char of cleanedInput) {
      const index = this.BASE32_ALPHABET.indexOf(char);
      if (index === -1) continue;

      value = (value << 5) | index;
      bits += 5;

      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }

    return Buffer.from(bytes);
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Build otpauth:// provisioning URI
   */
  private buildProvisioningUri(accountName: string, secret: string): string {
    const encodedIssuer = encodeURIComponent(this.config.issuer);
    const encodedAccount = encodeURIComponent(accountName);

    return `otpauth://totp/${encodedIssuer}:${encodedAccount}?` +
      `secret=${secret}&` +
      `issuer=${encodedIssuer}&` +
      `algorithm=SHA1&` +
      `digits=${this.config.digits}&` +
      `period=${this.config.timeStep}`;
  }

  /**
   * Format secret for manual entry (groups of 4)
   */
  private formatSecretForDisplay(secret: string): string {
    return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
  }

  /**
   * Timing-safe string comparison
   */
  private timingSafeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      // Still do the comparison to maintain constant time
      const dummy = Buffer.alloc(a.length);
      timingSafeEqual(dummy, Buffer.from(a));
      return false;
    }
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(userId: string): boolean {
    const tracker = this.attemptTracker.get(userId);

    if (!tracker) return true;

    if (Date.now() > tracker.resetAt) {
      this.attemptTracker.delete(userId);
      return true;
    }

    return tracker.count < this.config.maxAttempts;
  }

  /**
   * Record a verification attempt
   */
  private recordAttempt(userId: string): void {
    const tracker = this.attemptTracker.get(userId);

    if (!tracker || Date.now() > tracker.resetAt) {
      this.attemptTracker.set(userId, {
        count: 1,
        resetAt: Date.now() + this.config.attemptWindowMs,
      });
    } else {
      tracker.count++;
    }
  }

  /**
   * Reset rate limit after successful verification
   */
  private resetRateLimit(userId: string): void {
    this.attemptTracker.delete(userId);
  }
}
