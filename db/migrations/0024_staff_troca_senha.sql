-- Issue #55: ciclo de credenciais de staff (troca de senha, troca obrigatória e auditoria).
-- Migração aditiva: não altera hashes nem sessões existentes.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS senha_alterada_em TIMESTAMPTZ;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS deve_trocar_senha BOOLEAN NOT NULL DEFAULT FALSE;

-- Trilha de auditoria de credenciais. NUNCA guarda senha, hash, token nem IP:
-- apenas quem (id/login), o quê, quantas sessões foram revogadas e quando.
CREATE TABLE IF NOT EXISTS staff_credencial_eventos (
  id                BIGSERIAL PRIMARY KEY,
  staff_id          INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  login             TEXT NOT NULL,
  evento            TEXT NOT NULL
                    CHECK (evento IN ('senha_alterada', 'senha_troca_falhou', 'senha_troca_rejeitada')),
  sessoes_revogadas INTEGER NOT NULL DEFAULT 0,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_credencial_eventos_staff
  ON staff_credencial_eventos (staff_id, criado_em DESC);
