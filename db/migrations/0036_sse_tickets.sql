-- 0036_sse_tickets.sql
-- One-time, short-lived SSE grants. Only the SHA-256 digest of the ticket and
-- the credential fingerprint are stored; permanent bearer credentials are not.
CREATE TABLE IF NOT EXISTS sse_tickets (
  ticket_hash TEXT PRIMARY KEY,
  access_type TEXT NOT NULL CHECK (access_type IN ('staff', 'mesa', 'garcom')),
  resource_id BIGINT NOT NULL,
  credential_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sse_tickets_expiry
  ON sse_tickets (expires_at);
