-- 0034_staff_google_oauth.sql
-- Permite vincular uma conta Google verificada a uma conta de staff existente.
-- E-mail permanece NULL até ser cadastrado pelo administrador.
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS google_sub TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_email_lower_unique
  ON staff (lower(email))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_google_sub_unique
  ON staff (google_sub)
  WHERE google_sub IS NOT NULL;

COMMENT ON COLUMN staff.email IS
  'E-mail verificado autorizado para login Google; preenchido explicitamente pelo administrador';
COMMENT ON COLUMN staff.google_sub IS
  'Identificador imutável da conta Google vinculada ao funcionário';
