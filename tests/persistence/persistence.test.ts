import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MemoryDatabaseAdapter,
  MemorySessionStore,
  MemoryTokenStore,
  MemoryAuditStore,
  createSessionStore,
  createTokenStore,
  createAuditStore,
} from '../../src/persistence/index.js';

describe('MemoryDatabaseAdapter', () => {
  let adapter: MemoryDatabaseAdapter;

  beforeEach(async () => {
    adapter = new MemoryDatabaseAdapter();
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('should store and retrieve data', async () => {
    await adapter.query('INSERT INTO test (id, value) VALUES ($1, $2)', ['1', 'test-value']);
    const result = await adapter.query('SELECT * FROM test WHERE id = $1', ['1']);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].value).toBe('test-value');
  });

  it('should support multiple tables', async () => {
    await adapter.query('INSERT INTO table_a (id) VALUES ($1)', ['a1']);
    await adapter.query('INSERT INTO table_b (id) VALUES ($1)', ['b1']);

    const resultA = await adapter.query('SELECT * FROM table_a');
    const resultB = await adapter.query('SELECT * FROM table_b');

    expect(resultA.rows).toHaveLength(1);
    expect(resultB.rows).toHaveLength(1);
  });

  it('should report connection status', () => {
    expect(adapter.isConnected()).toBe(true);
  });
});

describe('MemorySessionStore', () => {
  let store: MemorySessionStore;

  beforeEach(async () => {
    store = new MemorySessionStore();
    await store.initialize();
  });

  it('should create and retrieve sessions', async () => {
    const session = {
      sessionId: 'session-1',
      userId: 'user-1',
      deviceId: 'device-1',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      riskScore: 0,
      mfaVerified: false,
    };

    await store.create(session);

    const retrieved = await store.get('session-1');

    expect(retrieved).toBeDefined();
    expect(retrieved?.userId).toBe('user-1');
  });

  it('should update sessions', async () => {
    const session = {
      sessionId: 'session-1',
      userId: 'user-1',
      deviceId: 'device-1',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      riskScore: 0,
      mfaVerified: false,
    };

    await store.create(session);

    const newTime = Date.now();
    await store.update('session-1', { lastActivityAt: newTime });

    const retrieved = await store.get('session-1');
    expect(retrieved?.lastActivityAt).toBe(newTime);
  });

  it('should delete sessions', async () => {
    const session = {
      sessionId: 'session-1',
      userId: 'user-1',
      deviceId: 'device-1',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      riskScore: 0,
      mfaVerified: false,
    };

    await store.create(session);
    await store.delete('session-1');

    const retrieved = await store.get('session-1');
    expect(retrieved).toBeNull();
  });

  it('should find sessions by user', async () => {
    await store.create({
      sessionId: 'session-1',
      userId: 'user-1',
      deviceId: 'device-1',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      riskScore: 0,
      mfaVerified: false,
    });
    await store.create({
      sessionId: 'session-2',
      userId: 'user-1',
      deviceId: 'device-2',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      riskScore: 0,
      mfaVerified: false,
    });
    await store.create({
      sessionId: 'session-3',
      userId: 'user-2',
      deviceId: 'device-3',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      riskScore: 0,
      mfaVerified: false,
    });

    const sessions = await store.getByUser('user-1');

    expect(sessions).toHaveLength(2);
  });

  it('should delete expired sessions', async () => {
    await store.create({
      sessionId: 'session-1',
      userId: 'user-1',
      deviceId: 'device-1',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      createdAt: Date.now() - 10000,
      lastActivityAt: Date.now() - 10000,
      expiresAt: Date.now() - 1000, // Already expired
      riskScore: 0,
      mfaVerified: false,
    });

    await store.create({
      sessionId: 'session-2',
      userId: 'user-2',
      deviceId: 'device-2',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 3600000, // Not expired
      riskScore: 0,
      mfaVerified: false,
    });

    const deleted = await store.deleteExpired();
    expect(deleted).toBe(1);

    const remaining = await store.getByUser('user-2');
    expect(remaining).toHaveLength(1);
  });
});

describe('MemoryTokenStore', () => {
  let store: MemoryTokenStore;

  beforeEach(async () => {
    store = new MemoryTokenStore();
    await store.initialize();
  });

  it('should store and retrieve access tokens', async () => {
    await store.saveAccessToken({
      token: 'access-token-1',
      tokenType: 'Bearer',
      userId: 'user-1',
      clientId: 'client-1',
      scope: ['read', 'write'],
      expiresAt: Date.now() + 3600000,
      issuedAt: Date.now(),
    });

    const token = await store.getAccessToken('access-token-1');

    expect(token).toBeDefined();
    expect(token?.userId).toBe('user-1');
    expect(token?.scope).toEqual(['read', 'write']);
  });

  it('should store and retrieve refresh tokens', async () => {
    await store.saveRefreshToken({
      token: 'refresh-token-1',
      userId: 'user-1',
      clientId: 'client-1',
      scope: ['read'],
      expiresAt: Date.now() + 86400000,
      family: 'family-1',
      rotationCounter: 0,
    });

    const token = await store.getRefreshToken('refresh-token-1');

    expect(token).toBeDefined();
    expect(token?.userId).toBe('user-1');
    expect(token?.family).toBe('family-1');
  });

  it('should delete access tokens', async () => {
    await store.saveAccessToken({
      token: 'access-token-1',
      tokenType: 'Bearer',
      userId: 'user-1',
      clientId: 'client-1',
      scope: [],
      expiresAt: Date.now() + 3600000,
      issuedAt: Date.now(),
    });

    await store.deleteAccessToken('access-token-1');

    const token = await store.getAccessToken('access-token-1');
    expect(token).toBeNull();
  });

  it('should delete all tokens for a user', async () => {
    await store.saveAccessToken({
      token: 'access-1',
      tokenType: 'Bearer',
      userId: 'user-1',
      clientId: 'client-1',
      scope: [],
      expiresAt: Date.now() + 3600000,
      issuedAt: Date.now(),
    });

    await store.saveRefreshToken({
      token: 'refresh-1',
      userId: 'user-1',
      clientId: 'client-1',
      scope: [],
      expiresAt: Date.now() + 86400000,
      family: 'family-1',
      rotationCounter: 0,
    });

    await store.deleteAccessTokensByUser('user-1');
    await store.deleteRefreshTokensByUser('user-1');

    const access = await store.getAccessToken('access-1');
    const refresh = await store.getRefreshToken('refresh-1');

    expect(access).toBeNull();
    expect(refresh).toBeNull();
  });
});

describe('MemoryAuditStore', () => {
  let store: MemoryAuditStore;

  beforeEach(async () => {
    store = new MemoryAuditStore();
    await store.initialize();
  });

  it('should store and retrieve audit events', async () => {
    await store.store({
      eventId: 'event-1',
      timestamp: Date.now(),
      eventType: 'authentication',
      severity: 'info',
      actor: { userId: 'user-1' },
      resource: { type: 'session', id: 'session-1' },
      action: 'login',
      outcome: 'success',
    });

    const event = await store.get('event-1');

    expect(event).toBeDefined();
    expect(event?.action).toBe('login');
  });

  it('should query events with filters', async () => {
    await store.store({
      eventId: 'event-1',
      timestamp: Date.now(),
      eventType: 'authentication',
      severity: 'info',
      actor: { userId: 'user-1' },
      resource: { type: 'session', id: 'session-1' },
      action: 'login',
      outcome: 'success',
    });

    await store.store({
      eventId: 'event-2',
      timestamp: Date.now(),
      eventType: 'authorization',
      severity: 'warn',
      actor: { userId: 'user-2' },
      resource: { type: 'resource', id: 'res-1' },
      action: 'access_denied',
      outcome: 'failure',
    });

    const authEvents = await store.query({
      eventType: 'authentication',
    });

    expect(authEvents.events).toHaveLength(1);
    expect(authEvents.events[0].eventId).toBe('event-1');
  });

  it('should query events by time range', async () => {
    const now = Date.now();

    await store.store({
      eventId: 'old-event',
      timestamp: now - 86400000, // 1 day ago
      eventType: 'authentication',
      severity: 'info',
      actor: { userId: 'user-1' },
      resource: { type: 'session', id: 'session-1' },
      action: 'login',
      outcome: 'success',
    });

    await store.store({
      eventId: 'new-event',
      timestamp: now,
      eventType: 'authentication',
      severity: 'info',
      actor: { userId: 'user-1' },
      resource: { type: 'session', id: 'session-2' },
      action: 'login',
      outcome: 'success',
    });

    const recentEvents = await store.query({
      startTime: now - 3600000, // Last hour
    });

    expect(recentEvents.events).toHaveLength(1);
    expect(recentEvents.events[0].eventId).toBe('new-event');
  });

  it('should get statistics', async () => {
    await store.store({
      eventId: 'event-1',
      timestamp: Date.now(),
      eventType: 'authentication',
      severity: 'info',
      actor: { userId: 'user-1' },
      resource: { type: 'session', id: 'session-1' },
      action: 'login',
      outcome: 'success',
    });

    await store.store({
      eventId: 'event-2',
      timestamp: Date.now(),
      eventType: 'authentication',
      severity: 'warn',
      actor: { userId: 'user-2' },
      resource: { type: 'session', id: 'session-2' },
      action: 'login',
      outcome: 'failure',
    });

    const stats = await store.getStats();

    expect(stats.totalEvents).toBe(2);
    expect(stats.eventsByType.authentication).toBe(2);
    expect(stats.eventsByOutcome.success).toBe(1);
    expect(stats.eventsByOutcome.failure).toBe(1);
  });
});

describe('Store Factories', () => {
  it('should create session store', () => {
    const store = createSessionStore('memory');
    expect(store).toBeDefined();
  });

  it('should create token store', () => {
    const store = createTokenStore('memory');
    expect(store).toBeDefined();
  });

  it('should create audit store', () => {
    const store = createAuditStore('memory');
    expect(store).toBeDefined();
  });
});
