import { describe, it, expect, beforeEach, vi } from 'vitest';

// Each test file gets a fresh module instance to avoid cross-test contamination.
// We use dynamic import + vi.resetModules() for isolation.
describe('audit', () => {
  let auditLog: typeof import('../audit.js').auditLog;
  let getAuditLogs: typeof import('../audit.js').getAuditLogs;
  let getAuditLogCount: typeof import('../audit.js').getAuditLogCount;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../audit.js');
    auditLog = mod.auditLog;
    getAuditLogs = mod.getAuditLogs;
    getAuditLogCount = mod.getAuditLogCount;
  });

  it('creates an entry with the correct shape', async () => {
    await auditLog({
      userId: 'user_1',
      action: 'chat.message_sent',
      resourceType: 'conversation',
      resourceId: 'conv_123',
      ipAddress: '127.0.0.1',
    });

    const logs = getAuditLogs();
    expect(logs).toHaveLength(1);
    const entry = logs[0];
    expect(entry).toMatchObject({
      userId: 'user_1',
      action: 'chat.message_sent',
      resourceType: 'conversation',
      resourceId: 'conv_123',
      ipAddress: '127.0.0.1',
    });
    expect(entry.id).toMatch(/^audit_/);
    expect(entry.timestamp).toBeTruthy();
  });

  it('never stores raw message content in details', async () => {
    await auditLog({
      action: 'chat.message_sent',
      resourceType: 'conversation',
      details: { messageLength: 42 },
    });

    const logs = getAuditLogs();
    const entry = logs[0];
    const serialized = JSON.stringify(entry);
    // The details should only contain metadata, never content
    expect(entry.details).toEqual({ messageLength: 42 });
    // Ensure no PHI-like fields leaked
    expect(serialized).not.toContain('"content"');
    expect(serialized).not.toContain('"message"');
  });

  it('is append-only — entries accumulate', async () => {
    await auditLog({ action: 'a', resourceType: 'test' });
    await auditLog({ action: 'b', resourceType: 'test' });
    await auditLog({ action: 'c', resourceType: 'test' });

    expect(getAuditLogCount()).toBe(3);
    const logs = getAuditLogs();
    // Most recent first
    expect(logs.map(l => l.action)).toEqual(['c', 'b', 'a']);
  });

  it('filters by userId', async () => {
    await auditLog({ userId: 'alice', action: 'x', resourceType: 'test' });
    await auditLog({ userId: 'bob', action: 'y', resourceType: 'test' });
    await auditLog({ userId: 'alice', action: 'z', resourceType: 'test' });

    const aliceLogs = getAuditLogs({ userId: 'alice' });
    expect(aliceLogs).toHaveLength(2);
    expect(aliceLogs.every(l => l.userId === 'alice')).toBe(true);
  });

  it('filters by action', async () => {
    await auditLog({ action: 'chat.message_sent', resourceType: 'conversation' });
    await auditLog({ action: 'chat.message_received', resourceType: 'conversation' });

    const sent = getAuditLogs({ action: 'chat.message_sent' });
    expect(sent).toHaveLength(1);
    expect(sent[0].action).toBe('chat.message_sent');
  });

  it('respects the limit option', async () => {
    for (let i = 0; i < 10; i++) {
      await auditLog({ action: `action_${i}`, resourceType: 'test' });
    }

    const limited = getAuditLogs({ limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it('defaults null for optional fields', async () => {
    await auditLog({ action: 'minimal', resourceType: 'test' });

    const entry = getAuditLogs()[0];
    expect(entry.userId).toBeNull();
    expect(entry.resourceId).toBeNull();
    expect(entry.details).toBeNull();
    expect(entry.ipAddress).toBeNull();
    expect(entry.sessionId).toBeNull();
  });

  it('does not throw on audit failure (non-blocking)', async () => {
    // Spy on console.log and force it to throw
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      throw new Error('log transport failure');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Should not throw
    await expect(
      auditLog({ action: 'test', resourceType: 'test' })
    ).resolves.toBeUndefined();

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
