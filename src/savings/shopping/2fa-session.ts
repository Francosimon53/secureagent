/**
 * Secure 2FA Session Management
 *
 * Handles two-factor authentication sessions with security best practices.
 * Codes are NEVER stored - they are passed through immediately.
 */

import { randomUUID } from 'crypto';

/**
 * 2FA method type
 */
export type TwoFactorMethod = 'sms' | 'email' | 'app' | 'voice' | 'hardware';

/**
 * 2FA session status
 */
export type TwoFactorStatus =
  | 'pending'
  | 'waiting-for-code'
  | 'code-received'
  | 'verifying'
  | 'verified'
  | 'failed'
  | 'expired';

/**
 * 2FA session interface
 */
export interface TwoFactorSession {
  id: string;
  shoppingSessionId: string;
  userId: string;
  method: TwoFactorMethod;
  status: TwoFactorStatus;
  phoneLastFour?: string;
  emailMasked?: string;
  createdAt: number;
  expiresAt: number;
  verifiedAt?: number;
  attempts: number;
  maxAttempts: number;
}

/**
 * 2FA consent record
 */
export interface TwoFactorConsent {
  userId: string;
  consentedAt: number;
  consentedMethods: TwoFactorMethod[];
  revokedAt?: number;
}

/**
 * 2FA session manager options
 */
export interface TwoFactorManagerOptions {
  sessionTimeoutSeconds: number;
  maxAttempts: number;
  requireExplicitConsent: boolean;
  allowedMethods: TwoFactorMethod[];
}

/**
 * Code verification callback
 * The code is passed to this callback and NOT stored
 */
export type CodeVerificationCallback = (
  sessionId: string,
  code: string
) => Promise<{ success: boolean; error?: string }>;

/**
 * Secure 2FA session manager
 *
 * SECURITY NOTES:
 * - Codes are NEVER stored in memory or persisted
 * - Sessions expire after configurable timeout (default 5 minutes)
 * - Rate limiting on verification attempts
 * - Requires explicit user consent before enabling
 * - All operations are logged for audit
 */
export class TwoFactorSessionManager {
  private readonly options: TwoFactorManagerOptions;
  private sessions: Map<string, TwoFactorSession> = new Map();
  private consents: Map<string, TwoFactorConsent> = new Map();
  private verificationCallback?: CodeVerificationCallback;
  private auditLog: AuditEntry[] = [];

  constructor(options?: Partial<TwoFactorManagerOptions>) {
    this.options = {
      sessionTimeoutSeconds: options?.sessionTimeoutSeconds ?? 300, // 5 minutes
      maxAttempts: options?.maxAttempts ?? 3,
      requireExplicitConsent: options?.requireExplicitConsent ?? true,
      allowedMethods: options?.allowedMethods ?? ['sms', 'email'],
    };

    // Start cleanup interval
    setInterval(() => this.cleanupExpiredSessions(), 60000);
  }

  /**
   * Set the verification callback
   */
  setVerificationCallback(callback: CodeVerificationCallback): void {
    this.verificationCallback = callback;
  }

  // ==========================================================================
  // Consent Management
  // ==========================================================================

  /**
   * Record user consent for 2FA
   */
  grantConsent(userId: string, methods: TwoFactorMethod[]): TwoFactorConsent {
    const consent: TwoFactorConsent = {
      userId,
      consentedAt: Date.now(),
      consentedMethods: methods.filter(m => this.options.allowedMethods.includes(m)),
    };

    this.consents.set(userId, consent);
    this.logAudit(userId, 'consent-granted', { methods: consent.consentedMethods });

    return consent;
  }

  /**
   * Revoke user consent
   */
  revokeConsent(userId: string): void {
    const consent = this.consents.get(userId);
    if (consent) {
      consent.revokedAt = Date.now();
      this.consents.set(userId, consent);
      this.logAudit(userId, 'consent-revoked', {});

      // Expire all active sessions for this user
      for (const [sessionId, session] of this.sessions) {
        if (session.userId === userId) {
          session.status = 'expired';
          this.sessions.set(sessionId, session);
        }
      }
    }
  }

  /**
   * Check if user has consented
   */
  hasConsent(userId: string, method?: TwoFactorMethod): boolean {
    const consent = this.consents.get(userId);
    if (!consent || consent.revokedAt) {
      return false;
    }

    if (method) {
      return consent.consentedMethods.includes(method);
    }

    return consent.consentedMethods.length > 0;
  }

  /**
   * Get user consent record
   */
  getConsent(userId: string): TwoFactorConsent | null {
    const consent = this.consents.get(userId);
    if (!consent || consent.revokedAt) {
      return null;
    }
    return consent;
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  /**
   * Create a new 2FA session
   */
  createSession(
    shoppingSessionId: string,
    userId: string,
    method: TwoFactorMethod,
    contact?: { phoneLastFour?: string; emailMasked?: string }
  ): TwoFactorSession | { error: string } {
    // Check consent
    if (this.options.requireExplicitConsent && !this.hasConsent(userId, method)) {
      return { error: 'User has not consented to 2FA via this method' };
    }

    // Check rate limiting
    const recentSessions = this.getRecentSessionsForUser(userId);
    if (recentSessions.length >= 5) {
      this.logAudit(userId, 'rate-limited', { recentSessionCount: recentSessions.length });
      return { error: 'Too many 2FA sessions. Please wait before trying again.' };
    }

    const session: TwoFactorSession = {
      id: randomUUID(),
      shoppingSessionId,
      userId,
      method,
      status: 'pending',
      phoneLastFour: contact?.phoneLastFour,
      emailMasked: contact?.emailMasked,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.options.sessionTimeoutSeconds * 1000,
      attempts: 0,
      maxAttempts: this.options.maxAttempts,
    };

    this.sessions.set(session.id, session);
    this.logAudit(userId, 'session-created', {
      sessionId: session.id,
      method,
      shoppingSessionId,
    });

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): TwoFactorSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Check if expired
    if (Date.now() > session.expiresAt) {
      session.status = 'expired';
      this.sessions.set(sessionId, session);
      return session;
    }

    return session;
  }

  /**
   * Update session status to waiting for code
   */
  markWaitingForCode(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || this.isSessionExpired(session)) {
      return false;
    }

    session.status = 'waiting-for-code';
    this.sessions.set(sessionId, session);
    this.logAudit(session.userId, 'waiting-for-code', { sessionId });

    return true;
  }

  /**
   * Submit a verification code
   *
   * IMPORTANT: The code is NOT stored. It is immediately passed to
   * the verification callback and then discarded.
   */
  async submitCode(
    sessionId: string,
    code: string
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    if (this.isSessionExpired(session)) {
      session.status = 'expired';
      this.sessions.set(sessionId, session);
      return { success: false, error: 'Session has expired' };
    }

    if (session.attempts >= session.maxAttempts) {
      session.status = 'failed';
      this.sessions.set(sessionId, session);
      this.logAudit(session.userId, 'max-attempts-exceeded', { sessionId });
      return { success: false, error: 'Maximum verification attempts exceeded' };
    }

    session.attempts++;
    session.status = 'verifying';
    this.sessions.set(sessionId, session);

    // Pass code to verification callback
    if (!this.verificationCallback) {
      return { success: false, error: 'Verification callback not configured' };
    }

    try {
      const result = await this.verificationCallback(sessionId, code);

      if (result.success) {
        session.status = 'verified';
        session.verifiedAt = Date.now();
        this.logAudit(session.userId, 'verification-success', { sessionId });
      } else {
        session.status = session.attempts >= session.maxAttempts ? 'failed' : 'waiting-for-code';
        this.logAudit(session.userId, 'verification-failed', {
          sessionId,
          attempts: session.attempts,
          error: result.error,
        });
      }

      this.sessions.set(sessionId, session);
      return result;
    } catch (error) {
      session.status = 'waiting-for-code';
      this.sessions.set(sessionId, session);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  /**
   * Cancel a session
   */
  cancelSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.status = 'expired';
    this.sessions.set(sessionId, session);
    this.logAudit(session.userId, 'session-cancelled', { sessionId });

    return true;
  }

  /**
   * Get sessions for a shopping session
   */
  getSessionsForShoppingSession(shoppingSessionId: string): TwoFactorSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.shoppingSessionId === shoppingSessionId);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Check if a session is expired
   */
  private isSessionExpired(session: TwoFactorSession): boolean {
    return Date.now() > session.expiresAt;
  }

  /**
   * Get recent sessions for a user (for rate limiting)
   */
  private getRecentSessionsForUser(userId: string): TwoFactorSession[] {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId && s.createdAt > oneHourAgo);
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (now > session.expiresAt + 60000) { // 1 minute grace period
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Log an audit entry
   */
  private logAudit(
    userId: string,
    action: string,
    details: Record<string, unknown>
  ): void {
    const entry: AuditEntry = {
      timestamp: Date.now(),
      userId,
      action,
      details,
    };

    this.auditLog.push(entry);

    // Keep only last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
  }

  /**
   * Get audit log for a user
   */
  getAuditLog(userId: string, limit: number = 100): AuditEntry[] {
    return this.auditLog
      .filter(e => e.userId === userId)
      .slice(-limit);
  }

  /**
   * Get session statistics
   */
  getStats(): {
    activeSessions: number;
    verifiedSessions: number;
    failedSessions: number;
    expiredSessions: number;
  } {
    const sessions = Array.from(this.sessions.values());
    return {
      activeSessions: sessions.filter(s => s.status === 'waiting-for-code' || s.status === 'pending').length,
      verifiedSessions: sessions.filter(s => s.status === 'verified').length,
      failedSessions: sessions.filter(s => s.status === 'failed').length,
      expiredSessions: sessions.filter(s => s.status === 'expired').length,
    };
  }
}

/**
 * Audit log entry
 */
interface AuditEntry {
  timestamp: number;
  userId: string;
  action: string;
  details: Record<string, unknown>;
}

/**
 * Mask a phone number (show last 4 digits)
 */
export function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) {
    return '****';
  }
  return `***-***-${digits.slice(-4)}`;
}

/**
 * Mask an email address
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) {
    return '***@***';
  }

  const maskedLocal = local.length <= 2
    ? '*'.repeat(local.length)
    : `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}`;

  const domainParts = domain.split('.');
  const maskedDomain = domainParts.length > 1
    ? `***${domainParts.slice(-1)[0]}`
    : '***';

  return `${maskedLocal}@${maskedDomain}`;
}

/**
 * Get last 4 digits of phone number
 */
export function getPhoneLastFour(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-4);
}
