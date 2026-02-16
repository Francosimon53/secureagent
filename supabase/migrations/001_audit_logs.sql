-- HIPAA Audit Log table for SecureAgent
-- Run this migration when Supabase is configured.

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id       TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  details       JSONB,
  ip_address    INET,
  session_id    TEXT
);

-- Index for querying by user
CREATE INDEX idx_audit_logs_user_id ON audit_logs (user_id);

-- Index for querying by action
CREATE INDEX idx_audit_logs_action ON audit_logs (action);

-- Index for time-range queries (HIPAA requires 6-year retention)
CREATE INDEX idx_audit_logs_timestamp ON audit_logs (timestamp);

-- Composite index for common dashboard queries
CREATE INDEX idx_audit_logs_user_action ON audit_logs (user_id, action, timestamp DESC);

-- Row-level security: only service role can insert, admins can read
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT
  WITH CHECK (true);  -- service role bypasses RLS; app inserts via service key

CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT
  USING (true);  -- restrict further once auth roles are defined

-- Prevent updates and deletes (append-only)
CREATE POLICY audit_logs_no_update ON audit_logs
  FOR UPDATE
  USING (false);

CREATE POLICY audit_logs_no_delete ON audit_logs
  FOR DELETE
  USING (false);
