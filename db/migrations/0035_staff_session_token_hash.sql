-- 0035_staff_session_token_hash.sql
-- Additive transition: persist a SHA-256 digest beside the existing bearer.
-- The raw token remains temporarily for rollback compatibility; a later,
-- separately reviewed phase can remove it after the 12-hour session TTL.
ALTER TABLE staff_sessoes
  ADD COLUMN IF NOT EXISTS token_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_sessoes_token_hash
  ON staff_sessoes (token_hash)
  WHERE token_hash IS NOT NULL;
