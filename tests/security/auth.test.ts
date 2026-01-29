import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TokenService } from '../../src/security/auth/token-service.js';
import { SessionManager } from '../../src/security/auth/session-manager.js';
import {
  TokenExpiredError,
  InvalidTokenError,
  SessionError,
} from '../../src/security/types.js';

describe('TokenService', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    tokenService = new TokenService({
      secret: 'test-secret-key-that-is-long-enough-for-testing',
      accessTokenExpiry: 3600,
      refreshTokenExpiry: 86400,
      issuer: 'test-issuer',
      audience: 'test-audience',
    });
  });

  describe('generateAccessToken', () => {
    it('should generate a valid access token', async () => {
      const payload = {
        userId: 'user-123',
        roles: ['admin'],
      };

      const token = await tokenService.generateAccessToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format
    });

    it('should include custom claims in token', async () => {
      const payload = {
        userId: 'user-123',
        customClaim: 'custom-value',
      };

      const token = await tokenService.generateAccessToken(payload);
      const decoded = await tokenService.verifyAccessToken(token);

      expect(decoded.userId).toBe('user-123');
      expect(decoded.customClaim).toBe('custom-value');
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid token', async () => {
      const payload = { userId: 'user-123' };
      const token = await tokenService.generateAccessToken(payload);

      const decoded = await tokenService.verifyAccessToken(token);

      expect(decoded.userId).toBe('user-123');
    });

    it('should reject an invalid token', async () => {
      await expect(
        tokenService.verifyAccessToken('invalid-token')
      ).rejects.toThrow(InvalidTokenError);
    });

    it('should reject an expired token', async () => {
      const shortLivedService = new TokenService({
        secret: 'test-secret-key-that-is-long-enough-for-testing',
        accessTokenExpiry: 0, // Immediate expiry
        refreshTokenExpiry: 86400,
        issuer: 'test-issuer',
        audience: 'test-audience',
      });

      const token = await shortLivedService.generateAccessToken({ userId: 'user-123' });

      // Wait a bit for the token to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(
        shortLivedService.verifyAccessToken(token)
      ).rejects.toThrow(TokenExpiredError);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a refresh token', async () => {
      const token = await tokenService.generateRefreshToken('user-123');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
  });

  describe('rotateRefreshToken', () => {
    it('should rotate a refresh token', async () => {
      const originalToken = await tokenService.generateRefreshToken('user-123');
      const newToken = await tokenService.rotateRefreshToken(originalToken);

      expect(newToken).toBeDefined();
      expect(newToken).not.toBe(originalToken);
    });
  });
});

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({
      sessionDuration: 3600000, // 1 hour
      maxSessionsPerUser: 5,
      renewThreshold: 0.5,
    });
  });

  afterEach(async () => {
    await sessionManager.destroy();
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const session = await sessionManager.createSession({
        userId: 'user-123',
        metadata: { userAgent: 'test' },
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.userId).toBe('user-123');
      expect(session.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should enforce max sessions per user', async () => {
      const limitedManager = new SessionManager({
        sessionDuration: 3600000,
        maxSessionsPerUser: 2,
        renewThreshold: 0.5,
      });

      await limitedManager.createSession({ userId: 'user-123' });
      await limitedManager.createSession({ userId: 'user-123' });

      // Third session should evict the oldest
      const session3 = await limitedManager.createSession({ userId: 'user-123' });
      expect(session3).toBeDefined();

      const sessions = await limitedManager.getUserSessions('user-123');
      expect(sessions.length).toBeLessThanOrEqual(2);

      await limitedManager.destroy();
    });
  });

  describe('getSession', () => {
    it('should retrieve an existing session', async () => {
      const created = await sessionManager.createSession({ userId: 'user-123' });
      const retrieved = await sessionManager.getSession(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return null for non-existent session', async () => {
      const session = await sessionManager.getSession('non-existent');
      expect(session).toBeNull();
    });
  });

  describe('invalidateSession', () => {
    it('should invalidate a session', async () => {
      const session = await sessionManager.createSession({ userId: 'user-123' });

      await sessionManager.invalidateSession(session.id);

      const retrieved = await sessionManager.getSession(session.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('invalidateUserSessions', () => {
    it('should invalidate all sessions for a user', async () => {
      await sessionManager.createSession({ userId: 'user-123' });
      await sessionManager.createSession({ userId: 'user-123' });
      await sessionManager.createSession({ userId: 'user-456' });

      await sessionManager.invalidateUserSessions('user-123');

      const user123Sessions = await sessionManager.getUserSessions('user-123');
      const user456Sessions = await sessionManager.getUserSessions('user-456');

      expect(user123Sessions.length).toBe(0);
      expect(user456Sessions.length).toBe(1);
    });
  });

  describe('renewSession', () => {
    it('should renew a session', async () => {
      const session = await sessionManager.createSession({ userId: 'user-123' });
      const originalExpiry = session.expiresAt;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      const renewed = await sessionManager.renewSession(session.id);

      expect(renewed).toBeDefined();
      expect(renewed?.expiresAt).toBeGreaterThanOrEqual(originalExpiry);
    });
  });
});
