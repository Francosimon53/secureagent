/**
 * HIPAA Append-Only Audit Logging
 *
 * In-memory store with structured JSON console output.
 * Designed to match a future Supabase `audit_logs` table schema.
 * Never stores raw message content — metadata only.
 */

// ── Schema (matches Supabase migration) ──────────────────────────────────────

export interface AuditEntry {
  id: string;
  timestamp: string;         // ISO-8601
  userId: string | null;
  action: string;            // e.g. "chat.message_sent", "chat.message_received"
  resourceType: string;      // e.g. "conversation", "session"
  resourceId: string | null;
  details: Record<string, unknown> | null;  // never raw PHI
  ipAddress: string | null;
  sessionId: string | null;
}

export interface AuditLogInput {
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  sessionId?: string | null;
}

// ── In-memory store ──────────────────────────────────────────────────────────

const MAX_ENTRIES = 10_000;
const entries: AuditEntry[] = [];
let counter = 0;

/**
 * Append an audit log entry.
 * Async/non-blocking — errors are caught and logged, never propagated.
 */
export async function auditLog(input: AuditLogInput): Promise<void> {
  try {
    const entry: AuditEntry = {
      id: `audit_${Date.now()}_${++counter}`,
      timestamp: new Date().toISOString(),
      userId: input.userId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      details: input.details ?? null,
      ipAddress: input.ipAddress ?? null,
      sessionId: input.sessionId ?? null,
    };

    // Append (FIFO eviction when full)
    if (entries.length >= MAX_ENTRIES) {
      entries.shift();
    }
    entries.push(entry);

    // Structured JSON to console for Vercel log drain
    console.log(JSON.stringify({ audit: entry }));
  } catch (err) {
    // Audit failures must never break requests
    console.error('[audit] failed to write audit log:', err);
  }
}

/**
 * Read audit log entries (for dashboard / export).
 * Returns a shallow copy — the store is append-only.
 */
export function getAuditLogs(opts?: {
  userId?: string;
  action?: string;
  limit?: number;
}): AuditEntry[] {
  let result = [...entries];

  if (opts?.userId) {
    result = result.filter(e => e.userId === opts.userId);
  }
  if (opts?.action) {
    result = result.filter(e => e.action === opts.action);
  }

  // Most recent first
  result.reverse();

  if (opts?.limit && opts.limit > 0) {
    result = result.slice(0, opts.limit);
  }

  return result;
}

/**
 * Total number of stored entries (for monitoring).
 */
export function getAuditLogCount(): number {
  return entries.length;
}
